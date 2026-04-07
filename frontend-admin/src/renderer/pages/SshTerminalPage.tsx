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

const SshTerminalPage: React.FC<SshTerminalPageProps> = ({ initialDeviceIds }) => {
  const { devices, fetchDevices } = useDeviceStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialDeviceIds || []));
  const [terminals, setTerminals] = useState<Map<string, TerminalState>>(new Map());
  const [broadcastCmd, setBroadcastCmd] = useState('');
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
        const newOutput = [...t.output, ...data.split('\n')].slice(-MAX_OUTPUT_LINES);
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
  const onlineDevices = devices.filter((d) => d.ip);

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

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Device Selector (left panel) */}
        <div className="w-56 shrink-0 bg-slate-900 border border-slate-800 rounded-xl p-3 overflow-y-auto">
          <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Devices</h3>
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
                  <div className="min-w-0 flex-1">
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
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={broadcastCmd}
                  onChange={(e) => setBroadcastCmd(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendBroadcast(); } }}
                  placeholder={`Send to all ${connectedCount} devices... (Ctrl+Enter to send)`}
                  rows={broadcastCmd.split('\n').length > 3 ? Math.min(broadcastCmd.split('\n').length, 10) : 1}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500 resize-y min-h-[36px]"
                />
              </div>
              <button onClick={sendBroadcast} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors shrink-0">
                Send All
              </button>
            </div>
          )}

          {/* Terminal panels */}
          <div className={`flex-1 min-h-0 overflow-y-auto grid gap-3 ${
            connectedCount <= 1 ? 'grid-cols-1' : connectedCount <= 4 ? 'grid-cols-2' : 'grid-cols-3'
          }`}>
            {[...selectedIds].map((deviceId) => {
              const device = getDevice(deviceId);
              const t = terminals.get(deviceId);
              if (!device) return null;

              return (
                <div key={deviceId} className="bg-slate-950 border border-slate-800 rounded-xl flex flex-col min-h-[200px]">
                  {/* Terminal header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        t?.status === 'connected' ? 'bg-green-400' : t?.status === 'connecting' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
                      }`} />
                      <span className="text-xs text-white font-medium">{device.nickname || device.ip}</span>
                      <span className="text-[10px] text-slate-500">{device.ip}</span>
                    </div>
                    <div className="flex gap-1">
                      {(!t || t.status === 'disconnected') && (
                        <button onClick={() => connectDevice(deviceId)} className="text-[10px] bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-0.5 rounded">Connect</button>
                      )}
                      {t?.status === 'connected' && (
                        <button onClick={() => disconnectDevice(deviceId)} className="text-[10px] bg-red-700 hover:bg-red-600 text-white px-2 py-0.5 rounded">Disconnect</button>
                      )}
                    </div>
                  </div>

                  {/* Terminal output */}
                  <pre
                    ref={(el) => { if (el) outputRefs.current.set(deviceId, el); }}
                    className="flex-1 overflow-y-auto p-3 text-xs text-green-400 font-mono whitespace-pre-wrap break-all bg-black/40"
                  >
                    {t?.output.join('\n') || (t?.status === 'connecting' ? 'Connecting...' : 'Not connected')}
                    {t?.error && <span className="text-red-400">{'\n'}Error: {t.error}</span>}
                  </pre>

                  {/* Per-device command input (individual mode) */}
                  {mode === 'individual' && t?.status === 'connected' && (
                    <div className="flex gap-1.5 px-2 py-2 border-t border-slate-800 shrink-0 items-end">
                      <textarea
                        value={perDeviceCmd.get(deviceId) || ''}
                        onChange={(e) => setPerDeviceCmd((prev) => { const n = new Map(prev); n.set(deviceId, e.target.value); return n; })}
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendToDevice(deviceId); } }}
                        placeholder="Command... (Ctrl+Enter to send)"
                        rows={1}
                        className="flex-1 bg-black/40 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500 resize-y min-h-[28px]"
                      />
                      <button onClick={() => sendToDevice(deviceId)} className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded shrink-0">Send</button>
                    </div>
                  )}
                </div>
              );
            })}

            {selectedIds.size === 0 && (
              <div className="col-span-full flex items-center justify-center h-full">
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
