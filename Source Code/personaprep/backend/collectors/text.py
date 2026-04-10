from .base import BaseCollector, CollectedContent


class TextCollector(BaseCollector):
    """Pass-through for user-pasted text (tweets, LinkedIn bio, etc.)."""

    def can_handle(self, _input: str) -> bool:
        return True  # catch-all fallback

    async def collect(self, text: str, label: str = "user_text") -> CollectedContent:
        return CollectedContent(source=label, text=text.strip())
