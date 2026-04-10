# CareKaki Speaker Notes

## 1. Title

CareKaki is a voice-first companion for seniors and a care signal layer for families.

Main line: Care without constant calling.

## 2. Problem

Singapore is ageing quickly, and families cannot always call at the exact moment when care signals appear.

The point is not that families do not care. The point is that constant calling can feel intrusive, while not calling can hide medication confusion, loneliness, pain, or dizziness.

## 3. Solution

CareKaki lets the senior speak naturally. The app turns ordinary conversation into useful signals for the family.

Grandpa gets companionship. The family gets context only when it matters.

## 4. Demo Story

The demo follows Grandpa Lim at home in Tampines.

He starts with kopi and lunch. CareKaki asks gently about food and medicine. Later it remembers knee soreness, notices loneliness, and then detects a medication risk when Grandpa says he may have taken the night pill twice and feels dizzy.

## 5. Product

There are three demo surfaces: the senior app, the family app, and a presenter demo view.

The live voice path is the main demo, but the scripted demo beats make the presentation reliable if venue microphone permissions or audio timing fail.

## 6. Architecture

Agora is central to the product.

The browser joins an Agora RTC channel. The Python backend generates the RTC and RTM tokens and starts the Agora Conversational AI agent. The agent joins the same room through Agent Builder pipeline mode for STT, LLM, and TTS.

The caregiver dashboard is derived from the transcript and care signal rules.

## 7. Safety

CareKaki does not diagnose or prescribe.

For risky situations like medication uncertainty with dizziness, it gives conservative safety language: do not take another pill, sit down, keep the phone nearby, and alert family.

## 8. Readiness

The integration has been verified locally. The backend can start a running Agora agent, backend tests pass, and frontend lint/build pass.

The remaining live check is manual Chrome microphone testing before recording.

## 9. Close

CareKaki is the voice check-in between family calls: companionship for seniors, concise care context for families, and a real-time Agora voice AI implementation for the hackathon.
