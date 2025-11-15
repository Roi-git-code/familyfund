
// routes/staticRoutes.js
const express = require('express');
const router = express.Router();

// Privacy Policy Route
router.get('/privacy', (req, res) => {
  res.render('privacy', { 
    user: req.session.user,
    pageTitle: 'Privacy Policy - FamilyFund'

  });
});

// Terms of Service Route
router.get('/terms', (req, res) => {
  res.render('terms', { 
    user: req.session.user,
    pageTitle: 'Terms of Service - FamilyFund'

  });
});

// Contact Support Route
router.get('/contact', (req, res) => {
  res.render('contact', { 
    user: req.session.user,
    pageTitle: 'Contact Support - FamilyFund'

  });
});

// FAQ Route
router.get('/faq', (req, res) => {
  res.render('faq', { 
    user: req.session.user,
    pageTitle: 'FAQ - FamilyFund'
  });
});

// Support Form Submission
router.post('/support/submit', (req, res) => {
  // Handle support form submission
  const { name, email, subject, urgency, message } = req.body;
  
  console.log('Support request received:', {
    name,
    email,
    subject,
    urgency,
    message: message.substring(0, 100) + '...' // Log first 100 chars
  });
  
  // Here you would typically:
  // 1. Save to database
  // 2. Send email notification
  // 3. Create support ticket
  
  req.flash('success', 'Thank you for your message! We will respond within 2-4 hours.');
  res.redirect('/contact');
});

module.exports = router;

