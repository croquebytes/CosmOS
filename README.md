# CosmOS: The Divine Repair Tool

> *"In the beginning, there was Ctrl+Alt+Delete..."*

A morbidly beautiful idle game where retro operating systems meet cosmic divinity. You've inherited the role of a retired deity, tasked with repairing a broken universe through an ancient Sacred OS interface.

## Vision

**CosmOS** is an incremental/idle game that fuses the nostalgic aesthetic of Windows 98/XP with a divine cosmic theme. Players navigate a retro desktop environment to perform miracles, manage celestial resources, and gradually restore the fabric of reality itself.

### Core Concept

The universe is broken. A weary deity has retired, leaving behind only their outdated operating system—a relic from a time when reality was managed through beveled window chrome and desktop icons. You, the successor, must learn to operate this Sacred OS to repair dimensions, restore cosmic laws, and perhaps understand why the universe broke in the first place.

### Aesthetic Philosophy

**Divine Fusion**: Neither purely retro nor purely cosmic, but a balanced hybrid where:
- Windows 98/XP chrome and UI conventions feel authentic and functional
- Divine/celestial elements (pulsing cores, cosmic backgrounds, sacred text) enhance rather than overwhelm
- The mundane act of clicking buttons becomes a ritualistic divine act
- System processes and cosmic forces are indistinguishable

### Narrative Tone

A blend of seemingly contradictory tones that create something unique:

**Whimsical & Absurd**: The bureaucratic nature of divinity. Heaven has a taskbar. Reality runs on an outdated OS. Error messages from the cosmos.

**Melancholic & Beautiful**: The weight of repair. Echoes of what once was. The bittersweet act of restoration. Poignant flavor text on forgotten universe fragments.

**Mysterious & Contemplative**: Gradual revelation of cosmic truths. Philosophical undertones. Why did the previous deity retire? What really broke the universe? Environmental storytelling through log files and system messages.

*Think: Hitchhiker's Guide meets The Stranger meets Spaceplan*

## Project Goals

### For Players
- **2-4 hours of engaging core content** with endless progression beyond
- **Deep, interconnected systems**: Prestige mechanics, dimensional progression, and continuously unlocking new gameplay layers
- **Narrative discovery**: Piece together the story through flavor text, logs, and environmental details
- **Satisfying incrementalism**: From clicking for single Praise points to managing billions of souls across parallel universes
- **Accessible anywhere**: Browser-based, autosave, play at your own pace

### For Me (Dev Journey)
- **Master vanilla JavaScript architecture** without framework dependencies
- **Explore game balance and progression design** for idle/incremental games
- **Practice CSS artistry** through authentic retro interface recreation
- **Develop narrative writing** through flavor text and environmental storytelling
- **Learn about**: Canvas animation, localStorage persistence, game loops, state management
- **Ship a complete, polished game** to a public audience

### For the World
- **Itch.io/web release**: Free to play, accessible to all
- **Nostalgic yet fresh**: Honor the retro aesthetic while creating something new
- **Morbidly beautiful**: A unique emotional tone that stays with players

## Inspirations

### Games
- **Cookie Clicker / Universal Paperclips**: Classic exponential growth, simple mechanics that scale beautifully
- **Spaceplan / A Dark Room**: Narrative-driven mystery, gradual revelation, strong environmental storytelling
- **Trimps / Kittens Game**: Deep systems, complex interdependencies, endless replayability
- **Candy Box**: Creative ASCII aesthetic, surprising depth

### Aesthetic
- **Windows 98/XP/7**: Classic beveled chrome, Aero glass effects, authentic UI conventions
- **Cyberpunk OS interfaces**: Retro-futurism, CLI aesthetics, system diagnostics as gameplay
- **Sacred/Religious UI**: Illuminated manuscripts meet digital interfaces

### Narrative
- **Douglas Adams**: Absurdist cosmic bureaucracy
- **Exurb1a**: Philosophical comedy about existence
- **SCP Foundation**: Clinical documentation of the anomalous
- **Dark Souls**: Environmental storytelling, melancholic beauty

## Technical Philosophy

**Vanilla First**: No frameworks unless absolutely necessary. Learn the fundamentals deeply.

**Progressive Enhancement**: Start simple, layer complexity thoughtfully.

**Accessible Architecture**: Code should be readable and educational (for future me and others).

**Performance Conscious**: Idle games run indefinitely—optimize early, optimize often.

## Current Status

**Casino/Adversary Implementation**: 6/10 phases complete

### ✅ Core Systems (Complete)
- **Boot Sequence**: Authentic OS boot with startup sounds and loading screen
- **Desktop Environment**: Fully functional retro desktop with icons and taskbar
- **Window Management**: Draggable, closeable, focusable windows with proper layering
- **Resource Generation**: 6 resource types (Praise, Offerings, Souls, Darkness, Shadows, Echoes)
- **Divine Core**: Animated particle visualization of universal energy
- **Save/Load**: Complete persistence with localStorage + offline progress
- **Upgrades**: 8 progressive upgrades with unlock conditions
- **Automatons**: 4 automaton types (Seraphs, Cherubs, Wraiths, Phantoms)
- **Divine Mandates**: 15-node skill tree across 3 branches (Creation/Maintenance/Entropy)
- **Active Skills**: Divine Intervention (2x production) + Temporal Rift (time skip)
- **Divine Events**: Golden-cookie style random bonuses
- **Dimensions**: Primordial + Void dimensions with unique resources
- **Prestige**: Divine Reboot system with Divinity Points multipliers

### ✅ Casino/Adversary Systems (Phases 1-6 Complete)
- **Documents System**: 15 lore documents with unlock conditions, category filtering, markdown rendering
- **Achievement System**: 40 achievements across 5 tiers (Bronze/Silver/Gold/Platinum/Secret) with automatic rewards
- **Task Manager**: 12 system processes with termination callbacks, easter eggs, and document unlocks
- **Recycle Bin**: Resource sacrifice mechanics, item restoration, Adversary patch execution
- **Casino Host Barks**: 80 personality-driven dialogue lines with weighted selection, cooldowns, and rare whispers
- **Adversary Foundation**: NULL.OPERATOR system with patch execution and alternate prestige paths

### 🚧 In Progress (Phases 7-10)
- **Adversary Scene Engine**: Branching dialogue trees with player choices
- **Casino Mini-Games**: Solitaire, Slots, Plinko with Fate Token economy
- **Casino Integration**: Full casino window with Host personality
- **Testing & Balance**: Comprehensive stress testing and progression tuning

### 📋 Planned Features
- **Cosmic Defrag**: Second prestige layer
- **Protocol System**: Challenge modes
- **Additional Dimensions**: Chronos, Quantum, Primordial
- **More Desktop Apps**: Paint, Command Prompt, Registry Editor
- **Statistics Window**: Charts and progress tracking

## Development Approach

This is both a **learning journey** and a **real game for real players**. Development priorities:

1. **Playable over perfect**: Ship iteratively, improve continuously
2. **Learn in public**: This is a dev journey—mistakes are features
3. **Player-focused**: Balance experimentation with user experience
4. **Scope management**: Endless ambition, disciplined execution

## Latest Updates (Phase 5-6)

### 🎰 Casino Host Bark System
A mysterious casino host who comments on your actions with 80 unique dialogue lines:
- **Contextual Barks**: Different responses for wins, losses, streaks, and idle moments
- **Weighted Selection**: Some lines are rarer than others
- **Cooldown System**: Individual bark cooldowns + global rate limiting
- **Lore Whispers**: Rare 1% chance whispers with special golden styling and hints about the deeper narrative
- **Persistent Personality**: The Host remembers what you've heard and adapts

### 🗑️ Recycle Bin & Sacrifice System
Delete resources for permanent power:
- **Resource Sacrifice**: Convert resources into permanent percentage bonuses to ALL production
- **Item Management**: Restore accidentally deleted items or sacrifice them for power
- **Adversary Patch**: Execute the NULL.OPERATOR discipline patch to unlock alternate prestige paths
- **Achievement Easter Egg**: Try deleting an achievement... if you dare
- **Sacrifice Tracking**: Total sacrifice value displayed, counts toward achievements

### 📄 Enhanced Document System
Discover the truth through paperwork:
- **15 Lore Documents**: HR memos, legal disclaimers, incident reports, training manuals, and mysterious logs
- **11 Categories**: Organized filing system (HR, Legal, Logs, Incident, Training, Memo, Ad, Archive, Casino, System, Inbox)
- **Dynamic Unlocking**: Documents unlock based on achievements, actions, and milestones
- **Markdown Rendering**: Full document viewer with formatted text
- **Narrative Delivery**: Learn about the Watchers, Sector 7G, the Adversary, and the true nature of CosmOS™

### 🏆 40-Achievement System
Five tiers of accomplishments:
- **Bronze Tier** (12): Early milestones and basic actions
- **Silver Tier** (10): Intermediate goals and progression markers
- **Gold Tier** (8): Advanced achievements requiring dedication
- **Platinum Tier** (2): Elite accomplishments for true operators
- **Secret Tier** (8): Hidden achievements with mysterious unlock conditions
- **Automatic Rewards**: Achievements grant permanent bonuses, unlock documents, or reveal easter eggs
- **Tiered Notifications**: Beautiful toast notifications with tier-specific styling

### 💻 Task Manager
Manage (or mismanage) system processes:
- **12 System Processes**: Each with unique CPU/memory usage and descriptions
- **Process Termination**: End processes to see what breaks (or what you unlock)
- **Critical Processes**: Some processes are protected... but you can try
- **Easter Eggs**: Click certain processes to discover hidden messages and unlock documents
- **Achievement Integration**: Ending processes tracks toward achievements
- **Narrative Hooks**: Task Manager interactions reveal lore about Sector 7G, the Watchers, and system corruption

## Repository Structure

```
CosmOS/
├── README.md                          # This file - vision and goals
├── IMPLEMENTATION_PLAN_Casino_Adversary_Apps.md  # Current implementation roadmap
├── TESTING_GUIDE.md                   # Comprehensive testing procedures
├── TODO.md                            # Project task tracker
├── IDEAS.md                           # Feature brainstorming
├── REFERENCES.md                      # Code patterns and references
├── index.html                         # Main entry point
├── style.css                          # Retro-divine styling
├── js/
│   ├── state.js                       # Game state, data definitions, persistence
│   ├── system.js                      # Window management & app configs
│   ├── ui.js                          # UI updates, notifications, canvas
│   └── game.js                        # Core loop, achievements, bark system
└── docs/
    └── CosmOS_Content_Pack/
        └── docs/                      # 15 markdown lore documents
```

## How to Play (Local Development)

```bash
npm install
npm run dev
```

Open browser to localhost. Begin repairs.

---

*"Have you tried turning it off and on again?"*
*— Ancient Divine Proverb*
