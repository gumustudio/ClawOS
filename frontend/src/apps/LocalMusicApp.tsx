import { useState, useRef, useEffect } from 'react'
import { 
  PlayIcon, PauseIcon, ForwardIcon, BackwardIcon, 
  ArrowPathIcon, ArrowsRightLeftIcon, MusicalNoteIcon,
  ChevronDownIcon, ViewColumnsIcon
} from '@heroicons/react/24/solid'
import { motion, AnimatePresence } from 'framer-motion'
import { LocalMusicIcon } from "../components/Icons"
import DirSetting from '../components/DirSetting'
import { parseLrc } from '../utils/lyricParser'
import { getMetadataBadge } from '../utils/localMusicMeta'
import { clearMusicState, registerMusicCommandHandler, reportMusicState } from '../lib/musicBridge'
import { fetchServerPaths, saveServerPaths } from '../lib/serverPaths'

type PlayMode = 'sequence' | 'random' | 'single'

export interface LocalTrack {
  id: string
  path: string
  name: string
  artist: string
  album: string
  duration: number
  hasCover: boolean
  hasLocalLrc: boolean
  neteaseId?: number
  cachedCoverUrl?: string
  cachedLyric?: boolean
  metadataSource?: 'embedded' | 'netease-cache' | 'netease-live' | 'mixed'
  warmupFailed?: boolean
  warmupFailureReason?: string
  warmupAttempts?: number
  lastWarmupAt?: string
}

interface LyricLine {
  time: number
  text: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface WarmupStatus {
  scannedDir: string
  running: boolean
  total: number
  completed: number
  updated: number
  currentTrack: string
  lastRunAt: string | null
}

export default function LocalMusicApp() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [songs, setSongs] = useState<LocalTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [currentSong, setCurrentSong] = useState<LocalTrack | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [progress, setProgress] = useState(0)

  const [playMode, setPlayMode] = useState<PlayMode>('sequence')
  
  const [musicDir, setMusicDir] = useState('')
  
  // Immersive View States
  const [showImmersive, setShowImmersive] = useState(false)
  const [pureLyricMode, setPureLyricMode] = useState(false)
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)

  const [toasts, setToasts] = useState<Toast[]>([])
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatus | null>(null)
  
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }
  
  const audioRef = useRef<HTMLAudioElement>(null)
  const lyricsRef = useRef<HTMLDivElement>(null)
  const isUserScrollingRef = useRef(false)
  const userScrollTimeoutRef = useRef<number | null>(null)
  const lyricRequestIdRef = useRef(0)
  const activeSongIdRef = useRef<string | null>(null)
  const playbackTokenRef = useRef(0)
  const pendingSeekRef = useRef<{ songId: string; time: number } | null>(null)

  const waitForAudioSeekable = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.readyState >= 1) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const handleLoaded = () => {
        cleanup()
        resolve()
      }

      const handleError = () => {
        cleanup()
        reject(new Error('音频元数据加载失败'))
      }

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', handleLoaded)
        audio.removeEventListener('canplay', handleLoaded)
        audio.removeEventListener('error', handleError)
      }

      audio.addEventListener('loadedmetadata', handleLoaded, { once: true })
      audio.addEventListener('canplay', handleLoaded, { once: true })
      audio.addEventListener('error', handleError, { once: true })
    })
  }

  const maybeApplyPendingSeek = async () => {
    const pendingSeek = pendingSeekRef.current
    const audio = audioRef.current
    if (!pendingSeek || !audio || !currentSong) return
    if (pendingSeek.songId !== (currentSong as any).id) return

    try {
      await waitForAudioSeekable()
      audio.currentTime = pendingSeek.time
      pendingSeekRef.current = null
    } catch (error) {
      console.error(error)
    }
  }

  const playCurrentAudio = async (errorMessage: string) => {
    const audio = audioRef.current
    if (!audio) return false
    const playbackToken = ++playbackTokenRef.current

    try {
      await audio.play()
      if (playbackToken !== playbackTokenRef.current) {
        return false
      }
      setIsPlaying(true)
      void maybeApplyPendingSeek()
      return true
    } catch (error) {
      console.error(error)
      if (playbackToken !== playbackTokenRef.current) {
        return false
      }
      setIsPlaying(false)
      showToast(errorMessage, 'error')
      return false
    }
  }

  const handleUserInteraction = () => {
    isUserScrollingRef.current = true
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current)
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false
      // Auto-snap back to active lyric
      if (lyricsRef.current) {
        const scrollContainer = lyricsRef.current;
        const activeEl = scrollContainer.querySelector('.active-lyric') as HTMLElement
        if (activeEl) {
          const containerCenter = scrollContainer.clientHeight / 2;
          const elementOffset = activeEl.offsetTop + activeEl.clientHeight / 2;
          scrollContainer.scrollTo({
            top: elementOffset - containerCenter,
            behavior: 'smooth'
          })
        }
      }
    }, 3000)
  }

  useEffect(() => {
    fetchServerPaths()
      .then((paths) => setMusicDir(paths.localMusicDir))
      .catch((error) => console.error('Failed to load local music path config', error))
  }, [])

  const loadLibrary = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/system/localmusic/list', {
        headers: musicDir ? { 'x-music-dir': encodeURIComponent(musicDir) } : {}
      })
      const data = await res.json()
      if (data.success) {
        setSongs(data.data)
        if (data.needsScan) {
          showToast('当前目录尚未扫描，请点击“扫描目录”建立曲库', 'info')
        }
      }
    } catch (e) {
      console.error(e)
      showToast('加载曲库失败，请检查后端状态', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadWarmupStatus = async () => {
    try {
      const res = await fetch('/api/system/localmusic/warmup-status')
      const data = await res.json()
      if (data.success) {
        setWarmupStatus(data.data)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const scanLibrary = async () => {
    if (!musicDir) {
      showToast('请先配置本地音乐目录', 'error')
      return
    }
    setLoading(true)
    showToast('开始扫描目录，请稍候...', 'info')
    try {
      const res = await fetch('/api/system/localmusic/scan', {
        method: 'POST',
        headers: { 'x-music-dir': encodeURIComponent(musicDir) }
      })
      const data = await res.json()
      if (data.success) {
        setSongs(data.data)
        if (data.data.length > 0) {
          showToast(`扫描完成，共找到 ${data.data.length} 首歌曲`, 'success')
        } else {
          showToast(`扫描完成，该目录下没有发现支持的音频文件`, 'info')
        }
      } else {
        showToast(data.error || '扫描失败', 'error')
      }
    } catch (e) {
      console.error(e)
      showToast('网络请求失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMusicDirChange = async (nextDir: string) => {
    try {
      const paths = await saveServerPaths({ localMusicDir: nextDir.trim() })
      setMusicDir(paths.localMusicDir)
      window.dispatchEvent(new Event('localmusic-dir-updated'))
    } catch (error) {
      console.error('Failed to save local music path config', error)
      showToast('保存目录失败', 'error')
    }
  }

  useEffect(() => {
    loadLibrary()
    loadWarmupStatus()
    const handleDirUpdated = () => {
      fetchServerPaths()
        .then((paths) => {
          setMusicDir(paths.localMusicDir)
          setSongs([])
          setCurrentSong(null)
          activeSongIdRef.current = null
          setIsPlaying(false)
          pendingSeekRef.current = null
          showToast('目录配置已更新', 'success')
        })
        .catch((error) => console.error('Failed to refresh local music path config', error))
    }

    window.addEventListener('localmusic-dir-updated', handleDirUpdated)
    return () => {
      window.removeEventListener('localmusic-dir-updated', handleDirUpdated)
      lyricRequestIdRef.current += 1
      activeSongIdRef.current = null
      playbackTokenRef.current += 1
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    loadWarmupStatus()
    const interval = window.setInterval(() => {
      void loadWarmupStatus()
    }, 3000)

    return () => {
      window.clearInterval(interval)
    }
  }, [musicDir])

  const fetchLyrics = async (id: string) => {
    const requestId = ++lyricRequestIdRef.current
    try {
      const res = await fetch(`/api/system/localmusic/lyric/${id}`)
      const data = await res.json()
      if (requestId !== lyricRequestIdRef.current || activeSongIdRef.current !== id) {
        return
      }
      if (data.success && data.lyric) {
        setLyrics(parseLrc(data.lyric))
      } else {
        setLyrics([])
      }
    } catch (e) {
      if (requestId === lyricRequestIdRef.current && activeSongIdRef.current === id) {
        setLyrics([])
      }
    }
  }

  const playSong = (song: LocalTrack) => {
    playbackTokenRef.current += 1
    pendingSeekRef.current = null
    activeSongIdRef.current = song.id
    setCurrentSong(song)
    setIsPlaying(false)
    setLyrics([])
    setCurrentLyricIndex(-1)
    lyricRequestIdRef.current += 1
    reportMusicState({
      appId: 'localmusic',
      status: 'preparing',
      playing: false,
      title: song.name,
      artist: song.artist || '未知歌手',
      cover: song.hasCover ? `/api/system/localmusic/cover/${song.id}` : '',
      lyric: ''
    })

    if (audioRef.current) {
      audioRef.current.src = `/api/system/localmusic/stream/${song.id}`
      playCurrentAudio('本地文件播放失败，请检查音频文件是否损坏')
    }
    fetchLyrics(song.id)
  }

  const playNext = () => {
    if (songs.length === 0) return
    let nextIdx = 0
    const currentIdx = songs.findIndex(s => s.id === currentSong?.id)
    
    if (playMode === 'random') {
      nextIdx = Math.floor(Math.random() * songs.length)
    } else if (playMode === 'single') {
      if (audioRef.current && currentSong) {
        pendingSeekRef.current = { songId: (currentSong as any).id, time: 0 }
        handleSongReload()
        return
      }
      nextIdx = currentIdx !== -1 ? currentIdx : 0
    } else {
      nextIdx = currentIdx !== -1 ? (currentIdx + 1) % songs.length : 0
    }
    playSong(songs[nextIdx])
  }

  const playPrev = () => {
    if (songs.length === 0) return
    const currentIdx = songs.findIndex(s => s.id === currentSong?.id)
    let prevIdx = currentIdx !== -1 ? (currentIdx - 1 + songs.length) % songs.length : 0
    if (playMode === 'random') {
      prevIdx = Math.floor(Math.random() * songs.length)
    }
    playSong(songs[prevIdx])
  }

  const togglePlayMode = () => {
    if (playMode === 'sequence') setPlayMode('random')
    else if (playMode === 'random') setPlayMode('single')
    else setPlayMode('sequence')
  }

  const replayCurrentSong = () => {
    if (!currentSong || !audioRef.current) return
    pendingSeekRef.current = {
      songId: (currentSong as any).id,
      time: audioRef.current.currentTime || 0
    }
    playSong(currentSong)
  }

  const handleSongReload = () => {
    if (!currentSong) return
    replayCurrentSong()
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void loadLibrary()
      }
    }

    const handleFocus = () => {
      void loadLibrary()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [musicDir])

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      playCurrentAudio('继续播放失败，请手动再次点击播放')
    }
  }

  useEffect(() => {
    const lyricText = currentLyricIndex >= 0 && lyrics[currentLyricIndex] ? lyrics[currentLyricIndex].text : ''

    if (!currentSong) {
      clearMusicState('localmusic')
      return
    }

    reportMusicState({
      appId: 'localmusic',
      status: isPlaying ? 'playing' : 'paused',
      playing: isPlaying,
      title: currentSong.name,
      artist: currentSong.artist || '未知歌手',
      cover: currentSong.hasCover ? `/api/system/localmusic/cover/${currentSong.id}` : '',
      lyric: lyricText
    })
  }, [currentSong, isPlaying, currentLyricIndex, lyrics])

  useEffect(() => {
    return registerMusicCommandHandler('localmusic', (command) => {
      if (command === 'toggle') togglePlay()
      if (command === 'pause' && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
      }
      if (command === 'next') playNext()
      if (command === 'prev') playPrev()
    })
  }, [currentSong, isPlaying, togglePlay, playNext, playPrev])

  useEffect(() => {
    return () => {
      clearMusicState('localmusic')
    }
  }, [])

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const time = audioRef.current.currentTime
    const duration = audioRef.current.duration || 0
    setCurrentTime(time)
    if (duration > 0) {
      setProgress((time / duration) * 100)
    }

    // Sync lyrics
    if (lyrics.length > 0) {
      let idx = lyrics.findIndex(l => l.time > time) - 1
      if (idx === -2) idx = lyrics.length - 1 // if time > last lyric
      if (idx !== currentLyricIndex) {
        setCurrentLyricIndex(idx)
        // Scroll to lyric
        if (lyricsRef.current && idx >= 0 && !isUserScrollingRef.current) {
           const scrollContainer = lyricsRef.current;
           const el = scrollContainer.querySelector(`#lyric-${idx}`) as HTMLElement
           if (el) {
             const containerCenter = scrollContainer.clientHeight / 2;
             const elementOffset = el.offsetTop + el.clientHeight / 2;
             scrollContainer.scrollTo({
               top: elementOffset - containerCenter,
               behavior: 'smooth'
             })
           }
        }
      }
    }
  }

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00'
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = Math.floor(secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget
    if (!target.src.startsWith('data:image')) {
      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2394a3b8'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E"
      target.classList.add('bg-slate-100', 'p-2')
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 relative overflow-hidden">
      {/* Toast Container */}
      <div className="absolute top-20 right-6 z-[100] flex flex-col space-y-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`px-4 py-3 rounded-xl shadow-lg border backdrop-blur-md font-medium text-sm flex items-center ${
                toast.type === 'success' ? 'bg-green-50/90 text-green-700 border-green-200' :
                toast.type === 'error' ? 'bg-red-50/90 text-red-700 border-red-200' :
                'bg-white/90 text-slate-700 border-slate-200'
              }`}
            >
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <audio 
        ref={audioRef} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={() => {
          void maybeApplyPendingSeek()
        }}
        onError={() => {
          setIsPlaying(false)
          showToast('音频加载失败，请重新扫描或检查文件', 'error')
        }}
        onTimeUpdate={handleTimeUpdate} 
        onEnded={playNext} 
        className="hidden" 
      />
      
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 z-10 relative">
        <div className="flex items-center space-x-3">
          <LocalMusicIcon className="w-8 h-8" />
          <h2 className="text-lg font-bold text-slate-800">本地音乐 Pro</h2>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            onClick={scanLibrary}
            className="flex items-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
          >
            {loading ? <ArrowPathIcon className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ArrowPathIcon className="w-3.5 h-3.5 mr-1.5" />}
            扫描目录
          </button>
          <DirSetting 
            label="本地音乐目录" 
            value={musicDir} 
            onChange={(nextDir) => { void handleMusicDirChange(nextDir) }} 
            description="请输入存放音乐的绝对路径。后端将递归扫描此目录下的音频文件。"
          />
        </div>
      </div>

      {warmupStatus && warmupStatus.scannedDir === musicDir && (warmupStatus.running || warmupStatus.updated > 0) && (
        <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-700">
          <div className="flex items-center space-x-3 min-w-0">
            <span className="font-semibold whitespace-nowrap">元数据补全</span>
            <span className="whitespace-nowrap">{warmupStatus.completed}/{warmupStatus.total}</span>
            <span className="whitespace-nowrap">已更新 {warmupStatus.updated} 首</span>
            {warmupStatus.currentTrack && (
              <span className="truncate">当前: {warmupStatus.currentTrack}</span>
            )}
          </div>
          <div className="w-40 h-2 rounded-full bg-emerald-100 overflow-hidden flex-shrink-0">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${warmupStatus.total > 0 ? (warmupStatus.completed / warmupStatus.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Main Content (Library View) */}
      <div className="flex-1 overflow-auto bg-slate-50 p-6 pb-28 relative z-0">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">正在扫描解析音乐文件，请稍候...</div>
        ) : songs.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-48 text-slate-400">
             <ViewColumnsIcon className="w-12 h-12 mb-4 opacity-50" />
             <p>本地曲库空空如也，请配置目录并点击「扫描目录」</p>
           </div>
        ) : (
          <div className="w-full max-w-5xl mx-auto">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-slate-200 text-xs font-medium text-slate-400 mb-2">
              <div className="col-span-1">#</div>
              <div className="col-span-5">歌曲标题</div>
              <div className="col-span-3">歌手</div>
              <div className="col-span-2">专辑</div>
              <div className="col-span-1 text-right">时长</div>
            </div>
            {songs.map((song, idx) => {
              const isPlayingThis = currentSong?.id === song.id
              const metadataBadge = getMetadataBadge(song)
              return (
                <div 
                  key={song.id} 
                  onDoubleClick={() => playSong(song)}
                  className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-slate-100 hover:bg-[#31c27c]/10 text-sm transition-colors group items-center cursor-pointer rounded-lg ${isPlayingThis ? 'bg-[#31c27c]/10 text-[#31c27c]' : ''}`}
                >
                  <div className="col-span-1 text-slate-400 group-hover:hidden flex items-center justify-start h-full">
                    {isPlayingThis ? (
                      isPlaying ? (
                        <div className="flex items-end justify-center space-x-[2px] w-4 h-4 ml-0.5">
                          <div className="w-[3px] bg-[#31c27c] animate-eq-1 rounded-t-sm" style={{height: '50%'}}></div>
                          <div className="w-[3px] bg-[#31c27c] animate-eq-2 rounded-t-sm" style={{height: '100%'}}></div>
                          <div className="w-[3px] bg-[#31c27c] animate-eq-3 rounded-t-sm" style={{height: '30%'}}></div>
                        </div>
                      ) : (
                        <MusicalNoteIcon className="w-4 h-4 text-[#31c27c]" />
                      )
                    ) : idx + 1}
                  </div>
                  <div className="col-span-1 text-[#31c27c] hidden group-hover:flex items-center justify-start h-full" onClick={() => playSong(song)}>
                    <PlayIcon className="w-4 h-4 ml-0.5" />
                  </div>
                  <div className={`col-span-5 font-medium flex items-center pr-4 ${isPlayingThis ? 'text-[#31c27c]' : 'text-slate-800'}`}>
                    {song.hasCover ? (
                       <img src={`/api/system/localmusic/cover/${song.id}`} onError={handleImageError} className="w-8 h-8 rounded mr-3 object-cover shadow-sm" alt="cover" />
                    ) : (
                       <div className="w-8 h-8 rounded mr-3 bg-slate-200 flex items-center justify-center">
                         <MusicalNoteIcon className="w-4 h-4 text-slate-400" />
                       </div>
                    )}
                    <span className="truncate">{song.name}</span>
                    {metadataBadge && (
                      <span
                        className={`ml-2 px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${metadataBadge.className}`}
                        title={metadataBadge.title}
                      >
                        {metadataBadge.label}
                      </span>
                    )}
                  </div>
                  <div className={`col-span-3 truncate ${isPlayingThis ? 'text-[#31c27c]' : 'text-slate-500'}`}>{song.artist}</div>
                  <div className={`col-span-2 truncate ${isPlayingThis ? 'text-[#31c27c]' : 'text-slate-500'}`}>{song.album}</div>
                  <div className="col-span-1 text-right text-slate-400">{formatTime(song.duration)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Immersive View Overlay */}
      <AnimatePresence>
        {showImmersive && currentSong && (
          <motion.div 
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-40 bg-slate-900 text-white overflow-hidden flex flex-col"
          >
            {/* Blurred Background with Crossfade and Gradient Overlay */}
            <div className="absolute inset-0 z-0 bg-slate-900 overflow-hidden">
              <AnimatePresence>
                <motion.div 
                  key={(currentSong as any).id}
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 0.5, scale: 1.25 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="absolute inset-0 bg-cover bg-center blur-[80px]"
                  style={{ backgroundImage: `url(/api/system/localmusic/cover/${(currentSong as any).id})` }}
                />
              </AnimatePresence>
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-slate-900/50 to-slate-900/95 z-10 pointer-events-none" />
            </div>
            
            {/* Header */}
            <div className="h-20 flex items-center justify-between px-8 z-20">
              <button 
                onClick={() => setShowImmersive(false)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center backdrop-blur-xl transition-all shadow-lg"
              >
                <ChevronDownIcon className="w-6 h-6 text-white drop-shadow-md" />
              </button>

              <button 
                onClick={() => setPureLyricMode(!pureLyricMode)}
                className={`px-5 py-2 rounded-full backdrop-blur-xl transition-all duration-500 text-sm font-bold border shadow-lg ${pureLyricMode ? 'bg-white/20 border-white/40 text-white shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/15 hover:text-white'}`}
              >
                {pureLyricMode ? '退出纯净模式' : '纯净歌词模式'}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 flex px-12 lg:px-24 pb-28 z-20 transition-all duration-700 h-full overflow-hidden">
              {/* Left: Cover Art */}
              <div className={`flex flex-col items-center justify-center transition-all duration-[800ms] overflow-hidden ${pureLyricMode ? 'w-0 opacity-0 scale-75 m-0' : 'flex-1 opacity-100 scale-100'}`}>
                <motion.div 
                  animate={isPlaying ? { 
                    scale: [1, 1.02, 1], 
                    boxShadow: ["0 25px 50px -12px rgba(0,0,0,0.5)", "0 35px 60px -15px rgba(255,255,255,0.15)", "0 25px 50px -12px rgba(0,0,0,0.5)"] 
                  } : { scale: 0.95, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.5)" }}
                  transition={{ duration: isPlaying ? 5 : 0.5, repeat: isPlaying ? Infinity : 0, ease: "easeInOut" }}
                  className="w-[320px] h-[320px] xl:w-[420px] xl:h-[420px] rounded-3xl shadow-2xl overflow-hidden bg-slate-800 flex-shrink-0 border border-white/10 relative"
                >
                  {(currentSong as any).hasCover ? (
                    <img src={`/api/system/localmusic/cover/${(currentSong as any).id}`} onError={handleImageError} className="w-full h-full object-cover" alt="cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800/80">
                      <MusicalNoteIcon className="w-32 h-32 text-slate-500" />
                    </div>
                  )}
                  {/* Glass reflection overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 pointer-events-none rounded-3xl" />
                </motion.div>
                <div className="mt-10 text-center max-w-[400px]">
                  <h1 className="text-4xl font-extrabold text-white mb-3 truncate drop-shadow-lg" title={(currentSong as any).name}>{(currentSong as any).name}</h1>
                  <p className="text-xl text-white/70 truncate font-medium drop-shadow-md" title={`${(currentSong as any).artist} - ${currentSong.album}`}>{(currentSong as any).artist} - {currentSong.album}</p>
                </div>
              </div>

              {/* Right: Lyrics */}
              <div className={`flex items-center justify-center overflow-hidden transition-all duration-[800ms] relative h-full ${pureLyricMode ? 'flex-[2] max-w-5xl mx-auto' : 'flex-1'}`}>
                <div 
                  ref={lyricsRef}
                  onWheel={handleUserInteraction}
                  onTouchMove={handleUserInteraction}
                  className="w-full h-full overflow-y-auto no-scrollbar mask-image-y relative"
                  style={{
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)'
                  }}
                >
                  {lyrics.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-white/40 text-lg">
                      纯音乐，请欣赏
                    </div>
                  ) : (
                    <div className="space-y-10 text-center px-4 w-full" style={{ padding: '50vh 0' }}>
                      {lyrics.map((lrc, i) => {
                        const isActive = i === currentLyricIndex;
                        const distance = Math.abs(i - currentLyricIndex);
                        const isAdjacent = distance === 1;

                        return (
                          <div 
                            key={i} 
                            id={`lyric-${i}`}
                            className={`transition-all duration-[800ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] origin-center ${
                              isActive 
                                ? `active-lyric text-white ${pureLyricMode ? 'text-[52px]' : 'text-[44px]'} leading-snug font-black opacity-100 blur-none drop-shadow-[0_0_24px_rgba(255,255,255,0.4)] scale-100` 
                                : isAdjacent
                                  ? `text-white/60 ${pureLyricMode ? 'text-[36px]' : 'text-[30px]'} leading-snug font-bold opacity-60 blur-[1px] scale-95 hover:text-white/80 cursor-pointer`
                                  : `text-white/30 ${pureLyricMode ? 'text-[28px]' : 'text-[22px]'} leading-snug font-semibold opacity-30 blur-[2.5px] scale-90 hover:text-white/60 cursor-pointer`
                            }`}
                            onClick={() => {
                              if (audioRef.current) audioRef.current.currentTime = lrc.time
                            }}
                          >
                            {lrc.text}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Mini Player */}
      <div className={`absolute bottom-0 left-0 right-0 h-20 ${showImmersive ? 'bg-transparent text-white' : 'bg-white/95 text-slate-800 backdrop-blur-xl border-t border-slate-200'} flex items-center justify-between px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-50 transition-colors duration-500`}>
        <div 
          className="flex items-center space-x-4 w-64 cursor-pointer group"
          onClick={() => currentSong && setShowImmersive(!showImmersive)}
        >
          <div className={`w-12 h-12 rounded-md shadow-inner flex items-center justify-center relative overflow-hidden flex-shrink-0 transition-colors duration-500 ${
             (!currentSong || !(currentSong as any).hasCover) 
               ? (showImmersive ? 'bg-slate-800' : 'bg-slate-200') 
               : 'bg-gradient-to-br from-[#31c27c] to-[#1e9960]'
          }`}>
             {currentSong && (currentSong as any).hasCover && (
                <img src={`/api/system/localmusic/cover/${(currentSong as any).id}`} onError={handleImageError} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform" />
             )}
             {(!currentSong || !(currentSong as any).hasCover) && (
               <MusicalNoteIcon className={`w-6 h-6 z-10 transition-colors duration-500 ${showImmersive ? 'text-slate-500' : 'text-slate-400'}`} />
             )}
             {/* Hover indicator for Immersive view */}
             <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20">
               {showImmersive ? <ChevronDownIcon className="w-5 h-5 text-white" /> : <ArrowsRightLeftIcon className="w-5 h-5 text-white rotate-45" />}
             </div>
          </div>
          <div className="truncate">
            <div className={`text-sm font-bold truncate ${showImmersive ? 'text-white' : 'text-slate-800'}`} title={currentSong?.name}>{currentSong?.name || '本地音乐'}</div>
            <div className={`text-xs truncate ${showImmersive ? 'text-white/60' : 'text-slate-500'}`}>{currentSong?.artist || '听你想听'}</div>
          </div>
        </div>
        
        <div className="flex flex-col items-center flex-1 max-w-lg">
          <div className="flex items-center space-x-6 mb-1.5">
            {/* Play Mode Toggle */}
            <button onClick={togglePlayMode} className={`${showImmersive ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-[#31c27c]'} transition-colors`} title={playMode === 'sequence' ? '顺序播放' : playMode === 'random' ? '随机播放' : '单曲循环'}>
              {playMode === 'sequence' ? (
                <div className="flex items-center text-[10px] font-bold"><ArrowPathIcon className="w-4 h-4 mr-0.5" /> 顺</div>
              ) : playMode === 'random' ? (
                <div className="flex items-center text-[10px] font-bold"><ArrowsRightLeftIcon className="w-4 h-4 mr-0.5" /> 随</div>
              ) : (
                <div className="flex items-center text-[10px] font-bold"><ArrowPathIcon className="w-4 h-4 mr-0.5 text-[#31c27c]" /> 单</div>
              )}
            </button>
            
            <BackwardIcon className={`w-5 h-5 cursor-pointer transition-colors ${showImmersive ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-[#31c27c]'}`} onClick={playPrev} />
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors ${showImmersive ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm' : 'bg-[#31c27c]/10 hover:bg-[#31c27c]/20'}`}
              onClick={togglePlay}
            >
              {isPlaying ? (
                <PauseIcon className={`w-5 h-5 ${showImmersive ? 'text-white' : 'text-[#31c27c]'}`} />
              ) : (
                <PlayIcon className={`w-5 h-5 ml-0.5 ${showImmersive ? 'text-white' : 'text-[#31c27c]'}`} />
              )}
            </div>
            <ForwardIcon className={`w-5 h-5 cursor-pointer transition-colors ${showImmersive ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-[#31c27c]'}`} onClick={playNext} />
          </div>
          <div className={`flex items-center w-full space-x-3 text-xs font-medium ${showImmersive ? 'text-white/60' : 'text-slate-400'}`}>
            <span>{formatTime(currentTime)}</span>
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer group relative ${showImmersive ? 'bg-white/20' : 'bg-slate-200'}`} onClick={(e) => {
              if(!audioRef.current || !currentSong) return;
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              audioRef.current.currentTime = pct * (audioRef.current.duration || 0)
            }}>
              <div 
                className={`h-full relative ${showImmersive ? 'bg-white group-hover:bg-white/90' : 'bg-[#31c27c] group-hover:bg-[#28a76a]'}`}
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100"></div>
              </div>
            </div>
            <span>{formatTime(currentSong?.duration || 0)}</span>
          </div>
        </div>

        <div className="w-64 flex justify-end items-center space-x-4">
          <div className={`text-xs font-bold px-2 py-0.5 rounded border ${showImmersive ? 'border-white/30 text-white/60' : 'border-slate-200 text-slate-400'}`}>
            本地 HQ
          </div>
        </div>
      </div>
      
      {/* Scrollbar hide style and keyframes */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes eq {
          0% { height: 30%; }
          100% { height: 100%; }
        }
        .animate-eq-1 { animation: eq 0.6s ease-in-out infinite alternate; }
        .animate-eq-2 { animation: eq 0.6s ease-in-out infinite alternate 0.2s; }
        .animate-eq-3 { animation: eq 0.6s ease-in-out infinite alternate 0.4s; }
      `}</style>
    </div>
  )
}
