import { openai, MODELS } from '../utils/openai.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Voice Service
 * Handles text-to-speech (OpenAI TTS) and speech-to-text (Whisper)
 */
export class VoiceService {
  constructor() {
    // Available voices: alloy, echo, fable, onyx, nova, shimmer
    this.defaultVoice = 'nova'; // Professional, neutral
    
    // Audio format: mp3, opus, aac, flac
    this.audioFormat = 'mp3';
    
    // Speed: 0.25 to 4.0
    this.speechSpeed = 1.0; // Normal speed
  }

  /**
   * Convert text to speech using OpenAI TTS
   * @param {String} text - Text to convert
   * @param {String} language - Language code (en, es, ar, hi, fr)
   * @param {String} voice - Voice name (alloy, echo, fable, onyx, nova, shimmer)
   * @returns {Buffer} Audio buffer
   */
  async textToSpeech(text, language = 'en', voice = null) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('Text cannot be empty');
      }

      const selectedVoice = voice || this.defaultVoice;

      logger.info(`Generating speech: ${text.substring(0, 50)}...`, {
        language,
        voice: selectedVoice,
        length: text.length
      });

      const response = await openai.audio.speech.create({
        model: 'tts-1', // tts-1 is faster, tts-1-hd is higher quality
        voice: selectedVoice,
        input: text,
        speed: this.speechSpeed,
        response_format: this.audioFormat
      });

      // Convert response to buffer
      const buffer = Buffer.from(await response.arrayBuffer());

      logger.info(`Speech generated successfully`, {
        audioSize: buffer.length,
        voice: selectedVoice
      });

      return buffer;
    } catch (error) {
      logger.error('Text-to-speech error:', error);
      throw new Error(`TTS failed: ${error.message}`);
    }
  }

  /**
   * Convert text to speech and save to file
   * @param {String} text - Text to convert
   * @param {String} outputPath - Where to save audio file
   * @param {String} language - Language code
   * @param {String} voice - Voice name
   * @returns {String} File path
   */
  async textToSpeechFile(text, outputPath, language = 'en', voice = null) {
    try {
      const audioBuffer = await this.textToSpeech(text, language, voice);
      
      // Ensure directory exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Save to file
      fs.writeFileSync(outputPath, audioBuffer);

      logger.info(`Audio saved to: ${outputPath}`);
      
      return outputPath;
    } catch (error) {
      logger.error('Save audio file error:', error);
      throw error;
    }
  }

  /**
   * Convert speech to text using Whisper
   * @param {Buffer|String} audioInput - Audio buffer or file path
   * @param {String} language - Language code (optional, Whisper auto-detects)
   * @returns {String} Transcribed text
   */
  async speechToText(audioInput, language = null) {
    try {
      let audioFile;

      // If audioInput is a buffer, save to temp file first
      if (Buffer.isBuffer(audioInput)) {
        const tempPath = path.join(__dirname, '../../temp', `audio-${Date.now()}.mp3`);
        
        // Ensure temp directory exists
        const tempDir = path.dirname(tempPath);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        fs.writeFileSync(tempPath, audioInput);
        audioFile = fs.createReadStream(tempPath);
      } else if (typeof audioInput === 'string') {
        // audioInput is a file path
        audioFile = fs.createReadStream(audioInput);
      } else {
        throw new Error('Invalid audio input type');
      }

      logger.info(`Transcribing audio...`, { language });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: MODELS.WHISPER,
        language: language || undefined, // Auto-detect if not specified
        response_format: 'json'
      });

      logger.info(`Transcription successful`, {
        text: transcription.text.substring(0, 100),
        language: transcription.language || language
      });

      // Clean up temp file if we created one
      if (Buffer.isBuffer(audioInput)) {
        const tempPath = path.join(__dirname, '../../temp', `audio-${Date.now()}.mp3`);
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }

      return transcription.text;
    } catch (error) {
      logger.error('Speech-to-text error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Get language-specific voice (optional customization)
   * Different voices might sound better for different languages
   * @param {String} language - Language code
   * @returns {String} Recommended voice
   */
  getVoiceForLanguage(language) {
    const voiceMap = {
      'en': 'nova',    // English - neutral, professional
      'es': 'nova',    // Spanish - works well
      'ar': 'onyx',    // Arabic - deeper voice
      'hi': 'shimmer', // Hindi - clearer pronunciation
      'fr': 'nova'     // French - neutral
    };

    return voiceMap[language] || this.defaultVoice;
  }

  /**
   * Stream text-to-speech (for real-time responses)
   * Returns a readable stream instead of buffer
   * @param {String} text - Text to convert
   * @param {String} language - Language code
   * @param {String} voice - Voice name
   * @returns {ReadableStream} Audio stream
   */
  async textToSpeechStream(text, language = 'en', voice = null) {
    try {
      const selectedVoice = voice || this.getVoiceForLanguage(language);

      logger.info(`Streaming speech: ${text.substring(0, 50)}...`);

      const response = await openai.audio.speech.create({
        model: 'tts-1', // Use tts-1 for streaming (faster)
        voice: selectedVoice,
        input: text,
        speed: this.speechSpeed,
        response_format: this.audioFormat
      });

      return response.body;
    } catch (error) {
      logger.error('Stream TTS error:', error);
      throw new Error(`TTS streaming failed: ${error.message}`);
    }
  }

  /**
   * Validate audio file format
   * @param {String} filePath - Path to audio file
   * @returns {Boolean} Is valid
   */
  isValidAudioFormat(filePath) {
    const validExtensions = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];
    const ext = path.extname(filePath).toLowerCase();
    return validExtensions.includes(ext);
  }

  /**
   * Get audio duration (estimate based on file size)
   * @param {Buffer} audioBuffer - Audio buffer
   * @returns {Number} Estimated duration in seconds
   */
  estimateAudioDuration(audioBuffer) {
    // Rough estimate: MP3 at 128kbps ≈ 16KB per second
    const bytesPerSecond = 16000;
    return Math.ceil(audioBuffer.length / bytesPerSecond);
  }
}

module.exports = VoiceService;  // ✅ CORRECT
