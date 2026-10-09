'use strict';

const DEFAULT_WS = 'wss://api.mainnet-beta.solana.com';
const RPC_ENV = 'SOL_TX_WATCH_RPC';
const WS_ENV = 'SOL_TX_WATCH_WS';

class EndpointError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EndpointError';
  }
}

/**
 * Only the hostname is ever printed. RPC URLs often carry an API key
 * in the path or query string, so the full URL never reaches the output.
 */
function hostLabel(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'the endpoint';
  }
}

/**
 * Turn a configured URL into a ws:// or wss:// URL. Error messages never
 * include the value, because it may contain an API key.
 */
function normalize(value, name, allowHttp) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new EndpointError(`${name} is not a valid URL.`);
  }

  const allowed = allowHttp
    ? 'http://, https://, ws:// or wss://'
    : 'ws:// or wss://';

  if (parsed.protocol === 'https:' && allowHttp) {
    parsed.protocol = 'wss:';
  } else if (parsed.protocol === 'http:' && allowHttp) {
    parsed.protocol = 'ws:';
  } else if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new EndpointError(`${name} must start with ${allowed}.`);
  }

  return parsed.toString();
}

/**
 * Pick the WebSocket endpoint: SOL_TX_WATCH_WS wins, then SOL_TX_WATCH_RPC
 * (converted from http(s) to ws(s)), then the public mainnet endpoint.
 */
function resolveEndpoint(env = process.env) {
  let url;
  if (env[WS_ENV]) {
    url = normalize(env[WS_ENV], WS_ENV, false);
  } else if (env[RPC_ENV]) {
    url = normalize(env[RPC_ENV], RPC_ENV, true);
  } else {
    url = DEFAULT_WS;
  }
  return { url, host: hostLabel(url) };
}

module.exports = {
  DEFAULT_WS,
  EndpointError,
  RPC_ENV,
  WS_ENV,
  hostLabel,
  resolveEndpoint,
};