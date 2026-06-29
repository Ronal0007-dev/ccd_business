/**
 * CSV Import Service — Businessman data
 * Supports up to 500 rows with validation, deduplication, and batch insert.
 *
 * Required columns:  location_id, full_name, gender, nin, mobile_number, business_type
 * Optional columns:  block_name, cabin_number, tin
 *
 * block_name is matched by name within the chosen location (case-insensitive).
 * cabin_number is stored as-is.
 * Age is auto-calculated from the first 4 digits of NIN.
 */

const { parse }      = require('csv-parse/sync');
const { Businessman, Location, Block } = require('../models');
const { Op }         = require('sequelize');

const MAX_ROWS = 500;

function normaliseHeader(h) {
  const s = h.toLowerCase().trim().replace(/\s+/g, '_');
  const map = {
    'location_id':    'locationId',
    'locationid':     'locationId',
    'location':       'locationId',
    'full_name':      'fullName',
    'fullname':       'fullName',
    'name':           'fullName',
    'gender':         'gender',
    'sex':            'gender',
    'nin':            'nin',
    'national_id':    'nin',
    'tin':            'tin',
    'tin#':           'tin',
    'tax_id':         'tin',
    'mobile_number':  'mobileNumber',
    'mobile':         'mobileNumber',
    'phone':          'mobileNumber',
    'phone_number':   'mobileNumber',
    'business_type':  'businessType',
    'businesstype':   'businessType',
    'business':       'businessType',
    'type':           'businessType',
    // NEW
    'block_name':     'blockName',
    'block':          'blockName',
    'zone':           'blockName',
    'zone_name':      'blockName',
    'block/zone':     'blockName',
    'block_zone':     'blockName',
    'cabin_number':   'cabinNumber',
    'cabin':          'cabinNumber',
    'cabin_no':       'cabinNumber',
    'stall':          'cabinNumber',
    'stall_number':   'cabinNumber',
  };
  return map[s] || null;
}

function calcAge(nin) {
  const m = nin && nin.match(/^(\d{4})/);
  if (!m) return null;
  const age = new Date().getFullYear() - parseInt(m[1]);
  return (age > 0 && age < 130) ? age : null;
}

async function processCSV(fileBuffer, registeredBy) {
  const results = { total: 0, inserted: 0, skipped: 0, errors: [], warnings: [] };

  // ── Parse ──────────────────────────────────────────────
  let records;
  try {
    records = parse(fileBuffer, {
      columns: true, skip_empty_lines: true, trim: true, bom: true
    });
  } catch (e) {
    return { ...results, errors: [`CSV parse error: ${e.message}`] };
  }

  if (!records.length)
    return { ...results, errors: ['CSV file is empty or has no data rows.'] };

  if (records.length > MAX_ROWS)
    return { ...results, errors: [`CSV exceeds maximum of ${MAX_ROWS} rows. Found ${records.length}.`] };

  results.total = records.length;

  // ── Header mapping ──────────────────────────────────────
  const rawHeaders = Object.keys(records[0]);
  const headerMap  = {};
  rawHeaders.forEach(h => {
    const norm = normaliseHeader(h);
    if (norm) headerMap[h] = norm;
  });

  const REQUIRED = ['locationId','fullName','gender','nin','mobileNumber','businessType'];
  const missing  = REQUIRED.filter(f => !Object.values(headerMap).includes(f));
  if (missing.length)
    return {
      ...results,
      errors: [`Missing required columns: ${missing.join(', ')}. ` +
               `Required: location_id, full_name, gender, nin, mobile_number, business_type`]
    };

  // ── Pre-load lookups ────────────────────────────────────
  // Locations: id → location
  const locations   = await Location.findAll({ attributes: ['id'], raw: true });
  const locationIds = new Set(locations.map(l => l.id));

  // Blocks: { locationId_blockNameLower → blockId }
  const allBlocks   = await Block.findAll({ attributes: ['id', 'locationId', 'blockName'], raw: true });
  const blockLookup = {};
  allBlocks.forEach(b => {
    const key = `${b.locationId}_${b.blockName.toLowerCase().trim()}`;
    blockLookup[key] = b.id;
  });

  // Existing NINs
  const existingNins = new Set(
    (await Businessman.findAll({ attributes: ['nin'], raw: true })).map(b => b.nin)
  );

  // ── Row validation ──────────────────────────────────────
  const toInsert = [];

  for (let i = 0; i < records.length; i++) {
    const row    = records[i];
    const rowNum = i + 2;
    const errs   = [];

    // Map raw keys → normalised names
    const d = {};
    Object.entries(row).forEach(([k, v]) => { if (headerMap[k]) d[headerMap[k]] = v; });

    // location_id
    const locationId = parseInt(d.locationId);
    if (!d.locationId || isNaN(locationId))  errs.push('location_id required and must be a number');
    else if (!locationIds.has(locationId))   errs.push(`location_id ${locationId} does not exist`);

    // full_name
    const fullName = (d.fullName || '').trim();
    if (fullName.length < 2) errs.push('full_name is required');

    // gender
    const gender     = (d.gender || '').trim();
    const genderNorm = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
    if (!['Male','Female'].includes(genderNorm)) errs.push('gender must be Male or Female');

    // nin
    const nin = (d.nin || '').trim();
    if (!nin) {
      errs.push('nin is required');
    } else if (!/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)) {
      errs.push(`nin format invalid (got: ${nin}, expected: XXXXXXXX-XXXXX-XXXXX-XX)`);
    } else if (existingNins.has(nin)) {
      results.skipped++;
      results.warnings.push(`Row ${rowNum} (${fullName || '?'}): nin ${nin} already in database — skipped`);
      continue;
    } else if (toInsert.find(r => r.nin === nin)) {
      errs.push(`nin ${nin} is duplicated within this CSV`);
    }

    // mobile_number
    const mobile = (d.mobileNumber || '').trim();
    if (!mobile || mobile.replace(/\D/g,'').length < 9) errs.push('mobile_number required (min 9 digits)');

    // business_type
    const bizType = (d.businessType || '').trim();
    if (bizType.length < 2) errs.push('business_type is required');

    if (errs.length) {
      results.errors.push(`Row ${rowNum} (${fullName || '?'}): ${errs.join('; ')}`);
      results.skipped++;
      continue;
    }

    // ── Optional: block_name lookup ──
    let blockId     = null;
    const blockName = (d.blockName || '').trim();
    if (blockName && !isNaN(locationId)) {
      const key = `${locationId}_${blockName.toLowerCase()}`;
      if (blockLookup[key]) {
        blockId = blockLookup[key];
      } else {
        results.warnings.push(
          `Row ${rowNum} (${fullName}): block/zone "${blockName}" not found in location ${locationId} — stored without block`
        );
      }
    }

    // ── Optional: cabin_number ──
    const cabinNumber = (d.cabinNumber || '').trim() || null;

    // ── Age ──
    const age = calcAge(nin);
    if (!age) results.warnings.push(`Row ${rowNum}: Could not calculate age from NIN "${nin}" — defaulting to 0`);

    existingNins.add(nin);
    toInsert.push({
      locationId, blockId, cabinNumber,
      fullName, gender: genderNorm, nin,
      age: age || 0,
      tin:          (d.tin || '').trim() || null,
      mobileNumber: mobile,
      businessType: bizType,
      registeredBy
    });
  }

  // ── Batch insert in chunks of 50 ────────────────────────
  const CHUNK = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    await Businessman.bulkCreate(toInsert.slice(i, i + CHUNK), { validate: false });
    results.inserted += Math.min(CHUNK, toInsert.length - i);
  }

  return results;
}

module.exports = { processCSV, MAX_ROWS };
