# PersonaPrep — Architecture

## Project Location

`Source Code/personaprep/`

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        PersonaPrep System                           │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐  │
│  │   Frontend   │    │  PersonaPrep     │    │   Agora ConvoAI  │  │
│  │(React + TS)  │───▶│ Backend (FastAPI) │───▶│   REST API       │  │
│  │              │    │                  │    │                  │  │
│  │  /setup      │    │  /start-interview│    │  starts agent    │  │
│  │  /interview  │    │  /stop-interview │    │  joins channel   │  │
│  │  /feedback   │    │  /feedback       │    └──────────────────┘  │
│  └──────┬───────┘    │  /chat/completions◀─────────────────────┐   │
│         │            │    (LLM proxy)   │                       │   │
│         │            └──────────────────┘    ┌──────────────┐  │   │
│         │                                    │  Agora SD-RTN│  │   │
│         └────────────────────────────────────│   channel    │  │   │
│              (RTC voice + RTM transcript)    │              │──┘   │
│                                              └──────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

The key insight: Agora's ConvoAI agent calls our `/chat/completions` endpoint instead of OpenAI directly. This is the **persona injection layer** — every LLM turn gets the persona card + session state injected before proxying to OpenAI.

---

## File Structure

```
Source Code/personaprep/
├── backend/
│   ├── server.py              # FastAPI app — start-interview, stop-interview, feedback
│   ├── llm_proxy.py           # /chat/completions — persona injection + OpenAI forward
│   ├── personas.py            # 4 hardcoded persona cards
│   ├── session_store.py       # In-memory session state (dict keyed by channel)
│   ├── feedback.py            # Post-call transcript analysis
│   ├── tokens.py              # Agora token generation (same pattern as simple-backend)
│   └── .env
└── frontend/                  # Vite + React + TypeScript
    ├── src/
    │   ├── main.tsx           # Entry point, React Router setup
    │   ├── pages/
    │   │   ├── SetupPage.tsx  # Persona + role selection form
    │   │   ├── InterviewPage.tsx # Live voice UI + transcript
    │   │   └── FeedbackPage.tsx  # Score + breakdown + transcript
    │   └── components/
    │       ├── PersonaCard.tsx
    │       ├── VoiceSession.tsx  # AgoraRTCProvider + ConversationalAIProvider + hooks
    │       └── FeedbackReport.tsx
    ├── index.html
    └── vite.config.ts
```

### Frontend Dependencies

```bash
npm install agora-rtc-sdk-ng agora-rtc-react agora-rtm \
            agora-agent-client-toolkit agora-agent-client-toolkit-react \
            react-router-dom
```

`agora-agent-client-toolkit-react` is required for live transcript (`useTranscript`) and agent state (`useAgentState`). No SSR concerns — all Agora SDKs run in the browser without special import handling.

---

## Data Models

### Persona Card

```json
{
  "id": "skeptical_technical",
  "name": "Skeptical Technical Interviewer",
  "tts_voice": "alloy",
  "tone": { "directness": 9, "warmth": 3, "skepticism": 9, "formality": 7 },
  "question_style": {
    "follow_up_heaviness": 9,
    "asks_for_examples": true,
    "tests_tradeoffs": true,
    "interrupts_when_vague": true
  },
  "focus_areas": ["technical depth", "system design", "tradeoffs", "ownership"],
  "example_phrases": ["Be specific.", "What was the actual tradeoff?", "How do you know that worked?"],
  "system_prompt": "You are a sharp, skeptical technical interviewer..."
}
```

### Session State (in-memory, keyed by channel)

```json
{
  "channel": "abc123",
  "agent_id": "agent_a1b2c3d4",
  "persona_id": "skeptical_technical",
  "role": "AI Engineer",
  "interview_type": "technical",
  "difficulty": "hard",
  "question_count": 0,
  "questions_asked": [],
  "transcript": []
}
```

`agent_id` is returned by the ConvoAI `/join` call. It is required for `/leave` (stop interview) and `/agents/{agentId}/history` (feedback). Must be stored at session start.

### Feedback Output

```json
{
  "overall_score": 7.6,
  "rubric": {
    "clarity": 8.2,
    "specificity": 6.9,
    "technical_depth": 7.4,
    "confidence": 7.8
  },
  "strengths": ["Clear opening framing", "Good ownership language"],
  "weaknesses": ["Did not quantify impact", "Tradeoff discussion stayed surface-level"],
  "improved_answer_examples": [
    { "question": "...", "suggestion": "..." }
  ]
}
```

---

## Agora Config Strategy

Use the **pipeline + custom LLM** pattern from AGENT.md:

- Agora pipeline handles: ASR (Ares) + AIVAD + TTS (OpenAI/Rime)
- Our server handles: LLM via `/chat/completions` proxy

`.env` for PersonaPrep backend:

```bash
PP_APP_ID=...
PP_APP_CERTIFICATE=...
PP_PIPELINE_ID=...          # Pre-configured pipeline for voice processing
PP_LLM_API_KEY=sk-...       # Our OpenAI key — used in the proxy
PP_LLM_MODEL=gpt-4o-mini    # Fast enough for real-time
PP_TUNNEL_URL=https://...   # cloudflared/ngrok tunnel (Agora calls this)
```

The pipeline owns all voice wiring (STT/TTS/VAD). We own only the LLM call, keeping the proxy simple and latency-focused.

### Required ConvoAI `/join` Flags

Both of these must be in every `/join` payload for RTM transcript delivery and agent state events to work:

```json
{
  "advanced_features": { "enable_rtm": true },
  "parameters": { "data_channel": "rtm" }
}
```

Without both flags, `useTranscript` and `useAgentState` will never fire on the client.

### Agora API Gotchas

- `agent_rtc_uid` must be a **string** — pass `"0"` not `0`
- `remote_rtc_uids` must be an **array** — pass `["*"]` not `"*"`
- Agent name must be unique per project — use a UUID suffix to avoid HTTP 409 collisions
- The `/join` response `agent_id` identifies the live session (≠ Studio Agent ID / pipeline_id)

---

## Key Technical Flow

### Session Start

1. Frontend sends `POST /start-interview` with `{ persona_id, role, interview_type, difficulty }`
2. Backend creates session in `session_store`, generates persona system prompt, calls Agora ConvoAI `POST /join` with custom LLM URL + RTM flags
3. Stores `agent_id` from `/join` response in session store
4. Returns `{ channel, rtc_token, rtm_token, appid, agent_uid }`
   - **Three tokens required**: RTC token (for client to join RTC), RTM token (for client to log into RTM), ConvoAI token (used internally by backend for the `/join` call)
5. Frontend initialization order (critical — must follow this sequence):
   a. Initialize RTC client
   b. Login to RTM with `rtm_token`
   c. Subscribe to RTM channel (same name as RTC channel)
   d. Join RTC channel with `rtc_token`
6. Interviewer greets → conversation begins

### Frontend Component Pattern (VoiceSession.tsx)

```tsx
// Uses agora-rtc-react + agora-agent-client-toolkit-react
<AgoraRTCProvider client={rtcClient}>
  <ConversationalAIProvider config={{ channel, rtmConfig: { rtmEngine: rtmClient } }}>
    {/* useJoin + useLocalMicrophoneTrack + usePublish for RTC */}
    {/* useTranscript() → live transcript display */}
    {/* useAgentState() → listening/thinking/speaking indicator */}
  </ConversationalAIProvider>
</AgoraRTCProvider>
```

### Per-Turn LLM Proxy

Each time the Agora agent calls our `/chat/completions`:

1. Extract `channel` from request params (Agora passes via `params` when `LLM_VENDOR=custom`)
2. Look up session state
3. Prepend persona system message + session context to the messages array
4. Forward to OpenAI
5. Append agent response to session transcript
6. Increment question counter, track what was asked

### Session End

1. User clicks End → frontend calls `POST /stop-interview?channel=abc123`
2. Backend looks up `agent_id` from session store, calls `POST /agents/{agent_id}/leave`
3. **Then** frontend leaves RTC channel (give agent time to exit gracefully)
4. Frontend redirects to `/feedback?channel=abc123`
5. Backend runs one-shot LLM analysis over session transcript → returns feedback JSON
6. Frontend renders the dashboard

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| LLM drifts out of interviewer role | Hard constraint in system prompt + "do not break character" rule in persona card |
| Latency kills the demo feel | `gpt-4o-mini`, keep system prompt under 500 tokens, short context window (last 6 turns only) |
| Feedback feels generic | Prompt explicitly cites 2-3 quoted lines from transcript with rubric scores |
| Public tunnel goes down mid-demo | Backup ngrok ready + test 30 min before, keep demo under 5 min |
| Transcript missing from frontend | Must include `advanced_features.enable_rtm: true` + `parameters.data_channel: "rtm"` in `/join` payload |
| RTM events not firing | RTM client must be logged in and subscribed to channel **before** joining RTC channel |
| Agent won't stop | Store `agent_id` from `/join` response; call `POST /agents/{agent_id}/leave` on stop |
| CORS errors on API calls | FastAPI backend must set `allow_origins=["http://localhost:5173"]` (Vite default port) |
