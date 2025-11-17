


const pool = require('../db');

async function createSupportMessage({
  userId,
  memberId = null,
  name,
  email,
  subject,
  urgency = 'medium',
  message
}) {
  try {
    console.log('🗄️ === CREATE SUPPORT MESSAGE START ===');
    console.log('🗄️ Input data:', {
      userId, memberId, name, email, subject, urgency, message
    });

    // Use parameterized query and allow memberId to be null
    const query = `
      INSERT INTO support_messages 
        (user_id, member_id, name, email, subject, urgency, message, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;

    const values = [userId, memberId, name, email, subject, urgency, message];

    console.log('📊 Executing query:', query);
    console.log('📊 With values:', values);

    const result = await pool.query(query, values);
    
    console.log('✅ Insert successful, returned ID:', result.rows[0].id);
    console.log('🗄️ === CREATE SUPPORT MESSAGE END ===');
    
    return result.rows[0];

  } catch (err) {
    console.error('❌ Database error in createSupportMessage:');
    console.error('❌ Error message:', err.message);
    console.error('❌ Error code:', err.code);
    console.error('❌ Error detail:', err.detail);
    console.error('❌ Error constraint:', err.constraint);
    console.error('❌ Error table:', err.table);
    console.error('❌ Error column:', err.column);
    console.error('❌ Full error:', err);
    throw err;
  }
}


// Add this function to verify the table exists and check recent messages
async function checkSupportTable() {
  try {
    console.log('🔍 === CHECKING SUPPORT TABLE ===');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'support_messages'
      );
    `);
    
    console.log('🔍 Table exists:', tableCheck.rows[0].exists);
    
    // Check recent messages
    const recentMessages = await pool.query(`
      SELECT id, name, email, subject, created_at 
      FROM support_messages 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('🔍 Recent support messages:', recentMessages.rows);
    
    return recentMessages.rows;
  } catch (error) {
    console.error('🔍 ❌ Error checking support table:', error);
    return [];
  }
}

// Get all support messages (for admin)
async function getAllSupportMessages({ status, urgency, fromDate, toDate, page = 1, limit = 20 } = {}) {
  let query = `
    SELECT sm.*, 
           u.username as user_username,
           CONCAT(m.first_name, ' ', m.sur_name) as member_name,
           au.username as assigned_username
    FROM support_messages sm
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN member m ON sm.member_id = m.id
    LEFT JOIN users au ON sm.assigned_to = au.id
    WHERE 1=1
  `;
  
  const values = [];
  let paramCount = 0;

  if (status) {
    paramCount++;
    values.push(status);
    query += ` AND sm.status = $${paramCount}`;
  }

  if (urgency) {
    paramCount++;
    values.push(urgency);
    query += ` AND sm.urgency = $${paramCount}`;
  }

  if (fromDate) {
    paramCount++;
    values.push(fromDate);
    query += ` AND sm.created_at >= $${paramCount}`;
  }

  if (toDate) {
    paramCount++;
    values.push(toDate);
    query += ` AND sm.created_at <= $${paramCount}`;
  }

  query += ` ORDER BY 
    CASE sm.urgency 
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 2
      WHEN 'medium' THEN 3
      WHEN 'low' THEN 4
    END,
    sm.created_at DESC`;

  // Add pagination
  const offset = (page - 1) * limit;
  paramCount++;
  values.push(limit);
  paramCount++;
  values.push(offset);
  
  query += ` LIMIT $${paramCount - 1} OFFSET $${paramCount}`;

  const result = await pool.query(query, values);
  return result.rows;
}

// Get support messages by user
async function getSupportMessagesByUser(userId, { page = 1, limit = 10 } = {}) {
  const query = `
    SELECT sm.*
    FROM support_messages sm
    WHERE sm.user_id = $1
    ORDER BY sm.created_at DESC
    LIMIT $2 OFFSET $3
  `;
  
  const offset = (page - 1) * limit;
  const result = await pool.query(query, [userId, limit, offset]);
  return result.rows;
}

// Get support message by ID
async function getSupportMessageById(messageId) {
  const query = `
    SELECT sm.*, 
           u.username as user_username,
           CONCAT(m.first_name, ' ', m.sur_name) as member_name,
           au.username as assigned_username
    FROM support_messages sm
    LEFT JOIN users u ON sm.user_id = u.id
    LEFT JOIN member m ON sm.member_id = m.id
    LEFT JOIN users au ON sm.assigned_to = au.id
    WHERE sm.id = $1
  `;
  
  const result = await pool.query(query, [messageId]);
  return result.rows[0];
}

// Update support message status
async function updateSupportMessageStatus(messageId, status, adminNotes = null, assignedTo = null) {
  let query = `
    UPDATE support_messages 
    SET status = $1, 
        updated_at = CURRENT_TIMESTAMP,
        resolved_at = CASE WHEN $1 = 'resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END
  `;
  
  const values = [status];
  let paramCount = 1;

  if (adminNotes) {
    paramCount++;
    values.push(adminNotes);
    query += `, admin_notes = $${paramCount}`;
  }

  if (assignedTo) {
    paramCount++;
    values.push(assignedTo);
    query += `, assigned_to = $${paramCount}`;
  }

  paramCount++;
  values.push(messageId);
  query += ` WHERE id = $${paramCount} RETURNING *`;

  const result = await pool.query(query, values);
  return result.rows[0];
}

// Get support statistics
async function getSupportStatistics() {
  try {
    console.log('📊 Calculating support statistics...');
    
    const query = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_messages,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_messages,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_messages,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_messages,
        COUNT(CASE WHEN urgency = 'critical' THEN 1 END) as critical_messages,
        COUNT(CASE WHEN urgency = 'high' THEN 1 END) as high_messages,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as last_7_days
      FROM support_messages
    `;
    
    const result = await pool.query(query);
    const stats = result.rows[0];
    
    console.log('📊 Support statistics:', {
      total: stats.total_messages,
      new: stats.new_messages,
      in_progress: stats.in_progress_messages,
      resolved: stats.resolved_messages,
      closed: stats.closed_messages,
      critical: stats.critical_messages,
      high: stats.high_messages,
      last_7_days: stats.last_7_days
    });
    
    return stats;

  } catch (err) {
    console.error('❌ Error calculating support statistics:', err);
    // Return safe default values
    return {
      total_messages: 0,
      new_messages: 0,
      in_progress_messages: 0,
      resolved_messages: 0,
      closed_messages: 0,
      critical_messages: 0,
      high_messages: 0,
      last_7_days: 0
    };
  }
}

// Get messages count for pagination
async function getSupportMessagesCount({ status, urgency, fromDate, toDate } = {}) {
  let query = `SELECT COUNT(*) FROM support_messages WHERE 1=1`;
  const values = [];
  let paramCount = 0;

  if (status) {
    paramCount++;
    values.push(status);
    query += ` AND status = $${paramCount}`;
  }

  if (urgency) {
    paramCount++;
    values.push(urgency);
    query += ` AND urgency = $${paramCount}`;
  }

  if (fromDate) {
    paramCount++;
    values.push(fromDate);
    query += ` AND created_at >= $${paramCount}`;
  }

  if (toDate) {
    paramCount++;
    values.push(toDate);
    query += ` AND created_at <= $${paramCount}`;
  }

  const result = await pool.query(query, values);
  return parseInt(result.rows[0].count, 10);
}

module.exports = {
  createSupportMessage,
  getAllSupportMessages,
  getSupportMessagesByUser,
  getSupportMessageById,
  updateSupportMessageStatus,
  getSupportStatistics,
  getSupportMessagesCount,
  checkSupportTable
};

