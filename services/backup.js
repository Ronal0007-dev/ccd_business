/**
 * Backup Service
 * - Exports all businessmen + locations to a JSON file every 3 days
 * - Keeps last 10 backups, auto-deletes older ones
 */
const fs   = require('fs');
const path = require('path');
const cron = require('node-cron');

const BACKUP_DIR  = path.join(__dirname, '..', 'backups');
const MAX_BACKUPS = 10;

// Ensure backup dir exists
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

async function runBackup() {
  try {
    // Lazy-require models to avoid circular issues at startup
    const { Businessman, Location, User } = require('../models');

    const [businessmen, locations, users] = await Promise.all([
      Businessman.findAll({ raw: true }),
      Location.findAll({ raw: true }),
      User.findAll({
        attributes: ['id','fullName','username','email','phoneNumber','role','isActive','createdAt'],
        raw: true
      })
    ]);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename  = `backup-${timestamp}.json`;
    const filepath  = path.join(BACKUP_DIR, filename);

    const payload = {
      exportedAt:  new Date().toISOString(),
      counts:      { businessmen: businessmen.length, locations: locations.length, users: users.length },
      businessmen,
      locations,
      users
    };

    fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf8');

    // Write a tiny sidecar metadata file so listBackups() never has to
    // parse the full (potentially multi-MB) backup JSON just to show counts.
    const metaPath = path.join(BACKUP_DIR, `backup-${timestamp}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ counts: payload.counts, exportedAt: payload.exportedAt }), 'utf8');

    console.log(`✅ Backup created: ${filename} (${businessmen.length} businessmen, ${locations.length} locations)`);

    // Purge old backups — keep only the latest MAX_BACKUPS (and their sidecar meta files)
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json') && !f.endsWith('.meta.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    files.slice(MAX_BACKUPS).forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      const meta = f.name.replace(/\.json$/, '.meta.json');
      if (fs.existsSync(path.join(BACKUP_DIR, meta))) fs.unlinkSync(path.join(BACKUP_DIR, meta));
      console.log(`🗑  Purged old backup: ${f.name}`);
    });

    return { success: true, filename, counts: payload.counts };
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    return { success: false, error: err.message };
  }
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-') && f.endsWith('.json') && !f.endsWith('.meta.json'))
    .map(f => {
      const stat     = fs.statSync(path.join(BACKUP_DIR, f));
      const metaPath = path.join(BACKUP_DIR, f.replace(/\.json$/, '.meta.json'));
      let counts = {};
      if (fs.existsSync(metaPath)) {
        // Tiny file — safe and fast to parse even with thousands of backups
        try { counts = JSON.parse(fs.readFileSync(metaPath, 'utf8')).counts || {}; } catch (_) {}
      } else {
        // Legacy backup created before sidecar metadata existed — fall back
        // to parsing the full file just this once (older backups only).
        try { counts = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8')).counts || {}; } catch (_) {}
      }
      return {
        filename:  f,
        filepath:  path.join(BACKUP_DIR, f),
        size:      (stat.size / 1024).toFixed(1) + ' KB',
        createdAt: stat.mtime,
        counts
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function startScheduler() {
  // Run at 02:00 AM every 3 days
  // Cron: minute hour * * * — we use a counter trick via a daily job that checks days elapsed
  // Simplest reliable approach: run daily at 2am, check if 3 days have passed since last backup

  cron.schedule('0 2 */3 * *', async () => {
    console.log('⏰ Scheduled backup starting...');
    await runBackup();
  });

  console.log('📅 Backup scheduler started — runs every 3 days at 02:00 AM');
}

module.exports = { runBackup, listBackups, BACKUP_DIR };
module.exports.startScheduler = startScheduler;
