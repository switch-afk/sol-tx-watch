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

const tick = () => new Promise((resolve) => setImmediate(resolve));

function capture() {
  const state = { out: '', err: '' };
  state.io = {
    stdout: { write: (text) => { state.out += text; } },
    stderr: { write: (text) => { state.err += text; } },
  };
  return state;
}

/** A watch() stand-in plus a shutdown promise the test releases by hand. */
function fakes() {
  const state = { calls: [], closed: false };
  state.watch = (options) => {
    state.calls.push(options);
    return { close: () => { state.closed = true; } };
  };
  state.shutdown = new Promise((resolve) => { state.release = resolve; });
  return state;
}

test('--help prints usage and exits 0', async () => {
  const c = capture();
  assert.equal(await run(['--help'], c.io), 0);
  assert.match(c.out, /Usage:/);
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
  const code = await run([TOKEN_PROGRAM, 'not-a-wallet'], { ...c.io, watch: f.watch, shutdown: f.shutdown });
  assert.equal(code, 1);
  assert.match(c.err, /Not a valid wallet address \(not-a-wallet\)/);
  assert.equal(f.calls.length, 0);
});

test('an invalid endpoint exits 1 without echoing it', async () => {
  const c = capture();
  const f = fakes();
  const code = await run([TOKEN_PROGRAM], {
    ...c.io,
    env: { SOL_TX_WATCH_RPC: 'ftp://secret.example.com' },
    watch: f.watch,
    shutdown: f.shutdown,
  });
  assert.equal(code, 1);
  assert.match(c.err, /must start with/);
  assert.ok(!c.err.includes('secret'));
  assert.equal(f.calls.length, 0);
});

test('watches the deduplicated wallets, prints events and stops on shutdown', async () => {
  const c = capture();
  const f = fakes();
  const done = run([TOKEN_PROGRAM, WRAPPED_SOL, TOKEN_PROGRAM], {
    ...c.io,
    env: {},
    watch: f.watch,
    shutdown: f.shutdown,
  });
  await tick();

  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0].wallets, [TOKEN_PROGRAM, WRAPPED_SOL]);
  assert.equal(f.calls[0].url, 'wss://api.mainnet-beta.solana.com');

  f.calls[0].onTransaction({ wallet: TOKEN_PROGRAM, signature: 'sig123', slot: 7, failed: false, err: null });
  assert.match(c.out, /success {2}sig123 {2}slot 7 {2}wallet Toke\.\.\.Q5DA\n$/);

  f.release();
  assert.equal(await done, 0);
  assert.equal(f.closed, true);
  assert.match(c.err, /Stopped\./);
});

test('status messages go to stderr and never touch stdout', async () => {
  const c = capture();
  const f = fakes();
  const done = run([TOKEN_PROGRAM, WRAPPED_SOL], { ...c.io, env: {}, watch: f.watch, shutdown: f.shutdown });
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
    env: { SOL_TX_WATCH_RPC: 'https://rpc.example.com/?api-key=abc' },
    watch: f.watch,
    shutdown: f.shutdown,
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
  const code = await run([TOKEN_PROGRAM], {
    ...c.io,
    env: {},
    watch: () => { throw new WatchError('Could not open a WebSocket connection to the endpoint.'); },
    shutdown: new Promise(() => {}),
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