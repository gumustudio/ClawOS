export type Aria2TaskStatus = 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed'
export type DownloadFilter = 'all' | 'active' | 'waiting' | 'paused' | 'error' | 'completed'
export type CleanupScope = 'completed' | 'failed' | 'all-history'

export interface DownloadWidgetTaskFile {
  path?: string
}

export interface DownloadWidgetTask {
  gid: string
  status: Aria2TaskStatus
  totalLength: string
  completedLength: string
  downloadSpeed: string
  dir?: string
  errorCode?: string
  errorMessage?: string
  files?: DownloadWidgetTaskFile[]
  bittorrent?: {
    info?: {
      name?: string
    }
  }
}

export interface DownloadTaskMetaInput {
  status: Aria2TaskStatus
}

export function matchesDownloadFilter(status: Aria2TaskStatus, filter: DownloadFilter) {
  if (filter === 'all') return true
  if (filter === 'active') return status === 'active'
  if (filter === 'waiting') return status === 'waiting'
  if (filter === 'paused') return status === 'paused'
  if (filter === 'error') return status === 'error' || status === 'removed'
  return status === 'complete'
}

export function getCleanupLabel(scope: CleanupScope) {
  if (scope === 'completed') return '清理已完成'
  if (scope === 'failed') return '清理失败/已删除'
  return '清空全部历史'
}

export function getTaskDisplayName(task: DownloadWidgetTask) {
  if (task.bittorrent?.info?.name) {
    return task.bittorrent.info.name
  }

  const firstPath = task.files?.find((file) => file.path)?.path
  if (!firstPath) {
    return '未知任务'
  }

  return firstPath.split('/').pop() || firstPath
}

function getWidgetTaskPriority(status: Aria2TaskStatus) {
  switch (status) {
    case 'active':
      return 0
    case 'waiting':
      return 1
    case 'paused':
      return 2
    case 'error':
      return 3
    case 'complete':
      return 4
    default:
      return 5
  }
}

export function getWidgetTaskTone(status: Aria2TaskStatus) {
  switch (status) {
    case 'active':
      return 'text-cyan-600'
    case 'waiting':
      return 'text-amber-600'
    case 'paused':
      return 'text-slate-500'
    case 'error':
      return 'text-red-600'
    case 'complete':
      return 'text-emerald-600'
    default:
      return 'text-slate-400'
  }
}

export function getWidgetTaskSummary(task: DownloadWidgetTask) {
  if (task.status === 'active') {
    return '正在下载'
  }

  if (task.status === 'waiting') {
    return '等待开始'
  }

  if (task.status === 'paused') {
    return '已暂停'
  }

  if (task.status === 'error') {
    return task.errorMessage || task.errorCode || '任务失败'
  }

  if (task.status === 'complete') {
    return '已完成'
  }

  return '已移除'
}

export function getWidgetTasks(tasks: DownloadWidgetTask[], limit = 2) {
  return [...tasks]
    .sort((left, right) => getWidgetTaskPriority(left.status) - getWidgetTaskPriority(right.status))
    .slice(0, limit)
}

export function getTaskStatusLabel(task: DownloadTaskMetaInput) {
  switch (task.status) {
    case 'active':
      return '下载中'
    case 'waiting':
      return '排队中'
    case 'paused':
      return '已暂停'
    case 'error':
      return '下载失败'
    case 'complete':
      return '已完成'
    default:
      return '已移除'
  }
}
