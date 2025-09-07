const express = require('express');
const router = express.Router();
const memberModel = require('../models/memberModel');

const { requireAuth, requireRole, allowRoles } = require('../middleware/auth');

// Middleware example (if needed)
// const { requireRole } = require('../middleware/authMiddleware');

// -------------------- GET ROUTES --------------------

// GET Registration Form
router.get('/form', (req, res) => {
  const formData = req.session.formData || {};
  req.session.formData = null; // clear after using

const errorMsg = req.flash('error');
  const successMsg = req.flash('success');

  res.render('memberRegistration-form', {
    formData,
    editMode: false,
    user: req.session.user || null
  });
});

// GET Edit Form
router.get('/edit/:id', async (req, res) => {
  try {
    const member = await memberModel.getMemberById(req.params.id);
    if (!member) {
      req.flash('error', 'Member not found');
      return res.redirect('/member/form');
    }

    res.render('memberEditing-form', {
      formData: member,
      editMode: true,
      user: req.session.user || null
    });
  } catch (err) {
    console.error('Edit GET error:', err);
    req.flash('error', 'Failed to load member for editing');
    res.redirect('/member/form');
  }
});

// GET All Members
router.get('/', async (req, res) => {
  try {
    const members = await memberModel.getAllMembers();
    res.render('chairman', { members });
  } catch (err) {
    console.error('Get members error:', err);
    req.flash('error', 'Error loading members');
    res.redirect('/');
  }
});

// -------------------- POST ROUTES --------------------

// POST Register Member
router.post('/', async (req, res) => {
  try {
    req.session.formData = req.body;
    await memberModel.createMember(req.body);

    req.flash('success', 'Member registered successfully!');
    req.session.formData = null; // clear form data after success
    res.redirect('/member/form');

  } catch (err) {
    console.error('Registration error:', err);

    // Map DB errors to friendly messages
    let errorMessage = err.message || 'Error processing registration';
    if (err.message.includes('full name')) errorMessage = 'A member with this full name already exists';
    else if (err.message.includes('Email')) errorMessage = 'Email already exists';
    else if (err.message.includes('Phone')) errorMessage = 'Phone number already exists';
    else if (err.message.includes('Missing')) errorMessage = 'Please fill all required fields';
    else if (err.message.includes('Invalid email')) errorMessage = 'Invalid email format';
    else if (err.message.includes('Phone number should')) errorMessage = 'Phone number should be 8-15 digits';

    req.flash('error', errorMessage);
    res.redirect('/member/form');
  }
});

// POST Update Member
router.post('/update/:id', async (req, res) => {
  try {
    req.session.formData = req.body;
    await memberModel.updateMember(req.params.id, req.body);

    req.flash('success', 'Member updated successfully!');
    req.session.formData = null;
    res.redirect('/member');

  } catch (err) {
    console.error('Update error:', err);

    let errorMessage = err.message || 'Failed to update member';
    req.flash('error', errorMessage);
    res.redirect(`/member/edit/${req.params.id}`);
  }
});

// DELETE Member
router.post('/delete/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await memberModel.deleteMember(id);
    req.flash('success', `Member ID ${id} deleted successfully!`);
  } catch (err) {
    console.error('Delete error:', err);
    req.flash('error', `Failed to delete member: ${err.message}`);
  }
  res.redirect('/member');
});

module.exports = router;
