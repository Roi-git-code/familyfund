const pool = require('../db');

async function getMemberProfileByEmail(email) {
  const result = await pool.query('SELECT * FROM member WHERE email = $1', [email]);
  return result.rows[0];
}

async function getMemberContributions(member_id) {
  const result = await pool.query(`
    SELECT
      year,
      COALESCE(jan, 0) AS jan,
      COALESCE(feb, 0) AS feb,
      COALESCE(mar, 0) AS mar,
      COALESCE(apr, 0) AS apr,
      COALESCE(may, 0) AS may,
      COALESCE(jun, 0) AS jun,
      COALESCE(jul, 0) AS jul,
      COALESCE(aug, 0) AS aug,
      COALESCE(sep, 0) AS sep,
      COALESCE(oct, 0) AS oct,
      COALESCE(nov, 0) AS nov,
      COALESCE(dec, 0) AS dec,
      (
        COALESCE(jan, 0) + COALESCE(feb, 0) + COALESCE(mar, 0) +
        COALESCE(apr, 0) + COALESCE(may, 0) + COALESCE(jun, 0) +
        COALESCE(jul, 0) + COALESCE(aug, 0) + COALESCE(sep, 0) +
        COALESCE(oct, 0) + COALESCE(nov, 0) + COALESCE(dec, 0)
      ) AS total_year
    FROM member_contribution
    WHERE member_id = $1
    ORDER BY year DESC
  `, [member_id]);
  return result.rows;
}

async function getLifetimeTotals(member_id) {
  // Total for this member
  const memberTotalRes = await pool.query(`
    SELECT SUM(
      COALESCE(jan, 0) + COALESCE(feb, 0) + COALESCE(mar, 0) +
      COALESCE(apr, 0) + COALESCE(may, 0) + COALESCE(jun, 0) +
      COALESCE(jul, 0) + COALESCE(aug, 0) + COALESCE(sep, 0) +
      COALESCE(oct, 0) + COALESCE(nov, 0) + COALESCE(dec, 0)
    ) AS total
    FROM member_contribution
    WHERE member_id = $1
  `, [member_id]);

  const memberTotal = Number(memberTotalRes.rows[0].total || 0);

  // Total for all members
  const allTotalRes = await pool.query(`
    SELECT SUM(
      COALESCE(jan, 0) + COALESCE(feb, 0) + COALESCE(mar, 0) +
      COALESCE(apr, 0) + COALESCE(may, 0) + COALESCE(jun, 0) +
      COALESCE(jul, 0) + COALESCE(aug, 0) + COALESCE(sep, 0) +
      COALESCE(oct, 0) + COALESCE(nov, 0) + COALESCE(dec, 0)
    ) AS total
    FROM member_contribution
  `);

  const allTotal = Number(allTotalRes.rows[0].total || 0);

  // Percentage
  const percentage = allTotal > 0 ? ((memberTotal / allTotal) * 100).toFixed(2) : 0;

  return { memberTotal, allTotal, percentage };
}


// Add this to userLandingModel.js
async function getMemberUpdateRequests(memberId) {
  const query = `
    SELECT id, status, created_at
    FROM user_requests
    WHERE member_id = $1
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [memberId]);
  return result.rows;
}

// And add to exports:
module.exports = {
  // ... existing exports ...
  getMemberUpdateRequests
};

module.exports = { 
  getMemberProfileByEmail, 
  getMemberContributions,
  getLifetimeTotals,
  getMemberUpdateRequests
};

