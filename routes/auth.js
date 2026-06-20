const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { requireAuth } = require('../middleware/auth');

// GET /auth/login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/login', {
    title: 'Login',
    error: req.flash('error'),
    success: req.flash('success')
  });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username, isActive: true } });
    if (!user || !(await user.validatePassword(password))) {
      req.flash('error', 'Invalid username or password.');
      return res.redirect('/auth/login');
    }
    req.session.user = {
      id: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    };
    // Force password change on first login
    if (user.mustChangePassword) {
      return res.redirect('/auth/change-password');
    }
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Login failed. Please try again.');
    res.redirect('/auth/login');
  }
});

// GET /auth/change-password
router.get('/change-password', requireAuth, (req, res) => {
  res.render('auth/change-password', {
    title: 'Change Password',
    user: req.session.user,
    error: req.flash('error'),
    success: req.flash('success'),
    forced: req.session.user.mustChangePassword
  });
});

// POST /auth/change-password
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const errors = [];

  if (!currentPassword) errors.push('Current password is required.');
  if (!newPassword || newPassword.length < 6) errors.push('New password must be at least 6 characters.');
  if (newPassword !== confirmPassword) errors.push('Passwords do not match.');

  if (errors.length > 0) {
    errors.forEach(e => req.flash('error', e));
    return res.redirect('/auth/change-password');
  }

  try {
    const user = await User.findByPk(req.session.user.id);
    if (!user) return res.redirect('/auth/login');

    const valid = await user.validatePassword(currentPassword);
    if (!valid) {
      req.flash('error', 'Current password is incorrect.');
      return res.redirect('/auth/change-password');
    }

    await user.update({ password: newPassword, mustChangePassword: false });
    req.session.user.mustChangePassword = false;
    req.flash('success', 'Password changed successfully. Welcome!');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to change password.');
    res.redirect('/auth/change-password');
  }
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

module.exports = router;
