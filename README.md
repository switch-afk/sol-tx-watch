# sol-tx-watch

Stream a Solana wallet's new transactions to your terminal in plain English.

Node 18+. Early release: live streaming and summaries work; JSON output and more filters are coming.

## Usage

```bash
npx sol-tx-watch <wallet> [<wallet> ...]
```

Prints one block for every new transaction that mentions a watched wallet: an event line, then a plain-English summary from [sol-tx-explain](https://github.com/switch-afk/sol-tx-explain).

```
2026-10-09T10:15:30Z  success  <signature>  slot 123456789  wallet Toke...Q5DA
    Likely a swap: sent 25 USDC, received 0.15 SOL via Jupiter Aggregator v6
```

The summary is a guess from balance changes, which is why it says "Likely". See the sol-tx-explain README for its limits.

Transactions go to stdout. Status messages (watching, disconnected, reconnecting, busy) go to stderr, so you can pipe stdout safely. Press Ctrl+C to stop.

- Connects over one WebSocket and subscribes to each wallet.
- Reconnects automatically with exponential backoff and jitter.
- Pings every 30 seconds to keep idle connections alive.
- Prints each signature once, even if it touches two of your wallets.
- Fetches at most 3 summaries at once and retries while a new transaction is not available yet.

### Very busy wallets

A wallet like a DEX router sees dozens of transactions per second. Explaining every one would flood your RPC, so when summaries fall behind, the extra transactions are printed without a summary and you get a notice on stderr. To skip summaries entirely and stream as fast as possible:

```bash
npx sol-tx-watch --no-explain <wallet>
```

## Use your own RPC

Public RPCs rate-limit heavily. Set your own endpoint:

```bash
export SOL_TX_WATCH_RPC="https://your-rpc-endpoint"
```

For streaming, an `https://` URL is converted to `wss://` (same host, path and query). Summaries use the `https://` URL to fetch transactions. If your provider uses a different WebSocket URL, set it directly:

```bash
export SOL_TX_WATCH_WS="wss://your-websocket-endpoint"
```

If only `SOL_TX_WATCH_WS` is set, the fetch URL is derived from it.

Only the hostname is ever printed, never the full URL, so API keys stay out of your terminal output.

## Roadmap

- [x] Wallet address validation
- [x] Live WebSocket stream of new transactions, with reconnects
- [x] Plain-English summary of each transaction
- [ ] `--json`, `--only-failed`, `--min-sol`
- [ ] Rate-limit handling and clear error messages

## Development

```bash
npm test
```

## License

MIT