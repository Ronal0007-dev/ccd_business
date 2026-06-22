const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const { runBackup, listBackups, BACKUP_DIR } = require('../services/backup');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /backups — list all backups (admin only)
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const backups = listBackups();
  res.render('admin/backups', {
    title:   'System Backups',
    user:    req.session.user,
    backups,
    error:   req.flash('error'),
    success: req.flash('success')
  });
});

// POST /backups/run — trigger manual backup (admin only)
router.post('/run', requireAuth, requireAdmin, async (req, res) => {
  const result = await runBackup();
  if (result.success) {
    req.flash('success',
      `Backup created: ${result.filename} — ` +
      `${result.counts.businessmen} businessmen, ${result.counts.locations} locations`
    );
  } else {
    req.flash('error', 'Backup failed: ' + result.error);
  }
  res.redirect('/backups');
});

// GET /backups/download/:filename — download a backup file (admin only)
router.get('/download/:filename', requireAuth, requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename); // sanitize
  const filepath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filepath)) {
    req.flash('error', 'Backup file not found.');
    return res.redirect('/backups');
  }
  res.download(filepath, filename);
});

// DELETE /backups/:filename — delete a backup file (admin only)
router.delete('/:filename', requireAuth, requireAdmin, (req, res) => {
  const filename = path.basename(req.params.filename);
  const filepath = path.join(BACKUP_DIR, filename);

  try {
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    req.flash('success', `Backup "${filename}" deleted.`);
  } catch (err) {
    req.flash('error', 'Failed to delete backup: ' + err.message);
  }
  res.redirect('/backups');
});

module.exports = router;
