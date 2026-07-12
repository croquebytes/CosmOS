# CosmOS Design Direction — Visual Identity & Process

**Date started**: 2026-07-12
**Status**: Living document. Visual Identity Pass v1 implemented (wallpaper, icon set, window chrome, tokens).
**Companion docs**: PRODUCT_STRATEGY.md (why), ACTION_PLAN.md §3 (polish backlog)

---

## 1. Do we need UI/UX mockups? (the process decision)

**Short answer: no Figma/screen-by-screen mockups. Prototype in-engine. Reserve "mockup work" for the three things CSS can't answer.**

Reasoning:

1. **The UI language is already decided.** CosmOS uses the Windows 98 design system — beveled chrome, title bars, desktop icons, taskbar. That system was designed 30 years ago; our job is *faithful reproduction plus divine corruption*, not layout invention. Mockups earn their keep when you're exploring unknown layouts; here they'd reproduce decisions already made.
2. **The game's medium IS the mockup medium.** This game is DOM + CSS. An hour in Figma produces a picture of a window; an hour in style.css produces the actual window, drop-shadow and all, that ships. Iteration speed is identical, but only one output is real.
3. **Idle-game UX is only testable live.** The questions that matter (does the notification queue overwhelm? is the second window discoverable? does the desktop read at a glance mid-run?) only answer themselves with real state changing in real time.

**Where design-tool / concept work IS worth doing** (in priority order):

| Artifact | Why it's the exception | When |
|---|---|---|
| **Steam capsule + key art** | Marketing art, not UI — painted/illustrated, sells the fantasy in 460×215px. Commission this; it is the single highest-ROI art spend (~$200–600). | Before the Steam page goes up |
| **Casino Host portrait/avatar** | A character, not a widget. Needs concepting (2–3 sketches) before committing. Could be commissioned with the capsule. | Phase 9 (casino integration) |
| **One "target screenshot" per dimension theme** | A single composed reference image (Void desktop, Chronos desktop) to art-direct future theming. Can be made by restyling the live game and screenshotting it — no external tool needed. | Before building each new dimension theme |

Everything else: change the CSS, look at it, keep or revert. This document is the constraint system that keeps those changes coherent.

---

## 2. Design pillars

1. **Authentic chrome, divine content.** The OS shell obeys Win98 conventions rigorously (bevels, 11px Tahoma, gray widgets). The *content* inside windows and beyond the desktop is where divinity leaks in (gold, violet, glow, starfield). The comedy of the game lives in this contrast — protect it.
2. **The desktop is a place.** Wallpaper, stars, and lighting should make the desktop feel like a window into the cosmos the player is repairing — not a flat backdrop.
3. **Corruption is earned.** Glitch/CRT/void effects intensify with narrative progression, not randomly. Early game = clean nostalgia; late game = something is wrong with the OS.
4. **Performance is sacred.** Every ambient effect must have a `body.performance-mode` off-switch. Idle games run for days.

---

## 3. Design tokens (implemented in `style.css :root`)

| Token | Value | Use |
|---|---|---|
| `--win-bg` | `#c0c0c0` | Widget/chrome surfaces |
| `--win-border-light/dark/black` | `#fff` / `#808080` / `#000` | Bevel edges |
| `--celestial-gold` (+`-light`, `-dark`) | `#ffd700` / `#ffe873` / `#b8860b` | Divine accents, Praise, primary CTA |
| `--divine-violet` (+`-deep`) | `#8a2be2` / `#4b0082` | Mandates, dimensions, mystery |
| `--divine-blue` | `#4a90e2` | Info, water/globe |
| `--void-black` / `--space-deep/mid/core` | `#0a0817` / `#0a0817` / `#120e2b` / `#1b1440` | Sky, screens, Void |
| `--title-active-a/b/c` | `#0d0b3d → #4531b8 → #6a5acd` | Focused title bar gradient |
| `--title-inactive-a/b` | `#5a5a66 → #8b8b98` | Unfocused title bar gradient |
| `--bevel-raised` | 4-layer inset shadow | The Win98 double bevel; reuse for any raised chrome |

Rules: new UI must use tokens, not hex literals. Warning red `#ff4040`-family and success green `#39d353` may be promoted to tokens when the notification overhaul lands.

## 4. Iconography rules (`assets/icons/*.svg`)

- **Format**: 16×16 pixel grid, `<rect>`-composed SVG, `shape-rendering="crispEdges"`, rendered at 48px with `image-rendering: pixelated`. Free-form silhouettes — never rounded-square "app tiles", never emoji (emoji render differently per OS and break the period aesthetic).
- **Palette per icon**: ink outline `#14121f` + max ~4 hues drawn from the token palette. Steel for hardware/chrome (`#e8e8f0/#c0c0c8/#7a7a88`), gold for divine, violet for arcane.
- **Light from top-left**: 1px highlight on top/left of major shapes, 1px shade on bottom/right.
- **Silhouette test**: recognizable at 16px in grayscale.
- Current set: console (CRT + golden core), mandates (scroll + skill tree), dimensions (portal ring), notepad, taskmgr (window + green chart), recyclebin, globe (haloed planet), calls (gold desk phone), shop (violet bag + gold star), settings (gear), genesis (gold star — also the favicon and Start button logo).
- Reuse: window title bars, taskbar buttons, and the Documents app can pull the same files at 16px when we add per-window icons.

## 5. Window & desktop chrome (implemented)

- Windows: no CSS border — `--bevel-raised` inset shadows + 3px padding + soft exterior drop shadow (`4px 6px 16px rgba(0,0,0,.55)`) so windows float over the cosmos. Snapped windows drop only the exterior shadow.
- **Active/inactive title bars**: `system.focusWindow()` moves a `.window-active` class; focused = cosmic navy→violet gradient, unfocused = gray. (Closing a window refocuses the topmost remaining one.)
- Desktop: pure-CSS layered wallpaper (nebula radial gradients over `--space-*`) + a repeating starfield on `#desktop::before` with an 8s twinkle. **No external/hotlinked images — ever.** (v1 removed a hotlinked wallhaven.cc JPEG: broken offline + unlicensable.)
- Taskbar: raised bevel, genesis-star Start button, upward shadow separating it from the sky.

## 6. Effects budget

Ambient (always-on) effects are capped at: starfield twinkle, core-canvas glow, CRT scanlines. Everything else must be event-driven (clicks, achievements, prestige) and time-boxed. All ambient effects respect `body.performance-mode` (starfield animation and core glow already do).

## 7. Asset provenance rules (product requirement)

1. Every shipped asset lives in the repo (`assets/`) — no hotlinks, no CDN art, no Google Fonts dependency at ship time (self-host or system-stack before Steam build; the Crimson Pro `<link>` is the one remaining external fetch).
2. Every non-original asset gets a line in `assets/CREDITS.md` (license, source, date) the day it's added — sounds included.
3. Commissioned art requires written commercial-use rights (capsule art, Host portrait).

## 8. What still needs art (backlog, in order)

1. Sound set (boot chime parody, click, error, achievement, casino) — biggest missing sense; off by default.
2. Per-window title-bar icons (reuse desktop set at 16px).
3. Notification overhaul visuals (ACTION_PLAN §3.A/B — queueing, priority styling).
4. Divine Core canvas upgrade (richer particles; per-dimension palettes).
5. Casino Host portrait (concept → commission).
6. Void dimension theme pass (dark chrome variant driven by the same tokens — target screenshot first, per §1).
7. Steam capsule/key art (commission; brief = "Win98 window chrome, cosmic dread, gold on void").

---

*Process reminder: change it in CSS, screenshot it, judge it in the game. If a change can't be expressed in tokens + these rules, update this document first.*
