import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StartInterviewRequest, StartInterviewResponse, PersonaBuildRequest, PersonaBuildStatus } from '../types/api'
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

interface CustomPersona {
  id: string
  name: string
  has_voice_clone: boolean
  has_avatar: boolean
  source_summary: string
}

export default function SetupPage() {
  const navigate = useNavigate()
  const [personaId, setPersonaId] = useState('skeptical_technical')
  const [role, setRole] = useState('AI Engineer')
  const [type, setType] = useState('technical')
  const [difficulty, setDifficulty] = useState('medium')

  const [starting, setStarting] = useState(false)

  // -- Custom persona build state --
  const [customName, setCustomName] = useState('')
  const [youtubeUrls, setYoutubeUrls] = useState([''])
  const [webUrls, setWebUrls] = useState<string[]>([])
  const [pasteText, setPasteText] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [buildStatus, setBuildStatus] = useState<PersonaBuildStatus | null>(null)
  const [building, setBuilding] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([])

  // Load custom personas from backend on mount
  useEffect(() => {
    fetch(`${API_URL}/personas`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.personas) {
          const custom = data.personas
            .filter((p: any) => p.type === 'custom')
            .map((p: any) => ({
              id: p.id,
              name: p.name,
              has_voice_clone: p.has_voice_clone ?? false,
              has_avatar: p.has_avatar ?? false,
              source_summary: p.source_summary ?? '',
            }))
          setCustomPersonas(custom)
        }
      })
      .catch(() => {})
  }, [])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleBuild = async () => {
    if (!customName.trim() || building) return
    setBuilding(true)
    setBuildStatus({ status: 'queued', progress_label: 'Starting build...' })

    const sources: PersonaBuildRequest['sources'] = []
    for (const url of youtubeUrls) {
      if (url.trim()) sources.push({ type: 'youtube', url: url.trim() })
    }
    for (const url of webUrls) {
      if (url.trim()) sources.push({ type: 'url', url: url.trim() })
    }
    if (pasteText.trim()) {
      sources.push({ type: 'text', text: pasteText.trim(), label: 'user_text' })
    }

    try {
      const res = await fetch(`${API_URL}/personas/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customName.trim(), sources, photo_url: photoUrl.trim() || undefined }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const { job_id } = await res.json()

      // Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${API_URL}/personas/build/${job_id}`)
          if (!r.ok) return
          const status: PersonaBuildStatus = await r.json()
          setBuildStatus(status)
          if (status.status === 'done' || status.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setBuilding(false)
            if (status.status === 'done' && status.persona_id) {
              setCustomPersonas(prev => [...prev, {
                id: status.persona_id!,
                name: customName.trim(),
                has_voice_clone: true,
                has_avatar: !!photoUrl.trim(),
                source_summary: `${sources.length} sources`,
              }])
              setPersonaId(status.persona_id)
            }
          }
        } catch {}
      }, 2000)
    } catch {
      setBuildStatus({ status: 'failed', progress_label: 'Backend not reachable', error: 'Could not connect to backend' })
      setBuilding(false)
    }
  }

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

  const selectedPersona = PERSONAS.find(p => p.id === personaId)
    ?? (personaId === '__custom__'
      ? { id: '__custom__', name: 'Custom', tags: [], tagColor: '#c084fc', accent: '#a855f7' } as PersonaConfig
      : (() => {
          const cp = customPersonas.find(c => c.id === personaId)
          return cp
            ? { id: cp.id, name: cp.name, tags: [], tagColor: '#c084fc', accent: '#a855f7' } as PersonaConfig
            : PERSONAS[0]
        })()
    )

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

            {/* Custom personas from backend */}
            {customPersonas.map(cp => (
              <button
                key={cp.id}
                className={`persona-card ${personaId === cp.id ? 'selected' : ''}`}
                style={{
                  '--card-accent': '#a855f7',
                  '--card-accent-border': 'rgba(168,85,247,0.35)',
                  background: personaId === cp.id ? 'rgba(168,85,247,0.08)' : undefined,
                } as React.CSSProperties}
                onClick={() => setPersonaId(cp.id)}
              >
                <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {cp.name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
                  Custom persona · {cp.source_summary}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <span className="tag" style={{ color: '#c084fc', background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.2)' }}>
                    {cp.has_voice_clone ? '✓ voice cloned' : 'default voice'}
                  </span>
                  <span className="tag" style={{ color: '#c084fc', background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.2)' }}>
                    {cp.has_avatar ? '✓ avatar' : 'voice-only'}
                  </span>
                </div>
              </button>
            ))}

            {/* Custom "add" card */}
            <button
              className={`persona-card ${personaId === '__custom__' ? 'selected' : ''}`}
              style={{
                '--card-accent': '#a855f7',
                '--card-accent-border': 'rgba(168,85,247,0.35)',
                background: personaId === '__custom__' ? 'rgba(168,85,247,0.08)' : undefined,
                border: '1.5px dashed rgba(168,85,247,0.4)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 140,
              } as React.CSSProperties}
              onClick={() => setPersonaId('__custom__')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                border: '2px dashed rgba(168,85,247,0.5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 10,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div style={{ fontFamily: 'Syne', fontWeight: 700, fontSize: 14, color: '#a855f7' }}>
                Custom
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Build from public content
              </div>
            </button>
          </div>
        </div>

        {/* Custom persona build panel */}
        {personaId === '__custom__' && (
          <div style={{
            marginBottom: 40,
            padding: '28px 24px',
            background: 'var(--surface-1)',
            border: '1px solid rgba(168,85,247,0.25)',
            borderRadius: 'var(--radius)',
            animation: 'fadeUp 0.3s ease both',
          }}>
            <p className="section-label" style={{ color: '#a855f7' }}>Build Custom Persona</p>

            {/* Name */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Name <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="e.g. Gary Tan"
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 14,
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
            </div>

            {/* YouTube URLs */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                YouTube videos <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(we'll pull transcripts + audio for voice clone)</span>
              </label>
              {youtubeUrls.map((url, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={url}
                    onChange={e => {
                      const next = [...youtubeUrls]
                      next[i] = e.target.value
                      setYoutubeUrls(next)
                    }}
                    placeholder="https://youtube.com/watch?v=..."
                    style={{
                      flex: 1, padding: '8px 12px', fontSize: 13,
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                  {youtubeUrls.length > 1 && (
                    <button
                      className="btn-ghost"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      onClick={() => setYoutubeUrls(youtubeUrls.filter((_, j) => j !== i))}
                    >✕</button>
                  )}
                </div>
              ))}
              {youtubeUrls.length < 5 && (
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: '4px 12px', color: '#a855f7' }}
                  onClick={() => setYoutubeUrls([...youtubeUrls, ''])}
                >+ Add URL</button>
              )}
            </div>

            {/* Web URLs */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Web pages / articles
              </label>
              {webUrls.map((url, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    type="text"
                    value={url}
                    onChange={e => {
                      const next = [...webUrls]
                      next[i] = e.target.value
                      setWebUrls(next)
                    }}
                    placeholder="https://..."
                    style={{
                      flex: 1, padding: '8px 12px', fontSize: 13,
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                      color: 'var(--text-primary)', outline: 'none',
                    }}
                  />
                  <button
                    className="btn-ghost"
                    style={{ padding: '6px 10px', fontSize: 12 }}
                    onClick={() => setWebUrls(webUrls.filter((_, j) => j !== i))}
                  >✕</button>
                </div>
              ))}
              <button
                className="btn-ghost"
                style={{ fontSize: 12, padding: '4px 12px', color: '#a855f7' }}
                onClick={() => setWebUrls([...webUrls, ''])}
              >+ Add URL</button>
            </div>

            {/* Paste text */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Paste text <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(tweets, LinkedIn bio, or any other text)</span>
              </label>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste tweets, LinkedIn posts, bio, articles..."
                rows={4}
                style={{
                  width: '100%', padding: '10px 14px', fontSize: 13,
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-primary)', outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {/* Photo URL */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Photo URL <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(for avatar — leave blank for voice-only)</span>
              </label>
              <input
                type="text"
                value={photoUrl}
                onChange={e => setPhotoUrl(e.target.value)}
                placeholder="https://..."
                style={{
                  width: '100%', padding: '8px 12px', fontSize: 13,
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />
            </div>

            {/* Build button + status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button
                className="btn-primary"
                onClick={handleBuild}
                disabled={!customName.trim() || building}
                style={{ padding: '10px 24px', fontSize: 14, background: building ? 'var(--surface-3)' : '#a855f7' }}
              >
                {building ? 'Building...' : 'Build Persona'}
              </button>
              {buildStatus && (
                <span style={{
                  fontSize: 13,
                  color: buildStatus.status === 'done' ? '#34d399'
                    : buildStatus.status === 'failed' ? '#ef4444'
                    : '#a855f7',
                  animation: building ? 'skeleton-pulse 1.4s ease infinite' : undefined,
                }}>
                  {buildStatus.progress_label}
                </span>
              )}
            </div>

            {buildStatus?.status === 'failed' && buildStatus.error && (
              <div style={{ marginTop: 12, fontSize: 12, color: '#ef4444', fontFamily: 'monospace' }}>
                {buildStatus.error}
              </div>
            )}

            {/* Disclaimer */}
            <p style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Stylized AI training persona. Simulated from public content. Not a real likeness. Not affiliated with the named person.
            </p>
          </div>
        )}

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
          <button className="btn-primary" onClick={handleStart} disabled={starting || personaId === '__custom__'} style={{ fontSize: 15, padding: '13px 32px' }}>
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
