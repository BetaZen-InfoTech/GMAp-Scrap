import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';

// ── Types ────────────────────────────────────────────────────────────────────

interface SubCategoryEntry {
  id: string;
  subCategory: string;
}

interface CategoryItem {
  category: string;
  count: number;
  inNiches: boolean;
  subCategories: SubCategoryEntry[];
}

interface ScrapedRecord {
  _id: string;
  name?: string;
  phone?: string;
  address?: string;
  rating?: number;
  reviews?: number;
  pincode?: string;
  plusCode?: string;
  website?: string;
  isDuplicate?: boolean;
  scrapedAt?: string;
}

// ── CategoriesPage ────────────────────────────────────────────────────────────

const CategoriesPage: React.FC = () => {
  // Category list state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  // Selected category / records state
  const [selected, setSelected] = useState<CategoryItem | null>(null);
  const [records, setRecords] = useState<ScrapedRecord[]>([]);
  const [recTotal, setRecTotal] = useState(0);
  const [recPage, setRecPage] = useState(1);
  const recLimit = 25;
  const [recLoading, setRecLoading] = useState(false);

  // Add category form
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newSubCategory, setNewSubCategory] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Fetch categories ────────────────────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    setCatLoading(true);
    try {
      const res = await api.get('/api/admin/categories');
      setCategories(res.data.categories || []);
    } catch {
      setCategories([]);
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // ── Fetch records for selected category ────────────────────────────────────
  const fetchRecords = useCallback(async (cat: string, page: number) => {
    setRecLoading(true);
    try {
      const res = await api.get(`/api/admin/categories/${encodeURIComponent(cat)}/records`, {
        params: { page, limit: recLimit },
      });
      setRecords(res.data.data || []);
      setRecTotal(res.data.total || 0);
      setRecPage(page);
    } catch {
      setRecords([]);
      setRecTotal(0);
    } finally {
      setRecLoading(false);
    }
  }, []);

  const handleSelect = (cat: CategoryItem) => {
    setSelected(cat);
    fetchRecords(cat.category, 1);
  };

  // ── Add category ────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newCategory.trim() || !newSubCategory.trim()) {
      setAddError('Both fields are required');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      await api.post('/api/admin/categories', {
        category: newCategory.trim(),
        subCategory: newSubCategory.trim(),
      });
      setNewCategory('');
      setNewSubCategory('');
      setShowAdd(false);
      await fetchCategories();
    } catch (err: any) {
      setAddError(err?.response?.data?.error || 'Failed to add category');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Delete category ─────────────────────────────────────────────────────────
  const handleDelete = async (category: string) => {
    setDeleteLoading(true);
    try {
      await api.delete(`/api/admin/categories/${encodeURIComponent(category)}`);
      if (selected?.category === category) {
        setSelected(null);
        setRecords([]);
        setRecTotal(0);
      }
      await fetchCategories();
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  // ── Filtered categories ─────────────────────────────────────────────────────
  const filtered = categories.filter((c) =>
    c.category.toLowerCase().includes(searchText.toLowerCase())
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-5 h-full min-h-0">
      {/* Left: Category List */}
      <div className="w-80 shrink-0 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Categories</h2>
            <p className="text-sm text-slate-500 mt-0.5">{categories.length} total</p>
          </div>
          <button
            onClick={() => { setShowAdd(true); setAddError(''); }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search categories..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full"
        />

        {/* Add form */}
        {showAdd && (
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-white">New Category</p>
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category (e.g. Restaurant)"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full"
            />
            <input
              type="text"
              value={newSubCategory}
              onChange={(e) => setNewSubCategory(e.target.value)}
              placeholder="Sub-category (e.g. Indian Food)"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-full"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            {addError && <p className="text-xs text-red-400">{addError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={addLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {addLoading ? 'Adding...' : 'Add'}
              </button>
              <button
                onClick={() => { setShowAdd(false); setAddError(''); setNewCategory(''); setNewSubCategory(''); }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Category list */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 overflow-y-auto">
          {catLoading ? (
            <div className="p-6 flex justify-center"><Spinner message="Loading..." /></div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-sm">No categories found</div>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {filtered.map((cat) => (
                <li key={cat.category}>
                  <div
                    onClick={() => handleSelect(cat)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors group ${
                      selected?.category === cat.category
                        ? 'bg-blue-600/20 border-l-2 border-blue-500'
                        : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${selected?.category === cat.category ? 'text-blue-300' : 'text-white'}`}>
                        {cat.category}
                      </p>
                      {cat.inNiches && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {cat.subCategories.length} sub-{cat.subCategories.length === 1 ? 'category' : 'categories'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        cat.count > 0 ? 'bg-blue-900/60 text-blue-300' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {cat.count.toLocaleString()}
                      </span>
                      {cat.inNiches && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(cat.category); }}
                          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1 rounded"
                          title="Delete category"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Right: Records Panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm">Select a category to view scraped records</p>
            </div>
          </div>
        ) : (
          <>
            {/* Records header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">{selected.category}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {recTotal.toLocaleString()} record{recTotal !== 1 ? 's' : ''}
                </p>
              </div>
              {selected.inNiches && selected.subCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selected.subCategories.map((sc) => (
                    <span key={sc.id} className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-lg">
                      {sc.subCategory}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Records table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1">
              {recLoading && records.length === 0 ? (
                <div className="p-8 flex justify-center"><Spinner message="Loading records..." /></div>
              ) : records.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">No records found for this category</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Address</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rating</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reviews</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {records.map((rec) => (
                          <tr key={rec._id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 text-white font-medium max-w-[180px] truncate">
                              {rec.name || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              {rec.phone || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-400 max-w-[220px] truncate">
                              {rec.address || '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              {rec.rating != null ? (
                                <span className="flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  {rec.rating}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              {rec.reviews != null ? rec.reviews.toLocaleString() : '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                              {rec.pincode || '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {rec.isDuplicate ? (
                                <span className="text-xs bg-yellow-900/40 text-yellow-400 px-2 py-0.5 rounded-full">Duplicate</span>
                              ) : (
                                <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full">New</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t border-slate-800 px-4">
                    <Pagination
                      page={recPage}
                      total={recTotal}
                      limit={recLimit}
                      onPageChange={(p) => {
                        fetchRecords(selected.category, p);
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">Delete Category</h3>
            <p className="text-sm text-slate-400 mb-5">
              Remove <span className="text-white font-medium">{deleteTarget}</span> and all its sub-categories from the scraping list? Scraped records will not be deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleDelete(deleteTarget)}
                disabled={deleteLoading}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriesPage;
