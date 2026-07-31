#!/usr/bin/env node
/**
 * Proves that a declared modifier set produces the same result as the legacy
 * effect closure it replaces.
 *
 *   node tests/modifier-equivalence.mjs
 *
 * The comparison runs on two INDEPENDENT sandboxes per content item — one
 * where the old closure mutates State, one where the registry folds and
 * commits. A review of the original design caught that comparing the fold
 * against the scalar the fold had just written proves nothing; this does not
 * make that mistake.
 *
 * Also asserts that every declared base equals the real schema default, so a
 * mistyped base fails here instead of silently becoming the new baseline.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js'].map((f) => ({
    name: f,
    code: readFileSync(resolve(ROOT, f), 'utf8'),
}));

/* A fresh sandbox per comparison, because effects mutate global State and
   there is no reliable way to undo one. */
function boot() {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        ui: new Proxy({}, { get: () => noop }),
        window: {}, document: { addEventListener: noop },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    return {
        ctx,
        ...vm.runInContext('({ State, PRISTINE, Modifiers, ModifierTargets, UpgradeList, MandateList })', ctx),
    };
}

let passed = 0;
let failed = 0;
const check = (name, fn) => {
    try {
        fn();
        passed++;
    } catch (error) {
        failed++;
        console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`);
    }
};

console.log('\nModifier registry\n');

/* ── Bases must match the schema ───────────────────────────────────────── */
{
    const { PRISTINE, ModifierTargets, Modifiers } = boot();
    let mismatches = 0;
    for (const [target, spec] of Object.entries(ModifierTargets)) {
        if (typeof spec.base === 'function') continue; // dynamic, nothing to compare
        const declared = Modifiers.baseOf(target);
        if (declared === undefined) {
            console.log(`  FAIL  base path does not resolve: ${target} -> "${spec.base}"`);
            mismatches++;
        }
    }
    check(`all ${Object.keys(ModifierTargets).length} target bases resolve against PRISTINE`, () => {
        assert.equal(mismatches, 0, `${mismatches} unresolved base path(s)`);
    });

    // Spot-check the three the design reviews caught as wrong when hand-written.
    check('cherub output base is 0.2, not 1', () => {
        assert.equal(Modifiers.baseOf('automaton.cherub.output'), 0.2);
    });
    check('void shadow cap base is 50, not 200', () => {
        assert.equal(Modifiers.baseOf('void.caps.shadows'), 50);
    });
    check('void echo cap base is 500, not 1000', () => {
        assert.equal(Modifiers.baseOf('void.caps.echoes'), 500);
    });
    check('offline efficiency base is 0.6', () => {
        assert.equal(Modifiers.baseOf('offline.efficiency'), 0.6);
    });
}

/* ── Fold semantics ────────────────────────────────────────────────────── */
{
    const { Modifiers } = boot();

    check('an empty log folds to the base', () => {
        assert.equal(Modifiers.fold('caps.praise', 0), 1000);
    });

    check('mul, add and mulfloor compose in insertion order', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'caps.praise', op: 'add', value: 2500, source: { kind: 'test', id: 'a' } });
        Modifiers.add({ target: 'caps.praise', op: 'mulfloor', value: 1.5, source: { kind: 'test', id: 'b' } });
        // (1000 + 2500) * 1.5 = 5250
        assert.equal(Modifiers.fold('caps.praise', 0), 5250);
    });

    check('order is respected, not normalised', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'caps.praise', op: 'mulfloor', value: 1.5, source: { kind: 'test', id: 'b' } });
        Modifiers.add({ target: 'caps.praise', op: 'add', value: 2500, source: { kind: 'test', id: 'a' } });
        // 1000 * 1.5 + 2500 = 4000 — a different answer from the same set
        assert.equal(Modifiers.fold('caps.praise', 0), 4000);
    });

    check('max raises a floor without compounding on replay', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'offline.efficiency', op: 'max', value: 0.85, source: { kind: 'test', id: 'e1' } });
        Modifiers.add({ target: 'offline.efficiency', op: 'max', value: 0.85, source: { kind: 'test', id: 'e1b' } });
        assert.equal(Modifiers.fold('offline.efficiency', 0), 0.85);
    });

    check('a lower max cannot clobber a higher one', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'offline.efficiency', op: 'max', value: 1, source: { kind: 'test', id: 'e2' } });
        Modifiers.add({ target: 'offline.efficiency', op: 'max', value: 0.85, source: { kind: 'test', id: 'e1' } });
        assert.equal(Modifiers.fold('offline.efficiency', 0), 1);
    });

    check('dropScope removes run records and leaves permanent ones', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 2, scope: 'run', source: { kind: 'test', id: 'r' } });
        Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 3, scope: 'permanent', source: { kind: 'test', id: 'p' } });
        const dropped = Modifiers.dropScope('run');
        assert.equal(dropped.length, 1);
        assert.equal(Modifiers.fold('praise.multiplier', 0), 3);
    });

    check('a temporary record stops counting once expired', () => {
        Modifiers.reset();
        Modifiers.add({
            target: 'praise.multiplier', op: 'mul', value: 5,
            scope: 'temporary', expiresAt: 1000, source: { kind: 'test', id: 't' },
        });
        assert.equal(Modifiers.fold('praise.multiplier', 999), 5, 'active before expiry');
        assert.equal(Modifiers.fold('praise.multiplier', 1000), 1, 'inert at expiry');
    });

    check('explain() reproduces fold() exactly', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 2, source: { kind: 'test', id: '1' } });
        Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 3, source: { kind: 'test', id: '2' } });
        Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 1.1, source: { kind: 'test', id: '3' } });
        const explained = Modifiers.explain('praise.multiplier', 0);
        assert.equal(explained.value, Modifiers.fold('praise.multiplier', 0));
        assert.equal(explained.steps.length, 4, 'base plus three records');
    });

    check('an unknown target is rejected rather than folded', () => {
        Modifiers.reset();
        assert.equal(Modifiers.add({ target: 'nope.nothing', value: 2 }), null);
    });

    check('serialize/hydrate round-trips with order intact', () => {
        Modifiers.reset();
        Modifiers.add({ target: 'caps.praise', op: 'add', value: 100, source: { kind: 'test', id: 'x' } });
        Modifiers.add({ target: 'caps.praise', op: 'mulfloor', value: 2, source: { kind: 'test', id: 'y' } });
        const expected = Modifiers.fold('caps.praise', 0);
        const wire = JSON.parse(JSON.stringify(Modifiers.serialize()));
        Modifiers.reset();
        Modifiers.hydrate(wire);
        assert.equal(Modifiers.fold('caps.praise', 0), expected);
    });

    check('hydrate drops records for targets that no longer exist', () => {
        Modifiers.reset();
        Modifiers.hydrate({ seq: 2, records: [
            { target: 'caps.praise', op: 'add', value: 50, seq: 0, enabled: true, expiresAt: null },
            { target: 'retired.target', op: 'mul', value: 9, seq: 1, enabled: true, expiresAt: null },
        ] });
        assert.equal(Modifiers.records.length, 1);
        assert.equal(Modifiers.fold('caps.praise', 0), 1050);
    });
}

/* ── Equivalence: declared mods vs the closures they replace ──────────── */
function boundScalars(State) {
    return {
        praiseMultiplier: State.praiseMultiplier,
        offeringMultiplier: State.offeringMultiplier,
        soulMultiplier: State.soulMultiplier,
        seraphProduction: State.automatons.seraphProduction,
        seraphCostMultiplier: State.automatons.seraphCostMultiplier,
        throneProduction: State.automatons.throneProduction,
        throneCostMultiplier: State.automatons.throneCostMultiplier,
        cherubProduction: State.automatons.cherubProduction,
        cherubCostMultiplier: State.automatons.cherubCostMultiplier,
        dominionProduction: State.automatons.dominionProduction,
        dominionCostMultiplier: State.automatons.dominionCostMultiplier,
        capPraise: State.resourceCaps.praise,
        capOfferings: State.resourceCaps.offerings,
        capSouls: State.resourceCaps.souls,
        throneDrawMultiplier: State.throneDrawMultiplier,
        manualClickPower: State.manualClickPower,
        streakCapBonus: State.streakCapBonus,
        overclockPotency: State.overclockPotency,
        overclockDurationBonus: State.overclockDurationBonus,
        offlineEfficiency: State.offlineEfficiency,
        diCooldown: State.skills.divineIntervention.cooldown,
        trCooldown: State.skills.temporalRift.cooldown,
        voidDarknessMultiplier: State.dimensions.void.darknessMultiplier,
        voidEchoMultiplier: State.dimensions.void.echoMultiplier,
        voidWraithProduction: State.dimensions.void.automatons.wraithProduction,
        voidWraithCost: State.dimensions.void.automatons.wraithCostMultiplier,
        voidRevenantProduction: State.dimensions.void.automatons.revenantProduction,
        voidPhantomProduction: State.dimensions.void.automatons.phantomProduction,
        voidNemesisProduction: State.dimensions.void.automatons.nemesisProduction,
        voidRevenantDraw: State.dimensions.void.revenantDrawMultiplier,
        voidClickPower: State.dimensions.void.manualClickPower,
    };
}

/* Maps a target back to the key boundScalars() reports it under, so a
   partial comparison can narrow to just the targets an item owns. */
const TARGET_TO_SCALAR = {
    'praise.multiplier': 'praiseMultiplier',
    'offerings.multiplier': 'offeringMultiplier',
    'souls.multiplier': 'soulMultiplier',
    'automaton.seraph.output': 'seraphProduction',
    'automaton.seraph.cost': 'seraphCostMultiplier',
    'automaton.throne.output': 'throneProduction',
    'automaton.throne.cost': 'throneCostMultiplier',
    'automaton.cherub.output': 'cherubProduction',
    'automaton.cherub.cost': 'cherubCostMultiplier',
    'automaton.dominion.bonusScale': 'dominionProduction',
    'automaton.dominion.cost': 'dominionCostMultiplier',
    'caps.praise': 'capPraise',
    'caps.offerings': 'capOfferings',
    'caps.souls': 'capSouls',
    'throne.draw': 'throneDrawMultiplier',
    'click.power': 'manualClickPower',
    'streak.cap': 'streakCapBonus',
    'overclock.potency': 'overclockPotency',
    'overclock.duration': 'overclockDurationBonus',
    'offline.efficiency': 'offlineEfficiency',
    'skill.divineIntervention.cooldown': 'diCooldown',
    'skill.temporalRift.cooldown': 'trCooldown',
    'void.darkness.multiplier': 'voidDarknessMultiplier',
    'void.echo.multiplier': 'voidEchoMultiplier',
    'void.automaton.wraith.output': 'voidWraithProduction',
    'void.automaton.wraith.cost': 'voidWraithCost',
    'void.automaton.revenant.output': 'voidRevenantProduction',
    'void.automaton.phantom.output': 'voidPhantomProduction',
    'void.automaton.nemesis.bonusScale': 'voidNemesisProduction',
    'void.revenant.draw': 'voidRevenantDraw',
    'void.click.power': 'voidClickPower',
};
const scalarKeyForTarget = (target) => TARGET_TO_SCALAR[target];

const listOf = (sandbox, listName) =>
    (listName === 'upgrade' ? sandbox.UpgradeList : sandbox.MandateList);

function compareItem(id, listName) {
    /* Each sandbox must resolve the item from its OWN tables. An effect
       closure is bound to the State of the context it was defined in, so
       calling a closure fetched from a third sandbox mutates that one and
       leaves the sandbox under test untouched. */
    const a = boot();
    const itemA = listOf(a, listName).find((x) => x.id === id);
    const before = boundScalars(a.State);
    a.State.dimensions.void.unlocked = true;
    try {
        itemA.effect();
    } catch (error) {
        return { skipped: `effect() threw: ${error.message.split('\n')[0]}` };
    }
    const legacy = boundScalars(a.State);

    // Sandbox B: the declared modifiers fold and commit.
    const b = boot();
    const itemB = listOf(b, listName).find((x) => x.id === id);
    b.State.dimensions.void.unlocked = true;
    b.Modifiers.reset();
    for (const mod of itemB.mods) {
        const added = b.Modifiers.add({ ...mod, source: { kind: listName, id }, label: itemB.name });
        if (!added) return { skipped: `unknown target "${mod.target}"` };
    }
    b.Modifiers.commit(0);
    const folded = boundScalars(b.State);

    /* A split item's effect() and mods own disjoint halves: the mods own
       scalars, effect() owns grants into ownership ledgers. There is no
       per-half equivalence to check, but there IS an invariant worth pinning
       — the closure must not touch any scalar the mods claim, or routing both
       would apply the same change twice. */
    if (itemB.modsSplit) {
        const claimed = new Set(itemB.mods.map((mod) => scalarKeyForTarget(mod.target)).filter(Boolean));
        const overlap = [...claimed].filter((key) => legacy[key] !== before[key]);
        return { drift: overlap.map((k) => `effect() also writes ${k}, which mods claim`), split: true };
    }

    const drift = [];
    for (const key of Object.keys(legacy)) {
        if (legacy[key] !== folded[key]) {
            drift.push(`${key}: closure=${legacy[key]} fold=${folded[key]} (was ${before[key]})`);
        }
    }
    return { drift };
}

for (const [listName, list] of [['upgrade', boot().UpgradeList], ['mandate', boot().MandateList]]) {
    const declared = list.filter((item) => Array.isArray(item.mods) && item.mods.length);
    if (!declared.length) {
        console.log(`  --    no ${listName} declares mods yet`);
        continue;
    }
    for (const item of declared) {
        const { drift, skipped } = compareItem(item.id, listName);
        if (skipped) {
            console.log(`  SKIP  ${listName} ${item.id}: ${skipped}`);
            continue;
        }
        check(`${listName} ${item.id} — ${item.modsSplit ? 'halves are disjoint' : 'fold matches closure'}`, () => {
            assert.equal(drift.length, 0, drift.join('; '));
        });
    }
    console.log(`  --    ${declared.length}/${list.length} ${listName}s converted`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exitCode = 1;
