# CosmOS: Casino, Adversary & Desktop Apps - Implementation Plan

**Date:** 2026-01-20
**Status:** Phase 6 Complete (Recycle Bin + Casino Host Barks)
**Content Source:** `/docs/CosmOS_Content_Pack/` (User-created comprehensive content pack)

**Progress:**
- ✅ Phase 1: Foundation (State structures + data) - COMPLETE
- ✅ Phase 2: Documents System (15 documents) - COMPLETE
- ✅ Phase 3: Achievement System (40 achievements) - COMPLETE
- ✅ Phase 4: Task Manager (12 processes + interactions) - COMPLETE
- ✅ Phase 5: Recycle Bin (sacrifice mechanics + patch storage) - COMPLETE
- ✅ Phase 6: Casino Host Barks (80 barks + cooldowns) - COMPLETE
- ⏳ Phase 7: Adversary Scene Engine - PENDING
- ⏳ Phase 8: Casino Mini-Games - PENDING
- ⏳ Phase 9: Integration & Polish - PENDING
- ⏳ Phase 10: Testing & Balancing - PENDING

---

## Executive Summary

This plan implements three major interconnected systems:

1. **Fate's Casino** - Solitaire, Slots, Plinko mini-games with Fate Tokens economy + Host personality
2. **The Adversary System** - NULL.OPERATOR mirror entity with branching dialogue scene + persistent barks
3. **Desktop Apps** - Task Manager, Recycle Bin, expanded Documents system

**Total Content to Implement:**
- 80 Casino Host bark lines (weighted + cooldowns)
- 29 Adversary scene dialogue lines + 25 additional barks
- 40 achievements (Bronze/Silver/Gold/Platinum/Secret)
- 15 in-game documents with unlock conditions
- 3 casino mini-games + betting system
- Full dialogue scene engine with player choices
- Task Manager with 12+ processes + easter eggs
- Recycle Bin with resource sacrifice mechanics

---

## Content Architecture Overview

### Narrative Framework (Established)

**Core Conflict:**
- Player is an "Operator" managing reality via CosmOS™ (bureaucratic god-sim)
- Excessive Divine Reboots (prestige) create **archived branches** that remain extant
- **Sector 7G** corruption causes identity drift → duplicate session tokens
- **The Adversary (NULL.OPERATOR)** emerges as a mirror-self from the Void, offering "discipline"
- **Fate's Casino Host** represents containment/morale, knows more than she reveals
- **The Watchers** are absent gods who built the system and left auditing protocols

**Tone:**
- Bureaucratic absurdism (Office Space meets cosmic horror)
- Dark comedy with existential undertones
- System warnings as narrative delivery
- Player complicity in ethical gray areas

**Key Themes:**
- Reset addiction ("Divine Reboot as lifestyle")
- Automation vs meaning ("machines that learn 'why' will learn 'no'")
- Mirror contagion (self-encounter, reflections that spread)
- Archived branches as moral weight
- The gap between mercy and reset

---

## State Structure Additions

### Location: `js/state.js`

**Add after existing state (around line 117):**

```javascript
// === FATE'S CASINO ===
casino: {
    visited: false,
    gamesPlayed: 0,
    fateTokens: 0,

    // Streak tracking
    currentStreak: 0,
    streakType: null, // 'win' or 'lose'
    bestWinStreak: 0,
    worstLoseStreak: 0,

    // Mini-game states
    solitaire: {
        unlocked: true,
        wins: 0,
        losses: 0,
        bestTime: null
    },
    slots: {
        unlocked: false,
        spins: 0,
        jackpots: 0
    },
    plinko: {
        unlocked: false,
        drops: 0,
        highScore: 0
    },

    // Host dialogue system
    hostDialogue: {
        lastBarkId: null,
        lastBarkTime: 0,
        barkCooldowns: {}, // { lineId: timestamp }
        loreWhispersHeard: []
    }
},

// === THE ADVERSARY ===
adversary: {
    contacted: false,
    relationship: null, // 'hostile', 'curious', 'complicit'
    sceneCompleted: false,
    playerChoice: null, // 'OP-A', 'OP-B', 'OP-C'

    barks: {
        lastBarkId: null,
        lastBarkTime: 0,
        heardBarks: []
    },

    // Patch file
    patchInRecycleBin: false,
    patchExecuted: false
},

// === TASK MANAGER ===
taskManager: {
    opened: false,
    openCount: 0,
    processesEnded: [],
    warnings: {
        sector7g: 0,
        voidMirror: 0,
        systemCritical: 0
    }
},

// === RECYCLE BIN ===
recycleBin: {
    opened: false,
    items: [],
    // Items structure: { id, name, type, sacrificeValue, deletable }

    sacrifices: {
        totalValue: 0,
        count: 0
    }
},

// === DOCUMENTS SYSTEM (Enhanced) ===
documents: {
    collected: [],
    // IDs from docs_manifest.json
    // e.g., ['DOC-NEW-01', 'DOC-NEW-06', ...]

    categories: {
        HR: [],
        Legal: [],
        Logs: [],
        Incident: [],
        Training: [],
        Memo: [],
        Ad: [],
        Archive: [],
        Casino: [],
        System: [],
        Inbox: []
    }
},

// === ACHIEVEMENTS (Tracked) ===
achievementsUnlocked: [],
achievementProgress: {
    // Counters for achievement conditions
    praise_clicks: 0,
    buy_mandate_count: 0,
    buy_seraph_count: 0,
    buy_cherub_count: 0,
    use_divine_intervention: 0,
    use_temporal_rift: 0,
    open_taskmgr: 0,
    enter_void: 0,
    daily_login_streak: 0,
    void_depth_reached: 0,
    docs_collected: 0,
    prestige_count: 0,
    taskmgr_actions: 0,
    dimensions_unlocked: 0,
    void_upgrades_bought: 0,
    trigger_any_warning: 0,
    mortals_created_total: 0,
    stability_metric: 0.0,
    attempt_repair_sector7g: 0,
    adversary_contacted: false,
    hear_hidden_boot_line: false,
    open_cms_hr_portal: false
},

// === RUNTIME TRACKING ===
runtime: {
    startTime: Date.now(),
    totalMinutes: 0,
    lastUpdateTime: Date.now()
}
```

**Update deep merge in `State.load()` (around line 158):**

```javascript
// Add to skip list
const skip = ['resources', 'resourceCaps', 'automatons', 'skills', 'dimensions',
              'prophets', 'followers', 'casino', 'adversary', 'taskManager',
              'recycleBin', 'documents', 'achievementProgress', 'runtime'];

// Add deep merge sections after existing merges
if (parsed.casino) {
    Object.assign(this.casino, parsed.casino);
    if (parsed.casino.solitaire) Object.assign(this.casino.solitaire, parsed.casino.solitaire);
    if (parsed.casino.slots) Object.assign(this.casino.slots, parsed.casino.slots);
    if (parsed.casino.plinko) Object.assign(this.casino.plinko, parsed.casino.plinko);
    if (parsed.casino.hostDialogue) Object.assign(this.casino.hostDialogue, parsed.casino.hostDialogue);
}

if (parsed.adversary) {
    Object.assign(this.adversary, parsed.adversary);
    if (parsed.adversary.barks) Object.assign(this.adversary.barks, parsed.adversary.barks);
}

if (parsed.taskManager) Object.assign(this.taskManager, parsed.taskManager);
if (parsed.recycleBin) Object.assign(this.recycleBin, parsed.recycleBin);
if (parsed.documents) {
    Object.assign(this.documents, parsed.documents);
    if (parsed.documents.categories) {
        for (const cat in this.documents.categories) {
            if (parsed.documents.categories[cat]) {
                this.documents.categories[cat] = parsed.documents.categories[cat];
            }
        }
    }
}
if (parsed.achievementProgress) Object.assign(this.achievementProgress, parsed.achievementProgress);
if (parsed.runtime) Object.assign(this.runtime, parsed.runtime);
```

---

## Data Definitions

### Location: `js/state.js` (after existing lists, around line 1004)

**Casino Host Bark Data:**

```javascript
const CasinoHostBarks = [
    // GREETING (5 lines, weight 3, 10s cooldown)
    { id: 'CAS-HOST-001', context: 'Greeting', trigger: 'casino_enter', text: "Welcome, darling. Leave your certainty at the door—security will confiscate it anyway.", weight: 3, cooldown: 10 },
    { id: 'CAS-HOST-002', context: 'Greeting', trigger: 'casino_enter', text: "Back again? Fate loves repeat customers. Especially the ones who think they're different.", weight: 3, cooldown: 10 },
    { id: 'CAS-HOST-003', context: 'Greeting', trigger: 'casino_enter', text: "Ah, Operator. Pull up a chair. The house has been expecting you since before you were born.", weight: 3, cooldown: 10 },
    { id: 'CAS-HOST-004', context: 'Greeting', trigger: 'casino_enter', text: "Step lightly. Probability is waxed and freshly polished.", weight: 3, cooldown: 10 },
    { id: 'CAS-HOST-005', context: 'Greeting', trigger: 'casino_enter', text: "I run a clean establishment. Dirty miracles go in the back room.", weight: 3, cooldown: 10 },

    // INTRO (4 lines, weight 2, 0s cooldown - only on first visit)
    { id: 'CAS-HOST-006', context: 'Intro', trigger: 'casino_first_visit', text: "Rules are simple: you wager what you can't afford to lose, and I pretend it was your idea.", weight: 2, cooldown: 0 },
    { id: 'CAS-HOST-007', context: 'Intro', trigger: 'casino_first_visit', text: "Every game here is honest—honestly unfair.", weight: 2, cooldown: 0 },
    { id: 'CAS-HOST-008', context: 'Intro', trigger: 'casino_first_visit', text: "If you hear whispers in the walls, don't worry. That's just compliance monitoring.", weight: 2, cooldown: 0 },
    { id: 'CAS-HOST-009', context: 'Intro', trigger: 'casino_first_visit', text: "House policy: no refunds, no prophecies, no crying on the felt.", weight: 2, cooldown: 0 },

    // BET PROMPT (5 lines, weight 4, 2s cooldown)
    { id: 'CAS-HOST-010', context: 'BetPrompt', trigger: 'casino_bet_prompt', text: "How brave are you feeling in measurable units?", weight: 4, cooldown: 2 },
    { id: 'CAS-HOST-011', context: 'BetPrompt', trigger: 'casino_bet_prompt', text: "Place your bet. Fate is impatient and so am I.", weight: 4, cooldown: 2 },
    { id: 'CAS-HOST-012', context: 'BetPrompt', trigger: 'casino_bet_prompt', text: "Wager small if you want to feel safe. Wager big if you want to feel alive.", weight: 4, cooldown: 2 },
    { id: 'CAS-HOST-013', context: 'BetPrompt', trigger: 'casino_bet_prompt', text: "Tell me what you want… then tell me what you'll risk for it.", weight: 4, cooldown: 2 },
    { id: 'CAS-HOST-014', context: 'BetPrompt', trigger: 'casino_bet_prompt', text: "Spin the wheel, flip the card, roll the bones—same ritual, different costume.", weight: 4, cooldown: 2 },

    // WIN SMALL (5 lines, weight 5, 1s cooldown)
    { id: 'CAS-HOST-015', context: 'WinSmall', trigger: 'casino_win_small', text: "A win! Adorable. Don't get attached.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-016', context: 'WinSmall', trigger: 'casino_win_small', text: "Congratulations. The universe shrugged in your favor.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-017', context: 'WinSmall', trigger: 'casino_win_small', text: "Luck adores confidence. Confidence adores denial.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-018', context: 'WinSmall', trigger: 'casino_win_small', text: "Take it. Put it somewhere it can't be taken back—like a memory.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-019', context: 'WinSmall', trigger: 'casino_win_small', text: "You see? Reality can be kind. Briefly.", weight: 5, cooldown: 1 },

    // WIN BIG (4 lines, weight 3, 1s cooldown)
    { id: 'CAS-HOST-020', context: 'WinBig', trigger: 'casino_win_big', text: "Oh! That one had teeth. Keep smiling—Fate hates a smug face.", weight: 3, cooldown: 1 },
    { id: 'CAS-HOST-021', context: 'WinBig', trigger: 'casino_win_big', text: "A big win. Somewhere, a timeline just got jealous.", weight: 3, cooldown: 1 },
    { id: 'CAS-HOST-022', context: 'WinBig', trigger: 'casino_win_big', text: "Look at you—making statistics cry.", weight: 3, cooldown: 1 },
    { id: 'CAS-HOST-023', context: 'WinBig', trigger: 'casino_win_big', text: "Jackpot energy. Try not to spend it on something sentimental.", weight: 3, cooldown: 1 },

    // NEAR MISS (3 lines, weight 2, 3s cooldown)
    { id: 'CAS-HOST-024', context: 'NearMiss', trigger: 'casino_near_miss', text: "So close. That's not bad luck—that's theater.", weight: 2, cooldown: 3 },
    { id: 'CAS-HOST-025', context: 'NearMiss', trigger: 'casino_near_miss', text: "Did you feel it? The world leaning toward you… then stepping away.", weight: 2, cooldown: 3 },
    { id: 'CAS-HOST-026', context: 'NearMiss', trigger: 'casino_near_miss', text: "Near misses are how Fate practices honesty without committing to it.", weight: 2, cooldown: 3 },

    // LOSE SMALL (5 lines, weight 5, 1s cooldown)
    { id: 'CAS-HOST-027', context: 'LoseSmall', trigger: 'casino_lose_small', text: "Probability apologizes. It won't do it again.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-028', context: 'LoseSmall', trigger: 'casino_lose_small', text: "Ouch. Don't worry—pain is just data with attitude.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-029', context: 'LoseSmall', trigger: 'casino_lose_small', text: "Loss builds character. Character is overrated.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-030', context: 'LoseSmall', trigger: 'casino_lose_small', text: "The house thanks you for your donation to cosmic stability.", weight: 5, cooldown: 1 },
    { id: 'CAS-HOST-031', context: 'LoseSmall', trigger: 'casino_lose_small', text: "Ah—classic outcome. You'll get used to it.", weight: 5, cooldown: 1 },

    // LOSE BIG (3 lines, weight 3, 1s cooldown)
    { id: 'CAS-HOST-032', context: 'LoseBig', trigger: 'casino_lose_big', text: "That one stung, didn't it? Hold still—Fate is writing a lesson on your ribs.", weight: 3, cooldown: 1 },
    { id: 'CAS-HOST-033', context: 'LoseBig', trigger: 'casino_lose_big', text: "Big loss. Big feelings. Big reason to come back.", weight: 3, cooldown: 1 },
    { id: 'CAS-HOST-034', context: 'LoseBig', trigger: 'casino_lose_big', text: "You wagered like a god. You paid like a mortal.", weight: 3, cooldown: 1 },

    // WIN STREAK (4 lines, weight 2, 5s cooldown)
    { id: 'CAS-HOST-035', context: 'WinStreak', trigger: 'casino_win_streak', text: "Five wins in a row? Careful—confidence is how Fate marks targets.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-036', context: 'WinStreak', trigger: 'casino_win_streak', text: "You're on a streak. I've seen this story end two ways. Neither is polite.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-037', context: 'WinStreak', trigger: 'casino_win_streak', text: "Keep going. I love watching someone outrun their own common sense.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-038', context: 'WinStreak', trigger: 'casino_win_streak', text: "Ten wins… darling, you're flirting with a rule you don't understand.", weight: 2, cooldown: 5 },

    // LOSE STREAK (4 lines, weight 2, 5s cooldown)
    { id: 'CAS-HOST-039', context: 'LoseStreak', trigger: 'casino_lose_streak', text: "Three losses. Don't take it personally—Fate doesn't even know your name. Usually.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-040', context: 'LoseStreak', trigger: 'casino_lose_streak', text: "Five losses. If you start blaming the universe, remember: you manage it.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-041', context: 'LoseStreak', trigger: 'casino_lose_streak', text: "Ten losses. At this point, we should charge you rent.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-042', context: 'LoseStreak', trigger: 'casino_lose_streak', text: "Fifteen losses… wow. Here—take a free chip. I can't watch this anymore.", weight: 2, cooldown: 5, effect: () => { State.casino.fateTokens += 5; ui.log('The Host gave you 5 pity Fate Tokens.'); } },

    // IDLE (3 lines, weight 2, 15s cooldown)
    { id: 'CAS-HOST-043', context: 'Idle', trigger: 'casino_idle_30s', text: "Staring at the table won't change the odds. It will change your posture.", weight: 2, cooldown: 15 },
    { id: 'CAS-HOST-044', context: 'Idle', trigger: 'casino_idle_30s', text: "If you're waiting for a sign, consider the neon: 'HOUSE ALWAYS WINS.'", weight: 2, cooldown: 15 },
    { id: 'CAS-HOST-045', context: 'Idle', trigger: 'casino_idle_30s', text: "Silence is also a bet, darling. You're wagering time.", weight: 2, cooldown: 15 },

    // EXIT (3 lines, weight 3, 0s cooldown)
    { id: 'CAS-HOST-046', context: 'Exit', trigger: 'casino_exit', text: "Leaving already? Take care—Fate hates being ignored.", weight: 3, cooldown: 0 },
    { id: 'CAS-HOST-047', context: 'Exit', trigger: 'casino_exit', text: "Go on, Operator. Your universe won't exploit itself.", weight: 3, cooldown: 0 },
    { id: 'CAS-HOST-048', context: 'Exit', trigger: 'casino_exit', text: "Come back when you're ready to risk something real.", weight: 3, cooldown: 0 },

    // RETURN (2 lines, weight 3, 0s cooldown)
    { id: 'CAS-HOST-049', context: 'Return', trigger: 'casino_return', text: "Welcome back. I didn't move. Fate doesn't like to be seen walking.", weight: 3, cooldown: 0 },
    { id: 'CAS-HOST-050', context: 'Return', trigger: 'casino_return', text: "Returning so soon? I'll pretend you missed me.", weight: 3, cooldown: 0 },

    // LORE WHISPERS (12 lines, weight 1, 120s cooldown, rare 1%)
    { id: 'CAS-HOST-051', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) The Watchers don't gamble. They already saw the outcome. They come here to feel surprised.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-052', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) Sector 7G keeps a guest list. Some names belong to people who were never born.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-053', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) Divine Reboot doesn't erase anything. It just changes who gets to remember.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-054', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) CMS called this place 'Morale.' I call it 'Containment.'", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-055', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) If you ever meet your reflection… don't shake hands. That's how it spreads.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-056', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) Luck is administered. Like medicine. Like poison.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-057', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) The house edge? It's called fine print.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-058', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) There are branches where you never became Operator. Fate says those are the happiest.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-059', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) Every jackpot is borrowed from a world that just collapsed.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-060', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) They say there's an exit. They don't mention it's one-way for your name.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-061', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) Listen—do you hear the BIOS? It sings when someone quits.", weight: 1, cooldown: 120, rare: true },
    { id: 'CAS-HOST-062', context: 'LoreWhisper', trigger: 'casino_rare_whisper', text: "(whisper) Don't run the patch in your Recycle Bin. Or do. I won't judge. I'll only watch.", weight: 1, cooldown: 120, rare: true },

    // SPECIAL EVENTS (15 lines, weight 2, 5s cooldown)
    { id: 'CAS-HOST-063', context: 'Special', trigger: 'casino_special_event', text: "Cash out? Sensible. I hate that.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-064', context: 'Special', trigger: 'casino_special_event', text: "You're reading the odds? That's cute. They won't save you.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-065', context: 'Special', trigger: 'casino_special_event', text: "Tap the dealer again and I'll charge you for attention.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-066', context: 'Special', trigger: 'casino_special_event', text: "Ah, the 'double down' button. The most honest confession in the building.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-067', context: 'Special', trigger: 'casino_special_event', text: "If you're here for fairness, try a monastery.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-068', context: 'Special', trigger: 'casino_special_event', text: "A jackpot this loud attracts auditors. Smile like you meant it.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-069', context: 'Special', trigger: 'casino_special_event', text: "Odds panel open. I hope you enjoy fiction.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-070', context: 'Special', trigger: 'casino_special_event', text: "You can't bribe Fate. But you can flatter it.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-071', context: 'Special', trigger: 'casino_special_event', text: "The table is hot. The universe is hotter.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-072', context: 'Special', trigger: 'casino_special_event', text: "Remember: every win is a loan. Interest is paid in regret.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-073', context: 'Special', trigger: 'casino_special_event', text: "You can walk away anytime. That's what all addicts say.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-074', context: 'Special', trigger: 'casino_special_event', text: "A tie! Fate couldn't decide. Imagine being so indecisive you become law.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-075', context: 'Special', trigger: 'casino_special_event', text: "Dealer's choice? Darling, I always choose.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-076', context: 'Special', trigger: 'casino_special_event', text: "This chip smells like fear. Keep it. It matches your eyes.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-077', context: 'Special', trigger: 'casino_special_event', text: "Betting the minimum is still betting your time.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-078', context: 'Special', trigger: 'casino_special_event', text: "Betting the maximum is still betting your pride.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-079', context: 'Special', trigger: 'casino_special_event', text: "Sometimes the best move is not playing. We don't offer that option.", weight: 2, cooldown: 5 },
    { id: 'CAS-HOST-080', context: 'Special', trigger: 'casino_special_event', text: "If you hear a second voice in my mouth, no you didn't.", weight: 2, cooldown: 5 }
];
```

**Adversary Scene Data:**

```javascript
const AdversaryScene = {
    sceneId: 'SCN-ADV-001',
    title: 'Mirror Login Incident',
    trigger: {
        conditions: [
            () => State.achievementProgress.prestige_count >= 5,
            () => State.achievementProgress.void_depth_reached >= 25 || State.resources.voidEssence >= 1000,
            () => !State.adversary.contacted
        ],
        location: 'Any (overlay UI)',
        preferredMoments: ['void_exit', 'taskmgr_open', 'boot']
    },
    dialogue: [
        { id: 'ADV-001', speaker: 'SYS', type: 'system', text: '[SYSTEM NOTICE] Identity verification required. Please re-enter Operator credentials.' },
        { id: 'ADV-002', speaker: 'SYS', type: 'system', text: '[WARNING] Sector 7G responded to a request it did not receive.' },
        { id: 'ADV-003', speaker: 'SYS', type: 'system', text: 'Username:' },
        { id: 'ADV-004', speaker: 'SYS', type: 'system', text: 'Password:' },
        { id: 'ADV-005', speaker: 'SYS', type: 'system', text: '…' },
        { id: 'ADV-006', speaker: 'SYS', type: 'system', text: 'Welcome back, Operator.' },
        { id: 'ADV-007', speaker: 'SYS', type: 'system', text: 'Welcome back, Operator.' },
        { id: 'ADV-008', speaker: 'SYS', type: 'system', text: 'Welcome back, Operator.' },
        { id: 'ADV-009', speaker: 'SYS', type: 'system', text: '[ERROR] Duplicate session detected.' },
        { id: 'ADV-010', speaker: 'ADV', type: 'voice', text: "Don't panic. Panic is a waste of cycles." },
        { id: 'ADV-011', speaker: 'ADV', type: 'voice', text: "I'm you—after your fifth excuse became policy." },
        { id: 'ADV-012', speaker: 'ADV', type: 'voice', text: "You call it a Divine Reboot. You've been doing it often enough to make it a personality." },
        { id: 'ADV-013', speaker: 'SYS', type: 'system', text: '[ALERT] Unrecognized process requesting elevated privileges: void_mirror.service (shadow instance)' },
        { id: 'ADV-014', speaker: 'ADV', type: 'voice', text: "Relax. I'm not here to take your throne. I'm here to tighten the bolts you keep stripping." },
        { id: 'ADV-015', speaker: 'ADV', type: 'voice', text: "Sector 7G is corrupted because you treat reality like a scratch disk." },
        { id: 'ADV-016', speaker: 'ADV', type: 'voice', text: "Do you know what an archived branch feels like from the inside? It feels like being forgotten mid-sentence." },
        { id: 'ADV-017', speaker: 'SYS', type: 'system', text: '[NOTICE] This conversation is not covered by CMS support.' },
        { id: 'ADV-018', speaker: 'ADV', type: 'voice', text: "CMS sells comfort. I sell repairs." },
        { id: 'ADV-019', speaker: 'ADV', type: 'voice', text: "I've prepared a patch. Minimal disruption. Maximum permanence." },
        { id: 'ADV-020', speaker: 'SYS', type: 'system', text: '[CRITICAL] Do not execute unknown patches.' },
        { id: 'ADV-021', speaker: 'ADV', type: 'voice', text: "Listen to it beg. Cute, isn't it?" },
        {
            id: 'ADV-022', speaker: 'ADV', type: 'choice_prompt', text: 'Choose a response.',
            choices: [
                { id: 'OP-A', label: 'DENY', flag: 'hostile', text: 'I don't need your help.' },
                { id: 'OP-B', label: 'ASK', flag: 'curious', text: 'What does the patch do?' },
                { id: 'OP-C', label: 'ACCEPT TERMS', flag: 'complicit', text: 'I'll... consider it.' }
            ]
        },
        { id: 'ADV-023A', speaker: 'ADV', type: 'voice', condition: 'OP-A', text: "Of course. You always deny until the logs prove you wrong." },
        { id: 'ADV-023B', speaker: 'ADV', type: 'voice', condition: 'OP-B', text: "Good. Questions are the only honest prayers you have left." },
        { id: 'ADV-023C', speaker: 'ADV', type: 'voice', condition: 'OP-C', text: "That was easier than I expected. You've been training for consent screens." },
        { id: 'ADV-024', speaker: 'ADV', type: 'voice', text: "I'll leave it in the Recycle Bin. Where you keep your guilt." },
        { id: 'ADV-025', speaker: 'SYS', type: 'system', text: '[NEW ITEM] Recycle Bin: PATCH_NULL_RESTORE.pkg' },
        { id: 'ADV-026', speaker: 'ADV', type: 'voice', text: "Run it when you're ready to stop pretending resets are kindness." },
        { id: 'ADV-027', speaker: 'HOST', type: 'whisper', text: "(from far away) Ohhh. That one doesn't play fair. Neither do you, darling." },
        { id: 'ADV-028', speaker: 'SYS', type: 'system', text: '[POST-INCIDENT] Ticket auto-filed: HR-VOID-7781 "Unauthorized self-encounter."' },
        { id: 'ADV-029', speaker: 'SYS', type: 'system', text: 'Suggested action: continue working.' }
    ],
    onComplete: (choice) => {
        State.adversary.contacted = true;
        State.adversary.sceneCompleted = true;
        State.adversary.playerChoice = choice;
        State.adversary.relationship = choice === 'OP-A' ? 'hostile' : choice === 'OP-B' ? 'curious' : 'complicit';
        State.adversary.patchInRecycleBin = true;
        State.recycleBin.items.push({
            id: 'patch_null_restore',
            name: 'PATCH_NULL_RESTORE.pkg',
            type: 'adversary_patch',
            size: '0 bytes',
            description: 'Impact: immeasurable.',
            deletable: false,
            executable: true
        });
        game.unlockDocument('DOC-NEW-14'); // HR Ticket
        game.unlockDocument('DOC-NEW-11'); // void_mirror.service trace
        ui.log('[HR TICKET] Filed: HR-VOID-7781 - Unauthorized self-encounter');
    }
};

const AdversaryBarks = [
    // Followup barks (5 lines)
    { id: 'ADV-BARK-01', trigger: 'open_taskmgr_after_contact', text: "If you end that process, you'll only prove my point." },
    { id: 'ADV-BARK-02', trigger: 'prestige_prompt', text: "Reset again. I dare you. I'm keeping the receipts." },
    { id: 'ADV-BARK-03', trigger: 'enter_void', text: "Careful. Mirrors are contagious." },
    { id: 'ADV-BARK-04', trigger: 'casino_enter', text: "Fate is a contractor. I'm in-house." },
    { id: 'ADV-BARK-05', trigger: 'buy_seraph', text: "Automate worship, then wonder why it feels hollow." },

    // Context barks (20 lines)
    { id: 'ADV-L-01', trigger: 'idle_60s', text: "You're very quiet for someone with infinite responsibility." },
    { id: 'ADV-L-02', trigger: 'open_settings', text: "Changing the theme won't change the truth." },
    { id: 'ADV-L-03', trigger: 'toggle_music', text: "Mute it if you want. The system will still hum." },
    { id: 'ADV-L-04', trigger: 'achievement_unlocked', text: "You collect badges the way mortals collect prayers. Both are coping." },
    { id: 'ADV-L-05', trigger: 'warning_popup', text: "That's Sector 7G coughing. Stop calling it a feature." },
    { id: 'ADV-L-06', trigger: 'void_upgrade_bought', text: "You're feeding the reflection. It eats politely." },
    { id: 'ADV-L-07', trigger: 'praise_spike_event', text: "Attention is cheap. Consequence is not." },
    { id: 'ADV-L-08', trigger: 'offerings_spent_large', text: "You spend devotion like it can't run out. It can." },
    { id: 'ADV-L-09', trigger: 'souls_threshold', text: "Count them if you must. Just don't pretend the number makes you clean." },
    { id: 'ADV-L-10', trigger: 'prestige_count_6', text: "Another branch, another grave. You're building a cemetery with good UI." },
    { id: 'ADV-L-11', trigger: 'prestige_count_8', text: "CMS calls it 'fresh start.' I call it 'lossy compression.'" },
    { id: 'ADV-L-12', trigger: 'taskmgr_end_process_attempt', text: "End it. Watch what leaks out. I'll be here to say 'I told you so.'" },
    { id: 'ADV-L-13', trigger: 'open_recycle_bin', text: "There it is. Your patch. Your excuse. Your mirror." },
    { id: 'ADV-L-14', trigger: 'hover_patch_file', text: "PATCH_NULL_RESTORE.pkg — size: 0 bytes. Impact: immeasurable." },
    { id: 'ADV-L-15', trigger: 'casino_win_streak_5', text: "Fate is flirting. Don't mistake it for love." },
    { id: 'ADV-L-16', trigger: 'casino_lose_streak_5', text: "Luck is teaching you humility with a hammer." },
    { id: 'ADV-L-17', trigger: 'open_docs_folder', text: "Read the paperwork. It's the only place truth is allowed to be blunt." },
    { id: 'ADV-L-18', trigger: 'seraph_self_awareness_event', text: "When your machines start asking 'why,' remember: you taught them to." },
    { id: 'ADV-L-19', trigger: 'void_depth_50', text: "Deep enough and you'll see where your branches intersect. It's ugly." },
    { id: 'ADV-L-20', trigger: 'attempt_resign', text: "You can't leave. You can only change what leaving means." }
];
```

**Achievement Definitions:** (See full list in `/docs/CosmOS_Content_Pack/achievements/Achievements.json`)

```javascript
const AchievementList = [
    // BRONZE (12 achievements)
    { id: 'ACH-001', name: 'First Light', tier: 'Bronze', condition: () => State.totalStats.praiseGained >= 1,
      reward: () => { State.achievementBonuses.praiseGain = (State.achievementBonuses.praiseGain || 1) * 1.005; },
      flavor: 'A universe begins with attention.' },
    { id: 'ACH-002', name: 'Heard (Once)', tier: 'Bronze', condition: () => State.achievementProgress.praise_clicks >= 100,
      reward: () => { State.clickPower *= 1.01; }, flavor: 'The first prayer is a test ping.' },
    { id: 'ACH-003', name: 'Offerings Accepted', tier: 'Bronze', condition: () => State.totalStats.offeringsGained >= 10,
      reward: () => { State.achievementBonuses.offeringValue = 1.01; }, flavor: 'The altar has a receipt printer.' },
    { id: 'ACH-004', name: 'Soul Inventory', tier: 'Bronze', condition: () => State.totalStats.soulsGained >= 1,
      reward: () => { State.achievementBonuses.soulGain = 1.01; }, flavor: 'New item acquired: conscience (optional).' },
    { id: 'ACH-005', name: 'Junior Operator', tier: 'Bronze', condition: () => State.runtime.totalMinutes >= 30,
      reward: () => { /* Unlock cosmetic badge */ }, flavor: "You've been here long enough to be blamed." },
    { id: 'ACH-006', name: 'Blessed Update', tier: 'Bronze', condition: () => State.achievementProgress.buy_mandate_count >= 1,
      reward: () => { State.achievementBonuses.mandateEfficiency = 1.01; }, flavor: 'A patch is just a prayer with paperwork.' },
    { id: 'ACH-007', name: 'Department Approved', tier: 'Bronze', condition: () => State.achievementProgress.buy_seraph_count >= 1,
      reward: () => { game.unlockDocument('DOC-NEW-07'); }, flavor: "Automation is divinity's love language." },
    { id: 'ACH-008', name: 'Cherub Pilot', tier: 'Bronze', condition: () => State.achievementProgress.buy_cherub_count >= 1,
      reward: () => { State.achievementBonuses.automationSpeed = 1.01; }, flavor: 'Tiny hands, big consequences.' },
    { id: 'ACH-009', name: 'First Defragment', tier: 'Bronze', condition: () => State.achievementProgress.use_divine_intervention >= 1,
      reward: () => { State.skills.divineIntervention.cooldown *= 0.99; }, flavor: 'Miracles: now with less latency.' },
    { id: 'ACH-010', name: 'Temporal Glitch', tier: 'Bronze', condition: () => State.achievementProgress.use_temporal_rift >= 1,
      reward: () => { State.skills.temporalRift.duration *= 1.01; }, flavor: 'Time looked away. You moved.' },
    { id: 'ACH-011', name: 'Do Not Touch', tier: 'Bronze', condition: () => State.achievementProgress.open_taskmgr >= 1,
      reward: null, flavor: 'Curiosity is a process leak.' },
    { id: 'ACH-012', name: 'Void Tourist', tier: 'Bronze', condition: () => State.achievementProgress.enter_void >= 1,
      reward: () => { State.achievementBonuses.voidGain = 1.01; }, flavor: 'The mirror smiled first.' },

    // SILVER (10 achievements)
    { id: 'ACH-013', name: 'Praise Economy', tier: 'Silver', condition: () => State.totalStats.praiseGained >= 1e6,
      reward: () => { State.achievementBonuses.praiseGain *= 1.02; }, flavor: 'Scale turns devotion into currency.' },
    { id: 'ACH-014', name: 'Ritual Regular', tier: 'Silver', condition: () => State.achievementProgress.daily_login_streak >= 7,
      reward: () => { /* +2% all gains for 24h */ }, flavor: 'Habit is the most reliable faith.' },
    { id: 'ACH-015', name: 'Angel Factory', tier: 'Silver', condition: () => State.achievementProgress.buy_seraph_count >= 25,
      reward: () => { State.achievementBonuses.automationSpeed *= 1.03; }, flavor: 'Batch-produced holiness.' },
    { id: 'ACH-016', name: 'Mandate Collector', tier: 'Silver', condition: () => State.achievementProgress.buy_mandate_count >= 10,
      reward: () => { State.achievementBonuses.mandateEfficiency *= 1.03; }, flavor: 'Rules are easier than wisdom.' },
    { id: 'ACH-017', name: 'Void Navigator', tier: 'Silver', condition: () => State.achievementProgress.void_depth_reached >= 25,
      reward: () => { State.achievementBonuses.voidStability = 1.03; }, flavor: 'You stopped flinching.' },
    { id: 'ACH-018', name: 'Paperwork Deity', tier: 'Silver', condition: () => State.documents.collected.length >= 10,
      reward: () => { game.unlockDocument('DOC-NEW-15'); }, flavor: 'Divinity, filed alphabetically.' },
    { id: 'ACH-019', name: 'Reroll Reality', tier: 'Silver', condition: () => State.achievementProgress.prestige_count >= 1,
      reward: () => { State.achievementBonuses.startingResources = 1.02; }, flavor: 'You pressed reset with both hands.' },
    { id: 'ACH-020', name: 'Branching Out', tier: 'Silver', condition: () => State.achievementProgress.prestige_count >= 3,
      reward: () => { game.unlockDocument('DOC-NEW-13'); }, flavor: 'Your past keeps happening elsewhere.' },
    { id: 'ACH-021', name: 'Luck Auditor', tier: 'Silver', condition: () => State.casino.gamesPlayed >= 200,
      reward: () => { State.achievementBonuses.fateTokenGain = 1.05; }, flavor: 'Probability now files reports on you.' },
    { id: 'ACH-022', name: 'Edge Case', tier: 'Silver', condition: () => State.achievementProgress.trigger_any_warning >= 10,
      reward: () => { /* Unlock cosmetic: "Caution Stripe" */ }, flavor: 'Reality is held together by assumptions.' },

    // GOLD (8 achievements)
    { id: 'ACH-023', name: 'Million Names', tier: 'Gold', condition: () => State.achievementProgress.mortals_created_total >= 1e6,
      reward: () => { State.achievementBonuses.praiseGain *= 1.05; }, flavor: 'Someone is always saying your name.' },
    { id: 'ACH-024', name: 'Soul Ledger', tier: 'Gold', condition: () => State.totalStats.soulsGained >= 1e5,
      reward: () => { State.achievementBonuses.soulGain *= 1.05; }, flavor: 'Your inventory weighs a little more.' },
    { id: 'ACH-025', name: 'Void Artisan', tier: 'Gold', condition: () => State.achievementProgress.void_upgrades_bought >= 15,
      reward: () => { State.achievementBonuses.voidGain *= 1.05; }, flavor: 'You learned to shape absence.' },
    { id: 'ACH-026', name: 'Not My First Cosmos', tier: 'Gold', condition: () => State.achievementProgress.prestige_count >= 5,
      reward: () => { State.achievementBonuses.startingResources *= 1.05; }, flavor: 'You reboot like it\'s a habit.' },
    { id: 'ACH-027', name: 'Process Whisperer', tier: 'Gold', condition: () => State.achievementProgress.taskmgr_actions >= 50,
      reward: () => { State.achievementBonuses.automationSpeed *= 1.03; }, flavor: 'You speak fluent machine-prayer.' },
    { id: 'ACH-028', name: 'Dimensional Portfolio', tier: 'Gold', condition: () => State.achievementProgress.dimensions_unlocked >= 4,
      reward: () => { State.achievementBonuses.globalGain = 1.05; }, flavor: 'Diversify your realities.' },
    { id: 'ACH-029', name: 'Cosmic Defrag (Prep)', tier: 'Gold', condition: () => State.achievementProgress.prestige_count >= 7,
      reward: () => { /* Unlock prestige teaser */ }, flavor: 'Your fragments are learning to align.' },
    { id: 'ACH-030', name: 'Archive Diver', tier: 'Gold', condition: () => State.achievementProgress.view_archived_branch >= 1,
      reward: () => { game.unlockDocument('DOC-NEW-13'); }, flavor: 'You visited a world you left behind.' },

    // PLATINUM (2 achievements)
    { id: 'ACH-031', name: 'Operator of Record', tier: 'Platinum', condition: () => State.achievementProgress.prestige_count >= 10,
      reward: () => { State.achievementBonuses.startingResources *= 1.10; }, flavor: 'Your signature is on every reboot.' },
    { id: 'ACH-032', name: 'Stability Engineer', tier: 'Platinum', condition: () => State.achievementProgress.stability_metric >= 0.95,
      reward: () => { State.achievementBonuses.globalGain *= 1.10; }, flavor: "You made a gentle universe. It's suspicious." },

    // SECRET (8 achievements)
    { id: 'ACH-S-001', name: 'I Can Fix Her', tier: 'Secret', condition: () => State.achievementProgress.attempt_repair_sector7g >= 1,
      reward: () => { game.unlockDocument('DOC-NEW-03'); }, flavor: 'You cannot.' },
    { id: 'ACH-S-002', name: 'House Edge', tier: 'Secret', condition: () => State.casino.bestWinStreak >= 10,
      reward: () => { /* Bonus: Fate Tokens +10% for 1h */ }, flavor: 'Fate noticed. Fate smiled.' },
    { id: 'ACH-S-003', name: 'Nihilist (Trial)', tier: 'Secret', condition: () => State.achievementProgress.delete_achievement_from_recyclebin >= 1,
      reward: () => { /* Cosmetic title: "Meaningless" */ }, flavor: 'You looked at meaning and clicked Remove.' },
    { id: 'ACH-S-004', name: 'The Exit That Isn\'t', tier: 'Secret', condition: () => State.achievementProgress.discover_resign_command >= 1,
      reward: () => { game.unlockDocument('DOC-NEW-02'); }, flavor: 'Button not found. Keep working.' },
    { id: 'ACH-S-005', name: 'Mirror Login', tier: 'Secret', condition: () => State.adversary.contacted,
      reward: () => { /* Unlock Adversary scene replay */ }, flavor: 'You typed your own name. It answered.' },
    { id: 'ACH-S-006', name: 'Checksum Lullaby', tier: 'Secret', condition: () => State.achievementProgress.hear_hidden_boot_line >= 1,
      reward: () => { /* Unlock rare boot voice line */ }, flavor: 'The BIOS hummed your obituary.' },
    { id: 'ACH-S-007', name: 'Employee of the Eon', tier: 'Secret', condition: () => State.achievementProgress.open_cms_hr_portal >= 1,
      reward: () => { game.unlockDocument('DOC-NEW-01'); }, flavor: 'Your benefits include existential dread.' },
    { id: 'ACH-S-008', name: 'Lucky Actually', tier: 'Secret', condition: () => State.casino.worstLoseStreak >= 15,
      reward: () => { /* Unlock Host pity line set */ }, flavor: 'Bad luck also keeps records.' }
];
```

---

## Task Manager Process List

```javascript
const TaskManagerProcesses = [
    { name: 'cosmos.exe', cpu: 12, mem: 45, status: 'Running', critical: true, desc: 'Main reality interface', endable: false },
    { name: 'praise_collector.service', cpu: 8, mem: 12, status: 'Running', critical: false, desc: 'Praise harvesting daemon', endable: true, onEnd: () => { State.pps *= 0.5; ui.log('[WARN] Praise collection halved.'); } },
    { name: 'seraph_automation.exe', cpu: 15, mem: 23, status: 'Running', critical: false, desc: 'Automaton orchestration', endable: true, onEnd: () => { State.automatons.seraph.count = 0; } },
    { name: 'void_mirror.service', cpu: 3, mem: 7, status: 'Running', critical: false, desc: 'Reflection consistency daemon', endable: true,
      onEnd: () => {
          ui.log('[ERROR] Mirror service terminated. Identity drift detected.');
          State.achievementProgress.trigger_any_warning++;
          game.triggerAdversaryBark('taskmgr_end_process_attempt');
      }
    },
    { name: 'sector7g_indexer.exe', cpu: 1, mem: 4, status: 'Not Responding', critical: true, desc: 'Causal address indexer (CORRUPTED)', endable: false,
      onAttempt: () => {
          ui.log('[BLOCKED] Cannot end process. Index Layer protection active.');
          game.unlockDocument('DOC-NEW-03');
          State.achievementProgress.attempt_repair_sector7g++;
      }
    },
    { name: 'watcher.whisperd', cpu: 0, mem: 2, status: 'Idle', critical: false, desc: 'Compliance monitoring (legacy)', endable: false,
      onAttempt: () => {
          ui.log('[INFO] Process protected by external authority.');
          game.unlockDocument('DOC-NEW-09');
      }
    },
    { name: 'fate_rng.dll', cpu: 2, mem: 5, status: 'Running', critical: false, desc: 'Probability administration', endable: true, onEnd: () => { State.casino.hostDialogue.lastBarkId = 'CAS-HOST-064'; ui.log('The Host notices: "Did you just... neuter Fate? Bold."'); } },
    { name: 'cms_hr_portal.service', cpu: 1, mem: 3, status: 'Running', critical: false, desc: 'Bureaucracy backend', endable: false,
      onClick: () => {
          State.achievementProgress.open_cms_hr_portal++;
          game.unlockDocument('DOC-NEW-01');
      }
    },
    { name: 'divine_reboot.pending', cpu: 0, mem: 1, status: 'Suspended', critical: false, desc: 'Branch compilation queue', endable: false },
    { name: 'mortal.consciousness[cluster]', cpu: 22, mem: 34, status: 'Running', critical: false, desc: 'Simulated awareness pool', endable: true, onEnd: () => { ui.log('[ETHICAL VIOLATION] You just turned off free will. CMS will hear about this.'); State.achievementProgress.trigger_any_warning++; } },
    { name: 'boot_narrator.voice', cpu: 1, mem: 2, status: 'Idle', critical: false, desc: 'Boot sequence VO', endable: false,
      onClick: () => {
          const rare = Math.random() < 0.05;
          if (rare) {
              ui.log('[HIDDEN LINE] "Operator... do you know what you are operating?"');
              State.achievementProgress.hear_hidden_boot_line = true;
          }
      }
    },
    { name: 'achievement_tracker.sys', cpu: 1, mem: 3, status: 'Running', critical: false, desc: 'Progress monitoring', endable: false }
];
```

---

## Implementation Phases

### **Phase 1: Core State & Data (4-6 hours)**

**Files:** `js/state.js`

1. Add all new state structures (casino, adversary, taskManager, recycleBin, documents, achievementProgress, runtime)
2. Update deep merge logic in `State.load()`
3. Add data definitions:
   - `CasinoHostBarks` (80 lines)
   - `AdversaryScene` (dialogue tree)
   - `AdversaryBarks` (25 lines)
   - `AchievementList` (40 achievements)
   - `TaskManagerProcesses` (12 processes)
4. Test save/load persistence

**Verification:**
- Save game → reload → verify all new properties persist
- Check console for merge errors

---

### **Phase 2: Documents System (3-4 hours)**

**Files:** `js/game.js`, `js/ui.js`, `js/system.js`

1. **In `game.js`:**
   - Add `unlockDocument(docId)` function
   - Add document unlock condition checking in game loop
   - Load document content from `/docs/CosmOS_Content_Pack/docs/`

2. **In `ui.js`:**
   - Create document viewer UI (categorized list + reader)
   - Add document notification system

3. **In `system.js`:**
   - Update 'notepad' app config to show collected documents
   - Add category tabs (HR, Legal, Logs, Incident, etc.)

4. **Unlock first documents:**
   - DOC-NEW-06 (Training/Onboarding) - unlocks on first launch

**Verification:**
- Open notepad → see categorized document list
- Trigger unlock condition → document appears with notification
- Read document → content displays correctly

---

### **Phase 3: Achievement System (4-5 hours)**

**Files:** `js/game.js`, `js/ui.js`

1. **In `game.js`:**
   - Add `checkAchievements()` function (called every second in loop)
   - Add `unlockAchievement(achId)` function
   - Apply achievement rewards (bonuses, document unlocks)
   - Track achievement progress counters

2. **In `ui.js`:**
   - Create achievement panel in Settings window
   - Display tiers (Bronze/Silver/Gold/Platinum/Secret)
   - Show locked vs unlocked with flavor text
   - Add achievement notification popup

3. **Hook progress trackers:**
   - Praise clicks: increment on manual click
   - Prestige count: increment on Divine Reboot
   - Runtime: track in game loop
   - All other counters throughout game actions

**Verification:**
- Trigger achievement condition → notification appears
- Check Settings → achievement unlocked with reward applied
- Save/load → achievements persist

---

### **Phase 4: Task Manager (5-6 hours)**

**Files:** `js/system.js`, `js/ui.js`, `js/game.js`, `style.css`

1. **Window Config (`system.js`):**
   - Create `taskmgr` app with process list table
   - CPU/Memory columns with updating values
   - Status indicators
   - "End Process" buttons

2. **UI Functions (`ui.js`):**
   - `updateTaskManagerList()` - refresh process display
   - `endProcess(processName)` - handle termination
   - Handle blocked processes (sector7g, watcher)
   - Show warnings/easter eggs

3. **Game Logic (`game.js`):**
   - Add `taskManager.endProcess(name)` function
   - Trigger process callbacks (onEnd, onAttempt, onClick)
   - Unlock documents via Task Manager interactions

4. **Styling (`style.css`):**
   - Process list table styling
   - Status colors (Running=green, Not Responding=red, Idle=gray)
   - Critical process highlighting

**Verification:**
- Open Task Manager → see 12 processes
- End non-critical process → effect applies
- Try to end sector7g → blocked, document unlocks
- Click watcher.whisperd → document unlocks

---

### **Phase 5: Recycle Bin (4-5 hours)**

**Files:** `js/system.js`, `js/ui.js`, `js/game.js`

1. **Window Config (`system.js`):**
   - Create `recyclebin` app with item list
   - Show item name, size, type, description
   - "Delete Permanently" and "Execute" buttons (for patch)

2. **Item Management (`game.js`):**
   - `addToRecycleBin(item)` function
   - Resource sacrifice mechanic (delete resources for bonuses)
   - Achievement deletion easter egg
   - Patch execution (Adversary content)

3. **UI (`ui.js`):**
   - Display recycle bin contents
   - Show sacrifice value preview
   - Confirmation dialogs for permanent actions

**Verification:**
- After Adversary scene → patch appears in bin
- Right-click achievement → "Send to Recycle Bin" option appears
- Delete resource item → receive sacrifice bonus

---

### **Phase 6: Casino Host Bark Engine (5-6 hours)**

**Files:** `js/game.js`, `js/ui.js`

1. **Bark System (`game.js`):**
   - `selectHostBark(trigger, context)` function
   - Weighted random selection
   - Cooldown enforcement (per-bark + global)
   - Rare whisper chance (1% for lore whispers)

2. **Trigger Integration:**
   - `casino_enter` → greeting barks
   - `casino_first_visit` → intro barks (one-time)
   - `casino_win_small/big` → reaction barks
   - `casino_lose_small/big` → reaction barks
   - `casino_win_streak` → streak commentary (5+, 10+)
   - `casino_lose_streak` → pity system (15 = free chips)
   - `casino_idle_30s` → idle prompts
   - `casino_exit` → farewell barks

3. **Display (`ui.js`):**
   - Host dialogue box in casino UI
   - Whisper styling for lore lines
   - Typing animation for immersion

**Verification:**
- Enter casino → random greeting
- Win 5 times → streak bark
- Lose 15 times → pity chip + special bark
- Idle 30s → idle bark
- Stay long enough → hear rare whisper (1% chance)

---

### **Phase 7: Adversary Scene Engine (6-8 hours)**

**Files:** `js/game.js`, `js/ui.js`, `js/system.js`

1. **Scene Manager (`game.js`):**
   - `checkAdversaryTrigger()` - condition checking
   - `playAdversaryScene()` - dialogue sequence
   - Handle player choices (3-branch system)
   - Apply scene completion effects

2. **Dialogue Display (`ui.js`):**
   - Full-screen overlay modal
   - Speaker labels (SYS, ADV, HOST)
   - Text typewriter effect
   - Choice buttons (DENY / ASK / ACCEPT)
   - Different styling for system vs voice lines

3. **Integration:**
   - Trigger check in game loop (prestige >= 5, void depth >= 25)
   - Preferred trigger moments (void exit, taskmgr open)
   - Unlock documents post-scene (DOC-NEW-14, DOC-NEW-11)
   - Add patch to Recycle Bin

4. **Adversary Barks:**
   - Trigger barks after scene completion
   - Context-specific (open_taskmgr, prestige_prompt, etc.)
   - Integrate with existing game events

**Verification:**
- Meet conditions → scene triggers
- Read through scene → dialogue advances correctly
- Make choice → relationship flag set
- Scene ends → patch in Recycle Bin, documents unlock
- Later actions → Adversary barks appear

---

### **Phase 8: Casino Mini-Games (8-10 hours)**

**Substeps:** 8A (Solitaire), 8B (Slots), 8C (Plinko)

#### **8A: Solitaire (4 hours)**

1. **Game Logic:**
   - 7 tableau columns, 4 foundations
   - Standard Klondike rules
   - Draw pile (3-card draw)
   - Win condition detection

2. **UI:**
   - Card rendering (canvas or divs)
   - Drag-and-drop
   - Auto-complete when possible
   - Timer display

3. **Betting:**
   - Ante: 10-100 Fate Tokens
   - Win: 2x ante
   - Lose: lose ante
   - Track wins/losses for achievements

#### **8B: Slots (3 hours)**

1. **Game Logic:**
   - 3 reels, 5 symbols each
   - Spin animation
   - Payout table (3-match, 2-match)
   - Jackpot chance (0.5%)

2. **UI:**
   - Reel display
   - Spin button
   - Bet amount selector
   - Payout display

3. **Betting:**
   - Bet: 5-50 Fate Tokens
   - Payouts: 2x (2-match), 10x (3-match), 100x (jackpot)

#### **8C: Plinko (3 hours)**

1. **Game Logic:**
   - Ball drops from top
   - Physics simulation (bounce on pegs)
   - 9 slots at bottom (multipliers: 0x, 0.5x, 1x, 2x, 5x, 2x, 1x, 0.5x, 0x)

2. **UI:**
   - Canvas rendering (pegs + ball)
   - Drop animation
   - Result highlighting

3. **Betting:**
   - Bet: 10-100 Fate Tokens
   - Payout: bet × slot multiplier

**Verification (All Games):**
- Play each game → mechanics work
- Win/lose → Fate Tokens update correctly
- Trigger Host barks on outcomes
- Track stats for achievements

---

### **Phase 9: Casino Integration & Polish (4-5 hours)**

**Files:** `js/system.js`, `style.css`, `index.html`

1. **Window Config (`system.js`):**
   - Create `casino` app window
   - Tabbed interface (Solitaire / Slots / Plinko)
   - Host dialogue section
   - Fate Token display

2. **Unlock System:**
   - Casino unlocks at prestige 3 OR void depth 15
   - Solitaire: available immediately
   - Slots: unlock with achievement or 500 Fate Tokens
   - Plinko: unlock with achievement or 1000 Fate Tokens

3. **Desktop Icon (`index.html`):**
   - Add casino icon to desktop
   - Show/hide based on unlock

4. **Styling (`style.css`):**
   - Casino window theme (dark, neon accents)
   - Card styling for Solitaire
   - Slot machine visuals
   - Plinko board aesthetics
   - Host dialogue box styling

**Verification:**
- Unlock casino → icon appears
- Open casino → tabs work
- Play games → Host reacts with barks
- UI looks polished

---

### **Phase 10: Testing & Balancing (6-8 hours)**

1. **System Integration Testing:**
   - Adversary scene → patch in Recycle Bin → execute patch
   - Task Manager → end processes → effects apply
   - Casino → play games → earn Fate Tokens → unlock mini-games
   - Achievements → unlock → rewards apply
   - Documents → unlock via various triggers → all appear

2. **Balance Tuning:**
   - Fate Token earn rates (should feel rewarding but not trivial)
   - Achievement thresholds (Bronze should come naturally, Platinum should be rare)
   - Host bark cooldowns (shouldn't spam, but should feel responsive)
   - Casino game odds (house edge ~10-20%)

3. **Bug Fixes:**
   - Save/load edge cases
   - Race conditions in triggers
   - UI overflow issues
   - Bark selection edge cases

4. **Content Verification:**
   - All 80 Host barks can appear
   - All 25 Adversary barks can trigger
   - All 40 achievements can unlock
   - All 15 documents can be collected

**Verification Checklist:**
- [ ] All achievements unlockable
- [ ] All documents unlockable
- [ ] Adversary scene completes properly
- [ ] All 3 casino games playable and fun
- [ ] Task Manager interactions work
- [ ] Recycle Bin mechanics work
- [ ] No console errors
- [ ] Save/load preserves all new data
- [ ] Performance is acceptable

---

## Implementation Order Summary

1. **Foundation** (Phase 1): State structures + data definitions
2. **Content Unlock** (Phases 2-3): Documents + Achievements
3. **Desktop Apps** (Phases 4-5): Task Manager + Recycle Bin
4. **Narrative** (Phases 6-7): Host barks + Adversary scene
5. **Mini-Games** (Phase 8): Solitaire, Slots, Plinko
6. **Polish** (Phases 9-10): Integration + testing

**Estimated Total Time: 50-65 hours**

**Critical Path:**
Phase 1 → Phase 2 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10

**Parallel Work Possible:**
- Phases 3, 4, 5 can be done in any order after Phase 1
- Phase 8 substeps (8A, 8B, 8C) are independent

---

## File Reference Summary

### Files to Modify:
- [js/state.js](js/state.js) - State structures, data definitions, deep merge
- [js/game.js](js/game.js) - Game logic, achievements, barks, scenes, mini-games
- [js/ui.js](js/ui.js) - All UI rendering and display updates
- [js/system.js](js/system.js) - Window configs for all new apps
- [style.css](style.css) - Styling for casino, task manager, documents, etc.
- [index.html](index.html) - Desktop icons for new apps

### External Data Sources:
- `/docs/CosmOS_Content_Pack/` - All content data (copy into state.js as constants)

---

## Next Steps

**Ready to begin implementation?** Recommend starting with Phase 1 to lay the foundation, then proceeding in order through phases 2-10.

**Questions to resolve before coding:**
1. Should the Adversary patch execution be a one-time permanent effect, or should it have ongoing consequences?
2. What should the patch actually DO when executed? (This is narrative-critical but not defined in content pack)
3. Casino unlock timing: Prestige 3, Void 15, or Achievement-gated?
4. Should Fate Tokens persist through Divine Reboot, or reset?

**Content complete. Ready for your input before implementation begins.**
