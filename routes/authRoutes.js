// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');


const mailer = require('../utils/mail');
//const sendResetEmail = require('../utils/mail');

const authModel = require('../models/authModel');
const userLandingModel = require('../models/userLandingModel');


const redirectByRole = {
  admin: '/admin',
  chairman: '/member/form',
  chief_signatory: '/contributions/form',
  assistant_signatory: '/contributions',
  member: '/'
};

// Show login/signup form
router.get('/auth', (req, res) => {
  res.render('auth', { flash: res.locals.flash, user: req.session.user });
});

// Signup route (merged from your updated code)
router.post('/signup', async (req, res) => {
  const { username, password, role } = req.body;

  try {
    // 1. Validate email format
    if (!username || !username.includes('@')) {
      req.flash('error', 'Username must be a valid email.');
      return res.redirect('/auth');
    }

    // 2. Check if email exists in members table
    const emailExists = await authModel.emailExistsInMembers(username);
    if (!emailExists) {
      req.flash('error', 'Email not found in registered members.');
      return res.redirect('/auth');
    }

    // 3. Prevent duplicate users
    const existingUser = await authModel.findByUsername(username);
    if (existingUser) {
      req.flash('error', 'User already registered with that email.');
      return res.redirect('/auth');
    }

    // 4. Restrict roles
if (role === 'admin') {
      const count = await authModel.countUsersByRole('admin');
      if (count >= 1) {
        req.flash('error', 'You are not a system Administartor.');
        return res.redirect('/auth');
      }
    }

    if (role === 'chairman') {
      const count = await authModel.countUsersByRole('chairman');
      if (count >= 1) {
        req.flash('error', 'You are not a family Chairman.');
        return res.redirect('/auth');
      }
    }

    if (role === 'chief_signatory') {
      const count = await authModel.countUsersByRole('chief_signatory');
      if (count >= 1) {
        req.flash('error', 'You are not a Chief Signatory.');
        return res.redirect('/auth');
      }
    }

    if (role === 'assistant_signatory') {
      const count = await authModel.countUsersByRole('assistant_signatory');
      if (count >= 2) {
        req.flash('error', 'You are not an Assistant Signatory.');
        return res.redirect('/auth');
      }
    }

    // 5. Create the user

const member = await authModel.getMemberByEmail(username);
if (!member) {
  req.flash('error', 'Member not found');
  return res.redirect('/auth');
}

// Use member.id when creating user
await authModel.createUser(username, password, role, member.id);
    req.flash('success', 'Signup successful, please log in.');
    res.redirect('/auth');
  } catch (err) {
    console.error(err);
    req.flash('error', err.message || 'Signup failed.');
    res.redirect('/auth');
  }
});

// Login route
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await authModel.findByUsername(username);

    const member = await userLandingModel.getMemberProfileByEmail(username);
   
    if (!user || !(await authModel.comparePasswords(password, user.password))) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/auth');
    }

    req.session.user = { id: user.id, member_Id:member.id, username: user.username, role: user.role };
    req.flash('success', 'Welcome, ' + user.username);


// Redirect based on role
    if (user.role === 'admin') {
     return res.redirect('/admin');  // 👈 goes to admin.ejs
      }
    res.redirect('/dashboard');

   // res.redirect(redirectByRole[user.role] || '/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed');
    res.redirect('/auth');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});


// Change Password route

router.post('/change-password', async (req, res) => {
  const { oldPassword, newPassword, confirmNewPassword } = req.body;

  if (!req.session.user) {
    return res.status(401).json({ message: 'You must be logged in.' });
  }

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ message: 'New passwords do not match.' });
  }

  try {
    const user = await authModel.findByUsername(req.session.user.username);

    const isMatch = await authModel.comparePasswords(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Old password is incorrect.' });
    }

    await authModel.updatePassword(user.id, newPassword);
    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Password update failed due to server error.' });
  }
});


// Show password reset request form
router.get('/auth/forgot-password', (req, res) => {
  res.render('forgotPassword', { flash: res.locals.flash });
});

// Handle reset request submission


router.post('/auth/forgot-password', async (req, res) => {
//const sendResetEmail = require('../utils/mail');

  const { email } = req.body;
  try {
    const user = await authModel.findByUsername(email);
    if (!user) {
      req.flash('error', 'No user found with that email.');
      return res.redirect('/auth/forgot-password');
    }

    // Generate token & expiry (1 hour)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);

    await authModel.saveResetToken(user.id, token, expires);
    
const resetLink = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
await mailer.sendResetEmail(email, resetLink);


    req.flash('success', 'Password reset email sent. Please check your inbox.');
    res.redirect('/auth');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error sending reset email. Try again later.');
    res.redirect('/auth/forgot-password');
  }
});

// Show password reset form
router.get('/auth/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const resetEntry = await authModel.findResetToken(token);
    if (!resetEntry || resetEntry.expires_at < new Date()) {
      req.flash('error', 'Reset link expired or invalid.');
      return res.redirect('/auth');
    }
    res.render('resetPassword', { token });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Something went wrong.');
    res.redirect('/auth');
  }
});

// Handle new password submission
router.post('/auth/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmNewPassword } = req.body;

  if (newPassword !== confirmNewPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect(`/auth/reset-password/${token}`);
  }

  try {
    const resetEntry = await authModel.findResetToken(token);
    if (!resetEntry || resetEntry.expires_at < new Date()) {
      req.flash('error', 'Reset link expired or invalid.');
      return res.redirect('/auth');
    }

    await authModel.updatePassword(resetEntry.user_id, newPassword);
    await authModel.deleteResetToken(token);

    req.flash('success', 'Password updated successfully. Please log in.');
    res.redirect('/auth');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to reset password.');
    res.redirect(`/auth/reset-password/${token}`);
  }
});


module.exports = router;

