# Golf Tee Times - Backend API

## Setup

### Environment Variables
Create a `.env` file in the backend directory:

```
PORT=5000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/golf_tee_times

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/auth/google/callback

# Session
SESSION_SECRET=your_random_session_secret

# Frontend
FRONTEND_URL=http://localhost:5173
```

### Database Setup

Create PostgreSQL database:
```sql
CREATE DATABASE golf_tee_times;
```

Run migrations (will be created):
```bash
npm run migrate
```

### Installation & Running

```bash
npm install
npm run dev
```

Server runs on http://localhost:5000

## API Endpoints

### Auth
- `GET /auth/google` - Start Google OAuth flow
- `GET /auth/google/callback` - Google OAuth callback
- `GET /auth/logout` - Logout

### Courses
- `GET /api/courses` - Get nearby courses
- `GET /api/courses/:id/tee-times` - Get tee times for a course

### User
- `GET /api/user/profile` - Get current user profile
- `POST /api/user/credentials` - Save course credentials
