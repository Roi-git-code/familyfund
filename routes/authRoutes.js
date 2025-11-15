
// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Update import
const { sendResetEmail, sendVerificationEmail } = require('../utils/mail');

const authModel = require('../models/authModel');
const userLandingModel = require('../models/userLandingModel');

const redirectByRole = {
  admin: '/admin',
  chairman: '/member/form',
  chief_signatory: '/contributions/form',
  assistant_signatory: '/contributions',
  member: '/dashboard'
};

// Store temporary user data for OTP verification
const tempUsers = new Map();

// Show login/signup form
router.get('/auth', (req, res) => {
  res.render('auth', { flash: res.locals.flash, user: req.session.user });
});

// Modified Signup route - Step 1: Send OTP
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
        req.flash('error', 'You are not a system Administrator.');
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

    // 5. Get member info
    const member = await authModel.getMemberByEmail(username);
    if (!member) {
      req.flash('error', 'Member not found');
      return res.redirect('/auth');
    }

    // 6. Generate and send OTP
    const otp = await authModel.generateOTP(username);
    await sendVerificationEmail(username, otp);

    // 7. Store temporary user data
    tempUsers.set(username, {
      username,
      password,
      role,
      memberId: member.id,
      createdAt: Date.now()
    });

    // 8. Redirect to OTP verification page
    req.flash('success', 'Verification code sent to your email. Please check your inbox.');
    res.redirect(`/auth/verify-email?email=${encodeURIComponent(username)}`);

  } catch (err) {
    console.error(err);
    req.flash('error', err.message || 'Signup failed.');
    res.redirect('/auth');
  }
});

// OTP Verification Page
router.get('/auth/verify-email', (req, res) => {
  const email = req.query.email;
  if (!email || !tempUsers.has(email)) {
    req.flash('error', 'Invalid verification session.');
    return res.redirect('/auth');
  }

  res.render('verifyEmail', { 
    flash: res.locals.flash, 
    email: email,
    user: req.session.user 
  });
});

// Verify OTP - Step 2: Complete Registration
router.post('/auth/verify-email', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // 1. Check if we have temporary user data
    const tempUser = tempUsers.get(email);
    if (!tempUser) {
      req.flash('error', 'Verification session expired. Please sign up again.');
      return res.redirect('/auth');
    }

    // 2. Clean expired OTPs
    await authModel.cleanExpiredOTPs();

    // 3. Verify OTP
    const isValid = await authModel.verifyOTP(email, otp);
    if (!isValid) {
      req.flash('error', 'Invalid or expired verification code.');
      return res.redirect(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    }

    // 4. Create the user account
    const { username, password, role, memberId } = tempUser;
    await authModel.createUser(username, password, role, memberId);
    
    // 5. Mark email as verified
    await authModel.markEmailVerified(username);

    // 6. Clean up temporary data
    tempUsers.delete(email);

    req.flash('success', 'Email verified successfully! You can now log in.');
    res.redirect('/auth');

  } catch (err) {
    console.error(err);
    req.flash('error', 'Verification failed. Please try again.');
    res.redirect(`/auth/verify-email?email=${encodeURIComponent(email)}`);
  }
});

// Resend OTP
router.post('/auth/resend-otp', async (req, res) => {
  const { email } = req.body;

  try {
    if (!tempUsers.has(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }

    const otp = await authModel.generateOTP(email);
    await sendVerificationEmail(email, otp);

    res.json({ success: true, message: 'New verification code sent!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to resend code' });
  }
});


// In routes/authRoutes.js - Update the resend verification route
router.get('/auth/resend-verification', (req, res) => {
  const pendingEmail = req.session.pendingVerification;
  res.render('resendVerification', { 
    flash: res.locals.flash,
    pendingEmail: pendingEmail 
  });
});

// In the POST resend verification route, pre-fill the email if available
router.post('/auth/resend-verification', async (req, res) => {
  let { email } = req.body;
  
  // Use pending verification email if no email provided
  if (!email && req.session.pendingVerification) {
    email = req.session.pendingVerification;
  }
  
  try {
    // Check if user exists
    const user = await authModel.findByUsername(email);
    if (!user) {
      req.flash('error', 'No account found with that email.');
      return res.redirect('/auth/resend-verification');
    }

    // Check if already verified
    if (user.email_verified) {
      req.flash('error', 'This email is already verified. You can log in normally.');
      return res.redirect('/auth/resend-verification');
    }

    // Generate and send OTP
    const otp = await authModel.generateOTP(email);
    await sendVerificationEmail(email, otp);

    // Store temporary reference for verification
    tempUsers.set(email, {
      username: email,
      isExistingUser: true,
      createdAt: Date.now()
    });

    // Clear pending verification
    delete req.session.pendingVerification;

    req.flash('success', 'Verification code sent to your email.');
    res.redirect(`/auth/verify-existing-email?email=${encodeURIComponent(email)}`);
    
  } catch (err) {
    console.error('Resend verification error:', err);
    req.flash('error', 'Failed to send verification email. Please try again.');
    res.redirect('/auth/resend-verification');
  }
});


// Verify existing user email
router.get('/auth/verify-existing-email', (req, res) => {
  const email = req.query.email;
  if (!email || !tempUsers.has(email)) {
    req.flash('error', 'Invalid verification session.');
    return res.redirect('/auth/resend-verification');
  }

  res.render('verifyExistingEmail', { 
    flash: res.locals.flash, 
    email: email 
  });
});

// Verify OTP for existing user
router.post('/auth/verify-existing-email', async (req, res) => {
  const { email, otp } = req.body;

  try {
    // Check if we have temporary data
    const tempData = tempUsers.get(email);
    if (!tempData) {
      req.flash('error', 'Verification session expired.');
      return res.redirect('/auth/resend-verification');
    }

    // Clean expired OTPs
    await authModel.cleanExpiredOTPs();

    // Verify OTP
    const isValid = await authModel.verifyOTP(email, otp);
    if (!isValid) {
      req.flash('error', 'Invalid or expired verification code.');
      return res.redirect(`/auth/verify-existing-email?email=${encodeURIComponent(email)}`);
    }

    // Mark email as verified in database
    await authModel.markEmailVerified(email);

    // Clean up temporary data
    tempUsers.delete(email);

    req.flash('success', 'Email verified successfully! You can now log in.');
    res.redirect('/auth');
    
  } catch (err) {
    console.error('Existing user verification error:', err);
    req.flash('error', 'Verification failed. Please try again.');
    res.redirect(`/auth/verify-existing-email?email=${encodeURIComponent(email)}`);
  }
});

// In routes/authRoutes.js
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await authModel.findByUsername(username);
    const member = await userLandingModel.getMemberProfileByEmail(username);
   
    if (!user || !(await authModel.comparePasswords(password, user.password))) {
      req.flash('error', 'Invalid credentials');
      return res.redirect('/auth');
    }

    // Check if email is verified
    if (!user.email_verified) {
      // Store the unverified email in session for the resend page
      req.session.pendingVerification = username;
      req.flash('verification_required', 'true');
      req.flash('error', 'Please verify your email before logging in.');
      return res.redirect('/auth');
    }

    // ✅ Store user and member details in the session
    req.session.user = {
      id: user.id,
      member_Id: member?.id,
      username: user.username,
      role: user.role,
      first_name: member?.first_name || '',
      middle_name: member?.middle_name || '',
      surname: member?.sur_name || ''
    };

    req.flash('success', 'Welcome, ' + (member?.first_name || user.username));

    // Redirect based on role
    if (user.role === 'admin') {
      return res.redirect('/admin');
    }

    res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed');
    res.redirect('/auth');
  }
});



// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth'));
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
    
    // Now this should work correctly
    await sendResetEmail(email, resetLink);

    req.flash('success', 'Password reset email sent. Please check your inbox.');
    res.redirect('/auth');
  } catch (err) {
    console.error('Reset email error:', err);
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

// Clean up expired temporary data periodically
setInterval(() => {
  const now = Date.now();
  const expired = 30 * 60 * 1000; // 30 minutes
  for (const [email, data] of tempUsers.entries()) {
    if (now - data.createdAt > expired) {
      tempUsers.delete(email);
      console.log(`Cleaned up expired temporary data for: ${email}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

module.exports = router;


