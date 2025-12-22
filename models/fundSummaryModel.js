
const pool = require('../db');

/*
 Category keys -> labels + synonyms
 Keep the canonical keys (snake_case) in CATEGORY_META
*/
const CATEGORY_META = {
  reserve:      { label: 'Reserve',        requestTypeSynonyms: ['reserve'] },
  expenses:     { label: 'Expenses',        requestTypeSynonyms: ['expenses','running cost', 'running_cost','running-cost']},
  investment:   { label: 'Investment',      requestTypeSynonyms: ['investment'] },
  emergency:    { label: 'Emergency',       requestTypeSynonyms: ['emergency','funeral cost','funeral_cost','funeral-cost','other']},
  school_fee:   { label: 'School Fee',      requestTypeSynonyms: ['school fee', 'school_fee', 'school-fee'] },
  mariage:      { label: 'Mariage',         requestTypeSynonyms: ['mariage', 'marriage'] },
  hospital_bill:{ label: 'Hospital Bill',   requestTypeSynonyms: ['hospital bill', 'hospital_bill', 'hospital-bill', 'medical', 'medical bill'] },
  back_up:      { label: 'Business Back Up',requestTypeSynonyms: ['back up', 'business back up', 'back-up', 'business backup', 'backup'] },
};

/*
 DEFAULT_PERCENTS expressed as whole numbers (0..100).
 This file uses whole numbers and DB stores whole numbers.
*/
const DEFAULT_PERCENTS = {
  reserve:15,
  expenses:15,
  investment: 12,
  emergency: 10,
  school_fee: 15,
  mariage: 5,
  hospital_bill: 20,
  back_up: 8,
};

const MONTH_COLS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/* ---------- small helpers ---------- */
function slugFromName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '_');
}
function dbNameFromKey(key) {
  return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function getCategoryKeys() { return Object.keys(CATEGORY_META); }

/* ---------- date helpers (unchanged) ---------- */
function parseMonthStr(s) {
  if (!s) return null;
  const [y, m] = s.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return { year: y, month: m };
}
function ensureOrderedRange(from, to) {
  const start = parseMonthStr(from);
  const end = parseMonthStr(to);
  if (start && end) {
    if (start.year > end.year || (start.year === end.year && start.month > end.month)) {
      return { start: end, end: start };
    }
  }
  return { start, end };
}
function monthRangeToDates(from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const startDate = start ? new Date(Date.UTC(start.year, start.month - 1, 1)) : null;
  const endDate = end ? new Date(Date.UTC(end.year, end.month, 1) - 1) : null;
  return { startDate, endDate, start, end };
}

/* ---------- contributions / total fund - UPDATED TO USE TRANSACTIONS ---------- */
async function getContributionTransactionsBetweenDates(startDate, endDate, memberId = null) {
  const values = [];
  let sql = `
    SELECT ct.*, m.first_name, m.sur_name 
    FROM contribution_transactions ct
    LEFT JOIN member m ON m.id = ct.member_id
    WHERE 1=1
  `;
  
  if (memberId) {
    values.push(memberId);
    sql += ` AND ct.member_id = $${values.length}`;
  }
  
  if (startDate) {
    values.push(startDate);
    sql += ` AND ct.transaction_date >= $${values.length}`;
  }
  
  if (endDate) {
    values.push(endDate);
    sql += ` AND ct.transaction_date <= $${values.length}`;
  }
  
  sql += ' ORDER BY ct.transaction_date ASC';
  
  const { rows } = await pool.query(sql, values);
  return rows;
}

async function getTotalFund(from, to) {
  const { startDate, endDate } = monthRangeToDates(from, to);
  
  // Get all contribution transactions within the date range
  const transactions = await getContributionTransactionsBetweenDates(startDate, endDate);
  
  // Sum all transaction amounts
  return transactions.reduce((acc, transaction) => acc + Number(transaction.amount || 0), 0);
}

/* ---------- category storage helpers ---------- */
async function ensureCategoriesExist() {
  // If fund_categories has no rows, create them from DEFAULT_PERCENTS + labels
  try {
    const { rows: check } = await pool.query('SELECT 1 FROM fund_categories LIMIT 1');
    if (check.length === 0) {
      const keys = getCategoryKeys();
      const insertSQL = `
        INSERT INTO fund_categories (name, percentage, created_at, updated_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (name) DO NOTHING
      `;
      for (const k of keys) {
        const name = CATEGORY_META[k].label;
        const pct = Number(DEFAULT_PERCENTS[k] || 0);
        await pool.query(insertSQL, [name, pct]);
      }
    }
  } catch (err) {
    // If DB not available, ignore — calling code will fall back to DEFAULT_PERCENTS
    console.error('ensureCategoriesExist error:', err);
  }
}

async function getCategoryRows() {
  // ensure rows exist (create defaults if empty)
  await ensureCategoriesExist();
  const { rows } = await pool.query('SELECT id, name, percentage FROM fund_categories ORDER BY id');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    key: slugFromName(r.name),
    percent: Number(r.percentage || 0)
  }));
}

// ---------- percents read / write ---------- 
async function getCategoryPercents() {
  // Returns { investment: 12, ... } (whole numbers 0..100)
  try {
    const { rows } = await pool.query('SELECT name, percentage FROM fund_categories');
    if (!rows || rows.length === 0) {
      // No DB rows -> fallback to defaults
      return { ...DEFAULT_PERCENTS };
    }
    const map = {};
    rows.forEach(r => {
      map[slugFromName(r.name)] = Number(r.percentage || 0);
    });
    // ensure defaults fill missing keys
    Object.keys(DEFAULT_PERCENTS).forEach(k => {
      if (map[k] == null) map[k] = Number(DEFAULT_PERCENTS[k] || 0);
    });

    // If sum > 100, normalize proportionally (safeguard)
    const sum = Object.values(map).reduce((a,b) => a + (Number(b)||0), 0);
      if (Math.abs(sum - 100) > 1e-6) {
      const factor = 100 / sum;
      Object.keys(map).forEach(k => { map[k] = Number((map[k] * factor).toFixed(2)); });
    }
    return map;
  } catch (err) {
    console.error('getCategoryPercents db error, falling back to defaults:', err);
    return { ...DEFAULT_PERCENTS };
  }
}

async function updateCategoryPercents(newPercents) {
  const sql = `
    UPDATE fund_categories
    SET percentage = $2, updated_at = CURRENT_TIMESTAMP
    WHERE name = $1
  `;
  for (const key of Object.keys(CATEGORY_META)) {
    const value = Number(newPercents[key] ?? DEFAULT_PERCENTS[key]);
    const dbName = dbNameFromKey(key);
    await pool.query(sql, [dbName, value]);
  }
  return await getCategoryPercents();
}

/* ---------- transactions & summaries ---------- */
function getSynonymsArray(categoryKey) {
  const meta = CATEGORY_META[categoryKey];
  return (meta?.requestTypeSynonyms || []).map(s => s.toLowerCase());
}

async function getCategoryTransactions(categoryKey, from, to) {
  const { startDate, endDate } = monthRangeToDates(from, to);
  const synonyms = getSynonymsArray(categoryKey);
  let sql = `
    SELECT fr.*, m.first_name, m.middle_name, m.sur_name
    FROM fund_requests fr
    LEFT JOIN member m ON m.id = fr.member_id
    WHERE fr.status = 'Approved' AND LOWER(fr.request_type) = ANY($1)
  `;
  const values = [synonyms];
  if (startDate) { values.push(startDate); sql += ` AND fr.created_at >= $${values.length}`; }
  if (endDate)   { values.push(endDate);   sql += ` AND fr.created_at <= $${values.length}`; }
  sql += ' ORDER BY fr.created_at DESC';
  const { rows } = await pool.query(sql, values);
  return rows;
}

async function getCategoryTransactionsTotal(categoryKey, from, to) {
  const { startDate, endDate } = monthRangeToDates(from, to);
  const synonyms = getSynonymsArray(categoryKey);
  let sql = `
    SELECT SUM(fr.amount) AS total
    FROM fund_requests fr
    WHERE fr.status = 'Approved' AND LOWER(fr.request_type) = ANY($1)
  `;
  const values = [synonyms];
  if (startDate) { values.push(startDate); sql += ` AND fr.created_at >= $${values.length}`; }
  if (endDate)   { values.push(endDate);   sql += ` AND fr.created_at <= $${values.length}`; }
  const { rows } = await pool.query(sql, values);
  return Number(rows[0]?.total || 0);
}

async function getCategorySummary(categoryKey, totalFund, percents /* whole numbers map */, from, to) {
  const pct = Number(percents[categoryKey]) || 0;
  const allocated = totalFund * (pct / 100); // pct is whole-number percent
  const transactions = await getCategoryTransactions(categoryKey, from, to);
  const used = await getCategoryTransactionsTotal(categoryKey, from, to);
  const available = allocated - used;
  return {
    key: categoryKey,
    label: CATEGORY_META[categoryKey].label,
    allocated,
    total: allocated,
    used,
    available,
    transactions,
    transactionsTotal: used,
  };
}

async function getFundOverview(from, to) {
  const totalFund = await getTotalFund(from, to);
  const percents = await getCategoryPercents(); // whole numbers
  const categories = {};
  let availableFund = 0;
  for (const key of getCategoryKeys()) {
    const summary = await getCategorySummary(key, totalFund, percents, from, to);
    categories[key] = summary;
    availableFund += summary.available;
  }
  return { totalFund, availableFund, categories, percents };
}

/* ---------- UI helpers ---------- */
function normalizeTransactions(arr = []) {
  return arr.map((t, idx) => {
    // txn_no will be normalized by view logic (or PDF). Keep numeric amount type.
    return {
      ...t,
      member_first_name: t.first_name || t.member_first_name || '',
      member_surname: t.sur_name || t.surname || t.member_surname || '',
      date: t.created_at || t.date || null,
      txn_no: t.txn_no || t.id || (idx + 1),
      amount: Number(t.amount || 0)
    };
  });
}

function toViewVars(overview) {
  const { totalFund, availableFund, categories, percents } = overview;

  function txsFor(key) {
    const c = categories[key];
    return {
      transactions: normalizeTransactions(c?.transactions || []),
      transactionsTotal: Number(c?.transactionsTotal || c?.used || 0)
    };
  }

  const breakdown = getCategoryKeys().map(key => {
    const c = categories[key];
    const pct = Number(percents?.[key] ?? DEFAULT_PERCENTS[key] ?? 0);
    return {
      key,
      label: c.label,
      percent: pct.toFixed(2), // UI-friendly string
      amount: Math.round(c.allocated).toLocaleString(), // formatted
      allocated: c.allocated,
      used: c.used,
      available: c.available
    };
  });

  const reserveTx     = txsFor('reserve');
  const expensesTx     = txsFor('expenses');
  const investmentTx = txsFor('investment');
  const emergencyTx  = txsFor('emergency');
  const schoolFeeTx  = txsFor('school_fee');
  const mariageTx    = txsFor('mariage');
  const hospitalTx   = txsFor('hospital_bill');
  const backUpTx     = txsFor('back_up');

  return {
    totalFund,
    availableFund,
    categories,
    breakdown,

    reserve: categories.reserve,
    expenses: categories.expenses,
    investment: categories.investment,
    emergency: categories.emergency,
    schoolFee: categories.school_fee,
    mariage: categories.mariage,
    hospitalBill: categories.hospital_bill,
    backUp: categories.back_up,

    reserveTransactions: reserveTx.transactions,
    reserveTransactionsTotal: reserveTx.transactionsTotal,

    expensesTransactions: expensesTx.transactions,
    expensesTransactionsTotal: expensesTx.transactionsTotal,

    investmentTransactions: investmentTx.transactions,
    investmentTransactionsTotal: investmentTx.transactionsTotal,

    emergencyTransactions: emergencyTx.transactions,
    emergencyTransactionsTotal: emergencyTx.transactionsTotal,

    schoolFeeTransactions: schoolFeeTx.transactions,
    schoolFeeTransactionsTotal: schoolFeeTx.transactionsTotal,

    mariageTransactions: mariageTx.transactions,
    mariageTransactionsTotal: mariageTx.transactionsTotal,

    hospitalBillTransactions: hospitalTx.transactions,
    hospitalBillTransactionsTotal: hospitalTx.transactionsTotal,

    backUpTransactions: backUpTx.transactions,
    backUpTransactionsTotal: backUpTx.transactionsTotal,
  };
}

// Financial statement - UPDATED TO USE TRANSACTION-BASED CONTRIBUTIONS
/* ---------- contributions -> convert to per-transaction entries ---------- */
async function getContributionTransactionsBetweenDatesWithMembers(startDate, endDate, memberId = null) {
  const values = [];
  let sql = `
    SELECT ct.*, m.first_name, m.sur_name 
    FROM contribution_transactions ct
    LEFT JOIN member m ON m.id = ct.member_id
    WHERE 1=1
  `;
  
  if (memberId) {
    values.push(memberId);
    sql += ` AND ct.member_id = $${values.length}`;
  }
  
  if (startDate) {
    values.push(startDate);
    sql += ` AND ct.transaction_date >= $${values.length}`;
  }
  
  if (endDate) {
    values.push(endDate);
    sql += ` AND ct.transaction_date <= $${values.length}`;
  }
  
  sql += ' ORDER BY ct.transaction_date ASC, ct.id ASC';
  
  const { rows } = await pool.query(sql, values);
  return rows;
}

/* ---------- approved fund requests (debits) with TRN ---------- */
async function getApprovedTransactions(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT fr.id, fr.member_id, m.first_name, m.sur_name, fr.amount, fr.request_type,
           fr.created_at, fr.status, fr.bank_account, fr.bank_name
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
    WHERE fr.status = 'Approved'
  `;
  if (member_id) {
    params.push(member_id);
    sql += ` AND fr.member_id = $${params.length}`;
  }
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND fr.created_at >= $${params.length}::date`;
  }
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND fr.created_at <= $${params.length}::date`;
  }
  sql += ` ORDER BY fr.created_at ASC`;
  const { rows } = await pool.query(sql, params);

  // assign sequential TRN per category (excluding contributions)
  const categoryMap = {}; // categoryKey -> count
  const synonymsMap = {};
  for (const key of getCategoryKeys()) {
    synonymsMap[key] = getSynonymsArray(key);
  }

  const processed = rows.map(r => {
    const typeLower = (r.request_type || '').toLowerCase();
    let categoryKey = getCategoryKeys().find(k => synonymsMap[k].includes(typeLower));
    if (!categoryKey) categoryKey = 'other';

    if (!categoryMap[categoryKey]) categoryMap[categoryKey] = 0;
    categoryMap[categoryKey] += 1;

    return {
      ...r,
      amount: Number(r.amount || 0),
      type: 'debit',
      txn_trn: `TRN ${categoryMap[categoryKey]}-${r.id}` // X-Y format
    };
  });

  return processed;
}

// Add this helper function to count contributions per member per day
async function getContributionCountPerDay(memberId, date) {
  const sql = `
    SELECT COUNT(*) as count
    FROM contribution_transactions
    WHERE member_id = $1 
    AND DATE(transaction_date) = DATE($2)
  `;
  const { rows } = await pool.query(sql, [memberId, date]);
  return parseInt(rows[0]?.count || 0);
}


/* ---------- combined financial transactions (credits + debits) with TRN - UPDATED ---------- */
// models/fundSummaryModel.js - Enhanced getFinancialTransactions

async function getFinancialTransactions(member_id, from, to) {
  // Resolve month range to actual dates
  const { startDate, endDate } = monthRangeToDates(from, to);

  // Get contribution transactions with real dates
  const contribTransactions = await getContributionTransactionsBetweenDatesWithMembers(startDate, endDate, member_id);
  const contribTxns = buildContributionTransactions(contribTransactions);

  // Get fund request transactions (debits)
  const requestTxns = await getApprovedTransactions(member_id, from, to);

  // Get ROI transactions (credits - only for overall statement)
  const roiTxns = await getROITransactions(member_id, from, to);

  // Get Refund transactions (credits - for both overall and individual)
  const refundTxns = await getRefundTransactions(member_id, from, to);

  // unify fields and combine
  const unified = [
    ...contribTxns, // Already has proper C-memberID-year-month-day-X/Y format
    ...requestTxns.map(t => ({
      id: `req-${t.id}`,
      member_id: t.member_id,
      first_name: t.first_name,
      sur_name: t.sur_name,
      amount: Number(t.amount),
      request_type: t.request_type,
      created_at: t.created_at,
      type: 'debit',
      bank_account: t.bank_account,
      bank_name: t.bank_name,
      txn_trn: t.txn_trn
    })),
    ...roiTxns.map(t => ({
      id: `roi-${t.id}`,
      member_id: t.member_id,
      first_name: t.first_name,
      sur_name: t.sur_name,
      amount: Number(t.amount),
      request_type: 'ROI Payment',
      created_at: t.created_at,
      type: 'credit',
      txn_trn: t.roi_trn || `ROI-${t.id}`
    })),
    ...refundTxns.map(t => ({
      id: `refund-${t.id}`,
      member_id: t.member_id,
      first_name: t.first_name,
      sur_name: t.sur_name,
      amount: Number(t.amount),
      request_type: 'Refund',
      created_at: t.created_at,
      type: 'credit',
      txn_trn: t.refund_trn || `REF-${t.id}`
    }))
  ];

  // sort by date asc
  unified.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return unified;
}

/* ---------- New helper function for generating contribution IDs ---------- */
function generateContributionId(transaction, memberId) {
  if (!transaction || !transaction.created_at) return `C-${memberId}-UNKNOWN`;
  
  const transactionDate = new Date(transaction.created_at);
  const year = transactionDate.getFullYear();
  const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
  const day = String(transactionDate.getDate()).padStart(2, '0');
  
  // For counting contributions per member per day
  // This would require a separate function to count contributions per day
  const count = 1; // Default count, you might want to implement actual counting
  
  return `C-${memberId}-${year}-${month}-${day}-${count}`;
}

/* ---------- Get ROI transactions ---------- */
/* ---------- Get ROI transactions ---------- */
async function getROITransactions(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT r.id, r.member_id, m.first_name, m.sur_name, r.amount, 
           r.created_at, r.status, r.payment_date,
           CONCAT('ROI-', r.id) as roi_trn
    FROM roi r
    JOIN member m ON r.member_id = m.id
    WHERE 1=1  -- Remove status filter: r.status = 'Approved'
  `;
  
  if (member_id) {
    params.push(member_id);
    sql += ` AND r.member_id = $${params.length}`;
  }
  
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND r.created_at >= $${params.length}::date`;
  }
  
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND r.created_at <= $${params.length}::date`;
  }
  
  sql += ` ORDER BY r.created_at ASC`;
  
  const { rows } = await pool.query(sql, params);
  return rows;
}

/* ---------- Get Refund transactions ---------- */
async function getRefundTransactions(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT rf.id, rf.member_id, m.first_name, m.sur_name, rf.amount, 
           rf.created_at, rf.status, rf.reason,
           CONCAT('REF-', rf.id) as refund_trn
    FROM refunds rf
    JOIN member m ON rf.member_id = m.id
    WHERE 1=1  -- Remove status filter: rf.status = 'Approved'
  `;
  
  if (member_id) {
    params.push(member_id);
    sql += ` AND rf.member_id = $${params.length}`;
  }
  
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND rf.created_at >= $${params.length}::date`;
  }
  
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND rf.created_at <= $${params.length}::date`;
  }
  
  sql += ` ORDER BY rf.created_at ASC`;
  
  const { rows } = await pool.query(sql, params);
  console.log(`Found ${rows.length} refund transactions for member ${member_id || 'all'}`); // Debug logging
  return rows;
}


/* ---------- Update buildContributionTransactions to use new ID format ---------- */
function buildContributionTransactions(rows) {
  // First, sort by member and date
  rows.sort((a, b) => {
    if (a.member_id !== b.member_id) {
      return a.member_id - b.member_id;
    }
    return new Date(a.transaction_date) - new Date(b.transaction_date);
  });
  
  // Count contributions per member per day
  const dailyCounts = {};
  
  // First pass: count total contributions per member per day
  rows.forEach(row => {
    const transactionDate = new Date(row.transaction_date);
    const year = transactionDate.getFullYear();
    const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
    const day = String(transactionDate.getDate()).padStart(2, '0');
    const memberId = row.member_id;
    
    const key = `${memberId}_${year}-${month}-${day}`;
    dailyCounts[key] = (dailyCounts[key] || 0) + 1;
  });
  
  // Second pass: assign IDs with X/Y format
  const processedCounts = {};
  const results = [];
  
  rows.forEach(row => {
    const transactionDate = new Date(row.transaction_date);
    const year = transactionDate.getFullYear();
    const month = String(transactionDate.getMonth() + 1).padStart(2, '0');
    const day = String(transactionDate.getDate()).padStart(2, '0');
    const memberId = row.member_id;
    
    const key = `${memberId}_${year}-${month}-${day}`;
    
    // Initialize or increment processed count
    if (!processedCounts[key]) {
      processedCounts[key] = 1;
    } else {
      processedCounts[key]++;
    }
    
    const dailyIndex = processedCounts[key];
    const totalDailyCount = dailyCounts[key];
    
    results.push({
      id: row.id,
      member_id: row.member_id,
      first_name: row.first_name || '',
      sur_name: row.sur_name || '',
      amount: Number(row.amount || 0),
      request_type: 'Contribution',
      created_at: row.transaction_date,
      type: 'credit',
      txn_trn: `C-${memberId}-${year}-${month}-${day}-${dailyIndex}/${totalDailyCount}`
    });
  });
  
  return results;
}

/* ---------- fixed members list helper ---------- */
async function getMembersList() {
  const { rows } = await pool.query('SELECT id, first_name, sur_name FROM member ORDER BY first_name');
  return rows;
}

module.exports = {
  CATEGORY_META,
  getCategoryKeys,
  getCategoryPercents,
  getCategoryRows,
  updateCategoryPercents,
  parseMonthStr,
  monthRangeToDates,
  getTotalFund,
  getCategoryTransactions,
  getCategoryTransactionsTotal,
  getCategorySummary,
  getFundOverview,
  toViewVars,
  getApprovedTransactions,
  getFinancialTransactions,
  getMembersList
};



