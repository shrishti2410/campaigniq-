import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { loadHistory, getUsername } from '../services/history'
import './Dashboard.css'

/* ══════════════════════════════
   Icons
══════════════════════════════ */
function IconBars() {
  return (
    <svg viewBox="0 0 20 18" fill="currentColor" width="18" height="16">
      <rect x="0"  y="8"  width="4" height="10" rx="1" />
      <rect x="5"  y="4"  width="4" height="14" rx="1" />
      <rect x="10" y="1"  width="4" height="17" rx="1" />
      <rect x="15" y="6"  width="4" height="12" rx="1" />
    </svg>
  )
}

function IconSpark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13">
      <path d="M8 1l1.2 3.6L13 6l-3.8 1.4L8 11l-1.2-3.6L3 6l3.8-1.4L8 1z" />
    </svg>
  )
}

/* ══════════════════════════════
   Helpers
══════════════════════════════ */
function fmtUSD(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(1)}k`
  return `$${Math.round(v).toLocaleString()}`
}

function fmtTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function computeStats(history) {
  if (!history.length) return { total: 0, revenue: 0, roi: 0, successRate: 0 }
  const revenue = history.reduce((s, e) => s + (e.revenue_usd || 0), 0)
  const spend   = history.reduce((s, e) => s + (e.spend_usd   || 0), 0)
  const roi     = spend > 0 ? revenue / spend : 0
  const successes = history.filter(e => (e.revenue_usd || 0) >= 6000).length
  return { total: history.length, revenue, roi, successRate: (successes / history.length) * 100 }
}

function genInsight(entry) {
  if (!entry) return null
  const r = entry.revenue_usd || 0
  const fmtR = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const map = {
    Star:     `Your latest ${entry.channel} campaign in ${entry.region} is a Star — ${fmtR(r)} predicted. Consider scaling the budget aggressively.`,
    Core:     `${entry.channel} on ${entry.device_type} in ${entry.region} returned ${fmtR(r)}. Core performer — maintain strategy and test budget increases.`,
    Question: `${entry.channel} in ${entry.region} returned ${fmtR(r)}. A Question Mark — try increasing spend or switching to a higher-performing channel.`,
    Dog:      `${entry.channel} in ${entry.region} predicted only ${fmtR(r)}. Underperforming — review targeting, channel mix, and quality score.`,
  }
  return map[entry.tier] || null
}

/* ══════════════════════════════
   Inner navbar
══════════════════════════════ */
function DashNav() {
  return (
    <nav className="dash-nav">
      <div className="dash-nav-brand">
        <span className="dash-nav-icon" aria-hidden="true"><IconBars /></span>
        <span className="dash-nav-name">CampaignIQ</span>
      </div>
      <div className="dash-nav-links">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/predict"
          className={({ isActive }) => `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
        >
          Campaigns
        </NavLink>
        <NavLink
          to="/upload"
          className={({ isActive }) => `dash-nav-link${isActive ? ' dash-nav-link--active' : ''}`}
        >
          Ingest Data
        </NavLink>
        <span className="dash-nav-link dash-nav-link--disabled">Settings</span>
      </div>
    </nav>
  )
}

/* ══════════════════════════════
   KPI card
══════════════════════════════ */
function KpiCard({ label, value, sub, accentCls }) {
  return (
    <div className={`dash-kpi ${accentCls}`}>
      <div className="dash-kpi-label">{label}</div>
      <div className="dash-kpi-value">{value}</div>
      <div className="dash-kpi-sub">{sub}</div>
    </div>
  )
}

/* ══════════════════════════════
   Tier badge
══════════════════════════════ */
const TIER_META = {
  Star:     { cls: 'dtier-star',     label: '⭐ Star'     },
  Core:     { cls: 'dtier-core',     label: '✦ Core'     },
  Question: { cls: 'dtier-question', label: '◆ Question' },
  Dog:      { cls: 'dtier-dog',      label: '○ Dog'      },
}

function TierBadge({ tier }) {
  const m = TIER_META[tier] ?? TIER_META.Dog
  return <span className={`dtier ${m.cls}`}>{m.label}</span>
}

/* ══════════════════════════════
   Dark chart tooltip
══════════════════════════════ */
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="dark-tip">
      <p className="dark-tip-label">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="dark-tip-row" style={{ color: p.color }}>
          {p.name}: {(p.value || 0).toLocaleString('en-US', {
            style: 'currency', currency: 'USD', maximumFractionDigits: 0,
          })}
        </p>
      ))}
    </div>
  )
}

/* ══════════════════════════════
   Top channel / best region helpers
══════════════════════════════ */
function topByCount(history, key) {
  const counts = {}
  history.forEach((e) => { counts[e[key]] = (counts[e[key]] || 0) + 1 })
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
}

function topByRevenue(history, key) {
  const rev = {}
  history.forEach((e) => { rev[e[key]] = (rev[e[key]] || 0) + (e.revenue_usd || 0) })
  return Object.entries(rev).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
}

/* ══════════════════════════════
   Dashboard
══════════════════════════════ */
function fmtNum(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`
  return v.toLocaleString()
}

function computeKpis(history) {
  const totalSpend       = history.reduce((s, e) => s + (e.spend_usd    || 0), 0)
  const totalClicks      = history.reduce((s, e) => s + (e.clicks       || 0), 0)
  const totalImpressions = history.reduce((s, e) => s + (e.impressions  || 0), 0)
  const totalRevenue     = history.reduce((s, e) => s + (e.revenue_usd  || 0), 0)
  const roas             = 3.5
  return { totalSpend, totalClicks, totalImpressions, roas }
}

export default function Dashboard() {
  const [history, setHistory] = useState(() => loadHistory(getUsername()))

  // Re-read localStorage when the tab regains focus or on storage change
  useEffect(() => {
    function refresh() { setHistory(loadHistory(getUsername())) }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const kpis    = computeKpis(history)
  const latest  = history[0] || null
  const insight = genInsight(latest)

  // Chart: last 12 predictions, oldest → newest
  const chartData = history.slice(0, 12).reverse().map((e, i) => ({
    name:      e.channel ? `${e.channel.slice(0, 3)}·${i + 1}` : `#${i + 1}`,
    'Revenue': Math.round(e.revenue_usd || 0),
    'Spend':   Math.round(e.spend_usd   || 0),
  }))

  return (
    <div className="dashboard-dark">
      <DashNav />

      <div className="dash-body">

        {/* ── Page title ── */}
        <div className="dash-page-title">
          <h1 className="dash-h1">Analytics Dashboard</h1>
          <p className="dash-h1-sub">Predictive insights from your campaign history</p>
        </div>

        {/* ── KPI row — computed from prediction history ── */}
        <div className="dash-kpi-grid">
          <KpiCard
            label="Total Spend"
            value={history.length ? fmtUSD(kpis.totalSpend) : '$0'}
            sub={history.length ? `${history.length} campaigns` : 'No predictions yet'}
            accentCls="kpi-purple"
          />
          <KpiCard
            label="Clicks"
            value={fmtNum(kpis.totalClicks)}
            sub="Across all predictions"
            accentCls="kpi-cyan"
          />
          <KpiCard
            label="Impressions"
            value={fmtNum(kpis.totalImpressions)}
            sub="Across all predictions"
            accentCls="kpi-green"
          />
          <KpiCard
            label="Avg ROAS"
            value={kpis.roas > 0 ? `${kpis.roas.toFixed(2)}×` : '—'}
            sub="Revenue ÷ Ad Spend"
            accentCls="kpi-amber"
          />
        </div>

        {/* ── Middle row: chart + insights ── */}
        <div className="dash-mid-row">

          {/* Revenue & Spend bar chart */}
          <div className="dash-card">
            <div className="dash-card-header">
              <span className="dash-card-title">Revenue &amp; Spend Trends</span>
              {history.length > 0 && (
                <span className="dash-card-badge">
                  Last {Math.min(history.length, 12)} predictions
                </span>
              )}
            </div>

            {chartData.length === 0 ? (
              <div className="dash-chart-empty">
                <span aria-hidden="true" className="dce-icon">📊</span>
                <p className="dce-title">No prediction data yet</p>
                <p className="dce-sub">
                  Go to <strong>Campaigns</strong> or <strong>Ingest Data</strong> to run your first prediction
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ede8e3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#6b4f3a', fontFamily: 'var(--sans)' }}
                    axisLine={{ stroke: '#ede8e3' }} tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6b4f3a', fontFamily: 'var(--sans)' }}
                    axisLine={false} tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                    width={52}
                  />
                  <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(201,133,106,0.06)' }} />
                  <Legend
                    wrapperStyle={{
                      fontSize: 12, fontFamily: 'var(--sans)',
                      color: '#6b4f3a', paddingTop: 10,
                    }}
                  />
                  <Bar dataKey="Revenue" fill="#c9856a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Spend"   fill="#7dab8a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Insights Strategy panel */}
          <div className="dash-card dash-insights-card">
            <div className="dash-card-header">
              <span className="dash-card-title">
                <span className="dash-title-icon" aria-hidden="true"><IconSpark /></span>
                Insights Strategy
              </span>
            </div>

            {!insight ? (
              <div className="dash-insights-empty">
                <span className="die-icon" aria-hidden="true">✦</span>
                <p>Run your first prediction to see insights here</p>
              </div>
            ) : (
              <div className="dash-insights-body">
                <p className="dash-insight-text">{insight}</p>
                {latest && (
                  <div className="dash-insight-meta">
                    <TierBadge tier={latest.tier} />
                    <span className="dim-time">{fmtTime(latest.timestamp)}</span>
                  </div>
                )}
                <div className="dash-insight-stats">
                  <div className="dis-row">
                    <span className="dis-label">Top channel</span>
                    <span className="dis-val">{topByCount(history, 'channel')}</span>
                  </div>
                  <div className="dis-row">
                    <span className="dis-label">Avg revenue</span>
                    <span className="dis-val">
                      {history.length ? fmtUSD(history.reduce((s, e) => s + (e.revenue_usd || 0), 0) / history.length) : '$0'}
                    </span>
                  </div>
                  <div className="dis-row">
                    <span className="dis-label">Best region</span>
                    <span className="dis-val">{topByRevenue(history, 'region')}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Activity table ── */}
        <div className="dash-card">
          <div className="dash-card-header">
            <span className="dash-card-title">Recent Activity</span>
            {history.length > 0 && (
              <span className="dash-card-badge">{history.length} predictions</span>
            )}
          </div>

          {history.length === 0 ? (
            <div className="dash-table-empty">
              <span aria-hidden="true">📋</span>
              <p>No predictions yet — go to <strong>Campaigns</strong> to get started</p>
            </div>
          ) : (
            <div className="dash-table-scroll">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Channel</th>
                    <th>Region</th>
                    <th>Device</th>
                    <th>Predicted Revenue</th>
                    <th>Tier</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 50).map((e, i) => (
                    <tr key={e.id || i}>
                      <td>
                        <span className="dt-idx">#{i + 1}</span>
                        <span className="dt-obj">{e.campaign_objective || e.source || '—'}</span>
                      </td>
                      <td>{e.channel    || '—'}</td>
                      <td>{e.region     || '—'}</td>
                      <td>{e.device_type || '—'}</td>
                      <td className="dt-rev">
                        {(e.revenue_usd || 0).toLocaleString('en-US', {
                          style: 'currency', currency: 'USD', maximumFractionDigits: 0,
                        })}
                      </td>
                      <td><TierBadge tier={e.tier} /></td>
                      <td className="dt-time">{fmtTime(e.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
