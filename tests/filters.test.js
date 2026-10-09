'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { AmountError, parseSolAmount, passesMinSol, solMovement } = require('../src/filters');

const PAYER = 'PAYR1111111111111111111111111111111111111111';
const RECEIVER = 'RECV1111111111111111111111111111111111111111';

// PAYER sends exactly 1 SOL to RECEIVER and pays a 5000 lamport fee.
const TRANSFER = {
  feePayer: PAYER,
  fee: { lamports: 5000 },
  solChanges: [
    { address: PAYER, lamports: '-1000005000' },
    { address: RECEIVER, lamports: '1000000000' },
  ],
};

test('parseSolAmount converts SOL to lamports exactly', () => {
  assert.equal(parseSolAmount('0.5'), 500000000n);
  assert.equal(parseSolAmount('10'), 10000000000n);
  assert.equal(parseSolAmount('0.000000001'), 1n);
  assert.equal(parseSolAmount(' 2.25 '), 2250000000n);
});

test('parseSolAmount rejects anything that is not a positive amount', () => {
  for (const bad of ['', 'abc', '-1', '1.2345678901', '0', '0.0', '1e3', '1,5']) {
    assert.throws(() => parseSolAmount(bad), AmountError, bad);
  }
});

test('solMovement leaves the fee out for the fee payer', () => {
  assert.equal(solMovement(TRANSFER, PAYER), -1000000000n);
  assert.equal(solMovement(TRANSFER, RECEIVER), 1000000000n);
});

test('solMovement is zero for a wallet that was not involved', () => {
  assert.equal(solMovement(TRANSFER, 'OTHER'), 0n);
});

test('a fee-only transaction moves nothing', () => {
  const feeOnly = {
    feePayer: PAYER,
    fee: { lamports: 5000 },
    solChanges: [{ address: PAYER, lamports: '-5000' }],
  };
  assert.equal(solMovement(feeOnly, PAYER), 0n);
  assert.equal(passesMinSol(feeOnly, [PAYER], 1n), false);
});

test('passesMinSol compares the size of the movement in either direction', () => {
  const oneSol = 1000000000n;
  assert.equal(passesMinSol(TRANSFER, [PAYER], oneSol), true);
  assert.equal(passesMinSol(TRANSFER, [RECEIVER], oneSol), true);
  assert.equal(passesMinSol(TRANSFER, [PAYER], oneSol + 1n), false);
});

test('passesMinSol passes when any watched wallet qualifies', () => {
  assert.equal(passesMinSol(TRANSFER, ['OTHER', RECEIVER], 1000000000n), true);
  assert.equal(passesMinSol(TRANSFER, ['OTHER'], 1n), false);
});

test('passesMinSol copes with missing fields', () => {
  assert.equal(passesMinSol({}, [PAYER], 1n), false);
});