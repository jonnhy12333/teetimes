import express from 'express'
import session from 'express-session'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import cors from 'cors'
import dotenv from 'dotenv'
import { courses, getCourseById, getTeeTimesForCourse } from './courses.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
const googleOAuthConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

app.set('trust proxy', 1)

// Middleware
app.use(cors({
  origin: frontendUrl,
  credentials: true,
}))
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}))

// Passport Setup
if (googleOAuthConfigured) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // TODO: Save user to database
      const user = {
        id: profile.id,
        email: profile.emails?.[0]?.value,
        name: profile.displayName,
        accessToken,
        refreshToken,
      }
      return done(null, user)
    } catch (error) {
      return done(error)
    }
  }))
}

passport.serializeUser((user: any, done) => {
  done(null, user)
})

passport.deserializeUser((user: any, done) => {
  done(null, user)
})

app.use(passport.initialize())
app.use(passport.session())

// Routes

// Auth Routes
if (googleOAuthConfigured) {
  app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
  }))
} else {
  app.get('/auth/google', (req, res) => {
    res.status(503).send([
      'Google OAuth is not configured yet.',
      '',
      'Create backend/.env from backend/.env.example and set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
      'The redirect URI in Google Cloud should be http://localhost:5000/auth/google/callback.',
    ].join('\n'))
  })
}

app.get('/auth/google/callback',
  googleOAuthConfigured
    ? passport.authenticate('google', { failureRedirect: '/' })
    : (req, res) => res.redirect(`${frontendUrl}?error=google-oauth-not-configured`),
  (req, res) => {
    // Successful authentication
    res.redirect(`${frontendUrl}/dashboard`)
  }
)

app.get('/auth/logout', (req, res) => {
  req.logout(() => {
    res.redirect(frontendUrl)
  })
})

// API Routes (Protected)
const isAuthenticated = (req: any, res: any, next: any) => {
  if (req.isAuthenticated()) {
    return next()
  }
  res.status(401).json({ error: 'Not authenticated' })
}

app.get('/api/user/profile', isAuthenticated, (req: any, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
  })
})

// Get configured nearby courses
app.get('/api/courses', isAuthenticated, async (req, res) => {
  try {
    // TODO: Filter by user location once geolocation is stored or passed in.
    res.json(courses)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch courses' })
  }
})

// Get tee times for a configured course
app.get('/api/courses/:id/tee-times', isAuthenticated, async (req, res) => {
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

// Start server
app.listen(port, () => {
  console.log(`🚀 Golf API running on http://localhost:${port}`)
})
