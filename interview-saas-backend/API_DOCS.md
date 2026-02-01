# API Documentation

Base URL: `http://localhost:3000/api`

## Authentication

All authenticated endpoints require either:
- JWT token in `Authorization: Bearer <token>` header, OR
- API key in `x-api-key: <key>` header

---

## 1. Authentication Endpoints

### Register Company
```http
POST /auth/register
Content-Type: application/json

{
  "name": "TechCorp Inc",
  "email": "admin@techcorp.com",
  "password": "SecurePass123!",
  "industry": "Technology",
  "company_size": "50-200",
  "website": "https://techcorp.com"
}

Response 201:
{
  "message": "Company registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "company": {
    "id": "uuid-here",
    "name": "TechCorp Inc",
    "email": "admin@techcorp.com",
    "subscription_tier": "free",
    "interviews_quota": 50
  }
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@techcorp.com",
  "password": "SecurePass123!"
}

Response 200:
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "company": {
    "id": "uuid-here",
    "name": "TechCorp Inc",
    "email": "admin@techcorp.com",
    "subscription_tier": "free",
    "interviews_quota": 50,
    "interviews_used": 5
  }
}
```

### Get Current Company Info
```http
GET /auth/me
Authorization: Bearer <token>

Response 200:
{
  "company": {
    "id": "uuid-here",
    "name": "TechCorp Inc",
    "email": "admin@techcorp.com",
    "industry": "Technology",
    "company_size": "50-200",
    "subscription_tier": "free",
    "subscription_status": "active",
    "interviews_quota": 50,
    "interviews_used": 5,
    "created_at": "2026-01-15T10:00:00.000Z"
  }
}
```

---

## 2. Jobs Endpoints

### Create Job
```http
POST /jobs
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Senior Backend Engineer",
  "description": "We are looking for an experienced backend engineer to join our team. You will work on scaling our API infrastructure and building new microservices.",
  "department": "Engineering",
  "seniority_level": "senior",
  "location": "Remote - USA",
  "job_type": "remote",
  "required_skills": ["Node.js", "PostgreSQL", "System Design", "AWS"],
  "nice_to_have_skills": ["Docker", "Kubernetes"],
  "language": "en"
}

Response 201:
{
  "message": "Job created successfully",
  "job": {
    "id": "uuid-here",
    "company_id": "company-uuid",
    "title": "Senior Backend Engineer",
    "description": "...",
    "required_skills": ["Node.js", "PostgreSQL", "System Design", "AWS"],
    "status": "active",
    "created_at": "2026-01-31T10:00:00.000Z"
  }
}
```

### List Jobs
```http
GET /jobs?status=active&page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "jobs": [
    {
      "id": "uuid-1",
      "title": "Senior Backend Engineer",
      "status": "active",
      "created_at": "2026-01-31T10:00:00.000Z"
    },
    {
      "id": "uuid-2",
      "title": "Frontend Developer",
      "status": "active",
      "created_at": "2026-01-30T15:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45
  }
}
```

### Get Single Job
```http
GET /jobs/{job_id}
Authorization: Bearer <token>

Response 200:
{
  "job": {
    "id": "uuid-here",
    "company_id": "company-uuid",
    "title": "Senior Backend Engineer",
    "description": "...",
    "department": "Engineering",
    "seniority_level": "senior",
    "required_skills": ["Node.js", "PostgreSQL"],
    "status": "active"
  }
}
```

---

## 3. Rubrics Endpoints

### Generate Rubric (AI)
```http
POST /rubrics/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "job_id": "job-uuid-here"
}

Response 201:
{
  "message": "Rubric generated successfully",
  "rubric": {
    "id": "rubric-uuid",
    "job_id": "job-uuid",
    "version": 1,
    "competencies": [
      {
        "name": "Technical Skills",
        "weight": 0.4,
        "must_have": true
      },
      {
        "name": "Problem Solving",
        "weight": 0.3,
        "must_have": true
      }
    ],
    "question_bank": {
      "warmup": ["Tell me about your background..."],
      "claim_verification": ["You mentioned Node.js..."],
      "scenario": ["Imagine you're facing a production issue..."],
      "depth": ["Why did you choose that approach?"],
      "reflection": ["What would you do differently?"]
    },
    "created_by": "ai",
    "is_active": true
  }
}
```

---

## 4. Candidates Endpoints

### Create Candidate
```http
POST /candidates
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "john.doe@example.com",
  "full_name": "John Doe",
  "phone": "+1-555-0123",
  "linkedin_url": "https://linkedin.com/in/johndoe",
  "resume_text": "John Doe - Senior Backend Engineer with 8 years...",
  "resume_parsed": {
    "skills": ["Node.js", "Python", "PostgreSQL"],
    "experience": [
      {
        "company": "Tech Inc",
        "role": "Backend Engineer",
        "years": 3
      }
    ]
  },
  "source": "company_direct"
}

Response 201:
{
  "message": "Candidate created successfully",
  "candidate": {
    "id": "candidate-uuid",
    "email": "john.doe@example.com",
    "full_name": "John Doe",
    "resume_parsed": {...},
    "created_at": "2026-01-31T10:00:00.000Z"
  }
}
```

---

## 5. Interviews Endpoints

### Create Interview (Most Important!)
```http
POST /interviews
Authorization: Bearer <token>
Content-Type: application/json

{
  "job_id": "job-uuid",
  "candidate_id": "candidate-uuid",
  "language": "en",
  "duration_minutes": 15
}

Response 201:
{
  "message": "Interview created successfully",
  "interview": {
    "id": "interview-uuid",
    "job_id": "job-uuid",
    "candidate_id": "candidate-uuid",
    "status": "scheduled",
    "language": "en",
    "duration_minutes": 15,
    "created_at": "2026-01-31T10:00:00.000Z"
  },
  "invite_url": "http://localhost:3001/interview/unique-token-here",
  "candidate_email": "john.doe@example.com"
}
```

### Get Interview by Invite Token (Public - No Auth)
```http
GET /interviews/invite/{token}

Response 200:
{
  "interview": {
    "id": "interview-uuid",
    "language": "en",
    "duration_minutes": 15,
    "status": "scheduled",
    "job_title": "Senior Backend Engineer",
    "company_name": "TechCorp Inc"
  }
}
```

### Start Interview
```http
POST /interviews/{interview_id}/start

Response 200:
{
  "message": "Interview started",
  "interview": {
    "id": "interview-uuid",
    "status": "in_progress",
    "started_at": "2026-01-31T10:05:00.000Z"
  }
}
```

### Add to Transcript (During Interview)
```http
POST /interviews/{interview_id}/transcript
Content-Type: application/json

{
  "speaker": "candidate",
  "text": "I have been working with Node.js for about 5 years now, primarily building REST APIs and microservices...",
  "timestamp": "2026-01-31T10:07:30.000Z"
}

Response 200:
{
  "message": "Transcript updated"
}
```

### Complete Interview
```http
POST /interviews/{interview_id}/complete

Response 200:
{
  "message": "Interview completed",
  "interview": {
    "id": "interview-uuid",
    "status": "completed",
    "completed_at": "2026-01-31T10:20:00.000Z"
  }
}
```

### Get Interview Report
```http
GET /interviews/{interview_id}
Authorization: Bearer <token>

Response 200:
{
  "interview": {
    "id": "interview-uuid",
    "status": "completed",
    "candidate_name": "John Doe",
    "candidate_email": "john.doe@example.com",
    "job_title": "Senior Backend Engineer",
    "transcript": [
      {
        "speaker": "ai",
        "text": "Hello John, let's begin...",
        "timestamp": "2026-01-31T10:05:00.000Z"
      },
      {
        "speaker": "candidate",
        "text": "Thank you, I'm excited...",
        "timestamp": "2026-01-31T10:05:10.000Z"
      }
    ],
    "overall_score": 0.78,
    "strengths": ["Strong Node.js knowledge", "Clear communication"],
    "weaknesses": ["Limited database optimization experience"],
    "cv_consistency_score": 0.85,
    "authenticity_risk": "low",
    "recommendation": "proceed",
    "report_data": {
      "technical_depth": "strong",
      "problem_solving": "good",
      "communication": "excellent"
    }
  },
  "observations": [
    {
      "agent_type": "consistency_checker",
      "observation": {
        "claim": "5 years Node.js experience",
        "verified": true
      },
      "timestamp": "2026-01-31T10:10:00.000Z"
    }
  ]
}
```

### List Interviews
```http
GET /interviews?status=completed&job_id=job-uuid&page=1&limit=20
Authorization: Bearer <token>

Response 200:
{
  "interviews": [
    {
      "id": "interview-1",
      "candidate_name": "John Doe",
      "candidate_email": "john.doe@example.com",
      "job_title": "Senior Backend Engineer",
      "status": "completed",
      "overall_score": 0.78,
      "recommendation": "proceed",
      "completed_at": "2026-01-31T10:20:00.000Z"
    }
  ]
}
```

---

## 6. Webhooks

### Create Webhook
```http
POST /webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "event_type": "interview.completed",
  "url": "https://yourapp.com/webhooks/interview-completed",
  "secret": "optional-webhook-secret"
}

Response 201:
{
  "message": "Webhook created successfully",
  "webhook": {
    "id": "webhook-uuid",
    "event_type": "interview.completed",
    "url": "https://yourapp.com/webhooks/interview-completed",
    "is_active": true
  }
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message here"
}
```

Common status codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (missing/invalid auth)
- `403` - Forbidden (quota exceeded)
- `404` - Not Found
- `500` - Internal Server Error

---

## Testing with cURL

### Register
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Company",
    "email": "test@company.com",
    "password": "SecurePass123!"
  }'
```

### Create Job
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Backend Engineer",
    "description": "We need a backend engineer",
    "required_skills": ["Node.js"],
    "language": "en"
  }'
```

---

## Next Steps for Integration

1. **Frontend should implement:**
   - Company registration/login flow
   - Job creation form
   - Candidate upload (with resume parsing)
   - Interview creation & invite sending
   - Interview interface (video + AI conversation)
   - Report viewing dashboard

2. **Backend will add (Phase 2):**
   - Real AI agent implementation
   - Video/audio streaming
   - GPT-4 Vision analysis
   - Text-to-Speech for AI voice
   - Background job processing
   - Email sending for invites

3. **Integration points:**
   - Use `/interviews/invite/:token` to load interview for candidates
   - Use WebSocket for real-time interview updates (coming in Phase 2)
   - Use `/interviews/:id/transcript` to send candidate responses
   - Poll `/interviews/:id` for AI questions during interview
