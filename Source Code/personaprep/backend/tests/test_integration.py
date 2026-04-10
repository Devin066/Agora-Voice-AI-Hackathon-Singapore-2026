"""Integration tests that walk the full frontend→backend flow.

Runs against the actual FastAPI app in stub-Agora mode, asserting response
shapes match the frontend TypeScript contract defined in
`frontend/src/types/api.ts`. The only mocked dependency is `generate_feedback`
(to avoid a real OpenAI call).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set env before importing server — must include stub flag so _join_convoai_agent
# short-circuits without a network call.
os.environ["PP_APP_ID"] = "abcdef0123456789abcdef0123456789"
os.environ["PP_APP_CERTIFICATE"] = "abcdef0123456789abcdef0123456789"
os.environ["PP_PIPELINE_ID"] = "test_pipeline"
os.environ["PP_LLM_API_KEY"] = "sk-test"
os.environ["PP_LLM_MODEL"] = "gpt-4o-mini"
os.environ["PP_TUNNEL_URL"] = "https://test.trycloudflare.com"
os.environ["PP_STUB_AGORA"] = "1"

import pytest
from httpx import ASGITransport, AsyncClient

import server
from session_store import TranscriptTurn, _sessions


# --- Frontend contract shapes (lifted from frontend/src/types/api.ts) ---

START_INTERVIEW_RESPONSE_KEYS = {
    "channel",
    "appid",
    "rtc_token",
    "rtm_token",
    "agent_uid",
    "user_uid",
    "agent_video_uid",
}

FEEDBACK_RESPONSE_KEYS = {
    "overall_score",
    "summary",
    "rubric",
    "strengths",
    "weaknesses",
    "improved_answer_examples",
}

RUBRIC_KEYS = {"clarity", "specificity", "technical_depth", "confidence"}

PERSONA_INFO_KEYS = {"id", "name", "description", "tone_tags"}


@pytest.fixture
def client():
    # Ensure stub mode is on for every integration test
    server.STUB_AGORA = True
    _sessions.clear()
    transport = ASGITransport(app=server.app)
    return AsyncClient(transport=transport, base_url="http://test")


# --- Full-flow integration test ---


@pytest.mark.asyncio
async def test_full_flow_contract(client, monkeypatch):
    """Walk the full setup → interview → feedback flow and verify every response
    shape matches the frontend TypeScript contract field-for-field."""

    # 1. Health check — frontend's first-load smoke signal
    health = await client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    # 2. /personas — SetupPage could fetch this for dynamic listing
    personas = await client.get("/personas")
    assert personas.status_code == 200
    personas_data = personas.json()
    assert "personas" in personas_data
    assert len(personas_data["personas"]) == 4
    for p in personas_data["personas"]:
        assert set(p.keys()) == PERSONA_INFO_KEYS
        assert isinstance(p["tone_tags"], list)

    # 3. POST /start-interview — SetupPage.handleStart
    start = await client.post(
        "/start-interview",
        json={
            "persona_id": "skeptical_technical",
            "role": "AI Engineer",
            "interview_type": "technical",
            "difficulty": "hard",
        },
    )
    assert start.status_code == 200
    session_data = start.json()
    assert set(session_data.keys()) == START_INTERVIEW_RESPONSE_KEYS
    # Tokens look valid
    assert session_data["rtc_token"].startswith("007")
    assert session_data["rtm_token"].startswith("007")
    # Stub mode returns null agent_video_uid
    assert session_data["agent_video_uid"] is None
    # agent_uid and user_uid are strings (JSON serialization matters)
    assert isinstance(session_data["agent_uid"], str)
    assert isinstance(session_data["user_uid"], str)

    channel = session_data["channel"]

    # 4. /session/{channel} — debug endpoint, shows backend state
    session_debug = await client.get(f"/session/{channel}")
    assert session_debug.status_code == 200
    debug_data = session_debug.json()
    assert debug_data["channel"] == channel
    assert debug_data["persona_id"] == "skeptical_technical"
    assert debug_data["role"] == "AI Engineer"
    # stub agent_id prefix
    assert debug_data["agent_id"].startswith("stub_agent_")

    # 5. Seed transcript manually — simulates what the LLM proxy would populate
    # during a real voice call (tests for that flow live in test_server.py and
    # test_llm_proxy.py; here we just need the /feedback endpoint to have data)
    real_session = server.get_session(channel)
    real_session.transcript = [
        TranscriptTurn(
            role="interviewer",
            text="Tell me about a distributed system you built end-to-end.",
            turn_id=1,
            timestamp=1.0,
        ),
        TranscriptTurn(
            role="candidate",
            text="I built a data ingestion pipeline at my last job handling 2M events/min.",
            turn_id=2,
            timestamp=2.0,
        ),
        TranscriptTurn(
            role="interviewer",
            text="Be specific — what was the actual bottleneck?",
            turn_id=3,
            timestamp=3.0,
        ),
        TranscriptTurn(
            role="candidate",
            text="The Kafka consumer lag spiked during traffic surges.",
            turn_id=4,
            timestamp=4.0,
        ),
    ]

    # 6. POST /stop-interview — InterviewPage.handleEnd
    stop = await client.post("/stop-interview", params={"channel": channel})
    assert stop.status_code == 200
    assert stop.json() == {"ok": True}

    # 7. GET /feedback — FeedbackPage on mount
    # Mock generate_feedback to avoid a real OpenAI call
    async def mock_generate_feedback(session):
        return {
            "overall_score": 7.5,
            "summary": "Strong technical grounding with room for quantification.",
            "rubric": {
                "clarity": 8.0,
                "specificity": 6.5,
                "technical_depth": 8.0,
                "confidence": 7.5,
            },
            "strengths": [
                "Clear problem framing",
                "Good use of quantitative scale (2M events/min)",
            ],
            "weaknesses": [
                "Did not explain the fix for Kafka lag",
                "Bottleneck root cause stayed at surface level",
            ],
            "improved_answer_examples": [
                {
                    "question": "What was the actual bottleneck?",
                    "suggestion": "Lead with the root cause, then quantify: "
                    "'Consumer lag hit 45s during surges because each partition had only "
                    "one worker. I added auto-scaling based on lag threshold, dropping "
                    "p99 lag to 2s.'",
                },
            ],
        }

    monkeypatch.setattr(server, "generate_feedback", mock_generate_feedback)

    feedback = await client.get("/feedback", params={"channel": channel})
    assert feedback.status_code == 200
    fb_data = feedback.json()

    # Contract shape — exact match required by frontend FeedbackResponse type
    assert set(fb_data.keys()) == FEEDBACK_RESPONSE_KEYS
    assert set(fb_data["rubric"].keys()) == RUBRIC_KEYS

    # Types
    assert isinstance(fb_data["overall_score"], (int, float))
    assert isinstance(fb_data["summary"], str)
    assert isinstance(fb_data["strengths"], list)
    assert isinstance(fb_data["weaknesses"], list)
    assert isinstance(fb_data["improved_answer_examples"], list)

    # Every rubric value is numeric
    for key in RUBRIC_KEYS:
        assert isinstance(fb_data["rubric"][key], (int, float))

    # Every improved_answer_example has the right shape
    for example in fb_data["improved_answer_examples"]:
        assert set(example.keys()) == {"question", "suggestion"}
        assert isinstance(example["question"], str)
        assert isinstance(example["suggestion"], str)


@pytest.mark.asyncio
async def test_stub_mode_produces_usable_session(client):
    """Verify PP_STUB_AGORA=1 path returns everything the frontend needs without
    any real network calls. This is the 'local dev without credentials' path."""
    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "friendly_recruiter",
            "role": "Product Manager",
            "interview_type": "behavioral",
            "difficulty": "easy",
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    # Shape match
    assert set(data.keys()) == START_INTERVIEW_RESPONSE_KEYS
    # Stub mode leaves valid token strings so the frontend can at least boot Agora SDK
    assert len(data["rtc_token"]) > 0
    assert len(data["rtm_token"]) > 0
    # Agent id in session store has the stub prefix (so a dev can recognize it)
    real_session = server.get_session(data["channel"])
    assert real_session.agent_id.startswith("stub_agent_")


@pytest.mark.asyncio
async def test_cors_headers_present_for_vite_origin(client):
    """CORS preflight from http://localhost:5173 (Vite default) should succeed."""
    resp = await client.options(
        "/start-interview",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    # FastAPI CORSMiddleware answers 200 with allow-origin on preflight
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.asyncio
async def test_start_interview_rejects_unknown_persona(client):
    """Frontend type constrains persona_id to 4 values — server must also reject."""
    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "evil_clown",
            "role": "SWE",
            "interview_type": "technical",
            "difficulty": "easy",
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_full_flow_persona_variants(client, monkeypatch):
    """Walk the happy path for each of the 4 personas. Locks down the contract
    across all persona_id enum values."""
    async def mock_gen(session):
        return {
            "overall_score": 6.0,
            "summary": "x",
            "rubric": {"clarity": 6, "specificity": 6, "technical_depth": 6, "confidence": 6},
            "strengths": [],
            "weaknesses": [],
            "improved_answer_examples": [],
        }
    monkeypatch.setattr(server, "generate_feedback", mock_gen)

    for persona_id in [
        "skeptical_technical",
        "friendly_recruiter",
        "startup_founder",
        "senior_hiring_manager",
    ]:
        start = await client.post("/start-interview", json={
            "persona_id": persona_id,
            "role": "SWE",
            "interview_type": "technical",
            "difficulty": "medium",
        })
        assert start.status_code == 200, f"{persona_id} start failed"
        channel = start.json()["channel"]

        # Seed minimum viable transcript
        server.get_session(channel).transcript = [
            TranscriptTurn(role="candidate", text="ok", turn_id=1, timestamp=1.0),
        ]

        fb = await client.get("/feedback", params={"channel": channel})
        assert fb.status_code == 200, f"{persona_id} feedback failed"
        assert set(fb.json().keys()) == FEEDBACK_RESPONSE_KEYS
