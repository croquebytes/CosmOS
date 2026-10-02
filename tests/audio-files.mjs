#!/usr/bin/env node
/**
 * Drop-in audio files — names, probes, the bed choice, and the narration
 * sync that holds the tape clock.
 *
 *   node tests/audio-files.mjs
 *
 * The properties that matter, stated so a test cannot quietly assert a
 * neighbouring one instead:
 *
 *   - A missing file is inert. A probe the dev server answers with
 *     index.html (200, text/html) is a miss; a line whose file is missing
 *     never holds the tape clock, not even while its probe is out.
 *   - A synced caption waits for its line: while a line plays, the clock
 *     stops just short of the next caption (or the end of the shot), and
 *     runs on from there the moment the line ends.
 *   - Names are stable and confined to assets/audio/: a line id names a
 *     place on a tape (t1-s2-0), never a path.
 *   - Hostile saves: audio settings are normalised, and the schema in
 *     js/state.js agrees with the defaults in js/audio.js.
 *   - What ships matches what is documented: every T1 Instructor line has
 *     its .ogg and .mp3, and assets/audio/MANIFEST.md records the caption's
 *     exact current text (a reworded caption shows up here as stale audio).
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') });
const noop = () => {};

function boot({ withAudio = false, settings = undefined } = {}) {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise, RegExp,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    });
    if (settings !== undefined) vm.runInContext(`var State = { settings: ${JSON.stringify(settings)}, save() {} };`, ctx);
    const files = ['js/audiofiles.js', 'js/media.js'];
    if (withAudio) files.push('js/audio.js');
    for (const f of files) {
        const src = read(f);
        vm.runInContext(src.code, ctx, { filename: src.name });
    }
    return vm.runInContext(`({ AudioFiles, createTapeVoice, tapeVoice, createSceneVoice, sceneVoice, createFateVoice, fateVoice, MediaCatalog${withAudio ? ', audio' : ''} })`, ctx);
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 4) { for (let i = 0; i < n; i++) await tick(); }

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const { AudioFiles: AF, createTapeVoice, tapeVoice, createSceneVoice, createFateVoice, MediaCatalog } = boot();
const T1 = MediaCatalog.tape('t1');

/* ── Names ──────────────────────────────────────────────────────────── */
test('stems follow the plan: music__<id>, vo__<speaker>__<line-id>', () => {
    assert.equal(AF.musicStem('primordial-shift'), 'music__primordial-shift');
    assert.equal(AF.voiceStem('instructor', 't1-s2-0'), 'vo__instructor__t1-s2-0');
    assert.equal(AF.voiceStem('I', 't1-s2-0'), 'vo__instructor__t1-s2-0', 'a caption speaker code maps to its slug');
    assert.equal(AF.voiceStem('N', 't6-s3-1'), 'vo__null-operator__t6-s3-1');
    assert.equal(AF.voiceStem('fate', 'CAS-HOST-001'), 'vo__fate__CAS-HOST-001');
    assert.deepEqual(plain(AF.urls('music__primordial-shift')), ['assets/audio/music__primordial-shift.ogg', 'assets/audio/music__primordial-shift.mp3']);
    assert.deepEqual(plain(AF.urls('vo__instructor__t1-s2-0', false)), ['assets/audio/vo__instructor__t1-s2-0.mp3'], 'no .ogg where the browser cannot take it');
});

test('nothing can name a file outside assets/audio/', () => {
    assert.equal(AF.musicStem('no-such-cue'), null);
    assert.equal(AF.musicStem('__proto__'), null);
    assert.equal(AF.voiceStem('instructor', '../../index'), null);
    assert.equal(AF.voiceStem('../x', 't1-s2-0'), null);
    assert.equal(AF.voiceStem('instructor', 't1/s2'), null);
    assert.equal(AF.voiceStem(null, 't1-s2-0'), null);
    assert.deepEqual(plain(AF.urls('../secret')), []);
    assert.deepEqual(plain(AF.urls('video__x')), []);
});

test('every row of the plan\'s music table has a stem and a kind', () => {
    const codes = Object.values(AF.MUSIC).map((m) => m.code);
    for (const c of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11']) assert.ok(codes.includes(c), `${c} is wired`);
    for (const [id, m] of Object.entries(AF.MUSIC)) {
        assert.ok(AF.musicStem(id), id);
        assert.ok(['bed', 'layer', 'stinger'].includes(m.kind), `${id} kind`);
    }
    for (const id of Object.values(AF.STINGER_ON_CUE)) assert.equal(AF.MUSIC[id].kind, 'stinger');
});

/* ── Probe verdict ──────────────────────────────────────────────────── */
test('a dev server\'s index.html fallback is a miss; audio types are hits', () => {
    assert.equal(AF.responseIsAudio(true, 'text/html'), false, 'Vite answers a missing file with index.html and 200');
    assert.equal(AF.responseIsAudio(true, 'text/html; charset=utf-8'), false);
    assert.equal(AF.responseIsAudio(true, 'application/json'), false);
    assert.equal(AF.responseIsAudio(true, 'video/mp4'), false);
    assert.equal(AF.responseIsAudio(false, 'audio/ogg'), false, 'a 404 is a miss whatever it says it is');
    assert.equal(AF.responseIsAudio(true, 'audio/ogg'), true);
    assert.equal(AF.responseIsAudio(true, 'audio/mpeg'), true);
    assert.equal(AF.responseIsAudio(true, 'Audio/Ogg; codecs=opus'), true);
    assert.equal(AF.responseIsAudio(true, 'application/ogg'), true);
    assert.equal(AF.responseIsAudio(true, 'application/octet-stream'), true, 'static hosts that do not know the type');
    assert.equal(AF.responseIsAudio(true, ''), true);
});

test('ducking is about 8 dB', () => {
    const g = AF.duckGain();
    assert.ok(Math.abs(20 * Math.log10(g) + 8) < 0.01, `${g}`);
    assert.ok(Math.abs(AF.duckGain(-8) - g) < 1e-12, 'sign-agnostic');
});

/* ── Beds ───────────────────────────────────────────────────────────── */
test('the bed follows the screen, and M1 is the primordial desktop only', () => {
    const desk = { desktop: true, dimension: 'primordial' };
    assert.deepEqual(plain(AF.bedCandidates(desk)), ['primordial-shift']);
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, dimension: 'void' })), ['void-breach'], 'no hopeful M1 in the Void');
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, focus: 'solitaire' })), ['fates-table', 'primordial-shift']);
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, focus: 'mediaplayer' })), ['media-player', 'primordial-shift']);
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, focus: 'mediaplayer', tapePlaying: true })), ['primordial-shift'], 'a playing tape is not the idle menu');
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, adversary: true })), ['mirror-login'], 'the scene is exclusive');
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, adversary: true, ending: 'curious' })), ['ending-curious']);
    assert.deepEqual(plain(AF.bedCandidates({ ...desk, ending: 'sideways' })), ['primordial-shift'], 'an unknown ending band is not a stem');
    assert.deepEqual(plain(AF.bedCandidates({ desktop: false, dimension: 'primordial' })), [], 'nothing under the boot screen');
    assert.deepEqual(plain(AF.bedCandidates()), []);
});

test('chooseBed takes the first INSTALLED candidate, never an unknown one', () => {
    const cands = ['fates-table', 'primordial-shift'];
    assert.equal(AF.chooseBed(cands, (id) => ({ 'fates-table': true, 'primordial-shift': true })[id]), 'fates-table');
    assert.equal(AF.chooseBed(cands, (id) => ({ 'fates-table': false, 'primordial-shift': true })[id]), 'primordial-shift');
    assert.equal(AF.chooseBed(cands, (id) => ({ 'primordial-shift': true })[id]), 'primordial-shift', 'unprobed is passed over');
    assert.equal(AF.chooseBed(cands, () => false), null, 'nothing installed: silence, as before');
    assert.equal(AF.chooseBed(cands, () => undefined), null);
});

test('the Cascade layer comes in at tier 2, never under a scene', () => {
    const desk = { desktop: true };
    assert.equal(AF.layerFor({ ...desk, cascadeTier: 1 }), null);
    assert.equal(AF.layerFor({ ...desk, cascadeTier: 2 }), 'cascade');
    assert.equal(AF.layerFor({ ...desk, cascadeTier: 4, adversary: true }), null);
    assert.equal(AF.layerFor({ ...desk, cascadeTier: 4, ending: 'hostile' }), null);
    assert.equal(AF.layerFor({ cascadeTier: 3 }), null);
});

/* ── Tape lines ─────────────────────────────────────────────────────── */
test('tape line ids are <tape>-s<shot>-<caption>, with times and limits on the tape clock', () => {
    const lines = AF.tapeLines(T1);
    const s2 = T1.shots[1];
    const start2 = T1.shots[0].dur;
    const l0 = lines.find((l) => l.id === 't1-s2-0');
    const l1 = lines.find((l) => l.id === 't1-s2-1');
    assert.equal(l0.speaker, 'instructor');
    assert.equal(l0.text, s2.captions[0][2]);
    assert.equal(l0.at, start2 + s2.captions[0][0]);
    assert.equal(l0.limit, start2 + s2.captions[1][0], 'limit: the next caption in the shot');
    assert.equal(l1.at, start2 + s2.captions[1][0]);
    assert.equal(l1.limit, start2 + s2.dur, 'limit: the end of the shot for its last caption');
    const sys = lines.find((l) => l.id === 't1-s1-0');
    assert.equal(sys.speaker, 'sys', 'S captions are lines too, should their file appear');
    assert.equal(lines.filter((l) => l.speaker === 'instructor').length, 10);
    assert.equal(T1.shots[1].code, 'T1-S2', 'the shot number is the one in the shot code');
});

test('line ids are unique across every tape, and every limit is after its line', () => {
    const seen = new Set();
    for (const tape of MediaCatalog.tapes) {
        for (const l of AF.tapeLines(tape)) {
            assert.ok(!seen.has(l.id), `duplicate ${l.id}`);
            seen.add(l.id);
            assert.ok(AF.voiceStem(l.speaker, l.id), l.id);
            assert.ok(l.limit > l.at, `${l.id} limit ${l.limit} after ${l.at}`);
        }
    }
    assert.ok(seen.size > 40);
});

test('crossedLine: from < at <= to, and the latest one wins', () => {
    const lines = AF.tapeLines(T1);
    const l = lines.find((x) => x.id === 't1-s2-0');
    assert.equal(AF.crossedLine(lines, l.at - 0.1, l.at).id, 't1-s2-0', 'arriving exactly on it counts');
    assert.equal(AF.crossedLine(lines, l.at, l.at + 0.1), null, 'leaving it does not');
    assert.equal(AF.crossedLine(lines, 0, 20).id, lines.filter((x) => x.at <= 20).pop().id);
    assert.equal(AF.crossedLine([], 0, 99), null);
});

/* ── The tape clock waits for its line ──────────────────────────────── */
function fakeEnv(state) {
    const calls = { say: [], stop: 0, prefetch: 0 };
    const pending = [];
    const env = {
        calls, pending,
        known: (line) => state[line.id],
        say(line, opts) {
            calls.say.push(line.id);
            return new Promise((resolve) => {
                const job = { line, resolve, opts, present: () => opts.onPresent() };
                pending.push(job);
                if (state[line.id] === true) job.present();
            });
        },
        stop() {
            calls.stop += 1;
            while (pending.length) pending.shift().resolve('stopped');
        },
        prefetch() { calls.prefetch += 1; },
    };
    return env;
}

test('a synced caption waits for its line, then the tape runs on from the hold', async () => {
    const env = fakeEnv({ 't1-s2-0': true, 't1-s2-1': true });
    const tv = createTapeVoice(env);
    const lines = AF.tapeLines(T1);
    const l0 = lines.find((l) => l.id === 't1-s2-0');
    tv.load(T1);
    assert.equal(env.calls.prefetch, 1, 'loading a tape warms its probes');
    assert.equal(tv.tick(T1, 4.4, true), 4.4);
    assert.equal(tv.tick(T1, l0.at + 0.02, true), l0.at + 0.02);
    assert.deepEqual(env.calls.say, ['t1-s2-0'], 'the line starts as the clock crosses its caption');
    assert.equal(tv.speaking(), true);
    // The wall clock runs well past the next caption; the tape may not.
    const held = tv.tick(T1, l0.limit + 3, true);
    assert.ok(held < l0.limit && held > l0.limit - 0.01, `held at ${held}, limit ${l0.limit}`);
    assert.equal(tv.tick(T1, l0.limit + 5, true), held, 'and stays held');
    assert.deepEqual(env.calls.say, ['t1-s2-0'], 'the next line has not started');
    // The line ends: the next caption is crossed and its own line starts.
    env.pending.shift().resolve('played');
    await settle();
    assert.equal(tv.speaking(), false);
    const after = tv.tick(T1, held + 0.05, true);
    assert.equal(after, held + 0.05, 'released: the wall clock is honoured again');
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s2-1']);
});

test('the last line of a shot holds the shot change, not just the next caption', async () => {
    const env = fakeEnv({ 't1-s2-1': true });
    const tv = createTapeVoice(env);
    const l1 = AF.tapeLines(T1).find((l) => l.id === 't1-s2-1');
    tv.load(T1);
    tv.tick(T1, l1.at - 0.05, true);
    tv.tick(T1, l1.at + 0.01, true);
    const held = tv.tick(T1, l1.limit + 1, true);
    assert.ok(held < l1.limit && held >= l1.at, `held at ${held}, inside shot 2 (ends ${l1.limit})`);
    assert.deepEqual(env.calls.say, ['t1-s2-1'], 'shot 3\'s first line waits too');
});

test('a missing file never holds the clock, and is never asked to speak', () => {
    const env = fakeEnv({});
    env.known = () => false;
    const tv = createTapeVoice(env);
    tv.load(T1);
    let t = 0;
    for (; t < 44; t += 0.1) assert.ok(Math.abs(tv.tick(T1, t, true) - t) < 1e-9, `no hold at ${t}`);
    assert.deepEqual(env.calls.say, []);
    assert.equal(tv.speaking(), false);
});

test('a probe still out is not a hold: only a file known to be there holds', async () => {
    const env = fakeEnv({ 't1-s2-0': undefined });
    const tv = createTapeVoice(env);
    const l0 = AF.tapeLines(T1).find((l) => l.id === 't1-s2-0');
    tv.load(T1);
    tv.tick(T1, l0.at - 0.05, true);
    tv.tick(T1, l0.at + 0.01, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0'], 'asked, since the file might exist');
    assert.equal(tv.tick(T1, l0.limit + 1, true), l0.limit + 1, 'unconfirmed: the clock runs');
    // The probe answers "missing": the say resolves without onPresent.
    env.pending.shift().resolve('missing');
    await settle();
    assert.equal(tv.speaking(), false);
});

test('pause, seek and a new tape cut the line and release the clock', async () => {
    const env = fakeEnv({ 't1-s2-0': true, 't1-s3-0': true });
    const tv = createTapeVoice(env);
    const lines = AF.tapeLines(T1);
    const l0 = lines.find((l) => l.id === 't1-s2-0');
    tv.load(T1);
    tv.tick(T1, l0.at - 0.05, true);
    tv.tick(T1, l0.at + 0.01, true);
    assert.equal(tv.speaking(), true);
    tv.stop();
    assert.equal(tv.speaking(), false);
    assert.ok(env.calls.stop >= 1, 'the line was cut');
    await settle();
    // Positioned mid-caption: no restart of a line already under way.
    assert.equal(tv.tick(T1, l0.at + 1, true), l0.at + 1);
    assert.deepEqual(env.calls.say, ['t1-s2-0']);
    // Positioned exactly on a caption's start (prev/next shot): it speaks.
    tv.stop();
    const s3 = lines.find((l) => l.id === 't1-s3-0');
    tv.tick(T1, s3.at, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s3-0']);
    // Not playing: the clock is returned untouched and nothing speaks,
    // even sitting exactly on a caption's start.
    tv.stop();
    const s4 = lines.find((l) => l.id === 't1-s4-0');
    assert.equal(tv.tick(T1, s4.at, false), s4.at);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s3-0']);
    // A seek forward INTO a caption (scrubbing past its start) does not
    // start that line late: a repositioned clock only speaks what it lands on.
    tv.stop();
    tv.tick(T1, s4.at - 2, true);
    tv.stop();
    tv.tick(T1, s4.at + 2, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s3-0'], 'no line started mid-caption');
    // Another tape replaces this one's lines.
    tv.load(MediaCatalog.tape('t2'));
    assert.equal(tv.current(), null);
});

test('the bound tapeVoice is inert where audio is undefined', () => {
    tapeVoice.load(T1);
    for (let t = 0; t < 20; t += 0.25) assert.equal(tapeVoice.tick(T1, t, true), t);
    assert.equal(tapeVoice.speaking(), false);
    tapeVoice.pause();
    for (let t = 20; t < 30; t += 0.25) assert.equal(tapeVoice.tick(T1, t, true), t);
    tapeVoice.stop();
});

/* ── Pause and resume ───────────────────────────────────────────────── */
/* Start t1-s2-0 and let it hold, as the Media Player's clock would. */
function speakingT1(state = { 't1-s2-0': true, 't1-s2-1': true }) {
    const env = fakeEnv(state);
    const tv = createTapeVoice(env);
    const l0 = AF.tapeLines(T1).find((l) => l.id === 't1-s2-0');
    tv.load(T1);
    tv.tick(T1, l0.at - 0.05, true);
    tv.tick(T1, l0.at + 0.5, true);
    assert.equal(tv.current(), 't1-s2-0');
    return { env, tv, l0 };
}

test('pausing mid-line and resuming says that line again, from its start', async () => {
    const { env, tv, l0 } = speakingT1();
    const t = l0.at + 1.2;
    tv.tick(T1, t, true);
    tv.pause();
    assert.equal(tv.speaking(), false, 'pause cuts the line');
    assert.ok(env.calls.stop >= 1);
    assert.equal(tv.resuming(), 't1-s2-0');
    await settle();
    assert.equal(tv.tick(T1, t, false), t, 'while paused nothing speaks');
    assert.deepEqual(env.calls.say, ['t1-s2-0']);
    // Play: the first tick says the same line again, as a fresh start.
    assert.equal(tv.tick(T1, t, true), t);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s2-0'], 'the line restarts');
    assert.equal(env.pending.length, 1, 'one fresh say, from the beginning of the file');
    assert.equal(tv.speaking(), true);
    const held = tv.tick(T1, l0.limit + 2, true);
    assert.ok(held < l0.limit, 'and it holds the next caption again until it is done');
    env.pending.shift().resolve('played');
    await settle();
    tv.tick(T1, held + 0.05, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s2-0', 't1-s2-1'], 'then the tape runs on as before');
});

test('a held clock paused at the next caption resumes the same line, not the next one', async () => {
    const { env, tv, l0 } = speakingT1();
    const held = tv.tick(T1, l0.limit + 3, true);
    tv.pause();
    await settle();
    tv.tick(T1, held, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s2-0']);
});

test('a line cut from outside (the tab hid) still resumes when the deck is paused after it', async () => {
    const { env, tv, l0 } = speakingT1();
    // audio.js cuts the line on visibilitychange, before the Media Player
    // pauses the deck: the say resolves 'stopped' with nobody asking.
    env.pending.shift().resolve('stopped');
    await settle();
    assert.equal(tv.current(), null);
    const t = tv.tick(T1, l0.at + 0.6, true);   // the pause's own advance()
    tv.pause();
    assert.equal(tv.resuming(), 't1-s2-0');
    tv.tick(T1, t, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0', 't1-s2-0']);
});

test('a seek, a new tape or the clock leaving the caption forgets the paused line', async () => {
    let { env, tv, l0 } = speakingT1();
    tv.pause();
    tv.stop();                     // seek / prev / next / end of tape
    tv.tick(T1, l0.at + 1, true);
    assert.deepEqual(env.calls.say, ['t1-s2-0'], 'a seek while paused is not a resume');
    ({ env, tv, l0 } = speakingT1());
    tv.pause();
    tv.load(MediaCatalog.tape('t2'));
    assert.equal(tv.resuming(), null);
    ({ env, tv, l0 } = speakingT1());
    tv.pause();
    tv.tick(T1, l0.limit + 0.5, true);
    assert.ok(!env.calls.say.slice(1).includes('t1-s2-0'), 'off its caption: not said again');
    // Paused with nothing speaking (a missing file): nothing to resume.
    const quiet = fakeEnv({});
    quiet.known = () => false;
    const tq = createTapeVoice(quiet);
    tq.load(T1);
    tq.tick(T1, l0.at - 0.05, true);
    tq.tick(T1, l0.at + 0.5, true);
    tq.pause();
    assert.equal(tq.resuming(), null);
    tq.tick(T1, l0.at + 0.5, true);
    assert.deepEqual(quiet.calls.say, []);
});

/* ── The scenes and Fate: names ─────────────────────────────────────── */
function loadContent() {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise, RegExp,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    });
    vm.runInContext(read('js/state.js').code, ctx, { filename: 'js/state.js' });
    return vm.runInContext('({ AdversaryScene, AdversaryFinale, CasinoHostBarks })', ctx);
}

function sceneBeats({ AdversaryScene, AdversaryFinale }) {
    return [
        ...AdversaryScene.dialogue,
        ...AdversaryFinale.opening,
        ...Object.values(AdversaryFinale.reentry),
        ...Object.values(AdversaryFinale.endings).flatMap((e) => e.beats),
    ];
}

test('each speaker has its slug: fate, null-operator and sys, named by content id', () => {
    const stem = (l) => (l ? AF.voiceStem(l.speaker, l.id) : null);
    assert.equal(stem(AF.fateLine({ id: 'CAS-HOST-001', text: 'x' })), 'vo__fate__CAS-HOST-001');
    assert.equal(stem(AF.sceneLine({ id: 'ADV-010', speaker: 'ADV', type: 'voice' })), 'vo__null-operator__ADV-010');
    assert.equal(stem(AF.sceneLine({ id: 'ADV-001', speaker: 'SYS', type: 'system' })), 'vo__sys__ADV-001');
    assert.equal(stem(AF.sceneLine({ id: 'ADV-011B', speaker: 'SYS', type: 'system' })), 'vo__sys__ADV-011B');
    assert.equal(stem(AF.sceneLine({ id: 'ADV-027', speaker: 'HOST', type: 'whisper' })), 'vo__fate__ADV-027', 'the house, from far away, is Fate');
    assert.equal(stem(AF.sceneLine({ id: 'FIN-H-03', speaker: 'SYS', type: 'system' })), 'vo__sys__FIN-H-03');
    assert.equal(stem(AF.sceneLine({ id: 'FIN-R-X', speaker: 'ADV', type: 'voice' })), 'vo__null-operator__FIN-R-X');
    assert.equal(AF.sceneLine({ id: 'ADV-022', speaker: 'ADV', type: 'choice_prompt' }), null, 'the choice is the player\'s turn');
    assert.equal(AF.sceneLine({ id: 'ADV-010', speaker: 'YOU', type: 'voice' }), null, 'nobody\'s voice');
    assert.equal(AF.sceneLine({ id: 'ADV-010', speaker: '__proto__' }), null);
    assert.equal(AF.sceneLine({ id: '../ADV-010', speaker: 'ADV' }), null);
    assert.equal(AF.sceneLine({ id: 'CAS-HOST-001', speaker: 'HOST' }), null, 'scene ids only');
    assert.equal(AF.sceneLine(null), null);
    assert.equal(AF.fateLine({ id: 'ADV-010' }), null);
    assert.equal(AF.fateLine({ id: 'CAS-HOST-001/../x' }), null);
    assert.equal(AF.fateLine(null), null);
    assert.equal(AF.SPEAKERS.S, 'sys', 'the tape SYS and the scene SYS are one voice');
    assert.equal(AF.SCENE_SPEAKERS.ADV, AF.SPEAKERS.N, 'and so are the two NULL.OPERATORs');
});

test('every authored scene beat and every Fate line has a stem, and none collide', () => {
    const content = loadContent();
    const seen = new Set();
    let spoken = 0;
    const placeholders = [];
    for (const beat of sceneBeats(content)) {
        const line = AF.sceneLine(beat);
        if (beat.type === 'choice_prompt') { assert.equal(line, null); continue; }
        if (/\{[A-Z]+\}/.test(beat.text)) { assert.equal(line, null, `${beat.id} changes per save`); placeholders.push(beat.id); continue; }
        assert.ok(line, `${beat.id} (${beat.speaker}) has no line`);
        const stem = AF.voiceStem(line.speaker, line.id);
        assert.ok(stem && AF.urls(stem).length === 2, `${beat.id} names a file`);
        assert.ok(!seen.has(stem), `duplicate ${stem}`);
        seen.add(stem);
        spoken += 1;
    }
    assert.ok(spoken >= 60, `${spoken} scene lines`);
    assert.deepEqual(placeholders.sort(), ['ADV-011B', 'FIN-011', 'FIN-012'], 'caption-only: the words change per save');
    for (const bark of content.CasinoHostBarks) {
        const line = AF.fateLine(bark);
        assert.ok(line, bark.id);
        const stem = AF.voiceStem(line.speaker, line.id);
        assert.ok(!seen.has(stem), `duplicate ${stem}`);
        seen.add(stem);
    }
    assert.equal(content.CasinoHostBarks.length, 84);
});

/* ── The scenes: a beat waits for its line ──────────────────────────── */
function fakeSceneEnv(state) {
    const calls = { say: [], stop: [], prefetch: [] };
    const pending = [];
    const timers = [];
    const env = {
        calls, pending, timers,
        known: (line) => state[line.id],
        say(line, opts) {
            calls.say.push(`${line.speaker}/${line.id}`);
            return new Promise((resolve) => {
                pending.push({ line, resolve });
                if (state[line.id] === true) opts.onPresent();
            });
        },
        stop(line) {
            calls.stop.push(line.id);
            const i = pending.findIndex((p) => p.line.id === line.id);
            if (i >= 0) pending.splice(i, 1)[0].resolve('stopped');
        },
        prefetch(lines) { calls.prefetch.push(...lines.map((l) => l.id)); },
        later(fn, ms) { timers.push({ fn, ms }); },
    };
    return env;
}
const beat = (id, speaker = 'ADV', type = 'voice') => ({ id, speaker, type, text: id });

test('a scene beat waits for its line, then moves on a beat after it ends', async () => {
    const env = fakeSceneEnv({ 'ADV-010': true });
    const sv = createSceneVoice(env);
    assert.equal(sv.speak(beat('ADV-010')), true);
    assert.deepEqual(env.calls.say, ['null-operator/ADV-010']);
    assert.equal(sv.speaking(), true);
    let advanced = 0;
    const next = () => { advanced += 1; };
    assert.equal(sv.hold(next), true, 'the dwell timer is told to wait');
    assert.equal(sv.waiting(), true);
    assert.equal(advanced, 0);
    env.pending.shift().resolve('played');
    await settle();
    assert.equal(sv.speaking(), false);
    assert.equal(env.timers.length, 1, 'the scene moves on after a short gap');
    assert.ok(env.timers[0].ms > 0 && env.timers[0].ms <= 600, `gap ${env.timers[0].ms} ms`);
    env.timers.shift().fn();
    assert.equal(advanced, 1, 'and exactly once');
    assert.equal(sv.hold(next), false, 'nothing speaking: the next timer is not held');
});

test('a line that ends before the dwell runs out holds nothing', async () => {
    const env = fakeSceneEnv({ 'ADV-014': true });
    const sv = createSceneVoice(env);
    sv.speak(beat('ADV-014'));
    env.pending.shift().resolve('played');
    await settle();
    assert.equal(sv.hold(() => { throw new Error('held'); }), false);
    assert.equal(env.timers.length, 0);
});

test('a missing file is inert in the scenes: never asked, never held', () => {
    const env = fakeSceneEnv({ 'ADV-010': false });
    const sv = createSceneVoice(env);
    assert.equal(sv.speak(beat('ADV-010')), false);
    assert.deepEqual(env.calls.say, []);
    assert.equal(sv.hold(() => {}), false, 'the dwell timer runs as before');
    assert.equal(sv.speak(beat('ADV-022', 'ADV', 'choice_prompt')), false, 'a choice is never spoken');
    assert.equal(sv.speak(beat('ADV-099', 'YOU')), false);
    assert.deepEqual(env.calls.say, []);
});

test('a probe still out is not a hold in the scenes either', async () => {
    const env = fakeSceneEnv({ 'ADV-012': undefined });
    const sv = createSceneVoice(env);
    assert.equal(sv.speak(beat('ADV-012')), true, 'asked, since it might exist');
    assert.equal(sv.hold(() => {}), false, 'unconfirmed: the timer moves the scene on');
    env.pending.shift().resolve('missing');
    await settle();
    assert.equal(sv.current(), null);
});

test('Escape skips the line: it is cut, and the waiting timer is forgotten', async () => {
    const env = fakeSceneEnv({ 'FIN-H-01': true });
    const sv = createSceneVoice(env);
    sv.speak(beat('FIN-H-01'));
    let advanced = 0;
    assert.equal(sv.hold(() => { advanced += 1; }), true);
    sv.skip();
    assert.deepEqual(env.calls.stop, ['FIN-H-01'], 'the line was cut');
    assert.equal(sv.speaking(), false);
    assert.equal(sv.waiting(), false);
    await settle();
    assert.equal(env.timers.length, 0, 'Escape does the moving, not the old timer');
    assert.equal(advanced, 0);
});

test('a new beat cuts the last line, and that line\'s late timer cannot move the scene twice', async () => {
    const env = fakeSceneEnv({ 'ADV-015': true, 'ADV-016': true });
    const sv = createSceneVoice(env);
    sv.speak(beat('ADV-015'));
    let advanced = 0;
    sv.hold(() => { advanced += 1; });
    env.pending.shift().resolve('played');
    await settle();
    assert.equal(env.timers.length, 1);
    // A click draws the next beat inside the gap.
    sv.speak(beat('ADV-016'));
    env.timers.shift().fn();
    assert.equal(advanced, 0, 'the stale timer did nothing');
    assert.equal(sv.current(), 'ADV-016');
    sv.speak(beat('ADV-017', 'SYS', 'system'));
    assert.deepEqual(env.calls.stop, ['ADV-016'], 'drawing a beat cuts the line before it');
    sv.stop();
});

test('a scene prefetches every line it might speak, choices and placeholders excepted', () => {
    const env = fakeSceneEnv({});
    const sv = createSceneVoice(env);
    const { AdversaryScene } = loadContent();
    const n = sv.prefetch(AdversaryScene.dialogue);
    assert.equal(n, AdversaryScene.dialogue.length - 2, 'all but the choice and the {REBOOTS} notice');
    assert.ok(env.calls.prefetch.includes('ADV-023B'), 'every branch reply');
    assert.ok(!env.calls.prefetch.includes('ADV-022'));
    assert.ok(!env.calls.prefetch.includes('ADV-011B'), 'a line that changes per save is not probed');
});

test('the bound sceneVoice is inert where audio is undefined', () => {
    const { sceneVoice } = boot();
    assert.equal(sceneVoice.speak(beat('ADV-010')), false);
    assert.equal(sceneVoice.hold(() => {}), false);
    assert.equal(sceneVoice.prefetch([beat('ADV-010')]), 1);
    sceneVoice.skip();
    sceneVoice.stop();
});

/* ── Fate ───────────────────────────────────────────────────────────── */
function fakeFateEnv({ chatter = true, current = null } = {}) {
    const calls = { say: [], stop: 0 };
    const env = {
        calls, cur: current,
        chatterOn: () => chatter,
        current: () => env.cur,
        say(speaker, id) { calls.say.push(`${speaker}/${id}`); env.cur = `vo__${speaker}__${id}`; return Promise.resolve('played'); },
        stop() { calls.stop += 1; env.cur = null; },
    };
    return env;
}
const bark = (id) => ({ id, text: id, context: 'Casino' });

test('Fate says the line her strip shows, and her next line replaces it', async () => {
    const env = fakeFateEnv();
    const fv = createFateVoice(env);
    assert.equal(await fv.speak(bark('CAS-HOST-001')), 'played');
    assert.equal(await fv.speak(bark('CAS-HOST-014')), 'played', 'her own line does not block her');
    assert.deepEqual(env.calls.say, ['fate/CAS-HOST-001', 'fate/CAS-HOST-014']);
    assert.equal(await fv.speak({ id: 'ADV-BARK-04', text: 'x' }), 'none', 'not her line');
    fv.stop();
    assert.equal(env.calls.stop, 1, 'the table closed: her line stops');
});

test('Dealer Chatter off: Fate says nothing, and never cuts another voice', async () => {
    const off = fakeFateEnv({ chatter: false });
    assert.equal(await createFateVoice(off).speak(bark('CAS-HOST-001')), 'off');
    assert.deepEqual(off.calls.say, []);
    for (const current of ['vo__instructor__t1-s2-0', 'vo__null-operator__ADV-010', 'vo__sys__FIN-001']) {
        const busy = fakeFateEnv({ current });
        const fv = createFateVoice(busy);
        assert.equal(await fv.speak(bark('CAS-HOST-001')), 'busy', `not over ${current}`);
        fv.stop();
        assert.equal(busy.calls.stop, 0, `closing the table does not cut ${current}`);
        assert.deepEqual(busy.calls.say, []);
    }
});

test('the bound fateVoice is inert where audio and game are undefined', async () => {
    const { fateVoice } = boot();
    assert.equal(await fateVoice.speak(bark('CAS-HOST-001')), 'off');
    fateVoice.stop();
});

/* ── Foley ──────────────────────────────────────────────────────────── */
test('foley is sfx__<cue>, for every synth cue, and nothing else', () => {
    const { audio } = boot({ withAudio: true });
    for (const cue of Object.keys(audio.SOUNDS)) {
        const stem = AF.foleyStem(cue);
        assert.equal(stem, `sfx__${cue}`);
        assert.deepEqual(plain(AF.urls(stem)), [`assets/audio/sfx__${cue}.ogg`, `assets/audio/sfx__${cue}.mp3`]);
    }
    assert.equal(AF.foleyStem('windowOpen'), 'sfx__windowOpen', 'the cue name verbatim');
    for (const bad of ['../x', 'sfx__x', '', null, 'a b', '9lives']) assert.equal(AF.foleyStem(bad), null, String(bad));
    assert.deepEqual(plain(AF.urls('sfx__../x')), []);
});

test('foley sits under the synth: a fixed trim below unity, on the cue\'s own voice', () => {
    assert.ok(AF.FOLEY_GAIN > 0 && AF.FOLEY_GAIN < 1, `${AF.FOLEY_GAIN}`);
    const db = 20 * Math.log10(AF.FOLEY_GAIN);
    assert.ok(db <= -5 && db >= -10, `about 6 dB under: ${db.toFixed(1)} dB`);
    const src = read('js/audio.js').code;
    assert.match(src, /Math\.max\(def\.fn\(ctx, G, vg, t, o\), layerFoley\(name, def, vg, t, nowMs\)\)/,
        'layered through the cue\'s voice, after the synth has passed its own gap');
});

test('foley is rate-limited per cue, never tighter than the synth or FOLEY_MIN_GAP_MS', () => {
    assert.equal(AF.foleyGap(25), AF.FOLEY_MIN_GAP_MS, 'a 25 ms click does not get a sample at 40/s');
    assert.equal(AF.foleyGap(400), 400, 'a slower cue keeps its own gap');
    assert.equal(AF.foleyGap(undefined), AF.FOLEY_MIN_GAP_MS);
    assert.equal(AF.foleyGap('junk'), AF.FOLEY_MIN_GAP_MS);
    const allow = AF.createRateLimit();
    const gap = AF.foleyGap(25);
    let played = 0;
    for (let ms = 0; ms < 1000; ms += 25) if (allow('click', ms, gap)) played += 1;
    const step = Math.ceil(gap / 25) * 25;   // the first click at or past each gap
    assert.equal(played, Math.ceil(1000 / step), `${played} samples in a second of 40/s clicks`);
    assert.equal(allow('purchase', 990, gap), true, 'each cue has its own limit');
    assert.equal(allow('purchase', 990 + gap - 1, gap), false);
    assert.equal(allow('purchase', 990 + gap, gap), true);
});

test('headless: a synth cue with no device layers nothing', () => {
    const { audio } = boot({ withAudio: true });
    assert.equal(audio.play('purchase'), false);
    assert.equal(audio.foley.played(), 0);
    assert.equal(audio.foley.known('purchase'), false, 'not even a probe');
});

/* ── Settings ───────────────────────────────────────────────────────── */
test('audio.js defaults agree with the js/state.js schema', () => {
    const { audio } = boot({ withAudio: true });
    const src = read('js/state.js').code;
    const block = src.slice(src.indexOf('audio: {'), src.indexOf('}', src.indexOf('audio: {')));
    const schema = {};
    for (const m of block.matchAll(/(\w+):\s*(true|false|[\d.]+)/g)) schema[m[1]] = JSON.parse(m[2]);
    assert.deepEqual(schema, plain(audio.DEFAULTS));
    for (const k of ['music', 'voice', 'musicEnabled', 'voiceEnabled']) assert.ok(k in audio.DEFAULTS, k);
});

test('hostile audio settings are normalised, never trusted', () => {
    const { audio } = boot({
        withAudio: true,
        settings: { audio: { music: 'loud', voice: 7, musicEnabled: 'yes', voiceEnabled: 0, master: -3, muted: 'no' } },
    });
    const s = plain(audio.settings());
    assert.equal(s.music, audio.DEFAULTS.music, 'a truthy wrong type falls back to the default');
    assert.equal(s.voice, 1, 'clamped');
    assert.equal(s.musicEnabled, true);
    assert.equal(s.voiceEnabled, true);
    assert.equal(s.master, 0);
    assert.equal(s.muted, false);
});

test('headless: no device means every file entry point is inert', async () => {
    const { audio } = boot({ withAudio: true });
    assert.equal(await audio.voice.say('instructor', 't1-s2-0'), 'off');
    assert.equal(audio.voice.known('instructor', 't1-s2-0'), false);
    assert.equal(await audio.voice.has('instructor', 't1-s2-0'), false, 'not even a probe');
    assert.equal(await audio.music.stinger('release-day'), false);
    assert.equal(audio.music.current(), null);
    audio.voice.stop();
    audio.voice.prefetch([['instructor', 't1-s2-0']]);
    audio.music.update();
});

/* ── What ships ─────────────────────────────────────────────────────── */
test('every T1 Instructor line ships as .ogg and .mp3, and MANIFEST.md has its exact text', () => {
    const manifest = readFileSync(resolve(ROOT, 'assets/audio/MANIFEST.md'), 'utf8');
    for (const l of AF.tapeLines(T1).filter((x) => x.speaker === 'instructor')) {
        for (const ext of ['ogg', 'mp3']) {
            assert.ok(existsSync(resolve(ROOT, `assets/audio/vo__instructor__${l.id}.${ext}`)), `${l.id}.${ext}`);
        }
        const row = manifest.split('\n').find((r) => r.includes(`\`${l.id}\``));
        assert.ok(row, `MANIFEST lists ${l.id}`);
        assert.ok(row.includes(l.text), `MANIFEST text for ${l.id} matches the caption (else regenerate the file)`);
    }
    for (const ext of ['ogg', 'mp3']) assert.ok(existsSync(resolve(ROOT, `assets/audio/music__primordial-shift.${ext}`)));
});

let failed = 0;
for (const { name, fn } of tests) {
    try {
        await fn();
        console.log(`  ok  ${name}`);
    } catch (err) {
        failed += 1;
        console.log(`  FAIL ${name}\n       ${err.message}`);
    }
}
if (failed) {
    console.log(`\n${failed} of ${tests.length} failed.`);
    process.exit(1);
}
console.log(`\nAudio files: ${tests.length} checks passed.`);
