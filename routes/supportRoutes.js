const express = require('express');
const router = express.Router();
const supportModel = require('../models/supportModel');
const { sendSupportNotificationEmail } = require('../utils/mail');
const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');

// Add debugging middleware
router.use((req, res, next) => {
  console.log('🔍 Support route accessed by user:', req.session.user?.username);
  next();
});

router.post('/support/submit', async (req, res) => {
  console.log('📨 SUPPORT SUBMIT ROUTE HIT');
  console.log('📨 Support request body:', req.body);
  console.log('👤 Session user:', req.session.user);

  const { subject, urgency, message } = req.body;

  const user = req.session.user || {};
  const memberId = user.member_Id || null;
  const name = `${user.first_name || ''} ${user.surname || ''}`.trim();
  const email = user.username || req.body.email || '';

  console.log('📝 Prepared data for DB:', { 
    userId: user.id, 
    memberId, 
    name, 
    email, 
    subject, 
    urgency, 
    message 
  });

  try {
    console.log('🗄️ Calling supportModel.createSupportMessage...');
    
    // Use the correct function from supportModel
    const result = await supportModel.createSupportMessage({
      userId: user.id || null,
      memberId,
      name,
      email,
      subject,
      urgency,
      message
    });

    console.log('✅ Support message created with ID:', result.id);

    req.flash('success', 'Thank you for your message! We will respond within 2-4 hours.');
    res.redirect('/support');
  } catch (err) {
    console.error('❌ Error submitting support request:', err);
    console.error('❌ Error details:', err.message);
    console.error('❌ Stack trace:', err.stack);
    req.flash('error', 'Something went wrong. Please try again.');
    res.redirect('/support');
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

    res.render('admin/support_messages', {
      user: req.session.user,
      messages,
      statistics,
      currentPage: parseInt(page),
      totalPages,
      filters: { status, urgency, fromDate, toDate },
      flash: req.flash()
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
      message,
      flash: req.flash()
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
      currentPage: parseInt(page),
      flash: req.flash()
    });
  } catch (err) {
    console.error('Error loading user support messages:', err);
    req.flash('error', 'Unable to load your support messages');
    res.redirect('/dashboard');
  }
});

// Test route to check database connection and table
router.get('/test-db', async (req, res) => {
  try {
    console.log('🔍 Testing support table...');
    const messages = await supportModel.checkSupportTable();
    
    res.json({
      success: true,
      tableExists: messages !== null,
      recentMessages: messages,
      user: req.session.user
    });
  } catch (error) {
    console.error('❌ Test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test route to check if support routes are working
router.get('/test', (req, res) => {
  console.log('✅ Support test route is working');
  res.json({ 
    message: 'Support routes are working',
    user: req.session.user 
  });
});

// Test database insertion
router.get('/test-insert', async (req, res) => {
  try {
    console.log('🧪 Testing database insertion...');
    
    const testData = {
      userId: req.session.user?.id || 1,
      memberId: req.session.user?.member_Id || null,
      name: 'Test User',
      email: 'test@example.com',
      subject: 'Test Message',
      urgency: 'low',
      message: 'This is a test message from the test route'
    };

    const result = await supportModel.createSupportMessage(testData);
    
    res.json({ 
      success: true, 
      message: 'Test insertion successful',
      insertedId: result.id 
    });
  } catch (error) {
    console.error('❌ Test insertion failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

module.exports = router;

