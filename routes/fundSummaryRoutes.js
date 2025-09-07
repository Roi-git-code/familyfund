
// routes/fundSummaryRoutes.js
const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');
const fundSummaryModel = require('../models/fundSummaryModel');
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
    const leftX = margin;
    const centerX = margin + usableWidth / 2;
    const rightX = margin + usableWidth;
    doc.fontSize(9).fillColor('gray');
    doc.text(`Generated: ${generatedOn}`, leftX, bottom, { lineBreak: false });
    const uname = (username || 'User').toString();
    const unameWidth = doc.widthOfString(uname);
    doc.text('Printed by ' + uname, centerX - unameWidth / 2, bottom, { lineBreak: false });
    const pageLabel = `Page ${i + 1} of ${range.count}`;
    const pageLabelWidth = doc.widthOfString(pageLabel);
    doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
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

module.exports = router;
