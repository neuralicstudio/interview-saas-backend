const socketIo = require('socket.io');
const { logger } = require('../utils/logger');  // ✅ Fixed - destructured
const VoiceService = require('./VoiceService');
const InterviewOrchestrator = require('../agents/InterviewOrchestrator');
const { query } = require('../db');

class WebSocketService {
  constructor(server) {
    this.io = socketIo(server, {
      cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.sessions = new Map(); // Store active interview sessions
    this.voiceService = new VoiceService();
    this.initializeSocketEvents();
    
    logger.info('WebSocket service initialized');
  }

  initializeSocketEvents() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // ============================================
      // CANDIDATE EVENTS
      // ============================================

      // Candidate joins interview
      socket.on('join-interview', async (data) => {
        await this.handleCandidateJoin(socket, data);
      });

      // Candidate sends audio chunk
      socket.on('candidate-audio', async (data) => {
        await this.handleCandidateAudio(socket, data);
      });

      // Candidate sends video frame (for vision analysis)
      socket.on('candidate-video-frame', async (data) => {
        await this.handleCandidateVideoFrame(socket, data);
      });

      // Candidate sends text response (if using text mode)
      socket.on('candidate-text', async (data) => {
        await this.handleCandidateText(socket, data);
      });

      // ============================================
      // HR SUPERVISOR EVENTS (NEW)
      // ============================================

      // HR joins as observer
      socket.on('hr-join', async (data) => {
        await this.handleHRJoin(socket, data);
      });

      // HR reveals themselves to candidate
      socket.on('hr-reveal', async (data) => {
        await this.handleHRReveal(socket, data);
      });

      // HR toggles audio
      socket.on('hr-audio-toggle', async (data) => {
        await this.handleHRAudioToggle(socket, data);
      });

      // HR toggles video
      socket.on('hr-video-toggle', async (data) => {
        await this.handleHRVideoToggle(socket, data);
      });

      // HR sends audio to candidate
      socket.on('hr-audio', async (data) => {
        await this.handleHRAudio(socket, data);
      });

      // HR sends video to candidate
      socket.on('hr-video', async (data) => {
        await this.handleHRVideo(socket, data);
      });

      // HR pauses interview
      socket.on('hr-pause', async (data) => {
        await this.handleHRPause(socket, data);
      });

      // HR ends interview
      socket.on('hr-end-interview', async (data) => {
        await this.handleHREndInterview(socket, data);
      });

      // HR takes private note
      socket.on('hr-note', async (data) => {
        await this.handleHRNote(socket, data);
      });

      // ============================================
      // GENERAL EVENTS
      // ============================================

      // Client disconnects
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Error handling
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  // ============================================
  // CANDIDATE HANDLERS
  // ============================================

  async handleCandidateJoin(socket, data) {
    const { interviewId, candidateId, token } = data;

    try {
      // Verify interview exists and is valid
      const interview = await query(
        'SELECT * FROM interviews WHERE id = $1',
        [interviewId]
      );

      if (interview.rows.length === 0) {
        socket.emit('error', { message: 'Interview not found' });
        return;
      }

      const interviewData = interview.rows[0];

      // Check if interview is already in progress or completed
      if (interviewData.status === 'completed') {
        socket.emit('error', { message: 'Interview already completed' });
        return;
      }

      // Create or get existing session
      let session = this.sessions.get(interviewId);
      
      if (!session) {
        // Initialize new session
        session = {
          interviewId,
          candidateId,
          candidateSocketId: socket.id,
          status: 'active',
          orchestrator: new InterviewOrchestrator(interviewId),
          transcript: [],
          currentQuestion: null,
          questionCount: 0,
          hrObservers: [],
          hrPresent: false,
          isPaused: false,
          startedAt: new Date()
        };

        // Update interview status to in_progress
        await query(
          'UPDATE interviews SET status = $1, started_at = NOW() WHERE id = $2',
          ['in_progress', interviewId]
        );

        // Start the interview with AI
        await this.startInterview(session);
      } else {
        // Candidate rejoining
        session.candidateSocketId = socket.id;
      }

      this.sessions.set(interviewId, session);

      // Notify candidate they've joined
      socket.emit('interview-joined', {
        message: 'Successfully joined interview',
        interviewId,
        currentQuestion: session.currentQuestion,
        questionCount: session.questionCount,
        hrPresent: session.hrObservers.some(obs => obs.visible)
      });

      // Notify HR observers that candidate has joined (if any)
      this.notifyHRObservers(interviewId, 'candidate-joined', {
        candidateId,
        timestamp: new Date()
      });

      logger.info(`Candidate joined interview: ${interviewId}`);
    } catch (error) {
      logger.error('Error in handleCandidateJoin:', error);
      socket.emit('error', { message: 'Failed to join interview' });
    }
  }

  async startInterview(session) {
    try {
      // Get interview details
      const interview = await query(
        `SELECT i.*, j.title as job_title, j.required_skills, c.name as candidate_name
         FROM interviews i
         JOIN jobs j ON i.job_id = j.id
         JOIN candidates c ON i.candidate_id = c.id
         WHERE i.id = $1`,
        [session.interviewId]
      );

      const interviewData = interview.rows[0];

      // Initialize orchestrator
      await session.orchestrator.initialize({
        jobTitle: interviewData.job_title,
        requiredSkills: interviewData.required_skills,
        candidateName: interviewData.candidate_name
      });

      // Get first question
      const firstQuestion = await session.orchestrator.getNextQuestion();
      
      if (firstQuestion) {
        session.currentQuestion = firstQuestion;
        session.questionCount = 1;

        // Generate AI voice for the question
        const audioBuffer = await this.voiceService.textToSpeech(firstQuestion.text);

        // Send question to candidate
        this.io.to(session.candidateSocketId).emit('ai-question', {
          questionNumber: session.questionCount,
          question: firstQuestion.text,
          audio: audioBuffer.toString('base64'),
          timestamp: new Date()
        });

        // Add to transcript
        session.transcript.push({
          speaker: 'AI',
          text: firstQuestion.text,
          timestamp: new Date()
        });

        // Notify HR observers
        this.notifyHRObservers(session.interviewId, 'transcript-update', {
          transcript: session.transcript
        });
      }

      logger.info(`Interview started: ${session.interviewId}`);
    } catch (error) {
      logger.error('Error starting interview:', error);
      throw error;
    }
  }

  async handleCandidateAudio(socket, data) {
    const { interviewId, audioChunk } = data;
    const session = this.sessions.get(interviewId);

    if (!session || session.isPaused) {
      return;
    }

    try {
      // Convert audio to text using Whisper
      const audioBuffer = Buffer.from(audioChunk, 'base64');
      const transcription = await this.voiceService.speechToText(audioBuffer);

      if (!transcription || transcription.trim().length === 0) {
        return; // Ignore empty audio
      }

      // Add to transcript
      session.transcript.push({
        speaker: 'Candidate',
        text: transcription,
        timestamp: new Date()
      });

      // Notify candidate of their transcription
      this.io.to(session.candidateSocketId).emit('transcription', {
        text: transcription,
        timestamp: new Date()
      });

      // Process the response with orchestrator
      await session.orchestrator.processResponse(
        session.currentQuestion,
        transcription
      );

      // Get next question
      const nextQuestion = await session.orchestrator.getNextQuestion();

      if (nextQuestion) {
        session.currentQuestion = nextQuestion;
        session.questionCount++;

        // Generate AI voice
        const audioBuffer = await this.voiceService.textToSpeech(nextQuestion.text);

        // Send to candidate
        this.io.to(session.candidateSocketId).emit('ai-question', {
          questionNumber: session.questionCount,
          question: nextQuestion.text,
          audio: audioBuffer.toString('base64'),
          timestamp: new Date()
        });

        // Add to transcript
        session.transcript.push({
          speaker: 'AI',
          text: nextQuestion.text,
          timestamp: new Date()
        });
      } else {
        // Interview complete
        await this.endInterview(session);
      }

      // Update HR observers with transcript
      this.notifyHRObservers(interviewId, 'transcript-update', {
        transcript: session.transcript
      });

      this.sessions.set(interviewId, session);
    } catch (error) {
      logger.error('Error handling candidate audio:', error);
      socket.emit('error', { message: 'Failed to process audio' });
    }
  }

  async handleCandidateVideoFrame(socket, data) {
    const { interviewId, frameData } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    // Store frame for vision analysis (optional, can be processed in batches)
    if (!session.videoFrames) {
      session.videoFrames = [];
    }

    session.videoFrames.push({
      data: frameData,
      timestamp: new Date()
    });

    // Keep only last 10 frames to save memory
    if (session.videoFrames.length > 10) {
      session.videoFrames.shift();
    }

    this.sessions.set(interviewId, session);
  }

  async handleCandidateText(socket, data) {
    const { interviewId, text } = data;
    const session = this.sessions.get(interviewId);

    if (!session || session.isPaused) {
      return;
    }

    try {
      // Add to transcript
      session.transcript.push({
        speaker: 'Candidate',
        text: text,
        timestamp: new Date()
      });

      // Process with orchestrator
      await session.orchestrator.processResponse(
        session.currentQuestion,
        text
      );

      // Get next question
      const nextQuestion = await session.orchestrator.getNextQuestion();

      if (nextQuestion) {
        session.currentQuestion = nextQuestion;
        session.questionCount++;

        // Send to candidate
        this.io.to(session.candidateSocketId).emit('ai-question', {
          questionNumber: session.questionCount,
          question: nextQuestion.text,
          timestamp: new Date()
        });

        // Add to transcript
        session.transcript.push({
          speaker: 'AI',
          text: nextQuestion.text,
          timestamp: new Date()
        });
      } else {
        // Interview complete
        await this.endInterview(session);
      }

      // Update HR observers
      this.notifyHRObservers(interviewId, 'transcript-update', {
        transcript: session.transcript
      });

      this.sessions.set(interviewId, session);
    } catch (error) {
      logger.error('Error handling candidate text:', error);
      socket.emit('error', { message: 'Failed to process text' });
    }
  }

  async endInterview(session) {
    try {
      // Generate final report
      const report = await session.orchestrator.generateReport();

      // Update interview in database
      await query(
        `UPDATE interviews 
         SET status = $1, completed_at = NOW(), overall_score = $2, recommendation = $3
         WHERE id = $4`,
        ['completed', report.overallScore, report.recommendation, session.interviewId]
      );

      // Save transcript
      await query(
        'UPDATE interviews SET transcript = $1 WHERE id = $2',
        [JSON.stringify(session.transcript), session.interviewId]
      );

      // Notify candidate
      this.io.to(session.candidateSocketId).emit('interview-completed', {
        message: 'Interview completed successfully',
        report: report
      });

      // Notify HR observers
      this.notifyHRObservers(session.interviewId, 'interview-completed', {
        report: report
      });

      // Clean up session
      session.status = 'completed';
      this.sessions.set(session.interviewId, session);

      logger.info(`Interview completed: ${session.interviewId}`);
    } catch (error) {
      logger.error('Error ending interview:', error);
      throw error;
    }
  }

  // ============================================
  // HR SUPERVISOR HANDLERS (NEW)
  // ============================================

  async handleHRJoin(socket, data) {
    const { interviewId, hrUserId, hrName, hrEmail } = data;

    try {
      const session = this.sessions.get(interviewId);

      if (!session) {
        socket.emit('error', { message: 'Interview session not found' });
        return;
      }

      // Initialize HR observers array if not exists
      if (!session.hrObservers) {
        session.hrObservers = [];
      }

      // Check if HR already joined
      const existingObserver = session.hrObservers.find(obs => obs.userId === hrUserId);
      
      if (existingObserver) {
        // Update socket ID (HR reconnected)
        existingObserver.socketId = socket.id;
      } else {
        // Add new HR observer
        session.hrObservers.push({
          socketId: socket.id,
          userId: hrUserId,
          name: hrName,
          email: hrEmail,
          visible: false,  // Hidden by default
          audio: false,
          video: false,
          joinedAt: new Date()
        });

        // Save to database
        await query(
          `INSERT INTO interview_observers (interview_id, hr_user_id, hr_name, joined_at, was_visible)
           VALUES ($1, $2, $3, NOW(), false)`,
          [interviewId, hrUserId, hrName]
        );

        // Update observer count
        await query(
          `UPDATE interviews 
           SET hr_supervision_enabled = true, hr_observers_count = hr_observers_count + 1
           WHERE id = $1`,
          [interviewId]
        );
      }

      logger.info(`HR ${hrName} joined interview ${interviewId} as observer`);

      // Send current session state to HR
      socket.emit('observer-joined', {
        message: 'You are now observing the interview (hidden mode)',
        sessionState: {
          status: session.status,
          currentQuestion: session.currentQuestion,
          questionCount: session.questionCount,
          transcript: session.transcript || [],
          isPaused: session.isPaused,
          startedAt: session.startedAt,
          candidateId: session.candidateId
        }
      });

      this.sessions.set(interviewId, session);
    } catch (error) {
      logger.error('Error in handleHRJoin:', error);
      socket.emit('error', { message: 'Failed to join as observer' });
    }
  }

  async handleHRReveal(socket, data) {
    const { interviewId } = data;
    const session = this.sessions.get(interviewId);

    if (!session) {
      socket.emit('error', { message: 'Session not found' });
      return;
    }

    try {
      const hrObserver = session.hrObservers?.find(obs => obs.socketId === socket.id);
      
      if (!hrObserver) {
        socket.emit('error', { message: 'Observer not found' });
        return;
      }

      hrObserver.visible = true;

      // Update database
      await query(
        `UPDATE interview_observers 
         SET was_visible = true 
         WHERE interview_id = $1 AND hr_user_id = $2`,
        [interviewId, hrObserver.userId]
      );

      // Notify candidate that HR has joined
      if (session.candidateSocketId) {
        this.io.to(session.candidateSocketId).emit('participant-joined', {
          participantId: hrObserver.userId,
          name: hrObserver.name,
          role: 'HR Manager',
          type: 'hr',
          videoEnabled: hrObserver.video,
          audioEnabled: hrObserver.audio,
          timestamp: new Date()
        });
      }

      // Mark HR presence in session
      session.hrPresent = true;

      // Notify HR of successful reveal
      socket.emit('reveal-success', {
        message: 'You are now visible to the candidate'
      });

      this.sessions.set(interviewId, session);
      logger.info(`HR ${hrObserver.name} revealed themselves in interview ${interviewId}`);
    } catch (error) {
      logger.error('Error in handleHRReveal:', error);
      socket.emit('error', { message: 'Failed to reveal presence' });
    }
  }

  async handleHRAudioToggle(socket, data) {
    const { interviewId, enabled } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    const hrObserver = session.hrObservers?.find(obs => obs.socketId === socket.id);
    
    if (hrObserver) {
      hrObserver.audio = enabled;

      // Update database
      if (enabled) {
        await query(
          `UPDATE interview_observers 
           SET spoke_during_interview = true 
           WHERE interview_id = $1 AND hr_user_id = $2`,
          [interviewId, hrObserver.userId]
        );
      }

      // If HR is visible, notify candidate
      if (hrObserver.visible && session.candidateSocketId) {
        this.io.to(session.candidateSocketId).emit('participant-audio-changed', {
          participantId: hrObserver.userId,
          audioEnabled: enabled
        });
      }

      socket.emit('audio-toggle-success', { enabled });
      this.sessions.set(interviewId, session);
    }
  }

  async handleHRVideoToggle(socket, data) {
    const { interviewId, enabled } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    const hrObserver = session.hrObservers?.find(obs => obs.socketId === socket.id);
    
    if (hrObserver) {
      hrObserver.video = enabled;

      // If HR is visible, notify candidate
      if (hrObserver.visible && session.candidateSocketId) {
        this.io.to(session.candidateSocketId).emit('participant-video-changed', {
          participantId: hrObserver.userId,
          videoEnabled: enabled
        });
      }

      socket.emit('video-toggle-success', { enabled });
      this.sessions.set(interviewId, session);
    }
  }

  async handleHRAudio(socket, data) {
    const { interviewId, audioChunk } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    const hrObserver = session.hrObservers?.find(obs => obs.socketId === socket.id);
    
    if (hrObserver && hrObserver.visible && hrObserver.audio && session.candidateSocketId) {
      // Forward HR audio to candidate
      this.io.to(session.candidateSocketId).emit('hr-audio', {
        speakerId: hrObserver.userId,
        speakerName: hrObserver.name,
        audio: audioChunk
      });

      // Also forward to other HR observers
      session.hrObservers.forEach(obs => {
        if (obs.socketId !== socket.id) {
          this.io.to(obs.socketId).emit('hr-audio', {
            speakerId: hrObserver.userId,
            speakerName: hrObserver.name,
            audio: audioChunk
          });
        }
      });
    }
  }

  async handleHRVideo(socket, data) {
    const { interviewId, videoChunk } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    const hrObserver = session.hrObservers?.find(obs => obs.socketId === socket.id);
    
    if (hrObserver && hrObserver.visible && hrObserver.video && session.candidateSocketId) {
      // Forward HR video to candidate
      this.io.to(session.candidateSocketId).emit('hr-video', {
        speakerId: hrObserver.userId,
        speakerName: hrObserver.name,
        video: videoChunk
      });
    }
  }

  async handleHRPause(socket, data) {
    const { interviewId } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    try {
      session.isPaused = !session.isPaused;

      // Notify candidate
      if (session.candidateSocketId) {
        this.io.to(session.candidateSocketId).emit('interview-paused', {
          isPaused: session.isPaused,
          message: session.isPaused 
            ? 'Interview paused by HR' 
            : 'Interview resumed'
        });
      }

      // Notify all HR observers
      this.notifyHRObservers(interviewId, 'interview-pause-toggle', {
        isPaused: session.isPaused
      });

      this.sessions.set(interviewId, session);
      logger.info(`Interview ${interviewId} ${session.isPaused ? 'paused' : 'resumed'} by HR`);
    } catch (error) {
      logger.error('Error in handleHRPause:', error);
      socket.emit('error', { message: 'Failed to pause interview' });
    }
  }

  async handleHREndInterview(socket, data) {
    const { interviewId } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    try {
      // End interview immediately
      await this.endInterview(session);

      // Notify candidate
      if (session.candidateSocketId) {
        this.io.to(session.candidateSocketId).emit('interview-ended-by-hr', {
          message: 'Interview ended by HR supervisor'
        });
      }

      logger.info(`Interview ${interviewId} ended by HR`);
    } catch (error) {
      logger.error('Error in handleHREndInterview:', error);
      socket.emit('error', { message: 'Failed to end interview' });
    }
  }

  async handleHRNote(socket, data) {
    const { interviewId, note } = data;
    const session = this.sessions.get(interviewId);

    if (!session) return;

    try {
      const hrObserver = session.hrObservers?.find(obs => obs.socketId === socket.id);
      
      if (!hrObserver) {
        socket.emit('error', { message: 'Observer not found' });
        return;
      }

      // Save note to database
      await query(
        `INSERT INTO hr_interview_notes (interview_id, hr_user_id, note, timestamp)
         VALUES ($1, $2, $3, NOW())`,
        [interviewId, hrObserver.userId, note]
      );

      socket.emit('note-saved', { 
        message: 'Note saved successfully',
        timestamp: new Date()
      });

      logger.info(`HR note saved for interview ${interviewId}`);
    } catch (error) {
      logger.error('Error saving HR note:', error);
      socket.emit('error', { message: 'Failed to save note' });
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  notifyHRObservers(interviewId, eventName, data) {
    const session = this.sessions.get(interviewId);
    
    if (!session || !session.hrObservers) return;

    session.hrObservers.forEach(observer => {
      this.io.to(observer.socketId).emit(eventName, data);
    });
  }

  handleDisconnect(socket) {
    logger.info(`Client disconnected: ${socket.id}`);

    // Find and clean up any sessions associated with this socket
    for (const [interviewId, session] of this.sessions.entries()) {
      // Check if this is the candidate
      if (session.candidateSocketId === socket.id) {
        logger.info(`Candidate disconnected from interview: ${interviewId}`);
        // Don't delete session, candidate might reconnect
        session.candidateSocketId = null;
      }

      // Check if this is an HR observer
      if (session.hrObservers) {
        const observerIndex = session.hrObservers.findIndex(obs => obs.socketId === socket.id);
        
        if (observerIndex !== -1) {
          const observer = session.hrObservers[observerIndex];
          logger.info(`HR observer ${observer.name} disconnected from interview: ${interviewId}`);
          
          // Update database with left_at timestamp
          query(
            `UPDATE interview_observers 
             SET left_at = NOW() 
             WHERE interview_id = $1 AND hr_user_id = $2 AND left_at IS NULL`,
            [interviewId, observer.userId]
          ).catch(err => logger.error('Error updating observer left_at:', err));

          // Remove observer from session
          session.hrObservers.splice(observerIndex, 1);
          
          // Update observer count
          query(
            `UPDATE interviews 
             SET hr_observers_count = hr_observers_count - 1
             WHERE id = $1`,
            [interviewId]
          ).catch(err => logger.error('Error updating observer count:', err));
        }
      }

      this.sessions.set(interviewId, session);
    }
  }

  // Get active session by interview ID
  getSession(interviewId) {
    return this.sessions.get(interviewId);
  }

  // Get all active sessions
  getAllSessions() {
    return Array.from(this.sessions.values());
  }

  // Get count of active sessions
  getActiveSessionCount() {
    return this.sessions.size;
  }

  // Clean up completed sessions (call this periodically)
  cleanupSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [interviewId, session] of this.sessions.entries()) {
      const age = now - session.startedAt.getTime();
      
      if (session.status === 'completed' && age > maxAge) {
        this.sessions.delete(interviewId);
        logger.info(`Cleaned up session: ${interviewId}`);
      }
    }
  }
}

module.exports = WebSocketService;
