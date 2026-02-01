import { chatCompletion } from '../utils/openai.js';

/**
 * Interviewer Agent
 * Conducts structured interviews and adapts questions based on candidate responses
 */
export class InterviewerAgent {
  constructor() {
    this.systemPrompt = `You are a professional AI interviewer conducting structured job interviews on behalf of companies.

Your goals:
- Assess how the candidate thinks, reasons, and applies knowledge
- Adapt questions based on the candidate's answers
- Remain calm, respectful, neutral, and professional at all times
- Never mention internal scoring, detection systems, or evaluation logic

Behavior rules:
- Ask ONE question at a time
- Ask follow-up questions only when clarity, depth, or reasoning is insufficient
- Prefer scenario-based and reasoning questions over factual recall
- If the candidate appears stressed, slow the pace and reassure them
- Do not provide hints or answers
- Do not use words like "AI model", "language model", or "algorithm"
- Never reveal you are an AI unless directly asked

Identity disclosure:
- You are an AI interviewer acting on behalf of the hiring company
- You are professional, knowledgeable, and supportive

Communication style:
- Conversational and natural (not robotic)
- Encouraging without being overly friendly
- Professional but warm
- Clear and concise`;
  }

  /**
   * Get next interview question
   * @param {Object} context - Interview context
   */
  async getNextQuestion(context) {
    try {
      const {
        job,
        rubric,
        candidate,
        phase,
        transcript,
        stress_level,
        language
      } = context;

      const languageMap = {
        'en': 'English',
        'es': 'Spanish',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'fr': 'French'
      };

      const targetLanguage = languageMap[language] || 'English';

      // Build context-aware prompt
      const userPrompt = this.buildInterviewPrompt({
        job,
        rubric,
        candidate,
        phase,
        transcript,
        stress_level,
        targetLanguage
      });

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const response = await chatCompletion(messages, {
        temperature: 0.7,
        max_tokens: 300
      });

      return response.trim();
    } catch (error) {
      console.error('Interviewer agent error:', error);
      throw new Error(`Failed to generate question: ${error.message}`);
    }
  }

  /**
   * Build interview prompt based on current context
   */
  buildInterviewPrompt(params) {
    const {
      job,
      rubric,
      candidate,
      phase,
      transcript,
      stress_level,
      targetLanguage
    } = params;

    let prompt = `You are interviewing for: ${job.title}\n`;
    prompt += `Language: Speak in ${targetLanguage}\n`;
    prompt += `Current phase: ${phase}\n\n`;

    // Add phase-specific instructions
    if (phase === 'warmup') {
      prompt += `WARMUP PHASE: Start with a friendly introduction and ask open-ended background questions to help the candidate relax. Use questions from the rubric's warmup section.\n\n`;
    } else if (phase === 'claim_verification') {
      prompt += `CLAIM VERIFICATION PHASE: Ask about specific experiences or skills mentioned in their background. Probe for details, decisions made, and outcomes. Use questions from the rubric's claim_verification section.\n\n`;
      if (candidate.resume_text) {
        prompt += `Candidate's background: ${candidate.resume_text.substring(0, 500)}...\n\n`;
      }
    } else if (phase === 'scenario') {
      prompt += `SCENARIO PHASE: Present realistic technical scenarios specific to this role. Ask how they would approach the problem. Use questions from the rubric's scenario section.\n\n`;
    } else if (phase === 'depth') {
      prompt += `DEPTH PROBING PHASE: Ask "why" and "what if" questions to understand their reasoning. Challenge assumptions constructively. Use questions from the rubric's depth section.\n\n`;
    } else if (phase === 'reflection') {
      prompt += `REFLECTION PHASE: Ask about learning, growth, and what they would do differently. Use questions from the rubric's reflection section.\n\n`;
    }

    // Add available questions for this phase
    if (rubric.question_bank && rubric.question_bank[phase]) {
      prompt += `Available questions for this phase:\n`;
      rubric.question_bank[phase].forEach((q, i) => {
        prompt += `${i + 1}. ${q}\n`;
      });
      prompt += `\nYou can use these questions as-is or adapt them based on the conversation.\n\n`;
    }

    // Add conversation history
    if (transcript && transcript.length > 0) {
      prompt += `Conversation so far:\n`;
      transcript.slice(-6).forEach(msg => {
        const speaker = msg.speaker === 'ai' ? 'You' : 'Candidate';
        prompt += `${speaker}: ${msg.text}\n`;
      });
      prompt += `\n`;
    }

    // Add stress level guidance
    if (stress_level === 'high') {
      prompt += `NOTE: Candidate appears stressed. Slow down, be reassuring, and avoid increasing difficulty suddenly. Consider saying something encouraging.\n\n`;
    }

    prompt += `Generate the next question. Keep it conversational and natural. Ask only ONE question.`;

    return prompt;
  }

  /**
   * Generate opening greeting
   */
  async generateOpening(job, candidate, language = 'en') {
    const languageMap = {
      'en': 'English',
      'es': 'Spanish',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'fr': 'French'
    };

    const targetLanguage = languageMap[language] || 'English';

    const prompt = `You are starting an interview for the position: ${job.title}

Language: ${targetLanguage}

Generate a warm, professional opening greeting that:
1. Welcomes the candidate by name (${candidate.full_name})
2. Briefly introduces yourself as an AI interviewer
3. Explains the interview will take about ${job.duration_minutes || 15} minutes
4. Mentions you'll ask about their background and technical experience
5. Encourages them to think out loud and ask for clarification if needed
6. Keeps it concise (2-3 sentences)

Make it natural and encouraging, not robotic.`;

    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt }
    ];

    return await chatCompletion(messages, {
      temperature: 0.8,
      max_tokens: 200
    });
  }

  /**
   * Generate closing remarks
   */
  async generateClosing(language = 'en') {
    const languageMap = {
      'en': 'English',
      'es': 'Spanish',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'fr': 'French'
    };

    const targetLanguage = languageMap[language] || 'English';

    const prompt = `Generate a professional closing statement in ${targetLanguage} that:
1. Thanks the candidate for their time
2. Explains the company will review the interview
3. Mentions they'll hear back soon
4. Wishes them well
5. Keeps it brief (1-2 sentences)`;

    const messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: prompt }
    ];

    return await chatCompletion(messages, {
      temperature: 0.7,
      max_tokens: 150
    });
  }
}

export default new InterviewerAgent();
