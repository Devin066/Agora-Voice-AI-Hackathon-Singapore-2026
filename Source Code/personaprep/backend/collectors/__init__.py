from .base import BaseCollector, CollectedContent
from .text import TextCollector
from .web import WebCollector
from .wikipedia import WikipediaCollector
from .youtube import YouTubeCollector

COLLECTORS = [YouTubeCollector(), WikipediaCollector(), WebCollector()]


async def dispatch_collect(source: dict) -> CollectedContent | None:
    """Auto-dispatch a source dict to the correct collector.

    Source format:
        {"type": "youtube", "url": "..."}
        {"type": "url", "url": "..."}
        {"type": "text", "text": "...", "label": "twitter"}
    """
    if source.get("type") == "text":
        return await TextCollector().collect(
            source.get("text", ""), label=source.get("label", "user_text")
        )

    url = source.get("url", "")
    for collector in COLLECTORS:
        if collector.can_handle(url):
            try:
                return await collector.collect(url)
            except Exception as e:
                return CollectedContent(
                    source="error", text="", metadata={"error": str(e)}
                )

    return None
