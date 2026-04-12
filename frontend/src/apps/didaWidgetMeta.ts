import { parseTaskDate } from './DidaApp/date'
import type { Project, Task } from './DidaApp/types'

export interface DidaWidgetTaskItem {
  id: string
  title: string
  dueLabel: string
  isOverdue: boolean
}

export interface DidaInboxWidgetModel {
  inboxProjectId: string
  inboxName: string
  pendingCount: number
  completedTodayCount: number
  tasks: DidaWidgetTaskItem[]
}

function getInboxProject(projects: Project[]): Project | null {
  return projects.find((project) => project.isSystem) ?? projects.find((project) => project.id === 'inbox') ?? null
}

function getTodayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function isSameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

function getSortTimestamp(task: Task): number {
  const date = parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate)
  return date ? date.getTime() : Number.MAX_SAFE_INTEGER
}

function formatDueLabel(task: Task, now: Date): { text: string; isOverdue: boolean } {
  const dueDate = parseTaskDate(task.dueDate)
  if (!dueDate) {
    return { text: '', isOverdue: false }
  }

  const todayStart = getTodayStart(now)
  const tomorrow = new Date(todayStart)
  tomorrow.setDate(todayStart.getDate() + 1)

  if (dueDate < todayStart) {
    return { text: '已逾期', isOverdue: true }
  }

  if (isSameDay(dueDate, now)) {
    return {
      text: task.isAllDay ? '今天' : dueDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isOverdue: false,
    }
  }

  if (isSameDay(dueDate, tomorrow)) {
    return { text: '明天', isOverdue: false }
  }

  return {
    text: dueDate.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
    isOverdue: false,
  }
}

export function buildDidaInboxWidgetModel(tasks: Task[], projects: Project[], now: Date, limit = 6): DidaInboxWidgetModel {
  const inboxProject = getInboxProject(projects)
  const inboxProjectId = inboxProject?.id ?? 'inbox'
  const inboxName = inboxProject?.name ?? '收集箱'
  const todayStart = getTodayStart(now)

  const inboxTasks = tasks.filter((task) => task.projectId === inboxProjectId)
  const pendingTasks = inboxTasks.filter((task) => task.status === 0)
  const completedTodayCount = inboxTasks.filter((task) => {
    if (task.status !== 2) {
      return false
    }

    const date = parseTaskDate(task.dueDate) ?? parseTaskDate(task.startDate)
    return Boolean(date && isSameDay(date, todayStart))
  }).length

  const widgetTasks = pendingTasks
    .slice()
    .sort((left, right) => {
      const leftMeta = formatDueLabel(left, now)
      const rightMeta = formatDueLabel(right, now)
      if (leftMeta.isOverdue !== rightMeta.isOverdue) {
        return leftMeta.isOverdue ? -1 : 1
      }

      const timeDiff = getSortTimestamp(left) - getSortTimestamp(right)
      if (timeDiff !== 0) {
        return timeDiff
      }

      if (left.priority !== right.priority) {
        return right.priority - left.priority
      }

      return left.sortOrder - right.sortOrder
    })
    .slice(0, limit)
    .map((task) => {
      const { text, isOverdue } = formatDueLabel(task, now)
      return {
        id: task.id,
        title: task.title,
        dueLabel: text,
        isOverdue,
      }
    })

  return {
    inboxProjectId,
    inboxName,
    pendingCount: pendingTasks.length,
    completedTodayCount,
    tasks: widgetTasks,
  }
}
