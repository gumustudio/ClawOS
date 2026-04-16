import { useEffect, useState } from 'react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

import {
  assignModelToExtractionAgent,
  assignModelToLayer,
  fetchDataAgentConfig,
  fetchStockAnalysisAIConfig,
  saveDataAgentConfig,
  saveStockAnalysisAIProviders,
  testModelConnectivity,
  updateExpertSystemPrompt,
} from '../api'
import type {
  DataAgentConfigStore,
  LLMExtractionAgentId,
  StockAnalysisAIConfigWithPool,
  StockAnalysisAIModelRef,
  StockAnalysisAIProvider,
  StockAnalysisExpertLayer,
  StockAnalysisLayerAssignment,
  StockAnalysisModelTestResult,
} from '../types'

// ── 常量 ────────────────────────────────────────────────────

const LAYER_LABELS: Record<StockAnalysisExpertLayer, string> = {
  industry_chain: '产业链分析',
  company_fundamentals: '公司基本面',
  sell_side_research: '卖方研究',
  world_power: '大国博弈',
  global_macro: '全球宏观',
  risk_governance: '风险治理',
  sentiment: '情绪面',
  market_trading: '市场交易',
  buy_side: '买方视角',
  rule_functions: '规则函数',
}

function generateId(): string {
  return `prov_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

// ── 子组件：Provider 表单 ──────────────────────────────────

interface ProviderFormData {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string
  enabled: boolean
  concurrency: string
}

function emptyProviderForm(): ProviderFormData {
  return { id: generateId(), name: '', baseUrl: '', apiKey: '', models: '', enabled: true, concurrency: '3' }
}

function providerToForm(p: StockAnalysisAIProvider): ProviderFormData {
  return { id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models.join(', '), enabled: p.enabled, concurrency: String(p.concurrency ?? 3) }
}

function formToProvider(f: ProviderFormData): StockAnalysisAIProvider {
  const now = new Date().toISOString()
  const parsed = parseInt(f.concurrency, 10)
  return {
    id: f.id,
    name: f.name.trim(),
    baseUrl: f.baseUrl.trim(),
    apiKey: f.apiKey.trim(),
    models: f.models.split(',').map((m) => m.trim()).filter(Boolean),
    enabled: f.enabled,
    concurrency: Number.isFinite(parsed) && parsed >= 1 ? parsed : 3,
    createdAt: now,
    updatedAt: now,
  }
}

function ProviderEditor({
  form,
  onChange,
  onRemove,
  testResults,
  onTest,
  testing,
}: {
  form: ProviderFormData
  onChange: (updated: ProviderFormData) => void
  onRemove: () => void
  testResults: Record<string, StockAnalysisModelTestResult>
  onTest: (providerId: string, baseUrl: string, apiKey: string, modelId: string) => void
  testing: boolean
}) {
  const modelList = form.models.split(',').map((m) => m.trim()).filter(Boolean)

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => onChange({ ...form, enabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700">{form.name || '新供应商'}</span>
          </label>
        </div>
        <button onClick={onRemove} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">名称</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="如 OpenRouter / DeepSeek"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Base URL</label>
          <input
            type="text"
            value={form.baseUrl}
            onChange={(e) => onChange({ ...form, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">最大并发数</label>
          <input
            type="number"
            min={1}
            max={20}
            value={form.concurrency}
            onChange={(e) => onChange({ ...form, concurrency: e.target.value })}
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">API Key</label>
        <input
          type="password"
          value={form.apiKey}
          onChange={(e) => onChange({ ...form, apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none font-mono"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1">模型列表（逗号分隔）</label>
        <input
          type="text"
          value={form.models}
          onChange={(e) => onChange({ ...form, models: e.target.value })}
          placeholder="gpt-4o, gpt-4o-mini, deepseek-chat"
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none font-mono"
        />
      </div>

      {modelList.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {modelList.map((modelId) => {
            const key = `${form.id}:${modelId}`
            const result = testResults[key]
            return (
              <button
                key={modelId}
                onClick={() => onTest(form.id, form.baseUrl.trim(), form.apiKey.trim(), modelId)}
                disabled={testing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 border-slate-200 bg-slate-50 text-slate-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-600"
              >
                {result ? (
                  result.success ? (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-green-500" />
                  ) : (
                    <ExclamationTriangleIcon className="w-3.5 h-3.5 text-red-500" />
                  )
                ) : null}
                {modelId}
                {result ? (
                  <span className={result.success ? 'text-green-600' : 'text-red-500'}>
                    {result.success ? `${result.latencyMs}ms` : '失败'}
                  </span>
                ) : (
                  <span className="text-slate-400">测试</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 子组件：层级分配行 ──────────────────────────────────────

function LayerAssignmentRow({
  assignment,
  modelPool,
  onAssign,
  assigning,
  expanded,
  onToggle,
  experts,
  onUpdateSystemPrompt,
  savingPromptId,
}: {
  assignment: StockAnalysisLayerAssignment
  modelPool: StockAnalysisAIModelRef[]
  onAssign: (layer: StockAnalysisExpertLayer, modelRef: StockAnalysisAIModelRef | null) => void
  assigning: boolean
  expanded: boolean
  onToggle: () => void
  experts: Array<{ id: string; name: string; stance: string; assignedModel: StockAnalysisAIModelRef | null; enabled: boolean; systemPrompt?: string; infoSubset?: string[] }>
  onUpdateSystemPrompt: (expertId: string, systemPrompt: string) => void
  savingPromptId: string | null
}) {
  const isRuleLayer = assignment.layer === 'rule_functions'
  const currentModelKey = assignment.defaultModel
    ? `${assignment.defaultModel.providerId}:${assignment.defaultModel.modelId}`
    : ''

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [viewingId, setViewingId] = useState<string | null>(null)

  function startEditing(expertId: string, currentPrompt: string) {
    setEditingId(expertId)
    setEditingText(currentPrompt)
    setViewingId(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingText('')
  }

  function savePrompt() {
    if (editingId) {
      onUpdateSystemPrompt(editingId, editingText)
      setEditingId(null)
      setEditingText('')
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 overflow-hidden">
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50/50" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-700">
            {LAYER_LABELS[assignment.layer] || assignment.layerName}
          </span>
          <span className="text-xs text-slate-400">{assignment.expertCount} 位专家</span>
          {isRuleLayer && <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">规则引擎</span>}
        </div>
        <div className="flex items-center gap-3">
          {!isRuleLayer && (
            <select
              value={currentModelKey}
              onChange={(e) => {
                if (!e.target.value) {
                  onAssign(assignment.layer, null)
                  return
                }
                const model = modelPool.find((m) => `${m.providerId}:${m.modelId}` === e.target.value)
                if (model) onAssign(assignment.layer, model)
              }}
              disabled={assigning}
              onClick={(e) => e.stopPropagation()}
              className="text-sm px-2 py-1 rounded-lg border border-slate-200 bg-white focus:border-indigo-400 outline-none disabled:opacity-50 max-w-[260px]"
            >
              <option value="">未分配模型</option>
              {modelPool.map((m) => (
                <option key={`${m.providerId}:${m.modelId}`} value={`${m.providerId}:${m.modelId}`}>
                  {m.displayName}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-400">{expanded ? '收起' : '展开'}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-3 py-2 space-y-1">
          {experts.map((expert) => {
            const hasPrompt = !isRuleLayer && !!expert.systemPrompt
            const isViewing = viewingId === expert.id
            const isEditing = editingId === expert.id
            const isSaving = savingPromptId === expert.id

            return (
              <div key={expert.id} className="py-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={expert.enabled ? 'text-slate-700' : 'text-slate-400 line-through'}>{expert.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      expert.stance === 'bullish' ? 'bg-red-50 text-red-600' :
                      expert.stance === 'bearish' ? 'bg-green-50 text-green-600' :
                      'bg-slate-50 text-slate-500'
                    }`}>
                      {expert.stance === 'bullish' ? '看多' : expert.stance === 'bearish' ? '看空' : '中立'}
                    </span>
                    {expert.infoSubset && expert.infoSubset.length > 0 && (
                      <span className="text-xs text-slate-400">[{expert.infoSubset.join(', ')}]</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono truncate max-w-[200px]">
                      {expert.assignedModel ? expert.assignedModel.displayName : (isRuleLayer ? '规则引擎' : '跟随层级')}
                    </span>
                    {!isRuleLayer && (
                      <>
                        {hasPrompt && !isEditing && (
                          <button
                            onClick={() => setViewingId(isViewing ? null : expert.id)}
                            className="p-1 rounded text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                            title="查看提示词"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d={isViewing ? 'M4.5 15.75l7.5-7.5 7.5 7.5' : 'M19.5 8.25l-7.5 7.5-7.5-7.5'} />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => isEditing ? cancelEditing() : startEditing(expert.id, expert.systemPrompt ?? '')}
                          className="p-1 rounded text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                          title={isEditing ? '取消编辑' : '编辑提示词'}
                        >
                          {isEditing ? <XMarkIcon className="w-3.5 h-3.5" /> : <PencilIcon className="w-3.5 h-3.5" />}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 查看模式：只读显示 */}
                {isViewing && !isEditing && hasPrompt && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">{expert.systemPrompt}</p>
                  </div>
                )}

                {/* 编辑模式 */}
                {isEditing && (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none resize-y font-mono leading-relaxed"
                      placeholder="输入该专家的系统提示词（角色设定 + 分析框架 + 决策风格）"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{editingText.length} 字</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={cancelEditing}
                          className="px-3 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                        >
                          取消
                        </button>
                        <button
                          onClick={savePrompt}
                          disabled={isSaving}
                          className="px-3 py-1 text-xs rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {isSaving ? '保存中...' : '保存提示词'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── 主组件 ──────────────────────────────────────────────────

export function AIConfigTab() {
  const [config, setConfig] = useState<StockAnalysisAIConfigWithPool | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, StockAnalysisModelTestResult>>({})
  const [providerForms, setProviderForms] = useState<ProviderFormData[]>([])
  const [dirty, setDirty] = useState(false)
  const [expandedLayers, setExpandedLayers] = useState<Set<StockAnalysisExpertLayer>>(new Set())
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null)
  const [agentConfig, setAgentConfig] = useState<DataAgentConfigStore | null>(null)
  const [agentConfigSaving, setAgentConfigSaving] = useState(false)
  const [assigningExtraction, setAssigningExtraction] = useState(false)

  useEffect(() => {
    void loadConfig()
  }, [])

  async function loadConfig() {
    setLoading(true)
    setError(null)
    try {
      const [data, agentCfg] = await Promise.all([
        fetchStockAnalysisAIConfig(),
        fetchDataAgentConfig().catch(() => null),
      ])
      setConfig(data)
      setProviderForms(data.providers.map(providerToForm))
      setDirty(false)
      if (agentCfg) setAgentConfig(agentCfg)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function showSuccess(msg: string) {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  async function handleSaveProviders() {
    setSaving(true)
    setError(null)
    try {
      const providers = providerForms.map(formToProvider)
      const data = await saveStockAnalysisAIProviders(providers)
      setConfig(data)
      setProviderForms(data.providers.map(providerToForm))
      setDirty(false)
      showSuccess('供应商配置已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleAssignLayer(layer: StockAnalysisExpertLayer, modelRef: StockAnalysisAIModelRef | null) {
    setAssigning(true)
    setError(null)
    try {
      const data = await assignModelToLayer(layer, modelRef)
      // [H7] 使用后端返回的完整数据（含最新 modelPool），而非过期的本地状态
      setConfig(data)
      showSuccess(`${LAYER_LABELS[layer]} 模型已分配`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAssigning(false)
    }
  }

  async function handleTestModel(providerId: string, baseUrl: string, apiKey: string, modelId: string) {
    setTesting(true)
    try {
      const result = await testModelConnectivity(baseUrl, apiKey, modelId)
      setTestResults((prev) => ({ ...prev, [`${providerId}:${modelId}`]: result }))
    } catch (err) {
      // 如果请求失败，构造本地失败结果
      setTestResults((prev) => ({
        ...prev,
        [`${providerId}:${modelId}`]: {
          providerId,
          modelId,
          success: false,
          latencyMs: 0,
          error: (err as Error).message,
          testedAt: new Date().toISOString(),
        },
      }))
    } finally {
      setTesting(false)
    }
  }

  function updateProviderForm(index: number, updated: ProviderFormData) {
    setProviderForms((prev) => prev.map((f, i) => (i === index ? updated : f)))
    setDirty(true)
  }

  async function handleUpdateSystemPrompt(expertId: string, systemPrompt: string) {
    setSavingPromptId(expertId)
    setError(null)
    try {
      const data = await updateExpertSystemPrompt(expertId, systemPrompt)
      setConfig(data)
      showSuccess('提示词已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSavingPromptId(null)
    }
  }

  function addProvider() {
    setProviderForms((prev) => [...prev, emptyProviderForm()])
    setDirty(true)
  }

  function removeProvider(index: number) {
    setProviderForms((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  function toggleLayer(layer: StockAnalysisExpertLayer) {
    setExpandedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
  }

  function updateAgentEnabled(agentId: string, enabled: boolean) {
    setAgentConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        agents: prev.agents.map((a) => (a.agentId === agentId ? { ...a, enabled } : a)),
      }
    })
  }

  function updateAgentTimeout(agentId: string, timeoutMs: number) {
    const clamped = Math.max(1000, Math.min(600_000, timeoutMs))
    setAgentConfig((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        agents: prev.agents.map((a) => (a.agentId === agentId ? { ...a, timeoutMs: clamped } : a)),
      }
    })
  }

  async function handleSaveAgentConfig() {
    if (!agentConfig) return
    setAgentConfigSaving(true)
    setError(null)
    try {
      const saved = await saveDataAgentConfig(agentConfig)
      setAgentConfig(saved)
      showSuccess('数据采集 Agent 配置已保存')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAgentConfigSaving(false)
    }
  }

  async function handleAssignExtractionAgent(agentId: LLMExtractionAgentId, modelRef: StockAnalysisAIModelRef | null) {
    setAssigningExtraction(true)
    setError(null)
    try {
      const data = await assignModelToExtractionAgent(agentId, modelRef)
      setConfig({ ...data, modelPool: data.modelPool ?? config?.modelPool ?? [] })
      const agentLabel = (config?.extractionAgents ?? []).find((a) => a.agentId === agentId)?.label ?? agentId
      showSuccess(`${agentLabel} 模型已分配`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setAssigningExtraction(false)
    }
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center text-slate-500">正在加载 AI 配置...</div>
  }

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-slate-500">{error || '无法加载 AI 配置'}</p>
          <button onClick={() => void loadConfig()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">重试</button>
        </div>
      </div>
    )
  }

  const modelPool = config.modelPool ?? []

  return (
    <div className="space-y-3 relative h-full pb-20">
      <h2 className="text-xl font-bold text-slate-800">AI 专家集群配置</h2>

      {/* 通知条 */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium shadow-lg animate-fade-in">
          <CheckCircleIcon className="w-5 h-5" />
          {successMsg}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700">
            <ExclamationTriangleIcon className="w-5 h-5" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="p-1 rounded hover:bg-red-100">
            <XMarkIcon className="w-4 h-4 text-red-500" />
          </button>
        </div>
      )}

      {/* ── 第一层：供应商管理 ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-slate-700">1. AI 供应商</h3>
            <p className="text-xs text-slate-500 mt-0.5">配置兼容 OpenAI 协议的 API 提供方（Base URL + API Key + 模型列表）</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={addProvider}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              添加供应商
            </button>
            <button
              onClick={() => void handleSaveProviders()}
              disabled={!dirty || saving}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '保存中...' : '保存供应商'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {providerForms.length === 0 ? (
            <div className="col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
              <p className="text-sm text-slate-500">尚未配置任何 AI 供应商</p>
              <p className="text-xs text-slate-400 mt-1">点击"添加供应商"开始配置，支持 OpenRouter、DeepSeek、OpenAI 等兼容接口</p>
            </div>
          ) : (
            providerForms.map((form, index) => (
              <ProviderEditor
                key={form.id}
                form={form}
                onChange={(updated) => updateProviderForm(index, updated)}
                onRemove={() => removeProvider(index)}
                testResults={testResults}
                onTest={handleTestModel}
                testing={testing}
              />
            ))
          )}
        </div>
      </section>

      {/* ── 第二层：模型池概览 ───────────────────────── */}
      <section>
        <div className="mb-2">
          <h3 className="font-semibold text-slate-700">2. 模型池</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            来自已启用供应商的全部可用模型（共 {modelPool.length} 个）
          </p>
        </div>

        {modelPool.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center">
            <p className="text-sm text-slate-500">模型池为空 — 请先添加并保存供应商</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {modelPool.map((m) => (
              <span
                key={`${m.providerId}:${m.modelId}`}
                className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white/70 text-xs font-medium text-slate-600"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-400 mr-2" />
                {m.displayName}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ── 第三层：按分析层批量分配 ─────────────────── */}
      <section>
        <div className="mb-2">
          <h3 className="font-semibold text-slate-700">3. 分析层模型分配</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            为每个分析层选择默认模型，该层下所有 LLM 专家将统一使用该模型。展开可查看专家详情。
          </p>
        </div>

        <div className="space-y-2">
          {(config.layerAssignments ?? []).map((assignment) => {
            const layerExperts = (config.experts ?? []).filter((e) => e.layer === assignment.layer)
            return (
              <LayerAssignmentRow
                key={assignment.layer}
                assignment={assignment}
                modelPool={modelPool}
                onAssign={handleAssignLayer}
                assigning={assigning}
                expanded={expandedLayers.has(assignment.layer)}
                onToggle={() => toggleLayer(assignment.layer)}
                experts={layerExperts}
                onUpdateSystemPrompt={(expertId, prompt) => void handleUpdateSystemPrompt(expertId, prompt)}
                savingPromptId={savingPromptId}
              />
            )
          })}
        </div>
      </section>

      {/* ── 第四层：数据采集 Agent 配置 ──────────────── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-semibold text-slate-700">4. 数据采集 Agent</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              启用/禁用各数据采集 Agent，并设置单个 Agent 的超时时间（毫秒）
            </p>
          </div>
          <button
            onClick={() => void handleSaveAgentConfig()}
            disabled={!agentConfig || agentConfigSaving}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {agentConfigSaving ? '保存中...' : '保存 Agent 配置'}
          </button>
        </div>

        {agentConfig ? (
          <div className="grid grid-cols-2 gap-3">
            {agentConfig.agents.map((agent) => (
              <div
                key={agent.agentId}
                className={`rounded-xl border p-3 flex items-center justify-between transition-colors ${
                  agent.enabled
                    ? 'border-slate-200 bg-white/70'
                    : 'border-slate-100 bg-slate-50/50 opacity-60'
                }`}
              >
                <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={agent.enabled}
                    onChange={(e) => updateAgentEnabled(agent.agentId, e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-slate-700 block">{agent.label}</span>
                    <span className="text-xs text-slate-400 font-mono">{agent.agentId}</span>
                  </div>
                </label>
                <div className="flex items-center gap-1.5 shrink-0 ml-3">
                  <label className="text-xs text-slate-500">超时</label>
                  <input
                    type="number"
                    min={1000}
                    max={600000}
                    step={1000}
                    value={agent.timeoutMs}
                    onChange={(e) => updateAgentTimeout(agent.agentId, parseInt(e.target.value, 10) || 600000)}
                    className="w-20 px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none font-mono text-right"
                  />
                  <span className="text-xs text-slate-400">ms</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center">
            <p className="text-sm text-slate-500">无法加载 Agent 配置</p>
          </div>
        )}
      </section>

      {/* ── 第五层：LLM 提取 Agent 模型配置 ─────────── */}
      <section>
        <div className="mb-2">
          <h3 className="font-semibold text-slate-700">5. LLM 提取 Agent 模型配置</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            为公告解析、新闻影响分析、舆情情感分析 3 个 LLM 提取 Agent 各自分配模型。未分配时自动选用第一个可用模型，失败后自动 fallback 到其它模型。
          </p>
        </div>

        {(config.extractionAgents ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-center">
            <p className="text-sm text-slate-500">未找到 LLM 提取 Agent 配置（请确认后端版本已更新）</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(config.extractionAgents ?? []).map((agent) => {
              const currentKey = agent.assignedModel
                ? `${agent.assignedModel.providerId}:${agent.assignedModel.modelId}`
                : ''
              return (
                <div
                  key={agent.agentId}
                  className={`rounded-xl border p-3 flex items-center justify-between transition-colors ${
                    agent.enabled
                      ? 'border-slate-200 bg-white/70'
                      : 'border-slate-100 bg-slate-50/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${agent.assignedModel ? 'bg-indigo-400' : 'bg-slate-300'}`} />
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-700 block">{agent.label}</span>
                      <span className="text-xs text-slate-400 font-mono">{agent.agentId}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <select
                      value={currentKey}
                      onChange={(e) => {
                        if (!e.target.value) {
                          void handleAssignExtractionAgent(agent.agentId, null)
                          return
                        }
                        const model = modelPool.find((m) => `${m.providerId}:${m.modelId}` === e.target.value)
                        if (model) void handleAssignExtractionAgent(agent.agentId, model)
                      }}
                      disabled={assigningExtraction}
                      className="text-sm px-2 py-1 rounded-lg border border-slate-200 bg-white focus:border-indigo-400 outline-none disabled:opacity-50 max-w-[260px]"
                    >
                      <option value="">自动选择（未指定）</option>
                      {modelPool.map((m) => (
                        <option key={`${m.providerId}:${m.modelId}`} value={`${m.providerId}:${m.modelId}`}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 系统信息 ─────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200/60 bg-white/70 p-3 text-xs text-slate-500 space-y-1">
        <p>配置版本: v{config.version} | 最后更新: {config.updatedAt ? new Date(config.updatedAt).toLocaleString('zh-CN') : '从未'}</p>
        <p>专家总数: {config.experts?.length ?? 0}（{(config.experts ?? []).filter((e) => e.layer !== 'rule_functions').length} LLM + {(config.experts ?? []).filter((e) => e.layer === 'rule_functions').length} 规则）</p>
        <p>分析层: {config.layerAssignments?.length ?? 0} | 模型池: {modelPool.length} 个可用模型</p>
      </section>
    </div>
  )
}
