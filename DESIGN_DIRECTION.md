# CosmOS — Design Direction

**Written:** 2026-07-26
**Supersedes:** the framing in `IDEAS.md`, `IMPLEMENTATION_PLAN*.md` and the
product verdict in `STEAM_READINESS.md`. Those describe a game about
accumulating systems. This describes a game about making decisions.

**Brief:** a gameplay experience that warrants multiple playthroughs.

---

## 1. The diagnosis

### Every run is identical

This is the whole problem, and nothing else in this document matters as much.

Prestige currently resets your resources and hands back a multiplier. The
Mandate tree has three branches, but there is no opportunity cost — an 8-hour
simulation buys all 21 nodes. There is no point in the game where two players,
or the same player twice, make different choices and end up with different
universes.

That is a **ratchet**, not a game. It produces repetition, which reads as
replayability for about two runs and then reads as a chore. Every fix below
either creates divergence or gets out of its way.

### A third of the writing is unreachable

Counted from the actual content tables:

| Content | Entries | Reachable in play |
| --- | --- | --- |
| Casino host barks | 80 | **No** — only caller is `attemptLoreWhisper()`, which nothing calls |
| Adversary barks | 25 | **No** |
| `AdversaryScene` dialogue | 31 nodes | **No** — the constant is declared and never read by any file |
| Task Manager processes | 12 | Yes |
| Documents | 15 | Yes |
| Achievements | 40 | Yes |

**136 authored lines of narrative that no player can ever see**, including the
entire NULL.OPERATOR confrontation — which, reading it, is the best writing in
the project and the closest thing the game has to a climax.

There is also a purchasable dead end: the `minigame_solitaire` shop item costs
500 Adoration and pushes `'solitaire'` into `unlockedApps`, but **no solitaire
app exists in `system.js`**. Buying it produces an icon that does nothing.

### The premise is not implemented

The fiction is *divine maintenance* — you are on shift, operating a failing
system. The loop is *buy a bigger number*. Nothing in the game asks you to
maintain anything. The Task Manager lists processes you cannot meaningfully act
on; the Recycle Bin has a sacrifice mechanic (`createResourceSacrifice`) that is
never called. The best idea in the project is sitting unused in its own premise.

---

## 2. The spine: Reality Builds

**One idea carries the replayability, and it comes straight out of the fiction.**

A Divine Reboot does not restore the same universe. It ships a **new build** of
it, with a changelog. The changelog is the run's modifier set, written as patch
notes.

```
COSMOS — REALITY v4.3.0
Released to Sector 7G. Operator: you. Rollback: unavailable.

  +  Praise throughput improved 40%. Thanks to the choir for the report.
  +  Thrones may now run unattended.
  !  REGRESSION — Divine Events spawn inverted. Claiming one costs Praise.
  ✕  KNOWN ISSUE (SEV-2) — Soul storage leaks 2%/min. Assigned to: nobody.
  ⊘  DEPRECATED — Offerings. Use Tithes instead. (Tithes not implemented.)
```

Every reboot rolls 2–4 improvements, 1–3 known issues, and occasionally a
deprecation that removes a system outright for that run and forces you to build
around its absence.

Why this works better than generic "run modifiers":

- **It is diegetic.** A reset *is* a software release. The mechanic and the
  fiction are the same object, which is rare and worth exploiting.
- **Known issues create a second economy.** You can spend to patch a known
  issue, or route around it and keep the resources. That is a real decision,
  every run, made under different conditions.
- **A deprecation forces a different build.** Losing Offerings for a run is not
  a smaller number; it is a different game.
- **Content is cheap and characterful.** Patch notes are fast to write, endlessly
  extensible, and play directly to the project's comic register. This is the
  cheapest content-per-hour in the whole design.

### Build channels

Once the player has rebooted a few times, let them choose where reality is
pulled from. This is the meta-decision that makes the system a strategy rather
than a slot machine.

| Channel | Modifier volatility | Payout | Unlocks |
| --- | --- | --- | --- |
| **Stable** | 1–2 mild, no deprecations | baseline | from the start |
| **Beta** | 3–4, may deprecate one system | +40% Divinity | after reboot 3 |
| **Nightly** | 5–6, may deprecate two, regressions guaranteed | +120% Divinity | after reboot 8 |
| **Archived** | a specific past build, replayed | no Divinity, unlocks lore | after reboot 12 |

**Archived** is the replayability payload: deliberately re-running a known-cursed
build to see what NULL.OPERATOR did to it. That is a reason to play a twentieth
run.

---

## 3. Architecture

### 3.1 The modifier registry — do this first

Everything in Reality Builds is blocked on one thing. Right now, upgrade effects
are **irreversible in-place mutations**:

```js
effect: () => { State.praiseMultiplier *= 2; }
```

There are 40+ of these. Because they cannot be undone, `performPrestige()` has
to hand-rebuild every field it touches — which is exactly why adding Thrones,
Dominions, repeatables and the Void each required editing the prestige reset,
and why forgetting one is a silent bug (this already happened twice this month).

It also makes temporary effects, debuffs and deprecations impossible to express.

Replace it with declared modifiers:

```js
{
  id: 'praise_multi_1',
  mods: [{ target: 'praise.output', op: 'mul', value: 2 }],
  scope: 'run'            // 'run' | 'permanent' | 'build' | 'temporary'
}
```

Production becomes a fold over active modifiers. Then:

- **Prestige** = drop every modifier with `scope: 'run'`. One line. Never
  incomplete again.
- **Reality Builds** = a set of `scope: 'build'` modifiers, positive and negative.
  Free, once this exists.
- **Incidents / debuffs** = `scope: 'temporary'` with an expiry.
- **Deprecation** = a modifier that zeroes a target.
- **Production breakdown UI** (§5.1) = render the fold. Also free.

This single change unlocks most of this document. It is roughly a day of work
and it should happen before anything else.

### 3.2 Split the god-files

8,142 lines across four global objects. `state.js` is 2,352 lines of mixed
schema, content tables, and save logic. Suggested split:

```
src/
  sim/         production, ticking, prestige, offline      (no DOM)
  content/     upgrades, mandates, builds, documents, barks (pure data)
  state/       schema, save/load, migrations
  ui/          rendering, windows, panels
  platform/    storage adapter, audio, input, Steam shim
```

The hard boundary that matters: **`sim/` must not touch the DOM.** That is what
keeps `tools/balance_sim.mjs` working, and that simulator is the reason the
economy is currently correct. Protect it.

### 3.3 Stop rendering everything at 60fps

`ui.update()` runs on every animation frame and calls `renderAutomatons()` and
`renderRepeatables()`, each of which does a `querySelector` and an `innerHTML`
assignment **per row**. At 8 ranks and 11 repeatables that is ~19 DOM writes per
frame for data that changes a few times a minute.

Split into three cadences:
- **per frame** — canvas only (the two cores)
- **~10Hz** — resource counters, rates, progress bars
- **on change** — anything structural: rank lists, upgrade lists, panels

### 3.4 Save versioning before Steam

Already on the Steam gate list and genuinely blocking. `localStorage` holding a
`JSON.stringify(State)` blob with no version field means any schema change is a
gamble — the merge-on-load is doing real work and will eventually lose someone's
run. Needs: a `version` field, ordered migrations, atomic write with backup
rotation, and settings stored separately from progress.

---

## 4. Gameplay

### 4.1 Incidents — the missing active loop

The game is called *Divine Maintenance* and contains no maintenance. This is the
largest gameplay gap and the highest-value addition after Reality Builds.

**Incidents** appear in a queue as the OS notices things going wrong:

```
SEV-2  Choir desync in Sector 7G
       Seraph output down 60% and falling.
       [ Rebalance manually — costs 45s of clicking ]
       [ Throttle the choir — -20% output, permanent this run ]
       [ Ignore ]  → escalates to SEV-1 in 4:00
```

Design rules that make this a loop rather than a chore:

- **Always three options: labour, resources, or debt.** Fix it with attention,
  fix it with materials, or let it compound. All three are legitimate.
- **Ignoring must be viable sometimes.** If ignoring is always wrong it is not a
  decision, it is a tax.
- **Escalation compounds.** Unhandled SEV-2s become a SEV-1 outage that halts a
  production line until resolved.
- **Incidents are the difficulty knob.** Nightly builds generate more of them.
  This is how build channels get their teeth.

This also finally makes the **Task Manager** a real app: it is where you triage.
And it gives the **Recycle Bin** sacrifice mechanic (already written, never
called) an actual purpose — sacrifice patches to resolve incidents instantly.

### 4.2 Certification, not accumulation

Change the Mandate tree from *buy all 21* to **certify on one path per reboot**.

You keep a small permanent residue from every path you have ever certified on
(say 10% of its bonuses), but the full branch bonus only applies while you are
certified on it. Certification is chosen at reboot, alongside the build.

This turns Creation / Maintenance / Entropy from a checklist into three
identities you rotate between — and because Reality Builds favour different
paths (a build that deprecates storage punishes Maintenance), the choice is
contextual rather than solved.

### 4.3 Wake the dead systems

In rough value order:

1. **The Adversary scene.** 31 dialogue nodes, fully written, never triggered.
   Wire it to a reboot threshold. This is the cheapest large win in the project.
2. **Casino host barks.** 80 lines gated behind an uncalled function. Either
   build the casino or repurpose the barks as NULL.OPERATOR intrusions — they
   are good enough that leaving them unused is the waste, not the venue.
3. **Solitaire.** Either implement it or remove the shop item; a 500-Adoration
   purchase that does nothing is worse than no purchase.
4. **Prophets / followers / Adoration.** Currently a parallel trickle with no
   decisions. Fold into Incidents: prophets are who you dispatch to handle them.

### 4.4 Give the ending a shape

Idle games that get replayed have a *terminal state* per run, not just bigger
numbers. Reality Builds suggest the obvious one: each run ends when you **ship**
— declare the build stable and cut a release. Shipping early banks less Divinity
but preserves your Known Issues list as a permanent scar. Shipping late risks a
cascade failure that ends the run at zero.

That is a genuine risk/reward exit decision, made once per run, under conditions
that differ every time.

---

## 5. UI/UX

### 5.1 Show the multiplier stack

The single most-requested affordance in idle games, and currently absent. A
player at 4.8e18/s has no idea where that number comes from. After §3.1 this is
nearly free:

```
PRAISE — 4.82e18 /s
  128 Seraphs × 2.0 base           2.56e2
  × Liturgical Refinement (r94)    ×24.50
  × Choir Drill (r84)              ×13.60
  × Dominions (112)                ×14.44
  × Standing Doctrine (r41)        ×5.10
  × Null Doctrine (r60)            ×8.20
  × Nemesis (80)                   ×7.40
  − Throne draw (251 × 2.5)        −627.50
```

Make it a hover panel on any rate. It teaches the systems, rewards
understanding, and is what turns a spreadsheet into a toy.

### 5.2 Audio

On the Steam gate list, still absent, and disproportionately important for feel.
Minimum viable: UI click, boot texture, reward stinger, incident alarm, ambient
system hum, mute buses, and pause-on-blur. The retro-OS frame makes this easy —
system beeps and hums are cheap to source and instantly characterful.

### 5.3 The desktop should behave like a desktop

- Windows do not remember position or size per app between sessions.
- Nothing ever opens *itself*. A real cursed OS interrupts you — incidents should
  spawn windows, error dialogs should demand acknowledgement, NULL.OPERATOR
  should be able to open a window you did not ask for. This is free
  characterisation the current build is not spending.
- No window snapping feedback, no minimise-to-taskbar animation.

### 5.4 Readability at scale

Numbers reach 1e18 within a session. Needs a notation toggle (already a setting,
verify it works at scale), consistent precision rules, and — importantly — rate
displays that stay legible when the value and the cap differ by ten orders of
magnitude.

---

## 6. Sequencing

Ordered by *unlocks-other-work* rather than by size.

**Phase 1 — foundations (nothing player-visible)**
1. Modifier registry (§3.1). Everything else depends on it.
2. Save versioning + migrations (§3.4). Blocking for Steam, and cheaper before
   Reality Builds adds fields than after.
3. Render cadence split (§3.3).

**Phase 2 — the spine**
4. Reality Builds with a starter set of ~20 modifiers and ~10 known issues.
5. Certification replaces mandate accumulation (§4.2).
6. Ship-the-build run exit (§4.4).

**Phase 3 — the loop**
7. Incidents (§4.1), wired to Task Manager and Recycle Bin.
8. Build channels (§2), which need Incidents to have stakes.

**Phase 4 — the payload**
9. Trigger the Adversary scene (§4.3.1) — could be done any time, and probably
   should be done early just to stop wasting it.
10. NULL.OPERATOR as the source of regressions; relationship axis across runs;
    three endings.
11. Audio (§5.2), production breakdown (§5.1), desktop behaviour (§5.3).

**Do not start Phase 2 before Phase 1.** Reality Builds implemented on top of
irreversible mutations would be a nightmare, and the temptation will be strong
because Phase 2 is the fun part.

---

## 7. What I would cut

Being honest about scope, since the project's failure mode so far has been
adding systems faster than it finishes them:

- **The Casino as a venue.** Three minigames is a separate project. Keep the 80
  barks, give them to NULL.OPERATOR, drop the tables.
- **The Void as a second economy.** It works now, but it is structurally a
  reskin of the primordial chain. It would be stronger as a *Reality Build
  channel* — "this build ships with the Void enabled" — than as a permanent
  parallel grind.
- **Timelines.** Declared, barely wired, and overlaps almost exactly with what
  Reality Builds does better. Fold it in.

Three fewer systems, each of the survivors twice as deep.
