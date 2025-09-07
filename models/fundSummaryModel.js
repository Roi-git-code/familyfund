// models/fundSummaryModel.js
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

/* ---------- contributions / total fund ---------- */
async function getContributionRowsBetweenYears(startYear, endYear) {
  const values = [];
  let sql = 'SELECT * FROM member_contribution';
  if (startYear != null && endYear != null) {
    sql += ' WHERE year BETWEEN $1 AND $2';
    values.push(startYear, endYear);
  } else if (startYear != null) {
    sql += ' WHERE year >= $1';
    values.push(startYear);
  } else if (endYear != null) {
    sql += ' WHERE year <= $1';
    values.push(endYear);
  }
  const { rows } = await pool.query(sql, values);
  return rows;
}
function sumContribRow(row, start, end) {
  const y = Number(row.year);
  if (start && y < start.year) return 0;
  if (end && y > end.year) return 0;
  let fromM = 1, toM = 12;
  if (start && y === start.year) fromM = start.month;
  if (end && y === end.year) toM = end.month;
  let sum = 0;
  for (let m = fromM; m <= toM; m++) {
    const col = MONTH_COLS[m - 1];
    sum += Number(row[col] || 0);
  }
  return sum;
}
async function getTotalFund(from, to) {
  const { start, end } = ensureOrderedRange(from, to);
  const rows = await getContributionRowsBetweenYears(start?.year ?? null, end?.year ?? null);
  return rows.reduce((acc, r) => acc + sumContribRow(r, start, end), 0);
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



/* ---------- transactions & summaries (mostly unchanged, but use whole-number percents) ---------- */
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
  toViewVars
};
