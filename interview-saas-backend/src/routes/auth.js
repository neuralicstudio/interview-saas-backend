const express = require('express');
const router = express.Router();
const AuthService = require('../services/AuthService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// Validation helper
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
  return password.length >= 8;
};

/**
 * POST /api/auth/register
 * Register a new company/user
 */
router.post('/register', async (req, res) => {
  try {
    const { companyName, email, password, firstName, lastName } = req.body;

    // Validation
    if (!companyName || !email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Register user
    const result = await AuthService.register({
      companyName,
      email,
      password,
      firstName,
      lastName
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: result
    });
  } catch (error) {
    logger.error('Registration error:', error);
    
    if (error.message === 'Email already registered') {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Login
    const result = await AuthService.login(email, password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    logger.error('Login error:', error);
    
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    const result = await AuthService.refreshAccessToken(refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (invalidate refresh token)
 */
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await AuthService.logout(refreshToken);
    }

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    const result = await AuthService.requestPasswordReset(email);

    res.status(200).json({
      success: true,
      message: result.message,
      // Remove resetToken in production!
      ...(process.env.NODE_ENV === 'development' && { resetToken: result.resetToken })
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to process request'
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    const result = await AuthService.resetPassword(resetToken, newPassword);

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logger.error('Reset password error:', error);
    
    if (error.message === 'Invalid or expired reset token') {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user info (protected route)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const { query } = require('../db');
    
    const result = await query(
      'SELECT id, name, email, api_key, contact_name, created_at FROM companies WHERE id = $1',
      [req.company.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    logger.error('Get user error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user data'
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password (protected route)
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
    }

    const { query } = require('../db');
    
    // Get current password hash
    const result = await query(
      'SELECT password_hash FROM companies WHERE id = $1',
      [req.company.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isValid = await AuthService.comparePassword(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await AuthService.hashPassword(newPassword);

    // Update password
    await query(
      'UPDATE companies SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.company.id]
    );

    // Invalidate all refresh tokens (force re-login on all devices)
    await query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [req.company.id]
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

module.exports = router;
