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
        '({ State, Modifiers, ModifierTargets, Reality, RealityPool, RealityChannels, game, Economy, UpgradeList })',
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

/* ── The Void's entries ────────────────────────────────────────────────── */

const POOL_KINDS = { improvements: 'improvement', issues: 'issue', regressions: 'regression', deprecations: 'deprecation' };
const VOID_CURRENCIES = ['darkness', 'shadows', 'echoes'];
const voidEntriesOf = (RealityPool) => Object.entries(POOL_KINDS).flatMap(([list, kind]) =>
    RealityPool[list].filter((e) => e.dimension === 'void').map((e) => ({ ...e, kind })));
const voidIdsOf = (RealityPool) => new Set(voidEntriesOf(RealityPool).map((e) => e.id));

/* A Void in motion: unlocked, every rank staffed, Darkness banked so the
   Revenants run flat out, and a primordial line for Nemesis to lift. The
   build scope is cleared, so the only build records are the ones a test adds. */
function voidFixture() {
    const env = boot();
    const { State, Modifiers, game } = env;
    State.reality = { runSeed: 5, channel: 'stable', build: null, shipped: 0 };
    State.prestigeLevel = 4;
    game.bootstrapModifiers(0);
    Modifiers.dropScope('build');
    Modifiers.commit(0);
    const vd = State.dimensions.void;
    vd.unlocked = true;
    Object.assign(vd.automatons, { wraithCount: 40, revenantCount: 12, phantomCount: 24, nemesisCount: 10 });
    vd.dps = 40;
    vd.eps = 24;
    Object.assign(vd.resources, { darkness: 400, shadows: 20, echoes: 300 });
    State.pps = 50;
    State.sps = 5;
    return env;
}

/* What each Void target DOES, read from the game rather than from the
   target's own fold — so "Wraith output x1.6" is checked as "more Darkness
   per second", not as "the number is 1.6". `up` means more is better. */
const rates = (env) => env.game.getProductionRates(0, false);
const VOID_PROBES = {
    'void.automaton.wraith.output': { read: (env) => rates(env).darknessGross, better: 'up', what: 'Darkness/s gross' },
    'void.darkness.multiplier': { read: (env) => rates(env).darknessGross, better: 'up', what: 'Darkness/s gross' },
    'void.revenant.draw': { read: (env) => rates(env).darkness, better: 'up', what: 'Darkness/s net of Revenants' },
    'void.automaton.revenant.output': { read: (env) => rates(env).shadows, better: 'up', what: 'Shadows/s' },
    'void.shadow.multiplier': { read: (env) => rates(env).shadows, better: 'up', what: 'Shadows/s' },
    'void.automaton.phantom.output': { read: (env) => rates(env).echoes, better: 'up', what: 'Echoes/s' },
    'void.echo.multiplier': { read: (env) => rates(env).echoes, better: 'up', what: 'Echoes/s' },
    'void.automaton.nemesis.bonusScale': { read: (env) => rates(env).praiseGross, better: 'up', what: 'primordial Praise/s' },
    'void.automaton.wraith.cost': { read: (env) => env.game.getAutomatonCost('wraith'), better: 'down', what: 'next Wraith price' },
    'void.automaton.revenant.cost': { read: (env) => env.game.getAutomatonCost('revenant'), better: 'down', what: 'next Revenant price' },
    'void.automaton.phantom.cost': { read: (env) => env.game.getAutomatonCost('phantom'), better: 'down', what: 'next Phantom price' },
    'void.automaton.nemesis.cost': { read: (env) => env.game.getAutomatonCost('nemesis'), better: 'down', what: 'next Nemesis price' },
    'void.caps.darkness': { read: (env) => env.State.dimensions.void.resourceCaps.darkness, better: 'up', what: 'Darkness capacity' },
    'void.caps.shadows': { read: (env) => env.State.dimensions.void.resourceCaps.shadows, better: 'up', what: 'Shadow capacity' },
    'void.caps.echoes': { read: (env) => env.State.dimensions.void.resourceCaps.echoes, better: 'up', what: 'Echo capacity' },
    'void.click.power': { read: (env) => env.State.dimensions.void.manualClickPower, better: 'up', what: 'Void click power' },
};

/* Builds that carry the Void, found by search rather than pinned to a seed,
   so a pool change re-finds them instead of silently testing nothing. */
function findBuild(Reality, RealityPool, channel, level, accept) {
    const ids = voidIdsOf(RealityPool);
    for (let seed = 1; seed < 5000; seed++) {
        const build = Reality.generate(seed, level, channel);
        const v = build.entries.filter((e) => ids.has(e.id));
        if (accept(v, build)) return { seed, build, voidEntries: v };
    }
    return null;
}

check('Void entries are flagged by what they touch, and every pool kind has some', () => {
    /* The flag is what eligibility reads, so it has to be the truth: an
       entry that touches the Void without the flag would roll where the
       Void cannot matter, and a flagged entry that touched the primordial
       chain would be withheld from it for no reason. */
    const { RealityPool, ModifierTargets } = boot();
    for (const [list] of Object.entries(POOL_KINDS)) {
        for (const entry of RealityPool[list]) {
            const targets = (entry.mods || []).map((m) => m.target);
            const touches = targets.some((t) => t.startsWith('void.'));
            assert.equal(touches, entry.dimension === 'void',
                `${entry.id}: touches the Void ${touches}, flagged ${entry.dimension === 'void'}`);
            if (entry.dimension === 'void') {
                for (const t of targets) {
                    assert.ok(t.startsWith('void.') && ModifierTargets[t], `${entry.id} targets "${t}"`);
                }
            }
        }
    }
    const v = voidEntriesOf(RealityPool);
    for (const kind of Object.values(POOL_KINDS)) {
        assert.ok(v.some((e) => e.kind === kind), `no Void ${kind} in the pool`);
    }
    assert.ok(v.length >= 10, `only ${v.length} Void entries — the Void is still barely covered`);
});

check('Void entries only roll where they are eligible', () => {
    const { Reality, RealityPool, RealityChannels } = boot();
    const ids = voidIdsOf(RealityPool);
    const below = Reality.VOID_FIRST_RELEASE - 1;
    assert.ok(below >= 0, 'fixture check: there is an ineligible level to roll at');

    for (const channel of Object.keys(RealityChannels)) {
        const spec = RealityChannels[channel];
        for (let seed = 1; seed <= 300; seed++) {
            const build = Reality.generate(seed, below, channel);
            const leaked = build.entries.filter((e) => ids.has(e.id)).map((e) => e.id);
            assert.equal(leaked.length, 0, `${channel}/${seed} at level ${below} rolled ${leaked.join(', ')}`);
            /* Filtered before the draw, so the channel's counts still hold:
               an ineligible entry takes no slot. */
            const n = build.entries.filter((e) => e.kind === 'improvement').length;
            assert.ok(n >= spec.improvements[0] && n <= spec.improvements[1],
                `${channel}/${seed}: ${n} improvements, outside ${spec.improvements}`);
        }
    }

    // And where they are eligible, the Void is no longer a rare guest.
    const share = (channel, level) => {
        let hit = 0;
        for (let seed = 1; seed <= 300; seed++) {
            if (Reality.generate(seed, level, channel).entries.some((e) => ids.has(e.id))) hit++;
        }
        return hit / 300;
    };
    const stable = share('stable', Reality.VOID_FIRST_RELEASE);
    const nightly = share('nightly', 9);
    assert.ok(stable > 0.4, `only ${Math.round(stable * 100)}% of first-release Stable builds touch the Void`);
    assert.ok(nightly > 0.85, `only ${Math.round(nightly * 100)}% of Nightly builds touch the Void`);

    const seen = new Set();
    for (let seed = 1; seed <= 400; seed++) {
        for (const e of Reality.generate(seed, 9, 'nightly').entries) if (ids.has(e.id)) seen.add(e.id);
    }
    assert.equal(seen.size, ids.size, `never rolled: ${[...ids].filter((id) => !seen.has(id)).join(', ')}`);
});

check('the eligibility premise: a run that can ship has walked past the Veil, which a reboot reseals', () => {
    /* Reality.eligible() reads the prestige level, not the save. That is
       only honest while (a) any run that can ship can afford Breach the Veil
       many times over, and (b) a roll never sees an unlocked Void. Both are
       read from the live tables here, so moving either fails this test. */
    const { State, game, Reality, UpgradeList } = boot();
    const veil = UpgradeList.find((u) => u.id === 'void_unlock');
    assert.ok(veil?.cost?.souls > 0, 'fixture check: Breach the Veil is priced in Souls');

    State.totalDivinityPoints = 0;
    const floor = game.getPrestigeThreshold();
    assert.ok(floor >= veil.cost.souls * 1000,
        `the lowest reboot bar (${floor}) is within 1000x of the Veil (${veil.cost.souls})`);
    State.totalDivinityPoints = 40;
    assert.ok(game.getPrestigeThreshold() > floor, 'the bar should only rise from its floor');
    State.totalDivinityPoints = 0;

    State.reality = { runSeed: 77, channel: 'stable', build: null, shipped: 0 };
    State.prestigeLevel = 0;
    game.bootstrapModifiers(0);
    veil.effect();
    assert.equal(State.dimensions.void.unlocked, true, 'fixture check: the Veil was breached');

    State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 2;
    game.performPrestige();
    assert.equal(State.prestigeLevel, 1, 'fixture check: the reboot happened');
    assert.equal(State.dimensions.void.unlocked, false, 'the reboot left the Void open for the next roll');
    assert.ok(State.prestigeLevel >= Reality.VOID_FIRST_RELEASE, 'the first release is not eligible for Void lines');
});

check('every Void entry moves the Void the way its note says', () => {
    /* Improvements help, known issues, regressions and deprecations hurt —
       measured as the game's own consequence (a rate, a price, a capacity)
       with the entry applied against the same fixture without it. */
    const { RealityPool } = boot();
    const entries = voidEntriesOf(RealityPool);
    assert.ok(entries.length > 0, 'fixture check: there are Void entries to test');
    for (const entry of entries) {
        const env = voidFixture();
        const probes = entry.mods.map((m) => {
            const probe = VOID_PROBES[m.target];
            assert.ok(probe, `${entry.id}: no consequence probe for "${m.target}" — add one to VOID_PROBES`);
            return probe;
        });
        const before = probes.map((p) => p.read(env));
        env.Reality.apply({ entries: [entry] }, 0);
        assert.ok(env.Modifiers.records.some((r) => r.source?.id === entry.id),
            `fixture check: ${entry.id} registered no records`);
        const after = probes.map((p) => p.read(env));

        probes.forEach((probe, i) => {
            assert.ok(Number.isFinite(before[i]) && Number.isFinite(after[i]),
                `${entry.id}: ${probe.what} is not a number (${before[i]} -> ${after[i]})`);
            assert.notEqual(after[i], before[i], `${entry.id} did not move ${probe.what}`);
            const improved = probe.better === 'up' ? after[i] > before[i] : after[i] < before[i];
            const wanted = entry.kind === 'improvement';
            assert.equal(improved, wanted,
                `${entry.kind} ${entry.id} ${improved ? 'improved' : 'worsened'} ${probe.what}: ${before[i]} -> ${after[i]}`);
        });
    }
});

check('Void patch costs are priced off Void capacity excluding the build', () => {
    const env = voidFixture();
    const { State, Reality, Modifiers, RealityPool } = env;
    const entries = voidEntriesOf(RealityPool);
    const priced = entries.filter((e) => e.kind === 'issue' && VOID_CURRENCIES.includes(e.patchCost?.resource));
    assert.ok(priced.length >= 3, `only ${priced.length} Void issues are priced in Void currencies`);

    // A vault rank's worth of capacity, so the reference is not the pristine base.
    for (const res of VOID_CURRENCIES) {
        Modifiers.add({ target: `void.caps.${res}`, op: 'add', value: 1200, scope: 'run', source: { kind: 'test', id: `vault_${res}` } });
    }
    Modifiers.commit(0);
    const capsWithout = { ...State.dimensions.void.resourceCaps };

    // Every Void entry at once: issues that shrink a Void cap, improvements that grow one.
    const build = { entries: entries.map((e) => ({ ...e })) };
    Reality.apply(build, 0);
    const capsWith = { ...State.dimensions.void.resourceCaps };
    const moved = VOID_CURRENCIES.filter((r) => capsWith[r] !== capsWithout[r]);
    assert.ok(moved.length >= 2, `fixture check: the build moved only ${moved.join(', ') || 'no'} Void caps`);

    const withBuild = Object.fromEntries(priced.map((e) => [e.id, Reality.patchCostOf(build, e.id)]));
    for (const e of priced) {
        const cost = withBuild[e.id];
        assert.equal(cost.resource, e.patchCost.resource);
        assert.equal(cost.bag, State.dimensions.void.resources, `${e.id} is billed against the wrong bag`);
        assert.ok(cost.amount > 0, `${e.id} is free`);
    }

    Modifiers.dropScope('build');
    Modifiers.commit(0);
    for (const e of priced) {
        assert.equal(Reality.patchCostOf(build, e.id).amount, withBuild[e.id].amount,
            `the build moved the price of its own patch (${e.id})`);
    }
});

check('a Void-priced patch waits for the Veil, then lands and drops its records', () => {
    const env = voidFixture();
    const { State, Reality, RealityPool, Modifiers, game } = env;
    const entry = voidEntriesOf(RealityPool).find((e) => e.kind === 'issue' && e.patchCost?.resource === 'darkness');
    assert.ok(entry, 'fixture check: a Void issue priced in Darkness');
    State.reality.build = { version: 'test', channel: 'stable', seed: 1, prestigeLevel: 4, entries: [{ ...entry }] };
    State.reality.instability = 0;
    Reality.apply(State.reality.build, 0);

    // A fresh run: the Veil resealed, nothing banked.
    State.dimensions.void.unlocked = false;
    State.dimensions.void.resources.darkness = 0;
    assert.equal(game.patchKnownIssue(entry.id, 0), false, 'patched with the Veil sealed and no Darkness');

    State.dimensions.void.unlocked = true;
    const cost = Reality.patchCostOf(State.reality.build, entry.id);
    State.dimensions.void.resources.darkness = cost.amount;
    assert.equal(game.patchKnownIssue(entry.id, 0), true);
    assert.equal(Math.round(State.dimensions.void.resources.darkness), 0, 'the Darkness was not spent');
    assert.equal(Modifiers.records.filter((r) => r.source?.id === entry.id).length, 0, 'records survived the patch');
});

check('a Void-carrying build re-derives identically on reload, patched flags and all', () => {
    const { Reality, RealityPool } = boot();
    const found = findBuild(Reality, RealityPool, 'nightly', 6,
        (v) => v.length >= 2 && v.some((e) => e.kind === 'issue'));
    assert.ok(found, 'fixture check: a Nightly build with a Void issue');

    const first = boot();
    first.State.reality = { runSeed: found.seed, channel: 'nightly', build: null, shipped: 0 };
    first.State.prestigeLevel = 6;
    first.game.bootstrapModifiers(0);
    const issue = first.State.reality.build.entries.find((e) => e.kind === 'issue' && e.dimension === 'void');
    const cost = first.Reality.patchCostOf(first.State.reality.build, issue.id);
    cost.bag[cost.resource] = cost.amount;
    assert.equal(first.game.patchKnownIssue(issue.id, 0), true, 'fixture check: the Void issue was patched');
    const records = (env) => env.Modifiers.records.filter((r) => r.scope === 'build')
        .map((r) => `${r.source.id}:${r.target}:${r.op}:${r.value}`).sort();
    const expected = records(first);

    // The save, as it reaches disk and comes back.
    const saved = JSON.parse(JSON.stringify(first.State.reality));
    const reload = boot();
    reload.State.reality = saved;
    reload.State.prestigeLevel = 6;
    reload.game.bootstrapModifiers(0);

    assert.equal(JSON.stringify(reload.State.reality.build.entries), JSON.stringify(first.State.reality.build.entries));
    assert.equal(reload.State.reality.build.entries.find((e) => e.id === issue.id).patched, true);
    // As JSON: vm-built arrays carry another realm's prototype.
    assert.equal(JSON.stringify(records(reload)), JSON.stringify(expected), 'the reloaded build applied a different set of records');
    assert.ok(!records(reload).some((r) => r.startsWith(`${issue.id}:`)), 'the patched Void issue came back');
});

check('an Archived replay of a Void-heavy build is exact', () => {
    const { Reality, RealityPool } = boot();
    const LEVEL = 9;
    const found = findBuild(Reality, RealityPool, 'nightly', LEVEL,
        (v) => v.length >= 3 && v.some((e) => e.kind === 'issue') &&
            v.some((e) => e.kind === 'regression' || e.kind === 'deprecation'));
    assert.ok(found, 'fixture check: a Void-heavy Nightly build exists');

    const { State, game } = boot();
    State.reality = { runSeed: found.seed, channel: 'nightly', build: null, shipped: 0, history: [] };
    State.prestigeLevel = LEVEL;
    game.bootstrapModifiers(0);
    const original = JSON.stringify(State.reality.build.entries);
    assert.equal(original, JSON.stringify(found.build.entries), 'fixture check: the game rolled the build searched for');

    // Ship it, so it is on file the way a player's would be.
    State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 2;
    game.performPrestige();
    assert.equal(State.prestigeLevel, LEVEL + 1, 'fixture check: the reboot happened');
    assert.ok(game.archivedBuilds().some((r) => r.level === LEVEL), 'the Void-heavy build was not recorded');

    // Much later, and through a save round trip, replay it.
    State.prestigeLevel = 20;
    State.reality = JSON.parse(JSON.stringify(State.reality));
    game.normaliseArchive();
    assert.equal(game.selectArchivedBuild(LEVEL), true, 'fixture check: the archive offered the build');
    const replay = game.rollNextBuild(0);
    assert.equal(replay.channel, 'archived');
    assert.equal(JSON.stringify(replay.entries), original, 'the replay is not the build that shipped');

    // And the replay itself survives a reload at the CURRENT level unchanged.
    const again = Reality.rematerialise(JSON.parse(JSON.stringify(State.reality)), State.prestigeLevel);
    assert.equal(JSON.stringify(again.entries), original, 'the replay re-derived differently on reload');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exitCode = 1;
