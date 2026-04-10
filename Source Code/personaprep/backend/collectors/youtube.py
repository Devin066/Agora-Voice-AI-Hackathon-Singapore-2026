import asyncio
import logging
import re

from .base import BaseCollector, CollectedContent

logger = logging.getLogger("personaprep.collectors.youtube")

VIDEO_ID_RE = re.compile(r"(?:v=|youtu\.be/|/embed/|/v/)([a-zA-Z0-9_-]{11})")


class YouTubeCollector(BaseCollector):
    """Handles youtube.com and youtu.be URLs.

    Extracts transcripts (text), metadata (title), and optionally audio
    (for voice cloning).  Caps at 5 videos per build for speed.
    """

    def can_handle(self, url: str) -> bool:
        return "youtube.com" in url or "youtu.be" in url

    async def collect(self, url: str) -> CollectedContent:
        video_ids = await asyncio.to_thread(self._extract_video_ids, url)
        transcripts: list[str] = []
        titles: list[str] = []

        for vid in video_ids[:5]:
            # Transcript
            try:
                from youtube_transcript_api import YouTubeTranscriptApi

                t = await asyncio.to_thread(
                    YouTubeTranscriptApi.get_transcript, vid
                )
                text = " ".join(seg["text"] for seg in t)
                transcripts.append(text)
            except Exception as e:
                logger.warning("Transcript unavailable for %s: %s", vid, e)

            # Title
            try:
                info = await asyncio.to_thread(self._get_metadata, vid)
                titles.append(info.get("title", vid))
            except Exception:
                titles.append(vid)

        return CollectedContent(
            source="youtube",
            text="\n\n---\n\n".join(transcripts),
            metadata={"video_ids": video_ids[:5], "titles": titles},
        )

    async def extract_audio(self, url: str, max_seconds: int = 120) -> str:
        """Download audio for voice cloning. Returns path to mp3 file."""
        video_ids = await asyncio.to_thread(self._extract_video_ids, url)
        if not video_ids:
            raise ValueError("No video ID found in URL")

        vid = video_ids[0]
        out_template = f"/tmp/yt_{vid}.%(ext)s"
        opts = {
            "format": "bestaudio/best",
            "outtmpl": out_template,
            "postprocessors": [
                {
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }
            ],
            "quiet": True,
        }

        import yt_dlp

        def _download():
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([f"https://youtube.com/watch?v={vid}"])

        await asyncio.to_thread(_download)
        return f"/tmp/yt_{vid}.mp3"

    # -- private helpers --

    def _extract_video_ids(self, url: str) -> list[str]:
        match = VIDEO_ID_RE.search(url)
        if match:
            return [match.group(1)]

        # Channel or playlist → flat-extract via yt-dlp
        try:
            import yt_dlp

            with yt_dlp.YoutubeDL({"extract_flat": True, "quiet": True}) as ydl:
                info = ydl.extract_info(url, download=False)
                entries = info.get("entries", [])
                return [e["id"] for e in entries if e.get("id")][:5]
        except Exception:
            return []

    def _get_metadata(self, video_id: str) -> dict:
        import yt_dlp

        with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True}) as ydl:
            return ydl.extract_info(
                f"https://youtube.com/watch?v={video_id}", download=False
            )
