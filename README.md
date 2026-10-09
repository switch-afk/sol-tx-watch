# sol-tx-watch

Stream a Solana wallet's new transactions to your terminal in plain English.

Node 18+. Early release: streaming, summaries, JSON output and filters work; rate-limit polish is coming.

## Usage

```bash
npx sol-tx-watch [options] <wallet> [<wallet> ...]
```

Prints one block for every new transaction that mentions a watched wallet: an event line, then a plain-English summary from [sol-tx-explain](https://github.com/switch-afk/sol-tx-explain).

```
2026-10-09T10:15:30Z  success  <signature>  slot 123456789  wallet Toke...Q5DA
    Likely a swap: sent 25 USDC, received 0.15 SOL via Jupiter Aggregator v6
```

The summary is a guess from balance changes, which is why it says "Likely". See the sol-tx-explain README for its limits.

Transactions go to stdout. Status messages (watching, disconnected, reconnecting, busy) go to stderr, so you can pipe stdout safely. Press Ctrl+C to stop.

## Options

| Option | What it does |
| --- | --- |
| `--json` | Print one JSON object per line instead of text |
| `--only-failed` | Show only transactions that failed on-chain |
| `--min-sol <n>` | Show only transactions where a watched wallet gained or lost at least `n` SOL, not counting the fee. Needs summaries. Also accepts `--min-sol=n` |
| `--no-explain` | Skip the plain-English summaries (faster, lighter on your RPC) |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

### JSON output

```bash
npx sol-tx-watch --json <wallet> | jq .
```

Each line is one object: `seenAt`, `signature`, `slot`, `wallet`, `status` (`success` or `failed`), `error` (the raw on-chain error, or `null`), `summary` (the full sol-tx-explain JSON, or `null`) and `summaryNote` (why there is no summary, or `null`). Amounts inside `summary` are strings, so nothing is rounded.

### Filters

`--only-failed` runs before anything is fetched, so it also saves RPC calls. `--min-sol` needs the summary's balance data, so it cannot be combined with `--no-explain`. On a very busy wallet, transactions that could not be checked are not shown, and you get a notice on stderr. A transaction whose summary fails for another reason is still shown, with a "(no summary: ...)" note, so an RPC hiccup does not hide a large transfer.

## How it behaves

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
- [x] `--json`, `--only-failed`, `--min-sol`
- [ ] Rate-limit handling and clear error messages

## Development

```bash
npm test
```

## License

MIT