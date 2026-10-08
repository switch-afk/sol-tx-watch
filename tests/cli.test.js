'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pkg = require('../package.json');
const { run } = require('../src/cli');

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';

function capture() {
  const state = { out: '', err: '' };
  state.io = {
    stdout: { write: (text) => { state.out += text; } },
    stderr: { write: (text) => { state.err += text; } },
  };
  return state;
}

test('--help prints usage and exits 0', async () => {
  const c = capture();
  assert.equal(await run(['--help'], c.io), 0);
  assert.match(c.out, /Usage:/);
  assert.match(c.out, /SOL_TX_WATCH_RPC/);
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

test('valid wallets are accepted and duplicates are collapsed', async () => {
  const c = capture();
  assert.equal(await run([TOKEN_PROGRAM, WRAPPED_SOL, TOKEN_PROGRAM], c.io), 0);
  assert.match(c.out, /Checked 2 wallet addresses/);
});

test('one valid wallet is reported in the singular', async () => {
  const c = capture();
  assert.equal(await run([TOKEN_PROGRAM], c.io), 0);
  assert.match(c.out, /Checked 1 wallet address\./);
});

test('an invalid wallet exits 1 and says which one', async () => {
  const c = capture();
  assert.equal(await run([TOKEN_PROGRAM, 'not-a-wallet'], c.io), 1);
  assert.match(c.err, /Not a valid wallet address \(not-a-wallet\)/);
  assert.equal(c.out, '');
});

test('the real executable runs end to end', () => {
  const bin = path.join(__dirname, '..', 'bin', 'sol-tx-watch.js');
  const result = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), pkg.version);
});