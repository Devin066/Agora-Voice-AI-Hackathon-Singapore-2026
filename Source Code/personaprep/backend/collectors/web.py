import logging

import httpx
from bs4 import BeautifulSoup

from .base import BaseCollector, CollectedContent

logger = logging.getLogger("personaprep.collectors.web")


class WebCollector(BaseCollector):
    """Fetch any HTTP page and extract article text."""

    def can_handle(self, url: str) -> bool:
        return (
            url.startswith("http")
            and "youtube.com" not in url
            and "youtu.be" not in url
            and "wikipedia.org" not in url
        )

    async def collect(self, url: str) -> CollectedContent:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            r = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()

        soup = BeautifulSoup(r.text, "html.parser")

        # Remove noise
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()

        # Priority: <article> → <main> → all <p>
        article = soup.find("article") or soup.find("main")
        if article:
            text = article.get_text(separator="\n", strip=True)
        else:
            paragraphs = soup.find_all("p")
            text = "\n".join(p.get_text(strip=True) for p in paragraphs)

        title = soup.title.string if soup.title else None

        return CollectedContent(
            source="web",
            text=text[:15000],
            metadata={"url": url, "title": title},
        )
