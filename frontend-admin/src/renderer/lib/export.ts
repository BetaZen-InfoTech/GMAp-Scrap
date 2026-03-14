import api from './api';
import type { ScrapedDataRecord } from '../../shared/types';
import type { ScrapDbFilters } from '../store/useScrapDatabaseStore';

function filtersToParams(filters: ScrapDbFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search) params.search = filters.search;
  if (filters.category) params.category = filters.category;
  if (filters.pincode) params.pincode = filters.pincode;
  if (filters.missingPhone) params.missingPhone = 'true';
  if (filters.missingAddress) params.missingAddress = 'true';
  if (filters.missingWebsite) params.missingWebsite = 'true';
  if (filters.missingEmail) params.missingEmail = 'true';
  return params;
}

export async function exportCSV(filters: ScrapDbFilters, selectedIds?: string[]) {
  const params: Record<string, string> = {
    ...filtersToParams(filters),
    format: 'csv',
  };
  if (selectedIds?.length) params.ids = selectedIds.join(',');

  const res = await api.get('/api/admin/scrap-database/export', {
    params,
    responseType: 'blob',
  });

  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scraped-data-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportExcel(filters: ScrapDbFilters, selectedIds?: string[]) {
  const XLSX = await import('xlsx');

  const params: Record<string, string> = {
    ...filtersToParams(filters),
    format: 'json',
  };
  if (selectedIds?.length) params.ids = selectedIds.join(',');

  const res = await api.get('/api/admin/scrap-database/export', { params });
  const data: ScrapedDataRecord[] = res.data.data || [];

  const rows = data.map((r) => ({
    Name: r.name || '',
    Phone: r.phone || '',
    Email: r.email || '',
    Address: r.address || '',
    Website: r.website || '',
    Rating: r.rating ?? '',
    Reviews: r.reviews ?? '',
    Category: r.category || '',
    Pincode: r.pincode || '',
    PlusCode: r.plusCode || '',
    Latitude: r.latitude ?? '',
    Longitude: r.longitude ?? '',
    'Maps URL': r.mapsUrl || '',
    Keyword: r.scrapKeyword || '',
    'Scrap Category': r.scrapCategory || '',
    'Scrap SubCategory': r.scrapSubCategory || '',
    Round: r.scrapRound ?? '',
    'Scraped At': r.scrapedAt || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scraped Data');
  XLSX.writeFile(wb, `scraped-data-${Date.now()}.xlsx`);
}
