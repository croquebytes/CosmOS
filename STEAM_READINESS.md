# CosmOS Steam Readiness

## Product verdict

CosmOS already has a distinctive fantasy, a large body of strong writing, and enough interconnected systems for a substantial idle game. Its main risk is not lack of features. It is that the player-facing progression, production architecture, and release shell have not yet caught up with the amount of content.

The next milestone should be a polished vertical slice from first boot through the first Divine Reboot. Do not add another major economy until that path is understandable, balanced, recoverable, and satisfying.

## Player pillars

1. **Operate a divine bureaucracy.** Every click, upgrade, and reset should feel like maintaining an impossible legacy system.
2. **Turn intervention into automation.** Each active action teaches a system that the player then delegates.
3. **Discover why reality failed.** Lore should unlock at decision points and systemic surprises, not only as a document collection checklist.
4. **Reboot with consequences.** Prestige should advance the story, change the desktop, and create a meaningful build choice—not only multiply output.

## Current milestone path

### Stabilization — implemented in this pass

- First-shift briefing and authored tutorial directives.
- Persistent current objective and next milestone.
- Working Genesis menu, taskbar, keyboard access, and fullscreen.
- Refresh-rate-independent simulation.
- Eight-hour capped offline progress with a return report.
- Offline-safe visual assets and fonts.
- Complete Vite build output, including runtime scripts and lore documents.
- Automated first-session, automation, and offline-progress checks.

### Vertical slice gate

- Tune the first 30 minutes around an authored sequence of decisions, not random directives.
- Make the first Seraph, first upgrade, Offerings unlock, Void breach, and first Reboot each land as a distinct reveal.
- Add an audio system: UI clicks, boot texture, reward stingers, ambient system hum, mute buses, and focus/background behavior.
- Make Divine Reboot reveal a new narrative state and one build-defining choice.
- Finish one casino game only after it has an economic role, anti-exploit limits, and narrative consequence.
- Replace silent/placeholder content with explicit “coming later” states or remove it from the player build.

### Steam alpha gate

- Move saves from `localStorage` to a versioned, atomic file adapter with backup rotation and migrations.
- Keep progress saves separate from machine-specific display/audio settings.
- Package a Windows build and test clean install, offline first run, suspend/resume, update, and uninstall.
- Configure Steam Auto-Cloud for the save file, then test upload/download and conflict behavior on two machines.
- Map the best in-game achievements to a smaller Steam-facing set and queue unlocks when Steam is offline.
- Add controller navigation, focus states, glyph switching, and Steam Input coverage for every action.
- Validate 1280×800/Steam Deck, 16:9, ultrawide, and 200% UI scaling.
- Add crash logging, a visible build number, save export/import, and a safe-mode launch option.

### Release gate

- Complete one coherent narrative arc ending at the first major prestige layer.
- Run blind playtests for first-click clarity, 30-minute retention, first prestige time, and return-from-offline comprehension.
- Balance active play so it accelerates or redirects automation without becoming mandatory click labor.
- Add accessibility settings for motion, flashing, contrast, text size, hold/repeat input, and audio buses.
- Add localization-safe layout and move player-facing copy out of JavaScript templates.
- Prepare store capsule art, trailer capture states, screenshots, feature list, content disclosures, and a demo save boundary.

## Engine decision

### Recommendation: keep the main game in the web stack

The desktop, windows, documents, settings, and dense text are native strengths of HTML/CSS. Rebuilding these in Godot, Unity, or another canvas-first engine would create a long migration with little player benefit.

Before packaging, split the current global files into these boundaries:

- `simulation`: resources, rates, unlocks, prestige, directives.
- `content`: upgrades, achievements, documents, dialogue.
- `persistence`: schema version, migrations, save adapters.
- `platform`: browser, desktop shell, Steam services.
- `presentation`: desktop shell, windows, notifications, canvas effects.

### Use Phaser selectively

Add Phaser inside an app window when a feature needs scenes, sprites, collisions, tweens, or pointer/gamepad gameplay—for example, a polished Plinko table or Cosmic Defrag. It should consume and return serializable game state through a small bridge. It should not own the main economy or desktop.

Adopt it when at least two planned minigames need the same canvas-game infrastructure. One simple slots interface does not justify it.

### Do not migrate to Godot yet

Reconsider Godot only if the game’s center of gravity changes to spatial 2D/3D play, animated scenes, physics, or console-first input. That would be a different product direction, not a routine technical upgrade.

## Desktop shell decision

The Steam shell is separate from the game engine decision.

### Recommended first spike: Electron

- Lowest migration risk for the current JavaScript/DOM code.
- Predictable bundled Chromium across supported PCs.
- Mature packaging and native Node bridge options.
- Larger download and memory footprint, which must be measured on lower-end hardware and Steam Deck.

### Alternative spike: Tauri

- Smaller application shell and platform installers.
- Requires a Rust/native bridge for Steam services.
- Uses platform webviews unless a runtime is bundled; that increases rendering variance or installer size.

Build one narrow shell spike before the vertical slice is content-complete. The spike must prove: file saves, Steam initialization, one test achievement, overlay behavior, fullscreen, clean exit, and controller input. Do not move production development into the shell until those checks pass.

## Release-quality measurements

- Fresh player reaches the first Seraph without external instructions.
- Fresh player can explain what Praise, Seraphs, and Divine Reboot do.
- First meaningful automation arrives in minutes, not after repetitive clicking.
- A 60 Hz and 120 Hz machine produce the same resources over the same wall-clock time.
- Closing for two hours and returning yields an understandable, capped report.
- Every save schema used in testing can migrate or fail into a recoverable backup.
- All game actions are reachable with keyboard and controller.
- The complete single-player loop works without a network connection.

## Platform references

- Steam Cloud and Auto-Cloud: https://partner.steamgames.com/doc/features/cloud
- Steam hardware/input/offline recommendations: https://partner.steamgames.com/doc/steamhardware/recommendations
- Steam achievements integration: https://partner.steamgames.com/doc/features/achievements/ach_guide
- Electron packaging and distribution: https://www.electronjs.org/docs/latest/tutorial/application-distribution
- Tauri Windows/WebView2 packaging: https://v2.tauri.app/distribute/windows-installer/
- Phaser scenes: https://docs.phaser.io/phaser/concepts/scenes
