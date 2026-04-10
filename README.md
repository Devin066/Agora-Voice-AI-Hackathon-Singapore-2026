# Hotmic Homicide

Hotmic Homicide is a voice-driven detective game built for the Agora Voice AI Hackathon (Singapore 2026). The player investigates murders by exploring a stylized Godot mansion, collecting environmental clues, and interrogating autonomous NPCs through live voice conversations powered by Agora Conversational AI.

This is not a chatbot demo. The core experience is a Cluedo-style mystery where you talk to suspects in real time using your microphone, cross-reference what they say against physical evidence, and submit a formal accusation naming the murderer, weapon, and location.

## Gameplay Loop

1. A timed investigation phase (60 seconds) where you explore the mansion and question NPCs.
2. A blackout window (10 seconds) where the murderer can act.
3. Evidence is logged automatically as you discover clues and talk to characters.
4. Submit an accusation linking a suspect, weapon, and room to solve the case.

## The Cast

Four NPCs inhabit the mansion, each with distinct personalities, secrets, and alibis:

| Character | Role | Personality |
|-----------|------|-------------|
| **Edwin Graves** | Butler | Formal and reserved |
| **Rosa Hartwell** | Chef | Brash and opinionated |
| **Moss Faircloth** | Gardener | Quiet and watchful |
| **Clara Wren** | Maid | Anxious and eager to please |

Each NPC has a **Trust** meter (willingness to cooperate) and a **Breakdown** meter (visible nervousness). Good questioning improves trust; aggressive handling or failed accusations erode it. At 100% breakdown, an NPC stops talking until the next round.

## Repository Layout

```text
godot/                      Godot 4.6 project
  scenes/                   Game scenes (title screen, main mansion, journal, etc.)
  scripts/                  GDScript gameplay logic
  shaders/                  Visual atmosphere shaders
  assets/                   Characters, fonts, UI art
  addons/godot_wry/         Godot WRY GDExtension (in-engine WebView)
scripts/agora/              Node.js backend
  session-server.js         HTTP server for game sessions and NPC voice agents
  agora-service.js          Agora token generation and session management
  npc-manager.js            NPC agent spawning with LLM + TTS configuration
  game-state.js             In-memory game state, breakdown/trust, journal
  prompt-builder.js         LLM system prompt generation from NPC profiles
  diagnose.js               Environment and credential diagnostics
  data/npc-profiles.json    NPC definitions (name, personality, alibi, secrets)
  data/scenarios.json       Murder scenario definitions
  talk/agora_voice.html     WebView page for Agora Web SDK voice I/O
docs/                       Setup and integration notes
```

## Tech Stack

- **Godot 4.6** — game world, UI, player movement, NPC interaction, round flow
- **Agora RTC + Conversational AI** — real-time voice channels between the player and NPC agents
- **Node.js** — local backend for session management, token generation, and NPC orchestration
- **LLM providers** — OpenAI, Mistral, or Groq for NPC dialogue generation
- **ElevenLabs** — text-to-speech for distinct NPC voices
- **Godot WRY** — GDExtension providing an in-engine WebView for the Agora Web SDK

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure credentials

Copy `.env.example` to `.env` and fill in the required values:

```bash
# Required
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=

# NPC voice agents — choose one mode:
# Pipeline mode (if you have an Agora Agent Studio pipeline):
AGORA_DEFAULT_PIPELINE_ID=

# Inline mode (provide API keys directly):
OPENAI_API_KEY=           # or MISTRAL_API_KEY
ELEVENLABS_API_KEY=

# Optional
AGORA_SESSION_SERVER_PORT=8080
AGORA_DEFAULT_IDLE_TIMEOUT=120
```

### 3. Run diagnostics (optional)

Verify your credentials and environment before starting:

```bash
npm run agora:diagnose
```

### 4. Start the local session server

```bash
npm run agora:server
```

The server runs on `http://127.0.0.1:8080` by default and exposes:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Server health check |
| `POST /api/game/start` | Initialize a game session and load NPC profiles |
| `POST /api/npc/:id/interact` | Start a voice conversation with an NPC |
| `POST /api/npc/:id/end` | End the current NPC conversation |
| `POST /api/game/accuse` | Submit a murder accusation |
| `POST /api/game/evidence` | Log an evidence entry |
| `GET /agora-voice` | WebView voice page (served to Godot WRY) |

### 5. Open the Godot project

Open `godot/project.godot` in Godot 4.6 and run the project. The game starts at the title screen.

### 6. Verify voice integration (optional)

Open `godot/scenes/agora_test.tscn` to test the Agora voice flow in isolation. This scene sends start/stop requests to the local backend and displays session metadata.

## Controls

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move the detective |
| Hold `E` | Interact with a highlighted clue |
| `M` | Start / stop voice conversation with a nearby NPC |
| `J` | Toggle the detective journal |

## Architecture

### Godot gameplay layer

The Godot project handles everything the player sees and touches:

- Mansion map with distinct, readable rooms
- Player movement and object interaction
- NPC placement with proximity-based voice prompts
- Round timer with investigation and blackout phases
- Detective journal with Evidence and Case tabs
- Accusation flow for suspect, weapon, and location
- Visual atmosphere via custom shaders and lighting

The `GameSessionManager` autoload singleton communicates with the Node backend over HTTP, translating game events into API calls and emitting signals back to the scene tree.

### Node.js service layer

The backend in `scripts/agora/` keeps API secrets out of the Godot client. When the player walks up to an NPC and presses M:

1. Godot sends a POST to `/api/npc/:id/interact`
2. The server builds an LLM system prompt from the NPC's profile, personality, secrets, and current breakdown/trust state
3. An Agora Conversational AI agent is spawned with the configured LLM and ElevenLabs TTS voice
4. The server returns RTC credentials so Godot can join the voice channel
5. The player speaks naturally with the NPC through their microphone
6. When the conversation ends, breakdown increases and any journal entries are returned

### Voice integration

Voice runs through a WebView (Godot WRY addon) that loads the Agora Web SDK. The WebView communicates with GDScript via IPC messages (`join` / `leave`). If the WRY addon is not available, the system falls back to opening the voice page in the default browser.

## NPC Intelligence

Each NPC agent receives a dynamically built system prompt that includes:

- Their name, role, and personality
- Round-specific knowledge and alibi
- Personal secrets (revealed only under high breakdown)
- Current emotional state and trust level toward the detective
- The murder scenario context (scoped to what they would plausibly know)

NPCs operate in tiers based on their breakdown level — calm NPCs are composed and guarded, while high-breakdown NPCs leak contradictions, make impulsive statements, and may accidentally reveal critical information.

## Additional Documentation

- [Agora + Godot Setup Guide](./docs/agora-godot-setup.md)
- [Room Asset Import Notes](./docs/painted-assetpack-room-import.md)
- [Agora Voice AI Quickstart](./Agora-Voice-AI-Quickstart.md)
- [Hackathon Rating Rubric](./Hackathon-Rating-Rubric.md)

## npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `agora:server` | `npm run agora:server` | Start the local session server |
| `agora:start` | `npm run agora:start` | CLI: start an agent session from a JSON file |
| `agora:stop` | `npm run agora:stop` | CLI: stop an agent session |
| `agora:diagnose` | `npm run agora:diagnose` | Check environment, credentials, and voice config |

## Status

The repository is a playable vertical-slice prototype built for the hackathon. Current state:

- Mansion map with multiple rooms, shaders, and atmosphere
- Four authored NPCs with profiles, secrets, and voice identities
- Live voice interrogation through Agora Conversational AI
- Backend NPC orchestration with dynamic prompts, trust, and breakdown
- Detective journal with evidence logging
- Round timer with investigation and blackout phases
- Accusation flow for suspect, weapon, and location
- Title screen and game session initialization

Areas of active development:

- Expanding NPC behavioral patterns and movement
- Blackout-constrained murder events with audio cues
- Richer evidence capture from voice conversations
- Visual polish and room readability improvements
