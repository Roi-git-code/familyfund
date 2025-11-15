
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

    // Fetch categories for the modal (id, key, name, percent)
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
      // important: pass categories for the modal (uses category.key and category.percent)
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
    // Accept both nested JSON { percentages: { investment: 12 } }
    // and flattened form keys like "percentages[investment]": "12"
    let percents = req.body.percentages || {};

    // If nothing found, parse flattened keys
    if (!percents || Object.keys(percents).length === 0) {
      percents = {};
      Object.keys(req.body || {}).forEach(k => {
        const m = k.match(/^percentages\[(.+)\]$/);
        if (m) {
          percents[m[1]] = req.body[k];
        }
      });
    }

    // Clean/validate numbers (whole numbers 0..100)
    const cleaned = {};
    Object.keys(percents).forEach(k => {
      const val = parseFloat(percents[k]);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        cleaned[k] = Math.round(val * 100) / 100; // keep up to 2 decimals if any
      }
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

/* ---------- PDF helpers and PDF routes unchanged (omitted here for brevity) ---------- */

// PDF helpers
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
    
    doc.fontSize(9).fillColor('gray');
    
    // Calculate widths
    const generatedText = `Generated: ${generatedOn}`;
    const generatedWidth = doc.widthOfString(generatedText);
    
    const uname = (username || 'User').toString();
    const printedByText = `Printed by ${uname}`;
    const printedByWidth = doc.widthOfString(printedByText);
    
    const pageLabel = `Page ${i + 1} of ${range.count}`;
    const pageLabelWidth = doc.widthOfString(pageLabel);
    
    // Calculate positions with proper spacing
    const totalContentWidth = generatedWidth + printedByWidth + pageLabelWidth;
    const availableSpace = usableWidth - totalContentWidth;
    const spacing = availableSpace / 2; // Equal space between elements
    
    // Position elements
    const generatedX = margin;
    const printedByX = margin + generatedWidth + spacing;
    const pageLabelX = margin + generatedWidth + printedByWidth + spacing * 2;
    
    // Draw text
    doc.text(generatedText, generatedX, bottom, { lineBreak: false });
    doc.text(printedByText, printedByX, bottom, { lineBreak: false });
    doc.text(pageLabel, pageLabelX, bottom, { lineBreak: false });
  }
}


function cur(n) { return new Intl.NumberFormat('en-US').format(Math.round(Number(n || 0))); }

// PDF: Overall Fund Summary (used by /funds/pdf?from=YYYY-MM&to=YYYY-MM)
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

function drawTransactionsTable(doc, transactions, totalAmountText) {
  const marginLeft = doc.page.margins.left;
  const marginRight = doc.page.margins.right;
  const topStart = doc.y + 10;
  const pageWidth = doc.page.width - marginLeft - marginRight;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  // Column definitions (must sum to ~1.0)
  const columns = [
    { key: 'trn',    label: 'TRN',           ratio: 0.18, align: 'left'  },
    { key: 'member', label: 'Member',        ratio: 0.37, align: 'left'  },
    { key: 'amount', label: 'Amount (TSh)',  ratio: 0.25, align: 'right' },
    { key: 'date',   label: 'Date',          ratio: 0.20, align: 'left'  },
  ];
  const colWidths = columns.map(c => Math.floor(pageWidth * c.ratio));
  // Fix rounding drift: set last col to fill remainder
  const sumWidths = colWidths.reduce((a,b)=>a+b,0);
  colWidths[colWidths.length - 1] += (pageWidth - sumWidths);

  const colX = [];
  let x = marginLeft;
  for (let i = 0; i < colWidths.length; i++) {
    colX.push(x);
    x += colWidths[i];
  }

  const rowHeight = 24;
  let y = topStart;

  function drawHeader() {
    // Header background
    doc.save();
    doc.rect(marginLeft, y, pageWidth, rowHeight).fill('#f2f6ff');
    doc.restore();

    doc.font('Helvetica-Bold').fontSize(11).fillColor('black');
    columns.forEach((col, i) => {
      doc.text(col.label, colX[i] + 4, y + 6, { width: colWidths[i] - 8, align: col.align });
    });

    // Bottom line of header
    doc.strokeColor('#9bb9ff').lineWidth(1)
      .moveTo(marginLeft, y + rowHeight)
      .lineTo(marginLeft + pageWidth, y + rowHeight)
      .stroke();

    y += rowHeight;
  }

  function ensurePageSpace() {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
  }

  // Draw initial header
  drawHeader();

  // Rows
  transactions.forEach((t, idx) => {
    ensurePageSpace();

    // Alternating row fill
    if (idx % 2 === 0) {
      doc.save();
      doc.fillColor('#f7f7f7').rect(marginLeft, y, pageWidth, rowHeight).fill();
      doc.restore();
    }

    const trn = t.txn_display_trn || `TRN ${idx + 1}-${t.id}`;
    const member = `${t.first_name || ''} ${t.sur_name || ''}`.trim();
    const amount = cur(t.amount);
    const date = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';

    const rowValues = { trn, member, amount, date };

    // Text cells
    doc.font('Helvetica').fontSize(10).fillColor('black');
    columns.forEach((col, i) => {
      doc.text(rowValues[col.key] || '', colX[i] + 4, y + 6, {
        width: colWidths[i] - 8,
        align: col.align
      });
    });

    // Cell borders (clear column boundaries)
    doc.strokeColor('#dddddd').lineWidth(0.5);
    columns.forEach((col, i) => {
      doc.rect(colX[i], y, colWidths[i], rowHeight).stroke();
    });

    y += rowHeight;
  });

  // Final bottom line for the table
  doc.strokeColor('#9bb9ff').lineWidth(1)
    .moveTo(marginLeft, y)
    .lineTo(marginLeft + pageWidth, y)
    .stroke();

  // Centered total text under the table
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('black')
    .text(totalAmountText, marginLeft, y + 8, { width: pageWidth, align: 'center' });

  // Advance cursor a bit for next content (if any)
  doc.moveDown(1.5);
}

// PDF: Single category (used by links in modals: /funds/:category/pdf)
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
      // Draw proportional table with clear column boundaries and centered total
      const totalText = `Total Transactions: TSh ${cur(c.transactionsTotal)}`;
      drawTransactionsTable(doc, c.transactions, totalText);
    }

    addFooter(doc, req.session.user?.username || req.session.user?.full_name);
    doc.end();
  } catch (err) {
    console.error('Error generating Category PDF:', err);
    req.flash('error', 'Failed to generate category PDF.');
    res.redirect('/fund-management');
  }
});

// GET: Financial Statement

function normalizeDateParams(req, res, next) {
  if (!req.query.from) req.query.from = 'all';
  if (!req.query.to) req.query.to = 'all';
  next();
}

// Enhanced Financial Statement route with monthly groupings
router.get('/financial-statement', requireAuth, validateDateParams, async (req, res) => {
  try {
    let { from, to, member_id } = req.query || {};
    if (!from) from = 'all';
    if (!to) to = 'all';

    const user = req.session.user || {};
    const sessionMemberId = user.member_id || user.member_Id || null;
    const isOfficial = ['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role);

    // Get transactions - NOW USING TRANSACTION-BASED DATA
    const individualTransactions = await fundSummaryModel.getFinancialTransactions(sessionMemberId, from, to);
    let overallTransactions = [];
    let membersList = [];
    
    if (isOfficial) {
      overallTransactions = await fundSummaryModel.getFinancialTransactions(member_id || null, from, to);
      membersList = await fundSummaryModel.getMembersList();
    }

    // Calculate totals
    const calculateTotals = (transactions) => {
      let credits = 0, debits = 0;
      transactions.forEach(t => {
        if (t.type === 'credit') credits += Number(t.amount);
        else debits += Number(t.amount);
      });
      return { credits, debits, net: credits - debits };
    };

    const overallTotals = calculateTotals(overallTransactions);
    const individualTotals = calculateTotals(individualTransactions);

    // Group transactions by month
    const groupByMonth = (transactions) => {
      const groups = {};
      let runningBalance = 0;
      
      // Sort transactions by date
      transactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      
      transactions.forEach(transaction => {
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
      individual: groupByMonth(individualTransactions)
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

    // Time range display
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
      individualTransactions,
      membersList,
      pdfQuery,
      timeRange,
      monthlyGroups,
      totalCredits: overallTotals.credits,
      totalDebits: overallTotals.debits,
      netBalance: overallTotals.net,
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

// Enhanced Professional Financial Statement PDF
router.get('/financial-statement/pdf', requireAuth, async (req, res) => {
  try {
    const { type, member_id, from, to } = req.query;
    const user = req.session.user || {};

    // Get transaction data - NOW USING TRANSACTION-BASED DATA
    const sessionMemberId = user.member_id || user.member_Id || null;
    const individualTransactions = await fundSummaryModel.getFinancialTransactions(sessionMemberId, from, to);
    let overallTransactions = [];
    
    if (['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role)) {
      overallTransactions = await fundSummaryModel.getFinancialTransactions(member_id || null, from, to);
    }

    // Sort transactions by date
    overallTransactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    individualTransactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Function to generate contribution ID in format: C-YYYY-MM-DD-ID
    const generateContribId = (transaction, memberId) => {
      const transactionDate = new Date(transaction.created_at);
      const year = transactionDate.getFullYear();
      const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
      const day = String(transactionDate.getDate()).padStart(2, '0');
      const memberIdToUse = memberId || transaction.member_id || '000';
      return `C-${year}-${month}-${day}-${memberIdToUse}`;
    };

    // Function to get full member name from user object
    const getFullMemberName = (user) => {
      const names = [];
      if (user.first_name) names.push(user.first_name);
      if (user.middle_name) names.push(user.middle_name);
      if (user.sur_name) names.push(user.sur_name);
      
      // If no names found, try username as fallback
      if (names.length === 0 && user.username) {
        names.push(user.username);
      }
      
      return names.join(' ').trim() || 'Member';
    };

    const fullMemberName = getFullMemberName(user);

    res.setHeader('Content-Type', 'application/pdf');
    
    // Increased margins for better readability
    const doc = new PDFDocument({ 
      margin: 50,
      size: "A4",
      bufferPages: true 
    });
    
    let filename = 'financial_statement';
    if (type === 'overall') filename = 'overall_financial_statement';
    else if (type === 'individual') filename = 'individual_financial_statement';
    
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    doc.pipe(res);

    // Add logo and header function
    const addHeader = (title, subtitle = '', showMemberName = false) => {
      const logoPath = path.join(__dirname, '../public/images/logo.png');
      
      // Calculate header height based on content
      let headerHeight = 100;
      if (showMemberName) headerHeight = 120;
      if (subtitle && !showMemberName) headerHeight = 110;
      
      // Header background
      doc.rect(0, 0, doc.page.width, headerHeight)
         .fill('#2c3e50');
      
      try {
        if (fs.existsSync(logoPath)) {
          // Logo respects left margin
          doc.image(logoPath, doc.page.margins.left, 25, { width: 50, height: 50 });
        }
      } catch (err) {
        console.log('Logo not found, proceeding without logo');
      }
      
      // Calculate vertical center position for main content
      const centerStartY = showMemberName ? 40 : 45;
      const contentWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
      
      // System name and title - respects margins
      doc.fontSize(16).font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('FAMILY FUND MANAGEMENT SYSTEM', doc.page.margins.left, centerStartY, { 
           width: contentWidth,
           align: 'center' 
         });
      
      doc.fontSize(12)
         .fillColor('#ffffff')
         .text('Financial Statement Report', doc.page.margins.left, centerStartY + 20, { 
           width: contentWidth,
           align: 'center' 
         });
      
      // Main title - respects margins
      doc.fontSize(18).font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text(title, doc.page.margins.left, centerStartY + 40, { 
           width: contentWidth,
           align: 'center' 
         });
      
      // Subtitle or member name - respects margins
      if (showMemberName) {
        doc.fontSize(14)
           .fillColor('#ffffff')
           .text(`Member: ${fullMemberName}`, doc.page.margins.left, centerStartY + 65, { 
             width: contentWidth,
             align: 'center' 
           });
      } else if (subtitle) {
        doc.fontSize(12)
           .fillColor('#ffffff')
           .text(subtitle, doc.page.margins.left, centerStartY + 65, { 
             width: contentWidth,
             align: 'center' 
           });
      }
      
      // Period information - respects margins
      const timeRange = formatTimeRange(from, to);
      const periodStartY = centerStartY + 15;
      
      doc.fontSize(8)
         .fillColor('#ffffff')
         .text(`Period: ${timeRange}`, doc.page.margins.left, periodStartY, { 
           width: contentWidth,
           align: 'right' 
         })
         .text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, doc.page.margins.left, periodStartY + 12, { 
           width: contentWidth,
           align: 'right' 
         });
      
      if (showMemberName) {
        doc.text(`Member ID: ${sessionMemberId || 'N/A'}`, doc.page.margins.left, periodStartY + 24, { 
          width: contentWidth,
          align: 'right' 
        });
      }
      
      // Move cursor below the header
      doc.y = headerHeight + 20;
    };

    // Professional footer function
    const addFooter = (showMemberName = false) => {
      const pageNumber = doc.bufferedPageRange().count;
      const bottomY = doc.page.height - 50;
      const contentWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
      
      // Footer separator line - respects margins
      doc.moveTo(doc.page.margins.left, bottomY - 20)
         .lineTo(doc.page.width - doc.page.margins.right, bottomY - 20)
         .strokeColor('#cccccc')
         .lineWidth(1)
         .stroke();
      
      // Footer content - respects margins
      doc.fontSize(8)
         .fillColor('#666666');
      
      const footerText = showMemberName ? 
        `Family Fund Management System - ${fullMemberName}` : 
        'Family Fund Management System - Confidential';
      
      // Left-aligned text
      doc.text(footerText, doc.page.margins.left, bottomY - 15, { align: 'left' });
      
      // Center-aligned text
      doc.text(`Generated by: ${fullMemberName}`, doc.page.margins.left, bottomY - 15, { 
        width: contentWidth,
        align: 'center' 
      });
      
      // Right-aligned text
      doc.text(`Page ${doc.bufferedPageRange().count} of ${pageNumber}`, doc.page.margins.left, bottomY - 15, { 
        width: contentWidth,
        align: 'right' 
      });
    };

    // Enhanced table drawing function with margin-respecting positioning
    const drawTransactionTable = (transactions, isOverall = false, showMemberName = false) => {
      const startY = doc.y;
      const tableTop = startY + 10;
      
      // Define column widths based on content type
      const baseColumns = [
        { key: 'number', label: '#', width: 25, align: 'center' },
        { key: 'date', label: 'Date', width: 65, align: 'left' },
        { key: 'trn', label: 'TRN ID', width: 90, align: 'left' },
        { key: 'description', label: 'Description', width: isOverall ? 100 : 150, align: 'left' },
        { key: 'credit', label: 'Credit (TSh)', width: 75, align: 'right' },
        { key: 'debit', label: 'Debit (TSh)', width: 75, align: 'right' },
        { key: 'balance', label: 'Balance (TSh)', width: 85, align: 'right' }
      ];

      if (isOverall) {
        // Insert member column for overall statements
        baseColumns.splice(3, 0, { key: 'member', label: 'Member', width: 90, align: 'left' });
      }

      // Calculate total table width respecting margins
      const totalWidth = baseColumns.reduce((sum, col) => sum + col.width, 0);
      const maxAllowedWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);
      
      // Scale table if it exceeds available width
      let scaleFactor = 1;
      if (totalWidth > maxAllowedWidth) {
        scaleFactor = maxAllowedWidth / totalWidth;
        baseColumns.forEach(col => {
          col.width = Math.floor(col.width * scaleFactor);
        });
      }
      
      const adjustedTotalWidth = baseColumns.reduce((sum, col) => sum + col.width, 0);
      const startX = doc.page.margins.left + (maxAllowedWidth - adjustedTotalWidth) / 2;

      let y = tableTop;
      let runningBalance = 0;

      // Draw table header
      doc.fontSize(9).font('Helvetica-Bold');
      
      let x = startX;
      baseColumns.forEach(col => {
        // Header background
        doc.rect(x, y, col.width, 22)
           .fill('#34495e');
        
        // Header text
        doc.fillColor('#ffffff')
           .text(col.label, x + 5, y + 8, { 
             width: col.width - 10, 
             align: col.align 
           });
        
        // Header border
        doc.rect(x, y, col.width, 22)
           .strokeColor('#2c3e50')
           .lineWidth(1)
           .stroke();
        
        x += col.width;
      });

      y += 22;

      // Draw table rows
      doc.fontSize(8).font('Helvetica');
      
      transactions.forEach((transaction, index) => {
        // Check for page break - respects bottom margin
        if (y > doc.page.height - doc.page.margins.bottom - 30) {
          addFooter(showMemberName);
          doc.addPage();
          
          // Redraw headers on new page
          if (showMemberName) {
            addHeader('INDIVIDUAL FINANCIAL STATEMENT', '', true);
          } else {
            addHeader(
              isOverall ? 'Overall Financial Statement' : 'Individual Financial Statement',
              'Continued...'
            );
          }
          
          // Redraw table headers on new page
          y = doc.y + 10;
          x = startX;
          doc.fontSize(9).font('Helvetica-Bold');
          baseColumns.forEach(col => {
            doc.rect(x, y, col.width, 22)
               .fill('#34495e');
            doc.fillColor('#ffffff')
               .text(col.label, x + 5, y + 8, { 
                 width: col.width - 10, 
                 align: col.align 
               });
            doc.rect(x, y, col.width, 22)
               .strokeColor('#2c3e50')
               .lineWidth(1)
               .stroke();
            x += col.width;
          });
          y += 22;
          doc.fontSize(8).font('Helvetica');
        }

        // Alternate row background
        const isEvenRow = index % 2 === 0;
        if (isEvenRow) {
          x = startX;
          baseColumns.forEach(col => {
            doc.rect(x, y, col.width, 18)
               .fill('#f8f9fa');
            x += col.width;
          });
        }

        // Calculate running balance
        runningBalance += (transaction.type === 'credit' ? Number(transaction.amount) : -Number(transaction.amount));

        // Generate transaction ID - NOW USING REAL TRANSACTION DATES
        let transactionId;
        if (transaction.txn_trn) {
          transactionId = transaction.txn_trn;
        } else {
          // For contributions, use real transaction date in the ID
          const transactionDate = new Date(transaction.created_at);
          const year = transactionDate.getFullYear();
          const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
          const day = String(transactionDate.getDate()).padStart(2, '0');
          
          if (isOverall) {
            transactionId = `C-${year}-${month}-${day}-${transaction.member_id}`;
          } else {
            transactionId = `C-${year}-${month}-${day}-${sessionMemberId}`;
          }
        }

        // Prepare row data
        const rowData = {
          number: (index + 1).toString(),
          date: new Date(transaction.created_at).toLocaleDateString('en-GB'),
          trn: transactionId,
          description: `${transaction.request_type} ${transaction.type === 'credit' ? '(CR)' : '(DR)'}`,
          credit: transaction.type === 'credit' ? Number(transaction.amount).toLocaleString() : '-',
          debit: transaction.type === 'debit' ? Number(transaction.amount).toLocaleString() : '-',
          balance: runningBalance.toLocaleString(),
          member: isOverall ? `${transaction.first_name} ${transaction.sur_name}`.substring(0, 20) : ''
        };

        // Draw row cells
        x = startX;
        baseColumns.forEach(col => {
          const value = rowData[col.key];
          
          // Set text color based on column type
          if (col.key === 'credit' && value !== '-') {
            doc.fillColor('#27ae60');
          } else if (col.key === 'debit' && value !== '-') {
            doc.fillColor('#e74c3c');
          } else if (col.key === 'balance') {
            doc.fillColor('#2c3e50');
          } else {
            doc.fillColor('#000000');
          }

          doc.text(value || '', x + 5, y + 6, { 
            width: col.width - 10, 
            align: col.align 
          });

          // Cell border
          doc.rect(x, y, col.width, 18)
             .strokeColor(isEvenRow ? '#e9ecef' : '#ffffff')
             .lineWidth(0.5)
             .stroke();

          x += col.width;
        });

        y += 18;
      });

      // Draw closing balance
      y += 10;
      const balanceWidth = baseColumns.slice(-3).reduce((sum, col) => sum + col.width, 0);
      const balanceX = startX + adjustedTotalWidth - balanceWidth;
      
      doc.rect(balanceX, y, balanceWidth, 25)
         .fill('#2c3e50');
      
      doc.fontSize(10).font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text(`Closing Balance: TSh ${runningBalance.toLocaleString()}`, 
               balanceX, y + 8, 
               { width: balanceWidth, align: 'center' });

      doc.y = y + 40;
    };

    // Generate PDF content based on type - ALL CONTENT RESPECTS MARGINS
    const contentWidth = doc.page.width - (doc.page.margins.left + doc.page.margins.right);

    if (type === 'overall') {
      addHeader('OVERALL FINANCIAL STATEMENT', 'Complete transaction history for all members');
      if (overallTransactions.length > 0) {
        // Add summary statistics - respects margins
        const totalCredits = overallTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + Number(t.amount), 0);
        const totalDebits = overallTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + Number(t.amount), 0);
        const netBalance = totalCredits - totalDebits;
        
        doc.fontSize(10)
           .fillColor('#666666')
           .text(`Summary: ${overallTransactions.length} transactions | Credits: TSh ${totalCredits.toLocaleString()} | Debits: TSh ${totalDebits.toLocaleString()} | Net: TSh ${netBalance.toLocaleString()}`, 
                 doc.page.margins.left, doc.y, { 
                   width: contentWidth,
                   align: 'left' 
                 });
        
        doc.moveDown(1.5);
        
        drawTransactionTable(overallTransactions, true);
      } else {
        doc.fontSize(12)
           .fillColor('#666666')
           .text('No transactions found for the selected period.', 
                 doc.page.margins.left, doc.y, { 
                   width: contentWidth,
                   align: 'center' 
                 });
      }
    } else if (type === 'individual') {
      addHeader('INDIVIDUAL FINANCIAL STATEMENT', '', true);
      
      if (individualTransactions.length > 0) {
        // Add summary statistics - respects margins
        const totalCredits = individualTransactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + Number(t.amount), 0);
        const totalDebits = individualTransactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + Number(t.amount), 0);
        const netBalance = totalCredits - totalDebits;
        
        doc.fontSize(10)
           .fillColor('#666666')
           .text(`Summary: ${individualTransactions.length} transactions | Credits: TSh ${totalCredits.toLocaleString()} | Debits: TSh ${totalDebits.toLocaleString()} | Net: TSh ${netBalance.toLocaleString()}`, 
                 doc.page.margins.left, doc.y, { 
                   width: contentWidth,
                   align: 'left' 
                 });
        
        doc.moveDown(1.5);
        
        drawTransactionTable(individualTransactions, false, true);
      } else {
        doc.fontSize(12)
           .fillColor('#666666')
           .text('No transactions found for your account in the selected period.', 
                 doc.page.margins.left, doc.y, { 
                   width: contentWidth,
                   align: 'center' 
                 });
      }
    } else {
      // Both statements
      addHeader('COMPREHENSIVE FINANCIAL STATEMENT', 'Overall and Individual Transaction Reports');
      
      if (overallTransactions.length > 0) {
        // Section title respects margins
        doc.fontSize(12).font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text('PART 1: OVERALL STATEMENT', doc.page.margins.left, doc.y);
        
        doc.moveDown(0.5);
        drawTransactionTable(overallTransactions, true);
      }

      if (individualTransactions.length > 0) {
        // Add new page for individual statement
        addFooter();
        doc.addPage();
        
        addHeader('COMPREHENSIVE FINANCIAL STATEMENT', 'PART 2: INDIVIDUAL STATEMENT', true);
        
        // Section title respects margins
        doc.fontSize(12).font('Helvetica-Bold')
           .fillColor('#2c3e50')
           .text('PART 2: INDIVIDUAL STATEMENT', doc.page.margins.left, doc.y);
        
        doc.moveDown(0.5);
        drawTransactionTable(individualTransactions, false, true);
      }
    }

    // Add final footer
    if (type === 'individual') {
      addFooter(true);
    } else {
      addFooter();
    }

    doc.end();
  } catch (err) {
    console.error('Error generating financial statement PDF:', err);
    req.flash('error', 'Unable to generate financial statement PDF');
    res.redirect('/financial-statement');
  }
});

module.exports = router;


