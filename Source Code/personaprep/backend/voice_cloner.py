import logging, os
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger("personaprep.voice")

PP_ELEVENLABS_API_KEY = os.environ.get("PP_ELEVENLABS_API_KEY", "")

DEFAULT_VOICES = {
    "male":    {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam"},
    "female":  {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel"},
    "unknown": {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam"},
}

async def clone_voice(name: str, audio_path: str) -> str | None:
    """Clone a voice from an audio file using ElevenLabs. Returns voice_id or None."""
    if not PP_ELEVENLABS_API_KEY:
        logger.warning("PP_ELEVENLABS_API_KEY not set — skipping voice clone")
        return None
    try:
        from elevenlabs.client import ElevenLabs
        import uuid
        client = ElevenLabs(api_key=PP_ELEVENLABS_API_KEY)
        with open(audio_path, "rb") as f:
            voice = client.voices.add(
                name=f"pp_{name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}",
                files=[f.read()],
                description=f"PersonaPrep clone of {name}",
            )
        logger.info("Voice cloned for %s → voice_id=%s", name, voice.voice_id)
        return voice.voice_id
    except Exception as e:
        logger.error("Voice clone failed for %s: %s", name, e)
        return None

def detect_gender_voice(name: str) -> dict:
    """Use gender-guesser to pick a default ElevenLabs voice based on first name."""
    try:
        import gender_guesser.detector as gender
        d = gender.Detector()
        first_name = name.split()[0]
        guess = d.get_gender(first_name)
        if guess in ("female", "mostly_female"):
            v = DEFAULT_VOICES["female"]
        elif guess in ("male", "mostly_male"):
            v = DEFAULT_VOICES["male"]
        else:
            v = DEFAULT_VOICES["unknown"]
    except Exception:
        v = DEFAULT_VOICES["unknown"]
    return v

async def resolve_voice(name: str, audio_path: str | None) -> dict:
    """
    Priority:
    1. Clone from audio file if available
    2. Gender-detected default ElevenLabs voice
    Returns dict with tts_vendor, tts_voice_id, voice_cloned keys.
    """
    if audio_path:
        voice_id = await clone_voice(name, audio_path)
        if voice_id:
            return {"tts_vendor": "elevenlabs", "tts_voice_id": voice_id, "voice_cloned": True}

    v = detect_gender_voice(name)
    return {"tts_vendor": "elevenlabs", "tts_voice_id": v["voice_id"], "voice_cloned": False}
