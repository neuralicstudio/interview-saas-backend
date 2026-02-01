# Interview SaaS Backend API

AI-powered multi-lingual interview agent system backend built with Node.js, Express, and PostgreSQL.

## 🚀 Features

- **Multi-agent interview orchestration** (Interviewer, Rubric Builder, Consistency Checker, Authenticity Signal, Stress Monitor, Report Synthesizer)
- **Multi-lingual support** (English, Spanish, Arabic, Hindi, French)
- **AI-generated interview rubrics** from job descriptions
- **Real-time interview state management**
- **CV/Resume parsing and consistency checking**
- **Video frame analysis** (GPT-4 Vision for behavioral signals)
- **Subscription-based quota system**
- **Webhook integrations** for interview events
- **RESTful API** with JWT authentication

## 📋 Prerequisites

- Node.js v18+ 
- PostgreSQL 14+
- Redis (for job queues)
- OpenAI API key

## 🛠️ Installation

1. **Clone and install dependencies:**

```bash
cd interview-saas-backend
npm install
```

2. **Set up environment variables:**

```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Create PostgreSQL database:**

```bash
createdb interview_saas
```

4. **Run migrations:**

```bash
npm run migrate
```

5. **Start the server:**

```bash
# Development
npm run dev

# Production
npm start
```

## 🗄️ Database Schema

The system uses the following main tables:

- `companies` - Company accounts with subscription info
- `jobs` - Job positions to interview for
- `rubrics` - AI-generated interview templates
- `candidates` - Candidate profiles
- `interviews` - Interview sessions with transcripts and evaluations
- `interview_invites` - Secure invite tokens for candidates
- `agent_observations` - Internal agent analysis during interviews
- `video_frames` - Behavioral analysis from video
- `api_keys` - API authentication
- `webhooks` - Integration webhooks

## 🔑 API Endpoints

### Authentication

```
POST   /api/auth/register        - Register company account
POST   /api/auth/login           - Login
GET    /api/auth/me              - Get current company info
POST   /api/auth/api-keys        - Generate API key
GET    /api/auth/api-keys        - List API keys
DELETE /api/auth/api-keys/:id    - Revoke API key
```

### Jobs

```
POST   /api/jobs                 - Create job position
GET    /api/jobs                 - List jobs
GET    /api/jobs/:id             - Get job details
PUT    /api/jobs/:id             - Update job
PATCH  /api/jobs/:id/status      - Update job status
DELETE /api/jobs/:id             - Delete job
```

### Rubrics (AI-Generated Interview Templates)

```
POST   /api/rubrics/generate     - Generate rubric from job description
GET    /api/rubrics/job/:job_id  - Get rubrics for job
GET    /api/rubrics/:id          - Get rubric details
PUT    /api/rubrics/:id          - Update rubric
PATCH  /api/rubrics/:id/activate - Set rubric as active
```

### Candidates

```
POST   /api/candidates           - Create/update candidate
GET    /api/candidates           - List candidates
GET    /api/candidates/:id       - Get candidate with interview history
```

### Interviews

```
POST   /api/interviews                  - Create interview & generate invite
GET    /api/interviews                  - List interviews
GET    /api/interviews/:id              - Get interview details & report
GET    /api/interviews/invite/:token    - Get interview by invite (public)
POST   /api/interviews/:id/start        - Start interview session
POST   /api/interviews/:id/complete     - Complete interview
POST   /api/interviews/:id/transcript   - Add to transcript (real-time)
DELETE /api/interviews/:id              - Cancel interview
```

### Webhooks

```
POST   /api/webhooks             - Create webhook
GET    /api/webhooks             - List webhooks
DELETE /api/webhooks/:id         - Delete webhook
```

### Health

```
GET    /api/health               - Health check
```

## 🔒 Authentication

All company endpoints require authentication via:

**JWT Token (for web/mobile):**
```
Authorization: Bearer <token>
```

**API Key (for integrations):**
```
x-api-key: <api_key>
```

## 📊 Example API Flows

### 1. Create Interview Flow

```javascript
// 1. Register/Login
POST /api/auth/register
{
  "name": "TechCorp",
  "email": "hiring@techcorp.com",
  "password": "securepassword"
}
// Returns: { token, company }

// 2. Create Job
POST /api/jobs
Headers: { Authorization: "Bearer <token>" }
{
  "title": "Senior Backend Engineer",
  "description": "We're looking for...",
  "required_skills": ["Node.js", "PostgreSQL"],
  "language": "en"
}
// Returns: { job }

// 3. Generate Rubric (AI creates interview questions)
POST /api/rubrics/generate
{
  "job_id": "uuid-here"
}
// Returns: { rubric } with AI-generated questions

// 4. Add Candidate
POST /api/candidates
{
  "email": "john@example.com",
  "full_name": "John Doe",
  "resume_text": "..."
}
// Returns: { candidate }

// 5. Create Interview
POST /api/interviews
{
  "job_id": "job-uuid",
  "candidate_id": "candidate-uuid",
  "language": "en"
}
// Returns: { interview, invite_url }

// 6. Candidate accesses interview
GET /api/interviews/invite/{token}
// Returns interview details

// 7. Start interview
POST /api/interviews/{id}/start

// 8. During interview (AI agents update state)
POST /api/interviews/{id}/transcript
{
  "speaker": "candidate",
  "text": "I have 5 years of Node.js experience..."
}

// 9. Complete interview
POST /api/interviews/{id}/complete

// 10. View report
GET /api/interviews/{id}
// Returns full analysis with strengths, weaknesses, recommendation
```

## 🤖 Multi-Agent Architecture

The system uses 6 specialized AI agents:

1. **Interviewer Agent** - Conducts conversation, asks questions
2. **Rubric Builder Agent** - Generates interview templates from job descriptions
3. **Consistency Checker Agent** - Verifies CV claims vs. actual answers
4. **Authenticity Signal Agent** - Detects response quality signals
5. **Stress Monitor Agent** - Monitors candidate experience, suggests pacing adjustments
6. **Report Synthesizer Agent** - Creates final company-facing reports

## 🌍 Multi-Lingual Support

Supported languages:
- `en` - English
- `es` - Spanish
- `ar` - Arabic
- `hi` - Hindi
- `fr` - French

Set language when creating jobs or interviews. All AI agents adapt to the target language.

## 💳 Subscription & Quota System

Companies have interview quotas based on subscription tiers:

```javascript
{
  subscription_tier: 'free',      // free, starter, growth, enterprise
  interviews_quota: 50,           // Monthly limit
  interviews_used: 12             // Current usage
}
```

Quota is checked via `checkQuota` middleware before creating interviews.

## 📝 Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/interview_saas

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-...

# Frontend URL (for invite links)
FRONTEND_URL=http://localhost:3001

# CORS
CORS_ORIGIN=http://localhost:3001
```

## 🏗️ Project Structure

```
src/
├── server.js              # Express app entry point
├── db/
│   ├── index.js           # PostgreSQL connection pool
│   ├── schema.sql         # Database schema
│   └── migrate.js         # Migration script
├── routes/
│   ├── auth.js            # Authentication endpoints
│   ├── jobs.js            # Job management
│   ├── rubrics.js         # Interview rubrics
│   ├── candidates.js      # Candidate management
│   ├── interviews.js      # Interview sessions
│   ├── webhooks.js        # Webhook management
│   └── health.js          # Health checks
├── middleware/
│   └── auth.js            # JWT & API key authentication
└── utils/
    ├── auth.js            # Auth utilities (JWT, bcrypt)
    └── logger.js          # Winston logger
```

## 🚧 TODO: Phase 2 (AI Agents Implementation)

Next steps to complete the system:

1. **Rubric Builder Agent** - OpenAI GPT-4 to generate questions from job descriptions
2. **Interview Orchestrator** - Real-time interview flow management
3. **Consistency Checker** - CV vs. answers analysis
4. **Authenticity Signals** - Response quality detection
5. **Stress Monitor** - Candidate experience tracking
6. **Report Synthesizer** - Final report generation
7. **Video Integration** - Daily.co/Agora SDK
8. **GPT-4 Vision** - Frame analysis for behavioral signals
9. **Text-to-Speech** - ElevenLabs for AI voice
10. **Job Queue System** - Bull for background processing

## 📞 Integration with Frontend (Lovable AI)

The backend exposes a RESTful API that your Lovable frontend can consume:

```javascript
// Example: Create interview from frontend
const response = await fetch('http://localhost:3000/api/interviews', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    job_id: selectedJob.id,
    candidate_id: candidate.id,
    language: 'en'
  })
});

const { interview, invite_url } = await response.json();
// Send invite_url to candidate via email
```

## 🐛 Debugging

View logs:
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

## 📄 License

MIT

---

Built by Neuralic/ReceptHub 🚀
