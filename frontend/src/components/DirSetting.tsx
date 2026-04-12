import { useEffect, useState } from 'react'
import { Cog6ToothIcon } from '@heroicons/react/24/outline'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

interface DirSettingProps {
  label: string
  value: string
  placeholder?: string
  onChange: (val: string) => void
  description?: string
  saveLabel?: string
}

export default function DirSetting({ label, value, onChange, placeholder, description, saveLabel = '保存' }: DirSettingProps) {
  const [open, setOpen] = useState(false)
  const [tempVal, setTempVal] = useState(value)

  useEffect(() => {
    if (!open) {
      setTempVal(value)
    }
  }, [open, value])

  const handleSave = () => {
    onChange(tempVal)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button 
        onClick={() => { setTempVal(value); setOpen(!open) }}
        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"
        title="设置目录"
      >
        <Cog6ToothIcon className="w-4 h-4" />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/25 backdrop-blur-sm p-4"
              onClick={() => setOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.16 }}
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="text-sm font-semibold text-slate-800 mb-2">{label}</div>
                <input 
                  type="text"
                  value={tempVal}
                  onChange={e => setTempVal(e.target.value)}
                  placeholder={placeholder || '留空使用默认目录...'}
                  className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30 mb-3"
                />
                {description && <div className="text-xs text-slate-500 mb-4 leading-6">{description}</div>}
                <div className="flex justify-end space-x-2">
                  <button 
                    onClick={() => setOpen(false)}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSave}
                    className="px-3 py-2 text-sm bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                  >
                    {saveLabel}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}
