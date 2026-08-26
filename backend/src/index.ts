import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { courses, getCourseById, getTeeTimesForCourse } from './courses.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const weatherCache = new Map<string, { expiresAt: number; hourly: unknown[] }>()
const weatherCacheDurationMs = 10 * 60 * 1000
const developmentTeeTimeCacheEnabled = process.env.DEV_TEE_TIME_CACHE === 'true' || (process.env.DEV_TEE_TIME_CACHE !== 'false' && process.env.npm_lifecycle_event === 'dev')
const developmentTeeTimeCacheDurationMs = Number(process.env.DEV_TEE_TIME_CACHE_TTL_MS) || 60 * 60 * 1000
const developmentTeeTimeCacheDirectory = resolve(process.cwd(), '.dev-cache', 'tee-times')
const developmentTeeTimeCachePath = (courseId: string, date: string) => resolve(developmentTeeTimeCacheDirectory, `${courseId}-${date}`.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json')

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
  try {
    const { id } = req.params
    const { date } = req.query
    const course = getCourseById(id)

    if (!course) {
      res.status(404).json({ error: 'Course not found' })
      return
    }

    if (course.status === 'unsupported') {
      res.json([])
      return
    }

    const requestedDate = String(date || new Date().toISOString().slice(0, 10))
    const bypassCache = req.query.refresh === '1'
    const cachedTeeTimes = bypassCache ? undefined : await readDevelopmentTeeTimeCache(course.id, requestedDate)
    if (cachedTeeTimes) {
      res.set('X-Dev-Tee-Time-Cache', 'HIT')
      res.json(cachedTeeTimes)
      return
    }

    const teeTimes = await getTeeTimesForCourse(course, requestedDate)
    await writeDevelopmentTeeTimeCache(course.id, requestedDate, teeTimes)
    if (developmentTeeTimeCacheEnabled) res.set('X-Dev-Tee-Time-Cache', bypassCache ? 'BYPASS' : 'MISS')
    res.json(teeTimes)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tee times' })
  }
})

app.get('/api/courses/:id/weather', async (req, res) => {
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
      hourly: 'temperature_2m,weather_code,wind_speed_10m,precipitation_probability',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: 'America/New_York',
      start_date: forecastDate,
      end_date: forecastDate,
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)

    if (!response.ok) {
      const responseText = await response.text()
      throw new Error(`Open-Meteo request failed with ${response.status}: ${responseText.slice(0, 300)}`)
    }

    const data = await response.json() as {
      hourly?: {
        time?: string[]
        temperature_2m?: number[]
        weather_code?: number[]
        wind_speed_10m?: number[]
        precipitation_probability?: number[]
      }
    }
    const hourly = (data.hourly?.time || []).map((time, index) => ({
      time,
      temperature: data.hourly?.temperature_2m?.[index],
      weatherCode: data.hourly?.weather_code?.[index],
      windSpeed: data.hourly?.wind_speed_10m?.[index],
      precipitationProbability: data.hourly?.precipitation_probability?.[index],
    }))

    weatherCache.set(cacheKey, { expiresAt: Date.now() + weatherCacheDurationMs, hourly })
    res.json({ hourly })
  } catch (error) {
    console.error('Failed to fetch weather', error)
    res.json({ hourly: [], unavailable: true })
  }
})

// Start server
app.listen(port, () => {
  console.log(`🚀 Golf API running on http://localhost:${port}`)
})
