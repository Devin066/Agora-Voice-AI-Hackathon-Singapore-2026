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
  RemoteAudioTrack,
  RemoteVideoTrack,
  useJoin,
  useLocalMicrophoneTrack,
  usePublish,
  useRemoteAudioTracks,
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
  transcriptRef: React.MutableRefObject<Array<{ role: string; text: string }>>
}

function SessionInner({ session, personaColor, personaName, transcriptRef }: SessionInnerProps) {
  const { channel, appid, rtc_token, user_uid, agent_uid, agent_video_uid } = session

  // Join RTC channel (leaves automatically on unmount)
  useJoin({ appid, channel, token: rtc_token, uid: Number(user_uid) })

  const { localMicrophoneTrack } = useLocalMicrophoneTrack()
  usePublish([localMicrophoneTrack])

  // Subscribe to and play remote audio (agent's voice)
  const remoteUsers = useRemoteUsers()
  const { audioTracks } = useRemoteAudioTracks(remoteUsers)

  // ConvoAI hooks
  const { agentState } = useAgentState()
  const transcript      = useTranscript()

  const stateKey = agentState ?? 'idle'
  const state    = STATE_CONFIG[stateKey] ?? STATE_CONFIG.idle

  const [isMuted, setIsMuted] = useState(false)
  const toggleMute = () => {
    if (!localMicrophoneTrack) return
    const next = !isMuted
    localMicrophoneTrack.setEnabled(!next)
    setIsMuted(next)
  }

  // Transcript → display format
  const scrollRef = useRef<HTMLDivElement>(null)
  const displayTranscript = transcript.map(t => ({
    role: String(t.uid) === String(agent_uid) ? 'interviewer' : 'candidate',
    text: t.text,
  }))

  // Keep parent's ref in sync so InterviewPage can read it on end
  useEffect(() => {
    transcriptRef.current = displayTranscript
  }, [transcript, transcriptRef, displayTranscript])

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
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
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: stateKey === 'thinking' ? 'var(--surface-3)' : `${state.color}18`,
              border: `1.5px solid ${stateKey === 'thinking' ? 'var(--border)' : `${state.color}50`}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s ease',
              overflow: 'hidden',
            }}>
              {stateKey === 'speaking' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  {[0.1, 0.25, 0, 0.35, 0.15].map((delay, i) => (
                    <div key={i} style={{
                      width: 3, height: 20,
                      background: state.color,
                      borderRadius: 2,
                      animation: 'waveform-scaleY 0.8s ease infinite',
                      animationDelay: `${delay}s`,
                      transformOrigin: 'center',
                    }} />
                  ))}
                </div>
              ) : (
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                  stroke={stateKey === 'thinking' ? 'var(--text-muted)' : state.color}
                  strokeWidth="2" style={{ transition: 'stroke 0.3s ease' }}>
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                </svg>
              )}
            </div>
          </div>

          {stateKey === 'thinking' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: state.color,
                  animation: 'dot-bounce 0.9s ease infinite',
                  animationDelay: `${delay}s`,
                }} />
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: state.color }} />
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
                {state.label}
              </span>
            </div>
          )}

          {/* Mute toggle */}
          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            style={{
              width: 32, height: 32, borderRadius: '50%',
              background: isMuted ? 'rgba(239,68,68,0.08)' : 'transparent',
              border: `1px solid ${isMuted ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            {isMuted ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/>
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            )}
          </button>
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

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
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

      {/* Play remote audio tracks (agent voice) — hidden elements */}
      {audioTracks.map((track, i) => (
        <RemoteAudioTrack key={i} track={track} play />
      ))}
    </div>
  )
}

// ── Fallback UI for mock / stub mode ─────────────────────────────────────────
function DemoModeUI() {
  // Distinguish "backend is running in stub mode" (real tokens returned, just
  // Agora skipped) from "backend fetch failed entirely" (SetupPage catch writes
  // literal 'mock_rtc_token'). Real stub-mode tokens always start with '006'.
  const session = (() => {
    try { return JSON.parse(sessionStorage.getItem('session') ?? '{}') }
    catch { return {} }
  })()
  const channel = session.channel ?? ''
  const isBackendStub = typeof session.rtc_token === 'string' && session.rtc_token.startsWith('006')

  const title = isBackendStub
    ? 'Backend connected · Stub mode (no Agora voice)'
    : 'Demo mode — backend not connected'

  const body = isBackendStub ? (
    <>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10 }}>
        The backend is running and reachable. Stub mode is enabled
        (<code>PP_STUB_AGORA=1</code>), so the Agora voice loop is skipped and no
        real audio is captured. The full integration is otherwise live — session
        state, LLM proxy, and feedback all work normally.
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 10 }}>
        To exercise the end-to-end integration:
      </p>
      <ol style={{ color: 'var(--text-secondary)', fontSize: 13, paddingLeft: 20, marginBottom: 12, lineHeight: 1.7 }}>
        <li>Open DevTools Console and run the seed command below</li>
        <li>Click <strong>End Interview</strong> above</li>
        <li>The feedback page will call Gemini and render real scored results</li>
      </ol>
      <div style={{
        fontFamily: 'GeistMono, monospace', fontSize: 11,
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 12px',
        color: 'var(--text-primary)',
        wordBreak: 'break-all',
        lineHeight: 1.5,
      }}>
        fetch('http://localhost:8200/debug/seed-transcript?channel={channel || '&lt;channel&gt;'}', {'{'}method:'POST'{'}'}).then(r=&gt;r.json()).then(console.log)
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 12 }}>
        Channel: <code>{channel}</code>
      </p>
    </>
  ) : (
    <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>
      Start the FastAPI backend on port 8200 and run a new interview session to connect.
    </p>
  )

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
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: isBackendStub ? '#10b981' : 'var(--text-muted)',
          }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {title}
          </span>
        </div>
      </div>
      <div style={{
        flex: 1, background: 'var(--surface-1)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        overflow: 'auto', display: 'flex', flexDirection: 'column',
        minHeight: 0, marginBottom: 24,
      }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {isBackendStub ? 'Integration Test' : 'Transcript'}
          </span>
        </div>
        <div style={{ flex: 1, padding: '20px' }}>
          {body}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
interface VoiceSessionProps {
  personaColor: string
  personaName:  string
  transcriptRef: React.MutableRefObject<Array<{ role: string; text: string }>>
}

export default function VoiceSession({ personaColor, personaName, transcriptRef }: VoiceSessionProps) {
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

    let cancelled = false
    let loggedIn = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rtm: any = new (AgoraRTM as any).RTM(session.appid, session.user_uid)

    ;(async () => {
      try {
        await rtm.login({ token: session.rtm_token })
        loggedIn = true
        if (!cancelled) {
          setRtmClient(rtm)
        } else {
          // Component unmounted during login — clean up silently
          rtm.logout().catch(() => {})
        }
      } catch (err) {
        if (!cancelled) {
          setRtmError(String(err))
        }
      }
    })()

    return () => {
      cancelled = true
      // Only logout if login already completed. Calling logout while
      // login is in-flight causes RTM error -10023 ("canceled by user").
      if (loggedIn) {
        rtm.logout().catch(() => {})
      }
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
            transcriptRef={transcriptRef}
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
