'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDelay, formatEvent, shortAddress } = require('../src/format');

const WALLET = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const NOW = new Date('2026-10-09T10:15:30.123Z');

test('shortAddress keeps the first and last four characters', () => {
  assert.equal(shortAddress(WALLET), 'Toke...5DA'.replace('5DA', 'Q5DA'));
  assert.equal(shortAddress('short'), 'short');
});

test('formatEvent shows time, status, signature, slot and wallet', () => {
  const line = formatEvent(
    { wallet: WALLET, signature: 'sig123', slot: 42, failed: false, err: null },
    NOW
  );
  assert.equal(line, '2026-10-09T10:15:30Z  success  sig123  slot 42  wallet Toke...Q5DA\n');
});

test('formatEvent marks a failed transaction', () => {
  const line = formatEvent(
    { wallet: null, signature: 'sig123', slot: 42, failed: true, err: {} },
    NOW
  );
  assert.equal(line, '2026-10-09T10:15:30Z  FAILED   sig123  slot 42\n');
});

test('formatEvent leaves out a missing slot', () => {
  const line = formatEvent(
    { wallet: null, signature: 'sig123', slot: null, failed: false, err: null },
    NOW
  );
  assert.equal(line, '2026-10-09T10:15:30Z  success  sig123\n');
});

test('formatDelay prints seconds with one decimal', () => {
  assert.equal(formatDelay(2500), '2.5s');
  assert.equal(formatDelay(1000), '1.0s');
});