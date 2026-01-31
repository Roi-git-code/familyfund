

// models/supportModel.js
const pool = require('../db');
const { sendSupportNotificationEmail, sendSupportResponseEmail } = require('../utils/mail');
const { getOfficerRolesBySubject, getSubjectKey } = require('../utils/supportEmailConfig');
const userModel = require('./userModel');

// Function to get emails for roles
const getEmailsForRoles = async (roles) => {
  try {
    console.log('🔍 Getting emails for roles:', roles);
    
    if (!roles || roles.length === 0) {
      console.log('⚠️ No roles provided, using default admin email');
      return [process.env.ADMIN_EMAIL || 'itzfamilyfund@gmail.com'];
    }
    
    // Get users with these roles from database
    const users = await userModel.getUsersByRoles(roles);
    
    // Extract emails
    const emails = users.map(user => user.email).filter(email => email && email.includes('@'));
    
    // If no users found in database, use fallback emails from environment
    if (emails.length === 0) {
      console.log('⚠️ No users found in database, using fallback emails');
      
      const roleToEmailMap = {
        'admin': process.env.ADMIN_EMAIL || 'itzfamilyfund@gmail.com',
        'chairman': process.env.CHAIRMAN_EMAIL || 'itzfamilyfund@gmail.com',
        'chief_signatory': process.env.CHIEF_SIGNATORY_EMAIL || 'itzfamilyfund@gmail.com',
        'assistant_signatory': process.env.ASSISTANT_SIGNATORY_EMAIL || 'itzfamilyfund@gmail.com'
      };
      
      roles.forEach(role => {
        if (roleToEmailMap[role] && !emails.includes(roleToEmailMap[role])) {
          emails.push(roleToEmailMap[role]);
        }
      });
      
      // If still no emails, add default support email
      if (emails.length === 0) {
        emails.push('itzfamilyfund@gmail.com');
      }
    }
    
    // Remove duplicates
    const uniqueEmails = [...new Set(emails)];
    
    console.log(`✅ Final email list for notification:`, uniqueEmails);
    return uniqueEmails;
  } catch (error) {
    console.error('❌ Error in getEmailsForRoles:', error.message);
    console.error('Stack:', error.stack);
    
    // Return at least the admin email as fallback
    return [process.env.ADMIN_EMAIL || 'itzfamilyfund@gmail.com'];
  }
};

// Function to send notifications to officers
const sendOfficerNotifications = async (supportMessage) => {
  try {
    console.log('📧 Starting officer notifications for support message:', supportMessage.id);
    console.log('📋 Subject:', supportMessage.subject);
    console.log('👤 From:', supportMessage.name, `(${supportMessage.email})`);
    
    // Get the subject key
    const subjectKey = getSubjectKey(supportMessage.subject);
    console.log('🔑 Subject key:', subjectKey);
    
    // Get roles that should be notified
    const roles = getOfficerRolesBySubject(subjectKey);
    console.log('👥 Roles to notify:', roles);
    
    // Get emails for these roles
    const officerEmails = await getEmailsForRoles(roles);
    console.log('📨 Emails to send to:', officerEmails);
    
    // Prepare support data for email
    const emailData = {
      messageId: supportMessage.id,
      name: supportMessage.name,
      email: supportMessage.email,
      subject: supportMessage.subject,
      urgency: supportMessage.urgency || 'medium',
      message: supportMessage.message,
      createdAt: supportMessage.created_at || new Date(),
      memberId: supportMessage.member_id,
      userId: supportMessage.user_id
    };
    
    // Send email to each officer
    let successCount = 0;
    let failCount = 0;
    
    for (const email of officerEmails) {
      try {
        console.log(`📤 Sending notification to: ${email}`);
        
        await sendSupportNotificationEmail({
          ...emailData,
          toEmail: email
        });
        
        successCount++;
        console.log(`✅ Notification sent to ${email}`);
      } catch (emailError) {
        failCount++;
        console.error(`❌ Failed to send notification to ${email}:`, emailError.message);
        // Continue with other emails even if one fails
      }
    }
    
    console.log(`📊 Notification results: ${successCount} successful, ${failCount} failed`);
    
    return {
      successCount,
      failCount,
      total: officerEmails.length,
      emails: officerEmails
    };
  } catch (error) {
    console.error('❌ Error in sendOfficerNotifications:', error.message);
    console.error('Stack:', error.stack);
    
    // Don't throw error - we don't want to fail the support submission
    return {
      successCount: 0,
      failCount: 1,
      total: 1,
      emails: [],
      error: error.message
    };
  }
};

// Function to send status update to user
const sendStatusUpdateToUser = async (supportMessage, oldStatus, newStatus, adminName = 'Support Team') => {
  try {
    console.log(`📧 Preparing status update for user: ${supportMessage.email}`);
    console.log(`🔄 Status change: ${oldStatus} → ${newStatus}`);
    
    // Only send email if status actually changed
    if (oldStatus !== newStatus && supportMessage.email) {
      console.log(`📤 Sending status update to: ${supportMessage.email}`);
      
      await sendSupportResponseEmail(supportMessage.email, {
        messageId: supportMessage.id,
        subject: supportMessage.subject,
        adminName: adminName,
        response: supportMessage.admin_notes || `Your support request status has been updated to ${newStatus}.`,
        status: newStatus,
        responseDate: new Date(),
        userMessage: supportMessage.message
      });
      
      console.log(`✅ Status update email sent to user: ${supportMessage.email}`);
      return true;
    } else {
      console.log(`ℹ️ No email sent - status unchanged or no email address`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending status update email:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
};

// Create support message
async function createSupportMessage(data) {
  console.log('🗄️ Creating support message in database...');
  
  const {
    user_id,
    member_id,
    name,
    email,
    subject,
    urgency = 'medium',
    message,
    status = 'new'
  } = data;

  const insertQuery = `
    INSERT INTO support_messages (
      user_id, member_id, name, email, subject, 
      urgency, message, status, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING *
  `;

  const insertValues = [
    user_id, member_id, name, email, subject,
    urgency, message, status
  ];

  try {
    console.log('📝 Executing insert query...');
    const result = await pool.query(insertQuery, insertValues);
    const supportMessage = result.rows[0];
    
    console.log('✅ Support message saved with ID:', supportMessage.id);
    
    // Send notifications to officers (async - don't wait for it)
    sendOfficerNotifications(supportMessage)
      .then(result => {
        console.log('📧 Officer notifications completed:', result);
      })
      .catch(err => {
        console.error('⚠️ Officer notifications failed (non-critical):', err.message);
      });
    
    return supportMessage;
  } catch (error) {
    console.error('❌ Error creating support message:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    console.error('Error stack:', error.stack);
    
    // Check for specific errors
    if (error.code === '23502') { // not-null violation
      throw new Error('Database error: Missing required field');
    } else if (error.code === '23503') { // foreign key violation
      throw new Error('Database error: Invalid user reference');
    } else if (error.code === '23505') { // unique violation
      throw new Error('A message with these details already exists');
    } else {
      throw new Error(`Failed to save support message: ${error.message}`);
    }
  }
}

// Update support message status
async function updateSupportMessageStatus(id, status, admin_notes, assigned_to, updated_by) {
  console.log(`🔄 Updating support message ${id} status to ${status}`);
  
  try {
    // Get current message first
    const currentMessage = await getSupportMessageById(id);
    
    if (!currentMessage) {
      throw new Error(`Support message with ID ${id} not found`);
    }
    
    console.log(`📋 Current status: ${currentMessage.status}, New status: ${status}`);
    
    const updateQuery = `
      UPDATE support_messages 
      SET 
        status = $1,
        admin_notes = $2,
        assigned_to = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    const updateValues = [
      status,
      admin_notes || currentMessage.admin_notes,
      assigned_to || currentMessage.assigned_to,
      id
    ];

    const result = await pool.query(updateQuery, updateValues);
    const updatedMessage = result.rows[0];
    
    console.log('✅ Support message status updated successfully');
    
    // Send status update to user (async - don't wait for it)
    sendStatusUpdateToUser(updatedMessage, currentMessage.status, status, updated_by || 'Support Team')
      .then(sent => {
        if (sent) {
          console.log('✅ User notification sent successfully');
        }
      })
      .catch(err => {
        console.error('⚠️ User notification failed (non-critical):', err.message);
      });
    
    return updatedMessage;
  } catch (error) {
    console.error('❌ Error updating support message status:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Get support message by ID (FIXED - using correct column names)
async function getSupportMessageById(id) {
  try {
    const query = `
      SELECT 
        sm.*,
        m.first_name as member_first_name,
        m.sur_name as member_sur_name,
        m.email as member_email
      FROM support_messages sm
      LEFT JOIN member m ON sm.member_id = m.id
      WHERE sm.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error getting support message by ID:', error);
    throw error;
  }
}

// Get all support messages (for admin) - FIXED QUERY
async function getAllSupportMessages(filters = {}) {
  try {
    const {
      status,
      urgency,
      fromDate,
      toDate,
      page = 1,
      limit = 20
    } = filters;
    
    let query = `
      SELECT 
        sm.*,
        m.first_name as member_first_name,
        m.sur_name as member_sur_name,
        m.email as member_email
      FROM support_messages sm
      LEFT JOIN member m ON sm.member_id = m.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      query += ` AND sm.status = $${paramCount}`;
      queryParams.push(status);
    }
    
    if (urgency) {
      paramCount++;
      query += ` AND sm.urgency = $${paramCount}`;
      queryParams.push(urgency);
    }
    
    if (fromDate) {
      paramCount++;
      query += ` AND sm.created_at >= $${paramCount}`;
      queryParams.push(fromDate);
    }
    
    if (toDate) {
      paramCount++;
      query += ` AND sm.created_at <= $${paramCount}`;
      queryParams.push(toDate);
    }
    
    query += ` ORDER BY 
      CASE sm.urgency
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      sm.created_at DESC`;
    
    // Add pagination
    const offset = (page - 1) * limit;
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    queryParams.push(limit);
    
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    queryParams.push(offset);
    
    console.log('📝 Executing query:', query);
    console.log('🔢 Parameters:', queryParams);
    
    const result = await pool.query(query, queryParams);
    return result.rows;
  } catch (error) {
    console.error('Error getting all support messages:', error);
    throw error;
  }
}

// Get support messages count
async function getSupportMessagesCount(filters = {}) {
  try {
    const {
      status,
      urgency,
      fromDate,
      toDate
    } = filters;
    
    let query = `
      SELECT COUNT(*) as count
      FROM support_messages sm
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      query += ` AND sm.status = $${paramCount}`;
      queryParams.push(status);
    }
    
    if (urgency) {
      paramCount++;
      query += ` AND sm.urgency = $${paramCount}`;
      queryParams.push(urgency);
    }
    
    if (fromDate) {
      paramCount++;
      query += ` AND sm.created_at >= $${paramCount}`;
      queryParams.push(fromDate);
    }
    
    if (toDate) {
      paramCount++;
      query += ` AND sm.created_at <= $${paramCount}`;
      queryParams.push(toDate);
    }
    
    const result = await pool.query(query, queryParams);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    console.error('Error getting support messages count:', error);
    throw error;
  }
}

// Get support statistics
async function getSupportStatistics() {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as new_messages,
        COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_messages,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_messages,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_messages,
        COUNT(CASE WHEN urgency = 'critical' THEN 1 END) as critical_messages,
        COUNT(CASE WHEN urgency = 'high' THEN 1 END) as high_messages,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as last_7_days
      FROM support_messages
    `;
    
    const result = await pool.query(query);
    const stats = result.rows[0];
    
    // Ensure all counts are numbers (not null)
    const safeStats = {
      total_messages: parseInt(stats.total_messages) || 0,
      new_messages: parseInt(stats.new_messages) || 0,
      in_progress_messages: parseInt(stats.in_progress_messages) || 0,
      resolved_messages: parseInt(stats.resolved_messages) || 0,
      closed_messages: parseInt(stats.closed_messages) || 0,
      critical_messages: parseInt(stats.critical_messages) || 0,
      high_messages: parseInt(stats.high_messages) || 0,
      last_7_days: parseInt(stats.last_7_days) || 0
    };
    
    // Calculate "other" messages (for debugging)
    const calculatedTotal = safeStats.new_messages + safeStats.in_progress_messages + 
                           safeStats.resolved_messages + safeStats.closed_messages;
    
    console.log('📊 Support Statistics:', safeStats);
    console.log(`📝 Calculated total from statuses: ${calculatedTotal}, Database total: ${safeStats.total_messages}`);
    
    return safeStats;
  } catch (error) {
    console.error('Error getting support statistics:', error);
    // Return safe defaults
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

// Get support messages by user
async function getSupportMessagesByUser(userId, options = {}) {
  try {
    const { page = 1, limit = 10 } = options;
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT *
      FROM support_messages
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      OFFSET $3
    `;
    
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  } catch (error) {
    console.error('Error getting user support messages:', error);
    throw error;
  }
}

module.exports = {
  createSupportMessage,
  updateSupportMessageStatus,
  getSupportMessageById,
  getAllSupportMessages,
  getSupportMessagesCount,
  getSupportStatistics,
  getSupportMessagesByUser,
  sendOfficerNotifications,
  sendStatusUpdateToUser,
  getEmailsForRoles
};


