export interface MonitorServiceHealth {
  level: 'ok' | 'warning' | 'down' | 'unknown'
  summary: string
  detail?: string
}

export interface MonitorServiceWatchdogStatus {
  timestamp: string
  result: string
  message: string
}

export interface MonitorServiceItem {
  id: string
  name: string
  status: string
  isRunning: boolean
  description: string
  kind: 'core' | 'watchdog'
  health?: MonitorServiceHealth | null
  watchdogStatus?: MonitorServiceWatchdogStatus | null
}

export interface MonitorSummary {
  total: number
  highRisk: number
  warning: number
  healthy: number
}

export function getHealthLabel(health?: MonitorServiceHealth | null) {
  if (!health) {
    return { text: '未探测', className: 'text-slate-500 bg-slate-100' }
  }

  switch (health.level) {
    case 'ok':
      return { text: '可用', className: 'text-emerald-700 bg-emerald-50' }
    case 'warning':
      return { text: '异常', className: 'text-amber-700 bg-amber-50' }
    case 'down':
      return { text: '不可用', className: 'text-red-700 bg-red-50' }
    default:
      return { text: '未知', className: 'text-slate-600 bg-slate-100' }
  }
}

export function getServiceRiskLabel(service: MonitorServiceItem) {
  if (service.kind === 'watchdog') {
    if (service.watchdogStatus?.result === 'failed') {
      return { text: '高风险', className: 'text-red-700 bg-red-50' }
    }

    if (service.watchdogStatus?.result === 'repairing' || service.watchdogStatus?.result === 'retrying') {
      return { text: '处理中', className: 'text-amber-700 bg-amber-50' }
    }

    return { text: '低风险', className: 'text-slate-600 bg-slate-100' }
  }

  if (!service.isRunning || service.health?.level === 'down') {
    return { text: '高风险', className: 'text-red-700 bg-red-50' }
  }

  if (service.health?.level === 'warning') {
    return { text: '中风险', className: 'text-amber-700 bg-amber-50' }
  }

  return { text: '低风险', className: 'text-slate-600 bg-slate-100' }
}

export function formatRelativeAge(timestamp?: string) {
  if (!timestamp) {
    return '暂无记录'
  }

  const time = new Date(timestamp).getTime()
  if (Number.isNaN(time)) {
    return '时间未知'
  }

  const diffMs = Date.now() - time
  if (diffMs < 60_000) {
    return '刚刚'
  }

  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${diffMinutes} 分钟前`
  }

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours} 小时前`
  }

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} 天前`
}

export function isServiceAbnormal(service: MonitorServiceItem) {
  return getServiceSeverity(service) < 3
}

export function getServiceActionSuggestion(service: MonitorServiceItem) {
  if (service.kind === 'watchdog') {
    if (service.watchdogStatus?.result === 'failed') {
      return '建议先查看最近一次巡检日志，确认自动修复为什么失败。'
    }

    if (service.watchdogStatus?.result === 'repairing' || service.watchdogStatus?.result === 'retrying') {
      return '系统正在自动处理，若长时间不恢复，再手动检查对应服务。'
    }

    return '当前没有明显风险，保持观察即可。'
  }

  switch (service.id) {
    case 'clawos':
      return '建议先确认 ClawOS 主界面接口是否可访问，必要时重启 clawos 服务。'
    case 'openclaw':
      return '建议先检查 OpenClaw 网关是否能打开，再决定是否重启 AI 网关服务。'
    case 'filebrowser':
      return '建议先检查文件管理页面能否打开，异常时可重启 FileBrowser 服务。'
    case 'aria2':
      return '建议先检查下载引擎 RPC 是否响应，异常时优先重启 aria2 下载服务。'
    case 'alist':
      return '建议先检查 AList 后台接口是否可访问，再确认网盘挂载状态。'
    case 'display-inhibit':
      return '建议先确认当前远程会话是否容易黑屏或锁屏，异常时可重启保活进程。'
    default:
      if (!service.isRunning || service.health?.level === 'down') {
        return '服务当前不可用，建议先尝试重启该服务。'
      }

      if (service.health?.level === 'warning') {
        return '进程还在，但功能探测异常，建议优先检查接口和日志。'
      }

      return '当前没有明显风险，保持观察即可。'
  }
}

export function buildMonitorSummary(services: MonitorServiceItem[]): MonitorSummary {
  return services.reduce<MonitorSummary>((summary, service) => {
    const severity = getServiceSeverity(service)
    summary.total += 1

    if (severity === 0) {
      summary.highRisk += 1
      return summary
    }

    if (severity === 1 || severity === 2) {
      summary.warning += 1
      return summary
    }

    summary.healthy += 1
    return summary
  }, {
    total: 0,
    highRisk: 0,
    warning: 0,
    healthy: 0
  })
}

function getServiceSeverity(service: MonitorServiceItem) {
  if (service.kind === 'watchdog') {
    switch (service.watchdogStatus?.result) {
      case 'failed':
        return 0
      case 'repairing':
      case 'retrying':
        return 1
      default:
        return 3
    }
  }

  if (!service.isRunning || service.health?.level === 'down') {
    return 0
  }

  if (service.health?.level === 'warning') {
    return 1
  }

  if (service.health?.level === 'unknown') {
    return 2
  }

  return 3
}

export function sortServicesBySeverity(services: MonitorServiceItem[]) {
  return [...services].sort((left, right) => {
    const severityDiff = getServiceSeverity(left) - getServiceSeverity(right)
    if (severityDiff !== 0) {
      return severityDiff
    }

    return left.name.localeCompare(right.name)
  })
}
