#!/usr/bin/env node
/**
 * The media layer — settings, decisions, tape unlocks, the tape clock, and
 * the cinematic queue.
 *
 *   node tests/media.mjs
 *
 * The properties that matter, stated so a test cannot quietly assert a
 * neighbouring one instead:
 *
 *   - With no reels installed the game behaves exactly as before. So: a scene
 *     whose file is missing never reaches the renderer, and a probe that the
 *     dev server answers with index.html counts as missing.
 *   - A cinematic never paints over a system dialog. It queues while the
 *     modal slot is taken and plays when it clears, in the order requested,
 *     one at a time — and a dialog that lands DURING the probe sends it back
 *     to the queue rather than under the dialog.
 *   - Seen means seen. Queued, interrupted and failed reels are not marked
 *     (the cc11f22 mistake, for cascade alerts, avoided up front).
 *   - Hostile saves. `x = x || default` keeps every truthy wrong value
 *     (335f41f), so the normaliser is tested with wrong values that are truthy.
 *   - The tapes teach the game that exists: every art path is a shipped file,
 *     every cue is a sound js/audio.js defines, captions fit their shots, and
 *     T1 unlocks from the real Miracle code path within the first minutes.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const read = (f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') });
const GAME = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/game.js'].map(read);
const MEDIA = read('js/media.js');
const AUDIO = read('js/audio.js');

function boot({ store = {}, withMedia = true, withAudio = false } = {}) {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        ui: new Proxy({}, { get: () => noop }),
        system: new Proxy({}, { get: () => noop }),
        requestAnimationFrame: noop,
        window: {},
        // No createElement: the same headless shape every other vm suite uses.
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    const files = [...GAME];
    if (withAudio) files.push(AUDIO);
    if (withMedia) files.push(MEDIA);
    for (const src of files) vm.runInContext(src.code, ctx, { filename: src.name });
    const names = ['State', 'game', 'Economy'];
    if (withMedia) names.push('media', 'MediaLogic', 'MediaCatalog', 'createMediaDirector');
    if (withAudio) names.push('audio');
    const env = vm.runInContext(`({ ${names.join(', ')} })`, ctx);
    env.store = store;
    env.ctx = ctx;
    return env;
}

// Values from inside the vm carry that context's prototypes; compare plain.
const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 6) { for (let i = 0; i < n; i++) await tick(); }

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const E = boot();
const { MediaLogic: L, MediaCatalog: C } = E;

/* ── A fake page for the director ──────────────────────────────────────── */
function fakeStage(overrides = {}) {
    const log = [];
    const timers = [];
    const s = { modal: false, settings: { cinematics: 'first', vhs: true, seen: [], tapes: [], watched: [] },
                avail: {}, renderOutcome: 'played', ...overrides };
    const pendingRenders = [];
    const env = {
        settings: () => s.settings,
        known: (id) => s.avail[id],
        probe: async (id) => { log.push(`probe:${id}`); return s.probeResult ? s.probeResult(id) : !!s.availOnProbe?.[id]; },
        isBlocked: () => s.modal,
        render: (id) => {
            log.push(`render:${id}`);
            if (s.manualRender) return new Promise((resolve) => pendingRenders.push({ id, resolve }));
            return Promise.resolve(typeof s.renderOutcome === 'function' ? s.renderOutcome(id) : s.renderOutcome);
        },
        markSeen: (id) => { log.push(`seen:${id}`); if (!s.settings.seen.includes(id)) s.settings.seen.push(id); },
        schedule: (fn) => timers.push(fn),
    };
    const d = E.createMediaDirector(env);
    // A blocked queue reschedules itself forever, by design; run a bounded
    // number of rounds, the way a real clock would over a few seconds.
    const runTimers = async (rounds = 5) => {
        for (let i = 0; i < rounds && timers.length; i++) {
            const due = timers.splice(0);
            for (const fn of due) fn();
            await settle();
        }
    };
    return { d, s, log, timers, runTimers, pendingRenders };
}

/* ═════════════════════════════ Settings ═════════════════════════════ */

test('defaults: First time only, VHS on, nothing seen or filed', () => {
    assert.deepEqual(plain(L.normalise(undefined)), { cinematics: 'first', vhs: true, seen: [], tapes: [], watched: [] });
});

test('State schema carries the same defaults (no SAVE_VERSION bump needed)', () => {
    assert.deepEqual(plain(E.State.settings.media), plain(L.defaults()));
});

test('normalise: hostile shapes are repaired, never trusted, never thrown on', () => {
    for (const raw of [null, 'media', 7, [], true, { cinematics: 1 }]) {
        assert.deepEqual(plain(L.normalise(raw)), plain(L.defaults()), `shape ${JSON.stringify(raw)}`);
    }
    // Truthy wrong values: the `x || default` trap.
    const out = plain(L.normalise({
        cinematics: 'sometimes', vhs: 'no',
        seen: 'cold-boot',
        tapes: ['t9', 't3', 't1', 't3', 42, '__proto__'],
        watched: ['t2', 't1', 't1'],
    }));
    assert.equal(out.cinematics, 'first');
    assert.equal(out.vhs, true, 'a string is not a boolean');
    assert.deepEqual(out.seen, [], 'a string is not a seen-set');
    assert.deepEqual(out.tapes, ['t1', 't3'], 'unknown and duplicate tapes dropped, catalogue order');
    assert.deepEqual(out.watched, ['t1'], 'a tape cannot be watched before it is filed');
});

test('normalise: legitimate values survive, including falsy ones', () => {
    const out = plain(L.normalise({ cinematics: 'off', vhs: false, seen: ['void-breach', 'nope', 'void-breach'], tapes: ['t6'], watched: [] }));
    assert.equal(out.cinematics, 'off');
    assert.equal(out.vhs, false, 'false is a real choice, not a missing one');
    assert.deepEqual(out.seen, ['void-breach']);
    assert.deepEqual(out.tapes, ['t6']);
});

test('a save written before media existed gains the defaults on load', () => {
    const first = boot();
    const save = JSON.parse(JSON.stringify(first.State));
    delete save.settings.media;
    const env = boot({ store: { cosmos_save: JSON.stringify(save) } });
    assert.deepEqual(plain(env.media.settings()), plain(L.defaults()));
});

test('a hostile save is normalised in place by media.settings()', () => {
    const first = boot();
    const save = JSON.parse(JSON.stringify(first.State));
    save.settings.media = { cinematics: 'always', vhs: 1, seen: ['first-seraph', 9], tapes: 'all', junk: true };
    const env = boot({ store: { cosmos_save: JSON.stringify(save) } });
    const s = plain(env.media.settings());
    assert.deepEqual(s, { cinematics: 'always', vhs: true, seen: ['first-seraph'], tapes: [], watched: [] });
    assert.equal('junk' in env.State.settings.media, false);
});

/* ═════════════════════════════ Decisions ═════════════════════════════ */

test('decide: Off never even probes', () => {
    assert.equal(L.decide('first-seraph', { cinematics: 'off', seen: [] }, undefined), 'off');
});

test('decide: First time only skips a scene already seen; Always does not', () => {
    assert.equal(L.decide('void-breach', { cinematics: 'first', seen: ['void-breach'] }, true), 'seen');
    assert.equal(L.decide('void-breach', { cinematics: 'always', seen: ['void-breach'] }, true), 'play');
});

test('decide: a missing reel is skipped; an unprobed one is probed; unknown ids refused', () => {
    assert.equal(L.decide('ship-the-build', L.defaults(), false), 'missing');
    assert.equal(L.decide('ship-the-build', L.defaults(), undefined), 'probe');
    assert.equal(L.decide('ship-the-build', L.defaults(), true), 'play');
    assert.equal(L.decide('the-sequel', L.defaults(), true), 'unknown');
});

test('probe: the dev server\'s index.html fallback is a miss, whatever the status', () => {
    assert.equal(L.responseIsMedia(true, 'text/html', 'video'), false);
    assert.equal(L.responseIsMedia(true, 'text/html; charset=utf-8', 'video'), false);
    assert.equal(L.responseIsMedia(false, 'video/webm', 'video'), false, '404');
    assert.equal(L.responseIsMedia(true, 'video/webm', 'video'), true);
    assert.equal(L.responseIsMedia(true, 'video/mp4', 'video'), true);
    assert.equal(L.responseIsMedia(true, 'image/webp', 'image'), true);
    assert.equal(L.responseIsMedia(true, 'image/webp', 'video'), false);
    assert.equal(L.responseIsMedia(true, 'application/octet-stream', 'video'), true);
    assert.equal(L.responseIsMedia(true, '', 'video'), true);
});

test('seen outcomes: played, skipped and reduced count; the rest do not', () => {
    for (const o of ['played', 'skipped', 'reduced']) assert.equal(L.countsAsSeen(o), true, o);
    for (const o of ['interrupted', 'error', 'missing', 'blocked', 'queued', 'off']) assert.equal(L.countsAsSeen(o), false, o);
});

/* ═════════════════════════════ The director ═════════════════════════════ */

test('director: a missing reel never reaches the renderer and is not seen', async () => {
    const f = fakeStage({ availOnProbe: {} });
    const out = await f.d.play('first-seraph');
    assert.equal(out, 'missing');
    assert.deepEqual(f.log, ['probe:first-seraph']);
    assert.equal(f.d.busy(), false);
});

test('director: a reel known missing is decided without a probe or a hold', async () => {
    const f = fakeStage({ avail: { 'ship-the-build': false } });
    const p = f.d.play('ship-the-build');
    assert.equal(f.d.busy(), false, 'nothing holds the slot');
    assert.equal(f.d.deferUntilClear(noop), false, 'release notes go straight through');
    assert.equal(await p, 'missing');
    assert.deepEqual(f.log, []);
});

test('director: Off and seen never probe', async () => {
    const off = fakeStage();
    off.s.settings.cinematics = 'off';
    assert.equal(await off.d.play('void-breach'), 'off');
    const seen = fakeStage();
    seen.s.settings.seen = ['void-breach'];
    assert.equal(await seen.d.play('void-breach'), 'seen');
    assert.deepEqual([...off.log, ...seen.log], []);
});

test('director: queues behind an open modal and plays when it clears', async () => {
    const f = fakeStage({ modal: true, availOnProbe: { 'first-seraph': true } });
    let done = null;
    f.d.play('first-seraph').then((o) => { done = o; });
    await settle();
    assert.deepEqual(f.log, [], 'nothing rendered, or even probed, under the dialog');
    assert.equal(f.d.busy(), false, 'a queued reel does not hold the slot');
    assert.deepEqual(plain(f.d.queued()), ['first-seraph']);
    await f.runTimers();                      // still blocked: retries, stays queued
    f.timers.length = 0;
    assert.deepEqual(f.log, []);
    f.s.modal = false;
    f.d.pump();
    await settle();
    assert.deepEqual(f.log, ['probe:first-seraph', 'render:first-seraph', 'seen:first-seraph']);
    assert.equal(done, 'played');
});

test('director: a reel known missing resolves at once, even behind a dialog', async () => {
    const f = fakeStage({ modal: true, avail: { 'void-breach': false } });
    let done = null;
    f.d.play('void-breach').then((o) => { done = o; });
    await settle();
    assert.equal(done, 'missing');
    assert.deepEqual(plain(f.d.queued()), [], 'nothing waits for a file that is not there');
});

test('director: a blocked queue keeps polling until the slot clears', async () => {
    const f = fakeStage({ modal: true, avail: { 'void-breach': true } });
    f.d.play('void-breach');
    await settle();
    assert.ok(f.timers.length >= 1, 'a retry is scheduled');
    f.s.modal = false;
    await f.runTimers();
    assert.deepEqual(f.log, ['render:void-breach', 'seen:void-breach']);
});

test('director: several requests play one at a time, in the order asked', async () => {
    const f = fakeStage({ modal: true, manualRender: true, avail: { 'first-seraph': true, 'void-breach': true } });
    f.d.play('first-seraph');
    f.d.play('void-breach');
    f.s.modal = false;
    await f.runTimers();
    assert.deepEqual(f.log, ['render:first-seraph'], 'the second waits for the first');
    f.pendingRenders.shift().resolve('played');
    await settle();
    assert.deepEqual(f.log, ['render:first-seraph', 'seen:first-seraph', 'render:void-breach']);
});

test('director: a dialog that lands during the probe sends the reel back to the queue', async () => {
    const f = fakeStage();
    let release;
    f.s.probeResult = () => new Promise((r) => { release = r; });
    let done = null;
    f.d.play('void-breach').then((o) => { done = o; });
    await settle();
    assert.equal(f.d.busy(), true, 'the slot is held during the probe');
    f.s.modal = true;                         // a cascade alert paints meanwhile
    release(true);
    await settle();
    assert.equal(f.log.includes('render:void-breach'), false, 'never under the dialog');
    assert.deepEqual(plain(f.d.queued()), ['void-breach'], 'not lost');
    assert.equal(done, null);
    f.s.avail['void-breach'] = true;
    f.s.modal = false;
    await f.runTimers();
    assert.equal(done, 'played');
});

test('director: a renderer that finds the slot taken requeues instead of failing', async () => {
    let calls = 0;
    const f = fakeStage({ avail: { 'first-seraph': true }, renderOutcome: () => (++calls === 1 ? 'blocked' : 'played') });
    let done = null;
    f.d.play('first-seraph').then((o) => { done = o; });
    await settle();
    assert.equal(done, null);
    assert.deepEqual(plain(f.d.queued()), ['first-seraph']);
    await f.runTimers();
    assert.equal(done, 'played');
    assert.deepEqual(f.log.filter((l) => l.startsWith('seen')), ['seen:first-seraph']);
});

test('director: interrupted and failed reels are not marked seen', async () => {
    for (const outcome of ['interrupted', 'error']) {
        const f = fakeStage({ avail: { 'void-breach': true }, renderOutcome: outcome });
        assert.equal(await f.d.play('void-breach'), outcome);
        assert.deepEqual(plain(f.s.settings.seen), [], outcome);
    }
    for (const outcome of ['skipped', 'reduced']) {
        const f = fakeStage({ avail: { 'void-breach': true }, renderOutcome: outcome });
        await f.d.play('void-breach');
        assert.deepEqual(plain(f.s.settings.seen), ['void-breach'], outcome);
    }
});

test('director: First time only plays once; Always plays again', async () => {
    const f = fakeStage({ avail: { 'first-seraph': true } });
    assert.equal(await f.d.play('first-seraph'), 'played');
    assert.equal(await f.d.play('first-seraph'), 'seen');
    f.s.settings.cinematics = 'always';
    assert.equal(await f.d.play('first-seraph'), 'played');
    assert.equal(f.log.filter((l) => l.startsWith('render')).length, 2);
});

test('director: a duplicate request while one is waiting does not queue twice', async () => {
    const f = fakeStage({ modal: true, avail: { 'void-breach': true } });
    f.d.play('void-breach');
    assert.equal(await f.d.play('void-breach'), 'queued');
    assert.deepEqual(plain(f.d.queued()), ['void-breach']);
});

test('director: the ship sequence — reel first, release notes after', async () => {
    const f = fakeStage({ manualRender: true, avail: { 'ship-the-build': true } });
    const order = [];
    f.d.play('ship-the-build');
    // ui.showReleaseNotes asks, synchronously, right after the reboot.
    const deferred = f.d.deferUntilClear(() => order.push('release-notes'));
    assert.equal(deferred, true, 'the notes wait');
    await settle();
    assert.deepEqual(f.log, ['render:ship-the-build']);
    assert.deepEqual(order, []);
    f.pendingRenders.shift().resolve('skipped');
    await settle();
    assert.deepEqual(order, ['release-notes']);
});

test('director: deferred notes also wait for a dialog that took the slot', async () => {
    const f = fakeStage({ avail: { 'ship-the-build': true }, renderOutcome: 'played' });
    const order = [];
    f.d.play('ship-the-build');
    f.d.deferUntilClear(() => order.push('notes'));
    f.s.modal = true;                          // something else is up when the reel ends
    await settle();
    assert.deepEqual(order, [], 'never painted over the other dialog');
    f.s.modal = false;
    await f.runTimers();
    assert.deepEqual(order, ['notes']);
});

test('director: a hosted reel (cold boot) ignores the modal slot', async () => {
    const f = fakeStage({ modal: true, avail: { 'cold-boot': true } });
    assert.equal(await f.d.play('cold-boot', { host: {} }), 'played');
    assert.equal(f.d.busy(), false, 'never held the slot');
});

/* ═════════════════════════════ Headless safety ═════════════════════════════ */

test('game.cinematic is inert without media.js (simulator, every vm suite)', () => {
    const env = boot({ withMedia: false });
    assert.equal(env.game.cinematic('first-seraph'), null);
});

test('game.cinematic is inert with media.js but no DOM', async () => {
    assert.equal(await E.game.cinematic('first-seraph'), 'off');
});

test('the hooks fire through real purchases without touching the economy', () => {
    const env = boot({ withMedia: false });
    const calls = [];
    env.ctx.media = { play: (id) => { calls.push(id); return Promise.resolve('missing'); } };
    env.State.resources.praise = 1000;
    env.game.buyAutomator('seraph');
    env.game.buyAutomator('seraph');
    assert.deepEqual(calls, ['first-seraph'], 'V6 on the first Seraph only');
    env.State.resources.souls = 1e6;
    env.game.purchaseUpgrade('void_unlock');
    assert.deepEqual(calls, ['first-seraph', 'void-breach'], 'V5 on Breach the Veil');
});

/* ═════════════════════════════ Tapes ═════════════════════════════ */

test('tape unlocks: a fresh save has none', () => {
    const env = boot();
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, { canShip: false })), []);
});

test('tape unlocks: each milestone files its tape', () => {
    const cases = [
        ['t1', (S) => { S.totalClicks = 10; }],
        ['t2', (S) => { S.achievementProgress.buy_seraph_count = 1; }],
        ['t3', (S) => { S.unlockedOfferings = true; }],
        ['t3', (S) => { S.reality.build = { entries: [{ kind: 'issue', id: 'x', patched: true }] }; }],
        // A shipped run has been through Known Issues too.
        [['t3', 't4'], (S) => { S.achievementProgress.prestige_count = 1; }],
        ['t5', (S) => { S.incidents.stats.filed = 1; }],
        ['t6', (S) => { S.adversary.contacted = true; }],
    ];
    for (const [id, mutate] of cases) {
        const env = boot();
        mutate(env.State);
        const want = Array.isArray(id) ? id : [id];
        assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), want, `${want}`);
    }
    const env = boot();
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, { canShip: true })), ['t4'], 'T4 when a run first earns a release');
});

test('tape unlocks: thresholds are exact', () => {
    const env = boot();
    env.State.totalClicks = 9;
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), []);
    env.State.adversary.contacted = 'yes';
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), [], 'a truthy string is not contact');
});

test('tape unlocks: one rule that throws does not take the others down', () => {
    const env = boot();
    env.State.achievementProgress.buy_seraph_count = 1;
    Object.defineProperty(env.State, 'totalClicks', { get() { throw new Error('corrupt'); }, configurable: true });
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), ['t2']);
});

test('tape unlocks: hostile state shapes do not throw', () => {
    const env = boot();
    Object.assign(env.State, { totalClicks: 'lots', incidents: 'none', adversary: null, reality: { build: { entries: 'x' } }, achievementProgress: null });
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), []);
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(null, {})), []);
});

test('tape unlocks: T1 and T2 come from the real first-minutes flow', () => {
    const env = boot();
    for (let i = 0; i < 10; i++) env.game.manualPraise(null);
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), ['t1'], 'ten Miracles — the first work order');
    env.game.buyAutomator('seraph');
    assert.deepEqual(plain(env.MediaLogic.tapeUnlocks(env.State, {})), ['t1', 't2']);
});

test('newlyUnlocked excludes tapes already filed', () => {
    const env = boot();
    env.State.totalClicks = 50;
    env.State.achievementProgress.buy_seraph_count = 3;
    assert.deepEqual(plain(env.MediaLogic.newlyUnlocked(env.State, { tapes: ['t1'] }, {})), ['t2']);
});

test('the catalogue: tapes have 4-7 shots, real art, real cues, captions that fit', () => {
    const sounds = Object.keys(boot({ withAudio: true }).audio.SOUNDS);
    assert.ok(sounds.length > 10, 'read the sound table');
    assert.deepEqual(plain(C.tapes.map((t) => t.id)), ['t1', 't2', 't3', 't4', 't5', 't6']);
    for (const tape of C.tapes) {
        assert.ok(tape.shots.length >= 4 && tape.shots.length <= 7, `${tape.id} has ${tape.shots.length} shots`);
        tape.shots.forEach((shot, i) => {
            const where = `${tape.id} shot ${i + 1}`;
            assert.ok(!!shot.card !== !!shot.art, `${where} is a card or a picture`);
            assert.ok(shot.dur >= 3 && shot.dur <= 12, `${where} duration`);
            if (shot.cue) assert.ok(sounds.includes(shot.cue), `${where} cue "${shot.cue}" exists in js/audio.js`);
            if (shot.art) {
                for (const key of ['bg', 'subject', 'fx']) {
                    if (shot.art[key]) assert.ok(existsSync(resolve(ROOT, shot.art[key])), `${where} ${key}: ${shot.art[key]}`);
                }
                assert.equal(shot.video.webm, `assets/video/tape__${tape.id}__shot${i + 1}__720.webm`);
                assert.equal(shot.video.mp4, `assets/video/tape__${tape.id}__shot${i + 1}__720.mp4`);
                assert.equal(shot.video.poster, `assets/video/tape__${tape.id}__shot${i + 1}__720.webp`);
                assert.ok(shot.about, `${where} describes its shot`);
            } else {
                assert.equal(shot.video, undefined, `${where}: cards are type, never a reel`);
            }
            let prev = -1;
            for (const [at, who, text] of shot.captions) {
                assert.ok(at > prev && at < shot.dur, `${where} caption at ${at}s inside ${shot.dur}s and in order`);
                assert.ok(who in C.SPEAKERS, `${where} speaker ${who}`);
                assert.ok(typeof text === 'string' && text.length > 1, `${where} caption text`);
                prev = at;
            }
        });
    }
    assert.ok(C.tapes.find((t) => t.id === 't6').secret, 'T6 is the secret tape');
    assert.ok(C.tapes.find((t) => t.id === 't6').shots.some((s) => s.captions.some((c) => c[1] === 'N')), 'NULL.OPERATOR speaks on T6');
    assert.ok(C.tapes.filter((t) => t.id !== 't6').every((t) => t.shots.every((s) => s.captions.every((c) => c[1] !== 'N'))), 'and only on T6');
});

test('the catalogue: scenes use the plan\'s names and real cues', () => {
    const sounds = Object.keys(boot({ withAudio: true }).audio.SOUNDS);
    assert.deepEqual(plain(Object.keys(C.scenes).sort()), ['cold-boot', 'first-seraph', 'mirror-login', 'ship-the-build', 'void-breach']);
    for (const [id, s] of Object.entries(C.scenes)) {
        assert.equal(s.webm, `assets/video/cine__${id}__720.webm`);
        assert.equal(s.mp4, `assets/video/cine__${id}__720.mp4`);
        assert.equal(s.poster, `assets/video/cine__${id}__720.webp`);
        assert.ok(s.caption, `${id} caption`);
        if (s.cue) assert.ok(sounds.includes(s.cue), `${id} cue ${s.cue}`);
    }
});

test('the catalogue: dialog loops are named loop__<slug>__512 and cover V3 x3 and V7', () => {
    assert.deepEqual(plain(Object.keys(C.loops).sort()), ['cascade-tier1', 'cascade-tier2', 'cascade-tier3', 'sev1-alarm']);
    for (const [id, l] of Object.entries(C.loops)) {
        assert.equal(l.webm, `assets/video/loop__${id}__512.webm`);
        assert.equal(l.mp4, `assets/video/loop__${id}__512.mp4`);
        assert.ok(l.krea, `${id} has its Krea prompt`);
        assert.equal(C.loop(id), l);
    }
    assert.equal(C.loop('toString'), null, 'prototype keys are not loops');
    assert.equal(C.scene('cascade-tier1'), null, 'a loop is not a cinematic: it must never hold the modal slot');
});

test('loops: allowed unless cinematics are off or motion is reduced', () => {
    assert.equal(L.loopAllowed(L.defaults(), false), true);
    assert.equal(L.loopAllowed({ ...L.defaults(), cinematics: 'always' }, false), true);
    assert.equal(L.loopAllowed({ ...L.defaults(), cinematics: 'off' }, false), false);
    assert.equal(L.loopAllowed(L.defaults(), true), false);
    assert.equal(L.loopAllowed(null, false), true, 'missing settings fall back to defaults');
});

/* ═════════════════════════════ The tape clock ═════════════════════════════ */

const T1 = C.tape('t1');
test('clock: locate maps tape time to a shot and a time within it', () => {
    const d0 = T1.shots[0].dur;
    assert.deepEqual(plain(L.locate(T1, 0)), { index: 0, local: 0, start: 0 });
    assert.deepEqual(plain(L.locate(T1, d0 - 0.01)).index, 0);
    assert.deepEqual(plain(L.locate(T1, d0)), { index: 1, local: 0, start: d0 });
    const total = L.tapeLength(T1);
    const end = plain(L.locate(T1, total));
    assert.equal(end.index, T1.shots.length - 1, 'the end of tape belongs to the last shot');
    assert.equal(end.local, T1.shots.at(-1).dur);
    assert.equal(plain(L.locate(T1, total + 50)).index, T1.shots.length - 1, 'clamped');
    assert.equal(plain(L.locate(T1, -5)).index, 0, 'clamped');
});

test('clock: previous rewinds to the start of the shot, then to the one before', () => {
    const s2 = L.shotStart(T1, 2);
    assert.equal(L.previousShotTime(T1, s2 + 3), s2, 'mid-shot: back to its start');
    assert.equal(L.previousShotTime(T1, s2 + 0.5), L.shotStart(T1, 1), 'just after a cut: the shot before');
    assert.equal(L.previousShotTime(T1, 0.2), 0);
});

test('clock: next jumps to the following cut, and past the last to the end', () => {
    assert.equal(L.nextShotTime(T1, 0), L.shotStart(T1, 1));
    assert.equal(L.nextShotTime(T1, L.shotStart(T1, T1.shots.length - 1) + 1), L.tapeLength(T1));
});

test('clock: the caption on screen is the latest one started', () => {
    const shot = T1.shots[1];
    assert.equal(L.captionAt(shot, 0)[2], shot.captions[0][2]);
    assert.equal(L.captionAt(shot, shot.captions[1][0] - 0.01)[2], shot.captions[0][2]);
    assert.equal(L.captionAt(shot, shot.captions[1][0])[2], shot.captions[1][2]);
    assert.equal(L.captionAt({ captions: [[1, 'I', 'x']] }, 0.5), null);
});

test('clock: reduced motion holds every camera move still', () => {
    for (const move of Object.keys(L.MOVES)) {
        assert.deepEqual(plain(L.camera(move, 0, true)), plain(L.camera(move, 1, true)), move);
    }
    assert.notDeepEqual(plain(L.camera('push', 0)), plain(L.camera('push', 1)), 'and moves when allowed');
});

/* ═════════════════════════════ Run ═════════════════════════════ */

let passed = 0;
let failed = 0;
console.log('\nMedia layer\n');
for (const { name, fn } of tests) {
    let timer;
    try {
        // A queue that never drains must fail by name, not hang the suite.
        await Promise.race([fn(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out: a promise never settled')), 5000); })]);
        passed++;
        console.log(`  ok    ${name}`);
    } catch (err) {
        failed++;
        console.log(`  FAIL  ${name}\n        ${err.message.split('\n').join('\n        ')}`);
    } finally {
        clearTimeout(timer);
    }
}
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
