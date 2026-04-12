import {
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

import type { StockAnalysisOverview } from '../types'
import { dataStateLabel, runStateLabel } from '../utils'

export type Tab = 'dashboard' | 'strategies' | 'risk' | 'memory' | 'profile' | 'aiconfig' | 'guide' | 'expert_analysis' | 'data_collection'

export function LoadingState() {
  return <div className="h-full flex items-center justify-center text-slate-500">正在初始化 A 股数据与今日信号...</div>
}

export function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-red-600 mb-3">
          <ExclamationTriangleIcon className="w-6 h-6" />
          <div className="font-bold">AI 炒股初始化失败</div>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{error}</p>
        <button onClick={onRetry} className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">重试</button>
      </div>
    </div>
  )
}

export function StatusBanner({ overview }: { overview: StockAnalysisOverview }) {
  const { systemStatus } = overview
  const showBanner = systemStatus.dataState !== 'ready' || systemStatus.runState === 'running' || Boolean(systemStatus.lastError)
  if (!showBanner) {
    return null
  }

  const toneClass = systemStatus.runState === 'running'
    ? 'border-blue-200 bg-blue-50/70 text-blue-700'
    : systemStatus.dataState === 'stale'
      ? 'border-amber-200 bg-amber-50/70 text-amber-700'
      : 'border-red-200 bg-red-50/70 text-red-700'

  return (
    <div className={`mx-2 mb-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${toneClass}`}>
      <div className="font-semibold mb-1">
        {runStateLabel(systemStatus.runState)} · {dataStateLabel(systemStatus.dataState)}
      </div>
      {systemStatus.runState === 'running' && systemStatus.currentRun ? (
        <p>{systemStatus.currentRun.phase} {systemStatus.currentRun.processedCount}/{systemStatus.currentRun.totalCount}</p>
      ) : null}
      {systemStatus.latestSignalDate ? <p>快照: {systemStatus.latestSignalDate}</p> : null}
      {systemStatus.staleReasons.length > 0 ? (
        <div className="mt-1 space-y-0.5">
          {systemStatus.staleReasons.slice(0, 2).map((reason) => <p key={reason} className="truncate" title={reason}>- {reason}</p>)}
        </div>
      ) : null}
      {systemStatus.lastError ? <p className="mt-1 truncate" title={systemStatus.lastError}>错误: {systemStatus.lastError}</p> : null}
      {systemStatus.lastSuccessAt ? <p className="mt-1 text-[10px] opacity-75">成功: {new Date(systemStatus.lastSuccessAt).toLocaleString('zh-CN')}</p> : null}
    </div>
  )
}

export function TabButton({ tab, icon, label, activeTab, onClick }: { tab: Tab; icon: React.ReactNode; label: string; activeTab: Tab; onClick: (tab: Tab) => void }) {
  const active = activeTab === tab
  return (
    <button
      onClick={() => onClick(tab)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100/60 hover:text-slate-900'}`}
    >
      {icon}
      {label}
    </button>
  )
}

export function StatCard({ title, value, subtitle, tone }: { title: string; value: string; subtitle: string; tone: 'up' | 'down' | 'neutral' }) {
  const toneClass = tone === 'up' ? 'text-red-600' : tone === 'down' ? 'text-green-600' : 'text-slate-800'
  return (
    <div className="bg-white/70 border border-slate-200/60 p-5 rounded-2xl shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-2">{subtitle}</div>
    </div>
  )
}

export function MetricCard({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="rounded-xl bg-slate-50/70 border border-slate-100 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-sm font-semibold text-slate-800 ${valueClassName || ''}`}>{value}</div>
    </div>
  )
}

export function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right text-slate-700 ${mono ? 'font-mono text-xs break-all' : ''}`}>{value}</span>
    </div>
  )
}

export function ScoreRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium text-slate-800 ${valueClassName || ''}`}>{value}</span>
    </div>
  )
}

export function MiniPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/70 border border-slate-200/60 rounded-2xl p-5 shadow-sm min-h-[200px]">
      <h3 className="font-semibold text-slate-700 mb-4">{title}</h3>
      {children}
    </div>
  )
}

export function ProgressRow({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-bold text-slate-800">{value}%</span>
      </div>
      <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
        <div className={`${colorClass} h-full`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

export function AdviceCard({ tone, title, content }: { tone: 'red' | 'amber' | 'green'; title: string; content: string }) {
  const toneMap = {
    red: 'border-red-100 bg-red-50/60',
    amber: 'border-amber-100 bg-amber-50/60',
    green: 'border-green-100 bg-green-50/60',
  }
  return (
    <div className={`p-3 rounded-xl border ${toneMap[tone]}`}>
      <div className="font-bold text-slate-800 text-sm">{title}</div>
      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{content}</p>
    </div>
  )
}

export function AdviceSection({ title, tone, items, emptyText }: { title: string; tone: 'red' | 'green' | 'amber' | 'purple'; items: Array<{ title: string; code: string | null; score?: number; summary: string; bullets: string[] }>; emptyText: string }) {
  const toneMap = {
    red: 'border-red-100 bg-red-50/60',
    green: 'border-green-100 bg-green-50/60',
    amber: 'border-amber-100 bg-amber-50/60',
    purple: 'border-purple-100 bg-purple-50/60',
  }

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <h4 className="font-semibold text-slate-800 mb-3">{title}</h4>
      <div className="space-y-3 text-sm text-slate-700">
        {items.length > 0 ? items.map((item) => (
          <div key={`${item.title}-${item.code ?? 'none'}`} className="rounded-xl bg-white/70 border border-white/60 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="font-semibold text-slate-800">{item.title}{item.code ? ` (${item.code})` : ''}</div>
              {typeof item.score === 'number' ? <div className="text-xs text-slate-500">综合分 {item.score}</div> : null}
            </div>
            <p className="mt-2 text-slate-600">{item.summary}</p>
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              {item.bullets.map((bullet) => <p key={bullet}>- {bullet}</p>)}
            </div>
          </div>
        )) : <p className="text-slate-500">{emptyText}</p>}
      </div>
    </div>
  )
}

export function InfoPanel({ title, items, emptyText, tone }: { title: string; items: string[]; emptyText: string; tone: 'green' | 'amber' | 'red' }) {
  const toneMap = {
    green: 'border-green-100 bg-green-50/60',
    amber: 'border-amber-100 bg-amber-50/60',
    red: 'border-red-100 bg-red-50/60',
  }

  return (
    <div className={`rounded-xl border p-4 ${toneMap[tone]}`}>
      <h4 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">{title}</h4>
      <div className="space-y-2 text-sm text-slate-700">
        {items.length > 0 ? items.map((item) => <p key={item}>- {item}</p>) : <p className="text-slate-500">{emptyText}</p>}
      </div>
    </div>
  )
}

export function Tag({ text, tone }: { text: string; tone: 'green' | 'amber' }) {
  return <span className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tone === 'green' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>{text}</span>
}
