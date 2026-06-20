const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    req.flash('error', 'Please login to continue.');
    return res.redirect('/auth/login');
  }
  // Use req.originalUrl so the full path is available regardless of which router calls this.
  // req.path strips the mount prefix (/auth), so /auth/change-password becomes /change-password.
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

module.exports = { requireAuth, requireAdmin };
