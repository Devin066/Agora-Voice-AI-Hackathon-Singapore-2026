# CareKaki

**Care without constant calling.**

CareKaki is a real-time voice companion for elderly Singaporeans and the families who care about them from afar. It was built for the **Agora Voice AI Hackathon Singapore 2026** using **Agora RTC SDK** and **Agora Conversational AI Engine**.

Grandpa can talk naturally to CareKaki during the day. Family does not need to keep calling every few hours or read a full transcript. They see the care signals that matter: medication, meals, mood, loneliness, health mentions, important quotes, and urgent alerts.

![CareKaki demo thumbnail](submissions/_pending/voice-ai-web/Deck%20%26%20Demo/CareKaki-thumbnail-1200x675.png)

## Project Links

- **Submission folder:** [`submissions/_pending/voice-ai-web`](submissions/_pending/voice-ai-web)
- **Detailed submission README:** [`submissions/_pending/voice-ai-web/README.md`](submissions/_pending/voice-ai-web/README.md)
- **Pitch deck:** [`submissions/_pending/voice-ai-web/Deck & Demo/CareKaki-pitch-deck.pdf`](submissions/_pending/voice-ai-web/Deck%20%26%20Demo/CareKaki-pitch-deck.pdf)
- **Speaker notes:** [`submissions/_pending/voice-ai-web/Deck & Demo/CareKaki-speaker-notes.md`](submissions/_pending/voice-ai-web/Deck%20%26%20Demo/CareKaki-speaker-notes.md)

This repository is a fork of the official hackathon repository. The root README has been rewritten to present the actual submitted project, while the full app remains inside the required submission path.

## The Problem

Across Singapore and Asia, many families care for elderly parents or grandparents while juggling school, work, National Service, travel, or living abroad. Calling constantly can feel intrusive for seniors and exhausting for caregivers. Not calling enough can mean missing early signs that something is wrong.

CareKaki sits in the middle:

- Seniors get companionship, not surveillance.
- Families get useful care signals, not a transcript dump.
- Risky moments become obvious and actionable.
- The product avoids medical overreach.

The emotional story is simple: **Grandpa lives at home. I care about him. I cannot call every hour. CareKaki keeps him company and tells me when I should step in.**

## What We Built

CareKaki has three real product surfaces:

| Route | Purpose |
| --- | --- |
| `/grandpa` | Senior-facing voice app with one large CareKaki control, readable transcript, and help action. |
| `/family` | Caregiver app with medication, mood, meals, quote, timeline, and urgent alert. |
| `/demo` | Two-phone judge view showing Grandpa and family together for a clear live pitch. |
| `/` | Role chooser for opening each product surface. |

The app is designed so the demo does not look like a fake dashboard. Grandpa and family each have their own app. The combined `/demo` page exists only so judges can understand both sides in one view.

## Core Features

- Real-time browser voice session through Agora RTC.
- Managed voice AI agent through Agora Conversational AI Engine.
- Senior-friendly companion interface with large controls and simple copy.
- Family view that converts conversation into care signals.
- Medication state detection: taken, uncertain, missed, urgent.
- Mood and loneliness detection.
- Meal and hydration mentions.
- Health mentions such as knee soreness, dizziness, falls, chest pain, or breathing trouble.
- Important quote extraction for emotionally meaningful updates.
- Urgent CareKaki room when safety risk language appears.
- Guided recording mode for noisy hackathon environments.
- Browser speech for guided CareKaki lines so spoken audio matches visible chat text.

## Demo In One Sentence

> Grandpa talks casually. CareKaki turns the conversation into care signals. Family only steps in when it matters.

## How It Uses Agora

CareKaki uses both required Agora technologies as core infrastructure.

### Agora RTC SDK

The React client joins an Agora real-time channel, publishes browser microphone audio, subscribes to the AI agent audio, and receives live transcript events.

### Agora Conversational AI Engine

The Python backend starts and manages an Agora Conversational AI agent in Agent Builder pipeline mode. The agent joins the same RTC channel and provides the live voice companion experience.

The guided Care session does not replace Agora. It exists so the project can still be filmed clearly in a noisy hackathon room while preserving the real live voice path.

## Architecture

```text
Senior browser app
  -> Agora RTC SDK
  -> Agora real-time audio channel
  -> Agora Conversational AI Engine
  -> Agent Builder pipeline: STT, LLM, TTS
  -> spoken CareKaki response + transcript events

React client
  -> live voice controls
  -> transcript rendering
  -> deterministic care-signal extraction
  -> localStorage session sync for MVP caregiver view

Python backend
  -> health endpoint
  -> Agora token generation
  -> start managed Conversational AI agent
  -> hang up managed agent
```

## Repository Layout

```text
submissions/_pending/voice-ai-web/
  README.md
  Deck & Demo/
    CareKaki-pitch-deck.pdf
    CareKaki-speaker-notes.md
    CareKaki-thumbnail-1200x675.png
    slide-previews/
  Source Code/
    react-voice-client/
      app/
      components/
      hooks/
      package.json
    simple-backend/
      local_server.py
      core/
      tests/
      .env.example
```

## Environment

Real credentials stay local in:

```text
submissions/_pending/voice-ai-web/Source Code/simple-backend/.env
```

Only the placeholder template is committed:

```text
submissions/_pending/voice-ai-web/Source Code/simple-backend/.env.example
```

Required values:

```bash
VOICE_APP_ID=your_agora_app_id
VOICE_APP_CERTIFICATE=your_agora_app_certificate
VOICE_PIPELINE_ID=your_32_character_agent_builder_pipeline_id
VOICE_AGENT_AUTH_HEADER=your_basic_auth_header_if_required
```

Do not commit `.env`, API keys, local virtual environments, `node_modules`, `.next`, logs, curl dumps, or generated secret-bearing files.

## Run Locally

### 1. Start Backend

```bash
cd "submissions/_pending/voice-ai-web/Source Code/simple-backend"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-local.txt
cp .env.example .env
PORT=8082 python3 -u local_server.py
```

Health check:

```bash
curl http://localhost:8082/health
```

### 2. Start Frontend

```bash
cd "submissions/_pending/voice-ai-web/Source Code/react-voice-client"
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:8083
```

## Demo Flow

### Judge Recording Flow

Use this flow when presenting or filming in a noisy room.

1. Open `http://localhost:8083/demo`.
2. Open **Care session**.
3. Keep **CareKaki voice: On**.
4. Click **Continue check-in**.
5. Narrate each family-side update.
6. On the urgent alert, click **Join CareKaki room**.
7. Click **Reassure Grandpa**.

This flow is reliable because the guided CareKaki voice is generated by the browser and exactly matches the visible CareKaki chat bubble.

### Live Agora Voice Flow

Use this flow to prove the live voice path.

1. Open `http://localhost:8083/grandpa`.
2. Allow microphone permission.
3. Click **Start CareKaki**.
4. Say: "Hi CareKaki, I had kopi. It is a bit quiet today."
5. Confirm CareKaki responds audibly and the transcript updates.
6. Say: "I don't remember if I took the night pill. Maybe I took it twice. I feel dizzy."
7. Open `http://localhost:8083/family` and confirm the latest care state appears.

## Verification

Frontend:

```bash
cd "submissions/_pending/voice-ai-web/Source Code/react-voice-client"
npm run lint
npm run build
```

Backend:

```bash
cd "submissions/_pending/voice-ai-web/Source Code/simple-backend"
source .venv/bin/activate
pytest
```

Manual voice verification is required in Chrome because automated Chromium may deny microphone access.

## Safety Boundary

CareKaki is not a medical device.

It does **not**:

- diagnose conditions
- prescribe medication
- recommend dosage changes
- call emergency services
- dispatch responders
- replace family, caregivers, doctors, or emergency services

When medication confusion, dizziness, falling, chest pain, breathing trouble, severe distress, or possible double medication appears, CareKaki uses safe general language:

- sit down safely
- do not take another pill right now
- keep the phone nearby
- family should check in immediately

## Design Decisions

- **Two-phone model:** makes the senior and family experiences immediately understandable.
- **Role-based routes:** makes CareKaki feel like a real product, not a one-screen prototype.
- **Local care extraction:** deterministic, fast, and reliable for hackathon timing.
- **localStorage sync:** lets `/grandpa`, `/family`, and `/demo` feel connected without auth or a database.
- **Browser speech for guided lines:** ensures recording audio matches the visible CareKaki text.
- **Agent Builder pipeline mode:** keeps the live voice path aligned with Agora Conversational AI Engine.

## Known Limitations

- The MVP does not include authentication, database persistence, SMS, push notifications, real phone calls, maps, OCR, prescription scanning, hospital lookup, or emergency dispatch.
- Voice timing and tone in live mode depend on the configured Agora Agent Builder pipeline.
- The project currently lives under `_pending/voice-ai-web` until the final hackathon team folder is assigned.

## Inspiration And Attribution

CareKaki was inspired by voice-first elder-care, companionship, caregiver-dashboard, and hackathon demo patterns from public projects researched during planning. The submitted code is implemented inside this repository rather than forked from those projects.

## Submission Status

- Branch: `codex/hackathon-readiness`
- Official PR: [CareKaki: real-time voice companion for elderly care](https://github.com/Devin066/Agora-Voice-AI-Hackathon-Singapore-2026/pull/16)
- Submission path: [`submissions/_pending/voice-ai-web`](submissions/_pending/voice-ai-web)
