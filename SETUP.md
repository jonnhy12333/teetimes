# Golf Tee Times - Project Setup

## Project Structure

```
golf/
├── src/                    # Solid.js Frontend
│   ├── components/
│   │   ├── Login.tsx      # Login page with Google OAuth
│   │   └── Dashboard.tsx  # Main app with day selector
│   ├── App.tsx
│   ├── index.css
│   ├── App.css
│   └── main.tsx
├── backend/               # Express.js API
│   ├── src/
│   │   ├── index.ts       # Main server with OAuth setup
│   │   └── courses.ts     # Course config registry and demo tee times
│   ├── package.json
│   └── tsconfig.json
├── package.json           # Frontend dependencies
└── vite.config.ts
```

## What's Been Built

### Frontend (Solid.js)
✅ Login page with "Login with Gmail" button
✅ Dashboard with user info and logout
✅ Day selector dropdown (Today, Tomorrow, etc.)
✅ Placeholder tee times list with course details
✅ Responsive UI with golf theme

### Backend (Node.js/Express)
✅ Google OAuth integration setup
✅ Session management
✅ Protected API routes (requires authentication)
✅ Course config registry with auth metadata
✅ Placeholder tee-time adapter for configured courses
⏳ Database schema (to be created)

## Adding Courses

Start by adding a course entry in `backend/src/courses.ts`:

```ts
{
   id: 'course-slug',
   name: 'Course Name',
   city: 'City',
   state: 'ST',
   bookingSystem: 'GolfNow | ForeUP | Club Caddie | unknown',
   bookingUrl: 'https://example.com/tee-times',
   authType: 'none | member-login | oauth | unknown',
   notes: 'What we know about auth, booking links, and provider behavior.',
}
```

Use `authType: 'unknown'` until we confirm whether tee times are public, require a member login, or need a connected third-party account. Once a provider is known, replace the demo tee-time data with a provider-specific fetcher instead of putting scraping/API logic directly in the route.

## Next Steps

### 1. Get Google OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable "Google+ API"
4. Create OAuth 2.0 credentials (Web application)
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5000/auth/google/callback`
5. Copy Client ID and Client Secret

### 2. Set Up Database
```bash
# Install PostgreSQL if not already installed
# Create database:
createdb golf_tee_times

# Then: Add DB schema (coming next)
```

### 3. Setup Backend
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your Google credentials and DB connection
npm run dev
```

### 4. Setup Frontend (already running)
```bash
npm run dev
```

### 5. Test Flow
1. Frontend runs on http://localhost:5173
2. Click "Login with Gmail"
3. Redirects to http://localhost:5000/auth/google
4. Should redirect back to dashboard (once DB is set up)

## Once You Give Me the Course Name

We'll:
1. Research their tee time system (GolfNow/ForeUP/Supreme Golf)
2. Add or update the course config in `backend/src/courses.ts`
3. Mark whether tee times are public, member-login, OAuth-based, or still unknown
4. Build tee time fetcher for that system
5. Wire it into the dashboard
