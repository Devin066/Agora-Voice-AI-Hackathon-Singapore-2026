import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ.setdefault("PP_LLM_API_KEY", "sk-test")
os.environ.setdefault("PP_FEEDBACK_MODEL", "gemini-2.5-flash")

import pytest

from feedback import (
    format_transcript,
    build_feedback_prompt,
    parse_feedback_response,
    generate_feedback,
)
from session_store import SessionState, TranscriptTurn


def _session_with_transcript() -> SessionState:
    s = SessionState(
        channel="ch1",
        agent_id="a1",
        persona_id="skeptical_technical",
        role="AI Engineer",
        interview_type="technical",
        difficulty="hard",
    )
    s.transcript = [
        TranscriptTurn(role="interviewer", text="Tell me about a system you built.", turn_id=1, timestamp=1.0),
        TranscriptTurn(role="candidate", text="I built a data pipeline at my last job.", turn_id=2, timestamp=2.0),
        TranscriptTurn(role="interviewer", text="Be specific — what was the bottleneck?", turn_id=3, timestamp=3.0),
        TranscriptTurn(role="candidate", text="Kafka consumer lag was the main issue.", turn_id=4, timestamp=4.0),
    ]
    s.question_count = 2
    return s


class TestFormatTranscript:
    def test_labels_interviewer_and_candidate(self):
        session = _session_with_transcript()
        out = format_transcript(session)
        assert "[Interviewer]" in out
        assert "[Candidate]" in out

    def test_preserves_order(self):
        session = _session_with_transcript()
        out = format_transcript(session)
        # First turn should come before second
        idx_first = out.index("Tell me about")
        idx_second = out.index("data pipeline")
        assert idx_first < idx_second

    def test_empty_transcript_returns_empty_string(self):
        s = SessionState(
            channel="x", agent_id="x", persona_id="friendly_recruiter",
            role="SWE", interview_type="behavioral", difficulty="easy",
        )
        assert format_transcript(s) == ""


class TestBuildFeedbackPrompt:
    def test_includes_role_and_type(self):
        session = _session_with_transcript()
        transcript = format_transcript(session)
        prompt = build_feedback_prompt(session, transcript)
        assert "AI Engineer" in prompt
        assert "technical" in prompt

    def test_includes_persona_name(self):
        session = _session_with_transcript()
        transcript = format_transcript(session)
        prompt = build_feedback_prompt(session, transcript)
        assert "Skeptical Technical Interviewer" in prompt

    def test_includes_transcript(self):
        session = _session_with_transcript()
        transcript = format_transcript(session)
        prompt = build_feedback_prompt(session, transcript)
        assert "Kafka consumer lag" in prompt

    def test_mentions_all_rubric_dimensions(self):
        session = _session_with_transcript()
        prompt = build_feedback_prompt(session, format_transcript(session))
        assert "clarity" in prompt.lower()
        assert "specificity" in prompt.lower()
        assert "technical_depth" in prompt.lower() or "technical depth" in prompt.lower()
        assert "confidence" in prompt.lower()


class TestParseFeedbackResponse:
    def test_parses_valid_json(self):
        raw = json.dumps({
            "overall_score": 7.6,
            "summary": "Solid answers but lacked specificity.",
            "rubric": {"clarity": 8.0, "specificity": 7.0, "technical_depth": 7.5, "confidence": 8.0},
            "strengths": ["Good framing"],
            "weaknesses": ["No numbers"],
            "improved_answer_examples": [{"question": "Tell me about X", "suggestion": "Start with the outcome."}],
        })
        result = parse_feedback_response(raw)
        assert result["overall_score"] == 7.6
        assert result["rubric"]["clarity"] == 8.0
        assert len(result["strengths"]) == 1

    def test_fills_missing_optional_fields(self):
        """If LLM omits optional lists, parser should default them to empty."""
        raw = json.dumps({
            "overall_score": 5.0,
            "summary": "ok",
            "rubric": {"clarity": 5, "specificity": 5, "technical_depth": 5, "confidence": 5},
        })
        result = parse_feedback_response(raw)
        assert result["strengths"] == []
        assert result["weaknesses"] == []
        assert result["improved_answer_examples"] == []

    def test_raises_on_invalid_json(self):
        with pytest.raises(ValueError):
            parse_feedback_response("not json at all")

    def test_raises_on_missing_required_fields(self):
        raw = json.dumps({"overall_score": 5.0})  # missing rubric
        with pytest.raises(ValueError):
            parse_feedback_response(raw)

    def test_raises_when_rubric_is_not_dict(self):
        raw = json.dumps({
            "overall_score": 5.0,
            "summary": "ok",
            "rubric": None,
        })
        with pytest.raises(ValueError, match="rubric"):
            parse_feedback_response(raw)

    def test_raises_when_rubric_is_string(self):
        raw = json.dumps({
            "overall_score": 5.0,
            "summary": "ok",
            "rubric": "n/a",
        })
        with pytest.raises(ValueError):
            parse_feedback_response(raw)

    def test_raises_when_top_level_is_not_dict(self):
        with pytest.raises(ValueError):
            parse_feedback_response("[]")

    def test_raises_when_summary_not_string(self):
        raw = json.dumps({
            "overall_score": 5.0,
            "summary": 123,
            "rubric": {"clarity": 5, "specificity": 5, "technical_depth": 5, "confidence": 5},
        })
        with pytest.raises(ValueError):
            parse_feedback_response(raw)

    def test_coerces_numeric_strings_to_float(self):
        """LLM sometimes returns '7.5' as a string — coerce it."""
        raw = json.dumps({
            "overall_score": "7.5",
            "summary": "ok",
            "rubric": {"clarity": "8", "specificity": "7", "technical_depth": "7", "confidence": "8"},
        })
        result = parse_feedback_response(raw)
        assert result["overall_score"] == 7.5
        assert result["rubric"]["clarity"] == 8.0

    def test_clamps_scores_to_0_10_range(self):
        raw = json.dumps({
            "overall_score": 15,
            "summary": "ok",
            "rubric": {"clarity": -2, "specificity": 100, "technical_depth": 5, "confidence": 5},
        })
        result = parse_feedback_response(raw)
        assert result["overall_score"] == 10
        assert result["rubric"]["clarity"] == 0
        assert result["rubric"]["specificity"] == 10

    def test_raises_on_non_numeric_score(self):
        raw = json.dumps({
            "overall_score": "excellent",
            "summary": "ok",
            "rubric": {"clarity": 5, "specificity": 5, "technical_depth": 5, "confidence": 5},
        })
        with pytest.raises(ValueError):
            parse_feedback_response(raw)


class TestGenerateFeedback:
    @pytest.mark.asyncio
    async def test_calls_llm_and_returns_parsed(self, monkeypatch):
        import feedback

        captured = {}
        fake_response_json = {
            "overall_score": 8.2,
            "summary": "Great job.",
            "rubric": {"clarity": 9, "specificity": 8, "technical_depth": 8, "confidence": 8},
            "strengths": ["Clear", "Focused"],
            "weaknesses": ["Could quantify more"],
            "improved_answer_examples": [],
        }

        class FakeResponse:
            status_code = 200
            def raise_for_status(self):
                pass
            def json(self):
                return {
                    "choices": [
                        {"message": {"content": json.dumps(fake_response_json)}}
                    ]
                }

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

        monkeypatch.setattr(feedback.httpx, "AsyncClient", FakeClient)

        session = _session_with_transcript()
        result = await generate_feedback(session)

        assert result["overall_score"] == 8.2
        # Uses the configured feedback model (default: gemini-2.5-flash)
        assert captured["json"]["model"] == "gemini-2.5-flash"
        # Hits the configured LLM endpoint (default: Gemini OpenAI-compat)
        assert "generativelanguage.googleapis.com" in captured["url"]
        # JSON response format requested
        assert captured["json"]["response_format"] == {"type": "json_object"}
        # Auth header sent
        assert "Bearer" in captured["headers"]["Authorization"]

    @pytest.mark.asyncio
    async def test_empty_transcript_raises(self):
        s = SessionState(
            channel="x", agent_id="x", persona_id="friendly_recruiter",
            role="SWE", interview_type="behavioral", difficulty="easy",
        )
        with pytest.raises(ValueError):
            await generate_feedback(s)
