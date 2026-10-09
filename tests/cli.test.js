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

/** A successful summary in which TOKEN_PROGRAM moved the given lamports (fee included). */
const transfer = (lamports) => ({
  ok: true,
  headline: 'Likely a SOL transfer',
  json: {
    feePayer: TOKEN_PROGRAM,
    fee: { lamports: 5000 },
    solChanges: [{ address: TOKEN_PROGRAM, lamports }],
  },
});

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

/**
 * Start run() with fakes and wait until it is watching.
 * Returns { done } rather than the promise itself: awaiting a returned
 * promise would wait for run() to finish, which only happens on shutdown.
 */
async function start(argv, f, c, extra = {}) {
  const done = run(argv, { ...c.io, ...f.io, env: {}, ...extra });
  await tick();
  return { done };
}

test('--help prints usage and exits 0', async () => {
  const c = capture();
  assert.equal(await run(['--help'], c.io), 0);
  assert.match(c.out, /Usage:/);
  for (const flag of ['--json', '--only-failed', '--min-sol', '--no-explain']) {
    assert.ok(c.out.includes(flag), flag);
  }
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

test('--min-sol without a value is a usage error', async () => {
  const c = capture();
  assert.equal(await run([TOKEN_PROGRAM, '--min-sol'], c.io), 2);
  assert.match(c.err, /--min-sol needs a value/);
});

test('--min-sol with a bad amount is a usage error', async () => {
  const c = capture();
  assert.equal(await run(['--min-sol', 'abc', TOKEN_PROGRAM], c.io), 2);
  assert.match(c.err, /needs a number/);
});

test('--min-sol cannot be combined with --no-explain', async () => {
  const c = capture();
  assert.equal(await run(['--min-sol', '1', '--no-explain', TOKEN_PROGRAM], c.io), 2);
  assert.match(c.err, /cannot be combined with --no-explain/);
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
  const { done } = await start([TOKEN_PROGRAM, WRAPPED_SOL, TOKEN_PROGRAM], f, c);

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
  const { done } = await start([TOKEN_PROGRAM], f, c);

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
  const { done } = await start([TOKEN_PROGRAM], f, c);

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
  const { done } = await start([TOKEN_PROGRAM], f, c);

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
  const { done } = await start(['--no-explain', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction(EVENT);
  assert.deepEqual(f.explained, []);
  assert.match(c.out, /success {2}sig123 {2}slot 7 {2}wallet Toke\.\.\.Q5DA\n$/);
  assert.equal(c.out.trim().split('\n').length, 1);

  f.release();
  await done;
});

test('--only-failed ignores successes without explaining them', async () => {
  const c = capture();
  const f = fakes();
  const { done } = await start(['--only-failed', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction(EVENT);
  f.calls[0].onTransaction({
    ...EVENT,
    signature: 'bad1',
    failed: true,
    err: { InstructionError: [0, 'Custom'] },
  });
  await tick();

  assert.deepEqual(f.explained, ['bad1']);
  assert.match(c.out, /FAILED {3}bad1/);
  assert.ok(!c.out.includes('sig123'));

  f.release();
  await done;
});

test('--json prints one JSON object per line with the full summary', async () => {
  const c = capture();
  const f = fakes();
  f.outcome = { ok: true, headline: 'Likely a swap', json: { headline: { kind: 'swap' } } };
  const { done } = await start(['--json', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction(EVENT);
  await tick();

  const lines = c.out.trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.signature, 'sig123');
  assert.equal(parsed.wallet, TOKEN_PROGRAM);
  assert.equal(parsed.slot, 7);
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.summary.headline.kind, 'swap');
  assert.equal(parsed.summaryNote, null);
  assert.equal(typeof parsed.seenAt, 'string');

  f.release();
  await done;
});

test('--json with --no-explain has no summary', async () => {
  const c = capture();
  const f = fakes();
  const { done } = await start(['--json', '--no-explain', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction(EVENT);

  const parsed = JSON.parse(c.out.trim());
  assert.equal(parsed.summary, null);
  assert.equal(parsed.summaryNote, null);

  f.release();
  await done;
});

test('--min-sol shows only transactions where a watched wallet moved enough SOL', async () => {
  const c = capture();
  const f = fakes();
  f.explainer.explain = async (signature) =>
    signature === 'big' ? transfer('-1000005000') : transfer('-505000');
  const { done } = await start(['--min-sol', '1', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction({ ...EVENT, signature: 'big' });
  f.calls[0].onTransaction({ ...EVENT, signature: 'small' });
  await tick();

  assert.ok(c.out.includes('big'));
  assert.ok(!c.out.includes('small'));

  f.release();
  await done;
});

test('--min-sol=0.5 is accepted too', async () => {
  const c = capture();
  const f = fakes();
  const { done } = await start(['--min-sol=0.5', TOKEN_PROGRAM], f, c);

  assert.equal(f.calls.length, 1);

  f.release();
  await done;
});

test('--min-sol drops transactions it could not check because of load', async () => {
  const c = capture();
  const f = fakes();
  f.outcome = { ok: false, skipped: true, reason: 'too many transactions at once' };
  const { done } = await start(['--min-sol', '1', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction(EVENT);
  await tick();

  assert.equal(c.out, '');
  assert.match(c.err, /could not be checked against --min-sol/);

  f.release();
  await done;
});

test('--min-sol still shows a transaction whose summary failed for another reason', async () => {
  const c = capture();
  const f = fakes();
  f.outcome = { ok: false, skipped: false, reason: 'rpc down' };
  const { done } = await start(['--min-sol', '1', TOKEN_PROGRAM], f, c);

  f.calls[0].onTransaction(EVENT);
  await tick();

  assert.match(c.out, /\(no summary: rpc down\)/);

  f.release();
  await done;
});

test('a summary that arrives after shutdown is dropped', async () => {
  const c = capture();
  const f = fakes();
  let finish;
  f.explainer.explain = () => new Promise((resolve) => { finish = resolve; });
  const { done } = await start([TOKEN_PROGRAM], f, c);

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
  const { done } = await start([TOKEN_PROGRAM, WRAPPED_SOL], f, c);

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
  const { done } = await start([TOKEN_PROGRAM], f, c, {
    env: { SOL_TX_WATCH_RPC: 'https://rpc.example.com/?api-key=abc' },
  });

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