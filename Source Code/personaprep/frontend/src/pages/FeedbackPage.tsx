import { useNavigate } from 'react-router-dom'
import FeedbackReport from '../components/FeedbackReport'
import type { FeedbackResponse } from '../types/api'

const MOCK_FEEDBACK: FeedbackResponse = {
  overall_score: 7.6,
  summary:
    'Strong communication and clear opening framing. Answers showed ownership and good structure. Under follow-up pressure, specificity dropped — tradeoff reasoning stayed surface-level. Quantifying impact earlier would significantly strengthen responses.',
  rubric: {
    clarity:         8.2,
    specificity:     6.9,
    technical_depth: 7.4,
    confidence:      7.8,
  },
  strengths: [
    'Clear opening framing on system design question',
    'Strong ownership language throughout',
    'Recovered well after the first challenge',
  ],
  weaknesses: [
    '"I improved the system" — no measurement or numbers given',
    'Tradeoff between consistency and latency stayed surface-level',
    'Answer on bottleneck identification rambled under follow-up',
  ],
  improved_answer_examples: [
    {
      question: 'What tradeoff did you make between consistency and latency?',
      suggestion:
        'Lead with the constraint: "We chose eventual consistency because our SLA required p99 < 200ms — strict consistency would have added ~40ms per write due to consensus overhead. We mitigated stale reads with client-side caching and a 500ms TTL." Then close with the outcome.',
    },
    {
      question: 'Tell me about a system you built end-to-end.',
      suggestion:
        'Use the framing: problem → architecture decision → your specific contribution → measurable outcome. Keep it under 90 seconds. Example: "The problem was X. I chose Y architecture because Z. My contribution was A and B. The result was a 40% reduction in p95 latency."',
    },
  ],
}

export default function FeedbackPage() {
  const navigate = useNavigate()
  const personaId = sessionStorage.getItem('persona_id') ?? 'skeptical_technical'
  const role      = sessionStorage.getItem('role') ?? 'AI Engineer'

  const PERSONA_NAMES: Record<string, string> = {
    skeptical_technical:   'Skeptical Technical',
    friendly_recruiter:    'Friendly Recruiter',
    startup_founder:       'Startup Founder',
    senior_hiring_manager: 'Senior Hiring Manager',
  }

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
          {PERSONA_NAMES[personaId]} · {role}
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
            Here's how you performed. Use this to prepare before your next round.
          </p>
        </div>

        <FeedbackReport feedback={MOCK_FEEDBACK} />

        {/* CTA */}
        <div style={{ marginTop: 36, display: 'flex', gap: 12, animation: 'fadeUp 0.4s ease 0.2s both' }}>
          <button className="btn-primary" onClick={() => navigate('/setup')}>
            Practice Again
          </button>
          <button className="btn-ghost" onClick={() => navigate('/interview')}>
            Review Session
          </button>
        </div>
      </main>
    </div>
  )
}
