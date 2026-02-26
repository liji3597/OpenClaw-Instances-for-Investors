---
name: solana-portfolio
description: Manage Solana investment portfolios — track multi-wallet balances, token distribution, and asset valuation in USD.
---

# Solana Portfolio Tracker

## When to Use

Use this skill when the user wants to:
- View their investment portfolio, holdings, or asset distribution
- Add or remove a Solana wallet address
- List connected wallets
- Check how much of a specific token they hold
- See total portfolio value in USD

## Common User Phrases (Chinese & English)

- "显示我的投资组合" / "show my portfolio"
- "我持有多少 SOL？" / "how much SOL do I have?"
- "添加钱包" / "add wallet"
- "我的钱包" / "my wallets"
- "资产分布" / "asset distribution"

## Available Scripts

### View Portfolio
```bash
node skills/solana-portfolio/scripts/get-portfolio.js <telegram_user_id>
```
Returns: Total value (USD), token holdings with amounts, prices, percentages, and visual distribution bars.

### Add Wallet
```bash
node skills/solana-portfolio/scripts/add-wallet.js <telegram_user_id> <solana_address>
```
Validates the Solana address and adds it to the user's account. Maximum 5 wallets per user.

### List Wallets
```bash
node skills/solana-portfolio/scripts/list-wallets.js <telegram_user_id>
```
Returns all connected wallet addresses for the user.

### Remove Wallet
```bash
node skills/solana-portfolio/scripts/remove-wallet.js <telegram_user_id> <solana_address>
```
Removes a wallet from the user's account.

## Important Notes
- All scripts use the user's Telegram ID as the primary identifier
- Wallet data is read-only — we never access private keys
- Prices come from CoinGecko (free, no API key needed)
- Results are formatted in Chinese by default; add `--lang en` for English
