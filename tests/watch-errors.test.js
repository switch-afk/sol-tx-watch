'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { watchWallets } = require('../src/watch');

const WALLET = 'So11111111111111111111111111111111111111112';
const URL_WITH_KEY = 'wss://rpc.example.com/?api-key=secret123';

function makeFakeSocket() {
  const instances = [];
  class FakeSocket extends EventEmitter {
    constructor() {
      super();
      instances.push(this);
    }
    send() {}
    ping() {}
    close() {}
  }
  return { FakeSocket, instances };
}

function start(extra = {}) {
  const { FakeSocket, instances } = makeFakeSocket();
  const statuses = [];
  const handle = watchWallets({
    url: URL_WITH_KEY,
    wallets: [WALLET],
    onTransaction() {},
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: FakeSocket,
    initialDelayMs: 5,
    maxDelayMs: 20,
    random: () => 0.5,
    ...extra,
  });
  return { handle, instances, statuses };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('429 on connect reconnects with a rate-limit status', () => {
  const { handle, instances, statuses } = start();

  instances[0].emit('error', new Error('Unexpected server response: 429'));
  instances[0].emit('close');

  const disconnected = statuses.find((s) => s.type === 'disconnected');
  assert.ok(disconnected);
  assert.equal(disconnected.rateLimited, true);
  assert.match(disconnected.reason, /rate limiting/);
  assert.ok(disconnected.retryInMs > 0);

  handle.close();
});

test('a plain disconnect has no rateLimited key', () => {
  const { handle, instances, statuses } = start();

  instances[0].emit('close');

  const disconnected = statuses.find((s) => s.type === 'disconnected');
  assert.equal(disconnected.reason, 'connection closed');
  assert.equal('rateLimited' in disconnected, false);

  handle.close();
});

test('401 is fatal: one status, no reconnect', async () => {
  const { instances, statuses } = start();

  instances[0].emit('error', new Error('Unexpected server response: 401'));
  instances[0].emit('close');

  await wait(60);

  const fatal = statuses.filter((s) => s.type === 'fatal');
  assert.equal(fatal.length, 1);
  assert.match(fatal[0].message, /HTTP 401/);
  assert.equal(statuses.some((s) => s.type === 'disconnected'), false);
  assert.equal(instances.length, 1);
});

test('the endpoint URL and key never appear in a status reason', () => {
  const { handle, instances, statuses } = start();

  instances[0].emit('error', new Error(`getaddrinfo ENOTFOUND rpc.example.com for ${URL_WITH_KEY}`));
  instances[0].emit('close');

  const disconnected = statuses.find((s) => s.type === 'disconnected');
  assert.equal(disconnected.reason.includes('secret123'), false);

  handle.close();
});