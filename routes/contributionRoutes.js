const express = require('express');
const router = express.Router();
const fs = require('fs');
const multer = require('multer');
const { parse } = require('csv-parse');              // ✅ correct import style
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
  // monthNum: 1-12
  const mm = String(monthNum).padStart(2, '0');
  return `${year}/${mm}`;
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
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    parts.push(`From ${monthNumToYYYYMM(fy, fm)} To ${monthNumToYYYYMM(ty, tm)}`);
  } else if (selectedYear) {
    parts.push(`Year: ${selectedYear}`);
  } else {
    parts.push('All Time');
  }

  return parts.join(' — ');
}

// Flatten all contributions to month-level entries
function toMonthEntries(allContributions) {
  const out = [];
  for (const row of allContributions) {
    MONTHS.forEach((m, idx) => {
      out.push({
        member_id: row.member_id,
        first_name: row.first_name,
        middle_name: row.middle_name,
        sur_name: row.sur_name,
        year: row.year,
        month: m,
        monthNum: idx + 1,
        amount: Number(row[m] || 0),
      });
    });
  }
  return out;
}

// Apply filters (member, year, from-to) to month entries
function filterMonthEntries(entries, { selectedMember, selectedYear, from, to }) {
  let data = entries;

  if (selectedMember) {
    const id = parseInt(selectedMember);
    data = data.filter(e => e.member_id === id);
  }

  if (selectedYear) {
    const y = parseInt(selectedYear);
    data = data.filter(e => e.year === y);
  }

  if (from && to) {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    data = data.filter(e =>
      (e.year > fy || (e.year === fy && e.monthNum >= fm)) &&
      (e.year < ty || (e.year === ty && e.monthNum <= tm))
    );
  }

  return data;
}

// Group filtered months back to rows (member-year)
function groupToRows(filteredMonths) {
  const grouped = {};
  for (const e of filteredMonths) {
    const key = `${e.member_id}-${e.year}`;
    if (!grouped[key]) {
      grouped[key] = {
        member_id: e.member_id,
        first_name: e.first_name,
        middle_name: e.middle_name,
        sur_name: e.sur_name,
        year: e.year,
        jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
        jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
        total_year: 0
      };
    }
    grouped[key][e.month] += e.amount;
    grouped[key].total_year += e.amount;
  }

  const rows = Object.values(grouped).sort((a, b) => {
    if (a.member_id === b.member_id) return a.year - b.year;
    return a.member_id - b.member_id;
  });

  return rows;
}



/**
 * Assigns a color based on contribution relative to the max.
 * @param {number} contribution - The member’s contribution
 * @param {number} maxContribution - The highest contribution among all members
 * @returns {string} - A color name (or hex)
 */
function colorForContribution(contribution, maxContribution) {
  if (maxContribution === 0) return "gray"; // fallback
  
  const percentage = (contribution / maxContribution) * 100;

  if (percentage >= 100) {
    return "darkgreen";   // top contributor
  } else if (percentage >= 75) {
    return "lightgreen";  // strong contributor
  } else if (percentage >= 50) {
    return "lightblue";   // medium contributor
  } else if (percentage >= 25) {
    return "yellow";      // lower contributor
  } else {
    return "red";         // very low contributor
  }
}


// Build summary (per member totals + percentages) from filtered rows
function buildSummaryFromRows(rows) {
  const perMember = new Map(); // id -> sum
  let all = 0;

  for (const r of rows) {
    const current = perMember.get(r.member_id) || 0;
    perMember.set(r.member_id, current + r.total_year);
    all += r.total_year;
  }

  const members = rows
    .reduce((acc, r) => {
      if (!acc.some(x => x.member_id === r.member_id)) {
        acc.push({
          member_id: r.member_id,
          full_name: `${r.first_name} ${r.middle_name || ''} ${r.sur_name}`.replace(/\s+/g,' ').trim(),
        });
      }
      return acc;
    }, [])
   
.map(m => {
  const total = Number(perMember.get(m.member_id) || 0);
  const maxContribution = Math.max(...rows.map(r => r.total_year));
  const color = colorForContribution(total, maxContribution);

  return {
    ...m,
    total_contribution: total,
    percentageOfAll: all ? Number(((total / all) * 100).toFixed(2)) : 0,
    color
  };
})

    .sort((a, b) => b.total_contribution - a.total_contribution);

  return { members, totalAll: all };
}

// Build monthly total summary for the displayed rows
function buildMonthlySummary(rows) {
  const monthlySummary = {};
  MONTHS.forEach(m => monthlySummary[m] = 0);
  for (const row of rows) {
    MONTHS.forEach(m => monthlySummary[m] += Number(row[m] || 0));
  }
  return monthlySummary;
}

// ----------------------------------------
// Routes
// ----------------------------------------

//  specific update route (leave as-is)
router.post('/update/:member_id/:year/:month', async (req, res) => {
  const member_id = parseInt(req.params.member_id);
  const year = parseInt(req.params.year);
  const month = req.params.month;
  const { amount } = req.body;

  try {
    await contributionModel.updateContribution({ member_id, year, month, amount });
    req.flash('success', 'Contribution updated successfully.');
    res.redirect('/contributions');
  } catch (err) {
    console.error(err);
    req.flash('error', err.message || 'Error updating contribution');
    res.redirect('/contributions');
  }
});

router.get('/form', requireRole('chief_signatory'), (req, res) => {
  const formData = req.session.formData || {};
  req.session.formData = null;
  res.render('contribution-form', { formData });
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

    // (Optional) default UI month for your edit form
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

// Add contribution
router.post('/add', async (req, res) => {
  const { member_id, year, month, amount } = req.body;
  try {
    req.session.formData = req.body;
    await contributionModel.addContributionByMonth({ member_id, year, month, amount });
    req.session.formData = null;
    req.flash('success', 'Contribution added successfully!');
    res.redirect('/contributions/form');
  } catch (err) {
    console.error(err);
    let errorMessage = 'Error saving contribution';
    if (err.message.includes('Invalid month')) errorMessage = 'Invalid month selected';
    else if (err.message.includes('member_id')) errorMessage = 'Invalid member ID';
    req.flash('error', errorMessage);
    res.redirect('/contributions/form');
  }
});

// Main view (both tables) with filters
router.get('/', async (req, res) => {
  try {
    const allContributions = await contributionModel.getAllContributions();
    const members = await contributionModel.getAllMembers();

    // Make a quick map for names -> id
    const membersById = new Map(members.map(m => [m.id, m]));

    // Distinct years
    const years = [...new Set(allContributions.map(r => r.year))].sort((a, b) => a - b);

    // Filters
    const { year: selectedYear, from, to, member_id: selectedMember } = req.query;

    // Build filtered dataset
    const entries = toMonthEntries(allContributions);
    const filteredEntries = filterMonthEntries(entries, { selectedMember, selectedYear, from, to });
    const rows = groupToRows(filteredEntries);

    // Lifetime totals (based on filtered rows! You wanted filter-led display)
    const memberTotals = {};
    for (const row of rows) {
      memberTotals[row.member_id] = (memberTotals[row.member_id] || 0) + row.total_year;
    }

    // Monthly summary for the displayed rows
    const monthlySummary = buildMonthlySummary(rows);

    // Summary table (per member + %)
    const summaryData = buildSummaryFromRows(rows);

    // Chart uses the displayed rows (filter-aware)
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

// Import CSV
router.post('/import', upload.single('csvfile'), async (req, res) => {
  const csvPath = req.file.path;                       // ✅ don't shadow `path` module
  const parser = parse({ columns: true, trim: true });

  const stream = fs.createReadStream(csvPath).pipe(parser);

  try {
    for await (const row of stream) {
      await contributionModel.addContributionByMonth({
        member_id: parseInt(row.member_id),
        year: parseInt(row.year),
        month: String(row.month).slice(0,3).toLowerCase(), // tolerant normalization
        amount: parseFloat(row.amount)
      });
    }
    fs.unlinkSync(csvPath);
    req.flash('success', 'CSV imported successfully!');
    res.redirect('/contributions');
  } catch (err) {
    console.error('CSV import failed:', err);
    if (fs.existsSync(csvPath)) fs.unlinkSync(csvPath);
    res.status(500).send('CSV import failed');
  }
});

// ----------- PDF helpers (tables) -----------
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

// ---------------- Member Contributions PDF (filter-aware) ----------------
router.get('/download/contributions/pdf', async (req, res) => {
  try {
    const allContributions = await contributionModel.getAllContributions();
    const allMembers = await contributionModel.getAllMembers();
    const membersById = new Map(allMembers.map(m => [m.id, m]));

    const { member_id: selectedMember, year: selectedYear, from, to } = req.query;

    const entries = toMonthEntries(allContributions);
    const filteredEntries = filterMonthEntries(entries, { selectedMember, selectedYear, from, to });
    const rows = groupToRows(filteredEntries);

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

// ---------------- Contribution Summary PDF (filter-aware) ----------------
router.get('/download/summary/pdf', async (req, res) => {
  try {
    const allContributions = await contributionModel.getAllContributions();
    const allMembers = await contributionModel.getAllMembers();
    const membersById = new Map(allMembers.map(m => [m.id, m]));

    const { member_id: selectedMember, year: selectedYear, from, to } = req.query;

    const entries = toMonthEntries(allContributions);
    const filteredEntries = filterMonthEntries(entries, { selectedMember, selectedYear, from, to });
    const rows = groupToRows(filteredEntries);
    const summary = buildSummaryFromRows(rows);

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

module.exports = router;

