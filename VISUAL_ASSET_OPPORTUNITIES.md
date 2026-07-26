# CosmOS Visual Asset Opportunities

This list prioritizes assets by how much they improve the idle loop, reinforce the “celestial bureaucracy running on a cursed 1990s operating system” premise, and produce strong Steam screenshots. The current CSS/canvas treatment can remain as fallback art while authored assets are introduced.

## Visual north star

- **World:** sacred machinery, dead corporate intranet, cosmic infrastructure, divine incident response.
- **UI:** late-1990s desktop readability with more deliberate iconography and richer app-specific interiors.
- **Motion:** important actions should visibly travel from input → machine response → resource gain.
- **Avoid:** generic fantasy clip art, unrelated emoji styles, photoreal space wallpaper, and effects that make resource numbers hard to read.

## P0 — Highest-impact assets

| Opportunity | Player-facing value | Suggested deliverable | Integration target |
| --- | --- | --- | --- |
| Universal Engine “Praise accepted” sequence | Makes the primary click feel like operating a machine rather than pressing a web button | 3 layered effects: 10–14 frame sacred-sigil ignition, expanding halo/ring, 6–10 mote variants; transparent WebP/PNG sprite strips or small Lottie/Rive study | `#core-canvas`, `.visual-core`, `game.manualPraise()` |
| Universal Engine core states | Gives progression a visible home | Idle, charging, overclocked, storage-full, and void-corrupted variants; 512×512 master, exported at 256×256 | `ui.animateCore()` or a future sprite/particle renderer |
| Complete desktop icon family | Removes the mixed CSS/emoji look and makes unlocks feel collectible | 48×48 and 32×32 pixel-art PNGs, nearest-neighbor safe; normal, selected, and disabled states for every app | `.icon-img`, Genesis menu, taskbar |
| Desktop background set | Creates Steam-ready first impressions and reflects progression | 4 seamless 1920×1080 backgrounds: Primordial Grid, Sector 7G Fault, Void Breach, Restored Cosmos; optional 2–3 layer parallax exports | `#desktop`, dimension/prestige state |
| Divine Event family | Makes timed events readable at a glance | 6–8 distinct 80×80 animated event sprites with matching glow masks: blessing, audit, anomaly, cache, visitor, omen | `.divine-event` |
| Prestige/reboot transition | Makes the largest reset feel consequential | 1.5–2.5 second full-screen sequence: desktop collapse → divine seal → clean reboot; 1080p master plus separate transparent overlays | Prestige action and boot overlay |

## P1 — Strong screenshot and progression upgrades

| Opportunity | Player-facing value | Suggested deliverable |
| --- | --- | --- |
| App-specific window backplates | Stops every app from feeling like the same grey panel | Subtle 9-slice frames and 2–3 low-contrast interior textures for Engine, Mandates, Notepad, Dimensions, Settings |
| Dimension environments | Makes each dimension feel like a destination | 1600×900 background plates plus foreground haze/particles for Primordial and Void; future dimensions follow the same layer template |
| Seraph/Cherub machine portraits | Makes automation purchases tangible | 256×256 illustrated “hardware card” plus 3 small state frames: dormant, active, overloaded |
| Directive stamps and seals | Strengthens the bureaucratic narrative | 12 transparent stamps: APPROVED, DENIED, ESCALATED, INCIDENT, HERESY, ARCHIVED, etc.; 256×128 masters |
| Resource emblems | Improves scanability in dense panels | 24×24 and 48×48 icons for Praise, Offerings, Souls, Adoration, Divinity, Overclock charge |
| Achievement badges | Turns milestones into a visible collection | Cohesive bronze/silver/gold/platinum frames with 20–30 central glyphs; 96×96 masters, 48×48 exports |
| Offline report vignette | Makes returning to the game feel authored | Small 320×180 “unattended universe” illustration with variants for no production, productive shift, and capped storage |
| Boot/BIOS identity art | Makes startup memorable in trailers and demos | CosmOS wordmark, CMS seal, boot glyph strip, and one clean 1920×1080 key visual |

## P2 — Content-rich polish

| Opportunity | Player-facing value | Suggested deliverable |
| --- | --- | --- |
| Notepad document thumbnails | Makes lore finds feel like artifacts | 8 templates: memo, incident report, legal filing, training manual, ad, casino slip, system log, inbox message |
| Task Manager process glyphs | Adds humor and readability | 20 tiny 16×16 process icons for reality services, angel daemons, prayer queues, entropy leaks |
| Recycle Bin contents | Turns a utility gag into visual storytelling | 12 discarded-item thumbnails and 3 bin fullness states |
| Divine Globe map layers | Gives late-game systems a visual anchor | Stylized celestial map, sector nodes, corruption overlays, connection arcs |
| Adoration Shop inventory art | Makes cosmetics feel valuable | 128×128 product tiles with owned/equipped badges and one preview background per category |
| Casino/minigame kit | Supports future active side loops | Cards, chips, reels, table felt, win/lose flourishes, all using the same CMS/divine visual language |
| Cursor and interaction set | Makes the whole desktop feel shipped | Pointer, busy, forbidden, drag, divine-target, and resize cursors at 32×32 with 2× exports |
| Sound-reactive visual accents | Makes audio and effects feel connected | Small spectrum strips, speaker pulses, notification LEDs, and status-light sprite cycles |

## Recommended asset production order

1. Lock the 48×48 desktop icon style with Universal Engine, Notepad, Mandates, and Settings.
2. Produce the Engine’s idle and Praise-accepted states; validate them at the actual 200×200 in-game size.
3. Create one final desktop background and one Void variant, then test text/icon contrast at 1280×720 and 1920×1080.
4. Build reusable resource emblems, stamps, and badge frames.
5. Expand into dimension plates, automation portraits, and event families only after those reusable visual rules are approved.

## Technical guidelines

- Keep critical UI assets local and packageable offline.
- Prefer WebP for painted backgrounds, PNG for pixel-art/icons requiring crisp alpha, and sprite strips for short deterministic loops.
- Keep source masters at 2× or 4× target resolution; export exact runtime sizes to avoid browser resampling blur.
- Use integer-pixel placement and `image-rendering: pixelated` only for the deliberate pixel-art icon family.
- Budget continuous animation conservatively: one primary animated focal point per open window, with reduced-motion and performance-mode fallbacks.
- Name files by system and state, for example `engine_core__overclocked__256.webp` or `icon_notepad__selected__48.png`.

## Steam capsule/key-art opportunities

These are separate from in-game assets but should share the same art direction:

- A hero composition of the Universal Engine window floating over a corrupted cosmic desktop.
- The Operator silhouette reflected in a CRT with “REALITY FAILED ITS OVERNIGHT INTEGRITY CHECK.”
- Capsule-safe CosmOS logo lockups for 460×215, 616×353, 374×448, and 600×900 formats.
- Three polished screenshot scenes: first-shift desktop, overloaded Universal Engine, and Void Dimension breach.
