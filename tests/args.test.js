'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { parseArgs } = require('../src/args');

test('no arguments gives an empty result', () => {
  assert.deepEqual(parseArgs([]), { help: false, version: false, unknown: null, addresses: [] });
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

test('flags can come after addresses', () => {
  const args = parseArgs(['aaa', '--help']);
  assert.equal(args.help, true);
  assert.deepEqual(args.addresses, ['aaa']);
});

test('only the first unknown flag is reported', () => {
  assert.equal(parseArgs(['--nope', '--also-nope']).unknown, '--nope');
});