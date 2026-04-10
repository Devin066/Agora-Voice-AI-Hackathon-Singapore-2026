# AGENTS.md

## Goal

Build an AI autonomous voice agent-powered Cluedo-style game for the Agora Voice AI hackathon.

The product is a detective game where the player investigates murders by moving through a stylized Godot map, observing environmental clues, and speaking in real time with autonomous NPCs powered by Agora voice technology.

## Product Direction

This project is not a generic chatbot demo. The core experience is:

- A navigable Godot map with multiple distinct rooms.
- Around 4 NPCs moving through the map with role-driven behavior.
- One NPC is the murderer.
- Interactable world objects such as hiding spots, sound makers, and murder weapons.
- A round structure where the detective has 1 minute to investigate before blackout.
- Murders only occur during blackout windows.
- The player solves cases by identifying the correct murderer, weapon, and location.

The main differentiator is live voice interrogation. The player should be able to talk to NPCs naturally and use what they hear, plus automatically captured evidence, to reason about truth, lies, motive, and timeline.

## Definition Of Done

Prefer the smallest interpretation that advances the playable vertical slice. For most tasks, done means:

- The change clearly supports the voice-driven detective game described here.
- The implementation fits the current repo state and does not assume missing systems already exist.
- The result is testable or inspectable with a narrow validation step.
- Documentation and naming stay consistent with the Cluedo-style murder mystery premise.

For milestone-level work, the target vertical slice is:

- A Godot-based map with multiple rooms.
- 4 NPCs with distinct identities and behaviors.
- Round flow with investigation phase and blackout phase.
- Murder events constrained to blackout.
- Voice conversations with NPCs through Agora.
- Detective journal with `Evidence` and `Case` tabs.
- Player accusation flow for murderer, weapon, and location.

## Core Gameplay Rules

- Each round lasts 1 minute before blackout.
- During the investigation phase, the player explores, listens, and questions NPCs.
- During blackout, the murderer has an opportunity to kill.
- Murders should still emit sounds or leave evidence that can later be reasoned about.
- The detective does not manually track every clue; key noises and discovered clues should be logged automatically in the journal.
- The `Case` tab should allow exactly 3 linked decisions: murderer, weapon, and location.
- A wrong accusation should reduce trust across NPCs.
- NPC behavior should create uncertainty without making the mystery random or unreadable.

## NPC Design Pillars

Each NPC should be treated as an autonomous character with four layers:

### 1. Behavioral Pattern

- NPCs should have role-based tendencies and goals.
- Example: a chef may gravitate toward the kitchen.
- Behavior can vary by round and by recent events.
- Keep behavior authored and understandable before adding procedural complexity.

### 2. Emotion

- NPC emotional state should react to events.
- Example reactions: fear after a murder, anger when accused, panic during blackout aftermath.
- Emotions should influence dialogue tone and possibly movement or willingness to cooperate.

### 3. Breakdown

- `Breakdown` is the visible nervousness or instability meter.
- This is one of the main systems for making NPCs intentionally unreliable.
- Higher breakdown should cause more emotional leakage, contradictions, impulsive statements, and accidental reveals.
- At 100% breakdown, an NPC stops talking until the next round.
- Breakdown should be legible to the player as part of deduction, not hidden simulation noise.

### 4. Trust

- `Trust` measures how willing an NPC is to engage with and help the detective.
- Trust is the calmer counterpart to Breakdown.
- Good questioning, proof, or sympathetic interaction can improve trust.
- Failed accusations or aggressive handling can reduce trust.

## Information Model

- NPCs should have an information profile, not unlimited omniscience.
- Prefer authored prompts and state over procedural generation for the initial version.
- Each NPC should have:
  - name
  - personality
  - role or archetype
  - round-specific knowledge
  - relationship cues
  - secrets or motives
- Important information should be scoped carefully.
- It is acceptable, and likely desirable, to withhold killer certainty from an NPC's active conversational context until conditions such as high Breakdown or other reveal logic are met.
- Dialogue systems should preserve the difference between what is true in the world and what the NPC is willing or able to say.

## Evidence And Deduction

- Evidence capture should be partially automated to keep the game readable.
- Heard noises, discovered clues, and relevant observations should flow into the detective journal automatically.
- The journal should have two primary tabs:
  - `Evidence`
  - `Case`
- `Evidence` is for observed facts and logged clues.
- `Case` is for forming the accusation: murderer, weapon, location.
- The game should reward compelling reasoning from combined signals:
  - what NPCs say
  - where they tend to go
  - what sounds were heard
  - what objects were used
  - how their trust and breakdown changed

## Technical Direction

- Use Godot for the game world, map, rooms, NPC placement, interaction zones, UI, and visual presentation.
- Use Agora technology as a central mechanic, not a bolt-on feature.
- Real-time voice interaction with NPCs must be core to the player experience.
- Keep systems modular, but do not over-abstract early. Favor a vertical slice over speculative architecture.
- Prefer authored content and deterministic rules where possible so the mystery remains debuggable.

## Godot MCP Expectations

- Use the Godot MCP tools when working on the Godot project once that project exists in the repo.
- At the time of writing, no Godot project was detected under this repository, so tasks should not assume scenes, nodes, or project files already exist.
- If a Godot project is added, prefer MCP-assisted scene and project operations when they materially reduce manual work or improve verification.

## Art And Presentation

- The game should have a distinctive, memorable art style rather than placeholder jam visuals.
- Prioritize a strong visual identity, including shaders, lighting, atmosphere, and room readability.
- Visual polish should support deduction gameplay:
  - rooms should be easy to distinguish
  - clue locations should be readable
  - blackout transitions should feel dramatic
- Avoid generic default styling in UI or world presentation.

## Working Rules For Future Agents

- Start by clarifying the specific task against this game vision.
- Keep changes scoped to the current request and nearest vertical-slice need.
- Prefer small, verifiable edits over broad rewrites.
- Follow existing repo patterns unless the task explicitly requires new structure.
- Do not invent systems that are not needed for the current milestone.
- When gameplay rules are underspecified, choose the smallest implementation that preserves the detective fantasy and voice-agent core.
- Preserve unrelated user changes.
- Use a git-first workflow for agent changes with `git worktree`: create or use a dedicated worktree for the task, make changes there, stage the relevant files, commit them, and push the branch so work is not left only in an untracked local state.
- After pushing, create a PR and immediately attempt to merge it. Do not wait to merge later if the branch is ready.
- If the merge hits conflicts, resolve them immediately with the goal of preserving important work on both sides. Do not leave known conflicts unresolved.
- After resolving conflicts, complete the merge attempt and verify that no important behavior, content, or instructions were lost in the final merged result.

## Validation

- Run the narrowest relevant validation after changes.
- For docs-only changes, inspect the file for clarity and consistency.
- For code changes, prefer targeted checks over full-project churn.
- If validation cannot be run, state that explicitly.

## Immediate Build Priorities

When choosing what to build next, bias toward this order:

1. Establish the Godot project and basic multi-room map.
2. Implement core round loop and blackout flow.
3. Add NPC state model: role, movement intent, trust, breakdown, emotion.
4. Integrate Agora-powered voice conversation.
5. Add automatic evidence logging and the detective journal.
6. Implement accusation flow for murderer, weapon, and location.
7. Improve visual identity, shaders, and presentation polish.
