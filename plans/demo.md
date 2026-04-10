# PersonaPrep — Demo Flow

## Target Runtime: 90 seconds

---

## Setup (15s)

> "I'm prepping for an AI engineer interview. I'll pick the Skeptical Technical Interviewer — the one that pushes for specifics and won't let vague answers slide."

**Actions:**
- Role: AI Engineer
- Interview Type: Technical
- Persona: Skeptical Technical Interviewer
- Difficulty: Hard
- Click **Start Interview**

---

## Live Session (60s)

**Interviewer greets:**
> "Let's get started. Tell me about a distributed system you've designed end-to-end."

**User answers** (30–40 seconds — describes a data pipeline or similar)

**Interviewer follows up:**
> "Be specific — what was the actual bottleneck and how did you measure it?"

**User answers** (15 seconds)

**Interviewer probes:**
> "What tradeoff did you make between consistency and latency, and why that choice?"

**User answers** (15 seconds)

**Click: End Interview**

---

## Feedback Dashboard (30s)

> "Here's my breakdown. 7.6 overall. I was strong on clarity and ownership, but my tradeoff answer was surface-level. It shows me a better version of that specific answer, pulled from the transcript."

**Show:**
- Overall score ring: 7.6 / 10
- Rubric bars: Clarity 8.2, Specificity 6.9, Technical Depth 7.4, Confidence 7.8
- Weakest moment: quoted line from transcript with annotation
- Suggested stronger answer for the tradeoff question
- "Practice Again" button

---

## Key Takeaways for Judges

1. **Real-time voice** — not text-only, not turn-taking chat
2. **Persona-conditioned** — follow-up questions were driven by the candidate's actual answer, not a generic script
3. **Adaptive** — the interviewer pushed harder because the answer was vague
4. **Useful output** — feedback cites exact transcript moments, not boilerplate
5. **Safe by design** — "AI-generated training persona" shown throughout, no identity claims

---

## Fallback Plan

If the live demo connection drops:

- Have a pre-recorded screen capture of the full flow ready
- Keep a local transcript JSON that can be fed directly to the feedback endpoint
- The feedback dashboard can be demo'd independently with mock data

---

## One-Line Pitch

> "PersonaPrep lets you rehearse high-stakes interviews through live voice conversations with AI interviewer personas, then gives you actionable feedback on what to improve — before the real thing."
