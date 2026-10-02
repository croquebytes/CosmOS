/**
 * Shared instrumentation for the idle-cost measurements (tools/idle-profile.mjs)
 * and the idle smoke test (tests/idle-e2e.mjs).
 *
 * PROBE runs before any game script (page.addInitScript). It:
 *   - counts every setInterval, setTimeout and requestAnimationFrame callback
 *     that fires, attributed to the js/ file and line that scheduled it;
 *   - lets the harness flip the tab "hidden". Headless Chromium never hides a
 *     tab — bringToFront on another page leaves this one `visible` with rAF
 *     still running — so document.hidden/visibilityState are overridden and
 *     rAF callbacks are parked while hidden, the way a real background tab
 *     parks them. Timers keep firing (a real background tab throttles them
 *     to ~1Hz, it does not stop them), which is exactly what lets the hidden
 *     measurement see an app that keeps polling.
 */
export const PROBE = `(() => {
    const C = window.__idle = { interval: 0, timeout: 0, raf: 0, bySrc: {}, hidden: false, hiddenBySrc: {} };
    const where = () => {
        const lines = String(new Error().stack || '').split('\\n');
        for (let i = 3; i < lines.length; i++) {
            const m = lines[i].match(/\\/js\\/([\\w.-]+\\.js)(?:\\?[^:]*)?:(\\d+)/);
            if (m) return m[1] + ':' + m[2];
        }
        return '?';
    };
    const tally = (kind, at) => {
        C[kind]++;
        const k = kind + ' ' + at;
        C.bySrc[k] = (C.bySrc[k] || 0) + 1;
        if (C.hidden) C.hiddenBySrc[k] = (C.hiddenBySrc[k] || 0) + 1;
    };
    const wrapTimer = (name, kind) => {
        const orig = window[name];
        window[name] = function (fn, ms, ...rest) {
            if (typeof fn !== 'function') return orig.call(this, fn, ms, ...rest);
            const at = where();
            return orig.call(this, function (...a) { tally(kind, at); return fn.apply(this, a); }, ms, ...rest);
        };
    };
    wrapTimer('setInterval', 'interval');
    wrapTimer('setTimeout', 'timeout');

    const raf = window.requestAnimationFrame.bind(window);
    const caf = window.cancelAnimationFrame.bind(window);
    const parked = new Map();
    let fake = -1;
    window.requestAnimationFrame = (fn) => {
        const at = where();
        const run = (t) => { tally('raf', at); fn(t); };
        if (C.hidden) { const id = fake--; parked.set(id, run); return id; }
        return raf(run);
    };
    window.cancelAnimationFrame = (id) => { if (id < 0) parked.delete(id); else caf(id); };

    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return C.hidden; } });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return C.hidden ? 'hidden' : 'visible'; } });
    window.__setHidden = (h) => {
        C.hidden = !!h;
        document.dispatchEvent(new Event('visibilitychange'));
        if (!C.hidden) { const q = [...parked.values()]; parked.clear(); for (const run of q) raf(run); }
    };
    window.__idleReset = () => { C.interval = 0; C.timeout = 0; C.raf = 0; C.bySrc = {}; C.hiddenBySrc = {}; };
})();`;

/* Every app the Genesis menu can hold, in the order a long run unlocks them. */
export const ALL_APPS = ['console', 'settings', 'mandates', 'dimensions', 'notepad', 'taskmgr', 'recyclebin',
    'divineglobe', 'divinecalls', 'adorationshop', 'solitaire', 'mediaplayer', 'choir', 'mail', 'etherscape'];

/* A mid-game save, built the way the other suites build one: real ships,
   then every app unlocked and the scripted interruptions already seen. */
export async function midGame(page) {
    await page.evaluate((apps) => {
        ui.dismissSystemModal?.();
        State.adversary.contacted = true;
        State.adversary.sceneCompleted = true;
        for (let i = 0; i < 2; i++) {
            State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
            game.performPrestige({ confirmed: true, certifyOn: 'creation' });
            ui.dismissSystemModal?.();
        }
        Object.assign(State.automatons, { seraphCount: 64, throneCount: 22, cherubCount: 15, dominionCount: 4 });
        State.dimensions.void.unlocked = true;
        for (const app of apps) if (!State.unlockedApps.includes(app)) State.unlockedApps.push(app);
        State.settings.briefingSeen = true;
        State.save();
    }, ALL_APPS);
}

export async function closeEverything(page) {
    await page.evaluate(() => {
        ui.dismissSystemModal?.();
        for (const id of Object.keys(system.windows)) system.closeApp(id);
        document.querySelectorAll('.achievement-toast, .achievement-overflow, .document-notification, .adversary-bark, .toast, .notification').forEach((t) => t.remove());
    });
}

export async function openEverything(page) {
    await page.evaluate((apps) => {
        ui.dismissSystemModal?.();
        for (const id of apps) if (State.unlockedApps.includes(id)) system.openApp(id);
    }, ALL_APPS);
}
