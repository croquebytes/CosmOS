# CosmOS — Visual Upgrade Plan (Krea)

**Written:** 2026-09-30 · Extends `VISUAL_ASSET_OPPORTUNITIES.md` and the 2026-07-26
identity pass ("sacred machinery, cast in metal"). This doc is the art direction
plus where each asset plugs into the code.

---

## 1. Art direction (paste-ready)

**One line:** *A cathedral built as a mainframe.* Gothic iron machinery, aged brass,
verdigris and vellum, lit from inside by a violet-white divine core. It reads as a
1990s operating system that a church built.

**Style block.** Append this to every Krea prompt:

```
dark gothic sacred machinery, cast iron housing, aged brass filigree, verdigris copper,
parchment vellum, inner violet-white divine glow, cathedral spires as circuitry,
symmetrical, centered, rim light in warm brass, deep blue-black background #04060a,
high-detail hi-bit pixel art, crisp edges, limited palette, no text
```

**Negative.** Use as the negative prompt where the model supports one:

```
photoreal, 3D render, plastic, neon cyberpunk, pink, rainbow, lens flare spam, text,
letters, watermark, logo, cartoon mascot, anime, blurry, painterly smear, emoji
```

**Palette lock.** These are the shipped `style.css` tokens; give them to Krea as a
palette reference.

| role | hex |
|---|---|
| void / abyss | `#04060a` `#090d15` |
| iron | `#1a2230` `#364356` `#4c5c73` |
| brass | `#3e2f16` `#b4914a` `#dec483` `#f7e6ba` |
| verdigris | `#285d53` `#42907d` `#8ac8b6` |
| ichor (void, prestige) | `#4f2e80` `#9063db` `#cfaaf4` |
| halo / alarm | `#fff7de` / `#d4553a` |

**Rules**

1. **Symmetry means order.** Machines and seals are symmetrical. Corruption (the Void,
   NULL.OPERATOR, cascades) breaks that symmetry and shows up as violet ichor bleeding
   *upward* through the iron.
2. **The light comes from inside.** Every scene's key light is the divine core. Brass
   catches it, and iron absorbs it.
3. **Never bake text into images.** All UI copy, captions and labels stay in HTML,
   because AI-rendered text breaks immersion faster than anything else.
4. **Brightness ceiling.** Backgrounds stay at 6–15% mean luminance (the
   `tools/slice_assets.py` gamma rule) so desktop text stays readable.
5. **Comedy lives in the copy, not the art.** The art plays it straight. The humour of
   the bureaucratic heaven comes from the deadpan text the game puts over it.

**Krea setup (one time)**

- Create a **Style** from the four masters in `assets/visual-probes/` and
  `assets/src/icon-sheet-raw.png`. Use it on every generation, with `engine-core__idle__probe.png`
  as the image reference for any machine.
- Keep one **Moodboard** per system (Engine, Void, Incidents, Training, Solitaire)
  and approve key frames there before animating them.
- For video, always go **image-to-video from an approved keyframe**. Text-to-video
  drifts off-style.
- Upscale finals with Krea Enhance and export masters at 2× runtime size.

---

## 2. Video scenes (cinematics)

Krea video has no alpha channel. Scenes therefore play either **full-frame** inside
a CosmOS window or overlay, or **over `#04060a` with `mix-blend-mode: screen`** so the
black drops out.

| # | Scene | Length | Plays when | Keyframe prompt (+ style block) | Motion prompt |
|---|---|---|---|---|---|
| V1 | **Cold Boot** | 8s | First launch, replacing the boot overlay's text-only POST | a colossal dormant iron reliquary-computer in a dark nave, one brass status lamp | lamp flickers on, then a cascade of brass relays wakes outward and the core ignites violet-white; slow push-in |
| V2 | **Ship the Build** | 6s | `ui.confirmShip()` → reboot | the engine core sealed by a brass wax-seal stamp the size of a door | the stamp slams, light floods the seams, the machine powers down into a single star point, then the frame snaps to black |
| V3 | **Cascade Tier** | 4s loop ×3 | `ui.showCascadeAlert()` for tiers 1–3 | the engine core, one containment ring cracked, ichor leaking | ring segments drift apart and ichor rises; the loop gets more broken at each tier |
| V4 | **Mirror Login** | 6s | `ui.playAdversaryScene()` opener | a CRT monitor in the iron housing showing a dark silhouette identical to the viewer | the silhouette tilts its head a frame early; scanlines tear; symmetry breaks |
| V5 | **Void Breach** | 6s | First `Breach the Veil` purchase | an iron cathedral wall with a vertical tear of violet light | the tear opens like an iris and wraith-light pours in; camera holds |
| V6 | **First Seraph** | 4s | First Seraph commissioned (onboarding payoff) | a six-winged angel built from brass organ pipes and iron plating, folded and dormant | the wings unfold section by section like a machine deploying, and its halo-gear starts turning |
| V7 | **SEV-1 Incident** | 3s loop | An Incident SEV-1 dialog opens unprompted | an alarm lamp in a brass cage, red `#d4553a` | the lamp rotates and throws red light across the iron; a seamless loop |

---

## 3. Training videos — "CMS Operator Orientation"

**Concept.** Diegetic 1990s corporate training tapes for new deities. They play in a
new **Sacred Media Player** app (a CosmOS window with transport controls), unlocked
one tape at a time and filed in Notepad as `Training/`.

- **Look:** the same style block plus *"VHS training-video still, soft bloom, 4:3"*.
  Apply the VHS treatment in CSS (scanlines, chroma offset, tracking wobble), not in
  Krea, so it stays crisp and toggleable.
- **Cast:** the **Instructor**, an iron-and-brass archangel in a vellum cassock with a
  clip-on lanyard, framed like a 1994 HR presenter. Lock a character sheet first
  (front, three-quarter, gesture poses) and use it as the reference in every shot.
- **Build:** each tape is 3–5 image-to-video shots of 5–8s, cut together. Captions come
  from WebVTT, and narration, if any, is TTS added later. The comedy is the deadpan
  caption over a straight-faced shot.

| Tape | Teaches | Shots |
|---|---|---|
| T1 *Welcome to Sector 7G* | Miracles, the Engine | the Instructor gestures at the Engine; a hand presses the brass Miracle key; motes rise |
| T2 *Commissioning Your First Seraph* | Automation | V6 reused; a Seraph working a choir console; a ledger filling itself |
| T3 *Known Issues and You* | Patching, instability | a changelog scroll unrolls; a brass patch-plate is riveted over an ichor crack |
| T4 *Shipping a Build* | Certification, reboot | three doors (Creation, Maintenance, Entropy); the Instructor stamps one; V2 reused |
| T5 *Incident Response Etiquette* | Labour, resources and debt choices | three operators: one at the console, one feeding a furnace, one signing an IOU scroll |
| T6 *[REDACTED]* | Adversary lore (secret) | the Instructor freezes, the tape glitches, and NULL.OPERATOR's silhouette replaces them |

---

## 4. Animations and sprite sets

Static images are made in Krea; short loops are made in Krea video and then sampled
into sprite strips or exported as small WebM.

| Set | Deliverable | Plugs into |
|---|---|---|
| **Engine core loops** | idle, charging, overclocked and void, as 4s seamless loops (WebM, 512²) replacing the static plates | `ui.loadCoreArt()` / `renderCoreView()` |
| **Automaton portraits** | Seraph, Throne, Cherub, Dominion, Wraith, Revenant, Phantom and Nemesis: 256² "hardware cards" × dormant / active / overloaded | `ui.renderAutomatons()` rows |
| **Incident family** | 12–16 incident illustrations (320×180), one per template, plus SEV-3/2/1 frame plates | Task Manager triage and the SEV-1 dialog |
| **Divine Events** | 6–8 animated 80² sprites: blessing, audit, anomaly, cache, visitor, omen | `.divine-event` |
| **Solitaire deck** | 4 house sigils (Seraph, Throne, Cherub, Dominion), 12 court cards (J/Q/K × 4), 1 card back; number cards stay in CSS | Patience.exe card hook classes |
| **Resource emblems** | Praise, Offerings, Souls, Adoration, Divinity, Darkness, Shadows, Echoes at 48² and 24² | counters, breakdown panel, costs |
| **Stamps and seals** | APPROVED, DENIED, ESCALATED, PATCHED, SHIPPED, HERESY, ARCHIVED, WONTFIX; 256×128 transparent | release notes, incidents, ship dialog |
| **Achievement badges** | bronze / silver / gold / platinum frames plus 20 glyphs, at 96² | achievements window |
| **Channel plates** | Stable, Beta, Nightly and Archived build banners | ship dialog channel picker |
| **Desktop: Sector 7G Fault** | the missing fourth background (cracked grid with an ichor seam), 1920×1080 | `ui.applyDesktopPlate()` |

**Example prompts.** Each one is followed by the style block.

- *Seraph card:* `six-winged seraph built from brass organ pipes and riveted iron plates, halo is a turning gear, standing in a niche, trading-card portrait`
- *Throne:* `a living throne of iron wheels within wheels covered in watching brass eyes, slow rotation`
- *Incident "Choir Desync":* `a choir of small brass angel-automata singing out of phase, sheet music tearing, one angel facing the wrong way`
- *Card back:* `ornate tarot card back, central divine core sigil, iron and brass lattice border, perfectly symmetrical`
- *Stamp SHIPPED:* `circular brass wax-seal stamp impression, ink on vellum, star sigil at center, worn edges` (the word is set in HTML)

---

## 5. Integration plan (engineering)

1. **`js/media.js`, the cinematic layer.** `media.play(id, {mode:'overlay'|'window'|'blend'})`
   returns a promise. Players are lazy-created with `preload="none"`, muted and
   `playsinline`. Requirements:
   - Esc or a click skips.
   - Playback pauses on `visibilitychange`.
   - Under `prefers-reduced-motion` it shows the poster frame for 1.5s instead.
   - Plays queue behind open system modals, using the same render-or-retry contract
     as `showCascadeAlert` (`cc11f22`), so a cinematic never swallows a dialog.
2. **Settings → Cinematics:** *Always / First time only (default) / Off*, persisted in
   `State.settings.media`. Which scenes have been seen is persisted, so V1, V5 and V6 play once.
3. **Sacred Media Player app:** a window with play/pause, scrub and a tape list. Tapes
   unlock on gameplay milestones and are filed as Notepad documents.
4. **Formats:** WebM VP9 as the primary, MP4 H.264 as the fallback, and a WebP poster
   for every clip.
   - Budgets: cinematics ≤ 2.5 MB each at 1280×720; loops ≤ 600 KB at 512²; full
     video payload ≤ 40 MB for the Steam build.
   - Add `assets/video/` to the `vite.config.js` copy list. It sits under `assets/`, so
     it is already copied, but keep the masters in `assets/src/video/`, which is excluded.
5. **Naming:** `system__subject__state__size.ext`, for example
   `engine__core__overclocked__512.webm` or `cine__ship-the-build__720.webm`.
6. **Audio:** cinematics stay muted. The synthesized audio layer (`js/audio.js`) cues
   each scene with `game.sfx('ship')` and similar, so sound and settings stay in one
   system.

## 6. Production order

1. **Lock the look.** Build the Krea Style and approve three keyframes against it:
   the Seraph card, the V2 seal and the Instructor sheet.
2. **Highest-value motion.** V2 *Ship the Build*, then V6 *First Seraph*, then the
   engine core loops. These land on the moments players repeat most.
3. **Systems that now exist without art.** Incident family, Solitaire deck, stamps.
4. **Training tapes T1–T5** and the Media Player app.
5. **Cinematics V1, V3, V4, V5 and V7.**
6. **Badges, emblems, channel plates, and the fourth desktop background.**

Approve every asset at its **real in-game size** before batching the rest of its set.
That rule from the 2026-07-26 pass caught the Notepad icon being squeezed to 19 px.

---

## 7. Media drop-in contract (built)

`js/media.js` (cinematics, the tape catalogue) and `js/mediaplayer.js` (the Sacred
Media Player) are in. **Nothing needs registering.** Drop a file into `assets/video/`
under the exact name below and reload: the next time its moment comes round, it plays.
While a file is missing, its scene is skipped and its tape shot shows a fallback slide,
so with the folder empty the game behaves exactly as it did before.

**Rules**

- **Three files per stem:** `<stem>.webm` (VP9, preferred), `<stem>.mp4` (H.264,
  used only where WebM will not play), and `<stem>.webp` (poster). Any one video is
  enough. The poster is what reduced-motion players see (for 1.5s) instead of the reel.
- **Cinematics** are 16:9, 1280×720, ≤ 2.5 MB, any length (the stage closes on the
  reel's own end). They are always muted: the cue in the table is rung through
  `game.sfx`.
- **Tape shots** are shown 4:3, cropped from the centre. Generate them at 960×720, or
  at 1280×720 with the action inside the middle 960 px. A reel shorter than its shot
  holds its last frame, and a longer one is cut at the shot's end. Make each reel at
  least as long as the shot.
- **Never bake text.** Captions, labels (`FIG. 2 — PERFORM MIRACLE`) and title cards
  are HTML over the reel. Title cards (shot 1, and T6 shot 6) never take a file.
- **Availability** is probed with a HEAD request, and a response that is HTML counts
  as missing (Vite answers a missing file with `index.html`). A file that fails to
  decode ends its cinematic quietly and is not marked seen.
- **To re-watch** a cinematic, set Divine Settings → Cinematics to *Always*. V1 plays
  only on a fresh save (no Miracles yet, briefing unseen).

**Cinematics**

| # | Scene | Mode | Cue | Files in `assets/video/` | Plays |
|---|---|---|---|---|---|
| V1 | Cold Boot | blend, inside the boot overlay | `boot` | `cine__cold-boot__720.webm` / `.mp4` / `.webp` | first launch; the boot waits for it or a skip |
| V2 | Ship the Build | overlay | — (`ship` already rings) | `cine__ship-the-build__720.webm` / `.mp4` / `.webp` | after the ship dialog confirms; the release notes wait for it |
| V5 | Void Breach | blend | `adversary` | `cine__void-breach__720.webm` / `.mp4` / `.webp` | buying *Breach the Veil* |
| V6 | First Seraph | window | `directive` | `cine__first-seraph__720.webm` / `.mp4` / `.webp` | the first Seraph of a run |
| V4 | Mirror Login | overlay | — (the scene rings its own glitch) | `cine__mirror-login__720.webm` / `.mp4` / `.webp` | before the NULL.OPERATOR Adversary scene; the scene waits for it, Esc hands straight over |

Modes: *overlay* is full frame on black; *blend* is `mix-blend-mode: screen`, so the
reel's black drops out (Krea has no alpha); *window* frames it in CosmOS chrome. A
cinematic queues while any system dialog is open and plays when the slot clears; while
it plays it holds the slot, so a cascade alert or outage waits for it in turn. Esc or a
click skips.

**Dialog loops (V3, V7)**

These are not cinematics. They are short, seamless loops that play inside a system dialog,
in a dark monitor strip at its head, while the dialog is open. They never hold the
modal slot and never delay the dialog. If no file is installed, the dialog looks exactly as
it always has. They follow Cinematics: *Off* and reduced motion (no loop either way;
there is no poster stand-in, because the dialog is complete without one).

- **Size and length:** 16:9, made at 1280×720 (the stem says 512 because the strip is
  short). The strip shows the middle band, about 112 px tall, so keep the action
  horizontally centred.
- **Loop:** seamless. The first frame matches the last frame, 3–4 s.

| # | Loop | Files in `assets/video/` | Plays in |
|---|---|---|---|
| V3 | Cascade — Degraded | `loop__cascade-tier1__512.webm` / `.mp4` | the cascade alert, tier 1 |
| V3 | Cascade — Failing | `loop__cascade-tier2__512.webm` / `.mp4` | the cascade alert, tier 2 |
| V3 | Cascade — Collapse | `loop__cascade-tier3__512.webm` / `.mp4` | the cascade alert, tier 3 |
| V7 | SEV-1 Alarm | `loop__sev1-alarm__512.webm` / `.mp4` | the unprompted SEV-1 outage dialog |

The Krea prompt for each loop is in `MediaCatalog.loops` in `js/media.js` (the `krea` field):
a keyframe plus a motion line, as for the cinematics.

**Training tapes: shot list for Krea**

Every shot uses the style block from §1 plus *"VHS training-video still, soft bloom,
4:3"*, image-to-video from an approved keyframe, with the Instructor character sheet
as the reference wherever the Instructor appears. The fallback column is the slide that
plays until the reel exists.

**T1 — Welcome to Sector 7G** (0:44; filed after the tenth Miracle)

| Shot | Length | File stem | Generate in Krea | Fallback slide until then |
|---|---|---|---|---|
| 1 | 4.5s | — | title card (HTML) | — |
| 2 | 8s | `tape__t1__shot2__720` | The Instructor gestures at the Universal Engine. | desktop_primordial + core_idle + motes |
| 3 | 8s | `tape__t1__shot3__720` | A hand presses the brass Miracle key; the core answers. | desktop_primordial + core_charging + flare |
| 4 | 8s | `tape__t1__shot4__720` | Motes rise from the core as the charge meter fills. | desktop_primordial + core_overclocked + motes |
| 5 | 8s | `tape__t1__shot5__720` | A vault seal, half of it dark: the Sector 7G partition. | desktop_primordial + sigil + halo |
| 6 | 7.5s | `tape__t1__shot6__720` | The Instructor, framed like a 1994 HR presenter, points off-screen to the next tape. | desktop_restored + halo + motes |

**T2 — Commissioning Your First Seraph** (0:44; filed with the first Seraph)

| Shot | Length | File stem | Generate in Krea | Fallback slide until then |
|---|---|---|---|---|
| 1 | 4s | — | title card (HTML) | — |
| 2 | 8s | `tape__t2__shot2__720` | A six-winged Seraph of brass organ pipes unfolds (V6, re-cut to 4:3). | desktop_primordial + halo + flare |
| 3 | 8s | `tape__t2__shot3__720` | A Seraph working a choir console. | desktop_primordial + core_charging + motes |
| 4 | 8.5s | `tape__t2__shot4__720` | A ledger filling itself, column by column. | desktop_restored + notepad icon + sigil |
| 5 | 8.5s | `tape__t2__shot5__720` | The console at night, unattended, still lit. | desktop_restored + core_idle + halo |
| 6 | 7s | `tape__t2__shot6__720` | The Instructor closes the ledger. | desktop_primordial + engine icon + motes |

**T3 — Known Issues and You** (0:46; filed when Offerings come online, or with the first patch)

| Shot | Length | File stem | Generate in Krea | Fallback slide until then |
|---|---|---|---|---|
| 1 | 4s | — | title card (HTML) | — |
| 2 | 8.5s | `tape__t3__shot2__720` | A changelog scroll unrolls across the iron. | desktop_primordial + notepad icon + sigil |
| 3 | 8s | `tape__t3__shot3__720` | An ichor crack in the core housing. | desktop_void + core_void + motes |
| 4 | 9s | `tape__t3__shot4__720` | Three warning lamps in a row: amber, red, dark. | desktop_void + core_void + halo |
| 5 | 8.5s | `tape__t3__shot5__720` | A brass patch-plate is riveted over the crack. | desktop_primordial + core_idle + flare |
| 6 | 8.5s | `tape__t3__shot6__720` | The superseded module, filed in the Recycle Bin. | desktop_restored + recyclebin icon + motes |

**T4 — Shipping a Build** (0:46; filed when a run first earns a release)

| Shot | Length | File stem | Generate in Krea | Fallback slide until then |
|---|---|---|---|---|
| 1 | 4s | — | title card (HTML) | — |
| 2 | 8.5s | `tape__t4__shot2__720` | The ship dialog; a brass wax seal raised over it. | desktop_restored + prestige icon + halo |
| 3 | 8.5s | `tape__t4__shot3__720` | Three doors in the nave: Creation, Maintenance, Entropy. | desktop_primordial + mandates icon + sigil |
| 4 | 9s | `tape__t4__shot4__720` | The Instructor stamps one door. | desktop_restored + sigil + flare |
| 5 | 8.5s | `tape__t4__shot5__720` | The engine sealed, collapsing to a single star (V2, re-cut to 4:3). | desktop_void + core_charging + flare |
| 6 | 7.5s | `tape__t4__shot6__720` | Release notes for the next reality, still warm from the press. | desktop_restored + notepad icon + motes |

**T5 — Incident Response Etiquette** (0:49; filed with the first incident ticket)

| Shot | Length | File stem | Generate in Krea | Fallback slide until then |
|---|---|---|---|---|
| 1 | 4s | — | title card (HTML) | — |
| 2 | 9s | `tape__t5__shot2__720` | An alarm lamp in a brass cage turns red (V7's lamp). | desktop_primordial + taskmgr icon + flare |
| 3 | 8.5s | `tape__t5__shot3__720` | The first operator, hands on the console. | desktop_primordial + core_charging + motes |
| 4 | 9s | `tape__t5__shot4__720` | The second operator feeds a furnace; the third signs an IOU scroll. | desktop_primordial + core_overclocked + flare |
| 5 | 9s | `tape__t5__shot5__720` | The Instructor sets the pager face down; the console dims. | desktop_restored + core_idle + halo |
| 6 | 10s | `tape__t5__shot6__720` | Task Manager, the triage console, with a Prophet dispatched. | desktop_primordial + recyclebin icon + sigil |

**T6 — [REDACTED]** (0:37; secret, filed at first contact with NULL.OPERATOR)

| Shot | Length | File stem | Generate in Krea | Fallback slide until then |
|---|---|---|---|---|
| 1 | 4s | — | title card (HTML): *Reporting a Duplicate Session*, "Tape 6 of 5" | — |
| 2 | 6s | `tape__t6__shot2__720` | The Instructor begins a routine safety briefing. | desktop_primordial + core_idle + motes |
| 3 | 5s | `tape__t6__shot3__720` | The Instructor freezes mid-gesture; the tape tears. | desktop_void + core_void + sigil |
| 4 | 8.5s | `tape__t6__shot4__720` | A silhouette identical to the viewer stands where the Instructor was (V4's silhouette). | desktop_void + core_void + motes |
| 5 | 8.5s | `tape__t6__shot5__720` | The silhouette leans toward the lens; the symmetry breaks. | desktop_void + sigil + flare |
| 6 | 5s | — | title card (HTML): *Programme ends.* | — |

T6 shots 3–6 carry a glitch treatment in CSS whether or not VHS is on, so their reels
should be generated clean: the tear is applied on top.

**Total if every slot is filled:** 4 cinematics and 29 tape shots, 33 reels. At the
§5 budgets (2.5 MB for each cinematic, about 1 MB for each 8s tape shot at 960×720)
that comes to about 40 MB, which is the Steam ceiling. Encode the tapes at a lower
bitrate than the cinematics; they are meant to look like tape.

## 8. Choir avatars (drop-in slot)

`js/choir.js` (the Choir status board) shows a 40 px square avatar beside every post,
and a 28 px one in a thread. With no file installed, each account gets a bevelled
monogram plate in its own colourway, drawn in CSS, so the board is complete without art.

- **File:** `assets/choir/<persona>.webp`, square, made at 80×80 or larger, with no
  text baked in. The monogram is the fallback, not part of the art.
- **Probe:** one HEAD request per persona the first time the board draws it. Only an
  `image/*` content type counts, because Vite answers a missing file with
  `index.html` and a 200.
- **Personas:** `times` (The Celestial Times), `sector7g` (Sector 7G Status), `vesper`
  (a Seraph), `throne` (THRONE-0417), `agnes` and `dale` (mortals), `hr` (CMS Human
  Resources), `instructor` (the Instructor), `pip` (a cherub), `fate`, `nulloperator`
  (NULL.OPERATOR, presenting as you), `halvard` (a Dominion), `fanclub` (the Seraph
  Appreciation Society), `operator` (the player).
- **Look:** the §1 style block, framed as a cropped headshot or an emblem, the kind of
  picture a board user uploaded in 2003. NULL.OPERATOR's avatar should be the
  `operator` one with the symmetry slightly off.
