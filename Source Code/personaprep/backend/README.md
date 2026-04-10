# PersonaPrep Backend

FastAPI backend for the PersonaPrep voice AI interview prep app. Orchestrates Agora ConvoAI agents, injects interviewer personas into every LLM turn, and generates scored post-interview feedback.

## Architecture

```
Frontend (React) ──▶ Backend (FastAPI :8200) ──▶ Agora ConvoAI REST API
                            │                          │
                            │                          ▼
                            │                   Agora SD-RTN (voice channel)
                            │                          │
                            └◀── /chat/completions ────┘
                                 (custom LLM proxy)
```

On each turn:
1. Agora calls our `/chat/completions` with the conversation so far.
2. We strip Agora-specific params, inject the persona system prompt + session context, forward to the configured LLM provider with streaming.
3. Stream bytes back to Agora unchanged (low latency).
4. After stream completes, append the interviewer turn to the session transcript.
5. On `/feedback`, a one-shot call to the feedback model scores the full transcript against the rubric.

**LLM provider:** defaults to **Google Gemini** via its OpenAI-compatible endpoint so the free tier works out of the box. Override `PP_LLM_BASE_URL` and `PP_LLM_API_KEY` to switch providers (OpenAI, Groq, Together, local Ollama, etc.) — any OpenAI-compatible endpoint works without code changes.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness probe |
| GET | `/personas` | List 4 available interviewer personas |
| POST | `/start-interview` | Create session, start Agora agent, return RTC/RTM tokens |
| POST | `/stop-interview?channel=X` | Stop the Agora agent for a session |
| GET | `/feedback?channel=X` | Generate rubric-scored feedback from the session transcript |
| POST | `/chat/completions` | Agora calls this as the custom LLM — do not call directly |
| GET | `/session/{channel}` | Debug: dump current session state |
| GET | `/docs` | FastAPI auto-generated OpenAPI UI |

## Setup

### 1. Create venv and install deps

```bash
cd "Source Code/personaprep/backend"
python -m venv .venv
source .venv/Scripts/activate   # Git Bash on Windows
# or: .venv\Scripts\activate    # cmd/powershell
# or: source .venv/bin/activate # macOS/Linux

pip install -r requirements.txt -r requirements-dev.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in:
#   PP_APP_ID, PP_APP_CERTIFICATE  — from Agora Console (https://console.agora.io)
#   PP_PIPELINE_ID                  — pre-configured pipeline ID
#   PP_LLM_API_KEY                  — Google AI Studio API key (free tier: https://aistudio.google.com/apikey)
#                                     or any OpenAI-compatible provider key
#   PP_TUNNEL_URL                   — set after starting cloudflared (see below)
```

Full variable reference is in `.env.example`.

### Using a different LLM provider

The backend talks to any OpenAI-compatible chat completions endpoint. Override these two env vars:

| Provider | `PP_LLM_BASE_URL` | Notes |
|----------|-------------------|-------|
| Google Gemini (default) | `https://generativelanguage.googleapis.com/v1beta/openai` | Free tier: 15 RPM, 1M tokens/day |
| OpenAI | `https://api.openai.com/v1` | Paid |
| Groq | `https://api.groq.com/openai/v1` | Generous free tier, very fast |
| Ollama (local) | `http://localhost:11434/v1` | Fully local, no network |

Also set `PP_LLM_MODEL` and `PP_FEEDBACK_MODEL` to model names your chosen provider understands.

### 3. Start the tunnel

Agora's cloud must be able to reach our `/chat/completions`. Run cloudflared in a separate terminal:

```bash
cloudflared tunnel --url http://localhost:8200
# → https://<random-words>.trycloudflare.com
```

Copy the printed URL into `PP_TUNNEL_URL` in `.env`.

### 4. Run the server

```bash
uvicorn server:app --port 8200 --reload
```

Verify:
```bash
curl http://localhost:8200/health
curl http://localhost:8200/personas
```

OpenAPI docs: http://localhost:8200/docs

## Local development without real credentials

Set `PP_STUB_AGORA=1` in `.env` to bypass the real Agora `/join` and `/leave` calls. `/start-interview` will return a fake `agent_id` (prefixed `stub_agent_`) without hitting the network. Useful for Phase 1/2 gate checks, unit testing, and frontend dev when you don't have Agora credentials or a working tunnel.

**Do not enable this during a real demo** — the agent will not actually join the channel.

## Testing

```bash
python -m pytest tests/ -v
```

Tests cover `tokens`, `personas`, `session_store`, `llm_proxy`, `feedback`, and `server`.

Run a single file or test:
```bash
python -m pytest tests/test_feedback.py -v
python -m pytest tests/test_server.py::test_health -v
```

## Troubleshooting

### "PP_TUNNEL_URL is not set" warning at startup
You either forgot to set the env var or the `.env` file isn't being loaded. Make sure you're in the backend directory and `.env` exists.

### Agora agent never joins the channel
1. Is `cloudflared` still running? The tunnel URL changes every restart — update `PP_TUNNEL_URL` and restart uvicorn.
2. Does `curl https://your-tunnel.trycloudflare.com/health` from an external network return OK?
3. Check logs for `ConvoAI join failed` — the full error body is logged.

### Tunnel URL changed mid-demo
1. Stop cloudflared.
2. Restart: `cloudflared tunnel --url http://localhost:8200`.
3. Copy the new URL into `PP_TUNNEL_URL` in `.env`.
4. Restart uvicorn (the env is read at import time).
5. `POST /start-interview` again — the new tunnel URL will be baked into the Agora `/join` payload.

**Tip:** For demo stability, use a named tunnel with a fixed subdomain:
```bash
cloudflared tunnel login
cloudflared tunnel create personaprep
cloudflared tunnel route dns personaprep personaprep.yourdomain.com
cloudflared tunnel run --url http://localhost:8200 personaprep
```

### 409 errors from Agora
The backend automatically retries up to 3 times with a fresh agent name on 409. If you still see 409s after all retries, Agora's backend may have a stale agent under that project — check the Agora Console and manually leave any hanging agents.

### Frontend sees CORS errors
CORS is restricted to `http://localhost:5173` (Vite default). If your frontend runs on a different port, edit `allow_origins` in `server.py`.

### Feedback endpoint returns `{"detail": "No transcript to evaluate"}`
The session exists but has no turns yet. Run at least one conversation round before calling `/feedback`.

### LLM 401 or silent failures
Check `PP_LLM_API_KEY` is set. `llm_proxy.py` logs a warning at startup if it's empty. If you swapped providers, also confirm `PP_LLM_BASE_URL` matches (e.g., don't send a Gemini key to the OpenAI endpoint).

### Gemini rate limit (429)
Gemini free tier is 15 RPM. If you hit it during a long demo, upgrade to paid in Google AI Studio or swap to Groq for free higher limits (see "Using a different LLM provider" above).

## File structure

```
backend/
├── server.py            # FastAPI app + endpoints
├── llm_proxy.py         # /chat/completions — persona injection + OpenAI proxy
├── feedback.py          # Post-session rubric scoring via gpt-4o
├── personas.py          # 4 hardcoded PersonaCard dataclasses + prompt rendering
├── session_store.py     # In-memory session state (dict keyed by channel)
├── tokens.py            # Agora RTC / RTM / ConvoAI token generation
├── requirements.txt
├── requirements-dev.txt
├── .env.example
└── tests/
    ├── test_tokens.py
    ├── test_personas.py
    ├── test_session_store.py
    ├── test_llm_proxy.py
    ├── test_feedback.py
    └── test_server.py
```
