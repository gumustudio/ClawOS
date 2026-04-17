import cron from 'node-cron'

import { logger } from '../../utils/logger'
import { DEFAULT_SERVER_PATHS, getServerPaths } from '../../utils/serverConfig'
import { saLog } from './sa-logger'
import {
  POST_MARKET_BATCH_WINDOW_MS,
  bootstrapStockAnalysis,
  generateMonthlyReport,
  generateWeeklyReport,
  runMorningSupplementAnalysis,
  runStockAnalysisDaily,
  runStockAnalysisPostMarket,
  runAutoDecisions,
  refreshSignalsRealtime,
  startIntradayMonitor,
  stopIntradayMonitor,
} from './service'
import { isTradingDay, syncOnlineTradingCalendar, isOnlineCacheExpired, initCalendarCacheDir, validateAndSyncCalendarOnStartup } from './trading-calendar'

let initialized = false

// [M7] 显式时区配置，确保部署到非中国时区服务器时仍正确触发
const CRON_OPTIONS = { timezone: 'Asia/Shanghai' } as const

// [M8] 日期级防重复执行：记录当天已成功完成的 cron 运行类型
// 仅对 cron 自动触发生效，手动 API 触发不受影响
const completedCronDates: Record<string, Set<string>> = {}

/** P2-D4: 使用北京时间（与 cron 的 Asia/Shanghai 时区一致） */
function todayDateStr(): string {
  return new Date().toLocaleDateString('sv', { timeZone: 'Asia/Shanghai' })
}

/** [M8] 检查指定运行类型今日是否已通过 cron 成功完成 */
function hasCronCompletedToday(runType: string): boolean {
  const today = todayDateStr()
  return completedCronDates[today]?.has(runType) ?? false
}

/** [M8] 标记指定运行类型今日已通过 cron 成功完成 */
function markCronCompletedToday(runType: string): void {
  const today = todayDateStr()
  if (!completedCronDates[today]) {
    // 清理旧日期记录，只保留当天
    for (const key of Object.keys(completedCronDates)) {
      if (key !== today) delete completedCronDates[key]
    }
    completedCronDates[today] = new Set()
  }
  completedCronDates[today].add(runType)
}

async function getStockAnalysisDir() {
  const paths = await getServerPaths()
  return paths.stockAnalysisDir || DEFAULT_SERVER_PATHS.stockAnalysisDir
}

/** 判断今天是否为本月最后一天 */
function isLastDayOfMonth(): boolean {
  const today = new Date()
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  return tomorrow.getDate() === 1
}

export function initStockAnalysisScheduler() {
  if (initialized || process.env.NODE_ENV === 'test') {
    return
  }

  initialized = true

  // [P2-4] 启动时先完成日历同步再启动业务，消除竞态
  // 日历自检完成后 → 延迟 10 秒 → 业务初始化（确保日历数据可用）
  void getStockAnalysisDir()
    .then(async (dir) => {
      initCalendarCacheDir(dir)
      saLog.info('scheduler', '启动: 交易日历自检开始')
      await validateAndSyncCalendarOnStartup()
      saLog.info('scheduler', '启动: 交易日历自检完成')
    })
    .catch((error) => {
      const msg = (error as Error).message
      saLog.error('scheduler', `启动: 交易日历自检失败 错误=${msg}`)
      logger.error(`交易日历启动自检失败: ${msg}`, { module: 'StockAnalysis' })
    })
    .then(() => {
      // 日历自检完成后再延迟 10 秒启动业务
      setTimeout(() => {
        void getStockAnalysisDir()
          .then((dir) => {
            saLog.info('scheduler', '启动: 业务预热开始')
            return bootstrapStockAnalysis(dir)
          })
          .then(() => {
            saLog.info('scheduler', '启动: 业务预热完成')
          })
          .catch((error) => {
            const msg = (error as Error).message
            saLog.error('scheduler', `启动: 业务预热失败 错误=${msg}`)
            logger.error(`AI 炒股启动预热失败: ${msg}`, { module: 'StockAnalysis' })
          })
      }, 10_000)
    })

  // 盘前 08:05 周一到周五 — 每日分析
  // [H1] 增加 isTradingDay() 守卫，避免法定假日空跑
  // [M8] 增加 hasCronCompletedToday() 守卫，避免同一天重复执行
  // [M7] 显式 timezone 保障
  cron.schedule('5 8 * * 1-5', () => {
    if (!isTradingDay()) {
      logger.info('今日非交易日，跳过每日分析', { module: 'StockAnalysis' })
      return
    }
    if (hasCronCompletedToday('daily')) {
      logger.info('[M8] 今日每日分析已由 cron 完成，跳过重复执行', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:daily 盘前每日分析开始')
        return runStockAnalysisDaily(dir)
      })
      .then(() => {
        markCronCompletedToday('daily')
        saLog.info('scheduler', 'cron:daily 盘前每日分析完成')
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:daily 盘前每日分析失败 错误=${msg}`)
        logger.error(`AI 炒股盘前刷新失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // 开盘后 09:31 周一到周五 — 一键自动执行（强烈买入自动开仓 + 买入/观望自动忽略）
  // v1.30.1：自动触发版本。依赖 08:05 每日分析已经完成
  // 与手动按钮共用 runAutoDecisions()，同一天重复触发是安全的：已处理过的信号会被 decisionSource !== 'system' 守卫跳过
  cron.schedule('31 9 * * 1-5', () => {
    if (!isTradingDay()) {
      logger.info('今日非交易日，跳过自动执行', { module: 'StockAnalysis' })
      return
    }
    if (hasCronCompletedToday('autoExecute')) {
      logger.info('[M8] 今日自动执行已完成，跳过重复触发', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:autoExecute 开盘自动执行开始')
        return runAutoDecisions(dir)
      })
      .then((result) => {
        markCronCompletedToday('autoExecute')
        saLog.info(
          'scheduler',
          `cron:autoExecute 完成 tradeDate=${result.tradeDate} bought=${result.autoBoughtCount} ignored=${result.autoIgnoredCount} skipped=${result.skippedCount}`,
        )
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:autoExecute 开盘自动执行失败 错误=${msg}`)
        logger.error(`AI 炒股开盘自动执行失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // v1.30.2: 盘中实时行情刷新 — 工作日 09:30-15:00 每 5 分钟刷新 signals 文件的 realtime 字段
  // 解决"早盘前生成 signals → 一整天展示昨收价"的时效性 bug
  // 不覆盖 snapshot（snapshot 保持为信号生成时的历史基准），只写入 signal.realtime
  // 使用两条 cron：09:30-09:55 每 5 分钟 + 10:00-14:59 每 5 分钟 + 15:00（单次收盘定格）
  //   node-cron 不支持跨段步长，用 '*/5 9-14 * * 1-5' + 额外兜底 15:00
  // 失败不重试，下一个 tick 会自然重刷，容错设计在 refreshSignalsRealtime 内部
  cron.schedule('*/5 9-14 * * 1-5', () => {
    if (!isTradingDay()) return
    const now = new Date()
    const beijingHours = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }))
    const beijingMinutes = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai', minute: '2-digit' }))
    // 只在实际交易时段跑：09:30-11:30, 13:00-15:00
    const inMorningSession = (beijingHours === 9 && beijingMinutes >= 30) || (beijingHours === 10) || (beijingHours === 11 && beijingMinutes <= 30)
    const inAfternoonSession = beijingHours >= 13 && beijingHours <= 14
    if (!inMorningSession && !inAfternoonSession) {
      return
    }
    void getStockAnalysisDir()
      .then((dir) => refreshSignalsRealtime(dir))
      .then((result) => {
        saLog.info('scheduler', `cron:refreshRealtime 完成 tradeDate=${result.tradeDate} updated=${result.updated} skipped=${result.skipped}`)
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:refreshRealtime 失败 错误=${msg}`)
      })
  }, CRON_OPTIONS)

  // v1.30.2: 15:00 收盘定格 — 独立一次，抓取当日最终收盘行情写入 realtime
  cron.schedule('0 15 * * 1-5', () => {
    if (!isTradingDay()) return
    void getStockAnalysisDir()
      .then((dir) => refreshSignalsRealtime(dir))
      .then((result) => {
        saLog.info('scheduler', `cron:refreshRealtime 收盘定格完成 tradeDate=${result.tradeDate} updated=${result.updated} skipped=${result.skipped}`)
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:refreshRealtime 收盘定格失败 错误=${msg}`)
      })
  }, CRON_OPTIONS)

  // [H2] 周五 17:00 — 自动生成周度报告 (S2)
  // 从 16:00 改为 17:00，避免与盘后分析 16:00 并发冲突
  // [M8] 增加 hasCronCompletedToday() 守卫
  // [M7] 显式 timezone 保障
  cron.schedule('0 17 * * 5', () => {
    if (!isTradingDay()) {
      logger.info('今日非交易日，跳过周度报告', { module: 'StockAnalysis' })
      return
    }
    if (hasCronCompletedToday('weekly')) {
      logger.info('[M8] 本周周度报告已由 cron 完成，跳过重复执行', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:weekly 周度报告生成开始')
        return generateWeeklyReport(dir)
      })
      .then(() => {
        markCronCompletedToday('weekly')
        saLog.info('scheduler', 'cron:weekly 周度报告生成完成')
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:weekly 周度报告生成失败 错误=${msg}`)
        logger.error(`AI 炒股周度报告生成失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // [M6] 月末最后一天 17:30 — 自动生成月度报告 (S3)
  // 去掉星期限制（改为 * 而非 1-5），由 isLastDayOfMonth() 内部守卫
  // 时间从 16:30 改为 17:30，避免与盘后分析冲突
  // [M8] 增加 hasCronCompletedToday() 守卫
  // [M7] 显式 timezone 保障
  cron.schedule('30 17 28-31 * *', () => {
    if (!isLastDayOfMonth()) return
    if (hasCronCompletedToday('monthly')) {
      logger.info('[M8] 本月月度报告已由 cron 完成，跳过重复执行', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:monthly 月度报告生成开始')
        return generateMonthlyReport(dir)
      })
      .then(() => {
        markCronCompletedToday('monthly')
        saLog.info('scheduler', 'cron:monthly 月度报告生成完成')
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:monthly 月度报告生成失败 错误=${msg}`)
        logger.error(`AI 炒股月度报告生成失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // 晨间补充 07:30 周一到周五 — 补充夜间新闻/公告数据 (G1.5)
  // 只跑 Phase 4（数据采集）+ Phase 5（LLM 信息提取），合并到前一个交易日的事实池
  cron.schedule('30 7 * * 1-5', () => {
    if (!isTradingDay()) {
      logger.info('今日非交易日，跳过晨间补充分析', { module: 'StockAnalysis' })
      return
    }
    if (hasCronCompletedToday('morningSupplement')) {
      logger.info('[M8] 今日晨间补充分析已由 cron 完成，跳过重复执行', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:morningSupplement 晨间补充分析开始')
        return runMorningSupplementAnalysis(dir)
      })
      .then(() => {
        markCronCompletedToday('morningSupplement')
        saLog.info('scheduler', 'cron:morningSupplement 晨间补充分析完成')
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:morningSupplement 晨间补充分析失败 错误=${msg}`)
        logger.error(`AI 炒股晨间补充分析失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // 盘后 16:00 周一到周五 — 盘后分析流程 (G1 双循环)
  // [M8] 增加 hasCronCompletedToday() 守卫
  // [M7] 显式 timezone 保障
  cron.schedule('0 16 * * 1-5', () => {
    if (!isTradingDay()) {
      logger.info('今日非交易日，跳过盘后分析', { module: 'StockAnalysis' })
      return
    }
    if (hasCronCompletedToday('postMarket')) {
      logger.info('[M8] 今日盘后分析已由 cron 完成，跳过重复执行', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', `cron:postMarket 盘后分析开始 最大窗口=${POST_MARKET_BATCH_WINDOW_MS}ms`)
        return runStockAnalysisPostMarket(dir)
      })
      .then(() => {
        markCronCompletedToday('postMarket')
        saLog.info('scheduler', 'cron:postMarket 盘后分析完成')
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:postMarket 盘后分析失败 错误=${msg}`)
        logger.error(`AI 炒股盘后流程失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // 开盘 09:25 周一到周五 — 启动盘中监控 (S1)
  // [M7] 显式 timezone 保障
  cron.schedule('25 9 * * 1-5', () => {
    if (!isTradingDay()) {
      logger.info('今日非交易日，跳过盘中监控', { module: 'StockAnalysis' })
      return
    }
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:intraday 盘中监控启动')
        return startIntradayMonitor(dir)
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:intraday 盘中监控启动失败 错误=${msg}`)
        logger.error(`AI 炒股盘中监控启动失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // 收盘 15:05 周一到周五 — 停止盘中监控
  // [M7] 显式 timezone 保障
  cron.schedule('5 15 * * 1-5', () => {
    if (!isTradingDay()) return
    void getStockAnalysisDir()
      .then((dir) => {
        saLog.info('scheduler', 'cron:intraday 盘中监控停止')
        return stopIntradayMonitor(dir)
      })
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:intraday 盘中监控停止失败 错误=${msg}`)
        logger.error(`AI 炒股盘中监控停止失败: ${msg}`, { module: 'StockAnalysis' })
      })
  }, CRON_OPTIONS)

  // 每天 07:30 — 在线交易日历同步（如果缓存已过期）
  // 在盘前分析 (08:05) 之前刷新，确保 isTradingDay 使用最新数据
  cron.schedule('30 7 * * *', () => {
    if (!isOnlineCacheExpired()) return
    saLog.info('scheduler', 'cron:calendarSync 在线交易日历定期同步开始')
    void syncOnlineTradingCalendar()
      .then(() => saLog.info('scheduler', 'cron:calendarSync 在线交易日历定期同步完成'))
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:calendarSync 在线交易日历定期同步失败 错误=${msg}`)
        logger.error(`在线交易日历定期同步失败: ${msg}`, { module: 'StockAnalysis' })
    })
  }, CRON_OPTIONS)

  // 每月 1 日 06:00 — 强制刷新在线交易日历（不检查过期）
  // 确保每月至少完整同步一次，避免长期使用过期缓存
  cron.schedule('0 6 1 * *', () => {
    saLog.info('scheduler', 'cron:calendarForceSync 月度强制日历同步开始')
    void syncOnlineTradingCalendar()
      .then(() => saLog.info('scheduler', 'cron:calendarForceSync 月度强制日历同步完成'))
      .catch((error) => {
        const msg = (error as Error).message
        saLog.error('scheduler', `cron:calendarForceSync 月度强制日历同步失败 错误=${msg}`)
        logger.error(`在线交易日历月度强制同步失败: ${msg}`, { module: 'StockAnalysis' })
    })
  }, CRON_OPTIONS)
}
