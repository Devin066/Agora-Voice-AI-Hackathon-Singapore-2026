import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const PERSONA_LABELS: Record<string, { name: string; color: string }> = {
  skeptical_technical:   { name: 'Skeptical Technical',  color: '#3b82f6' },
  friendly_recruiter:    { name: 'Friendly Recruiter',   color: '#f59e0b' },
  startup_founder:       { name: 'Startup Founder',      color: '#ef4444' },
  senior_hiring_manager: { name: 'Senior Hiring Manager', color: '#10b981' },
}

type AgentState = 'listening' | 'thinking' | 'speaking' | 'idle'

// Mock transcript for Phase 1 visual demo
const MOCK_TRANSCRIPT = [
  { role: 'interviewer', text: 'Tell me about a distributed system you designed end-to-end.' },
  { role: 'candidate',   text: "I built a data ingestion pipeline at my last company that processed about 2 million events per day..." },
  { role: 'interviewer', text: 'Be specific — what was the actual bottleneck and how did you measure it?' },
]

export default function InterviewPage() {
  const navigate = useNavigate()
  const personaId = sessionStorage.getItem('persona_id') ?? 'skeptical_technical'
  const role      = sessionStorage.getItem('role') ?? 'AI Engineer'
  const persona   = PERSONA_LABELS[personaId] ?? PERSONA_LABELS.skeptical_technical

  const [agentState, setAgentState] = useState<AgentState>('listening')
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([])
  const [elapsed, setElapsed] = useState(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  // Timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Simulate agent state cycling (Phase 1 only)
  useEffect(() => {
    const states: AgentState[] = ['listening', 'thinking', 'speaking', 'listening']
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % states.length
      setAgentState(states[i])
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // Drip-feed mock transcript (Phase 1 only)
  useEffect(() => {
    MOCK_TRANSCRIPT.forEach((turn, idx) => {
      setTimeout(() => {
        setTranscript(prev => [...prev, turn])
      }, (idx + 1) * 4000)
    })
  }, [])

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const handleEnd = () => {
    navigate('/feedback?channel=demo123')
  }

  const stateConfig: Record<AgentState, { label: string; color: string }> = {
    listening: { label: 'Listening',  color: '#22c55e' },
    thinking:  { label: 'Thinking',  color: '#f59e0b' },
    speaking:  { label: 'Speaking',  color: '#a78bfa' },
    idle:      { label: 'Idle',      color: '#888' },
  }
  const state = stateConfig[agentState]

  return (
    <div className="page" style={{ animation: 'fadeUp 0.4s ease both' }}>
      {/* Top bar */}
      <header style={{
        padding: '16px 32px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
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

        {/* Center: role */}
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
          {role}
        </span>

        {/* Timer + end */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontFamily: 'Syne', fontWeight: 600, fontSize: 15,
            color: 'var(--text-secondary)',
            letterSpacing: '0.05em',
          }}>
            {formatTime(elapsed)}
          </span>
          <button className="btn-danger" onClick={handleEnd} style={{ padding: '8px 18px', fontSize: 13 }}>
            End Interview
          </button>
        </div>
      </header>

      {/* Body */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        maxWidth: 760, width: '100%', margin: '0 auto',
        padding: '0 24px', overflow: 'hidden',
      }}>

        {/* Mic / Agent state */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '48px 0 40px', gap: 16, flexShrink: 0,
        }}>
          {/* Pulse rings */}
          <div style={{ position: 'relative', width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {agentState === 'listening' && (
              <>
                <div style={{
                  position: 'absolute', inset: -12,
                  borderRadius: '50%', border: `1.5px solid ${state.color}`,
                  animation: 'pulse-ring 2s ease infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: -24,
                  borderRadius: '50%', border: `1px solid ${state.color}`,
                  animation: 'pulse-ring 2s ease 0.4s infinite',
                }} />
              </>
            )}
            {agentState === 'speaking' && (
              <div style={{
                position: 'absolute', inset: 0,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${state.color}22 0%, transparent 70%)`,
                animation: 'breathing 1.5s ease infinite',
              }} />
            )}
            {/* Mic circle */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: agentState === 'thinking' ? 'var(--surface-3)' : `${state.color}18`,
              border: `1.5px solid ${agentState === 'thinking' ? 'var(--border)' : `${state.color}50`}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke={agentState === 'thinking' ? 'var(--text-muted)' : state.color}
                strokeWidth="2" style={{ transition: 'stroke 0.3s ease' }}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
          </div>

          {/* State label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: state.color,
              animation: agentState === 'thinking' ? 'blink 1s ease infinite' : undefined,
            }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {state.label}
            </span>
          </div>
        </div>

        {/* Transcript */}
        <div style={{
          flex: 1,
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          marginBottom: 24,
        }}>
          <div style={{
            padding: '12px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Transcript
            </span>
          </div>

          <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {transcript.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
                Transcript will appear here as the conversation unfolds...
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {transcript.map((turn, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: turn.role === 'candidate' ? 'flex-end' : 'flex-start',
                    animation: 'fadeUp 0.3s ease both',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: turn.role === 'interviewer' ? persona.color : 'var(--text-muted)',
                      marginBottom: 4,
                    }}>
                      {turn.role === 'interviewer' ? persona.name : 'You'}
                    </span>
                    <div style={{
                      maxWidth: '80%',
                      padding: '10px 14px',
                      borderRadius: turn.role === 'candidate' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: turn.role === 'candidate' ? 'var(--surface-3)' : `${persona.color}12`,
                      border: `1px solid ${turn.role === 'candidate' ? 'var(--border)' : `${persona.color}25`}`,
                      fontSize: 14,
                      lineHeight: 1.55,
                      color: 'var(--text-primary)',
                    }}>
                      {turn.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
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
