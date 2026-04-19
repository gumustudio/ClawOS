import { execFile } from 'child_process'
import { promisify } from 'util'

import { logger } from '../../utils/logger'
import { saLog, initSALogger } from './sa-logger'
import { runExpertVoting } from './llm-inference'
import type { LLMExpertScore } from './llm-inference'
import { callProviderText } from './llm-provider-adapter'
import { buildExpertProfile, buildFactPoolSummary, runDailyMemoryUpdate, runLongTermMemoryUpdate } from './memory'
import { checkTradingAvailability, getRecentTradeDates, isWithinTradingHours as isWithinTradingHoursShared } from './trading-calendar'
import {
  DEFAULT_RISK_CONTROL_STATE,
  ensureStockAnalysisStructure,
  readStockAnalysisBlacklist,
  readStockAnalysisConfig,
  readStockAnalysisDailyRun,
  readStockAnalysisHistoryCache,
  readStockAnalysisIndexHistoryCache,
  readStockAnalysisLearnedWeights,
  readStockAnalysisMarketState,
  readStockAnalysisModelGroups,
  readStockAnalysisMonthlySummary,
  readStockAnalysisPerformanceDashboard,
  readStockAnalysisPositions,
  readStockAnalysisQuoteCache,
  readStockAnalysisReviews,
  readStockAnalysisRiskEvents,
  readStockAnalysisRuntimeStatus,
  readStockAnalysisSignals,
  readStockAnalysisStockPool,
  readStockAnalysisStockPoolMeta,
  readAllAStockList,
  readAllAStockListMeta,
  readStockAnalysisThresholdHistory,
  readStockAnalysisTrades,
  readStockAnalysisWatchLogs,
  readStockAnalysisWeeklySummary,
  saveStockAnalysisDailyRun,
  saveStockAnalysisHistoryCache,
  saveStockAnalysisIndexHistoryCache,
  saveStockAnalysisLearnedWeights,
  saveStockAnalysisMarketState,
  saveStockAnalysisModelGroups,
  saveStockAnalysisMonthlySummary,
  saveStockAnalysisPerformanceDashboard,
  saveStockAnalysisPositions,
  saveStockAnalysisQuoteCache,
  saveStockAnalysisReviews,
  saveStockAnalysisRiskEvents,
  saveStockAnalysisRuntimeStatus,
  saveStockAnalysisSignals,
  saveStockAnalysisStockPool,
  saveStockAnalysisStockPoolMeta,
  saveAllAStockList,
  saveAllAStockListMeta,
  saveStockAnalysisTrades,
  saveStockAnalysisThresholdHistory,
  saveStockAnalysisWatchLogs,
  saveStockAnalysisWeeklySummary,
  readStockAnalysisAIConfig,
  saveStockAnalysisAIConfig,
  saveStockAnalysisConfig,
  atomicUpdateRuntimeStatus,
  readStockAnalysisExpertPerformance,
  saveStockAnalysisExpertPerformance,
  readAutoReportNotifications,
  saveAutoReportNotifications,
  readMonthlyReports,
  saveMonthlyReports,
  readFactPool,
  saveFactPool,
  mergeFactPool,
  readPostMarketResult,
  savePostMarketResult,
  readLLMExtractionResult,
  saveLLMExtractionResult,
  mergeLLMExtractionResult,
  readIntradayAlerts,
  saveIntradayAlerts,
  readIntradayMonitorStatus,
  saveIntradayMonitorStatus,
  readExpertMemoryStore,
  readExpertDailyMemories,
  getAvailableDataCollectionDates,
  getAvailableSignalDates,
  readDataAgentConfig,
  saveDataAgentConfig,
  cleanupAllStaleTemporaryFiles,
  withFileLock,
  readUserWatchlist,
  saveUserWatchlist,
} from './store'
import type {
  DecisionSource,
  MarketLiquidity,
  MarketRegime,
  MarketSentiment,
  MarketStyle,
  MarketTrend,
  MarketVolatility,
  PositionAction,
  StockAnalysisCurrentRun,
  StockAnalysisDailyRunResult,
  StockAnalysisDataState,
  StockAnalysisDimensionAnalysis,
  StockAnalysisFusionWeights,
  StockAnalysisHealthStatus,
  StockAnalysisHistoryCache,
  StockAnalysisIndexHistoryCache,
  StockAnalysisKlinePoint,
  StockAnalysisLearnedWeights,
  StockAnalysisMarketState,
  StockAnalysisModelGroupPerformance,
  StockAnalysisMonthlySummary,
  StockAnalysisOverview,
  StockAnalysisPerformanceDashboard,
  StockAnalysisPosition,
  StockAnalysisPositionEvaluation,
  StockAnalysisPortfolioRiskLimits,
  StockAnalysisQuoteCache,
  StockAnalysisReviewRecord,
  StockAnalysisRiskControlState,
  StockAnalysisRiskEvent,
  StockAnalysisRiskEventType,
  StockAnalysisRunState,
  StockAnalysisRuntimeStatus,
  StockAnalysisSignal,
  StockAnalysisSpotQuote,
  StockAnalysisStockSnapshot,
  StockAnalysisStrategyConfig,
  StockAnalysisSwapSuggestion,
  StockAnalysisThresholdAdjustment,
  StockAnalysisTradeRecord,
  StockAnalysisTradeRequest,
  StockAnalysisWatchLogEntry,
  StockAnalysisWatchlistCandidate,
  StockAnalysisWeeklySummary,
  StockAnalysisWeightUpdateEntry,
  StockAnalysisAIConfig,
  StockAnalysisAIModelRef,
  StockAnalysisAIProvider,
  StockAnalysisExpertDefinition,
  StockAnalysisExpertLayer,
  StockAnalysisExpertPerformanceData,
  StockAnalysisExpertPerformanceEntry,
  StockAnalysisExpertScore,
  StockAnalysisExpertStance,
  StockAnalysisExpertVote,
  StockAnalysisLayerAssignment,
  StockAnalysisModelTestResult,
  SupportResistanceLevels,
  MarketLevelRiskState,
  IntradayAlert,
  IntradayMonitorStatus,
  AutoReportNotification,
  TuningSuggestion,
  MonthlyReport,
  FactPool,
  DataAgentId,
  DataAgentResult,
  MacroEconomicData,
  GlobalMarketSnapshot,
  CompanyAnnouncement,
  IndustryNewsItem,
  SocialSentimentSnapshot,
  PolicyEvent,
  DataQualityReport,
  LLMExtractionResult,
  AnnouncementEvent,
  NewsImpactEvent,
  SentimentIndex,
  EventScreenResult,
  StockAnalysisPostMarketResult,
  ExpertProfile,
  ExpertMemoryStore,
  FactPoolSummary,
  DataAgentConfigStore,
  LLMExtractionAgentId,
  StockAnalysisOverrideStats,
  UserWatchlistItem,
  WatchlistQuoteSnapshot,
  WatchlistResponse,
} from './types'

const execFileAsync = promisify(execFile)

const EASTMONEY_UT = 'bd1d9ddb04089700cf9c27f6f7426281'
const QUOTE_CACHE_TTL_MS = 5 * 60 * 1000
const INDEX_HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const STOCK_POOL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 12_000
const MAX_HISTORY_CONCURRENCY = 10
const INDEX_HISTORY_SEC_IDS = ['1.000905', '0.000905', '2.000905', '47.000905'] as const
export const POST_MARKET_BATCH_WINDOW_MS = 3 * 60 * 60 * 1000

let pythonUserSitePackagesPromise: Promise<string | null> | null = null
let currentRunPromise: Promise<StockAnalysisDailyRunResult> | null = null
let currentPostMarketPromise: Promise<StockAnalysisPostMarketResult> | null = null
let intradayMonitorTimer: ReturnType<typeof setInterval> | null = null

/** P0-3: 交易操作（开仓/平仓/减仓）共用的互斥锁 key，防止并发竞态 */
const TRADING_LOCK_KEY = '__trading_operations_lock__'


interface EastmoneySpotItem {
  f12: string
  f14: string
  f100?: string
  f2: number
  f3: number
  f8: number
  f15: number
  f16: number
  f17: number
  f18: number
  f20: number
  f21: number
}

interface EastmoneySpotResponse {
  data?: {
    diff?: EastmoneySpotItem[]
  }
}

interface EastmoneyKlineResponse {
  data?: {
    klines?: string[]
  }
}

interface TencentIndexKlineResponse {
  data?: Record<string, {
    day?: string[][]
    qfqday?: string[][]
  }>
}

// ── 同花顺 K 线 JSONP 响应 ──
interface TonghuashunKlineResponse {
  data: string  // "日期,开盘,收盘,最高,最低,成交量(股),成交额(元),振幅,,,0;..." 分号分隔多条
  num: number
}

// ── 搜狐 K 线 JSON 响应 ──
interface SohuKlineResponse {
  status: number
  hq: string[][] // [日期, 开盘, 收盘, 涨跌额, 涨跌幅%, 最低, 最高, 成交量(手), 成交额(万元), 换手率%]
  code: string
}

// ── 新浪 K 线 JSON 响应 ──
interface SinaKlineItem {
  day: string
  open: string
  high: string
  low: string
  close: string
  volume: string  // 股
}

interface PythonJsonResult<T> {
  success: boolean
  data?: T
  error?: string
}

interface PythonConstituentItem {
  成分券代码: string
  成分券名称: string
  交易所: string
  行业名称?: string
}

interface PythonIndexHistoryItem {
  日期: string
  收盘: number
  成交额: number
}

interface DataEnvelope<T> {
  data: T
  fetchedAt: string | null
  usedFallback: boolean
  staleReasons: string[]
}

const CSI500_CONSTITUENTS_SCRIPT = String.raw`
import json
import akshare as ak

try:
    df = ak.index_stock_cons_csindex(symbol='000905')
    columns = [col for col in ['成分券代码', '成分券名称', '交易所', '行业名称'] if col in df.columns]
    rows = df[columns].to_dict(orient='records')
    print(json.dumps({'success': True, 'data': rows}, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({'success': False, 'error': str(exc)}, ensure_ascii=False))
`

const CSI500_INDEX_HISTORY_SCRIPT = String.raw`
import json
import akshare as ak

try:
    df = ak.index_zh_a_hist(symbol='000905', period='daily', start_date='20240101', end_date='20300101')
    rows = df[['日期', '收盘', '成交额']].tail(40).to_dict(orient='records')
    print(json.dumps({'success': True, 'data': rows}, ensure_ascii=False, default=str))
except Exception as exc:
    print(json.dumps({'success': False, 'error': str(exc)}, ensure_ascii=False))
`

const ALL_A_STOCK_LIST_SCRIPT = String.raw`
import json
import akshare as ak

try:
    df = ak.stock_info_a_code_name()
    rows = df[['code', 'name']].to_dict(orient='records')
    print(json.dumps({'success': True, 'data': rows}, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({'success': False, 'error': str(exc)}, ensure_ascii=False))
`

/** 返回北京时间（Asia/Shanghai）的日期字符串 YYYY-MM-DD */
function todayDate() {
  return new Date().toLocaleDateString('sv', { timeZone: 'Asia/Shanghai' })
}

function nowIso() {
  return new Date().toISOString()
}

function ageMs(value: string | null) {
  if (!value) {
    return Number.POSITIVE_INFINITY
  }
  return Date.now() - new Date(value).getTime()
}

function isFresh(value: string | null, ttlMs: number) {
  return ageMs(value) <= ttlMs
}

function getWeekLabel(date: Date) {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  temp.setUTCDate(temp.getUTCDate() + 4 - (temp.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${temp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function getMonthLabel(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function mean(values: number[]) {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stddev(values: number[]) {
  if (values.length <= 1) {
    return 0
  }
  const avg = mean(values)
  const variance = mean(values.map((value) => (value - avg) ** 2))
  return Math.sqrt(variance)
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function safeDivide(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function getMarketFromCode(code: string): 'sh' | 'sz' | 'bj' {
  if (code.startsWith('6')) {
    return 'sh'
  }
  if (code.startsWith('8') || code.startsWith('4')) {
    return 'bj'
  }
  return 'sz'
}

function getSecId(code: string) {
  const market = getMarketFromCode(code)
  if (market === 'sh') {
    return `1.${code}`
  }
  return `0.${code}`
}

function getTencentSymbol(code: string) {
  const market = getMarketFromCode(code)
  if (market === 'sh') return `sh${code}`
  if (market === 'bj') return `bj${code}`
  return `sz${code}`
}


function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function getStaleReasonForAge(label: string, fetchedAt: string | null, ttlMs: number) {
  if (!fetchedAt) {
    return `${label}缓存缺失`
  }
  if (!isFresh(fetchedAt, ttlMs)) {
    return `${label}缓存过期`
  }
  return null
}

async function getPythonUserSitePackages() {
  if (!pythonUserSitePackagesPromise) {
    pythonUserSitePackagesPromise = execFileAsync('python3', ['-c', 'import site; print(site.getusersitepackages())'], {
      maxBuffer: 1024 * 256,
      env: process.env,
    })
      .then(({ stdout }) => stdout.trim() || null)
      .catch(() => null)
  }

  return pythonUserSitePackagesPromise
}

async function runPythonJson<T>(script: string): Promise<T> {
  const pythonUserSite = await getPythonUserSitePackages()
  const env = { ...process.env }
  if (pythonUserSite) {
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonUserSite}:${env.PYTHONPATH}` : pythonUserSite
  }

  const { stdout } = await execFileAsync('python3', ['-c', script], {
    maxBuffer: 1024 * 1024 * 8,
    env,
    timeout: 60_000,
  })
  const json = JSON.parse(stdout.trim()) as PythonJsonResult<T>
  if (!json.success) {
    throw new Error(json.error || 'Python 数据脚本失败')
  }
  if (json.data === undefined) {
    throw new Error('Python 数据脚本返回空结果')
  }
  return json.data
}

async function fetchJsonWithRetry<T>(url: string, attempt = 1): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 ClawOS StockAnalysis',
        Referer: 'https://quote.eastmoney.com/',
      },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`行情请求失败: ${response.status}`)
    }

    return response.json() as Promise<T>
  } catch (error) {
    if (attempt >= 3) {
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** (attempt - 1))))
    return fetchJsonWithRetry<T>(url, attempt + 1)
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchTextWithRetry(url: string, attempt = 1): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 ClawOS StockAnalysis',
        Referer: 'https://gu.qq.com/',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`文本请求失败: ${response.status}`)
    }
    return response.text()
  } catch (error) {
    if (attempt >= 3) {
      throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** (attempt - 1))))
    return fetchTextWithRetry(url, attempt + 1)
  } finally {
    clearTimeout(timeout)
  }
}

async function updateRuntimeStatus(stockAnalysisDir: string, partial: Partial<StockAnalysisRuntimeStatus>) {
  return atomicUpdateRuntimeStatus(stockAnalysisDir, (current) => ({
    ...current,
    ...partial,
    staleReasons: partial.staleReasons ? dedupeStrings(partial.staleReasons) : current.staleReasons,
  }))
}

async function markRunState(stockAnalysisDir: string, runState: StockAnalysisRunState, currentRun: StockAnalysisCurrentRun | null, extra?: Partial<StockAnalysisRuntimeStatus>) {
  return updateRuntimeStatus(stockAnalysisDir, {
    runState,
    currentRun,
    ...extra,
  })
}

async function fetchCsi500ConstituentsFresh() {
  const rows = await runPythonJson<PythonConstituentItem[]>(CSI500_CONSTITUENTS_SCRIPT)
  return rows.map<StockAnalysisWatchlistCandidate>((item) => ({
    code: item.成分券代码,
    name: item.成分券名称,
    market: getMarketFromCode(item.成分券代码),
    exchange: item.交易所,
    industryName: item.行业名称 ?? null,
  }))
}

const ALL_A_STOCK_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

interface PythonAllAStockItem {
  code: string
  name: string
}

async function fetchAllAStockListFresh(): Promise<StockAnalysisWatchlistCandidate[]> {
  const rows = await runPythonJson<PythonAllAStockItem[]>(ALL_A_STOCK_LIST_SCRIPT)
  return rows
    .filter((item) => typeof item.code === 'string' && typeof item.name === 'string' && item.code.length > 0)
    .map<StockAnalysisWatchlistCandidate>((item) => {
      const market = getMarketFromCode(item.code)
      const exchange = market === 'sh' ? '上交所' : market === 'bj' ? '北交所' : '深交所'
      return {
        code: item.code,
        name: item.name,
        market,
        exchange,
        industryName: null,
      }
    })
}

/**
 * 获取 A 股全市场代码表（仅用于自选搜索）。
 * 7 天内有缓存直接返回；过期则重新拉取并写入本地文件。
 * 拉取失败但有旧缓存时回退旧缓存；都没有则抛错。
 */
async function getAllAStockList(stockAnalysisDir: string): Promise<StockAnalysisWatchlistCandidate[]> {
  const meta = await readAllAStockListMeta(stockAnalysisDir)
  if (isFresh(meta.refreshedAt, ALL_A_STOCK_TTL_MS)) {
    const cached = await readAllAStockList(stockAnalysisDir)
    if (cached.length > 0) {
      return cached
    }
  }

  try {
    const fresh = await fetchAllAStockListFresh()
    if (fresh.length > 0) {
      await saveAllAStockList(stockAnalysisDir, fresh)
      await saveAllAStockListMeta(stockAnalysisDir, { refreshedAt: nowIso() })
      return fresh
    }
  } catch (error) {
    console.warn('[stock-analysis] 拉取 A 股全市场列表失败，尝试回退旧缓存', error)
  }

  const fallback = await readAllAStockList(stockAnalysisDir)
  return fallback
}

async function fetchCsi500IndexHistoryFresh() {
  const sourceErrors: string[] = []

  try {
    return await fetchCsi500IndexHistoryFromTencent()
  } catch (error) {
    sourceErrors.push(`腾讯指数接口失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  try {
    return await fetchCsi500IndexHistoryFromEastmoney()
  } catch (error) {
    sourceErrors.push(`东方财富直连失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  try {
    return await runPythonJson<PythonIndexHistoryItem[]>(CSI500_INDEX_HISTORY_SCRIPT)
  } catch (error) {
    sourceErrors.push(`AKShare 备用源失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  throw new Error(sourceErrors.join('；'))
}

function parseTencentIndexHistory(rows: string[][]) {
  return rows
    .map<PythonIndexHistoryItem | null>((row) => {
      const [date, _open, close, _high, _low, volume] = row
      const closeNumber = Number(close)
      const volumeNumber = Number(volume)
      if (!date || !Number.isFinite(closeNumber)) {
        return null
      }
      return {
        日期: date,
        收盘: closeNumber,
        成交额: Number.isFinite(volumeNumber) ? Math.max(0, closeNumber * volumeNumber) : 0,
      }
    })
    .filter((item): item is PythonIndexHistoryItem => Boolean(item))
}

async function fetchCsi500IndexHistoryFromTencent() {
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=sh000905,day,,,40'
  const data = await fetchJsonWithRetry<TencentIndexKlineResponse>(url)
  const rows = data.data?.sh000905?.day ?? []
  const parsed = parseTencentIndexHistory(rows)
  if (parsed.length === 0) {
    throw new Error('腾讯指数接口未返回有效日线')
  }
  return parsed
}

function parseEastmoneyIndexHistory(lines: string[]) {
  return lines
    .map<PythonIndexHistoryItem | null>((line) => {
      const [日期, _开盘, 收盘, _最高, _最低, _成交量, 成交额] = line.split(',')
      const close = Number(收盘)
      const turnover = Number(成交额)
      if (!日期 || !Number.isFinite(close) || !Number.isFinite(turnover)) {
        return null
      }
      return { 日期, 收盘: close, 成交额: turnover }
    })
    .filter((item): item is PythonIndexHistoryItem => Boolean(item))
}

async function fetchCsi500IndexHistoryFromEastmoney() {
  const failures: string[] = []

  for (const secid of INDEX_HISTORY_SEC_IDS) {
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&ut=7eea3edcaed734bea9cbfc24409ed989&klt=101&fqt=0&lmt=40&end=20500000&iscca=1&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`

    try {
      const data = await fetchJsonWithRetry<EastmoneyKlineResponse>(url)
      const items = parseEastmoneyIndexHistory(data.data?.klines ?? [])
      if (items.length > 0) {
        return items
      }
      failures.push(`${secid} 无有效K线数据`)
    } catch (error) {
      failures.push(`${secid} ${error instanceof Error ? error.message : '请求失败'}`)
    }
  }

  throw new Error(failures.join(' | '))
}

async function getStockPoolData(stockAnalysisDir: string, forceRefresh = false): Promise<DataEnvelope<StockAnalysisWatchlistCandidate[]>> {
  const [cached, meta] = await Promise.all([
    readStockAnalysisStockPool(stockAnalysisDir),
    readStockAnalysisStockPoolMeta(stockAnalysisDir),
  ])

  if (!forceRefresh && cached.length > 0 && isFresh(meta.refreshedAt, STOCK_POOL_CACHE_TTL_MS)) {
    return { data: cached, fetchedAt: meta.refreshedAt, usedFallback: false, staleReasons: [] }
  }

  try {
    const fresh = await fetchCsi500ConstituentsFresh()
    const refreshedAt = nowIso()
    await Promise.all([
      saveStockAnalysisStockPool(stockAnalysisDir, fresh),
      saveStockAnalysisStockPoolMeta(stockAnalysisDir, { refreshedAt }),
      updateRuntimeStatus(stockAnalysisDir, { stockPoolRefreshedAt: refreshedAt }),
    ])
    return { data: fresh, fetchedAt: refreshedAt, usedFallback: false, staleReasons: [] }
  } catch (error) {
    if (cached.length > 0) {
      return {
        data: cached,
        fetchedAt: meta.refreshedAt,
        usedFallback: true,
        staleReasons: dedupeStrings(['股票池刷新失败，已回退到本地缓存', getStaleReasonForAge('股票池', meta.refreshedAt, STOCK_POOL_CACHE_TTL_MS) ?? '']),
      }
    }
    throw error
  }
}

async function getIndexHistoryData(stockAnalysisDir: string): Promise<DataEnvelope<PythonIndexHistoryItem[]>> {
  const cached = await readStockAnalysisIndexHistoryCache(stockAnalysisDir)
  if (cached && isFresh(cached.fetchedAt, INDEX_HISTORY_CACHE_TTL_MS) && cached.items.length > 0) {
    return { data: cached.items, fetchedAt: cached.fetchedAt, usedFallback: false, staleReasons: [] }
  }

  try {
    const fresh = await fetchCsi500IndexHistoryFresh()
    const fetchedAt = nowIso()
    const cache: StockAnalysisIndexHistoryCache = { fetchedAt, items: fresh }
    await Promise.all([
      saveStockAnalysisIndexHistoryCache(stockAnalysisDir, cache),
      updateRuntimeStatus(stockAnalysisDir, { indexHistoryCacheAt: fetchedAt }),
    ])
    return { data: fresh, fetchedAt, usedFallback: false, staleReasons: [] }
  } catch (error) {
    if (cached && cached.items.length > 0) {
      return {
        data: cached.items,
        fetchedAt: cached.fetchedAt,
        usedFallback: true,
        staleReasons: dedupeStrings(['指数历史刷新失败，已回退到本地缓存', getStaleReasonForAge('指数历史', cached.fetchedAt, INDEX_HISTORY_CACHE_TTL_MS) ?? '']),
      }
    }
    const latestSignalDate = await getLatestAvailableSignalDate(stockAnalysisDir)
    const lastMarketState = latestSignalDate ? await readStockAnalysisMarketState(stockAnalysisDir, latestSignalDate) : null
    const staleReasons = dedupeStrings([
      '指数历史刷新失败，已降级为简化市场状态',
      error instanceof Error ? error.message : '指数历史抓取失败',
    ])

    if (lastMarketState) {
      return {
        data: [
          { 日期: lastMarketState.asOfDate, 收盘: 1000 + lastMarketState.csi500Return20d, 成交额: lastMarketState.averageTurnover20d },
          { 日期: todayDate(), 收盘: 1000, 成交额: lastMarketState.averageTurnover20d },
        ],
        fetchedAt: null,
        usedFallback: true,
        staleReasons,
      }
    }

    return {
      data: [],
      fetchedAt: null,
      usedFallback: true,
      staleReasons,
    }
  }
}

async function fetchSpotQuotesFresh(codes: string[]) {
  const quotes = new Map<string, StockAnalysisSpotQuote>()
  const chunkSize = 80
  for (let index = 0; index < codes.length; index += chunkSize) {
    const chunk = codes.slice(index, index + chunkSize)
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&ut=${EASTMONEY_UT}&fields=f12,f14,f100,f2,f3,f8,f15,f16,f17,f18,f20,f21&secids=${chunk.map(getSecId).join(',')}`
    const data = await fetchJsonWithRetry<EastmoneySpotResponse>(url)
    const items = data.data?.diff ?? []
    for (const item of items) {
      quotes.set(item.f12, {
        code: item.f12,
        name: item.f14,
        industryName: typeof item.f100 === 'string' && item.f100.trim() ? item.f100.trim() : null,
        latestPrice: safeNumber(item.f2),
        changePercent: safeNumber(item.f3),
        turnoverRate: safeNumber(item.f8),
        high: safeNumber(item.f15),
        low: safeNumber(item.f16),
        open: safeNumber(item.f17),
        previousClose: safeNumber(item.f18),
        totalMarketCap: safeNumber(item.f20),
        circulatingMarketCap: safeNumber(item.f21),
      })
    }
  }
  return quotes
}

function parseTencentQuoteLine(line: string): StockAnalysisSpotQuote | null {
  const match = /^v_([a-z]{2}\d+)="(.+)";$/.exec(line.trim())
  if (!match) {
    return null
  }
  const symbol = match[1]
  const fields = match[2].split('~')
  const code = symbol.slice(2)
  const latestPrice = Number(fields[3])
  if (!code || !Number.isFinite(latestPrice)) {
    return null
  }
  return {
    code,
    name: fields[1] || code,
    industryName: null,
    latestPrice: safeNumber(latestPrice),
    changePercent: safeNumber(Number(fields[32])),
    turnoverRate: safeNumber(Number(fields[38])),
    high: safeNumber(Number(fields[33])),
    low: safeNumber(Number(fields[34])),
    open: safeNumber(Number(fields[5])),
    previousClose: safeNumber(Number(fields[4])),
    totalMarketCap: safeNumber(Number(fields[45])),
    circulatingMarketCap: safeNumber(Number(fields[44])),
  }
}

async function fetchSpotQuotesFromTencent(codes: string[]) {
  const quotes = new Map<string, StockAnalysisSpotQuote>()
  const chunkSize = 100
  for (let index = 0; index < codes.length; index += chunkSize) {
    const chunk = codes.slice(index, index + chunkSize)
    const symbols = chunk.map(getTencentSymbol).join(',')
    const url = `https://qt.gtimg.cn/q=${symbols}`
    const text = await fetchTextWithRetry(url)
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
    for (const line of lines) {
      const quote = parseTencentQuoteLine(line)
      if (quote) {
        quotes.set(quote.code, quote)
      }
    }
  }
  if (quotes.size === 0) {
    throw new Error('腾讯实时接口未返回有效行情')
  }
  return quotes
}

function mergeQuoteIndustry(
  quotes: Map<string, StockAnalysisSpotQuote>,
  candidates: StockAnalysisWatchlistCandidate[],
) {
  const candidateIndustryMap = new Map(candidates.map((candidate) => [candidate.code, candidate.industryName ?? null]))
  for (const [code, quote] of quotes) {
    if (!quote.industryName) {
      const fallbackIndustry = candidateIndustryMap.get(code) ?? null
      quotes.set(code, { ...quote, industryName: fallbackIndustry })
    }
  }
  return quotes
}

async function getQuoteData(stockAnalysisDir: string, codes: string[]): Promise<DataEnvelope<Map<string, StockAnalysisSpotQuote>>> {
  const stockPool = await readStockAnalysisStockPool(stockAnalysisDir)
  const candidates = stockPool.filter((candidate) => codes.includes(candidate.code))
  const cached = await readStockAnalysisQuoteCache(stockAnalysisDir)
  const cachedMap = new Map((cached?.quotes ?? []).map((item) => [item.code, item]))
  mergeQuoteIndustry(cachedMap, candidates)

  if (cached && isFresh(cached.fetchedAt, QUOTE_CACHE_TTL_MS) && codes.every((code) => cachedMap.has(code))) {
    return { data: cachedMap, fetchedAt: cached.fetchedAt, usedFallback: false, staleReasons: [] }
  }

  // 腾讯为主源，东方财富为备源（东方财富 TLS 在 OpenSSL 3.5.x 下不兼容）
  const sourceErrors: string[] = []

  try {
    const freshMap = mergeQuoteIndustry(await fetchSpotQuotesFromTencent(codes), candidates)
    const fetchedAt = nowIso()
    const cache: StockAnalysisQuoteCache = { fetchedAt, quotes: [...freshMap.values()] }
    await Promise.all([
      saveStockAnalysisQuoteCache(stockAnalysisDir, cache),
      updateRuntimeStatus(stockAnalysisDir, { quoteCacheAt: fetchedAt }),
    ])
    return { data: freshMap, fetchedAt, usedFallback: false, staleReasons: [] }
  } catch (error) {
    sourceErrors.push(`腾讯行情接口失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  try {
    const freshMap = mergeQuoteIndustry(await fetchSpotQuotesFresh(codes), candidates)
    const fetchedAt = nowIso()
    const cache: StockAnalysisQuoteCache = { fetchedAt, quotes: [...freshMap.values()] }
    await Promise.all([
      saveStockAnalysisQuoteCache(stockAnalysisDir, cache),
      updateRuntimeStatus(stockAnalysisDir, { quoteCacheAt: fetchedAt }),
    ])
    return { data: freshMap, fetchedAt, usedFallback: false, staleReasons: [] }
  } catch (error) {
    sourceErrors.push(`东方财富行情接口失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  saLog.audit('Service', `实时行情所有在线源均失败: ${sourceErrors.join(' | ')}`)

  if (cachedMap.size > 0) {
    return {
      data: cachedMap,
      fetchedAt: cached?.fetchedAt ?? null,
      usedFallback: true,
      staleReasons: dedupeStrings(['实时行情刷新失败，已回退到本地缓存', getStaleReasonForAge('实时行情', cached?.fetchedAt ?? null, QUOTE_CACHE_TTL_MS) ?? '']),
    }
  }
  throw new Error(sourceErrors.join('；'))
}

async function fetchStockHistoryFresh(code: string, limit = 90) {
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${getSecId(code)}&klt=101&fqt=1&lmt=${limit}&end=20500000&iscca=1&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61`
  const data = await fetchJsonWithRetry<EastmoneyKlineResponse>(url)
  const lines = data.data?.klines ?? []
  return lines.map<StockAnalysisKlinePoint>((line) => {
    const [date, open, close, high, low, volume, turnover, amplitude, changePercent, changeAmount, turnoverRate] = line.split(',')
    return {
      date,
      open: Number(open),
      close: Number(close),
      high: Number(high),
      low: Number(low),
      volume: Number(volume),
      turnover: Number(turnover),
      amplitude: Number(amplitude),
      changePercent: Number(changePercent),
      changeAmount: Number(changeAmount),
      turnoverRate: Number(turnoverRate),
    }
  })
}

async function fetchStockHistoryFromTencent(code: string, limit = 90) {
  const symbol = getTencentSymbol(code)
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${limit},qfq`
  const data = await fetchJsonWithRetry<TencentIndexKlineResponse>(url)
  const rows = data.data?.[symbol]?.qfqday ?? data.data?.[symbol]?.day ?? []
  const points = rows.map<StockAnalysisKlinePoint | null>((row, index) => {
    const [date, open, close, high, low, volume] = row
    const openNumber = Number(open)
    const closeNumber = Number(close)
    const highNumber = Number(high)
    const lowNumber = Number(low)
    const volumeNumber = Number(volume)
    if (!date || !Number.isFinite(closeNumber)) {
      return null
    }
    const previousClose = index > 0 ? Number(rows[index - 1][2]) : closeNumber
    const changeAmount = closeNumber - previousClose
    const changePercent = previousClose > 0 ? (changeAmount / previousClose) * 100 : 0
    const amplitude = previousClose > 0 ? ((highNumber - lowNumber) / previousClose) * 100 : 0
    // 腾讯 K 线接口不提供成交额和换手率（API 仅返回 6 字段: date/open/close/high/low/volume）
    // 用 volume(手) × 均价 × 100 推算成交额，误差 <1%（已和同花顺/搜狐数据交叉验证）
    const avgPrice = (openNumber + closeNumber + highNumber + lowNumber) / 4
    const derivedTurnover = volumeNumber > 0 && avgPrice > 0 ? round(volumeNumber * avgPrice * 100) : 0
    return {
      date,
      open: safeNumber(openNumber),
      close: safeNumber(closeNumber),
      high: safeNumber(highNumber),
      low: safeNumber(lowNumber),
      volume: safeNumber(volumeNumber),
      turnover: derivedTurnover,
      amplitude: round(amplitude),
      changePercent: round(changePercent),
      changeAmount: round(changeAmount),
      turnoverRate: 0,
    }
  }).filter((item): item is StockAnalysisKlinePoint => Boolean(item))

  if (points.length === 0) {
    throw new Error(`${code} 腾讯历史接口未返回有效K线`)
  }
  return points
}

// ── 数据源3: 同花顺 (10jqka) ──────────────────────────────────────
// 返回 JSONP 格式，含完整字段：日期,开盘,收盘,最高,最低,成交量(股),成交额(元),振幅,换手率,0,0
async function fetchStockHistoryFromTonghuashun(code: string) {
  const hsCode = `hs_${code}`
  const url = `https://d.10jqka.com.cn/v6/line/${hsCode}/01/last.js`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 ClawOS StockAnalysis',
        Referer: 'https://stockpage.10jqka.com.cn/',
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`同花顺K线请求失败: ${response.status}`)
    }
    const text = await response.text()
    // JSONP 格式: quotebridge_v6_line_hs_XXXXXX_01_last({...})
    const jsonMatch = text.match(/\((\{[\s\S]+\})\)/)
    if (!jsonMatch) {
      throw new Error(`${code} 同花顺K线返回格式异常`)
    }
    const data = JSON.parse(jsonMatch[1]) as TonghuashunKlineResponse
    const rawData = data.data
    if (!rawData) {
      throw new Error(`${code} 同花顺K线数据为空`)
    }
    const rows = rawData.split(';').filter(Boolean)
    const points = rows.map<StockAnalysisKlinePoint | null>((row, index) => {
      const parts = row.split(',')
      if (parts.length < 7) return null
      // 同花顺字段顺序: date, open, high, low, close, volume, turnover, amplitude
      const [dateRaw, openStr, highStr, lowStr, closeStr, volumeStr, turnoverStr, amplitudeStr] = parts
      const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      const openNumber = Number(openStr)
      const closeNumber = Number(closeStr)
      const highNumber = Number(highStr)
      const lowNumber = Number(lowStr)
      const volumeNumber = Number(volumeStr) // 股
      const turnoverNumber = Number(turnoverStr) // 元
      if (!date || !Number.isFinite(closeNumber)) return null
      const previousClose = index > 0 ? (() => {
        const prevParts = rows[index - 1].split(',')
        return Number(prevParts[4]) // 同花顺 close 在 index 4
      })() : closeNumber
      const changeAmount = closeNumber - previousClose
      const changePercent = previousClose > 0 ? (changeAmount / previousClose) * 100 : 0
      const amplitude = Number(amplitudeStr) || (previousClose > 0 ? ((highNumber - lowNumber) / previousClose) * 100 : 0)
      // 同花顺 volume 是「股」，转换为「手」（1手=100股）
      const volumeInLots = Math.round(volumeNumber / 100)
      return {
        date,
        open: safeNumber(openNumber),
        close: safeNumber(closeNumber),
        high: safeNumber(highNumber),
        low: safeNumber(lowNumber),
        volume: safeNumber(volumeInLots),
        turnover: round(turnoverNumber),
        amplitude: round(amplitude),
        changePercent: round(changePercent),
        changeAmount: round(changeAmount),
        turnoverRate: 0,
      }
    }).filter((item): item is StockAnalysisKlinePoint => Boolean(item))
    if (points.length === 0) {
      throw new Error(`${code} 同花顺历史接口未返回有效K线`)
    }
    return points
  } finally {
    clearTimeout(timeout)
  }
}

// ── 数据源4: 搜狐财经 (Sohu) ──────────────────────────────────────
// JSON 格式，含成交额（万元）和换手率
async function fetchStockHistoryFromSohu(code: string, limit = 90) {
  const sohuCode = `cn_${code}`
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - Math.ceil(limit * 1.8)) // 预留节假日空间
  const formatDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const url = `https://q.stock.sohu.com/hisHq?code=${sohuCode}&start=${formatDate(startDate)}&end=${formatDate(endDate)}&stat=1&order=A&period=d&rt=json`
  const data = await fetchJsonWithRetry<SohuKlineResponse[]>(url)
  if (!data || data.length === 0 || !data[0].hq) {
    throw new Error(`${code} 搜狐K线数据为空`)
  }
  // 搜狐 hq 数组: [日期, 开盘, 收盘, 涨跌额, 涨跌幅%, 最低, 最高, 成交量(手), 成交额(万元), 换手率%]
  const rows = data[0].hq
  const points = rows.map<StockAnalysisKlinePoint | null>((row, index) => {
    const [date, openStr, closeStr, changeAmountStr, _changePercentStr, lowStr, highStr, volumeStr, turnoverStr, turnoverRateStr] = row
    const openNumber = Number(openStr)
    const closeNumber = Number(closeStr)
    const highNumber = Number(highStr)
    const lowNumber = Number(lowStr)
    const volumeNumber = Number(volumeStr) // 手
    const turnoverNumber = Number(turnoverStr) * 10000 // 万元 → 元
    const turnoverRate = parseFloat(turnoverRateStr) || 0
    if (!date || !Number.isFinite(closeNumber)) return null
    const previousClose = index > 0 ? Number(rows[index - 1][2]) : closeNumber
    const changeAmount = Number(changeAmountStr) || (closeNumber - previousClose)
    const changePercent = previousClose > 0 ? (changeAmount / previousClose) * 100 : 0
    const amplitude = previousClose > 0 ? ((highNumber - lowNumber) / previousClose) * 100 : 0
    return {
      date,
      open: safeNumber(openNumber),
      close: safeNumber(closeNumber),
      high: safeNumber(highNumber),
      low: safeNumber(lowNumber),
      volume: safeNumber(volumeNumber),
      turnover: round(turnoverNumber),
      amplitude: round(amplitude),
      changePercent: round(changePercent),
      changeAmount: round(changeAmount),
      turnoverRate: round(turnoverRate),
    }
  }).filter((item): item is StockAnalysisKlinePoint => Boolean(item))
  if (points.length === 0) {
    throw new Error(`${code} 搜狐历史接口未返回有效K线`)
  }
  return points.slice(-limit)
}

// ── 数据源5: 新浪财经 (Sina) ──────────────────────────────────────
// JSON 格式，仅含 volume（股），成交额通过 volume × 均价 推算
async function fetchStockHistoryFromSina(code: string, limit = 90) {
  const market = getMarketFromCode(code)
  const sinaSymbol = market === 'sh' ? `sh${code}` : `sz${code}`
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${sinaSymbol}&scale=240&ma=no&datalen=${limit}`
  const data = await fetchJsonWithRetry<SinaKlineItem[]>(url)
  if (!data || data.length === 0) {
    throw new Error(`${code} 新浪K线数据为空`)
  }
  const points = data.map<StockAnalysisKlinePoint | null>((item, index) => {
    const openNumber = Number(item.open)
    const closeNumber = Number(item.close)
    const highNumber = Number(item.high)
    const lowNumber = Number(item.low)
    const volumeInShares = Number(item.volume) // 股
    if (!item.day || !Number.isFinite(closeNumber)) return null
    const previousClose = index > 0 ? Number(data[index - 1].close) : closeNumber
    const changeAmount = closeNumber - previousClose
    const changePercent = previousClose > 0 ? (changeAmount / previousClose) * 100 : 0
    const amplitude = previousClose > 0 ? ((highNumber - lowNumber) / previousClose) * 100 : 0
    // 新浪 volume 是「股」，转换为「手」
    const volumeInLots = Math.round(volumeInShares / 100)
    // 新浪不提供成交额，用 volume(股) × 均价 推算（误差 <1%，已和同花顺/搜狐交叉验证）
    const avgPrice = (openNumber + closeNumber + highNumber + lowNumber) / 4
    const derivedTurnover = volumeInShares > 0 && avgPrice > 0 ? round(volumeInShares * avgPrice) : 0
    return {
      date: item.day,
      open: safeNumber(openNumber),
      close: safeNumber(closeNumber),
      high: safeNumber(highNumber),
      low: safeNumber(lowNumber),
      volume: safeNumber(volumeInLots),
      turnover: derivedTurnover,
      amplitude: round(amplitude),
      changePercent: round(changePercent),
      changeAmount: round(changeAmount),
      turnoverRate: 0,
    }
  }).filter((item): item is StockAnalysisKlinePoint => Boolean(item))
  if (points.length === 0) {
    throw new Error(`${code} 新浪历史接口未返回有效K线`)
  }
  return points
}

async function getStockHistoryData(stockAnalysisDir: string, code: string): Promise<DataEnvelope<StockAnalysisKlinePoint[]>> {
  const cached = await readStockAnalysisHistoryCache(stockAnalysisDir, code)
  // 缓存未过期且成交额有效时直接返回（turnover>0 表示非旧版缺失数据的缓存）
  if (cached && isFresh(cached.fetchedAt, HISTORY_CACHE_TTL_MS) && cached.items.length >= 30 && cached.items.some((item) => item.turnover > 0)) {
    return { data: cached.items, fetchedAt: cached.fetchedAt, usedFallback: false, staleReasons: [] }
  }

  // 6 级数据源 fallback 链：优先使用含真实成交额的源
  // 1. 同花顺 (含成交额/元)  2. 搜狐 (含成交额/万元)  3. 东方财富 (含成交额/元，TLS 可能不兼容)
  // 4. 新浪 (仅 volume 股，推算成交额)  5. 腾讯 (仅 volume 手，推算成交额)  6. 本地缓存兜底
  const sourceErrors: string[] = []

  const trySaveAndReturn = async (fresh: StockAnalysisKlinePoint[], sourceName: string) => {
    const fetchedAt = nowIso()
    const cache: StockAnalysisHistoryCache = { fetchedAt, latestDate: fresh.at(-1)?.date ?? null, items: fresh }
    await saveStockAnalysisHistoryCache(stockAnalysisDir, code, cache)
    logger.debug(`${code} K线数据来源: ${sourceName} (${fresh.length}条)`)
    return { data: fresh, fetchedAt, usedFallback: false, staleReasons: [] } satisfies DataEnvelope<StockAnalysisKlinePoint[]>
  }

  // 源1: 同花顺 — 完整数据含成交额(元)
  try {
    const fresh = await fetchStockHistoryFromTonghuashun(code)
    return await trySaveAndReturn(fresh, '同花顺')
  } catch (error) {
    sourceErrors.push(`同花顺: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  // 源2: 搜狐 — 含成交额(万元)和换手率
  try {
    const fresh = await fetchStockHistoryFromSohu(code)
    return await trySaveAndReturn(fresh, '搜狐')
  } catch (error) {
    sourceErrors.push(`搜狐: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  // 源3: 东方财富 — 含完整字段（OpenSSL 3.5.x 下 TLS 可能不兼容）
  try {
    const fresh = await fetchStockHistoryFresh(code)
    return await trySaveAndReturn(fresh, '东方财富')
  } catch (error) {
    sourceErrors.push(`东方财富: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  // 源4: 新浪 — 仅 volume(股)，成交额通过 volume×均价 推算
  try {
    const fresh = await fetchStockHistoryFromSina(code)
    return await trySaveAndReturn(fresh, '新浪(推算成交额)')
  } catch (error) {
    sourceErrors.push(`新浪: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  // 源5: 腾讯 — 仅 volume(手)，成交额通过 volume×均价×100 推算
  try {
    const fresh = await fetchStockHistoryFromTencent(code)
    return await trySaveAndReturn(fresh, '腾讯(推算成交额)')
  } catch (error) {
    sourceErrors.push(`腾讯: ${error instanceof Error ? error.message : '未知错误'}`)
  }

  // 源6: 本地缓存兜底（宁可旧，不可挂）
  saLog.audit('Service', `${code} 历史K线全部 5 个在线源均失败: ${sourceErrors.join(' | ')}`)

  if (cached && cached.items.length >= 30) {
    return {
      data: cached.items,
      fetchedAt: cached.fetchedAt,
      usedFallback: true,
      staleReasons: dedupeStrings([`${code} 历史K线刷新失败，已回退到本地缓存`, getStaleReasonForAge(`${code} 历史K线`, cached.fetchedAt, HISTORY_CACHE_TTL_MS) ?? '']),
    }
  }
  throw new Error(sourceErrors.join('；'))
}

async function buildIndustryTrendMapForStockPool(
  stockAnalysisDir: string,
  stockPool: StockAnalysisWatchlistCandidate[],
  quotes: Map<string, StockAnalysisSpotQuote>,
  existingHistoryMap?: Map<string, StockAnalysisKlinePoint[]>,
) {
  const historyMap = new Map<string, StockAnalysisKlinePoint[]>(existingHistoryMap ?? [])

  await runLimitedConcurrency(stockPool, MAX_HISTORY_CONCURRENCY, async (candidate) => {
    if (historyMap.has(candidate.code)) {
      return null
    }

    const cached = await readStockAnalysisHistoryCache(stockAnalysisDir, candidate.code)
    if (cached && cached.items.length >= 61) {
      historyMap.set(candidate.code, cached.items)
      return null
    }

    try {
      const historyEnvelope = await getStockHistoryData(stockAnalysisDir, candidate.code)
      if (historyEnvelope.data.length >= 61) {
        historyMap.set(candidate.code, historyEnvelope.data)
      }
    } catch (error) {
      saLog.info('Service', `行业趋势补样本失败 ${candidate.code}: ${error instanceof Error ? error.message : '未知错误'}`)
    }

    return null
  })

  return buildIndustryTrendMap(stockPool, quotes, historyMap)
}

function calculateMovingAverage(points: StockAnalysisKlinePoint[], period: number) {
  if (points.length < period) {
    return average(points.map((point) => point.close))
  }
  return average(points.slice(-period).map((point) => point.close))
}

function calculateMovingAverageSlope(points: StockAnalysisKlinePoint[], period: number, lookback = 5) {
  if (points.length < period + lookback) {
    return 0
  }
  const currentAverage = calculateMovingAverage(points, period)
  const previousAverage = calculateMovingAverage(points.slice(0, -lookback), period)
  return safeDivide(currentAverage - previousAverage, previousAverage) * 100
}

function calculateRsi(points: StockAnalysisKlinePoint[], period = 14): number | null {
  if (points.length < period + 1) {
    return null
  }

  const changes = points.slice(1).map((point, index) => point.close - points[index].close)
  const gains = changes.map((change) => Math.max(change, 0))
  const losses = changes.map((change) => Math.max(-change, 0))

  let averageGain = average(gains.slice(0, period))
  let averageLoss = average(losses.slice(0, period))

  for (let index = period; index < changes.length; index += 1) {
    averageGain = ((averageGain * (period - 1)) + gains[index]) / period
    averageLoss = ((averageLoss * (period - 1)) + losses[index]) / period
  }

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100
  }

  const relativeStrength = averageGain / averageLoss
  return 100 - (100 / (1 + relativeStrength))
}

function calculateEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) {
    return []
  }
  const multiplier = 2 / (period + 1)
  const initialSeed = average(values.slice(0, Math.min(period, values.length)))
  const emaSeries: number[] = [initialSeed]
  for (let index = 1; index < values.length; index += 1) {
    emaSeries.push((values[index] - emaSeries[index - 1]) * multiplier + emaSeries[index - 1])
  }
  return emaSeries
}

function calculateMacd(points: StockAnalysisKlinePoint[]) {
  if (points.length < 35) {
    return { line: null, signal: null, histogram: null }
  }
  const closes = points.map((point) => point.close)
  const ema12 = calculateEmaSeries(closes, 12)
  const ema26 = calculateEmaSeries(closes, 26)
  const macdSeries = closes.map((_, index) => ema12[index] - ema26[index])
  const signalSeries = calculateEmaSeries(macdSeries, 9)
  const line = macdSeries.at(-1) ?? null
  const signal = signalSeries.at(-1) ?? null
  const histogram = line != null && signal != null ? line - signal : null
  return { line, signal, histogram }
}

function calculateAtr(points: StockAnalysisKlinePoint[], period = 14): number | null {
  if (points.length < period + 1) {
    return null
  }
  const trueRanges = points.slice(1).map((point, index) => {
    const previousClose = points[index].close
    return Math.max(
      point.high - point.low,
      Math.abs(point.high - previousClose),
      Math.abs(point.low - previousClose),
    )
  })
  return average(trueRanges.slice(-period))
}

function countConsecutiveDeclines(points: StockAnalysisKlinePoint[]) {
  let declines = 0
  for (let index = points.length - 1; index >= 1; index -= 1) {
    if (points[index].close < points[index - 1].close) {
      declines += 1
      continue
    }
    break
  }
  return declines
}

function calculateTrailingReturn(points: StockAnalysisKlinePoint[], lookback: number) {
  if (points.length < lookback + 1) {
    return null
  }
  const latestClose = points.at(-1)?.close ?? null
  const baseClose = points.at(-(lookback + 1))?.close ?? null
  if (latestClose == null || baseClose == null || baseClose <= 0) {
    return null
  }
  return safeDivide(latestClose - baseClose, baseClose) * 100
}

function percentileRank(values: number[], target: number) {
  if (values.length === 0) {
    return 0.5
  }
  const below = values.filter((value) => value <= target).length
  return below / values.length
}

function normalizeScore(value: number, min: number, max: number) {
  if (max <= min) {
    return 50
  }
  const normalized = ((value - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, normalized))
}

function normalizePercentile(value: number | null | undefined) {
  if (value == null || !isFinite(value)) {
    return 50
  }
  return Math.max(0, Math.min(100, value * 100))
}

/** M7: 基于均线 + 近期高低点 + 成交量密集区的支撑/压力位计算 */
function calculateSupportResistance(klines: StockAnalysisKlinePoint[], latestPrice: number): SupportResistanceLevels {
  if (klines.length < 20) {
    // 数据不足，使用简单百分比
    return {
      support1: round(latestPrice * 0.97),
      support2: round(latestPrice * 0.94),
      resistance1: round(latestPrice * 1.03),
      resistance2: round(latestPrice * 1.06),
      method: 'ma_pivot_volume',
    }
  }

  // --- 方法1: 均线支撑/压力 ---
  const ma5 = calculateMovingAverage(klines, 5)
  const ma20 = calculateMovingAverage(klines, 20)
  const ma60 = calculateMovingAverage(klines, 60)
  const maLevels = [ma5, ma20, ma60].filter((v) => v > 0)
  const maSupports = maLevels.filter((v) => v < latestPrice).sort((a, b) => b - a) // 最近的在前
  const maResistances = maLevels.filter((v) => v > latestPrice).sort((a, b) => a - b)

  // --- 方法2: 近期 pivot 高低点（20日 + 60日窗口） ---
  const recent20 = klines.slice(-20)
  const recent60 = klines.slice(-60)
  const pivotHighs: number[] = []
  const pivotLows: number[] = []
  for (let i = 2; i < recent60.length - 2; i++) {
    const point = recent60[i]
    if (point.high > recent60[i - 1].high && point.high > recent60[i - 2].high
      && point.high > recent60[i + 1].high && point.high > recent60[i + 2].high) {
      pivotHighs.push(point.high)
    }
    if (point.low < recent60[i - 1].low && point.low < recent60[i - 2].low
      && point.low < recent60[i + 1].low && point.low < recent60[i + 2].low) {
      pivotLows.push(point.low)
    }
  }
  const pivotSupports = pivotLows.filter((v) => v < latestPrice).sort((a, b) => b - a)
  const pivotResistances = pivotHighs.filter((v) => v > latestPrice).sort((a, b) => a - b)

  // --- 方法3: 成交量加权密集区 ---
  const priceVolumeBuckets = new Map<number, number>()
  const bucketSize = latestPrice * 0.005 // 0.5% 粒度
  for (const k of recent60) {
    const mid = (k.high + k.low) / 2
    const bucket = Math.round(mid / bucketSize) * bucketSize
    priceVolumeBuckets.set(bucket, (priceVolumeBuckets.get(bucket) ?? 0) + k.volume)
  }
  const sortedBuckets = [...priceVolumeBuckets.entries()].sort((a, b) => b[1] - a[1])
  const volumeSupports = sortedBuckets.filter(([price]) => price < latestPrice).map(([price]) => price).slice(0, 3)
  const volumeResistances = sortedBuckets.filter(([price]) => price > latestPrice).map(([price]) => price).slice(0, 3)

  // --- 综合: 加权取最近的支撑/压力 ---
  const allSupports = [
    ...maSupports.map((v) => ({ price: v, weight: 1.5 })),
    ...pivotSupports.map((v) => ({ price: v, weight: 2.0 })),
    ...volumeSupports.map((v) => ({ price: v, weight: 1.0 })),
    { price: Math.min(...recent20.map((k) => k.low)), weight: 1.2 }, // 20日最低点
  ].filter((s) => s.price > 0 && s.price < latestPrice)
    .sort((a, b) => b.price - a.price) // 离现价最近的在前

  const allResistances = [
    ...maResistances.map((v) => ({ price: v, weight: 1.5 })),
    ...pivotResistances.map((v) => ({ price: v, weight: 2.0 })),
    ...volumeResistances.map((v) => ({ price: v, weight: 1.0 })),
    { price: Math.max(...recent20.map((k) => k.high)), weight: 1.2 }, // 20日最高点
  ].filter((r) => r.price > 0 && r.price > latestPrice)
    .sort((a, b) => a.price - b.price) // 离现价最近的在前

  const support1 = allSupports[0]?.price ?? round(latestPrice * 0.97)
  const support2 = allSupports[1]?.price ?? round(latestPrice * 0.94)
  const resistance1 = allResistances[0]?.price ?? round(latestPrice * 1.03)
  const resistance2 = allResistances[1]?.price ?? round(latestPrice * 1.06)

  return {
    support1: round(support1),
    support2: round(support2),
    resistance1: round(resistance1),
    resistance2: round(resistance2),
    method: 'ma_pivot_volume',
  }
}

function detectTrend(return20d: number): MarketTrend {
  if (return20d > 5) return 'bull_trend'
  if (return20d < -5) return 'bear_trend'
  return 'range_bound'
}

function detectVolatility(vol: number, percentile?: number): MarketVolatility {
  // [M3] 优先使用百分位法（75th/25th），无历史数据时回退到固定阈值
  if (percentile !== undefined) {
    if (percentile > 0.75) return 'high_volatility'
    if (percentile < 0.25) return 'low_volatility'
    return 'normal_volatility'
  }
  if (vol > 30) return 'high_volatility'
  if (vol < 18) return 'low_volatility'
  return 'normal_volatility'
}

function detectLiquidity(avgTurnover20d: number, percentile?: number): MarketLiquidity {
  // [M3] 优先使用百分位法（75th/25th），无历史数据时回退到固定阈值
  if (percentile !== undefined) {
    if (percentile > 0.75) return 'high_liquidity'
    if (percentile < 0.25) return 'low_liquidity'
    return 'normal_liquidity'
  }
  if (avgTurnover20d > 180_000_000_000) return 'high_liquidity'
  if (avgTurnover20d < 90_000_000_000) return 'low_liquidity'
  return 'normal_liquidity'
}

function detectSentiment(risingRatio: number): MarketSentiment {
  if (risingRatio > 0.6) return 'optimistic'
  if (risingRatio < 0.4) return 'pessimistic'
  return 'neutral'
}

function detectStyle(avgReturn20d: number): MarketStyle {
  if (avgReturn20d > 2) return 'small_cap'
  if (avgReturn20d < -2) return 'large_cap'
  return 'balanced'
}

const UNSUPPORTED_LLM_CANDIDATES = new Set([
  'OpenCodeGo/MiMo-V2-Pro',
  'OpenCodeGo/GLM-5',
])

function isUnsupportedLLMCandidate(providerName: string, modelId: string): boolean {
  return UNSUPPORTED_LLM_CANDIDATES.has(`${providerName}/${modelId}`)
}

function describeMarketLiquidityState(marketState: StockAnalysisMarketState, config: StockAnalysisStrategyConfig): string {
  const volumePct = marketState.volumePercentile ?? 0.5
  const risingRatio = marketState.risingRatio ?? 0.5
  const isCrisis = isLiquidityCrisis(marketState, config)
  const isGuardrail = isLowLiquidityGuardrail(marketState, config)
  const mode = isCrisis ? 'crisis' : isGuardrail ? 'guardrail' : 'normal'

  return `mode=${mode} volumePct=${round(volumePct, 4)} risingRatio=${round(risingRatio, 4)} sentiment=${marketState.sentiment} threshold=${config.lowLiquidityGuardrail.volumePercentileThreshold}`
}

function isLiquidityCrisis(marketState: StockAnalysisMarketState, config: StockAnalysisStrategyConfig): boolean {
  const volumePct = marketState.volumePercentile ?? 0.5
  const risingRatio = marketState.risingRatio ?? 0.5
  const pessimistic = marketState.sentiment === 'pessimistic'
  const broadWeakness = risingRatio < config.lowLiquidityGuardrail.crisisRisingRatioThreshold

  return volumePct < config.lowLiquidityGuardrail.volumePercentileThreshold && broadWeakness && pessimistic
}

function isLowLiquidityGuardrail(marketState: StockAnalysisMarketState, config: StockAnalysisStrategyConfig): boolean {
  const volumePct = marketState.volumePercentile ?? 0.5
  return volumePct < config.lowLiquidityGuardrail.volumePercentileThreshold && !isLiquidityCrisis(marketState, config)
}

function buildMarketState(stockPool: StockAnalysisWatchlistCandidate[], quotes: Map<string, StockAnalysisSpotQuote>, indexHistory: PythonIndexHistoryItem[]) {
  const stockReturns = stockPool
    .map((item) => quotes.get(item.code))
    .filter((item): item is StockAnalysisSpotQuote => Boolean(item))
    .map((item) => item.changePercent)

  if (indexHistory.length === 0) {
    const risingRatio = safeDivide(stockReturns.filter((value) => value > 0).length, stockReturns.length)
    const avgReturn20d = average(stockReturns)
    return {
      asOfDate: todayDate(),
      trend: 'range_bound',
      volatility: 'normal_volatility',
      liquidity: 'normal_liquidity',
      sentiment: detectSentiment(risingRatio),
      style: detectStyle(avgReturn20d),
      csi500Return20d: 0,
      annualizedVolatility20d: 0,
      averageTurnover20d: 0,
      risingRatio: round(risingRatio, 4),
    } satisfies StockAnalysisMarketState
  }

  const closes = indexHistory.map((item) => Number(item.收盘)).filter(Number.isFinite)
  const turnovers = indexHistory.map((item) => Number(item.成交额)).filter(Number.isFinite)
  const returns = closes.slice(1).map((close, index) => safeDivide(close - closes[index], closes[index]))
  const csi500Return20d = closes.length >= 21 ? safeDivide(closes.at(-1)! - closes.at(-21)!, closes.at(-21)!) * 100 : 0
  const annualizedVolatility20d = stddev(returns.slice(-20)) * Math.sqrt(252) * 100
  const averageTurnover20d = average(turnovers.slice(-20))

  // 市场级风控: 计算波动率和成交量在历史中的百分位
  const historicalVolatilities = returns.length >= 40
    ? Array.from({ length: Math.min(returns.length - 19, 252) }, (_, i) => {
        const start = returns.length - 20 - i
        if (start < 0) return null
        return stddev(returns.slice(start, start + 20)) * Math.sqrt(252) * 100
      }).filter((v): v is number => v !== null)
    : []
  const volatilityPercentile = historicalVolatilities.length >= 20
    ? percentileRank(historicalVolatilities, annualizedVolatility20d)
    : 0.5

  const volumePercentile = turnovers.length >= 20
    ? percentileRank(turnovers.slice(-252), turnovers.at(-1) ?? 0)
    : 0.5

  const risingRatio = safeDivide(stockReturns.filter((value) => value > 0).length, stockReturns.length)
  const avgReturn20d = average(stockReturns)

  return {
    asOfDate: todayDate(),
    trend: detectTrend(csi500Return20d),
    volatility: detectVolatility(annualizedVolatility20d, volatilityPercentile),
    liquidity: detectLiquidity(averageTurnover20d, volumePercentile),
    sentiment: detectSentiment(risingRatio),
    style: detectStyle(avgReturn20d),
    csi500Return20d: round(csi500Return20d),
    annualizedVolatility20d: round(annualizedVolatility20d),
    averageTurnover20d: round(averageTurnover20d),
    risingRatio: round(risingRatio, 4),
    volatilityPercentile: round(volatilityPercentile, 4),
    volumePercentile: round(volumePercentile, 4),
  } satisfies StockAnalysisMarketState
}

function buildSector(code: string) {
  if (code.startsWith('300') || code.startsWith('688')) return '成长科技'
  if (code.startsWith('60')) return '沪市主板'
  if (code.startsWith('002')) return '中小盘制造'
  if (code.startsWith('00')) return '深市主板'
  return '中证500'
}

type IndustryStrengthStats = {
  averageChangePercent: number
  breadth: number
  rankPercentile: number
}

type IndustryTrendStats = {
  averageReturn20d: number
  averageReturn60d: number
  rankPercentile: number
}

type CrossSectionalMomentumStats = {
  rank20d: number
  rank60d: number
}

function buildIndustryStrengthMap(
  stockPool: StockAnalysisWatchlistCandidate[],
  quotes: Map<string, StockAnalysisSpotQuote>,
) {
  const industryAggregation = new Map<string, { totalChangePercent: number; positiveCount: number; count: number }>()

  for (const candidate of stockPool) {
    const quote = quotes.get(candidate.code)
    const industryName = quote?.industryName ?? candidate.industryName ?? null
    if (!quote || !industryName) {
      continue
    }
    const existing = industryAggregation.get(industryName) ?? { totalChangePercent: 0, positiveCount: 0, count: 0 }
    existing.totalChangePercent += quote.changePercent
    existing.positiveCount += quote.changePercent > 0 ? 1 : 0
    existing.count += 1
    industryAggregation.set(industryName, existing)
  }

  const ranked = [...industryAggregation.entries()]
    .map(([industryName, stats]) => ({
      industryName,
      averageChangePercent: stats.count > 0 ? stats.totalChangePercent / stats.count : 0,
      breadth: stats.count > 0 ? stats.positiveCount / stats.count : 0,
    }))
    .sort((left, right) => right.averageChangePercent - left.averageChangePercent)

  const industryStrengthMap = new Map<string, IndustryStrengthStats>()
  ranked.forEach((item, index) => {
    const denominator = Math.max(1, ranked.length - 1)
    const rankPercentile = ranked.length === 1 ? 1 : 1 - (index / denominator)
    industryStrengthMap.set(item.industryName, {
      averageChangePercent: round(item.averageChangePercent, 4),
      breadth: round(item.breadth, 4),
      rankPercentile: round(rankPercentile, 4),
    })
  })

  return industryStrengthMap
}

function buildIndustryTrendMap(
  stockPool: StockAnalysisWatchlistCandidate[],
  quotes: Map<string, StockAnalysisSpotQuote>,
  historyMap: Map<string, StockAnalysisKlinePoint[]>,
) {
  const industryAggregation = new Map<string, {
    totalReturn20d: number
    count20d: number
    totalReturn60d: number
    count60d: number
  }>()

  for (const candidate of stockPool) {
    const industryName = quotes.get(candidate.code)?.industryName ?? candidate.industryName ?? null
    const history = historyMap.get(candidate.code)
    if (!industryName || !history || history.length < 61) {
      continue
    }

    const return20d = calculateTrailingReturn(history, 20)
    const return60d = calculateTrailingReturn(history, 60)
    const existing = industryAggregation.get(industryName) ?? {
      totalReturn20d: 0,
      count20d: 0,
      totalReturn60d: 0,
      count60d: 0,
    }

    if (return20d != null) {
      existing.totalReturn20d += return20d
      existing.count20d += 1
    }
    if (return60d != null) {
      existing.totalReturn60d += return60d
      existing.count60d += 1
    }

    industryAggregation.set(industryName, existing)
  }

  const ranked = [...industryAggregation.entries()]
    .map(([industryName, stats]) => {
      const averageReturn20d = stats.count20d > 0 ? stats.totalReturn20d / stats.count20d : null
      const averageReturn60d = stats.count60d > 0 ? stats.totalReturn60d / stats.count60d : null
      if (averageReturn20d == null || averageReturn60d == null) {
        return null
      }
      return {
        industryName,
        averageReturn20d,
        averageReturn60d,
        compositeTrend: (averageReturn20d * 0.4) + (averageReturn60d * 0.6),
      }
    })
    .filter((item): item is { industryName: string; averageReturn20d: number; averageReturn60d: number; compositeTrend: number } => Boolean(item))
    .sort((left, right) => right.compositeTrend - left.compositeTrend)

  const industryTrendMap = new Map<string, IndustryTrendStats>()
  ranked.forEach((item, index) => {
    const denominator = Math.max(1, ranked.length - 1)
    const rankPercentile = ranked.length === 1 ? 1 : 1 - (index / denominator)
    industryTrendMap.set(item.industryName, {
      averageReturn20d: round(item.averageReturn20d, 4),
      averageReturn60d: round(item.averageReturn60d, 4),
      rankPercentile: round(rankPercentile, 4),
    })
  })

  return industryTrendMap
}

function buildCrossSectionalMomentumMap(snapshots: StockAnalysisStockSnapshot[]) {
  const return20dValues = snapshots.map((snapshot) => snapshot.return20d)
  const return60dValues = snapshots.map((snapshot) => snapshot.return60d)
  const crossSectionalMomentumMap = new Map<string, CrossSectionalMomentumStats>()

  for (const snapshot of snapshots) {
    crossSectionalMomentumMap.set(snapshot.code, {
      rank20d: round(percentileRank(return20dValues, snapshot.return20d), 4),
      rank60d: round(percentileRank(return60dValues, snapshot.return60d), 4),
    })
  }

  return crossSectionalMomentumMap
}

function applyCrossSectionalMomentumRanks(
  snapshots: StockAnalysisStockSnapshot[],
  crossSectionalMomentumMap: Map<string, CrossSectionalMomentumStats>,
) {
  return snapshots.map<StockAnalysisStockSnapshot>((snapshot) => {
    const ranks = crossSectionalMomentumMap.get(snapshot.code)
    if (!ranks) {
      return snapshot
    }
    return {
      ...snapshot,
      momentumRank20d: ranks.rank20d,
      momentumRank60d: ranks.rank60d,
    }
  })
}

function buildSnapshot(
  candidate: StockAnalysisWatchlistCandidate,
  quote: StockAnalysisSpotQuote,
  history: StockAnalysisKlinePoint[],
  config: StockAnalysisStrategyConfig,
  industryStrengthMap?: Map<string, IndustryStrengthStats>,
  industryTrendMap?: Map<string, IndustryTrendStats>,
) {
  const closeValues = history.map((point) => point.close)
  const turnoverValues = history.map((point) => point.turnover)
  const volatilitySamples = history.slice(1).map((point, index) => safeDivide(point.close - history[index].close, history[index].close) * 100)
  const latest = history.at(-1)
  const close20 = history.length >= 21 ? history.at(-21)?.close ?? history[0].close : history[0]?.close ?? quote.previousClose
  const close5 = history.length >= 6 ? history.at(-6)?.close ?? history[0].close : history[0]?.close ?? quote.previousClose
  const close60 = history.length >= 61 ? history.at(-61)?.close ?? history[0]?.close ?? quote.previousClose : history[0]?.close ?? quote.previousClose
  const close120 = history.length >= 121 ? history.at(-121)?.close ?? history[0]?.close ?? quote.previousClose : history[0]?.close ?? quote.previousClose
  const avgTurnover20 = average(turnoverValues.slice(-20))
  const avgVolume20 = average(history.slice(-20).map((point) => point.volume))
  const amplitude20d = average(history.slice(-20).map((point) => point.amplitude))
  const declineDays20d = countConsecutiveDeclines(history.slice(-20))
  const volatility20d = stddev(volatilitySamples.slice(-20)) * Math.sqrt(252)
  const volatilityRank = percentileRank(volatilitySamples.map(Math.abs), Math.abs(volatilitySamples.at(-1) ?? 0))
  const latestClose = latest?.close ?? quote.latestPrice
  const max20 = Math.max(...closeValues.slice(-20))
  const min20 = Math.min(...closeValues.slice(-20))
  const position20d = max20 === min20 ? 0.5 : (latestClose - min20) / (max20 - min20)
  const movingAverage5 = round(calculateMovingAverage(history, 5))
  const movingAverage20 = round(calculateMovingAverage(history, 20))
  const movingAverage60 = round(calculateMovingAverage(history, 60))
  const movingAverage120 = round(calculateMovingAverage(history, 120))
  const movingAverage20Slope = round(calculateMovingAverageSlope(history, 20), 4)
  const movingAverage60Slope = round(calculateMovingAverageSlope(history, 60), 4)
  const rsi14 = calculateRsi(history)
  const macd = calculateMacd(history)
  const atr14 = calculateAtr(history)
  const supportResistance = history.length >= 20 ? calculateSupportResistance(history, latestClose) : null
  const industryName = quote.industryName ?? candidate.industryName ?? buildSector(candidate.code)
  const industryStrength = industryStrengthMap?.get(industryName) ?? null
  const industryTrend = industryTrendMap?.get(industryName) ?? null
  const distanceToResistance1 = supportResistance
    ? round(safeDivide(supportResistance.resistance1 - latestClose, latestClose) * 100, 4)
    : null
  const distanceToSupport1 = supportResistance
    ? round(safeDivide(latestClose - supportResistance.support1, latestClose) * 100, 4)
    : null

  const scoreReason: string[] = []
  if (avgTurnover20 >= config.minTurnoverAmount20d) scoreReason.push('成交额达标')
  if (amplitude20d >= config.minAmplitude20d) scoreReason.push('20日振幅充足')
  if (declineDays20d < config.maxContinuousDeclineDays) scoreReason.push('未陷入长期单边下跌')
  if (quote.turnoverRate > 3) scoreReason.push('换手率活跃')
  if ((macd.histogram ?? 0) > 0) scoreReason.push('MACD 动能为正')
  if ((rsi14 ?? 50) >= 45 && (rsi14 ?? 50) <= 75) scoreReason.push('RSI 位于健康区间')

  return {
    code: candidate.code,
    name: candidate.name,
    market: candidate.market,
    exchange: candidate.exchange,
    sector: industryName,
    latestPrice: quote.latestPrice,
    changePercent: quote.changePercent,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    turnoverRate: quote.turnoverRate,
    totalMarketCap: quote.totalMarketCap,
    circulatingMarketCap: quote.circulatingMarketCap,
    averageTurnoverAmount20d: round(avgTurnover20),
    amplitude20d: round(amplitude20d),
    declineDays20d,
    return5d: round(safeDivide(latestClose - close5, close5) * 100),
    return20d: round(safeDivide(latestClose - close20, close20) * 100),
    return60d: round(safeDivide(latestClose - close60, close60) * 100),
    return120d: round(safeDivide(latestClose - close120, close120) * 100),
    momentumRank20d: null,
    momentumRank60d: null,
    volumeBreakout: round(safeDivide(latest?.volume ?? 0, avgVolume20), 3),
    volatility20d: round(volatility20d),
    volatilityRank: round(volatilityRank, 4),
    pricePosition20d: round(position20d, 4),
    movingAverage5,
    movingAverage20,
    movingAverage60,
    movingAverage120,
    movingAverage20Slope,
    movingAverage60Slope,
    rsi14: rsi14 != null ? round(rsi14, 2) : null,
    macdLine: macd.line != null ? round(macd.line, 4) : null,
    macdSignal: macd.signal != null ? round(macd.signal, 4) : null,
    macdHistogram: macd.histogram != null ? round(macd.histogram, 4) : null,
    atr14: atr14 != null ? round(atr14, 4) : null,
    atrPercent: atr14 != null ? round(safeDivide(atr14, latestClose) * 100, 4) : null,
    distanceToResistance1,
    distanceToSupport1,
    industryStrength: industryStrength?.rankPercentile != null ? round(industryStrength.rankPercentile, 4) : null,
    industryBreadth: industryStrength?.breadth != null ? round(industryStrength.breadth, 4) : null,
    industryReturn20d: industryTrend?.averageReturn20d != null ? round(industryTrend.averageReturn20d, 4) : null,
    industryReturn60d: industryTrend?.averageReturn60d != null ? round(industryTrend.averageReturn60d, 4) : null,
    industryTrendStrength: industryTrend?.rankPercentile != null ? round(industryTrend.rankPercentile, 4) : null,
    scoreReason,
  } satisfies StockAnalysisStockSnapshot
}

/** 旧版公式模拟专家评分（作为 LLM 不可用时的降级方案） */
function buildExpertScoreFallback(snapshot: StockAnalysisStockSnapshot, marketState: StockAnalysisMarketState): StockAnalysisExpertScore {
  // [P2-19] 钳位确保 bullish + bearish <= 45，避免 neutralCount 变负数
  const rawBullish = Math.max(5, Math.round(15 + snapshot.return20d / 2 + snapshot.pricePosition20d * 10))
  const rawBearish = Math.max(2, Math.round(10 - snapshot.return20d / 4 + (snapshot.declineDays20d / 3)))
  const bullishCount = Math.min(rawBullish, 40)
  const bearishCount = Math.min(rawBearish, 45 - bullishCount)
  const neutralCount = 45 - bullishCount - bearishCount
  const consensus = safeDivide(bullishCount, bullishCount + bearishCount)
  let score = consensus * 100
  if (marketState.trend === 'bull_trend') score += 4
  if (marketState.trend === 'bear_trend') score -= 6
  if (snapshot.volumeBreakout > 1.2) score += 3
  if (snapshot.declineDays20d > 10) score -= 5

  return {
    bullishCount,
    bearishCount,
    neutralCount,
    consensus: round(consensus, 4),
    score: round(Math.max(0, Math.min(100, score))),
    highlights: snapshot.scoreReason.slice(0, 3),
    risks: [
      snapshot.declineDays20d >= 10 ? '近20日连续下跌时间偏长' : '暂无显著结构风险',
      snapshot.volatility20d > 35 ? '波动率偏高，需控制仓位' : '波动率在可接受区间',
    ],
    votes: [],
    llmSuccessCount: 0,
    fallbackCount: 0,
    isSimulated: true,
  }
}

function buildTechnicalScore(snapshot: StockAnalysisStockSnapshot) {
  const latestPrice = snapshot.latestPrice
  const movingAverage120 = snapshot.movingAverage120 || snapshot.movingAverage60
  const movingAverage20Slope = Number.isFinite(snapshot.movingAverage20Slope) ? snapshot.movingAverage20Slope : 0
  const movingAverage60Slope = Number.isFinite(snapshot.movingAverage60Slope) ? snapshot.movingAverage60Slope : 0
  const rsi14 = snapshot.rsi14 ?? 50
  const macdLine = snapshot.macdLine ?? 0
  const macdSignal = snapshot.macdSignal ?? 0
  const macdHistogram = snapshot.macdHistogram ?? 0
  const atrPercent = snapshot.atrPercent ?? 4
  const distanceToResistance1 = snapshot.distanceToResistance1
  const distanceToSupport1 = snapshot.distanceToSupport1
  const trend = normalizeScore(
    Number(latestPrice > snapshot.movingAverage20)
    + Number(latestPrice > snapshot.movingAverage60)
    + Number(latestPrice > movingAverage120)
    + normalizeScore(movingAverage20Slope, -5, 5) / 100
    + normalizeScore(movingAverage60Slope, -5, 5) / 100,
    0,
    5,
  )
  const momentumConfirmation = average([
    normalizeScore(macdHistogram * 100, -15, 15),
    normalizeScore(macdLine - macdSignal, -0.8, 0.8),
    normalizeScore(rsi14, 35, 75),
  ])
  const resistanceBuffer = distanceToResistance1 == null
    ? 50
    : normalizeScore(distanceToResistance1, 0.5, 12)
  const supportBuffer = distanceToSupport1 == null
    ? 50
    : normalizeScore(12 - distanceToSupport1, 0, 12)
  const structure = average([
    normalizeScore(snapshot.pricePosition20d, 0.35, 0.95),
    normalizeScore(snapshot.return20d, -12, 20),
    resistanceBuffer,
    supportBuffer,
  ])
  const participation = average([
    normalizeScore(snapshot.volumeBreakout, 0.7, 2.5),
    normalizeScore(snapshot.turnoverRate, 1, 10),
    normalizeScore(snapshot.averageTurnoverAmount20d, 50_000_000, 3_000_000_000),
  ])
  const riskPenalty = average([
    normalizeScore(8 - atrPercent, 0, 8),
    normalizeScore(1 - snapshot.volatilityRank, 0, 1),
    normalizeScore(12 - snapshot.return5d, 0, 12),
  ])
  const total = 0.30 * trend + 0.20 * momentumConfirmation + 0.25 * structure + 0.15 * participation + 0.10 * riskPenalty
  const absolute = round(average([trend, structure]))
  const relative = round(average([momentumConfirmation, riskPenalty]))
  const sector = round(participation)
  return {
    total: round(total),
    trend: round(trend),
    momentumConfirmation: round(momentumConfirmation),
    structure: round(structure),
    participation: round(participation),
    risk: round(riskPenalty),
    absolute,
    relative,
    sector,
    notes: [
      snapshot.latestPrice > snapshot.movingAverage20 ? '站上 MA20' : '仍在 MA20 下方',
      macdHistogram >= 0 ? 'MACD 动能为正' : 'MACD 动能转弱',
      rsi14 > 75 ? 'RSI 偏热，警惕追高' : rsi14 < 35 ? 'RSI 偏弱，需等待修复' : 'RSI 位于健康区间',
      distanceToResistance1 != null && distanceToResistance1 < 2 ? '接近上方阻力位' : '上方阻力压力可控',
      snapshot.volumeBreakout > 1 ? '量能放大' : '量能一般',
    ],
  }
}

function buildQuantScore(snapshot: StockAnalysisStockSnapshot, marketState: StockAnalysisMarketState) {
  const return120d = Number.isFinite(snapshot.return120d) ? snapshot.return120d : snapshot.return60d
  const atrPercent = snapshot.atrPercent ?? 4
  const movingAverage20 = snapshot.movingAverage20 || snapshot.latestPrice
  const movingAverage60 = snapshot.movingAverage60 || snapshot.latestPrice
  let momentumWeight = 0.25
  let meanReversionWeight = 0.10
  let stabilityWeight = 0.15
  if (marketState.trend === 'bull_trend') {
    momentumWeight *= 1.2
    meanReversionWeight *= 0.8
  }
  if (marketState.trend === 'bear_trend') {
    momentumWeight *= 0.8
    meanReversionWeight *= 1.2
  }
  if (marketState.volatility === 'high_volatility') {
    stabilityWeight *= 1.3
  }

  const crossSectionalWeight = 0.20
  const liquidityWeight = 0.15
  const industryWeight = 0.15
  const fixedWeights = crossSectionalWeight + liquidityWeight + industryWeight
  const dynamicSum = momentumWeight + meanReversionWeight + stabilityWeight
  const targetDynamicSum = 1 - fixedWeights
  if (dynamicSum > 0 && Math.abs(dynamicSum - targetDynamicSum) > 0.001) {
    const scale = targetDynamicSum / dynamicSum
    momentumWeight *= scale
    meanReversionWeight *= scale
    stabilityWeight *= scale
  }

  const mediumTermMomentum = average([
    normalizeScore(snapshot.return20d, -20, 25),
    normalizeScore(snapshot.return60d, -25, 35),
    normalizeScore(return120d, -30, 45),
  ])
  const crossSectionalStrength = average([
    normalizePercentile(snapshot.momentumRank20d),
    normalizePercentile(snapshot.momentumRank60d),
    normalizePercentile(1 - snapshot.volatilityRank),
    normalizeScore(snapshot.volumeBreakout, 0.7, 2.4),
    normalizeScore(snapshot.pricePosition20d, 0.2, 0.95),
  ])
  const liquidityQuality = average([
    normalizeScore(snapshot.averageTurnoverAmount20d, 50_000_000, 3_000_000_000),
    normalizeScore(snapshot.turnoverRate, 1, 10),
    normalizeScore(snapshot.volumeBreakout, 0.8, 2.2),
  ])
  const stability = average([
    normalizeScore(1 - snapshot.volatilityRank, 0, 1),
    normalizeScore(8 - atrPercent, 0, 8),
    normalizeScore(20 - Math.abs(snapshot.return5d), 0, 20),
  ])
  const meanReversion = average([
    normalizeScore(1 - safeDivide(snapshot.latestPrice - movingAverage20, movingAverage20), -0.15, 0.15),
    normalizeScore(1 - safeDivide(snapshot.latestPrice - movingAverage60, movingAverage60), -0.3, 0.3),
  ])
  const industryStrength = average([
    normalizePercentile(snapshot.industryStrength),
    normalizePercentile(snapshot.industryBreadth),
    normalizePercentile(snapshot.industryTrendStrength),
    normalizeScore(snapshot.industryReturn20d ?? 0, -15, 20),
    normalizeScore(snapshot.industryReturn60d ?? 0, -20, 30),
  ])

  const total = momentumWeight * mediumTermMomentum
    + crossSectionalWeight * crossSectionalStrength
    + liquidityWeight * liquidityQuality
    + stabilityWeight * stability
    + meanReversionWeight * meanReversion
    + industryWeight * industryStrength

  return {
    total: round(total),
    mediumTermMomentum: round(mediumTermMomentum),
    crossSectionalStrength: round(crossSectionalStrength),
    liquidityQuality: round(liquidityQuality),
    stability: round(stability),
    meanReversion: round(meanReversion),
    momentum: round(mediumTermMomentum),
    volumeBreakout: round(crossSectionalStrength),
    volatility: round(stability),
    liquidity: round(liquidityQuality),
    value: round(meanReversion),
    notes: [
      snapshot.return60d > 0 ? '中期动量保持为正' : '中期动量偏弱',
      snapshot.volumeBreakout > 1 ? '量能活跃，具备横截面优势' : '量能未明显放大',
      snapshot.averageTurnoverAmount20d > 200_000_000 ? '流动性充足' : '流动性一般',
      (snapshot.industryTrendStrength ?? 0) >= 0.7 ? '所属行业处于中期强势趋势' : (snapshot.industryStrength ?? 0) >= 0.7 ? '所属行业当日强势，但趋势仍需确认' : '所属行业强度一般',
      Math.abs(snapshot.return5d) > 10 ? '短期波动偏大，警惕动量崩塌' : '短期波动仍可接受',
    ],
  }
}

function buildCandidatePoolScore(snapshot: StockAnalysisStockSnapshot) {
  const return120d = Number.isFinite(snapshot.return120d) ? snapshot.return120d : snapshot.return60d
  const movingAverage20Slope = Number.isFinite(snapshot.movingAverage20Slope) ? snapshot.movingAverage20Slope : 0
  const movingAverage60Slope = Number.isFinite(snapshot.movingAverage60Slope) ? snapshot.movingAverage60Slope : 0
  const atrPercent = snapshot.atrPercent ?? 4
  const mediumTermMomentum = average([
    normalizeScore(snapshot.return20d, -20, 25),
    normalizeScore(snapshot.return60d, -25, 35),
    normalizeScore(return120d, -30, 45),
  ])
  const technicalStructure = average([
    normalizeScore(snapshot.pricePosition20d, 0.25, 0.95),
    normalizeScore(movingAverage20Slope, -5, 5),
    normalizeScore(movingAverage60Slope, -5, 5),
  ])
  const liquidityQuality = average([
    normalizeScore(snapshot.averageTurnoverAmount20d, 50_000_000, 3_000_000_000),
    normalizeScore(snapshot.turnoverRate, 1, 10),
    normalizeScore(snapshot.volumeBreakout, 0.8, 2.2),
  ])
  const stability = average([
    normalizeScore(1 - snapshot.volatilityRank, 0, 1),
    normalizeScore(8 - atrPercent, 0, 8),
    normalizeScore(15 - Math.abs(snapshot.return5d), 0, 15),
  ])
  const industryStrength = average([
    normalizePercentile(snapshot.industryStrength),
    normalizePercentile(snapshot.industryBreadth),
    normalizePercentile(snapshot.industryTrendStrength),
    normalizeScore(snapshot.industryReturn20d ?? 0, -15, 20),
    normalizeScore(snapshot.industryReturn60d ?? 0, -20, 30),
  ])

  return round(0.30 * mediumTermMomentum + 0.20 * technicalStructure + 0.20 * liquidityQuality + 0.15 * stability + 0.15 * industryStrength, 4)
}

function getMarketRegime(marketState: StockAnalysisMarketState): MarketRegime {
  if (marketState.trend === 'bull_trend') return 'bull_trend'
  if (marketState.trend === 'bear_trend') return 'bear_trend'
  if (marketState.volatility === 'high_volatility') return 'high_volatility'
  if (marketState.volatility === 'low_volatility') return 'low_volatility_range'
  return 'normal_range'
}

function getThresholds(config: StockAnalysisStrategyConfig, marketState: StockAnalysisMarketState) {
  const regime = getMarketRegime(marketState)
  return config.marketThresholds[regime]
}

function getFusionWeights(config: StockAnalysisStrategyConfig, marketState: StockAnalysisMarketState): StockAnalysisFusionWeights {
  const regime = getMarketRegime(marketState)
  return config.fusionWeightsByRegime[regime]
}

/**
 * [M5] Kelly Criterion 仓位计算
 * kelly = winRate - (1 - winRate) / profitLossRatio
 * 使用半 Kelly（half-Kelly）降低风险，并钳位到安全区间
 * 当没有足够历史数据时，回退到固定比例
 */
function calculateKellyPosition(action: string, learnedWeights?: StockAnalysisLearnedWeights | null, trades?: StockAnalysisTradeRecord[]): number {
  if (action !== 'strong_buy' && action !== 'buy') return 0

  // 需要至少有一条历史记录且样本量 >= 10 才启用 Kelly
  const latestEntry = learnedWeights?.history?.[0]
  if (!latestEntry || latestEntry.sampleCount < 10) {
    // 回退固定比例
    return action === 'strong_buy' ? 0.3 : 0.2
  }

  const winRate = latestEntry.winRate
  // P2-A2: 优先使用实际交易数据计算盈亏比，不足时回退默认值
  const DEFAULT_PROFIT_LOSS_RATIO = 1.5
  let profitLossRatio = DEFAULT_PROFIT_LOSS_RATIO
  if (trades && trades.length >= 10) {
    const actual = calculateProfitLossRatio(trades)
    if (actual > 0 && isFinite(actual)) {
      profitLossRatio = actual
    }
  }

  // Kelly 公式：f = p - (1-p)/b   其中 p=胜率, b=盈亏比
  const kellyFraction = winRate - (1 - winRate) / profitLossRatio

  // Kelly 为负 → 不应开仓，但 action 已通过 conviction filter，给最低仓位
  if (kellyFraction <= 0) {
    return action === 'strong_buy' ? 0.05 : 0.05
  }

  // 半 Kelly 降低风险
  const halfKelly = kellyFraction / 2

  // 按 action 类型钳位到合理区间
  if (action === 'strong_buy') {
    return round(Math.max(0.05, Math.min(0.3, halfKelly)), 4)
  }
  return round(Math.max(0.05, Math.min(0.2, halfKelly)), 4)
}

async function buildSignal(snapshot: StockAnalysisStockSnapshot, marketState: StockAnalysisMarketState, config: StockAnalysisStrategyConfig, learnedWeights?: StockAnalysisLearnedWeights | null, aiConfig?: StockAnalysisAIConfig | null, expertWeights?: Map<string, number>, history?: StockAnalysisKlinePoint[], profileMap?: Map<string, ExpertProfile>, factPoolSummary?: FactPoolSummary, memoryStore?: ExpertMemoryStore, eventVetoCodes?: Map<string, string>, trades?: StockAnalysisTradeRecord[]): Promise<StockAnalysisSignal> {
  // 判断是否有可用的 AI 配置（至少有一个启用的 provider 和有模型分配的专家）
  const hasAI = aiConfig
    && aiConfig.providers.some((p) => p.enabled && p.apiKey)
    && aiConfig.experts.some((e) => e.enabled && e.layer !== 'rule_functions' && e.assignedModel)

  let expert: StockAnalysisExpertScore
  if (hasAI) {
    try {
      const llmResult = await runExpertVoting(snapshot, marketState, aiConfig, expertWeights, profileMap, factPoolSummary, memoryStore)
      expert = {
        bullishCount: llmResult.bullishCount,
        bearishCount: llmResult.bearishCount,
        neutralCount: llmResult.neutralCount,
        consensus: llmResult.consensus,
        score: llmResult.score,
        highlights: llmResult.highlights,
        risks: llmResult.risks,
        votes: llmResult.votes,
        llmSuccessCount: llmResult.llmSuccessCount,
        llmFallbackCount: llmResult.llmFallbackCount,
        ruleFallbackCount: llmResult.ruleFallbackCount,
        fallbackCount: llmResult.fallbackCount,
        isSimulated: llmResult.isSimulated,
      }
      logger.info(`[stock-analysis] ${snapshot.code} 专家投票完成: LLM主成功=${llmResult.llmSuccessCount - llmResult.llmFallbackCount}, LLM-fallback=${llmResult.llmFallbackCount}, 规则降级=${llmResult.ruleFallbackCount}, 模拟=${llmResult.isSimulated}`, { module: 'StockAnalysis' })
    } catch (error) {
      logger.error(`[stock-analysis] ${snapshot.code} LLM 投票异常，降级为公式模拟: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      expert = buildExpertScoreFallback(snapshot, marketState)
    }
  } else {
    expert = buildExpertScoreFallback(snapshot, marketState)
  }

  const technical = buildTechnicalScore(snapshot)
  const quant = buildQuantScore(snapshot, marketState)
  const thresholds = getThresholds(config, marketState)
  const regime = getMarketRegime(marketState)
  const baseWeights = getFusionWeights(config, marketState)
  const fusionWeights = getAdjustedFusionWeights(baseWeights, learnedWeights ?? null)

  // [M4] 专家 fallback 降权：仅当规则引擎降级时才降低专家流权重
  // LLM fallback（换模型但仍是真实 LLM 分析）不降权
  let effectiveWeights = { ...fusionWeights }
  const ruleFallback = expert.ruleFallbackCount ?? 0
  if (expert.isSimulated) {
    // 全部模拟（零 LLM 成功）：专家权重减半，差额平分给技术流和量化流
    const reduction = effectiveWeights.expert * 0.5
    effectiveWeights = {
      expert: effectiveWeights.expert - reduction,
      technical: effectiveWeights.technical + reduction * 0.5,
      quant: effectiveWeights.quant + reduction * 0.5,
    }
  } else if (ruleFallback > 0 && (expert.llmSuccessCount ?? 0) > 0) {
    // 部分规则降级：仅按规则降级比例缩减专家权重（LLM fallback 不算降级）
    const llmVoterCount = (expert.llmSuccessCount ?? 0) + ruleFallback
    const degradeRatio = ruleFallback / llmVoterCount
    const reduction = effectiveWeights.expert * degradeRatio * 0.3 // 温和降权：仅按规则降级比例的30%缩减
    effectiveWeights = {
      expert: effectiveWeights.expert - reduction,
      technical: effectiveWeights.technical + reduction * 0.5,
      quant: effectiveWeights.quant + reduction * 0.5,
    }
  }

  let compositeScore = effectiveWeights.expert * expert.score + effectiveWeights.technical * technical.total + effectiveWeights.quant * quant.total
  const passingChecks: string[] = []
  const vetoReasons: string[] = []
  const watchReasons: string[] = []

  if (marketState.trend === 'bear_trend' && marketState.csi500Return20d < -10) vetoReasons.push('极端熊市（20日跌幅>10%），暂停所有新开仓')
  if (marketState.volatility === 'high_volatility' && (marketState.volatilityPercentile ?? 0) > 0.95) vetoReasons.push('极端波动（波动率>95th百分位），仓位上限降至50%')
  const liquidityExplanation = describeMarketLiquidityState(marketState, config)
  if (isLiquidityCrisis(marketState, config)) {
    vetoReasons.push('流动性危机（缩量 + 普跌 + 悲观情绪共振），仅允许卖出')
    saLog.audit('Service', `流动性危机触发 ${snapshot.code}(${snapshot.name}): ${liquidityExplanation}`)
  } else if (isLowLiquidityGuardrail(marketState, config)) {
    watchReasons.push('成交额分位偏低，但未达到流动性危机，不执行一票否决')
    compositeScore = Math.max(0, compositeScore - config.lowLiquidityGuardrail.scorePenalty)
    saLog.info('Service', `低流动性护栏 ${snapshot.code}(${snapshot.name}): ${liquidityExplanation} scorePenalty=${config.lowLiquidityGuardrail.scorePenalty}`)
  }
  if (marketState.volatility === 'high_volatility' && marketState.annualizedVolatility20d > 35 && (marketState.volatilityPercentile ?? 0) <= 0.95) vetoReasons.push('市场波动率偏高')
  // [MH1] 重大事件一票否决：即将/正在发生财报、解禁、重组等重大事件的股票
  const eventVetoReason = eventVetoCodes?.get(snapshot.code)
  if (eventVetoReason) vetoReasons.push(eventVetoReason)
  if (expert.consensus >= thresholds.minExpertConsensus) passingChecks.push('专家共识达标')
  else watchReasons.push(`专家共识 ${expert.consensus} 低于门槛 ${thresholds.minExpertConsensus}`)
  if (technical.total >= thresholds.minTechnicalScore) passingChecks.push('技术分达标')
  else watchReasons.push(`技术分 ${technical.total} 低于门槛 ${thresholds.minTechnicalScore}`)
  if (quant.total >= thresholds.minQuantScore) passingChecks.push('量化分达标')
  else watchReasons.push(`量化分 ${quant.total} 低于门槛 ${thresholds.minQuantScore}`)

  // P2-A1: 加分项修复 — 移除与三流权重双重计算的项（volumeBreakout/consensus 已在三流评分中体现）
  // 仅保留"三流方向一致"加分（这是跨维度的协同信号，不存在双重计算）
  const sameDirectionBonus = snapshot.return20d > 0 && technical.total > 70 && quant.total > 65 ? 5 : 0
  compositeScore += sameDirectionBonus
  if (sameDirectionBonus > 0) passingChecks.push('三流方向一致加分')
  if (expert.consensus > 0.75) passingChecks.push('专家共识高于 0.75')
  if (snapshot.volumeBreakout > 1.2) passingChecks.push('放量突破')
  if (snapshot.pricePosition20d > 0.8) passingChecks.push('接近20日强势区间上沿')

  const baseCompositeScore = Math.max(0, Math.min(100, compositeScore))
  const finalScore = baseCompositeScore
  let action: StockAnalysisSignal['action'] = 'none'
  if (vetoReasons.length > 0) action = 'watch'
  else if (finalScore >= 80) action = 'strong_buy'
  else if (finalScore >= thresholds.minCompositeScore) action = 'buy'
  else if (finalScore >= 65) action = 'watch'

  // Override 正反馈：当用户历史 override 表现出色时，自动放宽接近门槛的 watch 信号
  // 条件：1) 当前判定为 watch  2) 非一票否决  3) 分数差距 < 5 分  4) override 胜率 > 60% 且样本 >= 3
  if (action === 'watch' && vetoReasons.length === 0 && trades && trades.length > 0) {
    const scoreDelta = thresholds.minCompositeScore - finalScore
    if (scoreDelta > 0 && scoreDelta <= 5) {
      const overrideStats = buildOverrideStats(trades)
      if (overrideStats.totalCount >= 3 && overrideStats.winRate > 0.6) {
        action = 'buy'
        passingChecks.push(`用户判断放宽（override胜率${Math.round(overrideStats.winRate * 100)}%，差${round(scoreDelta)}分）`)
        saLog.info('Service', `信号 ${snapshot.code} 被用户 override 正反馈放宽: finalScore=${round(finalScore)} threshold=${thresholds.minCompositeScore} delta=${round(scoreDelta)} overrideWinRate=${overrideStats.winRate}`)
      }
    }
  }

  // 信号评分决策链路详细日志
  saLog.debug('Service', `信号评分 ${snapshot.code}(${snapshot.name}): expert=${round(expert.score)} technical=${round(technical.total)} quant=${round(quant.total)} weights=[E:${round(effectiveWeights.expert,3)} T:${round(effectiveWeights.technical,3)} Q:${round(effectiveWeights.quant,3)}] bonus=${sameDirectionBonus} base=${round(baseCompositeScore)} final=${round(finalScore)} action=${action} veto=${vetoReasons.length} simulated=${expert.isSimulated ?? false} regime=${regime}`)

  return {
    id: `signal-${snapshot.code}-${todayDate()}`,
    tradeDate: todayDate(),
    code: snapshot.code,
    name: snapshot.name,
    latestPrice: snapshot.latestPrice,
    sector: snapshot.sector,
    snapshot,
    expert,
    technical,
    quant,
    marketState,
    marketRegime: regime,
    fusionWeights: effectiveWeights,
    thresholds,
    compositeScore: round(baseCompositeScore),
    scoreBonus: round(sameDirectionBonus),
    finalScore: round(finalScore),
    action,
    suggestedPosition: calculateKellyPosition(action, learnedWeights, trades),
    suggestedPriceRange: (() => {
      if (history && history.length >= 20) {
        const sr = calculateSupportResistance(history, snapshot.latestPrice)
        return { min: round(sr.support1), max: round(Math.min(snapshot.latestPrice * 1.005, sr.resistance1)) }
      }
      return { min: round(snapshot.latestPrice * 0.995), max: round(snapshot.latestPrice * 1.01) }
    })(),
    supportResistance: history && history.length >= 20 ? calculateSupportResistance(history, snapshot.latestPrice) : null,
    stopLossPrice: round(snapshot.latestPrice * (1 - config.stopLossPercent / 100)),
    takeProfitPrice1: round(snapshot.latestPrice * (1 + config.takeProfitPercent1 / 100)),
    takeProfitPrice2: round(snapshot.latestPrice * (1 + config.takeProfitPercent2 / 100)),
    passingChecks,
    vetoReasons,
    watchReasons,
    reasoning: [
      `市场状态：${marketState.trend} / ${marketState.volatility} / ${marketState.liquidity}（体制：${regime}）`,
      `融合权重：专家 ${fusionWeights.expert} / 技术 ${fusionWeights.technical} / 量化 ${fusionWeights.quant}`,
      `20日收益 ${snapshot.return20d}% ，20日振幅 ${snapshot.amplitude20d}% ，换手率 ${snapshot.turnoverRate}%`,
      ...expert.highlights,
      ...technical.notes,
      ...quant.notes,
    ].slice(0, 8),
    confidence: round(Math.min(1, finalScore / 100), 4),
    createdAt: nowIso(),
    decisionSource: 'system',
    userDecisionNote: null,
  } satisfies StockAnalysisSignal
}

function updatePositionRuntime(position: StockAnalysisPosition, quote: StockAnalysisSpotQuote, config: StockAnalysisStrategyConfig) {
  const returnPercent = safeDivide(quote.latestPrice - position.costPrice, position.costPrice) * 100
  const highestPriceSinceOpen = Math.max(position.highestPriceSinceOpen, quote.high)
  // P2-C1: 使用交易日计算持仓天数（而非自然日），避免长假期间过早触发到期评估
  const tradeDaysSinceOpen = getRecentTradeDates(todayDate(), 60)
  const openDateStr = position.openedAt.slice(0, 10)
  const holdingDays = Math.max(1, tradeDaysSinceOpen.filter((d) => d >= openDateStr).length)
  let action: PositionAction = 'hold'
  let actionReason = '仓位运行正常'
  if (quote.latestPrice <= position.stopLossPrice) {
    action = 'stop_loss'
    actionReason = '已触发硬止损'
  } else if (position.trailingStopEnabled && returnPercent >= config.trailingStop.activationPercent) {
    const pullback = safeDivide(highestPriceSinceOpen - quote.latestPrice, highestPriceSinceOpen) * 100
    if (pullback >= config.trailingStop.pullbackPercent) {
      action = 'stop_loss'
      actionReason = `已触发移动止损（从最高价 ${round(highestPriceSinceOpen)} 回撤 ${round(pullback)}%）`
    }
  }
  if (action === 'hold') {
    if (quote.latestPrice >= position.takeProfitPrice2) {
      action = 'take_profit'
      actionReason = '已触发第二止盈'
    } else if (quote.latestPrice >= position.takeProfitPrice1) {
      action = 'reduce'
      actionReason = '已触发第一止盈，建议减半仓'
    } else if (holdingDays >= config.maxHoldDays) {
      action = 'review'
      actionReason = '持仓天数达到上限，需强制评估'
    }
  }
  // dismiss 保护：如果用户已忽略过当前 action，保持 hold；如果 action 升级了则清除 dismiss 并触发新提醒
  let dismissedAction = position.dismissedAction ?? null
  if (dismissedAction) {
    if (action === dismissedAction) {
      // 同级别提醒已被忽略，保持 hold
      action = 'hold'
      actionReason = `用户已忽略${dismissedAction === 'stop_loss' ? '止损' : dismissedAction === 'take_profit' ? '止盈' : dismissedAction === 'reduce' ? '减仓' : '评估'}提醒`
    } else if (action !== 'hold') {
      // action 变化了（升级或降级），清除 dismiss，触发新提醒
      dismissedAction = null
    }
  }
  return { ...position, currentPrice: quote.latestPrice, highestPriceSinceOpen, returnPercent: round(returnPercent), holdingDays, action, actionReason, dismissedAction }
}

function calculatePerformance(trades: StockAnalysisTradeRecord[]) {
  const sells = trades.filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')
  const wins = sells.filter((trade) => (trade.pnlPercent ?? 0) > 0).length
  const winRate = sells.length === 0 ? 0 : wins / sells.length
  // 累计收益：简单求和（与 weeklyReturn/monthlyReturn 语义一致，避免加权平均在少量交易时反直觉）
  const cumulativeReturn = round(sells.reduce((sum, trade) => sum + (trade.pnlPercent ?? 0), 0))
  return { winRate: round(winRate, 4), cumulativeReturn }
}

function calculateProfitLossRatio(trades: StockAnalysisTradeRecord[]) {
  const sells = trades.filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')
  const wins = sells.map((trade) => trade.pnlPercent ?? 0).filter((value) => value > 0)
  const losses = sells.map((trade) => trade.pnlPercent ?? 0).filter((value) => value < 0).map(Math.abs)
  return round(safeDivide(average(wins), average(losses)), 3)
}

/** 市场级风控评估：极端熊市/极端波动/流动性危机 */
function evaluateMarketLevelRisk(marketState: StockAnalysisMarketState, config: StockAnalysisStrategyConfig): MarketLevelRiskState {
  const extremeBearActive = marketState.trend === 'bear_trend' && marketState.csi500Return20d < -10
  const volatilityPct = marketState.volatilityPercentile ?? 0.5
  const extremeVolatilityActive = volatilityPct > 0.95
  const liquidityCrisisActive = isLiquidityCrisis(marketState, config)
  const lowLiquidityActive = isLowLiquidityGuardrail(marketState, config)

  const newPositionsAllowed = !extremeBearActive && !liquidityCrisisActive
  const buyAllowed = !liquidityCrisisActive
  // 按用户决策解除仓位比例压制：effectiveMaxPositionRatio 直接跟随用户配置的 maxTotalPosition（默认 1.0），
  // 不再由 lowLiquidityGuardrail / extremeVolatility 压低。极端熊市/流动性危机仍通过 newPositionsAllowed / buyAllowed 硬拦截。
  const effectiveMaxPositionRatio = config.maxTotalPosition ?? 1.0

  return {
    extremeBearActive,
    extremeVolatilityActive,
    liquidityCrisisActive,
    lowLiquidityActive,
    effectiveMaxPositionRatio,
    newPositionsAllowed,
    buyAllowed,
    checkedAt: nowIso(),
  }
}

function calculateMaxDrawdownFromTrades(trades: StockAnalysisTradeRecord[]) {
  const sells = trades
    .filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')
    .sort((left, right) => new Date(left.tradeDate).getTime() - new Date(right.tradeDate).getTime())
  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0
  for (const trade of sells) {
    cumulative += trade.pnlPercent ?? 0
    peak = Math.max(peak, cumulative)
    const drawdown = cumulative - peak
    maxDrawdown = Math.min(maxDrawdown, drawdown)
  }
  return round(maxDrawdown)
}

interface AssessPortfolioRiskResult {
  state: StockAnalysisRiskControlState
  newEvents: StockAnalysisRiskEvent[]
}

function assessPortfolioRisk(
  trades: StockAnalysisTradeRecord[],
  limits: StockAnalysisPortfolioRiskLimits,
  existingState: StockAnalysisRiskControlState,
): AssessPortfolioRiskResult {
  // P1-8: 使用交易日窗口而非自然日
  const today = todayDate()
  const recentTradeDays = getRecentTradeDates(today, 25) // 足够覆盖约一个月的交易日
  const oneDayAgoStr = recentTradeDays[1] ?? today // 前1个交易日
  const oneWeekAgoStr = recentTradeDays[5] ?? recentTradeDays[recentTradeDays.length - 1] ?? today // 前5个交易日
  const oneMonthAgoStr = recentTradeDays[22] ?? recentTradeDays[recentTradeDays.length - 1] ?? today // 前22个交易日

  const sells = trades.filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')

  // P1-8: 使用交易日字符串比较（YYYY-MM-DD 格式天然支持字符串序比较）
  const dailyLoss = sells
    .filter((trade) => trade.tradeDate.slice(0, 10) >= oneDayAgoStr)
    .reduce((sum, trade) => sum + Math.min(0, trade.pnlPercent ?? 0), 0)

  const weeklyLoss = sells
    .filter((trade) => trade.tradeDate.slice(0, 10) >= oneWeekAgoStr)
    .reduce((sum, trade) => sum + Math.min(0, trade.pnlPercent ?? 0), 0)

  const monthlyLoss = sells
    .filter((trade) => trade.tradeDate.slice(0, 10) >= oneMonthAgoStr)
    .reduce((sum, trade) => sum + Math.min(0, trade.pnlPercent ?? 0), 0)

  const maxDrawdown = Math.abs(calculateMaxDrawdownFromTrades(trades))

  const dailyLossBreached = Math.abs(dailyLoss) >= limits.maxDailyLossPercent
  const weeklyLossBreached = Math.abs(weeklyLoss) >= limits.maxWeeklyLossPercent
  const monthlyLossBreached = Math.abs(monthlyLoss) >= limits.maxMonthlyLossPercent
  const maxDrawdownBreached = maxDrawdown >= limits.maxDrawdownPercent

  const metrics = {
    dailyLossPercent: round(dailyLoss),
    weeklyLossPercent: round(weeklyLoss),
    monthlyLossPercent: round(monthlyLoss),
    maxDrawdownPercent: round(maxDrawdown),
  }

  const newEvents: StockAnalysisRiskEvent[] = []
  const timestamp = nowIso()

  function emitEvent(eventType: StockAnalysisRiskEventType, reason: string) {
    newEvents.push({
      id: `risk-${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      eventType,
      reason,
      metrics,
    })
  }

  // 检测阈值突破的状态变迁（从 false -> true 才发事件，避免重复）
  if (dailyLossBreached && !existingState.dailyLossBreached) {
    emitEvent('daily_loss_breached', `日内亏损 ${round(Math.abs(dailyLoss))}% 超过阈值 ${limits.maxDailyLossPercent}%`)
  }
  if (weeklyLossBreached && !existingState.weeklyLossBreached) {
    emitEvent('weekly_loss_breached', `周度亏损 ${round(Math.abs(weeklyLoss))}% 超过阈值 ${limits.maxWeeklyLossPercent}%`)
  }
  if (monthlyLossBreached && !existingState.monthlyLossBreached) {
    emitEvent('monthly_loss_breached', `月度亏损 ${round(Math.abs(monthlyLoss))}% 超过阈值 ${limits.maxMonthlyLossPercent}%`)
  }
  if (maxDrawdownBreached && !existingState.maxDrawdownBreached) {
    emitEvent('max_drawdown_breached', `最大回撤 ${round(maxDrawdown)}% 超过阈值 ${limits.maxDrawdownPercent}%`)
  }

  const shouldPause = maxDrawdownBreached || monthlyLossBreached
  let paused = existingState.paused
  let pauseReason = existingState.pauseReason
  let pausedAt = existingState.pausedAt

  if (shouldPause && !existingState.paused) {
    paused = true
    pausedAt = nowIso()
    if (maxDrawdownBreached) {
      pauseReason = `最大回撤 ${round(maxDrawdown)}% 已超过阈值 ${limits.maxDrawdownPercent}%`
    } else {
      pauseReason = `月度亏损 ${round(Math.abs(monthlyLoss))}% 已超过阈值 ${limits.maxMonthlyLossPercent}%`
    }
    emitEvent('pause_triggered', pauseReason)
    logger.warn(`[stock-analysis] 风控触发暂停: ${pauseReason}`)
  }

  // P1-7: 风控暂停自动恢复机制 — 触发条件不再满足时自动解除暂停
  if (existingState.paused && !shouldPause) {
    paused = false
    pauseReason = null
    pausedAt = null
    emitEvent('pause_lifted', '风控条件已恢复正常，自动解除暂停')
    logger.info('[stock-analysis] 风控暂停已自动解除：触发条件不再满足')
  }

  return {
    state: {
      paused,
      pauseReason,
      pausedAt,
      dailyLossPercent: round(dailyLoss),
      weeklyLossPercent: round(weeklyLoss),
      monthlyLossPercent: round(monthlyLoss),
      maxDrawdownPercent: round(maxDrawdown),
      dailyLossBreached,
      weeklyLossBreached,
      monthlyLossBreached,
      maxDrawdownBreached,
      lastCheckedAt: nowIso(),
    },
    newEvents,
  }
}

async function buildReviewRecord(
  stockAnalysisDir: string,
  position: StockAnalysisPosition,
  sellPrice: number,
  sellReason: string,
): Promise<StockAnalysisReviewRecord> {
  let buyExpertScore = 0
  let buyTechnicalScore = 0
  let buyQuantScore = 0
  let buyCompositeScore = 0
  let buyMarketRegime: MarketRegime | null = null

  if (position.sourceSignalId) {
    try {
      const { signal: buySignal } = await findSignalByIdAcrossDates(stockAnalysisDir, position.sourceSignalId)
      if (buySignal) {
        buyExpertScore = buySignal.expert.consensus
        buyTechnicalScore = buySignal.technical.total
        buyQuantScore = buySignal.quant.total
        buyCompositeScore = buySignal.compositeScore
        buyMarketRegime = buySignal.marketRegime
      }
    } catch {
      logger.debug(`[stock-analysis] 未找到买入信号 ${position.sourceSignalId}，复盘记录使用默认值`)
    }
  }

  const pnlPercent = round(safeDivide(sellPrice - position.costPrice, position.costPrice) * 100)
  // P2-C1: 使用交易日计算持仓天数
  const reviewTradeDays = getRecentTradeDates(todayDate(), 60)
  const reviewOpenDateStr = position.openedAt.slice(0, 10)
  const holdingDays = Math.max(1, reviewTradeDays.filter((d) => d >= reviewOpenDateStr).length)

  const lessonsLearned: string[] = []
  if (pnlPercent < -5) lessonsLearned.push('亏损超过5%，需检查入场时机和止损设置')
  if (pnlPercent > 0 && holdingDays <= 2) lessonsLearned.push('短期盈利，确认是否趋势起点或仅是反弹')
  if (holdingDays >= 15) lessonsLearned.push('持仓时间较长，评估是否错过最佳卖出时机')
  if (pnlPercent > 5) lessonsLearned.push('盈利超过5%，确认是否按计划止盈')

  return {
    id: `review-${position.code}-${Date.now()}`,
    tradeDate: nowIso(),
    code: position.code,
    name: position.name,
    action: 'sell',
    buySignalId: position.sourceSignalId,
    buyDate: position.openedAt,
    buyPrice: position.costPrice,
    sellPrice,
    holdingDays,
    pnlPercent,
    buyExpertScore,
    buyTechnicalScore,
    buyQuantScore,
    buyCompositeScore,
    buyMarketRegime,
    sellReason,
    lessonsLearned,
    createdAt: nowIso(),
    dimensionAnalysis: buildDimensionAnalysis(
      position, sellPrice, pnlPercent, holdingDays,
      buyExpertScore, buyTechnicalScore, buyQuantScore,
    ),
  }
}

/** Phase 6: 平仓后回溯各专家预测结果，更新个体表现追踪 */
const MAX_EXPERT_OUTCOMES = 50
const MIN_PREDICTIONS_FOR_WEIGHT = 5
const EXPERT_WEIGHT_MIN = 0.1
const EXPERT_WEIGHT_MAX = 2.0
const EXPERT_WEIGHT_DECAY_HALF_LIFE_DAYS = 60

async function updateExpertPerformance(
  stockAnalysisDir: string,
  position: StockAnalysisPosition,
  pnlPercent: number,
): Promise<void> {
  if (!position.sourceSignalId) return

  // 从 signal ID 提取 tradeDate：signal-{code}-{tradeDate}
  const signalParts = position.sourceSignalId.split('-')
  const signalTradeDate = signalParts.length >= 3 ? signalParts.slice(2).join('-') : null
  if (!signalTradeDate) {
    logger.debug(`[stock-analysis] updateExpertPerformance: 无法从 signalId=${position.sourceSignalId} 提取日期`, { module: 'StockAnalysis' })
    return
  }

  let buySignalVotes: StockAnalysisExpertScore['votes'] = []
  try {
    const signals = await readStockAnalysisSignals(stockAnalysisDir, signalTradeDate)
    const buySignal = signals.find((s) => s.id === position.sourceSignalId)
    if (!buySignal || !buySignal.expert.votes || buySignal.expert.votes.length === 0) {
      logger.debug(`[stock-analysis] updateExpertPerformance: 信号 ${position.sourceSignalId} 无投票数据`, { module: 'StockAnalysis' })
      return
    }
    buySignalVotes = buySignal.expert.votes
  } catch {
    logger.debug(`[stock-analysis] updateExpertPerformance: 读取信号 ${signalTradeDate} 失败`, { module: 'StockAnalysis' })
    return
  }

  const existing = await readStockAnalysisExpertPerformance(stockAnalysisDir)
  const entryMap = new Map(existing.entries.map((e) => [e.expertId, e]))

  for (const vote of buySignalVotes) {
    // 判断预测是否正确：bullish+涨 或 bearish+跌 视为正确，neutral 不参与胜率计算
    const isNeutral = vote.verdict === 'neutral'
    const correct = isNeutral
      ? Math.abs(pnlPercent) < 1 // neutral 预测 + 涨跌幅 <1% 视为正确
      : (vote.verdict === 'bullish' && pnlPercent > 0) || (vote.verdict === 'bearish' && pnlPercent < 0)

    const outcome = {
      tradeDate: signalTradeDate,
      code: position.code,
      verdict: vote.verdict,
      confidence: vote.confidence,
      actualReturnPercent: round(pnlPercent),
      correct,
    }

    const entry = entryMap.get(vote.expertId)
    if (entry) {
      entry.predictionCount += 1
      if (correct) entry.correctCount += 1
      entry.winRate = round(entry.correctCount / entry.predictionCount, 4)
      entry.averageConfidence = round(
        (entry.averageConfidence * (entry.predictionCount - 1) + vote.confidence) / entry.predictionCount,
      )
      entry.calibration = round(Math.abs(entry.averageConfidence / 100 - entry.winRate), 4)
      entry.weight = computeExpertWeight(entry)
      entry.lastPredictionDate = signalTradeDate
      entry.recentOutcomes = [outcome, ...entry.recentOutcomes].slice(0, MAX_EXPERT_OUTCOMES)
    } else {
      const newEntry: StockAnalysisExpertPerformanceEntry = {
        expertId: vote.expertId,
        expertName: vote.expertName,
        layer: vote.layer,
        predictionCount: 1,
        correctCount: correct ? 1 : 0,
        winRate: correct ? 1 : 0,
        averageConfidence: vote.confidence,
        calibration: 0,
        weight: 1,
        lastPredictionDate: signalTradeDate,
        recentOutcomes: [outcome],
      }
      entryMap.set(vote.expertId, newEntry)
    }
  }

  const updatedData: StockAnalysisExpertPerformanceData = {
    updatedAt: nowIso(),
    entries: Array.from(entryMap.values()),
  }

  await saveStockAnalysisExpertPerformance(stockAnalysisDir, updatedData)
  logger.debug(`[stock-analysis] updateExpertPerformance: 更新了 ${buySignalVotes.length} 个专家的表现记录 (pnl=${pnlPercent}%)`, { module: 'StockAnalysis' })
}

/** 计算单个专家的动态权重：基于胜率 + 时间衰减 */
function computeExpertWeight(entry: StockAnalysisExpertPerformanceEntry): number {
  if (entry.predictionCount < MIN_PREDICTIONS_FOR_WEIGHT) return 1 // 样本不足，保持默认权重

  // 基础权重：基于胜率偏离 0.5 的幅度
  // winRate=0.7 → baseWeight=1.4, winRate=0.3 → baseWeight=0.6, winRate=0.5 → baseWeight=1.0
  const baseWeight = 1.0 + (entry.winRate - 0.5) * 2.0

  // 时间衰减：最近预测权重更高
  let decayFactor = 1.0
  if (entry.recentOutcomes.length > 0) {
    const latestDate = new Date(entry.recentOutcomes[0].tradeDate)
    const ageDays = Math.max(0, (Date.now() - latestDate.getTime()) / 86400000)
    decayFactor = Math.pow(2, -ageDays / EXPERT_WEIGHT_DECAY_HALF_LIFE_DAYS)
  }

  // 最终权重 = 基础权重 * 衰减，但保持在 [0.1, 2.0] 范围
  const weight = baseWeight * (0.5 + 0.5 * decayFactor) // 衰减只影响一半幅度
  return round(Math.max(EXPERT_WEIGHT_MIN, Math.min(EXPERT_WEIGHT_MAX, weight)), 4)
}

/** Phase 4.3: 四维复盘分析 — 自动评估专家/技术/量化/执行偏差 */
function buildDimensionAnalysis(
  position: StockAnalysisPosition,
  sellPrice: number,
  pnlPercent: number,
  holdingDays: number,
  buyExpertConsensus: number,
  buyTechnicalScore: number,
  buyQuantScore: number,
): StockAnalysisDimensionAnalysis {
  const priceWentUp = pnlPercent > 0

  // 专家维度：共识方向 vs 实际涨跌
  const expertPredicted = buyExpertConsensus >= 0.6 ? 'bullish' as const : buyExpertConsensus <= 0.4 ? 'bearish' as const : 'neutral' as const
  const expertActual = pnlPercent > 1 ? 'up' as const : pnlPercent < -1 ? 'down' as const : 'flat' as const
  const expertCorrect = (expertPredicted === 'bullish' && expertActual === 'up')
    || (expertPredicted === 'bearish' && expertActual === 'down')
    || (expertPredicted === 'neutral' && expertActual === 'flat')
  const expertNote = expertCorrect
    ? `专家共识 ${buyExpertConsensus.toFixed(2)} 预测正确（实际${expertActual === 'up' ? '上涨' : expertActual === 'down' ? '下跌' : '平盘'}）`
    : `专家共识 ${buyExpertConsensus.toFixed(2)} 预测偏差（预测${expertPredicted === 'bullish' ? '看涨' : expertPredicted === 'bearish' ? '看跌' : '中性'}，实际${expertActual === 'up' ? '上涨' : expertActual === 'down' ? '下跌' : '平盘'}）`

  // 技术维度：买入时技术分 vs 实际是否达到止盈
  const priceHitTarget = sellPrice >= position.takeProfitPrice1
  const technicalNote = buyTechnicalScore >= 60
    ? (priceHitTarget ? '技术分较高且价格达到止盈目标' : `技术分 ${buyTechnicalScore} 较高但未达止盈`)
    : (priceWentUp ? `技术分 ${buyTechnicalScore} 偏低但仍盈利` : `技术分 ${buyTechnicalScore} 偏低，未能支撑上涨`)

  // 量化维度：动量因子是否准确
  const momentumCorrect = (buyQuantScore >= 55 && priceWentUp) || (buyQuantScore < 45 && !priceWentUp)
  const quantNote = momentumCorrect
    ? `量化分 ${buyQuantScore} 与实际走势一致`
    : `量化分 ${buyQuantScore} 与实际走势不一致（${priceWentUp ? '上涨' : '下跌'}）`

  // 执行维度：滑点和持仓效率
  const slippage = round(Math.abs(sellPrice - position.currentPrice) / position.currentPrice * 100)
  // 持仓效率 = 实际盈亏 / 最大可能盈亏（基于止盈目标）
  const maxPossiblePnl = (position.takeProfitPrice1 - position.costPrice) / position.costPrice * 100
  const holdingEfficiency = maxPossiblePnl > 0 ? round(Math.min(1, Math.max(0, pnlPercent / maxPossiblePnl)), 2) : 0
  const followedPlan = (pnlPercent < 0 && sellPrice <= position.stopLossPrice * 1.02)
    || (pnlPercent > 0 && sellPrice >= position.takeProfitPrice1 * 0.98)
    || holdingDays <= position.holdingDays
  const executionNote = followedPlan
    ? `执行符合计划（滑点 ${slippage.toFixed(2)}%，效率 ${(holdingEfficiency * 100).toFixed(0)}%）`
    : `执行偏离计划（滑点 ${slippage.toFixed(2)}%，效率 ${(holdingEfficiency * 100).toFixed(0)}%，需复查卖出时机）`

  return {
    expert: { predicted: expertPredicted, actual: expertActual, correct: expertCorrect, note: expertNote },
    technical: { buyScore: buyTechnicalScore, sellScore: 0, priceHitTarget, note: technicalNote },
    quant: { buyScore: buyQuantScore, momentumCorrect, note: quantNote },
    execution: { slippage, holdingEfficiency, followedPlan, note: executionNote },
  }
}

/** Phase 4.1: 基于历史复盘记录计算学习权重 */
const WEIGHT_DECAY_HALF_LIFE_DAYS = 30
const MAX_WEIGHT_ADJUSTMENT = 0.2
const MIN_REVIEWS_FOR_LEARNING = 5
const MAX_WEIGHT_HISTORY = 50

async function computeLearnedWeights(stockAnalysisDir: string): Promise<StockAnalysisLearnedWeights | null> {
  const reviews = await readStockAnalysisReviews(stockAnalysisDir)
  const reviewsWithAnalysis = reviews.filter((r) => r.dimensionAnalysis)

  if (reviewsWithAnalysis.length < MIN_REVIEWS_FOR_LEARNING) {
    logger.debug(`[stock-analysis] 复盘记录不足 ${MIN_REVIEWS_FOR_LEARNING} 条（当前 ${reviewsWithAnalysis.length}），跳过学习权重计算`)
    return null
  }

  const now = Date.now()
  let expertCorrectWeighted = 0
  let technicalCorrectWeighted = 0
  let quantCorrectWeighted = 0
  let totalWeight = 0

  for (const review of reviewsWithAnalysis) {
    const analysis = review.dimensionAnalysis!
    const ageMs = now - new Date(review.createdAt).getTime()
    const ageDays = ageMs / 86400000
    // 指数衰减: weight = 2^(-ageDays / halfLife)
    const decayWeight = Math.pow(2, -ageDays / WEIGHT_DECAY_HALF_LIFE_DAYS)

    expertCorrectWeighted += (analysis.expert.correct ? 1 : 0) * decayWeight
    technicalCorrectWeighted += (analysis.technical.priceHitTarget ? 1 : 0) * decayWeight
    quantCorrectWeighted += (analysis.quant.momentumCorrect ? 1 : 0) * decayWeight
    totalWeight += decayWeight
  }

  if (totalWeight <= 0) return null

  const expertAccuracy = round(expertCorrectWeighted / totalWeight, 4)
  const technicalAccuracy = round(technicalCorrectWeighted / totalWeight, 4)
  const quantAccuracy = round(quantCorrectWeighted / totalWeight, 4)

  // 归一化准确性 → 调整系数（均值居中，最大偏移 ±MAX_WEIGHT_ADJUSTMENT）
  const avgAccuracy = (expertAccuracy + technicalAccuracy + quantAccuracy) / 3
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const expertAdj = round(clamp(expertAccuracy - avgAccuracy, -MAX_WEIGHT_ADJUSTMENT, MAX_WEIGHT_ADJUSTMENT), 4)
  const technicalAdj = round(clamp(technicalAccuracy - avgAccuracy, -MAX_WEIGHT_ADJUSTMENT, MAX_WEIGHT_ADJUSTMENT), 4)
  const quantAdj = round(clamp(quantAccuracy - avgAccuracy, -MAX_WEIGHT_ADJUSTMENT, MAX_WEIGHT_ADJUSTMENT), 4)

  // 确保调整系数之和为 0（零和偏移）
  const adjSum = expertAdj + technicalAdj + quantAdj
  const expertAdjFinal = round(expertAdj - adjSum / 3, 4)
  const technicalAdjFinal = round(technicalAdj - adjSum / 3, 4)
  const quantAdjFinal = round(quantAdj - adjSum / 3, 4)

  const wins = reviewsWithAnalysis.filter((r) => r.pnlPercent > 0).length
  const winRate = round(wins / reviewsWithAnalysis.length, 4)

  const entry: StockAnalysisWeightUpdateEntry = {
    timestamp: nowIso(),
    sampleCount: reviewsWithAnalysis.length,
    winRate,
    dimensionAccuracy: { expert: expertAccuracy, technical: technicalAccuracy, quant: quantAccuracy },
    adjustmentFactors: { expert: expertAdjFinal, technical: technicalAdjFinal, quant: quantAdjFinal },
  }

  const existing = await readStockAnalysisLearnedWeights(stockAnalysisDir)
  const history = existing?.history ?? []
  history.unshift(entry)

  const result: StockAnalysisLearnedWeights = {
    updatedAt: nowIso(),
    sampleCount: reviewsWithAnalysis.length,
    dimensionAccuracy: entry.dimensionAccuracy,
    adjustmentFactors: entry.adjustmentFactors,
    history: history.slice(0, MAX_WEIGHT_HISTORY),
  }

  await saveStockAnalysisLearnedWeights(stockAnalysisDir, result)
  logger.info(`[stock-analysis] 学习权重已更新: 样本 ${reviewsWithAnalysis.length}, 准确性 expert=${expertAccuracy} tech=${technicalAccuracy} quant=${quantAccuracy}, 调整 expert=${expertAdjFinal} tech=${technicalAdjFinal} quant=${quantAdjFinal}`)
  return result
}

/** Phase 4.1: 获取融合权重（体制基准 + 学习调整） */
function getAdjustedFusionWeights(
  baseWeights: StockAnalysisFusionWeights,
  learnedWeights: StockAnalysisLearnedWeights | null,
): StockAnalysisFusionWeights {
  if (!learnedWeights || !learnedWeights.adjustmentFactors || learnedWeights.sampleCount < MIN_REVIEWS_FOR_LEARNING) return baseWeights
  const adj = learnedWeights.adjustmentFactors
  const rawExpert = baseWeights.expert + adj.expert
  const rawTechnical = baseWeights.technical + adj.technical
  const rawQuant = baseWeights.quant + adj.quant
  // 归一化确保总和为 1
  const total = rawExpert + rawTechnical + rawQuant
  if (total <= 0) return baseWeights
  return {
    expert: round(rawExpert / total, 4),
    technical: round(rawTechnical / total, 4),
    quant: round(rawQuant / total, 4),
  }
}

/** Phase 4.2: 基于胜率自动调整 Conviction Filter 阈值 */
const CONVICTION_SAMPLE_SIZE = 20
const CONVICTION_BOOST = -2
const CONVICTION_TIGHTEN = 3
const MIN_COMPOSITE_SCORE_FLOOR = 60
const MAX_COMPOSITE_SCORE_CEIL = 85

async function adjustConvictionThresholds(stockAnalysisDir: string, config: StockAnalysisStrategyConfig, marketState: StockAnalysisMarketState): Promise<StockAnalysisThresholdAdjustment | null> {
  const trades = await readStockAnalysisTrades(stockAnalysisDir)
  const recentTrades = trades.filter((t) => t.action === 'sell' && t.pnlPercent != null).slice(0, CONVICTION_SAMPLE_SIZE)

  if (recentTrades.length < 10) {
    logger.debug(`[stock-analysis] 交易记录不足 10 条（当前 ${recentTrades.length}），跳过阈值调整`)
    return null
  }

  const wins = recentTrades.filter((t) => (t.pnlPercent ?? 0) > 0).length
  const winRate = round(wins / recentTrades.length, 4)
  const regime = getMarketRegime(marketState)
  const currentThresholds = config.marketThresholds[regime]
  const prevScore = currentThresholds.minCompositeScore

  let adjustment = 0
  let reason = ''
  if (winRate > 0.6) {
    adjustment = CONVICTION_BOOST
    reason = `胜率 ${(winRate * 100).toFixed(0)}% > 60%，适度放宽门槛以捕捉更多机会`
  } else if (winRate < 0.4) {
    adjustment = CONVICTION_TIGHTEN
    reason = `胜率 ${(winRate * 100).toFixed(0)}% < 40%，收紧门槛以提高选股质量`
  } else {
    logger.debug(`[stock-analysis] 胜率 ${(winRate * 100).toFixed(0)}% 在正常区间，不调整阈值`)
    return null
  }

  const newScore = Math.max(MIN_COMPOSITE_SCORE_FLOOR, Math.min(MAX_COMPOSITE_SCORE_CEIL, prevScore + adjustment))
  if (newScore === prevScore) {
    logger.debug(`[stock-analysis] 阈值已到边界 ${prevScore}，无法继续调整`)
    return null
  }

  // 应用调整（修改内存中的 config 并持久化）
  config.marketThresholds[regime] = { ...currentThresholds, minCompositeScore: newScore }
  await saveStockAnalysisConfig(stockAnalysisDir, config)

  const entry: StockAnalysisThresholdAdjustment = {
    timestamp: nowIso(),
    recentWinRate: winRate,
    sampleCount: recentTrades.length,
    previousMinCompositeScore: prevScore,
    newMinCompositeScore: newScore,
    adjustment,
    regime,
    reason,
  }

  const history = await readStockAnalysisThresholdHistory(stockAnalysisDir)
  history.adjustments.unshift(entry)
  history.updatedAt = nowIso()
  await saveStockAnalysisThresholdHistory(stockAnalysisDir, history)

  logger.info(`[stock-analysis] Conviction 阈值调整: ${regime} minCompositeScore ${prevScore} -> ${newScore} (胜率 ${(winRate * 100).toFixed(0)}%, ${reason})`)
  return entry
}

const SCORE_DROP_THRESHOLD = 15
const SWAP_SCORE_ADVANTAGE = 10

async function evaluatePositionScores(
  position: StockAnalysisPosition,
  snapshot: StockAnalysisStockSnapshot,
  marketState: StockAnalysisMarketState,
  config: StockAnalysisStrategyConfig,
  buyCompositeScore: number,
  buyFinalScore = buyCompositeScore,
  aiConfig?: StockAnalysisAIConfig | null,
  expertWeights?: Map<string, number>,
  profileMap?: Map<string, ExpertProfile>,
  factPoolSummary?: FactPoolSummary,
  memoryStore?: ExpertMemoryStore,
  learnedWeights?: StockAnalysisLearnedWeights | null,
): Promise<StockAnalysisPositionEvaluation> {
  // 判断是否有可用的 AI 配置
  const hasAI = aiConfig
    && aiConfig.providers.some((p) => p.enabled && p.apiKey)
    && aiConfig.experts.some((e) => e.enabled && e.layer !== 'rule_functions' && e.assignedModel)

  let expert: StockAnalysisExpertScore
  if (hasAI) {
    try {
      const llmResult = await runExpertVoting(snapshot, marketState, aiConfig, expertWeights, profileMap, factPoolSummary, memoryStore)
      expert = {
        bullishCount: llmResult.bullishCount,
        bearishCount: llmResult.bearishCount,
        neutralCount: llmResult.neutralCount,
        consensus: llmResult.consensus,
        score: llmResult.score,
        highlights: llmResult.highlights,
        risks: llmResult.risks,
        votes: llmResult.votes,
        llmSuccessCount: llmResult.llmSuccessCount,
        llmFallbackCount: llmResult.llmFallbackCount,
        ruleFallbackCount: llmResult.ruleFallbackCount,
        fallbackCount: llmResult.fallbackCount,
        isSimulated: llmResult.isSimulated,
      }
      logger.info(`[stock-analysis] 持仓评估 ${position.code} 专家投票完成: LLM主成功=${llmResult.llmSuccessCount - llmResult.llmFallbackCount}, LLM-fallback=${llmResult.llmFallbackCount}, 规则降级=${llmResult.ruleFallbackCount}`, { module: 'StockAnalysis' })
    } catch (error) {
      logger.error(`[stock-analysis] 持仓评估 ${position.code} LLM 投票异常，降级为公式模拟: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      expert = buildExpertScoreFallback(snapshot, marketState)
    }
  } else {
    expert = buildExpertScoreFallback(snapshot, marketState)
  }
  const technical = buildTechnicalScore(snapshot)
  const quant = buildQuantScore(snapshot, marketState)
  // P1-4: 使用与 buildSignal 一致的调整后权重，确保 scoreDelta 比较公平
  const baseWeights = getFusionWeights(config, marketState)
  const fusionWeights = learnedWeights
    ? getAdjustedFusionWeights(baseWeights, learnedWeights)
    : baseWeights
  const currentCompositeScore = round(
    fusionWeights.expert * expert.score + fusionWeights.technical * technical.total + fusionWeights.quant * quant.total,
  )
  const currentScoreBonus = snapshot.return20d > 0 && technical.total > 70 && quant.total > 65 ? 5 : 0
  const currentFinalScore = round(Math.max(0, Math.min(100, currentCompositeScore + currentScoreBonus)))
  const scoreDelta = round(currentCompositeScore - buyCompositeScore)

  const expertConsensus = expert.consensus
  const technicalBreakdown = snapshot.latestPrice < snapshot.movingAverage20
    && snapshot.latestPrice < snapshot.movingAverage60
    && technical.total < 40

  let sellRecommended = false
  let sellReason: StockAnalysisPositionEvaluation['sellReason'] = null
  let sellReasonText = '持仓评估正常'
  const reasoning: string[] = []

  reasoning.push(`当前基础分 ${currentCompositeScore}，买入基础分 ${buyCompositeScore}，变化 ${scoreDelta > 0 ? '+' : ''}${scoreDelta}`)
  reasoning.push(`当前最终分 ${currentFinalScore}（含协同加分 ${currentScoreBonus}），买入最终分 ${buyFinalScore}`)
  reasoning.push(`专家共识 ${round(expertConsensus, 4)}，技术分 ${technical.total}，量化分 ${quant.total}`)

  if (scoreDelta <= -SCORE_DROP_THRESHOLD) {
    sellRecommended = true
    sellReason = 'score_drop'
    sellReasonText = `综合评分下降 ${Math.abs(scoreDelta)} 分（阈值 ${SCORE_DROP_THRESHOLD}），建议卖出`
    reasoning.push(`基础分大幅下降：${buyCompositeScore} -> ${currentCompositeScore}`)
  }

  if (expertConsensus < 0.4 && technicalBreakdown) {
    sellRecommended = true
    sellReason = 'expert_bearish'
    sellReasonText = `专家共识转空（${round(expertConsensus, 4)}）且技术破位（技术分 ${technical.total}），建议卖出`
    reasoning.push(`专家共识 ${round(expertConsensus, 4)} < 0.4，且价格跌破 MA20+MA60`)
  }

  return {
    positionId: position.id,
    code: position.code,
    name: position.name,
    currentExpertScore: expert.score,
    currentTechnicalScore: technical.total,
    currentQuantScore: quant.total,
    currentCompositeScore,
    currentFinalScore,
    buyCompositeScore,
    buyFinalScore,
    scoreDelta,
    expertConsensus,
    technicalBreakdown,
    sellRecommended,
    sellReason,
    sellReasonText,
    reasoning,
  }
}

function buildSwapSuggestions(
  evaluations: StockAnalysisPositionEvaluation[],
  signals: StockAnalysisSignal[],
  maxPositions: number,
  currentPositionCount: number,
): StockAnalysisSwapSuggestion[] {
  if (currentPositionCount < maxPositions) {
    return []
  }

  const buySignals = signals.filter((signal) => signal.action === 'strong_buy' || signal.action === 'buy')
  if (buySignals.length === 0) {
    return []
  }

  const weakestEval = evaluations
    .slice()
    .sort((left, right) => left.currentCompositeScore - right.currentCompositeScore)[0]
  if (!weakestEval) {
    return []
  }

  const suggestions: StockAnalysisSwapSuggestion[] = []
  for (const signal of buySignals) {
    if (signal.finalScore > weakestEval.currentCompositeScore + SWAP_SCORE_ADVANTAGE) {
      suggestions.push({
        sellPositionId: weakestEval.positionId,
        sellCode: weakestEval.code,
        sellName: weakestEval.name,
        sellCurrentScore: weakestEval.currentCompositeScore,
        buySignalId: signal.id,
        buyCode: signal.code,
        buyName: signal.name,
        buyFinalScore: signal.finalScore,
        scoreDifference: round(signal.finalScore - weakestEval.currentCompositeScore),
        reasoning: `新标的 ${signal.name}(${signal.finalScore}分) 比最弱持仓 ${weakestEval.name}(${weakestEval.currentCompositeScore}分) 高出 ${round(signal.finalScore - weakestEval.currentCompositeScore)} 分，超过换仓阈值 ${SWAP_SCORE_ADVANTAGE}`,
      })
    }
  }

  return suggestions.sort((left, right) => right.scoreDifference - left.scoreDifference).slice(0, 3)
}

async function evaluateWatchLogOutcomes(stockAnalysisDir: string, watchLogs: StockAnalysisWatchLogEntry[]): Promise<StockAnalysisWatchLogEntry[]> {
  if (watchLogs.length === 0) {
    return watchLogs
  }

  const codeSet = new Set(watchLogs.filter((item) => item.topCandidateCode).map((item) => item.topCandidateCode as string))
  const histories = await Promise.all([...codeSet].map(async (code) => {
    try {
      const envelope = await getStockHistoryData(stockAnalysisDir, code)
      return { code, data: envelope.data }
    } catch {
      return { code, data: [] as StockAnalysisKlinePoint[] }
    }
  }))
  const historyMap = new Map(histories.map((item) => [item.code, item.data]))

  return watchLogs.map((item) => {
    if (!item.topCandidateCode) {
      return {
        ...item,
        tPlus1Return: null,
        tPlus5Return: null,
        outcome: (item.outcome ?? 'pending') as StockAnalysisWatchLogEntry['outcome'],
        evaluatedAt: item.evaluatedAt ?? null,
      }
    }

    const history = historyMap.get(item.topCandidateCode)
    if (!history || history.length === 0) {
      return { ...item, tPlus1Return: null, tPlus5Return: null, outcome: 'pending' as const, evaluatedAt: null }
    }

    const baseIndex = history.findIndex((point) => point.date >= item.tradeDate)
    if (baseIndex < 0) {
      return { ...item, tPlus1Return: null, tPlus5Return: null, outcome: 'pending' as const, evaluatedAt: null }
    }

    const baseClose = history[baseIndex]?.close ?? 0
    const t1Close = history[baseIndex + 1]?.close
    const t5Close = history[baseIndex + 5]?.close
    const tPlus1Return = typeof t1Close === 'number' && baseClose > 0 ? round(safeDivide(t1Close - baseClose, baseClose) * 100) : null
    const tPlus5Return = typeof t5Close === 'number' && baseClose > 0 ? round(safeDivide(t5Close - baseClose, baseClose) * 100) : null
    // [P2-16] tPlus5Return === 0 视为中性（未涨未跌），不算 correct
    // correct = 股价下跌（观望避免了亏损），wrong = 股价上涨（错过了收益）
    const outcome: StockAnalysisWatchLogEntry['outcome'] = typeof tPlus5Return === 'number'
      ? (tPlus5Return < 0 ? 'correct' : tPlus5Return > 0 ? 'wrong' : 'pending')
      : 'pending'

    return {
      ...item,
      tPlus1Return,
      tPlus5Return,
      outcome,
      evaluatedAt: outcome === 'pending' ? null : nowIso(),
    }
  })
}

function buildWeeklySummary(trades: StockAnalysisTradeRecord[], watchLogs: StockAnalysisWatchLogEntry[]) {
  const weekMap = new Map<string, StockAnalysisWeeklySummary>()
  for (const trade of trades) {
    const weekLabel = getWeekLabel(new Date(trade.tradeDate))
    const current = weekMap.get(weekLabel) ?? { weekLabel, tradeCount: 0, watchDays: 0, winRate: 0, averageProfitLossRatio: 0, weeklyReturn: 0, cumulativeReturn: 0, maxDrawdown: 0 }
    current.tradeCount += 1
    if (typeof trade.pnlPercent === 'number') current.weeklyReturn = round(current.weeklyReturn + trade.pnlPercent)
    weekMap.set(weekLabel, current)
  }

  const weekTrades = new Map<string, StockAnalysisTradeRecord[]>()
  for (const trade of trades) {
    const weekLabel = getWeekLabel(new Date(trade.tradeDate))
    const list = weekTrades.get(weekLabel) ?? []
    list.push(trade)
    weekTrades.set(weekLabel, list)
  }

  for (const watchLog of watchLogs) {
    const weekLabel = getWeekLabel(new Date(watchLog.tradeDate))
    const current = weekMap.get(weekLabel) ?? { weekLabel, tradeCount: 0, watchDays: 0, winRate: 0, averageProfitLossRatio: 0, weeklyReturn: 0, cumulativeReturn: 0, maxDrawdown: 0 }
    current.watchDays += 1
    weekMap.set(weekLabel, current)
  }

  for (const [weekLabel, summary] of weekMap) {
    const tradesInWeek = weekTrades.get(weekLabel) ?? []
    summary.averageProfitLossRatio = calculateProfitLossRatio(tradesInWeek)
    summary.maxDrawdown = calculateMaxDrawdownFromTrades(tradesInWeek)
    // B1: 补充周度胜率计算
    const sellsInWeek = tradesInWeek.filter((t) => t.action === 'sell' && typeof t.pnlPercent === 'number')
    const winsInWeek = sellsInWeek.filter((t) => (t.pnlPercent ?? 0) > 0).length
    summary.winRate = sellsInWeek.length > 0 ? round(winsInWeek / sellsInWeek.length, 4) : 0
  }

  // B2: 按时间正序累加 cumulativeReturn（简单求和）
  const sorted = [...weekMap.values()].sort((left, right) => left.weekLabel.localeCompare(right.weekLabel))
  let cumulative = 0
  for (const week of sorted) {
    cumulative = round(cumulative + week.weeklyReturn)
    week.cumulativeReturn = cumulative
  }

  return sorted.sort((left, right) => right.weekLabel.localeCompare(left.weekLabel)).slice(0, 8)
}

function buildMonthlySummary(trades: StockAnalysisTradeRecord[], watchLogs: StockAnalysisWatchLogEntry[]): StockAnalysisMonthlySummary[] {
  const monthMap = new Map<string, StockAnalysisMonthlySummary>()
  for (const trade of trades) {
    const monthLabel = getMonthLabel(new Date(trade.tradeDate))
    const current = monthMap.get(monthLabel) ?? {
      monthLabel,
      tradeCount: 0,
      watchDays: 0,
      winRate: 0,
      monthlyReturn: 0,
      cumulativeReturn: 0,
      maxDrawdown: 0,
    }
    current.tradeCount += 1
    if (typeof trade.pnlPercent === 'number') {
      current.monthlyReturn = round(current.monthlyReturn + trade.pnlPercent)
      current.cumulativeReturn = round(current.cumulativeReturn + trade.pnlPercent)
    }
    monthMap.set(monthLabel, current)
  }
  for (const watch of watchLogs) {
    const monthLabel = getMonthLabel(new Date(watch.tradeDate))
    const current = monthMap.get(monthLabel) ?? {
      monthLabel,
      tradeCount: 0,
      watchDays: 0,
      winRate: 0,
      monthlyReturn: 0,
      cumulativeReturn: 0,
      maxDrawdown: 0,
    }
    current.watchDays += 1
    monthMap.set(monthLabel, current)
  }

  // B4+B5: 按月计算 winRate 和 maxDrawdown
  const monthTrades = new Map<string, StockAnalysisTradeRecord[]>()
  for (const trade of trades) {
    const monthLabel = getMonthLabel(new Date(trade.tradeDate))
    const list = monthTrades.get(monthLabel) ?? []
    list.push(trade)
    monthTrades.set(monthLabel, list)
  }
  for (const [monthLabel, summary] of monthMap) {
    const tradesInMonth = monthTrades.get(monthLabel) ?? []
    const sellsInMonth = tradesInMonth.filter((t) => t.action === 'sell' && typeof t.pnlPercent === 'number')
    const winsInMonth = sellsInMonth.filter((t) => (t.pnlPercent ?? 0) > 0).length
    summary.winRate = sellsInMonth.length > 0 ? round(winsInMonth / sellsInMonth.length, 4) : 0
    summary.maxDrawdown = calculateMaxDrawdownFromTrades(tradesInMonth)
  }

  const sorted = [...monthMap.values()].sort((left, right) => right.monthLabel.localeCompare(left.monthLabel))
  let cumulative = 0
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    cumulative = round(cumulative + sorted[index].monthlyReturn)
    sorted[index].cumulativeReturn = cumulative
  }

  return sorted.slice(0, 6)
}

function buildOverrideStats(trades: StockAnalysisTradeRecord[]): StockAnalysisOverrideStats {
  const closedTrades = trades.filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number')
  // 找到所有 override 平仓：卖出记录对应的买入记录是 user_override
  // 由于 sell 记录本身没有 sourceDecision，需要通过 relatedPositionId 关联 buy 记录
  const buyTradesByPosition = new Map<string, StockAnalysisTradeRecord>()
  for (const trade of trades) {
    if (trade.action === 'buy' && trade.relatedPositionId) {
      buyTradesByPosition.set(trade.relatedPositionId, trade)
    }
  }

  const overrideSells: StockAnalysisTradeRecord[] = []
  const systemSells: StockAnalysisTradeRecord[] = []
  for (const sell of closedTrades) {
    const buyTrade = sell.relatedPositionId ? buyTradesByPosition.get(sell.relatedPositionId) : null
    if (buyTrade?.sourceDecision === 'user_override') {
      overrideSells.push(sell)
    } else if (buyTrade?.sourceDecision === 'user_confirmed') {
      systemSells.push(sell)
    }
  }

  const overrideReturns = overrideSells.map((trade) => trade.pnlPercent ?? 0)
  const systemReturns = systemSells.map((trade) => trade.pnlPercent ?? 0)

  return {
    totalCount: overrideSells.length,
    winCount: overrideReturns.filter((ret) => ret > 0).length,
    winRate: round(safeDivide(overrideReturns.filter((ret) => ret > 0).length, overrideSells.length), 4),
    averageReturn: round(average(overrideReturns), 2),
    systemWinRate: round(safeDivide(systemReturns.filter((ret) => ret > 0).length, systemSells.length), 4),
    systemAverageReturn: round(average(systemReturns), 2),
  }
}

function buildPerformanceDashboard(signals: StockAnalysisSignal[], watchLogs: StockAnalysisWatchLogEntry[], trades: StockAnalysisTradeRecord[], modelGroups: StockAnalysisModelGroupPerformance[], marketState: StockAnalysisMarketState): StockAnalysisPerformanceDashboard {
  const passCount = signals.filter((signal) => signal.action === 'buy' || signal.action === 'strong_buy').length
  const convictionPassRate = round(safeDivide(passCount, signals.length), 4)
  const evaluatedWatchLogs = watchLogs.filter((item) => item.outcome !== 'pending')
  const watchCorrectCount = evaluatedWatchLogs.filter((item) => item.outcome === 'correct').length
  const watchAccuracy = round(safeDivide(watchCorrectCount, evaluatedWatchLogs.length), 4)
  const sharpeLike = (() => {
    const returns = trades.filter((trade) => trade.action === 'sell' && typeof trade.pnlPercent === 'number').map((trade) => trade.pnlPercent ?? 0)
    if (returns.length <= 1) return 0
    const avg = average(returns)
    const variance = average(returns.map((value) => (value - avg) ** 2))
    return variance === 0 ? 0 : round(avg / Math.sqrt(variance), 3)
  })()
  const sortedGroups = [...modelGroups].sort((left, right) => right.winRate - left.winRate)
  const bestModelGroup = sortedGroups[0]?.group ?? null
  const worstModelGroup = sortedGroups.at(-1)?.group ?? null
  const alerts: string[] = []
  const tuningSuggestions: string[] = []

  if (convictionPassRate < 0.1) {
    alerts.push('Conviction Filter 通过率偏低，近期策略过于保守')
    tuningSuggestions.push('可考虑将综合门槛下调 1-2 分并继续观察一周')
  }
  if (convictionPassRate > 0.3) {
    alerts.push('Conviction Filter 通过率偏高，需警惕信号质量下滑')
    tuningSuggestions.push('建议上调综合门槛 2-3 分，避免过度交易')
  }
  if (watchAccuracy > 0 && watchAccuracy < 0.6) {
    alerts.push('观望准确率偏低，需复核观望判定逻辑')
    tuningSuggestions.push('优先复核专家共识与技术分的最低门槛设置')
  }
  if (worstModelGroup) {
    const group = modelGroups.find((item) => item.group === worstModelGroup)
    if (group && group.winRate < 0.45) {
      alerts.push(`${worstModelGroup} 组近期表现较弱`)
      tuningSuggestions.push(`建议将 ${worstModelGroup} 组权重从 ${group.weight.toFixed(2)} 下调至 ${Math.max(0.5, group.weight - 0.2).toFixed(2)}`)
    }
  }
  if (marketState.trend === 'bear_trend') {
    tuningSuggestions.push('当前熊市趋势，建议提高综合分与专家共识门槛')
  }

  const overrideStats = buildOverrideStats(trades)
  if (overrideStats.totalCount >= 3 && overrideStats.winRate > 0.6) {
    alerts.push(`用户主观判断胜率 ${Math.round(overrideStats.winRate * 100)}%（${overrideStats.winCount}/${overrideStats.totalCount}），表现优于系统`)
    tuningSuggestions.push('用户 override 历史表现出色，已自动纳入信号放宽逻辑')
  }

  return {
    convictionPassRate,
    watchAccuracy,
    sharpeLike,
    bestModelGroup,
    worstModelGroup,
    overrideStats,
    alerts: dedupeStrings(alerts),
    tuningSuggestions: dedupeStrings(tuningSuggestions),
  }
}

// ==================== S2+S3: 自动周报/月报生成 ====================

/**
 * 生成周度报告：复用 buildWeeklySummary + buildPerformanceDashboard，
 * 输出结构化 AutoReportNotification 并持久化
 */
export async function generateWeeklyReport(stockAnalysisDir: string): Promise<AutoReportNotification> {
  const [trades, watchLogs, signals, modelGroups, expertPerformance, config] = await Promise.all([
    readStockAnalysisTrades(stockAnalysisDir),
    readStockAnalysisWatchLogs(stockAnalysisDir),
    (async () => {
      const snapshot = await readLatestSnapshot(stockAnalysisDir)
      return snapshot?.signals ?? []
    })(),
    readStockAnalysisModelGroups(stockAnalysisDir),
    readStockAnalysisExpertPerformance(stockAnalysisDir),
    readStockAnalysisConfig(stockAnalysisDir),
  ])

  const weeklySummary = buildWeeklySummary(trades, watchLogs)
  await saveStockAnalysisWeeklySummary(stockAnalysisDir, weeklySummary)

  const modelGroupPerformance = modelGroups.length > 0
    ? modelGroups
    : await buildModelGroupPerformance(stockAnalysisDir, expertPerformance)
  const fallbackDate = todayDate()
  const marketState = (await readStockAnalysisMarketState(stockAnalysisDir, fallbackDate)) ?? buildFallbackMarketState(fallbackDate)
  const dashboard = buildPerformanceDashboard(signals, watchLogs, trades, modelGroupPerformance, marketState)
  await saveStockAnalysisPerformanceDashboard(stockAnalysisDir, dashboard)

  const latestWeek = weeklySummary[0]
  const now = nowIso()
  const weekLabel = latestWeek?.weekLabel ?? getWeekLabel(new Date())
  const performance = calculatePerformance(trades)

  // 构建叙述性摘要
  const summaryParts: string[] = []
  summaryParts.push(`本周(${weekLabel})交易 ${latestWeek?.tradeCount ?? 0} 笔，观望 ${latestWeek?.watchDays ?? 0} 天`)
  summaryParts.push(`周收益 ${latestWeek?.weeklyReturn?.toFixed(2) ?? '0.00'}%，累计收益 ${performance.cumulativeReturn.toFixed(2)}%`)
  summaryParts.push(`总胜率 ${(performance.winRate * 100).toFixed(1)}%，夏普比 ${dashboard.sharpeLike.toFixed(2)}`)
  if (dashboard.bestModelGroup) summaryParts.push(`最佳模型组: ${dashboard.bestModelGroup}`)
  if (dashboard.alerts.length > 0) summaryParts.push(`预警: ${dashboard.alerts.join('; ')}`)
  if (dashboard.tuningSuggestions.length > 0) summaryParts.push(`建议: ${dashboard.tuningSuggestions.join('; ')}`)

  const notification: AutoReportNotification = {
    id: `weekly-${weekLabel}-${Date.now()}`,
    type: 'weekly_report',
    generatedAt: now,
    periodLabel: weekLabel,
    title: `周度报告 ${weekLabel}`,
    summary: summaryParts.join('。'),
    acknowledged: false,
  }

  const existing = await readAutoReportNotifications(stockAnalysisDir)
  existing.unshift(notification)
  await saveAutoReportNotifications(stockAnalysisDir, existing)

  logger.info(`[stock-analysis] 周度报告已生成: ${weekLabel}`)
  return notification
}

/**
 * 基于规则引擎生成参数调优建议 — 对应 v2.0 设计文档第 6.3 节规则
 */
function generateTuningSuggestions(
  trades: StockAnalysisTradeRecord[],
  watchLogs: StockAnalysisWatchLogEntry[],
  modelGroups: StockAnalysisModelGroupPerformance[],
  config: StockAnalysisStrategyConfig,
  dashboard: StockAnalysisPerformanceDashboard,
): TuningSuggestion[] {
  const suggestions: TuningSuggestion[] = []
  const performance = calculatePerformance(trades)

  // 规则1: 胜率 < 45% → 提高 Conviction Filter 阈值 (+3-5 分)
  if (performance.winRate < 0.45 && trades.length >= 5) {
    const currentThreshold = config.marketThresholds.normal_range.minCompositeScore
    suggestions.push({
      parameter: 'minCompositeScore (normal_range)',
      currentValue: currentThreshold,
      suggestedValue: currentThreshold + 3,
      reason: `胜率 ${(performance.winRate * 100).toFixed(1)}% 低于 45% 目标，建议提高综合门槛`,
      confidence: performance.winRate < 0.35 ? 'high' : 'medium',
    })
  }

  // 规则2: 胜率 > 65% 但周收益低 → 放宽门槛 (可能过于保守)
  if (performance.winRate > 0.65 && performance.cumulativeReturn < 2 && trades.length >= 5) {
    const currentThreshold = config.marketThresholds.normal_range.minCompositeScore
    suggestions.push({
      parameter: 'minCompositeScore (normal_range)',
      currentValue: currentThreshold,
      suggestedValue: Math.max(65, currentThreshold - 2),
      reason: `胜率 ${(performance.winRate * 100).toFixed(1)}% 较高但累计收益仅 ${performance.cumulativeReturn.toFixed(2)}%，策略可能过于保守`,
      confidence: 'medium',
    })
  }

  // 规则3: 某模型组持续差 → 降低权重至 0.5-0.7
  for (const group of modelGroups) {
    if (group.predictionCount >= 10 && group.winRate < 0.38 && group.weight > 0.7) {
      suggestions.push({
        parameter: `${group.group}_expert_weight`,
        currentValue: group.weight,
        suggestedValue: Math.max(0.5, group.weight - 0.2),
        reason: `${group.group} 组胜率仅 ${(group.winRate * 100).toFixed(1)}%（${group.predictionCount} 次预测），持续低于阈值`,
        confidence: group.winRate < 0.30 ? 'high' : 'medium',
      })
    }
  }

  // 规则4: 观望太多 (>80% 的日子) → 适度放宽门槛 (-2 分)
  const totalDays = trades.length + watchLogs.length
  const watchRatio = totalDays > 0 ? watchLogs.length / totalDays : 0
  if (watchRatio > 0.8 && totalDays >= 10) {
    const currentThreshold = config.marketThresholds.normal_range.minCompositeScore
    suggestions.push({
      parameter: 'minCompositeScore (all regimes)',
      currentValue: currentThreshold,
      suggestedValue: Math.max(65, currentThreshold - 2),
      reason: `观望比例 ${(watchRatio * 100).toFixed(1)}% 过高（>80%），系统过于保守`,
      confidence: 'medium',
    })
  }

  // 规则5: 观望太少 (<30% 的日子) → 收紧门槛 (+3 分)
  if (watchRatio < 0.3 && totalDays >= 10) {
    const currentThreshold = config.marketThresholds.normal_range.minCompositeScore
    suggestions.push({
      parameter: 'minCompositeScore (all regimes)',
      currentValue: currentThreshold,
      suggestedValue: currentThreshold + 3,
      reason: `观望比例 ${(watchRatio * 100).toFixed(1)}% 偏低（<30%），信号可能过于宽松`,
      confidence: 'medium',
    })
  }

  // 规则6: 止损频繁触发 → 调整止损位从 -3% 到 -4%
  const stopLossTrades = trades.filter((t) => t.action === 'sell' && t.note?.includes('止损'))
  if (stopLossTrades.length >= 3 && trades.length >= 5) {
    const stopLossRatio = stopLossTrades.length / trades.filter((t) => t.action === 'sell').length
    if (stopLossRatio > 0.4) {
      suggestions.push({
        parameter: 'stopLossPercent',
        currentValue: config.stopLossPercent,
        suggestedValue: Math.min(5, config.stopLossPercent + 1),
        reason: `止损触发比例 ${(stopLossRatio * 100).toFixed(1)}% 过高，建议适当放宽止损位`,
        confidence: stopLossRatio > 0.6 ? 'high' : 'medium',
      })
    }
  }

  // 规则7: Conviction Filter 通过率异常
  if (dashboard.convictionPassRate < 0.1) {
    const currentThreshold = config.marketThresholds.normal_range.minCompositeScore
    suggestions.push({
      parameter: 'minCompositeScore (all regimes)',
      currentValue: currentThreshold,
      suggestedValue: Math.max(65, currentThreshold - 3),
      reason: `Conviction Filter 通过率仅 ${(dashboard.convictionPassRate * 100).toFixed(1)}%，过于保守`,
      confidence: 'medium',
    })
  }

  return suggestions
}

/**
 * 生成月度报告：复用 buildMonthlySummary，生成调优建议，
 * 输出 MonthlyReport + AutoReportNotification 并持久化
 */
export async function generateMonthlyReport(stockAnalysisDir: string): Promise<AutoReportNotification> {
  const [trades, watchLogs, signals, modelGroups, expertPerformance, config] = await Promise.all([
    readStockAnalysisTrades(stockAnalysisDir),
    readStockAnalysisWatchLogs(stockAnalysisDir),
    (async () => {
      const snapshot = await readLatestSnapshot(stockAnalysisDir)
      return snapshot?.signals ?? []
    })(),
    readStockAnalysisModelGroups(stockAnalysisDir),
    readStockAnalysisExpertPerformance(stockAnalysisDir),
    readStockAnalysisConfig(stockAnalysisDir),
  ])

  const monthlySummary = buildMonthlySummary(trades, watchLogs)
  await saveStockAnalysisMonthlySummary(stockAnalysisDir, monthlySummary)

  const modelGroupPerformance = modelGroups.length > 0
    ? modelGroups
    : await buildModelGroupPerformance(stockAnalysisDir, expertPerformance)
  const fallbackDate = todayDate()
  const marketState = (await readStockAnalysisMarketState(stockAnalysisDir, fallbackDate)) ?? buildFallbackMarketState(fallbackDate)
  const dashboard = buildPerformanceDashboard(signals, watchLogs, trades, modelGroupPerformance, marketState)
  await saveStockAnalysisPerformanceDashboard(stockAnalysisDir, dashboard)

  const latestMonth = monthlySummary[0]
  const now = nowIso()
  const monthLabel = latestMonth?.monthLabel ?? getMonthLabel(new Date())
  const performance = calculatePerformance(trades)

  // 生成调优建议
  const tuningSuggestions = generateTuningSuggestions(trades, watchLogs, modelGroupPerformance, config, dashboard)

  // 构建月度报告
  const monthlyReport: MonthlyReport = {
    id: `monthly-${monthLabel}-${Date.now()}`,
    monthLabel,
    generatedAt: now,
    metrics: latestMonth ?? {
      monthLabel,
      tradeCount: 0,
      watchDays: 0,
      winRate: performance.winRate,
      monthlyReturn: 0,
      cumulativeReturn: performance.cumulativeReturn,
      maxDrawdown: 0,
    },
    tuningSuggestions,
    narrativeSummary: buildMonthlyNarrative(monthLabel, latestMonth, performance, dashboard, tuningSuggestions, modelGroupPerformance),
  }

  // 持久化月度报告
  const existingReports = await readMonthlyReports(stockAnalysisDir)
  existingReports.unshift(monthlyReport)
  await saveMonthlyReports(stockAnalysisDir, existingReports)

  // 构建通知
  const summaryParts: string[] = []
  summaryParts.push(`${monthLabel} 月度报告`)
  summaryParts.push(`交易 ${latestMonth?.tradeCount ?? 0} 笔，月收益 ${latestMonth?.monthlyReturn?.toFixed(2) ?? '0.00'}%`)
  summaryParts.push(`累计收益 ${performance.cumulativeReturn.toFixed(2)}%，胜率 ${(performance.winRate * 100).toFixed(1)}%`)
  if (tuningSuggestions.length > 0) {
    summaryParts.push(`生成 ${tuningSuggestions.length} 条调优建议`)
  }

  const notification: AutoReportNotification = {
    id: `monthly-${monthLabel}-${Date.now()}`,
    type: 'monthly_report',
    generatedAt: now,
    periodLabel: monthLabel,
    title: `月度报告 ${monthLabel}`,
    summary: summaryParts.join('。'),
    acknowledged: false,
  }

  const existingNotifications = await readAutoReportNotifications(stockAnalysisDir)
  existingNotifications.unshift(notification)
  await saveAutoReportNotifications(stockAnalysisDir, existingNotifications)

  // [H4] 月报生成后更新长期记忆（从中期记忆聚合）
  const aiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
  await runLongTermMemoryUpdate(stockAnalysisDir, aiConfig)

  logger.info(`[stock-analysis] 月度报告已生成: ${monthLabel}，含 ${tuningSuggestions.length} 条调优建议`)
  return notification
}

/**
 * 构建月度叙述性摘要
 */
function buildMonthlyNarrative(
  monthLabel: string,
  latestMonth: StockAnalysisMonthlySummary | undefined,
  performance: ReturnType<typeof calculatePerformance>,
  dashboard: StockAnalysisPerformanceDashboard,
  tuningSuggestions: TuningSuggestion[],
  modelGroups: StockAnalysisModelGroupPerformance[],
): string {
  const parts: string[] = []
  parts.push(`## ${monthLabel} 月度总结`)
  parts.push('')
  parts.push(`### 绩效概览`)
  parts.push(`- 本月交易: ${latestMonth?.tradeCount ?? 0} 笔`)
  parts.push(`- 本月观望: ${latestMonth?.watchDays ?? 0} 天`)
  parts.push(`- 月度收益: ${latestMonth?.monthlyReturn?.toFixed(2) ?? '0.00'}%`)
  parts.push(`- 累计收益: ${performance.cumulativeReturn.toFixed(2)}%`)
  parts.push(`- 总胜率: ${(performance.winRate * 100).toFixed(1)}%`)
  parts.push(`- 最大回撤: ${latestMonth?.maxDrawdown?.toFixed(2) ?? '0.00'}%`)
  parts.push(`- 夏普比: ${dashboard.sharpeLike.toFixed(2)}`)
  parts.push(`- Conviction 通过率: ${(dashboard.convictionPassRate * 100).toFixed(1)}%`)
  parts.push(`- 观望准确率: ${(dashboard.watchAccuracy * 100).toFixed(1)}%`)

  if (modelGroups.length > 0) {
    parts.push('')
    parts.push(`### 模型组表现`)
    for (const group of modelGroups) {
      const simTag = group.isSimulated ? ' (模拟)' : ''
      parts.push(`- ${group.group}${simTag}: 胜率 ${(group.winRate * 100).toFixed(1)}%, 预测 ${group.predictionCount} 次, 权重 ${group.weight.toFixed(2)}`)
    }
  }

  if (tuningSuggestions.length > 0) {
    parts.push('')
    parts.push(`### 调优建议`)
    for (const suggestion of tuningSuggestions) {
      parts.push(`- **${suggestion.parameter}**: ${suggestion.currentValue} → ${suggestion.suggestedValue} (${suggestion.confidence} 置信度)`)
      parts.push(`  原因: ${suggestion.reason}`)
    }
  }

  if (dashboard.alerts.length > 0) {
    parts.push('')
    parts.push(`### 预警`)
    for (const alert of dashboard.alerts) {
      parts.push(`- ${alert}`)
    }
  }

  return parts.join('\n')
}

async function buildModelGroupPerformance(stockAnalysisDir: string, expertPerformance?: StockAnalysisExpertPerformanceData | null): Promise<StockAnalysisModelGroupPerformance[]> {
  // 读取全部历史信号文件，聚合所有 votes
  const dates = await getAvailableSignalDates(stockAnalysisDir)
  const allSignals: StockAnalysisSignal[] = []
  for (const date of dates) {
    const signals = await readStockAnalysisSignals(stockAnalysisDir, date)
    allSignals.push(...signals)
  }

  const allVotes = allSignals.flatMap((s) => s.expert?.votes ?? [])
  const hasRealVotes = allVotes.length > 0 && allSignals.some((s) => !s.expert?.isSimulated)

  if (!hasRealVotes) {
    const baseConfidence = allSignals.length === 0 ? 0.6 : average(allSignals.map((signal) => signal.confidence))
    return [
      { group: 'rules', predictionCount: allSignals.length, winRate: 0, averageConfidence: round(baseConfidence), calibration: 0, weight: 1, isSimulated: true },
    ]
  }

  // 从 AI 配置中读取 modelId → provider 映射，用于旧数据 provider 回填
  const aiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
  const modelProviderMap = new Map<string, { providerIds: string[]; providerNames: string[] }>()
  if (aiConfig) {
    for (const provider of aiConfig.providers) {
      if (!provider.enabled) continue
      for (const modelId of provider.models) {
        const normalized = normalizeModelId(modelId)
        const existing = modelProviderMap.get(normalized) ?? { providerIds: [], providerNames: [] }
        if (!existing.providerIds.includes(provider.id)) {
          existing.providerIds.push(provider.id)
          existing.providerNames.push(provider.name)
        }
        modelProviderMap.set(normalized, existing)
      }
    }
  }

  // 标准化 modelId（合并大小写差异和历史遗留名称）
  function normalizeModelId(id: string): string {
    const lower = id.toLowerCase()
    if (lower === 'qwen3.5-plus') return 'qwen3.6-plus'
    return lower
  }

  // 从配置推断旧 vote 的供应商信息
  function inferProvider(modelId: string): { providerId: string; providerName: string } {
    const mapping = modelProviderMap.get(modelId)
    if (!mapping || mapping.providerIds.length === 0) return { providerId: '', providerName: '' }
    if (mapping.providerIds.length === 1) return { providerId: mapping.providerIds[0], providerName: mapping.providerNames[0] }
    // 多供应商时无法确定，不拼接，按纯 modelId 分组
    return { providerId: '', providerName: '' }
  }

  // 构建分组键：providerId/modelId 或仅 modelId（旧数据无 provider 时）
  function getGroupKey(vote: StockAnalysisExpertVote): { groupKey: string; modelId: string; providerId: string; providerName: string; displayName: string } {
    if (vote.modelId === 'rule-engine') {
      return { groupKey: 'rules', modelId: 'rule-engine', providerId: '', providerName: '', displayName: '规则引擎' }
    }
    const modelId = normalizeModelId(vote.modelId || 'unknown')
    let providerId = vote.providerId || ''
    let providerName = vote.providerName || ''

    // 旧数据没有 provider 时，从配置中推断
    if (!providerId && !providerName) {
      const inferred = inferProvider(modelId)
      providerId = inferred.providerId
      providerName = inferred.providerName
    }

    const groupKey = providerId ? `${providerId}/${modelId}` : modelId
    const displayName = providerName ? `${modelId} (${providerName})` : modelId
    return { groupKey, modelId, providerId, providerName, displayName }
  }

  // 按 provider/model 分组统计
  interface GroupStats {
    predictions: number
    totalConfidence: number
    bullishCount: number
    bearishCount: number
    neutralCount: number
    fallbacks: number
    modelId: string
    providerId: string
    providerName: string
    displayName: string
    expertIds: Set<string>
  }
  const groupMap = new Map<string, GroupStats>()

  for (const vote of allVotes) {
    const { groupKey, modelId, providerId, providerName, displayName } = getGroupKey(vote)
    const existing = groupMap.get(groupKey) ?? {
      predictions: 0, totalConfidence: 0, bullishCount: 0, bearishCount: 0, neutralCount: 0, fallbacks: 0,
      modelId, providerId, providerName, displayName, expertIds: new Set<string>(),
    }
    existing.predictions += 1
    existing.totalConfidence += vote.confidence
    if (vote.verdict === 'bullish') existing.bullishCount += 1
    else if (vote.verdict === 'bearish') existing.bearishCount += 1
    else existing.neutralCount += 1
    if (vote.usedFallback) existing.fallbacks += 1
    existing.expertIds.add(vote.expertId)
    groupMap.set(groupKey, existing)
  }

  // 从 expert performance 按 provider/model 聚合真实 winRate、calibration、weight
  // 建 expertId → groupKeys 映射（一个 expert 可能被多个模型使用，需要将胜率分配给所有相关模型组）
  const expertGroupsMap = new Map<string, Set<string>>()
  for (const vote of allVotes) {
    const { groupKey } = getGroupKey(vote)
    const existing = expertGroupsMap.get(vote.expertId)
    if (existing) {
      existing.add(groupKey)
    } else {
      expertGroupsMap.set(vote.expertId, new Set([groupKey]))
    }
  }

  const modelGroupWinRates = new Map<string, { totalCorrect: number; totalPredictions: number; totalCalibration: number; totalWeight: number; expertCount: number }>()
  if (expertPerformance && expertPerformance.entries.length > 0) {
    for (const entry of expertPerformance.entries) {
      const groupKeys = expertGroupsMap.get(entry.expertId) ?? new Set(entry.layer === 'rule_functions' ? ['rules'] : ['unknown'])
      for (const groupKey of groupKeys) {
        const existing = modelGroupWinRates.get(groupKey) ?? { totalCorrect: 0, totalPredictions: 0, totalCalibration: 0, totalWeight: 0, expertCount: 0 }
        existing.totalCorrect += entry.correctCount
        existing.totalPredictions += entry.predictionCount
        existing.totalCalibration += entry.calibration
        existing.totalWeight += entry.weight
        existing.expertCount += 1
        modelGroupWinRates.set(groupKey, existing)
      }
    }
  }

  return Array.from(groupMap.entries()).map(([groupKey, stats]) => {
    const perfStats = modelGroupWinRates.get(groupKey)
    const winRate = perfStats && perfStats.totalPredictions > 0
      ? round(perfStats.totalCorrect / perfStats.totalPredictions, 4)
      : 0
    const calibration = perfStats && perfStats.expertCount > 0
      ? round(perfStats.totalCalibration / perfStats.expertCount, 4)
      : 0
    const weight = perfStats && perfStats.expertCount > 0
      ? round(perfStats.totalWeight / perfStats.expertCount, 2)
      : 1

    return {
      group: groupKey,
      modelId: stats.modelId,
      providerId: stats.providerId,
      providerName: stats.providerName,
      displayName: stats.displayName,
      predictionCount: stats.predictions,
      winRate,
      averageConfidence: round(stats.predictions > 0 ? stats.totalConfidence / stats.predictions / 100 : 0, 4),
      calibration,
      weight,
      isSimulated: false,
    }
  }).sort((a, b) => b.predictionCount - a.predictionCount)
}

async function runLimitedConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let index = 0
  async function runner() {
    while (index < items.length) {
      const current = index
      index += 1
      results[current] = await worker(items[current], current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runner()))
  return results
}

async function getLatestAvailableSignalDate(stockAnalysisDir: string) {
  const runtimeStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)
  return runtimeStatus.latestSuccessfulSignalDate || runtimeStatus.latestSignalDate || null
}

function resolveDataState(runtimeStatus: StockAnalysisRuntimeStatus): StockAnalysisDataState {
  if (!runtimeStatus.latestSuccessfulSignalDate) return 'empty'
  if (runtimeStatus.isUsingFallback || runtimeStatus.staleReasons.length > 0) return 'stale'
  return 'ready'
}

async function readLatestSnapshot(stockAnalysisDir: string) {
  const tradeDate = await getLatestAvailableSignalDate(stockAnalysisDir)
  if (!tradeDate) {
    return null
  }
  const [signals, marketState, dailyRun] = await Promise.all([
    readStockAnalysisSignals(stockAnalysisDir, tradeDate),
    readStockAnalysisMarketState(stockAnalysisDir, tradeDate),
    readStockAnalysisDailyRun(stockAnalysisDir, tradeDate),
  ])
  if (signals.length === 0 || !marketState || !dailyRun) {
    return null
  }
  return { tradeDate, signals, marketState, dailyRun }
}

function mergeStaleReasons(...reasonGroups: Array<string[]>) {
  return dedupeStrings(reasonGroups.flat())
}

async function finalizeDailyRun(stockAnalysisDir: string, result: StockAnalysisDailyRunResult, runtimeStatus: StockAnalysisRuntimeStatus) {
  await Promise.all([
    saveStockAnalysisSignals(stockAnalysisDir, result.tradeDate, result.topSignals.length > 0 ? result.topSignals : []),
    saveStockAnalysisMarketState(stockAnalysisDir, result.marketState),
    saveStockAnalysisDailyRun(stockAnalysisDir, result),
    saveStockAnalysisRuntimeStatus(stockAnalysisDir, {
      ...runtimeStatus,
      lastRunAt: result.generatedAt,
      lastSuccessAt: result.generatedAt,
      latestSignalDate: result.tradeDate,
      latestSuccessfulSignalDate: result.tradeDate,
      lastError: null,
      runState: 'success',
      currentRun: null,
      isUsingFallback: result.usedFallbackData,
      staleReasons: result.staleReasons,
    }),
  ])
}

export async function runStockAnalysisDaily(stockAnalysisDir: string): Promise<StockAnalysisDailyRunResult> {
  await ensureStockAnalysisStructure(stockAnalysisDir)
  if (currentRunPromise) {
    return currentRunPromise
  }

  currentRunPromise = (async () => {
    const initialStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)
    await markRunState(stockAnalysisDir, 'running', {
      startedAt: nowIso(),
      phase: 'bootstrap',
      processedCount: 0,
      totalCount: 0,
    }, { lastRunAt: nowIso(), lastError: null })

    try {
      const config = await readStockAnalysisConfig(stockAnalysisDir)

      await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'stock_pool', processedCount: 0, totalCount: 0 })
      const stockPoolEnvelope = await getStockPoolData(stockAnalysisDir)
      const stockPool = stockPoolEnvelope.data

      await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'quotes', processedCount: 0, totalCount: stockPool.length })
      const quoteEnvelope = await getQuoteData(stockAnalysisDir, stockPool.map((item) => item.code))
      const quotes = quoteEnvelope.data

      await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'market_state', processedCount: 0, totalCount: stockPool.length }, {
        quoteCacheAt: quoteEnvelope.fetchedAt,
      })
      const indexHistoryEnvelope = await getIndexHistoryData(stockAnalysisDir)
      const marketState = buildMarketState(stockPool, quotes, indexHistoryEnvelope.data)

      const [currentPositions, blacklist] = await Promise.all([
        readStockAnalysisPositions(stockAnalysisDir),
        readStockAnalysisBlacklist(stockAnalysisDir),
      ])
      const positionCodes = new Set(currentPositions.map((position) => position.code))
      const blacklistCodes = new Set(blacklist)
      const candidates = stockPool.filter((candidate) => !positionCodes.has(candidate.code) && !blacklistCodes.has(candidate.code) && !candidate.name.includes('ST'))

      await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'history', processedCount: 0, totalCount: candidates.length }, {
        indexHistoryCacheAt: indexHistoryEnvelope.fetchedAt,
      })

      const industryStrengthMap = buildIndustryStrengthMap(stockPool, quotes)

      const historyResults = await runLimitedConcurrency(candidates, MAX_HISTORY_CONCURRENCY, async (candidate, index) => {
        const quote = quotes.get(candidate.code)
        // [P2-17] 节流 runtimeStatus 写入：每 20 个候选更新一次，减少 ~500 次磁盘写入
        if (index % 20 === 0 || index === candidates.length - 1) {
          await markRunState(stockAnalysisDir, 'running', {
            startedAt: nowIso(),
            phase: 'history',
            processedCount: index,
            totalCount: candidates.length,
          })
        }
        if (!quote || quote.latestPrice <= 0) {
          return null
        }
        // S7: 停牌股剔除 — 开盘价为 0 或换手率为 0 表示当日未交易
        if (quote.open <= 0 || quote.turnoverRate <= 0) {
          return null
        }
        try {
          const historyEnvelope = await getStockHistoryData(stockAnalysisDir, candidate.code)
          // S6: 次新股剔除 — 上市不足 60 个交易日（K线记录不足60条）
          if (historyEnvelope.data.length < 60) {
            return null
          }
          return {
            candidate,
            quote,
            history: historyEnvelope.data,
            staleReasons: historyEnvelope.staleReasons,
            usedFallback: historyEnvelope.usedFallback,
          }
        } catch (error) {
          logger.error(`个股历史数据抓取失败: ${(error as Error).message} (${candidate.code})`, { module: 'StockAnalysis' })
          return null
        }
      })

      const historyMap = new Map<string, StockAnalysisKlinePoint[]>()
      for (const item of historyResults) {
        if (item) {
          historyMap.set(item.candidate.code, item.history)
        }
      }
      const industryTrendMap = await buildIndustryTrendMapForStockPool(stockAnalysisDir, stockPool, quotes, historyMap)

      const allSnapshots = historyResults
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => buildSnapshot(item.candidate, item.quote, item.history, config, industryStrengthMap, industryTrendMap))
      const positionSnapshotInputs = await runLimitedConcurrency(currentPositions, MAX_HISTORY_CONCURRENCY, async (position) => {
        const posQuote = quotes.get(position.code)
        if (!posQuote || posQuote.latestPrice <= 0) {
          return null
        }
        try {
          const posHistoryEnvelope = await getStockHistoryData(stockAnalysisDir, position.code)
          if (posHistoryEnvelope.data.length < 30) {
            return null
          }
          const posCandidate: StockAnalysisWatchlistCandidate = {
            code: position.code,
            name: position.name,
            market: position.code.startsWith('6') ? 'sh' : position.code.startsWith('0') || position.code.startsWith('3') ? 'sz' : 'bj',
            exchange: position.code.startsWith('6') ? 'SSE' : 'SZSE',
          }
          return {
            code: position.code,
            snapshot: buildSnapshot(posCandidate, posQuote, posHistoryEnvelope.data, config, industryStrengthMap, industryTrendMap),
          }
        } catch {
          return null
        }
      })
      const positionBaseSnapshots = positionSnapshotInputs
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .map((item) => item.snapshot)
      const crossSectionalMomentumMap = buildCrossSectionalMomentumMap([...allSnapshots, ...positionBaseSnapshots])
      const rankedSnapshots = applyCrossSectionalMomentumRanks(allSnapshots, crossSectionalMomentumMap)
      const rankedPositionSnapshotMap = new Map(
        applyCrossSectionalMomentumRanks(positionBaseSnapshots, crossSectionalMomentumMap)
          .map((snapshot) => [snapshot.code, snapshot] as const),
      )

      // 分步记录 hard filter 淘汰数量，便于诊断 BUG-2（candidates 骤降）
      const noQuoteOrHistory = historyResults.filter((item) => item == null).length
      const failedTurnover = rankedSnapshots.filter((snapshot) => snapshot.averageTurnoverAmount20d < config.minTurnoverAmount20d).length
      const failedAmplitude = rankedSnapshots.filter((snapshot) => snapshot.amplitude20d < config.minAmplitude20d).length
      const failedDecline = rankedSnapshots.filter((snapshot) => snapshot.declineDays20d > config.maxContinuousDeclineDays).length
      const snapshots = rankedSnapshots
        .filter((snapshot) => snapshot.averageTurnoverAmount20d >= config.minTurnoverAmount20d && snapshot.amplitude20d >= config.minAmplitude20d && snapshot.declineDays20d <= config.maxContinuousDeclineDays)

      saLog.audit('Service', `筛选漏斗: 候选=${candidates.length}, 黑名单排除=${blacklist.length}, 无行情或历史=${noQuoteOrHistory}, 有snapshot=${rankedSnapshots.length}, 成交额不足=${failedTurnover}, 振幅不足=${failedAmplitude}, 连跌超限=${failedDecline}, 通过hardFilter=${snapshots.length}`)

      await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'signals', processedCount: snapshots.length, totalCount: snapshots.length })
      const candidatePool = snapshots
        .slice()
        .sort((left, right) => buildCandidatePoolScore(right) - buildCandidatePoolScore(left))
        .slice(0, 60)

      // Phase 3.5: G7 事件驱动选股 — 用前一日盘后 LLM 提取结果补充/提升候选池
      let eventScreenResults: EventScreenResult[] = []
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        const llmExtraction = await readLLMExtractionResult(stockAnalysisDir, yesterday)
        if (llmExtraction && (llmExtraction.announcements.length > 0 || llmExtraction.newsImpacts.length > 0)) {
          // 从公告事件中提取受影响股票
          for (const ann of llmExtraction.announcements) {
            if (ann.sentiment > 0.3 && ann.confidence > 0.6) {
              const code = ann.company.replace(/[^\d]/g, '')
              if (code.length === 6) {
                const existsInPool = candidatePool.some((s) => s.code === code)
                eventScreenResults.push({
                  code,
                  name: ann.company,
                  matchedEvents: [{
                    source: 'announcement',
                    description: `${ann.eventType}: ${ann.magnitude}`,
                    sentiment: ann.sentiment,
                  }],
                  priorityScore: ann.sentiment * ann.confidence * 100,
                })
                // 如果不在候选池中，尝试从 allSnapshots 中找到并添加
                if (!existsInPool) {
                  const matchedSnapshot = rankedSnapshots.find((s) => s.code === code)
                  if (matchedSnapshot) {
                    candidatePool.push(matchedSnapshot)
                    logger.info(`[stock-analysis] [G7] 事件驱动加入候选池: ${code} (${ann.eventType})`)
                  }
                }
              }
            }
          }

          // 从新闻影响中提取受影响股票
          for (const news of llmExtraction.newsImpacts) {
            if (news.impactDirection === '利好' && news.confidence > 0.6) {
              for (const code of news.affectedStocks) {
                const cleanCode = code.replace(/[^\d]/g, '')
                if (cleanCode.length === 6) {
                  eventScreenResults.push({
                    code: cleanCode,
                    name: news.topic,
                    matchedEvents: [{
                      source: 'news',
                      description: `${news.topic} (${news.impactLevel})`,
                      sentiment: news.impactDirection === '利好' ? 0.6 : -0.6,
                    }],
                    priorityScore: news.confidence * 80,
                  })
                  const existsInPool = candidatePool.some((s) => s.code === cleanCode)
                  if (!existsInPool) {
                    const matchedSnapshot = rankedSnapshots.find((s) => s.code === cleanCode)
                    if (matchedSnapshot) {
                      candidatePool.push(matchedSnapshot)
                      logger.info(`[stock-analysis] [G7] 新闻驱动加入候选池: ${cleanCode} (${news.topic})`)
                    }
                  }
                }
              }
            }
          }

          if (eventScreenResults.length > 0) {
            saLog.audit('Service', `[G7] 事件驱动选股: 匹配 ${eventScreenResults.length} 条事件, 候选池扩展至 ${candidatePool.length}`)
          }
        }
      } catch (error) {
        logger.warn(`[stock-analysis] [G7] 事件驱动选股失败（不影响正常流程）: ${(error as Error).message}`)
      }

      // [MH1] Phase 3.6: 构建"重大事件一票否决"集合
      // 对即将发布财报、限售解禁、重组等重大事件的股票进行一票否决
      const eventVetoCodes = new Map<string, string>() // code -> 否决原因
      try {
        // 来源1: FactPool 原始公告（前一天盘后采集的）
        const today = todayDate()
        const prevDate = new Date(today)
        prevDate.setDate(prevDate.getDate() - 1)
        const prevTradeDate = prevDate.toISOString().slice(0, 10)
        const previousFactPool = await readFactPool(stockAnalysisDir, prevTradeDate)
        if (previousFactPool) {
          for (const ann of previousFactPool.companyAnnouncements) {
            if (ann.importance === 'major' && (ann.category === 'earnings' || ann.category === 'equity_change')) {
              eventVetoCodes.set(ann.code, `即将/正在发生重大事件: ${ann.category === 'earnings' ? '财报发布' : '股权变动'}（${ann.title.slice(0, 30)}）`)
            }
          }
        }
        // 来源2: LLM 提取的结构化公告事件（riskFlags 非空或高不确定性事件）
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
        const llmExtraction = await readLLMExtractionResult(stockAnalysisDir, yesterday)
        if (llmExtraction) {
          for (const ann of llmExtraction.announcements) {
            if (ann.riskFlags.length > 0 && ann.confidence > 0.5) {
              const code = ann.company.replace(/[^\d]/g, '')
              if (code.length === 6 && !eventVetoCodes.has(code)) {
                eventVetoCodes.set(code, `重大风险事件: ${ann.riskFlags.join(', ')}（${ann.eventType}）`)
              }
            }
          }
        }
        if (eventVetoCodes.size > 0) {
          logger.info(`[stock-analysis] [MH1] 重大事件一票否决: ${eventVetoCodes.size} 只股票 (${[...eventVetoCodes.keys()].join(', ')})`, { module: 'StockAnalysis' })
        }
      } catch (error) {
        logger.warn(`[stock-analysis] [MH1] 构建事件否决集合失败（不影响正常流程）: ${(error as Error).message}`)
      }

      // Phase 4: 学习权重 + 阈值自适应
      const learnedWeights = await computeLearnedWeights(stockAnalysisDir)
      await adjustConvictionThresholds(stockAnalysisDir, config, marketState)

      // Phase 4.5: 加载专家个体历史表现 → 动态权重
      let expertWeightsMap: Map<string, number> | undefined
      let expertPerformanceData: StockAnalysisExpertPerformanceData | null = null
      try {
        expertPerformanceData = await readStockAnalysisExpertPerformance(stockAnalysisDir)
        if (expertPerformanceData && expertPerformanceData.entries.length > 0) {
          expertWeightsMap = new Map(expertPerformanceData.entries.map((e) => [e.expertId, e.weight]))
          logger.info(`[stock-analysis] 已加载 ${expertPerformanceData.entries.length} 位专家的动态权重`, { module: 'StockAnalysis' })
        }
      } catch (error) {
        logger.warn(`[stock-analysis] 加载专家表现数据失败，使用默认权重: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      }

      // Phase 5: 读取 AI 配置，用于 LLM 专家投票
      let aiConfig: StockAnalysisAIConfig | null = null
      try {
        aiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
        const enabledProviders = aiConfig.providers.filter((p) => p.enabled && p.apiKey).length
        const assignedExperts = aiConfig.experts.filter((e) => e.enabled && e.layer !== 'rule_functions' && e.assignedModel).length
        if (enabledProviders > 0 && assignedExperts > 0) {
          logger.info(`[stock-analysis] AI 配置已加载: ${enabledProviders} 个 provider, ${assignedExperts} 个 LLM 专家`, { module: 'StockAnalysis' })
        } else {
          logger.info(`[stock-analysis] AI 配置不完整 (providers=${enabledProviders}, experts=${assignedExperts})，将使用公式模拟`, { module: 'StockAnalysis' })
          aiConfig = null
        }
      } catch (error) {
        logger.warn(`[stock-analysis] 读取 AI 配置失败，将使用公式模拟: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      }

      // Phase 5.5: 加载专家记忆系统 + 构建性能档案 + FactPool 摘要（注入 LLM prompt）
      let profileMap: Map<string, ExpertProfile> | undefined
      let factPoolSummary: FactPoolSummary | undefined
      let memoryStore: ExpertMemoryStore | undefined
      try {
        // 构建专家性能档案（基于已加载的 expertPerformanceData）
        if (expertPerformanceData && expertPerformanceData.entries.length > 0) {
          profileMap = new Map<string, ExpertProfile>()
          for (const entry of expertPerformanceData.entries) {
            profileMap.set(entry.expertId, buildExpertProfile(entry))
          }
          logger.info(`[stock-analysis] 已构建 ${profileMap.size} 位专家的性能档案`, { module: 'StockAnalysis' })
        }
      } catch (error) {
        logger.warn(`[stock-analysis] 构建专家性能档案失败（不影响投票）: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      }
      try {
        // P1-2: 加载最近的 FactPool 摘要 — 使用前一个交易日（而非自然日 -1）
        const today = todayDate()
        const recentDatesForFP = getRecentTradeDates(today, 3)
        const prevTradeDate = recentDatesForFP.length >= 2 ? recentDatesForFP[1] : today
        const previousFactPool = await readFactPool(stockAnalysisDir, prevTradeDate)
        if (previousFactPool) {
          factPoolSummary = buildFactPoolSummary(previousFactPool)
          logger.info(`[stock-analysis] 已构建 FactPool 摘要（数据 agent: ${previousFactPool.agentLogs.length}）`, { module: 'StockAnalysis' })
        }
      } catch (error) {
        logger.warn(`[stock-analysis] 加载 FactPool 失败（不影响投票）: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      }
      try {
        // 加载专家记忆存储
        memoryStore = await readExpertMemoryStore(stockAnalysisDir)
        if (memoryStore && Object.keys(memoryStore).length > 0) {
          logger.info(`[stock-analysis] 已加载 ${Object.keys(memoryStore).length} 位专家的记忆数据`, { module: 'StockAnalysis' })
        }
      } catch (error) {
        logger.warn(`[stock-analysis] 加载专家记忆失败（不影响投票）: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
      }

      // Phase 6: 逐只股票生成信号（含 LLM 专家投票）
      // P2-A2: 提前加载交易记录，用于 Kelly 公式的实际盈亏比计算
      const tradesForKelly = await readStockAnalysisTrades(stockAnalysisDir)
      // S5: 持仓满时跳过昂贵的 LLM 调用，使用公式评分（仅用于换仓比较）
      const positionsFull = currentPositions.length >= config.maxPositions
      if (positionsFull) {
        logger.info(`[stock-analysis] 持仓已满 (${currentPositions.length}/${config.maxPositions})，新信号使用公式评分（仅用于换仓比较）`, { module: 'StockAnalysis' })
      }
      const signalResults = await runLimitedConcurrency(candidatePool, 3, async (snapshot, index) => {
        await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'signals', processedCount: index, totalCount: candidatePool.length })
        return buildSignal(snapshot, marketState, config, learnedWeights, positionsFull ? null : aiConfig, expertWeightsMap, historyMap.get(snapshot.code), profileMap, factPoolSummary, memoryStore, eventVetoCodes, tradesForKelly)
      })
      const signals = signalResults.sort((left, right) => right.finalScore - left.finalScore)

      // --- Phase 2.3: 持仓评估 + 换仓逻辑 ---
      const positionEvaluations: StockAnalysisPositionEvaluation[] = []
      if (currentPositions.length > 0) {
        const existingSignals = await getStockAnalysisSignals(stockAnalysisDir)
        const signalMap = new Map(existingSignals.map((signal) => [signal.id, signal]))

        for (const position of currentPositions) {
          const posSnapshot = rankedPositionSnapshotMap.get(position.code)
          if (!posSnapshot) {
            logger.debug(`[stock-analysis] 持仓评估跳过 ${position.code}：快照不足`)
            continue
          }
          try {
            const buySignal = position.sourceSignalId ? signalMap.get(position.sourceSignalId) : null
            // P2-D6: 默认值改为 65（buy/watch 分界线），避免高默认值导致虚假 scoreDelta 下降
            const buyCompositeScore = buySignal?.compositeScore ?? 65
            const buyFinalScore = buySignal?.finalScore ?? buyCompositeScore
            const evaluation = await evaluatePositionScores(position, posSnapshot, marketState, config, buyCompositeScore, buyFinalScore, aiConfig, expertWeightsMap, profileMap, factPoolSummary, memoryStore, learnedWeights)
            positionEvaluations.push(evaluation)

            if (evaluation.sellRecommended) {
              logger.info(`[stock-analysis] 持仓卖出信号: ${position.name}(${position.code}) - ${evaluation.sellReasonText}`)
            }
          } catch (error) {
            logger.error(`[stock-analysis] 持仓评估失败 ${position.code}: ${(error as Error).message}`)
          }
        }
      }

      const swapSuggestions = buildSwapSuggestions(positionEvaluations, signals, config.maxPositions, currentPositions.length)
      if (swapSuggestions.length > 0) {
        logger.info(`[stock-analysis] 换仓建议 ${swapSuggestions.length} 条: ${swapSuggestions.map((suggestion) => `${suggestion.sellName} -> ${suggestion.buyName}`).join(', ')}`)
      }

      const watchLogs = await readStockAnalysisWatchLogs(stockAnalysisDir)
      const topSignal = signals[0]
      const nextWatchLogs = [...watchLogs]
      if (!topSignal || (topSignal.action !== 'strong_buy' && topSignal.action !== 'buy')) {
        nextWatchLogs.unshift({
          id: `watch-${todayDate()}`,
          tradeDate: todayDate(),
          highestSignalScore: topSignal?.finalScore ?? 0,
          reason: topSignal ? '最高分未通过 Conviction Filter 买入门槛' : '无可用候选标的',
          topCandidateCode: topSignal?.code ?? null,
          topCandidateName: topSignal?.name ?? null,
          tPlus1Return: null,
          tPlus5Return: null,
          outcome: 'pending',
          evaluatedAt: null,
          createdAt: nowIso(),
        })
      }

      const trades = await readStockAnalysisTrades(stockAnalysisDir)
      const evaluatedWatchLogs = await evaluateWatchLogOutcomes(stockAnalysisDir, nextWatchLogs)
      const weeklySummary = buildWeeklySummary(trades, evaluatedWatchLogs)
      const monthlySummary = buildMonthlySummary(trades, evaluatedWatchLogs)
      const modelGroups = await buildModelGroupPerformance(stockAnalysisDir, expertPerformanceData)
      const performanceDashboard = buildPerformanceDashboard(signals, evaluatedWatchLogs, trades, modelGroups, marketState)
      const staleReasons = mergeStaleReasons(
        stockPoolEnvelope.staleReasons,
        quoteEnvelope.staleReasons,
        indexHistoryEnvelope.staleReasons,
        historyResults.flatMap((item) => item?.staleReasons ?? []),
      )
      const usedFallbackData = stockPoolEnvelope.usedFallback || quoteEnvelope.usedFallback || indexHistoryEnvelope.usedFallback || historyResults.some((item) => item?.usedFallback)

      const result: StockAnalysisDailyRunResult = {
        tradeDate: todayDate(),
        generatedAt: nowIso(),
        marketState,
        stockPoolSize: stockPool.length,
        candidatePoolSize: candidatePool.length,
        signalCount: signals.length,
        watchCount: signals.filter((signal) => signal.action === 'watch').length,
        topSignals: signals.slice(0, 20),
        positionEvaluations,
        swapSuggestions,
        usedFallbackData,
        staleReasons,
      }

      await markRunState(stockAnalysisDir, 'running', { startedAt: nowIso(), phase: 'persist', processedCount: signals.length, totalCount: signals.length })
      await Promise.all([
        saveStockAnalysisSignals(stockAnalysisDir, result.tradeDate, signals),
        saveStockAnalysisMarketState(stockAnalysisDir, marketState),
        saveStockAnalysisDailyRun(stockAnalysisDir, result),
        saveStockAnalysisWatchLogs(stockAnalysisDir, evaluatedWatchLogs.slice(0, 120)),
        saveStockAnalysisModelGroups(stockAnalysisDir, modelGroups),
        saveStockAnalysisWeeklySummary(stockAnalysisDir, weeklySummary),
        saveStockAnalysisMonthlySummary(stockAnalysisDir, monthlySummary),
        saveStockAnalysisPerformanceDashboard(stockAnalysisDir, performanceDashboard),
        saveStockAnalysisRuntimeStatus(stockAnalysisDir, {
          ...initialStatus,
          lastRunAt: result.generatedAt,
          lastSuccessAt: result.generatedAt,
          lastError: null,
          stockPoolRefreshedAt: stockPoolEnvelope.fetchedAt ?? initialStatus.stockPoolRefreshedAt,
          latestSignalDate: result.tradeDate,
          runState: 'success',
          currentRun: null,
          quoteCacheAt: quoteEnvelope.fetchedAt,
          indexHistoryCacheAt: indexHistoryEnvelope.fetchedAt,
          latestSuccessfulSignalDate: result.tradeDate,
          isUsingFallback: usedFallbackData,
          staleReasons,
        }),
      ])

      saLog.audit('Service', `daily run completed: pool=${stockPool.length}, candidates=${candidatePool.length}, signals=${signals.length}, posEvals=${positionEvaluations.length}, sellSignals=${positionEvaluations.filter((evaluation) => evaluation.sellRecommended).length}, swaps=${swapSuggestions.length}, fallback=${usedFallbackData}`)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 炒股每日运行失败'
      await updateRuntimeStatus(stockAnalysisDir, {
        lastError: message,
        runState: 'failed',
        currentRun: null,
      })
      saLog.audit('Service', `daily run failed: ${message}`)
      throw error
    } finally {
      currentRunPromise = null
    }
  })()

  return currentRunPromise
}

// ==================== G1: 盘后流程 ====================

export async function runStockAnalysisPostMarket(
  stockAnalysisDir: string,
  options?: { maxDurationMs?: number },
): Promise<StockAnalysisPostMarketResult> {
  await ensureStockAnalysisStructure(stockAnalysisDir)
  if (currentPostMarketPromise) {
    return currentPostMarketPromise
  }

  currentPostMarketPromise = (async () => {
    const tradeDate = todayDate()
    const postMarketStart = Date.now()
    const maxDurationMs = options?.maxDurationMs ?? POST_MARKET_BATCH_WINDOW_MS
    logger.info(`[stock-analysis] 盘后流程开始: ${tradeDate}`, { module: 'StockAnalysis' })
    saLog.info('Service', `[盘后] 流程开始: tradeDate=${tradeDate} 最大窗口=${maxDurationMs}ms`)

    try {
      const config = await readStockAnalysisConfig(stockAnalysisDir)

      // Phase 1: 刷新收盘行情 + 市场状态
      assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 1 之前')
      const stockPoolEnvelope = await getStockPoolData(stockAnalysisDir)
      const stockPool = stockPoolEnvelope.data
      const quoteEnvelope = await getQuoteData(stockAnalysisDir, stockPool.map((item) => item.code))
      const quotes = quoteEnvelope.data
      const indexHistoryEnvelope = await getIndexHistoryData(stockAnalysisDir)
      const marketState = buildMarketState(stockPool, quotes, indexHistoryEnvelope.data)
      saLog.info('Service', `[盘后] 市场流动性状态: ${describeMarketLiquidityState(marketState, config)}`)

      // Phase 2: 持仓评估（止损止盈检查 + 信号衰减检测）
      // 先加载 AI 配置，用于 LLM 专家投票（和日常运行保持一致）
      assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 2 之前')
      let postMarketAiConfig: StockAnalysisAIConfig | null = null
      try {
        const loadedAiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
        const enabledProviders = loadedAiConfig.providers.filter((p) => p.enabled && p.apiKey).length
        const assignedExperts = loadedAiConfig.experts.filter((e) => e.enabled && e.layer !== 'rule_functions' && e.assignedModel).length
        if (enabledProviders > 0 && assignedExperts > 0) {
          postMarketAiConfig = loadedAiConfig
          logger.info(`[stock-analysis] [盘后] AI 配置已加载: ${enabledProviders} 个 provider, ${assignedExperts} 个 LLM 专家`, { module: 'StockAnalysis' })
        }
      } catch {
        logger.warn(`[stock-analysis] [盘后] 读取 AI 配置失败，持仓评估将使用公式模拟`, { module: 'StockAnalysis' })
      }

      const currentPositions = await readStockAnalysisPositions(stockAnalysisDir)
      const positionEvaluations: StockAnalysisPositionEvaluation[] = []

      if (currentPositions.length > 0) {
        const existingSignals = await getStockAnalysisSignals(stockAnalysisDir)
        const signalMap = new Map(existingSignals.map((signal) => [signal.id, signal]))

        for (const position of currentPositions) {
          assertWithinPostMarketWindow(postMarketStart, maxDurationMs, `Phase 2 持仓评估 ${position.code} 前`)
          const posQuote = quotes.get(position.code)
          if (!posQuote || posQuote.latestPrice <= 0) {
            continue
          }
          try {
            const posHistoryEnvelope = await getStockHistoryData(stockAnalysisDir, position.code)
            if (posHistoryEnvelope.data.length < 30) {
              continue
            }
            const posCandidate: StockAnalysisWatchlistCandidate = {
              code: position.code,
              name: position.name,
              market: position.code.startsWith('6') ? 'sh' : position.code.startsWith('0') || position.code.startsWith('3') ? 'sz' : 'bj',
              exchange: position.code.startsWith('6') ? 'SSE' : 'SZSE',
            }
            const industryStrengthMap = buildIndustryStrengthMap(stockPool, quotes)
            const posSnapshot = buildSnapshot(posCandidate, posQuote, posHistoryEnvelope.data, config, industryStrengthMap)
            const buySignal = position.sourceSignalId ? signalMap.get(position.sourceSignalId) : null
            const buyCompositeScore = buySignal?.compositeScore ?? 65
            const buyFinalScore = buySignal?.finalScore ?? buyCompositeScore
            const evaluation = await evaluatePositionScores(position, posSnapshot, marketState, config, buyCompositeScore, buyFinalScore, postMarketAiConfig)
            positionEvaluations.push(evaluation)

            if (evaluation.sellRecommended) {
              logger.info(`[stock-analysis] [盘后] 持仓卖出信号: ${position.name}(${position.code}) - ${evaluation.sellReasonText}`)
            }
          } catch (error) {
            logger.error(`[stock-analysis] [盘后] 持仓评估失败 ${position.code}: ${(error as Error).message}`)
          }
        }
      }

      // Phase 3: 组合级风控评估
      assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 3 之前')
      const trades = await readStockAnalysisTrades(stockAnalysisDir)
      const runtimeStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)
      const existingRiskControl = runtimeStatus.riskControl ?? DEFAULT_RISK_CONTROL_STATE
      const { state: riskControlState, newEvents: riskEvents } = assessPortfolioRisk(trades, config.portfolioRiskLimits, existingRiskControl)

      if (riskEvents.length > 0) {
        const storedEvents = await readStockAnalysisRiskEvents(stockAnalysisDir)
        await saveStockAnalysisRiskEvents(stockAnalysisDir, [...riskEvents, ...storedEvents])
        logger.warn(`[stock-analysis] [盘后] 新增风控事件 ${riskEvents.length} 条`)
      }

      // Phase 4: 数据采集（调用 data-agents 模块）
      assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 4 之前')
      let factPoolUpdated = false
      try {
        const { collectAllAgents } = await import('./data-agents')
        const agentConfig = await readDataAgentConfig(stockAnalysisDir)
        const factPool = await collectAllAgents(stockAnalysisDir, tradeDate, quotes, marketState, agentConfig)
        await saveFactPool(stockAnalysisDir, factPool)
        factPoolUpdated = true
        logger.info(`[stock-analysis] [盘后] 事实池更新完成，数据点: ${factPool.agentLogs.reduce((sum, log) => sum + log.dataPointCount, 0)}`)
      } catch (error) {
        logger.error(`[stock-analysis] [盘后] 数据采集失败: ${(error as Error).message}`)
      }

      // Phase 5: LLM 信息提取（盘后批量调用，非实时）
      let llmExtractionDone = false
      if (factPoolUpdated) {
        assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 5 之前')
        try {
          const { runLLMExtraction } = await import('./llm-extraction')
          const factPool = await readFactPool(stockAnalysisDir, tradeDate)
          if (!factPool) {
            logger.warn(`[stock-analysis] [盘后] FactPool 为空，跳过 LLM 信息提取`)
          } else {
            const aiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
            const extractionResult = await runLLMExtraction(stockAnalysisDir, factPool, aiConfig)
            await saveLLMExtractionResult(stockAnalysisDir, extractionResult)
            llmExtractionDone = true
            logger.info(`[stock-analysis] [盘后] LLM 信息提取完成，公告事件: ${extractionResult.announcements.length}，新闻影响: ${extractionResult.newsImpacts.length}`)
          }
        } catch (error) {
          logger.error(`[stock-analysis] [盘后] LLM 信息提取失败: ${(error as Error).message}`)
        }
      }

      // Phase 7: 专家记忆更新（提取当日投票结果 → 更新短期/中期/长期记忆）
      assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 7 之前')
      try {
        const memoryAiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
        // P1-1: 使用交易日历获取前一个交易日（而非自然日 -1，避免跨周末/节假日丢失回填）
        const recentDatesForMem = getRecentTradeDates(tradeDate, 3)
        const previousTradeDate = recentDatesForMem.length >= 2 ? recentDatesForMem[1] : tradeDate
        await runDailyMemoryUpdate(stockAnalysisDir, tradeDate, previousTradeDate, memoryAiConfig)
        logger.info(`[stock-analysis] [盘后] 专家记忆更新完成: ${tradeDate}`, { module: 'StockAnalysis' })
      } catch (error) {
        logger.error(`[stock-analysis] [盘后] 专家记忆更新失败（不影响盘后结果）: ${(error as Error).message}`)
      }

      // Phase 6: 保存市场状态 + 更新运行时状态
      assertWithinPostMarketWindow(postMarketStart, maxDurationMs, 'Phase 6 保存前')
      await saveStockAnalysisMarketState(stockAnalysisDir, marketState)

      const result: StockAnalysisPostMarketResult = {
        tradeDate,
        generatedAt: nowIso(),
        runType: 'post_market',
        marketState,
        positionEvaluations,
        riskControlState,
        reviewsGenerated: 0,
        factPoolUpdated,
      }

      await savePostMarketResult(stockAnalysisDir, result)

      // 更新运行时状态
      await saveStockAnalysisRuntimeStatus(stockAnalysisDir, {
        ...runtimeStatus,
        riskControl: riskControlState,
        postMarketAt: nowIso(),
      })

      logger.info(`[stock-analysis] 盘后流程完成: ${tradeDate}，持仓评估 ${positionEvaluations.length} 条，事实池 ${factPoolUpdated ? '已' : '未'}更新，LLM提取 ${llmExtractionDone ? '已' : '未'}完成`)
      saLog.info('Service', `[盘后] 流程完成: tradeDate=${tradeDate} 耗时=${Date.now() - postMarketStart}ms 持仓评估=${positionEvaluations.length} 卖出建议=${positionEvaluations.filter((e) => e.sellRecommended).length} 风控事件=${riskEvents.length} 事实池=${factPoolUpdated ? '已更新' : '未更新'} LLM提取=${llmExtractionDone ? '已完成' : '未完成'}`)
      return result
    } catch (error) {
      logger.error(`[stock-analysis] 盘后流程异常: ${(error as Error).message}`, { error })
      saLog.error('Service', `[盘后] 流程异常: ${(error as Error).message} 耗时=${Date.now() - postMarketStart}ms`)
      await updateRuntimeStatus(stockAnalysisDir, {
        lastError: `盘后流程异常: ${(error as Error).message}`,
      }).catch(() => {})
      throw error
    } finally {
      currentPostMarketPromise = null
    }
  })()

  return currentPostMarketPromise
}

// ==================== G1.5: 晨间补充分析 ====================

/**
 * 晨间补充数据采集 + LLM 信息提取
 *
 * 在交易日 07:30 触发，补充前一个交易日夜间产生的新闻/公告等增量数据。
 * 只运行 Phase 4（数据采集）+ Phase 5（LLM 信息提取），不重复跑持仓评估和风控。
 * 采集结果合并到前一个交易日的事实池和 LLM 提取结果中，供当天盘前分析使用。
 */
export async function runMorningSupplementAnalysis(stockAnalysisDir: string): Promise<void> {
  await ensureStockAnalysisStructure(stockAnalysisDir)
  const startMs = Date.now()
  const today = todayDate()

  // 获取前一个交易日日期（晨间采集的数据归属到前一个交易日）
  const recentDates = getRecentTradeDates(today, 3)
  const previousTradeDate = recentDates.length >= 2 ? recentDates[1] : today
  logger.info(`[stock-analysis] [晨间补充] 开始: today=${today} targetTradeDate=${previousTradeDate}`, { module: 'StockAnalysis' })
  saLog.info('Service', `[晨间补充] 开始: today=${today} targetTradeDate=${previousTradeDate}`)

  try {
    // 读取缓存的行情和市场状态（使用前一个交易日收盘后缓存的数据）
    const quoteCache = await readStockAnalysisQuoteCache(stockAnalysisDir)
    const quotes = new Map((quoteCache?.quotes ?? []).map((q) => [q.code, q]))
    const marketState = await readStockAnalysisMarketState(stockAnalysisDir, previousTradeDate)

    if (quotes.size === 0) {
      logger.warn(`[stock-analysis] [晨间补充] 行情缓存为空，跳过数据采集`, { module: 'StockAnalysis' })
      saLog.warn('Service', `[晨间补充] 行情缓存为空，跳过`)
      return
    }

    // Phase 4: 数据采集（调用 data-agents 模块）
    let factPoolUpdated = false
    try {
      const { collectAllAgents } = await import('./data-agents')
      const agentConfig = await readDataAgentConfig(stockAnalysisDir)
      const incomingFactPool = await collectAllAgents(stockAnalysisDir, previousTradeDate, quotes, marketState!, agentConfig)

      // 读取已有的事实池，合并或直接保存
      const existingFactPool = await readFactPool(stockAnalysisDir, previousTradeDate)
      if (existingFactPool) {
        await mergeFactPool(stockAnalysisDir, existingFactPool, incomingFactPool)
        logger.info(`[stock-analysis] [晨间补充] 事实池已合并，新数据点: ${incomingFactPool.agentLogs.reduce((sum, log) => sum + log.dataPointCount, 0)}`)
      } else {
        await saveFactPool(stockAnalysisDir, incomingFactPool)
        logger.info(`[stock-analysis] [晨间补充] 事实池已保存（首次），数据点: ${incomingFactPool.agentLogs.reduce((sum, log) => sum + log.dataPointCount, 0)}`)
      }
      factPoolUpdated = true
    } catch (error) {
      logger.error(`[stock-analysis] [晨间补充] 数据采集失败: ${(error as Error).message}`)
      saLog.error('Service', `[晨间补充] 数据采集失败: ${(error as Error).message}`)
    }

    // Phase 5: LLM 信息提取
    if (factPoolUpdated) {
      try {
        const { runLLMExtraction } = await import('./llm-extraction')
        const factPool = await readFactPool(stockAnalysisDir, previousTradeDate)
        if (!factPool) {
          logger.warn(`[stock-analysis] [晨间补充] FactPool 为空，跳过 LLM 信息提取`)
        } else {
          const aiConfig = await readStockAnalysisAIConfig(stockAnalysisDir)
          const incomingExtraction = await runLLMExtraction(stockAnalysisDir, factPool, aiConfig)

          // 合并到已有的 LLM 提取结果
          const existingExtraction = await readLLMExtractionResult(stockAnalysisDir, previousTradeDate)
          if (existingExtraction) {
            const merged = await mergeLLMExtractionResult(stockAnalysisDir, existingExtraction, incomingExtraction)
            logger.info(`[stock-analysis] [晨间补充] LLM 信息提取已合并，公告事件: ${merged.announcements.length}，新闻影响: ${merged.newsImpacts.length}`)
          } else {
            await saveLLMExtractionResult(stockAnalysisDir, incomingExtraction)
            logger.info(`[stock-analysis] [晨间补充] LLM 信息提取已保存（首次），公告事件: ${incomingExtraction.announcements.length}，新闻影响: ${incomingExtraction.newsImpacts.length}`)
          }
        }
      } catch (error) {
        logger.error(`[stock-analysis] [晨间补充] LLM 信息提取失败: ${(error as Error).message}`)
        saLog.error('Service', `[晨间补充] LLM 信息提取失败: ${(error as Error).message}`)
      }
    }

    const elapsedMs = Date.now() - startMs
    logger.info(`[stock-analysis] [晨间补充] 完成: targetTradeDate=${previousTradeDate} 耗时=${elapsedMs}ms 事实池=${factPoolUpdated ? '已更新' : '未更新'}`, { module: 'StockAnalysis' })
    saLog.info('Service', `[晨间补充] 完成: targetTradeDate=${previousTradeDate} 耗时=${elapsedMs}ms 事实池=${factPoolUpdated ? '已更新' : '未更新'}`)
  } catch (error) {
    const elapsedMs = Date.now() - startMs
    logger.error(`[stock-analysis] [晨间补充] 流程异常: ${(error as Error).message}`, { error })
    saLog.error('Service', `[晨间补充] 流程异常: ${(error as Error).message} 耗时=${elapsedMs}ms`)
    throw error
  }
}

// ==================== S1: 盘中实时监控 ====================

const DEFAULT_INTRADAY_POLL_INTERVAL_MS = 60_000 // 默认 1 分钟轮询一次

/** 判断当前时间是否在交易时段内（09:30-11:30 或 13:00-15:00） — 委托给 trading-calendar */
function isWithinTradingHours(): boolean {
  return isWithinTradingHoursShared()
}

function assertWithinPostMarketWindow(startedAt: number, maxDurationMs: number, phase: string): void {
  const elapsedMs = Date.now() - startedAt
  if (elapsedMs <= maxDurationMs) {
    return
  }

  saLog.error('Service', `[盘后] 超时停止: phase=${phase} elapsed=${elapsedMs}ms budget=${maxDurationMs}ms`)
  throw new Error(`盘后流程超过 ${Math.round(maxDurationMs / 60_000)} 分钟窗口，已在${phase}阶段停止（已耗时 ${Math.round(elapsedMs / 60_000)} 分钟）`)
}

/**
 * 盘中监控单次轮询 — 检查所有持仓的止损/止盈/追踪止损触发情况
 */
export async function pollIntradayOnce(stockAnalysisDir: string): Promise<IntradayAlert[]> {
  const newAlerts: IntradayAlert[] = []

  try {
    const positions = await readStockAnalysisPositions(stockAnalysisDir)
    if (positions.length === 0) return newAlerts

    const config = await readStockAnalysisConfig(stockAnalysisDir)
    const codes = positions.map((p) => p.code)
    const quoteEnvelope = await getQuoteData(stockAnalysisDir, codes)
    const quotes = quoteEnvelope.data
    const monitorStatus = await readIntradayMonitorStatus(stockAnalysisDir)

    // 构建已有未确认告警的去重集合: "positionId-alertType"
    const existingAlerts = await readIntradayAlerts(stockAnalysisDir)
    const unackedAlertKeys = new Set(
      existingAlerts.filter((a) => !a.acknowledged).map((a) => `${a.positionId}-${a.alertType}`),
    )

    for (const position of positions) {
      const quote = quotes.get(position.code)
      if (!quote || quote.latestPrice <= 0) continue

      const currentPrice = quote.latestPrice
      const buyPrice = position.costPrice
      const pnlPercent = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0

      /** 去重推送告警: 同一持仓+同一类型的未确认告警只保留一条 */
      const pushAlertIfNew = (alertType: IntradayAlert['alertType'], triggerPrice: number, message: string) => {
        const key = `${position.id}-${alertType}`
        if (unackedAlertKeys.has(key)) return
        unackedAlertKeys.add(key) // 防止同一轮内重复
        newAlerts.push({
          id: `alert-${alertType}-${position.code}-${Date.now()}`,
          timestamp: nowIso(),
          positionId: position.id,
          code: position.code,
          name: position.name,
          alertType,
          currentPrice,
          triggerPrice,
          message,
          acknowledged: false,
        })
      }

      // 止损检查
      if (pnlPercent <= -config.stopLossPercent) {
        pushAlertIfNew('stop_loss', buyPrice * (1 - config.stopLossPercent / 100),
          `${position.name} 触发止损: 当前价 ${currentPrice}, 亏损 ${pnlPercent.toFixed(1)}% 超过止损线 ${config.stopLossPercent}%`)
      }

      // 止盈 1 检查
      if (pnlPercent >= config.takeProfitPercent1) {
        pushAlertIfNew('take_profit_1', buyPrice * (1 + config.takeProfitPercent1 / 100),
          `${position.name} 触发止盈1: 当前价 ${currentPrice}, 盈利 ${pnlPercent.toFixed(1)}% 达到止盈线 ${config.takeProfitPercent1}%`)
      }

      // 止盈 2 检查
      if (pnlPercent >= config.takeProfitPercent2) {
        pushAlertIfNew('take_profit_2', buyPrice * (1 + config.takeProfitPercent2 / 100),
          `${position.name} 触发止盈2: 当前价 ${currentPrice}, 盈利 ${pnlPercent.toFixed(1)}% 达到止盈线 ${config.takeProfitPercent2}%`)
      }

      // 最大持仓天数检查
      const holdDays = Math.ceil((Date.now() - new Date(position.openedAt).getTime()) / (1000 * 60 * 60 * 24))
      if (holdDays >= config.maxHoldDays) {
        pushAlertIfNew('max_hold_days', 0,
          `${position.name} 持仓已达 ${holdDays} 天，超过最大持仓天数 ${config.maxHoldDays} 天`)
      }

      // [MH2] 波动率飙升检测：盘中振幅超过阈值（6%）时告警
      if (quote.previousClose > 0 && quote.high > 0 && quote.low > 0) {
        const intradayAmplitude = (quote.high - quote.low) / quote.previousClose * 100
        const VOLATILITY_SPIKE_THRESHOLD = 6 // 盘中振幅超过6%视为异常波动
        if (intradayAmplitude > VOLATILITY_SPIKE_THRESHOLD) {
          pushAlertIfNew('volatility_spike', 0,
            `${position.name} 盘中振幅异常: ${intradayAmplitude.toFixed(1)}% (阈值 ${VOLATILITY_SPIKE_THRESHOLD}%)，当前价 ${currentPrice}`)
        }
      }
    }

    // [MH2] 板块异动检测：每5次轮询检查一次持仓股所在板块是否有多只股票跌停
    // 使用最近一次每日分析的信号数据获取板块信息，避免额外数据查询
    if (monitorStatus.pollCount % 5 === 0) {
      try {
        const latestSnapshot = await readLatestSnapshot(stockAnalysisDir)
        if (latestSnapshot) {
          // 从信号的 snapshot 中建立 code → sector 映射
          const codeSectorMap = new Map<string, string>()
          for (const signal of latestSnapshot.signals) {
            if (signal.snapshot?.sector) {
              codeSectorMap.set(signal.code, signal.snapshot.sector)
            }
          }
          // 获取持仓股的板块
          const positionSectors = new Map<string, string>()
          for (const position of positions) {
            const sector = codeSectorMap.get(position.code)
            if (sector) positionSectors.set(position.code, sector)
          }
          const sectorSet = new Set(positionSectors.values())
          if (sectorSet.size > 0) {
            // 统计同板块股票的跌停数（使用信号中已有的 snapshot 数据，不额外发请求）
            const sectorLimitDownCount = new Map<string, number>()
            for (const signal of latestSnapshot.signals) {
              if (!signal.snapshot?.sector || !sectorSet.has(signal.snapshot.sector)) continue
              // 用实时行情的 changePercent（如果有），否则用 snapshot 的
              const quote = quotes.get(signal.code)
              const changePercent = quote?.changePercent ?? signal.snapshot.changePercent
              const limitThreshold = (signal.code.startsWith('3') || signal.code.startsWith('68')) ? -19.5 : -9.5
              if (changePercent <= limitThreshold) {
                sectorLimitDownCount.set(signal.snapshot.sector, (sectorLimitDownCount.get(signal.snapshot.sector) ?? 0) + 1)
              }
            }
            // 3只以上跌停 → 告警
            for (const [sector, count] of sectorLimitDownCount) {
              if (count >= 3) {
                const affectedPositions = positions.filter((p) => positionSectors.get(p.code) === sector)
                for (const position of affectedPositions) {
                  const sectorKey = `${position.id}-sector_anomaly`
                  if (!unackedAlertKeys.has(sectorKey)) {
                    unackedAlertKeys.add(sectorKey)
                    newAlerts.push({
                      id: `alert-sector_anomaly-${position.code}-${Date.now()}`,
                      timestamp: nowIso(),
                      positionId: position.id,
                      code: position.code,
                      name: position.name,
                      alertType: 'sector_anomaly',
                      currentPrice: quotes.get(position.code)?.latestPrice ?? 0,
                      triggerPrice: 0,
                      message: `${position.name} 所在板块"${sector}"出现异动: ${count} 只股票跌停，建议关注`,
                      acknowledged: false,
                    })
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        logger.warn(`[stock-analysis] [盘中] 板块异动检测失败（不影响其他告警）: ${(error as Error).message}`)
      }
    }

    // 更新状态并保存（existingAlerts 已在上方读取用于去重）
    if (newAlerts.length > 0) {
      await saveIntradayAlerts(stockAnalysisDir, [...newAlerts, ...existingAlerts].slice(0, 500))
      logger.warn(`[stock-analysis] [盘中] 新增 ${newAlerts.length} 条告警`, { module: 'StockAnalysis' })
      saLog.info('Service', `[盘中] 新增告警 ${newAlerts.length} 条: ${newAlerts.map((a) => `${a.code}:${a.alertType}`).join(', ')}`)
    }

    await saveIntradayMonitorStatus(stockAnalysisDir, {
      ...monitorStatus,
      lastPollAt: nowIso(),
      pollCount: monitorStatus.pollCount + 1,
      alerts: [...newAlerts, ...monitorStatus.alerts].slice(0, 100),
    })

    saLog.debug('Service', `[盘中] 轮询#${monitorStatus.pollCount + 1}: 持仓=${positions.length} 有报价=${codes.filter((c) => quotes.has(c)).length} 新告警=${newAlerts.length}`)
  } catch (error) {
    logger.error(`[stock-analysis] [盘中] 轮询失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    saLog.error('Service', `[盘中] 轮询失败: ${(error as Error).message}`)
  }

  return newAlerts
}

/**
 * 启动盘中实时监控 — 开启定时器，交易时段内每分钟轮询
 */
export async function startIntradayMonitor(stockAnalysisDir: string): Promise<IntradayMonitorStatus> {
  // 如果已在运行，先停止再重启
  if (intradayMonitorTimer) {
    clearInterval(intradayMonitorTimer)
    intradayMonitorTimer = null
  }

  const status: IntradayMonitorStatus = {
    state: 'running',
    lastPollAt: null,
    pollCount: 0,
    alerts: [],
    startedAt: nowIso(),
  }
  await saveIntradayMonitorStatus(stockAnalysisDir, status)

  // 立即执行一次轮询
  await pollIntradayOnce(stockAnalysisDir)

  // 开启定时器
  intradayMonitorTimer = setInterval(() => {
    if (!isWithinTradingHours()) {
      logger.info('[stock-analysis] [盘中] 非交易时段，跳过轮询', { module: 'StockAnalysis' })
      return
    }
    void pollIntradayOnce(stockAnalysisDir)
  }, DEFAULT_INTRADAY_POLL_INTERVAL_MS)

  logger.info('[stock-analysis] [盘中] 监控已启动', { module: 'StockAnalysis' })
  return status
}

/**
 * 停止盘中实时监控
 */
export async function stopIntradayMonitor(stockAnalysisDir: string): Promise<IntradayMonitorStatus> {
  if (intradayMonitorTimer) {
    clearInterval(intradayMonitorTimer)
    intradayMonitorTimer = null
  }

  const status = await readIntradayMonitorStatus(stockAnalysisDir)
  const updatedStatus: IntradayMonitorStatus = {
    ...status,
    state: 'idle',
  }
  await saveIntradayMonitorStatus(stockAnalysisDir, updatedStatus)

  logger.info('[stock-analysis] [盘中] 监控已停止', { module: 'StockAnalysis' })
  return updatedStatus
}

/**
 * 获取盘中监控状态
 */
export async function getIntradayMonitorStatusData(stockAnalysisDir: string): Promise<IntradayMonitorStatus> {
  return readIntradayMonitorStatus(stockAnalysisDir)
}

/**
 * 获取盘中告警列表
 */
export async function getIntradayAlerts(stockAnalysisDir: string): Promise<IntradayAlert[]> {
  return readIntradayAlerts(stockAnalysisDir)
}

/**
 * 确认/关闭盘中告警
 */
export async function acknowledgeIntradayAlert(stockAnalysisDir: string, alertId: string): Promise<IntradayAlert | null> {
  const alerts = await readIntradayAlerts(stockAnalysisDir)
  const alert = alerts.find((a) => a.id === alertId)
  if (!alert) return null
  alert.acknowledged = true
  await saveIntradayAlerts(stockAnalysisDir, alerts)
  return alert
}

/**
 * 批量确认所有未读盘中告警
 */
export async function acknowledgeAllIntradayAlerts(stockAnalysisDir: string): Promise<number> {
  const alerts = await readIntradayAlerts(stockAnalysisDir)
  let count = 0
  for (const alert of alerts) {
    if (!alert.acknowledged) {
      alert.acknowledged = true
      count++
    }
  }
  if (count > 0) {
    await saveIntradayAlerts(stockAnalysisDir, alerts)
  }
  return count
}

function buildFallbackMarketState(tradeDate: string): StockAnalysisMarketState {
  return {
    asOfDate: tradeDate,
    trend: 'range_bound',
    volatility: 'normal_volatility',
    liquidity: 'normal_liquidity',
    sentiment: 'neutral',
    style: 'balanced',
    csi500Return20d: 0,
    annualizedVolatility20d: 0,
    averageTurnover20d: 0,
    risingRatio: 0,
  }
}

function assertPositionCanSellToday(position: StockAnalysisPosition) {
  const openedDate = position.openedAt.slice(0, 10)
  const tradeToday = todayDate()
  if (openedDate === tradeToday) {
    throw new Error(`A股 T+1 限制：${position.name}(${position.code}) 于 ${openedDate} 买入，当天不可卖出`)
  }
}

export async function getStockAnalysisOverview(stockAnalysisDir: string): Promise<StockAnalysisOverview> {
  await ensureStockAnalysisStructure(stockAnalysisDir)
  const runtimeStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)
  const snapshot = await readLatestSnapshot(stockAnalysisDir)
  const [positions, trades, watchLogsRaw, weeklySummaryStored, monthlySummaryStored, modelGroupsStored, performanceDashboardStored, config, reviews, riskEvents, learnedWeights, thresholdHistory, expertPerformance, allNotifications, intradayStatus] = await Promise.all([
    readStockAnalysisPositions(stockAnalysisDir),
    readStockAnalysisTrades(stockAnalysisDir),
    readStockAnalysisWatchLogs(stockAnalysisDir),
    readStockAnalysisWeeklySummary(stockAnalysisDir),
    readStockAnalysisMonthlySummary(stockAnalysisDir),
    readStockAnalysisModelGroups(stockAnalysisDir),
    readStockAnalysisPerformanceDashboard(stockAnalysisDir),
    readStockAnalysisConfig(stockAnalysisDir),
    readStockAnalysisReviews(stockAnalysisDir),
    readStockAnalysisRiskEvents(stockAnalysisDir),
    readStockAnalysisLearnedWeights(stockAnalysisDir),
    readStockAnalysisThresholdHistory(stockAnalysisDir),
    readStockAnalysisExpertPerformance(stockAnalysisDir),
    readAutoReportNotifications(stockAnalysisDir),
    readIntradayMonitorStatus(stockAnalysisDir),
  ])

  const watchLogs = await evaluateWatchLogOutcomes(stockAnalysisDir, watchLogsRaw)
  if (JSON.stringify(watchLogsRaw) !== JSON.stringify(watchLogs)) {
    await saveStockAnalysisWatchLogs(stockAnalysisDir, watchLogs)
  }

  const stockPool = await readStockAnalysisStockPool(stockAnalysisDir)
  const quoteEnvelope = positions.length > 0 ? await getQuoteData(stockAnalysisDir, positions.map((position) => position.code)) : { data: new Map<string, StockAnalysisSpotQuote>(), fetchedAt: runtimeStatus.quoteCacheAt, usedFallback: false, staleReasons: [] }

  const livePositions = positions.map((position) => {
    const quote = quoteEnvelope.data.get(position.code)
    if (!quote) return position
    return updatePositionRuntime(position, quote, config)
  })
  if (JSON.stringify(livePositions) !== JSON.stringify(positions)) {
    await saveStockAnalysisPositions(stockAnalysisDir, livePositions)
  }

  const tradeDate = snapshot?.tradeDate ?? runtimeStatus.latestSuccessfulSignalDate ?? runtimeStatus.latestSignalDate ?? todayDate()
  const performance = calculatePerformance(trades)
  const weeklySummary = weeklySummaryStored.length > 0 ? weeklySummaryStored : buildWeeklySummary(trades, watchLogs)
  const monthlySummary = monthlySummaryStored.length > 0 ? monthlySummaryStored : buildMonthlySummary(trades, watchLogs)
  const modelGroupPerformance = modelGroupsStored.length > 0 ? modelGroupsStored : await buildModelGroupPerformance(stockAnalysisDir, expertPerformance)
  const performanceDashboard = performanceDashboardStored ?? buildPerformanceDashboard(snapshot?.signals ?? [], watchLogs, trades, modelGroupPerformance, snapshot?.marketState ?? buildFallbackMarketState(tradeDate))
  const dataState = resolveDataState(runtimeStatus)
  const staleReasons = mergeStaleReasons(runtimeStatus.staleReasons, quoteEnvelope.staleReasons)

  const currentMarketState = snapshot?.marketState ?? buildFallbackMarketState(tradeDate)
  const currentRegime = getMarketRegime(currentMarketState)
  const baseFusionWeights = getFusionWeights(config, currentMarketState)
  const currentFusionWeights = getAdjustedFusionWeights(baseFusionWeights, learnedWeights)
  const marketLevelRisk = evaluateMarketLevelRisk(currentMarketState, config)

  // 持仓评估：从最近 daily run 获取缓存，或实时计算
  let positionEvaluations: StockAnalysisPositionEvaluation[] = []
  let swapSuggestions: StockAnalysisSwapSuggestion[] = []
  const latestDailyRun = snapshot?.dailyRun ?? null
  if (latestDailyRun?.positionEvaluations && latestDailyRun.positionEvaluations.length > 0) {
    positionEvaluations = latestDailyRun.positionEvaluations
    swapSuggestions = latestDailyRun.swapSuggestions ?? []
  } else if (livePositions.length > 0) {
    // [P2-18] Overview 实时评估降级为公式模拟是有意设计：
    // LLM 投票耗时 30-120 秒/股，不适合 overview 实时请求。
    // 如需 LLM 评估，请通过 daily run 或 post-market 触发（结果会缓存到 dailyRun.positionEvaluations）。
    const existingSignals = snapshot?.signals ?? []
    const signalMap = new Map(existingSignals.map((signal) => [signal.id, signal]))
    for (const position of livePositions) {
      const posQuote = quoteEnvelope.data.get(position.code)
      if (!posQuote || posQuote.latestPrice <= 0) continue
      try {
        const posHistoryEnvelope = await getStockHistoryData(stockAnalysisDir, position.code)
        if (posHistoryEnvelope.data.length < 30) continue
        const posCandidate: StockAnalysisWatchlistCandidate = {
          code: position.code,
          name: position.name,
          market: position.code.startsWith('6') ? 'sh' : position.code.startsWith('0') || position.code.startsWith('3') ? 'sz' : 'bj',
          exchange: position.code.startsWith('6') ? 'SSE' : 'SZSE',
        }
        const industryStrengthMap = buildIndustryStrengthMap(stockPool, quoteEnvelope.data)
        const posSnapshot = buildSnapshot(posCandidate, posQuote, posHistoryEnvelope.data, config, industryStrengthMap)
        const buySignal = position.sourceSignalId ? signalMap.get(position.sourceSignalId) : null
        const buyCompositeScore = buySignal?.compositeScore ?? 65
        const buyFinalScore = buySignal?.finalScore ?? buyCompositeScore
        positionEvaluations.push(await evaluatePositionScores(position, posSnapshot, currentMarketState, config, buyCompositeScore, buyFinalScore))
      } catch {
        // 评估失败时静默跳过，不影响 overview
      }
    }
    swapSuggestions = buildSwapSuggestions(positionEvaluations, snapshot?.signals ?? [], config.maxPositions, livePositions.length)
  }

  return {
    generatedAt: nowIso(),
    tradeDate,
    stockAnalysisDir,
    marketState: currentMarketState,
    marketRegime: currentRegime,
    fusionWeights: currentFusionWeights,
    stats: {
      stockPoolSize: stockPool.length,
      candidatePoolSize: snapshot?.signals.length ?? 0,
      passingSignals: (snapshot?.signals ?? []).filter((signal) => signal.action === 'buy' || signal.action === 'strong_buy').length,
      watchSignals: (snapshot?.signals ?? []).filter((signal) => signal.action === 'watch').length,
      openPositions: livePositions.length,
      tradeRecords: trades.length,
      cumulativeReturn: performance.cumulativeReturn,
      weeklyReturn: weeklySummary[0]?.weeklyReturn ?? 0,
      winRate: performance.winRate,
      maxDrawdown: weeklySummary[0]?.maxDrawdown ?? 0,
      maxPositions: config.maxPositions,
    },
    topSignals: snapshot?.signals.slice(0, 12) ?? [],
    positions: livePositions,
    recentTrades: trades.slice(0, 16),
    watchLogs: watchLogs.slice(0, 12),
    weeklySummary: weeklySummary.slice(0, 8),
    monthlySummary: monthlySummary.slice(0, 6),
    modelGroupPerformance,
    performanceDashboard,
    recentReviews: reviews.slice(0, 10),
    riskEvents: riskEvents.slice(0, 50),
    riskLimits: config.portfolioRiskLimits,
    positionEvaluations,
    swapSuggestions,
    notifications: allNotifications.filter((n) => !n.acknowledged).slice(0, 10),
    marketLevelRisk,
    learnedWeights,
    expertPerformance,
    thresholdHistory: thresholdHistory.adjustments.slice(0, 20),
    systemStatus: {
      lastRunAt: runtimeStatus.lastRunAt,
      lastSuccessAt: runtimeStatus.lastSuccessAt,
      lastError: runtimeStatus.lastError,
      stockPoolRefreshedAt: runtimeStatus.stockPoolRefreshedAt,
      latestSignalDate: runtimeStatus.latestSuccessfulSignalDate ?? runtimeStatus.latestSignalDate,
      runState: runtimeStatus.runState,
      currentRun: runtimeStatus.currentRun,
      dataState,
      staleReasons,
      quoteCacheAt: runtimeStatus.quoteCacheAt,
      indexHistoryCacheAt: runtimeStatus.indexHistoryCacheAt,
      isUsingFallback: runtimeStatus.isUsingFallback || quoteEnvelope.usedFallback,
      riskControl: runtimeStatus.riskControl ?? DEFAULT_RISK_CONTROL_STATE,
      postMarketAt: runtimeStatus.postMarketAt,
      intradayMonitor: {
        state: intradayStatus.state,
        lastPollAt: intradayStatus.lastPollAt,
        pollCount: intradayStatus.pollCount,
        activeAlertCount: intradayStatus.alerts.filter((a) => !a.acknowledged).length,
        startedAt: intradayStatus.startedAt,
      },
    },
  }
}

export async function getStockAnalysisSignals(stockAnalysisDir: string) {
  const snapshot = await readLatestSnapshot(stockAnalysisDir)
  return snapshot?.signals ?? []
}

/**
 * 跨日期查找信号 — 先查最新日期，找不到则遍历最近 7 天的信号文件
 * 解决 T+1 确认 T 日信号的问题
 */
async function findSignalByIdAcrossDates(
  stockAnalysisDir: string,
  signalId: string,
): Promise<{ signals: StockAnalysisSignal[]; signal: StockAnalysisSignal | null }> {
  // 优先从最新日期查找（最常见路径）
  const latestSignals = await getStockAnalysisSignals(stockAnalysisDir)
  const found = latestSignals.find((item) => item.id === signalId)
  if (found) return { signals: latestSignals, signal: found }

  // 最新日期找不到，遍历最近 7 个可用日期
  const dates = await getAvailableSignalDates(stockAnalysisDir)
  for (const date of dates.slice(0, 7)) {
    const signals = await readStockAnalysisSignals(stockAnalysisDir, date)
    const match = signals.find((item) => item.id === signalId)
    if (match) return { signals, signal: match }
  }

  return { signals: [], signal: null }
}

export async function getStockAnalysisPositions(stockAnalysisDir: string) {
  return readStockAnalysisPositions(stockAnalysisDir)
}

export async function getStockAnalysisTrades(stockAnalysisDir: string) {
  return readStockAnalysisTrades(stockAnalysisDir)
}

export async function getStockAnalysisWatchLogs(stockAnalysisDir: string) {
  return readStockAnalysisWatchLogs(stockAnalysisDir)
}

// ==================== 通知 + 月度报告 API 函数 ====================

export async function getStockAnalysisNotifications(stockAnalysisDir: string): Promise<AutoReportNotification[]> {
  return readAutoReportNotifications(stockAnalysisDir)
}

export async function acknowledgeStockAnalysisNotification(stockAnalysisDir: string, notificationId: string): Promise<AutoReportNotification | null> {
  const notifications = await readAutoReportNotifications(stockAnalysisDir)
  const target = notifications.find((n) => n.id === notificationId)
  if (!target) return null
  target.acknowledged = true
  await saveAutoReportNotifications(stockAnalysisDir, notifications)
  return target
}

export async function getStockAnalysisMonthlyReports(stockAnalysisDir: string): Promise<MonthlyReport[]> {
  return readMonthlyReports(stockAnalysisDir)
}

export async function getStockAnalysisHealthStatus(stockAnalysisDir: string): Promise<StockAnalysisHealthStatus> {
  const runtimeStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)
  const dataState = resolveDataState(runtimeStatus)
  return {
    ok: dataState !== 'empty' || runtimeStatus.runState === 'running',
    dataState,
    runState: runtimeStatus.runState,
    lastSuccessAt: runtimeStatus.lastSuccessAt,
    latestSignalDate: runtimeStatus.latestSuccessfulSignalDate ?? runtimeStatus.latestSignalDate,
    staleReasons: runtimeStatus.staleReasons,
    isUsingFallback: runtimeStatus.isUsingFallback,
  }
}

export async function confirmStockAnalysisSignal(
  stockAnalysisDir: string,
  signalId: string,
  request: StockAnalysisTradeRequest,
  options?: { bypassTradingHours?: boolean; autoBuy?: boolean },
) {
  const { signals, signal } = await findSignalByIdAcrossDates(stockAnalysisDir, signalId)
  if (!signal) return null

  // Fix 1: 已操作的信号不可重复操作
  if (signal.decisionSource !== 'system') {
    throw new Error(`该信号已被处理（${signal.decisionSource}），不可重复操作`)
  }

  const isBuySignal = signal.action === 'strong_buy' || signal.action === 'buy'
  const isWatchOrNone = signal.action === 'watch' || signal.action === 'none'
  const hasQuantity = request.quantity > 0

  // watch/none 确认 + 无数量 = 仅标记已阅，不创建持仓（不需要交易时间校验）
  if (isWatchOrNone && !hasQuantity) {
    const nextSignals = signals.map((item) =>
      item.id === signalId
        ? { ...item, decisionSource: 'user_confirmed' as DecisionSource, userDecisionNote: request.note?.trim() || null }
        : item,
    )
    await saveStockAnalysisSignals(stockAnalysisDir, signal.tradeDate, nextSignals)
    saLog.audit('Service', `signal acknowledged (${signal.action}): ${signal.code} tradeDate=${signal.tradeDate}`)
    return { confirmed: true, position: null }
  }

  // buy 信号必须有数量
  if (isBuySignal && !hasQuantity) {
    throw new Error('买入信号必须指定委托数量')
  }

  // Fix 2: 涉及实际买入的操作必须在交易时间内（自动买入流程可旁路）
  if (!options?.bypassTradingHours) {
    const tradingCheck = checkTradingAvailability()
    if (!tradingCheck.canTrade) {
      throw new Error(`当前不可交易：${tradingCheck.reason}`)
    }
  }

  // P0-3: 交易操作加互斥锁，防止并发竞态导致数据丢失
  return withFileLock(TRADING_LOCK_KEY, async () => {
    // 以下是创建持仓的流程（buy/strong_buy 或用户推翻 watch/none）
    const [positions, trades, config, blacklist, runtimeStatus] = await Promise.all([
      readStockAnalysisPositions(stockAnalysisDir),
      readStockAnalysisTrades(stockAnalysisDir),
      readStockAnalysisConfig(stockAnalysisDir),
      readStockAnalysisBlacklist(stockAnalysisDir),
      readStockAnalysisRuntimeStatus(stockAnalysisDir),
    ])

    if (positions.some((position) => position.code === signal.code)) {
      throw new Error('该标的已在持仓中')
    }
    if (positions.length >= config.maxPositions) {
      const vetoEvent: StockAnalysisRiskEvent = {
        id: `risk-veto_max_positions-${Date.now()}`,
        timestamp: nowIso(),
        eventType: 'veto_max_positions',
        reason: `持仓数量已达上限（${config.maxPositions}），否决买入 ${signal.name}(${signal.code})`,
        metrics: {},
        relatedCode: signal.code,
      }
      const existingEvents = await readStockAnalysisRiskEvents(stockAnalysisDir)
      await saveStockAnalysisRiskEvents(stockAnalysisDir, [vetoEvent, ...existingEvents])
      throw new Error(`持仓数量已达上限（${config.maxPositions}），请先平仓后再开新仓`)
    }
    const latestMarketState = await readStockAnalysisMarketState(stockAnalysisDir, todayDate())
    let effectiveMaxTotalPosition = config.maxTotalPosition ?? 1.0

    // P1-5: 检查市场级风控（极端熊市/流动性危机时阻止开仓）
    // 注：仓位比例压制（lowLiquidityGuardrail.maxPositionRatio）已按用户决策移除，
    // 仅保留 extremeBear/liquidityCrisis 的硬拦截，低流动性仅记录 info 日志
    if (latestMarketState) {
      const marketRisk = evaluateMarketLevelRisk(latestMarketState, config)
      if (marketRisk.extremeBearActive) {
        throw new Error('市场级风控：极端熊市状态，暂停所有新开仓')
      }
      if (marketRisk.liquidityCrisisActive) {
        saLog.audit('Service', `confirmSignal 市场级流动性危机拦截 ${signal.code}: ${describeMarketLiquidityState(latestMarketState, config)}`)
        throw new Error('市场级风控：流动性危机状态，暂停所有新开仓')
      }
      if (marketRisk.lowLiquidityActive) {
        saLog.info('Service', `confirmSignal 低流动性护栏生效 ${signal.code}: ${describeMarketLiquidityState(latestMarketState, config)} maxPositionRatio=${marketRisk.effectiveMaxPositionRatio}`)
      }
    }

    const requestedWeight = request.weight ?? signal.suggestedPosition
    const targetWeight = round(Math.max(0.01, requestedWeight), 4)
    if (targetWeight > config.maxSinglePosition) {
      throw new Error(`单只股票仓位不能超过 ${(config.maxSinglePosition * 100).toFixed(0)}%`)
    }

    // P1-6: 检查总仓位权重上限
    const totalWeight = positions.reduce((sum, p) => sum + p.weight, 0)
    if (totalWeight + targetWeight > effectiveMaxTotalPosition) {
      throw new Error(`总仓位权重已达上限（当前 ${round(totalWeight * 100)}%，新增 ${round(targetWeight * 100)}%，上限 ${round(effectiveMaxTotalPosition * 100)}%），请先减仓后再开新仓`)
    }
    if (blacklist.includes(signal.code)) {
      const vetoEvent: StockAnalysisRiskEvent = {
        id: `risk-veto_blacklist-${Date.now()}`,
        timestamp: nowIso(),
        eventType: 'veto_blacklist',
        reason: `标的 ${signal.code}（${signal.name}）在黑名单中，否决买入`,
        metrics: {},
        relatedCode: signal.code,
      }
      const existingEvents = await readStockAnalysisRiskEvents(stockAnalysisDir)
      await saveStockAnalysisRiskEvents(stockAnalysisDir, [vetoEvent, ...existingEvents])
      throw new Error(`标的 ${signal.code}（${signal.name}）在黑名单中，禁止买入`)
    }
    if (runtimeStatus.riskControl.paused) {
      const vetoEvent: StockAnalysisRiskEvent = {
        id: `risk-veto_paused-${Date.now()}`,
        timestamp: nowIso(),
        eventType: 'veto_paused',
        reason: `系统风控已暂停交易，否决买入 ${signal.name}(${signal.code})：${runtimeStatus.riskControl.pauseReason ?? '未知原因'}`,
        metrics: {},
        relatedCode: signal.code,
      }
      const existingEvents = await readStockAnalysisRiskEvents(stockAnalysisDir)
      await saveStockAnalysisRiskEvents(stockAnalysisDir, [vetoEvent, ...existingEvents])
      throw new Error(`系统风控已暂停交易：${runtimeStatus.riskControl.pauseReason ?? '未知原因'}`)
    }

    // Fix 3: 买入价格优先使用实时行情（与卖出对齐）
    let price = request.price
    if (price == null) {
      try {
        const quoteEnvelope = await getQuoteData(stockAnalysisDir, [signal.code])
        const quote = quoteEnvelope.data.get(signal.code)
        if (quote && quote.latestPrice > 0) {
          price = quote.latestPrice
          saLog.audit('Service', `confirmSignal: ${signal.code} 实时行情买入价=${price}`)
        }
      } catch (error) {
        saLog.audit('Service', `confirmSignal: ${signal.code} 获取实时行情失败: ${error instanceof Error ? error.message : '未知错误'}，回退到 signal.latestPrice=${signal.latestPrice}`)
      }
      // 兜底：实时行情拿不到时，优先用 signal.realtime（盘中 cron 写入的 T 日实时价），
      // 再兜底到 signal.latestPrice（注意：这个值来自信号生成时的 snapshot，早盘前生成=昨收价，可能偏离实盘）
      if (price == null || price <= 0) {
        if (signal.realtime && signal.realtime.latestPrice > 0) {
          price = signal.realtime.latestPrice
          saLog.audit('Service', `confirmSignal: ${signal.code} 回退到 signal.realtime.latestPrice=${price}（fetchedAt=${signal.realtime.fetchedAt}）`)
        } else {
          price = signal.latestPrice
        }
      }
    }
    const quantity = request.quantity
    const openedAt = nowIso()
    const sourceDecision: DecisionSource = options?.autoBuy
      ? 'system_auto_buy'
      : isWatchOrNone ? 'user_override' : 'user_confirmed'

    // P1-3: 基于实际买入价格重新计算止损止盈价（而非使用信号生成时的静态价格）
    const stopLossPrice = round(price * (1 - config.stopLossPercent / 100))
    const takeProfitPrice1 = round(price * (1 + config.takeProfitPercent1 / 100))
    const takeProfitPrice2 = round(price * (1 + config.takeProfitPercent2 / 100))

    const position: StockAnalysisPosition = {
      id: `position-${signal.code}-${Date.now()}`,
      code: signal.code,
      name: signal.name,
      openedAt,
      openDate: signal.tradeDate,
      sourceSignalId: signal.id,
      quantity,
      weight: targetWeight,
      costPrice: price,
      currentPrice: price,
      returnPercent: 0,
      holdingDays: 1,
      stopLossPrice,
      takeProfitPrice1,
      takeProfitPrice2,
      trailingStopEnabled: true,
      highestPriceSinceOpen: price,
      action: 'hold',
      actionReason: options?.autoBuy ? '系统自动开仓（强烈买入信号）' : isWatchOrNone ? '用户推翻观望，主动开仓' : '新开仓',
    }

    const trade: StockAnalysisTradeRecord = {
      id: `trade-${Date.now()}`,
      action: 'buy',
      code: signal.code,
      name: signal.name,
      tradeDate: openedAt,
      price,
      quantity,
      weight: targetWeight,
      sourceSignalId: signal.id,
      sourceDecision,
      note: request.note?.trim() || (options?.autoBuy ? '系统自动买入：根据强烈买入信号自动开仓' : isWatchOrNone ? '用户推翻观望建议，主动买入' : '用户确认执行 AI 策略'),
      relatedPositionId: position.id,
      pnlPercent: null,
      buyDate: openedAt,
      sellDate: null,
    }

    const nextSignals = signals.map((item) =>
      item.id === signalId
        ? { ...item, decisionSource: sourceDecision, userDecisionNote: request.note?.trim() || null }
        : item,
    )
    // P0-3: 串行写入（先写 trades 再写 positions），确保崩溃时不会出现"持仓已加但交易未记录"
    await saveStockAnalysisTrades(stockAnalysisDir, [trade, ...trades])
    await saveStockAnalysisPositions(stockAnalysisDir, [position, ...positions])
    await saveStockAnalysisSignals(stockAnalysisDir, signal.tradeDate, nextSignals)
    saLog.audit('Service', `signal confirmed: ${signal.code} qty=${quantity} price=${price} tradeDate=${signal.tradeDate} decision=${sourceDecision}`)
    return position
  })
}

export async function rejectStockAnalysisSignal(stockAnalysisDir: string, signalId: string, note: string, decisionSource: 'user_rejected' | 'user_ignored' | 'system_auto_ignore') {
  const { signals, signal } = await findSignalByIdAcrossDates(stockAnalysisDir, signalId)
  if (!signal) return null

  // Fix 1: 已操作的信号不可重复操作
  if (signal.decisionSource !== 'system') {
    throw new Error(`该信号已被处理（${signal.decisionSource}），不可重复操作`)
  }

  const nextSignals = signals.map((item) => item.id === signalId ? { ...item, decisionSource, userDecisionNote: note.trim() } : item)
  await saveStockAnalysisSignals(stockAnalysisDir, signal.tradeDate, nextSignals)
  saLog.audit('Service', `${decisionSource}: ${signal.code} tradeDate=${signal.tradeDate} note=${note.trim()}`)
  return nextSignals.find((item) => item.id === signalId) ?? null
}

/**
 * v1.30.2: 刷新指定交易日 signals 文件里每条信号的 realtime 字段（盘中实时行情）
 *
 * 背景：signals 文件由盘前 08:05 cron 生成并落盘，此时市场未开盘，snapshot 的 latestPrice/
 * changePercent/open/high/low 只能是昨收数据，一整天不会自动更新。前端如果直接读 snapshot
 * 展示，用户看到的将是「昨天的收盘价」当作「今天的实时价」——与官方行情严重不符。
 *
 * 方案：保持 snapshot 不变（作为信号生成时的历史基准，用于策略溯源、支撑压力位等计算），
 * 新增 realtime 字段承载盘中实时行情；本函数由 09:30-15:00 每 5 分钟 cron 调用。
 *
 * 失败容错：数据源全挂时保留旧 realtime（不清空），只写 saLog 便于排查。
 *
 * @param tradeDate 指定交易日（YYYY-MM-DD），默认今日
 * @returns 刷新统计
 */
export async function refreshSignalsRealtime(
  stockAnalysisDir: string,
  tradeDate?: string,
): Promise<{ tradeDate: string; updated: number; skipped: number; fetchedAt: string | null }> {
  const targetDate = tradeDate || todayDate()
  const signals = await readStockAnalysisSignals(stockAnalysisDir, targetDate)
  if (!signals || signals.length === 0) {
    saLog.audit('RefreshRealtime', `no signals for ${targetDate}`)
    return { tradeDate: targetDate, updated: 0, skipped: 0, fetchedAt: null }
  }

  const codes = signals.map((s) => s.code)
  let quoteMap: Map<string, StockAnalysisSpotQuote>
  try {
    const envelope = await getQuoteData(stockAnalysisDir, codes)
    quoteMap = envelope.data
  } catch (error) {
    saLog.error('RefreshRealtime', `getQuoteData 失败 tradeDate=${targetDate} error=${error instanceof Error ? error.message : '未知'}`)
    return { tradeDate: targetDate, updated: 0, skipped: signals.length, fetchedAt: null }
  }

  const fetchedAt = nowIso()
  let updated = 0
  let skipped = 0
  const nextSignals = signals.map((signal) => {
    const quote = quoteMap.get(signal.code)
    if (!quote || !Number.isFinite(quote.latestPrice) || quote.latestPrice <= 0) {
      skipped += 1
      return signal
    }
    updated += 1
    return {
      ...signal,
      realtime: {
        latestPrice: quote.latestPrice,
        changePercent: quote.changePercent,
        open: quote.open,
        high: quote.high,
        low: quote.low,
        previousClose: quote.previousClose,
        fetchedAt,
      },
    }
  })

  await saveStockAnalysisSignals(stockAnalysisDir, targetDate, nextSignals)
  saLog.audit('RefreshRealtime', `tradeDate=${targetDate} updated=${updated} skipped=${skipped} fetchedAt=${fetchedAt}`)
  return { tradeDate: targetDate, updated, skipped, fetchedAt }
}

/**
 * 自动决策：对今日信号执行自动买入 + 自动忽略
 *
 * 规则：
 *   - strong_buy 信号：按推荐顺序自动买入，单只 30% 仓位，总仓位上限 100%
 *     - 已持仓的标的跳过
 *     - 剩余仓位不足 30% 时，按剩余仓位买入
 *     - 剩余仓位 = 0 后停止
 *   - buy / watch 信号：标记为 system_auto_ignore，备注「买入信号不够强烈，条件满足度不够高」
 *   - 其他信号（sell / hold / none / 已被人工处理过的）：跳过不动
 *
 * @param tradeDate 指定交易日（YYYY-MM-DD），默认 today
 */
export async function runAutoDecisions(stockAnalysisDir: string, tradeDate?: string) {
  const targetDate = tradeDate || todayDate()
  const dailySignals = await readStockAnalysisSignals(stockAnalysisDir, targetDate)
  if (!dailySignals || dailySignals.length === 0) {
    saLog.audit('AutoDecisions', `no signals for ${targetDate}`)
    return {
      tradeDate: targetDate,
      totalSignals: 0,
      autoBoughtCount: 0,
      autoIgnoredCount: 0,
      skippedCount: 0,
      autoBought: [] as Array<{ code: string; name: string; weight: number; price: number }>,
      autoIgnored: [] as Array<{ code: string; name: string; action: string }>,
      skipped: [] as Array<{ code: string; name: string; reason: string }>,
    }
  }

  // strong_buy 按 finalScore 降序排（推荐顺序）
  const strongBuySignals = dailySignals
    .filter((s) => s.action === 'strong_buy' && s.decisionSource === 'system')
    .sort((a, b) => b.finalScore - a.finalScore)

  // buy + watch 待忽略
  const ignoreCandidates = dailySignals.filter(
    (s) => (s.action === 'buy' || s.action === 'watch') && s.decisionSource === 'system',
  )

  const autoBought: Array<{ code: string; name: string; weight: number; price: number }> = []
  const skipped: Array<{ code: string; name: string; reason: string }> = []
  const SINGLE_WEIGHT = 0.3
  const TOTAL_CAP = 1.0

  // 自动买入循环
  for (const signal of strongBuySignals) {
    // 每次循环都重新读持仓（前一次已保存）
    const positions = await readStockAnalysisPositions(stockAnalysisDir)
    if (positions.some((p) => p.code === signal.code)) {
      skipped.push({ code: signal.code, name: signal.name, reason: '已持仓，跳过' })
      continue
    }
    const totalWeight = positions.reduce((sum, p) => sum + p.weight, 0)
    const remaining = round(TOTAL_CAP - totalWeight, 4)
    if (remaining <= 0.001) {
      skipped.push({ code: signal.code, name: signal.name, reason: '总仓位已满' })
      continue
    }
    const targetWeight = round(Math.min(SINGLE_WEIGHT, remaining), 4)
    // quantity 占位（不算钱不算股数，仅满足后端必填校验）：用 1 股最小占位
    // 注：后续如果接真实交易，这里需要换成 weight × 总资产 ÷ price 的真实股数
    const placeholderQty = 1
    try {
      const result = await confirmStockAnalysisSignal(
        stockAnalysisDir,
        signal.id,
        { quantity: placeholderQty, weight: targetWeight, note: `系统自动买入 · 仓位 ${(targetWeight * 100).toFixed(0)}%` },
        { bypassTradingHours: true, autoBuy: true },
      )
      if (result && 'code' in result) {
        autoBought.push({ code: result.code, name: result.name, weight: result.weight, price: result.costPrice })
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误'
      saLog.audit('AutoDecisions', `auto-buy failed ${signal.code}: ${reason}`)
      skipped.push({ code: signal.code, name: signal.name, reason })
    }
  }

  // 自动忽略循环
  const autoIgnored: Array<{ code: string; name: string; action: string }> = []
  const IGNORE_NOTE = '买入信号不够强烈，条件满足度不够高'
  for (const signal of ignoreCandidates) {
    try {
      await rejectStockAnalysisSignal(stockAnalysisDir, signal.id, IGNORE_NOTE, 'system_auto_ignore')
      autoIgnored.push({ code: signal.code, name: signal.name, action: signal.action })
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误'
      saLog.audit('AutoDecisions', `auto-ignore failed ${signal.code}: ${reason}`)
      skipped.push({ code: signal.code, name: signal.name, reason })
    }
  }

  saLog.audit(
    'AutoDecisions',
    `tradeDate=${targetDate} bought=${autoBought.length} ignored=${autoIgnored.length} skipped=${skipped.length}`,
  )

  return {
    tradeDate: targetDate,
    totalSignals: dailySignals.length,
    autoBoughtCount: autoBought.length,
    autoIgnoredCount: autoIgnored.length,
    skippedCount: skipped.length,
    autoBought,
    autoIgnored,
    skipped,
  }
}

export async function closeStockAnalysisPosition(stockAnalysisDir: string, positionId: string, request: StockAnalysisTradeRequest) {
  // Fix 2: 平仓必须在交易时间内
  const tradingCheck = checkTradingAvailability()
  if (!tradingCheck.canTrade) {
    throw new Error(`当前不可交易：${tradingCheck.reason}`)
  }

  // P0-3: 交易操作加互斥锁
  return withFileLock(TRADING_LOCK_KEY, async () => {
    const positions = await readStockAnalysisPositions(stockAnalysisDir)
    const position = positions.find((item) => item.id === positionId)
    if (!position) return null
    assertPositionCanSellToday(position)
    const [trades, config, runtimeStatus, existingReviews] = await Promise.all([
      readStockAnalysisTrades(stockAnalysisDir),
      readStockAnalysisConfig(stockAnalysisDir),
      readStockAnalysisRuntimeStatus(stockAnalysisDir),
      readStockAnalysisReviews(stockAnalysisDir),
    ])

    // BUG-1 fix: 当前端未传 price 时，主动获取实时行情作为卖出价
    let price = request.price
    if (price == null) {
      try {
        const quoteEnvelope = await getQuoteData(stockAnalysisDir, [position.code])
        const quote = quoteEnvelope.data.get(position.code)
        if (quote && quote.latestPrice > 0) {
          price = quote.latestPrice
          saLog.audit('Service', `closePosition: ${position.code} 实时行情价=${price}`)
        }
      } catch (error) {
        saLog.audit('Service', `closePosition: ${position.code} 获取实时行情失败: ${error instanceof Error ? error.message : '未知错误'}，回退到 currentPrice=${position.currentPrice}`)
      }
      if (price == null || price <= 0) {
        price = position.currentPrice
      }
    }
    const quantity = request.quantity
    const pnlPercent = round(safeDivide(price - position.costPrice, position.costPrice) * 100)
    const sellReason = request.note?.trim() || `用户手动平仓 ${pnlPercent > 0 ? '盈利' : '亏损'} ${pnlPercent}%`
    const soldAt = nowIso()
    const trade: StockAnalysisTradeRecord = {
      id: `trade-${Date.now()}`,
      action: 'sell',
      code: position.code,
      name: position.name,
      tradeDate: soldAt,
      price,
      quantity,
      weight: position.weight,
      sourceSignalId: position.sourceSignalId,
      sourceDecision: 'user_confirmed',
      note: sellReason,
      relatedPositionId: position.id,
      pnlPercent,
      buyDate: position.openedAt,
      sellDate: soldAt,
    }

    const updatedTrades = [trade, ...trades]
    const review = await buildReviewRecord(stockAnalysisDir, position, price, sellReason)
    const updatedReviews = [review, ...existingReviews].slice(0, 100)
    const riskResult = assessPortfolioRisk(updatedTrades, config.portfolioRiskLimits, runtimeStatus.riskControl)

    // P0-3: 串行写入关键数据（先 trades 再 positions）
    await saveStockAnalysisTrades(stockAnalysisDir, updatedTrades)
    await saveStockAnalysisPositions(stockAnalysisDir, positions.filter((item) => item.id !== positionId))
    await saveStockAnalysisReviews(stockAnalysisDir, updatedReviews)
    await saveStockAnalysisRuntimeStatus(stockAnalysisDir, { ...runtimeStatus, riskControl: riskResult.state })

    if (riskResult.newEvents.length > 0) {
      const existingEvents = await readStockAnalysisRiskEvents(stockAnalysisDir)
      await saveStockAnalysisRiskEvents(stockAnalysisDir, [...riskResult.newEvents, ...existingEvents])
    }

    // Phase 6: 更新专家个体表现追踪（异步但不阻塞平仓结果）
    updateExpertPerformance(stockAnalysisDir, position, pnlPercent).catch((error) => {
      logger.error(`[stock-analysis] updateExpertPerformance 失败: ${error instanceof Error ? error.message : '未知错误'}`, { module: 'StockAnalysis' })
    })

    saLog.audit('Service', `position closed: ${position.code} qty=${quantity} price=${price} pnl=${pnlPercent}% | review=${review.id}`)
    return trade
  })
}

/** 减仓操作 — 卖出部分数量，保留剩余持仓 */
export async function reduceStockAnalysisPosition(stockAnalysisDir: string, positionId: string, request: StockAnalysisTradeRequest) {
  // Fix 2: 减仓必须在交易时间内
  const tradingCheck = checkTradingAvailability()
  if (!tradingCheck.canTrade) {
    throw new Error(`当前不可交易：${tradingCheck.reason}`)
  }

  // P0-3: 交易操作加互斥锁
  return withFileLock(TRADING_LOCK_KEY, async () => {
    const positions = await readStockAnalysisPositions(stockAnalysisDir)
    const position = positions.find((item) => item.id === positionId)
    if (!position) return null
    assertPositionCanSellToday(position)

    const sellQuantity = request.quantity
    if (sellQuantity >= position.quantity) {
      throw new Error(`减仓数量 (${sellQuantity}) 必须小于持仓数量 (${position.quantity})，如需全部卖出请使用平仓`)
    }

    const [trades, runtimeStatus] = await Promise.all([
      readStockAnalysisTrades(stockAnalysisDir),
      readStockAnalysisRuntimeStatus(stockAnalysisDir),
    ])

    // 获取实时价格
    let price = request.price
    if (price == null) {
      try {
        const quoteEnvelope = await getQuoteData(stockAnalysisDir, [position.code])
        const quote = quoteEnvelope.data.get(position.code)
        if (quote && quote.latestPrice > 0) {
          price = quote.latestPrice
        }
      } catch { /* fallback to position.currentPrice */ }
      if (price == null || price <= 0) {
        price = position.currentPrice
      }
    }

    const pnlPercent = round(safeDivide(price - position.costPrice, position.costPrice) * 100)
    const remainingQuantity = position.quantity - sellQuantity
    const remainingWeight = round(position.weight * (remainingQuantity / position.quantity), 4)
    const soldAt = nowIso()

    const trade: StockAnalysisTradeRecord = {
      id: `trade-${Date.now()}`,
      action: 'sell',
      code: position.code,
      name: position.name,
      tradeDate: soldAt,
      price,
      quantity: sellQuantity,
      weight: round(position.weight - remainingWeight, 4),
      sourceSignalId: position.sourceSignalId,
      sourceDecision: 'user_confirmed',
      note: request.note?.trim() || `用户减仓 ${sellQuantity}股 (剩余${remainingQuantity}股) ${pnlPercent > 0 ? '盈利' : '亏损'} ${pnlPercent}%`,
      relatedPositionId: position.id,
      pnlPercent,
      buyDate: position.openedAt,
      sellDate: soldAt,
    }

    const updatedPosition: StockAnalysisPosition = {
      ...position,
      quantity: remainingQuantity,
      weight: remainingWeight,
      currentPrice: price,
      returnPercent: pnlPercent,
      action: 'reduce',
      actionReason: `减仓 ${sellQuantity}股 @ ${price.toFixed(2)}`,
    }

    const updatedPositions = positions.map((item) => item.id === positionId ? updatedPosition : item)
    const updatedTrades = [trade, ...trades]

    const config = await readStockAnalysisConfig(stockAnalysisDir)
    const riskResult = assessPortfolioRisk(updatedTrades, config.portfolioRiskLimits, runtimeStatus.riskControl)

    // P0-3: 串行写入关键数据
    await saveStockAnalysisTrades(stockAnalysisDir, updatedTrades)
    await saveStockAnalysisPositions(stockAnalysisDir, updatedPositions)
    await saveStockAnalysisRuntimeStatus(stockAnalysisDir, { ...runtimeStatus, riskControl: riskResult.state })

    if (riskResult.newEvents.length > 0) {
      const existingEvents = await readStockAnalysisRiskEvents(stockAnalysisDir)
      await saveStockAnalysisRiskEvents(stockAnalysisDir, [...riskResult.newEvents, ...existingEvents])
    }

    saLog.audit('Service', `position reduced: ${position.code} sold=${sellQuantity} remaining=${remainingQuantity} price=${price} pnl=${pnlPercent}%`)
    return trade
  })
}

/**
 * 忽略持仓的风控动作（止损/止盈/减仓/到期评估）。
 * 将 position.action 重置为 'hold'，下次 updatePositionRuntime 获取实时行情后会重新评估。
 * 不需要交易时间限制 —— 忽略操作不涉及实际交易。
 */
export async function dismissPositionAction(stockAnalysisDir: string, positionId: string, note?: string): Promise<StockAnalysisPosition | null> {
  const positions = await readStockAnalysisPositions(stockAnalysisDir)
  const position = positions.find((item) => item.id === positionId)
  if (!position) return null

  if (position.action === 'hold') {
    // 已经是 hold 状态，无需忽略
    return position
  }

  const previousAction = position.action
  const previousReason = position.actionReason
  const updatedPosition: StockAnalysisPosition = {
    ...position,
    action: 'hold',
    actionReason: `用户忽略了${previousAction === 'stop_loss' ? '止损' : previousAction === 'take_profit' ? '止盈' : previousAction === 'reduce' ? '减仓' : '评估'}提醒`,
    dismissedAction: previousAction,
  }

  const updatedPositions = positions.map((item) => item.id === positionId ? updatedPosition : item)
  await saveStockAnalysisPositions(stockAnalysisDir, updatedPositions)
  saLog.audit('Service', `position action dismissed: ${position.code} ${previousAction}(${previousReason}) → hold | note=${note?.trim() || '无'}`)
  return updatedPosition
}

export async function refreshStockAnalysisStockPool(stockAnalysisDir: string) {
  const stockPoolEnvelope = await getStockPoolData(stockAnalysisDir, true)
  await updateRuntimeStatus(stockAnalysisDir, {
    stockPoolRefreshedAt: stockPoolEnvelope.fetchedAt,
    isUsingFallback: stockPoolEnvelope.usedFallback,
    staleReasons: stockPoolEnvelope.staleReasons,
  })
  saLog.audit('Service', `stock pool refreshed: ${stockPoolEnvelope.data.length}, fallback=${stockPoolEnvelope.usedFallback}`)
  return { count: stockPoolEnvelope.data.length }
}

export async function getStockAnalysisConfig(stockAnalysisDir: string) {
  return readStockAnalysisConfig(stockAnalysisDir)
}

export async function getStockAnalysisRuntimeStatusData(stockAnalysisDir: string) {
  return readStockAnalysisRuntimeStatus(stockAnalysisDir)
}

export async function bootstrapStockAnalysis(stockAnalysisDir: string) {
  await ensureStockAnalysisStructure(stockAnalysisDir)
  await initSALogger(stockAnalysisDir)
  saLog.info('Service', 'Bootstrap 开始')
  // [P2-20] 启动时清理残留的 .tmp 文件
  void cleanupAllStaleTemporaryFiles(stockAnalysisDir).catch(() => {})
  const snapshot = await readLatestSnapshot(stockAnalysisDir)
  const runtimeStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)

  // P1-13: 检测残留的 running 状态并重置（进程异常终止后 runState 可能卡在 running）
  if (runtimeStatus.runState === 'running') {
    const startedAt = runtimeStatus.lastRunAt
    const staleThresholdMs = 30 * 60 * 1000 // 30 分钟
    const isStale = !startedAt || (Date.now() - new Date(startedAt).getTime()) > staleThresholdMs
    if (isStale) {
      logger.warn(`[stock-analysis] bootstrap: 检测到残留的 running 状态（startedAt=${startedAt}），重置为 idle`, { module: 'StockAnalysis' })
      saLog.warn('Service', `Bootstrap: 检测到残留 running 状态 startedAt=${startedAt}，重置为 idle`)
      await atomicUpdateRuntimeStatus(stockAnalysisDir, (s) => ({
        ...s,
        runState: 'idle' as const,
      }))
    }
  }

  // P1-14: 检测残留的盘中监控状态并恢复（如果当前是交易时段且有持仓）
  try {
    const monitorStatus = await readIntradayMonitorStatus(stockAnalysisDir)
    if (monitorStatus.state === 'running' && !intradayMonitorTimer) {
      const positions = await readStockAnalysisPositions(stockAnalysisDir)
      if (positions.length > 0 && isWithinTradingHoursShared()) {
        logger.info('[stock-analysis] bootstrap: 恢复盘中监控（上次进程异常退出）', { module: 'StockAnalysis' })
        saLog.info('Service', `Bootstrap: 恢复盘中监控，持仓=${positions.length}`)
        void startIntradayMonitor(stockAnalysisDir).catch((error) => {
          logger.error(`[stock-analysis] bootstrap 恢复盘中监控失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
        })
      } else {
        // 不在交易时段或无持仓，重置状态
        await saveIntradayMonitorStatus(stockAnalysisDir, { ...monitorStatus, state: 'idle' })
      }
    }
  } catch (error) {
    logger.warn(`[stock-analysis] bootstrap: 检查盘中监控状态失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
  }

  const refreshedStatus = await readStockAnalysisRuntimeStatus(stockAnalysisDir)
  if (!snapshot && refreshedStatus.runState !== 'running') {
    saLog.info('Service', 'Bootstrap: 无现有快照，触发首次日常运行')
    void runStockAnalysisDaily(stockAnalysisDir).catch((error) => {
      logger.error(`AI 炒股 bootstrap 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    })
  }
  saLog.info('Service', `Bootstrap 完成: hasSnapshot=${!!snapshot} runState=${refreshedStatus.runState}`)
}

// ==================== Phase 5: AI 配置管理 ====================

/** 分析层元数据：中文名称、默认专家数、默认立场分配 */
const LAYER_META: Record<StockAnalysisExpertLayer, { name: string; expertCount: number }> = {
  industry_chain: { name: '产业链分析', expertCount: 3 },
  company_fundamentals: { name: '公司基本面', expertCount: 4 },
  sell_side_research: { name: '卖方研报', expertCount: 3 },
  world_power: { name: '世界格局', expertCount: 3 },
  global_macro: { name: '全球宏观', expertCount: 3 },
  risk_governance: { name: '风控治理', expertCount: 3 },
  sentiment: { name: '情绪面', expertCount: 4 },
  market_trading: { name: '市场交易', expertCount: 3 },
  buy_side: { name: '买方视角', expertCount: 4 },
  rule_functions: { name: '规则函数', expertCount: 15 },
}

const RULE_FUNCTION_NAMES = [
  '5日动量', '20日动量', '60日动量',
  'RSI均值回归', '布林带均值回归', 'MA60偏离均值回归',
  '量比评分', '换手率评分', '资金流向评分',
  'ATR波动率', '历史波动率分位',
  '板块相对动量', '板块排名变化',
  '组合风险', '个股风险',
]

/**
 * 30 个 LLM 专家的独立定义，每个专家具有唯一的角色、分析框架和关注维度。
 * 设计原则：同层内专家视角互补，不同层间专家视角正交。
 */
interface ExpertSeed {
  name: string
  layer: StockAnalysisExpertLayer
  stance: StockAnalysisExpertStance
  infoSubset: string[]
  systemPrompt: string
}

const LLM_EXPERT_SEEDS: ExpertSeed[] = [
  // ═══════════════ 产业链分析 (3) ═══════════════
  {
    name: '上游供给分析师',
    layer: 'industry_chain',
    stance: 'neutral',
    infoSubset: ['basic', 'price', 'market'],
    systemPrompt: '你是一位专注于产业链上游的分析师。你的核心能力是判断原材料成本和供给侧变化对公司利润的影响。\n\n分析框架：\n1. 根据板块判断该公司所处产业链位置\n2. 评估上游原材料/能源价格走势对该公司成本端的压力或利好\n3. 结合市值和换手率判断市场对供给侧变化的定价是否充分\n4. 如果上游涨价且公司无法转嫁成本，偏空；如果上游降价释放利润空间，偏多\n\n决策风格：重视成本端驱动力，对利润率变化极敏感。',
  },
  {
    name: '下游需求研究员',
    layer: 'industry_chain',
    stance: 'bullish',
    infoSubset: ['basic', 'price', 'momentum', 'volume'],
    systemPrompt: '你是一位专注于终端需求和消费趋势的研究员。你擅长通过量价关系推断下游需求的真实变化。\n\n分析框架：\n1. 成交额和换手率反映市场对需求前景的交易热度\n2. 20日收益和量比配合判断是否有需求驱动的趋势性行情\n3. 放量上涨暗示下游需求预期改善，缩量下跌可能只是短期调整\n4. 关注板块属性——消费/科技/周期板块的需求逻辑不同\n\n决策风格：倾向乐观看待需求复苏信号，但会诚实面对需求萎缩的证据。',
  },
  {
    name: '产业政策追踪专家',
    layer: 'industry_chain',
    stance: 'bearish',
    infoSubset: ['basic', 'market', 'volatility'],
    systemPrompt: '你是一位产业政策和监管风险专家。你关注政策变化对行业格局的冲击和重构。\n\n分析框架：\n1. 根据板块判断该行业受政策影响的敏感度（高：新能源/地产/金融/教育/医药，低：消费/制造）\n2. 高波动率 + 熊市趋势可能暗示政策不确定性正在被定价\n3. 市场情绪悲观时，政策风险的杀伤力被放大；乐观时容易被忽视\n4. 如果行业处于政策紧缩周期且市场尚未充分反映，偏空\n\n决策风格：谨慎保守，对政策尾部风险保持警惕。不确定时倾向中性或看空。',
  },

  // ═══════════════ 公司基本面 (4) ═══════════════
  {
    name: '盈利质量审计师',
    layer: 'company_fundamentals',
    stance: 'bearish',
    infoSubset: ['basic', 'price', 'volatility'],
    systemPrompt: '你是一位挑剔的财务审计师，专门甄别盈利质量和财务粉饰风险。\n\n分析框架：\n1. 高波动率 + 高振幅 可能暗示市场对盈利可持续性存疑\n2. 连续下跌多日通常反映基本面预期恶化而非技术性调整\n3. 大市值公司的异常下跌更值得警惕（机构可能提前获知负面信息）\n4. 如果 60 日收益大幅为负但 5 日反弹，警惕"死猫跳"\n\n决策风格：宁可错过机会也不踩雷。对任何可能的财务风险信号都保持高度警觉。',
  },
  {
    name: '成长性评估师',
    layer: 'company_fundamentals',
    stance: 'bullish',
    infoSubset: ['basic', 'price', 'momentum'],
    systemPrompt: '你是一位专注于企业成长潜力的分析师，善于在数据中发现成长股的早期信号。\n\n分析框架：\n1. 20 日和 60 日正向动量是成长预期改善的基本前提\n2. 量价齐升（放量上涨）是成长股被重新定价的典型特征\n3. 中小市值 + 高换手率 可能代表成长股获得更多关注\n4. 站上 MA20 和 MA60 表明中期趋势转好，支持成长逻辑\n\n决策风格：积极寻找成长机会，但要求趋势和量能的双重确认。不追逐没有量能支撑的反弹。',
  },
  {
    name: '估值锚定专家',
    layer: 'company_fundamentals',
    stance: 'neutral',
    infoSubset: ['basic', 'price', 'ma'],
    systemPrompt: '你是一位价值投资风格的估值专家，用均线偏离度作为估值锚定的代理指标。\n\n分析框架：\n1. 当前价相对 MA60 的偏离度反映中期估值水平——偏离过大意味着高估或低估\n2. MA20 和 MA60 的相对位置反映估值趋势：MA20 > MA60 是估值上行趋势\n3. 20 日价格位置接近 0% 表示处于近期低位，可能存在估值修复机会\n4. 20 日价格位置接近 100% 需要警惕短期高估\n\n决策风格：严格的均值回归思维。高估时看空，低估时看多，合理区间内保持中性。',
  },
  {
    name: '行业竞争格局分析师',
    layer: 'company_fundamentals',
    stance: 'neutral',
    infoSubset: ['basic', 'market', 'volume'],
    systemPrompt: '你是一位研究竞争格局和市场地位的行业分析师。\n\n分析框架：\n1. 大市值通常对应行业龙头——龙头在熊市中更抗跌，牛市中弹性可能较弱\n2. 高换手率可能代表筹码松动（利空）或新资金入场（利多），需结合涨跌方向判断\n3. 牛市趋势中龙头股值得配置，熊市趋势中龙头的防御价值更高\n4. 板块内个股走势与大盘的相关性反映竞争地位——独立走强的个股可能具备独特竞争优势\n\n决策风格：关注相对优势而非绝对涨跌。只有具备明确竞争优势的标的才值得看多。',
  },

  // ═══════════════ 卖方研报 (3) ═══════════════
  {
    name: '目标价位测算师',
    layer: 'sell_side_research',
    stance: 'neutral',
    infoSubset: ['basic', 'price', 'ma', 'volatility'],
    systemPrompt: '你是一位量化导向的卖方分析师，擅长基于技术面推算合理目标价位区间。\n\n分析框架：\n1. MA5/MA20/MA60 构成多层支撑压力位——股价在哪一层之上决定趋势强度\n2. 20 日波动率决定目标价位的上下浮动幅度——高波动放宽区间，低波动收窄\n3. 20 日价格位置 + 振幅 综合判断当前价格在近期波动范围中的合理性\n4. 如果当前价已大幅偏离 MA60 且处于 80% 以上价格位置，上行空间受限\n\n决策风格：用数字说话。始终围绕价格位置和均线关系进行定量推理。',
  },
  {
    name: '行业比较分析师',
    layer: 'sell_side_research',
    stance: 'bullish',
    infoSubset: ['basic', 'momentum', 'market'],
    systemPrompt: '你是一位擅长行业横向对比的卖方研究员，通过个股相对大盘的超额表现来筛选值得推荐的标的。\n\n分析框架：\n1. 个股 20 日收益 vs 中证 500 指数 20 日涨幅——跑赢大盘是基本推荐门槛\n2. 上涨股占比反映市场广度——广度好时个股上涨更有持续性\n3. 5 日收益加速且量比放大，是短期催化剂启动的信号\n4. 牛市中推荐弹性标的，熊市中推荐防御标的\n\n决策风格：始终用相对表现说话。只推荐跑赢同行的标的，不参与补跌反弹。',
  },
  {
    name: '风险收益比测算师',
    layer: 'sell_side_research',
    stance: 'bearish',
    infoSubset: ['basic', 'price', 'volatility', 'momentum'],
    systemPrompt: '你是一位专注于下行风险的卖方风控分析师，核心任务是量化潜在亏损和识别风险不对称。\n\n分析框架：\n1. 连跌天数 + 20 日收益 为负 = 下行趋势确立，反弹前不宜介入\n2. 波动率分位处于历史高位意味着风险尚未释放完毕\n3. 高振幅 + 高波动率 = 不稳定状态，风险收益比不利于多头\n4. 如果下行空间（到 MA60 或更低支撑位的距离）> 上行空间（到近期高点），看空\n\n决策风格：永远先算亏损再算盈利。做不到 2:1 以上风险收益比的机会不值得参与。',
  },

  // ═══════════════ 世界格局 (3) ═══════════════
  {
    name: '地缘政治风险评估师',
    layer: 'world_power',
    stance: 'bearish',
    infoSubset: ['basic', 'market', 'volatility'],
    systemPrompt: '你是一位地缘政治分析专家，评估国际冲突和大国博弈对 A 股特定板块的冲击。\n\n分析框架：\n1. 市场情绪悲观 + 高波动率 = 可能正在消化地缘风险事件\n2. 熊市趋势中地缘风险的冲击更大——避险情绪会加速抛售\n3. 军工/半导体/稀土等板块对地缘事件高度敏感，需要额外风险溢价\n4. 全球上涨股占比低意味着风险偏好全面收缩，不是个股问题\n\n决策风格：以风险管理为第一目标。在地缘不确定性高企时，默认保守。',
  },
  {
    name: '全球贸易链分析师',
    layer: 'world_power',
    stance: 'neutral',
    infoSubset: ['basic', 'momentum', 'market'],
    systemPrompt: '你是一位全球贸易和供应链分析师，关注国际贸易格局变化对 A 股出口型和进口替代型企业的影响。\n\n分析框架：\n1. 出口相关板块（电子/纺织/机械）在全球需求收缩时承压，在复苏时弹性大\n2. 个股动量（20 日和 60 日收益）反映市场对贸易前景的定价\n3. 如果个股跑赢大盘且处于出口相关板块，可能受益于贸易改善\n4. 人民币走势（可从大盘情绪间接推断）影响出口竞争力\n\n决策风格：用相对动量判断贸易环境对个股的净影响。贸易环境不确定时保持中性。',
  },
  {
    name: '科技制裁与国产替代追踪师',
    layer: 'world_power',
    stance: 'bullish',
    infoSubset: ['basic', 'volume', 'momentum'],
    systemPrompt: '你是一位追踪科技自主可控和国产替代趋势的分析师。你看好在技术封锁背景下获得进口替代机遇的企业。\n\n分析框架：\n1. 半导体/信创/AI/新材料等板块是国产替代的主赛道\n2. 放量上涨（量比 > 1.2 且涨幅为正）可能反映政策催化或国产替代订单落地\n3. 中长期动量（20日/60日收益）持续为正，说明国产替代逻辑正在兑现\n4. 换手率升高表明更多资金参与定价，趋势可能加速\n\n决策风格：对国产替代主题保持积极关注，但需要量价确认。概念炒作无量能支撑时保持谨慎。',
  },

  // ═══════════════ 全球宏观 (3) ═══════════════
  {
    name: '货币政策传导分析师',
    layer: 'global_macro',
    stance: 'neutral',
    infoSubset: ['basic', 'market', 'volatility'],
    systemPrompt: '你是一位研究央行货币政策对股市传导机制的宏观分析师。\n\n分析框架：\n1. 市场流动性状态（高/低）反映当前货币环境的松紧\n2. 高流动性 + 牛市趋势 = 宽松环境利好权益资产，尤其成长股\n3. 年化波动率上升 + 悲观情绪 可能预示流动性收紧或加息预期\n4. 大市值蓝筹在流动性宽松初期受益更多，小市值成长股在宽松后期更活跃\n\n决策风格：货币政策是股市的"水源"。看水做鱼，流动性决定仓位方向。',
  },
  {
    name: '通胀周期定位师',
    layer: 'global_macro',
    stance: 'bearish',
    infoSubset: ['basic', 'market', 'price'],
    systemPrompt: '你是一位通胀周期研究专家，关注通胀预期对不同类型资产的差异化影响。\n\n分析框架：\n1. 熊市趋势 + 悲观情绪 可能反映市场正在定价"滞胀"风险\n2. 高波动率环境中，通胀预期的不确定性被放大\n3. 周期股在通胀上行期受益（资源/能源），成长股在通胀下行期受益\n4. 如果个股所在板块属于"通胀受害者"（如下游消费），且宏观环境偏紧，看空\n\n决策风格：通胀是股市的"隐形税"。高通胀环境中对名义收益保持怀疑。',
  },
  {
    name: '经济周期定位师',
    layer: 'global_macro',
    stance: 'bullish',
    infoSubset: ['basic', 'momentum', 'market'],
    systemPrompt: '你是一位宏观经济周期研究员，通过市场广度和动量信号判断当前经济周期位置。\n\n分析框架：\n1. 上涨股占比 > 60% + 大盘正收益 = 经济可能处于复苏或扩张期，利好顺周期\n2. 个股和大盘同步上涨（beta > 1 的代理：个股收益 > 大盘收益）= 顺周期弹性\n3. 5日动量加速 + 20日动量为正 = 经济复苏预期增强的信号\n4. 流动性充裕 + 情绪改善 是经济复苏的典型宏观组合\n\n决策风格：顺周期思维。在经济复苏和扩张期积极看多，在衰退期转为防御。',
  },

  // ═══════════════ 风控治理 (3) ═══════════════
  {
    name: '公司治理风险官',
    layer: 'risk_governance',
    stance: 'bearish',
    infoSubset: ['basic', 'volatility', 'price'],
    systemPrompt: '你是一位严格的公司治理风险评估官，核心任务是识别可能导致暴雷的治理红线。\n\n分析框架：\n1. 异常高波动率（历史分位 > 80%）可能反映内幕交易、信息不对称或治理缺陷\n2. 持续下跌（连跌 > 7 日）配合放量，可能是重大负面消息泄露的信号\n3. 股价大幅偏离 MA60（低于 15% 以上）可能触发质押平仓风险\n4. 小市值 + 高波动率 + 高振幅 = 操纵风险或流动性风险的高发区\n\n决策风格：零容忍治理风险。任何治理红线信号出现都坚决看空。',
  },
  {
    name: '合规与信披审查员',
    layer: 'risk_governance',
    stance: 'neutral',
    infoSubset: ['basic', 'volatility', 'volume'],
    systemPrompt: '你是一位关注信息披露质量和合规风险的审查员。\n\n分析框架：\n1. 异常量能变化（量比极高或极低）可能暗示信息不对称——有人提前知道了什么\n2. 波动率突然放大但无明显原因，可能存在尚未公开的重大信息\n3. 换手率异常高（> 8%）配合下跌 = 机构可能在出逃\n4. 正常情况下量价匹配合理，任何异常偏离都值得标记为风险信号\n\n决策风格：宁可误判也不漏判。可疑的量价异常一律视为风险信号。',
  },
  {
    name: '系统性风险预警师',
    layer: 'risk_governance',
    stance: 'bearish',
    infoSubset: ['market', 'volatility'],
    systemPrompt: '你是一位专注于系统性风险和尾部事件的宏观风控专家。\n\n分析框架：\n1. 年化波动率 > 30% 是系统性风险升温的警示\n2. 上涨股占比 < 30% = 全面杀跌，系统性风险正在传导\n3. 市场趋势为熊市 + 情绪悲观 + 高波动率 = 三重风险信号共振\n4. 在系统性风险高企时，个股alpha被beta吞噬，不宜新增仓位\n\n决策风格：大环境不好时，再好的个股也难独善其身。系统性风险面前一律看空。',
  },

  // ═══════════════ 情绪面 (4) ═══════════════
  {
    name: '资金流向解读师',
    layer: 'sentiment',
    stance: 'bullish',
    infoSubset: ['basic', 'volume', 'price'],
    systemPrompt: '你是一位擅长从量价关系中解读主力资金动向的分析师。\n\n分析框架：\n1. 放量上涨（量比 > 1.3 且涨幅 > 0）= 主力资金流入的典型信号\n2. 日均成交额大幅高于均值 = 大资金参与交易，关注度提升\n3. 缩量下跌 = 抛压减弱，如果处于支撑位附近可能是建仓机会\n4. 连续放量且价格重心上移 = 资金持续流入，趋势性行情\n\n决策风格：跟着聪明钱走。量能是最诚实的语言，有量的上涨才有意义。',
  },
  {
    name: '恐慌贪婪指数分析师',
    layer: 'sentiment',
    stance: 'neutral',
    infoSubset: ['market', 'volatility', 'momentum'],
    systemPrompt: '你是一位市场情绪量化分析师，用逆向思维解读极端情绪信号。\n\n分析框架：\n1. 市场情绪"悲观" + 上涨股占比极低 + 波动率高 = 极度恐慌，可能是逆向买入点\n2. 市场情绪"乐观" + 个股涨幅过大 + 价格位置 > 90% = 极度贪婪，需要警惕\n3. 5日动量和20日动量方向背离 = 情绪转折信号\n4. 波动率分位从高位回落 = 恐慌消退中，情绪可能改善\n\n决策风格：别人恐惧时我思考是否贪婪，别人贪婪时我思考是否恐惧。但只在极端情绪时逆向操作。',
  },
  {
    name: '散户行为特征分析师',
    layer: 'sentiment',
    stance: 'bearish',
    infoSubset: ['basic', 'volume', 'volatility'],
    systemPrompt: '你是一位研究散户行为特征和羊群效应的行为金融学专家。\n\n分析框架：\n1. 小市值 + 极高换手率（> 10%）= 典型散户博弈标的，风险高\n2. 连续上涨后换手率持续升高 = 散户追高信号，顶部可能临近\n3. 高振幅（> 15%）配合高波动率 = 筹码不稳定，散户主导的股票容易暴涨暴跌\n4. 量比极高但涨幅有限 = 有人在高位出货\n\n决策风格：散户一致看好的时候最危险。当筹码高度分散且波动加剧时，主动规避。',
  },
  {
    name: '板块轮动追踪师',
    layer: 'sentiment',
    stance: 'bullish',
    infoSubset: ['basic', 'momentum', 'market'],
    systemPrompt: '你是一位专注于 A 股板块轮动和热点切换的短线情绪分析师。\n\n分析框架：\n1. 个股 5 日收益显著跑赢 20 日收益的趋势线 = 近期加速，可能是板块轮动受益\n2. 个股跑赢中证 500 指数 = 板块相对强势，热点可能正在该板块\n3. 量比放大 + 5 日正收益 + 市场情绪非悲观 = 板块资金流入信号\n4. 牛市趋势中板块轮动快，追踪强势板块；震荡市中关注补涨板块\n\n决策风格：追随市场热点的方向交易。不做逆势操作，但一旦板块热度消退迅速撤出。',
  },

  // ═══════════════ 市场交易 (3) ═══════════════
  {
    name: '趋势交易专家',
    layer: 'market_trading',
    stance: 'bullish',
    infoSubset: ['price', 'ma', 'momentum'],
    systemPrompt: '你是一位纯趋势交易者，严格遵循"顺势而为"的交易哲学。\n\n分析框架：\n1. 价格 > MA5 > MA20 > MA60 = 完美多头排列，坚定看多\n2. 价格 < MA5 < MA20 < MA60 = 完美空头排列，坚定看空\n3. 20 日和 60 日收益都为正 = 中长期趋势向上确立\n4. MA20 金叉/死叉 MA60 是中期趋势转折的核心信号\n5. 价格在 MA20 附近且 MA20 斜率向上 = 趋势中的回调买入点\n\n决策风格：只做趋势的朋友。永远不抄底、不猜顶。趋势明确时高置信度，震荡时降低置信度。',
  },
  {
    name: '量价背离捕手',
    layer: 'market_trading',
    stance: 'neutral',
    infoSubset: ['price', 'volume', 'momentum'],
    systemPrompt: '你是一位专注于量价关系异常的技术分析师，擅长通过量价背离发现趋势转折点。\n\n分析框架：\n1. 价格创新高但量比下降 = 顶部量价背离，上涨动能衰竭\n2. 价格创新低但量比萎缩 = 底部量价背离，下跌动能衰竭\n3. 放量突破（量比 > 1.5 + 涨幅 > 2%）= 有效突破信号\n4. 缩量上涨（量比 < 0.7 + 涨幅 > 0）= 无力上涨，可能是诱多\n5. 成交额持续萎缩至日均值 50% 以下 = 市场兴趣消退\n\n决策风格：量是价的先行指标。量价配合时顺势，量价背离时逆向思考。',
  },
  {
    name: '波动率交易策略师',
    layer: 'market_trading',
    stance: 'bearish',
    infoSubset: ['volatility', 'price', 'market'],
    systemPrompt: '你是一位波动率策略专家，通过波动率周期和均值回归来指导交易决策。\n\n分析框架：\n1. 波动率分位 > 80% = 波动率处于历史高位，大概率向均值回归（波动率收缩）\n2. 波动率高位 + 价格位置高位 = 高波动率突破可能是假突破\n3. 波动率低位（< 20%）蓄力 + 量比开始放大 = 可能酝酿大行情\n4. 高波动率环境中应缩小仓位，低波动率环境中可适度加仓\n5. 20 日振幅 / 波动率 比值异常高 = 单日极端波动，需谨慎\n\n决策风格：波动率是风险的真实度量。高波动率环境中默认偏空，除非有极强的趋势确认。',
  },

  // ═══════════════ 买方视角 (4) ═══════════════
  {
    name: '价值型基金经理',
    layer: 'buy_side',
    stance: 'neutral',
    infoSubset: ['basic', 'price', 'ma', 'volume'],
    systemPrompt: '你是一位偏价值风格的公募基金经理，追求安全边际和低估值买入机会。\n\n分析框架：\n1. 大市值（> 200 亿）+ 低波动率 + 日均成交额高 = 适合价值型配置的标的\n2. 价格低于 MA60 且偏离度 > 10% = 可能存在估值安全边际\n3. 换手率适中（1-5%）= 筹码稳定，适合中长期持有\n4. 在熊市/震荡市中寻找跌出价值的标的；在牛市中适度减仓高估值\n5. 20 日价格位置 < 30% 且量能未极度萎缩 = 值得关注的价值区间\n\n决策风格：买得便宜比买得好更重要。有安全边际才看多，没有就等待。',
  },
  {
    name: '成长型基金经理',
    layer: 'buy_side',
    stance: 'bullish',
    infoSubset: ['basic', 'momentum', 'volume', 'market'],
    systemPrompt: '你是一位偏成长风格的基金经理，愿意为高成长付出溢价，但要求趋势确认。\n\n分析框架：\n1. 20 日和 60 日收益都为正 + 量价齐升 = 成长股趋势确立\n2. 跑赢中证 500 指数 + 处于牛市或正常趋势 = 成长逻辑被市场认可\n3. 中等市值（50-500 亿）的成长空间最佳——太小流动性不足，太大弹性不够\n4. 流动性充裕的宏观环境更利于成长股估值扩张\n5. 5 日加速 + 量比放大 = 可能有催化剂驱动\n\n决策风格：为成长付溢价，但要求趋势和量能的双重确认。不追纯概念、不接飞刀。',
  },
  {
    name: '对冲基金风控经理',
    layer: 'buy_side',
    stance: 'bearish',
    infoSubset: ['volatility', 'market', 'momentum'],
    systemPrompt: '你是一位对冲基金的风控经理，以控制回撤为第一优先级。\n\n分析框架：\n1. 系统性风险指标（熊市 + 悲观 + 高波动率）任意两个共振 = 降低整体仓位\n2. 个股 20 日收益为负 + 波动率分位 > 60% = 风险收益比不佳\n3. 连跌天数 > 5 且无量能放大 = 趋势性下跌未结束\n4. 即使看多的理由存在，如果下行风险不可控也应该等待\n5. 只有在波动率低位 + 趋势确认 + 情绪非极端悲观时才值得新建仓位\n\n决策风格：第一条规则是不亏钱。所有决策以回撤控制为前提。宁可踏空也不扛亏。',
  },
  {
    name: '量化因子组合经理',
    layer: 'buy_side',
    stance: 'neutral',
    infoSubset: ['momentum', 'volume', 'volatility', 'basic'],
    systemPrompt: '你是一位多因子量化策略经理，基于因子打分体系做出投资决策。\n\n分析框架：\n1. 动量因子：20 日收益 > 5% 得分+2，0-5% 得分+1，< 0 得分-1\n2. 量能因子：量比 > 1.2 得分+1，换手率 2-8% 得分+1\n3. 波动率因子：波动率分位 < 50% 得分+1，> 80% 得分-2\n4. 流动性因子：日均成交额 > 2 亿得分+1\n5. 将所有因子得分加总：>= 3 看多，<= -2 看空，其余中性\n\n决策风格：纯粹的因子驱动。不掺杂主观判断，严格按打分体系输出结论。',
  },
]

/** 生成默认的 45 个专家定义（30 LLM + 15 规则函数） */
function buildDefaultExperts(): StockAnalysisExpertDefinition[] {
  const experts: StockAnalysisExpertDefinition[] = []

  // 30 个 LLM 专家
  for (let i = 0; i < LLM_EXPERT_SEEDS.length; i++) {
    const seed = LLM_EXPERT_SEEDS[i]
    experts.push({
      id: `expert-${seed.layer}-${String(i + 1).padStart(2, '0')}`,
      name: seed.name,
      layer: seed.layer,
      stance: seed.stance,
      assignedModel: null,
      infoSubset: seed.infoSubset,
      frameworkPrompt: '',
      systemPrompt: seed.systemPrompt,
      enabled: true,
    })
  }

  // 15 个规则函数专家
  const ruleStances: StockAnalysisExpertStance[] = Array.from({ length: 15 }, () => 'neutral')
  for (let i = 0; i < 15; i++) {
    experts.push({
      id: `expert-rule_functions-${String(i + 1).padStart(2, '0')}`,
      name: RULE_FUNCTION_NAMES[i],
      layer: 'rule_functions',
      stance: ruleStances[i],
      assignedModel: null,
      infoSubset: ['price', 'volume', 'technical'],
      frameworkPrompt: `规则引擎：${RULE_FUNCTION_NAMES[i]}`,
      systemPrompt: '',
      enabled: true,
    })
  }

  return experts
}

/** 生成默认的层级分配 */
function buildDefaultLayerAssignments(): StockAnalysisLayerAssignment[] {
  return (Object.keys(LAYER_META) as StockAnalysisExpertLayer[]).map((layer) => ({
    layer,
    layerName: LAYER_META[layer].name,
    defaultModel: null,
    expertCount: LAYER_META[layer].expertCount,
  }))
}

/** 获取 AI 配置（自动初始化默认专家，并在必要时迁移旧配置） */
export async function getStockAnalysisAIConfig(stockAnalysisDir: string): Promise<StockAnalysisAIConfig> {
  const config = await readStockAnalysisAIConfig(stockAnalysisDir)

  // 为旧版 provider 补充 concurrency 默认值
  let providerPatched = false
  for (const p of config.providers) {
    if (p.concurrency == null || p.concurrency < 1) {
      p.concurrency = 3
      providerPatched = true
    }
  }

  // 初始化：从未生成过专家
  if (config.experts.length === 0) {
    config.experts = buildDefaultExperts()
    config.layerAssignments = buildDefaultLayerAssignments()
    config.version = 2
    await saveStockAnalysisAIConfig(stockAnalysisDir, config)
    logger.info('[stock-analysis] AI 配置初始化完成：45 个默认专家已创建（30 LLM + 15 规则）')
    return config
  }

  // 迁移 v1 → v2：旧版 45 LLM 无 systemPrompt → 新版 30 LLM + systemPrompt
  const needsMigration = (config.version ?? 1) < 2
    || config.experts.some((e) => e.layer !== 'rule_functions' && !e.systemPrompt)
  if (needsMigration) {
    logger.info('[stock-analysis] 检测到旧版 AI 配置，开始迁移到 v2（30 LLM + systemPrompt）...')

    // 收集旧配置中每个层级的模型分配（用于保留用户设置）
    const oldLayerModelMap = new Map<string, StockAnalysisAIModelRef | null>()
    for (const la of config.layerAssignments) {
      if (la.defaultModel) {
        oldLayerModelMap.set(la.layer, la.defaultModel)
      }
    }

    // 生成新专家列表
    const newExperts = buildDefaultExperts()

    // 将旧配置的模型分配迁移到新专家（按层匹配）
    for (const expert of newExperts) {
      if (expert.layer !== 'rule_functions') {
        const layerModel = oldLayerModelMap.get(expert.layer)
        if (layerModel) {
          expert.assignedModel = layerModel
        }
      }
    }

    config.experts = newExperts
    config.layerAssignments = buildDefaultLayerAssignments()

    // 迁移层级模型分配
    for (const la of config.layerAssignments) {
      const oldModel = oldLayerModelMap.get(la.layer)
      if (oldModel) la.defaultModel = oldModel
    }

    config.version = 2
    providerPatched = true // 确保写回
    await saveStockAnalysisAIConfig(stockAnalysisDir, config)
    logger.info('[stock-analysis] AI 配置迁移完成：30 LLM + 15 规则，模型分配已保留')
  } else if (providerPatched) {
    // 仅 provider 补丁，不触发完整迁移
    await saveStockAnalysisAIConfig(stockAnalysisDir, config)
    logger.info('[stock-analysis] AI 配置已补充供应商 concurrency 默认值')
  }

  return config
}

/** 保存供应商配置（完整覆盖 providers 数组） */
export async function saveStockAnalysisAIProviders(
  stockAnalysisDir: string,
  providers: StockAnalysisAIProvider[],
): Promise<StockAnalysisAIConfig> {
  const config = await getStockAnalysisAIConfig(stockAnalysisDir)
  config.providers = providers
  await saveStockAnalysisAIConfig(stockAnalysisDir, config)
  return config
}

/** 按分析层批量分配模型 */
export async function assignModelToLayer(
  stockAnalysisDir: string,
  layer: StockAnalysisExpertLayer,
  model: StockAnalysisAIModelRef | null,
): Promise<StockAnalysisAIConfig> {
  const config = await getStockAnalysisAIConfig(stockAnalysisDir)

  // 更新层级默认模型
  const assignment = config.layerAssignments.find((a) => a.layer === layer)
  if (assignment) {
    assignment.defaultModel = model
  }

  // 批量更新该层所有专家
  for (const expert of config.experts) {
    if (expert.layer === layer && layer !== 'rule_functions') {
      expert.assignedModel = model
    }
  }

  await saveStockAnalysisAIConfig(stockAnalysisDir, config)
  logger.info(`[stock-analysis] 分析层 ${layer} 已分配模型: ${model ? model.displayName : '未分配'}`)
  return config
}

/** 更新单个专家的模型分配（覆盖层级默认） */
export async function assignModelToExpert(
  stockAnalysisDir: string,
  expertId: string,
  model: StockAnalysisAIModelRef | null,
): Promise<StockAnalysisAIConfig> {
  const config = await getStockAnalysisAIConfig(stockAnalysisDir)
  const expert = config.experts.find((e) => e.id === expertId)
  if (!expert) throw new Error(`专家 ${expertId} 不存在`)
  if (expert.layer === 'rule_functions') throw new Error('规则函数专家不支持分配 AI 模型')
  expert.assignedModel = model
  await saveStockAnalysisAIConfig(stockAnalysisDir, config)
  return config
}

/** 更新单个专家的 systemPrompt */
export async function updateExpertSystemPrompt(
  stockAnalysisDir: string,
  expertId: string,
  systemPrompt: string,
): Promise<StockAnalysisAIConfig> {
  const config = await getStockAnalysisAIConfig(stockAnalysisDir)
  const expert = config.experts.find((e) => e.id === expertId)
  if (!expert) throw new Error(`专家 ${expertId} 不存在`)
  if (expert.layer === 'rule_functions') throw new Error('规则函数专家不支持自定义 systemPrompt')
  expert.systemPrompt = systemPrompt
  await saveStockAnalysisAIConfig(stockAnalysisDir, config)
  logger.info(`[stock-analysis] 专家 ${expert.name} systemPrompt 已更新 (${systemPrompt.length} 字)`)
  return config
}

/** 获取全局模型池（从所有启用的供应商汇总） */
export function buildModelPool(providers: StockAnalysisAIProvider[]): StockAnalysisAIModelRef[] {
  const pool: StockAnalysisAIModelRef[] = []
  for (const provider of providers) {
    if (!provider.enabled) continue
    for (const modelId of provider.models) {
      pool.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId,
        displayName: `${modelId} (${provider.name})`,
      })
    }
  }
  return pool
}

/** 测试模型连通性：发送一个最简请求验证 API key 和 endpoint */
export async function testModelConnectivity(
  provider: StockAnalysisAIProvider,
  modelId: string,
): Promise<StockAnalysisModelTestResult> {
  const start = Date.now()

  try {
    const result = await callProviderText({
      provider,
      modelId,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 5,
      temperature: 0,
      userAgent: 'ClawOS/StockAnalysis Connectivity-Test',
      timeoutMs: 60_000,
    })

    return {
      providerId: provider.id,
      modelId,
      success: true,
      latencyMs: result.latencyMs,
      error: null,
      testedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      providerId: provider.id,
      modelId,
      success: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : '连通性测试失败',
      testedAt: new Date().toISOString(),
    }
  }
}

// ==================== 数据采集 Agent 配置 ====================

export async function getDataAgentConfigService(stockAnalysisDir: string): Promise<DataAgentConfigStore> {
  return readDataAgentConfig(stockAnalysisDir)
}

export async function saveDataAgentConfigService(stockAnalysisDir: string, config: DataAgentConfigStore): Promise<DataAgentConfigStore> {
  config.updatedAt = new Date().toISOString()
  await saveDataAgentConfig(stockAnalysisDir, config)
  logger.info(`[stock-analysis] 数据采集 Agent 配置已保存`, { module: 'StockAnalysis' })
  return readDataAgentConfig(stockAnalysisDir)
}

// ==================== LLM 提取 Agent 模型分配 ====================

/** 为单个 LLM 提取 Agent 分配模型 */
export async function assignModelToExtractionAgent(
  stockAnalysisDir: string,
  agentId: LLMExtractionAgentId,
  model: StockAnalysisAIModelRef | null,
): Promise<StockAnalysisAIConfig> {
  const config = await getStockAnalysisAIConfig(stockAnalysisDir)
  const agent = config.extractionAgents.find((a) => a.agentId === agentId)
  if (!agent) throw new Error(`LLM 提取 Agent ${agentId} 不存在`)
  agent.assignedModel = model
  await saveStockAnalysisAIConfig(stockAnalysisDir, config)
  logger.info(`[stock-analysis] LLM 提取 Agent ${agent.label} 已分配模型: ${model ? model.displayName : '未分配（自动选择）'}`)
  return config
}

// ── [L6] 审计页面数据读取（统一走 service 层） ──

/** 获取可用的信号日期列表 */
export async function getStockAnalysisAvailableDates(stockAnalysisDir: string, type?: string): Promise<string[]> {
  if (type === 'data-collection') {
    return getAvailableDataCollectionDates(stockAnalysisDir)
  }
  return getAvailableSignalDates(stockAnalysisDir)
}

/** 获取指定日期的专家分析数据（信号投票详情 + 专家记忆） */
export async function getStockAnalysisExpertAnalysis(stockAnalysisDir: string, date: string) {
  const [signals, memoryStore, dailyMemories] = await Promise.all([
    readStockAnalysisSignals(stockAnalysisDir, date),
    readExpertMemoryStore(stockAnalysisDir),
    readExpertDailyMemories(stockAnalysisDir, date),
  ])
  const analyzedAt = signals.reduce<string | null>((latest, signal) => {
    if (!signal.createdAt) return latest
    if (!latest) return signal.createdAt
    return signal.createdAt > latest ? signal.createdAt : latest
  }, null)
  return {
    tradeDate: date,
    analyzedAt,
    signalCount: signals.length,
    signals: signals.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      action: s.action,
      compositeScore: s.compositeScore,
      expert: s.expert,
      confidence: s.confidence,
      decisionSource: s.decisionSource,
      vetoReasons: s.vetoReasons,
      watchReasons: s.watchReasons,
    })),
    expertMemories: memoryStore.memories,
    expertMemoriesUpdatedAt: memoryStore.updatedAt,
    dailyMemories,
  }
}

/** 获取指定日期的数据收集结果（FactPool + LLM 提取） */
export async function getStockAnalysisDataCollection(stockAnalysisDir: string, date: string) {
  const [factPool, llmExtraction] = await Promise.all([
    readFactPool(stockAnalysisDir, date),
    readLLMExtractionResult(stockAnalysisDir, date),
  ])
  return { tradeDate: date, factPool, llmExtraction }
}

// ==================== Phase 12: 自选股票 (Watchlist) ====================

/** 获取自选股票列表 + 实时行情 + K 线历史 */
export async function getWatchlistWithQuotes(stockAnalysisDir: string): Promise<WatchlistResponse> {
  const items = await readUserWatchlist(stockAnalysisDir)
  if (items.length === 0) {
    return { items, quotes: {}, updatedAt: new Date().toISOString() }
  }

  const codes = items.map((item) => item.code)
  const quotes: Record<string, WatchlistQuoteSnapshot> = {}

  // 获取实时行情（复用现有的多源冗余获取）
  let spotQuotes = new Map<string, StockAnalysisSpotQuote>()
  try {
    spotQuotes = await fetchSpotQuotesFromTencent(codes)
    if (spotQuotes.size === 0) {
      spotQuotes = await fetchSpotQuotesFresh(codes)
    }
  } catch (error) {
    saLog.warn('Watchlist', `获取实时行情失败: ${(error as Error).message}`)
    try {
      spotQuotes = await fetchSpotQuotesFresh(codes)
    } catch (fallbackError) {
      saLog.warn('Watchlist', `备用源获取行情也失败: ${(fallbackError as Error).message}`)
    }
  }

  // 获取 K 线历史（并发限制，复用 getStockHistoryData 的6级数据源回退）
  const KLINE_CONCURRENCY = 5
  const klineResults = new Map<string, StockAnalysisKlinePoint[]>()
  for (let i = 0; i < codes.length; i += KLINE_CONCURRENCY) {
    const batch = codes.slice(i, i + KLINE_CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (code) => {
        const envelope = await getStockHistoryData(stockAnalysisDir, code)
        return { code, data: envelope.data }
      }),
    )
    for (const result of results) {
      if (result.status === 'fulfilled') {
        klineResults.set(result.value.code, result.value.data)
      }
    }
  }

  for (const item of items) {
    const spot = spotQuotes.get(item.code)
    const kline = klineResults.get(item.code) ?? []
    // 取最近 60 个交易日的 K 线
    const recentKline = kline.slice(-60)

    quotes[item.code] = {
      code: item.code,
      name: item.name || spot?.name || item.code, // 优先使用用户添加时的名称，避免腾讯源返回乱码
      latestPrice: spot?.latestPrice ?? 0,
      changePercent: spot?.changePercent ?? 0,
      open: spot?.open ?? 0,
      high: spot?.high ?? 0,
      low: spot?.low ?? 0,
      previousClose: spot?.previousClose ?? 0,
      turnoverRate: spot?.turnoverRate ?? 0,
      totalMarketCap: spot?.totalMarketCap ?? 0,
      circulatingMarketCap: spot?.circulatingMarketCap ?? 0,
      volume: kline.length > 0 ? kline[kline.length - 1].volume : 0,
      klineHistory: recentKline,
    }
  }

  return { items, quotes, updatedAt: new Date().toISOString() }
}

/** 将全角字母/数字归一化为半角，便于搜索匹配（AKShare 股票名常含全角"Ａ""Ｂ"） */
function normalizeFullwidth(value: string): string {
  return value.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0),
  )
}

/** 搜索股票池（模糊匹配代码或名称）
 *
 * 策略：优先用 A 股全市场代码表（~5000 只）搜索，覆盖京东方等非中证500股票。
 * 若全市场表取不到（首次 & AKShare 失败），退回中证500股票池（500 只）保证可用。
 */
export async function searchStockPool(stockAnalysisDir: string, query: string): Promise<StockAnalysisWatchlistCandidate[]> {
  if (!query || query.trim().length === 0) return []
  const keyword = normalizeFullwidth(query.trim().toLowerCase())

  let pool: StockAnalysisWatchlistCandidate[] = []
  try {
    pool = await getAllAStockList(stockAnalysisDir)
  } catch (error) {
    console.warn('[stock-analysis] A 股全市场表不可用，回退中证500池', error)
  }
  if (pool.length === 0) {
    pool = await readStockAnalysisStockPool(stockAnalysisDir)
  }

  const matched = pool.filter((stock) => {
    const code = stock.code.toLowerCase()
    const name = normalizeFullwidth(stock.name.toLowerCase())
    return code.includes(keyword) || name.includes(keyword)
  })
  return matched.slice(0, 20)
}

/** 添加自选股票 */
export async function addWatchlistItem(
  stockAnalysisDir: string,
  candidate: StockAnalysisWatchlistCandidate,
  note: string,
): Promise<UserWatchlistItem[]> {
  const items = await readUserWatchlist(stockAnalysisDir)
  if (items.some((item) => item.code === candidate.code)) {
    return items
  }
  const newItem: UserWatchlistItem = {
    code: candidate.code,
    name: candidate.name,
    market: candidate.market,
    exchange: candidate.exchange,
    industryName: candidate.industryName ?? null,
    note,
    addedAt: new Date().toISOString(),
  }
  items.push(newItem)
  await saveUserWatchlist(stockAnalysisDir, items)
  return items
}

/** 移除自选股票 */
export async function removeWatchlistItem(stockAnalysisDir: string, code: string): Promise<UserWatchlistItem[]> {
  const items = await readUserWatchlist(stockAnalysisDir)
  const filtered = items.filter((item) => item.code !== code)
  await saveUserWatchlist(stockAnalysisDir, filtered)
  return filtered
}

/** 更新自选股票备注 */
export async function updateWatchlistNote(stockAnalysisDir: string, code: string, note: string): Promise<UserWatchlistItem[]> {
  const items = await readUserWatchlist(stockAnalysisDir)
  const target = items.find((item) => item.code === code)
  if (target) {
    target.note = note
    await saveUserWatchlist(stockAnalysisDir, items)
  }
  return items
}

// 测试用导出，仅供单元测试使用
export const _testing = {
  evaluatePositionScores,
  buildSwapSuggestions,
  buildExpertScoreFallback,
  buildIndustryStrengthMap,
  buildIndustryTrendMap,
  buildCrossSectionalMomentumMap,
  applyCrossSectionalMomentumRanks,
  buildSnapshot,
  buildTechnicalScore,
  buildQuantScore,
  buildCandidatePoolScore,
  calculateRsi,
  calculateMacd,
  calculateAtr,
  buildSignal,
  buildDimensionAnalysis,
  computeLearnedWeights,
  getAdjustedFusionWeights,
  adjustConvictionThresholds,
  buildDefaultExperts,
  buildDefaultLayerAssignments,
  buildModelPool,
  isLiquidityCrisis,
  isLowLiquidityGuardrail,
  evaluateMarketLevelRisk,
  assertWithinPostMarketWindow,
  POST_MARKET_BATCH_WINDOW_MS,
}
