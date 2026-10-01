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

// The declared playability floor for caps.praise, read from the target table
// rather than restated here.
const ModifierTargets_floor = () => boot().ModifierTargets['caps.praise'].floor ?? 0;

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
    /* 'archived' was held back until it replayed a past build (it used to
       be byte-identical to stable) and until a 0-Divinity ship was allowed.
       Both now hold — tests/archived.mjs — so it opens at reboot 12, and not
       a reboot sooner. */
    assert.ok(!Reality.channelsFor(11).includes('archived'), 'archived offered before reboot 12');
    assert.ok(Reality.channelsFor(12).includes('archived'), 'archived not offered at reboot 12');
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

check('no build can price the player out of raising a cap', () => {
    /* THE assertion this suite was missing. The first version asserted caps
       were merely > 0 — and dep_storage_growth folding caps.praise to 350 is
       positive, so it passed. But the cheapest cap-raising purchase costs 400
       Praise, so that run could never raise its cap again: a hard soft-lock
       that a positivity check cannot see. The property is affordability of
       escape, not positivity. */
    const CHEAPEST_PRAISE_CAP_UPGRADE = 400;   // praise_vault repeatable
    const { Reality, Modifiers, RealityChannels } = boot();
    const bad = [];
    for (const channel of Object.keys(RealityChannels)) {
        for (let seed = 1; seed <= 400; seed++) {
            for (const level of [0, 1, 5, 12, 20]) {
                Modifiers.reset();
                Reality.apply(Reality.generate(seed, level, channel), 0);
                const cap = Modifiers.fold('caps.praise', 0);
                const floored = Math.max(ModifierTargets_floor(), cap);
                if (floored < CHEAPEST_PRAISE_CAP_UPGRADE) {
                    bad.push(`${channel}/${seed}/L${level} caps.praise=${floored}`);
                }
            }
        }
    }
    assert.equal(bad.length, 0, bad.slice(0, 4).join('; '));
});

check('a declared floor is enforced by commit, whatever the fold says', () => {
    const { State, Modifiers } = boot();
    Modifiers.reset();
    // Stack far more reduction than the pool can actually produce.
    for (let i = 0; i < 6; i++) {
        Modifiers.add({ target: 'caps.praise', op: 'mul', value: 0.5, source: { kind: 'test', id: `x${i}` } });
    }
    assert.ok(Modifiers.fold('caps.praise', 0) < 100, 'the raw fold should be tiny');
    Modifiers.commit(0);
    assert.ok(State.resourceCaps.praise >= 600, `floor not applied: ${State.resourceCaps.praise}`);
});

check('offline efficiency is never driven to zero', () => {
    // A hard 0 means eight hours away banks literally nothing, and a
    // deprecation is unpatchable for the whole run.
    const { Reality, Modifiers, RealityChannels } = boot();
    const bad = [];
    for (const channel of Object.keys(RealityChannels)) {
        for (let seed = 1; seed <= 400; seed++) {
            Modifiers.reset();
            Reality.apply(Reality.generate(seed, 15, channel), 0);
            const value = Modifiers.fold('offline.efficiency', 0);
            if (!(value > 0)) bad.push(`${channel}/${seed}=${value}`);
        }
    }
    assert.equal(bad.length, 0, bad.slice(0, 4).join('; '));
});

check('an improvement never raises a patch price in the same build', () => {
    /* Patch costs were priced off the live post-build cap, so a cap-shrinking
       entry discounted every patch in that resource (making "clear the harmful
       entry last" optimal) while a cap-doubling improvement doubled the bill. */
    const { State, Reality, Modifiers, game } = boot();
    State.reality = { runSeed: 1, channel: 'stable', build: null, shipped: 0 };
    State.prestigeLevel = 4;
    const build = game.ensureReality();
    Modifiers.reset();
    Reality.apply(build, 0);

    const issue = Reality.unpatchedIssues(build).find((e) => e.patchCost?.resource === 'praise');
    if (!issue) return;                     // this seed has no praise-priced issue
    const withBuild = Reality.patchCostOf(build, issue.id).amount;

    Modifiers.reset();                      // price with no build applied at all
    const withoutBuild = Reality.patchCostOf(build, issue.id).amount;
    assert.equal(withBuild, withoutBuild, 'the build moved the price of its own patch');
});

check('no channel offered to the player pays zero Divinity, except Archived', () => {
    // divinity: 0 makes the award floor to 0, which made Divine Reboot
    // impossible while the button stayed live and the choice autosaved.
    // Archived pays zero ON PURPOSE and is shippable anyway — that exemption
    // is explicit in performPrestige and tested in tests/archived.mjs. It is
    // the ONLY one: a second zero-payout channel would hit the old trap.
    const { Reality, RealityChannels } = boot();
    for (const level of [0, 3, 8, 12, 20, 50]) {
        for (const key of Reality.channelsFor(level)) {
            if (key === 'archived') continue;
            assert.ok(RealityChannels[key].divinity > 0,
                `channel "${key}" is offered at level ${level} but pays ${RealityChannels[key].divinity}x`);
        }
    }
});

check('the payout follows the build played, not the channel selected next', () => {
    const { State, game, RealityChannels } = boot();
    State.reality = { runSeed: 4242, channel: 'stable', build: null, shipped: 0 };
    State.prestigeLevel = 8;
    game.bootstrapModifiers(0);
    assert.equal(State.reality.build.channel, 'stable');

    game.setBuildChannel('nightly');        // selects for NEXT time
    State.totalStats.soulsGained = 1e9;
    const raw = game.calculateDivinityPoints();
    game.performPrestige();

    const expected = Math.floor(raw * RealityChannels.stable.divinity);
    assert.equal(State.totalDivinityPoints, expected,
        `paid at the selected rate, not the played one (${State.totalDivinityPoints} vs ${expected})`);
});

check('a v3-shaped save still gets its build applied', () => {
    /* The bug this pins: bootstrapModifiers decided whether to apply the build
       by asking "is the log empty?". A save with a log but no build records —
       every save written before Reality Builds shipped — got a build that was
       displayed and billable but never applied. */
    const { State, Modifiers, game } = boot();
    State.reality = { runSeed: 55, channel: 'stable', build: null, shipped: 0 };
    State.prestigeLevel = 0;
    // A log that exists but carries no build records, as a v3 save would.
    Modifiers.reset();
    Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 2, scope: 'run', source: { kind: 'upgrade', id: 'praise_multi_1' } });
    State.modifierLog = JSON.parse(JSON.stringify(Modifiers.serialize()));
    Modifiers.reset();

    game.bootstrapModifiers(0);
    const applied = Modifiers.records.filter((r) => r.scope === 'build');
    assert.ok(applied.length > 0, 'the opening build was never applied');
    // The opening issue halves the Praise cap, so it must be observable.
    assert.ok(State.resourceCaps.praise < 1000 || State.resourceCaps.praise === 600,
        `cap shows no sign of the build: ${State.resourceCaps.praise}`);
});

check('a duplicate modifier id is refused', () => {
    // Upgrades are re-bought every run (the ledger clears at prestige) but
    // permanent-scope records were never dropped, so the log grew forever.
    const { Modifiers } = boot();
    Modifiers.reset();
    const first = Modifiers.add({ target: 'offline.efficiency', op: 'max', value: 1, source: { kind: 'upgrade', id: 'offline_efficiency_2' } });
    const second = Modifiers.add({ target: 'offline.efficiency', op: 'max', value: 1, source: { kind: 'upgrade', id: 'offline_efficiency_2' } });
    assert.ok(first);
    assert.equal(second, null, 'the duplicate should have been refused');
    assert.equal(Modifiers.records.length, 1);
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

check('ensureReality is idempotent for a given seed', () => {
    /* It re-DERIVES every call (so a content fix reaches a mid-run save) but
       must always produce the same build for the same identity. */
    const { State, game } = boot();
    State.reality = { runSeed: 21, channel: 'beta', build: null, shipped: 0 };
    State.prestigeLevel = 4;
    const first = JSON.stringify(game.ensureReality().entries);
    const again = JSON.stringify(game.ensureReality().entries);
    assert.equal(first, again);
});

check('a stale stored build is re-derived, keeping patched flags', () => {
    const { State, Reality, game } = boot();
    State.reality = { runSeed: 21, channel: 'beta', build: null, shipped: 0 };
    State.prestigeLevel = 4;
    const build = game.ensureReality();
    const issue = Reality.unpatchedIssues(build)[0];
    issue.patched = true;

    // Simulate a save written against an older pool: same identity, wrong mods.
    State.reality.build.entries = State.reality.build.entries.map((e) => ({
        ...e, mods: [{ target: 'praise.multiplier', op: 'mul', value: 0.5 }],
    }));

    const derived = game.ensureReality();
    assert.equal(derived.entries.find((e) => e.id === issue.id).patched, true,
        'the patched flag must survive re-derivation');
    assert.notEqual(JSON.stringify(derived.entries.find((e) => e.id === issue.id).mods),
        JSON.stringify([{ target: 'praise.multiplier', op: 'mul', value: 0.5 }]),
        'the stale mods should have been replaced by the current definition');
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
