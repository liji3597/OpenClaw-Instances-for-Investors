---
name: solana-market
description: Query real-time Solana token prices and view ecosystem market overview from CoinGecko.
---

# Solana Market Intelligence

## When to Use

Use this skill when the user wants to:
- Check the current price of a specific token
- Get a market overview of the Solana ecosystem
- Compare token prices
- Understand current market conditions

## Common User Phrases (Chinese & English)

- "SOL 多少钱" / "SOL price" / "how much is SOL"
- "市场行情" / "market overview"
- "今天市场怎么样" / "how's the market today"
- "JUP 价格" / "JUP price"

## Available Scripts

### Get Token Price
```bash
node skills/solana-market/scripts/get-price.js <token_symbol>
```
- `token_symbol`: SOL, JUP, BONK, RAY, USDC, USDT
- Returns: Current USD price from CoinGecko

Example: `node skills/solana-market/scripts/get-price.js SOL`

### Market Overview
```bash
node skills/solana-market/scripts/market-overview.js
```
Returns prices for all major Solana ecosystem tokens (SOL, USDC, USDT, JUP, RAY, BONK).

## Formatting Guidelines
- Format prices as USD: $123.45
- For very small prices (< $0.01): show 6 decimal places
- For large prices (> $1000): use $1.23K format
- Always include the token symbol in the response
- Default to Chinese output; use `--lang en` for English

## Important Notes
- Price data from CoinGecko free API (no API key required)
- Prices cached for 30 seconds to reduce API calls
- Supported tokens: SOL, USDC, USDT, JUP, RAY, BONK
