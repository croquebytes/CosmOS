# CosmOS Action Plan - Post Phase 6

**Date**: 2026-01-21
**Current Status**: 6/10 phases complete
**Next Focus**: Testing, Polish, UI/UX Enhancement

---

## Immediate Priorities (This Session)

### 1. Testing & QA ✓ PLANNED
- **Testing Guide Created**: See [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Manual Testing**: Execute all test suites (1-8)
- **Bug Tracking**: Document any issues found
- **Console Audit**: Verify zero errors/warnings during normal play
- **Save/Load Stress Test**: Ensure all new features persist correctly

### 2. Agent-Assisted Testing
- **Use Explore Agent**: Navigate game UI and test all features
- **Automated Interactions**: Trigger barks, open windows, test processes
- **Report Generation**: Document findings and screenshots

### 3. UI/UX Polish & Theme Enhancement
Based on user request: *"focus on game engine and UI. including aesthetics to match themes and tones, text flavors, effects, toast notification boxes, etc."*

#### A. Notification System Overhaul
- **Achievement Toasts**: Already tier-styled ✓
  - Add sound effects (optional)
  - Enhance animations (bounce, fade, slide variations)
  - Add "NEW!" badge for first-time unlocks
- **Document Notifications**: Currently blue generic style
  - Theme by category (HR = corporate blue, Lore = mysterious purple, Legal = stern red)
  - Add category-specific icons beyond 📄
  - Typewriter text animation for dramatic effect
- **Host Barks**: Already styled ✓
  - Add portrait/avatar animation
  - Typing indicator before text appears
  - Host expression changes based on bark context (smirking, concerned, amused)
- **System Warnings**: Create dedicated style for ERROR/WARNING messages
  - Red pulsing border for critical warnings
  - Yellow caution for warnings
  - Different sound effects

#### B. Toast Notification Enhancements
**Current Issues to Address:**
- Multiple simultaneous notifications stack awkwardly
- No max visible notifications limit
- No priority system (achievements should trump normal logs)
- Click-to-dismiss works but could be more obvious

**Improvements:**
- **Notification Queue**: Max 3 visible at once, queue remainder
- **Priority Levels**: Critical > Achievement > Document > Bark > Info
- **Stacking Behavior**: Newer toasts push older ones up
- **Interaction Cues**: "Click to dismiss" hint text
- **Close Buttons**: Add × button for explicit dismissal
- **Auto-Stack**: Similar notifications collapse ("You gained Praise x5" instead of 5 separate toasts)

#### C. Visual Effects & Particles
- **Screen Pulse**: Already functional ✓
  - Add pulse intensity variations (gentle vs dramatic)
  - Directional pulses (pulse from notification location)
- **Click Effects**: Enhance miracle click particles
  - Resource-type specific colors (Praise = gold, Souls = purple, Darkness = black smoke)
  - Particle count scales with click power
- **Window Transitions**: Smooth open/close animations
  - Fade in on open
  - Scale down + fade on close
  - Bounce effect when focused
- **Floating Numbers**: Already present ✓
  - Add color coding by resource type
  - Critical hits (large gains) show bigger, slower numbers
  - Combo multipliers for rapid clicks

#### D. Text Flavor & Personality
- **UI Labels**: Add personality to boring text
  - "Perform Miracle" → "Invoke Divine Attention"
  - "Save Game" → "Archive This Branch"
  - "Settings" → "Reality Parameters"
- **Error Messages**: Make them memorable
  - "Not enough Souls" → "Insufficient spectral currency. The dead are stingy."
  - "Upgrade locked" → "Access Denied: Divinity Level Insufficient"
  - "Cannot prestige yet" → "Reality too stable to reboot. Create more chaos."
- **Tooltips**: Expand hover text with personality
  - Add sarcastic/philosophical asides
  - Include lore hints in upgrade descriptions
  - Easter egg tooltips for hidden interactions

#### E. Theme Consistency
**Current Themes:**
1. **Retro OS**: Windows 98 chrome, beveled buttons, system fonts ✓
2. **Cosmic Divine**: Purple/gold gradients, particle effects, sacred geometry
3. **Bureaucratic Horror**: Clinical language, error codes, paperwork aesthetics
4. **Mystery/Lore**: Hidden messages, corrupted text, glitch effects

**Consistency Audit:**
- [ ] All windows use consistent chrome styling
- [ ] All buttons have consistent bevel/press states
- [ ] All text uses MS Sans Serif or Courier New fonts
- [ ] All colors follow the palette:
  - **Divine**: Gold (#FFD700), Purple (#8A2BE2)
  - **Void**: Dark Purple (#4B0082), Black (#1A1A2E)
  - **System**: Gray (#C0C0C0), Blue (#0000FF)
  - **Warnings**: Red (#FF0000), Yellow (#FFFF00)
  - **Success**: Green (#00FF00)

---

## Game Engine Improvements

### 1. Performance Optimization
- **Particle Pooling**: Reuse particle objects instead of creating new ones
- **Canvas Optimization**: Only redraw when needed (dirty rectangles)
- **DOM Optimization**: Batch DOM updates, use document fragments
- **Event Delegation**: Use event bubbling instead of individual listeners

### 2. Game Loop Enhancements
- **Delta Time**: Account for variable frame rates
- **Pause System**: Ability to pause game loop when tab not visible
- **Speed Controls**: Fast-forward mode (2x, 5x, 10x)
- **Tick Rate Control**: Adjustable update frequency

### 3. State Management
- **State Validation**: Check for corrupted data on load
- **Migration System**: Handle old save files when structure changes
- **Export/Import**: Allow players to backup saves as text
- **Cloud Save**: (Future) Optional cloud backup

---

## Content Additions (Low Priority)

### Documents Still Needed
- [x] DOC-NEW-01 through DOC-NEW-15 all created in content pack ✓

### Achievements to Test
- All 40 achievements implemented ✓
- Need to verify all unlock conditions work

### Task Manager Processes
- All 12 processes implemented ✓
- Need to test all callbacks

---

## Remaining Implementation Phases (7-10)

### Phase 7: Adversary Scene Engine (6-8 hours)
**What**: Branching dialogue scene with player choices
- Full-screen modal overlay
- Typewriter text effect
- 3-branch player choice system (DENY / ASK / ACCEPT)
- Scene persistence and replay
- Adversary bark integration post-scene

### Phase 8: Casino Mini-Games (8-10 hours)
**What**: Solitaire, Slots, Plinko
- **8A: Solitaire** (4h) - Klondike rules, drag-and-drop, betting
- **8B: Slots** (3h) - 3 reels, payout table, jackpot
- **8C: Plinko** (3h) - Physics simulation, multiplier slots
- Fate Token economy integration

### Phase 9: Casino Integration & Polish (4-5 hours)
**What**: Casino window with all games + Host personality
- Tabbed interface for game selection
- Host dialogue box with bark display
- Fate Token display and spending
- Casino unlock condition (Prestige 3 or Void 15)

### Phase 10: Testing & Balancing (6-8 hours)
**What**: Full playthrough, balance tuning, bug fixes
- Complete test suite execution
- Balance pass on Fate Token economy
- Achievement threshold tuning
- Host bark frequency adjustment
- Performance profiling

---

## User-Requested Focus: UI/UX Polish

**Priority Order:**
1. **Notification System Overhaul** (toast stacking, priority, animations)
2. **Visual Effects Enhancement** (particles, transitions, pulses)
3. **Text Flavor Injection** (personality in all UI text)
4. **Theme Consistency Audit** (ensure all elements match retro-divine aesthetic)
5. **Interaction Polish** (hover states, click feedback, tooltips)

**Estimated Time:** 8-12 hours

---

## Next Session Recommendations

1. **Option A: UI/UX Polish First**
   - Implement notification queue system
   - Enhance visual effects
   - Add personality to all text
   - Theme consistency pass
   - **Then** proceed with Phase 7

2. **Option B: Complete Phase 7 First**
   - Implement Adversary Scene Engine
   - Adds major narrative moment
   - **Then** do UI/UX polish on everything including scene

3. **Option C: Parallel Work**
   - UI/UX polish in main session
   - Phase 7 implementation in background
   - Merge and test together

**Recommendation:** Option A - Polish what exists before adding more. A beautiful, consistent foundation makes future additions easier.

---

## Testing Checklist (Before Next Phase)

- [ ] Execute all 8 test suites from TESTING_GUIDE.md
- [ ] Document all bugs in GitHub issues or BUGS.md
- [ ] Fix critical bugs (game-breaking, save corruption)
- [ ] Zero console errors during 10-minute play session
- [ ] Save/load tested across browser refresh
- [ ] Performance check (60fps maintained)
- [ ] Mobile/responsive check (if applicable)

---

## Documentation Status

- [x] README.md updated with new features ✓
- [x] IMPLEMENTATION_PLAN updated with progress ✓
- [x] TODO.md updated with completed phases ✓
- [x] TESTING_GUIDE.md created ✓
- [x] ACTION_PLAN.md created (this file) ✓
- [ ] CHANGELOG.md (create if doing version releases)
- [ ] API_DOCS.md (for function reference)

---

## Ready for User Decision

**Question for User:**
Which path forward?
1. **UI/UX Polish Session** (8-12 hours) - Make what exists beautiful
2. **Phase 7: Adversary Scene** (6-8 hours) - Add dramatic narrative moment
3. **Testing Marathon** (4-6 hours) - Comprehensive QA and bug fixing
4. **Parallel: Polish + Phase 7** - Work on both simultaneously

**My Recommendation:** Start with **Testing Marathon**, then **UI/UX Polish**, then **Phase 7**. Build on a solid, beautiful foundation.
