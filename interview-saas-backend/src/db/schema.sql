-- Interview SaaS Database Schema
-- Production-ready schema with all tables for multi-agent interview system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies Table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    company_size VARCHAR(50),
    website VARCHAR(255),
    logo_url TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'free', -- free, starter, growth, enterprise
    subscription_status VARCHAR(50) DEFAULT 'active', -- active, cancelled, suspended
    interviews_quota INTEGER DEFAULT 50,
    interviews_used INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys for companies
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Job Positions
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    department VARCHAR(100),
    seniority_level VARCHAR(50), -- junior, mid, senior, lead, principal
    location VARCHAR(255),
    job_type VARCHAR(50), -- remote, hybrid, onsite
    required_skills JSONB, -- ["Node.js", "PostgreSQL", "System Design"]
    nice_to_have_skills JSONB,
    language VARCHAR(10) DEFAULT 'en', -- en, es, ar, hi, fr
    status VARCHAR(50) DEFAULT 'active', -- active, paused, closed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview Rubrics (AI-generated from job description)
CREATE TABLE rubrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    version INTEGER DEFAULT 1,
    competencies JSONB NOT NULL, -- [{"name": "Node.js", "weight": 0.3, "must_have": true}]
    question_bank JSONB NOT NULL, -- AI-generated questions organized by phase
    evaluation_criteria JSONB NOT NULL,
    created_by VARCHAR(50) DEFAULT 'ai', -- ai or manual
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Candidates
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    linkedin_url TEXT,
    resume_url TEXT,
    resume_text TEXT, -- Extracted text from PDF
    resume_parsed JSONB, -- Structured data: skills, experience, education
    source VARCHAR(100), -- company_direct, job_board, referral
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(email)
);

-- Interviews
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    rubric_id UUID REFERENCES rubrics(id) ON DELETE SET NULL,
    
    -- Interview Settings
    language VARCHAR(10) DEFAULT 'en',
    duration_minutes INTEGER DEFAULT 15,
    
    -- Interview State
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
    current_phase VARCHAR(50), -- warmup, claim_verification, scenario, depth, reflection
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Real-time State (stored as JSONB for flexibility)
    live_state JSONB DEFAULT '{
        "stress_level": "low",
        "depth_scores": {},
        "flags": [],
        "phase_index": 0
    }'::jsonb,
    
    -- Transcript & Media
    transcript JSONB DEFAULT '[]'::jsonb, -- [{speaker: "ai", text: "...", timestamp: "..."}]
    video_metadata JSONB, -- Behavioral signals, NOT video files
    
    -- Evaluation Results
    overall_score DECIMAL(3,2), -- 0.00 to 1.00
    strengths JSONB,
    weaknesses JSONB,
    cv_consistency_score DECIMAL(3,2),
    authenticity_risk VARCHAR(50), -- low, medium, high
    
    -- Final Output
    report_generated BOOLEAN DEFAULT false,
    report_data JSONB,
    recommendation VARCHAR(50), -- proceed, reject, unclear
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Interview Invitations/Links
CREATE TABLE interview_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP,
    accessed_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent Observations (stored separately for analysis)
CREATE TABLE agent_observations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    agent_type VARCHAR(50) NOT NULL, -- consistency_checker, authenticity_signal, stress_monitor
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observation JSONB NOT NULL, -- Agent-specific output
    severity VARCHAR(20), -- info, warning, critical
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhook Logs
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL, -- success, failed
  response_status INTEGER,
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON webhook_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_sent_at ON webhook_logs(sent_at DESC);

-- Video Frame Analysis (behavioral signals only)
CREATE TABLE video_frames (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    analysis JSONB NOT NULL, -- GPT-4 Vision output: eye contact, confidence, screen looking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vision Analysis
CREATE TABLE IF NOT EXISTS vision_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  frames_analyzed INTEGER NOT NULL,
  analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(interview_id)
);

CREATE INDEX IF NOT EXISTS idx_vision_analyses_interview ON vision_analyses(interview_id);
CREATE INDEX IF NOT EXISTS idx_vision_analyses_company ON vision_analyses(company_id);

-- Odoo Integration
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS odoo_config JSONB;

CREATE TABLE IF NOT EXISTS odoo_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  odoo_applicant_id INTEGER NOT NULL,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_odoo_mappings_company ON odoo_mappings(company_id);
CREATE INDEX IF NOT EXISTS idx_odoo_mappings_candidate ON odoo_mappings(candidate_id);

-- Usage Tracking (for billing)
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    interview_id UUID REFERENCES interviews(id) ON DELETE SET NULL,
    event_type VARCHAR(50), -- interview_started, interview_completed, api_call
    credits_used INTEGER DEFAULT 1,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Webhooks (for integrations)
CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    event_type VARCHAR(50), -- interview.completed, candidate.screened
    url TEXT NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- HR Supervision Features
CREATE TABLE IF NOT EXISTS interview_observers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  hr_user_id UUID NOT NULL,
  hr_name VARCHAR(255) NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  was_visible BOOLEAN DEFAULT false,
  spoke_during_interview BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hr_interview_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  hr_user_id UUID NOT NULL,
  note TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_observers_interview ON interview_observers(interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_observers_hr_user ON interview_observers(hr_user_id);
CREATE INDEX IF NOT EXISTS idx_hr_notes_interview ON hr_interview_notes(interview_id);

ALTER TABLE interviews
ADD COLUMN IF NOT EXISTS hr_supervision_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hr_observers_count INTEGER DEFAULT 0;

-- Authentication Tables
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Ensure companies table has password_hash
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Indexes for performance
CREATE INDEX idx_companies_email ON companies(email);
CREATE INDEX idx_interviews_status ON interviews(status);
