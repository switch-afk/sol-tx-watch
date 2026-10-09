'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createExplainer } = require('../src/explainer');

const RPC_URL = 'https://rpc.example.com/?api-key=secret-key';
const RESULT = {
  summary: { headline: { text: 'Likely a swap: sent 1 SOL', kind: 'swap' } },
  json: { signature: 'x' },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const rpcError = (message) => Object.assign(new Error(message), { name: 'RpcError' });

const FAST = { retryDelayMs: 1, maxRetryDelayMs: 2 };

test('returns the headline and passes the RPC URL on', async () => {
  const calls = [];
  const explainer = createExplainer({
    ...FAST,
    rpcUrl: RPC_URL,
    explainTransaction: async (signature, options) => {
      calls.push({ signature, options });
      return RESULT;
    },
  });

  const outcome = await explainer.explain('sig1');
  assert.deepEqual(outcome, {
    ok: true,
    headline: 'Likely a swap: sent 1 SOL',
    kind: 'swap',
    json: { signature: 'x' },
  });
  assert.deepEqual(calls, [{ signature: 'sig1', options: { rpcUrl: RPC_URL } }]);
});

test('retries while the transaction is not available yet', async () => {
  let calls = 0;
  const explainer = createExplainer({
    ...FAST,
    explainTransaction: async () => {
      calls += 1;
      return calls < 3 ? null : RESULT;
    },
  });

  const outcome = await explainer.explain('sig1');
  assert.equal(outcome.ok, true);
  assert.equal(calls, 3);
});

test('gives up after the configured number of attempts', async () => {
  let calls = 0;
  const explainer = createExplainer({
    ...FAST,
    attempts: 4,
    explainTransaction: async () => {
      calls += 1;
      return null;
    },
  });

  const outcome = await explainer.explain('sig1');
  assert.deepEqual(outcome, {
    ok: false,
    skipped: false,
    reason: 'the RPC does not have this transaction yet',
  });
  assert.equal(calls, 4);
});

test('an RPC error is retried and then reported with its message', async () => {
  let calls = 0;
  const explainer = createExplainer({
    ...FAST,
    attempts: 3,
    explainTransaction: async () => {
      calls += 1;
      throw rpcError('rpc.example.com is rate-limiting requests (HTTP 429).');
    },
  });

  const outcome = await explainer.explain('sig1');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'rpc.example.com is rate-limiting requests (HTTP 429).');
  assert.equal(calls, 3);
});

test('an RPC error that clears up on retry still gives a summary', async () => {
  let calls = 0;
  const explainer = createExplainer({
    ...FAST,
    explainTransaction: async () => {
      calls += 1;
      if (calls === 1) throw rpcError('rpc.example.com timed out');
      return RESULT;
    },
  });

  assert.equal((await explainer.explain('sig1')).ok, true);
});

test('an unexpected error is reported once, without retrying', async () => {
  let calls = 0;
  const explainer = createExplainer({
    ...FAST,
    explainTransaction: async () => {
      calls += 1;
      throw new TypeError('boom');
    },
  });

  const outcome = await explainer.explain('sig1');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.skipped, false);
  assert.match(outcome.reason, /could not summarize this transaction \(boom\)/);
  assert.equal(calls, 1);
});

test('skips a transaction when too many are already in flight', async () => {
  let release;
  const explainer = createExplainer({
    ...FAST,
    concurrency: 1,
    maxQueue: 0,
    explainTransaction: (signature) =>
      signature === 'a'
        ? new Promise((resolve) => { release = () => resolve(RESULT); })
        : Promise.resolve(RESULT),
  });

  const first = explainer.explain('a');
  await tick();

  const second = await explainer.explain('b');
  assert.deepEqual(second, { ok: false, skipped: true, reason: 'too many transactions at once' });

  release();
  assert.equal((await first).ok, true);
});

test('never runs more than the configured number at once', async () => {
  let active = 0;
  let max = 0;
  const explainer = createExplainer({
    ...FAST,
    concurrency: 2,
    maxQueue: 100,
    explainTransaction: async () => {
      active += 1;
      max = Math.max(max, active);
      await sleep(10);
      active -= 1;
      return RESULT;
    },
  });

  const outcomes = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => explainer.explain(s)));
  assert.ok(outcomes.every((outcome) => outcome.ok));
  assert.equal(max, 2);
});

test('stop() ends retries and later calls do nothing', async () => {
  let calls = 0;
  const explainer = createExplainer({
    retryDelayMs: 20,
    maxRetryDelayMs: 20,
    explainTransaction: async () => {
      calls += 1;
      return null;
    },
  });

  const pending = explainer.explain('sig1');
  await sleep(5);
  explainer.stop();

  const outcome = await pending;
  assert.equal(outcome.reason, 'stopped');
  assert.equal(calls, 1);

  assert.equal((await explainer.explain('sig2')).reason, 'stopped');
  assert.equal(calls, 1);
});