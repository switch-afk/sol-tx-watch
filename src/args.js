'use strict';

/**
 * Split command-line arguments into flags and wallet addresses.
 * Only the first unknown flag is reported.
 */
function parseArgs(argv) {
  const result = { help: false, version: false, unknown: null, addresses: [] };

  for (const arg of argv) {
    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
    } else if (arg.startsWith('-')) {
      if (result.unknown === null) result.unknown = arg;
    } else {
      result.addresses.push(arg);
    }
  }

  return result;
}

module.exports = { parseArgs };