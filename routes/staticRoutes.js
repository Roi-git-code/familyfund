
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

module.exports = router;


