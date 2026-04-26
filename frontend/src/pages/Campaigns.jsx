import { useState, useEffect, useCallback } from 'react'
import api from '../services/api'
import './Campaigns.css'

function StatusPill({ status }) {
  const enabled = status === 'ENABLED'
  return (
    <span className={`camp-status ${enabled ? 'camp-status--enabled' : 'camp-status--paused'}`}>
      <span className="camp-status-dot" />
      {enabled ? 'Enabled' : 'Paused'}
    </span>
  )
}

function fmtINR(v) {
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`
  return `₹${Math.round(v).toLocaleString('en-IN')}`
}

function fmtNum(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`
  return v.toLocaleString()
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get('/google-ads/campaigns')
      setCampaigns(res.data.campaigns || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load campaign data')
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = async () => {
    setSyncing(true)
    await load()
    setSyncing(false)
  }

  useEffect(() => { load() }, [load])

  return (
    <div className="camp-page">
      <div className="camp-header">
        <div>
          <h1 className="camp-h1">Campaigns</h1>
          <p className="camp-sub">Live performance · last 30 days from Google Ads</p>
        </div>
        <button className="camp-refresh-btn" onClick={refresh} disabled={loading || syncing}>
          {syncing || loading
            ? <><span className="camp-spinner" /> Refreshing…</>
            : <>↻ Refresh</>}
        </button>
      </div>

      <div className="camp-card">
        {loading ? (
          <div className="camp-loading">
            <span className="camp-spinner camp-spinner--lg" />
            <p>Loading campaigns…</p>
          </div>
        ) : error ? (
          <div className="camp-error">
            <strong>Could not load campaigns</strong>
            <p>{error}</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="camp-empty">
            <span className="camp-empty-icon">📋</span>
            <p>No campaigns found in the last 30 days</p>
          </div>
        ) : (
          <div className="camp-table-scroll">
            <table className="camp-table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Status</th>
                  <th>Spend</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>Conversions</th>
                  <th>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaign_id}>
                    <td className="camp-name">{c.campaign_name}</td>
                    <td><StatusPill status={c.status} /></td>
                    <td className="camp-spend">{fmtINR(c.spend_inr)}</td>
                    <td>{fmtNum(c.impressions)}</td>
                    <td>{fmtNum(c.clicks)}</td>
                    <td>{c.conversions.toLocaleString()}</td>
                    <td className="camp-roas">
                      {c.roas > 0 ? `${c.roas.toFixed(2)}×` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
