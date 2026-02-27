<p align="center">
  <h1 align="center">🦅 OpenClaw Investor Suite</h1>
  <p align="center">
    <strong>AI-Powered Investment Assistant for Solana</strong>
  </p>
  <p align="center">
    <a href="#-english">English</a> · <a href="#-中文">中文</a>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/Solana-Devnet%20%7C%20Mainnet-9945FF?logo=solana" alt="Solana">
    <img src="https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram" alt="Telegram">
    <img src="https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js" alt="Node.js">
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT">
  </p>
</p>

---

# 🇬🇧 English

## Overview

**OpenClaw Investor Suite** is a managed AI investment assistant built for non-technical cryptocurrency investors on the **Solana** blockchain. It provides zero-barrier portfolio management, automated DCA strategies, price alerts, and market intelligence — all through a conversational **Telegram bot** interface.

### Why OpenClaw Investor Suite?

| Problem | Our Solution |
|---------|-------------|
| Portfolio scattered across 15+ tokens and multiple wallets | **Multi-wallet aggregation** — unified view of all holdings |
| Manual monitoring takes 2+ hours daily | **Automated alerts & strategies** — 24/7 monitoring in the background |
| Complex DeFi tools require technical knowledge | **Natural language interface** — just chat with the bot in English or Chinese |
| Fear of missing market movements | **Real-time price alerts** — instant Telegram notifications when conditions are met |
| Emotional trading and inconsistency | **Automated DCA** — systematic investing removes emotion from the equation |

## Features

### 💼 Portfolio Management
- **Multi-wallet tracking** — Connect up to 5 Solana wallets (Phantom, Solflare, Backpack, etc.)
- **Real-time valuation** — Instant portfolio value in USD with token distribution breakdown
- **Visual charts** — Text-based distribution bars showing asset allocation percentages
- **SOL + SPL tokens** — Tracks native SOL and all SPL token balances

### 📈 Automated DCA (Dollar-Cost Averaging)
- **Interactive setup wizard** — 4-step guided flow: Token → Amount → Schedule → Confirm
- **Flexible scheduling** — Daily, weekly, monthly, or every 6 hours
- **Jupiter DEX integration** — Optimal swap routing with configurable slippage protection
- **Execution tracking** — Records every DCA execution with amounts, prices, and cumulative stats

### 🔔 Price Alerts
- **Custom conditions** — Set alerts for token prices going above or below your target
- **Automatic monitoring** — Background polling checks prices every 60 seconds (configurable)
- **Instant notifications** — Telegram push notifications when alerts trigger
- **Multi-token support** — Monitor SOL, JUP, BONK, RAY, USDC, USDT, and any Solana token

### 💲 Market Intelligence
- **Price queries** — Check any token's current price instantly
- **Ecosystem overview** — See all major Solana token prices at a glance
- **CoinGecko data** — Reliable price data from CoinGecko (free, no API key required)

### 🌐 Bilingual Support
- **Chinese (中文)** and **English** — Full interface in both languages
- **Natural language processing** — Understand commands like "显示我的投资组合" or "SOL price"
- **Language switching** — `/lang zh` or `/lang en` to switch anytime

## Architecture

The project follows an **OpenClaw Gateway Skills** architecture — each capability is a standalone Skill invoked by the AI Agent via CLI scripts.

```
AGENTS.md                         # AI Agent persona & role definition
skills/
├── solana-portfolio/              # Portfolio management skill
│   ├── SKILL.md                  # Skill definition & usage guide
│   └── scripts/
│       ├── get-portfolio.js      # View portfolio summary
│       ├── add-wallet.js         # Add a Solana wallet
│       ├── list-wallets.js       # List connected wallets
│       └── remove-wallet.js      # Remove a wallet
├── solana-dca/                    # DCA strategy skill
│   ├── SKILL.md
│   └── scripts/
│       ├── create-dca.js         # Create DCA strategy
│       ├── list-strategies.js    # List strategies
│       ├── pause-strategy.js     # Pause a strategy
│       └── resume-strategy.js    # Resume a strategy
├── solana-alerts/                 # Price alert skill
│   ├── SKILL.md
│   └── scripts/
│       ├── create-alert.js       # Create price alert
│       ├── list-alerts.js        # List active alerts
│       ├── delete-alert.js       # Delete an alert
│       └── check-prices.js       # Check all alerts against prices
└── solana-market/                 # Market intelligence skill
    ├── SKILL.md
    └── scripts/
        ├── get-price.js          # Get token price
        └── market-overview.js    # Ecosystem price overview
shared/
├── config.js                     # Environment configuration & token registry
├── database.js                   # SQLite database (5 tables, full CRUD)
├── solana-connection.js          # Solana RPC with exponential backoff retry
├── wallet.js                     # Balance queries & multi-wallet aggregation
├── price-service.js              # CoinGecko prices & Jupiter swap quotes
├── tracker.js                    # Holdings aggregation & USD valuation
└── formatter.js                  # Bilingual message formatting
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Runtime** | Node.js ≥ 20 | Server-side JavaScript |
| **Blockchain** | @solana/web3.js | Solana RPC interaction |
| **Bot Framework** | node-telegram-bot-api | Telegram bot interface |
| **Price Data** | CoinGecko API (free) | Token price queries |
| **Swap Routing** | Jupiter Aggregator | DEX swap quotes |
| **Database** | better-sqlite3 (SQLite) | User data, strategies, alerts |
| **Scheduling** | node-cron | DCA strategy execution |
| **RPC Provider** | Helius (optional) | Enhanced Solana RPC |

### Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Telegram user profiles, language preference, risk profile |
| `wallets` | Linked Solana wallet addresses (up to 5 per user) |
| `price_alerts` | User-defined price alert conditions |
| `dca_strategies` | DCA configuration (token, amount, schedule, status) |
| `transactions` | Execution history and audit log |

## Quick Start

### Prerequisites

- **Node.js** ≥ 20 ([download](https://nodejs.org/))
- **Telegram Bot Token** — Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
- **Helius API Key** (optional) — Free tier at [helius.xyz](https://helius.xyz) for enhanced RPC

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/openclaw-investor-suite.git
cd openclaw-investor-suite

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
```

### Configuration

Edit `.env` with your credentials:

```env
# Required: Telegram Bot Token (from @BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Solana network: devnet (testing) or mainnet-beta (production)
SOLANA_NETWORK=devnet

# Optional: Helius RPC for better performance (free at helius.xyz)
HELIUS_API_KEY=your_helius_key_here

# Price check interval for alerts (seconds)
PRICE_CHECK_INTERVAL=60
```

### Run Skills

Skills are invoked as standalone CLI scripts by the AI Agent (or manually for testing):

```bash
# Example: Check a token price
node skills/solana-market/scripts/get-price.js SOL

# Example: View portfolio for user 12345
node skills/solana-portfolio/scripts/get-portfolio.js 12345

# Example: Create a DCA strategy
node skills/solana-dca/scripts/create-dca.js 12345 SOL 100 weekly

# Example: Set a price alert
node skills/solana-alerts/scripts/create-alert.js 12345 SOL above 200
```

You should see output like:

```
✅ Database initialized
💲 *SOL* 当前价格 / Current Price: $142.35
```

## Bot Commands

### Portfolio

| Command | Description |
|---------|-------------|
| `/start` | Welcome message & feature overview |
| `/help` | Full command reference |
| `/addwallet <address>` | Add a Solana wallet (max 5) |
| `/removewallet <address>` | Remove a wallet |
| `/wallets` | List all connected wallets |
| `/portfolio` | View portfolio summary with distribution chart |

### Market

| Command | Description |
|---------|-------------|
| `/price <token>` | Check current token price (e.g., `/price SOL`) |
| `/market` | Solana ecosystem price overview |

### DCA Strategies

| Command | Description |
|---------|-------------|
| `/dca` | Start interactive DCA setup wizard |
| `/strategies` | List all your strategies |
| `/pause <id>` | Pause a running strategy |
| `/resume <id>` | Resume a paused strategy |

### Alerts

| Command | Description |
|---------|-------------|
| `/alert <token> <above\|below> <price>` | Create price alert (e.g., `/alert SOL above 200`) |
| `/alerts` | List all active alerts |
| `/deletealert <id>` | Delete an alert |

### Settings

| Command | Description |
|---------|-------------|
| `/lang zh` | Switch to Chinese |
| `/lang en` | Switch to English |

### Natural Language (No Slash Required)

The bot also understands natural language in both Chinese and English:

| You say | Bot understands |
|---------|----------------|
| "显示我的投资组合" | → Portfolio view |
| "SOL价格" / "SOL price" | → Price query |
| "定投" / "DCA" | → DCA setup wizard |
| "帮助" / "help" | → Help menu |
| "市场" / "market" | → Market overview |

## Deployment

### Option 1: VPS / Cloud Server (Recommended)

Deploy on DigitalOcean, AWS, or any Linux VPS:

```bash
# On your server
git clone https://github.com/your-username/openclaw-investor-suite.git
cd openclaw-investor-suite
npm install --production
cp .env.example .env
nano .env  # Configure your tokens

# Skills are invoked by the OpenClaw Gateway AI Agent
# Test a skill manually:
node skills/solana-market/scripts/get-price.js SOL
```

### Option 3: Local Development

```bash
npm run dev  # Auto-restarts on file changes
```

## Security

- **Non-custodial** — The bot never stores or accesses your private keys
- **Read-only wallet access** — Only reads public on-chain balances
- **DCA simulation** — MVP uses Jupiter quotes (no actual swaps without user's private key)
- **User confirmation** — All sensitive operations require explicit user approval
- **SQLite encryption** — Database stored locally, not exposed to the internet

## Supported Tokens

| Token | Symbol | Mint Address |
|-------|--------|-------------|
| Solana | SOL | `So111...1112` |
| USD Coin | USDC | `EPjFW...Dt1v` |
| Tether | USDT | `Es9vM...wNYB` |
| Jupiter | JUP | `JUPyi...vCN` |
| Raydium | RAY | `4k3Dy...X6R` |
| Bonk | BONK | `DezXA...B263` |

Additional tokens can be tracked by connecting wallets that hold them.

## License

MIT License — see [LICENSE](LICENSE) for details.

---

# 🇨🇳 中文

## 项目概述

**OpenClaw Investor Suite** 是一个专为非技术加密货币投资者设计的 **AI 投资助手**，基于 **Solana** 区块链构建。通过 **Telegram 机器人** 的对话式界面，提供零门槛的投资组合管理、自动化 DCA 定投策略、价格警报和市场情报服务。

### 为什么选择 OpenClaw Investor Suite？

| 痛点 | 我们的解决方案 |
|------|--------------|
| 投资组合分散在 15+ 个代币和多个钱包中 | **多钱包聚合** — 一个界面查看所有持仓 |
| 每天手动监控需要 2+ 小时 | **自动化警报和策略** — 7×24 小时后台监控 |
| 复杂的 DeFi 工具需要技术知识 | **自然语言交互** — 用中文或英文和机器人聊天即可 |
| 担心错过市场波动 | **实时价格警报** — 条件满足时即时 Telegram 通知 |
| 情绪化交易导致亏损 | **自动化 DCA 定投** — 系统化投资消除情绪干扰 |

## 核心功能

### 💼 投资组合管理
- **多钱包追踪** — 最多连接 5 个 Solana 钱包（Phantom、Solflare、Backpack 等）
- **实时估值** — 以 USD 显示投资组合总价值和代币分布
- **可视化图表** — 文本分布条显示资产配置百分比
- **SOL + SPL 代币** — 追踪原生 SOL 和所有 SPL 代币余额

### 📈 自动化 DCA 定投
- **交互式设置向导** — 4 步引导：选代币 → 设金额 → 选频率 → 确认
- **灵活调度** — 每天、每周、每月或每 6 小时
- **Jupiter DEX 集成** — 最优交换路由，可配置滑点保护
- **执行追踪** — 记录每次 DCA 执行的金额、价格和累计统计

### 🔔 价格警报
- **自定义条件** — 设置代币价格高于或低于目标值时的警报
- **自动监控** — 后台每 60 秒检查一次价格（可配置）
- **即时通知** — 警报触发时通过 Telegram 推送通知
- **多代币支持** — 监控 SOL、JUP、BONK、RAY、USDC、USDT 及任何 Solana 代币

### 💲 市场情报
- **价格查询** — 即时查看任何代币的当前价格
- **生态概览** — 一览所有主要 Solana 代币价格
- **CoinGecko 数据** — 来自 CoinGecko 的可靠价格数据（免费，无需 API Key）

### 🌐 双语支持
- **中文** 和 **英文** — 完整的双语界面
- **自然语言处理** — 理解"显示我的投资组合"或"SOL price"等指令
- **语言切换** — `/lang zh` 或 `/lang en` 随时切换

## 项目架构

项目采用 **OpenClaw Gateway Skills** 架构 — 每个功能是一个独立的 Skill，由 AI Agent 通过 CLI 脚本调用。

```
AGENTS.md                         # AI Agent 人格与角色定义
skills/
├── solana-portfolio/              # 投资组合管理技能
│   ├── SKILL.md                  # 技能定义与使用指南
│   └── scripts/
│       ├── get-portfolio.js      # 查看投资组合
│       ├── add-wallet.js         # 添加钱包
│       ├── list-wallets.js       # 查看钱包列表
│       └── remove-wallet.js      # 移除钱包
├── solana-dca/                    # DCA 定投技能
│   ├── SKILL.md
│   └── scripts/
│       ├── create-dca.js         # 创建定投策略
│       ├── list-strategies.js    # 查看策略列表
│       ├── pause-strategy.js     # 暂停策略
│       └── resume-strategy.js    # 恢复策略
├── solana-alerts/                 # 价格警报技能
│   ├── SKILL.md
│   └── scripts/
│       ├── create-alert.js       # 创建警报
│       ├── list-alerts.js        # 查看警报
│       ├── delete-alert.js       # 删除警报
│       └── check-prices.js       # 检查所有警报
└── solana-market/                 # 市场情报技能
    ├── SKILL.md
    └── scripts/
        ├── get-price.js          # 查询代币价格
        └── market-overview.js    # 生态市场概览
shared/
├── config.js                     # 环境配置与代币注册表
├── database.js                   # SQLite 数据库（5 张表，完整 CRUD）
├── solana-connection.js          # Solana RPC 连接（指数退避重试）
├── wallet.js                     # 余额查询与多钱包聚合
├── price-service.js              # CoinGecko 价格与 Jupiter 交换报价
├── tracker.js                    # 持仓聚合与 USD 估值
└── formatter.js                  # 双语消息格式化
```

### 技术栈

| 组件 | 技术 | 用途 |
|------|-----|------|
| **运行时** | Node.js ≥ 20 | 服务端 JavaScript |
| **区块链** | @solana/web3.js | Solana RPC 交互 |
| **Bot 框架** | node-telegram-bot-api | Telegram 机器人 |
| **价格数据** | CoinGecko API（免费） | 代币价格查询 |
| **交换路由** | Jupiter Aggregator | DEX 交换报价 |
| **数据库** | better-sqlite3 (SQLite) | 用户数据、策略、警报 |
| **调度器** | node-cron | DCA 策略执行 |
| **RPC 提供商** | Helius（可选） | 增强 Solana RPC |

### 数据库表结构

| 表名 | 用途 |
|------|------|
| `users` | Telegram 用户资料、语言偏好、风险等级 |
| `wallets` | 关联的 Solana 钱包地址（每用户最多 5 个） |
| `price_alerts` | 用户定义的价格警报条件 |
| `dca_strategies` | DCA 配置（代币、金额、频率、状态） |
| `transactions` | 执行历史和审计日志 |

## 快速开始

### 环境要求

- **Node.js** ≥ 20（[下载](https://nodejs.org/)）
- **Telegram Bot Token** — 通过 [@BotFather](https://t.me/BotFather) 在 Telegram 创建机器人
- **Helius API Key**（可选）— 在 [helius.xyz](https://helius.xyz) 免费申请，获得更好的 RPC 性能

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/your-username/openclaw-investor-suite.git
cd openclaw-investor-suite

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
```

### 配置说明

编辑 `.env` 文件：

```env
# 必填：Telegram Bot Token（从 @BotFather 获取）
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Solana 网络：devnet（测试）或 mainnet-beta（正式）
SOLANA_NETWORK=devnet

# 可选：Helius RPC（在 helius.xyz 免费申请，提升性能）
HELIUS_API_KEY=your_helius_key_here

# 价格警报检查间隔（秒）
PRICE_CHECK_INTERVAL=60
```

### 运行技能

技能由 AI Agent（OpenClaw Gateway）以 CLI 脚本方式调用，也可手动测试：

```bash
# 示例：查询代币价格
node skills/solana-market/scripts/get-price.js SOL

# 示例：查看用户 12345 的投资组合
node skills/solana-portfolio/scripts/get-portfolio.js 12345

# 示例：创建 DCA 定投策略
node skills/solana-dca/scripts/create-dca.js 12345 SOL 100 weekly

# 示例：设置价格警报
node skills/solana-alerts/scripts/create-alert.js 12345 SOL above 200
```

运行后会看到类似输出：

```
✅ Database initialized
💲 *SOL* 当前价格 / Current Price: $142.35
```

## 机器人命令

### 投资组合

| 命令 | 说明 |
|------|------|
| `/start` | 欢迎消息和功能介绍 |
| `/help` | 完整命令参考 |
| `/addwallet <地址>` | 添加 Solana 钱包（最多 5 个） |
| `/removewallet <地址>` | 移除钱包 |
| `/wallets` | 查看所有已连接钱包 |
| `/portfolio` | 查看投资组合概览和分布图 |

### 市场

| 命令 | 说明 |
|------|------|
| `/price <代币>` | 查看当前价格（如 `/price SOL`） |
| `/market` | Solana 生态价格概览 |

### DCA 定投策略

| 命令 | 说明 |
|------|------|
| `/dca` | 启动交互式 DCA 设置向导 |
| `/strategies` | 查看所有策略 |
| `/pause <ID>` | 暂停运行中的策略 |
| `/resume <ID>` | 恢复已暂停的策略 |

### 价格警报

| 命令 | 说明 |
|------|------|
| `/alert <代币> <above\|below> <价格>` | 创建价格警报（如 `/alert SOL above 200`） |
| `/alerts` | 查看所有活跃警报 |
| `/deletealert <ID>` | 删除警报 |

### 设置

| 命令 | 说明 |
|------|------|
| `/lang zh` | 切换为中文 |
| `/lang en` | 切换为英文 |

### 自然语言（无需斜杠）

机器人也能理解中英文自然语言：

| 你说 | 机器人理解为 |
|------|------------|
| "显示我的投资组合" | → 查看投资组合 |
| "SOL价格" / "SOL多少钱" | → 价格查询 |
| "定投" / "自动购买" | → DCA 定投向导 |
| "帮助" / "怎么用" | → 帮助菜单 |
| "市场" / "行情" | → 市场概览 |

## 部署指南

### 方案一：VPS / 云服务器（推荐）

部署到 DigitalOcean、阿里云、腾讯云等：

```bash
# 在服务器上
git clone https://github.com/your-username/openclaw-investor-suite.git
cd openclaw-investor-suite
npm install --production
cp .env.example .env
nano .env  # 配置你的 Token

# 技能由 OpenClaw Gateway AI Agent 调用
# 手动测试技能：
node skills/solana-market/scripts/get-price.js SOL
```

```bash
docker build -t openclaw-investor-suite .
docker run -d --env-file .env --name openclaw openclaw-investor-suite
```

### 方案三：本地开发

```bash
npm run dev  # 文件变更自动重启
```

## 安全说明

- **非托管架构** — 机器人绝不存储或访问你的私钥
- **只读钱包访问** — 仅读取链上公开的余额数据
- **DCA 模拟模式** — MVP 版本使用 Jupiter 报价（不实际执行交换，除非接入私钥）
- **用户确认** — 所有敏感操作需要用户明确批准
- **本地数据库** — SQLite 存储在本地，不暴露于互联网

## 支持的代币

| 代币 | 符号 | Mint 地址 |
|------|------|----------|
| Solana | SOL | `So111...1112` |
| USD Coin | USDC | `EPjFW...Dt1v` |
| Tether | USDT | `Es9vM...wNYB` |
| Jupiter | JUP | `JUPyi...vCN` |
| Raydium | RAY | `4k3Dy...X6R` |
| Bonk | BONK | `DezXA...B263` |

连接持有其他代币的钱包后，可自动追踪更多代币。

## 路线图

- [x] 多钱包投资组合追踪
- [x] Telegram Bot 双语交互
- [x] 自然语言命令解析
- [x] DCA 定投策略引擎
- [x] 价格警报系统
- [x] CoinGecko 价格数据集成
- [ ] PnL 盈亏追踪（成本基础、已实现/未实现盈亏）
- [ ] 智能再平衡策略
- [ ] 止损/止盈功能
- [ ] 鲸鱼追踪（大额转账监控）
- [ ] Web Dashboard 可视化面板
- [ ] 收益农耕自动化

## 开源协议

MIT License — 详见 [LICENSE](LICENSE) 文件。

---

<p align="center">
  <strong>Built with ❤️ for the Solana community</strong>
  <br>
  <a href="https://github.com/liji3597">GitHub</a> · <a href="https://twitter.com/liji_1357">Twitter</a> · <a href="https://t.me/liji_1357">Telegram</a>
</p>
