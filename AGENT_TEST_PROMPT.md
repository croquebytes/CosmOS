# Agent Testing Prompt for CosmOS

Use this prompt with an autonomous agent (like the Explore agent or Browser automation tool) to test the CosmOS game comprehensively.

---

## Agent Testing Prompt

```
You are testing CosmOS, an incremental idle game with a retro Windows 98 aesthetic and cosmic divine theme. The game has just implemented 6 major features:

1. **Documents System** (15 lore documents)
2. **Achievement System** (40 achievements across 5 tiers)
3. **Task Manager** (12 system processes)
4. **Recycle Bin** (resource sacrifice mechanics)
5. **Casino Host Barks** (80 personality dialogue lines)
6. **Adversary Foundation** (NULL.OPERATOR system)

## Your Testing Mission

Navigate the game UI, interact with all features, and report findings. Test systematically and document everything.

### Phase 1: Initial Load & Desktop
1. Load the game at http://localhost:3000 (or file:/// path)
2. Observe boot sequence - does it complete without errors?
3. Check desktop - count visible icons (should be 9+)
4. Open browser console (F12) - are there any errors?
5. Take screenshot of desktop

### Phase 2: Core Gameplay
1. Click "Perform Miracle" button 50 times
2. Observe floating numbers and particle effects
3. Watch resources accumulate in display panels
4. Purchase your first automaton (Seraphic Observer)
5. Verify production increases (check Praise/sec value)
6. Take screenshot of resource panel

### Phase 3: Window Management
1. Open Universal Engine Console window
2. Verify window is draggable
3. Open Settings window
4. Verify both windows are open simultaneously
5. Click between windows - verify focus changes
6. Close Universal Engine - verify it disappears
7. Reopen it - verify it remembers approximate position
8. Take screenshot with multiple windows open

### Phase 4: Task Manager Testing
1. Open Task Manager window
2. Count processes - should be 12
3. Identify critical processes (red background tint)
4. Click "End Process" on "praise_collector.service"
5. Verify process disappears from list
6. Check console log for "[WARN] Praise collection halved."
7. Verify Praise/sec reduced by 50%
8. Click "End Process" on "sector7g_indexer.exe" 3 times
9. Each time, verify "[BLOCKED]" message appears
10. Check if document DOC-NEW-03 unlocked (open Notepad to verify)
11. Take screenshot of Task Manager

### Phase 5: Recycle Bin Testing
1. Open browser console
2. Run: `game.createResourceSacrifice('praise', 100)`
3. Open Recycle Bin window
4. Verify item appears in bin
5. Note the sacrifice value displayed
6. Click "Sacrifice" button on the item
7. Confirm the action in dialog
8. Verify item removed and bonus applied message shows
9. Take screenshot of Recycle Bin (before and after)

### Phase 6: Documents System
1. Open Notepad window
2. Check if DOC-NEW-06 (Training/Onboarding) is unlocked
3. Click through all 12 category tabs
4. Click on a document to view it
5. Verify document content loads (markdown rendered)
6. Check for proper formatting (headers, lists, bold text)
7. Try switching to different categories
8. Take screenshot of document viewer

### Phase 7: Achievement System
1. Open Settings window
2. Navigate to Achievements tab
3. Count achievement tiers (should be 5: Bronze, Silver, Gold, Platinum, Secret)
4. Verify tier headers show progress (e.g., "3/12")
5. Check that locked achievements show "???"
6. Look for any unlocked achievements (ACH-001 should be unlocked if you clicked miracle)
7. Verify achievement shows flavor text
8. Take screenshot of achievement panel

### Phase 8: Casino Host Barks
1. Open browser console
2. Run: `game.triggerHostBark('casino_enter', 'Greeting', true)`
3. Verify bark notification slides in from right
4. Note the Host icon (🎰) and text style
5. Wait for auto-dismiss (8 seconds) or click to dismiss
6. Run: `game.triggerHostBark('casino_idle_30s', 'Lore Whisper', true)`
7. Verify lore whisper has golden border and glow effect
8. Take screenshot of bark notification (both normal and lore whisper)

### Phase 9: Save/Load Persistence
1. Note current game state:
   - Resources (Praise, Offerings, Souls)
   - Automatons count
   - Achievements unlocked count
   - Documents collected count
2. Manually save game (or wait for autosave)
3. Refresh page (F5)
4. Verify all state persists:
   - Resources match
   - Automatons match
   - Achievements still unlocked
   - Documents still collected
   - Recycle Bin items still there
   - Ended processes still ended
5. Check console for any load errors

### Phase 10: Interaction & Edge Cases
1. Try clicking everywhere rapidly - does anything break?
2. Open all windows simultaneously (5+ windows)
3. Verify no visual glitches or overlaps
4. Spam "Perform Miracle" button - does it lag or break?
5. Try resizing browser window - does UI adapt?
6. Check console for any errors during stress test

### Phase 11: Performance Check
1. Open browser Performance tab (F12 → Performance)
2. Start recording
3. Play game normally for 60 seconds (click, open windows, etc.)
4. Stop recording
5. Check FPS (should be consistently 60fps on modern hardware)
6. Check for memory leaks (memory should stay stable)
7. Report any performance issues

## Reporting Format

For each phase, report:
```
## Phase X: [Name]
**Status**: ✅ Pass / ⚠️ Warning / ❌ Fail

### Observations:
- [What worked]
- [What didn't work]
- [Unexpected behavior]

### Screenshots:
- [List screenshot filenames]

### Console Errors:
- [Copy any errors or "None"]

### Suggestions:
- [Improvement ideas]
```

## Critical Issues to Watch For

1. **Console Errors**: Any red errors in console = critical bug
2. **Save Corruption**: State not persisting = game-breaking
3. **UI Breaks**: Windows not opening/closing = UX failure
4. **Performance**: FPS drops below 30 = optimization needed
5. **Visual Glitches**: Overlapping UI, broken layout = polish needed

## Success Criteria

- ✅ All 12 processes visible in Task Manager
- ✅ Process termination works and logs appear
- ✅ Documents unlock and display properly
- ✅ Achievements unlock and show toasts
- ✅ Recycle Bin sacrifice mechanics work
- ✅ Casino barks display with correct styling
- ✅ Save/load 100% functional
- ✅ Zero console errors during normal play
- ✅ 60fps maintained throughout
- ✅ All windows draggable and closeable

## End Report

Provide a comprehensive summary:
1. **Overall Score**: Pass / Fail with % success rate
2. **Critical Bugs**: List of game-breaking issues
3. **Non-Critical Bugs**: List of minor issues
4. **UX Concerns**: UI/UX improvements needed
5. **Performance**: FPS, memory, optimization notes
6. **Recommendations**: Top 3 priorities for next update

---

**Testing Duration**: Approximately 30-45 minutes for thorough test

Good luck, Agent! Report all findings.
```

---

## How to Use This Prompt

### Option 1: Manual Testing (Human)
- Follow the prompt step-by-step
- Take screenshots as requested
- Document findings in a new file `TEST_RESULTS_[DATE].md`

### Option 2: Automated Agent (Claude Code Explore Agent)
- Use the Task tool with subagent_type="Explore"
- Pass the above prompt to the agent
- Agent will navigate UI and report findings

### Option 3: Browser Automation (Playwright/Puppeteer)
- Convert prompt to automated test script
- Run headless browser tests
- Generate report automatically

---

## Next Steps After Testing

1. **Review Results**: Read agent report carefully
2. **Prioritize Bugs**: Critical → High → Medium → Low
3. **Fix Critical Bugs**: Game-breaking issues first
4. **Create Bug Tracker**: Document all issues in GitHub issues or BUGS.md
5. **Iterate**: Fix, test, repeat until clean

---

*"Testing is not finding bugs. Testing is discovering what breaks when you try."*
