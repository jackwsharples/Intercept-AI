/**
 * Garrison — Agency Threat Analytics Dashboard
 *
 * Assumed Supabase table (run in SQL editor):
 *
 *   CREATE TABLE threat_logs (
 *     id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     agency_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 *     site_id         text NOT NULL,
 *     prompt_hash     text,              -- SHA-256 of the original prompt (never store plaintext)
 *     status          text CHECK (status IN ('blocked','allowed')),
 *     threat_level    integer CHECK (threat_level BETWEEN 0 AND 10),
 *     detection_layer text CHECK (detection_layer IN ('regex','semantic','none')),
 *     reason          text,
 *     created_at      timestamptz DEFAULT now()
 *   );
 *
 *   ALTER TABLE threat_logs ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "agency_sees_own_logs" ON threat_logs
 *     FOR SELECT USING (agency_id = auth.uid());
 *
 * The garrison-api writes rows with the agency_id resolved from the site_id
 * via a sites table (future work). For now, agency_id is set at insert time.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  Shield, Globe, AlertTriangle, Zap,
  LogOut, ChevronDown, RefreshCw,
  Activity, Layers,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (s < 60)   return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
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
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
      _iso: d.toISOString().slice(0, 10),
    })
  }
  logs.forEach(log => {
    const day = new Date(log.created_at).toISOString().slice(0, 10)
    const bucket = result.find(r => r._iso === day)
    if (bucket) bucket.count++
  })
  return result
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
    level >= 9 ? 'text-red-400' :
    level >= 7 ? 'text-orange-400' :
    level >= 5 ? 'text-yellow-400' :
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
  const [user,       setUser]       = useState(null)
  const [logs,       setLogs]       = useState([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [lastSynced, setLastSynced] = useState(null)
  const [selectedSite, setSelectedSite] = useState('all')
  const [siteOpen,   setSiteOpen]   = useState(false)

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
  }, [])

  // --- Fetch threat logs (last 30 days, blocked only) ---
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

  useEffect(() => { fetchLogs() }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // --- Derived data ---
  const sites = useMemo(
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

  const chartData = useMemo(
    () => groupByDay(visibleLogs, 14),
    [visibleLogs]
  )

  const recentLogs = visibleLogs.slice(0, 20)

  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-garrison-bg">
      <TopBar user={user} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-white font-bold text-2xl tracking-tight">Threat Analytics</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {lastSynced
                ? `Last synced ${timeAgo(lastSynced.toISOString())}`
                : 'Loading…'}
            </p>
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
                  {sites.map(s => (
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
            value={loading ? '—' : String(sites.length - 1)}
            sub="unique site_ids"
            color={{ bg: 'bg-indigo-500/10', icon: 'text-indigo-400', value: 'text-indigo-400' }}
            loading={loading}
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
                          {selectedSite !== 'all' ? `No blocked events for ${selectedSite}` : 'All sites are clean for the last 30 days'}
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
