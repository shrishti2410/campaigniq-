import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import './Login.css'

function LogoIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" width="36" height="36">
      <rect width="32" height="32" rx="9" fill="#c9856a" />
      <rect x="6"  y="20" width="4" height="8"  rx="1.5" fill="white" opacity="0.9" />
      <rect x="12" y="14" width="4" height="14" rx="1.5" fill="white" opacity="0.9" />
      <rect x="18" y="8"  width="4" height="20" rx="1.5" fill="white" opacity="0.9" />
      <rect x="24" y="4"  width="4" height="24" rx="1.5" fill="white" opacity="0.9" />
    </svg>
  )
}

export default function Login() {
  const navigate    = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  // Already logged in → skip to dashboard
  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/dashboard', { replace: true })
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.append('username', username)
      params.append('password', password)

      const res = await api.post('/token', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      localStorage.setItem('token', res.data.access_token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <LogoIcon />
          <div>
            <div className="login-brand-name">CampaignIQ</div>
            <div className="login-brand-sub">Campaign Intelligence</div>
          </div>
        </div>

        <h1 className="login-heading">Welcome back</h1>
        <p className="login-sub">Sign in to access your campaign analytics</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label className="login-field">
            <span>Username</span>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              disabled={loading}
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={loading}
            />
          </label>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading || !username || !password}>
            {loading ? (
              <><span className="login-spinner" aria-hidden="true" /> Signing in…</>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="login-hint">
          Default admin: <strong>admin</strong> / <strong>admin123</strong>
          <br />
          (run <code>python create_admin.py</code> in backend/ first)
        </p>
      </div>
    </div>
  )
}
