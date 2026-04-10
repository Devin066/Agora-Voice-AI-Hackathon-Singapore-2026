# CareKaki

**Care without constant calling.**

CareKaki is a web-based voice companion for elderly Singaporeans and their caregivers. A senior can talk naturally to CareKaki during the day, while the family sees a simple phone view with medication signals, mood or loneliness notes, meal mentions, health concerns, and safe escalation prompts.

The product has separate role pages so it feels like real software, not a prototype. Grandpa uses the senior app, family uses the caregiver app, and the combined care session shows both together for judges.

## What It Does

- Runs a real-time voice session with an Agora Conversational AI agent.
- Shows a large, elder-friendly companion phone with live voice state.
- Shows a family phone with care updates that feel like simple caregiver messages.
- Provides separate `/grandpa`, `/family`, and `/demo` routes.
- Displays live transcript messages from the Agora voice session.
- Includes a paced guided check-in for judges, so each care signal updates visibly even if venue voice timing is poor.
- Opens a family CareKaki room during urgent escalation with the latest quote, transcript context, and a reassurance action.
- Speaks CareKaki's guided responses with browser speech so the recording voice matches the visible CareKaki text.
- Extracts care signals from the transcript:
  - medication taken, uncertain, or urgent
  - mood and loneliness
  - food and drink mentions
  - health mentions like knee soreness or dizziness
  - urgent risk signals such as possible double medication, falling, chest pain, breathing trouble, or severe distress
- Gives family a status, timeline, important quote, and daily care note.
- Includes guided care-session controls so the video can still be recorded if browser microphone permission or network conditions fail.

CareKaki does **not** diagnose, prescribe, replace professional care, call emergency services, or dispatch responders.

## Architecture

- `Source Code/react-voice-client/` is the Next.js client. It captures microphone audio, joins the Agora RTC channel, renders voice state and transcript, and derives caregiver signals in local UI state.
- `Source Code/simple-backend/` is the Python backend. It generates Agora RTC credentials and starts or stops managed Agora Conversational AI agents through the REST API.
- Agora Agent Builder pipeline mode owns the STT, LLM, and TTS configuration.
- The local app passes CareKaki's prompt and greeting into the existing backend query-param override.
- The MVP syncs the latest care session through browser `localStorage` under `carekaki:v1:session`, so `/family` can display the latest locally derived care state without adding a database.

```text
Browser CareKaki client
  <-> Agora RTC / SD-RTN audio channel
  <-> Agora Conversational AI agent
  <-> Agent Builder pipeline: STT, LLM, TTS

Python backend
  -> token generation
  -> start-agent and hangup-agent orchestration
```

## Agora Integration

This submission uses both required Agora technologies as core product infrastructure:

- **Agora RTC SDK**: the React client joins a real-time Agora RTC channel, publishes browser microphone audio, subscribes to the remote AI agent audio, and receives transcript events.
- **Agora Conversational AI Engine**: the Python backend starts a managed voice AI agent in the same channel. The agent listens, reasons through the configured Agent Builder pipeline, and streams spoken responses back to the browser.

The guided care-session controls do not replace Agora. They keep recording and judging reliable when automated browsers cannot grant microphone permission or when venue voice behavior is not clean enough for video.

## Setup

### Backend

```bash
cd "Source Code/simple-backend"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-local.txt
cp .env.example .env
```

Fill `.env` with local Agora credentials. Do not commit `.env`.

Required values:

```bash
VOICE_APP_ID=...
VOICE_APP_CERTIFICATE=...
VOICE_PIPELINE_ID=...
VOICE_AGENT_AUTH_HEADER=...
```

Start the backend:

```bash
PORT=8082 python3 -u local_server.py
```

Health check:

```bash
curl http://localhost:8082/health
```

### Frontend

```bash
cd "Source Code/react-voice-client"
npm install --legacy-peer-deps
npm run dev
```

Open:

```text
http://localhost:8083
```

Routes:

- `/` - role chooser
- `/grandpa` - senior-facing voice companion app
- `/family` - caregiver-facing care updates app
- `/demo` - two-phone judge view

## Manual Demo Flow

1. Open Chrome at `http://localhost:8083/grandpa`.
2. Allow microphone permission.
3. Click **Start CareKaki**.
4. Say: “Hi CareKaki, I had kopi. It is a bit quiet today.”
5. Confirm the agent responds and transcript updates.
6. Say: “I don't remember if I took the night pill. Maybe I took it twice. I feel dizzy.”
7. Confirm CareKaki uses safe escalation language and the family phone marks the situation urgent.

If microphone permission fails or live voice timing sounds poor, open `http://localhost:8083/demo` and use **Care session**:

- Continue check-in
- Run guided check-in
- Morning check-in
- Lunch and medicine
- Family moment
- Safety check

For the most reliable live pitch, use **Continue check-in** and narrate each state change. For a no-talk recording, use **Run guided check-in**, then click **Join CareKaki room** and **Reassure Grandpa** when the urgent alert appears.

## Safety

CareKaki uses safety-first language:

- It does not provide medical diagnosis.
- It does not recommend taking or changing medication.
- For medication confusion, dizziness, falls, chest pain, breathing trouble, or severe distress, it advises the senior to sit safely, avoid taking extra medicine, keep the phone nearby, and alerts family in-app.
- A production version would need consent, retention controls, caregiver permissions, emergency policies, and audit logs.

## Voice Quality Checklist

Turn-taking and voice quality mostly live inside the Agora Agent Builder pipeline, not this React UI. If the team has Agent Builder access before the final demo:

- Try a warmer, lower-latency voice.
- Keep the system prompt short and strict: one question at a time, 8-18 words.
- Tune turn detection, VAD, or endpointing if exposed.
- Prefer faster endpointing, but avoid cutting Grandpa off mid-sentence.
- Test exactly these two lines:
  - “Hi CareKaki, I had kopi. It is a bit quiet today.”
  - “I don't remember if I took the night pill. Maybe I took it twice. I feel dizzy.”

If Agent Builder settings are not accessible, use the current prompt, tap-to-speak UI, and Care session recording path.

## Known Limitations

- Manual Chrome microphone testing is required because automated Chromium can deny microphone permission.
- Real calls, SMS, push notifications, auth, database persistence, maps, hospital lookup, OCR, prescription scanning, and emergency dispatch are intentionally out of scope for this hackathon MVP.
- The submission is still under `_pending/voice-ai-web` until the assigned group/team folder is known.
- Voice timing and voice tone depend on the configured Agora Agent Builder pipeline.

## Attribution

Built from official hackathon and Agora resources:

- Agora Voice AI Hackathon Singapore 2026 repository
- [AgoraIO Conversational AI agent samples](https://github.com/AgoraIO-Conversational-AI/agent-samples)
- Agora RTC SDK
- Agora Conversational AI Engine and Agent Builder

Product and UX inspiration:

- [Chapplication/chatty-friend](https://github.com/Chapplication/chatty-friend) for caregiver summaries and escalation framing.
- [devraftel/voicecare](https://github.com/devraftel/voicecare) for voice-first eldercare interaction patterns.
- [njic/medassist](https://github.com/njic/medassist), [adarshbalu/elderly_app](https://github.com/adarshbalu/elderly_app), and [ElderEase](https://devpost.com/software/elderease-j7cmdv) for medication status patterns.
- [aceta-minophen/Rudra](https://github.com/aceta-minophen/Rudra) for care dashboard categories.
- [mohamednizzad/VoiceOfVoiceless](https://github.com/mohamednizzad/VoiceOfVoiceless) for transcript and tone-signal inspiration.
- [lalaland-ai/lala-companion](https://github.com/lalaland-ai/lala-companion) for companion-presence design thinking.
- [Clove](https://devpost.com/software/clove-ga6v5p) for memory and emotional caregiver-note inspiration.
