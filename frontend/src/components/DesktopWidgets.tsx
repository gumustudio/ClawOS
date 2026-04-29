import { useEffect, useState } from 'react'
import {
  ArrowDownTrayIcon,
  MusicalNoteIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  FolderOpenIcon,
  CloudIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  EllipsisHorizontalIcon,
} from '@heroicons/react/24/solid'
import { withBasePath } from '../lib/basePath'
import { getMusicDisplayState, sendMusicCommandToActive, subscribeMusicDisplayState } from '../lib/musicBridge'
import { getTaskDisplayName, getTaskStatusLabel, getWidgetTaskSummary, getWidgetTasks, getWidgetTaskTone, type DownloadWidgetTask } from '../apps/downloadTaskMeta'
import { didaApi } from '../apps/DidaApp/api'
import { getNaturalTimeFragments, parseNaturalTaskInput } from '../apps/DidaApp/naturalInput'
import type { Project, Task } from '../apps/DidaApp/types'
import { buildDidaInboxWidgetModel } from '../apps/didaWidgetMeta'
import { DidaIcon } from './Icons'

interface DownloadCounts {
  active: number
  waiting: number
  paused: number
  error: number
  completed: number
}

interface DownloadWidgetResponse {
  available: boolean
  message?: string
  tasks: DownloadWidgetTask[]
  counts: DownloadCounts
}

interface WeatherWidgetState {
  temperature: number
  humidity: number
  windSpeed: number
  label: string
  updatedAt: Date
}

const XIAOSHAN_WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=30.167&longitude=120.263&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FShanghai'

function getWeatherLabel(code: number): string {
  if (code === 0) return '晴'
  if ([1, 2, 3].includes(code)) return '多云'
  if ([45, 48].includes(code)) return '有雾'
  if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '降雨'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '降雪'
  if ([95, 96, 99].includes(code)) return '雷阵雨'
  return '天气更新'
}

function createEmptyDownloadCounts(): DownloadCounts {
  return {
    active: 0,
    waiting: 0,
    paused: 0,
    error: 0,
    completed: 0,
  }
}

function formatWidgetNaturalDue(parsed: ReturnType<typeof parseNaturalTaskInput>): string | null {
  if (!parsed.dueDate) {
    return null
  }

  const dueDate = new Date(parsed.dueDate)
  const dateLabel = dueDate.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  if (parsed.isAllDay) {
    return `${dateLabel} 全天`
  }

  const timeLabel = dueDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return `${dateLabel} ${timeLabel}`
}

interface DesktopWidgetsProps {
  onOpenDownloads?: () => void
  onOpenDida?: () => void
  authReady?: boolean
}

export default function DesktopWidgets({ onOpenDownloads, onOpenDida, authReady = false }: DesktopWidgetsProps) {
  const [hwStats, setHwStats] = useState<any>(null)
  const [netStats, setNetStats] = useState<any>(null)
  const [downloads, setDownloads] = useState<DownloadWidgetTask[]>([])
  const [downloadCounts, setDownloadCounts] = useState<DownloadCounts>(createEmptyDownloadCounts())
  const [downloadAvailable, setDownloadAvailable] = useState(true)
  const [time, setTime] = useState(new Date())
  const [weather, setWeather] = useState<WeatherWidgetState | null>(null)
  const [weatherError, setWeatherError] = useState(false)
  const [musicState, setMusicState] = useState<{ appId: string; playing: boolean; title: string; artist: string; cover: string; lyric: string } | null>(null)
  const [didaAuthorized, setDidaAuthorized] = useState(false)
  const [didaError, setDidaError] = useState<string | null>(null)
  const [didaTasks, setDidaTasks] = useState<Task[]>([])
  const [didaProjects, setDidaProjects] = useState<Project[]>([])
  const [didaDraft, setDidaDraft] = useState('')
  const [didaSubmitting, setDidaSubmitting] = useState(false)
  const [didaTogglingIds, setDidaTogglingIds] = useState<string[]>([])

  useEffect(() => {
    if (!authReady) {
      return
    }

    const fetchHwNet = async () => {
      try {
        const [hwRes, netRes] = await Promise.all([
          fetch(withBasePath('/api/system/hardware')),
          fetch(withBasePath('/api/system/network')),
        ])
        const hwJson = await hwRes.json()
        const netJson = await netRes.json()
        if (hwJson.success) setHwStats(hwJson.data)
        if (netJson.success) setNetStats(netJson.data)
      } catch {}
    }

    const fetchDownloads = async () => {
      try {
        const res = await fetch(withBasePath('/api/system/downloads/tasks'))
        const json = (await res.json()) as { success?: boolean; data?: DownloadWidgetResponse }
        if (!json.success || !json.data) {
          return
        }
        setDownloadAvailable(json.data.available)
        setDownloadCounts(json.data.counts)
        setDownloads(getWidgetTasks(json.data.tasks, 2))
      } catch {
        setDownloadAvailable(false)
        setDownloadCounts(createEmptyDownloadCounts())
        setDownloads([])
      }
    }

    const fetchWeather = async () => {
      try {
        const res = await fetch(XIAOSHAN_WEATHER_URL)
        if (!res.ok) {
          throw new Error(`weather request failed: ${res.status}`)
        }
        const json = await res.json() as {
          current?: {
            temperature_2m?: number
            relative_humidity_2m?: number
            weather_code?: number
            wind_speed_10m?: number
          }
        }
        const current = json.current
        if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
          throw new Error('weather response missing current data')
        }
        setWeather({
          temperature: current.temperature_2m,
          humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 0,
          windSpeed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0,
          label: getWeatherLabel(current.weather_code),
          updatedAt: new Date(),
        })
        setWeatherError(false)
      } catch {
        setWeatherError(true)
      }
    }

    const fetchDida = async () => {
      try {
        const status = await didaApi.getStatus()
        if (!status.success || !status.connected) {
          setDidaAuthorized(false)
          setDidaError(status.error || '滴答未授权')
          setDidaProjects([])
          setDidaTasks([])
          return
        }

        const payload = await didaApi.loadAll()
        setDidaAuthorized(true)
        setDidaError(null)
        setDidaProjects(payload.projects)
        setDidaTasks(payload.tasks)
      } catch {
        setDidaAuthorized(false)
        setDidaError('滴答同步失败')
        setDidaProjects([])
        setDidaTasks([])
      }
    }

    void fetchHwNet()
    void fetchDownloads()
    void fetchWeather()
    void fetchDida()

    const statInterval = setInterval(() => {
      void fetchHwNet()
      void fetchDownloads()
      setTime(new Date())
    }, 2000)

    const didaInterval = setInterval(() => {
      void fetchDida()
    }, 60000)

    const weatherInterval = setInterval(() => {
      void fetchWeather()
    }, 30 * 60 * 1000)

    return () => {
      clearInterval(statInterval)
      clearInterval(didaInterval)
      clearInterval(weatherInterval)
    }
  }, [authReady])

  useEffect(() => {
    setMusicState(getMusicDisplayState())
    return subscribeMusicDisplayState(() => {
      setMusicState(getMusicDisplayState())
    })
  }, [])

  const handleMusicCmd = (cmd: string) => {
    if (!musicState) return
    sendMusicCommandToActive(cmd as 'toggle' | 'pause' | 'next' | 'prev')
  }

  const handleCreateDidaTask = async () => {
    const rawTitle = didaDraft.trim()
    if (!rawTitle || didaSubmitting || !didaAuthorized) {
      return
    }

    const inboxProjectId = didaProjects.find((project) => project.isSystem)?.id ?? 'inbox'
    const parsed = parseNaturalTaskInput(rawTitle)
    if (!parsed.title.trim()) {
      setDidaError('请输入任务内容')
      return
    }

    setDidaSubmitting(true)
    try {
      const created = await didaApi.createTask({
        title: parsed.title,
        projectId: inboxProjectId,
        isAllDay: parsed.isAllDay,
        dueDate: parsed.dueDate,
        reminder: parsed.reminder,
      })
      setDidaTasks((previous) => [created, ...previous])
      setDidaDraft('')
      setDidaError(null)
    } catch {
      setDidaError('创建待办失败')
    } finally {
      setDidaSubmitting(false)
    }
  }

  const handleToggleDidaTask = async (taskId: string) => {
    const task = didaTasks.find((item) => item.id === taskId)
    if (!task || didaTogglingIds.includes(taskId)) {
      return
    }

    setDidaTogglingIds((previous) => [...previous, taskId])
    setDidaTasks((previous) => previous.map((item) => (item.id === taskId ? { ...item, status: 2 } : item)))
    try {
      await didaApi.completeTask(task.projectId, task.id)
      setDidaError(null)
    } catch {
      setDidaTasks((previous) => previous.map((item) => (item.id === taskId ? task : item)))
      setDidaError('更新任务失败')
    } finally {
      setDidaTogglingIds((previous) => previous.filter((id) => id !== taskId))
    }
  }

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const index = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, index)).toFixed(1))} ${sizes[index]}`
  }

  const formatSpeed = (bytes: number) => `${formatBytes(bytes)}/s`
  const didaModel = buildDidaInboxWidgetModel(didaTasks, didaProjects, time, 6)
  const didaDraftParsed = parseNaturalTaskInput(didaDraft, time)
  const naturalFragments = getNaturalTimeFragments(didaDraft)
  const naturalDuePreview = formatWidgetNaturalDue(didaDraftParsed)

  return (
    <div className="absolute right-8 top-16 w-[600px] z-10">
      <div className="grid grid-cols-2 auto-rows-[160px] gap-4 h-full pb-8">
        <div className="row-span-2 bg-white/40 backdrop-blur-xl border border-white/40 shadow-lg rounded-2xl px-4 pt-3 pb-3 text-slate-800 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <DidaIcon className="w-5 h-5 flex-shrink-0" />
                <span className="text-[14px] font-semibold tracking-tight">{didaModel.inboxName}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">{didaAuthorized ? `待办 ${didaModel.pendingCount} 项` : '未授权'}</p>
            </div>
            <button
              type="button"
              onClick={onOpenDida}
                className="w-7 h-7 rounded-full bg-white/30 hover:bg-white/50 transition-colors flex items-center justify-center text-slate-500"
            >
              <EllipsisHorizontalIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {didaAuthorized ? (
            <>
              <div className="rounded-xl bg-white/30 px-2.5 py-2 border border-white/25 mb-3">
                <div className="flex items-center gap-2">
                <PlusIcon className="w-3.5 h-3.5 text-[#4a76f6] flex-shrink-0" />
                <input
                  value={didaDraft}
                  onChange={(event) => setDidaDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void handleCreateDidaTask()
                    }
                  }}
                  placeholder="添加任务，如 明天18:30开会"
                  className="flex-1 bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateDidaTask()}
                  disabled={!didaDraft.trim() || didaSubmitting}
                  className="text-[11px] font-medium text-[#4a76f6] disabled:text-slate-300 transition-colors"
                >
                  添加
                </button>
                </div>
                {naturalFragments.length > 0 || naturalDuePreview ? (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] min-h-4">
                    <div className="flex items-center gap-1 flex-wrap min-w-0">
                      {naturalFragments.map((fragment) => (
                        <span key={fragment} className="px-1.5 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200/80 leading-none">
                          {fragment}
                        </span>
                      ))}
                    </div>
                    {naturalDuePreview ? (
                      <span className="text-[#4a76f6] font-medium flex-shrink-0">
                        {naturalDuePreview}{didaDraftParsed.reminder ? ' 提醒' : ''}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 mb-1.5">
                <span>收集箱</span>
                <span>已完成 {didaModel.completedTodayCount}</span>
              </div>

              {didaModel.tasks.length > 0 ? (
                <div className="flex-1 overflow-hidden">
                  <div className="space-y-0.5">
                    {didaModel.tasks.map((task) => {
                      const isToggling = didaTogglingIds.includes(task.id)
                      return (
                        <div key={task.id} className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-white/25 transition-colors group">
                          <button
                            type="button"
                            onClick={() => void handleToggleDidaTask(task.id)}
                            disabled={isToggling}
                            className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${task.isOverdue ? 'border-rose-300 hover:border-rose-400' : 'border-slate-300 hover:border-[#4a76f6]'} disabled:opacity-50`}
                          >
                            {isToggling ? <div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> : null}
                          </button>
                          <button type="button" onClick={onOpenDida} className="flex-1 min-w-0 text-left">
                            <p className="truncate text-[13px] leading-5 text-slate-700 group-hover:text-slate-900">{task.title}</p>
                          </button>
                          {task.dueLabel ? (
                            <span className={`text-[10px] flex-shrink-0 ${task.isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>{task.dueLabel}</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl bg-white/20 text-slate-400 px-6 border border-white/10 border-dashed">
                  <CheckIcon className="w-7 h-7 mb-2 text-[#4a76f6]" />
                  <p className="text-[13px] font-medium text-slate-600 mb-0.5">收集箱清空了</p>
                  <p className="text-[11px]">先加一条待办</p>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={onOpenDida}
              className="flex-1 rounded-xl bg-white/20 border border-dashed border-white/20 flex flex-col items-center justify-center text-center px-6"
            >
              <ExclamationTriangleIcon className="w-7 h-7 text-amber-400 mb-2.5" />
              <p className="text-[13px] font-medium text-slate-700 mb-1">滴答未连接</p>
              <p className="text-[11px] text-slate-500 leading-5">连接后可在桌面直接添加待办并勾选完成。</p>
              <span className="mt-3 text-[11px] font-medium text-[#4a76f6]">打开滴答继续授权</span>
            </button>
          )}

          {didaError && didaAuthorized ? <div className="mt-2 text-[10px] text-rose-500 px-1">{didaError}</div> : null}
        </div>

        <div className="h-full bg-white/40 backdrop-blur-xl border border-white/40 shadow-lg rounded-2xl p-5 text-slate-800 flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 text-white/20">
            <CloudIcon className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex flex-col h-full justify-center">
            <h2 className="text-4xl font-light tracking-tight mb-1">{time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</h2>
            <p className="text-sm font-medium text-slate-600 mb-3">{time.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</p>
            <div className="flex items-center text-xs text-slate-500 bg-white/30 rounded-lg px-2 py-1.5 border border-white/20 w-fit max-w-[240px] truncate">
              <span className="font-semibold mr-1 flex-shrink-0">杭州萧山:</span>
              <span className="truncate">
                {weather ? `${weather.label} ${Math.round(weather.temperature)}°C · 湿度 ${Math.round(weather.humidity)}%` : weatherError ? '天气暂不可用' : '天气更新中'}
              </span>
            </div>
            {weather ? <p className="mt-1.5 text-[10px] text-slate-400">风速 {Math.round(weather.windSpeed)} km/h · {weather.updatedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新</p> : null}
          </div>
        </div>

        <div className="h-full bg-white/40 backdrop-blur-xl border border-white/40 shadow-lg rounded-2xl p-4 text-slate-800 flex flex-col justify-center">
          {hwStats || netStats ? (
            <div className="w-full flex flex-col justify-center gap-2">
              <div className="rounded-xl border border-white/25 bg-white/30 px-2 py-1.5">
                <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase text-slate-500">
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="flex-shrink-0">下载 ↓</span>
                    <span className="min-w-0 truncate text-[10px] leading-4 font-mono font-medium normal-case text-slate-700" title={netStats ? formatSpeed(netStats.speed.rx_sec) : '--'}>
                      {netStats ? formatSpeed(netStats.speed.rx_sec) : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="flex-shrink-0">上传 ↑</span>
                    <span className="min-w-0 truncate text-[10px] leading-4 font-mono font-medium normal-case text-slate-700" title={netStats ? formatSpeed(netStats.speed.tx_sec) : '--'}>
                      {netStats ? formatSpeed(netStats.speed.tx_sec) : '--'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5 font-medium leading-tight">
                    <span className="min-w-0 pr-2">CPU 负载</span>
                    <span className="flex-shrink-0">{hwStats ? `${hwStats.cpu.usage}%` : '--'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full transition-all duration-1000" style={{ width: hwStats ? `${parseFloat(hwStats.cpu.usage)}%` : '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5 font-medium leading-tight">
                    <span className="min-w-0 pr-2">内存</span>
                    <span className="flex-shrink-0">{hwStats ? `${hwStats.memory.usagePercent}%` : '--'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full rounded-full transition-all duration-1000" style={{ width: hwStats ? `${parseFloat(hwStats.memory.usagePercent)}%` : '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-0.5 font-medium leading-tight">
                    <span className="min-w-0 pr-2">系统存储</span>
                    <span className="flex-shrink-0">{hwStats ? `${hwStats.disk.usagePercent}%` : '--'}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: hwStats ? `${parseFloat(hwStats.disk.usagePercent)}%` : '0%' }} />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="animate-pulse flex flex-col justify-around h-[120px]">
              <div className="h-2 bg-slate-300/50 rounded w-3/4" />
              <div className="h-2 bg-slate-300/50 rounded" />
              <div className="h-2 bg-slate-300/50 rounded w-5/6" />
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenDownloads}
          className="h-full bg-white/40 backdrop-blur-xl border border-white/40 shadow-lg rounded-2xl p-4 text-slate-800 flex flex-col text-left transition-all hover:bg-white/50 hover:shadow-xl active:scale-[0.995]"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center space-x-2 min-w-0">
              <ArrowDownTrayIcon className="w-5 h-5 text-sky-600" />
              <h3 className="text-sm font-bold">下载队列</h3>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${downloadAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {downloadAvailable ? '引擎在线' : '引擎离线'}
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2 text-[10px] font-medium text-slate-600">
            <span className="px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700">下载中 {downloadCounts.active}</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">排队 {downloadCounts.waiting}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">暂停 {downloadCounts.paused}</span>
            <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">失败 {downloadCounts.error}</span>
          </div>
          <div className="flex-1 flex flex-col justify-center space-y-2 overflow-hidden">
            {downloads.length > 0 ? (
              downloads.map((task) => {
                const total = parseInt(task.totalLength)
                const completed = parseInt(task.completedLength)
                const speed = parseInt(task.downloadSpeed)
                const percent = total > 0 ? (completed / total) * 100 : 0
                const statusLabel = getTaskStatusLabel({ status: task.status })
                const statusTone = getWidgetTaskTone(task.status)
                const statusSummary = getWidgetTaskSummary(task)
                const name = getTaskDisplayName(task)

                return (
                  <div key={task.gid} className="bg-white/30 rounded-lg p-2 border border-white/20 text-xs">
                    <div className="flex justify-between items-center gap-2 mb-1 truncate">
                      <span className="truncate font-medium w-36" title={name}>{name}</span>
                      <span className={`flex-shrink-0 font-semibold ${statusTone}`}>{statusLabel}</span>
                    </div>
                    {task.status === 'error' ? (
                      <div className="mb-1 truncate text-[10px] text-red-600 font-medium" title={statusSummary}>{statusSummary}</div>
                    ) : null}
                    <div className="w-full h-1 bg-slate-200/50 rounded-full overflow-hidden mb-1">
                      <div className="bg-sky-500 h-full rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                      <span>{task.status === 'active' ? formatSpeed(speed) : statusSummary}</span>
                      <span>{total > 0 ? `${formatBytes(completed)} / ${formatBytes(total)}` : percent > 0 ? `${percent.toFixed(1)}%` : '--'}</span>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 bg-white/20 rounded-lg border border-white/10 border-dashed">
                {downloadAvailable ? '当前无下载任务' : '下载引擎当前不可用'}
              </div>
            )}
          </div>
        </button>

        <div className="h-full bg-white/40 backdrop-blur-xl border border-white/40 shadow-lg rounded-2xl p-4 text-slate-800 overflow-hidden relative flex flex-col group">
          <div className="flex items-center justify-between mb-2 relative z-10">
            <div className="flex items-center space-x-2">
              {musicState?.appId === 'localmusic' ? <FolderOpenIcon className="w-5 h-5 text-emerald-600" /> : musicState?.appId === 'music' ? <CloudIcon className="w-5 h-5 text-rose-600" /> : <MusicalNoteIcon className="w-5 h-5 text-slate-500" />}
              <h3 className="text-sm font-bold">{musicState?.appId === 'localmusic' ? '本地音乐' : musicState?.appId === 'music' ? '网易云音乐' : '正在播放'}</h3>
            </div>
            {musicState ? (
              <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse" />
                <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse delay-75" />
                <div className="w-1 h-1 rounded-full bg-slate-400 animate-pulse delay-150" />
              </div>
            ) : null}
          </div>

          <div className="flex-1 flex flex-col justify-center relative z-10">
            {musicState ? (
              <div className="flex items-center space-x-3">
                <div className={`w-[72px] h-[72px] rounded-full overflow-hidden border-2 border-white/50 shadow-md flex-shrink-0 ${musicState.playing ? 'animate-[spin_8s_linear_infinite]' : ''}`}>
                  {musicState.cover ? <img src={musicState.cover} alt="cover" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-rose-100 flex items-center justify-center"><MusicalNoteIcon className="w-8 h-8 text-rose-300" /></div>}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <p className="text-base font-black truncate text-slate-800 drop-shadow-sm mb-0.5" title={musicState.title}>{musicState.title || '未知歌名'}</p>
                  <p className="text-xs text-slate-600 font-medium truncate drop-shadow-sm mb-1" title={musicState.artist}>{musicState.artist}</p>
                  <p className="text-[10px] text-blue-600 font-medium truncate drop-shadow-sm h-4">{musicState.lyric || (musicState.playing ? '♪ 享受音乐中...' : '')}</p>
                  <div className="flex items-center space-x-4 mt-1">
                    <BackwardIcon className="w-4 h-4 text-slate-600 cursor-pointer hover:text-slate-800 transition-colors" onClick={() => handleMusicCmd('prev')} />
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-white/60 hover:bg-white/90 shadow-sm cursor-pointer transition-all active:scale-95" onClick={() => handleMusicCmd('toggle')}>
                      {musicState.playing ? <PauseIcon className="w-3.5 h-3.5 text-slate-800" /> : <PlayIcon className="w-3.5 h-3.5 text-slate-800 ml-0.5" />}
                    </div>
                    <ForwardIcon className="w-4 h-4 text-slate-600 cursor-pointer hover:text-slate-800 transition-colors" onClick={() => handleMusicCmd('next')} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center space-x-3 text-slate-500 p-2 bg-white/20 rounded-xl border border-white/10 border-dashed">
                <MusicalNoteIcon className="w-5 h-5 opacity-50" />
                <span className="text-xs font-medium">打开应用开始播放</span>
              </div>
            )}
          </div>

          {musicState?.cover ? <div className="absolute inset-0 z-0 opacity-25 bg-cover bg-center blur-2xl scale-150 pointer-events-none transition-all duration-1000" style={{ backgroundImage: `url(${musicState.cover})` }} /> : null}
        </div>
      </div>
    </div>
  )
}
