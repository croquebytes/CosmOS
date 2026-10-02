#!/usr/bin/env node
/**
 * Etherscape — the page registry, the public API, the newspaper and the
 * Navigator's own state.
 *
 *   node tests/etherscape.mjs
 *
 * The properties, stated so a test cannot quietly assert a neighbouring one:
 *
 *   - Every page renders, in a fresh save and a late one, and a hostile save
 *     renders a thinner page rather than throwing.
 *   - Pages unlock with progress, stay reachable once reached, and a locked
 *     page is a dead link with a reason — except null://, which is a 404.
 *   - The shared-namespace URLs that CMS Mail and Choir link to answer
 *     knows() exactly when the player can reach them.
 *   - The Celestial Times is written from real events (real ships, real
 *     tickets, real endings), the same save prints the same paper, and a new
 *     event never re-words an old headline.
 *   - The status page says what the game state says.
 *   - Cosmopedia's numbers ARE the code's: asserted against the constants,
 *     and a constant changed in the running vm changes the article.
 *   - Etherscape reads the economy and never writes it.
 *   - Anything from a save is escaped and cannot become markup.
 *
 * Runs are stated in reboot bars (1e8 Souls at the start), never in Souls.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const read = (f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') });
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/incidents.js', 'js/solitaire.js',
    'js/game.js', 'js/media.js', 'js/etherscape.js'].map(read);

const escapeHtml = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function boot(store = {}) {
    const logs = [];
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
        ui: new Proxy({ escapeHtml, log: (m) => logs.push(String(m)) }, { get: (t, k) => (k in t ? t[k] : noop) }),
        system: new Proxy({}, { get: () => noop }),
        requestAnimationFrame: noop,
        window: {},
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(`({ State, game, Economy, Reality, RealityChannels, RealityPool, Incidents, Modifiers,
        PatienceRules, PatienceLedger, ShopItemList, UpgradeList, AutomatonSpecs, RepeatableList, DocumentManifest,
        MediaCatalog, AdversaryFinale, PRISTINE, Etherscape, EtherscapeLogic, EtherscapeSites })`, ctx);
    env.ctx = ctx;
    env.logs = logs;
    env.store = store;
    return env;
}

const SEED = 20261001;

function fresh(store = {}) {
    const env = boot(store);
    env.State.reality = {
        runSeed: SEED, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    return env;
}

function earn(env, bars = 3) {
    const { State, game } = env;
    State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * bars;
}

function ship(env, { bars = 3, certifyOn = 'creation' } = {}) {
    const { State, game } = env;
    earn(env, bars);
    const before = State.prestigeLevel;
    const shipped = JSON.parse(JSON.stringify(State.reality.build));
    game.performPrestige({ confirmed: true, certifyOn });
    assert.equal(State.prestigeLevel, before + 1, `fixture check: the reboot from ${before} did not happen`);
    return shipped;
}

/* A save deep in the game: thirteen real ships (an archived replay among
   them), the Void entered, every rank owned, Patience installed, contact made
   and the hostile ending resolved, two tickets open. */
function lateGame() {
    const env = fresh();
    const { State, game, Incidents } = env;
    while (State.prestigeLevel < Reality(env).ARCHIVE_UNLOCK) ship(env);
    game.setBuildChannel('archived');
    game.selectArchivedBuild(2);
    ship(env);
    assert.equal(State.reality.build.channel, 'archived', 'fixture check: the archived replay started');
    ship(env);   // the replay itself ships, at zero
    Object.assign(State.automatons, { seraphCount: 60, throneCount: 20, cherubCount: 14, dominionCount: 3 });
    State.achievementProgress.buy_seraph_count = 60;
    State.unlockedApps.push('notepad', 'mediaplayer', 'adorationshop', 'solitaire', 'dimensions');
    State.dimensions.void.unlocked = true;
    State.currentDimension = 'void';
    State.adversary.contacted = true;
    State.adversary.sceneCompleted = true;
    State.adversary.playerChoice = 'OP-A';
    State.adversary.standing = -5;
    game.resolveEnding('hostile');
    Incidents.state().attendedSeconds = 5000;
    Incidents.file('choir_desync', { severity: 2, falseAlarm: false, sector: '3A' });
    Incidents.file('altar_overflow', { severity: 1, falseAlarm: false, sector: '9F' });
    return env;
}
const Reality = (env) => env.Reality;

const plain = (v) => JSON.parse(JSON.stringify(v));
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
const pageText = (env, url) => text(env.Etherscape.resolvePage(url).html);
const pct = (x) => `${Number((x * 100).toFixed(4))}%`;

const SHARED = [
    'cms://intranet', 'cms://hr/policies', 'news://celestial-times', 'sector://7g/status',
    'cosmopedia://', 'cosmopedia://incidents', 'cosmopedia://reality-builds', 'cosmopedia://certification',
    'cosmopedia://storage', 'cosmopedia://void', 'cosmopedia://patience',
    'fate://casino', 'seraph://fanpage', 'void://forum', 'null://',
    // Added at the lead's request: CMS Mail and Choir link to these too.
    'cosmopedia://divine-reboot', 'cosmopedia://archived-channel', 'cosmopedia://sector-7g',
];

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ═════════════════════════════ Rendering ═════════════════════════════ */

test('the registry: 20-25 pages, every one a canonical URL, with a title and a theme', () => {
    const env = fresh();
    const urls = env.Etherscape.known();
    assert.ok(urls.length >= 20 && urls.length <= 26, `${urls.length} pages`);
    for (const url of urls) {
        assert.equal(env.EtherscapeLogic.canonical(url), url, `${url} is canonical`);
        const page = env.EtherscapeSites.pages[url];
        assert.ok(page.title && page.theme && typeof page.render === 'function', url);
    }
    for (const url of SHARED) assert.ok(urls.includes(url), `the shared URL ${url} is implemented`);
});

test('every page renders without throwing in a fresh save (all forced reachable)', () => {
    const env = fresh();
    env.Etherscape.store().unlocked = env.Etherscape.known();
    env.State.adversary.contacted = true; // null:// is secret otherwise
    for (const url of env.Etherscape.known()) {
        const page = env.Etherscape.resolvePage(url);
        assert.equal(page.status, 'ok', url);
        assert.doesNotMatch(page.html, /Server error/, `${url} rendered`);
        assert.ok(text(page.html).length > 40, `${url} has content`);
    }
});

test('every page renders without throwing in a late-game save', () => {
    const env = lateGame();
    for (const url of env.Etherscape.known()) {
        const page = env.Etherscape.resolvePage(url);
        assert.equal(page.status, 'ok', `${url} is reachable late`);
        assert.doesNotMatch(page.html, /Server error/, `${url} rendered`);
    }
});

test('null:// changes after an ending; void://forum and HR policy follow it too', () => {
    const env = fresh();
    const { State, game } = env;
    State.adversary.contacted = true;
    const before = pageText(env, 'null://');
    assert.match(before, /There is nothing here/);
    State.adversary.sceneCompleted = true;
    State.adversary.standing = 5;
    const band = pageText(env, 'null://');
    assert.match(band, /Leave the console running/, 'complicit band');
    for (let i = 0; i < 13; i++) ship(env);
    game.resolveEnding('complicit');
    const after = pageText(env, 'null://');
    assert.match(after, new RegExp(env.AdversaryFinale.endings.complicit.label));
    assert.match(after, /Operator Emeritus/);
    assert.notEqual(before, after);
    assert.match(pageText(env, 'cms://hr/policies'), /Operator of record is void_mirror\.service/);
});

test('HR policies are revised with the reboot count', () => {
    const env = fresh();
    const r0 = pageText(env, 'cms://hr/policies');
    assert.match(r0, /revision 1\b/i);
    assert.doesNotMatch(r0, /HR-014/);
    const beta = env.EtherscapeSites.channelOpensAt('beta');
    while (env.State.prestigeLevel < beta) ship(env);
    const r = pageText(env, 'cms://hr/policies');
    assert.match(r, new RegExp(`revision ${beta + 1}\\b`, 'i'));
    assert.match(r, /HR-014/);
    assert.match(r, new RegExp(`Beta channel has been open to you since reboot ${beta}`));
    assert.doesNotMatch(r, /HR-022/, 'Nightly not yet');
});

/* ═════════════════════════════ Unlocks ═════════════════════════════ */

test('the app arrives with the first Seraph, bought the real way', () => {
    const env = fresh();
    const { State, game, Etherscape } = env;
    assert.equal(Etherscape.milestone(), false);
    assert.equal(Etherscape.appUnlocked(), false);
    assert.equal(Etherscape.ensureApp(), false);
    State.resources.praise = 50;
    game.buyAutomator('seraph');
    assert.equal(State.automatons.seraphCount, 1, 'fixture check: the Seraph was bought');
    assert.equal(Etherscape.milestone(), true);
    assert.equal(Etherscape.ensureApp(), true);
    assert.ok(State.unlockedApps.includes('etherscape'));
    assert.ok(env.logs.some((l) => /\[ETHERSCAPE\]/.test(l)), 'a log line says so');
    assert.equal(Etherscape.ensureApp(), false, 'installed once');
});

test('a save past its first reboot has the app without a Seraph this run', () => {
    const env = fresh();
    ship(env);
    assert.equal(env.State.automatons.seraphCount, 0, 'fixture check: the reboot reset the choir');
    assert.equal(env.Etherscape.milestone(), true);
});

test('page gates: each locked page opens at its milestone and not before', () => {
    const env = fresh();
    const { State, Etherscape } = env;
    State.automatons.seraphCount = 1;
    const ok = (u) => Etherscape.resolvePage(u).status === 'ok';
    assert.equal(ok('throne://fanclub'), false);
    State.automatons.throneCount = 1;
    assert.equal(ok('throne://fanclub'), true);
    assert.equal(ok('cherub://shrine'), false);
    State.automatons.cherubCount = 1;
    assert.equal(ok('cherub://shrine'), true);
    assert.equal(ok('fate://casino'), false);
    assert.equal(ok('cosmopedia://patience'), false);
    State.unlockedApps.push('adorationshop');
    assert.equal(ok('fate://casino'), true);
    assert.equal(ok('cosmopedia://patience'), true);
    assert.equal(ok('cosmopedia://void'), false);
    State.dimensions.void.unlocked = true;
    assert.equal(ok('cosmopedia://void'), true);
    assert.equal(ok('operator://home'), false);
    while (State.prestigeLevel < env.Reality.ARCHIVE_UNLOCK - 1) ship(env);
    assert.equal(ok('operator://home'), true, 'the previous Operator after the first ship');
    assert.equal(ok('cosmopedia://archived-channel'), true, 'the wiki explains the archive before it opens');
});

test('the Void forum opens on entering the Void and stays open after the Veil reseals', () => {
    const env = fresh();
    const { State, Etherscape } = env;
    State.automatons.seraphCount = 1;
    assert.equal(Etherscape.resolvePage('void://forum').status, 'locked');
    State.dimensions.void.unlocked = true;
    assert.equal(Etherscape.resolvePage('void://forum').status, 'locked', 'breaching is not entering');
    State.currentDimension = 'void';
    assert.equal(Etherscape.resolvePage('void://forum').status, 'ok');
    assert.deepEqual(plain(Etherscape.observe()).filter((u) => u === 'void://forum'), ['void://forum']);
    ship(env);
    State.currentDimension = 'primordial';
    assert.equal(State.dimensions.void.unlocked, false, 'fixture check: the reboot resealed the Veil');
    assert.equal(Etherscape.resolvePage('void://forum').status, 'ok', 'sticky');
});

test('a locked link is a dead link with its reason; a secret page is a 404 and never linked live', () => {
    const env = fresh();
    env.State.automatons.seraphCount = 1;
    const cool = env.Etherscape.resolvePage('etherscape://whats-cool').html;
    assert.match(cool, /<span class="es-dead"[^>]*title="Members only\. Membership is granted on the far side of the Veil\."[^>]*>[^<]*<\/span>/);
    assert.match(cool, /<a class="es-link[^"]*" href="#" data-href="cms:\/\/intranet">/);
    const nul = env.Etherscape.resolvePage('null://');
    assert.equal(nul.status, 'missing', 'null:// does not exist until contact');
    assert.match(text(nul.html), /This page has been archived/);
    for (const url of env.Etherscape.known()) {
        const html = env.Etherscape.resolvePage(url).html;
        assert.doesNotMatch(html, /data-href="null:\/\//, `${url} links null:// live before contact`);
    }
    const locked = env.Etherscape.resolvePage('void://forum');
    assert.equal(locked.status, 'locked');
    assert.match(text(locked.html), /Access restricted/);
});

test('unknown addresses are an in-world 404; the mortal web is out of scope', () => {
    const env = fresh();
    const p = env.Etherscape.resolvePage('cms://does-not-exist');
    assert.equal(p.status, 'missing');
    assert.match(p.title, /Archived/);
    assert.match(text(p.html), /This page has been archived/);
    assert.match(text(p.html), /cms:\/\/does-not-exist/);
    const m = env.Etherscape.resolvePage('https://example.com');
    assert.equal(m.status, 'missing');
    assert.match(text(m.html), /mortal web is not in scope/);
});

/* ═════════════════════════════ The API ═════════════════════════════ */

test('knows(): nothing before the app exists, the open pages after, everything late', () => {
    const env = fresh();
    for (const url of SHARED) assert.equal(env.Etherscape.knows(url), false, `${url} before the first Seraph`);
    env.State.automatons.seraphCount = 1;
    const open = ['cms://intranet', 'cms://hr/policies', 'news://celestial-times', 'sector://7g/status',
        'cosmopedia://', 'cosmopedia://incidents', 'cosmopedia://reality-builds', 'cosmopedia://certification',
        'cosmopedia://storage', 'seraph://fanpage',
        'cosmopedia://divine-reboot', 'cosmopedia://archived-channel', 'cosmopedia://sector-7g'];
    for (const url of SHARED) {
        assert.equal(env.Etherscape.knows(url), open.includes(url), `${url} after the first Seraph`);
    }
    const late = lateGame();
    for (const url of SHARED) assert.equal(late.Etherscape.knows(url), true, `${url} late`);
    assert.deepEqual(plain(late.Etherscape.reachable()).sort(), plain(late.Etherscape.known()).sort());
});

test('knows(): addresses are canonicalised; junk is refused without throwing', () => {
    const env = fresh();
    env.State.automatons.seraphCount = 1;
    const K = env.Etherscape.knows;
    assert.equal(K('CMS://Intranet/'), true);
    assert.equal(K('  cosmopedia:/// '), true);
    assert.equal(K('cosmopedia:'), true);
    assert.equal(K('news://celestial-times//'), true);
    for (const junk of ['cms://nope', 'intranet', '', null, undefined, 42, {}, [], 'doc:DOC-NEW-06', 'x'.repeat(5000)]) {
        assert.equal(K(junk), false, `knows(${String(junk).slice(0, 20)})`);
    }
});

test('open(): refuses what knows() refuses, and never throws headless', () => {
    const env = fresh();
    assert.equal(env.Etherscape.open('cms://intranet'), false, 'before the app exists');
    env.State.automatons.seraphCount = 1;
    assert.equal(env.Etherscape.open('void://forum'), false, 'locked');
    assert.equal(env.Etherscape.open('cms://nope'), false, 'unknown');
    assert.equal(env.Etherscape.open('cms://intranet'), false, 'no window to open headless');
});

test('cross-links: doc:, tape: and app: are live only when the thing is', () => {
    const env = fresh();
    const { State, Etherscape } = env;
    State.automatons.seraphCount = 1;
    State.documents.collected.push('DOC-NEW-06');
    assert.equal(Etherscape.linkInfo('doc:DOC-NEW-06').state, 'dead', 'collected, but no Notepad to read it in');
    State.unlockedApps.push('notepad');
    assert.equal(Etherscape.linkInfo('doc:DOC-NEW-06').state, 'ok');
    assert.equal(Etherscape.linkInfo('doc:doc-new-06').state, 'ok', 'doc ids are case-insensitive');
    assert.equal(Etherscape.linkInfo('doc:DOC-NEW-05').state, 'dead');
    assert.equal(Etherscape.linkInfo('tape:t2').state, 'dead', 'MediaPlayerView is not loaded headless');
    assert.equal(Etherscape.linkInfo('tape:zz').state, 'dead');
    assert.match(Etherscape.linkInfo('tape:t1').hint, /Filed after your tenth Miracle/);
});

test('every doc:/tape:/app: a page names exists', () => {
    const env = fresh();
    const src = readFileSync(resolve(ROOT, 'js/etherscape.js'), 'utf8');
    const docs = new Set(env.DocumentManifest.map((d) => d.id));
    const tapes = new Set(env.MediaCatalog.tapes.map((t) => t.id));
    const apps = new Set([...readFileSync(resolve(ROOT, 'js/system.js'), 'utf8').matchAll(/^\s{8}(\w+): \{ label:/gm)].map((m) => m[1]));
    for (const [, kind, id] of src.matchAll(/\[\[(doc|tape|app):([A-Za-z0-9_-]+)/g)) {
        if (kind === 'doc') assert.ok(docs.has(id) || /^ARC-$/.test(id), `doc:${id}`);
        if (kind === 'tape') assert.ok(tapes.has(id), `tape:${id}`);
        if (kind === 'app') assert.ok(apps.has(id), `app:${id}`);
    }
    assert.ok(apps.has('etherscape'), 'the Navigator is in system.appMeta');
});

/* ═════════════════════════════ The Celestial Times ═════════════════════ */

test('headlines: the template is a pure function of the event key (FNV-1a pinned)', () => {
    const env = fresh();
    const L = env.EtherscapeLogic;
    assert.equal(L.hash(''), 0x811C9DC5);
    assert.equal(L.hash('ship:3'), 1278077892);
    for (const [k, pool] of Object.entries(L.NEWS)) {
        const pools = Array.isArray(pool) ? [pool] : Object.values(pool);
        for (const p of pools) assert.ok(p.length >= 1 && p.every((t) => typeof t === 'string' && t.length > 10), k);
    }
});

test('headlines: the same save prints the same paper, in a new vm too', () => {
    const a = lateGame();
    const one = plain(a.EtherscapeLogic.headlines(a.Etherscape.snapshot()));
    const two = plain(a.EtherscapeLogic.headlines(a.Etherscape.snapshot()));
    assert.deepEqual(one, two);
    a.State.save();
    const b = boot({ ...a.store });
    b.game.bootstrapModifiers(Date.now());
    const three = plain(b.EtherscapeLogic.headlines(b.Etherscape.snapshot()));
    assert.deepEqual(three.map((h) => h.text).filter((t) => !/SEV-|filed|Pager|Ticket|Backup/.test(t)),
        one.map((h) => h.text).filter((t) => !/SEV-|filed|Pager|Ticket|Backup/.test(t)));
});

test('headlines: real ships, scars, replays, tickets and endings each make the paper', () => {
    const env = lateGame();
    const { State, Reality, Incidents } = env;
    const heads = env.EtherscapeLogic.headlines(env.Etherscape.snapshot());
    const all = heads.map((h) => h.text).join('\n');
    const lastOriginal = State.reality.history.filter((r) => r.channel !== 'archived').slice(-1)[0];
    assert.match(all, new RegExp(`v${Reality.versionOfLevel(lastOriginal.level).replace(/\./g, '\\.')}`), 'the last ship');
    assert.ok(heads.some((h) => h.key.startsWith('replay:')), 'the archived replay');
    const replay = State.reality.history.find((r) => r.channel === 'archived');
    assert.match(all, new RegExp(`Archived branch v${Reality.versionOfLevel(replay.level).replace(/\./g, '\\.')}|re-runs v${Reality.versionOfLevel(replay.level).replace(/\./g, '\\.')}|Old build v${Reality.versionOfLevel(replay.level).replace(/\./g, '\\.')}`));
    for (const id of State.reality.scars) assert.ok(heads.some((h) => h.key === `scar:${id}`), `scar ${id}`);
    for (const inc of Incidents.state().open) {
        assert.ok(all.includes(Incidents.titleOf(inc)), `ticket ${inc.id} is in the paper`);
    }
    assert.ok(heads.some((h) => h.key.startsWith('ending:hostile')), 'the ending');
    assert.ok(heads.some((h) => h.key === 'contact'), 'the contact');
    // Newest first: the ending was resolved after the last ship.
    const iEnding = heads.findIndex((h) => h.key.startsWith('ending:'));
    const iFirstShip = heads.findIndex((h) => h.key === 'ship:0');
    assert.ok(iEnding < iFirstShip, 'newest first');
});

test('headlines: a new event adds a line and re-words nothing', () => {
    const env = fresh();
    for (let i = 0; i < 3; i++) ship(env);
    const before = env.EtherscapeLogic.headlines(env.Etherscape.snapshot());
    ship(env);
    const after = env.EtherscapeLogic.headlines(env.Etherscape.snapshot());
    const byKey = new Map(after.map((h) => [h.key, h.text]));
    for (const h of before) {
        if (byKey.has(h.key)) assert.equal(byKey.get(h.key), h.text, `${h.key} kept its wording`);
    }
    assert.ok(after.some((h) => h.key === 'ship:3'), 'the new ship is news');
    assert.equal(after[0].at >= before[0].at, true);
});

test('headlines: a cascade makes the paper at its tier', () => {
    const env = fresh();
    ship(env);
    env.State.reality.instability = 1.6;
    const heads = env.EtherscapeLogic.headlines(env.Etherscape.snapshot());
    const c = heads.find((h) => h.key.startsWith('cascade:'));
    assert.ok(c, 'a cascade headline');
    assert.match(c.key, /:2$/, 'tier 2');
    assert.equal(heads[0].key, c.key, 'the outage leads');
});

test('the news page escapes every headline and caps the edition', () => {
    const env = lateGame();
    const html = env.Etherscape.resolvePage('news://celestial-times').html;
    const heads = env.EtherscapeLogic.headlines(env.Etherscape.snapshot());
    assert.ok(heads.length > 14, `fixture check: ${heads.length} headlines`);
    const shown = heads.filter((h) => text(html).includes(h.text.replace(/\s+/g, ' ')));
    assert.ok(shown.length >= 10 && shown.length <= 14, `${shown.length} shown`);
});

/* ═════════════════════════════ Status ═════════════════════════════ */

test('the status page matches live state: build, channel, issues, tier, tickets', () => {
    const env = lateGame();
    const { State, Reality, Incidents, game } = env;
    State.reality.instability = 1.2;
    const t = pageText(env, 'sector://7g/status');
    const build = State.reality.build;
    const c = game.cascadeState();
    assert.match(t, new RegExp(`Reality build v${build.version.replace(/\./g, '\\.')}`));
    assert.match(t, new RegExp(`Channel ${env.RealityChannels[build.channel].label}`));
    assert.match(t, new RegExp(`Instability ${c.instability.toFixed(2)} / ${c.ceiling.toFixed(2)}`));
    assert.match(t, new RegExp(`Instability tier ${c.label}`));
    assert.equal(c.label, 'SEV-2 DEGRADED', 'fixture check');
    assert.match(t, /DEGRADED/);
    const unpatched = Reality.unpatchedIssues(build);
    assert.match(t, new RegExp(`Unpatched known issues ${unpatched.length}\\b`));
    for (const e of unpatched) assert.ok(t.includes(e.note), `issue ${e.id} listed`);
    const open = Incidents.state().open;
    assert.equal(open.length, 2, 'fixture check');
    assert.match(t, new RegExp(`Open incidents ${open.length} \\(worst SEV-1\\)`));
    for (const inc of open) assert.ok(t.includes(inc.id) && t.includes(Incidents.titleOf(inc)), inc.id);
    assert.match(t, new RegExp(`Scars on record ${State.reality.scars.length}\\b`));
});

test('the status page follows a patch and a resolved ticket', () => {
    const env = lateGame();
    const { State, Reality, Incidents, game } = env;
    const issue = Reality.unpatchedIssues(State.reality.build)[0];
    if (issue) {
        const cost = Reality.patchCostOf(State.reality.build, issue.id);
        cost.bag[cost.resource] = cost.amount * 2;
        assert.equal(game.patchKnownIssue(issue.id), true, 'fixture check: patched');
    }
    const id = Incidents.state().open[0].id;
    Incidents.resolve(id, 'labour');
    const t = pageText(env, 'sector://7g/status');
    assert.match(t, new RegExp(`Unpatched known issues ${Reality.unpatchedIssues(State.reality.build).length}\\b`));
    assert.ok(!t.includes(id), 'the resolved ticket is gone');
});

/* ═════════════════════════════ Cosmopedia ═════════════════════════════ */

test('Cosmopedia: incidents numbers are Incidents constants', () => {
    const env = fresh();
    const I = env.Incidents;
    const t = pageText(env, 'cosmopedia://incidents');
    const has = (s) => assert.ok(t.includes(s), `incidents article says "${s}"`);
    has(`At most ${I.MAX_OPEN} are open`);
    has(`escalates after ${I.ESCALATE_AFTER[3] / 60} minutes`);
    has(`escalates after ${I.ESCALATE_AFTER[2] / 60} minutes`);
    has(`backup choir at ${pct(I.OUTAGE_SCALE)}`);
    has(`contained after ${I.OUTAGE_CONTAINED_AFTER / 60} minutes`);
    has(`${I.LABOUR_CHARGE[3]} / ${I.LABOUR_CHARGE[2]} / ${I.LABOUR_CHARGE[1]} Overclock charge`);
    has(`${I.LABOUR_HITS[3]} / ${I.LABOUR_HITS[2]} / ${I.LABOUR_HITS[1]} hits`);
    has(`${I.COST[3][2]}, ${I.COST[2][2]} or ${I.COST[1][2]} seconds`);
    has(`About ${pct(I.FALSE_ALARM_CHANCE)} of tickets are false alarms`);
    has(`after ${I.PROPHET_SECONDS / 60} minutes`);
    has(`first ${I.QUIET_SECONDS / 60} minutes of attended play`);
    has(`${pct(I.SPAWN_CHANCE.stable)} on Stable, ${pct(I.SPAWN_CHANCE.beta)} on Beta, ${pct(I.SPAWN_CHANCE.nightly)} on Nightly`);
    has(`adds ${pct(I.ISSUE_PRESSURE)} of that again`);
    has(`at least ${I.SPAWN_GAP} seconds apart`);
    has(`After ${I.PRESENCE_SECONDS / 60} minutes without input`);
    has(`at least ${I.RETURN_GRACE} seconds on every clock`);
});

test('Cosmopedia: Reality Builds numbers are Economy, RealityChannels and Reality', () => {
    const env = fresh();
    const { Economy: Ec, RealityChannels: RC, Reality: R } = env;
    const t = pageText(env, 'cosmopedia://reality-builds');
    const has = (s) => assert.ok(t.includes(s), `reality article says "${s}"`);
    for (const c of Object.values(RC)) has(`×${c.divinity}`);
    has(`Beta reboot ${R.channelsFor(2).includes('beta') ? 2 : 3}`);
    assert.equal(R.channelsFor(2).includes('beta'), false, 'fixture check: Beta opens at 3');
    has('Nightly reboot 8');
    has(`Archived reboot ${R.ARCHIVE_UNLOCK}`);
    has(`${Ec.instabilityPerWeightHour} per hour per unit of weight`);
    has(`gives back ${Ec.instabilityReliefPerWeight} per unit`);
    has(`settles by ${Ec.instabilityRecoveryPerHour} an hour`);
    for (const tier of Ec.cascadeTiers) has(`${tier.label} ${tier.at} ${pct(tier.output)} ${pct(tier.award)}`);
    has(`kept at ${pct(Ec.scarResidue)} of their strength`);
    has(`There are ${R.issueIds().size} distinct known issues`);
    has(`opens on v${R.OPENING_BUILD.version}`);
});

test('Cosmopedia: certification, storage, reboot, automatons, Void and Patience match the code', () => {
    const env = fresh();
    const { Economy: Ec, AutomatonSpecs: A, PatienceLedger: P, PatienceRules: PR } = env;
    env.State.unlockedApps.push('adorationshop');
    env.State.dimensions.void.unlocked = true;
    const t = (u) => pageText(env, u);
    const has = (u, s) => assert.ok(t(u).includes(s), `${u} says "${s}"`);
    has('cosmopedia://certification', `keeps ${pct(Ec.certificationResidue)} of what you bought`);
    const vault = env.RepeatableList.find((r) => r.id === 'praise_vault');
    has('cosmopedia://storage', `priced at ${pct(vault.costFraction)} of the vault they extend`);
    has('cosmopedia://storage', `starts at +${vault.capacityStep.toLocaleString('en-US')}`);
    has('cosmopedia://storage', `A fresh Praise vault holds ${env.PRISTINE.resourceCaps.praise.toLocaleString('en-US')}`);
    has('cosmopedia://storage', `for ${Ec.offlineBaseHours} hours, plus ${Ec.offlineHoursPerCapacitor} hours per rank`);
    has('cosmopedia://storage', `up to ${Ec.offlineMaxHours} hours`);
    has('cosmopedia://divine-reboot', `reach ${Ec.prestigeSoulsPerPoint.toLocaleString('en-US')} × (1 + Divinity banked)^${Ec.prestigeThresholdGrowth}`);
    has('cosmopedia://divine-reboot', `(run Souls ÷ bar)^${Ec.prestigeExponent}`);
    has('cosmopedia://divine-reboot', `that is ${Math.round(env.game.getPrestigeThreshold()).toLocaleString('en-US')} Souls`);
    has('cosmopedia://divine-reboot', `+${pct(Ec.doctrineBonusEach)} production per rank`);
    has('cosmopedia://automatons', `sings ${A.seraph.ratePerUnit} Praise a second`);
    has('cosmopedia://automatons', `burns ${Ec.thronePraiseDraw} Praise a second into ${Ec.throneOfferingYield} Offerings`);
    has('cosmopedia://automatons', `by ${pct(Ec.dominionBonusEach)} each`);
    has('cosmopedia://void', `costs ${env.UpgradeList.find((u) => u.id === 'void_unlock').cost.souls.toLocaleString('en-US')} Souls`);
    has('cosmopedia://void', `by ${pct(Ec.nemesisBonusEach)} each`);
    has('cosmopedia://void', `burns ${Ec.revenantDarknessDraw} Darkness a second into ${Ec.revenantShadowYield} Shadows`);
    has('cosmopedia://void', `+${pct(Ec.nullDoctrineBonusEach)} per rank, the first costing ${Ec.nullDoctrineBaseCost.toLocaleString('en-US')} Echoes`);
    const item = env.ShopItemList.find((i) => i.id === 'minigame_solitaire');
    has('cosmopedia://patience', `for ${item.cost} Adoration`);
    has('cosmopedia://patience', `${PR.COLUMNS} columns, ${PR.DEPTH} cards deep`);
    has('cosmopedia://patience', `with ${P.PAR} or fewer cards left`);
    has('cosmopedia://patience', `${P.ADORATION_PER_CARD} Adoration and ${P.CHARGE_PER_CARD} Overclock charge per card`);
    has('cosmopedia://patience', `+${P.CLEAR_ADORATION} Adoration and +${P.CLEAR_CHARGE} charge`);
    has('cosmopedia://patience', `first ${P.FREE_ROUNDS} rounds pay in full`);
    has('cosmopedia://patience', `×${P.DECAY} of the one before, never below ${pct(P.FLOOR)}`);
    has('cosmopedia://patience', `${pct(P.MULLIGAN_FRACTION.undo)} of your Praise vault`);
    has('cosmopedia://patience', `reshuffle the stock for ${pct(P.MULLIGAN_FRACTION.reshuffle)}`);
    // The Patience rules claim: no wrap. Prove it against the rules engine.
    assert.match(t('cosmopedia://patience'), /A King does not reach an Ace/);
    const state = PR.deal(1);
    state.waste = [12];                 // a King on the waste
    state.tableau[0] = [0];             // an Ace exposed
    assert.equal(PR.isLegalPlay(state, 0), false, 'no wrap, as the article says');
});

test('Cosmopedia: Sector 7G and the Archived channel match the code, and keep his name until contact', () => {
    const env = fresh();
    const { Reality: R } = env;
    const op = R.OPENING_BUILD.entries[0];
    const t = pageText(env, 'cosmopedia://sector-7g');
    assert.ok(t.includes(op.note), 'the opening issue, verbatim');
    assert.ok(t.includes(`at SEV-${op.severity}`));
    assert.ok(t.includes(`Praise vault at ${pct(op.mods[0].value)} of capacity`));
    assert.ok(t.includes(`Patching it costs ${pct(op.patchCost.scale)} of your Praise capacity`));
    assert.ok(t.includes(vm.runInContext('IncidentSectors.join(", ")', env.ctx)), 'the sectors tickets name');
    assert.equal(env.game.instabilityRatePerHour(), 0, 'fixture check: the opening build never accrues, as the article says');
    const a = pageText(env, 'cosmopedia://archived-channel');
    assert.ok(a.includes(`From reboot ${R.ARCHIVE_UNLOCK}`));
    assert.ok(a.includes(`keeps the last ${R.HISTORY_CAP} builds`));
    assert.doesNotMatch(a, /NULL[.]OPERATOR/, 'no spoiler before contact');
    env.State.adversary.contacted = true;
    assert.match(pageText(env, 'cosmopedia://archived-channel'), /NULL[.]OPERATOR's annotations/);
});

test('Cosmopedia reads constants at render time: change one, the article changes', () => {
    const env = fresh();
    vm.runInContext('Incidents.OUTAGE_SCALE = 0.4; Economy.certificationResidue = 0.2;', env.ctx);
    assert.ok(pageText(env, 'cosmopedia://incidents').includes('backup choir at 40%'));
    assert.ok(pageText(env, 'cosmopedia://certification').includes('keeps 20% of what you bought'));
});

/* ═════════════════════════════ Read-only ═════════════════════════════ */

test('Etherscape never writes the economy: render everything, compare', () => {
    const env = lateGame();
    const { State, Modifiers, game } = env;
    const econ = () => JSON.stringify({
        resources: State.resources, caps: State.resourceCaps, automatons: State.automatons,
        reality: State.reality, prestige: [State.prestigeLevel, State.totalDivinityPoints],
        void: State.dimensions.void, mods: Modifiers.serialize(), rates: game.getProductionRates(1e12, false),
        incidents: State.incidents, adversary: State.adversary, endings: State.endings, apps: State.unlockedApps,
    });
    const before = econ();
    for (let i = 0; i < 2; i++) {
        for (const url of env.Etherscape.known()) env.Etherscape.resolvePage(url);
        env.Etherscape.knows('null://');
        env.Etherscape.reachable();
        env.Etherscape.observe();
    }
    assert.equal(econ(), before);
});

/* ═════════════════════════════ Escaping ═════════════════════════════ */

test('a forged build note cannot inject markup or links', () => {
    const env = fresh();
    env.State.automatons.seraphCount = 1;
    env.State.reality.build.entries[0].note = '<img src=x onerror=alert(1)> [[null://|click]] **x** @clip evil';
    for (const url of ['sector://7g/status', 'cms://releases', 'news://celestial-times']) {
        const html = env.Etherscape.resolvePage(url).html;
        assert.doesNotMatch(html, /<img/, `${url}: no raw tag`);
        assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, `${url}: shown as text`);
        assert.doesNotMatch(html, /data-href="null:|es-dead[^>]*>click|>click<\/a>/, `${url}: no link`);
        assert.doesNotMatch(html, /data-clip="evil"/, `${url}: no slot`);
    }
});

test('the renderer: headings, lists, tables, quotes and the three link states', () => {
    const env = fresh();
    const L = env.EtherscapeLogic;
    const link = (href) => ({ 'a://ok': { state: 'ok', url: 'a://ok', title: 'OK', visited: true },
        'a://dead': { state: 'dead', url: 'a://dead', hint: 'why "not"' } }[href] || { state: 'missing', url: href });
    const html = L.render('= H\n== I\n- one [[a://ok]]\n- two [[a://dead|D]]\n|! x | y\n| 1 | **2**\n> q\npara [[a://zz|Z]] ``code`` \'\'em\'\'', { link });
    assert.match(html, /<h1>H<\/h1>/);
    assert.match(html, /<h2>I<\/h2>/);
    assert.match(html, /<ul><li>one <a class="es-link is-visited" href="#" data-href="a:\/\/ok">OK<\/a><\/li>/);
    assert.match(html, /<span class="es-dead"[^>]*title="why &quot;not&quot;"[^>]*>D<\/span>/);
    assert.match(html, /<th scope="col">x<\/th>/);
    assert.match(html, /<td><b>2<\/b><\/td>/);
    assert.match(html, /<blockquote><p>q<\/p><\/blockquote>/);
    assert.match(html, /data-href="a:\/\/zz">Z<\/a>/, 'a missing page is still a link (to the 404)');
    assert.match(html, /<i>em<\/i>/);
    assert.doesNotMatch(L.render('@clip ../../etc'), /data-clip/, 'slot slugs are validated');
    // Every text run is escaped, before, between and after the inline marks.
    const mixed = L.render('<i>a</i> **<b>** [[a://ok|<u>]] <s>z</s>', { link });
    assert.doesNotMatch(mixed, /<i>a|<b><\/b>|<u>|<s>/);
    assert.match(mixed, /&lt;i&gt;a&lt;\/i&gt; <b>&lt;b&gt;<\/b>/);
});

/* ═════════════════════════════ Persistence ═════════════════════════════ */

test('a fresh save gains the schema defaults (no SAVE_VERSION bump)', () => {
    const env = fresh();
    const st = env.Etherscape.store();
    assert.deepEqual(plain(st.bookmarks), ['cms://intranet', 'news://celestial-times', 'cosmopedia://']);
    assert.deepEqual(plain(st.visited), []);
    assert.equal(st.guestbookSigned, false);
    assert.ok(Number.isInteger(st.counterSeed) && st.counterSeed >= 1, 'the counter seed is rolled once');
    const seed = st.counterSeed;
    assert.equal(env.Etherscape.store().counterSeed, seed, 'and kept');
    assert.equal(env.State.SAVE_VERSION, 6);
});

test('a save written before Etherscape existed loads with the defaults', () => {
    const a = fresh();
    a.State.save();
    const raw = JSON.parse(a.store.cosmos_save);
    delete raw.etherscape;
    const b = boot({ cosmos_save: JSON.stringify(raw) });
    assert.deepEqual(plain(b.Etherscape.store().bookmarks), ['cms://intranet', 'news://celestial-times', 'cosmopedia://']);
});

test('hostile saves: wrong shapes are repaired, never trusted, never thrown on', () => {
    const shapes = [
        'a string', 42, null, [], [1, 2],
        { bookmarks: 'cms://intranet', visited: { a: 1 }, history: 7, unlocked: 'null://', guestbookSigned: 'yes',
          counterSeed: '7', counterHits: -3 },
        { bookmarks: ['cms://intranet', 'CMS://INTRANET', 'cms://intranet', 'javascript:alert(1)', '__proto__', { x: 1 }, 'cms://nope'],
          visited: ['null://', 'null://', 5], history: Array.from({ length: 10000 }, () => 'cms://intranet'),
          unlocked: ['void://forum', 'evil://x'], guestbookSigned: 1, counterSeed: 1e20, counterHits: 1.5 },
        { counterSeed: NaN, counterHits: Infinity, guestbookSigned: true, constructor: 'x' },
    ];
    for (const shape of shapes) {
        const env = fresh();
        env.State.etherscape = shape;
        const st = env.Etherscape.store();
        assert.ok(Array.isArray(st.bookmarks) && Array.isArray(st.visited) && Array.isArray(st.history) && Array.isArray(st.unlocked));
        const known = new Set(env.Etherscape.known());
        for (const list of [st.bookmarks, st.visited, st.history, st.unlocked]) {
            for (const u of list) assert.ok(known.has(u), `only known URLs survive (${u})`);
            assert.equal(new Set(list).size, list.length, 'no duplicates');
        }
        assert.equal(typeof st.guestbookSigned, 'boolean');
        assert.ok(Number.isInteger(st.counterSeed) && st.counterSeed >= 1 && st.counterSeed <= 999999);
        assert.ok(Number.isInteger(st.counterHits) && st.counterHits >= 0);
        assert.ok(st.history.length <= env.EtherscapeLogic.HISTORY_CAP);
        env.State.automatons.seraphCount = 1;
        for (const url of env.Etherscape.known()) env.Etherscape.resolvePage(url);
    }
    const env = fresh();
    env.State.etherscape = shapes[6];
    const st = env.Etherscape.store();
    assert.deepEqual(plain(st.bookmarks), ['cms://intranet']);
    assert.equal(st.guestbookSigned, false, '1 is not true');
    assert.deepEqual(plain(st.unlocked), ['void://forum'], 'a forged unlock of a real page is a save edit, and harmless');
});

test('hostile game state renders thinner pages, never throws', () => {
    const env = fresh();
    const { State } = env;
    State.automatons.seraphCount = 1;
    State.reality.history = 'nope';
    State.reality.scars = [{}, 'iss_vault_corrupt', 'evil'];
    State.reality.build = { version: '<b>', entries: [null, 5, { id: 'x', kind: 'evil', note: 7 }] };
    State.adversary = 'x';
    State.endings = { history: [{ ending: 'nope' }, 3] };
    State.incidents = { open: 'x' };
    State.casino = null;
    State.documents = 4;
    State.settings.media = 'tapes';
    State.unlockedApps = ['etherscape', 7, null];
    for (const url of env.Etherscape.known()) {
        const page = env.Etherscape.resolvePage(url);
        assert.ok(page.html.length > 0, url);
    }
    const t = pageText(env, 'sector://7g/status');
    assert.match(t, /v<b>/, 'the forged version is shown as text');
});

test('history: most recent first, each page once, capped; the back stack is capped too', () => {
    const env = fresh();
    const L = env.EtherscapeLogic;
    const urls = env.Etherscape.known();
    let list = [];
    for (let i = 0; i < 300; i++) list = L.pushHistory(list, urls[i % urls.length]);
    assert.ok(list.length <= L.HISTORY_CAP);
    assert.equal(list[0], urls[299 % urls.length]);
    assert.equal(new Set(list).size, list.length);
    let hist = [];
    for (let i = 0; i < 120; i++) hist.push(`x://${i}`);
    list = [];
    for (const u of hist) list = L.pushHistory(list, u);
    assert.equal(list.length, L.HISTORY_CAP);
    assert.equal(list[0], 'x://119');
    assert.equal(list[L.HISTORY_CAP - 1], `x://${120 - L.HISTORY_CAP}`);
    let s = { stack: [], index: -1 };
    for (let i = 0; i < 200; i++) s = L.stackPush(s.stack, s.index, `x://${i}`);
    assert.equal(s.stack.length, L.STACK_CAP);
    assert.equal(s.index, L.STACK_CAP - 1);
    assert.equal(s.stack[s.index], 'x://199');
    // Visiting from the middle drops the forward half.
    const mid = L.stackPush(s.stack, 10, 'y://new');
    assert.equal(mid.stack.length, 12);
    assert.equal(mid.stack[11], 'y://new');
    // Reloading the same page does not stack it twice.
    assert.equal(L.stackPush(['a://1'], 0, 'a://1').stack.length, 1);
});

test('normalise caps the loaded history even when the registry outgrows it', () => {
    const L = fresh().EtherscapeLogic;
    const many = Array.from({ length: 200 }, (_, i) => `x://${i}`);
    const st = L.normalise({ history: many, bookmarks: many, visited: many }, new Set(many));
    assert.equal(st.history.length, L.HISTORY_CAP);
    assert.deepEqual(plain(st.history), many.slice(0, L.HISTORY_CAP), 'most recent (first) kept');
    assert.equal(st.bookmarks.length, L.BOOKMARK_CAP);
    assert.equal(st.visited.length, 200, 'visited is bounded by the registry itself');
});

test('canonical addresses', () => {
    const L = fresh().EtherscapeLogic;
    assert.equal(L.canonical(' CMS://Intranet/ '), 'cms://intranet');
    assert.equal(L.canonical('null:'), 'null://');
    assert.equal(L.canonical('null:///'), 'null://');
    assert.equal(L.canonical('cosmopedia:incidents'), 'cosmopedia://incidents');
    assert.equal(L.canonical('sector://7g/status/'), 'sector://7g/status');
    assert.equal(L.canonical('x'.repeat(500)), '');
    assert.equal(L.canonical(7), '');
});

test('the visitor counter is stable for a seed and counts hits', () => {
    const L = fresh().EtherscapeLogic;
    assert.equal(L.counterValue({ counterSeed: 4242, counterHits: 0 }), L.counterValue({ counterSeed: 4242, counterHits: 0 }));
    assert.equal(L.counterValue({ counterSeed: 4242, counterHits: 5 }) - L.counterValue({ counterSeed: 4242, counterHits: 0 }), 5);
});

test('media slots: every slug is valid and documented in the visual plan', () => {
    const env = fresh();
    const slots = env.EtherscapeSites.mediaSlots();
    assert.ok(slots.length >= 6, `${slots.length} slots`);
    const plan = readFileSync(resolve(ROOT, 'docs/VISUAL_UPGRADE_PLAN.md'), 'utf8');
    for (const { kind, slug } of slots) {
        assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        const file = kind === 'clip' ? `web__${slug}__720` : `assets/web/${slug}.webp`;
        assert.ok(plan.includes(file), `${file} is in docs/VISUAL_UPGRADE_PLAN.md`);
    }
});

console.log('\nEtherscape\n');
let passed = 0;
let failed = 0;
for (const { name, fn } of tests) {
    try {
        await fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (err) {
        failed++;
        console.log(`  FAIL  ${name}\n        ${String(err.stack || err.message).split('\n').slice(0, 6).join('\n        ')}`);
    }
}
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
