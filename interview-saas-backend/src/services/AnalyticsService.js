import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Analytics Service
 * Provides comprehensive analytics and metrics
 */
export class AnalyticsService {
  /**
   * Get overview statistics for a company
   * @param {String} companyId - Company ID
   * @param {Object} options - Filter options (dateFrom, dateTo)
   */
  async getOverview(companyId, options = {}) {
    try {
      const { dateFrom, dateTo } = options;
      const dateFilter = this.buildDateFilter(dateFrom, dateTo);

      // Total interviews
      const totalInterviews = await query(`
        SELECT COUNT(*) as count
        FROM interviews
        WHERE company_id = $1 ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Completed interviews
      const completedInterviews = await query(`
        SELECT COUNT(*) as count
        FROM interviews
        WHERE company_id = $1 AND status = 'completed' ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Pending interviews
      const pendingInterviews = await query(`
        SELECT COUNT(*) as count
        FROM interviews
        WHERE company_id = $1 AND status = 'pending' ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Average score
      const avgScore = await query(`
        SELECT AVG(overall_score) as avg_score
        FROM interview_reports
        WHERE company_id = $1 ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Pass rate (overall_score >= 0.7)
      const passRate = await query(`
        SELECT 
          COUNT(CASE WHEN overall_score >= 0.7 THEN 1 END)::float / NULLIF(COUNT(*), 0) as pass_rate
        FROM interview_reports
        WHERE company_id = $1 ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Completion rate
      const completionRate = await query(`
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::float / NULLIF(COUNT(*), 0) as completion_rate
        FROM interviews
        WHERE company_id = $1 ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Total candidates
      const totalCandidates = await query(`
        SELECT COUNT(DISTINCT candidate_id) as count
        FROM interviews
        WHERE company_id = $1 ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      // Active jobs
      const activeJobs = await query(`
        SELECT COUNT(*) as count
        FROM jobs
        WHERE company_id = $1 AND is_active = true ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      return {
        total_interviews: parseInt(totalInterviews.rows[0].count),
        completed_interviews: parseInt(completedInterviews.rows[0].count),
        pending_interviews: parseInt(pendingInterviews.rows[0].count),
        average_score: parseFloat(avgScore.rows[0].avg_score || 0).toFixed(2),
        pass_rate: parseFloat(passRate.rows[0].pass_rate || 0).toFixed(2),
        completion_rate: parseFloat(completionRate.rows[0].completion_rate || 0).toFixed(2),
        total_candidates: parseInt(totalCandidates.rows[0].count),
        active_jobs: parseInt(activeJobs.rows[0].count)
      };
    } catch (error) {
      logger.error('Get overview error:', error);
      throw error;
    }
  }

  /**
   * Get interview trends over time
   * @param {String} companyId - Company ID
   * @param {String} period - 'day', 'week', or 'month'
   * @param {Number} limit - Number of periods to return
   */
  async getInterviewTrends(companyId, period = 'day', limit = 30) {
    try {
      let groupBy;
      switch (period) {
        case 'day':
          groupBy = "DATE_TRUNC('day', created_at)";
          break;
        case 'week':
          groupBy = "DATE_TRUNC('week', created_at)";
          break;
        case 'month':
          groupBy = "DATE_TRUNC('month', created_at)";
          break;
        default:
          groupBy = "DATE_TRUNC('day', created_at)";
      }

      const result = await query(`
        SELECT 
          ${groupBy} as period,
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          AVG(CASE WHEN ir.overall_score IS NOT NULL THEN ir.overall_score END) as avg_score
        FROM interviews i
        LEFT JOIN interview_reports ir ON i.id = ir.interview_id
        WHERE i.company_id = $1
        GROUP BY period
        ORDER BY period DESC
        LIMIT $2
      `, [companyId, limit]);

      return result.rows.map(row => ({
        period: row.period,
        total: parseInt(row.total),
        completed: parseInt(row.completed),
        pending: parseInt(row.pending),
        avg_score: parseFloat(row.avg_score || 0).toFixed(2)
      })).reverse();
    } catch (error) {
      logger.error('Get trends error:', error);
      throw error;
    }
  }

  /**
   * Get top performing candidates
   * @param {String} companyId - Company ID
   * @param {Number} limit - Number of candidates to return
   */
  async getTopCandidates(companyId, limit = 10) {
    try {
      const result = await query(`
        SELECT 
          c.id,
          c.full_name,
          c.email,
          ir.overall_score,
          ir.recommendation,
          j.title as job_title,
          i.completed_at
        FROM interview_reports ir
        JOIN interviews i ON ir.interview_id = i.id
        JOIN candidates c ON i.candidate_id = c.id
        JOIN jobs j ON i.job_id = j.id
        WHERE ir.company_id = $1
        ORDER BY ir.overall_score DESC
        LIMIT $2
      `, [companyId, limit]);

      return result.rows.map(row => ({
        candidate_id: row.id,
        name: row.full_name,
        email: row.email,
        score: parseFloat(row.overall_score).toFixed(2),
        recommendation: row.recommendation,
        job_title: row.job_title,
        completed_at: row.completed_at
      }));
    } catch (error) {
      logger.error('Get top candidates error:', error);
      throw error;
    }
  }

  /**
   * Get job performance statistics
   * @param {String} companyId - Company ID
   */
  async getJobPerformance(companyId) {
    try {
      const result = await query(`
        SELECT 
          j.id,
          j.title,
          COUNT(i.id) as total_interviews,
          COUNT(CASE WHEN i.status = 'completed' THEN 1 END) as completed_interviews,
          AVG(ir.overall_score) as avg_score,
          COUNT(CASE WHEN ir.recommendation = 'proceed' THEN 1 END) as recommended_count
        FROM jobs j
        LEFT JOIN interviews i ON j.id = i.job_id
        LEFT JOIN interview_reports ir ON i.id = ir.interview_id
        WHERE j.company_id = $1
        GROUP BY j.id, j.title
        ORDER BY total_interviews DESC
      `, [companyId]);

      return result.rows.map(row => ({
        job_id: row.id,
        title: row.title,
        total_interviews: parseInt(row.total_interviews),
        completed_interviews: parseInt(row.completed_interviews),
        avg_score: parseFloat(row.avg_score || 0).toFixed(2),
        recommended_count: parseInt(row.recommended_count || 0),
        completion_rate: row.total_interviews > 0 
          ? (row.completed_interviews / row.total_interviews * 100).toFixed(1)
          : 0
      }));
    } catch (error) {
      logger.error('Get job performance error:', error);
      throw error;
    }
  }

  /**
   * Get score distribution
   * @param {String} companyId - Company ID
   */
  async getScoreDistribution(companyId) {
    try {
      const result = await query(`
        SELECT 
          CASE 
            WHEN overall_score >= 0.9 THEN 'excellent'
            WHEN overall_score >= 0.7 THEN 'good'
            WHEN overall_score >= 0.5 THEN 'average'
            ELSE 'below_average'
          END as score_range,
          COUNT(*) as count
        FROM interview_reports
        WHERE company_id = $1
        GROUP BY score_range
        ORDER BY 
          CASE score_range
            WHEN 'excellent' THEN 1
            WHEN 'good' THEN 2
            WHEN 'average' THEN 3
            ELSE 4
          END
      `, [companyId]);

      return result.rows.map(row => ({
        range: row.score_range,
        count: parseInt(row.count)
      }));
    } catch (error) {
      logger.error('Get score distribution error:', error);
      throw error;
    }
  }

  /**
   * Get skills analysis
   * @param {String} companyId - Company ID
   * @param {Number} limit - Number of skills to return
   */
  async getSkillsAnalysis(companyId, limit = 20) {
    try {
      const result = await query(`
        SELECT 
          skill,
          COUNT(*) as frequency,
          AVG(ir.overall_score) as avg_score_with_skill
        FROM (
          SELECT 
            i.id,
            jsonb_array_elements_text(r.competencies) as skill
          FROM interviews i
          JOIN interview_rubrics r ON i.job_id = r.job_id
          WHERE i.company_id = $1 AND r.is_active = true
        ) skills
        LEFT JOIN interviews i ON i.id = skills.id
        LEFT JOIN interview_reports ir ON i.id = ir.interview_id
        GROUP BY skill
        ORDER BY frequency DESC
        LIMIT $2
      `, [companyId, limit]);

      return result.rows.map(row => ({
        skill: row.skill,
        frequency: parseInt(row.frequency),
        avg_score: parseFloat(row.avg_score_with_skill || 0).toFixed(2)
      }));
    } catch (error) {
      logger.error('Get skills analysis error:', error);
      throw error;
    }
  }

  /**
   * Get cost analysis (API usage estimation)
   * @param {String} companyId - Company ID
   * @param {Object} options - Filter options
   */
  async getCostAnalysis(companyId, options = {}) {
    try {
      const { dateFrom, dateTo } = options;
      const dateFilter = this.buildDateFilter(dateFrom, dateTo);

      const result = await query(`
        SELECT 
          COUNT(*) as total_interviews,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_interviews,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as billable_interviews
        FROM interviews
        WHERE company_id = $1 ${dateFilter.clause}
      `, [companyId, ...dateFilter.params]);

      const data = result.rows[0];
      const completedCount = parseInt(data.completed_interviews);

      // Cost estimation (based on our earlier calculations)
      const costPerInterview = {
        ai_thinking: 0.26,      // GPT-4
        tts_voice: 0.03,        // Text-to-speech
        whisper: 0.06,          // Speech-to-text
        resume_parsing: 0.02    // Resume parser
      };

      const totalAICost = completedCount * (
        costPerInterview.ai_thinking + 
        costPerInterview.tts_voice + 
        costPerInterview.whisper
      );

      return {
        total_interviews: parseInt(data.total_interviews),
        completed_interviews: completedCount,
        estimated_ai_cost: totalAICost.toFixed(2),
        cost_per_interview: (
          costPerInterview.ai_thinking + 
          costPerInterview.tts_voice + 
          costPerInterview.whisper
        ).toFixed(2),
        breakdown: costPerInterview
      };
    } catch (error) {
      logger.error('Get cost analysis error:', error);
      throw error;
    }
  }

  /**
   * Get interview status breakdown
   * @param {String} companyId - Company ID
   */
  async getStatusBreakdown(companyId) {
    try {
      const result = await query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM interviews
        WHERE company_id = $1
        GROUP BY status
      `, [companyId]);

      return result.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count)
      }));
    } catch (error) {
      logger.error('Get status breakdown error:', error);
      throw error;
    }
  }

  /**
   * Get recommendation breakdown
   * @param {String} companyId - Company ID
   */
  async getRecommendationBreakdown(companyId) {
    try {
      const result = await query(`
        SELECT 
          recommendation,
          COUNT(*) as count
        FROM interview_reports
        WHERE company_id = $1
        GROUP BY recommendation
      `, [companyId]);

      return result.rows.map(row => ({
        recommendation: row.recommendation,
        count: parseInt(row.count)
      }));
    } catch (error) {
      logger.error('Get recommendation breakdown error:', error);
      throw error;
    }
  }

  /**
   * Build date filter for queries
   * @param {String} dateFrom - Start date (ISO)
   * @param {String} dateTo - End date (ISO)
   * @returns {Object} Filter clause and params
   */
  buildDateFilter(dateFrom, dateTo) {
    const params = [];
    let clause = '';

    if (dateFrom) {
      params.push(dateFrom);
      clause += ` AND created_at >= $${params.length + 1}`;
    }

    if (dateTo) {
      params.push(dateTo);
      clause += ` AND created_at <= $${params.length + 1}`;
    }

    return { clause, params };
  }

  /**
   * Export analytics data to CSV format
   * @param {String} companyId - Company ID
   * @param {String} type - Type of data to export
   */
  async exportToCSV(companyId, type = 'interviews') {
    try {
      let data;
      let headers;

      switch (type) {
        case 'interviews':
          const interviews = await query(`
            SELECT 
              i.id,
              c.full_name,
              c.email,
              j.title as job_title,
              i.status,
              ir.overall_score,
              ir.recommendation,
              i.created_at,
              i.completed_at
            FROM interviews i
            LEFT JOIN candidates c ON i.candidate_id = c.id
            LEFT JOIN jobs j ON i.job_id = j.id
            LEFT JOIN interview_reports ir ON i.id = ir.interview_id
            WHERE i.company_id = $1
            ORDER BY i.created_at DESC
          `, [companyId]);
          
          data = interviews.rows;
          headers = ['ID', 'Candidate', 'Email', 'Job', 'Status', 'Score', 'Recommendation', 'Created', 'Completed'];
          break;

        case 'candidates':
          const candidates = await query(`
            SELECT 
              c.full_name,
              c.email,
              COUNT(i.id) as total_interviews,
              AVG(ir.overall_score) as avg_score
            FROM candidates c
            LEFT JOIN interviews i ON c.id = i.candidate_id AND i.company_id = $1
            LEFT JOIN interview_reports ir ON i.id = ir.interview_id
            GROUP BY c.id, c.full_name, c.email
            ORDER BY avg_score DESC
          `, [companyId]);
          
          data = candidates.rows;
          headers = ['Name', 'Email', 'Total Interviews', 'Average Score'];
          break;

        default:
          throw new Error('Invalid export type');
      }

      // Convert to CSV
      const csv = [
        headers.join(','),
        ...data.map(row => Object.values(row).map(v => `"${v || ''}"`).join(','))
      ].join('\n');

      return csv;
    } catch (error) {
      logger.error('Export to CSV error:', error);
      throw error;
    }
  }
}

export default new AnalyticsService();
