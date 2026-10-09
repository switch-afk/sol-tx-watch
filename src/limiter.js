'use strict';

class BusyError extends Error {
  constructor(message = 'too many tasks at once') {
    super(message);
    this.name = 'BusyError';
  }
}

/**
 * Run at most `concurrency` tasks at once. Up to `maxQueue` more wait their turn;
 * anything beyond that is rejected immediately with BusyError.
 */
function createLimiter({ concurrency, maxQueue }) {
  let running = 0;
  const queue = [];

  function next() {
    while (running < concurrency && queue.length > 0) {
      const { fn, resolve, reject } = queue.shift();
      running += 1;
      Promise.resolve()
        .then(fn)
        .then(resolve, reject)
        .finally(() => {
          running -= 1;
          next();
        });
    }
  }

  function run(fn) {
    return new Promise((resolve, reject) => {
      if (running >= concurrency && queue.length >= maxQueue) {
        reject(new BusyError());
        return;
      }
      queue.push({ fn, resolve, reject });
      next();
    });
  }

  return { run };
}

module.exports = { BusyError, createLimiter };