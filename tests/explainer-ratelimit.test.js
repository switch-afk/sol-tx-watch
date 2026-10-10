'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExplainer } = require('../src/explainer');

function rpcError(message) {
  const error = new Error(message);
  error.name = 'RpcError';
  return error;
}

const FAST = { rpcUrl: 'https://rpc.example.com', attempts: 2, retryDelayMs: 1, maxRetryDelayMs: 2 };

test('a rate-limited RPC gives up with rateLimited: true', async () => {
  const explainer = createExplainer({
    ...FAST,
    explainTransaction: async () => {
      throw rpcError('HTTP 429 Too Many Requests');
    },
  });

  const outcome = await explainer.explain('sig');

  assert.equal(outcome.ok, false);
  assert.equal(outcome.skipped, false);
  assert.equal(outcome.rateLimited, true);
});

test('other RPC errors have no rateLimited key', async () => {
  const explainer = createExplainer({
    ...FAST,
    explainTransaction: async () => {
      throw rpcError('block not available');
    },
  });

  const outcome = await explainer.explain('sig');

  assert.equal(outcome.ok, false);
  assert.equal('rateLimited' in outcome, false);
});

test('a later success clears the rate-limit state', async () => {
  let calls = 0;
  const explainer = createExplainer({
    ...FAST,
    explainTransaction: async () => {
      calls += 1;
      if (calls === 1) throw rpcError('HTTP 429 Too Many Requests');
      return { summary: { headline: { text: 'Sent 1 SOL', kind: 'transfer' } }, json: {} };
    },
  });

  const outcome = await explainer.explain('sig');

  assert.equal(outcome.ok, true);
  assert.equal('rateLimited' in outcome, false);
});