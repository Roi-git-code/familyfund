const pool = require('../db');

async function createFundRequest(memberId, requestType, amount, bankAccount, bankName, additionalInfo) {
  const query = `
    INSERT INTO fund_requests (member_id, request_type, amount, bank_account, bank_name, additional_info)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [memberId, requestType, amount, bankAccount, bankName, additionalInfo];
  const result = await pool.query(query, values);
  return result.rows[0];
}



async function getFundRequestsByMember(memberId) {
    const query = `
        SELECT * FROM fund_requests
        WHERE member_id = $1
        ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [memberId]);
    return result.rows;
}

async function getAllFundRequests() {
    const query = `
        SELECT fr.*, m.first_name, m.middle_name, m.sur_name
        FROM fund_requests fr
        JOIN member m ON fr.member_id = m.id
        ORDER BY fr.created_at DESC
    `;
    const result = await pool.query(query);
    return result.rows;
}

async function updateFundRequestStatus(id, status, reason, officerId) {
  const query = `
    UPDATE fund_requests
    SET status = $1,
        reason = $2,
        reviewed_by = $3,
        reviewed_at = NOW(),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $4
    RETURNING *
  `;
  const result = await pool.query(query, [status, reason, officerId, id]);
  return result.rows[0];
}


async function getFundRequestById(id) {
  const query = `SELECT * FROM fund_requests WHERE id = $1`;
  const result = await pool.query(query, [id]);
  return result.rows[0];
}


// Get single fund request with officer details
async function getFundRequestWithOfficer(requestId) {
  const query = `
    SELECT fr.*,
           CONCAT(m.first_name, ' ', m.middle_name, ' ', m.sur_name) AS member_name,
           CONCAT(o.first_name, ' ', o.middle_name, ' ', o.sur_name) AS officer_name,
           u.role AS officer_role
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
    LEFT JOIN member o ON fr.reviewed_by = o.id
    LEFT JOIN users u ON u.member_id = o.id
    WHERE fr.id = $1
  `;
  const result = await pool.query(query, [requestId]);
  return result.rows[0] || null;
}


// Summary grouped by request type
async function getFundRequestSummaryByType() {
  const query = `
    SELECT request_type, COUNT(*) AS total_requests, SUM(amount) AS total_amount
    FROM fund_requests
    GROUP BY request_type
    ORDER BY request_type
  `;
  const result = await pool.query(query);
  return result.rows;
}

// Summary grouped by status
async function getFundRequestSummaryByStatus() {
  const query = `
    SELECT status, COUNT(*) AS total_requests, SUM(amount) AS total_amount
    FROM fund_requests
    GROUP BY status
    ORDER BY status
  `;
  const result = await pool.query(query);
  return result.rows;
}

// Get all fund requests with optional filters
async function getFilteredFundRequests({ requestType, requestStatus, fromDate, toDate }) {
  let query = `
    SELECT fr.*, m.first_name, m.middle_name, m.sur_name
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
    WHERE 1=1
  `;
  const values = [];

  if (requestType) {
    values.push(requestType);
    query += ` AND request_type = $${values.length}`;
  }

  if (requestStatus) {
    values.push(requestStatus);
    query += ` AND status = $${values.length}`;
  }

  if (fromDate) {
    values.push(fromDate);
    query += ` AND created_at >= $${values.length}`;
  }

  if (toDate) {
    values.push(toDate);
    query += ` AND created_at <= $${values.length}`;
  }

  query += ' ORDER BY fr.created_at DESC';

  const result = await pool.query(query, values);
  return result.rows;
}

// Summary grouped by type with optional date filter
async function getFundRequestSummaryByTypeFiltered(fromDate, toDate) {
  let query = `
    SELECT request_type, COUNT(*) AS total_requests, SUM(amount) AS total_amount
    FROM fund_requests
    WHERE 1=1
  `;
  const values = [];

  if (fromDate) {
    values.push(fromDate);
    query += ` AND created_at >= $${values.length}`;
  }

  if (toDate) {
    values.push(toDate);
    query += ` AND created_at <= $${values.length}`;
  }

  query += ' GROUP BY request_type ORDER BY request_type';
  const result = await pool.query(query, values);
  return result.rows;
}

// Summary grouped by status with optional date filter
async function getFundRequestSummaryByStatusFiltered(fromDate, toDate) {
  let query = `
    SELECT status, COUNT(*) AS total_requests, SUM(amount) AS total_amount
    FROM fund_requests
    WHERE 1=1
  `;
  const values = [];

  if (fromDate) {
    values.push(fromDate);
    query += ` AND created_at >= $${values.length}`;
  }

  if (toDate) {
    values.push(toDate);
    query += ` AND created_at <= $${values.length}`;
  }

  query += ' GROUP BY status ORDER BY status';
  const result = await pool.query(query, values);
  return result.rows;
}

// Get fund requests filtered by role (chairman / chief_signatory)
async function getFundRequestsByRole(role) {
  let query = `
    SELECT fr.*, m.first_name, m.middle_name, m.sur_name
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
  `;

  if (role === 'chairman') {
    query += ` WHERE fr.request_type = 'Expenses'`;
  } else if (role === 'chief_signatory') {
    query += ` WHERE fr.request_type <> 'Expenses'`;
  }

  query += ` ORDER BY fr.created_at DESC`;

  const result = await pool.query(query);
  return result.rows;
}

// Summary grouped by status but filtered by role
async function getFundRequestSummaryByStatusAndRole(role) {
  let query = `
    SELECT status, COUNT(*) AS total_requests, SUM(amount) AS total_amount
    FROM fund_requests
    WHERE 1=1
  `;

  if (role === 'chairman') {
    query += ` AND request_type = 'Expenses'`;
  } else if (role === 'chief_signatory') {
    query += ` AND request_type <> 'Expenses'`;
  }

  query += ` GROUP BY status ORDER BY status`;

  const result = await pool.query(query);
  return result.rows;
}

// Get counts for dashboard based on role
async function getDashboardCountsByRole(role) {
  let query = `
    SELECT 
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status IN ('Approved','Rejected') THEN 1 ELSE 0 END) AS reviewed_count
    FROM fund_requests
    WHERE 1=1
  `;

  if (role === 'chairman') {
    query += ` AND request_type = 'Expenses'`;
  } else if (role === 'chief_signatory'||'assistant signatory') {
    query += ` AND request_type != 'Expenses'`;
  }

  const result = await pool.query(query);
  return {
    new_count: Number(result.rows[0].new_count) || 0,
    reviewed_count: Number(result.rows[0].reviewed_count) || 0
  };
}

  module.exports = {
  getDashboardCountsByRole,
  createFundRequest,
  getFundRequestsByMember,
  getAllFundRequests,
  updateFundRequestStatus,
  getFundRequestById,
  getFundRequestWithOfficer,
  getFundRequestSummaryByType,
  getFundRequestSummaryByStatus,
  getFilteredFundRequests,
  getFundRequestSummaryByTypeFiltered,
  getFundRequestSummaryByStatusFiltered,
  getFundRequestsByRole,
  getFundRequestSummaryByStatusAndRole
};


