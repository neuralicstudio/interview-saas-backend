const express = require('express');
const { authenticateCompany } = require('../middleware/auth');
import { query } from '../db/index.js';
import WebhookService from '../services/WebhookService.js';
import Joi from 'joi';

const router = express.Router();

const createWebhookSchema = Joi.object({
  url: Joi.string().uri().required(),
  event: Joi.string().required(),
  description: Joi.string().max(500).optional()
});

/**
 * GET /api/webhooks/events
 * Get available webhook events
 */
router.get('/events', authenticateCompany, async (req, res) => {
  try {
    const events = WebhookService.getAvailableEvents();
    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

/**
 * POST /api/webhooks
 * Create a new webhook
 */
router.post('/', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = createWebhookSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { url, event, description } = value;

    // Verify event is valid
    const validEvents = WebhookService.getAvailableEvents().map(e => e.event);
    if (!validEvents.includes(event)) {
      return res.status(400).json({ 
        error: 'Invalid event',
        available_events: validEvents
      });
    }

    const result = await query(`
      INSERT INTO webhooks (company_id, url, event, description, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
    `, [req.company.id, url, event, description]);

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
 * List all webhooks
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
      'DELETE FROM webhooks WHERE id = $1 AND company_id = $2 RETURNING *',
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

/**
 * PATCH /api/webhooks/:id/toggle
 * Toggle webhook active status
 */
router.patch('/:id/toggle', authenticateCompany, async (req, res) => {
  try {
    const result = await query(`
      UPDATE webhooks
      SET is_active = NOT is_active
      WHERE id = $1 AND company_id = $2
      RETURNING *
    `, [req.params.id, req.company.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    res.json({
      message: 'Webhook status updated',
      webhook: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle webhook error:', error);
    res.status(500).json({ error: 'Failed to toggle webhook' });
  }
});

/**
 * POST /api/webhooks/:id/test
 * Test a webhook
 */
router.post('/:id/test', authenticateCompany, async (req, res) => {
  try {
    const webhookResult = await query(
      'SELECT * FROM webhooks WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );

    if (webhookResult.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const webhook = webhookResult.rows[0];

    // Send test payload
    const testPayload = {
      event: webhook.event,
      timestamp: new Date().toISOString(),
      data: { test: true, message: 'This is a test webhook' },
      webhook_id: webhook.id
    };

    await WebhookService.sendWebhook(webhook.url, testPayload);

    res.json({ message: 'Test webhook sent successfully' });
  } catch (error) {
    console.error('Test webhook error:', error);
    res.status(500).json({
      error: 'Failed to send test webhook',
      message: error.message
    });
  }
});

/**
 * GET /api/webhooks/:id/logs
 * Get webhook delivery logs
 */
router.get('/:id/logs', authenticateCompany, async (req, res) => {
  try {
    // Verify webhook belongs to company
    const webhookCheck = await query(
      'SELECT * FROM webhooks WHERE id = $1 AND company_id = $2',
      [req.params.id, req.company.id]
    );

    if (webhookCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    const limit = parseInt(req.query.limit) || 50;

    const result = await query(`
      SELECT * FROM webhook_logs
      WHERE webhook_id = $1
      ORDER BY sent_at DESC
      LIMIT $2
    `, [req.params.id, limit]);

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Get webhook logs error:', error);
    res.status(500).json({ error: 'Failed to get webhook logs' });
  }
});

export default router;
