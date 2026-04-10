import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from personas import PERSONAS, PersonaCard, render_system_prompt

EXPECTED_IDS = [
    "skeptical_technical",
    "friendly_recruiter",
    "startup_founder",
    "senior_hiring_manager",
]


class TestPersonaCard:
    def test_all_four_personas_exist(self):
        assert set(PERSONAS.keys()) == set(EXPECTED_IDS)

    def test_each_persona_is_a_persona_card(self):
        for pid, persona in PERSONAS.items():
            assert isinstance(persona, PersonaCard), f"{pid} is not a PersonaCard"

    def test_id_matches_key(self):
        for pid, persona in PERSONAS.items():
            assert persona.id == pid

    def test_required_fields_populated(self):
        for pid, persona in PERSONAS.items():
            assert persona.name, f"{pid} missing name"
            assert persona.description, f"{pid} missing description"
            assert persona.tts_voice, f"{pid} missing tts_voice"
            assert len(persona.focus_areas) > 0, f"{pid} missing focus_areas"
            assert len(persona.example_phrases) > 0, f"{pid} missing example_phrases"
            assert len(persona.tone_tags) > 0, f"{pid} missing tone_tags"

    def test_tone_scores_in_range(self):
        for pid, persona in PERSONAS.items():
            assert 1 <= persona.directness <= 10, f"{pid} directness out of range"
            assert 1 <= persona.warmth <= 10, f"{pid} warmth out of range"
            assert 1 <= persona.skepticism <= 10, f"{pid} skepticism out of range"
            assert 1 <= persona.follow_up_heaviness <= 10, f"{pid} follow_up_heaviness out of range"

    def test_skeptical_technical_is_high_skepticism(self):
        p = PERSONAS["skeptical_technical"]
        assert p.skepticism >= 8
        assert p.warmth <= 4

    def test_friendly_recruiter_is_high_warmth(self):
        p = PERSONAS["friendly_recruiter"]
        assert p.warmth >= 8
        assert p.skepticism <= 4


class TestRenderSystemPrompt:
    def test_returns_nonempty_string(self):
        prompt = render_system_prompt("skeptical_technical", "AI Engineer", "technical", "hard")
        assert isinstance(prompt, str)
        assert len(prompt) > 100

    def test_includes_role_and_type(self):
        prompt = render_system_prompt("friendly_recruiter", "Product Manager", "behavioral", "easy")
        assert "Product Manager" in prompt
        assert "behavioral" in prompt
        assert "easy" in prompt

    def test_includes_persona_focus_areas(self):
        prompt = render_system_prompt("skeptical_technical", "SWE", "technical", "hard")
        persona = PERSONAS["skeptical_technical"]
        for area in persona.focus_areas:
            assert area in prompt

    def test_includes_safety_disclaimer(self):
        prompt = render_system_prompt("startup_founder", "SWE", "technical", "medium")
        assert "AI" in prompt.lower() or "not a real" in prompt.lower()
