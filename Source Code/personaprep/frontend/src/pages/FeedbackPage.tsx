import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import FeedbackReport from '../components/FeedbackReport'
import type { FeedbackResponse } from '../types/api'
import { API_URL } from '../config'


// ── Skeleton placeholders ─────────────────────────────────────────────────────
function SkeletonBlock({ h = 120, delay = 0 }: { h?: number; delay?: number }) {
  return (
    <div style={{
      height: h,
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      animation: `skeleton-pulse 1.4s ease ${delay}s infinite`,
    }} />
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', gap: 32, alignItems: 'center',
        background: 'var(--surface-1)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '28px 32px',
        animation: 'skeleton-pulse 1.4s ease 0s infinite',
      }}>
        {/* Score ring placeholder */}
        <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--surface-3)', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 10, width: '30%', background: 'var(--surface-3)', borderRadius: 4 }} />
          <div style={{ height: 13, width: '90%', background: 'var(--surface-3)', borderRadius: 4 }} />
          <div style={{ height: 13, width: '75%', background: 'var(--surface-3)', borderRadius: 4 }} />
          <div style={{ height: 13, width: '60%', background: 'var(--surface-3)', borderRadius: 4 }} />
        </div>
      </div>
      <SkeletonBlock h={140} delay={0.05} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SkeletonBlock h={160} delay={0.1} />
        <SkeletonBlock h={160} delay={0.12} />
      </div>
      <SkeletonBlock h={100} delay={0.15} />
    </div>
  )
}

// ── Demo / error states ───────────────────────────────────────────────────────
function DemoNotice() {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '40px 32px',
      textAlign: 'center',
      animation: 'fadeUp 0.4s ease both',
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: 'var(--surface-3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 6 }}>
        Feedback unavailable in demo mode
      </p>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        Connect the FastAPI backend on port 8200 and run a real session to see AI-generated feedback.
      </p>
    </div>
  )
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 'var(--radius)',
      padding: '32px',
      animation: 'fadeUp 0.4s ease both',
    }}>
      <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 6 }}>Failed to load feedback</p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'GeistMono' }}>{message}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FeedbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const personaName = sessionStorage.getItem('persona_name') ?? 'Interviewer'
  const role        = sessionStorage.getItem('role') ?? 'AI Engineer'
  const channel   = searchParams.get('channel') ?? ''

  // Detect mock/demo mode from the saved session (SetupPage writes appid='mock_app_id' on fallback)
  const isDemo = (() => {
    if (!channel || channel.startsWith('demo_')) return true
    try { return (JSON.parse(sessionStorage.getItem('session') ?? '{}').appid ?? 'mock_app_id') === 'mock_app_id' }
    catch { return true }
  })()

  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null)
  const [loading,  setLoading]  = useState(!isDemo)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (isDemo) {
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`${API_URL}/feedback?channel=${encodeURIComponent(channel)}`)
        if (res.status === 404) throw new Error('Session not found — transcript may be empty')
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          throw new Error(`API ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`)
        }
        const data: FeedbackResponse = await res.json()
        if (!cancelled) {
          setFeedback(data)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load feedback')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [channel, isDemo])

  return (
    <div className="page" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 20, height: 20, background: 'var(--accent)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
            PersonaPrep
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {personaName} · {role}
        </span>
        <button className="btn-ghost" onClick={() => navigate('/setup')} style={{ padding: '8px 16px', fontSize: 13 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15,18 9,12 15,6"/>
          </svg>
          Practice Again
        </button>
      </header>

      {/* Main */}
      <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '40px 24px 80px' }}>

        {/* Title */}
        <div style={{ marginBottom: 32, animation: 'fadeUp 0.4s ease both' }}>
          <h1 style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(22px, 3vw, 30px)',
            letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: 6,
          }}>
            Interview Complete
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {loading
              ? 'Generating your feedback…'
              : isDemo
                ? 'Run a real session to unlock feedback.'
                : 'Here\'s how you performed. Use this to prepare before your next round.'}
          </p>
        </div>

        {/* Body */}
        {loading ? (
          <LoadingSkeleton />
        ) : isDemo ? (
          <DemoNotice />
        ) : error ? (
          <ErrorNotice message={error} />
        ) : feedback ? (
          <FeedbackReport feedback={feedback} />
        ) : null}

        {/* CTA */}
        <div style={{ marginTop: 36, display: 'flex', gap: 12, animation: 'fadeUp 0.4s ease 0.2s both' }}>
          <button className="btn-primary" onClick={() => navigate('/setup')}>
            Practice Again
          </button>
          {!isDemo && !error && !loading && (
            <button className="btn-ghost" onClick={() => navigate('/interview')}>
              Review Session
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
