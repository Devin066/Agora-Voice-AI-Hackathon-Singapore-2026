"""OpenAI-format tool definitions for custom personas.

When the LLM proxy handles a custom persona, these tools are injected into
the OpenAI request.  If the LLM returns tool calls, the proxy executes them
server-side via ``execute_persona_tool`` and feeds results back (up to 5
passes per turn).
"""

from __future__ import annotations

from typing import Any


PERSONA_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_persona_knowledge",
            "description": (
                "Search the persona's collected content (articles, transcripts, "
                "posts) for excerpts relevant to a query. Returns the top 3 "
                "matching chunks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": (
                            "A natural-language search query describing the "
                            "topic or question to look up."
                        ),
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_persona_background",
            "description": (
                "Retrieve the persona's biographical summary, areas of "
                "expertise, and speech style."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


def _score_chunk(chunk_text: str, query_words: list[str]) -> int:
    lower_text = chunk_text.lower()
    return sum(1 for w in query_words if w in lower_text)


def execute_persona_tool(
    tool_name: str,
    args: dict[str, Any],
    persona_data: dict[str, Any],
) -> str:
    """Execute a persona tool call and return the result string."""

    if tool_name == "search_persona_knowledge":
        query = args.get("query", "")
        chunks: list[dict[str, Any]] = persona_data.get("knowledge_chunks", [])
        if not chunks:
            return "No knowledge chunks available for this persona."

        query_words = [w.lower() for w in query.split() if w]
        if not query_words:
            return "Empty query."

        scored = [
            (_score_chunk(c.get("text", ""), query_words), i, c)
            for i, c in enumerate(chunks)
        ]
        scored.sort(key=lambda t: (-t[0], t[1]))
        top = scored[:3]

        if top[0][0] == 0:
            return "No relevant excerpts found for that query."

        parts = [f"[{c.get('source', 'unknown')}] {c.get('text', '')}" for _, _, c in top]
        return "\n\n".join(parts)

    if tool_name == "get_persona_background":
        bio = persona_data.get("bio_summary", "No bio available.")
        expertise = persona_data.get("expertise_areas", [])
        style = persona_data.get("speech_style", "No speech style defined.")
        return (
            f"Bio: {bio}\n"
            f"Expertise: {', '.join(expertise) if expertise else 'Not specified.'}\n"
            f"Speech style: {style}"
        )

    return "Tool not found."
