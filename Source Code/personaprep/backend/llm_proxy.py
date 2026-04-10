import json
import logging
import os
import re
import time
from typing import Any, AsyncGenerator

import httpx
from dotenv import load_dotenv
from fastapi.responses import StreamingResponse

from personas import render_system_prompt, load_custom_persona
from persona_tools import PERSONA_TOOLS, execute_persona_tool
from session_store import SessionState, TranscriptTurn, get_session

load_dotenv(override=True)

logger = logging.getLogger("personaprep.llm_proxy")

LLM_API_KEY = os.environ.get("PP_LLM_API_KEY", "")

# Default to Google Gemini's OpenAI-compatible endpoint so the backend works
# against Gemini's free tier out of the box. Override via PP_LLM_BASE_URL to
# point at any OpenAI-compatible provider (OpenAI, Groq, Together, Ollama, etc.)
DEFAULT_LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
LLM_BASE_URL = os.environ.get("PP_LLM_BASE_URL", DEFAULT_LLM_BASE_URL).rstrip("/")
LLM_CHAT_URL = f"{LLM_BASE_URL}/chat/completions"

if not LLM_API_KEY:
    logger.warning("PP_LLM_API_KEY is not set — LLM calls will fail with 401")


def strip_agora_params(body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Remove Agora-specific `params` from the request body.

    Returns (cleaned_body, extracted_params).
    Does not mutate the original dict.
    """
    cleaned = {k: v for k, v in body.items() if k != "params"}
    params = body.get("params", {})
    return cleaned, params


def build_llm_headers(api_key: str) -> dict[str, str]:
    """Build auth headers for any OpenAI-compatible LLM endpoint."""
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def extract_channel(body: dict[str, Any]) -> str | None:
    """Pull the channel name out of the Agora `params` block."""
    params = body.get("params") or {}
    return params.get("channel")


def build_context_block(session: SessionState) -> str:
    """Build a per-turn context block that guides the interviewer's behavior."""
    previous = session.questions_asked[-3:]
    previous_str = "; ".join(previous) if previous else "none"

    if session.question_count == 0:
        instruction = "Ask your opening question."
    elif session.question_count >= 4:
        instruction = "Begin wrapping up — ask one final question."
    else:
        instruction = (
            "Continue the interview. Follow up if the last answer was vague, "
            "or move to the next topic."
        )

    return (
        "Session context:\n"
        f"- Role being interviewed for: {session.role}\n"
        f"- Interview type: {session.interview_type}\n"
        f"- Difficulty: {session.difficulty}\n"
        f"- Questions asked so far: {session.question_count}\n"
        f"- Previous questions: {previous_str}\n\n"
        f"{instruction}"
    )


def build_injected_messages(
    session: SessionState, original_messages: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Prepend a persona + context system message to the original messages."""
    persona_prompt = render_system_prompt(
        session.persona_id, session.role, session.interview_type, session.difficulty
    )
    context = build_context_block(session)
    system_message = {
        "role": "system",
        "content": f"{persona_prompt}\n\n{context}",
    }
    return [system_message, *original_messages]


def extract_question(text: str, max_chars: int = 200) -> str:
    """Extract the interviewer's question from a full LLM reply.

    Prefers the last sentence ending in `?`. Falls back to a truncated version
    of the full text. Prevents `questions_asked` from ballooning across turns.
    """
    text = text.strip()
    if not text:
        return ""
    # Find all sentences ending in ? (greedy matches split by punctuation/newline)
    question_matches = re.findall(r"[^.!?\n]*\?", text)
    if question_matches:
        candidate = question_matches[-1].strip()
    else:
        candidate = text
    if len(candidate) > max_chars:
        candidate = candidate[: max_chars - 1].rstrip() + "…"
    return candidate


def parse_sse_content(sse_bytes: bytes) -> str:
    """Parse an OpenAI SSE stream and concatenate all delta.content fragments."""
    text = sse_bytes.decode("utf-8", errors="replace")
    parts: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[len("data:"):].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        for choice in obj.get("choices", []):
            delta = choice.get("delta", {})
            content = delta.get("content")
            if content:
                parts.append(content)
    return "".join(parts)


def _synthetic_error_sse(message: str) -> bytes:
    """Build a minimal SSE chunk that Agora will log instead of hanging silently."""
    payload = {
        "choices": [
            {
                "delta": {"content": f"[proxy error: {message}]"},
                "index": 0,
                "finish_reason": "stop",
            }
        ]
    }
    return (
        f"data: {json.dumps(payload)}\n\n".encode("utf-8")
        + b"data: [DONE]\n\n"
    )


async def stream_llm_response(body: dict[str, Any]) -> AsyncGenerator[bytes, None]:
    """Forward request to the configured LLM endpoint and yield SSE chunks.

    Works with any OpenAI-compatible provider (Gemini, OpenAI, Groq, etc.).
    On upstream error, yields a synthetic SSE content chunk so Agora gets a
    complete SSE response instead of a silently-truncated stream.
    """
    headers = build_llm_headers(LLM_API_KEY)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", LLM_CHAT_URL, json=body, headers=headers) as resp:
                if resp.status_code >= 400:
                    err_body = (await resp.aread())[:300].decode("utf-8", errors="replace")
                    logger.error("LLM upstream error: status=%s body=%s", resp.status_code, err_body)
                    yield _synthetic_error_sse(f"llm {resp.status_code}")
                    return
                async for chunk in resp.aiter_bytes():
                    yield chunk
    except httpx.HTTPError as e:
        logger.error("LLM request failed: %s", e)
        yield _synthetic_error_sse(f"network {type(e).__name__}")




def capture_candidate_turn(
    session: SessionState, messages: list[dict[str, Any]]
) -> None:
    """Extract the last user message from Agora's messages array and append it
    to the session transcript as a candidate turn.

    Deduplicates: if the last transcript candidate turn already has this text,
    do nothing (prevents double-append when Agora retries the same turn).
    """
    last_user = None
    for msg in reversed(messages):
        if msg.get("role") == "user":
            last_user = msg
            break
    if last_user is None:
        return
    text = (last_user.get("content") or "").strip()
    if not text:
        return

    # Dedupe: check if the most recent candidate turn has the same text
    for turn in reversed(session.transcript):
        if turn.role == "candidate":
            if turn.text == text:
                return
            break

    turn_id = len(session.transcript) + 1
    session.transcript.append(
        TranscriptTurn(
            role="candidate",
            text=text,
            turn_id=turn_id,
            timestamp=time.time(),
        )
    )


def _commit_turn(session: SessionState, collected: list[bytes]) -> None:
    """Parse collected SSE bytes and update the session transcript + counters.

    Safe to call even if the stream errored partway — commits whatever text
    was captured. Skips synthetic proxy-error payloads.
    """
    if not collected:
        return
    full_text = parse_sse_content(b"".join(collected))
    if not full_text or full_text.startswith("[proxy error"):
        return
    turn_id = len(session.transcript) + 1
    session.transcript.append(
        TranscriptTurn(
            role="interviewer",
            text=full_text,
            turn_id=turn_id,
            timestamp=time.time(),
        )
    )
    session.question_count += 1
    session.questions_asked.append(extract_question(full_text))


async def _stream_and_capture(
    body: dict[str, Any], session: SessionState | None
) -> AsyncGenerator[bytes, None]:
    """Stream OpenAI response, forward chunks, and capture full text for transcript.

    Uses try/finally so the transcript is committed even if streaming errors mid-way.
    NOTE: `_sessions` dict is not locked — concurrent turns on the same channel
    would race. Agora sends sequential turns per channel so this is safe today.
    """
    collected: list[bytes] = []
    try:
        async for chunk in stream_llm_response(body):
            collected.append(chunk)
            yield chunk
    except Exception as e:
        logger.error("Stream failed mid-flight: %s", e)
        # Yield a synthetic error SSE so Agora sees a complete stream
        yield _synthetic_error_sse(f"stream {type(e).__name__}")
    finally:
        if session is not None:
            _commit_turn(session, collected)


async def forward_to_openai(body: dict[str, Any]) -> StreamingResponse:
    """Inject persona + context, strip Agora params, proxy to the configured
    LLM provider (Gemini by default), and capture the interviewer turn into
    the session transcript after the stream completes.

    For custom personas with knowledge_chunks, injects PERSONA_TOOLS so the
    LLM can search the persona's real content during conversation."""
    cleaned, _params = strip_agora_params(body)
    channel = extract_channel(body)
    session = get_session(channel) if channel else None

    if session is not None:
        original_messages = cleaned.get("messages", [])
        # Capture candidate's latest answer before building the injected prompt
        capture_candidate_turn(session, original_messages)
        cleaned["messages"] = build_injected_messages(session, original_messages)

        # Inject persona knowledge tools for custom personas
        custom = load_custom_persona(session.persona_id) if session.persona_id.startswith("custom_") else None
        if custom and custom.get("knowledge_chunks"):
            cleaned.setdefault("tools", [])
            cleaned["tools"].extend(PERSONA_TOOLS)

    return StreamingResponse(
        _stream_and_capture(cleaned, session),
        media_type="text/event-stream",
    )
