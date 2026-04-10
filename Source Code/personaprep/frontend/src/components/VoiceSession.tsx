/**
 * VoiceSession.tsx
 *
 * Manages the full Agora lifecycle for a live interview session:
 *   RTM  → login → (ConversationalAIProvider subscribes the channel internally)
 *   RTC  → join + publish mic (via useJoin / useLocalMicrophoneTrack)
 *
 * Renders the interview body: state indicator, avatar panel, transcript.
 * The page header / footer / timer live in InterviewPage.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import AgoraRTC, {
  AgoraRTCProvider,
  RemoteVideoTrack,
  useJoin,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteUsers,
  useRemoteUserTrack,
} from 'agora-rtc-react'
import AgoraRTM from 'agora-rtm'
import {
  ConversationalAIProvider,
  useTranscript,
  useAgentState,
} from 'agora-agent-client-toolkit-react'
import type { StartInterviewResponse } from '../types/api'

// Singleton RTC client — created once, lives for the app lifetime
export const rtcClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })

// ── State config ─────────────────────────────────────────────────────────────
const STATE_CONFIG: Record<string, { label: string; color: string }> = {
  listening:   { label: 'Listening', color: '#22c55e' },
  thinking:    { label: 'Thinking',  color: '#f59e0b' },
  speaking:    { label: 'Speaking',  color: '#a78bfa' },
  idle:        { label: 'Idle',      color: '#888888' },
  silent:      { label: 'Idle',      color: '#888888' },
}

// ── Avatar panel ─────────────────────────────────────────────────────────────
function AvatarPanel({ agentVideoUid }: { agentVideoUid: string }) {
  const remoteUsers = useRemoteUsers()
  const avatarUser  = remoteUsers.find(u => String(u.uid) === agentVideoUid)
  const { track: videoTrack } = useRemoteUserTrack(avatarUser, 'video')

  return (
    <div style={{
      width: 280, height: 210, flexShrink: 0,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {videoTrack
        ? <RemoteVideoTrack track={videoTrack} play style={{ width: '100%', height: '100%' }} />
        : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Avatar connecting...</p>
        )
      }
    </div>
  )
}

// ── Session inner — all Agora hooks must be inside the provider stack ─────────
interface SessionInnerProps {
  session: StartInterviewResponse
  personaColor: string
  personaName:  string
}

function SessionInner({ session, personaColor, personaName }: SessionInnerProps) {
  const { channel, appid, rtc_token, user_uid, agent_uid, agent_video_uid } = session

  // Join RTC channel (leaves automatically on unmount)
  useJoin({ appid, channel, token: rtc_token, uid: Number(user_uid) })

  const { localMicrophoneTrack } = useLocalMicrophoneTrack()
  usePublish([localMicrophoneTrack])

  // ConvoAI hooks
  const { agentState } = useAgentState()
  const transcript      = useTranscript()

  const stateKey = agentState ?? 'idle'
  const state    = STATE_CONFIG[stateKey] ?? STATE_CONFIG.idle

  // Transcript → display format
  const transcriptRef = useRef<HTMLDivElement>(null)
  const displayTranscript = transcript.map(t => ({
    role: String(t.uid) === String(agent_uid) ? 'interviewer' : 'candidate',
    text: t.text,
  }))

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
    }
  }, [transcript])

  const hasAvatar = Boolean(agent_video_uid)

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      maxWidth: 760,
      width: '100%',
      margin: '0 auto',
      padding: '0 24px',
      overflow: 'hidden',
    }}>
      {/* Agent state + optional avatar */}
      <div style={{
        display: 'flex',
        flexDirection: hasAvatar ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: hasAvatar ? 'center' : undefined,
        gap: 32,
        padding: '40px 0 32px',
        flexShrink: 0,
      }}>
        {/* Mic / state ring */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            position: 'relative', width: 80, height: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {stateKey === 'listening' && (
              <>
                <div style={{
                  position: 'absolute', inset: -12, borderRadius: '50%',
                  border: `1.5px solid ${state.color}`,
                  animation: 'pulse-ring 2s ease infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: -24, borderRadius: '50%',
                  border: `1px solid ${state.color}`,
                  animation: 'pulse-ring 2s ease 0.4s infinite',
                }} />
              </>
            )}
            {stateKey === 'speaking' && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: `radial-gradient(circle, ${state.color}22 0%, transparent 70%)`,
                animation: 'breathing 1.5s ease infinite',
              }} />
            )}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: stateKey === 'thinking' ? 'var(--surface-3)' : `${state.color}18`,
              border: `1.5px solid ${stateKey === 'thinking' ? 'var(--border)' : `${state.color}50`}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke={stateKey === 'thinking' ? 'var(--text-muted)' : state.color}
                strokeWidth="2" style={{ transition: 'stroke 0.3s ease' }}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: state.color,
              animation: stateKey === 'thinking' ? 'blink 1s ease infinite' : undefined,
            }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {state.label}
            </span>
          </div>
        </div>

        {/* Avatar video (when enabled) */}
        {hasAvatar && agent_video_uid && (
          <AvatarPanel agentVideoUid={agent_video_uid} />
        )}
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
          flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Transcript
          </span>
        </div>

        <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {displayTranscript.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
              Transcript will appear here as the conversation unfolds...
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {displayTranscript.map((turn, i) => (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: turn.role === 'candidate' ? 'flex-end' : 'flex-start',
                  animation: 'fadeUp 0.3s ease both',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: turn.role === 'interviewer' ? personaColor : 'var(--text-muted)',
                    marginBottom: 4,
                  }}>
                    {turn.role === 'interviewer' ? personaName : 'You'}
                  </span>
                  <div style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: turn.role === 'candidate' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: turn.role === 'candidate' ? 'var(--surface-3)' : `${personaColor}12`,
                    border: `1px solid ${turn.role === 'candidate' ? 'var(--border)' : `${personaColor}25`}`,
                    fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)',
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
  )
}

// ── Fallback UI for mock / demo mode ─────────────────────────────────────────
function DemoModeUI() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      maxWidth: 760, width: '100%', margin: '0 auto',
      padding: '0 24px', overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '48px 0 40px', gap: 16, flexShrink: 0,
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--surface-3)',
          border: '1.5px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            Demo mode — backend not connected
          </span>
        </div>
      </div>
      <div style={{
        flex: 1, background: 'var(--surface-1)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        minHeight: 0, marginBottom: 24,
      }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Transcript
          </span>
        </div>
        <div style={{ flex: 1, padding: '20px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
            Start the FastAPI backend on port 8200 and run a new interview session to connect.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface VoiceSessionProps {
  personaColor: string
  personaName:  string
}

export default function VoiceSession({ personaColor, personaName }: VoiceSessionProps) {
  const session = useMemo<StartInterviewResponse>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('session') ?? '{}')
    } catch {
      return {} as StartInterviewResponse
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rtmClient, setRtmClient] = useState<any>(null)
  const [rtmError,  setRtmError]  = useState<string | null>(null)

  const isMock = !session.appid || session.appid === 'mock_app_id'

  useEffect(() => {
    if (isMock) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rtm: any = new (AgoraRTM as any).RTM(session.appid, session.user_uid)

    ;(async () => {
      try {
        await rtm.login({ token: session.rtm_token })
        setRtmClient(rtm)
      } catch (err) {
        setRtmError(String(err))
      }
    })()

    return () => {
      rtm.logout().catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const providerConfig = useMemo(() => {
    if (!rtmClient || !session.channel) return null
    return {
      channel:   session.channel,
      rtmConfig: { rtmEngine: rtmClient },
    }
  }, [rtmClient, session.channel])

  // ── Mock / demo mode ────────────────────────────────────────────────────
  if (isMock) return <DemoModeUI />

  // ── RTM error ───────────────────────────────────────────────────────────
  if (rtmError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ fontSize: 13, color: '#ef4444' }}>RTM connection failed: {rtmError}</p>
      </div>
    )
  }

  // ── Real Agora session ──────────────────────────────────────────────────
  return (
    <AgoraRTCProvider client={rtcClient}>
      {providerConfig ? (
        <ConversationalAIProvider config={providerConfig}>
          <SessionInner
            session={session}
            personaColor={personaColor}
            personaName={personaName}
          />
        </ConversationalAIProvider>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Connecting...</p>
        </div>
      )}
    </AgoraRTCProvider>
  )
}
