const ExcelJS  = require('exceljs');
const path     = require('path');
const fs       = require('fs');
const axios    = require('axios');
const FormData = require('form-data');
const { API_BASE_URL } = require('./config');

/**
 * Generate a formatted .xlsx file in the project's /excel folder.
 * Returns { success, filePath } or { success: false, error }.
 */
async function generateExcel(sessionId, keyword, records, outputDir) {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const safeKeyword = keyword.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 40);
    const dateStr     = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName    = `${safeKeyword}_${dateStr}_${sessionId.substring(0, 8)}.xlsx`;
    const filePath    = path.join(outputDir, fileName);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BetaZen Google Maps Scraper';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Scraped Data', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'Business Name',   key: 'name',        width: 35 },
      { header: 'Name (English)',  key: 'nameEnglish', width: 30 },
      { header: 'Name (Local)',    key: 'nameLocal',   width: 30 },
      { header: 'Address',         key: 'address',     width: 45 },
      { header: 'Phone',           key: 'phone',       width: 20 },
      { header: 'Email',           key: 'email',       width: 30 },
      { header: 'Website',         key: 'website',     width: 35 },
      { header: 'Rating',          key: 'rating',      width: 10 },
      { header: 'Reviews',         key: 'reviews',     width: 12 },
      { header: 'Category / Type', key: 'category',    width: 25 },
      { header: 'Plus Code',       key: 'plusCode',    width: 20 },
      { header: 'Latitude',        key: 'latitude',    width: 15 },
      { header: 'Longitude',       key: 'longitude',   width: 15 },
      { header: 'Photo URL',       key: 'photoUrl',    width: 50 },
      { header: 'Maps URL',        key: 'mapsUrl',     width: 50 },
      { header: 'Timestamp',       key: 'timestamp',   width: 22 },
      { header: 'Session ID',      key: 'sessionId',   width: 15 },
    ];

    // Header row styling
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } };
    });
    headerRow.height = 22;

    records.forEach((record, idx) => {
      const row = sheet.addRow({
        name:        record.name         || '',
        nameEnglish: record.nameEnglish  || '',
        nameLocal:   record.nameLocal    || '',
        address:     record.address      || '',
        phone:       record.phone        || '',
        email:       record.email        || '',
        website:     record.website      || '',
        rating:      record.rating       ?? 0,
        reviews:     record.reviews      ?? 0,
        category:    record.category     || '',
        plusCode:    record.plusCode     || '',
        latitude:    record.latitude     != null ? record.latitude  : '',
        longitude:   record.longitude    != null ? record.longitude : '',
        photoUrl:    record.photoUrl     || '',
        mapsUrl:     record.mapsUrl      || '',
        timestamp:   record.timestamp    || '',
        sessionId:   record.sessionId    || '',
      });

      // Alternating row background
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        });
      }

      // Hyperlink for Maps URL
      if (record.mapsUrl) {
        const urlCell = row.getCell('mapsUrl');
        urlCell.value = { text: 'View on Maps', hyperlink: record.mapsUrl };
        urlCell.font  = { color: { argb: 'FF2563EB' }, underline: true };
      }
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: sheet.columns.length },
    };

    await workbook.xlsx.writeFile(filePath);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Upload an Excel file to the backend API.
 * Retries up to 3 times with back-off.
 */
const RETRY_DELAYS = [1000, 2000, 4000];

async function uploadExcel(filePath, sessionId, keyword, deviceId) {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  const endpoint = `${API_BASE_URL}/api/scraped-data/excel`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), {
        filename: path.basename(filePath),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      form.append('sessionId', sessionId);
      form.append('keyword', keyword);
      if (deviceId) form.append('deviceId', deviceId);
      form.append('timestamp', new Date().toISOString());

      await axios.post(endpoint, form, {
        headers: form.getHeaders(),
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      return { success: true };
    } catch (err) {
      const serverMsg = err.response?.data?.message || err.response?.data?.error || '';
      const fullError = serverMsg ? `${err.message} — ${serverMsg}` : err.message;
      if (attempt === RETRY_DELAYS.length) {
        return { success: false, error: fullError };
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }

  return { success: false, error: 'Max retries reached' };
}

module.exports = { generateExcel, uploadExcel };
