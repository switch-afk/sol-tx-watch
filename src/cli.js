'use strict';

const pkg = require('../package.json');
const { AddressError, validateAddress } = require('./address');
const { parseArgs } = require('./args');
const { EndpointError, RPC_ENV, WS_ENV, resolveEndpoint } = require('./endpoint');
const { isRateLimitText } = require('./errors');
const { createExplainer } = require('./explainer');
const { AmountError, parseSolAmount, passesMinSol } = require('./filters');
const { formatBlock, formatDelay, formatJson, shortAddress } = require('./format');
const { WatchError, watchWallets } = require('./watch');

const HELP = `sol-tx-watch v${pkg.version}

Stream a Solana wallet's new transactions to your terminal in plain English.

Usage:
  sol-tx-watch [options] <wallet> [<wallet> ...]

Options:
  --json           Print one JSON object per line instead of text
  --only-failed    Show only transactions that failed on-chain
  --min-sol <n>    Show only transactions where a watched wallet gained or
                   lost at least n SOL, not counting the fee (needs summaries)
  --no-explain     Skip the plain-English summaries (faster, lighter on your RPC)
  -h, --help       Show this help
  -v, --version    Show the version

Environment:
  ${RPC_ENV}   Your own RPC endpoint (recommended; public RPCs
                         rate-limit heavily). An https:// URL is converted
                         to wss:// for streaming.
  ${WS_ENV}    WebSocket endpoint, if it differs from the RPC URL

Output:
  Transactions go to stdout, status messages go to stderr.
  Very busy wallets are too much to explain one by one; some transactions
  are then shown without a summary. Press Ctrl+C to stop.

Exit codes:
  0  stopped normally
  1  invalid wallet address or endpoint, or the endpoint refused the connection
  2  bad usage
`;

const BUSY_FIRST =
  'Busy: some transactions are shown without a summary because too many arrive at once. ' +
  'Use --no-explain to turn summaries off.\n';

const BUSY_FIRST_FILTER =
  'Busy: some transactions could not be checked against --min-sol because too many arrive ' +
  'at once, so they are not shown.\n';

/** Resolves when the user presses Ctrl+C or the process gets SIGTERM. */
function signalShutdown() {
  return new Promise((resolve) => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
}

function statusPrinter(stderr, endpoint, hooks) {
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
        if (status.rateLimited) hooks.onRateLimit();
        break;
      case 'subscribe-error':
        stderr.write(`Could not subscribe to ${shortAddress(status.wallet)}: ${status.message}\n`);
        if (isRateLimitText(status.message)) hooks.onRateLimit();
        break;
      case 'fatal':
        stderr.write(`Cannot connect to ${endpoint.host}: ${status.message}\n`);
        hooks.onFatal();
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
 * Tests pass io.watch, io.explainer and io.shutdown to avoid sockets, the
 * network and signals.
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

  if (args.missingValue) {
    stderr.write(`${args.missingValue} needs a value, for example ${args.missingValue} 0.5\n`);
    return 2;
  }

  if (args.addresses.length === 0) {
    stderr.write(`Expected at least one wallet address.\n\n${HELP}`);
    return 2;
  }

  let minLamports = null;
  if (args.minSol !== null) {
    try {
      minLamports = parseSolAmount(args.minSol);
    } catch (error) {
      if (!(error instanceof AmountError)) throw error;
      stderr.write(`${error.message}\n`);
      return 2;
    }
    if (!args.explain) {
      stderr.write('--min-sol needs summaries, so it cannot be combined with --no-explain.\n');
      return 2;
    }
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

  const explainer = args.explain
    ? io.explainer || createExplainer({ rpcUrl: endpoint.rpcUrl, ...io.explainOptions })
    : null;

  const usingPublicRpc = !env[RPC_ENV] && !env[WS_ENV];

  let stopped = false;
  let skipped = 0;
  let rateLimitHintShown = false;

  // Shown once per run, however many times the endpoint throttles us.
  const showRateLimitHint = () => {
    if (rateLimitHintShown) return;
    rateLimitHintShown = true;
    if (usingPublicRpc) {
      stderr.write(
        `The public RPC rate-limits heavily. Set ${RPC_ENV} to your own endpoint to avoid this.\n`
      );
    } else {
      const extra = args.explain ? ', or use --no-explain to send fewer requests' : '';
      stderr.write(
        `Your RPC endpoint is rate limiting requests. Wait a moment, check your plan's limits${extra}.\n`
      );
    }
  };

  let fatal = false;
  let resolveFatal;
  const fatalSignal = new Promise((resolve) => {
    resolveFatal = resolve;
  });

  const emit = (event, outcome, seenAt) => {
    stdout.write(args.json ? formatJson(event, outcome, seenAt) : formatBlock(event, outcome, seenAt));
  };

  const onTransaction = (event) => {
    if (args.onlyFailed && !event.failed) return;

    const seenAt = new Date();

    if (!explainer) {
      emit(event, null, seenAt);
      return;
    }

    explainer
      .explain(event.signature)
      .then((outcome) => {
        if (stopped) return;

        if (outcome.rateLimited) showRateLimitHint();

        if (outcome.skipped) {
          skipped += 1;
          if (skipped === 1) {
            stderr.write(minLamports === null ? BUSY_FIRST : BUSY_FIRST_FILTER);
          } else if (skipped % 100 === 0) {
            const what =
              minLamports === null ? 'shown without a summary' : 'could not be checked against --min-sol';
            stderr.write(`Busy: ${skipped} transactions ${what} so far.\n`);
          }
          // With --min-sol an unchecked transaction cannot be judged, so it is not shown.
          if (minLamports !== null) return;
        } else if (minLamports !== null && outcome.ok && !passesMinSol(outcome.json, wallets, minLamports)) {
          return;
        }

        emit(event, outcome, seenAt);
      })
      .catch(() => {
        if (stopped) return;
        const outcome = { ok: false, skipped: false, reason: 'could not summarize this transaction' };
        emit(event, outcome, seenAt);
      });
  };

  const watch = io.watch || watchWallets;
  const shutdown = io.shutdown || signalShutdown();

  let handle;
  try {
    handle = watch({
      url: endpoint.url,
      wallets,
      onTransaction,
      onStatus: statusPrinter(stderr, endpoint, {
        onRateLimit: showRateLimitHint,
        onFatal: () => {
          fatal = true;
          resolveFatal();
        },
      }),
      ...io.watchOptions,
    });
  } catch (error) {
    if (!(error instanceof WatchError)) throw error;
    stderr.write(`${error.message}\n`);
    return 1;
  }

  await Promise.race([shutdown, fatalSignal]);
  stopped = true;
  handle.close();
  if (explainer && explainer.stop) explainer.stop();

  if (fatal) return 1;

  stderr.write('Stopped.\n');
  return 0;
}

module.exports = { run, HELP };