/**
 * Stock Analysis — 统一本地日志模块
 *
 * 职责：
 * 1. 按天分割业务日志（stock-analysis-YYYY-MM-DD.log）
 * 2. LLM 调用全量记录（llm-calls-YYYY-MM-DD.jsonl）
 * 3. 前端上报日志（frontend-YYYY-MM-DD.log）
 * 4. 审计日志（交易操作关键事件，兼容旧 appendStockAnalysisLog）
 * 5. 所有日志写入失败不影响业务
 * 6. 自动清理 30 天以前的日志
 *
 * 日志目录：$stockAnalysisDir/logs/
 */

import fs from 'fs/promises'
import path from 'path'

import { logger } from '../../utils/logger'

// ==================== 类型定义 ====================

export type SALogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LLMCallLogEntry {
  /** ISO 时间戳 */
  timestamp: string
  /** 来源模块: inference | extraction | memory */
  module: string
  /** 模型标识 */
  model: string
  /** 供应商 ID */
  providerId: string
  /** 专家名/Agent 名 */
  agentName: string
  /** 完整 prompt（system + user） */
  prompt: { system: string; user: string }
  /** 原始 response 内容 */
  response: string | null
  /** reasoning_content（如果有） */
  reasoningContent?: string | null
  /** 调用延迟（毫秒） */
  latencyMs: number
  /** token 用量 */
  tokens?: { prompt?: number; completion?: number; total?: number }
  /** 是否成功 */
  success: boolean
  /** 失败原因 */
  error?: string
  /** 额外标签 */
  tags?: Record<string, unknown>
}

export interface FrontendLogEntry {
  /** ISO 时间戳（前端本地时间） */
  timestamp: string
  /** 来源组件 */
  component: string
  /** 日志级别 */
  level: SALogLevel
  /** 消息 */
  message: string
  /** 额外数据 */
  data?: Record<string, unknown>
  /** 用户 Agent */
  userAgent?: string
}

// ==================== 内部状态 ====================

let logsDir = ''
const LOG_RETENTION_DAYS = 30
const MODULE_TAG = 'SALogger'

// ==================== 工具函数 ====================

function shanghaiDate(): string {
  return new Date().toLocaleDateString('sv', { timeZone: 'Asia/Shanghai' })
}

function nowIso(): string {
  return new Date().toISOString()
}

function formatLine(level: SALogLevel, module: string, message: string): string {
  return `[${nowIso()}] [${module}] [${level.toUpperCase()}] ${message}\n`
}

/** 安全追加写入，失败仅记录到 Winston 不抛异常 */
async function safeAppend(filePath: string, content: string): Promise<void> {
  try {
    await fs.appendFile(filePath, content, 'utf8')
  } catch (err) {
    logger.error(`日志写入失败: ${filePath} — ${(err as Error).message}`, { module: MODULE_TAG })
  }
}

/** 安全确保目录存在 */
async function ensureLogsDir(): Promise<void> {
  if (!logsDir) return
  try {
    await fs.mkdir(logsDir, { recursive: true })
  } catch {
    // 忽略 — 后续 appendFile 时会再报错
  }
}

// ==================== 日志文件路径 ====================

function businessLogPath(date: string): string {
  return path.join(logsDir, `stock-analysis-${date}.log`)
}

function llmCallLogPath(date: string): string {
  return path.join(logsDir, `llm-calls-${date}.jsonl`)
}

function frontendLogPath(date: string): string {
  return path.join(logsDir, `frontend-${date}.log`)
}

// ==================== 初始化 ====================

/**
 * 初始化日志目录。必须在服务启动时调用一次。
 * @param stockAnalysisDir 如 /home/user/文档/AI炒股分析
 */
export async function initSALogger(stockAnalysisDir: string): Promise<void> {
  logsDir = path.join(stockAnalysisDir, 'logs')
  await ensureLogsDir()
  logger.info(`SA 日志模块已初始化: ${logsDir}`, { module: MODULE_TAG })

  // 异步清理旧日志，不阻塞启动
  cleanupOldLogs().catch((err) => {
    logger.warn(`清理旧日志失败: ${(err as Error).message}`, { module: MODULE_TAG })
  })
}

// ==================== 核心日志方法 ====================

/**
 * 写入业务日志（按天分割）
 * 同时写入 Winston（保持原有行为）和本地文件
 */
function writeBusinessLog(level: SALogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  if (!logsDir) {
    // 未初始化，仅输出 Winston
    logToWinston(level, module, message, data)
    return
  }

  const date = shanghaiDate()
  const line = formatLine(level, module, message)

  // 同步写入 Winston
  logToWinston(level, module, message, data)

  // 异步写入本地文件（不阻塞调用方）
  safeAppend(businessLogPath(date), line)
}

function logToWinston(level: SALogLevel, module: string, message: string, data?: Record<string, unknown>): void {
  const winstonLevel = level === 'warn' ? 'warn' : level
  const payload = data ? `${message} | ${JSON.stringify(data)}` : message
  logger.log(winstonLevel, payload, { module })
}

// ==================== 公开 API ====================

export const saLog = {
  debug(module: string, message: string, data?: Record<string, unknown>): void {
    writeBusinessLog('debug', module, message, data)
  },

  info(module: string, message: string, data?: Record<string, unknown>): void {
    writeBusinessLog('info', module, message, data)
  },

  warn(module: string, message: string, data?: Record<string, unknown>): void {
    writeBusinessLog('warn', module, message, data)
  },

  error(module: string, message: string, data?: Record<string, unknown>): void {
    writeBusinessLog('error', module, message, data)
  },

  /**
   * 审计日志 — 交易操作关键事件（兼容旧 appendStockAnalysisLog）
   * 同时写入业务日志和 Winston
   */
  audit(module: string, message: string): void {
    writeBusinessLog('info', module, `[AUDIT] ${message}`)
  },

  /**
   * LLM 调用全量记录 — 写入 JSONL 文件
   * 每行一条 JSON，方便后续 grep/jq 分析
   */
  async llmCall(entry: LLMCallLogEntry): Promise<void> {
    if (!logsDir) return
    const date = shanghaiDate()
    const line = JSON.stringify(entry) + '\n'
    await safeAppend(llmCallLogPath(date), line)
  },

  /**
   * 前端上报日志
   */
  async frontendLog(entries: FrontendLogEntry[]): Promise<void> {
    if (!logsDir || entries.length === 0) return
    const date = shanghaiDate()
    const lines = entries.map((e) =>
      `[${e.timestamp}] [${e.component}] [${e.level.toUpperCase()}] ${e.message}${e.data ? ' | ' + JSON.stringify(e.data) : ''}\n`
    ).join('')
    await safeAppend(frontendLogPath(date), lines)
  },
}

// ==================== 日志清理 ====================

/**
 * 清理超过 LOG_RETENTION_DAYS 天的日志文件
 */
async function cleanupOldLogs(): Promise<void> {
  if (!logsDir) return

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - LOG_RETENTION_DAYS)

  let entries: string[]
  try {
    entries = await fs.readdir(logsDir)
  } catch {
    return
  }

  const datePattern = /(\d{4}-\d{2}-\d{2})/
  let cleaned = 0

  for (const entry of entries) {
    const match = entry.match(datePattern)
    if (!match) continue

    const fileDate = new Date(match[1])
    if (isNaN(fileDate.getTime())) continue

    if (fileDate < cutoff) {
      try {
        await fs.unlink(path.join(logsDir, entry))
        cleaned++
      } catch {
        // 忽略单文件删除失败
      }
    }
  }

  if (cleaned > 0) {
    logger.info(`清理了 ${cleaned} 个过期日志文件（>${LOG_RETENTION_DAYS}天）`, { module: MODULE_TAG })
  }
}

// ==================== 旧 API 兼容 ====================

/**
 * 兼容旧的 appendStockAnalysisLog 调用
 * @deprecated 请使用 saLog.audit() 替代
 */
export async function appendStockAnalysisLog(stockAnalysisDir: string, message: string): Promise<void> {
  // 初始化检查
  if (!logsDir) {
    logsDir = path.join(stockAnalysisDir, 'logs')
    await ensureLogsDir()
  }
  saLog.audit('Service', message)
}
