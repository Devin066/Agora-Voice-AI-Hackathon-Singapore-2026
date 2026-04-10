# PersonaPrep — Implementation Phases

Two people working in parallel: **BE** (backend) and **FE** (frontend).  
Each phase has a gate — both must pass their gate before either moves to the next phase.

---

## Phase 0 — Contract (Both Together, ~30 min)

Do this together before splitting. Everything downstream depends on it.

### Deliverables

1. Agree on the full API contract (request/response shapes for all 4 endpoints)
2. Agree on shared TypeScript types — FE generates them, BE matches them
3. Both confirm local tooling works (Python venv, Node, cloudflared installed)
4. BE spins up cloudflared tunnel and shares the URL with FE

### API Contract (lock this down now)

```typescript
// POST /start-interview
// Request
interface StartInterviewRequest {
  persona_id: "skeptical_technical" | "friendly_recruiter" | "startup_founder" | "senior_hiring_manager"
  role: "AI Engineer" | "SWE" | "Product Manager" | "Startup Founder"
  interview_type: "behavioral" | "technical" | "recruiter_screen"
  difficulty: "easy" | "medium" | "hard"
}
// Response
interface StartInterviewResponse {
  channel: string
  appid: string
  rtc_token: string
  rtm_token: string
  agent_uid: string         // "100"
  user_uid: string          // "101"
  agent_video_uid: string | null  // "200" if avatar enabled, null otherwise
}

// POST /stop-interview?channel={channel}
// Response
interface StopInterviewResponse {
  ok: boolean
}

// GET /feedback?channel={channel}
// Response
interface FeedbackResponse {
  overall_score: number
  summary: string
  rubric: {
    clarity: number
    specificity: number
    technical_depth: number
    confidence: number
  }
  strengths: string[]
  weaknesses: string[]
  improved_answer_examples: Array<{ question: string; suggestion: string }>
}

// GET /personas
// Response
interface PersonasResponse {
  personas: Array<{
    id: string
    name: string
    description: string
    tone_tags: string[]  // e.g. ["direct", "skeptical"]
  }>
}
```

### Gate: Phase 0 → Phase 1

- [ ] API contract written and agreed
- [ ] Shared TypeScript types file created at `frontend/src/types/api.ts`
- [ ] Both have repo cloned and local env running
- [ ] Tunnel URL shared with FE (FE will mock it initially)

---

## Phase 1 — Foundations (Parallel)

### BE: Server skeleton + personas + tokens

**Tasks:**
1. FastAPI app with CORS configured for `http://localhost:5173`
2. `GET /health` → `{ status: "ok" }`
3. `GET /personas` → list of 4 persona cards
4. `personas.py` — all 4 `PersonaCard` dataclasses with system prompt templates
5. `tokens.py` — `build_rtc_token` and `build_rtm_token` using `agora-token` library
6. `session_store.py` — `SessionState` dataclass, `create_session`, `get_session`
7. `.env.example` with all required vars documented

**Does not need:** live Agora calls, LLM proxy, feedback

### FE: Vite scaffold + setup page

**Tasks:**
1. `npm create vite@latest` with react-ts template
2. Install all deps: agora packages + react-router-dom
3. `main.tsx` with BrowserRouter + 3 routes
4. `src/types/api.ts` with the agreed contract types
5. `SetupPage.tsx` — full form with all fields, persona selector shows cards with name + tone tags
6. On submit: store mock session data in `sessionStorage`, navigate to `/interview`
7. `InterviewPage.tsx` — placeholder "Interview will go here" with the session data displayed
8. `FeedbackPage.tsx` — placeholder with hardcoded mock feedback data rendered in `FeedbackReport.tsx`

**Does not need:** any Agora SDK, any real API calls

### Gate: Phase 1 → Phase 2

**BE must demo:**
- [ ] `curl http://localhost:8200/health` → `{ "status": "ok" }`
- [ ] `curl http://localhost:8200/personas` → 4 persona objects with correct fields
- [ ] `curl -X POST http://localhost:8200/start-interview -d '{"persona_id":"skeptical_technical","role":"AI Engineer","interview_type":"technical","difficulty":"hard"}' -H "Content-Type: application/json"` → returns object matching `StartInterviewResponse` shape (Agora call can be mocked/stubbed at this point)
- [ ] Tokens are non-empty strings (valid Agora token format starts with `006...`)

**FE must demo:**
- [ ] Setup page renders all 4 personas, all role/type/difficulty options
- [ ] Selecting a persona and submitting navigates to `/interview`
- [ ] `/interview` reads and displays session data from `sessionStorage`
- [ ] `/feedback` renders mock `FeedbackReport` with all sections: score, rubric bars, strengths, weaknesses, improved answers

---

## Phase 2 — Live Voice Loop (Parallel)

The most critical phase. Goal: user and agent can actually speak to each other.

### BE: Real Agora agent start/stop

**Tasks:**
1. `/start-interview` calls Agora ConvoAI `POST /join` for real
   - `agent_rtc_uid: "0"` (string)
   - `remote_rtc_uids: ["*"]` if no avatar, `["101"]` if avatar enabled
   - `advanced_features.enable_rtm: true`
   - `parameters.data_channel: "rtm"`
   - `pipeline_id` from env
   - `llm.url` = tunnel URL + `/chat/completions`
   - `llm.vendor: "custom"`
   - Agent name = `personaprep_{uuid[:8]}` (unique per call, prevents 409)
   - If `PP_AVATAR_VENDOR` set: include `properties.avatar` block + video token for `PP_AGENT_VIDEO_UID`
2. Store `agent_id` from `/join` response in session store
3. `/stop-interview` calls `POST /agents/{agent_id}/leave`
4. Stub `/chat/completions` — just forwards to OpenAI with no persona injection yet (plain proxy)
5. `/chat/completions` must be reachable via tunnel — verify with a curl from a phone's browser
6. Return `agent_video_uid` in response (null if no avatar)

**Does not need:** persona injection in LLM proxy, feedback

### FE: Agora RTC + RTM wiring

**Tasks:**
1. Install Agora packages: `agora-rtc-sdk-ng agora-rtc-react agora-rtm agora-agent-client-toolkit agora-agent-client-toolkit-react @agora/agent-ui-kit`
2. `VoiceSession.tsx` — core Agora initialization:
   - Read session data from `sessionStorage` (including `agent_video_uid`)
   - Create `rtcClient` and `rtmClient` at module level (outside component)
   - `useEffect` for init sequence: RTM login → RTM subscribe → RTC join → publish mic
   - `AgoraRTCProvider` + `ConversationalAIProvider` provider stack
   - `useTranscript()` — render raw transcript array (even if empty/ugly)
   - `useAgentState()` — render raw state string
3. If `agent_video_uid` is non-null: render `<AvatarPanel agentVideoUid={agentVideoUid} />` using `useRemoteUsers()` + `AvatarVideoDisplay`
4. `InterviewPage.tsx` renders `<VoiceSession />` with End button
5. End button calls `POST /stop-interview`, then `rtcClient.leave()`, then navigates to `/feedback`

**Does not need:** persona-conditioned responses, feedback page data (still mock)

### Gate: Phase 2 → Phase 3

**BE must demo (with FE in the room):**
- [ ] `POST /start-interview` returns valid tokens + channel
- [ ] Agora Console shows the agent is RUNNING in the channel
- [ ] BE can call `POST /stop-interview` and agent disappears from console

**FE must demo (with BE running):**
- [ ] Open `/interview` — mic permissions requested, RTC joined
- [ ] Agent audio plays through speakers (even if responses are generic/not persona-conditioned)
- [ ] `useAgentState()` shows state changes: idle → listening → thinking → speaking
- [ ] `useTranscript()` shows at least the agent's turns appearing in the array (even unstyled)
- [ ] If avatar enabled: avatar video renders in the panel (or "Avatar connecting..." while joining)
- [ ] Clicking End navigates to `/feedback` page (still with mock data)

**Joint check:**
- [ ] Latency feels acceptable — agent responds within ~2 seconds of user finishing speech
- [ ] No audio echo / feedback loop (mute test)
- [ ] If avatar enabled: confirm `agent_video_uid` in session matches `PP_AGENT_VIDEO_UID` in BE `.env`

---

## Phase 3 — Persona Injection + Live Transcript UI (Parallel)

Goal: the interviewer actually behaves like the chosen persona, and the transcript looks good.

### BE: Full LLM proxy with persona injection

**Tasks:**
1. `llm_proxy.py` — full persona injection on every turn:
   - Extract `channel` from `body.params.channel`
   - Look up `session = session_store[channel]`
   - Build `context_block` from session state (question_count, questions_asked, role, difficulty)
   - Prepend persona system prompt + context block as the first system message
   - Forward to OpenAI with `stream=True` via `httpx`
   - Return `StreamingResponse` — forward SSE chunks directly
2. Append completed agent turn to `session.transcript` after stream finishes
3. Increment `session.question_count`, track question in `session.questions_asked`
4. Add `GET /session/{channel}` debug endpoint — returns full session state (useful for FE debugging)

**Does not need:** feedback endpoint

### FE: Transcript UI + agent state indicator

**Tasks:**
1. Style `useTranscript()` output:
   - Agent turns vs user turns visually distinct (different alignment or color)
   - Auto-scroll to latest turn
   - Transcript replaces on every update (do not `.concat()` — toolkit sends full history each time)
2. Style `useAgentState()` as a visual indicator:
   - listening: mic icon pulse
   - thinking: dots animation
   - speaking: waveform or speaker icon
3. Add persona badge in the UI header ("Skeptical Technical Interviewer — AI Training Persona")
4. Add session timer (count up from 0)
5. Add safety disclaimer banner (one line, dismissible): "This is an AI-generated training persona, not a real person."

**Does not need:** feedback page (still mock), public persona builder

### Gate: Phase 3 → Phase 4

**BE must demo:**
- [ ] Run a 3-turn exchange — check logs: persona system prompt appears at the top of every LLM call
- [ ] Switch personas between two sessions — verify different system prompts used
- [ ] `GET /session/{channel}` shows transcript growing with each turn
- [ ] Skeptical Technical persona visibly pushes back on a vague answer
- [ ] Friendly Recruiter gives noticeably warmer, softer responses

**FE must demo:**
- [ ] Transcript renders with clear visual distinction between agent and user turns
- [ ] Transcript auto-scrolls as new turns arrive
- [ ] Agent state indicator changes in real time during a conversation
- [ ] Persona badge correct for the selected persona
- [ ] Timer running
- [ ] Disclaimer visible

**Joint check:**
- [ ] Persona conditioning is visible to a neutral observer — "I can tell this is the skeptical one"

---

## Phase 4 — Feedback (Parallel)

Goal: after ending a session, user sees a real scored breakdown.

### BE: Feedback endpoint

**Tasks:**
1. `feedback.py` — `generate_feedback(session: SessionState) -> FeedbackResponse`
   - Format transcript as `[Interviewer] ... \n[Candidate] ...`
   - Build rubric prompt (see technical-details.md for full prompt)
   - Call `gpt-4o` (not mini — quality matters here)
   - Parse JSON from response (`response_format: { type: "json_object" }`)
   - Return `FeedbackResponse` matching the agreed type
2. `GET /feedback?channel={channel}` wires up `generate_feedback`
3. Error case: if session not found or transcript empty → return 404

**Does not need:** public persona builder

### FE: Real feedback page

**Tasks:**
1. `FeedbackPage.tsx` — on mount, call `GET /feedback?channel={channel}` (channel from `useSearchParams()`)
2. Show loading state while waiting
3. Replace mock `FeedbackReport` with real data:
   - Animated score ring (overall score)
   - 4 rubric bars with labels and values
   - Strengths list with check icons
   - Weaknesses list with quoted transcript lines
   - Improved answer accordion (question → suggestion)
   - Full transcript collapsible section
4. "Practice Again" button → navigates back to `/setup`

### Gate: Phase 4 → Phase 5

**BE must demo:**
- [ ] `GET /feedback?channel={channel}` (after a real session) returns valid JSON matching `FeedbackResponse` type
- [ ] Rubric scores are not all the same number (sanity check on prompt quality)
- [ ] Weaknesses section contains actual quotes from the transcript, not boilerplate
- [ ] 404 returned for unknown channel

**FE must demo:**
- [ ] Loading spinner shows while feedback is fetching
- [ ] All sections render with real data
- [ ] Improved answer accordion opens/closes
- [ ] Full transcript expandable
- [ ] "Practice Again" navigates back to setup

**Joint full end-to-end test:**
- [ ] Setup → start interview → conduct 4-question exchange → end → feedback page loads with real scores
- [ ] Run the flow twice with different personas — feedback content visibly differs

---

## Phase 5 — Demo Polish (Both Together)

No new features. Fix what's rough, rehearse the demo.

### BE tasks
- [ ] Add request logging (persona_id + role + timestamp per session start)
- [ ] Handle Agora 409 collision gracefully (retry with new agent name)
- [ ] Verify tunnel is stable — restart cloudflared if URL changed, update env var

### FE tasks
- [ ] Review setup page layout on 13" laptop screen (judge's machine)
- [ ] Ensure no layout breaks at 1280×800
- [ ] Add error state to interview page: if `/start-interview` fails, show message + back button
- [ ] Smooth transition animations between pages (optional but looks polished)

### Demo rehearsal (together)
- [ ] Run the full demo script from `plans/demo.md` start to finish
- [ ] Time it — should land under 90 seconds
- [ ] Record a screen capture as fallback (in case of demo issues on the day)
- [ ] Test on the actual device / network that will be used at the hackathon

### Final gate — ship criteria
- [ ] End-to-end flow works twice in a row without intervention
- [ ] Feedback cites actual transcript lines
- [ ] Persona conditioning is demonstrable (skeptical vs friendly is clearly different)
- [ ] Safety disclaimer visible in the interview UI
- [ ] Fallback recording ready

---

## Phase 6 — Custom Persona (Gary Tan demo) (Parallel)

The wow moment. Build a digital twin of a real person from their public content.  
Full details: see **`plans/custom-persona.md`**.

### BE tasks

**Platform collectors** (`backend/collectors/`):
1. `youtube.py` — `YouTubeCollector`: transcript extraction (`youtube-transcript-api`), audio download (`yt-dlp` + `ffmpeg`), metadata extraction. Handles `/watch?v=`, `youtu.be/`, `/@channel`, `/playlist`. Caps at 5 videos per build.
2. `web.py` — `WebCollector`: `httpx` + `BeautifulSoup`, extracts `<article>` → `<main>` → `<p>` tags, caps at 15k chars
3. `wikipedia.py` — `WikipediaCollector`: `wikipedia` package, extracts summary + content + first photo URL. Also used as auto-supplement when content is thin (<500 chars).
4. `text.py` — `TextCollector`: passthrough for user-pasted tweets, LinkedIn bio, etc.
5. `__init__.py` — `dispatch_collect()`: auto-dispatches URLs to the correct collector based on domain matching

**Core pipeline:**
6. `persona_synthesizer.py` — GPT-4o prompt → `PersonaProfile` JSON including `system_prompt`, `greeting_script`, `characteristic_phrases`, `core_beliefs`
7. `voice_cloner.py` — `resolve_voice()`: clones from YouTube audio if available, otherwise gender-detects from name (`gender-guesser` package) → picks default ElevenLabs voice (Adam/Rachel)
8. `avatar_builder.py` — `resolve_avatar()`: user photo → HeyGen Instant Avatar. If no photo → Wikipedia image lookup. If nothing → voice-only mode (graceful degradation)
9. `persona_builder.py` — orchestrates: collect → build `knowledge_chunks` → synthesize → resolve voice → resolve avatar → write `custom_personas/{id}.json`
10. `persona_tools.py` — `PERSONA_TOOLS` OpenAI tool definitions + `execute_persona_tool()` for `search_persona_knowledge` and `get_persona_background` (keyword search over `knowledge_chunks`)

**Server changes:**
11. New endpoints: `POST /personas/build`, `GET /personas/build/{job_id}`, `GET /personas`, `DELETE /personas/{persona_id}`
12. Modify `llm_proxy.py`: inject `PERSONA_TOOLS` into OpenAI requests for custom personas, execute tool calls server-side (up to 5 passes per turn, following Agora's `server-custom-llm` pattern)
13. Modify `personas.py`: `load_persona()` checks `custom_personas/` first, falls back to built-in 4
14. Modify `server.py`: `build_join_payload()` reads `tts_voice_id` / `avatar_id` from persona JSON; fire `/speak` greeting 3s after `/join`
15. New env vars: `PP_ELEVENLABS_API_KEY`, `PP_HEYGEN_API_KEY`
16. New pip deps: `yt-dlp elevenlabs gender-guesser wikipedia beautifulsoup4` + host needs `ffmpeg`

**Does not need:** UI changes to feedback page

### FE tasks

1. Add "Custom" card to the persona grid in `SetupPage.tsx` — dashed border, + icon, styled distinctly
2. Selecting it expands a build panel (not a modal) inline below the grid with:
   - Name field (required)
   - YouTube URLs: multi-entry (add/remove rows)
   - Web page URLs: multi-entry
   - Paste text: large textarea for tweets, LinkedIn bio, anything (labeled honestly: "Paste tweets, LinkedIn bio, or any other text")
   - Photo URL: single field, labeled "(for avatar — leave blank for voice-only)"
   - No "clone voice" checkbox — happens automatically if YouTube URLs present
3. "Build Persona" → `POST /personas/build` → poll `GET /personas/build/{job_id}` every 2s
4. Inline progress labels: "Fetching transcripts..." → "Synthesizing..." → "Cloning voice..." → "Building avatar..." → "✓ Ready"
5. On completion: custom card appears in the grid with name + capability badges (✓ voice cloned, ✓ avatar, or "voice-only")
6. `src/types/api.ts`: add `PersonaBuildRequest`, `PersonaBuildStatus`, `PersonaListItem` types
7. On page load: `GET /personas` → populate the persona grid dynamically
   - Built-in 4 appear first; custom personas after; "Custom" add card always last
   - Fall back to hardcoded PERSONAS array if `/personas` endpoint fails (demo mode)

### Gate: Phase 6

**BE must demo:**
- [ ] `POST /personas/build` with 1 YouTube URL returns `job_id`
- [ ] `GET /personas/build/{job_id}` reaches `status: "done"` within 5 min
- [ ] The resulting `custom_personas/{id}.json` has: `system_prompt`, `knowledge_chunks`, `tts_voice_id`, and optionally `avatar_id`
- [ ] `search_persona_knowledge` tool works: keyword search returns relevant chunks from the persona's collected content
- [ ] If no YouTube URL → voice falls back to gender-detected ElevenLabs default (Adam/Rachel)
- [ ] If no photo URL → avatar falls back to Wikipedia image, or voice-only mode
- [ ] Avatar is visibly cartoonish/stylized — never photorealistic (verify by visual inspection)
- [ ] `POST /start-interview` with the custom `persona_id` starts a session with per-persona TTS + avatar (if available)
- [ ] During interview: agent references real content via tool calls (visible in proxy logs)
- [ ] `/speak` fires custom greeting after session start

**FE must demo:**
- [ ] Custom card in persona grid renders correctly (dashed border, + icon)
- [ ] Build panel expands inline with correct fields (no Twitter/LinkedIn URL fields — only paste text)
- [ ] Progress labels update in real time during build
- [ ] Custom persona card appears in grid after build completes, with capability badges
- [ ] `GET /personas` drives the grid; falls back to hardcoded array in demo mode

**Joint:**
- [ ] Full end-to-end: enter Gary Tan's YouTube URL → build → interview → hear his voice + see his avatar
- [ ] Agent uses `search_persona_knowledge` tool to reference Gary Tan's real YC advice during conversation
- [ ] Build with only a name (no URLs) → system auto-pulls Wikipedia → synthesizes a basic persona with gender-default voice, no avatar
- [ ] Legal disclaimer shown: "Stylized AI training persona. Simulated from public content. Not a real likeness. Not affiliated with {name}."
- [ ] Avatar on screen is clearly an illustration, not a real face

---

## Dependency Map

```
Phase 0 (contract)
    │
    ├── BE Phase 1 (server skeleton + tokens)
    │       │
    │       └── BE Phase 2 (real Agora start/stop + stub proxy) ─────────────────┐
    │                                                                              │
    └── FE Phase 1 (scaffold + setup page + mock pages)                           │
            │                                                                     │
            └── FE Phase 2 (Agora RTC + RTM wiring) ─── needs BE Phase 2 ready ──┘
                    │
                    ├── BE Phase 3 (persona injection in proxy)
                    │       │
                    └── FE Phase 3 (transcript UI + state indicator)
                            │
                            ├── BE Phase 4 (feedback endpoint) ─────────────────┐
                            │                                                    │
                            └── FE Phase 4 (real feedback page) ── needs BE P4 ─┘
                                    │
                                    └── Phase 5 (polish + demo)
                                            │
                                            └── Phase 6 (custom persona — Gary Tan)
                                                  ├── BE: data pipeline + /personas endpoints
                                                  └── FE: build panel + dynamic grid
```

**Critical path:** Phase 0 → BE Phase 2 → FE Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

If BE Phase 2 is blocked (Agora credentials issue, tunnel problem), FE can keep building Phase 3 UI against mock data and merge later.

---

## Handoff Checklist (BE → FE, after Phase 2 gate)

At the Phase 2 gate, BE hands FE:
- [ ] Running backend URL: `http://localhost:8200`
- [ ] Valid `.env` values for FE's `VITE_API_URL`, `VITE_APP_ID`
- [ ] Confirmation that `/start-interview` returns valid Agora tokens
- [ ] Confirmation that the LLM proxy is reachable from Agora's cloud (tunnel working)
- [ ] Sample `StartInterviewResponse` JSON that FE can use for integration testing
