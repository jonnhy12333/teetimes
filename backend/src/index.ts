import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { courses, getCourseById, getTeeTimesForCourse } from './courses.js'
import { isSnapshotStorageConfigured, recordTeeTimeSnapshot, type SnapshotSource, type SnapshotStatus } from './db/snapshots.js'
import { getAvailabilityTrends } from './db/trends.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const weatherCache = new Map<string, { expiresAt: number; hourly: unknown[] }>()
const weatherCacheDurationMs = 30 * 60 * 1000
const developmentTeeTimeCacheEnabled = process.env.DEV_TEE_TIME_CACHE === 'true' || (process.env.DEV_TEE_TIME_CACHE !== 'false' && process.env.npm_lifecycle_event === 'dev')
const developmentTeeTimeCacheDurationMs = Number(process.env.DEV_TEE_TIME_CACHE_TTL_MS) || 60 * 60 * 1000
const developmentTeeTimeCacheDirectory = resolve(process.cwd(), '.dev-cache', 'tee-times')
const developmentTeeTimeCachePath = (courseId: string, date: string) => resolve(developmentTeeTimeCacheDirectory, `${courseId}-${date}`.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json')
const wait = (milliseconds: number) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
const cronLeadDays = [1, 3, 7, 14]

async function recordSnapshotSafely(
  course: NonNullable<ReturnType<typeof getCourseById>>,
  date: string,
  teeTimes: Awaited<ReturnType<typeof getTeeTimesForCourse>>,
  source: SnapshotSource,
  status?: SnapshotStatus,
  error?: unknown,
) {
  try {
    await recordTeeTimeSnapshot(course, date, teeTimes, source, status, error)
  } catch (snapshotError) {
    console.warn(`Could not record tee-time snapshot for ${course.id} on ${date}`, snapshotError)
  }
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function currentDateInTimeZone(timeZone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function fetchWeather(url: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
      const responseText = await response.text()
      lastError = new Error(`Open-Meteo request failed with ${response.status}: ${responseText.slice(0, 300)}`)
      if (response.status !== 429 && response.status < 500) break
    } catch (error) {
      lastError = error
    }
    if (attempt === 0) await wait(350)
  }
  throw lastError instanceof Error ? lastError : new Error('Open-Meteo request failed')
}

async function readDevelopmentTeeTimeCache(courseId: string, date: string) {
  if (!developmentTeeTimeCacheEnabled) return undefined
  try {
    const cachePath = developmentTeeTimeCachePath(courseId, date)
    const cached = JSON.parse(await readFile(cachePath, 'utf8')) as { createdAt?: number; data?: unknown[] }
    if (typeof cached.createdAt !== 'number' || !Array.isArray(cached.data) || Date.now() - cached.createdAt > developmentTeeTimeCacheDurationMs) return undefined
    return cached.data
  } catch {
    return undefined
  }
}

async function writeDevelopmentTeeTimeCache(courseId: string, date: string, data: unknown[]) {
  if (!developmentTeeTimeCacheEnabled) return
  try {
    await mkdir(developmentTeeTimeCacheDirectory, { recursive: true })
    await writeFile(developmentTeeTimeCachePath(courseId, date), JSON.stringify({ createdAt: Date.now(), data }), 'utf8')
  } catch (error) {
    console.warn('Could not write development tee-time cache', error)
  }
}

app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: frontendUrl,
}))
app.use(express.json())

// Get configured nearby courses
app.get('/api/courses', async (req, res) => {
  try {
    // TODO: Filter by user location once geolocation is stored or passed in.
    res.json(courses)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch courses' })
  }
})

// Get tee times for a configured course
app.get('/api/courses/:id/tee-times', async (req, res) => {
  const { id } = req.params
  const requestedDate = String(req.query.date || new Date().toISOString().slice(0, 10))
  const course = getCourseById(id)
  try {
    if (!course) {
      res.status(404).json({ error: 'Course not found' })
      return
    }

    if (course.status === 'unsupported') {
      res.json([])
      return
    }

    const bypassCache = req.query.refresh === '1'
    const cachedTeeTimes = bypassCache ? undefined : await readDevelopmentTeeTimeCache(course.id, requestedDate)
    if (cachedTeeTimes) {
      res.set('X-Dev-Tee-Time-Cache', 'HIT')
      res.json(cachedTeeTimes)
      return
    }

    const teeTimes = await getTeeTimesForCourse(course, requestedDate)
    await writeDevelopmentTeeTimeCache(course.id, requestedDate, teeTimes)
    await recordSnapshotSafely(course, requestedDate, teeTimes, 'lookup')
    if (developmentTeeTimeCacheEnabled) res.set('X-Dev-Tee-Time-Cache', bypassCache ? 'BYPASS' : 'MISS')
    res.json(teeTimes)
  } catch (error) {
    if (course) await recordSnapshotSafely(course, requestedDate, [], 'lookup', 'error', error)
    res.status(500).json({ error: 'Failed to fetch tee times' })
  }
})

app.get('/api/availability-trends', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  try {
    const requestedDate = String(req.query.date || new Date().toISOString().slice(0, 10))
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      res.status(400).json({ error: 'Invalid date' })
      return
    }
    res.json(await getAvailabilityTrends(courses.filter((course) => course.status !== 'unsupported'), requestedDate))
  } catch (error) {
    console.error('Failed to calculate availability trends', error)
    res.status(500).json({ error: 'Failed to calculate availability trends' })
  }
})

// Collect a small, consistent historical sample. Vercel automatically sends
// CRON_SECRET as a Bearer token when this route is invoked by a configured cron.
app.get('/api/cron/collect-tee-times', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || req.get('authorization') !== `Bearer ${cronSecret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!isSnapshotStorageConfigured()) {
    res.status(503).json({ error: 'DATABASE_URL is not configured' })
    return
  }

  const jobs = courses
    .filter((course) => course.status !== 'unsupported')
    .flatMap((course) => {
      const today = currentDateInTimeZone(course.timeZone)
      return cronLeadDays.map((leadDays) => ({ course, date: addDays(today, leadDays) }))
    })
  let nextJob = 0
  let succeeded = 0
  let failed = 0

  async function worker() {
    while (nextJob < jobs.length) {
      const job = jobs[nextJob]
      nextJob += 1
      try {
        const teeTimes = await getTeeTimesForCourse(job.course, job.date)
        await recordSnapshotSafely(job.course, job.date, teeTimes, 'cron')
        succeeded += 1
      } catch (error) {
        await recordSnapshotSafely(job.course, job.date, [], 'cron', 'error', error)
        failed += 1
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, jobs.length) }, () => worker()))
  res.json({ jobs: jobs.length, succeeded, failed, leadDays: cronLeadDays })
})

app.get('/api/courses/:id/weather', async (req, res) => {
  // Successful forecasts are cached server-side. Avoid retaining a transient
  // upstream failure in the browser or revalidating that fallback as a 304.
  res.set('Cache-Control', 'no-store')
  try {
    const { id } = req.params
    const { date } = req.query
    const course = getCourseById(id)

    if (!course) {
      res.status(404).json({ error: 'Course not found' })
      return
    }

    if (!course.latitude || !course.longitude) {
      res.json({ hourly: [] })
      return
    }

    const forecastDate = String(date || new Date().toISOString().slice(0, 10))
    const cacheKey = `${course.id}:${forecastDate}`
    const cachedWeather = weatherCache.get(cacheKey)

    if (cachedWeather && cachedWeather.expiresAt > Date.now()) {
      res.json({ hourly: cachedWeather.hourly })
      return
    }

    const today = new Date()
    const requestedDate = new Date(`${forecastDate}T12:00:00`)
    const lastForecastDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15, 12)

    if (Number.isNaN(requestedDate.getTime()) || requestedDate > lastForecastDate) {
      res.json({ hourly: [] })
      return
    }

    const params = new URLSearchParams({
      latitude: String(course.latitude),
      longitude: String(course.longitude),
      hourly: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation_probability',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: 'America/New_York',
      start_date: forecastDate,
      end_date: forecastDate,
    })
    const response = await fetchWeather(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)

    const data = await response.json() as {
      hourly?: {
        time?: string[]
        temperature_2m?: number[]
        apparent_temperature?: number[]
        weather_code?: number[]
        wind_speed_10m?: number[]
        wind_gusts_10m?: number[]
        precipitation_probability?: number[]
      }
    }
    const hourly = (data.hourly?.time || []).map((time, index) => ({
      time,
      temperature: data.hourly?.temperature_2m?.[index],
      apparentTemperature: data.hourly?.apparent_temperature?.[index],
      weatherCode: data.hourly?.weather_code?.[index],
      windSpeed: data.hourly?.wind_speed_10m?.[index],
      windGust: data.hourly?.wind_gusts_10m?.[index],
      precipitationProbability: data.hourly?.precipitation_probability?.[index],
    }))

    weatherCache.set(cacheKey, { expiresAt: Date.now() + weatherCacheDurationMs, hourly })
    res.json({ hourly })
  } catch (error) {
    console.error('Failed to fetch weather', error)
    res.json({ hourly: [], unavailable: true })
  }
})

export default app

// Start server
app.listen(port, () => {
  console.log(`🚀 Golf API running on http://localhost:${port}`)
})
