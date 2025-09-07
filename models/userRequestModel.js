const pool = require('../db');

// Create a new update profile request
async function createUserRequest(memberId, updatedFields, attachments) {
if (!updatedFields || typeof updatedFields !== 'object') {
    updatedFields = {};
  }
  // Get current member data
  const memberQuery = await pool.query('SELECT * FROM member WHERE id = $1', [memberId]);
  const memberData = memberQuery.rows[0];
  
  // Create old_values object
  const oldValues = {};
  Object.keys(updatedFields).forEach(field => {
    oldValues[field] = memberData[field];
  });

  const query = `
    INSERT INTO user_requests (
      member_id, 
      updated_fields, 
      old_values,
      attachments
    ) 
    VALUES ($1, $2, $3, $4) 
    RETURNING *
  `;
  const values = [
    memberId, 
    updatedFields, 
    oldValues,
    attachments || {}
  ];
  
  const result = await pool.query(query, values);
  return result.rows[0];
}

// Get all user requests (with member basic info)
async function getAllUserRequests() {
  const query = `
    SELECT ur.*, m.first_name, m.middle_name, m.sur_name, m.email 
    FROM user_requests ur 
    JOIN member m ON ur.member_id = m.id
    ORDER BY ur.created_at DESC`;
  const result = await pool.query(query);
  return result.rows;
}

// Get count of pending requests
async function countPendingRequests() {
  const query = `SELECT COUNT(*) FROM user_requests WHERE status = 'In Progress'`;
  const result = await pool.query(query);
  return parseInt(result.rows[0].count, 10);
}

// Get one user request by ID
async function getUserRequestById(id) {
  const query = `SELECT * FROM user_requests WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}

// Update status (approve/reject) of a user request with optional reason
async function updateUserRequestStatus(id, status, reason, officerId) {
  const query = `
    UPDATE user_requests
    SET status = $1,
        reason = $2,
        reviewed_by = $3,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = $4
    RETURNING *`;
  const result = await pool.query(query, [status, reason, officerId, id]);
  return result.rows[0];
}


// Update member info when a request is approved
async function updateMemberInfo(memberId, updatedFields) {
  const keys = Object.keys(updatedFields);
  const values = Object.values(updatedFields);

  if (keys.length === 0) return false;

  const setClause = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
  const query = `UPDATE member SET ${setClause} WHERE id = $${keys.length + 1}`;
  values.push(memberId);

  const result = await pool.query(query, values);
  return result.rowCount > 0;
}

// Create a notification for a user
async function createNotification(memberId, message) {
  const query = `
    INSERT INTO notifications (member_id, message)
    VALUES ($1, $2) RETURNING *`;
  const result = await pool.query(query, [memberId, message]);
  return result.rows[0];
}

// Get notifications for a member (optionally unread only)
async function getNotificationsForMember(memberId, unreadOnly = false) {
  let query = `SELECT * FROM notifications WHERE member_id = $1`;
  if (unreadOnly) query += ` AND read = FALSE`;
  query += ` ORDER BY created_at DESC`;

  const result = await pool.query(query, [memberId]);
  return result.rows;
}

// Mark notification as read
async function markNotificationRead(notificationId) {
  const query = `UPDATE notifications SET read = TRUE WHERE id = $1`;
  await pool.query(query, [notificationId]);
}


// Get single user request with officer details
async function getUserRequestWithOfficer(requestId) {
  const query = `
    SELECT ur.*,
           CONCAT(m.first_name, ' ', m.middle_name, ' ', m.sur_name) AS member_name,
           CONCAT(o.first_name, ' ', o.middle_name, ' ', o.sur_name) AS officer_name,
           u.role AS officer_role
    FROM user_requests ur
    JOIN member m ON ur.member_id = m.id
    LEFT JOIN member o ON ur.reviewed_by = o.id
    LEFT JOIN users u ON u.member_id = o.id
    WHERE ur.id = $1
  `;
  const result = await pool.query(query, [requestId]);
  return result.rows[0] || null;
}


module.exports = {
   getUserRequestWithOfficer,
  createUserRequest,
  getAllUserRequests,
  countPendingRequests,
  getUserRequestById,
  updateUserRequestStatus,
  updateMemberInfo,
  createNotification,
  getNotificationsForMember,
  markNotificationRead
};

