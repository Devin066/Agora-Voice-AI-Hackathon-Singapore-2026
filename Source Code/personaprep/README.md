# PersonaPrep

Real-time voice AI mock interview simulator. Practice with distinct interviewer personas, get scored feedback on your performance.

Built with **Agora ConvoAI** for real-time voice, **React** for the frontend, and **FastAPI** for the backend. Uses any OpenAI-compatible LLM (defaults to Google Gemini free tier).

## How It Works

```
Browser (React + Agora RTC/RTM)
    │
    ├── POST /start-interview ──▶ Backend (FastAPI :8200)
    │                                  │
    │                                  ├── POST /join ──▶ Agora ConvoAI REST API
    │                                  │                       │
    │   ◀── RTC audio channel ─────────┼───────────────────────┘
    │                                  │
    │                                  ◀── /chat/completions ── Agora (each turn)
    │                                  │       │
    │                                  │       ├── Inject persona prompt + session context
    │                                  │       ├── Forward to LLM (Gemini/OpenAI/Groq/etc.)
    │                                  │       └── Capture transcript
    │                                  │
    ├── GET /feedback?channel=X ──▶    └── Score transcript against rubric via LLM
    │
    └── Render scored feedback report
```

1. User picks an interviewer persona, role, interview type, and difficulty
2. Backend starts an Agora ConvoAI agent with a persona-specific system prompt
3. User talks to the AI interviewer in real-time via Agora RTC voice
4. Agora routes each LLM turn through the backend's `/chat/completions` proxy, which injects persona context and captures the transcript
5. After the session, the backend sends the full transcript to the LLM for rubric-scored feedback (clarity, specificity, technical depth, confidence)
6. Frontend renders the feedback report with scores, strengths, weaknesses, and improved answer suggestions

## Interviewer Personas

### 4 Built-in Archetypes

| Persona | Style | Focus |
|---------|-------|-------|
| **Skeptical Technical** | Direct, skeptical, pushes for depth | System design, tradeoffs, ownership |
| **Friendly Recruiter** | Warm, conversational, supportive | Motivation, culture fit, career goals |
| **Startup Founder** | Fast-paced, execution-focused | Ownership, speed, impact |
| **Senior Hiring Manager** | Structured, evaluative | Judgment, teamwork, communication |

### Custom Personas

Build a persona modeled on any public figure. Provide YouTube links, blog URLs, or paste text — the system scrapes their content and synthesizes an interviewer that talks like them.

**What happens when you build a custom persona:**

1. **Content collection** — YouTube transcripts pulled automatically, web pages scraped, user-pasted text (tweets, LinkedIn bios) accepted directly
2. **Persona synthesis** — LLM analyzes the collected content and extracts speech patterns, vocabulary, opinions, and interview style into a system prompt
3. **Voice cloning** — YouTube audio fed to ElevenLabs voice clone API. If no audio available, a gender-detected default voice is used
4. **Stylized avatar** — Photo (user-provided or auto-fetched from Wikipedia) sent to Anam with anime/comic-book stylization. Never photorealistic — safety requirement. Falls back to voice-only if no photo
5. **Runtime knowledge tools** — Scraped content is indexed and exposed as LLM tools so the agent can reference things the person actually said mid-conversation, not just parrot a static prompt

**Build-time vs runtime:** The backend only calls ElevenLabs and Anam directly during the one-time persona build to create voice/avatar IDs. At runtime, Agora natively proxies both services — the cloned voice ID goes into `tts.vendor: "elevenlabs"` and the avatar ID into `avatar.vendor: "anam"` in the ConvoAI `/join` payload. No direct API calls to either service during live sessions.

**Intelligent defaults:** Missing YouTube audio? Gender-detected default voice. No photo? Wikipedia image lookup, then voice-only fallback. Thin content? Auto-supplemented with Wikipedia. Custom greeting generated during synthesis, with a template fallback.

**Safety:** All custom persona avatars are visibly stylized (anime/comic-book) via Anam's native style parameter. No photorealistic deepfakes. Personas are labeled as AI-generated throughout the UI.

## Project Structure

```
personaprep/
├── backend/
│   ├── server.py            # FastAPI app, endpoints, Agora ConvoAI orchestration
│   ├── llm_proxy.py         # /chat/completions — persona injection + LLM streaming proxy
│   ├── feedback.py          # Post-session rubric scoring
│   ├── personas.py          # 4 PersonaCard definitions + system prompt rendering
│   ├── session_store.py     # In-memory session state (channel → transcript)
│   ├── tokens.py            # Agora RTC/RTM/ConvoAI token generation (AccessToken2)
│   ├── agora_tokens/        # Vendored Agora AccessToken2 source (007 format)
│   ├── requirements.txt
│   └── tests/               # pytest suite (tokens, personas, sessions, proxy, feedback, server)
│
└── frontend/
    ├── src/
    │   ├── main.tsx          # React Router: /setup → /interview → /feedback
    │   ├── config.ts         # API_URL (defaults to localhost:8200)
    │   ├── types/api.ts      # TypeScript interfaces for API request/response
    │   ├── pages/
    │   │   ├── SetupPage.tsx      # Persona + role + difficulty selection
    │   │   ├── InterviewPage.tsx  # Live voice session with timer
    │   │   └── FeedbackPage.tsx   # Scored feedback report
    │   └── components/
    │       ├── VoiceSession.tsx    # Agora RTC/RTM lifecycle, transcript display
    │       └── FeedbackReport.tsx  # Score ring, rubric bars, strengths/weaknesses
    ├── package.json
    └── vite.config.ts
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- An [Agora Console](https://console.agora.io) account (App ID + Certificate)
- A [Google AI Studio](https://aistudio.google.com/apikey) API key (free tier works)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) for tunneling

### 1. Backend

```bash
cd "Source Code/personaprep/backend"

python -m venv .venv
source .venv/bin/activate  # macOS/Linux
# .venv\Scripts\activate   # Windows

pip install -r requirements.txt -r requirements-dev.txt
```

Create a `.env` file (see `.env.example`):

```
PP_APP_ID=<your agora app id>
PP_APP_CERTIFICATE=<your agora certificate>
PP_PIPELINE_ID=<your pipeline id>
PP_LLM_API_KEY=<your google/openai/groq api key>
PP_TUNNEL_URL=<cloudflared url — set after step 2>
```

Start the tunnel (separate terminal):

```bash
cloudflared tunnel --url http://localhost:8200
# Copy the printed https://...trycloudflare.com URL into PP_TUNNEL_URL
```

Run the server:

```bash
uvicorn server:app --port 8200 --reload
```

### 2. Frontend

```bash
cd "Source Code/personaprep/frontend"
npm install
npm run dev
```

Open http://localhost:5173

### 3. Local Dev Without Agora Credentials

Set `PP_STUB_AGORA=1` in `.env` to skip real Agora calls. The backend returns stub tokens, and the frontend falls into demo/stub mode. You can seed a sample transcript via the debug endpoint to test the full feedback flow:

```bash
# Start a session from the UI, then:
curl -X POST "http://localhost:8200/debug/seed-transcript?channel=<channel>"
# Click "End Interview" → feedback page renders real LLM-scored results
```

## LLM Provider

Defaults to **Google Gemini** (`gemini-2.0-flash` for interview, `gemini-2.5-flash` for feedback). Any OpenAI-compatible endpoint works — override via environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `PP_LLM_BASE_URL` | Gemini OpenAI-compat endpoint | Chat completions base URL |
| `PP_LLM_API_KEY` | — | API key for the LLM provider |
| `PP_LLM_MODEL` | `gemini-2.0-flash` | Model used during interview turns |
| `PP_FEEDBACK_MODEL` | `gemini-2.5-flash` | Model used for feedback scoring |

## Tech Stack

- **Voice**: Agora RTC SDK, Agora RTM, Agora Conversational AI Engine
- **Voice cloning**: ElevenLabs (build-time clone, Agora-proxied at runtime)
- **Avatar**: Anam (stylized anime/comic-book, Agora-proxied at runtime)
- **Frontend**: React 19, React Router, Vite, TypeScript, agora-rtc-react, agora-agent-client-toolkit-react
- **Backend**: FastAPI, httpx (async streaming), Pydantic
- **LLM**: Any OpenAI-compatible provider (Gemini, OpenAI, Groq, Ollama)
- **Content scraping**: youtube-transcript-api, yt-dlp, BeautifulSoup, Wikipedia API
- **Tunnel**: cloudflared (Agora cloud → local backend)

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness check |
| `GET` | `/personas` | List available interviewer personas |
| `POST` | `/start-interview` | Create session, start Agora agent, return tokens |
| `POST` | `/stop-interview?channel=X` | Stop the Agora agent |
| `GET` | `/feedback?channel=X` | Generate rubric-scored feedback |
| `POST` | `/chat/completions` | LLM proxy (called by Agora, not directly) |
| `GET` | `/session/{channel}` | Debug: dump session state |
| `POST` | `/debug/seed-transcript?channel=X` | Stub mode only: inject sample transcript |

## Testing

```bash
cd "Source Code/personaprep/backend"
python -m pytest tests/ -v
```
