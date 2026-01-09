const system = {
    windows: {},
    zIndex: 100,

    init() {
        console.log("CosmOS Initializing...");
        State.load();
        setTimeout(() => {
            const boot = document.getElementById('boot-overlay');
            if (boot) boot.style.opacity = '0';
            setTimeout(() => boot?.remove(), 1000);
        }, 3000);

        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    },

    updateClock() {
        const span = document.getElementById('epoch-time');
        if (span) {
            const now = Date.now();
            const diff = (now - State.startTime) / 1000;
            span.innerText = `Epoch ${diff.toFixed(1)}`;
        }
    },

    openApp(id) {
        if (this.windows[id]) {
            this.focusWindow(id);
            return;
        }

        const win = document.createElement('div');
        win.className = 'window';
        win.id = `win-${id}`;
        win.style.left = '100px';
        win.style.top = '100px';
        win.style.zIndex = ++this.zIndex;

        const appConfig = this.getAppConfig(id);

        win.innerHTML = `
            <div class="window-title-bar" onmousedown="system.startDrag(event, '${id}')">
                <div class="window-title">${appConfig.title}</div>
                <div class="window-controls">
                    <button onclick="system.closeApp('${id}')">X</button>
                </div>
            </div>
            <div class="window-content app-${id}" id="content-${id}">
                ${appConfig.initialHTML}
            </div>
        `;

        document.getElementById('window-layer').appendChild(win);
        this.windows[id] = win;

        if (appConfig.onOpen) appConfig.onOpen();
    },

    closeApp(id) {
        if (this.windows[id]) {
            this.windows[id].remove();
            delete this.windows[id];
        }
    },

    focusWindow(id) {
        if (this.windows[id]) {
            this.windows[id].style.zIndex = ++this.zIndex;
        }
    },

    getAppConfig(id) {
        const configs = {
            'console': {
                title: 'Universal Engine Console',
                initialHTML: `
                    <div class="engine-display">
                        <div class="header-status">
                            <span class="glow-text">SYSTEM STATUS: NOMINAL</span>
                            <span class="uptime">UPTIME: <span id="val-uptime">0</span></span>
                        </div>
                        <div class="visual-core">
                            <canvas id="core-canvas" width="200" height="200"></canvas>
                        </div>
                        <div class="resource-panel">
                            <div class="stat-box">
                                <label>PRAISE</label>
                                <div id="val-praise" class="stat-value">0</div>
                                <div class="stat-rate">+<span id="val-praise-rate">0</span>/s</div>
                            </div>
                            <div class="stat-box">
                                <label>OFFERINGS</label>
                                <div id="val-offerings" class="stat-value">0</div>
                            </div>
                            <div class="stat-box">
                                <label>SOULS</label>
                                <div id="val-souls" class="stat-value">0</div>
                                <div class="stat-rate">+<span id="val-soul-rate">0</span>/s</div>
                            </div>
                        </div>
                        <div class="actions">
                            <button class="win-btn divine-btn" onclick="game.manualPraise(event)">Perform Miracle</button>
                            <button class="win-btn" data-automaton="seraph" onclick="game.buyAutomator('seraph', event)">Commence Seraphic Automaton (10 Praise)</button>
                            <button class="win-btn" data-automaton="cherub" onclick="game.buyAutomator('cherub', event)">Compile Cherubic Processor (5 Offerings)</button>
                        </div>
                        <div class="skills-section">
                            <h3 class="section-title">Divine Powers</h3>
                            <button class="win-btn skill-btn" id="skill-divine-intervention" onclick="game.activateDivineIntervention()">Divine Intervention (2× prod, 10m)</button>
                            <button class="win-btn skill-btn" id="skill-temporal-rift" onclick="game.activateTemporalRift()">Temporal Rift (Simulate 1hr)</button>
                        </div>
                        <div class="upgrades-section">
                            <h3 class="section-title">Divine Upgrades</h3>
                            <div id="upgrades-list" class="upgrades-container"></div>
                        </div>
                        <div id="engine-log">Connecting to Divine Stream...</div>
                    </div>
                `,
                onOpen: () => {
                    ui.syncResources();
                    ui.initCoreCanvas();
                    ui.updateUpgrades();
                    ui.updateSeraphButton();
                    ui.updateCherubButton();
                }
            },
            'settings': {
                title: 'Divine Settings',
                initialHTML: `
                    <div class="settings-panel">
                        <h3>Divine Reboot (Prestige)</h3>
                        <div class="prestige-section">
                            <div class="prestige-info">
                                <div class="stat-line"><strong>Prestige Level:</strong> <span id="prestige-level">0</span></div>
                                <div class="stat-line"><strong>Total Divinity Points:</strong> <span id="divinity-points">0</span></div>
                                <div class="stat-line"><strong>Current Bonus:</strong> +<span id="prestige-bonus">0</span>%</div>
                                <div class="stat-line prestige-gain"><strong>Next Prestige:</strong> +<span id="divinity-gain">0</span> Divinity Points</div>
                            </div>
                            <button class="win-btn prestige-btn" id="prestige-button" onclick="game.performPrestige()">Divine Reboot</button>
                            <p class="prestige-description">Reset progress to gain permanent bonuses. Keeps Mandates, Achievements, and Documents.</p>
                        </div>

                        <h3>System Restoration</h3>
                        <button class="win-btn" onclick="State.save()">Force Auto-Save</button>
                        <button class="win-btn" onclick="if(confirm('Reset all progress?')) {localStorage.clear(); location.reload();}">Reset Universe</button>

                        <h3 class="achievements-header">Divine Achievements</h3>
                        <div id="achievements-list" class="achievements-container"></div>

                        <h3>Statistics</h3>
                        <div class="stats-display">
                            <div class="stat-line"><strong>Total Clicks:</strong> <span id="stat-clicks">0</span></div>
                            <div class="stat-line"><strong>Total Praise Earned:</strong> <span id="stat-praise">0</span></div>
                            <div class="stat-line"><strong>Achievements:</strong> <span id="stat-achievements">0/15</span></div>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    ui.updateAchievements();
                    ui.updateStats();
                    ui.updatePrestigeInfo();
                }
            },
            'mandates': {
                title: 'Divine Mandates',
                initialHTML: `
                    <div class="mandates-panel">
                        <h3>Path of Creation</h3>
                        <div id="mandate-creation" class="mandate-branch"></div>

                        <h3>Path of Maintenance</h3>
                        <div id="mandate-maintenance" class="mandate-branch"></div>

                        <h3>Path of Entropy</h3>
                        <div id="mandate-entropy" class="mandate-branch"></div>
                    </div>
                `,
                onOpen: () => {
                    ui.updateMandates();
                }
            },
            'dimensions': {
                title: 'Dimension Explorer',
                initialHTML: `
                    <div class="dimensions-panel">
                        <div class="dimension-tabs">
                            <button class="dimension-tab active" id="tab-primordial" onclick="ui.switchDimension('primordial')">Primordial Sector</button>
                            <button class="dimension-tab" id="tab-void" onclick="ui.switchDimension('void')">Void Dimension</button>
                        </div>

                        <div id="dimension-content" class="dimension-content">
                            <!-- Dynamically populated based on current dimension -->
                        </div>
                    </div>
                `,
                onOpen: () => {
                    ui.renderDimensionContent();
                }
            },
            'notepad': {
                title: 'Notepad - Recovered Documents',
                initialHTML: `
                    <div class="notepad-panel">
                        <div class="document-sidebar">
                            <h3>Documents</h3>
                            <div id="document-list" class="document-list"></div>
                        </div>
                        <div class="document-viewer">
                            <div id="document-title" class="document-title">Select a document</div>
                            <div id="document-content" class="document-content">
                                <em>No document selected.</em>
                            </div>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    ui.renderDocumentList();
                }
            }
        };
        return configs[id] || { title: 'Unknown App', initialHTML: 'ERROR' };
    },

    startDrag(e, id) {
        const win = this.windows[id];
        this.focusWindow(id);

        let pos1 = 0, pos2 = 0, pos3 = e.clientX, pos4 = e.clientY;

        const dragMove = (e) => {
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            win.style.top = (win.offsetTop - pos2) + "px";
            win.style.left = (win.offsetLeft - pos1) + "px";
        };

        const stopDrag = () => {
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('mouseup', stopDrag);
        };

        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', stopDrag);
    }
};

window.onload = () => system.init();
