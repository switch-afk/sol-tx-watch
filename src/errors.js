'use strict';

/**
 * Turn a low-level connection error message into plain English.
 * Returns null when the message is not one we recognize, so the caller
 * can fall back to the original text.
 *
 * fatal: retrying cannot help (wrong key, wrong URL).
 * rateLimited: the endpoint is throttling us; back off and hint at a better RPC.
 */
function classifyConnectionError(message) {
  if (typeof message !== 'string' || message === '') return null;

  const status = /Unexpected server response: (\d{3})/.exec(message);
  if (status) {
    const code = Number(status[1]);
    if (code === 429) {
      return {
        text: 'the endpoint is rate limiting connections (HTTP 429)',
        fatal: false,
        rateLimited: true,
      };
    }
    if (code === 401 || code === 403) {
      return {
        text: `the endpoint rejected the connection (HTTP ${code}); check the API key in your endpoint URL`,
        fatal: true,
        rateLimited: false,
      };
    }
    if (code === 404) {
      return {
        text: 'the endpoint was not found (HTTP 404); check the URL',
        fatal: true,
        rateLimited: false,
      };
    }
    return { text: `the endpoint answered with HTTP ${code}`, fatal: false, rateLimited: false };
  }

  if (/ENOTFOUND|EAI_AGAIN/.test(message)) {
    return {
      text: 'could not find the endpoint host (DNS lookup failed)',
      fatal: false,
      rateLimited: false,
    };
  }
  if (/ECONNREFUSED/.test(message)) {
    return { text: 'the endpoint refused the connection', fatal: false, rateLimited: false };
  }
  if (/ETIMEDOUT/.test(message)) {
    return { text: 'the connection timed out', fatal: false, rateLimited: false };
  }
  if (/ECONNRESET/.test(message)) {
    return { text: 'the connection was reset', fatal: false, rateLimited: false };
  }

  return null;
}

/** True when an error message looks like the RPC is throttling us. */
function isRateLimitText(text) {
  return /\b429\b|rate.?limit|too many requests/i.test(String(text || ''));
}

module.exports = { classifyConnectionError, isRateLimitText };