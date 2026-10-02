#!/usr/bin/env node
/**
 * Storage: the vaults actually stack, cost a share of what they extend, and
 * saves that paid for discarded ranks get them back without reordering the
 * fold.
 *
 * Background. For two sessions Modifiers.add minted the same id for every rank
 * of a storage repeatable, so rank 2 onwards was refused as a double-apply
 * while its cost was still charged. The whole economy sat under a ~7,000
 * Praise ceiling, and the prestige curve was tuned beneath it. The 2026-09-30
 * session fixed the id, priced vaults as a fraction of the vault, and re-tuned
 * prestige on top (measurements in js/state.js, Economy).
 *
 *   node tests/storage.mjs
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
    const env = vm.runInContext('({ State, Modifiers, Reality, game, Economy, RepeatableList, PRISTINE })', ctx);
    env.store = store;
    // Pinned so the opening build is the same every run; same fixture as
    // tests/certification.mjs.
    env.State.reality = {
        runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(0);
    return env;
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

const vault = (env) => env.RepeatableList.find((r) => r.id === 'praise_vault');
const vaultRecords = (env) => env.Modifiers.records.filter((r) =>
    r.source?.kind === 'repeatable' && r.source?.id === 'praise_vault');

/* Buys `n` ranks through the real purchase path, topping Praise up to exactly
   the price each time so the test is about storage, not about income. */
function buyRanks(env, n) {
    for (let i = 0; i < n; i++) {
        const cost = env.game.getRepeatableCost('praise_vault');
        env.State.resources.praise = cost;
        env.game.purchaseRepeatable('praise_vault');
    }
}

console.log('\nStorage\n');

/* ── Ranks stack ───────────────────────────────────────────────────────── */

check('every rank of a vault adds its own capacity', () => {
    /* The defect, stated as an outcome: four ranks used to produce one record
       and 1,000 -> 3,500 instead of the sum. Measured from rank 1 onward
       because the opening build halves the vault and the 600 floor catches
       the result, so the rank-0 cap is not base-plus-nothing. */
    const env = boot();
    buyRanks(env, 1);
    const before = env.State.resourceCaps.praise;
    buyRanks(env, 3);
    assert.equal(env.game.getRepeatableLevel('praise_vault'), 4, 'fixture: four ranks bought');
    const granted = [2, 3, 4].reduce((sum, r) => sum + env.game.storageGrant(vault(env), r), 0);
    assert.equal(vaultRecords(env).length, 4, 'a rank was refused as a duplicate');
    assert.equal(env.State.resourceCaps.praise, before + granted,
        `ranks 2-4 raised the cap by ${env.State.resourceCaps.praise - before}, owed ${granted}`);
});

check('a rank that is charged is a rank that is granted', () => {
    // The player-facing half: the price moved, so the cap must have too.
    const env = boot();
    buyRanks(env, 1);
    const cap = env.State.resourceCaps.praise;
    const cost = env.game.getRepeatableCost('praise_vault');
    env.State.resources.praise = cost;
    env.game.purchaseRepeatable('praise_vault');
    assert.equal(env.State.resources.praise, 0, 'fixture: rank 2 was not charged');
    assert.ok(env.State.resourceCaps.praise > cap, 'rank 2 took the Praise and gave nothing');
});

check('rank 1 keeps the id every existing save already carries', () => {
    // A save written before the fix holds exactly this id. If rank 1 minted
    // anything else, every hydrated save would double its first vault.
    const env = boot();
    const historical = 'repeatable:praise_vault:caps.praise';
    assert.equal(env.Modifiers.autoId({ kind: 'repeatable', id: 'praise_vault', rank: 1 }, 'caps.praise', 0), historical);
    const rank2 = env.Modifiers.autoId({ kind: 'repeatable', id: 'praise_vault', rank: 2 }, 'caps.praise', 0);
    assert.notEqual(rank2, historical, 'rank 2 collides with rank 1');
});

check('the button promises exactly what the next rank grants', () => {
    const env = boot();
    buyRanks(env, 3);
    const spec = vault(env);
    const before = env.State.resourceCaps.praise;
    const promised = spec.effectText(env.game.getRepeatableLevel('praise_vault'));
    buyRanks(env, 1);
    const delivered = env.State.resourceCaps.praise - before;
    assert.ok(promised.includes(delivered.toLocaleString()),
        `button said "${promised}", rank delivered ${delivered}`);
});

/* ── Storage is a sink ─────────────────────────────────────────────────── */

check('a vault costs a fixed share of the vault, at any scale', () => {
    const env = boot();
    const share = vault(env).costFraction;
    for (const cap of [1e5, 1e9, 1e18]) {
        env.State.resourceCaps.praise = cap;
        const ratio = env.game.getRepeatableCost('praise_vault') / cap;
        assert.ok(Math.abs(ratio - share) < 1e-9, `at a cap of ${cap} a rank costs ${ratio} of it`);
    }
});

check('deep ranks return less capacity than they cost', () => {
    /* The divergence the id fix exposed: grant growth (1.38) above cost
       growth (1.32) meant each rank paid for itself forever. Asymptotically a
       rank now returns (g-1)/g of the cap for costFraction of it. */
    const env = boot();
    buyRanks(env, 30);
    const spec = vault(env);
    const next = env.game.storageGrant(spec, env.game.getRepeatableLevel('praise_vault') + 1);
    const cost = env.game.getRepeatableCost('praise_vault');
    assert.ok(next < cost, `rank 31 grants ${next} for ${cost} — storage is free again`);
    assert.ok(next / cost > 0.15, `rank 31 grants only ${(next / cost).toFixed(2)} of its price — storage is a wall`);
});

check('the first vault stays an early-game bargain', () => {
    // The onboarding was paced around a cheap first rank; the share-of-vault
    // price must not make the opening worse.
    const env = boot();
    const cost = env.game.getRepeatableCost('praise_vault');
    const grant = env.game.storageGrant(vault(env), 1);
    assert.ok(cost <= env.State.resourceCaps.praise, 'the first vault is unaffordable at the starting cap');
    assert.ok(grant > cost * 2, `the first vault grants ${grant} for ${cost}`);
});

/* ── Saves that paid for discarded ranks ───────────────────────────────── */

/* A save as the defect wrote it: the ledger says rank 4, the log holds only
   rank 1, and a cap multiplier was bought AFTER that rank 1. */
function defectSave() {
    const store = {};
    const env = boot(store);
    env.State.repeatables.praise_vault = 1;
    env.Modifiers.add({ ...env.game.repeatableMod(vault(env), 1),
        source: { kind: 'repeatable', id: 'praise_vault', rank: 1 }, label: 'Divine Vault' });
    env.Modifiers.add({ target: 'caps.praise', op: 'mulfloor', value: 1.5, scope: 'permanent',
        source: { kind: 'test', id: 'later_multiplier' }, label: 'later multiplier' });
    env.State.repeatables.praise_vault = 4;   // ranks 2-4 charged, never granted
    env.Modifiers.commit(0);
    env.State.save();
    return store;
}

check('a save that paid for discarded ranks gets them back on load', () => {
    const store = defectSave();
    const env = boot(store);
    assert.equal(vaultRecords(env).length, 4, `restored ${vaultRecords(env).length} of 4 ranks`);
});

check('restored ranks fold where they were bought, not after later multipliers', () => {
    /* Appending would put ranks 2-4 behind the mulfloor, so they would not be
       multiplied by it: floor(1.5 * (base + r1)) + r2 + r3 + r4 instead of
       floor(1.5 * (base + r1 + r2 + r3 + r4)). 14ae3d8 measured this exact
       class of reorder at 4,750 -> 13,500. */
    const store = defectSave();
    const env = boot(store);
    const later = env.Modifiers.records.find((r) => r.source?.id === 'later_multiplier');
    later.enabled = false;
    const beneath = env.Modifiers.fold('caps.praise', 0);
    later.enabled = true;
    assert.equal(env.State.resourceCaps.praise, Math.floor(beneath * 1.5),
        'restored ranks were folded after the multiplier');
});

check('the repair is stable across further reloads', () => {
    const store = defectSave();
    const first = boot(store);
    const cap = first.State.resourceCaps.praise;
    const count = first.Modifiers.records.length;
    first.State.save();
    const second = boot(store);
    assert.equal(second.Modifiers.records.length, count, 'a reload added or lost records');
    assert.equal(second.State.resourceCaps.praise, cap, 'a reload moved the cap');
});

check('a correct save is left alone', () => {
    const store = {};
    const env = boot(store);
    buyRanks(env, 5);
    const cap = env.State.resourceCaps.praise;
    const ids = env.Modifiers.records.map((r) => r.id).join('|');
    env.State.save();
    const again = boot(store);
    assert.equal(again.State.resourceCaps.praise, cap);
    assert.equal(again.Modifiers.records.map((r) => r.id).join('|'), ids, 'reconcile reordered a correct log');
});

check('a reboot drops every vault rank, not just the first', () => {
    const env = boot();
    buyRanks(env, 6);
    env.State.totalStats.soulsGained = env.game.getPrestigeThreshold() * 2;
    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(env.game.getRepeatableLevel('praise_vault'), 0, 'fixture: the reboot did not happen');
    assert.equal(vaultRecords(env).length, 0, 'vault ranks survived the reboot');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
