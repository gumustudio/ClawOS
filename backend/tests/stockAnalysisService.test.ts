import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

import type { StockAnalysisAIConfig } from '../src/services/stock-analysis/types'
import { _testing as serviceTesting } from '../src/services/stock-analysis/service'

const { buildMarketState } = serviceTesting

async function createTempStockAnalysisDir() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-stock-analysis-service-'))
  return {
    tempRoot,
    stockAnalysisDir: path.join(tempRoot, 'AI炒股分析'),
  }
}

function createExecFileMock(handlers: (script: string) => { stdout: string; stderr?: string }) {
  const mockedExecFile = ((file: string, args?: readonly string[] | null, options?: object | null, callback?: (...callbackArgs: unknown[]) => void) => {
    const normalizedArgs = Array.isArray(args) ? args : []
    let result: { stdout: string; stderr?: string }

    if (file === 'python3' && normalizedArgs[0] === '-c' && normalizedArgs[1] === 'import site; print(site.getusersitepackages())') {
      result = { stdout: '/tmp/python-site\n', stderr: '' }
    } else if (file === 'python3' && normalizedArgs[0] === '-c') {
      result = handlers(String(normalizedArgs[1] ?? ''))
    } else {
      throw new Error(`unexpected execFile call: ${file} ${normalizedArgs.join(' ')}`)
    }

    if (typeof options === 'function') {
      options(null, result.stdout, result.stderr ?? '')
    } else if (typeof callback === 'function') {
      callback(null, result.stdout, result.stderr ?? '')
    }

    return {} as childProcess.ChildProcess
  }) as typeof childProcess.execFile

  ;(mockedExecFile as typeof childProcess.execFile & { [promisify.custom]?: unknown })[promisify.custom] = async (file: string, args?: readonly string[] | null) => {
    const normalizedArgs = Array.isArray(args) ? args : []
    if (file === 'python3' && normalizedArgs[0] === '-c' && normalizedArgs[1] === 'import site; print(site.getusersitepackages())') {
      return { stdout: '/tmp/python-site\n', stderr: '' }
    }
    if (file === 'python3' && normalizedArgs[0] === '-c') {
      const result = handlers(String(normalizedArgs[1] ?? ''))
      return { stdout: result.stdout, stderr: result.stderr ?? '' }
    }
    throw new Error(`unexpected execFile call: ${file} ${normalizedArgs.join(' ')}`)
  }

  return mockedExecFile
}

const TEST_AI_CONFIG: StockAnalysisAIConfig = {
  providers: [
    {
      id: 'provider-1',
      name: 'Mock Provider',
      provider: 'dashscope',
      apiKey: 'mock-key',
      endpoint: null,
      model: 'qwen3.6-plus',
      maxTokens: 4096,
      temperature: 0.2,
      timeoutMs: 30_000,
      enabled: true,
    },
  ],
  experts: [
    {
      id: 'macro_llm_1',
      name: '宏观专家',
      layer: 'macro',
      stance: 'balanced',
      temperature: 0.2,
      enabled: true,
      assignedModel: 'qwen3.6-plus',
      providerId: 'provider-1',
      providerModelId: null,
    },
  ],
}

test('buildMarketState uses multi-source social sentiment to avoid false bull trend', () => {
  const stockPool = [
    { code: '600001', name: 'A', market: 'sh' as const, exchange: 'SSE' },
    { code: '600002', name: 'B', market: 'sh' as const, exchange: 'SSE' },
    { code: '600003', name: 'C', market: 'sh' as const, exchange: 'SSE' },
    { code: '600004', name: 'D', market: 'sh' as const, exchange: 'SSE' },
  ]
  const quotes = new Map(stockPool.map((item, index) => [item.code, {
    code: item.code,
    name: item.name,
    latestPrice: 10,
    changePercent: index === 0 ? 1 : -1,
    open: 10,
    high: 11,
    low: 9,
    previousClose: 10,
    turnoverRate: 1,
    totalMarketCap: 100,
    circulatingMarketCap: 90,
    amount: 100_000_000,
  }]))
  const indexHistory = Array.from({ length: 30 }, (_, index) => ({
    日期: `2026-04-${String(index + 1).padStart(2, '0')}`,
    收盘: index === 9 ? 100 : index === 29 ? 108 : 100 + index * 0.2,
    成交额: 100_000_000_000 + index,
  }))

  const marketState = buildMarketState(stockPool, quotes, indexHistory, { score: -0.3, sourceCount: 3 })

  assert.equal(marketState.trend, 'range_bound')
  assert.equal(marketState.sentiment, 'pessimistic')
  assert.equal(marketState.socialSentimentScore, -0.3)
  assert.equal(marketState.socialSentimentSourceCount, 3)
})

test('stock analysis daily run uses direct Eastmoney index history before AKShare fallback', async () => {
  const originalFetch = global.fetch
  const originalExecFile = childProcess.execFile
  const { tempRoot, stockAnalysisDir } = await createTempStockAnalysisDir()

  const execCalls: string[] = []

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/api/qt/ulist.np/get')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            diff: [
              { f12: '600519', f14: '贵州茅台', f2: 1459.44, f3: 0.65, f8: 0.23, f15: 1465, f16: 1440, f17: 1450, f18: 1450, f20: 1830000000000, f21: 1830000000000 },
            ],
          },
        }),
      } as Response
    }

    if (url.includes('secid=1.000905')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            klines: [
              '2026-03-26,1000,1000,1001,999,100000,100000000000,1,0,0,0',
              '2026-03-27,1000,1006,1008,998,110000,120000000000,1,0.6,6,0',
              '2026-03-30,1006,1010,1015,1005,120000,125000000000,1,0.4,4,0',
              '2026-03-31,1010,1014,1018,1008,130000,130000000000,1,0.4,4,0',
              '2026-04-01,1014,1018,1020,1012,140000,135000000000,1,0.39,4,0',
            ],
          },
        }),
      } as Response
    }

    if (url.includes('/api/qt/stock/kline/get?secid=1.600519')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            klines: Array.from({ length: 40 }, (_, index) => {
              const day = String(index + 1).padStart(2, '0')
              const close = 1400 + index * 2
              return `2026-03-${day},${close - 1},${close},${close + 2},${close - 3},100000,500000000,5,1,2,3.2`
            }),
          },
        }),
      } as Response
    }

    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch

  childProcess.execFile = createExecFileMock((script) => {
    execCalls.push(script)
    if (script.includes("index_stock_cons_csindex(symbol='000905')")) {
      return {
        stdout: JSON.stringify({
          success: true,
          data: [{ 成分券代码: '600519', 成分券名称: '贵州茅台', 交易所: '上海证券交易所' }],
        }),
      }
    }
    throw new Error(`unexpected python script: ${script.slice(0, 80)}`)
  })

  try {
    const service = await import(`../src/services/stock-analysis/service?ts=${Date.now()}`)
    const store = await import(`../src/services/stock-analysis/store?ts=${Date.now()}`)

    const result = await service.runStockAnalysisDaily(stockAnalysisDir)
    const runtimeStatus = await store.readStockAnalysisRuntimeStatus(stockAnalysisDir)
    const indexHistoryCache = await store.readStockAnalysisIndexHistoryCache(stockAnalysisDir)

    assert.equal(result.usedFallbackData, false)
    assert.equal(runtimeStatus.isUsingFallback, false)
    assert.equal(runtimeStatus.runState, 'success')
    assert.equal(indexHistoryCache?.items.length, 5)
    assert.equal(indexHistoryCache?.items.at(-1)?.日期, '2026-04-01')
    assert.equal(execCalls.some((script) => script.includes("index_zh_a_hist(symbol='000905'")), false)
  } finally {
    global.fetch = originalFetch
    childProcess.execFile = originalExecFile
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('stock analysis daily run falls back to cached index history when direct and AKShare sources both fail', async () => {
  const originalFetch = global.fetch
  const originalExecFile = childProcess.execFile
  const { tempRoot, stockAnalysisDir } = await createTempStockAnalysisDir()

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/api/qt/ulist.np/get')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            diff: [
              { f12: '600519', f14: '贵州茅台', f2: 1459.44, f3: 0.65, f8: 0.23, f15: 1465, f16: 1440, f17: 1450, f18: 1450, f20: 1830000000000, f21: 1830000000000 },
            ],
          },
        }),
      } as Response
    }

    if (url.includes('/api/qt/stock/kline/get?secid=1.600519')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            klines: Array.from({ length: 40 }, (_, index) => {
              const day = String(index + 1).padStart(2, '0')
              const close = 1400 + index * 2
              return `2026-03-${day},${close - 1},${close},${close + 2},${close - 3},100000,500000000,5,1,2,3.2`
            }),
          },
        }),
      } as Response
    }

    if (url.includes('push2his.eastmoney.com/api/qt/stock/kline/get?secid=')) {
      throw new Error('eastmoney index history unavailable')
    }

    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch

  childProcess.execFile = createExecFileMock((script) => {
    if (script.includes("index_stock_cons_csindex(symbol='000905')")) {
      return {
        stdout: JSON.stringify({
          success: true,
          data: [{ 成分券代码: '600519', 成分券名称: '贵州茅台', 交易所: '上海证券交易所' }],
        }),
      }
    }
    if (script.includes("index_zh_a_hist(symbol='000905'")) {
      return { stdout: JSON.stringify({ success: false, error: 'RemoteDisconnected' }) }
    }
    throw new Error(`unexpected python script: ${script.slice(0, 80)}`)
  })

  try {
    const store = await import(`../src/services/stock-analysis/store?ts=${Date.now()}`)
    const service = await import(`../src/services/stock-analysis/service?ts=${Date.now()}`)

    await store.ensureStockAnalysisStructure(stockAnalysisDir)
    await store.saveStockAnalysisIndexHistoryCache(stockAnalysisDir, {
      fetchedAt: '2026-03-01T08:00:00.000Z',
      items: [
        { 日期: '2026-03-31', 收盘: 1008, 成交额: 120000000000 },
        { 日期: '2026-04-01', 收盘: 1012, 成交额: 125000000000 },
      ],
    })

    const result = await service.runStockAnalysisDaily(stockAnalysisDir)
    const runtimeStatus = await store.readStockAnalysisRuntimeStatus(stockAnalysisDir)

    assert.equal(result.usedFallbackData, true)
    assert.equal(runtimeStatus.isUsingFallback, true)
    assert.equal(runtimeStatus.runState, 'success')
    assert.match(result.staleReasons.join(' | '), /指数历史刷新失败，已回退到本地缓存/)
  } finally {
    global.fetch = originalFetch
    childProcess.execFile = originalExecFile
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('stock analysis daily run succeeds with Tencent as primary source even when Eastmoney endpoints are broken', async () => {
  const originalFetch = global.fetch
  const originalExecFile = childProcess.execFile
  const { tempRoot, stockAnalysisDir } = await createTempStockAnalysisDir()

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('secid=1.000905')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            klines: [
              '2026-03-26,1000,1000,1001,999,100000,100000000000,1,0,0,0',
              '2026-03-27,1000,1006,1008,998,110000,120000000000,1,0.6,6,0',
              '2026-03-30,1006,1010,1015,1005,120000,125000000000,1,0.4,4,0',
              '2026-03-31,1010,1014,1018,1008,130000,130000000000,1,0.4,4,0',
              '2026-04-01,1014,1018,1020,1012,140000,135000000000,1,0.39,4,0',
            ],
          },
        }),
      } as Response
    }

    if (url.includes('/api/qt/ulist.np/get')) {
      throw new Error('eastmoney quote unavailable')
    }

    if (url.includes('/api/qt/stock/kline/get?secid=1.600519')) {
      throw new Error('eastmoney history unavailable')
    }

    if (url.includes('qt.gtimg.cn/q=')) {
      return {
        ok: true,
        text: async () => 'v_sh600519="1~贵州茅台~600519~1459.88~1459.44~1459.44~21064~10319~10746~1459.44~1~1459.40~1~1459.38~1~1459.37~10~1459.30~6~1459.88~3~1459.98~4~1459.99~19~1460.00~93~1460.02~1~~20260402161401~0.44~0.03~1464.88~1452.10~1459.88/21064/3071809846~21064~307181~0.17~20.31~~1464.88~1452.10~0.88~18281.64~18281.64~8.05~1605.38~1313.50~0.61~-101~1458.30~21.22~21.20~~~0.52~307180.9846~0.0000~0~ ~GP-A~6.01~4.19~3.54~35.02~30.58~1593.44~1322.01~0.48~4.35~4.13~1252270215~1252270215~-72.66~4.41~1252270215~~~-2.51~0.07~~CNY~0~___D__F__N~1459.00~17~";\n',
      } as Response
    }

    if (url.includes('appstock/app/fqkline/get?param=sh600519')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            sh600519: {
              qfqday: Array.from({ length: 40 }, (_, index) => {
                const day = String(index + 1).padStart(2, '0')
                const close = 1400 + index * 2
                return [`2026-03-${day}`, String(close - 1), String(close), String(close + 2), String(close - 3), '100000']
              }),
            },
          },
        }),
      } as Response
    }

    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch

  childProcess.execFile = createExecFileMock((script) => {
    if (script.includes("index_stock_cons_csindex(symbol='000905')")) {
      return {
        stdout: JSON.stringify({
          success: true,
          data: [{ 成分券代码: '600519', 成分券名称: '贵州茅台', 交易所: '上海证券交易所' }],
        }),
      }
    }
    throw new Error(`unexpected python script: ${script.slice(0, 80)}`)
  })

  try {
    const service = await import(`../src/services/stock-analysis/service?ts=${Date.now()}`)
    const result = await service.runStockAnalysisDaily(stockAnalysisDir)

    // 腾讯为主源成功获取新鲜数据，不应标记为 fallback
    assert.equal(result.usedFallbackData, false)
    assert.equal(result.staleReasons.length, 0)
  } finally {
    global.fetch = originalFetch
    childProcess.execFile = originalExecFile
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('stock analysis daily run still executes LLM voting when positions are full', async () => {
  const originalFetch = global.fetch
  const originalExecFile = childProcess.execFile
  const originalDateNow = Date.now
  const { tempRoot, stockAnalysisDir } = await createTempStockAnalysisDir()

  global.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('/api/qt/ulist.np/get')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            diff: [
              { f12: '600519', f14: '贵州茅台', f2: 1459.44, f3: 0.65, f8: 0.23, f15: 1465, f16: 1440, f17: 1450, f18: 1450, f20: 1830000000000, f21: 1830000000000 },
            ],
          },
        }),
      } as Response
    }

    if (url.includes('secid=1.000905')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            klines: [
              '2026-03-26,1000,1000,1001,999,100000,100000000000,1,0,0,0',
              '2026-03-27,1000,1006,1008,998,110000,120000000000,1,0.6,6,0',
              '2026-03-30,1006,1010,1015,1005,120000,125000000000,1,0.4,4,0',
              '2026-03-31,1010,1014,1018,1008,130000,130000000000,1,0.4,4,0',
              '2026-04-01,1014,1018,1020,1012,140000,135000000000,1,0.39,4,0',
            ],
          },
        }),
      } as Response
    }

    if (url.includes('/api/qt/stock/kline/get?secid=1.600519')) {
      return {
        ok: true,
        json: async () => ({
          data: {
            klines: Array.from({ length: 40 }, (_, index) => {
              const day = String(index + 1).padStart(2, '0')
              const close = 1400 + index * 2
              return `2026-03-${day},${close - 1},${close},${close + 2},${close - 3},100000,500000000,5,1,2,3.2`
            }),
          },
        }),
      } as Response
    }

    throw new Error(`unexpected fetch: ${url}`)
  }) as typeof fetch

  childProcess.execFile = createExecFileMock((script) => {
    if (script.includes("index_stock_cons_csindex(symbol='000905')")) {
      return {
        stdout: JSON.stringify({
          success: true,
          data: [{ 成分券代码: '600519', 成分券名称: '贵州茅台', 交易所: '上海证券交易所' }],
        }),
      }
    }
    throw new Error(`unexpected python script: ${script.slice(0, 80)}`)
  })

  Date.now = () => 1_760_000_000_000

  try {
    const service = await import(`../src/services/stock-analysis/service?ts=${Date.now()}-force-full-analysis`)
    const store = await import(`../src/services/stock-analysis/store?ts=${Date.now()}-force-full-analysis`)
    const llmInference = await import(`../src/services/stock-analysis/llm-inference?ts=${Date.now()}-force-full-analysis`)

    let runExpertVotingCalls = 0
    const originalRunExpertVoting = llmInference.runExpertVoting
    llmInference.runExpertVoting = (async () => {
      runExpertVotingCalls += 1
      return {
        bullishCount: 1,
        bearishCount: 0,
        neutralCount: 0,
        consensus: 1,
        score: 82,
        highlights: ['LLM 投票成功'],
        risks: [],
        votes: [],
        llmSuccessCount: 1,
        llmFallbackCount: 0,
        ruleFallbackCount: 0,
        fallbackCount: 0,
        isSimulated: false,
        degradeRatio: 0,
      }
    }) as typeof llmInference.runExpertVoting

    await store.ensureStockAnalysisStructure(stockAnalysisDir)
    await store.saveStockAnalysisAIConfig(stockAnalysisDir, TEST_AI_CONFIG)
    await store.saveStockAnalysisPositions(stockAnalysisDir, [
      {
        id: 'pos-1', code: '000001', name: '仓位1', weight: 0.33, costPrice: 10, latestPrice: 10, stopLossPrice: 9.7, takeProfitPrice1: 10.3, takeProfitPrice2: 10.6, highestPriceSinceOpen: 10, openedAt: '2026-04-01T09:35:00.000Z', sourceSignalId: null, action: 'hold', actionReason: 'test', reviewNote: null,
      },
      {
        id: 'pos-2', code: '000002', name: '仓位2', weight: 0.33, costPrice: 10, latestPrice: 10, stopLossPrice: 9.7, takeProfitPrice1: 10.3, takeProfitPrice2: 10.6, highestPriceSinceOpen: 10, openedAt: '2026-04-01T09:35:00.000Z', sourceSignalId: null, action: 'hold', actionReason: 'test', reviewNote: null,
      },
      {
        id: 'pos-3', code: '000003', name: '仓位3', weight: 0.34, costPrice: 10, latestPrice: 10, stopLossPrice: 9.7, takeProfitPrice1: 10.3, takeProfitPrice2: 10.6, highestPriceSinceOpen: 10, openedAt: '2026-04-01T09:35:00.000Z', sourceSignalId: null, action: 'hold', actionReason: 'test', reviewNote: null,
      },
    ])

    await service.runStockAnalysisDaily(stockAnalysisDir)
    assert.equal(runExpertVotingCalls, 1, 'daily run 在满仓时也应继续执行 LLM')

    llmInference.runExpertVoting = originalRunExpertVoting
  } finally {
    Date.now = originalDateNow
    global.fetch = originalFetch
    childProcess.execFile = originalExecFile
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
})

test('liquidity crisis requires volume collapse plus broad weakness and pessimism', () => {
  const { _testing: serviceTesting } = require('../src/services/stock-analysis/service') as typeof import('../src/services/stock-analysis/service')
  const { isLiquidityCrisis, isLowLiquidityGuardrail } = serviceTesting
  const { DEFAULT_STOCK_ANALYSIS_CONFIG } = require('../src/services/stock-analysis/store') as typeof import('../src/services/stock-analysis/store')

  const baseMarketState = {
    asOfDate: '2026-04-08',
    trend: 'bear_trend',
    volatility: 'normal_volatility',
    liquidity: 'low_liquidity',
    sentiment: 'optimistic',
    style: 'small_cap',
    csi500Return20d: -8.56,
    annualizedVolatility20d: 26.96,
    averageTurnover20d: 1733180300729.02,
    risingRatio: 0.94,
    volatilityPercentile: 0.5,
    volumePercentile: 0.025,
  } as const

  assert.equal(isLiquidityCrisis(baseMarketState, DEFAULT_STOCK_ANALYSIS_CONFIG), false, '大涨普涨日不应被判为流动性危机')
  assert.equal(isLowLiquidityGuardrail(baseMarketState, DEFAULT_STOCK_ANALYSIS_CONFIG), true, '应降级为低流动性护栏而非危机')

  const stressedMarketState = {
    ...baseMarketState,
    sentiment: 'pessimistic',
    risingRatio: 0.22,
  } as const

  assert.equal(isLiquidityCrisis(stressedMarketState, DEFAULT_STOCK_ANALYSIS_CONFIG), true, '缩量 + 普跌 + 悲观才应判为流动性危机')
})

test('market level risk uses position haircut instead of buy veto on low-liquidity-only days', () => {
  const { _testing: serviceTesting } = require('../src/services/stock-analysis/service') as typeof import('../src/services/stock-analysis/service')
  const { evaluateMarketLevelRisk } = serviceTesting
  const { DEFAULT_STOCK_ANALYSIS_CONFIG } = require('../src/services/stock-analysis/store') as typeof import('../src/services/stock-analysis/store')

  const marketRisk = evaluateMarketLevelRisk({
    asOfDate: '2026-04-08',
    trend: 'bear_trend',
    volatility: 'normal_volatility',
    liquidity: 'low_liquidity',
    sentiment: 'optimistic',
    style: 'small_cap',
    csi500Return20d: -8.56,
    annualizedVolatility20d: 26.96,
    averageTurnover20d: 1733180300729.02,
    risingRatio: 0.94,
    volatilityPercentile: 0.5,
    volumePercentile: 0.025,
  }, DEFAULT_STOCK_ANALYSIS_CONFIG)

  assert.equal(marketRisk.liquidityCrisisActive, false)
  assert.equal(marketRisk.lowLiquidityActive, true)
  assert.equal(marketRisk.buyAllowed, true)
  assert.equal(marketRisk.newPositionsAllowed, true)
  // v1.31.0 起 effectiveMaxPositionRatio 跟随 config.maxTotalPosition（默认 1.0），不再由 lowLiquidityGuardrail 压制
  assert.equal(marketRisk.effectiveMaxPositionRatio, 1.0)
})

test('low liquidity guardrail thresholds are configurable', () => {
  const { _testing: serviceTesting } = require('../src/services/stock-analysis/service') as typeof import('../src/services/stock-analysis/service')
  const { isLowLiquidityGuardrail, evaluateMarketLevelRisk } = serviceTesting
  const { DEFAULT_STOCK_ANALYSIS_CONFIG } = require('../src/services/stock-analysis/store') as typeof import('../src/services/stock-analysis/store')

  const customConfig = {
    ...DEFAULT_STOCK_ANALYSIS_CONFIG,
    lowLiquidityGuardrail: {
      ...DEFAULT_STOCK_ANALYSIS_CONFIG.lowLiquidityGuardrail,
      volumePercentileThreshold: 0.05,
      maxPositionRatio: 0.6,
    },
  }

  const marketState = {
    asOfDate: '2026-04-08',
    trend: 'range_bound',
    volatility: 'normal_volatility',
    liquidity: 'low_liquidity',
    sentiment: 'optimistic',
    style: 'balanced',
    csi500Return20d: 3.2,
    annualizedVolatility20d: 22,
    averageTurnover20d: 1733180300729.02,
    risingRatio: 0.94,
    volatilityPercentile: 0.4,
    volumePercentile: 0.08,
  } as const

  assert.equal(isLowLiquidityGuardrail(marketState, customConfig), false)
  const marketRisk = evaluateMarketLevelRisk(marketState, customConfig)
  assert.equal(marketRisk.lowLiquidityActive, false)
  // v1.31.0 起 effectiveMaxPositionRatio 跟随 config.maxTotalPosition（默认 1.0）
  assert.equal(marketRisk.effectiveMaxPositionRatio, 1.0)
})
