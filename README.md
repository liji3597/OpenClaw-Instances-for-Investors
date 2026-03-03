<p align="center">
  <h1 align="center">🦅 OpenClaw Investor Suite</h1>
  <p align="center">
    <strong>Solana 投资助手 Skills for OpenClaw</strong>
  </p>
  <p align="center">
    <a href="#-english">English</a> · <a href="#-中文">中文</a>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/openclaw-investor-suite"><img src="https://img.shields.io/npm/v/openclaw-investor-suite?color=CB3837&logo=npm" alt="npm"></a>
    <img src="https://img.shields.io/badge/OpenClaw-Skills-FF6B35" alt="OpenClaw">
    <img src="https://img.shields.io/badge/Solana-Devnet%20%7C%20Mainnet-9945FF?logo=solana" alt="Solana">
    <img src="https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram" alt="Telegram">
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT">
  </p>
</p>

---

# 🇬🇧 English

## What is this?

**OpenClaw Investor Suite** is a set of **OpenClaw Skills** that turn your OpenClaw agent into an AI-powered Solana investment assistant. Just drop these skills into your OpenClaw workspace — no separate server or deployment needed.

Your users chat with OpenClaw via **Telegram**, the LLM understands their intent, and automatically invokes the right skill to manage portfolios, execute DCA strategies, set price alerts, or check market data.

```
User (Telegram) → OpenClaw (LLM) → Our Skills → Solana blockchain
```

## Skills Included

| Skill | Description | Scripts |
|-------|-------------|---------|
| 🦅 **solana-investor** | Top-level orchestrator — coordinates multi-skill requests | *(no scripts — pure prompt)* |
| 💼 **solana-portfolio** | Multi-wallet portfolio tracking & asset distribution | `get-portfolio`, `add-wallet`, `list-wallets`, `remove-wallet` |
| 📈 **solana-dca** | Dollar-Cost Averaging strategy engine | `create-dca`, `list-strategies`, `pause-strategy`, `resume-strategy` |
| 🔔 **solana-alerts** | Price alert monitoring & notifications | `create-alert`, `list-alerts`, `delete-alert`, `check-prices` |
| 💲 **solana-market** | Token price queries & ecosystem overview | `get-price`, `market-overview` |

## Project Structure

```
├── AGENTS.md                           # Agent personality & behavior rules
├── .env.example                        # Environment variables template
├── package.json                        # npm dependencies
├── shared/                             # Shared modules (7 files)
│   ├── config.js                       # Environment config & token registry
│   ├── database.js                     # SQLite (users, wallets, alerts, strategies)
│   ├── solana-connection.js            # Solana RPC with retry logic
│   ├── wallet.js                       # Balance queries & multi-wallet aggregation
│   ├── price-service.js                # CoinGecko price API with caching
│   ├── tracker.js                      # Portfolio valuation engine
│   └── formatter.js                    # Bilingual output formatting (中文/EN)
└── skills/                             # OpenClaw Skills (prompt-centric)
    ├── solana-investor/                # 🦅 Orchestrator (pure prompt, no scripts)
    │   └── SKILL.md
    ├── solana-portfolio/
    │   ├── SKILL.md                    # Workflow + Guardrails + metadata
    │   └── scripts/
    ├── solana-dca/
    │   ├── SKILL.md
    │   └── scripts/
    ├── solana-alerts/
    │   ├── SKILL.md
    │   └── scripts/
    └── solana-market/
        ├── SKILL.md
        └── scripts/
```

## Quick Start

### Prerequisites

- **OpenClaw** installed and configured with Telegram channel ([setup guide](https://openclaw.ai))
- **Node.js** ≥ 20 on the machine running OpenClaw

### Installation

**Option 1: npm (recommended)**

```bash
npm install openclaw-investor-suite
npx openclaw-investor-suite
```

This installs the package and copies all skills into `~/.openclaw/workspace/`.

**Option 2: Git clone**

```bash
cd ~/.openclaw/workspace
git clone https://github.com/jeseli689/OpenClaw-Instances-for-Investors.git .
npm install
```

**Option 3: Custom workspace path**

```bash
npm install openclaw-investor-suite
npx openclaw-investor-suite /your/custom/workspace/path
```

After installation, optionally configure environment:
```bash
cd ~/.openclaw/workspace
cp .env.example .env
nano .env   # Add HELIUS_API_KEY if needed
```

**That's it.** OpenClaw automatically discovers the skills from the `skills/` directory.

### Test it

Open Telegram and chat with your OpenClaw bot:

| You say | What happens |
|---------|-------------|
| "SOL price" | → `solana-market` skill → returns current SOL price |
| "add wallet Abc123..." | → `solana-portfolio` skill → links wallet |
| "show my portfolio" | → `solana-portfolio` skill → displays holdings |
| "DCA 100 USDC into SOL weekly" | → `solana-dca` skill → creates strategy |
| "alert me when SOL hits $200" | → `solana-alerts` skill → creates price alert |

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HELIUS_API_KEY` | Optional | Enhanced Solana RPC ([helius.xyz](https://helius.xyz)) |
| `SOLANA_NETWORK` | Optional | `devnet` (default) or `mainnet-beta` |
| `DEFAULT_SLIPPAGE_BPS` | Optional | DCA slippage tolerance, default 50 (0.5%) |
| `DATABASE_PATH` | Optional | SQLite database path (default: `./data/openclaw.db`) |

> **Note:** `TELEGRAM_BOT_TOKEN` is managed by OpenClaw itself — you don't need to set it here.

## How It Works

### Architecture

```
┌─────────────────────────────────────────┐
│  Telegram                               │
│  User: "每周定投 100 USDC 买 SOL"         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  OpenClaw Gateway                       │
│  • LLM understands intent              │
│  • Selects: solana-dca skill            │
│  • Runs: create-dca.js 12345 SOL 100   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Our Skills (this project)              │
│  • Validates token & parameters         │
│  • Creates DCA strategy in SQLite       │
│  • Returns confirmation message         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Solana Blockchain                      │
│  • Helius RPC for balance queries       │
│  • CoinGecko for price data             │
│  • Jupiter for swap quotes              │
└─────────────────────────────────────────┘
```

### Bilingual Support

All skills support **Chinese (中文)** and **English** output. OpenClaw's LLM detects the user's language automatically. Scripts accept `--lang en` or `--lang zh` flag.

### SKILL.md Format (Prompt-Centric)

Each skill follows the [AgentSkills standard](https://openclaw.ai) with **Workflow** and **Guardrails**:

```yaml
---
name: solana-portfolio
description: Manage Solana portfolios...
version: 1.0.0
metadata:
  openclaw:
    requires: { env: ["SOLANA_NETWORK"], bins: ["node"] }
    emoji: "💼"
---

## When to Use
User wants to view portfolio, add wallet...

## Workflow
### User wants to view portfolio
1. Get Telegram User ID
2. Run `node scripts/get-portfolio.js <user_id>`
3. If no wallets → guide user to add one
4. If success → show results + suggest next action

## Guardrails
- Never recommend buying/selling
- Confirm before write operations
```

OpenClaw injects these into the LLM context. The LLM reads the **Workflow** to decide *how* to act, and follows **Guardrails** for safety.

## Supported Tokens

| Token | Symbol | CoinGecko ID |
|-------|--------|-------------|
| Solana | SOL | solana |
| USD Coin | USDC | usd-coin |
| Tether | USDT | tether |
| Jupiter | JUP | jupiter-exchange-solana |
| Raydium | RAY | raydium |
| Bonk | BONK | bonk |

## Security

- **Non-custodial** — Skills never access or store private keys
- **Read-only** — Only reads public on-chain balances
- **DCA simulation** — MVP uses Jupiter quotes (no real swaps without private key)
- **Local database** — SQLite stored on your server, not exposed externally

## License

MIT

---

# 🇨🇳 中文

## 这是什么？

**OpenClaw Investor Suite** 是一组 **OpenClaw Skills（技能）**，让你的 OpenClaw Agent 变成 Solana AI 投资助手。只需把这些技能文件放入 OpenClaw 的 workspace 目录——不需要单独部署服务器。

用户通过 **Telegram** 和 OpenClaw 对话，LLM 理解意图后自动调用对应的技能：管理投资组合、执行 DCA 定投、设置价格警报或查看市场数据。

```
用户 (Telegram) → OpenClaw (LLM 理解意图) → 我们的 Skills → Solana 链上操作
```

## 包含的技能

| 技能 | 说明 | 脚本 |
|------|------|------|
| 🦅 **solana-investor** | 顶层编排器 — 协调多技能组合请求 | *（纯 Prompt，无脚本）* |
| 💼 **solana-portfolio** | 多钱包投资组合追踪和资产分布 | `get-portfolio`, `add-wallet`, `list-wallets`, `remove-wallet` |
| 📈 **solana-dca** | DCA 定投策略引擎 | `create-dca`, `list-strategies`, `pause-strategy`, `resume-strategy` |
| 🔔 **solana-alerts** | 价格警报监控和通知 | `create-alert`, `list-alerts`, `delete-alert`, `check-prices` |
| 💲 **solana-market** | 代币价格查询和生态概览 | `get-price`, `market-overview` |

## 快速开始

### 前提条件

- **OpenClaw** 已安装并配置好 Telegram 通道（[安装指南](https://openclaw.ai)）
- 运行 OpenClaw 的机器上安装了 **Node.js** ≥ 20

### 安装

**方式一：npm（推荐）**

```bash
npm install openclaw-investor-suite
npx openclaw-investor-suite
```

自动安装并复制所有技能到 `~/.openclaw/workspace/`。

**方式二：Git 克隆**

```bash
cd ~/.openclaw/workspace
git clone https://github.com/jeseli689/OpenClaw-Instances-for-Investors.git .
npm install
```

**方式三：自定义路径**

```bash
npm install openclaw-investor-suite
npx openclaw-investor-suite /你的/workspace/路径
```

安装完成后，可选配置环境变量：
```bash
cd ~/.openclaw/workspace
cp .env.example .env
nano .env   # 填入 HELIUS_API_KEY
```

**搞定。** OpenClaw 会自动发现 `skills/` 目录中的技能。

### 测试

打开 Telegram，和你的 OpenClaw 机器人对话：

| 你说 | 会发生什么 |
|------|----------|
| "SOL 多少钱" | → `solana-market` 技能 → 返回当前 SOL 价格 |
| "添加钱包 Abc123..." | → `solana-portfolio` 技能 → 关联钱包 |
| "显示我的投资组合" | → `solana-portfolio` 技能 → 显示持仓 |
| "每周定投 100 USDC 买 SOL" | → `solana-dca` 技能 → 创建定投策略 |
| "SOL 到 200 通知我" | → `solana-alerts` 技能 → 创建价格警报 |

## 架构

```
┌─────────────────────────────────────────┐
│  Telegram                               │
│  用户: "显示我的投资组合"                   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  OpenClaw Gateway                       │
│  • LLM 理解用户意图                      │
│  • 选择: solana-portfolio 技能            │
│  • 执行: get-portfolio.js <user_id>      │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  我们的 Skills（本项目）                   │
│  • 查询多钱包余额                         │
│  • 聚合代币持仓                           │
│  • 返回格式化的中文消息                     │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Solana 区块链                           │
│  • Helius RPC 查询余额                    │
│  • CoinGecko 获取价格                     │
│  • Jupiter 获取交换报价                    │
└─────────────────────────────────────────┘
```

## 环境变量

| 变量 | 是否必填 | 说明 |
|------|---------|------|
| `HELIUS_API_KEY` | 可选 | 增强 Solana RPC（[helius.xyz](https://helius.xyz) 免费申请） |
| `SOLANA_NETWORK` | 可选 | `devnet`（默认）或 `mainnet-beta` |
| `DEFAULT_SLIPPAGE_BPS` | 可选 | DCA 滑点容差，默认 50（0.5%） |
| `DATABASE_PATH` | 可选 | SQLite 数据库路径 |

> **注意：** Telegram Bot Token 由 OpenClaw 管理，不需要在这里配置。

## 安全说明

- **非托管** — 技能绝不访问或存储私钥
- **只读** — 只读取链上公开余额数据
- **DCA 模拟** — MVP 使用 Jupiter 报价（不实际执行交换）
- **本地数据库** — SQLite 存储在你的服务器上

## 路线图

- [x] 多钱包投资组合追踪
- [x] DCA 定投策略引擎
- [x] 价格警报系统
- [x] CoinGecko 价格数据集成
- [x] 中英文双语支持
- [x] Prompt-Centric SKILL.md（Workflow + Guardrails）
- [x] 多技能编排器（Orchestrator Skill）
- [ ] PnL 盈亏追踪（成本基础、已实现/未实现盈亏）
- [ ] 智能再平衡策略
- [ ] 止损/止盈功能
- [ ] 鲸鱼追踪（大额转账监控）
- [ ] 风险预警（RugCheck 集成）

## 开源协议

MIT License

---

<p align="center">
  <strong>Built with ❤️ for the Solana community</strong>
  <br>
  Powered by <a href="https://openclaw.ai">OpenClaw</a>
</p>
