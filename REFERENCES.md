# CosmOS: References & Technical Documentation

Code patterns, game design references, and architectural notes for implementation.

---

## 📚 Game Design References

### Idle/Incremental Games to Study

#### **Cookie Clicker** (Orteil)
- **URL**: https://orteil.dashnet.org/cookieclicker/
- **Study for**:
  - Upgrade tier progression (cursor → grandma → farm → factory...)
  - Big number handling (custom notation system)
  - Prestige system ("Ascension" mechanic)
  - Golden cookie active gameplay layer
  - Minigame integration (stock market, garden, pantheon)
- **Mechanics to reference**:
  - "Buildings" produce automatically but scale exponentially
  - "Upgrades" provide multipliers (stacking mechanics)
  - "Achievements" as meta-progression
  - Offline production capping

#### **Universal Paperclips** (Frank Lantz)
- **URL**: https://www.decisionproblem.com/paperclips/
- **Study for**:
  - Three-act structure (paperclips → market dominance → cosmic scale)
  - Resource scarcity → abundance arc
  - UI that evolves as game progresses
  - Narrative through mechanics (no explicit story, but implied)
  - Strategic depth (balancing price, marketing, manufacturing)
- **Mechanics to reference**:
  - Projects (unique unlocks that cost resources)
  - Operations/creativity as separate "action currencies"
  - Phase transitions (complete paradigm shifts in gameplay)

#### **A Dark Room** (Doublespeak Games)
- **URL**: https://adarkroom.doublespeakgames.com/
- **Study for**:
  - Minimalist UI that reveals complexity slowly
  - Environmental storytelling through sparse text
  - Multiple interconnected systems (village, exploration, combat)
  - Mystery and discovery pacing
- **Mechanics to reference**:
  - Temperature bar (simple goal becomes complex resource)
  - Builder automation with population limits
  - Map exploration with random events
  - Prestige-like "new game+" mode

#### **Kittens Game** (bloodrizer)
- **URL**: https://kittensgame.com/
- **Study for**:
  - Deep interconnected resource chains
  - Multiple prestige layers (paragon, metaphysics)
  - Seasonal mechanics (years, cycles)
  - Religion/science parallel progression paths
  - Complex formulas for production chains
- **Mechanics to reference**:
  - Resource caps and storage upgrades
  - Seasonal production modifiers
  - Achievement rewards that affect gameplay
  - "Challenges" mode with rule modifiers

#### **Antimatter Dimensions** (Hevipelle)
- **URL**: https://ivark.github.io/
- **Study for**:
  - Multi-layered prestige (9+ prestige layers)
  - Exponential scaling that stays engaging
  - Dimensional recursion (dimensions buy dimensions)
  - Breaking infinity mechanics
- **Mechanics to reference**:
  - Dimension tiers that purchase each other
  - Infinity points as first prestige currency
  - Eternity points as second prestige currency
  - Time studies (massive skill tree)

#### **Spaceplan** (Jake Hollands)
- **URL**: https://jhollands.co.uk/spaceplan/
- **Study for**:
  - Strong aesthetic identity (ASCII + narrative)
  - Finite game with satisfying conclusion
  - Humor through item descriptions
  - Music and sound integration
- **Mechanics to reference**:
  - Wattage as core resource
  - Timed exploration events
  - Story-driven progression gates
  - Narrative payoff for grinding

---

## 💻 Code Patterns & Snippets

### Game Loop Architecture

#### **RequestAnimationFrame Loop** (Current Implementation)
```javascript
let lastTimestamp = 0;
const TICK_RATE = 1000 / 60; // 60 ticks per second

function gameLoop(timestamp) {
    const deltaTime = timestamp - lastTimestamp;

    if (deltaTime >= TICK_RATE) {
        // Update game state
        updateResources(deltaTime);
        updateUI();

        lastTimestamp = timestamp - (deltaTime % TICK_RATE);
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
```

**Pros**: Smooth, browser-optimized, pauses when tab inactive
**Cons**: Complexity with deltaTime handling

#### **SetInterval Loop** (Alternative)
```javascript
const TICK_RATE = 1000 / 60; // 60 FPS

setInterval(() => {
    updateResources(TICK_RATE);
    updateUI();
}, TICK_RATE);
```

**Pros**: Simple, predictable timing
**Cons**: Runs in background (battery drain), less smooth

**Recommendation**: Stick with rAF for main loop, use setInterval for autosave

---

### Big Number Handling

#### **Suffix Notation Function**
```javascript
const SUFFIXES = [
    '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
    'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'
];

function formatNumber(num) {
    if (num < 1000) return num.toFixed(2);

    const exp = Math.floor(Math.log10(num) / 3);
    const suffix = SUFFIXES[exp] || `e${exp * 3}`;
    const mantissa = num / Math.pow(1000, exp);

    return `${mantissa.toFixed(2)}${suffix}`;
}

// Usage
console.log(formatNumber(1234));        // "1.23K"
console.log(formatNumber(1234567));     // "1.23M"
console.log(formatNumber(1.23e15));     // "1.23Qa"
```

#### **Break Infinity Library** (For truly huge numbers)
```javascript
// If numbers exceed e308 (Number.MAX_VALUE), use break_infinity.js
// https://github.com/Patashu/break_infinity.js

import Decimal from 'break_infinity.js';

let praise = new Decimal(10);
praise = praise.times(1.5);  // Multiplication
praise = praise.plus(100);   // Addition
console.log(praise.toString()); // Handles e308+ numbers
```

**When to use**: Only if you expect numbers beyond 10^308 (late late game)

---

### State Management & Persistence

#### **Deep Clone State** (Before Save)
```javascript
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function saveGame() {
    const saveData = deepClone(gameState);
    localStorage.setItem('cosmOS_save', JSON.stringify(saveData));
    console.log('Game saved!');
}
```

#### **Save Compression** (For large save files)
```javascript
// Use shorter keys to reduce save size
function compressSave(state) {
    return {
        p: state.praise,           // p instead of praise
        o: state.offerings,        // o instead of offerings
        s: state.souls,            // s instead of souls
        a: state.automatons.map(a => ({
            c: a.count,            // c instead of count
            l: a.level            // l instead of level
        }))
    };
}

function decompressSave(data) {
    return {
        praise: data.p || 0,
        offerings: data.o || 0,
        souls: data.s || 0,
        automatons: (data.a || []).map(a => ({
            count: a.c || 0,
            level: a.l || 1
        }))
    };
}
```

#### **Save Migration** (Handle version changes)
```javascript
const SAVE_VERSION = 2;

function loadGame() {
    const saveString = localStorage.getItem('cosmOS_save');
    if (!saveString) return getDefaultState();

    const saveData = JSON.parse(saveString);

    // Migrate old saves
    if (!saveData.version || saveData.version < SAVE_VERSION) {
        return migrateSave(saveData);
    }

    return saveData;
}

function migrateSave(oldSave) {
    const migrated = { ...oldSave, version: SAVE_VERSION };

    // V1 → V2: Added divinity points
    if (oldSave.version < 2) {
        migrated.divinityPoints = 0;
    }

    return migrated;
}
```

---

### Resource Production Calculation

#### **Exponential Growth Formula**
```javascript
// Cost scaling: Each purchase costs more
function calculateCost(basePrice, owned, growthRate = 1.15) {
    return Math.floor(basePrice * Math.pow(growthRate, owned));
}

// Example
const firstAutomatonCost = calculateCost(10, 0);    // 10
const secondCost = calculateCost(10, 1);            // 11
const tenthCost = calculateCost(10, 9);             // 35
```

#### **Production Per Second**
```javascript
function calculatePraisePerSecond(state) {
    let pps = 0;

    // Base from automatons
    state.automatons.forEach(automaton => {
        pps += automaton.count * automaton.baseProduction;
    });

    // Apply multipliers from upgrades
    state.upgrades.forEach(upgrade => {
        if (upgrade.owned && upgrade.type === 'multiplier') {
            pps *= upgrade.value;
        }
    });

    // Apply prestige bonuses
    pps *= (1 + state.divinityPoints * 0.01); // +1% per DP

    return pps;
}
```

#### **Offline Progress Calculation**
```javascript
function calculateOfflineProgress(lastPlayTime, currentTime, productionRate) {
    const timeAway = (currentTime - lastPlayTime) / 1000; // seconds

    let offlineGain = 0;

    if (timeAway < 3600) {
        // First hour: 100% production
        offlineGain = productionRate * timeAway;
    } else if (timeAway < 43200) {
        // Hours 1-12: 75% production
        offlineGain = productionRate * 3600; // Full first hour
        offlineGain += productionRate * (timeAway - 3600) * 0.75;
    } else {
        // 12+ hours: 50% production
        offlineGain = productionRate * 3600; // First hour
        offlineGain += productionRate * (43200 - 3600) * 0.75; // Hours 1-12
        offlineGain += productionRate * (timeAway - 43200) * 0.5; // 12+
    }

    return offlineGain;
}
```

---

### Prestige Calculation

#### **Prestige Currency Formula**
```javascript
// How much prestige currency to award
function calculatePrestigeGain(totalSoulsEarned) {
    // Formula: DP = sqrt(souls / 1000000)
    // This creates a curve: need exponentially more souls for linear DP

    const divinityPoints = Math.floor(Math.sqrt(totalSoulsEarned / 1000000));
    return divinityPoints;
}

// Examples
calculatePrestigeGain(1000000);      // 1 DP
calculatePrestigeGain(4000000);      // 2 DP
calculatePrestigeGain(9000000);      // 3 DP
calculatePrestigeGain(100000000);    // 10 DP
```

#### **Prestige Multiplier**
```javascript
function getPrestigeMultiplier(divinityPoints) {
    // Each DP gives 1% boost
    return 1 + (divinityPoints * 0.01);
}

// With 50 DP: 1.5x multiplier (50% boost)
// With 100 DP: 2x multiplier (100% boost)
```

---

### Upgrade System Architecture

#### **Upgrade Object Structure**
```javascript
const upgrades = [
    {
        id: 'praiseMulti1',
        name: 'Divine Words',
        description: 'Praise production x2',
        cost: { praise: 100 },
        effect: { type: 'multiplier', resource: 'praise', value: 2 },
        owned: false,
        visible: true,
        requires: null  // or { resource: 'souls', amount: 10 }
    },
    {
        id: 'automatonCost1',
        name: 'Efficient Design',
        description: 'Automatons cost 10% less',
        cost: { offerings: 50 },
        effect: { type: 'costReduction', target: 'automaton', value: 0.9 },
        owned: false,
        visible: false,  // Unlocks later
        requires: { automatons: 10 }
    }
];
```

#### **Purchase Upgrade Function**
```javascript
function purchaseUpgrade(upgradeId) {
    const upgrade = upgrades.find(u => u.id === upgradeId);
    if (!upgrade || upgrade.owned) return false;

    // Check if can afford
    for (const [resource, amount] of Object.entries(upgrade.cost)) {
        if (gameState[resource] < amount) return false;
    }

    // Deduct cost
    for (const [resource, amount] of Object.entries(upgrade.cost)) {
        gameState[resource] -= amount;
    }

    // Apply effect
    upgrade.owned = true;
    applyUpgradeEffect(upgrade.effect);

    return true;
}

function applyUpgradeEffect(effect) {
    switch(effect.type) {
        case 'multiplier':
            gameState.multipliers[effect.resource] *= effect.value;
            break;
        case 'costReduction':
            gameState.costModifiers[effect.target] *= effect.value;
            break;
        case 'unlock':
            gameState.unlocked[effect.target] = true;
            break;
    }
}
```

---

### Canvas Animation Patterns

#### **Particle System** (Object Pooling)
```javascript
class Particle {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.life = 1.0;
        this.active = false;
    }

    update(deltaTime) {
        if (!this.active) return;

        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.life -= 0.01 * deltaTime;

        if (this.life <= 0) this.active = false;
    }

    draw(ctx) {
        if (!this.active) return;

        ctx.fillStyle = `rgba(255, 215, 0, ${this.life})`;
        ctx.fillRect(this.x, this.y, 2, 2);
    }
}

// Pool management
const particlePool = Array.from({ length: 100 }, () => new Particle());

function spawnParticle(x, y, vx, vy) {
    const particle = particlePool.find(p => !p.active);
    if (!particle) return;

    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = 1.0;
    particle.active = true;
}
```

#### **Easing Functions**
```javascript
const Easing = {
    linear: t => t,
    easeInQuad: t => t * t,
    easeOutQuad: t => t * (2 - t),
    easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: t => t * t * t,
    easeOutCubic: t => (--t) * t * t + 1,
};

// Usage for smooth animations
function animateValue(start, end, duration, easingFunc = Easing.easeOutQuad) {
    const startTime = Date.now();

    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easingFunc(progress);

        const current = start + (end - start) * easedProgress;

        if (progress < 1) {
            requestAnimationFrame(update);
        }

        return current;
    }

    update();
}
```

---

## 🏗️ Technical Architecture

### Current Structure

```
┌─────────────────────────────────────────┐
│           index.html (Entry)            │
└─────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
    style.css              JavaScript
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
      state.js             system.js            ui.js
    (Data layer)      (Window Manager)    (View layer)
          │                    │                    │
          └────────────────────┴────────────────────┘
                               │
                           game.js
                        (Game Loop)
```

### Data Flow

```
User Action (click)
    ↓
Event Handler (game.js)
    ↓
Update State (state.js)
    ↓
Game Loop Tick (game.js)
    ↓
Calculate Production (game.js)
    ↓
Update State (state.js)
    ↓
Sync UI (ui.js)
    ↓
Render Canvas (ui.js)
```

### Proposed Modular Expansion

```
js/
├── core/
│   ├── state.js           # State management
│   ├── loop.js            # Game loop (extracted from game.js)
│   ├── persistence.js     # Save/load/autosave
│   └── events.js          # Event bus for decoupling
├── systems/
│   ├── resources.js       # Resource calculation
│   ├── production.js      # Production formulas
│   ├── upgrades.js        # Upgrade system
│   ├── prestige.js        # Prestige mechanics
│   └── dimensions.js      # Dimension management
├── ui/
│   ├── windows.js         # Window management (system.js)
│   ├── canvas.js          # Canvas animations (ui.js)
│   ├── display.js         # Display updates (ui.js)
│   └── notifications.js   # Toast/alert system
└── data/
    ├── upgrades.json      # Upgrade definitions
    ├── dimensions.json    # Dimension configs
    └── strings.json       # Flavor text
```

**Benefits**:
- Easier testing (isolated modules)
- Cleaner separation of concerns
- Easier to add features without touching core
- Better collaboration (if ever needed)

**Drawbacks**:
- More files to manage
- Need bundler (Vite can handle this)
- Slight complexity increase

**Recommendation**: Refactor when current files exceed ~500 lines each

---

### Event Bus Pattern (For decoupling)

```javascript
// events.js
class EventBus {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) this.events[event] = [];
        this.events[event].push(callback);
    }

    emit(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(callback => callback(data));
    }

    off(event, callback) {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter(cb => cb !== callback);
    }
}

const events = new EventBus();
export default events;

// Usage in game.js
import events from './events.js';

events.emit('resource:gain', { resource: 'praise', amount: 100 });

// Usage in ui.js
import events from './events.js';

events.on('resource:gain', (data) => {
    showFloatingText(`+${data.amount} ${data.resource}`);
});
```

---

## 🎨 UI/UX Patterns

### Window Management Best Practices

**From Windows 98/XP**:
- Always have title bar with draggable area
- Minimize/maximize/close buttons in top-right
- Window focus changes z-index and title bar color
- Can't drag outside viewport bounds
- Double-click title bar to maximize
- Alt+F4 to close (keyboard shortcut)

**From Modern Web Apps**:
- Smooth CSS transitions on open/close
- Remember window positions in state
- Snap-to-edge behavior (optional)
- Resize handles (if implementing resizable windows)

**CosmOS Specifics**:
- Use beveled borders for retro feel
- Inactive windows slightly dimmed
- Taskbar shows all open windows
- Click taskbar button to focus window

### Notification System

**Toast Notifications** (temporary messages):
```javascript
function showNotification(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Fade in
    setTimeout(() => toast.classList.add('show'), 10);

    // Fade out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
```

**Achievement Popups**:
- Slide in from bottom-right (like Xbox/Steam)
- Include icon, title, description
- Sound effect (optional)
- Click to dismiss or auto-dismiss after 5s

### Tooltips

```javascript
// Simple tooltip on hover
function initTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(element => {
        element.addEventListener('mouseenter', (e) => {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.textContent = e.target.dataset.tooltip;
            document.body.appendChild(tooltip);

            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = rect.left + 'px';
            tooltip.style.top = (rect.bottom + 5) + 'px';
        });

        element.addEventListener('mouseleave', () => {
            document.querySelectorAll('.tooltip').forEach(t => t.remove());
        });
    });
}
```

---

## 🔢 Game Balance Formulas

### Resource Tier Ratios

**Common patterns**:
- 100:1 ratio (100 tier1 = 1 tier2)
- 1000:1 ratio (1000 tier1 = 1 tier2)
- Fibonacci-like (10, 25, 50, 100, 250...)

**CosmOS current**:
```
100 Praise = 1 Offering (100:1)
1000 Offerings = 1 Soul (1000:1)
```

**Effective ratio**: 100,000 Praise = 1 Soul

### Automaton Balancing

**First automaton**:
- Cost: 10 Praise
- Production: 1 PPS
- ROI (return on investment): 10 seconds

**Nth automaton** (same tier):
- Cost: `10 × 1.15^n`
- Production: 1 PPS (flat)
- ROI: Increases exponentially

**Next tier automaton**:
- Cost: 10× previous tier
- Production: 10× previous tier
- Maintains similar ROI curve

### Prestige Timing

**When should first prestige be available?**
- Too early: Players don't understand value
- Too late: Players get bored before prestige

**Guideline**: First prestige at ~2 hours of active play
- Gives enough time to understand mechanics
- Provides meaningful boost (not overwhelming)
- Creates desire to replay and optimize

---

## 🎮 Other Games' Mechanics Breakdown

### Cookie Clicker - Golden Cookie System

**What it is**: Random spawning clickable that gives temporary boost

**Implementation idea for CosmOS**:
```javascript
// "Divine Intervention" random event
function spawnDivineIntervention() {
    if (Math.random() < 0.01) { // 1% chance per second
        const intervention = document.createElement('div');
        intervention.className = 'divine-intervention';
        intervention.style.left = Math.random() * window.innerWidth + 'px';
        intervention.style.top = Math.random() * window.innerHeight + 'px';
        document.body.appendChild(intervention);

        intervention.onclick = () => {
            const boost = Math.random() < 0.5
                ? { type: 'production', multiplier: 7, duration: 60 }
                : { type: 'lumpSum', amount: gameState.praisePerSecond * 600 };

            applyBoost(boost);
            intervention.remove();
        };

        // Auto-remove after 13 seconds if not clicked
        setTimeout(() => intervention.remove(), 13000);
    }
}
```

### Kittens Game - Resource Caps

**What it is**: Resources have storage limits that must be upgraded

**Why it's good**:
- Prevents idle overnight progress from being useless (hit cap)
- Creates resource sink (spend to upgrade storage)
- Strategic choice (upgrade storage vs buy production)

**Implementation idea**:
```javascript
gameState.resourceCaps = {
    praise: 1000,
    offerings: 100,
    souls: 10
};

gameState.upgrades.storagePraise = {
    cost: 50,
    owned: 0,
    effect: () => gameState.resourceCaps.praise += 500
};
```

### Antimatter Dimensions - Dimension Boosts

**What it is**: First soft prestige layer (before full prestige)

**Why it's good**:
- Gives taste of prestige without full reset
- Creates mini-goals during long grinds
- Teaches prestige concept before big commitment

**Implementation idea**:
```javascript
// Every 10 automatons, offer "boost" (mini-prestige)
function checkBoostAvailability() {
    const totalAutomatons = gameState.automatons.reduce((sum, a) => sum + a.count, 0);
    if (totalAutomatons >= gameState.nextBoostAt) {
        // Offer boost: Reset automatons, gain permanent multiplier
        showBoostDialog();
    }
}
```

---

## 📖 Flavor Text Examples

### Upgrade Descriptions (Cookie Clicker style)

**Boring**: "Increases Praise production by 10%"

**Flavorful**:
- "Your divine words carry more weight. The faithful listen with rapt attention. (+10% Praise)"
- "Miracles now come with a satisfaction guarantee. No refunds. (+10% Praise)"
- "You've discovered the cosmic equivalent of Comic Sans. It shouldn't work, but it does. (+10% Praise)"

### Error Messages (Retro + Divine)

Instead of: "Cannot afford this purchase"

Try:
- "Insufficient Praise. The universe remains skeptical of your divinity."
- "Error 777: Not enough Souls. Have you tried asking nicely?"
- "Access Denied: Your faith balance is too low to perform this miracle."

### Achievement Descriptions

Instead of: "Click 1000 times"

Try:
- **"Carpal Tunnel Divinity"**: Manually perform 1,000 miracles. Mortals have worker's comp. You have persistence.
- **"The Clicker"**: You've clicked 1,000 times. The mouse trembles in fear. The keyboard watches in horror.

---

## 🔗 Useful Resources

### JavaScript Game Dev
- **MDN Game Development**: https://developer.mozilla.org/en-US/docs/Games
- **HTML5 Canvas Tutorial**: https://www.html5canvastutorials.com/
- **RequestAnimationFrame explained**: https://css-tricks.com/using-requestanimationframe/

### Idle Game Design
- **Idle Game Mathematics**: https://blog.kongregate.com/the-math-of-idle-games-part-i/
- **Incremental Games Plaza**: https://plaza.dsolver.ca/ (community)
- **Incremental Games Reddit**: https://www.reddit.com/r/incremental_games/

### Retro UI Design
- **Windows 98 CSS**: https://jdan.github.io/98.css/
- **Windows XP CSS**: https://botoxparty.github.io/XP.css/
- **Retro Windows Icons**: https://win98icons.alexmeub.com/

### Performance
- **JavaScript Performance**: https://web.dev/rendering-performance/
- **Canvas Optimization**: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas

---

## 📝 Notes

**Last Updated**: [Date]

**TODO**:
- [ ] Add actual gameplay formulas once finalized
- [ ] Screenshot references from inspiration games
- [ ] Code snippets from actual implementation (not just examples)
- [ ] Performance benchmarks once issues arise

*This is a living document. Update as you implement and discover new patterns.*
