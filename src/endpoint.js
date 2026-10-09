'use strict';

const DEFAULT_WS = 'wss://api.mainnet-beta.solana.com';
const DEFAULT_RPC = 'https://api.mainnet-beta.solana.com';
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

/** wss:// -> https://, ws:// -> http:// (input is already a normalized ws(s) URL). */
function toHttpUrl(wsUrl) {
  const parsed = new URL(wsUrl);
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString();
}

/**
 * Pick the endpoints.
 *   url     WebSocket endpoint for streaming: SOL_TX_WATCH_WS, then
 *           SOL_TX_WATCH_RPC (http(s) converted to ws(s)), then the public one.
 *   rpcUrl  HTTP endpoint for fetching transactions: SOL_TX_WATCH_RPC, then
 *           SOL_TX_WATCH_WS (ws(s) converted to http(s)), then the public one.
 */
function resolveEndpoint(env = process.env) {
  let url;
  let rpcUrl;

  if (env[WS_ENV]) {
    url = normalize(env[WS_ENV], WS_ENV, false);
    rpcUrl = toHttpUrl(env[RPC_ENV] ? normalize(env[RPC_ENV], RPC_ENV, true) : url);
  } else if (env[RPC_ENV]) {
    url = normalize(env[RPC_ENV], RPC_ENV, true);
    rpcUrl = toHttpUrl(url);
  } else {
    url = DEFAULT_WS;
    rpcUrl = DEFAULT_RPC;
  }

  return { url, rpcUrl, host: hostLabel(url) };
}

module.exports = {
  DEFAULT_RPC,
  DEFAULT_WS,
  EndpointError,
  RPC_ENV,
  WS_ENV,
  hostLabel,
  resolveEndpoint,
};