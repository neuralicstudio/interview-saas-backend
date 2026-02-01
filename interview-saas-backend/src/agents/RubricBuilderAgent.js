import { chatCompletionJSON } from '../utils/openai.js';

/**
 * Rubric Builder Agent
 * Generates structured interview rubrics from job descriptions
 */
export class RubricBuilderAgent {
  constructor() {
    this.systemPrompt = `You are an expert interview designer who creates structured technical interview rubrics.

Your task is to analyze job descriptions and generate comprehensive interview templates that assess candidates effectively.

Rules:
- Create 5-15 questions organized by interview phase
- Questions must be specific to the role and seniority level
- Avoid generic questions that any candidate could answer
- Focus on real-world scenarios and problem-solving
- Adapt to the specified language (English, Spanish, Arabic, Hindi, French)
- Weight competencies by importance (must sum to 1.0)

Return ONLY valid JSON in this exact format:
{
  "competencies": [
    {
      "name": "Technical Skills",
      "weight": 0.4,
      "must_have": true,
      "description": "Deep knowledge of required technologies"
    }
  ],
  "question_bank": {
    "warmup": ["question1", "question2"],
    "claim_verification": ["question1", "question2"],
    "scenario": ["question1", "question2"],
    "depth": ["question1", "question2"],
    "reflection": ["question1"]
  },
  "evaluation_criteria": {
    "technical_depth": "Assessment criteria",
    "consistency": "Assessment criteria",
    "reasoning": "Assessment criteria",
    "authenticity": "Assessment criteria"
  }
}`;
  }

  /**
   * Generate rubric from job description
   * @param {Object} job - Job object with description, skills, etc.
   * @param {String} language - Target language (en, es, ar, hi, fr)
   */
  async generateRubric(job, language = 'en') {
    try {
      const languageMap = {
        'en': 'English',
        'es': 'Spanish',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'fr': 'French'
      };

      const targetLanguage = languageMap[language] || 'English';

      const userPrompt = `Generate an interview rubric for this job:

Title: ${job.title}
Seniority: ${job.seniority_level || 'Not specified'}
Description: ${job.description}
Required Skills: ${job.required_skills ? job.required_skills.join(', ') : 'Not specified'}
Nice-to-Have Skills: ${job.nice_to_have_skills ? job.nice_to_have_skills.join(', ') : 'Not specified'}

Language: Generate ALL questions and text in ${targetLanguage}

Create a comprehensive rubric with:
1. 4-6 competencies (weighted by importance, must sum to 1.0)
2. Question bank organized by phase:
   - warmup: 2-3 open-ended background questions
   - claim_verification: 3-4 questions that verify CV/resume claims
   - scenario: 3-4 realistic technical scenarios specific to this role
   - depth: 3-4 follow-up questions that probe reasoning
   - reflection: 1-2 questions about learning and growth
3. Evaluation criteria for each dimension

Make questions specific to this role and seniority level. Avoid generic questions.`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const rubric = await chatCompletionJSON(messages, {
        temperature: 0.8, // Higher creativity for diverse questions
        max_tokens: 3000
      });

      // Validate rubric structure
      this.validateRubric(rubric);

      return rubric;
    } catch (error) {
      console.error('Rubric generation error:', error);
      throw new Error(`Failed to generate rubric: ${error.message}`);
    }
  }

  /**
   * Validate rubric structure
   */
  validateRubric(rubric) {
    if (!rubric.competencies || !Array.isArray(rubric.competencies)) {
      throw new Error('Invalid rubric: missing competencies array');
    }

    if (!rubric.question_bank || typeof rubric.question_bank !== 'object') {
      throw new Error('Invalid rubric: missing question_bank object');
    }

    const requiredPhases = ['warmup', 'claim_verification', 'scenario', 'depth', 'reflection'];
    for (const phase of requiredPhases) {
      if (!rubric.question_bank[phase] || !Array.isArray(rubric.question_bank[phase])) {
        throw new Error(`Invalid rubric: missing or invalid ${phase} questions`);
      }
    }

    if (!rubric.evaluation_criteria || typeof rubric.evaluation_criteria !== 'object') {
      throw new Error('Invalid rubric: missing evaluation_criteria');
    }

    // Validate competencies sum to 1.0
    const totalWeight = rubric.competencies.reduce((sum, c) => sum + (c.weight || 0), 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn(`Competency weights sum to ${totalWeight}, expected 1.0. Auto-normalizing.`);
      // Normalize weights
      rubric.competencies = rubric.competencies.map(c => ({
        ...c,
        weight: c.weight / totalWeight
      }));
    }
  }
}

export default new RubricBuilderAgent();
