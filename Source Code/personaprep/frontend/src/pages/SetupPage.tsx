import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StartInterviewRequest, StartInterviewResponse } from '../types/api'
import { API_URL } from '../config'

interface PersonaConfig {
  id: string
  name: string
  description: string
  tags: string[]
  accent: string
  accentBorder: string
  accentDim: string
  tagColor: string
  tagBg: string
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'skeptical_technical',
    name: 'Skeptical Technical',
    description: "Sharp and relentless. Pushes for depth, tests tradeoffs, won't let vague answers slide.",
    tags: ['direct', 'skeptical', 'technical'],
    accent: '#3b82f6',
    accentBorder: 'rgba(59,130,246,0.35)',
    accentDim: 'rgba(59,130,246,0.08)',
    tagColor: '#60a5fa',
    tagBg: 'rgba(59,130,246,0.1)',
  },
  {
    id: 'friendly_recruiter',
    name: 'Friendly Recruiter',
    description: 'Warm and conversational. Focused on motivation, culture fit, and your story.',
    tags: ['warm', 'conversational', 'behavioral'],
    accent: '#f59e0b',
    accentBorder: 'rgba(245,158,11,0.35)',
    accentDim: 'rgba(245,158,11,0.08)',
    tagColor: '#fbbf24',
    tagBg: 'rgba(245,158,11,0.1)',
  },
  {
    id: 'startup_founder',
    name: 'Startup Founder',
    description: 'Fast-paced and execution-focused. Low patience for fluff, high bar for ownership.',
    tags: ['intense', 'fast-paced', 'execution'],
    accent: '#ef4444',
    accentBorder: 'rgba(239,68,68,0.35)',
    accentDim: 'rgba(239,68,68,0.08)',
    tagColor: '#f87171',
    tagBg: 'rgba(239,68,68,0.1)',
  },
  {
    id: 'senior_hiring_manager',
    name: 'Senior Hiring Manager',
    description: 'Structured and thorough. Evaluates impact, tradeoffs, and team dynamics.',
    tags: ['structured', 'thorough', 'impact'],
    accent: '#10b981',
    accentBorder: 'rgba(16,185,129,0.35)',
    accentDim: 'rgba(16,185,129,0.08)',
    tagColor: '#34d399',
    tagBg: 'rgba(16,185,129,0.1)',
  },
]

const ROLES = ['AI Engineer', 'SWE', 'Product Manager', 'Startup Founder']
const TYPES = [
  { id: 'technical', label: 'Technical' },
  { id: 'behavioral', label: 'Behavioral' },
  { id: 'recruiter_screen', label: 'Recruiter Screen' },
]
const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
]

export default function SetupPage() {
  const navigate = useNavigate()
  const [personaId, setPersonaId] = useState('skeptical_technical')
  const [role, setRole] = useState('AI Engineer')
  const [type, setType] = useState('technical')
  const [difficulty, setDifficulty] = useState('medium')

  const [starting, setStarting] = useState(false)

  const handleStart = async () => {
    if (starting) return
    setStarting(true)

    let session: StartInterviewResponse

    try {
      const body: StartInterviewRequest = {
        persona_id: personaId as StartInterviewRequest['persona_id'],
        role: role as StartInterviewRequest['role'],
        interview_type: type as StartInterviewRequest['interview_type'],
        difficulty: difficulty as StartInterviewRequest['difficulty'],
      }
      const res = await fetch(`${API_URL}/start-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      session = await res.json()
    } catch {
      // Backend not running — fall back to demo mode
      session = {
        channel: `demo_${Date.now().toString(36)}`,
        appid: 'mock_app_id',
        rtc_token: 'mock_rtc_token',
        rtm_token: 'mock_rtm_token',
        agent_uid: '100',
        user_uid: '101',
        agent_video_uid: null,
      }
    }

    sessionStorage.setItem('session', JSON.stringify(session))
    sessionStorage.setItem('persona_id', personaId)
    sessionStorage.setItem('role', role)
    sessionStorage.setItem('interview_type', type)
    sessionStorage.setItem('difficulty', difficulty)
    navigate('/interview')
  }

  const selectedPersona = PERSONAS.find(p => p.id === personaId)!

  return (
    <div className="page" style={{ overflowY: 'auto' }}>
      {/* Header */}
      <header style={{
        padding: '24px 48px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28,
            background: 'var(--accent)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            PersonaPrep
          </span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
          MOCK INTERVIEW SIMULATOR
        </span>
      </header>

      {/* Main */}
      <main style={{ flex: 1, maxWidth: 860, width: '100%', margin: '0 auto', padding: '48px 24px 80px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 48, animation: 'fadeUp 0.5s ease both' }}>
          <h1 style={{
            fontFamily: 'Syne', fontWeight: 800, fontSize: 'clamp(28px, 4vw, 40px)',
            letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1.15,
            marginBottom: 10,
          }}>
            Choose your interviewer.
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
            Configure your mock interview session and practice with a live AI interviewer.
          </p>
        </div>

        {/* Persona grid */}
        <div style={{ marginBottom: 40, animation: 'fadeUp 0.5s ease 0.05s both' }}>
          <p className="section-label">Interviewer Persona</p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 12,
          }}>
            {PERSONAS.map(p => (
              <button
                key={p.id}
                className={`persona-card ${personaId === p.id ? 'selected' : ''}`}
                style={{
                  '--card-accent': p.accent,
                  '--card-accent-border': p.accentBorder,
                  background: personaId === p.id ? p.accentDim : undefined,
                } as React.CSSProperties}
                onClick={() => setPersonaId(p.id)}
              >
                <div style={{
                  fontFamily: 'Syne',
                  fontWeight: 700,
                  fontSize: 14,
                  color: 'var(--text-primary)',
                  marginBottom: 6,
                  letterSpacing: '-0.01em',
                }}>
                  {p.name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
                  {p.description}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {p.tags.map(t => (
                    <span key={t} className="tag" style={{
                      color: p.tagColor,
                      background: p.tagBg,
                      borderColor: `${p.accent}30`,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Config row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 28,
          marginBottom: 48,
          animation: 'fadeUp 0.5s ease 0.1s both',
        }}>
          {/* Role */}
          <div>
            <p className="section-label">Target Role</p>
            <div className="pill-group">
              {ROLES.map(r => (
                <button key={r} className={`pill ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <p className="section-label">Interview Type</p>
            <div className="pill-group">
              {TYPES.map(t => (
                <button key={t.id} className={`pill ${type === t.id ? 'active' : ''}`} onClick={() => setType(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <p className="section-label">Difficulty</p>
            <div className="pill-group">
              {DIFFICULTIES.map(d => (
                <button key={d.id} className={`pill ${difficulty === d.id ? 'active' : ''}`} onClick={() => setDifficulty(d.id)}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Start CTA */}
        <div style={{ animation: 'fadeUp 0.5s ease 0.15s both', display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-primary" onClick={handleStart} disabled={starting} style={{ fontSize: 15, padding: '13px 32px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
            </svg>
            {starting ? 'Connecting...' : 'Start Interview'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            with <span style={{ color: selectedPersona.tagColor, fontWeight: 500 }}>{selectedPersona.name}</span>
            {' '}· {role} · {DIFFICULTIES.find(d => d.id === difficulty)?.label}
          </span>
        </div>

        {/* Disclaimer */}
        <p style={{ marginTop: 32, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          AI-generated training personas only. Not real people. For professional practice purposes.
        </p>
      </main>
    </div>
  )
}
