'use strict';

const LAMPORTS_PER_SOL = 1000000000n;

class AmountError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AmountError';
  }
}

/** "0.5" -> 500000000n. A positive decimal with at most 9 decimal places. */
function parseSolAmount(text) {
  const match = /^(\d+)(?:\.(\d{1,9}))?$/.exec(String(text).trim());
  if (!match) {
    throw new AmountError('--min-sol needs a number such as 0.5 or 10 (at most 9 decimal places).');
  }

  const lamports =
    BigInt(match[1]) * LAMPORTS_PER_SOL + BigInt((match[2] || '').padEnd(9, '0'));
  if (lamports === 0n) {
    throw new AmountError('--min-sol must be greater than zero.');
  }
  return lamports;
}

/**
 * How many lamports a wallet gained (positive) or lost (negative) in a
 * transaction, not counting the fee. `json` is the sol-tx-explain JSON.
 */
function solMovement(json, wallet) {
  const change = (json.solChanges || []).find((entry) => entry.address === wallet);
  let movement = change ? BigInt(change.lamports) : 0n;

  const payerPaidFee =
    json.feePayer === wallet && json.fee && json.fee.lamports !== undefined;
  if (payerPaidFee) movement += BigInt(json.fee.lamports);

  return movement;
}

/** True when any watched wallet moved at least `minLamports` SOL, up or down. */
function passesMinSol(json, wallets, minLamports) {
  return wallets.some((wallet) => {
    const movement = solMovement(json, wallet);
    return (movement < 0n ? -movement : movement) >= minLamports;
  });
}

module.exports = { AmountError, parseSolAmount, passesMinSol, solMovement };