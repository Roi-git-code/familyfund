// models/contributionModel.js
const pool = require('../db');

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



  const existing = await pool.query(
    `SELECT * FROM member_contribution WHERE member_id = $1 AND year = $2`,
    [member_id, year]
  );

  if (existing.rows.length > 0) {
    // Update specific month
    await pool.query(
      `UPDATE member_contribution SET ${month} = COALESCE(${month}, 0) + $1 WHERE member_id = $2 AND year = $3`,
      [amount, member_id, year]
    );
  } else {
    // Insert new row
    const fields = ['member_id', 'year', ...validMonths];
    const values = validMonths.map(m => (m === month ? amount : 0));
    await pool.query(
      `INSERT INTO member_contribution (${fields.join(',')}) VALUES ($1, $2, ${values.map((_, i) => `$${i + 3}`).join(', ')})`,
      [member_id, year, ...values]
    );
  }
    return { status: 'success' };
  }


async function getAllContributions() {
  const result = await pool.query(`
    SELECT
      m.id AS member_id, m.first_name, m.middle_name, m.sur_name,
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
      (
        COALESCE(c.jan, 0) + COALESCE(c.feb, 0) + COALESCE(c.mar, 0) +
        COALESCE(c.apr, 0) + COALESCE(c.may, 0) + COALESCE(c.jun, 0) +
        COALESCE(c.jul, 0) + COALESCE(c.aug, 0) + COALESCE(c.sep, 0) +
        COALESCE(c.oct, 0) + COALESCE(c.nov, 0) + COALESCE(c.dec, 0)
      ) AS total_year
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

// Get a single contribution row by ID and year (from member_contribution)
async function getContributionById(member_id, year) {
  const result = await pool.query(
    'SELECT * FROM member_contribution WHERE member_id = $1 AND year = $2',
    [member_id, year]
  );
  return result.rows[0];
}


// Update a single month's contribution
// New version: update by key fields (member_id + year + month)
async function updateContribution({ member_id, year, month, amount }) {
console.log('🛠️ DEBUG updateContribution input:', { member_id, year, month, amount });


  if (!member_id || !year || !month || !amount) {
    throw new Error('Missing fields');
  }

  const validMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  if (!validMonths.includes(month)) {
    throw new Error("Invalid month.");
  }



  await pool.query(`
    UPDATE member_contribution
    SET ${month} = $1
    WHERE member_id = $2 AND year = $3
  `, [parseFloat(amount), member_id, year]);
}

async function getAllMembers() {
  const result = await pool.query(
    'SELECT id, first_name, sur_name FROM member ORDER BY first_name'
  );
  return result.rows;
}


async function getContributionSummary() {
  const result = await pool.query(`
    SELECT 
      m.id AS member_id,
      m.first_name,
      m.middle_name,
      m.sur_name,
      SUM(
        COALESCE(c.jan, 0) + COALESCE(c.feb, 0) + COALESCE(c.mar, 0) +
        COALESCE(c.apr, 0) + COALESCE(c.may, 0) + COALESCE(c.jun, 0) +
        COALESCE(c.jul, 0) + COALESCE(c.aug, 0) + COALESCE(c.sep, 0) +
        COALESCE(c.oct, 0) + COALESCE(c.nov, 0) + COALESCE(c.dec, 0)
      ) AS total_contribution
    FROM member m
    LEFT JOIN member_contribution c ON m.id = c.member_id
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

module.exports = {
  addContributionByMonth,
  getAllContributions,
  getContributionById,
  updateContribution,
  getAllMembers,
  getContributionSummary
};

