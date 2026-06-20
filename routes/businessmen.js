const express = require('express');
const router = express.Router();
const { Businessman, Location, User } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /businessmen - list all (admin + data_entry)
router.get('/', requireAuth, async (req, res) => {
  try {
    const businessmen = await Businessman.findAll({
      include: [
        { model: Location, as: 'location', attributes: ['locationName', 'ward'] },
        { model: User, as: 'registrar', attributes: ['fullName'] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.render('admin/businessmen', {
      title: 'Businessmen Registry',
      businessmen: businessmen.map(b => b.toJSON()),
      user: req.session.user,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to load businessmen.');
    res.redirect('/dashboard');
  }
});

// GET /businessmen/add - form (admin + data_entry)
router.get('/add', requireAuth, async (req, res) => {
  try {
    const locations = await Location.findAll({ order: [['locationName', 'ASC']] });
    res.render('admin/businessman-form', {
      title: 'Add Businessman',
      locations: locations.map(l => l.toJSON()),
      businessman: {},
      isEdit: false,
      user: req.session.user,
      error: req.flash('error')
    });
  } catch (err) {
    req.flash('error', 'Failed to load form.');
    res.redirect('/dashboard');
  }
});

// POST /businessmen - create (admin + data_entry)
router.post('/', requireAuth, async (req, res) => {
  const { locationId, fullName, gender, nin, age, tin, mobileNumber, businessType } = req.body;
  const errors = [];

  if (!locationId) errors.push('Location is required.');
  if (!fullName || fullName.trim().length < 2) errors.push('Full name is required.');
  if (!gender) errors.push('Gender is required.');
  if (!nin || !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)) errors.push('NIN format must be XXXXXXXX-XXXXX-XXXXX-XX.');
  if (!mobileNumber || mobileNumber.trim().length < 9) errors.push('Valid mobile number is required.');
  if (!businessType || businessType.trim().length < 2) errors.push('Business type is required.');

  if (errors.length > 0) return res.json({ success: false, errors });

  try {
    const existing = await Businessman.findOne({ where: { nin } });
    if (existing) return res.json({ success: false, errors: ['NIN already registered in the system.'] });

    await Businessman.create({
      locationId, fullName: fullName.trim(), gender, nin, age: parseInt(age),
      tin: tin ? tin.trim() : null, mobileNumber: mobileNumber.trim(),
      businessType: businessType.trim(), registeredBy: req.session.user.id
    });
    return res.json({ success: true, message: 'Businessman registered successfully.' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, errors: ['Failed to register. Please try again.'] });
  }
});

// GET /businessmen/:id - view (admin + data_entry)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const biz = await Businessman.findByPk(req.params.id, {
      include: [
        { model: Location, as: 'location' },
        { model: User, as: 'registrar', attributes: ['fullName', 'username'] }
      ]
    });
    if (!biz) { req.flash('error', 'Record not found.'); return res.redirect('/businessmen'); }
    res.render('admin/businessman-view', {
      title: 'Businessman Details',
      biz: biz.toJSON(),
      user: req.session.user,
      error: req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    req.flash('error', 'Failed to load record.');
    res.redirect('/businessmen');
  }
});

// GET /businessmen/:id/edit (admin only)
router.get('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const biz = await Businessman.findByPk(req.params.id);
    if (!biz) { req.flash('error', 'Record not found.'); return res.redirect('/businessmen'); }
    const locations = await Location.findAll({ order: [['locationName', 'ASC']] });
    res.render('admin/businessman-form', {
      title: 'Edit Businessman',
      locations: locations.map(l => l.toJSON()),
      businessman: biz.toJSON(),
      isEdit: true,
      user: req.session.user,
      error: req.flash('error')
    });
  } catch (err) {
    req.flash('error', 'Failed to load record.');
    res.redirect('/businessmen');
  }
});

// PUT /businessmen/:id (admin only)
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  const { locationId, fullName, gender, nin, age, tin, mobileNumber, businessType } = req.body;
  const errors = [];

  if (!locationId) errors.push('Location is required.');
  if (!fullName || fullName.trim().length < 2) errors.push('Full name is required.');
  if (!gender) errors.push('Gender is required.');
  if (!nin || !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)) errors.push('NIN format must be XXXXXXXX-XXXXX-XXXXX-XX.');
  if (!mobileNumber || mobileNumber.trim().length < 9) errors.push('Valid mobile number is required.');
  if (!businessType || businessType.trim().length < 2) errors.push('Business type is required.');

  if (errors.length > 0) return res.json({ success: false, errors });

  try {
    const biz = await Businessman.findByPk(req.params.id);
    if (!biz) return res.json({ success: false, errors: ['Record not found.'] });

    const existing = await Businessman.findOne({ where: { nin } });
    if (existing && existing.id !== biz.id) {
      return res.json({ success: false, errors: ['NIN already registered to another record.'] });
    }

    await biz.update({
      locationId, fullName: fullName.trim(), gender, nin,
      age: parseInt(age), tin: tin || null,
      mobileNumber: mobileNumber.trim(), businessType: businessType.trim()
    });
    return res.json({ success: true, message: 'Record updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, errors: ['Failed to update record. Please try again.'] });
  }
});

// DELETE /businessmen/:id (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const biz = await Businessman.findByPk(req.params.id);
    if (!biz) { req.flash('error', 'Record not found.'); return res.redirect('/businessmen'); }
    await biz.destroy();
    req.flash('success', 'Record deleted successfully.');
    res.redirect('/businessmen');
  } catch (err) {
    req.flash('error', 'Failed to delete record.');
    res.redirect('/businessmen');
  }
});

module.exports = router;
