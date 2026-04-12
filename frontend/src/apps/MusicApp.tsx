import { useState, useRef, useEffect } from 'react'
import { 
  PlayIcon, PauseIcon, ForwardIcon, BackwardIcon, 
  ArrowDownTrayIcon, MagnifyingGlassIcon, ArrowPathIcon,
  ArrowsRightLeftIcon, MusicalNoteIcon,
  ChevronDownIcon, CheckCircleIcon
} from '@heroicons/react/24/solid'
import { motion, AnimatePresence } from 'framer-motion'
import { NeteaseIcon } from '../components/Icons'

import DirSetting from '../components/DirSetting'
import { parseLrc } from '../utils/lyricParser'
import { clearMusicState, registerMusicCommandHandler, reportMusicState } from '../lib/musicBridge'
import { fetchServerPaths, saveServerPaths } from '../lib/serverPaths'
import { fetchServerUiConfig, saveServerUiConfig } from '../lib/serverUiConfig'
import { getCachedSongsForView, hasCachedMusicContent, isMusicViewStale, makePlaylistViewKey, makeSearchViewKey, pickPlaylistToRefresh, readMusicViewCache, setCachedSongsForView, setViewUpdatedAt, touchRecentValues, writeMusicViewCache } from './musicViewCache'

type PlayMode = 'sequence' | 'random' | 'single'

interface LyricLine {
  time: number
  text: string
}

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface SongItem {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  cover?: string
}

interface PlaylistItem {
  id: string
  name: string
  creator: {
    userId: number
  }
}

interface UserProfile {
  userId: number
  nickname: string
  avatarUrl: string
}

interface DownloadedTrack {
  filename: string
  baseName: string
  normalizedName: string
  extension: string
  songIds: string[]
}

type PlaybackSource = 'remote' | 'local'

interface PendingSeek {
  songId: string
  source: PlaybackSource
  time: number
}

const normalizeSongName = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s._\-()[\]{}【】（）'"`~!@#$%^&*+=|\\/:;<>,?，。！？、·]+/g, '')

export default function MusicApp({ isActive = true }: { isActive?: boolean }) {
  const cachedView = readMusicViewCache()
  const initialActiveTab = cachedView?.activeTab ?? 'search'
  const initialActiveViewKey = cachedView?.activeViewKey ?? makeSearchViewKey(cachedView?.keyword ?? '')
  const [isPlaying, setIsPlaying] = useState(false)
  const [keyword, setKeyword] = useState(cachedView?.keyword ?? '')
  const [searchInput, setSearchInput] = useState(cachedView?.keyword ?? '')
  const [songsByView, setSongsByView] = useState<Record<string, SongItem[]>>(cachedView?.songsByView ?? {})
  const [viewUpdatedAt, setViewUpdatedAtState] = useState<Record<string, number>>(cachedView?.viewUpdatedAt ?? {})
  const [recentSearches, setRecentSearches] = useState<string[]>(cachedView?.recentSearches ?? [])
  const [recentViewKeys, setRecentViewKeys] = useState<string[]>(cachedView?.recentViewKeys ?? [])
  const [songs, setSongs] = useState<SongItem[]>(getCachedSongsForView(cachedView, initialActiveViewKey))
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [currentSong, setCurrentSong] = useState<SongItem | null>(null)
  const [currentTime, setCurrentTime] = useState('00:00')
  const [progress, setProgress] = useState(0)

  // Immersive View States
  const [showImmersive, setShowImmersive] = useState(false)
  const [pureLyricMode, setPureLyricMode] = useState(false)
  const [lyrics, setLyrics] = useState<LyricLine[]>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const isUserScrollingRef = useRef(false)
  const userScrollTimeoutRef = useRef<number | null>(null)
  const lyricsRef = useRef<HTMLDivElement>(null)

  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const handleUserInteraction = () => {
    isUserScrollingRef.current = true
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current)
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false
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

  const fetchLyrics = async (id: string) => {
    const requestId = ++lyricRequestIdRef.current
    try {
      const res = await fetch(`/api/system/music/lyric?id=${id}`)
      const data = await res.json()
      if (requestId !== lyricRequestIdRef.current || activeSongIdRef.current !== id) {
        return
      }
      if (data.success && data.data) {
        setLyrics(parseLrc(data.data))
      } else {
        setLyrics([])
      }
    } catch (e) {
      if (requestId === lyricRequestIdRef.current && activeSongIdRef.current === id) {
        setLyrics([])
      }
    }
  }

  const fetchSongDetail = async (song: SongItem) => {
    if (song.cover || pendingCoverIdsRef.current.has(song.id)) return

    pendingCoverIdsRef.current.add(song.id)
    try {
      const res = await fetch(`/api/system/music/detail?id=${song.id}`)
      const data = await res.json()
      if (!data.success || !data.data?.cover) {
        return
      }

      setSongs(prev => prev.map(item => item.id === song.id ? { ...item, cover: data.data.cover } : item))
      setCurrentSong(prev => prev?.id === song.id ? { ...prev, cover: data.data.cover } : prev)
    } catch (error) {
      console.error(error)
    } finally {
      pendingCoverIdsRef.current.delete(song.id)
    }
  }

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget
    if (!target.src.startsWith('data:image')) {
      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23f43f5e'%3E%3Cpath d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/%3E%3C/svg%3E"
      target.classList.add('bg-rose-50', 'p-2')
    }
  }

  // New states for enhancements
  const [playMode, setPlayMode] = useState<PlayMode>('sequence')
  const [quality, setQuality] = useState('lossless') // standard, exhigh, lossless, hires
  
  // Netease specific states
  const [userInfo, setUserInfo] = useState<UserProfile | null>(cachedView?.userInfo ?? null)
  const [playlists, setPlaylists] = useState<PlaylistItem[]>(cachedView?.playlists ?? [])
  const [activeTab, setActiveTab] = useState<string>(initialActiveTab) // 'search' or playlist id
  const [activeViewKey, setActiveViewKey] = useState<string>(initialActiveViewKey)

  const [downloadDir, setDownloadDir] = useState('')
  const [downloadedFiles, setDownloadedFiles] = useState<DownloadedTrack[]>([])
  const [resolvedDir, setResolvedDir] = useState<string>('')
  const [uiConfigReady, setUiConfigReady] = useState(false)

  const audioRef = useRef<HTMLAudioElement>(null)
  const lyricRequestIdRef = useRef(0)
  const activeSongIdRef = useRef<string | null>(null)
  const pendingCoverIdsRef = useRef<Set<string>>(new Set())
  const playbackTokenRef = useRef(0)
  const currentSourceRef = useRef<PlaybackSource>('remote')
  const pendingSeekRef = useRef<PendingSeek | null>(null)
  const downloadRefreshTimersRef = useRef<number[]>([])
  const searchDebounceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        clearTimeout(userScrollTimeoutRef.current)
      }
      downloadRefreshTimersRef.current.forEach(timer => clearTimeout(timer))
      downloadRefreshTimersRef.current = []
      lyricRequestIdRef.current += 1
      pendingCoverIdsRef.current.clear()
      playbackTokenRef.current += 1
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const missingCoverSongs = songs.filter(song => !song.cover)
    missingCoverSongs.forEach(song => {
      void fetchSongDetail(song)
    })
  }, [songs])

  useEffect(() => {
    if (!isActive) return
    void fetchDownloaded()
  }, [isActive])

  const fetchDownloaded = async () => {
    try {
      const res = await fetch(`/api/system/music/downloaded?dir=${encodeURIComponent(downloadDir)}`)
      const data = await res.json()
      if (data.success) {
        setDownloadedFiles(Array.isArray(data.data) ? data.data : [])
        setResolvedDir(data.dir || '')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const getDownloadedTrack = (song: SongItem) => {
    const songIdMatch = downloadedFiles.find(track => track.songIds.includes(song.id))
    if (songIdMatch) {
      return songIdMatch
    }

    const candidates = [
      `${song.title} - ${song.artist}`,
      `${song.title}-${song.artist}`,
      song.title
    ].map(normalizeSongName)

    return downloadedFiles.find(track => candidates.includes(track.normalizedName))
  }

  const refreshDownloadedTracks = () => {
    downloadRefreshTimersRef.current.forEach(timer => clearTimeout(timer))
    downloadRefreshTimersRef.current = [2000, 5000, 10000].map(delay => window.setTimeout(() => {
      void fetchDownloaded()
    }, delay))
  }

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
    if (pendingSeek.songId !== currentSong.id || pendingSeek.source !== currentSourceRef.current) return

    try {
      await waitForAudioSeekable()
      audio.currentTime = pendingSeek.time
      pendingSeekRef.current = null
    } catch (error) {
      console.error(error)
    }
  }

  const startPlayback = async (src: string, source: PlaybackSource, errorMessage: string) => {
    const audio = audioRef.current
    if (!audio) return false

    const playbackToken = ++playbackTokenRef.current

    try {
      currentSourceRef.current = source
      audio.src = src
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

  useEffect(() => {
    fetchServerPaths()
      .then((paths) => setDownloadDir(paths.musicDownloadsDir))
      .catch((error) => console.error('Failed to load music path config', error))
  }, [])

  useEffect(() => {
    fetchServerUiConfig()
      .then((ui) => {
        setQuality(ui.musicQuality)
      })
      .catch((error) => console.error('Failed to load music UI config', error))
      .finally(() => {
        setUiConfigReady(true)
      })
  }, [])

  useEffect(() => {
    fetchDownloaded()
  }, [downloadDir])

  const handleMusicDownloadDirChange = async (nextDir: string) => {
    try {
      const paths = await saveServerPaths({ musicDownloadsDir: nextDir.trim() })
      setDownloadDir(paths.musicDownloadsDir)
    } catch (error) {
      console.error('Failed to save music path config', error)
      showToast('保存音乐目录失败', 'error')
    }
  }

  useEffect(() => {
    if (!uiConfigReady) {
      return
    }

    saveServerUiConfig({ musicQuality: quality }).catch((error) => {
      console.error('Failed to save music UI config', error)
    })
  }, [quality, uiConfigReady])

  useEffect(() => {
    fetchDownloaded()
  }, [songs, activeTab])

  useEffect(() => {
    writeMusicViewCache({
      keyword,
      activeTab,
      activeViewKey,
      songsByView,
      viewUpdatedAt,
      recentSearches,
      recentViewKeys,
      playlists,
      userInfo,
    })
  }, [keyword, activeTab, activeViewKey, songsByView, viewUpdatedAt, recentSearches, recentViewKeys, playlists, userInfo])

  useEffect(() => {
    setSongs(songsByView[activeViewKey] ?? [])
  }, [activeViewKey, songsByView])

  useEffect(() => {
    setRecentViewKeys((previous) => touchRecentValues(previous, activeViewKey, 6))
  }, [activeViewKey])

  const buildCacheSnapshot = () => ({
    keyword,
    activeTab,
    activeViewKey,
    songsByView,
    viewUpdatedAt,
    recentSearches,
    recentViewKeys,
    playlists,
    userInfo,
    updatedAt: Date.now(),
  })

  const runSearch = async (query: string, options?: { background?: boolean }) => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return
    }

    const viewKey = makeSearchViewKey(normalizedQuery)
    const cachedSongs = songsByView[viewKey] ?? []
    const background = options?.background ?? false

    setKeyword(normalizedQuery)
    setSearchInput(normalizedQuery)
    setActiveTab('search')
    setActiveViewKey(viewKey)
    setSongs(cachedSongs)
    setRecentSearches((previous) => touchRecentValues(previous, normalizedQuery, 8))
    setLoading(!background && cachedSongs.length === 0)
    setRefreshing(background || cachedSongs.length > 0)

    try {
      const res = await fetch(`/api/system/music/search?keyword=${encodeURIComponent(normalizedQuery)}`)
      const data = await res.json()
      if (data.success) {
        setSongsByView((previous) => setCachedSongsForView(previous, viewKey, data.data))
        setViewUpdatedAtState((previous) => setViewUpdatedAt(previous, viewKey))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const refreshPlaylistView = async (id: string, options?: { background?: boolean; preserveActiveSelection?: boolean }) => {
    const background = options?.background ?? false
    const preserveActiveSelection = options?.preserveActiveSelection ?? false
    const viewKey = makePlaylistViewKey(id)
    const cachedSongs = songsByView[viewKey] ?? []

    if (!preserveActiveSelection) {
      setActiveTab(id)
      setActiveViewKey(viewKey)
      setSongs(cachedSongs)
    }

    setLoading(!background && cachedSongs.length === 0)
    setRefreshing(background || cachedSongs.length > 0)

    try {
      const res = await fetch(`/api/system/music/playlist/tracks?id=${id}`)
      const data = await res.json()
      if (data.success) {
        setSongsByView((previous) => setCachedSongsForView(previous, viewKey, data.data))
        setViewUpdatedAtState((previous) => setViewUpdatedAt(previous, viewKey))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const openPlaylist = (playlistId: string) => {
    const viewKey = makePlaylistViewKey(playlistId)
    const cachedSongs = songsByView[viewKey] ?? []
    setActiveTab(playlistId)
    setActiveViewKey(viewKey)
    setSongs(cachedSongs)

    if (isMusicViewStale(buildCacheSnapshot(), viewKey)) {
      void refreshPlaylistView(playlistId, { background: cachedSongs.length > 0 })
    }
  }

  useEffect(() => {
    if (!isActive) {
      return
    }

    const preheatViewKeys = recentViewKeys.filter((viewKey) => viewKey !== activeViewKey).slice(0, 2)
    preheatViewKeys.forEach((viewKey) => {
      if (!viewKey.startsWith('playlist:')) {
        return
      }
      if (!isMusicViewStale(buildCacheSnapshot(), viewKey)) {
        return
      }

      void refreshPlaylistView(viewKey.replace('playlist:', ''), { background: true, preserveActiveSelection: true })
    })
  }, [isActive, activeViewKey, recentViewKeys, keyword, activeTab, songsByView, viewUpdatedAt, recentSearches, playlists, userInfo])

  useEffect(() => {
    if (activeTab !== 'search') {
      return
    }

    const normalizedInput = searchInput.trim()
    if (!normalizedInput || normalizedInput === keyword) {
      return
    }

    const viewKey = makeSearchViewKey(normalizedInput)
    const cachedSongs = songsByView[viewKey] ?? []
    setActiveViewKey(viewKey)
    setSongs(cachedSongs)

    if (searchDebounceTimerRef.current) {
      clearTimeout(searchDebounceTimerRef.current)
    }

    searchDebounceTimerRef.current = window.setTimeout(() => {
      void runSearch(normalizedInput, { background: cachedSongs.length > 0 })
    }, 280)

    return () => {
      if (searchDebounceTimerRef.current) {
        clearTimeout(searchDebounceTimerRef.current)
      }
    }
  }, [searchInput, activeTab, keyword, songsByView])

  const loadUserInfo = () => {
    fetch('/api/system/music/me')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.profile) {
          setUserInfo(data.data.profile)
          setPlaylists(data.data.playlists || [])
          const targetPlaylistId = pickPlaylistToRefresh(activeTab, data.data.playlists || [])
          if (targetPlaylistId) {
            void refreshPlaylistView(targetPlaylistId, { background: hasCachedMusicContent(cachedView) && activeTab === targetPlaylistId })
          }
        } else {
          setUserInfo(null)
          setPlaylists([])
          setSongsByView({})
          setViewUpdatedAtState({})
          setSongs([])
        }
      })
      .catch((error) => {
        console.error(error)
      })
  }

  useEffect(() => {
    loadUserInfo()
    window.addEventListener('netease-cookie-updated', loadUserInfo)
    return () => window.removeEventListener('netease-cookie-updated', loadUserInfo)
  }, [])

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    await runSearch(searchInput)
  }

  const playSong = async (song: SongItem, overrideQuality?: string) => {
    playbackTokenRef.current += 1
    pendingSeekRef.current = null
    activeSongIdRef.current = song.id
    setCurrentSong(song)
    setIsPlaying(false)
    setLyrics([])
    setCurrentLyricIndex(-1)
    lyricRequestIdRef.current += 1
    reportMusicState({
      appId: 'music',
      status: 'preparing',
      playing: false,
      title: song.title,
      artist: song.artist || '未知歌手',
      cover: song.cover || '',
      lyric: ''
    })
    void fetchSongDetail(song)
    
    // Check if downloaded
    const localTrack = getDownloadedTrack(song)
    if (localTrack && resolvedDir) {
      const started = await startPlayback(
        `/api/system/music/stream_local?dir=${encodeURIComponent(resolvedDir)}&filename=${encodeURIComponent(localTrack.filename)}`,
        'local',
        '本地文件播放失败，请检查文件是否仍然存在'
      )
      if (!started) {
        return
      }
      fetchLyrics(song.id)
      return
    }

    const targetQuality = overrideQuality || quality
    try {
      const res = await fetch(`/api/system/music/play?id=${song.id}&level=${targetQuality}`)
      const data = await res.json()
      if (data.success && data.data.url) {
        const started = await startPlayback(
          data.data.url,
          'remote',
          '播放失败，可能是浏览器阻止自动播放或链接已失效'
        )
        if (started) {
          fetchLyrics(song.id)
        }
      } else {
        showToast('无法获取该音质的播放链接，可能需要会员或版权受限', 'error')
        setIsPlaying(false)
      }
    } catch (e) {
      console.error(e)
      showToast('播放出错', 'error')
      setIsPlaying(false)
    }
  }

  // Playback control logic
  const playNext = () => {
    if (songs.length === 0) return
    let nextIdx = 0
    const currentIdx = songs.findIndex(s => s.id === currentSong?.id)
    
    if (playMode === 'random') {
      nextIdx = Math.floor(Math.random() * songs.length)
    } else if (playMode === 'single') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch((error) => {
          console.error(error)
          setIsPlaying(false)
          showToast('重新播放失败，请稍后重试', 'error')
        })
        return
      }
      nextIdx = currentIdx !== -1 ? currentIdx : 0
    } else {
      // sequence
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

  const handleQualityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newQ = e.target.value
    setQuality(newQ)
    if (currentSong) {
      const ct = audioRef.current?.currentTime || 0
      pendingSeekRef.current = {
        songId: currentSong.id,
        source: getDownloadedTrack(currentSong) && resolvedDir ? 'local' : 'remote',
        time: ct
      }
      void playSong(currentSong, newQ)
    }
  }

  const togglePlay = () => {
    if (!audioRef.current || !currentSong) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch((error) => {
        console.error(error)
        setIsPlaying(false)
        showToast('继续播放失败，请手动再次点击播放', 'error')
      })
    }
  }

  useEffect(() => {
    const lyricText = currentLyricIndex >= 0 && lyrics[currentLyricIndex] ? lyrics[currentLyricIndex].text : ''

    if (!currentSong) {
      clearMusicState('music')
      return
    }

    reportMusicState({
      appId: 'music',
      status: isPlaying ? 'playing' : 'paused',
      playing: isPlaying,
      title: currentSong.title,
      artist: currentSong.artist || '未知歌手',
      cover: currentSong.cover || '',
      lyric: lyricText
    })
  }, [currentSong, isPlaying, currentLyricIndex, lyrics])

  useEffect(() => {
    return registerMusicCommandHandler('music', (command) => {
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
      clearMusicState('music')
    }
  }, [])

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const time = audioRef.current.currentTime
    const duration = audioRef.current.duration || 0
    if (!Number.isFinite(time) || !Number.isFinite(duration)) return
    const m = Math.floor(time / 60).toString().padStart(2, '0')
    const s = Math.floor(time % 60).toString().padStart(2, '0')
    setCurrentTime(`${m}:${s}`)
    if (duration > 0) {
      setProgress((time / duration) * 100)
    }

    // Sync lyrics
    if (lyrics.length > 0) {
      let idx = lyrics.findIndex(l => l.time > time) - 1
      if (idx === -2) idx = lyrics.length - 1
      if (idx !== currentLyricIndex) {
        setCurrentLyricIndex(idx)
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

  const pushToAria2 = async (song: SongItem) => {
    try {
      const res = await fetch('/api/system/music/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            songId: song.id,
            title: song.title,
            artist: song.artist,
            quality,
            dir: downloadDir
          })
        })
        const data = await res.json()
        if (data.success && data.data?.result) {
          showToast('已推送到下载管理器', 'success')
          refreshDownloadedTracks()
        } else {
          showToast('下载失败: ' + JSON.stringify(data.data || data.error || data), 'error')
        }
    } catch (e) {
      console.error(e)
      showToast('下载出错', 'error')
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
          showToast('音频加载失败，请稍后重试', 'error')
        }}
        onTimeUpdate={handleTimeUpdate} 
        onEnded={playNext} 
        className="hidden" 
      />
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <NeteaseIcon className="w-8 h-8" />
          <h2 className="text-lg font-bold text-slate-800">网易云音乐</h2>
        </div>
        <div className="flex items-center space-x-3">
          {userInfo && (
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-500 mr-2">
              <img src={userInfo.avatarUrl} alt="avatar" className="w-6 h-6 rounded-full shadow-sm" />
              <span>{userInfo.nickname}</span>
            </div>
          )}
          <DirSetting 
            label="音乐下载目录" 
            value={downloadDir} 
            onChange={(nextDir) => { void handleMusicDownloadDirChange(nextDir) }} 
            description="留空则使用Aria2全局默认下载目录。"
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 bg-white border-r border-slate-200 p-4 flex flex-col space-y-6 overflow-y-auto">
          {!userInfo && (
            <div className="p-3 bg-rose-50 rounded-lg text-xs text-rose-600 text-center mb-2">
              尚未登录<br/>请前往桌面“系统设置”底部<br/>使用网易云APP扫码登录
              <br/><br/>
              <button onClick={loadUserInfo} className="underline text-rose-500 font-bold cursor-pointer">已登录？点击刷新界面</button>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">发现</p>
            <div 
              onClick={() => {
                const nextQuery = searchInput || keyword
                const nextViewKey = makeSearchViewKey(nextQuery)
                setActiveTab('search')
                setActiveViewKey(nextViewKey)
                setSongs(songsByView[nextViewKey] ?? [])
              }}
              className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors flex items-center space-x-2 ${activeTab === 'search' ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <MagnifyingGlassIcon className="w-4 h-4" />
              <span>全网搜索</span>
            </div>
          </div>

          {userInfo && playlists.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">创建的歌单</p>
              {playlists.filter(p => p.creator.userId === userInfo.userId).map(p => (
                <div 
                  key={p.id}
                  onClick={() => openPlaylist(p.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors truncate flex items-center space-x-2 ${activeTab === p.id ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-100'}`}
                  title={p.name}
                >
                  <MusicalNoteIcon className={`w-4 h-4 ${activeTab === p.id ? 'text-rose-500' : 'text-slate-400'}`} />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          )}

          {userInfo && playlists.length > 0 && (
            <div className="space-y-1 pb-20">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-2">收藏的歌单</p>
              {playlists.filter(p => p.creator.userId !== userInfo.userId).map(p => (
                <div 
                  key={p.id}
                  onClick={() => openPlaylist(p.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors truncate flex items-center space-x-2 ${activeTab === p.id ? 'bg-rose-50 text-rose-600' : 'text-slate-600 hover:bg-slate-100'}`}
                  title={p.name}
                >
                  <MusicalNoteIcon className={`w-4 h-4 ${activeTab === p.id ? 'text-rose-500' : 'text-slate-400'}`} />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Main Area */}
        <div className="flex-1 overflow-auto bg-slate-50 flex flex-col relative pb-20">
          
          {/* Dedicated Search View */}
          {activeTab === 'search' && (
            <div className="p-8 border-b border-slate-200 bg-white">
              <h1 className="text-2xl font-bold text-slate-800 mb-6">全网搜索</h1>
              <form onSubmit={handleSearch} className="flex items-center w-full max-w-2xl">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="w-5 h-5 absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="搜索歌手、歌曲、专辑..." 
                    className="w-full pl-12 pr-4 py-3 bg-slate-100 border-transparent focus:bg-white focus:border-rose-400 focus:ring-2 focus:ring-rose-200 rounded-l-xl text-base transition-all outline-none"
                  />
                </div>
                <button type="submit" className="px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-r-xl transition-colors">
                  搜索
                </button>
              </form>
              {recentSearches.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-400 font-medium">最近搜索</span>
                  {recentSearches.slice(0, 6).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setSearchInput(item)
                        void runSearch(item, { background: Boolean(songsByView[makeSearchViewKey(item)]?.length) })
                      }}
                      className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-rose-50 text-xs text-slate-600 hover:text-rose-600 transition-colors"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Playlist / Songs */}
          <div className="flex-1 p-6">
            {loading && songs.length === 0 && <p className="text-slate-500 mt-4">加载中...</p>}
            {!loading && !refreshing && songs.length === 0 && activeTab !== 'search' && <p className="text-slate-500 mt-4">空空如也</p>}
            {!loading && !refreshing && songs.length === 0 && activeTab === 'search' && !searchInput.trim() && <p className="text-slate-400 mt-10 text-center">输入关键字开始搜索</p>}
            
            {songs.length > 0 && (
              <div className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm font-bold text-slate-700">
                    {activeTab === 'search' ? '搜索结果' : '歌单列表'} <span className="text-slate-400 font-normal">({songs.length}首)</span>
                    {refreshing ? <span className="ml-2 text-[11px] font-medium text-rose-400">刷新中...</span> : null}
                  </div>
                  <button 
                    onClick={() => playSong(songs[0])}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs font-medium transition-colors shadow-sm shadow-rose-500/30"
                  >
                    <PlayIcon className="w-3.5 h-3.5" />
                    <span>播放全部</span>
                  </button>
                </div>
                <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-slate-200 text-xs font-medium text-slate-400">
                  <div className="col-span-1">#</div>
                  <div className="col-span-4">歌曲标题</div>
                  <div className="col-span-3">歌手</div>
                  <div className="col-span-2">专辑</div>
                  <div className="col-span-2 text-right">时长</div>
                </div>
                {songs.map((song, idx) => {
                  const isPlayingThis = currentSong?.id === song.id
                  return (
                    <div 
                      key={song.id + '-' + idx} 
                      onDoubleClick={() => playSong(song)}
                      className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-slate-100 hover:bg-rose-50/50 text-sm transition-colors group items-center cursor-pointer rounded-lg mt-1 ${isPlayingThis ? 'bg-rose-50 text-rose-600' : ''}`}
                    >
                      <div className="col-span-1 text-slate-400 group-hover:hidden flex items-center justify-start h-full">
                        {isPlayingThis ? (
                          isPlaying ? (
                            <div className="flex items-end justify-center space-x-[2px] w-4 h-4 ml-0.5">
                              <div className="w-[3px] bg-rose-500 animate-eq-1 rounded-t-sm" style={{height: '50%'}}></div>
                              <div className="w-[3px] bg-rose-500 animate-eq-2 rounded-t-sm" style={{height: '100%'}}></div>
                              <div className="w-[3px] bg-rose-500 animate-eq-3 rounded-t-sm" style={{height: '30%'}}></div>
                            </div>
                          ) : (
                            <MusicalNoteIcon className="w-4 h-4 text-rose-500" />
                          )
                        ) : idx + 1}
                      </div>
                      <div className="col-span-1 text-rose-500 hidden group-hover:flex items-center justify-start h-full" onClick={() => playSong(song)}>
                        <PlayIcon className="w-4 h-4 ml-0.5" />
                      </div>
                      <div className={`col-span-4 font-medium flex items-center pr-4 ${isPlayingThis ? 'text-rose-600' : 'text-slate-800'}`}>
                        {song.cover ? (
                           <img src={song.cover} onError={handleImageError} className="w-8 h-8 rounded mr-3 object-cover shadow-sm flex-shrink-0" alt="cover" />
                        ) : (
                           <div className="w-8 h-8 rounded mr-3 bg-slate-200 flex items-center justify-center flex-shrink-0">
                             <MusicalNoteIcon className="w-4 h-4 text-slate-400" />
                           </div>
                        )}
                        <span className="truncate">{song.title}</span>
                        {getDownloadedTrack(song) && (
                          <CheckCircleIcon className="w-4 h-4 text-green-500 ml-2 flex-shrink-0" title="已下载，本地播放优先" />
                        )}
                        <div className="flex items-center space-x-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <ArrowDownTrayIcon 
                            className="w-4 h-4 text-slate-400 hover:text-rose-500" 
                            title={`推送到Aria2下载 (${quality}音质)`} 
                            onClick={(e) => { e.stopPropagation(); pushToAria2(song); }}
                          />
                        </div>
                      </div>
                      <div className={`col-span-3 truncate ${isPlayingThis ? 'text-rose-500' : 'text-slate-500'}`}>{song.artist}</div>
                      <div className={`col-span-2 truncate ${isPlayingThis ? 'text-rose-500' : 'text-slate-500'}`}>{song.album}</div>
                      <div className="col-span-2 text-right text-slate-400">{song.duration}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
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
                  key={currentSong.id}
                  initial={{ opacity: 0, scale: 1.1 }}
                  animate={{ opacity: 0.5, scale: 1.25 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.5, ease: "easeInOut" }}
                  className="absolute inset-0 bg-cover bg-center blur-[80px]"
                  style={{ backgroundImage: (currentSong as any).cover ? `url(${(currentSong as any).cover})` : 'none' }}
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
                className={`px-5 py-2 rounded-full backdrop-blur-xl transition-all duration-500 text-sm font-bold border shadow-lg ${pureLyricMode ? 'bg-rose-500/80 border-rose-400 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)]' : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/15 hover:text-white'}`}
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
                  {(currentSong as any).cover ? (
                    <img src={(currentSong as any).cover} onError={handleImageError} className="w-full h-full object-cover" alt="cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-800/80">
                      <MusicalNoteIcon className="w-32 h-32 text-slate-500" />
                    </div>
                  )}
                  {/* Glass reflection overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 pointer-events-none rounded-3xl" />
                </motion.div>
                <div className="mt-10 text-center max-w-[400px]">
                  <h1 className="text-4xl font-extrabold text-white mb-3 truncate drop-shadow-lg" title={currentSong.title}>{currentSong.title}</h1>
                  <p className="text-xl text-white/70 truncate font-medium drop-shadow-md" title={`${currentSong.artist} - ${currentSong.album}`}>{currentSong.artist} - {currentSong.album}</p>
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
                                ? `active-lyric text-rose-50 ${pureLyricMode ? 'text-[52px]' : 'text-[44px]'} leading-snug font-black opacity-100 blur-none drop-shadow-[0_0_24px_rgba(244,63,94,0.6)] scale-100` 
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

      {/* Bottom Player */}
      <div className={`absolute bottom-0 left-0 right-0 h-20 ${showImmersive ? 'bg-transparent text-white border-transparent' : 'bg-white/95 backdrop-blur-xl border-t border-slate-200 text-slate-800'} flex items-center justify-between px-6 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-50 transition-colors duration-500`}>

        <div className="flex items-center space-x-4 w-64 cursor-pointer group" onClick={() => currentSong && setShowImmersive(!showImmersive)}>
          <div className={`w-12 h-12 rounded-md shadow-inner flex items-center justify-center relative overflow-hidden flex-shrink-0 transition-colors duration-500 ${
             (!currentSong || !(currentSong as any).cover) 
               ? (showImmersive ? 'bg-slate-800' : 'bg-slate-200') 
               : 'bg-gradient-to-br from-rose-400 to-red-600'
          }`}>
             {currentSong && (currentSong as any).cover && (
                <img src={(currentSong as any).cover} onError={handleImageError} className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform" />
             )}
             {(!currentSong || !(currentSong as any).cover) && (
               <MusicalNoteIcon className={`w-6 h-6 z-10 transition-colors duration-500 ${showImmersive ? 'text-slate-500' : 'text-slate-400'}`} />
             )}
             {/* Hover indicator for Immersive view */}
             <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20">
               {showImmersive ? <ChevronDownIcon className="w-5 h-5 text-white" /> : <ArrowsRightLeftIcon className="w-5 h-5 text-white rotate-45" />}
             </div>
          </div>
          <div className="truncate">
            <div className={`text-sm font-bold truncate ${showImmersive ? 'text-white' : 'text-slate-800'}`} title={currentSong?.title}>{currentSong?.title || '未播放'}</div>
            <div className={`text-xs truncate ${showImmersive ? 'text-white/60' : 'text-slate-500'}`}>{currentSong?.artist || '网易云音乐'}</div>
          </div>
        </div>
        
        <div className="flex flex-col items-center flex-1 max-w-lg">
          <div className="flex items-center space-x-6 mb-1.5">
            {/* Play Mode Toggle */}
            <button onClick={togglePlayMode} className={`${showImmersive ? 'text-white/60 hover:text-white' : 'text-slate-400 hover:text-rose-500'} transition-colors`} title={playMode === 'sequence' ? '顺序播放' : playMode === 'random' ? '随机播放' : '单曲循环'}>
              {playMode === 'sequence' ? (
                <div className="flex items-center text-[10px] font-bold"><ArrowPathIcon className="w-4 h-4 mr-0.5" /> 顺</div>
              ) : playMode === 'random' ? (
                <div className="flex items-center text-[10px] font-bold"><ArrowsRightLeftIcon className="w-4 h-4 mr-0.5" /> 随</div>
              ) : (
                <div className="flex items-center text-[10px] font-bold"><ArrowPathIcon className="w-4 h-4 mr-0.5 text-rose-500" /> 单</div>
              )}
            </button>
            
            <BackwardIcon className={`w-5 h-5 cursor-pointer transition-colors ${showImmersive ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-rose-500'}`} onClick={playPrev} />
            <div 
              className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-colors ${showImmersive ? 'bg-white/20 hover:bg-white/30 backdrop-blur-sm' : 'bg-rose-50 hover:bg-rose-100'}`}
              onClick={togglePlay}
            >
              {isPlaying ? <PauseIcon className={`w-5 h-5 ${showImmersive ? 'text-white' : 'text-rose-500'}`} /> : <PlayIcon className={`w-5 h-5 ml-0.5 ${showImmersive ? 'text-white' : 'text-rose-500'}`} />}
            </div>
            <ForwardIcon className={`w-5 h-5 cursor-pointer transition-colors ${showImmersive ? 'text-white/80 hover:text-white' : 'text-slate-600 hover:text-rose-500'}`} onClick={playNext} />
            
            {/* Quality Selector */}
            <select 
              value={quality}
              onChange={handleQualityChange}
              className={`text-[10px] font-bold rounded cursor-pointer outline-none border-none py-0.5 focus:ring-0 transition-colors ${showImmersive ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600'}`}
              title="切换音质"
            >
              <option value="standard" className="text-slate-800 bg-white">标准</option>
              <option value="exhigh" className="text-slate-800 bg-white">极高</option>
              <option value="lossless" className="text-slate-800 bg-white">无损</option>
              <option value="hires" className="text-slate-800 bg-white">Hi-Res</option>
            </select>
          </div>
          <div className={`flex items-center w-full space-x-3 text-xs font-medium ${showImmersive ? 'text-white/60' : 'text-slate-400'}`}>
            <span>{currentTime}</span>
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer group relative ${showImmersive ? 'bg-white/20' : 'bg-slate-200'}`} onClick={(e) => {
              if(!audioRef.current || !currentSong) return;
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              audioRef.current.currentTime = pct * (audioRef.current.duration || 0)
            }}>
              <div 
                className={`h-full relative ${showImmersive ? 'bg-white group-hover:bg-white/90' : 'bg-rose-500 group-hover:bg-rose-400'}`}
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100"></div>
              </div>
            </div>
            <span>{currentSong?.duration || '00:00'}</span>
          </div>
        </div>

        <div className={`w-64 flex justify-end items-center space-x-4 ${showImmersive ? 'text-white/60' : 'text-slate-500'}`}>
          {currentSong && (
            <ArrowDownTrayIcon 
              className={`w-5 h-5 cursor-pointer transition-colors ${showImmersive ? 'hover:text-white' : 'hover:text-rose-500'}`} 
              title="推送当前音质到Aria2下载" 
              onClick={() => pushToAria2(currentSong)}
            />
          )}
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
