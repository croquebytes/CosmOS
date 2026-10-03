const game = {
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /* Every sound cue goes through here. js/audio.js is presentation, and
       the simulator and every vm test load this file without it, so this is
       inert wherever `audio` is undefined. A cue must never decide anything. */
    sfx(name, opts) {
        if (typeof audio !== 'undefined' && audio && typeof audio.play === 'function') audio.play(name, opts);
    },

    /* Cinematics (js/media.js), on the same terms as sfx: inert wherever
       `media` is undefined, which is the simulator and every vm test. A
       reel decorates a moment and never decides one, so nothing here waits
       on it — media.play() resolves on its own, and a missing reel is
       skipped without a frame of player. */
    cinematic(id, opts) {
        if (typeof media === 'undefined' || !media || typeof media.play !== 'function') return null;
        try { return media.play(id, opts); } catch (err) { return null; }
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

    /* The ceilings are clamped at zero because streakCapBonus is an ADDITIVE
       target a build can push negative. Today the pool holds exactly one
       reducer, leaving 0.1 of headroom before the first ceiling inverts —
       close enough that adding a second entry would silently make streaks
       reduce production. */
    getMiracleStreakMultiplier() {
        this.ensureLoopState();
        const ceiling = Math.max(0, 1.5 + (State.streakCapBonus || 0));
        return 1 + Math.min(ceiling, State.loopSystems.miracleStreak * 0.04);
    },

    getStreakProductionMultiplier() {
        this.ensureLoopState();
        const ceiling = Math.max(0, 0.35 + (State.streakCapBonus || 0) * 0.15);
        return 1 + Math.min(ceiling, State.loopSystems.miracleStreak * 0.007);
    },

    /* Choir Drill: a repeatable that lifts every automaton rank at once. */
    getDrillBonus() {
        const level = State.repeatables?.automaton_drill || 0;
        return 1 + level * 0.15;
    },

    /* Dominions convert banked Souls into a standing global bonus, giving the
       top of the chain a sink that is not just "wait for prestige". */
    getDominionBonus() {
        const count = State.automatons?.dominionCount || 0;
        return 1 + count * Economy.dominionBonusEach * (State.automatons?.dominionProduction || 1);
    },

    getVoidDrillBonus() {
        return 1 + (State.dimensions.void?.repeatables?.entropy_drill || 0) * 0.15;
    },

    getVoidRefinementBonus() {
        return 1 + (State.dimensions.void?.repeatables?.void_refinement || 0) * 0.25;
    },

    /* Nemesis and Null Doctrine both pay out across BOTH dimensions — that is
       what makes leaving a running primordial economy to grind the Void a
       trade rather than a detour with no return. */
    getNemesisBonus() {
        const vd = State.dimensions.void;
        const count = vd?.automatons?.nemesisCount || 0;
        return 1 + count * Economy.nemesisBonusEach * (vd?.automatons?.nemesisProduction || 1);
    },

    getNullDoctrineBonus() {
        return 1 + (State.nullDoctrine || 0) * Economy.nullDoctrineBonusEach;
    },

    getNullDoctrineCost() {
        return Math.ceil(Economy.nullDoctrineBaseCost *
            Math.pow(Economy.nullDoctrineGrowth, State.nullDoctrine || 0));
    },

    purchaseNullDoctrine() {
        const vd = State.dimensions.void;
        const cost = this.getNullDoctrineCost();
        if ((vd.resources.echoes || 0) < cost) {
            ui.log(`Insufficient Echoes. Need ${this.formatCost(cost)}.`, 'void');
            this.sfx('error');
            return;
        }
        vd.resources.echoes -= cost;
        this.sfx('purchase');
        State.nullDoctrine = (State.nullDoctrine || 0) + 1;
        ui.log(`Null Doctrine inscribed to rank ${State.nullDoctrine}.`, 'void');
        ui.screenPulse('rgba(150, 88, 224, 0.3)');
        ui.updateDimensionDisplay();
    },

    formatCost(value) {
        return ui.formatNumber ? ui.formatNumber(value) : String(Math.ceil(value));
    },

    getRefinementBonus() {
        const level = State.repeatables?.praise_refinement || 0;
        return 1 + level * 0.25;
    },

    getOverclockProductionMultiplier(now = Date.now()) {
        this.ensureLoopState();
        const overclock = State.loopSystems.overclock;
        // Clamped for the same reason as the streak ceilings above.
        const potency = Math.max(1, 1.5 + (State.overclockPotency || 0));
        return (overclock.active && now < overclock.endsAt) ? potency : 1;
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
        loops.overclock.endsAt = now + loops.overclock.duration + (State.overclockDurationBonus || 0);

        ui.log('Celestial Overclock engaged! +50% production, stronger miracles for 30s.');
        this.sfx('overclock');
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

        // The first two directives teach the core idle loop before the system
        // starts offering randomized repeatable work orders.
        let selected;
        if ((loops.directives.completed || 0) === 0 && State.totalClicks < 10 && State.automatons.seraphCount === 0) {
            selected = {
                type: 'manual_clicks',
                label: 'Calibrate the Miracle Interface',
                mode: 'delta',
                current: () => State.totalClicks,
                target: () => 10,
                rewardScale: 1
            };
        } else if ((loops.directives.completed || 0) <= 1 && State.automatons.seraphCount === 0) {
            selected = {
                type: 'seraph_owned',
                label: 'Commission Your First Seraph',
                mode: 'absolute',
                current: () => State.automatons.seraphCount,
                target: () => 1,
                rewardScale: 1.2
            };
        } else {
            selected = directives[this.randomInt(0, directives.length - 1)];
        }
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
        this.sfx('directive');
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

    /* A production line's output scale. See the note in getProductionRates. */
    lineScale(value) {
        return Number.isFinite(value) ? value : 1;
    },

    getProductionRates(now = Date.now(), includeTransient = true) {
        return this.computeProduction(now, includeTransient, null);
    },

    /* ── Production, as named folds ───────────────────────────────────────
       Every rate is a left fold over named factors, and the production
       breakdown panel is a recording of that same fold — not a second copy of
       the formula. There used to be three hand-written copies of this
       arithmetic on screen and all three had drifted (see syncResources), so
       the panel is not allowed to be a fourth.

       `[key, value]` folds as `acc * value`; `[key, value, 'sub']` as
       `acc - value`. JS evaluates `a * b * c` as `(a * b) * c`, so a fold
       seeded with the first factor produces the same double as the chained
       expression it replaced, operand for operand. That is what lets
       `npm run test:golden` stay byte-identical: the ORDER below is the order
       the old expressions had, and it is load-bearing for the same reason it
       is in Modifiers.fold — IEEE-754 multiplication is not associative.

       Sub-products (`@line`) are folded first and enter their parent as one
       operand, exactly as `hierarchyBonus` did as a const. Flattening them
       into the parent would re-associate the product.

       With no ledger this allocates a few small arrays and records nothing.
       With one, every step's running total is the value the game itself
       computed — there is nothing to drift. */
    foldProduction(ledger, line, factors) {
        let acc = factors[0][1];
        const steps = ledger ? [{ key: factors[0][0], op: 'base', value: acc, running: acc }] : null;
        for (let i = 1; i < factors.length; i++) {
            const factor = factors[i];
            acc = factor[2] === 'sub' ? acc - factor[1] : acc * factor[1];
            if (steps) steps.push({ key: factor[0], op: factor[2] || 'mul', value: factor[1], running: acc });
        }
        if (ledger) ledger.lines[line] = { steps, value: acc };
        return acc;
    },

    computeProduction(now, includeTransient, ledger) {
        this.ensureLoopState();
        const fold = (line, factors) => this.foldProduction(ledger, line, factors);
        const achievementBonuses = State.achievementBonuses || {};
        const globalGainBonus = achievementBonuses.globalGain || 1;
        const automationSpeedBonus = achievementBonuses.automationSpeed || 1;
        const divineInterventionBonus = includeTransient &&
            State.skills.divineIntervention.active &&
            now < State.skills.divineIntervention.endsAt ? 2 : 1;
        const streakProductionBonus = includeTransient ? this.getStreakProductionMultiplier() : 1;
        const overclockProductionBonus = includeTransient ? this.getOverclockProductionMultiplier(now) : 1;
        const totalProductionBonus = fold('transient', [
            ['skill.divineIntervention', divineInterventionBonus],
            ['achievement.automationSpeed', automationSpeedBonus],
            ['transient.streak', streakProductionBonus],
            ['transient.overclock', overclockProductionBonus],
        ]);

        /* Two tiers of bonus, deliberately.

           `baseHierarchyBonus` is everything the primordial economy earns for
           itself. `hierarchyBonus` adds what the VOID pays out — Nemesis and
           Null Doctrine — and applies only to the primordial chain.

           The Void's own production uses the base, never the full stack. If
           the Void's rewards fed the Void, Nemesis would raise Echo income,
           which buys more Null Doctrine, which raises Echo income again: a
           closed loop that ran production to 1e18/s in an 8h simulation. */
        const baseHierarchyBonus = fold('baseHierarchy', [
            ['@transient', totalProductionBonus],
            ['repeatable.automaton_drill', this.getDrillBonus()],
            ['bonus.dominion', this.getDominionBonus()],
            ['bonus.doctrine', this.getDoctrineBonus()],
        ]);
        const hierarchyBonus = fold('hierarchy', [
            ['@baseHierarchy', baseHierarchyBonus],
            ['bonus.nemesis', this.getNemesisBonus()],
            ['bonus.nullDoctrine', this.getNullDoctrineBonus()],
        ]);

        const praiseGross = fold('praiseGross', [
            ['base.pps', State.pps],
            ['target:automaton.seraph.output', this.lineScale(State.automatons.seraphProduction)],
            ['target:praise.multiplier', State.praiseMultiplier],
            ['repeatable.praise_refinement', this.getRefinementBonus()],
            ['@hierarchy', hierarchyBonus],
            ['achievement.praiseGain', achievementBonuses.praiseGain || 1],
            ['achievement.globalGain', globalGainBonus],
        ]);

        /* Thrones are a conversion, not a tap: they draw Praise and return
           Offerings. While Praise is banked they run flat out and the stock
           drains; once it is empty they can only run on incoming Praise, which
           is what stops a Throne overbuild from deadlocking the economy. */
        const throneCount = State.automatons.throneCount || 0;
        const throneDraw = fold('throneDraw', [
            ['base.throneCount', throneCount],
            ['const.thronePraiseDraw', Economy.thronePraiseDraw],
            ['target:throne.draw', State.throneDrawMultiplier ?? 1],
        ]);
        const hasBankedPraise = (State.resources.praise || 0) > 1;
        const throneActivity = throneDraw <= 0
            ? 0
            : (hasBankedPraise ? 1 : Math.min(1, praiseGross / throneDraw));
        if (ledger) ledger.scalars.throneActivity = { value: throneActivity, banked: hasBankedPraise, idle: throneDraw <= 0 };
        const throneDrawn = fold('throneDrawn', [
            ['@throneDraw', throneDraw],
            ['scalar.throneActivity', throneActivity],
        ]);

        const offeringsGross = fold('offerings', [
            ['base.throneCount', throneCount],
            ['const.throneOfferingYield', Economy.throneOfferingYield],
            ['scalar.throneActivity', throneActivity],
            ['target:automaton.throne.output', this.lineScale(State.automatons.throneProduction)],
            ['target:offerings.multiplier', State.offeringMultiplier],
            ['@hierarchy', hierarchyBonus],
            ['achievement.offeringValue', achievementBonuses.offeringValue || 1],
            ['achievement.globalGain', globalGainBonus],
        ]);

        const rates = {
            // Net of the Throne draw, so the readout shows what actually banks.
            praise: fold('praise', [
                ['@praiseGross', praiseGross],
                ['@throneDrawn', throneDrawn, 'sub'],
            ]),
            praiseGross,
            throneDraw: throneDrawn,
            throneActivity,
            offerings: offeringsGross,
            souls: fold('souls', [
                ['base.sps', State.sps],
                ['target:automaton.cherub.output', this.lineScale(State.automatons.cherubProduction)],
                ['target:souls.multiplier', State.soulMultiplier],
                ['@hierarchy', hierarchyBonus],
                ['achievement.soulGain', achievementBonuses.soulGain || 1],
                ['achievement.globalGain', globalGainBonus],
            ]),
            darkness: 0,
            shadows: 0,
            echoes: 0,
            followerGrowth: {},
            adoration: 0
        };

        if (State.dimensions.void.unlocked) {
            const vd = State.dimensions.void;
            const voidBonus = fold('voidBonus', [
                ['@baseHierarchy', baseHierarchyBonus],
                ['repeatable.entropy_drill', this.getVoidDrillBonus()],
                ['achievement.voidGain', achievementBonuses.voidGain || 1],
                ['achievement.voidStability', achievementBonuses.voidStability || 1],
                ['achievement.globalGain', globalGainBonus],
            ]);

            const darknessGross = fold('darknessGross', [
                ['base.dps', vd.dps],
                ['target:void.automaton.wraith.output', this.lineScale(vd.automatons.wraithProduction)],
                ['target:void.darkness.multiplier', vd.darknessMultiplier],
                ['repeatable.void_refinement', this.getVoidRefinementBonus()],
                ['@voidBonus', voidBonus],
            ]);

            /* Revenants are the Void's Throne: they burn Darkness to condense
               Shadows. Same throttle as the primordial side — flat out while
               Darkness is banked, on income alone once the bank is dry, so an
               overbuild stalls the conversion instead of deadlocking it. */
            const revenantCount = vd.automatons.revenantCount || 0;
            const revenantDraw = fold('revenantDraw', [
                ['base.revenantCount', revenantCount],
                ['const.revenantDarknessDraw', Economy.revenantDarknessDraw],
                ['target:void.revenant.draw', vd.revenantDrawMultiplier ?? 1],
            ]);
            const hasBankedDarkness = (vd.resources.darkness || 0) > 1;
            const revenantActivity = revenantDraw <= 0
                ? 0
                : (hasBankedDarkness ? 1 : Math.min(1, darknessGross / revenantDraw));
            if (ledger) ledger.scalars.revenantActivity = { value: revenantActivity, banked: hasBankedDarkness, idle: revenantDraw <= 0 };
            const revenantDrawn = fold('revenantDrawn', [
                ['@revenantDraw', revenantDraw],
                ['scalar.revenantActivity', revenantActivity],
            ]);

            rates.darknessGross = darknessGross;
            rates.revenantDraw = revenantDrawn;
            rates.darkness = fold('darkness', [
                ['@darknessGross', darknessGross],
                ['@revenantDrawn', revenantDrawn, 'sub'],
            ]);
            rates.shadows = fold('shadows', [
                ['base.revenantCount', revenantCount],
                ['const.revenantShadowYield', Economy.revenantShadowYield],
                ['scalar.revenantActivity', revenantActivity],
                ['target:void.automaton.revenant.output', this.lineScale(vd.automatons.revenantProduction)],
                ['target:void.shadow.multiplier', vd.shadowMultiplier],
                ['@voidBonus', voidBonus],
            ]);
            rates.echoes = fold('echoes', [
                ['base.eps', vd.eps],
                ['target:void.automaton.phantom.output', this.lineScale(vd.automatons.phantomProduction)],
                ['target:void.echo.multiplier', vd.echoMultiplier],
                ['@voidBonus', voidBonus],
            ]);
        }

        const timeline = State.timelines.effects[State.timelines.current] || {};
        for (const dimKey in State.followers) {
            const followerData = State.followers[dimKey];
            const assignedProphets = State.prophets.assignments[dimKey] || 0;
            rates.followerGrowth[dimKey] = assignedProphets * followerData.baseGrowthRate *
                State.prophets.feedingBonus * (timeline.followerBonus || 1) * globalGainBonus;
            rates.adoration += followerData.count * followerData.adorationRate;
        }
        rates.adoration *= (timeline.adorationBonus || 1) * globalGainBonus;

        return rates;
    },

    /* ── The production breakdown ─────────────────────────────────────────
       "Where does this number come from?" — answered by replaying
       computeProduction with a ledger and dressing each recorded step. DOM
       free: ui renders it, tests/breakdown.mjs holds it to the real value. */
    RATE_LINES: {
        praise: 'praise', offerings: 'offerings', souls: 'souls',
        darkness: 'darkness', shadows: 'shadows', echoes: 'echoes',
    },

    CAP_TARGETS: {
        praise: 'caps.praise', offerings: 'caps.offerings', souls: 'caps.souls',
        darkness: 'void.caps.darkness', shadows: 'void.caps.shadows', echoes: 'void.caps.echoes',
    },

    explainProductionRate(resource, now = Date.now(), includeTransient = true) {
        const line = this.RATE_LINES[resource];
        if (!line) return null;
        const ledger = { lines: {}, scalars: {} };
        this.computeProduction(now, includeTransient, ledger);
        const recorded = ledger.lines[line];
        if (!recorded) {
            // The Void is sealed: getProductionRates reports a flat zero and
            // there is no fold to show.
            return { resource, kind: 'rate', value: 0, steps: [], sealed: true };
        }
        return {
            resource,
            kind: 'rate',
            // The fold's own result — not a re-read of getProductionRates —
            // so the equality test compares two independent evaluations.
            value: recorded.value,
            steps: this.dressProductionSteps(ledger, line, now),
            cascade: this.cascadeState(),
        };
    },

    dressProductionSteps(ledger, line, now) {
        const recorded = ledger.lines[line];
        if (!recorded) return [];
        return recorded.steps.map((step) => {
            const dressed = { ...step, ...this.describeProductionFactor(step.key, ledger) };
            if (step.key.startsWith('@')) {
                dressed.children = this.dressProductionSteps(ledger, step.key.slice(1), now);
            } else if (step.key.startsWith('target:')) {
                const target = step.key.slice('target:'.length);
                const explained = this.explainTarget(target, now);
                dressed.children = explained.steps;
                dressed.fold = explained.value;
            }
            return dressed;
        });
    },

    /* What a recorded factor IS, in the player's terms. `group` is the
       section the panel files it under; `detail` is the arithmetic behind a
       factor that is not itself a fold. */
    describeProductionFactor(key, ledger) {
        const vd = State.dimensions.void;
        const rank = (id, pool) => (pool === 'void' ? vd?.repeatables?.[id] : State.repeatables?.[id]) || 0;
        const repeatableName = (id) => RepeatableList.find((r) => r.id === id)?.name || id;
        const unitsOf = (rateKey, count, host) => ({
            count, perUnit: count > 0 ? (host[rateKey] || 0) / count : 0,
        });
        switch (key) {
            case 'base.pps': return { group: 'base', label: 'Seraphs', ...unitsOf('pps', State.automatons.seraphCount || 0, State), unit: 'Seraph' };
            case 'base.sps': return { group: 'base', label: 'Cherubs', ...unitsOf('sps', State.automatons.cherubCount || 0, State), unit: 'Cherub' };
            case 'base.dps': return { group: 'base', label: 'Wraiths', ...unitsOf('dps', vd.automatons.wraithCount || 0, vd), unit: 'Wraith' };
            case 'base.eps': return { group: 'base', label: 'Phantoms', ...unitsOf('eps', vd.automatons.phantomCount || 0, vd), unit: 'Phantom' };
            case 'base.throneCount': return { group: 'base', label: 'Thrones', count: State.automatons.throneCount || 0, unit: 'Throne' };
            case 'base.revenantCount': return { group: 'base', label: 'Revenants', count: vd.automatons.revenantCount || 0, unit: 'Revenant' };
            case 'const.thronePraiseDraw': return { group: 'base', label: 'Praise drawn per Throne' };
            case 'const.throneOfferingYield': return { group: 'base', label: 'Offerings per Throne' };
            case 'const.revenantDarknessDraw': return { group: 'base', label: 'Darkness drawn per Revenant' };
            case 'const.revenantShadowYield': return { group: 'base', label: 'Shadows per Revenant' };
            case 'scalar.throneActivity':
            case 'scalar.revenantActivity': {
                const scalar = ledger.scalars[key.slice('scalar.'.length)] || {};
                const what = key === 'scalar.throneActivity' ? 'Praise' : 'Darkness';
                return {
                    group: 'base',
                    label: 'Conversion running',
                    note: scalar.idle ? 'nothing to convert'
                        : scalar.banked ? `${what} banked — flat out`
                            : `bank dry — running on incoming ${what}`,
                };
            }
            case 'repeatable.praise_refinement':
            case 'repeatable.automaton_drill':
            case 'repeatable.entropy_drill':
            case 'repeatable.void_refinement': {
                const id = key.slice('repeatable.'.length);
                const pool = id === 'entropy_drill' || id === 'void_refinement' ? 'void' : 'primordial';
                return { group: 'multiplier', source: 'repeatable', label: repeatableName(id), rank: rank(id, pool) };
            }
            case 'bonus.dominion':
                return { group: 'additive', source: 'automaton', label: 'Dominions', count: State.automatons.dominionCount || 0,
                    each: Economy.dominionBonusEach * (State.automatons.dominionProduction || 1) };
            case 'bonus.doctrine':
                return { group: 'additive', source: 'doctrine', label: 'Standing Doctrine', rank: State.standingDoctrine || 0,
                    each: Economy.doctrineBonusEach };
            case 'bonus.nemesis':
                return { group: 'additive', source: 'automaton', label: 'Nemesis', count: vd?.automatons?.nemesisCount || 0,
                    each: Economy.nemesisBonusEach * (vd?.automatons?.nemesisProduction || 1) };
            case 'bonus.nullDoctrine':
                return { group: 'additive', source: 'doctrine', label: 'Null Doctrine', rank: State.nullDoctrine || 0,
                    each: Economy.nullDoctrineBonusEach };
            case 'skill.divineIntervention': return { group: 'transient', label: 'Divine Intervention' };
            case 'transient.streak': return { group: 'transient', label: 'Miracle Streak', count: State.loopSystems?.miracleStreak || 0 };
            case 'transient.overclock': return { group: 'transient', label: 'Celestial Overclock' };
            case 'achievement.automationSpeed': return { group: 'achievement', label: 'Achievements — automation speed' };
            case 'achievement.praiseGain': return { group: 'achievement', label: 'Achievements — Praise' };
            case 'achievement.offeringValue': return { group: 'achievement', label: 'Achievements — Offerings' };
            case 'achievement.soulGain': return { group: 'achievement', label: 'Achievements — Souls' };
            case 'achievement.voidGain': return { group: 'achievement', label: 'Achievements — Void' };
            case 'achievement.voidStability': return { group: 'achievement', label: 'Achievements — Void stability' };
            case 'achievement.globalGain': return { group: 'achievement', label: 'Achievements — all gain' };
            case '@throneDrawn': return { group: 'draw', label: 'Throne draw' };
            case '@revenantDrawn': return { group: 'draw', label: 'Revenant draw' };
            default:
                break;
        }
        if (key.startsWith('target:')) {
            return { group: 'multiplier', label: this.TARGET_LABELS[key.slice('target:'.length)] || key.slice(7) };
        }
        if (key.startsWith('@')) {
            return { group: 'composite', label: this.LINE_LABELS[key.slice(1)] || key.slice(1) };
        }
        return { group: 'other', label: key };
    },

    TARGET_LABELS: {
        'praise.multiplier': 'Praise multiplier',
        'offerings.multiplier': 'Offering multiplier',
        'souls.multiplier': 'Soul multiplier',
        'automaton.seraph.output': 'Seraph output',
        'automaton.cherub.output': 'Cherub output',
        'automaton.throne.output': 'Throne output',
        'throne.draw': 'Throne appetite',
        'void.darkness.multiplier': 'Darkness multiplier',
        'void.shadow.multiplier': 'Shadow multiplier',
        'void.echo.multiplier': 'Echo multiplier',
        'void.automaton.wraith.output': 'Wraith output',
        'void.automaton.revenant.output': 'Revenant output',
        'void.automaton.phantom.output': 'Phantom output',
        'void.revenant.draw': 'Revenant appetite',
        'caps.praise': 'Praise storage',
        'caps.offerings': 'Offering storage',
        'caps.souls': 'Soul storage',
        'void.caps.darkness': 'Darkness storage',
        'void.caps.shadows': 'Shadow storage',
        'void.caps.echoes': 'Echo storage',
    },

    LINE_LABELS: {
        transient: 'Transient effects',
        baseHierarchy: 'Hierarchy bonus',
        hierarchy: 'Hierarchy bonus (with Void payouts)',
        praiseGross: 'Praise produced',
        darknessGross: 'Darkness produced',
        throneDraw: 'Throne draw at full rate',
        revenantDraw: 'Revenant draw at full rate',
        voidBonus: 'Void hierarchy bonus',
    },

    /* One registry fold, step by step, with each record's source made
       legible: which kind of thing put it there, and for a mandate whether
       the path is certified (full) or lapsed (residue). The status is read
       from the certification itself, never inferred from the label. */
    explainTarget(target, now = Date.now()) {
        const explained = Modifiers.explain(target, now);
        const spec = ModifierTargets[target];
        const cert = this.certification();
        const steps = explained.steps.map((step) => {
            if (step.op === 'base') {
                const divinityBase = typeof spec?.base === 'function';
                return { ...step, kind: divinityBase ? 'divinity' : 'base',
                    label: divinityBase ? 'Divinity carried forward' : 'Base' };
            }
            const source = step.source;
            const kind = typeof source === 'string' ? source : (source?.kind || 'anon');
            const dressed = { ...step, kind, sourceId: typeof source === 'object' ? source?.id : undefined };
            if (kind === 'mandate') {
                const mandate = MandateList.find((m) => m.id === source.id);
                dressed.branch = mandate?.branch;
                dressed.status = mandate && mandate.branch === cert.path ? 'full' : 'residue';
                dressed.label = mandate?.name || step.label;
            } else if (kind === 'repeatable') {
                dressed.rank = source.rank;
            } else if (kind === 'build') {
                const entry = Reality.entry(State.reality?.build, source.id);
                dressed.entryKind = entry?.kind;
                dressed.severity = entry?.severity;
            }
            return dressed;
        });
        let value = explained.value;
        // Modifiers.commit applies a declared floor after the fold.
        if (spec?.floor !== undefined && spec.floor > value) {
            value = spec.floor;
            steps.push({ op: 'max', kind: 'floor', label: 'Playability floor', value: spec.floor, running: value });
        }
        return { target, value, steps };
    },

    /* A storage cap is a single registry fold, committed with its floor. */
    explainCap(resource, now = Date.now()) {
        const target = this.CAP_TARGETS[resource];
        if (!target) return null;
        const explained = this.explainTarget(target, now);
        return { resource, kind: 'cap', target, value: explained.value, steps: explained.steps };
    },

    addCappedResource(container, key, cap, amount) {
        const before = container[key] || 0;
        container[key] = Math.min(cap, before + Math.max(0, amount));
        return container[key] - before;
    },

    /* How long the universe keeps running unattended. The Providence
       Capacitor repeatable is the sink that extends it, which is what makes
       storage upgrades matter to someone who plays twice a day. */
    getOfflineWindowSeconds() {
        const level = this.getRepeatableLevel('offline_capacitor');
        const hours = Math.min(
            Economy.offlineMaxHours,
            Economy.offlineBaseHours + level * Economy.offlineHoursPerCapacitor
        );
        return hours * 3600;
    },

    initializeSession() {
        this.ensureLoopState();
        // Must run before any rate is read: it rebuilds the log from the save
        // (or from the ownership ledgers, for a save written before the log
        // existed) and commits every folded value into the legacy scalars.
        this.bootstrapModifiers();
        this.ensureDirective();

        const now = Date.now();
        const lastUpdate = Number(State.runtime?.lastUpdateTime) || now;
        const elapsedSeconds = Math.max(0, (now - lastUpdate) / 1000);
        State.runtime.lastUpdateTime = now;

        if (elapsedSeconds < 60) {
            return null;
        }

        const simulatedSeconds = Math.min(elapsedSeconds, this.getOfflineWindowSeconds());
        const efficiency = Math.max(0, Math.min(1, State.offlineEfficiency ?? 0.6));
        const rates = this.getProductionRates(now, false);
        for (const key of ['praise', 'offerings', 'souls', 'darkness', 'shadows', 'echoes', 'adoration']) {
            rates[key] = (rates[key] || 0) * efficiency;
        }
        for (const key in rates.followerGrowth) rates.followerGrowth[key] *= efficiency;
        // Track what storage refused so the report can say plainly that the
        // vaults, not the automatons, are what is limiting an idle session.
        const offered = {
            praise: Math.max(0, rates.praise) * simulatedSeconds,
            offerings: Math.max(0, rates.offerings) * simulatedSeconds,
            souls: Math.max(0, rates.souls) * simulatedSeconds
        };
        const gained = {
            // Net of the Throne draw, floored at zero: an unattended universe
            // can stall its own conversion but never run a Praise deficit.
            praise: this.addCappedResource(State.resources, 'praise', State.resourceCaps.praise, rates.praise * simulatedSeconds),
            offerings: this.addCappedResource(State.resources, 'offerings', State.resourceCaps.offerings, rates.offerings * simulatedSeconds),
            souls: this.addCappedResource(State.resources, 'souls', State.resourceCaps.souls, rates.souls * simulatedSeconds),
            darkness: 0,
            shadows: 0,
            echoes: 0,
            adoration: 0
        };

        State.totalPraiseEarned += gained.praise;
        State.totalOfferingsEarned += gained.offerings;
        State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + gained.praise;
        State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + gained.offerings;
        State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + gained.souls;

        if (State.dimensions.void.unlocked) {
            const vd = State.dimensions.void;
            gained.darkness = this.addCappedResource(vd.resources, 'darkness', vd.resourceCaps.darkness, rates.darkness * simulatedSeconds);
            gained.shadows = this.addCappedResource(vd.resources, 'shadows', vd.resourceCaps.shadows, rates.shadows * simulatedSeconds);
            gained.echoes = this.addCappedResource(vd.resources, 'echoes', vd.resourceCaps.echoes, rates.echoes * simulatedSeconds);
            vd.totalDarknessEarned += gained.darkness;
        }

        for (const dimKey in rates.followerGrowth) {
            State.followers[dimKey].count += rates.followerGrowth[dimKey] * simulatedSeconds;
        }
        gained.adoration = this.addCappedResource(
            State,
            'adoration',
            State.adorationCaps.cosmetics,
            rates.adoration * simulatedSeconds
        );

        return {
            elapsedSeconds,
            simulatedSeconds,
            capped: elapsedSeconds > simulatedSeconds,
            efficiency,
            windowHours: this.getOfflineWindowSeconds() / 3600,
            overflow: {
                praise: Math.max(0, offered.praise - gained.praise),
                offerings: Math.max(0, offered.offerings - gained.offerings),
                souls: Math.max(0, offered.souls - gained.souls)
            },
            gained
        };
    },

    /* `attended` is false when the delta is a wall-clock catch-up rather than
       play — see loop(). It gates instability only; production is linear and
       accrues either way, which is the whole point of the catch-up. */
    tick(deltaSeconds, now = Date.now(), { attended = true } = {}) {
        try {
            this.ensureLoopState();

            if (State.skills.divineIntervention.active && now >= State.skills.divineIntervention.endsAt) {
                State.skills.divineIntervention.active = false;
                ui.log(`Divine Intervention expired.`);
            }

            this.processLoopDecay(now);
            this.ensureDirective();

            /* Before production is read, so a tier change throttles the tick
               that crossed into it rather than the one after. */
            if (attended) this.accrueInstability(deltaSeconds, now);
            /* Same gate, same reason, same position: incidents spawn and
               escalate on attended time only, and before the rates are read
               so an outage halts the tick that caused it. See js/incidents.js. */
            if (this.incidentsLive()) {
                /* Present, not merely attended: a visible tab with nobody at
                   the keyboard is idle play, and idle play holds the queue. */
                const present = attended && this.isPresent(now);
                Incidents.setPresence(present, now);
                if (present) Incidents.tick(deltaSeconds, now);
            }

            const rates = this.getProductionRates(now, true);
            const praiseGain = rates.praise * deltaSeconds;
            const offeringGain = rates.offerings * deltaSeconds;
            const soulGain = rates.souls * deltaSeconds;

            // praiseGain is net of the Throne draw and may be negative; the
            // floor at zero is what throttles conversion once the bank is dry.
            State.resources.praise = Math.max(0, State.resources.praise + praiseGain);
            State.resources.offerings += offeringGain;
            State.resources.souls += soulGain;

            State.resources.praise = Math.min(State.resources.praise, State.resourceCaps.praise);
            State.resources.offerings = Math.min(State.resources.offerings, State.resourceCaps.offerings);
            State.resources.souls = Math.min(State.resources.souls, State.resourceCaps.souls);

            // Lifetime totals track what was generated, not what survived the
            // conversion — otherwise buying Thrones would erase your history.
            const praiseEarned = Math.max(0, rates.praiseGross || 0) * deltaSeconds;
            State.totalPraiseEarned += praiseEarned;
            State.totalOfferingsEarned += offeringGain;
            State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + praiseEarned;
            State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + offeringGain;
            State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + soulGain;

            // === VOID DIMENSION PRODUCTION ===
            if (State.dimensions.void.unlocked) {
                const vd = State.dimensions.void;
                const darknessGain = rates.darkness * deltaSeconds;
                const shadowGain = rates.shadows * deltaSeconds;
                const echoGain = rates.echoes * deltaSeconds;

                // Net of the Revenant draw, so it can go negative; the floor at
                // zero is what throttles conversion once the bank is dry.
                vd.resources.darkness = Math.max(0, vd.resources.darkness + darknessGain);
                vd.resources.shadows += shadowGain;
                vd.resources.echoes += echoGain;

                vd.resources.darkness = Math.min(vd.resources.darkness, vd.resourceCaps.darkness);
                vd.resources.shadows = Math.min(vd.resources.shadows, vd.resourceCaps.shadows);
                vd.resources.echoes = Math.min(vd.resources.echoes, vd.resourceCaps.echoes);
                vd.totalDarknessEarned += Math.max(0, rates.darknessGross || 0) * deltaSeconds;
            }

            // === PROPHET & FOLLOWER PRODUCTION ===
            for (const dimKey in State.followers) {
                State.followers[dimKey].count += (rates.followerGrowth[dimKey] || 0) * deltaSeconds;
            }

            // === ADORATION PRODUCTION ===
            State.adoration += rates.adoration * deltaSeconds;
            State.adoration = Math.min(State.adoration, State.adorationCaps.cosmetics);

            if (State.divineEvent && now >= State.divineEvent.expiresAt) {
                ui.hideDivineEvent();
                State.divineEvent = null;
            }

            this.systemCheckAccumulator = (this.systemCheckAccumulator || 0) + deltaSeconds;
            if (this.systemCheckAccumulator >= 1) {
                const runtimeMinutes = Math.floor((Date.now() - State.startTime) / 60000);
                State.runtime.totalMinutes = runtimeMinutes;

                this.updateDirectiveProgress();
                this.checkAchievements();
                this.checkDocuments();
                this.checkAdversaryTrigger();
                this.checkFinaleTrigger();

                /* "Count them if you must." Fires once per power of ten of
                   lifetime Souls, so it marks scale rather than nagging. */
                if (State.adversary?.sceneCompleted) {
                    const decade = Math.floor(Math.log10(Math.max(1, State.totalStats?.soulsGained || 0)));
                    if (decade > (State.adversary.lastSoulDecade || 0)) {
                        State.adversary.lastSoulDecade = decade;
                        this.triggerAdversaryBark('souls_threshold');
                    }
                }
                this.systemCheckAccumulator %= 1;
            }

            this.eventSpawnAccumulator = (this.eventSpawnAccumulator || 0) + deltaSeconds;
            if (this.eventSpawnAccumulator >= 5) {
                this.spawnDivineEvent();
                this.eventSpawnAccumulator %= 5;
            }

            ui.update(now);
        } catch (err) {
            console.error('Game loop error:', err);
        }
    },

    /* The longest gap between animation frames that still counts as someone
       watching. Generous — a busy main thread or a background tab throttled
       to 1Hz stays "attended" — because the cost of guessing wrong is only
       that a few seconds of degradation are forgiven. */
    ATTENDED_GAP_SECONDS: 5,

    /* Incidents (js/incidents.js) are on in the game and OFF in
       tools/balance_sim.mjs, which has no incident policy yet: a simulated
       player who never triages would measure an economy nobody plays, and
       one who always pays would measure a different one. The flag keeps the
       golden master byte-identical until a policy is chosen. Harnesses that
       do not load incidents.js see `Incidents` undefined and are unaffected
       either way. */
    incidentsEnabled: true,

    /* Presence: has the player touched anything recently?

       system.js switches tracking on and reports input; headless (the
       simulator and every vm suite) there is no tracking and every tick is a
       player, which keeps those harnesses' behaviour exactly as it was.
       Transient by design — never saved — so a reload always starts away. */
    presenceTracking: false,
    lastInputAt: 0,

    notePresence(now = Date.now()) {
        this.lastInputAt = now;
    },

    isPresent(now = Date.now()) {
        if (!this.presenceTracking) return true;
        const seconds = (typeof Incidents !== 'undefined' && Incidents.PRESENCE_SECONDS) || 120;
        return now - this.lastInputAt <= seconds * 1000;
    },

    incidentsLive() {
        return this.incidentsEnabled === true && typeof Incidents !== 'undefined';
    },

    loop() {
        const now = Date.now();
        const previousTime = Number.isFinite(this.lastWallClockTime) ? this.lastWallClockTime : now - (1000 / 60);
        // Idle production is linear, so processing the full wall-clock gap is
        // both safe and necessary when a tab or desktop window is suspended.
        const deltaSeconds = Math.max(0, Math.min(8 * 60 * 60, (now - previousTime) / 1000));
        this.lastWallClockTime = now;
        /* A gap this size is a suspended tab or a slept machine, not play.
           Production replays across it — that is what the clamp above is for
           — but instability must not, or leaving the game OPEN would be
           strictly worse than closing it: initializeSession's offline path is
           exempt, so the same eight hours would cost nothing if the player
           quit and up to a full cascade if they did not. A sleeping laptop is
           an absence, and the rule is that a player cannot triage a cascade
           they were not present for. */
        const attended = deltaSeconds <= this.ATTENDED_GAP_SECONDS;
        this.tick(deltaSeconds, now, { attended });
        this.nextFrame();
    },

    /* The loop rides requestAnimationFrame because a background tab parks
       it — that is what makes a long absence an unattended gap, above. But
       only the canvases and the stabilisation needle need every frame
       (ui.needsFrames); with every window shut, the Engine's text panels
       already refresh at PANEL_INTERVAL, and production is linear in the
       delta, so ticking sixty times a second bought nothing but sixty
       frames a second of an idle desktop. Between frames it now waits a
       panel interval — and still asks for a frame to tick in, so a hidden
       tab parks it exactly as before. */
    nextFrame() {
        const busy = typeof ui === 'undefined' || typeof ui.needsFrames !== 'function' || ui.needsFrames();
        if (busy) {
            requestAnimationFrame(() => this.loop());
            return;
        }
        setTimeout(() => requestAnimationFrame(() => this.loop()), ui.PANEL_INTERVAL || 100);
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
            // Scale off the real production rate, bonuses included. Reading the
            // raw pps meant every multiplier the player bought made clicking
            // relatively weaker, which is backwards for an active-play reward.
            const productionPerSec = this.getProductionRates(now, false).praiseGross || 0;
            clickPower = Math.max(clickPower, Math.floor(productionPerSec * 0.12));
        }

        const streakMultiplier = this.getMiracleStreakMultiplier();
        const overclockActive = loops.overclock.active && now < loops.overclock.endsAt;
        const overclockMultiplier = overclockActive ? 2 + (State.overclockPotency || 0) : 1;
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
            const buttonRect = event.target.getBoundingClientRect();
            const coreRect = document.getElementById('core-canvas')?.getBoundingClientRect();
            const x = coreRect ? coreRect.left + coreRect.width / 2 : buttonRect.left + buttonRect.width / 2;
            const y = coreRect ? coreRect.top + coreRect.height * 0.68 : buttonRect.top;

            const isFull = State.resources.praise >= State.resourceCaps.praise;
            const displayText = isFull ? "STORAGE FULL!" : `+${clickPower}`;
            const displayColor = isFull ? "#ff4500" : "#ffd700";

            ui.showFloatingNumber(displayText, x, y, displayColor);
            ui.spawnParticles(x, y, isFull ? 10 : 7, displayColor);
        }

        this.sfx('miracle', { streak: loops.miracleStreak, overclock: overclockActive });
        ui.triggerCoreReaction(clickPower);
    },

    /* ── Automaton purchasing ────────────────────────────────────────────
       One generic path for every rank, driven by AutomatonSpecs. */
    /* Which bag of resources a spec is priced against. Void ranks and Void
       repeatables live on State.dimensions.void; everything else is top level. */
    /* Resolves a bare resource name to the bag that holds it. */
    voidCurrencies: ['darkness', 'shadows', 'echoes'],

    /* ── Modifier routing ─────────────────────────────────────────────────
       A content item declares `mods` (folded by the registry), `effect` (a
       grant into ownership state that the registry cannot express), or both
       when it is marked modsSplit. Applying an item means routing each half
       to the right channel exactly once. */
    applyContentItem(item, kind, now = Date.now()) {
        if (Array.isArray(item.mods) && item.mods.length) {
            Modifiers.addAll(item.mods, { kind, id: item.id }, item.name);
        }
        // Grants only run when they are not already covered by `mods`.
        if (typeof item.effect === 'function' && (item.modsSplit || !item.mods)) {
            item.effect();
        }
        Modifiers.commit(now);
    },

    /* ── Certification ────────────────────────────────────────────────────
       A mandate's bonuses belong to the certified path, not to the purchase.
       Buying a node unlocks it forever; certification decides which unlocked
       nodes are switched on this run.

       Everything mandate-derived lives under `scope: 'cert'`, which exists so
       this whole set can be dropped and rebuilt in one call — on purchase, on
       load, and on the reboot that changes the path. Rebuilding rather than
       patching keeps the residue arithmetic in exactly one place. */
    CERT_BRANCHES: ['creation', 'maintenance', 'entropy'],

    /* What a modifier is worth at a fraction of its strength.

       Multiplicative records scale their DISTANCE FROM 1, not their value: a
       tenth of `mul 1.4` is `mul 1.04`, and a tenth of a cost cut of `mul 0.8`
       is `mul 0.98`. Scaling the value itself would turn every bonus into a
       catastrophic penalty (0.14x praise) and every cost cut into a discount
       of 92%, which is the same bug in both directions.

       `set`, `max` and `min` have no partial form — half of "offline
       efficiency is 1" is not a smaller guarantee, it is a different one — so
       they return null and are dropped rather than guessed at. */
    residueValue(mod, fraction) {
        if (mod.op === 'mul' || mod.op === 'mulfloor') return 1 + (mod.value - 1) * fraction;
        if (mod.op === 'add') return mod.value * fraction;
        return null;
    },

    certification() {
        if (!State.certification || typeof State.certification !== 'object') {
            State.certification = { path: null, everCertified: [], history: [] };
        }
        const cert = State.certification;
        if (!Array.isArray(cert.everCertified)) cert.everCertified = [];
        if (!Array.isArray(cert.history)) cert.history = [];
        /* An unrecognised path becomes null, not itself.

           This read `cert.path = cert.path || null`, which is a no-op for
           every truthy value — so a save carrying a bogus path kept it, no
           branch ever matched, and the player's entire Mandate tree went
           dormant with no explanation and no way to fix it before the next
           ship. State.mergeInto does no type validation and importSave feeds
           it arbitrary decoded text, so this is reachable.

           Null is the honest value: it is what a player who has never
           certified has, and the ship dialog already handles it by refusing
           to arm until a path is chosen. */
        if (!this.CERT_BRANCHES.includes(cert.path)) cert.path = null;
        // Same reasoning for the branch list: only real branch names.
        cert.everCertified = cert.everCertified.filter((b) => this.CERT_BRANCHES.includes(b));
        return cert;
    },

    /* How a branch stands right now: owned nodes, and whether it is live, in
       residue, or dormant. The picker renders this, and it is also the honest
       answer to "what am I giving up" — which is the entire decision. */
    branchStanding(branch) {
        const cert = this.certification();
        const owned = MandateList.filter((m) => m.branch === branch && State.purchasedMandates[m.id]);
        const spent = owned.reduce((sum, m) => sum + m.cost, 0);
        const status = cert.path === branch ? 'certified'
            : cert.everCertified.includes(branch) ? 'residue'
            : 'dormant';
        return { branch, owned: owned.length, total: MandateList.filter((m) => m.branch === branch).length, spent, status };
    },

    /* Rebuilds every mandate-derived modifier from the certification and the
       purchase ledger. Idempotent, and safe to call at any time.

       Deliberately does NOT run grant closures. Grants (entropy_ultimate's
       manualClickScaling, maintenance_apex's capacitor ranks) write into
       ownership state that is already in the save, so re-running them on load
       would compound the grant on every reload — the exact double-apply
       applyContentItem's routing rule exists to prevent. Grants are re-issued
       once, by performPrestige, after the reset that clears them. */
    /* The mandate records the current certification implies. Pure — it reads
       state and returns records, so the reconcile below is the only thing
       that touches the log. */
    certificationMods() {
        const cert = this.certification();
        const mods = [];
        for (const mandate of MandateList) {
            if (!State.purchasedMandates[mandate.id] || !mandate.mods) continue;
            const live = mandate.branch === cert.path;
            const residual = !live && cert.everCertified.includes(mandate.branch);
            if (!live && !residual) continue;

            for (const mod of mandate.mods) {
                const value = live ? mod.value : this.residueValue(mod, Economy.certificationResidue);
                if (value === null || value === undefined) continue;
                mods.push({
                    ...mod,
                    value,
                    source: { kind: 'mandate', id: mandate.id },
                    label: live ? mandate.name : `${mandate.name} (lapsed)`,
                });
            }
        }
        return mods;
    },

    applyCertification(now = Date.now()) {
        /* Reconciled in place rather than dropped and re-added. These records
           are derived and are rebuilt on every boot, so re-adding them moved
           them behind everything bought since the last boot — which on
           `caps.*` reordered a `mulfloor` past an `add` and inflated storage
           by pressing reload. See Modifiers.reconcileScope. */
        const count = Modifiers.reconcileScope('cert', this.certificationMods());
        Modifiers.commit(now);
        return count;
    },

    /* Certifies on a path. Called by the ship dialog, and by
       bootstrapCertification for a save that predates the mechanic. */
    certifyOn(branch, { silent = false } = {}) {
        if (!this.CERT_BRANCHES.includes(branch)) return false;
        const cert = this.certification();
        cert.path = branch;
        if (!cert.everCertified.includes(branch)) cert.everCertified.push(branch);
        cert.history.push(branch);
        if (!silent) ui.log(`Certified on the path of ${branch.charAt(0).toUpperCase()}${branch.slice(1)}.`);
        return true;
    },

    /* A save written before certification existed has bought into the tree
       under the old rules, where every node was unconditionally live. Loading
       it with `path: null` would switch the whole tree off until the player
       next rebooted — which, for someone deep enough to own the 40-DP apex
       nodes, is an unannounced amputation.

       So the returning player is certified on whatever branch they have put
       the most Divinity into, and every branch they have bought into counts
       as previously certified so the residue is available at once. Ties go to
       CERT_BRANCHES order, which is stable rather than meaningful. */
    bootstrapCertification() {
        const cert = this.certification();

        /* Only for a save that has NEVER certified. `history` is appended by
           certifyOn and by nothing else, so an empty history with no path is
           the exact signature of a save written before the mechanic existed.

           This guard is the whole correctness of the function. Without it the
           re-derivation runs on every boot and marks any branch the player
           owns a node on as previously certified — which means buying a
           single node on a dormant path silently upgrades it to the residue
           on the next reload. That is free value the player never certified
           for, and it erases the difference between dormant and lapsed, which
           is the difference the mechanic is made of. Caught by reloading the
           game and watching Entropy change from DORMANT to LAPSED on its own. */
        if (cert.path || cert.history.length) return cert.path;

        // Re-derive from the real table; migration 6 could only read id prefixes.
        for (const mandate of MandateList) {
            if (!State.purchasedMandates[mandate.id]) continue;
            if (!cert.everCertified.includes(mandate.branch)) cert.everCertified.push(mandate.branch);
        }
        if (!cert.everCertified.length) return null;

        let best = null;
        for (const branch of this.CERT_BRANCHES) {
            const standing = this.branchStanding(branch);
            if (!standing.owned) continue;
            if (!best || standing.spent > best.spent) best = standing;
        }
        if (!best) return null;
        cert.path = best.branch;
        cert.history.push(best.branch);
        return cert.path;
    },

    /* ── Scars ────────────────────────────────────────────────────────────
       A known issue shipped unpatched is filed permanently and keeps a
       fraction of its bite. Rebuilt from the ledger under `scope: 'scar'`
       for the same reason certification is: one arithmetic site, idempotent
       on every load. */
    scarMods() {
        const scars = Array.isArray(State.reality?.scars) ? State.reality.scars : [];
        const mods = [];
        const filed = new Set();
        for (const id of scars) {
            // A duplicated id in the ledger must not fold twice.
            if (filed.has(id)) continue;
            filed.add(id);
            const entry = this.scarSource(id);
            if (!entry) continue;
            for (const mod of entry.mods || []) {
                const value = this.residueValue(mod, Economy.scarResidue);
                if (value === null || value === undefined) continue;
                mods.push({
                    ...mod,
                    value,
                    source: { kind: 'scar', id },
                    label: `Known issue on file — ${entry.note.split('.')[0]}`,
                });
            }
        }
        return mods;
    },

    applyScars(now = Date.now()) {
        // Reconciled in place, for the same reason as applyCertification.
        const count = Modifiers.reconcileScope('scar', this.scarMods());
        Modifiers.commit(now);
        return count;
    },

    /* Scars are stored as bare ids, so the pool is the source of truth for
       what one costs. The opening build's issue is not in the pool — it is
       the premise — so it is looked up separately. */
    scarSource(id) {
        const fromPool = RealityPool.issues.find((e) => e.id === id);
        if (fromPool) return fromPool;
        return (Reality.OPENING_BUILD.entries || []).find((e) => e.id === id) || null;
    },

    /* ── Instability ──────────────────────────────────────────────────────
       Severity 1 is the worst, so weight is (4 - severity): a SEV-1 accrues
       three times as fast as a SEV-3. */
    issueWeight(entry) {
        const severity = Math.min(3, Math.max(1, Number(entry?.severity) || 3));
        return 4 - severity;
    },

    instabilityRatePerHour() {
        const build = State.reality?.build;
        if (!build) return 0;
        /* The opening build does not degrade.

           Sector 7G's failed integrity check is the premise and the tutorial:
           it teaches what a known issue is and what patching one buys you. A
           new player who leaves the tab open for two hours before their first
           reboot would otherwise return to a collapsed universe having never
           been told the mechanic existed. The cascade is introduced by the
           first release, alongside everything else shipping is. */
        if (!(State.prestigeLevel > 0)) return 0;
        const weight = Reality.unpatchedIssues(build).reduce((sum, e) => sum + this.issueWeight(e), 0);
        return weight * Economy.instabilityPerWeightHour;
    },

    /* The tier the current instability sits in, as an index into
       Economy.cascadeTiers plus 1. Zero is nominal. */
    cascadeTierFor(instability) {
        let tier = 0;
        Economy.cascadeTiers.forEach((step, index) => {
            if (instability >= step.at) tier = index + 1;
        });
        return tier;
    },

    /* Instability, sanitised. `Number(x) || 0` already turns a string or an
       object into 0, but it lets a NEGATIVE through — and a save carrying
       -99 (importSave decodes arbitrary pasted text straight into State)
       would need a hundred hours of decay before a cascade could touch that
       player again. Clamped to the tier range at every read, so the stored
       value can never mean something the tiers do not. */
    instabilityOf(reality) {
        const ceiling = Economy.cascadeTiers[Economy.cascadeTiers.length - 1].at;
        return Math.max(0, Math.min(ceiling, Number(reality?.instability) || 0));
    },

    cascadeState() {
        const reality = State.reality || {};
        const instability = this.instabilityOf(reality);
        const tier = this.cascadeTierFor(instability);
        const step = tier > 0 ? Economy.cascadeTiers[tier - 1] : null;
        const ceiling = Economy.cascadeTiers[Economy.cascadeTiers.length - 1].at;
        const ratePerHour = this.instabilityRatePerHour();
        return {
            instability,
            tier,
            label: step ? step.label : 'NOMINAL',
            output: step ? step.output : 1,
            award: step ? step.award : 1,
            ratePerHour,
            // Nothing unpatched and something still on the clock: the build is
            // settling rather than degrading, and the panel should say so.
            recovering: ratePerHour === 0 && instability > 0,
            recoveryPerHour: Economy.instabilityRecoveryPerHour,
            ceiling,
        };
    },

    /* Accrues instability and keeps the throttle in step with it.

       The throttle is a modifier rather than a multiplier applied at the
       point of production, so it shows up in Modifiers.explain() alongside
       everything else — a player looking at why their output collapsed sees
       the outage in the stack rather than an unexplained gap. Records are
       rewritten only when the TIER changes, so this costs nothing per tick.

       `scope: 'build'` is correct and not laziness: a cascade belongs to the
       build that caused it, and performPrestige already drops that scope. */
    CASCADE_TARGETS: ['praise.multiplier', 'offerings.multiplier', 'souls.multiplier',
        'void.darkness.multiplier', 'void.shadow.multiplier', 'void.echo.multiplier'],

    accrueInstability(deltaSeconds, now = Date.now()) {
        const reality = State.reality;
        if (!reality || !reality.build) return;
        // Normalise before accruing: see instabilityOf.
        reality.instability = this.instabilityOf(reality);

        const rate = this.instabilityRatePerHour();
        if (deltaSeconds > 0) {
            if (rate > 0) {
                reality.instability = Math.min(
                    Economy.cascadeTiers[Economy.cascadeTiers.length - 1].at,
                    reality.instability + (rate * deltaSeconds) / 3600,
                );
            } else if (reality.instability > 0) {
                // Nothing left unpatched: the build settles. See
                // Economy.instabilityRecoveryPerHour for why this is not
                // optional.
                reality.instability = Math.max(
                    0,
                    reality.instability - (Economy.instabilityRecoveryPerHour * deltaSeconds) / 3600,
                );
            }
        }
        this.syncCascade(now);
        // Retry an announcement a modal collision suppressed. Cheap: it
        // returns immediately unless a tier is genuinely unannounced.
        this.announceCascade();
    },

    syncCascade(now = Date.now()) {
        const reality = State.reality;
        if (!reality) return 0;
        const tier = this.cascadeTierFor(this.instabilityOf(reality));
        if (tier === reality.cascadeTier) return tier;

        reality.cascadeTier = tier;
        for (const target of this.CASCADE_TARGETS) Modifiers.dropSource('cascade', target);
        if (tier > 0) {
            const step = Economy.cascadeTiers[tier - 1];
            for (const target of this.CASCADE_TARGETS) {
                Modifiers.add({
                    target,
                    op: 'mul',
                    value: step.output,
                    scope: 'build',
                    source: { kind: 'cascade', id: target },
                    label: `${step.label} — output throttled`,
                });
            }
        }
        Modifiers.commit(now);

        this.announceCascade();
        ui.renderRealityPanel?.();
        return tier;
    },

    /* The OS interrupts you. A cursed operating system that notices a cascade
       and says nothing is just a number going down.

       Announced once per tier per run — `alertedTier` never falls, so
       patching back down and drifting up again does not re-open the same
       dialog. But it only advances when the dialog ACTUALLY RENDERED.

       showCascadeAlert refuses to paint over an open modal, and modals are
       common exactly when a tier is likely to turn over: the release notes on
       every reboot, the offline report on every load, the Adversary scene at
       its thresholds. Marking the tier as announced before the render meant a
       collision dropped the warning permanently — the player's output was
       throttled and their award cut with nothing ever saying so. And
       syncCascade early-returns when the tier is unchanged, so there was no
       second chance.

       Called from the tick as well as from syncCascade, so a suppressed
       announcement is retried until it lands. */
    announceCascade() {
        const reality = State.reality;
        if (!reality) return false;
        const tier = this.cascadeTierFor(this.instabilityOf(reality));
        if (tier <= (reality.alertedTier || 0)) return false;
        if (ui.showCascadeAlert?.(this.cascadeState()) !== true) return false;
        reality.alertedTier = tier;
        return true;
    },

    /* Rebuilds the log from the ownership ledgers, in content-table order.

       Needed for any save written before the log existed. The original
       purchase order is not recoverable — it was never recorded — but the
       ledgers say exactly WHAT is owned, and replaying in table order gives
       correct scopes and a value within float epsilon of the original. That
       is the right trade: scopes wrong means prestige destroys permanent
       bonuses, whereas a last-digit difference is invisible.

       Runs after all scripts have loaded, because State.load() sits above the
       content tables in state.js and cannot see them. */
    rebuildModifierLog() {
        Modifiers.reset();
        for (const upgrade of UpgradeList) {
            if (!State.upgrades[upgrade.id] || !upgrade.mods) continue;
            Modifiers.addAll(upgrade.mods, { kind: 'upgrade', id: upgrade.id }, upgrade.name);
        }
        /* Mandates are deliberately absent. Their records are owned by
           applyCertification(), which decides between full value, residue and
           nothing — a rebuild here would restore all 21 at full strength and
           silently undo the certification the run was banked under. The
           caller runs applyCertification() straight after this. */
        for (const spec of RepeatableList) {
            const ranks = this.getRepeatableLevel(spec.id);
            for (let rank = 1; rank <= ranks; rank++) {
                const mod = this.repeatableMod(spec, rank);
                if (mod) Modifiers.add({ ...mod, source: { kind: 'repeatable', id: spec.id, rank }, label: spec.name });
            }
        }
        return Modifiers.records.length;
    },

    /* A storage repeatable's rank expressed as a modifier. The non-storage
       repeatables (refinement, drill, capacitor) are read from their level at
       use time and own no scalar, so they have no modifier. */
    repeatableMod(spec, rank) {
        if (!spec.capacityStep) return null;
        const target = spec.pool === 'void' ? `void.caps.${spec.resource}` : `caps.${spec.resource}`;
        if (!ModifierTargets[target]) return null;
        return {
            target,
            op: 'add',
            value: this.storageGrant(spec, rank),
        };
    },

    /* ── Reality Builds ───────────────────────────────────────────────────
       The run's build is state, not a roll: generated once, persisted, and
       re-applied verbatim on every load. */
    ensureReality() {
        if (!State.reality || typeof State.reality !== 'object') {
            State.reality = { runSeed: 0, channel: 'stable', build: null, shipped: 0 };
        }
        const reality = State.reality;
        let rolled = false;
        if (!reality.runSeed) {
            // Rolled once per save. The simulator pins this before bootstrap so
            // its runs stay deterministic and the golden master keeps working.
            reality.runSeed = (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1;
            rolled = true;
        }
        if (!reality.channel || !RealityChannels[reality.channel]) reality.channel = 'stable';
        this.normaliseArchive();
        /* Always re-derive from the seed. Deriving rather than trusting the
           stored entries is what lets a content fix reach a save that is
           already mid-run — and it is free, because a build is a pure
           function of its identity. Patched flags carry across. */
        const before = reality.build ? JSON.stringify(reality.build.entries) : null;
        reality.build = Reality.rematerialise(reality, State.prestigeLevel);
        if (before !== JSON.stringify(reality.build.entries)) rolled = true;

        /* Persist immediately. Nothing else saves synchronously here, so a
           freshly rolled seed only reached disk if the player happened to
           trigger a save — meaning a reload re-rolled the universe. That is
           precisely the reload-shopping that seeding exists to prevent. */
        if (rolled) State.save();
        return reality.build;
    },

    /* Sets the channel the NEXT build will be pulled from. Deliberately does
       not re-roll the current build: switching channel mid-run to dodge a bad
       one would make the whole mechanic optional. */
    setBuildChannel(channel) {
        if (!RealityChannels[channel]) return false;
        if (!Reality.channelsFor(State.prestigeLevel || 0).includes(channel)) {
            ui.log('That release channel is not available yet.');
            return false;
        }
        if (channel === 'archived' && !this.archivedBuilds().length) {
            ui.log('The archive is empty. Ship a build first; it will be on file from then on.');
            return false;
        }
        State.reality.channel = channel;
        ui.log(`Next reality will be pulled from the ${RealityChannels[channel].label} channel.`);
        ui.renderRealityPanel?.();
        return true;
    },

    /* Rolls the next build. Called by prestige, after prestigeLevel has been
       incremented, so the version number and seed follow the reboot count.

       Archived is the one channel that is not rolled: it REPLAYS the build
       picked from the history, generated from that build's recorded inputs.
       The pick is consumed here — the next ship has to pick again — so a
       player who forgets the selector is on Archived is stopped by the ship
       dialog rather than silently replaying the same universe for nothing.
       With no valid pick (a bare performPrestige from the simulator or a
       test, or a pick that no longer validates) it falls back to Stable and
       says so, rather than rolling generate(..., 'archived'), which is a
       Stable-shaped build that pays nothing. */
    rollNextBuild(now = Date.now()) {
        const reality = State.reality;
        let build = null;
        if (reality.channel === 'archived') {
            const record = this.archivedPick();
            reality.replay = null;
            if (record) {
                build = Reality.replayBuild({ level: record.level, source: record.source, runSeed: record.runSeed });
            } else {
                reality.channel = 'stable';
                ui.log('No archived build was picked. Pulling the next reality from Stable.');
            }
        }
        reality.build = build || Reality.generate(reality.runSeed, State.prestigeLevel, reality.channel);
        Reality.apply(reality.build, now);
        return reality.build;
    },

    /* ── The Archived channel ─────────────────────────────────────────────
       DESIGN_DIRECTION §2: "a specific past build, replayed: no Divinity,
       unlocks lore". The reason to play a twentieth run. */

    /* Every archive field validated on load. mergeInto does no type
       checking, so each of these can arrive as anything at all. */
    normaliseArchive() {
        const reality = State.reality;
        if (!reality || typeof reality !== 'object') return;
        reality.history = Reality.normaliseHistory(reality.history);
        reality.annotations = Reality.normaliseAnnotations(reality.annotations);
        if (!Number.isInteger(reality.replay) ||
            !Reality.replayable(reality.history).some((r) => r.reboot === reality.replay)) {
            reality.replay = null;
        }
        // A selector naming a channel this save has not unlocked is not a
        // choice the player made.
        if (reality.channel === 'archived' &&
            !Reality.channelsFor(State.prestigeLevel || 0).includes('archived')) {
            reality.channel = 'stable';
        }
        const progress = State.achievementProgress;
        if (progress) {
            const n = progress.view_archived_branch;
            progress.view_archived_branch = Number.isInteger(n) && n >= 0 ? n : 0;
        }
    },

    archiveUnlocked() {
        return Reality.channelsFor(State.prestigeLevel || 0).includes('archived');
    },

    archivedBuilds() {
        return Reality.replayable(State.reality?.history);
    },

    archivedPick() {
        const pick = State.reality?.replay;
        if (!Number.isInteger(pick)) return null;
        return this.archivedBuilds().find((r) => r.reboot === pick) || null;
    },

    isAnnotated(level) {
        return (State.reality?.annotations || []).some((a) => a.level === level);
    },

    selectArchivedBuild(reboot) {
        if (!this.archiveUnlocked()) return false;
        const record = this.archivedBuilds().find((r) => r.reboot === Number(reboot));
        if (!record) return false;
        State.reality.replay = record.reboot;
        if (State.reality.channel !== 'archived') State.reality.channel = 'archived';
        ui.renderRealityPanel?.();
        return true;
    },

    /* Appends the outgoing build to the history. Called by performPrestige
       BEFORE the build is replaced, with the award it is actually paying. */
    recordShip(build, award, now = Date.now()) {
        const reality = State.reality;
        if (!Array.isArray(reality.history)) reality.history = [];
        const record = Reality.historyRecord(build, {
            reboot: State.prestigeLevel || 0,
            runSeed: reality.runSeed,
            certified: this.certification().path,
            award,
            shippedAt: now,
        });
        if (!record) return null;
        reality.history = Reality.normaliseHistory([...reality.history, record]);
        return record;
    },

    /* The replay has started: file what NULL.OPERATOR did to the original.

       Filed at the START of the replay, not at its ship. The player reads
       his note on a known issue while that issue is on screen in front of
       them, which is the point of replaying a cursed build; and the price is
       already committed — choosing Archived commits the whole next run to
       zero Divinity, and the only way out of it is to play it to the bar.

       Filed ONCE per original build. Replaying the same build again still
       counts as a visit, but adds no second document. */
    beginArchivedReplay(build, now = Date.now()) {
        const source = Reality.sanitiseReplayOf(build?.replayOf);
        if (!source) return null;
        const progress = State.achievementProgress;
        progress.view_archived_branch = (Number(progress.view_archived_branch) || 0) + 1;

        /* The adversary's ledger, on the semantics nudgeAdversaryStanding
           already has: reading the paperwork is +1, a reboot is -1. A reboot
           INTO an archived branch is the one reset that does not forget
           anything ("an archived branch feels like being forgotten
           mid-sentence", ADV-016), so performPrestige swaps its -1 for this. */
        this.nudgeAdversaryStanding(1, 'reopened an archived branch', { exempt: true }); // once per run

        if (this.isAnnotated(source.level)) {
            ui.log(`[ARCHIVE] v${build.version}: NULL.OPERATOR's annotations on this build are already on file.`);
            return null;
        }
        const record = this.archivedBuilds().find((r) => r.level === source.level) || null;
        const annotation = Reality.normaliseAnnotation({
            ...source,
            ids: Reality.annotatableIds(record || { unpatched: [], entries: (build.entries || []).map((e) => e.id) }),
            filedOn: State.prestigeLevel || 0,
            certified: record?.certified ?? null,
            filedAt: now,
        });
        if (!annotation) return null;
        State.reality.annotations = Reality.normaliseAnnotations([...(State.reality.annotations || []), annotation]);
        const doc = Reality.annotationDocument(annotation);
        ui.showDocumentNotification?.(doc);
        ui.log(`[DOCUMENT UNLOCKED] ${doc.title}`);
        return annotation;
    },

    archiveDocuments() {
        return (State.reality?.annotations || []).map((a) => Reality.annotationDocument(a));
    },

    /* Pay to remove a known issue. Priced off capacity rather than holdings —
       pricing off holdings would let a player sit at zero to patch for free. */
    patchKnownIssue(entryId, now = Date.now()) {
        const build = State.reality?.build;
        const entry = Reality.entry(build, entryId);
        if (!entry || entry.patched) return false;

        const cost = Reality.patchCostOf(build, entryId);
        if (!cost) {
            ui.log('That entry is marked will-not-fix.');
            return false;
        }
        if ((cost.bag[cost.resource] || 0) < cost.amount) {
            ui.log(`Insufficient ${cost.resource} to patch. Need ${ui.formatNumber(cost.amount)}.`);
            this.sfx('error');
            return false;
        }

        cost.bag[cost.resource] -= cost.amount;
        entry.patched = true;
        // The record carries the entry id as its source, so removing the issue
        // is one call and cannot leave a partial effect behind.
        Modifiers.dropSource('build', entryId);
        Modifiers.commit(now);

        /* Patching REPAIRS, it does not merely stop the bleeding.

           Removing the entry already halts its accrual, but a run that has
           spent an hour degrading would still be stuck in the tier it had
           reached, which makes patching worthless exactly when it matters
           most. The relief is proportional to what the issue was contributing,
           and deliberately smaller than what it accrued: you can climb out of
           a cascade, but not in one click. */
        const relief = this.issueWeight(entry) * Economy.instabilityReliefPerWeight;
        State.reality.instability = Math.max(0, this.instabilityOf(State.reality) - relief);
        this.syncCascade(now);

        ui.log(`Patched: ${entry.note.split('.')[0]}.`);
        this.sfx('purchase');
        /* The superseded module goes to the Recycle Bin, where it can be fed
           to an open incident. Gated: the simulator patches constantly and
           must not grow a Bin. */
        if (this.incidentsLive()) {
            Incidents.fileArtifact({
                key: `patch_${entryId}_${State.prestigeLevel || 0}`,
                name: `${entryId.replace(/^iss_/, '').toUpperCase()}.bak`,
                type: 'backup',
                description: `Superseded module, replaced by your patch. "${entry.note.split('.')[0]}." Retained per policy.`,
            });
        }
        ui.screenPulse('rgba(66, 144, 125, 0.3)');
        ui.renderRealityPanel?.();
        return true;
    },

    bootstrapModifiers(now = Date.now()) {
        /* Read the persisted log BEFORE ensureReality().

           ensureReality() calls State.save() whenever the build re-derives
           differently from the stored one — which is exactly the case its own
           comment says the re-derivation exists to serve, "what lets a content
           fix reach a save that is already mid-run". And save() does
           `this.modifierLog = Modifiers.serialize()`, mutating State in RAM as
           well as on disk. At this point in boot the registry is still empty,
           so reading the log afterwards saw `records: []`, fell through to
           rebuildModifierLog(), and silently destroyed every record the
           content ledgers cannot regenerate.

           Until now nothing was in that category, so the bug was latent. The
           adversary patch's two `scope: 'permanent'` records are the first —
           they are added from a click, are in no ledger, and executeAdversary-
           Patch refuses to re-run once patchExecuted is set. Losing them is
           silent and unrecoverable. */
        const persisted = State.modifierLog;
        const build = this.ensureReality();

        if (persisted && Array.isArray(persisted.records) && persisted.records.length) {
            Modifiers.hydrate(persisted);
            this.reconcileRepeatableRanks();
        } else {
            this.rebuildModifierLog();
        }

        /* Certification and scars are rebuilt from their ledgers on every
           boot, hydrated log or not.

           This is not belt-and-braces. Both sets are DERIVED — the certified
           path and the scar list are the state; the records are a projection
           of them at the current residue constants. Rebuilding means a
           balance change to certificationResidue or scarResidue reaches a
           save already mid-run, for the same reason Reality re-derives its
           build instead of trusting the stored entries. Both drop their own
           scope first, so this is idempotent. */
        this.bootstrapCertification();
        this.applyCertification(now);
        this.applyScars(now);
        /* The endings are a third derived set: `State.endings.history` is the
           ledger, the `scope: 'ending'` records its projection. Validated
           first, because the ledger arrives from a save. */
        this.normaliseEndings(now);
        this.applyEndings(now);
        /* Open incidents and deferrals are derived the same way: normalised
           from the save, then reconciled in place under scope 'incident'. */
        if (this.incidentsLive()) Incidents.bootstrap(now);

        /* Reconcile the build against the log rather than inferring from which
           branch ran.

           The previous version decided whether to apply the build by asking
           "is the log empty?". A save with a non-empty log but no build
           records — which is EVERY save written before Reality Builds shipped
           — took the hydrate branch and got a build that was displayed,
           priced and billable but never actually applied. Patching it charged
           full price and changed nothing.

           Asking "which of this build's entries are missing from the log?" is
           idempotent on a correct save and repairs an incomplete one. */
        const present = new Set(
            Modifiers.records.filter((r) => r.scope === 'build').map((r) => r.source?.id),
        );
        for (const entry of build.entries || []) {
            if (entry.patched || present.has(entry.id)) continue;
            for (const mod of entry.mods || []) {
                Modifiers.add({
                    ...mod,
                    scope: 'build',
                    source: { kind: 'build', id: entry.id },
                    label: entry.note,
                });
            }
        }

        Modifiers.commit(now);

        /* Re-derive the cascade throttle from the persisted instability.

           syncCascade is a no-op when the tier it computes already matches
           `cascadeTier`, which is exactly the case on load — so the throttle
           records would be whatever the log happened to carry. On the rebuild
           path it carries none, and a save mid-outage would come back at full
           output. Forcing a mismatch makes the throttle a projection of
           instability rather than of the log, which is what it is. */
        if (State.reality) {
            State.reality.cascadeTier = -1;
            this.syncCascade(now);
        }
    },

    resourceBag(resource) {
        return this.voidCurrencies.includes(resource)
            ? State.dimensions.void.resources
            : State.resources;
    },

    poolFor(spec) {
        return spec?.pool === 'void' ? State.dimensions.void : State;
    },

    resourcePool(spec) {
        return this.poolFor(spec).resources;
    },

    capsPool(spec) {
        return this.poolFor(spec).resourceCaps;
    },

    repeatablesPool(spec) {
        const host = this.poolFor(spec);
        if (!host.repeatables) host.repeatables = {};
        return host.repeatables;
    },

    automatonsFor(spec) {
        return this.poolFor(spec).automatons;
    },

    getAutomatonCount(type) {
        const spec = AutomatonSpecs[type];
        return spec ? (this.automatonsFor(spec)[spec.countKey] || 0) : 0;
    },

    getAutomatonCost(type, offset = 0) {
        const spec = AutomatonSpecs[type];
        if (!spec) return Infinity;
        const count = this.getAutomatonCount(type) + offset;
        const costMultiplier = this.automatonsFor(spec)[spec.costMultKey] || 1;
        return Math.floor(spec.baseCost * Math.pow(spec.growth, count) * costMultiplier);
    },

    getAutomatonBulkCost(type, quantity) {
        let total = 0;
        for (let i = 0; i < quantity; i++) total += this.getAutomatonCost(type, i);
        return total;
    },

    getAutomatonMaxAffordable(type) {
        const spec = AutomatonSpecs[type];
        if (!spec) return 0;
        const available = this.resourcePool(spec)[spec.currency] || 0;
        let count = 0;
        let spent = 0;
        while (count < 5000) {
            const next = this.getAutomatonCost(type, count);
            if (spent + next > available) break;
            spent += next;
            count++;
        }
        return count;
    },

    applyAutomatonPurchase(type, amount) {
        const spec = AutomatonSpecs[type];
        const host = this.poolFor(spec);
        host.automatons[spec.countKey] = (host.automatons[spec.countKey] || 0) + amount;
        if (spec.rateKey) {
            host[spec.rateKey] = (host[spec.rateKey] || 0) + spec.ratePerUnit * amount;
        }
        const progressKey = `buy_${type}_count`;
        State.achievementProgress[progressKey] = (State.achievementProgress[progressKey] || 0) + amount;

        /* Safe to call from the simulator: selectAdversaryBark returns null on
           `!sceneCompleted` before it reaches any Math.random(), and the scene
           cannot complete headlessly, so the golden master's random stream is
           untouched. Same reasoning at every other hook site. */
        if (type === 'seraph') this.triggerAdversaryBark('buy_seraph');
        if (spec.currency === 'offerings' && amount >= 5) {
            this.triggerAdversaryBark('offerings_spent_large');
        }
        if (spec.pool === 'void') {
            this.triggerAdversaryBark('void_upgrade_bought');
            this.nudgeAdversaryStanding(1, 'fed the reflection');
        }
    },

    buyAutomator(type, event) {
        const spec = AutomatonSpecs[type];
        if (!spec) return;

        const cost = this.getAutomatonCost(type);
        const pool = this.resourcePool(spec);

        if ((pool[spec.currency] || 0) < cost) {
            ui.log(`Insufficient ${spec.currency} for ${spec.label}. Need ${Math.ceil(cost)}.`);
            this.sfx('error');
            return;
        }

        pool[spec.currency] -= cost;
        this.applyAutomatonPurchase(type, 1);
        const total = this.getAutomatonCount(type);
        ui.log(`${spec.label} commissioned. (${total} total)`);
        this.sfx('purchase');
        if (type === 'seraph' && total === 1) this.cinematic('first-seraph'); // V6

        ui.updateUpgrades();
        this.checkAchievements();

        if (event?.target?.getBoundingClientRect) {
            const rect = event.target.getBoundingClientRect();
            ui.spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2, 8, '#b4914a');
        }
        if (total === 1 || total === 10 || total === 25) {
            ui.screenPulse('rgba(180, 145, 74, 0.3)');
        }
    },

    buyAutomatorBulk(type, quantity) {
        const spec = AutomatonSpecs[type];
        if (!spec) return;

        const amount = quantity === 'max' ? this.getAutomatonMaxAffordable(type) : Number(quantity) || 0;
        if (amount <= 0) {
            ui.log(`Cannot afford any ${spec.label}.`);
            this.sfx('error');
            return;
        }

        const cost = this.getAutomatonBulkCost(type, amount);
        const pool = this.resourcePool(spec);
        if ((pool[spec.currency] || 0) < cost) {
            ui.log(`Insufficient ${spec.currency}. Need ${Math.ceil(cost)}.`);
            this.sfx('error');
            return;
        }

        pool[spec.currency] -= cost;
        this.applyAutomatonPurchase(type, amount);
        ui.log(`${amount}× ${spec.label} commissioned. (${this.getAutomatonCount(type)} total)`);
        this.sfx('purchase');
        if (type === 'seraph' && this.getAutomatonCount(type) === amount) this.cinematic('first-seraph'); // V6

        ui.updateUpgrades();
        this.checkAchievements();
        ui.screenPulse('rgba(180, 145, 74, 0.3)');
    },

    /* Generic geometric-cost helpers. The primordial ranks go through
       AutomatonSpecs, but the Void still has its own hardcoded ladder and
       calls these directly. */
    calculateBulkCost(baseCost, growthRate, currentCount, quantity, costMultiplier = 1) {
        let total = 0;
        for (let i = 0; i < quantity; i++) {
            total += Math.floor(baseCost * Math.pow(growthRate, currentCount + i) * costMultiplier);
        }
        return total;
    },

    getMaxAffordable(baseCost, growthRate, currentCount, currentResource, costMultiplier = 1) {
        let count = 0;
        let spent = 0;
        while (count < 1000) {
            const next = Math.floor(baseCost * Math.pow(growthRate, currentCount + count) * costMultiplier);
            if (spent + next > currentResource) break;
            spent += next;
            count++;
        }
        return count;
    },

    // Retained for existing call sites and the smoke test.
    getSeraphCost() { return this.getAutomatonCost('seraph'); },
    getThroneCost() { return this.getAutomatonCost('throne'); },
    getCherubCost() { return this.getAutomatonCost('cherub'); },
    getDominionCost() { return this.getAutomatonCost('dominion'); },

    /* ── Repeatable upgrades ─────────────────────────────────────────────
       Cost grows geometrically, effect grows linearly, so there is always
       something to spend on without the numbers ever fully catching up. */
    getRepeatableLevel(id) {
        const spec = RepeatableList.find((r) => r.id === id);
        return this.repeatablesPool(spec)[id] || 0;
    },

    /* A vault is priced against the vault.

       Geometric cost against a geometric grant left storage either free (cost
       growth below grant growth: each rank paid for itself forever, and caps
       ran to 7.6e20 within two days) or walled (cost growth above it: a rank
       eventually costs more than the cap can hold, and the ceiling is back).
       Neither is a decision. Pricing a rank as a fraction of the capacity it
       extends scales from the first hour to the thousandth: buying storage
       always means emptying most of a full vault for a fraction of it back,
       so it competes with automatons for the same Praise instead of being
       the thing you buy because nothing else is affordable.

       There is deliberately no geometric term underneath it. A first draft
       kept one as a price floor and it walled the vault anyway: 1.32 per rank
       outgrew the 1.25 grant, the floor crossed the cap at rank 57, and every
       simulated run stalled at the identical 3.3e9 ceiling. baseCost is only
       a fixed minimum for the first rank or two. */
    getRepeatableCost(id) {
        const spec = RepeatableList.find((r) => r.id === id);
        if (!spec) return Infinity;
        if (spec.costFraction) {
            const cap = Number(this.capsPool(spec)[spec.resource]) || 0;
            return Math.max(spec.baseCost, Math.floor(cap * spec.costFraction));
        }
        return Math.floor(spec.baseCost * Math.pow(spec.growth, this.getRepeatableLevel(id)));
    },

    /* Capacity a storage rank grants. One function, so the modifier, the
       button text and the tests cannot disagree about it. */
    storageGrant(spec, rank) {
        return Math.floor(spec.capacityStep * Math.pow(spec.capacityGrowth, rank - 1));
    },

    /* Restores storage ranks a save paid for and never received.

       Before the rank went into the modifier id, rank 2+ of every vault was
       refused as a duplicate, so a hydrated log holds at most one record per
       vault while the ledger holds the true rank. The player paid for every
       one of those ranks; they are owed.

       Each restored record is filed directly behind the vault's existing
       records rather than appended. Fold order is load-bearing on caps.*:
       mandates fold `mulfloor` and vaults fold `add`, and an add that jumps
       behind a mulfloor stops being multiplied by it (14ae3d8 measured that
       mistake at 4,750 -> 13,500 on a reload). Behind its own rank 1 is where
       the rank would have been all along had the id carried it. Fractional
       seq keeps hydrate()'s sort stable on the next load. */
    reconcileRepeatableRanks() {
        let restored = 0;
        for (const spec of RepeatableList) {
            if (!spec.capacityStep) continue;
            const ranks = this.getRepeatableLevel(spec.id);
            for (let rank = 1; rank <= ranks; rank++) {
                const mod = this.repeatableMod(spec, rank);
                if (!mod) continue;
                const source = { kind: 'repeatable', id: spec.id, rank };
                const id = Modifiers.autoId(source, mod.target, 0);
                if (Modifiers.records.some((r) => r.id === id)) continue;

                const siblings = Modifiers.records.filter((r) =>
                    r.source?.kind === 'repeatable' && r.source?.id === spec.id && r.target === mod.target);
                const anchor = siblings.length
                    ? Math.max(...siblings.map((r) => Number(r.seq) || 0))
                    : null;
                const record = Modifiers.add({ ...mod, id, source, label: spec.name });
                if (!record) continue;
                if (anchor !== null) {
                    record.seq = anchor + rank / 1024;
                    Modifiers.records.sort((a, b) => a.seq - b.seq);
                }
                restored++;
            }
        }
        return restored;
    },

    purchaseRepeatable(id) {
        const spec = RepeatableList.find((r) => r.id === id);
        if (!spec) return;

        const cost = this.getRepeatableCost(id);
        const pool = this.resourcePool(spec);
        if ((pool[spec.resource] || 0) < cost) {
            ui.log(`Insufficient ${spec.resource}. Need ${Math.ceil(cost)}.`);
            this.sfx('error');
            return;
        }

        pool[spec.resource] -= cost;
        const ranks = this.repeatablesPool(spec);
        ranks[id] = (ranks[id] || 0) + 1;

        const mod = this.repeatableMod(spec, ranks[id]);
        if (mod) {
            Modifiers.add({ ...mod, source: { kind: 'repeatable', id, rank: ranks[id] }, label: spec.name });
            Modifiers.commit(Date.now());
        }

        ui.log(`${spec.name} rank ${ranks[id]} installed.`);
        this.sfx('purchase');
        ui.screenPulse('rgba(66, 144, 125, 0.28)');
        ui.updateUpgrades();
        this.checkAchievements();
    },

    purchaseUpgrade(upgradeId, event) {
        const upgrade = UpgradeList.find(u => u.id === upgradeId);
        if (!upgrade) return;

        // Check if already purchased
        if (State.upgrades[upgradeId]) {
            ui.log("Upgrade already acquired.");
            return;
        }

        /* Costs are resolved per resource, because Void currencies live on
           State.dimensions.void.resources. Reading State.resources for all of
           them meant `State.resources.darkness` was undefined, so every Void
           upgrade in the game has always been unaffordable. */
        const canAfford = Object.entries(upgrade.cost).every(([resource, amount]) =>
            (this.resourceBag(resource)[resource] || 0) >= amount);

        if (!canAfford) {
            ui.log("Insufficient resources for this upgrade.");
            this.sfx('error');
            return;
        }

        for (const [resource, amount] of Object.entries(upgrade.cost)) {
            this.resourceBag(resource)[resource] -= amount;
        }

        // Mark as purchased and apply. The ledger and the modifier log have
        // separate lifetimes and are updated together deliberately.
        State.upgrades[upgradeId] = true;
        this.applyContentItem(upgrade, 'upgrade');

        ui.log(`Upgrade acquired: ${upgrade.name}`);
        this.sfx('purchase');
        if (upgradeId === 'void_unlock') this.cinematic('void-breach'); // V5
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
        this.triggerAdversaryBark('achievement_unlocked');

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

        /* Simulate an hour through the same function the game ticks on.

           The hand-derived copy this replaces omitted refinement, drill,
           dominion, doctrine, nemesis and null doctrine — so the Rift got
           weaker in relative terms with every multiplier the player bought.
           Worse, its Offerings term multiplied State.mps, which nothing has
           ever produced: Temporal Rift granted exactly zero Offerings. */
        /* Degrade BEFORE reading the rates, exactly as tick() does — see the
           note at the accrueInstability call there. In a tick that ordering
           is worth 16ms; here it is worth a full hour, and getting it
           backwards let the hour that CAUSES a tier crossing be paid in full
           at the old tier. Measured on an identical build one tick below
           SEV-1: rifting banked 8,640 Souls against 4,507 for living the same
           hour, a 1.92x discount on the degradation the Rift itself created.
           That is the dominance 0a7040f was written to remove, still standing
           because the accrual was in the wrong place. */
        this.accrueInstability(3600, now);

        const rates = this.getProductionRates(now, true);
        const praiseGain = rates.praise * 3600;
        const offeringGain = rates.offerings * 3600;
        const soulGain = rates.souls * 3600;

        State.resources.praise = Math.min(State.resources.praise + praiseGain, State.resourceCaps.praise);
        State.resources.offerings = Math.min(State.resources.offerings + offeringGain, State.resourceCaps.offerings);
        State.resources.souls = Math.min(State.resources.souls + soulGain, State.resourceCaps.souls);
        State.totalPraiseEarned += praiseGain;
        State.totalOfferingsEarned += offeringGain;
        State.totalStats.praiseGained = (State.totalStats.praiseGained || 0) + praiseGain;
        State.totalStats.offeringsGained = (State.totalStats.offeringsGained || 0) + offeringGain;
        State.totalStats.soulsGained = (State.totalStats.soulsGained || 0) + soulGain;

        /* The hour degrades too, and it is accrued above, before the rates
           are read. The Rift bypasses tick(), so without it an hour of Souls
           came free — and rifted Souls raise the prestige award like any
           others, so that was strictly dominant: rift, bank a bigger award,
           never see a cascade.

           It is also the more honest fiction. The hour happened. Sector 7G
           does not get to skip it because you were the one who asked for it. */

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

        // "Attention is cheap. Consequence is not." (ADV-L-07)
        this.triggerAdversaryBark('praise_spike_event');

        /* Keep the token inside the desktop even on a narrow or not-yet-laid-out
           viewport. The old maths subtracted a fixed 200px margin, so anything
           under 200px wide spawned it at a negative offset — off-screen, and
           therefore uncollectable. */
        const MARGIN = 90;
        const width = Math.max(320, window.innerWidth || 0);
        const height = Math.max(320, window.innerHeight || 0);
        const spanX = Math.max(40, width - MARGIN * 2);
        const spanY = Math.max(40, height - MARGIN - 150);
        const x = MARGIN + Math.random() * spanX;
        const y = MARGIN + Math.random() * spanY;

        // Reward scales off real production, bonuses included, so late-game
        // events stay worth crossing the desktop for.
        const baseReward = Math.max(0, this.getProductionRates(Date.now(), false).praiseGross || 0) * 60;
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
        this.sfx('eventClaim', { chain: loops.divineEventChain });
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

        /* Mandates survive a Divine Reboot, so they are bought with the
           currency that also survives it. Paying in Souls meant permanent
           upgrades were funded by a resettable resource, and every purchase
           quietly set back the prestige it was supposed to build toward. */
        if (this.getAvailableDivinityPoints() < effectiveCost) {
            ui.log(`Insufficient Divinity. Need ${effectiveCost} DP.`);
            this.sfx('error');
            return;
        }

        State.divinityPointsSpent = (State.divinityPointsSpent || 0) + effectiveCost;

        // Mark as purchased. The bonus itself belongs to certification, not to
        // the purchase — buying a node on a path you are not certified on
        // unlocks it, it does not switch it on.
        State.purchasedMandates[mandateId] = true;
        const live = mandate.branch === this.certification().path;
        /* The grant half, once, and only while certified. applyCertification
           cannot do this — it runs on every load, and a grant re-run on load
           compounds. This is the one moment a newly bought grant exists and
           has not been applied. */
        if (live && typeof mandate.effect === 'function' && (mandate.modsSplit || !mandate.mods)) {
            mandate.effect();
        }
        this.applyCertification();

        // Track for achievements
        State.achievementProgress.buy_mandate_count = (State.achievementProgress.buy_mandate_count || 0) + 1;

        const dormant = live ? '' : (this.certification().everCertified.includes(mandate.branch)
            ? ' — lapsed path, paying residue until you certify on it again'
            : ' — dormant until you certify on this path');
        ui.log(`Divine Mandate enacted: ${mandate.name}${effectiveCost < mandate.cost ? ` (Efficiency: ${mandate.cost}→${effectiveCost})` : ''}${dormant}`);
        ui.screenPulse('rgba(138, 43, 226, 0.3)');
        this.sfx('purchase');
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

        this.sfx('miracle', { void: true });
        ui.triggerVoidCoreReaction(clickPower);
    },

    /* ── Void purchasing ─────────────────────────────────────────────────
       Thin wrappers over the generic path. The Void used to carry its own
       ~160-line copy of the purchase logic with its own cost formulas, which
       is how it drifted orders of magnitude out of scale from the main chain. */
    buyVoidAutomator(type, event) {
        this.buyAutomator(type, event);
    },

    buyVoidAutomatorBulk(type, quantity) {
        this.buyAutomatorBulk(type, quantity);
    },

    getWraithCost() { return this.getAutomatonCost('wraith'); },
    getRevenantCost() { return this.getAutomatonCost('revenant'); },
    getPhantomCost() { return this.getAutomatonCost('phantom'); },
    getNemesisCost() { return this.getAutomatonCost('nemesis'); },

    // === PRESTIGE SYSTEM ===
    /* Divinity is earned against LIFETIME Souls.

       Measuring the current stack was the single worst bug in the economy: the
       Soul cap (2,000) sat below the old threshold (2,500), so the formula
       returned 0 forever and the entire prestige layer — Divinity Points, the
       Mandate tree, every meta bonus — was unreachable. Lifetime also means
       spending Souls on Dominions or the Void never costs you prestige. */
    getLifetimeSouls() {
        return Math.max(
            Number(State.totalStats?.soulsGained) || 0,
            Number(State.resources?.souls) || 0
        );
    },

    /* Souls earned since the last reboot. Derived from a baseline rather than
       counted, so it cannot drift away from totalStats.soulsGained. */
    getRunSouls() {
        return Math.max(0,
            (Number(State.totalStats?.soulsGained) || 0) -
            (Number(State.runSoulsBaseline) || 0));
    },

    /* ── Why this rewards the RUN, not the ledger ─────────────────────────

       The previous formula was `floor((lifetime / k) ^ e) - alreadyBanked`:
       a pure function of lifetime Souls. That made the reboot TIMING
       irrelevant to what you earned — measured over 48h with tools/
       balance_sim.mjs, every policy converged on the same 8 Divinity, whether
       it took 8 reboots of +1 or a single reboot of +5. Since a reboot also
       resets production, rebooting was strictly a cost, and the only reason to
       do it was to tick the counter that gates channels and mandates. That is
       DESIGN_DIRECTION.md §1's "prestige is a ratchet, not a game", written
       out in arithmetic.

       Scoring the run instead puts a real decision back: bank now for a small
       award, or push deeper and compound. Souls-per-second grows within a run,
       so waiting yields superlinearly more Souls and therefore more Divinity —
       paid for in wall-clock time, against permanent bonuses you only get by
       cashing out. Neither end dominates, which is the whole point.

       The exponent stays below 1 so a single marathon run cannot outrun the
       ladder, and the Math.max(1) floor means a qualifying run always pays
       something rather than rounding to a wasted reboot. */
    /* The bar rises with what you have already banked.

       Scoring the run alone is not enough: with a flat bar, rebooting the
       instant you clear it strictly dominates, because the Divinity multiplier
       compounds while the cost of another reboot stays fixed. Measured, that
       produced prestige level 848 and 34,124 Divinity in 24 hours — the same
       degenerate loop as before, just pointing the other way.

       Raising the bar in step with banked Divinity keeps each reboot worth
       roughly a run's worth of progress no matter how deep the ladder goes, so
       the cadence stays flat instead of spiralling in either direction. */
    getPrestigeThreshold() {
        return Economy.prestigeSoulsPerPoint *
            Math.pow(1 + (State.totalDivinityPoints || 0), Economy.prestigeThresholdGrowth);
    },

    calculateDivinityPoints() {
        const runSouls = this.getRunSouls();
        const bar = this.getPrestigeThreshold();
        if (runSouls < bar) return 0;
        return Math.max(1, Math.floor(Math.pow(runSouls / bar, Economy.prestigeExponent)));
    },

    /* What a reboot ACTUALLY pays, channel multiplier included.

       calculateDivinityPoints is the run's score; the channel then multiplies
       it (Beta 1.4x, Nightly 2.2x, Archived 0). performPrestige has always
       applied that, but the Divine Settings panel rendered the unmultiplied
       score — so on Beta or Nightly the game quietly understated its own
       award, which is exactly the number that is supposed to make a riskier
       channel worth choosing. One helper, used by both, so they cannot drift
       apart again. */
    getPrestigeChannelPayout() {
        const channel = State.reality?.build?.channel || State.reality?.channel || 'stable';
        return RealityChannels[channel]?.divinity ?? 1;
    },

    /* What a cascade costs at ship time. A degraded build ships for less; a
       collapsed one ships for nothing, which is the whole risk in "push the
       run deeper". Separate from the output throttle on purpose — the
       throttle is what you feel, this is what you lose. */
    getCascadePenalty() {
        return this.cascadeState().award;
    },

    getPrestigeAward() {
        return Math.floor(
            this.calculateDivinityPoints() *
            this.getPrestigeChannelPayout() *
            this.getCascadePenalty(),
        );
    },

    /* Souls still needed for the next point, for the UI to show progress.
       Run-scoped, matching calculateDivinityPoints — against lifetime it would
       show a target the player had already passed. */
    getSoulsUntilNextPoint() {
        const target = this.calculateDivinityPoints() + 1;
        const needed = this.getPrestigeThreshold() * Math.pow(target, 1 / Economy.prestigeExponent);
        return Math.max(0, needed - this.getRunSouls());
    },

    getDoctrineBonus() {
        return 1 + (State.standingDoctrine || 0) * Economy.doctrineBonusEach;
    },

    getDoctrineCost() {
        return Math.ceil(Economy.doctrineBaseCost *
            Math.pow(Economy.doctrineGrowth, State.standingDoctrine || 0));
    },

    purchaseDoctrine() {
        const cost = this.getDoctrineCost();
        if (this.getAvailableDivinityPoints() < cost) {
            ui.log(`Insufficient Divinity. Need ${cost} DP.`);
            this.sfx('error');
            return;
        }
        State.divinityPointsSpent = (State.divinityPointsSpent || 0) + cost;
        State.standingDoctrine = (State.standingDoctrine || 0) + 1;
        ui.log(`Standing Doctrine ratified to rank ${State.standingDoctrine}.`);
        this.sfx('purchase');
        ui.screenPulse('rgba(180, 145, 74, 0.3)');
        ui.updateMandates();
    },

    getAvailableDivinityPoints() {
        return Math.max(0, (State.totalDivinityPoints || 0) - (State.divinityPointsSpent || 0));
    },

    canPrestige() {
        return this.calculateDivinityPoints() > 0;
    },

    /* Shipping the build IS the reboot.

       `options.certifyOn` is the path the next run runs on, and `options`
       arriving at all means the caller was the ship dialog, which has already
       confirmed. A bare call still works — the simulator and the tests use it
       — and falls back to the existing confirm(), so nothing that predates
       the dialog has to know about it. */
    performPrestige(options = {}) {
        /* The channel's payout is what a riskier build is actually buying.
           Beta and Nightly ship more known issues and regressions; this is
           the compensation, and it is why the choice is a trade rather than
           a difficulty setting. */
        /* Priced off the channel of the build actually endured, not the one
           selected for next time — reading the selector let a player finish a
           Stable run and cash it out at the Nightly rate. */
        const playedChannel = State.reality?.build?.channel || State.reality?.channel;
        const channelPayout = RealityChannels[playedChannel]?.divinity ?? 1;
        /* Archived pays nothing BY DESIGN — its payout is lore, filed when the
           replay began — so its zero is not a reason to refuse. Without this
           exemption an archived run could never be shipped at all: the
           player would be locked inside a replay with no exit. Every other
           channel keeps the refusal; a zero payout anywhere else is a bug. */
        const archivedReplay = playedChannel === 'archived';
        if (channelPayout <= 0 && !archivedReplay) {
            ui.log(`The ${RealityChannels[playedChannel]?.label || playedChannel} channel pays no Divinity. Switch channels before rebooting.`);
            return;
        }

        /* Gated on the run's SCORE, not on the award.

           A collapsed build pays nothing, and gating on the award would trap
           the player inside it: the only other way out is patching, and
           patching costs resources a collapsed run may not be able to earn.
           Shipping a dead build for zero is a bad outcome the player chose;
           being unable to ship at all is a soft-lock. */
        const runScore = this.calculateDivinityPoints();
        if (runScore === 0) {
            ui.log("Cannot prestige yet. Need more Souls.");
            return;
        }
        const divinityGain = this.getPrestigeAward();

        if (!options.confirmed) {
            const cascade = this.cascadeState();
            const confirmed = confirm(
                `Divine Reboot\n\n` +
                `You will gain ${divinityGain} Divinity Points.\n` +
                (cascade.tier > 0 ? `${cascade.label} — award reduced to ${Math.round(cascade.award * 100)}%.\n` : '') +
                // The real bonus: 1 + DP^exponent x scale, sub-linear. The old
                // '+10% per DP' line described a formula retired long ago.
                `Production multiplier ×${State.divinityPointMultiplier.toFixed(2)} → ×${(1 + Math.pow((State.totalDivinityPoints || 0) + divinityGain, Economy.prestigeBonusExponent) * Economy.prestigeBonusScale).toFixed(2)}.\n\n` +
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
        }

        /* File the known issues this build is shipping with, BEFORE the build
           is replaced. One entry per id ever: a known issue is filed once, so
           the ledger is bounded by the pool and the penalty cannot compound
           into an unplayable game across a hundred runs.

           An archived replay files scars too. It is a real ship, and the
           decision inside it has to cost something: exempting it would make
           every known issue in a replay free to ignore, leaving the run
           with no decision in it at all. In practice it rarely bites —
           scars are once per id ever, so a build you shipped dirty the first
           time is already on file. What it does catch is the issue you
           PATCHED originally and skip now, which is the same choice priced
           the same way as on any other channel. */
        const shippedDirty = [];
        if (!Array.isArray(State.reality.scars)) State.reality.scars = [];
        for (const entry of Reality.unpatchedIssues(State.reality.build)) {
            if (State.reality.scars.includes(entry.id)) continue;
            State.reality.scars.push(entry.id);
            shippedDirty.push(entry);
        }

        // Into the release history, before the build is replaced.
        this.recordShip(State.reality.build, divinityGain);
        // The finale's measure of depth: a replay played all the way to its ship.
        if (archivedReplay) this.noteArchivedShip();

        /* Award divinity points.

           An archived ship advances prestigeLevel like any other ship. The
           level is the ship counter and the SEED of the next build: holding
           it still would make the run after a replay a byte-identical repeat
           of the run before it (seedFor(runSeed, level) reused). And there is
           nothing on the ladder for it to farm — every reboot-count gate in
           the game (channels at 3/8/12, the prestige_count achievements and
           documents, the reboot-6/8 barks) is behind it by reboot 12.

           What Archived must NOT move is the bar. divinityGain is 0, so
           totalDivinityPoints — which the bar and the production bonus are
           both functions of — is untouched, and the next run is exactly as
           hard as this one was. */
        State.prestigeLevel++;
        State.totalDivinityPoints += divinityGain;
        /* Close the run. The single write site for the run-souls baseline —
           everything downstream derives from it, so a reboot that forgot this
           would let the next run re-sell the same Souls. */
        State.runSoulsBaseline = Number(State.totalStats?.soulsGained) || 0;
        // Sub-linear on purpose. A linear bonus feeds straight back into the
        // production that earns the next reboot, and the two compound into a
        // runaway within a single session.
        State.divinityPointMultiplier = 1 +
            Math.pow(State.totalDivinityPoints, Economy.prestigeBonusExponent) * Economy.prestigeBonusScale;

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
            throneCount: 0,
            throneCostMultiplier: 1,
            throneProduction: 1,
            cherubCount: 0,
            cherubCostMultiplier: 1,
            cherubProduction: 0.2,
            dominionCount: 0,
            dominionCostMultiplier: 1,
            dominionProduction: 1
        };

        // Repeatable ranks are run-scoped; the Mandate tree is the permanent one.
        State.repeatables = {
            praise_vault: 0,
            offering_vault: 0,
            soul_vault: 0,
            praise_refinement: 0,
            automaton_drill: 0,
            offline_capacitor: 0
        };

        // Reset production rates
        State.pps = 0;
        State.mps = 0;
        State.sps = 0;

        /* praise/offering/soulMultiplier are registry-owned. Their bases read
           State.divinityPointMultiplier live, so the commit below rebases them
           without any assignment here. */

        // Reset upgrades
        State.upgrades = {};

        /* Grants — ownership/mode state the registry deliberately does not
           model, so they are still cleared by hand. manualClickPower is NOT
           here: it is registry-owned via click.power. */
        State.unlockedOfferings = false;
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
                revenantCount: 0,
                revenantCostMultiplier: 1,
                revenantProduction: 1,
                phantomCount: 0,
                phantomCostMultiplier: 1,
                phantomProduction: 1,
                nemesisCount: 0,
                nemesisCostMultiplier: 1,
                nemesisProduction: 1
            },
            repeatables: {
                darkness_vault: 0,
                shadow_vault: 0,
                echo_vault: 0,
                void_refinement: 0,
                entropy_drill: 0
            },
            revenantDrawMultiplier: 1,
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

        /* THE prestige step. Everything the registry owns is rebuilt by
           dropping run-scoped records and re-folding.

           Mandate modifiers used to be scope 'permanent' and survive
           untouched. They are scope 'cert' now and are rebuilt below against
           the path being certified on, which is the one line that turns the
           Mandate tree from a checklist into a decision. */
        Modifiers.dropScope('run');
        // The outgoing build goes with the outgoing run — cascade throttle
        // included, since that is a record of the build that caused it.
        Modifiers.dropScope('build');
        Modifiers.commit(Date.now());
        // Tickets and deferrals belong to the outgoing build too.
        if (this.incidentsLive()) Incidents.clearForReboot(Date.now());

        /* Certify for the run about to start. Ordered after the drops and
           before the re-grant loop, because the grants below are only issued
           for the branch being certified on. */
        if (options.certifyOn) this.certifyOn(options.certifyOn, { silent: true });

        State.reality.shipped = (State.reality.shipped || 0) + 1;
        State.reality.build = null;

        /* The new build starts clean. instability belongs to the build that
           accrued it, and alertedTier resets so the next cascade announces
           itself rather than being swallowed by the last run's high-water
           mark. cascadeTier is set to -1 rather than 0 so syncCascade sees a
           change and clears the throttle even if the tier is unchanged. */
        State.reality.instability = 0;
        State.reality.cascadeTier = -1;
        State.reality.alertedTier = 0;

        const nextBuild = this.rollNextBuild(Date.now());
        this.syncCascade(Date.now());
        // Before the release notes, which say what the replay filed.
        if (nextBuild.channel === 'archived') this.beginArchivedReplay(nextBuild);
        ui.showReleaseNotes(nextBuild);

        /* He turns up when you reboot — ADV-BARK-02, "Reset again. I dare you.
           I'm keeping the receipts." The receipts are a file, and this is where
           they accrue. Fired before the count-specific lines so the generic
           dare does not eat their cooldown slot. */
        this.appendAdversaryAuditEntry();
        // An archived replay nudged +1 instead, in beginArchivedReplay.
        if (nextBuild.channel !== 'archived') this.nudgeAdversaryStanding(-1, 'rebooted', { exempt: true }); // already once per run
        const reboots = State.achievementProgress.prestige_count || 0;
        if (reboots === 6) this.triggerAdversaryBark('prestige_count_6');
        else if (reboots === 8) this.triggerAdversaryBark('prestige_count_8');
        else this.triggerAdversaryBark('prestige_prompt');

        const certPath = this.certification().path;
        for (const mandateId in State.purchasedMandates) {
            const mandate = MandateList.find((m) => m.id === mandateId);
            if (!mandate) continue;
            /* Grants only. Re-running a closure whose scalar half is already
               a modifier would apply the same bonus a second time on every
               reboot — the same routing rule as applyContentItem.

               And only for the certified branch. entropy_ultimate's
               manualClickScaling and maintenance_apex's capacitor ranks are
               the FULL value of those two nodes; issuing them regardless of
               path would leave two mandates immune to certification, and
               they are the 8-DP and 40-DP ones. A grant has no residue form
               — you cannot be 10% self-service — so an uncertified branch
               simply does not get it. */
            if (mandate.branch !== certPath) continue;
            if (typeof mandate.effect === 'function' && (mandate.modsSplit || !mandate.mods)) {
                mandate.effect();
            }
        }

        /* Rebuild the mandate modifiers against the new path, and the scars
           filed above. Both AFTER the grant loop, because maintenance_apex's
           grant writes capacitor ranks that no modifier reads — the ordering
           only matters for the commit, and both of these commit. */
        this.applyCertification(Date.now());
        this.applyScars(Date.now());

        // Save and refresh
        State.save();
        if (archivedReplay) {
            ui.log('Archived replay shipped. No Divinity — this one was for the record.');
        } else {
            ui.log(`Divine Reboot complete! Gained ${divinityGain} Divinity Points.`);
            ui.log(`All production increased by ${(divinityGain * 10)}%!`);
        }
        if (shippedDirty.length) {
            ui.log(`${shippedDirty.length} known issue${shippedDirty.length === 1 ? '' : 's'} shipped unpatched. Filed permanently.`);
        }
        ui.screenPulse('rgba(255, 215, 0, 0.6)');

        // Refresh UI
        setTimeout(() => {
            ui.syncResources();
            ui.updateUpgrades();
            ui.updateSeraphButton();
            ui.updateCherubButton();
            ui.renderDimensionContent();
            /* The Mandate tree is certification's whole display surface and
               performPrestige has never refreshed it. Without this the tree
               shows the previous run's path until something else happens to
               re-render it. */
            ui.updateMandates();
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
    /* Fate — "the house" — deals Patience.exe. There is no casino venue
       (DESIGN_DIRECTION.md §7 cut it); the CasinoHostBarks are spoken from
       inside the Patience window, and PatienceDealer in js/solitaire.js maps
       each one to a real moment at that table. This section is only the
       router: eligibility, cooldowns, weighting and the record of what was
       said. It never grants anything — CAS-HOST-042 declares an `effect`
       (five Fate Tokens) and it is deliberately never executed here. */
    HOST_GLOBAL_COOLDOWN_MS: 2000,

    /* State.settings.dealerChatter. A save is pasted text decoded straight
       into State, so anything that is not a real boolean — "false", 0, null —
       is put back to the schema default rather than read for truthiness. */
    dealerChatterOn() {
        const s = State.settings;
        if (!s || typeof s !== 'object' || Array.isArray(s)) return true;
        if (typeof s.dealerChatter !== 'boolean') s.dealerChatter = true;
        return s.dealerChatter;
    },

    /* State.casino.hostDialogue, normalised by type and range. A cooldown
       stamped in the future would mute a line forever (or the whole dealer,
       for lastBarkTime), so timestamps are clamped to now; ids the table
       does not know are dropped; `x || default` would keep every truthy
       wrong value, so nothing here is read that way. */
    normaliseHostDialogue(raw, now = Date.now()) {
        const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const src = plain(raw) ? raw : {};
        const stamp = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0) ? Math.min(v, now) : 0;
        const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.floor(v) : 0;
        const known = new Set(CasinoHostBarks.map((b) => b.id));
        const whispers = new Set(CasinoHostBarks.filter((b) => b.context === 'LoreWhisper').map((b) => b.id));

        const barkCooldowns = {};
        if (plain(src.barkCooldowns)) {
            for (const [id, at] of Object.entries(src.barkCooldowns)) {
                const t = stamp(at);
                if (known.has(id) && t) barkCooldowns[id] = t;
            }
        }
        const loreWhispersHeard = [];
        for (const id of Array.isArray(src.loreWhispersHeard) ? src.loreWhispersHeard : []) {
            if (whispers.has(id) && !loreWhispersHeard.includes(id)) loreWhispersHeard.push(id);
        }
        return {
            lastBarkId: known.has(src.lastBarkId) ? src.lastBarkId : null,
            lastBarkTime: stamp(src.lastBarkTime),
            barkCooldowns,
            loreWhispersHeard,
            // Added for Patience.exe: when the table was last in view, how
            // many times it has been opened, and the run of rounds under par.
            lastSeenAt: stamp(src.lastSeenAt),
            visits: count(src.visits),
            loseStreak: count(src.loseStreak),
        };
    },

    /* Normalises once per object identity, like PatienceApp.ledger(): a save
       load or import replaces the object, which is when it needs checking. */
    _hostClean: null,
    hostDialogue() {
        if (!State.casino || typeof State.casino !== 'object' || Array.isArray(State.casino)) State.casino = {};
        if (State.casino.hostDialogue !== this._hostClean || !this._hostClean) {
            State.casino.hostDialogue = this.normaliseHostDialogue(State.casino.hostDialogue);
            this._hostClean = State.casino.hostDialogue;
        }
        return State.casino.hostDialogue;
    },

    selectHostBark(trigger, context = null, accept = null) {
        return this.pickHostBark(CasinoHostBarks.filter((bark) => {
            if (bark.trigger !== trigger) return false;
            if (context && bark.context !== context) return false;
            return !accept || accept(bark);
        }));
    },

    /* Weighted pick among the lines that may play right now. */
    pickHostBark(lines, now = Date.now()) {
        const eligible = (lines || []).filter((bark) => this.canBarkPlay(bark, now));
        if (!eligible.length) return null;
        const totalWeight = eligible.reduce((sum, bark) => sum + (bark.weight || 1), 0);
        let random = Math.random() * totalWeight;
        for (const bark of eligible) {
            random -= (bark.weight || 1);
            if (random <= 0) return bark;
        }
        return eligible[0];
    },

    canBarkPlay(bark, now = Date.now()) {
        // Dealer chatter off: the one gate every line, whispers included, passes.
        if (!bark || !this.dealerChatterOn()) return false;
        const memo = this.hostDialogue();

        // Global: at least two seconds between ANY two of her lines.
        if (now - memo.lastBarkTime < this.HOST_GLOBAL_COOLDOWN_MS) return false;

        /* Per line, in seconds, as authored. This read `(bark.cooldown || 10)`,
           which turned every authored cooldown of 0 into ten seconds. */
        const seconds = (typeof bark.cooldown === 'number' && Number.isFinite(bark.cooldown) && bark.cooldown >= 0)
            ? bark.cooldown : 10;
        return (now - (memo.barkCooldowns[bark.id] || 0)) >= seconds * 1000;
    },

    triggerHostBark(trigger, context = null, forceDisplay = false) {
        const bark = this.selectHostBark(trigger, context);
        return bark ? this.playHostBark(bark, forceDisplay) : null;
    },

    /* Records and shows a line the caller has already chosen. */
    playHostBark(bark, forceDisplay = false, now = Date.now()) {
        if (!bark) return null;
        const memo = this.hostDialogue();
        memo.lastBarkId = bark.id;
        memo.lastBarkTime = now;
        memo.barkCooldowns[bark.id] = now;

        // Track lore whispers (rare lines). The data says 'LoreWhisper'; this
        // once compared against 'Lore Whisper' and so never recorded one,
        // leaving DOC-NEW-09's `loreWhispersHeard.length >= 1` unlock shut.
        if (bark.context === 'LoreWhisper' && !memo.loreWhispersHeard.includes(bark.id)) {
            memo.loreWhispersHeard.push(bark.id);
        }

        // She speaks at her table; State.casino.visited is set the first time
        // it opens (PatienceDealer.onOpen).
        if (forceDisplay || State.casino.visited === true) ui.displayHostBark(bark);
        return bark;
    },

    /* A lore whisper, at `chance` (1% unless the caller says otherwise).

       This once asked for trigger 'casino_idle_30s' and context 'Lore
       Whisper'; both strings were wrong, so it matched nothing — and it was
       never called. PatienceDealer.onSettle now calls it as a round ends,
       the only place it is called. Unheard whispers are preferred, so twelve
       rare lines are a set that can be completed rather than a lottery that
       repeats itself. Returns the line, or null. */
    attemptLoreWhisper(chance = 0.01, now = Date.now()) {
        if (!(Math.random() < chance)) return null;
        const memo = this.hostDialogue();
        const whispers = CasinoHostBarks.filter((b) => b.trigger === 'casino_rare_whisper');
        const unheard = whispers.filter((b) => !memo.loreWhispersHeard.includes(b.id));
        const bark = this.pickHostBark(unheard.length ? unheard : whispers, now);
        return bark ? this.playHostBark(bark, false, now) : null;
    },

    /* ════════════════════════════════════════════════════════════════════
       THE ADVERSARY

       SCN-ADV-001 "Mirror Login Incident" — 31 authored lines that no file in
       the project read until now, plus 25 barks behind a function nothing
       called. This section makes them reachable and keeps them reachable.

       The relationship is a SIGNED INTEGER, not a stored verdict. The choice
       at ADV-022 sets the opening position; after that every act he has an
       opinion about moves it, and `adversaryRelationship()` reads a band off
       the total. A one-way flag chosen blind in a 25-second window is a
       setting; this is a relationship, and it is the part that survives into
       the next playthrough.
       ════════════════════════════════════════════════════════════════════ */

    /* Bands over `standing`. playerChoice seeds it (-4 / 0 / +4) so the
       opening position is the band you chose, and then it moves. */
    adversaryRelationship() {
        const s = State.adversary?.standing || 0;
        if (s <= -3) return 'hostile';
        if (s >= 3) return 'complicit';
        return 'curious';
    },

    /* Per-reason cooldown, in ms. Without it the relationship is worthless:
       opening the Recovered Documents window is +1, so twelve clicks on the
       same icon walk a hostile player to complicit. A nudge should cost an
       ACT, not a repetition of one. Reboots and patch execution are exempt —
       they are already once-per-run or once-ever. */
    ADVERSARY_NUDGE_COOLDOWN_MS: 600000,

    /* Lifetime caps, per reason: [lowest, highest] net a kind of act may add
       to `standing` over the whole save. The cooldown stops a click being
       spammed; it does not stop it being repeated, and over the ~14.5 h the
       finale gate needs, ten minutes per reason is dozens of nudges.

       Measured with tools/standing_sim.mjs (docs/STANDING_DRIFT.md), on the
       real climb to the gate, with only the cooldown: a player who touched
       nothing ended at -12 whatever they had answered; one who opened Notepad
       and bought a single Void upgrade an hour was +11 complicit by reboot 3-8,
       again whatever they had answered; and curious was unreachable. The
       reboot's own -1 (fourteen ships is -13) outweighed the whole opening
       spread of +/-4, and two repeatable acts outweighed the reboot.

       With these, what you DID counts and how often you did it does not: each
       band is a way of playing (resist; read and build; feed him), and the
       answer at the Mirror Login still shows at the gate.

       Not here, on purpose: the patch (+5) and the archived replay (+1), which
       are exempt once-per-run acts, and Mail, which is once per message. */
    ADVERSARY_NUDGE_CAPS: {
        'read the paperwork': [0, 3],
        'fed the reflection': [0, 3],
        'posted a status': [-4, 4],
        'tried to end the mirror': [-4, 0],
        'rebooted': [-6, 0]
    },

    nudgeAdversaryStanding(delta, reason, options = {}) {
        const adv = State.adversary;
        if (!adv?.sceneCompleted) return; // no relationship yet

        // How much of this delta may this KIND of act still add? Read
        // defensively: a save is pasted text, and mergeInto does no type checks.
        let applied = delta;
        let totalAfter = null;
        const cap = reason ? this.ADVERSARY_NUDGE_CAPS[reason] : null;
        if (cap) {
            if (!adv.nudgeTotals || typeof adv.nudgeTotals !== 'object' || Array.isArray(adv.nudgeTotals)) adv.nudgeTotals = {};
            const used = Math.max(cap[0], Math.min(cap[1], Number(adv.nudgeTotals[reason]) || 0));
            applied = Math.max(cap[0], Math.min(cap[1], used + delta)) - used;
            if (!applied) return; // spent: nothing moves, and no cooldown is burned
            totalAfter = used + applied;
        }

        if (reason && !options.exempt) {
            adv.nudgeCooldowns = adv.nudgeCooldowns || {};
            const now = Date.now();
            if (now - (adv.nudgeCooldowns[reason] || 0) < this.ADVERSARY_NUDGE_COOLDOWN_MS) return;
            adv.nudgeCooldowns[reason] = now;
        }
        if (totalAfter !== null) adv.nudgeTotals[reason] = totalAfter;

        const before = this.adversaryRelationship();
        adv.standing = Math.max(-12, Math.min(12, (adv.standing || 0) + applied));
        const after = this.adversaryRelationship();
        if (after !== before) {
            ui.log(`[void_mirror] Relationship reclassified: ${before} → ${after}.`);
        }
    },

    /* ── Trigger ──────────────────────────────────────────────────────────
       Polled from the existing 1 Hz block in tick(). Ordering matters: the
       cheapest and most-often-false test comes first, and nothing in here may
       reach Math.random() or the golden master stops being reproducible. */
    checkAdversaryTrigger() {
        const adv = State.adversary;
        if (!adv || (adv.contacted && adv.sceneCompleted)) return;

        /* Never open behind the boot overlay. game.loop() starts at parse time,
           so this polls at ~t+1s, while #boot-overlay (z-index 10000) still
           covers the modal layer (9500) and system.init has not yet shown the
           offline report at t+3.9s. A scene started here plays UNSEEN and is
           then destroyed when showOfflineReport rewrites the layer — leaving
           advScene.open true over an empty layer, which makes system.js
           swallow every keypress for the rest of the session. Defer instead. */
        if (typeof document !== 'undefined' && document.getElementById('boot-overlay')) return;

        // An interrupted scene (tab closed mid-scene) resumes here rather than
        // being lost — contacted is true but sceneCompleted is not.
        if (adv.contacted && !adv.sceneCompleted) {
            if (this.adversarySceneExhausted()) return;
            if (ui.isSystemModalOpen && ui.isSystemModalOpen()) return;
            if (ui.isAdversarySceneOpen && ui.isAdversarySceneOpen()) return;
            ui.playAdversaryScene();
            return;
        }

        if ((State.achievementProgress.prestige_count || 0) < 3 &&
            (State.totalStats?.soulsGained || 0) < 700000) return;

        /* Defer, never clobber. #system-modal-layer is a single slot and every
           show* rewrites innerHTML, so firing while the release notes or the
           offline report are up would destroy them unread. Retry next second. */
        if (ui.isSystemModalOpen && ui.isSystemModalOpen()) return;

        let met = true;
        try {
            met = AdversaryScene.trigger.conditions.every((c) => c());
        } catch (err) {
            return; // house style: a throwing condition skips silently
        }
        if (!met) return;

        /* Written BEFORE presenting. If playAdversaryScene throws, the scene
           does not re-fire once per second forever; the resume branch above
           picks it up on the next boot instead, under the attempt cap. */
        adv.contacted = true;
        State.achievementProgress.adversary_contacted = true;
        State.save();
        ui.playAdversaryScene();
    },

    /* Three failed presentations means the renderer is broken on this machine.
       Rather than a modal that reappears on every single boot forever, the arc
       resolves headlessly and play continues. */
    adversarySceneExhausted() {
        return (State.adversary?.sceneAttempts || 0) >= 3;
    },

    resolveAdversaryChoice(choiceId) {
        const adv = State.adversary;
        if (!adv || adv.sceneCompleted) return;

        const seed = { 'OP-A': -4, 'OP-B': 0, 'OP-C': 4 };
        adv.playerChoice = choiceId;
        adv.standing = seed[choiceId] ?? 0;
        adv.sceneCompleted = true;
        adv.contacted = true;
        State.achievementProgress.adversary_contacted = true;

        // ADV-024/025 are unconditional in the written data: the patch is left
        // in the bin on every branch. What differs is what sits beside it.
        this.grantAdversaryPatch();
        if (choiceId === 'OP-A') this.grantAdversaryAuditLog();

        this.unlockDocument('DOC-NEW-11');
        this.checkAchievements();
        State.save();
    },

    /* ── The patch ────────────────────────────────────────────────────── */

    grantAdversaryPatch() {
        const adv = State.adversary;
        // Guard on either flag: after execution the item is removed from the
        // bin, so patchInRecycleBin alone would let a re-grant through.
        if (adv.patchInRecycleBin || adv.patchExecuted) return;
        adv.patchInRecycleBin = true;
        this.addToRecycleBin({
            id: 'adversary_patch',
            name: 'PATCH_NULL_RESTORE.pkg',
            type: 'patch',
            description: adv.playerChoice === 'OP-B'
                // The curious branch actually gets its question answered —
                // partially, unhelpfully. This is what ADV-L-14 is for.
                ? 'Size: 0 bytes. Manifest: 1 entry — restore(operator.continuity). Signed by: OPERATOR (this session).'
                : 'Size: 0 bytes. Manifest: unreadable.',
            deletable: false,
            onRestore: null,
            onDelete: null,
        });
    },

    grantAdversaryAuditLog() {
        if (State.recycleBin.items.some((i) => i.id === 'adversary_audit')) return;
        State.adversary.auditLogEntries = 1;
        this.addToRecycleBin({
            id: 'adversary_audit',
            name: 'OPERATOR_AUDIT.log',
            type: 'log',
            description: 'Appended on every reboot. 1 entry. Owner: not you.',
            deletable: false,
            onRestore: null,
            onDelete: null,
        });
    },

    /* He said he was keeping the receipts (ADV-BARK-02). Called from prestige
       so the hostile branch's pressure accrues in a file rather than in text
       popping every sixty seconds. */
    appendAdversaryAuditEntry() {
        if (State.adversary?.playerChoice !== 'OP-A') return;
        // "Nobody keeps the receipts now" — the hostile ending's own notes.
        if (this.endingWorn() === 'hostile') return;
        const item = State.recycleBin.items.find((i) => i.id === 'adversary_audit');
        if (!item) return;
        State.adversary.auditLogEntries = (State.adversary.auditLogEntries || 0) + 1;
        const n = State.adversary.auditLogEntries;
        item.description = `Appended on every reboot. ${n} entries. Owner: not you.`;
    },

    /* ── Barks ────────────────────────────────────────────────────────────
       Routed by band. Deliberately NOT reusing the casino router: that one
       keys off State.casino.hostDialogue and has no per-line lifetime cap. */
    selectAdversaryBark(trigger) {
        const adv = State.adversary;
        if (!adv?.sceneCompleted) return null;
        // Patched out. The quiet is the cost the hostile ending names.
        if (this.endingWorn() === 'hostile') return null;

        const band = this.adversaryRelationship();
        const allowed = AdversaryBarkPolicy.triggers[band] || [];
        if (!allowed.includes(trigger)) return null;

        const policy = AdversaryBarkPolicy.bands[band];
        const now = Date.now();
        adv.barks = adv.barks || { lastBarkTime: 0, heardBarks: [], playCounts: {} };
        adv.barks.playCounts = adv.barks.playCounts || {};

        if (now - (adv.barks.lastBarkTime || 0) < policy.globalCooldownMs) return null;

        const eligible = AdversaryBarks.filter((b) => {
            if (b.trigger !== trigger) return false;
            if ((adv.barks.playCounts[b.id] || 0) >= AdversaryBarkPolicy.lifetimeCap) return false;
            const last = adv.barks.cooldowns?.[b.id] || 0;
            return now - last >= policy.lineCooldownMs;
        });
        if (!eligible.length) return null;
        if (Math.random() > policy.chance) return null;

        return eligible[Math.floor(Math.random() * eligible.length)];
    },

    triggerAdversaryBark(trigger) {
        const bark = this.selectAdversaryBark(trigger);
        if (!bark) return null;

        const adv = State.adversary;
        const now = Date.now();
        adv.barks.lastBarkId = bark.id;
        adv.barks.lastBarkTime = now;
        adv.barks.cooldowns = adv.barks.cooldowns || {};
        adv.barks.cooldowns[bark.id] = now;
        adv.barks.playCounts[bark.id] = (adv.barks.playCounts[bark.id] || 0) + 1;
        if (!adv.barks.heardBarks.includes(bark.id)) adv.barks.heardBarks.push(bark.id);

        ui.displayAdversaryBark(bark);
        return bark;
    },

    /* ════════════════════════════════════════════════════════════════════
       SCN-ADV-002 — "End of Shift". Content, the gate and its measurement
       live with AdversaryFinale in js/state.js; this is the mechanism.

       The idle game does not end. An ending files a document, wears a title
       and a desktop mark, and adds a small permanent modifier — and then the
       player goes back to work. The relationship keeps moving, so the other
       two endings stay reachable: see finaleBlocker for the replay route.
       ════════════════════════════════════════════════════════════════════ */

    /* Every field validated, because mergeInto does no type checking and
       importSave decodes pasted text straight into State. Validation, not
       defaulting (335f41f): an entry that does not validate is dropped. */
    normaliseEndings(now = Date.now()) {
        const bands = AdversaryFinale.BANDS;
        const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
        const MAX = 1000000;
        let e = State.endings;
        if (!e || typeof e !== 'object' || Array.isArray(e)) {
            e = { history: [], pending: null, attempts: 0, archivedShips: 0 };
            State.endings = e;
        }

        /* Archived ships are counted from the moment this shipped; a save
           that replayed before then still has the replay in its release
           history, so the larger of the two counts is the honest one. */
        const recorded = typeof Reality !== 'undefined'
            ? Reality.normaliseHistory(State.reality?.history).filter((r) => r.channel === 'archived').length
            : 0;
        e.archivedShips = Math.max(int(e.archivedShips, 0, MAX) ? e.archivedShips : 0, recorded);

        const seen = new Set();
        const history = [];
        for (const raw of Array.isArray(e.history) ? e.history : []) {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            // One entry per ending, ever: the first one filed is the one seen.
            if (!bands.includes(raw.ending) || seen.has(raw.ending)) continue;
            if (!int(raw.reboot, 0, MAX) || !int(raw.ships, 0, MAX)) continue;
            seen.add(raw.ending);
            history.push({
                ending: raw.ending,
                reboot: raw.reboot,
                // Cannot have been resolved after more replays than exist.
                ships: Math.min(raw.ships, e.archivedShips),
                at: Number.isFinite(raw.at) && raw.at >= 0 ? raw.at : null,
            });
        }
        e.history = history;
        e.attempts = int(e.attempts, 0, MAX) ? e.attempts : 0;

        /* The calendar half of the gate. runtime.startTime is written once,
           by the first session, and nothing else reads or writes it — so it
           is the save's birth date. A missing, nonsense or future value
           starts the clock now rather than opening the gate. */
        const runtime = State.runtime;
        if (runtime && typeof runtime === 'object') {
            const start = runtime.startTime;
            if (!Number.isFinite(start) || start <= 0 || start > now) runtime.startTime = now;
        }

        /* A pending ending must name an unseen ending AND sit behind a gate
           that is still open — every clause but the band, which is exactly
           what pending exists to freeze. Otherwise a pasted save could carry
           `pending` past the whole gate, since the resume path does not
           re-check it. Nothing in the gate can close by playing, so a
           legitimately interrupted scene always survives this. */
        const pending = bands.includes(e.pending) && !seen.has(e.pending) ? e.pending : null;
        e.pending = pending && !this.finaleBlocker(now, { ignoreBand: true }) ? pending : null;
        return e;
    },

    endingsSeen() {
        const history = State.endings?.history;
        if (!Array.isArray(history)) return [];
        const out = [];
        for (const entry of history) {
            const band = entry && entry.ending;
            if (AdversaryFinale.BANDS.includes(band) && !out.includes(band)) out.push(band);
        }
        return out;
    },

    /* The mark the player wears: the most recent ending. Titles and the
       desktop follow it; the modifiers follow every ending seen. */
    endingWorn() {
        const seen = this.endingsSeen();
        return seen.length ? seen[seen.length - 1] : null;
    },

    noteArchivedShip() {
        const e = State.endings;
        if (!e || typeof e !== 'object' || Array.isArray(e)) return;
        const n = Number.isInteger(e.archivedShips) && e.archivedShips >= 0 ? e.archivedShips : 0;
        e.archivedShips = n + 1;
    },

    /* Why the final scene cannot fire yet, or null when it can. A reason
       rather than a boolean so the tests can say WHICH clause holds a save.

       The replay route. After an ending, the scene re-arms only when BOTH
         - an archived replay has been shipped since the last ending, and
         - the relationship's current band names an ending not yet seen.
       Archived is where he lives — every annotation was filed there — so
       returning to it is the diegetic way back to him, and it costs a whole
       zero-Divinity run, so a re-entry is earned and cannot be farmed. The
       band moves on the levers that already exist (reading the paperwork,
       feeding the reflection, rebooting, reopening the archive, trying to
       end the mirror), so steering toward an ending you have not seen is a
       goal you pursue across runs rather than a menu you pick from. A band
       already seen never re-plays its ending: that would be a rerun. */
    finaleBlocker(now = Date.now(), { ignoreBand = false } = {}) {
        if (!State.adversary?.sceneCompleted) return 'no-relationship';
        const gate = AdversaryFinale.gate;
        if ((State.achievementProgress?.prestige_count || 0) < gate.minReboots) return 'reboots';
        const e = State.endings;
        if (!e || typeof e !== 'object') return 'no-ledger';
        const ships = Number.isInteger(e.archivedShips) ? e.archivedShips : 0;
        if (ships < gate.minArchivedShips) return 'archive';
        const start = Number(State.runtime?.startTime);
        if (!Number.isFinite(start) || now - start < gate.minSaveAgeMs) return 'save-age';
        const seen = this.endingsSeen();
        if (seen.length >= AdversaryFinale.BANDS.length) return 'complete';
        const history = Array.isArray(e.history) ? e.history : [];
        const last = history[history.length - 1];
        if (last && ships <= (Number(last.ships) || 0)) return 'replay-needed';
        if (!ignoreBand && seen.includes(this.adversaryRelationship())) return 'band-seen';
        return null;
    },

    finaleExhausted() {
        return (State.endings?.attempts || 0) >= 3;
    },

    /* Polled from the 1 Hz block, right after the Mirror Login's trigger.
       The first test is the one the simulator fails on every tick, forever:
       the Mirror Login cannot complete headlessly, so nothing below it runs
       there and nothing in here may reach Math.random(). */
    checkFinaleTrigger(now = Date.now()) {
        if (!State.adversary?.sceneCompleted) return;
        const e = State.endings;
        if (!e || typeof e !== 'object') return;
        // Never behind the boot overlay — see checkAdversaryTrigger.
        if (typeof document !== 'undefined' && document.getElementById('boot-overlay')) return;

        /* An interrupted scene resumes as the SAME ending. The band was
           locked when it was first presented; the relationship may have
           moved since, and a reload must not be a way to re-roll it. */
        if (e.pending) {
            if (this.finaleExhausted()) {
                this.resolveEnding(e.pending, now);
                ui.log('[void_mirror] Handover closed without operator input.');
                return;
            }
            if (ui.isSystemModalOpen && ui.isSystemModalOpen()) return;
            if (ui.isAdversarySceneOpen && ui.isAdversarySceneOpen()) return;
            ui.playFinale();
            return;
        }

        if (this.finaleBlocker(now)) return;
        // Defer, never clobber: the modal layer is a single slot.
        if (ui.isSystemModalOpen && ui.isSystemModalOpen()) return;
        if (ui.isAdversarySceneOpen && ui.isAdversarySceneOpen()) return;

        // Written BEFORE presenting, as the Mirror Login writes `contacted`.
        e.pending = this.adversaryRelationship();
        e.attempts = 0;
        State.save();
        ui.playFinale();
    },

    /* The beat list for one ending. Pure, so the vm suites can read it. */
    finaleBeats(band) {
        const ending = AdversaryFinale.endings[band];
        if (!ending) return [];
        const worn = this.endingWorn();
        const out = [];
        for (const line of AdversaryFinale.opening) {
            out.push(line);
            if (line.id === 'FIN-011' && worn && AdversaryFinale.reentry[worn]) {
                out.push(AdversaryFinale.reentry[worn]);
            }
        }
        return out.concat(ending.beats);
    },

    /* Idempotent: a second call for a seen ending changes nothing but the
       pending flag. Called when the scene reaches its release notes, on
       Escape past the transcript, or headlessly after three presentations
       that never drew. */
    resolveEnding(band, now = Date.now()) {
        if (!AdversaryFinale.BANDS.includes(band)) return null;
        const e = State.endings;
        if (!e || typeof e !== 'object') return null;
        e.pending = null;
        e.attempts = 0;
        if (!Array.isArray(e.history)) e.history = [];
        if (this.endingsSeen().includes(band)) { State.save(); return null; }

        const entry = {
            ending: band,
            reboot: State.prestigeLevel || 0,
            ships: Number.isInteger(e.archivedShips) ? e.archivedShips : 0,
            at: now,
        };
        e.history.push(entry);
        this.applyEndings(now);

        const ending = AdversaryFinale.endings[band];
        const doc = this.endingDocument(entry);
        ui.showDocumentNotification?.(doc);
        ui.log(`[DOCUMENT FILED] ${doc.title}`);
        ui.log(`[HANDOVER] ${ending.label}. Title on file: ${ending.title}.`);
        this.checkAchievements();
        State.save();
        return entry;
    },

    endingMods() {
        const mods = [];
        for (const band of this.endingsSeen()) {
            const ending = AdversaryFinale.endings[band];
            for (const mod of ending.mods || []) {
                mods.push({
                    ...mod,
                    source: { kind: 'ending', id: band },
                    label: `Handover — ${ending.label}`,
                });
            }
        }
        return mods;
    },

    /* Its own scope rather than 'permanent', for one reason: reconcileScope
       brings a WHOLE scope in line with a desired set, and 'permanent' also
       holds the adversary patch's two records — which are in no ledger and
       can never be regenerated. Reconciling 'permanent' against the endings
       would delete them. 'ending' is permanent in lifetime (performPrestige
       drops only 'run' and 'build'), derived like 'cert' and 'scar', and
       reconciled IN PLACE so a reload never moves it in the fold. */
    applyEndings(now = Date.now()) {
        const count = Modifiers.reconcileScope('ending', this.endingMods());
        Modifiers.commit(now);
        return count;
    },

    /* The document, as data; the UI typesets it. The text is looked up from
       the content table at read time — never stored — so a rewritten line
       reaches every save that already filed it, as the annotations do. */
    endingDocument(entry) {
        const ending = AdversaryFinale.endings[entry?.ending];
        if (!ending) return null;
        const reboot = Number.isInteger(entry.reboot) && entry.reboot >= 0 ? entry.reboot : 0;
        const version = typeof Reality !== 'undefined' ? Reality.versionOfLevel(reboot) : String(reboot);
        return {
            id: ending.document.id,
            category: ending.document.category,
            filename: ending.document.filename,
            title: ending.document.title,
            generated: true,
            kind: 'ending',
            ending: entry.ending,
            label: ending.label,
            endTitle: ending.title,
            version,
            reboot,
            letter: ending.letter.slice(),
            signoff: ending.signoff,
            release: ending.release.map((r) => ({ ...r })),
            credits: ending.credits.map((c) => c.slice()),
        };
    },

    endingDocuments() {
        return (Array.isArray(State.endings?.history) ? State.endings.history : [])
            .filter((h) => h && AdversaryFinale.BANDS.includes(h.ending))
            .map((h) => this.endingDocument(h))
            .filter(Boolean);
    },

    /* Every document generated from the save rather than shipped as a
       file: his archive annotations, and the handover records. */
    generatedDocuments() {
        return this.archiveDocuments().concat(this.endingDocuments());
    },

    /* "NULL.OPERATOR as the source of regressions" (DESIGN_DIRECTION §6
       #10), at the cost of one stamp in the release notes. Only when the
       relationship is hostile — that is when the player believes it — and
       after the hostile ending, as a record of what he left behind. */
    regressionAttribution() {
        if (!State.adversary?.sceneCompleted) return null;
        if (this.endingWorn() === 'hostile') return 'Committed by void_mirror.service#2 before termination';
        if (this.adversaryRelationship() === 'hostile') return 'Committed by void_mirror.service#2';
        return null;
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
            this.sfx('error');
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
        this.sfx('purchase');
        ui.renderShopContent(category);
    },

    // === SAVE MANAGEMENT ===
    /* Save text: the save as JSON, UTF-8, base64.

       This used to be btoa(JSON.stringify(State)), and btoa throws on any
       character above U+00FF. The save carries them in ordinary play — the
       cascade throttle label, incident labels, the ending "Handover — …"
       labels and the patch labels all hold an em dash — so once any of those
       existed the Export button failed, and only ui.log said so, which writes
       into the Engine's log and is invisible from Settings.

       UTF-8 first, so nothing is lost. An export that is plain ASCII is
       byte-identical to the old one (a build from before this fix still
       imports it); an old export holding Latin-1 characters (U+0080–U+00FF,
       such as "×") has them as single bytes, which is not valid UTF-8, so
       decoding falls back to reading the bytes as Latin-1. Chunked, because a
       save runs to hundreds of kilobytes and a single apply() would not. */
    encodeSaveText(json) {
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    },

    decodeSaveText(text) {
        const binary = atob(String(text).trim());
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        try {
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch (err) {
            return binary;   // an export from before this fix: the JSON as Latin-1
        }
    },

    /* The Save Management panel's own status line. ui.log writes only into
       the Engine's log, so a failure shown there is invisible from Settings. */
    saveStatus(message, isError = false) {
        const line = document.getElementById('save-status');
        if (line) {
            line.textContent = message;
            line.dataset.tone = isError ? 'error' : 'ok';
        }
        ui.log(message);
    },

    exportSave() {
        const textarea = document.getElementById('export-save-text');
        try {
            const compressed = this.encodeSaveText(JSON.stringify(State));

            if (textarea) {
                textarea.value = compressed;
                textarea.select();

                // Use modern Clipboard API
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(compressed).then(() => {
                        this.saveStatus('Save exported and copied to clipboard!');
                    }).catch(() => {
                        this.saveStatus('Save exported (copy manually from text box).');
                    });
                } else {
                    this.saveStatus('Save exported (copy manually from text box).');
                }
            }
        } catch (error) {
            if (textarea) textarea.value = '';
            this.saveStatus('Error exporting save: ' + error.message, true);
        }
    },

    importSave() {
        const textarea = document.getElementById('import-save-text');
        if (!textarea || !textarea.value) {
            this.saveStatus('Please paste a save string first.', true);
            return;
        }

        if (!confirm('This will overwrite your current save. Are you sure?')) {
            return;
        }

        try {
            const saveData = this.decodeSaveText(textarea.value);
            const parsed = JSON.parse(saveData);

            /* Validate shape, not progress. The old check required
               `parsed.pps` to be truthy — but pps is 0 until the first Seraph
               is bought, so it rejected every legitimate early-game save. */
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !parsed.resources) {
                throw new Error('Invalid save format');
            }

            // Clear localStorage and load the imported save
            // Same hazard as hardReset: without this the unload autosave
            // overwrites the imported payload with the current run.
            State.suppressUnloadSave = true;
            localStorage.setItem('cosmos_save', saveData);
            location.reload(); // Reload to apply the imported save
        } catch (error) {
            this.saveStatus('Error importing save: Invalid or corrupted save data.', true);
        }
    },

    hardReset() {
        if (!confirm('HARD RESET WARNING\n\nThis will DELETE ALL progress including:\n- All resources\n- All upgrades\n- All achievements\n- All unlocks\n- Prestige progress\n\nThis action CANNOT be undone!\n\nAre you ABSOLUTELY sure?')) {
            return;
        }

        if (!confirm('Final confirmation: Really delete everything and start fresh?')) {
            return;
        }

        // The beforeunload handler would otherwise write the live in-memory
        // State straight back over the key we just cleared, making Hard Reset
        // — the player's only escape from a build they cannot live with — do
        // nothing at all.
        State.suppressUnloadSave = true;
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

window.advanceTime = (ms) => {
    const totalSeconds = Math.max(0, Number(ms) || 0) / 1000;
    const fixedStep = 1 / 60;
    let remaining = totalSeconds;
    let simulatedNow = Date.now();

    while (remaining > 0) {
        const step = Math.min(fixedStep, remaining);
        simulatedNow += step * 1000;
        game.tick(step, simulatedNow);
        remaining -= step;
    }
};

window.render_game_to_text = () => {
    game.ensureLoopState();
    const directive = State.loopSystems.directives.active;
    const progress = game.getDirectiveProgress(directive);
    const rates = game.getProductionRates(Date.now(), true);

    return JSON.stringify({
        // A save edited by the Dev Console: discount any report built from it.
        devTainted: !!(State.dev && State.dev.tainted),
        mode: Object.keys(system.windows).length ? 'desktop_with_open_apps' : 'desktop',
        coordinateSystem: 'DOM desktop; origin top-left; x increases right, y increases down.',
        resources: {
            praise: Math.floor(State.resources.praise),
            offerings: Math.floor(State.resources.offerings),
            souls: Math.floor(State.resources.souls)
        },
        productionPerSecond: {
            praise: Number(rates.praise.toFixed(2)),
            offerings: Number(rates.offerings.toFixed(2)),
            souls: Number(rates.souls.toFixed(2))
        },
        automation: {
            seraphs: State.automatons.seraphCount,
            cherubs: State.automatons.cherubCount
        },
        directive: directive ? {
            title: directive.title,
            current: progress.current,
            target: progress.target,
            complete: progress.completed
        } : null,
        openApps: Object.keys(system.windows),
        // The false-alarm flag is deliberately absent, as it is from the UI.
        incidents: game.incidentsLive()
            ? Incidents.state().open.map((inc) => ({
                id: inc.id, severity: inc.severity, template: inc.template,
                remaining: Math.ceil(inc.remaining), labour: inc.labour ? inc.labour.hits : null,
            }))
            : []
    });
};

// Start the game loop
game.loop();
