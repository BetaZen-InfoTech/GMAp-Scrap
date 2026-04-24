/**
 * Classify MongoDB driver errors so services can decide whether to
 * retry, back off, or disable themselves.
 *
 * - AUTHZ      — "not authorized" / code 13. Retrying won't help until
 *                the operator fixes user roles on the DB.
 * - NOT_PRIMARY — replica-set related; change streams, certain writes.
 * - TRANSIENT  — network blips, stepdowns, timeouts. Safe to retry.
 */

/** @param {unknown} err */
function isAuthzError(err) {
  if (!err) return false;
  if (err.code === 13) return true;
  const msg = String(err.message || err.codeName || '').toLowerCase();
  return msg.includes('not authorized') || msg.includes('unauthorized');
}

/** @param {unknown} err */
function isStandaloneChangeStreamError(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  // MongoDB returns code 40573 or messages mentioning "replica set" when
  // $changeStream is attempted against a standalone mongod.
  return (
    err.code === 40573 ||
    msg.includes('replica set') ||
    msg.includes('only supported on replica sets')
  );
}

/** Short, human-readable summary for logs. */
function describe(err) {
  if (!err) return '<no error>';
  const parts = [];
  if (err.name) parts.push(err.name);
  if (err.code != null) parts.push(`code=${err.code}`);
  if (err.message) parts.push(err.message);
  return parts.join(' | ');
}

module.exports = {
  isAuthzError,
  isStandaloneChangeStreamError,
  describe,
};
