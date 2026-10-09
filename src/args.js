'use strict';

/**
 * Split command-line arguments into flags and wallet addresses.
 * Only the first unknown flag and the first missing value are reported.
 */
function parseArgs(argv) {
  const result = {
    help: false,
    version: false,
    explain: true,
    json: false,
    onlyFailed: false,
    minSol: null,
    missingValue: null,
    unknown: null,
    addresses: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      result.help = true;
    } else if (arg === '-v' || arg === '--version') {
      result.version = true;
    } else if (arg === '--no-explain') {
      result.explain = false;
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--only-failed') {
      result.onlyFailed = true;
    } else if (arg === '--min-sol') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        if (result.missingValue === null) result.missingValue = '--min-sol';
      } else {
        result.minSol = value;
        i += 1;
      }
    } else if (arg.startsWith('--min-sol=')) {
      result.minSol = arg.slice('--min-sol='.length);
    } else if (arg.startsWith('-')) {
      if (result.unknown === null) result.unknown = arg;
    } else {
      result.addresses.push(arg);
    }
  }

  return result;
}

module.exports = { parseArgs };