#!/usr/bin/env node
/**
 * The Archived channel.
 *
 *   node tests/archived.mjs
 *
 * DESIGN_DIRECTION §2: "a specific past build, replayed: no Divinity, unlocks
 * lore". It was declared and deliberately not offered for two reasons, and
 * these tests exist mostly to keep both from coming back:
 *
 *   - It was not a replay. generate() keyed off the CURRENT prestige level,
 *     so "Archived" was a Stable build wearing another label. The replay has
 *     to be the original build, entry for entry — and it has to STAY that
 *     build across a reload, because ensureReality() re-derives every build
 *     from its identity on load.
 *   - It paid zero Divinity, and the reboot path refused a zero-payout
 *     channel. That refusal is correct for every other channel and must
 *     stay; Archived is exempt by name, not by weakening the check.
 *
 * And the trap this project keeps falling into: a fixture that never reboots
 * makes every award-shaped assertion compare zero with zero. Runs are stated
 * in BARS, and every ship asserts that the reboot actually happened.
 */

import assert from 'node:assert/strict';
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

function boot(store = {}) {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set,
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
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(
        '({ State, Modifiers, Reality, RealityPool, RealityChannels, ArchiveAnnotations, AchievementList, game })', ctx,
    );
    env.store = store;
    // Swaps the ui global, for the tests that read what the game told it.
    env.setUi = (replacement) => { ctx.ui = replacement; };
    return env;
}

const SEED = 20260726;

/* A fresh game with a pinned seed, the way tools/balance_sim.mjs starts. */
function fresh(store = {}) {
    const env = boot(store);
    env.State.reality = {
        runSeed: SEED, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    return env;
}

/* A run that clears the bar, stated in bars. */
function earn(env, bars = 3) {
    const { State, game } = env;
    State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * bars;
}

const stripped = (build) => JSON.stringify((build.entries || []).map(({ patched, ...e }) => e));

/* Ships the current run and asserts the reboot happened. Returns the build
   that was shipped, as it was at ship time. */
function ship(env, { bars = 3, certifyOn = 'creation' } = {}) {
    const { State, game } = env;
    earn(env, bars);
    const before = State.prestigeLevel;
    const shipped = JSON.parse(JSON.stringify(State.reality.build));
    game.performPrestige({ confirmed: true, certifyOn });
    assert.equal(State.prestigeLevel, before + 1, `fixture check: the reboot from ${before} did not happen`);
    return shipped;
}

/* Climbs to `level` by shipping on the channels a player would have had.
   Returns the shipped builds by reboot index. */
function climb(env, level) {
    const shipped = {};
    while (env.State.prestigeLevel < level) {
        const n = env.State.prestigeLevel;
        // Vary the channel so the history is not all Stable.
        const want = n >= 8 && n % 2 ? 'nightly' : n >= 3 && n % 3 === 0 ? 'beta' : 'stable';
        if (env.Reality.channelsFor(n).includes(want)) env.game.setBuildChannel(want);
        shipped[n] = ship(env);
    }
    return shipped;
}

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

console.log('\nThe Archived channel\n');

/* ── The release history ───────────────────────────────────────────────── */

check('every ship appends a history record that survives a reload', () => {
    const store = {};
    const env = fresh(store);
    const shipped = climb(env, 3);
    const history = env.State.reality.history;
    assert.equal(history.length, 3, 'one record per ship');
    assert.deepEqual([...history.map((r) => r.reboot)], [0, 1, 2]);

    const opening = history[0];
    assert.equal(opening.level, 0);
    assert.equal(opening.channel, 'stable');
    assert.equal(opening.runSeed, SEED);
    assert.equal(opening.certified, null, 'the opening run was certified on nothing');
    assert.ok(opening.unpatched.includes('iss_sector_7g'), 'the opening build shipped its issue unpatched');
    assert.ok(opening.award > 0, 'fixture check: the opening ship paid');
    assert.deepEqual([...opening.entries], shipped[0].entries.map((e) => e.id));
    assert.equal(history[1].certified, 'creation', 'the path the run was PLAYED on');

    const reloaded = boot(store);
    reloaded.game.bootstrapModifiers(Date.now());
    assert.equal(JSON.stringify(reloaded.State.reality.history), JSON.stringify(history),
        'the history did not survive a reload');
});

check('the history is capped, oldest out first', () => {
    const { Reality } = boot();
    const many = Array.from({ length: 100 }, (_, i) => ({
        reboot: i, level: i, channel: 'stable', source: 'stable', runSeed: SEED,
        certified: null, unpatched: [], entries: [], award: 1, shippedAt: 0,
    }));
    const kept = Reality.normaliseHistory(many);
    assert.equal(kept.length, Reality.HISTORY_CAP);
    assert.equal(kept[kept.length - 1].reboot, 99, 'the newest record must survive the cap');
});

check('hostile history shapes are validated, not defaulted', () => {
    const good = {
        reboot: 4, level: 4, channel: 'beta', source: 'beta', runSeed: SEED, certified: 'entropy',
        unpatched: ['iss_soul_partition', 5, '<img src=x>', 'iss_soul_partition', 'imp_soul_resonance'],
        entries: ['iss_soul_partition', 'no_such_entry', {}],
        award: -7, shippedAt: 'yesterday',
    };
    const store = {
        cosmos_save: JSON.stringify({
            saveVersion: 6,
            prestigeLevel: 5,
            reality: {
                runSeed: SEED, channel: 'archived', build: null, shipped: 5,
                replay: 'abc',
                history: [
                    null, 5, 'record', [],
                    { ...good, reboot: '1' },                                // string index
                    { ...good, reboot: 1, level: 1, channel: 'nightly' },    // channel != source
                    { ...good, reboot: 2, level: 0 },                        // non-archived level != reboot
                    { ...good, reboot: 3, level: 3, channel: '__proto__', source: '__proto__' },
                    { ...good, reboot: 3, level: 3, channel: 'stable', source: 'stable', runSeed: 0 },
                    { ...good, reboot: 3, level: 3, channel: 'stable', source: 'stable', runSeed: -1 },
                    { ...good, reboot: 0, level: 0, channel: 'nightly', source: 'nightly' }, // opening is stable
                    { ...good, reboot: 2, level: 3, channel: 'archived', source: 'stable' }, // replays the future
                    good,
                    { ...good, award: 99 },                                  // duplicate reboot 4: forged
                ],
                annotations: 'lots',
            },
            achievementProgress: { view_archived_branch: -3 },
        }),
    };
    const env = boot(store);
    env.game.bootstrapModifiers(Date.now());
    const { history } = env.State.reality;
    assert.equal(history.length, 1, `expected only the valid record, kept ${history.length}`);
    const r = history[0];
    assert.equal(r.reboot, 4);
    assert.deepEqual([...r.unpatched], ['iss_soul_partition'],
        'unpatched must keep only real issue ids, once each');
    assert.deepEqual([...r.entries], ['iss_soul_partition']);
    assert.equal(r.certified, 'entropy');
    assert.equal(r.award, 0, 'a negative award must not survive');
    assert.equal(r.shippedAt, null);
    assert.equal(env.State.reality.replay, null, 'a non-integer pick must not survive');
    assert.deepEqual([...env.State.reality.annotations], []);
    assert.equal(env.State.reality.channel, 'stable',
        'a save cannot select Archived before reboot 12');
    assert.equal(env.State.achievementProgress.view_archived_branch, 0);

    // An integer pick is still only a pick if it names an original on file.
    for (const pick of [9, 4.5, -1]) {
        env.State.reality.replay = pick;
        env.game.normaliseArchive();
        assert.equal(env.State.reality.replay, null, `a pick of ${pick} survived normalisation`);
    }
    env.State.reality.replay = 4;
    env.game.normaliseArchive();
    assert.equal(env.State.reality.replay, 4, 'a valid pick was thrown away');
});

/* ── The replay ────────────────────────────────────────────────────────── */

check('an Archived build is the original, byte for byte — not what Stable rolls now', () => {
    const env = fresh();
    const shipped = climb(env, 12);
    const { State, Reality, game } = env;
    // The channel picked at reboot n pulls the build for reboot n + 1, so
    // climb()'s Nightly pick at 9 is the build played at 10.
    const original = shipped[10];
    const record = State.reality.history.find((r) => r.reboot === 10);
    assert.ok(record, 'fixture check: reboot 10 is on file');
    assert.equal(record.source, 'nightly', 'fixture check: reboot 10 shipped on Nightly');

    assert.ok(game.setBuildChannel('archived'), 'Archived should be selectable at reboot 12');
    assert.ok(game.selectArchivedBuild(10));
    ship(env);
    const replay = State.reality.build;
    assert.equal(replay.channel, 'archived');
    assert.equal(stripped(replay), stripped(original), 'the replay is not the build that shipped');
    assert.equal(replay.seed, original.seed);
    assert.equal(replay.version, original.version, 'a replay keeps its original version string');

    const stableNow = Reality.generate(SEED, State.prestigeLevel, 'stable');
    assert.notEqual(stripped(replay), stripped(stableNow), 'Archived is still Stable in disguise');
});

check('a replay survives a reload as the same build, not one re-rolled at the current level', () => {
    const store = {};
    const env = fresh(store);
    const shipped = climb(env, 12);
    env.game.setBuildChannel('archived');
    env.game.selectArchivedBuild(5);
    ship(env);
    env.State.save();

    const reloaded = boot(store);
    reloaded.game.bootstrapModifiers(Date.now());
    const build = reloaded.State.reality.build;
    assert.equal(build.channel, 'archived', 'the replay forgot it was archived');
    assert.equal(stripped(build), stripped(shipped[5]), 'the reload re-rolled the replay');
});

check('the opening build can be replayed, and is the opening build', () => {
    const env = fresh();
    const shipped = climb(env, 12);
    env.game.setBuildChannel('archived');
    assert.ok(env.game.selectArchivedBuild(0));
    ship(env);
    assert.equal(stripped(env.State.reality.build), stripped(shipped[0]));
    assert.equal(env.State.reality.build.version, env.Reality.OPENING_BUILD.version);
});

/* ── Shipping at zero ──────────────────────────────────────────────────── */

check('an Archived run ships at award 0, pays 0 Divinity, and leaves the bar where it was', () => {
    const env = fresh();
    climb(env, 12);
    const { State, game } = env;
    game.setBuildChannel('archived');
    game.selectArchivedBuild(7);
    ship(env);
    assert.equal(State.reality.build.channel, 'archived', 'fixture check: on a replay');

    earn(env, 3);
    assert.ok(game.calculateDivinityPoints() > 0, 'fixture check: the run has cleared the bar');
    assert.equal(game.getPrestigeAward(), 0, 'Archived must pay nothing');
    assert.ok(game.canPrestige(), 'an Archived run that cleared the bar must be shippable');

    const level = State.prestigeLevel;
    const divinity = State.totalDivinityPoints;
    const bar = game.getPrestigeThreshold();
    game.performPrestige({ confirmed: true, certifyOn: 'maintenance' });
    assert.equal(State.prestigeLevel, level + 1, 'the Archived ship was refused');
    assert.equal(State.totalDivinityPoints, divinity, 'Archived paid Divinity');
    assert.equal(game.getPrestigeThreshold(), bar, 'the bar moved on a zero-Divinity ship');
    const last = State.reality.history[State.reality.history.length - 1];
    assert.equal(last.channel, 'archived');
    assert.equal(last.level, 7);
    assert.equal(last.award, 0);
});

check('an Archived run still has to clear the bar', () => {
    const env = fresh();
    climb(env, 12);
    const { State, game } = env;
    game.setBuildChannel('archived');
    game.selectArchivedBuild(7);
    ship(env);
    // No Souls earned this run.
    State.totalStats.soulsGained = Number(State.runSoulsBaseline) || 0;
    const level = State.prestigeLevel;
    assert.equal(game.canPrestige(), false);
    game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(State.prestigeLevel, level, 'a replay shipped without being played');
});

check('every other channel still refuses a zero payout', () => {
    const env = fresh();
    climb(env, 4);
    const { State, game, RealityChannels } = env;
    game.setBuildChannel('beta');
    ship(env);
    assert.equal(State.reality.build.channel, 'beta', 'fixture check: playing a Beta build');
    RealityChannels.beta.divinity = 0;          // a misconfigured channel
    earn(env, 3);
    assert.ok(game.calculateDivinityPoints() > 0, 'fixture check: the run cleared the bar');
    const level = State.prestigeLevel;
    game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(State.prestigeLevel, level, 'a zero-payout Beta build shipped — the refusal was weakened');
});

/* ── Lore ──────────────────────────────────────────────────────────────── */

check('a replay files his annotations, makes Archive Diver reachable, and files them once', () => {
    const env = fresh();
    climb(env, 12);
    const { State, game, Reality } = env;
    const record = State.reality.history.find((r) => r.reboot === 9);
    const expected = Reality.annotatableIds(record);
    assert.ok(expected.length > 0, 'fixture check: reboot 9 shipped something to annotate');
    const filed = [];
    env.setUi(new Proxy({}, {
        get: (_, key) => (key === 'showDocumentNotification' ? (doc) => filed.push(doc.id) : noop),
    }));

    assert.equal(State.achievementProgress.view_archived_branch, 0);
    game.checkAchievements();
    assert.ok(!State.achievements['ACH-030'], 'fixture check: Archive Diver is not already unlocked');

    game.setBuildChannel('archived');
    game.selectArchivedBuild(9);
    ship(env);
    assert.equal(State.achievementProgress.view_archived_branch, 1);
    assert.equal(State.reality.annotations.length, 1);
    assert.deepEqual([...State.reality.annotations[0].ids], [...expected]);
    const docs = game.archiveDocuments();
    assert.equal(docs.length, 1);
    assert.equal(docs[0].category, 'Archive');
    assert.equal(docs[0].notes.length, expected.length);
    assert.ok(docs[0].notes.every((n) => typeof n.line === 'string' && n.line.length > 0),
        'an annotated entry had no line');
    game.checkAchievements();
    assert.ok(State.achievements['ACH-030'], 'Archive Diver is still unreachable');

    // Replay the same build again.
    game.setBuildChannel('archived');
    game.selectArchivedBuild(9);
    ship(env);
    assert.equal(State.reality.build.channel, 'archived', 'fixture check: the second replay happened');
    assert.equal(State.achievementProgress.view_archived_branch, 2, 'a second visit is still a visit');
    assert.equal(State.reality.annotations.length, 1, 'the same build was annotated twice');
    assert.equal(game.archiveDocuments().length, 1);
    assert.equal(filed.length, 1, `the player was told a document was filed ${filed.length} times`);
});

check('annotations cover exactly the unpatched issues and the regressions', () => {
    const { Reality } = boot();
    const ids = Reality.annotatableIds({
        unpatched: ['iss_conduit_leak'],
        entries: ['imp_praise_throughput', 'iss_conduit_leak', 'iss_vault_corrupt', 'reg_streak_reset', 'dep_events'],
    });
    assert.deepEqual([...ids], ['iss_conduit_leak', 'reg_streak_reset'],
        'a patched issue, an improvement or a deprecation was annotated — or a regression was not');
});

check('every known issue and regression has a line, and lines are stable per build', () => {
    const { Reality, RealityPool, ArchiveAnnotations } = boot();
    const ids = [
        ...RealityPool.issues.map((e) => e.id),
        ...RealityPool.regressions.map((e) => e.id),
        ...Reality.OPENING_BUILD.entries.filter((e) => e.kind === 'issue').map((e) => e.id),
    ];
    for (const id of ids) {
        assert.ok(ArchiveAnnotations.lines[id]?.length, `${id} has no annotation`);
        assert.equal(Reality.annotationLine(id, 1234), Reality.annotationLine(id, 1234));
    }
    const total = Object.values(ArchiveAnnotations.lines).reduce((n, l) => n + l.length, 0);
    assert.ok(total >= 16 && total <= 24, `${total} annotation lines`);
});

check('hostile annotation records are dropped, and duplicates collapse to one', () => {
    const { Reality } = boot();
    const ok = { level: 3, source: 'beta', runSeed: SEED, ids: ['iss_vault_corrupt', 'bogus', 7], filedOn: 12 };
    const out = Reality.normaliseAnnotations([
        ok, { ...ok }, { ...ok, level: '3' }, { ...ok, level: 4, filedOn: 2 }, { ...ok, level: 5, source: 'archived' },
        { ...ok, level: 6, runSeed: 1.5 }, null, 'x',
    ]);
    assert.equal(out.length, 1);
    assert.deepEqual([...out[0].ids], ['iss_vault_corrupt']);
});

check('a reboot into the archive nudges NULL.OPERATOR toward you, not away', () => {
    const env = fresh();
    climb(env, 12);
    const { State, game } = env;
    State.adversary.sceneCompleted = true;
    State.adversary.standing = 0;
    ship(env);
    assert.equal(State.adversary.standing, -1, 'fixture check: an ordinary reboot is -1');
    game.setBuildChannel('archived');
    game.selectArchivedBuild(3);
    ship(env);
    assert.equal(State.adversary.standing, 0, 'reopening an archived branch should be +1');
});

check('scars are still filed when an Archived run ships an issue unpatched', () => {
    const env = fresh();
    const { State, game, Reality } = env;
    // Climb with every known issue PATCHED, so nothing is scarred yet and the
    // replay's issues are all fresh. Independent of what the seed rolls.
    const patchAll = () => {
        for (const e of Reality.unpatchedIssues(State.reality.build)) e.patched = true;
    };
    while (State.prestigeLevel < 12) { patchAll(); ship(env); }
    assert.deepEqual([...State.reality.scars], [], 'fixture check: nothing scarred on the way up');
    const record = State.reality.history.find((r) => r.reboot === 6);
    assert.deepEqual([...record.unpatched], [], 'fixture check: reboot 6 shipped clean');

    game.setBuildChannel('archived');
    game.selectArchivedBuild(6);
    ship(env);                                   // the replay starts, issues unpatched
    const issues = Reality.unpatchedIssues(State.reality.build).map((e) => e.id);
    assert.ok(issues.length > 0, 'fixture check: the replay carries a known issue');
    ship(env);                                   // and ships with them unpatched
    for (const id of issues) {
        assert.ok(State.reality.scars.includes(id), `${id} shipped unpatched on a replay and was not filed`);
    }
});

/* ── Offering it ───────────────────────────────────────────────────────── */

check('Archived is not offered before reboot 12', () => {
    const env = fresh();
    climb(env, 11);
    const { State, game, Reality } = env;
    assert.ok(!Reality.channelsFor(11).includes('archived'));
    assert.equal(game.setBuildChannel('archived'), false);
    assert.notEqual(State.reality.channel, 'archived');
    assert.equal(game.selectArchivedBuild(3), false, 'a build was picked before the channel opened');
    ship(env);
    assert.ok(Reality.channelsFor(State.prestigeLevel).includes('archived'), 'fixture check: reboot 12');
    assert.equal(game.setBuildChannel('archived'), true);
});

check('the pick has no default: it is consumed, and a bare reboot without one falls back to Stable', () => {
    const env = fresh();
    climb(env, 12);
    const { State, game } = env;
    game.setBuildChannel('archived');
    game.selectArchivedBuild(4);
    ship(env);
    assert.equal(State.reality.build.channel, 'archived', 'fixture check: replaying');
    assert.equal(State.reality.replay, null, 'the pick was not consumed');
    assert.equal(game.archivedPick(), null);
    assert.equal(State.reality.channel, 'archived', 'the selector itself is the player\'s, and stays');
    ship(env);
    assert.equal(State.reality.build.channel, 'stable', 'a reboot with no pick replayed something anyway');
    assert.equal(State.reality.channel, 'stable');
});

check('Archived cannot be selected with nothing on file', () => {
    const env = fresh();
    const { State, game } = env;
    State.prestigeLevel = 12;          // an old save: reboot 12, no history yet
    State.reality.history = [];
    assert.equal(game.setBuildChannel('archived'), false);
    assert.equal(State.reality.channel, 'stable');
});

console.log(`\n${passed} passed${process.exitCode ? ' — with failures' : ''}\n`);
