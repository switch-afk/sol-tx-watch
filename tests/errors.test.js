'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyConnectionError, isRateLimitText } = require('../src/errors');

test('429 is rate limited and not fatal', () => {
  const info = classifyConnectionError('Unexpected server response: 429');
  assert.equal(info.rateLimited, true);
  assert.equal(info.fatal, false);
  assert.match(info.text, /rate limiting/);
});

test('401, 403 and 404 are fatal', () => {
  for (const code of [401, 403, 404]) {
    const info = classifyConnectionError(`Unexpected server response: ${code}`);
    assert.equal(info.fatal, true, `HTTP ${code}`);
    assert.equal(info.rateLimited, false);
  }
});

test('403 text mentions the code and the API key', () => {
  const info = classifyConnectionError('Unexpected server response: 403');
  assert.match(info.text, /HTTP 403/);
  assert.match(info.text, /API key/);
});

test('other HTTP statuses are retried', () => {
  const info = classifyConnectionError('Unexpected server response: 502');
  assert.equal(info.fatal, false);
  assert.match(info.text, /HTTP 502/);
});

test('network error codes get plain text and are retried', () => {
  const cases = [
    ['getaddrinfo ENOTFOUND api.example.com', /DNS/],
    ['connect ECONNREFUSED 127.0.0.1:443', /refused/],
    ['connect ETIMEDOUT 1.2.3.4:443', /timed out/],
    ['read ECONNRESET', /reset/],
  ];
  for (const [message, pattern] of cases) {
    const info = classifyConnectionError(message);
    assert.match(info.text, pattern);
    assert.equal(info.fatal, false);
  }
});

test('unknown messages and bad input return null', () => {
  assert.equal(classifyConnectionError('something odd'), null);
  assert.equal(classifyConnectionError(''), null);
  assert.equal(classifyConnectionError(null), null);
});

test('isRateLimitText spots throttling messages', () => {
  assert.equal(isRateLimitText('HTTP 429 Too Many Requests'), true);
  assert.equal(isRateLimitText('Rate limit exceeded'), true);
  assert.equal(isRateLimitText('too many requests'), true);
  assert.equal(isRateLimitText('block not available'), false);
  assert.equal(isRateLimitText(undefined), false);
});