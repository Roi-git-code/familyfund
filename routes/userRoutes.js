

const express = require('express');
const router = express.Router();
const app = express();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const { requireAuth, requireRole, allowRoles  } = require('../middleware/auth');
const userLandingModel = require('../models/userLandingModel');
const memberModel = require('../models/memberModel'); // Your existing member model

const fundRequestModel = require('../models/fundRequestModel');
const notificationModel = require('../models/notificationModel');
const userRequestModel = require('../models/userRequestModel');
const sendNotification = require('../utils/notification'); // helper to notify users (email or UI)

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
      // Use the improved method to get comprehensive counts
      const counts = await fundRequestModel.getDashboardCountsByRole(role);
      
      // Map the counts to our expected variables
      newCount = counts.new_count; // Pending requests
      reviewedCount = counts.under_review_count; // Under Review requests
      approvedCount = counts.approved_count + counts.completed_count; // Approved + Completed
      rejectedCount = counts.rejected_count + counts.cancelled_count; // Rejected + Cancelled
    }

    // Calculate member-specific request counts for the stats cards
    const memberPendingProfileRequests = memberProfileRequests.filter(req => 
      req.status === 'Pending' || req.status === 'In Progress'
    ).length;

    const memberPendingFundRequests = memberFundRequests.filter(req => 
      req.status === 'Pending' || req.status === 'Under Review'
    ).length;

    const totalPendingRequests = memberPendingProfileRequests + memberPendingFundRequests;

    // Render dashboard with all data
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
      totalPendingRequests
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

    // Use the memberModel to get full profile with next of kin
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
    user: req.session.user, member, flash: req.flash() });
  } catch (err) {
    console.error('Error loading update profile:', err);
    req.flash('error', 'Unable to load update profile form.');
    res.redirect('/dashboard');
  }
});



// Configure multer for disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/'); // Files will be saved in public/uploads
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB file size limit
});

router.post('/update-profile',requireAuth,upload.fields([
    { name: 'dob_proof', maxCount: 1 },
    { name: 'children_proof', maxCount: 1 },
    { name: 'father_proof', maxCount: 1 },
    { name: 'mother_proof', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const memberId = req.session.user.member_Id;
      const { date_of_birth, address, marital_status, number_of_children, father_alive, mother_alive } = req.body;
      const files = req.files;

      // Parse and validate input
      const updatedFields = {};
      const errors = [];

      // Date validation
      if (date_of_birth) {
        const dob = new Date(date_of_birth);
        if (isNaN(dob.getTime())) {
          errors.push('Invalid date format for date of birth');
        } else {
          updatedFields.date_of_birth = dob;
        }
      }

      // Address validation
      if (address) {
        if (address.length > 200) {
          errors.push('Address exceeds maximum length (200 characters)');
        } else {
          updatedFields.address = address;
        }
      }

      // Marital status validation
      const validMaritalStatuses = ['single', 'married', 'divorced', 'widowed'];
      if (marital_status) {
        if (!validMaritalStatuses.includes(marital_status.toLowerCase())) {
          errors.push('Invalid marital status');
        } else {
          updatedFields.marital_status = marital_status.toLowerCase();
        }
      }

      // Number of children validation
      if (number_of_children !== undefined && number_of_children !== '') {
        const num = parseInt(number_of_children);
        if (isNaN(num) || num < 0 || num > 20) {
          errors.push('Number of children must be between 0 and 20');
        } else {
          updatedFields.number_of_children = num;
        }
      }

      // Parse checkbox values
      updatedFields.father_alive = father_alive === 'on';
      updatedFields.mother_alive = mother_alive === 'on';

      // File attachments - store paths
      const attachments = {};
      if (files) {
        if (files.dob_proof) {
          attachments.dob_proof = `/uploads/${files.dob_proof[0].filename}`;
        }
        if (files.children_proof) {
          attachments.children_proof = `/uploads/${files.children_proof[0].filename}`;
        }
        if (files.father_proof) {
          attachments.father_proof = `/uploads/${files.father_proof[0].filename}`;
        }
        if (files.mother_proof) {
          attachments.mother_proof = `/uploads/${files.mother_proof[0].filename}`;
        }
      }

      // Check for validation errors
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      // Create user request
      const request = await userRequestModel.createUserRequest(
        memberId,
        updatedFields,
        attachments
      );

      res.status(201).json({
        success: true,
        message: 'Profile update request submitted for approval',
        requestId: request._id,
        attachments
      });

    } catch (error) {
      console.error('Profile update error:', error);

      // Handle specific errors
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
  }
);
  

// GET all user requests - chairman only
router.get('/user-requests', requireAuth, allowRoles('chairman', 'chief_signatory','assistant_signatory'), async (req, res) => {
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
    
    // Get original request
    const originalRequest = await userRequestModel.getUserRequestById(requestId);
    
    if (!originalRequest || originalRequest.member_id !== memberId) {
      req.flash('error', 'Request not found or not authorized');
      return res.redirect('/update-requests');
    }
    
    // Create a new request with the same data
    const newRequest = await userRequestModel.createUserRequest(
      memberId,
      originalRequest.updated_fields,
      originalRequest.attachments
    );
    
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
  upload.array('supportingDoc', 5), // handle up to 5 supporting documents
  async (req, res) => {
    try {
      const memberId = req.session.user.member_Id;
      const { requestType, amount, bankAccount, bankName, additionalInfo } = req.body;
      const files = req.files;

      // Validate required fields
      const errors = [];
      if (!requestType) errors.push('Request type is required');
      if (!amount) errors.push('Amount is required');
      if (!bankAccount) errors.push('Bank account number is required');
      if (!bankName) errors.push('Bank name is required');

      if (errors.length > 0) {
        req.flash('error', errors.join(', '));
        return res.redirect('/update-profile');
      }

      // Validate numeric amount
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        req.flash('error', 'Amount must be a positive number');
        return res.redirect('/update-profile');
      }

      // Process uploaded files
      const attachments = files ? files.map(f => `/uploads/${f.filename}`) : [];

      // Save the fund request in the database
      await fundRequestModel.createFundRequest(
        memberId,
        requestType,
        numericAmount,
        bankAccount,
        bankName,
        additionalInfo,
        attachments // optional field for file paths
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
router.get(
  '/user-requests/download/:id',
  requireAuth,
  allowRoles('chairman', 'chief_signatory', 'assistant_signatory'),
  async (req, res) => {
    try {
      const requestId = req.params.id;

     // Pull member + officer (via officer's member_id) in one go
      const request = await userRequestModel.getUserRequestWithOfficer(requestId);
    
      if (!request) {
        req.flash('error', 'Request not found.');
        return res.redirect('/user-requests');
      }

      // Try to get member details if your model exposes it; otherwise, fall back to name on request
     const member = await memberModel.getMemberById(request.member_id);
    const memberFullName = member
      ? `${member.first_name} ${member.middle_name} ${member.sur_name}`
      : 'Unknown Member';

      const reviewedDate =
        request.reviewed_at || request.updated_at || null;

     // Officer pulled from JOINs using reviewed_by (member_id)
      const officerRole = request.officer_role || '—';
      const officerName = request.officer_name || '—';

      // Prepare response headers
      const filename = `UpdateRequest_${request.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      // Create the PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(res);

      // Header / Branding
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 50 });
    }
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);

    // Title
    doc.fontSize(16).text('Profile Update Request - Review Document', { underline: true });
    doc.moveDown();

      // Divider
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown(1);

      // Request Essentials
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

      // Requested Changes Table-ish
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

      // Rejection reason (if any)
      if (String(request.status).toLowerCase() === 'rejected' && request.reject_reason) {
        doc.moveDown(0.5).fontSize(13).text('Reason for Rejection', { underline: true }).moveDown(0.3);
        doc.fontSize(11).text(request.reject_reason).moveDown(1);
      }

      // Signature block
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
  }
);

// Profile Update Request details
router.get('/requests/profile/:id/details', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const request = await userRequestModel.getUserRequestWithOfficer(id); // new method like PDF uses
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(request);
  } catch (err) {
    console.error('Error fetching profile request details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});



// Download PDF of My Contributions with optional time range f
router.get('/user/contributions/pdf', requireAuth, async (req, res) => {
 try {
    const memberId = req.session.user.member_Id;
    const from = req.query.from; // "YYYY-MM"
    const to = req.query.to;

    // Fetch all contributions
    let contributions = await userLandingModel.getMemberContributions(memberId);

    // Filter by from/to if provided
    if (from || to) {
      const fromDate = from ? new Date(from + '-01') : null;
      const toDate = to ? new Date(to + '-01') : null;

      contributions = contributions.filter(c => {
        const yearMonth = new Date(`${c.year}-01`); // contribution is yearly, treat as Jan
        if (fromDate && yearMonth < fromDate) return false;
        if (toDate && yearMonth > toDate) return false;
        return true;
      });
    }

    // Prepare rows: safe numeric conversion
    const rows = contributions.map(c => [
      c.year,
      Number(c.jan) || 0,
      Number(c.feb) || 0,
      Number(c.mar) || 0,
      Number(c.apr) || 0,
      Number(c.may) || 0,
      Number(c.jun) || 0,
      Number(c.jul) || 0,
      Number(c.aug) || 0,
      Number(c.sep) || 0,
      Number(c.oct) || 0,
      Number(c.nov) || 0,
      Number(c.dec) || 0,
      (Number(c.total_year) || 0).toFixed(2),
    ]);

    // PDF generation
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="MyContributions.pdf"');

    doc.pipe(res);

// === HEADER SECTION (centered) ===
const logoPath = path.join(__dirname, '../public/images/logo.png'); // adjust path
const systemName = "Family Fund Management System"; // your system name
const pageWidth = doc.page.width;

let headerY = 30;

// Draw logo centered
try {
  const logoWidth = 60;
  const logoX = (pageWidth - logoWidth) / 2;
  doc.image(logoPath, logoX, headerY, { width: logoWidth });
  headerY += 65; // leave space below logo
} catch (err) {
  console.warn("Logo not found, skipping logo render.");
}

// Draw system name below logo
doc.font('Helvetica-Bold')
   .fontSize(18)
   .fillColor('#000000')
   .text(systemName, 0, headerY, { align: 'center' });

headerY += 25; // spacing below system name

// === Dynamic Report Title ===
let reportTitle = "My Contributions";
if (from && to) {
  reportTitle += ` From ${from.replace("-", "/")} To ${to.replace("-", "/")}`;
} else if (from) {
  reportTitle += ` From ${from.replace("-", "/")}`;
} else if (to) {
  reportTitle += ` Up To ${to.replace("-", "/")}`;
} else {
  reportTitle += " (All Time)";
}

doc.font('Helvetica-Bold')
   .fontSize(16)
   .text(reportTitle, 0, headerY, { align: 'center', underline: true });

doc.moveDown(2);
    
     // Table Headerd

    const headers = ['Year', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Total'];
    addContributionTable(doc, headers, rows);
    addFooter(doc, req.session.user.username);
    doc.end();

  } catch (err) {
    console.error('Error generating My Contributions PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/dashboard');
  }
});


// Helper functions (reuse the ones we already defined)
function renderTable(doc, headers, rows, colWidths, rowHeight = 18) {
  const startX = doc.page.margins.left;
  const footerReserve = 40;
  const bottomY = doc.page.height - doc.page.margins.bottom - footerReserve;

  doc.font('Helvetica').fontSize(10);

  let y = doc.y;
  drawTableHeader(doc, headers, colWidths, startX, y, rowHeight);
  y += rowHeight;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r].map(v => (v == null ? '' : String(v)));
    const cellHeights = row.map((cell, i) =>
      doc.heightOfString(cell, { width: colWidths[i] - 6 })
    );
    const maxHeight = Math.max(rowHeight, ...cellHeights);

    if (y + maxHeight > bottomY) {
      doc.addPage({
      size: 'A4',
     layout: 'landscape',
     margins: { top: 50, bottom: 50, left: 50, right: 20 }
     });
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

      // Align left for year column, center for months/total
      if (i === 0) {
        doc.text(row[i], x + 4, y + 6, { width: colWidths[i] - 8, align: 'left' });
      } else {
        doc.text(row[i], x + 3, y + 6, { width: colWidths[i] - 6, align: 'center', ellipsis: true });
      }
    }
    y += maxHeight;
  }
  doc.y = y;
}

function addContributionTable(doc, headers, rows) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const yearW = 45;
  const totalW = 70;
  const months = 12;
  const monthW = Math.floor((pageWidth - (yearW + totalW)) / months);
  const colWidths = [yearW, ...Array(months).fill(monthW), totalW];

  renderTable(doc, headers, rows, colWidths, 18);
}

function drawTableHeader(doc, headers, colWidths, startX, y, rowHeight) {
  doc.font('Helvetica-Bold').fontSize(10);
  for (let i = 0; i < headers.length; i++) {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke('#2980b9', 'black');
    doc.fillColor('white').text(headers[i], x + 3, y + 6, {
      width: colWidths[i] - 6,
      align: 'center',
    });
  }
  doc.moveDown();
  doc.font('Helvetica').fontSize(10);
}


// Footer function
function addFooter(doc, username) {
  const range = doc.bufferedPageRange();
  const generatedOn = new Date().toLocaleString();

  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);

    const bottom = doc.page.height - 30; // fixed Y
    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - margin * 2;

    const leftX   = margin;
    const centerX = margin + usableWidth / 2;
    const rightX  = margin + usableWidth;

    doc.fontSize(9).fillColor('gray');

    // Left (Generated:)
    doc.text(`Generated: ${generatedOn}`, leftX, bottom, {
      lineBreak: false
    });

    // Center (username) - manually center by shifting X based on text width
    const uname = username || "User";
    const unameWidth = doc.widthOfString(uname);
    doc.text(uname, centerX - unameWidth / 2, bottom, {
      lineBreak: false
    });

    // Right (Page x of y) - right align manually
    const pageLabel = `Page ${i + 1} of ${range.count}`;
    const pageLabelWidth = doc.widthOfString(pageLabel);
    doc.text(pageLabel, rightX - pageLabelWidth, bottom, {
      lineBreak: false
    });
  }
}


// My Contributions page
router.get('/my-contributions', requireAuth, async (req, res) => {
  try {
    const { username } = req.session.user;

    // Get member profile
    const member = await userLandingModel.getMemberProfileByEmail(username);
    if (!member) {
      req.flash('error', 'No profile found for your account.');
      return res.redirect('/dashboard');
    }

    // Optional date range filter for contributions
    const from = req.query.from || '';
    const to = req.query.to || '';

    let contributions = await userLandingModel.getMemberContributions(member.id);
    
    // Apply date filtering if provided
    if (from || to) {
      contributions = contributions.filter(c => {
        const yearMonth = c.year + '-01'; // Use January as default month for yearly filtering
        let afterFrom = true, beforeTo = true;
        if (from) afterFrom = yearMonth >= from + '-01';
        if (to) beforeTo = yearMonth <= to + '-01';
        return afterFrom && beforeTo;
      });
    }

    // Lifetime totals for summary cards
    const { memberTotal, allTotal, percentage } = await userLandingModel.getLifetimeTotals(member.id);

    // Contribution relative color
    const relativeToMax = await (async () => {
      const summary = await require('../models/contributionModel').getContributionSummary();
      const memberData = summary.members.find(m => m.member_id === member.id);
      return memberData ? memberData.color : 'red';
    })();

    // Render dedicated contributions page
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

    // Fetch all contributions
    let contributions = await userLandingModel.getMemberContributions(memberId);

    // Filter by from/to if provided
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

    // Prepare rows
    const rows = contributions.map(c => [
      c.year,
      Number(c.jan) || 0,
      Number(c.feb) || 0,
      Number(c.mar) || 0,
      Number(c.apr) || 0,
      Number(c.may) || 0,
      Number(c.jun) || 0,
      Number(c.jul) || 0,
      Number(c.aug) || 0,
      Number(c.sep) || 0,
      Number(c.oct) || 0,
      Number(c.nov) || 0,
      Number(c.dec) || 0,
      (Number(c.total_year) || 0).toFixed(2),
    ]);

    // PDF generation (reuse existing PDF function)
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="MyContributions.pdf"');

    doc.pipe(res);

    // Header Section
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    const systemName = "Family Fund Management System";
    const pageWidth = doc.page.width;

    let headerY = 30;

    try {
      const logoWidth = 60;
      const logoX = (pageWidth - logoWidth) / 2;
      doc.image(logoPath, logoX, headerY, { width: logoWidth });
      headerY += 65;
    } catch (err) {
      console.warn("Logo not found, skipping logo render.");
    }

    doc.font('Helvetica-Bold')
       .fontSize(18)
       .fillColor('#000000')
       .text(systemName, 0, headerY, { align: 'center' });

    headerY += 25;

    // Report Title
    let reportTitle = "My Contributions";
    if (from && to) {
      reportTitle += ` From ${from.replace("-", "/")} To ${to.replace("-", "/")}`;
    } else if (from) {
      reportTitle += ` From ${from.replace("-", "/")}`;
    } else if (to) {
      reportTitle += ` Up To ${to.replace("-", "/")}`;
    } else {
      reportTitle += " (All Time)";
    }

    doc.font('Helvetica-Bold')
       .fontSize(16)
       .text(reportTitle, 0, headerY, { align: 'center', underline: true });

    doc.moveDown(2);

    // Table
    const headers = ['Year', 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Total'];
    addContributionTable(doc, headers, rows);
    addFooter(doc, req.session.user.username);
    doc.end();

  } catch (err) {
    console.error('Error generating My Contributions PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/my-contributions');
  }
});

module.exports = router;



