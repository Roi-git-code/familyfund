
const pool = require('../db');
const notificationModel = require('./notificationModel');

// Helper: Calculate EMI for reducing balance
function calculateEMI(principal, annualRate, tenureMonths) {
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate === 0) {
    return principal / tenureMonths;
  }
  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths) /
              (Math.pow(1 + monthlyRate, tenureMonths) - 1);
  return emi;
}

// --- Create a loan application ------------------------------------------------
async function createLoan(memberId, loanData) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] createLoan called for member ${memberId} with data:`, loanData);

  const {
    loan_type,
    amount,
    tenure_months,
    purpose,
    bank_account,
    bank_name,
    additional_info,
    attachments
  } = loanData;

  let interest_rate;
  let max_amount;
  let max_tenure;
  if (loan_type === 'service') {
    interest_rate = 12;
    max_amount = 500000;
    max_tenure = 12;
  } else if (loan_type === 'investment') {
    interest_rate = 13;
    max_amount = 2000000;
    max_tenure = 24;
  } else {
    throw new Error('Invalid loan type');
  }

  if (amount > max_amount) {
    throw new Error(`Maximum amount for ${loan_type} loan is TSh ${max_amount.toLocaleString()}`);
  }
  if (tenure_months > max_tenure) {
    throw new Error(`Maximum tenure for ${loan_type} loan is ${max_tenure} months`);
  }

  const monthlyPayment = calculateEMI(amount, interest_rate, tenure_months);
  const totalRepayable = monthlyPayment * tenure_months;
  const totalInterest = totalRepayable - amount;

  const attachmentsJson = attachments && attachments.length > 0
    ? JSON.stringify(attachments)
    : null;

  const query = `
    INSERT INTO loans (
      member_id, loan_type, amount, interest_rate, tenure_months,
      monthly_payment, total_interest, total_repayable, purpose,
      bank_account, bank_name, additional_info, attachments,
      paid_amount, remaining_balance
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *
  `;
  const values = [
    memberId,
    loan_type,
    amount,
    interest_rate,
    tenure_months,
    monthlyPayment,
    totalInterest,
    totalRepayable,
    purpose,
    bank_account,
    bank_name,
    additional_info || null,
    attachmentsJson,
    0,
    totalRepayable
  ];

  try {
    const result = await pool.query(query, values);
    console.log(`[${ts}] [LOAN MODEL] Loan created successfully, ID: ${result.rows[0].id}`);
    return result.rows[0];
  } catch (err) {
    console.error(`[${ts}] [LOAN MODEL] Error creating loan:`, err.message);
    throw err;
  }
}

// --- Get all loans for a member -----------------------------------------------
async function getLoansByMember(memberId) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getLoansByMember called for member ${memberId}`);
  const query = `
    SELECT * FROM loans
    WHERE member_id = $1
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [memberId]);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} loans for member ${memberId}`);
  return result.rows;
}

// --- Get all loans (admin) with filters ---------------------------------------
async function getAllLoans(filters = {}) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getAllLoans called with filters:`, filters);
  let query = `
    SELECT l.*, m.first_name, m.middle_name, m.sur_name,
           (SELECT COUNT(*) FROM loan_votes WHERE loan_id = l.id) as vote_count,
           (SELECT COUNT(*) FROM loan_votes WHERE loan_id = l.id AND vote_type = 'up') as up_votes,
           (SELECT COUNT(*) FROM loan_votes WHERE loan_id = l.id AND vote_type = 'down') as down_votes
    FROM loans l
    JOIN member m ON l.member_id = m.id
    WHERE 1=1
  `;
  const values = [];

  if (filters.loan_type) {
    values.push(filters.loan_type);
    query += ` AND l.loan_type = $${values.length}`;
  }
  if (filters.status) {
    values.push(filters.status);
    query += ` AND l.status = $${values.length}`;
  }
  if (filters.fromDate) {
    values.push(filters.fromDate);
    query += ` AND l.created_at >= $${values.length}`;
  }
  if (filters.toDate) {
    values.push(filters.toDate);
    query += ` AND l.created_at <= $${values.length}`;
  }
  query += ' ORDER BY l.created_at DESC';
  const result = await pool.query(query, values);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} loans`);
  return result.rows;
}

// --- Get a single loan with details (including repayment schedule and restructure links) -----------
async function getLoanById(loanId) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getLoanById called for loan ${loanId}`);
  const query = `
    SELECT l.*, m.first_name, m.middle_name, m.sur_name, m.email
    FROM loans l
    JOIN member m ON l.member_id = m.id
    WHERE l.id = $1
  `;
  const result = await pool.query(query, [loanId]);
  if (result.rows.length === 0) {
    console.log(`[${ts}] [LOAN MODEL] No loan found with ID ${loanId}`);
    return null;
  }
  const loan = result.rows[0];

  // Get repayments
  const repaymentsQuery = `
    SELECT * FROM loan_repayments
    WHERE loan_id = $1
    ORDER BY due_date
  `;
  const repaymentsResult = await pool.query(repaymentsQuery, [loanId]);
  loan.repayments = repaymentsResult.rows;

  // Calculate paid amount and remaining balance
  let paidAmount = 0;
  for (const r of loan.repayments) {
    paidAmount += Number(r.amount_paid);
  }
  loan.paid_amount = paidAmount;
  loan.remaining_balance = loan.total_repayable - paidAmount;

  // Restructuring relationships
  if (loan.parent_loan_id) {
    const parentQuery = `SELECT id, amount, total_repayable, paid_amount, status FROM loans WHERE id = $1`;
    const parentRes = await pool.query(parentQuery, [loan.parent_loan_id]);
    loan.parent_loan = parentRes.rows[0] || null;
  }
  const childrenQuery = `SELECT id, amount, total_repayable, paid_amount, status FROM loans WHERE parent_loan_id = $1`;
  const childrenRes = await pool.query(childrenQuery, [loanId]);
  loan.restructured_loans = childrenRes.rows;

  console.log(`[${ts}] [LOAN MODEL] Retrieved loan ${loanId}, repayments: ${loan.repayments.length}, restructured children: ${loan.restructured_loans.length}`);
  return loan;
}

// --- Update loan status (approve/reject) --------------------------------------
async function updateLoanStatus(loanId, status, reason, officerId, disbursement_trn = null) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] updateLoanStatus called: loan=${loanId}, status=${status}, reason=${reason}, officer=${officerId}, trn=${disbursement_trn}`);
  const query = `
    UPDATE loans
    SET status = $1, reason = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW(),
        disbursement_trn = COALESCE($5, disbursement_trn)
    WHERE id = $4
    RETURNING *
  `;
  const result = await pool.query(query, [status, reason, officerId, loanId, disbursement_trn]);
  if (result.rows.length === 0) {
    console.error(`[${ts}] [LOAN MODEL] Loan not found when updating status`);
    throw new Error('Loan not found');
  }
  console.log(`[${ts}] [LOAN MODEL] Loan ${loanId} status updated to ${status}`);
  return result.rows[0];
}

// --- Generate amortization schedule (for display, not stored) ----------------
function generateAmortizationSchedule(loan) {
  const { amount, interest_rate, tenure_months, monthly_payment } = loan;
  const schedule = [];
  let balance = amount;
  const monthlyRate = interest_rate / 100 / 12;

  for (let i = 1; i <= tenure_months; i++) {
    let interest = balance * monthlyRate;
    let principal = monthly_payment - interest;
    if (balance < monthly_payment) {
      principal = balance;
      interest = 0;
    }
    balance -= principal;
    schedule.push({
      installment_no: i,
      due_date: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000),
      payment_due: monthly_payment,
      interest,
      principal,
      remaining_balance: Math.max(0, balance)
    });
  }
  return schedule;
}

// --- Create repayment records when loan is approved (idempotent) ----------
async function createRepaymentSchedule(loanId, startDate = new Date()) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] createRepaymentSchedule called for loan ${loanId}`);

  await pool.query('DELETE FROM loan_repayments WHERE loan_id = $1', [loanId]);

  const loan = await getLoanById(loanId);
  if (!loan) throw new Error('Loan not found');

  const schedule = generateAmortizationSchedule(loan);
  for (const inst of schedule) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + inst.installment_no);
    await pool.query(
      `INSERT INTO loan_repayments (loan_id, due_date, amount_due)
       VALUES ($1, $2, $3)`,
      [loanId, dueDate, inst.payment_due]
    );
  }
  console.log(`[${ts}] [LOAN MODEL] Created ${schedule.length} repayment records for loan ${loanId}`);
}

// --- Record a repayment (single installment) --------------------------------
async function recordRepayment(repaymentId, amount, transactionId = null) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] recordRepayment called for repayment ${repaymentId}, amount=${amount}`);
  const repayment = await pool.query('SELECT * FROM loan_repayments WHERE id = $1', [repaymentId]);
  if (repayment.rows.length === 0) throw new Error('Repayment record not found');
  const rec = repayment.rows[0];

  const newPaid = rec.amount_paid + amount;
  const newStatus = newPaid >= rec.amount_due ? 'Paid' : (newPaid > 0 ? 'Partial' : 'Pending');
  const query = `
    UPDATE loan_repayments
    SET amount_paid = $1, payment_date = NOW(), status = $2, transaction_id = $3
    WHERE id = $4
    RETURNING *
  `;
  const result = await pool.query(query, [newPaid, newStatus, transactionId, repaymentId]);

  const loan = await getLoanById(rec.loan_id);
  const newPaidTotal = (loan.paid_amount || 0) + amount;
  const newRemaining = loan.total_repayable - newPaidTotal;
  await pool.query(
    `UPDATE loans SET paid_amount = $1, remaining_balance = $2 WHERE id = $3`,
    [newPaidTotal, newRemaining, rec.loan_id]
  );

  const allPaid = loan.repayments.every(r => r.status === 'Paid');
  if (allPaid) {
    await updateLoanStatus(rec.loan_id, 'Completed', null, null);
  }
  console.log(`[${ts}] [LOAN MODEL] Repayment recorded, new status: ${newStatus}`);
  return result.rows[0];
}

// --- Record a repayment that may cover multiple installments ---------------
async function recordRepaymentMultiple(loanId, amount, transactionId = null, notes = null, repayment_trn = null) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] recordRepaymentMultiple called for loan ${loanId}, amount=${amount}, trn=${repayment_trn}`);

  const pendingQuery = `
    SELECT * FROM loan_repayments
    WHERE loan_id = $1 AND status != 'Paid'
    ORDER BY due_date
  `;
  const pendingResult = await pool.query(pendingQuery, [loanId]);
  const pending = pendingResult.rows;

  if (pending.length === 0) {
    throw new Error('No pending repayments found for this loan');
  }

  let remainingAmount = amount;

  for (const repayment of pending) {
    const due = Number(repayment.amount_due);
    const alreadyPaid = Number(repayment.amount_paid);
    const dueRemaining = due - alreadyPaid;

    if (remainingAmount <= 0) break;

    const payAmount = Math.min(remainingAmount, dueRemaining);
    const newPaid = alreadyPaid + payAmount;
    const newStatus = newPaid >= due ? 'Paid' : 'Partial';

    await pool.query(
      `UPDATE loan_repayments
       SET amount_paid = $1, payment_date = NOW(), status = $2, transaction_id = $3, notes = $4,
           repayment_trn = COALESCE($5, repayment_trn)
       WHERE id = $6`,
      [newPaid, newStatus, transactionId, notes, repayment_trn, repayment.id]
    );

    remainingAmount -= payAmount;
  }

  if (remainingAmount > 0) {
    throw new Error('Payment amount exceeds total remaining balance');
  }

  const loan = await pool.query('SELECT total_repayable, paid_amount FROM loans WHERE id = $1', [loanId]);
  const currentPaid = Number(loan.rows[0].paid_amount);
  const newPaidTotal = currentPaid + amount;
  const remainingBalance = loan.rows[0].total_repayable - newPaidTotal;

  await pool.query(
    `UPDATE loans SET paid_amount = $1, remaining_balance = $2, updated_at = NOW() WHERE id = $3`,
    [newPaidTotal, remainingBalance, loanId]
  );

  if (remainingBalance <= 0) {
    await pool.query(
      `UPDATE loans SET status = 'Completed', updated_at = NOW() WHERE id = $1`,
      [loanId]
    );
  }

  console.log(`[${ts}] [LOAN MODEL] Repayment recorded successfully for loan ${loanId}, amount ${amount}`);
}

// --- Voting methods -----------------------------------------------------------
async function createVote(loanId, officerId, voteType) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] createVote called: loan=${loanId}, officer=${officerId}, vote=${voteType}`);
  const query = `
    INSERT INTO loan_votes (loan_id, officer_id, vote_type)
    VALUES ($1, $2, $3)
    ON CONFLICT (loan_id, officer_id)
    DO UPDATE SET vote_type = $3, signed_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await pool.query(query, [loanId, officerId, voteType]);
  console.log(`[${ts}] [LOAN MODEL] Vote recorded for loan ${loanId}`);
  return result.rows[0];
}

async function getVotesByLoan(loanId) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getVotesByLoan called for loan ${loanId}`);
  const query = `
    SELECT v.*, m.first_name, m.middle_name, m.sur_name, u.role as officer_role
    FROM loan_votes v
    JOIN member m ON v.officer_id = m.id
    LEFT JOIN users u ON u.member_id = m.id
    WHERE v.loan_id = $1
    ORDER BY v.signed_at
  `;
  const result = await pool.query(query, [loanId]);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} votes for loan ${loanId}`);
  return result.rows;
}

async function getVoteByOfficer(loanId, officerId) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getVoteByOfficer called: loan=${loanId}, officer=${officerId}`);
  const query = `
    SELECT * FROM loan_votes WHERE loan_id = $1 AND officer_id = $2
  `;
  const result = await pool.query(query, [loanId, officerId]);
  return result.rows[0] || null;
}

async function getVotingSummary(loanId) {
  const ts = new Date().toISOString();
  const query = `
    SELECT
      COUNT(*) as total_votes,
      SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as up_votes,
      SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as down_votes,
      COUNT(DISTINCT officer_id) as unique_officers
    FROM loan_votes
    WHERE loan_id = $1
  `;
  const result = await pool.query(query, [loanId]);
  const row = result.rows[0];
  const summary = {
    total_votes: Number(row.total_votes),
    up_votes: Number(row.up_votes),
    down_votes: Number(row.down_votes),
    unique_officers: Number(row.unique_officers)
  };
  console.log(`[${ts}] [LOAN MODEL] Voting summary for loan ${loanId}: total=${summary.total_votes}, up=${summary.up_votes}, down=${summary.down_votes}, unique=${summary.unique_officers}`);
  return summary;
}

async function getApprovalStatus(loanId) {
  const ts = new Date().toISOString();
  const summary = await getVotingSummary(loanId);
  const canApprove = summary.unique_officers >= 3 && summary.up_votes === 3;
  let reason = '';
  if (!canApprove) {
    if (summary.unique_officers < 3) {
      reason = `Only ${summary.unique_officers} distinct officers have signed. All three officers must sign UP for approval.`;
    } else if (summary.up_votes < 3) {
      reason = `${summary.up_votes} UP signatures, but all three must be UP.`;
    } else {
      reason = 'Unknown condition preventing approval.';
    }
  }
  console.log(`[${ts}] [LOAN MODEL] Approval status for loan ${loanId}: canApprove=${canApprove}, reason=${reason}`);
  return { canApprove, reason };
}

async function getRejectionStatus(loanId) {
  const ts = new Date().toISOString();
  const summary = await getVotingSummary(loanId);
  const canReject = summary.unique_officers >= 3 && summary.down_votes === 3;
  let reason = '';
  if (!canReject) {
    if (summary.unique_officers < 3) {
      reason = `Only ${summary.unique_officers} distinct officers have signed. All three officers must sign DOWN for rejection.`;
    } else if (summary.down_votes < 3) {
      reason = `${summary.down_votes} DOWN signatures, but all three must be DOWN.`;
    } else {
      reason = 'Unknown condition preventing rejection.';
    }
  }
  console.log(`[${ts}] [LOAN MODEL] Rejection status for loan ${loanId}: canReject=${canReject}, reason=${reason}`);
  return { canReject, reason };
}

// Legacy functions for backward compatibility
async function canApproveLoan(loanId) {
  const { canApprove } = await getApprovalStatus(loanId);
  return canApprove;
}

async function canRejectLoan(loanId) {
  const { canReject } = await getRejectionStatus(loanId);
  return canReject;
}

// --- Get eligible officers (with email) ------------------------------------

/*
async function getEligibleOfficers() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getEligibleOfficers called`);
  const query = `
    SELECT m.id, m.first_name, m.middle_name, m.sur_name, u.role, u.email
    FROM member m
    JOIN users u ON u.member_id = m.id
    WHERE u.role IN ('assistant_signatory', 'chief_signatory', 'chairman')
    AND u.status = 'active'
  `;
  const result = await pool.query(query);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} eligible officers`);
  return result.rows;
}
*/
/*
async function getEligibleOfficers() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getEligibleOfficers called`);
  const query = `
    SELECT m.id, m.first_name, m.middle_name, m.sur_name, u.role, m.email
    FROM member m
    JOIN users u ON u.member_id = m.id
    WHERE u.role IN ('assistant_signatory', 'chief_signatory', 'chairman')
    AND u.status = 'active'
  `;
  const result = await pool.query(query);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} eligible officers`);
  return result.rows;
}
*/

async function getEligibleOfficers() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getEligibleOfficers called`);
  const query = `
    SELECT m.id, m.first_name, m.middle_name, m.sur_name, u.role, m.email
    FROM member m
    JOIN users u ON u.member_id = m.id
    WHERE u.role IN ('assistant_signatory', 'chief_signatory', 'chairman')
  `;
  const result = await pool.query(query);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} eligible officers`);
  return result.rows;
}

// --- Summary counts for dashboard ---------------------------------------------
async function getLoanDashboardCountsByRole(role) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getLoanDashboardCountsByRole called with role: ${role}`);
  let query = `
    SELECT
      COUNT(*) as total_loans,
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'Under Review' THEN 1 ELSE 0 END) as under_review,
      SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'Defaulted' THEN 1 ELSE 0 END) as defaulted
    FROM loans
    WHERE 1=1
  `;
  if (role === 'chairman') {
    query += ` AND loan_type = 'service'`;
  } else if (role === 'chief_signatory') {
    query += ` AND loan_type = 'investment'`;
  }
  const result = await pool.query(query);
  const row = result.rows[0];
  const counts = {
    total_loans: Number(row.total_loans) || 0,
    pending: Number(row.pending) || 0,
    under_review: Number(row.under_review) || 0,
    approved: Number(row.approved) || 0,
    rejected: Number(row.rejected) || 0,
    completed: Number(row.completed) || 0,
    defaulted: Number(row.defaulted) || 0
  };
  console.log(`[${ts}] [LOAN MODEL] Dashboard counts:`, counts);
  return counts;
}

// Get loans that are approved and have remaining balance > 0
async function getLoansForRepayment() {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [LOAN MODEL] getLoansForRepayment called`);
  const query = `
    SELECT l.id, l.member_id, l.amount, l.interest_rate, l.tenure_months, l.monthly_payment,
           l.total_repayable, l.paid_amount,
           (l.total_repayable - l.paid_amount) as remaining_balance,
           m.first_name, m.sur_name
    FROM loans l
    JOIN member m ON l.member_id = m.id
    WHERE l.status = 'Approved' AND (l.total_repayable - l.paid_amount) > 0
    ORDER BY l.id
  `;
  const result = await pool.query(query);
  console.log(`[${ts}] [LOAN MODEL] Found ${result.rows.length} loans for repayment`);
  return result.rows;
}

// --- Loan Restructuring -------------------------------------------------

// Create a restructuring request
async function createRestructuringRequest(memberId, loanId, newTenure, reason) {
    const ts = new Date().toISOString();
    console.log(`[${ts}] [LOAN MODEL] createRestructuringRequest: member=${memberId}, loan=${loanId}, newTenure=${newTenure}`);
    
    const loan = await getLoanById(loanId);
    if (!loan) throw new Error('Loan not found');
    if (loan.status !== 'Approved') throw new Error('Only approved loans can be restructured');
    if (loan.member_id !== memberId) throw new Error('Unauthorized');

    let maxTenure;
    if (loan.loan_type === 'service') maxTenure = 12;
    else maxTenure = 24;
    if (newTenure > maxTenure) throw new Error(`Maximum tenure for ${loan.loan_type} loans is ${maxTenure} months`);
    if (newTenure <= 0) throw new Error('Tenure must be positive');

    const remainingBalance = loan.remaining_balance;
    const monthlyRate = loan.interest_rate / 100 / 12;
    let newMonthlyPayment, newTotalInterest, newTotalRepayable;

    if (monthlyRate === 0) {
        newMonthlyPayment = remainingBalance / newTenure;
        newTotalInterest = 0;
    } else {
        newMonthlyPayment = remainingBalance * monthlyRate * Math.pow(1 + monthlyRate, newTenure) /
                            (Math.pow(1 + monthlyRate, newTenure) - 1);
        newTotalInterest = newMonthlyPayment * newTenure - remainingBalance;
    }
    newTotalRepayable = remainingBalance + newTotalInterest;

    const query = `
        INSERT INTO loan_restructuring_requests
        (loan_id, member_id, new_tenure_months, current_tenure_months,
         proposed_monthly_payment, proposed_total_interest, proposed_total_repayable,
         reason)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `;
    const values = [
        loanId, memberId, newTenure, loan.tenure_months,
        newMonthlyPayment, newTotalInterest, newTotalRepayable,
        reason
    ];
    const result = await pool.query(query, values);
    console.log(`[${ts}] [LOAN MODEL] Restructuring request created, ID: ${result.rows[0].id}`);
    return result.rows[0];
}

// Get all restructuring requests (for admin, with filters)
async function getAllRestructuringRequests(filters = {}) {
    const ts = new Date().toISOString();
    let query = `
        SELECT r.*, l.loan_type, l.interest_rate, l.amount as original_amount,
               m.first_name, m.sur_name,
               (SELECT COUNT(*) FROM restructuring_votes WHERE request_id = r.id) as vote_count,
               (SELECT COUNT(*) FROM restructuring_votes WHERE request_id = r.id AND vote_type = 'up') as up_votes,
               (SELECT COUNT(*) FROM restructuring_votes WHERE request_id = r.id AND vote_type = 'down') as down_votes
        FROM loan_restructuring_requests r
        JOIN loans l ON r.loan_id = l.id
        JOIN member m ON r.member_id = m.id
        WHERE 1=1
    `;
    const values = [];
    if (filters.status) {
        values.push(filters.status);
        query += ` AND r.status = $${values.length}`;
    }
    if (filters.loan_type) {
        values.push(filters.loan_type);
        query += ` AND l.loan_type = $${values.length}`;
    }
    query += ' ORDER BY r.created_at DESC';
    const result = await pool.query(query, values);
    return result.rows;
}

// Get requests for a specific member
async function getRestructuringRequestsByMember(memberId) {
    const query = `
        SELECT r.*, l.loan_type, l.interest_rate, l.amount as original_amount,
               l.remaining_balance as current_balance
        FROM loan_restructuring_requests r
        JOIN loans l ON r.loan_id = l.id
        WHERE r.member_id = $1
        ORDER BY r.created_at DESC
    `;
    const result = await pool.query(query, [memberId]);
    return result.rows;
}

// Vote on a restructuring request
async function createRestructuringVote(requestId, officerId, voteType) {
    const ts = new Date().toISOString();
    const query = `
        INSERT INTO restructuring_votes (request_id, officer_id, vote_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (request_id, officer_id)
        DO UPDATE SET vote_type = $3, signed_at = CURRENT_TIMESTAMP
        RETURNING *
    `;
    const result = await pool.query(query, [requestId, officerId, voteType]);
    return result.rows[0];
}

// Get votes for a restructuring request
async function getRestructuringVotes(requestId) {
    const query = `
        SELECT v.*, m.first_name, m.sur_name, u.role as officer_role
        FROM restructuring_votes v
        JOIN member m ON v.officer_id = m.id
        LEFT JOIN users u ON u.member_id = m.id
        WHERE v.request_id = $1
        ORDER BY v.signed_at
    `;
    const result = await pool.query(query, [requestId]);
    return result.rows;
}

// Get voting summary for a restructuring request
async function getRestructuringVotingSummary(requestId) {
    const query = `
        SELECT
            COUNT(*) as total_votes,
            SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END) as up_votes,
            SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) as down_votes,
            COUNT(DISTINCT officer_id) as unique_officers
        FROM restructuring_votes
        WHERE request_id = $1
    `;
    const result = await pool.query(query, [requestId]);
    const row = result.rows[0];
    return {
        total_votes: Number(row.total_votes),
        up_votes: Number(row.up_votes),
        down_votes: Number(row.down_votes),
        unique_officers: Number(row.unique_officers)
    };
}

// Check if a request can be approved (3 UP signatures)
async function canApproveRestructuring(requestId) {
    const summary = await getRestructuringVotingSummary(requestId);
    const canApprove = summary.unique_officers >= 3 && summary.up_votes === 3;
    let reason = '';
    if (!canApprove) {
        if (summary.unique_officers < 3) reason = `Only ${summary.unique_officers} distinct officers have signed. All three must sign UP.`;
        else if (summary.up_votes < 3) reason = `${summary.up_votes} UP signatures, but all three must be UP.`;
    }
    return { canApprove, reason };
}

// Check if a request can be rejected (3 DOWN signatures)
async function canRejectRestructuring(requestId) {
    const summary = await getRestructuringVotingSummary(requestId);
    const canReject = summary.unique_officers >= 3 && summary.down_votes === 3;
    let reason = '';
    if (!canReject) {
        if (summary.unique_officers < 3) reason = `Only ${summary.unique_officers} distinct officers have signed. All three must sign DOWN.`;
        else if (summary.down_votes < 3) reason = `${summary.down_votes} DOWN signatures, but all three must be DOWN.`;
    }
    return { canReject, reason };
}

// Update restructuring request status (approve/reject)
async function updateRestructuringRequestStatus(requestId, status, officerId, reason = null) {
    const query = `
        UPDATE loan_restructuring_requests
        SET status = $1, reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW(),
            reason = COALESCE($3, reason)
        WHERE id = $4
        RETURNING *
    `;
    const result = await pool.query(query, [status, officerId, reason, requestId]);
    if (result.rows.length === 0) throw new Error('Request not found');
    return result.rows[0];
}

// Get restructuring history for a loan
async function getRestructuringHistoryByLoan(loanId) {
    const query = `
        SELECT h.*, m.first_name as approved_by_name, m.sur_name as approved_by_surname
        FROM loan_restructuring_history h
        LEFT JOIN member m ON h.approved_by = m.id
        WHERE h.loan_id = $1
        ORDER BY h.restructured_at DESC
    `;
    const result = await pool.query(query, [loanId]);
    return result.rows;
}

// Apply restructuring: create new loan with remaining balance as principal
async function applyRestructuring(requestId, officerId) {
    const ts = new Date().toISOString();
    
    const requestQuery = `
        SELECT r.*, l.id as old_loan_id, l.member_id, l.loan_type,
               l.interest_rate, l.paid_amount, l.total_repayable as old_total,
               l.tenure_months as old_tenure, l.bank_account, l.bank_name,
               l.additional_info, l.attachments, l.purpose,
               l.monthly_payment as old_monthly_payment,
               l.total_interest as old_total_interest,
               (l.total_repayable - l.paid_amount) as current_remaining_balance
        FROM loan_restructuring_requests r
        JOIN loans l ON r.loan_id = l.id
        WHERE r.id = $1
    `;
    const requestResult = await pool.query(requestQuery, [requestId]);
    if (requestResult.rows.length === 0) throw new Error('Request not found');
    const req = requestResult.rows[0];

    const remainingBalance = Number(req.current_remaining_balance);
    if (remainingBalance <= 0) throw new Error('Loan already fully paid, cannot restructure');

    const monthlyRate = req.interest_rate / 100 / 12;
    let newMonthlyPayment, newTotalInterest, newTotalRepayable;
    if (monthlyRate === 0) {
        newMonthlyPayment = remainingBalance / req.new_tenure_months;
        newTotalInterest = 0;
    } else {
        newMonthlyPayment = remainingBalance * monthlyRate *
                            Math.pow(1 + monthlyRate, req.new_tenure_months) /
                            (Math.pow(1 + monthlyRate, req.new_tenure_months) - 1);
        newTotalInterest = newMonthlyPayment * req.new_tenure_months - remainingBalance;
    }
    newTotalRepayable = remainingBalance + newTotalInterest;

    // Mark original loan as 'Restructured'
    await pool.query(
        `UPDATE loans SET status = 'Restructured', updated_at = NOW() WHERE id = $1`,
        [req.old_loan_id]
    );

    // Create new loan
    const newLoanQuery = `
        INSERT INTO loans (
            member_id, loan_type, amount, interest_rate, tenure_months,
            monthly_payment, total_interest, total_repayable, purpose,
            bank_account, bank_name, additional_info, attachments,
            status, reviewed_by, reviewed_at, parent_loan_id,
            paid_amount, remaining_balance, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                  'Approved', $14, NOW(), $15, 0, $16, NOW(), NOW())
        RETURNING id
    `;
    const newLoanValues = [
        req.member_id,
        req.loan_type,
        remainingBalance,
        req.interest_rate,
        req.new_tenure_months,
        newMonthlyPayment,
        newTotalInterest,
        newTotalRepayable,
        `Restructured from loan #${req.old_loan_id}: ${req.purpose}`,
        req.bank_account,
        req.bank_name,
        req.additional_info,
        req.attachments,
        officerId,
        newTotalRepayable,
        req.old_loan_id
    ];
    const newLoanResult = await pool.query(newLoanQuery, newLoanValues);
    const newLoanId = newLoanResult.rows[0].id;

    // Insert history record
    const historyQuery = `
        INSERT INTO loan_restructuring_history
        (loan_id, request_id, new_loan_id, restructured_at,
         old_tenure_months, new_tenure_months,
         old_monthly_payment, new_monthly_payment,
         old_total_interest, new_total_interest,
         old_total_repayable, new_total_repayable,
         old_paid_amount, remaining_balance_at_restructure,
         reason, approved_by)
        VALUES ($1, $2, $3, NOW(),
                $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `;
    await pool.query(historyQuery, [
        req.old_loan_id, requestId, newLoanId,
        req.old_tenure, req.new_tenure_months,
        req.old_monthly_payment, newMonthlyPayment,
        req.old_total_interest, newTotalInterest,
        req.old_total, newTotalRepayable,
        req.paid_amount, remainingBalance,
        req.reason, officerId
    ]);

    // Generate repayment schedule for new loan
    await createRepaymentSchedule(newLoanId, new Date());

    // Notify member
    const message = `Your loan #${req.old_loan_id} has been restructured. A new loan (#${newLoanId}) of TSh ${remainingBalance.toLocaleString()} with ${req.new_tenure_months} months tenure has been created.`;
    await notificationModel.createNotification(req.member_id, message);

    console.log(`[${ts}] Restructuring applied: old loan ${req.old_loan_id} → new loan ${newLoanId}`);
    return { oldLoanId: req.old_loan_id, newLoanId };
}

// Get restructuring request by ID
async function getRestructuringRequestById(requestId) {
    const query = `
        SELECT r.*, l.loan_type, l.interest_rate, l.amount as original_amount,
               m.first_name, m.sur_name, m.id as member_id
        FROM loan_restructuring_requests r
        JOIN loans l ON r.loan_id = l.id
        JOIN member m ON r.member_id = m.id
        WHERE r.id = $1
    `;
    const result = await pool.query(query, [requestId]);
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

// --- Exports ----------------------------------------------------------------
module.exports = {
  createLoan,
  getLoansByMember,
  getAllLoans,
  getLoanById,
  updateLoanStatus,
  createRepaymentSchedule,
  recordRepayment,
  recordRepaymentMultiple,
  createVote,
  getVotesByLoan,
  getVoteByOfficer,
  getVotingSummary,
  getApprovalStatus,
  getRejectionStatus,
  canApproveLoan,
  canRejectLoan,
  getEligibleOfficers,
  getLoanDashboardCountsByRole,
  generateAmortizationSchedule,
  getLoansForRepayment,

  // Restructuring functions
  createRestructuringRequest,
  getAllRestructuringRequests,
  getRestructuringRequestsByMember,
  getRestructuringRequestById,
  createRestructuringVote,
  getRestructuringVotes,
  getRestructuringVotingSummary,
  canApproveRestructuring,
  canRejectRestructuring,
  updateRestructuringRequestStatus,
  getRestructuringHistoryByLoan,
  applyRestructuring
};


