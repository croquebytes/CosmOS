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
        this.updateSeraphButton();
        this.updateCherubButton();
        this.updateSkillButtons();
        this.updateDimensionDisplay();
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
            const baseProduction = State.automatons.seraphProduction || 1;
            const praisePerSec = State.pps * baseProduction * State.praiseMultiplier;
            pRate.innerText = this.formatNumber(praisePerSec, 1);
        }
        if (sRate) {
            const baseProduction = State.automatons.cherubProduction || 1;
            const soulPerSec = State.sps * baseProduction * State.soulMultiplier;
            sRate.innerText = this.formatNumber(soulPerSec, 1);
        }
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
        const tierIcons = {
            'Bronze': '🥉',
            'Silver': '🥈',
            'Gold': '🥇',
            'Platinum': '💎',
            'Secret': '❓'
        };
        const tierIcon = tierIcons[achievement.tier] || '⭐';

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

        // Slide in from right
        setTimeout(() => toast.classList.add('show'), 10);

        // Slide out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
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

    initCoreCanvas() {
        const canvas = document.getElementById('core-canvas');
        if (!canvas) {
            console.warn("Core canvas not found during init.");
            return;
        }
        this.ctx = canvas.getContext('2d');
        this.pulse = 0;

        // Add click listener for particle effects
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Spawn 3-5 particles per click
            const count = 3 + Math.floor(Math.random() * 3);
            for (let i = 0; i < count; i++) {
                this.spawnClickParticle(x, y);
            }
        });

        console.log("Core canvas initialized successfully.");
    },

    animateCore() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;

        // Determine colors based on current dimension
        const dim = State.currentDimension || 'primordial';
        let coreColor, particleColor, bgColor;

        if (dim === 'void') {
            coreColor = '#9c27b0';           // Purple
            particleColor = '#ba68c8';       // Light purple
            bgColor = '#0a0010';             // Dark purple-black
        } else {
            coreColor = '#ffd700';           // Gold
            particleColor = '#4a90e2';       // Blue
            bgColor = '#050505';             // Pure black
        }

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Pulse speed based on production
        const productionBoost = dim === 'void' ? State.dimensions.void.dps * 0.01 : State.pps * 0.01;
        this.pulse += 0.05 + productionBoost;
        const radius = 60 + Math.sin(this.pulse) * 15;

        // Draw Divine Pulse (outer ring)
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner glow
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, radius - 10, 0, Math.PI * 2);
        const rgb = dim === 'void' ? '156, 39, 176' : '255, 215, 0';
        ctx.fillStyle = `rgba(${rgb}, 0.2)`;
        ctx.fill();

        // Add orbiting particles
        const particleCount = Math.min(10, Math.floor(productionBoost * 10) + 5);
        for (let i = 0; i < particleCount; i++) {
            const angle = this.pulse * 0.5 + (i * Math.PI * 2 / particleCount);
            const dist = radius + 30 + Math.sin(this.pulse * 0.3) * 10;
            const x = canvas.width / 2 + Math.cos(angle) * dist;
            const y = canvas.height / 2 + Math.sin(angle) * dist;

            // Particle
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = particleColor;
            ctx.fill();

            // Trail
            ctx.beginPath();
            ctx.moveTo(x, y);
            const trailX = canvas.width / 2 + Math.cos(angle - 0.2) * dist;
            const trailY = canvas.height / 2 + Math.sin(angle - 0.2) * dist;
            ctx.lineTo(trailX, trailY);
            const particleRgb = dim === 'void' ? '186, 104, 200' : '74, 144, 226';
            ctx.strokeStyle = `rgba(${particleRgb}, 0.3)`;
            ctx.stroke();
        }

        // Animate click particles
        this.animateClickParticles();
    },

    spawnClickParticle(x, y) {
        // Skip if performance mode is enabled
        if (State.settings?.performanceMode) return;

        // Determine color based on current dimension
        const dim = State.currentDimension || 'primordial';
        const color = dim === 'void' ? '#ba68c8' : '#ffd700';

        const particle = {
            x,
            y,
            vx: (Math.random() - 0.5) * 4,
            vy: -2 - Math.random() * 3,
            life: 1.0,
            size: 3 + Math.random() * 3,
            color
        };

        this.clickParticles.push(particle);

        // Limit particle count (remove oldest if exceeded)
        if (this.clickParticles.length > this.maxParticles) {
            this.clickParticles.shift();
        }
    },

    animateClickParticles() {
        if (!this.ctx || this.clickParticles.length === 0) return;

        const ctx = this.ctx;

        for (let i = this.clickParticles.length - 1; i >= 0; i--) {
            const p = this.clickParticles[i];

            // Update position
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // Gravity
            p.life -= 0.02;

            // Draw particle
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Remove dead particles
            if (p.life <= 0) {
                this.clickParticles.splice(i, 1);
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
                    if (!State.resources[resource] || State.resources[resource] < amount) {
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
                    if (!State.resources[resource] || State.resources[resource] < amount) {
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
                if (!State.resources[resource] || State.resources[resource] < amount) {
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

    updateSeraphButton() {
        const button = document.querySelector('[data-automaton="seraph"]');
        if (button) {
            const cost = game.getSeraphCost();
            button.innerHTML = `Commence Seraphic Automaton (${cost} Praise)`;
        }
    },

    updateCherubButton() {
        const button = document.querySelector('[data-automaton="cherub"]');
        if (button) {
            const cost = game.getCherubCost();
            button.innerHTML = `Compile Cherubic Processor (${cost} Offerings)`;
        }
    },

    updateAchievements() {
        const container = document.getElementById('achievements-list');
        if (!container) return;

        container.innerHTML = '';

        // Group achievements by tier
        const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Secret'];
        const tierIcons = {
            'Bronze': '🥉',
            'Silver': '🥈',
            'Gold': '🥇',
            'Platinum': '💎',
            'Secret': '❓'
        };

        tiers.forEach(tier => {
            const tierAchievements = AchievementList.filter(a => a.tier === tier);
            if (tierAchievements.length === 0) return;

            // Tier header
            const unlockedInTier = tierAchievements.filter(a => State.achievements[a.id]).length;
            const tierHeader = document.createElement('div');
            tierHeader.className = `achievement-tier-header tier-${tier.toLowerCase()}`;
            tierHeader.innerHTML = `
                <span class="tier-icon">${tierIcons[tier]}</span>
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
                    <div class="achievement-icon-large">${isUnlocked ? tierIcons[tier] : '🔒'}</div>
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
        // Create clickable divine event element
        const element = document.createElement('div');
        element.id = 'divine-event';
        element.className = 'divine-event';
        element.style.left = event.x + 'px';
        element.style.top = event.y + 'px';
        element.innerHTML = `
            <div class="divine-event-glow"></div>
            <div class="divine-event-icon">✨</div>
            <div class="divine-event-value">+${event.value}</div>
        `;
        element.onclick = () => game.clickDivineEvent();

        document.body.appendChild(element);
    },

    hideDivineEvent() {
        const element = document.getElementById('divine-event');
        if (element) {
            element.classList.add('fade-out');
            setTimeout(() => element.remove(), 300);
        }
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

    updateMandates() {
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

                // Check if can afford
                const canAfford = State.resources.souls >= mandate.cost;

                // Create mandate node element
                const node = document.createElement('div');
                node.className = 'mandate-node';
                if (isPurchased) node.classList.add('purchased');
                if (!prereqsMet && !isPurchased) node.classList.add('locked');
                if (!canAfford && !isPurchased && prereqsMet) node.classList.add('unaffordable');

                node.innerHTML = `
                    <div class="mandate-name">${mandate.name}</div>
                    <div class="mandate-desc">${mandate.description}</div>
                    <div class="mandate-cost">${isPurchased ? 'ENACTED' : (prereqsMet ? `${mandate.cost} Souls` : 'Prerequisites not met')}</div>
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

                <div class="visual-core">
                    <canvas id="void-core-canvas" width="150" height="150"></canvas>
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
                    <div class="automaton-buy-group">
                        <button class="win-btn void-btn" id="btn-buy-wraith" onclick="game.buyVoidAutomator('wraith', event)">Summon Wraith (10 Darkness)</button>
                        <button class="win-btn void-btn buy-10-btn" onclick="game.buyVoidAutomatorBulk('wraith', 10)">Buy 10</button>
                        <button class="win-btn void-btn buy-max-btn" onclick="game.buyVoidAutomatorBulk('wraith', 'max')">Buy Max</button>
                    </div>
                    <div class="automaton-buy-group">
                        <button class="win-btn void-btn" id="btn-buy-phantom" onclick="game.buyVoidAutomator('phantom', event)">Manifest Phantom (5 Shadows)</button>
                        <button class="win-btn void-btn buy-10-btn" onclick="game.buyVoidAutomatorBulk('phantom', 10)">Buy 10</button>
                        <button class="win-btn void-btn buy-max-btn" onclick="game.buyVoidAutomatorBulk('phantom', 'max')">Buy Max</button>
                    </div>
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

    initVoidCanvas() {
        const canvas = document.getElementById('void-core-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;

        const drawVoidCore = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Dark pulsing void
            const pulse = Math.sin(Date.now() / 500) * 10 + 40;

            // Outer glow
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pulse + 20);
            gradient.addColorStop(0, 'rgba(75, 0, 130, 0.6)');
            gradient.addColorStop(0.5, 'rgba(75, 0, 130, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulse + 20, 0, Math.PI * 2);
            ctx.fill();

            // Core void
            ctx.fillStyle = '#1a0033';
            ctx.beginPath();
            ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
            ctx.fill();

            requestAnimationFrame(drawVoidCore);
        };

        drawVoidCore();
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

            const seraphProd = State.automatons.seraphProduction || 1;
            const cherubProd = State.automatons.cherubProduction || 1;
            const praisePerSec = State.pps * seraphProd * State.praiseMultiplier;
            const soulPerSec = State.sps * cherubProd * State.soulMultiplier;

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

            const wraithProd = vd.automatons.wraithProduction || 1;
            const phantomProd = vd.automatons.phantomProduction || 1;
            const darknessPerSec = vd.dps * wraithProd * vd.darknessMultiplier;
            const echoPerSec = vd.eps * phantomProd * vd.echoMultiplier;

            if (darknessRateEl) darknessRateEl.innerText = this.formatNumber(darknessPerSec, 1);
            if (echoRateEl) echoRateEl.innerText = this.formatNumber(echoPerSec, 1);

            // Update button costs
            const wraithBtn = document.getElementById('btn-buy-wraith');
            const phantomBtn = document.getElementById('btn-buy-phantom');

            if (wraithBtn) {
                const cost = game.getWraithCost();
                wraithBtn.innerText = `Summon Wraith (${this.formatNumber(cost)} Darkness)`;
                wraithBtn.disabled = vd.resources.darkness < cost;
            }

            if (phantomBtn) {
                const cost = game.getPhantomCost();
                phantomBtn.innerText = `Manifest Phantom (${this.formatNumber(cost)} Shadows)`;
                phantomBtn.disabled = vd.resources.shadows < cost;
            }

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
                dimensionsIcon.style.display = 'flex';
            } else {
                dimensionsIcon.style.display = 'none';
            }
        }

        const notepadIcon = document.getElementById('icon-notepad');
        if (notepadIcon) {
            if (State.unlockedApps.includes('notepad')) {
                notepadIcon.style.display = 'flex';
            } else {
                notepadIcon.style.display = 'none';
            }
        }

        const globeIcon = document.getElementById('icon-divineglobe');
        if (globeIcon) {
            if (State.unlockedApps.includes('divineglobe')) {
                globeIcon.style.display = 'flex';
            } else {
                globeIcon.style.display = 'none';
            }
        }

        const callsIcon = document.getElementById('icon-divinecalls');
        if (callsIcon) {
            if (State.unlockedApps.includes('divinecalls')) {
                callsIcon.style.display = 'flex';
            } else {
                callsIcon.style.display = 'none';
            }
        }

        const shopIcon = document.getElementById('icon-adorationshop');
        if (shopIcon) {
            if (State.unlockedApps.includes('adorationshop')) {
                shopIcon.style.display = 'flex';
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
            <div class="doc-notif-icon">📄</div>
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
        const icons = {
            'HR': '👤',
            'Legal': '⚖️',
            'Logs': '📊',
            'Incident': '⚠️',
            'Training': '📚',
            'Memo': '📝',
            'Ad': '📢',
            'Archive': '📦',
            'Casino': '🎰',
            'System': '⚙️',
            'Inbox': '📬'
        };
        return icons[category] || '📄';
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
        const adorationRate = followerData ? followerData.count * followerData.adorationRate : 0;
        if (adorationRateEl) adorationRateEl.innerText = this.formatNumber(adorationRate, 2);

        const adorationEl = document.getElementById('val-adoration');
        const adorationRateMainEl = document.getElementById('val-adoration-rate');
        if (adorationEl) adorationEl.innerText = this.formatNumber(Math.floor(State.adoration));
        if (adorationRateMainEl) {
            let totalRate = 0;
            for (const dim in State.followers) {
                totalRate += State.followers[dim].count * State.followers[dim].adorationRate;
            }
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

        TaskManagerProcesses.forEach(proc => {
            const isRunning = !State.taskmgr.endedProcesses.includes(proc.name);
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

        // Check if already ended
        if (State.taskmgr.endedProcesses.includes(processName)) {
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
            State.taskmgr.endedProcesses.push(processName);

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
                    <div class="empty-icon">🗑️</div>
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
        const icons = {
            'patch': '📦',
            'achievement': '🏆',
            'resource': '💎',
            'automaton': '🤖',
            'document': '📄',
            'other': '📁'
        };
        return icons[type] || icons.other;
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
            <div class="host-bark-icon">🎰</div>
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
