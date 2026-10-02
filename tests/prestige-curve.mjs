#!/usr/bin/env node
/**
 * Prestige curve tests.
 *
 *   node tests/prestige-curve.mjs
 *
 * The property that matters here is that the reboot decision EXISTS.
 *
 * The original formula was `floor((lifetimeSouls / k) ^ e) - alreadyBanked`.
 * Because it read lifetime totals, reboot timing could not change what a
 * player earned: measured over 48h with tools/balance_sim.mjs, every policy
 * converged on the same 8 Divinity — 8 reboots of +1, or one reboot of +5, or
 * anything between. A reboot also resets production, so rebooting was strictly
 * a cost and the only reason to do it was to tick the counter gating channels
 * and mandates. That is a ratchet, not a game.
 *
 * These tests pin the two halves of the replacement against each other:
 * a deeper run must pay more (or there is no reason to push), and the bar must
 * rise with what you have banked (or reboot-spam dominates — which it did,
 * measured at prestige level 848 in 24h before the threshold growth landed).
 * Either property alone re-creates a solved decision pointing the other way.
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
    const env = vm.runInContext('({ State, Modifiers, Reality, game, Economy })', ctx);
    env.store = store;
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

/* Put `souls` worth of production into the current run. */
const earn = (env, souls) => { env.State.totalStats.soulsGained += souls; };
/* The first reboot's bar. Fixtures are stated in multiples of it rather than
   in raw Souls: the 2026-09-30 re-tune moved the bar from 35,000 to 1e8, and
   three tests written in absolute Souls went quietly vacuous — both sides of
   each comparison fell below the bar and paid zero. */
const BAR = boot().game.getPrestigeThreshold();

/* Bank the run the way performPrestige does, without the rest of the reset —
   these tests are about the award, not about what a reboot clears. */
/* Deliberately uses the unmultiplied score, not getPrestigeAward: these tests
   model a player on the Stable channel (payout 1x). A Beta or Nightly player
   climbs the same ladder FASTER, so every reachability figure below is a
   ceiling rather than an estimate. */
const bank = (env) => {
    const gain = env.game.calculateDivinityPoints();
    env.State.totalDivinityPoints += gain;
    env.State.runSoulsBaseline = env.State.totalStats.soulsGained;
    return gain;
};

console.log('\nPrestige Curve\n');

/* ── The decision exists ───────────────────────────────────────────────── */

check('reboot timing changes what you earn', () => {
    /* THE headline property, and the one the old formula failed. Two players
       generate identical lifetime Souls; one banks in four instalments, the
       other in one. Their totals must differ — if they cannot, the reboot
       button is not a decision. */
    const total = 114 * BAR;

    const split = boot();
    for (let i = 0; i < 4; i++) { earn(split, total / 4); bank(split); }

    const single = boot();
    earn(single, total);
    bank(single);

    assert.equal(single.State.totalStats.soulsGained, split.State.totalStats.soulsGained,
        'the two schedules did not generate the same lifetime Souls');
    assert.notEqual(split.State.totalDivinityPoints, single.State.totalDivinityPoints,
        'reboot timing is irrelevant to the payout — the decision is fake again');
});

check('Divinity is not a function of lifetime Souls alone', () => {
    // The same statement from the other side: identical lifetime, different
    // run history, different answer from the live formula.
    const a = boot();
    earn(a, 14 * BAR);
    bank(a);
    earn(a, 14 * BAR);

    const b = boot();
    earn(b, 28 * BAR);

    assert.equal(a.State.totalStats.soulsGained, b.State.totalStats.soulsGained);
    assert.notEqual(a.game.calculateDivinityPoints(), b.game.calculateDivinityPoints(),
        'the pending award ignores the run and reads lifetime totals');
});

/* ── Pushing deeper pays ───────────────────────────────────────────────── */

check('a deeper run pays strictly more', () => {
    const at = (souls) => { const e = boot(); earn(e, souls); return e.game.calculateDivinityPoints(); };
    const bar = boot().game.getPrestigeThreshold();
    const shallow = at(bar);
    const deep = at(bar * 8);
    assert.ok(deep > shallow, `${bar * 8} Souls paid ${deep}, ${bar} paid ${shallow}`);
});

check('the award rises monotonically with run depth', () => {
    /* `>=` seeded from -1 was satisfied by ANY constant, including a formula
       that always returned 1. The award must actually climb. */
    const bar = boot().game.getPrestigeThreshold();
    const awards = [1, 2, 4, 8, 16, 32].map((mult) => {
        const e = boot();
        earn(e, bar * mult);
        return e.game.calculateDivinityPoints();
    });
    for (let i = 1; i < awards.length; i++) {
        assert.ok(awards[i] >= awards[i - 1],
            `${2 ** i}x the bar paid ${awards[i]}, less than the step below`);
    }
    assert.ok(awards[awards.length - 1] > awards[0] * 8,
        `32x the run only moved the award ${awards[0]} -> ${awards[awards.length - 1]}`);
});

check('doubling the award costs less than 5x the run', () => {
    /* The tuning property behind prestigeExponent. At 0.45 a run had to be
       4.7x longer to pay double, so banking immediately always won and the
       decision stayed solved in the other direction. */
    const env = boot();
    const e = env.Economy.prestigeExponent;
    const cost = Math.pow(2, 1 / e);
    /* `< 5` admitted 0.45 — a cost of 4.66x, the exact value this comment
       names as the bug. A bound that does not exclude the thing it was written
       about is not a bound. */
    assert.ok(cost < 3, `paying double costs ${cost.toFixed(2)}x the run — patience cannot compete`);
    /* And the invariant stated in game.js but never asserted: below 1 so a
       single marathon run cannot outrun the ladder. */
    assert.ok(e > 0.7 && e < 1, `prestigeExponent ${e} is outside the band the design requires`);
});

/* ── But rebooting constantly does not ─────────────────────────────────── */

check('the bar outgrows the bonus that funds it', () => {
    /* THE convergence invariant, and the one whose absence shipped a divergent
       economy past the window that had been measured.

       Banked Divinity raises production (bonus ~ D^prestigeBonusExponent) and
       production earns Divinity, so if the reboot bar
       (~ D^prestigeThresholdGrowth) does not outgrow the bonus, the period
       between reboots shrinks without bound. A first attempt at 0.55 growth
       against 0.75 bonus looked healthy at 26 Divinity by hour 24 and reached
       3,116 Divinity and prestige level 194 by hour 48.

       Strict inequality with margin, because run Souls grow SUPERLINEARLY in
       the multiplier — income is reinvested into automatons inside the run —
       so merely matching the exponents still diverged in measurement. */
    const { Economy } = boot();
    assert.ok(Economy.prestigeThresholdGrowth > Economy.prestigeBonusExponent,
        `bar grows as D^${Economy.prestigeThresholdGrowth} against a bonus of ` +
        `D^${Economy.prestigeBonusExponent} — the loop diverges`);
    assert.ok(Economy.prestigeThresholdGrowth - Economy.prestigeBonusExponent >= 0.25,
        'the margin between bar and bonus is too thin to survive in-run reinvestment');
});

check('the bar rises with banked Divinity', () => {
    const env = boot();
    const opening = env.game.getPrestigeThreshold();
    env.State.totalDivinityPoints = 25;
    const later = env.game.getPrestigeThreshold();
    assert.ok(later > opening * 2,
        `the bar only moved ${opening} -> ${later}; reboot-spam will dominate`);
});

check('a fixed-size run pays less and less as the ladder rises', () => {
    // The anti-spam property stated in outcomes rather than in constants.
    const env = boot();
    const run = env.game.getPrestigeThreshold() * 20;
    const first = (() => { earn(env, run); return bank(env); })();
    for (let i = 0; i < 12; i++) { earn(env, run); bank(env); }
    earn(env, run);
    const later = env.game.calculateDivinityPoints();
    assert.ok(later < first, `an identical run still pays ${later} after 13 reboots (was ${first})`);
});

check('rebooting on a run that never cleared the bar pays nothing', () => {
    const env = boot();
    earn(env, env.game.getPrestigeThreshold() * 0.99);
    assert.equal(env.game.calculateDivinityPoints(), 0);
});

/* ── Souls cannot be sold twice ────────────────────────────────────────── */

check('banking resets the run, so the same Souls cannot pay twice', () => {
    const env = boot();
    earn(env, env.game.getPrestigeThreshold() * 10);
    const first = bank(env);
    assert.ok(first >= 1);
    assert.equal(env.game.calculateDivinityPoints(), 0,
        'the same Souls are still on the table after banking');
});

check('the run baseline survives a real save and load', () => {
    /* This previously hand-copied two fields between two State objects and
       never touched save() or load() — so it could not have seen a serialiser
       that dropped the baseline, which is the only failure it existed to
       catch. Now it writes through the real save path into a shared store and
       boots a second game against it. */
    const store = {};
    const first = boot(store);
    earn(first, 5 * BAR);
    assert.ok(bank(first) >= 1, 'the fixture run never cleared the bar');
    first.State.save();
    assert.ok(store.cosmos_save, 'save() wrote nothing');

    const second = boot(store);   // load() runs at the bottom of state.js
    assert.equal(second.State.runSoulsBaseline, 5 * BAR,
        'the baseline did not survive the save');
    assert.equal(second.game.getRunSouls(), 0,
        'a reload re-opened the banked run — those Souls can be sold twice');

    // And the reopened run still works: fresh Souls count from the baseline.
    earn(second, second.game.getPrestigeThreshold() * 2);
    assert.ok(second.game.calculateDivinityPoints() >= 1,
        'the reloaded save can never reboot again');
});

check('getSoulsUntilNextPoint tells the truth', () => {
    /* The one function the new Divine Settings readout renders, and it had no
       coverage at all — it had never been called by anything before this. */
    const env = boot();
    const bar = env.game.getPrestigeThreshold();

    // From a standing start, the gap to the first point is the whole bar.
    assert.ok(Math.abs(env.game.getSoulsUntilNextPoint() - bar) < 1,
        `said ${env.game.getSoulsUntilNextPoint()} Souls to the first point, bar is ${bar}`);

    // Earning exactly that much must close the gap and open the award.
    earn(env, bar * 1.001);
    assert.ok(env.game.calculateDivinityPoints() >= 1, 'the gap closed but paid nothing');
    assert.equal(env.game.getSoulsUntilNextPoint() > 0, true,
        'no distance quoted to the NEXT point once the first is earned');

    // The quoted distance must actually deliver the next point.
    const promised = env.game.getSoulsUntilNextPoint();
    const before = env.game.calculateDivinityPoints();
    earn(env, promised * 1.01);
    assert.ok(env.game.calculateDivinityPoints() > before,
        `earning the quoted ${promised} Souls did not raise the award`);
});

check('the panel award matches what the reboot actually pays', () => {
    /* The Divine Settings panel rendered calculateDivinityPoints while
       performPrestige awarded that times the channel multiplier — so on Beta
       (1.4x) and Nightly (2.2x) the game understated its own payout, which is
       the number that makes a riskier channel worth picking. */
    const env = boot();
    earn(env, env.game.getPrestigeThreshold() * 40);
    const base = env.game.calculateDivinityPoints();

    env.game.bootstrapModifiers();   // materialises State.reality.build
    for (const [channel, multiplier] of [['stable', 1], ['beta', 1.4], ['nightly', 2.2]]) {
        env.State.reality.build.channel = channel;
        assert.equal(env.game.getPrestigeChannelPayout(), multiplier, `${channel} payout`);
        assert.equal(env.game.getPrestigeAward(), Math.floor(base * multiplier),
            `${channel}: the panel and the reboot disagree`);
    }

    // The fallback path, for a save whose build has not materialised yet.
    env.State.reality.build = null;
    env.State.reality.channel = 'nightly';
    assert.equal(env.game.getPrestigeChannelPayout(), 2.2,
        'the channel payout is lost when the build has not been rolled');
});

check('performPrestige itself closes the run', () => {
    // Guards the single write site: the derived-baseline design is only safe
    // while the real reboot path sets it.
    const env = boot();
    earn(env, env.game.getPrestigeThreshold() * 5);
    env.game.performPrestige();
    assert.equal(env.game.getRunSouls(), 0,
        'performPrestige left the run open — the next reboot re-sells these Souls');
});

/* ── The channel ladder is reachable ───────────────────────────────────── */

check('the Nightly channel is reachable in a plausible number of runs', () => {
    /* DESIGN_DIRECTION.md §2 gates Beta at reboot 3 and Nightly at reboot 8 and
       calls them the replayability payload. On the old curve reboot 8 needed
       ~6.1M lifetime Souls and landed at 45 hours of measured play.

       Asserted in units of the FIRST reboot's Souls rather than wall-clock,
       so it does not depend on the production curve, and stated as a ceiling
       so a future rebalance that makes it cheaper still passes. The ratio
       depends only on the bar's growth: 26x at 0.8, 50x at 1.2 (the
       2026-09-30 re-tune, where tools/balance_sim.mjs puts reboot 8 at 6h50
       of play). Past ~64x the ladder's middle is where players stop. */
    /* Clears the bar by a hair rather than landing exactly on it: run Souls are
       a difference of two accumulating seven-digit floats, so an exact landing
       is ambiguous at the last bit. No player lands there — production is
       continuous, so they overshoot. */
    const env = boot();
    let souls = 0;
    for (let reboot = 0; reboot < 8; reboot++) {
        const bar = env.game.getPrestigeThreshold() * 1.001;
        earn(env, bar);
        souls += bar;
        const gain = bank(env);
        assert.ok(gain >= 1, `reboot ${reboot + 1} paid nothing at the bar`);
    }
    assert.ok(souls < 64 * BAR,
        `reaching reboot 8 costs ${(souls / BAR).toFixed(1)}x the first reboot; the old curve's ~175x is what made it unreachable`);
    assert.ok(env.State.totalDivinityPoints >= 8);
});

check('reaching reboot 12 does not cost an order of magnitude more than reboot 8', () => {
    const cost = (target) => {
        const env = boot();
        let souls = 0;
        for (let i = 0; i < target; i++) {
            const bar = env.game.getPrestigeThreshold() * 1.001;
            earn(env, bar);
            souls += bar;
            bank(env);
        }
        return souls;
    };
    const ratio = cost(12) / cost(8);
    assert.ok(ratio < 2.5,
        `reboot 12 costs ${ratio.toFixed(2)}x reboot 8 — the tail is where the ladder died before`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
