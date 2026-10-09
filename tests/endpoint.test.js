'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_WS,
  EndpointError,
  hostLabel,
  resolveEndpoint,
} = require('../src/endpoint');

test('the public mainnet WebSocket is the default', () => {
  const endpoint = resolveEndpoint({});
  assert.equal(endpoint.url, DEFAULT_WS);
  assert.equal(endpoint.host, 'api.mainnet-beta.solana.com');
});

test('an https RPC URL becomes wss, keeping path and query', () => {
  const endpoint = resolveEndpoint({
    SOL_TX_WATCH_RPC: 'https://rpc.example.com/v2/abc?x=1',
  });
  assert.equal(endpoint.url, 'wss://rpc.example.com/v2/abc?x=1');
  assert.equal(endpoint.host, 'rpc.example.com');
});

test('an http RPC URL becomes ws', () => {
  const endpoint = resolveEndpoint({ SOL_TX_WATCH_RPC: 'http://localhost:8899' });
  assert.equal(endpoint.url, 'ws://localhost:8899/');
});

test('SOL_TX_WATCH_WS wins over SOL_TX_WATCH_RPC', () => {
  const endpoint = resolveEndpoint({
    SOL_TX_WATCH_RPC: 'https://rpc.example.com',
    SOL_TX_WATCH_WS: 'wss://stream.example.com/socket',
  });
  assert.equal(endpoint.url, 'wss://stream.example.com/socket');
  assert.equal(endpoint.host, 'stream.example.com');
});

test('SOL_TX_WATCH_WS must be a ws or wss URL, and the value is never echoed', () => {
  assert.throws(
    () => resolveEndpoint({ SOL_TX_WATCH_WS: 'https://secret.example.com' }),
    (error) =>
      error instanceof EndpointError &&
      error.message.includes('SOL_TX_WATCH_WS') &&
      !error.message.includes('secret')
  );
});

test('an unsupported scheme in SOL_TX_WATCH_RPC is rejected', () => {
  assert.throws(
    () => resolveEndpoint({ SOL_TX_WATCH_RPC: 'ftp://rpc.example.com' }),
    /must start with/
  );
});

test('a value that is not a URL is rejected', () => {
  assert.throws(() => resolveEndpoint({ SOL_TX_WATCH_RPC: 'nope' }), EndpointError);
});

test('hostLabel keeps only the hostname', () => {
  assert.equal(hostLabel('wss://h.example.com/?key=1'), 'h.example.com');
  assert.equal(hostLabel('not a url'), 'the endpoint');
});