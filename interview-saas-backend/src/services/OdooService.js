import xmlrpc from 'xmlrpc';
import { logger } from '../utils/logger.js';
import { query } from '../db/index.js';

/**
 * Odoo Integration Service
 * Connects to Odoo via XML-RPC API
 */
export class OdooService {
  constructor() {
    this.connections = new Map(); // Store connections per company
  }

  /**
   * Create Odoo connection
   * @param {Object} config - Odoo configuration
   */
  createConnection(config) {
    const { url, database, username, password } = config;
    
    // Parse URL
    const urlParts = new URL(url);
    const secure = urlParts.protocol === 'https:';
    const host = urlParts.hostname;
    const port = urlParts.port || (secure ? 443 : 80);

    return {
      common: secure 
        ? xmlrpc.createSecureClient({ host, port, path: '/xmlrpc/2/common' })
        : xmlrpc.createClient({ host, port, path: '/xmlrpc/2/common' }),
      object: secure
        ? xmlrpc.createSecureClient({ host, port, path: '/xmlrpc/2/object' })
        : xmlrpc.createClient({ host, port, path: '/xmlrpc/2/object' }),
      database,
      username,
      password
    };
  }

  /**
   * Authenticate with Odoo
   * @param {Object} connection - Odoo connection
   * @returns {Number} User ID
   */
  async authenticate(connection) {
    return new Promise((resolve, reject) => {
      connection.common.methodCall('authenticate', [
        connection.database,
        connection.username,
        connection.password,
        {}
      ], (error, uid) => {
        if (error) {
          logger.error('Odoo authentication error:', error);
          reject(new Error('Failed to authenticate with Odoo'));
        } else if (!uid) {
          reject(new Error('Invalid Odoo credentials'));
        } else {
          logger.info(`Authenticated with Odoo as user ${uid}`);
          resolve(uid);
        }
      });
    });
  }

  /**
   * Execute Odoo method
   * @param {Object} connection - Odoo connection
   * @param {Number} uid - User ID
   * @param {String} model - Odoo model name
   * @param {String} method - Method name
   * @param {Array} params - Method parameters
   */
  async execute(connection, uid, model, method, params = []) {
    return new Promise((resolve, reject) => {
      connection.object.methodCall('execute_kw', [
        connection.database,
        uid,
        connection.password,
        model,
        method,
        params
      ], (error, result) => {
        if (error) {
          logger.error(`Odoo execute error (${model}.${method}):`, error);
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Test Odoo connection
   * @param {Object} config - Odoo configuration
   * @returns {Boolean} Connection successful
   */
  async testConnection(config) {
    try {
      const connection = this.createConnection(config);
      const uid = await this.authenticate(connection);
      
      // Test by getting user info
      const userInfo = await this.execute(connection, uid, 'res.users', 'read', [
        [uid],
        ['name', 'login']
      ]);

      logger.info('Odoo connection test successful:', userInfo);
      return true;
    } catch (error) {
      logger.error('Odoo connection test failed:', error);
      throw error;
    }
  }

  /**
   * Get applicants from Odoo
   * @param {String} companyId - Company ID
   * @param {Object} filters - Search filters
   */
  async getApplicants(companyId, filters = {}) {
    try {
      // Get Odoo config from database
      const configResult = await query(
        'SELECT odoo_config FROM companies WHERE id = $1',
        [companyId]
      );

      if (!configResult.rows[0]?.odoo_config) {
        throw new Error('Odoo not configured for this company');
      }

      const config = configResult.rows[0].odoo_config;
      const connection = this.createConnection(config);
      const uid = await this.authenticate(connection);

      // Build search domain
      const domain = [];
      if (filters.job_id) {
        domain.push(['job_id', '=', parseInt(filters.job_id)]);
      }
      if (filters.stage) {
        domain.push(['stage_id.name', '=', filters.stage]);
      }

      // Search applicants
      const applicantIds = await this.execute(
        connection,
        uid,
        'hr.applicant',
        'search',
        [domain]
      );

      // Read applicant details
      const applicants = await this.execute(
        connection,
        uid,
        'hr.applicant',
        'read',
        [
          applicantIds,
          [
            'name',
            'partner_name',
            'email_from',
            'partner_phone',
            'job_id',
            'stage_id',
            'description',
            'linkedin_url',
            'source_id'
          ]
        ]
      );

      logger.info(`Fetched ${applicants.length} applicants from Odoo`);

      return applicants.map(app => ({
        odoo_id: app.id,
        name: app.partner_name || app.name,
        email: app.email_from,
        phone: app.partner_phone,
        job_id: app.job_id?.[0],
        job_name: app.job_id?.[1],
        stage: app.stage_id?.[1],
        description: app.description,
        linkedin: app.linkedin_url,
        source: app.source_id?.[1]
      }));
    } catch (error) {
      logger.error('Get Odoo applicants error:', error);
      throw error;
    }
  }

  /**
   * Import applicant from Odoo to our system
   * @param {String} companyId - Company ID
   * @param {Number} odooApplicantId - Odoo applicant ID
   */
  async importApplicant(companyId, odooApplicantId) {
    try {
      // Get applicant from Odoo
      const configResult = await query(
        'SELECT odoo_config FROM companies WHERE id = $1',
        [companyId]
      );

      const config = configResult.rows[0].odoo_config;
      const connection = this.createConnection(config);
      const uid = await this.authenticate(connection);

      const applicants = await this.execute(
        connection,
        uid,
        'hr.applicant',
        'read',
        [
          [odooApplicantId],
          ['name', 'partner_name', 'email_from', 'partner_phone', 'description']
        ]
      );

      if (!applicants || applicants.length === 0) {
        throw new Error('Applicant not found in Odoo');
      }

      const applicant = applicants[0];

      // Create candidate in our system
      const candidateResult = await query(`
        INSERT INTO candidates (email, full_name, phone, resume_text, source)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            resume_text = EXCLUDED.resume_text
        RETURNING *
      `, [
        applicant.email_from,
        applicant.partner_name || applicant.name,
        applicant.partner_phone,
        applicant.description,
        'odoo_import'
      ]);

      // Store Odoo mapping
      await query(`
        INSERT INTO odoo_mappings (company_id, candidate_id, odoo_applicant_id, synced_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (company_id, candidate_id) DO UPDATE
        SET odoo_applicant_id = EXCLUDED.odoo_applicant_id,
            synced_at = NOW()
      `, [companyId, candidateResult.rows[0].id, odooApplicantId]);

      logger.info(`Imported Odoo applicant ${odooApplicantId} as candidate ${candidateResult.rows[0].id}`);

      return candidateResult.rows[0];
    } catch (error) {
      logger.error('Import Odoo applicant error:', error);
      throw error;
    }
  }

  /**
   * Push interview results to Odoo
   * @param {String} companyId - Company ID
   * @param {String} interviewId - Interview ID
   */
  async pushInterviewResults(companyId, interviewId) {
    try {
      // Get interview report
      const reportResult = await query(`
        SELECT 
          ir.*,
          i.candidate_id,
          om.odoo_applicant_id
        FROM interview_reports ir
        JOIN interviews i ON ir.interview_id = i.id
        LEFT JOIN odoo_mappings om ON om.candidate_id = i.candidate_id AND om.company_id = $1
        WHERE ir.interview_id = $2
      `, [companyId, interviewId]);

      if (reportResult.rows.length === 0) {
        throw new Error('Interview report not found');
      }

      const report = reportResult.rows[0];

      if (!report.odoo_applicant_id) {
        throw new Error('No Odoo mapping found for this candidate');
      }

      // Get Odoo config
      const configResult = await query(
        'SELECT odoo_config FROM companies WHERE id = $1',
        [companyId]
      );

      const config = configResult.rows[0].odoo_config;
      const connection = this.createConnection(config);
      const uid = await this.authenticate(connection);

      // Prepare interview summary
      const summary = `
AI Interview Results:
- Overall Score: ${(report.overall_score * 100).toFixed(0)}%
- Recommendation: ${report.recommendation.toUpperCase()}

Strengths:
${report.strengths?.map(s => `- ${s.observation || s}`).join('\n') || 'N/A'}

Weaknesses:
${report.weaknesses?.map(w => `- ${w.observation || w}`).join('\n') || 'N/A'}

Detailed report available in Interview AI system.
      `.trim();

      // Add note to applicant
      await this.execute(
        connection,
        uid,
        'hr.applicant',
        'message_post',
        [
          [report.odoo_applicant_id],
          {
            body: summary,
            subject: 'AI Interview Results',
            message_type: 'comment'
          }
        ]
      );

      // Update applicant stage based on recommendation
      if (report.recommendation === 'proceed') {
        // Try to move to "Initial Qualification" or similar stage
        const stageIds = await this.execute(
          connection,
          uid,
          'hr.recruitment.stage',
          'search',
          [['name', 'ilike', 'qualification']]
        );

        if (stageIds.length > 0) {
          await this.execute(
            connection,
            uid,
            'hr.applicant',
            'write',
            [
              [report.odoo_applicant_id],
              { stage_id: stageIds[0] }
            ]
          );
        }
      }

      logger.info(`Pushed interview results to Odoo applicant ${report.odoo_applicant_id}`);

      return true;
    } catch (error) {
      logger.error('Push results to Odoo error:', error);
      throw error;
    }
  }

  /**
   * Sync job from Odoo
   * @param {String} companyId - Company ID
   * @param {Number} odooJobId - Odoo job ID
   */
  async syncJob(companyId, odooJobId) {
    try {
      const configResult = await query(
        'SELECT odoo_config FROM companies WHERE id = $1',
        [companyId]
      );

      const config = configResult.rows[0].odoo_config;
      const connection = this.createConnection(config);
      const uid = await this.authenticate(connection);

      const jobs = await this.execute(
        connection,
        uid,
        'hr.job',
        'read',
        [
          [odooJobId],
          ['name', 'description', 'requirements', 'state']
        ]
      );

      if (!jobs || jobs.length === 0) {
        throw new Error('Job not found in Odoo');
      }

      const odooJob = jobs[0];

      // Create job in our system
      const jobResult = await query(`
        INSERT INTO jobs (
          company_id, 
          title, 
          description, 
          required_skills,
          is_active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        companyId,
        odooJob.name,
        odooJob.description || '',
        odooJob.requirements || '',
        odooJob.state === 'recruit'
      ]);

      logger.info(`Synced Odoo job ${odooJobId} as job ${jobResult.rows[0].id}`);

      return jobResult.rows[0];
    } catch (error) {
      logger.error('Sync Odoo job error:', error);
      throw error;
    }
  }

  /**
   * Get Odoo jobs list
   * @param {String} companyId - Company ID
   */
  async getJobs(companyId) {
    try {
      const configResult = await query(
        'SELECT odoo_config FROM companies WHERE id = $1',
        [companyId]
      );

      const config = configResult.rows[0].odoo_config;
      const connection = this.createConnection(config);
      const uid = await this.authenticate(connection);

      const jobIds = await this.execute(
        connection,
        uid,
        'hr.job',
        'search',
        [[['state', '=', 'recruit']]]
      );

      const jobs = await this.execute(
        connection,
        uid,
        'hr.job',
        'read',
        [jobIds, ['name', 'description', 'no_of_recruitment']]
      );

      return jobs.map(job => ({
        odoo_id: job.id,
        name: job.name,
        description: job.description,
        positions: job.no_of_recruitment
      }));
    } catch (error) {
      logger.error('Get Odoo jobs error:', error);
      throw error;
    }
  }
}

export default new OdooService();
