import React, { useEffect, useCallback, useState } from 'react';
import { usePincodeStore } from '../store/usePincodeStore';
import Pagination from '../components/Pagination';
import Spinner from '../components/Spinner';
import MultiSelect from '../components/MultiSelect';
import type { PinCodeRecord, PinCodeInput } from '../../shared/types';

type ModalMode = { kind: 'add' } | { kind: 'edit'; record: PinCodeRecord };

const emptyInput: PinCodeInput = {
  Pincode: '',
  CircleName: '',
  District: '',
  StateName: '',
  Latitude: '',
  Longitude: '',
  Country: 'India',
};

function formatCreatedAt(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const PincodeDetailsPage: React.FC = () => {
  const {
    pincodes, total, page, limit, loading,
    filters, filterOptions,
    fetchPincodes, fetchFilterOptions, setLimit, setFilters, clearFilters,
    createPincode, updatePincode, deletePincode,
  } = usePincodeStore();

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PinCodeRecord | null>(null);

  useEffect(() => {
    fetchFilterOptions();
    fetchPincodes(1);
  }, []);

  const handleSearch = useCallback(() => {
    fetchPincodes(1);
  }, [fetchPincodes]);

  const handleClear = () => {
    clearFilters();
    fetchFilterOptions();
    setTimeout(() => fetchPincodes(1), 0);
  };

  const hasFilters = !!(filters.search || filters.state?.length || filters.district?.length);

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Pincode Details</h2>
          <p className="text-sm text-slate-500 mt-0.5">{total.toLocaleString()} total pincodes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalMode({ kind: 'add' })}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Pincode
          </button>
          <button
            onClick={() => fetchPincodes(page)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={filters.search || ''}
          onChange={(e) => setFilters({ search: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search pincode, district, state..."
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-64"
        />
        <MultiSelect
          options={filterOptions.states}
          selected={filters.state || []}
          onChange={(v) => {
            setFilters({ state: v.length ? v : undefined, district: undefined });
            fetchFilterOptions(v.length ? v : undefined);
            setTimeout(() => fetchPincodes(1), 0);
          }}
          placeholder="All States"
        />
        <MultiSelect
          options={filterOptions.districts}
          selected={filters.district || []}
          onChange={(v) => {
            setFilters({ district: v.length ? v : undefined });
            setTimeout(() => fetchPincodes(1), 0);
          }}
          placeholder="All Districts"
        />
        <button
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Search
        </button>
        {hasFilters && (
          <button
            onClick={handleClear}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        {loading && pincodes.length === 0 ? (
          <div className="p-8 flex justify-center"><Spinner message="Loading pincodes..." /></div>
        ) : pincodes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No pincodes found</div>
        ) : (
          <>
            <div className="overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-900 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Pincode</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">District</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">State</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Circle</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Scraped</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Latitude</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Longitude</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Country</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">First Added</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {pincodes.map((p) => (
                    <tr key={p._id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-blue-300 font-medium whitespace-nowrap">{p.Pincode}</td>
                      <td className="px-4 py-3 text-white">{p.District || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">{p.StateName || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.CircleName || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.scrapedCount ? (
                          <span className="text-xs font-semibold bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded-full">
                            {p.scrapedCount.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.Latitude || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{p.Longitude || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{p.Country || '—'}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">{formatCreatedAt(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setModalMode({ kind: 'edit', record: p })}
                            className="text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded transition-colors"
                            title="Edit pincode"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="text-xs font-medium text-red-300 hover:text-white bg-red-900/40 hover:bg-red-700 px-2.5 py-1 rounded transition-colors"
                            title="Delete pincode"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-800 px-4 py-2">
              <Pagination page={page} total={total} limit={limit} onPageChange={(p) => fetchPincodes(p)} onLimitChange={(l) => { setLimit(l); setTimeout(() => fetchPincodes(1), 0); }} />
            </div>
          </>
        )}
      </div>

      {modalMode && (
        <PincodeFormModal
          mode={modalMode}
          onClose={() => setModalMode(null)}
          onSubmit={async (input) => {
            if (modalMode.kind === 'add') {
              await createPincode(input);
            } else {
              await updatePincode(modalMode.record._id, input);
            }
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          record={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await deletePincode(deleteTarget._id);
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
};

// ── Add/Edit modal ─────────────────────────────────────────────────────────

interface PincodeFormModalProps {
  mode: ModalMode;
  onClose: () => void;
  onSubmit: (input: PinCodeInput) => Promise<void>;
}

const PincodeFormModal: React.FC<PincodeFormModalProps> = ({ mode, onClose, onSubmit }) => {
  const initial: PinCodeInput = mode.kind === 'edit'
    ? {
        Pincode: mode.record.Pincode,
        CircleName: mode.record.CircleName || '',
        District: mode.record.District || '',
        StateName: mode.record.StateName || '',
        Latitude: mode.record.Latitude || '',
        Longitude: mode.record.Longitude || '',
        Country: mode.record.Country || 'India',
      }
    : emptyInput;

  const [form, setForm] = useState<PinCodeInput>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof PinCodeInput>(key: K, val: PinCodeInput[K]) => {
    setForm((f) => ({ ...f, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pincodeNum = Number(form.Pincode);
    if (!Number.isInteger(pincodeNum) || pincodeNum <= 0) {
      setError('Pincode must be a positive integer');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ ...form, Pincode: pincodeNum });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (err as { message?: string })?.message
        || 'Failed to save pincode';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-xl"
      >
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">
            {mode.kind === 'add' ? 'Add Pincode' : `Edit Pincode ${mode.record.Pincode}`}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          <Field label="Pincode *" className="col-span-2 sm:col-span-1">
            <input
              type="number"
              value={form.Pincode ?? ''}
              onChange={(e) => update('Pincode', e.target.value === '' ? '' : Number(e.target.value))}
              required
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="Country" className="col-span-2 sm:col-span-1">
            <input
              type="text"
              value={form.Country ?? ''}
              onChange={(e) => update('Country', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="District" className="col-span-2 sm:col-span-1">
            <input
              type="text"
              value={form.District ?? ''}
              onChange={(e) => update('District', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="State" className="col-span-2 sm:col-span-1">
            <input
              type="text"
              value={form.StateName ?? ''}
              onChange={(e) => update('StateName', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="Circle" className="col-span-2">
            <input
              type="text"
              value={form.CircleName ?? ''}
              onChange={(e) => update('CircleName', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="Latitude" className="col-span-2 sm:col-span-1">
            <input
              type="text"
              value={form.Latitude ?? ''}
              onChange={(e) => update('Latitude', e.target.value)}
              placeholder="28.6225833"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
          <Field label="Longitude" className="col-span-2 sm:col-span-1">
            <input
              type="text"
              value={form.Longitude ?? ''}
              onChange={(e) => update('Longitude', e.target.value)}
              placeholder="77.2127222"
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </Field>
        </div>

        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded bg-red-900/40 border border-red-800/60 text-red-200 text-xs">
            {error}
          </div>
        )}

        <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {submitting ? 'Saving…' : mode.kind === 'add' ? 'Create' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};

const Field: React.FC<{ label: string; className?: string; children: React.ReactNode }> = ({ label, className = '', children }) => (
  <label className={`flex flex-col gap-1 ${className}`}>
    <span className="text-xs font-medium text-slate-400">{label}</span>
    {children}
  </label>
);

// ── Delete confirm modal ───────────────────────────────────────────────────

interface DeleteConfirmProps {
  record: PinCodeRecord;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteConfirmModal: React.FC<DeleteConfirmProps> = ({ record, onCancel, onConfirm }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (err as { message?: string })?.message
        || 'Failed to delete pincode';
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-md shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-base font-semibold text-white">Delete pincode?</h3>
        </div>
        <div className="px-5 py-4 text-sm text-slate-300">
          Pincode <span className="text-blue-300 font-mono">{record.Pincode}</span>
          {record.District ? <> — {record.District}, {record.StateName}</> : null} will be permanently removed from
          the PinCode-Dataset collection. This cannot be undone.
          {record.scrapedCount ? (
            <div className="mt-3 px-3 py-2 rounded bg-yellow-900/30 border border-yellow-800/60 text-yellow-200 text-xs">
              Heads up: {record.scrapedCount.toLocaleString()} scraped record(s) reference this pincode. They will not be deleted, but may become orphans.
            </div>
          ) : null}
        </div>
        {error && (
          <div className="mx-5 mb-3 px-3 py-2 rounded bg-red-900/40 border border-red-800/60 text-red-200 text-xs">
            {error}
          </div>
        )}
        <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-sm text-slate-300 hover:text-white px-3 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PincodeDetailsPage;
