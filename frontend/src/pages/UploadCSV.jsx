import { useRef, useState, useEffect } from 'react'
import './UploadCSV.css'
import api from '../services/api'
import { getUsername, appendToHistory, getTierLabel } from '../services/history'

function fmt(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

function diffClass(actual, predicted) {
  if (actual == null || actual === 0) return ''
  return Math.abs((actual - predicted) / actual) <= 0.20 ? 'diff-good' : 'diff-bad'
}

function successStatus(predicted) {
  if (predicted == null) return null
  if (predicted > 19000) return { label: '✓ Likely',   cls: 'status-success' }
  if (predicted < 5000)  return { label: '✗ At Risk',  cls: 'status-risk' }
  return                        { label: '~ Moderate', cls: 'status-moderate' }
}

function getRowTip(r) {
  if (r.predicted_revenue_usd == null || r.predicted_revenue_usd >= 5000) return null
  if (r.channel && r.channel.toLowerCase() !== 'search') return 'Switch to Search'
  if (r.spend_usd != null && r.spend_usd < 500) return 'Increase budget'
  return 'Optimize targeting'
}

function computeImprovementTips(validRows) {
  if (validRows.length === 0) return []
  const tips = []

  const atRisk     = validRows.filter((r) => r.predicted_revenue_usd < 5000)
  const nonSearch  = atRisk.filter((r) => r.channel && r.channel.toLowerCase() !== 'search')
  if (nonSearch.length > 0) {
    tips.push(`${nonSearch.length} at-risk campaign${nonSearch.length > 1 ? 's are' : ' is'} on non-Search channels — switching to Search typically adds +47% revenue`)
  }

  const lowSpend = atRisk.filter((r) => r.spend_usd != null && r.spend_usd < 500)
  if (lowSpend.length > 0) {
    tips.push(`${lowSpend.length} at-risk campaign${lowSpend.length > 1 ? 's have' : ' has'} spend below $500 — increasing budget generally improves predicted performance`)
  }

  const channelSucc = {}, channelTotal = {}
  validRows.forEach((r) => {
    const ch = r.channel || 'Unknown'
    channelTotal[ch] = (channelTotal[ch] || 0) + 1
    if (r.predicted_revenue_usd > 19000) channelSucc[ch] = (channelSucc[ch] || 0) + 1
  })
  let bestCh = null, bestRate = -1
  Object.keys(channelTotal).forEach((ch) => {
    const rate = (channelSucc[ch] || 0) / channelTotal[ch]
    if (rate > bestRate) { bestRate = rate; bestCh = ch }
  })
  if (bestCh && bestRate > 0) {
    tips.push(`${bestCh} has the highest success rate in your data (${Math.round(bestRate * 100)}%) — allocate more budget there`)
  }

  if (tips.length < 3) {
    tips.push('Focus on improving ad quality score and conversion rate — these are top revenue drivers in the Ridge Regression model')
  }

  return tips.slice(0, 4)
}

/* ══════════════════════════════
   Summary helpers (shared with modal)
══════════════════════════════ */
function getSuccessProbability(rev) {
  if (rev >= 12000) return 92
  if (rev >= 6000)  return 74
  if (rev >= 2000)  return 52
  return 24
}

function parseReport(text) {
  if (!text) return []
  const sections = []
  let current = null
  for (const line of text.split('\n')) {
    if (/^\d+\.\s+[A-Z][A-Z\s()]+$/.test(line.trim())) {
      if (current) sections.push(current)
      current = { heading: line.trim(), body: '' }
    } else if (current !== null) {
      current.body += (current.body ? '\n' : '') + line
    }
  }
  if (current) sections.push(current)
  return sections.map(s => ({ ...s, body: s.body.trim() }))
}

function buildRowPrompt(row) {
  const rev   = row.predicted_revenue_usd || 0
  const roas  = row.spend_usd > 0 ? (rev / row.spend_usd).toFixed(2) : 'N/A'
  const tier  = getTierLabel(rev)
  const prob  = getSuccessProbability(rev)
  return `You are a senior marketing analyst. Write a professional 1-page business summary report for a non-technical audience based on this campaign data:

Campaign Details:
- Channel: ${row.channel || 'N/A'}
- Region: ${row.region || 'N/A'}
- Device: ${row.device_type || 'N/A'}
- Audience: N/A
- Objective: N/A
- Ad Spend: $${Number(row.spend_usd || 0).toLocaleString()}
- Impressions: ${Number(row.impressions || 0).toLocaleString()}
- Clicks: ${Number(row.clicks || 0).toLocaleString()}
- Conversions: N/A
- Predicted Revenue: $${rev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- ROAS: ${roas}
- Campaign Tier: ${tier}
- Success Probability: ${prob}%

Write the report in these exact sections:

1. EXECUTIVE SUMMARY (2-3 sentences, plain English, what this campaign achieved)

2. KEY FINDINGS (3-4 bullet points about what the data tells us)

3. PERFORMANCE ASSESSMENT (1 paragraph — is this campaign performing well? Compare ROAS to industry benchmark of 3x. Is the conversion rate healthy?)

4. STRATEGIC RECOMMENDATIONS (exactly 3 actionable recommendations to improve this specific campaign's ROI and performance, be specific to the channel and region)

5. RISK FACTORS (2 bullet points — what could go wrong with this campaign)

6. CONCLUSION (1-2 sentences — overall verdict for a business decision maker)

Keep language simple, professional, no jargon. Write as if presenting to a CEO.`
}

function openPrintWindow(summary, subtitle) {
  const sections = parseReport(summary)
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const html = `<!DOCTYPE html><html><head><title>Campaign Business Summary</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;color:#1a0f0a;line-height:1.65}
  h1{font-family:Georgia,serif;font-size:22px;color:#a8644e;margin:0 0 4px}
  .sub{font-size:12px;color:#6b4f3a;margin:0 0 20px}
  hr{border:none;border-top:1px solid #ede8e3;margin:20px 0}
  .sec-h{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#a8644e;margin:22px 0 7px}
  .sec-b{font-size:13px;white-space:pre-line;color:#4a3728}
  footer{margin-top:36px;padding-top:12px;border-top:1px solid #ede8e3;font-size:10px;color:#aaa;text-align:center}
  @page{size:A4;margin:18mm}
</style></head><body>
<h1>Campaign Business Summary</h1>
<p class="sub">${subtitle} &nbsp;&middot;&nbsp; ${date}</p>
<hr>
${sections.map(s => `<div class="sec-h">${s.heading}</div><div class="sec-b">${s.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('\n')}
<footer>Generated by CampaignIQ &nbsp;&middot;&nbsp; Ridge Regression Model &nbsp;&middot;&nbsp; Accuracy 89%</footer>
</body></html>`
  const win = window.open('', '_blank', 'width=800,height=900')
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
  setTimeout(() => win.close(), 1500)
}

/* ══════════════════════════════
   Summary Modal
══════════════════════════════ */
function SummaryModal({ row, onClose }) {
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [summary, setSummary] = useState(null)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    fetchSummary()
  }, [])

  async function fetchSummary() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/advisor', {
        messages: [{ role: 'user', content: buildRowPrompt(row) }],
        system_prompt: 'You are a senior marketing analyst. Write professional business reports exactly as instructed. Use the exact numbered section headings specified.',
        max_tokens: 1200,
      })
      setSummary(res.data.response)
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!summary) return
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handlePrint() {
    openPrintWindow(summary, `Row #${row.row_number} · ${row.channel} · ${row.region}`)
  }

  const subtitle = `Row #${row.row_number} · ${row.channel || '—'} · ${row.region || '—'} · ${row.device_type || '—'}`

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Campaign Business Summary</h2>
            <span className="modal-sub">{subtitle}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {loading && (
            <div className="modal-loading">
              <span className="spinner spinner--lg" aria-hidden="true" />
              <span>Generating AI report…</span>
            </div>
          )}

          {error && !loading && (
            <div className="modal-error">
              <span>{error}</span>
              <button className="modal-retry" onClick={fetchSummary}>Retry</button>
            </div>
          )}

          {summary && !loading && (
            <div className="modal-summary">
              {parseReport(summary).length > 0
                ? parseReport(summary).map((sec, i) => (
                    <div key={i} className="ai-sec">
                      <div className="ai-sec-heading">{sec.heading}</div>
                      <div className="ai-sec-body">{sec.body}</div>
                    </div>
                  ))
                : <div className="ai-sec-body">{summary}</div>
              }
            </div>
          )}
        </div>

        {/* Footer actions */}
        {summary && !loading && (
          <div className="modal-footer">
            <span className="modal-footer-note">
              Generated by CampaignIQ · Accuracy 89%
            </span>
            <div className="modal-footer-actions">
              <button className="ai-act-btn" onClick={handleCopy}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
              <button className="ai-act-btn ai-act-btn--primary" onClick={handlePrint}>
                Export PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Upload icon SVG ── */
function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

/* ── Animated progress bar ── */
function ProgressBar({ fileName }) {
  const [pct, setPct] = useState(8)

  useEffect(() => {
    const steps = [20, 38, 55, 70, 82, 90, 95]
    let i = 0
    const id = setInterval(() => {
      if (i < steps.length) { setPct(steps[i++]) }
      else clearInterval(id)
    }, 320)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="progress-wrap">
      <div className="progress-label">
        <span>Processing <strong>{fileName}</strong>…</span>
        <span>{pct}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function UploadCSV() {
  const inputRef                = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [result, setResult]     = useState(null)
  const [modalRow, setModalRow] = useState(null)

  function handleFile(file) {
    if (!file) return
    if (!file.name.endsWith('.csv')) { setError('Please upload a .csv file.'); return }
    setFileName(file.name)
    setError(null)
    setResult(null)
    upload(file)
  }

  async function upload(file) {
    setLoading(true)
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await api.post('/upload-csv', body)
      setResult(res.data)
      const validPreds = (res.data.rows || [])
        .filter((r) => r.predicted_revenue_usd != null && !r.error)
        .sort((a, b) => b.predicted_revenue_usd - a.predicted_revenue_usd)
        .slice(0, 50)
      const u = getUsername()
      validPreds.forEach((r, i) => appendToHistory(u, {
        id: Date.now() + i,
        timestamp: new Date().toISOString(),
        source: 'upload',
        channel: r.channel || '—',
        region: r.region || '—',
        device_type: r.device_type || '—',
        audience_segment: '—',
        campaign_objective: '—',
        impressions: r.impressions || 0,
        clicks: r.clicks || 0,
        spend_usd: r.spend_usd || 0,
        revenue_usd: r.predicted_revenue_usd,
        tier: getTierLabel(r.predicted_revenue_usd),
      }))
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  /* ── Derived stats from results ── */
  const rows      = result?.rows ?? []
  const validRows = rows.filter((r) => r.predicted_revenue_usd != null)
  const hasActual = validRows.some((r) => r.actual_revenue_usd != null)

  const totalCampaigns = validRows.length

  const successCount = validRows.filter((r) => r.predicted_revenue_usd > 19000).length
  const successPct   = totalCampaigns > 0 ? Math.round((successCount / totalCampaigns) * 100) : 0

  const atRiskCount = validRows.filter((r) => r.predicted_revenue_usd < 5000).length

  const roasRows = validRows.filter((r) => r.spend_usd > 0)
  const avgRoas  = roasRows.length > 0
    ? roasRows.reduce((sum, r) => sum + r.predicted_revenue_usd / r.spend_usd, 0) / roasRows.length
    : null

  const starCount     = validRows.filter((r) => r.predicted_revenue_usd > 25000).length
  const coreCount     = validRows.filter((r) => r.predicted_revenue_usd >= 10000 && r.predicted_revenue_usd <= 25000).length
  const questionCount = validRows.filter((r) => r.predicted_revenue_usd >= 5000  && r.predicted_revenue_usd < 10000).length
  const dogCount      = validRows.filter((r) => r.predicted_revenue_usd < 5000).length

  const healthTiers = [
    { label: 'Star',          range: '> $25k',      count: starCount,     cls: 'health-star',     pct: totalCampaigns > 0 ? (starCount / totalCampaigns) * 100 : 0 },
    { label: 'Core',          range: '$10k – $25k', count: coreCount,     cls: 'health-core',     pct: totalCampaigns > 0 ? (coreCount / totalCampaigns) * 100 : 0 },
    { label: 'Question Mark', range: '$5k – $10k',  count: questionCount, cls: 'health-question', pct: totalCampaigns > 0 ? (questionCount / totalCampaigns) * 100 : 0 },
    { label: 'At Risk',       range: '< $5k',       count: dogCount,      cls: 'health-dog',      pct: totalCampaigns > 0 ? (dogCount / totalCampaigns) * 100 : 0 },
  ]

  return (
    <div className="upload-page">
      <div className="upload-header">
        <h1>Batch Predict</h1>
        <p className="upload-sub">Upload a campaign CSV to generate revenue predictions for every row</p>
      </div>

      {/* Drop zone */}
      <div
        className={[
          'drop-zone',
          dragging  ? 'drop-zone--over'    : '',
          loading   ? 'drop-zone--loading' : '',
        ].join(' ').trim()}
        onClick={() => !loading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !loading && inputRef.current?.click()}
        aria-label="Upload CSV file"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          hidden
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div className="drop-icon-wrap" aria-hidden="true">
          <UploadIcon />
        </div>
        <span className="drop-zone-title">
          {fileName && !loading ? fileName : 'Drop your CSV here'}
        </span>
        <span className="drop-zone-hint">
          {loading ? 'Processing…' : fileName ? 'Click or drop a new file to replace' : 'or click to browse — .csv files only'}
        </span>
      </div>

      {/* Progress bar while loading */}
      {loading && <ProgressBar fileName={fileName} />}

      {/* Error */}
      {error && !loading && (
        <div className="upload-error">
          <strong>Upload failed</strong>
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* ── Summary cards ── */}
          <div className="summary-row">
            <div className="summary-card">
              <span className="summary-label">Total Campaigns</span>
              <span className="summary-value">{totalCampaigns.toLocaleString()}</span>
              <span className="summary-meta">of {rows.length} rows processed</span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Successful Campaigns</span>
              <span className="summary-value summary-value--success">
                {successCount.toLocaleString()} <span className="summary-pct">({successPct}%)</span>
              </span>
              <span className="summary-meta">predicted revenue &gt; $19k</span>
            </div>

            <div className="summary-card">
              <span className="summary-label">At Risk Campaigns</span>
              <span className="summary-value summary-value--risk">
                {atRiskCount.toLocaleString()}
              </span>
              <span className="summary-meta">predicted revenue &lt; $5k</span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Avg Predicted ROAS</span>
              <span className="summary-value">
                {avgRoas != null ? `${avgRoas.toFixed(1)}×` : '—'}
              </span>
              <span className="summary-meta">return on ad spend</span>
            </div>
          </div>

          {/* ── Campaign Health ── */}
          {totalCampaigns > 0 && (
            <div className="campaign-health">
              <div className="health-header">
                <span className="health-title">Campaign Health</span>
                <span className="health-sub">Revenue tier breakdown across {totalCampaigns} campaigns</span>
              </div>

              <div className="health-tiers">
                {healthTiers.map((tier) => (
                  <div key={tier.label} className={`health-tier ${tier.cls}`}>
                    <div className="health-tier-top">
                      <span className="health-tier-label">{tier.label}</span>
                      <span className="health-tier-range">{tier.range}</span>
                    </div>
                    <div className="health-tier-count">{tier.count.toLocaleString()}</div>
                    <div className="health-tier-bar-track">
                      <div
                        className="health-tier-bar-fill"
                        style={{ width: `${tier.pct}%` }}
                      />
                    </div>
                    <div className="health-tier-pct">{tier.pct.toFixed(0)}% of campaigns</div>
                  </div>
                ))}
              </div>

              {dogCount > 0 && (
                <div className="at-risk-tips">
                  <div className="tips-header">
                    <span className="tips-icon">💡</span>
                    <span className="tips-title">Tips to improve {dogCount} at-risk campaign{dogCount !== 1 ? 's' : ''}</span>
                  </div>
                  <ul className="tips-list">
                    <li>Switch to <strong>Search channel</strong> — averages <strong>+47%</strong> higher revenue vs. other channels</li>
                    <li>Target the <strong>East region</strong> — outperforms average by <strong>+23%</strong></li>
                    <li>Prioritize <strong>conversion rate</strong> — it is the #1 driver of predicted revenue in the model</li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Table ── */}
          <div className="table-wrap">
            <div className="table-scroll">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Channel</th>
                    <th>Region</th>
                    <th>Device</th>
                    <th>Spend</th>
                    {hasActual && <th>Actual Revenue</th>}
                    <th>Predicted Revenue</th>
                    <th>Success</th>
                    <th>Tips</th>
                    {hasActual && <th>Difference</th>}
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const status = r.predicted_revenue_usd != null ? successStatus(r.predicted_revenue_usd) : null
                    const tip    = getRowTip(r)
                    return r.error ? (
                      <tr key={r.row_number} className="row-error">
                        <td>{r.row_number}</td>
                        <td colSpan={hasActual ? 10 : 8} className="error-cell">{r.error}</td>
                      </tr>
                    ) : (
                      <tr key={r.row_number}>
                        <td>{r.row_number}</td>
                        <td>{r.channel}</td>
                        <td>{r.region}</td>
                        <td>{r.device_type}</td>
                        <td>{fmt(r.spend_usd)}</td>
                        {hasActual && <td>{fmt(r.actual_revenue_usd)}</td>}
                        <td>{fmt(r.predicted_revenue_usd)}</td>
                        <td>
                          {status && (
                            <span className={`status-badge ${status.cls}`}>{status.label}</span>
                          )}
                        </td>
                        <td>
                          {tip && (
                            <span className="tip-badge">{tip}</span>
                          )}
                        </td>
                        {hasActual && (
                          <td className={diffClass(r.actual_revenue_usd, r.predicted_revenue_usd)}>
                            {r.difference != null ? fmt(r.difference) : '—'}
                          </td>
                        )}
                        <td>
                          <button
                            className="row-summary-btn"
                            onClick={() => setModalRow(r)}
                          >
                            Summary
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Results Summary ── */}
          {totalCampaigns > 0 && (() => {
            const tips    = computeImprovementTips(validRows)
            const sucPct  = Math.round((successCount / totalCampaigns) * 100)
            const rateColor = sucPct >= 50 ? 'var(--sage)' : sucPct >= 25 ? 'var(--amber)' : 'var(--terra)'
            return (
              <div className="results-summary">
                <div className="results-summary-rate">
                  <div className="rsr-label">Success Rate</div>
                  <div className="rsr-value" style={{ color: rateColor }}>{sucPct}%</div>
                  <div className="rsr-sub">of campaigns predicted above $19k</div>
                  <div className="rsr-chips">
                    <span className="rsr-chip rsr-chip--success">{successCount} Likely</span>
                    <span className="rsr-chip rsr-chip--moderate">
                      {validRows.filter(r => r.predicted_revenue_usd >= 5000 && r.predicted_revenue_usd <= 19000).length} Moderate
                    </span>
                    <span className="rsr-chip rsr-chip--risk">{atRiskCount} At Risk</span>
                  </div>
                </div>
                <div className="results-summary-tips">
                  <div className="rst-header">
                    <span className="rst-icon">💡</span>
                    <span className="rst-title">How to Improve</span>
                    <span className="rst-sub">Based on your uploaded data patterns</span>
                  </div>
                  <ul className="rst-list">
                    {tips.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── Summary modal ── */}
      {modalRow && (
        <SummaryModal row={modalRow} onClose={() => setModalRow(null)} />
      )}
    </div>
  )
}
