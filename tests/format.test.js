'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatBlock,
  formatDelay,
  formatEvent,
  formatJson,
  shortAddress,
} = require('../src/format');

const WALLET = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const NOW = new Date('2026-10-09T10:15:30.123Z');
const EVENT = { wallet: WALLET, signature: 'sig123', slot: 42, failed: false, err: null };
const LINE = '2026-10-09T10:15:30Z  success  sig123  slot 42  wallet Toke...Q5DA\n';

test('shortAddress keeps the first and last four characters', () => {
  assert.equal(shortAddress(WALLET), 'Toke...Q5DA');
  assert.equal(shortAddress('short'), 'short');
});

test('formatEvent shows time, status, signature, slot and wallet', () => {
  assert.equal(formatEvent(EVENT, NOW), LINE);
});

test('formatEvent marks a failed transaction', () => {
  const line = formatEvent({ ...EVENT, wallet: null, failed: true, err: {} }, NOW);
  assert.equal(line, '2026-10-09T10:15:30Z  FAILED   sig123  slot 42\n');
});

test('formatEvent leaves out a missing slot', () => {
  const line = formatEvent({ ...EVENT, wallet: null, slot: null }, NOW);
  assert.equal(line, '2026-10-09T10:15:30Z  success  sig123\n');
});

test('formatBlock adds an indented summary line', () => {
  const block = formatBlock(EVENT, { ok: true, headline: 'Likely a swap: sent 1 SOL' }, NOW);
  assert.equal(block, `${LINE}    Likely a swap: sent 1 SOL\n`);
});

test('formatBlock says why there is no summary', () => {
  const block = formatBlock(
    EVENT,
    { ok: false, skipped: false, reason: 'the RPC does not have this transaction yet' },
    NOW
  );
  assert.equal(block, `${LINE}    (no summary: the RPC does not have this transaction yet)\n`);
});

test('formatBlock prints only the event line for a skipped or unexplained transaction', () => {
  assert.equal(formatBlock(EVENT, { ok: false, skipped: true, reason: 'busy' }, NOW), LINE);
  assert.equal(formatBlock(EVENT, null, NOW), LINE);
});

test('formatJson is one line holding the event and the full summary', () => {
  const text = formatJson(EVENT, { ok: true, headline: 'x', json: { fee: { lamports: 5000 } } }, NOW);
  assert.ok(text.endsWith('\n'));
  assert.equal(text.trim().split('\n').length, 1);
  assert.deepEqual(JSON.parse(text), {
    seenAt: '2026-10-09T10:15:30.123Z',
    signature: 'sig123',
    slot: 42,
    wallet: WALLET,
    status: 'success',
    error: null,
    summary: { fee: { lamports: 5000 } },
    summaryNote: null,
  });
});

test('formatJson keeps the on-chain error of a failed transaction', () => {
  const err = { InstructionError: [0, 'Custom'] };
  const parsed = JSON.parse(formatJson({ ...EVENT, failed: true, err }, null, NOW));
  assert.equal(parsed.status, 'failed');
  assert.deepEqual(parsed.error, err);
  assert.equal(parsed.summary, null);
  assert.equal(parsed.summaryNote, null);
});

test('formatJson says why a summary is missing', () => {
  const parsed = JSON.parse(
    formatJson(EVENT, { ok: false, skipped: true, reason: 'too many transactions at once' }, NOW)
  );
  assert.equal(parsed.summary, null);
  assert.equal(parsed.summaryNote, 'too many transactions at once');
});

test('formatDelay prints seconds with one decimal', () => {
  assert.equal(formatDelay(2500), '2.5s');
  assert.equal(formatDelay(1000), '1.0s');
});