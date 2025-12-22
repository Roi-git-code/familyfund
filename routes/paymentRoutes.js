
//routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentModel = require('../models/paymentModel');
const { requireAuth, requireRole } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getLipiaLinkForAmount, getAvailableAmounts } = require('../config/paymentLinks');

// Helper function to check admin role
function checkAdminRole(user) {
  if (!user || !user.role) return false;
  return ['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role);
}

// Service function to get payment link with fallback (ACTIVE ONLY)
async function getPaymentLink(amount) {
  let paymentLink = null;
  
  try {
    // First try to get from database - this should only find ACTIVE links
    paymentLink = await paymentModel.getPaymentLinkByAmount(amount);
    console.log(`✅ Found payment link in database for amount: ${amount}`);
  } catch (dbError) {
    console.warn(`⚠️ Database error, falling back to config: ${dbError.message}`);
    
    try {
      // Fallback to config file
      paymentLink = getLipiaLinkForAmount(amount);
      console.log(`✅ Found payment link in config for amount: ${amount}`);
    } catch (configError) {
      console.error(`❌ Both database and config failed for amount: ${amount}`, configError);
      throw new Error(`Unable to find payment link for amount: ${amount}`);
    }
  }
  
  return paymentLink;
}

// Service function to get all available amounts with fallback (ACTIVE ONLY)
async function getAllAvailableAmounts() {
  let amounts = [];
  
  try {
    // Use the new method that only returns ACTIVE payment links
    amounts = await paymentModel.getActivePaymentLinks();
    console.log(`✅ Found ${amounts.length} ACTIVE payment links in database`);
  } catch (dbError) {
    console.warn(`⚠️ Database error, falling back to config: ${dbError.message}`);
    
    try {
      // Fallback to config file (config should only have active links)
      amounts = getAvailableAmounts();
      console.log(`✅ Found ${amounts.length} payment links in config`);
    } catch (configError) {
      console.error(`❌ Both database and config failed:`, configError);
      // Return empty array, UI has fallback buttons
      amounts = [];
    }
  }
  
  return amounts;
}

// ----------------- GET /payments -----------------
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const payments = await paymentModel.getPaymentsByMember(user.member_Id);
    
    // Calculate total contributions for the current month
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const totalContributions = payments
      .filter(p => {
        const paymentDate = new Date(p.created_at);
        return p.status === 'Paid' && 
               paymentDate.getMonth() === currentMonth && 
               paymentDate.getFullYear() === currentYear;
      })
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    // Get ACTIVE available amounts only
    const availableAmounts = await getAllAvailableAmounts();

    res.render('payment/payment', { 
      user, 
      payments, 
      totalContributions,
      availableAmounts
     
    });
  } catch (err) {
    console.error('Error loading payments page:', err);
    req.flash('error', 'Failed to load payments page');
    res.redirect('/dashboard');
  }
});

// ----------------- Payment Links Management Routes -----------------

// GET /payments/admin/links/api - Get all payment links (API) - INCLUDES INACTIVE
router.get('/admin/links/api', requireAuth, async (req, res) => {
  try {
    // Check admin role manually
    if (!checkAdminRole(req.session.user)) {
      console.log('❌ Unauthorized access attempt by user:', req.session.user);
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    console.log('📥 Fetching ALL payment links from database (including inactive)...');
    
    // Use getAllPaymentLinks(false) to get ALL links including inactive
    const paymentLinks = await paymentModel.getAllPaymentLinks(false);
    
    console.log(`✅ Found ${paymentLinks.length} payment links (including inactive)`);
    
    res.json({
      success: true,
      links: paymentLinks
    });
  } catch (err) {
    console.error('❌ Error fetching payment links:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment links from database'
    });
  }
});

// POST /payments/admin/links - Create new payment link
router.post('/admin/links', requireAuth, async (req, res) => {
  try {
    // Check admin role manually
    if (!checkAdminRole(req.session.user)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const { amount, description, lipia_link } = req.body;

    console.log('📥 Creating new payment link:', { amount, description });

    // Validate required fields
    if (!amount || !description || !lipia_link) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate amount
    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be at least TSh 100'
      });
    }

    // Check if amount already exists
    const existingLink = await paymentModel.getPaymentLinkByAmount(paymentAmount);
    if (existingLink) {
      return res.status(400).json({
        success: false,
        message: `Payment link for TSh ${paymentAmount.toLocaleString()} already exists`
      });
    }

    // Create new payment link
    const newLink = await paymentModel.createPaymentLink({
      amount: paymentAmount,
      description,
      lipia_link,
      is_active: true
    });

    console.log(`✅ New payment link created: TSh ${paymentAmount.toLocaleString()} by ${req.session.user.username}`);

    res.json({
      success: true,
      message: `Payment link for TSh ${paymentAmount.toLocaleString()} created successfully`,
      link: newLink
    });

  } catch (err) {
    console.error('❌ Error creating payment link:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment link'
    });
  }
});

// PUT /payments/admin/links/:id/status - Update payment link status
router.put('/admin/links/:id/status', requireAuth, async (req, res) => {
  try {
    // Check admin role manually
    if (!checkAdminRole(req.session.user)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const { id } = req.params;
    const { is_active } = req.body;

    console.log(`🔄 Updating payment link status: ID ${id}, active: ${is_active}`);

    const updatedLink = await paymentModel.updatePaymentLinkStatus(id, is_active);

    const action = is_active ? 'activated' : 'deactivated';
    console.log(`✅ Payment link ${action}: TSh ${updatedLink.amount.toLocaleString()} by ${req.session.user.username}`);

    res.json({
      success: true,
      message: `Payment link ${action} successfully`,
      link: updatedLink
    });

  } catch (err) {
    console.error('❌ Error updating payment link status:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update payment link status'
    });
  }
});

// DELETE /payments/admin/links/:id - Delete payment link
router.delete('/admin/links/:id', requireAuth, async (req, res) => {
  try {
    // Check admin role manually
    if (!checkAdminRole(req.session.user)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const { id } = req.params;

    console.log(`🗑️ Deleting payment link: ID ${id}`);

    const deletedLink = await paymentModel.deletePaymentLink(id);

    console.log(`✅ Payment link deleted: TSh ${deletedLink.amount.toLocaleString()} by ${req.session.user.username}`);

    res.json({
      success: true,
      message: `Payment link for TSh ${deletedLink.amount.toLocaleString()} deleted successfully`
    });

  } catch (err) {
    console.error('❌ Error deleting payment link:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete payment link'
    });
  }
});

// Temporary debug route - remove after testing
router.get('/admin/links/debug', requireAuth, async (req, res) => {
  try {
    // Check admin role manually
    if (!checkAdminRole(req.session.user)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    console.log('🔧 Debug: Testing payment_links table...');
    
    // Test if table exists and has data
    const testQuery = `
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'payment_links'
      ORDER BY ordinal_position;
    `;
    
    const tableInfo = await pool.query(testQuery);
    console.log('📋 Table structure:', tableInfo.rows);
    
    // Test data retrieval
    const testData = await paymentModel.getAllPaymentLinks(false);
    
    res.json({
      success: true,
      table_structure: tableInfo.rows,
      payment_links: testData,
      message: `Found ${testData.length} payment links`
    });
    
  } catch (err) {
    console.error('❌ Debug error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      message: 'Database connection or table issue'
    });
  }
});

// ----------------- POST /payments/initiate-lipia -----------------
// Updated initiate-lipia route to include payment type
router.post('/initiate-lipia', requireAuth, async (req, res) => {
  try {
    const { amount, phone_number, payment_type = 'Contribution' } = req.body;
    const user = req.session.user;

    console.log('💰 Lipia Payment Initiation:', { 
      amount, 
      phone_number,
      payment_type,
      user: user.username 
    });

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount < 100) {
      req.flash('error', 'Invalid amount (minimum TSh 100)');
      return res.redirect('/payments');
    }

    // Validate payment type
    const validPaymentTypes = ['Contribution', 'ROI', 'Refund', 'Other'];
    if (!validPaymentTypes.includes(payment_type)) {
      req.flash('error', 'Invalid payment type');
      return res.redirect('/payments');
    }

    // Get the appropriate Lipia link with fallback mechanism
    let paymentLink;
    try {
      paymentLink = await getPaymentLink(paymentAmount);
    } catch (linkError) {
      console.error('❌ Failed to get payment link:', linkError);
      req.flash('error', 'Payment system temporarily unavailable. Please try again later.');
      return res.redirect('/payments');
    }

    // Generate unique transaction ID
    const transactionId = `LIPIA${Date.now()}${Math.random().toString(36).slice(2,9).toUpperCase()}`;

    // Create payment record in database with payment type
    const payment = await paymentModel.createPayment({
      member_id: user.member_Id,
      amount: paymentAmount,
      payment_method: 'azam_lipia',
      phone_number,
      transaction_id: transactionId,
      payment_type: payment_type, // Add payment type
      status: 'Pending',
      metadata: {
        initiated_at: new Date().toISOString(),
        lipia_link: paymentLink.lipia_link,
        lipia_amount: paymentLink.amount,
        requested_amount: paymentAmount,
        phone: phone_number,
        description: paymentLink.description,
        source: paymentLink.id ? 'database' : 'config'
      }
    });

    console.log(`📝 Payment record created: ${transactionId} for amount ${paymentAmount}, type: ${payment_type}`);
    console.log(`🔗 Using Lipia link for amount: ${paymentLink.amount} (${paymentLink.description})`);

    // Redirect to payment status page with instructions
    req.flash('info', `${payment_type} payment record created. Please complete your payment of TSh ${paymentAmount.toLocaleString()} using the Azam Lipia link.`);
    res.redirect(`/payments/status/${transactionId}`);

  } catch (err) {
    console.error('❌ Payment Initiation Error:', err);
    req.flash('error', 'Failed to create payment record');
    res.redirect('/payments');
  }
});


// ----------------- GET /payments/status/:transactionId -----------------
router.get('/status/:transactionId', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const user = req.session.user;
    
    const payment = await paymentModel.getPaymentWithMemberInfo(transactionId);
    
    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    // Check if current user is the payment owner
    const isPaymentOwner = user.member_Id == payment.member_id;
    
    // Check if user is admin/official viewing someone else's payment
    const isAdminView = ['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role) && !isPaymentOwner;
    
    // Get payment member name for admin view
    let paymentMemberName = null;
    if (isAdminView && payment.first_name) {
      paymentMemberName = `${payment.first_name} ${payment.sur_name}`.trim();
    }

    // Get the Lipia link from payment metadata or use fallback
    let lipiaLink;
    if (payment.metadata && payment.metadata.lipia_link) {
      lipiaLink = payment.metadata.lipia_link;
    } else {
      // Fallback: get link based on payment amount
      try {
        const paymentLink = await getPaymentLink(payment.amount);
        lipiaLink = paymentLink.lipia_link;
      } catch (linkError) {
        console.error('❌ Failed to get fallback Lipia link:', linkError);
        req.flash('error', 'Unable to retrieve payment link. Please contact support.');
        return res.redirect('/payments');
      }
    }

    res.render('payment/payment-status', { 
      user: user, 
      payment, 
      lipiaLink: lipiaLink,
      isPaymentOwner: isPaymentOwner,
      isAdminView: isAdminView,
      paymentMemberName: paymentMemberName
    });
  } catch (err) {
    console.error('Error loading payment status:', err);
    req.flash('error', 'Failed to load payment status');
    res.redirect('/payments');
  }
});


// ----------------- POST /payments/update-status/:transactionId -----------------
// ----------------- POST /payments/update-status/:transactionId -----------------
router.post('/update-status/:transactionId', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { status, notes, payment_type, roi_percentage, period_start, period_end, refund_reason } = req.body;
    const user = req.session.user;

    // Check if user has permission to update status
    if (!['chief_signatory', 'assistant_signatory', 'chairman'].includes(user.role)) {
      return res.json({ success: false, message: 'Unauthorized to update payment status' });
    }

    const validStatuses = ['Pending', 'Paid', 'Failed'];
    if (!validStatuses.includes(status)) {
      return res.json({ success: false, message: 'Invalid status' });
    }

    // Get payment details
    const payment = await paymentModel.getPaymentByTransactionId(transactionId);
    if (!payment) {
      return res.json({ success: false, message: 'Payment not found' });
    }

    // Store the old status to check if we're changing to 'Paid'
    const oldStatus = payment.status;
    
    // Update payment status
    await paymentModel.updatePaymentStatus(transactionId, status, {
      manual_update: true,
      updated_by: user.username,
      notes: notes || 'Updated via payment history',
      updated_at: new Date().toISOString()
    });

    // If status changed to 'Paid', handle payment type-specific operations
    if (oldStatus !== 'Paid' && status === 'Paid') {
      try {
        // Prepare additional data based on payment type
        const additionalData = {};
        
        switch(payment.payment_type) {
          case 'ROI':
            additionalData.roi_percentage = roi_percentage || 10;
            additionalData.period_start = period_start || new Date().toISOString().split('T')[0];
            additionalData.period_end = period_end || 
              new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0];
            await handleROIPayment(payment, user, additionalData);
            break;
            
          case 'Refund':
            additionalData.reason = refund_reason || 'General refund';
            await handleRefundPayment(payment, user, additionalData);
            break;
            
          case 'Contribution':
            // DO NOT add contribution here - it's already handled elsewhere
            console.log(`ℹ️ Contribution payment ${transactionId} marked as Paid. Contribution will be added automatically by the system.`);
            break;
            
          default:
            console.log(`ℹ️ Payment type ${payment.payment_type} doesn't require special handling`);
            break;
        }
        
        console.log(`✅ ${payment.payment_type} payment processed successfully for ${transactionId}`);
        
      } catch (typeError) {
        console.error(`❌ Error processing ${payment.payment_type} payment:`, typeError);
        // Don't return error here - just log it
      }
    }

    res.json({ 
      success: true, 
      message: `Payment status updated to ${status}`,
      payment_type: payment.payment_type
    });

  } catch (err) {
    console.error('Status update error:', err);
    res.json({ success: false, message: 'Failed to update status' });
  }
});


// Helper function to handle paid payments based on type
async function handlePaidPayment(payment, user, additionalData = {}) {
  const { payment_type } = payment;
  
  switch(payment_type) {
    case 'Contribution':
      // Add to contributions table
      await handleContributionPayment(payment, user);
      break;
      
    case 'ROI':
      // Add to ROI table
      await handleROIPayment(payment, user, additionalData);
      break;
      
    case 'Refund':
      // Add to refunds table
      await handleRefundPayment(payment, user, additionalData);
      break;
      
    default:
      console.log(`ℹ️ Payment type ${payment_type} doesn't require special handling`);
      break;
  }
}

async function handleContributionPayment(payment, user) {
  try {
    // Use current date for contribution
    const transaction_date = new Date().toISOString().split('T')[0];
    
    // Use the contribution model to add transaction
    const contributionModel = require('../models/contributionModel');
    
    await contributionModel.addContributionTransaction({
      member_id: payment.member_id,
      amount: payment.amount,
      transaction_date: transaction_date,
      // You can add payment_id reference if your contribution_transactions table has it
      // payment_id: payment.id
    });
    
    console.log(`✅ Contribution added for payment ${payment.transaction_id}`);
    
  } catch (error) {
    console.error('❌ Error adding contribution:', error);
    throw error;
  }
}

async function handleROIPayment(payment, user, additionalData) {
  try {
    const { roi_percentage = 10, period_start, period_end } = additionalData;
    
    // Calculate ROI amount if not provided
    const calculated_amount = payment.amount * (parseFloat(roi_percentage) / 100);
    
    // Use default periods if not provided
    const startDate = period_start || new Date().toISOString().split('T')[0];
    const endDate = period_end || new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0];
    
    await paymentModel.createROI({
      member_id: payment.member_id,
      payment_id: payment.id,
      amount: payment.amount,
      roi_percentage: parseFloat(roi_percentage),
      period_start: startDate,
      period_end: endDate,
      calculated_amount: calculated_amount,
      status: 'Approved',
      notes: `ROI payment approved by ${user.username}`
    });
    
    console.log(`✅ ROI record created for payment ${payment.transaction_id}`);
    
  } catch (error) {
    console.error('❌ Error creating ROI record:', error);
    throw error;
  }
}

async function handleRefundPayment(payment, user, additionalData) {
  try {
    const { reason = 'General refund' } = additionalData;
    
    await paymentModel.createRefund({
      member_id: payment.member_id,
      payment_id: payment.id,
      amount: payment.amount,
      reason: reason,
      status: 'Completed',
      payment_method: payment.payment_method || 'Bank Transfer',
      account_details: {
        phone_number: payment.phone_number,
        processed_by: user.username
      },
      notes: `Refund processed by ${user.username}`
    });
    
    console.log(`✅ Refund record created for payment ${payment.transaction_id}`);
    
  } catch (error) {
    console.error('❌ Error creating refund record:', error);
    throw error;
  }
}

// Add a new route to get payment types
router.get('/payment-types', requireAuth, (req, res) => {
  const paymentTypes = [
    { value: 'Contribution', label: 'Contribution', description: 'Regular member contribution' },
    { value: 'ROI', label: 'Return on Investment', description: 'ROI payment to member' },
    { value: 'Refund', label: 'Refund', description: 'Refund to member' },
    { value: 'Other', label: 'Other', description: 'Other type of payment' }
  ];
  
  res.json({ success: true, paymentTypes });
});


// ----------------- GET /payments/check-status/:transactionId -----------------
router.get('/check-status/:transactionId', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const payment = await paymentModel.getPaymentByTransactionId(transactionId);
    
    if (!payment) {
      return res.json({ success: false, message: 'Payment not found' });
    }

    res.json({
      success: true,
      payment: payment
    });
  } catch (err) {
    console.error('Error checking payment status:', err);
    res.json({ success: false, message: 'Error checking status' });
  }
});


// ----------------- GET /payments/history (with filter support) -----------------


// ----------------- GET /payments/history (with advanced filter support) -----------------
router.get('/history', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    
    // FIX: Handle array viewType by taking the first element
    let viewType = req.query.view;
    if (Array.isArray(viewType)) {
      viewType = viewType[0];
    }
    viewType = viewType || 'individual';
    
    const { 
      from, 
      to, 
      status, 
      payment_type,  // Add this line
      amount_range, 
      member_search, 
      transaction_id, 
      phone_number,
      sort_by,
      per_page,
      page
    } = req.query;
    
    let payments;
    let pageTitle;

    console.log('🔄 Loading payment history - View Type:', viewType, 'User Role:', user.role);

    // ORIGINAL WORKING LOGIC
    if (viewType === 'all' && (user.role === 'chief_signatory' || user.role === 'assistant_signatory' || user.role === 'chairman')) {
      console.log('📊 Loading ALL members payments for admin user');
      payments = await paymentModel.getAllPaymentsWithMemberInfo();
      pageTitle = 'All Members Payment History';
    } else {
      console.log('👤 Loading INDIVIDUAL payments for user:', user.member_Id);
      payments = await paymentModel.getPaymentsByMember(user.member_Id);
      pageTitle = 'My Payment History';
    }

    console.log(`📈 Found ${payments.length} payments before filtering`);

    // Apply date filtering if provided
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      
      payments = payments.filter(payment => {
        const paymentDate = new Date(payment.created_at);
        return paymentDate >= fromDate && paymentDate <= toDate;
      });
    }

    if (status) {
      payments = payments.filter(payment => payment.status === status);
    }

    // ADD THIS FILTER FOR PAYMENT TYPE
    if (payment_type) {
      payments = payments.filter(payment => payment.payment_type === payment_type);
    }

    if (amount_range) {
      payments = payments.filter(payment => {
        const amount = parseFloat(payment.amount);
        switch (amount_range) {
          case '0-10000': return amount < 10000;
          case '10000-50000': return amount >= 10000 && amount < 50000;
          case '50000-100000': return amount >= 50000 && amount < 100000;
          case '100000-500000': return amount >= 100000 && amount < 500000;
          case '500000+': return amount >= 500000;
          default: return true;
        }
      });
    }

    if (member_search && viewType === 'all') {
      const searchTerm = member_search.toLowerCase();
      payments = payments.filter(payment => 
        (payment.first_name && payment.first_name.toLowerCase().includes(searchTerm)) ||
        (payment.sur_name && payment.sur_name.toLowerCase().includes(searchTerm)) ||
        (payment.member_email && payment.member_email.toLowerCase().includes(searchTerm))
      );
    }

    if (transaction_id) {
      payments = payments.filter(payment => 
        payment.transaction_id && payment.transaction_id.toLowerCase().includes(transaction_id.toLowerCase())
      );
    }

    if (phone_number) {
      payments = payments.filter(payment => 
        payment.phone_number && payment.phone_number.includes(phone_number)
      );
    }

    if (sort_by) {
      payments.sort((a, b) => {
        switch (sort_by) {
          case 'created_at_desc':
            return new Date(b.created_at) - new Date(a.created_at);
          case 'created_at_asc':
            return new Date(a.created_at) - new Date(b.created_at);
          case 'amount_desc':
            return parseFloat(b.amount) - parseFloat(a.amount);
          case 'amount_asc':
            return parseFloat(a.amount) - parseFloat(b.amount);
          default:
            return 0;
        }
      });
    } else {
      payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // Pagination
    const itemsPerPage = parseInt(per_page) || 25;
    const currentPage = parseInt(page) || 1;
    const totalItems = payments.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedPayments = payments.slice(startIndex, endIndex);

    // Calculate statistics
    const totalPaid = payments
      .filter(p => p.status === 'Paid')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const totalPending = payments
      .filter(p => p.status === 'Pending')
      .reduce((sum, p) => sum + parseFloat(p.amount), 0);

    const paidCount = payments.filter(p => p.status === 'Paid').length;
    const pendingCount = payments.filter(p => p.status === 'Pending').length;

    // UPDATE THIS LINE TO INCLUDE PAYMENT_TYPE
    const hasActiveFilters = !!(from || to || status || payment_type || amount_range || member_search || transaction_id || phone_number);

    // Helper functions
    const buildPaginationLink = (pageNum) => {
      const params = new URLSearchParams();
      params.set('view', viewType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);
      if (payment_type) params.set('payment_type', payment_type); // Add this line
      if (amount_range) params.set('amount_range', amount_range);
      if (member_search) params.set('member_search', member_search);
      if (transaction_id) params.set('transaction_id', transaction_id);
      if (phone_number) params.set('phone_number', phone_number);
      if (sort_by) params.set('sort_by', sort_by);
      if (per_page) params.set('per_page', per_page);
      params.set('page', pageNum);
      return `/payments/history?${params.toString()}`;
    };

    const buildQueryString = (updates = {}) => {
      const params = new URLSearchParams();
      params.set('view', updates.view || viewType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);
      if (payment_type) params.set('payment_type', payment_type); // Add this line
      if (amount_range) params.set('amount_range', amount_range);
      if (member_search) params.set('member_search', member_search);
      if (transaction_id) params.set('transaction_id', transaction_id);
      if (phone_number) params.set('phone_number', phone_number);
      if (sort_by) params.set('sort_by', sort_by);
      if (per_page) params.set('per_page', per_page);
      return `&${params.toString()}`;
    };

    const buildExportQueryString = () => {
      const params = new URLSearchParams();
      params.set('view', viewType);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (status) params.set('status', status);
      if (payment_type) params.set('payment_type', payment_type); // Add this line
      if (amount_range) params.set('amount_range', amount_range);
      if (member_search) params.set('member_search', member_search);
      if (transaction_id) params.set('transaction_id', transaction_id);
      if (phone_number) params.set('phone_number', phone_number);
      return `&${params.toString()}`;
    };

    res.render('payment/payment-history', {
      user: req.session.user,
      payments: paginatedPayments,
      viewType: viewType,
      pageTitle: pageTitle,
      from: from || '',
      to: to || '',
      status: status || '',
      payment_type: payment_type || '', // Add this line - VERY IMPORTANT!
      amount_range: amount_range || '',
      member_search: member_search || '',
      transaction_id: transaction_id || '',
      phone_number: phone_number || '',
      sort_by: sort_by || 'created_at_desc',
      per_page: itemsPerPage,
      currentPage: currentPage,
      totalPages: totalPages,
      hasActiveFilters: hasActiveFilters,
      statistics: {
        totalPaid: totalPaid,
        totalPending: totalPending,
        paidCount: paidCount,
        pendingCount: pendingCount,
        totalPayments: totalItems
      },
      buildPaginationLink: buildPaginationLink,
      buildQueryString: buildQueryString,
      buildExportQueryString: buildExportQueryString
    });

  } catch (err) {
    console.error('❌ Error loading payment history:', err);
    req.flash('error', 'Failed to load payment history');
    res.redirect('/payments');
  }
});


// ----------------- GET /payments/admin -----------------
router.get('/admin', requireAuth, requireRole('chairman'), async (req, res) => {
  try {
    const payments = await paymentModel.getAllPayments();
    
    res.render('payment/admin-payments', { 
      user: req.session.user, 
      payments
      });
  } catch (err) {
    console.error('Error loading admin payments:', err);
    req.flash('error', 'Failed to load payments');
    res.redirect('/dashboard');
  }
});

// ----------------- POST /payments/webhook -----------------
// Optional: If AzamPay provides webhooks later
router.post('/webhook', express.json(), async (req, res) => {
  try {
    console.log('Webhook received:', req.body);
    
    // Process webhook data if available
    const { transactionId, status, amount } = req.body;
    
    if (transactionId) {
      let paymentStatus = 'Pending';
      if (status === 'SUCCESS' || status === 'success') paymentStatus = 'Paid';
      if (status === 'FAILED' || status === 'failed') paymentStatus = 'Failed';
      
      await paymentModel.updatePaymentStatus(transactionId, paymentStatus, {
        webhook_data: req.body,
        webhook_received_at: new Date().toISOString()
      });
      
      console.log(`✅ Webhook processed: ${transactionId} -> ${paymentStatus}`);
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

// ----------------- GET /payments/lipia-checkout/:transactionId -----------------
router.get('/lipia-checkout/:transactionId', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const payment = await paymentModel.getPaymentByTransactionId(transactionId);
    
    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    // Update payment status to indicate user is on checkout page
    if (payment.status === 'Pending') {
      await paymentModel.updatePaymentStatus(transactionId, 'Processing', {
        checkout_accessed_at: new Date().toISOString()
      });
    }

    res.render('payment/lipia-checkout', {
      user: req.session.user,
      payment: payment,
      lipiaLink: PERMANENT_LIPIA_LINK
    });

  } catch (err) {
    console.error('Lipia checkout error:', err);
    req.flash('error', 'Failed to load payment checkout');
    res.redirect('/payments');
  }
});


// ----------------- GET /payments/status/:transactionId/pdf -----------------
router.get('/status/:transactionId/pdf', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const payment = await paymentModel.getPaymentByTransactionId(transactionId);
    
    if (!payment) {
      req.flash('error', 'Payment not found');
      return res.redirect('/payments');
    }

    const user = req.session.user;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payment_receipt_${transactionId}.pdf"`);

    const doc = new PDFDocument({ 
      margin: 40, 
      size: "A4",
      bufferPages: true 
    });
    
    doc.pipe(res);

    // Header function
    const addPaymentHeader = () => {
      // Header background
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#2c3e50');
      
      // Logo
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 35, { width: 50, height: 50 });
        }
      } catch (err) {
        console.log('Logo not found, proceeding without logo');
      }
      
      // System name and title
      doc.fontSize(18).font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('FAMILY FUND MANAGEMENT SYSTEM', 120, 40);
      
      doc.fontSize(14)
         .text('Payment Receipt', 120, 65);
      
      // Document title
      doc.fontSize(16)
         .text('PAYMENT RECEIPT', 50, 100);
      
      // Transaction ID and date
      doc.fontSize(10)
         .fillColor('#bdc3c7')
         .text(`Transaction: ${transactionId}`, 400, 100, { align: 'right' })
         .text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 400, 115, { align: 'right' });
      
      doc.moveDown(4);
    };

    // Footer function
    const addPaymentFooter = () => {
      const bottomY = doc.page.height - 50;
      
      // Footer separator line
      doc.moveTo(50, bottomY - 25)
         .lineTo(doc.page.width - 50, bottomY - 25)
         .strokeColor('#3498db')
         .lineWidth(1)
         .stroke();
      
      // Footer content
      doc.fontSize(9)
         .fillColor('#7f8c8d')
         .text(`Family Fund Management System - Official Receipt`, 50, bottomY - 20, { align: 'left' })
         .text(`For inquiries contact: support@familyfund.com`, doc.page.width / 2 - 100, bottomY - 20, { align: 'center' })
         .text(`Page 1 of 1`, doc.page.width - 100, bottomY - 20, { align: 'right' });
    };

    // Status icon and color
    let statusColor, statusIcon, statusText;
    switch (payment.status) {
      case 'Paid':
        statusColor = '#27ae60';
        statusIcon = '✓';
        statusText = 'PAYMENT COMPLETED';
        break;
      case 'Pending':
        statusColor = '#f39c12';
        statusIcon = '⏳';
        statusText = 'PAYMENT PENDING';
        break;
      case 'Failed':
        statusColor = '#e74c3c';
        statusIcon = '✗';
        statusText = 'PAYMENT FAILED';
        break;
      default:
        statusColor = '#95a5a6';
        statusIcon = '?';
        statusText = 'UNKNOWN STATUS';
    }

    addPaymentHeader();

    // Status banner
    doc.rect(50, doc.y, doc.page.width - 100, 40)
       .fill(statusColor);
    
    doc.fontSize(14).font('Helvetica-Bold')
       .fillColor('#ffffff')
       .text(`${statusIcon} ${statusText}`, 50, doc.y + 13, { width: doc.page.width - 100, align: 'center' });
    
    doc.moveDown(3);

    // Payment details table
    const details = [
      { label: 'Transaction ID', value: payment.transaction_id },
      { label: 'Amount', value: `TSh ${Number(payment.amount).toLocaleString()}` },
      { label: 'Phone Number', value: payment.phone_number },
      { label: 'Payment Method', value: 'Azam Lipia' },
      { label: 'Payment Date', value: new Date(payment.created_at).toLocaleString() },
      { label: 'Member Name', value: `${user.first_name || user.username} ${user.sur_name || ''}` },
      { label: 'Member ID', value: user.member_Id || 'N/A' }
    ];

    // Draw details table
    const tableTop = doc.y;
    const rowHeight = 25;
    const labelWidth = 150;
    const valueWidth = doc.page.width - 100 - labelWidth - 50;

    details.forEach((detail, index) => {
      const y = tableTop + (index * rowHeight);
      
      // Label background
      doc.rect(50, y, labelWidth, rowHeight)
         .fill('#ecf0f1');
      
      // Value background
      doc.rect(50 + labelWidth, y, valueWidth, rowHeight)
         .fill(index % 2 === 0 ? '#ffffff' : '#f8f9fa');
      
      // Label text
      doc.fontSize(10).font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text(detail.label, 55, y + 8);
      
      // Value text
      doc.fontSize(10).font('Helvetica')
         .fillColor('#34495e')
         .text(detail.value, 55 + labelWidth, y + 8, { width: valueWidth - 10 });
      
      // Borders
      doc.rect(50, y, labelWidth, rowHeight).strokeColor('#bdc3c7').lineWidth(0.5).stroke();
      doc.rect(50 + labelWidth, y, valueWidth, rowHeight).strokeColor('#bdc3c7').lineWidth(0.5).stroke();
    });

    doc.y = tableTop + (details.length * rowHeight) + 30;

    // Additional information based on status
    if (payment.status === 'Paid') {
      doc.fontSize(11)
         .fillColor('#27ae60')
         .text('✅ Thank you for your payment! This transaction has been successfully processed.', 50, doc.y);
    } else if (payment.status === 'Pending') {
      doc.fontSize(11)
         .fillColor('#f39c12')
         .text('⏳ Your payment is being processed. Please check back later for updates.', 50, doc.y);
    } else if (payment.status === 'Failed') {
      doc.fontSize(11)
         .fillColor('#e74c3c')
         .text('❌ Payment failed. Please try again or contact support for assistance.', 50, doc.y);
    }

    doc.moveDown(2);

    // Instructions section
    doc.fontSize(10).font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text('Important Information:', 50, doc.y);
    
    doc.moveDown(0.3);
    
    const instructions = [
      '• Keep this receipt for your records',
      '• Use the Transaction ID for any inquiries',
      '• Contact support if you have any questions',
      '• Allow 24 hours for payment processing'
    ];

    instructions.forEach(instruction => {
      doc.fontSize(9)
         .fillColor('#7f8c8d')
         .text(instruction, 55, doc.y);
      doc.moveDown(0.5);
    });

    addPaymentFooter();
    doc.end();

  } catch (err) {
    console.error('Error generating payment receipt PDF:', err);
    req.flash('error', 'Failed to generate payment receipt');
    res.redirect(`/payments/status/${req.params.transactionId}`);
  }
});

// ----------------- GET /payments/history/pdf -----------------
router.get('/history/pdf', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const viewType = req.query.view || 'individual';
    const { from, to } = req.query;

    let payments;
    let pageTitle;

    if (viewType === 'all' && (user.role === 'chief_signatory' || user.role === 'assistant_signatory' || user.role === 'chairman')) {
      payments = await paymentModel.getAllPaymentsWithMemberInfo();
      pageTitle = 'All Members Payment History';
    } else {
      payments = await paymentModel.getPaymentsByMember(user.member_Id);
      pageTitle = 'My Payment History';
    }

    // Filter by date range if provided
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999); // End of the day
      
      payments = payments.filter(payment => {
        const paymentDate = new Date(payment.created_at);
        return paymentDate >= fromDate && paymentDate <= toDate;
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    const filename = `payment_history_${viewType}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ 
      margin: 40, 
      size: "A4",
      bufferPages: true 
    });
    
    doc.pipe(res);

    // Header function
    const addHistoryHeader = () => {
      // Header background
      doc.rect(0, 0, doc.page.width, 120)
         .fill('#2c3e50');
      
      // Logo
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 35, { width: 50, height: 50 });
        }
      } catch (err) {
        console.log('Logo not found, proceeding without logo');
      }
      
      // System name and title
      doc.fontSize(18).font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('FAMILY FUND MANAGEMENT SYSTEM', 120, 40);
      
      doc.fontSize(14)
         .text('Payment History Report', 120, 65);
      
      // Document title
      doc.fontSize(16)
         .text(pageTitle.toUpperCase(), 50, 100);
      
      // Date range and generation info
      let dateRangeText = 'All Time';
      if (from && to) {
        dateRangeText = `${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()}`;
      }
      
      doc.fontSize(10)
         .fillColor('#bdc3c7')
         .text(`Period: ${dateRangeText}`, 400, 100, { align: 'right' })
         .text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 400, 115, { align: 'right' });
      
      doc.moveDown(4);
    };

    // Footer function
    const addHistoryFooter = (currentPage, totalPages) => {
      const bottomY = doc.page.height - 50;
      
      // Footer separator line
      doc.moveTo(50, bottomY - 25)
         .lineTo(doc.page.width - 50, bottomY - 25)
         .strokeColor('#3498db')
         .lineWidth(1)
         .stroke();
      
      // Footer content
      doc.fontSize(9)
         .fillColor('#7f8c8d')
         .text(`Family Fund Management System - Confidential Report`, 50, bottomY - 20, { align: 'left' })
         .text(`Generated by: ${user.first_name || user.username} ${user.sur_name || ''}`, doc.page.width / 2 - 100, bottomY - 20, { align: 'center' })
         .text(`Page ${currentPage} of ${totalPages}`, doc.page.width - 100, bottomY - 20, { align: 'right' });
    };

    addHistoryHeader();

    // Summary statistics
    const totalPaid = payments.filter(p => p.status === 'Paid').reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const totalPending = payments.filter(p => p.status === 'Pending').reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const paidCount = payments.filter(p => p.status === 'Paid').length;
    const pendingCount = payments.filter(p => p.status === 'Pending').length;

    // Summary section
    doc.fontSize(11).font('Helvetica-Bold')
       .fillColor('#2c3e50')
       .text('SUMMARY STATISTICS', 50, doc.y);
    
    doc.moveDown(0.5);
    
    const summaryData = [
      { label: 'Total Records', value: payments.length.toString() },
      { label: 'Completed Payments', value: paidCount.toString() },
      { label: 'Pending Payments', value: pendingCount.toString() },
      { label: 'Total Paid Amount', value: `TSh ${totalPaid.toLocaleString()}` },
      { label: 'Total Pending Amount', value: `TSh ${totalPending.toLocaleString()}` }
    ];

    summaryData.forEach((item, index) => {
      const y = doc.y;
      doc.rect(50, y, doc.page.width - 100, 20)
         .fill(index % 2 === 0 ? '#f8f9fa' : '#ffffff');
      
      doc.fontSize(10).font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text(item.label, 55, y + 6);
      
      doc.fontSize(10).font('Helvetica')
         .fillColor('#34495e')
         .text(item.value, doc.page.width - 150, y + 6, { align: 'right' });
      
      doc.rect(50, y, doc.page.width - 100, 20).strokeColor('#e9ecef').lineWidth(0.5).stroke();
      
      doc.y += 20;
    });

    doc.moveDown(1.5);

    // Payments table
    if (payments.length > 0) {
      doc.fontSize(12).font('Helvetica-Bold')
         .fillColor('#2c3e50')
         .text('PAYMENT DETAILS', 50, doc.y);
      
      doc.moveDown(0.5);

      // Define columns based on view type
      const columns = [
        { label: '#', width: 25, align: 'center' },
        { label: 'Date', width: 70, align: 'left' },
        { label: 'Transaction ID', width: 90, align: 'left' },
        { label: 'Amount', width: 80, align: 'right' },
        { label: 'Phone', width: 80, align: 'left' },
        { label: 'Status', width: 60, align: 'center' },
        { label: 'Method', width: 70, align: 'left' }
      ];

      if (viewType === 'all') {
        columns.splice(2, 0, { label: 'Member', width: 100, align: 'left' });
      }

      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      const startX = (doc.page.width - totalWidth) / 2;
      let y = doc.y + 10;
      let currentPage = 1;

      // Draw table header
      doc.fontSize(9).font('Helvetica-Bold');
      let x = startX;
      columns.forEach(col => {
        doc.rect(x, y, col.width, 20)
           .fill('#34495e');
        doc.fillColor('#ffffff')
           .text(col.label, x + 5, y + 7, { width: col.width - 10, align: col.align });
        doc.rect(x, y, col.width, 20)
           .strokeColor('#2c3e50')
           .lineWidth(1)
           .stroke();
        x += col.width;
      });

      y += 20;

      // Draw table rows
      doc.fontSize(8).font('Helvetica');
      
      payments.forEach((payment, index) => {
        // Check for page break
        if (y > doc.page.height - 100) {
          addHistoryFooter(currentPage, Math.ceil(payments.length / 15));
          doc.addPage();
          currentPage++;
          addHistoryHeader();
          y = doc.y + 10;
          
          // Redraw headers
          x = startX;
          doc.fontSize(9).font('Helvetica-Bold');
          columns.forEach(col => {
            doc.rect(x, y, col.width, 20)
               .fill('#34495e');
            doc.fillColor('#ffffff')
               .text(col.label, x + 5, y + 7, { width: col.width - 10, align: col.align });
            doc.rect(x, y, col.width, 20)
               .strokeColor('#2c3e50')
               .lineWidth(1)
               .stroke();
            x += col.width;
          });
          y += 20;
          doc.fontSize(8).font('Helvetica');
        }

        // Prepare row data
        const rowData = {
          number: (index + 1).toString(),
          date: new Date(payment.created_at).toLocaleDateString('en-GB'),
          transactionId: payment.transaction_id,
          amount: `TSh ${Number(payment.amount).toLocaleString()}`,
          phone: payment.phone_number,
          status: payment.status,
          method: 'Azam Lipia',
          member: viewType === 'all' ? `${payment.first_name} ${payment.sur_name}`.substring(0, 20) : ''
        };

        // Alternate row background
        if (index % 2 === 0) {
          x = startX;
          columns.forEach(col => {
            doc.rect(x, y, col.width, 18)
               .fill('#f8f9fa');
            x += col.width;
          });
        }

        // Draw row cells
        x = startX;
        columns.forEach(col => {
          let value;
          let textColor = '#000000';
          
          switch (col.label) {
            case '#':
              value = rowData.number;
              break;
            case 'Date':
              value = rowData.date;
              break;
            case 'Member':
              value = rowData.member;
              break;
            case 'Transaction ID':
              value = rowData.transactionId;
              break;
            case 'Amount':
              value = rowData.amount;
              textColor = '#27ae60';
              break;
            case 'Phone':
              value = rowData.phone;
              break;
            case 'Status':
              value = rowData.status;
              // Color code status
              if (rowData.status === 'Paid') textColor = '#27ae60';
              else if (rowData.status === 'Pending') textColor = '#f39c12';
              else textColor = '#e74c3c';
              break;
            case 'Method':
              value = rowData.method;
              break;
            default:
              value = '';
          }

          doc.fillColor(textColor)
             .text(value || '', x + 5, y + 5, { width: col.width - 10, align: col.align });
          
          doc.rect(x, y, col.width, 18).strokeColor('#e9ecef').lineWidth(0.5).stroke();
          x += col.width;
        });

        y += 18;
      });

      doc.y = y + 20;
    } else {
      doc.fontSize(12)
         .fillColor('#666666')
         .text('No payment records found for the selected criteria.', 50, doc.y, { align: 'center' });
    }

    // Add final footer
    const totalPages = Math.ceil(payments.length / 15) || 1;
    addHistoryFooter(totalPages, totalPages);
    
    doc.end();

  } catch (err) {
    console.error('Error generating payment history PDF:', err);
    req.flash('error', 'Failed to generate payment history PDF');
    res.redirect('/payments/history');
  }
});



// ----------------- Payment Links Management Routes -----------------

// GET /payments/admin/links - Get all payment links (UI page) - INCLUDES INACTIVE
router.get('/admin/links', requireAuth, requireRole(['chairman', 'chief_signatory', 'assistant_signatory']), async (req, res) => {
  try {
    // Use getAllPaymentLinks(false) to get ALL links including inactive
    const paymentLinks = await paymentModel.getAllPaymentLinks(false);
    
    res.render('payment/payment-links-admin', {
      user: req.session.user,
      paymentLinks: paymentLinks,
      flash: req.flash()
    });
  } catch (err) {
    console.error('Error loading payment links admin page:', err);
    req.flash('error', 'Failed to load payment links management');
    res.redirect('/payments');
  }
});


module.exports = router;


