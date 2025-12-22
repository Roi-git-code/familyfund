
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

// Enhanced Signup route with better error handling
router.post('/signup', async (req, res) => {
  const { username, password, role } = req.body;

  console.log('🔧 Signup attempt:', { username, role });

  try {
    // 1. Validate email format
    if (!username || !username.includes('@')) {
      req.flash('error', 'Username must be a valid email.');
      return res.redirect('/auth');
    }

    // 2. Check if email exists in members table
    const emailExists = await authModel.emailExistsInMembers(username);
    console.log('📧 Email exists in members:', emailExists);
    
    if (!emailExists) {
      req.flash('error', 'Email not found in registered members.');
      return res.redirect('/auth');
    }

    // 3. Prevent duplicate users
    const existingUser = await authModel.findByUsername(username);
    console.log('👤 Existing user check:', existingUser ? 'Exists' : 'New user');
    
    if (existingUser) {
      req.flash('error', 'User already registered with that email.');
      return res.redirect('/auth');
    }

    // 4. Restrict roles with better logging
    if (role === 'admin') {
      const count = await authModel.countUsersByRole('admin');
      console.log('👑 Admin count:', count);
      if (count >= 1) {
        req.flash('error', 'You are not a system Administrator.');
        return res.redirect('/auth');
      }
    }

    if (role === 'chairman') {
      const count = await authModel.countUsersByRole('chairman');
      console.log('👔 Chairman count:', count);
      if (count >= 1) {
        req.flash('error', 'You are not a family Chairman.');
        return res.redirect('/auth');
      }
    }

    if (role === 'chief_signatory') {
      const count = await authModel.countUsersByRole('chief_signatory');
      console.log('📝 Chief signatory count:', count);
      if (count >= 1) {
        req.flash('error', 'You are not a Chief Signatory.');
        return res.redirect('/auth');
      }
    }

    if (role === 'assistant_signatory') {
      const count = await authModel.countUsersByRole('assistant_signatory');
      console.log('✍️ Assistant signatory count:', count);
      if (count >= 2) {
        req.flash('error', 'You are not an Assistant Signatory.');
        return res.redirect('/auth');
      }
    }

    // 5. Get member info
    const member = await authModel.getMemberByEmail(username);
    console.log('👤 Member found:', member ? 'Yes' : 'No');
    
    if (!member) {
      req.flash('error', 'Member not found');
      return res.redirect('/auth');
    }

    // 6. Generate OTP first (ensure it's saved to database)
    console.log('🔐 Generating OTP...');
    const otp = await authModel.generateOTP(username);
    console.log('✅ OTP generated:', otp);

    // 7. Store temporary user data with timestamp
    tempUsers.set(username, {
      username,
      password,
      role,
      memberId: member.id,
      createdAt: Date.now(),
      otpGenerated: true
    });

    console.log('💾 Temp user stored for:', username);

    // 8. Send verification email with error handling
    try {
      console.log('📨 Attempting to send verification email...');
      await sendVerificationEmail(username, otp);
      console.log('✅ Verification email sent successfully');
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      // Clean up temporary data if email fails
      tempUsers.delete(username);
      req.flash('error', 'Failed to send verification email. Please try again.');
      return res.redirect('/auth');
    }

    // 9. Redirect to OTP verification page
    req.flash('success', 'Verification code sent to your email. Please check your inbox.');
    console.log('🎯 Redirecting to OTP verification for:', username);
    res.redirect(`/auth/verify-email?email=${encodeURIComponent(username)}`);

  } catch (err) {
    console.error('💥 Signup process error:', err);
    // Clean up on any error
    if (username) {
      tempUsers.delete(username);
    }
    req.flash('error', err.message || 'Signup failed. Please try again.');
    res.redirect('/auth');
  }
});

// Enhanced OTP Verification Page with validation
router.get('/auth/verify-email', (req, res) => {
  const email = req.query.email;
  
  if (!email) {
    req.flash('error', 'Email parameter missing.');
    return res.redirect('/auth');
  }

  if (!tempUsers.has(email)) {
    console.log('❌ No temp user found for:', email);
    req.flash('error', 'Invalid verification session. Please sign up again.');
    return res.redirect('/auth');
  }

  const tempUser = tempUsers.get(email);
  const sessionAge = Date.now() - tempUser.createdAt;
  const maxAge = 30 * 60 * 1000; // 30 minutes

  if (sessionAge > maxAge) {
    console.log('⏰ Session expired for:', email);
    tempUsers.delete(email);
    req.flash('error', 'Verification session expired. Please sign up again.');
    return res.redirect('/auth');
  }

  console.log('📱 Rendering OTP page for:', email);
  res.render('verifyEmail', { 
    flash: res.locals.flash, 
    email: email,
    user: req.session.user 
  });
});

// Enhanced Verify OTP with better error handling
router.post('/auth/verify-email', async (req, res) => {
  const { email, otp } = req.body;

  console.log('🔍 OTP verification attempt:', { email, otpLength: otp?.length });

  try {
    // 1. Check if we have temporary user data
    const tempUser = tempUsers.get(email);
    if (!tempUser) {
      console.log('❌ No temp user during verification:', email);
      req.flash('error', 'Verification session expired. Please sign up again.');
      return res.redirect('/auth');
    }

    // 2. Validate session age
    const sessionAge = Date.now() - tempUser.createdAt;
    const maxAge = 30 * 60 * 1000; // 30 minutes
    if (sessionAge > maxAge) {
      console.log('⏰ Session expired during verification:', email);
      tempUsers.delete(email);
      req.flash('error', 'Verification session expired. Please sign up again.');
      return res.redirect('/auth');
    }

    // 3. Clean expired OTPs
    await authModel.cleanExpiredOTPs();

    // 4. Verify OTP with detailed logging
    console.log('🔐 Verifying OTP for:', email);
    const isValid = await authModel.verifyOTP(email, otp);
    console.log('✅ OTP valid:', isValid);
    
    if (!isValid) {
      req.flash('error', 'Invalid or expired verification code.');
      return res.redirect(`/auth/verify-email?email=${encodeURIComponent(email)}`);
    }

    // 5. Create the user account
    const { username, password, role, memberId } = tempUser;
    console.log('👤 Creating user account for:', username);
    await authModel.createUser(username, password, role, memberId);
    
    // 6. Mark email as verified
    await authModel.markEmailVerified(username);

    // 7. Clean up temporary data
    tempUsers.delete(email);
    console.log('🧹 Cleaned temp data for:', email);

    req.flash('success', 'Email verified successfully! You can now log in.');
    console.log('🎉 User registration completed for:', email);
    res.redirect('/auth');

  } catch (err) {
    console.error('💥 OTP verification error:', err);
    req.flash('error', 'Verification failed. Please try again.');
    res.redirect(`/auth/verify-email?email=${encodeURIComponent(email)}`);
  }
});

// Enhanced Resend OTP with better error handling
router.post('/auth/resend-otp', async (req, res) => {
  const { email } = req.body;

  console.log('🔄 Resend OTP request for:', email);

  try {
    if (!tempUsers.has(email)) {
      console.log('❌ No temp user for resend:', email);
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }

    // Generate new OTP
    console.log('🔐 Generating new OTP for:', email);
    const otp = await authModel.generateOTP(email);

    // Send email with error handling
    try {
      console.log('📨 Resending verification email...');
      await sendVerificationEmail(email, otp);
      console.log('✅ Resent OTP email successfully');
      res.json({ success: true, message: 'New verification code sent!' });
    } catch (emailError) {
      console.error('❌ Resend email failed:', emailError);
      res.status(500).json({ success: false, message: 'Failed to resend verification email' });
    }
  } catch (err) {
    console.error('💥 Resend OTP error:', err);
    res.status(500).json({ success: false, message: 'Failed to resend code' });
  }
});

//Update the resend verification route
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

// Enhanced Login route with better logging
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  console.log('🔑 Login attempt for:', username);

  try {
    const user = await authModel.findByUsername(username);
    const member = await userLandingModel.getMemberProfileByEmail(username);
   
    if (!user || !(await authModel.comparePasswords(password, user.password))) {
      console.log('❌ Invalid credentials for:', username);
      req.flash('error', 'Invalid credentials');
      return res.redirect('/auth');
    }

    // Check if email is verified
    if (!user.email_verified) {
      // Store the unverified email in session for the resend page
      req.session.pendingVerification = username;
      req.flash('verification_required', 'true');
      console.log('📧 Email not verified for:', username);
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

    console.log('✅ Login successful for:', username, 'Role:', user.role);
    req.flash('success', 'Welcome, ' + (member?.first_name || user.username));

    // Redirect based on role
    if (user.role === 'admin') {
      return res.redirect('/admin');
    }

    res.redirect('/dashboard');

  } catch (err) {
    console.error('💥 Login error:', err);
    req.flash('error', 'Login failed');
    res.redirect('/auth');
  }
});

// Logout
router.get('/logout', (req, res) => {
  console.log('🚪 Logout for user:', req.session.user?.username);
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

// Enhanced Handle reset request submission
router.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  console.log('🔐 Forgot password request for:', email);
  
  try {
    const user = await authModel.findByUsername(email);
    if (!user) {
      console.log('❌ User not found for password reset:', email);
      req.flash('error', 'No user found with that email.');
      return res.redirect('/auth/forgot-password');
    }

    // Generate token & expiry (1 hour)
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);

    await authModel.saveResetToken(user.id, token, expires);
    
    const resetLink = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
    
    console.log('📨 Sending reset email to:', email);
    
    // Now this should work correctly
    await sendResetEmail(email, resetLink);

    req.flash('success', 'Password reset email sent. Please check your inbox.');
    console.log('✅ Reset email sent successfully to:', email);
    res.redirect('/auth');
  } catch (err) {
    console.error('💥 Reset email error:', err);
    req.flash('error', 'Error sending reset email. Try again later.');
    res.redirect('/auth/forgot-password');
  }
});

// Show password reset form
router.get('/auth/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  
  console.log('🔍 Checking reset token:', token);
  
  try {
    const resetEntry = await authModel.findResetToken(token);
    if (!resetEntry || resetEntry.expires_at < new Date()) {
      console.log('❌ Invalid or expired reset token');
      req.flash('error', 'Reset link expired or invalid.');
      return res.redirect('/auth');
    }
    
    console.log('✅ Valid reset token found');
    res.render('resetPassword', { token });
  } catch (err) {
    console.error('💥 Reset token check error:', err);
    req.flash('error', 'Something went wrong.');
    res.redirect('/auth');
  }
});

// Enhanced Handle new password submission
router.post('/auth/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmNewPassword } = req.body;

  console.log('🔄 Processing password reset for token:', token);

  if (newPassword !== confirmNewPassword) {
    req.flash('error', 'Passwords do not match.');
    return res.redirect(`/auth/reset-password/${token}`);
  }

  try {
    const resetEntry = await authModel.findResetToken(token);
    if (!resetEntry || resetEntry.expires_at < new Date()) {
      console.log('❌ Invalid reset token during password update');
      req.flash('error', 'Reset link expired or invalid.');
      return res.redirect('/auth');
    }

    console.log('🔑 Updating password for user:', resetEntry.user_id);
    await authModel.updatePassword(resetEntry.user_id, newPassword);
    await authModel.deleteResetToken(token);

    req.flash('success', 'Password updated successfully. Please log in.');
    console.log('✅ Password reset completed successfully');
    res.redirect('/auth');
  } catch (err) {
    console.error('💥 Password reset error:', err);
    req.flash('error', 'Failed to reset password.');
    res.redirect(`/auth/reset-password/${token}`);
  }
});

// Enhanced cleanup with better logging
setInterval(() => {
  const now = Date.now();
  const expired = 30 * 60 * 1000; // 30 minutes
  let cleanedCount = 0;
  
  for (const [email, data] of tempUsers.entries()) {
    if (now - data.createdAt > expired) {
      tempUsers.delete(email);
      cleanedCount++;
      console.log(`🧹 Cleaned up expired temporary data for: ${email}`);
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} expired temporary user sessions`);
  }
}, 15 * 60 * 1000); // Run every 15 minutes

module.exports = router;


