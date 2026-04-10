import asyncio, json, logging, os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv(override=True)
logger = logging.getLogger("personaprep.synthesizer")

LLM_API_KEY = os.environ.get("PP_LLM_API_KEY", "")
# Use OpenAI for synthesis (quality matters here, not latency)
SYNTH_BASE_URL = os.environ.get("PP_SYNTH_BASE_URL", "https://api.openai.com/v1")
SYNTH_MODEL = os.environ.get("PP_SYNTH_MODEL", "gpt-4o")

MAX_RETRIES = 3
RETRY_BACKOFF = [2, 5, 10]  # seconds between retries


async def synthesize_persona(name: str, collected_text: str) -> dict:
    """Send collected content to GPT-4o and get back a structured persona profile.

    Retries up to MAX_RETRIES times on transient errors (503, 429, timeouts).
    """
    client = AsyncOpenAI(api_key=LLM_API_KEY, base_url=SYNTH_BASE_URL)

    prompt = f"""You are building a persona profile for an AI interview simulation.

The subject is: {name}

Source material:
---
{collected_text[:12000]}
---

Analyze this material and return a JSON object with these exact fields:

{{
  "bio_summary": "2-3 sentence bio based on the content",
  "role_context": "their professional context and why they'd be a credible interviewer",
  "speech_style": "how they actually talk — pace, vocabulary, formality, quirks",
  "characteristic_phrases": ["5-10 actual phrases or sentence starters from the content"],
  "core_beliefs": ["3-5 strongly held positions evidenced in the content"],
  "expertise_areas": ["topic1", "topic2", ...],
  "interview_approach": "how they'd approach evaluating someone",
  "greeting_script": "A 1-2 sentence opening greeting in their voice and style",
  "system_prompt": "A complete system prompt (300-500 words) for an AI to embody this person during an interview"
}}

Rules for the system_prompt:
- Open: "You are {{name}}. [one-line context]. Speak exactly as {{name}} speaks."
- Include speech style instructions with examples from characteristic_phrases
- Include what topics they care about and how they challenge interviewees
- Close: "You have access to tools that let you search your actual content. Use them when relevant. Stay in character at all times."
"""

    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            resp = await client.chat.completions.create(
                model=SYNTH_MODEL,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.7,
            )
            raw = resp.choices[0].message.content
            return json.loads(raw)
        except Exception as e:
            last_error = e
            err_str = str(e)
            is_retryable = any(code in err_str for code in ("503", "429", "timeout", "overloaded", "high demand"))
            if not is_retryable or attempt >= MAX_RETRIES:
                raise
            wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
            logger.warning(
                "Synthesis attempt %d/%d failed (%s), retrying in %ds...",
                attempt + 1, MAX_RETRIES + 1, err_str[:120], wait,
            )
            await asyncio.sleep(wait)

    raise last_error  # unreachable, but satisfies type checker
