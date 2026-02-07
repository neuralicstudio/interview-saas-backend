import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';
import { query } from '../db/index.js';

/**
 * Webhook Service
 * Manages outgoing webhooks for integrations (Zapier, etc.)
 */
export class WebhookService {
  constructor() {
    this.retryAttempts = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Send webhook
   * @param {String} url - Webhook URL
   * @param {Object} data - Data to send
   * @param {Object} options - Additional options
   */
  async sendWebhook(url, data, options = {}) {
    try {
      logger.info(`Sending webhook to ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'InterviewAI-Webhook/1.0',
          ...options.headers
        },
        body: JSON.stringify(data),
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
      }

      logger.info('Webhook sent successfully');
      return { success: true, status: response.status };
    } catch (error) {
      logger.error('Webhook send error:', error);
      throw error;
    }
  }

  /**
   * Send webhook with retry logic
   * @param {String} url - Webhook URL
   * @param {Object} data - Data to send
   */
  async sendWebhookWithRetry(url, data) {
    let lastError;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await this.sendWebhook(url, data);
      } catch (error) {
        lastError = error;
        logger.warn(`Webhook attempt ${attempt} failed, retrying...`);
        
        if (attempt < this.retryAttempts) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }

    throw lastError;
  }

  /**
   * Trigger event webhooks
   * @param {String} companyId - Company ID
   * @param {String} event - Event name
   * @param {Object} payload - Event data
   */
  async triggerEvent(companyId, event, payload) {
    try {
      // Get webhooks for this company and event
      const result = await query(`
        SELECT * FROM webhooks
        WHERE company_id = $1 
        AND event = $2 
        AND is_active = true
      `, [companyId, event]);

      if (result.rows.length === 0) {
        logger.info(`No active webhooks for event: ${event}`);
        return;
      }

      // Send to all registered webhooks
      const promises = result.rows.map(async (webhook) => {
        try {
          const webhookPayload = {
            event,
            timestamp: new Date().toISOString(),
            data: payload,
            webhook_id: webhook.id
          };

          await this.sendWebhookWithRetry(webhook.url, webhookPayload);

          // Log success
          await query(`
            INSERT INTO webhook_logs (
              webhook_id,
              event,
              status,
              response_status,
              sent_at
            ) VALUES ($1, $2, $3, $4, NOW())
          `, [webhook.id, event, 'success', 200]);

        } catch (error) {
          // Log failure
          await query(`
            INSERT INTO webhook_logs (
              webhook_id,
              event,
              status,
              error_message,
              sent_at
            ) VALUES ($1, $2, $3, $4, NOW())
          `, [webhook.id, event, 'failed', error.message]);
        }
      });

      await Promise.allSettled(promises);
      logger.info(`Triggered ${promises.length} webhooks for event: ${event}`);
    } catch (error) {
      logger.error('Trigger event error:', error);
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get available events
   */
  getAvailableEvents() {
    return [
      {
        event: 'interview.completed',
        description: 'Triggered when an interview is completed',
        payload: {
          interview_id: 'uuid',
          candidate_email: 'string',
          job_title: 'string',
          overall_score: 'number',
          recommendation: 'string'
        }
      },
      {
        event: 'interview.created',
        description: 'Triggered when an interview is created',
        payload: {
          interview_id: 'uuid',
          candidate_email: 'string',
          job_title: 'string'
        }
      },
      {
        event: 'candidate.created',
        description: 'Triggered when a candidate is created',
        payload: {
          candidate_id: 'uuid',
          email: 'string',
          full_name: 'string'
        }
      },
      {
        event: 'job.created',
        description: 'Triggered when a job is created',
        payload: {
          job_id: 'uuid',
          title: 'string',
          required_skills: 'string'
        }
      }
    ];
  }
}

export default new WebhookService();
