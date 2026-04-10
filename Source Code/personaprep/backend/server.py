import logging
import os
import uuid
from dataclasses import asdict

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import time

from feedback import generate_feedback
from llm_proxy import forward_to_openai
from personas import PERSONAS, render_system_prompt, load_persona, load_custom_persona, list_all_personas
from session_store import SessionState, TranscriptTurn, create_session, get_session
from tokens import build_agent_rtc_token, build_convoai_token, build_rtc_token, build_rtm_token

# override=True so .env always wins over stale shell exports. In local dev
# the .env file is the intended source of truth, not the shell environment.
load_dotenv(override=True)

logger = logging.getLogger("personaprep")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

APP_ID = os.environ.get("PP_APP_ID", "")
APP_CERT = os.environ.get("PP_APP_CERTIFICATE", "")
PIPELINE_ID = os.environ.get("PP_PIPELINE_ID", "")
LLM_API_KEY = os.environ.get("PP_LLM_API_KEY", "")
LLM_MODEL = os.environ.get("PP_LLM_MODEL", "gpt-4o-mini")
CONVOAI_BASE_URL = os.environ.get(
    "CONVOAI_BASE_URL", "https://api.agora.io/api/conversational-ai-agent/v2"
).rstrip("/")
STUB_AGORA = os.environ.get("PP_STUB_AGORA", "").lower() in ("1", "true", "yes")

# Agent identity string (must be non-numeric to force string-account mode
# on Agora's token validator). The same string goes into:
#   1. `properties.agent_rtc_uid` in the /join payload
#   2. The account field of `properties.token` (the token the agent uses
#      to join the RTC channel, built via build_agent_rtc_token)
#   3. The account field of the Authorization header token (combined RTC+RTM)
# Combined with `properties.enable_string_uid: true`, this tells Agora to
# treat everything as strings rather than integer UIDs.
AGENT_UID = "personaprep_agent"
USER_UID = 101
MAX_409_RETRIES = 3

if not APP_ID or not APP_CERT:
    logger.warning("PP_APP_ID or PP_APP_CERTIFICATE is not set — tokens will be invalid")

app = FastAPI(title="PersonaPrep Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request / Response models ---


class StartInterviewRequest(BaseModel):
    persona_id: str
    role: str
    interview_type: str
    difficulty: str


class StartInterviewResponse(BaseModel):
    channel: str
    appid: str
    rtc_token: str
    rtm_token: str
    agent_uid: str
    user_uid: str
    agent_video_uid: str | None = None  # populated when avatar feature enabled


class FeedbackRubric(BaseModel):
    clarity: float
    specificity: float
    technical_depth: float
    confidence: float


class ImprovedAnswerExample(BaseModel):
    question: str
    suggestion: str


class FeedbackResponse(BaseModel):
    overall_score: float
    summary: str
    rubric: FeedbackRubric
    strengths: list[str] = []
    weaknesses: list[str] = []
    improved_answer_examples: list[ImprovedAnswerExample] = []


# --- Helpers ---


def _build_join_payload(
    channel: str, agent_rtc_token: str, system_prompt: str
) -> dict:
    """Build the ConvoAI /join request payload. Pure function for easy testing.

    Uses vendor: "openai" so Agora calls OpenAI directly — no custom proxy
    or cloudflared tunnel needed.
    """
    agent_name = f"personaprep_{uuid.uuid4().hex[:8]}"
    return {
        "name": agent_name,
        "pipeline_id": PIPELINE_ID,
        "properties": {
            "channel": channel,
            "token": agent_rtc_token,
            "agent_rtc_uid": AGENT_UID,
            "enable_string_uid": True,
            "remote_rtc_uids": ["*"],
            "llm": {
                "model": LLM_MODEL,
                "api_key": LLM_API_KEY,
                "vendor": "openai",
                "system_messages": [{"role": "system", "content": system_prompt}],
                "greeting_message": "Let's get started. Tell me, what brings you here today?",
                "max_history": 12,
            },
        },
        "advanced_features": {"enable_rtm": True},
        "parameters": {"data_channel": "rtm"},
    }


async def _join_convoai_agent(
    channel: str,
    agent_rtc_token: str,
    auth_header_token: str,
    system_prompt: str,
) -> str:
    """Call Agora ConvoAI POST /join. Returns agent_id.

    `agent_rtc_token` goes into `properties.token` — it's the token the agent
    uses to join the RTC channel.

    `auth_header_token` goes into the `Authorization: agora token=...` header
    — it authenticates the REST API call itself. These are two DIFFERENT
    tokens (one scoped to the channel, one scoped to the REST API).

    Retries up to MAX_409_RETRIES times if Agora returns 409 (agent name
    collision) with a freshly generated agent name each time. If PP_STUB_AGORA
    is set, returns a fake agent_id without hitting the network.
    """
    if STUB_AGORA:
        stub_id = f"stub_agent_{uuid.uuid4().hex[:8]}"
        logger.info("PP_STUB_AGORA enabled — returning stub agent_id=%s", stub_id)
        return stub_id

    last_status = None
    last_body = ""

    # Immediate retry with a fresh uuid is safe because collisions come from our own
    # random suffix, not from transient Agora issues — no backoff needed.
    for attempt in range(1, MAX_409_RETRIES + 1):
        payload = _build_join_payload(channel, agent_rtc_token, system_prompt)
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{CONVOAI_BASE_URL}/projects/{APP_ID}/join",
                    json=payload,
                    headers={"Authorization": f"agora token={auth_header_token}"},
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            status = e.response.status_code if e.response is not None else 0
            body = e.response.text[:500] if e.response is not None else ""
            if status == 409:
                last_status, last_body = status, body
                logger.warning(
                    "ConvoAI join 409 collision on attempt %d/%d channel=%s — retrying with new name",
                    attempt, MAX_409_RETRIES, channel,
                )
                continue  # next attempt or loop exit → exhaustion branch below
            logger.error("ConvoAI join failed channel=%s status=%s body=%s", channel, status, body)
            raise HTTPException(
                status_code=502,
                detail=f"Agora ConvoAI /join failed ({status}): {body}",
            )
        except httpx.HTTPError as e:
            logger.error("ConvoAI join network error channel=%s: %s", channel, e)
            raise HTTPException(status_code=502, detail=f"Agora ConvoAI /join network error: {e}")

        agent_id = data.get("agent_id")
        if not agent_id:
            logger.error("ConvoAI join response missing agent_id channel=%s: %s", channel, data)
            raise HTTPException(
                status_code=502, detail="Agora ConvoAI /join response missing agent_id"
            )
        return agent_id

    # Exhausted all retries on 409
    logger.error(
        "ConvoAI join gave up after %d attempts channel=%s (last status=%s body=%s)",
        MAX_409_RETRIES, channel, last_status, last_body,
    )
    raise HTTPException(
        status_code=502,
        detail=f"Agora ConvoAI /join failed after {MAX_409_RETRIES} retries ({last_status}): {last_body}",
    )


# --- Endpoints ---


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/personas")
async def list_personas():
    return {"personas": list_all_personas()}


@app.post("/start-interview", response_model=StartInterviewResponse)
async def start_interview(body: StartInterviewRequest):
    # Check built-in first, then custom
    custom_data = None
    if body.persona_id in PERSONAS:
        system_prompt = render_system_prompt(
            body.persona_id, body.role, body.interview_type, body.difficulty
        )
    else:
        custom_data = load_custom_persona(body.persona_id)
        if not custom_data:
            raise HTTPException(status_code=400, detail=f"Unknown persona_id: {body.persona_id}")
        system_prompt = custom_data.get("system_prompt", "You are an interviewer.")

    channel = uuid.uuid4().hex[:10]
    rtc_token = build_rtc_token(APP_ID, APP_CERT, channel, USER_UID)
    rtm_token = build_rtm_token(APP_ID, APP_CERT, str(USER_UID))
    agent_rtc_token = build_agent_rtc_token(APP_ID, APP_CERT, channel, AGENT_UID)
    auth_header_token = build_convoai_token(APP_ID, APP_CERT, channel, AGENT_UID)

    logger.info(
        "start_interview persona=%s role=%s type=%s difficulty=%s channel=%s",
        body.persona_id, body.role, body.interview_type, body.difficulty, channel,
    )

    agent_id = await _join_convoai_agent(
        channel, agent_rtc_token, auth_header_token, system_prompt
    )

    create_session(
        SessionState(
            channel=channel,
            agent_id=agent_id,
            persona_id=body.persona_id,
            role=body.role,
            interview_type=body.interview_type,
            difficulty=body.difficulty,
        )
    )

    # In stub mode, return a sentinel appid so the frontend's VoiceSession
    # detects mock mode and skips the real Agora RTM/RTC connection (which
    # would fail with dummy credentials).
    response_appid = "mock_app_id" if STUB_AGORA else APP_ID

    return StartInterviewResponse(
        channel=channel,
        appid=response_appid,
        rtc_token=rtc_token,
        rtm_token=rtm_token,
        agent_uid=AGENT_UID,
        user_uid=str(USER_UID),
        agent_video_uid=None,
    )


@app.post("/stop-interview")
async def stop_interview(channel: str = Query(...)):
    session = get_session(channel)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if STUB_AGORA:
        logger.info("PP_STUB_AGORA enabled — skipping Agora /leave for channel=%s", channel)
        return {"ok": True}

    convoai_token = build_convoai_token(APP_ID, APP_CERT, channel, AGENT_UID)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{CONVOAI_BASE_URL}/projects/{APP_ID}/agents/{session.agent_id}/leave",
                headers={"Authorization": f"agora token={convoai_token}"},
            )
            resp.raise_for_status()
    except httpx.HTTPError as e:
        # Best-effort — agent may already be gone. Log so debugging is possible.
        logger.warning("stop_interview /leave failed for channel=%s agent_id=%s: %s",
                       channel, session.agent_id, e)

    return {"ok": True}


@app.post("/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    return await forward_to_openai(body)


class TranscriptEntry(BaseModel):
    role: str  # "interviewer" | "candidate"
    text: str


class FeedbackRequest(BaseModel):
    channel: str
    transcript: list[TranscriptEntry]


@app.post("/transcript")
async def submit_transcript(body: FeedbackRequest):
    """Accept transcript from frontend. Saves it to the session so the
    GET /feedback endpoint can use it for scoring."""
    session = get_session(body.channel)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.transcript = [
        TranscriptTurn(
            role="interviewer" if t.role == "interviewer" else "candidate",
            text=t.text,
            turn_id=i + 1,
            timestamp=0,
        )
        for i, t in enumerate(body.transcript)
    ]
    logger.info("Transcript received for channel=%s turns=%d", body.channel, len(session.transcript))
    return {"ok": True}


@app.get("/feedback", response_model=FeedbackResponse)
async def get_feedback(channel: str = Query(...)):
    """Legacy GET endpoint — works if transcript was captured server-side."""
    session = get_session(channel)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.transcript:
        raise HTTPException(status_code=404, detail="No transcript to evaluate")

    try:
        return await generate_feedback(session)
    except ValueError as e:
        logger.error("Feedback generation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Feedback generation failed: {e}")
    except httpx.HTTPStatusError as e:
        body_text = e.response.text[:300] if e.response is not None else ""
        logger.error("Feedback LLM call failed: %s %s", e.response.status_code, body_text)
        raise HTTPException(
            status_code=502,
            detail=f"Feedback upstream error ({e.response.status_code}): {body_text}",
        )
    except httpx.HTTPError as e:
        logger.error("Feedback network error: %s", e)
        raise HTTPException(status_code=502, detail=f"Feedback network error: {e}")


# --- Custom Persona Build ---


class PersonaBuildRequest(BaseModel):
    name: str
    sources: list[dict]
    photo_url: str | None = None


@app.post("/personas/build")
async def build_persona(body: PersonaBuildRequest):
    from persona_builder import start_build
    job_id = start_build(body.name, body.sources, body.photo_url)
    return {"job_id": job_id}


@app.get("/personas/build/{job_id}")
async def get_build_status(job_id: str):
    from persona_builder import get_job
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Build job not found")
    return {
        "status": job.status,
        "progress_label": job.progress_label,
        "persona_id": job.persona_id,
        "error": job.error,
    }


@app.delete("/personas/{persona_id}")
async def delete_persona(persona_id: str):
    import os
    from personas import CUSTOM_PERSONAS_DIR
    path = os.path.join(CUSTOM_PERSONAS_DIR, f"{persona_id}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Custom persona not found")
    os.remove(path)
    return {"ok": True}


# --- Debug ---


@app.get("/session/{channel}")
async def get_session_debug(channel: str):
    session = get_session(channel)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return asdict(session)


# Sample transcript used by /debug/seed-transcript — lets the frontend flow
# reach a populated feedback page without a real Agora voice loop.
_SAMPLE_TRANSCRIPT = [
    ("interviewer", "Tell me about a distributed system you built end-to-end."),
    ("candidate",
     "I built a Kafka ingestion pipeline at my last job handling about 2 million events per minute. "
     "We used Kafka for transport and Flink for stream processing."),
    ("interviewer", "What was the actual bottleneck under load?"),
    ("candidate",
     "Consumer lag would spike during traffic surges because partitions only had one worker each. "
     "I added autoscaling based on a lag threshold, which dropped p99 lag from around 45 seconds to 2 seconds."),
    ("interviewer", "What tradeoff did you make on consistency vs. latency?"),
    ("candidate",
     "We chose eventual consistency because our SLA required p99 under 200ms. "
     "We mitigated stale reads with a 500ms client-side cache TTL."),
]


@app.post("/debug/seed-transcript")
async def debug_seed_transcript(channel: str = Query(...)):
    """Inject a sample interview transcript into a live session.

    Only works when PP_STUB_AGORA=1. Use this to test the full frontend ↔
    backend integration without a real Agora voice loop — start a session
    via the UI, call this, then hit the feedback page to see real
    Gemini-scored results.
    """
    if not STUB_AGORA:
        raise HTTPException(
            status_code=403,
            detail="Debug seed is only available when PP_STUB_AGORA=1",
        )
    session = get_session(channel)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = time.time()
    session.transcript = []
    session.question_count = 0
    session.questions_asked = []
    for idx, (role, text) in enumerate(_SAMPLE_TRANSCRIPT, start=1):
        session.transcript.append(
            TranscriptTurn(role=role, text=text, turn_id=idx, timestamp=now + idx)
        )
        if role == "interviewer":
            session.question_count += 1
            session.questions_asked.append(text)

    logger.info("Seeded sample transcript for channel=%s turns=%d",
                channel, len(session.transcript))
    return {"ok": True, "channel": channel, "turns": len(session.transcript)}
