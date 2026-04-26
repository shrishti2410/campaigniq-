/**
 * Per-user prediction history stored in localStorage.
 * Key: campaigniq_history_{username}
 * Value: array of prediction entries, newest first (max 200).
 */

export function getUsername() {
  const token = localStorage.getItem('token')
  if (!token) return 'guest'
  try {
    // JWT payload is base64url encoded
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    return payload.sub || 'guest'
  } catch {
    return 'guest'
  }
}

const storageKey = (username) => `campaigniq_history_${username}`

export function loadHistory(username) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(username)) || '[]')
  } catch {
    return []
  }
}

export function appendToHistory(username, entry) {
  const history = loadHistory(username)
  history.unshift(entry)                     // newest first
  if (history.length > 200) history.length = 200
  localStorage.setItem(storageKey(username), JSON.stringify(history))
}

/**
 * Maps a predicted revenue value to a tier label.
 * Matches the thresholds used in Predict.jsx's getTier().
 */
export function getTierLabel(revenue) {
  if (revenue >= 12000) return 'Star'
  if (revenue >=  6000) return 'Core'
  if (revenue >=  2000) return 'Question'
  return 'Dog'
}
