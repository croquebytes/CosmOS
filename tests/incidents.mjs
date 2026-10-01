#!/usr/bin/env node
/**
 * Incidents — the maintenance loop.
 *
 *   node tests/incidents.mjs
 *
 * What these tests are FOR, stated plainly, because this project has a
 * documented habit of tests that assert the convenient property instead of
 * the named one:
 *
 *   - Bulk time. Offline progress, the Temporal Rift and the suspended-tab
 *     catch-up must neither file nor escalate a ticket. Each of those tests
 *     also proves the same fixture DOES escalate under attended play, so a
 *     fixture that cannot escalate at all cannot pass them by accident.
 *   - Fold order. Incident effects are derived records, reconciled in place.
 *     Asserted on record `seq`, not on a product of multipliers that would
 *     come out the same in either order.
 *   - Forgery. A save names a template and a severity; it cannot carry an
 *     effect. A forged `scope: 'incident'` record must not survive boot.
 *   - Silence. game.tick() swallows exceptions into console.error. Every
 *     harness here routes console.error into a list that fails the test, so
 *     a throw inside Incidents.tick cannot pass as "nothing happened".
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/incidents.js', 'js/game.js'].map((f) => ({
    name: f,
    code: readFileSync(resolve(ROOT, f), 'utf8'),
}));

let ERRORS = [];

function boot(store = {}) {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, debug: noop, error: (...a) => ERRORS.push(a.map(String).join(' ')) },
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
    const env = vm.runInContext(
        '({ State, Modifiers, Reality, game, Economy, Incidents, IncidentTemplates, AchievementList })', ctx,
    );
    env.store = store;
    env.setUi = (replacement) => { ctx.ui = replacement; };
    return env;
}

const SEED = 20260726;

/* A booted game with a working Seraph line and the registry live.

   No Divinity, no free resources beyond what a test asks for — a harness
   that hands out Divinity raises the reboot bar (see tests/certification.mjs)
   and a harness that hands out Praise makes every payment free. `onboarded`
   puts the save past the quiet period; tests about the quiet period opt out.
   `random` defaults to a value that never spawns, so a test only sees the
   tickets it files itself unless it asks otherwise. */
function game_(store = {}, { onboarded = true, seraphs = 10, random = 0.999 } = {}) {
    const env = boot(store);
    env.State.reality = {
        runSeed: SEED, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
    };
    env.game.bootstrapModifiers(Date.now());
    if (seraphs) env.game.applyAutomatonPurchase('seraph', seraphs);
    if (onboarded) {
        env.State.incidents.attendedSeconds = env.Incidents.QUIET_SECONDS;
        env.State.loopSystems.directives.completed = 1;
    }
    env.Incidents.random = typeof random === 'function' ? random : () => random;
    return env;
}

/* Attended play, one frame-sized step at a time. */
function play(env, seconds, step = 1) {
    let now = env.clock || Date.now();
    for (let t = 0; t < seconds; t += step) {
        now += step * 1000;
        env.game.tick(step, now);
    }
    env.clock = now;
}

const realSev3 = (env, template = 'choir_desync', extra = {}) =>
    env.Incidents.file(template, { severity: 3, falseAlarm: false, sector: '7G', ...extra });

const incidentRecords = (env) => env.Modifiers.records.filter((r) => r.scope === 'incident');

let passed = 0;
const check = (name, fn) => {
    ERRORS = [];
    try {
        fn();
        if (ERRORS.length) throw new Error(`console.error during test: ${ERRORS[0]}`);
        passed++;
        console.log(`  ok    ${name}`);
    } catch (error) {
        console.log(`  FAIL  ${name}\n        ${error.message}`);
        process.exitCode = 1;
    }
};

console.log('\nIncidents\n');

/* ── Spawning ──────────────────────────────────────────────────────────── */

check('no ticket is filed during the onboarding quiet period, or before the first directive', () => {
    const env = game_({}, { onboarded: false, random: 0 });
    env.Incidents.FALSE_ALARM_CHANCE = 0;
    play(env, env.Incidents.QUIET_SECONDS - 5, 5);
    assert.equal(env.State.incidents.open.length, 0, 'a ticket arrived inside the quiet period');

    // Past the quiet period, but the first work order is not done.
    play(env, 180, 5);
    assert.ok(env.State.incidents.attendedSeconds >= env.Incidents.QUIET_SECONDS,
        'fixture check: the quiet period has elapsed');
    assert.equal(env.State.incidents.open.length, 0,
        'a ticket arrived before the first directive was complete — onboarding is not clean');

    env.State.loopSystems.directives.completed = 1;
    play(env, 65, 5);
    assert.equal(env.State.incidents.open.length, 1,
        'fixture check: once onboarded, a certain roll files a ticket');
});

check('no more than three tickets are ever open at once', () => {
    const env = game_({}, { random: 0 });
    env.Incidents.FALSE_ALARM_CHANCE = 0;
    play(env, 30 * 60, 5);
    assert.equal(env.State.incidents.open.length, env.Incidents.MAX_OPEN,
        `${env.State.incidents.open.length} tickets open`);
    assert.equal(env.State.incidents.stats.filed, env.Incidents.MAX_OPEN,
        'more tickets were filed than the cap allows — the cap is not what stopped them');
    assert.equal(env.Incidents.file('anomaly_flood'), null, 'file() bypassed the cap');
});

check('Nightly files tickets where Stable would not, and unpatched issues add pressure', () => {
    const chanceOn = (channel) => {
        const env = game_();
        env.State.prestigeLevel = 3;
        env.State.reality.build = env.Reality.generate(SEED, 3, channel);
        return { env, chance: env.Incidents.spawnChance() };
    };
    const stable = chanceOn('stable');
    const beta = chanceOn('beta');
    const nightly = chanceOn('nightly');
    assert.ok(stable.chance < beta.chance && beta.chance < nightly.chance,
        `stable ${stable.chance}, beta ${beta.chance}, nightly ${nightly.chance}`);

    // Patching an issue lowers the pressure on the same build.
    const before = nightly.chance;
    const issue = nightly.env.Reality.unpatchedIssues(nightly.env.State.reality.build)[0];
    issue.patched = true;
    assert.ok(nightly.env.Incidents.spawnChance() < before, 'patching did not reduce incident pressure');

    // And through the real tick: a roll that clears Stable's bar and not Nightly's.
    const roll = (stable.chance + chanceOn('nightly').chance) / 2;
    for (const [channel, expected] of [['stable', 0], ['nightly', 1]]) {
        const env = game_({}, { random: roll });
        env.State.prestigeLevel = 3;
        env.State.reality.build = env.Reality.generate(SEED, 3, channel);
        env.Incidents.FALSE_ALARM_CHANCE = 0;
        play(env, 65, 5);
        assert.equal(env.State.incidents.open.length, expected,
            `${channel} filed ${env.State.incidents.open.length} with a roll of ${roll.toFixed(3)}`);
    }
});

check('the first ticket a save ever files is real', () => {
    const env = game_({}, { random: 0 });   // a roll of 0 would make anything a false alarm
    const first = env.Incidents.file('choir_desync');
    assert.equal(first.falseAlarm, false, 'the very first ticket was a false alarm');
    const second = env.Incidents.file('hymnal_checksum');
    assert.equal(second.falseAlarm, true, 'fixture check: later tickets can be false alarms');
});

/* ── Escalation ────────────────────────────────────────────────────────── */

check('an ignored SEV-3 escalates to SEV-2, then to an outage that halts its line', () => {
    const env = game_();
    const base = env.State.automatons.seraphProduction;
    const inc = realSev3(env);
    assert.ok(Math.abs(env.State.automatons.seraphProduction - base * 0.6) < 1e-12, 'SEV-3 effect not applied');

    play(env, env.Incidents.ESCALATE_AFTER[3] - 1);
    assert.equal(inc.severity, 3, 'escalated early');
    play(env, 2);
    assert.equal(inc.severity, 2, 'did not escalate to SEV-2');
    assert.ok(Math.abs(env.State.automatons.seraphProduction - base * 0.3) < 1e-12, 'SEV-2 effect not applied');

    play(env, env.Incidents.ESCALATE_AFTER[2] + 1);
    assert.equal(inc.severity, 1, 'did not escalate to an outage');
    assert.equal(env.State.automatons.seraphProduction, 0, 'the outage did not halt the Seraph line');
    assert.equal(env.game.getProductionRates(Date.now(), false).praiseGross, 0, 'Praise still flowing in an outage');

    play(env, 600, 5);
    assert.equal(inc.severity, 1, 'an outage is the floor');
    assert.equal(env.State.incidents.stats.outages, 1);
});

check('an open ticket\'s effect is a modifier record, and resolving removes it exactly', () => {
    const env = game_();
    const before = env.State.praiseMultiplier;
    const inc = realSev3(env, 'hymnal_checksum');
    const records = incidentRecords(env);
    assert.equal(records.length, 1, 'expected exactly one incident record');
    assert.equal(records[0].target, 'praise.multiplier');
    assert.equal(records[0].source.id, inc.id);
    assert.ok(Math.abs(env.State.praiseMultiplier - before * 0.75) < 1e-12, 'effect did not reach the scalar');

    env.State.resources.praise = env.State.resourceCaps.praise;
    assert.ok(env.Incidents.payResources(inc.id), 'fixture check: payment went through');
    assert.equal(incidentRecords(env).length, 0, 'the record outlived its ticket');
    assert.equal(env.State.praiseMultiplier, before, 'the scalar did not return exactly');
});

/* ── The three resolutions ─────────────────────────────────────────────── */

/* A wall-clock moment, at or after `from`, when the marker is (or is not)
   inside the band. Scanned rather than computed so the test does not
   restate the ritual's arithmetic. */
function momentWhere(env, inc, from, inBand) {
    for (let t = from; t < from + 10_000; t += 5) {
        const pos = env.Incidents.labourMarker(inc, t);
        const band = inc.labour.band;
        const inside = pos >= band.at && pos <= band.at + band.width;
        if (inside === inBand) return t;
    }
    throw new Error('no such moment in ten seconds of marker travel');
}

check('labour resolves only after the required aligned pulses, and a miss costs one', () => {
    const env = game_({}, { random: 0.4 });
    const before = env.State.automatons.seraphProduction;
    const inc = realSev3(env);
    env.Incidents.beginLabour(inc.id, 0);
    const need = env.Incidents.labourNeed(inc);
    let t = 0;

    t = momentWhere(env, inc, t + 300, true);
    assert.equal(env.Incidents.labourPulse(inc.id, t).hit, true);
    assert.equal(env.Incidents.labourPulse(inc.id, t + 50).ignored, true, 'pulse spam was not ignored');

    t = momentWhere(env, inc, t + 300, false);
    const miss = env.Incidents.labourPulse(inc.id, t);
    assert.equal(miss.hit, false);
    assert.equal(inc.labour.hits, 0, 'a miss did not cost a hit');

    for (let i = 0; i < need - 1; i++) {
        t = momentWhere(env, inc, t + 300, true);
        env.Incidents.labourPulse(inc.id, t);
        assert.ok(env.Incidents.find(inc.id), `resolved after ${i + 1} of ${need} hits`);
    }
    t = momentWhere(env, inc, t + 300, true);
    assert.equal(env.Incidents.labourPulse(inc.id, t).done, true);
    assert.equal(env.Incidents.find(inc.id), null, 'labour did not close the ticket');
    assert.equal(env.State.incidents.stats.labour, 1);
    assert.equal(env.State.automatons.seraphProduction, before, 'the effect outlived the labour');
});

check('a payment is the same bite of the economy at 1e3 and at 1e18', () => {
    const env = game_();
    const inc = realSev3(env);
    const priceAt = (cap, rate, severity = 3) => {
        env.State.resourceCaps.praise = cap;
        env.game.getProductionRates = () => ({ praise: rate });
        inc.severity = severity;
        return env.Incidents.resourceCost(inc).amount;
    };
    const [lo, hi, seconds] = env.Incidents.COST[3];

    // Production-priced, same ratio of production to storage, twelve orders apart.
    const small = priceAt(1e3, 2);
    const large = priceAt(1e18, 2e15);
    assert.equal(small, Math.ceil(2 * seconds));
    assert.ok(Math.abs(small / 1e3 - large / 1e18) < 1e-9,
        `small ${small / 1e3} of cap, large ${large / 1e18} of cap — the price does not scale`);

    // Floor: nothing produced is still not free.
    assert.equal(priceAt(1e3, 0), Math.ceil(lo * 1e3), 'an idle line made the payment trivial');
    assert.equal(priceAt(1e18, 0), Math.ceil(lo * 1e18));
    // Ceiling: production fifteen orders above storage is still payable from a full vault.
    const ceiling = priceAt(1e3, 1e18);
    assert.equal(ceiling, Math.ceil(hi * 1e3));
    assert.ok(ceiling <= 1e3, 'the price exceeded the cap — unpayable at any holding');
    // Worse tickets cost more.
    assert.ok(priceAt(1e6, 0, 1) > priceAt(1e6, 0, 2) && priceAt(1e6, 0, 2) > priceAt(1e6, 0, 3),
        'severity does not raise the price');
});

check('a payment deducts exactly its price, and is refused whole when unaffordable', () => {
    const env = game_();
    const inc = realSev3(env);
    const cost = env.Incidents.resourceCost(inc);
    env.State.resources.praise = cost.amount - 1;
    assert.equal(env.Incidents.payResources(inc.id), false, 'an unaffordable payment went through');
    assert.equal(env.State.resources.praise, cost.amount - 1, 'a refused payment still charged');
    assert.ok(env.Incidents.find(inc.id), 'a refused payment closed the ticket');

    env.State.resources.praise = cost.amount + 5;
    assert.equal(env.Incidents.payResources(inc.id), true);
    assert.equal(env.State.resources.praise, 5, 'the deduction was not the quoted price');
    assert.equal(env.State.incidents.stats.resources, 1);
});

check('deferring closes the ticket, keeps a run-scoped penalty, and a reboot clears it', () => {
    const env = game_();
    const base = env.State.automatons.seraphProduction;
    const inc = realSev3(env, 'choir_desync', { severity: 2 });
    assert.ok(env.Incidents.defer(inc.id));
    assert.equal(env.Incidents.find(inc.id), null, 'deferring left the ticket open');
    assert.equal(env.State.incidents.debts.length, 1);
    // 0.9 at SEV-3, deepened by half again for a SEV-2.
    const expected = base * (1 + (0.9 - 1) * env.Incidents.DEBT_DEPTH[2]);
    assert.ok(Math.abs(env.State.automatons.seraphProduction - expected) < 1e-12,
        `debt folded to ${env.State.automatons.seraphProduction}, expected ${expected}`);

    // Still there after an hour of play: it is run-scoped, not temporary.
    play(env, 3600, 5);
    assert.equal(env.State.incidents.debts.length, 1, 'the debt expired on its own');

    env.State.totalStats.soulsGained = 5_000_000;
    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(env.State.prestigeLevel, 1, 'fixture check: the reboot happened');
    assert.equal(env.State.incidents.debts.length, 0, 'the debt survived the reboot');
    assert.equal(incidentRecords(env).length, 0, 'a debt record survived the reboot');
});

check('a false alarm applies nothing, never escalates, and closes itself into the Recycle Bin', () => {
    const env = game_();
    const base = env.State.automatons.seraphProduction;
    const inc = env.Incidents.file('choir_desync', { severity: 3, falseAlarm: true });
    assert.equal(env.State.automatons.seraphProduction, base, 'a false alarm changed real output');
    assert.equal(incidentRecords(env).length, 0, 'a false alarm wrote a modifier');
    const tpl = env.IncidentTemplates.find((t) => t.id === 'choir_desync');
    assert.equal(env.Incidents.view(inc).desc, tpl.tell, 'a false alarm did not read like one');
    assert.ok(!('falseAlarm' in env.Incidents.view(inc)), 'the view leaks the false-alarm flag');

    play(env, env.Incidents.ESCALATE_AFTER[3] - 1);
    assert.equal(inc.severity, 3);
    assert.ok(env.Incidents.find(inc.id), 'closed early');
    play(env, 2);
    assert.equal(env.Incidents.find(inc.id), null, 'an ignored false alarm did not close itself');
    assert.equal(env.State.incidents.stats.falseAlarmsCleared, 1);
    assert.equal(env.State.incidents.stats.outages, 0, 'a false alarm escalated');
    assert.ok(env.Incidents.artifacts().some((i) => i.name === `QUARANTINE_${inc.id}.log`),
        'the quarantined log did not reach the Recycle Bin');
});

check('a Recycle Bin artifact resolves any ticket instantly — and nothing else in the Bin can', () => {
    const env = game_();
    const inc = realSev3(env, 'choir_desync', { severity: 1 });
    // The Adversary's patch is in the Bin, undeletable, and not an artifact.
    env.State.recycleBin.items.push({ id: 'adversary_patch', name: 'PATCH_NULL_RESTORE.pkg', type: 'patch', deletable: false });
    env.State.recycleBin.items.push({ id: 'junk', name: 'junk', type: 'other', deletable: true });
    assert.equal(env.Incidents.sacrifice(inc.id), false, 'something that is not an artifact was sacrificed');
    assert.equal(env.Incidents.sacrifice(inc.id, 'adversary_patch'), false, 'the Adversary\'s patch was sacrificed');
    assert.ok(env.Incidents.find(inc.id));

    env.Incidents.fileArtifact({ key: 't', name: 'T.bak', type: 'backup', description: '' });
    assert.ok(env.Incidents.sacrifice(inc.id), 'the artifact was refused');
    assert.equal(env.Incidents.find(inc.id), null, 'the outage is still open');
    assert.equal(env.Incidents.artifacts().length, 0, 'the artifact was not consumed');
    assert.equal(env.State.recycleBin.items.length, 2, 'sacrifice took something else with it');
    assert.equal(env.State.incidents.stats.outagesSacrificed, 1);
    assert.equal(env.State.automatons.seraphProduction > 0, true, 'the line is still halted');
});

check('patching a known issue files its old module in the Recycle Bin', () => {
    const env = game_();
    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(SEED, 3, 'stable');
    const issue = env.Reality.unpatchedIssues(env.State.reality.build)[0];
    const cost = env.Reality.patchCostOf(env.State.reality.build, issue.id);
    cost.bag[cost.resource] = cost.amount;
    assert.ok(env.game.patchKnownIssue(issue.id), 'fixture check: patched');
    const artifacts = env.Incidents.artifacts();
    assert.equal(artifacts.length, 1, 'no artifact filed');
    assert.match(artifacts[0].name, /\.bak$/);
});

check('the Recycle Bin keeps at most five artifacts', () => {
    const env = game_();
    for (let i = 0; i < 8; i++) env.Incidents.fileArtifact({ key: `k${i}`, name: `K${i}`, type: 'log', description: '' });
    assert.equal(env.Incidents.artifacts().length, env.Incidents.ARTIFACT_QUOTA);
});

check('a Prophet on site holds the escalation clock and closes a SEV-3', () => {
    const env = game_();
    env.State.prophets.total = 1;
    env.State.prophets.available = 1;
    const two = realSev3(env, 'hymnal_checksum', { severity: 2 });
    assert.equal(env.Incidents.dispatchProphet(two.id), false, 'a Prophet was sent to a SEV-2');

    const inc = realSev3(env);
    inc.remaining = 10;
    assert.ok(env.Incidents.dispatchProphet(inc.id));
    assert.equal(env.State.prophets.available, 0);
    play(env, 60);
    assert.equal(inc.severity, 3, 'the clock ran with a Prophet on site');
    play(env, env.Incidents.PROPHET_SECONDS - 60 + 1);
    assert.equal(env.Incidents.find(inc.id), null, 'the Prophet did not close the ticket');
    assert.equal(env.State.prophets.available, 1, 'the Prophet did not come home');
    assert.equal(env.State.incidents.stats.prophet, 1);
});

check('a reboot closes every open ticket and brings dispatched Prophets home', () => {
    const env = game_();
    env.State.prophets.total = 1;
    env.State.prophets.available = 1;
    const a = realSev3(env);
    realSev3(env, 'hymnal_checksum', { severity: 1 });
    env.Incidents.dispatchProphet(a.id);
    env.State.totalStats.soulsGained = 5_000_000;
    env.game.performPrestige({ confirmed: true, certifyOn: 'creation' });
    assert.equal(env.State.prestigeLevel, 1, 'fixture check: the reboot happened');
    assert.equal(env.State.incidents.open.length, 0, 'a ticket survived the reboot');
    assert.equal(incidentRecords(env).length, 0, 'an outage survived the reboot');
    assert.equal(env.State.prophets.available, 1, 'a dispatched Prophet was lost in the reboot');
});

/* ── Persistence ───────────────────────────────────────────────────────── */

check('save → reload keeps open tickets, their effects, and their place in the fold', () => {
    const store = {};
    const env = game_(store);
    const inc = realSev3(env);
    // Something on the same target AFTER the ticket, so its position matters.
    env.Modifiers.add({ target: 'automaton.seraph.output', op: 'mul', value: 1.3, scope: 'run',
        source: { kind: 'upgrade', id: 'later_purchase' }, label: 'later' });
    env.Modifiers.commit(Date.now());
    // Array.from: each boot is its own vm realm, and deepEqual compares prototypes.
    const order = (e) => Array.from(e.Modifiers.records
        .filter((r) => r.target === 'automaton.seraph.output'), (r) => `${r.id}@${r.seq}`);
    const live = { order: order(env), output: env.State.automatons.seraphProduction };
    assert.ok(live.order[0].startsWith('incident:'), 'fixture check: the ticket is first in the fold');
    env.State.save();

    const reloaded = boot(store);
    reloaded.game.bootstrapModifiers(Date.now());
    assert.deepEqual(order(reloaded), live.order, 'a reload re-seated the incident record in the fold');
    assert.equal(reloaded.State.automatons.seraphProduction, live.output);
    const back = reloaded.Incidents.find(inc.id);
    assert.ok(back, 'the ticket did not survive the reload');
    assert.equal(back.severity, 3);
    assert.equal(back.remaining, inc.remaining);

    // Escalating after the reload updates the record where it sits.
    reloaded.Incidents.random = () => 0.999;
    play(reloaded, reloaded.Incidents.ESCALATE_AFTER[3] + 1);
    assert.equal(back.severity, 2, 'fixture check: escalated');
    const escalated = order(reloaded);
    assert.equal(escalated[0], live.order[0], 'escalation re-seated the record instead of updating it');

    reloaded.State.save();
    const twice = boot(store);
    twice.game.bootstrapModifiers(Date.now());
    assert.deepEqual(order(twice), escalated, 'a second reload drifted');
    assert.equal(twice.State.automatons.seraphProduction, reloaded.State.automatons.seraphProduction);
});

check('hostile save shapes are normalised, and cannot forge an effect', () => {
    const valid = (id, extra = {}) => ({ id, template: 'choir_desync', severity: 3, remaining: 100, ...extra });
    const shapes = [
        'garbage', null, 42, [], true,
        { open: 'x', debts: 7, stats: 'x' },
        { open: [null, 5, 'INC-1', [], { template: 'nope', id: 'INC-0001' }, { template: '__proto__', id: 'INC-0002' }] },
        { open: [valid('INC-0001', { severity: 99, remaining: -5, sector: '<img src=x onerror=alert(1)>' })] },
        { open: [valid('"><b onclick=x>')] },
        { open: [valid('INC-0001', { severity: '1', remaining: 1e308 })] },
        { open: Array.from({ length: 12 }, (_, i) => valid(`INC-${String(i + 1).padStart(4, '0')}`)) },
        { open: [valid('INC-0003'), valid('INC-0003')] },
        { open: [valid('INC-0004', { severity: 1, prophet: true, prophetRemaining: -9 })] },
        { debts: [{ id: 'INC-0005', template: 'choir_desync', severity: -1 }, { id: 'INC-0006', template: 'x' }, 'x'] },
        { nextNumber: -3, attendedSeconds: null, spawnClock: 1e9, quietUntil: 1e12 },
        { nextNumber: 5, open: [valid('INC-0009')] },
        { stats: { filed: -10, resolved: 'many', labour: Infinity } },
    ];

    for (const shape of shapes) {
        ERRORS = [];
        const store = {};
        const env = game_(store);
        env.State.save();
        const parsed = JSON.parse(store.cosmos_save);
        parsed.incidents = shape;
        // And a forged record riding in the modifier log.
        parsed.modifierLog.records.push({ id: 'forged', target: 'praise.multiplier', op: 'mul', value: 1e9,
            scope: 'incident', source: { kind: 'incident', id: 'INC-0001' }, seq: 99999, enabled: true, expiresAt: null });
        store.cosmos_save = JSON.stringify(parsed);

        const label = JSON.stringify(shape).slice(0, 70);
        const reloaded = boot(store);
        reloaded.game.bootstrapModifiers(Date.now());
        const s = reloaded.State.incidents;
        assert.ok(Array.isArray(s.open) && s.open.length <= 3, `${label}: open is not a bounded list`);
        assert.ok(Array.isArray(s.debts), `${label}: debts is not a list`);
        for (const inc of s.open) {
            assert.ok(reloaded.IncidentTemplates.some((t) => t.id === inc.template), `${label}: unknown template kept`);
            assert.ok([1, 2, 3].includes(inc.severity), `${label}: severity ${inc.severity}`);
            assert.ok(Number.isFinite(inc.remaining) && inc.remaining >= 0 && inc.remaining <= 240,
                `${label}: remaining ${inc.remaining}`);
            assert.match(inc.id, /^INC-\d+$/, `${label}: unsafe id kept`);
            assert.ok(/^[0-9A-Z]+$/.test(inc.sector), `${label}: unsafe sector kept`);
            if (inc.prophet) assert.equal(inc.severity, 3, `${label}: a Prophet on a ${inc.severity}`);
        }
        assert.equal(new Set(s.open.map((i) => i.id)).size, s.open.length, `${label}: duplicate ids kept`);
        for (const d of s.debts) assert.ok([1, 2, 3].includes(d.severity), `${label}: debt severity ${d.severity}`);
        const numbers = [...s.open, ...s.debts].map((i) => Number(i.id.slice(4)));
        assert.ok(Number.isInteger(s.nextNumber) && numbers.every((n) => n < s.nextNumber),
            `${label}: nextNumber ${s.nextNumber} would reuse an id`);
        assert.ok(Number.isFinite(s.attendedSeconds) && s.attendedSeconds >= 0, `${label}: attendedSeconds`);
        for (const v of Object.values(s.stats)) assert.ok(Number.isFinite(v) && v >= 0, `${label}: stats`);

        assert.ok(!reloaded.Modifiers.records.some((r) => r.id === 'forged'), `${label}: the forged record survived`);
        assert.ok(reloaded.State.praiseMultiplier < 1e6, `${label}: forged effect reached the scalar`);
        const desired = reloaded.Incidents.desiredMods().length;
        assert.equal(incidentRecords(reloaded).length, desired, `${label}: incident records do not match the queue`);

        // And the game keeps running on it.
        play(reloaded, 30, 5);
        reloaded.Incidents.file('anomaly_flood', { severity: 3, falseAlarm: false });
        if (ERRORS.length) throw new Error(`${label}: ${ERRORS[0]}`);
    }

    // A forged Prophet cannot be minted by resolving it.
    const store = {};
    const env = game_(store);
    env.State.prophets.total = 0;
    env.State.prophets.available = 0;
    env.State.save();
    const parsed = JSON.parse(store.cosmos_save);
    parsed.incidents = { open: [valid('INC-0001', { prophet: true, prophetRemaining: 1 })] };
    store.cosmos_save = JSON.stringify(parsed);
    const reloaded = boot(store);
    reloaded.game.bootstrapModifiers(Date.now());
    play(reloaded, 3);
    assert.equal(reloaded.State.prophets.available, 0, 'a forged dispatch minted a Prophet');
});

/* ── Bulk time: three paths, one rule ──────────────────────────────────── */

/* Each proves the fixture is live afterwards, so none can pass vacuously. */
function provesLive(env, inc) {
    play(env, env.Incidents.ESCALATE_AFTER[3] + 1);
    assert.equal(inc.severity, 2, 'fixture check: under attended play this ticket DOES escalate');
}

check('offline progress neither files nor escalates tickets', () => {
    const env = game_({}, { random: 0 });
    env.Incidents.FALSE_ALARM_CHANCE = 0;
    realSev3(env);
    const before = { remaining: env.State.incidents.open[0].remaining, attended: env.State.incidents.attendedSeconds };
    env.State.runtime.lastUpdateTime = Date.now() - 12 * 3600 * 1000;
    const report = env.game.initializeSession();
    assert.ok(report && report.simulatedSeconds > 3600, 'fixture check: offline progress really ran');
    const s = env.State.incidents;
    assert.equal(s.open.length, 1, 'tickets were filed while nobody was watching');
    assert.equal(s.open[0].severity, 3, 'a ticket escalated while nobody was watching');
    assert.equal(s.open[0].remaining, before.remaining, 'the escalation clock ran offline');
    assert.equal(s.attendedSeconds, before.attended, 'offline time counted as attended');
    env.Incidents.random = () => 0.999;
    provesLive(env, s.open[0]);
});

check('the Temporal Rift neither files nor escalates tickets', () => {
    const env = game_({}, { random: 0 });
    env.Incidents.FALSE_ALARM_CHANCE = 0;
    const inc = realSev3(env);
    const remaining = inc.remaining;
    env.State.skills.temporalRift.cooldownEndsAt = 0;
    env.game.activateTemporalRift();
    assert.ok(env.State.achievementProgress.use_temporal_rift >= 1, 'fixture check: the Rift opened');
    assert.equal(env.State.incidents.open.length, 1, 'the Rift filed tickets');
    assert.equal(inc.severity, 3, 'the Rift escalated a ticket');
    assert.equal(inc.remaining, remaining, 'the escalation clock ran through the Rift');
    env.Incidents.random = () => 0.999;
    provesLive(env, inc);
});

check('a suspended tab neither files nor escalates tickets', () => {
    const env = game_({}, { random: 0 });
    env.Incidents.FALSE_ALARM_CHANCE = 0;
    const inc = realSev3(env);
    const remaining = inc.remaining;
    // loop() marks a gap this size unattended.
    env.game.tick(8 * 3600, Date.now(), { attended: false });
    // And a direct caller that forgets to is still bulk time.
    env.game.tick(3600, Date.now());
    assert.equal(env.State.incidents.open.length, 1, 'a suspended tab filed tickets');
    assert.equal(inc.severity, 3, 'a suspended tab escalated a ticket');
    assert.equal(inc.remaining, remaining, 'the escalation clock ran through a suspend');
    env.Incidents.random = () => 0.999;
    provesLive(env, inc);
});

/* ── The OS interrupts you ─────────────────────────────────────────────── */

check('a SEV-1 alert suppressed by a modal is retried, not lost', () => {
    const env = game_();
    let rendered = 0;
    let modalUp = true;
    const shown = [];
    env.setUi(new Proxy({
        showIncidentAlert: (view) => { if (modalUp) return false; rendered++; shown.push(view); return true; },
    }, { get: (t, k) => (k in t ? t[k] : () => {}) }));

    const inc = realSev3(env, 'choir_desync', { severity: 1 });
    play(env, 3);
    assert.equal(rendered, 0, 'fixture check: suppressed by the modal');
    assert.equal(inc.alerted, false, 'a suppressed alert was marked as delivered');

    modalUp = false;
    play(env, 1);
    assert.equal(rendered, 1, 'the suppressed alert was never retried');
    assert.equal(inc.alerted, true);
    assert.equal(shown[0].id, inc.id);
    play(env, 10);
    assert.equal(rendered, 1, 'the same outage announced itself twice');
});

check('an escalation into SEV-1 opens the dialog unprompted', () => {
    const env = game_();
    let rendered = 0;
    env.setUi(new Proxy({ showIncidentAlert: () => { rendered++; return true; } },
        { get: (t, k) => (k in t ? t[k] : () => {}) }));
    realSev3(env, 'choir_desync', { severity: 2 });
    play(env, env.Incidents.ESCALATE_AFTER[2] - 1);
    assert.equal(rendered, 0, 'a SEV-2 opened the outage dialog');
    play(env, 2);
    assert.equal(rendered, 1, 'an outage arrived silently');
});

/* ── The switch, and the rest ──────────────────────────────────────────── */

check('game.incidentsEnabled = false turns the whole system off', () => {
    const env = game_({}, { random: 0 });
    env.game.incidentsEnabled = false;
    const attended = env.State.incidents.attendedSeconds;
    play(env, 30 * 60, 5);
    assert.equal(env.State.incidents.stats.filed, 0, 'tickets filed with the switch off');
    assert.equal(env.State.incidents.attendedSeconds, attended, 'the clock ran with the switch off');

    env.State.prestigeLevel = 3;
    env.State.reality.build = env.Reality.generate(SEED, 3, 'stable');
    const issue = env.Reality.unpatchedIssues(env.State.reality.build)[0];
    const cost = env.Reality.patchCostOf(env.State.reality.build, issue.id);
    cost.bag[cost.resource] = cost.amount;
    env.game.patchKnownIssue(issue.id);
    assert.equal(env.State.recycleBin.items.length, 0, 'patching filed an artifact with the switch off');
});

check('resolving tickets unlocks the incident achievements', () => {
    const env = game_();
    const inc = realSev3(env, 'choir_desync', { severity: 1 });
    env.Incidents.fileArtifact({ key: 'a', name: 'A.bak', type: 'backup', description: '' });
    env.Incidents.sacrifice(inc.id);
    env.game.checkAchievements();
    assert.ok(env.State.achievements['ACH-033'], 'First Responder did not unlock');
    assert.ok(env.State.achievements['ACH-S-009'], 'Burnt Offering did not unlock');
    assert.ok(!env.State.achievements['ACH-034'], 'No Fault Found unlocked without a false alarm');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`);
