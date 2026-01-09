const ui = {
    // Store previous values for animation
    previousValues: {
        praise: 0,
        offerings: 0,
        souls: 0
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
                p.innerText = `${current.toLocaleString()} / ${cap.toLocaleString()}`;
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
            o.innerText = `${current.toLocaleString()} / ${cap.toLocaleString()}`;

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
            s.innerText = `${current.toLocaleString()} / ${cap.toLocaleString()}`;

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
            u.innerText = Math.floor((Date.now() - State.startTime) / 1000) + "s";
        }
        if (pRate) {
            const baseProduction = State.automatons.seraphProduction || 1;
            const praisePerSec = State.pps * baseProduction * State.praiseMultiplier;
            pRate.innerText = praisePerSec.toFixed(1);
        }
        if (sRate) {
            const baseProduction = State.automatons.cherubProduction || 1;
            const soulPerSec = State.sps * baseProduction * State.soulMultiplier;
            sRate.innerText = soulPerSec.toFixed(1);
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
                const final = cap ? `${Math.floor(to).toLocaleString()} / ${cap.toLocaleString()}` : Math.floor(to).toLocaleString();
                element.innerText = final;
                clearInterval(interval);
            } else {
                const display = cap ? `${Math.floor(current).toLocaleString()} / ${cap.toLocaleString()}` : Math.floor(current).toLocaleString();
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
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-content">
                <div class="achievement-title">Achievement Unlocked!</div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-desc">${achievement.description}</div>
            </div>
        `;

        document.body.appendChild(toast);

        // Slide in from right
        setTimeout(() => toast.classList.add('show'), 10);

        // Slide out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 5000);

        // Screen pulse
        this.screenPulse('rgba(255, 215, 0, 0.15)');
    },

    initCoreCanvas() {
        const canvas = document.getElementById('core-canvas');
        if (!canvas) {
            console.warn("Core canvas not found during init.");
            return;
        }
        this.ctx = canvas.getContext('2d');
        this.pulse = 0;
        console.log("Core canvas initialized successfully.");
    },

    animateCore() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;

        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.pulse += 0.05 + (State.pps * 0.01);
        const radius = 60 + Math.sin(this.pulse) * 15;

        // Draw Divine Pulse
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, radius - 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
        ctx.fill();

        // Add orbiting particles
        for (let i = 0; i < 5; i++) {
            const angle = this.pulse * 0.5 + (i * Math.PI * 2 / 5);
            const dist = radius + 30 + Math.sin(this.pulse * 0.3) * 10;
            const x = canvas.width / 2 + Math.cos(angle) * dist;
            const y = canvas.height / 2 + Math.sin(angle) * dist;

            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#4a90e2';
            ctx.fill();

            // Trail
            ctx.beginPath();
            ctx.moveTo(x, y);
            const trailX = canvas.width / 2 + Math.cos(angle - 0.2) * dist;
            const trailY = canvas.height / 2 + Math.sin(angle - 0.2) * dist;
            ctx.lineTo(trailX, trailY);
            ctx.strokeStyle = 'rgba(74, 144, 226, 0.3)';
            ctx.stroke();
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

        AchievementList.forEach(achievement => {
            const isUnlocked = State.achievements[achievement.id];

            const div = document.createElement('div');
            div.className = 'achievement-item';
            if (isUnlocked) div.classList.add('unlocked');

            div.innerHTML = `
                <div class="achievement-icon-large">${isUnlocked ? achievement.icon : '🔒'}</div>
                <div class="achievement-info">
                    <div class="achievement-name">${isUnlocked ? achievement.name : '???'}</div>
                    <div class="achievement-desc">${isUnlocked ? achievement.description : 'Locked achievement'}</div>
                </div>
            `;

            container.appendChild(div);
        });
    },

    updateStats() {
        const clicksEl = document.getElementById('stat-clicks');
        const praiseEl = document.getElementById('stat-praise');
        const achievementsEl = document.getElementById('stat-achievements');

        if (clicksEl) clicksEl.innerText = State.totalClicks.toLocaleString();
        if (praiseEl) praiseEl.innerText = Math.floor(State.totalPraiseEarned).toLocaleString();
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
                    <button class="win-btn void-btn" id="btn-buy-wraith" onclick="game.buyVoidAutomator('wraith', event)">Summon Wraith (10 Darkness)</button>
                    <button class="win-btn void-btn" id="btn-buy-phantom" onclick="game.buyVoidAutomator('phantom', event)">Manifest Phantom (5 Shadows)</button>
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

            if (praiseEl) praiseEl.innerText = `${Math.floor(State.resources.praise)} / ${State.resourceCaps.praise}`;
            if (offeringsEl) offeringsEl.innerText = `${Math.floor(State.resources.offerings)} / ${State.resourceCaps.offerings}`;
            if (soulsEl) soulsEl.innerText = `${Math.floor(State.resources.souls)} / ${State.resourceCaps.souls}`;

            const seraphProd = State.automatons.seraphProduction || 1;
            const cherubProd = State.automatons.cherubProduction || 1;
            const praisePerSec = State.pps * seraphProd * State.praiseMultiplier;
            const soulPerSec = State.sps * cherubProd * State.soulMultiplier;

            if (praiseRateEl) praiseRateEl.innerText = praisePerSec.toFixed(1);
            if (soulRateEl) soulRateEl.innerText = soulPerSec.toFixed(1);

            // Update automaton counts
            const seraphCountEl = document.getElementById('dim-seraph-count');
            const cherubCountEl = document.getElementById('dim-cherub-count');
            const seraphProdEl = document.getElementById('dim-seraph-prod');
            const cherubProdEl = document.getElementById('dim-cherub-prod');

            if (seraphCountEl) seraphCountEl.innerText = State.automatons.seraphCount;
            if (cherubCountEl) cherubCountEl.innerText = State.automatons.cherubCount;
            if (seraphProdEl) seraphProdEl.innerText = praisePerSec.toFixed(1);
            if (cherubProdEl) cherubProdEl.innerText = soulPerSec.toFixed(1);

        } else if (dim === 'void') {
            if (!State.dimensions.void.unlocked) return;

            const vd = State.dimensions.void;

            // Update void resources
            const darknessEl = document.getElementById('dim-val-darkness');
            const shadowsEl = document.getElementById('dim-val-shadows');
            const echoesEl = document.getElementById('dim-val-echoes');
            const darknessRateEl = document.getElementById('dim-val-darkness-rate');
            const echoRateEl = document.getElementById('dim-val-echo-rate');

            if (darknessEl) darknessEl.innerText = `${Math.floor(vd.resources.darkness)} / ${vd.resourceCaps.darkness}`;
            if (shadowsEl) shadowsEl.innerText = `${Math.floor(vd.resources.shadows)} / ${vd.resourceCaps.shadows}`;
            if (echoesEl) echoesEl.innerText = `${Math.floor(vd.resources.echoes)} / ${vd.resourceCaps.echoes}`;

            const wraithProd = vd.automatons.wraithProduction || 1;
            const phantomProd = vd.automatons.phantomProduction || 1;
            const darknessPerSec = vd.dps * wraithProd * vd.darknessMultiplier;
            const echoPerSec = vd.eps * phantomProd * vd.echoMultiplier;

            if (darknessRateEl) darknessRateEl.innerText = darknessPerSec.toFixed(1);
            if (echoRateEl) echoRateEl.innerText = echoPerSec.toFixed(1);

            // Update button costs
            const wraithBtn = document.getElementById('btn-buy-wraith');
            const phantomBtn = document.getElementById('btn-buy-phantom');

            if (wraithBtn) {
                const cost = game.getWraithCost();
                wraithBtn.innerText = `Summon Wraith (${cost} Darkness)`;
                wraithBtn.disabled = vd.resources.darkness < cost;
            }

            if (phantomBtn) {
                const cost = game.getPhantomCost();
                phantomBtn.innerText = `Manifest Phantom (${cost} Shadows)`;
                phantomBtn.disabled = vd.resources.shadows < cost;
            }

            // Update automaton counts
            const wraithCountEl = document.getElementById('dim-wraith-count');
            const phantomCountEl = document.getElementById('dim-phantom-count');
            const wraithProdEl = document.getElementById('dim-wraith-prod');
            const phantomProdEl = document.getElementById('dim-phantom-prod');

            if (wraithCountEl) wraithCountEl.innerText = vd.automatons.wraithCount;
            if (phantomCountEl) phantomCountEl.innerText = vd.automatons.phantomCount;
            if (wraithProdEl) wraithProdEl.innerText = darknessPerSec.toFixed(1);
            if (phantomProdEl) phantomProdEl.innerText = echoPerSec.toFixed(1);
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
    },

    renderDocumentList() {
        const listContainer = document.getElementById('document-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Get unlocked documents
        const unlockedDocs = DocumentList.filter(doc => State.unlockedDocuments.includes(doc.id));

        if (unlockedDocs.length === 0) {
            listContainer.innerHTML = '<div class="no-documents">No documents found.</div>';
            return;
        }

        unlockedDocs.forEach(doc => {
            const item = document.createElement('div');
            item.className = 'document-item';
            item.innerText = doc.title;
            item.onclick = () => this.viewDocument(doc.id);
            listContainer.appendChild(item);
        });
    },

    viewDocument(docId) {
        const doc = DocumentList.find(d => d.id === docId);
        if (!doc) return;

        const titleEl = document.getElementById('document-title');
        const contentEl = document.getElementById('document-content');

        if (titleEl) titleEl.innerText = doc.title;
        if (contentEl) {
            contentEl.innerHTML = `<pre>${doc.content}</pre>`;
        }

        // Update selected styling
        document.querySelectorAll('.document-item').forEach(item => {
            item.classList.remove('selected');
            if (item.innerText === doc.title) {
                item.classList.add('selected');
            }
        });
    },

    updatePrestigeInfo() {
        const levelEl = document.getElementById('prestige-level');
        const pointsEl = document.getElementById('divinity-points');
        const bonusEl = document.getElementById('prestige-bonus');
        const gainEl = document.getElementById('divinity-gain');
        const buttonEl = document.getElementById('prestige-button');

        if (levelEl) levelEl.innerText = State.prestigeLevel;
        if (pointsEl) pointsEl.innerText = State.totalDivinityPoints;
        if (bonusEl) bonusEl.innerText = ((State.divinityPointMultiplier - 1) * 100).toFixed(0);

        const divinityGain = game.calculateDivinityPoints();
        if (gainEl) {
            gainEl.innerText = divinityGain;
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
    }
};

// Update upgrade affordability styling every second (lightweight)
setInterval(() => {
    ui.updateUpgradesAffordability();
    ui.updateDesktopIcons();
}, 1000);
