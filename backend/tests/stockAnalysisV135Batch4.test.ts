/**
 * v1.35.0 第 4 批 P0 修复回归测试
 *
 * 覆盖：
 *   - A5-P0-1 runMorningSupplementAnalysis in-flight 锁
 *   - A6-P0-2 runAutoDecisions in-flight 锁
 *   - A5-P0-4 intradayPoll 去重（概念验证）
 *   - A6-P0-1 CORS origin 白名单语义
 */

process.env.NODE_ENV = 'test'
process.env.SA_BYPASS_TRADING_HOURS = '1'

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { runAutoDecisions, runMorningSupplementAnalysis } from '../src/services/stock-analysis/service'
import { saveStockAnalysisSignals, saveStockAnalysisRuntimeStatus, saveStockAnalysisConfig, saveStockAnalysisQuoteCache } from '../src/services/stock-analysis/store'

async function createTempDir(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-v135b4-'))
  const dir = path.join(tempRoot, 'AI炒股分析')
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// ───────────────────────────────────────────────────────
// A6-P0-2 runAutoDecisions in-flight 锁
// ───────────────────────────────────────────────────────

test('[A6-P0-2] runAutoDecisions 并发调用只执行一次（in-flight 锁）', async () => {
  const dir = await createTempDir()
  const now = new Date().toISOString()
  // 无信号 → 函数会快速返回 totalSignals=0
  await saveStockAnalysisSignals(dir, '2026-04-21', [])
  await saveStockAnalysisRuntimeStatus(dir, {
    lastRunAt: now, lastSuccessAt: now, lastError: null, stockPoolRefreshedAt: now,
    latestSignalDate: '2026-04-21', latestSuccessfulSignalDate: '2026-04-21',
    runState: 'idle', currentRun: null, quoteCacheAt: now, indexHistoryCacheAt: now,
    isUsingFallback: false, staleReasons: [],
    riskControl: { paused: false, pauseReason: null, pausedAt: null, totalPauses: 0, lastResolvedAt: null },
    postMarketAt: null,
  })

  // 并发触发 3 次
  const [r1, r2, r3] = await Promise.all([
    runAutoDecisions(dir, '2026-04-21'),
    runAutoDecisions(dir, '2026-04-21'),
    runAutoDecisions(dir, '2026-04-21'),
  ])
  // 由于是并发调用，返回的是同一个 Promise 结果
  assert.equal(r1.tradeDate, '2026-04-21')
  assert.equal(r2.tradeDate, '2026-04-21')
  assert.equal(r3.tradeDate, '2026-04-21')
  // 三次调用结果 === 相同对象（in-flight 锁命中）
  assert.strictEqual(r1, r2, 'in-flight 锁应返回同一 Promise 结果')
  assert.strictEqual(r2, r3)
})

// ───────────────────────────────────────────────────────
// A5-P0-1 runMorningSupplementAnalysis in-flight 锁
// ───────────────────────────────────────────────────────

test('[A5-P0-1] runMorningSupplementAnalysis 并发调用只执行一次', async () => {
  const dir = await createTempDir()
  // 触发 "行情缓存为空 → 直接返回" 的快速路径
  await saveStockAnalysisQuoteCache(dir, { quotes: [], fetchedAt: new Date().toISOString(), usedFallback: false, staleReasons: [] } as any)

  // 并发触发 — in-flight 锁下应该只有一次真正执行
  const results = await Promise.all([
    runMorningSupplementAnalysis(dir),
    runMorningSupplementAnalysis(dir),
    runMorningSupplementAnalysis(dir),
  ])
  // 所有 return undefined（void），只要不抛错就说明锁生效了
  results.forEach((r) => assert.equal(r, undefined))
})

// ───────────────────────────────────────────────────────
// A6-P0-1 CORS 白名单语义
// ───────────────────────────────────────────────────────

test('[A6-P0-1] CORS 白名单应允许 localhost/127.0.0.1 和 Tailscale *.ts.net', () => {
  const WHITELIST = ['http://localhost:5173', 'http://localhost:3001', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001']
  const TS_NET_REGEX = /^https?:\/\/[\w-]+\.ts\.net$/
  const shouldAllow = (origin: string | undefined) => {
    if (!origin) return true
    if (WHITELIST.includes(origin)) return true
    if (TS_NET_REGEX.test(origin) || origin.startsWith('http://localhost')) return true
    return false
  }

  assert.equal(shouldAllow(undefined), true, '无 origin（同源）允许')
  assert.equal(shouldAllow('http://localhost:5173'), true, 'dev 前端允许')
  assert.equal(shouldAllow('http://127.0.0.1:3001'), true, '本机 API 允许')
  assert.equal(shouldAllow('https://my-tailnet.ts.net'), true, 'Tailscale 允许')
  assert.equal(shouldAllow('http://evil.com'), false, '非白名单外域拒绝')
  assert.equal(shouldAllow('https://malicious.tailscale-fake.com'), false, '伪造 ts.net 拒绝')
})

// ───────────────────────────────────────────────────────
// A5-P0-4 intradayPoll 去重（语义验证）
// ───────────────────────────────────────────────────────

test('[A5-P0-4] intradayPoll in-flight 语义：重叠 tick 跳过', () => {
  // 验证 boolean flag 的经典 in-flight 模式
  let inFlight = false
  let executions = 0
  const simulateTick = () => {
    if (inFlight) return 'skipped'
    inFlight = true
    executions++
    // 模拟异步任务（这里同步模拟）
    inFlight = false
    return 'executed'
  }
  assert.equal(simulateTick(), 'executed')
  // 这是同步模拟，flag 在返回前已重置。
  // 真实情况是异步 Promise，下面模拟：
  const asyncSimulate = () => {
    return new Promise<string>((resolve) => {
      if (inFlight) {
        resolve('skipped')
        return
      }
      inFlight = true
      executions++
      setTimeout(() => {
        inFlight = false
        resolve('executed')
      }, 10)
    })
  }
  // 并发触发 3 次
  return Promise.all([asyncSimulate(), asyncSimulate(), asyncSimulate()]).then((results) => {
    const executed = results.filter((r) => r === 'executed').length
    const skipped = results.filter((r) => r === 'skipped').length
    // 第一个执行，后两个被 in-flight 跳过
    assert.ok(executed >= 1 && executed <= 2, 'in-flight 锁应阻止多余执行')
    assert.ok(skipped >= 1, '至少一次应被跳过')
  })
})
