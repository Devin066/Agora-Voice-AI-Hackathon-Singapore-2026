import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from session_store import (
    SessionState,
    TranscriptTurn,
    create_session,
    delete_session,
    get_session,
    _sessions,
)


def _make_session(channel: str = "test_ch") -> SessionState:
    return SessionState(
        channel=channel,
        agent_id="agent_abc",
        persona_id="skeptical_technical",
        role="AI Engineer",
        interview_type="technical",
        difficulty="hard",
    )


class TestSessionState:
    def test_defaults(self):
        s = _make_session()
        assert s.question_count == 0
        assert s.questions_asked == []
        assert s.transcript == []

    def test_transcript_turn(self):
        t = TranscriptTurn(role="interviewer", text="Hello", turn_id=1, timestamp=1234.0)
        assert t.role == "interviewer"
        assert t.text == "Hello"


class TestCreateGetDelete:
    def setup_method(self):
        _sessions.clear()

    def test_create_and_get(self):
        s = _make_session("ch1")
        create_session(s)
        result = get_session("ch1")
        assert result is s

    def test_get_missing_returns_none(self):
        assert get_session("nonexistent") is None

    def test_delete_removes_session(self):
        s = _make_session("ch2")
        create_session(s)
        delete_session("ch2")
        assert get_session("ch2") is None

    def test_delete_missing_does_not_raise(self):
        delete_session("nonexistent")  # should not raise

    def test_multiple_sessions(self):
        s1 = _make_session("ch_a")
        s2 = _make_session("ch_b")
        create_session(s1)
        create_session(s2)
        assert get_session("ch_a") is s1
        assert get_session("ch_b") is s2
