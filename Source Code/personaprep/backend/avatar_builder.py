import logging, os
import httpx
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger("personaprep.avatar")

PP_ANAM_API_KEY = os.environ.get("PP_ANAM_API_KEY", "")
ANAM_BASE = "https://api.anam.ai/v1"

async def create_anam_avatar(image_url: str, name: str, style: str = "anime") -> str | None:
    """Create an Anam avatar from a photo URL with a stylized look. Returns avatar_id or None."""
    if not PP_ANAM_API_KEY:
        logger.warning("PP_ANAM_API_KEY not set — skipping avatar creation")
        return None
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                f"{ANAM_BASE}/avatars",
                headers={"Authorization": f"Bearer {PP_ANAM_API_KEY}"},
                json={
                    "name": f"{name} (stylized)",
                    "image_url": image_url,
                    "style": style,  # "anime" or "comic_book" — never "photorealistic"
                },
            )
            r.raise_for_status()
            data = r.json()
            avatar_id = data.get("id") or data.get("avatar_id")
            logger.info("Anam avatar created for %s → avatar_id=%s style=%s", name, avatar_id, style)
            return avatar_id
    except Exception as e:
        logger.error("Anam avatar creation failed for %s: %s", name, e)
        return None

async def resolve_avatar(name: str, photo_url: str | None) -> dict | None:
    """
    Priority:
    1. User-provided photo URL → Anam avatar (anime style)
    2. Wikipedia photo (passed in from collector) → Anam avatar (anime style)
    3. None → voice-only mode
    """
    if not photo_url:
        return None

    avatar_id = await create_anam_avatar(photo_url, name, style="anime")
    if avatar_id:
        return {"avatar_vendor": "anam", "avatar_id": avatar_id, "avatar_style": "anime", "photo_url": photo_url}
    return None
