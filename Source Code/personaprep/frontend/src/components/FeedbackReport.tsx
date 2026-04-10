import { useState } from 'react'
import type { FeedbackResponse } from '../types/api'

interface Props {
  feedback: FeedbackResponse
}

const RUBRIC_LABELS: Record<string, string> = {
  clarity:         'Clarity',
  specificity:     'Specificity',
  technical_depth: 'Technical Depth',
  confidence:      'Confidence',
}

const RUBRIC_COLORS: Record<string, string> = {
  clarity:         '#a78bfa',
  specificity:     '#60a5fa',
  technical_depth: '#34d399',
  confidence:      '#fbbf24',
}

function ScoreRing({ score }: { score: number }) {
  const r = 54
  const circumference = 2 * Math.PI * r   // ≈ 339.3
  const offset = circumference - (score / 10) * circumference

  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Track */}
        <circle cx="70" cy="70" r={r}
          fill="none" stroke="var(--surface-3)"
          strokeWidth="8"
        />
        {/* Fill */}
        <circle cx="70" cy="70" r={r}
          fill="none" stroke="#7c3aed"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          style={{ animation: 'score-draw 1s ease both', transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: 'Syne', fontWeight: 800, fontSize: 28,
          color: 'var(--text-primary)', lineHeight: 1,
          letterSpacing: '-0.03em',
        }}>
          {score.toFixed(1)}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>/10</span>
      </div>
    </div>
  )
}

export default function FeedbackReport({ feedback }: Props) {
  const [expandedAnswer, setExpandedAnswer] = useState<number | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Score + summary */}
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '28px 32px',
        display: 'flex', gap: 32, alignItems: 'center',
        flexWrap: 'wrap',
        animation: 'fadeUp 0.4s ease both',
      }}>
        <ScoreRing score={feedback.overall_score} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
            Overall Performance
          </p>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {feedback.summary}
          </p>
        </div>
      </div>

      {/* Rubric */}
      <div style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '24px 28px',
        animation: 'fadeUp 0.4s ease 0.05s both',
      }}>
        <p className="section-label">Score Breakdown</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Object.entries(feedback.rubric).map(([key, val]) => (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                  {RUBRIC_LABELS[key] ?? key}
                </span>
                <span style={{ fontSize: 13, color: RUBRIC_COLORS[key], fontWeight: 600 }}>
                  {val.toFixed(1)}
                </span>
              </div>
              <div className="rubric-bar-track">
                <div
                  className="rubric-bar-fill"
                  style={{
                    width: `${(val / 10) * 100}%`,
                    background: RUBRIC_COLORS[key],
                    animationDelay: '0.2s',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths + Weaknesses */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
        animation: 'fadeUp 0.4s ease 0.1s both',
      }}>
        {/* Strengths */}
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px 24px',
        }}>
          <p className="section-label" style={{ color: '#4ade80' }}>Strengths</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feedback.strengths.map((s, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20,6 9,17 4,12"/>
                  </svg>
                </span>
                <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px 24px',
        }}>
          <p className="section-label" style={{ color: '#f87171' }}>To Improve</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {feedback.weaknesses.map((w, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </span>
                <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Improved answers */}
      {feedback.improved_answer_examples.length > 0 && (
        <div style={{
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          animation: 'fadeUp 0.4s ease 0.15s both',
        }}>
          <p className="section-label" style={{ padding: '20px 24px 0', marginBottom: 0 }}>
            Suggested Improvements
          </p>
          {feedback.improved_answer_examples.map((ex, i) => (
            <div key={i} style={{ borderTop: i === 0 ? '1px solid var(--border)' : undefined, marginTop: i === 0 ? 16 : 0 }}>
              <button
                onClick={() => setExpandedAnswer(expandedAnswer === i ? null : i)}
                style={{
                  width: '100%', background: 'none', border: 'none',
                  padding: '16px 24px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 16,
                }}
              >
                <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', textAlign: 'left', lineHeight: 1.5, fontStyle: 'italic' }}>
                  "{ex.question}"
                </span>
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="var(--text-muted)" strokeWidth="2"
                  style={{ flexShrink: 0, transform: expandedAnswer === i ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }}
                >
                  <polyline points="6,9 12,15 18,9"/>
                </svg>
              </button>
              {expandedAnswer === i && (
                <div style={{
                  padding: '0 24px 20px',
                  borderTop: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}>
                  <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-light)', marginBottom: 10, marginTop: 16 }}>
                    Stronger approach
                  </p>
                  <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                    {ex.suggestion}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
