import { useState, useEffect } from 'react'
import { Minus, Square, X, Settings } from 'lucide-react'
import { DashboardIcon, MonitorIcon, FilesIcon, VideoIcon, LocalMusicIcon, DownloadsIcon, NotesIcon, ReaderIcon, CronIcon, BaiduIcon, QuarkIcon, NeteaseIcon, OpenClawIcon, DidaIcon } from './components/Icons'
import NeteaseLogin from './components/NeteaseLogin'
import DidaLogin from './components/DidaLogin'
import LoginScreen from './components/LoginScreen'
import ToastProvider from './components/ToastProvider'
import NotificationCenter from './components/NotificationCenter'

import { motion, AnimatePresence } from 'framer-motion'
import Dashboard from './apps/Dashboard'
import ServiceMonitor from './apps/Monitor'
import IframeApp from './apps/IframeApp'
import VideoApp from './apps/VideoApp'
import MusicApp from './apps/MusicApp'
import LocalMusicApp from './apps/LocalMusicApp'
import DownloadApp from './apps/DownloadApp'
import NotesApp from './apps/NotesApp'
import AIQuantApp from "./apps/AIQuantApp"
import AIQuantIcon from "./components/AIQuantIcon"
import NetdiskApp from './apps/NetdiskApp'
import ReaderApp from './apps/ReaderApp'
import CronApp from './apps/CronApp'
import DidaApp from './apps/DidaApp'
import { withBasePath } from './lib/basePath'
import { buildEmbeddedOpenClawIframeUrl, primeEmbeddedOpenClawStorage } from './lib/openclawStorage'
import DesktopWidgets from './components/DesktopWidgets'
import { fetchServerUiConfig, saveServerUiConfig } from './lib/serverUiConfig'
import { useNotificationStore } from './store/useNotificationStore'




type AppId = 'aiquant' | 'dashboard' | 'monitor' | 'openclaw' | 'files' | 'video' | 'music' | 'localmusic' | 'downloads' | 'notes' | 'baidu' | 'quark' | 'reader' | 'cron' | 'dida'

interface AppDef {
  id: AppId
  name: string
  icon: React.ElementType
  color: string
}

interface MiniStats {
  cpu: number
  mem: number
}

const APPS: AppDef[] = [
  { id: "aiquant", name: "AI 炒股", icon: AIQuantIcon, color: "" },
  { id: 'dashboard', name: '系统状态', icon: DashboardIcon, color: '' },
  { id: 'monitor', name: '服务监控', icon: MonitorIcon, color: '' },
  { id: 'openclaw', name: 'OpenClaw', icon: OpenClawIcon, color: '' },
  { id: 'files', name: '文件总管', icon: FilesIcon, color: '' },
  { id: 'video', name: '影视仓', icon: VideoIcon, color: '' },
  { id: 'music', name: '网易云', icon: NeteaseIcon, color: '' },
  { id: 'localmusic', name: '本地音乐', icon: LocalMusicIcon, color: '' },
  { id: 'downloads', name: '下载管理', icon: DownloadsIcon, color: '' },
  { id: 'notes', name: '随手小记', icon: NotesIcon, color: '' },
  { id: 'dida', name: '滴答清单lite', icon: DidaIcon, color: '' },
  { id: 'reader', name: '每日简报', icon: ReaderIcon, color: '' },
  { id: 'cron', name: '计划任务', icon: CronIcon, color: '' },
  { id: 'baidu', name: '百度网盘', icon: BaiduIcon, color: '' },
  { id: 'quark', name: '夸克网盘', icon: QuarkIcon, color: '' }
]

const WALLPAPERS = [
  withBasePath('/wallpaper.svg'),
  withBasePath('/wallpapers/clean-1.jpg'),
  withBasePath('/wallpapers/clean-6.jpg')
]

function App() {
  // Login state - must be declared before any useEffect that uses it
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [authFetchReady, setAuthFetchReady] = useState(false)

  useEffect(() => {
    document.title = 'ClawOS'
    
    // Hide splash screen smoothly after app mounts
    const splash = document.getElementById('clawos-splash')
    if (splash) {
      setTimeout(() => {
        splash.style.opacity = '0'
        setTimeout(() => splash.remove(), 500)
      }, 300) // brief delay to let React fully render the first frame
    }
  }, [])

  const openClawGatewayUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${withBasePath('/proxy/openclaw')}`
  const [openClawIframeUrl, setOpenClawIframeUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false

    void primeEmbeddedOpenClawStorage(openClawGatewayUrl).then((token) => {
      if (cancelled) {
        return
      }

      setOpenClawIframeUrl(buildEmbeddedOpenClawIframeUrl(openClawGatewayUrl, token))
    })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, openClawGatewayUrl])

  const [activeApp, setActiveApp] = useState<AppId | null>(null)
  const [lastActiveApp, setLastActiveApp] = useState<AppId | null>(null)
  const [openedApps, setOpenedApps] = useState<Set<AppId>>(new Set())
  const [maximizedApps, setMaximizedApps] = useState<Set<AppId>>(new Set())
  const [time, setTime] = useState(new Date())
  const [showSettings, setShowSettings] = useState(false)

  // Configure global fetch to include Basic Auth header when authenticated
  useEffect(() => {
    if (!isAuthenticated || !password) {
      setAuthFetchReady(false)
      return
    }

    const originalFetch = window.fetch
    const authHeader = 'Basic ' + btoa('clawos:' + password)

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const newInit = init || {}
      const headers = new Headers(newInit.headers || {})
      
      // Only add auth header for same-origin requests or relative URLs
      const url = typeof input === 'string' ? input : input.toString()
      if (url.startsWith('/') || url.startsWith(window.location.origin) || url.startsWith('http') === false) {
        headers.set('Authorization', authHeader)
      }

      newInit.headers = headers
      return originalFetch(input, newInit)
    }

    setAuthFetchReady(true)

    return () => {
      window.fetch = originalFetch
      setAuthFetchReady(false)
    }
  }, [isAuthenticated, password])
  const [settingsTab, setSettingsTab] = useState<'personal'|'download'|'account'|'about'>('personal')
  const [dockSize, setDockSize] = useState(48)
  const [autoHideDock, setAutoHideDock] = useState(false)
  const [defaultFullscreen, setDefaultFullscreen] = useState(false)
  const [wallpaper, setWallpaper] = useState(WALLPAPERS[0])
  const [showWidgets, setShowWidgets] = useState(true)
  const [dockHideDelay, setDockHideDelay] = useState(2)
  const [stickyNotifications, setStickyNotifications] = useState(false)
  const [neteaseCookie, setNeteaseCookie] = useState('')
  const [uiConfigReady, setUiConfigReady] = useState(false)
  const setNotificationBehavior = useNotificationStore((state) => state.setBehavior)
  
  const [isDockVisible, setIsDockVisible] = useState(true)
  const [isHoveringDock, setIsHoveringDock] = useState(false)
  const [windowPadX, setWindowPadX] = useState(typeof window !== 'undefined' && window.innerWidth < 768 ? 16 : 48)
  const [downloadDir, setDownloadDir] = useState('')

  useEffect(() => {
    if (!isAuthenticated) return
    // Fetch initial download directory
    fetch('/api/system/downloads/config')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.dir) {
          setDownloadDir(data.data.dir)
        }
      })
      .catch(console.error)
  }, [isAuthenticated])

  const handleDownloadDirUpdate = (newDir: string) => {
    setDownloadDir(newDir)
    fetch('/api/system/downloads/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: newDir })
    }).catch(console.error)
  }

  useEffect(() => {
    const handleResize = () => setWindowPadX(window.innerWidth < 768 ? 16 : 48)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    fetchServerUiConfig()
      .then((ui) => {
        setDockSize(ui.dockSize)
        setAutoHideDock(ui.autoHideDock)
        setDefaultFullscreen(ui.defaultFullscreen)
        setWallpaper(ui.wallpaper || WALLPAPERS[0])
        setShowWidgets(ui.showWidgets)
        setDockHideDelay(ui.dockHideDelay)
        setStickyNotifications(ui.stickyNotifications)
      })
      .catch((error) => {
        console.error('Failed to load server UI config', error)
      })
      .finally(() => {
        setUiConfigReady(true)
      })
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !uiConfigReady) {
      return
    }

    saveServerUiConfig({
      dockSize,
      autoHideDock,
      defaultFullscreen,
      wallpaper,
      showWidgets,
      dockHideDelay,
      stickyNotifications,
    }).catch((error) => {
      console.error('Failed to save server UI config', error)
    })
  }, [isAuthenticated, uiConfigReady, dockSize, autoHideDock, defaultFullscreen, wallpaper, showWidgets, dockHideDelay, stickyNotifications])

  useEffect(() => {
    setNotificationBehavior({
      stickyToasts: stickyNotifications,
    })
  }, [stickyNotifications, setNotificationBehavior])

  useEffect(() => {
    if (!isAuthenticated) return
    fetch('/api/system/music/settings/cookie')
      .then(res => res.json())
      .then(data => {
        if (data.success && typeof data.data?.cookie === 'string') {
          setNeteaseCookie(data.data.cookie)
          localStorage.setItem('clawos-netease-cookie', data.data.cookie)
        }
      })
      .catch(console.error)
  }, [isAuthenticated])

  useEffect(() => {
    localStorage.setItem('clawos-netease-cookie', neteaseCookie)
  }, [neteaseCookie])

  const handleNeteaseCookieUpdate = (cookie: string) => {
    setNeteaseCookie(cookie)
    fetch('/api/system/music/settings/cookie', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie })
    }).then(() => {
      window.dispatchEvent(new Event('netease-cookie-updated'))
    }).catch(console.error)
  }

  useEffect(() => {
    if (!autoHideDock) {
      setIsDockVisible(true)
      return
    }
    if (isHoveringDock) {
      setIsDockVisible(true)
      return
    }
    const timer = setTimeout(() => {
      setIsDockVisible(false)
    }, dockHideDelay * 1000)
    return () => clearTimeout(timer)
  }, [autoHideDock, isHoveringDock, dockHideDelay])
  const [miniStats, setMiniStats] = useState<MiniStats | null>(null)

  useEffect(() => {
    if (activeApp) {
      setLastActiveApp(activeApp)
      setOpenedApps(prev => {
        if (prev.has(activeApp)) return prev
        const newSet = new Set(prev)
        newSet.add(activeApp)
        return newSet
      })
      
      // Auto maximize if setting is enabled and app is not already opened and maximized
      if (defaultFullscreen) {
        setMaximizedApps(prev => {
          if (prev.has(activeApp)) return prev
          const next = new Set(prev)
          next.add(activeApp)
          return next
        })
      }
    }
  }, [activeApp, defaultFullscreen])

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    const fetchMiniStats = async () => {
      try {
        const res = await fetch(withBasePath('/api/system/hardware'))
        const json = await res.json()
        if (json.success) {
          setMiniStats({
            cpu: parseFloat(json.data.cpu.usage),
            mem: parseFloat(json.data.memory.usagePercent)
          })
        }
      } catch (err) {
        // silently ignore mini stats error
      }
    }
    fetchMiniStats()
    const intv = setInterval(fetchMiniStats, 5000)
    return () => clearInterval(intv)
  }, [isAuthenticated])

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveApp(null) // 隐藏至后台，和最小化一致
  }

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation()
    setActiveApp(null)
  }

  const handleMaximize = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeApp) {
      setMaximizedApps(prev => {
        const next = new Set(prev)
        if (next.has(activeApp)) {
          next.delete(activeApp)
        } else {
          next.add(activeApp)
        }
        return next
      })
    }
  }

  // Login handler
  const handleLogin = async (inputPassword: string) => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const response = await fetch(withBasePath('/api/system/auth/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: inputPassword })
      })
      const data = await response.json()
      if (data.success) {
        setPassword(inputPassword)
        setIsAuthenticated(true)
        setLoginError(null)
      } else {
        setLoginError('密码错误，请重试')
      }
    } catch (error) {
      setLoginError('验证失败，请检查网络连接')
    } finally {
      setLoginLoading(false)
    }
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading} />
  }

  const renderAppContent = (id: AppId) => {
    switch (id) {
      case 'aiquant': return <AIQuantApp />
      case 'dashboard': return <Dashboard />
      case 'monitor': return <ServiceMonitor />
      case 'openclaw':
        return openClawIframeUrl
          ? <IframeApp url={openClawIframeUrl} title="OpenClaw" />
          : <div className="flex h-full items-center justify-center bg-slate-50 text-sm text-slate-500">正在准备 OpenClaw 连接...</div>
      case 'files': return <IframeApp url={withBasePath('/proxy/filebrowser/')} title="FileBrowser" />
      case 'video': return <VideoApp />
      case 'music': return <MusicApp isActive={activeApp === 'music'} />
      case 'localmusic': return <LocalMusicApp />
      case 'downloads': return <DownloadApp />
      case 'notes': return <NotesApp />
      case 'dida': return <DidaApp />
      case 'reader': return <ReaderApp />
      case 'cron': return <CronApp />
      case 'baidu': return <NetdiskApp brand="baidu" />
      case 'quark': return <NetdiskApp brand="quark" />
      default: return null
    }
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-900 text-slate-800 font-sans select-none">
      {/* Wallpaper */}
      <div 
        className="absolute inset-0 bg-cover bg-center z-0 transition-all duration-700 ease-in-out"
        style={{ 
          backgroundImage: `url(${wallpaper})`,
          filter: activeApp ? 'brightness(0.95) blur(6px)' : 'brightness(1) blur(0px)'
        }}
      />

      {/* Top Status Bar */}
      <div className="absolute top-0 left-0 right-0 h-8 bg-white/30 backdrop-blur-md border-b border-white/20 z-[999] flex justify-between items-center px-4 text-xs font-medium text-slate-700 shadow-sm pointer-events-auto">
        <div className="flex items-center space-x-3">
          <div 
            onClick={() => setShowSettings(true)}
            className="cursor-pointer hover:bg-white/40 p-1 rounded-md transition-colors flex items-center justify-center"
          >
            <Settings className="w-3.5 h-3.5 text-slate-700 drop-shadow-sm" />
          </div>
          <span className="font-bold text-slate-800 tracking-wide">ClawOS</span>
        </div>
        <div className="flex items-center space-x-4">
          {miniStats && (
            <div className="flex items-center space-x-3 bg-white/40 px-2 py-0.5 rounded-full border border-white/30 shadow-inner">
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-slate-500 font-bold">C</span>
                <div className="w-8 h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                  <div className="bg-blue-500 h-full transition-all duration-1000" style={{ width: `${miniStats.cpu}%` }} />
                </div>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-[10px] text-slate-500 font-bold">M</span>
                <div className="w-8 h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full transition-all duration-1000" style={{ width: `${miniStats.mem}%` }} />
                </div>
              </div>
            </div>
          )}
          <span className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5 shadow-[0_0_8px_rgba(34,197,94,0.8)]" /> 
            Tailscale 正常
          </span>
          <NotificationCenter />
          <span>{time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      <ToastProvider />

      {/* Desktop Icons */}
      <AnimatePresence>
        {!activeApp && (
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="absolute inset-0 z-10 p-8 pt-16 pb-32 flex flex-col flex-wrap gap-6 content-start overflow-x-auto right-0"
          >
            {APPS.map(app => (
              <div 
                key={app.id} 
                onClick={() => setActiveApp(app.id)}
                className="flex flex-col items-center justify-center w-24 h-28 rounded-xl hover:bg-white/20 hover:backdrop-blur-md transition-all cursor-pointer group active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/40 backdrop-blur-lg border border-white/50 shadow-xl flex items-center justify-center group-hover:shadow-2xl group-hover:-translate-y-1 transition-all">
                  <app.icon className={`w-8 h-8 ${app.color} drop-shadow-sm`} />
                </div>
                <span className="mt-2 text-xs font-medium text-slate-800 bg-white/40 px-3 py-1 rounded-full backdrop-blur-md border border-white/20 shadow-sm">{app.name}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Widgets - Always keep in DOM, hide with CSS to preserve data */}
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ 
          opacity: !activeApp && showWidgets ? 1 : 0, 
          x: !activeApp && showWidgets ? 0 : 50,
          pointerEvents: !activeApp && showWidgets ? 'auto' : 'none'
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{ 
          position: 'absolute',
          right: 0,
          top: 32,
          bottom: 0,
          width: showWidgets ? 640 : 0,
          zIndex: 20
        }}
      >
        <DesktopWidgets authReady={authFetchReady} onOpenDownloads={() => setActiveApp('downloads')} onOpenDida={() => setActiveApp('dida')} />
      </motion.div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/20 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white/80 backdrop-blur-2xl border border-white/50 shadow-2xl rounded-2xl w-[640px] h-[460px] flex overflow-hidden"
            >
              {/* Sidebar */}
              <div className="w-48 bg-slate-50/50 border-r border-slate-200/50 flex flex-col p-6">
                <h3 className="font-bold text-lg text-slate-800 mb-6">系统设置</h3>
                <div className="space-y-1">
                  {[ {id:"personal", label:"个性化"}, {id:"download", label:"下载设置"}, {id:"account", label:"账号授权"}, {id:"about", label:"关于系统"} ].map(tab => (
                    <div 
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id as any)}
                      className={`px-4 py-2.5 rounded-xl cursor-pointer text-sm font-medium transition-colors ${settingsTab === tab.id ? "bg-white text-blue-600 shadow-sm border border-slate-100" : "text-slate-600 hover:bg-slate-200/50"}`}
                    >
                      {tab.label}
                    </div>
                  ))}
                </div>
              </div>
              {/* Main Content */}
              <div className="flex-1 flex flex-col relative">
                <div className="absolute top-4 right-4 z-10">
                  <div 
                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer hover:bg-slate-200 transition-colors"
                    onClick={() => setShowSettings(false)}
                  >
                    <X className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
                <div className="p-8 flex-1 overflow-y-auto">
                  {settingsTab === "personal" && (
                    <div className="space-y-8 animate-in fade-in duration-300">
                      <h4 className="text-lg font-bold text-slate-800 mb-6">个性化</h4>
                      <div className="space-y-6">
                        {/* Wallpaper Selector */}
                        <div>
                          <label className="text-sm font-medium text-slate-700 block mb-3">系统壁纸</label>
                          <div className="grid grid-cols-5 gap-3 max-h-[140px] overflow-y-auto pr-2 custom-scrollbar">
                            {WALLPAPERS.map((wp, idx) => (
                              <div 
                                key={idx}
                                onClick={() => setWallpaper(wp)}
                                className={`h-12 rounded-lg bg-cover bg-center cursor-pointer border-2 transition-all hover:opacity-90 ${wallpaper === wp ? 'border-blue-500 shadow-md scale-[0.92]' : 'border-transparent hover:border-slate-300'}`}
                                style={{ backgroundImage: `url(${wp})` }}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="h-px bg-slate-200/60 my-2" />
                        
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">自动隐藏 Dock</label>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={autoHideDock}
                              onChange={(e) => setAutoHideDock(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">显示右侧桌面卡片 (Widgets)</label>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={showWidgets}
                              onChange={(e) => setShowWidgets(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                          </label>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <label className="text-sm font-medium text-slate-700">通知常驻显示</label>
                            <p className="text-xs text-slate-500 mt-1">关闭后通知会自动消失；开启后需手动关闭。</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={stickyNotifications}
                              onChange={(e) => setStickyNotifications(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                          </label>
                        </div>
                        {autoHideDock && (
                          <div className="animate-in fade-in slide-in-from-top-2 duration-300 pl-4 border-l-2 border-slate-200">
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-sm font-medium text-slate-700">
                                隐藏延迟时间
                              </label>
                              <span className="text-xs text-slate-500 font-mono">{dockHideDelay}s</span>
                            </div>
                            <input 
                              type="range" 
                              min="1" 
                              max="10" 
                              step="1"
                              value={dockHideDelay}
                              onChange={(e) => setDockHideDelay(parseInt(e.target.value, 10))}
                              className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        )}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <label className="text-sm font-medium text-slate-700">
                              Dock 栏大小
                            </label>
                            <span className="text-xs text-slate-500 font-mono">{dockSize}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="32" 
                            max="80" 
                            step="4"
                            value={dockSize}
                            onChange={(e) => setDockSize(parseInt(e.target.value, 10))}
                            className="w-full accent-blue-500 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                            <span>小</span>
                            <span>大</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">窗口默认全屏打开</label>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={defaultFullscreen}
                              onChange={(e) => setDefaultFullscreen(e.target.checked)}
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                  {settingsTab === "download" && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <h4 className="text-lg font-bold text-slate-800 mb-6">下载设置</h4>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">默认下载保存目录</label>
                        <input 
                          type="text" 
                          value={downloadDir}
                          onChange={(e) => setDownloadDir(e.target.value)}
                          onBlur={(e) => handleDownloadDirUpdate(e.target.value)}
                          placeholder="~/Downloads"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-shadow"
                        />
                        <p className="text-xs text-slate-500 mt-2">此设置将全局应用于音乐、影视与网盘的默认下载路径。修改失去焦点后自动生效。</p>
                      </div>
                    </div>
                  )}
                  {settingsTab === "account" && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <h4 className="text-lg font-bold text-slate-800 mb-6">账号授权</h4>
                      <NeteaseLogin currentCookie={neteaseCookie} onCookieUpdate={handleNeteaseCookieUpdate} />
                      <div className="h-px bg-slate-200 my-4" />
                      <DidaLogin />
                    </div>
                  )}
                  {settingsTab === "about" && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-4 animate-in fade-in duration-300 pt-8">
                      <img src={withBasePath("/favicon.svg")} className="w-20 h-20 mb-2 drop-shadow-md" />
                      <h2 className="text-3xl font-bold text-slate-800">ClawOS</h2>
                       <p className="text-slate-500 font-mono text-sm bg-slate-100 px-2 py-0.5 rounded">v1.30.0</p>
                      <div className="h-px w-16 bg-slate-200 my-4" />
                      <div className="text-sm text-slate-600 space-y-2">
                        <p>构建日期：2026-04-12</p>
                        <p>开发者：<span className="font-bold text-slate-800">gumustudio</span></p>
                      </div>
                      <p className="text-xs text-slate-400 mt-8">© 2026 ClawOS. Licensed under GPL-3.0.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Active App Window */}
      <motion.div 
        initial={false}
        animate={{ 
          opacity: activeApp ? 1 : 0, 
          y: activeApp ? 0 : 20, 
          scale: activeApp ? 1 : 0.98,
          pointerEvents: activeApp ? 'auto' : 'none',
          paddingTop: activeApp && maximizedApps.has(activeApp) ? 32 : 48,
          paddingLeft: activeApp && maximizedApps.has(activeApp) ? 0 : windowPadX,
          paddingRight: activeApp && maximizedApps.has(activeApp) ? 0 : windowPadX,
          paddingBottom: activeApp && maximizedApps.has(activeApp) 
            ? (isDockVisible ? dockSize + 40 : 0)
            : (isDockVisible ? dockSize + 48 : 48)
        }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={`absolute z-30 flex flex-col pointer-events-none inset-0`}
      >
        <motion.div 
          animate={{
            borderRadius: activeApp && maximizedApps.has(activeApp) ? 0 : 16
          }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={`w-full h-full bg-white/60 backdrop-blur-2xl shadow-[0_30px_60px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col ${
            activeApp && maximizedApps.has(activeApp) ? 'border-0 border-transparent' : 'border border-white/50'
          } ${activeApp ? 'pointer-events-auto' : 'pointer-events-none'}`}
        >
          {/* Window Header - macOS Style */}
          <div className="h-12 bg-white/40 border-b border-white/50 flex items-center px-4 flex-shrink-0 select-none relative transition-colors duration-300" onDoubleClick={handleMaximize}>
            
            {/* Traffic Lights (macOS buttons) */}
            <div className="flex items-center space-x-2 z-10">
              <div 
                onClick={handleClose}
                className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:bg-[#ff5f56]/80 flex items-center justify-center group"
              >
                <X className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div 
                onClick={handleMinimize}
                className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] border border-[#dea123] cursor-pointer hover:bg-[#ffbd2e]/80 flex items-center justify-center group"
              >
                <Minus className="w-2.5 h-2.5 text-black/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div 
                onClick={handleMaximize}
                className="w-3.5 h-3.5 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:bg-[#27c93f]/80 flex items-center justify-center group"
              >
                <Square className="w-2 h-2 text-black/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Centered Title */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="flex items-center space-x-2">
                {(() => {
                  const currentApp = APPS.find(a => a.id === (activeApp || lastActiveApp))
                  const AppIcon = currentApp?.icon || DashboardIcon
                  return (
                    <>
                      <AppIcon className="w-4 h-4 text-slate-600 drop-shadow-sm" />
                      <div className="font-semibold text-sm text-slate-700 tracking-wide drop-shadow-sm">
                        {currentApp?.name}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
            
          </div>
          {/* Window Content */}
          <div className="flex-1 overflow-hidden bg-white/40 relative">
            {Array.from(openedApps).map(id => (
              <div 
                key={id} 
                className="absolute inset-0 transition-opacity duration-200 overflow-auto"
                style={{ 
                  opacity: activeApp === id ? 1 : 0,
                  pointerEvents: activeApp === id ? 'auto' : 'none',
                  zIndex: activeApp === id ? 10 : 0
                }}
              >
                {renderAppContent(id)}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Bottom edge trigger for auto-hide dock */}
      {autoHideDock && !isDockVisible && (
        <div 
          className="absolute bottom-0 left-0 right-0 h-4 z-50 pointer-events-auto"
          onMouseEnter={() => setIsHoveringDock(true)}
        />
      )}

      {/* Bottom Dock */}
      <div 
        className={`absolute bottom-4 left-0 right-0 z-40 flex justify-center pointer-events-none transition-transform duration-500 ease-in-out ${autoHideDock && !isDockVisible ? 'translate-y-32' : 'translate-y-0'}`}
      >
        <div 
          className="bg-white/30 backdrop-blur-2xl border border-white/40 p-2 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.1)] flex items-center space-x-2 pointer-events-auto"
          onMouseEnter={() => setIsHoveringDock(true)}
          onMouseLeave={() => setIsHoveringDock(false)}
        >
          {APPS.map(app => (
            <div 
              key={app.id} 
              onClick={(e) => {
                e.stopPropagation()
                if (activeApp === app.id) {
                  setActiveApp(null) // minimize if already active
                } else {
                  setActiveApp(app.id) // open or bring to front
                }
              }}
              className="relative group cursor-pointer"
            >
              <div 
                className={`rounded-2xl flex items-center justify-center transition-all duration-300 ${activeApp === app.id ? 'bg-white/80 scale-110 shadow-lg' : 'bg-white/30 hover:bg-white/60 hover:-translate-y-2 hover:shadow-xl'}`}
                style={{ width: dockSize, height: dockSize }}
              >
                <app.icon className={`${app.color}`} style={{ width: dockSize / 2, height: dockSize / 2 }} />
              </div>
              {activeApp === app.id && (
                <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-slate-600 rounded-full" />
              )}
              {activeApp !== app.id && openedApps.has(app.id) && (
                <div className="absolute -bottom-1.5 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-slate-400 rounded-full" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
