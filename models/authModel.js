const db = require('../db');
const bcrypt = require('bcryptjs');

// Hash password
 exports.createUser = async (username, password, role, memberId) => {
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (username, password, role, member_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [username, hashedPassword, role, memberId]
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

// authModel.js
exports.getMemberByEmail = async (email) => {
  const result = await db.query('SELECT * FROM member WHERE email = $1', [email]);
  return result.rows[0] || null;
};


// Check if email exists in member table
exports.emailExistsInMembers = async (email) => {
  const result = await db.query('SELECT * FROM member WHERE email = $1', [email]);
  return result.rows.length > 0;
};

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
