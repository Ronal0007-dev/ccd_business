const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const VALID_ROLES = ['admin', 'data_entry', 'viewer'];

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.findAll({ order: [['createdAt', 'DESC']] });
    res.render('admin/users', {
      title: 'User Management',
      users: users.map(u => u.toJSON()),
      user: req.session.user,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    req.flash('error', 'Failed to load users.');
    res.redirect('/dashboard');
  }
});

router.get('/add', requireAuth, requireAdmin, (req, res) => {
  res.render('admin/user-form', {
    title: 'Add User', userData: {}, isEdit: false,
    user: req.session.user, error: req.flash('error')
  });
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { fullName, email, phoneNumber, role } = req.body;
  const errors = [];
  if (!fullName || fullName.trim().length < 2) errors.push('Full name is required.');
  if (!phoneNumber || phoneNumber.trim().length < 9) errors.push('Valid phone number is required.');
  if (!role || !VALID_ROLES.includes(role)) errors.push('Role is required.');

  if (errors.length > 0) { errors.forEach(e => req.flash('error', e)); return res.redirect('/users/add'); }

  try {
    const existingPhone = await User.findOne({ where: { phoneNumber: phoneNumber.trim() } });
    if (existingPhone) { req.flash('error', 'Phone number already registered.'); return res.redirect('/users/add'); }

    if (email && email.trim()) {
      const existingEmail = await User.findOne({ where: { email: email.trim() } });
      if (existingEmail) { req.flash('error', 'Email already registered.'); return res.redirect('/users/add'); }
    }

    const baseUsername = fullName.trim().split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    const phoneSuffix  = phoneNumber.trim().slice(-4);
    let username = baseUsername + phoneSuffix;
    const existing = await User.findOne({ where: { username } });
    if (existing) username = username + Math.floor(Math.random() * 900 + 100);

    await User.create({
      fullName: fullName.trim(),
      email: email && email.trim() ? email.trim() : null,
      phoneNumber: phoneNumber.trim(),
      username, password: phoneNumber.trim(),
      role, isActive: true, mustChangePassword: true
    });

    req.flash('success', `User created. Username: "${username}", Default password: phone number.`);
    res.redirect('/users');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to create user.');
    res.redirect('/users/add');
  }
});

router.get('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const u = await User.findByPk(req.params.id);
    if (!u) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    res.render('admin/user-view', {
      title: 'User Details', userData: u.toJSON(),
      user: req.session.user, error: req.flash('error'), success: req.flash('success')
    });
  } catch (err) { req.flash('error', 'Failed to load user.'); res.redirect('/users'); }
});

router.get('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const u = await User.findByPk(req.params.id);
    if (!u) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    res.render('admin/user-form', {
      title: 'Edit User', userData: u.toJSON(), isEdit: true,
      user: req.session.user, error: req.flash('error')
    });
  } catch (err) { req.flash('error', 'Failed to load user.'); res.redirect('/users'); }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { fullName, email, phoneNumber, role, isActive } = req.body;
  const errors = [];
  if (!fullName || fullName.trim().length < 2) errors.push('Full name is required.');
  if (!phoneNumber || phoneNumber.trim().length < 9) errors.push('Valid phone number is required.');
  if (!role || !VALID_ROLES.includes(role)) errors.push('Role is required.');

  if (errors.length > 0) { errors.forEach(e => req.flash('error', e)); return res.redirect('/users/' + req.params.id + '/edit'); }

  try {
    const u = await User.findByPk(req.params.id);
    if (!u) { req.flash('error', 'User not found.'); return res.redirect('/users'); }

    if (u.role === 'admin' && role !== 'admin') {
      const adminCount = await User.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) { req.flash('error', 'Cannot demote the only admin.'); return res.redirect('/users/' + req.params.id + '/edit'); }
    }

    const existingPhone = await User.findOne({ where: { phoneNumber: phoneNumber.trim() } });
    if (existingPhone && existingPhone.id !== u.id) { req.flash('error', 'Phone number already in use.'); return res.redirect('/users/' + req.params.id + '/edit'); }

    await u.update({
      fullName: fullName.trim(),
      email: email && email.trim() ? email.trim() : null,
      phoneNumber: phoneNumber.trim(), role, isActive: isActive === '1'
    });
    req.flash('success', 'User updated successfully.');
    res.redirect('/users/' + req.params.id);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to update user.');
    res.redirect('/users/' + req.params.id + '/edit');
  }
});

router.post('/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const u = await User.findByPk(req.params.id);
    if (!u) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    await u.update({ password: u.phoneNumber, mustChangePassword: true });
    req.flash('success', `Password reset to phone number for ${u.fullName}.`);
    res.redirect('/users/' + u.id);
  } catch (err) { req.flash('error', 'Failed to reset password.'); res.redirect('/users/' + req.params.id); }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const u = await User.findByPk(req.params.id);
    if (!u) { req.flash('error', 'User not found.'); return res.redirect('/users'); }
    if (u.id === req.session.user.id) { req.flash('error', 'Cannot delete your own account.'); return res.redirect('/users'); }
    if (u.role === 'admin') {
      const adminCount = await User.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) { req.flash('error', 'Cannot delete the only admin.'); return res.redirect('/users'); }
    }
    await u.destroy();
    req.flash('success', 'User deleted.');
    res.redirect('/users');
  } catch (err) { req.flash('error', 'Failed to delete user.'); res.redirect('/users'); }
});

module.exports = router;
