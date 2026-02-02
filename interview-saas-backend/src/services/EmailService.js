import { Resend } from 'resend';
import dotenv from 'dotenv';
import { logger } from '../utils/logger.js';

dotenv.config();

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Default sender email (you'll need to verify your domain in Resend)
const DEFAULT_FROM = process.env.EMAIL_FROM || 'noreply@yourdomain.com';

/**
 * Email Service using Resend
 */
export class EmailService {
  /**
   * Send interview invitation email to candidate
   * @param {Object} data - Email data
   */
  async sendInterviewInvite(data) {
    try {
      const {
        candidateEmail,
        candidateName,
        companyName,
        jobTitle,
        inviteUrl,
        durationMinutes,
        language
      } = data;

      const subject = this.getSubject('invite', language, { jobTitle, companyName });
      const html = this.getInviteTemplate(data, language);
      const text = this.getInviteTextVersion(data, language);

      const result = await resend.emails.send({
        from: DEFAULT_FROM,
        to: candidateEmail,
        subject,
        html,
        text,
        tags: [
          { name: 'type', value: 'interview_invite' },
          { name: 'language', value: language }
        ]
      });

      logger.info(`Interview invite sent to ${candidateEmail}`, { messageId: result.id });
      return result;
    } catch (error) {
      logger.error('Failed to send interview invite:', error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  /**
   * Send interview completion notification to company
   * @param {Object} data - Email data
   */
  async sendInterviewComplete(data) {
    try {
      const {
        companyEmail,
        candidateName,
        jobTitle,
        overallScore,
        recommendation,
        reportUrl,
        language
      } = data;

      const subject = this.getSubject('complete', language, { candidateName, jobTitle });
      const html = this.getCompleteTemplate(data, language);
      const text = this.getCompleteTextVersion(data, language);

      const result = await resend.emails.send({
        from: DEFAULT_FROM,
        to: companyEmail,
        subject,
        html,
        text,
        tags: [
          { name: 'type', value: 'interview_complete' },
          { name: 'language', value: language }
        ]
      });

      logger.info(`Interview completion sent to ${companyEmail}`, { messageId: result.id });
      return result;
    } catch (error) {
      logger.error('Failed to send completion email:', error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  /**
   * Send interview reminder to candidate (24 hours before)
   * @param {Object} data - Email data
   */
  async sendInterviewReminder(data) {
    try {
      const {
        candidateEmail,
        candidateName,
        jobTitle,
        companyName,
        inviteUrl,
        language
      } = data;

      const subject = this.getSubject('reminder', language, { jobTitle, companyName });
      const html = this.getReminderTemplate(data, language);
      const text = this.getReminderTextVersion(data, language);

      const result = await resend.emails.send({
        from: DEFAULT_FROM,
        to: candidateEmail,
        subject,
        html,
        text,
        tags: [
          { name: 'type', value: 'interview_reminder' },
          { name: 'language', value: language }
        ]
      });

      logger.info(`Interview reminder sent to ${candidateEmail}`, { messageId: result.id });
      return result;
    } catch (error) {
      logger.error('Failed to send reminder email:', error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  /**
   * Get email subject based on type and language
   */
  getSubject(type, language, data) {
    const subjects = {
      invite: {
        en: `Interview Invitation: ${data.jobTitle} at ${data.companyName}`,
        es: `Invitación a entrevista: ${data.jobTitle} en ${data.companyName}`,
        ar: `دعوة مقابلة: ${data.jobTitle} في ${data.companyName}`,
        hi: `साक्षात्कार निमंत्रण: ${data.companyName} में ${data.jobTitle}`,
        fr: `Invitation à un entretien: ${data.jobTitle} chez ${data.companyName}`
      },
      complete: {
        en: `Interview Completed: ${data.candidateName} - ${data.jobTitle}`,
        es: `Entrevista completada: ${data.candidateName} - ${data.jobTitle}`,
        ar: `اكتملت المقابلة: ${data.candidateName} - ${data.jobTitle}`,
        hi: `साक्षात्कार पूर्ण: ${data.candidateName} - ${data.jobTitle}`,
        fr: `Entretien terminé: ${data.candidateName} - ${data.jobTitle}`
      },
      reminder: {
        en: `Reminder: Your interview for ${data.jobTitle} at ${data.companyName}`,
        es: `Recordatorio: Tu entrevista para ${data.jobTitle} en ${data.companyName}`,
        ar: `تذكير: مقابلتك لـ ${data.jobTitle} في ${data.companyName}`,
        hi: `अनुस्मारक: ${data.companyName} में ${data.jobTitle} के लिए आपका साक्षात्कार`,
        fr: `Rappel: Votre entretien pour ${data.jobTitle} chez ${data.companyName}`
      }
    };

    return subjects[type][language] || subjects[type]['en'];
  }

  /**
   * Get HTML template for interview invite
   */
  getInviteTemplate(data, language) {
    const { candidateName, companyName, jobTitle, inviteUrl, durationMinutes } = data;
    
    const content = {
      en: {
        greeting: `Hi ${candidateName},`,
        intro: `You've been invited to interview for the <strong>${jobTitle}</strong> position at <strong>${companyName}</strong>.`,
        details: `This is an AI-powered interview that will take approximately <strong>${durationMinutes} minutes</strong>.`,
        instructions: 'During the interview, you will:',
        list: [
          'Answer questions about your background and experience',
          'Discuss technical scenarios related to the role',
          'Demonstrate your problem-solving approach'
        ],
        tips: 'Tips for success:',
        tipsList: [
          'Find a quiet place with good internet connection',
          'Allow camera and microphone access when prompted',
          'Think out loud and explain your reasoning',
          'Be yourself and answer honestly'
        ],
        button: 'Start Interview',
        footer: `This interview link expires in 7 days. If you have any questions, please contact ${companyName}.`,
        goodLuck: 'Good luck!'
      },
      es: {
        greeting: `Hola ${candidateName},`,
        intro: `Has sido invitado a una entrevista para el puesto de <strong>${jobTitle}</strong> en <strong>${companyName}</strong>.`,
        details: `Esta es una entrevista con IA que durará aproximadamente <strong>${durationMinutes} minutos</strong>.`,
        instructions: 'Durante la entrevista:',
        list: [
          'Responderás preguntas sobre tu experiencia',
          'Discutirás escenarios técnicos relacionados con el puesto',
          'Demostrarás tu enfoque para resolver problemas'
        ],
        tips: 'Consejos para el éxito:',
        tipsList: [
          'Encuentra un lugar tranquilo con buena conexión a internet',
          'Permite el acceso a la cámara y micrófono cuando se solicite',
          'Piensa en voz alta y explica tu razonamiento',
          'Sé tú mismo y responde honestamente'
        ],
        button: 'Comenzar Entrevista',
        footer: `Este enlace expira en 7 días. Si tienes preguntas, contacta a ${companyName}.`,
        goodLuck: '¡Buena suerte!'
      },
      // Add other languages (ar, hi, fr) similarly
    };

    const lang = content[language] || content['en'];

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Interview Invitation</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    
    <p style="font-size: 16px; margin-bottom: 20px;">${lang.greeting}</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">${lang.intro}</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">${lang.details}</p>
    
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #667eea;">${lang.instructions}</h3>
      <ul style="margin: 10px 0; padding-left: 20px;">
        ${lang.list.map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}
      </ul>
    </div>

    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <h3 style="margin-top: 0; color: #856404;">${lang.tips}</h3>
      <ul style="margin: 10px 0; padding-left: 20px;">
        ${lang.tipsList.map(item => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}
      </ul>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block;">${lang.button}</a>
    </div>

    <p style="font-size: 14px; color: #666; margin-top: 30px;">${lang.footer}</p>
    
    <p style="font-size: 16px; font-weight: bold; margin-top: 20px;">${lang.goodLuck}</p>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Powered by Interview AI | <a href="${inviteUrl}" style="color: #667eea;">View Interview</a>
    </p>
  </div>

</body>
</html>
    `;
  }

  /**
   * Get plain text version for interview invite
   */
  getInviteTextVersion(data, language) {
    const { candidateName, companyName, jobTitle, inviteUrl, durationMinutes } = data;
    
    return `
Hi ${candidateName},

You've been invited to interview for the ${jobTitle} position at ${companyName}.

This is an AI-powered interview that will take approximately ${durationMinutes} minutes.

Interview Link: ${inviteUrl}

During the interview, you will:
- Answer questions about your background and experience
- Discuss technical scenarios related to the role
- Demonstrate your problem-solving approach

Tips for success:
- Find a quiet place with good internet connection
- Allow camera and microphone access when prompted
- Think out loud and explain your reasoning
- Be yourself and answer honestly

This interview link expires in 7 days.

Good luck!

---
Powered by Interview AI
    `.trim();
  }

  /**
   * Get HTML template for interview completion (company notification)
   */
  getCompleteTemplate(data, language) {
    const { candidateName, jobTitle, overallScore, recommendation, reportUrl, strengths, weaknesses } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Completed</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Interview Completed</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${candidateName}</strong> has completed the interview for <strong>${jobTitle}</strong>.
    </p>
    
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h3 style="margin-top: 0; color: #667eea;">Quick Summary</h3>
      <p><strong>Overall Score:</strong> ${(overallScore * 100).toFixed(0)}%</p>
      <p><strong>Recommendation:</strong> <span style="color: ${recommendation === 'proceed' ? '#28a745' : '#ffc107'}; font-weight: bold;">${recommendation.toUpperCase()}</span></p>
    </div>

    ${strengths && strengths.length > 0 ? `
    <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
      <h4 style="margin-top: 0; color: #155724;">Key Strengths:</h4>
      <ul style="margin: 10px 0; padding-left: 20px;">
        ${strengths.slice(0, 3).map(s => `<li>${s.observation || s}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    ${weaknesses && weaknesses.length > 0 ? `
    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <h4 style="margin-top: 0; color: #856404;">Areas of Concern:</h4>
      <ul style="margin: 10px 0; padding-left: 20px;">
        ${weaknesses.slice(0, 3).map(w => `<li>${w.observation || w}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${reportUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block;">View Full Report</a>
    </div>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Powered by Interview AI
    </p>
  </div>

</body>
</html>
    `;
  }

  /**
   * Get plain text version for completion email
   */
  getCompleteTextVersion(data, language) {
    const { candidateName, jobTitle, overallScore, recommendation, reportUrl } = data;
    
    return `
Interview Completed

${candidateName} has completed the interview for ${jobTitle}.

Quick Summary:
- Overall Score: ${(overallScore * 100).toFixed(0)}%
- Recommendation: ${recommendation.toUpperCase()}

View Full Report: ${reportUrl}

---
Powered by Interview AI
    `.trim();
  }

  /**
   * Get HTML template for interview reminder
   */
  getReminderTemplate(data, language) {
    const { candidateName, jobTitle, companyName, inviteUrl } = data;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interview Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Interview Reminder</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    
    <p style="font-size: 16px; margin-bottom: 20px;">Hi ${candidateName},</p>
    
    <p style="font-size: 16px; margin-bottom: 20px;">
      This is a friendly reminder about your upcoming interview for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>.
    </p>
    
    <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
      <p style="margin: 0; font-size: 16px;">
        ⏰ <strong>Your interview is waiting for you!</strong>
      </p>
    </div>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${inviteUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block;">Start Interview Now</a>
    </div>
    
    <p style="font-size: 14px; color: #666;">
      Remember to find a quiet place and ensure you have a stable internet connection.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #999; text-align: center;">
      Powered by Interview AI
    </p>
  </div>

</body>
</html>
    `;
  }

  /**
   * Get plain text version for reminder email
   */
  getReminderTextVersion(data, language) {
    const { candidateName, jobTitle, companyName, inviteUrl } = data;
    
    return `
Hi ${candidateName},

This is a friendly reminder about your upcoming interview for ${jobTitle} at ${companyName}.

Your interview is waiting for you!

Interview Link: ${inviteUrl}

Remember to find a quiet place and ensure you have a stable internet connection.

---
Powered by Interview AI
    `.trim();
  }
}

export default new EmailService();
