'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { run } = require('../src/cli');

const WALLET = 'So11111111111111111111111111111111111111112';

function setup(env = {}) {
  const out = [];
  const err = [];
  let watchOptions = null;
  let closed = false;
  let stop;
  const shutdown = new Promise((resolve) => {
    stop = resolve;
  });

  const io = {
    stdout: { write: (text) => out.push(text) },
    stderr: { write: (text) => err.push(text) },
    env,
    shutdown,
    watch: (options) => {
      watchOptions = options;
      return {
        close() {
          closed = true;
        },
      };
    },
  };

  return {
    io,
    stop,
    stderr: () => err.join(''),
    options: () => watchOptions,
    wasClosed: () => closed,
  };
}

test('a fatal status stops the run with exit code 1', async () => {
  const t = setup();
  const done = run(['--no-explain', WALLET], t.io);

  t.options().onStatus({ type: 'fatal', message: 'the endpoint rejected the connection (HTTP 401)' });

  assert.equal(await done, 1);
  assert.match(t.stderr(), /Cannot connect to api\.mainnet-beta\.solana\.com/);
  assert.match(t.stderr(), /HTTP 401/);
  assert.equal(t.stderr().includes('Stopped.'), false);
  assert.equal(t.wasClosed(), true);
});

test('the rate-limit hint points at the env var on the public RPC, once', async () => {
  const t = setup();
  const done = run(['--no-explain', WALLET], t.io);

  const status = { type: 'disconnected', reason: 'rate limited', retryInMs: 5000, rateLimited: true };
  t.options().onStatus(status);
  t.options().onStatus(status);
  t.stop();

  assert.equal(await done, 0);
  const text = t.stderr();
  assert.equal(text.split('rate-limits heavily').length - 1, 1);
  assert.match(text, /SOL_TX_WATCH_RPC/);
});

test('with your own RPC the hint talks about plan limits instead', async () => {
  const t = setup({ SOL_TX_WATCH_RPC: 'https://rpc.example.com/?key=secret123' });
  const done = run(['--no-explain', WALLET], t.io);

  t.options().onStatus({ type: 'disconnected', reason: 'x', retryInMs: 5000, rateLimited: true });
  t.stop();

  await done;
  const text = t.stderr();
  assert.match(text, /plan's limits/);
  assert.equal(text.includes('rate-limits heavily'), false);
  assert.equal(text.includes('secret123'), false);
});

test('a rate-limited subscribe error also shows the hint', async () => {
  const t = setup();
  const done = run(['--no-explain', WALLET], t.io);

  t.options().onStatus({ type: 'subscribe-error', wallet: WALLET, message: 'HTTP 429 Too Many Requests' });
  t.stop();

  await done;
  assert.match(t.stderr(), /rate-limits heavily/);
});

test('a normal Ctrl+C still prints Stopped and exits 0', async () => {
  const t = setup();
  const done = run(['--no-explain', WALLET], t.io);

  t.stop();

  assert.equal(await done, 0);
  assert.match(t.stderr(), /Stopped\./);
});