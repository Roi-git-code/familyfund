exports.ensureAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  res.redirect('/');
};

exports.requireRole = (role) => {
  return (req, res, next) => {
    if (req.session.user && req.session.user.role === role) {
      return next();
    }
    res.status(403).send('Access denied');
  };
};

exports.requireAnyRole = (roles) => {
  return (req, res, next) => {
    if (req.session.user && roles.includes(req.session.user.role)) {
      return next();
    }
    res.status(403).send('Access denied');
  };
};
