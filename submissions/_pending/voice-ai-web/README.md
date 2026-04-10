# CareKaki

**Care without constant calling.**

CareKaki is a real-time voice companion for elderly Singaporeans and the families who care about them from afar. Grandpa can speak naturally to a warm companion during the day. Family does not need to call every few hours; they see only what matters: medication signals, meals, mood, loneliness, health mentions, important quotes, and urgent care alerts.

Built for **Agora Voice AI Hackathon Singapore 2026** using **Agora RTC SDK** and **Agora Conversational AI Engine**.

## Why This Matters

Many families in Singapore and across Asia care for elderly parents or grandparents while juggling school, work, National Service, travel, or living abroad. Constant check-in calls can feel intrusive for seniors and exhausting for caregivers. The opposite is worse: silence until something goes wrong.

CareKaki sits in the middle:

- Grandpa gets companionship, not surveillance.
- Family gets care signals, not a full transcript dump.
- Urgent moments become obvious and actionable.
- The product respects safety boundaries: it does not diagnose, prescribe, dispatch, or replace family/professional care.

## Demo At A Glance

Open:

```text
http://localhost:8083/demo
```

Use the **Care session** panel:

1. Keep **CareKaki voice: On**.
2. Click **Continue check-in** for each moment.
3. Watch the family phone update in real time.
4. On the red alert, click **Join CareKaki room**.
5. Click **Reassure Grandpa**.

The recommended live pitch is:

> Grandpa talks casually. CareKaki turns the conversation into care signals. Family only steps in when it matters.

## Product Surfaces

CareKaki is intentionally split into real role-based surfaces.

| Route | Purpose |
| --- | --- |
| `/grandpa` | Senior-facing app with one large voice control, transcript, and help action. |
| `/family` | Caregiver-facing app with medication, mood, meals, quote, timeline, and urgent alert. |
| `/demo` | Two-phone judge view showing Grandpa and family together. |
| `/` | Clean role chooser. |

This keeps the product from feeling like a mock dashboard. Each role has its own usable app.

## What CareKaki Does

- Starts a real-time Agora voice session with a managed Conversational AI agent.
- Publishes browser microphone audio through Agora RTC.
- Receives transcript events from the voice session.
- Extracts care signals from conversation text:
  - medication taken, uncertain, missed, or urgent
  - mood, loneliness, confusion, or distress
  - food and drink mentions
  - health mentions such as knee soreness, dizziness, falls, chest pain, or breathing trouble
- Shows the caregiver a concise care summary instead of overwhelming raw chat.
- Opens a CareKaki room when urgent risk language appears.
- Provides a guided recording path for noisy hackathon venues.
- Speaks guided CareKaki responses through browser speech so the recording voice matches the visible CareKaki chat text.

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

### Agora Usage

CareKaki uses both required Agora technologies as core infrastructure.

- **Agora RTC SDK**: the React client joins an RTC channel, publishes local microphone audio, subscribes to the AI agent audio, and receives real-time transcript messages.
- **Agora Conversational AI Engine**: the Python backend starts a managed voice AI agent in the same channel using Agent Builder pipeline mode.

The guided Care session controls do not replace Agora. They make the pitch recordable in a loud venue while preserving the real Agora live path.

## Repository Layout

```text
voice-ai-web/
  README.md
  Deck & Demo/
    CareKaki-pitch-deck.pdf
    CareKaki-speaker-notes.md
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

Real credentials must stay local in:

```text
Source Code/simple-backend/.env
```

Use the committed template:

```text
Source Code/simple-backend/.env.example
```

Required values:

```bash
VOICE_APP_ID=your_agora_app_id
VOICE_APP_CERTIFICATE=your_agora_app_certificate
VOICE_PIPELINE_ID=your_32_character_agent_builder_pipeline_id
VOICE_AGENT_AUTH_HEADER=your_basic_auth_header_if_required
```

Do not commit `.env`, API keys, local virtual environments, `node_modules`, `.next`, logs, or generated curl dumps.

## Run Locally

### 1. Start Backend

```bash
cd "Source Code/simple-backend"
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
cd "Source Code/react-voice-client"
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:8083
```

## Demo Flow

### Judge Recording Flow

Use this when filming or presenting in a noisy room.

1. Open `http://localhost:8083/demo`.
2. Open **Care session**.
3. Keep **CareKaki voice: On**.
4. Click **Continue check-in**.
5. Narrate the family-side updates after each click.
6. On the urgent alert, click **Join CareKaki room**.
7. Click **Reassure Grandpa**.

This flow is reliable because CareKaki's guided voice is generated by the browser and exactly matches the visible CareKaki chat bubble.

### Live Agora Voice Flow

Use this to prove the real voice path.

1. Open `http://localhost:8083/grandpa`.
2. Allow microphone permission.
3. Click **Start CareKaki**.
4. Say: “Hi CareKaki, I had kopi. It is a bit quiet today.”
5. Confirm CareKaki responds audibly and the transcript updates.
6. Say: “I don't remember if I took the night pill. Maybe I took it twice. I feel dizzy.”
7. Open `http://localhost:8083/family` and confirm the latest care state appears.

## Verification

Frontend:

```bash
cd "Source Code/react-voice-client"
npm run lint
npm run build
```

Backend:

```bash
cd "Source Code/simple-backend"
source .venv/bin/activate
pytest
```

Manual voice verification is required in Chrome because automated Chromium may deny microphone access.

## Design Choices

- **Two-phone model**: makes the senior and family experiences immediately understandable.
- **Local care extraction**: deterministic, fast, and reliable for hackathon demo timing.
- **localStorage sync**: lets `/grandpa`, `/family`, and `/demo` feel connected without adding auth or a database.
- **Browser speech for guided CareKaki lines**: ensures recording audio matches the visible text even when venue voice timing is poor.
- **Agent Builder pipeline mode**: keeps the live voice path aligned with Agora's Conversational AI Engine.

## Known Limitations

- The MVP does not include authentication, database persistence, SMS, push notifications, real phone calls, maps, OCR, prescription scanning, hospital lookup, or emergency dispatch.
- Voice timing and voice tone in live mode depend on the configured Agora Agent Builder pipeline.
- The project currently lives under `_pending/voice-ai-web` until the final hackathon team folder is assigned.

## Deck And Assets

- Pitch deck: `Deck & Demo/CareKaki-pitch-deck.pdf`
- Speaker notes: `Deck & Demo/CareKaki-speaker-notes.md`
- Slide previews: `Deck & Demo/slide-previews/`
- Demo guide: `Deck & Demo/README.md`

## Inspiration And Attribution

Built from official hackathon and Agora resources:

- Agora Voice AI Hackathon Singapore 2026 repository
- Agora RTC SDK
- Agora Conversational AI Engine and Agent Builder
- [AgoraIO Conversational AI agent samples](https://github.com/AgoraIO-Conversational-AI/agent-samples)

Product and UX inspiration:

- [Chapplication/chatty-friend](https://github.com/Chapplication/chatty-friend) for caregiver summaries and escalation framing.
- [devraftel/voicecare](https://github.com/devraftel/voicecare) for voice-first eldercare interaction patterns.
- [njic/medassist](https://github.com/njic/medassist), [adarshbalu/elderly_app](https://github.com/adarshbalu/elderly_app), and [ElderEase](https://devpost.com/software/elderease-j7cmdv) for medication status patterns.
- [aceta-minophen/Rudra](https://github.com/aceta-minophen/Rudra) for care dashboard categories.
- [mohamednizzad/VoiceOfVoiceless](https://github.com/mohamednizzad/VoiceOfVoiceless) for transcript and tone-signal inspiration.
- [lalaland-ai/lala-companion](https://github.com/lalaland-ai/lala-companion) for companion-presence design thinking.
- [Clove](https://devpost.com/software/clove-ga6v5p) for memory and emotional caregiver-note inspiration.
