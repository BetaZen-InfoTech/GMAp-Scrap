const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error('ADMIN_PASSWORD environment variable is required. Set it in backend/.env');
}

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory token store: token → expiresAt (epoch ms).
 * Restarts invalidate every token (acceptable — admins re-login).
 * For multi-instance deploys, move this to Redis with a TTL key.
 */
const validTokens = new Map();

function generateToken() {
  return crypto.randomUUID();
}

function issueToken(ttlMs = TOKEN_TTL_MS) {
  const token = generateToken();
  validTokens.set(token, Date.now() + ttlMs);
  return token;
}

function revokeToken(token) {
  validTokens.delete(token);
}

/** Opportunistic sweep — runs on every auth check, keeps the Map bounded. */
function reapExpired() {
  const now = Date.now();
  for (const [token, expiresAt] of validTokens) {
    if (expiresAt <= now) validTokens.delete(token);
  }
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = auth.split(' ')[1];
  const expiresAt = validTokens.get(token);
  if (!expiresAt) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (expiresAt <= Date.now()) {
    validTokens.delete(token);
    // Cheap opportunistic reap when we see a stale token
    reapExpired();
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  next();
}

module.exports = {
  adminAuth,
  validTokens,
  ADMIN_PASSWORD,
  generateToken,
  issueToken,
  revokeToken,
  TOKEN_TTL_MS,
};
