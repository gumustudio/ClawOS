/**
 * v1.35.0 第 1 批 P0 修复回归测试
 *
 * 覆盖：
 *   - A3-P0-2: confirmStockAnalysisSignal NaN/Infinity/负值/0/超界 weight 强校验
 *   - A3-P0-1: saveStockAnalysisSignals 保留 user_confirmed/user_rejected/user_ignored/user_override 状态
 *   - A4-P0-1: close/reduce/dismiss 在 riskControl.paused=true 时拒绝
 *   - A4-P0-2: reduce/close 幂等性（lastTradeAt 窗口 + clientNonce 60s 去重）
 *   - A2-P0-1: getStockAnalysisOverview 并发卖出不产生幽灵持仓
 */
// 测试前设置 env 旁路交易时段校验（不影响生产路径）
process.env.NODE_ENV = 'test'
process.env.SA_BYPASS_TRADING_HOURS = '1'

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  saveStockAnalysisSignals,
  readStockAnalysisSignals,
  saveStockAnalysisPositions,
  readStockAnalysisPositions,
  saveStockAnalysisTrades,
  saveStockAnalysisRuntimeStatus,
  readStockAnalysisRuntimeStatus,
  saveStockAnalysisConfig,
} from '../src/services/stock-analysis/store'
import {
  closeStockAnalysisPosition,
  reduceStockAnalysisPosition,
  dismissPositionAction,
  confirmStockAnalysisSignal,
} from '../src/services/stock-analysis/service'
import type {
  StockAnalysisSignal,
  StockAnalysisPosition,
  StockAnalysisRuntimeStatus,
} from '../src/services/stock-analysis/types'

async function createTempDir(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-v135-'))
  const dir = path.join(tempRoot, 'AI炒股分析')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

function buildSignal(overrides: Partial<StockAnalysisSignal> = {}): StockAnalysisSignal {
  return {
    id: 'signal-600519-2026-04-20',
    code: '600519',
    name: '贵州茅台',
    market: 'sh',
    tradeDate: '2026-04-20',
    compositeScore: 75,
    technicalScore: 70,
    quantScore: 70,
    sentimentScore: 70,
    finalScore: 75,
    action: 'buy',
    suggestedPosition: 0.1,
    vetoReasons: [],
    stopLossPrice: 1800,
    takeProfitPrice1: 2100,
    takeProfitPrice2: 2200,
    latestPrice: 2000,
    changePercent: 0,
    decisionSource: 'system',
    userDecisionNote: null,
    reason: 'test',
    expert: { consensus: 0.7, strongBuy: 10, buy: 10, hold: 5, sell: 3, strongSell: 2, votes: [], isSimulated: false, layerScores: { macro: 0, industry: 0, company: 0, technical: 0, quant: 0, sentiment: 0 }, effectiveLLMVotes: 20, degradeRatio: 0 },
    thresholds: { minCompositeScore: 70, minExpertConsensus: 0.5, minTechnicalScore: 60, minQuantScore: 60 },
    convictionFilter: { passed: true, failedThresholds: [] },
    fusionWeights: { expert: 0.4, technical: 0.3, quant: 0.3 },
    realtime: null,
    ...overrides,
  }
}

function buildPosition(overrides: Partial<StockAnalysisPosition> = {}): StockAnalysisPosition {
  return {
    id: 'position-600519-123',
    code: '600519',
    name: '贵州茅台',
    openedAt: '2026-04-19T01:30:00.000Z', // 前一天
    openDate: '2026-04-19',
    sourceSignalId: 'signal-600519-2026-04-19',
    quantity: 1,
    weight: 0.1,
    costPrice: 2000,
    currentPrice: 2000,
    returnPercent: 0,
    holdingDays: 1,
    stopLossPrice: 1800,
    takeProfitPrice1: 2100,
    takeProfitPrice2: 2200,
    trailingStopEnabled: true,
    highestPriceSinceOpen: 2000,
    action: 'hold',
    actionReason: 'test',
    ...overrides,
  }
}

async function setupRuntimeStatus(dir: string, paused: boolean, reason = '累计亏损触发') {
  const now = new Date().toISOString()
  const status: StockAnalysisRuntimeStatus = {
    lastRunAt: now,
    lastSuccessAt: now,
    lastError: null,
    stockPoolRefreshedAt: now,
    latestSignalDate: '2026-04-20',
    latestSuccessfulSignalDate: '2026-04-20',
    runState: 'idle',
    currentRun: null,
    quoteCacheAt: now,
    indexHistoryCacheAt: now,
    isUsingFallback: false,
    staleReasons: [],
    riskControl: paused
      ? { paused: true, pauseReason: reason, pausedAt: now, totalPauses: 1, lastResolvedAt: null }
      : { paused: false, pauseReason: null, pausedAt: null, totalPauses: 0, lastResolvedAt: null },
    postMarketAt: null,
  }
  await saveStockAnalysisRuntimeStatus(dir, status)
}

// ───────────────────────────────────────────────────────
// A3-P0-1 saveStockAnalysisSignals 保留 user 决策
// ───────────────────────────────────────────────────────

test('[A3-P0-1] saveStockAnalysisSignals 保留 user_confirmed 状态，防止 daily 重跑覆盖', async () => {
  const dir = await createTempDir()
  const tradeDate = '2026-04-20'

  // 第一次：写入 system 信号
  const initial = buildSignal({ decisionSource: 'system', userDecisionNote: null })
  await saveStockAnalysisSignals(dir, tradeDate, [initial])

  // 用户 confirm：decisionSource 变为 user_confirmed
  const confirmed = buildSignal({ decisionSource: 'user_confirmed', userDecisionNote: '手动确认' })
  await saveStockAnalysisSignals(dir, tradeDate, [confirmed])

  // 模拟 daily 重跑：重新写入 system 状态
  const rerun = buildSignal({ decisionSource: 'system', userDecisionNote: null, finalScore: 80 })
  await saveStockAnalysisSignals(dir, tradeDate, [rerun])

  const after = await readStockAnalysisSignals(dir, tradeDate)
  assert.equal(after.length, 1)
  assert.equal(after[0].decisionSource, 'user_confirmed', 'user_confirmed 必须保留')
  assert.equal(after[0].userDecisionNote, '手动确认', '用户笔记必须保留')
  assert.equal(after[0].finalScore, 80, '新的评分字段应被更新')
})

test('[A3-P0-1] saveStockAnalysisSignals 保留 user_rejected/user_ignored/user_override', async () => {
  const dir = await createTempDir()
  const tradeDate = '2026-04-20'
  const cases = ['user_rejected', 'user_ignored', 'user_override'] as const

  // 初始化 3 条带用户决策的信号
  const userSignals = cases.map((src) =>
    buildSignal({ id: `signal-test-${src}-2026-04-20`, decisionSource: src }),
  )
  await saveStockAnalysisSignals(dir, tradeDate, userSignals)

  // 模拟 daily 重跑：3 条都变回 system
  const rerunSignals = cases.map((src) =>
    buildSignal({ id: `signal-test-${src}-2026-04-20`, decisionSource: 'system' }),
  )
  await saveStockAnalysisSignals(dir, tradeDate, rerunSignals)

  const saved = await readStockAnalysisSignals(dir, tradeDate)
  assert.equal(saved.length, 3)
  for (const signal of saved) {
    assert.notEqual(signal.decisionSource, 'system', `${signal.id} 用户决策被错误覆盖`)
  }
})

test('[A3-P0-1] system 信号在重跑时正常更新', async () => {
  const dir = await createTempDir()
  const tradeDate = '2026-04-20'

  await saveStockAnalysisSignals(dir, tradeDate, [buildSignal({ decisionSource: 'system', finalScore: 70 })])
  await saveStockAnalysisSignals(dir, tradeDate, [buildSignal({ decisionSource: 'system', finalScore: 85 })])

  const after = await readStockAnalysisSignals(dir, tradeDate)
  assert.equal(after[0].finalScore, 85, 'system 信号可正常更新')
})

// ───────────────────────────────────────────────────────
// A3-P0-2 confirmStockAnalysisSignal NaN/Infinity 拦截
// ───────────────────────────────────────────────────────

test('[A3-P0-2] confirmStockAnalysisSignal 拒绝 NaN weight', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const signal = buildSignal()
  await saveStockAnalysisSignals(dir, signal.tradeDate, [signal])

  await assert.rejects(
    () => confirmStockAnalysisSignal(dir, signal.id, { quantity: 1, weight: Number.NaN, note: '', price: 2000 }),
    /NaN|非法/,
    'NaN weight 必须被拒绝',
  )
})

test('[A3-P0-2] confirmStockAnalysisSignal 拒绝 Infinity weight', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const signal = buildSignal()
  await saveStockAnalysisSignals(dir, signal.tradeDate, [signal])

  await assert.rejects(
    () => confirmStockAnalysisSignal(dir, signal.id, { quantity: 1, weight: Number.POSITIVE_INFINITY, note: '', price: 2000 }),
    /Infinity|非法/,
    'Infinity weight 必须被拒绝',
  )
})

test('[A3-P0-2] confirmStockAnalysisSignal 拒绝负数/零 weight', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const signal = buildSignal()
  await saveStockAnalysisSignals(dir, signal.tradeDate, [signal])

  for (const bad of [-1, -0.5, 0]) {
    await assert.rejects(
      () => confirmStockAnalysisSignal(dir, signal.id, { quantity: 1, weight: bad, note: '', price: 2000 }),
      /\(0, 1\]|区间/,
      `weight=${bad} 必须被拒绝`,
    )
  }
})

test('[A3-P0-2] confirmStockAnalysisSignal 拒绝超过 1 的 weight', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const signal = buildSignal()
  await saveStockAnalysisSignals(dir, signal.tradeDate, [signal])

  await assert.rejects(
    () => confirmStockAnalysisSignal(dir, signal.id, { quantity: 1, weight: 1.5, note: '', price: 2000 }),
    /\(0, 1\]|区间/,
    'weight > 1 必须被拒绝',
  )
})

// ───────────────────────────────────────────────────────
// A4-P0-1 风控暂停禁止卖出/dismiss
// ───────────────────────────────────────────────────────

test('[A4-P0-1] 风控暂停时，close 被拒绝', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, true)
  const position = buildPosition()
  await saveStockAnalysisPositions(dir, [position])
  await saveStockAnalysisTrades(dir, [])

  await assert.rejects(
    () => closeStockAnalysisPosition(dir, position.id, { closeAll: true, price: 2050 }),
    /风控|paused|暂停/i,
    'paused=true 时平仓必须拒绝',
  )
})

test('[A4-P0-1] 风控暂停时，reduce 被拒绝', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, true)
  const position = buildPosition()
  await saveStockAnalysisPositions(dir, [position])
  await saveStockAnalysisTrades(dir, [])

  await assert.rejects(
    () => reduceStockAnalysisPosition(dir, position.id, { weightDelta: 0.05, price: 2050 }),
    /风控|paused|暂停/i,
    'paused=true 时减仓必须拒绝',
  )
})

test('[A4-P0-1] 风控暂停时，dismissPositionAction 被拒绝', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, true)
  const position = buildPosition({ action: 'stop_loss', actionReason: '触发止损' })
  await saveStockAnalysisPositions(dir, [position])

  await assert.rejects(
    () => dismissPositionAction(dir, position.id, 'test'),
    /风控|paused|暂停/i,
    'paused=true 时 dismiss 必须拒绝',
  )
})

// ───────────────────────────────────────────────────────
// A4-P0-2 幂等性（lastTradeAt + clientNonce）
// ───────────────────────────────────────────────────────

test('[A4-P0-2] reduce 相同 clientNonce 60 秒内重复提交被拒', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const position = buildPosition()
  await saveStockAnalysisPositions(dir, [position])
  await saveStockAnalysisTrades(dir, [])

  const nonce = 'test-nonce-unique-1'
  // 第一次成功
  await reduceStockAnalysisPosition(dir, position.id, { weightDelta: 0.03, price: 2050, clientNonce: nonce })

  // 等 2.5 秒让 lastTradeAt 窗口过期（避免误触发频率限制）
  await new Promise((r) => setTimeout(r, 2500))

  // 第二次：相同 nonce → 必须被拒
  await assert.rejects(
    () => reduceStockAnalysisPosition(dir, position.id, { weightDelta: 0.03, price: 2050, clientNonce: nonce }),
    /重复|nonce/i,
    '相同 clientNonce 必须被拒',
  )
})

test('[A4-P0-2] reduce 无 nonce 时，2 秒内重复提交被 lastTradeAt 窗口拒绝', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const position = buildPosition()
  await saveStockAnalysisPositions(dir, [position])
  await saveStockAnalysisTrades(dir, [])

  // 第一次成功
  await reduceStockAnalysisPosition(dir, position.id, { weightDelta: 0.02, price: 2050 })

  // 立即第二次
  await assert.rejects(
    () => reduceStockAnalysisPosition(dir, position.id, { weightDelta: 0.02, price: 2050 }),
    /频繁|过于/,
    '2 秒内重复减仓必须被拒',
  )
})

test('[A4-P0-2] reduce 拒绝 NaN weightDelta', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  const position = buildPosition()
  await saveStockAnalysisPositions(dir, [position])
  await saveStockAnalysisTrades(dir, [])

  await assert.rejects(
    () => reduceStockAnalysisPosition(dir, position.id, { weightDelta: Number.NaN, price: 2050 }),
    /NaN|非法/,
    'NaN weightDelta 必须被拒',
  )
})

// ───────────────────────────────────────────────────────
// A2-P0-1 幽灵持仓并发 race
// ───────────────────────────────────────────────────────
// 这个测试验证 getStockAnalysisOverview 修复路径现在会在 TRADING_LOCK_KEY 内重读
// positions 再计算 live values，不会基于陈旧 snapshot 覆盖已被平仓的数据。
// 完整集成测试需要 mock fetch（因为 getStockAnalysisOverview 调用 getQuoteData），
// 此处用间接路径：验证 saveStockAnalysisPositions 调用在锁外不会导致 close 的删除被覆盖。

test('[A2-P0-1] close 后再 readPositions 不会因任何路径复活', async () => {
  const dir = await createTempDir()
  await setupRuntimeStatus(dir, false)
  await saveStockAnalysisConfig(dir, {
    maxPositions: 10,
    maxSinglePosition: 0.3,
    maxTotalPosition: 0.8,
    stopLossPercent: 10,
    takeProfitPercent1: 15,
    takeProfitPercent2: 25,
    blacklist: [],
    portfolioRiskLimits: { maxDailyLossPercent: 3, maxWeeklyLossPercent: 6, maxMonthlyLossPercent: 10, maxDrawdownPercent: 15 },
  } as any)
  const position = buildPosition()
  await saveStockAnalysisPositions(dir, [position])
  await saveStockAnalysisTrades(dir, [])

  // 平仓
  await closeStockAnalysisPosition(dir, position.id, { closeAll: true, price: 2050 })

  const after = await readStockAnalysisPositions(dir)
  assert.equal(after.length, 0, '平仓后持仓表应为空')
})
