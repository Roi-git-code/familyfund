// middleware/auth.js
exports.requireAuth = (req, res, next) => {
  if (req.session?.user) return next();
  res.redirect('/auth');
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
