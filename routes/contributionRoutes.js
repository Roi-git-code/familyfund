

const express = require('express');
const router = express.Router();
const fs = require('fs');
const multer = require('multer');
const { parse } = require('csv-parse');
const contributionModel = require('../models/contributionModel');
const { requireRole } = require('../middleware/authMiddleware');
const upload = multer({ dest: 'uploads/' });
const PDFDocument = require('pdfkit');
const path = require('path');

// ----------------------------------------
// Shared constants/utilities
// ----------------------------------------
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function monthNumToYYYYMM(year, monthNum) {
  const mm = String(monthNum).padStart(2, '0');
  return `${year}-${mm}`;
}

function monthNameToNumber(monthName) {
  const index = MONTHS.indexOf(monthName.toLowerCase());
  return index >= 0 ? index + 1 : 1;
}

// Make a nice subtitle for PDFs based on filters
function buildReportSubtitle({ membersById, selectedMember, selectedYear, from, to }) {
  const parts = [];

  // Member scope
  if (selectedMember) {
    const m = membersById.get(Number(selectedMember));
    const name = m ? `${m.first_name} ${m.sur_name}` : `Member #${selectedMember}`;
    parts.push(`Member: ${name}`);
  } else {
    parts.push('All Members');
  }

  // Time scope
  if (from && to) {
    parts.push(`From ${from} To ${to}`);
  } else if (selectedYear) {
    parts.push(`Year: ${selectedYear}`);
  } else {
    parts.push('All Time');
  }

  return parts.join(' — ');
}

// Convert transactions to monthly entries for backward compatibility
function transactionsToMonthlyEntries(transactions) {
  const monthlyData = {};
  
  transactions.forEach(transaction => {
    const key = `${transaction.member_id}-${transaction.year}`;
    if (!monthlyData[key]) {
      monthlyData[key] = {
        member_id: transaction.member_id,
        first_name: transaction.first_name,
        middle_name: transaction.middle_name,
        sur_name: transaction.sur_name,
        year: transaction.year,
        jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
        jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
        total_year: 0
      };
    }
    
    // Add amount to the appropriate month
    if (transaction.month && MONTHS.includes(transaction.month)) {
      monthlyData[key][transaction.month] += parseFloat(transaction.amount);
      monthlyData[key].total_year += parseFloat(transaction.amount);
    }
  });
  
  return Object.values(monthlyData);
}

// Filter transactions based on query parameters
function filterTransactions(transactions, { selectedMember, selectedYear, from, to }) {
  let filtered = transactions;

  if (selectedMember) {
    const memberId = parseInt(selectedMember);
    filtered = filtered.filter(t => t.member_id === memberId);
  }

  if (selectedYear) {
    const year = parseInt(selectedYear);
    filtered = filtered.filter(t => t.year === year);
  }

  if (from) {
    filtered = filtered.filter(t => t.transaction_date >= from);
  }

  if (to) {
    filtered = filtered.filter(t => t.transaction_date <= to);
  }

  return filtered;
}

// Build summary (per member totals + percentages) from transactions
function buildSummaryFromTransactions(transactions) {
  const perMember = new Map();
  let allTotal = 0;

  // Calculate totals per member
  transactions.forEach(transaction => {
    const current = perMember.get(transaction.member_id) || 0;
    const amount = parseFloat(transaction.amount);
    perMember.set(transaction.member_id, current + amount);
    allTotal += amount;
  });

  // Get unique members with their details
  const memberMap = new Map();
  transactions.forEach(transaction => {
    if (!memberMap.has(transaction.member_id)) {
      memberMap.set(transaction.member_id, {
        member_id: transaction.member_id,
        full_name: `${transaction.first_name} ${transaction.middle_name || ''} ${transaction.sur_name}`.replace(/\s+/g,' ').trim()
      });
    }
  });

  const members = Array.from(memberMap.values()).map(member => {
    const total = Number(perMember.get(member.member_id) || 0);
    const maxContribution = Math.max(...Array.from(perMember.values()));
    const color = colorForContribution(total, maxContribution);

    return {
      ...member,
      total_contribution: total,
      percentageOfAll: allTotal ? Number(((total / allTotal) * 100).toFixed(2)) : 0,
      color
    };
  }).sort((a, b) => b.total_contribution - a.total_contribution);

  return { members, totalAll: allTotal };
}

// Build monthly total summary from transactions
function buildMonthlySummaryFromTransactions(transactions) {
  const monthlySummary = {};
  MONTHS.forEach(m => monthlySummary[m] = 0);
  
  transactions.forEach(transaction => {
    if (transaction.month && MONTHS.includes(transaction.month)) {
      monthlySummary[transaction.month] += parseFloat(transaction.amount);
    }
  });
  
  return monthlySummary;
}

// Calculate member lifetime totals from transactions
function calculateMemberTotals(transactions) {
  const memberTotals = {};
  transactions.forEach(transaction => {
    const memberId = transaction.member_id;
    memberTotals[memberId] = (memberTotals[memberId] || 0) + parseFloat(transaction.amount);
  });
  return memberTotals;
}

/**
 * Assigns a color based on contribution relative to the max.
 */
function colorForContribution(contribution, maxContribution) {
  if (maxContribution === 0) return "gray";
  
  const percentage = (contribution / maxContribution) * 100;

  if (percentage >= 100) {
    return "darkgreen";
  } else if (percentage >= 75) {
    return "lightgreen";
  } else if (percentage >= 50) {
    return "lightblue";
  } else if (percentage >= 25) {
    return "yellow";
  } else {
    return "red";
  }
}

// ----------------------------------------
// Routes
// ----------------------------------------

// Enhanced Update contribution route - preserves transaction history
router.post('/update/:member_id/:year/:month', async (req, res) => {
  const member_id = parseInt(req.params.member_id);
  const year = parseInt(req.params.year);
  const month = req.params.month;
  const { amount } = req.body;

  try {
    console.log(`🔄 Processing update: member=${member_id}, year=${year}, month=${month}, amount=${amount}`);
    
    // Perform the update
    await contributionModel.updateContribution({ member_id, year, month, amount });
    
    req.flash('success', `Contribution updated successfully!`);
    res.redirect('/contributions');
  } catch (err) {
    console.error('❌ Update error:', err);
    req.flash('error', err.message || 'Error updating contribution');
    res.redirect('/contributions');
  }
});

// GET contribution form
router.get('/form', requireRole('chief_signatory'), (req, res) => {
  const formData = req.session.formData || {};
  req.session.formData = null;
  res.render('contribution-form', { formData });
});

// GET transactions view
router.get('/transactions', async (req, res) => {
  try {
    const filters = {
      member_id: req.query.member_id,
      year: req.query.year,
      from: req.query.from,
      to: req.query.to
    };

    const transactions = await contributionModel.getTransactions(filters);
    const members = await contributionModel.getAllMembers();
    
    // Get distinct years from transactions
    const years = [...new Set(transactions.map(t => t.year))].sort((a, b) => b - a);

    res.render('transaction-details', {
      user: req.session.user,
      transactions,
      members,
      years,
      filters,
      selectedMember: filters.member_id || '',
      selectedYear: filters.year || '',
      from: filters.from || '',
      to: filters.to || '',
      activePage: 'transactions'
    });
  } catch (error) {
    console.error('Error loading transactions:', error);
    req.flash('error', 'Failed to load transactions');
    res.redirect('/contributions');
  }
});

// GET monthly transactions details
router.get('/monthly-transactions/:member_id/:year/:month', async (req, res) => {
  try {
    const { member_id, year, month } = req.params;
    const transactions = await contributionModel.getMonthlyTransactions(member_id, year, month);
    const members = await contributionModel.getAllMembers();
    const currentMember = members.find(m => m.id == member_id);

    if (!currentMember) {
      req.flash('error', 'Member not found');
      return res.redirect('/contributions');
    }

    const monthTotal = transactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);

    res.render('monthly-transactions', {
      user: req.session.user,
      transactions,
      member: currentMember,
      year,
      month,
      monthTotal,
      activePage: 'transactions'
    });
  } catch (error) {
    console.error('Error loading monthly transactions:', error);
    req.flash('error', 'Failed to load monthly transactions');
    res.redirect('/contributions');
  }
});

// GET contribution edit form
router.get('/edit/:member_id/:year', async (req, res) => {
  try {
    const { member_id, year } = req.params;
    const contribution = await contributionModel.getContributionById(member_id, year);
    if (!contribution) {
      req.flash('error', 'Contribution not found');
      return res.redirect('/contributions');
    }

    contribution.month = 'jan';

    res.render('contributionEditing-form', {
      contribution,
      user: req.session.user,
      editMode: true
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error loading contribution for editing');
    return res.redirect('/contributions');
  }
});

// Add contribution - USES CURRENT DATE
router.post('/add', async (req, res) => {
  const { member_id, year, month, amount } = req.body;
  
  try {
    req.session.formData = req.body;
    
    // Always use current date on server side
    const transaction_date = new Date().toISOString().split('T')[0];
    
    await contributionModel.addContributionTransaction({
      member_id,
      amount,
      transaction_date
    });
    
    req.session.formData = null;
    req.flash('success', 'Contribution added successfully!');
    
    // Check if this is coming from payment approval
    if (req.headers.referer && req.headers.referer.includes('/payments/history')) {
      return res.redirect('/payments/history?view=all');
    }
    
    res.redirect('/contributions/form');
  } catch (err) {
    console.error(err);
    req.flash('error', err.message || 'Error saving contribution');
    
    // Check if this is coming from payment approval
    if (req.headers.referer && req.headers.referer.includes('/payments/history')) {
      return res.redirect('/payments/history?view=all');
    }
    
    res.redirect('/contributions/form');
  }
});

// Add transaction with specific date
router.post('/add-transaction', async (req, res) => {
  const { member_id, amount, transaction_date } = req.body;
  
  try {
    await contributionModel.addContributionTransaction({
      member_id,
      amount,
      transaction_date
    });
    
    req.flash('success', 'Transaction added successfully!');
    res.redirect('/contributions/transactions');
  } catch (err) {
    console.error(err);
    req.flash('error', err.message || 'Error adding transaction');
    res.redirect('/contributions/transactions');
  }
});

// Main view (both tables) with filters
router.get('/', async (req, res) => {
  try {
    // Get all transactions with member details
    const allTransactions = await contributionModel.getTransactions();
    const members = await contributionModel.getAllMembers();

    // Make a quick map for names -> id
    const membersById = new Map(members.map(m => [m.id, m]));

    // Distinct years from transactions
    const years = [...new Set(allTransactions.map(t => t.year))].sort((a, b) => b - a);

    // Filters
    const { year: selectedYear, from, to, member_id: selectedMember } = req.query;

    // Build filtered dataset
    const filteredTransactions = filterTransactions(allTransactions, { 
      selectedMember, 
      selectedYear, 
      from, 
      to 
    });

    // Convert to monthly format for backward compatibility with UI
    const rows = transactionsToMonthlyEntries(filteredTransactions);

    // Calculate lifetime totals
    const memberTotals = calculateMemberTotals(filteredTransactions);

    // Monthly summary
    const monthlySummary = buildMonthlySummaryFromTransactions(filteredTransactions);

    // Summary table
    const summaryData = buildSummaryFromTransactions(filteredTransactions);

    // For chart data (using the monthly rows)
    const rowsData = rows;

    // Build filter summary string for UI
    let filterSummary = 'Showing all contributions';
    if (from || to || selectedMember || selectedYear) {
      filterSummary = 'Showing contributions ';
      if (selectedMember) {
        const m = members.find(mem => mem.id == selectedMember);
        if (m) filterSummary += `for ${m.first_name} ${m.middle_name || ''} ${m.sur_name} `;
      }
      if (from && to) {
        filterSummary += `from ${from} to ${to}`;
      } else if (from) {
        filterSummary += `from ${from}`;
      } else if (to) {
        filterSummary += `up to ${to}`;
      } else if (selectedYear) {
        filterSummary += `for year ${selectedYear}`;
      }
    }

    res.render('contributions', {
      user: req.session.user,
      rows,
      years,
      members,
      selectedYear: selectedYear ? parseInt(selectedYear) : '',
      selectedMember: selectedMember ? parseInt(selectedMember) : '',
      from: from || '',
      to: to || '',
      monthlySummary,
      memberTotals,
      rowsData,
      summaryData,
      filterSummary
    });

  } catch (error) {
    console.error('Error loading contributions:', error);
    req.flash('error', 'Failed to load contributions');
    res.redirect('/');
  }
});

// Import CSV - supports both old and new formats
router.post('/import', upload.single('csvfile'), async (req, res) => {
  const csvPath = req.file.path;
  const parser = parse({ columns: true, trim: true });

  const stream = fs.createReadStream(csvPath).pipe(parser);

  try {
    for await (const row of stream) {
      // Support both old format (member_id, year, month, amount) 
      // and new format (member_id, amount, transaction_date)
      if (row.transaction_date) {
        await contributionModel.addContributionTransaction({
          member_id: parseInt(row.member_id),
          amount: parseFloat(row.amount),
          transaction_date: row.transaction_date
        });
      } else {
        // Use current date for old format imports
        const transaction_date = new Date().toISOString().split('T')[0];
        await contributionModel.addContributionTransaction({
          member_id: parseInt(row.member_id),
          amount: parseFloat(row.amount),
          transaction_date
        });
      }
    }
    fs.unlinkSync(csvPath);
    req.flash('success', 'CSV imported successfully!');
    res.redirect('/contributions');
  } catch (err) {
    console.error('CSV import failed:', err);
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    req.flash('error', 'CSV import failed: ' + err.message);
    res.redirect('/contributions');
  }
});

// ----------- PDF helpers -----------
function drawTableHeader(doc, headers, colWidths, startX, y, rowHeight) {
  doc.font('Helvetica-Bold').fontSize(11);
  headers.forEach((h, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke('#eeeeee', 'black');
    doc.fillColor('black').text(h, x + 3, y + 5, {
      width: colWidths[i] - 6,
      align: 'center',
      ellipsis: true,
    });
  });
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

function addContributionTable(doc, headers, rows, rowHeight = 18) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const memberW = 160;
  const yearW   = 45;
  const totalW  = 70;
  const months  = 12;
  const monthW  = Math.floor((pageWidth - (memberW + yearW + totalW)) / months);
  const colWidths = [memberW, yearW, ...Array(months).fill(monthW), totalW];
  renderTable(doc, headers, rows, colWidths, rowHeight);
}

function addContributionSummaryTable(doc, headers, rows, rowHeight = 18) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const memberW = 220;
  const otherCols = headers.length - 1;
  const otherW = Math.floor((pageWidth - memberW) / otherCols);
  const colWidths = [memberW, ...Array(otherCols).fill(otherW)];
  renderTable(doc, headers, rows, colWidths, rowHeight);
}

// Footer (Page X of Y + username + generated date)
function addFooter(doc, username) {
  const range = doc.bufferedPageRange();
  const generatedOn = new Date().toLocaleString();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 30;
    const margin = doc.page.margins.left;
    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - margin * 2;
    const leftX   = margin;
    const centerX = margin + usableWidth / 2;
    const rightX  = margin + usableWidth;

    doc.fontSize(9).fillColor('gray');
    doc.text(`Generated: ${generatedOn}`, leftX, bottom, { lineBreak: false });

    const uname = username || 'User';
    const unameWidth = doc.widthOfString(uname);
    doc.text('Printed by ' + uname, centerX - unameWidth / 2, bottom, { lineBreak: false });

    const pageLabel = `Page ${i + 1} of ${range.count}`;
    const pageLabelWidth = doc.widthOfString(pageLabel);
    doc.text(pageLabel, rightX - pageLabelWidth, bottom, { lineBreak: false });
  }
}

// ---------------- Member Contributions PDF ----------------
router.get('/download/contributions/pdf', async (req, res) => {
  try {
    const allTransactions = await contributionModel.getTransactions();
    const allMembers = await contributionModel.getAllMembers();
    const membersById = new Map(allMembers.map(m => [m.id, m]));

    const { member_id: selectedMember, year: selectedYear, from, to } = req.query;

    const filteredTransactions = filterTransactions(allTransactions, { 
      selectedMember, 
      selectedYear, 
      from, 
      to 
    });
    
    const rows = transactionsToMonthlyEntries(filteredTransactions);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Member_Contributions.pdf"`);

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      bufferPages: true,
      margins: { top: 50, bottom: 50, left: 30, right: 10 }
    });
    doc.pipe(res);

    // Header
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 45, { width: 50 });
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);

    const subtitle = buildReportSubtitle({ membersById, selectedMember, selectedYear, from, to });
    doc.fontSize(16).text(`Members Contribution Report — ${subtitle}`, { underline: true });
    doc.moveDown();

    const headers = ['Member','Year','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','TotalYear'];
    const tableRows = rows.map(r => [
      `${r.first_name} ${r.middle_name || ''} ${r.sur_name}`.replace(/\s+/g,' ').trim(),
      r.year,
      r.jan, r.feb, r.mar, r.apr, r.may, r.jun,
      r.jul, r.aug, r.sep, r.oct, r.nov, r.dec,
      Number(r.total_year).toFixed(2)
    ]);

    addContributionTable(doc, headers, tableRows);
    addFooter(doc, req.session?.user?.username);
    doc.end();
  } catch (err) {
    console.error('Error generating contributions PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/contributions');
  }
});

// ---------------- Contribution Summary PDF ----------------
router.get('/download/summary/pdf', async (req, res) => {
  try {
    const allTransactions = await contributionModel.getTransactions();
    const allMembers = await contributionModel.getAllMembers();
    const membersById = new Map(allMembers.map(m => [m.id, m]));

    const { member_id: selectedMember, year: selectedYear, from, to } = req.query;

    const filteredTransactions = filterTransactions(allTransactions, { 
      selectedMember, 
      selectedYear, 
      from, 
      to 
    });
    
    const summary = buildSummaryFromTransactions(filteredTransactions);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Contribution_Summary.pdf"`);

    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 50, bottom: 50, left: 30, right: 10 }
    });
    doc.pipe(res);

    // Header
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 45, { width: 50 });
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);

    const subtitle = buildReportSubtitle({ membersById, selectedMember, selectedYear, from, to });
    doc.fontSize(16).text(`Contribution Summary Report — ${subtitle}`, { underline: true });
    doc.moveDown();

    const headers = ['Member', 'Total Contribution (TSh)', '% of All Contributions'];
    const tableRows = summary.members.map(m => [
      m.full_name,
      Number(m.total_contribution).toLocaleString(),
      `${m.percentageOfAll}%`
    ]);

    addContributionSummaryTable(doc, headers, tableRows);
    addFooter(doc, req.session?.user?.username);
    doc.end();
  } catch (err) {
    console.error('Error generating summary PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/contributions');
  }
});

// ---------------- Transactions PDF export ----------------
router.get('/download/transactions/pdf', async (req, res) => {
  try {
    const filters = {
      member_id: req.query.member_id,
      year: req.query.year,
      from: req.query.from,
      to: req.query.to
    };

    const transactions = await contributionModel.getTransactions(filters);
    const allMembers = await contributionModel.getAllMembers();
    const membersById = new Map(allMembers.map(m => [m.id, m]));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Transaction_Details.pdf"`);

    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 50, bottom: 50, left: 30, right: 10 }
    });
    doc.pipe(res);

    // Header
    const logoPath = path.join(__dirname, '../public/images/logo.png');
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 45, { width: 50 });
    doc.fontSize(18).text('Family Fund Management System', 110, 57, { align: 'left' });
    doc.moveDown(2);

    const subtitle = buildReportSubtitle({ membersById, ...filters });
    doc.fontSize(16).text(`Transaction Details — ${subtitle}`, { underline: true });
    doc.moveDown();

    const headers = ['Date', 'Member', 'Amount (TSh)', 'Month', 'Year'];
    const tableRows = transactions.map(t => [
      new Date(t.transaction_date).toLocaleDateString(),
      `${t.first_name} ${t.middle_name || ''} ${t.sur_name}`.replace(/\s+/g,' ').trim(),
      Number(t.amount).toLocaleString(),
      t.month.toUpperCase(),
      t.year
    ]);

    addContributionSummaryTable(doc, headers, tableRows);
    addFooter(doc, req.session?.user?.username);
    doc.end();
  } catch (err) {
    console.error('Error generating transactions PDF:', err);
    req.flash('error', 'Failed to generate PDF.');
    res.redirect('/contributions/transactions');
  }
});

module.exports = router;


