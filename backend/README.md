# Golf Tee Times - Backend API

## Setup

### Environment Variables
Only `FRONTEND_URL` is needed for CORS in deployed environments:

```
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### Installation & Running

```bash
npm install
npm run dev
```

Server runs on http://localhost:5000

## API Endpoints

### Courses
- `GET /api/courses` - Get configured courses
- `GET /api/courses/:id/tee-times` - Get tee times for a course
- `GET /api/courses/:id/weather` - Get hourly weather for a course/date
