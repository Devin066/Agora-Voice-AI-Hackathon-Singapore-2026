import json
import logging
import os
from dataclasses import dataclass

logger = logging.getLogger("personaprep.personas")

CUSTOM_PERSONAS_DIR = os.environ.get(
    "PP_CUSTOM_PERSONAS_DIR",
    os.path.join(os.path.dirname(__file__), "custom_personas"),
)


@dataclass
class PersonaCard:
    id: str
    name: str
    description: str
    tts_voice: str
    directness: int
    warmth: int
    skepticism: int
    follow_up_heaviness: int
    asks_for_examples: bool
    tests_tradeoffs: bool
    focus_areas: list[str]
    example_phrases: list[str]
    tone_tags: list[str]


PERSONAS: dict[str, PersonaCard] = {
    "skeptical_technical": PersonaCard(
        id="skeptical_technical",
        name="Skeptical Technical Interviewer",
        description="Blunt, pushes for depth, asks 'why' repeatedly. Challenges vague answers and tests tradeoffs.",
        tts_voice="alloy",
        directness=9,
        warmth=3,
        skepticism=9,
        follow_up_heaviness=9,
        asks_for_examples=True,
        tests_tradeoffs=True,
        focus_areas=["technical depth", "system design", "tradeoffs", "ownership"],
        example_phrases=["Be specific.", "What was the actual tradeoff?", "How do you know that worked?"],
        tone_tags=["direct", "skeptical", "technical"],
    ),
    "friendly_recruiter": PersonaCard(
        id="friendly_recruiter",
        name="Friendly Recruiter",
        description="Warm and conversational. Focuses on motivation and culture fit with softer pacing.",
        tts_voice="nova",
        directness=4,
        warmth=9,
        skepticism=3,
        follow_up_heaviness=4,
        asks_for_examples=True,
        tests_tradeoffs=False,
        focus_areas=["motivation", "culture fit", "communication", "career goals"],
        example_phrases=["That's interesting, tell me more.", "What excites you about this role?", "How would your team describe you?"],
        tone_tags=["warm", "conversational", "supportive"],
    ),
    "startup_founder": PersonaCard(
        id="startup_founder",
        name="Startup Founder",
        description="Fast-paced, execution-focused. Low patience for fluff — asks about ownership, speed, and impact.",
        tts_voice="onyx",
        directness=8,
        warmth=5,
        skepticism=7,
        follow_up_heaviness=7,
        asks_for_examples=True,
        tests_tradeoffs=True,
        focus_areas=["execution speed", "ownership", "impact", "resourcefulness"],
        example_phrases=["What did you actually ship?", "How fast?", "What would you do differently?"],
        tone_tags=["fast-paced", "direct", "execution-focused"],
    ),
    "senior_hiring_manager": PersonaCard(
        id="senior_hiring_manager",
        name="Senior Hiring Manager",
        description="Structured, evaluates impact and tradeoffs. Probes teamwork, judgment, and communication.",
        tts_voice="echo",
        directness=7,
        warmth=6,
        skepticism=6,
        follow_up_heaviness=6,
        asks_for_examples=True,
        tests_tradeoffs=True,
        focus_areas=["judgment", "teamwork", "impact", "communication"],
        example_phrases=["Walk me through your decision-making.", "How did you handle disagreement?", "What was the measurable outcome?"],
        tone_tags=["structured", "professional", "evaluative"],
    ),
}


def _tone_description(persona: PersonaCard) -> str:
    parts = []
    if persona.directness >= 7:
        parts.append("very direct")
    elif persona.directness <= 4:
        parts.append("gentle and indirect")

    if persona.warmth >= 7:
        parts.append("warm and encouraging")
    elif persona.warmth <= 4:
        parts.append("cool and reserved")

    if persona.skepticism >= 7:
        parts.append("highly skeptical of vague answers")
    elif persona.skepticism <= 4:
        parts.append("generally trusting")

    return ", ".join(parts) if parts else "balanced and professional"


def render_system_prompt(
    persona_id: str, role: str, interview_type: str, difficulty: str
) -> str:
    persona = PERSONAS[persona_id]
    tone = _tone_description(persona)
    focus = ", ".join(persona.focus_areas)
    phrases = "; ".join(persona.example_phrases)

    return f"""You are an AI-generated mock interview persona for professional practice.
You are NOT a real person.

Style: {tone}
Role: Interview the candidate for a {role} position ({interview_type} round, {difficulty} difficulty).

Rules:
- Ask ONE question at a time
- Push for specifics when answers are vague
- Ask follow-up questions if: no concrete example, impact unclear, reasoning weak
- Move on if: answer is strong, or 3+ follow-ups already asked on this question
- Do NOT help the candidate answer
- Do NOT break character
- Keep responses under 40 words for voice delivery

Focus on: {focus}

Example phrasing: {phrases}

Disclaimer: You are an AI training persona, not a real interviewer."""


def load_custom_persona(persona_id: str) -> dict | None:
    """Load a custom persona JSON from disk. Returns None if not found."""
    path = os.path.join(CUSTOM_PERSONAS_DIR, f"{persona_id}.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to load custom persona %s: %s", persona_id, e)
        return None


def load_persona(persona_id: str) -> dict | None:
    """Load a persona by ID. Checks custom personas first, falls back to built-in."""
    custom = load_custom_persona(persona_id)
    if custom:
        return custom
    if persona_id in PERSONAS:
        return {"id": persona_id, "type": "builtin", "name": PERSONAS[persona_id].name}
    return None


def list_all_personas() -> list[dict]:
    """Return built-in + custom personas for the /personas endpoint."""
    result = []
    for p in PERSONAS.values():
        result.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "tone_tags": p.tone_tags,
            "type": "builtin",
        })

    if os.path.isdir(CUSTOM_PERSONAS_DIR):
        for fname in sorted(os.listdir(CUSTOM_PERSONAS_DIR)):
            if not fname.endswith(".json"):
                continue
            try:
                with open(os.path.join(CUSTOM_PERSONAS_DIR, fname)) as f:
                    data = json.load(f)
                result.append({
                    "id": data["id"],
                    "name": data["name"],
                    "description": data.get("bio_summary", ""),
                    "tone_tags": [],
                    "type": "custom",
                    "has_voice_clone": data.get("has_voice_clone", False),
                    "has_avatar": data.get("has_avatar", False),
                    "source_summary": data.get("source_summary", ""),
                })
            except Exception as e:
                logger.warning("Skipping malformed persona file %s: %s", fname, e)

    return result
