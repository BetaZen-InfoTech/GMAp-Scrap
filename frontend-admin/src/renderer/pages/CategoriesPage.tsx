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

interface ScrapedSubCategory {
  subCategory: string;
  count: number;
  devices: number;
  rounds: number[];
}

interface ScrapedRecord {
  _id: string;
  name?: string;
  phone?: string;
  address?: string;
  email?: string;
  website?: string;
  photoUrl?: string;
  rating?: number;
  reviews?: number;
  pincode?: string;
  plusCode?: string;
  isDuplicate?: boolean;
  scrapedAt?: string;
  scrapSubCategory?: string;
}

type View = 'categories' | 'subcategories' | 'records';

// ── CategoriesPage ────────────────────────────────────────────────────────────

const CategoriesPage: React.FC = () => {
  const [view, setView] = useState<View>('categories');

  // Category list state
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  // Selected category
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);

  // Subcategories state
  const [subCategories, setSubCategories] = useState<ScrapedSubCategory[]>([]);
  const [subCatLoading, setSubCatLoading] = useState(false);
  const [subCatTotalRecords, setSubCatTotalRecords] = useState(0);

  // Selected subcategory + records
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('');
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

  // ── Fetch categories ──────────────────────────────────────────────────────
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

  // ── Fetch subcategories for a category ────────────────────────────────────
  const fetchSubCategories = useCallback(async (category: string) => {
    setSubCatLoading(true);
    try {
      const res = await api.get(`/api/admin/categories/${encodeURIComponent(category)}/subcategories`);
      setSubCategories(res.data.subCategories || []);
      setSubCatTotalRecords(res.data.totalRecords || 0);
    } catch {
      setSubCategories([]);
      setSubCatTotalRecords(0);
    } finally {
      setSubCatLoading(false);
    }
  }, []);

  // ── Fetch records ─────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async (category: string, subCategory: string, page: number) => {
    setRecLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: recLimit };
      if (subCategory && subCategory !== 'all') params.subCategory = subCategory;
      const res = await api.get(`/api/admin/categories/${encodeURIComponent(category)}/records`, { params });
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

  // ── Navigation handlers ───────────────────────────────────────────────────
  const handleCategoryClick = (cat: CategoryItem) => {
    setSelectedCategory(cat);
    setView('subcategories');
    fetchSubCategories(cat.category);
  };

  const handleSubCategoryClick = (subCat: string) => {
    if (!selectedCategory) return;
    setSelectedSubCategory(subCat);
    setView('records');
    fetchRecords(selectedCategory.category, subCat, 1);
  };

  const goBack = () => {
    if (view === 'records') {
      setView('subcategories');
      setSelectedSubCategory('');
      setRecords([]);
      setRecTotal(0);
    } else if (view === 'subcategories') {
      setView('categories');
      setSelectedCategory(null);
      setSubCategories([]);
    }
  };

  // ── Add category ──────────────────────────────────────────────────────────
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

  // ── Delete category ───────────────────────────────────────────────────────
  const handleDelete = async (category: string) => {
    setDeleteLoading(true);
    try {
      await api.delete(`/api/admin/categories/${encodeURIComponent(category)}`);
      if (selectedCategory?.category === category) {
        setSelectedCategory(null);
        setView('categories');
      }
      await fetchCategories();
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  // ── Filtered categories ───────────────────────────────────────────────────
  const filtered = categories.filter((c) =>
    c.category.toLowerCase().includes(searchText.toLowerCase())
  );

  // ── Breadcrumb ────────────────────────────────────────────────────────────
  const renderBreadcrumb = () => {
    if (view === 'categories') return null;

    return (
      <div className="flex items-center gap-2 text-sm mb-4">
        <button onClick={() => { setView('categories'); setSelectedCategory(null); }} className="text-blue-400 hover:text-blue-300 transition-colors">
          Categories
        </button>
        {view === 'subcategories' && selectedCategory && (
          <>
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-white font-medium">{selectedCategory.category}</span>
          </>
        )}
        {view === 'records' && selectedCategory && (
          <>
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <button onClick={goBack} className="text-blue-400 hover:text-blue-300 transition-colors">
              {selectedCategory.category}
            </button>
            <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-white font-medium">{selectedSubCategory || 'All'}</span>
          </>
        )}
      </div>
    );
  };

  // ── VIEW 1: Categories List ───────────────────────────────────────────────
  const renderCategoriesView = () => (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Categories</h2>
          <p className="text-sm text-slate-500 mt-0.5">{categories.length} total categories</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchCategories()}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
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
      </div>

      {/* Search + Add form */}
      <div className="flex flex-wrap items-start gap-3">
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search categories..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
        />
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 max-w-md">
          <p className="text-sm font-semibold text-white mb-3">New Category</p>
          <div className="space-y-3">
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
        </div>
      )}

      {/* Category grid */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {catLoading ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading categories..." /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No categories found</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((cat) => (
              <div
                key={cat.category}
                onClick={() => handleCategoryClick(cat)}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 cursor-pointer hover:bg-slate-800/60 hover:border-slate-700 transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors truncate flex-1 mr-2">
                    {cat.category}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
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
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {cat.inNiches && (
                    <span>{cat.subCategories.length} sub-{cat.subCategories.length === 1 ? 'category' : 'categories'}</span>
                  )}
                  {cat.count > 0 && (
                    <span className="flex items-center gap-1 text-slate-400">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      View details
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // ── VIEW 2: Subcategories ─────────────────────────────────────────────────
  const renderSubcategoriesView = () => {
    if (!selectedCategory) return null;

    return (
      <div className="flex flex-col gap-4 h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Back to categories"
            >
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 className="text-lg font-bold text-white">{selectedCategory.category}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {subCategories.length} sub-categories &middot; {subCatTotalRecords.toLocaleString()} total records
              </p>
            </div>
          </div>
          <button
            onClick={() => handleSubCategoryClick('all')}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            View All Records
          </button>
        </div>

        {/* Subcategory grid */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {subCatLoading ? (
            <div className="p-8 flex justify-center"><Spinner message="Loading subcategories..." /></div>
          ) : subCategories.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No subcategories found for this category</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {subCategories.map((sc) => (
                <div
                  key={sc.subCategory}
                  onClick={() => handleSubCategoryClick(sc.subCategory)}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-4 cursor-pointer hover:bg-slate-800/60 hover:border-slate-700 transition-all group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-sm font-semibold text-white group-hover:text-blue-300 transition-colors truncate flex-1 mr-2">
                      {sc.subCategory}
                    </h3>
                    <span className="text-xs font-bold bg-blue-900/60 text-blue-300 px-2.5 py-1 rounded-full shrink-0">
                      {sc.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>{sc.devices} device{sc.devices !== 1 ? 's' : ''}</span>
                    {sc.rounds.length > 0 && (
                      <div className="flex gap-1">
                        {sc.rounds.map((r) => (
                          <span key={r} className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[10px] font-medium">
                            R{r}
                          </span>
                        ))}
                      </div>
                    )}
                    <span className="flex items-center gap-1 text-slate-400 ml-auto">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      View records
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── VIEW 3: Records ───────────────────────────────────────────────────────
  const renderRecordsView = () => {
    if (!selectedCategory) return null;

    return (
      <div className="flex flex-col gap-4 h-full min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={goBack}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Back to subcategories"
            >
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h3 className="text-lg font-bold text-white">
                {selectedSubCategory === 'all' ? 'All Records' : selectedSubCategory}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">
                {recTotal.toLocaleString()} record{recTotal !== 1 ? 's' : ''} in {selectedCategory.category}
              </p>
            </div>
          </div>
        </div>

        {/* Records table */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
          {recLoading && records.length === 0 ? (
            <div className="p-8 flex justify-center"><Spinner message="Loading records..." /></div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">No records found</div>
          ) : (
            <>
              <div className="overflow-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="border-b border-slate-800">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Photo</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Address</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Website</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rating</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reviews</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Sub-Cat</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {records.map((rec) => (
                      <tr key={rec._id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          {rec.photoUrl ? (
                            <img
                              src={rec.photoUrl}
                              alt=""
                              className="w-10 h-10 rounded-lg object-cover bg-slate-800"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                              <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
                              </svg>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white font-medium max-w-[180px] truncate">{rec.name || '—'}</td>
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{rec.phone || '—'}</td>
                        <td className="px-4 py-3 text-slate-300 max-w-[150px] truncate">{rec.email || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-[200px] truncate">{rec.address || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-[150px] truncate">
                          {rec.website ? (
                            <a href={rec.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 truncate block">
                              {rec.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                            </a>
                          ) : '—'}
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
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{rec.pincode || '—'}</td>
                        <td className="px-4 py-3 text-slate-400 max-w-[120px] truncate text-xs">{rec.scrapSubCategory || '—'}</td>
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
              <div className="border-t border-slate-800 px-4 py-2">
                <Pagination
                  page={recPage}
                  total={recTotal}
                  limit={recLimit}
                  onPageChange={(p) => {
                    if (selectedCategory) fetchRecords(selectedCategory.category, selectedSubCategory, p);
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // ── Main Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      {renderBreadcrumb()}

      {view === 'categories' && renderCategoriesView()}
      {view === 'subcategories' && renderSubcategoriesView()}
      {view === 'records' && renderRecordsView()}

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
