import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface IframeAppProps {
  url: string
  title: string
}

export default function IframeApp({ url, title }: IframeAppProps) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
  }, [url])

  return (
    <div className="relative w-full h-full bg-slate-50 overflow-hidden">
      <AnimatePresence>
        {loading && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 z-10"
          >
            <div className="w-12 h-12 relative mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
            <div className="text-sm font-medium text-slate-500 tracking-wider uppercase animate-pulse">
              加载 {title} ...
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.iframe 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: loading ? 0 : 1, scale: loading ? 0.98 : 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        src={url} 
        title={title}
        className="w-full h-full border-none bg-transparent block"
        onLoad={() => setLoading(false)}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-downloads"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  )
}
