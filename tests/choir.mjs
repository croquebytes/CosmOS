#!/usr/bin/env node
/**
 * Choir — the status board that reacts to what the Operator did.
 *
 *   node tests/choir.mjs
 *
 * What matters, in order:
 *   1. Every event type produces its posts FROM A REAL FIXTURE: a real ship
 *      (performPrestige), a real cascade (syncCascade over real instability),
 *      a real SEV-1 (Incidents.file), a real patch (patchKnownIssue), a real
 *      Patience clear (PatienceApp moves), the real Mirror Login and ending
 *      resolvers, a real Archived replay. Each post says something specific
 *      about its event: the version, the quoted changelog line, the ticket.
 *   2. The feed is a pure function of the save: a reload reads identically.
 *   3. Absence: events are recorded while away and nothing is posted until
 *      the player is back.
 *   4. The cap, blessing, the canned status and the standing cooldown.
 *   5. Hostile saves, the content tables, and the Etherscape seam.
 *   6. Choir never writes an economy field.
 *
 * Fixtures are stated in reboot bars (getPrestigeThreshold() * n over
 * runSoulsBaseline), and every ship asserts that the reboot happened.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/incidents.js', 'js/solitaire.js', 'js/game.js', 'js/choir.js']
    .map((f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') }));
const SEED = 20261001;

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* js/ui.js is not loaded (it needs a live DOM). `ui` is a recorder whose
   escapeHtml is the real one, verbatim, because Choir must route through it. */
function boot(store = {}, { etherscape } = {}) {
    const calls = {};
    const uiTarget = { escapeHtml };
    const globals = {
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
        // No createElement: Choir's page watch and ChoirView stay inert.
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    };
    if (etherscape) globals.Etherscape = etherscape;
    const ctx = vm.createContext(globals);
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(
        '({ State, game, Reality, RealityPool, Incidents, IncidentTemplates, PatienceRules, PatienceApp, AchievementList,' +
        '   Choir, ChoirPersonas, ChoirContent, ChoirKinds, ChoirStatuses, ChoirLinkRoots, Economy })', ctx);
    env.store = store;
    env.calls = calls;
    return env;
}

function fresh(opts) {
    const env = boot({}, opts);
    env.State.reality = {
        runSeed: SEED, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    return env;
}

function reload(env, opts) {
    const next = boot(env.store, opts);
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

const posts = (env) => env.State.choir.posts;
const ofKind = (env, k) => posts(env).filter((p) => p.k === k);
const viewOf = (env, id, now) => env.Choir.view(posts(env).find((p) => p.id === id), now);
const noteOf = (env, id) => env.Choir.entryById(id).note;
// Values from the vm realm: compare through JSON.
const same = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

let passed = 0;
const failures = [];
function check(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (err) {
        failures.push(name);
        console.log(`  FAIL  ${name}\n        ${String(err && err.message || err).split('\n').join('\n        ')}`);
    }
}

/* ── Unlock and the first ship ─────────────────────────────────────────── */

check('locked before the first reboot: nothing is posted and nothing is queued', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    env.game.unlockAchievement('ACH-001');
    env.Choir.observe(Date.now());
    assert.equal(posts(env).length, 0);
    assert.equal(env.State.choir.pending.length, 0);
    assert.ok(!env.State.unlockedApps.includes('choir'), 'the app waits for the first reboot');
});

check('the first real ship unlocks the app; the news desk posts the version and channel', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    env.game.unlockAchievement('ACH-S-001'); // earned while the board was closed
    env.Choir.observe(Date.now());
    ship(env);
    const now = Date.now();
    env.Choir.observe(now);
    assert.ok(env.State.unlockedApps.includes('choir'), 'unlocked after reboot 1');
    assert.ok(!posts(env).some((p) => p.id === 'ach:ACH-S-001'), 'what happened before the board opened is history');
    assert.equal(env.calls.updateDesktopIcons, 1, 'the desktop is told once');
    assert.equal(posts(env)[0].id, 'welcome', 'the welcome is the oldest post');
    const news = ofKind(env, 'ship.news');
    assert.equal(news.length, 1);
    const build = env.State.reality.build;
    const v = env.Choir.view(news[0], now);
    assert.equal(v.persona, 'times');
    assert.ok(v.text.includes(`v${build.version}`), `version in "${v.text}"`);
    assert.ok(v.text.includes('Stable'), 'channel label in the post');
    assert.ok(v.text.includes(String(build.entries.length)), 'entry count in the post');
});

check('mortals quote real changelog lines from the build that shipped, escaped', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    const now = Date.now();
    env.Choir.observe(now);
    const reactions = posts(env).filter((p) => p.k.startsWith('ship.react.'));
    assert.ok(reactions.length >= 2, 'an improvement and an issue at least');
    const ids = env.State.reality.build.entries.map((e) => e.id);
    for (const p of reactions) {
        assert.ok(ids.includes(p.x.e), `${p.x.e} is in the live build`);
        const v = env.Choir.view(p, now);
        const note = noteOf(env, p.x.e);
        assert.ok(v.text.includes(`“${note}”`), `quotes "${note}" in "${v.text}"`);
        assert.ok(v.html.includes(escapeHtml(note)), 'the note reaches the html escaped');
        const kind = env.State.reality.build.entries.find((e) => e.id === p.x.e).kind;
        assert.equal(p.k, `ship.react.${kind}`, 'the reaction pool matches the entry kind');
    }
});

check('a ship that left an issue unpatched gets called out, quoting that issue', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const unpatched = env.game.patchKnownIssue ? env.State.reality.build.entries.filter((e) => e.kind === 'issue').map((e) => e.id) : [];
    assert.ok(unpatched.length, 'fixture check: the build carries a known issue');
    ship(env);
    const now = Date.now();
    env.Choir.observe(now);
    const record = env.State.reality.history.find((r) => r.reboot === 1);
    assert.ok(record.unpatched.length, 'fixture check: it shipped dirty');
    // Reboot 1 already called out the opening build's Sector 7G; this is reboot 2's.
    const dirty = ofKind(env, 'ship.dirty').filter((p) => p.r === 2);
    assert.equal(dirty.length, 1);
    assert.ok(record.unpatched.includes(dirty[0].x.e));
    assert.ok(env.Choir.view(dirty[0], now).text.includes(noteOf(env, dirty[0].x.e)));
});

check('the certification path and newly cleared channels get their posts', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    for (let i = 0; i < 3; i++) { ship(env, { certifyOn: 'maintenance' }); env.Choir.observe(Date.now()); }
    const cert = ofKind(env, 'ship.cert');
    assert.equal(cert.length, 3, 'one per ship');
    assert.ok(env.Choir.view(cert[2], Date.now()).text.includes('Maintenance'));
    const unlock = ofKind(env, 'ship.unlock');
    assert.equal(unlock.length, 1, 'Beta clears at reboot 3, and only then');
    assert.equal(unlock[0].x.ch, 'beta');
    assert.ok(env.Choir.view(unlock[0], Date.now()).text.includes('Beta'));
});

check('several reboots in one pass post the last three, not a backlog', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    for (let i = 0; i < 6; i++) ship(env);
    env.Choir.observe(Date.now());
    const news = ofKind(env, 'ship.news').map((p) => p.r);
    same(news, [4, 5, 6]);
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'ship.news').length, 3, 'nothing re-posted on the next pass');
});

/* ── Cascades, outages, patches, Patience ──────────────────────────────── */

check('a real cascade posts once per tier per run, naming the tier', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    env.State.reality.instability = 1.6;
    env.game.syncCascade(Date.now());
    assert.equal(env.State.reality.cascadeTier, 2, 'fixture check: SEV-1 OUTAGE');
    const now = Date.now();
    env.Choir.observe(now);
    env.Choir.observe(now + 1000);
    const status = ofKind(env, 'cascade.status');
    assert.equal(status.length, 1, 'once, not every second');
    assert.equal(status[0].x.t, 2);
    assert.ok(env.Choir.view(status[0], now).text.includes(env.Economy.cascadeTiers[1].label));
    assert.equal(ofKind(env, 'cascade.react').length, 1);
    // Down and up again within the run: no repeat. Next run: a fresh tier.
    env.State.reality.instability = 0; env.game.syncCascade(Date.now()); env.Choir.observe(Date.now());
    env.State.reality.instability = 1.6; env.game.syncCascade(Date.now()); env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'cascade.status').length, 1, 'the same tier in the same run is not news');
    env.State.reality.instability = 2.1; env.game.syncCascade(Date.now()); env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'cascade.status').length, 2, 'a deeper tier is');
    ship(env);
    env.Choir.observe(Date.now());
    env.State.reality.instability = 1.1; env.game.syncCascade(Date.now()); env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'cascade.status').length, 3, 'a new run starts the count again');
});

check('a SEV-1 outage gets its line\'s fans complaining, with the ticket number', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const tpl = env.IncidentTemplates.find((t) => t.line === 'seraph');
    const inc = env.Incidents.file(tpl.id, { severity: 1, falseAlarm: false, sector: '3A' });
    assert.ok(inc && inc.severity === 1, 'fixture check: an outage was filed');
    const now = Date.now();
    env.Choir.observe(now);
    env.Choir.observe(now + 1000);
    const out = ofKind(env, 'outage');
    assert.equal(out.length, 1, 'once per ticket');
    assert.equal(out[0].x.line, 'seraph');
    const v = env.Choir.view(out[0], now);
    assert.ok(['fanclub', 'vesper'].includes(v.persona), 'a Seraph-line voice');
    assert.ok(v.text.includes(inc.id), `ticket ${inc.id} in "${v.text}"`);
    // A SEV-3 is not an outage.
    env.Incidents.file(env.IncidentTemplates.find((t) => t.line === 'throne').id, { severity: 3, falseAlarm: false });
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'outage').length, 1);
});

check('an outage reached by escalation is posted too', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const tpl = env.IncidentTemplates.find((t) => t.line === 'cherub');
    const inc = env.Incidents.file(tpl.id, { severity: 2, falseAlarm: false, sector: '9F' });
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'outage').length, 0, 'fixture check: SEV-2 first');
    for (let t = 0; t < 200 && inc.severity !== 1; t++) env.Incidents.tick(1, Date.now());
    assert.equal(inc.severity, 1, 'fixture check: escalated');
    env.Choir.observe(Date.now());
    const out = ofKind(env, 'outage');
    assert.equal(out.length, 1);
    assert.equal(out[0].x.line, 'cherub');
    assert.equal(out[0].x.s, '9F');
});

check('patching a known issue posts, quoting the line that was removed', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const build = env.State.reality.build;
    const issue = build.entries.find((e) => e.kind === 'issue' && env.Reality.patchCostOf(build, e.id));
    assert.ok(issue, 'fixture check: a patchable issue');
    const cost = env.Reality.patchCostOf(build, issue.id);
    cost.bag[cost.resource] = cost.amount;
    assert.ok(env.game.patchKnownIssue(issue.id), 'fixture check: patched');
    const now = Date.now();
    env.Choir.observe(now);
    env.Choir.observe(now + 1000);
    const patch = ofKind(env, 'patch');
    assert.equal(patch.length, 1);
    assert.equal(patch[0].x.e, issue.id);
    assert.ok(env.Choir.view(patch[0], now).text.includes(issue.note));
});

check('a full Patience clear brings Fate out to brag', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const R = env.PatienceRules;
    let seed = 1;
    let end = null;
    for (; seed < 5000; seed++) {
        let s = R.deal(seed);
        for (let g = 0; g < 60 && !R.isOver(s); g++) {
            const plays = R.legalPlays(s);
            s = plays.length ? R.play(s, plays[0]) : R.draw(s);
        }
        if (R.isWon(s)) { end = s; break; }
    }
    assert.ok(end, 'fixture check: a winnable deal');
    env.PatienceApp.deal(seed, Date.now());
    let result = null;
    for (const m of end.moves) result = env.PatienceApp.act(m, Date.now()).result || result;
    assert.ok(result && result.won, 'fixture check: the spread was cleared');
    env.Choir.observe(Date.now());
    const pat = ofKind(env, 'patience');
    assert.equal(pat.length, 1);
    const v = env.Choir.view(pat[0], Date.now());
    assert.equal(v.persona, 'fate');
    // A lost round is not news.
    env.PatienceApp.deal(seed + 1, Date.now());
    env.PatienceApp.act('d', Date.now());
    env.PatienceApp.settle(Date.now());
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'patience').length, 1);
});

/* ── The adversary: Mirror Login, endings, Archived ────────────────────── */

check('the Mirror Login puts NULL.OPERATOR on the board, posting as you', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    env.game.resolveAdversaryChoice('OP-C');
    env.Choir.observe(Date.now());
    const mirror = ofKind(env, 'mirror.null');
    assert.equal(mirror.length, 1);
    assert.equal(mirror[0].x.c, 'OP-C');
    const v = env.Choir.view(mirror[0], Date.now());
    assert.equal(v.persona, 'nulloperator');
    assert.equal(v.name, env.ChoirPersonas.operator.name, 'his display name is yours');
    assert.notEqual(v.handle, env.ChoirPersonas.operator.handle, 'his handle is not');
    assert.equal(ofKind(env, 'mirror.voice').length, 1);
    assert.equal(env.State.choir.offer.m, 'mirror', 'a status is offered');
    // From now on, ships draw his comment too.
    ship(env);
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'ship.null').length, 1);
});

check('NULL.OPERATOR\'s replies appear only in threads recorded after contact', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const before = posts(env).find((p) => p.id === 'welcome');
    assert.equal(before.c, 0);
    env.game.resolveAdversaryChoice('OP-B');
    for (let i = 0; i < 3; i++) { ship(env); env.Choir.observe(Date.now()); }
    const hasNull = (p) => env.Choir.view(p, Date.now()).replies.some((r) => r.persona === 'nulloperator');
    for (const p of posts(env).filter((q) => q.c === 0)) assert.ok(!hasNull(p), `${p.id} predates him`);
    assert.ok(posts(env).some((p) => p.c === 1), 'later posts carry the flag');
    // Templates that thread him in render without him for a post made before.
    const now = Date.now();
    let threaded = 0;
    for (const [k, x] of [['patience', { w: 2 }], ['ship.unlock', { ch: 'archived' }], ['ship.news', { lv: 2, ch: 'stable', n: 3, q: 1 }]]) {
        for (let i = 0; i < 40; i++) {
            const post = { id: `probe:${i}`, k, r: 2, x, at: now, ep: 0, b: 0 };
            const withHim = env.Choir.view({ ...post, c: 1 }, now);
            if (!withHim.replies.some((r) => r.persona === 'nulloperator')) continue;
            threaded++;
            const before = env.Choir.view({ ...post, c: 0 }, now);
            assert.ok(!before.replies.some((r) => r.persona === 'nulloperator'), `${k} ${post.id}`);
            assert.ok(before.replies.length >= 1 || withHim.replies.length === 1, 'the rest of the thread stays');
        }
    }
    assert.ok(threaded >= 2, 'fixture check: templates that thread him exist and were exercised');
});

check('an ending posts HR\'s notice and the band\'s voice, and offers a status', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.game.resolveAdversaryChoice('OP-B');
    env.Choir.observe(Date.now());
    assert.ok(env.game.resolveEnding('curious'), 'fixture check: the ending resolved');
    env.Choir.observe(Date.now());
    const hr = ofKind(env, 'ending.hr');
    assert.equal(hr.length, 1);
    assert.equal(hr[0].x.band, 'curious');
    assert.ok(env.Choir.view(hr[0], Date.now()).text.includes('Co-Operator'));
    assert.equal(ofKind(env, 'ending.voice').length, 1);
    assert.equal(env.State.choir.offer.m, 'ending');
});

check('a hostile ending patches him out of the board', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    env.game.resolveAdversaryChoice('OP-A');
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'ship.null').length, 1, 'fixture check: he comments while he is on the board');
    env.game.resolveEnding('hostile');
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    assert.equal(ofKind(env, 'ship.null').length, 1, 'no ship comment from a closed account');
    assert.ok(posts(env).slice(-3).every((p) => p.c === 0), 'and no replies from him in new threads');
});

check('an Archived replay is reported as a replay of the original version', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    env.game.resolveAdversaryChoice('OP-B');
    while (env.State.prestigeLevel < 12) { ship(env); env.Choir.observe(Date.now()); }
    assert.ok(env.game.selectArchivedBuild(5), 'fixture check: picked reboot 5');
    ship(env);
    assert.equal(env.State.reality.build.channel, 'archived', 'fixture check: in the replay');
    env.Choir.observe(Date.now());
    const news = ofKind(env, 'replay.news');
    assert.equal(news.length, 1);
    assert.equal(news[0].x.lv, 5, 'the original level, not the current one');
    const v = env.Choir.view(news[0], Date.now());
    assert.ok(v.text.includes(`v${env.Reality.versionFor(5)}`), v.text);
    assert.equal(ofKind(env, 'replay.null').length, 1, 'he has a word');
    assert.equal(env.State.choir.offer.m, 'replay');
    assert.equal(ofKind(env, 'ship.unlock').filter((p) => p.x.ch === 'archived').length, 1, 'Archived cleared at 12');
});

check('achievements are posted, secret ones by the conspiracy cherub', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    env.game.unlockAchievement('ACH-S-001');
    env.game.unlockAchievement('ACH-001');
    env.Choir.observe(Date.now());
    const secret = ofKind(env, 'ach.secret');
    assert.equal(secret.length, 1);
    assert.equal(env.Choir.view(secret[0], Date.now()).persona, 'pip');
    assert.ok(ofKind(env, 'ach').some((p) => p.x.id === 'ACH-001'));
});

/* ── Determinism ───────────────────────────────────────────────────────── */

function busyFeed() {
    const env = fresh();
    env.Choir.observe(Date.now());
    env.game.resolveAdversaryChoice('OP-B');
    for (let i = 0; i < 4; i++) { ship(env); env.Choir.observe(Date.now()); }
    env.State.save();
    return env;
}

check('the same save reads the same feed after a reload', () => {
    const env = busyFeed();
    const now = Date.now() + 60000;
    const a = env.Choir.feed(now).map((v) => [v.id, v.persona, v.text, v.hallelujahs, v.replies.map((r) => r.text)]);
    assert.ok(a.length > 10, 'fixture check: a busy feed');
    const next = reload(env);
    const b = next.Choir.feed(now).map((v) => [v.id, v.persona, v.text, v.hallelujahs, v.replies.map((r) => r.text)]);
    same(b, a);
});

check('text is regenerated, not stored: a content edit reaches an existing save', () => {
    const env = busyFeed();
    const raw = JSON.stringify(JSON.parse(env.store.cosmos_save).choir);
    const note = noteOf(env, ofKind(env, 'ship.react.improvement')[0].x.e);
    assert.ok(!raw.includes(note.slice(0, 20)), 'no changelog text in the save');
    assert.ok(!raw.includes('Celestial Times'), 'no template text in the save');
    const next = reload(env);
    const news = next.State.choir.posts.find((p) => p.k === 'ship.news');
    const pool = next.ChoirContent['ship.news'];
    for (const tpl of pool) tpl.t = `EDITED v{version}`;
    assert.ok(next.Choir.view(news, Date.now()).text.startsWith('EDITED v'), 'the edit shows');
});

check('the seed picks the voices: the same events under another seed read differently', () => {
    const env = busyFeed();
    const now = Date.now();
    const read = () => env.Choir.feed(now).map((v) => `${v.persona}:${v.text}`);
    const a = read();
    env.State.choir.seed = (env.State.choir.seed + 1) >>> 0 || 1;
    const b = read();
    assert.equal(a.length, b.length, 'same posts');
    assert.ok(a.filter((t, i) => t !== b[i]).length >= 3, 'several of them pick another template');
});

check('a save from before Choir wakes to the current build, not a backlog', () => {
    const env = fresh();
    for (let i = 0; i < 5; i++) ship(env);
    env.game.checkAchievements();
    env.State.save();
    const save = JSON.parse(env.store.cosmos_save);
    delete save.choir;
    const store = { cosmos_save: JSON.stringify(save) };
    const old = boot(store);
    old.game.bootstrapModifiers(Date.now());
    old.Choir.observe(Date.now());
    const ps = old.State.choir.posts;
    same(ps.filter((p) => p.k === 'ship.news').map((p) => p.r), [5], 'the current build is the news');
    assert.ok(ps.some((p) => p.id === 'welcome'));
    assert.equal(ps.filter((p) => p.k === 'ach' || p.k === 'ach.secret').length, 0, 'old achievements are history');
});

check('a burst of achievements posts three; the rest are not news later either', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.game.checkAchievements();
    env.Choir.observe(Date.now());
    const before = posts(env).filter((p) => p.k === 'ach' || p.k === 'ach.secret').length;
    for (const id of ['ACH-S-001', 'ACH-S-003', 'ACH-S-004', 'ACH-033', 'ACH-034']) env.game.unlockAchievement(id);
    env.Choir.observe(Date.now());
    env.Choir.observe(Date.now() + 1000);
    const after = posts(env).filter((p) => p.k === 'ach' || p.k === 'ach.secret').length;
    assert.equal(after - before, 3);
});

/* ── Presence ──────────────────────────────────────────────────────────── */

check('away: events are recorded, nothing is posted; back: the backlog goes up', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const t0 = Date.now();
    env.game.presenceTracking = true;
    env.game.lastInputAt = t0 - 10 * 60 * 1000;
    const before = posts(env).length;
    const amb = env.State.choir.amb;
    ship(env);
    env.Incidents.file(env.IncidentTemplates.find((t) => t.line === 'throne').id, { severity: 1, falseAlarm: false });
    for (let i = 0; i < 400; i++) env.Choir.observe(t0 + i * 1000);
    assert.equal(posts(env).length, before, 'nothing posted while away, not even ambient');
    assert.ok(env.State.choir.pending.length >= 3, 'but the events were recorded');
    assert.equal(env.State.choir.amb, amb, 'ambient time does not accrue while away');
    // Saved and reloaded while away: the backlog survives.
    env.State.save();
    const next = reload(env);
    next.game.presenceTracking = true;
    next.game.lastInputAt = 0;
    next.Choir.observe(t0 + 401000);
    assert.equal(next.State.choir.posts.length, before);
    const back = t0 + 402000;
    next.game.notePresence(back);
    const n = next.Choir.observe(back);
    assert.ok(n >= 3, 'the backlog posts on return');
    assert.equal(next.State.choir.pending.length, 0);
    assert.ok(next.State.choir.posts.slice(-n).every((p) => p.at === back), 'stamped at the return');
    assert.ok(next.State.choir.posts.some((p) => p.k === 'outage'));
});

check('ambient posts fill quiet time, rate-limited', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    const t0 = Date.now();
    env.Choir.observe(t0);
    const after = posts(env).length;
    const ambient = () => posts(env).filter((p) => p.k.startsWith('ambient.')).length;
    let t = t0;
    for (let i = 0; i < 120; i++) env.Choir.observe(t += 1000);
    assert.equal(posts(env).length, after, 'not inside two minutes');
    for (let i = 0; i < 130; i++) env.Choir.observe(t += 1000);
    assert.equal(ambient(), 1, 'one ambient post after four quiet minutes');
    for (let i = 0; i < 100; i++) env.Choir.observe(t += 1000);
    assert.equal(ambient(), 1, 'and not another for a while');
    // Big gaps between passes (a throttled tab) count as at most five seconds.
    const amb = env.State.choir.amb;
    env.Choir.observe(t += 3600000);
    assert.ok(env.State.choir.amb - amb <= 5, 'an hour-long gap is five seconds');
    assert.equal(ambient(), 1, 'and posts nothing');
    // Only into a quiet board: a real post resets the quiet clock.
    for (let i = 0; i < 400 && env.State.choir.amb < env.Choir.AMBIENT_SECONDS - 10; i++) env.Choir.observe(t += 1000);
    assert.equal(ambient(), 1, 'fixture check: no ambient post yet');
    env.game.unlockAchievement('ACH-S-001');
    env.Choir.observe(t += 1000);
    for (let i = 0; i < 60; i++) env.Choir.observe(t += 1000);
    assert.ok(env.State.choir.amb >= env.Choir.AMBIENT_SECONDS, 'fixture check: the ambient clock is due');
    assert.equal(ambient(), 1, 'but the board is not quiet');
    for (let i = 0; i < 70; i++) env.Choir.observe(t += 1000);
    assert.equal(ambient(), 2, 'two minutes after the last post, it is');
});

/* ── Cap ───────────────────────────────────────────────────────────────── */

check('the feed is capped; the oldest go first and the newest survive', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const s = env.State.choir;
    const filler = [];
    for (let i = 0; i < 420; i++) filler.push({ id: `amb:${1000 + i}`, k: 'ambient.base', r: 1, x: { i: 1000 + i }, at: 1000 + i, ep: 0, b: 0 });
    s.posts = filler.concat(s.posts);
    env.State.save();
    const next = reload(env);
    next.Choir.observe(Date.now());
    assert.equal(next.State.choir.posts.length, env.Choir.FEED_CAP, 'capped on load');
    assert.equal(next.State.choir.posts[next.State.choir.posts.length - 1].id, s.posts[s.posts.length - 1].id, 'newest kept');
    ship(next);
    next.Choir.observe(Date.now());
    assert.equal(next.State.choir.posts.length, env.Choir.FEED_CAP, 'capped on post');
    assert.ok(next.State.choir.posts.some((p) => p.id === 'ship:2/news'), 'the new ship is in');
});

/* ── Blessing ──────────────────────────────────────────────────────────── */

check('a blessing persists across reload, adds one Hallelujah, and cannot be farmed', () => {
    const env = busyFeed();
    const target = ofKind(env, 'ship.news')[0];
    const now = Date.now() + 5000;
    const before = env.Choir.view(target, now).hallelujahs;
    assert.ok(env.Choir.bless(target.id));
    assert.equal(env.Choir.view(target, now).hallelujahs, before + 1);
    assert.equal(env.State.choir.blessings, 1);
    env.game.checkAchievements(); // the 1 Hz check in tick()
    assert.ok(env.State.achievements['ACH-042'], 'Hallelujah unlocked');
    env.State.save();
    const next = reload(env);
    const again = () => next.Choir.view(next.Choir.state().posts.find((p) => p.id === target.id), now);
    assert.equal(again().blessed, true, 'still blessed after reload');
    assert.equal(again().hallelujahs, before + 1);
    next.Choir.bless(target.id);
    assert.equal(again().blessed, false, 'a blessing can be withdrawn');
    assert.equal(again().hallelujahs, before);
    next.Choir.bless(target.id);
    assert.equal(next.State.choir.blessings, 1, 'withdraw and re-bless is not a second blessing');
    assert.equal(next.Choir.bless('no-such-post'), false);
});

check('twenty-five blessings unlock Amen Corner; neither achievement pays anything', () => {
    const env = busyFeed();
    const ids = posts(env).filter((p) => p.k !== 'status').slice(0, 25).map((p) => p.id);
    assert.equal(ids.length, 25, 'fixture check: enough posts');
    for (const id of ids) env.Choir.bless(id);
    env.game.checkAchievements();
    assert.ok(env.State.achievements['ACH-043']);
    for (const id of ['ACH-042', 'ACH-043']) {
        assert.equal(env.AchievementList.find((a) => a.id === id).reward, null, `${id} has no reward`);
    }
});

/* ── Canned status and the standing nudge ──────────────────────────────── */

check('a canned status posts as the Operator and consumes the offer', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    const offer = env.Choir.statusOptions();
    assert.equal(offer.milestone, 'ship');
    assert.equal(offer.options.length, 3);
    assert.ok(offer.options[1].text.includes(env.State.reality.build.version));
    env.Choir.markRead(Date.now());
    assert.ok(env.Choir.postStatus(1, Date.now() + 5000));
    assert.equal(env.Choir.unread(), 0, 'your own post is not unread');
    const st = ofKind(env, 'status');
    assert.equal(st.length, 1);
    const v = env.Choir.view(st[0], Date.now());
    assert.equal(v.persona, 'operator');
    assert.equal(v.player, true);
    assert.equal(v.text, offer.options[1].text);
    assert.equal(env.Choir.statusOptions(), null, 'the offer is spent');
    assert.equal(env.Choir.postStatus(0), false, 'one status per milestone');
    assert.equal(env.Choir.bless(st[0].id), false, 'you cannot bless yourself');
    assert.equal(env.Choir.postStatus(7), false);
});

check('a status nudges standing under nudgeAdversaryStanding\'s own per-reason cooldown', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.game.resolveAdversaryChoice('OP-B');
    env.Choir.observe(Date.now());
    const adv = env.State.adversary;
    assert.equal(adv.standing, 0, 'fixture check: curious');
    assert.ok(env.Choir.postStatus(0), 'mirror status, the hard line');
    assert.equal(adv.standing, -1, 'moved by -1');
    ship(env);
    env.Choir.observe(Date.now());
    const s1 = adv.standing; // the reboot's own -1 is not ours
    assert.ok(env.Choir.postStatus(2));
    assert.equal(adv.standing, s1, 'inside the cooldown: no move');
    ship(env);
    env.Choir.observe(Date.now());
    const s2 = adv.standing;
    adv.nudgeCooldowns[env.Choir.STATUS_REASON] = Date.now() - env.game.ADVERSARY_NUDGE_COOLDOWN_MS - 1;
    assert.ok(env.Choir.postStatus(2));
    assert.equal(adv.standing, s2 + 1, 'after it: +1');
    // The neutral option does not touch the cooldown at all.
    ship(env);
    env.Choir.observe(Date.now());
    adv.nudgeCooldowns[env.Choir.STATUS_REASON] = 5;
    env.Choir.postStatus(1);
    assert.equal(adv.nudgeCooldowns[env.Choir.STATUS_REASON], 5);
});

check('before the Mirror Login a status moves nothing', () => {
    const env = fresh();
    env.Choir.observe(Date.now());
    ship(env);
    env.Choir.observe(Date.now());
    env.Choir.postStatus(0);
    assert.equal(env.State.adversary.standing || 0, 0);
});

/* ── Choir only reads the economy ──────────────────────────────────────── */

check('observing, blessing and posting change no economy field', () => {
    const env = busyFeed();
    env.game.checkAchievements(); // settle what the fixture earned, so only Choir is measured
    const snap = () => JSON.stringify({
        r: env.State.resources, c: env.State.resourceCaps, a: env.State.automatons, d: env.State.totalDivinityPoints,
        p: env.State.prestigeLevel, ad: env.State.adoration, v: env.State.dimensions, i: env.State.incidents,
        rl: { ...env.State.reality, build: env.State.reality.build }, b: env.State.achievementBonuses,
        oc: env.State.loopSystems.overclock, m: env.State.modifierLog?.records?.length,
    });
    const before = snap();
    let t = Date.now();
    for (let i = 0; i < 300; i++) env.Choir.observe(t += 1000);
    for (const p of posts(env).slice(0, 5)) env.Choir.bless(p.id);
    env.Choir.postStatus(1);
    assert.equal(snap(), before);
});

/* ── Hostile saves ─────────────────────────────────────────────────────── */

function hostile(mutate) {
    const env = busyFeed();
    const save = JSON.parse(env.store.cosmos_save);
    mutate(save);
    const store = { cosmos_save: JSON.stringify(save) };
    const next = boot(store);
    next.game.bootstrapModifiers(Date.now());
    return next;
}

check('hostile shapes for the whole container are replaced, never thrown on', () => {
    for (const shape of ['nonsense', 42, null, [], [1, 2], true]) {
        const env = hostile((s) => { s.choir = shape; });
        env.Choir.observe(Date.now());
        assert.ok(Array.isArray(env.State.choir.posts), `shape ${JSON.stringify(shape)}`);
        env.Choir.feed();
    }
});

check('hostile posts are dropped by type and enum, not defaulted', () => {
    const env = hostile((s) => {
        const good = s.choir.posts.find((p) => p.k === 'ship.news');
        s.choir.posts.push(
            { ...good, id: 'x<script>alert(1)</script>' },
            { ...good, id: 'bad:kind', k: 'ship.newz' },
            { ...good, id: 'bad:entry', k: 'patch', x: { lv: 1, e: 'iss_not_a_thing' } },
            { ...good, id: 'bad:tier', k: 'cascade.status', x: { t: 9 } },
            { ...good, id: 'bad:line', k: 'outage', x: { line: 'dragon', s: '7G', n: 3 } },
            { ...good, id: 'bad:sector', k: 'outage', x: { line: 'seraph', s: '<b>', n: 3 } },
            { ...good, id: 'bad:at', at: 'yesterday' },
            { ...good, id: 'bad:neg', at: -5 },
            { ...good, id: 'bad:r', r: 1.5 },
            { ...good, id: 'bad:x', x: 'not an object' },
            { ...good, id: 'bad:ach', k: 'ach', x: { id: 'ACH-999<' } },
            { ...good, id: 'bad:status', k: 'status', x: { m: 'coup', o: 0, lv: 1 } },
            { ...good, id: 'bad:option', k: 'status', x: { m: 'ship', o: 3, lv: 1 } },
            { ...good }, // a duplicate id
            'a string', 7, null,
        );
        s.choir.posts.push({ ...good, id: 'ok:future', at: Date.now() + 9e12, b: 'yes', ep: -3 });
    });
    env.Choir.observe(Date.now());
    const ids = env.State.choir.posts.map((p) => p.id);
    for (const bad of ['bad:kind', 'bad:entry', 'bad:tier', 'bad:line', 'bad:sector', 'bad:at', 'bad:neg', 'bad:r', 'bad:x', 'bad:ach', 'bad:status', 'bad:option']) {
        assert.ok(!ids.includes(bad), `${bad} dropped`);
    }
    assert.ok(!ids.some((id) => id.includes('<')), 'no markup in an id');
    assert.equal(new Set(ids).size, ids.length, 'ids unique');
    const future = env.State.choir.posts.find((p) => p.id === 'ok:future');
    assert.ok(future.at <= Date.now(), 'a future time is clamped to now');
    assert.equal(future.b, 0, 'b by enum');
    assert.equal(future.ep, 0);
    for (const v of env.Choir.feed()) assert.ok(!/<script|<b>/.test(v.html), 'nothing hostile reaches the html');
});

check('hostile watermarks, offers and counters are repaired', () => {
    const env = hostile((s) => {
        s.choir.seed = -4;
        s.choir.wm = { init: 'yes', reboot: 'nine', cascade: [1], out: ['INC-1', 3, 3, -1], patch: { r: 1, ids: ['iss_conduit_leak', 'nope', 5] },
            wins: 1e99, mirror: 1, end: -1, ach: ['ACH-001', 'ACH-<x>', 4] };
        s.choir.offer = { e: 'ship:1', m: 'coup', lv: 1 };
        s.choir.blessings = '100';
        s.choir.lastReadAt = 'never';
        s.choir.amb = 1e9;
        s.choir.ambN = -2;
        s.choir.pending = [{ id: 'pend:1', k: 'ship.news', x: { lv: 1, ch: 'stable', n: 3, q: 1 }, r: 1 }, { id: 'pend:2', k: 'nope', x: {}, r: 1 }];
    });
    const s = env.Choir.state();
    assert.ok(s.seed >= 0 && Number.isInteger(s.seed));
    assert.equal(s.wm.init, false);
    assert.equal(s.wm.reboot, 0);
    same(s.wm.cascade, { r: 0, t: 0 });
    same(s.wm.out, [3]);
    same(s.wm.patch.ids, ['iss_conduit_leak']);
    assert.equal(s.wm.wins, 0);
    assert.equal(s.wm.mirror, false);
    assert.equal(s.wm.end, 0);
    same(s.wm.ach, ['ACH-001']);
    assert.equal(s.offer, null);
    assert.equal(s.blessings, 0, 'a string count is not a count');
    assert.ok(!env.State.achievements['ACH-043'] || env.State.achievements['ACH-043'] === undefined);
    assert.equal(s.lastReadAt, 0);
    assert.equal(s.amb, env.Choir.AMBIENT_SECONDS);
    assert.equal(s.ambN, 0);
    same(s.pending.map((p) => p.id), ['pend:1']);
    env.Choir.observe(Date.now()); // and it runs
});

check('an offer that was already answered does not come back on load', () => {
    const env = hostile((s) => {
        s.choir.offer = { e: 'ship:4', m: 'ship', lv: 4 };
        s.choir.posts.push({ id: 'st:ship:4', k: 'status', r: 4, x: { m: 'ship', o: 1, lv: 4 }, at: 1, ep: 0, b: 0, c: 0 });
    });
    assert.equal(env.Choir.statusOptions(), null);
});

check('a string blessings count cannot unlock the achievements before normalisation', () => {
    const env = hostile((s) => { s.choir.blessings = '100'; });
    // checkAchievements can run before Choir has read the save.
    env.game.checkAchievements();
    assert.ok(!env.State.achievements['ACH-042']);
    assert.ok(!env.State.achievements['ACH-043']);
});

/* ── Content integrity ─────────────────────────────────────────────────── */

check('content tables: personas exist, variables are known, links stay in the namespace', () => {
    const env = boot({});
    const { ChoirContent, ChoirKinds, ChoirPersonas, ChoirStatuses, ChoirLinkRoots, Choir } = env;
    const linkRe = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
    const checkText = (where, text, vars) => {
        for (const name of Choir.varsIn(text)) assert.ok(vars.includes(name), `${where}: unknown variable {${name}}`);
        for (const m of text.matchAll(linkRe)) {
            assert.ok(ChoirLinkRoots.some((r) => m[1].startsWith(r)), `${where}: link outside the namespace: ${m[1]}`);
        }
        assert.ok(!/[<>]/.test(text.replace(linkRe, '')), `${where}: markup in content`);
        assert.ok(!/\[\[|\]\]/.test(text.replace(linkRe, '')), `${where}: a malformed link`);
    };
    for (const [kind, pool] of Object.entries(ChoirContent)) {
        assert.ok(ChoirKinds[kind], `pool ${kind} has a kind`);
        assert.ok(pool.length >= 1, `pool ${kind} is not empty`);
        for (const [i, tpl] of pool.entries()) {
            const where = `${kind}[${i}]`;
            assert.ok(ChoirPersonas[tpl.p], `${where}: persona ${tpl.p}`);
            assert.ok(!ChoirPersonas[tpl.p].player, `${where}: the Operator only posts canned statuses`);
            checkText(where, tpl.t, ChoirKinds[kind].vars);
            for (const key of Object.keys(tpl.when || {})) assert.ok(key in ChoirKinds[kind].x, `${where}: when.${key} is not stored`);
            if (tpl.r) {
                assert.ok(tpl.r.length >= 2 && tpl.r.length <= 4, `${where}: a thread is 2-4 replies`);
                for (const [p, t] of tpl.r) { assert.ok(ChoirPersonas[p], `${where}: reply persona ${p}`); checkText(`${where} reply`, t, ChoirKinds[kind].vars); }
            }
        }
    }
    for (const kind of Object.keys(ChoirKinds)) {
        if (kind !== 'status') assert.ok(ChoirContent[kind], `kind ${kind} has a pool`);
    }
    for (const [m, list] of Object.entries(ChoirStatuses)) {
        assert.equal(list.length, 3, `${m}: three canned statuses`);
        for (const tpl of list) {
            checkText(`status.${m}`, tpl.t, ChoirKinds.status.vars);
            for (const [p] of tpl.r || []) assert.ok(ChoirPersonas[p]);
        }
    }
    assert.ok(Object.keys(ChoirPersonas).length >= 11 && Object.keys(ChoirPersonas).length <= 15, 'ten to fourteen voices');
    // Every persona but the player speaks somewhere.
    const speaking = new Set(Object.values(ChoirContent).flat().flatMap((t) => [t.p, ...(t.r || []).map((r) => r[0])]));
    for (const id of Object.keys(ChoirPersonas)) if (!ChoirPersonas[id].player) assert.ok(speaking.has(id), `${id} never speaks`);
});

check('every changelog entry, line, tier and band has a template that can render it', () => {
    const env = fresh();
    const { Choir, RealityPool, Reality } = env;
    const now = Date.now();
    const render = (k, x) => Choir.view({ id: `probe:${k}:${JSON.stringify(x).replace(/[^a-z0-9]/gi, '')}`, k, r: 1, x, at: now, ep: 0, b: 0, c: 1 }, now);
    const kinds = { improvements: 'improvement', issues: 'issue', regressions: 'regression', deprecations: 'deprecation' };
    for (const [list, kind] of Object.entries(kinds)) {
        for (const e of RealityPool[list]) {
            const v = render(`ship.react.${kind}`, { lv: 1, e: e.id });
            assert.ok(v && v.text.includes(e.note), `${e.id} renders`);
        }
    }
    for (const e of [...RealityPool.issues, ...Reality.OPENING_BUILD.entries]) {
        assert.ok(render('patch', { lv: 1, e: e.id }), `${e.id} patch`);
        assert.ok(render('ship.dirty', { lv: 1, e: e.id }), `${e.id} dirty`);
    }
    for (const line of ['seraph', 'throne', 'cherub', 'wraith', 'revenant', 'phantom']) {
        assert.ok(render('outage', { line, s: '7G', n: 12 }), `outage ${line}`);
    }
    for (const t of [1, 2, 3]) {
        const s = render('cascade.status', { t }); const r = render('cascade.react', { t });
        assert.ok(s && r, `tier ${t}`);
    }
    for (const band of ['hostile', 'curious', 'complicit']) {
        assert.ok(render('ending.hr', { band }) && render('ending.voice', { band }), `band ${band}`);
    }
    for (const ch of ['beta', 'nightly', 'archived']) assert.ok(render('ship.unlock', { ch }).text.length);
    // Every achievement can be posted.
    for (const a of env.AchievementList) assert.ok(render(a.tier === 'Secret' ? 'ach.secret' : 'ach', { id: a.id }), a.id);
    // The pools whose voices depend on a `when` always have a template.
    for (const c of ['OP-A', 'OP-B', 'OP-C']) assert.ok(render('mirror.null', { c }));
    assert.ok(render('mirror.null', {}), 'a scene resolved with no choice');
});

/* ── Etherscape ────────────────────────────────────────────────────────── */

check('links render as plain text without Etherscape, and as links only where it knows the URL', () => {
    const now = Date.now();
    const post = { id: 'welcome', k: 'welcome', r: 1, x: {}, at: now, ep: 0, b: 0, c: 0 };

    const bare = fresh();
    const plain = bare.Choir.view(post, now);
    assert.ok(!plain.html.includes('<a '), 'no anchor without the browser');
    assert.ok(plain.html.includes('CMS intranet'), 'the label is kept as text');
    assert.ok(!plain.text.includes('cms://'), 'and the plain text carries no raw URL');

    const opened = [];
    const knows = fresh({ etherscape: { knows: (u) => u === 'cms://intranet', open: (u) => opened.push(u) } });
    const linked = knows.Choir.view(post, now);
    assert.ok(/<a class="ch-link" href="#" data-url="cms:\/\/intranet">CMS intranet<\/a>/.test(linked.html), linked.html);

    const unknown = fresh({ etherscape: { knows: () => false, open: noop } });
    assert.ok(!unknown.Choir.view(post, now).html.includes('<a '), 'an unknown URL is plain text');

    const throwing = fresh({ etherscape: { knows: () => { throw new Error('boom'); }, open: noop } });
    assert.ok(!throwing.Choir.view(post, now).html.includes('<a '), 'a broken browser is plain text');
});

check('quoted notes are escaped: quotation marks inside a changelog line survive as entities', () => {
    const env = fresh();
    const now = Date.now();
    const v = env.Choir.view({ id: 'probe', k: 'ship.react.issue', r: 1, x: { lv: 1, e: 'iss_detection_muted' }, at: now, ep: 0, b: 0, c: 0 }, now);
    assert.ok(v.html.includes('&quot;too noisy&quot;'), v.html);
    assert.ok(!v.html.includes('"too noisy"'));
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
