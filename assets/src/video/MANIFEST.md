# Generated reels: provenance

Generated 2026-10-01 in Krea for `docs/VISUAL_UPGRADE_PLAN.md` §2 and §7.

**Pipeline:**
- **Keyframe:** Nano Banana Pro, 2K, 16:9. The style reference is
  `assets/visual-probes/engine-core__idle__probe.png`. The prompt is the §1 style
  block plus the scene.
- **Motion:** Seedance 2.5 image-to-video at 720p, from the keyframe. Loops pass
  the same image as both `start_image` and `end_image`, so the last frame
  matches the first.
- **Encoding:** `tools/encode_reel.sh` produces silent VP9 `.webm`, silent H.264
  `.mp4` (faststart) and a `.webp` poster. Cinematics are 1280×720 and loops
  960×540.
- **Not committed:** raw renders (`raw__*.mp4`) and 2K PNG keyframes stay local
  (gitignored). The `.webp` keyframes here are the style anchors for future
  generations.

| Stem | Keyframe | Duration | Krea raw render |
|---|---|---|---|
| `cine__cold-boot__720` (V1) | `key__cold-boot.webp` | 8s | https://app-uploads.krea.ai/public/5acaa162-a440-405e-b965-d352de05728a-video.mp4 |
| `cine__ship-the-build__720` (V2) | `key__ship-the-build.webp` | 6s | https://app-uploads.krea.ai/public/32a2d3f4-0198-4c86-900b-90516706932a-video.mp4 |
| `cine__mirror-login__720` (V4) | `key__mirror-login.webp` | 6s | https://app-uploads.krea.ai/public/b85da533-83c5-4b47-aaa3-96db697683f6-video.mp4 |
| `cine__void-breach__720` (V5) | `key__void-breach.webp` | 6s | https://app-uploads.krea.ai/public/fc2bddef-592f-4def-a9de-9b1d48b0f965-video.mp4 |
| `cine__first-seraph__720` (V6) | `key__first-seraph.webp` | 5s | https://app-uploads.krea.ai/public/c0f96ce8-2493-4acf-91b3-e4fa36cf7a92-video.mp4 |
| `loop__cascade-tier1__512` (V3) | `key__cascade-tier1.webp` | 4s loop | https://app-uploads.krea.ai/public/29dae128-68ae-4202-8b95-a615d73def1f-video.mp4 |
| `loop__cascade-tier2__512` (V3) | `key__cascade-tier2.webp`, edited from tier 1 | 4s loop | https://app-uploads.krea.ai/public/d0a8af3a-b05e-4f04-87d1-24c0752484a1-video.mp4 |
| `loop__cascade-tier3__512` (V3) | `key__cascade-tier3.webp`, edited from tier 1 | 4s loop | https://app-uploads.krea.ai/public/73579faa-befe-4f65-82ed-712baa06b7da-video.mp4 |
| `loop__sev1-alarm__512` (V7) | `key__sev1-alarm.webp` | 4s loop | https://app-uploads.krea.ai/public/18423099-3e48-4dd6-8c7b-fbba875ff2cb-video.mp4 |

The motion prompts follow the beat lists in `MediaCatalog` (`js/media.js`, the `krea`
field). Each prompt opens with a pixel-art style declaration and hard negatives, and
ends with a constraints tail: no text, no faces, symmetry, and a locked camera for
loops.

## Training tapes

Generated 2026-10-02 in Krea for `docs/VISUAL_UPGRADE_PLAN.md` §3 and §7 (the shot list).
The pipeline is the one above, with three differences:

- **The Instructor is locked first.** `key__tape__instructor-sheet.webp` is a Nano Banana
  Pro character sheet (2K, 16:9: front, three-quarter, presenting, pointing) made from the
  approved Seraph keyframe and the engine-core probe. It is the reference for every shot
  the Instructor appears in. The face is a smooth iron mask: Seedance refuses human faces.
- **Keyframes are 4:3-safe.** Each is the §1 style block plus *"VHS training-video still,
  4:3-safe composition (keep the action in the centre 75% width)"*, no text. Shots the plan
  marks as reused (T2-S2 from V6, T4-S5 from V2) start from that reel's keyframe instead.
- **Encoding** is `tools/encode_reel.sh <raw> <stem> <poster> 960 720`, the centre 4:3 of
  the 16:9 render. Where a file came out over the 600 KB tape budget, both codecs were
  re-encoded with the same filters at a higher CRF (the VHS look forgives it).

| Stem | Keyframe | Duration | Krea raw render |
|---|---|---|---|
| `tape__t2__shot2__720` | `key__first-seraph.webp` (V6, reused) | 8s (slot 8s) | https://app-uploads.krea.ai/public/3ea1f396-d3f2-4c59-9214-25239abe6a71-video.mp4 |

Keyframes approved but not yet animated (the Krea balance ran out): `key__tape__t1__shot2.webp`
to `key__tape__t1__shot6.webp`. The remaining 28 reels fall back to their slides until
they are made.

## Recovered footage, the Omniscient's addresses and web clips (2026-10-02, in progress)

For `docs/VISUAL_UPGRADE_PLAN.md` §10 and §11. The code (`js/footage.js`) is in and
every slot below is a drop-in, inert until its file exists. **Generation stopped
part-way:** the shared Krea balance reached 0 (`402 INSUFFICIENT_BALANCE`) after three
keyframes, so no reel has been rendered yet. Resume from this table after a top-up.

**Pipeline** (as above, with these differences):
- **Keyframe:** Nano Banana Pro, 2K, 16:9, with `image_urls` set to the engine-core
  probe (`https://app-uploads.krea.ai/17ccbb0d-0540-43de-ac56-786be2582631/1790908179494-engine-core__idle__probe.png`).
- **Motion:** Seedance 2.5 image-to-video, 720p, 10 s for recovered reels and 12 s for
  addresses (the captions are timed to those lengths). Web clips are 4–6 s seamless
  loops, with the keyframe passed as both `start_image` and `end_image`.
- **Encoding:** `tools/encode_reel.sh <master> <stem> 1.5` at 1280×720, ≤ 1.5 MB.
  Recovered reels are clean footage: the redaction bars, timecode, CLASSIFIED frame and
  glitches are CSS. Do not bake any of that in.
- **Prompt shape:** every prompt opens with the declaration *"High-detail hi-bit pixel
  art, crisp edges, limited palette. Dark gothic sacred machinery, cast iron housing,
  aged brass filigree, verdigris copper, parchment vellum, inner violet-white divine
  glow, cathedral spires as circuitry, rim light in warm brass, deep blue-black
  background #04060a. Match the style of the reference image."*, then the scene, then
  *"Avoid: photoreal, 3D render, plastic, neon cyberpunk, pink, rainbow, lens flare
  spam, text, letters, watermark, logo, cartoon mascot, anime, blurry, painterly smear,
  emoji. Constraints: no text, no letters or numbers anywhere, no human faces, no
  people."* The scene and motion lines for each reel are the `krea` field in
  `FootageCatalog` (`js/footage.js`).

| Stem | Keyframe | Length | Status |
|---|---|---|---|
| `rec__incident-0__720` | — | 10s | Keyframe **rejected**: the model baked camera text (REC, timecodes) into the corners. Regenerate and add "plain picture, no on-screen display" to the scene. |
| `rec__last-shift__720` | `key__rec-last-shift.webp` ([2K](https://app-uploads.krea.ai/public/3b8a173c-ace8-4df2-b273-261ab6512a9e-image.png)) | 10s | Keyframe approved. Motion not rendered. |
| `rec__sector-7g__720` | `key__rec-sector-7g.webp` ([2K](https://app-uploads.krea.ai/public/71652d4d-6090-403d-bc19-ff19a5092770-image.png)) | 10s | Keyframe approved. Motion not rendered. |
| `rec__mirror-test__720` | — | 10s | Not started (402). |
| `rec__archive-running__720` | — | 10s | Not started (402). |
| `omni__successor__720` | — | 12s | Not started (402). |
| `omni__reboot__720` | — | 12s | Not started (402). |
| `omni__void__720` | — | 12s | Not started (402). |
| `omni__ending__720` | — | 12s | Not started (402). |
| `web__fate-table__720` | — | 4–6s loop | Not started (402). Slot already wired on `fate://casino`. |
| `web__null-operator__720` | — | 4–6s loop | Not started (402). Slot already wired on `null://` after an ending. |
| `web__seraph-choir__720` | — | 4–6s loop | Not started (402). Slot already wired on `seraph://fanpage`. |

The redaction bars in `FootageCatalog` are positioned against the approved keyframes
(the pinned note and the screen in *last shift*, the core in *Sector 7G*). For a reel
whose keyframe is regenerated, check the bars on the contact strip and move them in
`js/footage.js` if the composition moved.

**Web clip prompts** (the slots are documented in `docs/VISUAL_UPGRADE_PLAN.md` §9):
- `fate-table`: *a green felt card table under a single brass hanging lamp in a dark
  gothic casino of iron; a dealer's gloved hands in vellum cuffs (only the hands) turn
  cards with blank brass-filigree backs beside stacks of brass chips.* Motion: the hands
  turn one card and slide it, the lamp sways slightly; seamless loop, locked camera.
- `null-operator`: *a bulky CRT in an iron housing showing a featureless black
  silhouette of head and shoulders, violet tint, tracking-noise bands.* Motion: the
  silhouette slowly turns away from the lens, noise rolls; seamless loop.
- `seraph-choir`: *a row of six-winged brass Seraph automata of organ pipes singing in
  choir stalls, camcorder framing, slightly low-res.* Motion: gentle handheld wobble,
  halo-gears turn, wings shift; seamless loop.
