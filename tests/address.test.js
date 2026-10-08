'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { ALPHABET, AddressError, base58Decode, validateAddress } = require('../src/address');

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';

function base58Encode(bytes) {
  let n = BigInt(`0x${Buffer.from(bytes).toString('hex') || '0'}`);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }
  return out;
}

test('base58Decode round-trips arbitrary bytes', () => {
  for (const length of [1, 16, 32, 64]) {
    const bytes = crypto.randomBytes(length);
    assert.deepEqual(base58Decode(base58Encode(bytes)), bytes);
  }
});

test('base58Decode keeps leading zero bytes', () => {
  assert.deepEqual(base58Decode('111'), Buffer.alloc(3));
  assert.equal(base58Decode(SYSTEM_PROGRAM).length, 32);
});

test('validateAddress accepts well-known 32-byte addresses', () => {
  for (const address of [SYSTEM_PROGRAM, TOKEN_PROGRAM, WRAPPED_SOL]) {
    assert.equal(validateAddress(address), address);
  }
});

test('validateAddress trims surrounding whitespace', () => {
  assert.equal(validateAddress(`  ${TOKEN_PROGRAM}\n`), TOKEN_PROGRAM);
});

test('validateAddress rejects empty input', () => {
  assert.throws(() => validateAddress(''), AddressError);
  assert.throws(() => validateAddress('   '), AddressError);
  assert.throws(() => validateAddress(undefined), AddressError);
});

test('validateAddress names the bad character and its position', () => {
  const bad = `${'1'.repeat(31)}O`;
  assert.throws(
    () => validateAddress(bad),
    (error) =>
      error instanceof AddressError &&
      error.message.includes('"O"') &&
      error.message.includes('position 32')
  );
});

test('validateAddress rejects values that are not 32 bytes', () => {
  assert.throws(() => validateAddress('abc'), /32 bytes/);
  assert.throws(() => validateAddress(base58Encode(crypto.randomBytes(31))), /32 bytes/);
  assert.throws(() => validateAddress(base58Encode(crypto.randomBytes(33))), /32 bytes/);
});

test('validateAddress points out a transaction signature', () => {
  const signature = base58Encode(crypto.randomBytes(64));
  assert.throws(() => validateAddress(signature), /transaction signature/);
});