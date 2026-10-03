# NULL.OPERATOR's standing: where it actually lands at the finale gate

**Written 2026-10-02. Status: built** (lifetime caps per act, ship drift capped at -6;
`game.ADVERSARY_NUDGE_CAPS`, `State.adversary.nudgeTotals`, `tests/standing.mjs`). A recheck
of the drift the handoff was worried about ("toward hostile, now that Mail and Choir add
levers"). It was not drifting toward hostile. It **saturated in both directions**, and the
opening answer was erased either way. The tables below up to "The rule, as built" are the
game **before** the fix.

`tools/standing_sim.mjs` drives the real game code (`performPrestige`, the archived replay,
`nudgeAdversaryStanding` with its per-reason cooldown, `Mail.reply`) through a full climb to
the End of Shift gate (reboot 14: Archived opens at 12, the replay ships at 14) on a fake
clock, one reboot per attended hour (the gate's floor is a little over 14.5 h: the 13th reboot
lands at about 14.5 h and the 14th, shipping the replay, one run later), under scripted
play styles, from each answer to the Mirror Login. `tests/endings.mjs` sets `standing`
directly, so nothing tested this before.

## The model, from the code

Standing is a signed integer clamped to ±12, seeded -4 / 0 / +4 by the answer (OP-A / OP-B /
OP-C). Bands: **≤ -3 hostile, ≥ +3 complicit**, curious between. The band is locked when the
finale is presented, so only standing at the gate matters.

| Lever | Delta | Limit |
|---|---|---|
| Every ship | -1 | exempt (once per run); +1 instead on entering an archived replay |
| Open Notepad ("read the paperwork") | +1 | 10 min cooldown per reason |
| Buy a Void upgrade ("fed the reflection") | +1 | 10 min cooldown per reason |
| Try to end `void_mirror.service` | -2 | 10 min cooldown per reason |
| Choir status | -1 / 0 / +1 | one offer per reboot, 10 min cooldown |
| Mail `null-01`, `null-02` | -1 / 0 / +1 each | once per message (`end-curious` arrives after an ending) |
| Execute the patch | +5 | exempt, once ever |

## What the sim found (before the fix)

Final standing and band at reboot 14:

| Play style | from OP-A (-4) | from OP-B (0) | from OP-C (+4) |
|---|---|---|---|
| passive: ships only | -12 hostile | -12 hostile | -8 hostile |
| ordinary: Notepad and one Void upgrade an hour, neutral status | +11 complicit | +11 complicit | +11 complicit |
| attentive / farmer | +11 complicit | +11 complicit | +11 complicit |
| cold: tries to end the mirror, cold replies | -12 hostile | -12 hostile | -12 hostile |

- **The answer to the Mirror Login does not matter.** Every row is the same across the
  three columns except the passive one.
- **Whether you ever open Notepad decides the ending.** Two repeatable acts an hour is +2
  against -1 a ship, so any engagement saturates the clamp: from OP-B an ordinary player is
  complicit at **reboot 3** (+3), +8 by reboot 8.
- **Curious is unreachable by play.** Swept along a single warmth dial from cold to a warm
  farmer, **no setting** lands in -2..+2 from OP-B; the band flips from hostile to complicit
  the moment the dial leaves zero.
- Weakening the drift or the cooldown does not help: "each act once per reboot", "-1 every
  second ship" and "no ship drift" all keep the cliff (run `node tools/standing_sim.mjs --curve`).

## The rule, as built

Cap each *act* for the whole save, so what you did counts and how often does not, and cap the
ship drift at -6 (`game.ADVERSARY_NUDGE_CAPS`; what each kind of act has added so far is
`State.adversary.nudgeTotals`, a schema default with no `SAVE_VERSION` bump, read defensively
because a save is pasted text):

| lever | lifetime cap |
|---|---|
| Notepad | +3 |
| Void upgrades | +3 |
| Choir status | ±4 |
| ending the mirror | -4 |
| ship drift | -6 in total |
| patch, archived replay, mail | as now |

A spent act moves nothing **and burns no cooldown**; a delta that only partly fits is trimmed,
not refused; the patch, the archived replay and Mail are outside the table. Final standing at
reboot 14 under the rule, as built and confirmed by `tests/standing.mjs`:

| Play style | from OP-A (-4) | from OP-B (0) | from OP-C (+4) |
|---|---|---|---|
| passive | -9 hostile | -5 hostile | -1 curious |
| ordinary | -2 curious | +2 curious | +6 complicit |
| attentive / farmer | +8 complicit | +11 complicit | +11 complicit |
| cold | -11 hostile | -11 hostile | -11 hostile |

Each band is now a recognisable way to play, the opening answer moves where you end up, and
standing stays in the middle of its range instead of pinned at a rail (from OP-B the ordinary
player's trace is +1 +2 +3 +2 +1 0 0 0 +1 +1 +1 +1 +2 +2, against +1 ... +11 now). A softer
ship cap (-4) moves the ordinary player from OP-B from curious to complicit and leaves the passive
and cold rows hostile (`--curve` has the full sweep), so the -6 cap is the one that gives
curious a real place.

It changes what repeating an act is worth, and the existing suites that lean on the cooldown
(`tests/adversary-scene.mjs`, `tests/mail.mjs`, `tests/choir.mjs`, `tests/endings.mjs`) are
unchanged and green. Nothing in the economy reads standing, so `test:golden` is unaffected.
Notepad and the Void are exhausted in the first three reboots, so an ordinary player reads
as complicit around reboot 3 and settles back toward curious as the ships drift; only the
standing at the gate matters, because the band is locked when the finale is presented.

## Reproduce

```bash
node tools/standing_sim.mjs                 # before the caps, then as shipped
node tests/standing.mjs                     # the caps, persistence, and the climb, pinned
node tools/standing_sim.mjs --variants      # every rule, per play style
node tools/standing_sim.mjs --curve         # standing along the cold-to-warm dial, per rule
node tools/standing_sim.mjs --trace=ordinary:OP-B   # standing after each ship
```
