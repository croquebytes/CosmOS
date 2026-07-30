#!/usr/bin/env node
/**
 * Reality Build tests.
 *
 *   node tests/reality-builds.mjs
 *
 * The properties that matter most here are determinism and recoverability: a
 * build must be reproducible from its seed (or the Archived channel and the
 * golden master both break), and no build may leave a run unwinnable.
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

function boot() {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
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
    return vm.runInContext(
        '({ State, Modifiers, ModifierTargets, Reality, RealityPool, RealityChannels, game })',
        ctx,
    );
}

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

console.log('\nReality Builds\n');

/* ── Determinism ───────────────────────────────────────────────────────── */

check('the same seed produces an identical build', () => {
    const { Reality } = boot();
    const a = Reality.generate(12345, 4, 'nightly');
    const b = Reality.generate(12345, 4, 'nightly');
    // Compared as JSON: vm-constructed objects have a different prototype
    // than the host's, which strict deepEqual treats as a mismatch.
    assert.equal(JSON.stringify(a), JSON.stringify(b));
});

check('a different seed produces a different build', () => {
    const { Reality } = boot();
    const ids = new Set();
    for (let seed = 1; seed <= 30; seed++) {
        ids.add(Reality.generate(seed, 2, 'stable').entries.map((e) => e.id).join('|'));
    }
    assert.ok(ids.size > 15, `only ${ids.size}/30 distinct builds — seed mixing is too weak`);
});

check('consecutive reboots are not correlated', () => {
    const { Reality } = boot();
    const ids = new Set();
    for (let level = 0; level < 20; level++) {
        ids.add(Reality.generate(999, level, 'stable').entries.map((e) => e.id).join('|'));
    }
    assert.ok(ids.size > 12, `only ${ids.size}/20 distinct across reboots`);
});

check('a build survives a JSON round trip unchanged', () => {
    const { Reality } = boot();
    const build = Reality.generate(777, 6, 'beta');
    assert.equal(JSON.stringify(JSON.parse(JSON.stringify(build))), JSON.stringify(build));
});

/* ── Channels ──────────────────────────────────────────────────────────── */

check('channel volatility increases stable -> beta -> nightly', () => {
    const { Reality } = boot();
    const mean = (channel) => {
        let total = 0;
        for (let seed = 1; seed <= 200; seed++) total += Reality.generate(seed, 5, channel).entries.length;
        return total / 200;
    };
    const [stable, beta, nightly] = ['stable', 'beta', 'nightly'].map(mean);
    assert.ok(stable < beta, `stable ${stable} should be < beta ${beta}`);
    assert.ok(beta < nightly, `beta ${beta} should be < nightly ${nightly}`);
});

check('stable never ships a deprecation or a regression', () => {
    const { Reality } = boot();
    for (let seed = 1; seed <= 400; seed++) {
        const kinds = Reality.generate(seed, 5, 'stable').entries.map((e) => e.kind);
        assert.ok(!kinds.includes('deprecation'), `seed ${seed} shipped a deprecation on stable`);
        assert.ok(!kinds.includes('regression'), `seed ${seed} shipped a regression on stable`);
    }
});

check('nightly does ship deprecations', () => {
    const { Reality } = boot();
    let count = 0;
    for (let seed = 1; seed <= 200; seed++) {
        if (Reality.generate(seed, 5, 'nightly').entries.some((e) => e.kind === 'deprecation')) count++;
    }
    assert.ok(count > 100, `only ${count}/200 nightly builds deprecated something (expected ~80%)`);
});

check('channels unlock with reboot count', () => {
    const { Reality } = boot();
    assert.equal(Reality.channelsFor(0).join(','), 'stable');
    assert.ok(Reality.channelsFor(3).includes('beta'));
    assert.ok(!Reality.channelsFor(3).includes('nightly'));
    assert.ok(Reality.channelsFor(8).includes('nightly'));
    assert.ok(Reality.channelsFor(12).includes('archived'));
});

check('an entry never appears twice in one build', () => {
    const { Reality, RealityChannels } = boot();
    for (const channel of Object.keys(RealityChannels)) {
        for (let seed = 1; seed <= 150; seed++) {
            const ids = Reality.generate(seed, 7, channel).entries.map((e) => e.id);
            assert.equal(new Set(ids).size, ids.length, `duplicate entry on ${channel} seed ${seed}`);
        }
    }
});

/* ── No build may strand a run ─────────────────────────────────────────── */

check('every pool modifier targets a real registry target', () => {
    const { RealityPool, ModifierTargets, Reality } = boot();
    const groups = [...RealityPool.improvements, ...RealityPool.issues,
                    ...RealityPool.regressions, ...RealityPool.deprecations,
                    ...Reality.OPENING_BUILD.entries];
    for (const entry of groups) {
        for (const mod of entry.mods || []) {
            assert.ok(ModifierTargets[mod.target], `${entry.id} targets unknown "${mod.target}"`);
        }
    }
});

check('no reachable build zeroes or inverts a production target', () => {
    /* The property that matters: a run must always be playable. A zero on the
       chain would strand anyone who has not already banked Souls, and a
       negative would invert the economy. */
    const critical = [
        'praise.multiplier', 'offerings.multiplier', 'souls.multiplier',
        'automaton.seraph.output', 'automaton.throne.output', 'automaton.cherub.output',
        'caps.praise', 'caps.offerings', 'caps.souls', 'click.power',
    ];
    const { Reality, Modifiers, RealityChannels } = boot();
    const bad = [];
    for (const channel of Object.keys(RealityChannels)) {
        for (let seed = 1; seed <= 250; seed++) {
            Modifiers.reset();
            Reality.apply(Reality.generate(seed, 9, channel), 0);
            for (const target of critical) {
                const value = Modifiers.fold(target, 0);
                if (!Number.isFinite(value) || value <= 0) {
                    bad.push(`${channel}/${seed} ${target}=${value}`);
                }
            }
        }
    }
    assert.equal(bad.length, 0, bad.slice(0, 5).join('; '));
});

check('throne.draw never folds to zero or negative', () => {
    // A zero draw would make Offerings free; a negative would pay the player
    // Praise to convert. Both invert the conversion the economy rests on.
    const { Reality, Modifiers, RealityChannels } = boot();
    for (const channel of Object.keys(RealityChannels)) {
        for (let seed = 1; seed <= 250; seed++) {
            Modifiers.reset();
            Reality.apply(Reality.generate(seed, 9, channel), 0);
            const draw = Modifiers.fold('throne.draw', 0);
            assert.ok(draw > 0 && Number.isFinite(draw), `${channel}/${seed} throne.draw=${draw}`);
        }
    }
});

/* ── Patching ──────────────────────────────────────────────────────────── */

check('patching drops exactly the patched entry\'s records', () => {
    const { State, Reality, Modifiers, game } = boot();
    State.reality = { runSeed: 42, channel: 'nightly', build: null, shipped: 0 };
    State.prestigeLevel = 5;
    const build = game.ensureReality();
    Modifiers.reset();
    Reality.apply(build, 0);

    const before = Modifiers.records.length;
    const issue = Reality.unpatchedIssues(build)[0];
    assert.ok(issue, 'nightly build should carry at least one known issue');

    const cost = Reality.patchCostOf(build, issue.id);
    cost.bag[cost.resource] = cost.amount * 2;
    assert.equal(game.patchKnownIssue(issue.id, 0), true);

    assert.equal(Reality.entry(build, issue.id).patched, true);
    assert.ok(Modifiers.records.length < before, 'a record should have been dropped');
    assert.equal(Modifiers.records.filter((r) => r.source?.id === issue.id).length, 0);
});

check('patching costs the resource and cannot be done twice', () => {
    const { State, Reality, Modifiers, game } = boot();
    State.reality = { runSeed: 8, channel: 'nightly', build: null, shipped: 0 };
    State.prestigeLevel = 5;
    const build = game.ensureReality();
    Modifiers.reset();
    Reality.apply(build, 0);

    const issue = Reality.unpatchedIssues(build)[0];
    const cost = Reality.patchCostOf(build, issue.id);
    cost.bag[cost.resource] = cost.amount;

    assert.equal(game.patchKnownIssue(issue.id, 0), true);
    assert.equal(Math.round(cost.bag[cost.resource]), 0, 'the cost should have been spent');
    assert.equal(game.patchKnownIssue(issue.id, 0), false, 'a patched issue cannot be re-patched');
});

check('patching is refused when the resource is short', () => {
    const { State, Reality, Modifiers, game } = boot();
    State.reality = { runSeed: 9, channel: 'nightly', build: null, shipped: 0 };
    State.prestigeLevel = 5;
    const build = game.ensureReality();
    Modifiers.reset();
    Reality.apply(build, 0);

    const issue = Reality.unpatchedIssues(build)[0];
    const cost = Reality.patchCostOf(build, issue.id);
    cost.bag[cost.resource] = cost.amount - 1;
    assert.equal(game.patchKnownIssue(issue.id, 0), false);
    assert.equal(Reality.entry(build, issue.id).patched, undefined);
});

check('a regression cannot be patched away', () => {
    const { State, Reality, Modifiers, game } = boot();
    State.reality = { runSeed: 3, channel: 'nightly', build: null, shipped: 0 };
    State.prestigeLevel = 9;
    const build = game.ensureReality();
    Modifiers.reset();
    Reality.apply(build, 0);

    const regression = build.entries.find((e) => e.kind === 'regression');
    if (!regression) return; // this seed shipped none; the property is vacuous
    assert.equal(Reality.patchCostOf(build, regression.id), null);
    assert.equal(game.patchKnownIssue(regression.id, 0), false);
});

/* ── Lifecycle ─────────────────────────────────────────────────────────── */

check('the opening build is the premise, not a roll', () => {
    const { State, game } = boot();
    State.prestigeLevel = 0;
    State.reality = { runSeed: 555, channel: 'stable', build: null, shipped: 0 };
    const build = game.ensureReality();
    assert.equal(build.version, '4.2.0');
    assert.equal(build.entries.length, 1);
    assert.equal(build.entries[0].id, 'iss_sector_7g');
});

check('ensureReality never re-rolls an existing build', () => {
    const { State, game } = boot();
    State.reality = { runSeed: 21, channel: 'beta', build: null, shipped: 0 };
    State.prestigeLevel = 4;
    const first = game.ensureReality();
    const again = game.ensureReality();
    assert.equal(first, again, 'the same object should be returned, not a fresh roll');
});

check('prestige drops the old build and rolls exactly one new set', () => {
    const { State, Modifiers, game } = boot();
    State.reality = { runSeed: 4242, channel: 'stable', build: null, shipped: 0 };
    State.prestigeLevel = 2;
    game.bootstrapModifiers(0);

    const buildRecords = () => Modifiers.records.filter((r) => r.scope === 'build');
    const firstIds = new Set(buildRecords().map((r) => r.source.id));
    assert.ok(firstIds.size > 0, 'the first build should have registered records');

    State.totalStats.soulsGained = 5e12;
    game.performPrestige();

    const after = buildRecords();
    const staleCarried = after.filter((r) => firstIds.has(r.source.id) &&
        !State.reality.build.entries.some((e) => e.id === r.source.id));
    assert.equal(staleCarried.length, 0, 'records from the retired build must not survive');
    assert.equal(State.reality.shipped, 1);
    for (const record of after) {
        assert.ok(State.reality.build.entries.some((e) => e.id === record.source.id),
            `record ${record.source.id} does not belong to the current build`);
    }
});

check('a hydrated log does not double-apply build modifiers', () => {
    /* bootstrapModifiers applies the build only when it REBUILDS the log. A
       hydrated log already carries its build records, so applying again would
       stack the whole changelog twice. */
    const { State, Modifiers, game } = boot();
    State.reality = { runSeed: 31337, channel: 'nightly', build: null, shipped: 0 };
    State.prestigeLevel = 6;
    game.bootstrapModifiers(0);

    const expected = Modifiers.records.filter((r) => r.scope === 'build').length;
    State.modifierLog = JSON.parse(JSON.stringify(Modifiers.serialize()));

    Modifiers.reset();
    game.bootstrapModifiers(0);
    const actual = Modifiers.records.filter((r) => r.scope === 'build').length;
    assert.equal(actual, expected, 'build records were duplicated on rehydrate');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exitCode = 1;
