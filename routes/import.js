const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const { processCSV, MAX_ROWS } = require('../services/csvImport');
const { requireAuth }          = require('../middleware/auth');
const { Location, Block }      = require('../models');

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv')
      return cb(new Error('Only .csv files are allowed.'));
    cb(null, true);
  }
});

// GET /import/template — MUST be before GET /import/ to avoid any prefix conflict
router.get('/template', requireAuth, async (req, res) => {
  try {
    // Try to fetch a real location+block to make the template more useful
    let locId   = 1;
    let blkName = 'Block A';
    try {
      const firstLoc = await Location.findOne({
        include: [{ model: Block, as: 'blocks', attributes: ['blockName'] }],
        order: [['id', 'ASC']]
      });
      if (firstLoc) {
        locId   = firstLoc.id;
        if (firstLoc.blocks && firstLoc.blocks.length > 0) {
          blkName = firstLoc.blocks[0].blockName;
        }
      }
    } catch (_) {
      // fall through — use defaults
    }

    const csv = [
      'location_id,full_name,gender,nin,tin,mobile_number,business_type,block_name,cabin_number',
      `${locId},John Mwangi,Male,19850312-12345-67890-01,,0712345678,Retail Shop,${blkName},C-101`,
      `${locId},Amina Hassan,Female,19920605-98765-43210-02,123456789,0756789012,Food Vendor,${blkName},C-102`,
      `${locId},Peter Kimani,Male,19781120-11111-22222-03,,0745678901,Hardware Store,,`,
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="businessmen-import-template.csv"');
    res.setHeader('Cache-Control', 'no-cache');
    return res.send(csv);
  } catch (err) {
    console.error('Template download error:', err);
    req.flash('error', 'Failed to generate template file.');
    return res.redirect('/import');
  }
});

// GET /import — upload form
router.get('/', requireAuth, async (req, res) => {
  let locations = [];
  try {
    const locs = await Location.findAll({
      include: [{ model: Block, as: 'blocks', attributes: ['id', 'blockName'] }],
      order: [['locationName', 'ASC'], [{ model: Block, as: 'blocks' }, 'blockName', 'ASC']]
    });
    locations = locs.map(l => l.toJSON());
  } catch (_) {}

  res.render('admin/import', {
    title: 'CSV Import', user: req.session.user,
    locations, result: null,
    error:   req.flash('error'),
    success: req.flash('success')
  });
});

// POST /import — process upload
router.post('/', requireAuth, (req, res, next) => {
  upload.single('csvFile')(req, res, async (err) => {
    let locations = [];
    try {
      const locs = await Location.findAll({
        include: [{ model: Block, as: 'blocks', attributes: ['id', 'blockName'] }],
        order: [['locationName', 'ASC']]
      });
      locations = locs.map(l => l.toJSON());
    } catch (_) {}

    if (err) {
      return res.render('admin/import', {
        title: 'CSV Import', user: req.session.user,
        locations, result: null, error: [err.message], success: []
      });
    }
    if (!req.file) {
      return res.render('admin/import', {
        title: 'CSV Import', user: req.session.user,
        locations, result: null,
        error: ['Please select a CSV file to upload.'], success: []
      });
    }
    try {
      const result = await processCSV(req.file.buffer, req.session.user.id);
      res.render('admin/import', {
        title: 'CSV Import', user: req.session.user,
        locations, result, error: [], success: []
      });
    } catch (importErr) {
      console.error('Import error:', importErr);
      res.render('admin/import', {
        title: 'CSV Import', user: req.session.user,
        locations, result: null,
        error: ['Import failed: ' + importErr.message], success: []
      });
    }
  });
});

module.exports = router;
