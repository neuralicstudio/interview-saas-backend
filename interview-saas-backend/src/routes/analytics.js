const express = require('express');
const { authenticateCompany } = require('../middleware/auth');
import AnalyticsService from '../services/AnalyticsService.js';
import Joi from 'joi';

const router = express.Router();

const dateRangeSchema = Joi.object({
  dateFrom: Joi.date().iso().optional(),
  dateTo: Joi.date().iso().optional(),
  period: Joi.string().valid('day', 'week', 'month').default('day'),
  limit: Joi.number().min(1).max(365).default(30)
});

/**
 * GET /api/analytics/overview
 * Get overview statistics
 */
router.get('/overview', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const overview = await AnalyticsService.getOverview(req.company.id, {
      dateFrom: value.dateFrom,
      dateTo: value.dateTo
    });

    res.json({ overview });
  } catch (error) {
    console.error('Get overview error:', error);
    res.status(500).json({ error: 'Failed to get overview' });
  }
});

/**
 * GET /api/analytics/trends
 * Get interview trends over time
 */
router.get('/trends', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const trends = await AnalyticsService.getInterviewTrends(
      req.company.id,
      value.period,
      value.limit
    );

    res.json({ trends, period: value.period });
  } catch (error) {
    console.error('Get trends error:', error);
    res.status(500).json({ error: 'Failed to get trends' });
  }
});

/**
 * GET /api/analytics/top-candidates
 * Get top performing candidates
 */
router.get('/top-candidates', authenticateCompany, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const candidates = await AnalyticsService.getTopCandidates(req.company.id, limit);

    res.json({ candidates });
  } catch (error) {
    console.error('Get top candidates error:', error);
    res.status(500).json({ error: 'Failed to get top candidates' });
  }
});

/**
 * GET /api/analytics/job-performance
 * Get job performance statistics
 */
router.get('/job-performance', authenticateCompany, async (req, res) => {
  try {
    const jobs = await AnalyticsService.getJobPerformance(req.company.id);

    res.json({ jobs });
  } catch (error) {
    console.error('Get job performance error:', error);
    res.status(500).json({ error: 'Failed to get job performance' });
  }
});

/**
 * GET /api/analytics/score-distribution
 * Get score distribution
 */
router.get('/score-distribution', authenticateCompany, async (req, res) => {
  try {
    const distribution = await AnalyticsService.getScoreDistribution(req.company.id);

    res.json({ distribution });
  } catch (error) {
    console.error('Get score distribution error:', error);
    res.status(500).json({ error: 'Failed to get score distribution' });
  }
});

/**
 * GET /api/analytics/skills
 * Get skills analysis
 */
router.get('/skills', authenticateCompany, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const skills = await AnalyticsService.getSkillsAnalysis(req.company.id, limit);

    res.json({ skills });
  } catch (error) {
    console.error('Get skills analysis error:', error);
    res.status(500).json({ error: 'Failed to get skills analysis' });
  }
});

/**
 * GET /api/analytics/costs
 * Get cost analysis
 */
router.get('/costs', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const costs = await AnalyticsService.getCostAnalysis(req.company.id, {
      dateFrom: value.dateFrom,
      dateTo: value.dateTo
    });

    res.json({ costs });
  } catch (error) {
    console.error('Get cost analysis error:', error);
    res.status(500).json({ error: 'Failed to get cost analysis' });
  }
});

/**
 * GET /api/analytics/status-breakdown
 * Get interview status breakdown
 */
router.get('/status-breakdown', authenticateCompany, async (req, res) => {
  try {
    const breakdown = await AnalyticsService.getStatusBreakdown(req.company.id);

    res.json({ breakdown });
  } catch (error) {
    console.error('Get status breakdown error:', error);
    res.status(500).json({ error: 'Failed to get status breakdown' });
  }
});

/**
 * GET /api/analytics/recommendations
 * Get recommendation breakdown
 */
router.get('/recommendations', authenticateCompany, async (req, res) => {
  try {
    const breakdown = await AnalyticsService.getRecommendationBreakdown(req.company.id);

    res.json({ breakdown });
  } catch (error) {
    console.error('Get recommendation breakdown error:', error);
    res.status(500).json({ error: 'Failed to get recommendation breakdown' });
  }
});

/**
 * GET /api/analytics/export
 * Export analytics data as CSV
 */
router.get('/export', authenticateCompany, async (req, res) => {
  try {
    const type = req.query.type || 'interviews';

    const csv = await AnalyticsService.exportToCSV(req.company.id, type);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-export.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

/**
 * GET /api/analytics/dashboard
 * Get complete dashboard data in one call
 */
router.get('/dashboard', authenticateCompany, async (req, res) => {
  try {
    const { error, value } = dateRangeSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Fetch all data in parallel for performance
    const [
      overview,
      trends,
      topCandidates,
      jobPerformance,
      scoreDistribution,
      statusBreakdown,
      recommendations,
      costs
    ] = await Promise.all([
      AnalyticsService.getOverview(req.company.id, { dateFrom: value.dateFrom, dateTo: value.dateTo }),
      AnalyticsService.getInterviewTrends(req.company.id, value.period, value.limit),
      AnalyticsService.getTopCandidates(req.company.id, 5),
      AnalyticsService.getJobPerformance(req.company.id),
      AnalyticsService.getScoreDistribution(req.company.id),
      AnalyticsService.getStatusBreakdown(req.company.id),
      AnalyticsService.getRecommendationBreakdown(req.company.id),
      AnalyticsService.getCostAnalysis(req.company.id, { dateFrom: value.dateFrom, dateTo: value.dateTo })
    ]);

    res.json({
      overview,
      trends,
      top_candidates: topCandidates,
      job_performance: jobPerformance,
      score_distribution: scoreDistribution,
      status_breakdown: statusBreakdown,
      recommendations,
      costs,
      generated_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

module.exports = router;  // ✅ NOT "export default router"
