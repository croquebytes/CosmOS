const ui = {
    // Store previous values for animation
    previousValues: {
        praise: 0,
        offerings: 0,
        souls: 0
    },

    // Particle pool for click effects
    clickParticles: [],
    maxParticles: 50,
    coreImpact: 0,

    // Number formatting with notation support
    formatNumber(value, decimals = 0) {
        const mode = State.settings?.notationMode || 'suffix';

        if (mode === 'scientific') {
            if (value >= 1e6) {
                return value.toExponential(2);
            }
            return value.toFixed(decimals);
        }

        // Suffix mode (default)
        const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
        let tier = 0;
        let scaledValue = value;

        while (scaledValue >= 1000 && tier < suffixes.length - 1) {
            scaledValue /= 1000;
            tier++;
        }

        if (tier === 0) {
            return scaledValue.toFixed(decimals);
        }

        return scaledValue.toFixed(decimals === 0 ? 1 : decimals) + suffixes[tier];
    },

    update() {
        this.syncResources();
        this.animateCore();
        this.animateVoidCore();
        this.applyDesktopPlate();
        this.updateSeraphButton();
        this.updateCherubButton();
        this.updateSkillButtons();
        this.updateLoopPanels();
        this.updateDimensionDisplay();
        this.updateOperatorStatus();
    },

    /* The desktop reflects the state of the universe you are maintaining:
       the primordial grid while Sector 7G is broken, the breach once you are
       working the Void, and a whole cosmos again after a reboot. Runs on the
       tick, so it only touches the DOM when the plate actually changes. */
    desktopPlates: { primordial: 'primordial', void: 'void', restored: 'restored' },

    applyDesktopPlate() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;

        let plate = this.desktopPlates[State.currentDimension] || 'primordial';
        if (State.currentDimension !== 'void' && State.prestigeLevel > 0) {
            plate = 'restored';
        }

        if (this.activeDesktopPlate === plate) return;
        this.activeDesktopPlate = plate;
        desktop.style.backgroundImage = `url('assets/backgrounds/desktop_${plate}.webp')`;
    },

    getNextMilestone() {
        const progressDetail = (current, target, resource) => current >= target
            ? `READY — ${this.formatNumber(target)} ${resource}`
            : `${this.formatNumber(current)} / ${this.formatNumber(target)} ${resource}`;

        if (State.automatons.seraphCount === 0) {
            return {
                label: 'Commission first Seraph',
                detail: progressDetail(State.resources.praise, 10, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 10)
            };
        }
        if (!State.upgrades.praise_multi_1) {
            return {
                label: 'Install Divine Words (+100% output)',
                detail: progressDetail(State.resources.praise, 50, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 50)
            };
        }
        if (!State.upgrades.storage_praise_1) {
            return {
                label: 'Expand Praise storage',
                detail: progressDetail(State.resources.praise, 500, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 500)
            };
        }
        if (!State.unlockedOfferings) {
            return {
                label: 'Unlock Ritualistic Procedures',
                detail: progressDetail(State.resources.praise, 2000, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 2000)
            };
        }
        if (!State.dimensions.void.unlocked) {
            return {
                label: 'Breach the Veil',
                detail: progressDetail(State.resources.souls, 200, 'Souls'),
                ratio: Math.min(1, State.resources.souls / 200)
            };
        }
        return {
            label: 'Stabilize parallel dimensions',
            detail: 'Follow the active Divine Directive',
            ratio: 0
        };
    },

    updateOperatorStatus() {
        const now = Date.now();
        if (this.lastOperatorStatusUpdate && now - this.lastOperatorStatusUpdate < 100) return;
        this.lastOperatorStatusUpdate = now;

        const objectiveEl = document.getElementById('operator-objective');
        if (!objectiveEl) return;

        const directive = State.loopSystems?.directives?.active;
        const progress = directive && typeof game !== 'undefined'
            ? game.getDirectiveProgress(directive)
            : { current: 0, target: 1, ratio: 0, completed: false };
        const fillEl = document.getElementById('operator-progress-fill');
        const progressEl = document.getElementById('operator-progress-text');
        const milestoneEl = document.getElementById('operator-next-milestone');
        const sectorEl = document.getElementById('operator-sector-status');

        objectiveEl.innerText = directive?.title || 'Awaiting divine telemetry…';
        objectiveEl.classList.toggle('complete', !!progress.completed);
        if (fillEl) fillEl.style.width = `${Math.round((progress.ratio || 0) * 100)}%`;
        if (progressEl) {
            progressEl.innerText = progress.completed
                ? `${this.formatNumber(progress.current)} / ${this.formatNumber(progress.target)} — REWARD READY`
                : `${this.formatNumber(progress.current)} / ${this.formatNumber(progress.target)}`;
        }

        const milestone = this.getNextMilestone();
        if (milestoneEl) {
            milestoneEl.innerHTML = `<strong>${milestone.label}</strong><span>${milestone.detail}</span>`;
        }
        if (sectorEl) {
            sectorEl.innerText = State.dimensions.void.unlocked ? 'SECTOR 7G: CONTAINED' : 'SECTOR 7G: UNSTABLE';
        }
    },

    showOperatorBriefing(force = false) {
        if (!force && State.settings.briefingSeen) return;
        system.toggleStartMenu(false);

        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;

        layer.innerHTML = `
            <section class="system-dialog operator-briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
                <div class="system-dialog-titlebar">
                    <span>CMS INTRANET // SHIFT ASSIGNMENT</span>
                    <button type="button" onclick="ui.dismissSystemModal(true)" aria-label="Close briefing">X</button>
                </div>
                <div class="briefing-hero">
                    <div class="briefing-seal">7G</div>
                    <div>
                        <div class="briefing-eyebrow">WELCOME, SUCCESSOR</div>
                        <h1 id="briefing-title">Reality failed its overnight integrity check.</h1>
                        <p>The previous Operator left no forwarding address. Until HR resolves the matter, the universe is your maintenance ticket.</p>
                    </div>
                </div>
                <div class="briefing-order">
                    <span>WORK ORDER 0001</span>
                    <strong>Restore autonomous Praise generation.</strong>
                    <ol>
                        <li>Perform 10 Miracles to calibrate the interface.</li>
                        <li>Spend 10 Praise to commission your first Seraph.</li>
                        <li>Let automation run. Intervene when it is interesting.</li>
                    </ol>
                </div>
                <div class="briefing-controls">
                    <span><kbd>Space</kbd> Miracle</span>
                    <span><kbd>C</kbd> Engine</span>
                    <span><kbd>Esc</kbd> Close window</span>
                    <span><kbd>F</kbd> Fullscreen</span>
                </div>
                <div class="system-dialog-actions">
                    <button class="dialog-secondary" type="button" onclick="ui.dismissSystemModal(true)">Acknowledge</button>
                    <button class="dialog-primary" type="button" onclick="ui.beginOperatorShift()">Begin repairs</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
    },

    beginOperatorShift() {
        State.settings.briefingSeen = true;
        State.save();
        this.dismissSystemModal();
        system.openApp('console');
        this.log('[SHIFT 0001] Miracle interface calibration authorized.');
    },

    dismissSystemModal(markBriefingSeen = false) {
        const layer = document.getElementById('system-modal-layer');
        if (markBriefingSeen) {
            State.settings.briefingSeen = true;
            State.save();
        }
        if (layer) {
            layer.classList.remove('active');
            layer.innerHTML = '';
        }
    },

    showOfflineReport(report) {
        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;

        const gained = Object.entries(report.gained)
            .filter(([, value]) => value >= 0.01)
            .map(([resource, value]) => `<li><span>${resource}</span><strong>+${this.formatNumber(value, 1)}</strong></li>`)
            .join('');
        const elapsedMinutes = Math.floor(report.elapsedSeconds / 60);
        const simulatedHours = (report.simulatedSeconds / 3600).toFixed(1);
        const efficiencyPct = Math.round((report.efficiency ?? 1) * 100);

        // Storage overflow is the actionable number: it is the difference
        // between how long you were away and how long you were productive.
        const spilled = Object.entries(report.overflow || {})
            .filter(([, value]) => value >= 1)
            .map(([resource, value]) => `${this.formatNumber(value, 1)} ${resource}`);
        const overflowNotice = spilled.length
            ? `<p class="offline-overflow">Storage overflowed and discarded <strong>${spilled.join(', ')}</strong>. Expand your vaults under Standing Requisitions before the next shift.</p>`
            : '';

        layer.innerHTML = `
            <section class="system-dialog offline-report" role="dialog" aria-modal="true" aria-labelledby="offline-title">
                <div class="system-dialog-titlebar">
                    <span>BACKGROUND PROCESS REPORT</span>
                    <button type="button" onclick="ui.closeOfflineReport()" aria-label="Close report">X</button>
                </div>
                <div class="offline-report-body">
                    <div class="offline-report-icon">☼</div>
                    <div>
                        <div class="briefing-eyebrow">AUTOMATION CONTINUED</div>
                        <h2 id="offline-title">The universe kept running.</h2>
                        <p>Your processes operated for ${this.formatNumber(elapsedMinutes)} minutes while the console was closed, at ${efficiencyPct}% of attended output.${report.capped ? ` Accrual was capped at ${simulatedHours} hours — the Providence Capacitor extends that window.` : ''}</p>
                        ${overflowNotice}
                    </div>
                </div>
                <ul class="offline-gains">${gained || '<li><span>No active production</span><strong>—</strong></li>'}</ul>
                <div class="system-dialog-actions">
                    <button class="dialog-primary" type="button" onclick="ui.closeOfflineReport()">Resume shift</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
    },

    closeOfflineReport() {
        this.dismissSystemModal();
        if (!State.settings.briefingSeen && State.totalClicks === 0) {
            this.showOperatorBriefing();
        }
    },

    syncResources() {
        const p = document.getElementById('val-praise');
        const o = document.getElementById('val-offerings');
        const s = document.getElementById('val-souls');
        const u = document.getElementById('val-uptime');
        const pRate = document.getElementById('val-praise-rate');
        const sRate = document.getElementById('val-soul-rate');

        if (p) {
            const current = Math.floor(State.resources.praise);
            const cap = State.resourceCaps.praise;
            const previous = this.previousValues.praise;

            // Animate number change if significant
            if (current !== previous && Math.abs(current - previous) > 10) {
                this.animateNumberChange(p, previous, current);
            } else {
                p.innerText = `${this.formatNumber(current)} / ${this.formatNumber(cap)}`;
            }

            // Add warning styling if near cap
            const parent = p.closest('.stat-box');
            if (parent) {
                if (current >= cap * 0.9) {
                    parent.classList.add('near-cap');
                } else {
                    parent.classList.remove('near-cap');
                }
            }

            this.previousValues.praise = current;
        }
        if (o) {
            const current = Math.floor(State.resources.offerings);
            const cap = State.resourceCaps.offerings;
            o.innerText = `${this.formatNumber(current)} / ${this.formatNumber(cap)}`;

            // Add warning styling if near cap
            const parent = o.closest('.stat-box');
            if (parent) {
                if (current >= cap * 0.9) {
                    parent.classList.add('near-cap');
                } else {
                    parent.classList.remove('near-cap');
                }
            }

            this.previousValues.offerings = current;
        }
        if (s) {
            const current = Math.floor(State.resources.souls);
            const cap = State.resourceCaps.souls;
            s.innerText = `${this.formatNumber(current)} / ${this.formatNumber(cap)}`;

            // Add warning styling if near cap
            const parent = s.closest('.stat-box');
            if (parent) {
                if (current >= cap * 0.9) {
                    parent.classList.add('near-cap');
                } else {
                    parent.classList.remove('near-cap');
                }
            }

            this.previousValues.souls = current;
        }
        if (u) {
            u.innerText = this.formatNumber(Math.floor((Date.now() - State.startTime) / 1000)) + "s";
        }
        if (pRate) {
            const now = Date.now();
            const baseProduction = State.automatons.seraphProduction || 1;
            const loops = State.loopSystems || {};
            const streakBonus = 1 + Math.min(0.35, (loops.miracleStreak || 0) * 0.007);
            const overclockBonus = (loops.overclock?.active && now < loops.overclock?.endsAt) ? 1.5 : 1;
            const interventionBonus = (State.skills?.divineIntervention?.active && now < State.skills.divineIntervention.endsAt) ? 2 : 1;
            const achievementBonuses = State.achievementBonuses || {};
            const totalBonus = interventionBonus * streakBonus * overclockBonus * (achievementBonuses.automationSpeed || 1);
            const praisePerSec = State.pps * baseProduction * State.praiseMultiplier * totalBonus *
                (achievementBonuses.praiseGain || 1) * (achievementBonuses.globalGain || 1);
            pRate.innerText = this.formatNumber(praisePerSec, 1);
        }
        if (sRate) {
            const now = Date.now();
            const baseProduction = State.automatons.cherubProduction || 1;
            const loops = State.loopSystems || {};
            const streakBonus = 1 + Math.min(0.35, (loops.miracleStreak || 0) * 0.007);
            const overclockBonus = (loops.overclock?.active && now < loops.overclock?.endsAt) ? 1.5 : 1;
            const interventionBonus = (State.skills?.divineIntervention?.active && now < State.skills.divineIntervention.endsAt) ? 2 : 1;
            const achievementBonuses = State.achievementBonuses || {};
            const totalBonus = interventionBonus * streakBonus * overclockBonus * (achievementBonuses.automationSpeed || 1);
            const soulPerSec = State.sps * baseProduction * State.soulMultiplier * totalBonus *
                (achievementBonuses.soulGain || 1) * (achievementBonuses.globalGain || 1);
            sRate.innerText = this.formatNumber(soulPerSec, 1);
        }
    },

    updateLoopPanels() {
        const loops = State.loopSystems;
        if (!loops) return;

        const now = Date.now();
        const streakCount = loops.miracleStreak || 0;
        const streakMultiplier = 1 + Math.min(1.5, streakCount * 0.04);

        const streakCountEl = document.getElementById('loop-streak-count');
        const streakMultiEl = document.getElementById('loop-streak-multi');
        const streakBestEl = document.getElementById('loop-best-streak');
        const streakFillEl = document.getElementById('loop-streak-fill');

        if (streakCountEl) streakCountEl.innerText = this.formatNumber(streakCount);
        if (streakMultiEl) streakMultiEl.innerText = `${streakMultiplier.toFixed(2)}×`;
        if (streakBestEl) streakBestEl.innerText = this.formatNumber(loops.bestMiracleStreak || 0);
        if (streakFillEl) streakFillEl.style.width = `${Math.min(100, streakCount * 2.5)}%`;

        const overclock = loops.overclock || {};
        const overclockCharge = overclock.charge || 0;
        const overclockActive = !!overclock.active && now < (overclock.endsAt || 0);
        const overclockRemaining = overclockActive ? Math.max(0, Math.ceil((overclock.endsAt - now) / 1000)) : 0;

        const overclockStatusEl = document.getElementById('loop-overclock-status');
        const overclockFillEl = document.getElementById('loop-overclock-fill');
        const overclockBtn = document.getElementById('btn-overclock');

        if (overclockStatusEl) {
            if (overclockActive) {
                overclockStatusEl.innerText = `Active (${overclockRemaining}s)`;
            } else if (overclockCharge >= 100) {
                overclockStatusEl.innerText = 'Ready to Trigger';
            } else {
                overclockStatusEl.innerText = `Charging ${Math.floor(overclockCharge)}%`;
            }
        }

        if (overclockFillEl) {
            const fillValue = overclockActive ? 100 : overclockCharge;
            overclockFillEl.style.width = `${Math.max(0, Math.min(100, fillValue))}%`;
        }

        if (overclockBtn) {
            if (overclockActive) {
                overclockBtn.innerText = `Overclock Active (${overclockRemaining}s)`;
                overclockBtn.disabled = true;
            } else if (overclockCharge >= 100) {
                overclockBtn.innerText = 'Trigger Overclock';
                overclockBtn.disabled = false;
            } else {
                overclockBtn.innerText = `Trigger Overclock (${Math.floor(overclockCharge)}%)`;
                overclockBtn.disabled = true;
            }
        }

        const directive = loops.directives?.active;
        const directiveTitleEl = document.getElementById('directive-title');
        const directiveProgressTextEl = document.getElementById('directive-progress-text');
        const directiveFillEl = document.getElementById('directive-progress-fill');
        const directiveRewardEl = document.getElementById('directive-reward');
        const directiveCompletedEl = document.getElementById('directive-completed-count');
        const claimBtn = document.getElementById('btn-claim-directive');
        const rerollBtn = document.getElementById('btn-reroll-directive');

        if (directiveCompletedEl) {
            directiveCompletedEl.innerText = this.formatNumber(loops.directives?.completed || 0);
        }

        if (!directive) {
            if (directiveTitleEl) directiveTitleEl.innerText = 'Calibrating directive feed...';
            if (directiveProgressTextEl) directiveProgressTextEl.innerText = '0 / 0';
            if (directiveFillEl) directiveFillEl.style.width = '0%';
            if (directiveRewardEl) directiveRewardEl.innerText = 'Reward: --';
            if (claimBtn) claimBtn.disabled = true;
            if (rerollBtn) rerollBtn.disabled = true;
        } else {
            const progress = (typeof game !== 'undefined' && typeof game.getDirectiveProgress === 'function')
                ? game.getDirectiveProgress(directive)
                : { current: 0, target: directive.target || 1, ratio: 0, completed: !!directive.completed };

            if (directiveTitleEl) directiveTitleEl.innerText = directive.title || 'Directive';
            if (directiveProgressTextEl) {
                directiveProgressTextEl.innerText = `${this.formatNumber(progress.current)} / ${this.formatNumber(progress.target)}`;
            }
            if (directiveFillEl) {
                directiveFillEl.style.width = `${Math.max(0, Math.min(100, (progress.ratio || 0) * 100))}%`;
            }
            if (directiveRewardEl) {
                directiveRewardEl.innerText = (typeof game !== 'undefined' && typeof game.getDirectiveRewardText === 'function')
                    ? game.getDirectiveRewardText(directive)
                    : 'Reward: --';
            }

            if (claimBtn) claimBtn.disabled = !progress.completed;
            if (rerollBtn) rerollBtn.disabled = overclockCharge < 10 || progress.completed;
        }

        const chainEl = document.getElementById('loop-event-chain');
        const bestChainEl = document.getElementById('loop-best-event-chain');
        if (chainEl) chainEl.innerText = this.formatNumber(loops.divineEventChain || 0);
        if (bestChainEl) bestChainEl.innerText = this.formatNumber(loops.bestDivineEventChain || 0);
    },

    animateNumberChange(element, from, to) {
        // Quick count-up animation
        const duration = 300; // ms
        const steps = 10;
        const stepValue = (to - from) / steps;
        let current = from;
        let step = 0;

        // Determine which resource we're animating to show cap
        let cap = null;
        if (element.id === 'val-praise') {
            cap = State.resourceCaps.praise;
        } else if (element.id === 'val-offerings') {
            cap = State.resourceCaps.offerings;
        } else if (element.id === 'val-souls') {
            cap = State.resourceCaps.souls;
        }

        const interval = setInterval(() => {
            step++;
            current += stepValue;

            if (step >= steps) {
                const final = cap ? `${this.formatNumber(Math.floor(to))} / ${this.formatNumber(cap)}` : this.formatNumber(Math.floor(to));
                element.innerText = final;
                clearInterval(interval);
            } else {
                const display = cap ? `${this.formatNumber(Math.floor(current))} / ${this.formatNumber(cap)}` : this.formatNumber(Math.floor(current));
                element.innerText = display;
            }
        }, duration / steps);

        // Add pulse effect
        element.classList.add('value-pulse');
        setTimeout(() => element.classList.remove('value-pulse'), 300);
    },

    showFloatingNumber(text, x, y, color = '#ffd700') {
        const floater = document.createElement('div');
        floater.className = 'floating-number';
        floater.innerText = text;
        floater.style.left = x + 'px';
        floater.style.top = y + 'px';
        floater.style.color = color;

        document.body.appendChild(floater);

        // Remove after animation completes
        setTimeout(() => floater.remove(), 1000);
    },

    screenPulse(color = 'rgba(255, 215, 0, 0.2)') {
        const pulse = document.createElement('div');
        pulse.className = 'screen-pulse';
        pulse.style.background = color;
        document.body.appendChild(pulse);

        setTimeout(() => pulse.remove(), 500);
    },

    spawnParticles(x, y, count = 5, color = '#ffd700') {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.background = color;

            // Random velocity
            const angle = (Math.PI * 2 * i) / count;
            const velocity = 50 + Math.random() * 50;
            particle.style.setProperty('--vx', Math.cos(angle) * velocity + 'px');
            particle.style.setProperty('--vy', Math.sin(angle) * velocity + 'px');

            document.body.appendChild(particle);

            setTimeout(() => particle.remove(), 800);
        }
    },

    showAchievementToast(achievement) {
        const toast = document.createElement('div');
        toast.className = `achievement-toast tier-${achievement.tier?.toLowerCase() || 'bronze'}`;

        // Get tier icon
        const tierIcon = this.tierMark(achievement.tier);

        toast.innerHTML = `
            <div class="achievement-icon">${tierIcon}</div>
            <div class="achievement-content">
                <div class="achievement-title">Achievement Unlocked!</div>
                <div class="achievement-name">${achievement.name}</div>
                ${achievement.tier ? `<div class="achievement-tier">${achievement.tier}</div>` : ''}
                <div class="achievement-desc">${achievement.flavor || achievement.description || ''}</div>
            </div>
        `;

        document.body.appendChild(toast);
        this.repositionAchievementToasts();

        // Slide in from right
        setTimeout(() => toast.classList.add('show'), 10);

        // Slide out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
                this.repositionAchievementToasts();
            }, 500);
        }, 6000);

        // Screen pulse with tier-based color
        const tierColors = {
            'Bronze': 'rgba(205, 127, 50, 0.2)',
            'Silver': 'rgba(192, 192, 192, 0.2)',
            'Gold': 'rgba(255, 215, 0, 0.2)',
            'Platinum': 'rgba(229, 228, 226, 0.3)',
            'Secret': 'rgba(138, 43, 226, 0.2)'
        };
        this.screenPulse(tierColors[achievement.tier] || 'rgba(255, 215, 0, 0.15)');
    },

    /* ── Glyph helpers ────────────────────────────────────────────────
       Nothing in the UI renders an emoji: the host emoji font has no
       relationship to the art direction and varies per platform. Ranks are
       struck medallions, everything else is a CMS filing code. */
    tierRanks: { Bronze: 'IV', Silver: 'III', Gold: 'II', Platinum: 'I', Secret: '?' },

    tierMark(tier, locked = false) {
        const rank = this.tierRanks[tier] || 'IV';
        const cls = locked ? 'tier-mark is-locked' : `tier-mark tier-${String(tier || 'Bronze').toLowerCase()}`;
        return `<span class="${cls}" title="${locked ? 'Sealed' : tier}">${locked ? '\u2014' : rank}</span>`;
    },

    docCodes: {
        HR: 'HR', Legal: 'LEG', Logs: 'LOG', Incident: 'INC', Training: 'TRN',
        Memo: 'MEM', Ad: 'ADV', Archive: 'ARC', Casino: 'CAS', System: 'SYS', Inbox: 'INB'
    },

    binCodes: {
        patch: 'PCH', achievement: 'ACH', resource: 'RES',
        automaton: 'AUT', document: 'DOC', other: 'MSC'
    },

    codeStamp(code, alarm = false) {
        return `<span class="code-stamp${alarm ? ' is-alarm' : ''}">${code}</span>`;
    },

    repositionAchievementToasts() {
        document.querySelectorAll('.achievement-toast').forEach((toast, index) => {
            toast.style.bottom = `${50 + (index * 112)}px`;
        });
    },

    /* ── Authored engine art ──────────────────────────────────────────────
       The core is painted, not drawn. Every VFX plate was rendered on pure
       black, so compositing them with 'lighter' makes the black contribute
       nothing and the glow simply add — no alpha keying, no matte fringe.
       The core sprite itself carries real alpha and draws normally. */
    coreArt: null,

    loadCoreArt() {
        if (this.coreArt) return this.coreArt;
        const plate = (src) => {
            const img = new Image();
            img.src = src;
            return img;
        };
        this.coreArt = {
            states: {
                idle: plate('assets/core/core_idle_256.png'),
                charging: plate('assets/core/core_charging_256.png'),
                overclocked: plate('assets/core/core_overclocked_256.png'),
                void: plate('assets/core/core_void_256.png')
            },
            sigil: plate('assets/vfx/sigil_256.png'),
            halo: plate('assets/vfx/halo_256.png'),
            flare: plate('assets/vfx/flare_256.png'),
            motes: plate('assets/vfx/motes_256.png')
        };
        return this.coreArt;
    },

    /* ── Core render views ────────────────────────────────────────────────
       Both the Universal Engine and the Void's reactor draw the same authored
       machine through one renderer. Each canvas owns its own pulse, impact and
       burst queue, so a Miracle in the Engine never lights up the Void's
       reactor and the two can be on screen at once without interfering. */
    coreViews: {},

    coreLogicalSize: 280,

    acquireCoreView(canvasId, logicalSize) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        // Assigning width/height also clears the context transform, so the DPR
        // scale is reapplied here rather than once at init.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(logicalSize * dpr);
        canvas.height = Math.round(logicalSize * dpr);

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const view = this.coreViews[canvasId] || { pulse: 0, impact: 0, bursts: [] };
        view.ctx = ctx;
        view.canvas = canvas;
        view.size = logicalSize;
        this.coreViews[canvasId] = view;
        return view;
    },

    getCoreView(canvasId) {
        const view = this.coreViews[canvasId];
        // A view whose canvas was torn out by a panel re-render is dead weight.
        if (!view || !view.canvas?.isConnected) return null;
        return view;
    },

    initCoreCanvas() {
        const view = this.acquireCoreView('core-canvas', this.coreLogicalSize);
        if (!view) {
            console.warn("Core canvas not found during init.");
            return;
        }

        view.pulse = 0;
        view.impact = 0;
        view.bursts = [];
        this.loadCoreArt();
        this.bindCoreClick(view.canvas, () => game.manualPraise(null));

        console.log("Core canvas initialized successfully.");
    },

    /* The Void reactor. Same machine, same renderer, its own state. */
    initVoidCanvas() {
        const view = this.acquireCoreView('void-core-canvas', this.voidLogicalSize);
        if (!view) return;

        view.pulse = 0;
        view.impact = 0;
        view.bursts = [];
        this.loadCoreArt();
        this.bindCoreClick(view.canvas, () => game.manualVoidClick(null));
    },

    voidLogicalSize: 200,

    /* The instrument is the ritual object — striking it is the action. */
    bindCoreClick(canvas, handler) {
        if (!canvas) return;
        canvas.style.cursor = 'pointer';
        if (canvas.dataset.coreClickBound) return;
        canvas.addEventListener('click', handler);
        canvas.dataset.coreClickBound = 'true';
    },

    // Kept for callers that still resize the main canvas directly.
    resizeCoreCanvas(canvas) {
        if (!canvas) return;
        this.acquireCoreView(canvas.id || 'core-canvas', this.coreLogicalSize);
    },

    /* Which plate the machine is currently wearing. */
    coreStateKey() {
        if ((State.currentDimension || 'primordial') === 'void') return 'void';
        if (State.loopSystems?.overclock?.active) return 'overclocked';
        return State.pps > 0 ? 'charging' : 'idle';
    },

    triggerCoreReaction(intensity = 1, canvasId = 'core-canvas') {
        const view = this.getCoreView(canvasId);
        const well = view?.canvas?.closest('.visual-core');
        if (!view || !well) return;

        // Bigger miracles read as bigger strikes, but on a log curve so a
        // late-game click does not white out the whole viewport.
        const magnitude = Math.min(1, Math.log10(Math.max(1, intensity)) / 5);
        view.impact = Math.min(1.35, 0.85 + magnitude * 0.45);

        if (!State.settings?.performanceMode) {
            view.bursts.push({ life: 1, magnitude, spin: Math.random() * Math.PI * 2 });
            if (view.bursts.length > 3) view.bursts.shift();
        }

        well.classList.remove('is-reacting');
        // Restart the short CSS impact even on rapid clicks.
        void well.offsetWidth;
        well.classList.add('is-reacting');
        clearTimeout(view.reactionTimer);
        view.reactionTimer = setTimeout(() => well.classList.remove('is-reacting'), 420);
    },

    triggerVoidCoreReaction(intensity = 1) {
        this.triggerCoreReaction(intensity, 'void-core-canvas');
    },

    animateCore() {
        const view = this.getCoreView('core-canvas');
        if (!view) return;

        const isVoid = (State.currentDimension || 'primordial') === 'void';
        this.renderCoreView(view, {
            stateKey: this.coreStateKey(),
            production: isVoid ? State.dimensions.void.dps : State.pps,
            tint: isVoid ? '150, 88, 224' : '196, 156, 82',
            impactGlow: isVoid ? 'rgba(206, 128, 255, 0.85)' : 'rgba(255, 228, 158, 0.85)'
        });
    },

    /* Driven from ui.update() alongside the main core. The previous version
       ran its own requestAnimationFrame loop that was never cancelled, so
       every re-render of the Void panel started another one and the orphans
       kept drawing to detached canvases for the rest of the session. */
    animateVoidCore() {
        const view = this.getCoreView('void-core-canvas');
        if (!view) return;

        this.renderCoreView(view, {
            stateKey: 'void',
            production: State.dimensions.void?.dps || 0,
            tint: '150, 88, 224',
            impactGlow: 'rgba(206, 128, 255, 0.85)'
        });
    },

    renderCoreView(view, options) {
        const ctx = view.ctx;
        if (!ctx) return;

        const art = this.coreArt;
        const width = view.size;
        const height = view.size;
        const cx = width / 2;
        const cy = height / 2;
        // The instrument is sized off the short edge so a wide console well
        // stretches the field, never the machine.
        const size = Math.min(width, height);

        const energy = Math.min(1, Math.log10(Math.max(1, (options.production || 0) + 1)) / 6);
        const spare = !!State.settings?.performanceMode;

        // Production raises the tempo without allowing runaway animation speeds.
        view.pulse += 0.03 + energy * 0.06;
        const impact = view.impact || 0;

        ctx.clearRect(0, 0, width, height);

        // Halation from the machine, added over the CSS recess rather than
        // painted onto an opaque field — that is what kills the panel seam.
        const tint = options.tint;
        const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, size * 0.52);
        glow.addColorStop(0, `rgba(${tint}, ${0.3 + energy * 0.2 + impact * 0.22})`);
        glow.addColorStop(0.45, `rgba(${tint}, ${0.08 + energy * 0.07})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();

        if (!spare) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 26; i++) {
                const x = (i * 47 + 17) % width;
                const y = (i * 83 + 31) % height;
                const shimmer = 0.16 + (Math.sin(view.pulse * 0.7 + i) + 1) * 0.1;
                ctx.fillStyle = `rgba(200, 225, 255, ${shimmer})`;
                ctx.fillRect(x, y, i % 5 === 0 ? 1.5 : 1, i % 5 === 0 ? 1.5 : 1);
            }
            ctx.restore();
        }

        // ── Sigil ring: counter-rotates behind the machine ──
        if (!spare && this.ready(art?.sigil)) {
            const span = size * (0.8 + Math.sin(view.pulse * 0.55) * 0.012);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(cx, cy);
            ctx.rotate(view.pulse * -0.05);
            ctx.globalAlpha = 0.26 + energy * 0.34 + impact * 0.2;
            ctx.drawImage(art.sigil, -span / 2, -span / 2, span, span);
            ctx.restore();
        }

        // ── The machine itself ──
        const sprite = art?.states?.[options.stateKey];
        if (this.ready(sprite)) {
            const breathe = 1 + Math.sin(view.pulse * 1.5) * 0.012 + impact * 0.05;
            const span = size * 0.58 * breathe;
            ctx.save();
            ctx.translate(cx, cy);
            if (impact > 0.02) {
                ctx.shadowColor = options.impactGlow;
                ctx.shadowBlur = 22 * impact;
            }
            ctx.drawImage(sprite, -span / 2, -span / 2, span, span);
            ctx.restore();
        }

        // ── Strike accepted: halo, flare, motes ──
        this.renderCoreBursts(view, size, cx, cy);

        if (impact > 0.02) view.impact = Math.max(0, impact - 0.05);
    },

    ready(img) {
        return !!img && img.complete && img.naturalWidth > 0;
    },

    /* Each strike is one burst object; the three plates read it at different
       rates so the effect resolves as ignition → shockwave → fallout. */
    renderCoreBursts(view, size, cx, cy) {
        const bursts = view.bursts;
        if (!bursts || !bursts.length) return;
        const ctx = view.ctx;
        const art = this.coreArt;

        // Additive light accumulates, so a fast clicker would stack three or
        // four strikes into a white blowout. Thin each one as the queue grows;
        // the cadence still reads, the readouts underneath stay legible.
        const crowd = Math.min(1, 1.5 / bursts.length);

        for (let i = bursts.length - 1; i >= 0; i--) {
            const burst = bursts[i];
            burst.life -= 0.042;
            if (burst.life <= 0) {
                bursts.splice(i, 1);
                continue;
            }

            const progress = 1 - burst.life;
            const scale = 0.9 + burst.magnitude * 0.16;

            // Shockwave: expands past the armour and thins out.
            if (this.ready(art?.halo)) {
                const span = size * (0.46 + progress * 0.54) * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = burst.life * 0.7 * crowd;
                ctx.translate(cx, cy);
                ctx.drawImage(art.halo, -span / 2, -span / 2, span, span);
                ctx.restore();
            }

            // Ignition: only in the first half, and it contracts as it fades.
            if (this.ready(art?.flare) && burst.life > 0.45) {
                const bite = (burst.life - 0.45) / 0.55;
                const span = size * (0.72 - bite * 0.1) * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = bite * crowd;
                ctx.translate(cx, cy);
                ctx.rotate(burst.spin * 0.12);
                ctx.drawImage(art.flare, -span / 2, -span / 2, span, span);
                ctx.restore();
            }

            // Fallout: motes drift outward on the tail.
            if (this.ready(art?.motes)) {
                const span = size * (0.5 + progress * 0.45) * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = burst.life * 0.5 * crowd;
                ctx.translate(cx, cy);
                ctx.rotate(burst.spin);
                ctx.drawImage(art.motes, -span / 2, -span / 2, span, span);
                ctx.restore();
            }
        }
    },

    log(msg) {
        const log = document.getElementById('engine-log');
        if (log) {
            const entry = document.createElement('div');
            entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            log.prepend(entry);
            // Limit log entries
            if (log.children.length > 5) log.lastChild.remove();
        }
    },

    updateUpgrades() {
        const container = document.getElementById('upgrades-list');
        if (!container) return;

        // Check if we need to rebuild (new upgrades became visible)
        const visibleUpgrades = UpgradeList.filter(u => u.visible());
        const currentCount = container.children.length;
        const shouldRebuild = visibleUpgrades.length !== currentCount;

        if (shouldRebuild) {
            container.innerHTML = ''; // Clear and rebuild

            visibleUpgrades.forEach(upgrade => {
                const isPurchased = State.upgrades[upgrade.id];

                // Check if can afford
                let canAfford = true;
                for (const [resource, amount] of Object.entries(upgrade.cost)) {
                    if ((game.resourceBag(resource)[resource] || 0) < amount) {
                        canAfford = false;
                        break;
                    }
                }

                // Create upgrade element
                const div = document.createElement('div');
                div.className = 'upgrade-item';
                div.dataset.upgradeId = upgrade.id;
                if (isPurchased) div.classList.add('purchased');
                if (!canAfford && !isPurchased) div.classList.add('unaffordable');

                // Build cost string
                const costStr = Object.entries(upgrade.cost)
                    .map(([res, amt]) => `${amt} ${res.charAt(0).toUpperCase() + res.slice(1)}`)
                    .join(', ');

                div.innerHTML = `
                    <div class="upgrade-header">
                        <strong>${upgrade.name}</strong>
                        ${isPurchased ? '<span class="purchased-badge">✓</span>' : ''}
                    </div>
                    <div class="upgrade-desc">${upgrade.description}</div>
                    <div class="upgrade-cost">${isPurchased ? 'ACQUIRED' : `Cost: ${costStr}`}</div>
                `;

                if (!isPurchased) {
                    div.style.cursor = 'pointer';
                    div.onclick = (e) => game.purchaseUpgrade(upgrade.id, e);
                }

                container.appendChild(div);
            });
        } else {
            // Just update affordability classes without rebuilding DOM
            visibleUpgrades.forEach(upgrade => {
                const element = container.querySelector(`[data-upgrade-id="${upgrade.id}"]`);
                if (!element) return;

                const isPurchased = State.upgrades[upgrade.id];
                if (isPurchased) return; // Don't update purchased items

                // Check if can afford
                let canAfford = true;
                for (const [resource, amount] of Object.entries(upgrade.cost)) {
                    if ((game.resourceBag(resource)[resource] || 0) < amount) {
                        canAfford = false;
                        break;
                    }
                }

                if (canAfford) {
                    element.classList.remove('unaffordable');
                } else {
                    element.classList.add('unaffordable');
                }
            });
        }
    },

    updateUpgradesAffordability() {
        // Lightweight update - only changes CSS classes based on affordability
        const container = document.getElementById('upgrades-list');
        if (!container) return;

        UpgradeList.filter(u => u.visible()).forEach(upgrade => {
            const element = container.querySelector(`[data-upgrade-id="${upgrade.id}"]`);
            if (!element || State.upgrades[upgrade.id]) return;

            let canAfford = true;
            for (const [resource, amount] of Object.entries(upgrade.cost)) {
                if ((game.resourceBag(resource)[resource] || 0) < amount) {
                    canAfford = false;
                    break;
                }
            }

            if (canAfford) {
                element.classList.remove('unaffordable');
            } else {
                element.classList.add('unaffordable');
            }
        });
    },

    /* ── Hierarchy and repeatables ────────────────────────────────────────
       Both lists are rendered from their data tables, so a new rank or a new
       repeatable needs no markup. Rebuilt only when the visible set changes;
       otherwise just the labels and affordability are refreshed, which keeps
       this off the hot path of a 60fps loop. */
    renderAutomatons(containerId = 'automaton-list', pool = 'primordial') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const visible = Object.keys(AutomatonSpecs).filter((type) => {
            const spec = AutomatonSpecs[type];
            if ((spec.pool || 'primordial') !== pool) return false;
            try { return spec.visible(); } catch { return false; }
        });
        const signature = visible.join('|');

        if (container.dataset.signature !== signature) {
            container.dataset.signature = signature;
            container.innerHTML = visible.map((type) => `
                <div class="automaton-buy-group" data-rank="${type}">
                    <button class="win-btn" data-automaton="${type}" onclick="game.buyAutomator('${type}', event)"></button>
                    <button class="win-btn buy-10-btn" onclick="game.buyAutomatorBulk('${type}', 10)">Buy 10</button>
                    <button class="win-btn buy-max-btn" onclick="game.buyAutomatorBulk('${type}', 'max')">Buy Max</button>
                </div>
            `).join('');
        }

        visible.forEach((type) => {
            const spec = AutomatonSpecs[type];
            const button = container.querySelector(`[data-automaton="${type}"]`);
            if (!button) return;

            const cost = game.getAutomatonCost(type);
            const owned = game.getAutomatonCount(type);
            const held = game.resourcePool(spec)[spec.currency] || 0;

            button.innerHTML =
                `<span class="automaton-name">${spec.label}</span>` +
                `<span class="automaton-owned">${owned}</span>` +
                `<span class="automaton-cost">${this.formatNumber(cost)} ${spec.currency}</span>`;
            button.title = spec.blurb;
            button.classList.toggle('unaffordable', held < cost);
        });
    },

    renderRepeatables(containerId = 'repeatable-list', pool = 'primordial') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const visible = RepeatableList.filter((spec) => {
            if ((spec.pool || 'primordial') !== pool) return false;
            try { return spec.visible(); } catch { return false; }
        });
        const signature = visible.map((r) => r.id).join('|');

        if (container.dataset.signature !== signature) {
            container.dataset.signature = signature;
            container.innerHTML = visible.map((spec) => `
                <button class="win-btn repeatable-row" data-repeatable="${spec.id}"
                        onclick="game.purchaseRepeatable('${spec.id}')"></button>
            `).join('');
        }

        visible.forEach((spec) => {
            const button = container.querySelector(`[data-repeatable="${spec.id}"]`);
            if (!button) return;

            const level = game.getRepeatableLevel(spec.id);
            const cost = game.getRepeatableCost(spec.id);
            const held = game.resourcePool(spec)[spec.resource] || 0;

            button.innerHTML =
                `<span class="repeatable-name">${spec.name}<small>${spec.effectText(level)}</small></span>` +
                `<span class="repeatable-rank">RANK ${level}</span>` +
                `<span class="repeatable-cost">${this.formatNumber(cost)} ${spec.resource}</span>`;
            button.title = spec.description;
            button.classList.toggle('unaffordable', held < cost);
        });
    },

    // Retained so existing callers keep working.
    updateSeraphButton() { this.renderAutomatons(); },
    updateCherubButton() { this.renderRepeatables(); },

    updateAchievements() {
        const container = document.getElementById('achievements-list');
        if (!container) return;

        container.innerHTML = '';

        // Group achievements by tier
        const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Secret'];


        tiers.forEach(tier => {
            const tierAchievements = AchievementList.filter(a => a.tier === tier);
            if (tierAchievements.length === 0) return;

            // Tier header
            const unlockedInTier = tierAchievements.filter(a => State.achievements[a.id]).length;
            const tierHeader = document.createElement('div');
            tierHeader.className = `achievement-tier-header tier-${tier.toLowerCase()}`;
            tierHeader.innerHTML = `
                <span class="tier-icon">${this.tierMark(tier)}</span>
                <span class="tier-name">${tier} Achievements</span>
                <span class="tier-progress">${unlockedInTier}/${tierAchievements.length}</span>
            `;
            container.appendChild(tierHeader);

            // Achievements in tier
            tierAchievements.forEach(achievement => {
                const isUnlocked = State.achievements[achievement.id];

                const div = document.createElement('div');
                div.className = `achievement-item tier-${tier.toLowerCase()}`;
                if (isUnlocked) div.classList.add('unlocked');

                div.innerHTML = `
                    <div class="achievement-icon-large">${this.tierMark(tier, !isUnlocked)}</div>
                    <div class="achievement-info">
                        <div class="achievement-name">${isUnlocked ? achievement.name : '???'}</div>
                        <div class="achievement-desc">${isUnlocked ? achievement.flavor : 'Hidden achievement'}</div>
                    </div>
                `;

                container.appendChild(div);
            });
        });
    },

    updateStats() {
        const clicksEl = document.getElementById('stat-clicks');
        const praiseEl = document.getElementById('stat-praise');
        const achievementsEl = document.getElementById('stat-achievements');

        if (clicksEl) clicksEl.innerText = this.formatNumber(State.totalClicks);
        if (praiseEl) praiseEl.innerText = this.formatNumber(Math.floor(State.totalPraiseEarned));
        if (achievementsEl) {
            const unlockedCount = Object.keys(State.achievements).length;
            const totalCount = AchievementList.length;
            achievementsEl.innerText = `${unlockedCount}/${totalCount}`;
        }
    },

    showDivineEvent(event) {
        // Duplicate ids meant hideDivineEvent() only ever found the first one,
        // so expired tokens accumulated in the DOM for the whole session.
        document.querySelectorAll('.divine-event').forEach((stale) => stale.remove());

        const element = document.createElement('div');
        element.id = 'divine-event';
        element.className = 'divine-event';
        element.style.left = event.x + 'px';
        element.style.top = event.y + 'px';
        element.innerHTML = `
            <div class="divine-event-glow"></div>
            <div class="divine-event-icon"><img src="assets/vfx/flare_256.png" alt="" aria-hidden="true"></div>
            <div class="divine-event-value">+${event.value}</div>
        `;
        element.onclick = () => game.clickDivineEvent();

        document.body.appendChild(element);
    },

    hideDivineEvent() {
        // Sweep by class, not id: a duplicate id would leave siblings stranded.
        document.querySelectorAll('.divine-event').forEach((element) => {
            element.classList.add('fade-out');
            element.style.pointerEvents = 'none';
            setTimeout(() => element.remove(), 300);
        });
    },

    updateSkillButtons() {
        const now = Date.now();

        // Update Divine Intervention button
        const diButton = document.getElementById('skill-divine-intervention');
        if (diButton) {
            const skill = State.skills.divineIntervention;
            if (skill.active && now < skill.endsAt) {
                const remaining = Math.ceil((skill.endsAt - now) / 1000);
                diButton.innerText = `Divine Intervention (Active: ${remaining}s)`;
                diButton.disabled = true;
                diButton.classList.add('skill-active');
            } else if (now < skill.cooldownEndsAt) {
                const remaining = Math.ceil((skill.cooldownEndsAt - now) / 1000);
                diButton.innerText = `Divine Intervention (Cooldown: ${remaining}s)`;
                diButton.disabled = true;
                diButton.classList.remove('skill-active');
            } else {
                diButton.innerText = `Divine Intervention (2× prod, 10m)`;
                diButton.disabled = false;
                diButton.classList.remove('skill-active');
            }
        }

        // Update Temporal Rift button
        const trButton = document.getElementById('skill-temporal-rift');
        if (trButton) {
            const skill = State.skills.temporalRift;
            if (now < skill.cooldownEndsAt) {
                const remaining = Math.ceil((skill.cooldownEndsAt - now) / 1000);
                trButton.innerText = `Temporal Rift (Cooldown: ${remaining}s)`;
                trButton.disabled = true;
            } else {
                trButton.innerText = `Temporal Rift (Simulate 1hr)`;
                trButton.disabled = false;
            }
        }
    },

    /* Echoes had no sink at all before this: nothing in the game cost them.
       Null Doctrine turns them into a permanent multiplier on BOTH dimensions,
       which is also what pays for the trip into the Void. */
    renderNullDoctrine() {
        const host = document.getElementById('void-doctrine');
        if (!host) return;

        const rank = State.nullDoctrine || 0;
        const cost = game.getNullDoctrineCost();
        const held = State.dimensions.void.resources.echoes || 0;

        host.innerHTML = `
            <div class="doctrine-head">
                <span class="doctrine-title">Null Doctrine</span>
                <span class="doctrine-rank">RANK ${rank}</span>
            </div>
            <p class="doctrine-desc">Permanent, and survives every Divine Reboot.
               Currently +${Math.round((game.getNullDoctrineBonus() - 1) * 100)}% to all production,
               in every dimension.</p>
            <button class="win-btn void-btn doctrine-buy ${held < cost ? 'unaffordable' : ''}"
                    onclick="game.purchaseNullDoctrine()">Inscribe next rank — ${this.formatNumber(cost)} Echoes</button>
            <div class="doctrine-bank">${this.formatNumber(Math.floor(held))} Echoes banked</div>
        `;
    },

    /* The tree is finite; Divinity is not. Standing Doctrine is the meta-layer
       equivalent of Standing Requisitions — always purchasable, so a long-run
       player never sits on an unspendable pile of Divinity Points. */
    renderDoctrine() {
        const host = document.getElementById('mandate-doctrine');
        if (!host) return;

        const rank = State.standingDoctrine || 0;
        const cost = game.getDoctrineCost();
        const available = game.getAvailableDivinityPoints();

        host.innerHTML = `
            <div class="doctrine-head">
                <span class="doctrine-title">Standing Doctrine</span>
                <span class="doctrine-rank">RANK ${rank}</span>
            </div>
            <p class="doctrine-desc">Permanent, and survives every Divine Reboot.
               Currently +${Math.round(((game.getDoctrineBonus() - 1) * 100))}% to all production.</p>
            <button class="win-btn doctrine-buy ${available < cost ? 'unaffordable' : ''}"
                    onclick="game.purchaseDoctrine()">Ratify next rank — ${this.formatNumber(cost)} DP</button>
            <div class="doctrine-bank">${this.formatNumber(available)} Divinity available</div>
        `;
    },

    updateMandates() {
        this.renderDoctrine();

        // Update each branch
        ['creation', 'maintenance', 'entropy'].forEach(branch => {
            const container = document.getElementById(`mandate-${branch}`);
            if (!container) return;

            container.innerHTML = '';

            const branchMandates = MandateList.filter(m => m.branch === branch);
            branchMandates.forEach(mandate => {
                const isPurchased = State.purchasedMandates[mandate.id];

                // Check if prerequisites are met
                let prereqsMet = true;
                for (const prereq of mandate.prerequisites) {
                    if (!State.purchasedMandates[prereq]) {
                        prereqsMet = false;
                        break;
                    }
                }

                const mandateEfficiency = State.achievementBonuses?.mandateEfficiency || 1;
                const effectiveCost = Math.max(1, Math.ceil(mandate.cost / mandateEfficiency));

                // Check if can afford
                const canAfford = game.getAvailableDivinityPoints() >= effectiveCost;

                // Create mandate node element
                const node = document.createElement('div');
                node.className = 'mandate-node';
                if (isPurchased) node.classList.add('purchased');
                if (!prereqsMet && !isPurchased) node.classList.add('locked');
                if (!canAfford && !isPurchased && prereqsMet) node.classList.add('unaffordable');

                node.innerHTML = `
                    <div class="mandate-name">${mandate.name}</div>
                    <div class="mandate-desc">${mandate.description}</div>
                    <div class="mandate-cost">${isPurchased ? 'ENACTED' : (prereqsMet ? `${effectiveCost} DP${effectiveCost < mandate.cost ? ` (Base ${mandate.cost})` : ''}` : 'Prerequisites not met')}</div>
                `;

                if (!isPurchased && prereqsMet) {
                    node.style.cursor = 'pointer';
                    node.onclick = () => game.purchaseMandate(mandate.id);
                }

                container.appendChild(node);
            });
        });
    },

    switchDimension(dimensionId) {
        State.currentDimension = dimensionId;

        // Update tab styling
        document.querySelectorAll('.dimension-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.getElementById(`tab-${dimensionId}`);
        if (activeTab) activeTab.classList.add('active');

        // Re-render content
        this.renderDimensionContent();
    },

    renderDimensionContent() {
        const container = document.getElementById('dimension-content');
        if (!container) return;

        const dim = State.currentDimension;

        if (dim === 'primordial') {
            container.className = 'dimension-content primordial-theme';
            container.innerHTML = `
                <div class="dimension-info">
                    <h2>Primordial Sector</h2>
                    <p class="dim-description">The origin point. Where reality began its first iteration.</p>
                </div>

                <div class="resource-panel">
                    <div class="stat-box">
                        <label>PRAISE</label>
                        <div id="dim-val-praise" class="stat-value">0</div>
                        <div class="stat-rate">+<span id="dim-val-praise-rate">0</span>/s</div>
                    </div>
                    <div class="stat-box">
                        <label>OFFERINGS</label>
                        <div id="dim-val-offerings" class="stat-value">0</div>
                    </div>
                    <div class="stat-box">
                        <label>SOULS</label>
                        <div id="dim-val-souls" class="stat-value">0</div>
                        <div class="stat-rate">+<span id="dim-val-soul-rate">0</span>/s</div>
                    </div>
                </div>

                <div class="automatons-info">
                    <div class="automaton-stat">
                        <strong>Seraphs:</strong> <span id="dim-seraph-count">0</span>
                        <span class="automaton-production">(+<span id="dim-seraph-prod">0</span>/s)</span>
                    </div>
                    <div class="automaton-stat">
                        <strong>Cherubs:</strong> <span id="dim-cherub-count">0</span>
                        <span class="automaton-production">(+<span id="dim-cherub-prod">0</span>/s)</span>
                    </div>
                </div>

                <div class="dimension-note">
                    <em>This dimension runs in the background. Manage it from the Universal Engine Console.</em>
                </div>
            `;
        } else if (dim === 'void') {
            if (!State.dimensions.void.unlocked) {
                container.className = 'dimension-content void-theme locked-dimension';
                container.innerHTML = `
                    <div class="dimension-info">
                        <h2>Void Dimension</h2>
                        <p class="dim-description locked-text">??? LOCKED ???</p>
                        <p class="unlock-hint">Accumulate 100 Souls and purchase "Breach the Veil" to unlock.</p>
                    </div>
                `;
                return;
            }

            container.className = 'dimension-content void-theme';
            container.innerHTML = `
                <div class="dimension-info">
                    <h2>Void Dimension</h2>
                    <p class="dim-description">A darker reflection. Where light fades and entropy reigns.</p>
                </div>

                <div class="visual-core visual-core--void">
                    <canvas id="void-core-canvas" width="200" height="200"></canvas>
                </div>

                <div class="resource-panel">
                    <div class="stat-box void-stat">
                        <label>DARKNESS</label>
                        <div id="dim-val-darkness" class="stat-value">0</div>
                        <div class="stat-rate">+<span id="dim-val-darkness-rate">0</span>/s</div>
                    </div>
                    <div class="stat-box void-stat">
                        <label>SHADOWS</label>
                        <div id="dim-val-shadows" class="stat-value">0</div>
                    </div>
                    <div class="stat-box void-stat">
                        <label>ECHOES</label>
                        <div id="dim-val-echoes" class="stat-value">0</div>
                        <div class="stat-rate">+<span id="dim-val-echo-rate">0</span>/s</div>
                    </div>
                </div>

                <div class="actions">
                    <button class="win-btn void-btn" onclick="game.manualVoidClick(event)">Embrace the Void</button>
                    <div id="void-automaton-list" class="automaton-list"></div>
                </div>

                <div id="void-doctrine" class="doctrine-panel doctrine-panel--void"></div>

                <div class="repeatable-section">
                    <h3 class="section-title">Void Requisitions</h3>
                    <p class="section-note">The tear widens as fast as you can feed it.</p>
                    <div id="void-repeatable-list" class="repeatable-list"></div>
                </div>

                <div class="automatons-info">
                    <div class="automaton-stat">
                        <strong>Wraiths:</strong> <span id="dim-wraith-count">0</span>
                        <span class="automaton-production">(+<span id="dim-wraith-prod">0</span>/s)</span>
                    </div>
                    <div class="automaton-stat">
                        <strong>Phantoms:</strong> <span id="dim-phantom-count">0</span>
                        <span class="automaton-production">(+<span id="dim-phantom-prod">0</span>/s)</span>
                    </div>
                </div>
            `;

            // Initialize void canvas
            setTimeout(() => this.initVoidCanvas(), 0);
        }

        // Update all values
        this.updateDimensionDisplay();
    },

    updateDimensionDisplay() {
        const dim = State.currentDimension;

        if (dim === 'primordial') {
            // Update primordial resources
            const praiseEl = document.getElementById('dim-val-praise');
            const offeringsEl = document.getElementById('dim-val-offerings');
            const soulsEl = document.getElementById('dim-val-souls');
            const praiseRateEl = document.getElementById('dim-val-praise-rate');
            const soulRateEl = document.getElementById('dim-val-soul-rate');

            if (praiseEl) praiseEl.innerText = `${this.formatNumber(Math.floor(State.resources.praise))} / ${this.formatNumber(State.resourceCaps.praise)}`;
            if (offeringsEl) offeringsEl.innerText = `${this.formatNumber(Math.floor(State.resources.offerings))} / ${this.formatNumber(State.resourceCaps.offerings)}`;
            if (soulsEl) soulsEl.innerText = `${this.formatNumber(Math.floor(State.resources.souls))} / ${this.formatNumber(State.resourceCaps.souls)}`;

            const now = Date.now();
            const loops = State.loopSystems || {};
            const achievementBonuses = State.achievementBonuses || {};
            const seraphProd = State.automatons.seraphProduction || 1;
            const cherubProd = State.automatons.cherubProduction || 1;
            const streakBonus = 1 + Math.min(0.35, (loops.miracleStreak || 0) * 0.007);
            const overclockBonus = (loops.overclock?.active && now < loops.overclock?.endsAt) ? 1.5 : 1;
            const interventionBonus = (State.skills?.divineIntervention?.active && now < State.skills.divineIntervention.endsAt) ? 2 : 1;
            const totalProductionBonus = interventionBonus * streakBonus * overclockBonus * (achievementBonuses.automationSpeed || 1);
            const praisePerSec = State.pps * seraphProd * State.praiseMultiplier * totalProductionBonus *
                (achievementBonuses.praiseGain || 1) * (achievementBonuses.globalGain || 1);
            const soulPerSec = State.sps * cherubProd * State.soulMultiplier * totalProductionBonus *
                (achievementBonuses.soulGain || 1) * (achievementBonuses.globalGain || 1);

            if (praiseRateEl) praiseRateEl.innerText = this.formatNumber(praisePerSec, 1);
            if (soulRateEl) soulRateEl.innerText = this.formatNumber(soulPerSec, 1);

            // Update automaton counts
            const seraphCountEl = document.getElementById('dim-seraph-count');
            const cherubCountEl = document.getElementById('dim-cherub-count');
            const seraphProdEl = document.getElementById('dim-seraph-prod');
            const cherubProdEl = document.getElementById('dim-cherub-prod');

            if (seraphCountEl) seraphCountEl.innerText = this.formatNumber(State.automatons.seraphCount);
            if (cherubCountEl) cherubCountEl.innerText = this.formatNumber(State.automatons.cherubCount);
            if (seraphProdEl) seraphProdEl.innerText = this.formatNumber(praisePerSec, 1);
            if (cherubProdEl) cherubProdEl.innerText = this.formatNumber(soulPerSec, 1);

        } else if (dim === 'void') {
            if (!State.dimensions.void.unlocked) return;

            const vd = State.dimensions.void;

            // Update void resources
            const darknessEl = document.getElementById('dim-val-darkness');
            const shadowsEl = document.getElementById('dim-val-shadows');
            const echoesEl = document.getElementById('dim-val-echoes');
            const darknessRateEl = document.getElementById('dim-val-darkness-rate');
            const echoRateEl = document.getElementById('dim-val-echo-rate');

            if (darknessEl) darknessEl.innerText = `${this.formatNumber(Math.floor(vd.resources.darkness))} / ${this.formatNumber(vd.resourceCaps.darkness)}`;
            if (shadowsEl) shadowsEl.innerText = `${this.formatNumber(Math.floor(vd.resources.shadows))} / ${this.formatNumber(vd.resourceCaps.shadows)}`;
            if (echoesEl) echoesEl.innerText = `${this.formatNumber(Math.floor(vd.resources.echoes))} / ${this.formatNumber(vd.resourceCaps.echoes)}`;

            const now = Date.now();
            const loops = State.loopSystems || {};
            const achievementBonuses = State.achievementBonuses || {};
            const wraithProd = vd.automatons.wraithProduction || 1;
            const phantomProd = vd.automatons.phantomProduction || 1;
            const streakBonus = 1 + Math.min(0.35, (loops.miracleStreak || 0) * 0.007);
            const overclockBonus = (loops.overclock?.active && now < loops.overclock?.endsAt) ? 1.5 : 1;
            const interventionBonus = (State.skills?.divineIntervention?.active && now < State.skills.divineIntervention.endsAt) ? 2 : 1;
            const totalVoidBonus = interventionBonus * streakBonus * overclockBonus * (achievementBonuses.automationSpeed || 1) *
                (achievementBonuses.voidGain || 1) * (achievementBonuses.voidStability || 1) * (achievementBonuses.globalGain || 1);
            const darknessPerSec = vd.dps * wraithProd * vd.darknessMultiplier * totalVoidBonus;
            const echoPerSec = vd.eps * phantomProd * vd.echoMultiplier * totalVoidBonus;

            if (darknessRateEl) darknessRateEl.innerText = this.formatNumber(darknessPerSec, 1);
            if (echoRateEl) echoRateEl.innerText = this.formatNumber(echoPerSec, 1);

            this.renderAutomatons('void-automaton-list', 'void');
            this.renderRepeatables('void-repeatable-list', 'void');
            this.renderNullDoctrine();

            // Update automaton counts
            const wraithCountEl = document.getElementById('dim-wraith-count');
            const phantomCountEl = document.getElementById('dim-phantom-count');
            const wraithProdEl = document.getElementById('dim-wraith-prod');
            const phantomProdEl = document.getElementById('dim-phantom-prod');

            if (wraithCountEl) wraithCountEl.innerText = this.formatNumber(vd.automatons.wraithCount);
            if (phantomCountEl) phantomCountEl.innerText = this.formatNumber(vd.automatons.phantomCount);
            if (wraithProdEl) wraithProdEl.innerText = this.formatNumber(darknessPerSec, 1);
            if (phantomProdEl) phantomProdEl.innerText = this.formatNumber(echoPerSec, 1);
        }
    },

    updateDesktopIcons() {
        // Show/hide desktop icons based on unlocked apps
        const dimensionsIcon = document.getElementById('icon-dimensions');
        if (dimensionsIcon) {
            if (State.unlockedApps.includes('dimensions')) {
                dimensionsIcon.style.display = 'block';
            } else {
                dimensionsIcon.style.display = 'none';
            }
        }

        const notepadIcon = document.getElementById('icon-notepad');
        if (notepadIcon) {
            if (State.unlockedApps.includes('notepad')) {
                notepadIcon.style.display = 'block';
            } else {
                notepadIcon.style.display = 'none';
            }
        }

        const globeIcon = document.getElementById('icon-divineglobe');
        if (globeIcon) {
            if (State.unlockedApps.includes('divineglobe')) {
                globeIcon.style.display = 'block';
            } else {
                globeIcon.style.display = 'none';
            }
        }

        const callsIcon = document.getElementById('icon-divinecalls');
        if (callsIcon) {
            if (State.unlockedApps.includes('divinecalls')) {
                callsIcon.style.display = 'block';
            } else {
                callsIcon.style.display = 'none';
            }
        }

        const shopIcon = document.getElementById('icon-adorationshop');
        if (shopIcon) {
            if (State.unlockedApps.includes('adorationshop')) {
                shopIcon.style.display = 'block';
            } else {
                shopIcon.style.display = 'none';
            }
        }
    },

    // === DOCUMENT SYSTEM UI ===

    showDocumentNotification(doc) {
        const notification = document.createElement('div');
        notification.className = 'document-notification';
        notification.innerHTML = `
            <div class="doc-notif-icon"><img class="app-glyph" src="assets/icons/notepad_96.png" alt=""></div>
            <div class="doc-notif-content">
                <div class="doc-notif-title">Document Unlocked</div>
                <div class="doc-notif-name">${doc.title}</div>
                <div class="doc-notif-category">${doc.category}</div>
            </div>
        `;

        document.body.appendChild(notification);

        // Slide in from right
        setTimeout(() => notification.classList.add('show'), 10);

        // Click to dismiss
        notification.onclick = () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        };

        // Auto-remove after 6 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 6000);

        this.screenPulse('rgba(100, 181, 246, 0.2)');
    },

    renderDocumentList(category = 'all') {
        const listContainer = document.getElementById('document-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Get documents from manifest
        let docsToShow = DocumentManifest.filter(doc =>
            State.documents.collected.includes(doc.id)
        );

        // Filter by category if not 'all'
        if (category !== 'all') {
            docsToShow = docsToShow.filter(doc => doc.category === category);
        }

        if (docsToShow.length === 0) {
            listContainer.innerHTML = '<div class="no-documents">No documents found in this category.</div>';
            return;
        }

        // Group by category if showing all
        if (category === 'all') {
            const categories = {};
            docsToShow.forEach(doc => {
                if (!categories[doc.category]) {
                    categories[doc.category] = [];
                }
                categories[doc.category].push(doc);
            });

            // Render each category
            for (const [cat, docs] of Object.entries(categories)) {
                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'document-category-header';
                categoryHeader.innerText = cat;
                listContainer.appendChild(categoryHeader);

                docs.forEach(doc => {
                    this.createDocumentListItem(doc, listContainer);
                });
            }
        } else {
            // Just render the documents
            docsToShow.forEach(doc => {
                this.createDocumentListItem(doc, listContainer);
            });
        }
    },

    createDocumentListItem(doc, container) {
        const item = document.createElement('div');
        item.className = 'document-item';
        item.dataset.docId = doc.id;

        const icon = this.getDocumentCategoryIcon(doc.category);

        item.innerHTML = `
            <span class="doc-item-icon">${icon}</span>
            <span class="doc-item-title">${doc.title}</span>
        `;

        item.onclick = () => this.viewDocument(doc.id);
        container.appendChild(item);
    },

    getDocumentCategoryIcon(category) {
        return this.codeStamp(this.docCodes[category] || 'DOC', category === 'Incident');
    },

    async viewDocument(docId) {
        const doc = DocumentManifest.find(d => d.id === docId);
        if (!doc) return;

        const titleEl = document.getElementById('document-title');
        const contentEl = document.getElementById('document-content');
        const metaEl = document.getElementById('document-meta');

        if (titleEl) titleEl.innerText = doc.title;

        // Show metadata
        if (metaEl) {
            metaEl.innerHTML = `
                <span class="doc-meta-item"><strong>Category:</strong> ${doc.category}</span>
                <span class="doc-meta-item"><strong>File:</strong> ${doc.filename}</span>
                <span class="doc-meta-item"><strong>ID:</strong> ${doc.id}</span>
            `;
        }

        // Load document content
        if (contentEl) {
            contentEl.innerHTML = '<div class="loading">Loading document...</div>';

            try {
                const contentPath = `/docs/CosmOS_Content_Pack/docs/${doc.id}_${doc.filename.replace(/\//g, '__')}.md`;
                const response = await fetch(contentPath);

                if (!response.ok) {
                    throw new Error(`Failed to load document: ${response.status}`);
                }

                const markdown = await response.text();

                // Strip frontmatter (YAML between --- delimiters)
                let content = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');

                // Simple markdown rendering
                content = this.renderMarkdown(content);

                contentEl.innerHTML = content;
            } catch (error) {
                contentEl.innerHTML = `
                    <div class="error">
                        <strong>Error loading document</strong>
                        <p>${error.message}</p>
                        <pre>Path: /docs/CosmOS_Content_Pack/docs/${doc.id}_${doc.filename.replace(/\//g, '__')}.md</pre>
                    </div>
                `;
            }
        }

        // Update selected styling
        document.querySelectorAll('.document-item').forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.docId === doc.id) {
                item.classList.add('selected');
            }
        });
    },

    renderMarkdown(markdown) {
        // Simple markdown rendering (headings, bold, italic, lists, code blocks)
        let html = markdown;

        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Paragraphs (lines separated by blank lines)
        html = html.split('\n\n').map(para => {
            if (para.startsWith('<') || para.trim() === '') return para;
            return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
        }).join('\n');

        return html;
    },

    switchDocumentCategory(category) {
        // Update category tab styling
        document.querySelectorAll('.doc-category-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        const activeTab = document.querySelector(`[data-category="${category}"]`);
        if (activeTab) activeTab.classList.add('active');

        // Re-render list
        this.renderDocumentList(category);
    },

    updatePrestigeInfo() {
        const levelEl = document.getElementById('prestige-level');
        const pointsEl = document.getElementById('divinity-points');
        const bonusEl = document.getElementById('prestige-bonus');
        const gainEl = document.getElementById('divinity-gain');
        const buttonEl = document.getElementById('prestige-button');

        if (levelEl) levelEl.innerText = this.formatNumber(State.prestigeLevel);
        if (pointsEl) pointsEl.innerText = this.formatNumber(State.totalDivinityPoints);
        if (bonusEl) bonusEl.innerText = this.formatNumber((State.divinityPointMultiplier - 1) * 100);

        const divinityGain = game.calculateDivinityPoints();
        if (gainEl) {
            gainEl.innerText = this.formatNumber(divinityGain);
            gainEl.closest('.prestige-gain').style.color = divinityGain > 0 ? '#4caf50' : '#666';
        }

        if (buttonEl) {
            buttonEl.disabled = !game.canPrestige();
            if (game.canPrestige()) {
                buttonEl.classList.add('prestige-ready');
            } else {
                buttonEl.classList.remove('prestige-ready');
            }
        }
    },

    // === DIVINE GLOBE FUNCTIONS ===
    selectedGlobeDimension: null,

    initGlobeCanvas() {
        const canvas = document.getElementById('globe-canvas');
        if (!canvas) return;

        this.globeCtx = canvas.getContext('2d');
        this.globeRotation = 0;
        this.globeRegions = [];

        this.animateGlobe();
        canvas.addEventListener('click', (e) => this.handleGlobeClick(e));
    },

    animateGlobe() {
        if (!this.globeCtx) return;

        const ctx = this.globeCtx;
        const canvas = ctx.canvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 150;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw globe sphere
        const gradient = ctx.createRadialGradient(centerX - 30, centerY - 30, 0, centerX, centerY, radius);
        gradient.addColorStop(0, '#4a90e2');
        gradient.addColorStop(0.7, '#2c5f9e');
        gradient.addColorStop(1, '#1a3a5c');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Reset regions array
        this.globeRegions = [];

        // Draw dimension regions
        this.drawDimensionRegion(ctx, centerX, centerY - 60, 40, 'primordial', '#ffd700');
        this.drawDimensionRegion(ctx, centerX, centerY + 60, 40, 'void', '#9c27b0');

        this.globeRotation += 0.005;
        requestAnimationFrame(() => this.animateGlobe());
    },

    drawDimensionRegion(ctx, x, y, radius, dimId, color) {
        ctx.fillStyle = color;
        ctx.strokeStyle = this.selectedGlobeDimension === dimId ? '#ffffff' : color;
        ctx.lineWidth = this.selectedGlobeDimension === dimId ? 3 : 1;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        this.globeRegions.push({ x, y, radius, dimId });
    },

    handleGlobeClick(event) {
        const canvas = event.target;
        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        for (const region of this.globeRegions) {
            const distance = Math.sqrt((clickX - region.x) ** 2 + (clickY - region.y) ** 2);
            if (distance <= region.radius) {
                this.selectGlobeDimension(region.dimId);
                return;
            }
        }
    },

    selectGlobeDimension(dimId) {
        this.selectedGlobeDimension = dimId;
        this.updateGlobeDisplay();
        ui.log(`Selected ${dimId} dimension on globe.`);
    },

    updateGlobeDisplay() {
        const dimId = this.selectedGlobeDimension;
        if (!dimId) return;

        const nameEl = document.getElementById('globe-dim-name');
        const assignedEl = document.getElementById('globe-prophets-assigned');
        const availableEl = document.getElementById('globe-prophets-available');
        const followersEl = document.getElementById('globe-followers');
        const adorationRateEl = document.getElementById('globe-adoration-rate');

        if (nameEl) nameEl.innerText = dimId.charAt(0).toUpperCase() + dimId.slice(1) + ' Dimension';
        if (assignedEl) assignedEl.innerText = State.prophets.assignments[dimId] || 0;
        if (availableEl) availableEl.innerText = State.prophets.available;
        if (followersEl) followersEl.innerText = Math.floor(State.followers[dimId]?.count || 0);

        const followerData = State.followers[dimId];
        const timelineAdorationBonus = State.timelines.effects[State.timelines.current].adorationBonus || 1;
        const adorationGlobalBonus = State.achievementBonuses?.globalGain || 1;
        const adorationRate = followerData ? followerData.count * followerData.adorationRate * timelineAdorationBonus * adorationGlobalBonus : 0;
        if (adorationRateEl) adorationRateEl.innerText = this.formatNumber(adorationRate, 2);

        const adorationEl = document.getElementById('val-adoration');
        const adorationRateMainEl = document.getElementById('val-adoration-rate');
        if (adorationEl) adorationEl.innerText = this.formatNumber(Math.floor(State.adoration));
        if (adorationRateMainEl) {
            let totalRate = 0;
            for (const dim in State.followers) {
                totalRate += State.followers[dim].count * State.followers[dim].adorationRate;
            }
            totalRate *= timelineAdorationBonus * adorationGlobalBonus;
            adorationRateMainEl.innerText = this.formatNumber(totalRate, 2);
        }
    },

    // === TIMELINE FUNCTIONS ===
    switchTimeline(timelineId) {
        if (!State.timelines.unlocked.includes(timelineId)) {
            ui.log('Timeline not yet unlocked.');
            return;
        }

        State.timelines.current = timelineId;

        document.querySelectorAll('.timeline-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`timeline-${timelineId}`);
        if (activeBtn) activeBtn.classList.add('active');

        ui.log(`Switched to ${timelineId} timeline.`);
    },

    // === SHOP FUNCTIONS ===
    renderShopContent(category) {
        const container = document.getElementById('shop-content');
        if (!container) return;

        container.innerHTML = '';

        const items = ShopItemList.filter(i => i.category === category);
        items.forEach(item => {
            const isPurchased = State.adorationShop[category][item.id];
            const level = item.upgradable ? (State.adorationShop[category][item.id] || 0) : 0;

            const div = document.createElement('div');
            div.className = 'shop-item';
            if (isPurchased && !item.upgradable) div.classList.add('purchased');

            div.innerHTML = `
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-desc">${item.description}</div>
                <div class="shop-item-cost">${isPurchased && !item.upgradable ? 'PURCHASED' : `${item.cost} Adoration`}</div>
                ${item.upgradable ? `<div class="shop-item-level">Level: ${level}</div>` : ''}
            `;

            if (!isPurchased || item.upgradable) {
                div.style.cursor = 'pointer';
                div.onclick = () => game.purchaseShopItem(category, item.id);
            }

            container.appendChild(div);
        });

        const balanceEl = document.getElementById('shop-adoration');
        if (balanceEl) balanceEl.innerText = this.formatNumber(Math.floor(State.adoration));
    },

    switchShopTab(category, event) {
        document.querySelectorAll('.shop-tab').forEach(tab => tab.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');
        this.renderShopContent(category);
    },

    // === DIVINE CALLS FUNCTIONS ===
    updateDivineCallsDisplay() {
        const now = Date.now();
        const cooldownRemaining = Math.max(0, State.divineCalls.lastAnswered + State.divineCalls.cooldown - now);

        const offeringsBtn = document.getElementById('btn-convert-offerings');
        const soulsBtn = document.getElementById('btn-convert-souls');
        const offeringsCooldown = document.getElementById('cooldown-offerings');
        const soulsCooldown = document.getElementById('cooldown-souls');

        if (cooldownRemaining > 0) {
            const seconds = Math.ceil(cooldownRemaining / 1000);
            if (offeringsCooldown) offeringsCooldown.innerText = `${seconds}s`;
            if (soulsCooldown) soulsCooldown.innerText = `${seconds}s`;
            if (offeringsBtn) offeringsBtn.disabled = true;
            if (soulsBtn) soulsBtn.disabled = true;
        } else {
            if (offeringsCooldown) offeringsCooldown.innerText = 'Ready';
            if (soulsCooldown) soulsCooldown.innerText = 'Ready';
            if (offeringsBtn) offeringsBtn.disabled = false;
            if (soulsBtn) soulsBtn.disabled = false;
        }
    },

    // === TASK MANAGER FUNCTIONS ===
    getTaskManagerEndedProcesses() {
        State.taskManager = State.taskManager || {};

        // Normalize older/newer save keys into a single source of truth.
        if (!Array.isArray(State.taskManager.processesEnded)) {
            State.taskManager.processesEnded = Array.isArray(State.taskManager.endedProcesses)
                ? State.taskManager.endedProcesses
                : [];
        }

        State.taskManager.endedProcesses = State.taskManager.processesEnded;
        return State.taskManager.processesEnded;
    },

    updateTaskManagerList() {
        const tbody = document.getElementById('taskmgr-process-list');
        const countEl = document.getElementById('taskmgr-process-count');
        const cpuEl = document.getElementById('taskmgr-cpu-total');
        const memEl = document.getElementById('taskmgr-mem-total');

        if (!tbody) return;

        tbody.innerHTML = '';

        let totalCPU = 0;
        let totalMemory = 0;
        let runningCount = 0;
        const endedProcesses = this.getTaskManagerEndedProcesses();

        TaskManagerProcesses.forEach(proc => {
            const isRunning = !endedProcesses.includes(proc.name);
            if (!isRunning) return; // Don't show ended processes

            runningCount++;
            totalCPU += proc.cpu;
            totalMemory += proc.memory;

            const row = document.createElement('tr');
            row.className = 'taskmgr-row';
            if (proc.critical) row.classList.add('critical-process');

            // Status styling
            let statusClass = 'status-running';
            let statusText = 'Running';
            if (proc.status === 'Not Responding') {
                statusClass = 'status-not-responding';
                statusText = 'Not Responding';
            } else if (proc.status === 'Idle') {
                statusClass = 'status-idle';
                statusText = 'Idle';
            }

            row.innerHTML = `
                <td class="process-name ${proc.critical ? 'critical-text' : ''}">${proc.name}</td>
                <td class="process-cpu">${proc.cpu}%</td>
                <td class="process-memory">${proc.memory} MB</td>
                <td class="process-status ${statusClass}">${statusText}</td>
                <td class="process-desc">${proc.description}</td>
                <td class="process-action">
                    ${proc.endable || proc.onAttempt ?
                        `<button class="btn-end-process" onclick="ui.endProcess('${proc.name}')">End Process</button>` :
                        '<span class="no-action">—</span>'}
                </td>
            `;

            tbody.appendChild(row);
        });

        // Update aggregate stats
        if (countEl) countEl.innerText = runningCount;
        if (cpuEl) cpuEl.innerText = totalCPU.toFixed(1) + '%';
        if (memEl) memEl.innerText = totalMemory.toFixed(0) + ' MB';
    },

    endProcess(processName) {
        const process = TaskManagerProcesses.find(p => p.name === processName);
        if (!process) return;
        const endedProcesses = this.getTaskManagerEndedProcesses();
        State.achievementProgress.taskmgr_actions = (State.achievementProgress.taskmgr_actions || 0) + 1;

        // Check if already ended
        if (endedProcesses.includes(processName)) {
            ui.log('Process already terminated.');
            return;
        }

        // If not endable but has onAttempt callback
        if (!process.endable && process.onAttempt) {
            process.onAttempt();
            ui.updateTaskManagerList();
            return;
        }

        // If endable
        if (process.endable) {
            endedProcesses.push(processName);

            // Track for achievement ACH-011 (End 10 processes)
            State.achievementProgress.processes_ended = (State.achievementProgress.processes_ended || 0) + 1;

            // Call onEnd callback if exists
            if (process.onEnd) {
                process.onEnd();
            }

            ui.log(`Process "${processName}" terminated.`);
            ui.updateTaskManagerList();
            game.checkAchievements();
        } else {
            ui.log('This process cannot be terminated.');
        }
    },

    // === RECYCLE BIN FUNCTIONS ===
    updateRecycleBinList() {
        const container = document.getElementById('recyclebin-item-list');
        const countEl = document.getElementById('recyclebin-item-count');
        const valueEl = document.getElementById('recyclebin-total-value');

        if (!container) return;

        const items = State.recycleBin.items || [];

        // Update stats
        if (countEl) countEl.innerText = items.length;
        if (valueEl) valueEl.innerText = State.recycleBin.sacrifices.totalValue || 0;

        // If empty, show empty state
        if (items.length === 0) {
            container.innerHTML = `
                <div class="recyclebin-empty-state">
                    <div class="empty-icon"><img src="assets/icons/recyclebin_96.png" alt=""></div>
                    <p>Recycle Bin is empty</p>
                    <small>Deleted items will appear here. You can restore or permanently delete them.</small>
                </div>
            `;
            return;
        }

        // Render items
        container.innerHTML = '';
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recyclebin-item';
            if (item.type === 'patch') itemDiv.classList.add('item-patch');
            if (item.type === 'achievement') itemDiv.classList.add('item-achievement');

            const icon = this.getRecycleBinItemIcon(item.type);

            itemDiv.innerHTML = `
                <div class="item-icon">${icon}</div>
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-desc">${item.description || ''}</div>
                    <div class="item-meta">
                        <span class="item-type">${item.type}</span>
                        ${item.sacrificeValue ? `<span class="item-value">Value: ${item.sacrificeValue}</span>` : ''}
                    </div>
                </div>
                <div class="item-actions">
                    ${item.type === 'patch' ?
                        `<button class="btn-execute-patch" onclick="ui.executeAdversaryPatch('${item.id}')">Execute</button>` :
                        ''}
                    ${item.deletable !== false ?
                        `<button class="btn-restore" onclick="ui.restoreItem('${item.id}')">Restore</button>
                         <button class="btn-delete-permanent" onclick="ui.deleteItemPermanently('${item.id}')">Delete</button>
                         ${item.sacrificeValue ? `<button class="btn-sacrifice" onclick="ui.sacrificeItem('${item.id}')">Sacrifice</button>` : ''}` :
                        '<span class="no-action">Cannot restore</span>'}
                </div>
            `;

            container.appendChild(itemDiv);
        });
    },

    getRecycleBinItemIcon(type) {
        return this.codeStamp(this.binCodes[type] || this.binCodes.other);
    },

    restoreItem(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item) return;

        if (item.deletable === false) {
            ui.log('This item cannot be restored.');
            return;
        }

        // Call restore callback if exists
        if (item.onRestore) {
            item.onRestore();
        }

        // Remove from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log(`Restored: ${item.name}`);
        ui.updateRecycleBinList();
        State.save();
    },

    deleteItemPermanently(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item) return;

        // Confirmation for special items
        if (item.type === 'achievement' || item.type === 'patch') {
            if (!confirm(`Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`)) {
                return;
            }
        }

        // Call delete callback if exists
        if (item.onDelete) {
            item.onDelete();
        }

        // Track for achievements
        if (item.type === 'achievement') {
            State.achievementProgress.delete_achievement_from_recyclebin = (State.achievementProgress.delete_achievement_from_recyclebin || 0) + 1;
        }

        // Remove from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log(`Permanently deleted: ${item.name}`);
        ui.updateRecycleBinList();
        game.checkAchievements();
        State.save();
    },

    sacrificeItem(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item || !item.sacrificeValue) return;

        if (!confirm(`Sacrifice "${item.name}" for +${item.sacrificeValue}% permanent bonus to all production? This is permanent and cannot be undone.`)) {
            return;
        }

        // Apply sacrifice bonus
        const bonusMultiplier = 1 + (item.sacrificeValue / 100);
        State.achievementBonuses.globalGain = (State.achievementBonuses.globalGain || 1) * bonusMultiplier;

        // Update sacrifice stats
        State.recycleBin.sacrifices.totalValue += item.sacrificeValue;
        State.recycleBin.sacrifices.count += 1;

        // Track for achievements
        State.achievementProgress.resources_sacrificed = (State.achievementProgress.resources_sacrificed || 0) + 1;

        // Remove from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log(`Sacrificed ${item.name}. +${item.sacrificeValue}% to all production (permanent).`);
        ui.screenPulse('rgba(138, 43, 226, 0.3)');
        ui.updateRecycleBinList();
        game.checkAchievements();
        State.save();
    },

    emptyRecycleBin() {
        if (State.recycleBin.items.length === 0) {
            ui.log('Recycle Bin is already empty.');
            return;
        }

        if (!confirm(`Are you sure you want to permanently delete all ${State.recycleBin.items.length} items? This cannot be undone.`)) {
            return;
        }

        // Delete all items
        State.recycleBin.items.forEach(item => {
            if (item.onDelete) {
                item.onDelete();
            }
        });

        State.recycleBin.items = [];

        ui.log('Recycle Bin emptied.');
        ui.updateRecycleBinList();
        State.save();
    },

    executeAdversaryPatch(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item || item.type !== 'patch') return;

        if (!confirm(`Execute "${item.name}"? This will apply permanent changes to your reality. This action cannot be undone.`)) {
            return;
        }

        // Apply patch effects based on user's design decision:
        // "Unlock alt prestige path and narrative/relationship change"
        State.adversary.patchExecuted = true;
        State.adversary.relationship = 'disciplined'; // Mark relationship status

        // Unlock alternate prestige path (to be implemented later)
        State.unlockedFeatures = State.unlockedFeatures || [];
        if (!State.unlockedFeatures.includes('cosmic_defrag_alt')) {
            State.unlockedFeatures.push('cosmic_defrag_alt');
        }

        // Change narrative tone - add permanent Adversary presence
        State.adversary.persistent = true;

        // Track for achievements
        State.achievementProgress.execute_adversary_patch = true;

        // Remove patch from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log('[SYSTEM] Patch executed. Reality parameters updated.');
        ui.log('[ADVERSARY] "Good. Now we can begin the real work."');
        ui.screenPulse('rgba(138, 43, 226, 0.5)');

        // Unlock document
        game.unlockDocument('DOC-NEW-14');

        ui.updateRecycleBinList();
        game.checkAchievements();
        State.save();
    },

    // === CASINO HOST BARK DISPLAY ===
    displayHostBark(bark) {
        if (!bark) return;

        // Create bark notification
        const barkDiv = document.createElement('div');
        barkDiv.className = 'host-bark-notification';

        // Special styling for lore whispers
        if (bark.context === 'Lore Whisper') {
            barkDiv.classList.add('lore-whisper');
        }

        barkDiv.innerHTML = `
            <div class="host-bark-icon">${this.codeStamp('CAS')}</div>
            <div class="host-bark-content">
                <div class="host-bark-name">The Host</div>
                <div class="host-bark-text">${bark.text}</div>
            </div>
        `;

        document.body.appendChild(barkDiv);

        // Slide in
        setTimeout(() => barkDiv.classList.add('show'), 10);

        // Click to dismiss
        barkDiv.onclick = () => {
            barkDiv.classList.remove('show');
            setTimeout(() => barkDiv.remove(), 300);
        };

        // Auto-remove after 8 seconds (longer for lore whispers)
        const duration = bark.context === 'Lore Whisper' ? 12000 : 8000;
        setTimeout(() => {
            barkDiv.classList.remove('show');
            setTimeout(() => barkDiv.remove(), 300);
        }, duration);

        // Visual feedback
        if (bark.context === 'Lore Whisper') {
            this.screenPulse('rgba(218, 165, 32, 0.2)');
        }
    },

    // === SETTINGS FUNCTIONS ===
    updateSettingsUI() {
        // Set notation mode dropdown
        const notationSelect = document.getElementById('notation-mode');
        if (notationSelect) {
            notationSelect.value = State.settings.notationMode || 'suffix';
        }

        // Set autosave interval dropdown
        const autosaveSelect = document.getElementById('autosave-interval');
        if (autosaveSelect) {
            autosaveSelect.value = String(State.settings.autosaveInterval || 30000);
        }

        // Set performance mode checkbox
        const perfCheckbox = document.getElementById('performance-mode');
        if (perfCheckbox) {
            perfCheckbox.checked = State.settings.performanceMode || false;
        }
    },

    updateNotationMode(mode) {
        State.settings.notationMode = mode;
        State.save();
        ui.log(`Notation mode changed to ${mode === 'suffix' ? 'Suffix' : 'Scientific'}`);
        // Refresh all displays
        ui.update();
    },

    updateAutosaveInterval(interval) {
        State.settings.autosaveInterval = parseInt(interval);
        State.save();

        // Restart autosave with new interval
        if (typeof setupAutosave === 'function') {
            setupAutosave();
        }

        const seconds = parseInt(interval) / 1000;
        ui.log(`Autosave interval changed to ${seconds}s`);
    },

    togglePerformanceMode(enabled) {
        State.settings.performanceMode = enabled;
        State.save();

        // Apply performance mode to body class for CSS control
        if (enabled) {
            document.body.classList.add('performance-mode');
            ui.log('Performance mode enabled (reduced animations)');
        } else {
            document.body.classList.remove('performance-mode');
            ui.log('Performance mode disabled (full animations)');
        }
    }
};

// Update upgrade affordability styling every second (lightweight)
setInterval(() => {
    ui.updateUpgradesAffordability();
    ui.updateDesktopIcons();
}, 1000);
