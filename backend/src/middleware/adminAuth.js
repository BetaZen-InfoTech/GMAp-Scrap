const { v4: uuidv4 } = require('crypto');

const validTokens = new Set();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '9679329806';

function generateToken() {
  // Use crypto.randomUUID if available (Node 19+), else fallback
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : require('crypto').randomBytes(16).toString('hex');
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.split(' ')[1];
  if (!validTokens.has(token)) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  next();
}

module.exports = { adminAuth, validTokens, ADMIN_PASSWORD, generateToken };
