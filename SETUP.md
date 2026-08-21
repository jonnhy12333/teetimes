# Golf Tee Times - Project Setup

## Project Structure

```
golf/
├── src/                    # Solid.js Frontend
│   ├── components/
│   │   └── Dashboard.tsx  # Main app with filters and tee-time list
│   ├── App.tsx
│   ├── index.css
│   ├── App.css
│   └── main.tsx
├── backend/               # Express.js API
│   ├── src/
│   │   ├── index.ts       # Public API server
│   │   └── courses.ts     # Course config registry and provider adapters
│   ├── package.json
│   └── tsconfig.json
├── package.json           # Frontend dependencies
└── vite.config.ts
```

## What's Been Built

### Frontend (Solid.js)
✅ Public dashboard with date, course, player, and time-of-day filters
✅ Tee-time list with course links, booking links, and weather chips
✅ Responsive UI with golf theme

### Backend (Node.js/Express)
✅ Course config registry with auth metadata
✅ Public API routes for courses, tee times, and weather
✅ Provider adapters for ForeUP, TeeItUp, Easy Tee, and Chronogolf

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

## Local Setup

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
npm run dev
```

## Once You Give Me the Course Name

We'll:
1. Research their tee time system (GolfNow/ForeUP/Supreme Golf)
2. Add or update the course config in `backend/src/courses.ts`
3. Mark whether tee times are public, member-login, OAuth-based, or still unknown
4. Build tee time fetcher for that system
5. Wire it into the dashboard
