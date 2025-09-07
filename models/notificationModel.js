// models/notificationModel.js
const pool = require('../db');

async function createNotification(memberId, message) {
  const query = `
    INSERT INTO notifications (member_id, message, created_at)
    VALUES ($1, $2, NOW()) 
    RETURNING *
  `;
  const result = await pool.query(query, [memberId, message]);
  return result.rows[0];
}

async function getNotificationsForMember(memberId, unreadOnly = false) {
  let query = `SELECT * FROM notifications WHERE member_id = $1`;
  if (unreadOnly) query += ` AND read = FALSE`;
  query += ` ORDER BY created_at DESC`;
  
  const result = await pool.query(query, [memberId]);
  return result.rows;
}

async function markNotificationRead(notificationId) {
  const query = `UPDATE notifications SET read = TRUE WHERE id = $1`;
  await pool.query(query, [notificationId]);
}

module.exports = {
  createNotification,
  getNotificationsForMember,
  markNotificationRead
};
