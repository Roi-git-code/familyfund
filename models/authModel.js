

// models/authModel.js
const db = require('../db');
const bcrypt = require('bcryptjs');

// Create user with email verification
exports.createUser = async (username, password, role, memberId) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (username, password, role, member_id, email_verified) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [username, hashedPassword, role, memberId, true] // Set email_verified to true since we verified via OTP
  );
  return result.rows[0];
};

// Find user by username
exports.findByUsername = async (username) => {
  const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
  return result.rows[0];
};

// Compare password
exports.comparePasswords = async (plainTextPassword, hashedPassword) => {
  return await bcrypt.compare(plainTextPassword, hashedPassword);
};

// Count users by role
exports.countUsersByRole = async (role) => {
  const result = await db.query('SELECT COUNT(*) FROM users WHERE role = $1', [role]);
  return parseInt(result.rows[0].count, 10);
};

// Get member by email
exports.getMemberByEmail = async (email) => {
  const result = await db.query('SELECT * FROM member WHERE email = $1', [email]);
  return result.rows[0] || null;
};

// Check if email exists in member table
exports.emailExistsInMembers = async (email) => {
  const result = await db.query('SELECT * FROM member WHERE email = $1', [email]);
  return result.rows.length > 0;
};

// Update password
exports.updatePassword = async (userId, newPassword) => {
  const hashed = await bcrypt.hash(newPassword, 10);
  await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, userId]);
};

// Save reset token and expiry
exports.saveResetToken = async (userId, token, expires) => {
  await db.query(
    'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expires]
  );
};

// Find reset token record by token
exports.findResetToken = async (token) => {
  const result = await db.query('SELECT * FROM password_resets WHERE token = $1', [token]);
  return result.rows[0];
};

// Delete reset token record after use
exports.deleteResetToken = async (token) => {
  await db.query('DELETE FROM password_resets WHERE token = $1', [token]);
};

// OTP Functions

// Generate and save OTP
exports.generateOTP = async (email) => {
  // Generate 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  
  // Delete any existing OTP for this email
  await db.query('DELETE FROM email_verifications WHERE email = $1', [email]);
  
  // Insert new OTP
  await db.query(
    'INSERT INTO email_verifications (email, otp_code, expires_at) VALUES ($1, $2, $3)',
    [email, otp, expiresAt]
  );
  
  return otp;
};

// Verify OTP
exports.verifyOTP = async (email, otp) => {
  const result = await db.query(
    'SELECT * FROM email_verifications WHERE email = $1 AND otp_code = $2 AND expires_at > NOW() AND verified = false',
    [email, otp]
  );
  
  if (result.rows.length === 0) {
    return false;
  }
  
  // Mark OTP as verified
  await db.query(
    'UPDATE email_verifications SET verified = true WHERE email = $1 AND otp_code = $2',
    [email, otp]
  );
  
  return true;
};

// Check if email is verified
exports.isEmailVerified = async (email) => {
  const result = await db.query(
    'SELECT email_verified FROM users WHERE username = $1',
    [email]
  );
  return result.rows[0]?.email_verified || false;
};

// Mark email as verified
exports.markEmailVerified = async (email) => {
  await db.query(
    'UPDATE users SET email_verified = true WHERE username = $1',
    [email]
  );
};

// Delete expired OTPs
exports.cleanExpiredOTPs = async () => {
  await db.query('DELETE FROM email_verifications WHERE expires_at < NOW()');
};

// Get OTP details for debugging
exports.getOTPDetails = async (email) => {
  const result = await db.query(
    'SELECT * FROM email_verifications WHERE email = $1 ORDER BY created_at DESC LIMIT 1',
    [email]
  );
  return result.rows[0];
};


