const express = require('express');
const router = express.Router();
const { Location, Block, User, Businessman } = require('../models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /locations
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const locations = await Location.findAll({
      include: [
        { model: User,  as: 'creator',    attributes: ['fullName'] },
        { model: Block, as: 'blocks',     attributes: ['id', 'blockName'] },
        { model: Businessman, as: 'businessmen', attributes: ['id'] }
      ],
      order: [['createdAt', 'DESC'], [{ model: Block, as: 'blocks' }, 'blockName', 'ASC']]
    });
    res.render('admin/locations', {
      title: 'Business Locations',
      locations: locations.map(l => l.toJSON()),
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

// POST /locations - add location
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  const { locationName, ward } = req.body;
  if (!locationName || !ward) {
    req.flash('error', 'Location name and ward are required.');
    return res.redirect('/locations');
  }
  try {
    await Location.create({ locationName: locationName.trim(), ward: ward.trim(), createdBy: req.session.user.id });
    req.flash('success', `Location "${locationName.trim()}" added successfully.`);
    res.redirect('/locations');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add location.');
    res.redirect('/locations');
  }
});

// POST /locations/:id/blocks - add block to location
router.post('/:id/blocks', requireAuth, requireAdmin, async (req, res) => {
  const { blockName } = req.body;
  if (!blockName || !blockName.trim()) {
    req.flash('error', 'Block/Zone name is required.');
    return res.redirect('/locations');
  }
  try {
    const location = await Location.findByPk(req.params.id);
    if (!location) { req.flash('error', 'Location not found.'); return res.redirect('/locations'); }
    await Block.create({ locationId: location.id, blockName: blockName.trim(), createdBy: req.session.user.id });
    req.flash('success', `Block "${blockName.trim()}" added to ${location.locationName}.`);
    res.redirect('/locations');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to add block.');
    res.redirect('/locations');
  }
});

// DELETE /locations/:id/blocks/:blockId
router.delete('/:id/blocks/:blockId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const block = await Block.findOne({ where: { id: req.params.blockId, locationId: req.params.id } });
    if (!block) { req.flash('error', 'Block not found.'); return res.redirect('/locations'); }
    await block.destroy();
    req.flash('success', 'Block deleted.');
    res.redirect('/locations');
  } catch (err) {
    req.flash('error', 'Failed to delete block.');
    res.redirect('/locations');
  }
});

// DELETE /locations/:id
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

// GET /locations/:id/blocks - JSON API for cascade dropdown
router.get('/:id/blocks', requireAuth, async (req, res) => {
  try {
    const blocks = await Block.findAll({
      where: { locationId: req.params.id },
      order: [['blockName', 'ASC']],
      attributes: ['id', 'blockName']
    });
    res.json(blocks);
  } catch (err) {
    res.json([]);
  }
});

module.exports = router;
