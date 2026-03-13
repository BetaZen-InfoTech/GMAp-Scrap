import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { ScrapedRecord } from '../shared/types';

export interface ExcelGenResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function generateExcel(
  sessionId: string,
  keyword: string,
  records: ScrapedRecord[],
  appDataExcelDir: string,
  outputFolder?: string
): Promise<ExcelGenResult> {
  try {
    // Always save to AppData excel dir
    if (!fs.existsSync(appDataExcelDir)) {
      fs.mkdirSync(appDataExcelDir, { recursive: true });
    }

    const safeKeyword = keyword.replace(/[^a-z0-9_\-]/gi, '_').substring(0, 40);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const fileName = `${safeKeyword}_${dateStr}_${sessionId.substring(0, 8)}.xlsx`;
    const filePath = path.join(appDataExcelDir, fileName);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Google Maps Scraper';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Scraped Data', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'Business Name', key: 'name', width: 35 },
      { header: 'Name (English)', key: 'nameEnglish', width: 30 },
      { header: 'Name (Local)', key: 'nameLocal', width: 30 },
      { header: 'Address', key: 'address', width: 45 },
      { header: 'Phone', key: 'phone', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Website', key: 'website', width: 35 },
      { header: 'Rating', key: 'rating', width: 10 },
      { header: 'Reviews', key: 'reviews', width: 12 },
      { header: 'Category / Type', key: 'category', width: 25 },
      { header: 'Plus Code', key: 'plusCode', width: 20 },
      { header: 'Latitude', key: 'latitude', width: 15 },
      { header: 'Longitude', key: 'longitude', width: 15 },
      { header: 'Photo URL', key: 'photoUrl', width: 50 },
      { header: 'Maps URL', key: 'mapsUrl', width: 50 },
      { header: 'Timestamp', key: 'timestamp', width: 22 },
      { header: 'Session ID', key: 'sessionId', width: 15 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF93C5FD' } } };
    });
    headerRow.height = 22;

    records.forEach((record, idx) => {
      const row = sheet.addRow({
        name: record.name,
        nameEnglish: record.nameEnglish || '',
        nameLocal: record.nameLocal || '',
        address: record.address,
        phone: record.phone,
        email: record.email || '',
        website: record.website,
        rating: record.rating,
        reviews: record.reviews,
        category: record.category,
        plusCode: record.plusCode || '',
        latitude: record.latitude ?? '',
        longitude: record.longitude ?? '',
        photoUrl: record.photoUrl || '',
        mapsUrl: record.mapsUrl,
        timestamp: record.timestamp,
        sessionId: record.sessionId,
      });

      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        });
      }

      const urlCell = row.getCell('mapsUrl');
      if (record.mapsUrl) {
        urlCell.value = { text: 'View on Maps', hyperlink: record.mapsUrl };
        urlCell.font = { color: { argb: 'FF2563EB' }, underline: true };
      }
    });

    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columns.length },
    };

    await workbook.xlsx.writeFile(filePath);

    // If user configured an output folder, also copy there
    if (outputFolder) {
      try {
        if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder, { recursive: true });
        fs.copyFileSync(filePath, path.join(outputFolder, fileName));
      } catch {
        // Don't fail if extra copy fails
      }
    }

    return { success: true, filePath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
