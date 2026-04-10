import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Set env vars before importing server
os.environ.setdefault("PP_APP_ID", "abcdef0123456789abcdef0123456789")
os.environ.setdefault("PP_APP_CERTIFICATE", "abcdef0123456789abcdef0123456789")
os.environ.setdefault("PP_PIPELINE_ID", "test_pipeline_id")
os.environ.setdefault("PP_LLM_API_KEY", "sk-test")
os.environ.setdefault("PP_LLM_MODEL", "gpt-4o-mini")
os.environ.setdefault("PP_TUNNEL_URL", "https://test.trycloudflare.com")
os.environ.setdefault("CONVOAI_BASE_URL", "https://api.agora.io/api/conversational-ai-agent/v2")

import httpx
import pytest
from httpx import AsyncClient, ASGITransport
from server import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_personas_returns_four(client):
    resp = await client.get("/personas")
    assert resp.status_code == 200
    data = resp.json()
    assert "personas" in data
    assert len(data["personas"]) == 4


@pytest.mark.asyncio
async def test_personas_have_required_fields(client):
    resp = await client.get("/personas")
    for p in resp.json()["personas"]:
        assert "id" in p
        assert "name" in p
        assert "description" in p
        assert "tone_tags" in p


@pytest.mark.asyncio
async def test_start_interview_returns_correct_shape(client, monkeypatch):
    # Mock the Agora ConvoAI join call so we don't hit the real API
    import server

    async def mock_join_agent(*args, **kwargs):
        return "mock_agent_id_123"

    monkeypatch.setattr(server, "_join_convoai_agent", mock_join_agent)

    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "skeptical_technical",
            "role": "AI Engineer",
            "interview_type": "technical",
            "difficulty": "hard",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Exact key set that the frontend StartInterviewResponse type expects
    assert set(data.keys()) == {
        "channel", "appid", "rtc_token", "rtm_token",
        "agent_uid", "user_uid", "agent_video_uid",
    }
    # agent_video_uid is null until avatar feature is enabled
    assert data["agent_video_uid"] is None


@pytest.mark.asyncio
async def test_start_interview_tokens_start_with_007(client, monkeypatch):
    import server

    async def mock_join_agent(*args, **kwargs):
        return "mock_agent_id_123"

    monkeypatch.setattr(server, "_join_convoai_agent", mock_join_agent)

    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "friendly_recruiter",
            "role": "Product Manager",
            "interview_type": "behavioral",
            "difficulty": "easy",
        },
    )
    data = resp.json()
    assert data["rtc_token"].startswith("007")
    assert data["rtm_token"].startswith("007")


@pytest.mark.asyncio
async def test_start_interview_invalid_persona_returns_400(client):
    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "nonexistent_persona",
            "role": "SWE",
            "interview_type": "technical",
            "difficulty": "easy",
        },
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_stop_interview_unknown_channel_returns_404(client):
    resp = await client.post("/stop-interview", params={"channel": "nonexistent"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_debug_seed_transcript_populates_session(client, monkeypatch):
    """POST /debug/seed-transcript should inject a sample transcript into an
    existing session when STUB_AGORA is enabled. Used for integration testing
    without a real Agora voice loop."""
    import server
    from session_store import get_session

    monkeypatch.setattr(server, "STUB_AGORA", True)

    async def mock_join(*a, **kw):
        return "stub_agent_integration"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    # Start a session
    resp = await client.post("/start-interview", json={
        "persona_id": "skeptical_technical",
        "role": "AI Engineer",
        "interview_type": "technical",
        "difficulty": "hard",
    })
    channel = resp.json()["channel"]
    assert len(get_session(channel).transcript) == 0

    # Seed it
    seed_resp = await client.post(f"/debug/seed-transcript?channel={channel}")
    assert seed_resp.status_code == 200
    body = seed_resp.json()
    assert body["ok"] is True
    assert body["turns"] >= 4  # at least 4 turns seeded

    # Session now has a transcript with both interviewer and candidate turns
    session = get_session(channel)
    assert len(session.transcript) >= 4
    roles = {t.role for t in session.transcript}
    assert roles == {"interviewer", "candidate"}


@pytest.mark.asyncio
async def test_debug_seed_transcript_404_for_unknown_channel(client, monkeypatch):
    import server
    monkeypatch.setattr(server, "STUB_AGORA", True)

    resp = await client.post("/debug/seed-transcript?channel=nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_debug_seed_transcript_blocked_when_stub_disabled(client, monkeypatch):
    """Must 403 when STUB_AGORA is not enabled — prevents accidental
    production use."""
    import server
    monkeypatch.setattr(server, "STUB_AGORA", False)

    resp = await client.post("/debug/seed-transcript?channel=anything")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_session_debug_endpoint(client, monkeypatch):
    import server

    async def mock_join_agent(*args, **kwargs):
        return "mock_agent_id_123"

    monkeypatch.setattr(server, "_join_convoai_agent", mock_join_agent)

    # Start an interview to create a session
    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "startup_founder",
            "role": "SWE",
            "interview_type": "technical",
            "difficulty": "medium",
        },
    )
    channel = resp.json()["channel"]

    # Fetch session debug
    resp2 = await client.get(f"/session/{channel}")
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["channel"] == channel
    assert data["persona_id"] == "startup_founder"
    assert data["role"] == "SWE"


@pytest.mark.asyncio
async def test_session_debug_unknown_returns_404(client):
    resp = await client.get("/session/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_chat_completions_forwards_to_openai(client, monkeypatch):
    """Test that /chat/completions calls forward_to_openai and returns a streaming response."""
    from fastapi.responses import StreamingResponse

    captured_body = {}

    async def mock_forward(body):
        captured_body.update(body)

        async def fake_stream():
            yield b'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
            yield b"data: [DONE]\n\n"

        return StreamingResponse(fake_stream(), media_type="text/event-stream")

    import server
    monkeypatch.setattr(server, "forward_to_openai", mock_forward)

    resp = await client.post(
        "/chat/completions",
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
            "params": {"turn_id": 1, "channel": "testch"},
        },
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    # The body passed to forward_to_openai should include the params (proxy decides what to strip)
    assert captured_body["model"] == "gpt-4o-mini"
    assert captured_body["params"]["channel"] == "testch"


@pytest.mark.asyncio
async def test_chat_completions_route_exists(client, monkeypatch):
    """Verify the route is registered and accepts POST."""
    from fastapi.responses import StreamingResponse
    import server

    async def mock_forward(body):
        async def empty():
            yield b""
        return StreamingResponse(empty(), media_type="text/event-stream")

    monkeypatch.setattr(server, "forward_to_openai", mock_forward)

    resp = await client.post("/chat/completions", json={"model": "test", "messages": []})
    assert resp.status_code == 200


# --- Phase 3: Persona injection end-to-end ---


@pytest.mark.asyncio
async def test_chat_completions_injects_persona_and_updates_transcript(client, monkeypatch):
    """Full Phase 3 flow: start interview → POST /chat/completions → transcript updated."""
    import llm_proxy
    import server
    from session_store import get_session

    # Mock Agora join
    async def mock_join_agent(*args, **kwargs):
        return "mock_agent_xyz"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join_agent)

    # Capture what gets forwarded to OpenAI + return a fake SSE stream
    captured = {}

    async def fake_stream(body):
        captured["body"] = body
        # Yield a realistic SSE stream
        yield b'data: {"choices":[{"delta":{"content":"Tell me about"}}]}\n\n'
        yield b'data: {"choices":[{"delta":{"content":" your last project."}}]}\n\n'
        yield b"data: [DONE]\n\n"

    monkeypatch.setattr(llm_proxy, "stream_llm_response", fake_stream)

    # 1. Start interview
    resp = await client.post(
        "/start-interview",
        json={
            "persona_id": "skeptical_technical",
            "role": "AI Engineer",
            "interview_type": "technical",
            "difficulty": "hard",
        },
    )
    channel = resp.json()["channel"]

    # 2. POST /chat/completions simulating what Agora would send
    chat_resp = await client.post(
        "/chat/completions",
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "Hi there"}],
            "stream": True,
            "params": {"channel": channel, "turn_id": 1, "timestamp": 0},
        },
    )
    assert chat_resp.status_code == 200

    # Force the streaming generator to fully consume so the transcript update runs
    async for _ in chat_resp.aiter_bytes():
        pass

    # 3. Verify: persona prompt was injected as first system message
    injected_messages = captured["body"]["messages"]
    assert injected_messages[0]["role"] == "system"
    system_content = injected_messages[0]["content"]
    assert "AI Engineer" in system_content  # from context block
    assert "technical" in system_content
    # The full persona prompt should be in there — check for persona-specific content
    assert "AI-generated mock interview persona" in system_content
    assert "do NOT break character" in system_content.lower() or "Do NOT break character" in system_content
    # Original user message is preserved
    assert injected_messages[-1] == {"role": "user", "content": "Hi there"}

    # 4. Verify: Agora params stripped before forwarding
    assert "params" not in captured["body"]

    # 5. Verify: session transcript updated after stream completed
    # Transcript contains both candidate and interviewer turns
    session = get_session(channel)
    assert session is not None
    assert len(session.transcript) == 2
    assert session.transcript[0].role == "candidate"
    assert session.transcript[0].text == "Hi there"
    assert session.transcript[1].role == "interviewer"
    assert session.transcript[1].text == "Tell me about your last project."
    assert session.question_count == 1


@pytest.mark.asyncio
async def test_join_convoai_payload_matches_critical_gotchas(monkeypatch):
    """Lock down the Agora /join payload shape: string UIDs, array uids, RTM flags."""
    import server

    # Force real (non-stub) path
    monkeypatch.setattr(server, "STUB_AGORA", False)

    captured = {}

    class FakeResponse:
        status_code = 200
        def raise_for_status(self):
            pass
        def json(self):
            return {"agent_id": "fake_agent_xyz"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return FakeResponse()

    monkeypatch.setattr(server.httpx, "AsyncClient", FakeClient)

    agent_id = await server._join_convoai_agent(
        "testchannel", "fake_rtc_token", "fake_auth_token", "fake system prompt"
    )
    assert agent_id == "fake_agent_xyz"

    payload = captured["json"]
    # Critical gotchas from the plan
    assert payload["properties"]["agent_rtc_uid"] == "personaprep_agent", "non-numeric string account"
    assert isinstance(payload["properties"]["agent_rtc_uid"], str)
    assert payload["properties"]["enable_string_uid"] is True, "must be true for string UIDs"
    assert payload["properties"]["remote_rtc_uids"] == ["*"], "must be array"
    assert isinstance(payload["properties"]["remote_rtc_uids"], list)
    assert payload["advanced_features"]["enable_rtm"] is True
    assert payload["parameters"]["data_channel"] == "rtm"
    # LLM routing
    assert payload["properties"]["llm"]["vendor"] == "custom"
    assert payload["properties"]["llm"]["url"].endswith("/chat/completions")
    # Unique name
    assert payload["name"].startswith("personaprep_")
    # Authorization header
    assert captured["headers"]["Authorization"].startswith("agora token=")


@pytest.mark.asyncio
async def test_join_convoai_maps_agora_error_to_502(monkeypatch):
    """A 4xx/5xx from Agora must become a 502, not a bare 500."""
    import server

    monkeypatch.setattr(server, "STUB_AGORA", False)

    class FakeResponse:
        status_code = 401
        text = "invalid token"
        def raise_for_status(self):
            raise httpx.HTTPStatusError("401", request=None, response=self)
        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def post(self, url, json=None, headers=None):
            return FakeResponse()

    monkeypatch.setattr(server.httpx, "AsyncClient", FakeClient)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await server._join_convoai_agent("ch", "rtc_tok", "auth_tok", "prompt")
    assert exc_info.value.status_code == 502


@pytest.mark.asyncio
async def test_join_convoai_retries_on_409_collision(monkeypatch):
    """A 409 from Agora (agent name collision) should trigger a retry with a new name."""
    import server

    monkeypatch.setattr(server, "STUB_AGORA", False)

    call_count = {"n": 0}
    seen_names: list[str] = []

    class FakeResponse:
        def __init__(self, status, body=""):
            self.status_code = status
            self.text = body
        def raise_for_status(self):
            if self.status_code >= 400:
                raise httpx.HTTPStatusError(str(self.status_code), request=None, response=self)
        def json(self):
            return {"agent_id": "retry_success"}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def post(self, url, json=None, headers=None):
            call_count["n"] += 1
            seen_names.append(json["name"])
            # First two calls collide, third succeeds
            if call_count["n"] < 3:
                return FakeResponse(409, "agent name already exists")
            return FakeResponse(200)

    monkeypatch.setattr(server.httpx, "AsyncClient", FakeClient)

    agent_id = await server._join_convoai_agent("ch", "rtc_tok", "auth_tok", "prompt")
    assert agent_id == "retry_success"
    assert call_count["n"] == 3
    # Each retry used a different agent name
    assert len(set(seen_names)) == 3


@pytest.mark.asyncio
async def test_join_convoai_gives_up_after_max_retries(monkeypatch):
    """After MAX_409_RETRIES of 409s, raise 502."""
    import server

    monkeypatch.setattr(server, "STUB_AGORA", False)

    class FakeResponse:
        status_code = 409
        text = "always collide"
        def raise_for_status(self):
            raise httpx.HTTPStatusError("409", request=None, response=self)
        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass
        async def __aenter__(self):
            return self
        async def __aexit__(self, *a):
            pass
        async def post(self, url, json=None, headers=None):
            return FakeResponse()

    monkeypatch.setattr(server.httpx, "AsyncClient", FakeClient)

    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        await server._join_convoai_agent("ch", "rtc_tok", "auth_tok", "prompt")
    assert exc_info.value.status_code == 502
    # The exhaustion-branch error message must be emitted, not the generic one
    assert "after" in exc_info.value.detail.lower()
    assert "retries" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_stub_mode_returns_mock_app_id(client, monkeypatch):
    """In stub mode, backend must return appid='mock_app_id' so the frontend's
    VoiceSession.isMock detection skips real Agora RTM/RTC connection
    (which would fail with dummy credentials)."""
    import server
    monkeypatch.setattr(server, "STUB_AGORA", True)

    resp = await client.post("/start-interview", json={
        "persona_id": "skeptical_technical",
        "role": "AI Engineer",
        "interview_type": "technical",
        "difficulty": "hard",
    })
    assert resp.status_code == 200
    assert resp.json()["appid"] == "mock_app_id"


@pytest.mark.asyncio
async def test_non_stub_mode_returns_real_app_id(client, monkeypatch):
    """Outside of stub mode, the backend must return the real PP_APP_ID."""
    import server
    monkeypatch.setattr(server, "STUB_AGORA", False)
    monkeypatch.setattr(server, "APP_ID", "real_app_id_xyz")

    async def mock_join(*a, **kw):
        return "agent_abc"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    resp = await client.post("/start-interview", json={
        "persona_id": "skeptical_technical",
        "role": "AI Engineer",
        "interview_type": "technical",
        "difficulty": "hard",
    })
    assert resp.status_code == 200
    assert resp.json()["appid"] == "real_app_id_xyz"


@pytest.mark.asyncio
async def test_stub_agora_bypasses_network(monkeypatch):
    """PP_STUB_AGORA returns a fake agent_id without hitting the network."""
    import server

    monkeypatch.setattr(server, "STUB_AGORA", True)

    # If this touches the network, the test will hang or fail
    agent_id = await server._join_convoai_agent("ch", "rtc_tok", "auth_tok", "prompt")
    assert agent_id.startswith("stub_agent_")


@pytest.mark.asyncio
async def test_forward_to_openai_strips_params_end_to_end(monkeypatch):
    """Verify the real forward_to_openai path strips params before the httpx call."""
    import llm_proxy

    captured = {}

    async def fake_stream(body):
        # This is called inside forward_to_openai after stripping
        captured["body"] = body
        yield b"data: [DONE]\n\n"

    monkeypatch.setattr(llm_proxy, "stream_llm_response", fake_stream)

    resp = await llm_proxy.forward_to_openai({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "hi"}],
        "params": {"channel": "nochannel", "turn_id": 1},
    })
    # Consume the stream
    async for _ in resp.body_iterator:
        pass

    assert "params" not in captured["body"]
    assert captured["body"]["model"] == "gpt-4o-mini"


@pytest.mark.asyncio
async def test_chat_completions_multi_turn_increments_counter(client, monkeypatch):
    """Multiple sequential turns on the same session should increment question_count."""
    import llm_proxy
    import server
    from session_store import get_session

    async def mock_join_agent(*args, **kwargs):
        return "mock_agent_multi"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join_agent)

    turn_count = {"n": 0}

    async def fake_stream(body):
        turn_count["n"] += 1
        yield f'data: {{"choices":[{{"delta":{{"content":"Question {turn_count["n"]}?"}}}}]}}\n\n'.encode()
        yield b"data: [DONE]\n\n"

    monkeypatch.setattr(llm_proxy, "stream_llm_response", fake_stream)

    # Start interview
    resp = await client.post("/start-interview", json={
        "persona_id": "skeptical_technical",
        "role": "AI Engineer",
        "interview_type": "technical",
        "difficulty": "hard",
    })
    channel = resp.json()["channel"]

    # Three turns
    for _ in range(3):
        r = await client.post("/chat/completions", json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "answer"}],
            "params": {"channel": channel, "turn_id": 1},
        })
        async for _ in r.aiter_bytes():
            pass

    session = get_session(channel)
    assert session.question_count == 3
    # Transcript now contains candidate turns too. Since the same user message
    # is sent each time ("answer"), dedupe keeps just 1 candidate + 3 interviewer turns
    interviewer_turns = [t for t in session.transcript if t.role == "interviewer"]
    assert len(interviewer_turns) == 3
    # questions_asked stores extracted questions
    assert session.questions_asked == ["Question 1?", "Question 2?", "Question 3?"]


@pytest.mark.asyncio
async def test_chat_completions_stream_error_still_commits_partial(client, monkeypatch):
    """If the OpenAI stream errors mid-flight, any captured bytes should still commit."""
    import llm_proxy
    import server
    from session_store import get_session

    async def mock_join_agent(*args, **kwargs):
        return "mock_agent_err"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join_agent)

    async def exploding_stream(body):
        yield b'data: {"choices":[{"delta":{"content":"Partial answer?"}}]}\n\n'
        raise RuntimeError("simulated network drop")

    monkeypatch.setattr(llm_proxy, "stream_llm_response", exploding_stream)

    resp = await client.post("/start-interview", json={
        "persona_id": "friendly_recruiter",
        "role": "SWE",
        "interview_type": "behavioral",
        "difficulty": "easy",
    })
    channel = resp.json()["channel"]

    r = await client.post("/chat/completions", json={
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "hi"}],
        "params": {"channel": channel},
    })
    # Consume the response — the synthetic error SSE should still be yielded
    body_bytes = b""
    async for chunk in r.aiter_bytes():
        body_bytes += chunk

    # Partial content must have been committed despite the error.
    # Transcript has candidate turn + interviewer turn.
    session = get_session(channel)
    assert len(session.transcript) == 2
    interviewer_turns = [t for t in session.transcript if t.role == "interviewer"]
    assert len(interviewer_turns) == 1
    assert "Partial answer" in interviewer_turns[0].text
    assert session.question_count == 1
    # Synthetic error SSE was appended so Agora sees a complete stream
    assert b"[proxy error" in body_bytes or b"[DONE]" in body_bytes


# --- Phase 4: Feedback endpoint ---


@pytest.mark.asyncio
async def test_feedback_returns_404_for_unknown_channel(client):
    resp = await client.get("/feedback", params={"channel": "nonexistent"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_feedback_returns_404_for_empty_transcript(client, monkeypatch):
    """Session exists but transcript is empty."""
    import server

    async def mock_join(*a, **kw):
        return "mock_agent"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    # Create a session with no transcript
    resp = await client.post("/start-interview", json={
        "persona_id": "skeptical_technical",
        "role": "AI Engineer",
        "interview_type": "technical",
        "difficulty": "hard",
    })
    channel = resp.json()["channel"]

    resp2 = await client.get("/feedback", params={"channel": channel})
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_feedback_returns_parsed_response_for_real_session(client, monkeypatch):
    """Full flow: start interview, add transcript, call /feedback."""
    import server
    import feedback
    from session_store import get_session, TranscriptTurn

    async def mock_join(*a, **kw):
        return "mock_agent"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    async def mock_generate(session):
        return {
            "overall_score": 7.6,
            "summary": "Good overall performance.",
            "rubric": {"clarity": 8.0, "specificity": 7.0, "technical_depth": 7.5, "confidence": 8.0},
            "strengths": ["Clear opening"],
            "weaknesses": ["Did not quantify impact"],
            "improved_answer_examples": [
                {"question": "Tell me about X", "suggestion": "Start with the outcome."}
            ],
        }
    monkeypatch.setattr(server, "generate_feedback", mock_generate)

    # Start interview and add a fake transcript
    resp = await client.post("/start-interview", json={
        "persona_id": "skeptical_technical",
        "role": "AI Engineer",
        "interview_type": "technical",
        "difficulty": "hard",
    })
    channel = resp.json()["channel"]
    session = get_session(channel)
    session.transcript = [
        TranscriptTurn(role="interviewer", text="Q1?", turn_id=1, timestamp=1.0),
        TranscriptTurn(role="candidate", text="A1", turn_id=2, timestamp=2.0),
    ]

    resp2 = await client.get("/feedback", params={"channel": channel})
    assert resp2.status_code == 200
    data = resp2.json()
    # Strict contract shape check — all fields the TypeScript contract requires
    assert set(data.keys()) >= {
        "overall_score", "summary", "rubric",
        "strengths", "weaknesses", "improved_answer_examples",
    }
    assert set(data["rubric"].keys()) == {
        "clarity", "specificity", "technical_depth", "confidence"
    }
    assert data["overall_score"] == 7.6
    assert data["rubric"]["clarity"] == 8.0
    assert "Clear opening" in data["strengths"]
    # improved_answer_examples must be a list of {question, suggestion}
    assert data["improved_answer_examples"][0]["question"] == "Tell me about X"
    assert data["improved_answer_examples"][0]["suggestion"] == "Start with the outcome."


@pytest.mark.asyncio
async def test_feedback_maps_network_error_to_502(client, monkeypatch):
    """A network-level httpx error (not HTTPStatusError) should become 502."""
    import server
    from session_store import get_session, TranscriptTurn

    async def mock_join(*a, **kw):
        return "mock_agent"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    async def network_err(session):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr(server, "generate_feedback", network_err)

    resp = await client.post("/start-interview", json={
        "persona_id": "startup_founder",
        "role": "SWE",
        "interview_type": "technical",
        "difficulty": "medium",
    })
    channel = resp.json()["channel"]
    session = get_session(channel)
    session.transcript = [TranscriptTurn(role="interviewer", text="Q?", turn_id=1, timestamp=1.0)]

    resp2 = await client.get("/feedback", params={"channel": channel})
    assert resp2.status_code == 502


@pytest.mark.asyncio
async def test_feedback_maps_http_status_error_to_502(client, monkeypatch):
    """An upstream OpenAI 4xx/5xx should become 502."""
    import server
    from session_store import get_session, TranscriptTurn

    async def mock_join(*a, **kw):
        return "mock_agent"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    class FakeResponse:
        status_code = 500
        text = "openai internal error"

    async def http_err(session):
        raise httpx.HTTPStatusError("500", request=None, response=FakeResponse())
    monkeypatch.setattr(server, "generate_feedback", http_err)

    resp = await client.post("/start-interview", json={
        "persona_id": "senior_hiring_manager",
        "role": "SWE",
        "interview_type": "technical",
        "difficulty": "easy",
    })
    channel = resp.json()["channel"]
    session = get_session(channel)
    session.transcript = [TranscriptTurn(role="interviewer", text="Q?", turn_id=1, timestamp=1.0)]

    resp2 = await client.get("/feedback", params={"channel": channel})
    assert resp2.status_code == 502


@pytest.mark.asyncio
async def test_feedback_maps_generation_error_to_500(client, monkeypatch):
    """If generate_feedback raises ValueError, surface as 500."""
    import server
    from session_store import get_session, TranscriptTurn

    async def mock_join(*a, **kw):
        return "mock_agent"
    monkeypatch.setattr(server, "_join_convoai_agent", mock_join)

    async def broken_generate(session):
        raise ValueError("bad response")
    monkeypatch.setattr(server, "generate_feedback", broken_generate)

    resp = await client.post("/start-interview", json={
        "persona_id": "friendly_recruiter",
        "role": "SWE",
        "interview_type": "behavioral",
        "difficulty": "easy",
    })
    channel = resp.json()["channel"]
    session = get_session(channel)
    session.transcript = [
        TranscriptTurn(role="interviewer", text="Q?", turn_id=1, timestamp=1.0),
    ]

    resp2 = await client.get("/feedback", params={"channel": channel})
    assert resp2.status_code == 500


@pytest.mark.asyncio
async def test_chat_completions_missing_session_still_works(client, monkeypatch):
    """If the channel has no session, proxy should still forward without injection."""
    import llm_proxy

    captured = {}

    async def fake_stream(body):
        captured["body"] = body
        yield b"data: [DONE]\n\n"

    monkeypatch.setattr(llm_proxy, "stream_llm_response", fake_stream)

    resp = await client.post(
        "/chat/completions",
        json={
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "hi"}],
            "params": {"channel": "nonexistent_channel"},
        },
    )
    assert resp.status_code == 200
    async for _ in resp.aiter_bytes():
        pass

    # No persona injection when session is missing
    msgs = captured["body"]["messages"]
    assert msgs == [{"role": "user", "content": "hi"}]
    assert "params" not in captured["body"]
