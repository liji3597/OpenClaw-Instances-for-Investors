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
    <img src="https://img.shields.io/badge/vulnerabilities-0-brightgreen" alt="0 vulnerabilities">
    <img src="https://img.shields.io/badge/OpenClaw-Skills-FF6B35" alt="OpenClaw">
    <img src="https://img.shields.io/badge/Solana-Devnet%20%7C%20Mainnet-9945FF?logo=solana" alt="Solana">
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
| 🦅 **solana-investor** | Top-level orchestrator — coordinates multi-skill requests | `get-metrics` |
| 💼 **solana-portfolio** | Multi-wallet portfolio tracking & asset distribution | `get-portfolio`, `add-wallet`, `list-wallets`, `remove-wallet` |
| 📈 **solana-dca** | Dollar-Cost Averaging strategy engine | `create-dca`, `list-strategies`, `pause-strategy`, `resume-strategy` |
| 🔔 **solana-alerts** | Price alert monitoring & notifications | `create-alert`, `list-alerts`, `delete-alert`, `check-prices` |
| 💲 **solana-market** | Token price queries, ecosystem overview & RugCheck risk scan | `get-price`, `market-overview`, `check-token-risk` |

## Project Structure

```
├── AGENTS.md                           # Agent personality & behavior rules
├── .env.example                        # Environment variables template
├── package.json                        # npm dependencies
├── shared/                             # Shared modules
│   ├── config.js                       # Environment config & token registry
│   ├── database.js                     # SQLite (users, wallets, alerts, strategies)
│   ├── errors.js                       # Bilingual error codes (中文/EN)
│   ├── solana-connection.js            # Solana RPC with retry logic
│   ├── wallet.js                       # Balance queries & multi-wallet aggregation
│   ├── price-service.js                # CoinGecko price API + optional RugCheck risk data
│   ├── risk-service.js                 # RugCheck risk report API with 1h cache
│   ├── logger.js                       # Structured JSON logger
│   ├── metrics.js                      # 24h in-memory metrics summary
│   ├── tracker.js                      # Portfolio valuation engine
│   ├── formatter.js                    # Bilingual output formatting (中文/EN)
│   ├── script-utils.js                 # Parameter validation utilities
│   ├── services/                       # Service layer (authorization + business logic)
│   │   ├── index.js                    # Aggregated exports
│   │   ├── user-context.js             # User context & wallet operations
│   │   ├── strategy-service.js         # DCA strategy CRUD with ownership checks
│   │   └── alert-service.js            # Alert CRUD with scope separation
│   └── execution-kernel/               # P5: Live execution kernel (Beta)
│       ├── index.js                    # Aggregated exports
│       ├── types.js                    # Order states, transitions, constants
│       ├── order-state-machine.js      # Idempotent state transitions
│       ├── order-store.js              # Order persistence + daily notional tracking
│       ├── risk-controller.js          # Risk evaluation with whitelist/compliance/manual review
│       ├── whitelist-service.js        # Beta access control (10-user limit)
│       ├── circuit-breaker.js          # Global/user circuit breaker with auto-recovery
│       ├── compliance-service.js       # Geo-blocking & KYC validation
│       ├── manual-review-service.js    # High-value transaction HITL workflow
│       ├── rollback-service.js         # State recovery & fund tracking
│       ├── audit-logger.js             # Hash-chained immutable audit logs
│       └── migrations/                 # PostgreSQL migration scripts
│           └── postgres/
│               └── 0001_execution_kernel_core.up.sql
└── skills/                             # OpenClaw Skills (prompt-centric)
    ├── solana-investor/                # 🦅 Orchestrator + monitoring utility scripts
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
| `TELEGRAM_BOT_TOKEN` | Required for push notifications | Telegram bot token for alert/DCA delivery |
| `LOG_LEVEL` | Optional | Logger level: `DEBUG`, `INFO`, `WARN`, `ERROR` (default: `INFO`) |
| **Execution Kernel (P5)** |||
| `TURNKEY_API_PUBLIC_KEY` | Beta | Turnkey MPC API public key for signing |
| `TURNKEY_API_PRIVATE_KEY` | Beta | Turnkey MPC API private key for signing |
| `TURNKEY_ORGANIZATION_ID` | Beta | Turnkey organization ID |
| `JUPITER_API_KEY` | Beta | Jupiter Swap API key (optional, increases rate limits) |
| `BLOCKED_JURISDICTIONS` | Beta | Comma-separated ISO country codes blocked (default: `US,CN`) |
| `ALLOWED_KYC_STATUSES` | Beta | Comma-separated allowed KYC statuses (default: `VERIFIED`) |
| `BETA_WHITELIST_USER_IDS` | Beta | Comma-separated Telegram user IDs for Beta access |
| `MANUAL_REVIEW_USD_THRESHOLD` | Beta | Manual review threshold in USD (default: 50) |
| `CIRCUIT_BREAKER_ENABLED` | Beta | Enable circuit breaker (default: `true`) |
| `GLOBAL_AUTO_RESUME_MS` | Beta | Global circuit breaker auto-resume delay (default: 300000) |

## How It Works

### Architecture

```
┌──────────────────────────────────────────────────┐
│  Telegram                                        │
│  User: "DCA 100 USDC into SOL weekly"            │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  OpenClaw Gateway                                │
│  • LLM understands intent                        │
│  • Selects: solana-dca skill                     │
│  • Runs: create-dca.js 12345 SOL 100             │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Our Skills (this project)                       │
│  • Validates token & parameters                  │
│  • Creates DCA strategy in SQLite                │
│  • Returns confirmation message                  │
└──────────────────┬───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│  Solana Blockchain                               │
│  • Helius RPC for balance queries                │
│  • CoinGecko for price data                      │
│  • Jupiter for swap quotes                       │
└──────────────────────────────────────────────────┘
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
- **Read-only** — Only reads public on-chain balances (P0-P4)
- **MPC Signer** — Turnkey SDK integration for live execution (P5), private keys never touch our servers
- **0 vulnerabilities** — Removed `@solana/spl-token` transitive dependency (CVE-2025-3194 bigint-buffer)
- **System-authorized calls** — Sensitive scripts require `--system` flag or `OPENCLAW_SYSTEM=true`
- **Structured error handling** — Scripts return `MISSING_PARAMS` JSON instead of raw errors
- **DCA simulation** — MVP records strategies but does not execute real on-chain swaps
- **Local database** — SQLite stored on your server, not exposed externally
- **RugCheck risk feed** — Price flow supports score/warnings/top-holder risk data
- **Operational observability** — Structured JSON logs and 24h metrics summary
- **Execution Kernel** — Hard-coded safety limits, circuit breakers, manual review workflow
- **Compliance** — Geo-blocking, KYC validation, immutable audit logs. See [docs/COMPLIANCE.md](docs/COMPLIANCE.md)

## Roadmap

### P0 — Security Hardening ✅
- [x] Authorization bypass fix (DCA strategy operations + alert scope separation)
- [x] Atomic alert triggering (prevent duplicate triggers)
- [x] System authorization gating (sensitive scripts require `--system` flag)
- [x] CVE-2025-3194 fix (removed bigint-buffer dependency chain)

### P1 — Architecture Optimization ✅
- [x] Service layer (user context / strategy / alert / wallet operations)
- [x] Bilingual error code standardization (`formatError` + `errors.js`)
- [x] `MISSING_PARAMS` JSON protocol (Agent asks follow-up instead of throwing errors)
- [x] All scripts adapted to new architecture (14 scripts)

### P2 — Standardization & Engineering Foundation ✅
- [x] Multi-wallet portfolio tracking
- [x] DCA strategy engine
- [x] Price alert system
- [x] CoinGecko price data integration
- [x] Bilingual support (Chinese & English)
- [x] Prompt-Centric SKILL.md (Workflow + Guardrails)
- [x] Multi-skill Orchestrator (Orchestrator Skill)
- [x] Test baseline (Service layer unit tests + script protocol tests)
- [x] CI pipeline (GitHub Actions)

### P3 — Product Capability Expansion (non-custodial / simulation mode) ✅
- [x] Push notifications (alert trigger → Telegram DM)
- [x] PnL tracking (cost basis, realized/unrealized PnL)
- [x] Risk data source (RugCheck API integration)
- [x] Scheduled execution layer (alerts check + DCA simulated execution)
- [x] Structured logging & monitoring

### P4 — Strategy Intelligence (mode fork point) ✅
- [x] Stop-loss / take-profit alerts (notification-only, not auto-execution)
- [x] Smart rebalancing suggestions
- [x] Whale tracking (large transfer monitoring)
- [x] Token expansion (Jupiter Price API)
- [x] Execution mode evaluation (signature/custody/compliance feasibility report)

### P5 — Execution Kernel (Beta) ✅

> **Status**: Core architecture implemented. Ready for 10-user closed Beta.
>
> **Safety Limits** (hard-coded, not configurable):
> - Per-transaction: $100 USD cap
> - Daily limit: $500 USD per user
> - Slippage: 3% maximum
> - Manual review: $50+ requires approval

- [x] **Execution Kernel** - Order state machine with idempotent transitions
- [x] **Signer Service** - MPC integration (Turnkey SDK ready)
- [x] **Jupiter Execution** - Quote → Build → Sign → Broadcast → Confirm
- [x] **Risk Controller** - Hard-coded limits, idempotency, fingerprinting
- [x] **Whitelist Service** - 10-user Beta access control
- [x] **Circuit Breaker** - Global/user pause with auto-recovery
- [x] **Compliance Service** - Geo-blocking (US/CN), KYC validation
- [x] **Manual Review** - High-value transaction workflow (HITL)
- [x] **Rollback Service** - State recovery, fund tracking
- [x] **Audit Logger** - Hash-chained immutable logs
- [x] **PostgreSQL Migration** - Production-ready schema

**Architecture**:
```
┌─────────────────────────────────────────────────────────────┐
│  Order State Machine                                        │
│  CREATED → RISK_CHECK → REVIEW_PENDING? → SIGNING          │
│                                              ↓              │
│  FAILED ← CONFIRMED ← BROADCAST ← SIGNING                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  Risk Controls (pre-execution)                              │
│  • Idempotency check (fingerprint-based dedup)             │
│  • Whitelist (Beta 10-user limit)                          │
│  • Circuit breaker (global/user pause)                     │
│  • Compliance (geo/KYC)                                    │
│  • Manual review ($50+ threshold)                          │
│  • Per-tx cap ($100) / Daily cap ($500)                    │
│  • Slippage limit (300 bps)                                │
└─────────────────────────────────────────────────────────────┘
```

**Security Model**:
- **MPC Signer**: Turnkey SDK integration — private keys never touch our servers
- **Human-in-the-Loop**: All trades require explicit user confirmation
- **Defense in Depth**: Multiple independent safety checks before any fund movement
- **Immutable Audit**: SHA-256 hash-chained logs for regulatory compliance

See [docs/COMPLIANCE.md](docs/COMPLIANCE.md) for risk disclosure and operational procedures.

### P6 — DeFi Ecosystem Integration
- [ ] Jupiter LP operations (add / remove liquidity)
- [ ] Lending protocol integration (Solend / MarginFi)
- [ ] Yield farming automation (Raydium / Orca)
- [ ] Token launch detection (Pump.fun / Moonshot)

### P7 — Social & Institutional
- [ ] Strategy marketplace (publish / subscribe / revenue share)
- [ ] Copy trading (real-time position mirroring)
- [ ] Multi-signature wallet support (Squads Protocol)
- [ ] Compliance reporting (per-jurisdiction tax & audit exports)

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
| 🦅 **solana-investor** | 顶层编排器 — 协调多技能组合请求 | `get-metrics` |
| 💼 **solana-portfolio** | 多钱包投资组合追踪和资产分布 | `get-portfolio`, `add-wallet`, `list-wallets`, `remove-wallet` |
| 📈 **solana-dca** | DCA 定投策略引擎 | `create-dca`, `list-strategies`, `pause-strategy`, `resume-strategy` |
| 🔔 **solana-alerts** | 价格警报监控和通知 | `create-alert`, `list-alerts`, `delete-alert`, `check-prices` |
| 💲 **solana-market** | 代币价格查询、生态概览与 RugCheck 风险扫描 | `get-price`, `market-overview`, `check-token-risk` |

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
| `TELEGRAM_BOT_TOKEN` | 推送通知必填 | Telegram Bot Token，用于警报与定投执行通知 |
| `LOG_LEVEL` | 可选 | 日志级别：`DEBUG`、`INFO`、`WARN`、`ERROR`（默认 `INFO`） |
| **执行内核 (P5)** |||
| `TURNKEY_API_PUBLIC_KEY` | 内测 | Turnkey MPC API 公钥（签名用） |
| `TURNKEY_API_PRIVATE_KEY` | 内测 | Turnkey MPC API 私钥（签名用） |
| `TURNKEY_ORGANIZATION_ID` | 内测 | Turnkey 组织 ID |
| `JUPITER_API_KEY` | 内测 | Jupiter 交换 API 密钥（可选，提升限流） |
| `BLOCKED_JURISDICTIONS` | 内测 | 封锁的 ISO 国家代码，逗号分隔（默认：`US,CN`） |
| `ALLOWED_KYC_STATUSES` | 内测 | 允许的 KYC 状态，逗号分隔（默认：`VERIFIED`） |
| `BETA_WHITELIST_USER_IDS` | 内测 | Beta 白名单 Telegram 用户 ID，逗号分隔 |
| `MANUAL_REVIEW_USD_THRESHOLD` | 内测 | 人工审核阈值 USD（默认：50） |
| `CIRCUIT_BREAKER_ENABLED` | 内测 | 启用熔断器（默认：`true`） |
| `GLOBAL_AUTO_RESUME_MS` | 内测 | 全局熔断器自动恢复延迟（默认：300000） |

## 安全说明

- **非托管** — 技能绝不访问或存储私钥
- **只读** — 只读取链上公开余额数据（P0-P4）
- **MPC 签名器** — Turnkey SDK 集成实现真实执行（P5），私钥永不触碰服务器
- **0 漏洞** — 已移除 `@solana/spl-token` 依赖链（CVE-2025-3194 bigint-buffer 缓冲区溢出）
- **系统授权** — 敏感脚本需要 `--system` 标志或 `OPENCLAW_SYSTEM=true`
- **结构化错误** — 脚本返回 `MISSING_PARAMS` JSON，不暴露原始错误
- **DCA 模拟** — MVP 记录策略但不实际执行链上交换
- **本地数据库** — SQLite 存储在你的服务器上
- **RugCheck 风险源** — 价格链路可返回风险评分、警告和持仓集中度
- **可观测性** — 结构化 JSON 日志 + 24 小时指标汇总
- **执行内核** — 硬编码安全限额、熔断器、人工审核流程
- **合规性** — 地理封锁、KYC 验证、不可变审计日志。详见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md)

## 路线图

### P0 — 安全加固 ✅
- [x] 授权绕过修复（DCA 策略操作 + 警报范围分离）
- [x] 原子警报触发（防止重复触发）
- [x] 系统授权门控（敏感脚本需 `--system` 标志）
- [x] CVE-2025-3194 修复（移除 bigint-buffer 依赖链）

### P1 — 架构优化 ✅
- [x] Service 层（用户上下文 / 策略 / 警报 / 钱包操作）
- [x] 双语错误码标准化（`formatError` + `errors.js`）
- [x] `MISSING_PARAMS` JSON 协议（Agent 追问而非报错）
- [x] 全部脚本适配新架构（14 个脚本）

### P2 — 标准化与工程底座 ✅
- [x] 多钱包投资组合追踪
- [x] DCA 定投策略引擎
- [x] 价格警报系统
- [x] CoinGecko 价格数据集成
- [x] 中英文双语支持
- [x] Prompt-Centric SKILL.md（Workflow + Guardrails）
- [x] 多技能编排器（Orchestrator Skill）
- [x] 测试基线（Service 层单测 + 脚本协议测试）
- [x] CI 流水线（GitHub Actions）

### P3 — 产品能力扩展（保持非托管/模拟模式）
- [x] 推送通知（警报触发 → Telegram DM）
- [x] PnL 盈亏追踪（成本基础、已实现/未实现盈亏）
- [x] 风险数据源（RugCheck API 集成）
- [x] 定时调度层（alerts 检查 + DCA 模拟执行）
- [x] 结构化日志与监控

### P4 — 策略智能化（模式分叉点）✅
- [x] 止损/止盈提醒（提醒型，非自动执行）
- [x] 智能再平衡建议
- [x] 鲸鱼追踪（大额转账监控）
- [x] Token 扩展（Jupiter Price API）
- [x] 执行模式评估（签名/托管/合规可行性报告）

### P5 — 执行内核 (Beta) ✅

> **状态**: 核心架构已完成。准备 10 人内测。
>
> **安全限额**（硬编码，不可配置）：
> - 单笔交易：$100 USD 上限
> - 每日限额：每用户 $500 USD
> - 滑点上限：3%
> - 人工审核：$50+ 需审批

- [x] **执行内核** - 带幂等状态转换的订单状态机
- [x] **签名服务** - MPC 集成（Turnkey SDK 就绪）
- [x] **Jupiter 执行** - 报价 → 构建 → 签名 → 广播 → 确认
- [x] **风控控制器** - 硬编码限额、幂等校验、指纹去重
- [x] **白名单服务** - 10 人 Beta 访问控制
- [x] **熔断器** - 全局/用户级暂停与自动恢复
- [x] **合规服务** - 地理封锁（US/CN）、KYC 验证
- [x] **人工审核** - 高价值交易人工审批流程（HITL）
- [x] **回滚服务** - 状态恢复、资金追踪
- [x] **审计日志** - 哈希链式不可变日志
- [x] **PostgreSQL 迁移** - 生产级数据库结构

**架构**：
```
┌─────────────────────────────────────────────────────────────┐
│  订单状态机                                                  │
│  创建 → 风控检查 → 待审核? → 签名中                          │
│                              ↓                              │
│  失败 ← 已确认 ← 已广播 ← 签名中                             │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│  风控检查（执行前）                                          │
│  • 幂等校验（指纹去重）                                      │
│  • 白名单（Beta 10人限制）                                   │
│  • 熔断器（全局/用户暂停）                                   │
│  • 合规检查（地理/KYC）                                      │
│  • 人工审核（$50+ 阈值）                                     │
│  • 单笔限额（$100）/ 日限额（$500）                          │
│  • 滑点限制（300 基点）                                      │
└─────────────────────────────────────────────────────────────┘
```

**安全模型**：
- **MPC 签名器**: Turnkey SDK 集成 —— 私钥永不触碰我们的服务器
- **人工介入**: 所有交易需用户明确确认
- **纵深防御**: 多重独立安全检查后才可移动资金
- **不可变审计**: SHA-256 哈希链日志，满足合规要求

详见 [docs/COMPLIANCE.md](docs/COMPLIANCE.md) 了解风险披露与操作流程。

### P6 — DeFi 生态集成
- [ ] Jupiter LP 操作（添加/移除流动性）
- [ ] 借贷协议集成（Solend / MarginFi）
- [ ] 收益耕作自动化（Raydium / Orca）
- [ ] 代币发射检测（Pump.fun / Moonshot）

### P7 — 社交与机构化
- [ ] 策略市场（发布 / 订阅 / 收益分成）
- [ ] 跟单交易（实时持仓镜像）
- [ ] 多签钱包支持（Squads Protocol）
- [ ] 合规报告（按辖区税务与审计导出）

## 开源协议

MIT License

---

<p align="center">
  <strong>Built with ❤️ for the Solana community</strong>
  <br>
  Powered by <a href="https://openclaw.ai">OpenClaw</a>
</p>
