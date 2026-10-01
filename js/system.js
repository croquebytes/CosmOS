const system = {
    windows: {},
    zIndex: 100,
    windowStates: {},
    snapThreshold: 26,

    /* Input is presence. Incidents hold while nobody has touched anything
       for a couple of minutes (js/incidents.js), so every deliberate input
       counts — and pointer movement too, throttled, because reading a ticket
       with the mouse resting on it is attention. Passive listeners only:
       this must never get in the way of the input it is watching. */
    trackPresence() {
        game.presenceTracking = true;
        let lastMove = 0;
        const note = () => game.notePresence(Date.now());
        for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
            document.addEventListener(type, note, { passive: true, capture: true });
        }
        document.addEventListener('pointermove', () => {
            const now = Date.now();
            if (now - lastMove < 1000) return;
            lastMove = now;
            game.notePresence(now);
        }, { passive: true, capture: true });
    },

    init() {
        console.log("CosmOS Initializing...");
        this.trackPresence();
        const offlineReport = game.initializeSession();
        const testMode = new URLSearchParams(window.location.search).has('testMode');
        const bootDelay = testMode ? 0 : 3000;

        /* V1 Cold Boot: a fresh save boots through the reel when one is
           installed, inside the boot overlay. The overlay waits for it (it IS
           the boot) or for a skip; with no reel the promise has settled long
           before the 3s POST is up, so the boot is unchanged. */
        const freshSave = State.totalClicks === 0 && !State.settings.briefingSeen;
        const coldBoot = (!testMode && freshSave && typeof media !== 'undefined')
            ? media.play('cold-boot', { mode: 'blend', host: document.getElementById('boot-overlay') })
            : null;

        setTimeout(() => Promise.resolve(coldBoot).then(() => {
            const boot = document.getElementById('boot-overlay');
            if (boot) boot.style.opacity = '0';
            game.sfx('desktop');
            setTimeout(() => boot?.remove(), testMode ? 0 : 1000);

            setTimeout(() => {
                if (testMode) {
                    this.openApp('console');
                } else if (offlineReport) {
                    ui.showOfflineReport(offlineReport);
                } else if (!State.settings.briefingSeen && State.totalClicks === 0) {
                    ui.showOperatorBriefing();
                }
            }, testMode ? 0 : 900);
        }), bootDelay);

        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
        this.initKeyboardShortcuts();
        this.initDesktopIcons();
        this.renderStartMenu();
        this.updateTaskbar();
        window.addEventListener('resize', () => this.handleViewportResize());
        document.addEventListener('mousedown', (event) => {
            const menu = document.getElementById('start-menu');
            const startButton = document.getElementById('start-button');
            if (menu && !menu.hidden && !menu.contains(event.target) && !startButton?.contains(event.target)) {
                this.toggleStartMenu(false);
            }
        });
        window.addEventListener('beforeunload', () => {
            // hardReset() and importSave() deliberately rewrite localStorage and
            // then reload; without this check the unload save clobbers both.
            if (!State.suppressUnloadSave) State.save();
        });
    },

    appMeta: {
        console: { label: 'Universal Engine', art: 'engine', hint: 'Generate and automate Praise' },
        mandates: { label: 'Divine Mandates', art: 'mandates', hint: 'Spend Divinity Points' },
        dimensions: { label: 'Dimension Explorer', art: 'dimensions', hint: 'Traverse repaired realities' },
        notepad: { label: 'Recovered Documents', art: 'notepad', hint: 'Read unlocked evidence' },
        taskmgr: { label: 'Task Manager', art: 'taskmgr', hint: 'Inspect cosmic processes' },
        recyclebin: { label: 'Recycle Bin', art: 'recyclebin', hint: 'Restore or sacrifice data' },
        divineglobe: { label: 'Divine Globe', art: 'globe', hint: 'Assign prophets' },
        divinecalls: { label: 'Divine Calls', art: 'calls', hint: 'Convert resources' },
        adorationshop: { label: 'Adoration Shop', art: 'shop', hint: 'Acquire persistent utilities' },
        // No authored plaque yet: `glyph` names a CSS-drawn mark instead.
        solitaire: { label: 'Patience.exe', glyph: 'patience', hint: 'Golf solitaire, dealt from the arcana' },
        mediaplayer: { label: 'Sacred Media Player', glyph: 'mediaplayer', hint: 'Operator orientation tapes' },
        settings: { label: 'Divine Settings', art: 'settings', hint: 'Save, prestige, and display' }
    },

    /* The taskbar and Genesis menu reuse the desktop plaques rather than a
       second, unrelated symbol set. */
    appGlyph(id) {
        const glyph = this.appMeta[id]?.glyph;
        if (glyph) return `<span class="app-glyph app-glyph--${glyph}" aria-hidden="true"></span>`;
        const art = this.appMeta[id]?.art;
        if (!art) return '';
        const label = this.appMeta[id]?.label || id;
        return `<img class="app-glyph" src="assets/icons/${art}_96.png" alt="" aria-hidden="true" title="${label}">`;
    },

    initDesktopIcons() {
        document.querySelectorAll('.desktop-icons .icon').forEach((icon) => {
            icon.tabIndex = 0;
            icon.setAttribute('role', 'button');
            icon.addEventListener('keydown', (event) => {
                if (event.code === 'Enter' || event.code === 'Space') {
                    event.preventDefault();
                    icon.click();
                }
            });
        });
    },

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts if typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }

            // Never claim a browser or OS combo. Without this, Cmd/Ctrl+S opens
            // Settings instead of saving, Cmd+C opens the Engine instead of
            // copying, and Cmd+F goes fullscreen instead of opening find.
            // Alt is exempt because Alt+Arrow drives window snapping below.
            if (e.metaKey || e.ctrlKey) {
                return;
            }
            if (e.altKey && !e.code.startsWith('Arrow')) {
                return;
            }

            /* The Adversary scene owns the keyboard while it is up — Space
               must not fire a Miracle behind a blocking modal. But it must not
               own it so completely that a keyboard-only player can never
               ANSWER: swallowing Tab means focus can never reach the three
               choice buttons, and swallowing Enter means a focused button can
               never fire, so Escape (which resolves as DENY) becomes their
               only exit. That is railroading, not a choice. */
            if (ui.isAdversarySceneOpen && ui.isAdversarySceneOpen()) {
                const choices = Array.from(
                    document.querySelectorAll('.adversary-scene .adv-choice'));

                // Trap Tab inside the dialog rather than swallowing it —
                // passing it through would walk focus onto the desktop behind
                // an aria-modal dialog.
                if (e.code === 'Tab' && choices.length) {
                    e.preventDefault();
                    const i = choices.indexOf(document.activeElement);
                    const next = e.shiftKey
                        ? (i <= 0 ? choices.length - 1 : i - 1)
                        : (i === -1 || i === choices.length - 1 ? 0 : i + 1);
                    choices[next].focus();
                    return;
                }

                // Let a focused choice button activate itself — but only once
                // the row is armed, or Space (which this scene teaches as
                // "advance") commits a choice the player never read.
                const onChoice = e.target && e.target.closest && e.target.closest('.adv-choice');
                if (onChoice && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) {
                    if (ui.adversaryChoiceArmed()) return;
                    e.preventDefault();
                    return;
                }

                e.preventDefault();
                if (e.code === 'Escape') { ui.escapeAdversaryScene(); return; }

                // 1/2/3 answer directly, so the choice is reachable even when
                // focus is elsewhere entirely.
                if (choices.length) {
                    const n = { Digit1: 0, Digit2: 1, Digit3: 2,
                                Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
                    if (n !== undefined && choices[n]) {
                        // Goes through the guarded entry point, which refuses
                        // while the row is still arming.
                        const id = ['OP-A', 'OP-B', 'OP-C'][n];
                        ui.adversaryChoiceClicked(id);
                    }
                    return; // never auto-advance past an unanswered choice
                }
                ui.advanceAdversaryScene();
                return;
            }

            /* A stabilisation ritual owns Space and Enter while its Align
               button has focus: the button is the instrument, and a Miracle
               fired from the same key would be noise. Repeats are dropped so
               holding the key cannot machine-gun the needle. */
            const align = e.target && e.target.closest && e.target.closest('.labour-align');
            if (align && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
                e.preventDefault();
                if (!e.repeat) align.click();
                return;
            }

            // Patience.exe claims arrows, Enter and Space while it is on top.
            if (typeof PatienceView !== 'undefined' && PatienceView.handleKey(e, this.getTopWindowId())) {
                return;
            }
            // The Sacred Media Player claims Space and the arrows the same way.
            if (typeof MediaPlayerView !== 'undefined' && MediaPlayerView.handleKey(e, this.getTopWindowId())) {
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
                const menu = document.getElementById('start-menu');
                if (menu && !menu.hidden) {
                    this.toggleStartMenu(false);
                    return;
                }
                this.closeTopWindow();
            }

            // F: Toggle fullscreen
            if (e.code === 'KeyF') {
                e.preventDefault();
                if (document.fullscreenElement) {
                    document.exitFullscreen?.();
                } else {
                    document.documentElement.requestFullscreen?.();
                }
            }

            // Alt + Arrow: Window snap controls for top window
            if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const topWindowId = this.getTopWindowId();
                if (!topWindowId) return;

                if (e.code === 'ArrowLeft') {
                    e.preventDefault();
                    this.snapWindow(topWindowId, 'left');
                } else if (e.code === 'ArrowRight') {
                    e.preventDefault();
                    this.snapWindow(topWindowId, 'right');
                } else if (e.code === 'ArrowUp') {
                    e.preventDefault();
                    this.toggleMaximize(topWindowId);
                }
            }
        });
    },

    renderStartMenu() {
        const container = document.getElementById('start-menu-apps');
        if (!container) return;

        container.innerHTML = '';
        State.unlockedApps.forEach((id) => {
            const meta = this.appMeta[id];
            if (!meta) return;

            const button = document.createElement('button');
            button.className = 'start-menu-action';
            button.type = 'button';
            button.innerHTML = `
                <span class="start-menu-icon">${this.appGlyph(id)}</span>
                <span><strong>${meta.label}</strong><small>${meta.hint}</small></span>
            `;
            button.addEventListener('click', () => {
                this.openApp(id);
                this.toggleStartMenu(false);
            });
            container.appendChild(button);
        });
    },

    toggleStartMenu(forceOpen = null) {
        const menu = document.getElementById('start-menu');
        const button = document.getElementById('start-button');
        if (!menu) return;

        const shouldOpen = forceOpen === null ? menu.hidden : !!forceOpen;
        menu.hidden = !shouldOpen;
        button?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        button?.classList.toggle('pressed', shouldOpen);
        // Lets the CSS drop the (opaque, above-the-scrim) bark layer back
        // below the menu for exactly as long as the menu is up.
        document.body.classList.toggle('start-menu-open', shouldOpen);

        if (shouldOpen) {
            this.renderStartMenu();
            game.sfx('startMenu');
        }
    },

    updateTaskbar() {
        const container = document.getElementById('active-tasks');
        if (!container) return;

        container.innerHTML = '';
        const topWindowId = this.getTopWindowId();

        Object.keys(this.windows).forEach((id) => {
            const meta = this.appMeta[id] || { label: id };
            const button = document.createElement('button');
            button.className = 'taskbar-app';
            button.classList.toggle('active', id === topWindowId);
            button.type = 'button';
            button.title = meta.label;
            button.innerHTML = `<span>${this.appGlyph(id)}</span><span>${meta.label}</span>`;
            button.addEventListener('click', () => this.focusWindow(id));
            container.appendChild(button);
        });
    },

    getTopWindowId() {
        let topWindow = null;
        let maxZ = 0;

        for (const id in this.windows) {
            const win = this.windows[id];
            const z = parseInt(win.style.zIndex, 10) || 0;
            if (z > maxZ) {
                maxZ = z;
                topWindow = id;
            }
        }

        return topWindow;
    },

    closeTopWindow() {
        const topWindow = this.getTopWindowId();
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

    getWorkspaceRect() {
        const taskbar = document.getElementById('taskbar');
        const taskbarHeight = taskbar ? taskbar.offsetHeight : 32;
        return {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: Math.max(200, window.innerHeight - taskbarHeight)
        };
    },

    getDefaultWindowSize(id) {
        const appSizes = {
            console: { width: 690, height: 620 },
            settings: { width: 680, height: 610 },
            mandates: { width: 520, height: 560 },
            dimensions: { width: 640, height: 580 },
            notepad: { width: 820, height: 610 },
            divineglobe: { width: 780, height: 630 },
            divinecalls: { width: 620, height: 520 },
            adorationshop: { width: 650, height: 560 },
            taskmgr: { width: 860, height: 560 },
            recyclebin: { width: 700, height: 560 },
            solitaire: { width: 660, height: 540 },
            mediaplayer: { width: 820, height: 600 }
        };

        return appSizes[id] || { width: 620, height: 560 };
    },

    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    setWindowBounds(win, bounds) {
        win.style.left = `${Math.round(bounds.left)}px`;
        win.style.top = `${Math.round(bounds.top)}px`;
        win.style.width = `${Math.round(bounds.width)}px`;
        win.style.height = `${Math.round(bounds.height)}px`;
    },

    getWindowBounds(win) {
        const rect = win.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
    },

    clampWindowToWorkspace(win) {
        const workspace = this.getWorkspaceRect();
        const rect = this.getWindowBounds(win);

        const minWidth = 320;
        const minHeight = 220;
        const width = this.clamp(rect.width, minWidth, Math.max(minWidth, workspace.width - 8));
        const height = this.clamp(rect.height, minHeight, Math.max(minHeight, workspace.height - 8));
        const left = this.clamp(rect.left, 0, Math.max(0, workspace.width - width));
        const top = this.clamp(rect.top, 0, Math.max(0, workspace.height - height));

        this.setWindowBounds(win, { left, top, width, height });
    },

    cacheNormalBounds(id) {
        const win = this.windows[id];
        if (!win) return;

        this.windowStates[id] = this.windowStates[id] || { mode: 'normal', normalBounds: null };
        this.windowStates[id].normalBounds = this.getWindowBounds(win);
    },

    setWindowMode(id, mode) {
        this.windowStates[id] = this.windowStates[id] || { mode: 'normal', normalBounds: null };
        const changed = this.windowStates[id].mode !== mode;
        if (changed && !this.restoringLayout) game.sfx('windowMode', { mode });
        this.windowStates[id].mode = mode;

        const win = this.windows[id];
        if (!win) return;

        if (mode === 'normal') {
            win.classList.remove('window-snapped');
        } else {
            win.classList.add('window-snapped');
        }

        this.updateWindowControlState(id);
        if (changed) this.rememberLayout(id);
    },

    updateWindowControlState(id) {
        const state = this.windowStates[id];
        const win = this.windows[id];
        if (!state || !win) return;

        const maximizeBtn = win.querySelector('[data-action="maximize"]');
        if (maximizeBtn) {
            maximizeBtn.innerText = state.mode === 'maximized' ? 'N' : 'O';
            maximizeBtn.title = state.mode === 'maximized' ? 'Restore' : 'Maximize';
        }
    },

    /* ── Window layout memory ─────────────────────────────────────────────
       A real desktop puts a window back where you left it. Stored under its
       own key, not in the save: it is a preference about this screen, it
       must survive a hard reset or an imported save, and a malformed save
       must never be able to fling a window off-screen. Written only on a
       deliberate act — drag, resize, snap, maximise — so a viewport
       resize that clamps a window never overwrites where the player put it.
       Read back through the same clamp every window already passes, which
       is the real guarantee; the type checks in readLayout only keep junk
       from ever reaching style.left. */
    LAYOUT_KEY: 'cosmos_window_layout',
    LAYOUT_MODES: ['normal', 'maximized', 'left', 'right'],

    readLayout() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(this.LAYOUT_KEY) || 'null'); } catch { raw = null; }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
        const out = {};
        for (const [id, entry] of Object.entries(raw)) {
            if (!entry || typeof entry !== 'object') continue;
            const nums = ['left', 'top', 'width', 'height'].map((k) => entry[k]);
            if (!nums.every((n) => Number.isFinite(n))) continue;
            if (entry.width < 100 || entry.height < 100) continue;
            out[id] = {
                left: entry.left, top: entry.top, width: entry.width, height: entry.height,
                mode: this.LAYOUT_MODES.includes(entry.mode) ? entry.mode : 'normal',
            };
        }
        return out;
    },

    rememberLayout(id) {
        if (window.innerWidth <= 900 || this.restoringLayout) return;
        const win = this.windows[id];
        const state = this.windowStates[id];
        if (!win || !state) return;
        const bounds = state.mode === 'normal' ? this.getWindowBounds(win) : (state.normalBounds || this.getWindowBounds(win));
        const layout = this.readLayout();
        layout[id] = { ...bounds, mode: state.mode };
        try { localStorage.setItem(this.LAYOUT_KEY, JSON.stringify(layout)); } catch { /* storage full or blocked: forget quietly */ }
    },

    applyInitialWindowLayout(id, win) {
        const workspace = this.getWorkspaceRect();
        const defaultSize = this.getDefaultWindowSize(id);

        if (window.innerWidth <= 900) {
            const mobileBounds = {
                left: 4,
                top: 4,
                width: Math.max(300, workspace.width - 8),
                height: Math.max(220, workspace.height - 8)
            };
            this.setWindowBounds(win, mobileBounds);
            this.windowStates[id] = {
                mode: 'maximized',
                normalBounds: { ...mobileBounds }
            };
            return;
        }

        const saved = this.readLayout()[id];
        if (saved) {
            this.setWindowBounds(win, saved);
            this.clampWindowToWorkspace(win);
            this.windowStates[id] = { mode: 'normal', normalBounds: this.getWindowBounds(win) };
            if (saved.mode !== 'normal') {
                // Re-enter the saved mode without the sound a click would make.
                this.restoringLayout = true;
                try {
                    if (saved.mode === 'maximized') this.toggleMaximize(id, true);
                    else this.snapWindow(id, saved.mode);
                } finally {
                    this.restoringLayout = false;
                }
            }
            return;
        }

        const width = this.clamp(defaultSize.width, 320, Math.max(320, workspace.width - 16));
        const height = this.clamp(defaultSize.height, 220, Math.max(220, workspace.height - 16));
        const cascadeOffset = Object.keys(this.windows).length * 24;
        const left = this.clamp(36 + cascadeOffset, 0, Math.max(0, workspace.width - width));
        const top = this.clamp(30 + cascadeOffset, 0, Math.max(0, workspace.height - height));
        const bounds = { left, top, width, height };

        this.setWindowBounds(win, bounds);
        this.windowStates[id] = {
            mode: 'normal',
            normalBounds: { ...bounds }
        };
    },

    restoreWindow(id) {
        const win = this.windows[id];
        const state = this.windowStates[id];
        if (!win || !state || !state.normalBounds) return;

        this.setWindowBounds(win, state.normalBounds);
        this.setWindowMode(id, 'normal');
        this.clampWindowToWorkspace(win);
    },

    toggleMaximize(id, forceMaximize = false) {
        const win = this.windows[id];
        if (!win) return;

        this.focusWindow(id);
        this.windowStates[id] = this.windowStates[id] || { mode: 'normal', normalBounds: null };
        const state = this.windowStates[id];

        if (state.mode === 'maximized' && !forceMaximize) {
            this.restoreWindow(id);
            return;
        }

        if (state.mode === 'normal' || !state.normalBounds) {
            this.cacheNormalBounds(id);
        }

        const workspace = this.getWorkspaceRect();
        this.setWindowBounds(win, {
            left: 0,
            top: 0,
            width: workspace.width,
            height: workspace.height
        });
        this.setWindowMode(id, 'maximized');
    },

    snapWindow(id, direction) {
        const win = this.windows[id];
        if (!win || !['left', 'right'].includes(direction)) return;

        this.focusWindow(id);
        this.windowStates[id] = this.windowStates[id] || { mode: 'normal', normalBounds: null };
        const state = this.windowStates[id];

        if (state.mode === 'normal' || !state.normalBounds) {
            this.cacheNormalBounds(id);
        }

        const workspace = this.getWorkspaceRect();
        const halfWidth = Math.floor(workspace.width / 2);
        const width = direction === 'left' ? halfWidth : workspace.width - halfWidth;
        const left = direction === 'left' ? 0 : halfWidth;

        this.setWindowBounds(win, {
            left,
            top: 0,
            width,
            height: workspace.height
        });
        this.setWindowMode(id, direction);
    },

    handleViewportResize() {
        for (const id in this.windows) {
            const win = this.windows[id];
            const mode = this.windowStates[id]?.mode || 'normal';

            if (window.innerWidth <= 900) {
                this.toggleMaximize(id, true);
                continue;
            }

            if (mode === 'maximized') {
                this.toggleMaximize(id, true);
            } else if (mode === 'left' || mode === 'right') {
                this.snapWindow(id, mode);
            } else {
                this.clampWindowToWorkspace(win);
                this.cacheNormalBounds(id);
            }
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
        win.style.zIndex = ++this.zIndex;
        win.dataset.appId = id;

        const appConfig = this.getAppConfig(id);

        win.innerHTML = `
            <div class="window-title-bar" onmousedown="system.startDrag(event, '${id}')">
                <div class="window-title">${appConfig.title}</div>
                <div class="window-controls">
                    <button data-action="snap-left" title="Snap Left" onclick="system.snapWindow('${id}', 'left')">&lt;</button>
                    <button data-action="maximize" title="Maximize" onclick="system.toggleMaximize('${id}')">O</button>
                    <button data-action="snap-right" title="Snap Right" onclick="system.snapWindow('${id}', 'right')">&gt;</button>
                    <button onclick="system.closeApp('${id}')">X</button>
                </div>
            </div>
            <div class="window-content app-${id}" id="content-${id}">
                ${appConfig.initialHTML}
            </div>
            <div class="window-resize-handle" title="Resize" onmousedown="system.startResize(event, '${id}')"></div>
        `;

        document.getElementById('window-layer').appendChild(win);
        this.windows[id] = win;
        this.applyInitialWindowLayout(id, win);
        this.updateWindowControlState(id);
        win.addEventListener('mousedown', () => this.focusWindow(id));

        if (appConfig.onOpen) appConfig.onOpen();
        this.updateTaskbar();
        game.sfx('windowOpen');

        /* He has opinions about which windows you open. One table rather than
           five scattered calls, so AdversaryHookedTriggers stays honest. */
        const advTrigger = {
            taskmgr: 'open_taskmgr_after_contact',
            recyclebin: 'open_recycle_bin',
            notepad: 'open_docs_folder',
            settings: 'open_settings',
            /* No `casino:` entry — there is no Casino app. ADV-BARK-04 ("Fate
               is a contractor. I'm in-house.") stays unreachable, along with
               the 80 CasinoHostBarks and 12 lore whispers, until one exists.
               Wiring a trigger to an app id that is never opened would put a
               line in AdversaryHookedTriggers that nothing can fire. */
        }[id];
        if (advTrigger) {
            game.triggerAdversaryBark(advTrigger);
            if (advTrigger === 'open_docs_folder') {
                game.nudgeAdversaryStanding(1, 'read the paperwork');
            }
        }
    },

    closeApp(id) {
        if (this.windows[id]) {
            this.windows[id].remove();
            game.sfx('windowClose');
            delete this.windows[id];
            delete this.windowStates[id];
            this.updateTaskbar();
        }
    },

    focusWindow(id) {
        if (this.windows[id]) {
            this.windows[id].style.zIndex = ++this.zIndex;
            this.updateTaskbar();
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
                                <div id="val-praise" class="stat-value" data-breakdown="cap:praise" tabindex="0">0</div>
                                <div class="stat-rate" data-breakdown="rate:praise" tabindex="0">+<span id="val-praise-rate">0</span>/s</div>
                            </div>
                            <div class="stat-box">
                                <label>OFFERINGS</label>
                                <div id="val-offerings" class="stat-value" data-breakdown="cap:offerings" tabindex="0">0</div>
                                <div class="stat-rate" data-breakdown="rate:offerings" tabindex="0">+<span id="val-offering-rate">0</span>/s</div>
                            </div>
                            <div class="stat-box">
                                <label>SOULS</label>
                                <div id="val-souls" class="stat-value" data-breakdown="cap:souls" tabindex="0">0</div>
                                <div class="stat-rate" data-breakdown="rate:souls" tabindex="0">+<span id="val-soul-rate">0</span>/s</div>
                            </div>
                        </div>
                        <div class="actions">
                            <button class="win-btn divine-btn" onclick="game.manualPraise(event)">Perform Miracle</button>
                            <div id="automaton-list" class="automaton-list"></div>
                        </div>
                        <div class="loop-section">
                            <h3 class="section-title">Active Loops</h3>
                            <div class="loop-grid">
                                <div class="loop-card">
                                    <div class="loop-card-title">Miracle Streak</div>
                                    <div class="loop-value"><span id="loop-streak-count">0</span> chain • <span id="loop-streak-multi">1.00×</span></div>
                                    <div class="loop-meter">
                                        <div class="loop-meter-fill streak-fill" id="loop-streak-fill"></div>
                                    </div>
                                    <div class="loop-meta">Best: <span id="loop-best-streak">0</span></div>
                                </div>
                                <div class="loop-card">
                                    <div class="loop-card-title">Celestial Overclock</div>
                                    <div class="loop-value" id="loop-overclock-status">Charging...</div>
                                    <div class="loop-meter">
                                        <div class="loop-meter-fill overclock-fill" id="loop-overclock-fill"></div>
                                    </div>
                                    <button class="win-btn loop-action-btn" id="btn-overclock" onclick="game.activateOverclock()">Trigger Overclock</button>
                                </div>
                            </div>

                            <div class="directive-card">
                                <div class="directive-header">
                                    <div class="loop-card-title">Divine Directive</div>
                                    <div class="loop-meta">Completed: <span id="directive-completed-count">0</span></div>
                                </div>
                                <div id="directive-title" class="directive-title">Calibrating directive feed...</div>
                                <div class="loop-meter">
                                    <div class="loop-meter-fill directive-fill" id="directive-progress-fill"></div>
                                </div>
                                <div id="directive-progress-text" class="directive-progress-text">0 / 0</div>
                                <div id="directive-reward" class="directive-reward">Reward: --</div>
                                <div class="directive-actions">
                                    <button class="win-btn loop-action-btn" id="btn-claim-directive" onclick="game.claimDirectiveReward()">Claim Reward</button>
                                    <button class="win-btn loop-action-btn" id="btn-reroll-directive" onclick="game.rerollDirective()">Reroll (-10 charge)</button>
                                </div>
                            </div>

                            <div class="loop-footnote">
                                Divine Event Chain: <span id="loop-event-chain">0</span> (Best: <span id="loop-best-event-chain">0</span>)
                            </div>
                        </div>
                        <div class="skills-section">
                            <h3 class="section-title">Divine Powers</h3>
                            <button class="win-btn skill-btn" id="skill-divine-intervention" onclick="game.activateDivineIntervention()">Divine Intervention (2× prod, 10m)</button>
                            <button class="win-btn skill-btn" id="skill-temporal-rift" onclick="game.activateTemporalRift()">Temporal Rift (Simulate 1hr)</button>
                        </div>
                        <div class="reality-section">
                            <h3 class="section-title">Active Reality</h3>
                            <div id="reality-panel" class="reality-panel"></div>
                        </div>
                        <div class="repeatable-section">
                            <h3 class="section-title">Standing Requisitions</h3>
                            <p class="section-note">Filed as often as you can fund them. Storage is what an unattended universe fills.</p>
                            <div id="repeatable-list" class="repeatable-list"></div>
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
                    game.ensureLoopState();
                    game.ensureDirective();
                    ui.updateLoopPanels();
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
                                <div class="stat-line prestige-gain"><strong>Divine Reboot pays:</strong> +<span id="divinity-gain">0</span> Divinity</div>
                                <div class="stat-line prestige-next"><strong>Next point at:</strong> <span id="prestige-next-point">&mdash;</span></div>
                            </div>
                            <div class="stat-line prestige-stability"><strong>Build stability:</strong> <span id="prestige-stability">&mdash;</span></div>
                            <button class="win-btn prestige-btn" id="prestige-button" onclick="ui.openShipDialog()">Ship this build</button>
                            <p class="prestige-description">Cut a release. Resets the run for permanent bonuses, certifies a Mandate path, and files whatever known issues you did not patch.</p>
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

                        <h3>Sound Settings</h3>
                        <div class="audio-settings">
                            <div class="setting-row">
                                <label for="audio-master">Master Volume:</label>
                                <span class="setting-checkbox-spacer" aria-hidden="true"></span>
                                <input type="range" id="audio-master" class="setting-range" min="0" max="100" step="1" value="70" oninput="audio.setVolume('master', this.value / 100)">
                                <span class="setting-value" id="audio-master-value">70%</span>
                            </div>
                            <div class="setting-row">
                                <label for="audio-sfx">System Sounds:</label>
                                <input type="checkbox" id="audio-sfx-enabled" class="setting-checkbox" checked aria-label="System sounds enabled" onchange="audio.setEnabled('sfx', this.checked)">
                                <input type="range" id="audio-sfx" class="setting-range" min="0" max="100" step="1" value="80" oninput="audio.setVolume('sfx', this.value / 100)">
                                <span class="setting-value" id="audio-sfx-value">80%</span>
                            </div>
                            <div class="setting-row">
                                <label for="audio-ambient">Ambient Hum:</label>
                                <input type="checkbox" id="audio-ambient-enabled" class="setting-checkbox" checked aria-label="Ambient hum enabled" onchange="audio.setEnabled('ambient', this.checked)">
                                <input type="range" id="audio-ambient" class="setting-range" min="0" max="100" step="1" value="35" oninput="audio.setVolume('ambient', this.value / 100)">
                                <span class="setting-value" id="audio-ambient-value">35%</span>
                            </div>
                            <div class="setting-row">
                                <label for="audio-muted">Mute All:</label>
                                <input type="checkbox" id="audio-muted" class="setting-checkbox" onchange="audio.setMuted(this.checked)">
                                <span class="setting-desc" id="audio-status">Standing by for your first action.</span>
                            </div>
                        </div>

                        <h3>Cinematics</h3>
                        <div class="media-settings">
                            <div class="setting-row">
                                <label for="media-cinematics">Cinematics:</label>
                                <select id="media-cinematics" class="setting-select" onchange="media.setCinematics(this.value)">
                                    <option value="first">First time only</option>
                                    <option value="always">Always</option>
                                    <option value="off">Off</option>
                                </select>
                                <span class="setting-desc" id="media-seen">0 of 4 reels seen</span>
                            </div>
                            <div class="setting-row">
                                <label for="media-vhs">VHS Treatment:</label>
                                <input type="checkbox" id="media-vhs" class="setting-checkbox" checked onchange="media.setVhs(this.checked)">
                                <span class="setting-desc">Scanlines and tracking on training tapes. Reels not yet installed are skipped.</span>
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
                            <button class="win-btn danger-btn" onclick="game.hardReset()">Hard Reset (Delete All)</button>
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
                        <div id="mandate-certification" class="certification-panel"></div>
                        <div id="mandate-doctrine" class="doctrine-panel"></div>

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
                                    <div class="empty-icon"><img src="assets/icons/notepad_96.png" alt=""></div>
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
                        // NULL.OPERATOR's archive annotations are documents too.
                        countDisplay.innerText = State.documents.collected.length +
                            (game.archiveDocuments?.() || []).length;
                    }
                    ui.renderDocumentList('all');
                    const firstCollectedDocument = DocumentManifest.find(doc =>
                        State.documents.collected.includes(doc.id)
                    );
                    if (firstCollectedDocument) {
                        ui.viewDocument(firstCollectedDocument.id);
                    }
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

                        <section id="taskmgr-incidents" class="taskmgr-incidents" aria-live="polite" hidden></section>

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
                            <strong class="code-stamp is-alarm">WARNING</strong> Terminating system processes may cause instability, data corruption, or existential dread.
                        </div>
                    </div>
                `,
                onOpen: () => {
                    // Track for achievement
                    State.achievementProgress.open_taskmgr = (State.achievementProgress.open_taskmgr || 0) + 1;
                    State.taskManager.openCount = (State.taskManager.openCount || 0) + 1;
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
                                <div class="empty-icon"><img src="assets/icons/recyclebin_96.png" alt=""></div>
                                <p>Recycle Bin is empty</p>
                                <small>Deleted items will appear here. You can restore or permanently delete them.</small>
                            </div>
                        </div>

                        <div class="recyclebin-info">
                            <p><strong class="code-stamp is-alarm">WARNING</strong> Permanently deleted items cannot be restored.</p>
                            <p><strong class="code-stamp">NOTE</strong> Sacrifice resources for permanent bonuses.</p>
                        </div>
                    </div>
                `,
                onOpen: () => {
                    State.recycleBin.opened = true;
                    State.achievementProgress.open_recyclebin = (State.achievementProgress.open_recyclebin || 0) + 1;
                    ui.updateRecycleBinList();
                }
            },

            'solitaire': {
                title: 'Patience.exe - Celestial Arcana',
                initialHTML: `<div class="patience" id="patience-root"></div>`,
                onOpen: () => PatienceView.open()
            },
            'mediaplayer': {
                title: 'Sacred Media Player',
                initialHTML: `<div class="mplayer" id="mplayer-root"></div>`,
                onOpen: () => MediaPlayerView.open()
            }
        };
        return configs[id] || { title: 'Unknown App', initialHTML: 'ERROR' };
    },

    startDrag(e, id) {
        const win = this.windows[id];
        if (!win) return;
        e.preventDefault();

        // Ignore drags started from control buttons.
        if (e.target.closest('.window-controls')) {
            return;
        }

        this.focusWindow(id);

        this.windowStates[id] = this.windowStates[id] || { mode: 'normal', normalBounds: null };
        const state = this.windowStates[id];

        // Dragging a snapped/maximized window first restores it to normal bounds.
        if (state.mode !== 'normal' && state.normalBounds) {
            this.setWindowBounds(win, state.normalBounds);
            this.setWindowMode(id, 'normal');
        }

        const startRect = this.getWindowBounds(win);
        const offsetX = e.clientX - startRect.left;
        const offsetY = e.clientY - startRect.top;
        document.body.classList.add('dragging-window');

        const dragMove = (moveEvent) => {
            const workspace = this.getWorkspaceRect();
            const width = win.getBoundingClientRect().width;
            const height = win.getBoundingClientRect().height;
            const nextLeft = this.clamp(moveEvent.clientX - offsetX, 0, Math.max(0, workspace.width - width));
            const nextTop = this.clamp(moveEvent.clientY - offsetY, 0, Math.max(0, workspace.height - height));
            win.style.left = `${Math.round(nextLeft)}px`;
            win.style.top = `${Math.round(nextTop)}px`;
        };

        const stopDrag = (upEvent) => {
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('mouseup', stopDrag);
            document.body.classList.remove('dragging-window');

            const workspace = this.getWorkspaceRect();
            const clientX = upEvent.clientX;
            const clientY = upEvent.clientY;

            if (clientY <= (workspace.top + this.snapThreshold)) {
                this.toggleMaximize(id, true);
                return;
            }
            if (clientX <= (workspace.left + this.snapThreshold)) {
                this.snapWindow(id, 'left');
                return;
            }
            if (clientX >= (workspace.left + workspace.width - this.snapThreshold)) {
                this.snapWindow(id, 'right');
                return;
            }

            this.setWindowMode(id, 'normal');
            this.clampWindowToWorkspace(win);
            this.cacheNormalBounds(id);
            this.rememberLayout(id);
        };

        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', stopDrag);
    },

    startResize(e, id) {
        const win = this.windows[id];
        if (!win) return;
        e.preventDefault();

        this.focusWindow(id);
        this.windowStates[id] = this.windowStates[id] || { mode: 'normal', normalBounds: null };
        const state = this.windowStates[id];

        if (state.mode !== 'normal' && state.normalBounds) {
            this.setWindowBounds(win, state.normalBounds);
            this.setWindowMode(id, 'normal');
        }

        const startRect = this.getWindowBounds(win);
        const startX = e.clientX;
        const startY = e.clientY;
        const minWidth = 320;
        const minHeight = 220;
        document.body.classList.add('resizing-window');

        const resizeMove = (moveEvent) => {
            const workspace = this.getWorkspaceRect();
            const width = this.clamp(startRect.width + (moveEvent.clientX - startX), minWidth, workspace.width - startRect.left);
            const height = this.clamp(startRect.height + (moveEvent.clientY - startY), minHeight, workspace.height - startRect.top);
            win.style.width = `${Math.round(width)}px`;
            win.style.height = `${Math.round(height)}px`;
        };

        const stopResize = () => {
            document.removeEventListener('mousemove', resizeMove);
            document.removeEventListener('mouseup', stopResize);
            document.body.classList.remove('resizing-window');
            this.clampWindowToWorkspace(win);
            this.cacheNormalBounds(id);
            this.rememberLayout(id);
            this.setWindowMode(id, 'normal');
        };

        document.addEventListener('mousemove', resizeMove);
        document.addEventListener('mouseup', stopResize);
    }
};

window.onload = () => system.init();
