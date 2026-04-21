import React, { useState } from 'react';
import type { DeviceInfo, ScrapeTask } from '../../shared/types';

function barColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface DeviceCardProps {
  device: DeviceInfo;
  onClick: (deviceId: string) => void;
  onArchive?: (deviceId: string) => void;
  onSavePassword?: (deviceId: string, password: string) => void;
  onSaveScrapeConfig?: (deviceId: string, pincode: string, jobs: number) => void;
  onSaveScrapeTasks?: (deviceId: string, tasks: ScrapeTask[]) => Promise<void> | void;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (deviceId: string) => void;
}

const DeviceCard: React.FC<DeviceCardProps> = ({ device, onClick, onArchive, onSavePassword, onSaveScrapeTasks, selectable, selected, onSelect }) => {
  const stats = device.latestStats;
  const [showPw, setShowPw] = useState(false);
  const [editPw, setEditPw] = useState(false);
  const [pwValue, setPwValue] = useState(device.vpsPassword || '');
  // Build initial tasks from scrapeTasks array OR fallback to legacy scrapePincode/scrapeJobs
  // Preserve the `progress` field from backend
  const initialTasks: ScrapeTask[] = (device.scrapeTasks && device.scrapeTasks.length > 0)
    ? device.scrapeTasks.map((t) => ({ type: t.type, startPin: t.startPin || '', endPin: t.endPin || '', jobs: t.jobs || 3, progress: t.progress }))
    : (device.scrapePincode
        ? [{ type: 'jobs' as const, startPin: device.scrapePincode, endPin: '', jobs: device.scrapeJobs || 3 }]
        : []);

  const [editScrape, setEditScrape] = useState(false);
  const [taskList, setTaskList] = useState<ScrapeTask[]>(initialTasks);

  const handleSavePw = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSavePassword?.(device.deviceId, pwValue.trim());
    setEditPw(false);
  };

  const isRedFlag = device.status === 'online' && device.recent && (
    device.recent.records.total < 3000 || device.recent.sessions.total < 100
  );

  return (
    <div className={`bg-slate-900 border rounded-xl p-5 text-left transition-colors w-full ${
      isRedFlag ? 'border-red-500/60 ring-1 ring-red-500/20' : device.isArchived ? 'border-slate-700 opacity-60' : selected ? 'border-blue-500 ring-1 ring-blue-500/40' : 'border-slate-800 hover:border-slate-600'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-2 min-w-0">
          {selectable && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect?.(device.deviceId)}
              className="mt-1 shrink-0 accent-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <button onClick={() => onClick(device.deviceId)} className="text-left min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">
              {device.nickname || device.ip || device.hostname}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {device.ip ? device.ip + ' · ' : ''}{device.hostname} · {device.username}
            </p>
          </button>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isRedFlag && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-semibold" title={`Records: ${device.recent?.records.total ?? 0} (<3000) | Sessions: ${device.recent?.sessions.total ?? 0} (<100)`}>Low Activity</span>
          )}
          {device.isArchived && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">Archived</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            device.status === 'online'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-red-500/20 text-red-400'
          }`}>
            {device.status === 'online' ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Specs */}
      <button onClick={() => onClick(device.deviceId)} className="w-full text-left">
        <div className="text-xs text-slate-400 mb-3 space-y-0.5">
          <p>{device.cpuModel} ({device.cpuCores} cores)</p>
          <p>{device.totalMemoryGB} GB RAM · {device.arch}</p>
        </div>

        {/* Live Stats */}
        {stats ? (
          <div className="space-y-2 mb-3">
            {[
              { label: 'CPU', value: stats.cpuUsedPercent ?? 0 },
              { label: 'RAM', value: stats.ramUsedPercent },
              { label: 'Disk', value: stats.diskUsedPercent },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-0.5">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-slate-300">{value}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-600 mb-3">No live stats</p>
        )}

        {/* 60-min Analytics */}
        {device.recent && (device.recent.records.total > 0 || device.recent.sessions.total > 0) && (
          <div className="mb-3 bg-slate-800/50 rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Last 60 min</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] text-slate-500">Records</p>
                <p className="text-sm font-bold text-blue-400">{(device.recent.records.total).toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">~{device.recent.records.avg10min}/10min</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-500">Sessions</p>
                <p className="text-sm font-bold text-emerald-400">{device.recent.sessions.total.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">~{device.recent.sessions.avg10min}/10min</p>
              </div>
            </div>
            {/* Mini bar chart — 6 buckets of 10 min each */}
            <div className="flex items-end gap-px h-6">
              {device.recent.records.buckets.slice().reverse().map((count, i) => {
                const max = Math.max(...device.recent.records.buckets, 1);
                const h = Math.max((count / max) * 100, 4);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full bg-blue-500/60 rounded-sm" style={{ height: `${h}%` }} title={`${count} records`} />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[8px] text-slate-600">
              <span>60m ago</span>
              <span>now</span>
            </div>
          </div>
        )}
      </button>

      {/* VPS Password */}
      <div className="mb-3" onClick={(e) => e.stopPropagation()}>
        {editPw ? (
          <div className="flex gap-1.5">
            <input
              type="text"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              placeholder="VPS password..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button onClick={handleSavePw} className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">Save</button>
            <button onClick={() => { setEditPw(false); setPwValue(device.vpsPassword || ''); }} className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded">X</button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">PW:</span>
            {device.vpsPassword ? (
              <>
                <span className="text-slate-300 font-mono">{showPw ? device.vpsPassword : '••••••'}</span>
                <button onClick={() => setShowPw(!showPw)} className="text-slate-500 hover:text-white" title={showPw ? 'Hide' : 'Show'}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {showPw
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                      : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                  </svg>
                </button>
              </>
            ) : (
              <span className="text-slate-600">not set</span>
            )}
            <button onClick={() => { setEditPw(true); setPwValue(device.vpsPassword || ''); }} className="text-slate-500 hover:text-white ml-auto" title="Edit password">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Scrape Tasks */}
      <div className="mb-3" onClick={(e) => e.stopPropagation()}>
        {editScrape ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Scrape Tasks</span>
              <button
                onClick={() => setTaskList([...taskList, { type: 'jobs', startPin: '', endPin: '', jobs: 3 }])}
                className="text-[10px] bg-cyan-700 hover:bg-cyan-600 text-white px-2 py-0.5 rounded"
              >+ Add</button>
            </div>
            {taskList.map((t, idx) => (
              <div key={idx} className="flex gap-1 items-center">
                <select
                  value={t.type}
                  onChange={(e) => setTaskList(taskList.map((x, i) => i === idx ? { ...x, type: e.target.value as ScrapeTask['type'] } : x))}
                  className="bg-slate-800 border border-slate-700 rounded px-1 py-1 text-[10px] text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="jobs">Jobs</option>
                  <option value="range">Range</option>
                  <option value="single">Single</option>
                </select>
                <input
                  type="text"
                  value={t.startPin}
                  onChange={(e) => setTaskList(taskList.map((x, i) => i === idx ? { ...x, startPin: e.target.value } : x))}
                  placeholder="Start"
                  className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500"
                />
                {t.type === 'range' && (
                  <input
                    type="text"
                    value={t.endPin || ''}
                    onChange={(e) => setTaskList(taskList.map((x, i) => i === idx ? { ...x, endPin: e.target.value } : x))}
                    placeholder="End"
                    className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                )}
                {t.type === 'jobs' && (
                  <input
                    type="text"
                    value={String(t.jobs || 3)}
                    onChange={(e) => setTaskList(taskList.map((x, i) => i === idx ? { ...x, jobs: Number(e.target.value) || 3 } : x))}
                    placeholder="Jobs"
                    className="w-10 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                )}
                <button
                  onClick={() => setTaskList(taskList.filter((_, i) => i !== idx))}
                  className="text-[10px] bg-red-800/50 hover:bg-red-700 text-red-300 px-1.5 py-1 rounded"
                >X</button>
              </div>
            ))}
            <div className="flex gap-1.5">
              <button
                onClick={async () => {
                  const cleaned = taskList
                    .map((t) => ({
                      type: t.type,
                      startPin: t.startPin.trim(),
                      endPin: t.type === 'range' ? (t.endPin || '').trim() : '',
                      jobs: t.type === 'jobs' ? (t.jobs || 3) : 0,
                    }))
                    .filter((t) => t.startPin);
                  try {
                    await onSaveScrapeTasks?.(device.deviceId, cleaned);
                    setEditScrape(false);
                  } catch (err) {
                    console.error('[DeviceCard] Save tasks failed:', err);
                  }
                }}
                className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded"
              >Save</button>
              <button
                onClick={() => { setEditScrape(false); setTaskList(initialTasks); }}
                className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
              >Cancel</button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Tasks ({initialTasks.length})</span>
              <button onClick={() => setEditScrape(true)} className="text-slate-500 hover:text-white" title="Edit tasks">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
            {initialTasks.length === 0 ? (
              <span className="text-[10px] text-slate-600">No tasks set</span>
            ) : (
              <div className="space-y-1">
                {initialTasks.map((t, idx) => {
                  const prog = t.progress;
                  const isComplete = prog?.status === 'completed';
                  const isStopped = prog?.status === 'stopped' || prog?.status === 'stop';
                  const isRunning = prog?.status === 'running';
                  return (
                    <div key={idx} className={`rounded px-1.5 py-1 ${
                      isComplete ? 'bg-emerald-900/20 border border-emerald-700/40' :
                      isStopped ? 'bg-red-900/20 border border-red-700/40' :
                      'bg-slate-800/40'
                    }`}>
                      <div className="text-[10px] font-mono flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-500">{idx + 1}.</span>
                        <span className={`px-1 py-px rounded text-[9px] ${
                          t.type === 'range' ? 'bg-purple-900/40 text-purple-300' :
                          t.type === 'single' ? 'bg-orange-900/40 text-orange-300' :
                          'bg-blue-900/40 text-blue-300'
                        }`}>{t.type}</span>
                        <span className="text-cyan-400">{t.startPin}</span>
                        {t.type === 'range' && <span className="text-slate-500">→ <span className="text-cyan-400">{t.endPin}</span></span>}
                        {t.type === 'jobs' && <span className="text-slate-500">× {t.jobs}j</span>}
                        {isComplete && (
                          <span className="ml-auto flex items-center gap-1 text-[9px] text-emerald-400 font-semibold" title={prog.completedAt ? `Completed ${new Date(prog.completedAt).toLocaleString('en-IN')}` : 'Completed'}>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            Completed
                          </span>
                        )}
                        {isStopped && (
                          <span className="ml-auto text-[9px] text-red-400 font-semibold">Stopped</span>
                        )}
                        {isRunning && prog && (
                          <span className="ml-auto text-[9px] text-blue-400 font-semibold">
                            {prog.percent}% · {prog.completedSearches.toLocaleString()}/{prog.totalSearches.toLocaleString()}
                          </span>
                        )}
                      </div>
                      {isRunning && prog && (
                        <div className="mt-1 h-0.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${prog.percent}%` }} />
                        </div>
                      )}
                      {isComplete && prog?.completedAt && (
                        <div className="text-[9px] text-emerald-400/70 mt-0.5 font-mono">
                          ✓ Finished {new Date(prog.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                        </div>
                      )}

                      {/* Per-chunk job details for 'jobs' type tasks */}
                      {t.type === 'jobs' && prog?.jobs && prog.jobs.length > 0 && (
                        <div className="mt-1.5 pl-2 border-l-2 border-slate-700/60 space-y-1">
                          <div className="text-[9px] text-slate-500 uppercase font-semibold tracking-wider">Sub-Jobs ({prog.jobs.length})</div>
                          {prog.jobs.map((job, jIdx) => {
                            const jComplete = job.status === 'completed';
                            const jStopped = job.status === 'stopped' || job.status === 'stop';
                            const jRunning = job.status === 'running';
                            const statusColor = jComplete ? 'bg-emerald-900/60 text-emerald-400' :
                              jStopped ? 'bg-red-900/60 text-red-400' :
                              jRunning ? 'bg-blue-900/60 text-blue-400' :
                              'bg-slate-800 text-slate-400';
                            return (
                              <div key={job.jobId} className="bg-slate-900/60 rounded px-1.5 py-1 text-[9px] font-mono space-y-0.5">
                                {/* Row 1: index, range, status */}
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-slate-500">#{jIdx + 1}</span>
                                  <span className="text-slate-500">Range:</span>
                                  <span className="text-cyan-400">{job.startPincode}</span>
                                  <span className="text-slate-600">→</span>
                                  <span className="text-cyan-400">{job.endPincode}</span>
                                  <span className="text-slate-500">({job.totalPincodes} pins)</span>
                                  <span className={`ml-auto px-1 py-px rounded text-[8px] font-semibold ${statusColor}`}>
                                    {jComplete ? '✓ Completed' : jStopped ? '■ Stopped' : jRunning ? `${job.percent}%` : job.status}
                                  </span>
                                </div>
                                {/* Row 2: current pincode + progress */}
                                <div className="flex items-center gap-1.5 flex-wrap text-slate-500">
                                  <span>Current:</span>
                                  <span className="text-yellow-300">{job.currentPincode}</span>
                                  <span>({job.currentPincodeIndex}/{job.totalPincodes})</span>
                                  <span className="ml-auto text-slate-400">
                                    {job.completedSearches.toLocaleString()}/{job.totalSearches.toLocaleString()} searches
                                  </span>
                                </div>
                                {/* Progress bar */}
                                <div className="h-0.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div className={`h-full ${jComplete ? 'bg-emerald-500' : jStopped ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${job.percent}%` }} />
                                </div>
                                {jComplete && job.completedAt && (
                                  <div className="text-[8px] text-emerald-400/70">
                                    ✓ Done {new Date(job.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Archive time */}
      {device.isArchived && device.archivedAt && (
        <div className="text-[10px] text-purple-400/70 mb-2">
          Archived {new Date(device.archivedAt).toLocaleDateString()} {new Date(device.archivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{device.activeJobs ?? 0} jobs · {device.totalSessions ?? 0} sessions</span>
        <div className="flex items-center gap-2">
          <span title={`Added: ${new Date(device.createdAt).toLocaleString('en-IN')}`}>
            {new Date(device.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })} · {timeAgo(device.lastSeenAt)}
          </span>
          {device.status !== 'online' && onArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(device.deviceId); }}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                device.isArchived
                  ? 'bg-blue-900/40 text-blue-400 hover:bg-blue-800/40'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
              title={device.isArchived ? 'Unarchive' : 'Archive'}
            >
              {device.isArchived ? 'Unarchive' : 'Archive'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeviceCard;
