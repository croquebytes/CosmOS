const system = {
    windows: {},
    zIndex: 100,

    init() {
        console.log("CosmOS Initializing...");
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
                            </div>
                            <div class="stat-box">
                                <label>OFFERINGS</label>
                                <div id="val-offerings" class="stat-value">0</div>
                            </div>
                        </div>
                        <div class="actions">
                            <button class="win-btn divine-btn" onclick="game.manualPraise()">Perform Miracle</button>
                            <button class="win-btn" onclick="game.buyAutomator('seraph')">Commence Seraphic Automaton (10 Praise)</button>
                        </div>
                        <div id="engine-log">Connecting to Divine Stream...</div>
                    </div>
                `,
                onOpen: () => {
                    ui.syncResources();
                    ui.initCoreCanvas();
                }
            },
            'settings': {
                title: 'Divine Settings',
                initialHTML: `
                    <div>
                        <h3>System Restoration</h3>
                        <button class="win-btn" onclick="State.save()">Force Auto-Save</button>
                        <button class="win-btn" onclick="localStorage.clear(); location.reload()">Reset Universe</button>
                    </div>
                `
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
