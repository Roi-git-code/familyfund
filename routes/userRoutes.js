
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');
const userLandingModel = require('../models/userLandingModel');
const memberModel = require('../models/memberModel');
const fundRequestModel = require('../models/fundRequestModel');
const notificationModel = require('../models/notificationModel');
const userRequestModel = require('../models/userRequestModel');
const supportModel = require('../models/supportModel');
const loanModel = require('../models/loanModel');

// Dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const { username, role, member_Id } = req.session.user;

    // Get member profile
    const member = await userLandingModel.getMemberProfileByEmail(username);
    if (!member) {
      req.flash('error', 'No profile found for your account.');
      return res.redirect('/');
    }

    // Fetch notifications
    const notifications = await notificationModel.getNotificationsForMember(member.id, true);

    // Optional date range filter for contributions
    const from = req.query.from || '';
    const to = req.query.to || '';

    let contributions = await userLandingModel.getMemberContributions(member.id);
    if (from || to) {
      contributions = contributions.filter(c => {
        const yearMonth = c.year + '-' + (c.month || '01');
        let afterFrom = true, beforeTo = true;
        if (from) afterFrom = yearMonth >= from;
        if (to) beforeTo = yearMonth <= to;
        return afterFrom && beforeTo;
      });
    }

    // Get member-specific requests
    const memberProfileRequests = await userLandingModel.getMemberUpdateRequests(member.id);
    const memberFundRequests = await fundRequestModel.getFundRequestsByMember(member.id);

    // Lifetime totals
    const { memberTotal, allTotal, percentage } = await userLandingModel.getLifetimeTotals(member.id);

    // Contribution relative color
    const relativeToMax = await (async () => {
      const summary = await require('../models/contributionModel').getContributionSummary();
      const memberData = summary.members.find(m => m.member_id === member.id);
      return memberData ? memberData.color : 'red';
    })();

    // Get system-wide fund request counts for authorized roles
    let newCount = 0;
    let reviewedCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;

    if (['chairman', 'chief_signatory', 'assistant_signatory'].includes(role)) {
      const counts = await fundRequestModel.getDashboardCountsByRole(role);
      newCount = counts.new_count;
      reviewedCount = counts.under_review_count;
      approvedCount = counts.approved_count + counts.completed_count;
      rejectedCount = counts.rejected_count + counts.cancelled_count;
    }

    // Get support statistics for authorized roles
    let supportStats = {
      total_messages: 0,
      new_messages: 0,
      in_progress_messages: 0,
      resolved_messages: 0,
      closed_messages: 0,
      critical_messages: 0,
      high_messages: 0,
      last_7_days: 0
    };

    if (['chairman', 'chief_signatory', 'assistant_signatory', 'admin'].includes(role)) {
      try {
        supportStats = await supportModel.getSupportStatistics();
      } catch (error) {
        console.error('Error loading support statistics:', error);
      }
    }

    const memberPendingProfileRequests = memberProfileRequests.filter(req =>
      req.status === 'Pending' || req.status === 'In Progress'
    ).length;

    const memberPendingFundRequests = memberFundRequests.filter(req =>
      req.status === 'Pending' || req.status === 'Under Review'
    ).length;

    const totalPendingRequests = memberPendingProfileRequests + memberPendingFundRequests;

    res.render('userLanding', {
      user: req.session.user,
      member,
      contributions,
      memberTotal,
      allTotal,
      percentage,
      userColor: relativeToMax,
      updateRequestsCount: memberProfileRequests.length,
      fundRequestsCount: memberFundRequests.length,
      notifications,
      from,
      to,
      newCount,
      reviewedCount,
      approvedCount,
      rejectedCount,
      memberProfileRequests,
      memberFundRequests,
      totalPendingRequests,
      supportStats
    });

  } catch (err) {
    console.error('Landing page error:', err);
    req.flash('error', 'Unable to load your dashboard.');
    res.redirect('/');
  }
});

// GET Member Details for Modal (User's own profile - Secure)
router.get('/my-profile/details', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const member = await memberModel.getMemberWithKins(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member profile not found' });
    }
    res.json(member);
  } catch (err) {
    console.error('Get member details error:', err);
    res.status(500).json({ error: 'Failed to get profile details' });
  }
});

// GET update profile form (auto-fill user details)
router.get('/update-profile', requireAuth, async (req, res) => {
  try {
    const member = await memberModel.getMemberById(req.session.user.member_Id);
    res.render('update_profile', {
      user: req.session.user, member, flash: req.flash()
    });
  } catch (err) {
    console.error('Error loading update profile:', err);
    req.flash('error', 'Unable to load update profile form.');
    res.redirect('/dashboard');
  }
});

// Configure multer for disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

router.post('/update-profile', requireAuth, upload.fields([
  { name: 'dob_proof', maxCount: 1 },
  { name: 'children_proof', maxCount: 1 },
  { name: 'father_proof', maxCount: 1 },
  { name: 'mother_proof', maxCount: 1 }
]), async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const { date_of_birth, address, marital_status, number_of_children, father_alive, mother_alive } = req.body;
    const files = req.files;

    const updatedFields = {};
    const errors = [];

    if (date_of_birth) {
      const dob = new Date(date_of_birth);
      if (isNaN(dob.getTime())) {
        errors.push('Invalid date format for date of birth');
      } else {
        updatedFields.date_of_birth = dob;
      }
    }

    if (address) {
      if (address.length > 200) {
        errors.push('Address exceeds maximum length (200 characters)');
      } else {
        updatedFields.address = address;
      }
    }

    const validMaritalStatuses = ['single', 'married', 'divorced', 'widowed'];
    if (marital_status) {
      if (!validMaritalStatuses.includes(marital_status.toLowerCase())) {
        errors.push('Invalid marital status');
      } else {
        updatedFields.marital_status = marital_status.toLowerCase();
      }
    }

    if (number_of_children !== undefined && number_of_children !== '') {
      const num = parseInt(number_of_children);
      if (isNaN(num) || num < 0 || num > 20) {
        errors.push('Number of children must be between 0 and 20');
      } else {
        updatedFields.number_of_children = num;
      }
    }

    updatedFields.father_alive = father_alive === 'on';
    updatedFields.mother_alive = mother_alive === 'on';

    const attachments = {};
    if (files) {
      if (files.dob_proof) attachments.dob_proof = `/uploads/${files.dob_proof[0].filename}`;
      if (files.children_proof) attachments.children_proof = `/uploads/${files.children_proof[0].filename}`;
      if (files.father_proof) attachments.father_proof = `/uploads/${files.father_proof[0].filename}`;
      if (files.mother_proof) attachments.mother_proof = `/uploads/${files.mother_proof[0].filename}`;
    }

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const request = await userRequestModel.createUserRequest(memberId, updatedFields, attachments);
    res.status(201).json({
      success: true,
      message: 'Profile update request submitted for approval',
      requestId: request._id,
      attachments
    });

  } catch (error) {
    console.error('Profile update error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Duplicate request detected' });
    }
    if (error instanceof multer.MulterError) {
      return res.status(413).json({ error: 'File too large (max 5MB)' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all user requests - chairman only
router.get('/user-requests', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
  try {
    const requests = await userRequestModel.getAllUserRequests();
    const pendingRequestsCount = await userRequestModel.countPendingRequests();
    res.render('user_requests', {
      user: req.session.user,
      requests,
      pendingRequestsCount
    });
  } catch (err) {
    console.error('Error loading user requests:', err);
    req.flash('error', 'Unable to load user requests.');
    res.redirect('/dashboard');
  }
});

// POST update user request status (approve/reject)
router.post('/user-requests/update-status', requireAuth, requireRole('chairman'), async (req, res) => {
  try {
    const { requestId, action, reason } = req.body;
    const officerId = req.session.user.member_Id;

    const request = await userRequestModel.getUserRequestById(requestId);
    if (!request) {
      req.flash('error', 'Request not found.');
      return res.redirect('/user-requests');
    }

    if (action === 'approve') {
      await userRequestModel.updateMemberInfo(request.member_id, request.updated_fields);
      await userRequestModel.updateUserRequestStatus(requestId, 'Approved', null, officerId);
      await userRequestModel.createNotification(request.member_id, 'Your profile update request was approved.');
    } else if (action === 'reject') {
      if (!reason || reason.trim() === '') {
        req.flash('error', 'Reason for rejection is required.');
        return res.redirect('/user-requests');
      }
      await userRequestModel.updateUserRequestStatus(requestId, 'Rejected', reason, officerId);
      await userRequestModel.createNotification(request.member_id, `Your profile update request was rejected. Reason: ${reason}`);
    }

    req.flash('success', 'Request status updated.');
    res.redirect('/user-requests');
  } catch (err) {
    console.error('Error updating request status:', err);
    req.flash('error', 'Failed to update request status.');
    res.redirect('/user-requests');
  }
});

// New route for viewing update requests
router.get('/update-requests', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const updateRequests = await userLandingModel.getMemberUpdateRequests(memberId);
    const fundRequests = await fundRequestModel.getFundRequestsByMember(memberId);
    res.render('user_update_requests', {
      user: req.session.user,
      updateRequests,
      fundRequests
    });
  } catch (err) {
    console.error('Error loading update requests:', err);
    req.flash('error', 'Unable to load update requests.');
    res.redirect('/dashboard');
  }
});

// Resubmit route
router.post('/update-requests/resubmit/:id', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.id;
    const memberId = req.session.user.member_Id;

    const originalRequest = await userRequestModel.getUserRequestById(requestId);
    if (!originalRequest || originalRequest.member_id !== memberId) {
      req.flash('error', 'Request not found or not authorized');
      return res.redirect('/update-requests');
    }

    await userRequestModel.createUserRequest(memberId, originalRequest.updated_fields, originalRequest.attachments);
    req.flash('success', 'Request resubmitted successfully');
    res.redirect('/update-requests');
  } catch (err) {
    console.error('Error resubmitting request:', err);
    req.flash('error', 'Failed to resubmit request');
    res.redirect('/update-requests');
  }
});

// POST submit fund request
router.post('/submit-fund-request', requireAuth,
  upload.array('supportingDoc', 5), async (req, res) => {
    try {
      const memberId = req.session.user.member_Id;
      const { requestType, amount, bankAccount, bankName, additionalInfo } = req.body;
      const files = req.files;

      const errors = [];
      if (!requestType) errors.push('Request type is required');
      if (!amount) errors.push('Amount is required');
      if (!bankAccount) errors.push('Bank account number is required');
      if (!bankName) errors.push('Bank name is required');

      if (errors.length > 0) {
        req.flash('error', errors.join(', '));
        return res.redirect('/update-profile');
      }

      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        req.flash('error', 'Amount must be a positive number');
        return res.redirect('/update-profile');
      }

      const attachments = files ? files.map(f => `/uploads/${f.filename}`) : [];

      await fundRequestModel.createFundRequest(
        memberId, requestType, numericAmount, bankAccount, bankName, additionalInfo, attachments
      );

      req.flash('success', 'Fund request submitted successfully!');
      res.redirect('/update-requests');

    } catch (err) {
      console.error('Error submitting fund request:', err);
      if (err instanceof multer.MulterError) {
        req.flash('error', 'File too large or invalid upload (max 5 files, 5MB each)');
      } else {
        req.flash('error', 'Failed to submit fund request');
      }
      res.redirect('/update-profile');
    }
  }
);

// Download a User Profile Update Request as a PDF (admin reviewers)
router.get('/user-requests/download/:id', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
  try {
    const requestId = req.params.id;
    const request = await userRequestModel.getUserRequestWithOfficer(requestId);
    if (!request) {
      req.flash('error', 'Request not found.');
      return res.redirect('/user-requests');
    }

    const member = await memberModel.getMemberById(request.member_id);
    const memberFullName = member ? `${member.first_name} ${member.middle_name} ${member.sur_name}` : 'Unknown Member';
    const reviewedDate = request.reviewed_at || request.updated_at || null;
    const officerRole = request.officer_role || '—';
    const officerName = request.officer_name || '—';

    const filename = `UpdateRequest_${request.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 50 });
    }
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);
    doc.fontSize(16).text('Profile Update Request - Review Document', { underline: true });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown(1);

    doc.fontSize(12);
    doc.text(`Request ID: ${request.id}`);
    doc.text(`Member: ${memberFullName}`);
    doc.text(`Submitted: ${new Date(request.created_at).toLocaleString()}`);
    doc.text(`Status: ${request.status}`);
    if (request.status === 'Rejected' && request.reason) {
      doc.fillColor('red').text(`Rejection Reason: ${request.reason}`);
      doc.fillColor('black');
    }
    doc.text(`Reviewed Date: ${reviewedDate ? new Date(reviewedDate).toLocaleString() : '—'}`);
    doc.text(`Officer Attended: ${officerRole} – ${officerName}`).moveDown(1);

    doc.fontSize(13).text('Requested Changes', { underline: true }).moveDown(0.5);
    const fields = request.updated_fields && typeof request.updated_fields === 'object'
      ? Object.entries(request.updated_fields)
      : [];

    if (fields.length === 0) {
      doc.fontSize(11).text('No fields recorded.', { italics: true }).moveDown(1);
    } else {
      doc.fontSize(11);
      fields.forEach(([field, value]) => {
        const currentValue = request.old_values?.[field] ?? 'N/A';
        doc.text(`• ${field.replace(/_/g, ' ').toUpperCase()}`);
        doc.text(`   Current: ${currentValue}`);
        doc.text(`   Requested: ${value}`).moveDown(0.5);
      });
      doc.moveDown(0.5);
    }

    if (String(request.status).toLowerCase() === 'rejected' && request.reject_reason) {
      doc.moveDown(0.5).fontSize(13).text('Reason for Rejection', { underline: true }).moveDown(0.3);
      doc.fontSize(11).text(request.reject_reason).moveDown(1);
    }

    doc.moveDown(1.5);
    const sigY = doc.y;
    doc.text('Officer Signature: __________________________', 50, sigY);
    doc.text('Date: __________________', 350, sigY);
    doc.end();
  } catch (err) {
    console.error('Error generating update-request PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/user-requests');
  }
});

// Profile Update Request details
router.get('/requests/profile/:id/details', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const request = await userRequestModel.getUserRequestWithOfficer(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(request);
  } catch (err) {
    console.error('Error fetching profile request details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Download PDF of My Contributions with optional time range
router.get('/user/contributions/pdf', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const from = req.query.from;
    const to = req.query.to;

    let contributions = await userLandingModel.getMemberContributions(memberId);
    if (from || to) {
      const fromDate = from ? new Date(from + '-01') : null;
      const toDate = to ? new Date(to + '-01') : null;
      contributions = contributions.filter(c => {
        const yearMonth = new Date(`${c.year}-01`);
        if (fromDate && yearMonth < fromDate) return false;
        if (toDate && yearMonth > toDate) return false;
        return true;
      });
    }

    const rows = contributions.map(c => [
      c.year,
      Number(c.jan) || 0, Number(c.feb) || 0, Number(c.mar) || 0, Number(c.apr) || 0,
      Number(c.may) || 0, Number(c.jun) || 0, Number(c.jul) || 0, Number(c.aug) || 0,
      Number(c.sep) || 0, Number(c.oct) || 0, Number(c.nov) || 0, Number(c.dec) || 0,
      (Number(c.total_year) || 0).toFixed(2)
    ]);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', bufferPages: true, margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="MyContributions.pdf"');
    doc.pipe(res);

    const logoPath = path.join(__dirname, '../public/images/logo.png');
    const systemName = "Family Fund Management System";
    const pageWidth = doc.page.width;
    let headerY = 30;
    try {
      const logoWidth = 60;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.image(logoPath, logoX, headerY, { width: logoWidth });
      headerY += 65;
    } catch (err) { console.warn("Logo not found, skipping logo render."); }
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text(systemName, 0, headerY, { align: 'center' });
    headerY += 25;

    let reportTitle = "My Contributions";
    if (from && to) reportTitle += ` From ${from.replace("-", "/")} To ${to.replace("-", "/")}`;
    else if (from) reportTitle += ` From ${from.replace("-", "/")}`;
    else if (to) reportTitle += ` Up To ${to.replace("-", "/")}`;
    else reportTitle += " (All Time)";

    doc.font('Helvetica-Bold').fontSize(16).text(reportTitle, 0, headerY, { align: 'center', underline: true });
    doc.moveDown(2);

    const headers = ['Year', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total'];
    function addContributionTable(doc, headers, rows) {
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const yearW = 45, totalW = 70, months = 12, monthW = Math.floor((pageWidth - (yearW + totalW)) / months);
      const colWidths = [yearW, ...Array(months).fill(monthW), totalW];
      function drawTableHeader(doc, headers, colWidths, startX, y, rowHeight) {
        doc.font('Helvetica-Bold').fontSize(10);
        for (let i = 0; i < headers.length; i++) {
          const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke('#2980b9', 'black');
          doc.fillColor('white').text(headers[i], x + 3, y + 6, { width: colWidths[i] - 6, align: 'center' });
        }
        doc.font('Helvetica').fontSize(10);
      }
      function renderTable(doc, headers, rows, colWidths, rowHeight = 18) {
        const startX = doc.page.margins.left;
        const footerReserve = 40;
        const bottomY = doc.page.height - doc.page.margins.bottom - footerReserve;
        let y = doc.y;
        drawTableHeader(doc, headers, colWidths, startX, y, rowHeight);
        y += rowHeight;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r].map(v => (v == null ? '' : String(v)));
          const cellHeights = row.map((cell, i) => doc.heightOfString(cell, { width: colWidths[i] - 6 }));
          const maxHeight = Math.max(rowHeight, ...cellHeights);
          if (y + maxHeight > bottomY) {
            doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 50, bottom: 50, left: 50, right: 20 } });
            doc.font('Helvetica').fontSize(10);
            y = doc.page.margins.top;
            drawTableHeader(doc, headers, colWidths, startX, y, rowHeight);
            y += rowHeight;
          }
          const bg = r % 2 === 0 ? '#f9f9f9' : '#ffffff';
          for (let i = 0; i < row.length; i++) {
            const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
            doc.rect(x, y, colWidths[i], maxHeight).fillAndStroke(bg, 'black');
            doc.fillColor('black');
            if (i === 0) doc.text(row[i], x + 4, y + 6, { width: colWidths[i] - 8, align: 'left' });
            else doc.text(row[i], x + 3, y + 6, { width: colWidths[i] - 6, align: 'center', ellipsis: true });
          }
          y += maxHeight;
        }
        doc.y = y;
      }
      renderTable(doc, headers, rows, colWidths, 18);
    }
    addContributionTable(doc, headers, rows);

    function addFooter(doc, username) {
      const range = doc.bufferedPageRange();
      const generatedOn = new Date().toLocaleString();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 30;
        const margin = doc.page.margins.left;
        const pageWidth = doc.page.width;
        const usableWidth = pageWidth - margin * 2;
        const leftX = margin;
        const centerX = margin + usableWidth / 2;
        const rightX = margin + usableWidth;
        doc.fontSize(9).fillColor('gray');
        doc.text(`Generated: ${generatedOn}`, leftX, bottom, { lineBreak: false });
        const uname = username || "User";
        const unameWidth = doc.widthOfString(uname);
        doc.text(uname, centerX - unameWidth / 2, bottom, { lineBreak: false });
        const pageLabel = `Page ${i + 1} of ${range.count}`;
        const pageLabelWidth = doc.widthOfString(pageLabel);
        doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
      }
    }
    addFooter(doc, req.session.user.username);
    doc.end();
  } catch (err) {
    console.error('Error generating My Contributions PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/dashboard');
  }
});

// My Contributions page
router.get('/my-contributions', requireAuth, async (req, res) => {
  try {
    const { username } = req.session.user;
    const member = await userLandingModel.getMemberProfileByEmail(username);
    if (!member) {
      req.flash('error', 'No profile found for your account.');
      return res.redirect('/dashboard');
    }
    const from = req.query.from || '';
    const to = req.query.to || '';
    let contributions = await userLandingModel.getMemberContributions(member.id);
    if (from || to) {
      contributions = contributions.filter(c => {
        const yearMonth = c.year + '-01';
        let afterFrom = true, beforeTo = true;
        if (from) afterFrom = yearMonth >= from + '-01';
        if (to) beforeTo = yearMonth <= to + '-01';
        return afterFrom && beforeTo;
      });
    }
    const { memberTotal, allTotal, percentage } = await userLandingModel.getLifetimeTotals(member.id);
    const relativeToMax = await (async () => {
      const summary = await require('../models/contributionModel').getContributionSummary();
      const memberData = summary.members.find(m => m.member_id === member.id);
      return memberData ? memberData.color : 'red';
    })();
    res.render('myContributions', {
      user: req.session.user,
      member,
      contributions,
      memberTotal,
      allTotal,
      percentage,
      userColor: relativeToMax,
      from,
      to
    });
  } catch (err) {
    console.error('My Contributions page error:', err);
    req.flash('error', 'Unable to load your contributions.');
    res.redirect('/dashboard');
  }
});

// Download PDF for My Contributions page
router.get('/my-contributions/pdf', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const from = req.query.from;
    const to = req.query.to;
    let contributions = await userLandingModel.getMemberContributions(memberId);
    if (from || to) {
      const fromDate = from ? new Date(from + '-01') : null;
      const toDate = to ? new Date(to + '-01') : null;
      contributions = contributions.filter(c => {
        const yearMonth = new Date(`${c.year}-01`);
        if (fromDate && yearMonth < fromDate) return false;
        if (toDate && yearMonth > toDate) return false;
        return true;
      });
    }
    const rows = contributions.map(c => [
      c.year,
      Number(c.jan) || 0, Number(c.feb) || 0, Number(c.mar) || 0, Number(c.apr) || 0,
      Number(c.may) || 0, Number(c.jun) || 0, Number(c.jul) || 0, Number(c.aug) || 0,
      Number(c.sep) || 0, Number(c.oct) || 0, Number(c.nov) || 0, Number(c.dec) || 0,
      (Number(c.total_year) || 0).toFixed(2)
    ]);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', bufferPages: true, margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="MyContributions.pdf"');
    doc.pipe(res);
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    const systemName = "Family Fund Management System";
    const pageWidth = doc.page.width;
    let headerY = 30;
    try {
      const logoWidth = 60;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.image(logoPath, logoX, headerY, { width: logoWidth });
      headerY += 65;
    } catch (err) { console.warn("Logo not found, skipping logo render."); }
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#000000').text(systemName, 0, headerY, { align: 'center' });
    headerY += 25;
    let reportTitle = "My Contributions";
    if (from && to) reportTitle += ` From ${from.replace("-", "/")} To ${to.replace("-", "/")}`;
    else if (from) reportTitle += ` From ${from.replace("-", "/")}`;
    else if (to) reportTitle += ` Up To ${to.replace("-", "/")}`;
    else reportTitle += " (All Time)";
    doc.font('Helvetica-Bold').fontSize(16).text(reportTitle, 0, headerY, { align: 'center', underline: true });
    doc.moveDown(2);
    const headers = ['Year', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Total'];
    function addContributionTable(doc, headers, rows) {
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const yearW = 45, totalW = 70, months = 12, monthW = Math.floor((pageWidth - (yearW + totalW)) / months);
      const colWidths = [yearW, ...Array(months).fill(monthW), totalW];
      function drawTableHeader(doc, headers, colWidths, startX, y, rowHeight) {
        doc.font('Helvetica-Bold').fontSize(10);
        for (let i = 0; i < headers.length; i++) {
          const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke('#2980b9', 'black');
          doc.fillColor('white').text(headers[i], x + 3, y + 6, { width: colWidths[i] - 6, align: 'center' });
        }
        doc.font('Helvetica').fontSize(10);
      }
      function renderTable(doc, headers, rows, colWidths, rowHeight = 18) {
        const startX = doc.page.margins.left;
        const footerReserve = 40;
        const bottomY = doc.page.height - doc.page.margins.bottom - footerReserve;
        let y = doc.y;
        drawTableHeader(doc, headers, colWidths, startX, y, rowHeight);
        y += rowHeight;
        for (let r = 0; r < rows.length; r++) {
          const row = rows[r].map(v => (v == null ? '' : String(v)));
          const cellHeights = row.map((cell, i) => doc.heightOfString(cell, { width: colWidths[i] - 6 }));
          const maxHeight = Math.max(rowHeight, ...cellHeights);
          if (y + maxHeight > bottomY) {
            doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 50, bottom: 50, left: 50, right: 20 } });
            doc.font('Helvetica').fontSize(10);
            y = doc.page.margins.top;
            drawTableHeader(doc, headers, colWidths, startX, y, rowHeight);
            y += rowHeight;
          }
          const bg = r % 2 === 0 ? '#f9f9f9' : '#ffffff';
          for (let i = 0; i < row.length; i++) {
            const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
            doc.rect(x, y, colWidths[i], maxHeight).fillAndStroke(bg, 'black');
            doc.fillColor('black');
            if (i === 0) doc.text(row[i], x + 4, y + 6, { width: colWidths[i] - 8, align: 'left' });
            else doc.text(row[i], x + 3, y + 6, { width: colWidths[i] - 6, align: 'center', ellipsis: true });
          }
          y += maxHeight;
        }
        doc.y = y;
      }
      renderTable(doc, headers, rows, colWidths, 18);
    }
    addContributionTable(doc, headers, rows);
    function addFooter(doc, username) {
      const range = doc.bufferedPageRange();
      const generatedOn = new Date().toLocaleString();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 30;
        const margin = doc.page.margins.left;
        const pageWidth = doc.page.width;
        const usableWidth = pageWidth - margin * 2;
        const leftX = margin;
        const centerX = margin + usableWidth / 2;
        const rightX = margin + usableWidth;
        doc.fontSize(9).fillColor('gray');
        doc.text(`Generated: ${generatedOn}`, leftX, bottom, { lineBreak: false });
        const uname = username || "User";
        const unameWidth = doc.widthOfString(uname);
        doc.text(uname, centerX - unameWidth / 2, bottom, { lineBreak: false });
        const pageLabel = `Page ${i + 1} of ${range.count}`;
        const pageLabelWidth = doc.widthOfString(pageLabel);
        doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
      }
    }
    addFooter(doc, req.session.user.username);
    doc.end();
  } catch (err) {
    console.error('Error generating My Contributions PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/my-contributions');
  }
});

// Constitution page
router.get('/constitution', async (req, res) => {
  try {
    res.render('constitution', { user: req.session.user });
  } catch (err) {
    console.error('Error loading constitution:', err);
    req.flash('error', 'Unable to load constitution.');
    res.redirect('/dashboard');
  }
});

// ==================== LOAN ROUTES ====================

// GET loan application form
router.get('/loan-application', requireAuth, async (req, res) => {
  try {
    res.render('loan_application', {
      user: req.session.user,
      flash: req.flash()
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error loading loan application form:`, err);
    req.flash('error', 'Unable to load loan application form');
    res.redirect('/dashboard');
  }
});

// POST loan application
router.post('/loan-application', requireAuth, upload.array('supportingDoc', 5), async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const { loan_type, amount, tenure_months, purpose, bankAccount, bankName, additionalInfo } = req.body;
    const files = req.files;

    if (!loan_type || !amount || !tenure_months || !purpose || !bankAccount || !bankName) {
      req.flash('error', 'All required fields must be filled');
      return res.redirect('/loan-application');
    }

    const numericAmount = parseFloat(amount);
    const numericTenure = parseInt(tenure_months);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      req.flash('error', 'Amount must be a positive number');
      return res.redirect('/loan-application');
    }
    if (isNaN(numericTenure) || numericTenure <= 0) {
      req.flash('error', 'Tenure must be a positive number');
      return res.redirect('/loan-application');
    }

    const attachments = files ? files.map(f => `/uploads/${f.filename}`) : [];

    await loanModel.createLoan(memberId, {
      loan_type,
      amount: numericAmount,
      tenure_months: numericTenure,
      purpose,
      bank_account: bankAccount,
      bank_name: bankName,
      additional_info: additionalInfo,
      attachments
    });

    req.flash('success', 'Loan application submitted successfully!');
    res.redirect('/my-loans');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error submitting loan application:`, err);
    if (err.code === '22P02') {
      req.flash('error', 'There was an issue with the uploaded files. Please try again with valid documents.');
    } else if (err.message.includes('Maximum amount')) {
      req.flash('error', err.message);
    } else if (err.message.includes('Maximum tenure')) {
      req.flash('error', err.message);
    } else if (err.message.includes('Invalid loan type')) {
      req.flash('error', err.message);
    } else {
      req.flash('error', 'Failed to submit loan application. Please try again.');
    }
    res.redirect('/loan-application');
  }
});

// My Loans List
router.get('/my-loans', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.member_Id;
    const loans = await loanModel.getLoansByMember(memberId);
    res.render('my_loans', {
      user: req.session.user,
      loans,
      flash: req.flash()
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error loading my loans:`, err);
    req.flash('error', 'Unable to load your loans');
    res.redirect('/dashboard');
  }
});

// 🔽 SPECIFIC LOAN ROUTES – must come before /loans/:id 🔽

// GET loan repayment form (chief_signatory & assistant_signatory only)
router.get('/loans/repayment', requireAuth, allowRoles('chief_signatory', 'assistant_signatory'), async (req, res) => {
  console.log(`[${new Date().toISOString()}] [LOAN REPAYMENT] Access by ${req.session.user.username} (${req.session.user.role})`);
  try {
    const loans = await loanModel.getLoansForRepayment();
    console.log(`[${new Date().toISOString()}] [LOAN REPAYMENT] Found ${loans.length} loans for repayment`);
    res.render('loan_repayment', {
      user: req.session.user,
      loans,
      flash: req.flash()
    });
  } catch (err) {
    console.error('Error loading loan repayment form:', err);
    req.flash('error', 'Unable to load repayment form');
    res.redirect('/dashboard');
  }
});

// POST process repayment
router.post('/loans/repayment', requireAuth, allowRoles('chief_signatory', 'assistant_signatory'), async (req, res) => {
  console.log(`[${new Date().toISOString()}] [LOAN REPAYMENT] POST request from ${req.session.user.username}`);
  try {
    const { loanId, amount, notes } = req.body;
    if (!loanId || !amount) {
      req.flash('error', 'Loan ID and amount are required');
      return res.redirect('/loans/repayment');
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      req.flash('error', 'Amount must be a positive number');
      return res.redirect('/loans/repayment');
    }

    const loan = await loanModel.getLoanById(loanId);
    if (!loan) {
      req.flash('error', 'Loan not found');
      return res.redirect('/loans/repayment');
    }

    if (loan.status !== 'Approved') {
      req.flash('error', 'Only approved loans can be repaid');
      return res.redirect('/loans/repayment');
    }

    const remainingBalance = loan.total_repayable - loan.paid_amount;
    if (amountNum > remainingBalance) {
      req.flash('error', `Payment amount cannot exceed the remaining balance of TSh ${remainingBalance.toLocaleString()}`);
      return res.redirect('/loans/repayment');
    }

    const transactionId = `REP-${Date.now()}`;
    await loanModel.recordRepaymentMultiple(loanId, amountNum, transactionId, notes);

    const notificationMessage = `Your loan #${loan.id} repayment of TSh ${amountNum.toLocaleString()} has been received.`;
    await require('../models/notificationModel').createNotification(loan.member_id, notificationMessage);

    req.flash('success', `Repayment of TSh ${amountNum.toLocaleString()} recorded successfully for loan #${loan.id}`);
    res.redirect('/loans/repayment');
  } catch (err) {
    console.error('Error processing loan repayment:', err);
    req.flash('error', 'Failed to process repayment');
    res.redirect('/loans/repayment');
  }
});

/*
// Sign (vote) on a loan
router.post('/loans/sign', requireAuth, allowRoles('assistant_signatory', 'chief_signatory', 'chairman'), async (req, res) => {
  try {
    const { loanId, voteType } = req.body;
    const officerId = req.session.user.member_Id;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid signature type' });
    }

    const loan = await loanModel.getLoanById(loanId);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    if (loan.status !== 'Pending' && loan.status !== 'Under Review') {
      return res.status(400).json({ error: 'Cannot sign a loan that is not pending or under review' });
    }

    await loanModel.createVote(loanId, officerId, voteType);
    const votingSummary = await loanModel.getVotingSummary(loanId);
    const signatures = await loanModel.getVotesByLoan(loanId);

    res.json({
      success: true,
      message: 'Signature recorded successfully',
      votingSummary,
      signatures
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error recording loan signature:`, err);
    res.status(500).json({ error: 'Failed to record signature' });
  }
});
*/

// Sign (vote) on a loan
router.post('/loans/sign', requireAuth, allowRoles('assistant_signatory', 'chief_signatory', 'chairman'), async (req, res) => {
  try {
    const { loanId, voteType } = req.body;
    const officerId = req.session.user.member_Id;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid signature type' });
    }

    const loan = await loanModel.getLoanById(loanId);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    if (loan.status !== 'Pending' && loan.status !== 'Under Review') {
      return res.status(400).json({ error: 'Cannot sign a loan that is not pending or under review' });
    }

    await loanModel.createVote(loanId, officerId, voteType);
    const votingSummary = await loanModel.getVotingSummary(loanId);
    
    // 🔁 Move loan to "Under Review" once all three officers have signed
    if (votingSummary.unique_officers >= 3 && loan.status === 'Pending') {
      await loanModel.updateLoanStatus(loanId, 'Under Review', null, null);
    }

    const signatures = await loanModel.getVotesByLoan(loanId);

    res.json({
      success: true,
      message: 'Signature recorded successfully',
      votingSummary,
      signatures
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error recording loan signature:`, err);
    res.status(500).json({ error: 'Failed to record signature' });
  }
});


// Download Loan Schedule PDF
router.get('/loans/:id/download', requireAuth, async (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const loan = await loanModel.getLoanById(loanId);
    if (!loan) {
      req.flash('error', 'Loan not found');
      return res.redirect('/my-loans');
    }

    const memberId = req.session.user.member_Id;
    const userRole = req.session.user.role;
    const isOwner = loan.member_id === memberId;
    const isAuthorized = ['chairman', 'chief_signatory', 'assistant_signatory'].includes(userRole);
    if (!isOwner && !isAuthorized) {
      req.flash('error', 'You are not authorized to view this loan');
      return res.redirect('/dashboard');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Loan_${loan.id}_Schedule.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    doc.pipe(res);

    function drawHeader() {
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 50 });
      }
      doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
      doc.moveDown(2);
    }

    function addFooter(username) {
      const generatedOn = new Date().toLocaleString();
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        const bottom = doc.page.height - 30;
        const margin = doc.page.margins.left;
        const pageWidth = doc.page.width;
        const usableWidth = pageWidth - margin * 2;

        const leftX = margin;
        const centerX = margin + usableWidth / 2;
        const rightX = margin + usableWidth;

        doc.fontSize(9).fillColor('gray');
        doc.text(`Generated: ${generatedOn}`, leftX, bottom, { lineBreak: false });
        const unameWidth = doc.widthOfString(username);
        doc.text(`Printed by ${username}`, centerX - unameWidth / 2, bottom, { lineBreak: false });
        const pageLabel = `Page ${i + 1} of ${range.count}`;
        const pageLabelWidth = doc.widthOfString(pageLabel);
        doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
      }
    }

    function drawTableHeader(headers, colWidths, startX, y, rowHeight) {
      doc.save();
      doc.font('Helvetica-Bold').fontSize(10);
      for (let i = 0; i < headers.length; i++) {
        const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke('#eeeeee', 'black');
        doc.fillColor('black').text(headers[i], x + 3, y + 6, {
          width: colWidths[i] - 6,
          align: 'center'
        });
      }
      doc.restore();
    }

    function renderTable(headers, rows, colWidths, rowHeight = 20) {
      const startX = doc.page.margins.left;
      const footerReserve = 40;
      const bottomY = doc.page.height - doc.page.margins.bottom - footerReserve;
      let y = doc.y;
      drawTableHeader(headers, colWidths, startX, y, rowHeight);
      y += rowHeight;

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r].map(v => (v == null ? '' : String(v)));
        const cellHeights = row.map((cell, i) =>
          doc.heightOfString(cell, { width: colWidths[i] - 6 })
        );
        const maxHeight = Math.max(rowHeight, ...cellHeights);

        if (y + maxHeight > bottomY) {
          doc.addPage();
          doc.font('Helvetica').fontSize(10);
          y = doc.page.margins.top;
          drawTableHeader(headers, colWidths, startX, y, rowHeight);
          y += rowHeight;
        }

        const bg = r % 2 === 0 ? '#f9f9f9' : '#ffffff';
        for (let i = 0; i < row.length; i++) {
          const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc.rect(x, y, colWidths[i], maxHeight).fillAndStroke(bg, 'black');
          doc.fillColor('black');
          if (i === 0) {
            doc.text(row[i], x + 4, y + 6, { width: colWidths[i] - 8, align: 'left' });
          } else {
            doc.text(row[i], x + 3, y + 6, { width: colWidths[i] - 6, align: 'center' });
          }
        }
        y += maxHeight;
      }
      doc.y = y;
    }

    drawHeader();
    doc.fontSize(16).text(`Loan Details & Amortization Schedule`, { underline: true, align: 'center' });
    doc.moveDown(2);

    doc.fontSize(12);
    doc.text(`Loan ID: ${loan.id}`);
    doc.text(`Member: ${loan.first_name} ${loan.sur_name}`);
    doc.text(`Type: ${loan.loan_type === 'service' ? 'Service Loan' : 'Investment Loan'}`);
    doc.text(`Interest Rate: ${loan.interest_rate}% p.a. (Reducing Balance)`);
    doc.text(`Principal Amount: TSh ${Number(loan.amount).toLocaleString()}`);
    doc.text(`Tenure: ${loan.tenure_months} months`);
    doc.text(`Monthly Payment (EMI): TSh ${Number(loan.monthly_payment).toLocaleString()}`);
    doc.text(`Total Repayable: TSh ${Number(loan.total_repayable).toLocaleString()}`);
    doc.text(`Paid So Far: TSh ${Number(loan.paid_amount).toLocaleString()}`);
    doc.text(`Remaining Balance: TSh ${Number(loan.remaining_balance).toLocaleString()}`);
    doc.text(`Purpose: ${loan.purpose}`);
    doc.text(`Bank Account: ${loan.bank_account} (${loan.bank_name})`);
    doc.text(`Status: ${loan.status}`);
    if (loan.reason) doc.text(`Rejection Reason: ${loan.reason}`);
    doc.text(`Applied: ${new Date(loan.created_at).toLocaleString()}`);
    if (loan.reviewed_at) doc.text(`Reviewed: ${new Date(loan.reviewed_at).toLocaleString()}`);
    doc.moveDown(2);

    doc.fontSize(14).text('Repayment Schedule', { underline: true });
    doc.moveDown(1);

    if (loan.repayments && loan.repayments.length > 0) {
      const headers = ['#', 'Due Date', 'Amount Due (TSh)', 'Amount Paid (TSh)', 'Status', 'Payment Date'];
      const rows = loan.repayments.map((inst, idx) => [
        idx + 1,
        new Date(inst.due_date).toLocaleDateString(),
        Number(inst.amount_due).toLocaleString(),
        Number(inst.amount_paid).toLocaleString(),
        inst.status,
        inst.payment_date ? new Date(inst.payment_date).toLocaleDateString() : '—'
      ]);

      const colWidths = [40, 90, 100, 100, 70, 90];
      renderTable(headers, rows, colWidths);
    } else {
      doc.fontSize(11).fillColor('gray').text('No repayment schedule generated yet (loan not approved).');
    }

    addFooter(req.session.user.username || req.session.user.email);
    doc.end();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error generating loan schedule PDF:`, err);
    req.flash('error', 'Failed to generate PDF');
    res.redirect(`/loans/${req.params.id}`);
  }
});

// Get signatures for a loan (for modal display)
router.get('/loans/:id/signatures', requireAuth, allowRoles('assistant_signatory', 'chief_signatory', 'chairman'), async (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    const signatures = await loanModel.getVotesByLoan(loanId);
    const votingSummary = await loanModel.getVotingSummary(loanId);
    res.json({ signatures, votingSummary });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error fetching loan signatures:`, err);
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

// ⚠️ PARAMETERIZED LOAN ROUTE – must be last among loan routes
router.get('/loans/:id', requireAuth, async (req, res) => {
  try {
    const loanId = parseInt(req.params.id);
    if (isNaN(loanId)) {
      req.flash('error', 'Invalid loan ID');
      return res.redirect('/my-loans');
    }
    const loan = await loanModel.getLoanById(loanId);
    if (!loan) {
      req.flash('error', 'Loan not found');
      return res.redirect('/my-loans');
    }

    const memberId = req.session.user.member_Id;
    const userRole = req.session.user.role;
    const isOwner = loan.member_id === memberId;
    const isAuthorized = ['chairman', 'chief_signatory', 'assistant_signatory'].includes(userRole);
    if (!isOwner && !isAuthorized) {
      req.flash('error', 'You are not authorized to view this loan');
      return res.redirect('/dashboard');
    }

    const restructuringHistory = await loanModel.getRestructuringHistoryByLoan(loanId);
    const schedule = loanModel.generateAmortizationSchedule(loan);
    res.render('loan_details', {
      user: req.session.user,
      loan,
      schedule,
      restructuringHistory
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error loading loan details:`, err);
    req.flash('error', 'Unable to load loan details');
    res.redirect('/my-loans');
  }
});


// Admin: List all loans and restructuring requests
router.get('/admin/loans', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
  try {
    const { loan_type, status, fromDate, toDate } = req.query;
    const loans = await loanModel.getAllLoans({ loan_type, status, fromDate, toDate });
    // Fetch all restructuring requests (you can add filters if needed)
    const restructuringRequests = await loanModel.getAllRestructuringRequests({ status, loan_type });
    res.render('admin_loans', {
      user: req.session.user,
      loans,
      restructuringRequests,
      filters: { loan_type, status, fromDate, toDate },
      flash: req.flash()
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error loading admin loans:`, err);
    req.flash('error', 'Unable to load loans list');
    res.redirect('/dashboard');
  }
});

// Admin: Update loan status (approve/reject) – enhanced with detailed checks
router.post('/admin/loans/update-status', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
  try {
    const { loanId, status, reason } = req.body;
    const officerId = req.session.user.member_Id;
    const officerRole = req.session.user.role;

    const loan = await loanModel.getLoanById(loanId);
    if (!loan) {
      if (req.xhr) return res.status(404).json({ success: false, error: 'Loan not found' });
      req.flash('error', 'Loan not found');
      return res.redirect('/admin/loans');
    }

    if (officerRole === 'chairman' && loan.loan_type !== 'service') {
      const msg = 'Chairman can only review service loans';
      if (req.xhr) return res.status(403).json({ success: false, error: msg });
      req.flash('error', msg);
      return res.redirect('/admin/loans');
    }
    if (officerRole === 'chief_signatory' && loan.loan_type !== 'investment') {
      const msg = 'Chief Signatory can only review investment loans';
      if (req.xhr) return res.status(403).json({ success: false, error: msg });
      req.flash('error', msg);
      return res.redirect('/admin/loans');
    }

    if (status === 'Approved') {
      const approvalStatus = await loanModel.getApprovalStatus(loanId);
      if (!approvalStatus.canApprove) {
        const msg = `Cannot approve: ${approvalStatus.reason}`;
        if (req.xhr) return res.status(400).json({ success: false, error: msg });
        req.flash('error', msg);
        return res.redirect('/admin/loans');
      }
    } else if (status === 'Rejected') {
      const rejectionStatus = await loanModel.getRejectionStatus(loanId);
      if (!rejectionStatus.canReject) {
        const msg = `Cannot reject: ${rejectionStatus.reason}`;
        if (req.xhr) return res.status(400).json({ success: false, error: msg });
        req.flash('error', msg);
        return res.redirect('/admin/loans');
      }
    }

    await loanModel.updateLoanStatus(loanId, status, reason, officerId);

    if (status === 'Approved') {
      await loanModel.createRepaymentSchedule(loanId);
    }

    const notificationMessage = status === 'Approved'
      ? `Your loan of TSh ${loan.amount} has been approved!`
      : `Your loan application was rejected. Reason: ${reason}`;
    await require('../models/notificationModel').createNotification(loan.member_id, notificationMessage);

    if (req.xhr) {
      return res.json({ success: true, message: `Loan ${status.toLowerCase()} successfully` });
    }

    req.flash('success', `Loan ${status.toLowerCase()} successfully`);
    res.redirect('/admin/loans');
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error updating loan status:`, err);
    const errorMsg = err.message || 'Failed to update loan status';
    if (req.xhr) {
      return res.status(500).json({ success: false, error: errorMsg });
    }
    req.flash('error', errorMsg);
    res.redirect('/admin/loans');
  }
});


// Member: Show restructure form
router.get('/loans/:id/restructure', requireAuth, async (req, res) => {
    const loanId = parseInt(req.params.id);
    const loan = await loanModel.getLoanById(loanId);
    if (!loan || loan.member_id !== req.session.user.member_Id) {
        req.flash('error', 'Loan not found or not authorized');
        return res.redirect('/my-loans');
    }
    if (loan.status !== 'Approved') {
        req.flash('error', 'Only approved loans can be restructured');
        return res.redirect('/my-loans');
    }
    res.render('loan_restructure', { user: req.session.user, loan, flash: req.flash() });
});

// Member: Submit restructure request
router.post('/loans/:id/restructure', requireAuth, async (req, res) => {
    const loanId = parseInt(req.params.id);
    const { new_tenure, reason } = req.body;
    const memberId = req.session.user.member_Id;
    try {
        await loanModel.createRestructuringRequest(memberId, loanId, parseInt(new_tenure), reason);
        req.flash('success', 'Restructuring request submitted for approval.');
        res.redirect('/my-loans');
    } catch (err) {
        req.flash('error', err.message);
        res.redirect(`/loans/${loanId}/restructure`);
    }
});

// Admin: List restructuring requests
router.get('/admin/restructuring', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
    const { status, loan_type } = req.query;
    const requests = await loanModel.getAllRestructuringRequests({ status, loan_type });
    res.render('admin_restructuring', { user: req.session.user, requests, filters: { status, loan_type } });
});

// Admin: Update status (approve/reject)
router.post('/admin/restructuring/update-status', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
    const { requestId, status, reason } = req.body;
    const officerId = req.session.user.member_Id;
    const request = await loanModel.getRestructuringRequestById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Role-based check: only chairman for service loans, chief for investment
    const loanType = request.loan_type;
    if ((req.session.user.role === 'chairman' && loanType !== 'service') ||
        (req.session.user.role === 'chief_signatory' && loanType !== 'investment')) {
        return res.status(403).json({ error: 'You are not authorized to review this type of restructuring request' });
    }

    if (status === 'Approved') {
        const { canApprove, reason: errReason } = await loanModel.canApproveRestructuring(requestId);
        if (!canApprove) return res.status(400).json({ error: errReason });
        await loanModel.updateRestructuringRequestStatus(requestId, 'Approved', officerId);
        await loanModel.applyRestructuring(requestId, officerId);
        // Notify member
        const message = `Your restructuring request for loan #${request.loan_id} has been approved.`;
        await notificationModel.createNotification(request.member_id, message);
    } else if (status === 'Rejected') {
        if (!reason) return res.status(400).json({ error: 'Rejection reason required' });
        const { canReject, reason: errReason } = await loanModel.canRejectRestructuring(requestId);
        if (!canReject) return res.status(400).json({ error: errReason });
        await loanModel.updateRestructuringRequestStatus(requestId, 'Rejected', officerId, reason);
        // Notify member
        const message = `Your restructuring request for loan #${request.loan_id} was rejected. Reason: ${reason}`;
        await notificationModel.createNotification(request.member_id, message);
    }
    res.json({ success: true });
});

// Sign on a restructuring request
router.post('/restructuring/sign', requireAuth, allowRoles('assistant_signatory', 'chief_signatory', 'chairman'), async (req, res) => {
    const { requestId, voteType } = req.body;
    const officerId = req.session.user.member_Id;
    const request = await loanModel.getRestructuringRequestById(requestId);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'Pending') {
        return res.status(400).json({ error: 'Cannot sign a request that is already under review or processed' });
    }
    await loanModel.createRestructuringVote(requestId, officerId, voteType);
    // After voting, if all three have signed, move status to 'Under Review'
    const summary = await loanModel.getRestructuringVotingSummary(requestId);
    if (summary.unique_officers >= 3) {
        await loanModel.updateRestructuringRequestStatus(requestId, 'Under Review', null);
    }
    res.json({ success: true, summary });
});

// Get signatures for a restructuring request
router.get('/restructuring/:id/signatures', requireAuth, async (req, res) => {
    const requestId = parseInt(req.params.id);
    const signatures = await loanModel.getRestructuringVotes(requestId);
    const summary = await loanModel.getRestructuringVotingSummary(requestId);
    res.json({ signatures, votingSummary: summary });
});


module.exports = router;


