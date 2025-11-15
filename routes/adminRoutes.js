
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const authModel = require('../models/authModel');
const memberModel = require('../models/memberModel');

// Helper function to get member stats
async function getMemberStats(users) {
  const stats = {
    totalAdmins: 0,
    totalOfficials: 0,
    totalMembers: 0
  };

  users.forEach(user => {
    if (user.role === 'admin') stats.totalAdmins++;
    else if (['chairman', 'chief_signatory', 'assistant_signatory'].includes(user.role)) stats.totalOfficials++;
    else if (user.role === 'member') stats.totalMembers++;
  });

  return stats;
}

// Helper function to enrich users with member information
async function enrichUsersWithMemberInfo(users) {
  const enrichedUsers = await Promise.all(users.map(async (user) => {
    let memberInfo = null;
    
    // If user has a member_id, get member details
    if (user.member_id) {
      try {
        memberInfo = await memberModel.getMemberById(user.member_id);
      } catch (error) {
        console.warn(`Could not fetch member details for user ${user.id}:`, error.message);
      }
    }
    
    // If no member_id but username is an email, try to find by email
    if (!memberInfo && user.username.includes('@')) {
      try {
        memberInfo = await authModel.getMemberByEmail(user.username);
      } catch (error) {
        console.warn(`Could not fetch member by email for user ${user.id}:`, error.message);
      }
    }

    return {
      ...user,
      first_name: memberInfo?.first_name || null,
      sur_name: memberInfo?.sur_name || null,
      member_name: memberInfo ? `${memberInfo.first_name} ${memberInfo.sur_name}`.trim() : null
    };
  }));

  return enrichedUsers;
}

// Show Admin Dashboard
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const usersResult = await pool.query(`
      SELECT u.*, m.first_name, m.sur_name 
      FROM users u 
      LEFT JOIN member m ON u.member_id = m.id 
      ORDER BY u.id
    `);
    
    const users = usersResult.rows;
    const enrichedUsers = await enrichUsersWithMemberInfo(users);
    const memberStats = await getMemberStats(users);

    res.render('admin', { 
      user: req.session.user, 
      users: enrichedUsers,
      memberStats 
    });
  } catch (err) {
    console.error('Error loading admin dashboard:', err);
    req.flash('error', 'Failed to load admin dashboard');
    res.redirect('/dashboard');
  }
});

// Assign Role
router.post('/assign-role', requireRole('admin'), async (req, res) => {
  const { user_id, role } = req.body;
  
  if (!user_id || !role) {
    req.flash('error', 'User ID and role are required');
    return res.redirect('/admin');
  }

  try {
    // Get current user role for comparison
    const currentUser = await pool.query('SELECT role FROM users WHERE id = $1', [user_id]);
    if (currentUser.rows.length === 0) {
      req.flash('error', 'User not found');
      return res.redirect('/admin');
    }

    const currentRole = currentUser.rows[0].role;

    // Don't allow changing your own role
    if (req.session.user.id == user_id && role !== currentRole) {
      req.flash('error', 'You cannot change your own role');
      return res.redirect('/admin');
    }

    // Role restrictions
    if (role === 'admin') {
      const count = await authModel.countUsersByRole('admin');
      if (count >= 1 && currentRole !== 'admin') {
        req.flash('error', 'Only one admin user is allowed in the system');
        return res.redirect('/admin');
      }
    }

    if (role === 'chairman') {
      const count = await authModel.countUsersByRole('chairman');
      if (count >= 1 && currentRole !== 'chairman') {
        req.flash('error', 'Only one chairman is allowed in the system');
        return res.redirect('/admin');
      }
    }

    if (role === 'chief_signatory') {
      const count = await authModel.countUsersByRole('chief_signatory');
      if (count >= 1 && currentRole !== 'chief_signatory') {
        req.flash('error', 'Only one chief signatory is allowed in the system');
        return res.redirect('/admin');
      }
    }

    if (role === 'assistant_signatory') {
      const count = await authModel.countUsersByRole('assistant_signatory');
      if (count >= 2 && currentRole !== 'assistant_signatory') {
        req.flash('error', 'Maximum of two assistant signatories allowed');
        return res.redirect('/admin');
      }
    }

    await pool.query('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [role, user_id]);
    
    // Get user info for success message
    const userInfo = await pool.query(`
      SELECT u.username, m.first_name, m.sur_name 
      FROM users u 
      LEFT JOIN member m ON u.member_id = m.id 
      WHERE u.id = $1
    `, [user_id]);
    
    const userName = userInfo.rows[0]?.first_name && userInfo.rows[0]?.sur_name 
      ? `${userInfo.rows[0].first_name} ${userInfo.rows[0].sur_name}`
      : userInfo.rows[0]?.username;

    req.flash('success', `Role updated to ${role} for ${userName}`);
  } catch (err) {
    console.error('Error updating role:', err);
    req.flash('error', 'Failed to update user role');
  }
  
  res.redirect('/admin');
});

// Delete User
router.post('/delete-user', requireAuth, requireRole('admin'), async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    req.flash('error', 'User ID is required');
    return res.redirect('/admin');
  }

  try {
    // Prevent admin from deleting themselves
    if (req.session.user.id == user_id) {
      req.flash('error', 'You cannot delete your own account');
      return res.redirect('/admin');
    }

    // Get user info for confirmation message
    const userInfo = await pool.query(`
      SELECT u.username, m.first_name, m.sur_name 
      FROM users u 
      LEFT JOIN member m ON u.member_id = m.id 
      WHERE u.id = $1
    `, [user_id]);
    
    const userName = userInfo.rows[0]?.first_name && userInfo.rows[0]?.sur_name 
      ? `${userInfo.rows[0].first_name} ${userInfo.rows[0].sur_name}`
      : userInfo.rows[0]?.username;

    await pool.query('DELETE FROM users WHERE id = $1', [user_id]);
    req.flash('success', `User ${userName} has been deleted successfully`);
  } catch (err) {
    console.error('Error deleting user:', err);
    req.flash('error', 'Failed to delete user');
  }

  res.redirect('/admin');
});

module.exports = router;


