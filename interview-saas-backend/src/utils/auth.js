import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for company
 */
export const generateToken = (companyId) => {
  return jwt.sign(
    { companyId, type: 'company' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Hash password
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

/**
 * Compare password with hash
 */
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate API key
 */
export const generateApiKey = () => {
  const prefix = 'sk_live_';
  const randomPart = Array.from({ length: 32 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');
  return prefix + randomPart;
};

/**
 * Hash API key for storage
 */
export const hashApiKey = async (apiKey) => {
  return await hashPassword(apiKey);
};
