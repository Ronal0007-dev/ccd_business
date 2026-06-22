/**
 * CSV Import Service for Businessman data
 * Handles up to 500 rows with validation, deduplication and batch insert
 *
 * Expected CSV columns (case-insensitive, trimmed):
 *   location_id | full_name | gender | nin | tin | mobile_number | business_type
 *
 * NIN is auto-calculated for age.
 */
const { parse } = require('csv-parse/sync');
const { Businessman, Location } = require('../models');
const { Op } = require('sequelize');

const MAX_ROWS = 500;

// Normalise a header string to a known field key
function normaliseHeader(h) {
  const map = {
    'location_id':   'locationId',
    'locationid':    'locationId',
    'location id':   'locationId',
    'location':      'locationId',
    'full_name':     'fullName',
    'fullname':      'fullName',
    'full name':     'fullName',
    'name':          'fullName',
    'gender':        'gender',
    'sex':           'gender',
    'nin':           'nin',
    'national id':   'nin',
    'national_id':   'nin',
    'tin':           'tin',
    'tin#':          'tin',
    'tax id':        'tin',
    'mobile_number': 'mobileNumber',
    'mobile':        'mobileNumber',
    'phone':         'mobileNumber',
    'phone_number':  'mobileNumber',
    'business_type': 'businessType',
    'businesstype':  'businessType',
    'business type': 'businessType',
    'business':      'businessType',
    'type':          'businessType'
  };
  return map[h.toLowerCase().trim()] || null;
}

function calcAge(nin) {
  const match = nin && nin.match(/^(\d{4})/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const age  = new Date().getFullYear() - year;
  return (age > 0 && age < 130) ? age : null;
}

async function processCSV(fileBuffer, registeredBy) {
  const results = {
    total:     0,
    inserted:  0,
    skipped:   0,
    errors:    [],
    warnings:  []
  };

  // Parse CSV
  let records;
  try {
    records = parse(fileBuffer, {
      columns:          true,
      skip_empty_lines: true,
      trim:             true,
      bom:              true   // handle UTF-8 BOM from Excel exports
    });
  } catch (parseErr) {
    return { ...results, errors: [`CSV parse error: ${parseErr.message}`] };
  }

  if (records.length === 0) {
    return { ...results, errors: ['CSV file is empty or has no data rows.'] };
  }

  if (records.length > MAX_ROWS) {
    return { ...results, errors: [`CSV exceeds maximum of ${MAX_ROWS} rows. Found ${records.length} rows.`] };
  }

  results.total = records.length;

  // Normalise headers
  const rawHeaders  = Object.keys(records[0]);
  const headerMap   = {};
  rawHeaders.forEach(h => {
    const norm = normaliseHeader(h);
    if (norm) headerMap[h] = norm;
  });

  const missingRequired = ['locationId','fullName','gender','nin','mobileNumber','businessType']
    .filter(f => !Object.values(headerMap).includes(f));

  if (missingRequired.length > 0) {
    return {
      ...results,
      errors: [`Missing required CSV columns: ${missingRequired.join(', ')}. ` +
               `Expected headers: location_id, full_name, gender, nin, mobile_number, business_type`]
    };
  }

  // Load all valid location IDs for fast lookup
  const locations  = await Location.findAll({ attributes: ['id'], raw: true });
  const locationIds = new Set(locations.map(l => l.id));

  // Load existing NINs for deduplication
  const existingNins = new Set(
    (await Businessman.findAll({ attributes: ['nin'], raw: true })).map(b => b.nin)
  );

  // Validate and collect rows
  const toInsert = [];

  for (let i = 0; i < records.length; i++) {
    const row     = records[i];
    const rowNum  = i + 2; // 1-based, +1 for header
    const rowErrs = [];

    // Map raw keys to normalised field names
    const data = {};
    Object.entries(row).forEach(([k, v]) => {
      if (headerMap[k]) data[headerMap[k]] = v;
    });

    // --- Validate each field ---
    const locationId = parseInt(data.locationId);
    if (!data.locationId || isNaN(locationId)) {
      rowErrs.push('location_id is required and must be a number');
    } else if (!locationIds.has(locationId)) {
      rowErrs.push(`location_id ${locationId} does not exist`);
    }

    const fullName = (data.fullName || '').trim();
    if (!fullName || fullName.length < 2) rowErrs.push('full_name is required');

    const gender = (data.gender || '').trim();
    const genderNorm = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
    if (!['Male','Female'].includes(genderNorm)) rowErrs.push('gender must be Male or Female');

    const nin = (data.nin || '').trim();
    if (!nin) {
      rowErrs.push('nin is required');
    } else if (!/^\d{8}-\d{5}-\d{5}-\d{2}$/.test(nin)) {
      rowErrs.push(`nin format invalid (expected XXXXXXXX-XXXXX-XXXXX-XX, got: ${nin})`);
    } else if (existingNins.has(nin)) {
      rowErrs.push(`nin ${nin} already exists in database — skipped`);
      results.skipped++;
      if (rowErrs.length) results.warnings.push(`Row ${rowNum}: ${rowErrs.join('; ')}`);
      continue;
    } else if (toInsert.find(r => r.nin === nin)) {
      rowErrs.push(`nin ${nin} is duplicated within the CSV`);
    }

    const mobile = (data.mobileNumber || '').trim();
    if (!mobile || mobile.length < 9) rowErrs.push('mobile_number is required (min 9 digits)');

    const bizType = (data.businessType || '').trim();
    if (!bizType || bizType.length < 2) rowErrs.push('business_type is required');

    if (rowErrs.length > 0) {
      results.errors.push(`Row ${rowNum} (${fullName || 'unknown'}): ${rowErrs.join('; ')}`);
      results.skipped++;
      continue;
    }

    const age = calcAge(nin);
    if (!age) {
      results.warnings.push(`Row ${rowNum}: Could not calculate age from NIN "${nin}" — defaulting to 0`);
    }

    existingNins.add(nin); // prevent intra-CSV duplicates
    toInsert.push({
      locationId,
      fullName,
      gender:       genderNorm,
      nin,
      age:          age || 0,
      tin:          (data.tin || '').trim() || null,
      mobileNumber: mobile,
      businessType: bizType,
      registeredBy
    });
  }

  // Batch insert in chunks of 50 for efficiency
  const CHUNK = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    await Businessman.bulkCreate(chunk, { validate: false });
    results.inserted += chunk.length;
  }

  return results;
}

module.exports = { processCSV, MAX_ROWS };
