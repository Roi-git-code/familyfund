const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const authModel = require('../models/authModel');

// Show Admin Dashboard
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const users = (await pool.query('SELECT * FROM users ORDER BY id')).rows;
    res.render('admin', { user: req.session.user, users });
  } catch (err) {
    console.error(err);
    res.redirect('/auth');
  }
});

// Assign Role
router.post('/assign-role', requireRole('admin'), async (req, res) => {
  const { user_id, role } = req.body;
  try {

   // 4. Restrict roles
if (role === 'admin') {
      const count = await authModel.countUsersByRole('admin');
      if (count >= 1) {
        req.flash('error', 'You are not a system Administartor.');
        return res.redirect('/admin');
      }
    }

    if (role === 'chairman') {
      const count = await authModel.countUsersByRole('chairman');
      if (count >= 1) {
        req.flash('error', 'You are not a family Chairman.');
        return res.redirect('/admin');
      }
    }

    if (role === 'chief_signatory') {
      const count = await authModel.countUsersByRole('chief_signatory');
      if (count >= 1) {
        req.flash('error', 'You are not a Chief Signatory.');
        return res.redirect('/admin');
      }
    }

    if (role === 'assistant_signatory') {
      const count = await authModel.countUsersByRole('assistant_signatory');
      if (count >= 2) {
        req.flash('error', 'You are not an Assistant Signatory.');
        return res.redirect('/admin');
      }
    }

    await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, user_id]);
    req.flash('success', 'User role updated successfully!');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update role');
  }
  res.redirect('/admin');
});


// Delete User
router.post('/delete-user', requireAuth, requireRole('admin'), async (req, res) => {
  const { user_id } = req.body;

  try {
    // Prevent admin from deleting themselves
    if (req.session.user.id == user_id) {
      req.flash('error', 'You cannot delete your own account.');
      return res.redirect('/admin');
    }

    await pool.query('DELETE FROM users WHERE id = $1', [user_id]);
    req.flash('success', 'User deleted successfully!');
  } catch (err) {
    console.error('Error deleting user:', err);
    req.flash('error', 'Failed to delete user');
  }

  res.redirect('/admin');
});

module.exports = router;
