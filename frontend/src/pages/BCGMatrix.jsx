import { useState, useEffect, useMemo } from 'react'
import { loadHistory, getUsername } from '../services/history'
import './BCGMatrix.css'

/* ══════════════════════════════
   Constants
══════════════════════════════ */
const Q_META = {
  star:     { label: 'Star',          symbol: '★', color: '#d4a84b', fill: 'rgba(212,168,75,0.07)'  },
  question: { label: 'Question Mark', symbol: '?', color: '#5c8ecf', fill: 'rgba(92,142,207,0.07)'  },
  cashcow:  { label: 'Cash Cow',      symbol: '◆', color: '#7dab8a', fill: 'rgba(125,171,138,0.07)' },
  dog:      { label: 'Dog',           symbol: '▼', color: '#e07060', fill: 'rgba(224,112,96,0.07)'  },
}

/* ══════════════════════════════
   Helpers
══════════════════════════════ */
function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function getQuadrant(x, y, midX, midY) {
  if (x >= midX && y >= midY) return 'star'
  if (x < midX  && y >= midY) return 'question'
  if (x >= midX && y < midY)  return 'cashcow'
  return 'dog'
}

function fmtRev(v) {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`
  return `$${Math.round(v).toLocaleString()}`
}


/* ══════════════════════════════
   Summary card
══════════════════════════════ */
function QuadrantCard({ qKey, data }) {
  const q = Q_META[qKey]
  const revenue = data.reduce((s, d) => s + d.revenue, 0)
  return (
    <div className="bcg-qcard" style={{ borderTopColor: q.color }}>
      <div className="bcg-qcard-symbol" style={{ color: q.color }}>{q.symbol}</div>
      <div className="bcg-qcard-name">{q.label}</div>
      <div className="bcg-qcard-count" style={{ color: q.color }}>{data.length}</div>
      <div className="bcg-qcard-sub">campaigns</div>
      <div className="bcg-qcard-rev">{fmtRev(revenue)} revenue</div>
    </div>
  )
}


/* ══════════════════════════════
   Main page
══════════════════════════════ */
export default function BCGMatrix() {
  const [history, setHistory] = useState(() => loadHistory(getUsername()))

  useEffect(() => {
    function refresh() { setHistory(loadHistory(getUsername())) }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const byQuadrant = useMemo(() => {
    const raw = history
      .filter(e => (e.spend_usd || 0) > 0 && (e.revenue_usd || 0) > 0)
      .map(e => ({
        x:       e.revenue_usd / e.spend_usd,
        y:       e.revenue_usd,
        revenue: e.revenue_usd,
      }))

    if (!raw.length) return { star: [], cashcow: [], question: [], dog: [] }

    const mX = median(raw.map(d => d.x))
    const mY = median(raw.map(d => d.y))
    const pts = raw.map(d => ({ ...d, quadrant: getQuadrant(d.x, d.y, mX, mY) }))

    return {
      star:     pts.filter(d => d.quadrant === 'star'),
      cashcow:  pts.filter(d => d.quadrant === 'cashcow'),
      question: pts.filter(d => d.quadrant === 'question'),
      dog:      pts.filter(d => d.quadrant === 'dog'),
    }
  }, [history])

  return (
    <div className="bcg-page">
      <div className="bcg-header">
        <h1 className="bcg-h1">BCG Matrix</h1>
        <p className="bcg-sub">Campaign portfolio analysis — market share (ROAS) vs. growth potential (revenue)</p>
      </div>

      {/* Summary cards */}
      <div className="bcg-qcards">
        {(['star', 'question', 'cashcow', 'dog']).map(qk => (
          <QuadrantCard key={qk} qKey={qk} data={byQuadrant[qk]} />
        ))}
      </div>
    </div>
  )
}
