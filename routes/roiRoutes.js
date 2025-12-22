
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const pool = require('../db');

// Get ROI management page
router.get('/', requireAuth, requireRole(['chief_signatory', 'chairman', 'assistant_signatory']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*, m.first_name, m.sur_name 
      FROM roi r
      JOIN member m ON r.member_id = m.id
      ORDER BY r.created_at DESC
    `);
    
    const members = await pool.query('SELECT id, first_name, sur_name FROM member ORDER BY first_name');
    
    res.render('roi/roi-management', {
      user: req.session.user,
      roiRecords: result.rows,
      members: members.rows
    });
  } catch (error) {
    console.error('Error loading ROI management:', error);
    req.flash('error', 'Failed to load ROI records');
    res.redirect('/dashboard');
  }
});

// Create ROI record
router.post('/create', requireAuth, requireRole(['chief_signatory', 'chairman']), async (req, res) => {
  try {
    const { member_id, amount, roi_percentage, period_start, period_end, notes } = req.body;
    
    const calculated_amount = parseFloat(amount) * (parseFloat(roi_percentage) / 100);
    
    await pool.query(
      `INSERT INTO roi (member_id, amount, roi_percentage, period_start, period_end, calculated_amount, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [member_id, amount, roi_percentage, period_start, period_end, calculated_amount, notes]
    );
    
    req.flash('success', 'ROI record created successfully');
    res.redirect('/roi');
  } catch (error) {
    console.error('Error creating ROI:', error);
    req.flash('error', 'Failed to create ROI record');
    res.redirect('/roi');
  }
});

// Approve ROI
router.post('/:id/approve', requireAuth, requireRole(['chief_signatory', 'chairman']), async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query(
      `UPDATE roi SET status = 'Approved', approved_by = $1, approved_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.session.user.member_Id, id]
    );
    
    res.json({ success: true, message: 'ROI approved successfully' });
  } catch (error) {
    console.error('Error approving ROI:', error);
    res.json({ success: false, message: 'Failed to approve ROI' });
  }
});

module.exports = router;


