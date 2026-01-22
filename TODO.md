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

### Balance Pass ✅ COMPLETE
- [x] Analyze progression pacing (first prestige timing)
- [x] Slow down Soul production (Cherub: 1/sec → 0.2/sec)
- [x] Adjust prestige formula (sqrt(souls/100) → sqrt(souls/2500))
- [x] Increase mandate costs by 2x (100/200/500/1000)
- [x] Increase Void unlock cost (100 → 200 Souls)
- [x] Increase Soul cap (1000 → 2000)

**Status**: ✅ Complete! Target progression: ~2+ hours to first prestige (was 25 minutes).

### Better Automation ✅ COMPLETE
- [x] Add "Buy 10" button for automatons
- [x] Add "Buy Max" button for automatons
- [x] Show cost of next purchase
- [ ] Add auto-purchase toggles (buy when can afford)
- [ ] Show total production breakdown
- [ ] Add "efficiency rating" display

**Status**: ✅ Buy 10/Max buttons added for all automatons (Seraphs, Cherubs, Wraiths, Phantoms)!

### Improved Canvas Animation
- [ ] Particle effects on manual miracles
- [ ] Different core visuals per dimension
- [ ] Smooth transitions between states
- [ ] Performance optimization (particle pooling)
- [ ] Add/remove particles based on production rate

**Estimated time**: 2-3 hours

### Keyboard Shortcuts ✅ COMPLETE
- [x] Space to perform miracle
- [x] M for Divine Mandates
- [x] D for Dimensions
- [x] S for Settings
- [x] C for Universal Engine Console
- [x] N for Notepad
- [x] Escape to close focused window
- [ ] Numbers 1-9 for window switching (optional)

**Status**: ✅ All main keyboard shortcuts implemented!

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

## 🎰 Casino, Adversary & Desktop Apps Implementation (2026-01-20)

**Implementation Plan**: See [IMPLEMENTATION_PLAN_Casino_Adversary_Apps.md](IMPLEMENTATION_PLAN_Casino_Adversary_Apps.md)

### Phase 1: Foundation ✅ COMPLETE
- [x] Add state structures for Casino, Adversary, Task Manager, Recycle Bin
- [x] Add TaskManagerProcesses data (12 processes)
- [x] Add AchievementList data (40 achievements, 5 tiers)
- [x] Add DocumentManifest data (15 documents)
- [x] Update State.load() deep merge logic

**Status**: ✅ All foundational structures in place

### Phase 2: Documents System ✅ COMPLETE
- [x] Create DocumentManifest in state.js (15 documents)
- [x] Add unlockDocument(), checkDocumentUnlocks(), getDocumentContent() to game.js
- [x] Create document viewer UI in ui.js with category filtering
- [x] Update notepad app config with 12 category tabs
- [x] Add document notification styling
- [x] Test document unlocking (conditions work correctly)

**Status**: ✅ All 15 documents with unlock conditions, markdown rendering, category filtering

### Phase 3: Achievement System ✅ COMPLETE
- [x] Replace old AchievementList (15) with new system (40 achievements)
- [x] Implement 5-tier system (Bronze/Silver/Gold/Platinum/Secret)
- [x] Update checkAchievements() with new condition format
- [x] Add unlockAchievement() with automatic reward application
- [x] Enhance achievement notifications with tier-specific styling
- [x] Redesign Settings achievement panel with tier grouping
- [x] Add achievement progress tracking throughout game actions
- [x] Add tier-specific CSS styling

**Status**: ✅ 40 achievements across 5 tiers with automatic rewards and beautiful UI

### Phase 4: Task Manager ✅ COMPLETE
- [x] Create Task Manager window config in system.js
- [x] Add Task Manager UI functions (updateTaskManagerList, endProcess)
- [x] Add process callbacks (already in TaskManagerProcesses)
- [x] Add Task Manager CSS styling (table, statuses, critical highlighting)
- [x] Add Task Manager desktop icon

**Status**: ✅ 12 processes with callbacks, easter eggs, document unlocks

### Phase 5: Recycle Bin ✅ COMPLETE
- [x] Create Recycle Bin window config
- [x] Add sacrifice mechanics (delete resources for bonuses)
- [x] Add trash item system
- [x] Add restoration mechanics
- [x] Add CSS styling
- [x] Add desktop icon

**Status**: ✅ Recycle Bin with resource sacrifice, item restoration, and patch execution

### Phase 6: Casino Host Bark Engine ✅ COMPLETE
- [x] Implement bark system in game.js (selectHostBark, weighted random)
- [x] Add bark cooldowns and weighting
- [x] Add bark display UI (notification system)
- [x] Add 80 bark lines from content pack (already in state.js)
- [x] Test rare whisper triggers (lore whispers with 1% chance)
- [x] Add bark notification CSS styling

**Status**: ✅ 80 Host barks with weighted selection, cooldowns, and lore whispers

### Phase 7: Adversary Scene Engine ⏳ PENDING
- [ ] Create scene engine with dialogue trees
- [ ] Add player choice system
- [ ] Implement scene persistence
- [ ] Add Adversary barks
- [ ] Create scene UI

**Estimated time**: 6-8 hours

### Phase 8: Casino Mini-Games ⏳ PENDING
- [ ] 8A: Solitaire (5-6 hours)
- [ ] 8B: Slots (2-3 hours)
- [ ] 8C: Plinko (1-2 hours)
- [ ] Fate Token economy

**Estimated time**: 8-10 hours

### Phase 9: Integration & Polish ⏳ PENDING
- [ ] Connect all systems
- [ ] Balance tuning
- [ ] Bug fixes
- [ ] Visual polish

**Estimated time**: 4-5 hours

### Phase 10: Testing & Balancing ⏳ PENDING
- [ ] Full playthrough testing
- [ ] Balance adjustments
- [ ] Content verification
- [ ] Achievement testing

**Estimated time**: 6-8 hours

**Current Progress**: 6/10 phases complete (Foundation, Documents, Achievements, Task Manager, Recycle Bin, Casino Host Barks)
**Next Phase**: Adversary Scene Engine OR continue with testing

---

## Notes

**Current Status**: Casino/Adversary Implementation - Phase 6 Complete (Recycle Bin + Host Barks)

**Next Milestone**: Complete Week 1 priorities (Upgrades, Visual Feedback, Achievements)

**Working Session Log**:
- 2026-01-08: Created documentation (README, IDEAS, REFERENCES, TODO). Starting upgrades system.

---

*Mark items complete with [x] as you finish them!*
*Add notes and dates to track your progress over time.*
