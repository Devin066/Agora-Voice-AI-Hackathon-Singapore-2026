# Agora RTC and Conversational AI Setup

This repository now includes a small local service layer under `scripts/agora/` that is designed to stay outside Godot while still being easy for Godot to call.

## What it does

- Generates a player RTC token for the Godot client.
- Generates the agent token used to authenticate Agora Conversational AI.
- Starts a conversational AI agent over Agora REST.
- Stops that agent cleanly when the round ends.

## Files

- `scripts/agora/session-server.js`: local JSON API for Godot or other clients
- `scripts/agora/start-agent.js`: CLI entrypoint for quick manual testing
- `scripts/agora/stop-agent.js`: CLI stop helper
- `scripts/agora/sample-session.json`: minimal start payload example
- `scripts/agora/sample-stop.json`: minimal stop payload example

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...
AGORA_DEFAULT_PIPELINE_ID=...
```

`AGORA_DEFAULT_PIPELINE_ID` is the easiest path if you define the NPC voice agent in Agora Agent Studio first. If you do not use a pipeline, send `preset` or explicit `llm` and `tts` objects in the start request body instead.

## Start the local service

```bash
npm run agora:server
```

The server exposes:

- `GET /health`
- `POST /api/agora/session/start`
- `POST /api/agora/session/stop`

## Manual start test

Update `scripts/agora/sample-session.json`, then run:

```bash
npm run agora:start -- scripts/agora/sample-session.json
```

The response includes:

- `appId`
- `channel`
- `player_uid`
- `agent_uid`
- `rtc_token`
- `agent.agent_id`

Your future Godot client will need `appId`, `channel`, `player_uid`, and `rtc_token` to join the RTC room, then it can talk to the agent over the same channel.

## Stop a running agent

```bash
npm run agora:stop -- <agent_id>
```

If the stop command runs in a separate process from the original start command, pass the channel and agent UID too:

```bash
npm run agora:stop -- <agent_id> <channel> <agent_uid>
```

Or use:

```bash
npm run agora:stop -- scripts/agora/sample-stop.json
```

## Godot-side usage shape

Once the Godot project is ready to consume this, the flow should be:

1. Godot requests `POST /api/agora/session/start`.
2. The local service returns player RTC credentials plus the started agent metadata.
3. Godot joins the Agora RTC channel using the returned `appId`, `channel`, `player_uid`, and `rtc_token`.
4. The player speaks in the channel and the Agora conversational AI agent responds as another participant.
5. When the round ends or the scene unloads, Godot calls `POST /api/agora/session/stop` with the `agentId`, and if needed also `channel` plus `agentUid`.

That keeps all secrets server-side and matches Agora's token-authenticated setup.
