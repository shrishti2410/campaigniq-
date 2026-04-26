import { useState, useEffect, useRef } from 'react'
import './Predict.css'
import '../pages/BCGMatrix.css'
import api from '../services/api'
import { getUsername, appendToHistory, getTierLabel } from '../services/history'

const CHANNELS            = ['Affiliate', 'Social', 'Video', 'Search', 'Email', 'Display']
const REGIONS             = ['North', 'South', 'Central', 'West', 'East']
const DEVICE_TYPES        = ['Mobile', 'CTV', 'Tablet', 'Desktop']
const AUDIENCE_SEGMENTS   = ['Gen X', 'Gen Z', 'Millennials', 'Boomers']
const CAMPAIGN_OBJECTIVES = ['Traffic', 'App Installs', 'Awareness', 'Sales', 'Leads']
const DAYS_OF_WEEK        = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DEFAULTS = {
  channel: 'Search', region: 'East', device_type: 'Mobile',
  audience_segment: 'Millennials', campaign_objective: 'Sales',
  impressions: 100000, clicks: 3500, spend_usd: 1200, conversions: 105,
  ctr_pct: 3.5, conversion_rate_pct: 3.0, bounce_rate_pct: 50.0,
  session_duration_sec: 120.0, audience_age: 30, ad_quality_score: 5.0,
  month: 1, day_of_week: 0, quarter: 1,
}

const NUMERIC = new Set([
  'impressions', 'clicks', 'spend_usd', 'conversions', 'ctr_pct',
  'conversion_rate_pct', 'bounce_rate_pct', 'session_duration_sec',
  'audience_age', 'ad_quality_score', 'month', 'day_of_week', 'quarter',
])

/* ══════════════════════════════
   Count-up animation hook
══════════════════════════════ */
function useCountUp(target, duration = 1100) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    if (target === null || target === undefined) { setDisplay(0); return }

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const startTime = performance.now()

    function step(now) {
      const t = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 4)
      setDisplay(target * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return display
}

/* ══════════════════════════════
   BCG quadrant
══════════════════════════════ */
const BCG_META = {
  star:     { label: 'BCG Star',          symbol: '★', mod: 'star'     },
  cashcow:  { label: 'BCG Cash Cow',      symbol: '◆', mod: 'cashcow'  },
  question: { label: 'BCG Question Mark', symbol: '?', mod: 'question' },
  dog:      { label: 'BCG Dog',           symbol: '▼', mod: 'dog'      },
}

function getBCGQuadrant(revenue, roasNum) {
  const highRoas = roasNum >= 2.0
  const highRev  = revenue >= 6000
  if (highRoas && highRev)  return 'star'
  if (!highRoas && highRev) return 'question'
  if (highRoas && !highRev) return 'cashcow'
  return 'dog'
}

/* ══════════════════════════════
   Tier classification
══════════════════════════════ */
function getTier(revenue) {
  if (revenue >= 12000) return { label: 'Star Campaign',   emoji: '⭐', cls: 'tier-star',     desc: 'Top-tier performer' }
  if (revenue >=  6000) return { label: 'Core Campaign',   emoji: '✦',  cls: 'tier-core',     desc: 'Strong revenue driver' }
  if (revenue >=  2000) return { label: 'Question Mark',   emoji: '◆',  cls: 'tier-question', desc: 'Growth opportunity' }
  return                        { label: 'Underperformer', emoji: '○',  cls: 'tier-dog',      desc: 'Needs optimization' }
}

/* ══════════════════════════════
   Animated result number
══════════════════════════════ */
function AnimatedRevenue({ value }) {
  const animated = useCountUp(value)
  return (
    <span className="result-value">
      {animated.toLocaleString('en-US', {
        style: 'currency', currency: 'USD',
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      })}
    </span>
  )
}

/* ══════════════════════════════
   Summary helpers
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

function buildSummaryPrompt(form, revenue, roas, tier) {
  const probability = getSuccessProbability(revenue)
  return `You are a senior marketing analyst. Write a professional 1-page business summary report for a non-technical audience based on this campaign data:

Campaign Details:
- Channel: ${form.channel}
- Region: ${form.region}
- Device: ${form.device_type}
- Audience: ${form.audience_segment}
- Objective: ${form.campaign_objective}
- Ad Spend: $${Number(form.spend_usd).toLocaleString()}
- Impressions: ${Number(form.impressions).toLocaleString()}
- Clicks: ${Number(form.clicks).toLocaleString()}
- Conversions: ${form.conversions}
- Predicted Revenue: $${revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- ROAS: ${roas}
- Campaign Tier: ${tier?.label || 'Unknown'}
- Success Probability: ${probability}%

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
   Component
══════════════════════════════ */
export default function Predict() {
  const [form, setForm]       = useState(DEFAULTS)
  const [revenue, setRevenue] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const [summary, setSummary]               = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError]     = useState(null)
  const [copied, setCopied]                 = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: NUMERIC.has(name) ? Number(value) : value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setRevenue(null)
    setSummary(null)
    setSummaryError(null)
    try {
      const res = await api.post('/predict', form)
      setRevenue(res.data.revenue_usd)
      appendToHistory(getUsername(), {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        source: 'predict',
        channel: form.channel,
        region: form.region,
        device_type: form.device_type,
        audience_segment: form.audience_segment,
        campaign_objective: form.campaign_objective,
        impressions: form.impressions,
        clicks: form.clicks,
        spend_usd: form.spend_usd,
        revenue_usd: res.data.revenue_usd,
        tier: getTierLabel(res.data.revenue_usd),
      })
    } catch (err) {
      setError(err.response?.data || { message: err.message })
    } finally {
      setLoading(false)
    }
  }

  async function generateSummary() {
    setSummaryLoading(true)
    setSummaryError(null)
    setSummary(null)
    try {
      const prompt = buildSummaryPrompt(form, revenue, roas, tier)
      const res = await api.post('/advisor', {
        messages: [{ role: 'user', content: prompt }],
        system_prompt: 'You are a senior marketing analyst. Write professional business reports exactly as instructed. Use the exact numbered section headings specified.',
        max_tokens: 1200,
      })
      setSummary(res.data.response)
    } catch (err) {
      setSummaryError(err.response?.data?.detail || err.message || 'Failed to generate summary')
    } finally {
      setSummaryLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handlePrintSummary() {
    openPrintWindow(summary, `${form.channel} · ${form.region} · ${form.device_type}`)
  }

  const derivedCtr = form.impressions > 0
    ? ((form.clicks / form.impressions) * 100).toFixed(2)
    : '0.00'

  const roasNum = revenue !== null && form.spend_usd > 0
    ? revenue / form.spend_usd
    : null

  const roas = roasNum !== null ? roasNum.toFixed(2) : null
  const tier = revenue !== null ? getTier(revenue) : null
  const bcg  = revenue !== null && roasNum !== null
    ? BCG_META[getBCGQuadrant(revenue, roasNum)]
    : null

  return (
    <div className="predict-page">
      <div className="predict-header">
        <h1>Revenue Predictor</h1>
        <p className="predict-sub">Configure your campaign parameters to forecast expected revenue</p>
      </div>

      <div className="predict-layout">

        {/* ── Form ── */}
        <form className="predict-form" onSubmit={handleSubmit} noValidate>

          <div className="field-group">
            <div className="group-header">
              <span className="group-icon">🎯</span>
              <span className="group-title">Campaign Targeting</span>
            </div>
            <div className="field-row">
              <label className="field"><span>Channel</span>
                <select name="channel" value={form.channel} onChange={handleChange}>
                  {CHANNELS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="field"><span>Region</span>
                <select name="region" value={form.region} onChange={handleChange}>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </label>
              <label className="field"><span>Device Type</span>
                <select name="device_type" value={form.device_type} onChange={handleChange}>
                  {DEVICE_TYPES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </label>
              <label className="field"><span>Audience</span>
                <select name="audience_segment" value={form.audience_segment} onChange={handleChange}>
                  {AUDIENCE_SEGMENTS.map((a) => <option key={a}>{a}</option>)}
                </select>
              </label>
              <label className="field"><span>Objective</span>
                <select name="campaign_objective" value={form.campaign_objective} onChange={handleChange}>
                  {CAMPAIGN_OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="field-group">
            <div className="group-header">
              <span className="group-icon">📊</span>
              <span className="group-title">Performance Metrics</span>
            </div>
            <div className="field-row">
              <label className="field"><span>Impressions</span>
                <input type="number" name="impressions" value={form.impressions} min={0} step={1000} onChange={handleChange} required />
              </label>
              <label className="field"><span>Clicks</span>
                <input type="number" name="clicks" value={form.clicks} min={0} step={100} onChange={handleChange} required />
              </label>
              <label className="field"><span>Conversions</span>
                <input type="number" name="conversions" value={form.conversions} min={0} step={1} onChange={handleChange} required />
              </label>
              <label className="field"><span>CTR (derived)</span>
                <input className="field-derived" type="text" readOnly value={`${derivedCtr}%`} tabIndex={-1} />
              </label>
            </div>
          </div>

          <div className="field-group">
            <div className="group-header">
              <span className="group-icon">💰</span>
              <span className="group-title">Budget</span>
            </div>
            <div className="field-row">
              <label className="field"><span>Spend (USD)</span>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input type="number" name="spend_usd" value={form.spend_usd} min={0} step={10} onChange={handleChange} required />
                </div>
              </label>
            </div>
          </div>

          <div className="field-group">
            <div className="group-header">
              <span className="group-icon">⚙️</span>
              <span className="group-title">Advanced Parameters</span>
            </div>
            <div className="field-row">
              <label className="field"><span>CTR %</span>
                <input type="number" name="ctr_pct" value={form.ctr_pct} min={0} max={100} step={0.01} onChange={handleChange} />
              </label>
              <label className="field"><span>Conv. Rate %</span>
                <input type="number" name="conversion_rate_pct" value={form.conversion_rate_pct} min={0} max={100} step={0.01} onChange={handleChange} />
              </label>
              <label className="field"><span>Bounce Rate %</span>
                <input type="number" name="bounce_rate_pct" value={form.bounce_rate_pct} min={0} max={100} step={0.1} onChange={handleChange} />
              </label>
              <label className="field"><span>Session Duration (s)</span>
                <input type="number" name="session_duration_sec" value={form.session_duration_sec} min={0} step={1} onChange={handleChange} />
              </label>
              <label className="field"><span>Audience Age</span>
                <input type="number" name="audience_age" value={form.audience_age} min={13} max={99} step={1} onChange={handleChange} />
              </label>
              <label className="field"><span>Ad Quality Score</span>
                <input type="number" name="ad_quality_score" value={form.ad_quality_score} min={1} max={10} step={0.1} onChange={handleChange} />
              </label>
              <label className="field"><span>Month</span>
                <input type="number" name="month" value={form.month} min={1} max={12} step={1} onChange={handleChange} />
              </label>
              <label className="field"><span>Day of Week</span>
                <select name="day_of_week" value={form.day_of_week} onChange={handleChange}>
                  {DAYS_OF_WEEK.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
              <label className="field"><span>Quarter</span>
                <select name="quarter" value={form.quarter} onChange={handleChange}>
                  {[1,2,3,4].map((q) => <option key={q} value={q}>Q{q}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="form-footer">
            <button type="submit" className="submit-btn" disabled={loading}>
              {loading
                ? <><span className="spinner" aria-hidden="true" /> Predicting…</>
                : 'Predict Revenue'}
            </button>
          </div>
        </form>

        {/* ── Result panel ── */}
        <div className="result-panel">
          {!revenue && !error && !loading && (
            <div className="result-empty">
              <span className="result-empty-icon" aria-hidden="true">✦</span>
              <p>Configure your campaign<br />and click <strong>Predict Revenue</strong></p>
            </div>
          )}

          {loading && (
            <div className="result-empty">
              <span className="spinner spinner--lg" aria-hidden="true" />
              <p>Running model…</p>
            </div>
          )}

          {error && !loading && (
            <div className="result-error">
              <strong>Prediction failed</strong>
              <p>{error?.detail || error?.message || JSON.stringify(error) || 'Unknown error'}</p>
            </div>
          )}

          {revenue !== null && !loading && tier && (
            <div className="result-card">
              <div className="result-card-top">
                <span className="result-label">Predicted Revenue</span>

                <AnimatedRevenue value={revenue} />

                <span className="result-meta">
                  {form.channel} · {form.region} · {form.device_type}
                </span>

                {roas && (
                  <div className="roas-indicator">
                    <span className="roas-label">ROAS</span>
                    <span className="roas-value">{roas}×</span>
                  </div>
                )}

                <div className={`tier-badge ${tier.cls}`}>
                  {tier.emoji} {tier.label} — {tier.desc}
                </div>

                {bcg && (
                  <div className={`bcg-badge bcg-badge--${bcg.mod}`}>
                    {bcg.symbol} {bcg.label}
                  </div>
                )}
              </div>

              <div className="result-stats">
                <div className="result-stat">
                  <span className="stat-val">{Number(form.impressions).toLocaleString()}</span>
                  <span className="stat-label">Impressions</span>
                </div>
                <div className="result-stat">
                  <span className="stat-val">{Number(form.clicks).toLocaleString()}</span>
                  <span className="stat-label">Clicks</span>
                </div>
                <div className="result-stat">
                  <span className="stat-val">{derivedCtr}%</span>
                  <span className="stat-label">CTR</span>
                </div>
                <div className="result-stat">
                  <span className="stat-val">${Number(form.spend_usd).toLocaleString()}</span>
                  <span className="stat-label">Spend</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Generate Business Summary button ── */}
          {revenue !== null && !loading && (
            <div className="gen-summary-area">
              {!summaryLoading && !summary && (
                <button className="gen-summary-btn" onClick={generateSummary}>
                  ✦ Generate Business Summary
                </button>
              )}
              {summaryLoading && (
                <div className="gen-summary-loading">
                  <span className="spinner spinner--lg" aria-hidden="true" />
                  <span>Generating AI report…</span>
                </div>
              )}
              {summaryError && !summaryLoading && (
                <div className="gen-summary-error">
                  {summaryError}
                  <button className="gen-summary-retry" onClick={generateSummary}>Retry</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── AI Business Summary card (full width, below layout) ── */}
      {summary && !summaryLoading && (
        <div className="predict-summary-section">
          <div className="ai-summary-card">
            <div className="ai-summary-header">
              <div>
                <h2 className="ai-summary-title">Campaign Business Summary</h2>
                <span className="ai-summary-meta">
                  {form.channel} · {form.region} · {form.device_type} · {tier?.label}
                </span>
              </div>
              <div className="ai-summary-actions">
                <button className="ai-act-btn" onClick={handleCopy}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
                <button className="ai-act-btn ai-act-btn--primary" onClick={handlePrintSummary}>
                  Export PDF
                </button>
                <button className="ai-act-btn" onClick={() => { setSummary(null); setSummaryError(null) }}>
                  Dismiss
                </button>
              </div>
            </div>

            <div className="ai-summary-body">
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

            <div className="ai-summary-footer">
              Generated by CampaignIQ &nbsp;&middot;&nbsp; Ridge Regression Model &nbsp;&middot;&nbsp; Accuracy 89%
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
