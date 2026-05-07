import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Shield, ArrowLeft, User, Key, Bell,
  Eye, EyeOff, RefreshCw, Copy, Check,
  AlertTriangle, CreditCard,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1], delay },
})

// ---------------------------------------------------------------------------
// Regenerate Key — copy-once modal
// ---------------------------------------------------------------------------
function NewKeyModal({ result, onClose }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(result.raw_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
    >
      <div className="bg-garrison-card border border-garrison-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Key className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">New API key generated</h3>
            <p className="text-gray-500 text-xs mt-0.5">{result.name} · {result.site_id}</p>
          </div>
        </div>

        <div className="bg-garrison-surface border border-garrison-border rounded-xl px-4 py-3 font-mono text-xs text-gray-300 break-all">
          {result.raw_key}
        </div>

        <p className="text-xs text-red-400/80 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          Save this key now — it will not be shown again.
        </p>

        <div className="flex gap-3">
          <button
            onClick={copy}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy key'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-sm font-semibold py-2.5 border border-garrison-border hover:border-white/20 text-gray-400 hover:text-white rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export default function Settings() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [user,       setUser]       = useState(null)
  const [apiKeys,    setApiKeys]    = useState([])
  const [prefs,      setPrefs]      = useState({ email_alerts: true })
  const [newKey,     setNewKey]     = useState(null)

  // Password form
  const [password,   setPassword]   = useState('')
  const [passConfirm,setPassConfirm] = useState('')
  const [showPass,   setShowPass]   = useState(false)
  const [passLoading,setPassLoading] = useState(false)

  // API key actions
  const [regenId,    setRegenId]    = useState(null)
  const [regenLoading, setRegenLoading] = useState(false)

  // Prefs loading
  const [prefsLoading, setPrefsLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
    fetchKeys()
    fetchPrefs()
  }, [])

  async function fetchKeys() {
    const { data } = await supabase
      .from('api_keys')
      .select('id, name, site_id, last_used, created_at')
      .order('created_at', { ascending: false })
    setApiKeys(data ?? [])
  }

  async function fetchPrefs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_preferences')
      .select('email_alerts')
      .eq('agency_id', user.id)
      .single()
    if (data) setPrefs({ email_alerts: data.email_alerts })
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    if (password !== passConfirm) {
      toast('Passwords do not match', 'error'); return
    }
    if (password.length < 8) {
      toast('Password must be at least 8 characters', 'error'); return
    }
    setPassLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast(error.message, 'error')
    } else {
      toast('Password updated successfully')
      setPassword(''); setPassConfirm('')
    }
    setPassLoading(false)
  }

  async function handleRegen(keyId) {
    setRegenLoading(true)
    setRegenId(keyId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${API_URL}/admin/regenerate-key`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body:    JSON.stringify({ key_id: keyId }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Failed')
      setNewKey(data)
      await fetchKeys()
      toast('API key regenerated')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setRegenLoading(false)
      setRegenId(null)
    }
  }

  async function handlePrefsToggle(key, value) {
    setPrefs(p => ({ ...p, [key]: value }))
    setPrefsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ agency_id: user.id, [key]: value, updated_at: new Date().toISOString() })
    if (error) {
      toast('Failed to save preference', 'error')
      setPrefs(p => ({ ...p, [key]: !value }))
    } else {
      toast('Preferences saved')
    }
    setPrefsLoading(false)
  }

  async function handleOpenBilling() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(`${API_URL}/billing/create-portal`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Failed')
      window.location.href = data.url
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="min-h-screen bg-garrison-bg">
      {newKey && <NewKeyModal result={newKey} onClose={() => setNewKey(null)} />}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-garrison-bg/80 backdrop-blur-xl border-b border-garrison-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-500/40">
              <Shield className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="font-bold text-white text-base tracking-tight">Garrison</span>
          </div>
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <motion.div {...fadeUp(0)}>
          <h1 className="text-white font-bold text-2xl tracking-tight">Settings</h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage your account, keys, and preferences</p>
        </motion.div>

        {/* ── Profile ── */}
        <motion.div {...fadeUp(0.05)} className="bg-garrison-card border border-garrison-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-garrison-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-white font-semibold text-sm">Profile</h2>
          </div>
          <div className="px-6 py-5 space-y-5">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1.5">Email address</p>
              <p className="text-sm text-gray-300 bg-garrison-surface border border-garrison-border rounded-lg px-3.5 py-2.5 font-mono">
                {user?.email ?? '—'}
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <p className="text-xs font-medium text-gray-400">Change password</p>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  required
                  className="w-full bg-garrison-surface border border-garrison-border rounded-lg px-3.5 py-2.5 pr-10 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <input
                type={showPass ? 'text' : 'password'}
                value={passConfirm}
                onChange={e => setPassConfirm(e.target.value)}
                placeholder="Confirm new password"
                required
                className="w-full bg-garrison-surface border border-garrison-border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
              />
              <button
                type="submit"
                disabled={passLoading}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {passLoading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Update password
              </button>
            </form>
          </div>
        </motion.div>

        {/* ── API Keys ── */}
        <motion.div {...fadeUp(0.1)} className="bg-garrison-card border border-garrison-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-garrison-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <Key className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">API Keys</h2>
              <p className="text-gray-500 text-xs mt-0.5">Keys are hashed — regenerate to get a new one</p>
            </div>
          </div>

          {apiKeys.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">No API keys yet.</div>
          ) : (
            <div className="divide-y divide-garrison-border">
              {apiKeys.map(k => (
                <div key={k.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{k.name}</p>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{k.site_id}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Last used: {k.last_used ? new Date(k.last_used).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-mono text-gray-600 bg-garrison-surface border border-garrison-border px-2.5 py-1 rounded-lg hidden sm:block">
                      gsk_••••••••••••
                    </span>
                    <button
                      onClick={() => handleRegen(k.id)}
                      disabled={regenLoading && regenId === k.id}
                      className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-white border border-garrison-border hover:border-white/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${regenLoading && regenId === k.id ? 'animate-spin' : ''}`} />
                      Regenerate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ── Notifications ── */}
        <motion.div {...fadeUp(0.15)} className="bg-garrison-card border border-garrison-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-garrison-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center">
              <Bell className="w-4 h-4 text-orange-400" />
            </div>
            <h2 className="text-white font-semibold text-sm">Notifications</h2>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Email alerts</p>
                <p className="text-xs text-gray-500 mt-0.5">Get notified when a threat level ≥ 8 is detected</p>
              </div>
              <button
                onClick={() => handlePrefsToggle('email_alerts', !prefs.email_alerts)}
                disabled={prefsLoading}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                  prefs.email_alerts ? 'bg-indigo-600' : 'bg-garrison-border'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  prefs.email_alerts ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Billing ── */}
        <motion.div {...fadeUp(0.2)} className="bg-garrison-card border border-garrison-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-garrison-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-white font-semibold text-sm">Billing</h2>
          </div>
          <div className="px-6 py-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Manage subscription</p>
              <p className="text-xs text-gray-500 mt-0.5">View invoices, update card, or cancel anytime</p>
            </div>
            <button
              onClick={handleOpenBilling}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2 border border-garrison-border hover:border-indigo-500/40 text-gray-300 hover:text-white rounded-lg transition-colors"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Billing portal
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  )
}
