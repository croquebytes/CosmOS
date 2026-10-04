---
project: cosmos
type: review-handoff
created: 2026-10-04
status: paused-awaiting-user-feedback
branch: codex/ui-gameplay-improvements
base_commit: e97fdf8
---

# Review handoff — paused at the user’s request

The user will review the completed first pass and return with feedback. Stop implementation here. On return, read their feedback before choosing or starting the next slice; the order below is a recommendation, not an instruction to proceed without that review.

## Where the work is

Current checkout: `/Users/karma/Documents/Machine Dreams/projects/CosmOS`.
The chat’s attached checkout at `/Users/karma/Documents/projects/CosmOS` is older; do not resume there.
Branch: `codex/ui-gameplay-improvements`, based on `e97fdf8`, including Claude’s merged reload fix. Changes are local and uncommitted. Source, rebuilt release output, regression tests, design analysis and screenshots are preserved.

Local preview was left running at `http://127.0.0.1:5189/?testMode=1` for the review. If it is unavailable later, restart the current project’s dev server rather than opening the older checkout.

## Completed first pass

- Unified Dev Console reload shutdown with `State.abandonPage()` and verified actual late achievement/document/mail writes during reset/import.
- Persisted Prophet meal deadlines; fixed live Calls/Globe/shop displays and full-vault conversion spending.
- Added keyboard purchase controls and focus preservation.
- Improved Mandate and finale readability/layout.
- Added accessible praise seals with bankable reward, deadline and narrow-screen containment.
- Added optional brass cursors in Divine Settings.
- Rebuilt release output; 17 targeted check groups passed, including 14 new browser scenarios. Golden economy horizons unchanged.

Full analysis, tuning proposals, limitations and evidence: [UI/gameplay plan](UI_GAMEPLAY_PLAN_2026-10-04.md). Session implementation notes: `../progress.md`.

## To-do after feedback

- [ ] Read the user’s review, resolve concerns about the completed pass, and revise priorities.
- [ ] Compact Engine layout: keep resources, current directive and reward action visible; make the operator panel lead to the relevant action; support a collapsible core after the first Seraph.
- [ ] Add separate CRT intensity and text-scale controls, plus larger touch hit regions.
- [ ] Prototype Prophet dispatch for one incident family, with a visible follower-growth tradeoff.
- [ ] Evaluate one Fate/Patience House prototype: **Providence Audit**, with explicit odds, persisted deals, bounded payouts and cosmetic/lore rewards. It remains a design proposal. **Hymnal Checksum** is an alternative, not an additional simultaneous build.
- [ ] Refine Globe art into an etched brass atlas/armillary and develop distinct resource reward stamps after interactions settle.

Preserve the user’s existing `docs/PLAYTEST_REVIEW_2026-10-03.md` and pre-existing Vite metadata change. Don’t bundle those into implementation edits. Any new balance values in the House proposal remain untested until a prototype and playtest exist.
