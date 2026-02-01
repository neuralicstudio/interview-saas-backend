# 🏗️ INTERVIEW SAAS - ARCHITECTURE OVERVIEW

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         LOVABLE FRONTEND                        │
│  (React/Next.js - Built by you)                                │
│                                                                 │
│  Pages:                                                         │
│  • Company Dashboard                                            │
│  • Job Management                                               │
│  • Candidate Upload                                             │
│  • Interview Creation                                           │
│  • Live Interview Interface (video + AI chat)                   │
│  • Results & Reports                                            │
└────────────────────┬────────────────────────────────────────────┘
                     │ REST API / WebSocket
                     │ (HTTPS, JWT Auth)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXPRESS.JS BACKEND (BUILT!)                  │
│  Port: 3000                                                     │
│                                                                 │
│  Routes:                                                        │
│  ✅ /api/auth         - Register, Login, API Keys              │
│  ✅ /api/jobs         - Job CRUD operations                    │
│  ✅ /api/candidates   - Candidate management                   │
│  ✅ /api/interviews   - Interview sessions                     │
│  ✅ /api/rubrics      - AI-generated templates                 │
│  ✅ /api/webhooks     - Integration webhooks                   │
│                                                                 │
│  Middleware:                                                    │
│  • JWT Authentication                                           │
│  • API Key Authentication                                       │
│  • Rate Limiting (100 req/15min)                               │
│  • CORS, Helmet (security)                                      │
│  • Request logging                                              │
└────────────────────┬───────────────────┬────────────────────────┘
                     │                   │
                     ▼                   ▼
         ┌───────────────────┐  ┌──────────────────┐
         │   PostgreSQL DB    │  │  OpenAI GPT-4    │
         │                    │  │                  │
         │  Tables:           │  │  • Rubric Gen    │
         │  • companies       │  │  • Interview AI  │
         │  • jobs            │  │  • CV Analysis   │
         │  • candidates      │  │  • GPT-4 Vision  │
         │  • interviews      │  │  • Whisper STT   │
         │  • rubrics         │  └──────────────────┘
         │  • transcripts     │
         │  • observations    │
         │  • webhooks        │
         └───────────────────┘
```

---

## 🎭 Multi-Agent System (Phase 2)

```
                    ┌──────────────────────┐
                    │  INTERVIEW SESSION   │
                    │   (Real-time State)  │
                    └──────────┬───────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
    ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐
    │  INTERVIEWER    │ │ CONSISTENCY │ │ AUTHENTICITY │
    │     AGENT       │ │   CHECKER   │ │   SIGNAL     │
    │                 │ │             │ │              │
    │ • Asks questions│ │ • CV vs     │ │ • Response   │
    │ • Adapts flow   │ │   Answers   │ │   quality    │
    │ • Natural tone  │ │ • Flags     │ │ • Patterns   │
    └─────────────────┘ └─────────────┘ └──────────────┘
                │              │              │
                └──────────────┼──────────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
    ┌─────────────────┐ ┌─────────────┐ ┌──────────────┐
    │  STRESS         │ │   RUBRIC    │ │   REPORT     │
    │  MONITOR        │ │   BUILDER   │ │  SYNTHESIZER │
    │                 │ │             │ │              │
    │ • Pacing        │ │ • Questions │ │ • Summary    │
    │ • Reassurance   │ │   from JD   │ │ • Scores     │
    │ • Experience    │ │ • Multi-lng │ │ • Next steps │
    └─────────────────┘ └─────────────┘ └──────────────┘
```

---

## 🔄 Interview Flow

```
1. Company Creates Job
   │
   ├─→ AI generates rubric (questions, criteria)
   │
2. Company Adds Candidate
   │
   ├─→ Resume parsed (skills, experience)
   │
3. Company Creates Interview
   │
   ├─→ Invite link generated
   ├─→ Email sent to candidate
   │
4. Candidate Accesses Link
   │
   ├─→ Camera/mic permissions
   ├─→ Brief instructions
   │
5. Interview Starts
   │
   ├─→ AI asks warmup questions
   ├─→ Candidate responds (video + audio)
   ├─→ Real-time transcription (Whisper)
   ├─→ Video analysis (GPT-4 Vision)
   │
6. AI Adapts Questions
   │
   ├─→ Based on answers
   ├─→ CV verification
   ├─→ Scenario challenges
   ├─→ Depth probing
   │
7. Interview Completes
   │
   ├─→ All agents analyze
   ├─→ Report generated
   ├─→ Company notified
   │
8. Company Reviews Report
   │
   ├─→ Scores, strengths, weaknesses
   ├─→ Recommendation (proceed/reject)
   ├─→ Full transcript available
   │
9. Company Makes Decision
```

---

## 💾 Database Schema (Simplified)

```
companies
├── id (UUID)
├── email
├── subscription_tier (free/starter/growth/enterprise)
├── interviews_quota (50 default)
└── interviews_used (counter)

jobs
├── id (UUID)
├── company_id → companies
├── title
├── description
├── required_skills (JSON)
├── language (en/es/ar/hi/fr)
└── status (active/paused/closed)

rubrics (AI-generated)
├── id (UUID)
├── job_id → jobs
├── competencies (JSON) [Technical, Problem Solving, etc.]
├── question_bank (JSON) [warmup, scenario, depth...]
└── evaluation_criteria (JSON)

candidates
├── id (UUID)
├── email
├── full_name
├── resume_text
└── resume_parsed (JSON) [skills, experience]

interviews
├── id (UUID)
├── job_id → jobs
├── candidate_id → candidates
├── rubric_id → rubrics
├── status (scheduled/in_progress/completed)
├── transcript (JSON) [speaker, text, timestamp]
├── live_state (JSON) [stress_level, phase, flags]
├── overall_score (0.00-1.00)
├── strengths (JSON)
├── weaknesses (JSON)
├── authenticity_risk (low/medium/high)
└── recommendation (proceed/reject/unclear)

interview_invites
├── id (UUID)
├── interview_id → interviews
├── token (unique)
└── expires_at (7 days)

agent_observations
├── id (UUID)
├── interview_id → interviews
├── agent_type (consistency/authenticity/stress)
├── observation (JSON)
└── timestamp
```

---

## 🔐 Authentication Flow

```
Option 1: JWT (Web/Mobile)
──────────────────────────
POST /auth/register or /auth/login
    │
    ├─→ Returns JWT token
    │
Use in requests:
    │
    └─→ Authorization: Bearer <token>

Option 2: API Keys (Integrations)
──────────────────────────────────
POST /auth/api-keys
    │
    ├─→ Returns API key (shown once)
    │
Use in requests:
    │
    └─→ x-api-key: <api_key>
```

---

## 📈 Scaling Architecture (Future)

```
                    ┌──────────────┐
                    │   FRONTEND   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │ Load Balancer│
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ▼                 ▼                 ▼
    ┌────────┐        ┌────────┐        ┌────────┐
    │Backend │        │Backend │        │Backend │
    │  #1    │        │  #2    │        │  #3    │
    └───┬────┘        └───┬────┘        └───┬────┘
        │                 │                 │
        └─────────────────┼─────────────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
    ┌────────┐      ┌────────┐      ┌────────┐
    │Postgres│      │ Redis  │      │  S3    │
    │  DB    │      │ Queue  │      │ Files  │
    └────────┘      └────────┘      └────────┘
```

---

## 🎯 What's Built vs. What's Next

### ✅ BUILT (Phase 1)
- Complete REST API (35+ endpoints)
- Database schema (12 tables)
- Authentication (JWT + API keys)
- Job management
- Candidate management
- Interview creation & invites
- Transcript storage
- Quota system
- Webhooks
- Documentation

### 🚧 TO BUILD (Phase 2)
- AI agent implementation
- Real-time WebSocket
- Video/audio integration (Daily.co)
- GPT-4 Vision analysis
- Whisper speech-to-text
- ElevenLabs text-to-speech
- Background job processing
- Email notifications
- Report generation
- Resume parsing (advanced)

### 💡 FUTURE (Phase 3)
- Mobile apps
- ATS integrations (Greenhouse, Lever)
- Slack/Teams notifications
- Multi-company analytics
- Custom branding
- White-label option
- Interview recording storage
- Advanced analytics dashboard

---

## 💵 Pricing Strategy

```
FREE TIER
├── 50 interviews/month
├── Basic features
└── Email support

STARTER ($299/mo)
├── 200 interviews/month
├── All features
├── API access
└── Priority support

GROWTH ($799/mo)
├── 1,000 interviews/month
├── Custom branding
├── Webhooks
├── Dedicated account manager
└── SLA

ENTERPRISE (Custom)
├── Unlimited interviews
├── White-label
├── On-premise option
├── Custom integrations
└── 24/7 support
```

---

## 🎬 Go-to-Market Timeline

```
Week 1-2: Backend Complete (DONE! ✅)
Week 3-4: Frontend with Lovable
Week 5-6: AI Agents Implementation
Week 7: Testing & Polish
Week 8: Beta Launch (5 customers)
Month 2: Product Hunt Launch
Month 3: Scale to 20 customers
Month 4: Hit $18K target 🎯
```

**You're here: Week 1-2 COMPLETE! 🚀**

---

Ready to deploy or build Phase 2?
