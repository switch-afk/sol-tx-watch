'use strict';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

class AddressError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AddressError';
  }
}

/** Decode a base58 string to bytes. Leading "1" characters become leading zero bytes. */
function base58Decode(text) {
  let n = 0n;
  for (let i = 0; i < text.length; i++) {
    const index = ALPHABET.indexOf(text[i]);
    if (index === -1) {
      throw new AddressError(`character "${text[i]}" at position ${i + 1} is not valid base58`);
    }
    n = n * 58n + BigInt(index);
  }

  let body = Buffer.alloc(0);
  if (n > 0n) {
    let hex = n.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    body = Buffer.from(hex, 'hex');
  }

  let zeros = 0;
  while (zeros < text.length && text[zeros] === '1') zeros++;

  return Buffer.concat([Buffer.alloc(zeros), body]);
}

/**
 * Check that the input is a Solana wallet address: base58 that decodes to
 * exactly 32 bytes. Returns the trimmed address, or throws AddressError.
 */
function validateAddress(input) {
  const text = typeof input === 'string' ? input.trim() : '';
  if (text === '') {
    throw new AddressError('the address is empty');
  }

  const bytes = base58Decode(text);

  if (bytes.length === 64) {
    throw new AddressError(
      'that is 64 bytes long, which looks like a transaction signature, not a wallet address'
    );
  }
  if (bytes.length !== 32) {
    throw new AddressError(`it decodes to ${bytes.length} bytes, but a wallet address is 32 bytes`);
  }

  return text;
}

module.exports = { ALPHABET, AddressError, base58Decode, validateAddress };