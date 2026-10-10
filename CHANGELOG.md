# Changelog

## 0.2.0

- Live stream of new transactions over one WebSocket, one subscription per wallet, each signature printed once
- Automatic reconnects with exponential backoff and jitter, plus a 30 second ping to keep idle connections alive
- Plain-English summary of every transaction, using [sol-tx-explain](https://github.com/switch-afk/sol-tx-explain), with at most 3 summaries fetched at once
- `--json` prints one JSON object per line
- `--only-failed` shows only transactions that failed on-chain
- `--min-sol <n>` shows only transactions where a watched wallet moved at least `n` SOL, not counting the fee
- `--no-explain` skips summaries for the fastest, lightest stream
- Busy wallets: when summaries fall behind, extra transactions are printed without one, with a notice on stderr
- Plain-English connection errors instead of raw messages (rate limited, key rejected, host not found, refused, timed out, reset)
- Rate limiting: a 429 waits at least 5 seconds before reconnecting, and a hint to use your own RPC is shown once
- Wrong key or URL (HTTP 401, 403 or 404) now stops with exit code 1 instead of retrying forever
- Only the endpoint hostname is ever printed, so API keys never reach your terminal

## 0.1.0

- Initial scaffold: CLI shell, wallet address validation (base58, 32 bytes), argument parsing, tests and CI
- Live streaming is not built yet