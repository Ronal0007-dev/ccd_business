const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    req.flash('error', 'Please login to continue.');
    return res.redirect('/auth/login');
  }
  if (req.session.user.mustChangePassword) {
    const url = req.originalUrl.split('?')[0];
    if (!url.startsWith('/auth/change-password') && !url.startsWith('/auth/logout')) {
      return res.redirect('/auth/change-password');
    }
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    req.flash('error', 'Access denied. Admin only.');
    return res.redirect('/dashboard');
  }
  next();
};

// Admin or Data Entry (not viewer)
const requireEditor = (req, res, next) => {
  if (!req.session.user || !['admin', 'data_entry'].includes(req.session.user.role)) {
    req.flash('error', 'Access denied. You have view-only access.');
    return res.redirect('/businessmen');
  }
  next();
};

module.exports = { requireAuth, requireAdmin, requireEditor };
