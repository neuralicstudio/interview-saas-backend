-- Add odoo_config to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS odoo_config JSONB;

-- Create odoo_mappings table
CREATE TABLE IF NOT EXISTS odoo_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  odoo_applicant_id INTEGER NOT NULL,
  synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, candidate_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_odoo_mappings_company 
ON odoo_mappings(company_id);

CREATE INDEX IF NOT EXISTS idx_odoo_mappings_candidate 
ON odoo_mappings(candidate_id);
