import { useState, useEffect } from 'react'
import { 
  FolderIcon, DocumentIcon, PhotoIcon, PlayCircleIcon, 
  CloudArrowDownIcon,
  ArrowPathIcon, ExclamationTriangleIcon, Cog6ToothIcon
} from '@heroicons/react/24/solid'
import { withBasePath } from '../lib/basePath'
import { BaiduIcon, QuarkIcon } from '../components/Icons'
import { getNetdiskGuideData } from './netdiskGuide'
import { startQuarkWebLoginFlow } from './quarkLogin'
import { getNetdiskFileKind } from './netdiskFileType'
import { getAlistManageUrl } from './netdiskAccessMeta'

interface NetdiskProps {
  brand: 'baidu' | 'quark'
}

interface NetdiskFile {
  name: string
  size: number
  is_dir: boolean
  modified: string
  type: number
}

interface NetdiskStatus {
  brand: 'baidu' | 'quark'
  targetPath: string
  mounted: boolean
  status: 'mounted' | 'not_mounted' | 'auth_failed' | 'auth_expired' | 'alist_unreachable' | 'alist_error'
  message?: string
  itemCount?: number
  alistAdmin: {
    username: string
    password: string
  }
  localOnlyAdmin: boolean
}

export default function NetdiskApp({ brand }: NetdiskProps) {
  const isBaidu = brand === 'baidu'
  const guideData = getNetdiskGuideData(brand)
  const title = guideData.title
  const targetPath = guideData.targetPath
  
  const [files, setFiles] = useState<NetdiskFile[]>([])
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState(targetPath)
  const [filterType, setFilterType] = useState<'all'|'image'|'video'|'document'>('all')
  const [showAlistAuth, setShowAlistAuth] = useState(false)
  const [netdiskStatus, setNetdiskStatus] = useState<NetdiskStatus | null>(null)
  const [credentialInput, setCredentialInput] = useState('')
  const [configuring, setConfiguring] = useState(false)
  const [showQuarkLogin, setShowQuarkLogin] = useState(false)
  const [quarkLoginHint, setQuarkLoginHint] = useState('请在新窗口中完成夸克登录')
  const [quarkLoginStartedAt, setQuarkLoginStartedAt] = useState<number | null>(null)

  const fetchStatus = async () => {
    setStatusLoading(true)
    try {
      const res = await fetch(withBasePath(`/api/system/netdisk/status?brand=${brand}`))
      const json = await res.json()
      if (json.success) {
        setNetdiskStatus(json.data)
        return json.data as NetdiskStatus
      }
    } catch {
      // let the fallback UI below handle this
    } finally {
      setStatusLoading(false)
    }

    const fallbackStatus: NetdiskStatus = {
      brand,
      targetPath,
      mounted: false,
      status: 'alist_unreachable',
      message: '当前无法检测到底层挂载后台，请确认 AList 服务是否启动。',
      alistAdmin: {
        username: 'admin',
        password: ''
      },
      localOnlyAdmin: true
    }
    setNetdiskStatus(fallbackStatus)
    return fallbackStatus
  }

  const fetchFiles = async (path: string) => {
    setLoading(true)
    setError(null)
    setFilterType('all') // Reset filter when changing directory
    try {
      const res = await fetch(withBasePath(`/api/system/netdisk/files?path=${encodeURIComponent(path)}`))
      const json = await res.json()
      if (json.success) {
        setFiles(json.data)
        setCurrentPath(path)
      } else {
        setError(json.error || '获取文件失败')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const status = await fetchStatus()
      if (!cancelled && status.mounted) {
        void fetchFiles(targetPath)
      } else if (!cancelled) {
        setFiles([])
        setLoading(false)
        setError(status.message || '尚未完成挂载')
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [brand])

  const handleDownload = async (file: NetdiskFile) => {
    if (file.is_dir) return
    const fullPath = `${currentPath === '/' ? '' : currentPath}/${file.name}`
    try {
      const res = await fetch(withBasePath('/api/system/netdisk/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath })
      })
      const json = await res.json()
      if (json.success) {
        alert('已推送到下载管理，正在下载至本机')
      } else {
        alert('下载失败: ' + json.error)
      }
    } catch (e: any) {
      alert('下载请求出错: ' + e.message)
    }
  }

  // Theme colors
  const themeColors = {
    text: isBaidu ? 'text-blue-600' : 'text-indigo-600',
    bg: isBaidu ? 'bg-blue-600' : 'bg-indigo-600',
    bgHover: isBaidu ? 'hover:bg-blue-700' : 'hover:bg-indigo-700',
    lightBg: isBaidu ? 'bg-blue-50' : 'bg-indigo-50',
    lightHover: isBaidu ? 'hover:bg-blue-50' : 'hover:bg-indigo-50',
    border: isBaidu ? 'border-blue-200' : 'border-indigo-200',
    iconFolder: isBaidu ? 'text-blue-400' : 'text-yellow-400',
  }

  const getFileIcon = (file: NetdiskFile) => {
    const fileKind = getNetdiskFileKind(file)
    if (fileKind === 'folder') return <FolderIcon className={`w-8 h-8 ${themeColors.iconFolder}`} />
    if (fileKind === 'video' || fileKind === 'audio') return <PlayCircleIcon className="w-8 h-8 text-purple-500" />
    if (fileKind === 'image') return <PhotoIcon className="w-8 h-8 text-green-500" />
    return <DocumentIcon className="w-8 h-8 text-slate-400" />
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '-'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleOpenAlist = () => {
    setShowAlistAuth(true)
  }

  const confirmOpenAlist = () => {
    navigator.clipboard.writeText(netdiskStatus?.alistAdmin.password || '').catch(() => {})
    window.open(getAlistManageUrl(), '_blank')
    setShowAlistAuth(false)
  }

  const handleRecheckMount = async () => {
    const status = await fetchStatus()
    if (status.mounted) {
      void fetchFiles(targetPath)
      return
    }

    setFiles([])
    setLoading(false)
    setError(status.message || '尚未完成挂载')
  }

  const handleAutoConfigure = async () => {
    const credential = credentialInput.trim()
    if (!credential) {
      alert(`请先填写 ${guideData.credentialLabel}`)
      return
    }

    setConfiguring(true)
    try {
      const body = guideData.credentialField === 'refreshToken'
        ? { brand, refreshToken: credential }
        : { brand, cookie: credential }

      const response = await fetch(withBasePath('/api/system/netdisk/configure'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const json = await response.json()

      if (!json.success) {
        alert(json.error || '自动配置失败')
        return
      }

      await handleRecheckMount()
    } catch (error: any) {
      alert(error.message || '自动配置失败')
    } finally {
      setConfiguring(false)
    }
  }

  useEffect(() => {
    if (brand !== 'quark' || !showQuarkLogin) {
      return
    }

    let disposed = false
    const intervalId = window.setInterval(async () => {
      try {
        const response = await fetch(withBasePath('/api/system/netdisk/quark-auth/status'))
        const json = await response.json()
        if (!json.success || disposed) {
          return
        }

        const updatedAt = typeof json.data.updatedAt === 'string' ? Date.parse(json.data.updatedAt) : NaN
        const isFreshLogin = quarkLoginStartedAt === null || (!Number.isNaN(updatedAt) && updatedAt >= quarkLoginStartedAt)

        if (json.data.loginDetected && json.data.cookie && isFreshLogin) {
          setCredentialInput(json.data.cookie)
          setShowQuarkLogin(false)
          setQuarkLoginHint('已检测到登录 Cookie，正在自动配置...')

          const configureResponse = await fetch(withBasePath('/api/system/netdisk/configure'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand: 'quark', cookie: json.data.cookie })
          })
          const configureJson = await configureResponse.json()
          if (!configureJson.success) {
            alert(configureJson.error || '夸克自动配置失败')
            return
          }

          await handleRecheckMount()
        }
      } catch {
        // keep polling quietly while login page is open
      }
    }, 2000)

    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [brand, showQuarkLogin, quarkLoginStartedAt])

  const startQuarkWebLogin = async () => {
    try {
      setQuarkLoginHint('请在新窗口中完成夸克登录，登录成功后会自动配置')
      setShowQuarkLogin(true)
      setQuarkLoginStartedAt(Date.now())
      const basePath = window.location.pathname.startsWith('/clawos') ? '/clawos' : ''
      await startQuarkWebLoginFlow(window.open.bind(window), fetch, basePath)
    } catch (error: any) {
      alert(error.message || '无法启动夸克登录页')
    }
  }

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      alert(`已复制: ${value}`)
    } catch {
      alert(`复制失败，请手动复制: ${value}`)
    }
  }

  const statusTone = {
    mounted: {
      badge: 'bg-green-50 text-green-700 border-green-200',
      title: '已完成绑定，可以直接浏览文件',
      helper: `已检测到挂载点 ${targetPath}`
    },
    not_mounted: {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: '还没有完成绑定',
      helper: `当前还没有检测到挂载点 ${targetPath}`
    },
    auth_failed: {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: '底层挂载后台无法自动登录',
      helper: '通常是 AList 未启动，或管理员密码已经被手动改过。'
    },
    auth_expired: {
      badge: 'bg-amber-50 text-amber-700 border-amber-200',
      title: '底层挂载后台登录状态已过期',
      helper: '重新打开一次底层挂载后台后，再回来点“重新检测”即可。'
    },
    alist_unreachable: {
      badge: 'bg-red-50 text-red-700 border-red-200',
      title: '底层挂载后台当前不可用',
      helper: '请先确认 AList 服务本身已经启动。'
    },
    alist_error: {
      badge: 'bg-red-50 text-red-700 border-red-200',
      title: '底层挂载后台返回了错误',
      helper: '通常是挂载配置有误，建议重新检查存储配置。'
    }
  }[netdiskStatus?.status || 'not_mounted']
  const troubleshootingMessage = netdiskStatus && netdiskStatus.status !== 'mounted'
    ? guideData.troubleshooting[netdiskStatus.status]
    : ''

  const displayedFiles = files.filter(f => {
    const fileKind = getNetdiskFileKind(f)
    if (filterType === 'all') return true
    if (filterType === 'video') return fileKind === 'video' || fileKind === 'audio'
    if (filterType === 'image') return fileKind === 'image'
    if (filterType === 'document') return fileKind === 'document'
    return true
  }).sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1;
    if (!a.is_dir && b.is_dir) return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  })

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-3">
          {isBaidu ? <BaiduIcon className={`w-6 h-6 ${themeColors.text}`} /> : <QuarkIcon className={`w-6 h-6 ${themeColors.text}`} />}
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        </div>
        
        <div className="flex space-x-3">
          <button 
            onClick={handleOpenAlist}
            className={`flex items-center px-4 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-full text-sm font-medium transition-colors`}
          >
            <Cog6ToothIcon className="w-4 h-4 mr-1.5" /> 网盘设置
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden relative">
        {!statusLoading && netdiskStatus && !netdiskStatus.mounted ? (
          <div className="flex-1 overflow-auto bg-slate-50 p-8">
            <div className="max-w-xl mx-auto">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${statusTone.badge}`}>
                      {statusTone.title}
                    </div>
                    <h3 className="mt-3 text-2xl font-black text-slate-800">配置 {title}</h3>
                    <p className="mt-2 text-sm text-slate-500 leading-6">粘贴 `{guideData.credentialLabel}` 后自动挂载到 `{targetPath}`。</p>
                  </div>
                  <div className={`shrink-0 w-14 h-14 rounded-2xl ${themeColors.lightBg} flex items-center justify-center`}>
                    {isBaidu ? <BaiduIcon className={`w-8 h-8 ${themeColors.text}`} /> : <QuarkIcon className={`w-8 h-8 ${themeColors.text}`} />}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                  {netdiskStatus.message || statusTone.helper}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                    类型: {guideData.storageTypeLabel}
                  </span>
                  <button
                    onClick={() => copyText(guideData.storageTypeLabel)}
                    className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 rounded-full border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    复制类型
                  </button>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 font-mono">
                    路径: {targetPath}
                  </span>
                  <button
                    onClick={() => copyText(targetPath)}
                    className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 rounded-full border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    复制路径
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-3">{guideData.credentialLabel}</label>
                  <textarea
                    value={credentialInput}
                    onChange={(event) => setCredentialInput(event.target.value)}
                    placeholder={`请粘贴 ${guideData.credentialLabel}`}
                    className="w-full min-h-24 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleAutoConfigure}
                    disabled={configuring}
                    className={`px-5 py-2.5 ${themeColors.bg} ${themeColors.bgHover} text-white rounded-full font-medium transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {configuring ? '正在自动配置...' : `自动配置 ${title}`}
                  </button>
                  <button
                    onClick={handleRecheckMount}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-full font-medium hover:bg-slate-50 transition-colors"
                  >
                    重新检测
                  </button>
                  <button
                    onClick={handleOpenAlist}
                    className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-full font-medium hover:bg-slate-50 transition-colors"
                  >
                    高级：AList 后台（仅本机）
                  </button>
                  {brand === 'quark' && (
                    <button
                      onClick={startQuarkWebLogin}
                      className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-full font-medium hover:bg-slate-50 transition-colors"
                    >
                      夸克网页登录
                    </button>
                  )}
                </div>

                {brand === 'quark' && showQuarkLogin && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <p className="text-sm font-medium text-slate-700">{quarkLoginHint}</p>
                    <p className="text-xs text-slate-500 leading-6">如果浏览器拦截了新窗口，请允许弹窗后再点一次“夸克网页登录”。</p>
                  </div>
                )}

                <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">帮助</summary>
                  <div className="mt-4 space-y-4">
                    {guideData.credentialField === 'refreshToken' && (
                      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-sm font-semibold text-blue-800 mb-2">百度特别说明</p>
                        <p className="text-sm text-blue-900/80 leading-6">百度这里最终要填的是 `refresh_token`，不是普通 cookie。</p>
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-semibold text-slate-800 mb-2">怎么拿 {guideData.credentialLabel}</p>
                      <ol className="space-y-2 text-sm text-slate-600 leading-6 list-decimal pl-5">
                        {guideData.cookieGuide.recommended.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => window.open(guideData.officialSiteUrl, '_blank')}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-full text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        打开 {title} 官网
                      </button>
                      <button
                        onClick={() => window.open('https://cookie-editor.com/', '_blank')}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-full text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        打开 Cookie-Editor 官网
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-200">
                      <p className="text-sm text-slate-600 leading-6">{troubleshootingMessage}</p>
                    </div>

                    <div className="pt-1 border-t border-slate-200">
                      <p className="text-sm font-semibold text-slate-800 mb-2">AList 后台账号</p>
                      {netdiskStatus.localOnlyAdmin && (
                        <p className="text-xs text-amber-600 mb-3 leading-5">安全加固后，AList 后台只允许在这台机器本机打开。远程访问 ClawOS 时可以查看账号密码，但不能直接打开后台页面。</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-xs text-slate-500 mb-1">账号</p>
                          <p className="font-mono font-bold text-slate-800">{netdiskStatus.alistAdmin.username}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                          <p className="text-xs text-slate-500 mb-1">密码</p>
                          <p className="font-mono font-bold text-slate-800">{netdiskStatus.alistAdmin.password}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Sidebar */}
            <div className="w-56 bg-white border-r border-slate-200 flex flex-col py-4">
              <div className="px-3 space-y-1">
                <div 
                  onClick={() => setFilterType('all')}
                  className={`flex items-center px-3 py-2 ${filterType === 'all' ? `${themeColors.lightBg} ${themeColors.text} font-medium` : 'text-slate-600 hover:bg-slate-50'} rounded-lg cursor-pointer transition-colors`}
                >
                  <FolderIcon className="w-5 h-5 mr-3 opacity-80" /> 全部文件
                </div>
                <div 
                  onClick={() => setFilterType('image')}
                  className={`flex items-center px-3 py-2 ${filterType === 'image' ? `${themeColors.lightBg} ${themeColors.text} font-medium` : 'text-slate-600 hover:bg-slate-50'} rounded-lg cursor-pointer transition-colors`}
                >
                  <PhotoIcon className="w-5 h-5 mr-3 opacity-60" /> 图片
                </div>
                <div 
                  onClick={() => setFilterType('document')}
                  className={`flex items-center px-3 py-2 ${filterType === 'document' ? `${themeColors.lightBg} ${themeColors.text} font-medium` : 'text-slate-600 hover:bg-slate-50'} rounded-lg cursor-pointer transition-colors`}
                >
                  <DocumentIcon className="w-5 h-5 mr-3 opacity-60" /> 文档
                </div>
                <div 
                  onClick={() => setFilterType('video')}
                  className={`flex items-center px-3 py-2 ${filterType === 'video' ? `${themeColors.lightBg} ${themeColors.text} font-medium` : 'text-slate-600 hover:bg-slate-50'} rounded-lg cursor-pointer transition-colors`}
                >
                  <PlayCircleIcon className="w-5 h-5 mr-3 opacity-60" /> 视频
                </div>
              </div>
              
              <div className="mt-auto px-6 py-4">
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>已用 2.4TB</span>
                  <span>共 5TB</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${themeColors.bg} w-[48%]`}></div>
                </div>
              </div>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-auto bg-white relative">
              <div className="px-6 py-4 flex items-center text-sm text-slate-500 border-b border-slate-100">
                <span 
                  className={`font-medium ${themeColors.text} cursor-pointer hover:underline`}
                  onClick={() => fetchFiles(targetPath)}
                >
                  全部文件
                </span>
                {currentPath !== targetPath && (
                  <>
                    <span className="mx-2">&gt;</span>
                    <div className="flex items-center space-x-1">
                      {currentPath.replace(targetPath + '/', '').split('/').map((part, index, arr) => {
                        const isLast = index === arr.length - 1
                        const breadcrumbPath = `${targetPath}/${arr.slice(0, index + 1).join('/')}`
                        return (
                          <span key={index} className="flex items-center">
                            <span 
                              className={`${isLast ? 'text-slate-700 font-medium' : `cursor-pointer hover:underline ${themeColors.text}`}`}
                              onClick={() => !isLast && fetchFiles(breadcrumbPath)}
                            >
                              {part}
                            </span>
                            {!isLast && <span className="mx-2 text-slate-400">/</span>}
                          </span>
                        )
                      })}
                    </div>
                  </>
                )}
                <div className="ml-auto flex items-center space-x-2">
                  <ArrowPathIcon 
                    className={`w-4 h-4 text-slate-400 cursor-pointer hover:${themeColors.text} ${loading ? 'animate-spin' : ''}`}
                    onClick={() => fetchFiles(currentPath)}
                  />
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  <ArrowPathIcon className="w-8 h-8 animate-spin mb-4" />
                  正在连接网盘...
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <ExclamationTriangleIcon className="w-12 h-12 text-amber-500 mb-4" />
                  <p className="text-lg font-medium text-slate-700 mb-2">尚未挂载或连接失败</p>
                  <p className="text-sm mb-6 max-w-md text-center">{error}</p>
                  <button 
                    onClick={handleOpenAlist}
                    className={`px-6 py-2 ${themeColors.bg} ${themeColors.bgHover} text-white rounded-full font-medium transition-colors`}
                  >
                    查看本机后台账号
                  </button>
                </div>
              ) : displayedFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                  {files.length === 0 ? '这里空空如也' : '没有匹配的文件'}
                </div>
              ) : (
                <div className="w-full pb-8">
                  <div className="grid grid-cols-12 gap-4 px-6 py-2 border-b border-slate-100 text-xs font-medium text-slate-400 sticky top-0 bg-white/90 backdrop-blur z-10">
                    <div className="col-span-6">文件名</div>
                    <div className="col-span-2">大小</div>
                    <div className="col-span-3">修改日期</div>
                    <div className="col-span-1"></div>
                  </div>
                  
                  {displayedFiles.map(file => (
                    <div 
                      key={file.name} 
                      className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-50 hover:bg-slate-50 text-sm transition-colors group items-center"
                      onDoubleClick={() => {
                        if (file.is_dir) {
                          const nextPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`
                          fetchFiles(nextPath)
                        }
                      }}
                    >
                      <div className="col-span-6 flex items-center pr-4 cursor-pointer">
                        {getFileIcon(file)}
                        <span className="ml-3 font-medium text-slate-700 group-hover:text-slate-900 truncate">{file.name}</span>
                      </div>
                      <div className="col-span-2 text-slate-500">{formatBytes(file.size)}</div>
                      <div className="col-span-3 text-slate-500">{new Date(file.modified).toLocaleString('zh-CN')}</div>
                      <div className="col-span-1 flex justify-end items-center opacity-0 group-hover:opacity-100 transition-opacity space-x-2">
                        {!file.is_dir && (
                          <CloudArrowDownIcon 
                            className={`w-5 h-5 ${themeColors.text} hover:scale-110 transition-transform cursor-pointer`} 
                            title="下载到本机" 
                            onClick={() => handleDownload(file)}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* AList Auth Modal */}
        {showAlistAuth && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[90%] border border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 mb-2">前往网盘配置后台</h3>
              <p className="text-sm text-slate-500 mb-4">
                你接下来要登录的是底层挂载后台 AList，不是 {title} 账号本身。登录后台后，再在里面添加 {title} 存储即可。
              </p>

              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 mb-4 text-xs text-amber-700 leading-5">
                这个后台现在只允许在本机打开。远程访问 ClawOS 时，这里主要用于查看账号和复制密码；如果要真正进入 AList 管理页，请在这台电脑本机浏览器打开 <span className="font-mono">{getAlistManageUrl()}</span>。
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 mb-4 text-xs text-blue-700 leading-5">
                进入后台后，优先记住两项：存储类型选“{guideData.storageTypeLabel}”，挂载路径填“{targetPath}”。
              </div>
              
              <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-slate-500 text-sm">账号</span>
                  <span className="font-mono font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">{netdiskStatus?.alistAdmin.username || 'admin'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 text-sm">密码</span>
                  <span className="font-mono font-bold text-slate-800 bg-white px-2 py-1 rounded border border-slate-200">{netdiskStatus?.alistAdmin.password || '(未配置)'}</span>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <button 
                  onClick={() => setShowAlistAuth(false)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={confirmOpenAlist}
                  className={`flex-1 py-2.5 ${themeColors.bg} text-white rounded-xl text-sm font-medium ${themeColors.bgHover} shadow-sm transition-colors`}
                >
                  复制密码并尝试打开本机后台
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
