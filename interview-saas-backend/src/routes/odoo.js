const express = require('express');
const { authenticateCompany } = require('../middleware/auth');
const { query } = require('../db/index.js');  // ✅ Fixed
const OdooService = require('../services/OdooService.js');  // ✅ Fixed
const Joi = require('joi');  // ✅ Fixed

const router = express.Router();

const odooConfigSchema = Joi.object({
  url: Joi.string().uri().required(),
  database: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().required()
});

/**
 * POST /api/odoo/configure
 * Configure Odoo integration
 */
router.post('/configure', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = odooConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Test connection first
    await OdooService.testConnection(value);

    // Save configuration
    await query(`
      UPDATE companies
      SET odoo_config = $1, updated_at = NOW()
      WHERE id = $2
    `, [JSON.stringify(value), req.company.id]);

    res.json({
      message: 'Odoo integration configured successfully',
      status: 'connected'
    });
  } catch (error) {
    console.error('Configure Odoo error:', error);
    res.status(500).json({
      error: 'Failed to configure Odoo',
      message: error.message
    });
  }
});

/**
 * POST /api/odoo/test
 * Test Odoo connection
 */
router.post('/test', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = odooConfigSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    await OdooService.testConnection(value);

    res.json({
      message: 'Odoo connection successful',
      status: 'connected'
    });
  } catch (error) {
    console.error('Test Odoo connection error:', error);
    res.status(500).json({
      error: 'Connection test failed',
      message: error.message
    });
  }
});

/**
 * GET /api/odoo/applicants
 * Get applicants from Odoo
 */
router.get('/applicants', authenticateCompany, async (req, res) => {
  try {
    const { job_id, stage } = req.query;

    const applicants = await OdooService.getApplicants(req.company.id, {
      job_id,
      stage
    });

    res.json({ applicants });
  } catch (error) {
    console.error('Get Odoo applicants error:', error);
    res.status(500).json({
      error: 'Failed to get applicants',
      message: error.message
    });
  }
});

/**
 * POST /api/odoo/import-applicant
 * Import applicant from Odoo
 */
router.post('/import-applicant', authenticateCompany, async (req, res) => {
  try {
    const { odoo_applicant_id } = req.body;

    if (!odoo_applicant_id) {
      return res.status(400).json({ error: 'odoo_applicant_id is required' });
    }

    const candidate = await OdooService.importApplicant(
      req.company.id,
      odoo_applicant_id
    );

    res.json({
      message: 'Applicant imported successfully',
      candidate
    });
  } catch (error) {
    console.error('Import applicant error:', error);
    res.status(500).json({
      error: 'Failed to import applicant',
      message: error.message
    });
  }
});

/**
 * POST /api/odoo/push-results
 * Push interview results to Odoo
 */
router.post('/push-results', authenticateCompany, async (req, res) => {
  try {
    const { interview_id } = req.body;

    if (!interview_id) {
      return res.status(400).json({ error: 'interview_id is required' });
    }

    await OdooService.pushInterviewResults(req.company.id, interview_id);

    res.json({
      message: 'Interview results pushed to Odoo successfully'
    });
  } catch (error) {
    console.error('Push results error:', error);
    res.status(500).json({
      error: 'Failed to push results',
      message: error.message
    });
  }
});

/**
 * GET /api/odoo/jobs
 * Get jobs from Odoo
 */
router.get('/jobs', authenticateCompany, async (req, res) => {
  try {
    const jobs = await OdooService.getJobs(req.company.id);

    res.json({ jobs });
  } catch (error) {
    console.error('Get Odoo jobs error:', error);
    res.status(500).json({
      error: 'Failed to get jobs',
      message: error.message
    });
  }
});

/**
 * POST /api/odoo/sync-job
 * Sync job from Odoo
 */
router.post('/sync-job', authenticateCompany, async (req, res) => {
  try {
    const { odoo_job_id } = req.body;

    if (!odoo_job_id) {
      return res.status(400).json({ error: 'odoo_job_id is required' });
    }

    const job = await OdooService.syncJob(req.company.id, odoo_job_id);

    res.json({
      message: 'Job synced successfully',
      job
    });
  } catch (error) {
    console.error('Sync job error:', error);
    res.status(500).json({
      error: 'Failed to sync job',
      message: error.message
    });
  }
});

/**
 * GET /api/odoo/status
 * Check Odoo integration status
 */
router.get('/status', authenticateCompany, async (req, res) => {
  try {
    const result = await query(
      'SELECT odoo_config FROM companies WHERE id = $1',
      [req.company.id]
    );

    const isConfigured = !!result.rows[0]?.odoo_config;

    res.json({
      configured: isConfigured,
      status: isConfigured ? 'connected' : 'not_configured'
    });
  } catch (error) {
    console.error('Get Odoo status error:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

/**
 * DELETE /api/odoo/disconnect
 * Disconnect Odoo integration
 */
router.delete('/disconnect', authenticateCompany, async (req, res) => {
  try {
    await query(`
      UPDATE companies
      SET odoo_config = NULL, updated_at = NOW()
      WHERE id = $1
    `, [req.company.id]);

    res.json({
      message: 'Odoo integration disconnected successfully'
    });
  } catch (error) {
    console.error('Disconnect Odoo error:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

module.exports = router;
