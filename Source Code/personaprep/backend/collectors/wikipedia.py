import asyncio
import logging

from .base import BaseCollector, CollectedContent

logger = logging.getLogger("personaprep.collectors.wikipedia")


class WikipediaCollector(BaseCollector):
    """Fetch Wikipedia article text and first photo.

    Also used as auto-supplement when collected content is thin (<500 chars).
    """

    def can_handle(self, input_: str) -> bool:
        return "wikipedia.org" in input_ or not input_.startswith("http")

    async def collect(self, name_or_url: str) -> CollectedContent:
        import wikipedia

        if "wikipedia.org" in name_or_url:
            title = name_or_url.split("/wiki/")[-1].replace("_", " ")
        else:
            title = name_or_url

        def _fetch():
            try:
                return wikipedia.page(title, auto_suggest=True)
            except wikipedia.DisambiguationError as e:
                return wikipedia.page(e.options[0])

        page = await asyncio.to_thread(_fetch)

        # First real photo (skip SVGs / logos)
        photo_url = None
        for img in page.images:
            low = img.lower()
            if low.endswith((".jpg", ".jpeg", ".png")) and "logo" not in low:
                photo_url = img
                break

        return CollectedContent(
            source="wikipedia",
            text=page.summary + "\n\n" + page.content[:8000],
            metadata={"url": page.url, "photo_url": photo_url},
        )
