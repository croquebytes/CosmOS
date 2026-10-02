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
