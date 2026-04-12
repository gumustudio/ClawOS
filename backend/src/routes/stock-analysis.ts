import { Router } from 'express'

import type { StockAnalysisExpertLayer, LLMExtractionAgentId, StockAnalysisAIProvider } from '../services/stock-analysis/types'
import { saLog } from '../services/stock-analysis/sa-logger'
import type { FrontendLogEntry } from '../services/stock-analysis/sa-logger'
import { checkTradingAvailability } from '../services/stock-analysis/trading-calendar'
import { logger } from '../utils/logger'
import { DEFAULT_SERVER_PATHS, getServerPaths } from '../utils/serverConfig'
import {
  acknowledgeStockAnalysisNotification,
  assignModelToExpert,
  assignModelToLayer,
  bootstrapStockAnalysis,
  buildModelPool,
  closeStockAnalysisPosition,
  confirmStockAnalysisSignal,
  generateMonthlyReport,
  generateWeeklyReport,
  getStockAnalysisAIConfig,
  getStockAnalysisConfig,
  getStockAnalysisHealthStatus,
  getStockAnalysisMonthlyReports,
  getStockAnalysisNotifications,
  getStockAnalysisOverview,
  getStockAnalysisPositions,
  getStockAnalysisRuntimeStatusData,
  getStockAnalysisSignals,
  getStockAnalysisTrades,
  getStockAnalysisWatchLogs,
  dismissPositionAction,
  reduceStockAnalysisPosition,
  refreshStockAnalysisStockPool,
  rejectStockAnalysisSignal,
  runStockAnalysisDaily,
  runStockAnalysisPostMarket,
  startIntradayMonitor,
  stopIntradayMonitor,
  getIntradayMonitorStatusData,
  getIntradayAlerts,
  acknowledgeIntradayAlert,
  acknowledgeAllIntradayAlerts,
  saveStockAnalysisAIProviders,
  testModelConnectivity,
  updateExpertSystemPrompt,
  getDataAgentConfigService,
  saveDataAgentConfigService,
  assignModelToExtractionAgent,
  getStockAnalysisAvailableDates,
  getStockAnalysisExpertAnalysis,
  getStockAnalysisDataCollection,
} from '../services/stock-analysis/service'

const router = Router()

/** [L9] 安全地解析 price 参数，过滤 NaN 和负数 */
function sanitizePrice(raw: unknown): number | undefined {
  if (raw == null) return undefined
  const num = Number(raw)
  return Number.isFinite(num) && num > 0 ? num : undefined
}

const MAX_NOTE_LENGTH = 2000

/** 截断 note 到合理长度 */
function sanitizeNote(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed ? trimmed.slice(0, MAX_NOTE_LENGTH) : undefined
}

/**
 * [P2-25] 错误响应消毒：移除可能泄露内部信息的内容（文件路径、堆栈、环境变量等）。
 * 只保留安全的错误概要，具体细节已记录到日志。
 */
function sanitizeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : '服务内部错误'
  // 移除文件路径（/home/...、C:\...）
  const cleaned = msg.replace(/(?:\/[\w./\\-]+){2,}/g, '[path]')
    .replace(/[A-Z]:\\[\w.\\-]+/g, '[path]')
  // 截断到合理长度
  return cleaned.slice(0, 200)
}

/** [M10] 遮罩 API Key，只显示前缀和末尾 4 位 */
function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '****'
  const prefix = key.slice(0, Math.min(key.indexOf('-') + 1, 4)) || key.slice(0, 3)
  const suffix = key.slice(-4)
  return `${prefix}****${suffix}`
}

// L19: 模块级缓存 — stockAnalysisDir 路径在运行期间极少变化，TTL 5 分钟
let _cachedStockAnalysisDir: string | null = null
let _cachedStockAnalysisDirTs = 0
const STOCK_ANALYSIS_DIR_TTL_MS = 5 * 60 * 1000

async function getStockAnalysisDir() {
  const now = Date.now()
  if (_cachedStockAnalysisDir && now - _cachedStockAnalysisDirTs < STOCK_ANALYSIS_DIR_TTL_MS) {
    return _cachedStockAnalysisDir
  }
  const paths = await getServerPaths()
  _cachedStockAnalysisDir = paths.stockAnalysisDir || DEFAULT_SERVER_PATHS.stockAnalysisDir
  _cachedStockAnalysisDirTs = now
  return _cachedStockAnalysisDir
}

router.post('/bootstrap', async (_req, res) => {
  try {
    await bootstrapStockAnalysis(await getStockAnalysisDir())
    res.json({ success: true })
  } catch (error) {
    logger.error(`AI 炒股 bootstrap 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/overview', async (_req, res) => {
  try {
    const data = await getStockAnalysisOverview(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 overview 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// [L7] 添加 try-catch 保持与其他路由一致
router.get('/trading-status', (_req, res) => {
  try {
    const data = checkTradingAvailability()
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股交易状态查询失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/signals', async (_req, res) => {
  try {
    const data = await getStockAnalysisSignals(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 signals 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/positions', async (_req, res) => {
  try {
    const data = await getStockAnalysisPositions(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 positions 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/trades', async (_req, res) => {
  try {
    const data = await getStockAnalysisTrades(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 trades 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/watch-logs', async (_req, res) => {
  try {
    const data = await getStockAnalysisWatchLogs(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 watch logs 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/config', async (_req, res) => {
  try {
    const data = await getStockAnalysisConfig(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 config 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/runtime-status', async (_req, res) => {
  try {
    const data = await getStockAnalysisRuntimeStatusData(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 runtime status 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/health', async (_req, res) => {
  try {
    const data = await getStockAnalysisHealthStatus(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 health 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/run/daily', async (_req, res) => {
  try {
    const data = await runStockAnalysisDaily(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 daily run 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/stock-pool/refresh', async (_req, res) => {
  try {
    const data = await refreshStockAnalysisStockPool(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 stock pool refresh 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/signals/:id/confirm', async (req, res) => {
  try {
    const rawQty = req.body?.quantity != null ? Number(req.body.quantity) : 0
    const rawWeight = req.body?.weight != null ? Number(req.body.weight) : undefined
    // [P2-26] A 股最小交易单位为 100 股（1 手），自动对齐到 100 的整数倍
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty / 100) * 100 : 0

    const data = await confirmStockAnalysisSignal(await getStockAnalysisDir(), req.params.id, {
      quantity,
      weight: rawWeight !== undefined && Number.isFinite(rawWeight) ? rawWeight : undefined,
      price: sanitizePrice(req.body?.price),
      note: sanitizeNote(req.body?.note),
    })

    if (!data) {
      return res.status(404).json({ success: false, error: '信号不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 confirm signal 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/signals/:id/reject', async (req, res) => {
  try {
    const note = sanitizeNote(req.body?.note) ?? ''
    if (!note) {
      return res.status(400).json({ success: false, error: '推翻原因不能为空' })
    }
    const data = await rejectStockAnalysisSignal(await getStockAnalysisDir(), req.params.id, note, 'user_rejected')
    if (!data) {
      return res.status(404).json({ success: false, error: '信号不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 reject signal 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/signals/:id/ignore', async (req, res) => {
  try {
    const note = sanitizeNote(req.body?.note) ?? ''
    if (!note) {
      return res.status(400).json({ success: false, error: '忽略原因不能为空' })
    }
    const data = await rejectStockAnalysisSignal(await getStockAnalysisDir(), req.params.id, note, 'user_ignored')
    if (!data) {
      return res.status(404).json({ success: false, error: '信号不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 ignore signal 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/positions/:id/close', async (req, res) => {
  try {
    const rawQty = Number(req.body?.quantity)
    // [P2-26] 平仓数量对齐到 100 股整数倍
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty / 100) * 100 : 0
    if (quantity <= 0) {
      return res.status(400).json({ success: false, error: '数量必须为正数且至少 100 股' })
    }
    const data = await closeStockAnalysisPosition(await getStockAnalysisDir(), req.params.id, {
      quantity,
      price: sanitizePrice(req.body?.price),
      note: sanitizeNote(req.body?.note),
    })
    if (!data) {
      return res.status(404).json({ success: false, error: '持仓不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 close position 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/positions/:id/reduce', async (req, res) => {
  try {
    const rawQty = Number(req.body?.quantity)
    // [P2-26] 减仓数量对齐到 100 股整数倍
    const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.floor(rawQty / 100) * 100 : 0
    if (quantity <= 0) {
      return res.status(400).json({ success: false, error: '减仓数量必须为正数且至少 100 股' })
    }
    const data = await reduceStockAnalysisPosition(await getStockAnalysisDir(), req.params.id, {
      quantity,
      price: sanitizePrice(req.body?.price),
      note: sanitizeNote(req.body?.note),
    })
    if (!data) {
      return res.status(404).json({ success: false, error: '持仓不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 reduce position 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/positions/:id/dismiss-action', async (req, res) => {
  try {
    const note = sanitizeNote(req.body?.note) ?? ''
    const data = await dismissPositionAction(await getStockAnalysisDir(), req.params.id, note)
    if (!data) {
      return res.status(404).json({ success: false, error: '持仓不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 dismiss position action 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── AI Config 路由 ──────────────────────────────────────────

// ── 通知 + 报告路由 ──────────────────────────────────────────

router.get('/notifications', async (_req, res) => {
  try {
    const data = await getStockAnalysisNotifications(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 notifications 读取失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/notifications/:id/acknowledge', async (req, res) => {
  try {
    const data = await acknowledgeStockAnalysisNotification(await getStockAnalysisDir(), req.params.id)
    if (!data) {
      return res.status(404).json({ success: false, error: '通知不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 notification acknowledge 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/monthly-reports', async (_req, res) => {
  try {
    const data = await getStockAnalysisMonthlyReports(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 monthly-reports 读取失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/reports/generate-weekly', async (_req, res) => {
  try {
    const data = await generateWeeklyReport(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 weekly report 手动生成失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/reports/generate-monthly', async (_req, res) => {
  try {
    const data = await generateMonthlyReport(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 monthly report 手动生成失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── AI Config 路由 (模型管理) ────────────────────────────────

router.get('/ai-config', async (_req, res) => {
  try {
    const dir = await getStockAnalysisDir()
    const config = await getStockAnalysisAIConfig(dir)
    const modelPool = buildModelPool(config.providers)
    // [M10] 遮罩 API Key，防止前端泄露明文密钥
    const maskedProviders = config.providers.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }))
    res.json({ success: true, data: { ...config, providers: maskedProviders, modelPool } })
  } catch (error) {
    logger.error(`AI 炒股 ai-config 读取失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.put('/ai-config/providers', async (req, res) => {
  try {
    const providers = req.body?.providers
    if (!Array.isArray(providers)) {
      return res.status(400).json({ success: false, error: 'providers 必须为数组' })
    }
    // [M10] 恢复被遮罩的 apiKey：如果前端发回 ****，用原始值替换
    const dir = await getStockAnalysisDir()
    const existingConfig = await getStockAnalysisAIConfig(dir)
    const existingKeyMap = new Map(existingConfig.providers.map((p) => [p.id, p.apiKey]))
    const mergedProviders = providers.map((p: Record<string, unknown>) => {
      const apiKey = typeof p.apiKey === 'string' ? p.apiKey : ''
      if (apiKey.includes('****')) {
        const original = existingKeyMap.get(p.id as string)
        return { ...p, apiKey: original ?? '' }
      }
      return p
    }) as unknown as StockAnalysisAIProvider[]
    const data = await saveStockAnalysisAIProviders(dir, mergedProviders)
    // 与 GET /ai-config 保持一致：返回 modelPool + 遮罩 API Key
    const modelPool = buildModelPool(data.providers)
    const maskedProviders = data.providers.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }))
    res.json({ success: true, data: { ...data, providers: maskedProviders, modelPool } })
  } catch (error) {
    logger.error(`AI 炒股 ai-config providers 保存失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/ai-config/layers/:layer/assign', async (req, res) => {
  try {
    const layer = req.params.layer as StockAnalysisExpertLayer
    const modelRef = req.body?.modelRef
    // [L8] 白名单校验 layer 参数
    const validLayers: StockAnalysisExpertLayer[] = ['industry_chain', 'company_fundamentals', 'sell_side_research', 'world_power', 'global_macro', 'risk_governance', 'sentiment', 'market_trading', 'buy_side', 'rule_functions']
    if (!validLayers.includes(layer)) {
      return res.status(400).json({ success: false, error: `无效的 layer: ${req.params.layer}` })
    }
    if (!modelRef) {
      return res.status(400).json({ success: false, error: 'modelRef 必须提供' })
    }
    const data = await assignModelToLayer(await getStockAnalysisDir(), layer, modelRef)
    const modelPool = buildModelPool(data.providers)
    const maskedProviders = data.providers.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) }))
    res.json({ success: true, data: { ...data, providers: maskedProviders, modelPool } })
  } catch (error) {
    logger.error(`AI 炒股 ai-config layer assign 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/ai-config/experts/:id/assign', async (req, res) => {
  try {
    const expertId = req.params.id
    const modelRef = req.body?.modelRef
    if (!expertId || !modelRef) {
      return res.status(400).json({ success: false, error: 'expertId 和 modelRef 必须提供' })
    }
    const data = await assignModelToExpert(await getStockAnalysisDir(), expertId, modelRef)
    const modelPool = buildModelPool(data.providers)
    const maskedProviders = data.providers.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) }))
    res.json({ success: true, data: { ...data, providers: maskedProviders, modelPool } })
  } catch (error) {
    logger.error(`AI 炒股 ai-config expert assign 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.put('/ai-config/experts/:id/system-prompt', async (req, res) => {
  try {
    const expertId = req.params.id
    const systemPrompt = req.body?.systemPrompt
    if (!expertId || typeof systemPrompt !== 'string') {
      return res.status(400).json({ success: false, error: 'expertId 和 systemPrompt 必须提供' })
    }
    const config = await updateExpertSystemPrompt(await getStockAnalysisDir(), expertId, systemPrompt)
    const modelPool = buildModelPool(config.providers)
    const maskedProviders = config.providers.map((p) => ({
      ...p,
      apiKey: maskApiKey(p.apiKey),
    }))
    res.json({ success: true, data: { ...config, providers: maskedProviders, modelPool } })
  } catch (error) {
    logger.error(`AI 炒股 ai-config expert systemPrompt 更新失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/ai-config/test-model', async (req, res) => {
  try {
    const { baseUrl, apiKey, modelId } = req.body || {}
    if (!baseUrl || !apiKey || !modelId) {
      return res.status(400).json({ success: false, error: 'baseUrl, apiKey, modelId 都必须提供' })
    }
    // SSRF 防护: 校验 baseUrl 不指向内网
    const urlStr = String(baseUrl)
    try {
      const parsed = new URL(urlStr)
      if (!['https:', 'http:'].includes(parsed.protocol)) {
        return res.status(400).json({ success: false, error: 'baseUrl 必须使用 http/https 协议' })
      }
      const host = parsed.hostname.toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
        || host.startsWith('10.') || host.startsWith('192.168.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        || host.endsWith('.local') || host.endsWith('.internal')
        || host === '169.254.169.254') {
        return res.status(400).json({ success: false, error: 'baseUrl 不允许指向内网地址' })
      }
    } catch {
      return res.status(400).json({ success: false, error: 'baseUrl 格式无效' })
    }
    // 构造临时 provider 对象用于连通性测试
    const now = new Date().toISOString()
    const tempProvider = {
      id: 'test',
      name: 'test',
      baseUrl: String(baseUrl),
      apiKey: String(apiKey),
      models: [String(modelId)],
      enabled: true,
      concurrency: 1,
      createdAt: now,
      updatedAt: now,
    }
    const data = await testModelConnectivity(tempProvider, String(modelId))
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 ai-config test model 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ==================== 盘后分析 (G1) ====================

router.post('/run/post-market', async (_req, res) => {
  try {
    const data = await runStockAnalysisPostMarket(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股盘后分析失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ==================== 盘中监控 (S1) ====================

router.post('/intraday/start', async (_req, res) => {
  try {
    const data = await startIntradayMonitor(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股盘中监控启动失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/intraday/stop', async (_req, res) => {
  try {
    const data = await stopIntradayMonitor(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股盘中监控停止失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/intraday/status', async (_req, res) => {
  try {
    const data = await getIntradayMonitorStatusData(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股盘中监控状态查询失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.get('/intraday/alerts', async (_req, res) => {
  try {
    const data = await getIntradayAlerts(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股盘中告警查询失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/intraday/alerts/acknowledge-all', async (_req, res) => {
  try {
    const count = await acknowledgeAllIntradayAlerts(await getStockAnalysisDir())
    res.json({ success: true, data: { acknowledgedCount: count } })
  } catch (error) {
    logger.error(`AI 炒股盘中告警批量确认失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.post('/intraday/alerts/:id/acknowledge', async (req, res) => {
  try {
    const data = await acknowledgeIntradayAlert(await getStockAnalysisDir(), req.params.id)
    if (!data) {
      return res.status(404).json({ success: false, error: '告警不存在' })
    }
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股盘中告警确认失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── 数据采集 Agent 配置 ──

router.get('/data-agent-config', async (_req, res) => {
  try {
    const data = await getDataAgentConfigService(await getStockAnalysisDir())
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股数据采集配置读取失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

router.put('/data-agent-config', async (req, res) => {
  try {
    // [M11] 输入校验：确保 body 是对象且 agents 是数组
    const body = req.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ success: false, error: '请求体必须为 JSON 对象' })
    }
    if (!Array.isArray(body.agents)) {
      return res.status(400).json({ success: false, error: 'agents 字段必须为数组' })
    }
    for (const agent of body.agents) {
      if (!agent || typeof agent !== 'object') {
        return res.status(400).json({ success: false, error: 'agents 数组元素必须为对象' })
      }
      if (typeof agent.agentId !== 'string' || !agent.agentId) {
        return res.status(400).json({ success: false, error: '每个 agent 必须包含非空 agentId 字符串' })
      }
      if (typeof agent.enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: `agent ${agent.agentId} 的 enabled 必须为布尔值` })
      }
      if (typeof agent.timeoutMs !== 'number' || !Number.isFinite(agent.timeoutMs) || agent.timeoutMs < 1000 || agent.timeoutMs > 600_000) {
        return res.status(400).json({ success: false, error: `agent ${agent.agentId} 的 timeoutMs 必须为 1000-600000 之间的数字` })
      }
    }
    const data = await saveDataAgentConfigService(await getStockAnalysisDir(), body)
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股数据采集配置保存失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── LLM 提取 Agent 模型分配 ──

router.post('/ai-config/extraction-agents/:agentId/assign', async (req, res) => {
  try {
    const agentId = req.params.agentId as LLMExtractionAgentId
    const modelRef = req.body?.modelRef ?? null
    const validIds: LLMExtractionAgentId[] = ['announcement_parser', 'news_impact_analyzer', 'sentiment_analyzer']
    if (!validIds.includes(agentId)) {
      return res.status(400).json({ success: false, error: `无效的 agentId: ${agentId}` })
    }
    const config = await assignModelToExtractionAgent(await getStockAnalysisDir(), agentId, modelRef)
    const modelPool = buildModelPool(config.providers)
    const maskedProviders = config.providers.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) }))
    res.json({ success: true, data: { ...config, providers: maskedProviders, modelPool } })
  } catch (error) {
    logger.error(`AI 炒股 extraction agent assign 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── 可用日期列表（type=data-collection 扫描 data-agents/，默认扫描 signals/） ──

router.get('/available-dates', async (req, res) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const dates = await getStockAnalysisAvailableDates(await getStockAnalysisDir(), type)
    res.json({ success: true, data: dates })
  } catch (error) {
    logger.error(`AI 炒股 available-dates 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── AI 专家分析（按日期返回信号中的专家投票详情 + 专家记忆） ──

router.get('/expert-analysis', async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: '需要提供有效的 date 参数（YYYY-MM-DD）' })
    }
    const data = await getStockAnalysisExpertAnalysis(await getStockAnalysisDir(), date)
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 expert-analysis 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── AI 数据收集（按日期返回 FactPool + LLM 提取结果） ──

router.get('/data-collection', async (req, res) => {
  try {
    const date = typeof req.query.date === 'string' ? req.query.date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: '需要提供有效的 date 参数（YYYY-MM-DD）' })
    }
    const data = await getStockAnalysisDataCollection(await getStockAnalysisDir(), date)
    res.json({ success: true, data })
  } catch (error) {
    logger.error(`AI 炒股 data-collection 失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

// ── 前端日志上报 ──

const MAX_CLIENT_LOG_BATCH = 100
const VALID_LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error'])

router.post('/client-log', async (req, res) => {
  try {
    const body = req.body
    if (!Array.isArray(body)) {
      return res.status(400).json({ success: false, error: 'body 必须是 FrontendLogEntry[]' })
    }
    if (body.length === 0) {
      return res.json({ success: true, received: 0 })
    }
    if (body.length > MAX_CLIENT_LOG_BATCH) {
      return res.status(400).json({ success: false, error: `单次最多 ${MAX_CLIENT_LOG_BATCH} 条日志` })
    }

    // 校验并过滤有效条目
    const entries: FrontendLogEntry[] = []
    for (const item of body) {
      if (
        typeof item === 'object' && item !== null &&
        typeof item.timestamp === 'string' &&
        typeof item.component === 'string' &&
        typeof item.level === 'string' &&
        VALID_LOG_LEVELS.has(item.level) &&
        typeof item.message === 'string'
      ) {
        entries.push({
          timestamp: item.timestamp,
          component: item.component.slice(0, 100),
          level: item.level as FrontendLogEntry['level'],
          message: item.message.slice(0, 2000),
          data: typeof item.data === 'object' && item.data !== null ? item.data : undefined,
          userAgent: typeof item.userAgent === 'string' ? item.userAgent.slice(0, 500) : undefined,
        })
      }
    }

    if (entries.length > 0) {
      await saLog.frontendLog(entries)
    }

    res.json({ success: true, received: entries.length })
  } catch (error) {
    logger.error(`前端日志上报失败: ${(error as Error).message}`, { module: 'StockAnalysis' })
    res.status(500).json({ success: false, error: sanitizeErrorMessage(error) })
  }
})

export default router
