import express from 'express';
import { query } from '../db/index.js';
import { authenticateCompany } from '../middleware/auth.js';
import Joi from 'joi';

const router = express.Router();

const webhookSchema = Joi.object({
  event_type: Joi.string().valid('interview.completed', 'candidate.screened', 'interview.started').required(),
  url: Joi.string().uri().required(),
  secret: Joi.string().optional()
});

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = webhookSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { event_type, url, secret } = value;
    
    const result = await query(`
      INSERT INTO webhooks (company_id, event_type, url, secret)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [req.company.id, event_type, url, secret]);
    
    res.status(201).json({
      message: 'Webhook created successfully',
      webhook: result.rows[0]
    });
  } catch (error) {
    console.error('Create webhook error:', error);
    res.status(500).json({ error: 'Failed to create webhook' });
  }
});

/**
 * GET /api/webhooks
 * List all webhooks for company
 */
router.get('/', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM webhooks WHERE company_id = $1 ORDER BY created_at DESC',
      [req.company.id]
    );
    
    res.json({ webhooks: result.rows });
  } catch (error) {
    console.error('List webhooks error:', error);
    res.status(500).json({ error: 'Failed to list webhooks' });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
router.delete('/:id', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM webhooks WHERE id = $1 AND company_id = $2 RETURNING id',
      [req.params.id, req.company.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }
    
    res.json({ message: 'Webhook deleted successfully' });
  } catch (error) {
    console.error('Delete webhook error:', error);
    res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

export default router;
