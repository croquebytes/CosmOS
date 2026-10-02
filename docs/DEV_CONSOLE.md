# The Dev Console

A tester's section at the bottom of **Divine Settings**, styled as an in-world
maintenance panel: *CMS FIELD ENGINEER MODE — NOT FOR PRODUCTION*. It exists so
the person iterating (and anyone they send a link to) can see everything
quickly. On a fresh save the apps unlock one at a time and every cinematic
plays once.

Everything lives in `js/devtools.js`. Nothing else knows about it, so a release
build can drop it wholesale.

## When it shows

- On `localhost`, `127.0.0.1` or `[::1]`, **or** with `?dev=1` in the URL
  (which then holds for that browser tab and no other).
- Nowhere else: on any other host a dev build loads the file and does nothing.
- Not in a release build at all (below).

## What an edit costs: the DEV mark

Any action that edits the run sets `State.dev.tainted = true` (with a count and
a first-edit time). It is saved with the run, so it travels in an export and
survives a reload, and a small **DEV** mark is painted bottom-right on the
desktop. `render_game_to_text()` reports `devTainted`. A balance or achievement
report from a tainted save should be discounted: the run was edited, not played.

Playing media, firing a synth cue, taking a snapshot and exporting do **not**
taint a clean run. Restoring a snapshot or importing text does (the restored run
is a dev run); a Fresh save does not (it is a new clean run).

## The panel

| Group | What it does |
|---|---|
| 1 · Unlock everything | Installs all 15 apps (Mail, Media Player, Etherscape, Choir, Patience.exe included), opens the Void, files every Notepad document and tape, marks every footage reel found, delivers the four Omniscient mails, sets Cinematics to **Always**, and marks the briefing seen. Plus First time only / Always / Off. |
| 2 · Media test bench | Every cinematic (V1, V2, V4, V5, V6), loop (V3 ×3, V7), tape and each of its shots, and every Recovered Footage / Omniscient reel, each with **Play**, and an installed / missing read from the existing probe. Plays ignore the Cinematics setting for their length and put it back. |
| 3 · Jump in progression | Fill resources, caps ×10 / ×100 (as a modifier record, so a reboot keeps it), Divinity ±, **Ship N builds** (real ships), presets for reboot 3 (Beta), 8 (Nightly), 12 (Archived) and the **ending gate**, and *Reboot to N*. |
| 4 · Time and presence | +1 h / +8 h of *attended* play (incidents, mail clock, instability), *away* 1 h / 8 h (rewrites the stored save, reloads, shows the offline report), and a presence override: force away / force present / real input. |
| 5 · Incidents and cascade | File a SEV-3 / 2 / 1 or a false alarm on any line, clear the queue, set the cascade tier (nominal, SEV-2 degraded, SEV-1 outage, cascade failure). |
| 6 · NULL.OPERATOR | Trigger the Mirror Login now, answer it, set the standing band (hostile / curious / complicit), play End of Shift with the gate bypassed, open the real gate, reset the endings, reset NULL.OPERATOR. |
| 7 · World apps | Deliver all mail or one message; post a sample to Choir; open any Etherscape page. |
| 8 · Achievements | Unlock all, or reset. |
| 9 · Save states | Three slots **A / B / C** (plus **Z**, the run the last restore, import or fresh save replaced), export / import as text, **Fresh save**, and a link builder. Slots live in this browser under `cosmos_dev_slots`. |
| 10 · Audio | Every synth cue, the music files (and stingers), tape narration that exists, and `audio.debug()` levels. |
| 11 · Overlays | An idle meter (frames, timers, Heartbeat beats and frame time per second), a live state inspector, and the production breakdown for each rate. |

The meter and the inspector ride the shared `Heartbeat` while their group is
running and let go when it stops or the window closes. Nothing is scheduled while
the panel sits closed.

## Shareable links

`?dev=1&unlockAll=1&reboot=12&cinematics=always`

Parameters apply once, in this order, when the page has loaded, and are then
stripped from the address (`dev` and `testMode` stay), so a reload does not
apply them twice. The link builder in group 9 writes one for you.

| Parameter | Effect |
|---|---|
| `fresh=1` | Start a new run first (reloads once, then continues). |
| `mirror=A\|B\|C` | Answer the Mirror Login (OP-A / OP-B / OP-C) before any ships. |
| `unlockAll=1` | Everything in group 1. |
| `preset=beta\|nightly\|archived\|ending` | Reboot 3 / 8 / 12 / the ending gate. |
| `reboot=N` | Ship builds up to reboot N. |
| `divinity=N` | Add N Divinity. |
| `standing=hostile\|curious\|complicit` | Set the band (after any ships, which drift it hostile). |
| `caps=N` | Multiply every cap by N and fill. |
| `fill=1` | Resources to cap. |
| `achievements=all\|none` | Unlock all / reset. |
| `cinematics=first\|always\|off` | The Cinematics setting. |
| `mail=all` | Deliver every message. |
| `incident=1\|2\|3\|false` | File an incident (`false` is a false alarm). |
| `cascade=0..3` | Set the cascade tier. |
| `presence=away\|present` | Override presence. |
| `attended=N` | N hours of attended play. |
| `open=<app id>` | Open an app. |

## Things worth knowing

- **Reaching reboot 3 or more presents the Mirror Login** on the next beat, as it
  does in play, and it covers the panel. Use the *Mirror Login* choice in group 3
  (or `mirror=`) to answer it first.
- **The ending gate is reboot 14, not 13.** Archived opens at 12, shipping into a
  replay is 13, and shipping the replay is 14: the first *archived ship*. The gate
  also needs a day-old save (the preset ages it), the Mirror Login answered, and a
  band. The `ending` preset does all of it and sets the band last, because each
  ship drifts standing hostile.
- **A run cannot be un-shipped.** Presets climb from where you are and refuse to go
  back; use *Fresh save* (the old run goes to slot Z).
- **Caps are modifier records.** A direct write to `resourceCaps` is overwritten at
  the next commit, so caps ×N is a permanent `dev` record that *Remove dev caps*
  drops.
- **Attended time** is stepped at 5 s (Incidents ignores anything longer) with the
  simulated clock ending at the real one, so nothing it stamps lies in the future.
  An hour takes about a second; eight hours a few.
- **Away** cannot be faked in memory: `State.save()` stamps the last-update time
  itself. The console writes the absence into the stored save and reloads, dropping
  `testMode` from the URL (it hides the report).
- **Export is not `game.exportSave`.** That one throws on any character above
  U+00FF, and the console is exactly what puts em dashes into modifier labels.
  Snapshots are `COSMOS-DEV1:` + base64 of UTF-8; pasting plain JSON or the game's
  own export also works.
- **Probes are on demand** (opening the media bench probes; music and narration have
  buttons) and a miss is remembered until reload, as the game remembers it.
- **Beds cannot be started from here.** Music beds follow the game's context (the
  Void, Patience.exe, the Media Player, the Mirror Login, an ending); only stingers
  can be fired.
- A letter typed on a focused `<select>` inside the panel is not a desktop
  shortcut; Space presses the focused control and is never also a Miracle; Escape
  closes the window the keyboard is in.

## Keeping it out of a release

```bash
npm run build:release   # vite build --mode release
```

leaves `js/devtools.js` out of `dist/` and its `<script>` tag out of `index.html`.
`dist/` is **committed**, so rebuild it with `build:release` before committing it;
a plain `npm run build` includes the console (useful with `npm run preview`).
`tests/release-build.mjs` builds both, checks the release output carries no
trace of the console, checks that the tracked `dist/` loads none, and checks that
closing the **dev server** writes nothing into `dist/` (the copy plugin is
`apply: 'build'`; it once ran on dev-server shutdown too, so a config edit or
Ctrl-C copied `js/devtools.js` into the committed `dist/`).

## Tests

| Suite | What it holds |
|---|---|
| `tests/devtools.mjs` (vm, no DOM) | Each action's state effect, the gate, the taint flag, snapshot and text round-trips, URL parameters. |
| `tests/devtools-e2e.mjs` (browser) | The section on localhost, absent on a release-like page, `?dev=1` on a non-local host; unlock-all shows every icon; a seen cinematic replays; ships, time, incidents, NULL.OPERATOR; snapshots through a reload; a link reproduces a state; keyboard rules; no idle cost; every text in the open panel clears WCAG AA. |
| `tests/release-build.mjs` | A release `dist/` contains no `devtools.js`, the tracked `dist/` loads none, and a dev-server shutdown leaves `dist/` alone. |

The simulator and the other vm suites never load `js/devtools.js`, and
`npm run test:golden` still prints "Economy unchanged".
