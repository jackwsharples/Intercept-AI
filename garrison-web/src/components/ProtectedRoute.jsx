import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Shield } from 'lucide-react'

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-garrison-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center animate-pulse">
          <Shield className="w-5 h-5 text-indigo-400" strokeWidth={1.75} />
        </div>
        <p className="text-gray-600 text-sm">Verifying session…</p>
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children }) {
  const [state, setState] = useState({ session: null, loading: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ session, loading: false })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false })
    })

    return () => subscription.unsubscribe()
  }, [])

  if (state.loading) return <LoadingScreen />
  if (!state.session) return <Navigate to="/login" replace />
  return children
}
