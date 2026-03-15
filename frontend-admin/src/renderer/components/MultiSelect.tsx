import React, { useState, useRef, useEffect, useCallback } from 'react';

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  maxDisplayed?: number;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  selected,
  onChange,
  placeholder = 'Select...',
  maxDisplayed = 2,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search when opened
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const filtered = search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = useCallback(
    (val: string) => {
      const next = selected.includes(val)
        ? selected.filter((s) => s !== val)
        : [...selected, val];
      onChange(next);
    },
    [selected, onChange],
  );

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  // Display text
  let displayContent: React.ReactNode;
  if (selected.length === 0) {
    displayContent = <span className="text-slate-500">{placeholder}</span>;
  } else if (selected.length <= maxDisplayed) {
    displayContent = (
      <span className="text-white truncate">
        {selected.join(', ')}
      </span>
    );
  } else {
    displayContent = (
      <span className="text-white truncate">
        {selected.slice(0, maxDisplayed).join(', ')}
        <span className="text-blue-400 ml-1">+{selected.length - maxDisplayed}</span>
      </span>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:border-blue-500 min-w-[160px] max-w-[200px] transition-colors hover:border-slate-700"
      >
        <span className="flex-1 truncate">{displayContent}</span>
        {selected.length > 0 && (
          <span
            onClick={clearAll}
            className="shrink-0 text-slate-500 hover:text-red-400 transition-colors"
            title="Clear"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-800">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-500 text-center">No matches</div>
            ) : (
              filtered.map((opt) => {
                const isChecked = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${
                      isChecked
                        ? 'bg-blue-900/30 text-blue-300'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        isChecked
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-slate-600 bg-slate-800'
                      }`}
                    >
                      {isChecked && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{opt}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer: selected count + clear */}
          {selected.length > 0 && (
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-slate-800 bg-slate-900/80">
              <span className="text-[10px] text-slate-500">{selected.length} selected</span>
              <button
                type="button"
                onClick={() => { onChange([]); setSearch(''); }}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
