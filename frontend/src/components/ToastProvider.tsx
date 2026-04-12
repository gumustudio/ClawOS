import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useNotificationStore, type Notification } from '../store/useNotificationStore'
import { DashboardIcon, MonitorIcon, FilesIcon, VideoIcon, LocalMusicIcon, DownloadsIcon, NotesIcon, ReaderIcon, CronIcon, BaiduIcon, QuarkIcon, NeteaseIcon, OpenClawIcon, DidaIcon } from './Icons'
import AIQuantIcon from './AIQuantIcon'

function isCriticalNotification(notification: Notification) {
  return notification.level === 'error' || notification.metadata.riskPriority === 'critical'
}

const APP_ICONS: Record<string, React.ElementType> = {
  aiquant: AIQuantIcon,
  dashboard: DashboardIcon,
  monitor: MonitorIcon,
  openclaw: OpenClawIcon,
  files: FilesIcon,
  video: VideoIcon,
  music: NeteaseIcon,
  localmusic: LocalMusicIcon,
  downloads: DownloadsIcon,
  notes: NotesIcon,
  baidu: BaiduIcon,
  quark: QuarkIcon,
  reader: ReaderIcon,
  cron: CronIcon,
  dida: DidaIcon,
}

const ToastItem = ({ notification }: { notification: Notification }) => {
  const dismissToast = useNotificationStore((state) => state.dismissToast)
  const markAsRead = useNotificationStore((state) => state.markAsRead)
  const behavior = useNotificationStore((state) => state.behavior)
  const isCritical = isCriticalNotification(notification)

  useEffect(() => {
    if (behavior.stickyToasts || isCritical) {
      return
    }
    const timer = setTimeout(() => {
      dismissToast(notification.id)
    }, behavior.autoDismissMs)
    return () => clearTimeout(timer)
  }, [notification.id, dismissToast, behavior.stickyToasts, behavior.autoDismissMs, isCritical])

  const AppIcon = APP_ICONS[notification.appId] || OpenClawIcon

  const handleClick = () => {
    void markAsRead(notification.id)
    dismissToast(notification.id)
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`relative w-80 backdrop-blur-2xl rounded-2xl p-4 flex items-start gap-3 group cursor-pointer overflow-hidden z-[9999] pointer-events-auto text-slate-800 ${isCritical ? 'bg-red-50/92 border border-red-200 shadow-[0_12px_36px_rgba(220,38,38,0.22)]' : 'bg-white/80 border border-white/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)]'}`}
      onClick={handleClick}
    >
      {isCritical ? <div className="absolute inset-y-0 left-0 w-1.5 bg-red-500" /> : null}
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl border flex items-center justify-center ${isCritical ? 'bg-red-100 border-red-200' : 'bg-slate-100/80 border-slate-200/50'}`}>
        <AppIcon className={`w-6 h-6 ${isCritical ? 'text-red-600' : 'text-slate-600'}`} />
      </div>
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {isCritical ? <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">高危</span> : null}
            <h4 className={`text-sm font-semibold truncate ${isCritical ? 'text-red-900' : 'text-slate-800'}`}>{notification.title}</h4>
          </div>
          <span className={`text-[10px] ${isCritical ? 'text-red-400' : 'text-slate-400'}`}>{behavior.stickyToasts || isCritical ? '常驻' : '刚刚'}</span>
        </div>
        <p className={`text-xs mt-1 line-clamp-2 leading-relaxed ${isCritical ? 'text-red-700' : 'text-slate-500'}`}>
          {notification.message}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          dismissToast(notification.id)
        }}
        className={`absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isCritical ? 'text-red-400 hover:text-red-700 hover:bg-red-100/80' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}
      >
        <X size={14} />
      </button>
    </motion.div>
  )
}

export default function ToastProvider() {
  const activeToasts = useNotificationStore((state) => state.activeToasts)

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {activeToasts.map((toast) => (
          <ToastItem key={toast.id} notification={toast} />
        ))}
      </AnimatePresence>
    </div>
  )
}
