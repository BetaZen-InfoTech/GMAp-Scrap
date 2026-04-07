import { Client, type ConnectConfig } from 'ssh2';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/types';

interface SshConnection {
  client: Client;
  stream: NodeJS.ReadWriteStream | null;
  deviceId: string;
  host: string;
}

const connections = new Map<string, SshConnection>();

function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.length > 0 ? wins[0] : null;
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

export function sshConnect(
  deviceId: string,
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Disconnect existing connection for this device
    if (connections.has(deviceId)) {
      sshDisconnect(deviceId);
    }

    const client = new Client();
    const config: ConnectConfig = {
      host,
      port: port || 22,
      username: username || 'root',
      password,
      tryKeyboard: true,
      readyTimeout: 15000,
      keepaliveInterval: 10000,
    };

    console.log(`[SSH] Connecting to ${host}:${port} as ${username} (password: ${password ? '***set***' : 'EMPTY'})`);

    // Handle keyboard-interactive auth (some servers require this instead of plain password)
    client.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finish) => {
      finish([password]);
    });

    client.on('ready', () => {
      client.shell((err, stream) => {
        if (err) {
          client.end();
          resolve({ success: false, error: err.message });
          return;
        }

        connections.set(deviceId, { client, stream, deviceId, host });

        stream.on('data', (data: Buffer) => {
          sendToRenderer(IPC_CHANNELS.SSH_OUTPUT, deviceId, data.toString('utf8'));
        });

        stream.stderr?.on('data', (data: Buffer) => {
          sendToRenderer(IPC_CHANNELS.SSH_OUTPUT, deviceId, data.toString('utf8'));
        });

        stream.on('close', () => {
          connections.delete(deviceId);
          sendToRenderer(IPC_CHANNELS.SSH_STATUS, deviceId, 'disconnected');
        });

        sendToRenderer(IPC_CHANNELS.SSH_STATUS, deviceId, 'connected');
        resolve({ success: true });
      });
    });

    client.on('error', (err) => {
      connections.delete(deviceId);
      sendToRenderer(IPC_CHANNELS.SSH_ERROR, deviceId, err.message);
      resolve({ success: false, error: err.message });
    });

    client.on('close', () => {
      connections.delete(deviceId);
      sendToRenderer(IPC_CHANNELS.SSH_STATUS, deviceId, 'disconnected');
    });

    client.connect(config);
  });
}

export function sshCommand(deviceId: string, command: string): boolean {
  const conn = connections.get(deviceId);
  if (!conn?.stream) return false;
  conn.stream.write(command + '\n');
  return true;
}

export function sshCommandAll(command: string): number {
  let count = 0;
  for (const conn of connections.values()) {
    if (conn.stream) {
      conn.stream.write(command + '\n');
      count++;
    }
  }
  return count;
}

export function sshDisconnect(deviceId?: string): void {
  if (deviceId) {
    const conn = connections.get(deviceId);
    if (conn) {
      conn.stream?.end?.();
      conn.client.end();
      connections.delete(deviceId);
    }
  } else {
    // Disconnect all
    for (const conn of connections.values()) {
      conn.stream?.end?.();
      conn.client.end();
    }
    connections.clear();
  }
}

export function getConnectedDeviceIds(): string[] {
  return [...connections.keys()];
}

export function cleanup(): void {
  sshDisconnect();
}
