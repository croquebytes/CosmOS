#!/usr/bin/env node
/**
 * Recovered footage and the Omniscient's addresses (js/footage.js).
 *
 *   node tests/footage.mjs
 *
 * The properties that matter, stated so a test cannot quietly assert a
 * neighbouring one instead:
 *
 *   - Inert until its file exists. With no reel installed nothing is filed,
 *     offered, linked or mailed, however far the game goes — and a fresh game
 *     does not even ask about a file until that reel's moment has come.
 *   - Each reel is uncovered where the catalogue says, by the game's own code
 *     paths: the first reboot puts a file in the Recycle Bin, the previous
 *     Operator's Void mail carries one, the Void forum and null:// link two,
 *     an archive annotation files one, and the Omniscient writes after the
 *     first directive, the first reboot, the Veil and an ending.
 *   - Hand-found reels (bin, web) wait to be found; the rest file themselves,
 *     once, while the player is present and no dialog is up.
 *   - Redaction removes the words: a caption's █ runs become bars, and the
 *     text under them is not in the markup.
 *   - Hostile saves: the normaliser is tested with wrong values that are truthy.
 *   - Footage is presentation: filing and watching everything leaves the
 *     economy byte-identical.
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
    'js/solitaire.js', 'js/media.js', 'js/footage.js', 'js/mail.js', 'js/etherscape.js'].map(read);

const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function boot(store = {}) {
    const calls = { sfx: [], log: [], opened: [] };
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
        ui: new Proxy({ escapeHtml, log: (m) => calls.log.push(String(m)) }, { get: (t, k) => (k in t ? t[k] : noop) }),
        system: new Proxy({ openApp: (id) => calls.opened.push(id) }, { get: (t, k) => (k in t ? t[k] : noop) }),
        requestAnimationFrame: noop,
        window: {},
        // No createElement: headless, so no watch starts and nothing probes.
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(`({ State, game, Reality, Incidents, PatienceDealer, DocumentManifest,
        MediaCatalog, MailCatalog, MailLogic, Mail, Etherscape, FootageCatalog, FootageLogic, Footage, FootageView })`, ctx);
    env.ctx = ctx;
    env.calls = calls;
    const realSfx = env.game.sfx;
    env.game.sfx = (name, opts) => { calls.sfx.push(name); return realSfx.call(env.game, name, opts); };
    env.State.reality = { runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [] };
    env.game.bootstrapModifiers(Date.now());
    return env;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const found = (env) => plain(env.State.footage.found);
const mailIds = (env) => env.State.mail.log.map((r) => r.id);

/* Every reel's file installed (true) or missing (false), as a probe would say. */
function install(env, ok = true, ids = env.FootageCatalog.reels.map((r) => r.id)) {
    for (const id of ids) env.Footage.setInstalled(id, ok);
}
/* The 1 Hz watches: footage files, then mail delivers. */
function watch(env, seconds = 1) {
    for (let i = 0; i < seconds; i++) { env.Footage.tick(); env.Mail.tick({ seconds: 1 }); }
}

/* ── Fixtures: the game's own code paths ─────────────────────────────── */
function directive(env) {
    const { game, State } = env;
    game.ensureDirective();
    for (let i = 0; i < 10; i++) game.manualPraise(null);
    game.claimDirectiveReward();
    assert.ok(State.loopSystems.directives.completed >= 1, 'fixture check: the first directive was claimed');
}
function offerings(env) {
    env.State.resources.praise = 1e6;
    env.game.purchaseUpgrade('offering_unlock');
    assert.equal(env.State.unlockedOfferings, true, 'fixture check: Offerings unlocked');
}
function breach(env) {
    env.State.resources.souls = 1e6;
    env.game.purchaseUpgrade('void_unlock');
    assert.equal(env.State.dimensions.void.unlocked, true, 'fixture check: the Veil was breached');
}
function ship(env, times = 1, bars = 3) {
    const { State, game } = env;
    for (let i = 0; i < times; i++) {
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * bars;
        const before = State.prestigeLevel;
        game.performPrestige({ confirmed: true, certifyOn: 'creation' });
        assert.equal(State.prestigeLevel, before + 1, `fixture check: the reboot from ${before} did not happen`);
    }
}
function contact(env, choice = 'OP-B') {
    env.game.resolveAdversaryChoice(choice);
    assert.equal(env.State.adversary.sceneCompleted, true, 'fixture check: the scene resolved');
}
function ending(env, band = 'curious') {
    contact(env, { hostile: 'OP-A', curious: 'OP-B', complicit: 'OP-C' }[band]);
    env.game.resolveEnding(band);
    assert.ok(env.game.endingsSeen().includes(band), `fixture check: the ${band} ending resolved`);
}
function replay(env) {
    ship(env, 12);
    const pick = env.game.archivedBuilds()[0];
    assert.ok(env.game.selectArchivedBuild(pick.reboot), 'fixture check: an archived build was selected');
    ship(env, 1);
    assert.ok(env.State.reality.annotations.length >= 1, 'fixture check: the replay was annotated');
}
/* The previous Operator's Void mail: welcome, Offerings, the Veil. */
function prevVoidMail(env) {
    directive(env); watch(env);
    offerings(env); watch(env);
    breach(env); watch(env);
    assert.ok(mailIds(env).includes('prev-02'), 'fixture check: prev-02 was delivered');
}

/* Everything, as far as a save goes: every trigger met. */
function everything(env) {
    prevVoidMail(env);
    env.State.achievementProgress.enter_void = 1;   // ui.js's counter, on entering the Void
    ending(env, 'curious');
    replay(env);
}

/* ── Harness ─────────────────────────────────────────────────────────── */
let passed = 0;
const check = (name, fn) => {
    try {
        fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (error) {
        console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`);
        process.exitCode = 1;
    }
};

console.log('\nRecovered footage and the Omniscient\n');

const probe = boot();
const { FootageCatalog, FootageLogic } = probe;
const REELS = FootageCatalog.reels;

/* ── The catalogue ───────────────────────────────────────────────────── */
check('the catalogue: 5 recovered reels and 4 addresses, slug ids, drop-in stems, known surfaces', () => {
    assert.equal(REELS.filter((r) => r.kind === 'recovered').length, 5);
    assert.equal(REELS.filter((r) => r.kind === 'address').length, 4);
    const seen = new Set();
    for (const r of REELS) {
        assert.match(r.id, /^(rec|omni)-[a-z0-9-]+$/, r.id);
        assert.ok(!seen.has(r.id), `duplicate ${r.id}`);
        seen.add(r.id);
        assert.match(r.stem, r.kind === 'recovered' ? /^rec__[a-z0-9-]+__720$/ : /^omni__[a-z0-9-]+__720$/, `${r.id}: stem`);
        assert.equal(r.webm, `assets/video/${r.stem}.webm`);
        assert.equal(r.mp4, `assets/video/${r.stem}.mp4`);
        assert.equal(r.poster, `assets/video/${r.stem}.webp`);
        assert.ok(FootageCatalog.SURFACES.includes(r.surface), `${r.id}: surface ${r.surface}`);
        assert.equal(typeof r.when, 'function', `${r.id}: trigger`);
        assert.ok(r.title && r.file && r.where && r.krea, `${r.id}: title, file, where, krea`);
        assert.ok(r.length >= 8 && r.length <= 15, `${r.id}: length`);
        if (r.kind === 'address') assert.equal(r.surface, 'mail', `${r.id}: addresses come by mail`);
    }
});

check('captions: in order, inside the reel, a known speaker; recovered ones are redacted, addresses are not', () => {
    for (const r of REELS) {
        assert.ok(r.captions.length >= 3, `${r.id}: a few lines`);
        let last = -1;
        for (const [at, who, text] of r.captions) {
            assert.ok(at > last && at < r.length, `${r.id}: caption at ${at}`);
            last = at;
            assert.ok(FootageCatalog.SPEAKERS[who], `${r.id}: speaker ${who}`);
            assert.ok(text.length <= 160, `${r.id}: a caption is a line, not a paragraph`);
        }
        const redacted = r.captions.some((c) => c[2].includes('█'));
        assert.equal(redacted, r.kind === 'recovered', `${r.id}: redaction belongs to the recovered files`);
        for (const b of r.bars || []) {
            assert.ok(b.from >= 0 && b.to > b.from, `${r.id}: bar times`);
            assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 100 && b.y + b.h <= 100, `${r.id}: bar inside the frame`);
        }
        assert.equal(!!(r.bars && r.bars.length), r.kind === 'recovered', `${r.id}: redaction bars on the recovered files only`);
    }
});

check('every mail-borne reel is attached to the mail that names it', () => {
    for (const r of REELS.filter((x) => x.surface === 'mail')) {
        const msg = probe.MailCatalog.message(r.mail);
        assert.ok(msg, `${r.id}: no message ${r.mail}`);
        assert.ok((msg.attach || []).some((a) => a.reel === r.id), `${r.id}: not attached to ${r.mail}`);
    }
});

/* ── Inert until installed ─────────────────────────────────────────── */
check('a fresh game asks about no file at all', () => {
    const env = boot();
    assert.deepEqual(plain(FootageLogic.toProbe(env.State, env.Footage.state(), env.Footage.installed)), []);
    watch(env, 600);
    assert.deepEqual(found(env), []);
});

check('with every file missing, nothing is filed, offered, linked or mailed, however far the game goes', () => {
    const env = boot();
    install(env, false);
    everything(env);
    watch(env, 5);
    assert.deepEqual(found(env), []);
    assert.deepEqual(plain(env.Footage.offered('bin')), []);
    assert.deepEqual(plain(env.Footage.linkable()), []);
    assert.ok(!mailIds(env).some((id) => id.startsWith('omni-')), 'the Omniscient never writes');
    for (const r of REELS) assert.equal(env.Footage.open(r.id), false, `${r.id} cannot be opened`);
    assert.deepEqual(env.calls.opened.filter((id) => id === 'mediaplayer'), []);
    assert.ok(!env.calls.log.some((l) => /RECOVERED|annotation in the margin/.test(l)), 'no console line');
    // And the pages that would link them do not.
    env.State.currentDimension = 'void';
    assert.doesNotMatch(env.Etherscape.resolvePage('void://forum').html, /reel:|7G_BEFORE/);
    assert.doesNotMatch(env.Etherscape.resolvePage('null://').html, /reel:|MIRROR_TEST/);
});

check('a reel is asked about only once its moment has come', () => {
    const env = boot();
    const ask = () => plain(FootageLogic.toProbe(env.State, env.Footage.state(), env.Footage.installed));
    directive(env); watch(env);
    assert.deepEqual(ask(), ['omni-successor']);
    env.Footage.setInstalled('omni-successor', false);
    assert.deepEqual(ask(), [], 'a miss is remembered');
    ship(env, 1);
    assert.deepEqual(ask(), ['rec-incident-0', 'omni-reboot']);
});

/* ── Each reel, from its real trigger ─────────────────────────────── */
check('the Omniscient: one address after the first directive, by mail, with the reel attached', () => {
    const env = boot();
    install(env);
    watch(env, 30);
    assert.deepEqual(found(env), [], 'nothing before the first directive');
    directive(env);
    watch(env, 2);
    assert.deepEqual(found(env), ['omni-successor']);
    assert.ok(mailIds(env).includes('omni-01'), 'the message for the Successor arrived');
    assert.ok(env.State.unlockedApps.includes('mediaplayer'), 'the player is on the desktop');
    assert.ok(!env.calls.log.some((l) => l.includes('[RECOVERED]')), 'the mail announces it; footage adds no line');
    assert.equal(env.calls.opened.length, 0, 'and nothing opens');
});

check('the other addresses: first reboot, the Veil, an ending', () => {
    const env = boot();
    install(env);
    directive(env); watch(env);
    ship(env, 1); watch(env);
    assert.ok(found(env).includes('omni-reboot') && mailIds(env).includes('omni-02'));
    assert.ok(!found(env).includes('omni-void'));
    breach(env); watch(env);
    assert.ok(found(env).includes('omni-void') && mailIds(env).includes('omni-03'));
    ship(env, 1);
    assert.equal(env.State.dimensions.void.unlocked, false, 'fixture check: the reboot resealed the Veil');
    ending(env); watch(env);
    assert.ok(found(env).includes('omni-ending') && mailIds(env).includes('omni-04'));
});

check('Incident 0 waits in the Recycle Bin after the first reboot, and is filed only when recovered', () => {
    const env = boot();
    install(env);
    assert.deepEqual(plain(env.Footage.offered('bin')), []);
    ship(env, 1); watch(env, 3);
    assert.deepEqual(plain(env.Footage.offered('bin')), ['rec-incident-0']);
    assert.ok(!found(env).includes('rec-incident-0'), 'not filed by itself');
    assert.ok(!env.State.recycleBin.items.some((i) => /INC-0000/.test(i.name || '')), 'never a bin item: it cannot be sacrificed');
    assert.equal(env.Footage.open('rec-incident-0'), true);
    assert.ok(found(env).includes('rec-incident-0'));
    assert.deepEqual(env.calls.opened, ['mediaplayer']);
    assert.ok(env.calls.log.some((l) => l.includes('INC-0000.rec recovered from recycle bin')), env.calls.log.join(' | '));
    assert.deepEqual(plain(env.Footage.offered('bin')), ['rec-incident-0'], 'and stays where it was found');
    // Played again from the bin: opens again, files nothing new, says nothing new.
    assert.equal(env.Footage.open('rec-incident-0'), true);
    watch(env, 3);
    assert.equal(env.calls.log.filter((l) => l.includes('INC-0000.rec')).length, 1, 'one console line, ever');
    assert.deepEqual(env.calls.opened, ['mediaplayer', 'mediaplayer']);
});

check("the previous Operator's last shift comes attached to their Void mail", () => {
    const env = boot();
    install(env);
    prevVoidMail(env);
    watch(env);
    assert.ok(found(env).includes('rec-last-shift'));
    assert.ok(env.calls.log.some((l) => l.includes('LAST_SHIFT.rec')), 'one console line');
});

check('the Void forum links Sector 7G before the failure; following it files it', () => {
    const env = boot();
    install(env);
    env.State.automatons.seraphCount = 1;
    breach(env);
    env.State.currentDimension = 'void';
    watch(env);
    assert.deepEqual(plain(env.Footage.linkable()), ['rec-sector-7g']);
    const html = env.Etherscape.resolvePage('void://forum').html;
    assert.match(html, /<a class="es-link es-link--reel" href="#" data-href="reel:rec-sector-7g">7G_BEFORE\.rec<\/a>/);
    assert.ok(!found(env).includes('rec-sector-7g'), 'not filed by being on a page');
    assert.equal(env.Etherscape.linkInfo('reel:rec-sector-7g').state, 'ok');
    assert.equal(env.Etherscape.linkInfo('reel:rec-mirror-test').state, 'dead', 'a reel not on show is a dead link');
    // What following the link does (Etherscape.follow → Footage.open).
    assert.equal(env.Footage.open('rec-sector-7g'), true);
    assert.ok(found(env).includes('rec-sector-7g'));
    assert.deepEqual(env.calls.opened, ['mediaplayer']);
});

check('null:// links the mirror test after the scene, and after an ending', () => {
    const env = boot();
    install(env);
    contact(env); watch(env);
    assert.match(env.Etherscape.resolvePage('null://').html, /data-href="reel:rec-mirror-test"/);
    env.game.resolveEnding('curious'); watch(env);
    assert.match(env.Etherscape.resolvePage('null://').html, /data-href="reel:rec-mirror-test"/);
});

check('an archive annotation files the archive floor, with its own console line', () => {
    const env = boot();
    install(env);
    replay(env);
    watch(env);
    assert.ok(found(env).includes('rec-archive-running'));
    assert.ok(env.calls.log.some((l) => l.includes('An annotation in the margin cites footage')));
});

check('filing waits for presence and for the dialog slot, then lands once', () => {
    const env = boot();
    install(env);
    directive(env);
    env.Mail.tick({ seconds: 1 });   // HR's welcome, which the first address follows
    env.game.presenceTracking = true;
    env.game.lastInputAt = 0;
    env.Footage.tick();
    assert.deepEqual(found(env), [], 'nothing while away');
    env.game.notePresence(Date.now());
    let modal = true;
    env.ctx.ui = new Proxy({ escapeHtml, log: (m) => env.calls.log.push(String(m)) },
        { get: (t, k) => (k === 'isSystemModalOpen' ? () => modal : (k in t ? t[k] : noop)) });
    env.Footage.tick();
    assert.deepEqual(found(env), [], 'nothing over a dialog');
    modal = false;
    env.Footage.tick();
    env.Footage.tick();
    assert.deepEqual(found(env), ['omni-successor']);
});

/* ── Redaction, the clock ─────────────────────────────────────────── */
check('redaction: each run of █ is one bar as wide as the run; the rest is escaped', () => {
    const html = FootageLogic.redact('Root <b>cause</b>: ████████. Was ███.', escapeHtml);
    assert.equal((html.match(/class="fx-redact"/g) || []).length, 2);
    assert.match(html, /style="--n:8"/);
    assert.match(html, /style="--n:3"/);
    assert.match(html, /&lt;b&gt;cause&lt;\/b&gt;/);
    assert.doesNotMatch(html, /█/);
    for (const r of REELS) for (const c of r.captions) assert.doesNotMatch(FootageLogic.redact(c[2], escapeHtml), /█|<script/);
});

check('captions, bars and timecode follow the reel clock', () => {
    const r = FootageCatalog.reel('rec-last-shift');
    assert.equal(FootageLogic.captionAt(r, 0)[0], 0);
    assert.equal(FootageLogic.captionAt(r, 2.59)[0], 0);
    assert.equal(FootageLogic.captionAt(r, 2.6)[0], 2.6);
    assert.equal(FootageLogic.captionAt(r, 99)[0], 7.8);
    assert.equal(FootageLogic.barsAt(r, 1).length, 0);
    assert.equal(FootageLogic.barsAt(r, 3).length, 1);
    assert.equal(FootageLogic.barsAt(r, 6).length, 2);
    assert.equal(FootageLogic.timecode([22, 58, 0], 0), '22:58:00:00');
    assert.equal(FootageLogic.timecode([22, 58, 0], 61.5), '22:59:01:12');
    assert.equal(FootageLogic.timecode([23, 59, 59], 2), '00:00:01:00', 'midnight wraps');
    assert.equal(FootageLogic.timecode('junk', -4), '00:00:00:00');
});

/* ── Persistence ──────────────────────────────────────────────────── */
check('hostile saves: wrong values that are truthy are dropped, order and membership enforced', () => {
    const N = (v) => plain(FootageLogic.normalise(v));
    assert.deepEqual(N(null), { found: [], watched: [] });
    assert.deepEqual(N('found'), { found: [], watched: [] });
    assert.deepEqual(N([1, 2]), { found: [], watched: [] });
    assert.deepEqual(N({ found: 'rec-incident-0', watched: { a: 1 } }), { found: [], watched: [] });
    assert.deepEqual(N({ found: ['omni-void', 'rec-incident-0', 'rec-incident-0', 'nope', 7, { id: 'x' }, '__proto__'],
        watched: ['omni-void', 'rec-sector-7g', true] }),
    { found: ['rec-incident-0', 'omni-void'], watched: ['omni-void'] });
});

check('a hostile State.footage is repaired in place on access, and a save round-trips', () => {
    const store = {};
    const env = boot(store);
    env.State.footage = { found: ['omni-successor', 'x', 'omni-successor'], watched: 'all', extra: 1 };
    const s = env.Footage.state();
    assert.deepEqual(plain(s), { found: ['omni-successor'], watched: [] });
    assert.equal(env.State.footage, s, 'the same object, repaired');
    env.Footage.markWatched('omni-successor');
    env.State.save();
    const again = boot(store);
    again.State.load();
    assert.deepEqual(plain(again.Footage.state()), { found: ['omni-successor'], watched: ['omni-successor'] });
});

check('found reels survive a reboot', () => {
    const env = boot();
    install(env);
    directive(env); watch(env);
    ship(env, 2); watch(env);
    assert.ok(found(env).includes('omni-successor') && found(env).includes('omni-reboot'));
});

check('footage is presentation: filing and watching everything leaves the economy identical', () => {
    const a = boot();
    const b = boot();
    install(b);
    for (const env of [a, b]) everything(env);
    watch(b, 3);
    for (const r of REELS) { if (b.Footage.available(r.id)) b.Footage.open(r.id); b.Footage.markWatched(r.id); }
    assert.equal(found(b).length, REELS.length, `every reel was found (${found(b).join(', ')})`);
    const econ = (env) => plain({ r: env.State.resources, a: env.State.automatons, p: env.State.prestigeLevel,
        d: env.State.divinityPoints, v: env.State.dimensions, u: env.State.upgrades });
    assert.deepEqual(econ(b), econ(a));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}.`);
