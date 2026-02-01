import { chatCompletionJSON } from '../utils/openai.js';

/**
 * Stress Monitor Agent
 * Monitors candidate stress levels and recommends pacing adjustments
 */
export class StressMonitorAgent {
  constructor() {
    this.systemPrompt = `You are an expert at assessing interview stress levels and candidate experience.

Your task is to:
- Monitor signs of stress in responses
- Recommend pacing adjustments
- Suggest supportive interventions
- Ensure positive candidate experience

Stress indicators:
- Very short or very long responses (extremes)
- Repetitive language or filler words
- Self-deprecating language
- Expressions of confusion or overwhelm
- Decreasing response quality over time

Your recommendations should:
- Be candidate-focused (not company-focused)
- Suggest specific interventions
- Balance assessment needs with candidate wellbeing
- Maintain interview integrity while being supportive`;
  }

  /**
   * Assess stress level from recent responses
   * @param {Array} transcript - Recent interview transcript
   * @param {Object} videoMetadata - Optional behavioral data
   */
  async assessStress(transcript, videoMetadata = null) {
    try {
      if (transcript.length < 3) {
        return {
          stress_level: 'low',
          confidence: 'low',
          recommendation: 'continue'
        };
      }

      const recentResponses = transcript.filter(msg => msg.speaker === 'candidate').slice(-5);

      const userPrompt = `Analyze these recent candidate responses for stress indicators.

Responses:
${recentResponses.map((r, i) => `${i + 1}. ${r.text}`).join('\n\n')}

${videoMetadata ? `Behavioral data: ${JSON.stringify(videoMetadata)}` : ''}

Return JSON:
{
  "stress_level": "low|medium|high",
  "confidence": "low|medium|high",
  "indicators": [
    {
      "type": "linguistic|behavioral|temporal",
      "observation": "What was observed",
      "severity": "mild|moderate|significant"
    }
  ],
  "recommendation": "continue|slow_down|reassure|break",
  "suggested_intervention": "Specific text the interviewer should say, if any"
}`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const assessment = await chatCompletionJSON(messages, {
        temperature: 0.3,
        max_tokens: 800
      });

      return assessment;
    } catch (error) {
      console.error('Stress assessment error:', error);
      return {
        stress_level: 'unknown',
        confidence: 'low',
        recommendation: 'continue'
      };
    }
  }

  /**
   * Quick stress check after a response
   * @param {String} response - Candidate's latest response
   */
  async quickStressCheck(response) {
    try {
      const responseLength = response.split(' ').length;
      
      // Simple heuristics for quick check
      const indicators = [];
      
      if (responseLength < 10) {
        indicators.push('Very brief response');
      }
      if (responseLength > 200) {
        indicators.push('Unusually long response');
      }
      if (response.toLowerCase().includes("i don't know") || 
          response.toLowerCase().includes("not sure")) {
        indicators.push('Expressions of uncertainty');
      }
      if (response.toLowerCase().includes("sorry") && 
          !response.toLowerCase().includes("sorry, could you")) {
        indicators.push('Apologetic language');
      }

      const stress_level = indicators.length >= 2 ? 'medium' : 'low';

      return {
        stress_level,
        indicators,
        recommendation: stress_level === 'medium' ? 'reassure' : 'continue'
      };
    } catch (error) {
      console.error('Quick stress check error:', error);
      return {
        stress_level: 'unknown',
        indicators: [],
        recommendation: 'continue'
      };
    }
  }

  /**
   * Generate reassurance message
   * @param {String} language - Target language
   */
  async generateReassurance(language = 'en') {
    const languageMap = {
      'en': 'English',
      'es': 'Spanish',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'fr': 'French'
    };

    const targetLanguage = languageMap[language] || 'English';

    const examples = {
      'en': [
        "Take your time - there's no rush. I'm more interested in your thinking than a perfect answer.",
        "No worries at all. Let's approach this from a different angle.",
        "That's completely fine. These questions can be challenging. Let me ask about something else."
      ],
      'es': [
        "Tómate tu tiempo - no hay prisa. Me interesa más tu forma de pensar que una respuesta perfecta.",
        "No te preocupes. Veámoslo desde otro ángulo.",
        "Está perfectamente bien. Estas preguntas pueden ser difíciles. Déjame preguntarte sobre otra cosa."
      ]
    };

    // Return random example for now, or generate via AI if needed
    const languageExamples = examples[language] || examples['en'];
    return languageExamples[Math.floor(Math.random() * languageExamples.length)];
  }
}

export default new StressMonitorAgent();
