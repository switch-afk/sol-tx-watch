'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../src/args');

test('no arguments gives the defaults', () => {
  assert.deepEqual(parseArgs([]), {
    help: false,
    version: false,
    explain: true,
    json: false,
    onlyFailed: false,
    minSol: null,
    missingValue: null,
    unknown: null,
    addresses: [],
  });
});

test('positional arguments are collected as addresses, in order', () => {
  assert.deepEqual(parseArgs(['aaa', 'bbb']).addresses, ['aaa', 'bbb']);
});

test('help and version flags are recognised in both forms', () => {
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['-v']).version, true);
  assert.equal(parseArgs(['--version']).version, true);
});

test('--no-explain, --json and --only-failed are switches', () => {
  const args = parseArgs(['--no-explain', '--json', '--only-failed', 'aaa']);
  assert.equal(args.explain, false);
  assert.equal(args.json, true);
  assert.equal(args.onlyFailed, true);
  assert.deepEqual(args.addresses, ['aaa']);
});

test('--min-sol takes its value from the next argument', () => {
  const args = parseArgs(['--min-sol', '0.5', 'aaa']);
  assert.equal(args.minSol, '0.5');
  assert.deepEqual(args.addresses, ['aaa']);
});

test('--min-sol also accepts the = form', () => {
  const args = parseArgs(['--min-sol=0.5', 'aaa']);
  assert.equal(args.minSol, '0.5');
  assert.deepEqual(args.addresses, ['aaa']);
});

test('--min-sol without a value is reported and does not swallow the next flag', () => {
  assert.equal(parseArgs(['aaa', '--min-sol']).missingValue, '--min-sol');

  const args = parseArgs(['--min-sol', '--json', 'aaa']);
  assert.equal(args.missingValue, '--min-sol');
  assert.equal(args.json, true);
});

test('flags can come after addresses', () => {
  const args = parseArgs(['aaa', '--help']);
  assert.equal(args.help, true);
  assert.deepEqual(args.addresses, ['aaa']);
});

test('only the first unknown flag is reported', () => {
  assert.equal(parseArgs(['--nope', '--also-nope']).unknown, '--nope');
});