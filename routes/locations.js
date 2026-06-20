const express = require('express');
const router = express.Router();
const { Location, User, Businessman } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /locations - list all (admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const locations = await Location.findAll({
      include: [
        { model: User, as: 'creator', attributes: ['fullName'] },
        { model: Businessman, as: 'businessmen', attributes: ['id'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    const locList = locations.map(l => l.toJSON());
    res.render('admin/locations', {
      title: 'Business Locations',
      locations: locList,
      user: req.session.user,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load locations.');
    res.redirect('/dashboard');
  }
});

// POST /locations - create (admin + data_entry)
router.post('/', requireAuth, async (req, res) => {
  const { locationName, ward } = req.body;
  try {
    if (!locationName || !ward) {
      req.flash('error', 'Location name and ward are required.');
      return res.redirect(req.session.user.role === 'admin' ? '/locations' : '/dashboard');
    }
    await Location.create({ locationName: locationName.trim(), ward: ward.trim(), createdBy: req.session.user.id });
    req.flash('success', 'Location added successfully.');
    res.redirect(req.session.user.role === 'admin' ? '/locations' : '/dashboard');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add location.');
    res.redirect(req.session.user.role === 'admin' ? '/locations' : '/dashboard');
  }
});

// DELETE /locations/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) { req.flash('error', 'Location not found.'); return res.redirect('/locations'); }
    await location.destroy();
    req.flash('success', 'Location deleted.');
    res.redirect('/locations');
  } catch (err) {
    req.flash('error', 'Failed to delete location.');
    res.redirect('/locations');
  }
});

module.exports = router;
