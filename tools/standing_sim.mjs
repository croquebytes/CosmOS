#!/usr/bin/env node
/**
 * Where does NULL.OPERATOR's standing actually land at the finale gate?
 *
 *   node tools/standing_sim.mjs [--variants] [--curve] [--trace=<archetype>:<choice>]
 *
 * tests/endings.mjs sets `standing` directly, so nothing models how it DRIFTS
 * over the 14 reboots the End of Shift gate demands (13, plus the archived
 * ship). This drives the real game code — performPrestige, the archived
 * replay, nudgeAdversaryStanding with its per-reason cooldown, Mail.reply —
 * through a full climb on a fake clock, one reboot per attended hour (the
 * gate's own floor is ~14.5 h), under scripted play styles, from each answer
 * to the Mirror Login.
 *
 * The levers, by what they cost the player (see js/game.js, system.js, ui.js,
 * state.js, mail.js, choir.js):
 *   every ship            -1  exempt   (+1 instead on entering an archived replay)
 *   open Notepad          +1  per-reason cooldown 10 min
 *   buy a Void upgrade    +1  per-reason cooldown 10 min
 *   try to end the mirror -2  per-reason cooldown 10 min
 *   Choir status          -1/0/+1  one offer per reboot, cooldown 10 min
 *   Mail null-01 / null-02  -1/0/+1 each, once ever (end-curious comes after an ending)
 *   execute the patch     +5  exempt, once ever
 * Standing is clamped to ±12; bands: <= -3 hostile, >= +3 complicit.
 *
 * Callers that need a DOM (Notepad, the Void shop, the patch, the Choir
 * offer) are mirrored by their exact reason string and delta; the cooldown,
 * the clamp and the bands are the game's own.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['state', 'modifiers', 'reality', 'incidents', 'game', 'solitaire', 'media', 'footage', 'choir', 'mail', 'etherscape']
    .map((f) => ({ name: `js/${f}.js`, code: readFileSync(resolve(ROOT, `js/${f}.js`), 'utf8') }));

const SLOT_MS = 10 * 60 * 1000;
const SLOTS_PER_HOUR = 6;
const args = process.argv.slice(2);
const trace = (args.find((a) => a.startsWith('--trace=')) || '').slice(8);

/* ── a fresh game on a fake clock ───────────────────────────────────── */

function boot(clock) {
    function FakeDate(...a) { return a.length ? new Date(...a) : new Date(clock.t); }
    FakeDate.now = () => clock.t;
    FakeDate.UTC = Date.UTC;
    FakeDate.parse = Date.parse;
    FakeDate.prototype = Date.prototype;
    const store = {};
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date: FakeDate, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise, Error,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
        ui: new Proxy({}, { get: () => noop }),
        system: new Proxy({}, { get: () => noop }),
        requestAnimationFrame: noop,
        window: {},
        document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, addEventListener: noop, body: { classList: { add: noop, remove: noop } } },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext('({ State, game, Mail, MailLogic, Choir })', ctx);
    env.State.reality = { runSeed: 20260726, channel: 'stable', build: null, shipped: 0, instability: 0, cascadeTier: 0, alertedTier: 0, scars: [] };
    env.game.bootstrapModifiers(clock.t);
    return env;
}

/* ── rules to compare ────────────────────────────────────────────────
   `delta`/`capped`: what a SHIP does to standing. `levers`: what limits a
   repeatable act (Notepad, the Void shop, a Choir status, ending the mirror):
   'cooldown' is the game's own 10 minutes per reason; 'reboot' lets each
   reason count once per reboot. Exempt acts (the patch, an archived replay)
   and mail (once per message) are the game's own in every variant. */

const VARIANTS = {
    current: { label: 'now: -1 every ship; each act once per 10 min', delta: () => -1, levers: 'cooldown' },
    reboot: { label: '-1 every ship; each act once per REBOOT', delta: () => -1, levers: 'reboot' },
    rebootHalf: { label: '-1 every 2nd ship; each act once per reboot', delta: (n) => (n % 2 ? -1 : 0), levers: 'reboot' },
    rebootNone: { label: 'no ship drift; each act once per reboot', delta: () => 0, levers: 'reboot' },
    lifetime6: {
        label: 'each act capped for the whole run (Notepad +3, Void +3, status +/-4, end-mirror -4); ship drift capped at -6',
        delta: () => -1, shipCap: 6, levers: 'lifetime', caps: { 'read the paperwork': [0, 3], 'fed the reflection': [0, 3], 'posted a status': [-4, 4], 'tried to end the mirror': [-4, 0] },
    },
    lifetime4: {
        label: 'the same lifetime caps; ship drift capped at -4',
        delta: () => -1, shipCap: 4, levers: 'lifetime', caps: { 'read the paperwork': [0, 3], 'fed the reflection': [0, 3], 'posted a status': [-4, 4], 'tried to end the mirror': [-4, 0] },
    },
};

/* ── play styles: what a player does in each ten minutes of a reboot ── */

const nudge = (env, d, reason, opts) => env.game.nudgeAdversaryStanding(d, reason, opts);
const notepad = (env) => nudge(env, 1, 'read the paperwork');
const voidBuy = (env) => nudge(env, 1, 'fed the reflection');
const endMirror = (env) => nudge(env, -2, 'tried to end the mirror');
const status = (env, option) => nudge(env, env.Choir.STATUS_NUDGE[option], env.Choir.STATUS_REASON);
function mail(env, clock, id, choice) {
    const m = env.Mail.state();
    env.MailLogic.deliver(m, [id], [env.State.prestigeLevel, 0, m.clock]);
    env.Mail.reply(id, choice, clock.t);
}

const STYLES = {
    passive: { label: 'ships only; touches nothing', act() {} },
    ordinary: {
        label: 'opens Notepad and buys a Void upgrade once an hour; neutral status; mail: asks, then patches',
        act(env, clock, r, slot) {
            if (slot === 1) notepad(env);
            if (slot === 3) voidBuy(env);
            if (slot === 5) status(env, 1);
            if (slot === 2 && r === 4) mail(env, clock, 'null-01', 'ask');
            if (slot === 2 && r === 9) mail(env, clock, 'null-02', 'patch');
        },
    },
    attentive: {
        label: 'Notepad twice and the Void twice an hour; warm status; warm mail; executes the patch at reboot 3',
        act(env, clock, r, slot) {
            if (slot === 1 || slot === 4) notepad(env);
            if (slot === 2 || slot === 5) voidBuy(env);
            if (slot === 5) status(env, 2);
            if (slot === 3 && r === 2) mail(env, clock, 'null-01', 'warm');
            if (slot === 3 && r === 6) mail(env, clock, 'null-02', 'patch');
            if (slot === 3 && r === 3) nudge(env, 5, 'executed the patch', { exempt: true });
        },
    },
    farmer: {
        label: 'every ten minutes: Notepad and a Void upgrade (the cooldown is the only limit); warm everything',
        act(env, clock, r, slot) {
            notepad(env);
            voidBuy(env);
            if (slot === 5) status(env, 2);
            if (slot === 3 && r === 2) mail(env, clock, 'null-01', 'warm');
            if (slot === 3 && r === 6) mail(env, clock, 'null-02', 'patch');
            if (slot === 3 && r === 3) nudge(env, 5, 'executed the patch', { exempt: true });
        },
    },
    cold: {
        label: 'never reads the paperwork; tries to end the mirror each hour; cold status; cold mail',
        act(env, clock, r, slot) {
            if (slot === 2) endMirror(env);
            if (slot === 5) status(env, 0);
            if (slot === 3 && r === 2) mail(env, clock, 'null-01', 'cold');
            if (slot === 3 && r === 6) mail(env, clock, 'null-02', 'mine');
        },
    },
};

/* A single dial instead of a style: -1 is cold, +1 is the warm farmer.
   Positive: Notepad and a Void upgrade in round(w*6) of each hour's six
   slots, a warm status above 0.5 (neutral below), warm mail from 0.5.
   Negative: ending the mirror in round(|w|*6) slots, cold status, cold mail. */
function graded(w) {
    const k = Math.round(Math.abs(w) * SLOTS_PER_HOUR);
    return {
        label: `warmth ${w}`,
        act(env, clock, r, slot) {
            if (w > 0 && slot < k) { notepad(env); voidBuy(env); }
            if (w < 0 && slot < k) endMirror(env);
            if (slot === 5) status(env, w >= 0.5 ? 2 : w <= -0.25 ? 0 : 1);
            if (slot === 3 && r === 2) mail(env, clock, 'null-01', w >= 0.5 ? 'warm' : w < 0 ? 'cold' : 'ask');
            if (slot === 3 && r === 6) mail(env, clock, 'null-02', w >= 0.5 ? 'patch' : w < 0 ? 'mine' : 'patch');
            if (slot === 3 && r === 3 && w >= 0.75) nudge(env, 5, 'executed the patch', { exempt: true });
        },
    };
}
const WARMTH = [-1, -0.5, -0.17, 0, 0.17, 0.33, 0.5, 0.75, 1];

/* ── one climb ──────────────────────────────────────────────────────── */

const SEEDS = { 'OP-A': -4, 'OP-B': 0, 'OP-C': 4 };
const bandOf = (s) => (s <= -3 ? 'hostile' : s >= 3 ? 'complicit' : 'curious');

function climb({ style, choice, variant }) {
    const clock = { t: Date.UTC(2026, 9, 1, 12) };
    const env = boot(clock);
    const { State, game } = env;
    env.game.resolveAdversaryChoice(choice);
    assert.equal(State.adversary.standing, SEEDS[choice], 'fixture check: the answer seeds standing');

    // Swap what a ship does to standing; everything else is the game's.
    const real = game.nudgeAdversaryStanding.bind(game);
    let ships = 0;
    const seen = new Set();
    const used = {};
    let driftTotal = 0;
    game.nudgeAdversaryStanding = (delta, reason, options) => {
        const rule = VARIANTS[variant];
        if (reason === 'rebooted') {
            ships++;
            let d = rule.delta(ships);
            if (rule.shipCap) { d = Math.max(d, -rule.shipCap - driftTotal); driftTotal += d; }
            return d ? real(d, reason, options) : undefined;
        }
        if (rule.levers === 'lifetime' && rule.caps[reason]) {
            const [lo, hi] = rule.caps[reason];
            const before = used[reason] || 0;
            const allowed = Math.max(lo, Math.min(hi, before + delta)) - before;
            if (!allowed) return;
            used[reason] = before + allowed;
            return real(allowed, reason, options);
        }
        if (rule.levers === 'reboot' && reason && !(options && options.exempt)) {
            const key = `${reason}@${ships}`;
            if (seen.has(key)) return;
            seen.add(key);
            // The 10-minute cooldown is not what limits it here; the reboot is.
            const adv = State.adversary;
            if (adv.nudgeCooldowns) delete adv.nudgeCooldowns[reason];
        }
        return real(delta, reason, options);
    };

    const shipOnce = () => {
        const before = State.prestigeLevel;
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
        game.performPrestige({ confirmed: true, certifyOn: 'creation' });
        assert.equal(State.prestigeLevel, before + 1, `fixture check: the ship from reboot ${before} happened`);
    };
    const hour = (r) => {
        for (let slot = 0; slot < SLOTS_PER_HOUR; slot++) {
            clock.t += SLOT_MS;
            (STYLES[style] || graded(Number(style))).act(env, clock, r, slot);
        }
    };

    const marks = {};
    const line = [];
    for (let r = 1; r <= 12; r++) {
        hour(r);
        shipOnce();
        line.push(State.adversary.standing);
        if ([3, 8, 12].includes(r)) marks[r] = State.adversary.standing;
    }
    // Reboot 12 opens Archived: ship into a replay (13, +1), then ship the replay (14).
    hour(13);
    assert.ok(game.selectArchivedBuild(game.archivedBuilds().slice(-1)[0].reboot), 'fixture check: a replay was picked');
    shipOnce();
    line.push(State.adversary.standing);
    hour(14);
    shipOnce();
    line.push(State.adversary.standing);
    marks[14] = State.adversary.standing;
    assert.equal(State.endings.archivedShips, 1, 'fixture check: an archived ship is on file');
    return { marks, line, final: State.adversary.standing };
}

/* ── report ─────────────────────────────────────────────────────────── */

const pad = (s, n) => String(s).padEnd(n);
const fmt = (n) => (n > 0 ? `+${n}` : String(n));

if (trace) {
    const [style, choice] = trace.split(':');
    for (const variant of Object.keys(VARIANTS)) {
        const r = climb({ style, choice, variant });
        console.log(`${pad(variant, 8)} standing after each ship: ${r.line.map(fmt).join(' ')}`);
    }
    process.exit(0);
}

if (args.includes('--curve')) {
    const choices = ['OP-A', 'OP-B', 'OP-C'];
    console.log('\nStanding at the gate along one warmth dial (-1 cold ... +1 warm farmer), from OP-A / OP-B / OP-C');
    console.log('Acts per hour at warmth w: round(|w|*6) Notepad+Void (or end-the-mirror) slots; see graded().\n');
    for (const variant of Object.keys(VARIANTS)) {
        console.log(`── ${VARIANTS[variant].label}`);
        let curious = 0;
        for (const w of WARMTH) {
            const cells = choices.map((c) => {
                const r = climb({ style: String(w), choice: c, variant });
                if (c === 'OP-B' && bandOf(r.final) === 'curious') curious++;
                return pad(`${fmt(r.final)} ${bandOf(r.final).slice(0, 4)}`, 14);
            });
            console.log(`  w=${pad(w, 6)} ${cells.join('')}`);
        }
        console.log(`  -> curious for ${curious} of ${WARMTH.length} warmth settings (from OP-B)\n`);
    }
    process.exit(0);
}

console.log('\nNULL.OPERATOR standing at the End of Shift gate (reboot 14, one reboot per attended hour)\n');
console.log('Play styles:');
for (const [id, s] of Object.entries(STYLES)) console.log(`  ${pad(id, 10)} ${s.label}`);

const variants = args.includes('--variants') ? Object.keys(VARIANTS) : ['current'];
for (const variant of variants) {
    console.log(`\n── Ship drift: ${VARIANTS[variant].label}`);
    console.log(`${pad('', 10)}${['OP-A (-4)', 'OP-B (0)', 'OP-C (+4)'].map((h) => pad(h, 26)).join('')}`);
    for (const style of Object.keys(STYLES)) {
        const cells = ['OP-A', 'OP-B', 'OP-C'].map((choice) => {
            const r = climb({ style, choice, variant });
            return pad(`${fmt(r.final)} ${bandOf(r.final)}`, 26);
        });
        console.log(`${pad(style, 10)}${cells.join('')}`);
    }
}

if (!args.includes('--variants')) {
    console.log('\nStanding after reboot 3 / 8 / 12 / 14, from OP-B:');
    for (const style of Object.keys(STYLES)) {
        const r = climb({ style, choice: 'OP-B', variant: 'current' });
        console.log(`  ${pad(style, 10)} ${[3, 8, 12, 14].map((n) => fmt(r.marks[n])).join(' / ')}`);
    }
    console.log('\nPure drift, no acts (the floor under every run):');
    for (const choice of Object.keys(SEEDS)) {
        const r = climb({ style: 'passive', choice, variant: 'current' });
        console.log(`  ${choice} (${fmt(SEEDS[choice])}) -> ${fmt(r.final)} after 14 ships`);
    }
}
console.log('');
