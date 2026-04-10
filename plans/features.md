# PersonaPrep — Features

## Personas (4 Prebuilt Archetypes)

### 1. Skeptical Technical Interviewer
- Blunt, pushes for depth, asks "why" repeatedly
- Challenges vague answers, tests tradeoffs
- Low warmth, high directness

### 2. Friendly Recruiter
- Warm and conversational
- Focuses on motivation and culture fit
- Softer pacing, behavioral questions

### 3. Startup Founder
- Fast-paced, execution-focused
- Low patience for fluff
- Asks about ownership, speed, and impact

### 4. Senior Hiring Manager
- Structured, evaluates impact and tradeoffs
- Probes teamwork, judgment, communication
- Professional tone, follows up on weak points

---

## Interview Modes

- **Behavioral** — STAR-format answers, motivation, teamwork, conflict
- **Technical** — system design, code tradeoffs, problem-solving
- **Recruiter Screen** — fit, compensation, timeline, motivation

## Role Targets

- SWE / AI Engineer
- Product Manager
- Startup Founder (investor pitch mode)

## Difficulty Levels

- Easy — slower pacing, fewer follow-ups
- Medium — standard interview pressure
- Hard — relentless follow-ups, interrupts when vague

---

## Day 1 — Core Loop

| # | Feature | Notes |
|---|---------|-------|
| 1 | Persona data | 4 hardcoded persona cards in `personas.py` |
| 2 | Backend server | FastAPI — `start-interview` returns RTC token + RTM token + channel; `stop-interview` calls `/agents/{id}/leave`; token gen via `buildTokenWithRtm` |
| 3 | Custom LLM proxy | `/chat/completions` that injects persona card + session state, forwards to OpenAI; set `LLM_VENDOR=custom` so Agora passes `turn_id` + `channel` |
| 4 | Session state store | In-memory dict keyed by channel; must store `agent_id` from Agora `/join` response |
| 5 | Setup page | Role / interview type / persona / difficulty selector |
| 6 | Live interview page | `agora-agent-client-toolkit-react`: `useTranscript()` for live transcript, `useAgentState()` for listening/thinking/speaking indicator; no SSR concerns with Vite |

## Day 2 — Feedback + Polish

| # | Feature | Notes |
|---|---------|-------|
| 7 | Feedback endpoint | One-shot LLM call over full transcript → rubric JSON |
| 8 | Feedback dashboard | Score ring, rubric bars, transcript, improved answer suggestions |
| 9 | Persona label + disclaimer | "AI-generated training persona" shown throughout session |
| 10 | End-to-end test | Full flow rehearsal, fix latency issues |
| 11 | Demo polish | Smooth transitions, consistent layout, demo data fallback |

## Stretch (if time allows)

| # | Feature |
|---|---------|
| S1 | Public-materials persona builder — paste URL, extract style, generate persona card |
| S2 | Resume upload — tailored questions based on candidate's background |
| S3 | Shareable feedback report card |

---

## Feedback Rubric

### Content
- Did the answer address the question?
- Was it specific with concrete examples?
- Did it show evidence of impact?

### Communication
- Clarity and structure
- Conciseness
- Confidence markers

### Interview Quality
- Follow-up handling
- Tradeoff articulation
- Ownership language

### Role Fit
- Technical depth (for SWE/AI roles)
- Behavioral maturity (for behavioral rounds)
- Relevance to target role

### Example Scored Output

```
Overall: 7.6 / 10

Clarity:         8.2
Specificity:     6.9
Technical Depth: 7.4
Confidence:      7.8
Role Fit:        7.5

Strengths:
- Clear opening framing
- Good ownership language
- Handled one challenge calmly

Weaknesses:
- Did not quantify impact
- Tradeoff discussion stayed surface-level
- One answer rambled under follow-up

Suggested improvement for "Tell me about a system you built end-to-end":
  Lead with the problem, your architecture decision, your specific contribution,
  and a measurable outcome. Keep it under 90 seconds.
```

---

## Safety Guardrails

- All personas labeled "AI-generated training persona" in the UI
- No voice cloning of real individuals
- No private individual simulation
- Disclaimer shown before every session:
  > "This is an AI-generated training persona based on professional archetypes. It is not a real person and should not be treated as an authentic representation."
- Public-materials mode (stretch): extracts communication style only, not biographical or personal data. Output explicitly labeled "inspired by public communication patterns."
