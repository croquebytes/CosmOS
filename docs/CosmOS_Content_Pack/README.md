# CosmOS Content Pack (Lore + Implementable Text)

This pack is designed to be readable by both humans and AI/agents.

## What’s inside
- `spreadsheet/CosmOS_Content_Sheet.xlsx`  
  Master index + tables (StoryBeats, VoiceLines, TaskMgr eggs, Documents, Achievements, AdversaryScene, CasinoHost)

- `lore/Adversary_Intro.md` and `lore/Adversary_Intro.json`  
  First-contact scene + 20 extra Adversary barks (with triggers).

- `docs/`  
  15 in-game documents (markdown) + `docs_manifest.json` for indexing.

- `achievements/`  
  40-achievement set: `.md` (human), `.json` and `.csv` (agent-friendly).

- `casino/`  
  Casino Host bark pack: `.md` (human), `.json` and `.csv` (agent-friendly).

## Conventions
- **IDs are stable keys**: do not change once referenced in code.
- `Trigger` / `Condition` fields are **pseudo-code**. Replace thresholds with tuned constants.
- “Unlock condition” is written as a player-facing or designer-facing rule (not code).

## Integration tips
- Use `docs_manifest.json` to auto-populate your in-game “Recovered Files” UI.
- Use bark `Weight` + `Cooldown(s)` to keep VO/text fresh and prevent spam.
- Scene JSON is structured so an agent can:
  - verify the line order
  - attach conditions
  - inject choice handling.

Enjoy building the bureaucracy of the cosmos.
