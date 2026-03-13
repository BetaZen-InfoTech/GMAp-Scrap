import os from 'os';

export interface DeviceInfo {
  hostname: string;
  username: string;
  platform: string;
  osVersion: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryGB: number;
  macAddresses: string[];
  networkInterfaces: Record<string, unknown>;
}

export function getDeviceInfo(): DeviceInfo {
  const nets = os.networkInterfaces();
  const macAddresses: string[] = [];
  const netInfo: Record<string, unknown> = {};

  for (const [name, ifaces] of Object.entries(nets)) {
    if (!ifaces) continue;
    netInfo[name] = ifaces.map((i) => ({
      address: i.address,
      mac: i.mac,
      family: i.family,
      internal: i.internal,
    }));
    for (const iface of ifaces) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        if (!macAddresses.includes(iface.mac)) macAddresses.push(iface.mac);
      }
    }
  }

  const cpus = os.cpus();

  return {
    hostname: os.hostname(),
    username: os.userInfo().username,
    platform: os.platform(),
    osVersion: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? 'Unknown',
    cpuCores: cpus.length,
    totalMemoryGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    macAddresses,
    networkInterfaces: netInfo,
  };
}
