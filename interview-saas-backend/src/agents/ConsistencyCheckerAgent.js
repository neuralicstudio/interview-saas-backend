import { chatCompletionJSON } from '../utils/openai.js';

/**
 * Consistency Checker Agent
 * Analyzes candidate responses for consistency with their CV/resume
 */
export class ConsistencyCheckerAgent {
  constructor() {
    this.systemPrompt = `You are an expert at analyzing interview responses for consistency with candidate backgrounds.

Your task is to identify:
- Mismatches between claimed experience and demonstrated understanding
- Over-inflated or exaggerated claims
- Gaps in knowledge for stated expertise
- Consistent, credible responses that align with their background

Rules:
- Be evidence-based, not accusatory
- Note both consistencies and inconsistencies
- Provide specific examples
- Consider seniority level (juniors have less depth than seniors)
- Return assessments in structured JSON format

You are NOT making hiring decisions. You are providing objective observations to help the company evaluate the candidate fairly.`;
  }

  /**
   * Check consistency between CV and interview responses
   * @param {Object} candidate - Candidate object with resume
   * @param {Array} transcript - Interview transcript
   * @param {Object} rubric - Interview rubric
   */
  async checkConsistency(candidate, transcript, rubric) {
    try {
      if (!candidate.resume_text || transcript.length < 4) {
        return {
          cv_consistency_score: null,
          notes: ['Insufficient data for consistency analysis']
        };
      }

      const userPrompt = `Analyze this candidate's interview for consistency with their CV.

CV/Resume:
${candidate.resume_text.substring(0, 2000)}

Interview Transcript:
${this.formatTranscript(transcript)}

Required Skills for Role: ${rubric.competencies?.map(c => c.name).join(', ') || 'Not specified'}

Analyze and return JSON with:
{
  "cv_consistency_score": 0.0-1.0 (1.0 = perfect alignment),
  "consistencies": [
    {
      "claim": "Specific CV claim",
      "evidence": "Interview response that supports it",
      "assessment": "Why it's consistent"
    }
  ],
  "inconsistencies": [
    {
      "claim": "Specific CV claim",
      "issue": "What doesn't match",
      "evidence": "Interview response showing the gap",
      "severity": "low|medium|high"
    }
  ],
  "notes": ["Overall observations"],
  "red_flags": ["Serious concerns, if any"]
}`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const analysis = await chatCompletionJSON(messages, {
        temperature: 0.3, // Lower temperature for objective analysis
        max_tokens: 2000
      });

      return analysis;
    } catch (error) {
      console.error('Consistency check error:', error);
      return {
        cv_consistency_score: null,
        notes: [`Analysis failed: ${error.message}`]
      };
    }
  }

  /**
   * Format transcript for analysis
   */
  formatTranscript(transcript) {
    return transcript
      .filter(msg => msg.speaker === 'candidate') // Only candidate responses
      .slice(-15) // Last 15 responses
      .map((msg, i) => `Response ${i + 1}: ${msg.text}`)
      .join('\n\n');
  }

  /**
   * Quick check during interview (lightweight)
   * @param {String} claim - CV claim to verify
   * @param {String} response - Candidate's response
   */
  async quickCheck(claim, response) {
    try {
      const prompt = `CV Claim: "${claim}"
Candidate's Response: "${response}"

Does the response demonstrate credible knowledge of this claim? Reply with JSON:
{
  "verified": true/false,
  "confidence": "low|medium|high",
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
      console.error('Quick check error:', error);
      return {
        verified: null,
        confidence: 'low',
        note: 'Check failed'
      };
    }
  }
}

export default new ConsistencyCheckerAgent();
