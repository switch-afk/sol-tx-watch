# sol-tx-watch

Stream a Solana wallet's new transactions to your terminal in plain English.

Node 18+. Early scaffold: live streaming is coming in the next releases.

## Usage

```bash
npx sol-tx-watch <wallet> [<wallet> ...]
```

Today this checks that each wallet address is valid (base58, 32 bytes) and nothing more.

## Use your own RPC

Public RPCs rate-limit heavily, and live streaming needs a WebSocket connection. Set your own endpoint:

```bash
export SOL_TX_WATCH_RPC="https://your-rpc-endpoint"
```

## Roadmap

- [x] Wallet address validation
- [ ] Live WebSocket stream of new transactions, with reconnects
- [ ] Plain-English summary of each transaction (via [sol-tx-explain](https://github.com/switch-afk/sol-tx-explain))
- [ ] `--json`, `--only-failed`, `--min-sol` and several wallets at once
- [ ] Rate-limit handling and clear error messages

## Development

```bash
npm test
```

## License

MIT