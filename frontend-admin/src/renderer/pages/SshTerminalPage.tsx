import React, { useEffect, useRef, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import type { DeviceInfo } from '../../shared/types';

interface TerminalState {
  status: 'disconnected' | 'connecting' | 'connected';
  output: string[];
  error?: string;
}

interface SshTerminalPageProps {
  initialDeviceIds?: string[];
}

const MAX_OUTPUT_LINES = 3000;

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1b\][^\x07]*\x07/g, '')
            .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '')
            .replace(/\r/g, '');
}

const SshTerminalPage: React.FC<SshTerminalPageProps> = ({ initialDeviceIds }) => {
  const { devices, fetchDevices } = useDeviceStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialDeviceIds || []));
  const [terminals, setTerminals] = useState<Map<string, TerminalState>>(new Map());
  const [broadcastCmd, setBroadcastCmd] = useState('');
  const [focusedDeviceId, setFocusedDeviceId] = useState<string | null>(null);
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [perDeviceCmd, setPerDeviceCmd] = useState<Map<string, string>>(new Map());
  const [mode, setMode] = useState<'broadcast' | 'individual'>('broadcast');
  const outputRefs = useRef<Map<string, HTMLPreElement>>(new Map());

  useEffect(() => {
    fetchDevices(true);
  }, []);

  // Listen for SSH events
  useEffect(() => {
    const removeOutput = window.electronAPI.onSshOutput((deviceId, data) => {
      setTerminals((prev) => {
        const next = new Map(prev);
        const t = next.get(deviceId) || { status: 'connected', output: [] };
        const newOutput = [...t.output, ...stripAnsi(data).split('\n')].slice(-MAX_OUTPUT_LINES);
        next.set(deviceId, { ...t, output: newOutput });
        return next;
      });
      // Auto-scroll
      setTimeout(() => {
        const el = outputRefs.current.get(deviceId);
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    });

    const removeError = window.electronAPI.onSshError((deviceId, error) => {
      setTerminals((prev) => {
        const next = new Map(prev);
        const t = next.get(deviceId) || { status: 'disconnected', output: [] };
        next.set(deviceId, { ...t, error, status: 'disconnected' });
        return next;
      });
    });

    const removeStatus = window.electronAPI.onSshStatus((deviceId, status) => {
      setTerminals((prev) => {
        const next = new Map(prev);
        const t = next.get(deviceId) || { status: 'disconnected', output: [] };
        next.set(deviceId, { ...t, status: status as TerminalState['status'] });
        return next;
      });
    });

    return () => { removeOutput(); removeError(); removeStatus(); };
  }, []);

  const getDevice = (id: string): DeviceInfo | undefined => devices.find((d) => d.deviceId === id);

  const connectDevice = async (deviceId: string) => {
    // Refresh devices to get latest password before connecting
    await fetchDevices(true);
    const device = useDeviceStore.getState().devices.find((d) => d.deviceId === deviceId);
    if (!device?.ip) return;

    const pw = device.vpsPassword || '';

    setTerminals((prev) => {
      const next = new Map(prev);
      next.set(deviceId, { status: 'connecting', output: [`Connecting to ${device.ip} as ${device.username || 'root'} (pw: ${pw ? 'set' : 'EMPTY'})...`] });
      return next;
    });

    const result = await window.electronAPI.sshConnect(
      deviceId,
      device.ip,
      22,
      device.username || 'root',
      pw,
    );

    if (!result.success) {
      setTerminals((prev) => {
        const next = new Map(prev);
        next.set(deviceId, { status: 'disconnected', output: [`Failed: ${result.error}`], error: result.error });
        return next;
      });
    }
  };

  const disconnectDevice = async (deviceId: string) => {
    await window.electronAPI.sshDisconnect(deviceId);
    setTerminals((prev) => {
      const next = new Map(prev);
      next.delete(deviceId);
      return next;
    });
  };

  const connectAll = async () => {
    for (const id of selectedIds) {
      const t = terminals.get(id);
      if (!t || t.status === 'disconnected') {
        await connectDevice(id);
      }
    }
  };

  const disconnectAll = async () => {
    await window.electronAPI.sshDisconnect();
    setTerminals(new Map());
  };

  const sendBroadcast = () => {
    if (!broadcastCmd.trim()) return;
    // Send each line as a separate command
    const lines = broadcastCmd.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      window.electronAPI.sshCommandAll(line);
    }
    setBroadcastCmd('');
  };

  const sendToDevice = (deviceId: string) => {
    const cmd = perDeviceCmd.get(deviceId) || '';
    if (!cmd.trim()) return;
    // Send each line as a separate command
    const lines = cmd.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      window.electronAPI.sshCommand(deviceId, line);
    }
    setPerDeviceCmd((prev) => { const n = new Map(prev); n.set(deviceId, ''); return n; });
  };

  const toggleDevice = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const connectedCount = [...terminals.values()].filter((t) => t.status === 'connected').length;
  const onlineDevices = devices.filter((d) => d.ip && !d.isArchived);

  // ── Quick Actions ──
  const [showActions, setShowActions] = useState(false);

  const quickActions = [
    {
      label: 'Install Node.js',
      icon: '1',
      color: 'bg-green-700 hover:bg-green-600',
      cmd: 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && source ~/.bashrc && nvm install 22 && nvm use 22 && nvm alias default 22 && node -v',
    },
    {
      label: 'Clone Repo',
      icon: '2',
      color: 'bg-blue-700 hover:bg-blue-600',
      cmd: 'cd ~ && git clone https://github.com/BetaZen-InfoTech/GMAp-Scrap.git 2>/dev/null; cd ~/GMAp-Scrap && git pull',
    },
    {
      label: 'Install Dependencies',
      icon: '3',
      color: 'bg-indigo-700 hover:bg-indigo-600',
      cmd: 'cd ~/GMAp-Scrap/frontend-nodejs && npm install',
    },
    {
      label: 'Install Chromium',
      icon: '4',
      color: 'bg-violet-700 hover:bg-violet-600',
      cmd: 'cd ~/GMAp-Scrap/frontend-nodejs && npx playwright install chromium && npx playwright install-deps chromium',
    },
    {
      label: 'Set .env (prod)',
      icon: '5',
      color: 'bg-amber-700 hover:bg-amber-600',
      cmd: `cd ~/GMAp-Scrap/frontend-nodejs && cat > .env << 'ENVEOF'\nAPP_STATE=prod\nLOCAL_API_URL=http://127.0.0.1:5000\nDEV_API_URL=http://127.0.0.1:5000\nPROD_API_URL=https://gmap-scrap-backend-api.betazeninfotech.com\nHEADLESS=true\nENVEOF`,
    },
    {
      label: 'Install PM2',
      icon: '6',
      color: 'bg-teal-700 hover:bg-teal-600',
      cmd: 'npm install -g pm2',
    },
  ];

  const runActionAll = (cmd: string) => {
    window.electronAPI.sshCommandAll(cmd);
  };

  const runFullSetup = () => {
    for (let i = 0; i < quickActions.length; i++) {
      setTimeout(() => {
        window.electronAPI.sshCommandAll(quickActions[i].cmd);
      }, i * 2000);
    }
  };

  const gitPullAll = () => {
    window.electronAPI.sshCommandAll('cd ~/GMAp-Scrap && git pull && cd frontend-nodejs && npm install');
  };

  // Build the list of effective scrape tasks for a device (handles legacy scrapePincode)
  const getTasks = (device: { scrapeTasks?: Array<{ type: string; startPin: string; endPin?: string; jobs?: number }>; scrapePincode?: string; scrapeJobs?: number }) => {
    if (device.scrapeTasks && device.scrapeTasks.length > 0) return device.scrapeTasks;
    if (device.scrapePincode) {
      return [{ type: 'jobs' as const, startPin: device.scrapePincode, endPin: '', jobs: device.scrapeJobs || 3 }];
    }
    return [];
  };

  // Build the full pm2 start command string for a device's tasks (all run in parallel)
  const buildStartCommand = (tasks: ReturnType<typeof getTasks>, nickname: string) => {
    const parts: string[] = [];
    tasks.forEach((task, idx) => {
      const name = `scraper-${idx + 1}`;
      let thirdArg = '';
      if (task.type === 'range' && task.endPin) thirdArg = task.endPin;
      else if (task.type === 'single') thirdArg = task.startPin; // same pin for single
      else thirdArg = String(task.jobs || 3); // jobs mode
      parts.push(`pm2 start npm --name "${name}" -- start -- "${nickname}" ${task.startPin} ${thirdArg}`);
    });
    return parts.join(' && ');
  };

  const restartScraperForDevice = (deviceId: string) => {
    const device = useDeviceStore.getState().devices.find((d) => d.deviceId === deviceId);
    if (!device) return;
    const tasks = getTasks(device);
    if (tasks.length === 0) return;
    const nickname = device.nickname || device.ip || 'VPS';
    const startCmd = buildStartCommand(tasks, nickname);
    window.electronAPI.sshCommand(deviceId, `pm2 delete all 2>/dev/null; cd ~/GMAp-Scrap/frontend-nodejs && ${startCmd}`);
  };

  const restartScraperAll = async () => {
    await fetchDevices(true);
    const devs = useDeviceStore.getState().devices;
    for (const deviceId of selectedIds) {
      const device = devs.find((d) => d.deviceId === deviceId);
      const t = terminals.get(deviceId);
      if (!device) continue;
      const tasks = getTasks(device);
      if (tasks.length === 0 || t?.status !== 'connected') continue;
      const nickname = device.nickname || device.ip || 'VPS';
      const startCmd = buildStartCommand(tasks, nickname);
      window.electronAPI.sshCommand(deviceId, `pm2 delete all 2>/dev/null; cd ~/GMAp-Scrap/frontend-nodejs && ${startCmd}`);
    }
  };

  const stopScraperAll = () => {
    window.electronAPI.sshCommandAll('pm2 delete all');
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">SSH Terminal</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {connectedCount} connected · {selectedIds.size} selected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={connectAll} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
            Connect Selected
          </button>
          <button onClick={disconnectAll} className="text-xs bg-red-700 hover:bg-red-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
            Disconnect All
          </button>
          {connectedCount > 0 && (
            <>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => setShowActions(!showActions)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${showActions ? 'bg-blue-600 text-white' : 'bg-blue-700 hover:bg-blue-600 text-white'}`}
              >
                VPS Setup
              </button>
              <button onClick={gitPullAll} className="text-xs bg-cyan-700 hover:bg-cyan-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                Git Pull
              </button>
              <button onClick={restartScraperAll} className="text-xs bg-purple-700 hover:bg-purple-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                Restart Scraper
              </button>
              <button onClick={stopScraperAll} className="text-xs bg-orange-700 hover:bg-orange-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                Stop All
              </button>
              <span className="text-slate-700">|</span>
              <button onClick={() => window.electronAPI.sshCommandAll('pm2 status')} className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium px-3 py-1.5 rounded-lg transition-colors">
                PM2 Status
              </button>
              <button onClick={() => window.electronAPI.sshCommandAll('pm2 logs --nostream --lines 20')} className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium px-3 py-1.5 rounded-lg transition-colors">
                PM2 Logs
              </button>
            </>
          )}
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {(['broadcast', 'individual'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`text-xs px-3 py-1 rounded-md transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                {m === 'broadcast' ? 'Broadcast' : 'Individual'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* VPS Setup Panel */}
      {showActions && connectedCount > 0 && (
        <div className="bg-slate-900 border border-blue-800/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wider">VPS Setup — Run on all {connectedCount} devices</h3>
            <button onClick={runFullSetup} className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white font-medium px-3 py-1 rounded transition-colors">
              Run Full Setup (1-6)
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => runActionAll(action.cmd)}
                className={`${action.color} text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors text-left`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{action.icon}</span>
                  <span>{action.label}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={restartScraperAll}
              className="text-xs bg-purple-700 hover:bg-purple-600 text-white font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">7</span>
              Start Scraper (uses saved pincode per device)
            </button>
            <span className="text-[10px] text-slate-500">Devices without a saved pincode will be skipped</span>
          </div>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Device Selector (left panel) */}
        <div className="w-56 shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-3 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Devices</h3>
            <button
              onClick={() => {
                if (selectedIds.size === onlineDevices.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(onlineDevices.map((d) => d.deviceId)));
              }}
              className="text-[10px] text-slate-400 hover:text-white transition-colors"
            >
              {selectedIds.size === onlineDevices.length ? 'None' : 'All'}
            </button>
          </div>
          <div className="space-y-1">
            {onlineDevices.map((d) => {
              const t = terminals.get(d.deviceId);
              const isConnected = t?.status === 'connected';
              return (
                <label
                  key={d.deviceId}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    selectedIds.has(d.deviceId) ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(d.deviceId)}
                    onChange={() => toggleDevice(d.deviceId)}
                    className="accent-blue-500 shrink-0"
                  />
                  <div className="min-w-0 flex-1" onClick={(e) => {
                    e.preventDefault();
                    setFocusedDeviceId(d.deviceId);
                    terminalRefs.current.get(d.deviceId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => setFocusedDeviceId(null), 2000);
                  }}>
                    <p className="text-xs text-white truncate">{d.nickname || d.ip}</p>
                    <p className="text-[10px] text-slate-500 truncate">{d.ip}</p>
                  </div>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    isConnected ? 'bg-green-400' : t?.status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-slate-600'
                  }`} />
                </label>
              );
            })}
          </div>
        </div>

        {/* Terminal Area (right panel) */}
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          {/* Broadcast command bar */}
          {mode === 'broadcast' && connectedCount > 0 && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
              <span className="text-xs text-blue-400 font-semibold shrink-0">ALL ({connectedCount})</span>
              <span className="text-slate-600">|</span>
              <input
                type="text"
                value={broadcastCmd}
                onChange={(e) => setBroadcastCmd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendBroadcast(); } }}
                placeholder="Type command and press Enter to send to all devices..."
                className="flex-1 bg-transparent text-sm text-white font-mono focus:outline-none placeholder:text-slate-600"
              />
              <button onClick={sendBroadcast} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-medium px-3 py-1 rounded transition-colors shrink-0">
                Send All
              </button>
            </div>
          )}

          {/* Terminal panels */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
            {[...selectedIds].map((deviceId) => {
              const device = getDevice(deviceId);
              const t = terminals.get(deviceId);
              if (!device) return null;

              const isConnected = t?.status === 'connected';
              const isError = t?.status === 'disconnected' && t?.error;

              return (
                <div
                  key={deviceId}
                  ref={(el) => { if (el) terminalRefs.current.set(deviceId, el); }}
                  className={`border rounded-xl flex flex-col shrink-0 transition-all duration-500 ${
                    focusedDeviceId === deviceId
                      ? 'border-blue-400 ring-2 ring-blue-400/40 bg-slate-900'
                      : isConnected ? 'border-emerald-800/60 bg-slate-950' : isError ? 'border-red-800/40 bg-slate-950' : 'border-slate-800 bg-slate-950'
                  }`}
                  style={{ height: isConnected ? '320px' : '80px' }}
                >
                  {/* Terminal header */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/60 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        isConnected ? 'bg-green-400' : t?.status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
                      }`} />
                      <span className="text-xs text-white font-semibold">{device.nickname || device.ip}</span>
                      <span className="text-[10px] text-slate-500">{device.ip}</span>
                      {(() => {
                        const tasks = getTasks(device);
                        if (tasks.length === 0) return null;
                        return (
                          <span className="text-[10px] bg-cyan-900/50 text-cyan-400 px-1.5 py-0.5 rounded" title={tasks.map((t) => `${t.type}: ${t.startPin}${t.type === 'range' ? `→${t.endPin}` : t.type === 'jobs' ? `×${t.jobs}j` : ''}`).join(' · ')}>
                            {tasks.length} task{tasks.length > 1 ? 's' : ''}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {(!t || t.status === 'disconnected') && (
                        <button onClick={() => connectDevice(deviceId)} className="text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1 rounded transition-colors">Connect</button>
                      )}
                      {t?.status === 'connecting' && (
                        <span className="text-[10px] text-yellow-400 px-2 py-1">Connecting...</span>
                      )}
                      {isConnected && (
                        <>
                          {getTasks(device).length > 0 && (
                            <button onClick={() => restartScraperForDevice(deviceId)} className="text-[10px] bg-purple-700 hover:bg-purple-600 text-white px-2.5 py-1 rounded transition-colors">Restart</button>
                          )}
                          <button onClick={() => disconnectDevice(deviceId)} className="text-[10px] bg-red-700/80 hover:bg-red-600 text-white px-2.5 py-1 rounded transition-colors">Disconnect</button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Error display (compact when not connected) */}
                  {isError && !isConnected && (
                    <div className="px-3 py-2 text-xs text-red-400 font-mono">{t.error}</div>
                  )}

                  {/* Terminal output */}
                  {(isConnected || t?.status === 'connecting') && (
                    <pre
                      ref={(el) => { if (el) outputRefs.current.set(deviceId, el); }}
                      className="flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-relaxed text-green-400 font-mono whitespace-pre-wrap break-all bg-black/30"
                    >
                      {t?.output.join('\n') || 'Connecting...'}
                    </pre>
                  )}

                  {/* Command input — always visible when connected */}
                  {isConnected && (
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-slate-800/60 shrink-0 bg-black/20">
                      <span className="text-[10px] text-emerald-500 font-mono shrink-0">$</span>
                      <input
                        type="text"
                        value={perDeviceCmd.get(deviceId) || ''}
                        onChange={(e) => setPerDeviceCmd((prev) => { const n = new Map(prev); n.set(deviceId, e.target.value); return n; })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); sendToDevice(deviceId); }
                          else if (e.key === 'ArrowUp') { e.preventDefault(); window.electronAPI.sshCommand(deviceId, '\x1b[A', true); }
                          else if (e.key === 'ArrowDown') { e.preventDefault(); window.electronAPI.sshCommand(deviceId, '\x1b[B', true); }
                          else if (e.key === 'Tab') { e.preventDefault(); window.electronAPI.sshCommand(deviceId, '\t', true); }
                          else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); window.electronAPI.sshCommand(deviceId, '\x03', true); }
                        }}
                        placeholder="Type command and press Enter..."
                        className="flex-1 bg-transparent text-xs text-white font-mono focus:outline-none placeholder:text-slate-600"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {selectedIds.size === 0 && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-slate-500">Select devices from the left panel to connect</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SshTerminalPage;
