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

-- Video Frame Analysis (behavioral signals only)
CREATE TABLE video_frames (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    analysis JSONB NOT NULL, -- GPT-4 Vision output: eye contact, confidence, screen looking
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Odoo Integration
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS odoo_config JSONB;

CREATE TABLE IF NOT EXISTS odoo_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  odoo_applicant_id INTEGER NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
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

-- Indexes for performance
CREATE INDEX idx_companies_email ON companies(email);
CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_interviews_company_id ON interviews(company_id);
CREATE INDEX idx_interviews_candidate_id ON interviews(candidate_id);
CREATE INDEX idx_interviews_status ON interviews(status);
CREATE INDEX idx_interviews_created_at ON interviews(created_at DESC);
CREATE INDEX idx_candidates_email ON candidates(email);
CREATE INDEX idx_agent_observations_interview_id ON agent_observations(interview_id);
CREATE INDEX idx_video_frames_interview_id ON video_frames(interview_id);
CREATE INDEX idx_usage_logs_company_id ON usage_logs(company_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_interviews_updated_at BEFORE UPDATE ON interviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
