# PersonaPrep — Technical Details

Component-by-component breakdown of every part in the architecture.

---

## 0. Frontend Scaffold

**Stack:** Vite + React 18 + TypeScript

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install agora-rtc-sdk-ng agora-rtc-react agora-rtm \
            agora-agent-client-toolkit agora-agent-client-toolkit-react \
            react-router-dom
```

### Routing (`src/main.tsx`)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import SetupPage from "./pages/SetupPage"
import InterviewPage from "./pages/InterviewPage"
import FeedbackPage from "./pages/FeedbackPage"

<BrowserRouter>
  <Routes>
    <Route path="/" element={<Navigate to="/setup" replace />} />
    <Route path="/setup" element={<SetupPage />} />
    <Route path="/interview" element={<InterviewPage />} />
    <Route path="/feedback" element={<FeedbackPage />} />
  </Routes>
</BrowserRouter>
```

**Why Vite over Next.js:** Agora SDKs are browser-only. Vite produces a pure client bundle — no SSR, no `next/dynamic` workarounds, no dynamic import boundary needed. Simpler setup for a hackathon.

---

## 1. FastAPI Backend (`backend/server.py`)

**Runtime:** Python 3.11+, uvicorn  
**Port:** 8200 (local), behind cloudflared tunnel in demo

### Endpoints

#### `POST /start-interview`

Request body:
```json
{
  "persona_id": "skeptical_technical",
  "role": "AI Engineer",
  "interview_type": "technical",
  "difficulty": "hard"
}
```

Responsibilities:
1. Generate a random channel name (`uuid4().hex[:10]`)
2. Generate RTC token via `RtcTokenBuilder.buildTokenWithUid` (user UID = `101`, 24h expiry)
3. Generate RTM token via `RtmTokenBuilder.buildToken` (user ID = `"101"`, 24h expiry)
4. Generate ConvoAI server token via `RtcTokenBuilder.buildTokenWithRtm` (agent UID = `"100"`) — used in `Authorization: agora token=<value>` header on the `/join` call
5. Look up persona card from `personas.py`
6. Construct persona system prompt from the persona card fields
7. Call Agora ConvoAI `POST /join` with:
   - `properties.llm.url` = `{TUNNEL_URL}/chat/completions`
   - `properties.llm.vendor` = `"custom"` (causes Agora to send `turn_id` + `channel` per request)
   - `properties.llm.system_messages` = persona system prompt
   - `advanced_features.enable_rtm` = `true`
   - `parameters.data_channel` = `"rtm"`
   - `agent_rtc_uid` = `"0"` (string, not int)
   - `remote_rtc_uids` = `["*"]` (array, not string)
   - `pipeline_id` = from env (handles ASR/TTS/VAD)
8. Extract `agent_id` from `/join` response
9. Write session to `session_store[channel]`
10. Return `{ channel, rtc_token, rtm_token, appid, agent_uid: "100" }`

#### `POST /stop-interview`

Query param: `channel`

1. Look up `agent_id` from `session_store[channel]`
2. Call `POST /agents/{agent_id}/leave` on ConvoAI API
3. Return `{ ok: true }`

#### `GET /feedback`

Query param: `channel`

1. Look up full `transcript` from `session_store[channel]`
2. Build feedback prompt (see Feedback Engine section)
3. Call OpenAI with the transcript + rubric prompt
4. Parse structured JSON from response
5. Return feedback JSON

#### `POST /chat/completions`

The custom LLM proxy endpoint Agora calls on every agent turn. See LLM Proxy section.

### Dependencies

```
fastapi
uvicorn[standard]
httpx              # async HTTP for OpenAI + Agora REST calls
pydantic           # request/response models
agora-token        # RTC + RTM token generation
python-dotenv
```

### Why FastAPI over Flask

- Native async — no thread-pool blocking on the OpenAI forwarding call
- Pydantic models give automatic request validation and clear schemas
- Built-in OpenAPI docs at `/docs` useful during dev
- `StreamingResponse` makes it straightforward to forward SSE from OpenAI back to Agora

---

## 2. Persona Engine (`backend/personas.py`)

**Pattern:** Dict of `PersonaCard` dataclasses, keyed by `persona_id`

### PersonaCard schema

```python
@dataclass
class PersonaCard:
    id: str
    name: str
    tts_voice: str           # alloy | echo | fable | onyx | nova | shimmer
    directness: int          # 1–10
    warmth: int              # 1–10
    skepticism: int          # 1–10
    follow_up_heaviness: int # 1–10
    asks_for_examples: bool
    tests_tradeoffs: bool
    focus_areas: list[str]
    example_phrases: list[str]
    system_prompt: str       # rendered at session start
```

### System prompt rendering

The `system_prompt` field is a template rendered with the session context at call time:

```
You are an AI-generated mock interview persona for professional practice. 
You are NOT a real person.

Style: {tone description derived from directness/warmth/skepticism scores}
Role: Interview the candidate for a {role} position ({interview_type} round, {difficulty} difficulty).

Rules:
- Ask ONE question at a time
- Push for specifics when answers are vague
- Ask follow-up questions if: no concrete example, impact unclear, reasoning weak
- Move on if: answer is strong, or 3+ follow-ups already asked on this question
- Do NOT help the candidate answer
- Do NOT break character
- Keep responses under 40 words for voice delivery

Focus on: {focus_areas}

Example phrasing: {example_phrases}

Disclaimer: You are an AI training persona, not a real interviewer.
```

### The 4 prebuilt personas

| id | name | directness | warmth | skepticism | focus |
|----|------|------------|--------|------------|-------|
| `skeptical_technical` | Skeptical Technical Interviewer | 9 | 3 | 9 | depth, tradeoffs, ownership |
| `friendly_recruiter` | Friendly Recruiter | 4 | 9 | 3 | motivation, fit, communication |
| `startup_founder` | Startup Founder | 8 | 5 | 7 | execution, speed, impact |
| `senior_hiring_manager` | Senior Hiring Manager | 7 | 6 | 6 | judgment, teamwork, impact |

---

## 3. Session Store (`backend/session_store.py`)

**Pattern:** Module-level dict — simple, sufficient for a single-process hackathon server

```python
_sessions: dict[str, SessionState] = {}

@dataclass
class SessionState:
    channel: str
    agent_id: str           # from Agora /join response — needed for /leave
    persona_id: str
    role: str
    interview_type: str
    difficulty: str
    question_count: int = 0
    questions_asked: list[str] = field(default_factory=list)
    transcript: list[TranscriptTurn] = field(default_factory=list)

@dataclass
class TranscriptTurn:
    role: str               # "interviewer" | "candidate"
    text: str
    turn_id: int
    timestamp: float
```

The proxy writes to `transcript` on every LLM response. The feedback endpoint reads the full transcript for analysis.

---

## 4. Custom LLM Proxy (`backend/llm_proxy.py`)

This is the core intelligence layer. Agora's ConvoAI engine calls it on every turn instead of calling OpenAI directly.

### What Agora sends

When `LLM_VENDOR=custom`, Agora adds `turn_id`, `timestamp`, and `channel` to the request body's `params` object:

```json
{
  "model": "gpt-4o-mini",
  "messages": [ ... conversation history ... ],
  "stream": true,
  "params": {
    "turn_id": 3,
    "timestamp": 1712345678,
    "channel": "abc123def4"
  }
}
```

### What the proxy does

```
Agora → POST /chat/completions
           │
           ├─ extract channel from body.params.channel
           ├─ look up session = session_store[channel]
           ├─ build injected_messages:
           │    [system: persona prompt + session context]
           │    + body.messages (Agora's history)
           ├─ forward to OpenAI with injected_messages
           ├─ stream SSE response back to Agora
           └─ on stream complete: append turn to session.transcript
```

### Persona + context injection (per turn)

The proxy prepends a system message built from:
- Full persona system prompt
- Current session state: `question_count`, `questions_asked`, `role`, `interview_type`
- Instruction fragment based on question count (opening vs. follow-up vs. wrap-up)

```python
context_block = f"""
Session context:
- Role being interviewed for: {session.role}
- Interview type: {session.interview_type}
- Difficulty: {session.difficulty}
- Questions asked so far: {session.question_count}
- Previous questions: {session.questions_asked[-3:]}

{"Ask your opening question." if session.question_count == 0 else
 "Continue the interview. Follow up if the last answer was vague, or move to the next topic."}
{"Begin wrapping up — ask one final question." if session.question_count >= 4 else ""}
"""
```

### Streaming

FastAPI returns a `StreamingResponse` that forwards the OpenAI SSE chunks directly to Agora with no buffering. This keeps latency minimal.

```python
async def stream_openai(messages, model) -> AsyncGenerator[bytes, None]:
    async with httpx.AsyncClient() as client:
        async with client.stream("POST", OPENAI_URL, json={...}, headers={...}) as r:
            async for chunk in r.aiter_bytes():
                yield chunk
```

---

## 5. Feedback Engine (`backend/feedback.py`)

Runs once after the session ends. Not latency-sensitive — can take 5–10 seconds.

### Input

Full `session.transcript` as a formatted string:

```
[Interviewer] Tell me about a distributed system you designed.
[Candidate] I built a data ingestion pipeline at my last job...
[Interviewer] Be specific — what was the actual bottleneck?
[Candidate] The bottleneck was in the Kafka consumer lag...
```

### Prompt structure

```
You are an interview coach reviewing a mock interview transcript.

Candidate was interviewing for: {role} ({interview_type} round)
Interviewer persona: {persona_name}

Transcript:
{formatted_transcript}

Evaluate using this rubric and return valid JSON only:
- clarity (0–10): was the answer clear and well-structured?
- specificity (0–10): did they give concrete examples and numbers?
- technical_depth (0–10): did they demonstrate depth appropriate for the role?
- confidence (0–10): did they sound assured, not rambling?

Return:
{
  "overall_score": <average>,
  "rubric": { "clarity": x, "specificity": x, "technical_depth": x, "confidence": x },
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "improved_answer_examples": [
    { "question": "...", "suggestion": "..." }
  ],
  "summary": "one paragraph summary"
}

Cite exact phrases from the transcript in strengths/weaknesses. Be specific, not generic.
```

### Model choice

`gpt-4o` for feedback (higher quality, not latency-sensitive) vs `gpt-4o-mini` for the realtime proxy.

---

## 6. Frontend — Setup Page (`frontend/src/pages/SetupPage.tsx`)

Pure React — no Agora SDK needed here.

### Form fields

```tsx
interface SetupFormValues {
  role: "AI Engineer" | "Product Manager" | "SWE" | "Startup Founder"
  interview_type: "behavioral" | "technical" | "recruiter_screen"
  persona_id: "skeptical_technical" | "friendly_recruiter" | "startup_founder" | "senior_hiring_manager"
  difficulty: "easy" | "medium" | "hard"
}
```

On submit:
1. `POST /start-interview` with form values
2. Store `{ channel, rtc_token, rtm_token, appid, agent_uid }` in `sessionStorage`
3. `navigate("/interview")` via `useNavigate()` from `react-router-dom`

---

## 7. Frontend — Live Interview Page (`frontend/src/pages/InterviewPage.tsx` + `VoiceSession.tsx`)

No SSR concerns — Vite bundles for the browser only. Agora SDKs can be imported at the top level.

### Component internals

```tsx
// VoiceSession.tsx — simplified structure
// Vite = browser-only bundle, so top-level Agora imports are fine
import AgoraRTC from "agora-rtc-sdk-ng"
import AgoraRTM from "agora-rtm"
import { AgoraRTCProvider } from "agora-rtc-react"
import { ConversationalAIProvider } from "agora-agent-client-toolkit-react"

const rtcClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" })
const rtmClient = new AgoraRTM.RTM(appid, String(USER_UID))

// Initialization order (enforced with useEffect + async queue):
// 1. rtmClient.login({ token: rtm_token })
// 2. rtmClient.subscribe(channel)             ← must happen BEFORE joining RTC
// 3. rtcClient.join(appid, channel, rtc_token, USER_UID)
// 4. publish microphone track

// Provider stack:
<AgoraRTCProvider client={rtcClient}>
  <ConversationalAIProvider config={useMemo(() => ({
    channel,
    rtmConfig: { rtmEngine: rtmClient }
  }), [channel])}>
    <InterviewUI />
  </ConversationalAIProvider>
</AgoraRTCProvider>
```

### Hooks used

| Hook | Source | Purpose |
|------|--------|---------|
| `useJoin` | `agora-rtc-react` | Join the RTC channel |
| `useLocalMicrophoneTrack` | `agora-rtc-react` | Capture mic |
| `usePublish` | `agora-rtc-react` | Publish mic to channel |
| `useTranscript` | `agora-agent-client-toolkit-react` | Live transcript — returns full history array, replace not append |
| `useAgentState` | `agora-agent-client-toolkit-react` | `"listening" \| "thinking" \| "speaking"` — drives UI indicator |

### Interview UI layout

```
┌──────────────────────────────────┐
│  [Persona badge] Skeptical Tech  │
│  [Timer] 04:32          [End]    │
├──────────────────────────────────┤
│  Agent: ●●● thinking...          │
│                                  │
│  Transcript:                     │
│  [AI] Tell me about a system...  │
│  [You] I built a pipeline...     │
│  [AI] Be more specific.          │
└──────────────────────────────────┘
```

### End interview

```tsx
const navigate = useNavigate()

const handleEnd = async () => {
  await fetch(`http://localhost:8200/stop-interview?channel=${channel}`, { method: "POST" })
  // backend calls /leave first
  await rtcClient.leave()          // then client leaves RTC
  await rtmClient.unsubscribe(channel)
  await rtmClient.logout()
  navigate(`/feedback?channel=${channel}`)
}
```

---

## 8. Frontend — Feedback Page (`frontend/src/pages/FeedbackPage.tsx`)

No Agora SDK. Pure data display.

On mount: reads `channel` from query string via `useSearchParams()`, calls `GET http://localhost:8200/feedback?channel={channel}` → renders `FeedbackReport`.

### FeedbackReport layout

```
Overall: 7.6 / 10  ← animated score ring

Rubric:
  Clarity        ████████░░  8.2
  Specificity    ██████░░░░  6.9
  Technical Depth███████░░░  7.4
  Confidence     ███████░░░  7.8

Strengths:
  ✓ Clear opening framing
  ✓ Good ownership language

Weaknesses:
  ✗ Did not quantify impact — "I improved the system" → add a number
  ✗ Tradeoff answer was surface-level

Suggested improvement:
  Q: "What tradeoff did you make between consistency and latency?"
  Better answer: "We chose eventual consistency because..."

[Full Transcript ▼]   [Practice Again →]
```

---

## 9. Agora ConvoAI Engine

**Not code we write** — this is the managed Agora service. Our job is to configure it correctly.

### What it does

1. Joins our RTC channel as participant UID `"100"`
2. Receives user's mic audio via the channel
3. Runs ASR (configured via pipeline — Ares engine, `en-US`)
4. Calls our `/chat/completions` proxy with the transcript
5. Receives response text
6. Runs TTS (configured via pipeline — OpenAI or Rime voice)
7. Publishes synthesized audio back to the channel
8. Publishes transcript + state events to RTM channel (same name as RTC channel)

### Join payload we send

```json
{
  "name": "personaprep_{uuid8}",
  "pipeline_id": "{PP_PIPELINE_ID}",
  "properties": {
    "channel": "{channel}",
    "token": "{convoai_server_token}",
    "agent_rtc_uid": "0",
    "remote_rtc_uids": ["*"],
    "llm": {
      "url": "{TUNNEL_URL}/chat/completions",
      "api_key": "not-used",
      "vendor": "custom",
      "style": "openai",
      "system_messages": [{ "role": "system", "content": "{persona_system_prompt}" }],
      "greeting_message": "Let's get started. {opening_question}",
      "max_history": 12,
      "params": { "model": "gpt-4o-mini" }
    }
  },
  "advanced_features": { "enable_rtm": true },
  "parameters": { "data_channel": "rtm" }
}
```

### Transcript delivery path

```
Agent speaks → TTS audio → RTC channel → user hears it
Agent turn → RTM message → client RTM subscription → useTranscript() update → UI
```

---

## 10. Tunnel (`cloudflared`)

The Agora ConvoAI cloud calls our `/chat/completions` proxy. It must be reachable from Agora's servers — `localhost` won't work.

```bash
cloudflared tunnel --url http://localhost:8200
# → https://random-words.trycloudflare.com
```

Set `PP_TUNNEL_URL=https://random-words.trycloudflare.com` in `.env` before starting the server.

For demo stability: use a named tunnel with a fixed subdomain via `cloudflared tunnel create personaprep`. That way the URL doesn't change between restarts.
