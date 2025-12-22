
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const pool = require('../db');

// Get refund management page
router.get('/', requireAuth, requireRole(['chief_signatory', 'chairman', 'assistant_signatory']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, m.first_name, m.sur_name 
      FROM refunds r
      JOIN member m ON r.member_id = m.id
      ORDER BY r.created_at DESC
    `);
    
    const members = await pool.query('SELECT id, first_name, sur_name FROM member ORDER BY first_name');
    
    res.render('refunds/refund-management', {
      user: req.session.user,
      refundRecords: result.rows,
      members: members.rows
    });
  } catch (error) {
    console.error('Error loading refund management:', error);
    req.flash('error', 'Failed to load refund records');
    res.redirect('/dashboard');
  }
});

// Process refund
router.post('/:id/process', requireAuth, requireRole(['chief_signatory', 'chairman']), async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_method, account_details, notes } = req.body;
    
    await pool.query(
      `UPDATE refunds SET status = 'Processing', payment_method = $1, account_details = $2, notes = $3
       WHERE id = $4`,
      [payment_method, account_details, notes, id]
    );
    
    req.flash('success', 'Refund processing started');
    res.redirect('/refunds');
  } catch (error) {
    console.error('Error processing refund:', error);
    req.flash('error', 'Failed to process refund');
    res.redirect('/refunds');
  }
});

module.exports = router;


