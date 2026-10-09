'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { BusyError, createLimiter } = require('../src/limiter');

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('runs queued tasks in order', async () => {
  const limiter = createLimiter({ concurrency: 1, maxQueue: 10 });
  const order = [];
  await Promise.all(
    ['a', 'b', 'c'].map((name) =>
      limiter.run(async () => {
        order.push(name);
      })
    )
  );
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('rejects with BusyError when the queue is full', async () => {
  const limiter = createLimiter({ concurrency: 1, maxQueue: 1 });
  let release;
  const first = limiter.run(() => new Promise((resolve) => { release = resolve; }));
  const second = limiter.run(async () => 'second');
  await tick();

  await assert.rejects(limiter.run(async () => 'third'), BusyError);

  release('first');
  assert.equal(await first, 'first');
  assert.equal(await second, 'second');
});

test('a failing task rejects and frees its slot', async () => {
  const limiter = createLimiter({ concurrency: 1, maxQueue: 0 });
  await assert.rejects(
    limiter.run(() => {
      throw new Error('boom');
    }),
    /boom/
  );
  assert.equal(await limiter.run(async () => 'still works'), 'still works');
});