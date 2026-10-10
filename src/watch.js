'use strict';

const { classifyConnectionError } = require('./errors');

const DEFAULT_OPTIONS = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  pingIntervalMs: 30000,
  seenLimit: 2000,
  rateLimitMinDelayMs: 5000,
};

class WatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WatchError';
  }
}

/** Exponential backoff with +/-25% jitter, never above maxDelayMs. */
function backoffDelay(attempt, options = {}, random = Math.random) {
  const { initialDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };
  const base = Math.min(maxDelayMs, initialDelayMs * 2 ** attempt);
  return Math.min(maxDelayMs, Math.round(base * (0.75 + random() * 0.5)));
}

/** Error text with the endpoint URL scrubbed out, since it may hold an API key. */
function describeError(error, url) {
  const message = error && error.message ? String(error.message) : 'connection error';
  return message.split(url).join('[endpoint]');
}

/**
 * Subscribe to new transactions that mention each wallet, over one WebSocket.
 *
 * Calls onTransaction({ wallet, signature, slot, failed, err }) once per signature.
 * Calls onStatus({ type, ... }) with type "connecting", "ready", "disconnected",
 * "subscribe-error", "fatal" or "error". Reconnects with backoff until close()
 * is called, except after a "fatal" status (wrong key or URL), where it stops
 * for good. A "disconnected" status has rateLimited: true when the endpoint
 * answered 429. Returns { close }.
 */
function watchWallets(options) {
  const {
    url,
    wallets,
    onTransaction,
    onStatus = () => {},
    WebSocketImpl = require('ws'),
    commitment = 'confirmed',
    random = Math.random,
  } = options;
  const settings = { ...DEFAULT_OPTIONS, ...options };

  if (!Array.isArray(wallets) || wallets.length === 0) {
    throw new WatchError('Expected at least one wallet to watch.');
  }

  let closed = false;
  let socket = null;
  let attempt = 0;
  let nextId = 1;
  let lastError = null;
  let reconnectTimer = null;
  let pingTimer = null;
  const pending = new Map(); // request id -> wallet
  const active = new Map(); // subscription id -> wallet
  const seen = new Set();

  function remember(signature) {
    if (seen.has(signature)) return false;
    seen.add(signature);
    if (seen.size > settings.seenLimit) seen.delete(seen.values().next().value);
    return true;
  }

  function stopPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function startPing(ws) {
    stopPing();
    pingTimer = setInterval(() => {
      try {
        ws.ping();
      } catch {
        // the close handler deals with a dead connection
      }
    }, settings.pingIntervalMs);
    if (pingTimer.unref) pingTimer.unref();
  }

  function subscribe(ws, wallet) {
    const id = nextId++;
    pending.set(id, wallet);
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'logsSubscribe',
        params: [{ mentions: [wallet] }, { commitment }],
      })
    );
  }

  function handleMessage(message) {
    if (message.id !== undefined && pending.has(message.id)) {
      const wallet = pending.get(message.id);
      pending.delete(message.id);

      if (message.error) {
        onStatus({
          type: 'subscribe-error',
          wallet,
          message: message.error.message || 'unknown error',
        });
      } else {
        active.set(message.result, wallet);
      }

      if (pending.size === 0 && active.size > 0) {
        attempt = 0;
        onStatus({ type: 'ready', count: active.size });
      }
      return;
    }

    if (message.method === 'logsNotification' && message.params) {
      const result = message.params.result || {};
      const value = result.value;
      if (!value || !value.signature) return;
      if (!remember(value.signature)) return;

      const err = value.err === undefined ? null : value.err;
      onTransaction({
        wallet: active.get(message.params.subscription) || null,
        signature: value.signature,
        slot: result.context && result.context.slot !== undefined ? result.context.slot : null,
        failed: err !== null,
        err,
      });
    }
  }

  function scheduleReconnect(reason, rateLimited) {
    if (closed) return;
    let delay = backoffDelay(attempt, settings, random);
    if (rateLimited) {
      delay = Math.min(settings.maxDelayMs, Math.max(delay, settings.rateLimitMinDelayMs));
    }
    attempt += 1;

    const status = { type: 'disconnected', reason, retryInMs: delay };
    if (rateLimited) status.rateLimited = true;
    onStatus(status);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      try {
        openSocket();
      } catch (error) {
        onStatus({ type: 'error', message: error.message });
      }
    }, delay);
  }

  function openSocket() {
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      throw new WatchError('Could not open a WebSocket connection to the endpoint.');
    }

    socket = ws;
    lastError = null;
    onStatus({ type: 'connecting' });

    ws.on('open', () => {
      if (ws !== socket) return;
      startPing(ws);
      for (const wallet of wallets) subscribe(ws, wallet);
    });

    ws.on('message', (data) => {
      if (ws !== socket) return;
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (message && typeof message === 'object') handleMessage(message);
    });

    ws.on('error', (error) => {
      if (ws !== socket) return;
      lastError = describeError(error, url);
    });

    ws.on('close', () => {
      if (ws !== socket) return;
      socket = null;
      stopPing();
      pending.clear();
      active.clear();

      const info = classifyConnectionError(lastError);
      const reason = info ? info.text : lastError || 'connection closed';
      lastError = null;

      if (info && info.fatal) {
        closed = true;
        onStatus({ type: 'fatal', message: reason });
        return;
      }

      scheduleReconnect(reason, Boolean(info && info.rateLimited));
    });
  }

  function close() {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    stopPing();
    const ws = socket;
    socket = null;
    if (ws) {
      try {
        ws.close();
      } catch {
        // already closed
      }
    }
  }

  openSocket();
  return { close };
}

module.exports = { DEFAULT_OPTIONS, WatchError, backoffDelay, watchWallets };