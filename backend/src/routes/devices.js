const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Device = require('../models/Device');

const REGISTRATION_PASSWORD = 'BetaZen@2023';

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || '';
}

// POST /api/devices/register
router.post('/register', async (req, res) => {
  const { password, deviceInfo, nickname } = req.body;

  if (!password || password !== REGISTRATION_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  try {
    // One IP = one device — if already registered, return existing deviceId
    const clientIp = getClientIp(req);
    if (clientIp) {
      const existing = await Device.findOne({
        isActive: true,
        $or: [{ ip: clientIp }, { ips: clientIp }],
      });
      if (existing) {
        // Update nickname if provided
        if (nickname?.trim() && nickname.trim() !== existing.nickname) {
          existing.nickname = nickname.trim();
        }
        existing.lastSeenAt = new Date();
        existing.status = 'online';
        await existing.save();
        return res.json({
          success: true,
          deviceId: existing.deviceId,
          existing: true,
          message: `IP already registered — using device: ${existing.nickname || existing.deviceId.slice(0, 8)}`,
        });
      }
    }

    const deviceId = crypto.randomUUID();

    const device = new Device({
      deviceId,
      nickname: nickname?.trim() || '',
      hostname: deviceInfo?.hostname,
      username: deviceInfo?.username,
      platform: deviceInfo?.platform,
      osVersion: deviceInfo?.osVersion,
      arch: deviceInfo?.arch,
      cpuModel: deviceInfo?.cpuModel,
      cpuCores: deviceInfo?.cpuCores,
      totalMemoryGB: deviceInfo?.totalMemoryGB,
      macAddresses: deviceInfo?.macAddresses || [],
      networkInterfaces: deviceInfo?.networkInterfaces || {},
      ip: getClientIp(req),
      ips: [getClientIp(req)].filter(Boolean),
      status: 'online',
      lastSeenAt: new Date(),
    });

    await device.save();

    return res.json({ success: true, deviceId });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/devices/verify
router.post('/verify', async (req, res) => {
  const { deviceId } = req.body;

  if (!deviceId) {
    return res.status(400).json({ success: false, error: 'deviceId is required' });
  }

  try {
    const device = await Device.findOne({ deviceId, isActive: true });

    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not registered or deactivated' });
    }

    device.lastSeenAt = new Date();
    device.status = 'online';

    // Merge new IP into ips array (keep all unique IPs)
    const currentIp = getClientIp(req);
    if (currentIp && !device.ips.includes(currentIp)) {
      device.ips.push(currentIp);
    }

    await device.save();

    return res.json({ success: true, deviceId: device.deviceId, nickname: device.nickname || '' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/devices/:deviceId/nickname — update nickname
router.patch('/:deviceId/nickname', async (req, res) => {
  const { deviceId } = req.params;
  const { nickname } = req.body;

  if (typeof nickname !== 'string') {
    return res.status(400).json({ success: false, error: 'nickname is required' });
  }

  try {
    const device = await Device.findOneAndUpdate(
      { deviceId },
      { nickname: nickname.trim() },
      { new: true }
    );
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }
    return res.json({ success: true, nickname: device.nickname });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
