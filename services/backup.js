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
    console.log(`✅ Backup created: ${filename} (${businessmen.length} businessmen, ${locations.length} locations)`);

    // Purge old backups — keep only the latest MAX_BACKUPS
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);

    files.slice(MAX_BACKUPS).forEach(f => {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
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
    .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      const data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8'));
      return {
        filename: f,
        filepath:  path.join(BACKUP_DIR, f),
        size:      (stat.size / 1024).toFixed(1) + ' KB',
        createdAt: stat.mtime,
        counts:    data.counts || {}
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
