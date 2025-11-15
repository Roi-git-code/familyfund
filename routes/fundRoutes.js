

const express = require('express');
const router = express.Router();
const memberModel = require('../models/memberModel');
const fundRequestModel = require('../models/fundRequestModel');
const notificationModel = require('../models/notificationModel');
const { sendFundRequestStatusEmail } = require('../utils/mail');
const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

// Get all fund requests (for admin views)
router.get('/fund-requests', requireAuth, allowRoles('chairman', 'chief_signatory', 'assistant_signatory'), async (req, res) => {
  try {
    const { requestType, requestStatus, fromDate, toDate } = req.query;

    // Get filtered fund requests
    const fundRequests = await fundRequestModel.getFilteredFundRequests({
      requestType,
      requestStatus,
      fromDate,
      toDate
    });

    // Get filtered summaries
    const summaryByType = await fundRequestModel.getFundRequestSummaryByTypeFiltered(fromDate, toDate);
    const summaryByStatus = await fundRequestModel.getFundRequestSummaryByStatusFiltered(fromDate, toDate);

    res.render('fund_requests', {
      user: req.session.user,
      fundRequests,
      summaryByType,
      summaryByStatus,
      requestType,
      requestStatus,
      fromDate,
      toDate,
      flash: req.flash()
    });
  } catch (err) {
    console.error('Error loading fund requests:', err);
    req.flash('error', 'Unable to load fund requests');
    res.redirect('/dashboard');
  }
});

// Sign (vote) on fund request
router.post('/fund-requests/sign', requireAuth, allowRoles('assistant_signatory', 'chief_signatory', 'chairman'), async (req, res) => {
  try {
    const { requestId, voteType } = req.body;
    const officerId = req.session.user.member_Id;

    if (!['up', 'down'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid signature type' });
    }

    // Check if request exists and is still pending
    const request = await fundRequestModel.getFundRequestById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Fund request not found' });
    }

    if (request.status !== 'Pending' && request.status !== 'Under Review') {
      return res.status(400).json({ error: 'Cannot sign a request that is not pending or under review' });
    }

    // Record the signature
    await fundRequestModel.createVote(requestId, officerId, voteType);

    // Get updated signature summary
    const votingSummary = await fundRequestModel.getVotingSummary(requestId);
    const signatures = await fundRequestModel.getVotesByRequest(requestId);

    res.json({
      success: true,
      message: 'Signature recorded successfully',
      votingSummary,
      signatures
    });

  } catch (err) {
    console.error('Error recording signature:', err);
    res.status(500).json({ error: 'Failed to record signature' });
  }
});

// Get signature details for a request
router.get('/fund-requests/:id/signatures', requireAuth, async (req, res) => {
  try {
    const requestId = req.params.id;
    const signatures = await fundRequestModel.getVotesByRequest(requestId);
    const votingSummary = await fundRequestModel.getVotingSummary(requestId);
    
    res.json({
      signatures,
      votingSummary
    });
  } catch (err) {
    console.error('Error fetching signatures:', err);
    res.status(500).json({ error: 'Failed to fetch signature details' });
  }
});

// fund request status (only for chief signatory and chairman)
router.post('/fund-requests/update-status', requireAuth, allowRoles('chief_signatory','chairman'), async (req, res) => {
  try {
    const { requestId, status, reason } = req.body;
    const officerId = req.session.user.member_Id;
    const officerRole = req.session.user.role;

    console.log(`[DEBUG] Update status request:`, { requestId, status, officerId, officerRole });

    // Get fund request with member details for email
    const request = await fundRequestModel.getFundRequestWithMember(requestId);
    if (!request) {
      req.flash('error', 'Fund request not found');
      return res.redirect('/fund-requests');
    }

    // Check role-based permissions
    if (officerRole === 'chairman' && request.request_type !== 'Expenses') {
      req.flash('error', 'Chairman can only review Expenses requests');
      return res.redirect('/fund-requests');
    }

    if (officerRole === 'chief_signatory' && request.request_type === 'Expenses') {
      req.flash('error', 'Chief Signatory cannot review Expenses requests');
      return res.redirect('/fund-requests');
    }

    // DEBUG: Get detailed signature information
    const signatures = await fundRequestModel.debugSignatures(requestId);
    const detailedSummary = await fundRequestModel.getDetailedSignatureSummary(requestId);
    const signatureCount = await fundRequestModel.getSignatureCount(requestId);

    console.log(`[DEBUG] Signature analysis for request ${requestId}:`);
    console.log(`- Total signatures: ${signatureCount.total_signatures}`);
    console.log(`- UP signatures: ${signatureCount.up_signatures}`);
    console.log(`- DOWN signatures: ${signatureCount.down_signatures}`);
    console.log(`- Unique officers: ${detailedSummary.unique_officers}`);
    console.log(`- Officer IDs: ${detailedSummary.officer_ids}`);
    console.log(`- Vote types: ${detailedSummary.vote_types}`);

    // Check signature requirements
    if (status === 'Approved') {
      const canApprove = await fundRequestModel.canApproveRequest(requestId);
      console.log(`[DEBUG] Can approve request ${requestId}:`, canApprove);
      
      if (!canApprove) {
        req.flash('error', `Cannot approve: All three officers must sign UP for approval. Current: ${signatureCount.up_signatures}/3 UP signatures (Total: ${signatureCount.total_signatures} signatures from ${detailedSummary.unique_officers} officers)`);
        return res.redirect('/fund-requests');
      }
    } else if (status === 'Rejected') {
      const canReject = await fundRequestModel.canRejectRequest(requestId);
      console.log(`[DEBUG] Can reject request ${requestId}:`, canReject);
      
      if (!canReject) {
        req.flash('error', `Cannot reject: All three officers must sign DOWN for rejection. Current: ${signatureCount.down_signatures}/3 DOWN signatures (Total: ${signatureCount.total_signatures} signatures from ${detailedSummary.unique_officers} officers)`);
        return res.redirect('/fund-requests');
      }
    }

    // Get officer details
    const officer = await memberModel.getMemberById(officerId);
    const officerName = officer ? `${officer.first_name} ${officer.sur_name}` : 'System Officer';

    // Update fund request status
    await fundRequestModel.updateFundRequestStatus(requestId, status, reason, officerId);

    // Send email notification if member has email and status is Approved
    if (request.email && status === 'Approved') {
      try {
        const transactionNumber = await fundRequestModel.generateTRN(requestId);
        await sendFundRequestStatusEmail(request.email, {
          memberName: request.member_full_name || `${request.first_name} ${request.sur_name}`,
          requestId: request.id,
          amount: request.amount,
          requestType: request.request_type,
          status: status,
          officerName: officerName,
          actionDate: new Date(),
          rejectionReason: reason,
          transactionNumber: transactionNumber,
          dateSubmitted: request.created_at
        });
        console.log(`✅ Fund request ${status} notification sent to: ${request.email}`);
      } catch (emailError) {
        console.error('❌ Failed to send fund request notification email:', emailError);
      }
    } else if (request.email && status === 'Rejected') {
      try {
        await sendFundRequestStatusEmail(request.email, {
          memberName: request.member_full_name || `${request.first_name} ${request.sur_name}`,
          requestId: request.id,
          amount: request.amount,
          requestType: request.request_type,
          status: status,
          officerName: officerName,
          actionDate: new Date(),
          rejectionReason: reason,
          transactionNumber: null,
          dateSubmitted: request.created_at
        });
        console.log(`✅ Fund request ${status} notification sent to: ${request.email}`);
      } catch (emailError) {
        console.error('❌ Failed to send fund request notification email:', emailError);
      }
    }

    // Create notification in database
    const notificationMessage = status === 'Approved'
      ? `Your fund request for TSh ${request.amount} has been approved!`
      : `Your fund request for TSh ${request.amount} was rejected. Reason: ${reason}`;

    await notificationModel.createNotification(request.member_id, notificationMessage);

    req.flash('success', `Fund request ${status.toLowerCase()} successfully${request.email ? ' and notification sent' : ''}`);
    res.redirect('/fund-requests');
  } catch (err) {
    console.error('Error updating fund request status:', err);
    req.flash('error', 'Failed to update fund request status');
    res.redirect('/fund-requests');
  }
});

// Download a Fund Request as a PDF (admin reviewers)
router.get(
  '/fund-requests/download/:id',
  requireAuth,
  async (req, res) => {
    try {
      const requestId = req.params.id;
      // Get the request with signatures
      const request = await fundRequestModel.getFundRequestWithSignatures(requestId);
  
      if (!request) {
        req.flash('error', 'Fund request not found.');
        return res.redirect('/fund-requests');
      }

    const member = await memberModel.getMemberById(request.member_id);
    const memberFullName = member
      ? `${member.first_name} ${member.middle_name} ${member.sur_name}`
      : 'Unknown Member';

      const reviewedDate = request.reviewed_at || request.updated_at || null;

     // Officer pulled via JOINs using reviewed_by (member_id)
      const officerRole = request.officer_role || '—';
      const officerName = request.officer_name || '—';

      const filename = `FundRequest_${request.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(res);

      // Header
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, 45, { width: 50 });
      }
      doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
      doc.moveDown(2);

      // Title
      doc.fontSize(16).text('Fund Request - Review Document', { underline: true });
      doc.moveDown();

      // Divider
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke().moveDown(1);

      // Request Essentials
      doc.fontSize(12);
      doc.text(`Request ID: ${request.id}`);
      doc.text(`Member: ${memberFullName}`);
      doc.text(`Request Type: ${request.request_type}`);
      doc.text(`Amount: TSh ${Number(request.amount).toLocaleString()}`);
      doc.text(`Bank Account: ${request.bank_account}`);
      if (request.bank_name) doc.text(`Bank Name: ${request.bank_name}`);
      doc.text(`Additional Info: ${request.additional_info || 'None'}`);
      doc.text(`Submitted: ${new Date(request.created_at).toLocaleString()}`);
      doc.text(`Status: ${request.status}`);
      if (request.status === 'Rejected' && request.reason) {
      doc.fillColor('red').text(`Rejection Reason: ${request.reason}`);
      doc.fillColor('black');
      }
      doc.text(`Reviewed Date: ${reviewedDate ? new Date(reviewedDate).toLocaleString() : '—'}`);
      doc.text(`Officer Attended: ${officerRole} – ${officerName}`).moveDown(1);

      // Signatures Section
      if (request.signatures && request.signatures.length > 0) {
        doc.moveDown(0.5).fontSize(13).text('Officer Signatures', { underline: true }).moveDown(0.3);
        
        request.signatures.forEach((sig, index) => {
          const signatureType = sig.vote_type === 'up' ? 'SIGNED UP' : 'SIGNED DOWN';
          const signatureColor = sig.vote_type === 'up' ? 'green' : 'red';
          
          doc.fontSize(10)
             .fillColor(signatureColor)
             .text(`${index + 1}. ${sig.first_name} ${sig.middle_name} ${sig.sur_name} (${sig.role}) - ${signatureType}`)
             .fillColor('black')
             .text(`   Signed at: ${new Date(sig.signed_at).toLocaleString()}`)
             .moveDown(0.3);
        });
        
        // Signature Summary
        const upCount = request.signatures.filter(sig => sig.vote_type === 'up').length;
        const downCount = request.signatures.filter(sig => sig.vote_type === 'down').length;
        
        doc.moveDown(0.5)
           .fontSize(11)
           .fillColor('blue')
           .text(`Signature Summary: ${upCount} UP / ${downCount} DOWN (${request.signatures.length}/3 officers)`)
           .fillColor('black')
           .moveDown(1);
      } else {
        doc.fontSize(11).fillColor('orange').text('No signatures recorded yet').fillColor('black').moveDown(1);
      }

      // Signature block
      doc.moveDown(1.5);
      const sigY = doc.y;
      doc.text('Officer Signature: __________________________', 50, sigY);
      doc.text('Date: __________________', 350, sigY);

      doc.end();
    } catch (err) {
      console.error('Error generating fund-request PDF:', err);
      req.flash('error', 'Failed to generate PDF.');
      res.redirect('/fund-requests');
    }
  }
);

// fundRoutes.js - Fund Request details
router.get('/requests/fund/:id/details', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const request = await fundRequestModel.getFundRequestWithSignatures(id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json(request);
  } catch (err) {
    console.error('Error fetching fund request details:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function drawTableHeader(doc, headers, colWidths, startX, y, rowHeight) {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(11);
  headers.forEach((h, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke('#eeeeee', 'black');
    doc.fillColor('black').text(String(h), x + 3, y + 5, {
      width: colWidths[i] - 6,
      align: 'center',
      ellipsis: true
    });
  });
  doc.restore();
}

function addFundRequestTable(doc, headers, rows, rowHeight = 18) {
  const startX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const idW = 40;
  const memberW = 145;
  const amountW = 70;
  const statusW = 75;
  const remaining = pageWidth - (idW + memberW + amountW + statusW);
  const otherCols = headers.length - 4;
  const otherW = Math.floor(remaining / otherCols);

  const colWidths = [idW, memberW, ...Array(otherCols).fill(otherW)];
  // Insert amount + status at correct positions
  colWidths.splice(3, 0, amountW);
  colWidths.splice(5, 0, statusW);

  renderTable(doc, headers, rows, colWidths, rowHeight);
}

function addFundSummaryTable(doc, headers, rows, rowHeight = 18) {
  const startX = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const memberW = 250;  // more priority
  const otherCols = headers.length - 1;
  const otherW = Math.floor((pageWidth - memberW) / otherCols);

  const colWidths = [memberW, ...Array(otherCols).fill(otherW)];

  renderTable(doc, headers, rows, colWidths, rowHeight);
}

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

      // Name/member col left, others center
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
    doc.text('Printed by '+ uname, centerX - unameWidth / 2, bottom, {
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

router.get('/download/fund-requests/pdf', requireAuth, async (req, res) => {
  try {
    const { requestType, requestStatus, fromDate, toDate } = req.query;

    // Get filtered fund requests from model
    const fundRequests = await fundRequestModel.getFilteredFundRequests({ requestType, requestStatus, fromDate, toDate });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Fund_Requests.pdf"`);

    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 50, bottom: 50, left: 30, right: 10 } });
    doc.pipe(res);

    // Header & logo
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 45, { width: 50 });
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);
 
    // === Dynamic Report Title ===
let reportTitle = "Fund Requests Report";

const filters = [];
if (requestType) filters.push(`Type: ${requestType}`);
if (requestStatus) filters.push(`Status: ${requestStatus}`);
if (fromDate && toDate) {
  filters.push(`From ${fromDate} To ${toDate}`);
} else if (fromDate) {
  filters.push(`From ${fromDate}`);
} else if (toDate) {
  filters.push(`Up To ${toDate}`);
}

if (filters.length > 0) {
  reportTitle += " (" + filters.join(", ") + ")";
} else {
  reportTitle += " (All Time)";
}

doc.fontSize(16).text(reportTitle, { underline: true, align: 'center' });
doc.moveDown();

    const headers = ['ID', 'Member', 'Type', 'Amount (TSh)', 'Bank Account', 'Status', 'Submitted'];
    const rows = fundRequests.map(r => [
      r.id,
      `${r.first_name} ${r.sur_name}`,
      r.request_type,
      Number(r.amount).toLocaleString(),
      r.bank_account,
      r.status,
      new Date(r.created_at).toLocaleString()
    ]);

    addFundRequestTable(doc, headers, rows);
    addFooter(doc, req.session.user.username);
    doc.end();

  } catch (err) {
    console.error('Error generating Fund Requests PDF:', err);
    req.flash('error', 'Failed to generate Fund Requests PDF.');
    res.redirect('/fund-requests');
  }
});

router.get('/download/fund-summary/pdf', requireAuth, async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const summaryByType = await fundRequestModel.getFundRequestSummaryByTypeFiltered(fromDate, toDate);
    const summaryByStatus = await fundRequestModel.getFundRequestSummaryByStatusFiltered(fromDate, toDate);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Fund_Summary.pdf"`);

    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 50, bottom: 50, left: 30, right: 10 } });
    doc.pipe(res);

    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 45, { width: 50 });
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);

    // === Dynamic Report Title ===
let summaryTitle = "Fund Requests Summary by Type";
if (fromDate && toDate) {
  summaryTitle += ` (From ${fromDate} To ${toDate})`;
} else if (fromDate) {
  summaryTitle += ` (From ${fromDate})`;
} else if (toDate) {
  summaryTitle += ` (Up To ${toDate})`;
} else {
  summaryTitle += " (All Time)";
}

doc.fontSize(16).text(summaryTitle, { underline: true, align: 'center' });
doc.moveDown();

    const headersType = ['Request Type', 'Total Requests', 'Total Amount (TSh)'];
    const rowsType = summaryByType.map(r => [
      r.request_type,
      r.total_requests,
      Number(r.total_amount).toLocaleString()
    ]);
    addFundSummaryTable(doc, headersType, rowsType);
    doc.addPage();

    // Summary by Status
    let statusTitle = "Fund Requests Summary by Status";
if (fromDate && toDate) {
  statusTitle += ` (From ${fromDate} To ${toDate})`;
} else if (fromDate) {
  statusTitle += ` (From ${fromDate})`;
} else if (toDate) {
  statusTitle += ` (Up To ${toDate})`;
} else {
  statusTitle += " (All Time)";
}

doc.fontSize(16).text(statusTitle, { underline: true, align: 'center' });
doc.moveDown();

    const headersStatus = ['Status', 'Total Requests', 'Total Amount (TSh)'];
    const rowsStatus = summaryByStatus.map(r => [
      r.status,
      r.total_requests,
      Number(r.total_amount).toLocaleString()
    ]);
    addFundSummaryTable(doc, headersStatus, rowsStatus);

    addFooter(doc, req.session.user.username);
    doc.end();

  } catch (err) {
    console.error('Error generating Fund Summary PDF:', err);
    req.flash('error', 'Failed to generate Fund Summary PDF.');
    res.redirect('/fund-requests');
  }
});

module.exports = router;


