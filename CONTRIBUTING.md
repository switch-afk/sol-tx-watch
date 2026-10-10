# Contributing

Thanks for helping out. This is a small zero-fuss CLI, so the process is short.

## Setup

You need Node 18 or newer.

```bash
git clone https://github.com/switch-afk/sol-tx-watch.git
cd sol-tx-watch
npm install
npm test
```

Tests use the built-in `node --test` runner. They never touch the network: the WebSocket and the summaries are replaced with fakes, so they run offline.

## Trying it against a real wallet

Set your own RPC endpoint first. Public RPCs rate-limit heavily.

```bash
export SOL_TX_WATCH_RPC="https://your-rpc-endpoint"
node bin/sol-tx-watch.js <wallet>
```

Never paste an RPC URL with a key into an issue or a pull request. The tool only prints the hostname for this reason, so keep it that way.

## Making a change

1. Open an issue first for anything bigger than a small fix, so we agree on the idea.
2. Create a branch from `main`.
3. Keep the change focused: one feature or fix per pull request.
4. Add or update tests. New behavior without a test will be asked for one.
5. Update the README if the behavior or an option changes, and add a line under the next version in `CHANGELOG.md`.
6. Open the pull request and wait for the Tests check to pass on Node 18, 20 and 22.

## Code style

- Plain CommonJS, no build step, and no new dependencies unless there is a strong reason.
- Error messages are written for people. Say what went wrong and what to do about it.
- Error messages and logs must never include the full endpoint URL.

## Reporting a bug

Please include your Node version, the command you ran (with the endpoint hostname only), and the status messages from stderr.