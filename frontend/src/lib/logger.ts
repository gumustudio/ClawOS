/**
 * 前端日志模块 — 缓冲 + 批量上报到后端
 *
 * 职责：
 * 1. 提供 frontendLog.debug/info/warn/error 方法
 * 2. 缓冲日志条目，达到阈值或定时自动上报
 * 3. 上报到 POST /api/system/stock-analysis/client-log
 * 4. 上报失败静默降级（不影响用户操作）
 * 5. 捕获全局 unhandledrejection / error 事件
 */

import { withBasePath } from './basePath'

// ==================== 类型定义 ====================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface FrontendLogEntry {
  timestamp: string
  component: string
  level: LogLevel
  message: string
  data?: Record<string, unknown>
  userAgent?: string
}

// ==================== 内部状态 ====================

let buffer: FrontendLogEntry[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let isFlushing = false

const BUFFER_SIZE = 20
const FLUSH_INTERVAL_MS = 10_000
const MAX_MESSAGE_LENGTH = 2000

// ==================== 核心方法 ====================

function pushEntry(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
  const entry: FrontendLogEntry = {
    timestamp: new Date().toISOString(),
    component,
    level,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    data,
    userAgent: navigator.userAgent,
  }

  buffer.push(entry)

  // 达到阈值立即上报
  if (buffer.length >= BUFFER_SIZE) {
    flush()
  }
}

async function flush(): Promise<void> {
  if (isFlushing || buffer.length === 0) return

  const entries = buffer
  buffer = []
  isFlushing = true

  try {
    const response = await fetch(withBasePath('/api/system/stock-analysis/client-log'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    })
    if (!response.ok) {
      // 静默降级：上报失败不抛异常
      console.warn(`[frontendLog] 日志上报失败: HTTP ${response.status}`)
    }
  } catch {
    // 网络错误静默降级
    console.warn('[frontendLog] 日志上报网络错误')
  } finally {
    isFlushing = false
  }
}

function ensureFlushTimer(): void {
  if (flushTimer !== null) return
  flushTimer = setInterval(() => {
    flush()
  }, FLUSH_INTERVAL_MS)
}

// ==================== 公开 API ====================

export const frontendLog = {
  debug(component: string, message: string, data?: Record<string, unknown>): void {
    pushEntry('debug', component, message, data)
  },

  info(component: string, message: string, data?: Record<string, unknown>): void {
    pushEntry('info', component, message, data)
  },

  warn(component: string, message: string, data?: Record<string, unknown>): void {
    pushEntry('warn', component, message, data)
  },

  error(component: string, message: string, data?: Record<string, unknown>): void {
    pushEntry('error', component, message, data)
  },

  /** 手动触发上报（如页面卸载前调用） */
  flush,
}

// ==================== 全局错误捕获 ====================

/** 初始化全局错误监听，应在应用入口调用一次 */
export function initFrontendLogger(): void {
  ensureFlushTimer()

  // 捕获未处理的 Promise rejection
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : String(reason)
    frontendLog.error('global', `Unhandled rejection: ${message}`, {
      stack: reason instanceof Error ? reason.stack : undefined,
    })
  })

  // 捕获全局 JS 错误
  window.addEventListener('error', (event) => {
    // 忽略资源加载错误（img/script/css），只捕获 JS 运行时错误
    if (event.target && event.target !== window) return
    frontendLog.error('global', `Uncaught error: ${event.message}`, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    })
  })

  // 页面卸载前尝试发送剩余日志
  window.addEventListener('beforeunload', () => {
    if (buffer.length === 0) return
    // 使用 sendBeacon 确保页面关闭时日志也能发送
    try {
      navigator.sendBeacon(
        withBasePath('/api/system/stock-analysis/client-log'),
        JSON.stringify(buffer),
      )
      buffer = []
    } catch {
      // 静默降级
    }
  })

  frontendLog.info('global', 'Frontend logger initialized')
}
