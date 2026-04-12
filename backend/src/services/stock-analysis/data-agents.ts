/**
 * G2 八大数据采集 Agent — 盘后批量数据收集
 *
 * 8 个 Agent 独立运行，互不干扰。采集完成后将数据写入共享事实池。
 * 不做预测或判断，只做数据收集与整理。
 * 数据源异常时自动标记并尝试备用方案（每个 Agent 至少 5 个备用源）。
 *
 * Agent 列表：
 * 1. macro_economy   — 宏观经济监测（GDP/CPI/PMI/利率/汇率）
 * 2. policy_regulation — 政策法规跟踪
 * 3. company_info     — 上市公司公告
 * 4. price_volume     — 价格量能监控（K线/资金流/龙虎榜）
 * 5. industry_news    — 行业新闻分析
 * 6. social_sentiment — 社交媒体情绪
 * 7. global_markets   — 全球市场联动
 * 8. data_quality     — 数据质量校验
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

import { logger } from '../../utils/logger'
import { saLog } from './sa-logger'
import { readRecentFactPools } from './store'
import type {
  BlockTradeSummary,
  CompanyAnnouncement,
  DataAgentConfigStore,
  DataAgentId,
  DataAgentResult,
  DataQualityReport,
  DragonTigerSummary,
  FactPool,
  GlobalMarketSnapshot,
  IndustryNewsItem,
  MacroEconomicData,
  MarginTradingSummary,
  MoneyFlowItem,
  PolicyEvent,
  PriceVolumeExtras,
  SectorFlowItem,
  SocialSentimentSnapshot,
  StockAnalysisMarketState,
  StockAnalysisSpotQuote,
} from './types'

const execFileAsync = promisify(execFile)

const DEFAULT_REQUEST_TIMEOUT_MS = 600_000

// ==================== 工具函数 ====================

function nowIso(): string {
  return new Date().toISOString()
}

let pythonUserSiteCache: string | null = null

const PYTHON_TIMEOUT_MS = 60_000 // Python 子进程超时 60 秒

/**
 * [P2-5] AKShare 版本兼容性：启动时检测 AKShare 版本并记录日志。
 * 当 API 被重命名时，错误信息会包含 "has no attribute"，据此可快速定位。
 * 当前已验证兼容 akshare >= 1.14.x
 */
const AKSHARE_MIN_VERSION = '1.14.0'
let akshareVersionChecked = false

async function checkAkShareVersion(): Promise<void> {
  if (akshareVersionChecked) return
  akshareVersionChecked = true
  try {
    const version = await runPythonJson<string>(`
import json
try:
    import akshare as ak
    print(json.dumps({"success": True, "data": ak.__version__}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))
`, 10_000)
    const parts = version.split('.').map(Number)
    const minParts = AKSHARE_MIN_VERSION.split('.').map(Number)
    const isOld = parts[0] < minParts[0] || (parts[0] === minParts[0] && parts[1] < minParts[1])
    if (isOld) {
      logger.warn(`[data-agents] AKShare 版本 ${version} 低于推荐版本 ${AKSHARE_MIN_VERSION}，部分 API 可能不兼容`, { module: 'StockAnalysis' })
    } else {
      logger.info(`[data-agents] AKShare 版本: ${version}`, { module: 'StockAnalysis' })
    }
  } catch (err) {
    logger.warn(`[data-agents] 无法检测 AKShare 版本: ${(err as Error).message}`, { module: 'StockAnalysis' })
  }
}

/**
 * [P2-6] 数值合理性校验：检查 AKShare 返回的数值是否在合理范围内。
 * 超出范围的值视为脏数据，返回 null。
 */
function validateNumericRange(value: unknown, min: number, max: number, label: string): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < min || value > max) {
    logger.warn(`[data-agents] 数值合理性校验失败: ${label}=${value} 超出范围 [${min}, ${max}]`)
    return null
  }
  return value
}

async function getPythonUserSitePackages(): Promise<string | null> {
  if (pythonUserSiteCache !== null) return pythonUserSiteCache
  try {
    const { stdout } = await execFileAsync('python3', ['-c', 'import site; print(site.getusersitepackages())'], {
      maxBuffer: 1024 * 256,
      timeout: 10_000,
      env: process.env,
    })
    pythonUserSiteCache = stdout.trim() || null
  } catch {
    pythonUserSiteCache = null
  }
  return pythonUserSiteCache
}

/** 校验股票代码格式，防止 Python 代码注入 */
function validateStockCode(code: string): boolean {
  return /^[A-Za-z0-9.]{1,20}$/.test(code)
}

interface PythonJsonResult<T> {
  success: boolean
  data?: T
  error?: string
}

async function runPythonJson<T>(script: string, timeoutMs: number = PYTHON_TIMEOUT_MS): Promise<T> {
  const pythonUserSite = await getPythonUserSitePackages()
  const env = { ...process.env }
  if (pythonUserSite) {
    env.PYTHONPATH = env.PYTHONPATH ? `${pythonUserSite}:${env.PYTHONPATH}` : pythonUserSite
  }

  const { stdout } = await execFileAsync('python3', ['-c', script], {
    maxBuffer: 1024 * 1024 * 8,
    timeout: timeoutMs,
    env,
  })
  let json: PythonJsonResult<T>
  try {
    json = JSON.parse(stdout.trim()) as PythonJsonResult<T>
  } catch (parseError) {
    const preview = stdout.trim().slice(0, 200)
    throw new Error(`Python 脚本输出非 JSON: "${preview}..." (${parseError instanceof Error ? parseError.message : '解析失败'})`)
  }
  if (!json.success) {
    throw new Error(json.error || 'Python 数据脚本失败')
  }
  if (json.data === undefined) {
    throw new Error('Python 数据脚本返回空结果')
  }
  return json.data
}

async function fetchJsonWithTimeout<T>(url: string, headers?: Record<string, string>, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ...(headers ?? {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 东方财富快讯 JSONP 接口 — 替代已失效的 getNewsByColumns API。
 * URL 格式: https://newsapi.eastmoney.com/kuaixun/v1/getlist_{column}_ajaxResult_{pageSize}_{page}_.html
 * 返回 JSONP: var ajaxResult={...}
 */
async function fetchEastmoneyKuaixun(
  column: number,
  pageSize: number = 15,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Array<{ title: string; showtime: string; digest: string }>> {
  const url = `https://newsapi.eastmoney.com/kuaixun/v1/getlist_${column}_ajaxResult_${pageSize}_1_.html`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: 'https://kuaixun.eastmoney.com/',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const raw = await response.text()
    // JSONP 格式: "var ajaxResult={...}" — 提取 JSON 部分
    const match = /var\s+ajaxResult\s*=\s*(\{[\s\S]*\})/.exec(raw)
    if (!match) throw new Error('无法解析 kuaixun JSONP 响应')
    const data = JSON.parse(match[1]) as { LivesList?: Array<{ title?: string; showtime?: string; digest?: string }> }
    const list = data.LivesList ?? []
    return list.map((item) => ({
      title: item.title ?? '',
      showtime: item.showtime ?? '',
      digest: item.digest ?? '',
    }))
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 东方财富 push2his 单只证券行情查询 — 替代已失效的 clist 批量接口（全球指数/商品期货）。
 * f170 = 涨跌幅 * 100（如 f170=44 表示 0.44%）
 */
async function fetchEastmoneyQuote(
  secid: string,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<{ code: string; name: string; changePercent: number } | null> {
  const url = `https://push2his.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f170`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: 'https://quote.eastmoney.com/',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const resp = await response.json() as { rc?: number; data?: { f57?: string; f58?: string; f170?: number } | null }
    if (resp.rc !== 0 || !resp.data) return null
    return {
      code: resp.data.f57 ?? '',
      name: resp.data.f58 ?? '',
      changePercent: (resp.data.f170 ?? 0) / 100, // f170 是涨跌幅*100，转回百分比
    }
  } finally {
    clearTimeout(timer)
  }
}

function shouldReportGlobalIndexError(snapshot: GlobalMarketSnapshot, eastmoneyGlobalMissing: boolean) {
  if (!eastmoneyGlobalMissing) {
    return false
  }
  return snapshot.sp500Change === null && snapshot.nasdaqChange === null && snapshot.hsiChange === null
}

/** 安全执行单个数据源，返回 null 表示失败 */
/** P2-D5: 带单次重试的数据源调用（网络抖动时第二次通常能成功） */
async function trySource<T>(sourceName: string, agentId: DataAgentId, fn: () => Promise<T>): Promise<T | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === 1) {
        logger.debug(`[data-agents][${agentId}] 数据源 ${sourceName} 第 1 次失败，1 秒后重试: ${(error as Error).message}`)
        await new Promise((r) => setTimeout(r, 1000))
      } else {
        logger.warn(`[data-agents][${agentId}] 数据源 ${sourceName} 重试后仍失败: ${(error as Error).message}`)
      }
    }
  }
  return null
}

// ==================== Agent 运行器 ====================

function createAgentResult(agentId: DataAgentId, startMs: number, dataPointCount: number, errors: string[]): DataAgentResult {
  const denominator = dataPointCount + errors.length
  return {
    agentId,
    collectedAt: nowIso(),
    dataPointCount,
    successRate: computeSuccessRate(dataPointCount, errors.length),
    elapsedMs: Date.now() - startMs,
    errors,
  }
}

function computeSuccessRate(dataPointCount: number, errorCount: number): number {
  const denominator = dataPointCount + errorCount
  return denominator === 0 ? 0 : Math.max(0, dataPointCount / denominator)
}

function computeChangePercentFromSeries(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => Number.isFinite(value ?? NaN))
  if (numeric.length < 2) {
    return null
  }
  const previous = numeric[numeric.length - 2]
  const current = numeric[numeric.length - 1]
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous === 0) {
    return null
  }
  return Math.round(((current - previous) / previous * 100) * 10_000) / 10_000
}

function countNonNullValues(values: Array<unknown>): number {
  return values.filter((value) => value !== null && value !== undefined).length
}

async function getRecentFactPoolBackup(stockAnalysisDir: string, tradeDate: string): Promise<FactPool | null> {
  const pools = await readRecentFactPools(stockAnalysisDir, 7)
  return pools.find((pool) => pool.tradeDate !== tradeDate) ?? null
}

function countMacroDataPoints(data: MacroEconomicData | null | undefined): number {
  if (!data) return 0
  return countNonNullValues([
    data.gdpGrowth,
    data.cpi,
    data.pmi,
    data.interestRate,
    data.exchangeRateUsdCny,
    data.treasuryYield10y,
  ])
}

function countGlobalMarketDataPoints(data: GlobalMarketSnapshot | null | undefined): number {
  if (!data) return 0
  return countNonNullValues([
    data.sp500Change,
    data.nasdaqChange,
    data.hsiChange,
    data.a50FuturesChange,
    data.usdCnyRate,
    data.crudeOilChange,
    data.goldChange,
    data.us10yYieldChange,
  ])
}

function appendFallbackError(log: DataAgentResult, message: string) {
  if (!log.errors.includes(message)) {
    log.errors = [...log.errors, message]
  }
}

function applyFactPoolBackups(
  tradeDate: string,
  backupFactPool: FactPool | null,
  results: {
    macroResult: { data: MacroEconomicData | null; log: DataAgentResult }
    sentimentResult: { data: SocialSentimentSnapshot[]; log: DataAgentResult }
    globalResult: { data: GlobalMarketSnapshot | null; log: DataAgentResult }
  },
): void {
  if (!backupFactPool) {
    return
  }

  if (backupFactPool.macroData && countMacroDataPoints(results.macroResult.data) <= 1) {
    results.macroResult.data = {
      ...backupFactPool.macroData,
      date: tradeDate,
    }
    results.macroResult.log.dataPointCount = countMacroDataPoints(results.macroResult.data)
    appendFallbackError(results.macroResult.log, `已回退到最近成功宏观快照(${backupFactPool.tradeDate})`)
    results.macroResult.log.successRate = computeSuccessRate(results.macroResult.log.dataPointCount, results.macroResult.log.errors.length)
  }

  if (backupFactPool.socialSentiment.length > 0 && results.sentimentResult.data.length < 3) {
    results.sentimentResult.data = backupFactPool.socialSentiment.map((item) => ({
      ...item,
      collectedAt: nowIso(),
    }))
    results.sentimentResult.log.dataPointCount = results.sentimentResult.data.length
    appendFallbackError(results.sentimentResult.log, `已回退到最近成功社交舆情快照(${backupFactPool.tradeDate})`)
    results.sentimentResult.log.successRate = computeSuccessRate(results.sentimentResult.log.dataPointCount, results.sentimentResult.log.errors.length)
  }

  if (backupFactPool.globalMarkets && countGlobalMarketDataPoints(results.globalResult.data) === 0) {
    results.globalResult.data = {
      ...backupFactPool.globalMarkets,
      collectedAt: nowIso(),
    }
    results.globalResult.log.dataPointCount = countGlobalMarketDataPoints(results.globalResult.data)
    appendFallbackError(results.globalResult.log, `已回退到最近成功全球市场快照(${backupFactPool.tradeDate})`)
    results.globalResult.log.successRate = computeSuccessRate(results.globalResult.log.dataPointCount, results.globalResult.log.errors.length)
  }
}

async function fetchYahooFinanceChangePercent(symbol: string, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<number | null> {
  const encodedSymbol = encodeURIComponent(symbol)
  const response = await fetchJsonWithTimeout<{
    chart?: {
      result?: Array<{
        indicators?: { quote?: Array<{ close?: Array<number | null> }> }
      }>
      error?: { description?: string } | null
    }
  }>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=5d`, {
    Referer: 'https://finance.yahoo.com/',
  }, timeoutMs)
  const closes = response.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
  return computeChangePercentFromSeries(closes)
}

async function fetchYahooFinanceLastClose(symbol: string, timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<number | null> {
  const encodedSymbol = encodeURIComponent(symbol)
  const response = await fetchJsonWithTimeout<{
    chart?: {
      result?: Array<{
        indicators?: { quote?: Array<{ close?: Array<number | null> }> }
      }>
    }
  }>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?interval=1d&range=5d`, {
    Referer: 'https://finance.yahoo.com/',
  }, timeoutMs)
  const closes = response.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []
  const numeric = closes.filter((value): value is number => Number.isFinite(value ?? NaN))
  return numeric.length > 0 ? numeric[numeric.length - 1] : null
}

// ==================== Agent 1: 宏观经济监测 ====================

async function collectMacroEconomy(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<{ data: MacroEconomicData | null; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'macro_economy'
  const errors: string[] = []
  let dataPoints = 0
  const fetchJson = <T>(url: string, headers?: Record<string, string>) => fetchJsonWithTimeout<T>(url, headers, timeoutMs)

  const macro: MacroEconomicData = {
    date: new Date().toISOString().slice(0, 10),
    gdpGrowth: null,
    cpi: null,
    pmi: null,
    interestRate: null,
    exchangeRateUsdCny: null,
    treasuryYield10y: null,
  }

  // [L17] 独立数据源并行采集，fallback 数据源保持串行
  const [akMacro, fxResult, sinaYield, akRate] = await Promise.all([
    // 数据源 1: AKShare — 宏观经济指标
    trySource('AKShare-macro', agentId, async () => {
      return runPythonJson<{ cpi?: number; pmi?: number; gdp_growth?: number }>(`
import akshare as ak, json
result = {}
try:
    cpi_df = ak.macro_china_cpi_monthly()
    if not cpi_df.empty:
        row = cpi_df.iloc[-1]
        for col in ['同比增长', '同比涨幅', '全国-同比']:
            if col in row.index:
                result['cpi'] = float(row[col]); break
except Exception as e:
    import sys; print(f"AKShare cpi error: {e}", file=sys.stderr)
try:
    pmi_df = ak.macro_china_pmi()
    if not pmi_df.empty:
        row = pmi_df.iloc[-1]
        for col in ['制造业', '制造业PMI', 'PMI']:
            if col in row.index:
                result['pmi'] = float(row[col]); break
except Exception as e:
    import sys; print(f"AKShare pmi error: {e}", file=sys.stderr)
try:
    gdp_df = ak.macro_china_gdp()
    if not gdp_df.empty:
        row = gdp_df.iloc[-1]
        for col in ['同比增长', '同比涨幅', 'GDP同比']:
            if col in row.index:
                result['gdp_growth'] = float(row[col]); break
except Exception as e:
    import sys; print(f"AKShare gdp error: {e}", file=sys.stderr)
print(json.dumps({"success": True, "data": result}))
`, timeoutMs)
    }),
    // 数据源 2+3+fallback: 汇率（东方财富 → AKShare-中行 → AKShare-即时汇率 串行链）
    (async () => {
      const emFx = await trySource('Eastmoney-fx', agentId, async () => {
        const resp = await fetchJson<{ rc: number; data?: { diff?: Array<{ f2?: number }> } }>(
          'https://push2.eastmoney.com/api/qt/clist/get?fid=f2&po=1&pz=1&pn=1&np=1&fltt=2&fs=m:119+t:1+c:USDCNY',
        )
        return resp.data?.diff?.[0]?.f2 ?? null
      })
      if (emFx !== null) return { value: emFx, source: 'Eastmoney-fx' as const }
      // fallback 1: AKShare 中国银行汇率（参数名 start_date/end_date，传最近 7 天范围）
      const akFx = await trySource('AKShare-fx', agentId, async () => {
        return runPythonJson<number>(`
import akshare as ak, json
from datetime import datetime, timedelta
end = datetime.now().strftime("%Y%m%d")
start = (datetime.now() - timedelta(days=7)).strftime("%Y%m%d")
df = ak.currency_boc_sina(symbol="美元", start_date=start, end_date=end)
rate = float(df.iloc[-1]['中行折算价']) / 100 if not df.empty else None
print(json.dumps({"success": True, "data": rate}))
`, timeoutMs)
      })
      if (akFx !== null) return { value: akFx, source: 'AKShare-fx' as const }
      // fallback 2: AKShare 即时外汇报价
      const akFxSpot = await trySource('AKShare-fx-spot', agentId, async () => {
        return runPythonJson<number>(`
import akshare as ak, json
try:
    df = ak.fx_spot_quote()
    row = df[df['货币对'].str.contains('USD/CNY')]
    rate = float(row.iloc[0]['最新价']) if not row.empty else None
    print(json.dumps({"success": True, "data": rate}))
except Exception as e:
    print(json.dumps({"success": False, "error": f"fx_spot_quote failed: {e}"}))
`, timeoutMs)
      })
      if (akFxSpot !== null) return { value: akFxSpot, source: 'AKShare-fx-spot' as const }
      return null
    })(),
    // 数据源 4+fallback: 国债收益率（AKShare-中债 → 东方财富国债行情 串行链）
    (async () => {
      const akYield = await trySource('AKShare-yield', agentId, async () => {
        return runPythonJson<number>(`
import akshare as ak, json
from datetime import datetime, timedelta
end = datetime.now().strftime("%Y%m%d")
start = (datetime.now() - timedelta(days=30)).strftime("%Y%m%d")
df = ak.bond_china_yield(start_date=start, end_date=end)
if not df.empty:
    subset = df[df['曲线名称']=='中债国债收益率曲线']
    if not subset.empty:
        val = float(subset.iloc[-1].get('10年', 0))
        print(json.dumps({"success": True, "data": val}))
    else:
        print(json.dumps({"success": True, "data": None}))
else:
    print(json.dumps({"success": True, "data": None}))
`, timeoutMs)
      })
      if (akYield !== null) return akYield
      // fallback: 东方财富国债实时行情
      const emYield = await trySource('Eastmoney-yield', agentId, async () => {
        const resp = await fetchJson<{ data?: { diff?: Array<{ f12?: string; f2?: number }> } }>(
          'https://push2.eastmoney.com/api/qt/clist/get?fid=f3&po=1&pz=10&pn=1&np=1&fltt=2&fs=b:MK0354',
        )
        const list = resp.data?.diff ?? []
        for (const item of list) {
          const code = item.f12 ?? ''
          if (code.includes('10') || code === '019547') {
            return item.f2 ?? null
          }
        }
        return null
      })
      return emYield
    })(),
    // 数据源 5: AKShare — 利率（LPR）
    trySource('AKShare-lpr', agentId, async () => {
      return runPythonJson<number>(`
import akshare as ak, json
df = ak.macro_china_lpr()
rate = float(df.iloc[-1]['LPR1Y']) if not df.empty else None
print(json.dumps({"success": True, "data": rate}))
`, timeoutMs)
    }),
  ])

  // 处理结果 + [P2-6] 数值合理性校验
  if (akMacro) {
    const cpi = validateNumericRange(akMacro.cpi, -10, 30, 'CPI')
    const pmi = validateNumericRange(akMacro.pmi, 20, 80, 'PMI')
    const gdp = validateNumericRange(akMacro.gdp_growth, -30, 30, 'GDP增长')
    if (cpi !== null) { macro.cpi = cpi; dataPoints++ }
    if (pmi !== null) { macro.pmi = pmi; dataPoints++ }
    if (gdp !== null) { macro.gdpGrowth = gdp; dataPoints++ }
  } else {
    errors.push('AKShare-macro 失败')
  }

  if (fxResult !== null) {
    const fx = validateNumericRange(fxResult.value, 4, 12, '美元兑人民币')
    if (fx !== null) { macro.exchangeRateUsdCny = fx; dataPoints++ }
  } else { errors.push('所有汇率数据源均失败') }

  if (sinaYield !== null) {
    const yld = validateNumericRange(sinaYield, -2, 20, '10年国债收益率')
    if (yld !== null) { macro.treasuryYield10y = yld; dataPoints++ }
  } else { errors.push('所有国债收益率数据源均失败') }

  if (akRate !== null) {
    const rate = validateNumericRange(akRate, 0, 20, 'LPR利率')
    if (rate !== null) { macro.interestRate = rate; dataPoints++ }
  } else { errors.push('AKShare-lpr 失败') }

  return { data: dataPoints > 0 ? macro : null, log: createAgentResult(agentId, start, dataPoints, errors) }
}

// ==================== Agent 2: 政策法规跟踪 ====================

async function collectPolicyRegulation(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<{ data: PolicyEvent[]; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'policy_regulation'
  const errors: string[] = []
  const events: PolicyEvent[] = []
  const fetchJson = <T>(url: string, headers?: Record<string, string>) => fetchJsonWithTimeout<T>(url, headers, timeoutMs)

  // 数据源 1: AKShare — 新闻联播文字稿 (政策信号，尝试今天和昨天)
  const akNews = await trySource('AKShare-news', agentId, async () => {
    return runPythonJson<Array<{ title: string; date: string; content: string }>>(`
import akshare as ak, json
from datetime import datetime, timedelta
items = []
# 尝试今天和昨天的新闻（当天可能尚未更新）
for delta in [0, 1]:
    try:
        d = (datetime.now() - timedelta(days=delta)).strftime("%Y%m%d")
        df = ak.news_cctv(date=d)
        for _, row in df.head(10).iterrows():
            items.append({"title": str(row.get('title','')), "date": str(row.get('date','')), "content": str(row.get('content',''))[:500]})
        if items:
            break
    except Exception:
        pass
print(json.dumps({"success": True, "data": items}, ensure_ascii=False))
`, timeoutMs)
  })
  if (akNews && akNews.length > 0) {
    for (const item of akNews) {
      events.push({
        id: `policy-cctv-${item.date}-${events.length}`,
        source: 'CCTV新闻联播',
        title: item.title,
        publishedAt: item.date,
        category: classifyPolicyCategory(item.title, item.content),
        rawText: item.content,
        affectedSectors: classifyNewsSectors(item.title, item.content),
      })
    }
  } else {
    errors.push('AKShare-news 无数据')
  }

  // 数据源 2: 东方财富 — 财经要闻（kuaixun JSONP 接口，替代已失效的 getNewsByColumns）
  const emNews = await trySource('Eastmoney-news', agentId, async () => {
    return fetchEastmoneyKuaixun(102, 15, timeoutMs)
  })
  if (emNews && emNews.length > 0) {
    for (const item of emNews) {
      events.push({
        id: `policy-em-${events.length}`,
        source: '东方财富要闻',
        title: item.title,
        publishedAt: item.showtime || nowIso(),
        category: classifyPolicyCategory(item.title, item.digest),
        rawText: item.digest,
        affectedSectors: classifyNewsSectors(item.title, item.digest),
      })
    }
  } else {
    errors.push('Eastmoney-news 无数据')
  }

  // 数据源 3: 新浪财经 — 国内要闻
  await trySource('Sina-news', agentId, async () => {
    const resp = await fetchJson<{ result?: { data?: Array<{ title?: string; ctime?: string; intro?: string }> } }>(
      'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=10&page=1',
    )
    const list = resp.result?.data ?? []
    for (const item of list) {
      events.push({
        id: `policy-sina-${events.length}`,
        source: '新浪财经',
        title: item.title ?? '',
        publishedAt: item.ctime ?? nowIso(),
        category: classifyPolicyCategory(item.title ?? '', item.intro ?? ''),
        rawText: item.intro ?? '',
        affectedSectors: classifyNewsSectors(item.title ?? '', item.intro ?? ''),
      })
    }
    return list.length
  })

  // 数据源 4: 腾讯财经
  await trySource('Tencent-news', agentId, async () => {
    const resp = await fetchJson<{ data?: { articleList?: Array<{ title?: string; pubtime?: string; abstract?: string }> } }>(
      'https://r.inews.qq.com/getSimpleNews?ids=finance_caijingyaowen&imei=1&num=10',
    )
    const list = resp.data?.articleList ?? []
    for (const item of list) {
      events.push({
        id: `policy-qq-${events.length}`,
        source: '腾讯财经',
        title: item.title ?? '',
        publishedAt: item.pubtime ?? nowIso(),
        category: classifyPolicyCategory(item.title ?? '', item.abstract ?? ''),
        rawText: item.abstract ?? '',
        affectedSectors: classifyNewsSectors(item.title ?? '', item.abstract ?? ''),
      })
    }
    return list.length
  })

  // 数据源 5: AKShare — 央行公开市场操作
  await trySource('AKShare-pboc', agentId, async () => {
    const items = await runPythonJson<Array<{ title: string; date: string }>>(`
import akshare as ak, json
try:
    df = ak.macro_china_money_supply()
    items = []
    for _, row in df.tail(5).iterrows():
        items.append({"title": f"货币供应: M2同比{row.get('M2-同比','')}%, M1同比{row.get('M1-同比','')}%", "date": str(row.get('月份',''))})
    print(json.dumps({"success": True, "data": items}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"success": False, "error": f"macro_china_money_supply failed: {e}"}))
`, timeoutMs)
    for (const item of items) {
      events.push({
        id: `policy-pboc-${events.length}`,
        source: '央行货币供应',
        title: item.title,
        publishedAt: item.date,
        category: 'monetary_policy',
        rawText: item.title,
        affectedSectors: [],
      })
    }
    return items.length
  })

  return { data: events, log: createAgentResult(agentId, start, events.length, errors) }
}

// ==================== Agent 3: 上市公司公告 ====================

async function collectCompanyInfo(
  quotes: Map<string, StockAnalysisSpotQuote>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<{ data: CompanyAnnouncement[]; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'company_info'
  const errors: string[] = []
  const announcements: CompanyAnnouncement[] = []
  const fetchJson = <T>(url: string, headers?: Record<string, string>) => fetchJsonWithTimeout<T>(url, headers, timeoutMs)

  // 提取关注的股票代码
  const codes = [...quotes.keys()].slice(0, 50) // 只关注前 50 只，避免请求过多

  // 数据源 1: 东方财富 — 公司公告 (批量)
  // API 实际返回 { data: { list: [...], page_index, page_size, total_hits }, success, error }
  const emAnn = await trySource('Eastmoney-announcements', agentId, async () => {
    const resp = await fetchJson<{
      data?: { list?: Array<{ securityCode?: string; securityName?: string; title?: string; noticeDate?: string; infoCode?: string }> }
    }>(
      'https://np-anotice-stock.eastmoney.com/api/security/ann?cb=&sr=-1&page_size=30&page_index=1&ann_type=A&f_node=0&s_node=0',
    )
    return resp.data?.list ?? []
  })
  if (emAnn && emAnn.length > 0) {
    for (const item of emAnn) {
      const cls = classifyAnnouncementCategory(item.title ?? '')
      announcements.push({
        code: item.securityCode ?? '',
        name: item.securityName ?? '',
        title: item.title ?? '',
        publishedAt: item.noticeDate ?? nowIso(),
        category: cls.category,
        importance: cls.importance,
        rawText: item.title ?? '',
      })
    }
  } else {
    errors.push('Eastmoney-announcements 无数据')
  }

  // 数据源 2: 巨潮资讯网 — 公告
  await trySource('CNINFO-announcements', agentId, async () => {
    const resp = await fetchJson<{
      announcements?: Array<{ secCode?: string; secName?: string; announcementTitle?: string; announcementTime?: number; announcementId?: string }>
    }>(
      'http://www.cninfo.com.cn/new/disclosure/stock?column=sse_latest&pageNum=1&pageSize=20',
      { Referer: 'http://www.cninfo.com.cn/' },
    )
    const list = resp.announcements ?? []
    for (const item of list) {
      const cls = classifyAnnouncementCategory(item.announcementTitle ?? '')
      announcements.push({
        code: item.secCode ?? '',
        name: item.secName ?? '',
        title: item.announcementTitle ?? '',
        publishedAt: item.announcementTime ? new Date(item.announcementTime).toISOString() : nowIso(),
        category: cls.category,
        importance: cls.importance,
        rawText: item.announcementTitle ?? '',
      })
    }
    return list.length
  })

  // 数据源 3: AKShare — 个股公告
  if (codes.length > 0) {
    const sampleCodes = codes.slice(0, 5) // 采样 5 个
    await trySource('AKShare-stock-notices', agentId, async () => {
      const safeCodes = sampleCodes.filter(validateStockCode)
      if (safeCodes.length === 0) return 0
      const codeStr = safeCodes.map((c) => `"${c}"`).join(',')
      const items = await runPythonJson<Array<{ code: string; title: string; date: string }>>(`
import akshare as ak, json
results = []
for code in [${codeStr}]:
    try:
        df = ak.stock_notices_cninfo(symbol=code)
        for _, row in df.head(3).iterrows():
            results.append({"code": code, "title": str(row.get('公告标题','')), "date": str(row.get('公告时间',''))})
    except Exception as e:
        import sys; print(f"AKShare notices error for {code}: {e}", file=sys.stderr)
print(json.dumps({"success": True, "data": results}, ensure_ascii=False))
`, timeoutMs)
      for (const item of items) {
        const quote = quotes.get(item.code)
        const cls = classifyAnnouncementCategory(item.title)
        announcements.push({
          code: item.code,
          name: quote?.name ?? item.code,
          title: item.title,
          publishedAt: item.date,
          category: cls.category,
          importance: cls.importance,
          rawText: item.title,
        })
      }
      return items.length
    })
  }

  // 数据源 4: 新浪财经 — 公告
  await trySource('Sina-announcements', agentId, async () => {
    const resp = await fetchJson<{ result?: { data?: Array<{ title?: string; ctime?: string; media_name?: string }> } }>(
      'https://feed.mix.sina.com.cn/api/roll/get?pageid=155&lid=2516&k=&num=10&page=1',
    )
    const list = resp.result?.data ?? []
    for (const item of list) {
      const cls = classifyAnnouncementCategory(item.title ?? '')
      announcements.push({
        code: '',
        name: item.media_name ?? '',
        title: item.title ?? '',
        publishedAt: item.ctime ?? nowIso(),
        category: cls.category,
        importance: cls.importance,
        rawText: item.title ?? '',
      })
    }
    return list.length
  })

  // 数据源 5: 腾讯自选股公告
  await trySource('Tencent-announcements', agentId, async () => {
    const resp = await fetchJson<{
      data?: { article_list?: Array<{ title?: string; pub_time?: string; source_name?: string }> }
    }>(
      'https://r.inews.qq.com/getSimpleNews?ids=stock_gonggao&imei=1&num=10',
    )
    const list = resp.data?.article_list ?? []
    for (const item of list) {
      const cls = classifyAnnouncementCategory(item.title ?? '')
      announcements.push({
        code: '',
        name: item.source_name ?? '',
        title: item.title ?? '',
        publishedAt: item.pub_time ?? nowIso(),
        category: cls.category,
        importance: cls.importance,
        rawText: item.title ?? '',
      })
    }
    return list.length
  })

  // P1-16: 跨数据源去重（按标题精确匹配）
  const seen = new Set<string>()
  const dedupedAnnouncements = announcements.filter((a) => {
    const key = a.title.trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { data: dedupedAnnouncements, log: createAgentResult(agentId, start, dedupedAnnouncements.length, errors) }
}

// ==================== Agent 4: 价格量能监控 ====================
// 此 Agent 的数据大部分已由 service.ts 中的 getQuoteData/buildSnapshot 获取，
// 这里主要补充龙虎榜/大宗交易/资金流等增量数据。

async function collectPriceVolume(
  quotes: Map<string, StockAnalysisSpotQuote>,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<{ data: PriceVolumeExtras; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'price_volume'
  const errors: string[] = []
  let dataPoints = 0 // 只统计本 Agent 实际新采集的数据
  const fetchJson = <T>(url: string, headers?: Record<string, string>) => fetchJsonWithTimeout<T>(url, headers, timeoutMs)

  // [H5] 收集的数据存入这些变量
  const moneyFlow: MoneyFlowItem[] = []
  const sectorFlow: SectorFlowItem[] = []
  let dragonTiger: DragonTigerSummary | null = null
  let blockTrade: BlockTradeSummary | null = null
  let marginTrading: MarginTradingSummary | null = null

  // 数据源 1: 东方财富 — 资金流向
  await trySource('Eastmoney-moneyflow', agentId, async () => {
    const resp = await fetchJson<{ data?: { diff?: Array<{ f12?: string; f14?: string; f62?: number; f2?: number; f3?: number }> } }>(
      'https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=10&pn=1&np=1&fltt=2&fs=m:0+t:6+f:!2,m:0+t:13+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2,m:1+t:23+f:!2,m:0+t:7+f:!2,m:0+t:81+f:!2',
    )
    const items = resp.data?.diff ?? []
    dataPoints += items.length
    // [H5] 保留资金流向数据
    for (const item of items.slice(0, 10)) {
      moneyFlow.push({
        code: String(item.f12 ?? ''),
        name: String(item.f14 ?? ''),
        mainNetInflow: (item.f62 ?? 0) / 10000, // 转换为万元
        changePercent: item.f3 ?? 0,
      })
    }
    return true
  })

  // 数据源 2: AKShare — 龙虎榜
  await trySource('AKShare-lhb', agentId, async () => {
    const count = await runPythonJson<number>(`
import akshare as ak, json
try:
    df = ak.stock_lhb_detail_daily_sina()
    print(json.dumps({"success": True, "data": len(df) if not df.empty else 0}))
except Exception as e:
    import sys; print(f"AKShare lhb error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"stock_lhb_detail_daily_sina failed: {e}"}))
`, timeoutMs)
    dataPoints += count
    // [H5] 保留龙虎榜概要
    if (count > 0) {
      dragonTiger = { stockCount: count, tradeDate: new Date().toISOString().slice(0, 10) }
    }
    return count
  })

  // 数据源 3: AKShare — 大宗交易
  await trySource('AKShare-block-trade', agentId, async () => {
    const count = await runPythonJson<number>(`
import akshare as ak, json
try:
    df = ak.stock_dzjy_mrtj()
    print(json.dumps({"success": True, "data": len(df) if not df.empty else 0}))
except Exception as e:
    import sys; print(f"AKShare block-trade error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"stock_dzjy_mrtj failed: {e}"}))
`, timeoutMs)
    dataPoints += count
    // [H5] 保留大宗交易概要
    if (count > 0) {
      blockTrade = { tradeCount: count, tradeDate: new Date().toISOString().slice(0, 10) }
    }
    return count
  })

  // 数据源 4: 东方财富 — 板块资金流
  await trySource('Eastmoney-sector-flow', agentId, async () => {
    const resp = await fetchJson<{ data?: { diff?: Array<{ f14?: string; f62?: number }> } }>(
      'https://push2.eastmoney.com/api/qt/clist/get?fid=f62&po=1&pz=10&pn=1&np=1&fltt=2&fs=m:90+t:2',
    )
    const items = resp.data?.diff ?? []
    dataPoints += items.length
    // [H5] 保留板块资金流数据
    for (const item of items.slice(0, 10)) {
      sectorFlow.push({
        sectorName: String(item.f14 ?? ''),
        netInflow: (item.f62 ?? 0) / 10000, // 转换为万元
      })
    }
    return true
  })

  // 数据源 5: AKShare — 融资融券
  await trySource('AKShare-margin', agentId, async () => {
    const count = await runPythonJson<number>(`
import akshare as ak, json
try:
    df = ak.stock_margin_sse()
    print(json.dumps({"success": True, "data": len(df) if not df.empty else 0}))
except Exception as e:
    import sys; print(f"AKShare margin error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"stock_margin_sse failed: {e}"}))
`, timeoutMs)
    dataPoints += count
    // [H5] 保留融资融券概要
    if (count > 0) {
      marginTrading = { recordCount: count, tradeDate: new Date().toISOString().slice(0, 10) }
    }
    return count
  })

  if (dataPoints === 0) errors.push('所有价格量能数据源失败')

  const data: PriceVolumeExtras = { moneyFlow, sectorFlow, dragonTiger, blockTrade, marginTrading }
  return { data, log: createAgentResult(agentId, start, dataPoints, errors) }
}

// ==================== Agent 5: 行业新闻分析 ====================

async function collectIndustryNews(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<{ data: IndustryNewsItem[]; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'industry_news'
  const errors: string[] = []
  const news: IndustryNewsItem[] = []
  const fetchJson = <T>(url: string, headers?: Record<string, string>) => fetchJsonWithTimeout<T>(url, headers, timeoutMs)

  // 数据源 1: 东方财富 — 行业资讯（kuaixun JSONP 接口，替代已失效的 getNewsByColumns）
  await trySource('Eastmoney-industry', agentId, async () => {
    const list = await fetchEastmoneyKuaixun(104, 15, timeoutMs)
    for (const item of list) {
      news.push({
        id: `news-em-${news.length}`,
        title: item.title,
        source: '东方财富行业',
        publishedAt: item.showtime || nowIso(),
        sectors: classifyNewsSectors(item.title, item.digest),
        rawSummary: item.digest,
      })
    }
    return list.length
  })

  // 数据源 2: 新浪财经 — 上市公司新闻
  await trySource('Sina-industry', agentId, async () => {
    const resp = await fetchJson<{ result?: { data?: Array<{ title?: string; ctime?: string; intro?: string }> } }>(
      'https://feed.mix.sina.com.cn/api/roll/get?pageid=155&lid=2686&k=&num=10&page=1',
    )
    const list = resp.result?.data ?? []
    for (const item of list) {
      news.push({
        id: `news-sina-${news.length}`,
        title: item.title ?? '',
        source: '新浪财经',
        publishedAt: item.ctime ?? nowIso(),
        sectors: classifyNewsSectors(item.title ?? '', item.intro ?? ''),
        rawSummary: item.intro ?? '',
      })
    }
    return list.length
  })

  // 数据源 3: 腾讯财经 — 行业新闻
  await trySource('Tencent-industry', agentId, async () => {
    const resp = await fetchJson<{ data?: { articleList?: Array<{ title?: string; pubtime?: string; abstract?: string }> } }>(
      'https://r.inews.qq.com/getSimpleNews?ids=stock_hangye&imei=1&num=10',
    )
    const list = resp.data?.articleList ?? []
    for (const item of list) {
      news.push({
        id: `news-qq-${news.length}`,
        title: item.title ?? '',
        source: '腾讯财经',
        publishedAt: item.pubtime ?? nowIso(),
        sectors: classifyNewsSectors(item.title ?? '', item.abstract ?? ''),
        rawSummary: item.abstract ?? '',
      })
    }
    return list.length
  })

  // 数据源 4: AKShare — 行业新闻
  await trySource('AKShare-industry-news', agentId, async () => {
    const items = await runPythonJson<Array<{ title: string; date: string; content: string }>>(`
import akshare as ak, json
try:
    df = ak.stock_info_global_em()
    items = []
    for _, row in df.head(10).iterrows():
        items.append({"title": str(row.get('标题','')), "date": str(row.get('时间','')), "content": str(row.get('内容',''))[:300]})
    print(json.dumps({"success": True, "data": items}, ensure_ascii=False))
except Exception as e:
    import sys; print(f"AKShare industry news error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"stock_news_em failed: {e}"}))
`, timeoutMs)
    for (const item of items) {
      news.push({
        id: `news-ak-${news.length}`,
        title: item.title,
        source: 'AKShare',
        publishedAt: item.date,
        sectors: classifyNewsSectors(item.title, item.content),
        rawSummary: item.content,
      })
    }
    return items.length
  })

  // 数据源 5: 东方财富 — 研报摘要（独立研报 API，替代已失效的 getNewsByColumns）
  await trySource('Eastmoney-research', agentId, async () => {
    const resp = await fetchJson<{ data?: Array<{ title?: string; publishDate?: string; stockName?: string; industryName?: string }> }>(
      'https://reportapi.eastmoney.com/report/list?industryCode=*&pageSize=10&industry=*&rating=&ratingChange=&beginTime=&endTime=&pageNo=1&fields=&qType=0&orgCode=&rcode=',
    )
    const list = resp.data ?? []
    for (const item of list) {
      news.push({
        id: `news-research-${news.length}`,
        title: item.title ?? '',
        source: '东方财富研报',
        publishedAt: item.publishDate ?? nowIso(),
        sectors: classifyNewsSectors(item.title ?? '', `${item.stockName ?? ''} ${item.industryName ?? ''}`),
        rawSummary: `${item.stockName ?? ''} ${item.industryName ?? ''}`.trim(),
      })
    }
    return list.length
  })

  if (news.length === 0) errors.push('所有行业新闻源均无数据')

  // P1-16: 跨数据源去重（按标题精确匹配）
  const seenTitles = new Set<string>()
  const dedupedNews = news.filter((n) => {
    const key = n.title.trim()
    if (seenTitles.has(key)) return false
    seenTitles.add(key)
    return true
  })

  return { data: dedupedNews, log: createAgentResult(agentId, start, dedupedNews.length, errors) }
}

// ==================== Agent 6: 社交媒体情绪 ====================

/** 从涨跌幅数据计算牛熊比例，避免硬编码 */
/**
 * P2-B1: 基于涨跌幅分布推算市场情绪指标。
 * 注意：这是价格衍生指标（而非真正的社交媒体情绪），仅作为情绪代理使用。
 * 理想情况下应使用真实的社交媒体情绪数据（如微博/雪球热词分析）。
 */
function computeBullBearRatio(changes: number[]): { bull: number; bear: number; neutral: number } {
  if (changes.length === 0) return { bull: 0.33, bear: 0.33, neutral: 0.34 }
  let bull = 0
  let bear = 0
  let neutral = 0
  for (const c of changes) {
    if (c > 0.5) bull++
    else if (c < -0.5) bear++
    else neutral++
  }
  const total = changes.length
  return {
    bull: Math.round((bull / total) * 100) / 100,
    bear: Math.round((bear / total) * 100) / 100,
    neutral: Math.round((neutral / total) * 100) / 100,
  }
}

export function computeBullBearRatioFromSentimentScores(scores: number[]): { bull: number; bear: number; neutral: number } {
  if (scores.length === 0) return { bull: 0.33, bear: 0.33, neutral: 0.34 }
  let bull = 0
  let bear = 0
  let neutral = 0
  for (const score of scores) {
    if (score > 0.2) bull++
    else if (score < -0.2) bear++
    else neutral++
  }
  const total = scores.length
  return {
    bull: Math.round((bull / total) * 100) / 100,
    bear: Math.round((bear / total) * 100) / 100,
    neutral: Math.round((neutral / total) * 100) / 100,
  }
}

function clampSentiment(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value * 100) / 100))
}

export function normalizeAStockCode(rawCode: string): string {
  return rawCode.replace(/^(SH|SZ|BJ)/i, '').replace(/[^0-9]/g, '').slice(-6)
}

function inferEastmoneySecid(code: string): string | null {
  const normalized = normalizeAStockCode(code)
  if (!normalized) return null
  if (/^(60|68|90)/.test(normalized)) return `1.${normalized}`
  if (/^(00|20|30|15|16|18|12|13)/.test(normalized)) return `0.${normalized}`
  if (/^(4|8)/.test(normalized)) return `0.${normalized}`
  return null
}

async function fetchAStockChangePercents(codes: string[], timeoutMs: number): Promise<Map<string, number>> {
  const uniqueCodes = Array.from(new Set(codes.map(normalizeAStockCode).filter(Boolean))).slice(0, 20)
  const changes = await Promise.all(uniqueCodes.map(async (code) => {
    const secid = inferEastmoneySecid(code)
    if (!secid) return null
    const quote = await fetchEastmoneyQuote(secid, Math.min(timeoutMs, 30_000))
    if (!quote) return null
    return [code, quote.changePercent] as const
  }))
  return new Map(changes.filter((item): item is readonly [string, number] => Boolean(item)))
}

function mergeMentionedStocks(
  items: Array<{ code: string; mentionCount: number; sentiment: number }>,
): Array<{ code: string; mentionCount: number; sentiment: number }> {
  const merged = new Map<string, { mentionCount: number; sentimentSum: number; sentimentCount: number }>()
  for (const item of items) {
    const code = item.code.trim()
    if (!code) continue
    const existing = merged.get(code) ?? { mentionCount: 0, sentimentSum: 0, sentimentCount: 0 }
    existing.mentionCount += Math.max(1, Math.round(item.mentionCount || 0))
    existing.sentimentSum += item.sentiment
    existing.sentimentCount += 1
    merged.set(code, existing)
  }
  return Array.from(merged.entries())
    .map(([code, entry]) => ({
      code,
      mentionCount: entry.mentionCount,
      sentiment: clampSentiment(entry.sentimentCount > 0 ? entry.sentimentSum / entry.sentimentCount : 0),
    }))
    .sort((left, right) => right.mentionCount - left.mentionCount)
}

function buildSentimentSummaryText(
  platformLabel: string,
  ratio: { bull: number; bear: number; neutral: number },
  hotTopics: string[],
): string {
  const stance = ratio.bull > ratio.bear ? '偏多' : ratio.bull < ratio.bear ? '偏空' : '中性'
  const topicText = hotTopics.filter(Boolean).slice(0, 3).join('、') || '无明显热点'
  return `${platformLabel}${stance}，多${Math.round(ratio.bull * 100)}%/空${Math.round(ratio.bear * 100)}%，热点: ${topicText}`
}

/** 根据标题和正文关键词推断政策分类 */
function classifyPolicyCategory(title: string, text: string): 'monetary_policy' | 'regulatory' | 'industry' | 'fiscal' | 'other' {
  const combined = `${title} ${text}`.toLowerCase()
  // 货币政策
  if (/利率|降息|加息|降准|准备金|mlf|slf|逆回购|lpr|央行|货币政策|公开市场/.test(combined)) {
    return 'monetary_policy'
  }
  // 监管政策
  if (/证监会|银保监|交易所|监管|处罚|合规|反垄断|退市|注册制|ipo审核/.test(combined)) {
    return 'regulatory'
  }
  // 财政政策
  if (/财政|税收|减税|降费|国债|专项债|财政赤字|转移支付|补贴/.test(combined)) {
    return 'fiscal'
  }
  // 产业政策
  if (/产业|新能源|芯片|半导体|碳中和|碳达峰|数字经济|人工智能|新基建|5g|医药|军工/.test(combined)) {
    return 'industry'
  }
  return 'other'
}

/** 根据标题关键词推断公告重要性和分类 */
function classifyAnnouncementCategory(title: string): { category: 'earnings' | 'insider_trading' | 'equity_change' | 'litigation' | 'other'; importance: 'major' | 'normal' | 'routine' } {
  const t = title.toLowerCase()
  // 业绩公告
  if (/年报|半年报|季报|业绩预告|业绩快报|利润|营收|净利|亏损|盈利/.test(t)) {
    return { category: 'earnings', importance: /年报|半年报|业绩预告/.test(t) ? 'major' : 'normal' }
  }
  // 股权变动
  if (/增持|减持|回购|增发|配股|定增|股权转让|举牌|要约收购/.test(t)) {
    return { category: 'equity_change', importance: /回购|定增|要约收购|举牌/.test(t) ? 'major' : 'normal' }
  }
  // 内幕交易/高管变动
  if (/内幕|高管|董事|监事|辞职|任命|薪酬/.test(t)) {
    return { category: 'insider_trading', importance: /辞职|任命/.test(t) ? 'normal' : 'routine' }
  }
  // 诉讼/风险
  if (/诉讼|仲裁|立案|处罚|违规|风险提示|ST|退市/.test(t)) {
    return { category: 'litigation', importance: /立案|退市|ST/.test(t) ? 'major' : 'normal' }
  }
  return { category: 'other', importance: 'routine' }
}

/** 根据标题和摘要推断行业新闻涉及的板块 */
function classifyNewsSectors(title: string, summary: string): string[] {
  const combined = `${title} ${summary}`.toLowerCase()
  const sectors: string[] = []
  const sectorKeywords: Record<string, RegExp> = {
    '新能源': /新能源|光伏|风电|储能|锂电|电池|充电桩|氢能/,
    '半导体': /半导体|芯片|晶圆|封测|ic设计|光刻|soc|gpu|cpu/,
    '人工智能': /人工智能|ai|大模型|机器学习|深度学习|算力|智能计算/,
    '医药生物': /医药|生物|创新药|仿制药|cxo|疫苗|基因|中药/,
    '消费': /白酒|食品|饮料|零售|消费|电商|家电|纺织/,
    '金融': /银行|保险|证券|券商|基金|信托|金融/,
    '地产': /房地产|地产|楼市|保交楼|住房|物业/,
    '军工': /军工|国防|航天|航空|武器|军品|北斗/,
    '汽车': /汽车|新车|智驾|自动驾驶|车企|电动车|整车/,
    '通信': /通信|5g|6g|光纤|运营商|基站|卫星/,
  }
  for (const [sector, regex] of Object.entries(sectorKeywords)) {
    if (regex.test(combined)) sectors.push(sector)
  }
  return sectors
}

async function collectSocialSentiment(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<{ data: SocialSentimentSnapshot[]; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'social_sentiment'
  const errors: string[] = []
  const snapshots: SocialSentimentSnapshot[] = []
  const fetchJson = <T>(url: string, headers?: Record<string, string>) => fetchJsonWithTimeout<T>(url, headers, timeoutMs)

  // 数据源 1: 雪球真实讨论/关注热度（AKShare）
  const [xqTweet, xqFollow] = await Promise.all([
    trySource('AKShare-xueqiu-tweet', agentId, async () => {
      return runPythonJson<Array<{ code: string; name: string; mentionCount: number }>>(`
import akshare as ak, json
try:
    df = ak.stock_hot_tweet_xq()
    items = []
    for _, row in df.head(20).iterrows():
        code = str(row.get('股票代码', ''))
        name = str(row.get('股票简称', ''))
        mention = row.get('关注', 0)
        items.append({
            "code": code,
            "name": name,
            "mentionCount": int(float(mention)) if mention is not None and str(mention).strip() else 0,
        })
    print(json.dumps({"success": True, "data": items}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"success": False, "error": f"stock_hot_tweet_xq failed: {e}"}, ensure_ascii=False))
`, timeoutMs)
    }),
    trySource('AKShare-xueqiu-follow', agentId, async () => {
      return runPythonJson<Array<{ code: string; name: string; mentionCount: number }>>(`
import akshare as ak, json
try:
    df = ak.stock_hot_follow_xq()
    items = []
    for _, row in df.head(20).iterrows():
        code = str(row.get('股票代码', ''))
        name = str(row.get('股票简称', ''))
        mention = row.get('关注', 0)
        items.append({
            "code": code,
            "name": name,
            "mentionCount": int(float(mention)) if mention is not None and str(mention).strip() else 0,
        })
    print(json.dumps({"success": True, "data": items}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"success": False, "error": f"stock_hot_follow_xq failed: {e}"}, ensure_ascii=False))
`, timeoutMs)
    }),
  ])
  const xueqiuItems = [...(xqTweet ?? []), ...(xqFollow ?? [])]
  if (xueqiuItems.length > 0) {
    const xueqiuChangeMap = await trySource('Eastmoney-xueqiu-quotes', agentId, async () => {
      return fetchAStockChangePercents(xueqiuItems.map((item) => item.code), timeoutMs)
    })
    const xueqiuMentionedStocks = mergeMentionedStocks(xueqiuItems.map((item) => {
      const code = normalizeAStockCode(item.code)
      const changePercent = xueqiuChangeMap?.get(code) ?? 0
      return {
        code,
        mentionCount: item.mentionCount,
        sentiment: clampSentiment(changePercent / 10),
      }
    }))
    const xueqiuScores = xueqiuMentionedStocks.map((item) => item.sentiment)
    const xueqiuRatio = computeBullBearRatioFromSentimentScores(xueqiuScores)
    const xueqiuTopics = xueqiuItems
      .sort((left, right) => right.mentionCount - left.mentionCount)
      .slice(0, 10)
      .map((item) => item.name)
    snapshots.push({
      collectedAt: nowIso(),
      platform: 'xueqiu',
      sourceKind: 'primary_sentiment',
      summary: buildSentimentSummaryText('雪球舆情', xueqiuRatio, xueqiuTopics),
      hotTopics: xueqiuTopics,
      overallBullBearRatio: xueqiuRatio,
      topMentionedStocks: xueqiuMentionedStocks.slice(0, 20),
    })
    saLog.info('DataAgents', `社交舆情-雪球: 样本=${xueqiuItems.length} 有行情=${xueqiuMentionedStocks.length}`)
  } else {
    errors.push('雪球讨论/关注热度无数据')
  }

  // 数据源 2: 微博真实舆情报告（AKShare）
  const weiboReport = await trySource('AKShare-weibo-report', agentId, async () => {
    return runPythonJson<Array<{ name: string; rate: number }>>(`
import akshare as ak, json
try:
    df = ak.stock_js_weibo_report(time_period='CNHOUR12')
    items = []
    for _, row in df.head(20).iterrows():
        name = str(row.get('name', ''))
        rate = row.get('rate', 0)
        items.append({
            "name": name,
            "rate": float(rate) if rate is not None and str(rate).strip() else 0.0,
        })
    print(json.dumps({"success": True, "data": items}, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"success": False, "error": f"stock_js_weibo_report failed: {e}"}, ensure_ascii=False))
`, timeoutMs)
  })
  if (weiboReport && weiboReport.length > 0) {
    const weiboScores = weiboReport.map((item) => item.rate)
    const weiboRatio = computeBullBearRatioFromSentimentScores(weiboScores)
    const weiboTopics = weiboReport.slice(0, 10).map((item) => item.name)
    snapshots.push({
      collectedAt: nowIso(),
      platform: 'weibo',
      sourceKind: 'primary_sentiment',
      summary: buildSentimentSummaryText('微博舆情', weiboRatio, weiboTopics),
      hotTopics: weiboTopics,
      overallBullBearRatio: weiboRatio,
      topMentionedStocks: weiboReport.slice(0, 20).map((item) => ({
        code: item.name,
        mentionCount: Math.max(1, Math.round(Math.abs(item.rate) * 10)),
        sentiment: clampSentiment(item.rate / 5),
      })),
    })
    saLog.info('DataAgents', `社交舆情-微博: 样本=${weiboReport.length}`)
  } else {
    errors.push('微博舆情报告无数据')
  }

  // 数据源 3: 同花顺热股排名（真实热榜补充，用于补热点主题）
  const ths10jqka = await trySource('10jqka-hot', agentId, async () => {
    const resp = await fetchJson<{
      status_code?: number
      data?: { stock_list?: Array<{ code?: string; name?: string; rise_and_fall?: number; order?: number }> }
    }>(
      'https://dq.10jqka.com.cn/fuyao/hot_list_data/out/hot_list/v1/stock?stock_type=a&type=hour&list_type=normal',
    )
    return resp.data?.stock_list ?? []
  })
  if (ths10jqka && ths10jqka.length > 0) {
    const changes = ths10jqka.map((item) => item.rise_and_fall ?? 0)
    const ratio = computeBullBearRatio(changes)
    const hotTopics = ths10jqka.slice(0, 10).map((item) => item.name ?? '')
    snapshots.push({
      collectedAt: nowIso(),
      platform: 'guba',
      sourceKind: 'supplementary_heat',
      summary: buildSentimentSummaryText('同花顺热榜', ratio, hotTopics),
      hotTopics,
      overallBullBearRatio: ratio,
      topMentionedStocks: ths10jqka
        .slice(0, 20)
        .map((item) => ({
          code: normalizeAStockCode(item.code ?? ''),
          mentionCount: item.order ?? 1,
          sentiment: (item.rise_and_fall ?? 0) > 0 ? 0.5 : (item.rise_and_fall ?? 0) < 0 ? -0.5 : 0,
        }))
        .filter((item) => item.code),
    })
  }

  // 数据源 4: 东方财富人气排名（热榜补充；当热榜型来源都空时保底）
  if (!snapshots.some((item) => item.sourceKind === 'supplementary_heat')) {
    const emRank = await trySource('Eastmoney-rank', agentId, async () => {
      const resp = await fetchJson<{
        data?: Array<{ sc?: string; rk?: number }>
      }>(
        'https://emappdata.eastmoney.com/stockrank/getAllCurrentList',
        { 'Content-Type': 'application/json' },
      )
      return resp.data ?? []
    })
    if (emRank && emRank.length > 0) {
      const hotTopics = emRank.slice(0, 10).map((item) => item.sc ?? '')
      const ratio = computeBullBearRatio([])
      snapshots.push({
        collectedAt: nowIso(),
        platform: 'guba',
        sourceKind: 'supplementary_heat',
        summary: buildSentimentSummaryText('东方财富人气榜', ratio, hotTopics),
        hotTopics,
        overallBullBearRatio: ratio,
        topMentionedStocks: emRank
          .slice(0, 20)
          .map((item) => ({
            code: normalizeAStockCode(item.sc ?? ''),
            mentionCount: item.rk ?? 1,
            sentiment: 0,
          }))
          .filter((item) => item.code),
      })
    } else {
      errors.push('热股排名数据源均无数据')
    }
  }

  // 数据源 6: 东方财富 — 人气股排名（热榜补充）
  await trySource('Eastmoney-hot-stocks', agentId, async () => {
    const resp = await fetchJson<{ data?: { diff?: Array<{ f14?: string; f12?: string; f3?: number }> } }>(
      'https://push2.eastmoney.com/api/qt/clist/get?fid=f3&po=1&pz=20&pn=1&np=1&fltt=2&fs=m:0+t:6+f:!2,m:0+t:80+f:!2,m:1+t:2+f:!2',
    )
    const list = resp.data?.diff ?? []
    if (list.length > 0) {
      const changes = list.map((item) => item.f3 ?? 0)
      const ratio = computeBullBearRatio(changes)
      const hotTopics = list.slice(0, 10).map((item) => item.f14 ?? '')
      snapshots.push({
        collectedAt: nowIso(),
        platform: 'eastmoney_hot',
        sourceKind: 'supplementary_heat',
        summary: buildSentimentSummaryText('东方财富热股', ratio, hotTopics),
        hotTopics,
        overallBullBearRatio: ratio,
        topMentionedStocks: list.slice(0, 10).map((item) => ({
          code: normalizeAStockCode(item.f12 ?? ''),
          mentionCount: 1,
          sentiment: (item.f3 ?? 0) > 0 ? 0.5 : (item.f3 ?? 0) < 0 ? -0.5 : 0,
        })).filter((item) => item.code),
      })
    }
    return list.length
  })

  // 数据源 7: AKShare — 千股千评（全市场情绪横截面补充）
  await trySource('AKShare-qgqp', agentId, async () => {
    const result = await runPythonJson<{ total: number; upCount: number; downCount: number; flatCount: number }>(`
import akshare as ak, json
try:
    df = ak.stock_comment_em()
    if not df.empty:
        changes = df['涨跌幅'].dropna().tolist() if '涨跌幅' in df.columns else []
        up = sum(1 for v in changes if float(v) > 0)
        down = sum(1 for v in changes if float(v) < 0)
        flat = len(changes) - up - down
        print(json.dumps({"success": True, "data": {"total": len(df), "upCount": up, "downCount": down, "flatCount": flat}}))
    else:
        print(json.dumps({"success": True, "data": {"total": 0, "upCount": 0, "downCount": 0, "flatCount": 0}}))
except Exception as e:
    import sys; print(f"AKShare qgqp error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"stock_comment_em failed: {e}"}))
`, timeoutMs)
    if (result.total > 0) {
      const total = result.upCount + result.downCount + result.flatCount
      const bullPct = total > 0 ? result.upCount / total : 0.33
      const bearPct = total > 0 ? result.downCount / total : 0.33
      const neutralPct = total > 0 ? result.flatCount / total : 0.34
      const ratio = {
        bull: Math.round(bullPct * 100) / 100,
        bear: Math.round(bearPct * 100) / 100,
        neutral: Math.round(neutralPct * 100) / 100,
      }
      const hotTopics = [`全市场: ${result.upCount}涨/${result.downCount}跌/${result.flatCount}平`]
      snapshots.push({
        collectedAt: nowIso(),
        platform: 'eastmoney_hot',
        sourceKind: 'supplementary_heat',
        summary: buildSentimentSummaryText('千股千评', ratio, hotTopics),
        hotTopics,
        overallBullBearRatio: ratio,
        topMentionedStocks: [],
      })
    }
    return result.total
  })

  // 数据源 8: 微博热搜 (财经相关热词补充，不再作为核心情绪值来源)
  await trySource('Weibo-hot', agentId, async () => {
    const resp = await fetchJson<{ data?: { cards?: Array<{ card_group?: Array<{ desc1?: string }> }> } }>(
      'https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot',
    )
    const cards = resp.data?.cards ?? []
    const topics: string[] = []
    for (const card of cards) {
      for (const item of card.card_group ?? []) {
        if (item.desc1) topics.push(item.desc1)
      }
    }
    if (topics.length > 0) {
      const ratio = computeBullBearRatio([])
      snapshots.push({
        collectedAt: nowIso(),
        platform: 'weibo',
        sourceKind: 'supplementary_heat',
        summary: buildSentimentSummaryText('微博热搜', ratio, topics),
        hotTopics: topics.slice(0, 10),
        overallBullBearRatio: ratio,
        topMentionedStocks: [],
      })
    }
    return topics.length
  })

  if (snapshots.length === 0) errors.push('所有社交媒体数据源均无数据')

  return { data: snapshots, log: createAgentResult(agentId, start, snapshots.length, errors) }
}

// ==================== Agent 7: 全球市场联动 ====================

async function collectGlobalMarkets(timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS): Promise<{ data: GlobalMarketSnapshot | null; log: DataAgentResult }> {
  const start = Date.now()
  const agentId: DataAgentId = 'global_markets'
  const errors: string[] = []
  let dataPoints = 0

  const snapshot: GlobalMarketSnapshot = {
    collectedAt: nowIso(),
    sp500Change: null,
    nasdaqChange: null,
    hsiChange: null,
    a50FuturesChange: null,
    usdCnyRate: null,
    crudeOilChange: null,
    goldChange: null,
    us10yYieldChange: null,
  }

  // 数据源 1: 东方财富 — 全球指数（push2his 逐只查询，替代已失效的 clist 批量接口）
  // secid 映射: 100.SPX=标普500, 100.NDX=纳斯达克, 100.HSI=恒生指数
  const emGlobalResults = await trySource('Eastmoney-global', agentId, async () => {
    const secids = [
      { secid: '100.SPX', target: 'sp500' as const },
      { secid: '100.NDX', target: 'nasdaq' as const },
      { secid: '100.HSI', target: 'hsi' as const },
    ]
    const results = await Promise.all(
      secids.map((s) => fetchEastmoneyQuote(s.secid, timeoutMs).then((q) => ({ ...s, quote: q }))),
    )
    return results
  })
  if (emGlobalResults) {
    for (const item of emGlobalResults) {
      if (!item.quote) continue
      const change = validateNumericRange(item.quote.changePercent, -20, 20, `全球指数${item.quote.code}涨跌幅`)
      if (change === null) continue
      if (item.target === 'sp500') { snapshot.sp500Change = change; dataPoints++ }
      else if (item.target === 'nasdaq') { snapshot.nasdaqChange = change; dataPoints++ }
      else if (item.target === 'hsi') { snapshot.hsiChange = change; dataPoints++ }
    }
  }
  const eastmoneyGlobalMissing = snapshot.sp500Change === null && snapshot.nasdaqChange === null && snapshot.hsiChange === null

  // 数据源 2: AKShare — 全球指数（计算涨跌幅百分比，含 HSI）
  const akGlobal = await trySource('AKShare-global', agentId, async () => {
    return runPythonJson<{ sp500?: number; nasdaq?: number; hsi?: number }>(`
import akshare as ak, json
result = {}
def calc_change_us(symbol):
    df = ak.index_us_stock_sina(symbol=symbol)
    if df is not None and len(df) >= 2:
        close = float(df.iloc[-1].get('close', 0))
        prev = float(df.iloc[-2].get('close', 0))
        if prev > 0:
            return round((close - prev) / prev * 100, 4)
    return None
try:
    v = calc_change_us(".INX")
    if v is not None: result['sp500'] = v
except Exception as e:
    import sys; print(f"AKShare sp500 error: {e}", file=sys.stderr)
try:
    v = calc_change_us(".IXIC")
    if v is not None: result['nasdaq'] = v
except Exception as e:
    import sys; print(f"AKShare nasdaq error: {e}", file=sys.stderr)
try:
    df = ak.stock_hk_index_daily_sina(symbol="HSI")
    if df is not None and len(df) >= 2:
        close = float(df.iloc[-1].get('close', 0))
        prev = float(df.iloc[-2].get('close', 0))
        if prev > 0:
            result['hsi'] = round((close - prev) / prev * 100, 4)
except Exception as e:
    import sys; print(f"AKShare hsi error: {e}", file=sys.stderr)
print(json.dumps({"success": True, "data": result}))
`, timeoutMs)
  })
  if (akGlobal) {
    if (akGlobal.sp500 !== undefined && snapshot.sp500Change === null) {
      const v = validateNumericRange(akGlobal.sp500, -20, 20, 'AKShare-sp500涨跌幅')
      if (v !== null) { snapshot.sp500Change = v; dataPoints++ }
    }
    if (akGlobal.nasdaq !== undefined && snapshot.nasdaqChange === null) {
      const v = validateNumericRange(akGlobal.nasdaq, -20, 20, 'AKShare-nasdaq涨跌幅')
      if (v !== null) { snapshot.nasdaqChange = v; dataPoints++ }
    }
    if (akGlobal.hsi !== undefined && snapshot.hsiChange === null) {
      const v = validateNumericRange(akGlobal.hsi, -20, 20, 'AKShare-hsi涨跌幅')
      if (v !== null) { snapshot.hsiChange = v; dataPoints++ }
    }
  }

  const yahooGlobal = await trySource('YahooFinance-global', agentId, async () => {
    const [sp500, nasdaq, hsi] = await Promise.all([
      fetchYahooFinanceChangePercent('^GSPC', timeoutMs),
      fetchYahooFinanceChangePercent('^IXIC', timeoutMs),
      fetchYahooFinanceChangePercent('^HSI', timeoutMs),
    ])
    return { sp500, nasdaq, hsi }
  })
  if (yahooGlobal) {
    if (yahooGlobal.sp500 !== null && snapshot.sp500Change === null) {
      const v = validateNumericRange(yahooGlobal.sp500, -20, 20, 'Yahoo-sp500涨跌幅')
      if (v !== null) { snapshot.sp500Change = v; dataPoints++ }
    }
    if (yahooGlobal.nasdaq !== null && snapshot.nasdaqChange === null) {
      const v = validateNumericRange(yahooGlobal.nasdaq, -20, 20, 'Yahoo-nasdaq涨跌幅')
      if (v !== null) { snapshot.nasdaqChange = v; dataPoints++ }
    }
    if (yahooGlobal.hsi !== null && snapshot.hsiChange === null) {
      const v = validateNumericRange(yahooGlobal.hsi, -20, 20, 'Yahoo-hsi涨跌幅')
      if (v !== null) { snapshot.hsiChange = v; dataPoints++ }
    }
  }

  // 数据源 3: 东方财富 — 商品期货（push2his 逐只查询，替代已失效的 clist 批量接口）
  // secid 映射: 101.GC00Y=COMEX黄金, 102.CL00Y=NYMEX原油
  const emCommodityResults = await trySource('Eastmoney-commodity', agentId, async () => {
    const [gold, oil] = await Promise.all([
      fetchEastmoneyQuote('101.GC00Y', timeoutMs),
      fetchEastmoneyQuote('102.CL00Y', timeoutMs),
    ])
    return { gold, oil }
  })
  if (emCommodityResults) {
    if (emCommodityResults.gold) {
      const v = validateNumericRange(emCommodityResults.gold.changePercent, -15, 15, 'COMEX黄金涨跌幅')
      if (v !== null) { snapshot.goldChange = v; dataPoints++ }
    }
    if (emCommodityResults.oil) {
      const v = validateNumericRange(emCommodityResults.oil.changePercent, -20, 20, 'NYMEX原油涨跌幅')
      if (v !== null) { snapshot.crudeOilChange = v; dataPoints++ }
    }
  }

  const yahooCommodity = await trySource('YahooFinance-commodity', agentId, async () => {
    const [gold, oil] = await Promise.all([
      fetchYahooFinanceChangePercent('GC=F', timeoutMs),
      fetchYahooFinanceChangePercent('CL=F', timeoutMs),
    ])
    return { gold, oil }
  })
  if (yahooCommodity) {
    if (yahooCommodity.gold !== null && snapshot.goldChange === null) {
      const v = validateNumericRange(yahooCommodity.gold, -15, 15, 'Yahoo-黄金涨跌幅')
      if (v !== null) { snapshot.goldChange = v; dataPoints++ }
    }
    if (yahooCommodity.oil !== null && snapshot.crudeOilChange === null) {
      const v = validateNumericRange(yahooCommodity.oil, -20, 20, 'Yahoo-原油涨跌幅')
      if (v !== null) { snapshot.crudeOilChange = v; dataPoints++ }
    }
  }

  // 数据源 4: AKShare — A50 期货
  await trySource('AKShare-a50', agentId, async () => {
    const change = await runPythonJson<number | null>(`
import akshare as ak, json
try:
    df = ak.futures_foreign_hist(symbol="CHA50CFD")
    if not df.empty:
        prev = float(df.iloc[-2]['收盘'])
        curr = float(df.iloc[-1]['收盘'])
        change = round((curr - prev) / prev * 100, 2) if prev > 0 else 0
        print(json.dumps({"success": True, "data": change}))
    else:
        print(json.dumps({"success": True, "data": None}))
except Exception as e:
    import sys; print(f"AKShare a50 futures error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"stock_us_daily failed: {e}"}))
`, timeoutMs)
    if (change !== null) { snapshot.a50FuturesChange = change; dataPoints++ }
    return change
  })

  // 数据源 5: AKShare — 汇率 (复用 macro 的备用)
  if (snapshot.usdCnyRate === null) {
    await trySource('AKShare-fx-global', agentId, async () => {
      const rate = await runPythonJson<number | null>(`
import akshare as ak, json
try:
    df = ak.fx_spot_quote()
    row = df[df['货币对'].str.contains('USD/CNY')]
    rate = float(row.iloc[0]['最新价']) if not row.empty else None
    print(json.dumps({"success": True, "data": rate}))
except Exception as e:
    import sys; print(f"AKShare-fx-global error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"fx_spot_quote global failed: {e}"}))
`, timeoutMs)
      if (rate !== null) { snapshot.usdCnyRate = rate; dataPoints++ }
      return rate
    })
  }
  if (snapshot.usdCnyRate === null) {
    await trySource('YahooFinance-fx', agentId, async () => {
      const rate = await fetchYahooFinanceLastClose('CNY=X', timeoutMs)
      if (rate !== null) { snapshot.usdCnyRate = rate; dataPoints++ }
      return rate
    })
  }

  // 数据源 6: AKShare — 美国 10 年期国债收益率
  if (snapshot.us10yYieldChange === null) {
    await trySource('AKShare-us10y', agentId, async () => {
      const change = await runPythonJson<number | null>(`
import akshare as ak, json
try:
    df = ak.bond_zh_us_rate(start_date="20200101")
    if not df.empty and len(df) >= 2:
        col = '美国国债收益率10年' if '美国国债收益率10年' in df.columns else None
        if col is None:
            for c in df.columns:
                if '10' in str(c) and ('年' in str(c) or 'year' in str(c).lower()):
                    col = c
                    break
        if col:
            prev = float(df[col].dropna().iloc[-2])
            curr = float(df[col].dropna().iloc[-1])
            chg = round(curr - prev, 4) if prev > 0 else None
            print(json.dumps({"success": True, "data": chg}))
        else:
            print(json.dumps({"success": True, "data": None}))
    else:
        print(json.dumps({"success": True, "data": None}))
except Exception as e:
    import sys; print(f"AKShare-us10y error: {e}", file=sys.stderr)
    print(json.dumps({"success": False, "error": f"bond_us_yield failed: {e}"}))
`, timeoutMs)
      if (change !== null) { snapshot.us10yYieldChange = change; dataPoints++ }
      return change
    })
  }
  if (snapshot.us10yYieldChange === null) {
    await trySource('YahooFinance-us10y', agentId, async () => {
      const change = await fetchYahooFinanceChangePercent('^TNX', timeoutMs)
      if (change !== null) { snapshot.us10yYieldChange = change; dataPoints++ }
      return change
    })
  }

  if (dataPoints === 0) errors.push('所有全球市场数据源均失败')
  else if (shouldReportGlobalIndexError(snapshot, eastmoneyGlobalMissing)) {
    errors.push('全球核心指数数据缺失')
  } else if (eastmoneyGlobalMissing) {
    logger.info('[data-agents][global_markets] Eastmoney-global 无数据，已由备用源补齐核心指数')
  }

  return { data: dataPoints > 0 ? snapshot : null, log: createAgentResult(agentId, start, dataPoints, errors) }
}

// ==================== Agent 8: 数据质量校验 ====================

function buildDataQualityReport(agentLogs: DataAgentResult[]): { data: DataQualityReport; log: DataAgentResult } {
  const start = Date.now()
  const agentId: DataAgentId = 'data_quality'

  const agentResults = agentLogs.map((log) => {
    const missingFields: string[] = []
    const anomalies: string[] = []

    if (log.dataPointCount === 0) missingFields.push('无数据')
    if (log.successRate < 0.5) anomalies.push(`成功率低: ${(log.successRate * 100).toFixed(0)}%`)
    if (log.elapsedMs > 30000) anomalies.push(`耗时过长: ${(log.elapsedMs / 1000).toFixed(1)}s`)
    if (log.errors.length > 0) anomalies.push(...log.errors)

    return {
      agentId: log.agentId,
      isComplete: log.dataPointCount > 0 && log.successRate >= 0.5,
      missingFields,
      anomalies,
      reliabilityScore: Math.round(log.successRate * 100),
    }
  })

  const overallScore = agentResults.length > 0
    ? Math.round(agentResults.reduce((sum, r) => sum + r.reliabilityScore, 0) / agentResults.length)
    : 0

  const report: DataQualityReport = {
    checkedAt: nowIso(),
    agentResults,
    overallScore,
  }

  return {
    data: report,
    log: createAgentResult(agentId, start, agentResults.length, overallScore < 30 ? ['整体数据质量不佳'] : []),
  }
}

// ==================== 入口函数 ====================

/**
 * 运行所有 8 个数据采集 Agent，返回聚合后的事实池。
 * Agent 之间互不依赖，可以并行运行。
 * 支持通过 config 控制单个 Agent 的启用/禁用和超时。
 */
export async function collectAllAgents(
  stockAnalysisDir: string,
  tradeDate: string,
  quotes: Map<string, StockAnalysisSpotQuote>,
  _marketState: StockAnalysisMarketState,
  config?: DataAgentConfigStore,
): Promise<FactPool> {
  // [P2-5] 首次运行时检查 AKShare 版本
  void checkAkShareVersion()

  // 构建 agent 启用状态和超时映射
  const agentConfigMap = new Map<DataAgentId, { enabled: boolean; timeoutMs: number }>()
  if (config) {
    for (const item of config.agents) {
      agentConfigMap.set(item.agentId, { enabled: item.enabled, timeoutMs: item.timeoutMs })
    }
  }

  const isEnabled = (id: DataAgentId): boolean => agentConfigMap.get(id)?.enabled ?? true
  const getTimeout = (id: DataAgentId): number => agentConfigMap.get(id)?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

  const enabledCount = config
    ? config.agents.filter((a) => a.enabled && a.agentId !== 'data_quality').length
    : 7
  logger.info(`[data-agents] 开始运行 ${enabledCount} 个数据采集 Agent (共 7 个可配置)`, { module: 'StockAnalysis' })
  const collectStart = Date.now()
  saLog.info('DataAgents', `数据采集开始: tradeDate=${tradeDate} 启用Agent=${enabledCount}/7 持仓股票=${quotes.size}`)
  const backupFactPool = await getRecentFactPoolBackup(stockAnalysisDir, tradeDate)

  // 定义每个 Agent 的执行函数和 ID（超时通过参数传入，避免共享可变状态竞态）
  type AgentEntry = { id: DataAgentId; fn: () => Promise<{ data?: any; log: DataAgentResult }> }
  const agentDefs: AgentEntry[] = [
    { id: 'macro_economy', fn: () => collectMacroEconomy(getTimeout('macro_economy')) },
    { id: 'policy_regulation', fn: () => collectPolicyRegulation(getTimeout('policy_regulation')) },
    { id: 'company_info', fn: () => collectCompanyInfo(quotes, getTimeout('company_info')) },
    { id: 'price_volume', fn: () => collectPriceVolume(quotes, getTimeout('price_volume')) },
    { id: 'industry_news', fn: () => collectIndustryNews(getTimeout('industry_news')) },
    { id: 'social_sentiment', fn: () => collectSocialSentiment(getTimeout('social_sentiment')) },
    { id: 'global_markets', fn: () => collectGlobalMarkets(getTimeout('global_markets')) },
  ]

  // 空壳结果（用于被禁用的 Agent）
  const emptyResult = (id: DataAgentId) => ({
    data: null as any,
    log: {
      agentId: id,
      collectedAt: nowIso(),
      dataPointCount: 0,
      successRate: 0,
      elapsedMs: 0,
      errors: ['已禁用'],
    } satisfies DataAgentResult,
  })

  // Agent 1-7 并行运行（跳过被禁用的）
  const results = await Promise.all(
    agentDefs.map((agent) => isEnabled(agent.id) ? agent.fn() : Promise.resolve(emptyResult(agent.id))),
  )

  const [
    macroResult,
    policyResult,
    companyResult,
    priceVolumeResult,
    industryResult,
    sentimentResult,
    globalResult,
  ] = results

  const typedMacroResult = macroResult as { data: MacroEconomicData | null; log: DataAgentResult }
  const typedSentimentResult = sentimentResult as { data: SocialSentimentSnapshot[]; log: DataAgentResult }
  const typedGlobalResult = globalResult as { data: GlobalMarketSnapshot | null; log: DataAgentResult }

  applyFactPoolBackups(tradeDate, backupFactPool, {
    macroResult: typedMacroResult,
    sentimentResult: typedSentimentResult,
    globalResult: typedGlobalResult,
  })

  // 收集前 7 个 Agent 的日志
  const agentLogs: DataAgentResult[] = results.map((r) => r.log)

  // 逐 Agent 记录详细日志
  for (const log of agentLogs) {
    const level = log.errors.length > 0 && log.successRate < 0.5 ? 'warn' as const : 'info' as const
    saLog[level]('DataAgents', `Agent ${log.agentId}: 数据点=${log.dataPointCount} 成功率=${(log.successRate * 100).toFixed(0)}% 耗时=${log.elapsedMs}ms${log.errors.length > 0 ? ` 错误=[${log.errors.join('; ')}]` : ''}`)
  }

  // Agent 8: 数据质量校验（依赖前 7 个 Agent 的日志）
  const qualityResult = buildDataQualityReport(agentLogs)
  agentLogs.push(qualityResult.log)

  const factPool: FactPool = {
    updatedAt: nowIso(),
    tradeDate,
    macroData: typedMacroResult.data ?? null,
    policyEvents: policyResult.data ?? [],
    companyAnnouncements: companyResult.data ?? [],
    industryNews: industryResult.data ?? [],
    socialSentiment: typedSentimentResult.data ?? [],
    globalMarkets: typedGlobalResult.data ?? null,
    // [H5] Agent4 的资金流向/龙虎榜/大宗交易等增量数据
    priceVolumeExtras: priceVolumeResult.data ?? null,
    dataQuality: qualityResult.data,
    agentLogs,
  }

  const totalPoints = agentLogs.reduce((sum, log) => sum + log.dataPointCount, 0)
  const totalErrors = agentLogs.reduce((sum, log) => sum + log.errors.length, 0)
  const collectElapsed = Date.now() - collectStart
  logger.info(`[data-agents] 8 Agent 完成: 数据点 ${totalPoints}, 错误 ${totalErrors}, 质量分 ${qualityResult.data.overallScore}`)
  saLog.info('DataAgents', `数据采集完成: 总耗时=${collectElapsed}ms 数据点=${totalPoints} 错误=${totalErrors} 质量分=${qualityResult.data.overallScore} 宏观=${factPool.macroData ? '有' : '无'} 政策=${factPool.policyEvents.length} 公告=${factPool.companyAnnouncements.length} 行业=${factPool.industryNews.length} 舆情=${factPool.socialSentiment.length} 全球=${factPool.globalMarkets ? '有' : '无'}`)

  return factPool
}

export const _testing = {
  createAgentResult,
  computeChangePercentFromSeries,
  countNonNullValues,
  computeSuccessRate,
  getRecentFactPoolBackup,
  applyFactPoolBackups,
  shouldReportGlobalIndexError,
}
