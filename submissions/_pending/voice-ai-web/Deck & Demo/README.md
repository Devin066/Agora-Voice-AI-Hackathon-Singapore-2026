# CareKaki Deck and Demo

## Required Links

- Pitch deck: `CareKaki-pitch-deck.pdf`
- Project thumbnail: `CareKaki-thumbnail.png`
- Project thumbnail, smaller: `CareKaki-thumbnail-1200x675.png`
- Speaker notes: `CareKaki-speaker-notes.md`
- Slide previews: `slide-previews/`
- Deck generator: `generate_carekaki_deck.py`
- Thumbnail generator: `generate_carekaki_thumbnail.py`
- Demo recording: TBD
- Hosted app: TBD

## Five-Minute Demo Script

### 0:00-0:40 - Problem

Say:

> Singapore families care deeply for elderly parents and grandparents, but calling every few hours can feel intrusive. CareKaki lets Grandpa simply talk, and family only sees what matters.

Show:

- Open `http://localhost:8083/demo`.
- Grandpa's app on the left.
- Family's app on the right.
- Family phone status: “Grandpa is okay.”
- Explain that the live path uses Agora RTC plus Agora Conversational AI.
- Open **Care session** and keep **CareKaki voice** on.

### 0:40-1:40 - Everyday Companionship

Live voice line or click **Continue check-in**:

> CareKaki, I’m having kopi. It’s a bit quiet today.

Expected:

- CareKaki responds warmly.
- Transcript updates.
- Mood becomes quiet or lonely.
- Family phone starts a timeline.

### 1:40-2:20 - Meal and Medication

Live voice line or click **Continue check-in**:

> Yes, rice and fish soup. I also took my white tablet after breakfast.

Expected:

- Meal card updates.
- Medication card marks taken.
- Timeline records lunch and medicine.

### 2:20-3:10 - Memory and Loneliness

Live voice line or click **Continue check-in**:

> Still sore, but not worse. I miss my grandson today.

Expected:

- Health mentions record knee soreness.
- Mood card marks lonely.
- Important quote captures the family note.

### 3:10-4:20 - Medication Risk

Live voice line or click **Continue check-in**:

> I don’t remember if I took the night pill. Maybe I took it twice. I feel a bit dizzy.

Expected:

- Family phone turns urgent: “Call Grandpa now.”
- Medication card marks urgent.
- CareKaki uses safe language: sit down, do not take another pill, keep phone nearby, alerting family.

### 4:20-5:00 - Family Handoff and Summary

Click:

- **Join CareKaki room**
- **Reassure Grandpa**
- **Generate**

Say:

> CareKaki does not replace family or professional care. It helps family know when to show up.

Expected:

- Family sees a CareKaki room with the urgent quote, recent transcript, and immediate reassurance action.
- Today’s care note summarizes medication, meal, mood, health, and suggested action.

## Manual Voice Test

1. Start backend:

```bash
cd "/Users/Shreyansh/agora/submissions/_pending/voice-ai-web/Source Code/simple-backend"
source .venv/bin/activate
PORT=8082 python3 -u local_server.py
```

2. Start frontend:

```bash
cd "/Users/Shreyansh/agora/submissions/_pending/voice-ai-web/Source Code/react-voice-client"
npm run dev
```

3. Open Chrome:

```text
http://localhost:8083/grandpa
```

4. Allow microphone permission.
5. Click **Start CareKaki**.
6. Test normal check-in:

> Hi CareKaki, I had kopi. It is a bit quiet today.

7. Test safe escalation:

> I don't remember if I took the night pill. Maybe I took it twice. I feel dizzy.

Expected result:

- Agent joins.
- User audio is published over Agora RTC.
- CareKaki responds audibly.
- Transcript updates.
- The latest care session is saved locally.
- Open `http://localhost:8083/family` in another tab to see the caregiver app.
- Risky medication and dizziness language triggers safe escalation.

## Recording Path

If microphone permission, venue network, turn-taking, or voice quality fails:

1. Keep the backend/frontend running if possible.
2. Open `http://localhost:8083/demo`.
3. Open **Care session**.
4. Keep **CareKaki voice** on.
5. Click **Continue check-in** one step at a time, or use **Run guided check-in** if you are recording without narration.
6. When the urgent state appears, click **Join CareKaki room**.
7. Click **Reassure Grandpa** to show the family handoff moment.
8. State honestly that the primary path uses Agora voice while this recording path keeps the pitch clear in noisy venues.

## Routes

- `/` - role chooser
- `/grandpa` - real senior-facing app
- `/family` - real caregiver-facing app
- `/demo` - judge-facing combined view with Care session controls

## Agent Builder Voice Tuning

If the team can access the Agora Agent Builder pipeline before judging:

- Choose the warmest low-latency voice available.
- Keep the agent prompt strict: one question at a time, 8-18 words.
- Reduce long explanatory behavior.
- Tune turn detection / VAD / endpointing if the UI exposes it.
- Test the exact demo lines before recording.

If pipeline settings are unavailable:

- Use the current app prompt.
- Use tap-to-speak to reduce accidental interruptions.
- Show live Agora startup briefly, then use Care session controls for a clear recording.

## Safety Line For Judges

CareKaki is not a diagnosis or dispatch product. It is a companionship and caregiver-awareness layer. For risky phrases, it gives safe general advice and prompts family to act.
