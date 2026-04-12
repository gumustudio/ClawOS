import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import express from 'express'
import request from 'supertest'

test('stock analysis routes expose config path and runtime overview using persisted files', async () => {
  const originalHome = process.env.HOME
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-stock-analysis-test-'))
  const stockAnalysisDir = path.join(tempHome, 'AI炒股分析')

  process.env.HOME = tempHome

  try {
    await fs.mkdir(path.join(tempHome, '.clawos'), { recursive: true })
    await fs.writeFile(
      path.join(tempHome, '.clawos', 'config.json'),
      JSON.stringify({ paths: { stockAnalysisDir } }, null, 2),
      'utf8',
    )

    await fs.mkdir(path.join(stockAnalysisDir, 'config'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'signals'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'portfolio'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'journal'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'reports', 'daily-runs'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'experts'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'market'), { recursive: true })
    await fs.mkdir(path.join(stockAnalysisDir, 'cache'), { recursive: true })
    await fs.writeFile(
      path.join(stockAnalysisDir, 'config', 'strategy.json'),
      JSON.stringify({
        maxPositions: 3,
        maxSinglePosition: 0.3,
        maxTotalPosition: 0.85,
        stopLossPercent: 3,
        takeProfitPercent1: 3,
        takeProfitPercent2: 6,
        maxHoldDays: 20,
        minTurnoverAmount20d: 50000000,
        minAmplitude20d: 5,
        maxContinuousDeclineDays: 15,
        marketThresholds: {
          bull_trend: { minCompositeScore: 72, minExpertConsensus: 0.55, minTechnicalScore: 62, minQuantScore: 58 },
          bear_trend: { minCompositeScore: 80, minExpertConsensus: 0.72, minTechnicalScore: 75, minQuantScore: 70 },
          high_volatility: { minCompositeScore: 78, minExpertConsensus: 0.68, minTechnicalScore: 72, minQuantScore: 68 },
          low_volatility_range: { minCompositeScore: 75, minExpertConsensus: 0.60, minTechnicalScore: 68, minQuantScore: 63 },
          normal_range: { minCompositeScore: 76, minExpertConsensus: 0.63, minTechnicalScore: 70, minQuantScore: 65 },
        },
        fusionWeightsByRegime: {
          bull_trend: { expert: 0.35, technical: 0.35, quant: 0.30 },
          bear_trend: { expert: 0.40, technical: 0.25, quant: 0.35 },
          high_volatility: { expert: 0.30, technical: 0.40, quant: 0.30 },
          low_volatility_range: { expert: 0.35, technical: 0.30, quant: 0.35 },
          normal_range: { expert: 0.35, technical: 0.35, quant: 0.30 },
        },
      }, null, 2),
      'utf8',
    )
    await fs.writeFile(
      path.join(stockAnalysisDir, 'config', 'runtime-status.json'),
      JSON.stringify({
        lastRunAt: '2026-04-01T08:05:00.000Z',
        lastSuccessAt: '2026-04-01T08:05:00.000Z',
        lastError: null,
        stockPoolRefreshedAt: '2026-04-01T07:55:00.000Z',
        latestSignalDate: '2026-04-01',
        runState: 'success',
        currentRun: null,
        quoteCacheAt: '2026-04-01T08:05:00.000Z',
        indexHistoryCacheAt: '2026-04-01T08:05:00.000Z',
        latestSuccessfulSignalDate: '2026-04-01',
        isUsingFallback: false,
        staleReasons: [],
      }, null, 2),
      'utf8',
    )
    await fs.writeFile(
      path.join(stockAnalysisDir, 'cache', 'stock-pool.json'),
      JSON.stringify([{ code: '600519', name: '贵州茅台', market: 'sh', exchange: '上海证券交易所' }], null, 2),
      'utf8',
    )
    await fs.writeFile(
      path.join(stockAnalysisDir, 'market', '2026-04-01.json'),
      JSON.stringify({
        asOfDate: '2026-04-01',
        trend: 'range_bound',
        volatility: 'normal_volatility',
        liquidity: 'normal_liquidity',
        sentiment: 'neutral',
        style: 'balanced',
        csi500Return20d: 1.2,
        annualizedVolatility20d: 18.5,
        averageTurnover20d: 123456789000,
        risingRatio: 0.52,
      }, null, 2),
      'utf8',
    )
    await fs.writeFile(
      path.join(stockAnalysisDir, 'signals', '2026-04-01.json'),
      JSON.stringify([
        {
          id: 'signal-600519-2026-04-01',
          tradeDate: '2026-04-01',
          code: '600519',
          name: '贵州茅台',
          latestPrice: 1459.44,
          sector: '沪市主板',
          snapshot: {
            code: '600519',
            name: '贵州茅台',
            market: 'sh',
            exchange: '上海证券交易所',
            sector: '沪市主板',
            latestPrice: 1459.44,
            changePercent: 0.65,
            turnoverRate: 0.23,
            totalMarketCap: 1830000000000,
            circulatingMarketCap: 1830000000000,
            averageTurnoverAmount20d: 4256185472,
            amplitude20d: 1.18,
            declineDays20d: 2,
            return5d: 3.6,
            return20d: 8.2,
            return60d: 11.1,
            volumeBreakout: 1.12,
            volatility20d: 18.2,
            volatilityRank: 0.44,
            pricePosition20d: 0.76,
            movingAverage5: 1440.22,
            movingAverage20: 1418.11,
            movingAverage60: 1380.44,
            scoreReason: ['成交额达标'],
          },
          expert: {
            bullishCount: 28,
            bearishCount: 9,
            neutralCount: 8,
            consensus: 0.76,
            score: 81,
            highlights: ['成交额达标'],
            risks: ['波动率在可接受区间'],
          },
          technical: { total: 78, absolute: 80, relative: 76, sector: 77, notes: ['站上 MA20'] },
          quant: { total: 74, momentum: 72, volumeBreakout: 63, volatility: 61, liquidity: 75, value: 58, notes: ['20日动量为正'] },
          marketState: {
            asOfDate: '2026-04-01',
            trend: 'range_bound',
            volatility: 'normal_volatility',
            liquidity: 'normal_liquidity',
            sentiment: 'neutral',
            style: 'balanced',
            csi500Return20d: 1.2,
            annualizedVolatility20d: 18.5,
            averageTurnover20d: 123456789000,
            risingRatio: 0.52,
          },
          thresholds: { minCompositeScore: 76, minExpertConsensus: 0.63, minTechnicalScore: 70, minQuantScore: 65 },
          compositeScore: 79,
          finalScore: 82,
          action: 'strong_buy',
          suggestedPosition: 0.3,
          suggestedPriceRange: { min: 1450, max: 1470 },
          stopLossPrice: 1415.66,
          takeProfitPrice1: 1503.22,
          takeProfitPrice2: 1546.99,
          passingChecks: ['专家共识达标'],
          vetoReasons: [],
          watchReasons: [],
          reasoning: ['测试策略'],
          confidence: 0.82,
          createdAt: '2026-04-01T08:05:00.000Z',
          decisionSource: 'system',
          userDecisionNote: null,
        },
      ], null, 2),
      'utf8',
    )
    await fs.writeFile(
      path.join(stockAnalysisDir, 'reports', 'daily-runs', '2026-04-01.json'),
      JSON.stringify({
        tradeDate: '2026-04-01',
        generatedAt: '2026-04-01T08:05:00.000Z',
        marketState: {
          asOfDate: '2026-04-01',
          trend: 'range_bound',
          volatility: 'normal_volatility',
          liquidity: 'normal_liquidity',
          sentiment: 'neutral',
          style: 'balanced',
          csi500Return20d: 1.2,
          annualizedVolatility20d: 18.5,
          averageTurnover20d: 123456789000,
          risingRatio: 0.52,
        },
        stockPoolSize: 1,
        candidatePoolSize: 1,
        signalCount: 1,
        watchCount: 0,
        topSignals: ['signal-600519-2026-04-01'],
        usedFallbackData: false,
        staleReasons: [],
      }, null, 2),
      'utf8',
    )
    await fs.writeFile(path.join(stockAnalysisDir, 'portfolio', 'positions.json'), '[]\n', 'utf8')
    await fs.writeFile(path.join(stockAnalysisDir, 'journal', 'trades.json'), '[]\n', 'utf8')
    await fs.writeFile(path.join(stockAnalysisDir, 'journal', 'watch-logs.json'), '[]\n', 'utf8')
    await fs.writeFile(path.join(stockAnalysisDir, 'reports', 'weekly-summary.json'), '[]\n', 'utf8')
    await fs.writeFile(path.join(stockAnalysisDir, 'experts', 'model-groups.json'), '[]\n', 'utf8')

    const { default: stockAnalysisRoutes } = await import(`../src/routes/stock-analysis?ts=${Date.now()}-overview`)
    const app = express()
    app.use(express.json())
    app.use('/api/system/stock-analysis', stockAnalysisRoutes)

    const overviewResponse = await request(app).get('/api/system/stock-analysis/overview')
    assert.equal(overviewResponse.status, 200)
    assert.equal(overviewResponse.body.success, true)
    assert.equal(overviewResponse.body.data.stockAnalysisDir, stockAnalysisDir)
    assert.equal(overviewResponse.body.data.topSignals.length, 1)
    assert.equal(overviewResponse.body.data.topSignals[0].code, '600519')

    const signalsResponse = await request(app).get('/api/system/stock-analysis/signals')
    assert.equal(signalsResponse.status, 200)
    assert.equal(signalsResponse.body.success, true)
    assert.equal(signalsResponse.body.data[0].action, 'strong_buy')

    const healthResponse = await request(app).get('/api/system/stock-analysis/health')
    assert.equal(healthResponse.status, 200)
    assert.equal(healthResponse.body.success, true)
    assert.equal(healthResponse.body.data.ok, true)
    assert.equal(healthResponse.body.data.dataState, 'ready')

    const configResponse = await request(app).get('/api/system/stock-analysis/config')
    assert.equal(configResponse.status, 200)
    assert.equal(configResponse.body.success, true)
    assert.equal(configResponse.body.data.maxPositions, 3)
  } finally {
    process.env.HOME = originalHome
    await fs.rm(tempHome, { recursive: true, force: true })
  }
})
