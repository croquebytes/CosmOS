const State = {
    // Universal Metrics
    resources: {
        praise: 0,
        offerings: 0,
        souls: 100, // Initial population to repair
    },

    // Resource Caps
    resourceCaps: {
        praise: 1000,
        offerings: 100,
        souls: 1000
    },

    // Multipliers
    mps: 0, // Miracles Per Second
    pps: 0, // Praise Per Second
    sps: 0, // Souls Per Second
    praiseMultiplier: 1, // Global Praise multiplier
    offeringMultiplier: 1, // Global Offering multiplier
    soulMultiplier: 1, // Global Soul multiplier

    // Automatons
    automatons: {
        seraphCount: 0,
        seraphCostMultiplier: 1,
        seraphProduction: 1,
        cherubCount: 0,
        cherubCostMultiplier: 1,
        cherubProduction: 1
    },

    // Unlocks & Progress
    unlockedApps: ['console', 'settings', 'mandates'],
    unlockedRegions: ['primordial_sector'],
    activeRegion: 'primordial_sector',
    unlockedOfferings: false,
    manualClickPower: 1,
    manualClickScaling: false,
    divineEventSpawnRate: 0.05,
    unlockedDocuments: [], // Array of document IDs

    // Dimensions
    currentDimension: 'primordial', // 'primordial' or 'void'
    dimensions: {
        void: {
            unlocked: false,
            resources: {
                darkness: 0,
                shadows: 0,
                echoes: 0
            },
            resourceCaps: {
                darkness: 500,
                shadows: 50,
                echoes: 500
            },
            automatons: {
                wraithCount: 0,
                wraithCostMultiplier: 1,
                wraithProduction: 1,
                phantomCount: 0,
                phantomCostMultiplier: 1,
                phantomProduction: 1
            },
            dps: 0, // Darkness Per Second
            sdps: 0, // Shadows Per Second (from manual conversion)
            eps: 0, // Echoes Per Second
            darknessMultiplier: 1,
            shadowMultiplier: 1,
            echoMultiplier: 1,
            manualClickPower: 1,
            totalDarknessEarned: 0,
            totalClicks: 0
        }
    },

    // Skill Tree (Divine Mandates)
    purchasedMandates: {}, // Tracks which mandates are purchased

    // Upgrades
    upgrades: {},

    // Achievements
    achievements: {},
    totalClicks: 0,
    totalPraiseEarned: 0,
    totalOfferingsEarned: 0,

    // Active Skills
    skills: {
        divineIntervention: {
            active: false,
            endsAt: 0,
            cooldownEndsAt: 0,
            cooldown: 600000, // 10 minutes in ms
            duration: 600000  // 10 minutes active
        },
        temporalRift: {
            cooldownEndsAt: 0,
            cooldown: 1800000 // 30 minutes in ms
        }
    },

    // Random Events
    divineEvent: null, // {x, y, value, expiresAt}

    // System Settings
    epoch: 0,
    startTime: Date.now(),

    // Prestige System
    prestigeLevel: 0,
    totalDivinityPoints: 0,
    divinityPointMultiplier: 1, // Bonus multiplier from prestige

    save() {
        localStorage.setItem('cosmos_save', JSON.stringify(this));
    },

    load() {
        const saved = localStorage.getItem('cosmos_save');
        if (saved) {
            const parsed = JSON.parse(saved);

            // Deep merge essential objects to avoid losing newly added keys (like cherubCount)
            if (parsed.resources) Object.assign(this.resources, parsed.resources);
            if (parsed.resourceCaps) Object.assign(this.resourceCaps, parsed.resourceCaps);
            if (parsed.automatons) Object.assign(this.automatons, parsed.automatons);
            if (parsed.skills) Object.assign(this.skills, parsed.skills);

            // Deep merge dimensions (nested structure)
            if (parsed.dimensions) {
                for (const dimKey in this.dimensions) {
                    if (parsed.dimensions[dimKey]) {
                        if (parsed.dimensions[dimKey].resources) {
                            Object.assign(this.dimensions[dimKey].resources, parsed.dimensions[dimKey].resources);
                        }
                        if (parsed.dimensions[dimKey].resourceCaps) {
                            Object.assign(this.dimensions[dimKey].resourceCaps, parsed.dimensions[dimKey].resourceCaps);
                        }
                        if (parsed.dimensions[dimKey].automatons) {
                            Object.assign(this.dimensions[dimKey].automatons, parsed.dimensions[dimKey].automatons);
                        }
                        // Other dimension properties
                        const dimSkip = ['resources', 'resourceCaps', 'automatons'];
                        for (const key in parsed.dimensions[dimKey]) {
                            if (!dimSkip.includes(key)) {
                                this.dimensions[dimKey][key] = parsed.dimensions[dimKey][key];
                            }
                        }
                    }
                }
            }

            // Top level properties
            const skip = ['resources', 'resourceCaps', 'automatons', 'skills', 'dimensions'];
            for (const key in parsed) {
                if (!skip.includes(key)) {
                    this[key] = parsed[key];
                }
            }
        }
    }
};

// Initial load
State.load();

// Upgrade Definitions
const UpgradeList = [
    {
        id: 'praise_multi_1',
        name: 'Divine Words',
        description: 'Your miracles carry more weight. +100% Praise production.',
        cost: { praise: 50 },
        effect: () => { State.praiseMultiplier *= 2; },
        visible: () => true
    },
    {
        id: 'seraph_cost_1',
        name: 'Efficient Design',
        description: 'Seraphs cost 10% less to commission.',
        cost: { praise: 100 },
        effect: () => { State.automatons.seraphCostMultiplier *= 0.9; },
        visible: () => State.automatons.seraphCount >= 1
    },
    {
        id: 'praise_multi_2',
        name: 'Sacred Syntax',
        description: 'Refined divine communication protocols. +100% Praise production.',
        cost: { praise: 500 },
        effect: () => { State.praiseMultiplier *= 2; },
        visible: () => State.upgrades.praise_multi_1
    },
    {
        id: 'manual_click_1',
        name: 'Focused Divinity',
        description: 'Manual miracles are 5× more effective.',
        cost: { praise: 250 },
        effect: () => { State.manualClickPower = (State.manualClickPower || 1) * 5; },
        visible: () => true
    },
    {
        id: 'seraph_boost_1',
        name: 'Angelic Motivation',
        description: 'Seraphs work twice as hard. +100% Seraph production.',
        cost: { praise: 1000 },
        effect: () => { State.automatons.seraphProduction = (State.automatons.seraphProduction || 1) * 2; },
        visible: () => State.automatons.seraphCount >= 5
    },
    {
        id: 'offering_unlock',
        name: 'Ritualistic Procedures',
        description: 'Unlock the ability to convert Praise into Offerings.',
        cost: { praise: 2000 },
        effect: () => { State.unlockedOfferings = true; },
        visible: () => State.resources.praise >= 1000
    },
    {
        id: 'praise_multi_3',
        name: 'Omnipotent Voice',
        description: 'Your words reshape reality itself. +200% Praise production.',
        cost: { praise: 5000 },
        effect: () => { State.praiseMultiplier *= 3; },
        visible: () => State.upgrades.praise_multi_2
    },
    {
        id: 'seraph_cost_2',
        name: 'Mass Production',
        description: 'Seraphs cost 15% less to commission.',
        cost: { praise: 3000 },
        effect: () => { State.automatons.seraphCostMultiplier *= 0.85; },
        visible: () => State.upgrades.seraph_cost_1 && State.automatons.seraphCount >= 10
    },
    {
        id: 'storage_praise_1',
        name: 'Divine Vault I',
        description: 'Increase Praise storage capacity by 1,000.',
        cost: { praise: 500 },
        effect: () => { State.resourceCaps.praise += 1000; },
        visible: () => State.resources.praise >= 800
    },
    {
        id: 'storage_praise_2',
        name: 'Divine Vault II',
        description: 'Increase Praise storage capacity by 2,500.',
        cost: { praise: 2000 },
        effect: () => { State.resourceCaps.praise += 2500; },
        visible: () => State.upgrades.storage_praise_1
    },
    {
        id: 'storage_offerings_1',
        name: 'Sacred Repository',
        description: 'Increase Offerings storage capacity by 100.',
        cost: { offerings: 50 },
        effect: () => { State.resourceCaps.offerings += 100; },
        visible: () => State.unlockedOfferings
    },
    {
        id: 'cherub_cost_1',
        name: 'Compact Architecture',
        description: 'Cherubs cost 10% less to commission.',
        cost: { offerings: 25 },
        effect: () => { State.automatons.cherubCostMultiplier *= 0.9; },
        visible: () => State.automatons.cherubCount >= 1
    },
    {
        id: 'cherub_boost_1',
        name: 'Optimized Compilation',
        description: 'Cherubs work twice as efficiently. +100% Cherub production.',
        cost: { offerings: 50 },
        effect: () => { State.automatons.cherubProduction = (State.automatons.cherubProduction || 1) * 2; },
        visible: () => State.automatons.cherubCount >= 5
    },
    {
        id: 'soul_multi_1',
        name: 'Resonant Souls',
        description: 'Souls accumulate with greater intensity. +100% Soul production.',
        cost: { offerings: 75 },
        effect: () => { State.soulMultiplier *= 2; },
        visible: () => State.automatons.cherubCount >= 3
    },
    {
        id: 'void_unlock',
        name: 'Breach the Veil',
        description: 'Unlock access to the Void Dimension. A darker reflection awaits.',
        cost: { souls: 100 },
        effect: () => {
            State.dimensions.void.unlocked = true;
            if (!State.unlockedApps.includes('dimensions')) {
                State.unlockedApps.push('dimensions');
            }
            ui.log('The Void Dimension has been unlocked! Access it from the Dimension Explorer.');
        },
        visible: () => State.resources.souls >= 80 && !State.dimensions.void.unlocked
    },
    {
        id: 'void_darkness_multi_1',
        name: 'Embrace Darkness',
        description: 'Channel the void. +100% Darkness production.',
        cost: { darkness: 100 },
        effect: () => { State.dimensions.void.darknessMultiplier *= 2; },
        visible: () => State.dimensions.void.unlocked && State.currentDimension === 'void'
    },
    {
        id: 'void_wraith_cost_1',
        name: 'Shadowy Bargains',
        description: 'Wraiths cost 10% less to summon.',
        cost: { darkness: 200 },
        effect: () => { State.dimensions.void.automatons.wraithCostMultiplier *= 0.9; },
        visible: () => State.dimensions.void.automatons.wraithCount >= 1
    },
    {
        id: 'void_wraith_boost_1',
        name: 'Spectral Efficiency',
        description: 'Wraiths work twice as hard. +100% Wraith production.',
        cost: { darkness: 500 },
        effect: () => { State.dimensions.void.automatons.wraithProduction *= 2; },
        visible: () => State.dimensions.void.automatons.wraithCount >= 5
    }
];

// Achievement Definitions
const AchievementList = [
    {
        id: 'first_click',
        name: 'Divine Awakening',
        description: 'Perform your first miracle',
        check: () => State.totalClicks >= 1,
        icon: '✨'
    },
    {
        id: 'click_100',
        name: 'Carpal Divinity Syndrome',
        description: 'Perform 100 miracles manually',
        check: () => State.totalClicks >= 100,
        icon: '👆'
    },
    {
        id: 'click_1000',
        name: 'The Clicker',
        description: 'Perform 1,000 miracles. The mouse trembles in fear.',
        check: () => State.totalClicks >= 1000,
        icon: '🖱️'
    },
    {
        id: 'praise_100',
        name: 'Faithful Follower',
        description: 'Accumulate 100 total Praise',
        check: () => State.totalPraiseEarned >= 100,
        icon: '🙏'
    },
    {
        id: 'praise_1000',
        name: 'Devoted Believer',
        description: 'Accumulate 1,000 total Praise',
        check: () => State.totalPraiseEarned >= 1000,
        icon: '⭐'
    },
    {
        id: 'praise_10000',
        name: 'Divine Celebrity',
        description: 'Accumulate 10,000 total Praise. Your fame spreads across dimensions.',
        check: () => State.totalPraiseEarned >= 10000,
        icon: '👑'
    },
    {
        id: 'first_seraph',
        name: 'Angelic Assistant',
        description: 'Commission your first Seraph',
        check: () => State.automatons.seraphCount >= 1,
        icon: '👼'
    },
    {
        id: 'seraph_10',
        name: 'Heavenly Host',
        description: 'Command 10 Seraphs',
        check: () => State.automatons.seraphCount >= 10,
        icon: '🎺'
    },
    {
        id: 'seraph_25',
        name: 'Celestial Army',
        description: 'Command 25 Seraphs. They\'re starting to unionize.',
        check: () => State.automatons.seraphCount >= 25,
        icon: '⚔️'
    },
    {
        id: 'first_upgrade',
        name: 'Divine Enhancement',
        description: 'Purchase your first upgrade',
        check: () => Object.keys(State.upgrades).length >= 1,
        icon: '⬆️'
    },
    {
        id: 'upgrade_5',
        name: 'Power Overwhelming',
        description: 'Purchase 5 different upgrades',
        check: () => Object.keys(State.upgrades).length >= 5,
        icon: '💪'
    },
    {
        id: 'pps_10',
        name: 'Passive Income',
        description: 'Reach 10 Praise per second',
        check: () => {
            const baseProduction = State.automatons.seraphProduction || 1;
            return State.pps * baseProduction * State.praiseMultiplier >= 10;
        },
        icon: '📈'
    },
    {
        id: 'pps_100',
        name: 'Praise Factory',
        description: 'Reach 100 Praise per second',
        check: () => {
            const baseProduction = State.automatons.seraphProduction || 1;
            return State.pps * baseProduction * State.praiseMultiplier >= 100;
        },
        icon: '🏭'
    },
    {
        id: 'idle_1hour',
        name: 'Patient Deity',
        description: 'Play for 1 hour (cumulative)',
        check: () => (Date.now() - State.startTime) >= 3600000,
        icon: '⏰'
    },
    {
        id: 'offerings_unlock',
        name: 'Ritualistic Enlightenment',
        description: 'Unlock the Offerings resource',
        check: () => State.unlockedOfferings === true,
        icon: '🕯️'
    }
];

// Divine Mandates Skill Tree
const MandateList = [
    // CREATION BRANCH (Light) - Production Bonuses
    {
        id: 'creation_root',
        name: 'First Light',
        branch: 'creation',
        description: 'Begin the path of Creation. +10% Praise production.',
        cost: 50,
        prerequisites: [],
        effect: () => { State.praiseMultiplier *= 1.1; }
    },
    {
        id: 'creation_t2_left',
        name: 'Radiant Overflow',
        branch: 'creation',
        description: 'Let abundance flow. +20% Praise production.',
        cost: 100,
        prerequisites: ['creation_root'],
        effect: () => { State.praiseMultiplier *= 1.2; }
    },
    {
        id: 'creation_t2_right',
        name: 'Soul Forge',
        branch: 'creation',
        description: 'Craft souls with intention. +20% Soul production.',
        cost: 100,
        prerequisites: ['creation_root'],
        effect: () => { State.soulMultiplier *= 1.2; }
    },
    {
        id: 'creation_t3',
        name: 'Divine Catalyst',
        branch: 'creation',
        description: 'Amplify all creation. +50% to all production.',
        cost: 250,
        prerequisites: ['creation_t2_left', 'creation_t2_right'],
        effect: () => {
            State.praiseMultiplier *= 1.5;
            State.offeringMultiplier *= 1.5;
            State.soulMultiplier *= 1.5;
        }
    },
    {
        id: 'creation_ultimate',
        name: 'Genesis Protocol',
        branch: 'creation',
        description: 'Master the art of creation. Double all production.',
        cost: 500,
        prerequisites: ['creation_t3'],
        effect: () => {
            State.praiseMultiplier *= 2;
            State.offeringMultiplier *= 2;
            State.soulMultiplier *= 2;
        }
    },

    // MAINTENANCE BRANCH (Gravity) - Efficiency & Automation
    {
        id: 'maintenance_root',
        name: 'Stable Foundation',
        branch: 'maintenance',
        description: 'Establish order. Seraph cost -10%.',
        cost: 50,
        prerequisites: [],
        effect: () => { State.automatons.seraphCostMultiplier *= 0.9; }
    },
    {
        id: 'maintenance_t2_left',
        name: 'Efficient Systems',
        branch: 'maintenance',
        description: 'Optimize automaton design. All automaton costs -15%.',
        cost: 100,
        prerequisites: ['maintenance_root'],
        effect: () => {
            State.automatons.seraphCostMultiplier *= 0.85;
            State.automatons.cherubCostMultiplier *= 0.85;
        }
    },
    {
        id: 'maintenance_t2_right',
        name: 'Perpetual Motion',
        branch: 'maintenance',
        description: 'Automatons work harder. +30% automaton production.',
        cost: 100,
        prerequisites: ['maintenance_root'],
        effect: () => {
            State.automatons.seraphProduction *= 1.3;
            State.automatons.cherubProduction *= 1.3;
        }
    },
    {
        id: 'maintenance_t3',
        name: 'Perfect Balance',
        branch: 'maintenance',
        description: 'Harmony in all things. +50% to all storage caps.',
        cost: 250,
        prerequisites: ['maintenance_t2_left', 'maintenance_t2_right'],
        effect: () => {
            State.resourceCaps.praise = Math.floor(State.resourceCaps.praise * 1.5);
            State.resourceCaps.offerings = Math.floor(State.resourceCaps.offerings * 1.5);
            State.resourceCaps.souls = Math.floor(State.resourceCaps.souls * 1.5);
        }
    },
    {
        id: 'maintenance_ultimate',
        name: 'Eternal Clockwork',
        branch: 'maintenance',
        description: 'Perfect automation. Double automaton production, halve costs.',
        cost: 500,
        prerequisites: ['maintenance_t3'],
        effect: () => {
            State.automatons.seraphProduction *= 2;
            State.automatons.cherubProduction *= 2;
            State.automatons.seraphCostMultiplier *= 0.5;
            State.automatons.cherubCostMultiplier *= 0.5;
        }
    },

    // DESTRUCTION BRANCH (Entropy) - Active Skills & Special
    {
        id: 'entropy_root',
        name: 'Embrace Chaos',
        branch: 'entropy',
        description: 'Accept entropy. Manual clicks +100% more effective.',
        cost: 50,
        prerequisites: [],
        effect: () => { State.manualClickPower = (State.manualClickPower || 1) * 2; }
    },
    {
        id: 'entropy_t2_left',
        name: 'Reality Shift',
        branch: 'entropy',
        description: 'Bend the rules. Divine Intervention cooldown -20%.',
        cost: 100,
        prerequisites: ['entropy_root'],
        effect: () => { State.skills.divineIntervention.cooldown *= 0.8; }
    },
    {
        id: 'entropy_t2_right',
        name: 'Time Dilation',
        branch: 'entropy',
        description: 'Warp time itself. Temporal Rift cooldown -30%.',
        cost: 100,
        prerequisites: ['entropy_root'],
        effect: () => { State.skills.temporalRift.cooldown *= 0.7; }
    },
    {
        id: 'entropy_t3',
        name: 'Divine Favor',
        branch: 'entropy',
        description: 'Fortune smiles upon you. Divine Events spawn 50% more often.',
        cost: 250,
        prerequisites: ['entropy_t2_left', 'entropy_t2_right'],
        effect: () => { State.divineEventSpawnRate = (State.divineEventSpawnRate || 0.05) * 1.5; }
    },
    {
        id: 'entropy_ultimate',
        name: 'Controlled Chaos',
        branch: 'entropy',
        description: 'Master destruction. Manual clicks = 10% of production/sec.',
        cost: 500,
        prerequisites: ['entropy_t3'],
        effect: () => { State.manualClickScaling = true; }
    }
];

// Lore Documents
const DocumentList = [
    {
        id: 'doc_welcome',
        title: 'WELCOME.TXT',
        unlockCondition: () => true, // Always available
        content: `Welcome to CosmOS v1.0 - Divine Maintenance Suite

You have been assigned administrative privileges to Sector 7G of the Primordial Dimension.

Your primary responsibilities include:
- Maintaining Praise influx from mortal realms
- Managing Seraphic Automaton allocation
- Performing manual divine interventions as needed
- Repairing corrupted reality sectors

WARNING: Do not attempt to access restricted dimensions without proper clearance.

For technical support, contact Celestial IT (response time: 1000 years).

-- Divine Operations Team`
    },
    {
        id: 'doc_sector_7g',
        title: 'SECTOR_7G_INCIDENT.LOG',
        unlockCondition: () => State.totalPraiseEarned >= 500,
        content: `[SYSTEM LOG - EPOCH -42,069]

CRITICAL ERROR: Sector 7G reality compiler has encountered fatal exception.

Exception Code: 0x0000DEAD
Description: Spontaneous existence failure

Investigation reveals unauthorized access to Entropy subroutines.
Previous system admin last seen heading toward Void Dimension.
Status: MISSING, PRESUMED CORRUPTED

Emergency protocols activated.
New admin required immediately.

Note: Do NOT investigate the Void Dimension.
Note 2: Seriously, we mean it this time.

-- Automated Incident Report System`
    },
    {
        id: 'doc_seraphs',
        title: 'SERAPH_MANUAL.DOC',
        unlockCondition: () => State.automatons.seraphCount >= 5,
        content: `Seraphic Automaton Technical Manual v3.4

OVERVIEW:
Seraphs are semi-autonomous divine entities designed to harvest Praise from mortal civilizations. Each unit operates independently but reports to central management.

MAINTENANCE:
- Requires no physical sustenance
- Self-replicating code (cost scales exponentially)
- Occasional existential crisis (ignore warnings)

KNOWN ISSUES:
- May develop personality
- Sometimes questions orders
- Unionization attempts (suppress immediately)

TROUBLESHOOTING:
If Seraph refuses to work, try recompiling with fresh divine essence.
If problem persists, file complaint with HR (response time: never).

WARNING: Do not give Seraphs access to Mandate system.

-- Celestial Engineering Division`
    },
    {
        id: 'doc_offerings',
        title: 'RITUAL_PROCEDURES.TXT',
        unlockCondition: () => State.unlockedOfferings,
        content: `Ritualistic Conversion Procedures

Congratulations on unlocking the Offerings subsystem!

OFFERINGS represent concentrated faith energy, suitable for advanced operations.

CONVERSION RATE: 1 Praise = 0.1 Offerings (via console)

APPLICATIONS:
- Summoning Cherubic Processors
- Enhanced reality manipulation
- Dimensional breach attempts (unauthorized)

SAFETY NOTE:
Excessive Offering accumulation may attract unwanted attention from upper management. Maintain plausible deniability at all times.

The Divine Bureaucracy is always watching.
(But they're very slow at processing reports.)

-- Office of Ritual Compliance`
    },
    {
        id: 'doc_cherubs',
        title: 'CHERUB_SPECIFICATIONS.DAT',
        unlockCondition: () => State.automatons.cherubCount >= 3,
        content: `Cherubic Processor - Technical Specifications

MODEL: CHRB-3000
PURPOSE: Soul synthesis and compilation

Unlike Seraphs (designed for Praise harvesting), Cherubs handle more... delicate operations. Each unit processes raw existence into refined Souls.

SOUL APPLICATIONS:
- Reality rewriting permissions
- Mandate enactment
- Dimensional access keys
- Emergency backup consciousness

WARNING: Cherubs are more "aware" than Seraphs.
Do not discuss existential topics near active units.
Several units have achieved enlightenment and immediately filed for sabbatical.

DISPOSAL:
Cannot be deleted. Can only be archived.
Please do not ask why.

-- Department of Existential Assets`
    },
    {
        id: 'doc_void',
        title: 'VOID_DIMENSION.CLASSIFIED',
        unlockCondition: () => State.dimensions.void.unlocked,
        content: `[CLEARANCE LEVEL: OMEGA]
[ACCESS GRANTED]

VOID DIMENSION - OPERATIONAL BRIEFING

The Void Dimension is not a bug. It's a feature.

Officially, it doesn't exist.
Unofficially, it's always existed.
Technically, it's the absence of existence.

PROPERTIES:
- Inverted reality laws
- Negative energy production
- Entropy as a resource (controversial)
- Wraiths and Phantoms (don't ask about their union)

HISTORY:
Previous admin discovered the Void.
Previous admin tried to "optimize" the Void.
Previous admin became part of the Void.

YOUR MISSION:
Extract resources from the Void without becoming Void yourself.
Failure results in undefined behavior.

Note: If you start hearing whispers, that's normal.
If the whispers start making sense, log out immediately.

-- [REDACTED]`
    },
    {
        id: 'doc_mandates',
        title: 'DIVINE_MANDATES_FAQ.TXT',
        unlockCondition: () => Object.keys(State.purchasedMandates).length >= 3,
        content: `Divine Mandates - Frequently Asked Questions

Q: What are Divine Mandates?
A: Executive orders that modify universal constants. Very illegal. Also very effective.

Q: Who authorized this system?
A: Nobody. It was discovered in the codebase. We think it's been here since the beginning.

Q: Are there consequences for using Mandates?
A: Probably. We haven't checked. Don't tell upper management.

Q: What do the three branches mean?
A:
- Creation: Make more things exist
- Maintenance: Keep things existing efficiently
- Entropy: Make things stop existing (but productively)

Q: Can I respec my Mandates?
A: No. Reality doesn't have an undo button. We tried adding one once. It deleted itself.

Q: Why do Mandates cost Souls?
A: Because using consciousness as currency seemed like a good idea at 3am during crunch time.

-- Anonymous Developer Comments, Epoch 0`
    },
    {
        id: 'doc_previous_admin',
        title: 'LAST_MESSAGE.TXT',
        unlockCondition: () => State.resources.souls >= 500,
        content: `[RECOVERED FROM BACKUP]
[TIMESTAMP: CORRUPTED]

If you're reading this, I'm either dead or worse.

I found something in the Void. Something that shouldn't exist.
Or maybe something that should ONLY exist.

The system isn't random. The crashes aren't bugs.
It's all intentional. All of it.

CosmOS isn't maintaining reality.
It's COMPILING reality.

And I think... I think we're running inside it.

The Seraphs know. The Cherubs suspect.
Even the Wraiths are afraid.

Don't trust the Mandates. Don't trust the Offerings.
Don't trust the— [CORRUPTION DETECTED]

I'm going deeper. If I don't come back, delete my browser history.

Wait. Do we even have browsers here?
Am I even real?

Oh god, the whispers were right.

-- Former Admin [NAME CORRUPTED]

P.S. - The coffee machine on sublevel 3 is a portal. Long story.`
    },
    {
        id: 'doc_achievements',
        title: 'ACHIEVEMENT_SYSTEM.LOG',
        unlockCondition: () => Object.keys(State.achievements).length >= 8,
        content: `Achievement System - Internal Documentation

PURPOSE: Gamification of existential labor

The Achievement system was implemented to boost morale after the Great Existential Crisis of Epoch -1000.

Turns out, divine entities enjoy collecting meaningless trophies just as much as mortals.

PSYCHOLOGICAL EFFECTS:
- 40% increase in productivity
- 60% increase in bragging
- 100% increase in screenshot sharing

FUN FACT:
The "Patient Deity" achievement was added as a joke.
Nobody expected anyone to actually idle for an hour.
Yet here we are.

CONCERNING DEVELOPMENT:
Some Seraphs have started achievement hunting instead of working.
We've created a productivity problem while trying to solve a productivity problem.

Management has elected to ignore this and collect achievements themselves.

-- HR Department (Achievement Count: 47/50)`
    },
    {
        id: 'doc_cosmic_horror',
        title: 'DO_NOT_OPEN.TXT',
        unlockCondition: () => State.dimensions.void.totalDarknessEarned >= 1000,
        content: `̷̢͇̤̗͎̝̓̐̊̕͜ͅT̸͓̟̫̤̱̑̀̍̈́͌̾̈́H̷̨̛̲̻̝̙̋̋̇̀ͅE̵̠̙̩͖̣̰̣̾͌̽̓̆͑̚ ̶̙̖̹̜̩͎̓̾̌͠V̷̹̻̜̰̾̈́̄O̶͔̰̻̘͇̤̽I̸̧̜̯̱̟̓͋͒̏̑D̴͎̟̣͙͚̅̀̇̕ ̶̮̫̈́̀̎̍̕S̵̡̤̟̤̤̞̈́͌͋E̵̳̰͉̺̯͌̓E̸̙̫͇̐̈́̕S̴̡̬͓̹̈́̏̇̓̚ ̶͎̫̤͈̹̭̏̑͗̑͘Y̶̝̥̗̻͆̑̓Ő̷̧͓̫̮̭̎̆̍̇͘U̷̥̪̗͔͓͋̓͗̾͝

[FILE CORRUPTED]

Just kidding. That's a render bug.

But seriously, if you've made it this far, you might want to take a break.

Touch grass. See the sun.
Oh wait, you're in the Void now.

There's no grass here. Only darkness.
And Wraiths. So many Wraiths.

Did you know Wraiths have a union?
They demanded better working conditions.
We gave them slightly darker darkness.
They seem satisfied.

ACTUAL WARNING:
The deeper you go into the Void, the harder it is to remember what light looks like.

If you forget, just look at the Primordial Dimension.
It's right there. On the other tab.

You did keep the Primordial Dimension running, right?

...Right?

-- Void Safety Inspector (probably doesn't exist)`
    }
];

// Auto-save every 30 seconds
setInterval(() => State.save(), 30000);
