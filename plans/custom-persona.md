# PersonaPrep — Custom Persona Feature

Goal: Build a digital twin of any real person (e.g. Gary Tan / YC) by providing social media links. The system scrapes content, synthesizes a persona, clones the voice, and optionally builds a photo avatar — all wired through the Agora ConvoAI stack, including runtime tools that let the agent reference the person's actual content mid-conversation.

---

## What This Does, Precisely

When a user builds a "Gary Tan" custom persona:

1. **Persona intelligence**: Scraped YouTube transcripts + web content + user-pasted text → GPT-4o synthesizes speech patterns, vocabulary, opinions, interview style → system prompt injected into every LLM turn via our custom `/chat/completions` proxy.

2. **Runtime knowledge tools**: The scraped content is indexed and exposed as **OpenAI-format tools** in the LLM proxy. During conversation, the agent can call `search_persona_knowledge` to reference things Gary Tan actually said — not just parrot a system prompt.

3. **Voice**: YouTube audio → ElevenLabs voice clone API → `voice_id` → ConvoAI `/join` uses `tts.vendor: "elevenlabs"`. If no audio available → gender-detected default ElevenLabs voice.

4. **Avatar**: Photo URL → **cartoonize** (OpenCV stylization — safety requirement) → HeyGen Instant Avatar from the stylized image → `avatar_id` → ConvoAI `/join` uses `properties.avatar.params.avatar_id`. Avatars are always visibly stylized/illustrated, never photorealistic. If no photo → attempt Wikipedia image lookup → if that fails → voice-only mode.

5. **Opening**: `/agents/{id}/speak` fires after session starts to inject a custom greeting scripted in Gary Tan's style.

---

## How We Squeeze Agora

### What Agora already does (existing)
- Custom LLM: `llm.vendor: "custom"` → Agora calls our `/chat/completions` endpoint every turn
- TTS: pipeline handles voice output
- Avatar video: `properties.avatar` block → HeyGen joined as video UID in RTC channel
- RTM: `advanced_features.enable_rtm: true` → transcripts + state events delivered to frontend

### What changes per custom persona (dynamic per session)
| ConvoAI `/join` field | Static personas | Custom persona |
|---|---|---|
| `llm.system_messages` | Hardcoded from `personas.py` | Generated from scraped + synthesized content |
| `tts.vendor` | Fixed in env (e.g. `openai`) | `"elevenlabs"` if voice cloned, or default voice |
| `tts.params.voice_id` | Fixed in env | Per-persona ElevenLabs voice ID (cloned or default) |
| `avatar.params.avatar_id` | Fixed in env (`PP_AVATAR_ID`) | Per-persona HeyGen instant avatar ID, or null |

### New Agora mechanisms used

**1. `/speak` endpoint — custom greeting**

```
POST /agents/{agent_id}/speak
{
  "text": "Hey! Really glad you're here. I'm Gary. Tell me what you're building.",
  "interrupt_current_speech": false
}
```
Fires 3s post-`/join` once agent is settled in the channel.

**2. Custom LLM server-side tool execution**

From Agora's `server-custom-llm` pattern: the LLM can return tool calls in the SSE stream, and our proxy executes them server-side (up to 5 passes per turn). We add persona knowledge tools to make the agent reference real content — covered in [Runtime Knowledge Tools](#runtime-knowledge-tools-server-side-tool-execution) below.

---

## Data Sources — What We Can Actually Pull

### Pullable (automated, no auth)

| Source | Method | Reliability | Best for |
|--------|--------|-------------|----------|
| **YouTube videos** | `youtube-transcript-api` (transcripts) + `yt-dlp` (audio, metadata) | High | Speech patterns, opinions, long-form content |
| **Web pages / blogs** | `httpx` + `BeautifulSoup` | Medium | Written opinions, bio content |
| **Wikipedia** | `wikipedia` Python package | Very high | Bio, career history, photo |
| **GitHub** | GitHub API (60 req/hr unauth) or raw README scrape | High | Technical personas, open-source contributors |

### Not pullable (user must paste text)

| Source | Why | Workaround |
|--------|-----|-----------|
| **Twitter/X** | API costs $100/mo minimum, scraping blocked by Cloudflare | User pastes tweet text into a free-text field |
| **LinkedIn** | Aggressive anti-bot, requires auth, legally risky | User pastes bio/posts as plain text |
| **Instagram** | Requires auth, media-heavy (not useful for text) | Not supported |
| **Podcasts** | No public transcript API; audio download varies by host | User pastes show notes or transcripts |

### FE source fields (reflecting reality)

```
┌─────────────────────────────────────────────────────────┐
│ Build Custom Persona                                     │
│                                                          │
│ Name: [Gary Tan                             ]            │
│                                                          │
│ YouTube videos (we'll pull transcripts + audio):         │
│ [https://youtube.com/watch?v=...            ] [+ Add]   │
│ [https://youtube.com/watch?v=...            ] [Remove]   │
│                                                          │
│ Web pages / articles:                                    │
│ [https://blog.garrytan.com/...              ] [+ Add]   │
│                                                          │
│ Paste text (tweets, LinkedIn, bio, anything):            │
│ ┌──────────────────────────────────────────────────┐     │
│ │ Gary's tweets:                                    │     │
│ │ "The best founders have strong opinions..."       │     │
│ │ ...                                               │     │
│ └──────────────────────────────────────────────────┘     │
│                                                          │
│ Photo URL (for avatar — leave blank for voice-only):     │
│ [https://...                                ]            │
│                                                          │
│ [  Build Persona  ]                                      │
└─────────────────────────────────────────────────────────┘
```

No checkboxes for voice clone — it happens automatically if YouTube audio is available. No Twitter/LinkedIn URL fields — those platforms block scraping, so we only accept pasted text.

---

## Intelligent Defaults

When the user provides incomplete information, the system fills gaps intelligently rather than failing.

### Voice defaults

```python
import gender_guesser.detector as gender

# Default ElevenLabs voices (professional, neutral tone)
DEFAULT_VOICES = {
    "male":        {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam"},
    "female":      {"voice_id": "21m00Tcm4TlvDq8ikWAM", "name": "Rachel"},
    "unknown":     {"voice_id": "pNInz6obpgDQGcFmaJgB", "name": "Adam"},  # safe default
}

def resolve_voice(persona_name: str, youtube_urls: list[str]) -> dict:
    """
    Priority:
    1. Clone from YouTube audio (if any YouTube URL provided)
    2. Gender-detected default ElevenLabs voice
    """
    if youtube_urls:
        try:
            audio = download_youtube_audio(youtube_urls[0], max_seconds=120)
            voice_id = clone_voice(persona_name, audio)
            return {"tts_vendor": "elevenlabs", "tts_voice_id": voice_id, "voice_cloned": True}
        except Exception:
            pass  # Fall through to default

    # Gender detection from first name
    d = gender.Detector()
    first_name = persona_name.split()[0]
    guess = d.get_gender(first_name)  # "male", "female", "mostly_male", "mostly_female", "unknown", "andy"

    if guess in ("female", "mostly_female"):
        v = DEFAULT_VOICES["female"]
    elif guess in ("male", "mostly_male"):
        v = DEFAULT_VOICES["male"]
    else:
        v = DEFAULT_VOICES["unknown"]

    return {"tts_vendor": "elevenlabs", "tts_voice_id": v["voice_id"], "voice_cloned": False}
```

**Dependencies**: `pip install gender-guesser` (pure Python, no external API call).

### Avatar defaults

**Safety requirement**: All avatars must be visibly stylized/cartoonish, never photorealistic. This prevents creating realistic deepfakes of real people. Every photo is run through `cartoonize_photo()` before avatar creation.

```python
import cv2
import numpy as np
import httpx
import tempfile

def cartoonize_photo(photo_url: str) -> str:
    """
    Download photo, apply OpenCV stylization filter, save to temp file.
    Returns path to the cartoonized image.

    cv2.stylization() applies an edge-preserving smoothing filter that makes
    photos look like painted illustrations — recognizable but clearly not real.
    """
    # Download
    r = httpx.get(photo_url, follow_redirects=True)
    arr = np.frombuffer(r.content, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    # Stylize — sigma_s controls smoothing (higher = more cartoon), sigma_r controls edge sharpness
    cartoon = cv2.stylization(img, sigma_s=150, sigma_r=0.25)

    # Boost saturation slightly for a more illustrated feel
    hsv = cv2.cvtColor(cartoon, cv2.COLOR_BGR2HSV).astype(np.float32)
    hsv[:, :, 1] *= 1.3
    hsv = np.clip(hsv, 0, 255).astype(np.uint8)
    cartoon = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

    path = tempfile.mktemp(suffix='.jpg')
    cv2.imwrite(path, cartoon, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return path


async def resolve_avatar(persona_name: str, photo_url: str | None) -> dict | None:
    """
    Priority:
    1. User-provided photo URL → cartoonize → HeyGen Instant Avatar
    2. Wikipedia first image → cartoonize → HeyGen Instant Avatar
    3. None → voice-only mode (graceful degradation)

    Photos are ALWAYS cartoonized before avatar creation (safety).
    """
    url = photo_url

    if not url:
        # Attempt Wikipedia image lookup
        try:
            page = wikipedia.page(persona_name)
            photos = [img for img in page.images if img.endswith(('.jpg', '.jpeg', '.png'))]
            if photos:
                url = photos[0]
        except Exception:
            pass

    if not url:
        return None  # Voice-only mode

    try:
        # Cartoonize the photo first (safety: never photorealistic)
        cartoon_path = cartoonize_photo(url)

        # Upload the cartoonized image and create avatar
        # HeyGen accepts file upload or URL — we upload the processed file
        avatar_id = await create_avatar_from_file(cartoon_path, persona_name, PP_HEYGEN_API_KEY)
        success = await poll_avatar_ready(avatar_id, PP_HEYGEN_API_KEY)
        if success:
            return {"avatar_vendor": "heygen", "avatar_id": avatar_id, "photo_url": url, "stylized": True}
    except Exception:
        pass

    return None  # Avatar build failed → voice-only
```

**Deps**: `pip install opencv-python-headless` (no GUI needed on server).

### Content defaults

```python
async def resolve_content(name: str, sources: list) -> str:
    """
    If user provides no sources at all, auto-search Wikipedia.
    Minimum 300 chars required for synthesis.
    """
    content_chunks = []

    for source in sources:
        chunk = await collect(source)  # dispatch to correct collector
        if chunk:
            content_chunks.append(chunk)

    # Auto-supplement with Wikipedia if content is thin
    if sum(len(c.text) for c in content_chunks) < 500:
        try:
            wiki = await WikipediaCollector().collect(name)
            content_chunks.append(wiki)
        except Exception:
            pass

    total_chars = sum(len(c.text) for c in content_chunks)
    if total_chars < 300:
        raise InsufficientContentError(
            f"Only {total_chars} characters of content found. "
            f"Add more YouTube videos or paste more text."
        )

    return content_chunks
```

### Greeting default

Generated by GPT-4o during persona synthesis. If synthesis doesn't produce one, fallback:

```python
DEFAULT_GREETING = "Hi, I'm {name}. Tell me about yourself and what you're working on."
```

### Default summary

| Field | Default when missing |
|-------|---------------------|
| Voice | Gender-detected ElevenLabs voice (Adam/Rachel) |
| Avatar | Wikipedia photo → HeyGen, or voice-only |
| Content | Auto-search Wikipedia + require 300 chars minimum |
| Greeting | GPT-4o generated, fallback to template |
| Interview approach | Inferred from content ("based on their public speaking style...") |
| Bio | Wikipedia summary if available |

---

## Platform Collectors — Structured Toolset

Each platform has a dedicated collector with a standard interface. The orchestrator dispatches URLs to the correct collector automatically.

### Base interface

```python
from dataclasses import dataclass

@dataclass
class CollectedContent:
    source: str           # "youtube", "web", "wikipedia", "github", "user_text"
    text: str             # The extracted text content
    metadata: dict = None # Source-specific: titles, duration, photo_url, etc.

class BaseCollector:
    def can_handle(self, url_or_input: str) -> bool: ...
    async def collect(self, url_or_input: str) -> CollectedContent: ...
```

### YouTubeCollector

```python
from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp
import re

class YouTubeCollector(BaseCollector):
    """
    Handles: youtube.com/watch?v=, youtu.be/, youtube.com/@channel, youtube.com/playlist
    Extracts: transcripts (text), metadata (title, duration), audio (for voice clone)
    """

    VIDEO_ID_RE = re.compile(r'(?:v=|youtu\.be/|/embed/|/v/)([a-zA-Z0-9_-]{11})')

    def can_handle(self, url: str) -> bool:
        return 'youtube.com' in url or 'youtu.be' in url

    async def collect(self, url: str) -> CollectedContent:
        video_ids = self._extract_video_ids(url)
        transcripts = []
        titles = []

        for vid in video_ids[:5]:  # Cap at 5 videos for build speed
            try:
                t = YouTubeTranscriptApi.get_transcript(vid)
                text = ' '.join(seg['text'] for seg in t)
                transcripts.append(text)
            except Exception:
                pass  # Skip unavailable transcripts

            try:
                info = self._get_metadata(vid)
                titles.append(info.get('title', vid))
            except Exception:
                titles.append(vid)

        return CollectedContent(
            source="youtube",
            text='\n\n---\n\n'.join(transcripts),
            metadata={"video_ids": video_ids[:5], "titles": titles}
        )

    def _extract_video_ids(self, url: str) -> list[str]:
        """Extract video IDs. For channels/playlists, use yt-dlp to list videos."""
        match = self.VIDEO_ID_RE.search(url)
        if match:
            return [match.group(1)]

        # Channel or playlist → extract video list via yt-dlp
        try:
            with yt_dlp.YoutubeDL({'extract_flat': True, 'quiet': True}) as ydl:
                info = ydl.extract_info(url, download=False)
                entries = info.get('entries', [])
                return [e['id'] for e in entries if e.get('id')][:5]
        except Exception:
            return []

    def _get_metadata(self, video_id: str) -> dict:
        with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
            return ydl.extract_info(f'https://youtube.com/watch?v={video_id}', download=False)

    async def extract_audio(self, url: str, max_seconds: int = 120) -> bytes:
        """Download audio for voice cloning. Returns trimmed MP3 bytes."""
        video_ids = self._extract_video_ids(url)
        if not video_ids:
            raise ValueError("No video ID found")

        opts = {
            'format': 'bestaudio/best',
            'outtmpl': f'/tmp/yt_{video_ids[0]}.%(ext)s',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'quiet': True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        mp3_path = f'/tmp/yt_{video_ids[0]}.mp3'
        return trim_audio_file(mp3_path, max_seconds)
```

### WebCollector

```python
import httpx
from bs4 import BeautifulSoup

class WebCollector(BaseCollector):
    """
    Handles: any http/https URL
    Extracts: article text from <article>, <main>, or <p> tags
    """

    def can_handle(self, url: str) -> bool:
        return url.startswith('http') and 'youtube.com' not in url and 'youtu.be' not in url

    async def collect(self, url: str) -> CollectedContent:
        async with httpx.AsyncClient(follow_redirects=True, timeout=15) as client:
            r = await client.get(url, headers={'User-Agent': 'Mozilla/5.0'})
            r.raise_for_status()

        soup = BeautifulSoup(r.text, 'html.parser')

        # Remove noise
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()

        # Priority: <article> → <main> → all <p>
        article = soup.find('article') or soup.find('main')
        if article:
            text = article.get_text(separator='\n', strip=True)
        else:
            paragraphs = soup.find_all('p')
            text = '\n'.join(p.get_text(strip=True) for p in paragraphs)

        return CollectedContent(
            source="web",
            text=text[:15000],  # Cap to avoid blowing up context
            metadata={"url": url, "title": soup.title.string if soup.title else None}
        )
```

### WikipediaCollector

```python
import wikipedia

class WikipediaCollector(BaseCollector):
    """
    Handles: en.wikipedia.org/wiki/ URLs or plain name lookup
    Extracts: summary, content, first photo URL
    Special: used as auto-supplement when content is thin
    """

    def can_handle(self, input: str) -> bool:
        return 'wikipedia.org' in input or not input.startswith('http')

    async def collect(self, name_or_url: str) -> CollectedContent:
        if 'wikipedia.org' in name_or_url:
            # Extract page title from URL
            title = name_or_url.split('/wiki/')[-1].replace('_', ' ')
        else:
            title = name_or_url

        try:
            page = wikipedia.page(title, auto_suggest=True)
        except wikipedia.DisambiguationError as e:
            page = wikipedia.page(e.options[0])

        # Extract first real photo (not SVG/logo)
        photo_url = None
        for img in page.images:
            if img.lower().endswith(('.jpg', '.jpeg', '.png')) and 'logo' not in img.lower():
                photo_url = img
                break

        return CollectedContent(
            source="wikipedia",
            text=page.summary + '\n\n' + page.content[:8000],
            metadata={"url": page.url, "photo_url": photo_url}
        )
```

### TextCollector

```python
class TextCollector(BaseCollector):
    """
    Handles: raw pasted text (tweets, LinkedIn bio, show notes, anything)
    No scraping — user pastes directly.
    """

    def can_handle(self, input: str) -> bool:
        return True  # Catch-all fallback

    async def collect(self, text: str, label: str = "user_text") -> CollectedContent:
        return CollectedContent(source=label, text=text.strip())
```

### Collector dispatcher

```python
COLLECTORS = [YouTubeCollector(), WikipediaCollector(), WebCollector()]
# TextCollector is handled separately (not URL-based)

async def dispatch_collect(source: dict) -> CollectedContent | None:
    if source["type"] == "text":
        return await TextCollector().collect(source["text"], label=source.get("label", "user_text"))

    url = source["url"]
    for collector in COLLECTORS:
        if collector.can_handle(url):
            try:
                return await collector.collect(url)
            except Exception as e:
                return CollectedContent(source="error", text="", metadata={"error": str(e)})

    return None
```

---

## Runtime Knowledge Tools (Server-side Tool Execution)

This is the key Agora integration that makes custom personas actually authentic instead of just a system prompt.

### How it works (Agora `server-custom-llm` pattern)

1. Our `/chat/completions` proxy adds tools to the OpenAI request
2. The LLM returns tool calls in the SSE stream
3. Our proxy executes them server-side (searches the persona's collected content)
4. Results are fed back to the LLM as tool results
5. The LLM generates a natural response referencing the real content
6. Final text streams back to Agora → TTS → user hears it

This all happens within a single turn. Agora's custom LLM proxy pattern supports up to 5 tool-call passes per turn.

### Tool definitions

```python
PERSONA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_persona_knowledge",
            "description": (
                "Search the persona's collected content (YouTube talks, articles, social media) "
                "for information about a specific topic. Returns relevant excerpts. "
                "Use this when you need to reference something specific the persona has said "
                "or written about, or when discussing a topic they have publicly addressed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Topic, keyword, or question to search for in the persona's content"
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_persona_background",
            "description": (
                "Get the persona's biographical background, career history, and expertise areas. "
                "Use this when the conversation touches on who the persona is or their credentials."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]
```

### Tool execution in the LLM proxy

```python
# In llm_proxy.py — modified /chat/completions handler

def execute_persona_tool(tool_name: str, args: dict, persona: dict) -> str:
    """Execute a persona knowledge tool and return the result as a string."""

    if tool_name == "search_persona_knowledge":
        query = args["query"].lower()
        results = []
        for chunk in persona.get("knowledge_chunks", []):
            # Simple keyword search (upgrade to embedding search post-hackathon)
            if any(word in chunk["text"].lower() for word in query.split()):
                results.append(f"[{chunk['source']}] {chunk['text'][:500]}")
        if results:
            return "\n\n".join(results[:3])  # Top 3 matches
        return "No specific content found on this topic in the persona's collected material."

    elif tool_name == "get_persona_background":
        return (
            f"Name: {persona['name']}\n"
            f"Bio: {persona.get('bio_summary', 'Unknown')}\n"
            f"Expertise: {', '.join(persona.get('expertise_areas', []))}\n"
            f"Speech style: {persona.get('speech_style', 'Unknown')}"
        )

    return "Tool not found."
```

### How tools are injected per request

```python
async def handle_chat_completions(request):
    body = await request.json()
    channel = extract_channel(body)
    session = session_store.get(channel)
    persona = load_persona(session.persona_id)

    # Inject persona tools for custom personas
    if persona.get("type") == "custom" and persona.get("knowledge_chunks"):
        body.setdefault("tools", [])
        body["tools"].extend(PERSONA_TOOLS)

    # Forward to OpenAI
    response = await openai_stream(body)

    # If LLM returned tool calls → execute and loop (up to 5 passes)
    # This follows the server-custom-llm pattern from Agora
    for _ in range(5):
        tool_calls = extract_tool_calls(response)
        if not tool_calls:
            break
        tool_results = [execute_persona_tool(tc.name, tc.args, persona) for tc in tool_calls]
        body["messages"].append({"role": "assistant", "tool_calls": tool_calls})
        for tc, result in zip(tool_calls, tool_results):
            body["messages"].append({"role": "tool", "tool_call_id": tc.id, "content": result})
        response = await openai_stream(body)

    return response
```

### Knowledge chunks — stored in persona JSON

During the build phase, collected content is split into searchable chunks:

```python
def build_knowledge_chunks(collected_contents: list[CollectedContent]) -> list[dict]:
    """Split collected content into searchable chunks for runtime tools."""
    chunks = []
    for content in collected_contents:
        # Split on paragraph boundaries, ~500 chars each
        paragraphs = content.text.split('\n\n')
        for para in paragraphs:
            para = para.strip()
            if len(para) > 50:  # Skip tiny fragments
                chunks.append({
                    "source": content.source,
                    "text": para[:800],  # Cap individual chunk size
                })
    return chunks[:200]  # Cap total chunks to keep persona JSON manageable
```

The `knowledge_chunks` array is stored in the persona JSON alongside everything else. No external database needed for the hackathon.

---

## Custom Persona Storage Format (updated)

`backend/custom_personas/{persona_id}.json`:

```json
{
  "id": "custom_gary_tan_abc123",
  "name": "Gary Tan",
  "type": "custom",
  "created_at": "2025-04-10T12:00:00Z",

  "bio_summary": "President of Y Combinator. Former partner at Andreessen Horowitz. Early Facebook engineer.",
  "speech_style": "Direct, fast-paced, uses startup vocabulary. Asks rapid follow-up questions.",
  "characteristic_phrases": ["What's the insight here?", "Why you?", "How does this actually work?"],
  "core_beliefs": ["Founders matter more than ideas", "Move fast", "Be direct"],
  "expertise_areas": ["startups", "fundraising", "product-market fit", "founder coaching"],
  "interview_approach": "Pushes for conviction and clarity. Asks 'why you' early. Probes for traction.",

  "system_prompt": "You are Gary Tan, President of Y Combinator...",
  "greeting_script": "Hey, really glad you're here. I'm Gary. Tell me what you're building and why now.",

  "tts_vendor": "elevenlabs",
  "tts_voice_id": "el_xyz123...",
  "voice_cloned": true,

  "avatar_vendor": "heygen",
  "avatar_id": "hg_abc456...",
  "photo_url": "https://...",
  "avatar_stylized": true,

  "knowledge_chunks": [
    { "source": "youtube", "text": "The best founders have strong opinions loosely held..." },
    { "source": "youtube", "text": "When I was at Initialized, we backed Instacart because..." },
    { "source": "web", "text": "In his blog post on founder-market fit, Gary argues..." },
    { "source": "user_text", "text": "Tweet: The reason most startups fail is not..." }
  ],

  "source_summary": "3 YouTube talks (47 min), 1 blog article, user-pasted tweets",
  "has_voice_clone": true,
  "has_avatar": true
}
```

---

## Persona Synthesis Prompt (GPT-4o)

```
You are building a persona profile for an AI interview simulation.

The subject is: {name}

Source material:
---
{collected_content_text}
---

Analyze this material and return a JSON object with these exact fields:

{
  "bio_summary": "2-3 sentence bio based on the content",
  "role_context": "their professional context and why they'd be a credible interviewer",
  "speech_style": "how they actually talk — pace, vocabulary, formality, quirks, filler words",
  "characteristic_phrases": ["5-10 actual phrases, sentence starters, or verbal tics from the content"],
  "core_beliefs": ["3-5 strongly held positions/opinions evidenced in the content"],
  "expertise_areas": ["topic1", "topic2", ...],
  "interview_approach": "how they'd approach evaluating someone — what they care about, how they push back",
  "greeting_script": "A 1-2 sentence opening greeting in their voice and style",
  "system_prompt": "A complete system prompt (300-500 words) for an AI to embody this person during an interview"
}

Rules for the system_prompt:
- Open: "You are {name}. [one-line context]. Speak exactly as {name} speaks."
- Include speech style instructions with examples from characteristic_phrases
- Include what topics they care about and how they challenge interviewees
- Include 3-4 example phrases they actually use
- Close: "You have access to tools that let you search your actual content. Use them when the conversation touches on a topic you've publicly addressed. Stay in character at all times."
```

---

## Voice Cloning (ElevenLabs)

```python
import yt_dlp
from elevenlabs.client import ElevenLabs

async def clone_voice_from_youtube(name: str, youtube_url: str) -> str:
    """Download audio, trim, clone voice. Returns ElevenLabs voice_id."""
    collector = YouTubeCollector()
    audio_bytes = await collector.extract_audio(youtube_url, max_seconds=120)

    client = ElevenLabs(api_key=PP_ELEVENLABS_API_KEY)
    voice = client.voices.add(
        name=f"pp_{name.lower().replace(' ', '_')}_{uuid4().hex[:6]}",
        files=[audio_bytes],
        description=f"PersonaPrep clone of {name}"
    )
    return voice.voice_id
```

**Dependencies**: `pip install yt-dlp elevenlabs` + `brew install ffmpeg`.

---

## HeyGen Instant Avatar (from cartoonized image)

The input photo is **always cartoonized first** via `cartoonize_photo()` before being sent to HeyGen. This ensures the avatar is a stylized illustration, not a photorealistic deepfake.

```python
import httpx

HEYGEN_BASE = "https://api.heygen.com"

async def create_avatar_from_file(image_path: str, name: str, api_key: str) -> str:
    """Upload a cartoonized image file to HeyGen Instant Avatar."""
    async with httpx.AsyncClient() as client:
        with open(image_path, 'rb') as f:
            r = await client.post(
                f"{HEYGEN_BASE}/v2/photo_avatar/avatar",
                headers={"X-Api-Key": api_key},
                files={"image": (f"{name}.jpg", f, "image/jpeg")},
                data={"name": f"{name} (stylized)"}
            )
        r.raise_for_status()
        return r.json()["data"]["avatar_id"]

async def poll_avatar_ready(avatar_id: str, api_key: str, timeout_s: int = 120) -> bool:
    deadline = time.time() + timeout_s
    async with httpx.AsyncClient() as client:
        while time.time() < deadline:
            r = await client.get(
                f"{HEYGEN_BASE}/v2/photo_avatar/avatar/{avatar_id}",
                headers={"X-Api-Key": api_key}
            )
            status = r.json()["data"]["status"]
            if status == "completed":
                return True
            if status == "failed":
                return False
            await asyncio.sleep(5)
    return False
```

**Important**: Must be "interactive" Instant Avatar type for real-time streaming with Agora. Verify in HeyGen console. The cartoonized input image is intentionally stylized — the resulting avatar will look like an animated illustration, not a real person.

---

## New API Contract

### `POST /personas/build`

**Request:**
```json
{
  "name": "Gary Tan",
  "sources": [
    { "type": "youtube", "url": "https://youtube.com/watch?v=..." },
    { "type": "youtube", "url": "https://youtube.com/watch?v=..." },
    { "type": "url",  "url": "https://blog.garrytan.com/..." },
    { "type": "text", "text": "Gary's tweets:\n...", "label": "twitter" }
  ],
  "photo_url": "https://example.com/gary_tan.jpg"
}
```

No `clone_voice` flag — voice cloning is automatic if YouTube URLs are present. No photo_url → system tries Wikipedia → falls back to voice-only.

**Response:**
```json
{ "job_id": "job_abc123" }
```

### `GET /personas/build/{job_id}`

```json
{
  "status": "collecting" | "synthesizing" | "cloning_voice" | "building_avatar" | "done" | "failed",
  "progress_label": "Extracting YouTube transcripts...",
  "persona_id": "custom_gary_tan_abc123",
  "error": null
}
```

### `GET /personas`

Returns built-in + completed custom personas:
```json
{
  "personas": [
    { "id": "skeptical_technical", "name": "Skeptical Technical", "type": "builtin", ... },
    { "id": "custom_gary_tan_abc123", "name": "Gary Tan", "type": "custom",
      "has_voice_clone": true, "has_avatar": true, "source_summary": "3 YouTube videos, 1 article, tweets" }
  ]
}
```

### `StartInterviewRequest` — no change

`persona_id` accepts any string. Custom persona IDs work identically to built-in ones.

---

## Backend File Structure (new + modified)

```
backend/
├── collectors/
│   ├── __init__.py          # dispatch_collect, COLLECTORS list
│   ├── base.py              # BaseCollector, CollectedContent
│   ├── youtube.py           # YouTubeCollector (transcripts + audio + metadata)
│   ├── web.py               # WebCollector (httpx + BeautifulSoup)
│   ├── wikipedia.py         # WikipediaCollector (text + photo lookup)
│   └── text.py              # TextCollector (passthrough for pasted content)
├── persona_builder.py       # Orchestrates: collect → synthesize → voice → avatar → save
├── persona_synthesizer.py   # GPT-4o persona profile generation
├── voice_cloner.py          # ElevenLabs voice clone + gender-based defaults
├── avatar_builder.py        # HeyGen Instant Avatar + Wikipedia photo fallback
├── persona_tools.py         # PERSONA_TOOLS definitions + execute_persona_tool()
├── custom_personas/         # File-based storage
│   └── {persona_id}.json
├── server.py                # (modified) new /personas/* endpoints
├── llm_proxy.py             # (modified) tool injection for custom personas
└── personas.py              # (modified) load_persona() checks custom_personas/ first
```

---

## New Environment Variables

```bash
PP_ELEVENLABS_API_KEY=...         # Voice cloning + default voices
PP_HEYGEN_API_KEY=...             # Instant Avatar (can reuse PP_AVATAR_API_KEY)
PP_CUSTOM_PERSONAS_DIR=./custom_personas
```

**Host requirements**: `pip install yt-dlp elevenlabs gender-guesser wikipedia beautifulsoup4 opencv-python-headless` + `brew install ffmpeg`

---

## Agora-specific Constraints

1. **TTS sample rate** — ElevenLabs requires `24000` Hz. Already correct for HeyGen. No change.
2. **ElevenLabs model** — use `eleven_turbo_v2` (lowest latency). `eleven_multilingual_v2` adds ~300ms/turn.
3. **Avatar type** — must be "interactive" Instant Avatar. Standard HeyGen avatars don't stream.
4. **Avatar safety** — input photos are ALWAYS cartoonized via `cv2.stylization()` before avatar creation. Never pass raw photos to HeyGen. The resulting avatar is a stylized illustration, not a photorealistic deepfake.
4. **`remote_rtc_uids`** — stays `["101"]` when avatar enabled. Same as existing constraint.
5. **`/speak` timing** — fire greeting 3s post-`/join`. Agent takes ~2s to join; earlier = user misses the start.
6. **Tool execution latency** — keyword search over 200 chunks is <10ms. No impact on turn latency. Post-hackathon, upgrade to embedding search for accuracy.

---

## Demo Script for Gary Tan

**Pre-demo (night before):**
1. `POST /personas/build` with 3 Gary Tan YouTube URLs + pasted tweets + photo URL
2. Wait ~2-3 min for full build
3. Confirm voice clone + avatar are ready
4. Run one test interview to validate

**Live demo (judges watching):**
1. Open Setup page → click "Custom"
2. Type "Gary Tan" → paste 1 YouTube URL → paste a few tweets → photo URL
3. Click "Build Persona" → show progress labels updating in real time
4. Select the Gary Tan card → "Start Interview"
5. Gary Tan's avatar appears, his cloned voice says: "Hey! Tell me what you're building."
6. Ask about startups → agent uses `search_persona_knowledge` to reference his real YC advice
7. End interview → feedback page scores the conversation

**If build takes too long for live demo**: pre-built Gary Tan is already available. Demo the build UI, then switch to pre-built card for the actual interview.

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| ElevenLabs clone quality varies | Use clean YC presentation audio; 30-60s of speech is sufficient. If clone sounds off → `resolve_voice` falls back to gender-default voice |
| HeyGen avatar fails to build | `resolve_avatar` falls back to voice-only. Not a blocker — demo still works |
| YouTube transcript unavailable (private/no captions) | Skip that video, try next. If all fail, rely on pasted text + Wikipedia auto-supplement |
| `yt-dlp` breaks on specific videos | Use public YC conference talks (no age-gate, no restrictions) |
| Persona build takes 3+ min | Pre-build before demo. Build UI is shown for judges but pre-built card used for actual interview |
| `gender-guesser` misclassifies name | Safe default is "Adam" (male voice). User can always re-build with different sources |
| Tool search returns irrelevant chunks | Keyword search is good enough for demo. Cap at 3 results. Post-hackathon: embedding search |
| LLM drifts from persona | System prompt includes `"Stay in character"` + example phrases + `"Use your tools when relevant"` |
| Cartoonized avatar looks too different from the person | `sigma_s=150, sigma_r=0.25` preserves facial structure while clearly stylizing. Tune saturation boost if needed. Recognizable but obviously not real — that's the point |
| Legal/ethical concern | Disclaimer on every interview page: "Stylized AI training persona. Simulated from public content. Not a real likeness. Not affiliated with {name}." Avatar is visibly cartoonish to reinforce this |
