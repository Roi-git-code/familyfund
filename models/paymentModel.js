
// models/paymentModel.js
const pool = require('../db');

class PaymentModel {
   // Add payment type field to createPayment method
async createPayment(paymentData) {
  const {
    member_id,
    amount,
    payment_method,
    phone_number,
    transaction_id,
    payment_type = 'Contribution', // New field
    status = 'pending',
    metadata = {}
  } = paymentData;

  const query = `
    INSERT INTO payments (
      member_id, amount, payment_method, phone_number,
      transaction_id, payment_type, status, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `;

  const values = [
    member_id,
    amount,
    payment_method,
    phone_number,
    transaction_id,
    payment_type,
    status,
    metadata ? JSON.stringify(metadata) : null
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error('Error creating payment:', err);
    throw err;
  }
}

// Add new methods for ROI and Refunds
async createROI(roiData) {
  const {
    member_id,
    payment_id,
    amount,
    roi_percentage,
    period_start,
    period_end,
    calculated_amount,
    status = 'Pending',
    notes = ''
  } = roiData;

  const query = `
    INSERT INTO roi (
      member_id, payment_id, amount, roi_percentage,
      period_start, period_end, calculated_amount,
      status, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const values = [
    member_id,
    payment_id,
    amount,
    roi_percentage,
    period_start,
    period_end,
    calculated_amount,
    status,
    notes
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error('Error creating ROI record:', err);
    throw err;
  }
}

async createRefund(refundData) {
  const {
    member_id,
    payment_id,
    request_id,
    amount,
    reason,
    status = 'Pending',
    payment_method = 'Bank Transfer',
    account_details = {},
    notes = ''
  } = refundData;

  const query = `
    INSERT INTO refunds (
      member_id, payment_id, request_id, amount,
      reason, status, payment_method, account_details, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;

  const values = [
    member_id,
    payment_id,
    request_id,
    amount,
    reason,
    status,
    payment_method,
    JSON.stringify(account_details),
    notes
  ];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error('Error creating refund record:', err);
    throw err;
  }
}
  

  // Update status and optionally store gateway response
  async updatePaymentStatus(transactionId, status, gatewayResponse = null) {
    const query = `
      UPDATE payments
      SET status = $1,
          gateway_response = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE transaction_id = $3
      RETURNING *
    `;

    const values = [
      status,
      gatewayResponse ? JSON.stringify(gatewayResponse) : null,
      transactionId
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Error updating payment status:', err);
      throw err;
    }
  }

// Get payment with type information
async getPaymentByTransactionId(transactionId) {
  const query = `
    SELECT p.*, 
           m.first_name,
           m.sur_name,
           m.phone AS member_phone,
           m.email AS member_email
    FROM payments p
    LEFT JOIN member m ON p.member_id = m.id
    WHERE p.transaction_id = $1
  `;
  try {
    const result = await pool.query(query, [transactionId]);
    return result.rows[0];
  } catch (err) {
    console.error('Error fetching payment by transactionId:', err);
    throw err;
  }
}
  

  // Get payment by transaction ID with member info
  async getPaymentWithMemberInfo(transactionId) {
    const query = `
      SELECT 
        p.*,
        m.first_name,
        m.sur_name,
        m.phone AS member_phone,
        m.email AS member_email
      FROM payments p
      LEFT JOIN member m ON p.member_id = m.id
      WHERE p.transaction_id = $1
    `;
    try {
      const result = await pool.query(query, [transactionId]);
      return result.rows[0];
    } catch (err) {
      console.error('Error fetching payment with member info:', err);
      throw err;
    }
  }

  // Get all payments of a member
  async getPaymentsByMember(memberId) {
    const query = `
      SELECT * FROM payments
      WHERE member_id = $1
      ORDER BY created_at DESC
    `;
    try {
      const result = await pool.query(query, [memberId]);
      return result.rows;
    } catch (err) {
      console.error('Error fetching payments by member:', err);
      throw err;
    }
  }

  // Get all payments with member info (for admin)
  async getAllPayments() {
    const query = `
      SELECT p.*, m.first_name, m.sur_name, m.phone AS member_phone
      FROM payments p
      LEFT JOIN member m ON p.member_id = m.id
      ORDER BY p.created_at DESC
    `;
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (err) {
      console.error('Error fetching all payments:', err);
      throw err;
    }
  }

  // Get all payments with member information (for admin views)
  async getAllPaymentsWithMemberInfo() {
    const query = `
      SELECT 
        p.*,
        m.first_name,
        m.sur_name,
        m.phone AS member_phone,
        m.email AS member_email
      FROM payments p
      LEFT JOIN member m ON p.member_id = m.id
      ORDER BY p.created_at DESC
    `;
    
    try {
      const result = await pool.query(query);
      return result.rows;
    } catch (err) {
      console.error('Error fetching all payments with member info:', err);
      throw err;
    }
  }

  // Get payment link by amount from database (ACTIVE ONLY)
  async getPaymentLinkByAmount(amount) {
    const query = `
      SELECT * FROM payment_links 
      WHERE amount = $1 AND is_active = true
      LIMIT 1
    `;
    try {
      const result = await pool.query(query, [amount]);
      return result.rows[0];
    } catch (err) {
      console.error('Error fetching payment link from database:', err);
      throw err;
    }
  }

  // Get active payment links only (for payment form)
  async getActivePaymentLinks() {
    const query = `
      SELECT amount, description, lipia_link 
      FROM payment_links 
      WHERE is_active = true 
      ORDER BY amount ASC
    `;
    
    try {
      const result = await pool.query(query);
      console.log(`📊 Retrieved ${result.rows.length} ACTIVE payment links for payment form`);
      return result.rows;
    } catch (err) {
      console.error('❌ Error fetching active payment links:', err);
      throw err;
    }
  }

  // Get closest payment link from database (ACTIVE ONLY)
  async getClosestPaymentLink(amount) {
    const query = `
      SELECT amount, lipia_link, description 
      FROM payment_links 
      WHERE is_active = true AND amount <= $1
      ORDER BY amount DESC 
      LIMIT 1
    `;
    try {
      const result = await pool.query(query, [amount]);
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      
      // If no amount found that is less than or equal, get the smallest amount
      const smallestQuery = `
        SELECT amount, lipia_link, description 
        FROM payment_links 
        WHERE is_active = true 
        ORDER BY amount ASC 
        LIMIT 1
      `;
      const smallestResult = await pool.query(smallestQuery);
      return smallestResult.rows[0];
    } catch (err) {
      console.error('Error fetching closest payment link from database:', err);
      throw err;
    }
  }

  // Get all payment links (for admin - includes inactive)
  async getAllPaymentLinks(activeOnly = false) {
    let query = `
      SELECT id, amount, description, lipia_link, is_active, created_at, updated_at 
      FROM payment_links 
    `;
    
    if (activeOnly) {
      query += ` WHERE is_active = true `;
    }
    
    query += ` ORDER BY amount ASC`;
    
    try {
      const result = await pool.query(query);
      console.log(`📊 Retrieved ${result.rows.length} payment links from database (activeOnly: ${activeOnly})`);
      return result.rows;
    } catch (err) {
      console.error('❌ Error fetching all payment links:', err);
      throw err;
    }
  }

  // Create new payment link
  async createPaymentLink(linkData) {
    const { amount, description, lipia_link, is_active = true } = linkData;

    const query = `
      INSERT INTO payment_links (amount, description, lipia_link, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [amount, description, lipia_link, is_active];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Error creating payment link:', err);
      throw err;
    }
  }

  // Update payment link status
  async updatePaymentLinkStatus(id, is_active) {
    const query = `
      UPDATE payment_links 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    const values = [is_active, id];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Error updating payment link status:', err);
      throw err;
    }
  }

  // Delete payment link
  async deletePaymentLink(id) {
    const query = `
      DELETE FROM payment_links 
      WHERE id = $1
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (err) {
      console.error('Error deleting payment link:', err);
      throw err;
    }
  }
}

module.exports = new PaymentModel();



