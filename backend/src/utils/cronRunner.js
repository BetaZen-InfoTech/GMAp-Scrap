const { isAuthzError, describe } = require('./mongoErrors');

/**
 * Wraps a cron task so that:
 *   - Errors are caught and logged (never escape).
 *   - After N consecutive MongoDB authorization errors, the task is
 *     disabled (interval cleared) and a single warning is logged.
 *     Retrying won't help until DB roles are granted.
 *   - Other errors are logged but do NOT disable the cron — they may
 *     be transient.
 *
 * Usage:
 *   const { startCron } = require('../utils/cronRunner');
 *   startCron({ name: 'DeviceCron', intervalMs: 3*60*1000, task: runOfflineCheck });
 */

const DEFAULT_AUTHZ_TRIP_AFTER = 3;

/**
 * @param {object}   opts
 * @param {string}   opts.name          Label for log lines ("DeviceCron").
 * @param {number}   opts.intervalMs    Tick interval in ms.
 * @param {() => Promise<unknown>} opts.task  The async work to run.
 * @param {boolean}  [opts.runImmediately=true]
 * @param {number}   [opts.authzTripAfter=3]  Disable after N consecutive authz errors.
 * @returns {{ stop: () => void, isDisabled: () => boolean }}
 */
function startCron({
  name,
  intervalMs,
  task,
  runImmediately = true,
  authzTripAfter = DEFAULT_AUTHZ_TRIP_AFTER,
}) {
  let authzFailures = 0;
  let disabled = false;
  let timer = null;

  const tick = async (isInitial) => {
    if (disabled) return;
    try {
      await task();
      // Success resets the authz-failure counter so one-off blips don't
      // accumulate toward disabling the cron.
      authzFailures = 0;
    } catch (err) {
      if (isAuthzError(err)) {
        authzFailures += 1;
        if (authzFailures >= authzTripAfter) {
          disabled = true;
          if (timer) { clearInterval(timer); timer = null; }
          console.warn(
            `[${name}] Disabled — MongoDB user lacks permission after ${authzFailures} consecutive attempts. ` +
            `Grant readWrite on the target collections and restart the server.`
          );
          return;
        }
        console.error(
          `[${name}] Authorization error (${authzFailures}/${authzTripAfter}) — ${describe(err)}`
        );
        return;
      }
      // Non-authz error — just log. Do not trip the breaker.
      console.error(
        `[${name}]${isInitial ? ' initial-run' : ''} error — ${describe(err)}`
      );
    }
  };

  if (runImmediately) {
    // Fire-and-forget — tick is self-guarded.
    tick(true);
  }

  timer = setInterval(() => tick(false), intervalMs);

  return {
    stop() {
      disabled = true;
      if (timer) { clearInterval(timer); timer = null; }
    },
    isDisabled() { return disabled; },
  };
}

module.exports = { startCron };
