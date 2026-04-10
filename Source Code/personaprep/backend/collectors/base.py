from dataclasses import dataclass, field


@dataclass
class CollectedContent:
    source: str  # "youtube", "web", "wikipedia", "user_text"
    text: str
    metadata: dict = field(default_factory=dict)
    audio_path: str | None = None  # YouTube only — path to downloaded mp3


class BaseCollector:
    def can_handle(self, url_or_input: str) -> bool:
        raise NotImplementedError

    async def collect(self, url_or_input: str) -> CollectedContent:
        raise NotImplementedError
