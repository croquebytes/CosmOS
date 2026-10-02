#!/usr/bin/env node
/**
 * SCN-ADV-002 — "End of Shift". The three endings.
 *
 *   node tests/endings.mjs
 *
 * What matters, in order:
 *   1. REACHABILITY, honestly gated. Not before the Mirror Login, not before
 *      an archived replay has been played to its ship, not on day one — and
 *      open the moment all of that is true.
 *   2. The relationship decides the ending, at the band edges, and the band
 *      is LOCKED when the scene is presented: a reload is not a re-roll.
 *   3. The modifier is a derived, permanent record that a reload can neither
 *      duplicate nor move in the fold.
 *   4. The other endings stay reachable, by a route that cannot be farmed.
 *   5. Nothing here touches the Mirror Login or the hook table.
 *
 * Fixtures are real ships. Every run is stated in reboot bars
 * (getPrestigeThreshold() * n over runSoulsBaseline) and every ship asserts
 * that the reboot happened — this project has been bitten six times by a
 * fixture that compared zero with zero.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/game.js'].map((f) => ({
    name: f,
    code: readFileSync(resolve(ROOT, f), 'utf8'),
}));
const DAY = 24 * 60 * 60 * 1000;

/* js/ui.js is not loaded (it is written against a live DOM; the scene's
   presentation is driven in tests/endings-e2e.mjs). `ui` is a recorder:
   named overrides win, everything else is a no-op that is counted. */
function boot(store = {}, overrides = {}) {
    const calls = {};
    const uiTarget = { ...overrides };
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        ui: new Proxy(uiTarget, {
            get: (target, prop) => {
                if (prop in target) return target[prop];
                return (...args) => { calls[prop] = (calls[prop] || 0) + 1; void args; };
            },
        }),
        system: new Proxy({}, { get: () => noop }),
        requestAnimationFrame: noop,
        window: {},
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(
        '({ State, Modifiers, ModifierTargets, Reality, game, AdversaryScene, AdversaryFinale,' +
        '   AdversaryBarks, AdversaryHookedTriggers, AchievementList })',
        ctx,
    );
    env.store = store;
    env.calls = calls;
    env.ui = uiTarget;
    return env;
}

const SEED = 20260726;

function fresh(store = {}, overrides = {}) {
    const env = boot(store, overrides);
    env.State.reality = {
        runSeed: SEED, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    return env;
}

/* Reload: a new realm reading the same storage, booted the way the game
   boots (State.load at parse time, then bootstrapModifiers). */
function reload(env, overrides = {}) {
    const next = boot(env.store, overrides);
    next.game.bootstrapModifiers(Date.now());
    return next;
}

function ship(env, { bars = 3, certifyOn = 'creation' } = {}) {
    const { State, game } = env;
    State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * bars;
    const before = State.prestigeLevel;
    game.performPrestige({ confirmed: true, certifyOn });
    assert.equal(State.prestigeLevel, before + 1, `fixture check: the reboot from ${before} did not happen`);
}

/* Climbs with the Mirror Login resolved, to reboot 12, then into an
   archived replay — and optionally all the way out of it. Built once and
   cloned per test through storage, which also makes every test a reload. */
function buildSave({ shipReplay = true, mirror = true } = {}) {
    const env = fresh();
    if (mirror) env.game.resolveAdversaryChoice('OP-B');
    while (env.State.prestigeLevel < 12) ship(env);
    assert.ok(env.game.archiveUnlocked(), 'fixture check: Archived is open at reboot 12');
    assert.ok(env.game.selectArchivedBuild(5), 'fixture check: picked an archived build');
    ship(env);
    assert.equal(env.State.reality.build.channel, 'archived', 'fixture check: the run is a replay');
    assert.equal(env.State.endings.archivedShips, 0, 'fixture check: starting a replay is not shipping one');
    if (shipReplay) {
        env.game.setBuildChannel('stable');
        ship(env);
        assert.equal(env.State.endings.archivedShips, 1, 'fixture check: the replay was shipped');
    }
    env.State.runtime.startTime = Date.now() - 2 * DAY;
    env.State.save();
    return { ...env.store };
}

const SAVES = {
    ready: buildSave(),
    midReplay: buildSave({ shipReplay: false }),
    noMirror: buildSave({ mirror: false }),
};

/* A booted copy of a fixture, with the relationship set. */
function at(name, { standing = 0, overrides = {} } = {}) {
    const env = boot({ ...SAVES[name] }, overrides);
    env.game.bootstrapModifiers(Date.now());
    env.State.adversary.standing = standing;
    return env;
}

/* Present and resolve one ending the way the scene does: the trigger locks
   the band, the record phase resolves it. */
function playThrough(env) {
    env.game.checkFinaleTrigger();
    const band = env.State.endings.pending;
    assert.ok(band, 'fixture check: the scene was presented');
    env.game.resolveEnding(band);
    return band;
}

/* Ship another archived replay, so the replay route re-arms. */
function replayAgain(env) {
    assert.ok(env.game.selectArchivedBuild(3), 'fixture check: picked another archived build');
    ship(env);
    env.game.setBuildChannel('stable');
    const before = env.State.endings.archivedShips;
    ship(env);
    assert.equal(env.State.endings.archivedShips, before + 1, 'fixture check: the second replay shipped');
}

const sameSet = (actual, expected, message) =>
    assert.equal([...actual].sort().join(','), [...expected].sort().join(','), message);

let passed = 0;
let failed = 0;
const check = (name, fn) => {
    try {
        fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (error) {
        failed++;
        console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`);
    }
};

console.log('\nEnd of Shift — the three endings\n');

/* ── The gate ──────────────────────────────────────────────────────────── */

check('the gate is shut on a fresh save', () => {
    const env = fresh();
    assert.equal(env.game.finaleBlocker(), 'no-relationship');
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale || 0, 0);
    assert.equal(env.State.endings.pending, null);
});

check('the gate is shut without the Mirror Login, however deep the save', () => {
    const env = at('noMirror');
    assert.equal(env.State.endings.archivedShips, 1, 'fixture check: the replay shipped');
    assert.equal(env.game.finaleBlocker(), 'no-relationship');
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale || 0, 0);
});

check('Archived open and a replay STARTED is not enough: it has to ship', () => {
    const env = at('midReplay');
    assert.ok(env.State.achievementProgress.prestige_count >= 13, 'fixture check: reboot 13');
    assert.equal(env.game.finaleBlocker(), 'archive');
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale || 0, 0, 'the scene fired inside the first replay');
});

check('the reboot clause holds even when the archive counter is forged', () => {
    const env = fresh();
    env.game.resolveAdversaryChoice('OP-B');
    env.State.endings.archivedShips = 4;
    env.State.runtime.startTime = Date.now() - 3 * DAY;
    assert.equal(env.game.finaleBlocker(), 'reboots');
});

check('shipping the replay opens it, and the trigger presents once', () => {
    const env = at('ready');
    assert.equal(env.game.finaleBlocker(), null);
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale, 1);
    assert.equal(env.State.endings.pending, 'curious');
    // Committed before presenting, so a broken render cannot lose it.
    const saved = JSON.parse(env.store.cosmos_save);
    assert.equal(saved.endings.pending, 'curious', 'pending was not saved before presenting');
});

check('a save younger than a day is held back, and one older is not', () => {
    const env = at('ready');
    env.State.runtime.startTime = Date.now() - DAY + 60000;
    assert.equal(env.game.finaleBlocker(), 'save-age');
    env.State.runtime.startTime = Date.now() - DAY - 60000;
    assert.equal(env.game.finaleBlocker(), null);
});

check('nonsense birth dates start the clock instead of opening the gate', () => {
    for (const bad of ['yesterday', -5, 0, null, Infinity, Date.now() + DAY, { t: 1 }]) {
        const env = at('ready');
        env.State.runtime.startTime = bad;
        env.game.normaliseEndings();
        assert.equal(typeof env.State.runtime.startTime, 'number');
        assert.equal(env.game.finaleBlocker(), 'save-age', `startTime ${JSON.stringify(bad)} opened the gate`);
    }
});

check('a satisfied gate defers behind an open modal and commits nothing', () => {
    let modal = true;
    const env = at('ready', { overrides: { isSystemModalOpen: () => modal } });
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale || 0, 0, 'painted over an open modal');
    assert.equal(env.State.endings.pending, null, 'committed the band while deferring');
    modal = false;
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale, 1, 'the deferred scene never came back');
});

check('it waits for the Mirror Login scene to close', () => {
    const env = at('ready', { overrides: { isAdversarySceneOpen: () => true } });
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale || 0, 0);
    assert.equal(env.State.endings.pending, null);
});

check('the simulator cannot reach it, and the trigger draws no randomness', () => {
    /* Headless the Mirror Login is contacted but never completed — the
       simulator's real state. Even with every other clause met, nothing. */
    const env = at('ready');
    env.State.adversary.sceneCompleted = false;
    let draws = 0;
    const real = Math.random;
    Math.random = () => { draws++; return real(); };
    try {
        for (let i = 0; i < 5; i++) env.game.checkFinaleTrigger();
        env.State.adversary.sceneCompleted = true;
        env.game.checkFinaleTrigger();           // presents
        env.game.checkFinaleTrigger();           // resume path
        env.game.resolveEnding(env.State.endings.pending);
    } finally {
        Math.random = real;
    }
    assert.equal(draws, 0, `${draws} random draws on the finale path`);
    assert.equal(env.calls.playFinale, 2);
});

check('the balance simulator never sets a sceneCompleted it could finish from', () => {
    const src = readFileSync(resolve(ROOT, 'tools/balance_sim.mjs'), 'utf8');
    assert.ok(!/sceneCompleted\s*=\s*true/.test(src), 'the simulator completes the Mirror Login');
    assert.ok(!/channel=archived|'archived'/.test(src), 'the simulator can choose Archived');
});

/* ── The relationship decides, at the band edges ───────────────────────── */

check('each band edge maps to its ending', () => {
    const cases = [[-12, 'hostile'], [-3, 'hostile'], [-2, 'curious'], [0, 'curious'],
        [2, 'curious'], [3, 'complicit'], [12, 'complicit']];
    for (const [standing, band] of cases) {
        const env = at('ready', { standing });
        const got = playThrough(env);
        assert.equal(got, band, `standing ${standing} played ${got}`);
        assert.equal(env.game.endingWorn(), band);
    }
});

check('each ending plays its own beats and no other ending\'s', () => {
    const env = at('ready');
    const prefix = { hostile: 'FIN-H-', curious: 'FIN-C-', complicit: 'FIN-X-' };
    for (const band of env.AdversaryFinale.BANDS) {
        const ids = env.game.finaleBeats(band).map((b) => b.id);
        assert.ok(ids.includes('FIN-001') && ids.includes('FIN-012'), `${band} lost the shared opening`);
        for (const [other, p] of Object.entries(prefix)) {
            assert.equal(ids.some((id) => id.startsWith(p)), other === band, `${band} carries ${other}'s lines`);
        }
    }
});

check('the band is locked at presentation: a reload mid-scene is not a re-roll', () => {
    const env = at('ready', { standing: 5 });
    env.game.checkFinaleTrigger();
    assert.equal(env.State.endings.pending, 'complicit');
    // The relationship moves while the scene is interrupted…
    env.State.adversary.standing = -8;
    env.State.save();
    const next = reload(env);
    assert.equal(next.State.endings.pending, 'complicit', 'the reload dropped or re-read the band');
    next.game.checkFinaleTrigger();
    assert.equal(next.calls.playFinale, 1, 'the interrupted scene did not resume');
    next.game.resolveEnding(next.State.endings.pending);
    assert.equal(next.game.endingWorn(), 'complicit');
});

check('three presentations that never draw resolve headlessly, as the locked band', () => {
    const env = at('ready', { standing: -6 });
    env.game.checkFinaleTrigger();
    env.State.endings.attempts = 3;
    env.State.adversary.standing = 6;               // moved since; must not matter
    env.game.checkFinaleTrigger();
    assert.equal(env.State.endings.pending, null);
    assert.equal(env.game.endingWorn(), 'hostile');
    assert.equal(env.calls.playFinale, 1, 'an exhausted scene was presented again');
});

/* ── The modifier ──────────────────────────────────────────────────────── */

const endingRecords = (env) => env.Modifiers.records.filter((r) => r.scope === 'ending');

check('the ending modifier is applied, and only by the ending', () => {
    const env = at('ready', { standing: -6 });
    const now = Date.now();
    const click = env.Modifiers.fold('click.power', now);
    const events = env.Modifiers.fold('events.spawnRate', now);
    assert.equal(endingRecords(env).length, 0, 'ending records before any ending');
    playThrough(env);
    assert.equal(endingRecords(env).length, 2);
    assert.ok(Math.abs(env.Modifiers.fold('click.power', now) - click * 1.2) < 1e-9, 'click power not ×1.2');
    assert.ok(Math.abs(env.Modifiers.fold('events.spawnRate', now) - events * 0.9) < 1e-12, 'events not ×0.9');
    assert.ok(Math.abs(env.State.manualClickPower - click * 1.2) < 1e-9, 'never committed to the scalar');
});

check('it survives a reload without moving in the fold', () => {
    /* The 2026-09-03 hazard. A later record that does not commute with
       `mul` sits BEHIND the ending record; drop-and-re-add on boot would
       hop the ending record to the back and turn (b×1.2)+5 into (b+5)×1.2. */
    const env = at('ready', { standing: -6 });
    playThrough(env);
    const now = Date.now();
    env.Modifiers.add({ target: 'click.power', op: 'add', value: 5, scope: 'run',
        source: { kind: 'test', id: 'later-purchase' }, label: 'bought after the ending' });
    env.Modifiers.commit(now);
    const value = env.Modifiers.fold('click.power', now);
    const order = env.Modifiers.records.filter((r) => r.target === 'click.power').map((r) => r.id);
    env.State.save();

    const next = reload(env);
    const after = next.Modifiers.fold('click.power', now);
    const afterOrder = next.Modifiers.records.filter((r) => r.target === 'click.power').map((r) => r.id);
    assert.equal(after, value, `click power moved on reload: ${value} -> ${after}`);
    assert.equal(afterOrder.join('|'), order.join('|'), 'the fold order changed on reload');
    const twice = reload(next);
    assert.equal(twice.Modifiers.fold('click.power', now), value, 'a second reload moved it');
});

check('it is never duplicated: not by re-applying, reloading, re-resolving or rebooting', () => {
    const env = at('ready', { standing: -6 });
    playThrough(env);
    for (let i = 0; i < 3; i++) env.game.applyEndings();
    env.game.resolveEnding('hostile');
    assert.equal(env.State.endings.history.length, 1, 'a second resolve filed a second record');
    assert.equal(endingRecords(env).length, 2);
    env.State.save();
    let next = reload(env);
    next = reload(next);
    assert.equal(endingRecords(next).length, 2, 'a reload duplicated the ending records');
    ship(next);
    assert.equal(endingRecords(next).length, 2, 'a reboot dropped or duplicated them');
    assert.ok(next.Modifiers.records.some((r) => r.scope === 'ending' && r.target === 'events.spawnRate'),
        'the ending record did not survive the reboot');
});

check('it does not touch the adversary patch\'s permanent records', () => {
    /* The reason it has its own scope. Reconciling 'permanent' would
       delete these, and nothing can regenerate them. */
    const env = at('ready', { standing: 6 });
    env.Modifiers.add({ id: 'adversary_patch_continuity', target: 'souls.multiplier', op: 'mul',
        value: 1.25, scope: 'permanent', source: 'adversary_patch', label: 'test' });
    env.Modifiers.commit(Date.now());
    playThrough(env);
    env.State.save();
    const next = reload(env);
    assert.equal(next.Modifiers.records.filter((r) => r.id === 'adversary_patch_continuity').length, 1,
        'the patch record was destroyed');
});

check('every seen ending keeps its modifier; the mark follows the latest', () => {
    const env = at('ready', { standing: -6 });
    playThrough(env);
    replayAgain(env);
    env.State.adversary.standing = 0;
    assert.equal(playThrough(env), 'curious');
    sameSet(endingRecords(env).map((r) => r.source.id), ['hostile', 'hostile', 'curious']);
    assert.equal(env.game.endingWorn(), 'curious');
});

/* ── The post-game mark ────────────────────────────────────────────────── */

check('the title and cosmetic persist across a reload and a reboot', () => {
    const env = at('ready', { standing: 6 });
    playThrough(env);
    env.State.save();
    const next = reload(env);
    assert.equal(next.game.endingWorn(), 'complicit');
    ship(next);
    assert.equal(next.game.endingWorn(), 'complicit', 'a reboot took the title away');
    const ending = next.AdversaryFinale.endings.complicit;
    assert.equal(ending.title, 'Operator Emeritus');
    assert.ok(ending.watermark && ending.identity, 'the cosmetic has nothing to show');
    // The mark is derived on the panel tick, so a reload cannot miss it.
    const ui = readFileSync(resolve(ROOT, 'js/ui.js'), 'utf8');
    const update = ui.slice(ui.indexOf('    update(now = Date.now(), force = false) {'));
    assert.ok(update.slice(0, update.indexOf('\n    },')).includes('this.applyPostGameMark()'),
        'ui.update no longer re-derives the post-game mark');
});

check('the idle game does not end: production, reboots and purchases all continue', () => {
    const env = at('ready', { standing: 0 });
    playThrough(env);
    const level = env.State.prestigeLevel;
    ship(env);
    ship(env);
    assert.equal(env.State.prestigeLevel, level + 2);
    assert.ok(env.game.getProductionRates(Date.now(), false).praise >= 0);
});

/* ── Seen endings and the replay route ─────────────────────────────────── */

check('a resolved ending files once, in order, and the scene stays shut', () => {
    const env = at('ready', { standing: 0 });
    playThrough(env);
    assert.equal(env.game.finaleBlocker(), 'replay-needed');
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale, 1, 'the scene re-fired with no new replay');
    // Moving the band alone is not enough either.
    env.State.adversary.standing = -9;
    assert.equal(env.game.finaleBlocker(), 'replay-needed');
});

check('a new replay with the same band does not re-run the ending', () => {
    const env = at('ready', { standing: 0 });
    playThrough(env);
    replayAgain(env);
    env.State.adversary.standing = 0;
    assert.equal(env.game.finaleBlocker(), 'band-seen');
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale, 1);
});

check('a new replay with a moved band opens the next ending, on the worn one', () => {
    const env = at('ready', { standing: -6 });
    playThrough(env);
    replayAgain(env);
    env.State.adversary.standing = 7;
    assert.equal(env.game.finaleBlocker(), null);
    env.game.checkFinaleTrigger();
    assert.equal(env.State.endings.pending, 'complicit');
    const ids = env.game.finaleBeats('complicit').map((b) => b.id);
    assert.ok(ids.includes('FIN-R-H'), 'the second visit does not remember the first');
    assert.equal(ids.indexOf('FIN-R-H'), ids.indexOf('FIN-011') + 1);
    assert.ok(!ids.includes('FIN-R-X'), 'it opened on an ending never seen');
});

check('all three: each achievement, then the fourth, and then the scene is done', () => {
    const env = at('ready', { standing: -6 });
    const got = [];
    for (const standing of [-6, 0, 6]) {
        if (got.length) replayAgain(env);
        env.State.adversary.standing = standing;
        got.push(playThrough(env));
        if (got.length === 2) assert.ok(!env.State.achievements['ACH-041'], 'all three after two');
    }
    assert.equal(got.join(','), 'hostile,curious,complicit');
    for (const id of ['ACH-038', 'ACH-039', 'ACH-040', 'ACH-041']) {
        assert.ok(env.State.achievements[id], `${id} not unlocked`);
    }
    replayAgain(env);
    assert.equal(env.game.finaleBlocker(), 'complete');
});

check('no ending achievement carries an economy reward', () => {
    const env = boot();
    for (const id of ['ACH-038', 'ACH-039', 'ACH-040', 'ACH-041']) {
        const a = env.AchievementList.find((x) => x.id === id);
        assert.ok(a, `${id} missing`);
        assert.equal(a.reward, null, `${id} pays a reward`);
    }
    assert.equal(new Set(env.AchievementList.map((a) => a.id)).size, env.AchievementList.length,
        'duplicate achievement id');
});

/* ── The artifact ──────────────────────────────────────────────────────── */

check('each ending files a document, generated from the table rather than the save', () => {
    for (const [standing, band] of [[-6, 'hostile'], [0, 'curious'], [6, 'complicit']]) {
        const env = at('ready', { standing });
        playThrough(env);
        const docs = env.game.endingDocuments();
        assert.equal(docs.length, 1);
        const doc = docs[0];
        assert.equal(doc.ending, band);
        assert.ok(doc.category in env.State.documents.categories, `${band} files under a category Notepad lacks`);
        assert.equal(doc.version, env.Reality.versionOfLevel(env.State.prestigeLevel));
        assert.ok(doc.letter.length && doc.release.length && doc.credits.length);
        assert.ok(env.game.generatedDocuments().some((d) => d.id === doc.id));
        assert.ok(!JSON.stringify(env.State.endings).includes(doc.letter[0].slice(0, 20)),
            'the document text was stored in the save');
    }
});

check('he signs the regressions when you believe he wrote them', () => {
    const env = at('ready', { standing: -6 });
    assert.match(env.game.regressionAttribution(), /void_mirror/);
    env.State.adversary.standing = 0;
    assert.equal(env.game.regressionAttribution(), null);
    env.State.adversary.standing = -6;
    playThrough(env);
    assert.match(env.game.regressionAttribution(), /before termination/);
    assert.equal(boot().game.regressionAttribution(), null, 'attributed before there was a relationship');
});

check('patched out means quiet: no barks after the hostile ending, barks after the others', () => {
    const real = Math.random;
    Math.random = () => 0;
    try {
        const hostile = at('ready', { standing: -6 });
        playThrough(hostile);
        hostile.State.adversary.barks.lastBarkTime = 0;
        for (const t of hostile.AdversaryHookedTriggers) {
            assert.equal(hostile.game.selectAdversaryBark(t), null, `he spoke on ${t} after termination`);
        }
        // And the receipts stop: the audit log no longer accrues.
        hostile.State.adversary.playerChoice = 'OP-A';
        hostile.game.grantAdversaryAuditLog();
        const entries = hostile.State.adversary.auditLogEntries;
        ship(hostile);
        assert.equal(hostile.State.adversary.auditLogEntries, entries, 'the audit log kept accruing after termination');
        const complicit = at('ready', { standing: 6 });
        playThrough(complicit);
        complicit.State.adversary.barks.lastBarkTime = 0;
        complicit.State.adversary.barks.cooldowns = {};
        complicit.State.adversary.barks.playCounts = {};
        assert.ok(complicit.game.selectAdversaryBark('open_recycle_bin'), 'the complicit ending silenced him');
    } finally {
        Math.random = real;
    }
});

/* ── Hostile saves ─────────────────────────────────────────────────────── */

function loadForged(endings, extra = {}) {
    const store = { ...SAVES.ready };
    const save = JSON.parse(store.cosmos_save);
    save.endings = endings;
    Object.assign(save, extra);
    store.cosmos_save = JSON.stringify(save);
    const env = boot(store);
    assert.doesNotThrow(() => env.game.bootstrapModifiers(Date.now()));
    return env;
}

check('a whole-object forgery normalises to an empty ledger', () => {
    for (const bad of ['complicit', 7, null, ['hostile'], true]) {
        const env = loadForged(bad);
        const e = env.State.endings;
        assert.ok(e && typeof e === 'object' && !Array.isArray(e), `endings ${JSON.stringify(bad)} survived`);
        assert.equal(e.history.length, 0);
        assert.equal(e.pending, null);
        assert.equal(endingRecords(env).length, 0, `endings ${JSON.stringify(bad)} applied a modifier`);
        assert.equal(e.archivedShips, 1, 'the archived count was not recovered from the release history');
    }
});

check('forged history entries are dropped, not repaired', () => {
    const env = loadForged({
        history: [
            { ending: 'curious', reboot: 14, ships: 1, at: 5 },
            { ending: 'curious', reboot: 15, ships: 1, at: 6 },          // duplicate
            { ending: 'admin', reboot: 14, ships: 1 },                    // not an ending
            { ending: 'hostile', reboot: '14', ships: 1 },                // string
            { ending: 'complicit', reboot: 14, ships: -1 },               // negative
            { ending: 'complicit', reboot: 1.5, ships: 0 },               // float
            null, 'hostile', [1, 2],
            { ending: '__proto__', reboot: 1, ships: 0 },
        ],
        pending: null, attempts: -4, archivedShips: 'many',
    });
    const e = env.State.endings;
    assert.equal(e.history.length, 1);
    assert.equal(e.history[0].ending, 'curious');
    assert.equal(e.attempts, 0);
    assert.equal(e.archivedShips, 1);
    sameSet(endingRecords(env).map((r) => r.source.id), ['curious']);
});

check('ships cannot exceed the replays that exist', () => {
    const env = loadForged({ history: [{ ending: 'hostile', reboot: 14, ships: 99 }], archivedShips: 1 });
    assert.equal(env.State.endings.history[0].ships, 1);
    assert.equal(env.game.finaleBlocker(), 'replay-needed', 'an inflated ships count re-armed the scene');
});

check('a forged pending ending cannot carry a save past the gate', () => {
    // Seen already: dropped.
    let env = loadForged({ history: [{ ending: 'hostile', reboot: 14, ships: 1 }], pending: 'hostile', archivedShips: 1 });
    assert.equal(env.State.endings.pending, null);
    // Seen already, on a save where the replay route IS open: still dropped,
    // or the scene would rerun an ending already on file.
    env = loadForged({ history: [{ ending: 'hostile', reboot: 14, ships: 1 }], pending: 'hostile', archivedShips: 2 });
    assert.equal(env.State.endings.archivedShips, 2, 'fixture check: the route is open');
    assert.equal(env.State.endings.pending, null, 'a seen ending was left pending');
    // Not an ending: dropped.
    env = loadForged({ history: [], pending: 'root', archivedShips: 1 });
    assert.equal(env.State.endings.pending, null);
    // A real band on a save that never shipped a replay: dropped.
    const store = { ...SAVES.midReplay };
    const save = JSON.parse(store.cosmos_save);
    save.endings = { history: [], pending: 'complicit', attempts: 0, archivedShips: 0 };
    store.cosmos_save = JSON.stringify(save);
    env = boot(store);
    env.game.bootstrapModifiers(Date.now());
    assert.equal(env.State.endings.pending, null, 'a pasted pending skipped the gate');
    env.game.checkFinaleTrigger();
    assert.equal(env.calls.playFinale || 0, 0);
    // A legitimate interrupted scene survives the same check.
    env = loadForged({ history: [], pending: 'complicit', attempts: 1, archivedShips: 1 });
    assert.equal(env.State.endings.pending, 'complicit', 'a real interrupted scene was dropped');
});

/* ── The Mirror Login is untouched ─────────────────────────────────────── */

check('the Mirror Login suite still passes, unmodified', () => {
    const out = execFileSync(process.execPath, [resolve(ROOT, 'tests/adversary-scene.mjs')], { encoding: 'utf8' });
    assert.match(out, /\b40 passed, 0 failed\b/, 'tests/adversary-scene.mjs changed shape or failed');
});

check('the Mirror Login fires on its own gate with the finale code present', () => {
    const env = fresh();
    env.State.totalStats.soulsGained = 800000;
    env.State.dimensions.void.unlocked = true;
    env.game.checkAdversaryTrigger();
    env.game.checkFinaleTrigger();
    assert.equal(env.State.adversary.contacted, true);
    assert.equal(env.calls.playAdversaryScene, 1);
    assert.equal(env.calls.playFinale || 0, 0, 'the finale fired over an unresolved Mirror Login');
    assert.equal(env.AdversaryScene.dialogue.length, 32);
});

check('no finale line id collides with a Mirror Login line', () => {
    const env = boot();
    const adv = new Set(env.AdversaryScene.dialogue.map((l) => l.id));
    const fin = [
        ...env.AdversaryFinale.opening,
        ...Object.values(env.AdversaryFinale.reentry),
        ...Object.values(env.AdversaryFinale.endings).flatMap((e) => e.beats),
    ].map((l) => l.id);
    assert.equal(new Set(fin).size, fin.length, 'duplicate finale id');
    assert.equal(fin.filter((id) => adv.has(id)).length, 0);
});

check('the hook table stays honest: the finale fires no bark trigger of its own', () => {
    /* tests/adversary-scene.mjs asserts set equality between what the code
       fires and AdversaryHookedTriggers. The finale's code must add nothing
       to the fired side, or that test is only passing because nobody added
       the new trigger to both lists at once. */
    const ui = readFileSync(resolve(ROOT, 'js/ui.js'), 'utf8');
    const game = readFileSync(resolve(ROOT, 'js/game.js'), 'utf8');
    const finUi = ui.slice(ui.indexOf('SCN-ADV-002 — "End of Shift"'), ui.indexOf('    displayAdversaryBark(bark) {'));
    const finGame = game.slice(game.indexOf('SCN-ADV-002 — "End of Shift". Content'), game.indexOf('// === PROPHET SYSTEM ==='));
    assert.ok(finUi.length > 1000 && finGame.length > 1000, 'fixture check: found the finale sources');
    for (const src of [finUi, finGame]) {
        assert.ok(!/triggerAdversaryBark\(/.test(src), 'the finale fires a bark');
    }
    const env = boot();
    assert.equal(env.AdversaryHookedTriggers.length, 16, 'the hooked trigger list changed');
});

/* ── Content ───────────────────────────────────────────────────────────── */

check('every ending is complete, and its modifier is small and real', () => {
    const env = boot();
    for (const band of env.AdversaryFinale.BANDS) {
        const e = env.AdversaryFinale.endings[band];
        assert.ok(e.title && e.label && e.watermark && e.identity, `${band} has no post-game mark`);
        assert.ok(e.beats.length >= 6 && e.release.length >= 3 && e.credits.length >= 4, `${band} is thin`);
        assert.ok(e.document.id.startsWith('END-') && e.letter.length && e.signoff, `${band} files nothing`);
        assert.ok(e.mods.length >= 1);
        for (const m of e.mods) {
            assert.ok(env.ModifierTargets[m.target], `${band}: unknown target ${m.target}`);
            assert.equal(m.op, 'mul', `${band}: a non-mul ending modifier needs a fold-order argument`);
            assert.ok(Math.abs(m.value - 1) <= 0.25, `${band}: ${m.target} ×${m.value} is not small`);
        }
        assert.ok(env.AdversaryFinale.reentry[band], `${band} has no re-entry line`);
    }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
