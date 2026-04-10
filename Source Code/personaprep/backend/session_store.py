from dataclasses import dataclass, field


@dataclass
class TranscriptTurn:
    role: str  # "interviewer" | "candidate"
    text: str
    turn_id: int
    timestamp: float


@dataclass
class SessionState:
    channel: str
    agent_id: str
    persona_id: str
    role: str
    interview_type: str
    difficulty: str
    question_count: int = 0
    questions_asked: list[str] = field(default_factory=list)
    transcript: list[TranscriptTurn] = field(default_factory=list)


_sessions: dict[str, SessionState] = {}


def create_session(state: SessionState) -> None:
    _sessions[state.channel] = state


def get_session(channel: str) -> SessionState | None:
    return _sessions.get(channel)


def delete_session(channel: str) -> None:
    _sessions.pop(channel, None)
