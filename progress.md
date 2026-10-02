Original prompt: my app is stuck on the loading screen, can you assist with that

## Notes
- Using `develop-web-game` skill workflow.
- The skill script `/Users/karma/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js` cannot run yet because local package `playwright` is not installed (`ERR_MODULE_NOT_FOUND`).
- Falling back to built-in Playwright MCP browser automation to reproduce and inspect loading-screen hang.
- Reproduction in clean browser profile works; likely user issue is save-state specific (`localStorage` data causing load exceptions).
- Implemented startup hardening:
  - `State.load()` now catches parse/merge failures, clears corrupted `cosmos_save`, and returns `false` instead of throwing.
  - `system.init()` now schedules boot overlay dismissal before loading state and logs when save reset occurs.
- Validation complete:
  - Corrupted save payload (`{"bad_json":`) no longer traps the app; startup continues and boot overlay exits.
  - Normal startup still transitions off loading screen in ~3-4 seconds.
  - `npm run build` succeeds after the patch.

## TODO
- Optional: reduce noisy favicon 404 by adding a favicon file or removing its implicit request.

## 2026-07-25 — Steam-readiness and first-session pass

Current request: Catch up on recent changes and improve UI/UX, narrative, gameplay, idle-game quality, and engine/Steam readiness.

### Completed
- Preserved the active startup-hardening and window-management changes already in the worktree.
- Added a first-shift narrative briefing with a concrete three-step work order and keyboard controls.
- Added a persistent desktop directive/milestone surface so the player can always answer “what now?”
- Made the Genesis menu and taskbar functional, including app launching, active-window focus, and keyboard-accessible desktop icons.
- Changed the opening directive sequence to teach manual miracles and the first Seraph before randomized work orders.
- Replaced frame-count production with delta-time simulation so output is refresh-rate independent.
- Added capped offline progress (8 hours) and an in-world background-process report.
- Removed remote wallpaper/font dependencies so the packaged single-player experience works offline.
- Added responsive/reduced-motion treatment and a built-in fullscreen shortcut.
- Added `render_game_to_text`, `advanceTime`, a reusable smoke action payload, and a Playwright e2e test.
- Fixed the production build so classic JS runtime files and lore documents are copied into `dist`.
- Verified onboarding → first directive → reward → first Seraph → passive production → offline report.

### Verification
- `npm run build` passes.
- `npm run test:e2e` passes.
- Develop-web-game smoke client passes against both dev and production preview builds.
- Desktop and 390×844 layouts were visually inspected.
- `npm audit --omit=dev` reports 0 production vulnerabilities.

### Next recommendations
- Move persistence from localStorage to a versioned save-file adapter before Steam packaging.
- Add controller/Steam Input navigation and visible controller glyph switching.
- Package the existing web game before considering a rewrite; Electron is the lower-risk first shell, with Tauri as a size-focused spike.
- Use Phaser only inside future canvas-heavy casino/defrag minigames unless the main game stops being a DOM desktop.
- Split the large state/game/ui files into simulation, content, persistence, platform, and presentation modules before content production accelerates.

## 2026-07-26 — Browser visual QA and feedback pass

Current request: Test the game in-browser, fix visual problems such as the wonky Notepad icon, improve the Universal Engine praise animation, and identify visual asset opportunities.

### Implemented
- Fixed all late-unlocked desktop apps being forced into a horizontal flex row; this was squeezing the Notepad artwork to roughly 19 px wide.
- Rebuilt the Notepad desktop artwork as a crisp 48×48 bound-page icon.
- Made Notepad open its first collected document automatically instead of presenting an unnecessary empty viewer.
- Added a phone-width Notepad layout that stacks the document browser above the reader.
- Upgraded the Universal Engine core from a basic pulsing circle to layered containment rings, telemetry particles, a luminous inner sigil, and production-responsive motion.
- Routed every manual Miracle into a visible core-impact response with brighter motes, a short frame pulse, and resource feedback centered on the engine.
- Added `VISUAL_ASSET_OPPORTUNITIES.md` with prioritized in-game, progression, background, animation, and Steam key-art opportunities.

### Browser findings
- Default desktop, Universal Engine, praise interaction, Notepad, and 390×844 layouts were inspected directly in the running game.
- No browser console warnings or errors were present before the fixes.

### Verification
- Final in-app browser pass reported no console warnings or errors.
- Develop-web-game smoke client passed and captured the upgraded 200×200 Engine core.
- `npm run test:e2e` passed onboarding, directive, automation, and offline-progress coverage.
- `npm run build` passed; Vite continues to print the existing classic-script bundling advisory while the project plugin copies those scripts into `dist`.

## 2026-07-26 — Visual identity pass

Current request: review recent changes, then move the game onto a cohesive
celestial-cosmic identity that stops borrowing from Windows 98; replace the
icons and the Universal Engine praise animation with authored art.

### Art direction
Settled on **"sacred machinery, cast in metal."** The OS keeps its structure —
title bars, bevels, a taskbar — because the premise needs it. What changed is
the material: patinated iron housings, aged brass ornament, and vellum for the
surfaces records are written on. Two typefaces only, Georgia for the
institution and Courier New for the machine.

### Implemented
- Added a full design token layer (`iron` / `vellum` / `brass` / `verdigris` /
  `ichor`) and repointed the ~90 legacy `--win-*` rules onto it, so the desktop
  re-skins from one place. Retired every Windows 98 colour literal
  (`#c0c0c0`, `#808080`, `#000080`, `#1084d0`) and both Windows typefaces.
- Generated and integrated a 12-piece pixel-art icon family as chamfered
  plaques, replacing the CSS-gradient and emoji desktop icons.
- Generated a four-state Universal Engine core (idle / charging / overclocked /
  void-corrupted) plus four additive VFX plates (sigil ring, shockwave halo,
  ignition flare, mote field).
- Rebuilt the praise animation on that art: a counter-rotating sigil behind the
  machine, and each Miracle spawning a burst that resolves as
  ignition → shockwave → fallout. The engine core is now clickable.
- Removed every emoji from the codebase. Ranks became struck medallions with
  roman numerals; document categories, recycle-bin types and warnings became
  CMS filing-code stamps; app marks reuse the desktop plaques.
- Wired the desktop plate to game state: primordial grid, void breach after
  entering the Void, restored cosmos after a prestige.
- Fixed `initKeyboardShortcuts` claiming browser modifier combos — Cmd/Ctrl+S,
  +C, +F and +N were opening apps and calling `preventDefault()` instead of
  saving, copying, finding and opening a window.
- Fixed the production build: core, VFX and background art is referenced by
  literal path from the classic scripts, so Vite never saw it and it never
  reached `dist`. The copy plugin now ships it and excludes the masters.

### Asset pipeline
`tools/slice_assets.py` regenerates everything under `assets/icons|core|vfx|
backgrounds` from the masters in `assets/src` and `assets/visual-probes`.
Three things it handles that are easy to get wrong:
- Backgrounds are gamma-lifted from ~6% mean luminance to ~15%; the raw art is
  beautiful in isolation but reads as pure black behind desktop icons.
- Icons are keyed by flood-filling in from the corners, not by a near-white
  threshold, which would erase the bone-white star cores and the parchment page.
- VFX plates are cropped to their dark panel and have their black point
  crushed. The sheets carry white gutters, and under additive blending an
  uncropped plate draws a bright square frame around every effect.

### Verification
- `npm run build` passes; `dist` is 2.6 MB with runtime art present and the
  generation masters excluded.
- `npm run test:e2e` passes onboarding, directive, automation and offline
  progress, with no runtime or console errors.
- Desktop (1600×900) and phone (390×844) inspected; all art requests return
  200 and the console is clean.

### Known gaps
- The Void dimension's secondary core (`#void-core-canvas`) still uses the old
  procedural renderer; it should move onto the `core_void` plate.
- `assets/src` and `assets/visual-probes` hold ~16 MB of masters. They are
  excluded from `dist` but still tracked in the repo.

## 2026-07-26 — Economy rebuild

Current request: expand and fix all gameplay loops; improve the game loop,
depth, and time-sink logic.

### How this was measured
Added `tools/balance_sim.mjs`, which loads the real `state.js` and `game.js`
into a sandbox, stubs the UI, and plays the game with a greedy policy. Every
number below is from that harness rather than from reading the formulas.

The first run was decisive: **the game ended after 4 minutes 27 seconds**, with
7h55m of dead time in an 8h session.

### The four breaks it found
1. **Offerings had no producer.** `State.mps` was never incremented anywhere —
   only zeroed on prestige. Cherubs cost Offerings, so Souls never generated
   either. Everything past the first tier was unreachable: Void, Globe,
   prestige, mandates. The `offering_unlock` upgrade promised a Praise→Offerings
   conversion that was never implemented.
2. **Prestige was mathematically impossible.** `calculateDivinityPoints()` read
   `sqrt(currentSouls / 2500)` while the Soul cap was 2,000. The formula could
   not return anything but 0, so Divinity Points, the Mandate tree, and every
   meta bonus were dead content.
3. **Mandates were bought with Souls** — a resettable resource funding permanent
   upgrades, and every purchase quietly reduced the prestige it built toward.
4. **Storage capped at 4,500 Praise within five minutes** and had no further
   upgrades, so idle accrual was pointless and there was nothing left to buy.

### What was rebuilt
- **The chain now has four ranks**: Seraph (Praise→Praise), Throne
  (Praise→Offerings), Cherub (Offerings→Souls), Dominion (Souls→global
  multiplier). Thrones are a *conversion*, not a second tap — they burn Praise
  while running, so committing to Offerings costs Praise throughput and the
  allocation is a real decision. Ranks are a data table (`AutomatonSpecs`), and
  purchasing is one generic path instead of four if/else chains.
- **Prestige is measured against lifetime Souls**, so spending never costs
  progress, and the Divinity bonus is sub-linear — a linear bonus fed straight
  back into the production that earns the next reboot and compounded into a
  runaway inside one session (the simulator hit 1e21/s before this was damped).
- **Mandates cost Divinity Points**, the currency that also survives a reboot.
- **Repeatable upgrades** (`RepeatableList`) give both layers an endless sink:
  Standing Requisitions for the run, Standing Doctrine for the meta.
- **Offline** runs at 60% of attended output (upgradeable to 100%) inside an
  8h window (extendable to 48h), and the report now names the storage overflow
  explicitly, since that is the number the player can act on.
- Content grew from 19 upgrades to 39 and from 15 mandates to 21.

### Balance-curve traps hit along the way
- **Geometric cost against linear capacity soft-locks the economy.** Vault
  ranks eventually cost more than the maximum the player could hold. Capacity
  now grows faster (×1.38/rank) than the price of capacity (×1.32/rank).
- **The prestige feedback loop needs explicit damping**, not just a smaller
  divisor. Production → lifetime Souls → Divinity → production is a closed
  loop; the bonus exponent is what bounds it.

### Bugs fixed in passing
- `initKeyboardShortcuts` claimed browser modifier combos: Cmd/Ctrl+S opened
  Settings instead of saving, +C opened the Engine instead of copying, +F went
  fullscreen instead of find.
- Divine Events spawned at `100 + rand * (innerWidth - 200)`, which is negative
  on a narrow viewport — off-screen and uncollectable. Expired event elements
  also shared one DOM id, so `hideDivineEvent()` only ever removed the first and
  the rest accumulated for the whole session.
- Manual-click scaling and Divine Event rewards both read raw `pps`, so every
  multiplier the player bought made active play relatively weaker.
- `updateAchievements()` referenced a `tierIcons` table removed in the visual
  pass, which would have thrown on opening the achievements panel.

### Resulting curve (simulated, engaged play)
Throne/Cherub 4 min · Void 14 min · Dominions 15 min · Globe 28 min ·
first prestige ~1h · then roughly every 45 min, accelerating.
Over 8h: 13 prestiges, all four ranks in use, repeatables at ranks 40–120.
Over 24h: still purchasing at 23:58 — no wall.

### Verification
- `npm run build` passes; `npm run test:e2e` passes.
- Save migration verified from a pre-update fixture: legacy values preserved,
  every new field defaulted, production intact.
- Browser console clean; no emoji remain in `js/` or `style.css`.
- Note: the e2e harness defaults to `127.0.0.1`, which the dev server here does
  not bind — pass `COSMOS_TEST_URL=http://localhost:5173`.

### Known gaps
- Clicking still contributes little after the first ten minutes; the Miracle
  Streak ceiling is the lever if active play should matter more.
- The Void dimension still has its own parallel economy and has not been
  re-balanced against the new four-rank chain.

## 2026-07-26 — Void reactor on the authored renderer

Current request: port the Void dimension's separate core canvas onto the same
authored-art system as the Universal Engine.

### Implemented
- Replaced the single-canvas renderer with **core render views**. Each canvas
  gets its own `{ctx, size, pulse, impact, bursts}` record in `ui.coreViews`,
  and `ui.renderCoreView(view, options)` draws any of them. A Miracle in the
  Engine and a strike in the Void no longer share a burst queue, so both can be
  on screen at once without interfering.
- The Void reactor now draws `core_void_256.png` through the same sigil /
  halo / flare / mote pipeline, in a 200px logical canvas with a DPR-matched
  backing store, in an ichor-tinted variant of the instrument well.
- The Void core is clickable and runs `game.manualVoidClick()`, matching the
  Engine. `manualVoidClick` now triggers a core reaction, which it never did.
- `triggerCoreReaction(intensity, canvasId)` targets a view;
  `triggerVoidCoreReaction()` is the Void's entry point.

### Bugs fixed
- **The old Void renderer leaked a requestAnimationFrame loop.** `initVoidCanvas()`
  started a self-scheduling `drawVoidCore` that was never cancelled, so every
  re-render of the Void panel started another one and the orphans kept drawing
  to detached canvases for the rest of the session. The Void core is now driven
  from `ui.update()` like the main core, with no loop of its own. Verified: six
  consecutive re-inits leave exactly one canvas, one listener, one view.
- **`filter: contrast(1.04)` on the core canvases was painting a faint square.**
  `contrast()` carries a `+0.5(1 - amount)` offset, which lifts fully transparent
  pixels into visibility — so the canvas bounds showed as a rectangle over the
  well. Subtle on the Engine's dark field, obvious on the Void's purple one.
  Replaced with `saturate()` alone, which is a pure matrix with no offset.
- `getCoreView()` returns null for a canvas whose element has been torn out by a
  panel re-render, so a stale view can never be drawn into.

### Verification
- `npm run build` and `npm run test:e2e` pass.
- Both cores confirmed alive simultaneously with independent pulse, impact and
  burst queues; strikes on one do not appear on the other.
- Browser console clean; `node tools/balance_sim.mjs` unchanged, confirming the
  render refactor did not touch the economy.

## 2026-07-26 — Void economy rebuilt

Current request: port the Void onto the AutomatonSpecs table and the generic
purchase path, rebalance it against the main chain, and give it repeatables.

### What the Void actually was
The same structural break the primordial chain had, plus two more:
- **`vd.sdps` was never written by anything.** Shadows had no producer, so
  Phantoms (which cost Shadows) were unbuyable and Echoes never appeared. The
  playable Void was one rank deep: click, buy Wraiths, repeat.
- **Echoes had no sink.** Nothing in the game cost them.
- **Every Void upgrade was unbuyable.** `purchaseUpgrade()` only ever read and
  wrote `State.resources`, so `State.resources.darkness` was `undefined` and the
  affordability check failed for all three Void upgrades. The same bug appeared
  in three affordability checks in the UI. This predates the economy rebuild.

### Implemented
- **`pool` on every spec.** `AutomatonSpecs` and `RepeatableList` entries are
  tagged `primordial` or `void`, and `game.poolFor(spec)` resolves the bag —
  `resourcePool`, `capsPool`, `repeatablesPool` and `automatonsFor` all route
  through it. `game.resourceBag(resource)` does the same for bare resource names
  in upgrade costs. The Void's ~160 lines of duplicated purchase logic are gone;
  `buyVoidAutomator`/`buyVoidAutomatorBulk` are now three-line wrappers.
- **Four Void ranks mirroring the main chain**: Wraith (Darkness→Darkness),
  Revenant (Darkness→Shadows, a conversion that burns Darkness while it runs),
  Phantom (Shadows→Echoes), Nemesis (Echoes→global bonus). Revenants are the
  rank that never existed and are what makes Shadows real.
- **Five Void repeatables** — three vaults, Entropic Refinement, Revenant Drill.
- **Null Doctrine**: Echoes bought into a permanent cross-dimension multiplier
  that survives prestige. Gives Echoes their first sink and gives the Void a
  reason to exist once its own ranks stop being the bottleneck.
- Void upgrade line rescaled from 100–500 Darkness to 900–120,000 and extended
  from 3 to 9, covering every rank. Content is now 45 upgrades, 11 repeatables,
  8 ranks.

### The balance trap worth recording
Making Nemesis and Null Doctrine boost *all* production created a closed loop:
Nemesis raised Void output → more Echoes → more Null Doctrine → raised Void
output again. An 8h simulation hit 7.4e18 praise/s. The fix is two tiers of
bonus — `baseHierarchyBonus` is what the primordial economy earns for itself,
`hierarchyBonus` adds the Void's payout, and **the Void's own production uses
the base**. The Void pays into the primordial chain and never into itself.

### Resulting curve (simulated, engaged play)
Void unlocked 13:46 · Wraith 14:01 · Revenant 16:44 · Phantom 19:29 ·
Nemesis 24:12 · Null Doctrine rank 1 at 21:19, rank 10 at 38:33, rank 40 at 2:26.
Over 8h: 211/155/140/80 across the Void ranks, Void repeatables at 61–94,
44 of 45 upgrades bought, last purchase at 07:59:53 — no dead time.

### Verification
- `node tools/balance_sim.mjs 8`, `npm run build`, `npm run test:e2e` all pass.
  The simulator policy now enters the Void, plays all four ranks and buys Null
  Doctrine.
- Cross-pool routing checked in-browser: Void purchases move Void resources and
  Void caps only, and never touch Praise or the primordial repeatables.
- Save migration verified from a pre-Void-rebuild fixture: Wraith count and
  Darkness preserved, Revenant/Nemesis/Void repeatables/Null Doctrine all
  defaulted, production intact.

## 2026-07-26 — Session 1 complete: foundations

Ran the design plan's Session 1. A multi-agent survey (5 parallel readers, a
design pass, 3 adversarial critiques) mapped the codebase first, and it
changed the plan: the save layer had to land before the registry, because the
registry needs its log persisted and rehydrating a pre-registry save requires
purchase order the format never recorded.

### Golden-master harness first
`tools/golden.mjs` + `--json` on the simulator. The sim is deterministic, so
its output is a regression test: three horizons, leaf-level diffing.
Confirmed sensitive by perturbing one constant 0.33% and watching it attribute
the change across 27 fields. This is what made the rest safe.

**Regenerate baselines only for an intentional balance change, and say so in
the commit.** A silently recaptured baseline is worse than none.

### Save layer
Versioned saves with ordered migrations that run on the raw parsed object
before any merge. Fixed four player-facing bugs: the loader deleted saves on
any throw; nested `Object.assign` rebinding silently dropped defaults in six
containers (which is why the Void repeatables only appeared to work); no
`hasOwnProperty` guard on a loop fed by base64 user input; and `importSave`
rejected every early-game save because it validated on `pps`.

### Five bugs from the survey
Four copies of the production formula, all drifted — the on-screen rate was
wrong by orders of magnitude late. Temporal Rift granted zero Offerings.
Buy buttons were destroyed and recreated 60x/sec so `:hover`/`:active` could
never paint. The count-up animation leaked up to ~18 concurrent intervals.
The Divine Globe leaked an entire rAF loop for the session.

### Modifier registry
Declared, scoped, reversible records; production is a fold. Three decisions
worth keeping:

- **No cache.** All three critiques found the same hole in a memoised design:
  nothing dirties a target when a dynamic base changes, so prestige silently
  fails to rebase any multiplier with no run-scoped records.
- **Insertion order is load-bearing.** IEEE-754 multiplication is not
  associative. There is a test asserting that reordering changes the result,
  so nobody "optimises" it later.
- **Bindings write back to the legacy scalars.** `getProductionRates()` was
  never touched, so bit-identity came for free and the flip could be verified
  at every step.

Bases are derived from a `PRISTINE` snapshot rather than transcribed — two
reviews independently caught hand-written bases that were wrong (void shadow
cap 200 vs 50). Scope is read off what `performPrestige` actually resets, not
intuition, which caught `offline.efficiency` (prestige never resets it, so
scoping it 'run' would have been an unannounced nerf invisible to the golden
master).

Equivalence is proven on two independent sandboxes per item, because a review
caught that comparing the fold against the scalar the fold just wrote proves
nothing. 62 of 66 content items converted; the remaining four are grants.

### The leak the baselines were pinning
`performPrestige` never reset `throneDrawMultiplier`, so the Throne draw
upgrades re-applied every run and compounded. Old baselines recorded
`0.4875^7` at prestige 6 and `0.4875^15` at prestige 14 — the exponent is
runs played, exactly. By hour eight Thrones drew 1/48000th of their intended
cost. Same leak hit `divineEventSpawnRate`, `streakCapBonus`,
`overclockPotency` and `overclockDurationBonus`.

Pre-prestige runs are byte-identical before and after the flip, which is what
localises the change to prestige and proves the fold itself is faithful.

## 2026-07-30 — Session 2: Reality Builds

The replayability spine. A Divine Reboot now ships a new **build** of the
universe with a changelog, and the changelog IS the run's modifier set —
declared with `scope: 'build'`, the scope Session 1 added for exactly this.

### Builds are seeded, not random
A build is a pure function of `(runSeed, prestigeLevel, channel)`.
`Math.random()` would have cost the golden master (the simulator is
deterministic and its output is the economy's regression test), save integrity
(reloading would let a player shop for a better universe), and the Archived
channel. `runSeed` is rolled once per save; the simulator pins it.

**Builds are derived, not stored.** Persisting the entry list meant a content
fix could never reach a save already mid-run — confirmed on a real save that
kept a retargeted entry forever. Only the identity is persisted; entries are
re-derived on load, carrying `patched` flags across.

### Content
17 improvements, 10 patchable known issues, 4 unpatchable regressions, 5
deprecations, four channels with rising volatility and payout. Deprecations
cripple rather than delete — an early draft zeroed Throne output for the
Offerings joke, which strands anyone who has not banked Souls.

### What the adversarial sweep caught, and the lesson
Four agents over 4 channels x 400 seeds x 21 levels returned two
*has-softlocks* verdicts against a version I had already committed.

**The suite asserted the wrong property.** It checked cap targets fold `> 0`.
A deprecation folding `caps.praise` to 350 is positive and passed — but the
cheapest cap upgrade costs 400 Praise, so the run could never escape. The
property is *affordability of escape*, not positivity. `ModifierTargets` can
now declare a `floor` enforced after the fold, so no combination can breach a
playability threshold.

Other findings worth remembering:
- **Every `set` op erased the improvements above it**, because `generate()`
  appends improvements first and the fold is a left fold. 3495 occurrences,
  including a 40-DP capstone mandate silently zeroed by an unpatchable
  deprecation. Punitive `set`s are now `min`/`mul`; the capstone is `max`.
- **`bootstrapModifiers` inferred from an empty log** rather than reconciling,
  so every save written before the feature got a build that was displayed,
  priced and billable but never applied.
- **`runSeed` was rolled without a synchronous save**, so a reload re-rolled
  the universe — the exact thing seeding exists to prevent.
- **`hardReset()` and `importSave()` were defeated by the `beforeunload`
  autosave** writing live State back over the key they had just rewritten.
  Pre-existing, but Hard Reset is the escape hatch from a bad build.

Committing before the adversarial pass was the mistake; the sweep found more
than the 250-seed check written alongside the feature.

### Known gaps
- The Archived channel is declared but not offered: `generate()` keys its rng
  off the current prestige level, not a chosen past one, so it cannot yet
  replay a specific build. It needs a target-level picker and a non-Divinity
  reward.
- 22 of 40 registry targets can never be moved by a build; 15 are Void
  targets against 2 Void pool entries, so the Void is effectively outside the
  system. `caps.offerings` is immovable too, so its patch never scales.
- `iss_intervention_limited` is inert once the `entropy_ultimate` mandate is
  owned (clicks scale off production), yet still charges full price.
- Certification (one Mandate path per reboot) and the ship-the-build run exit
  are still Session 2 scope and were not reached.
- A build's full patch bill can exceed the resource cap in 0.2% of cases, so
  the patches are payable serially but not simultaneously, with no running
  total shown.
- Achievement rewards (23 closures) and shop items (8) are not yet converted
  to modifiers; they still mutate directly.
- `Modifiers.explain()` exists and is tested but nothing renders it yet — the
  production-breakdown panel is a small follow-up.
- Void resource stat boxes have no per-second readout for Shadows.
- The Void's payout is strong: playing both economies reaches ~1e18/s at 8h
  versus ~1e14/s for the primordial chain alone. Intentional — it is optional
  content that requires actively switching dimensions — but worth revisiting if
  it starts to feel mandatory rather than rewarding.

---

## 2026-07-31 — Session 3: the Adversary scene

`AdversaryScene` had sat in `state.js` since the content pack landed, declared
and read by no file in the project: 31 authored dialogue entries including a
three-way branch, plus 25 barks behind a function nothing called. This session
made it reachable and made it matter.

### Why it was never reachable

The gate was `prestige_count >= 5 AND (void_depth_reached >= 25 OR souls >= 1000)`.
Measured with `tools/balance_sim.mjs`, seed 20260726, 40 clicks/min:

| policy | result |
|---|---|
| the simulator's shipped realistic policy | prestige 1 at 23:46; prestige 2 never inside 72h |
| maximally greedy (reboot the instant 1 DP exists) | prestige 5 at **22:18:40**, with 1h23m of dead time first |

And `achievementProgress.void_depth_reached` **has no write site anywhere in
`js/`**, so clause 2 always silently degraded to `souls >= 1000` — an
instantaneous check against a resource that resets on every reboot, so it could
also simply be missed between polls.

The gate is now `prestige_count >= 3 OR lifetime souls >= 700000`. That number
is `tools/golden/8h.json`'s own endpoint (711,493), so a never-prestiging player
arrives around hour eight; a test asserts the gate is open at exactly the
baseline figure, read from the file rather than restated.

> **The bigger finding, not fixed here.** On the current curve the Nth reboot
> needs `60000 * N^(1/0.45)` lifetime souls — reboot 8 needs ~6.1M and reboot 12
> ~15.0M, against 2.14M measured at 22h of greedy play. So the Nightly (reboot 8)
> and Archived (reboot 12) channels in `DESIGN_DIRECTION.md` §2 — the stated
> replayability payload — are effectively unreachable. **The prestige curve is
> the blocker, not any individual piece of content.** This is worth more than
> this scene was.

### What the scene is

Two phases in one `.system-dialog`, because ADV-001..009 are **not dialogue —
they are a login box**. Phase 1 wears the ordinary CMS vellum chrome so nothing
*looks* wrong; the wrongness is entirely behavioural. The username field fills
itself with OPERATOR, the password fills with dots (that is ADV-005), and
"Welcome back, Operator." arrives three times **in the same place**, so the third
reads as wrongness rather than as three list items. Then the titlebar goes red
and the panel degrades into the transcript. Rendering those nine as chat rows
would have thrown away the best prop this game has.

The choice is a starting position, not a verdict. `State.adversary.standing` is
a signed integer with derived bands (≤−3 hostile, −2..2 curious, ≥3 complicit);
`playerChoice` seeds it and stays immutable as the origin fact. Each branch has
one distinct consequence visible before the modal closes: hostile gets an
undeletable audit log that gains a line every reboot, curious gets a partial
manifest on the patch (which is what ADV-L-14 is *for*), complicit has the
Recycle Bin open itself.

The permanent residue is a row in Task Manager — `void_mirror.service#2`,
unownable and unendable — which is what ADV-013 announces and what ADV-BARK-01
and ADV-L-12 were written to refer to. Both barks are filtered to that process
name, so they never fire on an unrelated kill.

### Bugs this turned up

**In the existing code:**
- `attemptLoreWhisper` asked for trigger `'casino_idle_30s'` and context
  `'Lore Whisper'`; the data declares `'casino_rare_whisper'` and `'LoreWhisper'`.
  Both strings wrong, so the filter matched zero lines — and nothing called it.
- The Task Manager read `proc.memory` and `proc.description` while all 8
  processes declare `mem` and `desc`: every row showed "undefined MB" with an
  "undefined" description, and the memory total was `NaN`.
- `deleteItemPermanently` ignored `deletable === false`, which `restoreItem`
  honours. `emptyRecycleBin` ignored it too and truncated the array outright.
- **`bootstrapModifiers` read `State.modifierLog` AFTER `ensureReality()`.**
  `ensureReality` calls `State.save()` whenever the build re-derives differently
  — precisely the case its own comment says the re-derivation exists to serve —
  and `save()` overwrites `modifierLog` with `Modifiers.serialize()`, which is
  empty that early in boot. So the log was destroyed and `rebuildModifierLog()`
  replayed only the content ledgers. Latent until now because every record was
  ledger-derived; the patch's two `scope: 'permanent'` records are the first
  that are not, and losing them is silent and unrecoverable. Fixed in both
  halves: read before, and `save()` now refuses to trade a populated log for an
  empty one.

**In this session's own work, found by the sweep after the tests were green:**
- The scene could open **behind the boot overlay**. `game.loop()` starts at
  parse time, so the 1 Hz poll runs ~1s in, while `#boot-overlay` (z-index
  10000) still covers the modal layer (9500) and 3s before `system.init` shows
  the offline report — which then rewrote the layer and destroyed the scene,
  leaving `advScene.open` true over an empty layer. Since `system.js` routes
  every keypress into an open scene, that was a **dead keyboard for the rest of
  the session** plus an unfinishable scene. Now defers on the overlay, and
  `dismissSystemModal` tears the scene down defensively.
- `sceneAttempts` counted **presentations, not failures**, so two ordinary
  mid-scene page reloads spent the whole budget and forfeited the scene to a
  headless default. Now refunded at the phase-two boundary — proof the renderer
  works — and the headless fallback resolves as OP-B, not the hostile extreme,
  since that player was never shown the buttons.
- Keyboard-only players **could not answer**: `Tab` was swallowed so focus never
  reached the buttons, and `Enter` was swallowed so a focused button never
  fired, leaving Escape (which resolves as DENY) as the only exit. Tab is now
  trapped and cycled, Enter/Space pass through, and 1/2/3 answer directly.
- Barks rendered at z-index 9000, **underneath** the modal scrim at 9500.
- Escape's skip-to-choice loop re-rendered the current line (duplicating it) and
  dumped the login script into the transcript as chat rows.
- Standing had no cooldown, so opening one window twelve times walked a hostile
  player to complicit. Now a 10-minute per-reason cooldown, with once-per-run
  acts (reboot, patch) exempt.
- `.adv-welcome-2` measured 2.4:1 on the vellum panel. Added `--cos-verd-600`
  (#285d53, 4.69:1) so the colour drift that *is* the beat survives legibly.

### Method notes

A survey + three-critique workflow ran before implementation; the craft lens
returned **rework** and its central objection (the login box) reshaped the whole
presentation. A five-lens adversarial sweep ran after the suite was green and
returned 17 confirmed findings including three blockers — **none of which the
38 passing tests could see**, because two lived in boot timing that `?testMode`
structurally skips and one only manifests when a build re-derives.

Both new regression tests were verified by reverting the fix and watching them
fail. The e2e boot-race assertion deliberately runs on a **non-testMode** page.

### Content reachable now

- The scene: all 32 dialogue entries present, 30 shown per run (two branch
  replies belong to paths not taken). Previously **zero**.
- Barks: **16 of 25** play. The other 9 are pinned by id in
  `tests/adversary-scene.mjs` so a tenth cannot fall out silently.
- `ACH-S-005 Mirror Login` and `DOC-NEW-11` are reachable for the first time;
  `DOC-NEW-14` unlocks on patch execution.

### Still dead, and why

- **There is no Casino app.** ADV-BARK-04, ADV-L-15, ADV-L-16, all 80
  `CasinoHostBarks` and all 12 lore whispers stay unreachable, and
  `State.casino.visited` has no write site so DOC-NEW-12 stays locked. The
  whisper string bugs are fixed but `attemptLoreWhisper` still has no caller.
- ADV-L-01 (`idle_60s`) is deliberately unhooked — a good line, wrong cadence
  for a game where idling is the intended state.
- ADV-L-03 (`toggle_music`) — the game ships silent.
- ADV-L-05/-18/-19/-20 — `warning_popup`,
  `seraph_self_awareness_event`, `void_depth_50`, `attempt_resign` are events
  that do not exist.
- ACH-S-006 and ACH-S-007 need `onClick` handlers that
  `ui.updateTaskManagerList` declares in the data but never binds.

### Second sweep — reviewing the fixes

The seventeen fixes above had been through one round of testing and no
independent review. A second five-lens sweep over them returned 7 confirmed
findings, one a blocker, plus 4 partials. The lesson repeated: **the riskiest
code in a session is the code written to fix the last review.**

- **BLOCKER — the choice could be committed blind.** The scene teaches clicking:
  the whole section advances on click and the hint says "Click to continue",
  across ~40s of theatre. A player skipping ahead is mid-mash when three buttons
  materialise under the cursor, in the same band every previous line was drawn
  in. Reproduced in Chromium: clicking the dialog centre every 300ms committed a
  permanent, unreplayable relationship one click after the row rendered, and all
  three branches were reachable purely as a function of cursor Y. The choice row
  now renders `is-arming` and arms only on **delay AND deliberate intent** (a
  pointer move or keypress since it rendered) — a bare timeout would only move
  the accidental commit to the next click in the mash.
- Writing that guard exposed a second one: **`element.click()` ignores
  `pointer-events`.** The CSS stops real mashing but nothing programmatic, so
  the guard also needed a UI entry point. `ui.adversaryChoiceClicked` is now the
  only path a player can take; `chooseAdversaryResponse` remains the mechanism.
- The attempt budget granted **two** presentations while both comments said
  three — it incremented before testing exhaustion.
- The bark layer at z-index 11000 painted opaquely over two Genesis menu entries
  that stayed clickable through it. Demoted to 9000 only while the menu is open.
- Phase 1 was the only system dialog **without the bevel**: a flat
  `border-color` override was replacing `.system-dialog`'s four-sided one.
- `ACH-S-006` and `ACH-S-007` were unreachable — two processes declare `onClick`
  handlers writing the exact keys those achievements read, and
  `updateTaskManagerList` never bound a listener.

**And a test that lied.** `check('reaching the transcript refunds the attempt
budget')` asserted the exhaustion *threshold* and string-matched ui.js for the
headless default — neither of which is the refund. A reviewer deleted the entire
refund block and the test stayed green. It is split in two with honest names,
and the real assertion moved to `tests/e2e-smoke.mjs`, which runs a live page and
can therefore reach `advEnterPhaseTwo` at all. The load-bearing line checks the
**persisted** value, so dropping the `State.save()` while keeping the in-memory
reset now fails.

> This is the third time in this project a test has asserted the wrong property
> and passed while the thing it named was broken. The pattern is always the
> same: the assertion tests what is *easy to reach from the harness* rather than
> what the name claims. When a harness structurally cannot reach the code — as
> the vm suite cannot reach `js/ui.js` — that is a signal to move the test, not
> to assert something adjacent.

Finally, the new e2e boot-race check was flaky (3 of 5 runs). Two real causes,
both mine: the seeding page's own autosave raced the `localStorage.setItem`, and
the seeded save had zero production so `initializeSession` returned no report at
all. Seeding now happens in an `addInitScript` that runs before the app boots,
with production included. Five consecutive green runs.

---

## 2026-08-05 — Session 4: the reboot economy

### The diagnosis

Divinity was `floor((lifetimeSouls / 60000) ^ 0.45) - alreadyBanked` — a pure
function of LIFETIME Souls. Measured over 48h with `tools/balance_sim.mjs`,
every prestige policy converged on the same ~8 Divinity:

| policy | reboots | total Divinity |
|---|---|---|
| reboot at +1 | 8 | 8 |
| wait for +2 | 4 | 8 |
| wait for +3 | 2 | 6 |
| wait for +5 | 1 | 5 |

**Reboot timing could not change what you earned.** Since a reboot also resets
production, rebooting was strictly a cost, and the only reason to press the
button was to tick a counter gating channels and mandates. Reboot 8 (Nightly)
landed at 45 hours; reboot 12 (Archived) never arrived. Dead time after the last
purchase ran from 2h42 to 23h53 depending on how patient the player was.

That is `DESIGN_DIRECTION.md` §1's "prestige is a ratchet, not a game", sitting
in the arithmetic.

### The fix, and the two ways it went wrong first

Divinity now scores **the run**: Souls earned since the last reboot, against a
bar that rises with what you have banked. Both halves are load-bearing, and I
found that out by shipping each one alone:

1. **Run-scoring alone made reboot-spam dominant** — measured at prestige level
   848 and 34,124 Divinity in 24 hours.
2. **The rising bar alone left patience worthless** — at exponent 0.45, doubling
   your award cost 4.7x the Souls, so banking immediately always won.

3. **And then the fix itself was divergent, past the window I measured.** With
   growth 0.55 against a bonus exponent of 0.75, income (~D^0.75) outgrew the
   bar (~D^0.55), so the reboot period shrank as D^-0.20 — without bound. At 24h
   it looked healthy at 26 Divinity. At 48h it was **3,116 Divinity and prestige
   level 194**, with reboots landing exactly 5:01 apart — pinned to the
   simulator's own policy gate rather than to anything in the economy. An
   adversarial sweep caught it; my tuning window was simply too short.

> **The invariant that was missing:** the reboot bar must outgrow the bonus that
> funds it, with margin, because run Souls grow *superlinearly* in the
> multiplier — income is reinvested into automatons inside the run, so merely
> matching the exponents still diverged in measurement. Raising growth to 0.90
> was not enough; the bonus exponent had to come down to 0.45.

### Final constants, all measured

| constant | was | now |
|---|---|---|
| `prestigeSoulsPerPoint` | 60000 | 35000 |
| `prestigeExponent` | 0.45 | 0.90 |
| `prestigeThresholdGrowth` | — | 0.80 |
| `prestigeBonusExponent` | 0.75 | 0.45 |

| | before | after |
|---|---|---|
| Beta channel (reboot 3) | 18h+ | **2h27** |
| Nightly (reboot 8) | 45h | **8h37** |
| Archived (reboot 12) | never | **15h11** |
| Divinity at 24/48/72/96h | 8 (flat) | **18 / 36 / 79 / 208** |
| dead time per 24h | 2h42–23h53 | **~1h18** |

Bounded across 96 hours of continuous play: the reboot period drifts from ~30
minutes to ~8 minutes over four days and the payout stays +1, rather than
collapsing onto the tick.

### Also fixed

- **Migration 5.** A pre-v5 save has no baseline, so its entire lifetime would
  read as one uncashed run — a returning player with 5M Souls would collect ~55
  Divinity from a single reboot and unlock every channel at once. Those Souls
  were already paid for under the old formula, so the migration closes the run.
- **The panel understated its own payout.** `performPrestige` multiplies the
  award by the channel (Beta 1.4x, Nightly 2.2x) but the Divine Settings panel
  rendered the unmultiplied score — the exact number that is supposed to make a
  riskier channel worth choosing. Both now route through `getPrestigeAward()`.
- **`getSoulsUntilNextPoint` had never been rendered by anything** since the
  economy rebuild. The panel now reads "+9 after 2.1K more Souls this run", so
  the push-vs-bank decision is visible instead of implied.
- The simulator's own prestige policy still modelled the old economy
  (`gain >= max(5, banked * 0.5)`), which under the new curve reaches reboot 3
  at 18h and never reaches 8. Replaced, with the reasoning recorded in the tool.

### On the tests, again

The first version of `tests/prestige-curve.mjs` passed 13/13 **while the economy
was divergent**, and the sweep demonstrated it passed at `prestigeExponent:
0.45` — the exact value the test's own comment names as the bug. Its bound was
`cost < 5`; the broken value costs 4.66.

Every bound is now mutation-verified. All four of these previously passed
silently and now fail:

| mutant | result |
|---|---|
| `prestigeExponent: 0.45` | 2 failed |
| `prestigeExponent: 1.60` | 1 failed |
| `prestigeThresholdGrowth: 0.30` | 1 failed |
| `prestigeBonusExponent: 0.75` (the blocker) | 1 failed |

The single most valuable addition is one line of arithmetic —
`prestigeThresholdGrowth > prestigeBonusExponent`, with margin. It would have
caught the blocker instantly and costs nothing to run.

Also: "the run baseline survives a save round trip" hand-copied two fields
between two State objects and never called `save()` or `load()`, so it could not
have caught a serialiser that dropped the baseline — the only failure it existed
for. It now writes through the real save path into a shared store and boots a
second game against it.

**Fourth time in this project a test has asserted the wrong property and stayed
green.** The pattern does not vary: the assertion tests what is convenient from
the harness rather than what the name claims.

### Known gaps, carried forward

- Every balance figure here is measured on the **stable** channel. Nightly pays
  2.2x for more volatility, so a Nightly player climbs the same ladder faster —
  the reachability numbers are ceilings, not estimates. Whether Nightly is
  *correctly* priced against its risk has not been measured.
- The golden master still only pins 2h, 8h and 2h-idle. The divergence lived
  past all three. A 48h horizon would have caught it, at the cost of roughly
  doubling the suite's runtime.
- `archived` remains unoffered — it is byte-identical to stable and pays no
  Divinity, so reaching reboot 12 unlocks nothing yet. That is a separate
  unimplemented feature, not a curve problem.

---

## 2026-09-03 — Session 5: certification, and shipping as a decision

Two of `DESIGN_DIRECTION.md`'s Phase 2 items, which are really one decision
seen from both ends: **§4.2 certification** (the Mandate tree stops being a
checklist) and **§4.4 the ship-the-build run exit** (a run acquires a shape and
a way to end badly).

### What the reboot is now

You do not press Divine Reboot. You **ship a build**, and the dialog asks for
terms: what it pays, which known issues go on the permanent record, and which
Mandate path the next run is certified on. That last one has **no default** and
the button stays disabled until you answer it — the Adversary scene's arming
problem solved by a cheaper route, since a choice that is the button's
precondition cannot be resolved by a reflex click.

**Certification.** A branch's bonuses apply only while you are certified on it.
A branch you have certified on before pays a 10% residue forever; one you never
have pays nothing. Buying a node still unlocks it permanently — certification
decides which unlocked nodes are switched on. Everything mandate-derived lives
under a new `scope: 'cert'` so the whole set can be dropped and rebuilt in one
call, which keeps the residue arithmetic in exactly one place.

The residue scales a modifier's **distance from 1**, not its value. A tenth of
`mul 1.4` is `mul 1.04`. A tenth of the *value* is `mul 0.14` — an 86%
production cut dressed as a consolation prize, and indistinguishable from the
correct answer to any test that only asserts "less than full". There is a test
that names this.

**Instability and the cascade.** Unpatched known issues accrue instability by
severity weight, `(4 - severity)` per hour. Three tiers: SEV-2 DEGRADED at 1.0
(output ×0.6, award 75%), SEV-1 OUTAGE at 1.5 (×0.3, 40%), CASCADE FAILURE at
2.0 (×0.1, **award 0**). Fully deterministic — no roll — because randomness
would have cost the golden master and let a player reload-shop a better
outcome, the same reasoning that made Reality Builds seeded.

**Scars.** Ship with an issue unpatched and it is filed permanently, keeping
15% of its bite. One entry per id ever, so the ledger is bounded by the eleven
issues in the pool and a hundred runs cannot compound into an unplayable game.

### Three decisions that were not obvious

- **The opening build does not degrade.** Instability is gated on
  `prestigeLevel > 0`. Sector 7G's failed integrity check is the tutorial; a new
  player idling two hours before their first reboot would otherwise return to a
  collapsed universe having never been told the mechanic exists.
- **A clean build settles.** Without recovery, clearing every issue on a
  degraded build strands you at whatever you had accrued with nothing left to
  patch — punished for doing exactly what the mechanic asked. Instability now
  bleeds off at 0.5/h once nothing is on file.
- **A collapsed build can still be shipped.** Shipping is gated on the run's
  *score*, not its *award*. Gating on the award would trap the player inside
  the cascade, since the only other exit is a patch a collapsed run may not be
  able to fund. Shipping for zero is a bad outcome you chose; being unable to
  ship is a soft-lock, and this project has already shipped two.

### Measured

`tools/balance_sim.mjs` gained a certification policy (rotating by default,
which is the harsher case), a patch policy, `--push=N` for a patient player and
`--no-patch` for one who never opens the panel.

Convergence holds — 31 reboots by 48h against 36 before, gaps lengthening
65→145 min. The certification nerf is visible and modest: `multipliers.praise`
15.90 → 14.60 at 2h. Lifetime Souls actually rise (129k → 173k at 2h) because
the simulator now patches.

The cascade only bites the player it is for:

| policy (24h) | reboots | Divinity | shipped degraded |
|---|---|---|---|
| patches, ships early | 18 | 18 | never |
| never patches, ships early | 16 | 16 | never |
| never patches, pushes to +3 | 3 | **9** | collapsed |
| never patches, nightly, +3 | 5 | 17 | twice |
| never patches, pushes to +6 (48h) | 1 | 6 | collapsed |

Pushing a run while ignoring its changelog halves your Divinity. Ignoring the
changelog while shipping promptly costs nothing but scars. Both are legitimate,
which is the §4.1 rule that ignoring must sometimes be viable.

### On the tests, a fifth time — and the first that worked

23 new tests, and every one **mutation-verified**: 14 deliberate breaks, 14
caught. Two survived the first pass and both were the familiar failure:

- *"a grant mandate is not issued on an uncertified path"* only asserted the
  positive half, so it passed a build that issued every grant regardless of path.
- *"the same issue is only ever filed once"* poked the scar ledger directly and
  never exercised the filing dedupe in `performPrestige`.

Also caught by the harness itself: `game_()` handed every test 5000 Divinity to
shop with, which **raises the reboot bar**, so five tests were asserting against
a `performPrestige` that had refused and returned. They passed anyway.

### And one bug only the browser could find

`bootstrapCertification` re-derived `everCertified` from the purchase ledger on
every boot, so buying a single node on a dormant path silently promoted it to
the residue on the next reload — free value, and it collapses *dormant* and
*lapsed* into each other, which is the distinction the mechanic is made of.
Found by reloading the page and watching Entropy relabel itself.

The ship dialog also shipped light-on-light in its first draft: `.system-dialog`
is a **light** vellum surface and the CSS inherited the dark-panel inks used
elsewhere in the file. No test can see that.

### Carried forward

- The storage repeatables are broken and **the economy needs them broken** —
  see `38ea619`. Rank 2+ of every vault is silently discarded, so praise sits
  capped at 7,000 for an entire 8h run. Fixing it diverges the reboot loop at
  every grant curve tried. It needs the id fix, the storage curve and the
  prestige curve re-measured together at 48h and 72h.
- **That is also why patching is currently free**, and therefore why an
  attentive player never sees a cascade: every resource sits pinned at its cap,
  so a cost denominated in resources costs nothing. The cascade is correct and
  measurable today only under `--no-patch`. Its pressure arrives on its own
  when storage is fixed.
- `Modifiers.explain()` still renders nowhere. It is now the obvious home for
  showing a cascade throttle and a lapsed-path residue in the same stack.

### The review pass, and what it cost to actually look

Four defects, all found after the feature commit was already green, and none
of them findable by the suite that was passing.

**Temporal Rift was a free hour.** (`0a7040f`) The Rift grants a simulated hour
of production without going through `tick()`, so it accrued no instability.
Rifted Souls raise the prestige award like any others, which makes an hour of
them at no degradation strictly dominant: rift, bank a bigger award, never meet
a cascade. It defeated the mechanic shipped one commit earlier. Found by reading
the two code paths that simulate time in bulk — offline progress is the other,
and its exemption is deliberate and now asserted as a pair with this one so the
asymmetry is stated rather than inferred.

**A crafted save could switch the whole tree off.** (`335f41f`) Found by
feeding twenty hostile save shapes through the real loader. Nothing threw and
no save was reported lost — but the normaliser read
`cert.path = cert.path || null`, which is a no-op for every truthy value. A
save carrying `path: "nonsense"` kept it, no branch ever matched, and every
node the player had ever bought went dormant with no explanation and no way to
fix it before the next ship. The same amputation `bootstrapCertification` was
written to prevent, arriving through a different door. `Number(x) || 0` also
let a *negative* instability through, which would make a player immune to the
cascade for a hundred hours — reachable, since `importSave` decodes pasted text
straight into `State`.

**A cascade warning could be swallowed.** (`cc11f22`) `alertedTier` was marked
before the dialog rendered, and `showCascadeAlert` correctly refuses to paint
over an open modal. So a collision dropped the warning and recorded it as
delivered — and `syncCascade` early-returns on an unchanged tier, so there was
no second chance. Output throttled, award cut, nothing saying why. Not a corner
case: modals are open exactly when a tier turns over — release notes on every
reboot, the offline report on every load, the Adversary scene at its
thresholds. The alert now reports whether it rendered and is retried until it
lands. Reproduced and fixed against the real collision in a browser.

**A note written with quotes broke the markup around it.** (`dd40134`)
`'Note left: "too noisy".'` interpolated into `title="${entry.note}"` closed
the attribute early: the tooltip truncated at `Note left: ` — the punchline
cut, which is the actual damage here — and two stray attributes appeared on the
button. Pre-existing, in a panel this session extended. `ui.escapeHtml` now
covers the six sites where content reaches `innerHTML`.

The mutation harness ended at **21 breaks, 21 caught**, and 28 tests in
`tests/certification.mjs`. Worth noting what the harness could *not* have
found: three of these four needed either a browser or a deliberately hostile
input, and the fourth needed reading two functions side by side and asking why
they disagreed.

### The adversarial sweep

A three-lens review with two refuters per finding raised 13 and killed 9. The
four that survived all reproduced, and three of them were holes in the fixes
above.

**The ship dialog quoted an award it would not pay.** `renderShipDialog` ran
once, at open, while instability kept accruing underneath and `confirmShip`
paid `getPrestigeAward()` evaluated fresh. Reproduced: opens at 86 Divinity on
a SEV-1 build, the run tips into CASCADE FAILURE while the player deliberates,
the dialog still says 86, shipping banks 0. And this was the *one* place a tier
change was guaranteed to be invisible, because the cascade alert correctly
refuses to paint over an open modal — the fix two entries up created the blind
spot. The award and the cascade block now refresh from the panel tick. Same
defect as the Divine Settings readout one surface over, which `ui.update()`'s
own comment already describes: a panel that shows a moving decision has to be
on the tick.

**Reloading inflated storage caps.** `applyCertification` and `applyScars`
rebuild derived records every boot, and `dropScope` + re-add *appends* — so
those records jumped behind everything bought since. On `caps.*` that is not
float noise, because mandates fold `mulfloor` and storage repeatables fold
`add`: `floor(base × 1.5 × 3) + 2500` became `floor((base + 2500) × 1.5 × 3)`.
Measured at **4,750 → 13,500 by pressing reload**, and the verifiers widened it
— `purchaseMandate` calls `applyCertification` too, so buying any mandate did
it mid-run with no reload. `Modifiers.reconcileScope` now updates in place,
appends only what is new, and drops what is no longer wanted.

> I had already dismissed this hazard as "float epsilon" earlier in the
> session. That was wrong: I only considered `mul`, and never looked at the
> `mulfloor`/`add` mix on the cap targets.

**The Rift paid its hour at the pre-hour tier.** `tick()` accrues before
reading rates so a crossing throttles the tick that caused it; the Rift did the
opposite, and there the ordering is worth a full hour. The previous commit's
claim that "the rates already carry the throttle" was true only of the tier in
force *before* the rift.

**A suspended tab degraded the build.** `loop()` replays the whole wall-clock
gap through one tick, clamped to 8 hours, for exactly the suspended-tab case —
so instability accrued for time the player was absent, making leaving the game
*open* strictly worse than closing it. Three bulk-time paths, not the two the
Rift commit claimed to have audited.

And two lessons that were not findings:

- **A surviving mutant found an untested branch that mattered.**
  `maintenance_apex` sets `offline.efficiency` to 1, and `residueValue` returns
  null for `set` — so a lapsing path must *drop* that record, not keep it at
  its old value. The behaviour was already correct; nothing tested it until the
  harness said so.
- **One of my own new tests was vacuous.** The first Rift test compared Souls
  banked between rifting and living the hour, and both were **zero** — the
  hand-built fixture had no working production chain, so it passed under either
  ordering. It now asserts which tier is in force at the moment the rates are
  read, which is the real property and cannot go vacuous. Sixth time in this
  project; the first one caught by a mutation harness rather than by a later
  session.

Final: 32 tests in `tests/certification.mjs`, **26 mutants, 26 caught**, full
suite green, golden master unchanged.

## 2026-09-30 — Session 6: sinks, loops, sound, and the plan for moving pictures

Current request: find where progress stopped, then improve UI/UX, gameplay,
time sinks and resource sinks, and plan a visual upgrade (video scenes,
training videos, animations) with concise Krea art direction.

Branch `session-6/sinks-and-loops` (23 commits on top of `f52cd9c`), not yet
merged to `main`. Four slices were built in parallel worktrees and merged
here; the economy re-tune was done on the branch itself.

### Where progress had stopped
Session 5 (2026-09-03) shipped certification and ship-the-build, then left a
documented, deliberately-unfixed defect: rank 2+ of every storage repeatable
was discarded while still charged, so the whole economy sat under a ~7,000
Praise ceiling — and, because every resource was pinned at its cap, every
resource sink in the game cost nothing. The handoff said the next session
should be the storage/economy re-tune. It was.

### The economy (d212027, 5b141cf)
- Rank is part of a modifier's identity (`Modifiers.autoId`); rank 1 keeps its
  historical id so saves match themselves, and `reconcileRepeatableRanks`
  restores ranks a save paid for, filed behind that vault's rank 1 so the
  `mulfloor`/`add` fold order on caps is preserved.
- A vault rank costs **65% of the vault it extends**. Geometric cost against a
  geometric grant was either free forever (caps ran to 7.6e20) or walled (a
  geometric floor walled every run at the identical 3.3e9). Share-of-vault is
  scale-invariant and makes storage a sink that competes with automatons.
- Prestige re-measured on top: bar 35,000 -> 1e8, bar growth 0.8 -> 1.2,
  payout exponent 0.9 -> 0.75. Measured 22 / 66 / 296 Divinity at 24h / 72h /
  240h, nothing collapsing toward the five-minute gate. A moderately deeper
  run pays ~15–25% more; a very deep one wastes hours (runs saturate).
- Void-tier upgrades 3x, capstones 5x: the first run no longer buys all 44
  upgrades by minute 37. Void at ~17 min, last capstone ~66 min, first
  reboot ~86 min for a steady clicker.
- `tools/balance_sim.mjs --tune=file.json` overrides Economy, vaults,
  repeatables and upgrade costs per run. The re-tune was a search over ~40
  configurations at three horizons; this is how it was done.

**Six existing tests went red and all six had gone vacuous, not wrong.** They
stated runs in raw Souls (500K, 4M, 5M) that were comfortable multiples of the
old bar and below the new one, so both sides paid zero. Restated in bars. The
same pattern recurred in two merged slices' fixtures (breakdown, incidents) —
both caught by their own "fixture check: the reboot happened" guards, which is
the guard doing its job. **Any future change to the bar: grep tests for
literal Soul amounts.**

### Incidents — the maintenance loop the premise promised (js/incidents.js)
14 ticket templates; at most 3 open; SEV-3 -> SEV-2 -> SEV-1 over attended
minutes; a SEV-1 halts its production line and opens its own dialog (the
`showCascadeAlert` render-or-retry contract). Every ticket offers **labour**
(a needle-and-band timing ritual, ~15–45s), **resources** (seconds of
production, bounded by cap fractions — now a real sink), or **debt** (a
run-scoped penalty). ~25% are false alarms with a textual tell that close
themselves if ignored and drop a quarantined log in the Recycle Bin, which —
with patched-module `.bak` files — can be sacrificed to close any ticket.
Prophets can be dispatched to a SEV-3. Task Manager is the triage console; a
tray LED and an operator-panel line show the queue. Offline, Temporal Rift and
suspended-tab catch-up never file or escalate. Disabled in the simulator
(`game.incidentsEnabled = false`) — **there is no incident policy in the sim
yet.** 29 tests, 54/54 mutants caught.

Not done on purpose: `createResourceSacrifice` is still uncalled, and should
stay so — it grants an unbounded permanent `globalGain` (1e6 Praise ≈
+100,000%). It is a hazard if anything ever calls it.

### Production breakdown (js/breakdown.js)
Hover, focus or tap any rate or vault for a "Provenance" sheet: base, grouped
multipliers with sources and ranks, certified-full vs lapsed-residue mandates,
transients, the cascade throttle in alarm red, the Throne/Revenant draw as a
subtraction. `getProductionRates` now runs through `computeProduction`, a fold
over named factors in the exact old operand order, so the rate and its
explanation share one code path and the golden was byte-identical. 21 tests
asserting exact equality, 11/11 mutants caught. Also stopped
`renderRealityPanel` rewriting identical HTML at 10Hz (it destroyed focus).

### Audio (js/audio.js)
Fully synthesised WebAudio — no files. Buses, limiter, ~22 cues (miracle bell
climbing a pentatonic with the streak, purchase, the reimagined ding, tiered
achievement stingers, cascade alarm per tier, adversary glitch, release
chord, boot POST), an ambient drone that brightens with production and
darkens/detunes under a cascade, settings in Divine Settings, a tray mute.
Every call goes through `game.sfx`, inert headlessly. This session added an
`incident` pager cue and wired Incidents and Patience.exe. Known: browsers
block audio before a gesture, so the boot cue usually won't play.

### Patience.exe (js/solitaire.js)
The 500-Adoration Solitaire purchase that installed nothing — and, it turned
out, could never be bought at all (`minigames` vs `miniGames` schema key) —
now installs Golf solitaire with the four automaton ranks as suits. Pays
Adoration and Overclock charge with a continuously-draining fatigue curve so
it is a break, not a farm; Divine Mulligans (undo / reshuffle) cost 5% / 15%
of the Praise vault. Rounds are seed + move list, replayed, so they survive
reload and resist tampered saves. 43 + 9 browser tests, 39/39 mutants caught.

### Visual upgrade plan
`docs/VISUAL_UPGRADE_PLAN.md`: a paste-ready Krea style block and negative
prompt, the palette tokens, five rules (never bake text into generated art),
seven cinematics tied to the code site that plays each, six diegetic
"CMS Operator Orientation" training tapes for a Sacred Media Player app, the
sprite/animation sets with art hooks (Patience card classes included), the
media-layer engineering spec, and a production order.

### Verification
`npm test` green: save 18, modifiers 78, reality 29, adversary 40, prestige 16,
storage 12, certification 32, breakdown 21, incidents 29, solitaire 43, golden
(recaptured twice, intentionally), e2e, Patience e2e 9; `test:audio` 14. The
integrated build was driven in a browser: a SEV-2 ticket triaged by labour,
the Provenance sheet on Praise/s, Patience.exe bought and dealt.

### Process notes
- The Agent tool created all four worktrees from `9db0b7e`, three commits
  behind `main`. One agent noticed and fast-forwarded; the others were told.
  **In every agent worktree, check `git merge-base --is-ancestor <expected-base> HEAD`.**
- Agents share the session scratchpad; a generic filename (`dbg.mjs`) was
  overwritten mid-session. Prefix scratch files.
- Vite on this machine binds `localhost` (IPv6) only; the tests default to
  `127.0.0.1`. Use `COSMOS_TEST_URL=http://localhost:5173`.

### Next
1. An incident policy in `tools/balance_sim.mjs`, then measure what triage
   costs the curve (currently invisible to the sim).
2. Merge `session-6/sinks-and-loops` to `main` (PR).
3. The media layer (`js/media.js`) and Sacred Media Player from the visual
   plan, then the first Krea assets: V2 *Ship the Build*, V6 *First Seraph*.
4. Still open from before: the Archived channel; the Void's thin Reality
   Build coverage; achievement rewards and shop items mutating `State`
   directly.

## 2026-10-01 — Session 6, part 2: absence is safe, the archive opens, the tapes roll

Current request: incidents and outages shouldn't punish AFK play — propose
a better model, then keep building. Same branch, `session-6/sinks-and-loops`
(18 more commits; still not merged to `main`).

### Incidents now reward attention instead of taxing absence (d45d226, 0dbd9a7)
- **Presence, not visibility.** Input in the last 2 minutes (`game.isPresent`;
  `system.trackPresence` installs passive listeners). A visible tab with
  nobody at the keyboard is idle play.
- **Away means ON HOLD.** Penalties lifted from the registry, clocks frozen,
  nothing filed, no dialogs. A save boots held, which keeps offline accrual
  clean (it reads rates committed straight after `Incidents.bootstrap`); a
  slept laptop's catch-up tick holds the queue before it reads rates.
  Return grace: held tickets resume with ≥60s. Deferrals stay applied.
- **Outages degrade to 25%** instead of zeroing a line, and an outage
  untouched for 10 attended minutes is **contained by the on-call rota**:
  closed and filed as a deferral at outage depth (cleared at ship).
- **A hands-on fix pays Overclock charge** (12 / 20 / 35); paying and
  deferring pay nothing.
- Headless there is no presence tracking, so the simulator and every vm
  suite behave as before. 10 new tests; 14/14 mutants caught.

### The simulator can triage (`--incidents=off|ignore|labour|pay|mixed`)
Default `off`, golden byte-identical. Labour costs the simulated player its
clicks for 20–36s and lands through `Incidents.completeLabour`, the same
path and reward as the ritual. Measured (Divinity, baseline 22 / 66 at
24h / 72h):

| policy | 24h / 72h | note |
|---|---|---|
| labour, pay, mixed | 22 / 66 | mixed ≈ 9 min of attention a day |
| ignore, before containment | **10 / 10** | soft-locked: 3 permanent outages, no run reaches the bar |
| ignore, after containment | 20 / 63 | a few percent for not reading the queue |
| Nightly 48h: off / ignore / mixed | 73 / 57 / 73 | Nightly's teeth; mixed ≈ 30 min/day |

### Archived channel (agent slice, merged c21fe86)
From reboot 12 the ship dialog offers Archived with a release history
(`State.reality.history`, validated and capped). A replay regenerates the
exact build, pays 0 Divinity without moving the bar (it still has to clear
the run-score bar), and files NULL.OPERATOR's annotations on what you
shipped unpatched to Notepad › Archive — making ACH-030 reachable for the
first time, plus ACH-036/037. 18 + 10 tests, 35/35 mutants.
Open design questions: old saves start with empty history; scars are
once-per-id-ever, so replaying a cursed build rarely adds a scar.

### Media layer + Sacred Media Player (agent slice, merged 6339cf4)
`js/media.js` plays cinematics (V1 boot, V2 ship, V5 Void, V6 first Seraph)
only when the file exists — with `assets/video/` empty the game is exactly
as before (Vite answers a missing file with index.html + 200, so only a
media content type counts). Cinematics queue behind system modals on the
cc11f22 render-or-retry contract. `js/mediaplayer.js`: six training tapes,
filed at milestones (T1 at 10 Miracles), playable NOW as captioned
fallback slides from shipped art, with a toggleable CSS VHS treatment.
Every caption's mechanic was checked against code. Drop-in contract and
the 33-reel Krea shot list: `docs/VISUAL_UPGRADE_PLAN.md` §7.
Settings → Cinematics (first time / always / off). 43 + 17 tests, 41/41.

### Smaller
- Windows reopen where you left them (own localStorage key, clamped,
  desktop only). 7 browser checks.
- Achievement bursts: max 3 toasts, the rest queue under a "+N more"
  plaque; toast text escaped.
- The welcome-back report says held tickets waited for you.
- The Notepad counts archive annotations.
- Every browser suite defaults to `localhost` (Vite here binds IPv6 only).

### Verification
`npm test` green end to end: 389 node assertions over 12 suites, golden
unchanged, 5 browser suites (e2e, Patience 9, Archived 10, media 17,
layout 7); `test:audio` 14 separately. dist rebuilt.

### Next
1. PR `session-6/sinks-and-loops` → `main` (not pushed; ask first).
2. Generate Krea reels per §7 and drop them in — V2 *Ship the Build* first.
3. V3 / V4 / V7 cinematic hooks (cascade, mirror login, SEV-1).
4. The two Archived design questions above.

### Decisions (user, 2026-10-01)
- **Archived replays carry no extra stakes.** Shipping a replay dirty rarely
  adds a scar (scars are once-per-id-ever), and that is accepted: Archived pays
  0 Divinity and is a lore mode, so a penalty would make a no-reward mode
  strictly worse. Do not add replay scars or replay rewards.
- **Old saves start with empty release history.** Accepted. Archived fills in
  after one more ship; no reconstructed or guessed history.
- V3 / V4 / V7 cinematic hooks shipped (45ed8bb): dialog loops for the cascade
  alert and the SEV-1 dialog, and Mirror Login before the Adversary scene,
  with a presentation-counter guard so a slow probe cannot re-run a finished
  scene. PR #2 open against `main` (which was still at 9db0b7e; it carries
  sessions 5 and 6).

### Session 6 part 3 — the arc ends, the Void changes per build (2026-10-01)

**NULL.OPERATOR endings** (agent slice, merged ed0ae77). SCN-ADV-002 "End of
Shift" opens once the Mirror Login is completed, an Archived replay has been
*shipped*, reboot ≥ 13 and the save is ≥ 24h old (earliest ~14.5h of steady
play; never day one; unreachable by the simulator). The relationship band at
presentation picks the ending and is locked across reload:
- hostile — *Patched Out*, title Sole Operator: you end void_mirror.service#2;
  Miracles ×1.2, Divine Events ×0.9; his barks and audit log stop.
- curious — *Co-Maintenance*, title Co-Operator: a two-Operator rota; Divine
  Intervention cooldown ×0.9.
- complicit — *He Takes the Shift*, title Operator Emeritus: you go to the
  archive; Seraphs ×1.08, Miracles ×0.9.
Each ends in "release notes for the last build" + a Notepad document; the
game continues with the title in the Genesis menu, a desktop watermark and a
per-ending chrome rivet. Modifiers use their own `'ending'` scope (not
`'permanent'`: reconciling that scope would delete the adversary patch's
unrebuildable records), re-derived on boot and reconciled in place.
Replay route: another shipped Archived replay + a band whose ending is unseen.
Hostile standing stamps regressions "Committed by void_mirror.service#2".
ACH-038–041. Also fixed a pre-existing Notepad race (a slow fetch could
overwrite a later-opened document). 39 + 20 tests; 43/44 mutants (1 equivalent).
Agent's design notes worth a playtest: scripted endings with no in-scene act;
±3 bands with reboots drifting hostile; the 24h calendar floor is blunt;
stacked ending modifiers when several are worn.

**Void Reality Builds** (agent slice, merged e34eec0). 13 Void entries (was
2) across improvements, issues (some priced in Void currencies), regressions
and a deprecation that cripples the Nemesis lift; eligible from reboot 1
because performPrestige reseals the Void every reboot and no run ships
without breaching it (a test pins that premise to the live tables).
Deterministic, replay-exact. ~2 in 3 Stable builds and 96% of Nightly now
touch the Void. Curve moved ~2% at 240h (push=1 22/68/311; push=3 27/84/390;
Nightly 29/117/689); golden recaptured intentionally; Economy table updated.

**Fate deals Patience.exe** (agent slice, merged). `PatienceDealer` in
js/solitaire.js maps 79 of 80 CasinoHostBarks and all 12 lore whispers to
real table moments (deal, par, clear, near miss, streaks, Mulligans,
conceding, idle, tapping the dealer); Fate speaks from a strip under the
toolbar that never takes focus. CAS-HOST-042 (the pity chip) is
deliberately unreachable — its `effect` pays, and barks never pay. Fixed a
cooldown bug (0-second authored cooldowns were read as 10s). NULL.OPERATOR's
three Fate lines (ADV-BARK-04, ADV-L-15/16) are reachable for curious and
complicit standing, and Fate answers him (CAS-HOST-081–084). Settings ›
Dealer Chatter. Casino achievements stay unreachable on purpose (ACH-021
carries a reward). 41 + 12 tests, 56/56 mutants. DOC-NEW-12 rewritten to
describe the table that exists.

**Integration:** two cross-slice test assumptions fixed (an endings proxy
count on the hook table; a non-atomic title read in the smoke test that
flaked under load). `npm test`: 479 node assertions over 14 suites, golden
unchanged, 6 browser suites (smoke, Patience 12, Archived 10, media 23,
layout 7, endings 20).

## 2026-10-01 — Session 7: the world gets mail, a web, a feed and footage

Branch `session-7/world-and-media` (PR #2 merged first: sessions 5–6 are on
`main`). Request: merge; generate the Krea reels; playtest the endings; add
mail / internet / socials for lore and world-building; notes for generated
audio, music and narration.

### Krea reels (c47daeb)
Nine reels generated and installed: V1 Cold Boot, V2 Ship the Build, V4
Mirror Login, V5 Void Breach, V6 First Seraph, V3 cascade tiers 1–3 and V7
SEV-1 alarm (seamless loops: same first and last frame). Nano Banana Pro
keyframes anchored on the engine-core art, Seedance 2.5 image-to-video,
`tools/encode_reel.sh` → silent VP9 + H.264 + webp poster. 16 MB runtime.
Raw masters local/gitignored; keyframes + `assets/src/video/MANIFEST.md`
committed. Toasts now step aside under a full-frame reel. The 29 training-
tape shots are NOT generated yet — waiting on the user.

### Audio plan (3963a2f)
`docs/AUDIO_PLAN.md`: style block, 11 music cues, 5 cast voices mapped to
existing content tables, foley, Krea ElevenLabs settings, and a drop-in
contract (`assets/audio/`, content-type probe, music/voice buses with
ducking, captions always on). Not generated or wired yet.

### Endings playtest (128635f)
Each ending now waits on one act the player performs — End Process / Sign
the rota / Hand over the console; timers, clicks and Escape stop at it.
24h floor kept (only bites a one-day binge, its purpose). Hostile drift
kept for now; Mail replies and Choir statuses add levers — re-check.

### Three world apps (parallel agent slices, merged)
- **CMS Mail** (`js/mail.js`, `js/mailview.js`): 61 messages by trigger —
  HR, the Instructor, the previous Operator's letters, Seraph #1, Fate,
  NULL.OPERATOR from your own address, forwarded prayers, junk. Canned
  replies (his move standing ±1 under the shared cooldown). Presence-aware,
  never a modal. `assets/mail/<id>.webp` slots. 83 + 12 tests, 39/39.
- **Etherscape** (`js/etherscape.js`): a Netscape-style browser, 26 pages —
  CMS intranet, HR policies that change per reboot, the Celestial Times
  (headlines generated from your real history), live Sector 7G status,
  Cosmopedia (every number read from the constant), fan pages and webring,
  Fate's casino, the Void forum, the previous Operator's homepage, and
  `null://`. `Etherscape.knows/open`. `media.attachClip` + `web__*` clip
  slots. 41 + 14 tests, 42/42.
- **Choir** (`js/choir.js`): 13 personas reacting to real events (ships
  quoting your changelog lines, cascades, outages, patches, Patience wins,
  the Mirror Login, endings), bless, threads, canned statuses. Reads State
  only. `assets/choir/<persona>.webp`. 40 + 20 tests, 50/52 (2 equivalent).
- **Integration:** `tests/crosslinks.mjs` requires every address Mail and
  Choir print to be a real Etherscape page. Both apps' browser tests now
  drive the real browser (they had asserted the pre-merge world).
- **Bugs the Etherscape agent found** (ceaa5ee): ACH-012 Void Tourist was
  unreachable (counter never written); Nemesis blurb said 5% (pays 4%);
  bare reboot confirm said +10%/DP (retired formula).

### Verification
`npm test` green: 17 node suites, golden unchanged, 10 browser suites.
One intermittent seen once in `choir-e2e` inside the full chain ("Expected
values to be strictly equal", no detail captured); not reproduced in
three further runs — watch for it.

### Next
1. User: generate the 29 tape shots? Generate audio (M1, Instructor T1)?
2. Wire the audio drop-in contract (`docs/AUDIO_PLAN.md` §5).
3. PR `session-7/world-and-media` → `main`.
4. Re-check hostile drift with the new standing levers.

### Session 7, part 2 (2026-10-02): more footage, audio, and the Krea wall
- **Audio (merged):** drop-in music and voice through `js/audiofiles.js`,
  with music and voice buses, ducking, and Music/Voices settings. M1
  *Primordial Shift* is generated: a 120s seamless loop at −20 LUFS. The
  Instructor (ElevenLabs voice `cjVigY5qzO86Huf0OWal`, "Eric") reads all 10
  T1 lines, and the tape clock waits for each line. The other cues
  (M2–M11) are wired and inert until their files exist.
  `assets/audio/MANIFEST.md` has the prompts, line text and job ids.
- **Recovered Footage and the Omniscient (merged):** `js/footage.js`.
  - Five [REDACTED] archive reels, found in the Recycle Bin, the previous
    Operator's mail, `void://forum`, `null://` and the archive annotations.
    Redaction bars, timecode and the CLASSIFIED framing are CSS.
  - Four "Welcome from the Omniscient" video addresses by mail (first
    directive, first reboot, Void, any ending).
  - Etherscape `web__` clip prompts are recorded.
  - Everything is inert until its reel exists.
  - 20 + 29 tests, 20/20 mutants.
- **Krea balance hit 0** (402 on every request) partway through.
  - Done: the Instructor character sheet, T1 keyframes, T2 shot 2 (real
    footage), and 2 footage keyframes.
  - Not generated: 28 tape reels, 5 recovered reels, 4 Omniscient
    addresses, 3 web clips.
  - Resume kit: `docs/krea-resume/` and the MANIFEST sections. About 38k
    units for the tapes alone.
- **Patience e2e flake fixed:** the icon wait went from 2.5s to 8s (it
  appears on a 1 Hz refresh).
- **Verification:** `npm test` green, 19 node suites + golden + 10 browser.

## 2026-10-02 — Session 8 (branch `session-8/polish`): no paid generation
- **User rules for paid generation** (memory + `docs/krea-resume/`):
  - ask about the model, its price and expected usage first;
  - make one test result and get the direction approved;
  - then quote the batch and get explicit approval;
  - cap each agent at the approved amount;
  - never default to the most expensive model.
- **`docs/VIDEO_TOOLS_PLAN.md`:** cheaper Krea video options for the pixel
  look (Seedance 2.0 at 480p, Hailuo 2.3 Fast, Wan with a style LoRA,
  Vidu Q3, LTX-2.5 Fast, sprite strips). Uses only known costs; the rest is
  marked unknown. Proposed first test: about 300 units. Nothing generated.
- **Audio hooks (merged):** Fate, NULL.OPERATOR and SYS voices, layered
  foley, and paused tape lines restarting. All inert until their files
  exist. 42 node and 28 browser checks.
- **Polish (merged):**
  - One shared 1 Hz heartbeat (`js/heartbeat.js`) replaces the per-app
    timers; it pauses while the tab is hidden. Idle desktop: about 66 → 11
    wakeups/s and 16.7 → 8.0 ms/s of main-thread work. A hidden tab now does
    no app polling. Numbers are in `docs/PERFORMANCE.md`.
  - Accessibility: Space presses the focused control, Escape closes the top
    layer, contrast tokens for text on vellum, reduced motion covers the JS
    canvases, ARIA added.
  - New `idle-e2e` and `a11y-e2e` suites.
- **Fixes:** Choir no longer drops achievement posts past its per-pass cap;
  the audio timer sleeps while the tab is hidden.
- `npm test` is green.

## 2026-10-02 — Session 9 (branch `feat/dev-console`): the Dev Console
- **Built the Dev Console** (`js/devtools.js`, guide in `docs/DEV_CONSOLE.md`): a
  "CMS FIELD ENGINEER MODE — NOT FOR PRODUCTION" section at the bottom of Divine
  Settings, in 11 groups: unlock everything, a media test bench, progression
  jumps (caps, Divinity, real ships, presets, the ending gate), attended and
  offline time with a presence override, incidents and cascade, the NULL.OPERATOR
  arc, world apps, achievements, save states (slots A/B/C, Z for undo, text
  export/import, Fresh save, a link builder), audio, and overlays (idle meter,
  state inspector, production breakdown).
- **Gating:** shows on `localhost` / `127.0.0.1` / `[::1]` or with `?dev=1`
  (held for the tab). Absent from a release build: `npm run build:release`
  (`vite build --mode release`) leaves `js/devtools.js` out and strips its
  `<script>` tag; the settings app mounts it only behind `typeof DevTools`.
  **`dist/` is committed: rebuild it with `build:release`.** A plain `npm run
  build` includes the console.
- **Taint:** any edit sets `State.dev.tainted` (schema default, no `SAVE_VERSION`
  bump), saved with the run, a DEV mark on the desktop, `devTainted` in
  `render_game_to_text()`. Playing media, cues, snapshots and exports do not taint.
- **Shareable links:** `?dev=1&unlockAll=1&reboot=12&cinematics=always` and 14
  more parameters (`fresh`, `mirror`, `preset`, `standing`, `caps`, `mail`,
  `incident`, `cascade`, `presence`, `attended`, `open`, …). They apply once, in a
  fixed order, then are stripped from the address.
- **Idle cost:** nothing is scheduled while the panel is closed. The meter and the
  inspector ride the shared Heartbeat and let go; `idle-e2e` is unchanged.
- **Where the handoff was off:**
  - "Reboot 13 + an archived ship" cannot occur: Archived opens at 12, the replay
    ships at 14. The `ending` preset reaches 14 with the gate open.
  - "Reboot N" is two counters (`prestigeLevel` and `achievementProgress.
    prestige_count`); every path here moves both by shipping for real.
  - Caps are registry-owned, so ×N is a permanent `dev` modifier record.
  - `State.save()` stamps `lastUpdateTime`, so "away" rewrites the stored save and
    reloads (dropping `testMode`, which hides the report).
  - The game's `exportSave` throws on characters above U+00FF (em dashes are in
    cascade and ending labels); snapshots use UTF-8 base64 instead.
  - Cinematics are 5 scenes + 4 loops, not one V1–V7 list; Mail has 65 messages,
    not 61.
- **Verification:** `tests/devtools.mjs` (38, vm), `tests/devtools-e2e.mjs` (51,
  browser), `tests/release-build.mjs` (6: builds both flavours, checks the release
  output and the tracked `dist/` carry no trace of it). `npm test` green, golden
  still "Economy unchanged".
- **Trap:** editing `vite.config.js` restarts the dev server, and a running
  `npm test` gets `ERR_CONNECTION_REFUSED`. Leave config and `js/` alone while the
  suite runs.
- **Noticed, not fixed:** the settings label "0 of 4 reels seen" is stale (5 scenes);
  `docs/PERFORMANCE.md` "Not covered" predates the audio-timer fix; `state.js` says
  the finale's earliest reboot is 13 (it is 14); a letter typed on a focused
  `<select>` anywhere in the game can fire a desktop shortcut.
