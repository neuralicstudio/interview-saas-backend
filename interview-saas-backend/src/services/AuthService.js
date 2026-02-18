const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const logger = require('../utils/logger');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.jwtExpiresIn = '24h'; // Access token expires in 24 hours
    this.refreshExpiresIn = '7d'; // Refresh token expires in 7 days
  }

  // Hash password
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  // Compare password with hash
  async comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  // Generate JWT access token
  generateAccessToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      companyId: user.company_id,
      role: user.role || 'admin'
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn
    });
  }

  // Generate JWT refresh token
  generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      tokenType: 'refresh'
    };

    return jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.refreshExpiresIn
    });
  }

  // Verify access token
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  // Verify refresh token
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.jwtRefreshSecret);
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  // Register new company/user
  async register(data) {
    const { companyName, email, password, firstName, lastName } = data;

    try {
      // Check if email already exists
      const existingUser = await query(
        'SELECT id FROM companies WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('Email already registered');
      }

      // Hash password
      const hashedPassword = await this.hashPassword(password);

      // Generate API key
      const apiKey = this.generateApiKey();

      // Create company
      const result = await query(
        `INSERT INTO companies (
          name, email, password_hash, api_key, 
          contact_name, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id, name, email, api_key, created_at`,
        [companyName, email, hashedPassword, apiKey, `${firstName} ${lastName}`]
      );

      const company = result.rows[0];

      // Generate tokens
      const accessToken = this.generateAccessToken({
        id: company.id,
        email: company.email,
        company_id: company.id
      });

      const refreshToken = this.generateRefreshToken({
        id: company.id,
        email: company.email
      });

      // Store refresh token in database
      await query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [company.id, refreshToken]
      );

      logger.info(`New company registered: ${email}`);

      return {
        user: {
          id: company.id,
          email: company.email,
          companyName: company.name,
          apiKey: company.api_key
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Registration error:', error);
      throw error;
    }
  }

  // Login
  async login(email, password) {
    try {
      // Find user by email
      const result = await query(
        'SELECT id, name, email, password_hash FROM companies WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid email or password');
      }

      const user = result.rows[0];

      // Compare password
      const isValidPassword = await this.comparePassword(password, user.password_hash);

      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      // Generate tokens
      const accessToken = this.generateAccessToken({
        id: user.id,
        email: user.email,
        company_id: user.id
      });

      const refreshToken = this.generateRefreshToken({
        id: user.id,
        email: user.email
      });

      // Store refresh token
      await query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [user.id, refreshToken]
      );

      // Update last login
      await query(
        'UPDATE companies SET updated_at = NOW() WHERE id = $1',
        [user.id]
      );

      logger.info(`User logged in: ${email}`);

      return {
        user: {
          id: user.id,
          email: user.email,
          companyName: user.name
        },
        accessToken,
        refreshToken
      };
    } catch (error) {
      logger.error('Login error:', error);
      throw error;
    }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = this.verifyRefreshToken(refreshToken);

      // Check if refresh token exists in database and is not expired
      const result = await query(
        `SELECT rt.*, c.email, c.name 
         FROM refresh_tokens rt
         JOIN companies c ON rt.user_id = c.id
         WHERE rt.token = $1 AND rt.expires_at > NOW()`,
        [refreshToken]
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid or expired refresh token');
      }

      const user = result.rows[0];

      // Generate new access token
      const accessToken = this.generateAccessToken({
        id: user.user_id,
        email: user.email,
        company_id: user.user_id
      });

      return {
        accessToken
      };
    } catch (error) {
      logger.error('Token refresh error:', error);
      throw error;
    }
  }

  // Logout (invalidate refresh token)
  async logout(refreshToken) {
    try {
      await query(
        'DELETE FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );

      logger.info('User logged out');
    } catch (error) {
      logger.error('Logout error:', error);
      throw error;
    }
  }

  // Request password reset
  async requestPasswordReset(email) {
    try {
      // Find user
      const result = await query(
        'SELECT id, email, name FROM companies WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        // Don't reveal if email exists or not (security)
        return { message: 'If email exists, reset link has been sent' };
      }

      const user = result.rows[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = await this.hashPassword(resetToken);
      const expiresAt = new Date(Date.now() + 3600000); // 1 hour

      // Store reset token
      await query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) 
         DO UPDATE SET token_hash = $2, expires_at = $3, created_at = NOW()`,
        [user.id, resetTokenHash, expiresAt]
      );

      // TODO: Send reset email
      // await EmailService.sendPasswordResetEmail(user.email, resetToken);

      logger.info(`Password reset requested for: ${email}`);

      return {
        message: 'If email exists, reset link has been sent',
        resetToken // Remove this in production! Only for testing
      };
    } catch (error) {
      logger.error('Password reset request error:', error);
      throw error;
    }
  }

  // Reset password with token
  async resetPassword(resetToken, newPassword) {
    try {
      // Find valid reset token
      const result = await query(
        `SELECT prt.user_id, prt.token_hash, c.email
         FROM password_reset_tokens prt
         JOIN companies c ON prt.user_id = c.id
         WHERE prt.expires_at > NOW()`,
        []
      );

      if (result.rows.length === 0) {
        throw new Error('Invalid or expired reset token');
      }

      // Check each token hash (in production, you'd pass the token and check one)
      let userId = null;
      for (const row of result.rows) {
        const isValid = await this.comparePassword(resetToken, row.token_hash);
        if (isValid) {
          userId = row.user_id;
          break;
        }
      }

      if (!userId) {
        throw new Error('Invalid or expired reset token');
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password
      await query(
        'UPDATE companies SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [hashedPassword, userId]
      );

      // Delete used reset token
      await query(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [userId]
      );

      // Invalidate all refresh tokens (force re-login)
      await query(
        'DELETE FROM refresh_tokens WHERE user_id = $1',
        [userId]
      );

      logger.info(`Password reset successful for user: ${userId}`);

      return { message: 'Password reset successful' };
    } catch (error) {
      logger.error('Password reset error:', error);
      throw error;
    }
  }

  // Generate API key
  generateApiKey() {
    return `iai_${crypto.randomBytes(32).toString('hex')}`;
  }

  // Validate API key (existing method, keep for backwards compatibility)
  async validateApiKey(apiKey) {
    try {
      const result = await query(
        'SELECT id, name, email FROM companies WHERE api_key = $1',
        [apiKey]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      logger.error('API key validation error:', error);
      return null;
    }
  }
}

module.exports = new AuthService();
