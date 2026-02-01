# Deployment Guide

## Quick Deploy to Render.com

### Prerequisites
1. GitHub repository with this code
2. Render.com account (free tier works)

### Step 1: Deploy PostgreSQL Database

1. Go to Render Dashboard → "New" → "PostgreSQL"
2. Configure:
   - Name: `interview-saas-db`
   - Database: `interview_saas`
   - User: Auto-generated
   - Region: Choose closest to your users
   - Instance Type: Free (for testing) or Starter ($7/mo)
3. Click "Create Database"
4. **Save the Internal Database URL** - you'll need this

### Step 2: Deploy Backend Service

1. Go to Render Dashboard → "New" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `interview-saas-backend`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Root Directory**: Leave blank (or path to backend folder)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (for testing) or Starter ($7/mo)

4. **Environment Variables** - Add these:

```
NODE_ENV=production
PORT=3000
DATABASE_URL=[paste your Render PostgreSQL Internal URL]
REDIS_URL=[if using Redis, add URL here]
JWT_SECRET=[generate random 32+ char string]
JWT_EXPIRES_IN=7d
OPENAI_API_KEY=[your OpenAI API key]
CORS_ORIGIN=https://your-frontend-url.com
FRONTEND_URL=https://your-frontend-url.com
```

5. Click "Create Web Service"

### Step 3: Run Database Migration

After deployment completes:

1. Go to your web service → "Shell" tab
2. Run:
```bash
npm run migrate
```

This creates all database tables.

### Step 4: Test the API

Your backend will be live at: `https://interview-saas-backend.onrender.com`

Test health endpoint:
```bash
curl https://interview-saas-backend.onrender.com/api/health
```

Should return:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "api": "running"
  }
}
```

---

## Alternative: Deploy to Railway

### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### Step 2: Initialize Project
```bash
cd interview-saas-backend
railway init
```

### Step 3: Add PostgreSQL
```bash
railway add postgresql
```

### Step 4: Set Environment Variables
```bash
railway variables set NODE_ENV=production
railway variables set JWT_SECRET=your-secret-here
railway variables set OPENAI_API_KEY=your-key-here
# DATABASE_URL is auto-set by Railway
```

### Step 5: Deploy
```bash
railway up
```

### Step 6: Run Migration
```bash
railway run npm run migrate
```

---

## Local Development Setup

### 1. Install PostgreSQL locally

**macOS:**
```bash
brew install postgresql@14
brew services start postgresql@14
createdb interview_saas
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-14
sudo systemctl start postgresql
sudo -u postgres createdb interview_saas
```

### 2. Install Redis (optional, for Phase 2)

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

### 3. Setup Environment

```bash
cp .env.example .env
# Edit .env with your local settings
```

Example local `.env`:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://localhost:5432/interview_saas
REDIS_URL=redis://localhost:6379
JWT_SECRET=local-dev-secret-change-in-production
OPENAI_API_KEY=sk-your-key-here
CORS_ORIGIN=http://localhost:3001
FRONTEND_URL=http://localhost:3001
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Run Migration
```bash
npm run migrate
```

### 6. Start Development Server
```bash
npm run dev
```

Backend will run on `http://localhost:3000`

---

## Testing the API

### Using cURL

**Register:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Co","email":"test@test.com","password":"password123"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'
```

**Create Job (save token from login):**
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Backend Engineer",
    "description":"We need a backend engineer",
    "required_skills":["Node.js"],
    "language":"en"
  }'
```

### Using Postman/Insomnia

Import the API_DOCS.md endpoints into Postman or Insomnia for easier testing.

---

## Production Checklist

Before going live:

- [ ] Change `JWT_SECRET` to strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Use paid database tier (Free tier has limits)
- [ ] Add Redis for job queue (Phase 2)
- [ ] Configure CORS_ORIGIN to your actual frontend domain
- [ ] Set up monitoring (Render has built-in metrics)
- [ ] Enable SSL (auto-enabled on Render)
- [ ] Set up backups for PostgreSQL
- [ ] Configure webhook secret keys
- [ ] Add rate limiting (already implemented)
- [ ] Test all endpoints thoroughly
- [ ] Set up error tracking (Sentry, etc.)

---

## Monitoring & Logs

### Render

View logs in real-time:
1. Go to your web service
2. Click "Logs" tab
3. Filter by severity (info, error, etc.)

### Railway

```bash
railway logs
```

### Local

Logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

---

## Scaling Considerations

When you start getting traction:

1. **Database**: Upgrade to Render's Starter or Pro tier
2. **Backend**: Scale horizontally (multiple instances)
3. **Redis**: Add for job queues and caching
4. **CDN**: Use Cloudflare for static assets
5. **File Storage**: Use S3/R2 for resume uploads
6. **Monitoring**: Add APM (New Relic, Datadog)

---

## Troubleshooting

**Database connection errors:**
- Verify DATABASE_URL is correct
- Check if database service is running
- Ensure network allows connections

**Migration fails:**
- Check if database exists
- Verify user has CREATE TABLE permissions
- Review error logs for specific issue

**API 401 errors:**
- Verify JWT_SECRET matches between environments
- Check token expiry
- Ensure Authorization header format is correct

**CORS errors:**
- Update CORS_ORIGIN to match frontend URL
- Check if frontend is using correct protocol (http vs https)

---

## Next Steps

1. **Test the backend** - Use Postman/cURL to verify all endpoints
2. **Connect Lovable frontend** - Point API calls to your backend URL
3. **Implement Phase 2** - AI agents, video processing, etc.
4. **Add monitoring** - Set up error tracking and analytics
5. **Launch MVP** - Start with beta customers

---

Need help? Check:
- README.md - Full feature documentation
- API_DOCS.md - Complete API reference
- logs/ - Application logs
