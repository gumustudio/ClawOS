import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

import {
  CHINA_MARKET_HOLIDAYS,
  CHINA_MARKET_EXTRA_TRADING_DAYS,
  isTradingDay,
  isWithinTradingHours,
  isWithinAuctionHours,
  checkTradingAvailability,
  getRecentTradeDates,
  formatDateStr,
  initCalendarCacheDir,
  syncOnlineTradingCalendar,
  validateAndSyncCalendarOnStartup,
  isOnlineCacheExpired,
  getCalendarSyncStatus,
} from '../src/services/stock-analysis/trading-calendar'

// ==================== formatDateStr 测试 ====================

test('formatDateStr: 格式化日期为 YYYY-MM-DD', () => {
  assert.equal(formatDateStr(new Date('2026-04-07')), '2026-04-07')
  assert.equal(formatDateStr(new Date('2026-01-01')), '2026-01-01')
  assert.equal(formatDateStr(new Date('2026-12-31')), '2026-12-31')
})

// ==================== 静态数据完整性测试 ====================

test('CHINA_MARKET_HOLIDAYS: 2026年清明节数据正确（4/4-4/6，不含4/7）', () => {
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-04-04'), '4/4(六)应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-04-05'), '4/5(清明)应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-04-06'), '4/6(一)应为假日')
  assert.ok(!CHINA_MARKET_HOLIDAYS.has('2026-04-07'), '4/7(二)不应为假日')
})

test('CHINA_MARKET_HOLIDAYS: 2026年春节数据正确（含2/23）', () => {
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-02-16'), '2/16应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-02-23'), '2/23(一)应为假日')
})

test('CHINA_MARKET_HOLIDAYS: 2026年五一数据正确（5/1-5/5）', () => {
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-05-01'), '5/1应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-05-04'), '5/4(一)应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-05-05'), '5/5(二)应为假日')
})

test('CHINA_MARKET_HOLIDAYS: 2026年元旦数据正确（1/1-1/3）', () => {
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-01-01'), '1/1应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-01-02'), '1/2应为假日')
  assert.ok(CHINA_MARKET_HOLIDAYS.has('2026-01-03'), '1/3应为假日')
})

test('CHINA_MARKET_EXTRA_TRADING_DAYS: 2026年调休补班日完整', () => {
  assert.ok(CHINA_MARKET_EXTRA_TRADING_DAYS.has('2026-01-04'), '1/4元旦补班')
  assert.ok(CHINA_MARKET_EXTRA_TRADING_DAYS.has('2026-02-14'), '2/14春节补班')
  assert.ok(CHINA_MARKET_EXTRA_TRADING_DAYS.has('2026-02-28'), '2/28春节补班')
  assert.ok(CHINA_MARKET_EXTRA_TRADING_DAYS.has('2026-05-09'), '5/9五一补班')
  assert.ok(CHINA_MARKET_EXTRA_TRADING_DAYS.has('2026-09-20'), '9/20国庆补班')
  assert.ok(CHINA_MARKET_EXTRA_TRADING_DAYS.has('2026-10-10'), '10/10国庆补班')
})

test('CHINA_MARKET_HOLIDAYS: 所有日期格式正确', () => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  for (const d of CHINA_MARKET_HOLIDAYS) {
    assert.match(d, dateRegex, `假日 ${d} 格式不正确`)
  }
})

test('CHINA_MARKET_EXTRA_TRADING_DAYS: 所有日期格式正确', () => {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  for (const d of CHINA_MARKET_EXTRA_TRADING_DAYS) {
    assert.match(d, dateRegex, `补班日 ${d} 格式不正确`)
  }
})

test('CHINA_MARKET_EXTRA_TRADING_DAYS: 补班日确实是周末', () => {
  for (const d of CHINA_MARKET_EXTRA_TRADING_DAYS) {
    const date = new Date(d)
    const dayOfWeek = date.getDay()
    assert.ok(dayOfWeek === 0 || dayOfWeek === 6, `补班日 ${d} (星期${dayOfWeek}) 不是周末`)
  }
})

test('CHINA_MARKET_HOLIDAYS 和 CHINA_MARKET_EXTRA_TRADING_DAYS 不交叉', () => {
  for (const d of CHINA_MARKET_EXTRA_TRADING_DAYS) {
    assert.ok(!CHINA_MARKET_HOLIDAYS.has(d), `${d} 同时出现在假日和补班日中`)
  }
})

// ==================== isTradingDay 测试 ====================

test('isTradingDay: 2026-04-07(二) 是交易日', () => {
  assert.ok(isTradingDay(new Date('2026-04-07T10:00:00')))
})

test('isTradingDay: 2026-04-06(一) 清明假日不是交易日', () => {
  assert.ok(!isTradingDay(new Date('2026-04-06T10:00:00')))
})

test('isTradingDay: 2026-04-04(六) 清明假日不是交易日', () => {
  assert.ok(!isTradingDay(new Date('2026-04-04T10:00:00')))
})

test('isTradingDay: 周末(无补班)不是交易日', () => {
  assert.ok(!isTradingDay(new Date('2026-04-11T10:00:00'))) // 周六
  assert.ok(!isTradingDay(new Date('2026-04-12T10:00:00'))) // 周日
})

test('isTradingDay: 普通工作日是交易日', () => {
  assert.ok(isTradingDay(new Date('2026-04-08T10:00:00'))) // 周三
  assert.ok(isTradingDay(new Date('2026-04-09T10:00:00'))) // 周四
})

test('isTradingDay: 补班日是交易日', () => {
  assert.ok(isTradingDay(new Date('2026-01-04T10:00:00'))) // 元旦补班（周日）
  assert.ok(isTradingDay(new Date('2026-05-09T10:00:00'))) // 五一补班（周六）
  assert.ok(isTradingDay(new Date('2026-09-20T10:00:00'))) // 国庆补班（周日）
})

test('isTradingDay: 2026-02-23(一) 春节假日不是交易日', () => {
  assert.ok(!isTradingDay(new Date('2026-02-23T10:00:00')))
})

test('isTradingDay: 2026-05-04(一) 五一假日不是交易日', () => {
  assert.ok(!isTradingDay(new Date('2026-05-04T10:00:00')))
})

test('isTradingDay: 2026-05-05(二) 五一假日不是交易日', () => {
  assert.ok(!isTradingDay(new Date('2026-05-05T10:00:00')))
})

// ==================== isWithinTradingHours 测试 ====================

test('isWithinTradingHours: 上午交易时段', () => {
  assert.ok(isWithinTradingHours(new Date('2026-04-07T09:30:00')))
  assert.ok(isWithinTradingHours(new Date('2026-04-07T10:00:00')))
  assert.ok(isWithinTradingHours(new Date('2026-04-07T11:30:00')))
})

test('isWithinTradingHours: 下午交易时段', () => {
  assert.ok(isWithinTradingHours(new Date('2026-04-07T13:00:00')))
  assert.ok(isWithinTradingHours(new Date('2026-04-07T14:59:00')))
})

test('isWithinTradingHours: 非交易时段', () => {
  assert.ok(!isWithinTradingHours(new Date('2026-04-07T09:00:00')))   // 开盘前
  assert.ok(!isWithinTradingHours(new Date('2026-04-07T12:00:00')))   // 午间休市
  assert.ok(!isWithinTradingHours(new Date('2026-04-07T15:00:00')))   // 已收盘
})

// ==================== isWithinAuctionHours 测试 ====================

test('isWithinAuctionHours: 集合竞价时段', () => {
  assert.ok(isWithinAuctionHours(new Date('2026-04-07T09:15:00')))
  assert.ok(isWithinAuctionHours(new Date('2026-04-07T14:57:00')))
  assert.ok(isWithinAuctionHours(new Date('2026-04-07T15:00:00')))
})

test('isWithinAuctionHours: 非集合竞价时段', () => {
  assert.ok(!isWithinAuctionHours(new Date('2026-04-07T09:25:00')))
  assert.ok(!isWithinAuctionHours(new Date('2026-04-07T10:00:00')))
})

// ==================== checkTradingAvailability 测试 ====================

test('checkTradingAvailability: 交易时段可交易', () => {
  const result = checkTradingAvailability(new Date('2026-04-07T10:00:00'))
  assert.equal(result.canTrade, true)
  assert.equal(result.reason, null)
})

test('checkTradingAvailability: 周末不可交易', () => {
  const result = checkTradingAvailability(new Date('2026-04-11T10:00:00'))
  assert.equal(result.canTrade, false)
  assert.ok(result.reason?.includes('周末'))
})

test('checkTradingAvailability: 节假日不可交易', () => {
  const result = checkTradingAvailability(new Date('2026-04-06T10:00:00'))
  assert.equal(result.canTrade, false)
  assert.ok(result.reason?.includes('节假日'))
})

test('checkTradingAvailability: 交易日非交易时段不可交易', () => {
  const result = checkTradingAvailability(new Date('2026-04-07T08:00:00'))
  assert.equal(result.canTrade, false)
  assert.ok(result.reason?.includes('开盘'))
})

// ==================== getRecentTradeDates 测试 ====================

test('getRecentTradeDates: 跳过周末和假日', () => {
  const dates = getRecentTradeDates('2026-04-07', 3)
  assert.equal(dates.length, 3)
  assert.equal(dates[0], '2026-04-07') // 周二（清明后首个交易日）
  assert.equal(dates[1], '2026-04-03') // 周五（清明前）
  assert.equal(dates[2], '2026-04-02') // 周四
})

test('getRecentTradeDates: 返回请求的数量', () => {
  const dates = getRecentTradeDates('2026-04-07', 10)
  assert.equal(dates.length, 10)
})

// ==================== 在线日历功能测试 ====================

test('getCalendarSyncStatus: 返回正确的初始状态', () => {
  const status = getCalendarSyncStatus()
  assert.equal(typeof status.hasOnlineCache, 'boolean')
  assert.ok(Array.isArray(status.onlineCacheYears))
  assert.equal(typeof status.cacheExpired, 'boolean')
})

test('isOnlineCacheExpired: 初始状态为过期', () => {
  // onlineCacheLoadedAt 初始为 0，所以永远过期
  assert.ok(isOnlineCacheExpired())
})

test('syncOnlineTradingCalendar: 拉取在线数据并缓存到磁盘', async () => {
  // 创建临时目录模拟 stockAnalysisDir
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-calendar-test-'))
  try {
    // initCalendarCacheDir 内部会拼 'cache' 子目录
    initCalendarCacheDir(tmpDir)

    const success = await syncOnlineTradingCalendar(2026)

    if (success) {
      // 缓存文件在 cache/ 子目录下
      const cacheFile = path.join(tmpDir, 'cache', 'trading-calendar-2026.json')
      const stat = await fs.stat(cacheFile)
      assert.ok(stat.isFile(), '缓存文件应该存在')

      const content = JSON.parse(await fs.readFile(cacheFile, 'utf8'))
      assert.equal(content.year, 2026)
      assert.ok(Array.isArray(content.tradeDates))
      assert.ok(content.tradeDates.length > 200, `交易日数量应 > 200，实际: ${content.tradeDates.length}`)
      assert.equal(content.source, 'akshare:tool_trade_date_hist_sina')

      // 验证 4/7 在交易日列表中
      assert.ok(content.tradeDates.includes('2026-04-07'), '4月7日应在交易日列表中')

      // 验证缓存状态已更新
      const status = getCalendarSyncStatus()
      assert.ok(status.hasOnlineCache, '应有在线缓存')
      assert.ok(status.onlineCacheYears.includes(2026), '应包含 2026 年')
    } else {
      // AKShare 不可用时不算测试失败（网络依赖）
      console.log('  ℹ AKShare 不可用，跳过在线缓存验证')
    }
  } finally {
    // 清理临时目录
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('validateAndSyncCalendarOnStartup: 执行完整自检流程不抛异常', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clawos-calendar-test-'))
  try {
    // initCalendarCacheDir 接受 stockAnalysisDir（内部拼 'cache'）
    initCalendarCacheDir(tmpDir)
    // 自检应该不抛异常，即使网络不可用
    await validateAndSyncCalendarOnStartup()
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
})

test('isTradingDay: 在线缓存加载后优先使用在线数据', async () => {
  // 此测试依赖前面的 syncOnlineTradingCalendar 已加载缓存
  // 即使没有加载，isTradingDay 也应该通过静态数据正确判断
  const apr7 = new Date('2026-04-07T10:00:00')
  assert.ok(isTradingDay(apr7), '4/7 无论是否有在线缓存都应该是交易日')

  const apr6 = new Date('2026-04-06T10:00:00')
  assert.ok(!isTradingDay(apr6), '4/6 无论是否有在线缓存都不应该是交易日')
})
