import asyncio, json, logging, os, time, uuid
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger("personaprep.builder")

CUSTOM_PERSONAS_DIR = os.environ.get("PP_CUSTOM_PERSONAS_DIR",
    os.path.join(os.path.dirname(__file__), "custom_personas"))

@dataclass
class BuildJob:
    job_id: str
    name: str
    status: str = "queued"  # queued|collecting|synthesizing|cloning_voice|building_avatar|done|failed
    progress_label: str = "Queued..."
    persona_id: str | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)

_jobs: dict[str, BuildJob] = {}

def get_job(job_id: str) -> BuildJob | None:
    return _jobs.get(job_id)

def build_knowledge_chunks(collected_contents: list) -> list[dict]:
    """Split collected content into searchable chunks for runtime tools."""
    chunks = []
    for content in collected_contents:
        paragraphs = content.text.split('\n\n')
        for para in paragraphs:
            para = para.strip()
            if len(para) > 50:
                chunks.append({"source": content.source, "text": para[:800]})
    return chunks[:200]

async def run_build(job: BuildJob, sources: list[dict], photo_url: str | None):
    """Full async build pipeline. Updates job.status as it progresses."""
    from collectors import dispatch_collect
    from collectors.youtube import YouTubeCollector
    from persona_synthesizer import synthesize_persona
    from voice_cloner import resolve_voice
    from avatar_builder import resolve_avatar

    try:
        # 1. Collect
        job.status = "collecting"
        job.progress_label = "Fetching content..."
        collected = []
        audio_path = None

        for source in sources:
            job.progress_label = f"Fetching {source.get('type', 'content')}..."
            result = await dispatch_collect(source)
            if result and result.text:
                collected.append(result)

        # Try to get audio from first YouTube URL (for voice cloning)
        youtube_urls = [s["url"] for s in sources if s.get("type") == "youtube" and s.get("url")]
        if youtube_urls:
            try:
                job.progress_label = "Downloading audio for voice clone..."
                yt = YouTubeCollector()
                audio_path = await yt.extract_audio(youtube_urls[0], max_seconds=120)
            except Exception as e:
                logger.warning("Audio extraction failed: %s", e)

        # Auto-supplement with Wikipedia if content is thin
        if sum(len(c.text) for c in collected) < 500:
            job.progress_label = "Supplementing with Wikipedia..."
            from collectors.wikipedia import WikipediaCollector
            try:
                wiki = await WikipediaCollector().collect(job.name)
                collected.append(wiki)
                # Use Wikipedia photo if no user photo
                if not photo_url and wiki.metadata.get("photo_url"):
                    photo_url = wiki.metadata["photo_url"]
            except Exception:
                pass

        total_chars = sum(len(c.text) for c in collected)
        if total_chars < 300:
            raise ValueError(f"Only {total_chars} chars of content found. Add more sources.")

        # 2. Synthesize persona
        job.status = "synthesizing"
        job.progress_label = "Synthesizing persona..."
        all_text = "\n\n---\n\n".join(c.text for c in collected)
        profile = await synthesize_persona(job.name, all_text)

        # 3. Voice
        job.status = "cloning_voice"
        job.progress_label = "Cloning voice..." if audio_path else "Setting up voice..."
        voice = await resolve_voice(job.name, audio_path)

        # 4. Avatar
        job.status = "building_avatar"
        job.progress_label = "Building avatar..." if photo_url else "Skipping avatar (voice-only)..."
        avatar = await resolve_avatar(job.name, photo_url)

        # 5. Build knowledge chunks
        chunks = build_knowledge_chunks(collected)

        # 6. Write persona JSON
        persona_id = f"custom_{job.name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"
        os.makedirs(CUSTOM_PERSONAS_DIR, exist_ok=True)

        persona_data = {
            "id": persona_id,
            "name": job.name,
            "type": "custom",
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            **profile,
            **voice,
            **(avatar or {}),
            "has_voice_clone": voice.get("voice_cloned", False),
            "has_avatar": avatar is not None,
            "knowledge_chunks": chunks,
            "source_summary": f"{len(collected)} sources, {total_chars} chars",
        }

        path = os.path.join(CUSTOM_PERSONAS_DIR, f"{persona_id}.json")
        with open(path, "w") as f:
            json.dump(persona_data, f, indent=2)

        job.status = "done"
        job.progress_label = "Ready"
        job.persona_id = persona_id
        logger.info("Persona built: %s → %s", job.name, persona_id)

    except Exception as e:
        job.status = "failed"
        job.error = str(e)
        job.progress_label = f"Failed: {e}"
        logger.error("Build failed for %s: %s", job.name, e)

def start_build(name: str, sources: list[dict], photo_url: str | None) -> str:
    """Start a build job in the background. Returns job_id."""
    job_id = uuid.uuid4().hex[:12]
    job = BuildJob(job_id=job_id, name=name)
    _jobs[job_id] = job
    asyncio.create_task(run_build(job, sources, photo_url))
    return job_id
