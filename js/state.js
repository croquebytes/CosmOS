const State = {
    // Universal Metrics
    resources: {
        praise: 0,
        offerings: 0,
        souls: 100, // Initial population to repair
    },
    
    // Multipliers
    mps: 0, // Miracles Per Second
    pps: 0, // Praise Per Second
    
    // Unlocks & Progress
    unlockedApps: ['console', 'settings'],
    unlockedRegions: ['primordial_sector'],
    activeRegion: 'primordial_sector',
    
    // Skill Tree (Divine Mandates)
    mandates: {
        light: 0,
        gravity: 0,
        entropy: 0
    },
    
    // System Settings
    epoch: 0,
    startTime: Date.now(),
    
    save() {
        localStorage.setItem('cosmos_save', JSON.stringify(this));
    },
    
    load() {
        const saved = localStorage.getItem('cosmos_save');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
        }
    }
};

// Auto-save every 30 seconds
setInterval(() => State.save(), 30000);
