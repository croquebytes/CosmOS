const game = {
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    ensureLoopState() {
        if (!State.loopSystems) {
            State.loopSystems = {};
        }

        const loops = State.loopSystems;
        loops.miracleStreak = Number.isFinite(loops.miracleStreak) ? loops.miracleStreak : 0;
        loops.bestMiracleStreak = Number.isFinite(loops.bestMiracleStreak) ? loops.bestMiracleStreak : 0;
        loops.lastMiracleClickAt = Number.isFinite(loops.lastMiracleClickAt) ? loops.lastMiracleClickAt : 0;
        loops.lastStreakDecayAt = Number.isFinite(loops.lastStreakDecayAt) ? loops.lastStreakDecayAt : 0;

        loops.divineEventChain = Number.isFinite(loops.divineEventChain) ? loops.divineEventChain : 0;
        loops.bestDivineEventChain = Number.isFinite(loops.bestDivineEventChain) ? loops.bestDivineEventChain : 0;
        loops.lastDivineEventClaimAt = Number.isFinite(loops.lastDivineEventClaimAt) ? loops.lastDivineEventClaimAt : 0;
        loops.totalDivineEventsClaimed = Number.isFinite(loops.totalDivineEventsClaimed) ? loops.totalDivineEventsClaimed : 0;

        loops.overclock = loops.overclock || {};
        loops.overclock.charge = Number.isFinite(loops.overclock.charge) ? loops.overclock.charge : 0;
        loops.overclock.charge = Math.max(0, Math.min(100, loops.overclock.charge));
        loops.overclock.active = !!loops.overclock.active;
        loops.overclock.endsAt = Number.isFinite(loops.overclock.endsAt) ? loops.overclock.endsAt : 0;
        loops.overclock.duration = Number.isFinite(loops.overclock.duration) ? loops.overclock.duration : 30000;

        loops.directives = loops.directives || {};
        loops.directives.active = (loops.directives.active && typeof loops.directives.active === 'object') ? loops.directives.active : null;
        loops.directives.completed = Number.isFinite(loops.directives.completed) ? loops.directives.completed : 0;
        loops.directives.rerolls = Number.isFinite(loops.directives.rerolls) ? loops.directives.rerolls : 0;
        loops.directives.lastCompletedAt = Number.isFinite(loops.directives.lastCompletedAt) ? loops.directives.lastCompletedAt : 0;
    },

    getMiracleStreakMultiplier() {
        this.ensureLoopState();
        return 1 + Math.min(1.5, State.loopSystems.miracleStreak * 0.04);
    },

    getStreakProductionMultiplier() {
        this.ensureLoopState();
        return 1 + Math.min(0.35, State.loopSystems.miracleStreak * 0.007);
    },

    getOverclockProductionMultiplier(now = Date.now()) {
        this.ensureLoopState();
        const overclock = State.loopSystems.overclock;
        return (overclock.active && now < overclock.endsAt) ? 1.5 : 1;
    },

    gainOverclockCharge(amount, announceReady = true) {
        this.ensureLoopState();
        const overclock = State.loopSystems.overclock;
        const before = overclock.charge;
        overclock.charge = Math.max(0, Math.min(100, overclock.charge + amount));

        if (announceReady && before < 100 && overclock.charge >= 100) {
            ui.log('Celestial Overclock ready. Trigger it from Active Loops.');
        }
    },

    activateOverclock() {
        this.ensureLoopState();
        const loops = State.loopSystems;
        const now = Date.now();

        if (loops.overclock.active && now < loops.overclock.endsAt) {
            const remaining = Math.ceil((loops.overclock.endsAt - now) / 1000);
            ui.log(`Celestial Overclock already active. ${remaining}s remaining.`);
            return;
        }

        if (loops.overclock.charge < 100) {
            ui.log(`Overclock requires 100 charge. Current: ${Math.floor(loops.overclock.charge)}.`);
            return;
        }

        loops.overclock.charge = 0;
        loops.overclock.active = true;
        loops.overclock.endsAt = now + loops.overclock.duration;

        ui.log('Celestial Overclock engaged! +50% production, stronger miracles for 30s.');
        ui.screenPulse('rgba(255, 153, 0, 0.35)');
    },

    ensureDirective() {
        this.ensureLoopState();
        if (!State.loopSystems.directives.active) {
            this.generateDirective(true);
        }
    },

    generateDirective(force = false) {
        this.ensureLoopState();
        const loops = State.loopSystems;

        if (!force && loops.directives.active) {
            return loops.directives.active;
        }

        const pps = Math.max(1, State.pps * (State.automatons.seraphProduction || 1) * State.praiseMultiplier);
        const directives = [
            {
                type: 'manual_clicks',
                label: 'Perform Miracles',
                mode: 'delta',
                current: () => State.totalClicks,
                target: () => this.randomInt(20, 60),
                rewardScale: 1
            },
            {
                type: 'praise_earned',
                label: 'Generate Praise',
                mode: 'delta',
                current: () => Math.floor(State.totalPraiseEarned),
                target: () => this.randomInt(400, 1200) + Math.floor(pps * 15),
                rewardScale: 1.3
            },
            {
                type: 'seraph_owned',
                label: 'Commission Seraphs',
                mode: 'absolute',
                current: () => State.automatons.seraphCount,
                target: () => State.automatons.seraphCount + this.randomInt(1, Math.max(1, Math.min(5, Math.floor(State.automatons.seraphCount / 8) + 1))),
                rewardScale: 1.2
            },
            {
                type: 'divine_events',
                label: 'Claim Divine Events',
                mode: 'delta',
                current: () => State.loopSystems.totalDivineEventsClaimed,
                target: () => this.randomInt(1, 3),
                rewardScale: 1.1
            }
        ];

        if (State.unlockedOfferings) {
            directives.push({
                type: 'cherub_owned',
                label: 'Compile Cherubs',
                mode: 'absolute',
                current: () => State.automatons.cherubCount,
                target: () => State.automatons.cherubCount + this.randomInt(1, Math.max(1, Math.min(4, Math.floor(State.automatons.cherubCount / 8) + 1))),
                rewardScale: 1.15
            });
        }

        const selected = directives[this.randomInt(0, directives.length - 1)];
        const startValue = selected.current();
        const target = Math.max(1, selected.target());

        const progression = Math.max(1, Math.log10(State.totalPraiseEarned + 100));
        const baseReward = Math.max(40, Math.floor((30 + pps * 6) * progression * selected.rewardScale));
        const reward = {
            praise: Math.floor(baseReward),
            offerings: State.unlockedOfferings ? Math.floor(baseReward / 8) : 0,
            souls: Math.max(0, Math.floor(baseReward / 20)),
            adoration: State.unlockedApps.includes('divinecalls') ? this.randomInt(0, 3) : 0,
            charge: this.randomInt(16, 30)
        };

        let title = `${selected.label} (${target})`;
        if (selected.mode === 'absolute') {
            title = `${selected.label} to ${target}`;
        }

        loops.directives.active = {
            id: `directive_${Date.now()}_${this.randomInt(100, 999)}`,
            type: selected.type,
            mode: selected.mode,
            title,
            startValue,
            target,
            reward,
            completed: false,
            announced: false
        };

        ui.log(`[Directive] ${title}`);
        return loops.directives.active;
    },

    getDirectiveCurrentValue(directive) {
        if (!directive) return 0;

        switch (directive.type) {
            case 'manual_clicks':
                return State.totalClicks;
            case 'praise_earned':
                return Math.floor(State.totalPraiseEarned);
            case 'seraph_owned':
                return State.automatons.seraphCount;
            case 'cherub_owned':
                return State.automatons.cherubCount;
            case 'divine_events':
                return State.loopSystems.totalDivineEventsClaimed;
            default:
                return 0;
        }
    },

    getDirectiveProgress(directive = null) {
        this.ensureLoopState();
        const activeDirective = directive || State.loopSystems.directives.active;
        if (!activeDirective) {
            return { current: 0, target: 1, ratio: 0, completed: false };
        }

        const absoluteCurrent = this.getDirectiveCurrentValue(activeDirective);
        let current = absoluteCurrent;

        if (activeDirective.mode === 'delta') {
            current = Math.max(0, absoluteCurrent - (activeDirective.startValue || 0));
        }

        const target = Math.max(1, activeDirective.target || 1);
        const completed = current >= target;
        const ratio = Math.max(0, Math.min(1, current / target));

        return { current, target, ratio, completed };
    },

    getDirectiveRewardText(directive = null) {
        this.ensureLoopState();
        const activeDirective = directive || State.loopSystems.directives.active;
        if (!activeDirective || !activeDirective.reward) return 'Reward: --';

        const reward = activeDirective.reward;
        const parts = [];

        if (reward.praise > 0) parts.push(`+${Math.floor(reward.praise)} Praise`);
        if (reward.offerings > 0) parts.push(`+${Math.floor(reward.offerings)} Offerings`);
        if (reward.souls > 0) parts.push(`+${Math.floor(reward.souls)} Souls`);
        if (reward.adoration > 0) parts.push(`+${Math.floor(reward.adoration)} Adoration`);
        if (reward.charge > 0) parts.push(`+${Math.floor(reward.charge)} Charge`);

        return parts.length ? `Reward: ${parts.join(' • ')}` : 'Reward: --';
    },

    updateDirectiveProgress() {
        this.ensureLoopState();
        const directive = State.loopSystems.directives.active;
        if (!directive) {
            return;
        }

        const progress = this.getDirectiveProgress(directive);
        if (!directive.completed && progress.completed) {
            directive.completed = true;
            if (!directive.announced) {
                directive.announced = true;
                ui.log(`[Directive Complete] ${directive.title}`);
                ui.screenPulse('rgba(76, 175, 80, 0.22)');
            }
        }
    },

    claimDirectiveReward() {
        this.ensureLoopState();
        const loops = State.loopSystems;
        const directive = loops.directives.active;

        if (!directive) {
            ui.log('No active directive.');
            return;
        }

        const progress = this.getDirectiveProgress(directive);
        if (!progress.completed) {
            ui.log(`Directive incomplete (${progress.current}/${progress.target}).`);
            return;
        }

        const reward = directive.reward || {};

        if (reward.praise > 0) {
            State.resources.praise = Math.min(State.resourceCaps.praise, State.resources.praise + reward.praise);
            State.totalPraiseEarned += reward.praise;
            State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + reward.praise;
        }
        if (reward.offerings > 0) {
            State.resources.offerings = Math.min(State.resourceCaps.offerings, State.resources.offerings + reward.offerings);
            State.totalOfferingsEarned += reward.offerings;
            State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + reward.offerings;
        }
        if (reward.souls > 0) {
            State.resources.souls = Math.min(State.resourceCaps.souls, State.resources.souls + reward.souls);
            State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + reward.souls;
        }
        if (reward.adoration > 0) {
            State.adoration = Math.min(State.adorationCaps.cosmetics, State.adoration + reward.adoration);
        }
        if (reward.charge > 0) {
            this.gainOverclockCharge(reward.charge);
        }

        loops.directives.completed += 1;
        loops.directives.lastCompletedAt = Date.now();

        if (Math.random() < 0.18) {
            const bonusCharge = this.randomInt(5, 15);
            this.gainOverclockCharge(bonusCharge, false);
            ui.log(`[Surprise Cache] +${bonusCharge} bonus Overclock charge.`);
        }

        ui.log(`[Directive Claimed] ${directive.title}`);
        loops.directives.active = null;
        this.generateDirective(true);
        this.checkAchievements();
    },

    rerollDirective() {
        this.ensureLoopState();
        const loops = State.loopSystems;
        const directive = loops.directives.active;

        if (!directive) {
            this.generateDirective(true);
            return;
        }

        if (directive.completed) {
            ui.log('Claim completed directive before rerolling.');
            return;
        }

        if (loops.overclock.charge < 10) {
            ui.log('Reroll requires 10 Overclock charge.');
            return;
        }

        loops.overclock.charge -= 10;
        loops.directives.rerolls += 1;
        this.generateDirective(true);
        ui.log('[Directive] Rerolled.');
    },

    processLoopDecay(now) {
        this.ensureLoopState();
        const loops = State.loopSystems;

        if (loops.overclock.active && now >= loops.overclock.endsAt) {
            loops.overclock.active = false;
            ui.log('Celestial Overclock expired.');
        }

        if (loops.miracleStreak > 0) {
            const idleMs = now - loops.lastMiracleClickAt;
            if (idleMs > 4000) {
                if (!loops.lastStreakDecayAt || loops.lastStreakDecayAt < (loops.lastMiracleClickAt + 4000)) {
                    loops.lastStreakDecayAt = loops.lastMiracleClickAt + 4000;
                }

                while ((loops.lastStreakDecayAt + 1000) <= now && loops.miracleStreak > 0) {
                    loops.miracleStreak -= 1;
                    loops.lastStreakDecayAt += 1000;
                }
            } else {
                loops.lastStreakDecayAt = now;
            }
        }

        if (loops.divineEventChain > 0 && now - loops.lastDivineEventClaimAt > 25000) {
            loops.divineEventChain = 0;
        }
    },

    loop() {
        this.ensureLoopState();

        const now = Date.now();
        const divineInterventionBonus = (State.skills.divineIntervention.active && now < State.skills.divineIntervention.endsAt) ? 2 : 1;

        if (State.skills.divineIntervention.active && now >= State.skills.divineIntervention.endsAt) {
            State.skills.divineIntervention.active = false;
            ui.log(`Divine Intervention expired.`);
        }

        this.processLoopDecay(now);
        this.ensureDirective();

        const achievementBonuses = State.achievementBonuses || {};
        const globalGainBonus = achievementBonuses.globalGain || 1;
        const automationSpeedBonus = achievementBonuses.automationSpeed || 1;
        const streakProductionBonus = this.getStreakProductionMultiplier();
        const overclockProductionBonus = this.getOverclockProductionMultiplier(now);
        const totalProductionBonus = divineInterventionBonus * automationSpeedBonus * streakProductionBonus * overclockProductionBonus;

        // === PRIMORDIAL DIMENSION PRODUCTION ===
        const seraphBaseProduction = State.automatons.seraphProduction || 1;
        const cherubBaseProduction = State.automatons.cherubProduction || 1;
        const praiseGain = (State.pps * seraphBaseProduction * State.praiseMultiplier * totalProductionBonus *
            (achievementBonuses.praiseGain || 1) * globalGainBonus) / 60;
        const offeringGain = (State.mps * State.offeringMultiplier * totalProductionBonus *
            (achievementBonuses.offeringValue || 1) * globalGainBonus) / 60;
        const soulGain = (State.sps * cherubBaseProduction * State.soulMultiplier * totalProductionBonus *
            (achievementBonuses.soulGain || 1) * globalGainBonus) / 60;

        State.resources.praise += praiseGain;
        State.resources.offerings += offeringGain;
        State.resources.souls += soulGain;

        State.resources.praise = Math.min(State.resources.praise, State.resourceCaps.praise);
        State.resources.offerings = Math.min(State.resources.offerings, State.resourceCaps.offerings);
        State.resources.souls = Math.min(State.resources.souls, State.resourceCaps.souls);

        State.totalPraiseEarned += praiseGain;
        State.totalOfferingsEarned += offeringGain;
        State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + praiseGain;
        State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + offeringGain;
        State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + soulGain;

        // === VOID DIMENSION PRODUCTION ===
        if (State.dimensions.void.unlocked) {
            const vd = State.dimensions.void;
            const wraithBaseProduction = vd.automatons.wraithProduction || 1;
            const phantomBaseProduction = vd.automatons.phantomProduction || 1;
            const voidBonus = totalProductionBonus * (achievementBonuses.voidGain || 1) * (achievementBonuses.voidStability || 1) * globalGainBonus;
            const darknessGain = (vd.dps * wraithBaseProduction * vd.darknessMultiplier * voidBonus) / 60;
            const shadowGain = (vd.sdps * vd.shadowMultiplier * voidBonus) / 60;
            const echoGain = (vd.eps * phantomBaseProduction * vd.echoMultiplier * voidBonus) / 60;

            vd.resources.darkness += darknessGain;
            vd.resources.shadows += shadowGain;
            vd.resources.echoes += echoGain;

            vd.resources.darkness = Math.min(vd.resources.darkness, vd.resourceCaps.darkness);
            vd.resources.shadows = Math.min(vd.resources.shadows, vd.resourceCaps.shadows);
            vd.resources.echoes = Math.min(vd.resources.echoes, vd.resourceCaps.echoes);
            vd.totalDarknessEarned += darknessGain;
        }

        // === PROPHET & FOLLOWER PRODUCTION ===
        for (const dimKey in State.followers) {
            const followerData = State.followers[dimKey];
            const assignedProphets = State.prophets.assignments[dimKey] || 0;
            const timelineBonus = State.timelines.effects[State.timelines.current].followerBonus || 1;

            const followerGain = (assignedProphets * followerData.baseGrowthRate *
                                 State.prophets.feedingBonus * timelineBonus * globalGainBonus) / 60;
            followerData.count += followerGain;
        }

        // === ADORATION PRODUCTION ===
        let totalAdorationGain = 0;
        for (const dimKey in State.followers) {
            const followerData = State.followers[dimKey];
            const adorationFromDim = (followerData.count * followerData.adorationRate) / 60;
            totalAdorationGain += adorationFromDim;
        }

        const timelineAdorationBonus = State.timelines.effects[State.timelines.current].adorationBonus || 1;
        State.adoration += totalAdorationGain * timelineAdorationBonus * globalGainBonus;
        State.adoration = Math.min(State.adoration, State.adorationCaps.cosmetics);

        if (State.divineEvent && now >= State.divineEvent.expiresAt) {
            ui.hideDivineEvent();
            State.divineEvent = null;
        }

        if (!this.frameCount) this.frameCount = 0;
        this.frameCount++;
        if (this.frameCount >= 60) {
            const runtimeMinutes = Math.floor((Date.now() - State.startTime) / 60000);
            State.runtime.totalMinutes = runtimeMinutes;

            this.updateDirectiveProgress();
            this.checkAchievements();
            this.checkDocuments();
            this.frameCount = 0;
        }

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
        this.ensureLoopState();
        const loops = State.loopSystems;
        const now = Date.now();

        if (now - loops.lastMiracleClickAt <= 2500) {
            loops.miracleStreak += 1;
        } else {
            loops.miracleStreak = 1;
        }
        loops.lastMiracleClickAt = now;
        loops.lastStreakDecayAt = now;
        loops.bestMiracleStreak = Math.max(loops.bestMiracleStreak, loops.miracleStreak);

        let clickPower = State.manualClickPower || 1;

        if (State.manualClickScaling) {
            const seraphBaseProduction = State.automatons.seraphProduction || 1;
            const productionPerSec = State.pps * seraphBaseProduction * State.praiseMultiplier;
            clickPower = Math.max(clickPower, Math.floor(productionPerSec * 0.1));
        }

        const streakMultiplier = this.getMiracleStreakMultiplier();
        const overclockMultiplier = (loops.overclock.active && now < loops.overclock.endsAt) ? 2 : 1;
        const achievementMultiplier = (State.achievementBonuses?.praiseGain || 1) * (State.achievementBonuses?.globalGain || 1);
        clickPower = Math.max(1, Math.floor(clickPower * streakMultiplier * overclockMultiplier * achievementMultiplier));

        State.resources.praise += clickPower;
        State.resources.praise = Math.min(State.resources.praise, State.resourceCaps.praise);
        State.totalPraiseEarned += clickPower;
        State.totalClicks++;

        State.achievementProgress.praise_clicks = (State.achievementProgress.praise_clicks || 0) + 1;
        State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + clickPower;

        this.gainOverclockCharge(0.9 + (loops.miracleStreak * 0.05));
        this.updateDirectiveProgress();

        const bonusParts = [];
        if (streakMultiplier > 1.01) bonusParts.push(`Streak ${streakMultiplier.toFixed(2)}×`);
        if (overclockMultiplier > 1) bonusParts.push('Overclock');
        const bonusText = bonusParts.length ? ` [${bonusParts.join(' | ')}]` : '';

        if (State.resources.praise >= State.resourceCaps.praise) {
            ui.log(`Miracle performed: +${clickPower} Praise. (STORAGE FULL!)${bonusText}`);
        } else {
            ui.log(`Miracle performed: +${clickPower} Praise.${bonusText}`);
        }

        this.checkAchievements();

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

                // Track for achievements
                State.achievementProgress.buy_seraph_count = (State.achievementProgress.buy_seraph_count || 0) + 1;

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

                // Track for achievements
                State.achievementProgress.buy_cherub_count = (State.achievementProgress.buy_cherub_count || 0) + 1;

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
            try {
                if (achievement.condition && achievement.condition()) {
                    this.unlockAchievement(achievement.id);
                }
            } catch (e) {
                // Condition check failed, skip silently
            }
        });
    },

    unlockAchievement(achId) {
        const achievement = AchievementList.find(a => a.id === achId);
        if (!achievement) {
            console.error(`Achievement ${achId} not found`);
            return false;
        }

        // Skip if already unlocked
        if (State.achievements[achievement.id]) {
            return false;
        }

        // Mark as unlocked
        State.achievements[achievement.id] = {
            unlocked: true,
            unlockedAt: Date.now(),
            tier: achievement.tier
        };

        // Apply reward if exists
        if (achievement.reward) {
            try {
                achievement.reward();
            } catch (e) {
                console.error(`Achievement reward error for ${achId}:`, e);
            }
        }

        // Show notification
        ui.showAchievementToast(achievement);
        ui.log(`[ACHIEVEMENT] ${achievement.name}`);

        // Update achievement progress trackers
        const tierCounts = {
            Bronze: 0,
            Silver: 0,
            Gold: 0,
            Platinum: 0,
            Secret: 0
        };

        for (const id in State.achievements) {
            const ach = AchievementList.find(a => a.id === id);
            if (ach && ach.tier) {
                tierCounts[ach.tier]++;
            }
        }

        State.achievementProgress.total_achievements = Object.keys(State.achievements).length;

        State.save();
        return true;
    },

    checkDocuments() {
        // Call the new document unlock system
        this.checkDocumentUnlocks();

        // Show notepad icon if documents are unlocked
        if (State.documents.collected.length > 0 && !State.unlockedApps.includes('notepad')) {
            State.unlockedApps.push('notepad');
        }
    },

    getSeraphCost() {
        const baseCost = 10;
        return Math.floor(baseCost * Math.pow(1.15, State.automatons.seraphCount) * State.automatons.seraphCostMultiplier);
    },

    getCherubCost() {
        const baseCost = 5;
        return Math.floor(baseCost * Math.pow(1.20, State.automatons.cherubCount) * State.automatons.cherubCostMultiplier);
    },

    // Calculate total cost for buying N automatons (geometric series)
    calculateBulkCost(baseCost, growthRate, currentCount, quantity, costMultiplier) {
        let total = 0;
        for (let i = 0; i < quantity; i++) {
            total += Math.floor(baseCost * Math.pow(growthRate, currentCount + i) * costMultiplier);
        }
        return total;
    },

    // Calculate max affordable automatons
    getMaxAffordable(baseCost, growthRate, currentCount, currentResource, costMultiplier) {
        let count = 0;
        let totalCost = 0;

        while (true) {
            const nextCost = Math.floor(baseCost * Math.pow(growthRate, currentCount + count) * costMultiplier);
            if (totalCost + nextCost > currentResource) break;
            totalCost += nextCost;
            count++;
            if (count >= 1000) break; // Safety limit
        }

        return count;
    },

    // Buy multiple automatons at once
    buyAutomatorBulk(type, quantity) {
        if (type === 'seraph') {
            const baseCost = 10;
            const growthRate = 1.15;

            let buyAmount = quantity;
            if (quantity === 'max') {
                buyAmount = this.getMaxAffordable(baseCost, growthRate, State.automatons.seraphCount,
                    State.resources.praise, State.automatons.seraphCostMultiplier);
            }

            if (buyAmount === 0) {
                ui.log(`Cannot afford any Seraphs.`);
                return;
            }

            const totalCost = this.calculateBulkCost(baseCost, growthRate, State.automatons.seraphCount,
                buyAmount, State.automatons.seraphCostMultiplier);

            if (State.resources.praise >= totalCost) {
                State.resources.praise -= totalCost;
                State.automatons.seraphCount += buyAmount;
                State.pps += buyAmount;
                ui.log(`${buyAmount} Seraphs assigned. Praise influx stabilized. (${State.automatons.seraphCount} total)`);
                ui.updateUpgrades();
                this.checkAchievements();
                ui.screenPulse('rgba(74, 144, 226, 0.3)');
            }
        } else if (type === 'cherub') {
            const baseCost = 5;
            const growthRate = 1.20;

            let buyAmount = quantity;
            if (quantity === 'max') {
                buyAmount = this.getMaxAffordable(baseCost, growthRate, State.automatons.cherubCount,
                    State.resources.offerings, State.automatons.cherubCostMultiplier);
            }

            if (buyAmount === 0) {
                ui.log(`Cannot afford any Cherubs.`);
                return;
            }

            const totalCost = this.calculateBulkCost(baseCost, growthRate, State.automatons.cherubCount,
                buyAmount, State.automatons.cherubCostMultiplier);

            if (State.resources.offerings >= totalCost) {
                State.resources.offerings -= totalCost;
                State.automatons.cherubCount += buyAmount;
                State.sps += buyAmount;
                ui.log(`${buyAmount} Cherubs compiled. Soul synthesis initiated. (${State.automatons.cherubCount} total)`);
                ui.updateUpgrades();
                this.checkAchievements();
                ui.screenPulse('rgba(156, 39, 176, 0.3)');
            }
        }
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

        // Track for achievements
        State.achievementProgress.use_divine_intervention = (State.achievementProgress.use_divine_intervention || 0) + 1;

        ui.log(`Divine Intervention activated! 2× production for 10 minutes.`);
        ui.screenPulse('rgba(255, 215, 0, 0.4)');
    },

    activateTemporalRift() {
        this.ensureLoopState();
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
        const achievementBonuses = State.achievementBonuses || {};
        const globalGainBonus = achievementBonuses.globalGain || 1;
        const totalBonus = this.getStreakProductionMultiplier() * this.getOverclockProductionMultiplier(now) * (achievementBonuses.automationSpeed || 1);
        const praiseGain = (State.pps * seraphBaseProduction * State.praiseMultiplier * totalBonus * (achievementBonuses.praiseGain || 1) * globalGainBonus) * 3600;
        const offeringGain = (State.mps * State.offeringMultiplier * totalBonus * (achievementBonuses.offeringValue || 1) * globalGainBonus) * 3600;
        const soulGain = (State.sps * cherubBaseProduction * State.soulMultiplier * totalBonus * (achievementBonuses.soulGain || 1) * globalGainBonus) * 3600;

        State.resources.praise = Math.min(State.resources.praise + praiseGain, State.resourceCaps.praise);
        State.resources.offerings = Math.min(State.resources.offerings + offeringGain, State.resourceCaps.offerings);
        State.resources.souls = Math.min(State.resources.souls + soulGain, State.resourceCaps.souls);
        State.totalPraiseEarned += praiseGain;
        State.totalOfferingsEarned += offeringGain;
        State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + praiseGain;
        State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + offeringGain;
        State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + soulGain;

        // Track for achievements
        State.achievementProgress.use_temporal_rift = (State.achievementProgress.use_temporal_rift || 0) + 1;
        this.gainOverclockCharge(12);

        skill.cooldownEndsAt = now + skill.cooldown;
        ui.log(`Temporal Rift opened! Simulated 1 hour of production.`);
        ui.screenPulse('rgba(138, 43, 226, 0.4)');
    },

    spawnDivineEvent() {
        this.ensureLoopState();

        // Don't spawn if one already exists
        if (State.divineEvent) return;

        // Random chance (5% per check by default, checked every 5 seconds)
        const loops = State.loopSystems;
        const chainBoost = Math.min(0.06, loops.divineEventChain * 0.004);
        const streakBoost = Math.min(0.05, loops.miracleStreak * 0.0015);
        const overclockBoost = loops.overclock.active ? 0.02 : 0;
        const spawnRate = Math.min(0.35, (State.divineEventSpawnRate || 0.05) + chainBoost + streakBoost + overclockBoost);
        if (Math.random() > spawnRate) return;

        // Random position on screen
        const x = 100 + Math.random() * (window.innerWidth - 200);
        const y = 100 + Math.random() * (window.innerHeight - 250);

        // Random reward value (10-100% of current production rate)
        const seraphBaseProduction = State.automatons.seraphProduction || 1;
        const baseReward = State.pps * seraphBaseProduction * State.praiseMultiplier * 60 * (State.achievementBonuses?.globalGain || 1);
        const chainRewardBonus = 1 + Math.min(1.5, loops.divineEventChain * 0.12);
        const overclockRewardBonus = loops.overclock.active ? 1.15 : 1;
        const value = Math.floor(baseReward * (0.15 + Math.random() * 0.95) * chainRewardBonus * overclockRewardBonus);

        State.divineEvent = {
            x: x,
            y: y,
            value: Math.max(value, 10), // Minimum reward of 10
            chainPreview: loops.divineEventChain,
            expiresAt: Date.now() + 10000 // 10 seconds to click
        };

        ui.showDivineEvent(State.divineEvent);
    },

    clickDivineEvent() {
        this.ensureLoopState();
        if (!State.divineEvent) return;

        const event = State.divineEvent;
        const loops = State.loopSystems;
        const now = Date.now();

        if (now - loops.lastDivineEventClaimAt <= 15000) {
            loops.divineEventChain += 1;
        } else {
            loops.divineEventChain = 1;
        }
        loops.lastDivineEventClaimAt = now;
        loops.bestDivineEventChain = Math.max(loops.bestDivineEventChain, loops.divineEventChain);
        loops.totalDivineEventsClaimed += 1;

        State.resources.praise = Math.min(State.resources.praise + event.value, State.resourceCaps.praise);
        State.totalPraiseEarned += event.value;
        State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + event.value;

        this.gainOverclockCharge(18 + (loops.divineEventChain * 2));
        this.updateDirectiveProgress();

        ui.log(`Divine Event claimed! +${event.value} Praise. Chain x${loops.divineEventChain}.`);
        ui.showFloatingNumber(`+${event.value} • x${loops.divineEventChain}`, event.x, event.y, '#ffd700');
        ui.spawnParticles(event.x, event.y, 12, '#ffd700');

        if (loops.divineEventChain > 0 && loops.divineEventChain % 3 === 0) {
            const chainSoulBonus = Math.max(1, Math.floor(loops.divineEventChain / 2));
            State.resources.souls = Math.min(State.resourceCaps.souls, State.resources.souls + chainSoulBonus);
            State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + chainSoulBonus;

            let chainOfferingBonus = 0;
            if (State.unlockedOfferings) {
                chainOfferingBonus = Math.max(1, Math.floor(loops.divineEventChain * 1.5));
                State.resources.offerings = Math.min(State.resourceCaps.offerings, State.resources.offerings + chainOfferingBonus);
                State.totalOfferingsEarned += chainOfferingBonus;
                State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + chainOfferingBonus;
            }

            ui.log(`[Chain Bonus] +${chainSoulBonus} Souls${chainOfferingBonus > 0 ? ` and +${chainOfferingBonus} Offerings` : ''}.`);
            ui.screenPulse('rgba(255, 215, 0, 0.25)');
        }

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

        const mandateEfficiency = State.achievementBonuses?.mandateEfficiency || 1;
        const effectiveCost = Math.max(1, Math.ceil(mandate.cost / mandateEfficiency));

        // Check if can afford
        if (State.resources.souls < effectiveCost) {
            ui.log(`Insufficient Souls. Need ${effectiveCost}.`);
            return;
        }

        // Deduct cost
        State.resources.souls -= effectiveCost;

        // Mark as purchased and apply effect
        State.purchasedMandates[mandateId] = true;
        mandate.effect();

        // Track for achievements
        State.achievementProgress.buy_mandate_count = (State.achievementProgress.buy_mandate_count || 0) + 1;

        ui.log(`Divine Mandate enacted: ${mandate.name}${effectiveCost < mandate.cost ? ` (Efficiency: ${mandate.cost}→${effectiveCost})` : ''}`);
        ui.screenPulse('rgba(138, 43, 226, 0.3)');
        ui.updateMandates();
    },

    // === VOID DIMENSION FUNCTIONS ===
    manualVoidClick(event) {
        this.ensureLoopState();
        const vd = State.dimensions.void;
        let clickPower = vd.manualClickPower || 1;
        const now = Date.now();
        const overclockBonus = (State.loopSystems.overclock.active && now < State.loopSystems.overclock.endsAt) ? 1.5 : 1;
        const voidBonus = (State.achievementBonuses?.voidGain || 1) * (State.achievementBonuses?.globalGain || 1);
        clickPower = Math.max(1, Math.floor(clickPower * overclockBonus * voidBonus));

        vd.resources.darkness += clickPower;
        vd.resources.darkness = Math.min(vd.resources.darkness, vd.resourceCaps.darkness);
        vd.totalDarknessEarned += clickPower;
        vd.totalClicks++;

        this.gainOverclockCharge(0.6, false);

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

    // Buy multiple void automatons at once
    buyVoidAutomatorBulk(type, quantity) {
        const vd = State.dimensions.void;

        if (type === 'wraith') {
            const baseCost = 10;
            const growthRate = 1.15;

            let buyAmount = quantity;
            if (quantity === 'max') {
                buyAmount = this.getMaxAffordable(baseCost, growthRate, vd.automatons.wraithCount,
                    vd.resources.darkness, vd.automatons.wraithCostMultiplier);
            }

            if (buyAmount === 0) {
                ui.log(`Cannot afford any Wraiths.`, 'void');
                return;
            }

            const totalCost = this.calculateBulkCost(baseCost, growthRate, vd.automatons.wraithCount,
                buyAmount, vd.automatons.wraithCostMultiplier);

            if (vd.resources.darkness >= totalCost) {
                vd.resources.darkness -= totalCost;
                vd.automatons.wraithCount += buyAmount;
                vd.dps += buyAmount;
                ui.log(`${buyAmount} Wraiths summoned. Darkness flows. (${vd.automatons.wraithCount} total)`, 'void');
                ui.updateUpgrades();
                ui.screenPulse('rgba(156, 39, 176, 0.3)');
            }
        } else if (type === 'phantom') {
            const baseCost = 5;
            const growthRate = 1.20;

            let buyAmount = quantity;
            if (quantity === 'max') {
                buyAmount = this.getMaxAffordable(baseCost, growthRate, vd.automatons.phantomCount,
                    vd.resources.shadows, vd.automatons.phantomCostMultiplier);
            }

            if (buyAmount === 0) {
                ui.log(`Cannot afford any Phantoms.`, 'void');
                return;
            }

            const totalCost = this.calculateBulkCost(baseCost, growthRate, vd.automatons.phantomCount,
                buyAmount, vd.automatons.phantomCostMultiplier);

            if (vd.resources.shadows >= totalCost) {
                vd.resources.shadows -= totalCost;
                vd.automatons.phantomCount += buyAmount;
                vd.eps += buyAmount;
                ui.log(`${buyAmount} Phantoms manifested. Echoes resonate. (${vd.automatons.phantomCount} total)`, 'void');
                ui.updateUpgrades();
                ui.screenPulse('rgba(74, 20, 140, 0.3)');
            }
        }
    },

    // === PRESTIGE SYSTEM ===
    calculateDivinityPoints() {
        // Formula: sqrt(totalSouls / 2500) - rewards exponential growth
        const basePoints = Math.floor(Math.sqrt(State.resources.souls / 2500));
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

        // Track for achievements
        State.achievementProgress.prestige_count = (State.achievementProgress.prestige_count || 0) + 1;

        const startingResourceBonus = State.achievementBonuses?.startingResources || 1;
        const startingSouls = Math.max(100, Math.floor(100 * startingResourceBonus));
        const startingPraise = Math.max(0, Math.floor(25 * (startingResourceBonus - 1)));
        const startingOfferings = Math.max(0, Math.floor(5 * (startingResourceBonus - 1)));
        const bestMiracleStreak = State.loopSystems?.bestMiracleStreak || 0;
        const bestDivineEventChain = State.loopSystems?.bestDivineEventChain || 0;
        const completedDirectives = State.loopSystems?.directives?.completed || 0;
        const rerolledDirectives = State.loopSystems?.directives?.rerolls || 0;

        // Reset resources
        State.resources = {
            praise: startingPraise,
            offerings: startingOfferings,
            souls: startingSouls
        };

        // Reset caps
        State.resourceCaps = {
            praise: 1000,
            offerings: 100,
            souls: 2000
        };

        // Reset automatons
        State.automatons = {
            seraphCount: 0,
            seraphCostMultiplier: 1,
            seraphProduction: 1,
            cherubCount: 0,
            cherubCostMultiplier: 1,
            cherubProduction: 0.2
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

        // Reset active loop systems, preserve personal bests and lifetime completions
        State.loopSystems = {
            miracleStreak: 0,
            bestMiracleStreak: bestMiracleStreak,
            lastMiracleClickAt: 0,
            lastStreakDecayAt: 0,
            divineEventChain: 0,
            bestDivineEventChain: bestDivineEventChain,
            lastDivineEventClaimAt: 0,
            totalDivineEventsClaimed: 0,
            overclock: {
                charge: 0,
                active: false,
                endsAt: 0,
                duration: 30000
            },
            directives: {
                active: null,
                completed: completedDirectives,
                rerolls: rerolledDirectives,
                lastCompletedAt: 0
            }
        };

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
    },

    // === RECYCLE BIN SYSTEM ===
    addToRecycleBin(item) {
        // Item structure: { id, name, type, description, sacrificeValue, deletable, onRestore, onDelete }
        State.recycleBin.items.push(item);
        ui.log(`Item moved to Recycle Bin: ${item.name}`);
        State.save();

        // If Recycle Bin window is open, update it
        if (State.recycleBin.opened) {
            ui.updateRecycleBinList();
        }
    },

    // Helper to create resource sacrifice items
    createResourceSacrifice(resourceType, amount) {
        if (!State.resources[resourceType] || State.resources[resourceType] < amount) {
            ui.log(`Insufficient ${resourceType} to sacrifice.`);
            return;
        }

        // Deduct resources
        State.resources[resourceType] -= amount;

        // Calculate sacrifice value (percentage bonus)
        const sacrificeValues = {
            praise: 0.1,
            offerings: 0.5,
            souls: 2.0,
            darkness: 1.0,
            shadows: 3.0,
            echoes: 5.0
        };

        const baseValue = sacrificeValues[resourceType] || 0.1;
        const totalValue = Math.floor(amount * baseValue * 100) / 100;

        const item = {
            id: `sacrifice_${resourceType}_${Date.now()}`,
            name: `${amount} ${resourceType}`,
            type: 'resource',
            description: `Sacrificed resources. Can be converted to permanent bonuses.`,
            sacrificeValue: totalValue,
            deletable: true,
            onRestore: () => {
                // Restore resources
                State.resources[resourceType] = (State.resources[resourceType] || 0) + amount;
                ui.log(`Restored ${amount} ${resourceType}.`);
            },
            onDelete: null
        };

        this.addToRecycleBin(item);
    },

    // === CASINO HOST BARK SYSTEM ===
    selectHostBark(trigger, context = null) {
        // Filter barks by trigger and context
        let eligibleBarks = CasinoHostBarks.filter(bark => {
            if (bark.trigger !== trigger) return false;
            if (context && bark.context !== context) return false;
            return this.canBarkPlay(bark);
        });

        if (eligibleBarks.length === 0) {
            return null; // No barks available
        }

        // Weighted random selection
        const totalWeight = eligibleBarks.reduce((sum, bark) => sum + (bark.weight || 1), 0);
        let random = Math.random() * totalWeight;

        for (const bark of eligibleBarks) {
            random -= (bark.weight || 1);
            if (random <= 0) {
                return bark;
            }
        }

        return eligibleBarks[0]; // Fallback
    },

    canBarkPlay(bark) {
        const now = Date.now();

        // Check global cooldown (minimum 2 seconds between ANY barks)
        const lastBarkTime = State.casino.hostDialogue.lastBarkTime || 0;
        if (now - lastBarkTime < 2000) {
            return false;
        }

        // Check individual bark cooldown
        const barkCooldowns = State.casino.hostDialogue.barkCooldowns || {};
        const lastPlayed = barkCooldowns[bark.id] || 0;
        const cooldownMs = (bark.cooldown || 10) * 1000;

        return (now - lastPlayed) >= cooldownMs;
    },

    triggerHostBark(trigger, context = null, forceDisplay = false) {
        const bark = this.selectHostBark(trigger, context);

        if (!bark) {
            return null; // No bark available
        }

        // Update bark state
        const now = Date.now();
        State.casino.hostDialogue.lastBarkId = bark.id;
        State.casino.hostDialogue.lastBarkTime = now;
        State.casino.hostDialogue.barkCooldowns = State.casino.hostDialogue.barkCooldowns || {};
        State.casino.hostDialogue.barkCooldowns[bark.id] = now;

        // Track lore whispers (rare lines)
        if (bark.context === 'Lore Whisper') {
            State.casino.hostDialogue.loreWhispersHeard = State.casino.hostDialogue.loreWhispersHeard || [];
            if (!State.casino.hostDialogue.loreWhispersHeard.includes(bark.id)) {
                State.casino.hostDialogue.loreWhispersHeard.push(bark.id);
            }
        }

        // Display bark (will be handled by UI when casino is open)
        if (forceDisplay || State.casino.visited) {
            ui.displayHostBark(bark);
        }

        return bark;
    },

    // Attempt to trigger a lore whisper (1% chance)
    attemptLoreWhisper() {
        if (Math.random() < 0.01) {
            // Select a random lore whisper
            this.triggerHostBark('casino_idle_30s', 'Lore Whisper');
        }
    },

    // === PROPHET SYSTEM ===
    assignProphet(amount) {
        const currentDim = ui.selectedGlobeDimension || 'primordial';

        if (amount > 0) {
            if (State.prophets.available < amount) {
                ui.log('Not enough available Prophets.');
                return;
            }
            State.prophets.available -= amount;
            State.prophets.assignments[currentDim] = (State.prophets.assignments[currentDim] || 0) + amount;
            ui.log(`Assigned ${amount} Prophet(s) to ${currentDim} dimension.`);
        } else {
            const assigned = State.prophets.assignments[currentDim] || 0;
            if (assigned < Math.abs(amount)) {
                ui.log('Not enough Prophets assigned to this dimension.');
                return;
            }
            State.prophets.available += Math.abs(amount);
            State.prophets.assignments[currentDim] -= Math.abs(amount);
            ui.log(`Recalled ${Math.abs(amount)} Prophet(s) from ${currentDim} dimension.`);
        }

        ui.updateGlobeDisplay();
    },

    feedProphets(resourceType, amount) {
        if (State.resources[resourceType] < amount) {
            ui.log(`Insufficient ${resourceType} to feed Prophets.`);
            return;
        }

        State.resources[resourceType] -= amount;

        const bonuses = {
            praise: { multiplier: 1.1, duration: 300000 },
            offerings: { multiplier: 1.2, duration: 300000 },
            souls: { multiplier: 1.5, duration: 600000 }
        };

        const bonus = bonuses[resourceType];
        State.prophets.feedingBonus *= bonus.multiplier;

        ui.log(`Fed ${amount} ${resourceType} to Prophets. Growth boosted by ${(bonus.multiplier - 1) * 100}%!`);
        ui.screenPulse('rgba(138, 43, 226, 0.3)');

        setTimeout(() => {
            State.prophets.feedingBonus /= bonus.multiplier;
            ui.log('Prophet feeding bonus expired.');
        }, bonus.duration);
    },

    // === DIVINE CALLS ===
    answerCall(resourceType) {
        const now = Date.now();

        if (now < State.divineCalls.lastAnswered + State.divineCalls.cooldown) {
            const remaining = Math.ceil((State.divineCalls.lastAnswered + State.divineCalls.cooldown - now) / 1000);
            ui.log(`Divine Calls on cooldown. ${remaining}s remaining.`);
            return;
        }

        const conversion = State.divineCalls.conversionRates[resourceType];
        if (!conversion) return;

        if (State.resources[resourceType] < conversion.cost) {
            ui.log(`Need ${conversion.cost} ${resourceType} to answer this call.`);
            return;
        }

        State.resources[resourceType] -= conversion.cost;
        State.adoration += conversion.adorationGain;
        State.divineCalls.lastAnswered = now;

        ui.log(`Answered Divine Call: +${conversion.adorationGain} Adoration`);
        ui.screenPulse('rgba(255, 215, 0, 0.4)');
        ui.updateDivineCallsDisplay();
    },

    // === ADORATION SHOP ===
    purchaseShopItem(category, itemId) {
        const item = ShopItemList.find(i => i.id === itemId && i.category === category);
        if (!item) return;

        if (!item.upgradable && State.adorationShop[category][itemId]) {
            ui.log('Item already purchased.');
            return;
        }

        if (State.adoration < item.cost) {
            ui.log('Insufficient Adoration.');
            return;
        }

        State.adoration -= item.cost;

        if (item.upgradable) {
            State.adorationShop[category][itemId] = (State.adorationShop[category][itemId] || 0) + 1;
        } else {
            State.adorationShop[category][itemId] = true;
        }

        item.effect();
        ui.log(`Purchased: ${item.name}`);
        ui.renderShopContent(category);
    },

    // === SAVE MANAGEMENT ===
    exportSave() {
        try {
            const saveData = JSON.stringify(State);
            const compressed = btoa(saveData); // Base64 encode

            const textarea = document.getElementById('export-save-text');
            if (textarea) {
                textarea.value = compressed;
                textarea.select();

                // Use modern Clipboard API
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(compressed).then(() => {
                        ui.log('Save exported and copied to clipboard!');
                    }).catch(() => {
                        ui.log('Save exported (copy manually from text box).');
                    });
                } else {
                    ui.log('Save exported (copy manually from text box).');
                }
            }
        } catch (error) {
            ui.log('Error exporting save: ' + error.message);
        }
    },

    importSave() {
        const textarea = document.getElementById('import-save-text');
        if (!textarea || !textarea.value) {
            ui.log('Please paste a save string first.');
            return;
        }

        if (!confirm('This will overwrite your current save. Are you sure?')) {
            return;
        }

        try {
            const compressed = textarea.value.trim();
            const saveData = atob(compressed); // Base64 decode
            const parsed = JSON.parse(saveData);

            // Validate it's a CosmOS save
            if (!parsed.resources || !parsed.pps) {
                throw new Error('Invalid save format');
            }

            // Clear localStorage and load the imported save
            localStorage.setItem('cosmos_save', saveData);
            location.reload(); // Reload to apply the imported save
        } catch (error) {
            ui.log('Error importing save: Invalid or corrupted save data.');
        }
    },

    hardReset() {
        if (!confirm('⚠️ HARD RESET WARNING ⚠️\n\nThis will DELETE ALL progress including:\n- All resources\n- All upgrades\n- All achievements\n- All unlocks\n- Prestige progress\n\nThis action CANNOT be undone!\n\nAre you ABSOLUTELY sure?')) {
            return;
        }

        if (!confirm('Final confirmation: Really delete everything and start fresh?')) {
            return;
        }

        localStorage.removeItem('cosmos_save');
        ui.log('Hard reset complete. Reloading...');
        ui.screenPulse('rgba(255, 0, 0, 0.6)');

        setTimeout(() => {
            location.reload();
        }, 1000);
    },

    // === DOCUMENT SYSTEM ===
    unlockDocument(docId) {
        // Check if already unlocked
        if (State.documents.collected.includes(docId)) {
            return false;
        }

        // Find document in manifest
        const doc = DocumentManifest.find(d => d.id === docId);
        if (!doc) {
            console.error(`Document ${docId} not found in manifest`);
            return false;
        }

        // Add to collected list
        State.documents.collected.push(docId);

        // Add to category
        if (State.documents.categories[doc.category]) {
            State.documents.categories[doc.category].push(docId);
        }

        // Update achievement progress
        State.achievementProgress.docs_collected = State.documents.collected.length;

        // Show notification
        ui.showDocumentNotification(doc);

        ui.log(`[DOCUMENT UNLOCKED] ${doc.title}`);
        State.save();
        return true;
    },

    checkDocumentUnlocks() {
        // Check all documents in manifest for unlock conditions
        for (const doc of DocumentManifest) {
            if (!State.documents.collected.includes(doc.id)) {
                try {
                    if (doc.unlockCondition()) {
                        this.unlockDocument(doc.id);
                    }
                } catch (e) {
                    // Condition check failed, skip silently
                }
            }
        }
    },

    getDocumentContent(docId) {
        // This will load document content from the content pack files
        // For now, return a placeholder - we'll implement file loading in ui.js
        const doc = DocumentManifest.find(d => d.id === docId);
        if (!doc) return null;

        return {
            id: doc.id,
            title: doc.title,
            filename: doc.filename,
            category: doc.category,
            // Content will be loaded by UI from /docs/CosmOS_Content_Pack/docs/
            contentPath: `/docs/CosmOS_Content_Pack/docs/${doc.id}_${doc.filename.replace(/\//g, '__')}.md`
        };
    }
};

// Start the game loop
game.loop();
