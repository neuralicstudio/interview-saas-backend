import { Server } from 'socket.io';
import VoiceService from './VoiceService.js';
import InterviewOrchestrator from '../agents/InterviewOrchestrator.js';
import { logger } from '../utils/logger.js';
import { query } from '../db/index.js';

/**
 * WebSocket Service for Real-Time Voice Interviews
 * Handles bidirectional communication between candidate and AI
 */
export class WebSocketService {
  constructor(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST']
      },
      maxHttpBufferSize: 10e6 // 10MB for audio chunks
    });

    this.activeSessions = new Map(); // Store active interview sessions
    this.setupSocketHandlers();
  }

  /**
   * Setup Socket.IO event handlers
   */
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Join interview room
      socket.on('join-interview', async (data) => {
        await this.handleJoinInterview(socket, data);
      });

      // Start interview
      socket.on('start-interview', async (data) => {
        await this.handleStartInterview(socket, data);
      });

      // Candidate sends audio
      socket.on('audio-chunk', async (data) => {
        await this.handleAudioChunk(socket, data);
      });

      // Candidate stops speaking
      socket.on('audio-complete', async (data) => {
        await this.handleAudioComplete(socket, data);
      });

      // End interview
      socket.on('end-interview', async (data) => {
        await this.handleEndInterview(socket, data);
      });

      // Disconnect
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // Error handling
      socket.on('error', (error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
      });
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Handle candidate joining interview room
   */
  async handleJoinInterview(socket, data) {
    try {
      const { interviewId, token } = data;

      // Verify interview exists and token is valid
      const result = await query(`
        SELECT i.*, j.language, j.title as job_title,
               c.full_name as candidate_name, co.name as company_name
        FROM interviews i
        JOIN interview_invites inv ON i.id = inv.interview_id
        JOIN jobs j ON i.job_id = j.id
        JOIN candidates c ON i.candidate_id = c.id
        JOIN companies co ON i.company_id = co.id
        WHERE i.id = $1 AND inv.token = $2 AND inv.expires_at > NOW()
      `, [interviewId, token]);

      if (result.rows.length === 0) {
        socket.emit('error', { message: 'Invalid interview or token' });
        return;
      }

      const interview = result.rows[0];

      // Join room
      socket.join(`interview-${interviewId}`);
      
      // Store session
      this.activeSessions.set(socket.id, {
        interviewId,
        audioChunks: [], // Buffer for audio chunks
        language: interview.language,
        startTime: Date.now()
      });

      socket.emit('joined', {
        interviewId,
        language: interview.language,
        jobTitle: interview.job_title,
        companyName: interview.company_name
      });

      logger.info(`Client ${socket.id} joined interview ${interviewId}`);
    } catch (error) {
      logger.error('Join interview error:', error);
      socket.emit('error', { message: 'Failed to join interview' });
    }
  }

  /**
   * Handle interview start
   */
  async handleStartInterview(socket, data) {
    try {
      const session = this.activeSessions.get(socket.id);
      if (!session) {
        socket.emit('error', { message: 'No active session' });
        return;
      }

      const { interviewId, language } = session;

      // Create orchestrator
      const orchestrator = new InterviewOrchestrator(interviewId);
      session.orchestrator = orchestrator;

      // Start interview and get opening message
      const result = await orchestrator.startInterview();

      // Convert opening text to speech
      const audioBuffer = await VoiceService.textToSpeech(
        result.message,
        language
      );

      // Send audio to client
      socket.emit('ai-speaking', {
        text: result.message,
        audio: audioBuffer.toString('base64'),
        phase: result.phase
      });

      logger.info(`Interview ${interviewId} started`);
    } catch (error) {
      logger.error('Start interview error:', error);
      socket.emit('error', { message: 'Failed to start interview' });
    }
  }

  /**
   * Handle incoming audio chunks from candidate
   */
  async handleAudioChunk(socket, data) {
    try {
      const session = this.activeSessions.get(socket.id);
      if (!session) {
        return;
      }

      const { chunk } = data;
      
      // Buffer audio chunks
      session.audioChunks.push(Buffer.from(chunk, 'base64'));

      // Optional: Send recording indicator
      socket.emit('recording', { status: 'receiving' });
    } catch (error) {
      logger.error('Audio chunk error:', error);
    }
  }

  /**
   * Handle complete audio from candidate (candidate stopped speaking)
   */
  async handleAudioComplete(socket, data) {
    try {
      const session = this.activeSessions.get(socket.id);
      if (!session || !session.orchestrator) {
        socket.emit('error', { message: 'No active interview session' });
        return;
      }

      const { interviewId, language, audioChunks, orchestrator } = session;

      // Combine audio chunks
      const completeAudio = Buffer.concat(audioChunks);
      
      // Clear chunks for next response
      session.audioChunks = [];

      // Emit processing status
      socket.emit('ai-thinking', { status: 'transcribing' });

      // Transcribe audio to text
      const transcribedText = await VoiceService.speechToText(completeAudio, language);

      logger.info(`Transcribed: ${transcribedText.substring(0, 100)}`);

      // Emit transcription to client (for display)
      socket.emit('transcription', { text: transcribedText });

      // Update status
      socket.emit('ai-thinking', { status: 'analyzing' });

      // Process response with orchestrator
      const result = await orchestrator.processResponse(transcribedText);

      if (result.completed) {
        // Interview is complete
        socket.emit('interview-complete', {
          message: result.message,
          report: result.report_preview
        });

        // Generate final audio
        const audioBuffer = await VoiceService.textToSpeech(
          result.message,
          language
        );

        socket.emit('ai-speaking', {
          text: result.message,
          audio: audioBuffer.toString('base64'),
          completed: true
        });

        // Clean up session
        this.activeSessions.delete(socket.id);
      } else {
        // Continue interview - generate next question audio
        const audioBuffer = await VoiceService.textToSpeech(
          result.message,
          language
        );

        socket.emit('ai-speaking', {
          text: result.message,
          audio: audioBuffer.toString('base64'),
          phase: result.phase,
          stressLevel: result.stress_level
        });
      }

      logger.info(`Processed response for interview ${interviewId}`);
    } catch (error) {
      logger.error('Audio complete error:', error);
      socket.emit('error', { message: 'Failed to process audio' });
    }
  }

  /**
   * Handle interview end
   */
  async handleEndInterview(socket, data) {
    try {
      const session = this.activeSessions.get(socket.id);
      if (!session || !session.orchestrator) {
        return;
      }

      const { orchestrator, language } = session;

      // End interview
      const result = await orchestrator.endInterview();

      // Generate final audio
      const audioBuffer = await VoiceService.textToSpeech(
        result.message,
        language
      );

      socket.emit('interview-ended', {
        message: result.message,
        audio: audioBuffer.toString('base64'),
        report: result.report
      });

      // Clean up
      this.activeSessions.delete(socket.id);
      socket.leave(`interview-${session.interviewId}`);

      logger.info(`Interview ${session.interviewId} ended`);
    } catch (error) {
      logger.error('End interview error:', error);
      socket.emit('error', { message: 'Failed to end interview' });
    }
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(socket) {
    const session = this.activeSessions.get(socket.id);
    
    if (session) {
      logger.info(`Client ${socket.id} disconnected from interview ${session.interviewId}`);
      this.activeSessions.delete(socket.id);
    } else {
      logger.info(`Client ${socket.id} disconnected`);
    }
  }

  /**
   * Broadcast message to all clients in an interview room
   */
  broadcastToInterview(interviewId, event, data) {
    this.io.to(`interview-${interviewId}`).emit(event, data);
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }
}

export default WebSocketService;
