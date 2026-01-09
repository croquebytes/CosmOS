# CosmOS Development TODO

Track your progress on features and improvements. Check off items as you complete them!

**Last Updated**: 2026-01-09

---

## 🔥 High Priority (Week 1: Make it feel good)

### Upgrades System ✅ COMPLETE
- [x] Create upgrade data structure in state.js
- [x] Add upgrade cost calculation functions
- [x] Implement purchase upgrade logic
- [x] Add upgrade UI to Universal Engine Console
- [x] Add 5-8 basic upgrades (multipliers, cost reductions)
- [x] Test upgrade persistence (save/load)
- [x] Add tooltips showing upgrade effects

**Status**: ✅ Tested and working! 8 upgrades with progressive unlocking.

### Visual Feedback & Polish ✅ COMPLETE
- [x] Floating numbers when clicking miracles (+1, +10, etc.)
- [x] Animate resource number changes (count-up effect)
- [x] Screen pulse/flash on big milestones
- [x] Button press animations (beveled inset effect)
- [x] Resource gain sparkle effects (particles on all actions)
- [x] Add "Can't afford" visual feedback (opacity changes)

**Status**: ✅ All effects working smoothly! Juicy and responsive.

### Achievement System ✅ COMPLETE
- [x] Create achievement data structure (15 achievements)
- [x] Implement achievement checking logic (in game loop)
- [x] Add achievement unlock notifications (toast popups)
- [x] Create achievements UI in Settings window
- [x] Add 10-15 basic achievements (milestones)
- [x] Achievement persistence in save file (**Bug fixed**: Added State.load() call)
- [ ] Achievement sound effects (optional - skipped for now)

**Status**: ✅ Fully tested! All 15 achievements working with toast notifications.

---

## ⚡ Medium Priority (Week 2: Add depth) ✅ COMPLETE

### Resource Caps + Storage ✅ COMPLETE
- [x] Implement resource cap system
- [x] Add storage upgrade purchases
- [x] Show "X / Cap" in UI
- [x] Visual warning when near cap (90% threshold)
- [x] Balance cap sizes for progression pacing

**Status**: ✅ Complete! Near-cap warnings working, "STORAGE FULL!" feedback added.

### Second Automaton Tier ✅ COMPLETE
- [x] Create "Cherubic Compiler" automaton type
- [x] Costs Offerings, produces Souls/second
- [x] Add to Universal Engine Console UI
- [x] Implement purchase/production logic
- [x] Balance costs and production rates
- [x] Add upgrade path for new tier

**Status**: ✅ Complete! Cherubs producing Souls with 3 upgrades.

### Active Gameplay Layer ✅ COMPLETE
- [x] Implement cooldown system
- [x] Create "Divine Intervention" active skill (2x production for 10 min)
- [x] Create "Temporal Rift" skill (simulate 1hr instantly)
- [x] Add random event spawner (golden cookie style)
- [x] Create "Divine Event" clickable with random rewards
- [x] Add cooldown UI indicators (real-time countdowns)

**Status**: ✅ Complete! Skills working with visual feedback, Divine Events spawning.

### Interactive Divine Mandates ✅ COMPLETE
- [x] Design skill tree layout (3 branches: Creation/Maintenance/Entropy)
- [x] Create mandate data structure
- [x] Implement mandate unlock logic
- [x] Create Divine Mandates window/app
- [x] Add visual tree UI (nodes, connections)
- [x] Add 15 mandate nodes with effects
- [x] Implement mandate effects (passive bonuses)
- [x] Test mandate persistence

**Status**: ✅ Complete! 15 mandates across 3 branches, prerequisite system working.

---

## 🚀 Lower Priority (Week 3: Expand scope) ✅ COMPLETE

### Second Dimension (Void) ✅ COMPLETE
- [x] Create dimension data structure
- [x] Implement Void Dimension (Darkness → Shadows → Echoes)
- [x] Create Dimension Explorer window UI
- [x] Add dimension switching/tabs
- [x] Implement dimension-specific production
- [x] Add dimension unlock condition (100 Souls upgrade)
- [x] Different visual theme (darker aesthetic with purple tones)
- [x] Dimension progress persistence

**Status**: ✅ Complete! Void dimension unlocks at 100 Souls with Wraiths and Phantoms.

### Narrative Layer ✅ COMPLETE
- [x] Create Notepad app window
- [x] Write 10 "found documents" (lore entries)
- [x] Implement progressive unlock (based on milestones)
- [x] Add document list/navigation
- [x] Progressive document discovery system
- [x] Humorous and mysterious lore

**Status**: ✅ Complete! 10 lore documents unlock based on gameplay milestones.

### First Prestige System ✅ COMPLETE
- [x] Design "Divine Reboot" prestige mechanic
- [x] Calculate Divinity Points formula (sqrt(souls/100))
- [x] Implement prestige trigger (UI button in Settings)
- [x] Create prestige confirmation dialog
- [x] Implement resource reset logic
- [x] Keep Divine Mandates through prestige
- [x] Add Divinity Point multiplier effects (+10% per point)
- [x] Test prestige persistence
- [x] Reapply mandate effects after prestige

**Status**: ✅ Complete! Prestige grants permanent 10% bonuses per Divinity Point.

---

## 🎨 Polish & Quality of Life

### Better Automation
- [ ] Add "Buy 10" button for automatons
- [ ] Add "Buy Max" button for automatons
- [ ] Show cost of next purchase
- [ ] Add auto-purchase toggles (buy when can afford)
- [ ] Show total production breakdown
- [ ] Add "efficiency rating" display

**Estimated time**: 3-4 hours

### Improved Canvas Animation
- [ ] Particle effects on manual miracles
- [ ] Different core visuals per dimension
- [ ] Smooth transitions between states
- [ ] Performance optimization (particle pooling)
- [ ] Add/remove particles based on production rate

**Estimated time**: 2-3 hours

### Keyboard Shortcuts
- [ ] Alt+F4 to close windows
- [ ] Numbers 1-9 for window switching
- [ ] Space to perform miracle
- [ ] M for Divine Mandates
- [ ] D for Dimensions
- [ ] S for Settings
- [ ] Escape to close focused window

**Estimated time**: 1-2 hours

### Settings Improvements
- [ ] Notation toggle (suffixes vs scientific)
- [ ] Autosave interval setting
- [ ] Export save as string
- [ ] Import save from string
- [ ] Hard reset with confirmation
- [ ] Offline progress settings
- [ ] Performance mode (reduce animations)

**Estimated time**: 2-3 hours

---

## 🐛 Bug Fixes & Technical Debt

- [ ] Test save/load edge cases
- [ ] Optimize game loop for performance
- [ ] Add error handling for localStorage
- [ ] Validate save file versions
- [ ] Fix window dragging bounds
- [ ] Test offline progress calculation
- [ ] Mobile responsiveness check
- [ ] Browser compatibility testing

---

## 💡 Future Ideas (Low Priority / Nice to Have)

### Advanced Features
- [ ] Third prestige layer (Cosmic Defrag)
- [ ] Protocol system (challenge modes)
- [ ] Reality compilation (mini-dimensions)
- [ ] More dimensions (Chronos, Quantum, Primordial)
- [ ] Desktop customization (themes, backgrounds)
- [ ] More apps (Task Manager, Registry, Paint, Solitaire)
- [ ] Statistics window with charts
- [ ] Recycle Bin sacrifice system
- [ ] Command Prompt for power users

### Community Features
- [ ] Share screenshot of desktop
- [ ] Export/share save codes
- [ ] Leaderboards (optional, requires backend)
- [ ] Daily challenges

### Audio
- [ ] Background ambient music
- [ ] Click sound effects
- [ ] Achievement unlock sounds
- [ ] Windows 98 startup chime on boot
- [ ] Error beep sounds
- [ ] Volume controls

---

## 📋 Documentation

- [x] Create README.md
- [x] Create IDEAS.md
- [x] Create REFERENCES.md
- [ ] Update IMPLEMENTATION_PLAN.md with new roadmap
- [ ] Add inline code comments
- [ ] Create CHANGELOG.md
- [ ] Write developer notes for future contributors

---

## 🚢 Release Preparation

- [ ] Playtesting (2-4 hours of gameplay)
- [ ] Balance tuning based on playtest
- [ ] Bug fixing pass
- [ ] Performance optimization
- [ ] Write itch.io page description
- [ ] Create game screenshots
- [ ] Create cover image
- [ ] Build production version
- [ ] Test production build
- [ ] Publish to itch.io

---

## Notes

**Current Status**: Phase 2 - Core gameplay loop established

**Next Milestone**: Complete Week 1 priorities (Upgrades, Visual Feedback, Achievements)

**Working Session Log**:
- 2026-01-08: Created documentation (README, IDEAS, REFERENCES, TODO). Starting upgrades system.

---

*Mark items complete with [x] as you finish them!*
*Add notes and dates to track your progress over time.*
