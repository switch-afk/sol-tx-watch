#!/usr/bin/env node
'use strict';

const { run } = require('../src/cli');

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
    // Requests still waiting on the RPC must not keep the process alive after Ctrl+C.
    setTimeout(() => process.exit(code), 1000).unref();
  })
  .catch((error) => {
    console.error(`Unexpected error: ${error.message}`);
    process.exitCode = 1;
  });