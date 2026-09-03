import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import type { CourseConfig, TeeTime } from '../courses.js'
import { teeTimeSnapshots } from './schema.js'

export type SnapshotSource = 'lookup' | 'cron'
export type SnapshotStatus = 'success' | 'empty' | 'error'

const observationBucketHours = 6

function getDatabase() {
  const databaseUrl = process.env.SNAPSHOT_DATABASE_URL
    || (process.env.NODE_ENV === 'production' ? process.env.DATABASE_URL : undefined)
  if (!databaseUrl) return undefined
  return drizzle(neon(databaseUrl))
}

function dateToUtcMilliseconds(date: string) {
  return Date.parse(`${date}T00:00:00Z`)
}

function getLeadDays(playDate: string, observedAt: Date) {
  const observedDate = Date.UTC(observedAt.getUTCFullYear(), observedAt.getUTCMonth(), observedAt.getUTCDate())
  return Math.round((dateToUtcMilliseconds(playDate) - observedDate) / 86_400_000)
}

function parseTimeToMinute(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return undefined
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === 'PM') hour += 12
  return hour * 60 + Number(match[2])
}

function getObservationBucket(observedAt: Date) {
  const bucket = new Date(observedAt)
  bucket.setUTCMinutes(0, 0, 0)
  bucket.setUTCHours(Math.floor(bucket.getUTCHours() / observationBucketHours) * observationBucketHours)
  return bucket
}

function summarizeTeeTimes(teeTimes: TeeTime[]) {
  const minutes = teeTimes.map((teeTime) => parseTimeToMinute(teeTime.time)).filter((minute): minute is number => minute !== undefined)
  const knownSpots = teeTimes.map((teeTime) => teeTime.availableSpots).filter((spots): spots is number => typeof spots === 'number')
  const prices = teeTimes.flatMap((teeTime) => [teeTime.price, ...(teeTime.options || []).map((option) => option.price)])
    .filter((price): price is number => typeof price === 'number')

  return {
    teeTimeCount: teeTimes.length,
    totalAvailableSpots: knownSpots.length ? knownSpots.reduce((sum, spots) => sum + spots, 0) : null,
    spotsKnownCount: knownSpots.length,
    morningCount: minutes.filter((minute) => minute < 11 * 60).length,
    middayCount: minutes.filter((minute) => minute >= 11 * 60 && minute < 14 * 60).length,
    afternoonCount: minutes.filter((minute) => minute >= 14 * 60).length,
    earliestMinute: minutes.length ? Math.min(...minutes) : null,
    latestMinute: minutes.length ? Math.max(...minutes) : null,
    minimumPrice: prices.length ? Math.min(...prices) : null,
    maximumPrice: prices.length ? Math.max(...prices) : null,
  }
}

export function isSnapshotStorageConfigured() {
  return Boolean(process.env.SNAPSHOT_DATABASE_URL || (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL))
}

export async function recordTeeTimeSnapshot(
  course: CourseConfig,
  playDate: string,
  teeTimes: TeeTime[],
  source: SnapshotSource,
  status: SnapshotStatus = teeTimes.length ? 'success' : 'empty',
  error?: unknown,
) {
  const database = getDatabase()
  if (!database) return false

  const observedAt = new Date()
  const values = {
    courseId: course.id,
    courseName: course.name,
    provider: course.bookingSystem,
    playDate,
    observedAt,
    observationBucket: getObservationBucket(observedAt),
    source,
    status,
    leadDays: getLeadDays(playDate, observedAt),
    ...(status === 'error' ? {} : summarizeTeeTimes(teeTimes)),
    errorMessage: error instanceof Error ? error.message.slice(0, 500) : error ? String(error).slice(0, 500) : null,
  }

  await database.insert(teeTimeSnapshots).values(values).onConflictDoUpdate({
    target: [teeTimeSnapshots.courseId, teeTimeSnapshots.playDate, teeTimeSnapshots.observationBucket],
    set: {
      observedAt: values.observedAt,
      source: values.source,
      status: values.status,
      leadDays: values.leadDays,
      teeTimeCount: values.teeTimeCount ?? null,
      totalAvailableSpots: values.totalAvailableSpots ?? null,
      spotsKnownCount: values.spotsKnownCount ?? null,
      morningCount: values.morningCount ?? null,
      middayCount: values.middayCount ?? null,
      afternoonCount: values.afternoonCount ?? null,
      earliestMinute: values.earliestMinute ?? null,
      latestMinute: values.latestMinute ?? null,
      minimumPrice: values.minimumPrice ?? null,
      maximumPrice: values.maximumPrice ?? null,
      errorMessage: values.errorMessage,
    },
  })

  return true
}
