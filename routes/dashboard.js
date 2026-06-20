const express = require('express');
const router = express.Router();
const { Location, Businessman, User } = require('../models');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, async (req, res) => {
  try {
    const totalLocations = await Location.count();
    const totalBusinessmen = await Businessman.count();

    if (req.session.user.role === 'admin') {
      const totalUsers = await User.count();
      return res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        stats: { totalLocations, totalBusinessmen, totalUsers },
        user: req.session.user,
        error: req.flash('error'),
        success: req.flash('success')
      });
    }

    // Data entry dashboard
    const locations = await Location.findAll({ order: [['locationName', 'ASC']] });
    res.render('admin/data-entry-dashboard', {
      title: 'Data Entry Dashboard',
      stats: { totalLocations, totalBusinessmen },
      locations: locations.map(l => l.toJSON()),
      user: req.session.user,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', {
      title: 'Dashboard', stats: {},
      user: req.session.user,
      error: ['Failed to load dashboard data.'], success: []
    });
  }
});

module.exports = router;
