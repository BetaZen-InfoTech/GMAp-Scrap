import os from 'os';
import { exec } from 'child_process';
import { DeviceStats } from '../shared/types';

/** Previous network totals for computing deltas */
let prevNetSent = 0;
let prevNetRecv = 0;
let initialized = false;

/**
 * Get RAM stats from Node.js os module.
 */
function getRamStats() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const totalMB = Math.round(totalBytes / (1024 * 1024));
  const usedMB = Math.round(usedBytes / (1024 * 1024));
  const usedPercent = Math.round((usedBytes / totalBytes) * 100);
  return { ramTotalMB: totalMB, ramUsedMB: usedMB, ramUsedPercent: usedPercent };
}

/**
 * Get disk stats using wmic on Windows (C: drive).
 */
function getDiskStats(): Promise<{ diskTotalGB: number; diskUsedGB: number; diskUsedPercent: number }> {
  return new Promise((resolve) => {
    exec(
      'wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /format:csv',
      { timeout: 5000 },
      (err, stdout) => {
        if (err) {
          resolve({ diskTotalGB: 0, diskUsedGB: 0, diskUsedPercent: 0 });
          return;
        }
        try {
          // Output format: Node,FreeSpace,Size\r\n HOSTNAME,freeBytes,totalBytes
          const lines = stdout.trim().split('\n').filter((l) => l.trim().length > 0);
          const dataLine = lines[lines.length - 1];
          const parts = dataLine.split(',');
          // CSV columns: Node, FreeSpace, Size
          const freeBytes = parseInt(parts[1], 10);
          const totalBytes = parseInt(parts[2], 10);
          if (isNaN(freeBytes) || isNaN(totalBytes) || totalBytes === 0) {
            resolve({ diskTotalGB: 0, diskUsedGB: 0, diskUsedPercent: 0 });
            return;
          }
          const usedBytes = totalBytes - freeBytes;
          const totalGB = parseFloat((totalBytes / (1024 ** 3)).toFixed(1));
          const usedGB = parseFloat((usedBytes / (1024 ** 3)).toFixed(1));
          const usedPercent = Math.round((usedBytes / totalBytes) * 100);
          resolve({ diskTotalGB: totalGB, diskUsedGB: usedGB, diskUsedPercent: usedPercent });
        } catch {
          resolve({ diskTotalGB: 0, diskUsedGB: 0, diskUsedPercent: 0 });
        }
      },
    );
  });
}

/**
 * Get network bytes sent/received using `netstat -e` on Windows.
 * Returns cumulative totals in MB.
 */
function getNetworkStats(): Promise<{ networkSentMB: number; networkRecvMB: number }> {
  return new Promise((resolve) => {
    exec('netstat -e', { timeout: 5000 }, (err, stdout) => {
      if (err) {
        resolve({ networkSentMB: 0, networkRecvMB: 0 });
        return;
      }
      try {
        // Parse the Bytes row:  "Bytes    123456789    987654321"
        const lines = stdout.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('Bytes')) {
            const parts = trimmed.split(/\s+/);
            const recv = parseInt(parts[1], 10);
            const sent = parseInt(parts[2], 10);
            if (!isNaN(recv) && !isNaN(sent)) {
              const sentMB = parseFloat((sent / (1024 * 1024)).toFixed(2));
              const recvMB = parseFloat((recv / (1024 * 1024)).toFixed(2));

              if (!initialized) {
                // First reading — store baseline
                prevNetSent = sentMB;
                prevNetRecv = recvMB;
                initialized = true;
                resolve({ networkSentMB: 0, networkRecvMB: 0 });
                return;
              }

              // Delta since last reading
              const deltaSent = parseFloat((sentMB - prevNetSent).toFixed(2));
              const deltaRecv = parseFloat((recvMB - prevNetRecv).toFixed(2));
              prevNetSent = sentMB;
              prevNetRecv = recvMB;
              resolve({
                networkSentMB: Math.max(0, deltaSent),
                networkRecvMB: Math.max(0, deltaRecv),
              });
              return;
            }
          }
        }
        resolve({ networkSentMB: 0, networkRecvMB: 0 });
      } catch {
        resolve({ networkSentMB: 0, networkRecvMB: 0 });
      }
    });
  });
}

/**
 * Collect all system stats into a single snapshot.
 */
export async function getSystemStats(): Promise<DeviceStats> {
  const ram = getRamStats();
  const [disk, net] = await Promise.all([getDiskStats(), getNetworkStats()]);

  return {
    timestamp: new Date().toISOString(),
    ...ram,
    ...disk,
    ...net,
  };
}
