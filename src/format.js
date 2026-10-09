'use strict';

/** First and last four characters, e.g. TokE...Q5DA. */
function shortAddress(address) {
  if (address.length <= 11) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** One output line for a new transaction. */
function formatEvent(event, now = new Date()) {
  const time = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const status = event.failed ? 'FAILED ' : 'success';
  const parts = [time, status, event.signature];
  if (event.slot !== null && event.slot !== undefined) parts.push(`slot ${event.slot}`);
  if (event.wallet) parts.push(`wallet ${shortAddress(event.wallet)}`);
  return `${parts.join('  ')}\n`;
}

/** 2500 -> "2.5s" */
function formatDelay(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = { formatDelay, formatEvent, shortAddress };