# CosmOS Testing Guide - Phase 5 & 6

**Date**: 2026-01-21
**Phases Tested**: Recycle Bin, Casino Host Barks, Task Manager, Documents, Achievements

---

## Prerequisites

1. Open the game in a modern browser (Chrome, Firefox, Edge)
2. Open Developer Console (F12) to monitor for errors
3. Prepare to take notes on any bugs or issues

---

## Test Suite 1: Recycle Bin Functionality

### Test 1.1: Basic Window Opening
- **Action**: Click the Recycle Bin desktop icon
- **Expected**: Window opens showing empty state with trash can icon
- **Verify**: Header shows "Items: 0" and "Total Sacrifice Value: 0"

### Test 1.2: Resource Sacrifice
- **Setup**: Accumulate at least 100 Praise
- **Action**: Run in console: `game.createResourceSacrifice('praise', 100)`
- **Expected**:
  - 100 Praise deducted from resources
  - Item appears in Recycle Bin
  - Item shows sacrifice value (should be ~10)
- **Verify**: Can restore the item (returns 100 Praise)

### Test 1.3: Item Sacrifice for Bonuses
- **Setup**: Create a resource sacrifice item
- **Action**: Click "Sacrifice" button on the item
- **Expected**:
  - Confirmation dialog appears
  - After confirming: Item removed, global gain bonus applied
  - Log shows permanent bonus message
  - Purple screen pulse effect
- **Verify**: Check State.achievementBonuses.globalGain increased

### Test 1.4: Item Deletion
- **Setup**: Create a resource sacrifice item
- **Action**: Click "Delete" button on the item
- **Expected**:
  - Item removed from bin permanently
  - Resources NOT restored
  - Log shows deletion message
- **Verify**: Item counter decrements

### Test 1.5: Empty Recycle Bin
- **Setup**: Add multiple items to bin
- **Action**: Click "Empty Recycle Bin" button
- **Expected**:
  - Confirmation dialog appears
  - All items removed
  - Empty state appears again
- **Verify**: Item count shows 0

### Test 1.6: Adversary Patch Execution (Future)
- **Setup**: Manually add patch to bin via console:
  ```javascript
  game.addToRecycleBin({
    id: 'adversary_patch_001',
    name: 'NULL.OPERATOR.discipline.patch',
    type: 'patch',
    description: 'Adversary discipline protocol',
    deletable: false
  })
  ```
- **Action**: Click "Execute" button on patch
- **Expected**:
  - Confirmation dialog with strong warning
  - Patch executed, State.adversary.patchExecuted = true
  - Document DOC-NEW-14 unlocks
  - Purple screen pulse
  - Adversary log message appears
- **Verify**: Patch removed from bin after execution

---

## Test Suite 2: Casino Host Bark System

### Test 2.1: Manual Bark Trigger
- **Action**: Run in console: `game.triggerHostBark('casino_enter', 'Greeting', true)`
- **Expected**:
  - Bark notification slides in from right side
  - Shows Host icon (🎰), name ("The Host"), and bark text
  - Notification auto-dismisses after 8 seconds
- **Verify**: Click on notification dismisses it immediately

### Test 2.2: Bark Cooldown System
- **Action**: Trigger same bark twice rapidly:
  ```javascript
  game.triggerHostBark('casino_enter', 'Greeting', true)
  game.triggerHostBark('casino_enter', 'Greeting', true)
  ```
- **Expected**: Second bark should NOT display (global 2s cooldown)
- **Verify**: Check State.casino.hostDialogue.lastBarkTime updated

### Test 2.3: Lore Whisper Display
- **Action**: Manually trigger lore whisper:
  ```javascript
  game.triggerHostBark('casino_idle_30s', 'Lore Whisper', true)
  ```
- **Expected**:
  - Notification has special golden border
  - Glowing animation effect
  - Auto-dismisses after 12 seconds (longer than normal)
  - Gold screen pulse effect
- **Verify**: Whisper ID added to State.casino.hostDialogue.loreWhispersHeard

### Test 2.4: Weighted Random Selection
- **Action**: Trigger multiple barks of same trigger:
  ```javascript
  for (let i = 0; i < 10; i++) {
    setTimeout(() => game.triggerHostBark('casino_enter', 'Greeting', true), i * 3000)
  }
  ```
- **Expected**: Different greeting barks appear (not always the same one)
- **Verify**: Weighted selection working (higher weight = more common)

### Test 2.5: Bark Context Filtering
- **Action**: Trigger different contexts:
  ```javascript
  game.triggerHostBark('casino_win_small', 'Small Win', true)
  game.triggerHostBark('casino_lose_big', 'Big Loss', true)
  ```
- **Expected**: Appropriate bark for each context
- **Verify**: Different bark texts for different triggers

---

## Test Suite 3: Task Manager Integration

### Test 3.1: Process Display
- **Action**: Open Task Manager
- **Expected**: All 12 processes display correctly
- **Verify**:
  - cosmos.exe (critical, red tint)
  - sector7g_indexer.exe (Not Responding, red status)
  - boot_narrator.voice (Idle, gray status)
  - All others (Running, green status)

### Test 3.2: Process Termination
- **Action**: End praise_collector.service
- **Expected**:
  - Warning message appears
  - State.pps reduced by 50%
  - Process removed from list
  - Achievement progress incremented
- **Verify**: PPS actually halved in game

### Test 3.3: Critical Process Protection
- **Action**: Try to end cosmos.exe
- **Expected**: Button shows "—" or is disabled
- **Verify**: Process cannot be terminated

### Test 3.4: Document Unlock via Task Manager
- **Action**: Click "End Process" on sector7g_indexer.exe multiple times
- **Expected**:
  - "BLOCKED" message each time
  - DOC-NEW-03 unlocks after first attempt
  - Achievement progress incremented
- **Verify**: Document appears in Notepad

### Test 3.5: Easter Egg - Hidden Boot Line
- **Action**: Click on boot_narrator.voice process name 20+ times
- **Expected**: Eventually (5% chance per click) see hidden line:
  - "[HIDDEN LINE] 'Operator... do you know what you are operating?'"
  - Achievement progress flag set
- **Verify**: State.achievementProgress.hear_hidden_boot_line = true

---

## Test Suite 4: Documents System

### Test 4.1: Document Unlock Notification
- **Action**: Manually unlock a document: `game.unlockDocument('DOC-NEW-06')`
- **Expected**:
  - Blue notification slides in from right
  - Shows document title and category
  - Auto-dismisses after 6 seconds
  - Blue screen pulse
- **Verify**: Document added to State.documents.collected

### Test 4.2: Category Filtering
- **Action**: Open Notepad, click different category tabs
- **Expected**:
  - Documents filter by category
  - Active tab highlighted
  - "No documents" message if category empty
- **Verify**: All 12 categories work correctly

### Test 4.3: Document Viewing
- **Action**: Click a document in the list
- **Expected**:
  - Document content loads from markdown file
  - Frontmatter stripped
  - Markdown rendered (headers, bold, lists, code)
  - Document metadata shown (Category, File, ID)
- **Verify**: Selected document highlighted in list

### Test 4.4: Document Loading Error
- **Action**: Manually add non-existent document to manifest and try to view
- **Expected**: Error message with file path shown
- **Verify**: Doesn't crash the app

---

## Test Suite 5: Achievement System

### Test 5.1: Achievement Unlocking
- **Action**: Meet condition for ACH-001 (gain 1 Praise)
- **Expected**:
  - Achievement toast notification appears (bronze tier)
  - Shows achievement name and flavor text
  - Bronze icon (🥉)
  - Gold/bronze screen pulse
  - Auto-dismisses after 6 seconds
- **Verify**: Achievement marked as unlocked in State.achievements

### Test 5.2: Achievement Rewards
- **Action**: Unlock ACH-001
- **Expected**: State.achievementBonuses.praiseGain increased by 0.5%
- **Verify**: Reward actually applied (check multiplier)

### Test 5.3: Tier Display in Settings
- **Action**: Open Settings → Achievements tab
- **Expected**:
  - Achievements grouped by tier (Bronze → Secret)
  - Tier headers show progress (e.g., "3/12")
  - Unlocked achievements show name + flavor
  - Locked achievements show "???" and "Hidden achievement"
- **Verify**: Correct tier icons for each tier

### Test 5.4: Achievement Progress Tracking
- **Action**: Perform tracked actions:
  - Click Miracle 10 times
  - Buy 1 Seraph
  - Use Divine Intervention once
  - Prestige once
- **Expected**: All progress counters increment
- **Verify**: Check State.achievementProgress object

### Test 5.5: Secret Achievements
- **Action**: Unlock ACH-S-001 (attempt to repair sector7g)
- **Expected**:
  - Secret tier toast (purple/mystery styling)
  - ❓ icon
  - Document unlocks as reward
- **Verify**: Secret achievements don't show requirements until unlocked

---

## Test Suite 6: Save/Load Integration

### Test 6.1: Basic Save/Load
- **Actions**:
  1. Add items to Recycle Bin
  2. End some Task Manager processes
  3. Unlock some documents
  4. Unlock some achievements
  5. Save game (auto-save or F5 refresh)
  6. Reload page
- **Expected**: All state persists correctly
- **Verify**:
  - Recycle Bin items still there
  - Ended processes still ended
  - Documents still collected
  - Achievements still unlocked

### Test 6.2: Deep Merge Verification
- **Action**: Check console for deep merge errors on load
- **Expected**: No errors, all nested objects merge correctly
- **Verify**: State.recycleBin, State.casino, State.taskmgr all load properly

### Test 6.3: Cross-Session Persistence
- **Actions**:
  1. Sacrifice a resource in Recycle Bin
  2. Note the global gain bonus
  3. Save and reload
  4. Check bonus still applied
- **Expected**: Sacrifice bonuses persist
- **Verify**: Production rates match pre-reload rates

---

## Test Suite 7: Edge Cases & Stress Tests

### Test 7.1: Rapid Bark Triggering
- **Action**: Trigger 100 barks rapidly in a loop
- **Expected**: Only barks respecting cooldowns appear
- **Verify**: No memory leaks, notifications clean up properly

### Test 7.2: Overflow Recycle Bin
- **Action**: Add 50+ items to Recycle Bin
- **Expected**: Scrollbar appears, all items accessible
- **Verify**: Performance doesn't degrade

### Test 7.3: Concurrent Notifications
- **Action**: Trigger achievement, document, and bark simultaneously
- **Expected**: All notifications display without overlap
- **Verify**: Proper stacking and z-index

### Test 7.4: Invalid Data Handling
- **Action**: Manually corrupt State data:
  ```javascript
  State.recycleBin.items.push({ invalid: 'data' })
  ```
- **Expected**: App doesn't crash, handles gracefully
- **Verify**: Error logging or fallback behavior

---

## Test Suite 8: Performance & Console Checks

### Test 8.1: Console Error Scan
- **Action**: Play game for 5 minutes, perform all major actions
- **Expected**: Zero console errors or warnings
- **Verify**: Clean console throughout session

### Test 8.2: Memory Leak Check
- **Action**: Open/close windows 20+ times, trigger notifications repeatedly
- **Expected**: Memory usage stays stable (check Performance tab)
- **Verify**: No runaway memory growth

### Test 8.3: FPS Check
- **Action**: With all systems active, check FPS in Performance monitor
- **Expected**: Consistent 60fps on modern hardware
- **Verify**: No frame drops during notifications

---

## Bug Tracking Template

For each bug found, record:

```markdown
### Bug #X: [Short Description]
- **Severity**: Critical / High / Medium / Low
- **Steps to Reproduce**:
  1. [Step 1]
  2. [Step 2]
  ...
- **Expected Behavior**: [What should happen]
- **Actual Behavior**: [What actually happens]
- **Console Errors**: [Any errors logged]
- **Affected Files**: [Which files likely contain the bug]
- **Proposed Fix**: [How to fix it]
```

---

## Success Criteria

All tests must pass with:
- ✅ No critical bugs
- ✅ No console errors during normal play
- ✅ All features working as designed
- ✅ Save/load 100% functional
- ✅ No performance issues

Once testing complete, proceed to documentation updates and final polish.
