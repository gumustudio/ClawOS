import { useState, useRef, useEffect } from 'react'
import { MagnifyingGlassIcon, ArrowDownTrayIcon, PlayIcon, XMarkIcon } from '@heroicons/react/24/solid'
import { VideoIcon } from "../components/Icons"
import Hls from 'hls.js'
import DirSetting from '../components/DirSetting'
import { fetchServerPaths, saveServerPaths } from '../lib/serverPaths'

export default function VideoApp() {
  const [search, setSearch] = useState('')
  const [sources, setSources] = useState<{id: string, name: string}[]>([])
  const [selectedSource, setSelectedSource] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [isSearchMode, setIsSearchMode] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const [playingVideo, setPlayingVideo] = useState<any>(null)
  const [playingUrl, setPlayingUrl] = useState('')
  const [downloadDir, setDownloadDir] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    fetchServerPaths()
      .then((paths) => setDownloadDir(paths.videoDownloadsDir))
      .catch((error) => console.error('Failed to load video path config', error))
  }, [])

  const handleVideoDownloadDirChange = async (nextDir: string) => {
    try {
      const paths = await saveServerPaths({ videoDownloadsDir: nextDir.trim() })
      setDownloadDir(paths.videoDownloadsDir)
    } catch (error) {
      console.error('Failed to save video path config', error)
      alert('保存视频目录失败')
    }
  }

  const loadLatest = async (pageNum: number, append = false) => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const res = await fetch(`/api/system/video/latest?page=${pageNum}`)
      const data = await res.json()
      if (data.success) {
        if (data.data.length === 0) {
          setHasMore(false)
        } else {
          setResults(prev => append ? [...prev, ...data.data] : data.data)
          setPage(pageNum)
        }
      }
    } catch (err) {
      console.error('Failed to load latest videos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch('/api/system/video/sources')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setSources(data.data)
          if (data.data.length > 0) setSelectedSource(data.data[0].id)
        }
      })
      .catch(console.error)

    // Load initial feed
    loadLatest(1)
  }, [])

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!search.trim()) {
      setIsSearchMode(false)
      setHasMore(true)
      loadLatest(1)
      return
    }
    
    setIsSearchMode(true)
    setLoading(true)
    setHasMore(false) // disable infinite scroll for search results currently
    try {
      const res = await fetch(`/api/system/video/search?keyword=${encodeURIComponent(search)}&source=${selectedSource}`)
      const data = await res.json()
      if (data.success) {
        setResults(data.data)
      } else {
        setResults([])
      }
    } catch (err) {
      console.error(err)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  // Parse MacCMS url string (format: "title$url#title$url")
  const parseUrls = (urlStr: string) => {
    if (!urlStr) return []
    // often separated by $$$ for different players, we just take the first m3u8 list usually
    const parts = urlStr.split('$$$')
    let targetPart = parts.find(p => p.includes('.m3u8')) || parts[0]
    if (!targetPart) return []
    
    const links = targetPart.split('#')
    return links.map(link => {
      const [title, url] = link.split('$')
      return { title: title || 'Play', url: url || title }
    }).filter(l => l.url.includes('.m3u8') || l.url.includes('.mp4'))
  }

  const openPlayer = (video: any) => {
    const urls = parseUrls(video.urls)
    if (urls.length > 0) {
      setPlayingVideo(video)
      setPlayingUrl(urls[0].url)
    } else {
      alert('未找到可播放的 m3u8 链接')
    }
  }

  useEffect(() => {
    if (playingVideo && playingUrl && videoRef.current) {
      const video = videoRef.current
      if (Hls.isSupported()) {
        const hls = new Hls()
        hls.loadSource(playingUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(e => console.log('Autoplay prevented:', e))
        })
        return () => {
          hls.destroy()
        }
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native support (Safari)
        video.src = playingUrl
        video.addEventListener('loadedmetadata', () => {
          video.play()
        })
      }
    }
  }, [playingVideo, playingUrl])

  const pushToAria2 = async (e: React.MouseEvent, video: any) => {
    e.stopPropagation()
    const urls = parseUrls(video.urls)
    if (urls.length === 0) {
      alert('无下载链接')
      return
    }
    const url = urls[0].url
    try {
      const rpcRes = await fetch('/api/system/downloads/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'clawos',
          method: 'aria2.addUri',
          params: [
            [url],
            { out: `${video.name}.mp4`, ...(downloadDir ? { dir: downloadDir } : {}) }
          ]
        })
      })
      const rpcData = await rpcRes.json()
      if (rpcData.result) alert('已推送到下载管理器')
      else alert('下载失败')
    } catch (err) {
      alert('推送下载出错')
    }
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSearchMode || loading || !hasMore) return
    const { scrollTop, clientHeight, scrollHeight } = e.currentTarget
    if (scrollHeight - scrollTop <= clientHeight * 1.5) {
      loadLatest(page + 1, true)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-800 relative">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2">
            <VideoIcon className="w-6 h-6" />
            <h2 className="text-lg font-bold text-slate-800">影视仓</h2>
          </div>
          <div className="flex items-center space-x-4">
            <select 
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              className="bg-slate-100 text-sm border-none rounded-lg focus:ring-2 focus:ring-rose-200 outline-none px-3 py-1.5"
            >
              <option value="">全网搜 (较慢)</option>
              {sources.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <DirSetting 
              label="视频下载目录" 
              value={downloadDir} 
              onChange={(nextDir) => { void handleVideoDownloadDirChange(nextDir) }} 
              description="留空则使用Aria2全局默认下载目录。"
            />
          </div>
        </div>
        <form onSubmit={handleSearch} className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="搜索影视资源..." 
            className="pl-9 pr-4 py-1.5 bg-slate-100 border-transparent focus:bg-white focus:border-rose-300 focus:ring-2 focus:ring-rose-200 rounded-full text-sm w-64 transition-all outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="hidden">搜</button>
        </form>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-6 relative" onScroll={handleScroll}>
        {loading && results.length === 0 && <div className="text-slate-500 text-center mt-10">加载中...</div>}
        {!loading && results.length === 0 && search && <div className="text-slate-500 text-center mt-10">未找到相关资源</div>}
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {results.map((movie, idx) => (
            <div key={`${movie.id}-${idx}`} className="group relative flex flex-col cursor-pointer" onClick={() => openPlayer(movie)}>
              <div className="relative w-full aspect-[2/3] rounded-xl bg-slate-200 shadow-md overflow-hidden mb-3 group-hover:shadow-xl transition-all duration-300 group-hover:-translate-y-1">
                {movie.pic ? (
                  <img src={movie.pic} alt={movie.name} className="w-full h-full object-cover" onError={(e) => { (e.target as any).src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=' }} />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-slate-400 to-slate-600"></div>
                )}
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-xs px-2 py-1 rounded-md">
                  {movie.type}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity duration-300">
                  <PlayIcon className="w-12 h-12 text-white/90 drop-shadow-lg" />
                </div>
              </div>
              <h3 className="font-semibold text-sm text-slate-800 truncate" title={movie.name}>{movie.name}</h3>
              <p className="text-xs text-slate-500 truncate">{movie.sourceName} · {movie.remarks}</p>
              
              <button 
                onClick={(e) => pushToAria2(e, movie)}
                className="mt-2 flex items-center justify-center w-full py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium opacity-0 group-hover:opacity-100 hover:bg-rose-100 transition-all duration-200"
              >
                <ArrowDownTrayIcon className="w-3 h-3 mr-1" /> 推送下载
              </button>
            </div>
          ))}
        </div>
        {loading && results.length > 0 && <div className="text-slate-400 text-center py-6 text-sm">正在加载更多...</div>}
        {!hasMore && results.length > 0 && !isSearchMode && <div className="text-slate-400 text-center py-6 text-sm">到底了</div>}
      </div>

      {/* Video Player Modal */}
      {playingVideo && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
            <h2 className="text-white font-bold">{playingVideo.name}</h2>
            <button 
              onClick={() => { setPlayingVideo(null); setPlayingUrl(''); }}
              className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center bg-black">
            <video 
              ref={videoRef} 
              controls 
              autoPlay
              className="w-full max-h-full max-w-5xl shadow-2xl"
            />
          </div>
          <div className="h-16 bg-gradient-to-t from-black/90 to-transparent flex items-center px-4 overflow-x-auto gap-2 scrollbar-hide">
            {parseUrls(playingVideo.urls).map((link, idx) => (
              <button
                key={idx}
                onClick={() => setPlayingUrl(link.url)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${playingUrl === link.url ? 'bg-rose-600 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}
              >
                {link.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
