/**
 * The climb to the End of Shift gate, driven on the real game code, on a fake
 * clock — shared by tools/standing_sim.mjs (the report) and tests/standing.mjs
 * (the regression test). Background and findings: docs/STANDING_DRIFT.md.
 *
 * One reboot per attended hour (the gate's floor is a little over 14.5 h: the 13th
 * reboot lands at ~14.5 h and the 14th, shipping the replay, one run later) to reboot 12,
 * then Archived opens: ship into a replay (13), ship the replay (14), the
 * first archived ship. Play styles script what a player does in each ten
 * minutes. Callers that need a DOM (Notepad, the Void shop, the patch, the
 * Choir offer) are mirrored by their exact reason string and delta; the
 * cooldown, the caps, the clamp and the bands are the game's own, and so are
 * performPrestige, the archived replay and Mail.reply.
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

export const SLOT_MS = 10 * 60 * 1000;
export const SLOTS_PER_HOUR = 6;
export const SEEDS = { 'OP-A': -4, 'OP-B': 0, 'OP-C': 4 };
export const bandOf = (s) => (s <= -3 ? 'hostile' : s >= 3 ? 'complicit' : 'curious');

/* ── a fresh game on a fake clock ───────────────────────────────────── */

export function boot(clock, store = {}) {
    function FakeDate(...a) { return a.length ? new Date(...a) : new Date(clock.t); }
    FakeDate.now = () => clock.t;
    FakeDate.UTC = Date.UTC;
    FakeDate.parse = Date.parse;
    FakeDate.prototype = Date.prototype;
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
    const env = vm.runInContext('({ State, PRISTINE, game, Mail, MailLogic, Choir })', ctx);
    env.store = store;
    return env;
}

export function freshGame(clock, store = {}) {
    const env = boot(clock, store);
    env.State.reality = { runSeed: 20260726, channel: 'stable', build: null, shipped: 0, instability: 0, cascadeTier: 0, alertedTier: 0, scars: [] };
    env.game.bootstrapModifiers(clock.t);
    return env;
}

/* ── rules to compare ────────────────────────────────────────────────
   `current` is the game as shipped. The rest override its tables:
   `legacy` is the game before the lifetime caps (only the cooldown limited an
   act; every ship was -1). `reboot*` and `lifetime4` are rules that were
   tried and not chosen; the first three could not fix the cliff. */

export const VARIANTS = {
    current: { label: 'now: lifetime caps per act, ship drift capped at -6' },
    legacy: { label: 'before the caps: -1 every ship; each act once per 10 min', caps: {} },
    reboot: { label: 'no caps; -1 every ship; each act once per REBOOT', caps: {}, delta: () => -1, levers: 'reboot' },
    rebootHalf: { label: 'no caps; -1 every 2nd ship; each act once per reboot', caps: {}, delta: (n) => (n % 2 ? -1 : 0), levers: 'reboot' },
    rebootNone: { label: 'no caps; no ship drift; each act once per reboot', caps: {}, delta: () => 0, levers: 'reboot' },
    lifetime4: {
        label: 'the lifetime caps with ship drift capped at -4',
        caps: { 'read the paperwork': [0, 3], 'fed the reflection': [0, 3], 'posted a status': [-4, 4], 'tried to end the mirror': [-4, 0], rebooted: [-4, 0] },
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

export const STYLES = {
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
        label: 'every ten minutes: Notepad and a Void upgrade (the cooldown is the only rate limit); warm everything',
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
   slots, a warm status above 0.5 (neutral below), warm mail from 0.5, the
   patch from 0.75. Negative: ending the mirror in round(|w|*6) slots, cold
   status, cold mail. */
export function graded(w) {
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
export const WARMTH = [-1, -0.5, -0.17, 0, 0.17, 0.33, 0.5, 0.75, 1];

/* ── one climb ──────────────────────────────────────────────────────── */

export function climb({ style, choice, variant = 'current' }) {
    const clock = { t: Date.UTC(2026, 9, 1, 12) };
    const env = freshGame(clock);
    const { State, game } = env;
    game.resolveAdversaryChoice(choice);
    assert.equal(State.adversary.standing, SEEDS[choice], 'fixture check: the answer seeds standing');

    const rule = VARIANTS[variant];
    assert.ok(rule, `unknown variant ${variant}`);
    if (rule.caps) game.ADVERSARY_NUDGE_CAPS = rule.caps;

    // The explored rules that change what a ship or a repeated act does are
    // wrappers; the shipped rules and the cap tables are the game's own.
    if (rule.delta || rule.levers) {
        const real = game.nudgeAdversaryStanding.bind(game);
        const seen = new Set();
        let ships = 0;
        game.nudgeAdversaryStanding = (delta, reason, options) => {
            if (reason === 'rebooted' && rule.delta) {
                ships++;
                const d = rule.delta(ships);
                return d ? real(d, reason, options) : undefined;
            }
            if (rule.levers === 'reboot' && reason && !(options && options.exempt)) {
                const key = `${reason}@${ships}`;
                if (seen.has(key)) return;
                seen.add(key);
                if (State.adversary.nudgeCooldowns) delete State.adversary.nudgeCooldowns[reason];
            }
            return real(delta, reason, options);
        };
    }

    const styleDef = STYLES[style] || graded(Number(style));
    const shipOnce = () => {
        const before = State.prestigeLevel;
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
        game.performPrestige({ confirmed: true, certifyOn: 'creation' });
        assert.equal(State.prestigeLevel, before + 1, `fixture check: the ship from reboot ${before} happened`);
    };
    const hour = (r) => {
        for (let slot = 0; slot < SLOTS_PER_HOUR; slot++) {
            clock.t += SLOT_MS;
            styleDef.act(env, clock, r, slot);
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
    return { marks, line, final: State.adversary.standing, env };
}
