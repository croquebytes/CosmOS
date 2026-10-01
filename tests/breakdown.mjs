#!/usr/bin/env node
/**
 * The production breakdown: "where does this number come from?"
 *
 *   node tests/breakdown.mjs
 *
 * The panel is only worth having if it cannot lie. This project has already
 * shipped three hand-written copies of the production formula on screen, and
 * all three had drifted from the real one (see the comment in
 * ui.syncResources). So the breakdown is not a fourth copy: computeProduction
 * records its own fold into a ledger, and explainProductionRate dresses that
 * record. These tests hold it to that, in three ways:
 *
 *   - EQUALITY. explain(r).value === getProductionRates()[r], exactly, from
 *     two separate evaluations. Exact rather than within an epsilon because
 *     both evaluations run the same operations on the same doubles in the same
 *     order — there is no float reassociation to forgive, and an epsilon here
 *     would hide precisely the drift the panel exists to rule out.
 *   - REPLAY. The test re-does the arithmetic from the steps alone, in its own
 *     code, and demands every running total match. A dropped factor, a
 *     reordered fold or a missing throttle cannot survive this even when the
 *     final value still happens to be right — and the final value is the only
 *     thing EQUALITY can see.
 *   - MEANING. A replay-consistent explanation can still call a lapsed path
 *     "full" or bury the cascade. Those are asserted by name.
 *
 * Harness traps inherited from tests/certification.mjs: granting Divinity
 * raises the reboot bar, so only tests that buy mandates ask for it; and the
 * default `ui` is a Proxy of noops, which is fine here because the breakdown
 * is game-side and DOM-free.
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
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map,
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
    return vm.runInContext(
        '({ State, Modifiers, ModifierOps, Reality, game, Economy, MandateList, UpgradeList, RepeatableList })', ctx,
    );
}

function game_({ divinity = 0 } = {}) {
    const env = boot();
    env.State.reality = {
        runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    env.State.totalDivinityPoints = divinity;
    return env;
}

const RATES = ['praise', 'offerings', 'souls', 'darkness', 'shadows', 'echoes'];
const PRIMORDIAL_CAPS = ['praise', 'offerings', 'souls'];
const VOID_CAPS = ['darkness', 'shadows', 'echoes'];

/* Re-does a production line's arithmetic from its steps alone. Returns the
   final value; throws on the first running total that does not match. */
function replayLine(env, steps, path) {
    assert.ok(steps.length > 0, `${path}: an explained line has no steps`);
    let acc;
    steps.forEach((step, index) => {
        const where = `${path}[${index}] ${step.key}`;
        if (index === 0) {
            assert.equal(step.op, 'base', `${where}: a line must open on its base`);
            acc = step.value;
        } else if (step.op === 'sub') {
            acc = acc - step.value;
        } else {
            assert.equal(step.op, 'mul', `${where}: unexpected op ${step.op}`);
            acc = acc * step.value;
        }
        assert.equal(step.running, acc, `${where}: running total ${step.running}, replay says ${acc}`);

        if (step.key.startsWith('@')) {
            const inner = replayLine(env, step.children || [], `${where} >`);
            assert.equal(inner, step.value, `${where}: sub-product explains ${inner} but ${step.value} was used`);
        } else if (step.key.startsWith('target:')) {
            const folded = replayFold(env, step.children || [], `${where} >`);
            assert.equal(folded, step.fold, `${where}: registry steps fold to ${folded}, explanation says ${step.fold}`);
            /* The `|| 1` fallback in getProductionRates: a fold of 0 on an
               output target is read as 1. Anything else must be the fold. */
            assert.ok(step.value === folded || (step.value === 1 && !folded),
                `${where}: the factor used (${step.value}) is not what the registry folds to (${folded})`);
        }
    });
    return acc;
}

/* Re-does a registry fold, including the declared floor Modifiers.commit
   applies last. */
function replayFold(env, steps, path) {
    assert.ok(steps.length > 0, `${path}: a fold has no base`);
    assert.equal(steps[0].op, 'base', `${path}: a fold must open on its base`);
    let acc = steps[0].value;
    assert.equal(steps[0].running, acc, `${path}[0]: base running total`);
    for (let i = 1; i < steps.length; i++) {
        const step = steps[i];
        if (step.kind === 'floor') acc = Math.max(acc, step.value);
        else acc = env.ModifierOps[step.op](acc, step.value);
        assert.equal(step.running, acc, `${path}[${i}] ${step.label}: running ${step.running}, replay says ${acc}`);
    }
    return acc;
}

/* The three properties, over every rate and every cap the state shows. */
function holds(env, label, { now = Date.now() } = {}) {
    const rates = env.game.getProductionRates(now, true);
    for (const resource of RATES) {
        const ex = env.game.explainProductionRate(resource, now);
        assert.equal(ex.value, rates[resource],
            `${label}: ${resource} explains ${ex.value} but the game produces ${rates[resource]}`);
        if (ex.sealed) {
            assert.equal(env.State.dimensions.void.unlocked, false, `${label}: ${resource} sealed while the Void is open`);
            continue;
        }
        const replayed = replayLine(env, ex.steps, `${label}/${resource}`);
        assert.equal(replayed, ex.value, `${label}: ${resource} steps replay to ${replayed}, not ${ex.value}`);
    }
    const caps = env.State.dimensions.void.unlocked ? [...PRIMORDIAL_CAPS, ...VOID_CAPS] : PRIMORDIAL_CAPS;
    for (const resource of caps) {
        const ex = env.game.explainCap(resource, now);
        const actual = PRIMORDIAL_CAPS.includes(resource)
            ? env.State.resourceCaps[resource]
            : env.State.dimensions.void.resourceCaps[resource];
        assert.equal(ex.value, actual, `${label}: ${resource} cap explains ${ex.value} but is ${actual}`);
        assert.equal(replayFold(env, ex.steps, `${label}/cap.${resource}`), actual,
            `${label}: ${resource} cap steps do not replay to the cap`);
    }
}

/* Every registry step anywhere under a rate explanation. */
function registrySteps(ex) {
    const out = [];
    const walk = (steps) => {
        for (const step of steps || []) {
            if (step.key?.startsWith('target:')) {
                for (const child of step.children || []) out.push({ ...child, target: step.key.slice(7) });
            }
            if (step.children && step.key?.startsWith('@')) walk(step.children);
        }
    };
    walk(ex.steps);
    return out;
}

function findStep(steps, key) {
    for (const step of steps || []) {
        if (step.key === key) return step;
        const inner = step.key?.startsWith('@') ? findStep(step.children, key) : null;
        if (inner) return inner;
    }
    return null;
}

/* A run with something in every slot: ranks, Thrones, upgrades, repeatables
   and a non-trivial Reality build. */
function midRun(env) {
    const { State, game } = env;
    if (!(State.prestigeLevel > 0)) {
        // Past the opening build, so the run carries a real Reality build.
        State.prestigeLevel = 2;
        State.reality.build = env.Reality.generate(20260726, 2, 'stable');
        env.Reality.apply(State.reality.build, Date.now());
    }
    State.unlockedOfferings = true;
    for (const [type, n] of [['seraph', 64], ['throne', 9], ['cherub', 30], ['dominion', 4]]) {
        game.applyAutomatonPurchase(type, n);
    }
    State.resources.praise = 1e12;
    State.resources.offerings = 1e12;
    State.resources.souls = 1e12;
    for (const upgrade of env.UpgradeList) {
        const v = upgrade.cost || {};
        if (Object.keys(v).some((r) => ['darkness', 'shadows', 'echoes'].includes(r))) continue;
        game.purchaseUpgrade(upgrade.id);
        State.resources.praise = 1e12;
        State.resources.offerings = 1e12;
        State.resources.souls = 1e12;
    }
    for (const id of ['praise_refinement', 'automaton_drill', 'praise_vault', 'praise_vault', 'soul_vault']) {
        game.purchaseRepeatable(id);
    }
    State.standingDoctrine = 3;
    State.achievementBonuses = { ...(State.achievementBonuses || {}), praiseGain: 1.005, globalGain: 1.02 };
    State.resources.praise = 5000;
    return env;
}

function openVoid(env) {
    const vd = env.State.dimensions.void;
    vd.unlocked = true;
    for (const [type, n] of [['wraith', 40], ['revenant', 8], ['phantom', 25], ['nemesis', 3]]) {
        env.game.applyAutomatonPurchase(type, n);
    }
    vd.resources.darkness = 500;
    vd.repeatables = { ...(vd.repeatables || {}), entropy_drill: 2, void_refinement: 3 };
    env.State.nullDoctrine = 2;
    return env;
}

let passed = 0;
const check = (name, fn) => {
    try {
        fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (error) {
        console.log(`  FAIL  ${name}\n        ${error.message}`);
        process.exitCode = 1;
    }
};

console.log('\nProduction breakdown\n');

/* ── Equality and replay, across the states that matter ─────────────────── */

check('a fresh game explains every rate and cap exactly', () => {
    const env = game_();
    holds(env, 'fresh');
    const praise = env.game.explainProductionRate('praise');
    assert.equal(praise.value, 0, 'fixture check: nothing produces yet');
    assert.equal(env.game.explainProductionRate('darkness').sealed, true,
        'a sealed Void should say so rather than invent a fold');
});

check('a mid-run economy explains every rate and cap exactly', () => {
    const env = midRun(game_());
    const rates = env.game.getProductionRates();
    assert.ok(rates.praise > 0 && rates.offerings > 0 && rates.souls > 0, 'fixture check: all three produce');
    holds(env, 'mid-run');
});

check('the base line is count × per-unit output', () => {
    const env = midRun(game_());
    const ex = env.game.explainProductionRate('praise');
    const base = findStep(ex.steps, 'base.pps');
    assert.ok(base, 'no base step for Praise');
    assert.equal(base.group, 'base');
    assert.equal(base.count, env.State.automatons.seraphCount);
    assert.equal(base.count * base.perUnit, base.value, 'count × per-unit does not give the base');
});

check('overclock, streak and Divine Intervention are explained as transients', () => {
    const env = midRun(game_());
    const now = Date.now();
    const loops = env.State.loopSystems;
    loops.overclock.active = true;
    loops.overclock.endsAt = now + 20_000;
    loops.miracleStreak = 9;
    env.State.skills.divineIntervention.active = true;
    env.State.skills.divineIntervention.endsAt = now + 20_000;
    holds(env, 'transients', { now });

    const ex = env.game.explainProductionRate('praise', now);
    const overclock = findStep(ex.steps, 'transient.overclock');
    const streak = findStep(ex.steps, 'transient.streak');
    const intervention = findStep(ex.steps, 'skill.divineIntervention');
    assert.equal(overclock.value, env.game.getOverclockProductionMultiplier(now));
    assert.ok(overclock.value > 1, 'fixture check: overclock is live');
    assert.equal(overclock.group, 'transient');
    assert.equal(streak.value, env.game.getStreakProductionMultiplier());
    assert.equal(streak.count, 9);
    assert.equal(intervention.value, 2);

    // And the explanation must see the SAME transients the readout does: an
    // explanation that quietly folded without them would be 3x too small.
    assert.ok(ex.value > env.game.getProductionRates(now, false).praise * 2.9,
        'the explanation left the transients out of its own total');
});

for (const [tierIndex, step] of [[1, 0], [2, 1], [3, 2]]) {
    check(`cascade tier ${tierIndex} shows its throttle in every stack it bites`, () => {
        const env = openVoid(midRun(game_()));
        const tier = env.Economy.cascadeTiers[step];
        env.State.reality.instability = tier.at;
        env.game.syncCascade();
        assert.equal(env.game.cascadeState().tier, tierIndex, 'fixture check: tier engaged');
        holds(env, `tier ${tierIndex}`);

        for (const resource of RATES) {
            const throttles = registrySteps(env.game.explainProductionRate(resource))
                .filter((s) => s.kind === 'cascade');
            assert.equal(throttles.length, 1, `${resource}: expected one throttle row, found ${throttles.length}`);
            assert.equal(throttles[0].value, tier.output,
                `${resource}: the throttle shows ×${throttles[0].value}, the tier is ×${tier.output}`);
            assert.match(throttles[0].label, new RegExp(tier.label), `${resource}: the throttle row does not name the tier`);
        }
    });
}

check('a recovered build shows no throttle at all', () => {
    const env = midRun(game_());
    env.State.reality.instability = env.Economy.cascadeTiers[1].at;
    env.game.syncCascade();
    env.State.reality.instability = 0;
    env.game.syncCascade();
    holds(env, 'recovered');
    for (const resource of ['praise', 'offerings', 'souls']) {
        const throttles = registrySteps(env.game.explainProductionRate(resource)).filter((s) => s.kind === 'cascade');
        assert.equal(throttles.length, 0, `${resource}: a stale throttle is still on display`);
    }
});

/* ── Certification: full against residue ───────────────────────────────── */

const CREATION = ['creation_root', 'creation_t2_left', 'creation_t2_right', 'creation_t3', 'creation_ultimate'];
const MAINTENANCE = ['maintenance_root', 'maintenance_t2_left', 'maintenance_t2_right', 'maintenance_t3'];

function mandateRows(env, resource = 'praise') {
    return registrySteps(env.game.explainProductionRate(resource)).filter((s) => s.kind === 'mandate');
}

check('a certified path is explained as full value', () => {
    const env = game_({ divinity: 5000 });
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.applyCertification();
    env.State.pps = 10;
    holds(env, 'certified');

    const rows = mandateRows(env);
    assert.ok(rows.length >= 4, `fixture check: creation mandates fold into Praise (${rows.length})`);
    for (const row of rows) {
        assert.equal(row.branch, 'creation');
        assert.equal(row.status, 'full', `${row.label} is certified but shown as ${row.status}`);
        const mandate = env.MandateList.find((m) => m.id === row.sourceId);
        const declared = mandate.mods.find((m) => m.target === row.target);
        assert.equal(row.value, declared.value, `${row.label}: a full row should carry the declared value`);
    }
});

check('a lapsed path is explained as residue, at the residue value', () => {
    const env = game_({ divinity: 5000 });
    for (const id of [...CREATION, ...MAINTENANCE]) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.certifyOn('maintenance');
    env.game.applyCertification();
    env.State.pps = 10;
    holds(env, 'lapsed');

    const rows = mandateRows(env);
    const lapsed = rows.filter((r) => r.branch === 'creation');
    assert.ok(lapsed.length >= 4, 'fixture check: the lapsed path still folds into Praise');
    for (const row of lapsed) {
        assert.equal(row.status, 'residue', `${row.label} has lapsed but is shown as ${row.status}`);
        const mandate = env.MandateList.find((m) => m.id === row.sourceId);
        const declared = mandate.mods.find((m) => m.target === row.target);
        assert.equal(row.value, env.game.residueValue(declared, env.Economy.certificationResidue),
            `${row.label}: a residue row should carry the residue, not the declared value`);
    }
    // Maintenance is the live path now; anything of it under Praise is full.
    for (const row of rows.filter((r) => r.branch === 'maintenance')) {
        assert.equal(row.status, 'full', `${row.label} is certified but shown as ${row.status}`);
    }
});

check('re-certifying a lapsed path relabels it full', () => {
    const env = game_({ divinity: 5000 });
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.certifyOn('maintenance');
    env.game.applyCertification();
    env.game.certifyOn('creation');
    env.game.applyCertification();
    env.State.pps = 10;
    holds(env, 're-certified');
    for (const row of mandateRows(env)) assert.equal(row.status, 'full', `${row.label} still shown as ${row.status}`);
});

/* ── The Throne draw ───────────────────────────────────────────────────── */

check('the Throne draw is a subtraction from gross Praise', () => {
    const env = midRun(game_());
    const rates = env.game.getProductionRates();
    assert.ok(rates.throneDraw > 0, 'fixture check: Thrones are drawing');
    const ex = env.game.explainProductionRate('praise');
    const last = ex.steps[ex.steps.length - 1];
    assert.equal(last.op, 'sub', 'the draw is not the last, subtracting step');
    assert.equal(last.group, 'draw');
    assert.equal(last.value, rates.throneDraw, 'the draw shown is not the draw taken');
    assert.equal(ex.steps[0].value, rates.praiseGross, 'gross Praise is not what the draw is taken from');
    holds(env, 'throne-banked');
});

check('a dry bank throttles the draw, and the explanation says so', () => {
    const env = midRun(game_());
    env.State.resources.praise = 0;
    // Enough Thrones to want three times what the Seraphs make.
    const gross = env.game.getProductionRates().praiseGross;
    env.game.applyAutomatonPurchase('throne', Math.ceil((3 * gross) / env.Economy.thronePraiseDraw));
    const rates = env.game.getProductionRates();
    assert.ok(rates.throneActivity > 0 && rates.throneActivity < 1, `fixture check: activity ${rates.throneActivity}`);
    holds(env, 'throne-dry');
    const activity = findStep(env.game.explainProductionRate('praise').steps, 'scalar.throneActivity');
    assert.equal(activity.value, rates.throneActivity);
    assert.match(activity.note, /bank dry/);
    // Offerings run on the same activity, and their explanation must agree.
    assert.equal(findStep(env.game.explainProductionRate('offerings').steps, 'scalar.throneActivity').value,
        rates.throneActivity);
});

/* ── The Void ──────────────────────────────────────────────────────────── */

check('an open Void explains Darkness, Shadows and Echoes exactly', () => {
    const env = openVoid(midRun(game_()));
    const rates = env.game.getProductionRates();
    assert.ok(rates.darkness !== 0 && rates.shadows > 0 && rates.echoes > 0, 'fixture check: the Void produces');
    holds(env, 'void');
    const darkness = env.game.explainProductionRate('darkness');
    assert.equal(darkness.steps[darkness.steps.length - 1].group, 'draw', 'the Revenant draw is not shown as a draw');
    // Nemesis and Null Doctrine pay into the primordial chain, never the Void's.
    assert.equal(findStep(darkness.steps, 'bonus.nemesis'), null, 'the Void is shown feeding itself');
    assert.ok(findStep(env.game.explainProductionRate('praise').steps, 'bonus.nemesis'));
});

check('a dry Darkness bank still explains exactly', () => {
    const env = openVoid(midRun(game_()));
    env.State.dimensions.void.resources.darkness = 0;
    const gross = env.game.getProductionRates().darknessGross;
    env.game.applyAutomatonPurchase('revenant', Math.ceil((3 * gross) / env.Economy.revenantDarknessDraw));
    const activity = env.game.getProductionRates().revenantDraw / (gross * 3);
    assert.ok(activity > 0 && activity < 1, `fixture check: Revenants are starved (${activity})`);
    holds(env, 'void-dry');
    assert.match(findStep(env.game.explainProductionRate('darkness').steps, 'scalar.revenantActivity').note, /bank dry/);
});

/* ── Storage caps ──────────────────────────────────────────────────────── */

check('a cap mixing mulfloor and add is explained in fold order', () => {
    const env = game_({ divinity: 5000 });
    for (const id of ['maintenance_root', 'maintenance_t2_left', 'maintenance_t2_right',
        'maintenance_t3', 'maintenance_ultimate', 'maintenance_t4']) {
        env.game.purchaseMandate(id);
    }
    env.game.certifyOn('maintenance');
    env.game.applyCertification();
    env.State.resources.praise = 1e9;
    env.game.purchaseRepeatable('praise_vault');
    const ops = env.game.explainCap('praise').steps.map((s) => s.op);
    assert.ok(ops.includes('mulfloor') && ops.includes('add'), `fixture check: both ops present (${ops})`);
    holds(env, 'cap-order');
});

check('a cap pinned by its playability floor shows the floor', () => {
    const env = game_();
    env.Modifiers.add({ target: 'caps.praise', op: 'mul', value: 0.1, source: { kind: 'build', id: 'test_floor' }, label: 'test' });
    env.Modifiers.commit(Date.now());
    const ex = env.game.explainCap('praise');
    const floor = ex.steps.find((s) => s.kind === 'floor');
    assert.ok(floor, 'the floor is binding but not shown — the steps would not add up to the cap');
    assert.equal(ex.value, env.State.resourceCaps.praise);
    holds(env, 'floor');
});

/* ── Sources the panel has to name ─────────────────────────────────────── */

check('scars, build entries and the adversary patch keep their source kind', () => {
    const env = midRun(game_());
    env.State.reality.scars = ['iss_vault_corrupt', 'iss_soul_partition'];
    env.game.applyScars();
    env.Modifiers.add({
        id: 'adversary_patch_toll', target: 'praise.multiplier', op: 'mul', value: 0.9,
        scope: 'permanent', source: 'adversary_patch', label: 'PATCH_NULL_RESTORE — throughput toll',
    });
    env.Modifiers.commit(Date.now());
    holds(env, 'sources');

    const capKinds = new Set(env.game.explainCap('praise').steps.map((s) => s.kind));
    assert.ok(capKinds.has('scar'), 'a filed scar is not labelled as one');
    const kinds = new Set(registrySteps(env.game.explainProductionRate('praise')).map((s) => s.kind));
    assert.ok(kinds.has('adversary_patch'), 'a bare-string source lost its kind');
    assert.ok(kinds.has('upgrade'), 'upgrades are not labelled');
    assert.ok(kinds.has('divinity'), 'the Divinity base is not labelled');
    const buildRows = registrySteps(env.game.explainProductionRate('praise'))
        .concat(registrySteps(env.game.explainProductionRate('souls')))
        .filter((s) => s.kind === 'build');
    for (const row of buildRows) assert.ok(row.entryKind, `build row ${row.label} does not say what kind of entry it is`);
});

check('a rate at 1e18 still explains exactly', () => {
    const env = midRun(game_());
    env.Modifiers.add({ target: 'praise.multiplier', op: 'mul', value: 3.7e14, source: { kind: 'upgrade', id: 'scale_test' }, label: 'scale' });
    env.Modifiers.commit(Date.now());
    const rates = env.game.getProductionRates();
    assert.ok(rates.praise > 1e18, `fixture check: ${rates.praise}`);
    holds(env, '1e18');
});

check('explaining is free of side effects', () => {
    const env = openVoid(midRun(game_()));
    env.State.reality.instability = env.Economy.cascadeTiers[0].at;
    env.game.syncCascade();
    env.game.getProductionRates(); // let lazy normalisers run once
    const state = JSON.stringify(env.State);
    const log = JSON.stringify(env.Modifiers.serialize());
    for (const resource of RATES) env.game.explainProductionRate(resource);
    for (const resource of [...PRIMORDIAL_CAPS, ...VOID_CAPS]) env.game.explainCap(resource);
    assert.equal(JSON.stringify(env.State), state, 'explaining changed the game state');
    assert.equal(JSON.stringify(env.Modifiers.serialize()), log, 'explaining changed the modifier log');
});

check('a run through reboots explains exactly at every stop', () => {
    /* Not a fixture: the real tick, the real reboot, the real next build. */
    const env = midRun(game_());
    let now = Date.now();
    for (let reboot = 0; reboot < 3; reboot++) {
        for (let i = 0; i < 600; i++) {
            now += 1000;
            env.game.tick(1, now);
        }
        holds(env, `run ${reboot}`, { now });
        env.State.totalStats.soulsGained = Math.max(env.State.totalStats.soulsGained || 0, 5e6 * (reboot + 1) ** 3);
        const level = env.State.prestigeLevel;
        env.game.performPrestige({ confirmed: true, certifyOn: env.game.CERT_BRANCHES[reboot % 3] });
        // The harness trap this project keeps falling into: a refused reboot
        // returns quietly, and every assertion after it tests the old run.
        assert.equal(env.State.prestigeLevel, level + 1, `fixture check: reboot ${reboot} was refused`);
        midRun(env);
        holds(env, `after reboot ${reboot}`, { now });
    }
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`);
