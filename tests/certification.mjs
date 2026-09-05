#!/usr/bin/env node
/**
 * Certification, shipping, scars and the cascade.
 *
 *   node tests/certification.mjs
 *
 * Two mechanics, one decision. Certification decides which Mandate path is
 * live for a run; shipping is the exit that banks the run, files the known
 * issues you did not patch, and chooses the next path.
 *
 * What these tests are FOR, stated plainly, because this project has a
 * documented habit of tests that assert the convenient property instead of
 * the named one:
 *
 *   - The residue arithmetic. A tenth of `mul 1.4` is `mul 1.04`. Scaling the
 *     VALUE instead of its distance from 1 gives `mul 0.14`, which is a 86%
 *     production cut dressed up as a consolation prize — and it looks fine in
 *     any test that only asserts "less than full".
 *   - Silence. Modifiers.add returns null on a duplicate id without a throw or
 *     a log, so a certification that re-adds records over stale ones does
 *     nothing at all and reports success. Re-certifying onto a path you have
 *     already held must restore FULL value, not the residue still sitting in
 *     the log.
 *   - The escape hatch. A collapsed build pays no Divinity. If shipping were
 *     gated on the award rather than the run's score, a player could be locked
 *     inside a cascade with no way out but a patch they may not be able to
 *     afford. That is a soft-lock, and this project has shipped two.
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
        '({ State, Modifiers, Reality, game, Economy, MandateList, RealityPool })', ctx,
    );
    env.store = store;
    return env;
}

/* A booted game with the registry live and a pinned reality seed, matching
   what tools/balance_sim.mjs does before it starts simulating.

   `divinity` is opt-in and defaults to zero, which is not tidiness. The
   reboot bar rises with BANKED Divinity, so a harness that handed every test
   5000 DP to shop with also raised the bar past anything the test could earn:
   calculateDivinityPoints returned 0, performPrestige refused, and five tests
   silently asserted against a reboot that never happened. Tests that buy
   mandates ask for Divinity; tests that ship do not. */
function game_(store = {}, { divinity = 0 } = {}) {
    const env = boot(store);
    env.State.reality = {
        runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    env.State.totalDivinityPoints = divinity;
    return env;
}

/* Enough Divinity to buy any node, and enough lifetime Souls to clear the bar
   that much Divinity raises. */
const SHOPPING = { divinity: 5000 };

const CREATION = ['creation_root', 'creation_t2_left', 'creation_t2_right', 'creation_t3', 'creation_ultimate'];

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

console.log('\nCertification and shipping\n');

/* ── Certification ──────────────────────────────────────────────────────── */

check('a mandate bought on an uncertified path does nothing', () => {
    const env = game_({}, SHOPPING);
    const before = env.State.praiseMultiplier;
    for (const id of CREATION) env.game.purchaseMandate(id);
    assert.equal(env.State.purchasedMandates.creation_root, true, 'the node should still be owned');
    assert.equal(env.State.praiseMultiplier, before,
        'an uncertified path paid out — the tree is still a checklist');
});

check('certifying switches the whole path on at full value', () => {
    const env = game_({}, SHOPPING);
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.applyCertification();
    // 1.1 * 1.2 * 1.5 * 2 — creation_t2_right is Souls, not Praise.
    assert.ok(Math.abs(env.State.praiseMultiplier - 3.96) < 1e-9,
        `certified path folded to ${env.State.praiseMultiplier}, expected 3.96`);
});

check('a lapsed path pays the residue of its DISTANCE FROM 1, not of its value', () => {
    /* The load-bearing arithmetic. At residue 0.1:
         right:  mul 1.4 -> mul 1.04     (a tenth of the +40%)
         wrong:  mul 1.4 -> mul 0.14     (a tenth of the multiplier)
       Both are "less than full", so an assertion of `< 3.96` passes either. */
    const env = game_({}, SHOPPING);
    const r = env.Economy.certificationResidue;
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.certifyOn('maintenance');
    env.game.applyCertification();

    const expected = [1.1, 1.2, 1.5, 2].reduce((acc, v) => acc * (1 + (v - 1) * r), 1);
    assert.ok(Math.abs(env.State.praiseMultiplier - expected) < 1e-9,
        `lapsed path folded to ${env.State.praiseMultiplier}, expected ${expected}`);
    assert.ok(env.State.praiseMultiplier > 1,
        'a lapsed path is a residue, not a penalty — it must stay above the base');
});

check('a path never certified pays nothing at all', () => {
    const env = game_({}, SHOPPING);
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('maintenance');
    env.game.applyCertification();
    assert.equal(env.State.praiseMultiplier, 1,
        'a path the player has never certified on should be dormant, not residual');
});

check('re-certifying a lapsed path restores FULL value', () => {
    /* Modifiers.add returns null on a duplicate id silently. If
       applyCertification did not drop its own scope first, the residue records
       would still be present, the full-value ones would be swallowed, and the
       branch would stay at 10% with nothing reporting it. */
    const env = game_({}, SHOPPING);
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.certifyOn('maintenance');
    env.game.applyCertification();
    env.game.certifyOn('creation');
    env.game.applyCertification();
    assert.ok(Math.abs(env.State.praiseMultiplier - 3.96) < 1e-9,
        `re-certified path folded to ${env.State.praiseMultiplier}, expected 3.96 — records were swallowed`);
});

check('applyCertification is idempotent', () => {
    const env = game_({}, SHOPPING);
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.game.certifyOn('creation');
    env.game.applyCertification();
    const once = env.State.praiseMultiplier;
    env.game.applyCertification();
    env.game.applyCertification();
    assert.equal(env.State.praiseMultiplier, once,
        'repeated application compounded — a reload would inflate the tree');
});

check('a grant mandate is not issued on an uncertified path', () => {
    /* entropy_ultimate has no mods at all: its whole value is
       State.manualClickScaling. A grant has no residue form, so an
       uncertified branch simply does not get it — and the 8-DP and 40-DP
       nodes are exactly the two that work this way. */
    const env = game_({}, SHOPPING);
    const ENTROPY = ['entropy_root', 'entropy_t2_left', 'entropy_t2_right', 'entropy_t3', 'entropy_ultimate'];
    env.game.certifyOn('creation');
    for (const id of ENTROPY) env.game.purchaseMandate(id);
    assert.equal(env.State.manualClickScaling, false,
        'an uncertified grant fired — two mandates are immune to certification');

    /* Through a reboot, both ways. Asserting only that the grant fires when
       you DO certify on entropy passes a build that issues every grant
       regardless of path — which is the bug, and it survived this test until
       the negative half was added. The reboot bar rises with banked Divinity,
       and this test banked 5000 of it to shop with, so the run has to clear a
       correspondingly large bar. */
    env.State.totalStats.soulsGained = 1e12;
    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(env.State.manualClickScaling, false,
        'a grant on an uncertified path was re-issued by the reboot');

    env.State.totalStats.soulsGained = 1e14;
    env.game.performPrestige({ confirmed: true, certifyOn: 'entropy' });
    assert.equal(env.State.manualClickScaling, true,
        'the grant was not re-issued to the branch actually certified on');
});

check('a grant is not compounded by reloading', () => {
    /* maintenance_apex grants +8 capacitor ranks into an ownership ledger the
       registry cannot fold. applyCertification runs on every boot, so if it
       ran grants the ledger would grow by 8 every time the player reloaded. */
    const store = {};
    const env = game_(store, SHOPPING);
    env.State.purchasedMandates = { maintenance_apex: true };
    env.State.repeatables.offline_capacitor = 8;
    env.game.certifyOn('maintenance');
    env.State.save();

    const reloaded = boot(store);
    reloaded.game.bootstrapModifiers(Date.now());
    assert.equal(reloaded.State.repeatables.offline_capacitor, 8,
        'a grant was re-issued on load — every reload pays the apex mandate again');
});

check('a rebuilt log does not restore all three paths at full strength', () => {
    /* rebuildModifierLog is the branch taken whenever the persisted log is
       empty. Replaying MandateList verbatim there would hand back every
       branch at full value and silently undo the certification the run was
       banked under. */
    const store = {};
    const env = game_(store, SHOPPING);
    for (const id of CREATION) env.game.purchaseMandate(id);
    /* Certified on creation FIRST so it is genuinely lapsed rather than
       dormant. Expecting the residue distinguishes a correct rebuild from
       both failure modes at once — a rebuild that replays every mandate at
       full strength folds to 3.96, and a rebuild that drops them entirely
       folds to 1. Expecting 1 would have been satisfied by the second bug. */
    env.game.certifyOn('creation');
    env.game.certifyOn('maintenance');
    env.game.applyCertification();
    env.State.modifierLog = null;
    env.State.save();

    const reloaded = boot(store);
    reloaded.State.modifierLog = null;   // force the rebuild path
    reloaded.game.bootstrapModifiers(Date.now());
    const r = reloaded.Economy.certificationResidue;
    const expected = [1.1, 1.2, 1.5, 2].reduce((acc, v) => acc * (1 + (v - 1) * r), 1);
    assert.ok(Math.abs(reloaded.State.praiseMultiplier - expected) < 1e-9,
        `rebuild folded to ${reloaded.State.praiseMultiplier}, expected the residue ${expected}`);
});

check('a returning player is certified on the path they invested most in', () => {
    /* A save that predates the mechanic bought into the tree under the old
       rules, where every node was live. Loading it with no path would switch
       the whole tree off until the player next rebooted — an unannounced
       amputation for someone holding the 40-DP apex nodes. */
    const env = game_({}, SHOPPING);
    env.State.purchasedMandates = {
        creation_root: true,                       // 1 DP
        maintenance_root: true, maintenance_t2_left: true,
        maintenance_t2_right: true, maintenance_t3: true,   // 9 DP
    };
    env.State.certification = { path: null, everCertified: [], history: [] };
    const chosen = env.game.bootstrapCertification();
    assert.equal(chosen, 'maintenance',
        'the returning player was certified on a path they had barely bought into');
    assert.deepEqual(
        [...env.State.certification.everCertified].sort(), ['creation', 'maintenance'],
        'branches already bought into must count as previously certified, or the residue is earned twice',
    );
});

check('buying into a dormant path does not quietly make it lapsed', () => {
    /* bootstrapCertification runs on every boot. Before it was gated on
       "never certified", it re-derived everCertified from the purchase ledger
       every time — so owning a single node on a path you had never certified
       on promoted that path to the residue on the next reload. Free value,
       and it collapses dormant and lapsed into each other, which is the
       distinction the whole mechanic rests on.

       Found by reloading the browser and watching Entropy relabel itself. */
    const store = {};
    const env = game_(store, SHOPPING);
    env.game.certifyOn('creation');
    env.game.certifyOn('maintenance');
    env.game.purchaseMandate('entropy_root');
    assert.equal(env.game.branchStanding('entropy').status, 'dormant',
        'fixture check: entropy is owned but never certified');
    env.State.save();

    const reloaded = boot(store);
    reloaded.game.bootstrapModifiers(Date.now());
    assert.equal(reloaded.game.branchStanding('entropy').status, 'dormant',
        'a reload promoted a dormant path to the residue');
    assert.deepEqual([...reloaded.State.certification.everCertified].sort(),
        ['creation', 'maintenance'],
        'the ledger of certified paths grew from purchases rather than from certifying');
});

check('a save cannot certify the player onto a path that does not exist', () => {
    /* State.mergeInto does NO type validation and importSave decodes
       arbitrary pasted text straight into State, so `certification.path` can
       arrive as any value at all.

       The normaliser read `cert.path = cert.path || null`, which is a no-op
       for every truthy value. A bogus path was therefore kept, no branch ever
       matched it, and the player's ENTIRE Mandate tree went dormant — with no
       explanation and no way to fix it before the next ship. */
    const env = game_({}, SHOPPING);
    for (const id of CREATION) env.game.purchaseMandate(id);
    env.State.certification = { path: 'nonsense', everCertified: ['creation', 'sideways'], history: ['nonsense'] };

    const cert = env.game.certification();
    assert.equal(cert.path, null, 'an unrecognised path survived normalisation');
    assert.deepEqual(cert.everCertified, ['creation'],
        'an unrecognised branch survived in everCertified');
});

check('instability cannot be negative, however it arrives', () => {
    /* `Number(x) || 0` turns a string or an object into 0 but lets a negative
       through. A save carrying -99 — importSave again — would need a hundred
       hours of decay before a cascade could reach that player. */
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    env.State.reality.instability = -99;

    assert.equal(env.game.cascadeState().instability, 0, 'a negative read back as negative');
    env.game.accrueInstability(1, Date.now());
    assert.ok(env.State.reality.instability >= 0,
        'a negative survived accrual — this player is immune to the cascade for a hundred hours');

    // And the ceiling holds from the other side.
    env.State.reality.instability = 1e308;
    assert.equal(env.game.cascadeState().instability,
        env.Economy.cascadeTiers[env.Economy.cascadeTiers.length - 1].at,
        'instability read back above the last tier');
});

/* ── Shipping and scars ─────────────────────────────────────────────────── */

check('shipping files every unpatched known issue as a permanent scar', () => {
    const env = game_();
    env.State.totalStats.soulsGained = 5_000_000;
    const unpatched = env.Reality.unpatchedIssues(env.State.reality.build).map((e) => e.id);
    assert.ok(unpatched.length, 'the opening build should ship with a known issue');

    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    for (const id of unpatched) {
        assert.ok(env.State.reality.scars.includes(id), `${id} shipped unpatched and was not filed`);
    }
});

check('a patched issue never becomes a scar', () => {
    const env = game_();
    env.State.totalStats.soulsGained = 5_000_000;
    env.State.resources.praise = 1e9;
    const entry = env.Reality.unpatchedIssues(env.State.reality.build)[0];
    assert.ok(env.game.patchKnownIssue(entry.id), 'the patch should have been affordable');

    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.ok(!env.State.reality.scars.includes(entry.id),
        'a patched issue was filed anyway — patching bought nothing');
});

check('the same issue is only ever filed once', () => {
    /* The bound on the whole system. Eleven distinct issues exist; if an id
       could scar twice, a hundred runs would compound into an unplayable
       game.

       Both halves are needed. The fold half alone (a duplicated id must not
       apply twice) passes a performPrestige that appends the same id on every
       ship, because the registry's own duplicate-id guard hides it — and that
       guard is silent, so the ledger would grow without bound while the
       symptom stayed invisible. The filing half is what actually pins it. */
    const env = game_();
    env.State.totalStats.soulsGained = 5_000_000;
    const already = env.Reality.unpatchedIssues(env.State.reality.build).map((e) => e.id);
    assert.ok(already.length, 'fixture check: the opening build ships an issue');
    env.State.reality.scars = [...already];

    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.deepEqual(env.State.reality.scars, already,
        'an issue already on file was filed a second time');

    // And the fold ignores a duplicate even if one reaches the ledger.
    env.State.reality.scars = ['iss_soul_partition'];
    env.game.applyScars();
    const first = env.State.soulMultiplier;
    env.State.reality.scars.push('iss_soul_partition');
    env.game.applyScars();
    assert.equal(env.State.soulMultiplier, first, 'a duplicated scar id folded twice');
});

check('a scar keeps a fraction of its bite, in the same direction', () => {
    const env = game_();
    const source = env.RealityPool.issues.find((e) => e.id === 'iss_dedup_overeager');
    const mod = source.mods.find((m) => m.target === 'praise.multiplier');
    assert.ok(mod && mod.value < 1, 'fixture check: this issue should be a praise penalty');

    const before = env.State.praiseMultiplier;
    env.State.reality.scars = ['iss_dedup_overeager'];
    env.game.applyScars();
    const expected = before * (1 + (mod.value - 1) * env.Economy.scarResidue);
    assert.ok(Math.abs(env.State.praiseMultiplier - expected) < 1e-9,
        `scar folded to ${env.State.praiseMultiplier}, expected ${expected}`);
    assert.ok(env.State.praiseMultiplier < before,
        'a scar must still hurt, or shipping dirty costs nothing');
});

/* ── Instability and the cascade ────────────────────────────────────────── */

check('the opening build does not degrade', () => {
    /* A new player idling before their first reboot must not return to a
       collapsed universe having never been told the mechanic exists. */
    const env = game_();
    assert.equal(env.State.prestigeLevel, 0, 'fixture check: still on the opening build');
    assert.ok(env.Reality.unpatchedIssues(env.State.reality.build).length,
        'fixture check: the opening build does carry a known issue');
    env.game.accrueInstability(3600 * 6, Date.now());
    assert.equal(env.State.reality.instability, 0,
        'the tutorial run degraded — the cascade arrives before its explanation does');
});

check('instability accrues from unpatched severity and throttles output', () => {
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    const weight = env.Reality.unpatchedIssues(env.State.reality.build)
        .reduce((sum, e) => sum + env.game.issueWeight(e), 0);
    assert.ok(weight > 0, 'fixture check: this build has unpatched issues');

    const rate = env.game.instabilityRatePerHour();
    assert.ok(Math.abs(rate - weight * env.Economy.instabilityPerWeightHour) < 1e-9);

    /* One second past the threshold rather than exactly on it: the accrual is
       floating point, and a test that lands on the boundary is asserting the
       rounding rather than the mechanic. */
    const toFirstTier = 3600 * (env.Economy.cascadeTiers[0].at / rate) + 1;
    env.game.accrueInstability(toFirstTier, Date.now());
    assert.equal(env.game.cascadeState().tier, 1, 'the first tier did not engage');

    const throttled = env.State.praiseMultiplier;
    assert.ok(Math.abs(throttled - env.Economy.cascadeTiers[0].output) < 1e-9,
        `output folded to ${throttled}, expected the tier-1 throttle of ${env.Economy.cascadeTiers[0].output}`);
});

check('a cascade reduces the award and a collapse zeroes it', () => {
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    env.State.totalStats.soulsGained = 5_000_000;
    const full = env.game.getPrestigeAward();
    assert.ok(full > 0, 'fixture check: this run has earned something');

    env.State.reality.instability = env.Economy.cascadeTiers[0].at;
    env.game.syncCascade();
    assert.equal(env.game.getPrestigeAward(),
        Math.floor(env.game.calculateDivinityPoints() * env.game.getPrestigeChannelPayout() * env.Economy.cascadeTiers[0].award));

    env.State.reality.instability = env.Economy.cascadeTiers[2].at;
    env.game.syncCascade();
    assert.equal(env.game.getPrestigeAward(), 0, 'a collapsed build still paid out');
});

check('a collapsed build can still be shipped', () => {
    /* THE soft-lock guard. A collapsed build pays nothing, so gating the ship
       on the award would trap the player inside the cascade: the only other
       way out is a patch, and a collapsed run may not be able to earn one.
       Shipping for zero is a bad outcome the player chose. Being unable to
       ship is a bug. */
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    env.State.totalStats.soulsGained = 5_000_000;
    env.State.reality.instability = env.Economy.cascadeTiers[2].at;
    env.game.syncCascade();

    assert.equal(env.game.getPrestigeAward(), 0, 'fixture check: this build is collapsed');
    const level = env.State.prestigeLevel;
    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(env.State.prestigeLevel, level + 1,
        'a collapsed build could not be shipped — the player is locked in the cascade');
    assert.equal(env.State.reality.instability, 0, 'the new build inherited the old one\'s instability');
});

check('patching relieves instability, and a clean build settles on its own', () => {
    /* Without recovery, clearing every issue on a degraded build leaves the
       player stuck at whatever they had accrued with nothing left to patch —
       punished for doing exactly what the mechanic asked. */
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    env.State.resources.praise = 1e9;
    env.State.resources.offerings = 1e9;
    env.State.resources.souls = 1e9;
    env.State.dimensions.void.resources.darkness = 1e9;
    env.State.reality.instability = 1.4;

    const entry = env.Reality.unpatchedIssues(env.State.reality.build)[0];
    const relief = env.game.issueWeight(entry) * env.Economy.instabilityReliefPerWeight;
    env.game.patchKnownIssue(entry.id);
    assert.ok(Math.abs(env.State.reality.instability - (1.4 - relief)) < 1e-9,
        'patching gave back nothing — the repair is cosmetic');

    // Clear the rest, then let it settle.
    for (const e of env.Reality.unpatchedIssues(env.State.reality.build)) env.game.patchKnownIssue(e.id);
    assert.equal(env.game.instabilityRatePerHour(), 0, 'fixture check: nothing left unpatched');
    const held = env.State.reality.instability;
    env.game.accrueInstability(3600, Date.now());
    assert.ok(env.State.reality.instability < held,
        'a clean build did not settle — patching everything leaves the player stuck');
});

check('a simulated hour degrades the build like a real one', () => {
    /* Temporal Rift grants an hour of production without going through
       tick(), so instability had to be accrued by hand. Skipping it makes the
       Rift a free way to push a run deeper — rifted Souls raise the prestige
       award like any others, so an hour of them at no cost is strictly
       dominant over waiting, and an active player never meets a cascade.

       Offline progress is the deliberate opposite and is asserted separately:
       a player cannot triage a cascade they were not present for. */
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    const rate = env.game.instabilityRatePerHour();
    assert.ok(rate > 0, 'fixture check: this build is degrading');

    env.State.skills.temporalRift.cooldownEndsAt = 0;
    env.game.activateTemporalRift();
    assert.ok(Math.abs(env.State.reality.instability - rate) < 1e-9,
        `a rifted hour accrued ${env.State.reality.instability}, expected a full hour of ${rate}`);
});

check('offline progress does NOT degrade the build', () => {
    /* The deliberate asymmetry with the Rift above. This is an idle game and
       a player cannot triage a cascade they were not present for, so the
       universe holds its breath while unattended. */
    const store = {};
    const env = game_(store);
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    assert.ok(env.game.instabilityRatePerHour() > 0, 'fixture check: this build is degrading');
    // Twelve hours ago, well inside the offline window.
    env.State.runtime.lastUpdateTime = Date.now() - 12 * 3600 * 1000;

    const report = env.game.initializeSession();
    assert.ok(report && report.simulatedSeconds > 3600, 'fixture check: offline progress really ran');
    assert.equal(env.State.reality.instability, 0,
        'the build degraded while nobody was watching — a player cannot triage that');
});

check('a reboot clears the cascade throttle, not just the counter', () => {
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    env.State.totalStats.soulsGained = 5_000_000;
    env.State.reality.instability = env.Economy.cascadeTiers[1].at;
    env.game.syncCascade();
    assert.ok(env.Modifiers.records.some((r) => r.source?.kind === 'cascade'),
        'fixture check: the throttle records exist');

    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.ok(!env.Modifiers.records.some((r) => r.source?.kind === 'cascade'),
        'the throttle survived the reboot — the new build starts degraded');
});

check('a persisted cascade is re-derived on load', () => {
    /* syncCascade is a no-op when the tier it computes already matches the
       stored one, which is exactly the case on load — so on the rebuild path
       a save mid-outage would come back at full output. */
    const store = {};
    const env = game_(store);
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(20260726, 3, 'stable');
    env.State.reality.instability = env.Economy.cascadeTiers[1].at;
    env.game.syncCascade();
    env.State.modifierLog = null;      // force the reload onto the rebuild path
    env.State.save();

    const reloaded = boot(store);
    reloaded.State.modifierLog = null;
    reloaded.game.bootstrapModifiers(Date.now());
    assert.equal(reloaded.game.cascadeState().tier, 2, 'the tier did not survive the reload');
    assert.ok(reloaded.Modifiers.records.some((r) => r.source?.kind === 'cascade'),
        'the throttle was not re-derived — a save mid-outage reloads at full output');
});

/* ── The migration ──────────────────────────────────────────────────────── */

check('migration 6 strips stale mandate records but spares the adversary patch', () => {
    /* Nulling the whole log — migration 4's trick — would destroy the two
       adversary-patch records, which are in no ownership ledger and cannot be
       regenerated. Leaving the mandate records would be worse: their ids
       collide with the certified ones and Modifiers.add swallows duplicates
       silently, so every branch would stay at full strength forever. */
    const store = {
        cosmos_save: JSON.stringify({
            saveVersion: 5,
            purchasedMandates: { creation_root: true, entropy_root: true },
            modifierLog: {
                seq: 3,
                records: [
                    { id: 'mandate:creation_root:praise.multiplier', target: 'praise.multiplier', op: 'mul', value: 1.1, scope: 'permanent', source: { kind: 'mandate', id: 'creation_root' }, enabled: true, seq: 0, expiresAt: null, label: 'First Light' },
                    { id: 'adversary:patch:praise.multiplier', target: 'praise.multiplier', op: 'mul', value: 1.25, scope: 'permanent', source: { kind: 'adversary', id: 'patch' }, enabled: true, seq: 1, expiresAt: null, label: 'Patch' },
                ],
            },
        }),
    };
    const env = boot(store);
    const kinds = env.State.modifierLog.records.map((r) => r.source.kind);
    assert.ok(!kinds.includes('mandate'),
        'a stale mandate record survived — certification is a silent no-op on this save');
    assert.ok(kinds.includes('adversary'),
        'the adversary patch was destroyed — it is in no ledger and cannot be rebuilt');
    assert.deepEqual([...env.State.certification.everCertified].sort(), ['creation', 'entropy'],
        'branches already bought into should count as previously certified');
});

console.log(`\n${passed} passed${process.exitCode ? ' — with failures' : ''}\n`);
