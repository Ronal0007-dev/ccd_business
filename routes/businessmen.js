const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Businessman, Location, Block, User } = require('../models');
const { requireAuth, requireAdmin, requireEditor } = require('../middleware/auth');

// GET /businessmen - list with search/filter + pagination / universal print bypass
router.get('/', requireAuth, async (req, res) => {
  const PER_PAGE = 10;
  try {
    const search     = (req.query.search     || '').trim();
    const gender     = (req.query.gender     || '').trim();
    const locationId = (req.query.locationId || '').trim();
    const blockId    = (req.query.blockId    || '').trim();
    const page       = Math.max(1, parseInt(req.query.page) || 1);
    const offset     = (page - 1) * PER_PAGE;
    
    // --- NEW: Detect print/bypass mode ---
    const bypassPagination = req.query.limit === 'all';

    const andConditions = [];
    if (search) {
      andConditions.push({
        [Op.or]: [
          { fullName:     { [Op.like]: `%${search}%` } },
          { nin:          { [Op.like]: `%${search}%` } },
          { mobileNumber: { [Op.like]: `%${search}%` } },
          { businessType: { [Op.like]: `%${search}%` } },
          { cabinNumber:  { [Op.like]: `%${search}%` } }
        ]
      });
    }
    if (gender === 'Male' || gender === 'Female') andConditions.push({ gender });
    if (locationId && !isNaN(parseInt(locationId))) andConditions.push({ locationId: parseInt(locationId) });
    if (blockId    && !isNaN(parseInt(blockId)))    andConditions.push({ blockId:    parseInt(blockId) });

    const where = andConditions.length > 0 ? { [Op.and]: andConditions } : {};

    // --- MODIFIED: Query configuration conditionally strips limits ---
    const queryOptions = {
      where,
      include: [
        { model: Location, as: 'location', attributes: ['id', 'locationName', 'ward'] },
        { model: Block,    as: 'block',    attributes: ['id', 'blockName'] },
        { model: User,     as: 'registrar', attributes: ['fullName'] }
      ],
      order:  [['createdAt', 'DESC']],
      subQuery: false   // needed when includes have a limit
    };

    // Apply pagination variables only if we are NOT bypassing it
    if (!bypassPagination) {
      queryOptions.limit = PER_PAGE;
      queryOptions.offset = offset;
    }

    // Count total matching rows and fetch dataset matching config
    const { count, rows } = await Businessman.findAndCountAll(queryOptions);

    const totalPages = Math.ceil(count / PER_PAGE);
    const safePage   = Math.min(page, totalPages || 1);

    // Lightweight database fetch for dropdowns
    const locations = await Location.findAll({
      attributes: ['id', 'locationName', 'ward'],
      order: [['locationName', 'ASC']]
    });

    let filterBlocks = [];
    if (locationId && !isNaN(parseInt(locationId))) {
      filterBlocks = await Block.findAll({
        where: { locationId: parseInt(locationId) },
        attributes: ['id', 'blockName'],
        order: [['blockName', 'ASC']]
      });
    }

    res.render('admin/businessmen', {
      title: 'Businessmen Registry',
      businessmen:  rows.map(b => b.toJSON()),
      locations:    locations.map(l => l.toJSON()),
      filterBlocks: filterBlocks.map(b => b.toJSON()),
      filters:      { search, gender, locationId, blockId },
      // --- MODIFIED: Pagination payload scales dynamically if bypassed ---
      pagination: {
        page:       safePage,
        totalPages,
        total:      count,
        perPage:    bypassPagination ? count : PER_PAGE,
        hasNext:    bypassPagination ? false : safePage < totalPages,
        hasPrev:    bypassPagination ? false : safePage > 1,
        startItem:  count === 0 ? 0 : (bypassPagination ? 1 : offset + 1),
        endItem:    bypassPagination ? count : Math.min(offset + PER_PAGE, count)
      },
      user:    req.session.user,
      error:   req.flash('error'),
      success: req.flash('success')
    });
  } catch (err) {
    console.error('Businessmen list error:', err);
    res.render('admin/businessmen', {
      title: 'Businessmen Registry',
      businessmen: [], locations: [], filterBlocks: [],
      filters:    { search: '', gender: '', locationId: '', blockId: '' },
      pagination: { page: 1, totalPages: 1, total: 0, perPage: PER_PAGE, hasNext: false, hasPrev: false, startItem: 0, endItem: 0 },
      user:    req.session.user,
      error:   ['Failed to load records: ' + err.message], success: []
    });
  }
});

// GET /businessmen/add
router.get('/add', requireAuth, requireEditor, async (req, res) => {
  try {
    const locations = await Location.findAll({
      include: [{ model: Block, as: 'blocks', attributes: ['id', 'blockName'] }],
      order: [['locationName', 'ASC']]
    });
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

// POST /businessmen
router.post('/', requireAuth, requireEditor, async (req, res) => {
  const { locationId, blockId, cabinNumber, fullName, gender, nin, age, tin, mobileNumber, businessType } = req.body;
  const errors = [];

  if (!locationId)  errors.push('Location is required.');
  if (!fullName || fullName.trim().length < 2) errors.push('Full name is required.');
  if (!gender)      errors.push('Gender is required.');
  if (!nin || !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)) errors.push('NIN format must be XXXXXXXX-XXXXX-XXXXX-XX.');
  if (!mobileNumber || mobileNumber.trim().length < 9)  errors.push('Valid mobile number is required.');
  if (!businessType || businessType.trim().length < 2)  errors.push('Business type is required.');

  if (errors.length > 0) return res.json({ success: false, errors });

  try {
    const existing = await Businessman.findOne({ where: { nin } });
    if (existing) return res.json({ success: false, errors: ['NIN already registered in the system.'] });

    await Businessman.create({
      locationId: parseInt(locationId),
      blockId:    blockId && !isNaN(parseInt(blockId)) ? parseInt(blockId) : null,
      cabinNumber: cabinNumber ? cabinNumber.trim() : null,
      fullName: fullName.trim(), gender, nin,
      age: parseInt(age), tin: tin ? tin.trim() : null,
      mobileNumber: mobileNumber.trim(), businessType: businessType.trim(),
      registeredBy: req.session.user.id
    });
    return res.json({ success: true, message: 'Businessman registered successfully.' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, errors: ['Failed to register. Please try again.'] });
  }
});

// GET /businessmen/:id - view
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const biz = await Businessman.findByPk(req.params.id, {
      include: [
        { model: Location, as: 'location' },
        { model: Block,    as: 'block' },
        { model: User,     as: 'registrar', attributes: ['fullName', 'username'] }
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
    const locations = await Location.findAll({
      include: [{ model: Block, as: 'blocks', attributes: ['id', 'blockName'] }],
      order: [['locationName', 'ASC']]
    });
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
  const { locationId, blockId, cabinNumber, fullName, gender, nin, age, tin, mobileNumber, businessType } = req.body;
  const errors = [];

  if (!locationId)  errors.push('Location is required.');
  if (!fullName || fullName.trim().length < 2) errors.push('Full name is required.');
  if (!gender)      errors.push('Gender is required.');
  if (!nin || !/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)) errors.push('NIN format must be XXXXXXXX-XXXXX-XXXXX-XX.');
  if (!mobileNumber || mobileNumber.trim().length < 9)  errors.push('Valid mobile number is required.');
  if (!businessType || businessType.trim().length < 2)  errors.push('Business type is required.');

  if (errors.length > 0) return res.json({ success: false, errors });

  try {
    const biz = await Businessman.findByPk(req.params.id);
    if (!biz) return res.json({ success: false, errors: ['Record not found.'] });

    const existing = await Businessman.findOne({ where: { nin } });
    if (existing && existing.id !== biz.id)
      return res.json({ success: false, errors: ['NIN already registered to another record.'] });

    await biz.update({
      locationId: parseInt(locationId),
      blockId:    blockId && !isNaN(parseInt(blockId)) ? parseInt(blockId) : null,
      cabinNumber: cabinNumber ? cabinNumber.trim() : null,
      fullName: fullName.trim(), gender, nin,
      age: parseInt(age), tin: tin || null,
      mobileNumber: mobileNumber.trim(), businessType: businessType.trim()
    });
    return res.json({ success: true, message: 'Record updated successfully.' });
  } catch (err) {
    console.error(err);
    return res.json({ success: false, errors: ['Failed to update record.'] });
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