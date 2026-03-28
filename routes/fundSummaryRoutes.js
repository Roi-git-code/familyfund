

// routes/fundSummaryRoutes.js
const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');
const fundSummaryModel = require('../models/fundSummaryModel');
const pool = require('../db');
const {
  CATEGORY_META,
  getCategoryKeys,
  parseMonthStr,
  monthRangeToDates,
  getTotalFund,
  getCategoryTransactions,
  getCategoryTransactionsTotal,
  getCategorySummary,
  getFundOverview,
  toViewVars
} = require('../models/fundSummaryModel');

const router = express.Router();
const VIEW_NAME = 'fund_management';

function formatTimeRange(from, to) {
  if (!from && !to) return 'All time';
  if (from && !to) return `${from} – Present`;
  if (!from && to) return `Until ${to}`;
  return `${from} – ${to}`;
}

function validateDateParams(req, res, next) {
  const { from, to } = req.query;
  const regex = /^\d{4}-\d{2}$/;
  if ((from && !regex.test(from)) || (to && !regex.test(to))) {
    req.flash('error','Invalid date format, use YYYY-MM');
    return res.redirect('back');
  }
  next();
}

// GET: Fund Management
router.get('/fund-management', requireAuth, validateDateParams, async (req, res) => {
  try {
    const { from, to } = req.query;
    const overview = await getFundOverview(from, to);
    const viewVars = toViewVars(overview);

    const categoryRows = await fundSummaryModel.getCategoryRows();

    const allocationSummary = `${overview.totalFund.toLocaleString()} / ${overview.availableFund.toLocaleString()}`;

    res.render(VIEW_NAME, {
      user: req.session.user,
      from,
      to,
      timeRange: formatTimeRange(from, to),
      userColor: req.session.user?.color || '#3498db',
      ...viewVars,
      allocationSummary,
      categories: categoryRows,
      flash: req.flash(),
    });
  } catch (err) {
    console.error('Error loading fund management:', err);
    req.flash('error', 'Unable to load fund management');
    res.redirect('/dashboard');
  }
});

// Category history HTML
router.get('/funds/:category/history', requireAuth, validateDateParams, async (req, res) => {
  try {
    const { from, to } = req.query;
    const categoryKey = req.params.category.replace(/-/g, '_');
    const transactions = await fundSummaryModel.getCategoryTransactions(categoryKey, from, to);
    res.render('fund_history', { user: req.session.user, categoryKey, from, to, transactions });
  } catch (err) {
    console.error('Error fetching history', err);
    res.status(500).send('Server error');
  }
});

// Admin route to tweak category percentages (AJAX)
router.post('/funds/categories/update', requireAuth, requireRole('chairman'), async (req, res) => {
  try {
    let percents = req.body.percentages || {};
    if (!percents || Object.keys(percents).length === 0) {
      percents = {};
      Object.keys(req.body || {}).forEach(k => {
        const m = k.match(/^percentages\[(.+)\]$/);
        if (m) percents[m[1]] = req.body[k];
      });
    }
    const cleaned = {};
    Object.keys(percents).forEach(k => {
      const val = parseFloat(percents[k]);
      if (!isNaN(val) && val >= 0 && val <= 100) cleaned[k] = Math.round(val * 100) / 100;
    });
    if (Object.keys(cleaned).length === 0) {
      return res.json({ error: 'No valid percentages provided.' });
    }
    await fundSummaryModel.updateCategoryPercents(cleaned);
    res.json({ success: 'Category percentages updated successfully!' });
  } catch (err) {
    console.error('Error updating percents:', err);
    res.json({ error: 'Failed to update category percentages.' });
  }
});

// Partial: refresh breakdown table (returns JSON)
router.get('/funds/categories/breakdown', requireAuth, async (req, res) => {
  try {
    const overview = await fundSummaryModel.getFundOverview();
    const viewVars = fundSummaryModel.toViewVars(overview);
    res.json({ breakdown: viewVars.breakdown || [] });
  } catch (err) {
    console.error('Error loading breakdown:', err);
    res.status(500).send("<div class='alert alert-danger'>Failed to load breakdown.</div>");
  }
});

// ---------- PDF helpers ----------
function addHeader(doc) {
  const logoPath = path.join(__dirname, '../public/images/logo.png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 45, { width: 50 });
  }
  doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
  doc.moveDown(2);
}

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
    const unameWidth = doc.widthOfString(username);
    doc.text(`Printed by ${username}`, centerX - unameWidth / 2, bottom, { lineBreak: false });
    const pageLabel = `Page ${i + 1} of ${range.count}`;
    const pageLabelWidth = doc.widthOfString(pageLabel);
    doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
  }
}

function cur(n) { return new Intl.NumberFormat('en-US').format(Math.round(Number(n || 0))); }

// PDF: Overall Fund Summary
router.get('/funds/pdf', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const overview = await getFundOverview(from, to);
    const { totalFund, availableFund, categories } = overview;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Fund_Summary.pdf"');

    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 50, bottom: 50, left: 30, right: 30 } });
    doc.pipe(res);

    addHeader(doc);
    doc.fontSize(16).text('Fund Summary', { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(`Time Range: ${formatTimeRange(from, to)}`);
    doc.moveDown(0.5);

    doc.fontSize(12).text(`Total Fund: TSh ${cur(totalFund)}`);
    doc.text(`Available Fund: TSh ${cur(availableFund)}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Categories');
    doc.moveDown(0.3);

    Object.keys(categories).forEach((key) => {
      const c = categories[key];
      doc.fontSize(12).text(`${c.label}`);
      doc.fontSize(11).text(`Allocated: TSh ${cur(c.allocated)}  |  Used: TSh ${cur(c.used)}  |  Available: TSh ${cur(c.available)}`);
      doc.moveDown(0.5);
    });

    addFooter(doc, req.session.user?.username || req.session.user?.full_name);
    doc.end();
  } catch (err) {
    console.error('Error generating Fund Summary PDF:', err);
    req.flash('error', 'Failed to generate Fund Summary PDF.');
    res.redirect('/fund-management');
  }
});

// PDF: Single category
router.get('/funds/:category/pdf', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;
    const categoryKey = req.params.category.replace(/[-]/g, '_');
    if (!CATEGORY_META[categoryKey]) {
      req.flash('error', 'Unknown category');
      return res.redirect('/fund-management');
    }

    const overview = await getFundOverview(from, to);
    const c = overview.categories[categoryKey];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${c.label.replace(/\s+/g,'_')}_Report.pdf"`);

    const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 50, bottom: 50, left: 30, right: 30 } });
    doc.pipe(res);

    addHeader(doc);
    doc.fontSize(16).text(`${c.label} - Fund Category`, { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(`Time Range: ${formatTimeRange(from, to)}`);
    doc.moveDown();
    doc.fontSize(12).text(`Allocated: TSh ${cur(c.allocated)}`);
    doc.text(`Used: TSh ${cur(c.used)}`);
    doc.text(`Available: TSh ${cur(c.available)}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Approved Transactions');
    doc.moveDown(0.3);

    if (!c.transactions || c.transactions.length === 0) {
      doc.fontSize(11).text('No transactions in this period.');
    } else {
      // Use a general table drawing function (simplified for brevity)
      function drawTable(doc, transactions, totalText) {
        // Simple implementation; adjust as needed
        const startY = doc.y;
        const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidths = [40, 90, 100, 100, 70];
        const headers = ['TRN', 'Member', 'Amount (TSh)', 'Date', 'Status'];
        // ... table drawing code omitted for brevity (similar to previous)
        // We'll assume it exists or just use a simple list
        doc.fontSize(10);
        transactions.forEach(t => {
          doc.text(`${t.txn_display_trn || 'TRN'} - ${t.first_name} ${t.sur_name} - TSh ${cur(t.amount)} - ${new Date(t.created_at).toLocaleDateString()}`, doc.page.margins.left, doc.y);
          doc.moveDown(0.3);
        });
      }
      drawTable(doc, c.transactions, `Total: TSh ${cur(c.transactionsTotal)}`);
    }

    addFooter(doc, req.session.user?.username || req.session.user?.full_name);
    doc.end();
  } catch (err) {
    console.error('Error generating Category PDF:', err);
    req.flash('error', 'Failed to generate category PDF.');
    res.redirect('/fund-management');
  }
});

// ---------- Financial Statement ----------
function normalizeDateParams(req, res, next) {
  if (!req.query.from) req.query.from = 'all';
  if (!req.query.to) req.query.to = 'all';
  next();
}


router.get('/financial-statement', requireAuth, validateDateParams, async (req, res) => {
  try {
    let { from, to, member_id } = req.query || {};
    if (!from) from = 'all';
    if (!to) to = 'all';

    const user = req.session.user || {};
    const sessionMemberId = user.member_id || user.member_Id || null;
    const isOfficial = ['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role);

    // Get transactions – INCLUDING LOAN TRANSACTIONS
    const individualTransactions = await fundSummaryModel.getFinancialTransactions(sessionMemberId, from, to);
    let overallTransactions = [];
    let membersList = [];

    if (isOfficial) {
      overallTransactions = await fundSummaryModel.getFinancialTransactions(member_id || null, from, to);
      membersList = await fundSummaryModel.getMembersList();

      // Optional: log to debug (remove after confirming)
      console.log(`Overall transactions: ${overallTransactions.length}`);
      console.log(`Loan disbursements in overall: ${overallTransactions.filter(t => t.request_type === 'Loan Disbursement').length}`);
    }

    // Helper to calculate totals
    const calculateTotals = (transactions) => {
      let credits = 0, debits = 0;
      transactions.forEach(t => {
        if (t.type === 'credit') credits += Number(t.amount);
        else debits += Number(t.amount);
      });
      return { credits, debits, net: credits - debits };
    };

    // Filter individual transactions for regular members (exclude ROI only – keep loan disbursements)
    const filteredIndividualTransactions = user.role === 'member'
      ? individualTransactions.filter(t => t.request_type !== 'ROI Payment')
      : individualTransactions;

    // For statistics cards, use the same data as the net balance (overall for officials, filtered individual for members)
    const breakdownTransactions = isOfficial ? overallTransactions : filteredIndividualTransactions;
    const summaryTotals = calculateTotals(breakdownTransactions);

    // Overall and individual totals (used for closing balances)
    const overallTotals = calculateTotals(overallTransactions);
    const individualTotals = calculateTotals(individualTransactions);

    // Group transactions by month
    const groupByMonth = (transactions, isIndividual = false) => {
      const groups = {};
      let runningBalance = 0;
      const sorted = [...transactions].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      sorted.forEach(transaction => {
        const date = new Date(transaction.created_at);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        if (!groups[monthKey]) {
          groups[monthKey] = {
            label: monthLabel,
            transactions: [],
            openingBalance: runningBalance,
            balance: 0
          };
        }
        groups[monthKey].transactions.push(transaction);
        runningBalance += (transaction.type === 'credit' ? Number(transaction.amount) : -Number(transaction.amount));
        groups[monthKey].balance = runningBalance;
      });
      return groups;
    };

    const monthlyGroups = {
      overall: groupByMonth(overallTransactions),
      individual: groupByMonth(filteredIndividualTransactions, true)
    };

    // Build PDF query string
    const pdfParams = new URLSearchParams({
      from: (from === 'all' ? '' : from),
      to: (to === 'all' ? '' : to),
      member_id: member_id || ''
    });
    const pdfQuery = pdfParams.toString();

    // Prepare inputs for month fields
    const fromInput = from === 'all' ? '' : from;
    const toInput = to === 'all' ? '' : to;

    const timeRange = formatTimeRange(from, to);

    res.render('financial_statement', {
      user,
      from,
      to,
      fromInput,
      toInput,
      member_id,
      isOfficial,
      overallTransactions,
      individualTransactions: filteredIndividualTransactions,
      breakdownTransactions,
      membersList,
      pdfQuery,
      timeRange,
      monthlyGroups,
      totalCredits: summaryTotals.credits,
      totalDebits: summaryTotals.debits,
      netBalance: summaryTotals.net,
      overallClosingBalance: overallTotals.net,
      individualClosingBalance: individualTotals.net,
      flash: req.flash(),
    });
  } catch (err) {
    console.error('Error loading financial statement:', err);
    req.flash('error', 'Unable to load financial statement');
    res.redirect('/dashboard');
  }
});


// PDF: Financial Statement (enhanced with loan types)
router.get('/financial-statement/pdf', requireAuth, async (req, res) => {
  try {
    const { type, member_id, from, to } = req.query;
    const user = req.session.user || {};

    // Get transaction data - INCLUDING LOAN TRANSACTIONS
    const sessionMemberId = user.member_id || user.member_Id || null;
    let individualTransactions = await fundSummaryModel.getFinancialTransactions(sessionMemberId, from, to);
    let overallTransactions = [];
    
    if (['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role)) {
      overallTransactions = await fundSummaryModel.getFinancialTransactions(member_id || null, from, to);
    }

    // Filter out ROI and loan disbursements from individual statements for regular members
    if (user.role === 'member') {
      individualTransactions = individualTransactions.filter(t => t.request_type !== 'ROI Payment' && t.request_type !== 'Loan Disbursement');
    }

    // Sort transactions by date
    overallTransactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    individualTransactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Function to get full member name from user object
    const getFullMemberName = (user) => {
      const names = [];
      if (user.first_name) names.push(user.first_name);
      if (user.middle_name) names.push(user.middle_name);
      if (user.sur_name) names.push(user.sur_name);
      if (names.length === 0 && user.username) names.push(user.username);
      return names.join(' ').trim() || 'Member';
    };
    const fullMemberName = getFullMemberName(user);

    res.setHeader('Content-Type', 'application/pdf');
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    let filename = 'financial_statement';
    if (type === 'overall') filename = 'overall_financial_statement';
    else if (type === 'individual') filename = 'individual_financial_statement';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    doc.pipe(res);

    // PDF header with logo and title (same as before, adapted)
    const addHeader = (title, subtitle = '', showMemberName = false) => {
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      let headerHeight = showMemberName ? 120 : 100;
      if (subtitle && !showMemberName) headerHeight = 110;
      doc.rect(0, 0, doc.page.width, headerHeight).fill('#2c3e50');
      try {
        if (fs.existsSync(logoPath)) doc.image(logoPath, doc.page.margins.left, 25, { width: 50, height: 50 });
      } catch (err) {}
      const centerStartY = showMemberName ? 40 : 45;
      const contentWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#ffffff')
         .text('FAMILY FUND MANAGEMENT SYSTEM', doc.page.margins.left, centerStartY, { width: contentWidth, align: 'center' });
      doc.fontSize(12).text('Financial Statement Report', doc.page.margins.left, centerStartY + 20, { width: contentWidth, align: 'center' });
      doc.fontSize(18).text(title, doc.page.margins.left, centerStartY + 40, { width: contentWidth, align: 'center' });
      if (showMemberName) {
        doc.fontSize(14).text(`Member: ${fullMemberName}`, doc.page.margins.left, centerStartY + 65, { width: contentWidth, align: 'center' });
      } else if (subtitle) {
        doc.fontSize(12).text(subtitle, doc.page.margins.left, centerStartY + 65, { width: contentWidth, align: 'center' });
      }
      const periodStartY = centerStartY + 15;
      const timeRange = formatTimeRange(from, to);
      doc.fontSize(8).text(`Period: ${timeRange}`, doc.page.margins.left, periodStartY, { width: contentWidth, align: 'right' })
         .text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, doc.page.margins.left, periodStartY + 12, { width: contentWidth, align: 'right' });
      if (showMemberName) {
        doc.text(`Member ID: ${sessionMemberId || 'N/A'}`, doc.page.margins.left, periodStartY + 24, { width: contentWidth, align: 'right' });
      }
      doc.y = headerHeight + 20;
    };

    const addFooter = (showMemberName = false) => {
      const pageNumber = doc.bufferedPageRange().count;
      const bottomY = doc.page.height - 50;
      const contentWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
      doc.moveTo(doc.page.margins.left, bottomY - 20).lineTo(doc.page.width - doc.page.margins.right, bottomY - 20).strokeColor('#cccccc').lineWidth(1).stroke();
      doc.fontSize(8).fillColor('#666666');
      const footerText = showMemberName ? `Family Fund Management System - ${fullMemberName}` : 'Family Fund Management System - Confidential';
      doc.text(footerText, doc.page.margins.left, bottomY - 15, { align: 'left' });
      doc.text(`Generated by: ${fullMemberName}`, doc.page.margins.left, bottomY - 15, { width: contentWidth, align: 'center' });
      doc.text(`Page ${doc.bufferedPageRange().count} of ${pageNumber}`, doc.page.margins.left, bottomY - 15, { width: contentWidth, align: 'right' });
    };

    // Table drawing function with loan transaction colors
    const drawTransactionTable = (transactions, isOverall = false, showMemberName = false) => {
      const startY = doc.y;
      const tableTop = startY + 10;
      // Column definitions
      let columns = [
        { key: 'number', label: '#', width: 25, align: 'center' },
        { key: 'date', label: 'Date', width: 65, align: 'left' },
        { key: 'trn', label: 'Transaction ID', width: 90, align: 'left' },
        { key: 'description', label: 'Description', width: isOverall ? 100 : 150, align: 'left' },
        { key: 'credit', label: 'Credit (TSh)', width: 75, align: 'right' },
        { key: 'debit', label: 'Debit (TSh)', width: 75, align: 'right' },
        { key: 'balance', label: 'Balance (TSh)', width: 85, align: 'right' }
      ];
      if (isOverall) {
        columns.splice(3, 0, { key: 'member', label: 'Member', width: 90, align: 'left' });
      }

      const totalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      const maxAllowedWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
      let scaleFactor = 1;
      if (totalWidth > maxAllowedWidth) {
        scaleFactor = maxAllowedWidth / totalWidth;
        columns.forEach(col => { col.width = Math.floor(col.width * scaleFactor); });
      }
      const adjustedTotalWidth = columns.reduce((sum, col) => sum + col.width, 0);
      const startX = doc.page.margins.left + (maxAllowedWidth - adjustedTotalWidth) / 2;

      let y = tableTop;
      let runningBalance = 0;

      // Draw header
      doc.fontSize(9).font('Helvetica-Bold');
      let x = startX;
      columns.forEach(col => {
        doc.rect(x, y, col.width, 22).fill('#34495e');
        doc.fillColor('#ffffff').text(col.label, x + 5, y + 8, { width: col.width - 10, align: col.align });
        doc.rect(x, y, col.width, 22).strokeColor('#2c3e50').lineWidth(1).stroke();
        x += col.width;
      });
      y += 22;

      // Draw rows
      doc.fontSize(8).font('Helvetica');
      transactions.forEach((transaction, idx) => {
        if (y > doc.page.height - doc.page.margins.bottom - 30) {
          addFooter(showMemberName);
          doc.addPage();
          if (showMemberName) addHeader('INDIVIDUAL FINANCIAL STATEMENT', '', true);
          else addHeader(isOverall ? 'Overall Financial Statement' : 'Individual Financial Statement', 'Continued...');
          y = doc.y + 10;
          x = startX;
          doc.fontSize(9).font('Helvetica-Bold');
          columns.forEach(col => {
            doc.rect(x, y, col.width, 22).fill('#34495e');
            doc.fillColor('#ffffff').text(col.label, x + 5, y + 8, { width: col.width - 10, align: col.align });
            doc.rect(x, y, col.width, 22).strokeColor('#2c3e50').lineWidth(1).stroke();
            x += col.width;
          });
          y += 22;
          doc.fontSize(8).font('Helvetica');
        }

        // Row background color based on transaction type
        let rowColor = '#f8f9fa';
        if (transaction.request_type === 'ROI Payment') rowColor = '#fff9e6';
        else if (transaction.request_type === 'Refund') rowColor = '#e6f7ff';
        else if (transaction.request_type === 'Contribution') rowColor = '#e8f6ef';
        else if (transaction.request_type === 'Loan Disbursement') rowColor = '#fff4e0';
        else if (transaction.request_type === 'Loan Repayment') rowColor = '#f3e5f5';
        doc.rect(startX, y, adjustedTotalWidth, 18).fill(rowColor);

        runningBalance += (transaction.type === 'credit' ? Number(transaction.amount) : -Number(transaction.amount));

        const rowData = {
          number: (idx + 1).toString(),
          date: new Date(transaction.created_at).toLocaleDateString('en-GB'),
          trn: transaction.txn_trn || 'NO-TRN',
          description: transaction.request_type,
          credit: transaction.type === 'credit' ? Number(transaction.amount).toLocaleString() : '-',
          debit: transaction.type === 'debit' ? Number(transaction.amount).toLocaleString() : '-',
          balance: runningBalance.toLocaleString(),
          member: isOverall ? `${transaction.first_name} ${transaction.sur_name}`.substring(0, 20) : ''
        };

        x = startX;
        columns.forEach(col => {
          let value = rowData[col.key];
          let color = '#000000';
          if (col.key === 'credit' && value !== '-') {
            if (transaction.request_type === 'ROI Payment') color = '#e67e22';
            else if (transaction.request_type === 'Refund') color = '#3498db';
            else if (transaction.request_type === 'Contribution') color = '#27ae60';
            else if (transaction.request_type === 'Loan Repayment') color = '#9b59b6';
            else color = '#27ae60';
          } else if (col.key === 'debit' && value !== '-') {
            if (transaction.request_type === 'Loan Disbursement') color = '#f39c12';
            else color = '#e74c3c';
          } else if (col.key === 'trn' || col.key === 'description') {
            if (transaction.request_type === 'ROI Payment') color = '#e67e22';
            else if (transaction.request_type === 'Refund') color = '#3498db';
            else if (transaction.request_type === 'Contribution') color = '#27ae60';
            else if (transaction.request_type === 'Loan Disbursement') color = '#f39c12';
            else if (transaction.request_type === 'Loan Repayment') color = '#9b59b6';
          } else if (col.key === 'balance') {
            color = '#2c3e50';
          }
          doc.fillColor(color).text(value, x + 5, y + 6, { width: col.width - 10, align: col.align });
          doc.rect(x, y, col.width, 18).strokeColor('#e9ecef').lineWidth(0.5).stroke();
          x += col.width;
        });
        y += 18;
      });

      // Legend
      if (transactions.length > 0) {
        y += 10;
        const legendWidth = adjustedTotalWidth;
        const legendX = startX;
        doc.rect(legendX, y, legendWidth, 25).fill('#f8f9fa').strokeColor('#dee2e6').stroke();
        const legendItems = [
          { color: '#27ae60', label: 'Contribution' },
          { color: '#e67e22', label: 'ROI Payment' },
          { color: '#3498db', label: 'Refund' },
          { color: '#e74c3c', label: 'Fund Request' },
          { color: '#f39c12', label: 'Loan Disbursement' },
          { color: '#9b59b6', label: 'Loan Repayment' }
        ];
        const itemWidth = legendWidth / legendItems.length;
        let legendTextX = legendX + 5;
        doc.fontSize(7);
        legendItems.forEach(item => {
          doc.rect(legendTextX, y + 8, 8, 8).fill(item.color);
          doc.fillColor('#2c3e50').text(item.label, legendTextX + 12, y + 8, { align: 'left' });
          legendTextX += itemWidth;
        });
        y += 35;
      }

      // Closing balance
      const balanceWidth = columns.slice(-3).reduce((sum, col) => sum + col.width, 0);
      const balanceX = startX + adjustedTotalWidth - balanceWidth;
      doc.rect(balanceX, y, balanceWidth, 25).fill('#2c3e50');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#ffffff')
         .text(`Closing Balance: TSh ${runningBalance.toLocaleString()}`, balanceX, y + 8, { width: balanceWidth, align: 'center' });
      doc.y = y + 40;
    };

    // Generate PDF content based on type
    if (type === 'overall') {
      addHeader('OVERALL FINANCIAL STATEMENT', 'Complete transaction history for all members');
      if (overallTransactions.length > 0) {
        const totalCredits = overallTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + Number(t.amount), 0);
        const totalDebits = overallTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + Number(t.amount), 0);
        const netBalance = totalCredits - totalDebits;
        const roiTotal = overallTransactions.filter(t => t.request_type === 'ROI Payment').reduce((sum, t) => sum + Number(t.amount), 0);
        const refundTotal = overallTransactions.filter(t => t.request_type === 'Refund').reduce((sum, t) => sum + Number(t.amount), 0);
        const contributionTotal = overallTransactions.filter(t => t.request_type === 'Contribution').reduce((sum, t) => sum + Number(t.amount), 0);
        const loanDisbursementTotal = overallTransactions.filter(t => t.request_type === 'Loan Disbursement').reduce((sum, t) => sum + Number(t.amount), 0);
        const loanRepaymentTotal = overallTransactions.filter(t => t.request_type === 'Loan Repayment').reduce((sum, t) => sum + Number(t.amount), 0);

        doc.fontSize(10).fillColor('#666666')
           .text(`Summary: ${overallTransactions.length} transactions | Credits: TSh ${totalCredits.toLocaleString()} | Debits: TSh ${totalDebits.toLocaleString()} | Net: TSh ${netBalance.toLocaleString()}`, doc.page.margins.left, doc.y, { width: doc.page.width - 100, align: 'left' });
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#7f8c8d')
           .text(`Breakdown: Contributions: TSh ${contributionTotal.toLocaleString()} | ROI: TSh ${roiTotal.toLocaleString()} | Refunds: TSh ${refundTotal.toLocaleString()} | Loan Disbursements: TSh ${loanDisbursementTotal.toLocaleString()} | Loan Repayments: TSh ${loanRepaymentTotal.toLocaleString()}`, doc.page.margins.left, doc.y, { width: doc.page.width - 100, align: 'left' });
        doc.moveDown(1.5);
        drawTransactionTable(overallTransactions, true);
      } else {
        doc.fontSize(12).fillColor('#666666').text('No transactions found for the selected period.', doc.page.margins.left, doc.y, { align: 'center' });
      }
    } else if (type === 'individual') {
      addHeader('INDIVIDUAL FINANCIAL STATEMENT', '', true);
      if (individualTransactions.length > 0) {
        const totalCredits = individualTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + Number(t.amount), 0);
        const totalDebits = individualTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + Number(t.amount), 0);
        const netBalance = totalCredits - totalDebits;
        const refundTotal = individualTransactions.filter(t => t.request_type === 'Refund').reduce((sum, t) => sum + Number(t.amount), 0);
        const contributionTotal = individualTransactions.filter(t => t.request_type === 'Contribution').reduce((sum, t) => sum + Number(t.amount), 0);
        const loanRepaymentTotal = individualTransactions.filter(t => t.request_type === 'Loan Repayment').reduce((sum, t) => sum + Number(t.amount), 0);

        doc.fontSize(10).fillColor('#666666')
           .text(`Summary: ${individualTransactions.length} transactions | Credits: TSh ${totalCredits.toLocaleString()} | Debits: TSh ${totalDebits.toLocaleString()} | Net: TSh ${netBalance.toLocaleString()}`, doc.page.margins.left, doc.y, { width: doc.page.width - 100, align: 'left' });
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#7f8c8d')
           .text(`Breakdown: Contributions: TSh ${contributionTotal.toLocaleString()} | Refunds: TSh ${refundTotal.toLocaleString()} | Loan Repayments: TSh ${loanRepaymentTotal.toLocaleString()}`, doc.page.margins.left, doc.y, { width: doc.page.width - 100, align: 'left' });
        doc.moveDown(1.5);
        drawTransactionTable(individualTransactions, false, true);
      } else {
        doc.fontSize(12).fillColor('#666666').text('No transactions found for your account in the selected period.', doc.page.margins.left, doc.y, { align: 'center' });
      }
    } else {
      // Both statements
      addHeader('COMPREHENSIVE FINANCIAL STATEMENT', 'Overall and Individual Transaction Reports');
      if (overallTransactions.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#2c3e50').text('PART 1: OVERALL STATEMENT', doc.page.margins.left, doc.y);
        doc.moveDown(0.5);
        drawTransactionTable(overallTransactions, true);
      }
      if (individualTransactions.length > 0) {
        addFooter();
        doc.addPage();
        addHeader('COMPREHENSIVE FINANCIAL STATEMENT', 'PART 2: INDIVIDUAL STATEMENT', true);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#2c3e50').text('PART 2: INDIVIDUAL STATEMENT', doc.page.margins.left, doc.y);
        doc.moveDown(0.5);
        drawTransactionTable(individualTransactions, false, true);
      }
    }

    if (type === 'individual') addFooter(true);
    else addFooter();
    doc.end();
  } catch (err) {
    console.error('Error generating financial statement PDF:', err);
    req.flash('error', 'Unable to generate financial statement PDF');
    res.redirect('/financial-statement');
  }
});

module.exports = router;


