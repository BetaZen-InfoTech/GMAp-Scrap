const crypto = require('crypto');

const validTokens = new Set();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD environment variable is required. Set it in backend/.env');
}

function generateToken() {
  return crypto.randomUUID();
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
