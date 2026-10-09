'use strict';

const pkg = require('../package.json');
const { AddressError, validateAddress } = require('./address');
const { parseArgs } = require('./args');
const { EndpointError, RPC_ENV, WS_ENV, resolveEndpoint } = require('./endpoint');
const { formatDelay, formatEvent, shortAddress } = require('./format');
const { WatchError, watchWallets } = require('./watch');

const HELP = `sol-tx-watch v${pkg.version}

Stream a Solana wallet's new transactions to your terminal in plain English.

Usage:
  sol-tx-watch <wallet> [<wallet> ...]

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Environment:
  ${RPC_ENV}   Your own RPC endpoint (recommended; public RPCs
                         rate-limit heavily). An https:// URL is converted
                         to wss:// for streaming.
  ${WS_ENV}    WebSocket endpoint, if it differs from the RPC URL

Output:
  Transactions go to stdout, status messages go to stderr.
  Press Ctrl+C to stop.

Exit codes:
  0  stopped normally
  1  invalid wallet address or endpoint
  2  bad usage
`;

/** Resolves when the user presses Ctrl+C or the process gets SIGTERM. */
function signalShutdown() {
  return new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
}

function statusPrinter(stderr, endpoint) {
  let wasReady = false;

  return (status) => {
    switch (status.type) {
      case 'ready':
        if (wasReady) {
          stderr.write(`Reconnected to ${endpoint.host}.\n`);
        } else {
          const noun = status.count === 1 ? 'wallet' : 'wallets';
          stderr.write(
            `Watching ${status.count} ${noun} on ${endpoint.host}. Press Ctrl+C to stop.\n`
          );
        }
        wasReady = true;
        break;
      case 'disconnected':
        stderr.write(
          `Disconnected from ${endpoint.host} (${status.reason}). ` +
            `Reconnecting in ${formatDelay(status.retryInMs)}...\n`
        );
        break;
      case 'subscribe-error':
        stderr.write(`Could not subscribe to ${shortAddress(status.wallet)}: ${status.message}\n`);
        break;
      case 'error':
        stderr.write(`${status.message}\n`);
        break;
      default:
        break;
    }
  };
}

/**
 * Run the CLI. Returns an exit code instead of exiting, so it can be tested.
 * Tests pass io.watch and io.shutdown to avoid real sockets and signals.
 */
async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const env = io.env || process.env;

  const args = parseArgs(argv);

  if (args.help) {
    stdout.write(HELP);
    return 0;
  }

  if (args.version) {
    stdout.write(`${pkg.version}\n`);
    return 0;
  }

  if (args.unknown) {
    stderr.write(`Unknown option: ${args.unknown}\n\n${HELP}`);
    return 2;
  }

  if (args.addresses.length === 0) {
    stderr.write(`Expected at least one wallet address.\n\n${HELP}`);
    return 2;
  }

  const wallets = [];
  let failed = false;

  for (const raw of args.addresses) {
    try {
      const address = validateAddress(raw);
      if (!wallets.includes(address)) wallets.push(address);
    } catch (error) {
      if (!(error instanceof AddressError)) throw error;
      stderr.write(`Not a valid wallet address (${raw}): ${error.message}\n`);
      failed = true;
    }
  }

  if (failed) return 1;

  let endpoint;
  try {
    endpoint = resolveEndpoint(env);
  } catch (error) {
    if (!(error instanceof EndpointError)) throw error;
    stderr.write(`${error.message}\n`);
    return 1;
  }

  const watch = io.watch || watchWallets;
  const shutdown = io.shutdown || signalShutdown();

  let handle;
  try {
    handle = watch({
      url: endpoint.url,
      wallets,
      onTransaction: (event) => stdout.write(formatEvent(event)),
      onStatus: statusPrinter(stderr, endpoint),
      ...io.watchOptions,
    });
  } catch (error) {
    if (!(error instanceof WatchError)) throw error;
    stderr.write(`${error.message}\n`);
    return 1;
  }

  await shutdown;
  handle.close();
  stderr.write('Stopped.\n');
  return 0;
}

module.exports = { run, HELP };