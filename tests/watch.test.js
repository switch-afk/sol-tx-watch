'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { WatchError, backoffDelay, watchWallets } = require('../src/watch');

const URL = 'wss://rpc.example.com/?api-key=secret-key';
const A = 'AAAA1111111111111111111111111111111111111111';
const B = 'BBBB1111111111111111111111111111111111111111';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeFake() {
  const instances = [];
  class Fake extends EventEmitter {
    constructor(url) {
      super();
      this.url = url;
      this.sent = [];
      this.pings = 0;
      this.closed = false;
      instances.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    ping() {
      this.pings += 1;
    }
    close() {
      this.closed = true;
    }
  }
  return { Fake, instances };
}

function confirmAll(socket, firstId = 100) {
  socket.sent.forEach((request, index) => {
    socket.emit(
      'message',
      JSON.stringify({ jsonrpc: '2.0', id: request.id, result: firstId + index })
    );
  });
}

function notification(subscription, signature, err = null) {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: 'logsNotification',
    params: {
      result: { context: { slot: 42 }, value: { signature, err, logs: [] } },
      subscription,
    },
  });
}

test('backoffDelay doubles, jitters within 25 percent, and is capped', () => {
  const options = { initialDelayMs: 1000, maxDelayMs: 30000 };
  assert.equal(backoffDelay(0, options, () => 0.5), 1000);
  assert.equal(backoffDelay(3, options, () => 0.5), 8000);
  assert.equal(backoffDelay(0, options, () => 0), 750);
  assert.equal(backoffDelay(0, options, () => 1), 1250);
  assert.equal(backoffDelay(10, options, () => 1), 30000);
  assert.equal(backoffDelay(10, options, () => 0), 22500);
});

test('subscribes to every wallet once the socket opens', () => {
  const { Fake, instances } = makeFake();
  const handle = watchWallets({ url: URL, wallets: [A, B], onTransaction() {}, WebSocketImpl: Fake });
  try {
    const socket = instances[0];
    assert.equal(instances.length, 1);
    assert.equal(socket.url, URL);
    assert.equal(socket.sent.length, 0);

    socket.emit('open');
    assert.equal(socket.sent.length, 2);
    assert.equal(socket.sent[0].method, 'logsSubscribe');
    assert.deepEqual(socket.sent[0].params, [{ mentions: [A] }, { commitment: 'confirmed' }]);
    assert.deepEqual(socket.sent[1].params[0], { mentions: [B] });
  } finally {
    handle.close();
  }
});

test('reports ready once every subscription is confirmed', () => {
  const { Fake, instances } = makeFake();
  const statuses = [];
  const handle = watchWallets({
    url: URL,
    wallets: [A, B],
    onTransaction() {},
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: Fake,
  });
  try {
    instances[0].emit('open');
    confirmAll(instances[0]);
    assert.deepEqual(statuses, [{ type: 'connecting' }, { type: 'ready', count: 2 }]);
  } finally {
    handle.close();
  }
});

test('emits each transaction once, mapped back to its wallet', () => {
  const { Fake, instances } = makeFake();
  const events = [];
  const handle = watchWallets({
    url: URL,
    wallets: [A, B],
    onTransaction: (event) => events.push(event),
    WebSocketImpl: Fake,
  });
  try {
    const socket = instances[0];
    socket.emit('open');
    confirmAll(socket);

    const failure = { InstructionError: [0, 'Custom'] };
    socket.emit('message', notification(101, 'sigB'));
    socket.emit('message', notification(101, 'sigB'));
    socket.emit('message', notification(100, 'sigA', failure));

    assert.deepEqual(events, [
      { wallet: B, signature: 'sigB', slot: 42, failed: false, err: null },
      { wallet: A, signature: 'sigA', slot: 42, failed: true, err: failure },
    ]);
  } finally {
    handle.close();
  }
});

test('ignores malformed and unrelated messages', () => {
  const { Fake, instances } = makeFake();
  const events = [];
  const handle = watchWallets({
    url: URL,
    wallets: [A],
    onTransaction: (event) => events.push(event),
    WebSocketImpl: Fake,
  });
  try {
    instances[0].emit('open');
    instances[0].emit('message', 'not json');
    instances[0].emit('message', JSON.stringify({ method: 'somethingElse' }));
    instances[0].emit('message', JSON.stringify({ method: 'logsNotification', params: {} }));
    assert.equal(events.length, 0);
  } finally {
    handle.close();
  }
});

test('reports a failed subscription', () => {
  const { Fake, instances } = makeFake();
  const statuses = [];
  const handle = watchWallets({
    url: URL,
    wallets: [A],
    onTransaction() {},
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: Fake,
  });
  try {
    instances[0].emit('open');
    instances[0].emit(
      'message',
      JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Invalid params' } })
    );
    assert.deepEqual(statuses.at(-1), { type: 'subscribe-error', wallet: A, message: 'Invalid params' });
    assert.ok(!statuses.some((status) => status.type === 'ready'));
  } finally {
    handle.close();
  }
});

test('reconnects with growing delays after the connection drops', async () => {
  const { Fake, instances } = makeFake();
  const statuses = [];
  const handle = watchWallets({
    url: URL,
    wallets: [A],
    onTransaction() {},
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: Fake,
    initialDelayMs: 5,
    maxDelayMs: 40,
    random: () => 0.5,
  });
  try {
    instances[0].emit('open');
    instances[0].emit('close');
    const first = statuses.find((status) => status.type === 'disconnected');
    assert.equal(first.retryInMs, 5);
    assert.equal(first.reason, 'connection closed');

    await sleep(60);
    assert.equal(instances.length, 2);
    instances[1].emit('open');
    assert.equal(instances[1].sent.length, 1);

    instances[1].emit('close');
    const second = statuses.filter((status) => status.type === 'disconnected')[1];
    assert.equal(second.retryInMs, 10);
  } finally {
    handle.close();
  }
});

test('the error text never leaks the endpoint URL', () => {
  const { Fake, instances } = makeFake();
  const statuses = [];
  const handle = watchWallets({
    url: URL,
    wallets: [A],
    onTransaction() {},
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: Fake,
  });
  try {
    instances[0].emit('error', new Error(`getaddrinfo failed for ${URL}`));
    instances[0].emit('close');
    const { reason } = statuses.find((status) => status.type === 'disconnected');
    assert.ok(reason.includes('[endpoint]'));
    assert.ok(!reason.includes('secret-key'));
  } finally {
    handle.close();
  }
});

test('close() stops reconnecting and closes the socket', async () => {
  const { Fake, instances } = makeFake();
  const handle = watchWallets({
    url: URL,
    wallets: [A],
    onTransaction() {},
    WebSocketImpl: Fake,
    initialDelayMs: 5,
  });
  instances[0].emit('open');
  handle.close();
  instances[0].emit('close');
  await sleep(40);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].closed, true);
});

test('sends pings while connected and stops after close', async () => {
  const { Fake, instances } = makeFake();
  const handle = watchWallets({
    url: URL,
    wallets: [A],
    onTransaction() {},
    WebSocketImpl: Fake,
    pingIntervalMs: 10,
  });
  instances[0].emit('open');
  await sleep(55);
  assert.ok(instances[0].pings >= 2);

  handle.close();
  const count = instances[0].pings;
  await sleep(30);
  assert.equal(instances[0].pings, count);
});

test('a socket that cannot be created throws WatchError without the URL', () => {
  class Boom {
    constructor(url) {
      throw new Error(`bad ${url}`);
    }
  }
  assert.throws(
    () => watchWallets({ url: URL, wallets: [A], onTransaction() {}, WebSocketImpl: Boom }),
    (error) => error instanceof WatchError && !error.message.includes('secret-key')
  );
});

test('at least one wallet is required', () => {
  const { Fake } = makeFake();
  assert.throws(
    () => watchWallets({ url: URL, wallets: [], onTransaction() {}, WebSocketImpl: Fake }),
    WatchError
  );
});