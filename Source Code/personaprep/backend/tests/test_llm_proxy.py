import os
import sys
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("PP_APP_ID", "abcdef0123456789abcdef0123456789")
os.environ.setdefault("PP_APP_CERTIFICATE", "abcdef0123456789abcdef0123456789")
os.environ.setdefault("PP_PIPELINE_ID", "test_pipeline_id")
os.environ.setdefault("PP_LLM_API_KEY", "sk-test")
os.environ.setdefault("PP_LLM_MODEL", "gpt-4o-mini")
os.environ.setdefault("PP_TUNNEL_URL", "https://test.trycloudflare.com")

import pytest

from llm_proxy import (
    strip_agora_params,
    build_llm_headers,
    LLM_CHAT_URL,
    DEFAULT_LLM_BASE_URL,
    extract_channel,
    build_context_block,
    build_injected_messages,
    parse_sse_content,
    extract_question,
    _commit_turn,
    capture_candidate_turn,
)
from session_store import SessionState, TranscriptTurn


class TestStripAgoraParams:
    def test_removes_params_key(self):
        body = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "hello"}],
            "stream": True,
            "params": {"turn_id": 3, "timestamp": 1712345678, "channel": "abc123"},
        }
        cleaned, params = strip_agora_params(body)
        assert "params" not in cleaned
        assert params["channel"] == "abc123"
        assert params["turn_id"] == 3

    def test_preserves_messages_and_model(self):
        body = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "hi"}],
            "stream": True,
            "params": {"channel": "x"},
        }
        cleaned, _ = strip_agora_params(body)
        assert cleaned["model"] == "gpt-4o-mini"
        assert cleaned["messages"] == [{"role": "user", "content": "hi"}]
        assert cleaned["stream"] is True

    def test_handles_missing_params(self):
        body = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": "hi"}],
        }
        cleaned, params = strip_agora_params(body)
        assert params == {}
        assert cleaned["model"] == "gpt-4o-mini"

    def test_does_not_mutate_original(self):
        body = {
            "model": "gpt-4o-mini",
            "messages": [],
            "params": {"channel": "ch1"},
        }
        original_keys = set(body.keys())
        strip_agora_params(body)
        assert set(body.keys()) == original_keys  # original unchanged


class TestBuildLlmHeaders:
    def test_contains_auth_and_content_type(self):
        headers = build_llm_headers("sk-testkey")
        assert headers["Authorization"] == "Bearer sk-testkey"
        assert headers["Content-Type"] == "application/json"


class TestLlmChatUrl:
    def test_url_points_to_chat_completions(self):
        assert LLM_CHAT_URL.endswith("/chat/completions")

    def test_default_base_url_is_gemini(self):
        # Default base URL should be Gemini's OpenAI-compat endpoint so
        # Google AI Studio free tier can be used out of the box.
        assert "generativelanguage.googleapis.com" in DEFAULT_LLM_BASE_URL
        assert "openai" in DEFAULT_LLM_BASE_URL  # the /openai/ compat path


# --- Phase 3: Persona injection helpers ---


def _make_session(**overrides) -> SessionState:
    defaults = dict(
        channel="ch123",
        agent_id="agent_x",
        persona_id="skeptical_technical",
        role="AI Engineer",
        interview_type="technical",
        difficulty="hard",
    )
    defaults.update(overrides)
    return SessionState(**defaults)


class TestExtractChannel:
    def test_extracts_channel_from_params(self):
        body = {"messages": [], "params": {"channel": "abc123", "turn_id": 1}}
        assert extract_channel(body) == "abc123"

    def test_missing_params_returns_none(self):
        body = {"messages": []}
        assert extract_channel(body) is None

    def test_missing_channel_in_params_returns_none(self):
        body = {"messages": [], "params": {"turn_id": 1}}
        assert extract_channel(body) is None


class TestBuildContextBlock:
    def test_includes_session_fields(self):
        session = _make_session(role="SWE", interview_type="behavioral", difficulty="medium")
        block = build_context_block(session)
        assert "SWE" in block
        assert "behavioral" in block
        assert "medium" in block

    def test_opening_instruction_when_no_questions(self):
        session = _make_session(question_count=0)
        block = build_context_block(session)
        assert "opening" in block.lower()

    def test_continue_instruction_when_some_questions(self):
        session = _make_session(question_count=2)
        block = build_context_block(session)
        assert "continue" in block.lower() or "follow up" in block.lower()

    def test_wrap_up_instruction_at_threshold_4(self):
        session = _make_session(question_count=4)
        block = build_context_block(session)
        assert "wrap" in block.lower() or "final" in block.lower()

    def test_wrap_up_instruction_when_many_questions(self):
        session = _make_session(question_count=6)
        block = build_context_block(session)
        assert "wrap" in block.lower() or "final" in block.lower()

    def test_continue_branch_does_not_include_wrap_up_at_3(self):
        session = _make_session(question_count=3)
        block = build_context_block(session).lower()
        assert "wrap" not in block
        assert "continue" in block

    def test_previous_questions_truncated_to_last_3(self):
        session = _make_session(
            question_count=10,
            questions_asked=["q1", "q2", "q3", "q4", "q5"],
        )
        block = build_context_block(session)
        assert "q5" in block
        assert "q4" in block
        assert "q3" in block
        assert "q1" not in block  # beyond last 3


class TestBuildInjectedMessages:
    def test_prepends_system_message(self):
        session = _make_session()
        original = [{"role": "user", "content": "hi"}]
        result = build_injected_messages(session, original)
        assert result[0]["role"] == "system"
        assert len(result) == 2
        assert result[1] == {"role": "user", "content": "hi"}

    def test_system_message_includes_persona_and_context(self):
        session = _make_session(role="Product Manager", interview_type="recruiter_screen")
        result = build_injected_messages(session, [])
        system_content = result[0]["content"]
        # Contains persona-derived content
        assert "AI" in system_content  # from persona prompt disclaimer
        # Contains context block
        assert "Product Manager" in system_content
        assert "recruiter_screen" in system_content

    def test_skeptical_technical_prompt_differs_from_friendly(self):
        s1 = _make_session(persona_id="skeptical_technical")
        s2 = _make_session(persona_id="friendly_recruiter")
        p1 = build_injected_messages(s1, [])[0]["content"]
        p2 = build_injected_messages(s2, [])[0]["content"]
        assert p1 != p2

    def test_preserves_original_messages_order(self):
        session = _make_session()
        original = [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "second"},
            {"role": "user", "content": "third"},
        ]
        result = build_injected_messages(session, original)
        assert result[1:] == original


class TestExtractQuestion:
    def test_extracts_last_question_from_reply(self):
        text = "Thanks for sharing. Tell me more. What was the actual bottleneck?"
        assert extract_question(text) == "What was the actual bottleneck?"

    def test_picks_last_question_when_multiple(self):
        text = "What did you build? Did it work? How did you measure impact?"
        result = extract_question(text)
        assert "How did you measure impact?" in result

    def test_falls_back_to_truncated_text_when_no_question_mark(self):
        text = "Let's begin by describing your role on the team."
        assert extract_question(text) == text

    def test_truncates_long_replies(self):
        text = "a" * 500 + "?"
        result = extract_question(text, max_chars=50)
        assert len(result) <= 50
        assert result.endswith("…")

    def test_empty_string_returns_empty(self):
        assert extract_question("") == ""


class TestCaptureCandidateTurn:
    def _session(self):
        return SessionState(
            channel="ch",
            agent_id="a",
            persona_id="skeptical_technical",
            role="SWE",
            interview_type="technical",
            difficulty="hard",
        )

    def test_captures_last_user_message(self):
        session = self._session()
        messages = [
            {"role": "system", "content": "..."},
            {"role": "assistant", "content": "Tell me about yourself."},
            {"role": "user", "content": "I'm a senior SWE with 5 years of experience."},
        ]
        capture_candidate_turn(session, messages)
        assert len(session.transcript) == 1
        assert session.transcript[0].role == "candidate"
        assert session.transcript[0].text == "I'm a senior SWE with 5 years of experience."

    def test_no_user_message_does_nothing(self):
        session = self._session()
        messages = [{"role": "assistant", "content": "Hello."}]
        capture_candidate_turn(session, messages)
        assert session.transcript == []

    def test_empty_messages_does_nothing(self):
        session = self._session()
        capture_candidate_turn(session, [])
        assert session.transcript == []

    def test_does_not_duplicate_same_message(self):
        """If the same user message is sent twice (e.g. retries), don't double-append."""
        session = self._session()
        messages = [{"role": "user", "content": "Hi"}]
        capture_candidate_turn(session, messages)
        capture_candidate_turn(session, messages)
        assert len(session.transcript) == 1

    def test_appends_new_user_message_after_interviewer(self):
        session = self._session()
        # Simulate: user, interviewer, user (new candidate turn)
        capture_candidate_turn(session, [{"role": "user", "content": "first"}])
        session.transcript.append(TranscriptTurn(
            role="interviewer", text="Tell me more?", turn_id=2, timestamp=0.0
        ))
        capture_candidate_turn(session, [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "Tell me more?"},
            {"role": "user", "content": "second"},
        ])
        # Should have: candidate first, interviewer, candidate second
        assert len(session.transcript) == 3
        assert session.transcript[0].text == "first"
        assert session.transcript[2].text == "second"
        assert session.transcript[2].role == "candidate"

    def test_ignores_empty_user_message(self):
        session = self._session()
        messages = [{"role": "user", "content": ""}]
        capture_candidate_turn(session, messages)
        assert session.transcript == []


class TestCommitTurn:
    def _session(self):
        return SessionState(
            channel="ch",
            agent_id="a",
            persona_id="skeptical_technical",
            role="SWE",
            interview_type="technical",
            difficulty="hard",
        )

    def test_commits_full_text_to_transcript(self):
        session = self._session()
        collected = [
            b'data: {"choices":[{"delta":{"content":"Tell me about X. What happened?"}}]}\n\n',
            b"data: [DONE]\n\n",
        ]
        _commit_turn(session, collected)
        assert len(session.transcript) == 1
        assert session.transcript[0].text == "Tell me about X. What happened?"
        assert session.question_count == 1
        # questions_asked stores the extracted question, not the full reply
        assert session.questions_asked == ["What happened?"]

    def test_skips_empty_collected(self):
        session = self._session()
        _commit_turn(session, [])
        assert session.transcript == []
        assert session.question_count == 0

    def test_skips_proxy_error_payloads(self):
        session = self._session()
        error_payload = b'data: {"choices":[{"delta":{"content":"[proxy error: openai 401]"}}]}\n\ndata: [DONE]\n\n'
        _commit_turn(session, [error_payload])
        assert session.transcript == []
        assert session.question_count == 0

    def test_multiple_turns_increment_counter(self):
        session = self._session()
        chunk1 = [b'data: {"choices":[{"delta":{"content":"Q1?"}}]}\n\n', b"data: [DONE]\n\n"]
        chunk2 = [b'data: {"choices":[{"delta":{"content":"Q2?"}}]}\n\n', b"data: [DONE]\n\n"]
        _commit_turn(session, chunk1)
        _commit_turn(session, chunk2)
        assert session.question_count == 2
        assert session.questions_asked == ["Q1?", "Q2?"]
        assert len(session.transcript) == 2


class TestSyntheticErrorSse:
    def test_synthetic_error_is_complete_sse(self):
        from llm_proxy import _synthetic_error_sse

        result = _synthetic_error_sse("openai 401")
        assert result.startswith(b"data: ")
        assert b"[DONE]" in result
        # Must parse as valid SSE content
        parsed = parse_sse_content(result)
        assert "[proxy error: openai 401]" in parsed


class TestParseSseContent:
    def test_extracts_content_from_delta_chunks(self):
        sse_data = (
            b'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'
            b'data: {"choices":[{"delta":{"content":" world"}}]}\n\n'
            b"data: [DONE]\n\n"
        )
        assert parse_sse_content(sse_data) == "Hello world"

    def test_handles_empty_chunks(self):
        sse_data = b"data: [DONE]\n\n"
        assert parse_sse_content(sse_data) == ""

    def test_skips_chunks_without_content(self):
        sse_data = (
            b'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'
            b'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
            b"data: [DONE]\n\n"
        )
        assert parse_sse_content(sse_data) == "hi"

    def test_ignores_malformed_lines(self):
        sse_data = (
            b"garbage line\n\n"
            b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
        )
        assert parse_sse_content(sse_data) == "ok"
