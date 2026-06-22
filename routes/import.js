const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { processCSV, MAX_ROWS } = require('../services/csvImport');
const { requireAuth, requireAdmin }  = require('../middleware/auth');

// Multer — memory storage (no temp file on disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only .csv files are allowed.'));
    }
    cb(null, true);
  }
});

// GET /import — upload form
router.get('/', requireAuth, async (req, res) => {
  res.render('admin/import', {
    title:   'CSV Import',
    user:    req.session.user,
    result:  null,
    error:   req.flash('error'),
    success: req.flash('success')
  });
});

// POST /import — process upload
router.post('/', requireAuth, (req, res, next) => {
  upload.single('csvFile')(req, res, async (err) => {
    if (err) {
      return res.render('admin/import', {
        title:  'CSV Import',
        user:   req.session.user,
        result: null,
        error:  [err.message],
        success: []
      });
    }

    if (!req.file) {
      return res.render('admin/import', {
        title:  'CSV Import',
        user:   req.session.user,
        result: null,
        error:  ['Please select a CSV file to upload.'],
        success: []
      });
    }

    try {
      const result = await processCSV(req.file.buffer, req.session.user.id);
      res.render('admin/import', {
        title:   'CSV Import',
        user:    req.session.user,
        result,
        error:   [],
        success: []
      });
    } catch (importErr) {
      console.error('Import error:', importErr);
      res.render('admin/import', {
        title:  'CSV Import',
        user:   req.session.user,
        result: null,
        error:  ['Import failed: ' + importErr.message],
        success: []
      });
    }
  });
});

module.exports = router;
