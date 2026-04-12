import { withBasePath } from '../../lib/basePath'
import { frontendLog } from '../../lib/logger'

import type {
  AutoReportNotification,
  DataAgentConfigStore,
  DataCollectionResponse,
  ExpertAnalysisResponse,
  IntradayAlert,
  IntradayMonitorStatus,
  LLMExtractionAgentId,
  MonthlyReport,
  StockAnalysisAIConfigWithPool,
  StockAnalysisAIProvider,
  StockAnalysisDailyRunResult,
  StockAnalysisHealthStatus,
  StockAnalysisModelTestResult,
  StockAnalysisOverview,
  StockAnalysisPosition,
  StockAnalysisPostMarketResult,
  StockAnalysisSignal,
  StockAnalysisStrategyConfig,
  StockAnalysisTradeRecord,
  StockAnalysisWatchLogEntry,
} from './types'

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const startMs = performance.now()
  const method = init?.method || 'GET'
  let response: Response

  try {
    response = await fetch(withBasePath(input), init)
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startMs)
    const msg = error instanceof Error ? error.message : '未知网络错误'
    frontendLog.error('AIQuant.api', `${method} ${input} 网络错误 ${elapsedMs}ms: ${msg}`)
    throw error
  }

  const elapsedMs = Math.round(performance.now() - startMs)

  // [H6] 检查 content-type 再解析 JSON，避免 502/503 HTML 响应导致 SyntaxError
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      const errMsg = `服务器错误 (HTTP ${response.status}): ${response.statusText || '请检查后端服务是否正常运行'}`
      frontendLog.error('AIQuant.api', `${method} ${input} ${response.status} ${elapsedMs}ms: ${errMsg}`)
      throw new Error(errMsg)
    }
    const errMsg = `服务器返回了非 JSON 响应 (${contentType || '未知类型'})`
    frontendLog.error('AIQuant.api', `${method} ${input} ${response.status} ${elapsedMs}ms: ${errMsg}`)
    throw new Error(errMsg)
  }

  const json = await response.json()
  if (!json.success) {
    const errMsg = json.error || '请求失败'
    frontendLog.warn('AIQuant.api', `${method} ${input} ${response.status} ${elapsedMs}ms: 业务错误 - ${errMsg}`)
    throw new Error(errMsg)
  }

  frontendLog.debug('AIQuant.api', `${method} ${input} ${response.status} ${elapsedMs}ms`)
  return json.data as T
}

export function bootstrapStockAnalysis() {
  return requestJson<void>('/api/system/stock-analysis/bootstrap', { method: 'POST' })
}

export function fetchStockAnalysisOverview() {
  return requestJson<StockAnalysisOverview>('/api/system/stock-analysis/overview')
}

export function fetchTradingStatus() {
  return requestJson<{ canTrade: boolean; reason: string | null }>('/api/system/stock-analysis/trading-status')
}

export function fetchStockAnalysisHealth() {
  return requestJson<StockAnalysisHealthStatus>('/api/system/stock-analysis/health')
}

export function fetchStockAnalysisConfig() {
  return requestJson<StockAnalysisStrategyConfig>('/api/system/stock-analysis/config')
}

export function fetchStockAnalysisSignals() {
  return requestJson<StockAnalysisSignal[]>('/api/system/stock-analysis/signals')
}

export function fetchStockAnalysisPositions() {
  return requestJson<StockAnalysisPosition[]>('/api/system/stock-analysis/positions')
}

export function fetchStockAnalysisTrades() {
  return requestJson<StockAnalysisTradeRecord[]>('/api/system/stock-analysis/trades')
}

export function fetchStockAnalysisWatchLogs() {
  return requestJson<StockAnalysisWatchLogEntry[]>('/api/system/stock-analysis/watch-logs')
}

export function runStockAnalysisDaily() {
  return requestJson<StockAnalysisDailyRunResult>('/api/system/stock-analysis/run/daily', { method: 'POST' })
}

export function refreshStockAnalysisStockPool() {
  return requestJson<{ count: number }>('/api/system/stock-analysis/stock-pool/refresh', { method: 'POST' })
}

export function confirmStockAnalysisSignal(signalId: string, payload: { quantity?: number; weight?: number; price?: number; note?: string }) {
  return requestJson<StockAnalysisPosition | { confirmed: true; position: null }>(`/api/system/stock-analysis/signals/${signalId}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function rejectStockAnalysisSignal(signalId: string, note: string) {
  return requestJson<StockAnalysisSignal>(`/api/system/stock-analysis/signals/${signalId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
}

export function ignoreStockAnalysisSignal(signalId: string, note: string) {
  return requestJson<StockAnalysisSignal>(`/api/system/stock-analysis/signals/${signalId}/ignore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
}

export function closeStockAnalysisPosition(positionId: string, payload: { quantity: number; price?: number; note?: string }) {
  return requestJson<StockAnalysisTradeRecord>(`/api/system/stock-analysis/positions/${positionId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function reduceStockAnalysisPosition(positionId: string, payload: { quantity: number; price?: number; note?: string }) {
  return requestJson<StockAnalysisTradeRecord>(`/api/system/stock-analysis/positions/${positionId}/reduce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function dismissPositionAction(positionId: string, note?: string) {
  return requestJson<StockAnalysisPosition>(`/api/system/stock-analysis/positions/${positionId}/dismiss-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  })
}

// ── AI Config API ──────────────────────────────────────────

export function fetchStockAnalysisAIConfig() {
  return requestJson<StockAnalysisAIConfigWithPool>('/api/system/stock-analysis/ai-config')
}

export function saveStockAnalysisAIProviders(providers: StockAnalysisAIProvider[]) {
  return requestJson<StockAnalysisAIConfigWithPool>('/api/system/stock-analysis/ai-config/providers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providers }),
  })
}

export function assignModelToLayer(layer: string, modelRef: { providerId: string; providerName: string; modelId: string; displayName: string } | null) {
  return requestJson<StockAnalysisAIConfigWithPool>(`/api/system/stock-analysis/ai-config/layers/${layer}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelRef }),
  })
}

export function assignModelToExpert(expertId: string, modelRef: { providerId: string; providerName: string; modelId: string; displayName: string } | null) {
  return requestJson<StockAnalysisAIConfigWithPool>(`/api/system/stock-analysis/ai-config/experts/${expertId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelRef }),
  })
}

export function assignModelToExtractionAgent(agentId: LLMExtractionAgentId, modelRef: { providerId: string; providerName: string; modelId: string; displayName: string } | null) {
  return requestJson<StockAnalysisAIConfigWithPool>(`/api/system/stock-analysis/ai-config/extraction-agents/${agentId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelRef }),
  })
}

export function testModelConnectivity(baseUrl: string, apiKey: string, modelId: string) {
  return requestJson<StockAnalysisModelTestResult>('/api/system/stock-analysis/ai-config/test-model', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseUrl, apiKey, modelId }),
  })
}

export function updateExpertSystemPrompt(expertId: string, systemPrompt: string) {
  return requestJson<StockAnalysisAIConfigWithPool>(`/api/system/stock-analysis/ai-config/experts/${expertId}/system-prompt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt }),
  })
}

// ── 通知 + 报告 API ──────────────────────────────────────────

export function fetchStockAnalysisNotifications() {
  return requestJson<AutoReportNotification[]>('/api/system/stock-analysis/notifications')
}

export function acknowledgeNotification(notificationId: string) {
  return requestJson<AutoReportNotification>(`/api/system/stock-analysis/notifications/${notificationId}/acknowledge`, {
    method: 'POST',
  })
}

export function fetchMonthlyReports() {
  return requestJson<MonthlyReport[]>('/api/system/stock-analysis/monthly-reports')
}

export function generateWeeklyReport() {
  return requestJson<AutoReportNotification>('/api/system/stock-analysis/reports/generate-weekly', {
    method: 'POST',
  })
}

export function generateMonthlyReport() {
  return requestJson<AutoReportNotification>('/api/system/stock-analysis/reports/generate-monthly', {
    method: 'POST',
  })
}

// ── 盘后分析 + 盘中监控 API ──────────────────────────────────

export function runStockAnalysisPostMarket() {
  return requestJson<StockAnalysisPostMarketResult>('/api/system/stock-analysis/run/post-market', {
    method: 'POST',
  })
}

export function startIntradayMonitor() {
  return requestJson<IntradayMonitorStatus>('/api/system/stock-analysis/intraday/start', {
    method: 'POST',
  })
}

export function stopIntradayMonitor() {
  return requestJson<IntradayMonitorStatus>('/api/system/stock-analysis/intraday/stop', {
    method: 'POST',
  })
}

export function fetchIntradayMonitorStatus() {
  return requestJson<IntradayMonitorStatus>('/api/system/stock-analysis/intraday/status')
}

export function fetchIntradayAlerts() {
  return requestJson<IntradayAlert[]>('/api/system/stock-analysis/intraday/alerts')
}

export function acknowledgeIntradayAlert(alertId: string) {
  return requestJson<IntradayAlert>(`/api/system/stock-analysis/intraday/alerts/${alertId}/acknowledge`, {
    method: 'POST',
  })
}

export function acknowledgeAllIntradayAlerts() {
  return requestJson<{ acknowledgedCount: number }>('/api/system/stock-analysis/intraday/alerts/acknowledge-all', {
    method: 'POST',
  })
}

// ── 数据采集 Agent 配置 ──

export function fetchDataAgentConfig() {
  return requestJson<DataAgentConfigStore>('/api/system/stock-analysis/data-agent-config')
}

export function saveDataAgentConfig(config: DataAgentConfigStore) {
  return requestJson<DataAgentConfigStore>('/api/system/stock-analysis/data-agent-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

// ── AI 专家分析 + 数据收集页面 API ──

export function fetchAvailableDates(type?: 'signals' | 'data-collection') {
  const query = type ? `?type=${type}` : ''
  return requestJson<string[]>(`/api/system/stock-analysis/available-dates${query}`)
}

export function fetchExpertAnalysis(date: string) {
  return requestJson<ExpertAnalysisResponse>(`/api/system/stock-analysis/expert-analysis?date=${date}`)
}

export function fetchDataCollection(date: string) {
  return requestJson<DataCollectionResponse>(`/api/system/stock-analysis/data-collection?date=${date}`)
}
