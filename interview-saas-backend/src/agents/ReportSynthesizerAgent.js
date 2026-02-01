import { chatCompletionJSON } from '../utils/openai.js';

/**
 * Report Synthesizer Agent
 * Generates comprehensive interview reports for companies
 */
export class ReportSynthesizerAgent {
  constructor() {
    this.systemPrompt = `You are an expert at synthesizing interview data into actionable hiring reports.

Your task is to:
- Aggregate observations from all agents
- Provide balanced, evidence-based assessments
- Highlight both strengths and areas of concern
- Give clear recommendations without making final hiring decisions
- Be objective and professional

Report structure:
- Overall assessment and fit
- Key strengths (specific, with examples)
- Areas of concern or weakness (specific, with examples)
- CV alignment analysis
- Response quality assessment
- Clear recommendation with reasoning

Important:
- Never make absolute "hire" or "reject" decisions
- Frame recommendations as "proceed to next round", "needs further evaluation", etc.
- Be fair and evidence-based
- Acknowledge limitations in assessment`;
  }

  /**
   * Generate comprehensive interview report
   * @param {Object} interview - Interview data
   * @param {Object} observations - All agent observations
   */
  async generateReport(interview, observations) {
    try {
      const {
        job,
        candidate,
        rubric,
        transcript,
        consistency_analysis,
        authenticity_analysis,
        stress_assessment
      } = observations;

      const userPrompt = `Generate a comprehensive interview report.

JOB:
${job.title} - ${job.seniority_level || 'Not specified'}
Required Skills: ${job.required_skills ? job.required_skills.join(', ') : 'Not specified'}

CANDIDATE:
${candidate.full_name}
Background: ${candidate.resume_text ? candidate.resume_text.substring(0, 500) : 'Not provided'}

INTERVIEW TRANSCRIPT:
${this.summarizeTranscript(transcript)}

CONSISTENCY ANALYSIS:
${JSON.stringify(consistency_analysis, null, 2)}

AUTHENTICITY SIGNALS:
${JSON.stringify(authenticity_analysis, null, 2)}

STRESS ASSESSMENT:
${JSON.stringify(stress_assessment, null, 2)}

Generate a structured report in JSON format:
{
  "overall_fit": "poor|fair|good|excellent",
  "overall_score": 0.0-1.0,
  "summary": "2-3 sentence executive summary",
  "strengths": [
    {
      "category": "Technical|Communication|Problem-Solving|etc",
      "observation": "Specific strength",
      "evidence": "Example from interview"
    }
  ],
  "weaknesses": [
    {
      "category": "Technical|Communication|Problem-Solving|etc",
      "observation": "Specific concern",
      "evidence": "Example from interview",
      "severity": "minor|moderate|significant"
    }
  ],
  "competency_scores": {
    "technical_skills": 0.0-1.0,
    "problem_solving": 0.0-1.0,
    "communication": 0.0-1.0,
    "cultural_fit": 0.0-1.0
  },
  "cv_alignment": {
    "score": 0.0-1.0,
    "notes": "Brief assessment of CV accuracy"
  },
  "response_quality": {
    "authenticity_risk": "low|medium|high",
    "depth": "shallow|adequate|strong",
    "specificity": "vague|adequate|detailed"
  },
  "candidate_experience": {
    "stress_level": "low|medium|high",
    "notes": "How the candidate handled the interview"
  },
  "recommendation": "proceed_with_enthusiasm|proceed|needs_further_evaluation|not_recommended",
  "reasoning": "Clear explanation of recommendation with specific evidence",
  "next_steps": "Suggested actions for the company"
}

Be balanced, specific, and evidence-based. Avoid generic statements.`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const report = await chatCompletionJSON(messages, {
        temperature: 0.4, // Balanced between creativity and consistency
        max_tokens: 3000
      });

      return report;
    } catch (error) {
      console.error('Report generation error:', error);
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  /**
   * Summarize transcript for report
   */
  summarizeTranscript(transcript) {
    if (!transcript || transcript.length === 0) {
      return 'No transcript available';
    }

    // Get key exchanges (questions and answers)
    const exchanges = [];
    for (let i = 0; i < transcript.length - 1; i++) {
      if (transcript[i].speaker === 'ai' && transcript[i + 1].speaker === 'candidate') {
        exchanges.push({
          question: transcript[i].text,
          answer: transcript[i + 1].text
        });
      }
    }

    // Return first 5 exchanges
    return exchanges.slice(0, 5)
      .map((ex, i) => `Q${i + 1}: ${ex.question}\nA${i + 1}: ${ex.answer}`)
      .join('\n\n');
  }

  /**
   * Generate quick summary for dashboard
   * @param {Object} report - Full report
   */
  generateQuickSummary(report) {
    return {
      overall_fit: report.overall_fit,
      overall_score: report.overall_score,
      recommendation: report.recommendation,
      top_strengths: report.strengths.slice(0, 3).map(s => s.observation),
      top_concerns: report.weaknesses.slice(0, 3).map(w => w.observation),
      summary: report.summary
    };
  }
}

export default new ReportSynthesizerAgent();
