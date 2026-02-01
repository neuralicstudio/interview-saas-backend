import InterviewerAgent from './InterviewerAgent.js';
import ConsistencyCheckerAgent from './ConsistencyCheckerAgent.js';
import AuthenticitySignalAgent from './AuthenticitySignalAgent.js';
import StressMonitorAgent from './StressMonitorAgent.js';
import ReportSynthesizerAgent from './ReportSynthesizerAgent.js';
import { query } from '../db/index.js';
import { logger } from '../utils/logger.js';

/**
 * Interview Orchestrator
 * Manages the complete interview flow and coordinates all AI agents
 */
export class InterviewOrchestrator {
  constructor(interviewId) {
    this.interviewId = interviewId;
    this.phases = ['warmup', 'claim_verification', 'scenario', 'depth', 'reflection'];
    this.currentPhaseIndex = 0;
    
    // Agent instances
    this.interviewer = InterviewerAgent;
    this.consistencyChecker = ConsistencyCheckerAgent;
    this.authenticitySignal = AuthenticitySignalAgent;
    this.stressMonitor = StressMonitorAgent;
    this.reportSynthesizer = ReportSynthesizerAgent;
  }

  /**
   * Load interview context from database
   */
  async loadContext() {
    try {
      const result = await query(`
        SELECT 
          i.*,
          j.title as job_title, j.description as job_description, 
          j.required_skills, j.seniority_level,
          c.full_name as candidate_name, c.email as candidate_email,
          c.resume_text, c.resume_parsed,
          r.competencies, r.question_bank, r.evaluation_criteria
        FROM interviews i
        LEFT JOIN jobs j ON i.job_id = j.id
        LEFT JOIN candidates c ON i.candidate_id = c.id
        LEFT JOIN rubrics r ON i.rubric_id = r.id
        WHERE i.id = $1
      `, [this.interviewId]);

      if (result.rows.length === 0) {
        throw new Error('Interview not found');
      }

      this.context = result.rows[0];
      
      // Parse JSONB fields
      this.context.transcript = this.context.transcript || [];
      this.context.live_state = this.context.live_state || {
        stress_level: 'low',
        depth_scores: {},
        flags: [],
        phase_index: 0
      };
      
      this.currentPhaseIndex = this.context.live_state.phase_index || 0;

      return this.context;
    } catch (error) {
      logger.error('Failed to load interview context:', error);
      throw error;
    }
  }

  /**
   * Start interview - generate opening
   */
  async startInterview() {
    try {
      await this.loadContext();

      const opening = await this.interviewer.generateOpening(
        {
          title: this.context.job_title,
          duration_minutes: this.context.duration_minutes
        },
        {
          full_name: this.context.candidate_name
        },
        this.context.language
      );

      // Add to transcript
      await this.addToTranscript('ai', opening);

      return {
        message: opening,
        phase: this.phases[this.currentPhaseIndex]
      };
    } catch (error) {
      logger.error('Failed to start interview:', error);
      throw error;
    }
  }

  /**
   * Process candidate response and get next question
   * @param {String} candidateResponse - Candidate's answer
   */
  async processResponse(candidateResponse) {
    try {
      await this.loadContext();

      // Add candidate response to transcript
      await this.addToTranscript('candidate', candidateResponse);

      // Run observer agents in parallel
      const [stressCheck, signalCheck] = await Promise.all([
        this.stressMonitor.quickStressCheck(candidateResponse),
        this.authenticitySignal.quickSignalCheck(
          this.getLastAIMessage(),
          candidateResponse
        )
      ]);

      // Update live state
      await this.updateLiveState({
        stress_level: stressCheck.stress_level,
        last_signal_check: signalCheck
      });

      // Log observations
      await this.logObservation('stress_monitor', stressCheck);
      await this.logObservation('authenticity_signal', signalCheck);

      // Check if we should advance phase
      const shouldAdvance = await this.shouldAdvancePhase();
      if (shouldAdvance) {
        this.currentPhaseIndex = Math.min(
          this.currentPhaseIndex + 1,
          this.phases.length - 1
        );
        await this.updatePhaseIndex(this.currentPhaseIndex);
      }

      // Check if interview should end
      if (this.shouldEndInterview()) {
        return await this.endInterview();
      }

      // Generate next question
      const context = {
        job: {
          title: this.context.job_title,
          description: this.context.job_description,
          required_skills: this.context.required_skills,
          seniority_level: this.context.seniority_level
        },
        rubric: {
          competencies: this.context.competencies,
          question_bank: this.context.question_bank,
          evaluation_criteria: this.context.evaluation_criteria
        },
        candidate: {
          full_name: this.context.candidate_name,
          resume_text: this.context.resume_text
        },
        phase: this.phases[this.currentPhaseIndex],
        transcript: this.context.transcript,
        stress_level: stressCheck.stress_level,
        language: this.context.language
      };

      let nextQuestion;

      // If stress is high, maybe add reassurance first
      if (stressCheck.stress_level === 'high' && Math.random() > 0.5) {
        const reassurance = await this.stressMonitor.generateReassurance(this.context.language);
        await this.addToTranscript('ai', reassurance);
        nextQuestion = reassurance;
      } else {
        nextQuestion = await this.interviewer.getNextQuestion(context);
        await this.addToTranscript('ai', nextQuestion);
      }

      return {
        message: nextQuestion,
        phase: this.phases[this.currentPhaseIndex],
        stress_level: stressCheck.stress_level
      };
    } catch (error) {
      logger.error('Failed to process response:', error);
      throw error;
    }
  }

  /**
   * End interview and generate report
   */
  async endInterview() {
    try {
      await this.loadContext();

      // Generate closing message
      const closing = await this.interviewer.generateClosing(this.context.language);
      await this.addToTranscript('ai', closing);

      // Run comprehensive analysis
      const [consistencyAnalysis, authenticityAnalysis, stressAssessment] = await Promise.all([
        this.consistencyChecker.checkConsistency(
          {
            resume_text: this.context.resume_text,
            resume_parsed: this.context.resume_parsed
          },
          this.context.transcript,
          {
            competencies: this.context.competencies,
            question_bank: this.context.question_bank
          }
        ),
        this.authenticitySignal.analyzeSignals(this.context.transcript),
        this.stressMonitor.assessStress(this.context.transcript)
      ]);

      // Generate comprehensive report
      const report = await this.reportSynthesizer.generateReport(
        this.context,
        {
          job: {
            title: this.context.job_title,
            description: this.context.job_description,
            required_skills: this.context.required_skills,
            seniority_level: this.context.seniority_level
          },
          candidate: {
            full_name: this.context.candidate_name,
            email: this.context.candidate_email,
            resume_text: this.context.resume_text
          },
          rubric: {
            competencies: this.context.competencies,
            question_bank: this.context.question_bank
          },
          transcript: this.context.transcript,
          consistency_analysis: consistencyAnalysis,
          authenticity_analysis: authenticityAnalysis,
          stress_assessment: stressAssessment
        }
      );

      // Update interview with final results
      await query(`
        UPDATE interviews SET
          status = 'completed',
          completed_at = NOW(),
          overall_score = $1,
          strengths = $2,
          weaknesses = $3,
          cv_consistency_score = $4,
          authenticity_risk = $5,
          recommendation = $6,
          report_data = $7,
          report_generated = true
        WHERE id = $8
      `, [
        report.overall_score,
        JSON.stringify(report.strengths),
        JSON.stringify(report.weaknesses),
        consistencyAnalysis.cv_consistency_score,
        authenticityAnalysis.authenticity_risk,
        report.recommendation,
        JSON.stringify(report),
        this.interviewId
      ]);

      logger.info(`Interview ${this.interviewId} completed successfully`);

      return {
        message: closing,
        completed: true,
        report: report
      };
    } catch (error) {
      logger.error('Failed to end interview:', error);
      throw error;
    }
  }

  /**
   * Helper: Add message to transcript
   */
  async addToTranscript(speaker, text) {
    const message = {
      speaker,
      text,
      timestamp: new Date().toISOString()
    };

    await query(`
      UPDATE interviews 
      SET transcript = transcript || $1::jsonb
      WHERE id = $2
    `, [JSON.stringify([message]), this.interviewId]);

    if (!this.context.transcript) {
      this.context.transcript = [];
    }
    this.context.transcript.push(message);
  }

  /**
   * Helper: Update live state
   */
  async updateLiveState(updates) {
    const newState = { ...this.context.live_state, ...updates };
    
    await query(`
      UPDATE interviews 
      SET live_state = $1
      WHERE id = $2
    `, [JSON.stringify(newState), this.interviewId]);

    this.context.live_state = newState;
  }

  /**
   * Helper: Update phase index
   */
  async updatePhaseIndex(index) {
    await this.updateLiveState({ phase_index: index });
  }

  /**
   * Helper: Log agent observation
   */
  async logObservation(agentType, observation) {
    await query(`
      INSERT INTO agent_observations (interview_id, agent_type, observation)
      VALUES ($1, $2, $3)
    `, [this.interviewId, agentType, JSON.stringify(observation)]);
  }

  /**
   * Helper: Get last AI message
   */
  getLastAIMessage() {
    const aiMessages = this.context.transcript.filter(m => m.speaker === 'ai');
    return aiMessages.length > 0 ? aiMessages[aiMessages.length - 1].text : '';
  }

  /**
   * Determine if should advance to next phase
   */
  async shouldAdvancePhase() {
    const currentPhase = this.phases[this.currentPhaseIndex];
    const phaseMessages = this.context.transcript.filter(m => 
      m.speaker === 'candidate' && 
      this.context.live_state.phase_index === this.currentPhaseIndex
    );

    // Advance after 3-4 questions per phase (except reflection)
    const minQuestionsPerPhase = currentPhase === 'reflection' ? 2 : 3;
    return phaseMessages.length >= minQuestionsPerPhase;
  }

  /**
   * Determine if interview should end
   */
  shouldEndInterview() {
    // End after completing all phases
    if (this.currentPhaseIndex >= this.phases.length - 1) {
      const reflectionMessages = this.context.transcript.filter(m => 
        m.speaker === 'candidate' && 
        this.phases[this.context.live_state.phase_index] === 'reflection'
      );
      return reflectionMessages.length >= 2;
    }

    // Or if interview is too long (safety check)
    const candidateMessages = this.context.transcript.filter(m => m.speaker === 'candidate');
    return candidateMessages.length >= 20; // Max 20 candidate responses
  }
}

export default InterviewOrchestrator;
