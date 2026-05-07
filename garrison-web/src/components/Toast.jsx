import { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: <Check       className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
  error:   <AlertTriangle className="w-4 h-4 text-red-400   flex-shrink-0" />,
  info:    <Info        className="w-4 h-4 text-indigo-400  flex-shrink-0" />,
}
const BORDERS = {
  success: 'border-emerald-500/20 bg-emerald-500/8',
  error:   'border-red-500/20     bg-red-500/8',
  info:    'border-indigo-500/20  bg-indigo-500/8',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const remove = useCallback(id =>
    setToasts(prev => prev.filter(t => t.id !== id)), [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={   { opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl shadow-black/40 text-sm text-white min-w-[260px] max-w-sm ${BORDERS[t.type]}`}
            >
              {ICONS[t.type]}
              <span className="flex-1 text-gray-200">{t.message}</span>
              <button
                onClick={() => remove(t.id)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
