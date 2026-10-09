'use strict';

const { BusyError, createLimiter } = require('./limiter');

const DEFAULT_OPTIONS = {
  concurrency: 3,
  maxQueue: 100,
  attempts: 5,
  retryDelayMs: 500,
  maxRetryDelayMs: 3000,
};

const NOT_YET = 'the RPC does not have this transaction yet';
const BUSY = 'too many transactions at once';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Turns a signature into a one-line summary using sol-tx-explain.
 *
 * explain(signature) never rejects. It resolves to one of:
 *   { ok: true, headline, kind, json }
 *   { ok: false, skipped: true, reason }    when too many are in flight
 *   { ok: false, skipped: false, reason }   when no summary could be made
 *
 * A new transaction is often not fetchable for a moment, so a missing
 * transaction is retried with backoff before giving up.
 */
function createExplainer(options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const explainTransaction =
    options.explainTransaction || require('sol-tx-explain').explainTransaction;
  const { rpcUrl } = settings;
  const limiter = createLimiter({
    concurrency: settings.concurrency,
    maxQueue: settings.maxQueue,
  });
  let stopped = false;

  async function explain(signature) {
    let reason = NOT_YET;

    for (let attempt = 0; attempt < settings.attempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(
          Math.min(settings.maxRetryDelayMs, settings.retryDelayMs * 2 ** (attempt - 1))
        );
      }
      if (stopped) return { ok: false, skipped: false, reason: 'stopped' };

      try {
        const result = await limiter.run(() => explainTransaction(signature, { rpcUrl }));
        if (result) {
          return {
            ok: true,
            headline: result.summary.headline.text,
            kind: result.summary.headline.kind,
            json: result.json,
          };
        }
        reason = NOT_YET;
      } catch (error) {
        if (error instanceof BusyError) {
          if (attempt === 0) return { ok: false, skipped: true, reason: BUSY };
          reason = BUSY;
          continue;
        }
        if (error && error.name === 'RpcError') {
          reason = error.message;
          continue;
        }
        const detail = error && error.message ? error.message : 'unknown error';
        return {
          ok: false,
          skipped: false,
          reason: `could not summarize this transaction (${detail})`,
        };
      }
    }

    return { ok: false, skipped: false, reason };
  }

  function stop() {
    stopped = true;
  }

  return { explain, stop };
}

module.exports = { DEFAULT_OPTIONS, createExplainer };