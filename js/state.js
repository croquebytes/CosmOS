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
        souls: 2000
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
        cherubProduction: 0.2
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

    // User Settings
    settings: {
        notationMode: 'suffix',       // 'suffix' or 'scientific'
        autosaveInterval: 30000,      // milliseconds (default 30s)
        performanceMode: false,       // reduce animations if true
    },

    // Prestige System
    prestigeLevel: 0,
    totalDivinityPoints: 0,
    divinityPointMultiplier: 1, // Bonus multiplier from prestige

    // Adoration System
    adoration: 0,
    adorationCaps: {
        cosmetics: 1000,
    },

    // Prophet System
    prophets: {
        available: 0,
        total: 0,
        assignments: {},      // { dimensionId: prophetCount }
        feedingBonus: 1,
        level: 1,
    },

    // Follower System (Per-Dimension)
    followers: {
        primordial: {
            count: 0,
            baseGrowthRate: 1,
            adorationRate: 0.1,
        },
        void: {
            count: 0,
            baseGrowthRate: 1,
            adorationRate: 0.1,
        }
    },

    // Divine Calls (Conversion)
    divineCalls: {
        lastAnswered: 0,
        cooldown: 300000,     // 5 minutes
        conversionRates: {
            souls: { cost: 10, adorationGain: 1 },
            offerings: { cost: 100, adorationGain: 1 }
        }
    },

    // Timeline System
    timelines: {
        current: 'present',
        unlocked: ['present'],
        effects: {
            past: { followerBonus: 0.5, adorationPenalty: 0.5 },
            present: { followerBonus: 1, adorationBonus: 1 },
            future: { followerBonus: 1.5, adorationPenalty: 1.5 }
        }
    },

    // Adoration Shop Purchases
    adorationShop: {
        cosmetics: {},
        utilities: {},
        prophetUpgrades: {},
        miniGames: {}
    },

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
        patchExecuted: false,
        patchUIEnabled: false // Toggle for alternate UI theme
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
        lastLoginDate: null,
        void_depth_reached: 0,
        docs_collected: 0,
        prestige_count: 0,
        taskmgr_actions: 0,
        dimensions_unlocked: 1, // Start with 1 (primordial)
        void_upgrades_bought: 0,
        trigger_any_warning: 0,
        mortals_created_total: 0,
        stability_metric: 0.0,
        attempt_repair_sector7g: 0,
        adversary_contacted: false,
        hear_hidden_boot_line: false,
        open_cms_hr_portal: false,
        delete_achievement_from_recyclebin: 0,
        discover_resign_command: 0,
        view_archived_branch: 0
    },

    // === RUNTIME TRACKING ===
    runtime: {
        startTime: Date.now(),
        totalMinutes: 0,
        lastUpdateTime: Date.now()
    },

    // === TOTAL STATS (for achievements) ===
    totalStats: {
        praiseGained: 0,
        offeringsGained: 0,
        soulsGained: 0
    },

    // === ACHIEVEMENT BONUSES ===
    achievementBonuses: {
        praiseGain: 1,
        offeringValue: 1,
        soulGain: 1,
        mandateEfficiency: 1,
        automationSpeed: 1,
        voidGain: 1,
        voidStability: 1,
        fateTokenGain: 1,
        startingResources: 1,
        globalGain: 1
    },

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

            // Deep merge prophets
            if (parsed.prophets) Object.assign(this.prophets, parsed.prophets);

            // Deep merge followers
            if (parsed.followers) {
                for (const dimKey in this.followers) {
                    if (parsed.followers[dimKey]) {
                        Object.assign(this.followers[dimKey], parsed.followers[dimKey]);
                    }
                }
            }

            // Deep merge adoration shop
            if (parsed.adorationShop) {
                if (parsed.adorationShop.cosmetics) Object.assign(this.adorationShop.cosmetics, parsed.adorationShop.cosmetics);
                if (parsed.adorationShop.utilities) Object.assign(this.adorationShop.utilities, parsed.adorationShop.utilities);
                if (parsed.adorationShop.prophetUpgrades) Object.assign(this.adorationShop.prophetUpgrades, parsed.adorationShop.prophetUpgrades);
                if (parsed.adorationShop.miniGames) Object.assign(this.adorationShop.miniGames, parsed.adorationShop.miniGames);
            }

            // Deep merge settings
            if (parsed.settings) Object.assign(this.settings, parsed.settings);

            // Deep merge casino
            if (parsed.casino) {
                Object.assign(this.casino, parsed.casino);
                if (parsed.casino.solitaire) Object.assign(this.casino.solitaire, parsed.casino.solitaire);
                if (parsed.casino.slots) Object.assign(this.casino.slots, parsed.casino.slots);
                if (parsed.casino.plinko) Object.assign(this.casino.plinko, parsed.casino.plinko);
                if (parsed.casino.hostDialogue) Object.assign(this.casino.hostDialogue, parsed.casino.hostDialogue);
            }

            // Deep merge adversary
            if (parsed.adversary) {
                Object.assign(this.adversary, parsed.adversary);
                if (parsed.adversary.barks) Object.assign(this.adversary.barks, parsed.adversary.barks);
            }

            // Deep merge taskManager
            if (parsed.taskManager) {
                Object.assign(this.taskManager, parsed.taskManager);
                if (parsed.taskManager.warnings) Object.assign(this.taskManager.warnings, parsed.taskManager.warnings);
            }

            // Deep merge recycleBin
            if (parsed.recycleBin) {
                Object.assign(this.recycleBin, parsed.recycleBin);
                if (parsed.recycleBin.sacrifices) Object.assign(this.recycleBin.sacrifices, parsed.recycleBin.sacrifices);
            }

            // Deep merge documents
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

            // Deep merge achievementProgress
            if (parsed.achievementProgress) Object.assign(this.achievementProgress, parsed.achievementProgress);

            // Deep merge runtime
            if (parsed.runtime) Object.assign(this.runtime, parsed.runtime);

            // Deep merge totalStats
            if (parsed.totalStats) Object.assign(this.totalStats, parsed.totalStats);

            // Deep merge achievementBonuses
            if (parsed.achievementBonuses) Object.assign(this.achievementBonuses, parsed.achievementBonuses);

            // Top level properties
            const skip = ['resources', 'resourceCaps', 'automatons', 'skills', 'dimensions', 'prophets', 'followers', 'adorationShop', 'settings',
                          'casino', 'adversary', 'taskManager', 'recycleBin', 'documents', 'achievementProgress', 'runtime', 'totalStats', 'achievementBonuses'];
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
        cost: { souls: 200 },
        effect: () => {
            State.dimensions.void.unlocked = true;
            if (!State.unlockedApps.includes('dimensions')) {
                State.unlockedApps.push('dimensions');
            }
            ui.log('The Void Dimension has been unlocked! Access it from the Dimension Explorer.');
        },
        visible: () => State.resources.souls >= 160 && !State.dimensions.void.unlocked
    },
    {
        id: 'globe_unlock',
        name: 'Divine Globe Access',
        description: 'Unlock the Divine Globe for managing Prophets and dimensions.',
        cost: { souls: 500, offerings: 200 },
        effect: () => {
            if (!State.unlockedApps.includes('divineglobe')) {
                State.unlockedApps.push('divineglobe');
                State.unlockedApps.push('divinecalls');
                State.unlockedApps.push('adorationshop');
            }
            State.prophets.total = 1;
            State.prophets.available = 1;
            ui.log('Divine Globe unlocked! You have received your first Prophet.');
            ui.updateDesktopIcons();
        },
        visible: () => State.resources.souls >= 400 && State.dimensions.void.unlocked
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

// === OLD ACHIEVEMENT LIST (Deprecated - replaced by new system in Phase 3) ===
// Commented out to prevent conflicts with new achievement system
/*
const OldAchievementList = [
    // This list has been replaced by the new achievement system
    // See line 1448 for the new AchievementList
];
*/

// Divine Mandates Skill Tree
const MandateList = [
    // CREATION BRANCH (Light) - Production Bonuses
    {
        id: 'creation_root',
        name: 'First Light',
        branch: 'creation',
        description: 'Begin the path of Creation. +10% Praise production.',
        cost: 100,
        prerequisites: [],
        effect: () => { State.praiseMultiplier *= 1.1; }
    },
    {
        id: 'creation_t2_left',
        name: 'Radiant Overflow',
        branch: 'creation',
        description: 'Let abundance flow. +20% Praise production.',
        cost: 200,
        prerequisites: ['creation_root'],
        effect: () => { State.praiseMultiplier *= 1.2; }
    },
    {
        id: 'creation_t2_right',
        name: 'Soul Forge',
        branch: 'creation',
        description: 'Craft souls with intention. +20% Soul production.',
        cost: 200,
        prerequisites: ['creation_root'],
        effect: () => { State.soulMultiplier *= 1.2; }
    },
    {
        id: 'creation_t3',
        name: 'Divine Catalyst',
        branch: 'creation',
        description: 'Amplify all creation. +50% to all production.',
        cost: 500,
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
        cost: 1000,
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
        cost: 100,
        prerequisites: [],
        effect: () => { State.automatons.seraphCostMultiplier *= 0.9; }
    },
    {
        id: 'maintenance_t2_left',
        name: 'Efficient Systems',
        branch: 'maintenance',
        description: 'Optimize automaton design. All automaton costs -15%.',
        cost: 200,
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
        cost: 200,
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
        cost: 500,
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
        cost: 1000,
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
        cost: 100,
        prerequisites: [],
        effect: () => { State.manualClickPower = (State.manualClickPower || 1) * 2; }
    },
    {
        id: 'entropy_t2_left',
        name: 'Reality Shift',
        branch: 'entropy',
        description: 'Bend the rules. Divine Intervention cooldown -20%.',
        cost: 200,
        prerequisites: ['entropy_root'],
        effect: () => { State.skills.divineIntervention.cooldown *= 0.8; }
    },
    {
        id: 'entropy_t2_right',
        name: 'Time Dilation',
        branch: 'entropy',
        description: 'Warp time itself. Temporal Rift cooldown -30%.',
        cost: 200,
        prerequisites: ['entropy_root'],
        effect: () => { State.skills.temporalRift.cooldown *= 0.7; }
    },
    {
        id: 'entropy_t3',
        name: 'Divine Favor',
        branch: 'entropy',
        description: 'Fortune smiles upon you. Divine Events spawn 50% more often.',
        cost: 500,
        prerequisites: ['entropy_t2_left', 'entropy_t2_right'],
        effect: () => { State.divineEventSpawnRate = (State.divineEventSpawnRate || 0.05) * 1.5; }
    },
    {
        id: 'entropy_ultimate',
        name: 'Controlled Chaos',
        branch: 'entropy',
        description: 'Master destruction. Manual clicks = 10% of production/sec.',
        cost: 1000,
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

// Adoration Shop Item List
const ShopItemList = [
    // COSMETICS
    { id: 'theme_golden', category: 'cosmetics', name: 'Golden Theme', description: 'Divine gold accents.', cost: 50, upgradable: false,
      effect: () => { document.body.classList.add('theme-golden'); } },
    { id: 'theme_void', category: 'cosmetics', name: 'Void Theme', description: 'Shadowy aesthetic.', cost: 50, upgradable: false,
      effect: () => { document.body.classList.add('theme-void'); } },
    { id: 'particles_stars', category: 'cosmetics', name: 'Star Particles', description: 'Twinkling stars on clicks.', cost: 30, upgradable: false,
      effect: () => { State.adorationShop.cosmetics.particles_stars = true; } },

    // UTILITIES
    { id: 'skill_duration', category: 'utilities', name: 'Extended Skills', description: '+20% Divine Intervention duration.', cost: 100, upgradable: true,
      effect: () => { State.skills.divineIntervention.duration *= 1.2; } },
    { id: 'skill_cooldown', category: 'utilities', name: 'Rapid Recovery', description: '-15% all skill cooldowns.', cost: 150, upgradable: true,
      effect: () => { State.skills.divineIntervention.cooldown *= 0.85; State.skills.temporalRift.cooldown *= 0.85; } },

    // PROPHET UPGRADES
    { id: 'prophet_efficiency', category: 'prophets', name: 'Prophet Training', description: '+25% Follower growth.', cost: 200, upgradable: true,
      effect: () => { for (const dim in State.followers) State.followers[dim].baseGrowthRate *= 1.25; } },
    { id: 'follower_adoration', category: 'prophets', name: 'Devoted Followers', description: '+30% Adoration generation.', cost: 250, upgradable: true,
      effect: () => { for (const dim in State.followers) State.followers[dim].adorationRate *= 1.3; } },

    // MINI-GAMES
    { id: 'minigame_solitaire', category: 'minigames', name: 'Unlock Solitaire', description: 'Classic card game with Adoration rewards.', cost: 500, upgradable: false,
      effect: () => { if (!State.unlockedApps.includes('solitaire')) State.unlockedApps.push('solitaire'); } }
];

// === CASINO HOST BARKS ===
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

// === ADVERSARY SCENE ===
const AdversaryScene = {
    sceneId: 'SCN-ADV-001',
    title: 'Mirror Login Incident',
    trigger: {
        conditions: [
            () => State.achievementProgress.prestige_count >= 5,
            () => State.achievementProgress.void_depth_reached >= 25 || State.resources.souls >= 1000,
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
                { id: 'OP-A', label: 'DENY', flag: 'hostile', text: "I don't need your help." },
                { id: 'OP-B', label: 'ASK', flag: 'curious', text: 'What does the patch do?' },
                { id: 'OP-C', label: 'ACCEPT TERMS', flag: 'complicit', text: "I'll... consider it." }
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
    ]
};

// === ADVERSARY BARKS ===
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

// === ACHIEVEMENT LIST (40 achievements across 5 tiers) ===
const AchievementList = [
    // BRONZE (12 achievements)
    { id: 'ACH-001', name: 'First Light', tier: 'Bronze', condition: () => State.totalStats.praiseGained >= 1,
      reward: () => { State.achievementBonuses.praiseGain *= 1.005; }, flavor: 'A universe begins with attention.' },
    { id: 'ACH-002', name: 'Heard (Once)', tier: 'Bronze', condition: () => State.achievementProgress.praise_clicks >= 100,
      reward: () => { State.manualClickPower *= 1.01; }, flavor: 'The first prayer is a test ping.' },
    { id: 'ACH-003', name: 'Offerings Accepted', tier: 'Bronze', condition: () => State.totalStats.offeringsGained >= 10,
      reward: () => { State.achievementBonuses.offeringValue = 1.01; }, flavor: 'The altar has a receipt printer.' },
    { id: 'ACH-004', name: 'Soul Inventory', tier: 'Bronze', condition: () => State.totalStats.soulsGained >= 1,
      reward: () => { State.achievementBonuses.soulGain = 1.01; }, flavor: 'New item acquired: conscience (optional).' },
    { id: 'ACH-005', name: 'Junior Operator', tier: 'Bronze', condition: () => State.runtime.totalMinutes >= 30,
      reward: null, flavor: "You've been here long enough to be blamed." },
    { id: 'ACH-006', name: 'Blessed Update', tier: 'Bronze', condition: () => State.achievementProgress.buy_mandate_count >= 1,
      reward: () => { State.achievementBonuses.mandateEfficiency *= 1.01; }, flavor: 'A patch is just a prayer with paperwork.' },
    { id: 'ACH-007', name: 'Department Approved', tier: 'Bronze', condition: () => State.achievementProgress.buy_seraph_count >= 1,
      reward: null, flavor: "Automation is divinity's love language." },
    { id: 'ACH-008', name: 'Cherub Pilot', tier: 'Bronze', condition: () => State.achievementProgress.buy_cherub_count >= 1,
      reward: () => { State.achievementBonuses.automationSpeed *= 1.01; }, flavor: 'Tiny hands, big consequences.' },
    { id: 'ACH-009', name: 'First Defragment', tier: 'Bronze', condition: () => State.achievementProgress.use_divine_intervention >= 1,
      reward: () => { State.skills.divineIntervention.cooldown *= 0.99; }, flavor: 'Miracles: now with less latency.' },
    { id: 'ACH-010', name: 'Temporal Glitch', tier: 'Bronze', condition: () => State.achievementProgress.use_temporal_rift >= 1,
      reward: () => { State.skills.temporalRift.duration *= 1.01; }, flavor: 'Time looked away. You moved.' },
    { id: 'ACH-011', name: 'Do Not Touch', tier: 'Bronze', condition: () => State.achievementProgress.open_taskmgr >= 1,
      reward: null, flavor: 'Curiosity is a process leak.' },
    { id: 'ACH-012', name: 'Void Tourist', tier: 'Bronze', condition: () => State.achievementProgress.enter_void >= 1,
      reward: () => { State.achievementBonuses.voidGain *= 1.01; }, flavor: 'The mirror smiled first.' },

    // SILVER (10 achievements)
    { id: 'ACH-013', name: 'Praise Economy', tier: 'Silver', condition: () => State.totalStats.praiseGained >= 1e6,
      reward: () => { State.achievementBonuses.praiseGain *= 1.02; }, flavor: 'Scale turns devotion into currency.' },
    { id: 'ACH-014', name: 'Ritual Regular', tier: 'Silver', condition: () => State.achievementProgress.daily_login_streak >= 7,
      reward: null, flavor: 'Habit is the most reliable faith.' },
    { id: 'ACH-015', name: 'Angel Factory', tier: 'Silver', condition: () => State.achievementProgress.buy_seraph_count >= 25,
      reward: () => { State.achievementBonuses.automationSpeed *= 1.03; }, flavor: 'Batch-produced holiness.' },
    { id: 'ACH-016', name: 'Mandate Collector', tier: 'Silver', condition: () => State.achievementProgress.buy_mandate_count >= 10,
      reward: () => { State.achievementBonuses.mandateEfficiency *= 1.03; }, flavor: 'Rules are easier than wisdom.' },
    { id: 'ACH-017', name: 'Void Navigator', tier: 'Silver', condition: () => State.achievementProgress.void_depth_reached >= 25,
      reward: () => { State.achievementBonuses.voidStability = 1.03; }, flavor: 'You stopped flinching.' },
    { id: 'ACH-018', name: 'Paperwork Deity', tier: 'Silver', condition: () => State.documents.collected.length >= 10,
      reward: null, flavor: 'Divinity, filed alphabetically.' },
    { id: 'ACH-019', name: 'Reroll Reality', tier: 'Silver', condition: () => State.achievementProgress.prestige_count >= 1,
      reward: () => { State.achievementBonuses.startingResources *= 1.02; }, flavor: 'You pressed reset with both hands.' },
    { id: 'ACH-020', name: 'Branching Out', tier: 'Silver', condition: () => State.achievementProgress.prestige_count >= 3,
      reward: null, flavor: 'Your past keeps happening elsewhere.' },
    { id: 'ACH-021', name: 'Luck Auditor', tier: 'Silver', condition: () => State.casino.gamesPlayed >= 200,
      reward: () => { State.achievementBonuses.fateTokenGain *= 1.05; }, flavor: 'Probability now files reports on you.' },
    { id: 'ACH-022', name: 'Edge Case', tier: 'Silver', condition: () => State.achievementProgress.trigger_any_warning >= 10,
      reward: null, flavor: 'Reality is held together by assumptions.' },

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
      reward: () => { State.achievementBonuses.globalGain *= 1.05; }, flavor: 'Diversify your realities.' },
    { id: 'ACH-029', name: 'Cosmic Defrag (Prep)', tier: 'Gold', condition: () => State.achievementProgress.prestige_count >= 7,
      reward: null, flavor: 'Your fragments are learning to align.' },
    { id: 'ACH-030', name: 'Archive Diver', tier: 'Gold', condition: () => State.achievementProgress.view_archived_branch >= 1,
      reward: null, flavor: 'You visited a world you left behind.' },

    // PLATINUM (2 achievements)
    { id: 'ACH-031', name: 'Operator of Record', tier: 'Platinum', condition: () => State.achievementProgress.prestige_count >= 10,
      reward: () => { State.achievementBonuses.startingResources *= 1.10; }, flavor: 'Your signature is on every reboot.' },
    { id: 'ACH-032', name: 'Stability Engineer', tier: 'Platinum', condition: () => State.achievementProgress.stability_metric >= 0.95,
      reward: () => { State.achievementBonuses.globalGain *= 1.10; }, flavor: "You made a gentle universe. It's suspicious." },

    // SECRET (8 achievements)
    { id: 'ACH-S-001', name: 'I Can Fix Her', tier: 'Secret', condition: () => State.achievementProgress.attempt_repair_sector7g >= 1,
      reward: null, flavor: 'You cannot.' },
    { id: 'ACH-S-002', name: 'House Edge', tier: 'Secret', condition: () => State.casino.bestWinStreak >= 10,
      reward: null, flavor: 'Fate noticed. Fate smiled.' },
    { id: 'ACH-S-003', name: 'Nihilist (Trial)', tier: 'Secret', condition: () => State.achievementProgress.delete_achievement_from_recyclebin >= 1,
      reward: null, flavor: 'You looked at meaning and clicked Remove.' },
    { id: 'ACH-S-004', name: 'The Exit That Isn\'t', tier: 'Secret', condition: () => State.achievementProgress.discover_resign_command >= 1,
      reward: null, flavor: 'Button not found. Keep working.' },
    { id: 'ACH-S-005', name: 'Mirror Login', tier: 'Secret', condition: () => State.adversary.contacted,
      reward: null, flavor: 'You typed your own name. It answered.' },
    { id: 'ACH-S-006', name: 'Checksum Lullaby', tier: 'Secret', condition: () => State.achievementProgress.hear_hidden_boot_line >= 1,
      reward: null, flavor: 'The BIOS hummed your obituary.' },
    { id: 'ACH-S-007', name: 'Employee of the Eon', tier: 'Secret', condition: () => State.achievementProgress.open_cms_hr_portal >= 1,
      reward: null, flavor: 'Your benefits include existential dread.' },
    { id: 'ACH-S-008', name: 'Lucky Actually', tier: 'Secret', condition: () => State.casino.worstLoseStreak >= 15,
      reward: null, flavor: 'Bad luck also keeps records.' }
];

// === TASK MANAGER PROCESSES ===
const TaskManagerProcesses = [
    { name: 'cosmos.exe', cpu: 12, mem: 45, status: 'Running', critical: true, desc: 'Main reality interface', endable: false },
    { name: 'praise_collector.service', cpu: 8, mem: 12, status: 'Running', critical: false, desc: 'Praise harvesting daemon', endable: true,
      onEnd: () => { State.pps *= 0.5; ui.log('[WARN] Praise collection halved.'); } },
    { name: 'seraph_automation.exe', cpu: 15, mem: 23, status: 'Running', critical: false, desc: 'Automaton orchestration', endable: true,
      onEnd: () => { State.automatons.seraphCount = 0; ui.log('[WARN] Seraph automation disabled.'); } },
    { name: 'void_mirror.service', cpu: 3, mem: 7, status: 'Running', critical: false, desc: 'Reflection consistency daemon', endable: true,
      onEnd: () => {
          ui.log('[ERROR] Mirror service terminated. Identity drift detected.');
          State.achievementProgress.trigger_any_warning++;
      }
    },
    { name: 'sector7g_indexer.exe', cpu: 1, mem: 4, status: 'Not Responding', critical: true, desc: 'Causal address indexer (CORRUPTED)', endable: false,
      onAttempt: () => {
          ui.log('[BLOCKED] Cannot end process. Index Layer protection active.');
          State.achievementProgress.attempt_repair_sector7g++;
      }
    },
    { name: 'watcher.whisperd', cpu: 0, mem: 2, status: 'Idle', critical: false, desc: 'Compliance monitoring (legacy)', endable: false,
      onAttempt: () => {
          ui.log('[INFO] Process protected by external authority.');
      }
    },
    { name: 'fate_rng.dll', cpu: 2, mem: 5, status: 'Running', critical: false, desc: 'Probability administration', endable: true,
      onEnd: () => {
          ui.log('The Host notices: "Did you just... neuter Fate? Bold."');
      }
    },
    { name: 'cms_hr_portal.service', cpu: 1, mem: 3, status: 'Running', critical: false, desc: 'Bureaucracy backend', endable: false,
      onClick: () => {
          State.achievementProgress.open_cms_hr_portal++;
      }
    },
    { name: 'divine_reboot.pending', cpu: 0, mem: 1, status: 'Suspended', critical: false, desc: 'Branch compilation queue', endable: false },
    { name: 'mortal.consciousness[cluster]', cpu: 22, mem: 34, status: 'Running', critical: false, desc: 'Simulated awareness pool', endable: true,
      onEnd: () => {
          ui.log('[ETHICAL VIOLATION] You just turned off free will. CMS will hear about this.');
          State.achievementProgress.trigger_any_warning++;
      }
    },
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

// === DOCUMENT MANIFEST ===
const DocumentManifest = [
    {
        id: 'DOC-NEW-01',
        filename: 'HR/PerformanceReview_OPERATOR.txt',
        category: 'HR',
        title: 'Quarterly Operator Evaluation (CONFIDENTIAL-ish)',
        unlockCondition: () => State.achievementProgress.prestige_count >= 1,
        tags: ['CMS', 'HR', 'Operator', 'comedy', 'bureaucracy']
    },
    {
        id: 'DOC-NEW-02',
        filename: 'Legal/Reality_TermsOfService.rtf',
        category: 'Legal',
        title: 'CosmOS™ Reality Interface — Terms of Service (Excerpted)',
        unlockCondition: () => State.achievementProgress.prestige_count >= 2,
        tags: ['CMS', 'legal', 'prestige', 'branching']
    },
    {
        id: 'DOC-NEW-03',
        filename: 'Logs/Sector7G_Maintenance.log',
        category: 'Logs',
        title: 'Sector 7G Maintenance Log (Recovered)',
        unlockCondition: () => State.achievementProgress.attempt_repair_sector7g >= 1,
        tags: ['Sector7G', 'maintenance', 'corruption', 'horror-lite']
    },
    {
        id: 'DOC-NEW-04',
        filename: 'Incidents/VoidDimension_Report.REDACTED',
        category: 'Incident',
        title: 'Incident Report: Void Dimension Entry (REDACTED)',
        unlockCondition: () => State.achievementProgress.void_depth_reached >= 25,
        tags: ['Void', 'Watchers', 'redaction', 'bureaucracy']
    },
    {
        id: 'DOC-NEW-05',
        filename: 'Inbox/Message_From_NULL.OPERATOR.eml',
        category: 'Inbox',
        title: 'Email: Message From NULL.OPERATOR',
        unlockCondition: () => State.achievementProgress.prestige_count >= 5,
        tags: ['Adversary', 'mirror', 'prestige', 'threat']
    },
    {
        id: 'DOC-NEW-06',
        filename: 'Training/Operator_Onboarding_Quickstart.md',
        category: 'Training',
        title: 'Operator Onboarding — Quickstart (v4.2.0.69)',
        unlockCondition: () => true, // Always unlocked
        tags: ['CMS', 'training', 'operator', 'systems']
    },
    {
        id: 'DOC-NEW-07',
        filename: 'Incidents/Seraph_Autonomy_Incident_32B.txt',
        category: 'Incident',
        title: 'Incident: Seraph Autonomy (32B)',
        unlockCondition: () => State.achievementProgress.buy_seraph_count >= 25,
        tags: ['Seraph', 'automation', 'self-awareness', 'foreshadow']
    },
    {
        id: 'DOC-NEW-08',
        filename: 'Legal/Prestige_Addendum_ThreeLayers.rtf',
        category: 'Legal',
        title: 'Addendum: Divine Reboot is Branch Compilation',
        unlockCondition: () => State.achievementProgress.prestige_count >= 3,
        tags: ['prestige', 'branching', 'layers']
    },
    {
        id: 'DOC-NEW-09',
        filename: 'Memos/Watcher_Protocol_Broadcast.msg',
        category: 'Memo',
        title: 'Broadcast: WATCHER PROTOCOL (Partially Decoded)',
        unlockCondition: () => State.casino.hostDialogue.loreWhispersHeard.length >= 1 || State.taskManager.openCount >= 5,
        tags: ['Watchers', 'whisper', 'protocol', 'mystery']
    },
    {
        id: 'DOC-NEW-10',
        filename: 'Ads/InfernalSystemsPro_Flyer.html',
        category: 'Ad',
        title: 'Advertisement: Infernal Systems Pro™',
        unlockCondition: () => State.documents.collected.length >= 5 || State.casino.visited,
        tags: ['competitors', 'humor', 'worldbuilding']
    },
    {
        id: 'DOC-NEW-11',
        filename: 'Logs/void_mirror.service.trace',
        category: 'Logs',
        title: 'Trace: void_mirror.service (Shadow Instance)',
        unlockCondition: () => State.adversary.contacted || State.achievementProgress.void_depth_reached >= 25,
        tags: ['void_mirror', 'adversary', 'duplicate session', 'technical']
    },
    {
        id: 'DOC-NEW-12',
        filename: 'Casino/HouseRules_and_Payouts.md',
        category: 'Casino',
        title: 'Fate\'s Casino — House Rules & Payouts',
        unlockCondition: () => State.casino.visited,
        tags: ['casino', 'fate', 'rules', 'easter eggs']
    },
    {
        id: 'DOC-NEW-13',
        filename: 'Archive/Branch_Postmortem_Alpha-2.md',
        category: 'Archive',
        title: 'Archived Branch Postmortem: ALPHA-2',
        unlockCondition: () => State.achievementProgress.prestige_count >= 6 || State.achievementProgress.view_archived_branch >= 1,
        tags: ['archive', 'branch', 'postmortem', 'previous operators']
    },
    {
        id: 'DOC-NEW-14',
        filename: 'HR/Ticket_HR-VOID-7781.txt',
        category: 'HR',
        title: 'HR Ticket: Unauthorized Self-Encounter (HR-VOID-7781)',
        unlockCondition: () => State.adversary.sceneCompleted,
        tags: ['HR', 'incident', 'comedy', 'adversary']
    },
    {
        id: 'DOC-NEW-15',
        filename: 'System/README_DO_NOT_SHIP.txt',
        category: 'System',
        title: 'README_DO_NOT_SHIP (Internal CMS Dev Notes)',
        unlockCondition: () => State.documents.collected.length >= 10,
        tags: ['devnotes', 'meta', 'CMS', 'worldbuilding']
    }
];

// Auto-save manager
let autosaveIntervalId = null;

function setupAutosave() {
    if (autosaveIntervalId) {
        clearInterval(autosaveIntervalId);
    }
    const interval = State.settings?.autosaveInterval || 30000;
    autosaveIntervalId = setInterval(() => State.save(), interval);
}

// Initialize autosave
setupAutosave();
