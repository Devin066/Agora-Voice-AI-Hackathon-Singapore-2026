# PersonaPrep — Architecture

## Project Location

`Source Code/personaprep/`

---

## System Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           PersonaPrep System                              │
│                                                                           │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │   Frontend   │    │  PersonaPrep     │    │   Agora ConvoAI      │   │
│  │(React + TS)  │───▶│ Backend (FastAPI) │───▶│   REST API           │   │
│  │              │    │                  │    │                      │   │
│  │  /setup      │    │  /start-interview│    │  starts voice agent  │   │
│  │  /interview  │    │  /stop-interview │    │  (UID 100, audio)    │   │
│  │  /feedback   │    │  /feedback       │    │  starts avatar agent │   │
│  └──────┬───────┘    │  /chat/completions◀───│  (UID 200, video)    │   │
│         │            │    (LLM proxy)   │    └──────────────────────┘   │
│         │            └──────────────────┘    ┌────────────────────┐     │
│         │                                    │   Agora SD-RTN     │     │
│         └────────────────────────────────────│      channel       │     │
│         voice audio + avatar video + RTM     │                    │     │
│                                              └────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

The key insight: Agora's ConvoAI agent calls our `/chat/completions` endpoint instead of OpenAI directly. This is the **persona injection layer** — every LLM turn gets the persona card + session state injected before proxying to OpenAI.

When avatar is enabled, the ConvoAI engine starts a **second agent** (the avatar, e.g. HeyGen/Akool) that joins the same RTC channel as a separate video-publishing UID. The frontend subscribes to that remote video track alongside the voice audio.

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
            @agora/agent-ui-kit \
            react-router-dom
```

`agora-agent-client-toolkit-react` is required for live transcript (`useTranscript`) and agent state (`useAgentState`). `@agora/agent-ui-kit` provides `AvatarVideoDisplay` for rendering the avatar video stream. No SSR concerns — all Agora SDKs run in the browser without special import handling.

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
  "avatar_vendor": "heygen",
  "agent_video_uid": "200",
  "question_count": 0,
  "questions_asked": [],
  "transcript": []
}
```

`agent_id` is returned by the ConvoAI `/join` call. It is required for `/leave` (stop interview) and `/agents/{agentId}/history` (feedback). `agent_video_uid` is the UID the avatar video agent joins as — the frontend subscribes to this UID's video track.

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

- Agora pipeline handles: ASR (Ares) + AIVAD + TTS (ElevenLabs/OpenAI/Rime — vendor set in `/join`)
- Our server handles: LLM via `/chat/completions` proxy
- Avatar is optional — set `PP_AVATAR_VENDOR` to enable
- Agora natively proxies ElevenLabs (TTS) and Anam (avatar) at runtime — we only call their APIs directly during one-time persona build

`.env` for PersonaPrep backend:

```bash
PP_APP_ID=...
PP_APP_CERTIFICATE=...
PP_PIPELINE_ID=...          # Pre-configured pipeline for voice processing
PP_LLM_API_KEY=sk-...       # Our OpenAI key — used in the proxy
PP_LLM_MODEL=gpt-4o-mini    # Fast enough for real-time
PP_TUNNEL_URL=https://...   # cloudflared/ngrok tunnel (Agora calls this)

# Avatar (optional — leave blank to disable)
PP_AVATAR_VENDOR=anam       # anam | akool | liveavatar (Agora-supported vendors)
PP_AVATAR_API_KEY=...       # Anam API key (only needed for build-time avatar creation)
PP_AVATAR_ID=...            # Avatar ID from the vendor's console
PP_AGENT_VIDEO_UID=200      # UID the avatar video agent joins as
PP_TTS_SAMPLE_RATE=24000    # Must match avatar: anam→24000, akool→16000
```

The pipeline owns all voice wiring (STT/TTS/VAD). We own only the LLM call, keeping the proxy simple and latency-focused. Avatar adds a second participant to the RTC channel that publishes video. At runtime, Agora handles all ElevenLabs and Anam API calls — our backend just passes the `voice_id` and `avatar_id` in the `/join` payload.

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
- **When avatar is enabled**: `remote_rtc_uids` **cannot be `["*"]`** — must be `[user_uid]` (exact UID, e.g. `["101"]`). The wildcard causes the avatar join to fail.
- Agent name must be unique per project — use a UUID suffix to avoid HTTP 409 collisions
- The `/join` response `agent_id` identifies the live session (≠ Studio Agent ID / pipeline_id)
- **TTS sample rate must match avatar vendor**: HeyGen → 24000 Hz, Akool → 16000 Hz, Anam → 24000 Hz. Mismatch causes `session.start()` to throw at the SDK level.

---

## Key Technical Flow

### Session Start

1. Frontend sends `POST /start-interview` with `{ persona_id, role, interview_type, difficulty }`
2. Backend creates session in `session_store`, generates persona system prompt, calls Agora ConvoAI `POST /join` with:
   - Custom LLM URL + RTM flags
   - If `PP_AVATAR_VENDOR` is set: avatar block + video agent token
3. Stores `agent_id` from `/join` response in session store
4. Returns `{ channel, rtc_token, rtm_token, appid, agent_uid, agent_video_uid }`
   - **Three tokens required**: RTC token (for client to join RTC), RTM token (for client to log into RTM), ConvoAI token (used internally by backend for the `/join` call)
   - `agent_video_uid` is the UID the avatar video stream joins as (e.g. `"200"`). Frontend uses this to subscribe to the correct remote video track.
5. Frontend initialization order (critical — must follow this sequence):
   a. Initialize RTC client
   b. Login to RTM with `rtm_token`
   c. Subscribe to RTM channel (same name as RTC channel)
   d. Join RTC channel with `rtc_token`
   e. Subscribe to remote video track from `agent_video_uid` (if avatar enabled)
6. Interviewer greets → conversation begins (with or without avatar video)

### Frontend Component Pattern (VoiceSession.tsx)

```tsx
// Uses agora-rtc-react + agora-agent-client-toolkit-react + @agora/agent-ui-kit
<AgoraRTCProvider client={rtcClient}>
  <ConversationalAIProvider config={{ channel, rtmConfig: { rtmEngine: rtmClient } }}>
    {/* useJoin + useLocalMicrophoneTrack + usePublish for RTC */}
    {/* useTranscript() → live transcript display */}
    {/* useAgentState() → listening/thinking/speaking indicator */}
    {/* useRemoteUsers() + AvatarVideoDisplay → avatar video (if enabled) */}
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

---

## Avatar Integration

### How it works

When `PP_AVATAR_VENDOR` is set in `.env`, the backend:
1. Generates a second RTC token for `PP_AGENT_VIDEO_UID` (e.g. `"200"`)
2. Adds an `avatar` block to the ConvoAI `/join` payload
3. Switches `remote_rtc_uids` from `["*"]` to `["101"]` (user UID — required for avatar)
4. Returns `agent_video_uid` in the `StartInterviewResponse`

The frontend:
1. Reads `agent_video_uid` from session storage
2. Uses `useRemoteUsers()` from `agora-rtc-react` to find the avatar user by UID
3. Renders the avatar video track with `AvatarVideoDisplay` from `@agora/agent-ui-kit`

### Vendor-specific requirements

| Vendor | TTS sample rate | Extra params | Agora `/join` vendor name |
|--------|----------------|--------------|---------------------------|
| Anam | **24000 Hz** | `sample_rate: 24000`, `video_encoding: "AV1"` | `"anam"` |
| Akool | **16000 Hz** | minimal params only | `"akool"` |
| LiveAvatar | **24000 Hz** | varies | `"liveavatar"` |

### ConvoAI `/join` payload diff when avatar is enabled

```diff
- "remote_rtc_uids": ["*"],
+ "remote_rtc_uids": ["101"],

+ "avatar": {
+   "vendor": "anam",
+   "enable": true,
+   "params": {
+     "api_key": "{PP_AVATAR_API_KEY}",
+     "agora_uid": "200",
+     "agora_token": "{video_agent_rtc_token}",
+     "avatar_id": "{PP_AVATAR_ID}",
+     "sample_rate": 24000,
+     "video_encoding": "AV1"
+   }
+ }
```

Agora handles the Anam API calls at runtime — our backend just passes the `avatar_id` (created during persona build) in the `/join` payload.

### Avatar is optional

If `PP_AVATAR_VENDOR` is blank, the system runs voice-only. The frontend gracefully degrades: no avatar video panel is rendered, `agent_video_uid` is `null` in the response. All Phase 2 voice features work with or without avatar.

### Avatar safety: stylized only

For custom personas built from real people's photos, the avatar is created using **Anam's native stylization** — `style: "anime"` or `style: "comic_book"`. This produces a clearly non-photorealistic avatar directly at the vendor level, with no image preprocessing needed. The `"photorealistic"` style is never used for custom personas of real people. The disclaimer text reflects this: "Stylized AI training persona. Not a real likeness."

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
| Avatar join fails | Check `remote_rtc_uids` is `["101"]` not `["*"]` when avatar is enabled |
| Avatar no video on frontend | Confirm `agent_video_uid` matches the UID used in `avatar.params.agora_uid` |
| TTS/avatar sample rate mismatch | Set `PP_TTS_SAMPLE_RATE` to match vendor: Anam→24000, Akool→16000 |
