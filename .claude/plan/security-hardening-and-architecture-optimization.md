# OpenClaw Investor Suite 安全加固与架构优化实施计划

**制定日期**: 2026-03-03
**计划版本**: v1.0
**涉及范围**: P0 安全修复 + P1 架构优化

---

## 📋 执行摘要

本计划基于多模型技术分析结果，针对 OpenClaw Investor Suite 的核心安全漏洞和架构缺陷进行系统修复。

**核心问题**:
1. **越权访问**: `updateStrategyStatus` 无 user_id 验证
2. **数据泄露**: `getActiveAlerts()` 可被调用读取全量数据
3. **重复触发**: 警报触发后未原子标记，导致重复通知
4. **架构偏差**: Script-centric 与 AGENTS.md 规范冲突

**修复策略**:
- P0: 最小改动修复安全漏洞（不改接口契约）
- P1: 引入 Service 层，统一权限校验和错误处理

---

## 🎯 任务分解

### P0-1: 修复 DCA 状态更新越权 **[CRITICAL]**

**问题描述**: `pause-strategy.js` / `resume-strategy.js` 调用 `updateStrategyStatus(strategyId, status)` 时未传递 user_id，攻击者可猜测 strategyId 操作他人策略。

**影响文件**:
| 文件 | 操作 | 说明 |
|------|------|------|
| `shared/database.js:L197-L199` | 修改 | 添加 userId 参数和 WHERE 条件 |
| `skills/solana-dca/scripts/pause-strategy.js:L32` | 修改 | 传入 user.id |
| `skills/solana-dca/scripts/resume-strategy.js:L32` | 修改 | 传入 user.id |

**变更详情**:
```javascript
// shared/database.js - 修改后
function updateStrategyStatus(strategyId, status, userId) {
  const result = getDb().prepare(
    'UPDATE dca_strategies SET status = ? WHERE id = ? AND user_id = ?'
  ).run(status, strategyId, userId);
  return result.changes > 0; // 返回是否成功更新
}

// pause-strategy.js - 修改后
const updated = updateStrategyStatus(strategyId, 'paused', user.id);
if (!updated) {
  console.log('❌ 策略不存在或无权限 / Strategy not found or unauthorized');
  process.exit(1);
}
console.log(`🟡 策略 #${strategyId} 已暂停 / Strategy paused`);
```

**验收标准**:
- [ ] 用户 A 无法暂停/恢复用户 B 的策略（返回 not found）
- [ ] 用户 A 可正常操作自己的策略
- [ ] 现有 SKILL.md 调用方式保持不变

**风险**: 低（接口契约不变，仅内部实现加固）

---

### P0-2: 修复警报查询越界 **[CRITICAL]**

**问题描述**: `getActiveAlerts()` 允许无 userId 调用返回全量数据，`check-prices.js` 当前这样调用，存在数据泄露风险。

**影响文件**:
| 文件 | 操作 | 说明 |
|------|------|------|
| `shared/database.js:L163-L168` | 修改 | 拆分为用户态和系统态两个函数 |
| `skills/solana-alerts/scripts/list-alerts.js` | 修改 | 使用用户态接口 |
| `skills/solana-alerts/scripts/check-prices.js:L16` | 修改 | 使用系统态接口（带 LIMIT） |

**变更详情**:
```javascript
// shared/database.js - 修改后
// 用户态：必须提供 userId
function getActiveAlertsByUser(userId) {
  if (!userId) throw new Error('userId is required');
  return getDb().prepare(
    'SELECT * FROM price_alerts WHERE user_id = ? AND is_active = 1'
  ).all(userId);
}

// 系统态：仅限批处理任务使用，带 LIMIT 防止过载
function getAllActiveAlertsForSystem(limit = 500) {
  return getDb().prepare(
    'SELECT * FROM price_alerts WHERE is_active = 1 ORDER BY id ASC LIMIT ?'
  ).all(limit);
}

// 废弃原函数（或保留作为兼容包装）
function getActiveAlerts(userId) {
  if (userId) return getActiveAlertsByUser(userId);
  throw new Error('Use getAllActiveAlertsForSystem() for system-wide queries');
}
```

**验收标准**:
- [ ] 用户态脚本必须提供 userId 才能查询 alerts
- [ ] `check-prices.js` 改用 `getAllActiveAlertsForSystem(500)`
- [ ] 模块导出更新，保持向后兼容

**风险**: 中（需要更新所有调用点）

---

### P0-3: 修复警报重复触发 **[HIGH]**

**问题描述**: `check-prices.js` 仅打印触发结果但不标记为已触发，连续执行会导致重复通知。

**影响文件**:
| 文件 | 操作 | 说明 |
|------|------|------|
| `shared/database.js:L170-L172` | 修改 | 改为原子更新并返回是否成功 |
| `skills/solana-alerts/scripts/check-prices.js:L33-L36` | 修改 | 触发后调用标记函数 |

**变更详情**:
```javascript
// shared/database.js - 修改后
function markAlertTriggeredOnce(alertId) {
  // 只有 is_active=1 时才更新，返回 changes 表示是否成功抢到
  const result = getDb().prepare(
    'UPDATE price_alerts SET is_active = 0, triggered_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = 1'
  ).run(alertId);
  return result.changes > 0;
}

// check-prices.js - 修改后
if (triggered) {
  const firstTrigger = markAlertTriggeredOnce(alert.id);
  if (!firstTrigger) continue; // 已被其他进程触发，跳过

  const condStr = alert.condition === 'above' ? '高于/above' : '低于/below';
  console.log(`🚨 TRIGGERED: ${alert.token_symbol} (${formatUSD(price)}) ${condStr} ${formatUSD(alert.target_price)} — User: ${alert.user_id}`);
}
```

**验收标准**:
- [ ] 连续执行两次 `check-prices.js`，同一 alert 只触发一次
- [ ] 并发执行时，只有一个进程能成功标记

**风险**: 低（纯逻辑修复）

---

### P1-1: 引入 Service 层（权限收敛）

**目标**: 将权限校验从脚本迁移到 Service 层，降低安全遗漏风险

**新增文件**:
| 文件 | 说明 |
|------|------|
| `shared/services/strategy-service.js` | DCA 策略业务逻辑 |
| `shared/services/alert-service.js` | 警报业务逻辑 |
| `shared/services/user-context.js` | 用户上下文管理 |

**新增 shared/services/user-context.js**:
```javascript
const { findOrCreateUser } = require('../database');

function getUserContext(telegramId) {
  const user = findOrCreateUser(telegramId, '');
  return {
    id: user.id,
    telegramId: user.telegram_id,
    language: user.language || 'zh'
  };
}

module.exports = { getUserContext };
```

**新增 shared/services/strategy-service.js**:
```javascript
const { getUserStrategies, updateStrategyStatus } = require('../database');
const { getUserContext } = require('./user-context');

function validateStrategyOwnership(userId, strategyId) {
  const strategies = getUserStrategies(userId);
  return strategies.find(s => s.id === strategyId);
}

function pauseStrategy(telegramId, strategyId) {
  const user = getUserContext(telegramId);
  const strategy = validateStrategyOwnership(user.id, strategyId);

  if (!strategy) {
    return { ok: false, code: 'NOT_FOUND_OR_UNAUTHORIZED' };
  }
  if (strategy.status === 'paused') {
    return { ok: false, code: 'ALREADY_PAUSED' };
  }

  const updated = updateStrategyStatus(strategyId, 'paused', user.id);
  return { ok: updated, code: updated ? 'SUCCESS' : 'UPDATE_FAILED' };
}

function resumeStrategy(telegramId, strategyId) {
  const user = getUserContext(telegramId);
  const strategy = validateStrategyOwnership(user.id, strategyId);

  if (!strategy) {
    return { ok: false, code: 'NOT_FOUND_OR_UNAUTHORIZED' };
  }
  if (strategy.status === 'active') {
    return { ok: false, code: 'ALREADY_ACTIVE' };
  }

  const updated = updateStrategyStatus(strategyId, 'active', user.id);
  return { ok: updated, code: updated ? 'SUCCESS' : 'UPDATE_FAILED' };
}

module.exports = { pauseStrategy, resumeStrategy, validateStrategyOwnership };
```

**改造 pause-strategy.js**:
```javascript
const { pauseStrategy } = require('../../../shared/services/strategy-service');

// ... 参数解析 ...

const result = pauseStrategy(telegramId, strategyId);

if (!result.ok) {
  const messages = {
    NOT_FOUND_OR_UNAUTHORIZED: '❌ 策略不存在或无权限 / Strategy not found or unauthorized',
    ALREADY_PAUSED: '⚠️ 策略已处于暂停状态 / Already paused'
  };
  console.log(messages[result.code] || '❌ 操作失败 / Operation failed');
  process.exit(1);
}

console.log(`🟡 策略 #${strategyId} 已暂停 / Strategy paused`);
```

**验收标准**:
- [ ] DCA/Alerts 脚本不再直接操作数据库
- [ ] 所有业务逻辑走 Service 层
- [ ] 错误码标准化，便于国际化

**风险**: 中（需要重构多个脚本，但接口契约不变）

---

### P1-2: 统一参数校验模式（对齐 AGENTS.md）

**问题**: 当前脚本使用 `Usage: ...` + `exit(1)`，与 AGENTS.md "参数不足应追问" 冲突

**解决方案**: 缺参时输出机器可读的 MISSING_PARAMS 信号，由 Agent 转换为追问

**新增 shared/script-utils.js**:
```javascript
function validateParams(required, provided) {
  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      code: 'MISSING_PARAMS',
      missing,
      message: `Missing required parameters: ${missing.join(', ')}`
    };
  }

  return { valid: true };
}

function handleMissingParams(result, lang = 'zh') {
  const messages = {
    zh: `请补充以下信息：${result.missing.join('、')}`,
    en: `Please provide the following: ${result.missing.join(', ')}`
  };
  console.log(JSON.stringify({
    code: 'MISSING_PARAMS',
    message: messages[lang] || messages.en,
    missing: result.missing
  }));
  process.exit(2); // 特殊 exit code 表示缺参
}

module.exports = { validateParams, handleMissingParams };
```

**改造示例（create-alert.js）**:
```javascript
const { validateParams, handleMissingParams } = require('../../../shared/script-utils');

const telegramId = process.argv[2];
const symbol = process.argv[3];
const condition = process.argv[4];
const targetPrice = process.argv[5];

const validation = validateParams({
  telegramId, symbol, condition, targetPrice
}, { telegramId, symbol, condition, targetPrice });

if (!validation.valid) {
  handleMissingParams(validation, 'zh');
}
```

**验收标准**:
- [ ] 所有脚本移除 `Usage:` 文案
- [ ] 缺参返回 `MISSING_PARAMS` JSON
- [ ] AGENTS.md 添加处理 MISSING_PARAMS 的指引

**风险**: 低（仅改变缺参行为，正常流程不变）

---

### P1-3: 标准化错误处理与输出格式

**新增 shared/errors.js**:
```javascript
const ERROR_CODES = {
  NOT_FOUND_OR_UNAUTHORIZED: { zh: '策略不存在或无权限', en: 'Strategy not found or unauthorized' },
  ALREADY_PAUSED: { zh: '策略已处于暂停状态', en: 'Already paused' },
  ALREADY_ACTIVE: { zh: '策略已处于活跃状态', en: 'Already active' },
  INVALID_ADDRESS: { zh: '无效的 Solana 地址', en: 'Invalid Solana address' },
  NETWORK_ERROR: { zh: '网络连接失败，请稍后重试', en: 'Network error, please try again later' }
};

function formatError(code, lang = 'zh') {
  const error = ERROR_CODES[code];
  if (!error) return lang === 'zh' ? '操作失败' : 'Operation failed';
  return error[lang] || error.en;
}

module.exports = { ERROR_CODES, formatError };
```

**改造脚本错误处理模式**:
```javascript
const { formatError } = require('../../../shared/errors');

try {
  // ... 业务逻辑 ...
} catch (err) {
  // 不暴露原始错误给 Agent/用户
  console.error(JSON.stringify({
    code: 'INTERNAL_ERROR',
    message: formatError('NETWORK_ERROR', lang),
    // 原始错误记录到日志文件，不输出
  }));
  process.exit(1);
}
```

**验收标准**:
- [ ] 错误消息统一从 errors.js 获取
- [ ] 原始错误不暴露给用户
- [ ] 支持中英文双语错误码

---

## 📊 执行顺序与依赖关系

```
P0-1 (DCA 越权修复)
    │
    ▼
P0-2 (Alerts 查询越界) ──► P1-2 (参数校验)
    │                           │
    ▼                           ▼
P0-3 (重复触发) ◄────────── P1-1 (Service 层)
                                │
                                ▼
                           P1-3 (错误标准化)
```

**推荐执行顺序**:
1. **Week 1**: P0-1 + P0-2 + P0-3（安全修复）
2. **Week 2**: P1-1（Service 层）
3. **Week 3**: P1-2 + P1-3（体验优化）

---

## ✅ 测试策略

### 单元测试
```javascript
// test/strategy-service.test.js
describe('pauseStrategy', () => {
  it('should reject cross-user access', () => {
    const result = pauseStrategy('userA_tg', userB_strategyId);
    expect(result.code).toBe('NOT_FOUND_OR_UNAUTHORIZED');
  });

  it('should allow own strategy pause', () => {
    const result = pauseStrategy('userA_tg', userA_strategyId);
    expect(result.ok).toBe(true);
  });
});
```

### 集成测试
```bash
# 越权测试
node skills/solana-dca/scripts/pause-strategy.js $USER_A_ID $USER_B_STRATEGY_ID
# 预期：策略不存在或无权限

# 正常流程
node skills/solana-dca/scripts/pause-strategy.js $USER_A_ID $USER_A_STRATEGY_ID
# 预期：策略已暂停

# 重复触发测试
node skills/solana-alerts/scripts/check-prices.js
node skills/solana-alerts/scripts/check-prices.js
# 预期：第二次无新触发
```

---

## ⚠️ 风险评估与回滚

| 任务 | 风险等级 | 回滚方案 |
|------|----------|----------|
| P0-1 | 低 | 恢复 database.js 原函数签名（保持新函数，废弃旧函数） |
| P0-2 | 中 | 保留原 `getActiveAlerts` 函数作为兼容包装 |
| P0-3 | 低 | 无状态变更，可随时回滚 |
| P1-1 | 中 | Service 层独立文件，删除即可回滚 |
| P1-2 | 低 | 恢复原脚本参数校验逻辑 |
| P1-3 | 低 | 恢复原 console.error 输出 |

---

## 🔗 SESSION_ID（供 /ccg:execute 使用）

- **CODEX_SESSION**: `019cb318-0891-7943-a02a-cb213c7819f2`
- **GEMINI_SESSION**: `de9d0dba-b2be-41a1-ba91-0fe1f86535ca`

---

## 📝 计划验证清单

- [x] 任务可并行执行（P0 和 P1 可分离）
- [x] 每个任务有具体文件路径
- [x] 包含伪代码和变更详情
- [x] 定义验收标准
- [x] 包含测试方法
- [x] 风险评估和回滚方案
- [x] SESSION_ID 已记录

---

**计划制定完成**。审查后可执行：
```
/ccg:execute .claude/plan/security-hardening-and-architecture-optimization.md
```
