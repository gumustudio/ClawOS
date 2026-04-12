import { useState, useEffect } from 'react'
import { 
  ArrowPathIcon, 
  ShieldCheckIcon, 
  ClockIcon, 
  ServerIcon 
} from '@heroicons/react/24/solid'
import { withBasePath } from '../lib/basePath'
import { getBackupObservationClassName } from './monitorBackupMeta'
import { buildMonitorSummary, formatRelativeAge, getHealthLabel, getServiceActionSuggestion, getServiceRiskLabel, sortServicesBySeverity, type MonitorServiceItem } from './monitorServiceMeta'

interface ServiceStatus extends MonitorServiceItem {
  id: string
  name: string
  status: string
  isRunning: boolean
  description: string
  kind: 'core' | 'watchdog'
}

interface TimeshiftStatus {
  latest: string | null
  timestamp?: string
  error?: string
  message?: string
}

interface ResticBackupStatus {
  rootDirectory: string
  localRepo: BackupStatus
  cloud: {
    provider: 'aliyun-oss'
    configured: boolean
    repository: string | null
    message: string
  }
  schedule: {
    configured: boolean
    expression: string | null
    source: string | null
    message: string
  }
  syncStatus: 'ok' | 'warning' | 'missing-config'
  syncMessage: string
}

interface BackupStatus {
  latest: string | null
  latestName?: string
  timestamp?: string
  count: number
  directory: string
  error?: string
  message?: string
}

interface OpenClawBackupStatus {
  rootDirectory: string
  indexFile: string
  hasIndexFile: boolean
  latestIndexedVersion: string | null
  latestIndexedStamp: string | null
  syncStatus: 'ok' | 'warning' | 'missing-index'
  syncMessage: string
  versions: BackupStatus
  zips: BackupStatus
}

interface SecuritySurfaceStatus {
  summary: {
    level: 'ok' | 'warning'
    message: string
  }
  ports: Array<{
    name: string
    port: number
    expected: 'local-only' | 'direct-access'
    actual: 'local-only' | 'direct-access' | 'closed'
    ok: boolean
  }>
  credentials: {
    alistAdmin: {
      weak: boolean
      source: 'env'
    }
    aria2Secret: {
      weak: boolean
      source: 'env'
    }
  }
}

export default function ServiceMonitor() {
  const [services, setServices] = useState<ServiceStatus[]>([])
  const [security, setSecurity] = useState<SecuritySurfaceStatus | null>(null)
  const [restic, setRestic] = useState<ResticBackupStatus | null>(null)
  const [timeshift, setTimeshift] = useState<TimeshiftStatus | null>(null)
  const [openClawBackup, setOpenClawBackup] = useState<OpenClawBackupStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
      try {
        const [svcRes, securityRes, resticRes, tsRes, openClawBackupRes] = await Promise.all([
        fetch(withBasePath('/api/system/services')),
        fetch(withBasePath('/api/system/security-surface')),
        fetch(withBasePath('/api/system/restic-backup')),
        fetch(withBasePath('/api/system/timeshift')),
        fetch(withBasePath('/api/system/openclaw-backup'))
      ])
      
      const svcJson = await svcRes.json()
      const securityJson = await securityRes.json()
      const resticJson = await resticRes.json()
      const tsJson = await tsRes.json()
      const openClawBackupJson = await openClawBackupRes.json()

      if (svcJson.success) setServices(svcJson.data)
      if (securityJson.success) setSecurity(securityJson.data)
      if (resticJson.success) setRestic(resticJson.data)
      if (tsJson.success) setTimeshift(tsJson.data)
      if (openClawBackupJson.success) setOpenClawBackup(openClawBackupJson.data)
      
    } catch (error) {
      console.error('Failed to fetch monitor data', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 10000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <ArrowPathIcon className="w-6 h-6 animate-spin mr-2" /> 正在探针连接中...
      </div>
    )
  }

  const coreServices = sortServicesBySeverity(services.filter((service) => service.kind === 'core'))
  const watchdogServices = sortServicesBySeverity(services.filter((service) => service.kind === 'watchdog'))
  const allServices = [...coreServices, ...watchdogServices]
  const summary = buildMonitorSummary(allServices)

  const getStatusLabel = (service: ServiceStatus) => {
    if (service.isRunning) {
      return { text: '运行中', className: 'text-green-600 bg-green-500/10', dot: 'bg-green-500 animate-pulse' }
    }

    if (service.status === 'activating') {
      return { text: '启动中', className: 'text-amber-600 bg-amber-500/10', dot: 'bg-amber-500 animate-pulse' }
    }

    return { text: '未运行', className: 'text-red-600 bg-red-500/10', dot: 'bg-red-500' }
  }

  const getWatchdogResultLabel = (result?: string) => {
    switch (result) {
      case 'passed':
        return '通过'
      case 'retrying':
        return '重试中'
      case 'repairing':
        return '修复中'
      case 'failed':
        return '失败'
      default:
        return '暂无记录'
    }
  }

  const formatWatchdogTimestamp = (timestamp?: string) => {
    if (!timestamp) {
      return '等待首次检查'
    }

    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) {
      return '时间未知'
    }

    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatBackupTimestamp = (timestamp?: string) => {
    if (!timestamp) {
      return '时间未知'
    }

    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) {
      return '时间未知'
    }

    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const renderBackupCard = (options: {
    title: string
    accentClassName: string
    backup: TimeshiftStatus | BackupStatus | null
    showCount?: boolean
    showDirectory?: boolean
  }) => {
    const backup = options.backup
    const extendedBackup = backup as BackupStatus | null

    return (
      <div className="break-inside-avoid mb-4 bg-white/50 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-sm">
        <div className="flex items-center text-slate-700 mb-3">
          <ShieldCheckIcon className={`w-5 h-5 mr-2 ${options.accentClassName}`} />
          <h3 className="font-semibold text-lg">{options.title}</h3>
        </div>

        <div className="flex flex-col items-center justify-center min-h-32 bg-white/40 rounded-xl border border-white/20 px-4 py-4 text-center">
          {backup?.error ? (
            <div className="text-red-500 text-sm">{backup.error}</div>
          ) : backup?.latest ? (
            <>
              <ClockIcon className={`w-8 h-8 mb-2 opacity-80 ${options.accentClassName}`} />
              <div className="text-sm text-slate-500 mb-1">最新备份</div>
              <div className="text-lg font-medium text-slate-800 tracking-tight break-all">{extendedBackup?.latestName || backup.latest}</div>
              {options.showCount && typeof extendedBackup?.count === 'number' && (
                <div className="mt-2 text-xs text-slate-500">共 {extendedBackup.count} 份备份</div>
              )}
              <div className="mt-1 text-xs text-slate-400">{formatBackupTimestamp(backup.timestamp)}</div>
              {options.showDirectory && extendedBackup?.directory && (
                <div className="mt-2 text-[11px] text-slate-400 break-all">{extendedBackup.directory}</div>
              )}
            </>
          ) : (
            <div className="text-slate-500 text-sm">{backup?.message || '暂无备份记录'}</div>
          )}
        </div>
      </div>
    )
  }

  const renderOpenClawBackupCard = (backup: OpenClawBackupStatus | null) => {
    const getSyncMeta = () => {
      if (!backup) {
        return { className: 'border-slate-200 bg-white/40 text-slate-500' }
      }

      return { className: getBackupObservationClassName(backup.syncStatus) }
    }

    const renderBackupRow = (label: string, data: BackupStatus) => {
      if (data.error) {
        return (
          <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3">
            <div className="text-sm font-semibold text-slate-800">{label}</div>
            <div className="mt-1 text-xs text-red-600">{data.error}</div>
            <div className="mt-1 text-[11px] text-slate-400 break-all">{data.directory}</div>
          </div>
        )
      }

      if (!data.latest) {
        return (
          <div className="rounded-xl border border-slate-200 bg-white/50 px-3 py-3">
            <div className="text-sm font-semibold text-slate-800">{label}</div>
            <div className="mt-1 text-xs text-slate-500">{data.message || '暂无备份记录'}</div>
            <div className="mt-1 text-[11px] text-slate-400 break-all">{data.directory}</div>
          </div>
        )
      }

      return (
        <div className="rounded-xl border border-slate-200 bg-white/50 px-3 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800">{label}</div>
              <div className="mt-1 text-sm text-slate-700 break-all">{data.latestName || data.latest}</div>
            </div>
            <div className="shrink-0 rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-700">
              {data.count} 份
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-500">{formatBackupTimestamp(data.timestamp)}</div>
          <div className="mt-1 text-[11px] text-slate-400 break-all">{data.directory}</div>
        </div>
      )
    }

    return (
      <div className="break-inside-avoid mb-4 bg-white/50 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-sm">
        <div className="flex items-center text-slate-700 mb-3">
          <ShieldCheckIcon className="w-5 h-5 mr-2 text-cyan-500" />
          <h3 className="font-semibold text-lg">应用级备份</h3>
        </div>

        {!backup ? (
          <div className="flex flex-col items-center justify-center min-h-32 bg-white/40 rounded-xl border border-white/20 px-4 text-center text-slate-500 text-sm">
            暂无备份信息
          </div>
        ) : (
          <div className="space-y-3">
              <div className={`rounded-xl px-3 py-2 text-[11px] ${getSyncMeta().className}`}>
                <div className="font-semibold">同步状态：{backup.syncMessage}</div>
              </div>
              <div className="rounded-xl border border-white/20 bg-white/40 px-3 py-2 text-[11px] text-slate-500">
                <div className="font-semibold text-slate-700">ClawBackUp / OpenClaw 工作区备份</div>
                <div>根目录：<span className="break-all">{backup.rootDirectory}</span></div>
                <div className="mt-1">版本索引：{backup.hasIndexFile ? '已找到 VERSIONS.md' : '未找到 VERSIONS.md'}</div>
                {backup.latestIndexedVersion && backup.latestIndexedStamp && (
                <div className="mt-1">索引最新版本：{backup.latestIndexedVersion}-{backup.latestIndexedStamp}</div>
              )}
            </div>
            {renderBackupRow('目录版本备份', backup.versions)}
            {renderBackupRow('Zip 压缩备份', backup.zips)}
          </div>
        )}
      </div>
    )
  }

  const renderResticBackupCard = (backup: ResticBackupStatus | null) => {
    const getSyncMeta = () => {
      if (!backup) {
        return { className: 'border-slate-200 bg-white/40 text-slate-500' }
      }

      return { className: getBackupObservationClassName(backup.syncStatus) }
    }

    return (
      <div className="break-inside-avoid mb-4 bg-white/50 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-sm">
        <div className="flex items-center text-slate-700 mb-3">
          <ShieldCheckIcon className="w-5 h-5 mr-2 text-violet-500" />
          <h3 className="font-semibold text-lg">整机级备份</h3>
        </div>

        {!backup ? (
          <div className="flex flex-col items-center justify-center min-h-32 bg-white/40 rounded-xl border border-white/20 px-4 text-center text-slate-500 text-sm">
            暂无 restic 备份信息
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl px-3 py-2 text-[11px] ${getSyncMeta().className}`}>
              <div className="font-semibold">观测状态：{backup.syncMessage}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/50 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">本地 restic 仓库</div>
                  {backup.localRepo.error ? (
                    <div className="mt-1 text-xs text-red-600">{backup.localRepo.error}</div>
                  ) : backup.localRepo.latest ? (
                    <>
                      <div className="mt-1 text-sm text-slate-700 break-all">{backup.localRepo.latestName || backup.localRepo.latest}</div>
                      <div className="mt-2 text-xs text-slate-500">{formatBackupTimestamp(backup.localRepo.timestamp)}</div>
                    </>
                  ) : (
                    <div className="mt-1 text-xs text-slate-500">{backup.localRepo.message || '暂无快照'}</div>
                  )}
                </div>
                <div className="shrink-0 rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700">
                  {backup.localRepo.count} 份
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 break-all">{backup.localRepo.directory}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/50 px-3 py-3 text-[11px] text-slate-600 space-y-2">
              <div>
                <span className="font-semibold text-slate-800">云端：</span>
                <span>{backup.cloud.configured ? '阿里云 OSS 已配置' : '阿里云 OSS 未配置'}</span>
              </div>
              {backup.cloud.repository && (
                <div className="break-all text-slate-500">仓库：{backup.cloud.repository}</div>
              )}
              <div>
                <span className="font-semibold text-slate-800">计划任务：</span>
                <span>{backup.schedule.configured ? '已配置' : '未配置'}</span>
                {backup.schedule.expression ? ` (${backup.schedule.expression})` : ''}
              </div>
              <div className="text-slate-500 break-all">根目录：{backup.rootDirectory}</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderSecurityCard = (status: SecuritySurfaceStatus | null) => {
    const summaryClassName = !status
      ? 'border-slate-200 bg-white/40 text-slate-500'
      : status.summary.level === 'ok'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-amber-200 bg-amber-50 text-amber-700'

    const exposureLabel = (value: SecuritySurfaceStatus['ports'][number]['actual']) => {
      switch (value) {
        case 'local-only':
          return '仅本机'
        case 'direct-access':
          return '对外监听'
        default:
          return '未监听'
      }
    }

    return (
      <div className="break-inside-avoid mb-4 bg-white/50 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-sm">
        <div className="flex items-center text-slate-700 mb-3">
          <ShieldCheckIcon className="w-5 h-5 mr-2 text-rose-500" />
          <h3 className="font-semibold text-lg">安全状态</h3>
        </div>

        {!status ? (
          <div className="flex flex-col items-center justify-center min-h-32 bg-white/40 rounded-xl border border-white/20 px-4 text-center text-slate-500 text-sm">
            暂无安全状态信息
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl px-3 py-2 text-[11px] ${summaryClassName}`}>
              <div className="font-semibold">{status.summary.message}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/50 px-3 py-3 space-y-2">
              {status.ports.map((port) => (
                <div key={port.port} className="flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="font-semibold text-slate-800">{port.name}</div>
                    <div className="text-slate-400">:{port.port} / 预期 {port.expected === 'local-only' ? '仅本机' : '允许直连'}</div>
                  </div>
                  <span className={`rounded-full px-2 py-1 font-semibold ${port.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {exposureLabel(port.actual)}
                  </span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/50 px-3 py-3 text-xs text-slate-600 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">AList 管理密码</span>
                <span className={status.credentials.alistAdmin.weak ? 'text-amber-700' : 'text-emerald-700'}>{status.credentials.alistAdmin.weak ? '弱密码' : '已替换'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">aria2 RPC Secret</span>
                <span className={status.credentials.aria2Secret.weak ? 'text-amber-700' : 'text-emerald-700'}>{status.credentials.aria2Secret.weak ? '弱密钥' : '已替换'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderStatus = (service: ServiceStatus) => {
    const statusLabel = getStatusLabel(service)
    const healthLabel = getHealthLabel(service.health)
    const riskLabel = getServiceRiskLabel(service)
    const actionSuggestion = getServiceActionSuggestion(service)

    return (
      <div key={service.id} className="flex items-center justify-between px-3 py-2.5 bg-white/40 rounded-xl border border-white/20 gap-2">
        <div>
          <div className="font-semibold text-sm text-slate-800">{service.name}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{service.description}</div>
          {service.kind === 'core' && service.health && (
            <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded-sm font-semibold ${healthLabel.className}`}>健康: {healthLabel.text}</span>
              <span className={`px-1.5 py-0.5 rounded-sm font-semibold ${riskLabel.className}`}>风险: {riskLabel.text}</span>
              <span className="truncate max-w-[200px]" title={service.health.detail}>{service.health.summary}</span>
              {service.health.detail && <span className="text-slate-300">{service.health.detail}</span>}
            </div>
          )}
          {service.kind === 'watchdog' && (
            <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-2 flex-wrap">
              <span className="bg-white/50 px-1.5 py-0.5 rounded-sm">最近: {getWatchdogResultLabel(service.watchdogStatus?.result)}</span>
              <span className={`px-1.5 py-0.5 rounded-sm font-semibold ${riskLabel.className}`}>风险: {riskLabel.text}</span>
              <span className="truncate max-w-[120px]" title={service.watchdogStatus?.message}>{service.watchdogStatus?.message ?? '等待检查'}</span>
              <span>{formatWatchdogTimestamp(service.watchdogStatus?.timestamp)}</span>
              <span>{formatRelativeAge(service.watchdogStatus?.timestamp)}</span>
            </div>
          )}
          <div className="text-[10px] text-slate-400 mt-1.5">建议动作：{actionSuggestion}</div>
        </div>
        <div className="flex items-center shrink-0">
          <span className={`flex items-center text-[11px] px-2.5 py-1 rounded-full font-semibold tracking-wide ${statusLabel.className}`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusLabel.dot}`} /> {statusLabel.text}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="columns-1 md:columns-2 xl:columns-3 gap-6">
        
        {/* Top Summary Bar - Now constrained to a single column's width */}
        <div className="break-inside-avoid mb-6 flex flex-col justify-center rounded-2xl border border-white/40 bg-white/50 px-4 py-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">总数</span>
              <span className="text-xl font-bold text-slate-800">{summary.total}</span>
            </div>
            <div className="w-px h-8 bg-slate-200/80"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-red-500 uppercase tracking-wider font-medium mb-1">高风险</span>
              <span className="text-xl font-bold text-red-700">{summary.highRisk}</span>
            </div>
            <div className="w-px h-8 bg-slate-200/80"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-amber-600 uppercase tracking-wider font-medium mb-1">需关注</span>
              <span className="text-xl font-bold text-amber-700">{summary.warning}</span>
            </div>
            <div className="w-px h-8 bg-slate-200/80"></div>
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-emerald-600 uppercase tracking-wider font-medium mb-1">正常</span>
              <span className="text-xl font-bold text-emerald-700">{summary.healthy}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-center text-[10px] text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-2"></span>
            系统探针运行中
          </div>
        </div>

        {/* Core Services */}
        {/* Core Services */}
        <div className="break-inside-avoid mb-6 bg-white/50 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-sm">
          <div className="flex items-center text-slate-700 mb-3">
            <ServerIcon className="w-5 h-5 mr-2 text-indigo-500" />
            <h3 className="font-semibold text-lg">核心服务</h3>
          </div>
          <div className="space-y-2">
            {coreServices.map(renderStatus)}
          </div>
        </div>

        {/* Watchdog Services */}
        <div className="break-inside-avoid mb-6 bg-white/50 backdrop-blur-md rounded-2xl p-4 border border-white/40 shadow-sm">
          <div className="flex items-center text-slate-700 mb-3">
            <ShieldCheckIcon className="w-5 h-5 mr-2 text-indigo-400" />
            <h3 className="font-semibold text-lg">自动守护</h3>
          </div>
          <div className="space-y-2">
            {watchdogServices.map(renderStatus)}
          </div>
        </div>

        {renderSecurityCard(security)}
        {renderResticBackupCard(restic)}
        {renderBackupCard({ title: '系统级备份', accentClassName: 'text-teal-500', backup: timeshift })}
        {renderOpenClawBackupCard(openClawBackup)}

      </div>
    </div>
  )
}
