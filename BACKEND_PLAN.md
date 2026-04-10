# PersonaPrep — Backend Implementation Plan

> **Progress:** Phase 1 COMPLETE | Phase 2 COMPLETE | Phase 3 COMPLETE | Phase 4 COMPLETE | Phase 5 COMPLETE (live Agora + OpenAI verification still pending)

## Overview

FastAPI backend that orchestrates Agora ConvoAI agent sessions, injects interviewer personas into every LLM turn, and generates post-session feedback. Runs on port `8200`, exposed to the internet via a cloudflared tunnel so Agora's cloud can call our `/chat/completions` proxy.

---

## File Structure

```
Source Code/personaprep/backend/
├── server.py          # FastAPI app — main endpoints
├── llm_proxy.py       # /chat/completions — persona injection + OpenAI forward
├── personas.py        # 4 hardcoded PersonaCard dataclasses
├── session_store.py   # In-memory session state (dict keyed by channel)
├── feedback.py        # Post-call transcript analysis via OpenAI
├── tokens.py          # Agora RTC + RTM token generation
├── requirements.txt
└── .env               # Never committed
```

---

## Environment Variables (`.env`)

```bash
PP_APP_ID=...
PP_APP_CERTIFICATE=...
PP_PIPELINE_ID=...           # Pre-configured Agora pipeline (ASR/TTS/VAD)
PP_LLM_API_KEY=sk-...        # OpenAI key used by the proxy
PP_LLM_MODEL=gpt-4o-mini     # Realtime proxy model
PP_FEEDBACK_MODEL=gpt-4o     # Feedback analysis model (quality > speed)
PP_TUNNEL_URL=https://...    # cloudflared public URL — Agora calls this
CONVOAI_BASE_URL=https://api.agora.io/api/conversational-ai/v2
```

---

## Dependencies (`requirements.txt`)

```
fastapi
uvicorn[standard]
httpx
pydantic
agora-token-builder
python-dotenv
openai
```

---

## Phase 1 — Server Skeleton + Personas + Tokens

Goal: server runs, health check passes, `/personas` returns data, `/start-interview` returns tokens (Agora join call can be stubbed).

### `tokens.py`

- `build_rtc_token(channel, uid, role=RtcTokenBuilder.RolePublisher, expire=86400)` — uses `RtcTokenBuilder.buildTokenWithUid`
- `build_rtm_token(user_id, expire=86400)` — uses `RtmTokenBuilder.buildToken`
- `build_convoai_token(channel, uid="0", expire=86400)` — uses `RtcTokenBuilder.buildTokenWithRtm`; this goes in the `Authorization: agora token=<value>` header for ConvoAI API calls

### `personas.py`

Define `PersonaCard` dataclass and a `PERSONAS: dict[str, PersonaCard]` lookup.

```python
@dataclass
class PersonaCard:
    id: str
    name: str
    description: str
    tts_voice: str           # alloy | echo | fable | onyx | nova | shimmer
    directness: int          # 1–10
    warmth: int              # 1–10
    skepticism: int          # 1–10
    follow_up_heaviness: int # 1–10
    asks_for_examples: bool
    tests_tradeoffs: bool
    focus_areas: list[str]
    example_phrases: list[str]
    tone_tags: list[str]     # for /personas listing (e.g. ["direct", "skeptical"])
    system_prompt_template: str
```

Four entries in `PERSONAS`:

| id | name | directness | warmth | skepticism |
|----|------|------------|--------|------------|
| `skeptical_technical` | Skeptical Technical Interviewer | 9 | 3 | 9 |
| `friendly_recruiter` | Friendly Recruiter | 4 | 9 | 3 |
| `startup_founder` | Startup Founder | 8 | 5 | 7 |
| `senior_hiring_manager` | Senior Hiring Manager | 7 | 6 | 6 |

System prompt template (rendered per session):

```
You are an AI-generated mock interview persona for professional practice.
You are NOT a real person.

Style: {tone_description}
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

### `session_store.py`

```python
@dataclass
class TranscriptTurn:
    role: str        # "interviewer" | "candidate"
    text: str
    turn_id: int
    timestamp: float

@dataclass
class SessionState:
    channel: str
    agent_id: str        # from Agora /join response — required for /leave
    persona_id: str
    role: str
    interview_type: str
    difficulty: str
    question_count: int = 0
    questions_asked: list[str] = field(default_factory=list)
    transcript: list[TranscriptTurn] = field(default_factory=list)

_sessions: dict[str, SessionState] = {}

def create_session(state: SessionState) -> None: ...
def get_session(channel: str) -> SessionState | None: ...
def delete_session(channel: str) -> None: ...
```

### `server.py` — Initial Endpoints

```
GET  /health              → { "status": "ok" }
GET  /personas            → { "personas": [...] }  (id, name, description, tone_tags)
POST /start-interview     → StartInterviewResponse  (Agora join stubbed in Phase 1)
POST /stop-interview      → { "ok": true }
GET  /feedback            → FeedbackResponse
GET  /session/{channel}   → full SessionState (debug endpoint)
POST /chat/completions    → LLM proxy (plain forward in Phase 1, persona injection in Phase 3)
```

CORS: allow `http://localhost:5173` (Vite dev server).

**Phase 1 gate checks:**
- [x] `curl http://localhost:8200/health` → `{ "status": "ok" }`
- [x] `curl http://localhost:8200/personas` → 4 persona objects
- [x] `POST /start-interview` returns `StartInterviewResponse`-shaped object with non-empty token strings (starting with `006...`)
- [x] 34/34 tests passing (tokens: 7, personas: 11, session_store: 7, server: 9)

---

## Phase 2 — Real Agora Agent Start/Stop

Goal: `POST /start-interview` actually starts an Agora ConvoAI agent; `POST /stop-interview` stops it.

### `POST /start-interview` full flow

1. Generate `channel = uuid4().hex[:10]`
2. `rtc_token = build_rtc_token(channel, uid=101)`
3. `rtm_token = build_rtm_token(user_id="101")`
4. `convoai_token = build_convoai_token(channel, uid="0")`
5. Look up `persona = PERSONAS[body.persona_id]`
6. Render persona system prompt with session params
7. Call Agora ConvoAI `POST /join`:

```json
{
  "name": "personaprep_{uuid[:8]}",
  "pipeline_id": "{PP_PIPELINE_ID}",
  "properties": {
    "channel": "{channel}",
    "token": "{convoai_token}",
    "agent_rtc_uid": "0",
    "remote_rtc_uids": ["*"],
    "llm": {
      "url": "{PP_TUNNEL_URL}/chat/completions",
      "api_key": "not-used",
      "vendor": "custom",
      "style": "openai",
      "system_messages": [{ "role": "system", "content": "{persona_system_prompt}" }],
      "greeting_message": "Let's get started. Tell me, what brings you here today?",
      "max_history": 12,
      "params": { "model": "gpt-4o-mini" }
    }
  },
  "advanced_features": { "enable_rtm": true },
  "parameters": { "data_channel": "rtm" }
}
```

Authorization header: `agora token={convoai_token}`

8. Extract `agent_id` from response body
9. `create_session(SessionState(channel=channel, agent_id=agent_id, ...))`
10. Return `{ channel, appid, rtc_token, rtm_token, agent_uid: "100", user_uid: "101" }`

### `POST /stop-interview`

1. `session = get_session(channel)` → 404 if missing
2. Call `POST {CONVOAI_BASE_URL}/agents/{session.agent_id}/leave`
3. Return `{ "ok": true }`

### `/chat/completions` stub (Phase 2)

Plain forward to OpenAI — no persona injection yet:

```python
async def forward_to_openai(body: dict) -> StreamingResponse:
    body.pop("params", None)   # strip Agora-specific fields
    # forward to OpenAI /v1/chat/completions, stream response back
```

**Phase 2 gate checks:**
- [x] `/chat/completions` endpoint registered and forwards to OpenAI (mocked in tests)
- [x] `strip_agora_params` strips `params` without mutating original body
- [x] Streaming response returns `text/event-stream` content type
- [x] 42/42 tests passing (tokens: 7, personas: 11, session_store: 7, server: 11, llm_proxy: 6)
- [ ] Agora Console shows agent RUNNING after `POST /start-interview` (requires real credentials)
- [ ] Agent disappears from console after `POST /stop-interview` (requires real credentials)
- [ ] Agent voice audible in the RTC channel (requires real credentials + tunnel)

---

## Phase 3 — Full Persona Injection

Goal: every LLM turn is conditioned on the session persona and state.

### `llm_proxy.py` — Full implementation

On each `POST /chat/completions` from Agora:

1. Extract `channel = body["params"]["channel"]`
2. `session = get_session(channel)` → return 500 if missing
3. Build `context_block`:

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

4. Prepend system message: `persona.system_prompt + "\n\n" + context_block`
5. Strip `params` from body before forwarding
6. Stream response back to Agora via `StreamingResponse`
7. On stream complete: append agent turn to `session.transcript`, increment `session.question_count`, track question in `session.questions_asked`

### Streaming pattern

```python
async def stream_openai(messages, model) -> AsyncGenerator[bytes, None]:
    async with httpx.AsyncClient(timeout=30) as client:
        async with client.stream("POST", OPENAI_URL, json={...}, headers={...}) as r:
            async for chunk in r.aiter_bytes():
                yield chunk
```

**Phase 3 gate checks:**
- [x] Persona system prompt injected as first message in every LLM call (verified by e2e test)
- [x] Different personas produce different system prompts (unit test)
- [x] Context block includes role, interview_type, difficulty, question_count, recent questions
- [x] Opening/continue/wrap-up instruction varies by question_count (wrap-up at `>= 4`)
- [x] Session transcript updated after stream completes (e2e test)
- [x] `question_count` incremented after each agent turn
- [x] `questions_asked` stores extracted questions (last `?` sentence, truncated), not full reply
- [x] Stream errors mid-flight still commit partial transcript + yield synthetic error SSE
- [x] Multi-turn test verifies counter increments across sequential turns
- [x] 82/82 tests passing (tokens: 11, personas: 11, session_store: 7, server: 19, llm_proxy: 34)
- [ ] Live run: Skeptical Technical persona pushes back on vague answers (requires real Agora + OpenAI)
- [ ] Live run: Friendly Recruiter gives noticeably warmer responses (requires real Agora + OpenAI)

---

## Phase 4 — Feedback Endpoint

Goal: after session ends, one-shot LLM call produces scored feedback.

### `feedback.py`

```python
def format_transcript(session: SessionState) -> str:
    lines = []
    for turn in session.transcript:
        label = "Interviewer" if turn.role == "interviewer" else "Candidate"
        lines.append(f"[{label}] {turn.text}")
    return "\n".join(lines)

async def generate_feedback(session: SessionState) -> dict:
    transcript_text = format_transcript(session)
    persona = PERSONAS[session.persona_id]
    prompt = f"""
You are an interview coach reviewing a mock interview transcript.

Candidate was interviewing for: {session.role} ({session.interview_type} round)
Interviewer persona: {persona.name}

Transcript:
{transcript_text}

Evaluate using this rubric and return valid JSON only:
- clarity (0–10): was the answer clear and well-structured?
- specificity (0–10): did they give concrete examples and numbers?
- technical_depth (0–10): did they demonstrate depth appropriate for the role?
- confidence (0–10): did they sound assured, not rambling?

Return:
{{
  "overall_score": <average of rubric scores>,
  "summary": "<one paragraph summary>",
  "rubric": {{ "clarity": x, "specificity": x, "technical_depth": x, "confidence": x }},
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "improved_answer_examples": [{{ "question": "...", "suggestion": "..." }}]
}}

Cite exact phrases from the transcript in strengths/weaknesses. Be specific, not generic.
"""
    # Call OpenAI gpt-4o with response_format={"type": "json_object"}
    # Parse and return the JSON
```

### `GET /feedback` wiring in `server.py`

1. `session = get_session(channel)` → 404 if missing
2. `if not session.transcript: raise HTTPException(404, "No transcript")`
3. `result = await generate_feedback(session)`
4. Return `FeedbackResponse`

**Phase 4 gate checks:**
- [x] `feedback.py` with `format_transcript`, `build_feedback_prompt`, `parse_feedback_response`, `generate_feedback`
- [x] `/feedback` endpoint returns parsed feedback JSON matching `FeedbackResponse` shape
- [x] 404 returned for unknown channel
- [x] 404 returned when session exists but transcript is empty
- [x] 500 returned when feedback generation raises `ValueError`
- [x] 502 returned when upstream OpenAI call fails
- [x] Candidate turns now captured in transcript via `capture_candidate_turn` (dedupes repeated messages)
- [x] `generate_feedback` uses `gpt-4o` with `response_format: json_object` and temperature 0.2
- [x] `parse_feedback_response` validates required fields, raises `ValueError` on malformed LLM output
- [x] `FeedbackResponse` Pydantic model enforces TS contract via OpenAPI schema
- [x] Network errors (ConnectError, ReadTimeout) mapped to 502 (not 500)
- [x] `parse_feedback_response` rejects non-dict rubric, non-string summary, non-numeric scores
- [x] Numeric string coercion (`"7.5"` → `7.5`) and range clamping to `[0, 10]`
- [x] 114/114 tests passing (tokens: 11, personas: 11, session_store: 7, server: 25, llm_proxy: 40, feedback: 20)
- [ ] Live run: rubric scores differ from each other (not all the same) — requires real OpenAI
- [ ] Live run: weaknesses contain actual quotes from transcript — requires real OpenAI

---

## Phase 5 — Polish

- [x] Request logging per session start (persona_id, role, channel) — `server.start_interview` logs structured fields
- [x] Agora 409 collision retry — `_join_convoai_agent` retries up to `MAX_409_RETRIES=3` times with fresh uuid suffix, backs off to 502 after exhaustion
- [x] Backend README with setup, run, tunnel restart, troubleshooting — `Source Code/personaprep/backend/README.md`
- [x] `.env.example` complete (all vars documented including `PP_STUB_AGORA`)
- [x] 116/116 tests passing (added 2 retry tests: success-after-collision and max-retries-exhausted)

---

## API Contract (locked)

### `POST /start-interview`
**Request:**
```json
{ "persona_id": "skeptical_technical", "role": "AI Engineer", "interview_type": "technical", "difficulty": "hard" }
```
**Response:**
```json
{ "channel": "abc123def4", "appid": "...", "rtc_token": "006...", "rtm_token": "006...", "agent_uid": "100", "user_uid": "101" }
```

### `POST /stop-interview?channel={channel}`
**Response:** `{ "ok": true }`

### `GET /feedback?channel={channel}`
**Response:**
```json
{
  "overall_score": 7.6,
  "summary": "...",
  "rubric": { "clarity": 8.2, "specificity": 6.9, "technical_depth": 7.4, "confidence": 7.8 },
  "strengths": ["..."],
  "weaknesses": ["..."],
  "improved_answer_examples": [{ "question": "...", "suggestion": "..." }]
}
```

### `GET /personas`
**Response:**
```json
{ "personas": [{ "id": "...", "name": "...", "description": "...", "tone_tags": ["..."] }] }
```

### `POST /chat/completions`
OpenAI-compatible endpoint called by Agora. Injects persona + session context, streams response.

### `GET /session/{channel}` (debug)
Returns full `SessionState` as JSON.

---

## Critical Gotchas

| Issue | Fix |
|-------|-----|
| `agent_rtc_uid` must be a string | Pass `"0"` not `0` |
| `remote_rtc_uids` must be an array | Pass `["*"]` not `"*"` |
| 409 collision on agent name | Use `personaprep_{uuid[:8]}` — unique per call |
| Transcript missing on frontend | `/join` payload must include `advanced_features.enable_rtm: true` AND `parameters.data_channel: "rtm"` |
| Agora can't reach proxy | Set `PP_TUNNEL_URL` before starting server; verify with `curl` from external network |
| CORS errors from frontend | `allow_origins=["http://localhost:5173"]` in FastAPI CORS middleware |
| Streaming proxy strips extras | Remove `params` from body before forwarding to OpenAI |

---

## Running Locally

```bash
cd "Source Code/personaprep/backend"
python -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env   # fill in values

# In a separate terminal:
cloudflared tunnel --url http://localhost:8200
# Copy the https://... URL into .env as PP_TUNNEL_URL

uvicorn server:app --port 8200 --reload
```

Verify:
```bash
curl http://localhost:8200/health
curl http://localhost:8200/personas
```
