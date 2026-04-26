import { useState, useEffect, useRef } from 'react'
import './Advisor.css'
import api from '../services/api'

const STARTERS = [
  'I want to launch a campaign for a new mobile app',
  'How should I allocate $10,000 budget across channels?',
  'My campaign has high bounce rate, what should I do?',
  'Which audience segment should I target for e-commerce?',
]

/* ══════════════════════════════
   Icons
══════════════════════════════ */
function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" transform="scale(0.87) translate(0,-1)" />
      <path d="M3 12.5l6-1.5-6-1.5V3.5l17 8-17 8v-7z" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path d="M10 2l1.5 4.5L16 8l-4.5 1.5L10 14l-1.5-4.5L4 8l4.5-1.5L10 2z" />
      <path d="M16 1l.75 2.25L19 4l-2.25.75L16 7l-.75-2.25L13 4l2.25-.75L16 1z" opacity="0.6" />
      <path d="M4 13l.6 1.8L6.4 15.4l-1.8.6L4 17.8l-.6-1.8L1.6 15.4l1.8-.6L4 13z" opacity="0.4" />
    </svg>
  )
}

/* ══════════════════════════════
   Typing indicator
══════════════════════════════ */
function TypingIndicator() {
  return (
    <div className="adv-bubble adv-bubble--ai">
      <div className="adv-typing">
        <span /><span /><span />
      </div>
    </div>
  )
}

/* ══════════════════════════════
   Message bubble
══════════════════════════════ */
function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`adv-row ${isUser ? 'adv-row--user' : 'adv-row--ai'}`}>
      {!isUser && (
        <div className="adv-avatar" aria-hidden="true">
          <SparkleIcon />
        </div>
      )}
      <div className={`adv-bubble ${isUser ? 'adv-bubble--user' : 'adv-bubble--ai'}`}>
        {message.content}
      </div>
    </div>
  )
}

/* ══════════════════════════════
   Suggested chips (shown inline after AI response)
══════════════════════════════ */
function SuggestedChips({ chips, onSelect }) {
  if (!chips || chips.length === 0) return null
  return (
    <div className="adv-row adv-row--ai">
      <div className="adv-chips-wrap">
        {chips.map((c) => (
          <button key={c} className="adv-chip" onClick={() => onSelect(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════
   Main component
══════════════════════════════ */
export default function Advisor() {
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [lastChips, setLastChips]     = useState([])
  const chatEndRef                    = useRef(null)
  const inputRef                      = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text) {
    const trimmed = (text || input).trim()
    if (!trimmed || loading) return

    setInput('')
    setLastChips([])
    setError(null)

    const newMessages = [...messages, { role: 'user', content: trimmed }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await api.post('/advisor', { messages: newMessages, campaign_context: {} })
      const data = res.data
      setMessages([...newMessages, { role: 'assistant', content: data.response }])
      if (data.suggested_questions?.length) setLastChips(data.suggested_questions)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
      setMessages(newMessages)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const showStarters = messages.length === 0 && !loading

  return (
    <div className="advisor-page">

      {/* ── Header ── */}
      <div className="adv-header">
        <div className="adv-header-icon" aria-hidden="true">
          <SparkleIcon />
        </div>
        <div>
          <div className="adv-header-title">Campaign Advisor</div>
          <div className="adv-header-sub">
            Describe your campaign goal and get AI-powered recommendations
          </div>
        </div>
        <div className="adv-header-badge">
          <span className="adv-live-dot" />
          GPT-3.5
        </div>
      </div>

      {/* ── Chat window ── */}
      <div className="adv-chat">

        {/* Welcome / starter state */}
        {showStarters && (
          <div className="adv-welcome">
            <div className="adv-welcome-icon" aria-hidden="true">
              <SparkleIcon />
            </div>
            <h2 className="adv-welcome-title">How can I help your campaign?</h2>
            <p className="adv-welcome-sub">
              Ask me anything about campaign strategy, budget allocation, or channel selection.
              I'll use your platform's real performance data to guide you.
            </p>
            <div className="adv-starters">
              {STARTERS.map((s) => (
                <button key={s} className="adv-starter" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversation */}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}

        {/* Suggested follow-ups after last AI reply */}
        {!loading && lastChips.length > 0 && (
          <SuggestedChips chips={lastChips} onSelect={send} />
        )}

        {/* Loading / typing indicator */}
        {loading && <TypingIndicator />}

        {/* Error */}
        {error && !loading && (
          <div className="adv-error">
            <strong>Request failed:</strong> {error}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="adv-input-bar">
        <textarea
          ref={inputRef}
          className="adv-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Describe your campaign or ask a question…"
          rows={1}
          disabled={loading}
        />
        <button
          className="adv-send-btn"
          onClick={() => send()}
          disabled={!input.trim() || loading}
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  )
}
