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

**Phase 2 of 3**: Core gameplay loop established
- ✅ Boot sequence & desktop environment
- ✅ Window management system
- ✅ Resource generation (Praise, Offerings, Souls)
- ✅ Divine Core visualization
- ✅ Save/load persistence
- 🚧 Dimensional expansion
- 🚧 Divine Mandates skill tree
- 📋 Prestige mechanics
- 📋 Narrative integration
- 📋 Polish and balancing

## Development Approach

This is both a **learning journey** and a **real game for real players**. Development priorities:

1. **Playable over perfect**: Ship iteratively, improve continuously
2. **Learn in public**: This is a dev journey—mistakes are features
3. **Player-focused**: Balance experimentation with user experience
4. **Scope management**: Endless ambition, disciplined execution

## Repository Structure

```
CosmOS/
├── README.md                 # This file - vision and goals
├── IMPLEMENTATION_PLAN.md    # Technical roadmap and phase planning
├── IDEAS.md                  # Feature brainstorming and gameplay concepts
├── REFERENCES.md             # Code snippets, patterns, and design references
├── index.html                # Main entry point
├── style.css                 # Retro-divine styling
└── js/
    ├── state.js              # Game state & persistence
    ├── system.js             # Window management & OS functionality
    ├── ui.js                 # UI updates & canvas visualization
    └── game.js               # Core game loop & mechanics
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
