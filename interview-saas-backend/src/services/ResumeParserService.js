import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import { chatCompletionJSON } from '../utils/openai.js';
import { logger } from '../utils/logger.js';

/**
 * Resume Parser Service
 * Extracts and parses resume data using AI
 */
export class ResumeParserService {
  constructor() {
    this.systemPrompt = `You are an expert resume parser that extracts structured information from resumes.

Your task is to analyze resume text and extract key information into a structured JSON format.

Rules:
- Extract all relevant information accurately
- Normalize dates to YYYY-MM format
- Infer information when explicit data is missing
- Be conservative - only include information you're confident about
- Skills should be specific technologies/tools, not soft skills
- Experience should include company, role, duration, and achievements

Return ONLY valid JSON in this exact format:
{
  "personal": {
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "+1234567890",
    "location": "City, Country",
    "linkedin": "linkedin.com/in/username",
    "github": "github.com/username",
    "website": "portfolio.com"
  },
  "summary": "Brief professional summary",
  "skills": {
    "technical": ["JavaScript", "Python", "React"],
    "tools": ["Git", "Docker", "AWS"],
    "languages": ["English", "Spanish"],
    "other": []
  },
  "experience": [
    {
      "company": "Company Name",
      "role": "Job Title",
      "location": "City, Country",
      "start_date": "2020-01",
      "end_date": "2023-05",
      "current": false,
      "duration_months": 41,
      "achievements": [
        "Specific achievement with metrics",
        "Another achievement"
      ],
      "technologies": ["Tech1", "Tech2"]
    }
  ],
  "education": [
    {
      "institution": "University Name",
      "degree": "Bachelor of Science",
      "field": "Computer Science",
      "location": "City, Country",
      "start_date": "2015-09",
      "end_date": "2019-06",
      "gpa": "3.8",
      "achievements": []
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Organization",
      "date": "2022-01",
      "credential_id": "ABC123"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Brief description",
      "technologies": ["Tech1", "Tech2"],
      "url": "github.com/user/project"
    }
  ],
  "languages": [
    {
      "language": "English",
      "proficiency": "Native"
    }
  ]
}`;
  }

  /**
   * Extract text from PDF file
   * @param {Buffer} fileBuffer - PDF file buffer
   * @returns {String} Extracted text
   */
  async extractTextFromPDF(fileBuffer) {
    try {
      logger.info('Extracting text from PDF...');
      
      const data = await pdf(fileBuffer);
      const text = data.text;

      logger.info(`Extracted ${text.length} characters from PDF`);
      
      return text;
    } catch (error) {
      logger.error('PDF extraction error:', error);
      throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX file
   * @param {Buffer} fileBuffer - DOCX file buffer
   * @returns {String} Extracted text
   */
  async extractTextFromDOCX(fileBuffer) {
    try {
      logger.info('Extracting text from DOCX...');
      
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value;

      logger.info(`Extracted ${text.length} characters from DOCX`);
      
      return text;
    } catch (error) {
      logger.error('DOCX extraction error:', error);
      throw new Error(`Failed to extract text from DOCX: ${error.message}`);
    }
  }

  /**
   * Extract text from file based on type
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} mimeType - File MIME type
   * @returns {String} Extracted text
   */
  async extractText(fileBuffer, mimeType) {
    if (mimeType === 'application/pdf') {
      return await this.extractTextFromPDF(fileBuffer);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return await this.extractTextFromDOCX(fileBuffer);
    } else if (mimeType === 'text/plain') {
      return fileBuffer.toString('utf-8');
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * Parse resume text using AI
   * @param {String} resumeText - Extracted resume text
   * @returns {Object} Parsed resume data
   */
  async parseResumeWithAI(resumeText) {
    try {
      logger.info('Parsing resume with AI...');

      // Truncate if too long (GPT-4 token limit)
      const maxChars = 15000;
      const truncatedText = resumeText.length > maxChars 
        ? resumeText.substring(0, maxChars) + '\n...[truncated]'
        : resumeText;

      const userPrompt = `Parse this resume and extract all relevant information:

${truncatedText}

Extract all available information and return as structured JSON.`;

      const messages = [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const parsedData = await chatCompletionJSON(messages, {
        temperature: 0.3, // Lower temperature for accuracy
        max_tokens: 3000
      });

      logger.info('Resume parsed successfully');

      // Validate and clean data
      const cleanedData = this.validateAndCleanParsedData(parsedData);

      return cleanedData;
    } catch (error) {
      logger.error('AI parsing error:', error);
      throw new Error(`Failed to parse resume: ${error.message}`);
    }
  }

  /**
   * Validate and clean parsed resume data
   * @param {Object} data - Raw parsed data
   * @returns {Object} Cleaned data
   */
  validateAndCleanParsedData(data) {
    const cleaned = {
      personal: data.personal || {},
      summary: data.summary || '',
      skills: {
        technical: Array.isArray(data.skills?.technical) ? data.skills.technical : [],
        tools: Array.isArray(data.skills?.tools) ? data.skills.tools : [],
        languages: Array.isArray(data.skills?.languages) ? data.skills.languages : [],
        other: Array.isArray(data.skills?.other) ? data.skills.other : []
      },
      experience: Array.isArray(data.experience) ? data.experience : [],
      education: Array.isArray(data.education) ? data.education : [],
      certifications: Array.isArray(data.certifications) ? data.certifications : [],
      projects: Array.isArray(data.projects) ? data.projects : [],
      languages: Array.isArray(data.languages) ? data.languages : []
    };

    // Calculate total years of experience
    if (cleaned.experience.length > 0) {
      const totalMonths = cleaned.experience.reduce((sum, exp) => {
        return sum + (exp.duration_months || 0);
      }, 0);
      cleaned.total_years_experience = Math.round(totalMonths / 12 * 10) / 10;
    }

    // Extract all unique skills for easy searching
    cleaned.all_skills = [
      ...cleaned.skills.technical,
      ...cleaned.skills.tools,
      ...cleaned.skills.languages,
      ...cleaned.skills.other
    ].filter((skill, index, self) => self.indexOf(skill) === index);

    return cleaned;
  }

  /**
   * Parse resume from file
   * @param {Buffer} fileBuffer - File buffer
   * @param {String} mimeType - File MIME type
   * @param {String} originalName - Original filename
   * @returns {Object} Parsed resume data with original text
   */
  async parseResume(fileBuffer, mimeType, originalName) {
    try {
      logger.info(`Parsing resume: ${originalName}`);

      // Extract text
      const resumeText = await this.extractText(fileBuffer, mimeType);

      // Parse with AI
      const parsedData = await this.parseResumeWithAI(resumeText);

      // Return both parsed data and original text
      return {
        parsed: parsedData,
        original_text: resumeText,
        file_name: originalName,
        file_size: fileBuffer.length,
        parsed_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Resume parsing error:', error);
      throw new Error(`Resume parsing failed: ${error.message}`);
    }
  }

  /**
   * Extract key skills for job matching
   * @param {Object} parsedResume - Parsed resume data
   * @returns {Array} List of key skills
   */
  extractKeySkills(parsedResume) {
    return parsedResume.all_skills || [];
  }

  /**
   * Calculate experience level
   * @param {Object} parsedResume - Parsed resume data
   * @returns {String} Experience level (junior/mid/senior/lead)
   */
  calculateExperienceLevel(parsedResume) {
    const years = parsedResume.total_years_experience || 0;

    if (years < 2) return 'junior';
    if (years < 5) return 'mid';
    if (years < 10) return 'senior';
    return 'lead';
  }

  /**
   * Generate interview focus areas based on resume
   * @param {Object} parsedResume - Parsed resume data
   * @returns {Array} Focus areas for interview
   */
  generateInterviewFocusAreas(parsedResume) {
    const focusAreas = [];

    // Recent experience
    if (parsedResume.experience && parsedResume.experience.length > 0) {
      const recentJob = parsedResume.experience[0];
      focusAreas.push({
        area: 'Recent Experience',
        topic: `${recentJob.role} at ${recentJob.company}`,
        questions: [
          `Tell me about your role as ${recentJob.role}`,
          `What were your main achievements at ${recentJob.company}?`
        ]
      });
    }

    // Technical skills
    if (parsedResume.skills?.technical?.length > 0) {
      focusAreas.push({
        area: 'Technical Skills',
        topic: parsedResume.skills.technical.join(', '),
        questions: parsedResume.skills.technical.slice(0, 3).map(skill => 
          `Can you describe a project where you used ${skill}?`
        )
      });
    }

    // Education
    if (parsedResume.education && parsedResume.education.length > 0) {
      const degree = parsedResume.education[0];
      focusAreas.push({
        area: 'Education',
        topic: `${degree.degree} in ${degree.field}`,
        questions: [
          `How has your ${degree.field} background influenced your career?`
        ]
      });
    }

    return focusAreas;
  }

  /**
   * Get supported file types
   */
  getSupportedFileTypes() {
    return {
      mimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain'
      ],
      extensions: ['.pdf', '.docx', '.doc', '.txt'],
      maxSize: '5MB'
    };
  }
}

export default new ResumeParserService();
