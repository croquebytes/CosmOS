/* ════════════════════════════════════════════════════════════════════════
   DevTools — the CMS Field Engineer's kit.

   A tester's tool. On a fresh save the apps unlock one at a time and every
   cinematic plays once; whoever is iterating needs to see all of it quickly.
   This file lives in Divine Settings as a maintenance panel, drives the game
   through the same functions the game uses, and is NOT FOR PRODUCTION:

     - It is the only file that knows any of this. `npm run build:release`
       (vite build --mode release) leaves it out of dist/ and takes its
       <script> tag out of index.html; the settings app mounts the panel only
       when `typeof DevTools !== 'undefined'`. tests/release-build.mjs holds
       that line.
     - The panel shows on localhost / 127.0.0.1 / [::1], or with ?dev=1 (which
       then holds for the tab). Elsewhere a dev build loads the file and does
       nothing at all.
     - Anything that edits the run sets State.dev.tainted. The save carries
       it, a small DEV mark is painted on the desktop, and a balance or
       achievement report from that save should be discounted.
     - Nothing is scheduled while the panel is closed: no timers, no frames.
       The meter and the inspector ride the shared Heartbeat while their
       group is open, and let go when it closes.

   Layout: helpers, then `actions` (state work only, callable with no DOM —
   tests/devtools.mjs drives them in a vm), then the panel, then URL params.
   Wrapped in an IIFE: a top-level name here that another script also
   declares would throw "already declared" and kill the whole file.

   Shareable links: ?dev=1&unlockAll=1&reboot=12&cinematics=always — see
   PARAMS below for the full list.
   ════════════════════════════════════════════════════════════════════════ */
const DevTools = (() => {
    'use strict';

    const SLOTS_KEY = 'cosmos_dev_slots';
    const TAB_KEY = 'cosmos_dev_tab';
    const SLOT_IDS = ['A', 'B', 'C'];
    const UNDO_SLOT = 'Z';
    const SNAPSHOT_PREFIX = 'COSMOS-DEV1:';
    const DAY_MS = 24 * 60 * 60 * 1000;
    const ATTENDED_STEP = 5;                       // Incidents.tick ignores any dt above 5 s
    const ALL_APPS = ['console', 'settings', 'mandates', 'dimensions', 'notepad', 'taskmgr', 'recyclebin',
        'divineglobe', 'divinecalls', 'adorationshop', 'solitaire', 'mediaplayer', 'choir', 'mail', 'etherscape'];
    const CAP_TARGETS = ['caps.praise', 'caps.offerings', 'caps.souls',
        'void.caps.darkness', 'void.caps.shadows', 'void.caps.echoes'];
    const STANDINGS = { hostile: -4, curious: 0, complicit: 4 };
    const MIRROR_CHOICES = { A: 'OP-A', B: 'OP-B', C: 'OP-C' };
    const PRESETS = {
        beta: { reboot: 3, label: 'Beta channel (reboot 3)' },
        nightly: { reboot: 8, label: 'Nightly channel (reboot 8)' },
        archived: { reboot: 12, label: 'Archived channel (reboot 12)' },
        ending: { reboot: 14, label: 'Ending gate (reboot 14 and an archived ship)' },
    };
    const INCIDENT_TEMPLATES = ['choir_desync', 'hymnal_checksum', 'requisition_backlog', 'miracle_ratelimit',
        'heartbeat_lost', 'altar_overflow', 'conduit_pressure', 'reliquary_misfile', 'soul_tagging',
        'dominion_audit', 'anomaly_flood', 'wraith_unbound', 'revenant_hunger', 'phantom_echo'];
    const SYNTH_OPTS = {
        windowMode: { mode: 'maximize' }, miracle: { streak: 3 }, incident: { severity: 1 },
        achievement: { tier: 'Gold' }, cascade: { tier: 2 },
    };
    // Toasts and dialogs that a batch action would otherwise stack up.
    const QUIET_UI = ['showDocumentNotification', 'showAchievementToast', 'showReleaseNotes'];

    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function'
        && typeof document.getElementById === 'function';
    const hooks = {
        // Swapped by the vm suite; the page uses these as they stand.
        reload: ({ dropTestMode = false } = {}) => {
            if (typeof location === 'undefined') return;
            if (!dropTestMode) { location.reload(); return; }
            const url = new URL(location.href);
            url.searchParams.delete('testMode');
            location.replace(url.toString());
        },
    };
    const reports = [];                            // newest last; tests and the status line read these
    let presenceMode = 'auto';
    let realIsPresent = null;

    /* ── helpers ──────────────────────────────────────────────────────── */

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const need = (condition, message) => { if (!condition) throw new Error(message); };
    const esc = (value) => (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function')
        ? ui.escapeHtml(value)
        : String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const safely = (fn) => { try { return fn(); } catch (err) { return undefined; } };
    const $ = (id) => (hasDOM ? document.getElementById(id) : null);
    const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
    const epochSeconds = (now) => {
        const start = Number(State.startTime);
        return Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
    };

    /* Stub named ui methods for the length of `fn`, so a batch does not stack
       fifty toasts. Restores whatever it replaced, including on a throw. */
    function quietly(fn, names = QUIET_UI) {
        const saved = {};
        for (const name of names) {
            if (typeof ui !== 'undefined' && ui && typeof ui[name] === 'function') {
                saved[name] = ui[name];
                ui[name] = () => {};
            }
        }
        try { return fn(); } finally { for (const name of Object.keys(saved)) ui[name] = saved[name]; }
    }

    function say(text, tone = 'ok') {
        const report = { text: String(text), tone, at: Date.now() };
        reports.push(report);
        if (reports.length > 40) reports.shift();
        const line = $('dev-status');
        if (line) {
            line.textContent = report.text;
            line.dataset.tone = tone;
        }
        if (tone === 'error' && typeof console !== 'undefined') console.warn(`[DevTools] ${report.text}`);
        return report;
    }

    /* Every edit goes through here: taint first (so even a failed action
       leaves the mark — the run may be half-edited), then the work, a full
       refresh, and a save. */
    function markTainted() {
        if (typeof State === 'undefined') return;
        if (!State.dev || typeof State.dev !== 'object') State.dev = { tainted: false, actions: 0, since: 0 };
        if (!State.dev.tainted) {
            State.dev.tainted = true;
            State.dev.since = Date.now();
        }
        State.dev.actions = (Number(State.dev.actions) || 0) + 1;
        renderTaint();
    }

    function refreshWorld() {
        safely(() => Modifiers.commit(Date.now()));
        safely(() => { ui.lastPanelRefresh = 0; });
        safely(() => ui.refreshAll());
        safely(() => ui.updateDesktopIcons());
        safely(() => system.renderStartMenu());
        safely(() => ui.updateUpgrades());
        safely(() => ui.updateMandates());
        safely(() => ui.renderDimensionContent());
        safely(() => ui.updateAchievements());
        safely(() => ui.updateStats());
        safely(() => ui.updatePrestigeInfo());
        safely(() => ui.renderRealityPanel());
    }

    function act(label, fn, { save = true, taint = true } = {}) {
        try {
            if (taint) markTainted();
            const message = fn();
            refreshWorld();
            if (save) State.save();
            return { ok: true, report: say(message ? `${label}: ${message}` : `${label}: done.`) };
        } catch (err) {
            safely(refreshWorld);
            return { ok: false, error: err.message, report: say(`${label}: ${err.message}`, 'error') };
        }
    }

    /* ── gate ─────────────────────────────────────────────────────────── */

    const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

    function currentLocation() { return typeof location !== 'undefined' ? location : null; }

    function enabled(loc = currentLocation()) {
        if (!loc) return false;
        if (LOCAL_HOSTS.includes(loc.hostname)) return true;
        try {
            if (new URLSearchParams(loc.search || '').get('dev') === '1') {
                safely(() => sessionStorage.setItem(TAB_KEY, '1'));
                return true;
            }
        } catch (err) { /* no URLSearchParams: not a page */ }
        return safely(() => sessionStorage.getItem(TAB_KEY) === '1') === true;
    }

    /* ── actions: state work only ─────────────────────────────────────── */

    const actions = {};

    /* 1. Unlock everything. */

    function ensureApps(ids = ALL_APPS) {
        const added = [];
        for (const id of ids) {
            if (!State.unlockedApps.includes(id)) { State.unlockedApps.push(id); added.push(id); }
        }
        return added;
    }

    function deliverMail(ids) {
        need(typeof Mail !== 'undefined' && typeof MailLogic !== 'undefined', 'CMS Mail is not loaded.');
        const mail = Mail.state();
        const now = Date.now();
        const stamp = [Number(State.prestigeLevel) || 0, epochSeconds(now), mail.clock];
        const list = ids === 'all' ? MailCatalog.messages.map((m) => m.id) : ids;
        const delivered = MailLogic.deliver(mail, list, stamp);
        if (delivered.length) {
            ensureApps(['mail']);
            safely(() => ui.updateDesktopIcons());
            safely(() => Mail.syncChrome());
            safely(() => MailView.onDelivered(delivered));
        }
        return delivered;
    }

    function findReels(ids) {
        const footage = Footage.state();
        let found = 0;
        for (const id of ids) if (FootageLogic.find(footage, id)) found++;
        return found;
    }

    function fileChoirWelcome() {
        // Choir's welcome post, which the app files itself when it installs.
        const choir = Choir.state();
        if (!choir.posts.some((post) => post.id === 'welcome')) {
            const now = Date.now();
            choir.posts.push({ id: 'welcome', k: 'welcome', r: Number(State.prestigeLevel) || 0, x: {}, c: 0, at: now, ep: epochSeconds(now), b: 0 });
        }
    }

    actions.setCinematics = (mode) => act('Cinematics', () => {
        need(['first', 'always', 'off'].includes(mode), `unknown mode "${mode}"`);
        media.setCinematics(mode);
        return `set to ${mode}.`;
    });

    actions.unlockEverything = () => act('Unlock everything', () => {
        const tally = [];
        State.settings.briefingSeen = true;
        State.dimensions.void.unlocked = true;
        if (!(State.prophets && State.prophets.total > 0)) State.prophets = { ...(State.prophets || {}), total: 1, available: 1 };
        if (State.adorationShop && State.adorationShop.minigames) State.adorationShop.minigames.minigame_solitaire = true;
        const apps = ensureApps();
        tally.push(`${apps.length} apps`);

        let docs = 0;
        quietly(() => { for (const doc of DocumentManifest) if (game.unlockDocument(doc.id)) docs++; });
        tally.push(`${docs} documents`);

        const tapes = media.settings();
        let filed = 0;
        for (const tape of MediaCatalog.tapes) if (!tapes.tapes.includes(tape.id)) { tapes.tapes.push(tape.id); filed++; }
        media.settings();
        safely(() => MediaPlayerView.onTapesChanged());
        tally.push(`${filed} tapes`);

        tally.push(`${findReels(FootageCatalog.reels.map((reel) => reel.id))} reels found`);
        const omni = deliverMail(MailCatalog.messages.filter((m) => m.from === 'retired' && /^omni-/.test(m.id)).map((m) => m.id));
        tally.push(`${omni.length} Omniscient mails`);

        if (typeof Choir !== 'undefined') fileChoirWelcome();
        if (typeof Etherscape !== 'undefined') safely(() => Etherscape.ensureApp());
        media.setCinematics('always');
        return `${tally.join(', ')}; Cinematics: Always.`;
    });

    /* 3. Jump in progression. */

    actions.fillResources = () => act('Fill resources', () => {
        Modifiers.commit(Date.now());
        for (const key of Object.keys(State.resources)) {
            if (Number.isFinite(State.resourceCaps[key])) State.resources[key] = State.resourceCaps[key];
        }
        const void_ = State.dimensions.void;
        for (const key of Object.keys(void_.resources || {})) {
            if (Number.isFinite(void_.resourceCaps && void_.resourceCaps[key])) void_.resources[key] = void_.resourceCaps[key];
        }
        return 'every resource at its cap.';
    });

    /* Caps belong to the modifier registry: a direct write is overwritten at
       the next commit. A permanent record survives a reboot; dropSource
       undoes it. Set, not stacked — asking for ×10 twice is still ×10. */
    actions.raiseCaps = (factor) => act('Caps', () => {
        const n = Number(factor);
        need(Number.isFinite(n) && n >= 1, 'factor must be 1 or more');
        Modifiers.dropSource('dev', 'cap');
        if (n > 1) {
            for (const target of CAP_TARGETS) {
                Modifiers.add({
                    id: `dev:cap:${target}`, target, op: 'mul', value: n, scope: 'permanent',
                    source: { kind: 'dev', id: 'cap' }, label: `DEV ×${n} cap`,
                });
            }
        }
        Modifiers.commit(Date.now());
        if (n > 1) {
            for (const key of Object.keys(State.resources)) {
                if (Number.isFinite(State.resourceCaps[key])) State.resources[key] = State.resourceCaps[key];
            }
        }
        return n > 1 ? `every cap ×${n}, resources filled.` : 'dev caps removed.';
    });

    actions.addDivinity = (points) => act('Divinity', () => {
        const n = Math.floor(Number(points));
        need(Number.isFinite(n) && n !== 0, 'give a whole number of points');
        State.totalDivinityPoints = Math.max(0, (Number(State.totalDivinityPoints) || 0) + n);
        // Recomputed only inside performPrestige, so keep it in step by hand.
        State.divinityPointMultiplier = 1 +
            Math.pow(State.totalDivinityPoints, Economy.prestigeBonusExponent) * Economy.prestigeBonusScale;
        Modifiers.commit(Date.now());
        return `${n > 0 ? '+' : ''}${n}, now ${State.totalDivinityPoints} total.`;
    });

    /* A real ship, repeated: the supported fixture. Each run is `bars` reboot
       bars deep, stated in the bar's own units (never raw Souls), and each
       ship is asserted to have happened. */
    function shipCore(count, { bars = 3, certifyOn = 'creation' } = {}) {
        let shipped = 0;
        quietly(() => {
            for (let i = 0; i < count; i++) {
                const before = State.prestigeLevel;
                State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * bars;
                game.performPrestige({ confirmed: true, certifyOn });
                need(State.prestigeLevel === before + 1, `the ship from reboot ${before} did not happen`);
                safely(() => ui.dismissSystemModal());
                shipped++;
            }
        });
        return shipped;
    }

    actions.shipBuilds = (count, options) => act('Ship builds', () => {
        const n = Math.floor(Number(count));
        need(Number.isFinite(n) && n >= 1 && n <= 60, 'ship between 1 and 60 builds');
        if (options && options.mirror) resolveMirror(options.mirror);
        const shipped = shipCore(n, options);
        return `shipped ${shipped}; now reboot ${State.prestigeLevel}.`;
    });

    function resolveMirror(choice) {
        const id = MIRROR_CHOICES[String(choice).toUpperCase()] || 'OP-B';
        if (!State.adversary.sceneCompleted) quietly(() => game.resolveAdversaryChoice(id));
    }

    function applyStanding(band) {
        need(Object.prototype.hasOwnProperty.call(STANDINGS, band), `unknown band "${band}"`);
        State.adversary.standing = STANDINGS[band];
    }

    function climbTo(level, options) {
        const need_ = level - State.prestigeLevel;
        if (need_ > 0) shipCore(need_, options);
        return State.prestigeLevel;
    }

    /* Reboot 12 opens Archived; shipping into a replay is 13, shipping the
       replay is 14 — the first archived ship. (The handoff's "13 + an
       archived ship" is not a state play can reach.) The gate also wants a
       day-old save, the Mirror Login done, and a band. */
    function reachEndingGate(band = 'curious', options) {
        need(Object.prototype.hasOwnProperty.call(STANDINGS, band), `unknown band "${band}"`);
        resolveMirror(options && options.mirror);
        climbTo(Math.max(12, State.prestigeLevel), options);
        if ((State.endings.archivedShips || 0) < 1) {
            need(game.archiveUnlocked(), 'the archive is not open');
            const builds = game.archivedBuilds();
            need(builds.length > 0, 'the archive has nothing to replay');
            need(game.selectArchivedBuild(builds[builds.length - 1].reboot), 'could not pick an archived build');
            shipCore(1, options);
            need(State.reality.build && State.reality.build.channel === 'archived', 'the run is not a replay');
            shipCore(1, options);
        }
        State.runtime.startTime = Math.min(Number(State.runtime.startTime) || Date.now(), Date.now() - 2 * DAY_MS);
        applyStanding(band);
        return game.finaleBlocker();
    }

    actions.preset = (name, options = {}) => act(`Preset ${name}`, () => {
        const preset = PRESETS[name];
        need(preset, `unknown preset "${name}"`);
        if (options.mirror) resolveMirror(options.mirror);
        if (name === 'ending') {
            const blocker = reachEndingGate(options.band || 'curious', options);
            return blocker ? `reboot ${State.prestigeLevel}; the finale gate is still shut (${blocker}).`
                : `reboot ${State.prestigeLevel}; the finale gate is open.`;
        }
        need(State.prestigeLevel <= preset.reboot, `already past reboot ${preset.reboot} (at ${State.prestigeLevel}) — reset to a fresh save first`);
        climbTo(preset.reboot, options);
        return `reboot ${State.prestigeLevel}.`;
    });

    actions.rebootTo = (level, options = {}) => act('Reboot to', () => {
        const n = Math.floor(Number(level));
        need(Number.isFinite(n) && n >= 0 && n <= 60, 'level between 0 and 60');
        need(n >= State.prestigeLevel, `already at reboot ${State.prestigeLevel}; a run cannot be un-shipped — reset to a fresh save first`);
        if (options.mirror) resolveMirror(options.mirror);
        climbTo(n, options);
        return `now reboot ${State.prestigeLevel}.`;
    });

    /* 4. Time and presence. */

    actions.setPresence = (mode) => act('Presence', () => {
        need(['auto', 'away', 'present'].includes(mode), `unknown presence "${mode}"`);
        if (mode === 'auto') {
            if (realIsPresent) { game.isPresent = realIsPresent; realIsPresent = null; }
        } else {
            if (!realIsPresent) realIsPresent = game.isPresent;
            game.isPresent = () => mode === 'present';
        }
        presenceMode = mode;
        safely(() => Incidents.setPresence(game.isPresent(Date.now()), Date.now()));
        renderPresence();
        return mode === 'auto' ? 'back to real input.' : `forced ${mode}.`;
    }, { taint: true });

    /* Attended play, stepped at 5 s because Incidents.tick ignores any larger
       step. The simulated clock ENDS at the real one, so nothing stamped
       during it lies in the future (skill cooldowns, panel refresh). */
    actions.advanceAttended = (hours) => act('Attended time', () => {
        const h = Number(hours);
        need(Number.isFinite(h) && h > 0 && h <= 24, 'hours between 0 and 24');
        const steps = Math.round((h * 3600) / ATTENDED_STEP);
        const end = Date.now();
        let sim = end - steps * ATTENDED_STEP * 1000;
        quietly(() => {
            for (let i = 0; i < steps; i++) {
                sim += ATTENDED_STEP * 1000;
                if (presenceMode !== 'away') game.notePresence(sim);
                game.tick(ATTENDED_STEP, sim);
                if (i % 12 === 11) {                     // once per simulated minute: the watchers
                    if (typeof Mail !== 'undefined') safely(() => Mail.tick({ now: sim, seconds: 60 }));
                    if (typeof Choir !== 'undefined') safely(() => Choir.observe(sim));
                }
            }
        }, [...QUIET_UI, 'update']);
        safely(() => Footage.tick());
        safely(() => Etherscape.tick());
        safely(() => media.checkTapes());
        const open = (safely(() => Incidents.state().open.length)) || 0;
        return `${h} h played at the desk; ${open} incident${open === 1 ? '' : 's'} open.`;
    });

    /* Offline: State.save() stamps lastUpdateTime itself, so an absence has
       to be written into the stored save and the page reloaded. testMode is
       dropped from the URL — it hides the report. */
    function writeAndReload(rawText, options = {}) {
        safely(() => clearInterval(autosaveIntervalId));
        localStorage.setItem(State.SAVE_KEY, rawText);
        State.suppressUnloadSave = true;
        hooks.reload(options);
    }

    function taintBlob(blob, now = Date.now()) {
        const dev = blob.dev && typeof blob.dev === 'object' ? blob.dev : {};
        blob.dev = { tainted: true, actions: (Number(dev.actions) || 0) + 1, since: Number(dev.since) || now };
        return blob;
    }

    function currentSaveText() {
        State.save();
        const raw = localStorage.getItem(State.SAVE_KEY);
        need(raw, 'nothing is saved yet');
        return raw;
    }

    actions.advanceOffline = (hours) => act('Offline time', () => {
        const h = Number(hours);
        need(Number.isFinite(h) && h > 0 && h <= 240, 'hours between 0 and 240');
        const blob = taintBlob(JSON.parse(currentSaveText()));
        blob.runtime.lastUpdateTime = Date.now() - h * 3600 * 1000;
        writeAndReload(JSON.stringify(blob), { dropTestMode: true });
        return `reloading ${h} h later.`;
    }, { save: false });

    /* 5. Incidents and cascade. */

    actions.fileIncident = (severity, falseAlarm = false, template = 'choir_desync') => act('Incident', () => {
        need(typeof Incidents !== 'undefined', 'Incidents is not loaded.');
        const sev = falseAlarm ? 3 : Math.floor(Number(severity));
        need([1, 2, 3].includes(sev), 'severity is 1, 2 or 3');
        need(INCIDENT_TEMPLATES.includes(template), `unknown template "${template}"`);
        const incident = Incidents.file(template, { severity: sev, falseAlarm: !!falseAlarm, sector: '7G' }, Date.now());
        need(incident, 'the queue is full (3 open) — clear it first');
        return falseAlarm ? `filed a false alarm (${template}).` : `filed SEV-${sev} ${template}.`;
    });

    actions.clearIncidents = () => act('Clear incidents', () => {
        need(typeof Incidents !== 'undefined', 'Incidents is not loaded.');
        const open = Incidents.state().open.length;
        Incidents.clearForReboot(Date.now());
        return `${open} closed; the queue is clear.`;
    });

    actions.setCascade = (tier, { alert = false } = {}) => act('Cascade', () => {
        const t = Math.floor(Number(tier));
        const tiers = Economy.cascadeTiers;
        need(Number.isFinite(t) && t >= 0 && t <= tiers.length, `tier between 0 and ${tiers.length}`);
        State.reality.instability = t === 0 ? 0 : tiers[t - 1].at;
        if (!alert) State.reality.alertedTier = t;
        State.reality.cascadeTier = -1;                // force syncCascade past its "unchanged" early return
        game.syncCascade(Date.now());
        return t === 0 ? 'instability 0, build nominal.' : `${tiers[t - 1].label} (instability ${State.reality.instability}).`;
    });

    /* 6. NULL.OPERATOR. */

    actions.mirrorLogin = () => act('Mirror Login', () => {
        need(!State.adversary.sceneCompleted, 'the Mirror Login is already resolved — reset NULL.OPERATOR first');
        State.adversary.contacted = true;
        State.achievementProgress.adversary_contacted = true;
        State.save();
        ui.playAdversaryScene();
        return 'scene up.';
    });

    actions.resolveMirror = (choice) => act('Mirror Login answer', () => {
        need(!State.adversary.sceneCompleted, 'the Mirror Login is already resolved');
        resolveMirror(choice);
        return `answered ${MIRROR_CHOICES[String(choice).toUpperCase()] || 'OP-B'}; standing ${State.adversary.standing}.`;
    });

    actions.setStanding = (band) => act('Standing', () => {
        applyStanding(band);
        return `${band} (${State.adversary.standing})${State.adversary.sceneCompleted ? '.' : '; the Mirror Login is not resolved yet, so he is not listening.'}`;
    });

    /* The finale, gate bypassed: playFinale reads only `pending`. */
    actions.endOfShift = () => act('End of Shift', () => {
        State.endings.pending = game.adversaryRelationship();
        State.endings.attempts = 0;
        State.save();
        ui.playFinale();
        return `scene up for the ${State.endings.pending} band (gate bypassed).`;
    });

    actions.openFinaleGate = (band = 'curious') => act('Open the finale gate', () => {
        const blocker = reachEndingGate(band, {});
        return blocker ? `still shut: ${blocker}.` : `open for ${band}; the next beat of the desktop will present it.`;
    });

    actions.resetEndings = () => act('Reset endings', () => {
        State.endings = clone(PRISTINE.endings);
        State.reality.history = (State.reality.history || []).filter((r) => r.channel !== 'archived');
        game.applyEndings();
        return 'endings, their modifiers and the archived ship count cleared.';
    });

    actions.resetNullOperator = () => act('Reset NULL.OPERATOR', () => {
        State.adversary = clone(PRISTINE.adversary);
        State.achievementProgress.adversary_contacted = false;
        State.achievementProgress.execute_adversary_patch = false;
        State.recycleBin.items = State.recycleBin.items.filter((i) => i.id !== 'adversary_patch' && i.id !== 'adversary_audit');
        // The patch's records carry a bare-string source, which dropSource cannot see.
        Modifiers.records = Modifiers.records.filter((r) => !String(r.id).startsWith('adversary_patch'));
        safely(() => { ui.mirrorReelClaimed = false; });
        return 'the Mirror Login will run again.';
    });

    /* 7. World apps. */

    actions.deliverMail = (which) => act('Mail', () => {
        const ids = which === 'all' ? 'all' : [which];
        if (which !== 'all') need(MailCatalog.message(which), `no message "${which}"`);
        const delivered = deliverMail(ids);
        return `${delivered.length} delivered (forced past their triggers).`;
    });

    actions.choirPost = (kind = 'ambient.base') => act('Choir', () => {
        need(typeof Choir !== 'undefined', 'Choir is not loaded.');
        const samples = {
            'ambient.base': { i: 0 }, 'ambient.null': { i: 0 }, 'ambient.fate': { i: 0 },
            'patience': { w: 7 }, 'cascade.status': { t: 2 },
        };
        need(samples[kind], `no sample for "${kind}"`);
        ensureApps(['choir']);
        fileChoirWelcome();
        const choir = Choir.state();
        const now = Date.now();
        const id = `dev:${now}:${choir.posts.length}`;
        choir.posts.push({ id, k: kind, r: Number(State.prestigeLevel) || 0, x: { ...samples[kind] }, c: 0, at: now, ep: epochSeconds(now), b: 0 });
        safely(() => ChoirView.render());
        safely(() => ChoirView.updateBadge());
        return `posted ${kind}.`;
    });

    actions.openEtherscape = (url) => act('Etherscape', () => {
        need(typeof Etherscape !== 'undefined', 'Etherscape is not loaded.');
        need(Etherscape.known().includes(url), `no page "${url}"`);
        ensureApps(['etherscape']);
        const store = Etherscape.store();
        if (!store.unlocked.includes(url)) store.unlocked.push(url);
        safely(() => ui.updateDesktopIcons());
        return Etherscape.open(url) ? `opened ${url}.` : `filed ${url} as unlocked, but no window would open.`;
    });

    /* 8. Achievements. */

    actions.unlockAchievements = () => act('Achievements', () => {
        let n = 0;
        quietly(() => { for (const a of AchievementList) if (!State.achievements[a.id]) { game.unlockAchievement(a.id); n++; } });
        return `${n} unlocked.`;
    });

    actions.resetAchievements = () => act('Reset achievements', () => {
        State.achievements = {};
        State.achievementBonuses = clone(PRISTINE.achievementBonuses);
        State.achievementProgress.total_achievements = 0;
        return 'cleared (any whose condition still holds will unlock again within a second).';
    });

    /* 9. Save states. A snapshot is the raw save text; a restore writes it
       back and reloads (a live State cannot be swapped under the apps). */

    function utf8ToBase64(text) {
        const bytes = new TextEncoder().encode(text);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function base64ToUtf8(b64) {
        const bin = atob(String(b64).replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    /* Not game.exportSave: its btoa throws on any character above U+00FF, and
       the console is exactly what puts em dashes into modifier labels. */
    function encodeSnapshot(raw) { return SNAPSHOT_PREFIX + utf8ToBase64(raw); }

    function decodeSnapshot(text) {
        const body = String(text || '').trim();
        need(body, 'paste a snapshot first');
        let raw;
        if (body.startsWith(SNAPSHOT_PREFIX)) raw = base64ToUtf8(body.slice(SNAPSHOT_PREFIX.length));
        else if (body.startsWith('{')) raw = body;
        else raw = safely(() => base64ToUtf8(body)) || atob(body.replace(/\s+/g, ''));      // the game's own export
        const parsed = JSON.parse(raw);
        need(parsed && typeof parsed === 'object' && parsed.resources, 'that is not a CosmOS save');
        return raw;
    }

    function readSlots() {
        const parsed = safely(() => JSON.parse(localStorage.getItem(SLOTS_KEY) || '{}'));
        return parsed && typeof parsed === 'object' ? parsed : {};
    }

    function writeSlots(slots) {
        try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch (err) { throw new Error('storage is full — clear a slot'); }
    }

    function summarise(raw) {
        const s = JSON.parse(raw);
        const level = s.prestigeLevel || 0;
        const band = s.adversary && s.adversary.sceneCompleted
            ? (s.adversary.standing <= -3 ? 'hostile' : s.adversary.standing >= 3 ? 'complicit' : 'curious') : 'no contact';
        return `reboot ${level} · ${(s.unlockedApps || []).length} apps · ${band}${s.dev && s.dev.tainted ? ' · DEV' : ''}`;
    }

    actions.snapshot = (slot) => act(`Snapshot ${slot}`, () => {
        need(SLOT_IDS.includes(slot), `slots are ${SLOT_IDS.join(', ')}`);
        const raw = currentSaveText();
        const slots = readSlots();
        slots[slot] = { at: Date.now(), summary: summarise(raw), raw };
        writeSlots(slots);
        safely(renderSlots);
        return `kept (${slots[slot].summary}).`;
    }, { taint: false });

    function stashUndo() {
        const raw = currentSaveText();
        const slots = readSlots();
        slots[UNDO_SLOT] = { at: Date.now(), summary: summarise(raw), raw };
        writeSlots(slots);
    }

    actions.restore = (slot) => act(`Restore ${slot}`, () => {
        const entry = readSlots()[slot];
        need(entry && entry.raw, `slot ${slot} is empty`);
        stashUndo();
        writeAndReload(JSON.stringify(taintBlob(JSON.parse(entry.raw))));
        return 'reloading.';
    }, { save: false });

    actions.clearSlot = (slot) => act(`Clear ${slot}`, () => {
        const slots = readSlots();
        delete slots[slot];
        writeSlots(slots);
        safely(renderSlots);
        return 'emptied.';
    }, { taint: false, save: false });

    actions.exportSnapshot = () => act('Export', () => {
        const text = encodeSnapshot(currentSaveText());
        const box = $('dev-export-text');
        if (box) box.value = text;
        return `${text.length} characters.`;
    }, { taint: false });

    actions.importSnapshot = (text) => act('Import', () => {
        const raw = decodeSnapshot(text);
        stashUndo();
        writeAndReload(JSON.stringify(taintBlob(JSON.parse(raw))));
        return 'reloading into the imported run.';
    }, { save: false });

    /* A new run, on purpose. The slots survive (they live under their own
       key); the old run is kept in slot Z first. */
    actions.freshSave = () => act('Fresh save', () => {
        stashUndo();
        safely(() => clearInterval(autosaveIntervalId));
        localStorage.removeItem(State.SAVE_KEY);
        State.suppressUnloadSave = true;
        hooks.reload();
        return 'reloading into a new run (the old one is in slot Z).';
    }, { taint: false, save: false });

    /* 10. Audio. */

    actions.playCue = (name) => act(`Cue ${name}`, () => {
        need(typeof audio !== 'undefined' && audio.SOUNDS[name], `no cue "${name}"`);
        const played = audio.play(name, SYNTH_OPTS[name] || {});
        return played ? 'played.' : 'did not play (no gesture yet, muted, or inside its repeat gap).';
    }, { taint: false, save: false });

    actions.playStinger = (id) => {
        need(typeof audio !== 'undefined', 'audio is not loaded');
        return audio.music.stinger(id).then((ok) => say(ok ? `${id}: played.` : `${id}: no file installed.`, ok ? 'ok' : 'warn'));
    };

    actions.playVoice = (speaker, line) => {
        need(typeof audio !== 'undefined', 'audio is not loaded');
        return audio.voice.say(speaker, line).then((outcome) => say(`${speaker}/${line}: ${outcome}.`, outcome === 'played' ? 'ok' : 'warn'));
    };

    /* Media — playing is not editing the run, so these do not taint. */

    function whileAlways(fn) {
        const s = media.settings();
        const prev = s.cinematics;
        s.cinematics = 'always';
        media.settings();
        const restore = () => { media.settings().cinematics = prev; media.settings(); };
        let result;
        try { result = fn(); } catch (err) { restore(); throw err; }
        return Promise.resolve(result).then((value) => { restore(); return value; }, (err) => { restore(); throw err; });
    }

    actions.playScene = (id) => {
        need(typeof media !== 'undefined' && MediaCatalog.scene(id), `no cinematic "${id}"`);
        return whileAlways(() => media.play(id)).then((outcome) => say(`${id}: ${outcome}.`, outcome === 'played' ? 'ok' : 'warn'));
    };

    actions.playLoop = (id, host) => {
        need(typeof media !== 'undefined' && MediaCatalog.loop(id), `no loop "${id}"`);
        need(host && host.isConnected, 'the loop needs a stage in the panel');
        host.textContent = '';
        return whileAlways(() => media.attachLoop(host, id)).then((ok) => say(`${id}: ${ok ? 'running in the stage below.' : 'not installed (or motion is reduced).'}`, ok ? 'ok' : 'warn'));
    };

    actions.playTape = (id, shot = 0) => act(`Tape ${id}`, () => {
        const tape = MediaCatalog.tape(id);
        need(tape, `no tape "${id}"`);
        const filed = media.settings();
        if (!filed.tapes.includes(id)) { filed.tapes.push(id); media.settings(); }
        ensureApps(['mediaplayer']);
        safely(() => ui.updateDesktopIcons());
        system.openApp('mediaplayer');
        safely(() => MediaPlayerView.onTapesChanged());
        need(MediaPlayerView.loadTape(id, false), 'the player would not load that tape');
        if (shot > 0) MediaPlayerView.seek(MediaLogic.shotStart(tape, shot));
        MediaPlayerView.play();
        return `playing${shot > 0 ? ` from shot ${shot + 1}` : ''}.`;
    }, { taint: false, save: true });

    actions.playReel = (id) => act(`Reel ${id}`, () => {
        need(FootageCatalog.reel(id), `no reel "${id}"`);
        FootageLogic.find(Footage.state(), id);
        ensureApps(['mediaplayer']);
        safely(() => ui.updateDesktopIcons());
        need(Footage.open(id), 'the footage deck would not open that reel');
        return 'opened in the deck.';
    }, { taint: false, save: true });

    /* ── tainted watermark ────────────────────────────────────────────── */

    const STYLE_ID = 'dev-console-style';

    function injectStyle() {
        if (!hasDOM || $(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    function renderTaint() {
        if (!hasDOM) return;
        const tainted = !!(State.dev && State.dev.tainted);
        const badge = $('dev-taint');
        if (badge) {
            badge.textContent = tainted ? `DEV — ${State.dev.actions} edit${State.dev.actions === 1 ? '' : 's'}` : 'CLEAN';
            badge.dataset.tainted = tainted ? 'true' : 'false';
        }
        let mark = $('dev-watermark');
        if (tainted && !mark && document.body) {
            injectStyle();
            mark = document.createElement('div');
            mark.id = 'dev-watermark';
            mark.className = 'dev-watermark';
            mark.setAttribute('role', 'status');
            mark.title = 'This run was edited with the Dev Console. Discount any balance or achievement report from it.';
            mark.textContent = 'DEV';
            document.body.appendChild(mark);
        } else if (!tainted && mark) {
            mark.remove();
        }
    }

    function renderPresence() {
        const el = $('dev-presence');
        if (el) el.textContent = presenceMode === 'auto' ? 'real input' : `forced ${presenceMode}`;
    }

    /* ── URL parameters ───────────────────────────────────────────────── */

    /* ?dev=1 opens the gate; the rest edit the run, in this order, once the
       page has loaded (so every system is live), and are then stripped from
       the address so a reload does not apply them twice. */
    const PARAMS = {
        fresh: 'fresh=1             start a new run first (reloads once, then continues)',
        mirror: 'mirror=A|B|C        answer the Mirror Login (OP-A / OP-B / OP-C) before any ships',
        unlockAll: 'unlockAll=1        every app, document, tape, reel, the Omniscient mail; Cinematics: Always',
        preset: 'preset=beta|nightly|archived|ending',
        reboot: 'reboot=N            ship builds up to reboot N',
        divinity: 'divinity=N          add N Divinity',
        standing: 'standing=hostile|curious|complicit',
        caps: 'caps=N              multiply every cap by N and fill',
        fill: 'fill=1              resources to cap',
        achievements: 'achievements=all|none',
        cinematics: 'cinematics=first|always|off',
        mail: 'mail=all            deliver every message',
        incident: 'incident=1|2|3|false',
        cascade: 'cascade=0..3',
        presence: 'presence=away|present',
        attended: 'attended=N        N hours of attended play',
        open: 'open=<app id>        open an app',
    };
    const ACTION_PARAMS = Object.keys(PARAMS);
    const PARAM_ORDER = ['mirror', 'unlockAll', 'preset', 'reboot', 'divinity', 'standing', 'caps', 'fill',
        'achievements', 'cinematics', 'mail', 'incident', 'cascade', 'presence', 'attended', 'open'];

    function applyParams(search = typeof location !== 'undefined' ? location.search : '') {
        const q = new URLSearchParams(search);
        const applied = [];
        const run = (name, result) => { applied.push(name); return result; };
        const mirror = q.get('mirror');
        const options = mirror ? { mirror } : {};
        for (const name of PARAM_ORDER) {
            const value = q.get(name);
            if (value === null) continue;
            switch (name) {
                case 'mirror': if (!q.has('preset') && !q.has('reboot')) run(name, actions.resolveMirror(value)); else applied.push(name); break;
                case 'unlockAll': if (value !== '0') run(name, actions.unlockEverything()); break;
                case 'preset': run(name, actions.preset(value, options)); break;
                case 'reboot': run(name, actions.rebootTo(value, options)); break;
                case 'divinity': run(name, actions.addDivinity(value)); break;
                case 'standing': run(name, actions.setStanding(value)); break;
                case 'caps': run(name, actions.raiseCaps(value)); break;
                case 'fill': if (value !== '0') run(name, actions.fillResources()); break;
                case 'achievements': run(name, value === 'none' ? actions.resetAchievements() : actions.unlockAchievements()); break;
                case 'cinematics': run(name, actions.setCinematics(value)); break;
                case 'mail': run(name, actions.deliverMail(value === 'all' ? 'all' : value)); break;
                case 'incident': run(name, value === 'false' ? actions.fileIncident(3, true) : actions.fileIncident(value)); break;
                case 'cascade': run(name, actions.setCascade(value)); break;
                case 'presence': run(name, actions.setPresence(value)); break;
                case 'attended': run(name, actions.advanceAttended(value)); break;
                case 'open': run(name, act('Open', () => { system.openApp(value); return value; }, { taint: false })); break;
                default: break;
            }
        }
        return applied;
    }

    function stripParams() {
        if (typeof location === 'undefined' || typeof history === 'undefined' || !history.replaceState) return;
        const url = new URL(location.href);
        let changed = false;
        for (const name of ACTION_PARAMS) if (url.searchParams.has(name)) { url.searchParams.delete(name); changed = true; }
        if (changed) history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    /* A fresh run first: State loaded when state.js parsed, so the only way
       to start clean is to clear the save and come back without the flag. */
    function freshFirst() {
        if (typeof location === 'undefined') return false;
        const url = new URL(location.href);
        if (url.searchParams.get('fresh') !== '1') return false;
        url.searchParams.delete('fresh');
        safely(() => clearInterval(autosaveIntervalId));
        localStorage.removeItem(State.SAVE_KEY);
        State.suppressUnloadSave = true;
        location.replace(url.toString());
        return true;
    }

    function buildLink({ unlockAll = false, preset = '', reboot = '', mirror = '', standing = '', cinematics = '', fresh = false } = {}) {
        const q = new URLSearchParams({ dev: '1' });
        if (fresh) q.set('fresh', '1');
        if (mirror) q.set('mirror', mirror);
        if (unlockAll) q.set('unlockAll', '1');
        if (preset) q.set('preset', preset);
        else if (reboot !== '' && Number.isFinite(Number(reboot))) q.set('reboot', String(Number(reboot)));
        if (standing) q.set('standing', standing);
        if (cinematics) q.set('cinematics', cinematics);
        const base = typeof location !== 'undefined' ? location.origin + location.pathname : '';
        return `${base}?${q.toString()}`;
    }

    /* ── the panel ────────────────────────────────────────────────────── */

    const STYLE = `
.dev-console { margin: 18px 0 6px; border: 2px solid var(--cos-brass-700, #77592b); background: var(--cos-vellum-100, #f4efe4); color: var(--cos-ink, #1b1712); font-family: var(--cos-font-machine, 'Courier New', monospace); font-size: 11px; }
.dev-console * { box-sizing: border-box; }
.dev-banner { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--cos-brass-900, #3e2f16); color: var(--cos-brass-100, #f7e6ba); font-weight: bold; letter-spacing: 0.06em; font-size: 11px; }
.dev-hazard { flex: none; width: 34px; height: 12px; background: repeating-linear-gradient(135deg, var(--cos-brass-300, #dec483) 0 6px, var(--cos-brass-900, #3e2f16) 6px 12px); border: 1px solid var(--cos-brass-300, #dec483); }
.dev-lede { margin: 8px 10px; color: var(--cos-ink-dim, #5b5245); line-height: 1.45; }
.dev-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 10px 8px; padding: 6px 8px; background: var(--cos-vellum-200, #e6dfcf); border: 1px solid var(--cos-vellum-500, #978c76); }
.dev-taint { flex: none; padding: 1px 6px; border: 1px solid var(--cos-ink, #1b1712); font-weight: bold; }
.dev-taint[data-tainted="true"] { background: var(--cos-alarm-ink, #832a19); color: var(--cos-vellum-100, #f4efe4); border-color: var(--cos-alarm-ink, #832a19); }
.dev-status { flex: 1 1 200px; min-height: 14px; }
.dev-status[data-tone="error"] { color: var(--cos-alarm-ink, #832a19); font-weight: bold; }
.dev-status[data-tone="warn"] { color: var(--cos-brass-ink, #5e4620); }
.dev-group { margin: 0 10px 6px; border: 1px solid var(--cos-vellum-500, #978c76); background: var(--cos-vellum-100, #f4efe4); }
.dev-group > summary { cursor: pointer; padding: 6px 8px; background: var(--cos-vellum-300, #d5cbb6); color: var(--cos-ink, #1b1712); font-weight: bold; list-style-position: inside; }
.dev-group > summary small { margin-left: 8px; font-weight: normal; color: var(--cos-ink-dim, #5b5245); }
.dev-group > summary:focus-visible, .dev-console button:focus-visible, .dev-console input:focus-visible, .dev-console select:focus-visible, .dev-console textarea:focus-visible, .dev-console pre:focus-visible { outline: 2px solid var(--cos-ink, #1b1712); outline-offset: 1px; }
.dev-body { padding: 8px; display: grid; gap: 8px; }
.dev-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.dev-label { flex: none; min-width: 96px; font-weight: bold; color: var(--cos-ink, #1b1712); }
.dev-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dev-note { margin: 0; color: var(--cos-ink-dim, #5b5245); line-height: 1.4; }
.dev-console .dev-btn { display: inline-block; width: auto; margin: 0; padding: 3px 8px; font-size: 11px; min-width: 0; }
.dev-field { display: inline-flex; align-items: center; gap: 4px; color: var(--cos-ink, #1b1712); }
.dev-num { width: 56px; padding: 2px 4px; font-family: inherit; font-size: 11px; background: var(--cos-vellum-100, #f4efe4); color: var(--cos-ink, #1b1712); border: 1px solid var(--cos-ink-dim, #5b5245); }
.dev-console select { font-family: inherit; font-size: 11px; background: var(--cos-vellum-100, #f4efe4); color: var(--cos-ink, #1b1712); border: 1px solid var(--cos-ink-dim, #5b5245); padding: 2px; }
.dev-text { width: 100%; height: 58px; resize: vertical; font-family: inherit; font-size: 10px; background: var(--cos-vellum-100, #f4efe4); color: var(--cos-ink, #1b1712); border: 1px solid var(--cos-ink-dim, #5b5245); }
.dev-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.dev-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 3px 4px; border-bottom: 1px dotted var(--cos-vellum-500, #978c76); }
.dev-code { flex: none; min-width: 38px; font-weight: bold; color: var(--cos-brass-ink, #5e4620); }
.dev-file { color: var(--cos-ink-dim, #5b5245); }
.dev-file[data-state="ok"] { color: var(--cos-verd-600, #285d53); font-weight: bold; }
.dev-file[data-state="missing"] { color: var(--cos-alarm-ink, #832a19); }
.dev-slot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.dev-slot-id { flex: none; width: 18px; font-weight: bold; }
.dev-slot-info { flex: 1 1 140px; color: var(--cos-ink-dim, #5b5245); }
.dev-pre { margin: 0; padding: 6px; max-height: 190px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 10px; background: var(--cos-vellum-200, #e6dfcf); color: var(--cos-ink, #1b1712); border: 1px solid var(--cos-vellum-500, #978c76); }
.dev-stage { max-width: 320px; background: var(--cos-iron-900, #121823); }
.dev-stage:empty { display: none; }
.dev-stage video { display: block; width: 100%; height: auto; }
.dev-link { width: 100%; font-family: inherit; font-size: 10px; padding: 3px; background: var(--cos-vellum-100, #f4efe4); color: var(--cos-ink, #1b1712); border: 1px solid var(--cos-ink-dim, #5b5245); }
.dev-watermark { position: fixed; right: 10px; bottom: 44px; z-index: 9400; padding: 1px 7px; pointer-events: none; font: bold 11px/16px var(--cos-font-machine, 'Courier New', monospace); letter-spacing: 0.12em; color: var(--cos-vellum-100, #f4efe4); background: var(--cos-alarm-ink, #832a19); border: 1px solid var(--cos-halo, #fff7de); opacity: 0.92; }
`;

    const btn = (label, name, arg, { danger = false, title = '', sfx = true } = {}) =>
        `<button type="button" class="win-btn dev-btn${danger ? ' danger-btn' : ''}" data-dev="${name}"` +
        `${arg !== undefined ? ` data-arg="${esc(arg)}"` : ''}${title ? ` title="${esc(title)}"` : ''}${sfx ? '' : ' data-sfx="none"'}>${esc(label)}</button>`;
    const num = (id, label, value, min, max) =>
        `<label class="dev-field">${esc(label)} <input type="number" class="dev-num" id="${id}" min="${min}" max="${max}" value="${value}"></label>`;
    const select = (id, label, options, selected) =>
        `<label class="dev-field">${esc(label)} <select id="${id}">${options.map((o) =>
            `<option value="${esc(o[0])}"${o[0] === selected ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
    const row = (label, controls) => `<div class="dev-row"><span class="dev-label">${esc(label)}</span><div class="dev-controls">${controls}</div></div>`;
    const note = (text) => `<p class="dev-note">${esc(text)}</p>`;
    const group = (id, title, hint, body) =>
        `<details class="dev-group" id="dev-g-${id}" data-group="${id}"><summary>${esc(title)}<small>${esc(hint)}</small></summary><div class="dev-body">${body}</div></details>`;
    const sceneRows = () => typeof MediaCatalog === 'undefined' ? '' : Object.values(MediaCatalog.scenes).map((s) =>
        `<li><span class="dev-code">${esc(s.code)}</span><strong>${esc(s.title)}</strong><span class="dev-file" data-probe="entry:scene:${esc(s.id)}">…</span>${btn('Play', 'play-scene', s.id)}</li>`).join('');
    const loopRows = () => typeof MediaCatalog === 'undefined' ? '' : Object.values(MediaCatalog.loops).map((l) =>
        `<li><span class="dev-code">${esc(l.code || 'V3')}</span><strong>${esc(l.title || l.id)}</strong><span class="dev-file" data-probe="entry:loop:${esc(l.id)}">…</span>${btn('Play in stage', 'play-loop', l.id)}</li>`).join('');
    const tapeRows = () => typeof MediaCatalog === 'undefined' ? '' : MediaCatalog.tapes.map((t) =>
        `<li><span class="dev-code">${esc(t.code)}</span><strong>${esc(t.title)}</strong>${btn('Play', 'play-tape', t.id)}` +
        `<details class="dev-shots"><summary>${t.shots.length} shots</summary><ul class="dev-list">${t.shots.map((shot, i) =>
            `<li><span class="dev-code">${esc(shot.code)}</span><span class="dev-file" ${shot.video ? `data-probe="entry:shot:${esc(t.id)}:${i}"` : ''}>${shot.video ? '…' : 'card'}</span>${btn('Go', 'play-tape', `${t.id}:${i}`, { title: `Play ${t.title} from shot ${i + 1}` })}</li>`).join('')}</ul></details></li>`).join('');
    const reelRows = () => typeof FootageCatalog === 'undefined' ? '' : FootageCatalog.reels.map((r) =>
        `<li><span class="dev-code">${esc(r.code || r.kind)}</span><strong>${esc(r.title)}</strong><span class="dev-file" data-probe="entry:reel:${esc(r.id)}">…</span>${btn('Play', 'play-reel', r.id)}</li>`).join('');

    function panelHTML() {
        const tiers = typeof Economy !== 'undefined' ? Economy.cascadeTiers : [];
        const slots = SLOT_IDS.concat(UNDO_SLOT);
        const synth = typeof audio !== 'undefined' ? Object.keys(audio.SOUNDS) : [];
        const music = typeof AudioFiles !== 'undefined' ? Object.entries(AudioFiles.MUSIC) : [];
        const apps = typeof Etherscape !== 'undefined' && typeof Etherscape.known === 'function' ? Etherscape.known() : [];
        const mailIds = typeof MailCatalog !== 'undefined' ? MailCatalog.messages.map((m) => [m.id, `${m.id} — ${m.subject}`]) : [];
        return `
<header class="dev-banner"><span class="dev-hazard" aria-hidden="true"></span><span id="dev-console-title">CMS FIELD ENGINEER MODE — NOT FOR PRODUCTION</span></header>
<p class="dev-lede">Testing tool. Every edit below marks this save <strong>DEV</strong>: it is kept in the save and painted on the desktop, so a balance or achievement report from it can be discounted. Snapshots (A, B, C, and Z for “undo the last jump”) live in this browser only.</p>
<div class="dev-bar"><span id="dev-taint" class="dev-taint" data-tainted="false">CLEAN</span><div id="dev-status" class="dev-status" role="status" aria-live="polite">Standing by.</div></div>

${group('unlock', '1 · Unlock everything', 'apps, documents, tapes, reels, Omniscient mail', `
${row('Everything', btn('Unlock everything', 'unlock-everything', undefined, { title: 'Installs every app; unlocks the Void, every document, tape and reel, the Omniscient mail; Cinematics: Always' }))}
${row('Cinematics', btn('First time only', 'cinematics', 'first') + btn('Always', 'cinematics', 'always') + btn('Off', 'cinematics', 'off'))}
${note('Installs Mail, Media Player, Etherscape, Choir and Patience.exe, opens the Void, files every Notepad document and tape, marks every footage reel found, delivers the four Omniscient mails, and sets Cinematics to Always.')}`)}

${group('media', '2 · Media test bench', 'every cinematic, loop, tape, reel', `
${row('Files', btn('Probe files', 'probe-media', undefined, { title: 'Checks every reel on disk. A missing file is reported once and remembered until reload.' }) + '<span class="dev-file" id="dev-probe-summary"></span>')}
${note('Plays ignore the Cinematics setting for the duration (and put it back). Missing files are skipped the way the game skips them.')}
<h4 class="dev-note">Cinematics</h4><ul class="dev-list" id="dev-scenes">${sceneRows()}</ul>
<h4 class="dev-note">Loops (V3 cascade tiers, V7 alarm)</h4><ul class="dev-list" id="dev-loops">${loopRows()}</ul>
<div class="dev-stage" id="dev-loop-stage" aria-label="Loop preview stage"></div>
<h4 class="dev-note">Training tapes</h4><ul class="dev-list" id="dev-tapes">${tapeRows()}</ul>
<h4 class="dev-note">Recovered Footage and the Omniscient addresses</h4><ul class="dev-list" id="dev-reels">${reelRows()}</ul>`)}

${group('progress', '3 · Jump in progression', 'resources, caps, divinity, ships', `
${row('Resources', btn('Fill to cap', 'fill') + btn('Caps ×10', 'caps', 10) + btn('Caps ×100', 'caps', 100) + btn('Remove dev caps', 'caps', 1))}
${row('Divinity', btn('+1', 'divinity', 1) + btn('+10', 'divinity', 10) + btn('+100', 'divinity', 100) + btn('−10', 'divinity', -10))}
${row('Mirror Login', select('dev-mirror', 'Before shipping', [['', 'leave it (it plays at reboot 3)'], ['A', 'answer OP-A'], ['B', 'answer OP-B'], ['C', 'answer OP-C']], '') + '<span class="dev-note">Used by Ship, the presets and Reboot to.</span>')}
${row('Ship builds', num('dev-ship-n', 'Ship', 1, 1, 60) + btn('Ship N builds', 'ship-n') + '<span class="dev-note">Each is a real ship, 3 reboot bars deep.</span>')}
${row('Presets', btn('Reboot 3 · Beta', 'preset', 'beta') + btn('Reboot 8 · Nightly', 'preset', 'nightly') + btn('Reboot 12 · Archived', 'preset', 'archived') + btn('Ending gate', 'preset', 'ending', { title: 'Reboot 14 with an archived ship, a day-old save, Mirror Login done' }))}
${row('Reboot to', num('dev-reboot-n', 'Level', State.prestigeLevel || 0, 0, 60) + btn('Ship up to it', 'reboot-to'))}
${note('A run cannot be un-shipped: presets climb from where you are. Use Save states → Fresh save to start over.')}`)}

${group('time', '4 · Time and presence', 'attended, offline, away', `
${row('Attended', btn('+1 hour', 'attended', 1) + btn('+8 hours', 'attended', 8) + '<span class="dev-note">Played at the desk: incidents, mail clock, instability.</span>')}
${row('Offline', btn('Away 1 hour', 'offline', 1) + btn('Away 8 hours', 'offline', 8) + '<span class="dev-note">Reloads and shows the offline report.</span>')}
${row('Presence', btn('Force away', 'presence', 'away') + btn('Force present', 'presence', 'present') + btn('Real input', 'presence', 'auto') + '<span class="dev-note">Now: <strong id="dev-presence">real input</strong>. Away holds incidents and stacks a mail backlog.</span>')}`)}

${group('incidents', '5 · Incidents and cascade', 'file, clear, instability tier', `
${row('File', select('dev-incident-template', 'Line', INCIDENT_TEMPLATES.map((t) => [t, t]), 'choir_desync') + btn('SEV-3', 'incident', '3') + btn('SEV-2', 'incident', '2') + btn('SEV-1', 'incident', '1') + btn('False alarm', 'incident', 'false'))}
${row('Queue', btn('Clear the queue', 'clear-incidents'))}
${row('Cascade', btn('Nominal', 'cascade', 0) + tiers.map((t, i) => btn(t.label, 'cascade', i + 1)).join(''))}
${note('Cascade tiers set instability to the tier’s threshold and suppress the alert dialog; it decays during play like any other.')}`)}

${group('adversary', '6 · NULL.OPERATOR', 'Mirror Login, standing, End of Shift', `
${row('Mirror Login', btn('Trigger it now', 'mirror-login') + btn('Answer OP-A', 'mirror-answer', 'A') + btn('Answer OP-B', 'mirror-answer', 'B') + btn('Answer OP-C', 'mirror-answer', 'C'))}
${row('Standing', btn('Hostile (−4)', 'standing', 'hostile') + btn('Curious (0)', 'standing', 'curious') + btn('Complicit (+4)', 'standing', 'complicit'))}
${row('End of Shift', btn('Play it (gate bypassed)', 'end-of-shift') + btn('Open the real gate', 'open-gate', undefined, { title: 'Reboot 14 with an archived ship, a day-old save, Mirror Login answered, curious band' }))}
${row('Reset', btn('Reset endings', 'reset-endings', undefined, { danger: true }) + btn('Reset NULL.OPERATOR', 'reset-null', undefined, { danger: true }))}`)}

${group('world', '7 · World apps', 'mail, Choir, Etherscape', `
${row('Mail', btn('Deliver all 65', 'mail-all') + select('dev-mail-id', 'One', mailIds, mailIds[0] && mailIds[0][0]) + btn('Deliver it', 'mail-one'))}
${row('Choir', select('dev-choir-kind', 'Post', [['ambient.base', 'ambient chatter'], ['ambient.null', 'NULL chatter'], ['ambient.fate', 'Fate chatter'], ['patience', 'Patience wins'], ['cascade.status', 'cascade status']], 'ambient.base') + btn('Post it', 'choir-post'))}
${row('Etherscape', select('dev-etherscape-url', 'Page', apps.map((u) => [u, u]), apps[0]) + btn('Open it', 'etherscape-open'))}
${note('Mail is forced past its triggers, so reply chains can look odd. Etherscape pages are filed as unlocked.')}`)}

${group('achievements', '8 · Achievements', 'unlock all, or reset', `
${row('All', btn('Unlock all', 'ach-all') + btn('Reset', 'ach-reset', undefined, { danger: true }))}`)}

${group('saves', '9 · Save states', 'slots, export/import, fresh save', `
<div class="dev-body" id="dev-slots">${slots.map((id) => `<div class="dev-slot" data-slot="${id}"><span class="dev-slot-id">${id}</span><span class="dev-slot-info" id="dev-slot-${id}">empty</span>${id === UNDO_SLOT ? '' : btn('Keep', 'snap', id)}${btn('Restore', 'restore', id)}${btn('Clear', 'clear-slot', id)}</div>`).join('')}</div>
${row('Share', btn('Export snapshot', 'export') + btn('Import snapshot', 'import'))}
<textarea class="dev-text" id="dev-export-text" aria-label="Snapshot text" placeholder="Export fills this; paste a snapshot here to import" spellcheck="false"></textarea>
${row('New run', btn('Fresh save', 'fresh', undefined, { danger: true, title: 'Starts a new run; the old one goes to slot Z' }))}
<h4 class="dev-note">Shareable link</h4>
${row('Link', `<label class="dev-field"><input type="checkbox" id="dev-link-unlock" checked> unlock all</label>` +
    select('dev-link-preset', 'Reach', [['', 'as is'], ['beta', 'Beta'], ['nightly', 'Nightly'], ['archived', 'Archived'], ['ending', 'Ending gate']], '') +
    select('dev-link-cinematics', 'Cinematics', [['always', 'Always'], ['first', 'First time'], ['off', 'Off']], 'always') +
    select('dev-link-mirror', 'Mirror Login', [['', 'leave it'], ['A', 'OP-A'], ['B', 'OP-B'], ['C', 'OP-C']], '') +
    select('dev-link-standing', 'Standing', [['', 'as is'], ['hostile', 'Hostile'], ['curious', 'Curious'], ['complicit', 'Complicit']], '') +
    `<label class="dev-field"><input type="checkbox" id="dev-link-fresh" checked> from a fresh run</label>`)}
<input class="dev-link" id="dev-link-out" readonly aria-label="Shareable link" value="">
${row('', btn('Copy link', 'copy-link'))}
${note('Other parameters: ' + ACTION_PARAMS.join(', ') + '. They apply once, then are stripped from the address.')}`)}

${group('audio', '10 · Audio', 'synth cues, music, narration, levels', `
<div class="dev-row">${synth.map((name) => btn(name, 'cue', name, { sfx: false })).join('')}</div>
${row('Music', btn('Probe music files', 'probe-music') + '<span class="dev-file" id="dev-music-summary"></span>')}
<ul class="dev-list" id="dev-music">${music.map(([id, m]) => `<li><span class="dev-code">${esc(m.code)}</span><strong>${esc(m.title)}</strong><span class="dev-note">${esc(m.kind)}</span><span class="dev-file" data-music="${esc(id)}">?</span>${m.kind === 'stinger' ? btn('Play stinger', 'stinger', id, { sfx: false }) : ''}</li>`).join('')}</ul>
${note('Beds follow the game: they start when you are in their context (the Void, Patience.exe, the Media Player, the Mirror Login, an ending). Only stingers can be fired from here.')}
${row('Narration', btn('Probe tape narration', 'probe-voice') + '<span class="dev-file" id="dev-voice-summary"></span>')}
<ul class="dev-list" id="dev-voices"></ul>
${row('Levels', btn('Refresh audio.debug()', 'audio-debug'))}
<pre class="dev-pre" id="dev-audio-debug" tabindex="0" aria-label="audio.debug output">press refresh</pre>`)}

${group('diag', '11 · Overlays', 'idle meter, state inspector, production breakdown', `
${row('Idle meter', btn('Start', 'meter-on') + btn('Stop', 'meter-off') + '<span class="dev-file" id="dev-meter-out">off</span>')}
${note('Counts what fires while it runs: animation frames, timers set after it started, Heartbeat beats, frame time, long tasks. Intervals already running before it started (Heartbeat, autosave) show only as beats.')}
${row('Inspector', btn('Live', 'inspect-on') + btn('Stop', 'inspect-off') + btn('Once', 'inspect-once'))}
<pre class="dev-pre" id="dev-inspector" tabindex="0" aria-label="Game state">not running</pre>
${row('Breakdown', ['praise', 'offerings', 'souls', 'darkness', 'shadows', 'echoes'].map((r) =>
    `<button type="button" class="win-btn dev-btn" data-breakdown="rate:${r}">${r} rate</button>`).join(''))}`)}
`;
    }

    function mirrorOption() { const mirror = val_('dev-mirror'); return mirror ? { mirror } : {}; }
    function num_(id) { const el = $(id); return el ? Number(el.value) : NaN; }
    function val_(id) { const el = $(id); return el ? el.value : ''; }

    /* ── meter and inspector: ride the Heartbeat, only while running ───── */

    const meter = { on: false, unsub: null, restore: [], raf: 0, timers: 0, frames: 0, sum: 0, max: 0, lastStamp: 0, longTasks: 0, longMs: 0, beats: 0, observer: null };
    const inspector = { on: false, unsub: null };

    function meterReset() {
        Object.assign(meter, { raf: 0, timers: 0, frames: 0, sum: 0, max: 0, lastStamp: 0, longTasks: 0, longMs: 0, beats: typeof Heartbeat !== 'undefined' ? Heartbeat.beats() : 0 });
    }

    function meterOn() {
        if (meter.on) return;
        meter.on = true;
        meterReset();
        const w = window;
        const origRaf = w.requestAnimationFrame;
        const origTimeout = w.setTimeout;
        const origInterval = w.setInterval;
        const wrapRaf = function (fn) {
            return origRaf.call(w, (stamp) => {
                meter.raf++;
                if (stamp !== meter.lastStamp) {
                    if (meter.lastStamp) { const d = stamp - meter.lastStamp; meter.frames++; meter.sum += d; if (d > meter.max) meter.max = d; }
                    meter.lastStamp = stamp;
                }
                return fn(stamp);
            });
        };
        const wrapTimer = (orig) => function (fn, ms, ...rest) {
            if (typeof fn !== 'function') return orig.call(w, fn, ms, ...rest);
            return orig.call(w, function (...args) { meter.timers++; return fn.apply(this, args); }, ms, ...rest);
        };
        const wraps = [['requestAnimationFrame', origRaf, wrapRaf], ['setTimeout', origTimeout, wrapTimer(origTimeout)], ['setInterval', origInterval, wrapTimer(origInterval)]];
        for (const [name, orig, wrapped] of wraps) { w[name] = wrapped; meter.restore.push(() => { if (w[name] === wrapped) w[name] = orig; }); }
        if (typeof PerformanceObserver !== 'undefined') {
            safely(() => {
                meter.observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) { meter.longTasks++; meter.longMs += e.duration; } });
                meter.observer.observe({ type: 'longtask', buffered: false });
            });
        }
        const tick = () => {
            const beats = typeof Heartbeat !== 'undefined' ? Heartbeat.beats() : 0;
            const out = $('dev-meter-out');
            const wakeups = meter.raf + meter.timers + (beats - meter.beats);
            if (out) {
                out.textContent = `${meter.raf} frames/s · ${meter.timers} timers/s · ${beats - meter.beats} beats/s = ${wakeups} wakeups/s · frame ${meter.frames ? (meter.sum / meter.frames).toFixed(1) : '—'} ms (max ${meter.max ? meter.max.toFixed(0) : '—'}) · ${meter.longTasks} long task${meter.longTasks === 1 ? '' : 's'}`;
            }
            if (!document.body.contains(out || document.body)) { meterOff(); return; }
            meterReset();
        };
        meter.unsub = typeof Heartbeat !== 'undefined' ? Heartbeat.every(tick) : null;
        say('Idle meter running.');
    }

    function meterOff() {
        if (!meter.on) return;
        meter.on = false;
        if (meter.unsub) meter.unsub();
        meter.unsub = null;
        for (const restore of meter.restore) restore();
        meter.restore = [];
        if (meter.observer) { safely(() => meter.observer.disconnect()); meter.observer = null; }
        const out = $('dev-meter-out');
        if (out) out.textContent = 'off';
    }

    function inspectOnce() {
        const pre = $('dev-inspector');
        if (!pre) return;
        let text = '';
        safely(() => {
            const core = JSON.parse(window.render_game_to_text());
            core.dev = { tainted: !!State.dev.tainted, actions: State.dev.actions, presence: presenceMode };
            core.run = {
                reboot: State.prestigeLevel, rebootCount: State.achievementProgress.prestige_count,
                channel: State.reality.channel, instability: Number((State.reality.instability || 0).toFixed(2)),
                cascadeTier: State.reality.cascadeTier, standing: State.adversary.standing,
                relationship: safely(() => game.adversaryRelationship()), finaleBlocker: safely(() => game.finaleBlocker()),
                endings: (State.endings.history || []).map((e) => e.ending), archivedShips: State.endings.archivedShips,
            };
            core.apps = State.unlockedApps.slice();
            text = JSON.stringify(core, null, 1);
        });
        pre.textContent = text || 'render_game_to_text() is not available';
    }

    function inspectOn() {
        if (inspector.on) return;
        inspector.on = true;
        inspectOnce();
        inspector.unsub = typeof Heartbeat !== 'undefined' ? Heartbeat.every(() => {
            if (!$('dev-inspector')) { inspectOff(); return; }
            inspectOnce();
        }) : null;
        say('Inspector live.');
    }

    function inspectOff() {
        if (!inspector.on) return;
        inspector.on = false;
        if (inspector.unsub) inspector.unsub();
        inspector.unsub = null;
    }

    /* ── probes: on demand, so nothing 404s until someone asks ────────── */

    function entryFor(spec) {
        const [kind, a, b] = spec.split(':');
        if (kind === 'scene') return MediaCatalog.scene(a);
        if (kind === 'loop') return MediaCatalog.loop(a);
        if (kind === 'reel') return FootageCatalog.reel(a);
        if (kind === 'shot') return MediaCatalog.tape(a).shots[Number(b)].video;
        return null;
    }

    async function probeMedia() {
        const cells = Array.from(document.querySelectorAll('[data-probe^="entry:"]'));
        let ok = 0;
        for (const cell of cells) {
            const entry = safely(() => entryFor(cell.dataset.probe.slice(6)));
            let state = 'missing';
            let text = 'missing';
            if (entry) {
                const src = await safely(() => media.sourceFor(entry));
                const poster = entry.poster ? await safely(() => media.probeUrl(entry.poster, 'image')) : null;
                if (src) { state = 'ok'; text = `${/\.webm/.test(src) ? 'webm' : 'mp4'} installed${poster ? ' · poster' : ''}`; ok++; }
                else if (poster) text = 'poster only';
            }
            cell.dataset.state = state;
            cell.textContent = text;
        }
        const summary = $('dev-probe-summary');
        if (summary) summary.textContent = `${ok} of ${cells.length} installed`;
        say(`Media probe: ${ok} of ${cells.length} installed.`);
    }

    async function probeMusic() {
        let ok = 0;
        const ids = Object.keys(AudioFiles.MUSIC);
        for (const id of ids) {
            const has = await safely(() => audio.music.has(id));
            const cell = document.querySelector(`[data-music="${id}"]`);
            if (cell) { cell.dataset.state = has ? 'ok' : 'missing'; cell.textContent = has ? 'installed' : 'missing'; }
            if (has) ok++;
        }
        const summary = $('dev-music-summary');
        if (summary) summary.textContent = `${ok} of ${ids.length} installed`;
        say(`Music probe: ${ok} of ${ids.length} installed.`);
    }

    async function probeVoices() {
        const list = $('dev-voices');
        const lines = [];
        for (const tape of MediaCatalog.tapes) for (const line of AudioFiles.tapeLines(tape)) lines.push(line);
        let ok = 0;
        const rows = [];
        for (const line of lines) {
            const has = await safely(() => audio.voice.has(line.speaker, line.id));
            if (has) { ok++; rows.push(`<li><span class="dev-code">${esc(line.code)}</span><span class="dev-file" data-state="ok">${esc(line.id)}</span><span class="dev-note">${esc(String(line.text || '').slice(0, 70))}</span>${btn('Play', 'voice', `${line.speaker}:${line.id}`, { sfx: false })}</li>`); }
        }
        if (list) list.innerHTML = rows.join('') || '<li class="dev-note">No narration files installed.</li>';
        const summary = $('dev-voice-summary');
        if (summary) summary.textContent = `${ok} of ${lines.length} installed`;
        say(`Narration probe: ${ok} of ${lines.length} installed.`);
    }

    function renderSlots() {
        if (!hasDOM) return;
        const slots = readSlots();
        for (const id of SLOT_IDS.concat(UNDO_SLOT)) {
            const cell = $(`dev-slot-${id}`);
            if (!cell) continue;
            const entry = slots[id];
            cell.textContent = entry ? `${summarise(entry.raw)} — ${new Date(entry.at).toLocaleTimeString()}` : 'empty';
        }
    }

    function updateLink() {
        const out = $('dev-link-out');
        if (!out) return;
        out.value = buildLink({
            unlockAll: !!($('dev-link-unlock') && $('dev-link-unlock').checked),
            fresh: !!($('dev-link-fresh') && $('dev-link-fresh').checked),
            preset: val_('dev-link-preset'),
            mirror: val_('dev-link-mirror'),
            cinematics: val_('dev-link-cinematics'),
            standing: val_('dev-link-standing'),
        });
    }

    /* ── event wiring ─────────────────────────────────────────────────── */

    const handlers = {
        'unlock-everything': () => actions.unlockEverything(),
        'cinematics': (el) => actions.setCinematics(el.dataset.arg),
        'probe-media': () => probeMedia(),
        'play-scene': (el) => actions.playScene(el.dataset.arg),
        'play-loop': (el) => actions.playLoop(el.dataset.arg, $('dev-loop-stage')),
        'play-tape': (el) => { const [id, shot] = el.dataset.arg.split(':'); return actions.playTape(id, Number(shot) || 0); },
        'play-reel': (el) => actions.playReel(el.dataset.arg),
        'fill': () => actions.fillResources(),
        'caps': (el) => actions.raiseCaps(Number(el.dataset.arg)),
        'divinity': (el) => actions.addDivinity(Number(el.dataset.arg)),
        'ship-n': () => actions.shipBuilds(num_('dev-ship-n'), mirrorOption()),
        'preset': (el) => actions.preset(el.dataset.arg, mirrorOption()),
        'reboot-to': () => actions.rebootTo(num_('dev-reboot-n'), mirrorOption()),
        'attended': (el) => actions.advanceAttended(Number(el.dataset.arg)),
        'offline': (el) => actions.advanceOffline(Number(el.dataset.arg)),
        'presence': (el) => actions.setPresence(el.dataset.arg),
        'incident': (el) => (el.dataset.arg === 'false'
            ? actions.fileIncident(3, true, val_('dev-incident-template'))
            : actions.fileIncident(Number(el.dataset.arg), false, val_('dev-incident-template'))),
        'clear-incidents': () => actions.clearIncidents(),
        'cascade': (el) => actions.setCascade(Number(el.dataset.arg)),
        'mirror-login': () => actions.mirrorLogin(),
        'mirror-answer': (el) => actions.resolveMirror(el.dataset.arg),
        'standing': (el) => actions.setStanding(el.dataset.arg),
        'end-of-shift': () => actions.endOfShift(),
        'open-gate': () => actions.openFinaleGate('curious'),
        'reset-endings': () => actions.resetEndings(),
        'reset-null': () => actions.resetNullOperator(),
        'mail-all': () => actions.deliverMail('all'),
        'mail-one': () => actions.deliverMail(val_('dev-mail-id')),
        'choir-post': () => actions.choirPost(val_('dev-choir-kind')),
        'etherscape-open': () => actions.openEtherscape(val_('dev-etherscape-url')),
        'ach-all': () => actions.unlockAchievements(),
        'ach-reset': () => actions.resetAchievements(),
        'snap': (el) => actions.snapshot(el.dataset.arg),
        'restore': (el) => actions.restore(el.dataset.arg),
        'clear-slot': (el) => actions.clearSlot(el.dataset.arg),
        'export': () => actions.exportSnapshot(),
        'import': () => actions.importSnapshot(val_('dev-export-text')),
        'fresh': () => actions.freshSave(),
        'copy-link': () => {
            updateLink();
            const text = val_('dev-link-out');
            const done = () => say('Link copied.');
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => say('Select the link and copy it by hand.', 'warn'));
            else say('Select the link and copy it by hand.', 'warn');
        },
        'cue': (el) => actions.playCue(el.dataset.arg),
        'stinger': (el) => actions.playStinger(el.dataset.arg),
        'probe-music': () => probeMusic(),
        'probe-voice': () => probeVoices(),
        'voice': (el) => { const [speaker, line] = el.dataset.arg.split(':'); return actions.playVoice(speaker, line); },
        'audio-debug': () => { const pre = $('dev-audio-debug'); if (pre) pre.textContent = JSON.stringify(audio.debug(), null, 1); },
        'meter-on': () => meterOn(),
        'meter-off': () => meterOff(),
        'inspect-on': () => inspectOn(),
        'inspect-off': () => inspectOff(),
        'inspect-once': () => inspectOnce(),
    };

    function onClick(event) {
        const el = event.target && event.target.closest ? event.target.closest('[data-dev]') : null;
        if (!el || el.disabled) return;
        const handler = handlers[el.dataset.dev];
        if (!handler) return;
        let result;
        try { result = handler(el); } catch (err) { say(`${el.dataset.dev}: ${err.message}`, 'error'); return; }
        if (result && typeof result.catch === 'function') result.catch((err) => say(`${el.dataset.dev}: ${err.message}`, 'error'));
    }

    function onToggle(event) {
        const details = event.target;
        if (!details || !details.open || !details.dataset || !details.dataset.group) return;
        if (details.dataset.group === 'saves') { renderSlots(); updateLink(); }
        if (details.dataset.group === 'media' && !details.dataset.probed) { details.dataset.probed = '1'; probeMedia(); }
    }

    /* Mounts the section at the bottom of an open Divine Settings window.
       Called from system.js's settings onOpen, behind a typeof guard. */
    function mountSettings(root) {
        if (!hasDOM || !root || !enabled()) return false;
        const panel = root.querySelector('.settings-panel') || root;
        if (panel.querySelector('.dev-console')) return true;
        injectStyle();
        const section = document.createElement('section');
        section.className = 'dev-console';
        section.setAttribute('aria-labelledby', 'dev-console-title');
        section.innerHTML = panelHTML();
        section.addEventListener('click', onClick);
        section.addEventListener('toggle', onToggle, true);
        section.addEventListener('change', (e) => { if (e.target.id && e.target.id.startsWith('dev-link-')) updateLink(); });
        // A letter typed on a focused select must not become a desktop shortcut;
        // Escape and Tab still pass, so the layer still closes.
        section.addEventListener('keydown', (e) => {
            if (e.target && e.target.tagName === 'SELECT' && e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
        });
        panel.appendChild(section);
        renderTaint();
        renderPresence();
        renderSlots();
        updateLink();
        return true;
    }

    /* ── boot ─────────────────────────────────────────────────────────── */

    function boot() {
        if (typeof State === 'undefined' || !hasDOM) return;
        renderTaint();
        if (!enabled()) return;
        if (freshFirst()) return;
        const applied = applyParams();
        if (applied.length) stripParams();
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        // addEventListener, never window.onload: system.js owns that property.
        if (typeof document !== 'undefined' && document.readyState === 'complete') setTimeout(boot, 0);
        else window.addEventListener('load', boot);
    }

    return {
        enabled, actions, hooks, reports, PARAMS, PRESETS, STANDINGS, CAP_TARGETS, ALL_APPS, SLOT_IDS, UNDO_SLOT,
        mountSettings, applyParams, buildLink, encodeSnapshot, decodeSnapshot, readSlots,
        presence: () => presenceMode,
        meterOn, meterOff, inspectOn, inspectOff,
    };
})();
