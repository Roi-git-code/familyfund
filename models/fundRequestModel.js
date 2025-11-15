

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
        SELECT fr.*, m.first_name, m.middle_name, m.sur_name,
               (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id) as vote_count,
               (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id AND vote_type = 'up') as up_votes,
               (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id AND vote_type = 'down') as down_votes
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
           u.role AS officer_role,
           (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id) as vote_count,
           (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id AND vote_type = 'up') as up_votes,
           (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id AND vote_type = 'down') as down_votes
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
    LEFT JOIN member o ON fr.reviewed_by = o.id
    LEFT JOIN users u ON u.member_id = o.id
    WHERE fr.id = $1
  `;
  const result = await pool.query(query, [requestId]);
  return result.rows[0] || null;
}

// NEW: Get fund request with member details for email notifications
async function getFundRequestWithMember(requestId) {
  const query = `
    SELECT fr.*, 
           m.first_name, 
           m.middle_name, 
           m.sur_name, 
           m.email,
           CONCAT(m.first_name, ' ', m.sur_name) AS member_full_name
    FROM fund_requests fr 
    JOIN member m ON fr.member_id = m.id 
    WHERE fr.id = $1
  `;
  const result = await pool.query(query, [requestId]);
  return result.rows[0];
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
    SELECT fr.*, 
           m.first_name, 
           m.middle_name, 
           m.sur_name,
           (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id) as vote_count,
           (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id AND vote_type = 'up') as up_votes,
           (SELECT COUNT(*) FROM fund_request_votes WHERE fund_request_id = fr.id AND vote_type = 'down') as down_votes
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

// Get comprehensive counts for dashboard based on role
async function getDashboardCountsByRole(role) {
  let query = `
    SELECT 
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) AS under_review_count,
      SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved_count,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count,
      SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_count,
      SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
      COUNT(*) as total_count
    FROM fund_requests
    WHERE 1=1
  `;

  if (role === 'chairman') {
    query += ` AND request_type = 'Expenses'`;
  } else if (role === 'chief_signatory') {
    query += ` AND request_type != 'Expenses'`;
  }
  // assistant_signatory sees all requests

  const result = await pool.query(query);
  const row = result.rows[0];
  
  return {
    new_count: Number(row.new_count) || 0,
    under_review_count: Number(row.under_review_count) || 0,
    approved_count: Number(row.approved_count) || 0,
    rejected_count: Number(row.rejected_count) || 0,
    completed_count: Number(row.completed_count) || 0,
    cancelled_count: Number(row.cancelled_count) || 0,
    total_count: Number(row.total_count) || 0
  };
}

// Alternative method to get fund requests by role with proper status filtering
async function getFundRequestsByRole(role) {
  let query = `
    SELECT fr.*, m.first_name, m.middle_name, m.sur_name
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
    WHERE 1=1
  `;

  if (role === 'chairman') {
    query += ` AND fr.request_type = 'Expenses'`;
  } else if (role === 'chief_signatory') {
    query += ` AND fr.request_type != 'Expenses'`;
  }
  // assistant_signatory sees all requests

  query += ` ORDER BY fr.created_at DESC`;

  const result = await pool.query(query);
  return result.rows;
}

// Generate TRN for approved fund requests
async function generateTRN(requestId) {
  try {
    // Count only approved fund requests to get the Y index
    const countQuery = `
      SELECT COUNT(*) as approved_count 
      FROM fund_requests 
      WHERE status = 'Approved' AND id <= $1
    `;
    const countResult = await pool.query(countQuery, [requestId]);
    
    const approvedCount = parseInt(countResult.rows[0].approved_count, 10);
    
    // Generate TRN in format TRN X-Y
    const trn = `TRN ${approvedCount}-${requestId}`;
    
    console.log(`✅ Generated TRN: ${trn} (Request ID: ${requestId}, Approved Index: ${approvedCount})`);
    
    return trn;
  } catch (error) {
    console.error('❌ Error generating TRN:', error);
    // Fallback TRN if counting fails
    return `TRN ${requestId}-1`;
  }
}

// Voting-related methods
async function createVote(fundRequestId, officerId, voteType) {
  const query = `
    INSERT INTO fund_request_votes (fund_request_id, officer_id, vote_type)
    VALUES ($1, $2, $3)
    ON CONFLICT (fund_request_id, officer_id) 
    DO UPDATE SET vote_type = $3, signed_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await pool.query(query, [fundRequestId, officerId, voteType]);
  return result.rows[0];
}

async function getVotesByRequest(fundRequestId) {
  const query = `
    SELECT v.*, 
           m.first_name, 
           m.middle_name, 
           m.sur_name,
           COALESCE(u.role, 'Unknown Role') as officer_role
    FROM fund_request_votes v
    JOIN member m ON v.officer_id = m.id
    LEFT JOIN users u ON u.member_id = m.id
    WHERE v.fund_request_id = $1
    ORDER BY v.signed_at
  `;
  const result = await pool.query(query, [fundRequestId]);
  console.log(`[DEBUG] getVotesByRequest for ${fundRequestId}: Found ${result.rows.length} signatures`);
  console.log(`[DEBUG] Signature details:`, result.rows.map(sig => ({
    officer_id: sig.officer_id,
    name: `${sig.first_name} ${sig.sur_name}`,
    role: sig.officer_role,
    vote_type: sig.vote_type
  })));
  return result.rows;
}


async function getVoteByOfficer(fundRequestId, officerId) {
  const query = `
    SELECT * FROM fund_request_votes 
    WHERE fund_request_id = $1 AND officer_id = $2
  `;
  const result = await pool.query(query, [fundRequestId, officerId]);
  return result.rows[0] || null;
}

async function getVotingSummary(fundRequestId) {
  const query = `
    SELECT 
      COUNT(*) as total_votes,
      SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as up_votes,
      SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as down_votes,
      COUNT(DISTINCT officer_id) as unique_officers
    FROM fund_request_votes 
    WHERE fund_request_id = $1
  `;
  const result = await pool.query(query, [fundRequestId]);
  return result.rows[0];
}

async function hasRequiredSignatures(fundRequestId) {
  const summary = await getVotingSummary(fundRequestId);
  return summary.unique_officers >= 3; // All three officers have voted
}

async function canApproveRequest(fundRequestId) {
  const signatureCount = await getSignatureCount(fundRequestId);
  
  // Convert string values to numbers
  const totalSignatures = Number(signatureCount.total_signatures);
  const upSignatures = Number(signatureCount.up_signatures);
  
  console.log(`[DEBUG] canApproveRequest for ${fundRequestId}:`, {
    total_signatures: totalSignatures,
    up_signatures: upSignatures,
    required: totalSignatures >= 3 && upSignatures === 3
  });
  
  return totalSignatures >= 3 && upSignatures === 3;
}

async function canRejectRequest(fundRequestId) {
  const signatureCount = await getSignatureCount(fundRequestId);
  
  // Convert string values to numbers
  const totalSignatures = Number(signatureCount.total_signatures);
  const downSignatures = Number(signatureCount.down_signatures);
  
  console.log(`[DEBUG] canRejectRequest for ${fundRequestId}:`, {
    total_signatures: totalSignatures,
    down_signatures: downSignatures,
    required: totalSignatures >= 3 && downSignatures === 3
  });
  
  return totalSignatures >= 3 && downSignatures === 3;
}


async function getEligibleOfficers() {
  const query = `
    SELECT m.id, m.first_name, m.middle_name, m.sur_name, u.role
    FROM member m
    JOIN users u ON u.member_id = m.id
    WHERE u.role IN ('assistant_signatory', 'chief_signatory', 'chairman')
    AND u.status = 'active'
  `;
  const result = await pool.query(query);
  return result.rows;
}

// Get fund request with all signatures for PDF and modal
async function getFundRequestWithSignatures(requestId) {
  const query = `
    SELECT fr.*,
           CONCAT(m.first_name, ' ', m.middle_name, ' ', m.sur_name) AS member_name,
           CONCAT(o.first_name, ' ', o.middle_name, ' ', o.sur_name) AS officer_name,
           u.role AS officer_role,
           (SELECT json_agg(json_build_object(
             'first_name', sig.first_name,
             'middle_name', sig.middle_name, 
             'sur_name', sig.sur_name,
             'role', sig_role.role,
             'vote_type', v.vote_type,
             'signed_at', v.signed_at
           )) 
           FROM fund_request_votes v
           JOIN member sig ON v.officer_id = sig.id
           JOIN users sig_role ON sig_role.member_id = sig.id
           WHERE v.fund_request_id = fr.id) as signatures
    FROM fund_requests fr
    JOIN member m ON fr.member_id = m.id
    LEFT JOIN member o ON fr.reviewed_by = o.id
    LEFT JOIN users u ON u.member_id = o.id
    WHERE fr.id = $1
  `;
  const result = await pool.query(query, [requestId]);
  return result.rows[0] || null;
}

// Fix signature counting method - ADD THIS METHOD
async function getSignatureCount(fundRequestId) {
  const query = `
    SELECT COUNT(*) as total_signatures,
           SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as up_signatures,
           SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as down_signatures
    FROM fund_request_votes 
    WHERE fund_request_id = $1
  `;
  const result = await pool.query(query, [fundRequestId]);
  const row = result.rows[0];
  
  // Convert string values to numbers
  return {
    total_signatures: Number(row.total_signatures),
    up_signatures: Number(row.up_signatures),
    down_signatures: Number(row.down_signatures)
  };
}

// debugging methods for sinature issues
async function debugSignatures(fundRequestId) {
  const query = `
    SELECT 
      v.*,
      m.first_name,
      m.middle_name, 
      m.sur_name,
      COALESCE(u.role, 'Unknown Role') as officer_role
    FROM fund_request_votes v
    JOIN member m ON v.officer_id = m.id
    LEFT JOIN users u ON u.member_id = m.id
    WHERE v.fund_request_id = $1
    ORDER BY v.signed_at
  `;
  const result = await pool.query(query, [fundRequestId]);
  console.log(`[DEBUG] All signatures for request ${fundRequestId}:`, result.rows);
  return result.rows;
}

async function getDetailedSignatureSummary(fundRequestId) {
  const query = `
    SELECT 
      COUNT(*) as total_count,
      COUNT(DISTINCT officer_id) as unique_officers,
      SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as up_count,
      SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as down_count,
      ARRAY_AGG(officer_id) as officer_ids,
      ARRAY_AGG(vote_type) as vote_types
    FROM fund_request_votes 
    WHERE fund_request_id = $1
  `;
  const result = await pool.query(query, [fundRequestId]);
  console.log(`[DEBUG] Detailed signature summary for request ${fundRequestId}:`, result.rows[0]);
  return result.rows[0];
}

module.exports = {
  getSignatureCount,
  debugSignatures,
  getDetailedSignatureSummary,
  getDashboardCountsByRole,
  createFundRequest,
  getFundRequestsByMember,
  getAllFundRequests,
  updateFundRequestStatus,
  getFundRequestById,
  getFundRequestWithOfficer,
  getFundRequestWithMember,
  getFundRequestSummaryByType,
  getFundRequestSummaryByStatus,
  getFilteredFundRequests,
  getFundRequestSummaryByTypeFiltered,
  getFundRequestSummaryByStatusFiltered,
  getFundRequestsByRole,
  getFundRequestSummaryByStatusAndRole,
  generateTRN,
  createVote,
  getVotesByRequest,
  getVoteByOfficer,
  getVotingSummary,
  hasRequiredSignatures,
  canApproveRequest,
  canRejectRequest,
  getEligibleOfficers,
  getFundRequestWithSignatures
};


