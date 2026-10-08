'use strict';

const pkg = require('../package.json');
const { AddressError, validateAddress } = require('./address');
const { parseArgs } = require('./args');

const ENV_VAR = 'SOL_TX_WATCH_RPC';

const HELP = `sol-tx-watch v${pkg.version}

Stream a Solana wallet's new transactions to your terminal in plain English.

Usage:
  sol-tx-watch <wallet> [<wallet> ...]

Options:
  -h, --help       Show this help
  -v, --version    Show the version

Environment:
  ${ENV_VAR}   Your own RPC endpoint (recommended; public RPCs
                         rate-limit heavily)

Exit codes:
  0  ok
  1  invalid wallet address
  2  bad usage
`;

/**
 * Run the CLI. Returns an exit code instead of exiting,
 * so it can be tested without spawning a process.
 */
async function run(argv, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;

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

  stdout.write(
    `Checked ${wallets.length} wallet address${wallets.length === 1 ? '' : 'es'}. ` +
      'Live streaming is not built yet; it arrives in the next release.\n'
  );
  return 0;
}

module.exports = { run, HELP, ENV_VAR };