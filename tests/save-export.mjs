#!/usr/bin/env node
/**
 * Export Save and Import Save (game.exportSave / game.importSave).
 *
 *   node tests/save-export.mjs
 *
 * The bug: export was btoa(JSON.stringify(State)), and btoa throws on any
 * character above U+00FF. The save carries them in ordinary play — the
 * cascade throttle label, incident labels, the ending "Handover — …" labels
 * and the patch labels hold an em dash — so once one existed the Export
 * button failed, and the only report was ui.log, which writes into the
 * Engine's log and is invisible from Settings. A player at a cascade tier
 * could not export a save and was never told why.
 *
 * What matters:
 *   1. A save with an em dash in it exports, and importing the text gives the
 *      same bytes back — through the real State.load.
 *   2. Nothing already in the wild breaks. A plain-ASCII export is
 *      byte-identical to the old encoding (a build from before the fix
 *      still imports it); an old export holding Latin-1 characters (×, é) —
 *      single bytes, not valid UTF-8 — still imports exactly.
 *   3. A bad paste, an empty box, a declined confirm: nothing is written,
 *      nothing reloads, the unload save is not suppressed — and the player
 *      is told, in the panel's own status line.
 *   4. A failed export says so there too, and clears the box instead of
 *      leaving the last good text sitting under an error.
 *   5. A save of any realistic size encodes (it is chunked).
 *   6. After Import Save or Hard Reset the page lives on until the navigation
 *      commits (a full second, for Hard Reset), and a save in that window —
 *      an achievement, a filed document, the autosave timer — would write the
 *      OLD run over the imported one, or recreate the run just deleted.
 *      suppressUnloadSave only stops the beforeunload save, so the dying page
 *      stops saving altogether (State.abandonPage).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/game.js']
    .map((f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') }));

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => { queue.push([name, fn]); };
async function runAll() {
    for (const [name, fn] of queue) {
        try { await fn(); passed++; console.log(`  ok    ${name}`); }
        catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n        ')}`); }
    }
}

/* A page with just the two save boxes and the status line. `withStatus:
   false` leaves the status element out, as a Settings window that has not
   been opened would. */
function boot(store = {}, { withStatus = true, clipboard = true, reload = false } = {}) {
    const calls = { log: [], reload: 0, copied: [], confirms: 0, timers: [] };
    /* Timers are recorded, never run: a test fires the one it cares about by hand. */
    const intervals = new Map();
    let nextInterval = 0;
    const el = (extra = {}) => ({ value: '', dataset: {}, textContent: '', select: noop, ...extra });
    const dom = {
        'export-save-text': el(),
        'import-save-text': el(),
        ...(withStatus ? { 'save-status': el() } : {}),
    };
    let confirmAnswer = true;
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise, Error,
        TextEncoder, TextDecoder, Uint8Array, btoa, atob,
        isNaN, parseInt, parseFloat,
        setTimeout: (fn, ms) => { calls.timers.push({ fn, ms }); return calls.timers.length; },
        clearTimeout: noop,
        setInterval: (fn) => { intervals.set(++nextInterval, fn); return nextInterval; },
        clearInterval: (id) => { intervals.delete(id); },
        confirm: () => { calls.confirms++; return confirmAnswer; },
        alert: noop,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        navigator: clipboard ? { clipboard: { writeText: (t) => { calls.copied.push(t); return Promise.resolve(); } } } : {},
        location: { reload: () => { calls.reload++; } },
        ui: new Proxy({ log: (m) => calls.log.push(String(m)) }, { get: (t, k) => (k in t ? t[k] : noop) }),
        system: new Proxy({}, { get: () => noop }),
        requestAnimationFrame: noop,
        window: {},
        document: {
            getElementById: (id) => dom[id] || null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext('({ State, game, Modifiers })', ctx);
    // A reload boots the way the page does: State.load at parse time, nothing reset.
    // A new game is seeded and bootstrapped, which (as in the page) saves once.
    if (!reload) {
        env.State.reality = { runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
            instability: 0, cascadeTier: 0, alertedTier: 0, scars: [] };
        env.game.bootstrapModifiers(Date.now());
    }
    Object.assign(env, { store, calls, dom, ctx, intervals, setConfirm: (v) => { confirmAnswer = v; } });
    return env;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const NON_LATIN1 = /[^\x00-\xff]/;

/* A save that holds an em dash, the way play produces one: a cascade tier. */
function cascading(env) {
    env.State.reality.instability = 1.5;
    env.State.reality.alertedTier = 2;
    env.game.syncCascade(Date.now());
    env.State.save();
    return JSON.stringify(env.State);
}

const status = (env) => env.dom['save-status'];
const flush = () => new Promise((r) => setImmediate(r));

console.log('\nExport / Import Save\n');

test('fixture: play really puts a character above U+00FF in the save, and the old encoding really throws on it', () => {
    const env = boot();
    const json = cascading(env);
    assert.equal(env.State.reality.cascadeTier, 2, 'fixture check: the cascade reached its tier');
    assert.match(json, NON_LATIN1, 'fixture check: the save carries an em dash');
    assert.throws(() => btoa(json), 'fixture check: this is what the old Export hit');
});

test('a save with an em dash exports, copies, and decodes back to exactly the save', async () => {
    const env = boot();
    const json = cascading(env);
    env.game.exportSave();
    const box = env.dom['export-save-text'].value;
    assert.ok(box.length > 100, 'the box is filled');
    assert.equal(env.game.decodeSaveText(box), json, 'byte for byte');
    await flush();                                          // the status lands after the clipboard promise
    assert.equal(status(env).dataset.tone, 'ok');
    assert.deepEqual(env.calls.copied, [box], 'the same text went to the clipboard');
    assert.match(status(env).textContent, /exported and copied/);
});

test('importing that text puts the same bytes in storage, suppresses the unload save, and reloads — and State.load reads it', () => {
    const src = boot();
    const json = cascading(src);
    src.game.exportSave();
    const text = src.dom['export-save-text'].value;

    const dst = boot();
    dst.dom['import-save-text'].value = `  ${text}\n`;
    dst.game.importSave();
    assert.equal(dst.calls.confirms, 1, 'it asked first');
    assert.equal(dst.store.cosmos_save, json, 'the imported bytes, unchanged');
    assert.equal(dst.State.suppressUnloadSave, true, 'else the unload save overwrites it');
    assert.equal(dst.calls.reload, 1);

    const reloaded = boot(dst.store, { reload: true });
    assert.ok(reloaded.State.modifierLog.records.some((r) => /—/.test(r.label)), 'the em dash survived the trip through State.load');
    // Instability decays a hair on load (1.5 → 1.4999977), which is the game's, not the export's.
    assert.ok(Math.abs(reloaded.State.reality.instability - 1.5) < 0.01, `instability ${reloaded.State.reality.instability}`);
});

test('a plain-ASCII save encodes byte-identically to the old btoa, so a build from before the fix imports it', () => {
    const env = boot();
    const ascii = JSON.stringify({ resources: { praise: 5 }, name: 'plain ascii' });
    assert.equal(env.game.encodeSaveText(ascii), btoa(ascii));
    assert.equal(env.game.decodeSaveText(btoa(ascii)), ascii);
    env.State.save();
    const stored = env.store.cosmos_save;
    if (!NON_LATIN1.test(stored)) assert.equal(env.game.encodeSaveText(stored), btoa(stored), 'a real save with no dash, too');
});

test('an old export holding Latin-1 characters (× é ÿ) still imports exactly', () => {
    const env = boot();
    const old = JSON.stringify({ resources: { praise: 1 }, label: 'DEV ×10 cap — no, ×10 cap, café, ÿ'.replace('—', '-') });
    assert.doesNotMatch(old, NON_LATIN1, 'fixture check: Latin-1 only, so the old btoa accepted it');
    const exportedByTheOldBuild = btoa(old);
    assert.equal(env.game.decodeSaveText(exportedByTheOldBuild), old, 'the bytes are Latin-1, not UTF-8, and are read that way');
    env.dom['import-save-text'].value = exportedByTheOldBuild;
    env.game.importSave();
    assert.equal(env.store.cosmos_save, old);
    assert.equal(env.calls.reload, 1);
});

test('a trailing-lone-byte Latin-1 export falls back instead of throwing', () => {
    const env = boot();
    for (const text of ['ÿ', 'caf\xe9', '\xc3', 'a\xc3b', '\xe2\x82']) {
        assert.equal(env.game.decodeSaveText(btoa(text)), text, JSON.stringify(text));
    }
});

test('UTF-8 and Latin-1 are told apart by validity: real UTF-8 never decodes as Latin-1', () => {
    const env = boot();
    for (const text of ['—', '× — é', '日本語', '😀 emoji', 'Handover — ledger ×3']) {
        assert.equal(env.game.decodeSaveText(env.game.encodeSaveText(text)), text, text);
    }
});

test('a bad paste writes nothing, reloads nothing, does not suppress the unload save, and says so', () => {
    const bad = [
        ['not base64 at all!!', 'not base64'],
        [btoa('this is not json'), 'base64 of text'],
        [btoa('[1,2,3]'), 'a JSON array'],
        [btoa('{"nothing":1}'), 'JSON with no resources'],
        [btoa('null'), 'JSON null'],
        ['====', 'padding only'],
    ];
    for (const [text, label] of bad) {
        const env = boot();
        const stored = env.store.cosmos_save;                  // boot saved once, as the page does
        env.dom['import-save-text'].value = text;
        env.game.importSave();
        assert.equal(env.store.cosmos_save, stored, `${label}: nothing written`);
        assert.equal(env.calls.reload, 0, `${label}: no reload`);
        assert.equal(env.State.suppressUnloadSave, false, `${label}: the unload save stands`);
        assert.equal(status(env).dataset.tone, 'error', `${label}: told, in the panel`);
        assert.match(status(env).textContent, /Invalid or corrupted/, label);
    }
});

test('an empty box and a declined confirm change nothing; the empty box says so', () => {
    const env = boot();
    env.game.importSave();
    assert.equal(status(env).dataset.tone, 'error');
    assert.match(status(env).textContent, /paste a save string/);
    assert.equal(env.calls.confirms, 0, 'no confirm for nothing');

    const src = boot();
    cascading(src);
    src.game.exportSave();
    const declined = boot();
    const stored = declined.store.cosmos_save;
    declined.setConfirm(false);
    declined.dom['import-save-text'].value = src.dom['export-save-text'].value;
    declined.game.importSave();
    assert.equal(declined.calls.confirms, 1);
    assert.equal(declined.store.cosmos_save, stored, 'the run in storage is untouched');
    assert.equal(declined.calls.reload, 0);
    assert.equal(declined.State.suppressUnloadSave, false);
});

test('a failed export says so in the panel and clears the box, rather than leaving old text under an error', async () => {
    const env = boot();
    env.dom['export-save-text'].value = 'the last good export';
    env.State.circular = env.State;                         // JSON.stringify throws on a cycle
    env.game.exportSave();
    delete env.State.circular;
    assert.equal(env.dom['export-save-text'].value, '');
    assert.equal(status(env).dataset.tone, 'error');
    assert.match(status(env).textContent, /Error exporting save/);
    assert.deepEqual(env.calls.copied, [], 'nothing was copied');
    env.game.exportSave();
    await flush();
    assert.equal(status(env).dataset.tone, 'ok', 'and the next export works');
});

test('without a clipboard the box is still filled, and the status says to copy by hand', () => {
    const env = boot({}, { clipboard: false });
    env.game.exportSave();
    assert.ok(env.dom['export-save-text'].value.length > 100);
    assert.match(status(env).textContent, /copy manually/);
});

test('no status element (Settings not open) is not an error: the message still goes to ui.log', async () => {
    const env = boot({}, { withStatus: false });
    env.game.exportSave();
    await flush();
    assert.ok(env.dom['export-save-text'].value.length > 100);
    assert.ok(env.calls.log.some((m) => /exported/.test(m)));
    env.dom['import-save-text'].value = 'garbage!!';
    assert.doesNotThrow(() => env.game.importSave());
    assert.ok(env.calls.log.some((m) => /Invalid or corrupted/.test(m)));
});

test('a very large save (a megabyte of text, em dashes throughout) encodes and decodes: the encoder is chunked', () => {
    const env = boot();
    const big = JSON.stringify({ resources: {}, ledger: Array.from({ length: 20000 }, (_, i) => `entry ${i} — handover ×${i}`) });
    assert.ok(big.length > 600000, `fixture check: ${big.length} characters`);
    const text = env.game.encodeSaveText(big);
    assert.equal(env.game.decodeSaveText(text), big);
});

test('export does not touch the run: State is byte-identical before and after', () => {
    const env = boot();
    cascading(env);
    const before = JSON.stringify(env.State);
    env.game.exportSave();
    env.game.exportSave();
    assert.equal(JSON.stringify(env.State), before);
    assert.deepEqual(plain(env.State.dev), { tainted: false, actions: 0, since: 0 });
});

/* ── the dying page ───────────────────────────────────────────────────── */

/* The autosave timer: the one interval whose callback is State.save. */
const liveAutosaves = (env) => [...env.intervals.values()].filter((fn) => /State\.save/.test(String(fn)));

/* The exported save of a cascading run, ready to paste into a fresh page. */
function pasted() {
    const src = boot();
    const json = cascading(src);
    src.game.exportSave();
    return { json, text: src.dom['export-save-text'].value };
}

test('after Import Save, a late State.save() in the dying page leaves the imported text in storage', () => {
    const { json, text } = pasted();
    const env = boot();
    env.dom['import-save-text'].value = text;
    env.game.importSave();
    assert.equal(env.calls.reload, 1, 'fixture check: it asked for the reload');
    assert.equal(env.store.cosmos_save, json, 'fixture check: the import landed');

    const written = { ...env.store };
    env.State.resources.praise += 1234;                    // the old run keeps moving until the navigation commits
    env.State.save();                                      // an achievement, a filed document, a delivered mail
    assert.deepEqual({ ...env.store }, written, 'a late save wrote something');
    assert.equal(env.store.cosmos_save, json, 'the imported text, not the run that was on screen');
});

test('after Import Save, the autosave timer is stopped, and the page is marked as dying', () => {
    const { text } = pasted();
    const env = boot();
    assert.equal(liveAutosaves(env).length, 1, 'fixture check: the page starts with its autosave timer');
    env.dom['import-save-text'].value = text;
    env.game.importSave();
    assert.equal(liveAutosaves(env).length, 0, 'the timer is still running');
    assert.equal(env.State.suppressUnloadSave, true, 'the unload save is suppressed too');
});

test('after Hard Reset, a late State.save() in the one-second window does not recreate the run', () => {
    const env = boot();
    assert.ok('cosmos_save' in env.store, 'fixture check: there is a run to delete');
    env.game.hardReset();
    assert.equal(env.calls.confirms, 2, 'it asked twice');
    assert.ok(!('cosmos_save' in env.store), 'the run is gone');
    const timer = env.calls.timers.find((t) => t.ms === 1000);
    assert.ok(timer, 'fixture check: the reload waits a second');
    assert.equal(env.calls.reload, 0, 'fixture check: still inside the window');

    env.State.save();                                      // the window: the old page is still running
    assert.ok(!('cosmos_save' in env.store), 'a save in the window recreated the run Hard Reset deleted');

    timer.fn();                                            // the stored callback: the second is up
    assert.equal(env.calls.reload, 1);
    env.State.save();                                      // and the navigation has still not committed
    assert.ok(!('cosmos_save' in env.store), 'a save after the reload was requested recreated it');
});

test('after Hard Reset, the autosave timer is stopped, and the page is marked as dying', () => {
    const env = boot();
    assert.equal(liveAutosaves(env).length, 1, 'fixture check: the page starts with its autosave timer');
    env.game.hardReset();
    assert.equal(liveAutosaves(env).length, 0, 'the timer is still running');
    assert.equal(env.State.suppressUnloadSave, true, 'the unload save is suppressed too');
});

test('a declined Hard Reset (either confirm) leaves the page saving', () => {
    for (const declineAt of [1, 2]) {
        const env = boot();
        let asked = 0;
        env.ctx.confirm = () => ++asked !== declineAt;
        env.game.hardReset();
        assert.equal(asked, declineAt, `declined at confirm ${declineAt}`);
        assert.ok('cosmos_save' in env.store, 'the run stands');
        assert.equal(liveAutosaves(env).length, 1, 'the timer runs');
        assert.equal(env.State.suppressUnloadSave, false);
        env.State.resources.praise += 7;
        env.State.save();
        assert.equal(JSON.parse(env.store.cosmos_save).resources.praise, env.State.resources.praise, 'and it still saves');
    }
});

test('an import whose storage write throws leaves a page that can still save', () => {
    const { text } = pasted();
    const env = boot();
    const setItem = env.ctx.localStorage.setItem;
    env.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    env.dom['import-save-text'].value = text;
    env.game.importSave();
    env.ctx.localStorage.setItem = setItem;
    assert.equal(env.calls.reload, 0, 'no reload');
    assert.equal(status(env).dataset.tone, 'error', 'and the player is told');
    assert.equal(env.State.suppressUnloadSave, false, 'the unload save still stands');
    assert.equal(liveAutosaves(env).length, 1, 'the autosave timer still runs');
    env.State.resources.praise += 7;
    env.State.save();
    assert.equal(JSON.parse(env.store.cosmos_save).resources.praise, env.State.resources.praise, 'and the run still saves');
});

await runAll();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
