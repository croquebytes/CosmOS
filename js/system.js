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
        this.initKeyboardShortcuts();
    },

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts if typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Space: Perform Miracle
            if (e.code === 'Space') {
                e.preventDefault();
                game.manualPraise(null);
            }

            // M: Open Divine Mandates
            if (e.code === 'KeyM') {
                e.preventDefault();
                this.openApp('mandates');
            }

            // D: Open Dimensions
            if (e.code === 'KeyD') {
                e.preventDefault();
                if (State.unlockedApps.includes('dimensions')) {
                    this.openApp('dimensions');
                }
            }

            // S: Open Settings
            if (e.code === 'KeyS') {
                e.preventDefault();
                this.openApp('settings');
            }

            // C: Open Console (Universal Engine)
            if (e.code === 'KeyC') {
                e.preventDefault();
                this.openApp('console');
            }

            // N: Open Notepad
            if (e.code === 'KeyN') {
                e.preventDefault();
                if (State.unlockedApps.includes('notepad')) {
                    this.openApp('notepad');
                }
            }

            // Escape: Close top window
            if (e.code === 'Escape') {
                e.preventDefault();
                this.closeTopWindow();
            }
        });
    },

    closeTopWindow() {
        // Find the window with highest z-index
        let topWindow = null;
        let maxZ = 0;

        for (const id in this.windows) {
            const win = this.windows[id];
            const z = parseInt(win.style.zIndex) || 0;
            if (z > maxZ) {
                maxZ = z;
                topWindow = id;
            }
        }

        if (topWindow) {
            this.closeApp(topWindow);
        }
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
                            <div class="automaton-buy-group">
                                <button class="win-btn" data-automaton="seraph" onclick="game.buyAutomator('seraph', event)">Seraphic Automaton (10 Praise)</button>
                                <button class="win-btn buy-10-btn" onclick="game.buyAutomatorBulk('seraph', 10)">Buy 10</button>
                                <button class="win-btn buy-max-btn" onclick="game.buyAutomatorBulk('seraph', 'max')">Buy Max</button>
                            </div>
                            <div class="automaton-buy-group">
                                <button class="win-btn" data-automaton="cherub" onclick="game.buyAutomator('cherub', event)">Cherubic Processor (5 Offerings)</button>
                                <button class="win-btn buy-10-btn" onclick="game.buyAutomatorBulk('cherub', 10)">Buy 10</button>
                                <button class="win-btn buy-max-btn" onclick="game.buyAutomatorBulk('cherub', 'max')">Buy Max</button>
                            </div>
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

                        <h3>Save Management</h3>
                        <div class="save-management">
                            <div class="save-section">
                                <label>Export Save (Share/Backup)</label>
                                <textarea id="export-save-text" class="save-textarea" readonly placeholder="Click Export to generate save code"></textarea>
                                <button class="win-btn" onclick="game.exportSave()">Export Save</button>
                            </div>
                            <div class="save-section">
                                <label>Import Save (Restore from Code)</label>
                                <textarea id="import-save-text" class="save-textarea" placeholder="Paste save code here"></textarea>
                                <button class="win-btn" onclick="game.importSave()">Import Save</button>
                            </div>
                        </div>

                        <h3>Display Settings</h3>
                        <div class="display-settings">
                            <div class="setting-row">
                                <label>Notation Mode:</label>
                                <select id="notation-mode" class="setting-select" onchange="ui.updateNotationMode(this.value)">
                                    <option value="suffix">Suffix (1.5M, 2.3B)</option>
                                    <option value="scientific">Scientific (1.50e6, 2.30e9)</option>
                                </select>
                            </div>
                        </div>

                        <h3>Performance Settings</h3>
                        <div class="performance-settings">
                            <div class="setting-row">
                                <label>Autosave Interval:</label>
                                <select id="autosave-interval" class="setting-select" onchange="ui.updateAutosaveInterval(this.value)">
                                    <option value="15000">15 seconds</option>
                                    <option value="30000" selected>30 seconds</option>
                                    <option value="60000">1 minute</option>
                                    <option value="120000">2 minutes</option>
                                    <option value="300000">5 minutes</option>
                                </select>
                            </div>
                            <div class="setting-row">
                                <label>Performance Mode:</label>
                                <input type="checkbox" id="performance-mode" class="setting-checkbox" onchange="ui.togglePerformanceMode(this.checked)">
                                <span class="setting-desc">Reduce animations for better performance</span>
                            </div>
                        </div>

                        <h3>System Restoration</h3>
                        <div class="system-actions">
                            <button class="win-btn" onclick="State.save()">Force Auto-Save</button>
                            <button class="win-btn danger-btn" onclick="game.hardReset()">⚠️ Hard Reset (Delete All)</button>
                        </div>

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
                    ui.updateSettingsUI();
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
                            <div class="sidebar-header">
                                <h3>Documents</h3>
                                <div class="doc-count"><span id="doc-count-display">0</span> collected</div>
                            </div>

                            <div class="doc-category-tabs">
                                <button class="doc-category-tab active" data-category="all" onclick="ui.switchDocumentCategory('all')">All</button>
                                <button class="doc-category-tab" data-category="HR" onclick="ui.switchDocumentCategory('HR')">HR</button>
                                <button class="doc-category-tab" data-category="Legal" onclick="ui.switchDocumentCategory('Legal')">Legal</button>
                                <button class="doc-category-tab" data-category="Logs" onclick="ui.switchDocumentCategory('Logs')">Logs</button>
                                <button class="doc-category-tab" data-category="Incident" onclick="ui.switchDocumentCategory('Incident')">Incident</button>
                                <button class="doc-category-tab" data-category="Training" onclick="ui.switchDocumentCategory('Training')">Training</button>
                                <button class="doc-category-tab" data-category="Memo" onclick="ui.switchDocumentCategory('Memo')">Memo</button>
                                <button class="doc-category-tab" data-category="Ad" onclick="ui.switchDocumentCategory('Ad')">Ad</button>
                                <button class="doc-category-tab" data-category="Archive" onclick="ui.switchDocumentCategory('Archive')">Archive</button>
                                <button class="doc-category-tab" data-category="Casino" onclick="ui.switchDocumentCategory('Casino')">Casino</button>
                                <button class="doc-category-tab" data-category="System" onclick="ui.switchDocumentCategory('System')">System</button>
                                <button class="doc-category-tab" data-category="Inbox" onclick="ui.switchDocumentCategory('Inbox')">Inbox</button>
                            </div>

                            <div id="document-list" class="document-list"></div>
                        </div>

                        <div class="document-viewer">
                            <div id="document-title" class="document-title">Select a document</div>
                            <div id="document-meta" class="document-meta"></div>
                            <div id="document-content" class="document-content">
                                <div class="empty-state">
                                    <div class="empty-icon">📄</div>
                                    <p>No document selected.</p>
                                    <p class="empty-hint">Select a document from the sidebar to view its contents.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    // Update document count
                    const countDisplay = document.getElementById('doc-count-display');
                    if (countDisplay) {
                        countDisplay.innerText = State.documents.collected.length;
                    }
                    ui.renderDocumentList('all');
                }
            },
            'divinecalls': {
                title: 'Divine Calls - Resource Conversion',
                initialHTML: `
                    <div class="divine-calls-panel">
                        <h3>Answer Divine Calls</h3>
                        <p class="calls-description">Convert resources into Adoration, the meta-currency of faith.</p>

                        <div class="adoration-display">
                            <div class="stat-box adoration-stat">
                                <label>ADORATION</label>
                                <div id="val-adoration" class="stat-value">0</div>
                                <div class="stat-rate">+<span id="val-adoration-rate">0</span>/s</div>
                            </div>
                        </div>

                        <div class="calls-list">
                            <div class="call-item">
                                <div class="call-name">Offering Conversion</div>
                                <div class="call-desc">Convert 100 Offerings → 1 Adoration</div>
                                <button class="win-btn" id="btn-convert-offerings" onclick="game.answerCall('offerings')">Convert Offerings</button>
                                <div class="call-cooldown" id="cooldown-offerings">Ready</div>
                            </div>
                            <div class="call-item">
                                <div class="call-name">Soul Conversion</div>
                                <div class="call-desc">Convert 10 Souls → 1 Adoration</div>
                                <button class="win-btn" id="btn-convert-souls" onclick="game.answerCall('souls')">Convert Souls</button>
                                <div class="call-cooldown" id="cooldown-souls">Ready</div>
                            </div>
                        </div>

                        <div class="calls-note">
                            <em>Divine Calls have a 5-minute cooldown shared across all conversions.</em>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    ui.updateDivineCallsDisplay();
                }
            },
            'divineglobe': {
                title: 'Divine Globe - Prophet Management',
                initialHTML: `
                    <div class="globe-panel">
                        <div class="globe-container">
                            <canvas id="globe-canvas" width="400" height="400"></canvas>
                        </div>

                        <div class="globe-info">
                            <h3 id="globe-dim-name">Select a Dimension</h3>
                            <div class="globe-stats">
                                <div class="stat-line"><strong>Prophets Assigned:</strong> <span id="globe-prophets-assigned">0</span></div>
                                <div class="stat-line"><strong>Prophets Available:</strong> <span id="globe-prophets-available">0</span></div>
                                <div class="stat-line"><strong>Followers:</strong> <span id="globe-followers">0</span></div>
                                <div class="stat-line"><strong>Adoration Rate:</strong> <span id="globe-adoration-rate">0</span>/s</div>
                            </div>
                            <div class="globe-controls">
                                <button class="win-btn" onclick="game.assignProphet(1)">Assign +1 Prophet</button>
                                <button class="win-btn" onclick="game.assignProphet(-1)">Recall -1 Prophet</button>
                            </div>
                        </div>

                        <div class="timeline-selector">
                            <button class="win-btn timeline-btn active" id="timeline-present" onclick="ui.switchTimeline('present')">Present</button>
                            <button class="win-btn timeline-btn locked" id="timeline-past" onclick="ui.switchTimeline('past')" disabled>Past (Locked)</button>
                            <button class="win-btn timeline-btn locked" id="timeline-future" onclick="ui.switchTimeline('future')" disabled>Future (Locked)</button>
                        </div>

                        <div class="feeding-section">
                            <h3>Feed Prophets (Temporary Boost)</h3>
                            <div class="feeding-controls">
                                <button class="win-btn" onclick="game.feedProphets('praise', 100)">Feed 100 Praise (+10% growth, 5m)</button>
                                <button class="win-btn" onclick="game.feedProphets('offerings', 50)">Feed 50 Offerings (+20% growth, 5m)</button>
                                <button class="win-btn" onclick="game.feedProphets('souls', 10)">Feed 10 Souls (+50% growth, 10m)</button>
                            </div>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    ui.initGlobeCanvas();
                    ui.selectGlobeDimension('primordial');
                    ui.updateGlobeDisplay();
                }
            },
            'adorationshop': {
                title: 'Adoration Shop',
                initialHTML: `
                    <div class="shop-panel">
                        <div class="shop-header">
                            <div class="stat-box adoration-stat">
                                <label>ADORATION</label>
                                <div id="shop-adoration" class="stat-value">0</div>
                            </div>
                        </div>

                        <div class="shop-tabs">
                            <button class="shop-tab active" onclick="ui.switchShopTab('cosmetics', event)">Cosmetics</button>
                            <button class="shop-tab" onclick="ui.switchShopTab('utilities', event)">Utilities</button>
                            <button class="shop-tab" onclick="ui.switchShopTab('prophets', event)">Prophet Upgrades</button>
                            <button class="shop-tab" onclick="ui.switchShopTab('minigames', event)">Mini-Games</button>
                        </div>

                        <div id="shop-content" class="shop-content">
                            <!-- Dynamically populated -->
                        </div>

                        <div class="shop-note">
                            <em>Adoration is earned passively from Followers managed by Prophets.</em>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    ui.renderShopContent('cosmetics');
                }
            },
            'taskmgr': {
                title: 'Task Manager - CosmOS™ Processes',
                initialHTML: `
                    <div class="taskmgr-panel">
                        <div class="taskmgr-header">
                            <div class="taskmgr-stats">
                                <span class="taskmgr-stat">Processes: <strong id="taskmgr-process-count">0</strong></span>
                                <span class="taskmgr-stat">CPU Usage: <strong id="taskmgr-cpu-total">0%</strong></span>
                                <span class="taskmgr-stat">Memory: <strong id="taskmgr-mem-total">0 MB</strong></span>
                            </div>
                        </div>

                        <div class="taskmgr-table-container">
                            <table class="taskmgr-table">
                                <thead>
                                    <tr>
                                        <th>Process Name</th>
                                        <th>CPU</th>
                                        <th>Memory</th>
                                        <th>Status</th>
                                        <th>Description</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody id="taskmgr-process-list">
                                    <!-- Dynamically populated -->
                                </tbody>
                            </table>
                        </div>

                        <div class="taskmgr-warning">
                            <strong>⚠️ WARNING:</strong> Terminating system processes may cause instability, data corruption, or existential dread.
                        </div>
                    </div>
                `,
                onOpen: () => {
                    // Track for achievement
                    State.achievementProgress.open_taskmgr = (State.achievementProgress.open_taskmgr || 0) + 1;
                    ui.updateTaskManagerList();
                }
            },

            'recyclebin': {
                title: 'Recycle Bin - Deleted Items',
                initialHTML: `
                    <div class="recyclebin-panel">
                        <div class="recyclebin-header">
                            <div class="recyclebin-stats">
                                <span class="recyclebin-stat">Items: <strong id="recyclebin-item-count">0</strong></span>
                                <span class="recyclebin-stat">Total Sacrifice Value: <strong id="recyclebin-total-value">0</strong></span>
                            </div>
                            <div class="recyclebin-actions">
                                <button class="btn-empty-bin" onclick="ui.emptyRecycleBin()">Empty Recycle Bin</button>
                            </div>
                        </div>

                        <div class="recyclebin-content" id="recyclebin-item-list">
                            <div class="recyclebin-empty-state">
                                <div class="empty-icon">🗑️</div>
                                <p>Recycle Bin is empty</p>
                                <small>Deleted items will appear here. You can restore or permanently delete them.</small>
                            </div>
                        </div>

                        <div class="recyclebin-info">
                            <p><strong>⚠️ WARNING:</strong> Permanently deleted items cannot be restored.</p>
                            <p><strong>💡 TIP:</strong> Sacrifice resources for permanent bonuses.</p>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    State.recycleBin.opened = true;
                    State.achievementProgress.open_recyclebin = (State.achievementProgress.open_recyclebin || 0) + 1;
                    ui.updateRecycleBinList();
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
