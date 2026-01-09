const game = {
    loop() {
        // Check Divine Intervention status
        const now = Date.now();
        const divineInterventionBonus = (State.skills.divineIntervention.active && now < State.skills.divineIntervention.endsAt) ? 2 : 1;

        // Deactivate Divine Intervention if expired
        if (State.skills.divineIntervention.active && now >= State.skills.divineIntervention.endsAt) {
            State.skills.divineIntervention.active = false;
            ui.log(`Divine Intervention expired.`);
        }

        // === PRIMORDIAL DIMENSION PRODUCTION ===
        // Calculate gains with multipliers
        const seraphBaseProduction = State.automatons.seraphProduction || 1;
        const cherubBaseProduction = State.automatons.cherubProduction || 1;
        const praiseGain = (State.pps * seraphBaseProduction * State.praiseMultiplier * divineInterventionBonus) / 60;
        const offeringGain = (State.mps * State.offeringMultiplier * divineInterventionBonus) / 60;
        const soulGain = (State.sps * cherubBaseProduction * State.soulMultiplier * divineInterventionBonus) / 60;

        State.resources.praise += praiseGain;
        State.resources.offerings += offeringGain;
        State.resources.souls += soulGain;

        // Apply resource caps
        State.resources.praise = Math.min(State.resources.praise, State.resourceCaps.praise);
        State.resources.offerings = Math.min(State.resources.offerings, State.resourceCaps.offerings);
        State.resources.souls = Math.min(State.resources.souls, State.resourceCaps.souls);

        // Track total earned
        State.totalPraiseEarned += praiseGain;
        State.totalOfferingsEarned += offeringGain;

        // === VOID DIMENSION PRODUCTION ===
        if (State.dimensions.void.unlocked) {
            const vd = State.dimensions.void;
            const wraithBaseProduction = vd.automatons.wraithProduction || 1;
            const phantomBaseProduction = vd.automatons.phantomProduction || 1;
            const darknessGain = (vd.dps * wraithBaseProduction * vd.darknessMultiplier * divineInterventionBonus) / 60;
            const shadowGain = (vd.sdps * vd.shadowMultiplier * divineInterventionBonus) / 60;
            const echoGain = (vd.eps * phantomBaseProduction * vd.echoMultiplier * divineInterventionBonus) / 60;

            vd.resources.darkness += darknessGain;
            vd.resources.shadows += shadowGain;
            vd.resources.echoes += echoGain;

            // Apply resource caps
            vd.resources.darkness = Math.min(vd.resources.darkness, vd.resourceCaps.darkness);
            vd.resources.shadows = Math.min(vd.resources.shadows, vd.resourceCaps.shadows);
            vd.resources.echoes = Math.min(vd.resources.echoes, vd.resourceCaps.echoes);

            // Track total earned
            vd.totalDarknessEarned += darknessGain;
        }

        // Check Divine Event expiration
        if (State.divineEvent && now >= State.divineEvent.expiresAt) {
            ui.hideDivineEvent();
            State.divineEvent = null;
        }

        // Check achievements and documents periodically (every 60 frames = 1 second)
        if (!this.frameCount) this.frameCount = 0;
        this.frameCount++;
        if (this.frameCount >= 60) {
            this.checkAchievements();
            this.checkDocuments();
            this.frameCount = 0;
        }

        // Check for event spawning every 5 seconds (300 frames)
        if (!this.eventSpawnCounter) this.eventSpawnCounter = 0;
        this.eventSpawnCounter++;
        if (this.eventSpawnCounter >= 300) {
            this.spawnDivineEvent();
            this.eventSpawnCounter = 0;
        }

        ui.update();
        requestAnimationFrame(() => this.loop());
    },

    manualPraise(event) {
        let clickPower = State.manualClickPower || 1;

        // If "Controlled Chaos" mandate is purchased, manual clicks = 10% of production/sec
        if (State.manualClickScaling) {
            const seraphBaseProduction = State.automatons.seraphProduction || 1;
            const productionPerSec = State.pps * seraphBaseProduction * State.praiseMultiplier;
            clickPower = Math.max(clickPower, Math.floor(productionPerSec * 0.1));
        }

        State.resources.praise += clickPower;
        State.resources.praise = Math.min(State.resources.praise, State.resourceCaps.praise);
        State.totalPraiseEarned += clickPower;
        State.totalClicks++;

        // Check if at cap
        if (State.resources.praise >= State.resourceCaps.praise) {
            ui.log(`Miracle performed: +${clickPower} Praise. (STORAGE FULL!)`);
        } else {
            ui.log(`Miracle performed: +${clickPower} Praise.`);
        }

        // Check for instant achievements (click-based)
        this.checkAchievements();

        // Visual feedback
        if (event) {
            const rect = event.target.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top;

            const isFull = State.resources.praise >= State.resourceCaps.praise;
            const displayText = isFull ? "STORAGE FULL!" : `+${clickPower}`;
            const displayColor = isFull ? "#ff4500" : "#ffd700";

            ui.showFloatingNumber(displayText, x, y, displayColor);
            ui.spawnParticles(x, y, isFull ? 5 : 3, displayColor);
        }
    },

    buyAutomator(type, event) {
        if (type === 'seraph') {
            const baseCost = 10;
            const cost = Math.floor(baseCost * Math.pow(1.15, State.automatons.seraphCount) * State.automatons.seraphCostMultiplier);

            if (State.resources.praise >= cost) {
                State.resources.praise -= cost;
                State.automatons.seraphCount++;
                State.pps += 1;
                ui.log(`Seraph assigned. Praise influx stabilized. (${State.automatons.seraphCount} total)`);
                ui.updateUpgrades(); // Refresh upgrades visibility
                this.checkAchievements(); // Check for achievements

                // Visual feedback
                if (event) {
                    const rect = event.target.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    ui.spawnParticles(x, y, 8, '#4a90e2');
                }

                // Check for milestones
                if (State.automatons.seraphCount === 1 || State.automatons.seraphCount === 10 || State.automatons.seraphCount === 25) {
                    ui.screenPulse('rgba(74, 144, 226, 0.3)');
                }
            } else {
                ui.log(`Insufficient Praise for Seraph assignment. Need ${cost}.`);
            }
        } else if (type === 'cherub') {
            const baseCost = 5;
            const cost = Math.floor(baseCost * Math.pow(1.20, State.automatons.cherubCount) * State.automatons.cherubCostMultiplier);

            if (State.resources.offerings >= cost) {
                State.resources.offerings -= cost;
                State.automatons.cherubCount++;
                State.sps += 1;
                ui.log(`Cherub compiled. Soul synthesis initiated. (${State.automatons.cherubCount} total)`);
                ui.updateUpgrades(); // Refresh upgrades visibility
                this.checkAchievements(); // Check for achievements

                // Visual feedback
                if (event) {
                    const rect = event.target.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    ui.spawnParticles(x, y, 8, '#9c27b0');
                }

                // Check for milestones
                if (State.automatons.cherubCount === 1 || State.automatons.cherubCount === 10) {
                    ui.screenPulse('rgba(156, 39, 176, 0.3)');
                }
            } else {
                ui.log(`Insufficient Offerings for Cherub compilation. Need ${cost}.`);
            }
        }
    },

    purchaseUpgrade(upgradeId, event) {
        const upgrade = UpgradeList.find(u => u.id === upgradeId);
        if (!upgrade) return;

        // Check if already purchased
        if (State.upgrades[upgradeId]) {
            ui.log("Upgrade already acquired.");
            return;
        }

        // Check if can afford
        let canAfford = true;
        for (const [resource, amount] of Object.entries(upgrade.cost)) {
            if (!State.resources[resource] || State.resources[resource] < amount) {
                canAfford = false;
                break;
            }
        }

        if (!canAfford) {
            ui.log("Insufficient resources for this upgrade.");
            return;
        }

        // Deduct cost
        for (const [resource, amount] of Object.entries(upgrade.cost)) {
            State.resources[resource] -= amount;
        }

        // Mark as purchased and apply effect
        State.upgrades[upgradeId] = true;
        upgrade.effect();

        ui.log(`Upgrade acquired: ${upgrade.name}`);
        ui.updateUpgrades(); // Refresh upgrades display
        this.checkAchievements(); // Check for achievements

        // Visual feedback
        if (event) {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            ui.spawnParticles(x, y, 12, '#4caf50');
            ui.screenPulse('rgba(76, 175, 80, 0.2)');
        }
    },

    checkAchievements() {
        AchievementList.forEach(achievement => {
            // Skip if already unlocked
            if (State.achievements[achievement.id]) return;

            // Check if conditions met
            if (achievement.check()) {
                State.achievements[achievement.id] = {
                    unlocked: true,
                    unlockedAt: Date.now()
                };
                ui.showAchievementToast(achievement);
                ui.log(`Achievement unlocked: ${achievement.name}`);
            }
        });
    },

    checkDocuments() {
        DocumentList.forEach(doc => {
            // Skip if already unlocked
            if (State.unlockedDocuments.includes(doc.id)) return;

            // Check if unlock condition met
            if (doc.unlockCondition()) {
                State.unlockedDocuments.push(doc.id);

                // Show notification
                ui.log(`New document available: ${doc.title}`);

                // Show notepad icon if not already visible
                if (!State.unlockedApps.includes('notepad')) {
                    State.unlockedApps.push('notepad');
                }
            }
        });
    },

    getSeraphCost() {
        const baseCost = 10;
        return Math.floor(baseCost * Math.pow(1.15, State.automatons.seraphCount) * State.automatons.seraphCostMultiplier);
    },

    getCherubCost() {
        const baseCost = 5;
        return Math.floor(baseCost * Math.pow(1.20, State.automatons.cherubCount) * State.automatons.cherubCostMultiplier);
    },

    activateDivineIntervention() {
        const skill = State.skills.divineIntervention;
        const now = Date.now();

        // Check if on cooldown
        if (now < skill.cooldownEndsAt) {
            const remaining = Math.ceil((skill.cooldownEndsAt - now) / 1000);
            ui.log(`Divine Intervention on cooldown. ${remaining}s remaining.`);
            return;
        }

        // Activate skill
        skill.active = true;
        skill.endsAt = now + skill.duration;
        skill.cooldownEndsAt = now + skill.duration + skill.cooldown;
        ui.log(`Divine Intervention activated! 2× production for 10 minutes.`);
        ui.screenPulse('rgba(255, 215, 0, 0.4)');
    },

    activateTemporalRift() {
        const skill = State.skills.temporalRift;
        const now = Date.now();

        // Check if on cooldown
        if (now < skill.cooldownEndsAt) {
            const remaining = Math.ceil((skill.cooldownEndsAt - now) / 1000);
            ui.log(`Temporal Rift on cooldown. ${remaining}s remaining.`);
            return;
        }

        // Simulate 1 hour of production
        const seraphBaseProduction = State.automatons.seraphProduction || 1;
        const cherubBaseProduction = State.automatons.cherubProduction || 1;
        const praiseGain = (State.pps * seraphBaseProduction * State.praiseMultiplier) * 3600;
        const offeringGain = (State.mps * State.offeringMultiplier) * 3600;
        const soulGain = (State.sps * cherubBaseProduction * State.soulMultiplier) * 3600;

        State.resources.praise = Math.min(State.resources.praise + praiseGain, State.resourceCaps.praise);
        State.resources.offerings = Math.min(State.resources.offerings + offeringGain, State.resourceCaps.offerings);
        State.resources.souls = Math.min(State.resources.souls + soulGain, State.resourceCaps.souls);

        skill.cooldownEndsAt = now + skill.cooldown;
        ui.log(`Temporal Rift opened! Simulated 1 hour of production.`);
        ui.screenPulse('rgba(138, 43, 226, 0.4)');
    },

    spawnDivineEvent() {
        // Don't spawn if one already exists
        if (State.divineEvent) return;

        // Random chance (5% per check by default, checked every 5 seconds)
        const spawnRate = State.divineEventSpawnRate || 0.05;
        if (Math.random() > spawnRate) return;

        // Random position on screen
        const x = 100 + Math.random() * (window.innerWidth - 200);
        const y = 100 + Math.random() * (window.innerHeight - 250);

        // Random reward value (10-100% of current production rate)
        const seraphBaseProduction = State.automatons.seraphProduction || 1;
        const baseReward = State.pps * seraphBaseProduction * State.praiseMultiplier * 60;
        const value = Math.floor(baseReward * (0.1 + Math.random() * 0.9));

        State.divineEvent = {
            x: x,
            y: y,
            value: Math.max(value, 10), // Minimum reward of 10
            expiresAt: Date.now() + 10000 // 10 seconds to click
        };

        ui.showDivineEvent(State.divineEvent);
    },

    clickDivineEvent() {
        if (!State.divineEvent) return;

        const event = State.divineEvent;
        State.resources.praise = Math.min(State.resources.praise + event.value, State.resourceCaps.praise);
        State.totalPraiseEarned += event.value;

        ui.log(`Divine Event claimed! +${event.value} Praise.`);
        ui.showFloatingNumber(`+${event.value}`, event.x, event.y, '#ffd700');
        ui.spawnParticles(event.x, event.y, 12, '#ffd700');
        ui.hideDivineEvent();

        State.divineEvent = null;
    },

    purchaseMandate(mandateId) {
        const mandate = MandateList.find(m => m.id === mandateId);
        if (!mandate) return;

        // Check if already purchased
        if (State.purchasedMandates[mandateId]) {
            ui.log("Mandate already enacted.");
            return;
        }

        // Check prerequisites
        for (const prereq of mandate.prerequisites) {
            if (!State.purchasedMandates[prereq]) {
                ui.log("Prerequisites not met for this mandate.");
                return;
            }
        }

        // Check if can afford
        if (State.resources.souls < mandate.cost) {
            ui.log(`Insufficient Souls. Need ${mandate.cost}.`);
            return;
        }

        // Deduct cost
        State.resources.souls -= mandate.cost;

        // Mark as purchased and apply effect
        State.purchasedMandates[mandateId] = true;
        mandate.effect();

        ui.log(`Divine Mandate enacted: ${mandate.name}`);
        ui.screenPulse('rgba(138, 43, 226, 0.3)');
        ui.updateMandates();
    },

    // === VOID DIMENSION FUNCTIONS ===
    manualVoidClick(event) {
        const vd = State.dimensions.void;
        let clickPower = vd.manualClickPower || 1;

        vd.resources.darkness += clickPower;
        vd.resources.darkness = Math.min(vd.resources.darkness, vd.resourceCaps.darkness);
        vd.totalDarknessEarned += clickPower;
        vd.totalClicks++;

        // Check if at cap
        if (vd.resources.darkness >= vd.resourceCaps.darkness) {
            ui.log(`Void embraced: +${clickPower} Darkness. (STORAGE FULL!)`, 'void');
        } else {
            ui.log(`Void embraced: +${clickPower} Darkness.`, 'void');
        }

        // Visual feedback
        if (event) {
            const rect = event.target.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top;

            const isFull = vd.resources.darkness >= vd.resourceCaps.darkness;
            const displayText = isFull ? "STORAGE FULL!" : `+${clickPower}`;
            const displayColor = isFull ? "#ff4500" : "#9c27b0";

            ui.showFloatingNumber(displayText, x, y, displayColor);
            ui.spawnParticles(x, y, isFull ? 5 : 3, displayColor);
        }
    },

    buyVoidAutomator(type, event) {
        const vd = State.dimensions.void;

        if (type === 'wraith') {
            const baseCost = 10;
            const cost = Math.floor(baseCost * Math.pow(1.15, vd.automatons.wraithCount) * vd.automatons.wraithCostMultiplier);

            if (vd.resources.darkness >= cost) {
                vd.resources.darkness -= cost;
                vd.automatons.wraithCount++;
                vd.dps += 1;
                ui.log(`Wraith summoned. Darkness flows. (${vd.automatons.wraithCount} total)`, 'void');
                ui.updateUpgrades();

                // Visual feedback
                if (event) {
                    const rect = event.target.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    ui.spawnParticles(x, y, 8, '#9c27b0');
                }

                if (vd.automatons.wraithCount === 1 || vd.automatons.wraithCount === 10) {
                    ui.screenPulse('rgba(156, 39, 176, 0.3)');
                }
            } else {
                ui.log(`Insufficient Darkness for Wraith summoning. Need ${cost}.`, 'void');
            }
        } else if (type === 'phantom') {
            const baseCost = 5;
            const cost = Math.floor(baseCost * Math.pow(1.20, vd.automatons.phantomCount) * vd.automatons.phantomCostMultiplier);

            if (vd.resources.shadows >= cost) {
                vd.resources.shadows -= cost;
                vd.automatons.phantomCount++;
                vd.eps += 1;
                ui.log(`Phantom manifested. Echoes resonate. (${vd.automatons.phantomCount} total)`, 'void');
                ui.updateUpgrades();

                // Visual feedback
                if (event) {
                    const rect = event.target.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    ui.spawnParticles(x, y, 8, '#4a148c');
                }

                if (vd.automatons.phantomCount === 1 || vd.automatons.phantomCount === 10) {
                    ui.screenPulse('rgba(74, 20, 140, 0.3)');
                }
            } else {
                ui.log(`Insufficient Shadows for Phantom manifestation. Need ${cost}.`, 'void');
            }
        }
    },

    getWraithCost() {
        const vd = State.dimensions.void;
        const baseCost = 10;
        return Math.floor(baseCost * Math.pow(1.15, vd.automatons.wraithCount) * vd.automatons.wraithCostMultiplier);
    },

    getPhantomCost() {
        const vd = State.dimensions.void;
        const baseCost = 5;
        return Math.floor(baseCost * Math.pow(1.20, vd.automatons.phantomCount) * vd.automatons.phantomCostMultiplier);
    },

    // === PRESTIGE SYSTEM ===
    calculateDivinityPoints() {
        // Formula: sqrt(totalSouls / 100) - rewards exponential growth
        const basePoints = Math.floor(Math.sqrt(State.resources.souls / 100));
        return Math.max(basePoints, 0);
    },

    canPrestige() {
        return this.calculateDivinityPoints() > 0;
    },

    performPrestige() {
        const divinityGain = this.calculateDivinityPoints();

        if (divinityGain === 0) {
            ui.log("Cannot prestige yet. Need more Souls.");
            return;
        }

        // Confirm prestige
        const confirmed = confirm(
            `Divine Reboot\n\n` +
            `You will gain ${divinityGain} Divinity Points.\n` +
            `+${(divinityGain * 10)}% to all production.\n\n` +
            `This will reset:\n` +
            `- All resources\n` +
            `- All automatons\n` +
            `- All upgrades\n` +
            `- Dimensions progress\n\n` +
            `This will KEEP:\n` +
            `- Divine Mandates\n` +
            `- Achievements\n` +
            `- Documents\n` +
            `- Divinity Points\n\n` +
            `Proceed with Divine Reboot?`
        );

        if (!confirmed) return;

        // Award divinity points
        State.prestigeLevel++;
        State.totalDivinityPoints += divinityGain;
        State.divinityPointMultiplier = 1 + (State.totalDivinityPoints * 0.1); // 10% per point

        // Reset resources
        State.resources = {
            praise: 0,
            offerings: 0,
            souls: 100
        };

        // Reset caps
        State.resourceCaps = {
            praise: 1000,
            offerings: 100,
            souls: 1000
        };

        // Reset automatons
        State.automatons = {
            seraphCount: 0,
            seraphCostMultiplier: 1,
            seraphProduction: 1,
            cherubCount: 0,
            cherubCostMultiplier: 1,
            cherubProduction: 1
        };

        // Reset production rates
        State.pps = 0;
        State.mps = 0;
        State.sps = 0;

        // Reset multipliers (will be recalculated with mandates + divinity bonus)
        State.praiseMultiplier = State.divinityPointMultiplier;
        State.offeringMultiplier = State.divinityPointMultiplier;
        State.soulMultiplier = State.divinityPointMultiplier;

        // Reset upgrades
        State.upgrades = {};

        // Reset unlocks
        State.unlockedOfferings = false;
        State.manualClickPower = 1;
        State.manualClickScaling = false;

        // Reset dimensions
        State.currentDimension = 'primordial';
        State.dimensions.void = {
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
            dps: 0,
            sdps: 0,
            eps: 0,
            darknessMultiplier: State.divinityPointMultiplier,
            shadowMultiplier: State.divinityPointMultiplier,
            echoMultiplier: State.divinityPointMultiplier,
            manualClickPower: 1,
            totalDarknessEarned: 0,
            totalClicks: 0
        };

        // Reset skills
        State.skills = {
            divineIntervention: {
                active: false,
                endsAt: 0,
                cooldownEndsAt: 0,
                cooldown: 600000,
                duration: 600000
            },
            temporalRift: {
                cooldownEndsAt: 0,
                cooldown: 1800000
            }
        };

        // Reset stats
        State.totalClicks = 0;
        State.totalPraiseEarned = 0;
        State.totalOfferingsEarned = 0;
        State.startTime = Date.now();

        // Keep mandates, achievements, documents, unlocked apps

        // Reapply mandate effects
        for (const mandateId in State.purchasedMandates) {
            const mandate = MandateList.find(m => m.id === mandateId);
            if (mandate) {
                mandate.effect();
            }
        }

        // Save and refresh
        State.save();
        ui.log(`Divine Reboot complete! Gained ${divinityGain} Divinity Points.`);
        ui.log(`All production increased by ${(divinityGain * 10)}%!`);
        ui.screenPulse('rgba(255, 215, 0, 0.6)');

        // Refresh UI
        setTimeout(() => {
            ui.syncResources();
            ui.updateUpgrades();
            ui.updateSeraphButton();
            ui.updateCherubButton();
            ui.renderDimensionContent();
        }, 500);
    }
};

// Start the game loop
game.loop();
