

const pool = require('../db');

// Category keys and metadata
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

// Loan transaction types for financial statement
const LOAN_DISBURSEMENT_TYPE = 'Loan Disbursement';
const LOAN_REPAYMENT_TYPE = 'Loan Repayment';

/* ---------- small helpers ---------- */
function slugFromName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, '_');
}
function dbNameFromKey(key) {
  return String(key || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function getCategoryKeys() { return Object.keys(CATEGORY_META); }

/* ---------- date helpers ---------- */
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

/* ---------- contributions (credit) ---------- */
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
  const transactions = await getContributionTransactionsBetweenDates(startDate, endDate);
  return transactions.reduce((acc, t) => acc + Number(t.amount || 0), 0);
}

/* ---------- category storage helpers ---------- */
async function ensureCategoriesExist() {
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
    console.error('ensureCategoriesExist error:', err);
  }
}

async function getCategoryRows() {
  await ensureCategoriesExist();
  const { rows } = await pool.query('SELECT id, name, percentage FROM fund_categories ORDER BY id');
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    key: slugFromName(r.name),
    percent: Number(r.percentage || 0)
  }));
}

async function getCategoryPercents() {
  try {
    const { rows } = await pool.query('SELECT name, percentage FROM fund_categories');
    if (!rows || rows.length === 0) return { ...DEFAULT_PERCENTS };
    const map = {};
    rows.forEach(r => { map[slugFromName(r.name)] = Number(r.percentage || 0); });
    Object.keys(DEFAULT_PERCENTS).forEach(k => {
      if (map[k] == null) map[k] = Number(DEFAULT_PERCENTS[k] || 0);
    });
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
  const sql = `UPDATE fund_categories SET percentage = $2, updated_at = CURRENT_TIMESTAMP WHERE name = $1`;
  for (const key of Object.keys(CATEGORY_META)) {
    const value = Number(newPercents[key] ?? DEFAULT_PERCENTS[key]);
    const dbName = dbNameFromKey(key);
    await pool.query(sql, [dbName, value]);
  }
  return await getCategoryPercents();
}

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

async function getCategorySummary(categoryKey, totalFund, percents, from, to) {
  const pct = Number(percents[categoryKey]) || 0;
  const allocated = totalFund * (pct / 100);
  const used = await getCategoryTransactionsTotal(categoryKey, from, to);
  const available = allocated - used;
  return {
    key: categoryKey,
    label: CATEGORY_META[categoryKey].label,
    allocated,
    total: allocated,
    used,
    available,
    transactions: await getCategoryTransactions(categoryKey, from, to),
    transactionsTotal: used,
  };
}

async function getFundOverview(from, to) {
  const totalFund = await getTotalFund(from, to);
  const percents = await getCategoryPercents();
  const categories = {};
  let availableFund = 0;
  for (const key of getCategoryKeys()) {
    const summary = await getCategorySummary(key, totalFund, percents, from, to);
    categories[key] = summary;
    availableFund += summary.available;
  }
  return { totalFund, availableFund, categories, percents };
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
      percent: pct.toFixed(2),
      amount: Math.round(c.allocated).toLocaleString(),
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

function normalizeTransactions(arr = []) {
  return arr.map((t, idx) => ({
    ...t,
    member_first_name: t.first_name || t.member_first_name || '',
    member_surname: t.sur_name || t.surname || t.member_surname || '',
    date: t.created_at || t.date || null,
    txn_no: t.txn_no || t.id || (idx + 1),
    amount: Number(t.amount || 0)
  }));
}

/* ---------- financial statement helpers ---------- */
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

function buildContributionTransactions(rows) {
  rows.sort((a, b) => {
    if (a.member_id !== b.member_id) return a.member_id - b.member_id;
    return new Date(a.transaction_date) - new Date(b.transaction_date);
  });
  const dailyCounts = {};
  rows.forEach(row => {
    const date = new Date(row.transaction_date);
    const key = `${row.member_id}_${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    dailyCounts[key] = (dailyCounts[key] || 0) + 1;
  });
  const processedCounts = {};
  const results = [];
  rows.forEach(row => {
    const date = new Date(row.transaction_date);
    const year = date.getFullYear();
    const month = String(date.getMonth()+1).padStart(2,'0');
    const day = String(date.getDate()).padStart(2,'0');
    const memberId = row.member_id;
    const key = `${memberId}_${year}-${month}-${day}`;
    processedCounts[key] = (processedCounts[key] || 0) + 1;
    const dailyIndex = processedCounts[key];
    const totalDaily = dailyCounts[key];
    results.push({
      id: row.id,
      member_id: row.member_id,
      first_name: row.first_name || '',
      sur_name: row.sur_name || '',
      amount: Number(row.amount || 0),
      request_type: 'Contribution',
      created_at: row.transaction_date,
      type: 'credit',
      txn_trn: `C-${memberId}-${year}-${month}-${day}-${dailyIndex}/${totalDaily}`
    });
  });
  return results;
}

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

  const categoryMap = {};
  const synonymsMap = {};
  for (const key of getCategoryKeys()) {
    synonymsMap[key] = getSynonymsArray(key);
  }

  return rows.map(r => {
    const typeLower = (r.request_type || '').toLowerCase();
    let categoryKey = getCategoryKeys().find(k => synonymsMap[k].includes(typeLower));
    if (!categoryKey) categoryKey = 'other';
    if (!categoryMap[categoryKey]) categoryMap[categoryKey] = 0;
    categoryMap[categoryKey] += 1;
    return {
      ...r,
      amount: Number(r.amount || 0),
      type: 'debit',
      txn_trn: `TRN ${categoryMap[categoryKey]}-${r.id}`
    };
  });
}

async function getROITransactions(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT r.id, r.member_id, m.first_name, m.sur_name, r.amount, 
           r.created_at, r.status, r.payment_date,
           CONCAT('ROI-', r.id) as roi_trn
    FROM roi r
    JOIN member m ON r.member_id = m.id
    WHERE 1=1
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

async function getRefundTransactions(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT rf.id, rf.member_id, m.first_name, m.sur_name, rf.amount, 
           rf.created_at, rf.status, rf.reason,
           CONCAT('REF-', rf.id) as refund_trn
    FROM refunds rf
    JOIN member m ON rf.member_id = m.id
    WHERE 1=1
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
  return rows;
}

/* ---------- NEW: Loan transactions ---------- */

/*
async function getLoanDisbursements(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT l.id, l.member_id, m.first_name, m.sur_name, l.amount,
           l.reviewed_at as transaction_date, l.loan_type, l.tenure_months,
           CONCAT('LOAN-', l.id) as loan_trn
    FROM loans l
    JOIN member m ON l.member_id = m.id
    WHERE l.reviewed_at IS NOT NULL
  `;
  if (member_id) {
    params.push(member_id);
    sql += ` AND l.member_id = $${params.length}`;
  }
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND l.reviewed_at >= $${params.length}::date`;
  }
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND l.reviewed_at <= $${params.length}::date`;
  }
  sql += ` ORDER BY l.reviewed_at ASC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(row => ({
    id: `loan-${row.id}`,
    member_id: row.member_id,
    first_name: row.first_name,
    sur_name: row.sur_name,
    amount: Number(row.amount),
    request_type: LOAN_DISBURSEMENT_TYPE,
    created_at: row.transaction_date,
    type: 'debit',
    txn_trn: row.loan_trn,
    loan_type: row.loan_type,
    tenure_months: row.tenure_months
  }));
}

// CORRECTED FUNCTION: use l.member_id, not lr.member_id
async function getLoanRepayments(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT lr.id, lr.loan_id, l.member_id, m.first_name, m.sur_name,
           lr.amount_paid as amount, lr.payment_date as transaction_date,
           CONCAT('REP-', lr.id) as repayment_trn, l.loan_type
    FROM loan_repayments lr
    JOIN loans l ON lr.loan_id = l.id
    JOIN member m ON l.member_id = m.id
    WHERE lr.status = 'Paid' AND lr.amount_paid > 0
  `;
  if (member_id) {
    params.push(member_id);
    sql += ` AND l.member_id = $${params.length}`;
  }
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND lr.payment_date >= $${params.length}::date`;
  }
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND lr.payment_date <= $${params.length}::date`;
  }
  sql += ` ORDER BY lr.payment_date ASC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(row => ({
    id: `repayment-${row.id}`,
    member_id: row.member_id,
    first_name: row.first_name,
    sur_name: row.sur_name,
    amount: Number(row.amount),
    request_type: LOAN_REPAYMENT_TYPE,
    created_at: row.transaction_date,
    type: 'credit',
    txn_trn: row.repayment_trn,
    loan_id: row.loan_id,
    loan_type: row.loan_type
  }));
}
*/

async function getLoanDisbursements(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT l.id, l.member_id, m.first_name, m.sur_name, l.amount,
           l.reviewed_at as transaction_date, l.loan_type, l.tenure_months,
           COALESCE(l.disbursement_trn, CONCAT('LOAN-', l.id)) as loan_trn
    FROM loans l
    JOIN member m ON l.member_id = m.id
    WHERE l.reviewed_at IS NOT NULL
  `;
  if (member_id) {
    params.push(member_id);
    sql += ` AND l.member_id = $${params.length}`;
  }
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND l.reviewed_at >= $${params.length}::date`;
  }
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND l.reviewed_at <= $${params.length}::date`;
  }
  sql += ` ORDER BY l.reviewed_at ASC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(row => ({
    id: `loan-${row.id}`,
    member_id: row.member_id,
    first_name: row.first_name,
    sur_name: row.sur_name,
    amount: Number(row.amount),
    request_type: LOAN_DISBURSEMENT_TYPE,
    created_at: row.transaction_date,
    type: 'debit',
    txn_trn: row.loan_trn,
    loan_type: row.loan_type,
    tenure_months: row.tenure_months
  }));
}

async function getLoanRepayments(member_id, from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const params = [];
  let sql = `
    SELECT lr.id, lr.loan_id, l.member_id, m.first_name, m.sur_name,
           lr.amount_paid as amount, lr.payment_date as transaction_date,
           COALESCE(lr.repayment_trn, CONCAT('REP-', lr.id)) as repayment_trn,
           l.loan_type
    FROM loan_repayments lr
    JOIN loans l ON lr.loan_id = l.id
    JOIN member m ON l.member_id = m.id
    WHERE lr.status = 'Paid' AND lr.amount_paid > 0
  `;
  if (member_id) {
    params.push(member_id);
    sql += ` AND l.member_id = $${params.length}`;
  }
  if (start) {
    params.push(`${start.year}-${String(start.month).padStart(2,'0')}-01`);
    sql += ` AND lr.payment_date >= $${params.length}::date`;
  }
  if (end) {
    const lastDay = new Date(end.year, end.month, 0).getDate();
    params.push(`${end.year}-${String(end.month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);
    sql += ` AND lr.payment_date <= $${params.length}::date`;
  }
  sql += ` ORDER BY lr.payment_date ASC`;
  const { rows } = await pool.query(sql, params);
  return rows.map(row => ({
    id: `repayment-${row.id}`,
    member_id: row.member_id,
    first_name: row.first_name,
    sur_name: row.sur_name,
    amount: Number(row.amount),
    request_type: LOAN_REPAYMENT_TYPE,
    created_at: row.transaction_date,
    type: 'credit',
    txn_trn: row.repayment_trn,
    loan_id: row.loan_id,
    loan_type: row.loan_type
  }));
}

/* ---------- main financial transactions aggregator ---------- */
async function getFinancialTransactions(member_id, from, to) {
  const { startDate, endDate } = monthRangeToDates(from, to);
  const contribTxns = await getContributionTransactionsBetweenDatesWithMembers(startDate, endDate, member_id);
  const contrib = buildContributionTransactions(contribTxns);
  const requestTxns = await getApprovedTransactions(member_id, from, to);
  const roiTxns = await getROITransactions(member_id, from, to);
  const refundTxns = await getRefundTransactions(member_id, from, to);
  const loanDisbursements = await getLoanDisbursements(member_id, from, to);
  const loanRepayments = await getLoanRepayments(member_id, from, to);

  const unified = [
    ...contrib,
    ...requestTxns.map(t => ({ ...t, type: 'debit' })),
    ...roiTxns.map(t => ({ ...t, type: 'credit' })),
    ...refundTxns.map(t => ({ ...t, type: 'credit' })),
    ...loanDisbursements,
    ...loanRepayments
  ];
  unified.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return unified;
}

/* ---------- members list ---------- */
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
  getMembersList,
  // new exports for loan transactions
  getLoanDisbursements,
  getLoanRepayments,
  LOAN_DISBURSEMENT_TYPE,
  LOAN_REPAYMENT_TYPE
};


