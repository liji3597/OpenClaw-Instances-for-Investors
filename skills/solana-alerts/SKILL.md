---
name: solana-alerts
description: Create and manage price alerts for Solana tokens — get notified when prices cross your target thresholds.
---

# Solana Price Alerts

## When to Use

Use this skill when the user wants to:
- Set a price alert for a token (above or below a target)
- View their active alerts
- Delete an alert
- Be notified about price movements

## Common User Phrases (Chinese & English)

- "SOL 突破 200 通知我" / "notify me when SOL hits 200"
- "设置警报" / "set alert"
- "如果 JUP 跌到 1 块" / "if JUP drops to $1"
- "查看我的警报" / "show my alerts"
- "删除警报" / "delete alert"

## Available Scripts

### Create Alert
```bash
node skills/solana-alerts/scripts/create-alert.js <telegram_user_id> <token_symbol> <condition> <target_price>
```
- `token_symbol`: SOL, JUP, BONK, RAY, USDC, USDT
- `condition`: `above` or `below`
- `target_price`: price in USD (e.g., 200, 1.50)

Example: `node skills/solana-alerts/scripts/create-alert.js 12345 SOL above 200`

### List Alerts
```bash
node skills/solana-alerts/scripts/list-alerts.js <telegram_user_id>
```

### Delete Alert
```bash
node skills/solana-alerts/scripts/delete-alert.js <telegram_user_id> <alert_id>
```

### Check Prices (Manual Trigger)
```bash
node skills/solana-alerts/scripts/check-prices.js
```
Checks all active alerts against current prices and outputs any triggered alerts.

## Important Notes
- Maximum 20 alerts per user
- Prices checked via CoinGecko (free API, no key needed)
- Supports both Chinese conditions (高于/低于) and English (above/below)
- Alert monitoring daemon must be running separately for automatic notifications
