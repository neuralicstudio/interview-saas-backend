import { openai, MODELS } from '../utils/openai.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

/**
 * Vision Analysis Service
 * Analyzes video frames using GPT-4 Vision
 */
export class VisionAnalysisService {
  constructor() {
    this.analysisPrompt = `You are an expert in analyzing body language, facial expressions, and non-verbal communication during job interviews.

Analyze this candidate's video frame and provide insights on:

1. **Eye Contact**: Are they maintaining good eye contact with the camera? (1-10 score)
2. **Facial Expression**: What emotions are visible? (confident, nervous, engaged, disengaged, enthusiastic, etc.)
3. **Posture**: Professional posture or slouching? (1-10 score)
4. **Energy Level**: High, medium, or low energy?
5. **Engagement**: Do they appear engaged and interested? (1-10 score)
6. **Professionalism**: Overall professional appearance? (1-10 score)
7. **Nervousness Signals**: Any visible signs of nervousness? (fidgeting, looking away, etc.)
8. **Confidence Level**: Overall confidence assessment (1-10 score)

Provide constructive, objective observations. Focus on behaviors, not judgments about the person.

Return your analysis as JSON:
{
  "eye_contact": { "score": 7, "observation": "Maintains steady eye contact" },
  "facial_expression": { "primary_emotion": "confident", "observation": "Calm, professional expression" },
  "posture": { "score": 8, "observation": "Upright, professional posture" },
  "energy_level": "medium",
  "engagement": { "score": 8, "observation": "Appears attentive and focused" },
  "professionalism": { "score": 9, "observation": "Professional appearance and demeanor" },
  "nervousness_signals": ["occasional hand movement"],
  "confidence_level": { "score": 7, "observation": "Shows good confidence with minor nervous indicators" },
  "overall_impression": "Professional, engaged candidate with good non-verbal communication"
}`;
  }

  /**
   * Analyze a single video frame
   * @param {String} imageBase64 - Base64 encoded image
   * @param {String} context - Additional context about the interview
   * @returns {Object} Analysis results
   */
  async analyzeSingleFrame(imageBase64, context = '') {
    try {
      logger.info('Analyzing video frame with GPT-4 Vision...');

      const messages = [
        {
          role: 'system',
          content: this.analysisPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: context || 'Analyze this interview video frame.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'low' // 'low' is cheaper, 'high' for more detail
              }
            }
          ]
        }
      ];

      const response = await openai.chat.completions.create({
        model: MODELS.GPT4_VISION,
        messages: messages,
        max_tokens: 1000,
        temperature: 0.3
      });

      const analysisText = response.choices[0].message.content;

      // Parse JSON from response
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Failed to parse vision analysis response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      logger.info('Video frame analyzed successfully');

      return analysis;
    } catch (error) {
      logger.error('Vision analysis error:', error);
      throw new Error(`Vision analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze multiple frames from a video interview
   * @param {Array} framesBase64 - Array of base64 encoded frames
   * @param {String} context - Interview context
   * @returns {Object} Aggregated analysis
   */
  async analyzeMultipleFrames(framesBase64, context = '') {
    try {
      logger.info(`Analyzing ${framesBase64.length} video frames...`);

      // Analyze each frame
      const frameAnalyses = await Promise.all(
        framesBase64.map(frame => this.analyzeSingleFrame(frame, context))
      );

      // Aggregate results
      const aggregated = this.aggregateAnalyses(frameAnalyses);

      logger.info('Multiple frames analyzed and aggregated');

      return aggregated;
    } catch (error) {
      logger.error('Multiple frame analysis error:', error);
      throw error;
    }
  }

  /**
   * Aggregate multiple frame analyses into summary
   * @param {Array} analyses - Array of frame analyses
   * @returns {Object} Aggregated analysis
   */
  aggregateAnalyses(analyses) {
    if (analyses.length === 0) {
      throw new Error('No analyses to aggregate');
    }

    // Calculate averages
    const avgEyeContact = this.average(analyses.map(a => a.eye_contact?.score || 0));
    const avgPosture = this.average(analyses.map(a => a.posture?.score || 0));
    const avgEngagement = this.average(analyses.map(a => a.engagement?.score || 0));
    const avgProfessionalism = this.average(analyses.map(a => a.professionalism?.score || 0));
    const avgConfidence = this.average(analyses.map(a => a.confidence_level?.score || 0));

    // Count emotions
    const emotions = analyses.map(a => a.facial_expression?.primary_emotion).filter(Boolean);
    const emotionCounts = this.countOccurrences(emotions);
    const dominantEmotion = Object.keys(emotionCounts).reduce((a, b) => 
      emotionCounts[a] > emotionCounts[b] ? a : b
    );

    // Count energy levels
    const energyLevels = analyses.map(a => a.energy_level).filter(Boolean);
    const energyCounts = this.countOccurrences(energyLevels);
    const dominantEnergy = Object.keys(energyCounts).reduce((a, b) => 
      energyCounts[a] > energyCounts[b] ? a : b
    );

    // Collect all nervousness signals
    const allNervousnessSignals = analyses
      .flatMap(a => a.nervousness_signals || [])
      .filter((signal, index, self) => self.indexOf(signal) === index);

    // Collect all observations
    const observations = {
      eye_contact: analyses.map(a => a.eye_contact?.observation).filter(Boolean),
      posture: analyses.map(a => a.posture?.observation).filter(Boolean),
      engagement: analyses.map(a => a.engagement?.observation).filter(Boolean),
      professionalism: analyses.map(a => a.professionalism?.observation).filter(Boolean),
      confidence: analyses.map(a => a.confidence_level?.observation).filter(Boolean)
    };

    // Overall assessment
    const overallScore = (
      avgEyeContact + 
      avgPosture + 
      avgEngagement + 
      avgProfessionalism + 
      avgConfidence
    ) / 5;

    return {
      summary: {
        total_frames_analyzed: analyses.length,
        overall_score: parseFloat(overallScore.toFixed(1)),
        overall_assessment: this.getOverallAssessment(overallScore)
      },
      metrics: {
        eye_contact: {
          avg_score: parseFloat(avgEyeContact.toFixed(1)),
          consistency: this.calculateConsistency(analyses.map(a => a.eye_contact?.score || 0))
        },
        posture: {
          avg_score: parseFloat(avgPosture.toFixed(1)),
          consistency: this.calculateConsistency(analyses.map(a => a.posture?.score || 0))
        },
        engagement: {
          avg_score: parseFloat(avgEngagement.toFixed(1)),
          consistency: this.calculateConsistency(analyses.map(a => a.engagement?.score || 0))
        },
        professionalism: {
          avg_score: parseFloat(avgProfessionalism.toFixed(1)),
          consistency: this.calculateConsistency(analyses.map(a => a.professionalism?.score || 0))
        },
        confidence: {
          avg_score: parseFloat(avgConfidence.toFixed(1)),
          consistency: this.calculateConsistency(analyses.map(a => a.confidence_level?.score || 0))
        }
      },
      behavioral_analysis: {
        dominant_emotion: dominantEmotion,
        emotion_distribution: emotionCounts,
        energy_level: dominantEnergy,
        nervousness_signals: allNervousnessSignals,
        nervousness_frequency: allNervousnessSignals.length / analyses.length
      },
      observations: observations,
      recommendations: this.generateRecommendations({
        avgEyeContact,
        avgPosture,
        avgEngagement,
        avgConfidence,
        nervousnessSignals: allNervousnessSignals
      })
    };
  }

  /**
   * Calculate average
   */
  average(numbers) {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
  }

  /**
   * Calculate consistency (lower standard deviation = more consistent)
   */
  calculateConsistency(scores) {
    if (scores.length === 0) return 0;
    const avg = this.average(scores);
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    // Convert to consistency score (0-10, higher = more consistent)
    const consistencyScore = Math.max(0, 10 - stdDev);
    return parseFloat(consistencyScore.toFixed(1));
  }

  /**
   * Count occurrences
   */
  countOccurrences(arr) {
    return arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Get overall assessment text
   */
  getOverallAssessment(score) {
    if (score >= 8) return 'Excellent non-verbal communication';
    if (score >= 6.5) return 'Good non-verbal communication';
    if (score >= 5) return 'Average non-verbal communication';
    return 'Needs improvement in non-verbal communication';
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(metrics) {
    const recommendations = [];

    if (metrics.avgEyeContact < 6) {
      recommendations.push('Work on maintaining more consistent eye contact with the camera');
    }

    if (metrics.avgPosture < 6) {
      recommendations.push('Focus on maintaining professional posture throughout the interview');
    }

    if (metrics.avgEngagement < 6) {
      recommendations.push('Show more engagement through active listening and responsive facial expressions');
    }

    if (metrics.avgConfidence < 6) {
      recommendations.push('Build confidence through practice interviews and preparation');
    }

    if (metrics.nervousnessSignals.length > 3) {
      recommendations.push('Practice relaxation techniques to manage nervousness during interviews');
    }

    if (recommendations.length === 0) {
      recommendations.push('Maintain excellent non-verbal communication skills');
    }

    return recommendations;
  }

  /**
   * Estimate cost for vision analysis
   * @param {Number} frameCount - Number of frames to analyze
   */
  estimateCost(frameCount) {
    // GPT-4 Vision pricing: ~$0.01 per image (low detail)
    // ~$0.03 per image (high detail)
    const costPerFrame = 0.01; // Using low detail
    return {
      total_frames: frameCount,
      cost_per_frame: costPerFrame,
      total_cost: (frameCount * costPerFrame).toFixed(2)
    };
  }
}

export default new VisionAnalysisService();
