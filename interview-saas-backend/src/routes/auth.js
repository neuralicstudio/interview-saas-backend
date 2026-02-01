import express from 'express';
import { query } from '../db/index.js';
import { generateToken, hashPassword, comparePassword, generateApiKey, hashApiKey } from '../utils/auth.js';
import { authenticateCompany } from '../middleware/auth.js';
import Joi from 'joi';

const router = express.Router();

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  industry: Joi.string().max(100).optional(),
  company_size: Joi.string().max(50).optional(),
  website: Joi.string().uri().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

/**
 * POST /api/auth/register
 * Register a new company account
 */
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { name, email, password, industry, company_size, website } = value;
    
    // Check if company already exists
    const existing = await query('SELECT id FROM companies WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const password_hash = await hashPassword(password);
    
    // Create company
    const result = await query(`
      INSERT INTO companies (name, email, password_hash, industry, company_size, website)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, subscription_tier, interviews_quota
    `, [name, email, password_hash, industry, company_size, website]);
    
    const company = result.rows[0];
    const token = generateToken(company.id);
    
    res.status(201).json({
      message: 'Company registered successfully',
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        subscription_tier: company.subscription_tier,
        interviews_quota: company.interviews_quota
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Company login
 */
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { email, password } = value;
    
    // Find company
    const result = await query(`
      SELECT id, name, email, password_hash, subscription_tier, interviews_quota, interviews_used
      FROM companies WHERE email = $1
    `, [email]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const company = result.rows[0];
    
    // Verify password
    const isValid = await comparePassword(password, company.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(company.id);
    
    res.json({
      message: 'Login successful',
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        subscription_tier: company.subscription_tier,
        interviews_quota: company.interviews_quota,
        interviews_used: company.interviews_used
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * GET /api/auth/me
 * Get current company info
 */
router.get('/me', authenticateCompany, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, email, industry, company_size, website, 
             subscription_tier, subscription_status, 
             interviews_quota, interviews_used, created_at
      FROM companies WHERE id = $1
    `, [req.company.id]);
    
    res.json({ company: result.rows[0] });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ error: 'Failed to get company info' });
  }
});

/**
 * POST /api/auth/api-keys
 * Generate new API key
 */
router.post('/api-keys', authenticateCompany, async (req, res) => {
  try {
    const { name } = req.body;
    const apiKey = generateApiKey();
    const keyHash = await hashApiKey(apiKey);
    
    const result = await query(`
      INSERT INTO api_keys (company_id, key_hash, name)
      VALUES ($1, $2, $3)
      RETURNING id, name, created_at
    `, [req.company.id, keyHash, name || 'Default API Key']);
    
    res.status(201).json({
      message: 'API key created successfully',
      api_key: apiKey, // Only shown once
      key_info: result.rows[0]
    });
  } catch (error) {
    console.error('API key creation error:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

/**
 * GET /api/auth/api-keys
 * List all API keys for company
 */
router.get('/api-keys', authenticateCompany, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, last_used_at, created_at, expires_at, is_active
      FROM api_keys WHERE company_id = $1
      ORDER BY created_at DESC
    `, [req.company.id]);
    
    res.json({ api_keys: result.rows });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Failed to list API keys' });
  }
});

/**
 * DELETE /api/auth/api-keys/:id
 * Revoke an API key
 */
router.delete('/api-keys/:id', authenticateCompany, async (req, res) => {
  try {
    await query(`
      UPDATE api_keys 
      SET is_active = false 
      WHERE id = $1 AND company_id = $2
    `, [req.params.id, req.company.id]);
    
    res.json({ message: 'API key revoked successfully' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

export default router;
