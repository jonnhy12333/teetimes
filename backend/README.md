# Golf Tee Times - Backend API

## Setup

### Environment Variables
The API works without a database locally. Snapshot collection requires Postgres:

```
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://...
CRON_SECRET=replace-with-a-random-secret-at-least-16-characters-long
CHRONOGOLF_FALLBACK_API_URL=https://teetimes-api.onrender.com
```

- `DATABASE_URL` is injected automatically when a Neon database is connected through the Vercel Marketplace.
- `CRON_SECRET` protects the collection endpoint. Vercel sends it as a Bearer token for scheduled invocations.
- Without `DATABASE_URL`, live tee-time searches continue to work but no historical snapshots are recorded.
- Outside production, snapshot writes are disabled unless `SNAPSHOT_DATABASE_URL` is explicitly set. Use `TRENDS_DATABASE_URL` for read-only access to production history during local development.
- `CHRONOGOLF_FALLBACK_API_URL` is optional. Chronogolf requests use it only when the provider rejects a direct request from Vercel; it defaults to the existing Render API.

### Installation & Running

```bash
npm install
npm run dev
```

Server runs on http://localhost:5000

### Create or update the database schema

After setting `DATABASE_URL` in `backend/.env`:

```bash
npm run db:push
```

The equivalent initial SQL is checked in at `drizzle/0000_create_tee_time_snapshots.sql`.

## Vercel deployment

Create a Vercel project for the API with its **Root Directory** set to `backend`. Then:

1. Install the Neon integration from the Vercel Marketplace and connect it to the API project.
2. Add `FRONTEND_URL` and a random `CRON_SECRET` in the project environment variables.
3. Apply the schema once with `npm run db:push` using the Neon `DATABASE_URL`.
4. Deploy. `vercel.json` schedules collection daily at 10:17 UTC.

The daily collector samples each supported course 1, 3, 7, and 14 days before play. Normal user searches also record a snapshot. A unique six-hour observation bucket prevents repeated searches from producing excessive duplicate data.

On Vercel Hobby, daily is the fastest supported cron schedule. The endpoint can later be invoked more frequently by Vercel Pro or another scheduler without changing the storage design.

## API Endpoints

### Courses
- `GET /api/courses` - Get configured courses
- `GET /api/availability-trends?date=YYYY-MM-DD` - Compare course availability with similar historical observations
- `GET /api/courses/:id/tee-times` - Get tee times for a course
- `GET /api/courses/:id/weather` - Get hourly weather for a course/date
- `GET /api/cron/collect-tee-times` - Collect historical snapshots (requires `Authorization: Bearer <CRON_SECRET>`)
