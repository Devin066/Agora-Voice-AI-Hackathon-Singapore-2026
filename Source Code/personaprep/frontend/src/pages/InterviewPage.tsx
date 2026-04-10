import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import VoiceSession, { rtcClient } from '../components/VoiceSession'
import { API_URL } from '../config'

export default function InterviewPage() {
  const navigate   = useNavigate()
  const role       = sessionStorage.getItem('role')       ?? 'AI Engineer'
  const persona    = {
    name:  sessionStorage.getItem('persona_name')  ?? 'Interviewer',
    color: sessionStorage.getItem('persona_color') ?? '#3b82f6',
  }
  const channel    = (() => {
    try { return JSON.parse(sessionStorage.getItem('session') ?? '{}').channel ?? 'demo' }
    catch { return 'demo' }
  })()
  const isMock = (() => {
    try { return (JSON.parse(sessionStorage.getItem('session') ?? '{}').appid ?? 'mock_app_id') === 'mock_app_id' }
    catch { return true }
  })()

  const [elapsed, setElapsed] = useState(0)
  const [ending,  setEnding]  = useState(false)
  const transcriptRef = useRef<Array<{ role: string; text: string }>>([])

  // Count-up timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const handleEnd = async () => {
    if (ending) return
    setEnding(true)

    if (!isMock) {
      // Send transcript to backend so /feedback can score it
      const transcript = transcriptRef.current
      if (transcript.length > 0) {
        try {
          await fetch(`${API_URL}/transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel, transcript }),
          })
        } catch { /* will show error on feedback page */ }
      }

      // Tell backend to stop the agent
      try {
        await fetch(`${API_URL}/stop-interview?channel=${channel}`, { method: 'POST' })
      } catch { /* backend might be down */ }

      // Leave RTC channel
      try { await rtcClient.leave() } catch { /* already left */ }
    }

    navigate(`/feedback?channel=${channel}`)
  }

  return (
    <div className="page" style={{ animation: 'fadeUp 0.4s ease both' }}>

      {/* Header */}
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        {/* Persona badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: persona.color,
            boxShadow: `0 0 8px ${persona.color}`,
          }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {persona.name}
          </span>
          <span style={{
            fontSize: 11, color: 'var(--text-muted)',
            padding: '2px 7px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            marginLeft: 4,
          }}>
            AI Training Persona
          </span>
        </div>

        {/* Role */}
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
          {role}
        </span>

        {/* Timer + end */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontFamily: 'GeistMono', fontWeight: 600, fontSize: 15,
            color: 'var(--text-secondary)', letterSpacing: '0.05em',
          }}>
            {formatTime(elapsed)}
          </span>
          <button
            className="btn-danger"
            onClick={handleEnd}
            disabled={ending}
            style={{ padding: '8px 18px', fontSize: 13 }}
          >
            {ending ? 'Ending...' : 'End Interview'}
          </button>
        </div>
      </header>

      {/* Interview body — Agora session lives here */}
      <VoiceSession personaColor={persona.color} personaName={persona.name} transcriptRef={transcriptRef} />

      {/* Footer */}
      <footer style={{
        padding: '12px 32px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          AI-generated training persona · Not a real person · For practice purposes only
        </p>
      </footer>

    </div>
  )
}
