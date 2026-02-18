-- HR Observer tracking
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

-- HR private notes
CREATE TABLE IF NOT EXISTS hr_interview_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  hr_user_id UUID NOT NULL,
  note TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_interview_observers_interview 
ON interview_observers(interview_id);

CREATE INDEX IF NOT EXISTS idx_interview_observers_hr_user 
ON interview_observers(hr_user_id);

CREATE INDEX IF NOT EXISTS idx_hr_notes_interview 
ON hr_interview_notes(interview_id);

-- Add column to interviews table
ALTER TABLE interviews
ADD COLUMN IF NOT EXISTS hr_supervision_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hr_observers_count INTEGER DEFAULT 0;
