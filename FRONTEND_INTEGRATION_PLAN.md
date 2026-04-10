# PersonaPrep — Frontend ↔ Backend Integration Plan

> **Status: COMPLETE.** Backend 121/121 tests passing (116 unit + 5 new integration). Frontend builds cleanly. Manual E2E verified in stub mode against live servers.


## Overview

The frontend (React + Vite + TypeScript) and backend (FastAPI) are now in the repo. The frontend is ~90% wired: Agora SDKs are installed, routes exist, types are defined, SetupPage already calls `POST /start-interview`, InterviewPage already calls `POST /stop-interview`. The remaining work is to:

1. Close a small contract mismatch (`agent_video_uid`)
2. Wire FeedbackPage to the real `GET /feedback` endpoint (currently hardcoded mock)
3. Add an integration test suite that walks the full flow against the FastAPI app
4. Document the local dev runbook

The backend already supports `PP_STUB_AGORA=1` for local dev without real Agora credentials, so full end-to-end testing in the browser works today.

---

## Current State

### Frontend

| Area | Status | Notes |
|------|--------|-------|
| Vite + React 19 + TS scaffold | ✅ | Port 5173, strict mode |
| Routing (`/setup`, `/interview`, `/feedback`) | ✅ | React Router v7 |
| `types/api.ts` | ⚠️ | Mostly matches backend, but includes `agent_video_uid` which backend does not return |
| `config.ts` — `API_URL` | ✅ | Defaults to `http://localhost:8200`, reads `VITE_API_URL` |
| SetupPage → `POST /start-interview` | ✅ | With mock fallback on error |
| InterviewPage → `POST /stop-interview` | ✅ | Fire-and-forget on error |
| VoiceSession (Agora wiring) | ✅ | AgoraRTCProvider + ConversationalAIProvider + useTranscript/useAgentState |
| FeedbackPage → `GET /feedback` | ❌ | **Hardcoded `MOCK_FEEDBACK` constant — needs to call backend** |
| `GET /personas` fetch | ❌ (optional) | `SetupPage` uses a hardcoded `PERSONAS` array with style metadata; backend `/personas` returns id/name/description/tone_tags. Hardcoding is acceptable because the frontend needs visual styling (colors, accents) the backend can't provide |
| `.env.example` | ❌ | Not present |

### Backend

| Area | Status | Notes |
|------|--------|-------|
| All 7 endpoints wired | ✅ | 116/116 tests passing |
| `PP_STUB_AGORA=1` | ✅ | Bypasses real Agora calls for local dev |
| Pydantic `FeedbackResponse` model | ✅ | Enforces the TS contract at the API boundary |
| `StartInterviewResponse` | ⚠️ | Missing `agent_video_uid` field that frontend type expects |

---

## Contract Gap Analysis

### Mismatch 1 — `StartInterviewResponse.agent_video_uid`

**Frontend type** (`types/api.ts:15`):
```ts
agent_video_uid: string | null  // "200" if avatar enabled, null otherwise
```

**Backend model** (`server.py`):
```python
class StartInterviewResponse(BaseModel):
    channel: str
    appid: str
    rtc_token: str
    rtm_token: str
    agent_uid: str
    user_uid: str
    # agent_video_uid missing
```

**Fix:** Add `agent_video_uid: str | None = None` to the backend model. The avatar feature is a stretch goal; returning `null` keeps the contract consistent and lets the frontend `AvatarPanel` component conditionally render.

### Mismatch 2 — `FeedbackPage` does not call backend

`FeedbackPage.tsx:99` renders `MOCK_FEEDBACK` directly. It needs to:
1. Read `channel` from the URL query string (the navigation uses `/feedback?channel=X`)
2. Read the `isMock` flag from `sessionStorage` (same pattern `InterviewPage` uses)
3. If `isMock`, keep showing `MOCK_FEEDBACK` (demo mode without a backend)
4. Otherwise, fetch `GET /feedback?channel=X`, render loading/error states, display real `FeedbackResponse`

### No other contract mismatches

`FeedbackResponse` shape (backend) matches `FeedbackResponse` TypeScript interface exactly. `/personas` response shape matches `PersonaInfo` exactly.

---

## Changes

### Backend

| File | Change |
|------|--------|
| `server.py` | Add `agent_video_uid: str \| None = None` to `StartInterviewResponse`, return `None` from `/start-interview` handler |
| `tests/test_server.py` | Update `test_start_interview_returns_correct_shape` to assert `agent_video_uid` is present |
| `tests/test_integration.py` (NEW) | Full-flow integration tests with `PP_STUB_AGORA=1`, using `TestClient`, mocking only `generate_feedback`. Walks `/personas` → `/start-interview` → `/session/{channel}` → `/stop-interview` → `/feedback`. Asserts response shapes match the frontend types field-for-field. |

### Frontend

| File | Change |
|------|--------|
| `src/pages/FeedbackPage.tsx` | Replace `MOCK_FEEDBACK` direct render with: read channel from URL, read isMock from sessionStorage, useEffect to fetch `GET /feedback?channel=X`, loading state, error state, demo-mode branch that still shows MOCK_FEEDBACK |
| `.env.example` (NEW) | Document `VITE_API_URL` |

### No changes needed

- SetupPage: already calls backend correctly, mock fallback is fine
- InterviewPage: already calls backend correctly
- VoiceSession: Agora wiring is complete; it will just work once real tokens flow through
- types/api.ts: correct except for `agent_video_uid` (which we're adding to backend, not removing from frontend)

---

## Integration Test Strategy

### Automated (backend-side, added in this integration pass)

**`backend/tests/test_integration.py`** — Full-flow tests against the live FastAPI app in `PP_STUB_AGORA=1` mode. Uses `fastapi.testclient.TestClient` (sync) or `httpx.AsyncClient + ASGITransport` (async, matches existing pattern).

Coverage:

1. **`test_full_flow_contract`** — Walk the entire flow:
   - `GET /health` → 200
   - `GET /personas` → 4 personas with `{id, name, description, tone_tags}`
   - `POST /start-interview` → returns `{channel, appid, rtc_token, rtm_token, agent_uid, user_uid, agent_video_uid}` — **exact key set** matching frontend `StartInterviewResponse`
   - `GET /session/{channel}` → returns SessionState
   - Manually seed the session transcript (simulating what would happen after a real voice call)
   - `POST /stop-interview?channel=X` → `{ok: true}`
   - `GET /feedback?channel=X` (with `generate_feedback` monkey-patched to return a fixture) → returns exact `FeedbackResponse` shape

2. **`test_frontend_types_match_backend`** — Lift the frontend type definitions into the test as Python dicts and assert the backend response keys are a superset. This locks the contract against drift.

3. **`test_stub_mode_end_to_end`** — Verify `PP_STUB_AGORA=1` allows the full flow to complete without any real network calls (useful for frontend devs without Agora credentials).

### Manual (both sides, documented in runbook)

Steps written up in the plan + README:

1. `cd backend && PP_STUB_AGORA=1 uvicorn server:app --port 8200 --reload`
2. `cd frontend && npm install && npm run dev`
3. Browse `http://localhost:5173`:
   - Setup page shows all 4 personas, select one, click Start
   - Interview page loads — since stub mode returns fake tokens, VoiceSession should detect `isMock` and render the demo UI (already wired)
   - Click End Interview
   - Feedback page loads; in stub mode the backend will fail to generate real feedback (no transcript), so we seed it via the session debug endpoint OR the frontend should fall back to MOCK_FEEDBACK when `isMock`

4. Verify network tab shows:
   - `POST http://localhost:8200/start-interview` → 200
   - `POST http://localhost:8200/stop-interview?channel=...` → 200
   - `GET http://localhost:8200/feedback?channel=...` → 200 (or expected 404 in stub mode if no transcript)

### Not automated this pass

- Playwright or Cypress E2E — too much setup for the hackathon. Manual walkthrough covers it.
- Testing the Agora voice pipeline itself — requires real credentials + a live audio device.
- Frontend unit tests — out of scope. Type checking + eslint are the only frontend-side safety nets.

---

## Runbook

### Local dev, no credentials

```bash
# Terminal 1 — backend in stub mode
cd "Source Code/personaprep/backend"
source .venv/Scripts/activate
export PP_STUB_AGORA=1          # or: set PP_STUB_AGORA=1 on cmd
export PP_APP_ID=dummy
export PP_APP_CERTIFICATE=dummy
export PP_LLM_API_KEY=sk-fake
uvicorn server:app --port 8200 --reload

# Terminal 2 — frontend dev server
cd "Source Code/personaprep/frontend"
npm install   # first time only
npm run dev
# → http://localhost:5173
```

Then browse to `http://localhost:5173`, pick a persona, click Start Interview. In stub mode Agora calls are skipped so VoiceSession's demo-mode UI kicks in.

### Local dev, real credentials (demo rehearsal)

```bash
# Terminal 1 — cloudflared tunnel
cloudflared tunnel --url http://localhost:8200
# copy the https://...trycloudflare.com URL

# Terminal 2 — backend with real env
cd backend
cp .env.example .env
# edit .env: PP_APP_ID, PP_APP_CERTIFICATE, PP_PIPELINE_ID, PP_LLM_API_KEY, PP_TUNNEL_URL
unset PP_STUB_AGORA
uvicorn server:app --port 8200 --reload

# Terminal 3 — frontend
cd frontend
npm run dev
```

---

## Success Criteria

- [x] Backend integration tests pass (5 new in `test_integration.py`, plus existing 116 still green → 121/121)
- [x] Frontend FeedbackPage renders real backend data when not in mock mode (useEffect + fetch + loading/error states)
- [x] Frontend FeedbackPage still works in mock mode (MOCK_FEEDBACK kept as explicit demo fallback)
- [x] `agent_video_uid: null` added to backend `StartInterviewResponse` to match frontend type
- [x] Frontend `.env.example` created documenting `VITE_API_URL`
- [x] `npm run build` succeeds (type-check + Vite build, clean)
- [x] CORS preflight from `http://localhost:5173` confirmed working against live backend
- [x] Full curl-scripted clickthrough against running backend in stub mode: `/health`, `/personas`, `/start-interview`, `/session/{channel}`, `/stop-interview`, `/feedback` (404 path for empty transcript)
- [x] Runbook section above is sufficient for a teammate to cold-start

## Manual verification run (2026-04-10)

With `PP_STUB_AGORA=1`, backend on :8200, frontend on :5173:

| Check | Result |
|-------|--------|
| `GET /health` | `{"status":"ok"}` |
| `GET /personas` | 4 personas with `{id, name, description, tone_tags}` |
| `POST /start-interview` (with Origin: http://localhost:5173) | 200, exact 7-key contract, tokens start with `006`, `agent_video_uid: null`, `access-control-allow-origin: http://localhost:5173` in response headers |
| `GET /session/{channel}` | Correct stub session state, `agent_id` begins with `stub_agent_` |
| `POST /stop-interview?channel=X` | `{"ok":true}` |
| `GET /feedback?channel=X` (empty transcript) | 404 — expected behavior |
| `GET /feedback?channel=does-not-exist` | 404 — expected behavior |
| CORS preflight `OPTIONS /start-interview` | 200 with `access-control-allow-origin: http://localhost:5173`, `access-control-allow-methods`, `access-control-allow-headers: content-type`, `access-control-max-age: 600` |
| `http://localhost:5173/` | 200, Vite dev server serves index.html with React root |
| Frontend `npm run build` | Clean build, 0 TS errors, expected Agora SDK bundle size warning only |

All checks pass. The frontend and backend are ready for live Agora + OpenAI credential wiring.
