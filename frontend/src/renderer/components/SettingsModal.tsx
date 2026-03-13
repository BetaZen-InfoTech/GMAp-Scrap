import React, { useState, useEffect } from 'react';
import type { AppSettings } from '../types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

// Timing setting definitions for the UI
const TIMING_FIELDS: { key: keyof AppSettings; label: string; hint: string; unit: string }[] = [
  { key: 'pageLoadTimeoutMs', label: 'Page Load Timeout', hint: 'Max wait for page navigation', unit: 'ms' },
  { key: 'pageSettleDelayMs', label: 'Page Settle Delay', hint: 'Wait after page loads before scraping', unit: 'ms' },
  { key: 'feedSelectorTimeoutMs', label: 'Feed Selector Timeout', hint: 'Max wait for feed/place to appear', unit: 'ms' },
  { key: 'scrollDelayMs', label: 'Scroll Delay', hint: 'Wait between scroll attempts', unit: 'ms' },
  { key: 'noNewScrollRetries', label: 'No-New-Results Retries', hint: 'Retry count when no new items found', unit: 'count' },
  { key: 'tabPageTimeoutMs', label: 'Tab Page Timeout', hint: 'Max wait for each place detail page (tabs mode)', unit: 'ms' },
  { key: 'clickWaitTimeoutMs', label: 'Click Wait Timeout', hint: 'Max wait for URL change after click (feed mode)', unit: 'ms' },
  { key: 'detailSettleDelayMs', label: 'Detail Settle Delay', hint: 'Buffer for detail panel fields to load', unit: 'ms' },
  { key: 'betweenClicksDelayMs', label: 'Between Clicks Delay', hint: 'Delay between processing each feed item', unit: 'ms' },
];

/** Validate all timing settings; returns array of error messages (empty = valid) */
function validateSettings(s: AppSettings): string[] {
  const errors: string[] = [];
  for (const { key, label, unit } of TIMING_FIELDS) {
    const val = s[key] as number;
    if (val === undefined || val === null || isNaN(val)) {
      errors.push(`${label} is required`);
    } else if (val < 0) {
      errors.push(`${label} must be >= 0`);
    } else if (unit === 'ms' && val < 100) {
      errors.push(`${label} must be at least 100 ms`);
    } else if (unit === 'count' && val < 1) {
      errors.push(`${label} must be at least 1`);
    }
  }
  if (!s.batchSize || s.batchSize < 1) errors.push('Batch Size must be at least 1');
  if (s.scrapingMode === 'tabs' && (!s.parallelTabs || s.parallelTabs < 1)) errors.push('Parallel Tabs must be at least 1');
  return errors;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      window.electronAPI.getSettings().then(setSettings);
      setValidationErrors([]);
    }
  }, [open]);

  if (!open || !settings) return null;

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
    setValidationErrors([]);
  };

  const handleSave = async () => {
    if (!settings) return;
    const errors = validateSettings(settings);
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setSaving(true);
    await window.electronAPI.saveSettings({ settings });
    setSaving(false);
    setSaved(true);
    setValidationErrors([]);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSelectFolder = async () => {
    const folder = await window.electronAPI.selectFolder();
    if (folder) update('outputFolder', folder);
  };

  const handleSelectBrave = async () => {
    const file = await window.electronAPI.selectFile();
    if (file) update('braveExecutablePath', file);
  };

  const handleSelectEdge = async () => {
    const file = await window.electronAPI.selectFile();
    if (file) update('edgeExecutablePath', file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Scraping */}
          <section>
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">Scraping</h3>
            <div className="space-y-4">
              {/* Scraping Mode toggle */}
              <div>
                <label className="block text-sm text-slate-300 mb-2">Scraping Mode</label>
                <div className="flex gap-3">
                  {(['tabs', 'feed'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => update('scrapingMode', mode)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        (settings.scrapingMode ?? 'tabs') === mode
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {mode === 'tabs' ? 'Open in New Tabs' : 'Click from Feed'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {(settings.scrapingMode ?? 'tabs') === 'tabs'
                    ? 'Scrolls feed to the end, collects all URLs, then opens them in parallel tabs.'
                    : 'Clicks each item from the feed list one by one (sequential).'}
                </p>
              </div>

              {/* Parallel Tabs — only shown in tabs mode */}
              {(settings.scrapingMode ?? 'tabs') === 'tabs' && (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Parallel Tabs</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={settings.parallelTabs ?? 5}
                      onChange={(e) => update('parallelTabs', Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 5)))}
                      className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-500">tabs open at once (1 – 100)</span>
                  </div>
                </div>
              )}

              {/* Batch Size */}
              <div>
                <label className="block text-sm text-slate-300 mb-1">Batch Size (records before API call)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={settings.batchSize}
                  onChange={(e) => update('batchSize', parseInt(e.target.value, 10) || 10)}
                  className="w-32 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Browser */}
          <section>
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">Browser</h3>
            <div className="space-y-3">
              {/* Headless toggle */}
              <div>
                <label className="block text-sm text-slate-300 mb-2">Window Mode</label>
                <div className="flex gap-3">
                  {([false, true] as const).map((val) => (
                    <button
                      key={String(val)}
                      onClick={() => update('headless', val)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        (settings.headless ?? false) === val
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {val ? 'Headless (No Window)' : 'Visible Window'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {(settings.headless ?? false) ? 'Browser runs in background with no visible window.' : 'Browser window is visible while scraping.'}
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Default Browser</label>
                <div className="flex gap-3">
                  {(['chromium', 'brave', 'edge'] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => update('browser', b)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        settings.browser === b
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {b === 'edge' ? 'Microsoft Edge' : b.charAt(0).toUpperCase() + b.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {settings.browser === 'brave' && (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Brave Executable Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.braveExecutablePath}
                      onChange={(e) => update('braveExecutablePath', e.target.value)}
                      placeholder="C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSelectBrave}
                      className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                    >Browse</button>
                  </div>
                </div>
              )}
              {settings.browser === 'edge' && (
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Microsoft Edge Executable Path</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.edgeExecutablePath ?? ''}
                      onChange={(e) => update('edgeExecutablePath', e.target.value)}
                      placeholder="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
                      className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSelectEdge}
                      className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                    >Browse</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Leave blank to use the default Edge installation path.</p>
                </div>
              )}
            </div>
          </section>

          {/* Timing */}
          <section>
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">Timing</h3>
            <p className="text-xs text-slate-500 mb-3">All time values are in milliseconds (ms). Retries is a count.</p>
            <div className="grid grid-cols-2 gap-3">
              {TIMING_FIELDS.map(({ key, label, hint, unit }) => (
                <div key={key}>
                  <label className="block text-sm text-slate-300 mb-1">{label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={unit === 'count' ? 1 : 100}
                      step={unit === 'count' ? 1 : 100}
                      value={(settings[key] as number) ?? 0}
                      onChange={(e) => update(key, parseInt(e.target.value, 10) || 0)}
                      className="w-28 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-slate-500">{unit}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Output */}
          <section>
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">Output</h3>
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                Extra Export Folder
                <span className="text-slate-500 text-xs ml-2">(Excel always saved to AppData. This copies it here too.)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.outputFolder}
                  onChange={(e) => update('outputFolder', e.target.value)}
                  placeholder="Optional extra copy folder…"
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSelectFolder}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                >Browse</button>
              </div>
            </div>
          </section>

          {/* Security */}
          <section>
            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-3">Security</h3>
            <div>
              <label className="block text-sm text-slate-300 mb-1">
                App Passcode
                <span className="text-slate-500 text-xs ml-2">(Required on every app launch. Leave empty to disable.)</span>
              </label>
              <input
                type="text"
                value={settings.passcode ?? ''}
                onChange={(e) => update('passcode', e.target.value)}
                placeholder="No passcode set"
                className="w-64 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              {settings.passcode ? (
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-flex items-center gap-1 text-xs text-green-400">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Passcode enabled
                  </span>
                  <button
                    onClick={() => update('passcode', '')}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-1">No passcode — app opens directly.</p>
              )}
            </div>
          </section>
        </div>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="mx-6 mb-2 p-3 bg-red-900/40 border border-red-700 rounded-lg">
            <p className="text-xs font-semibold text-red-400 mb-1">Please fix the following errors:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {validationErrors.map((err, i) => (
                <li key={i} className="text-xs text-red-300">{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
