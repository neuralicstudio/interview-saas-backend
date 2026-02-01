import { verifyToken } from '../utils/auth.js';
import { query } from '../db/index.js';

/**
 * Middleware to authenticate company JWT tokens
 */
export const authenticateCompany = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    
    // Verify company exists
    const result = await query(
      'SELECT id, name, email, subscription_tier FROM companies WHERE id = $1',
      [decoded.companyId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    req.company = result.rows[0];
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Middleware to authenticate API keys
 */
export const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({ error: 'API key required' });
    }
    
    // Find API key (note: in production, hash the key before lookup)
    const result = await query(`
      SELECT ak.*, c.id as company_id, c.name, c.subscription_tier
      FROM api_keys ak
      JOIN companies c ON ak.company_id = c.id
      WHERE ak.is_active = true 
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    
    const keyData = result.rows[0];
    
    // Update last_used_at
    await query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [keyData.id]
    );
    
    req.company = {
      id: keyData.company_id,
      name: keyData.name,
      subscription_tier: keyData.subscription_tier
    };
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'API key authentication failed' });
  }
};

/**
 * Middleware to check subscription limits
 */
export const checkQuota = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT interviews_quota, interviews_used FROM companies WHERE id = $1',
      [req.company.id]
    );
    
    const { interviews_quota, interviews_used } = result.rows[0];
    
    if (interviews_used >= interviews_quota) {
      return res.status(403).json({ 
        error: 'Interview quota exceeded',
        quota: interviews_quota,
        used: interviews_used
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to check quota' });
  }
};
