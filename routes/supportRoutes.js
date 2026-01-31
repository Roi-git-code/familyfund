

const express = require('express');
const router = express.Router();
const supportModel = require('../models/supportModel');
const { sendSupportNotificationEmail } = require('../utils/mail');
const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');

// Debug middleware
router.use((req, res, next) => {
  console.log('🔍 Support route accessed by user:', req.session.user?.username);
  next();
});

// GET support page
router.get('/support', requireAuth, async (req, res) => {
  try {
    console.log('📱 Rendering support page for user:', req.session.user?.username);
    res.render('contact', {
      user: req.session.user
    });
  } catch (err) {
    console.error('Error loading support page:', err);
    req.flash('error', 'Unable to load support page');
    res.redirect('/dashboard');
  }
});

// POST submit support message - SIMPLIFIED VERSION
router.post('/support/submit', requireAuth, async (req, res) => {
  console.log('📨 === PROCESSING SUPPORT FORM SUBMISSION ===');
  console.log('📨 Session user:', req.session.user);
  console.log('📨 Request body:', req.body);
  
  // Extract form data
  const { 
    name = '', 
    email = '', 
    subject = '', 
    urgency = 'medium', 
    message = '' 
  } = req.body;
  
  const user = req.session.user || {};
  
  // Log the extracted data
  console.log('📨 Extracted form data:', { name, email, subject, urgency, message });
  
  // Validate required fields
  const errors = [];
  if (!name.trim()) {
    errors.push('Name is required');
    console.log('❌ Validation error: Name is required');
  }
  if (!email.trim()) {
    errors.push('Email is required');
    console.log('❌ Validation error: Email is required');
  }
  if (!subject.trim()) {
    errors.push('Subject is required');
    console.log('❌ Validation error: Subject is required');
  }
  if (!message.trim() || message.length < 10) {
    errors.push('Message must be at least 10 characters');
    console.log('❌ Validation error: Message too short');
  }
  
  if (errors.length > 0) {
    console.error('❌ Form validation failed:', errors);
    req.flash('error', errors.join(', '));
    return res.redirect('/support');
  }
  
  try {
    console.log('🗄️ Attempting to create support message in database...');
    
    // Prepare data for database
    const supportData = {
      user_id: user.id || null,
      member_id: user.member_Id || null,
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      urgency: urgency,
      message: message.trim()
    };
    
    console.log('🗄️ Support data to save:', supportData);
    
    // Use the support model to save to database
    const result = await supportModel.createSupportMessage(supportData);
    
    console.log('✅ Support message successfully saved with ID:', result.id);
    
    // Success flash message
    req.flash('success', 'Thank you for your message! We will respond within 2-4 hours.');
    
    // Redirect back to support page
    return res.redirect('/support');
    
  } catch (err) {
    console.error('❌ CRITICAL ERROR saving support message:');
    console.error('❌ Error name:', err.name);
    console.error('❌ Error message:', err.message);
    console.error('❌ Error stack:', err.stack);
    
    // More specific error messages
    if (err.code === '23502') { // not-null violation
      req.flash('error', 'Database error: Missing required field');
    } else if (err.code === '23503') { // foreign key violation
      req.flash('error', 'Database error: Invalid user reference');
    } else if (err.code === '23505') { // unique violation
      req.flash('error', 'A message with these details already exists');
    } else {
      req.flash('error', 'Failed to save your message. Please try again.');
    }
    
    return res.redirect('/support');
  }
});

// Admin: View all support messages
router.get('/admin/support', requireAuth, allowRoles('admin', 'chairman', 'chief_signatory'), async (req, res) => {
  try {
    const { status, urgency, fromDate, toDate, page = 1 } = req.query;
    
    const messages = await supportModel.getAllSupportMessages({
      status,
      urgency,
      fromDate,
      toDate,
      page: parseInt(page),
      limit: 20
    });

    const totalCount = await supportModel.getSupportMessagesCount({ status, urgency, fromDate, toDate });
    const statistics = await supportModel.getSupportStatistics();

    const totalPages = Math.ceil(totalCount / 20);

    // Ensure statistics has all required properties
    const safeStatistics = {
      total_messages: statistics?.total_messages || 0,
      new_messages: statistics?.new_messages || 0,
      in_progress_messages: statistics?.in_progress_messages || 0,
      resolved_messages: statistics?.resolved_messages || 0,
      closed_messages: statistics?.closed_messages || 0,
      critical_messages: statistics?.critical_messages || 0,
      high_messages: statistics?.high_messages || 0,
      last_7_days: statistics?.last_7_days || 0
    };

    res.render('admin/support_messages', {
      user: req.session.user,
      messages,
      statistics: safeStatistics,
      currentPage: parseInt(page),
      totalPages,
      totalCount, // This was missing
      filters: { status, urgency, fromDate, toDate }
    });
  } catch (err) {
    console.error('Error loading support messages:', err);
    req.flash('error', 'Unable to load support messages');
    res.redirect('/dashboard');
  }
});


// Admin: View single support message
router.get('/admin/support/:id', requireAuth, allowRoles('admin', 'chairman', 'chief_signatory'), async (req, res) => {
  try {
    const messageId = req.params.id;
    const message = await supportModel.getSupportMessageById(messageId);

    if (!message) {
      req.flash('error', 'Support message not found');
      return res.redirect('/admin/support');
    }

    res.render('admin/support_message_details', {
      user: req.session.user,
      message
    });
  } catch (err) {
    console.error('Error loading support message:', err);
    req.flash('error', 'Unable to load support message');
    res.redirect('/admin/support');
  }
});

// Admin: Update message status
 router.post('/admin/support/:id/update-status', requireAuth, allowRoles('admin', 'chairman', 'chief_signatory'), async (req, res) => {
  try {
    const messageId = req.params.id;
    const { status, admin_notes, assigned_to } = req.body;

    console.log('📝 Updating support message:', { messageId, status, admin_notes, assigned_to });

    await supportModel.updateSupportMessageStatus(
      messageId, 
      status, 
      admin_notes, 
      assigned_to || null
    );

    req.flash('success', 'Support message status updated successfully');
    res.redirect(`/admin/support/${messageId}`);
  } catch (err) {
    console.error('Error updating support message:', err);
    req.flash('error', 'Failed to update support message');
    
    // Use the messageId from the route parameter
    const messageId = req.params.id;
    res.redirect(`/admin/support/${messageId}`);
  }
});


// User: View their own support messages
router.get('/support/my-messages', requireAuth, async (req, res) => {
  try {
    const { page = 1 } = req.query;
    
    const messages = await supportModel.getSupportMessagesByUser(
      req.session.user.id, 
      { page: parseInt(page), limit: 10 }
    );

    res.render('user/support_messages', {
      user: req.session.user,
      messages,
      currentPage: parseInt(page)
    });
  } catch (err) {
    console.error('Error loading user support messages:', err);
    req.flash('error', 'Unable to load your support messages');
    res.redirect('/dashboard');
  }
});

module.exports = router;


