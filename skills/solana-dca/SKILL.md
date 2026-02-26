---
name: solana-dca
description: Create and manage Dollar-Cost Averaging (DCA) strategies for Solana tokens — automated periodic purchases via Jupiter DEX.
---

# Solana DCA Strategy Engine

## When to Use

Use this skill when the user wants to:
- Set up recurring token purchases (DCA / 定投)
- View their active strategies
- Pause or resume a strategy
- Understand DCA concepts

## Common User Phrases (Chinese & English)

- "定投 SOL" / "DCA into SOL"
- "每周买 100 USDC 的 SOL" / "buy $100 SOL weekly"
- "自动购买" / "auto buy"
- "查看策略" / "show strategies"
- "暂停定投" / "pause DCA"

## Available Scripts

### Create DCA Strategy
```bash
node skills/solana-dca/scripts/create-dca.js <telegram_user_id> <target_token> <amount_usdc> <schedule>
```
- `target_token`: SOL, JUP, BONK, RAY, etc.
- `amount_usdc`: Amount in USDC per execution (e.g., 50, 100)
- `schedule`: `daily`, `weekly`, `monthly`, `6hours`

Example: `node skills/solana-dca/scripts/create-dca.js 12345 SOL 100 weekly`

### List Strategies
```bash
node skills/solana-dca/scripts/list-strategies.js <telegram_user_id>
```

### Pause Strategy
```bash
node skills/solana-dca/scripts/pause-strategy.js <telegram_user_id> <strategy_id>
```

### Resume Strategy
```bash
node skills/solana-dca/scripts/resume-strategy.js <telegram_user_id> <strategy_id>
```

## Interactive Flow

When the user says they want to set up DCA but doesn't provide all parameters, ask them step by step:

1. **Which token?** (e.g., SOL, JUP, BONK)
2. **How much USDC per purchase?** (e.g., 50, 100, 200)
3. **How often?** (daily / weekly / monthly / every 6 hours)
4. **Confirm** the details before creating

## Important Notes
- MVP uses Jupiter swap quotes (simulated execution, no real swaps without private key)
- Strategies persist in SQLite and survive restarts
- Schedules use UTC timezone
