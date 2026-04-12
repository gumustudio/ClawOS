import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildFactPoolSummary,
  buildExpertProfile,
  buildMemoryContext,
  formatFactPoolSummaryForPrompt,
  formatExpertProfileForPrompt,
  _testing,
} from '../src/services/stock-analysis/memory'

import type {
  ExpertDailyMemoryEntry,
  ExpertLongTermMemory,
  ExpertMemory,
  ExpertMidTermMemory,
  ExpertProfile,
  FactPool,
  FactPoolSummary,
  StockAnalysisExpertPerformanceEntry,
} from '../src/services/stock-analysis/types'

const {
  buildMacroSummary,
  buildPolicySummary,
  buildAnnouncementHighlights,
  buildIndustryHighlights,
  buildSentimentSummary,
  buildGlobalMarketSummary,
  formatChange,
  computeRecentStreak,
  formatShortTermMemory,
  formatMidTermMemory,
  extractMemoryEntriesFromSignals,
  buildStatisticalMidTermMemory,
  getRecentTradeDates,
  parseCompressionResponse,
  parseLongTermResponse,
  mergeLongTermMemory,
  buildLongTermStatistical,
} = _testing

// ==================== 测试辅助函数 ====================

function createEmptyFactPool(overrides?: Partial<FactPool>): FactPool {
  return {
    updatedAt: '2026-04-03T16:00:00Z',
    tradeDate: '2026-04-03',
    macroData: null,
    policyEvents: [],
    companyAnnouncements: [],
    industryNews: [],
    socialSentiment: [],
    globalMarkets: null,
    priceVolumeExtras: null,
    dataQuality: null,
    agentLogs: [],
    ...overrides,
  }
}

function createMockPerformanceEntry(
  overrides?: Partial<StockAnalysisExpertPerformanceEntry>,
): StockAnalysisExpertPerformanceEntry {
  return {
    expertId: 'expert_01',
    expertName: '技术分析专家',
    layer: 'technical',
    predictionCount: 20,
    correctCount: 14,
    winRate: 0.7,
    averageConfidence: 72,
    calibration: 0.15,
    weight: 1.2,
    lastPredictionDate: '2026-04-03',
    recentOutcomes: [
      { tradeDate: '2026-04-03', code: '600519', verdict: 'bullish', confidence: 80, actualReturnPercent: 1.5, correct: true },
      { tradeDate: '2026-04-02', code: '000858', verdict: 'bearish', confidence: 65, actualReturnPercent: -0.8, correct: true },
      { tradeDate: '2026-04-01', code: '601318', verdict: 'bullish', confidence: 70, actualReturnPercent: -0.3, correct: false },
    ],
    ...overrides,
  }
}

function createMockMemoryEntry(overrides?: Partial<ExpertDailyMemoryEntry>): ExpertDailyMemoryEntry {
  return {
    tradeDate: '2026-04-03',
    expertId: 'expert_01',
    code: '600519',
    name: '贵州茅台',
    verdict: 'bullish',
    confidence: 80,
    reason: '量价齐升，突破关键阻力位',
    actualReturnNextDay: null,
    wasCorrect: null,
    ...overrides,
  }
}

// ==================== buildFactPoolSummary 测试 ====================

test('buildFactPoolSummary: 空 FactPool 返回全 null 摘要', () => {
  const result = buildFactPoolSummary(createEmptyFactPool())

  assert.equal(result.macroSummary, null)
  assert.equal(result.policySummary, null)
  assert.deepStrictEqual(result.announcementHighlights, [])
  assert.deepStrictEqual(result.industryHighlights, [])
  assert.equal(result.sentimentSummary, null)
  assert.equal(result.globalMarketSummary, null)
})

test('buildFactPoolSummary: 完整 FactPool 返回各维度摘要', () => {
  const factPool = createEmptyFactPool({
    macroData: {
      tradeDate: '2026-04-03',
      gdpGrowth: 5.2,
      cpi: 1.8,
      pmi: 51.3,
      interestRate: 3.45,
      exchangeRateUsdCny: 7.24,
      treasuryYield10y: 2.35,
      m2Growth: null,
      socialFinancing: null,
      industrialProduction: null,
      retailSales: null,
      fixedAssetInvestment: null,
      tradeBalance: null,
      shibor: null,
      updatedAt: '2026-04-03T16:00:00Z',
    },
    policyEvents: [
      { id: '1', title: '央行降准0.25个百分点', source: 'gov', publishedAt: '2026-04-03', importance: 'major', affectedSectors: ['金融'], summary: '' },
      { id: '2', title: '新能源补贴政策延续', source: 'gov', publishedAt: '2026-04-03', importance: 'minor', affectedSectors: ['新能源'], summary: '' },
    ],
    companyAnnouncements: [
      { code: '600519', name: '贵州茅台', title: '年报预增30%', publishedAt: '2026-04-03', importance: 'major', category: 'earnings' },
    ],
    industryNews: [
      { id: '1', title: 'AI芯片需求持续爆发', source: 'caixin', publishedAt: '2026-04-03', sector: '半导体', sentiment: 'positive' },
    ],
    globalMarkets: {
      tradeDate: '2026-04-03',
      sp500Change: 1.25,
      nasdaqChange: 1.8,
      hsiChange: -0.5,
      a50FuturesChange: 0.3,
      crudeOilChange: -2.1,
      goldChange: 0.8,
      vix: 18.5,
      updatedAt: '2026-04-03T16:00:00Z',
    },
  })

  const result = buildFactPoolSummary(factPool)

  assert.ok(result.macroSummary !== null, '宏观摘要不应为 null')
  assert.ok(result.macroSummary!.includes('GDP增速5.2%'))
  assert.ok(result.macroSummary!.includes('CPI同比1.8%'))
  assert.ok(result.macroSummary!.includes('PMI 51.3'))

  assert.ok(result.policySummary !== null)
  assert.ok(result.policySummary!.includes('央行降准'))

  assert.equal(result.announcementHighlights.length, 1)
  assert.ok(result.announcementHighlights[0].includes('贵州茅台'))

  assert.equal(result.industryHighlights.length, 1)
  assert.ok(result.industryHighlights[0].includes('AI芯片'))

  assert.ok(result.globalMarketSummary !== null)
  assert.ok(result.globalMarketSummary!.includes('标普500'))
})

// ==================== buildExpertProfile 测试 ====================

test('buildExpertProfile: 正确构建专家画像', () => {
  const entry = createMockPerformanceEntry()
  const profile = buildExpertProfile(entry)

  assert.equal(profile.expertId, 'expert_01')
  assert.equal(profile.expertName, '技术分析专家')
  assert.equal(profile.predictionCount, 20)
  assert.equal(profile.winRate, 0.7)
  assert.equal(profile.avgConfidence, 72)
  assert.equal(profile.calibration, 0.15)
  assert.equal(typeof profile.recentStreak, 'string')
  assert.ok(profile.recentStreak.length > 0)
})

test('buildExpertProfile: 连续正确时显示连胜', () => {
  const entry = createMockPerformanceEntry({
    recentOutcomes: [
      { tradeDate: '2026-04-03', code: '600519', verdict: 'bullish', confidence: 80, actualReturnPercent: 1.5, correct: true },
      { tradeDate: '2026-04-02', code: '000858', verdict: 'bearish', confidence: 65, actualReturnPercent: -0.8, correct: true },
      { tradeDate: '2026-04-01', code: '601318', verdict: 'bullish', confidence: 70, actualReturnPercent: 0.3, correct: true },
      { tradeDate: '2026-03-31', code: '002594', verdict: 'bullish', confidence: 75, actualReturnPercent: 2.0, correct: true },
    ],
  })
  const profile = buildExpertProfile(entry)

  assert.ok(profile.recentStreak.includes('连续正确'))
})

// ==================== computeRecentStreak 测试 ====================

test('computeRecentStreak: 空数组返回暂无预测记录', () => {
  assert.equal(computeRecentStreak([]), '暂无预测记录')
})

test('computeRecentStreak: 连续3次正确返回连胜描述', () => {
  const result = computeRecentStreak([true, true, true, false])
  assert.ok(result.includes('连续正确'))
})

test('computeRecentStreak: 连续3次错误返回连败描述', () => {
  const result = computeRecentStreak([false, false, false, true])
  assert.ok(result.includes('连续错误'))
})

test('computeRecentStreak: 无明显连续时返回统计描述', () => {
  const result = computeRecentStreak([true, false, true])
  assert.ok(result.includes('近') && result.includes('次'))
})

// ==================== formatChange 测试 ====================

test('formatChange: 正数带+号', () => {
  assert.equal(formatChange(1.25), '+1.25%')
})

test('formatChange: 负数带-号', () => {
  assert.equal(formatChange(-2.1), '-2.10%')
})

test('formatChange: 零值', () => {
  assert.equal(formatChange(0), '+0.00%')
})

// ==================== formatFactPoolSummaryForPrompt 测试 ====================

test('formatFactPoolSummaryForPrompt: 空摘要返回空字符串', () => {
  const summary: FactPoolSummary = {
    macroSummary: null,
    policySummary: null,
    announcementHighlights: [],
    industryHighlights: [],
    sentimentSummary: null,
    globalMarketSummary: null,
  }
  assert.equal(formatFactPoolSummaryForPrompt(summary), '')
})

test('formatFactPoolSummaryForPrompt: 有数据时生成 Markdown 列表', () => {
  const summary: FactPoolSummary = {
    macroSummary: 'GDP增速5.2%',
    policySummary: '央行降准',
    announcementHighlights: ['贵州茅台: 年报预增30%'],
    industryHighlights: ['AI芯片需求持续爆发'],
    sentimentSummary: '市场情绪偏乐观，牛熊比 1.5:1',
    globalMarketSummary: '标普500 +1.25%',
  }
  const result = formatFactPoolSummaryForPrompt(summary)

  assert.ok(result.includes('- 宏观: GDP增速5.2%'))
  assert.ok(result.includes('- 政策: 央行降准'))
  assert.ok(result.includes('- 公告: 贵州茅台: 年报预增30%'))
  assert.ok(result.includes('- 行业: AI芯片需求持续爆发'))
  assert.ok(result.includes('- 舆情:'))
  assert.ok(result.includes('- 全球: 标普500 +1.25%'))
})

// ==================== formatExpertProfileForPrompt 测试 ====================

test('formatExpertProfileForPrompt: 正确格式化专家画像', () => {
  const profile: ExpertProfile = {
    expertId: 'expert_01',
    expertName: '技术分析专家',
    predictionCount: 20,
    winRate: 0.7,
    avgConfidence: 72,
    calibration: 0.15,
    bestMarketRegime: null,
    worstMarketRegime: null,
    recentStreak: '最近3次连续正确（近4次中3次正确）',
  }
  const result = formatExpertProfileForPrompt(profile)

  assert.ok(result.includes('你的历史表现'))
  assert.ok(result.includes('预测次数: 20'))
  assert.ok(result.includes('胜率: 70.0%'))
  assert.ok(result.includes('校准度: 0.15'))
  assert.ok(result.includes('最近3次连续正确'))
})

// ==================== buildMemoryContext 测试 ====================

test('buildMemoryContext: undefined 返回空字符串', () => {
  assert.equal(buildMemoryContext(undefined), '')
})

test('buildMemoryContext: 包含短期 + 中期 + 长期记忆', () => {
  const memory: ExpertMemory = {
    expertId: 'expert_01',
    shortTerm: {
      entries: [
        createMockMemoryEntry({ actualReturnNextDay: 1.5, wasCorrect: true }),
        createMockMemoryEntry({ tradeDate: '2026-04-02', verdict: 'bearish', confidence: 60, actualReturnNextDay: -0.5, wasCorrect: true }),
      ],
    },
    midTerm: {
      summary: '近期看多为主，胜率较高',
      period: { from: '2026-03-01', to: '2026-03-31' },
      winRate: 0.65,
      avgConfidence: 70,
      dominantVerdict: 'bullish',
      keyPatterns: ['量价齐升时胜率高', '跳空缺口后容易回补'],
      compressedAt: '2026-04-01T00:00:00Z',
    },
    longTerm: {
      lessons: ['不追高是最重要的纪律', '缩量反弹不可信'],
      strengths: ['震荡市'],
      weaknesses: ['快速下跌'],
      updatedAt: '2026-04-01T00:00:00Z',
    },
    updatedAt: '2026-04-03T16:00:00Z',
  }

  const result = buildMemoryContext(memory)

  assert.ok(result.includes('近期预测回顾'))
  assert.ok(result.includes('看多'))
  assert.ok(result.includes('中期总结'))
  assert.ok(result.includes('65.0%'))
  assert.ok(result.includes('长期教训'))
  assert.ok(result.includes('不追高是最重要的纪律'))
})

// ==================== formatShortTermMemory 测试 ====================

test('formatShortTermMemory: 正确格式化短期记忆', () => {
  const entries = [
    createMockMemoryEntry({ actualReturnNextDay: 1.5, wasCorrect: true }),
    createMockMemoryEntry({ tradeDate: '2026-04-02', verdict: 'bearish', confidence: 60, actualReturnNextDay: -0.5, wasCorrect: true }),
    createMockMemoryEntry({ tradeDate: '2026-04-01', verdict: 'neutral', confidence: 50 }),
  ]
  const result = formatShortTermMemory(entries)

  assert.ok(result.includes('近期预测回顾'))
  assert.ok(result.includes('看多'))
  assert.ok(result.includes('看空'))
  assert.ok(result.includes('中性'))
  assert.ok(result.includes('✓'))
  assert.ok(result.includes('待验证'))
})

// ==================== formatMidTermMemory 测试 ====================

test('formatMidTermMemory: 正确格式化中期记忆', () => {
  const midTerm: ExpertMidTermMemory = {
    summary: '整体偏多但需警惕回调',
    period: { from: '2026-03-01', to: '2026-03-31' },
    winRate: 0.68,
    avgConfidence: 72,
    dominantVerdict: 'bullish',
    keyPatterns: ['量增价涨胜率高'],
    compressedAt: '2026-04-01T00:00:00Z',
  }
  const result = formatMidTermMemory(midTerm)

  assert.ok(result.includes('中期总结'))
  assert.ok(result.includes('2026-03-01'))
  assert.ok(result.includes('2026-03-31'))
  assert.ok(result.includes('68.0%'))
  assert.ok(result.includes('看多'))
  assert.ok(result.includes('量增价涨胜率高'))
  assert.ok(result.includes('整体偏多但需警惕回调'))
})

// ==================== extractMemoryEntriesFromSignals 测试 ====================

test('extractMemoryEntriesFromSignals: 从信号提取 LLM 专家投票', () => {
  // 创建一个最小的 signal mock，只包含 extractMemoryEntriesFromSignals 使用的字段
  const signal = {
    code: '600519',
    name: '贵州茅台',
    expert: {
      votes: [
        { expertId: 'expert_01', verdict: 'bullish', confidence: 80, reason: '均线多头排列', modelId: 'gpt-4o', usedFallback: false },
        { expertId: 'rule_rsi', verdict: 'bearish', confidence: 60, reason: 'RSI超卖', modelId: 'rule-engine', usedFallback: false },
        { expertId: 'expert_02', verdict: 'neutral', confidence: 50, reason: '信号不明确', modelId: 'claude-3', usedFallback: true },
      ],
    },
  } as any

  const entries = extractMemoryEntriesFromSignals([signal], '2026-04-03')

  // 只提取非规则引擎、非 fallback 的投票
  assert.equal(entries.length, 1, '应只提取一条有效 LLM 投票')
  assert.equal(entries[0].expertId, 'expert_01')
  assert.equal(entries[0].code, '600519')
  assert.equal(entries[0].verdict, 'bullish')
  assert.equal(entries[0].confidence, 80)
  assert.equal(entries[0].actualReturnNextDay, null)
  assert.equal(entries[0].wasCorrect, null)
})

test('extractMemoryEntriesFromSignals: 无投票时返回空数组', () => {
  const signal = { expert: null } as any
  const entries = extractMemoryEntriesFromSignals([signal], '2026-04-03')
  assert.equal(entries.length, 0)
})

// ==================== buildStatisticalMidTermMemory 测试 ====================

test('buildStatisticalMidTermMemory: 从条目构建统计中期记忆', () => {
  const entries = [
    createMockMemoryEntry({ verdict: 'bullish', confidence: 80, wasCorrect: true, actualReturnNextDay: 1.5 }),
    createMockMemoryEntry({ tradeDate: '2026-04-02', verdict: 'bullish', confidence: 70, wasCorrect: false, actualReturnNextDay: -0.5 }),
    createMockMemoryEntry({ tradeDate: '2026-04-01', verdict: 'bearish', confidence: 60, wasCorrect: true, actualReturnNextDay: -1.0 }),
  ]

  const result = buildStatisticalMidTermMemory(entries, null)

  // 3 条中 2 条 wasCorrect=true → 胜率 2/3
  assert.ok(result.winRate > 0.6 && result.winRate < 0.7, `期望胜率约0.667，实际: ${result.winRate}`)
  assert.ok(result.avgConfidence > 69 && result.avgConfidence < 71, `期望平均信心约70，实际: ${result.avgConfidence}`)
  assert.equal(result.dominantVerdict, 'bullish', '看多2次应为主导')
  assert.ok(result.period.from.length > 0)
  assert.ok(result.period.to.length > 0)
})

test('buildStatisticalMidTermMemory: 与已有中期记忆合并', () => {
  const existing: ExpertMidTermMemory = {
    summary: '旧的摘要',
    period: { from: '2026-02-01', to: '2026-02-28' },
    winRate: 0.8,
    avgConfidence: 75,
    dominantVerdict: 'bullish',
    keyPatterns: ['旧规律'],
    compressedAt: '2026-03-01T00:00:00Z',
  }

  const entries = [
    createMockMemoryEntry({ verdict: 'bearish', confidence: 60, wasCorrect: true, actualReturnNextDay: -1.0 }),
  ]

  const result = buildStatisticalMidTermMemory(entries, existing)

  // 胜率应该是旧(0.8) + 新(1.0) / 2 = 0.9
  assert.ok(result.winRate > 0.85 && result.winRate <= 0.95, `期望合并胜率约0.9，实际: ${result.winRate}`)
  assert.equal(result.summary, '旧的摘要', '合并时保留旧摘要')
  assert.equal(result.period.from, '2026-02-01', '保留旧的起始日期')
  assert.deepStrictEqual(result.keyPatterns, ['旧规律'], '保留旧规律')
})

// ==================== getRecentTradeDates 测试 ====================

test('getRecentTradeDates: 跳过周末', () => {
  // 2026-04-03 是周五
  const dates = getRecentTradeDates('2026-04-03', 5)

  assert.equal(dates.length, 5)
  assert.equal(dates[0], '2026-04-03') // 周五
  assert.equal(dates[1], '2026-04-02') // 周四
  assert.equal(dates[2], '2026-04-01') // 周三
  assert.equal(dates[3], '2026-03-31') // 周二
  assert.equal(dates[4], '2026-03-30') // 周一
  // 周六日被跳过
})

test('getRecentTradeDates: 返回请求的数量', () => {
  const dates = getRecentTradeDates('2026-04-03', 10)
  assert.equal(dates.length, 10)
})

// ==================== parseCompressionResponse 测试 ====================

test('parseCompressionResponse: 解析纯 JSON', () => {
  const input = '{"summary": "测试摘要", "keyPatterns": ["规律1", "规律2"]}'
  const result = parseCompressionResponse(input)

  assert.equal(result.summary, '测试摘要')
  assert.deepStrictEqual(result.keyPatterns, ['规律1', '规律2'])
})

test('parseCompressionResponse: 解析 code block 中的 JSON', () => {
  const input = '以下是压缩结果：\n```json\n{"summary": "代码块摘要", "keyPatterns": ["模式A"]}\n```'
  const result = parseCompressionResponse(input)

  assert.equal(result.summary, '代码块摘要')
  assert.deepStrictEqual(result.keyPatterns, ['模式A'])
})

test('parseCompressionResponse: 无法解析时使用原文作为 summary', () => {
  const input = '这是一段无法解析为 JSON 的文本'
  const result = parseCompressionResponse(input)

  assert.equal(result.summary, input)
  assert.deepStrictEqual(result.keyPatterns, [])
})

test('parseCompressionResponse: summary 长度截断到 500 字符', () => {
  const longSummary = 'x'.repeat(600)
  const input = JSON.stringify({ summary: longSummary, keyPatterns: [] })
  const result = parseCompressionResponse(input)

  assert.equal(result.summary.length, 500)
})

test('parseCompressionResponse: keyPatterns 最多 5 条', () => {
  const input = JSON.stringify({
    summary: '摘要',
    keyPatterns: ['1', '2', '3', '4', '5', '6', '7'],
  })
  const result = parseCompressionResponse(input)

  assert.equal(result.keyPatterns.length, 5)
})

// ==================== buildSentimentSummary 测试 ====================

test('buildSentimentSummary: 空快照返回 null', () => {
  const factPool = createEmptyFactPool()
  assert.equal(buildSentimentSummary(factPool), null)
})

test('buildSentimentSummary: 有数据时返回牛熊比描述', () => {
  const factPool = createEmptyFactPool({
    socialSentiment: [{
      source: 'eastmoney',
      sampledAt: '2026-04-03T15:00:00Z',
      overallBullBearRatio: { bull: 65, bear: 35 },
      hotTopics: ['AI概念', '消费复苏'],
      topMentionedStocks: [],
    }],
  })

  const result = buildSentimentSummary(factPool)
  assert.ok(result !== null)
  assert.ok(result!.includes('偏乐观'))
  assert.ok(result!.includes('AI概念'))
})

// ==================== [H4] 长期记忆构建 ====================

test('parseLongTermResponse: 解析纯 JSON', () => {
  const input = JSON.stringify({
    lessons: ['放量突破追涨胜率高', '缩量下跌不宜抄底'],
    strengths: ['震荡市低吸'],
    weaknesses: ['急跌行情抄底过早'],
  })
  const result = parseLongTermResponse(input)
  assert.equal(result.lessons.length, 2)
  assert.equal(result.strengths.length, 1)
  assert.equal(result.weaknesses.length, 1)
  assert.equal(result.lessons[0], '放量突破追涨胜率高')
})

test('parseLongTermResponse: 解析 code block JSON', () => {
  const input = '这是分析结果：\n```json\n{"lessons":["教训1"],"strengths":["优势1"],"weaknesses":["劣势1"]}\n```'
  const result = parseLongTermResponse(input)
  assert.equal(result.lessons.length, 1)
  assert.equal(result.lessons[0], '教训1')
})

test('parseLongTermResponse: 无法解析时返回空数组', () => {
  const result = parseLongTermResponse('这不是JSON')
  assert.equal(result.lessons.length, 0)
  assert.equal(result.strengths.length, 0)
  assert.equal(result.weaknesses.length, 0)
})

test('parseLongTermResponse: lessons 最多 20 条', () => {
  const lessons = Array.from({ length: 30 }, (_, i) => `教训${i}`)
  const input = JSON.stringify({ lessons, strengths: [], weaknesses: [] })
  const result = parseLongTermResponse(input)
  assert.equal(result.lessons.length, 20)
})

test('mergeLongTermMemory: 无现有记忆时直接使用新数据', () => {
  const incoming: ExpertLongTermMemory = {
    lessons: ['新教训1'],
    strengths: ['新优势1'],
    weaknesses: ['新劣势1'],
    updatedAt: '2026-04-04T00:00:00Z',
  }
  const result = mergeLongTermMemory(null, incoming)
  assert.deepEqual(result.lessons, ['新教训1'])
  assert.deepEqual(result.strengths, ['新优势1'])
})

test('mergeLongTermMemory: 合并去重', () => {
  const existing: ExpertLongTermMemory = {
    lessons: ['教训A', '教训B'],
    strengths: ['优势X'],
    weaknesses: ['劣势Y'],
    updatedAt: '2026-04-01T00:00:00Z',
  }
  const incoming: ExpertLongTermMemory = {
    lessons: ['教训A', '教训C'],  // 教训A 重复
    strengths: ['优势X', '优势Z'],
    weaknesses: [],
    updatedAt: '2026-04-04T00:00:00Z',
  }
  const result = mergeLongTermMemory(existing, incoming)
  // 新的在前，去重
  assert.deepEqual(result.lessons, ['教训A', '教训C', '教训B'])
  assert.deepEqual(result.strengths, ['优势X', '优势Z'])
  assert.deepEqual(result.weaknesses, ['劣势Y'])
})

test('buildLongTermStatistical: 从中期记忆提取教训', () => {
  const memory: ExpertMemory = {
    expertId: 'test-expert',
    shortTerm: { entries: [] },
    midTerm: {
      summary: '表现平稳',
      period: { from: '2026-03-01', to: '2026-03-31' },
      winRate: 0.65,
      avgConfidence: 70,
      dominantVerdict: 'bullish',
      keyPatterns: ['板块轮动时准确率高', '政策利好反应迟缓'],
      compressedAt: '2026-03-31T16:00:00Z',
    },
    longTerm: null,
    updatedAt: '2026-03-31T16:00:00Z',
  }
  const result = buildLongTermStatistical('test-expert', memory)
  assert.ok(result.lessons.includes('板块轮动时准确率高'))
  assert.ok(result.lessons.includes('政策利好反应迟缓'))
  // 胜率 65% → 应有 strengths 条目
  assert.ok(result.strengths.length > 0)
  assert.ok(result.strengths[0].includes('65%'))
})

test('buildLongTermStatistical: 低胜率记入 weaknesses', () => {
  const memory: ExpertMemory = {
    expertId: 'test-expert',
    shortTerm: { entries: [] },
    midTerm: {
      summary: '',
      period: { from: '2026-03-01', to: '2026-03-31' },
      winRate: 0.35,
      avgConfidence: 50,
      dominantVerdict: 'bearish',
      keyPatterns: [],
      compressedAt: '2026-03-31T16:00:00Z',
    },
    longTerm: null,
    updatedAt: '2026-03-31T16:00:00Z',
  }
  const result = buildLongTermStatistical('test-expert', memory)
  assert.ok(result.weaknesses.length > 0)
  assert.ok(result.weaknesses[0].includes('35%'))
})

test('buildLongTermStatistical: 保留已有长期记忆条目', () => {
  const memory: ExpertMemory = {
    expertId: 'test-expert',
    shortTerm: { entries: [] },
    midTerm: {
      summary: '',
      period: { from: '2026-04-01', to: '2026-04-30' },
      winRate: 0.55,
      avgConfidence: 60,
      dominantVerdict: 'neutral',
      keyPatterns: ['新规律'],
      compressedAt: '2026-04-30T16:00:00Z',
    },
    longTerm: {
      lessons: ['旧教训1', '旧教训2'],
      strengths: ['旧优势'],
      weaknesses: [],
      updatedAt: '2026-03-31T16:00:00Z',
    },
    updatedAt: '2026-04-30T16:00:00Z',
  }
  const result = buildLongTermStatistical('test-expert', memory)
  assert.ok(result.lessons.includes('旧教训1'))
  assert.ok(result.lessons.includes('新规律'))
})

// ==================== [M12] 加权平均测试 ====================

test('buildStatisticalMidTermMemory: 无现有记忆时使用原始统计', () => {
  const entries: ExpertDailyMemoryEntry[] = [
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000001', name: '平安银行', verdict: 'bullish', confidence: 80, reason: '看好', actualReturnNextDay: 2.0, wasCorrect: true },
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000002', name: '万科A', verdict: 'bullish', confidence: 60, reason: '看好', actualReturnNextDay: -1.0, wasCorrect: false },
  ]
  const result = buildStatisticalMidTermMemory(entries, null)
  assert.equal(result.winRate, 0.5) // 1/2
  assert.equal(result.avgConfidence, 70) // (80+60)/2
  assert.equal(result.sampleCount, 2)
})

test('buildStatisticalMidTermMemory: [M12] 加权平均而非简单平均', () => {
  const existing: ExpertMidTermMemory = {
    summary: '',
    period: { from: '2026-03-01', to: '2026-03-31' },
    winRate: 0.8,  // 旧数据 80% 胜率
    avgConfidence: 90,
    dominantVerdict: 'bullish',
    keyPatterns: [],
    compressedAt: '2026-03-31T16:00:00Z',
    sampleCount: 10,
  }
  // 新数据: 2 条，1 对 1 错 → winRate=0.5, avgConfidence=70
  const entries: ExpertDailyMemoryEntry[] = [
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000001', name: '平安银行', verdict: 'bullish', confidence: 80, reason: '看好', actualReturnNextDay: 2.0, wasCorrect: true },
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000002', name: '万科A', verdict: 'bullish', confidence: 60, reason: '看好', actualReturnNextDay: -1.0, wasCorrect: false },
  ]

  const result = buildStatisticalMidTermMemory(entries, existing)

  // P2-C3 衰减加权: 旧样本 10 * 0.8 = 8，新样本 2
  // winRate: (0.8 * 8 + 0.5 * 2) / 10 = 7.4/10 = 0.74
  assert.ok(Math.abs(result.winRate - 0.74) < 0.01, `Expected ~0.74, got ${result.winRate}`)
  // avgConfidence: (90 * 8 + 70 * 2) / 10 = 860/10 = 86
  assert.ok(Math.abs(result.avgConfidence - 86) < 0.1, `Expected ~86, got ${result.avgConfidence}`)
  assert.equal(result.sampleCount, 10)
})

test('buildStatisticalMidTermMemory: [M12] 旧数据无 sampleCount 默认为 1', () => {
  const existing: ExpertMidTermMemory = {
    summary: '',
    period: { from: '2026-03-01', to: '2026-03-31' },
    winRate: 0.9,
    avgConfidence: 80,
    dominantVerdict: 'bullish',
    keyPatterns: [],
    compressedAt: '2026-03-31T16:00:00Z',
    // 注意：没有 sampleCount 字段（旧数据）
  }
  const entries: ExpertDailyMemoryEntry[] = [
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000001', name: '平安银行', verdict: 'bullish', confidence: 60, reason: '看好', actualReturnNextDay: 2.0, wasCorrect: true },
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000002', name: '万科A', verdict: 'bearish', confidence: 60, reason: '看空', actualReturnNextDay: 1.0, wasCorrect: false },
    { tradeDate: '2026-04-01', expertId: 'e1', code: '000003', name: '中国平安', verdict: 'bullish', confidence: 60, reason: '看好', actualReturnNextDay: -0.5, wasCorrect: false },
  ]

  const result = buildStatisticalMidTermMemory(entries, existing)

  // 新: 3 条, 1 对 → winRate = 1/3 ≈ 0.333
  // 加权: (0.9 * 1 + 0.333 * 3) / 4 = (0.9 + 1.0) / 4 ≈ 0.475
  assert.ok(Math.abs(result.winRate - 0.475) < 0.01, `Expected ~0.475, got ${result.winRate}`)
  assert.equal(result.sampleCount, 4)
})

// ==================== buildMemoryContext: 长期记忆展示 ====================

test('buildMemoryContext: 展示长期记忆的教训/优势/劣势', () => {
  const memory: ExpertMemory = {
    expertId: 'test-expert',
    shortTerm: { entries: [] },
    midTerm: null,
    longTerm: {
      lessons: ['放量突破追涨胜率高'],
      strengths: ['震荡市低吸策略'],
      weaknesses: ['急跌抄底过早'],
      updatedAt: '2026-04-04T00:00:00Z',
    },
    updatedAt: '2026-04-04T00:00:00Z',
  }
  const result = buildMemoryContext(memory)
  assert.ok(result.includes('长期教训'))
  assert.ok(result.includes('放量突破追涨胜率高'))
  assert.ok(result.includes('擅长的市场环境'))
  assert.ok(result.includes('震荡市低吸策略'))
  assert.ok(result.includes('不擅长的市场环境'))
  assert.ok(result.includes('急跌抄底过早'))
})
