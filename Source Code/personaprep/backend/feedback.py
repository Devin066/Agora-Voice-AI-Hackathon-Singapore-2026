import json
import logging
import os
from typing import Any

import httpx
from dotenv import load_dotenv

from llm_proxy import LLM_CHAT_URL, build_llm_headers
from personas import PERSONAS
from session_store import SessionState

load_dotenv(override=True)

logger = logging.getLogger("personaprep.feedback")

LLM_API_KEY = os.environ.get("PP_LLM_API_KEY", "")
FEEDBACK_MODEL = os.environ.get("PP_FEEDBACK_MODEL", "gpt-4o-mini")


def format_transcript(session: SessionState) -> str:
    """Format the session transcript as [Interviewer]/[Candidate] labeled lines."""
    lines: list[str] = []
    for turn in session.transcript:
        label = "Interviewer" if turn.role == "interviewer" else "Candidate"
        lines.append(f"[{label}] {turn.text}")
    return "\n".join(lines)


def build_feedback_prompt(session: SessionState, transcript_text: str) -> str:
    """Build the evaluation prompt for the feedback LLM call."""
    persona = PERSONAS.get(session.persona_id)
    persona_name = persona.name if persona else session.persona_id

    return f"""You are an interview coach reviewing a mock interview transcript.

Candidate was interviewing for: {session.role} ({session.interview_type} round, {session.difficulty} difficulty)
Interviewer persona: {persona_name}

Transcript:
{transcript_text}

Evaluate using this rubric and return valid JSON only:
- clarity (0-10): was the answer clear and well-structured?
- specificity (0-10): did they give concrete examples and numbers?
- technical_depth (0-10): did they demonstrate depth appropriate for the role?
- confidence (0-10): did they sound assured, not rambling?

Return JSON with this exact shape:
{{
  "overall_score": <average of rubric scores>,
  "summary": "<one paragraph summary>",
  "rubric": {{ "clarity": x, "specificity": x, "technical_depth": x, "confidence": x }},
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "improved_answer_examples": [
    {{ "question": "...", "suggestion": "..." }}
  ]
}}

Cite exact phrases from the transcript in strengths and weaknesses. Be specific, not generic.
"""


REQUIRED_TOP_FIELDS = {"overall_score", "summary", "rubric"}
REQUIRED_RUBRIC_FIELDS = {"clarity", "specificity", "technical_depth", "confidence"}


def _coerce_number(value: Any, field: str) -> float:
    """Coerce LLM-returned score to float. Clamps to [0, 10]."""
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Feedback field {field} is not numeric: {value!r}")
    return max(0.0, min(10.0, n))


def parse_feedback_response(raw: str) -> dict[str, Any]:
    """Parse and validate the LLM's JSON response.

    Raises ValueError if JSON is malformed, required fields are missing,
    or types are wrong. Fills missing optional list fields with empty lists
    and coerces numeric fields to floats clamped to [0, 10].
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Feedback response is not valid JSON: {e}")

    if not isinstance(data, dict):
        raise ValueError(f"Feedback response must be a JSON object, got {type(data).__name__}")

    missing = REQUIRED_TOP_FIELDS - data.keys()
    if missing:
        raise ValueError(f"Feedback response missing required fields: {missing}")

    rubric = data.get("rubric")
    if not isinstance(rubric, dict):
        raise ValueError(f"Feedback rubric must be an object, got {type(rubric).__name__}")

    missing_rubric = REQUIRED_RUBRIC_FIELDS - rubric.keys()
    if missing_rubric:
        raise ValueError(f"Feedback rubric missing fields: {missing_rubric}")

    # Coerce rubric scores to [0, 10] floats
    for key in REQUIRED_RUBRIC_FIELDS:
        rubric[key] = _coerce_number(rubric[key], f"rubric.{key}")

    data["overall_score"] = _coerce_number(data["overall_score"], "overall_score")

    if not isinstance(data.get("summary", ""), str):
        raise ValueError("Feedback summary must be a string")

    # Fill optional list fields
    data.setdefault("strengths", [])
    data.setdefault("weaknesses", [])
    data.setdefault("improved_answer_examples", [])

    return data


async def generate_feedback(session: SessionState) -> dict[str, Any]:
    """Call the configured LLM with the feedback prompt and return parsed dict.

    Works with any OpenAI-compatible provider via PP_LLM_BASE_URL. Default is
    Google Gemini's OpenAI-compat endpoint so the free tier works out of the box.
    """
    if not session.transcript:
        raise ValueError("Cannot generate feedback — session transcript is empty")

    transcript_text = format_transcript(session)
    prompt = build_feedback_prompt(session, transcript_text)

    request_body = {
        "model": FEEDBACK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
    }
    headers = build_llm_headers(LLM_API_KEY)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(LLM_CHAT_URL, json=request_body, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    content = data["choices"][0]["message"]["content"]
    return parse_feedback_response(content)
