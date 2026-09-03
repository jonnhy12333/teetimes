import { neon } from '@neondatabase/serverless'
import type { CourseConfig } from '../courses.js'

export type AvailabilityTrendState = 'building' | 'open' | 'typical' | 'busy'

export interface AvailabilityTrend {
  courseId: string
  state: AvailabilityTrendState
  label: string
  explanation: string
  sampleSize: number
  currentTeeTimeCount?: number
  typicalTeeTimeCount?: number
}

interface SnapshotRow {
  course_id: string
  play_date: string | Date
  observed_at: string | Date
  status: string
  lead_days: number
  tee_time_count: number | null
}

const minimumComparableSamples = 6

function trendDatabaseUrl() {
  return process.env.TRENDS_DATABASE_URL || process.env.DATABASE_URL
}

function dateValue(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function weekday(value: string) {
  return new Date(`${value}T12:00:00Z`).getUTCDay()
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function buildingTrend(courseId: string, sampleSize = 0): AvailabilityTrend {
  return {
    courseId,
    state: 'building',
    label: 'Building history',
    explanation: sampleSize
      ? `${sampleSize} of ${minimumComparableSamples} comparable observations collected.`
      : 'Not enough comparable observations have been collected yet.',
    sampleSize,
  }
}

export async function getAvailabilityTrends(courses: CourseConfig[], playDate: string): Promise<Record<string, AvailabilityTrend>> {
  const databaseUrl = trendDatabaseUrl()
  const defaults = Object.fromEntries(courses.map((course) => [course.id, buildingTrend(course.id)]))
  if (!databaseUrl) return defaults

  const sql = neon(databaseUrl)
  const today = new Date()
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const targetLeadDays = Math.round((Date.parse(`${playDate}T00:00:00Z`) - todayUtc) / 86_400_000)
  const rows = await sql`
    select course_id, play_date, observed_at, status, lead_days, tee_time_count
    from tee_time_snapshots
    where observed_at >= now() - interval '180 days'
      and play_date <= ${playDate}
      and status in ('success', 'empty')
      and (
        play_date = ${playDate}
        or (
          extract(dow from play_date) = extract(dow from ${playDate}::date)
          and lead_days between ${targetLeadDays - 1} and ${targetLeadDays + 1}
        )
      )
    order by observed_at desc
  ` as SnapshotRow[]

  for (const course of courses) {
    const courseRows = rows.filter((row) => row.course_id === course.id)
    const current = courseRows.find((row) => dateValue(row.play_date) === playDate)
    if (!current || current.tee_time_count === null) continue

    const closestByPlayDate = new Map<string, SnapshotRow>()
    for (const row of courseRows) {
      const rowDate = dateValue(row.play_date)
      if (rowDate === playDate || weekday(rowDate) !== weekday(playDate) || Math.abs(row.lead_days - current.lead_days) > 1 || row.tee_time_count === null) continue
      const existing = closestByPlayDate.get(rowDate)
      if (!existing || Math.abs(row.lead_days - current.lead_days) < Math.abs(existing.lead_days - current.lead_days)) closestByPlayDate.set(rowDate, row)
    }
    const comparableCounts = [...closestByPlayDate.values()].map((row) => row.tee_time_count as number)
    if (comparableCounts.length < minimumComparableSamples) {
      defaults[course.id] = buildingTrend(course.id, comparableCounts.length)
      continue
    }

    const typicalCount = median(comparableCounts)
    const difference = current.tee_time_count - typicalCount
    const threshold = Math.max(3, typicalCount * 0.25)
    const state: AvailabilityTrendState = difference >= threshold ? 'open' : difference <= -threshold ? 'busy' : 'typical'
    const label = state === 'open' ? 'More open than usual' : state === 'busy' ? 'Filling faster than usual' : 'Typical availability'
    defaults[course.id] = {
      courseId: course.id,
      state,
      label,
      explanation: `Compared with ${comparableCounts.length} similar ${new Date(`${playDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })} observations around ${current.lead_days} days before play.`,
      sampleSize: comparableCounts.length,
      currentTeeTimeCount: current.tee_time_count,
      typicalTeeTimeCount: Math.round(typicalCount),
    }
  }

  return defaults
}
