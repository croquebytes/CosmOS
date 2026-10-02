#!/usr/bin/env node
/**
 * The Dev Console's actions (js/devtools.js), driven with no DOM.
 *
 *   node tests/devtools.mjs
 *
 * The console is a tester's tool and edits the run through the game's own
 * functions, so what is tested is the STATE each action leaves, and that the
 * edit is marked:
 *
 *   1. The gate: localhost and its two literal forms, or ?dev=1, nothing else.
 *   2. Taint: any edit sets State.dev.tainted, it is saved, it survives a
 *      reload, an old save gains the default, and a snapshot or an export —
 *      which edit nothing — leave a clean run clean.
 *   3. Unlock everything installs every app and files every document, tape,
 *      reel and the Omniscient mail, through the modules' own accessors.
 *   4. Caps are modifier records (a direct write is overwritten): set not
 *      stacked, permanent, removable. Divinity keeps its multiplier in step.
 *   5. Ships are real ships in reboot-bar units, asserted. Presets climb to
 *      3 / 8 / 12, and "ending" reaches an OPEN finale gate (reboot 14 with
 *      an archived ship — the handoff's "13 + an archived ship" is not a
 *      state play can reach).
 *   6. Time: attended play steps at 5 s (Incidents ignores more) and ends at
 *      the real clock; offline writes the absence into the stored save.
 *   7. Presence override, incidents, cascade, NULL.OPERATOR, mail, Choir,
 *      Etherscape, achievements.
 *   8. Snapshots round-trip text with characters above U+00FF (the game's own
 *      export throws on them), restore reloads into a tainted copy, and the
 *      old run is kept in slot Z.
 *   9. URL parameters apply in order, once, and a built link reproduces the
 *      state it describes.
 *
 * Every ship asserts that the reboot happened and every fixture states its
 * runs in reboot bars (getPrestigeThreshold() * n) — the repo has been bitten
 * by a fixture that compared zero with zero.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const read = (f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') });
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/incidents.js', 'js/game.js',
    'js/solitaire.js', 'js/media.js', 'js/footage.js', 'js/choir.js', 'js/mail.js', 'js/etherscape.js',
    'js/devtools.js'].map(read);

const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

let passed = 0;
let failed = 0;
async function test(name, fn) {
    try { await fn(); passed++; console.log(`  ok    ${name}`); }
    catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n        ')}`); }
}

function boot(store = {}, { reload = false } = {}) {
    const calls = { reloads: [], played: [], opened: [], finale: 0, scene: 0 };
    const uiTarget = {
        escapeHtml,
        playFinale: () => { calls.finale++; },
        playAdversaryScene: () => { calls.scene++; },
    };
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise, Error,
        URLSearchParams, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        ui: new Proxy(uiTarget, { get: (t, k) => (k in t ? t[k] : noop) }),
        system: new Proxy({ openApp: (id) => calls.opened.push(id) }, { get: (t, k) => (k in t ? t[k] : noop) }),
        requestAnimationFrame: noop,
        window: {},
        // No createElement: headless, so the panel never mounts and no watch starts.
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(`({ State, PRISTINE, game, Modifiers, Reality, Incidents, Economy, AchievementList,
        DocumentManifest, MediaCatalog, MailCatalog, Mail, Choir, Etherscape, FootageCatalog, Footage, DevTools,
        AdversaryFinale })`, ctx);
    env.ctx = ctx;
    env.calls = calls;
    env.store = store;
    // A reload boots the way the page does — State.load at parse time, and
    // nothing saved before initializeSession (a save stamps lastUpdateTime).
    if (!reload) {
        env.State.reality = { runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
            instability: 0, cascadeTier: 0, alertedTier: 0, scars: [] };
        env.game.bootstrapModifiers(Date.now());
    }
    env.DevTools.hooks.reload = (options) => { calls.reloads.push(options || {}); };
    return env;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const sheet = (env, over = {}) => ({ hostname: 'localhost', search: '', ...over });

console.log('\nDev Console (vm)\n');

/* ── 1. the gate ─────────────────────────────────────────────────────── */

await test('the console is on for localhost, 127.0.0.1 and [::1], and for ?dev=1 — nothing else', () => {
    const { DevTools } = boot();
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) assert.equal(DevTools.enabled({ hostname, search: '' }), true, hostname);
    for (const hostname of ['cosmos.example.com', 'cosmos.localhost', 'localhost.evil.test', '10.0.0.7', '']) {
        assert.equal(DevTools.enabled({ hostname, search: '' }), false, `${hostname} must not enable it`);
        assert.equal(DevTools.enabled({ hostname, search: '?dev=0' }), false, `${hostname}?dev=0`);
        assert.equal(DevTools.enabled({ hostname, search: '?dev=1' }), true, `${hostname}?dev=1`);
    }
    assert.equal(DevTools.enabled(null), false);
});

/* ── 2. taint ────────────────────────────────────────────────────────── */

await test('a fresh run is clean; any edit taints it, counts it, and the save carries it through a reload', () => {
    const env = boot();
    assert.equal(env.State.dev.tainted, false);
    assert.equal(env.State.dev.actions, 0);
    const r = env.DevTools.actions.fillResources();
    assert.ok(r.ok, r.error);
    assert.equal(env.State.dev.tainted, true);
    assert.equal(env.State.dev.actions, 1);
    assert.ok(env.State.dev.since > 0);
    env.DevTools.actions.addDivinity(1);
    assert.equal(env.State.dev.actions, 2);
    const saved = JSON.parse(env.store.cosmos_save);
    assert.equal(saved.dev.tainted, true, 'the stored save is marked');
    const again = boot(env.store);
    assert.equal(again.State.dev.tainted, true, 'the mark survives a reload');
    assert.equal(again.State.dev.actions, 2);
});

await test('a failed edit still taints: the run may be half-edited', () => {
    const env = boot();
    const r = env.DevTools.actions.raiseCaps(0.5);
    assert.equal(r.ok, false);
    assert.match(r.error, /factor/);
    assert.equal(env.State.dev.tainted, true);
});

await test('a save from before the console gains the clean default; PRISTINE carries it', () => {
    const env = boot();
    assert.deepEqual(plain(env.PRISTINE.dev), { tainted: false, actions: 0, since: 0 });
    env.State.save();
    const blob = JSON.parse(env.store.cosmos_save);
    delete blob.dev;
    env.store.cosmos_save = JSON.stringify(blob);
    const old = boot(env.store);
    assert.deepEqual(plain(old.State.dev), { tainted: false, actions: 0, since: 0 });
});

await test('a snapshot, an export and a cue edit nothing, so a clean run stays clean', () => {
    const env = boot();
    assert.ok(env.DevTools.actions.snapshot('A').ok);
    assert.ok(env.DevTools.actions.exportSnapshot().ok);
    assert.equal(env.State.dev.tainted, false);
    assert.equal(env.State.dev.actions, 0);
});

/* ── 3. unlock everything ────────────────────────────────────────────── */

await test('unlock everything installs every app, opens the Void, files every document, tape and reel, and the Omniscient mail', () => {
    const env = boot();
    const r = env.DevTools.actions.unlockEverything();
    assert.ok(r.ok, r.error);
    const { State, DevTools } = env;
    for (const id of DevTools.ALL_APPS) assert.ok(State.unlockedApps.includes(id), `app ${id}`);
    assert.equal(State.dimensions.void.unlocked, true);
    assert.equal(State.documents.collected.length, env.DocumentManifest.length, 'every Notepad document');
    assert.deepEqual([...env.MediaCatalog.tapes.map((t) => t.id)].sort(), [...State.settings.media.tapes].sort(), 'every tape');
    assert.deepEqual([...env.FootageCatalog.reels.map((x) => x.id)].sort(), [...State.footage.found].sort(), 'every reel found');
    const mailed = State.mail.log.map((x) => x.id);
    for (const id of ['omni-01', 'omni-02', 'omni-03', 'omni-04']) assert.ok(mailed.includes(id), id);
    assert.equal(State.settings.media.cinematics, 'always');
    assert.equal(State.settings.briefingSeen, true);
    assert.ok(State.choir.posts.some((p) => p.id === 'welcome'), "Choir's welcome post, as the app files it");
});

await test('unlock everything is idempotent and does not stack documents or mail', () => {
    const env = boot();
    env.DevTools.actions.unlockEverything();
    const apps = env.State.unlockedApps.length;
    const mail = env.State.mail.log.length;
    const docs = env.State.documents.collected.length;
    assert.ok(env.DevTools.actions.unlockEverything().ok);
    assert.equal(env.State.unlockedApps.length, apps);
    assert.equal(env.State.mail.log.length, mail);
    assert.equal(env.State.documents.collected.length, docs);
    assert.equal(new Set(env.State.documents.collected).size, docs);
});

await test('cinematics: first, always and off are accepted; anything else is refused', () => {
    const env = boot();
    for (const mode of ['off', 'first', 'always']) {
        assert.ok(env.DevTools.actions.setCinematics(mode).ok);
        assert.equal(env.State.settings.media.cinematics, mode);
    }
    assert.equal(env.DevTools.actions.setCinematics('loud').ok, false);
    assert.equal(env.State.settings.media.cinematics, 'always');
});

/* ── 4. caps and divinity ────────────────────────────────────────────── */

await test('caps ×10 is a permanent modifier record: set not stacked, removable, and it survives a reboot', () => {
    const env = boot();
    const { State, Modifiers, DevTools, game } = env;
    Modifiers.commit(Date.now());
    const base = State.resourceCaps.souls;
    assert.ok(base > 0, 'fixture check: a real soul cap');
    assert.ok(DevTools.actions.raiseCaps(10).ok);
    assert.equal(State.resourceCaps.souls, base * 10);
    assert.equal(State.resources.souls, State.resourceCaps.souls, 'filled to the new cap');
    DevTools.actions.raiseCaps(10);
    Modifiers.commit(Date.now());
    assert.equal(State.resourceCaps.souls, base * 10, 'asking twice is still ×10');
    State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
    game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(State.prestigeLevel, 1, 'fixture check: the reboot happened');
    Modifiers.commit(Date.now());
    assert.equal(State.resourceCaps.souls, base * 10, 'permanent: a reboot does not drop it');
    assert.ok(DevTools.actions.raiseCaps(1).ok);
    assert.equal(State.resourceCaps.souls, base, 'raiseCaps(1) removes the dev records');
    assert.ok(!Modifiers.records.some((r) => r.source && r.source.kind === 'dev'));
});

await test('fill puts every primordial and void resource at its cap', () => {
    const env = boot();
    assert.ok(env.DevTools.actions.fillResources().ok);
    for (const key of Object.keys(env.State.resources)) {
        if (Number.isFinite(env.State.resourceCaps[key])) assert.equal(env.State.resources[key], env.State.resourceCaps[key], key);
    }
    const v = env.State.dimensions.void;
    for (const key of Object.keys(v.resources)) assert.equal(v.resources[key], v.resourceCaps[key], `void ${key}`);
});

await test('divinity keeps the multiplier in step with the total, and never goes negative', () => {
    const env = boot();
    const { State, Economy, DevTools } = env;
    assert.ok(DevTools.actions.addDivinity(10).ok);
    assert.equal(State.totalDivinityPoints, 10);
    assert.equal(State.divinityPointMultiplier, 1 + Math.pow(10, Economy.prestigeBonusExponent) * Economy.prestigeBonusScale);
    DevTools.actions.addDivinity(-100);
    assert.equal(State.totalDivinityPoints, 0);
    assert.equal(State.divinityPointMultiplier, 1);
    assert.equal(DevTools.actions.addDivinity(0).ok, false);
});

/* ── 5. ships and presets ────────────────────────────────────────────── */

await test('ship N builds: real ships, each asserted, in reboot bars; both reboot counters move together', () => {
    const env = boot();
    const { State, DevTools } = env;
    const r = DevTools.actions.shipBuilds(3);
    assert.ok(r.ok, r.error);
    assert.equal(State.prestigeLevel, 3);
    assert.equal(State.achievementProgress.prestige_count, 3, 'the second reboot counter');
    assert.ok(State.totalDivinityPoints >= 3, 'each ship paid Divinity');
    assert.equal(State.reality.history.length, 3, 'each ship is on the record');
    assert.ok(env.Reality.channelsFor(State.prestigeLevel).includes('beta'), 'Beta opens at 3');
    assert.equal(DevTools.actions.shipBuilds(0).ok, false);
    assert.equal(DevTools.actions.shipBuilds(61).ok, false);
});

await test('presets climb to Beta 3, Nightly 8, Archived 12; going back is refused and changes nothing', () => {
    const env = boot();
    const { State, DevTools, game } = env;
    assert.ok(DevTools.actions.preset('beta').ok);
    assert.equal(State.prestigeLevel, 3);
    assert.ok(DevTools.actions.preset('nightly').ok);
    assert.equal(State.prestigeLevel, 8);
    assert.ok(env.Reality.channelsFor(8).includes('nightly'));
    assert.ok(DevTools.actions.preset('archived').ok);
    assert.equal(State.prestigeLevel, 12);
    assert.equal(game.archiveUnlocked(), true, 'Archived is open at 12');
    const back = DevTools.actions.preset('beta');
    assert.equal(back.ok, false);
    assert.match(back.error, /already past/);
    assert.equal(State.prestigeLevel, 12, 'refused, not applied');
    assert.equal(DevTools.actions.preset('mythic').ok, false);
    assert.equal(DevTools.actions.rebootTo(5).ok, false);
});

await test('the ending preset reaches an OPEN finale gate: reboot 14, an archived ship, a day-old save, the Mirror Login answered', () => {
    const env = boot();
    const { State, DevTools, game } = env;
    const r = DevTools.actions.preset('ending', { band: 'complicit' });
    assert.ok(r.ok, r.error);
    assert.equal(State.prestigeLevel, 14);
    assert.equal(State.achievementProgress.prestige_count, 14);
    assert.equal(State.endings.archivedShips, 1, 'the replay was shipped');
    assert.equal(State.adversary.sceneCompleted, true);
    assert.equal(game.adversaryRelationship(), 'complicit', 'the band is set AFTER the climb, which drifts it hostile');
    assert.ok(Date.now() - State.runtime.startTime >= 2 * 24 * 60 * 60 * 1000 - 1000, 'a save old enough');
    assert.equal(game.finaleBlocker(), null, 'the real gate is open');
});

await test('the ending preset is idempotent from where it left the run', () => {
    const env = boot();
    env.DevTools.actions.preset('ending');
    const level = env.State.prestigeLevel;
    const ships = env.State.endings.archivedShips;
    assert.ok(env.DevTools.actions.preset('ending').ok);
    assert.equal(env.State.prestigeLevel, level, 'no further ships');
    assert.equal(env.State.endings.archivedShips, ships);
    assert.equal(env.game.finaleBlocker(), null);
});

/* ── 6. time and presence ────────────────────────────────────────────── */

await test('attended time steps at 5 s, never more, and ends at the real clock', () => {
    const env = boot();
    const { game, DevTools } = env;
    const seen = [];
    const real = game.tick;
    game.tick = (dt, now, opts) => { seen.push({ dt, now }); return real.call(game, dt, now, opts); };
    const before = Date.now();
    const r = DevTools.actions.advanceAttended(1);
    const after = Date.now();
    game.tick = real;
    assert.ok(r.ok, r.error);
    assert.equal(seen.length, 720, '1 h at 5 s');
    assert.ok(seen.every((s) => s.dt === 5), 'Incidents ignores any step above 5 s');
    assert.ok(seen.every((s, i) => i === 0 || s.now - seen[i - 1].now === 5000), 'a steady simulated clock');
    assert.ok(Math.abs(seen[seen.length - 1].now - after) < 2000, 'ends at the real clock, so nothing it stamped lies in the future');
    assert.ok(before - seen[0].now > 3590 * 1000, 'starts an hour ago');
    assert.equal(DevTools.actions.advanceAttended(0).ok, false);
    assert.equal(DevTools.actions.advanceAttended(25).ok, false);
});

await test('attended time runs the watchers: the mail clock advances by the hours played', () => {
    const env = boot();
    env.DevTools.actions.advanceAttended(1);
    const clock = env.State.mail.clock;
    assert.ok(clock >= 3540 && clock <= 3660, `mail clock ${clock}`);
});

await test('offline time writes the absence into the stored save, tainted, and reloads without testMode', () => {
    const env = boot();
    env.State.save();
    const t0 = Date.now();
    const r = env.DevTools.actions.advanceOffline(8);
    assert.ok(r.ok, r.error);
    assert.equal(env.calls.reloads.length, 1);
    assert.equal(env.calls.reloads[0].dropTestMode, true, 'testMode would hide the report');
    const blob = JSON.parse(env.store.cosmos_save);
    assert.ok(Math.abs(blob.runtime.lastUpdateTime - (t0 - 8 * 3600 * 1000)) < 5000);
    assert.equal(blob.dev.tainted, true);
    assert.equal(blob.saveVersion, env.State.SAVE_VERSION, 'stamped, so no migration reruns');
    assert.equal(env.State.suppressUnloadSave, true, 'the unload save must not undo it');
    assert.equal(env.DevTools.actions.advanceOffline(0).ok, false);
});

await test('a reloaded offline save runs the real offline accrual', () => {
    const env = boot();
    env.DevTools.actions.shipBuilds(1);
    Object.assign(env.State.automatons, { seraphCount: 40 });
    env.DevTools.actions.advanceOffline(4);
    const back = boot(env.store, { reload: true });
    const report = back.game.initializeSession();
    assert.ok(report, 'an offline report');
    assert.ok(report.elapsedSeconds >= 4 * 3600 - 10, `elapsed ${report.elapsedSeconds}`);
});

await test('presence override: away and present hold against real input, auto hands the real function back', () => {
    const env = boot();
    const { game, DevTools } = env;
    const original = game.isPresent;
    game.presenceTracking = true;
    game.notePresence(Date.now());
    assert.equal(game.isPresent(Date.now()), true);
    DevTools.actions.setPresence('away');
    game.notePresence(Date.now());
    assert.equal(game.isPresent(Date.now()), false, 'input does not bring him back');
    assert.equal(DevTools.presence(), 'away');
    DevTools.actions.setPresence('present');
    game.lastInputAt = 0;
    assert.equal(game.isPresent(Date.now()), true, 'present even with no input');
    DevTools.actions.setPresence('auto');
    assert.equal(game.isPresent, original, 'the real function is restored, not a copy');
    assert.equal(game.isPresent(Date.now()), false, 'real input: lastInputAt is 0');
    assert.equal(DevTools.actions.setPresence('sideways').ok, false);
});

/* ── 7. incidents, cascade, NULL.OPERATOR, world apps, achievements ──── */

await test('incidents: SEV-1/2/3 and a false alarm file as asked; the queue holds three; clear empties it', () => {
    const env = boot();
    const { Incidents, DevTools } = env;
    assert.ok(DevTools.actions.fileIncident(1).ok);
    assert.equal(Incidents.state().open[0].severity, 1);
    assert.ok(DevTools.actions.clearIncidents().ok);
    assert.equal(Incidents.state().open.length, 0);
    assert.ok(DevTools.actions.fileIncident(2).ok);
    assert.equal(Incidents.state().open[0].severity, 2);
    assert.ok(DevTools.actions.fileIncident(3, true, 'altar_overflow').ok);
    const alarm = Incidents.state().open[1];
    assert.equal(alarm.severity, 3, 'a false alarm files as SEV-3');
    assert.equal(alarm.falseAlarm, true);
    assert.ok(DevTools.actions.fileIncident(3).ok);
    const full = DevTools.actions.fileIncident(1);
    assert.equal(full.ok, false);
    assert.match(full.error, /queue is full/);
    assert.ok(DevTools.actions.clearIncidents().ok);
    assert.equal(Incidents.state().open.length, 0);
    assert.equal(DevTools.actions.fileIncident(4).ok, false);
    assert.equal(DevTools.actions.fileIncident(1, false, 'nonsense').ok, false);
});

await test('cascade: each tier sets the tier’s threshold, writes the tier, and 0 clears it', () => {
    const env = boot();
    const { State, Economy, DevTools } = env;
    for (let t = 1; t <= Economy.cascadeTiers.length; t++) {
        const r = DevTools.actions.setCascade(t);
        assert.ok(r.ok, r.error);
        assert.equal(State.reality.instability, Economy.cascadeTiers[t - 1].at);
        assert.equal(State.reality.cascadeTier, t, `tier ${t}`);
        assert.equal(State.reality.alertedTier, t, 'no alert dialog by default');
    }
    assert.ok(DevTools.actions.setCascade(0).ok);
    assert.equal(State.reality.instability, 0);
    assert.equal(State.reality.cascadeTier, 0);
    assert.equal(DevTools.actions.setCascade(9).ok, false);
});

await test('NULL.OPERATOR: answer, set the band, trigger the scene, reset — and a resolved login is not re-run by accident', () => {
    const env = boot();
    const { State, DevTools, game, Modifiers, calls } = env;
    assert.ok(DevTools.actions.resolveMirror('A').ok);
    assert.equal(State.adversary.sceneCompleted, true);
    assert.equal(State.adversary.standing, -4);
    assert.ok(State.recycleBin.items.some((i) => i.id === 'adversary_patch'), 'the patch was filed');
    assert.equal(DevTools.actions.resolveMirror('B').ok, false, 'already resolved');
    assert.equal(DevTools.actions.mirrorLogin().ok, false, 'already resolved');
    assert.equal(calls.scene, 0);
    for (const [band, standing] of [['hostile', -4], ['curious', 0], ['complicit', 4]]) {
        assert.ok(DevTools.actions.setStanding(band).ok);
        assert.equal(State.adversary.standing, standing);
        assert.equal(game.adversaryRelationship(), band);
    }
    assert.equal(DevTools.actions.setStanding('furious').ok, false);

    Modifiers.add({ id: 'adversary_patch_toll', target: 'praise.multiplier', op: 'mul', value: 0.9, scope: 'permanent', source: 'adversary_patch', label: 'patch' });
    assert.ok(DevTools.actions.resetNullOperator().ok);
    assert.deepEqual(plain(State.adversary), plain(env.PRISTINE.adversary));
    assert.ok(!State.recycleBin.items.some((i) => i.id === 'adversary_patch' || i.id === 'adversary_audit'));
    assert.ok(!Modifiers.records.some((r) => String(r.id).startsWith('adversary_patch')), 'the bare-string-source records go too');
    assert.ok(DevTools.actions.mirrorLogin().ok);
    assert.equal(calls.scene, 1, 'the scene was asked for');
    assert.equal(State.adversary.contacted, true);
});

await test('End of Shift with the gate bypassed presents the scene for the current band', () => {
    const env = boot();
    env.DevTools.actions.resolveMirror('B');
    env.DevTools.actions.setStanding('hostile');
    assert.notEqual(env.game.finaleBlocker(), null, 'fixture check: the real gate is shut on day one');
    const r = env.DevTools.actions.endOfShift();
    assert.ok(r.ok, r.error);
    assert.equal(env.State.endings.pending, 'hostile');
    assert.equal(env.State.endings.attempts, 0);
    assert.equal(env.calls.finale, 1);
});

await test('reset endings clears the history, the archived ship count and the archived records', () => {
    const env = boot();
    env.DevTools.actions.preset('ending');
    assert.equal(env.State.endings.archivedShips, 1);
    env.game.resolveEnding('curious');
    assert.equal(env.State.endings.history.length, 1, 'fixture check: an ending was recorded');
    assert.ok(env.DevTools.actions.resetEndings().ok);
    assert.deepEqual(plain(env.State.endings), plain(env.PRISTINE.endings));
    assert.ok(!env.State.reality.history.some((r) => r.channel === 'archived'));
    assert.equal(env.game.finaleBlocker(), 'archive', 'the gate wants an archived ship again');
});

await test('mail: all, one, idempotent, and the Mail app is installed', () => {
    const env = boot();
    const { State, DevTools, MailCatalog } = env;
    assert.ok(DevTools.actions.deliverMail('omni-02').ok);
    assert.deepEqual(plain(State.mail.log.map((r) => r.id)), ['omni-02']);
    assert.ok(State.unlockedApps.includes('mail'));
    assert.equal(DevTools.actions.deliverMail('no-such-message').ok, false);
    assert.ok(DevTools.actions.deliverMail('all').ok);
    assert.equal(State.mail.log.length, MailCatalog.messages.length);
    assert.equal(new Set(State.mail.log.map((r) => r.id)).size, MailCatalog.messages.length, 'no duplicates');
    assert.ok(DevTools.actions.deliverMail('all').ok);
    assert.equal(State.mail.log.length, MailCatalog.messages.length);
});

await test('Choir: a sample post is a valid post — it survives the module’s own validation and reaches the feed', () => {
    const env = boot();
    for (const kind of ['ambient.base', 'ambient.null', 'ambient.fate', 'patience', 'cascade.status']) {
        const r = env.DevTools.actions.choirPost(kind);
        assert.ok(r.ok, `${kind}: ${r.error}`);
    }
    assert.ok(env.State.unlockedApps.includes('choir'));
    env.State.choir = plain(env.State.choir);          // a reload: Choir re-validates a state it has not seen
    const feed = env.Choir.feed(Date.now());
    const kinds = feed.map((p) => p.kind);
    for (const kind of ['ambient.base', 'ambient.null', 'ambient.fate', 'patience', 'cascade.status']) {
        assert.ok(kinds.includes(kind), `${kind} reached the feed (got ${kinds.join(', ')})`);
    }
    assert.equal(env.DevTools.actions.choirPost('nonsense').ok, false);
});

await test('Etherscape: a locked page is filed as unlocked and the app installed; an unknown page is refused', () => {
    const env = boot();
    const url = 'cosmopedia://void';
    assert.ok(env.Etherscape.known().includes(url));
    assert.ok(env.DevTools.actions.openEtherscape(url).ok);
    assert.ok(env.Etherscape.store().unlocked.includes(url));
    assert.ok(env.State.unlockedApps.includes('etherscape'));
    assert.equal(env.DevTools.actions.openEtherscape('nowhere://').ok, false);
});

await test('achievements: unlock all, then reset (bonuses back to pristine)', () => {
    const env = boot();
    const { State, DevTools, AchievementList } = env;
    assert.ok(DevTools.actions.unlockAchievements().ok);
    for (const a of AchievementList) assert.ok(State.achievements[a.id] && State.achievements[a.id].unlocked, a.id);
    assert.ok(DevTools.actions.resetAchievements().ok);
    assert.deepEqual(plain(State.achievements), {});
    assert.deepEqual(plain(State.achievementBonuses), plain(env.PRISTINE.achievementBonuses));
});

/* ── 8. snapshots ────────────────────────────────────────────────────── */

await test('snapshot text round-trips characters above U+00FF — the game’s own export throws on them', () => {
    const env = boot();
    env.DevTools.actions.raiseCaps(10);                      // labels carry “×”; cascade labels carry “—”
    env.DevTools.actions.setCascade(2);
    const raw = env.store.cosmos_save;
    assert.ok(/[^\x00-\xff]/.test(raw), 'fixture check: the save really carries a non-Latin1 character');
    assert.throws(() => btoa(raw), 'fixture check: this is the failure the console avoids');
    const text = env.DevTools.encodeSnapshot(raw);
    assert.ok(text.startsWith('COSMOS-DEV1:'));
    assert.equal(env.DevTools.decodeSnapshot(text), raw);
    assert.equal(env.DevTools.decodeSnapshot(`  \n${text}\n `), raw, 'whitespace around it');
    assert.equal(env.DevTools.decodeSnapshot(raw), raw, 'plain JSON is accepted');
    const legacy = btoa(JSON.stringify({ resources: { praise: 1 } }));
    assert.deepEqual(JSON.parse(env.DevTools.decodeSnapshot(legacy)), { resources: { praise: 1 } }, 'the game’s own export is accepted');
    for (const bad of ['', 'not a save', 'COSMOS-DEV1:@@@@', JSON.stringify({ nothing: 1 })]) {
        assert.throws(() => env.DevTools.decodeSnapshot(bad), undefined, `rejects ${JSON.stringify(bad).slice(0, 30)}`);
    }
});

await test('slots A/B/C keep a run in their own key; restore reloads into a tainted copy and stashes the run it replaced in Z', () => {
    const env = boot();
    env.DevTools.actions.shipBuilds(2);
    assert.ok(env.DevTools.actions.snapshot('A').ok);
    const keptLevel = env.State.prestigeLevel;
    env.DevTools.actions.shipBuilds(3);
    assert.equal(env.State.prestigeLevel, keptLevel + 3);
    const slots = JSON.parse(env.store.cosmos_dev_slots);
    assert.ok(slots.A.raw && slots.A.summary.includes(`reboot ${keptLevel}`), slots.A.summary);

    const r = env.DevTools.actions.restore('A');
    assert.ok(r.ok, r.error);
    assert.equal(env.calls.reloads.length, 1);
    assert.equal(env.State.suppressUnloadSave, true);
    const after = boot(env.store);
    assert.equal(after.State.prestigeLevel, keptLevel, 'the run came back');
    assert.equal(after.State.dev.tainted, true, 'a restored run is a dev run');
    const z = after.DevTools.readSlots().Z;
    assert.ok(z && z.summary.includes(`reboot ${keptLevel + 3}`), 'the run it replaced is in Z');
    assert.ok(after.DevTools.readSlots().A, 'the slot survives');
    assert.equal(after.DevTools.actions.restore('B').ok, false, 'an empty slot');
    assert.equal(after.DevTools.actions.snapshot('Q').ok, false);
    assert.ok(after.DevTools.actions.clearSlot('A').ok);
    assert.equal(after.DevTools.readSlots().A, undefined);
});

await test('import: pasted text becomes the run, tainted, and the run it replaced goes to Z', () => {
    const donor = boot();
    donor.DevTools.actions.preset('beta');
    const text = donor.DevTools.encodeSnapshot(donor.store.cosmos_save);
    const env = boot();
    assert.equal(env.State.prestigeLevel, 0);
    const r = env.DevTools.actions.importSnapshot(text);
    assert.ok(r.ok, r.error);
    assert.equal(env.calls.reloads.length, 1);
    const after = boot(env.store);
    assert.equal(after.State.prestigeLevel, 3);
    assert.equal(after.State.dev.tainted, true);
    assert.ok(after.DevTools.readSlots().Z);
    assert.equal(env.DevTools.actions.importSnapshot('garbage').ok, false);
    assert.equal(env.calls.reloads.length, 1, 'a bad paste reloads nothing');
});

await test('fresh save clears the run, keeps the slots, and stashes the run in Z', () => {
    const env = boot();
    env.DevTools.actions.shipBuilds(1);
    env.DevTools.actions.snapshot('B');
    const r = env.DevTools.actions.freshSave();
    assert.ok(r.ok, r.error);
    assert.equal('cosmos_save' in env.store, false);
    assert.equal(env.calls.reloads.length, 1);
    assert.equal(env.State.suppressUnloadSave, true);
    const fresh = boot(env.store);
    assert.equal(fresh.State.prestigeLevel, 0);
    assert.equal(fresh.State.dev.tainted, false, 'a new run is clean');
    assert.ok(fresh.DevTools.readSlots().B, 'the slots survive');
    assert.ok(fresh.DevTools.readSlots().Z, 'the old run is in Z');
});

/* ── 9. URL parameters ───────────────────────────────────────────────── */

await test('?dev=1&unlockAll=1&reboot=12&cinematics=always reproduces the state it names', () => {
    const env = boot();
    const applied = env.DevTools.applyParams('?dev=1&unlockAll=1&reboot=12&cinematics=always');
    assert.deepEqual([...applied], ['unlockAll', 'reboot', 'cinematics']);
    assert.equal(env.State.prestigeLevel, 12);
    assert.equal(env.State.settings.media.cinematics, 'always');
    for (const id of env.DevTools.ALL_APPS) assert.ok(env.State.unlockedApps.includes(id), id);
    assert.equal(env.State.dev.tainted, true);
    assert.equal(env.game.archiveUnlocked(), true);
});

await test('parameters apply in a fixed order whatever order they are written in, and unknown ones are ignored', () => {
    const a = boot();
    const b = boot();
    a.DevTools.applyParams('?standing=hostile&mirror=B&reboot=5&bogus=1&unlockAll=1&dev=1');
    b.DevTools.applyParams('?dev=1&unlockAll=1&mirror=B&reboot=5&standing=hostile');
    for (const env of [a, b]) {
        assert.equal(env.State.prestigeLevel, 5);
        assert.equal(env.State.adversary.sceneCompleted, true, 'mirror= answered it first');
        assert.equal(env.State.adversary.standing, -4, 'standing= lands after the ships that drift it');
    }
    assert.deepEqual(plain(a.State.unlockedApps).sort(), plain(b.State.unlockedApps).sort());
});

await test('preset=, caps=, divinity=, achievements=, incident=, cascade=, presence=, attended= and mail= apply', () => {
    const env = boot();
    env.DevTools.applyParams('?preset=beta&caps=10&divinity=5&achievements=all&incident=2&cascade=1&presence=away&mail=all');
    const { State, Incidents, game, MailCatalog } = env;
    assert.equal(State.prestigeLevel, 3);
    assert.ok(State.totalDivinityPoints >= 5 + 3);
    assert.ok(Object.keys(State.achievements).length > 10);
    assert.equal(Incidents.state().open[0].severity, 2);
    assert.equal(State.reality.cascadeTier, 1);
    assert.equal(env.DevTools.presence(), 'away');
    assert.equal(State.mail.log.length, MailCatalog.messages.length);
    assert.equal(game.isPresent(Date.now()), false);
});

await test('a built link reproduces the state it describes, through the same parameter path', () => {
    const link = boot().DevTools.buildLink({ unlockAll: true, preset: 'archived', cinematics: 'always', standing: 'hostile', fresh: true });
    assert.match(link, /dev=1/);
    assert.match(link, /fresh=1/);
    assert.match(link, /unlockAll=1/);
    assert.match(link, /preset=archived/);
    assert.match(link, /standing=hostile/);
    const env = boot();
    env.DevTools.applyParams(link.slice(link.indexOf('?')).replace('fresh=1', ''));
    assert.equal(env.State.prestigeLevel, 12);
    assert.equal(env.State.adversary.standing, -4);
    assert.equal(env.State.settings.media.cinematics, 'always');
    assert.equal(env.DevTools.buildLink({ reboot: 7 }).split('?')[1], 'dev=1&reboot=7');
    assert.equal(env.DevTools.buildLink({}).split('?')[1], 'dev=1');
});

/* ── 10. the economy ─────────────────────────────────────────────────── */

await test('the console does not run on its own: loading it changes nothing until something calls it', () => {
    const env = boot();
    const clean = boot();
    env.State.save();
    assert.equal(env.State.dev.tainted, false);
    assert.equal(env.State.dev.actions, 0);
    assert.equal(env.calls.reloads.length, 0);
    assert.equal(env.DevTools.presence(), 'auto');
    assert.deepEqual(plain(env.State.resources), plain(clean.State.resources));
    assert.deepEqual(plain(env.Modifiers.records.map((r) => r.id)).sort(), plain(clean.Modifiers.records.map((r) => r.id)).sort());
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
