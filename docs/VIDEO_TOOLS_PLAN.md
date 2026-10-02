# CosmOS: video tools proposal (cheaper than cinema)

**Written:** 2026-10-02. **Status: a proposal only.** Nothing is generated from this
document without the user's approval, step by step:

1. Choose the model.
2. Quote the cost of one test.
3. Run that one test.
4. Approve the direction.
5. Quote the batch.
6. Approve the batch.
7. Run the batch, capped at the approved amount.

The rule is recorded in `docs/krea-resume/tapes-shotplan.md` and in the assistant's
memory.

## What we know about cost

Krea does not publish per-model compute-unit prices, and the API schema has no cost
field. These are the only hard numbers:

| Source | Model / setting | Units per job | How we know |
|---|---|---|---|
| Measured | Seedance **2.5**, 720p, 8s | ~1,370 | reported by the tape agent from the 402 error |
| Derived | Seedance **2.0**, 480p, 4s | ~250 | Basic plan: 5,000 units ≈ 20 videos |
| Derived | Nano Banana **2**, 1K image | ~45 | Basic plan: 5,000 units ≈ 112 images |
| Derived | Krea 2 **Turbo** image | ~2 | Basic plan: 5,000 units ≈ 2,500 images |
| Unknown | Nano Banana **Pro**, 2K (the keyframes so far) | ? | |
| Unknown | Hailuo 2.3 Fast, Seedance 2.0 Mini, Wan 2.x, LTX-2.5 Fast, Vidu Q3, Veo 3.1 Lite | ? | |

Krea's web pricing page and the in-app plans card disagree on the Max plan (60k units
for $105 vs 40k for $70). The account's own card is the one that applies.

**Before any test,** I read that model's unit cost in Krea's UI and quote it to you. If
I can't see a price, I say so and we decide whether a single test is worth running
just to learn it.

## Why cinema models are the wrong default here

The game's art is **hi-bit pixel art behind CSS framing**. Most reels are shown small
(112px dialog strips), behind VHS or CRT filters, or as loops. Seedance 2.5's strengths
(1080p, 30s, multi-shot camera work, native audio) go unused: the game mutes reels and
the synth layer plays the sound. A cheaper or older model at 480p is enough for most of
these slots, and for VHS tapes and "recovered footage" low resolution *is the look*.

## Candidates, by job

| Tool (Krea) | Good for in CosmOS | Why | Watch out for |
|---|---|---|---|
| **Seedance 2.0 Mini / 2.0 Fast, at 480p** (`draft: true` on 2.5 also renders 480p at the 480p rate) | Training-tape shots, Recovered Footage, Omniscient addresses | Same family that already nailed the pixel look; the VHS/redaction CSS hides 480p | Check that pixel edges survive the downscale |
| **Hailuo 2.3 Fast** ("cheapest medium-quality") | Simple seamless loops: alarm lamp, cascade tiers, gear halos | Loops need little motion and one subject | Weaker prompt adherence; test the loop seam |
| **Wan 2.2 / 2.1** (fast, low quality; **2.1 supports LoRA**) | Ambient loops; with a CosmOS-style LoRA, cheap on-style motion at volume | A LoRA trained on our approved keyframes would lock the style for every future clip | Training a LoRA has its own cost; quality floor is low |
| **Vidu Q3** ("excels at anime") | 2D-character motion: the Instructor, NULL.OPERATOR's silhouette | Stylised and 2D-leaning rather than photoreal | Unknown on pixel art; one test settles it |
| **LTX-2.5 Fast** (speed-optimised, up to 20s) | Longer, low-motion beds: Etherscape web clips, idle backgrounds | Long clips per job | Unknown style fidelity |
| **No video model: sprite strips** from Krea 2 Turbo / Nano Banana 2 frames (~2–45 units each) | Small, truly pixel animations: Divine Event sprites, icon states, Patience card flips, toasts | 4–12 stills, stepped by CSS, are cheaper and *more* on-style than any video model | Hand-assembly; consistency between frames |
| **No generation: CSS camera on a still** (already the tape fallback) | Anything that only needs a slow push or pan | Zero cost | Not real motion |

## Proposed mapping, if and when you approve

| Remaining asset | Count | Proposed tool | Est. units each | Est. batch |
|---|---|---|---|---|
| Training-tape shots | 28 | Seedance 2.0 at 480p | ~250–500 (480p, 4–8s) | ~7,000–14,000 (vs ~38,000 on 2.5) |
| Recovered Footage ([REDACTED]) | 5 | Seedance 2.0 at 480p | ~250–500 | ~1,250–2,500 |
| Omniscient addresses | 4 | Seedance 2.0 at 480p, or Vidu Q3 if its test wins | ~250–500, or ? | ~1,000–2,000 |
| Etherscape web clips | 3 | Hailuo 2.3 Fast or LTX-2.5 Fast | ? | to quote after a test |
| Keyframes for all of the above | ~35 | **Nano Banana 2**, not Pro | ~45 | ~1,600 |
| Divine Event sprites (future) | 6–8 × 6 frames | Krea 2 Turbo stills → CSS sprite strips | ~2 | ~100 |

**Cheapest sensible first step: about 300 units.** One Seedance 2.0 480p tape shot from
an existing T1 keyframe, placed in the Media Player next to the 2.5 version (T2 shot 2),
so you can judge whether the cheaper look holds. Then, separately, one Hailuo 2.3 Fast
loop test, quoted once its price is visible.

## Engineering already in place

- **Drop-in slots:** every slot above already exists in the code and stays inert until
  its file arrives (`docs/VISUAL_UPGRADE_PLAN.md` §7–11).
- **Encoding:** `tools/encode_reel.sh` encodes any source to the slot's size, so a 480p
  master upscales to the contract size.
- **Decode test:** `tests/media-e2e.mjs` checks that installed reels decode at their
  size, whatever model made them.

## Test result: Seedance 2.0 Mini, 480p, 4 s on T2 shot 2 (2026-10-02)

The one approved job. **Verdict (my read; yours decides): not suitable for tape
shots in this style.**

| | |
|---|---|
| Job | `5b11edba-3287-4c0d-82e2-4adca275b4f2`, `bytedance/seedance-2-mini`, completed in about 3.5 min |
| Input | `start_image` = the SERAPH (V6) keyframe, 16:9, `duration` 4, `resolution` 480p, `seed` 20261002; no enhance, no upscale; the prompt frame from `docs/krea-resume/tapes-shotplan.md` for T2 shot 2, compressed to 4 s |
| Result | 864x496, 24 fps, 4.04 s, 4.2 MB raw master (with an audio track the game would drop) |
| Cost | **Not visible.** No Krea video schema exposes a price and there is no balance tool, so the units spent were not read. The estimate quoted before the job was up to ~250 units. |
| Compared with | the shipped T2 shot 2 (Seedance 2.5, 720p, 8 s, about 1,370 units) |

What the comparison showed (contact sheet at 0 / 1 / 2 / 3 / 3.9 s, and native-resolution crops of
the same wing region):

- **It did not keep `@Image1`'s design.** The shipped reel keeps the keyframe's brass
  organ-pipe feathers with verdigris trim. The Mini render turned them into naturalistic,
  softly shaded feathers: a different object, and a smoother, more painterly look than the
  hi-bit pixel art. This was the exact thing the prompt ("keep its design, framing and
  pixel rendering exactly") asked it to hold.
- **Pace.** The whole unfold finished inside about 2 s and then held; the shipped reel is
  nearly still for its first 4 s.
- **Framing.** Fully spread, the wings run past the frame edges, so the game's 4:3 crop
  would cut them.
- The pose also changed (arms outstretched) though the prompt did not ask for it.

So the cheaper tier saved money on a result that would have to be thrown away. It does not
settle the other models, and **no direction is approved**. Candidates for a next test, each
a new job that needs its own quote and your OK:

1. **Seedance 2.5 with `draft: true`** (a 480p draft "billed at the 480p rate"), at
   `aspect_ratio: "4:3"` so it is generated in the game's own crop. The family that kept
   the design, at the cheaper rate. The 480p rate for 2.5 is not visible either.
2. **Seedance 2.0 Fast, 480p, 4 s**, the same job, to see whether Mini specifically was the problem.
3. **Spend nothing on the tape shots**: keep the fallback slides (the CSS camera on a still)
   and reserve video for the five recovered reels and four Omniscient addresses.

Local artifacts (gitignored): `output/test__t2s2__seedance2mini-480p.mp4` and a side-by-side
page, `output/video-compare-t2s2.html` (served by the dev server).
