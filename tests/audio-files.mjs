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
    return vm.runInContext(`({ AudioFiles, createTapeVoice, tapeVoice, MediaCatalog${withAudio ? ', audio' : ''} })`, ctx);
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 4) { for (let i = 0; i < n; i++) await tick(); }

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const { AudioFiles: AF, createTapeVoice, tapeVoice, MediaCatalog } = boot();
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
    tapeVoice.stop();
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
