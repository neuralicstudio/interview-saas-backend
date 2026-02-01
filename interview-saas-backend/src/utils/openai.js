import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize OpenAI client
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model configurations
export const MODELS = {
  GPT4_TURBO: 'gpt-4-turbo-preview',
  GPT4: 'gpt-4',
  GPT35_TURBO: 'gpt-3.5-turbo',
  WHISPER: 'whisper-1',
  TTS: 'tts-1',
  VISION: 'gpt-4-vision-preview'
};

/**
 * Make an OpenAI chat completion request
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Additional options (model, temperature, etc.)
 */
export const chatCompletion = async (messages, options = {}) => {
  try {
    const response = await openai.chat.completions.create({
      model: options.model || MODELS.GPT4_TURBO,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
      ...options
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('OpenAI API Error:', error);
    throw new Error(`OpenAI request failed: ${error.message}`);
  }
};

/**
 * Make an OpenAI chat completion with JSON response
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Additional options
 */
export const chatCompletionJSON = async (messages, options = {}) => {
  try {
    const response = await openai.chat.completions.create({
      model: options.model || MODELS.GPT4_TURBO,
      messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
      response_format: { type: "json_object" },
      ...options
    });
    
    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('OpenAI JSON API Error:', error);
    throw new Error(`OpenAI JSON request failed: ${error.message}`);
  }
};

/**
 * Transcribe audio using Whisper
 * @param {Buffer} audioBuffer - Audio file buffer
 * @param {String} language - Language code (optional)
 */
export const transcribeAudio = async (audioBuffer, language = null) => {
  try {
    const response = await openai.audio.transcriptions.create({
      file: audioBuffer,
      model: MODELS.WHISPER,
      language: language || undefined
    });
    
    return response.text;
  } catch (error) {
    console.error('Whisper API Error:', error);
    throw new Error(`Audio transcription failed: ${error.message}`);
  }
};

/**
 * Analyze image with GPT-4 Vision
 * @param {String} imageUrl - URL or base64 image
 * @param {String} prompt - Analysis prompt
 */
export const analyzeImage = async (imageUrl, prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: MODELS.VISION,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500
    });
    
    return response.choices[0].message.content;
  } catch (error) {
    console.error('Vision API Error:', error);
    throw new Error(`Image analysis failed: ${error.message}`);
  }
};

export default openai;
