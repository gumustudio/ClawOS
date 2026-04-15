/**
 * 自选股票 Tab — 自管理型组件，自己 fetch 数据。
 * 布局：左侧自选列表（搜索+股票表格） | 右侧详情（OHLC 信息 + K 线蜡烛图）
 * 一屏展示，K 线图占比大。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

import {
  addWatchlistStock,
  fetchWatchlist,
  removeWatchlistStock,
  searchStocks,
  updateWatchlistStockNote,
} from '../api'
import { getAutoRefreshIntervalMs, getMsUntilNextMarketBoundary } from '../autoRefresh'
import type {
  KlinePoint,
  StockSearchResult,
  UserWatchlistItem,
  WatchlistQuoteSnapshot,
  WatchlistResponse,
} from '../types'
import { formatPercent, formatPrice, percentTone } from '../utils'

/* ─── 日志 ───────────────────────────────────────────────────── */

const LOG_PREFIX = '[WatchlistTab]'

function logDebug(msg: string, ...args: unknown[]) {
  console.debug(`${LOG_PREFIX} ${msg}`, ...args)
}

function logError(msg: string, ...args: unknown[]) {
  console.error(`${LOG_PREFIX} ${msg}`, ...args)
}

/* ─── 工具函数 ─────────────────────────────────────────────── */

function formatVolume(vol: number): string {
  if (vol >= 1e8) return `${(vol / 1e8).toFixed(2)}亿`
  if (vol >= 1e4) return `${(vol / 1e4).toFixed(0)}万`
  return `${vol}`
}

function formatMarketCap(cap: number): string {
  if (cap >= 1e8) return `${(cap / 1e8).toFixed(1)}亿`
  if (cap >= 1e4) return `${(cap / 1e4).toFixed(0)}万`
  return `${cap}`
}

/* ─── K 线蜡烛图 SVG ────────────────────────────────────────── */

const KLINE_PADDING = { top: 16, right: 12, bottom: 32, left: 56 }
const VOLUME_HEIGHT_RATIO = 0.2 // 成交量区域占总高度的 20%

interface CandlestickChartProps {
  data: KlinePoint[]
  width?: number
  height?: number
}

function CandlestickChart({ data, width = 720, height = 420 }: CandlestickChartProps) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400 h-full">
        K 线数据不足
      </div>
    )
  }

  const chartWidth = width - KLINE_PADDING.left - KLINE_PADDING.right
  const totalChartHeight = height - KLINE_PADDING.top - KLINE_PADDING.bottom
  const priceHeight = totalChartHeight * (1 - VOLUME_HEIGHT_RATIO) - 8 // 8px gap
  const volumeTop = KLINE_PADDING.top + priceHeight + 8
  const volumeHeight = totalChartHeight * VOLUME_HEIGHT_RATIO

  // 价格范围
  const allHighs = data.map((d) => d.high)
  const allLows = data.map((d) => d.low)
  let priceMin = Math.min(...allLows)
  let priceMax = Math.max(...allHighs)
  if (priceMax === priceMin) { priceMin -= 1; priceMax += 1 }
  const priceRange = priceMax - priceMin
  priceMin -= priceRange * 0.05
  priceMax += priceRange * 0.05

  // 成交量范围
  const volumes = data.map((d) => d.volume)
  const maxVolume = Math.max(...volumes, 1)

  // 缩放函数
  const candleWidth = Math.max(3, chartWidth / data.length * 0.7)
  const gap = chartWidth / data.length
  const xCenter = (i: number) => i * gap + gap / 2
  const yPrice = (v: number) => priceHeight - ((v - priceMin) / (priceMax - priceMin)) * priceHeight

  // 价格网格线
  const priceGridCount = 4
  const priceStep = (priceMax - priceMin) / (priceGridCount + 1)
  const priceGridLines: number[] = []
  for (let i = 1; i <= priceGridCount; i++) {
    priceGridLines.push(priceMin + priceStep * i)
  }

  // X 轴标签（均匀 5-6 个）
  const maxLabels = Math.min(6, data.length)
  const labelIndices: number[] = []
  for (let i = 0; i < maxLabels; i++) {
    labelIndices.push(Math.round((i / (maxLabels - 1)) * (data.length - 1)))
  }

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* 价格区域 */}
      <g transform={`translate(${KLINE_PADDING.left}, ${KLINE_PADDING.top})`}>
        {/* 网格线 */}
        {priceGridLines.map((val) => (
          <g key={`pg-${val}`}>
            <line x1={0} y1={yPrice(val)} x2={chartWidth} y2={yPrice(val)} stroke="#e2e8f0" strokeDasharray="3,3" />
            <text x={-8} y={yPrice(val)} textAnchor="end" dominantBaseline="middle" className="text-[10px]" fill="#94a3b8">
              {val.toFixed(2)}
            </text>
          </g>
        ))}

        {/* 蜡烛 */}
        {data.map((d, i) => {
          const cx = xCenter(i)
          const isUp = d.close >= d.open
          const color = isUp ? '#dc2626' : '#16a34a' // 红涨绿跌
          const bodyTop = yPrice(Math.max(d.open, d.close))
          const bodyBottom = yPrice(Math.min(d.open, d.close))
          const bodyH = Math.max(1, bodyBottom - bodyTop)

          return (
            <g key={`candle-${i}`}>
              {/* 影线 */}
              <line x1={cx} y1={yPrice(d.high)} x2={cx} y2={yPrice(d.low)} stroke={color} strokeWidth={1} />
              {/* 实体 */}
              <rect
                x={cx - candleWidth / 2}
                y={bodyTop}
                width={candleWidth}
                height={bodyH}
                fill={isUp ? color : color}
                stroke={color}
                strokeWidth={0.5}
                opacity={isUp ? 0.3 : 1}
              />
              <title>{`${d.date}\n开:${d.open.toFixed(2)} 高:${d.high.toFixed(2)}\n低:${d.low.toFixed(2)} 收:${d.close.toFixed(2)}\n涨跌:${formatPercent(d.changePercent)}\n成交量:${formatVolume(d.volume)}`}</title>
            </g>
          )
        })}
      </g>

      {/* 成交量区域 */}
      <g transform={`translate(${KLINE_PADDING.left}, ${volumeTop})`}>
        <line x1={0} y1={0} x2={chartWidth} y2={0} stroke="#e2e8f0" strokeDasharray="3,3" />
        {data.map((d, i) => {
          const cx = xCenter(i)
          const isUp = d.close >= d.open
          const color = isUp ? '#dc2626' : '#16a34a'
          const barH = Math.max(1, (d.volume / maxVolume) * volumeHeight)
          return (
            <rect
              key={`vol-${i}`}
              x={cx - candleWidth / 2}
              y={volumeHeight - barH}
              width={candleWidth}
              height={barH}
              fill={color}
              opacity={0.35}
            />
          )
        })}
        {/* 成交量标注 */}
        <text x={-8} y={4} textAnchor="end" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">
          {formatVolume(maxVolume)}
        </text>
        <text x={-8} y={volumeHeight} textAnchor="end" dominantBaseline="middle" className="text-[9px]" fill="#94a3b8">
          0
        </text>
      </g>

      {/* X 轴日期标签 */}
      <g transform={`translate(${KLINE_PADDING.left}, ${height - 4})`}>
        {labelIndices.map((i) => (
          <text key={`xl-${i}`} x={xCenter(i)} y={0} textAnchor="middle" className="text-[9px]" fill="#94a3b8">
            {data[i].date.slice(5)}
          </text>
        ))}
      </g>
    </svg>
  )
}

/* ─── 搜索下拉 ──────────────────────────────────────────────── */

function SearchBar({ onAdd }: { onAdd: (stock: StockSearchResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    try {
      const res = await searchStocks(q)
      setResults(res)
      setOpen(res.length > 0)
    } catch (err) {
      logError('搜索失败', err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void doSearch(value.trim()), 300)
  }

  const handleSelect = (stock: StockSearchResult) => {
    onAdd(stock)
    setQuery('')
    setResults([])
    setOpen(false)
  }

  // 点击外部关闭下拉
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2">
        <MagnifyingGlassIcon className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="搜索股票代码或名称..."
          className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
        />
        {loading && <div className="w-4 h-4 border-2 border-indigo-300 border-t-transparent rounded-full animate-spin" />}
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setOpen(false) }} className="text-slate-400 hover:text-slate-600">
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {results.map((stock) => (
            <button
              key={stock.code}
              onClick={() => handleSelect(stock)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-indigo-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{stock.code}</span>
                <span className="font-medium text-slate-700">{stock.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {stock.industryName && <span className="text-xs text-slate-400">{stock.industryName}</span>}
                <PlusIcon className="w-4 h-4 text-indigo-500" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── 详情面板 ──────────────────────────────────────────────── */

interface DetailPanelProps {
  item: UserWatchlistItem
  quote: WatchlistQuoteSnapshot | null
  note: string
  onNoteChange: (note: string) => void
}

function DetailPanel({ item, quote, note, onNoteChange }: DetailPanelProps) {
  const [editingNote, setEditingNote] = useState(false)
  const [localNote, setLocalNote] = useState(note)

  useEffect(() => { setLocalNote(note); setEditingNote(false) }, [note])

  const saveNote = () => {
    onNoteChange(localNote)
    setEditingNote(false)
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-400">
        行情数据加载中...
      </div>
    )
  }

  const changeAmount = quote.latestPrice - quote.previousClose
  const tone = percentTone(quote.changePercent)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 股票标题行 */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <div className="flex items-baseline gap-2">
            <h3 className="text-lg font-bold text-slate-800">{quote.name}</h3>
            <span className="text-xs font-mono text-slate-500">{item.code}</span>
          </div>
          {item.industryName && <span className="text-xs text-slate-400">{item.industryName}</span>}
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${tone}`}>{formatPrice(quote.latestPrice)}</div>
          <div className={`text-sm ${tone}`}>
            {changeAmount >= 0 ? '+' : ''}{changeAmount.toFixed(2)} ({formatPercent(quote.changePercent)})
          </div>
        </div>
      </div>

      {/* OHLC 指标网格 */}
      <div className="grid grid-cols-4 gap-2 mb-3 shrink-0">
        <MiniMetric label="开盘" value={formatPrice(quote.open)} tone={percentTone(quote.open - quote.previousClose)} />
        <MiniMetric label="最高" value={formatPrice(quote.high)} tone="text-red-600" />
        <MiniMetric label="最低" value={formatPrice(quote.low)} tone="text-green-600" />
        <MiniMetric label="昨收" value={formatPrice(quote.previousClose)} />
        <MiniMetric label="成交量" value={formatVolume(quote.volume)} />
        <MiniMetric label="换手率" value={`${quote.turnoverRate.toFixed(2)}%`} />
        <MiniMetric label="总市值" value={formatMarketCap(quote.totalMarketCap)} />
        <MiniMetric label="流通市值" value={formatMarketCap(quote.circulatingMarketCap)} />
      </div>

      {/* 备注 */}
      <div className="mb-3 shrink-0">
        {editingNote ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={localNote}
              onChange={(e) => setLocalNote(e.target.value)}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-300"
              placeholder="添加备注..."
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); if (e.key === 'Escape') setEditingNote(false) }}
            />
            <button onClick={saveNote} className="text-xs text-indigo-600 font-medium hover:underline">保存</button>
            <button onClick={() => setEditingNote(false)} className="text-xs text-slate-400 hover:text-slate-600">取消</button>
          </div>
        ) : (
          <button onClick={() => setEditingNote(true)} className="text-xs text-slate-500 hover:text-indigo-600 transition-colors">
            {note ? `备注: ${note}` : '+ 添加备注'}
          </button>
        )}
      </div>

      {/* K 线图（占剩余空间） */}
      <div className="flex-1 min-h-0 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        <h4 className="font-semibold text-slate-700 text-sm mb-1">日 K 线</h4>
        <div className="h-[calc(100%-24px)]">
          <CandlestickChart data={quote.klineHistory} />
        </div>
      </div>
    </div>
  )
}

function MiniMetric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-white/60 border border-slate-100 px-2 py-1.5">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-xs font-semibold ${tone || 'text-slate-700'}`}>{value}</div>
    </div>
  )
}

/* ─── 主组件 ────────────────────────────────────────────────── */

export function WatchlistTab() {
  const [items, setItems] = useState<UserWatchlistItem[]>([])
  const [quotes, setQuotes] = useState<Record<string, WatchlistQuoteSnapshot>>({})
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* 加载数据 */
  const loadData = useCallback(async () => {
    try {
      logDebug('加载自选列表...')
      const resp: WatchlistResponse = await fetchWatchlist()
      setItems(resp.items)
      setQuotes(resp.quotes)
      setError(null)
      // 如果当前选中的股票不在列表中了，重置选中
      if (resp.items.length > 0) {
        setSelectedCode((prev) => {
          if (prev && resp.items.some((it) => it.code === prev)) return prev
          return resp.items[0].code
        })
      } else {
        setSelectedCode(null)
      }
      logDebug(`加载完成, ${resp.items.length} 只自选`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '加载失败'
      logError('加载自选失败', err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  /* 自动刷新 */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    // 交易时间判断：简单用 autoRefresh 的间隔（盘中 30s，非盘中 60s）
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const isTradingTime =
      (hour === 9 && minute >= 30) ||
      (hour === 10) ||
      (hour === 11 && minute < 30) ||
      (hour === 13) ||
      (hour === 14) ||
      (hour === 15 && minute === 0)
    const interval = getAutoRefreshIntervalMs(isTradingTime)
    const boundary = getMsUntilNextMarketBoundary(now)
    const delay = Math.min(interval, boundary)

    refreshTimerRef.current = setTimeout(() => {
      void loadData().then(() => scheduleRefresh())
    }, delay)
  }, [loadData])

  useEffect(() => {
    void loadData().then(() => scheduleRefresh())
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current) }
  }, [loadData, scheduleRefresh])

  /* 添加自选 */
  const handleAdd = useCallback(async (stock: StockSearchResult) => {
    try {
      logDebug('添加自选:', stock.code, stock.name)
      const updated = await addWatchlistStock(stock)
      setItems(updated)
      setSelectedCode(stock.code)
      // 重新加载完整数据（含新股票的行情）
      void loadData()
    } catch (err) {
      logError('添加自选失败', err)
    }
  }, [loadData])

  /* 移除自选 */
  const handleRemove = useCallback(async (code: string) => {
    try {
      logDebug('移除自选:', code)
      const updated = await removeWatchlistStock(code)
      setItems(updated)
      if (selectedCode === code) {
        setSelectedCode(updated.length > 0 ? updated[0].code : null)
      }
    } catch (err) {
      logError('移除自选失败', err)
    }
  }, [selectedCode])

  /* 更新备注 */
  const handleNoteChange = useCallback(async (code: string, note: string) => {
    try {
      logDebug('更新备注:', code, note)
      const updated = await updateWatchlistStockNote(code, note)
      setItems(updated)
    } catch (err) {
      logError('更新备注失败', err)
    }
  }, [])

  const selectedItem = items.find((it) => it.code === selectedCode) ?? null
  const selectedQuote = selectedCode ? (quotes[selectedCode] ?? null) : null

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-500">
        正在加载自选列表...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm max-w-md">
          <div className="text-red-600 font-bold mb-2">加载自选失败</div>
          <p className="text-sm text-slate-600">{error}</p>
          <button onClick={() => { setLoading(true); void loadData() }} className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-xl font-bold text-slate-800">自选股票</h2>
        <span className="text-xs text-slate-400">{items.length}/50</span>
      </div>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* 左栏：搜索 + 股票列表 */}
        <div className="w-[380px] shrink-0 flex flex-col min-h-0">
          <div className="mb-3 shrink-0">
            <SearchBar onAdd={(stock) => void handleAdd(stock)} />
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <StarIcon className="w-12 h-12 mb-3 text-slate-300" />
              <p className="text-sm">暂无自选股票</p>
              <p className="text-xs mt-1">使用上方搜索框添加</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200/60 bg-white/70">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50/90 backdrop-blur-sm">
                  <tr className="text-slate-500 border-b border-slate-100">
                    <th className="text-left px-3 py-2 font-medium">名称</th>
                    <th className="text-right px-2 py-2 font-medium">现价</th>
                    <th className="text-right px-2 py-2 font-medium">涨跌幅</th>
                    <th className="text-right px-2 py-2 font-medium">成交量</th>
                    <th className="text-center px-2 py-2 font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const q = quotes[item.code]
                    const isSelected = selectedCode === item.code
                    return (
                      <tr
                        key={item.code}
                        onClick={() => setSelectedCode(item.code)}
                        className={`cursor-pointer border-b border-slate-50 transition-colors ${isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/70'}`}
                      >
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-700">{item.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{item.code}</div>
                        </td>
                        <td className={`text-right px-2 py-2 font-mono font-semibold ${q ? percentTone(q.changePercent) : 'text-slate-700'}`}>
                          {q ? formatPrice(q.latestPrice) : '--'}
                        </td>
                        <td className={`text-right px-2 py-2 font-mono font-semibold ${q ? percentTone(q.changePercent) : 'text-slate-700'}`}>
                          {q ? formatPercent(q.changePercent) : '--'}
                        </td>
                        <td className="text-right px-2 py-2 text-slate-500">
                          {q ? formatVolume(q.volume) : '--'}
                        </td>
                        <td className="text-center px-2 py-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); void handleRemove(item.code) }}
                            className="text-slate-300 hover:text-red-500 transition-colors"
                            title="移除自选"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 右栏：详情 + K 线图 */}
        <div className="flex-1 min-h-0 min-w-0 rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm p-5">
          {selectedItem ? (
            <DetailPanel
              item={selectedItem}
              quote={selectedQuote}
              note={selectedItem.note}
              onNoteChange={(newNote) => void handleNoteChange(selectedItem.code, newNote)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-400">
              {items.length > 0 ? '选择左侧股票查看详情' : '添加自选股票开始使用'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
