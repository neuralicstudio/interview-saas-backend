import { chatCompletionJSON } from '../utils/openai.js';

/**
 * Authenticity Signal Agent
 * Analyzes response quality signals without surveillance
 * Focuses on linguistic patterns, reasoning depth, and response quality
 */
export class AuthenticitySignalAgent {
  constructor() {
    this.systemPrompt = `You are an expert at analyzing interview response quality and authenticity signals.

Your task is to assess response quality based on:
- Linguistic patterns (overly generic vs. specific and personal)
- Reasoning depth (superficial vs. detailed problem-solving)
- Response consistency (changing vocabulary, sudden shifts)
- Knowledge specificity (vague concepts vs. concrete examples)

You are NOT:
- Detecting lies or deception
- Making moral judgments
- Using surveillance techniques
- Claiming to read minds

You ARE:
- Assessing response quality and depth
- Identifying patterns that suggest preparation level
- Noting when responses lack personal detail or specificity

Frame findings as "response quality signals" not "cheat detection."`;
  }

  /**
   * Analyze response authenticity signals
   * @param {Array} transcript - Interview transcript
   * @param {Object} videoMetadata - Optional behavioral metadata
   */
  async analyzeSignals(transcript, videoMetadata = null) {
    try {
      if (transcript.length < 4) {
        return {
          authenticity_risk: 'low',
          confidence: 'low',
          signals: ['Insufficient responses for analysis']
        };
      }

      const userPrompt = `Analyze these interview responses for quality signals.

Responses:
${this.formatResponses(transcript)}

${videoMetadata ? `Behavioral metadata: ${JSON.stringify(videoMetadata)}` : ''}

Analyze and return JSON:
{
  "authenticity_risk": "low|medium|high",
  "confidence": "low|medium|high",
  "signals": [
    {
      "type": "positive|concern",
      "pattern": "What pattern was observed",
      "evidence": "Specific examples",
      "interpretation": "What this might indicate"
    }
  ],
  "response_quality": {
    "specificity": "low|medium|high",
    "depth": "low|medium|high",
    "consistency": "low|medium|high",
    "personal_detail": "low|medium|high"
  },
  "notes": ["Overall assessment"]
}

Focus on response quality, not accusations. Frame concerns constructively.`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const analysis = await chatCompletionJSON(messages, {
        temperature: 0.3,
        max_tokens: 1500
      });

      return analysis;
    } catch (error) {
      console.error('Authenticity analysis error:', error);
      return {
        authenticity_risk: 'unknown',
        confidence: 'low',
        signals: [`Analysis failed: ${error.message}`]
      };
    }
  }

  /**
   * Quick signal check during interview
   * @param {String} question - Question asked
   * @param {String} response - Candidate's response
   */
  async quickSignalCheck(question, response) {
    try {
      const prompt = `Question: "${question}"
Response: "${response}"

Assess response quality. Return JSON:
{
  "quality": "poor|fair|good|excellent",
  "specificity": "generic|specific",
  "reasoning_shown": true/false,
  "personal_detail": true/false,
  "note": "Brief observation"
}`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt }
      ];

      return await chatCompletionJSON(messages, {
        temperature: 0.3,
        max_tokens: 200
      });
    } catch (error) {
      console.error('Quick signal check error:', error);
      return {
        quality: 'unknown',
        note: 'Check failed'
      };
    }
  }

  /**
   * Format responses for analysis
   */
  formatResponses(transcript) {
    return transcript
      .filter(msg => msg.speaker === 'candidate')
      .slice(-10)
      .map((msg, i) => `Response ${i + 1}: ${msg.text}`)
      .join('\n\n');
  }

  /**
   * Analyze video frame for behavioral signals (GPT-4 Vision)
   * @param {String} frameBase64 - Base64 encoded frame
   */
  async analyzeVideoFrame(frameBase64) {
    try {
      // This will be implemented when integrating GPT-4 Vision
      // For now, return placeholder
      return {
        engagement: 'medium',
        confidence: 'medium',
        eye_contact: 'present',
        notes: 'Video analysis not yet implemented'
      };
    } catch (error) {
      console.error('Video frame analysis error:', error);
      return null;
    }
  }
}

export default new AuthenticitySignalAgent();
