/**
 * 中国 A 股交易日历 & 交易时间工具
 *
 * 提供交易日判断、交易时段判断等工具函数，供 service.ts / memory.ts 等共享使用。
 *
 * 数据来源分两层：
 * 1. 静态数据（CHINA_MARKET_HOLIDAYS / CHINA_MARKET_EXTRA_TRADING_DAYS）— 硬编码兜底
 * 2. 在线数据（AKShare tool_trade_date_hist_sina）— 缓存到本地 JSON，定期同步
 *
 * isTradingDay 优先使用在线缓存，在线缓存不可用时降级到静态数据。
 */

import { execFile } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { promisify } from 'util'

import { logger } from '../../utils/logger'

const execFileAsync = promisify(execFile)

const MODULE = 'TradingCalendar'

/** 假日数据覆盖的年份范围（含两端） */
const HOLIDAY_DATA_MIN_YEAR = 2025
const HOLIDAY_DATA_MAX_YEAR = 2027

/**
 * 中国 A 股市场法定休市日（2025-2027）。
 * 包含元旦、春节、清明、五一、端午、中秋、国庆等法定假日。
 * 每年底需要根据国务院公布的节假日安排更新下一年的数据。
 */
export const CHINA_MARKET_HOLIDAYS: ReadonlySet<string> = new Set([
  // 2025 年
  '2025-01-01',                                     // 元旦
  '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', // 春节
  '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
  '2025-04-04', '2025-04-05', '2025-04-06',         // 清明
  '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05', // 五一
  '2025-05-31', '2025-06-01', '2025-06-02',         // 端午
  '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', // 国庆+中秋
  '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
  // 2026 年（依据国务院办公厅 国办发明电〔2025〕7号 正式通知）
  '2026-01-01', '2026-01-02', '2026-01-03',         // 元旦 1/1(四)-1/3(六)
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', // 春节 2/15(日)-2/23(一)
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',         // 清明 4/4(六)-4/6(一)
  '2026-05-01', '2026-05-02', '2026-05-03',         // 五一 5/1(五)-5/5(二)
  '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',         // 端午 6/19(五)-6/21(日)
  '2026-09-25', '2026-09-26', '2026-09-27',         // 中秋 9/25(五)-9/27(日)
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', // 国庆 10/1(四)-10/7(三)
  '2026-10-05', '2026-10-06', '2026-10-07',
  // 2027 年（预估）
  '2027-01-01', '2027-01-02', '2027-01-03',         // 元旦
  '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', // 春节
  '2027-02-09', '2027-02-10', '2027-02-11',
  '2027-04-05', '2027-04-06', '2027-04-07',         // 清明
  '2027-05-01', '2027-05-02', '2027-05-03',         // 五一
  '2027-06-09', '2027-06-10', '2027-06-11',         // 端午
  '2027-09-15', '2027-09-16', '2027-09-17',         // 中秋
  '2027-10-01', '2027-10-02', '2027-10-03', '2027-10-04', // 国庆
  '2027-10-05', '2027-10-06', '2027-10-07',
])

/**
 * [H3] 中国 A 股市场调休补班日（周末但交易所正常开市）。
 * 国务院假期调休后的补班日，交易所会正常开市。
 * 每年底需要根据国务院公布的调休安排更新。
 */
export const CHINA_MARKET_EXTRA_TRADING_DAYS: ReadonlySet<string> = new Set([
  // 2025 年调休补班日
  '2025-01-26',   // 春节调休补班（周日）
  '2025-02-08',   // 春节调休补班（周六）
  '2025-04-27',   // 五一调休补班（周日）
  '2025-09-28',   // 国庆调休补班（周日）
  '2025-10-11',   // 国庆调休补班（周六）
  // 2026 年调休补班日（依据国务院办公厅 国办发明电〔2025〕7号 正式通知）
  '2026-01-04',   // 元旦调休补班（周日）
  '2026-02-14',   // 春节调休补班（周六）
  '2026-02-28',   // 春节调休补班（周六）
  '2026-05-09',   // 五一调休补班（周六）
  '2026-09-20',   // 国庆调休补班（周日）
  '2026-10-10',   // 国庆调休补班（周六）
  // 2027 年调休补班日（预估）
  '2027-02-20',   // 春节调休补班（周六）
  '2027-10-09',   // 国庆调休补班（周六）
])

// ─── 在线日历缓存 ───────────────────────────────────────────────────────

/** 在线缓存的交易日集合（按年份存储）。key = 年份, value = Set<YYYY-MM-DD> */
const onlineTradeDatesCache: Map<number, Set<string>> = new Map()

/** 在线缓存加载时间戳，用于判断是否过期 */
let onlineCacheLoadedAt = 0

/** 在线缓存有效期：24 小时 */
const ONLINE_CACHE_TTL_MS = 24 * 60 * 60 * 1000

/** 缓存文件存放目录（由 initCalendarCacheDir 设置） */
let calendarCacheDir: string | null = null

/** Python 用户 site-packages 路径（缓存以避免重复查询） */
let pythonUserSitePromise: Promise<string | null> | null = null

/**
 * 在线日历缓存文件结构。
 * 每个年份一个 JSON 文件，记录当年所有交易日。
 */
interface OnlineCalendarCache {
  year: number
  fetchedAt: string
  source: string
  tradeDates: string[]
}

// ─── 内部辅助 ────────────────────────────────────────────────────────

/** 是否已对年份超出范围发出过告警（避免重复日志刷屏） */
let yearOutOfRangeWarned = false

/** 将 Date 格式化为 YYYY-MM-DD（强制中国时区 Asia/Shanghai） */
export function formatDateStr(date: Date): string {
  const str = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
  return str // en-CA 格式恰好是 YYYY-MM-DD
}

async function getPythonUserSitePackages(): Promise<string | null> {
  if (!pythonUserSitePromise) {
    pythonUserSitePromise = execFileAsync('python3', ['-c', 'import site; print(site.getusersitepackages())'], {
      maxBuffer: 1024 * 256,
      env: process.env,
    })
      .then(({ stdout }) => stdout.trim() || null)
      .catch(() => null)
  }
  return pythonUserSitePromise
}

// ─── 在线日历同步 ────────────────────────────────────────────────────

/**
 * 初始化日历缓存目录。
 * 应在 bootstrapStockAnalysis 时调用一次，传入 stockAnalysisDir。
 */
export function initCalendarCacheDir(stockAnalysisDir: string): void {
  calendarCacheDir = path.join(stockAnalysisDir, 'cache')
}

function getCacheFilePath(year: number): string | null {
  if (!calendarCacheDir) return null
  return path.join(calendarCacheDir, `trading-calendar-${year}.json`)
}

/**
 * 从本地缓存文件读取在线日历数据。
 * 启动时调用，将磁盘缓存加载到内存。
 */
async function loadOnlineCacheFromDisk(year: number): Promise<boolean> {
  const filePath = getCacheFilePath(year)
  if (!filePath) return false
  try {
    const content = await fs.readFile(filePath, 'utf8')
    const cache = JSON.parse(content) as OnlineCalendarCache
    if (!cache.tradeDates || !Array.isArray(cache.tradeDates) || cache.year !== year) {
      return false
    }
    onlineTradeDatesCache.set(year, new Set(cache.tradeDates))
    onlineCacheLoadedAt = Date.now()
    logger.info(
      `已从磁盘加载 ${year} 年在线交易日历缓存（${cache.tradeDates.length} 个交易日，来源: ${cache.source}，获取时间: ${cache.fetchedAt}）`,
      { module: MODULE },
    )
    return true
  } catch {
    return false
  }
}

/**
 * 通过 AKShare (tool_trade_date_hist_sina) 拉取在线交易日历。
 * 返回指定年份的交易日列表，失败返回 null。
 */
async function fetchOnlineTradeDates(year: number): Promise<string[] | null> {
  const script = `
import json, sys
try:
    import akshare as ak
    df = ak.tool_trade_date_hist_sina()
    dates = [str(d) for d in df['trade_date'] if str(d).startswith('${year}-')]
    print(json.dumps({"success": True, "data": dates}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
    sys.exit(1)
`
  try {
    const pythonUserSite = await getPythonUserSitePackages()
    const env = { ...process.env }
    if (pythonUserSite) {
      env.PYTHONPATH = env.PYTHONPATH ? `${pythonUserSite}:${env.PYTHONPATH}` : pythonUserSite
    }

    const { stdout } = await execFileAsync('python3', ['-c', script], {
      maxBuffer: 1024 * 1024 * 4,
      env,
      timeout: 30_000,
    })
    const result = JSON.parse(stdout.trim()) as { success: boolean; data?: string[]; error?: string }
    if (!result.success || !result.data) {
      logger.warn(`AKShare 在线日历拉取失败: ${result.error || '空数据'}`, { module: MODULE })
      return null
    }
    if (result.data.length < 200) {
      logger.warn(`AKShare 返回 ${year} 年交易日数量异常偏少（${result.data.length}），可能数据源不完整`, { module: MODULE })
    }
    return result.data
  } catch (err) {
    logger.warn(`在线交易日历拉取异常: ${(err as Error).message}`, { module: MODULE })
    return null
  }
}

/**
 * 将在线数据保存到磁盘缓存。
 */
async function saveOnlineCacheToDisk(year: number, tradeDates: string[], source: string): Promise<void> {
  const filePath = getCacheFilePath(year)
  if (!filePath) return
  const cache: OnlineCalendarCache = {
    year,
    fetchedAt: new Date().toISOString(),
    source,
    tradeDates,
  }
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const tmpPath = `${filePath}.${Date.now()}.tmp`
    await fs.writeFile(tmpPath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    logger.warn(`在线日历缓存写盘失败: ${(err as Error).message}`, { module: MODULE })
  }
}

/**
 * 对比在线数据与静态数据，输出差异报告。
 * 返回发现的差异数量。
 */
function diffOnlineVsStatic(year: number, onlineDates: Set<string>): number {
  let diffCount = 0

  // 遍历当年所有日期（1/1 ~ 12/31），找出静态数据与在线数据的不一致
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDateStr(d)
    const dayOfWeek = d.getDay()
    const isWknd = dayOfWeek === 0 || dayOfWeek === 6

    const onlineSaysTrading = onlineDates.has(dateStr)

    // 静态判断
    const inExtraDays = CHINA_MARKET_EXTRA_TRADING_DAYS.has(dateStr)
    const inHolidays = CHINA_MARKET_HOLIDAYS.has(dateStr)
    let staticSaysTrading: boolean
    if (inExtraDays) {
      staticSaysTrading = true
    } else if (isWknd) {
      staticSaysTrading = false
    } else {
      staticSaysTrading = !inHolidays
    }

    // 在线数据不含周末补班日，所以只对比工作日（周一至周五）
    if (isWknd) continue

    if (onlineSaysTrading !== staticSaysTrading) {
      diffCount++
      if (onlineSaysTrading && !staticSaysTrading) {
        logger.error(
          `[交易日历差异] ${dateStr} 在线数据为交易日，但静态数据标记为假日！这可能导致交易被错误阻止！`,
          { module: MODULE },
        )
      } else {
        logger.warn(
          `[交易日历差异] ${dateStr} 在线数据为非交易日，但静态数据标记为交易日（可能导致假日空跑）`,
          { module: MODULE },
        )
      }
    }
  }

  return diffCount
}

/**
 * 同步在线交易日历。
 * 拉取在线数据 → 保存到磁盘缓存 → 加载到内存 → 与静态数据交叉校验。
 *
 * @param year - 要同步的年份，默认当前年份
 * @returns 是否成功同步
 */
export async function syncOnlineTradingCalendar(year?: number): Promise<boolean> {
  const targetYear = year ?? new Date().getFullYear()
  logger.info(`开始同步 ${targetYear} 年在线交易日历...`, { module: MODULE })

  const tradeDates = await fetchOnlineTradeDates(targetYear)
  if (!tradeDates || tradeDates.length === 0) {
    logger.warn(`${targetYear} 年在线交易日历同步失败，将继续使用静态数据`, { module: MODULE })
    return false
  }

  // 保存到内存
  const dateSet = new Set(tradeDates)
  onlineTradeDatesCache.set(targetYear, dateSet)
  onlineCacheLoadedAt = Date.now()

  // 保存到磁盘
  await saveOnlineCacheToDisk(targetYear, tradeDates, 'akshare:tool_trade_date_hist_sina')

  // 交叉校验
  const diffCount = diffOnlineVsStatic(targetYear, dateSet)
  if (diffCount > 0) {
    logger.error(
      `[严重] ${targetYear} 年在线交易日历与静态数据存在 ${diffCount} 处差异！静态数据可能过期或有误，请尽快核查 trading-calendar.ts`,
      { module: MODULE },
    )
  } else {
    logger.info(`${targetYear} 年在线交易日历与静态数据一致（${tradeDates.length} 个交易日）`, { module: MODULE })
  }

  return true
}

// ─── 启动自检 ────────────────────────────────────────────────────────

/**
 * 服务启动时执行的交易日历自检。
 * 1. 检查当前年份静态数据是否存在
 * 2. 尝试加载磁盘上的在线缓存
 * 3. 如果缓存不存在或过期，触发在线同步
 * 4. 对当天日期进行逻辑一致性检查
 *
 * 此函数不会抛异常（所有错误降级处理），确保不影响服务启动。
 */
export async function validateAndSyncCalendarOnStartup(): Promise<void> {
  const now = new Date()
  const year = now.getFullYear()
  const todayStr = formatDateStr(now)
  const dayOfWeek = now.getDay()

  logger.info(`交易日历启动自检: 当前日期 ${todayStr}（星期${['日', '一', '二', '三', '四', '五', '六'][dayOfWeek]}）`, { module: MODULE })

  // 检查 1: 当前年份是否在静态数据范围内
  if (year < HOLIDAY_DATA_MIN_YEAR || year > HOLIDAY_DATA_MAX_YEAR) {
    logger.error(
      `[严重] 当前年份 ${year} 不在静态假日数据范围 ${HOLIDAY_DATA_MIN_YEAR}-${HOLIDAY_DATA_MAX_YEAR} 内！交易日判断可能完全不准确！`,
      { module: MODULE },
    )
  }

  // 检查 2: 当前年份的静态假日数据是否为空
  const yearPrefix = `${year}-`
  const staticHolidaysThisYear = [...CHINA_MARKET_HOLIDAYS].filter((d) => d.startsWith(yearPrefix))
  if (staticHolidaysThisYear.length === 0) {
    logger.error(
      `[严重] ${year} 年的静态假日数据为空！所有工作日都会被视为交易日，假日不会被正确识别！`,
      { module: MODULE },
    )
  } else {
    logger.info(`${year} 年静态假日数据: ${staticHolidaysThisYear.length} 天`, { module: MODULE })
  }

  // 检查 3: 尝试加载磁盘缓存
  const diskLoaded = await loadOnlineCacheFromDisk(year)

  // 检查 4: 如果磁盘缓存不存在或很旧，触发在线同步
  if (!diskLoaded) {
    logger.info(`${year} 年无在线日历磁盘缓存，触发在线同步...`, { module: MODULE })
    await syncOnlineTradingCalendar(year)
  } else {
    // 检查缓存文件的 fetchedAt 是否超过 7 天
    const cachePath = getCacheFilePath(year)
    if (cachePath) {
      try {
        const content = await fs.readFile(cachePath, 'utf8')
        const cache = JSON.parse(content) as OnlineCalendarCache
        const fetchedAt = new Date(cache.fetchedAt).getTime()
        const ageDays = (Date.now() - fetchedAt) / (24 * 60 * 60 * 1000)
        if (ageDays > 7) {
          logger.info(`在线日历缓存已过期（${Math.floor(ageDays)} 天前获取），触发刷新...`, { module: MODULE })
          await syncOnlineTradingCalendar(year)
        }
      } catch {
        // 读取失败不阻塞
      }
    }
  }

  // 检查 5: 对当天做逻辑一致性检查
  const todayIsTrading = isTradingDay(now)
  const isWknd = dayOfWeek === 0 || dayOfWeek === 6

  if (!isWknd && !todayIsTrading && !CHINA_MARKET_HOLIDAYS.has(todayStr)) {
    // 工作日 + 不是交易日 + 不在静态假日列表中 → 可能有问题
    logger.error(
      `[自检异常] 今天 ${todayStr} 是工作日，不在静态假日列表中，但 isTradingDay 返回 false！请检查交易日历数据！`,
      { module: MODULE },
    )
  }

  // 利用在线缓存做更精确的检查
  const onlineCache = onlineTradeDatesCache.get(year)
  if (onlineCache && !isWknd) {
    const onlineSaysTrading = onlineCache.has(todayStr)
    if (onlineSaysTrading !== todayIsTrading) {
      logger.error(
        `[自检差异] 今天 ${todayStr}: 在线数据=${onlineSaysTrading ? '交易日' : '非交易日'}, 本地判断=${todayIsTrading ? '交易日' : '非交易日'}！以在线数据为准应该是 ${onlineSaysTrading ? '交易日' : '非交易日'}`,
        { module: MODULE },
      )
    }
  }

  // [P2-3] 跨年预同步：12月份自动同步下一年日历，避免跨年后无在线数据
  const month = now.getMonth() // 0-indexed, 11=December
  if (month === 11) {
    const nextYear = year + 1
    const hasNextYear = onlineTradeDatesCache.has(nextYear) && onlineTradeDatesCache.get(nextYear)!.size > 0
    if (!hasNextYear) {
      logger.info(`当前为12月，预同步 ${nextYear} 年交易日历...`, { module: MODULE })
      try {
        await syncOnlineTradingCalendar(nextYear)
      } catch (err) {
        logger.warn(`${nextYear} 年日历预同步失败（不影响当前运行）: ${(err as Error).message}`, { module: MODULE })
      }
    }
  }

  logger.info(`交易日历自检完成: 今天 ${todayStr} ${todayIsTrading ? '是' : '不是'}交易日`, { module: MODULE })
}

// ─── isTradingDay（核心判断函数）────────────────────────────────────

/**
 * 判断给定日期是否为 A 股交易日。
 * 判断优先级：
 * 1. 调休补班日（EXTRA_TRADING_DAYS）→ true
 * 2. 在线缓存命中且为工作日 → 以在线数据为准
 * 3. 降级到静态数据（HOLIDAYS + 周末判断）
 *
 * [H3] 补班日优先级高于周末判断：如果日期在 EXTRA_TRADING_DAYS 中则返回 true。
 * [M9] 当日期年份超出假日数据覆盖范围时记录警告日志。
 */
export function isTradingDay(date?: Date): boolean {
  const target = date ?? new Date()
  const dateStr = formatDateStr(target)
  const year = target.getFullYear()

  // [H3] 调休补班日优先：即使是周末，只要在补班日集合中也视为交易日
  if (CHINA_MARKET_EXTRA_TRADING_DAYS.has(dateStr)) {
    return true
  }

  const day = target.getDay()
  if (day === 0 || day === 6) return false

  // 优先查在线缓存（仅对工作日有效，在线数据不含周末补班日）
  const onlineCache = onlineTradeDatesCache.get(year)
  if (onlineCache && onlineCache.size > 0) {
    return onlineCache.has(dateStr)
  }

  // [M9] 降级到静态数据时检查覆盖范围
  if ((year < HOLIDAY_DATA_MIN_YEAR || year > HOLIDAY_DATA_MAX_YEAR) && !yearOutOfRangeWarned) {
    yearOutOfRangeWarned = true
    logger.warn(
      `交易日历假日数据仅覆盖 ${HOLIDAY_DATA_MIN_YEAR}-${HOLIDAY_DATA_MAX_YEAR} 年，当前年份 ${year} 不在范围内且无在线缓存。请更新 trading-calendar.ts 或确保在线同步正常`,
      { module: MODULE },
    )
  }

  return !CHINA_MARKET_HOLIDAYS.has(dateStr)
}

/** 在线缓存是否已过期（用于 scheduler 判断是否需要刷新） */
export function isOnlineCacheExpired(): boolean {
  return Date.now() - onlineCacheLoadedAt > ONLINE_CACHE_TTL_MS
}

/** 获取在线缓存状态信息（供诊断/API 使用） */
export function getCalendarSyncStatus(): {
  hasOnlineCache: boolean
  onlineCacheYears: number[]
  cacheLoadedAt: string | null
  cacheExpired: boolean
} {
  return {
    hasOnlineCache: onlineTradeDatesCache.size > 0,
    onlineCacheYears: [...onlineTradeDatesCache.keys()],
    cacheLoadedAt: onlineCacheLoadedAt > 0 ? new Date(onlineCacheLoadedAt).toISOString() : null,
    cacheExpired: isOnlineCacheExpired(),
  }
}

/**
 * 判断当前时间是否在 A 股连续竞价交易时段内。
 * 上午 09:30 - 11:30，下午 13:00 - 14:59（15:00 为收盘集合竞价结束时刻）。
 * [L11] 15:00 整点不再算交易时段（已收盘）。
 */
export function isWithinTradingHours(date?: Date): boolean {
  const now = date ?? new Date()
  // 强制使用中国时区获取时分
  const parts = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false }).split(':')
  const hhmm = Number(parts[0]) * 100 + Number(parts[1])
  return (hhmm >= 930 && hhmm <= 1130) || (hhmm >= 1300 && hhmm < 1500)
}

/**
 * [L12] 判断当前时间是否在集合竞价时段。
 * 开盘集合竞价：09:15 - 09:25
 * 收盘集合竞价：14:57 - 15:00
 */
export function isWithinAuctionHours(date?: Date): boolean {
  const now = date ?? new Date()
  const parts = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false }).split(':')
  const hhmm = Number(parts[0]) * 100 + Number(parts[1])
  return (hhmm >= 915 && hhmm < 925) || (hhmm >= 1457 && hhmm <= 1500)
}

/**
 * 综合判断：当前是否可以执行交易操作（交易日 + 交易时段）。
 * 返回结构化结果，包含不可交易的原因，供前端展示。
 */
export function checkTradingAvailability(date?: Date): { canTrade: boolean; reason: string | null } {
  const now = date ?? new Date()
  if (!isTradingDay(now)) {
    const day = now.getDay()
    if (day === 0 || day === 6) {
      return { canTrade: false, reason: '当前为周末，A 股休市' }
    }
    return { canTrade: false, reason: '当前为法定节假日，A 股休市' }
  }
  // 补班日也需要检查交易时段（isTradingDay 已处理补班日为交易日）
  if (!isWithinTradingHours(now)) {
    const hhmm = now.getHours() * 100 + now.getMinutes()
    if (hhmm < 930) {
      return { canTrade: false, reason: '尚未开盘（09:30 开盘）' }
    }
    if (hhmm > 1130 && hhmm < 1300) {
      return { canTrade: false, reason: '午间休市（13:00 恢复交易）' }
    }
    return { canTrade: false, reason: '已收盘（15:00 收盘）' }
  }
  return { canTrade: true, reason: null }
}

/**
 * 获取近 N 个交易日期字符串（跳过周末 + 中国法定节假日，支持调休补班日）。
 * 从 tradeDate 当日开始往前回溯。
 * [L10] 使用 while 循环替代固定上限，确保长假期也能正确回溯。
 */
export function getRecentTradeDates(tradeDate: string, count: number): string[] {
  const dates: string[] = []
  const current = new Date(tradeDate)
  const MAX_ITERATIONS = Math.max(count * 5, 30) // 安全上限，至少 30 次（覆盖国庆等长假）

  let iterations = 0
  while (dates.length < count && iterations < MAX_ITERATIONS) {
    iterations++
    const dateStr = formatDateStr(current)
    if (isTradingDay(current)) {
      dates.push(dateStr)
    }
    current.setDate(current.getDate() - 1)
  }

  return dates
}
