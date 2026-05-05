import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Shield, Globe, AlertTriangle, Zap,
  LogOut, ChevronDown, RefreshCw,
  Activity, Layers, Plus, Copy, Check, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60)    return `${s}s ago`
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function groupByDay(logs, days = 14) {
  const result = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    result.push({
      date:  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
      _iso:  d.toISOString().slice(0, 10),
    })
  }
  logs.forEach(log => {
    const day    = new Date(log.created_at).toISOString().slice(0, 10)
    const bucket = result.find(r => r._iso === day)
    if (bucket) bucket.count++
  })
  return result
}

// ---------------------------------------------------------------------------
// AddSiteModal
// ---------------------------------------------------------------------------
function AddSiteModal({ onClose, onSuccess }) {
  const [step,    setStep]    = useState('form')
  const [name,    setName]    = useState('')
  const [url,     setUrl]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [result,  setResult]  = useState(null)
  const [copied,  setCopied]  = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated — please log in again')

      const resp = await fetch(`${API_URL}/admin/create-site`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name, url }),
      })

      const data = await resp.json()
      if (!resp.ok) throw new Error(data.detail || 'Failed to create site')

      setResult(data)
      setStep('success')
      onSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const snippet = result
    ? `<script>\n  window.GARRISON_CONFIG = {\n    apiUrl:  '${API_URL}/analyze',\n    siteId:  '${result.site_id}',\n    apiKey:  '${result.raw_key}',\n  };\n</script>\n<script src="https://cdn.garrison.ai/garrison.js"></script>`
    : ''

  function copySnippet() {
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-garrison-card border border-garrison-border rounded-2xl w-full max-w-lg shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-garrison-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
              {step === 'success'
                ? <Check className="w-4 h-4 text-emerald-400" strokeWidth={2.5} />
                : <Plus  className="w-4 h-4 text-indigo-400" strokeWidth={2.5} />
              }
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">
                {step === 'success' ? 'Site added' : 'Add new site'}
              </h2>
              <p className="text-gray-500 text-xs mt-0.5">
                {step === 'success' ? 'Copy the snippet below' : 'Generate an API key for a client site'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1.5 rounded-lg hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'form' && (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Site name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Leasing Co"
                required
                className="w-full bg-garrison-surface border border-garrison-border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Site URL</label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="acme-leasing.com"
                required
                className="w-full bg-garrison-surface border border-garrison-border rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/20 transition-colors"
              />
              <p className="text-xs text-gray-600 mt-1.5">Used to generate the site ID — e.g. acme-leasing.com</p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-300 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm text-gray-400 hover:text-white bg-transparent border border-garrison-border hover:border-white/20 rounded-lg py-2.5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {loading ? 'Creating…' : 'Add site'}
              </button>
            </div>
          </form>
        )}

        {step === 'success' && result && (
          <div className="px-6 py-5 space-y-4">
            {/* Site info summary */}
            <div className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="text-xs">
                <span className="text-emerald-300 font-semibold">{result.name}</span>
                <span className="text-gray-500 ml-2 font-mono">{result.site_id}</span>
              </div>
            </div>

            {/* Snippet */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-400">Paste before <code className="text-indigo-400">&lt;/body&gt;</code> on the client site</p>
                <button
                  onClick={copySnippet}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors px-2.5 py-1 rounded-lg hover:bg-white/5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bg-garrison-surface border border-garrison-border rounded-xl px-4 py-4 text-xs text-gray-300 font-mono overflow-x-auto leading-relaxed whitespace-pre">
                {snippet}
              </pre>
              <p className="text-xs text-red-400/80 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                Save the API key now — it will not be shown again.
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg py-2.5 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function TopBar({ user, onLogout }) {
  return (
    <header className="sticky top-0 z-40 bg-garrison-bg/80 backdrop-blur-xl border-b border-garrison-border">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-500/40">
            <Shield className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-white text-base tracking-tight">Garrison</span>
          <span className="hidden sm:block text-gray-600 text-sm ml-1">/ Dashboard</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden md:block text-xs text-gray-500 bg-garrison-card border border-garrison-border px-3 py-1.5 rounded-lg">
            {user?.email}
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-500/8 border border-transparent hover:border-red-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}

function MetricCard({ icon: Icon, label, value, sub, color, loading }) {
  return (
    <div className="bg-garrison-card border border-garrison-border rounded-2xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.bg}`}>
        <Icon className={`w-5 h-5 ${color.icon}`} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
        {loading ? (
          <div className="h-7 w-16 bg-garrison-border rounded animate-pulse" />
        ) : (
          <p className={`text-2xl font-bold tabular-nums ${color.value}`}>{value}</p>
        )}
        <p className="text-xs text-gray-600 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

function LayerBadge({ layer }) {
  const styles = {
    regex:    'bg-yellow-500/12 text-yellow-400 border-yellow-500/25',
    semantic: 'bg-violet-500/12 text-violet-400 border-violet-500/25',
    none:     'bg-gray-500/10  text-gray-500  border-gray-500/20',
  }
  const labels = { regex: 'Regex', semantic: 'Semantic AI', none: '—' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${styles[layer] ?? styles.none}`}>
      {layer === 'regex'    && <Zap    className="w-2.5 h-2.5" />}
      {layer === 'semantic' && <Layers className="w-2.5 h-2.5" />}
      {labels[layer] ?? layer}
    </span>
  )
}

function ThreatBadge({ level }) {
  const cls =
    level >= 9 ? 'text-red-400'     :
    level >= 7 ? 'text-orange-400'  :
    level >= 5 ? 'text-yellow-400'  :
                 'text-emerald-400'
  return <span className={`font-mono font-bold text-sm tabular-nums ${cls}`}>{level}/10</span>
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-garrison-card border border-garrison-border rounded-xl px-3 py-2.5 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      <p className="text-indigo-400 font-semibold">{payload[0].value} blocked</p>
    </div>
  )
}

function TableSkeleton() {
  return Array.from({ length: 5 }).map((_, i) => (
    <tr key={i} className="border-t border-garrison-border">
      {Array.from({ length: 5 }).map((_, j) => (
        <td key={j} className="px-4 py-3">
          <div className="h-4 bg-garrison-border rounded animate-pulse" style={{ width: `${60 + j * 10}%` }} />
        </td>
      ))}
    </tr>
  ))
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const navigate = useNavigate()
  const [user,            setUser]           = useState(null)
  const [logs,            setLogs]           = useState([])
  const [registeredSites, setRegisteredSites] = useState([])
  const [loading,         setLoading]        = useState(true)
  const [sitesLoading,    setSitesLoading]   = useState(true)
  const [error,           setError]          = useState(null)
  const [lastSynced,      setLastSynced]     = useState(null)
  const [selectedSite,    setSelectedSite]   = useState('all')
  const [siteOpen,        setSiteOpen]       = useState(false)
  const [showAddSite,     setShowAddSite]    = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])

  async function fetchLogs() {
    setLoading(true)
    setError(null)
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('threat_logs')
      .select('id, site_id, threat_level, detection_layer, reason, created_at')
      .eq('status', 'blocked')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      setError(error.message)
    } else {
      setLogs(data ?? [])
      setLastSynced(new Date())
    }
    setLoading(false)
  }

  const fetchSites = useCallback(async () => {
    setSitesLoading(true)
    const { data } = await supabase
      .from('sites')
      .select('id, site_id, name, url, created_at')
      .order('created_at', { ascending: false })
    setRegisteredSites(data ?? [])
    setSitesLoading(false)
  }, [])

  useEffect(() => { fetchLogs() }, [])
  useEffect(() => { fetchSites() }, [fetchSites])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const filterSites = useMemo(
    () => ['all', ...Array.from(new Set(logs.map(l => l.site_id))).sort()],
    [logs]
  )

  const visibleLogs = useMemo(
    () => selectedSite === 'all' ? logs : logs.filter(l => l.site_id === selectedSite),
    [logs, selectedSite]
  )

  const criticalCount = useMemo(
    () => visibleLogs.filter(l => l.threat_level >= 8).length,
    [visibleLogs]
  )

  const chartData  = useMemo(() => groupByDay(visibleLogs, 14), [visibleLogs])
  const recentLogs = visibleLogs.slice(0, 20)

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-garrison-bg">
      <TopBar user={user} onLogout={handleLogout} />

      {showAddSite && (
        <AddSiteModal
          onClose={() => setShowAddSite(false)}
          onSuccess={() => fetchSites()}
        />
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-white font-bold text-2xl tracking-tight">Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {lastSynced
                ? `Last synced ${timeAgo(lastSynced.toISOString())}`
                : 'Loading…'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddSite(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add new site
            </button>
          </div>
        </div>

        {/* Registered sites section */}
        <div className="bg-garrison-card border border-garrison-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-garrison-border flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Protected Sites</h2>
              <p className="text-gray-500 text-xs mt-0.5">Sites with active Garrison shields</p>
            </div>
            {!sitesLoading && (
              <span className="text-xs text-gray-600 bg-garrison-surface border border-garrison-border px-2.5 py-1 rounded-lg">
                {registeredSites.length} {registeredSites.length === 1 ? 'site' : 'sites'}
              </span>
            )}
          </div>

          {sitesLoading ? (
            <div className="px-6 py-8 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : registeredSites.length === 0 ? (
            <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-indigo-400" strokeWidth={1.75} />
              </div>
              <p className="text-gray-400 font-medium">No sites yet</p>
              <p className="text-gray-600 text-xs max-w-xs">
                Click <strong className="text-gray-400">Add new site</strong> to generate an API key and get the install snippet.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-garrison-border">
              {registeredSites.map(site => (
                <div key={site.id} className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.015] transition-colors">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <Globe className="w-4 h-4 text-indigo-400" strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{site.name}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5 truncate">{site.url}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="hidden sm:block text-[11px] text-gray-500 font-mono bg-garrison-surface border border-garrison-border px-2.5 py-1 rounded-lg">
                      {site.site_id}
                    </span>
                    <span className="text-xs text-gray-600">{timeAgo(site.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analytics header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
          <div>
            <h2 className="text-white font-semibold text-lg">Threat Analytics</h2>
            <p className="text-gray-500 text-xs mt-0.5">Last 30 days — blocked events only</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Site filter */}
            <div className="relative">
              <button
                onClick={() => setSiteOpen(v => !v)}
                className="flex items-center gap-2 text-sm text-gray-300 bg-garrison-card border border-garrison-border hover:border-indigo-500/40 rounded-lg px-3.5 py-2 transition-colors"
              >
                <Globe className="w-3.5 h-3.5 text-gray-500" />
                {selectedSite === 'all' ? 'All sites' : selectedSite}
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {siteOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-garrison-card border border-garrison-border rounded-xl shadow-2xl z-20 overflow-hidden py-1">
                  {filterSites.map(s => (
                    <button
                      key={s}
                      onClick={() => { setSelectedSite(s); setSiteOpen(false) }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                        selectedSite === s
                          ? 'text-indigo-400 bg-indigo-500/10'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      {s === 'all' ? 'All sites' : s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchLogs}
              disabled={loading}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white bg-garrison-card border border-garrison-border hover:border-indigo-500/40 rounded-lg px-3.5 py-2 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 text-red-300 text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            Failed to load threat logs: {error}
          </div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            icon={Globe}
            label="Total Sites Protected"
            value={sitesLoading ? '—' : String(registeredSites.length)}
            sub="registered sites"
            color={{ bg: 'bg-indigo-500/10', icon: 'text-indigo-400', value: 'text-indigo-400' }}
            loading={sitesLoading}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Threats Blocked (30d)"
            value={loading ? '—' : visibleLogs.length.toLocaleString()}
            sub="blocked by Garrison"
            color={{ bg: 'bg-red-500/10', icon: 'text-red-400', value: 'text-red-400' }}
            loading={loading}
          />
          <MetricCard
            icon={Activity}
            label="Critical Attempts (30d)"
            value={loading ? '—' : criticalCount.toLocaleString()}
            sub="threat_level ≥ 8"
            color={{ bg: 'bg-orange-500/10', icon: 'text-orange-400', value: 'text-orange-400' }}
            loading={loading}
          />
        </div>

        {/* Bar chart */}
        <div className="bg-garrison-card border border-garrison-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-white font-semibold">Blocked Threats by Day</h2>
              <p className="text-gray-500 text-xs mt-0.5">Last 14 days</p>
            </div>
            <span className="text-[11px] text-gray-600 bg-garrison-surface border border-garrison-border px-2.5 py-1 rounded-lg">
              {selectedSite === 'all' ? 'All sites' : selectedSite}
            </span>
          </div>

          {loading ? (
            <div className="h-[220px] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c2e" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#4b5563', fontSize: 11, fontFamily: 'Inter, system-ui' }}
                  axisLine={false}
                  tickLine={false}
                  interval={1}
                />
                <YAxis
                  tick={{ fill: '#4b5563', fontSize: 11, fontFamily: 'Inter, system-ui' }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.06)', radius: 4 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent activity table */}
        <div className="bg-garrison-card border border-garrison-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-garrison-border flex items-center justify-between">
            <div>
              <h2 className="text-white font-semibold">Recent Activity</h2>
              <p className="text-gray-500 text-xs mt-0.5">Most recent 20 blocked events</p>
            </div>
            {!loading && (
              <span className="text-xs text-gray-600">
                {recentLogs.length} events
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-garrison-border bg-garrison-surface/50">
                  <th className="text-left px-4 py-3 text-[11px] text-gray-500 font-semibold uppercase tracking-widest">Time</th>
                  <th className="text-left px-4 py-3 text-[11px] text-gray-500 font-semibold uppercase tracking-widest">Site</th>
                  <th className="text-left px-4 py-3 text-[11px] text-gray-500 font-semibold uppercase tracking-widest">Reason</th>
                  <th className="text-left px-4 py-3 text-[11px] text-gray-500 font-semibold uppercase tracking-widest">Layer</th>
                  <th className="text-right px-4 py-3 text-[11px] text-gray-500 font-semibold uppercase tracking-widest">Level</th>
                </tr>
              </thead>
              <tbody>
                {loading && <TableSkeleton />}

                {!loading && recentLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-emerald-400" strokeWidth={1.75} />
                        </div>
                        <p className="text-gray-400 font-medium">No threats detected</p>
                        <p className="text-gray-600 text-xs">
                          {selectedSite !== 'all'
                            ? `No blocked events for ${selectedSite}`
                            : 'All sites are clean for the last 30 days'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && recentLogs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-t border-garrison-border hover:bg-white/[0.02] transition-colors ${
                      i % 2 === 0 ? '' : 'bg-garrison-surface/30'
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs font-mono whitespace-nowrap">
                      {timeAgo(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-300 text-xs font-mono bg-garrison-surface border border-garrison-border px-2 py-0.5 rounded">
                        {log.site_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">
                      {log.reason ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <LayerBadge layer={log.detection_layer} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ThreatBadge level={log.threat_level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  )
}
