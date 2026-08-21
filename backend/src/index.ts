import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { courses, getCourseById, getTeeTimesForCourse } from './courses.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

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

    res.json(await getTeeTimesForCourse(course, String(date || new Date().toISOString().slice(0, 10))))
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
      throw new Error(`Open-Meteo request failed with ${response.status}`)
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

    res.json({ hourly })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch weather' })
  }
})

// Start server
app.listen(port, () => {
  console.log(`🚀 Golf API running on http://localhost:${port}`)
})
