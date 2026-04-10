# Agora Voice Cluedo

Agora Voice Cluedo is a Godot-based detective game prototype for the Agora Voice AI Hackathon. The player investigates a murder by exploring a stylized mansion, collecting environmental clues, and interrogating autonomous NPCs through live voice conversations powered by Agora.

This repository is being built as a playable vertical slice rather than a generic chatbot demo. The target loop is simple and readable:

- Explore the map during a timed investigation phase.
- Speak with suspicious NPCs in real time.
- Track automatically logged evidence in the detective journal.
- Survive blackout windows where murders can occur.
- Accuse the murderer, weapon, and location.

## Current Vertical Slice

The repo currently contains:

- A Godot 4 project under [`godot/`](./godot) with a playable mansion scene.
- Stylized room art, lighting, and shader work for the mystery atmosphere.
- A detective controller with movement and object interaction.
- A detective journal UI with `Evidence` and `Case` tabs.
- A round timer UI for the one-minute investigation loop.
- A local Node service for starting and stopping Agora conversational sessions.
- A Godot Agora test scene for verifying the local service contract.

The NPC interrogation loop is the core product direction, but the codebase is still in vertical-slice mode. Some systems are represented as focused prototypes instead of full game logic.

## Repository Layout

```text
godot/                  Godot 4.6 project, scenes, scripts, shaders, assets
scripts/agora/          Local Agora session service and CLI helpers
docs/agora-godot-setup.md
                        Agora setup notes and Godot integration flow
docs/painted-assetpack-room-import.md
                        Asset import notes for the environment art
images/                 Submission/supporting images
```

## Tech Stack

- Godot 4.6 for the game world, UI, and gameplay scripts
- Node.js for the local Agora token/session service
- Agora RTC and Agora Conversational AI for live voice agent sessions

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Agora credentials

Copy `.env.example` to `.env` and fill in the required values:

```bash
AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...
AGORA_DEFAULT_PIPELINE_ID=...
AGORA_DEFAULT_AGENT_PRESET=
AGORA_SESSION_SERVER_PORT=8787
AGORA_DEFAULT_IDLE_TIMEOUT=120
```

`AGORA_DEFAULT_PIPELINE_ID` is the fastest setup path if you already defined an NPC voice pipeline in Agora Agent Studio.

### 3. Start the local Agora session server

```bash
npm run agora:server
```

This exposes:

- `GET /health`
- `POST /api/agora/session/start`
- `POST /api/agora/session/stop`

### 4. Open the Godot project

Open [`godot/project.godot`](./godot/project.godot) in Godot 4.6 and run the project.

The current default run scene is [`godot/scenes/main.tscn`](./godot/scenes/main.tscn).

### 5. Verify the Agora service contract in Godot

If you want to test the local Agora flow before wiring it into the full game loop, open [`godot/scenes/agora_test.tscn`](./godot/scenes/agora_test.tscn). That scene can send start and stop requests directly to the local Node service and display the returned session metadata.

## Controls

- Move: arrow keys or WASD via Godot's `ui_*` actions
- Interact with the highlighted clue object: hold `E`
- Toggle journal: `J`

## Architecture Notes

### Godot gameplay layer

The Godot project owns:

- map layout and room readability
- player movement and interactions
- round presentation and blackout pacing
- journal UI and deduction surfaces
- future NPC placement, movement intent, trust, and breakdown systems

### Agora service layer

The local service in [`scripts/agora/`](./scripts/agora) keeps secrets out of Godot. It:

- generates RTC credentials for the player
- starts an Agora conversational agent session
- returns the channel, UIDs, and agent metadata Godot needs
- stops the remote agent cleanly when the scene or round ends

That keeps the voice integration testable while the core mystery game is still evolving.

## Product Direction

This project is intentionally scoped around a Cluedo-style mystery instead of open-ended roleplay. The intended full loop is:

1. The detective explores a multi-room mansion for one minute.
2. NPCs move with authored, role-driven behavior.
3. During blackout, the murderer can act.
4. The game logs relevant clues and suspicious sounds automatically.
5. The player interrogates NPCs through live voice.
6. The player submits a linked accusation: murderer, weapon, and location.

The key design constraints are readability and debuggability. NPCs should feel autonomous, but the mystery still needs authored structure so players can reason about motive, timeline, and lies.

## Additional Docs

- [`docs/agora-godot-setup.md`](./docs/agora-godot-setup.md)
- [`docs/painted-assetpack-room-import.md`](./docs/painted-assetpack-room-import.md)
- [`Hackathon-Rating-Rubric.md`](./Hackathon-Rating-Rubric.md)
- [`Thought_Starters.md`](./Thought_Starters.md)

## Status

The repository is currently centered on the playable prototype and integration scaffolding needed for the hackathon vertical slice. The highest-priority remaining work is:

- expand NPC presence and authored behavior
- connect the live Agora conversation flow to the main detective scene
- trigger blackout-constrained murder events
- improve evidence logging and accusation resolution
