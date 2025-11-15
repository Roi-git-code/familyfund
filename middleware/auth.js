
// middleware/auth.js
const authModel = require('../models/authModel');

exports.requireAuth = (req, res, next) => {
  if (req.session?.user) return next();
  res.redirect('/auth');
};

exports.requireVerifiedEmail = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth');
  }

  try {
    const isVerified = await authModel.isEmailVerified(req.session.user.username);
    if (!isVerified) {
      req.flash('error', 'Please verify your email to access this page.');
      return res.redirect('/auth');
    }
    next();
  } catch (error) {
    console.error('Email verification check failed:', error);
    res.redirect('/auth');
  }
};

exports.requireRole = (role) => {
  return (req, res, next) => {
    if (req.session.user?.role === role) return next();
    res.status(403).send('Access denied: insufficient permissions.');
  };
};

exports.allowRoles = (...roles) => {
  return (req, res, next) => {
    if (req.session.user && roles.includes(req.session.user.role)) {
      return next();
    }
    res.status(403).send('Access denied.');
  };
};


