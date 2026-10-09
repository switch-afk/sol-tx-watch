'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pkg = require('../package.json');
const { run } = require('../src/cli');
const { WatchError } = require('../src/watch');

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';
const EVENT = { wallet: TOKEN_PROGRAM, signature: 'sig123', slot: 7, failed: false, err: null };

const tick = () => new Promise((resolve) => setImmediate(resolve));

function capture() {
  const state = { out: '', err: '' };
  state.io = {
    stdout: { write: (text) => { state.out += text; } },
    stderr: { write: (text) => { state.err += text; } },
  };
  return state;
}

/** Stand-ins for watch(), the explainer and shutdown, controlled by the test. */
function fakes() {
  const state = {
    calls: [],
    closed: false,
    explained: [],
    explainerStopped: false,
    outcome: { ok: true, headline: 'Likely a swap: sent 1 SOL' },
  };
  state.watch = (options) => {
    state.calls.push(options);
    return { close: () => { state.closed = true; } };
  };
  state.explainer = {
    explain: async (signature) => {
      state.explained.push(signature);
      return state.outcome;
    },
    stop: () => { state.explainerStopped = true; },
  };
  state.shutdown = new Promise((resolve) => { state.release = resolve; });
  state.io = { watch: state.watch, explainer: state.explainer, shutdown: state.shutdown };
  return state;
}

test('--help prints usage and exits 0', async () => {
  const c = capture();
  assert.equal(await run(['--help'], c.io), 0);
  assert.match(c.out, /Usage:/);
  assert.match(c.out, /--no-explain/);
  assert.match(c.out, /SOL_TX_WATCH_RPC/);
  assert.match(c.out, /SOL_TX_WATCH_WS/);
});

test('--version prints the package version', async () => {
  const c = capture();
  assert.equal(await run(['--version'], c.io), 0);
  assert.equal(c.out.trim(), pkg.version);
});

test('no arguments is a usage error', async () => {
  const c = capture();
  assert.equal(await run([], c.io), 2);
  assert.match(c.err, /at least one wallet address/);
});

test('an unknown option is a usage error', async () => {
  const c = capture();
  assert.equal(await run(['--nope', TOKEN_PROGRAM], c.io), 2);
  assert.match(c.err, /Unknown option: --nope/);
});

test('an invalid wallet exits 1, says which one, and never starts watching', async () => {
  const c = capture();
  const f = fakes();
  const code = await run([TOKEN_PROGRAM, 'not-a-wallet'], { ...c.io, ...f.io });
  assert.equal(code, 1);
  assert.match(c.err, /Not a valid wallet address \(not-a-wallet\)/);
  assert.equal(f.calls.length, 0);
});

test('an invalid endpoint exits 1 without echoing it', async () => {
  const c = capture();
  const f = fakes();
  const code = await run([TOKEN_PROGRAM], {
    ...c.io,
    ...f.io,
    env: { SOL_TX_WATCH_RPC: 'ftp://secret.example.com' },
  });
  assert.equal(code, 1);
  assert.match(c.err, /must start with/);
  assert.ok(!c.err.includes('secret'));
  assert.equal(f.calls.length, 0);
});

test('watches the deduplicated wallets and stops on shutdown', async () => {
  const c = capture();
  const f = fakes();
  const done = run([TOKEN_PROGRAM, WRAPPED_SOL, TOKEN_PROGRAM], { ...c.io, ...f.io, env: {} });
  await tick();

  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].wallets, [TOKEN_PROGRAM, WRAPPED_SOL]);
  assert.equal(f.calls[0].url, 'wss://api.mainnet-beta.solana.com');

  f.release();
  assert.equal(await done, 0);
  assert.equal(f.closed, true);
  assert.equal(f.explainerStopped, true);
  assert.match(c.err, /Stopped\./);
});

test('each transaction is printed with its plain-English summary', async () => {
  const c = capture();
  const f = fakes();
  const done = run([TOKEN_PROGRAM], { ...c.io, ...f.io, env: {} });
  await tick();

  f.calls[0].onTransaction(EVENT);
  await tick();

  assert.deepEqual(f.explained, ['sig123']);
  assert.match(
    c.out,
    /success {2}sig123 {2}slot 7 {2}wallet Toke\.\.\.Q5DA\n {4}Likely a swap: sent 1 SOL\n$/
  );

  f.release();
  await done;
});

test('a transaction that could not be explained says why', async () => {
  const c = capture();
  const f = fakes();
  f.outcome = { ok: false, skipped: false, reason: 'the RPC does not have this transaction yet' };
  const done = run([TOKEN_PROGRAM], { ...c.io, ...f.io, env: {} });
  await tick();

  f.calls[0].onTransaction(EVENT);
  await tick();

  assert.match(c.out, /\n {4}\(no summary: the RPC does not have this transaction yet\)\n$/);

  f.release();
  await done;
});

test('skipped transactions print without a summary and trigger one busy notice', async () => {
  const c = capture();
  const f = fakes();
  f.outcome = { ok: false, skipped: true, reason: 'too many transactions at once' };
  const done = run([TOKEN_PROGRAM], { ...c.io, ...f.io, env: {} });
  await tick();

  f.calls[0].onTransaction(EVENT);
  f.calls[0].onTransaction({ ...EVENT, signature: 'sig456' });
  await tick();

  const lines = c.out.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines.every((line) => !line.startsWith(' ')));
  assert.equal(c.err.split('Busy:').length - 1, 1);
  assert.match(c.err, /--no-explain/);

  f.release();
  await done;
});

test('--no-explain prints plain event lines and never asks for a summary', async () => {
  const c = capture();
  const f = fakes();
  const done = run(['--no-explain', TOKEN_PROGRAM], { ...c.io, ...f.io, env: {} });
  await tick();

  f.calls[0].onTransaction(EVENT);
  assert.deepEqual(f.explained, []);
  assert.match(c.out, /success {2}sig123 {2}slot 7 {2}wallet Toke\.\.\.Q5DA\n$/);
  assert.equal(c.out.trim().split('\n').length, 1);

  f.release();
  await done;
});

test('a summary that arrives after shutdown is dropped', async () => {
  const c = capture();
  const f = fakes();
  let finish;
  f.explainer.explain = () => new Promise((resolve) => { finish = resolve; });
  const done = run([TOKEN_PROGRAM], { ...c.io, ...f.io, env: {} });
  await tick();

  f.calls[0].onTransaction(EVENT);
  f.release();
  await done;

  finish({ ok: true, headline: 'too late' });
  await tick();
  assert.equal(c.out, '');
});

test('status messages go to stderr and never touch stdout', async () => {
  const c = capture();
  const f = fakes();
  const done = run([TOKEN_PROGRAM, WRAPPED_SOL], { ...c.io, ...f.io, env: {} });
  await tick();

  const { onStatus } = f.calls[0];
  onStatus({ type: 'ready', count: 2 });
  onStatus({ type: 'disconnected', reason: 'connection closed', retryInMs: 2500 });
  onStatus({ type: 'ready', count: 2 });
  onStatus({ type: 'subscribe-error', wallet: TOKEN_PROGRAM, message: 'Invalid params' });

  assert.match(c.err, /Watching 2 wallets on api\.mainnet-beta\.solana\.com\. Press Ctrl\+C to stop\./);
  assert.match(c.err, /Disconnected from api\.mainnet-beta\.solana\.com \(connection closed\)\. Reconnecting in 2\.5s\.\.\./);
  assert.match(c.err, /Reconnected to api\.mainnet-beta\.solana\.com\./);
  assert.match(c.err, /Could not subscribe to Toke\.\.\.Q5DA: Invalid params/);
  assert.equal(c.out, '');

  f.release();
  await done;
});

test('an https RPC URL is streamed over wss and only its host is printed', async () => {
  const c = capture();
  const f = fakes();
  const done = run([TOKEN_PROGRAM], {
    ...c.io,
    ...f.io,
    env: { SOL_TX_WATCH_RPC: 'https://rpc.example.com/?api-key=abc' },
  });
  await tick();

  assert.equal(f.calls[0].url, 'wss://rpc.example.com/?api-key=abc');
  f.calls[0].onStatus({ type: 'ready', count: 1 });
  assert.match(c.err, /Watching 1 wallet on rpc\.example\.com\./);
  assert.ok(!c.err.includes('abc'));

  f.release();
  await done;
});

test('a WatchError from the watcher exits 1', async () => {
  const c = capture();
  const f = fakes();
  const code = await run([TOKEN_PROGRAM], {
    ...c.io,
    ...f.io,
    env: {},
    watch: () => { throw new WatchError('Could not open a WebSocket connection to the endpoint.'); },
  });
  assert.equal(code, 1);
  assert.match(c.err, /Could not open a WebSocket connection/);
});

test('the real executable runs end to end', () => {
  const bin = path.join(__dirname, '..', 'bin', 'sol-tx-watch.js');
  const result = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});