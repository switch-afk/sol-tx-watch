# sol-tx-watch

Stream a Solana wallet's new transactions to your terminal in plain English.

Node 18+. Early release: live streaming works, plain-English summaries are coming next.

## Usage

```bash
npx sol-tx-watch <wallet> [<wallet> ...]
```

Prints one line for every new transaction that mentions a watched wallet:

```
2026-10-09T10:15:30Z  success  <signature>  slot 123456789  wallet Toke...Q5DA
2026-10-09T10:15:31Z  FAILED   <signature>  slot 123456790  wallet Toke...Q5DA
```

Transactions go to stdout. Status messages (watching, disconnected, reconnecting) go to stderr, so you can pipe stdout safely. Press Ctrl+C to stop.

- Connects over one WebSocket and subscribes to each wallet.
- Reconnects automatically with exponential backoff and jitter.
- Pings every 30 seconds to keep idle connections alive.
- Prints each signature once, even if it touches two of your wallets.

## Use your own RPC

Public RPCs rate-limit heavily. Set your own endpoint:

```bash
export SOL_TX_WATCH_RPC="https://your-rpc-endpoint"
```

For streaming, an `https://` URL is converted to `wss://` (same host, path and query). If your provider uses a different WebSocket URL, set it directly:

```bash
export SOL_TX_WATCH_WS="wss://your-websocket-endpoint"
```

Only the hostname is ever printed, never the full URL, so API keys stay out of your terminal output.

## Roadmap

- [x] Wallet address validation
- [x] Live WebSocket stream of new transactions, with reconnects
- [ ] Plain-English summary of each transaction (via [sol-tx-explain](https://github.com/switch-afk/sol-tx-explain))
- [ ] `--json`, `--only-failed`, `--min-sol`
- [ ] Rate-limit handling and clear error messages

## Development

```bash
npm test
```

## License

MIT