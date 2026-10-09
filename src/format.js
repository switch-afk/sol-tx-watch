'use strict';

/** First and last four characters, e.g. Toke...Q5DA. */
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

/**
 * The event line, followed by an indented summary line when there is one.
 * A transaction skipped because of load, or printed with no outcome, gets just the line.
 */
function formatBlock(event, outcome, now = new Date()) {
  const line = formatEvent(event, now);
  if (!outcome || outcome.skipped) return line;
  if (outcome.ok) return `${line}    ${outcome.headline}\n`;
  return `${line}    (no summary: ${outcome.reason})\n`;
}

/** 2500 -> "2.5s" */
function formatDelay(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

module.exports = { formatBlock, formatDelay, formatEvent, shortAddress };