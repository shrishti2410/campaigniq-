import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Predict from './pages/Predict'
import UploadCSV from './pages/UploadCSV'
import Advisor from './pages/Advisor'
import Campaigns from './pages/Campaigns'
import BCGMatrix from './pages/BCGMatrix'
import Login from './pages/Login'
import './App.css'

/* ══════════════════════════════
   Icons
══════════════════════════════ */
function IconGrid() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="9"   y="1.5" width="5.5" height="5.5" rx="1.5" />
      <rect x="1.5" y="9"   width="5.5" height="5.5" rx="1.5" />
      <rect x="9"   y="9"   width="5.5" height="5.5" rx="1.5" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.2 1L3 9.2h4.8L6.4 15 13 6.6H8.2L9.2 1z" />
    </svg>
  )
}

function IconUpload() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v9M5 5l3-3 3 3" />
      <path d="M2.5 11v1.5A1.5 1.5 0 004 14h8a1.5 1.5 0 001.5-1.5V11" />
    </svg>
  )
}

function IconSparkle() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1.5l1.2 3.6 3.6 1.2-3.6 1.2L8 11l-1.2-3.5L3.2 6.3l3.6-1.2L8 1.5z" />
      <path d="M13 1l.6 1.8 1.8.6-1.8.6L13 5.8l-.6-1.8-1.8-.6 1.8-.6L13 1z" opacity="0.65" />
      <path d="M3.5 10.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5z" opacity="0.45" />
    </svg>
  )
}

function IconBCG() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1" opacity="0.5" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" opacity="0.3" />
      <rect x="9" y="9" width="6" height="6" rx="1" opacity="0.7" />
    </svg>
  )
}

function IconAds() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 11V5a1 1 0 011-1h2v8H3a1 1 0 01-1-1z" opacity="0.7" />
      <path d="M5 4l7-2v12L5 12V4z" />
      <path d="M13 6.5a2 2 0 010 3V6.5z" opacity="0.6" />
    </svg>
  )
}

function IconLogout() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3" />
      <path d="M11 11l3-3-3-3" />
      <path d="M14 8H6" />
    </svg>
  )
}

/* ══════════════════════════════
   Page metadata
══════════════════════════════ */
const PAGE_META = {
  '/dashboard': { title: 'Analytics',         sub: 'Campaign performance overview' },
  '/predict':   { title: 'Revenue Predictor', sub: 'Forecast revenue with ML' },
  '/upload':    { title: 'Batch Predict',      sub: 'Bulk predictions from CSV' },
  '/advisor':   { title: 'AI Advisor',         sub: 'GPT-powered campaign recommendations' },
  '/campaigns':  { title: 'Campaigns',  sub: 'Live Google Ads performance' },
  '/bcg-matrix': { title: 'BCG Matrix', sub: 'Campaign portfolio analysis' },
}

/* ══════════════════════════════
   Protected route
══════════════════════════════ */
function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

/* ══════════════════════════════
   Top bar
══════════════════════════════ */
function TopBar() {
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] ?? { title: 'CampaignIQ', sub: '' }
  return (
    <header className="top-bar">
      <span className="top-bar-title">{meta.title}</span>
      {meta.sub && (
        <>
          <span className="top-bar-sep">/</span>
          <span className="top-bar-sub">{meta.sub}</span>
        </>
      )}
      <span className="top-bar-spacer" />
      <div className="live-badge">
        <span className="live-dot" />
        <span className="live-label">LIVE</span>
      </div>
    </header>
  )
}

/* ══════════════════════════════
   Sidebar
══════════════════════════════ */
function Sidebar() {
  const navigate = useNavigate()

  function handleLogout() {
    localStorage.removeItem('token')
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <span className="brand-icon">CQ</span>
        <div>
          <span className="brand-name">CampaignIQ</span>
          <span className="brand-sub">Campaign Intelligence</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <span className="nav-section-label">Main</span>

        <NavLink
          to="/dashboard"
          data-nav="dashboard"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <IconGrid />
          Dashboard
        </NavLink>

        <NavLink
          to="/bcg-matrix"
          data-nav="bcg-matrix"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <IconBCG />
          BCG Matrix
        </NavLink>

        <NavLink
          to="/predict"
          data-nav="predict"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <IconBolt />
          Predict
        </NavLink>

        <NavLink
          to="/upload"
          data-nav="upload"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <IconUpload />
          Upload CSV
        </NavLink>

        <NavLink
          to="/advisor"
          data-nav="advisor"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <IconSparkle />
          AI Advisor
        </NavLink>

        <span className="nav-section-label" style={{ marginTop: 12 }}>Integrations</span>

        <NavLink
          to="/campaigns"
          data-nav="campaigns"
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          <IconAds />
          Google Ads
        </NavLink>
      </nav>

      {/* Model info */}
      <div className="sidebar-footer">
        <div className="model-info-row">
          <span className="model-dot model-dot--purple" />
          <span className="model-info-key">Model</span>
          <span className="model-info-val">Ridge Regression</span>
        </div>
        <div className="model-info-row">
          <span className="model-dot model-dot--teal" />
          <span className="model-info-key">Accuracy</span>
          <span className="model-info-val">89%</span>
        </div>
        <span className="sidebar-version">CampaignIQ v1.0</span>

        {/* Logout */}
        <button className="logout-btn" onClick={handleLogout} title="Sign out">
          <IconLogout />
          Sign Out
        </button>
      </div>
    </aside>
  )
}

/* ══════════════════════════════
   App shell (sidebar + topbar + routes)
══════════════════════════════ */
function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <TopBar />
        <main className="main-content">
          <Routes>
            <Route path="/"          element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/predict"   element={<Predict />} />
            <Route path="/upload"    element={<UploadCSV />} />
            <Route path="/advisor"    element={<Advisor />} />
            <Route path="/campaigns"  element={<Campaigns />} />
            <Route path="/bcg-matrix" element={<BCGMatrix />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

/* ══════════════════════════════
   Root
══════════════════════════════ */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
