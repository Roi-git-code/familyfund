

const pool = require('../db');

// Add individual transaction with current date
async function addContributionTransaction({ member_id, amount, transaction_date }) {
  // Validate inputs
  if (!member_id || !amount || !transaction_date) {
    throw new Error('Missing required fields: member_id, amount, transaction_date');
  }
  
  if (isNaN(parseInt(member_id))) {
    throw new Error('Invalid member ID');
  }
  
  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    throw new Error('Invalid amount');
  }
  
  // Validate date
  const date = new Date(transaction_date);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid transaction date');
  }

  // Insert the transaction
  const result = await pool.query(
    `INSERT INTO contribution_transactions (member_id, amount, transaction_date) 
     VALUES ($1, $2, $3) RETURNING *`,
    [member_id, parseFloat(amount), transaction_date]
  );

  return result.rows[0];
}

// Backward compatible function - uses current date for transactions
async function addContributionByMonth({ member_id, year, month, amount }) {
  // Validate inputs
  if (!member_id || !year || !month || !amount) {
    throw new Error('Missing required fields');
  } 
  
  if (isNaN(parseInt(member_id))) {
    throw new Error('Invalid member ID');
  }
  
  if (isNaN(parseInt(year))) {
    throw new Error('Invalid year');
  }
  
  if (isNaN(parseFloat(amount))) {
    throw new Error('Invalid amount');
  }
  
  const validMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (!validMonths.includes(month)) {
    throw new Error("Invalid month name.");
  }

  // Use CURRENT DATE instead of 1st of the month
  const transaction_date = new Date().toISOString().split('T')[0];
  
  // Insert as individual transaction with current date
  const result = await pool.query(
    `INSERT INTO contribution_transactions (member_id, amount, transaction_date) 
     VALUES ($1, $2, $3) RETURNING *`,
    [member_id, parseFloat(amount), transaction_date]
  );

  return result.rows[0];
}

// Get all contributions (using the renamed view for backward compatibility)
async function getAllContributions() {
  const result = await pool.query(`
    SELECT
      m.id AS member_id, 
      m.first_name, 
      m.middle_name, 
      m.sur_name,
      c.year,
      COALESCE(c.jan, 0) AS jan,
      COALESCE(c.feb, 0) AS feb,
      COALESCE(c.mar, 0) AS mar,
      COALESCE(c.apr, 0) AS apr,
      COALESCE(c.may, 0) AS may,
      COALESCE(c.jun, 0) AS jun,
      COALESCE(c.jul, 0) AS jul,
      COALESCE(c.aug, 0) AS aug,
      COALESCE(c.sep, 0) AS sep,
      COALESCE(c.oct, 0) AS oct,
      COALESCE(c.nov, 0) AS nov,
      COALESCE(c.dec, 0) AS dec,
      COALESCE(c.total_year, 0) AS total_year
    FROM member_contribution c
    JOIN member m ON m.id = c.member_id
    ORDER BY m.id, c.year
  `);

  const rows = result.rows.map(row => ({
    ...row,
    jan: Number(row.jan),
    feb: Number(row.feb),
    mar: Number(row.mar),
    apr: Number(row.apr),
    may: Number(row.may),
    jun: Number(row.jun),
    jul: Number(row.jul),
    aug: Number(row.aug),
    sep: Number(row.sep),
    oct: Number(row.oct),
    nov: Number(row.nov),
    dec: Number(row.dec),
    total_year: Number(row.total_year),
  }));

  return rows;
}

// Get contribution by member ID and year
async function getContributionById(member_id, year) {
  const result = await pool.query(
    `SELECT * FROM member_contribution 
     WHERE member_id = $1 AND year = $2`,
    [member_id, year]
  );
  return result.rows[0];
}

// Enhanced Update: Preserves transaction history with adjustments
async function updateContribution({ member_id, year, month, amount }) {
  console.log('🛠️ DEBUG updateContribution input:', { member_id, year, month, amount });

  if (!member_id || !year || !month || !amount) {
    throw new Error('Missing fields');
  }

  const validMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (!validMonths.includes(month)) {
    throw new Error("Invalid month.");
  }

  const monthNumber = validMonths.indexOf(month) + 1;
  const startDate = `${year}-${monthNumber.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${monthNumber.toString().padStart(2, '0')}-31`;

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // STEP 1: Calculate current total for the month
    const currentResult = await client.query(
      `SELECT SUM(amount) as current_total 
       FROM contribution_transactions 
       WHERE member_id = $1 AND transaction_date >= $2 AND transaction_date <= $3`,
      [member_id, startDate, endDate]
    );
    
    const currentTotal = parseFloat(currentResult.rows[0].current_total) || 0;
    const targetTotal = parseFloat(amount);
    const difference = targetTotal - currentTotal;
    
    console.log(`🔄 Update Calculation: Current=${currentTotal}, Target=${targetTotal}, Difference=${difference}`);
    
    // STEP 2: Handle the difference
    if (difference > 0) {
      // Positive difference: Add adjustment transaction
      console.log(`➕ Adding adjustment transaction: ${difference}`);
      await client.query(
        `INSERT INTO contribution_transactions (member_id, amount, transaction_date) 
         VALUES ($1, $2, $3)`,
        [member_id, difference, new Date().toISOString().split('T')[0]]
      );
    } else if (difference < 0) {
      // Negative difference: Add negative adjustment
      console.log(`➖ Adding negative adjustment: ${difference}`);
      await client.query(
        `INSERT INTO contribution_transactions (member_id, amount, transaction_date) 
         VALUES ($1, $2, $3)`,
        [member_id, difference, new Date().toISOString().split('T')[0]]
      );
    }
    // If difference is 0, no action needed
    
    await client.query('COMMIT');
    console.log('✅ Update completed successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Update failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Get all members (unchanged)
async function getAllMembers() {
  const result = await pool.query(
    'SELECT id, first_name, sur_name FROM member ORDER BY first_name'
  );
  return result.rows;
}

// Get contribution summary (updated to use transactions)
async function getContributionSummary() {
  const result = await pool.query(`
    SELECT 
      m.id AS member_id,
      m.first_name,
      m.middle_name,
      m.sur_name,
      COALESCE(SUM(ct.amount), 0) AS total_contribution
    FROM member m
    LEFT JOIN contribution_transactions ct ON m.id = ct.member_id
    GROUP BY m.id, m.first_name, m.middle_name, m.sur_name
    ORDER BY total_contribution DESC
  `);

  const rows = result.rows.map(r => ({
    member_id: r.member_id,
    full_name: `${r.first_name} ${r.middle_name || ''} ${r.sur_name}`.replace(/\s+/g,' ').trim(),
    total_contribution: Number(r.total_contribution)
  }));

  // Find grand total & max
  const allTotal = rows.reduce((sum, r) => sum + r.total_contribution, 0);
  const maxContribution = Math.max(...rows.map(r => r.total_contribution));

  // Add percentage of total & color indicator
  const withPercentages = rows.map(r => {
    const percentageOfAll = allTotal > 0 ? ((r.total_contribution / allTotal) * 100).toFixed(2) : 0;
    const relativeToMax = maxContribution > 0 ? (r.total_contribution / maxContribution) * 100 : 0;

    let color = 'red';
    if (relativeToMax >= 80) color = 'green';
    else if (relativeToMax >= 50) color = 'yellow';
    else if (relativeToMax >= 20) color = 'orange';

    return { ...r, percentageOfAll, relativeToMax, color };
  });

  return { members: withPercentages, allTotal, maxContribution };
}

// Get detailed transactions for a member
async function getMemberTransactions(member_id, filters = {}) {
  let query = `
    SELECT 
      ct.*,
      m.first_name,
      m.middle_name, 
      m.sur_name
    FROM contribution_transactions ct
    JOIN member m ON m.id = ct.member_id
    WHERE ct.member_id = $1
  `;
  
  const params = [member_id];
  let paramCount = 1;

  if (filters.from) {
    paramCount++;
    query += ` AND ct.transaction_date >= $${paramCount}`;
    params.push(filters.from);
  }

  if (filters.to) {
    paramCount++;
    query += ` AND ct.transaction_date <= $${paramCount}`;
    params.push(filters.to);
  }

  query += ` ORDER BY ct.transaction_date DESC, ct.id DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

// Get transactions with flexible filtering
async function getTransactions(filters = {}) {
  let query = `
    SELECT 
      ct.*,
      m.first_name,
      m.middle_name, 
      m.sur_name
    FROM contribution_transactions ct
    JOIN member m ON m.id = ct.member_id
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 0;

  if (filters.member_id) {
    paramCount++;
    query += ` AND ct.member_id = $${paramCount}`;
    params.push(filters.member_id);
  }

  if (filters.from) {
    paramCount++;
    query += ` AND ct.transaction_date >= $${paramCount}`;
    params.push(filters.from);
  }

  if (filters.to) {
    paramCount++;
    query += ` AND ct.transaction_date <= $${paramCount}`;
    params.push(filters.to);
  }

  if (filters.year) {
    paramCount++;
    query += ` AND ct.year = $${paramCount}`;
    params.push(filters.year);
  }

  query += ` ORDER BY ct.transaction_date DESC, ct.id DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

// Get monthly transactions summary for a specific member and month
async function getMonthlyTransactions(member_id, year, month) {
  const validMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthNumber = validMonths.indexOf(month) + 1;
  const startDate = `${year}-${monthNumber.toString().padStart(2, '0')}-01`;
  const endDate = `${year}-${monthNumber.toString().padStart(2, '0')}-31`;

  const result = await pool.query(
    `SELECT 
      ct.*,
      m.first_name,
      m.middle_name,
      m.sur_name
     FROM contribution_transactions ct
     JOIN member m ON m.id = ct.member_id
     WHERE ct.member_id = $1 
       AND ct.transaction_date >= $2 
       AND ct.transaction_date <= $3
     ORDER BY ct.transaction_date DESC, ct.id DESC`,
    [member_id, startDate, endDate]
  );

  return result.rows;
}

module.exports = {
  addContributionByMonth,
  addContributionTransaction,
  getAllContributions,
  getContributionById,
  updateContribution,
  getAllMembers,
  getContributionSummary,
  getMemberTransactions,
  getTransactions,
  getMonthlyTransactions
};


