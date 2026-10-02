#!/usr/bin/env node
/**
 * Fate, the house, dealing Patience.exe.
 *
 *   node tests/fate.mjs
 *
 * CasinoHostBarks sat unplayed for the life of the project: 80 lines and 12
 * lore whispers behind a casino that was never built and an
 * attemptLoreWhisper() nothing called. PatienceDealer gives every line a real
 * moment at the Patience.exe table. The properties that matter:
 *
 *   - REACHABILITY, proved from the real paths. Each moment is fired here by
 *     driving PatienceView the way a player does (open, deal, play, draw,
 *     Mulligan, file, concede, close, the window's own tick), not by calling
 *     the dealer with a hand-made event. The last check then asserts, against
 *     the table itself, that every line routes to a moment that was heard in
 *     this run or is listed in UNREACHABLE with a reason — so a line added
 *     later cannot fall out of reach silently.
 *   - She never pays. A round settles to the same State with her on or off.
 *   - The cooldowns hold: two seconds between any two lines, each line's
 *     authored cooldown (0 means 0 — it used to mean 10), and ambient lines
 *     wait for a quiet strip.
 *   - Whispers are rare, and only a round ending can produce one.
 *   - Dealer chatter off silences every one of her lines; a hostile save's
 *     setting is put back to the default rather than read for truthiness.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/game.js', 'js/solitaire.js'].map((f) => ({
    name: f,
    code: readFileSync(resolve(ROOT, f), 'utf8'),
}));

/* One clock and one random source for every booted world, so a test moves
   time and fixes a draw explicitly. */
let clock = Date.UTC(2026, 9, 1, 12, 0, 0);
const advance = (ms) => { clock += ms; };
class FakeDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(clock); }
    static now() { return clock; }
}
let rand = () => 0.5;
const FakeMath = Object.create(Math);
FakeMath.random = () => rand();

/* Every line spoken anywhere in this run, by moment. */
const heard = new Map();

/* The DOM the table needs, and nothing else: elements record their
   listeners so the test can dispatch the window's own mouseover and click. */
function makeElement(id) {
    const listeners = {};
    return {
        id, innerHTML: '', textContent: '', title: '', hidden: false, dataset: {}, offsetWidth: 0,
        listeners,
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        querySelector: () => null, querySelectorAll: () => [],
        closest: () => null, contains: () => true, appendChild: noop,
    };
}
const TABLE_IDS = ['patience-root', 'pt-felt', 'pt-status', 'pt-status-note', 'pt-dealer', 'pt-dealer-line'];

function boot(store = {}) {
    const said = [];
    const adv = [];
    const logged = [];
    const intervals = [];
    const dom = { open: false, els: {} };
    const sys = { top: 'solitaire' };
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math: FakeMath, Date: FakeDate, JSON, Number, Object, Array, String, Boolean, Set, Map,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop,
        setInterval: (fn) => { intervals.push(fn); return intervals.length; }, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        ui: new Proxy({
            displayHostBark: (bark) => said.push(bark),
            displayAdversaryBark: (bark) => adv.push(bark),
            log: (msg) => logged.push(msg),
            escapeHtml: (v) => String(v ?? ''),
            formatNumber: (v) => String(v),
        }, { get: (t, p) => (p in t ? t[p] : noop) }),
        system: new Proxy({ getTopWindowId: () => sys.top }, { get: (t, p) => (p in t ? t[p] : noop) }),
        requestAnimationFrame: noop,
        window: {},
        document: {
            getElementById: (id) => {
                if (!dom.open || !TABLE_IDS.includes(id)) return null;
                return (dom.els[id] = dom.els[id] || makeElement(id));
            },
            querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
            createElement: () => makeElement('span'), createTextNode: () => ({}),
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(
        '({ State, game, CasinoHostBarks, AdversaryBarks, PatienceRules, PatienceLedger, PatienceApp, PatienceDealer, PatienceView })', ctx);
    Object.assign(env, { said, adv, logged, intervals, dom, sys, store });
    // Record every line the dealer actually spoke, by its moment.
    const D = env.PatienceDealer;
    said.push = function (bark) {
        const moment = D.route(bark);
        if (!heard.has(moment)) heard.set(moment, new Set());
        heard.get(moment).add(bark.id);
        return Array.prototype.push.call(this, bark);
    };
    return env;
}

function bootWithSave(mutate) {
    const first = boot({});
    const save = JSON.parse(JSON.stringify(first.State));
    mutate(save);
    return boot({ cosmos_save: JSON.stringify(save) });
}

/* Opens the window the way system.openApp does: the DOM appears, onOpen runs. */
function openTable(env) {
    env.dom.open = true;
    env.dom.els = {};
    const before = env.intervals.length;
    env.PatienceView.open();
    env.tick = env.intervals[env.intervals.length - 1];
    assert.ok(env.intervals.length > before, 'the window keeps a tick');
    return env;
}
function closeTable(env) {
    env.dom.open = false;
    env.PatienceView.close();
}
const last = (env) => env.said[env.said.length - 1] || null;
const lastMoment = (env) => (last(env) ? env.PatienceDealer.route(last(env)) : null);
const quiet = () => advance(7000);

/* ── Rounds with known endings, found by playing the pure rules ───────── */
const R0 = boot().PatienceRules;
function playOut(seed, pick) {
    let s = R0.deal(seed);
    while (!R0.isOver(s)) {
        const plays = R0.legalPlays(s);
        const col = plays.length ? pick(s, plays) : null;
        s = col === null ? R0.draw(s) : R0.play(s, col);
        if (!s) return null;
    }
    return s;
}
const chainLen = (s, d = 0) => {
    let best = 0;
    for (const c of R0.legalPlays(s)) best = Math.max(best, 1 + (d < 8 ? chainLen(R0.play(s, c), d + 1) : 0));
    return best;
};
const PLAYERS = {
    first: (s, plays) => plays[0],
    greedy: (s, plays) => plays.reduce((b, c) => {
        const l = chainLen(R0.play(s, c));
        return l > b.l ? { c, l } : b;
    }, { c: plays[0], l: -1 }).c,
    // Draws the stock down first: a reliable way to finish badly.
    lazy: (s, plays) => (s.stock.length ? null : plays[0]),
};
const found = new Map();
function findRound(name, pred, players = ['first', 'greedy', 'lazy']) {
    if (found.has(name)) return found.get(name);
    for (let seed = 1; seed < 6000; seed++) {
        for (const p of players) {
            const s = playOut(seed, PLAYERS[p]);
            if (s && pred(s)) {
                const round = { seed, moves: s.moves.slice(), left: R0.tableauLeft(s), won: R0.isWon(s) };
                found.set(name, round);
                return round;
            }
        }
    }
    throw new Error(`no seed found for ${name}`);
}
const left = (lo, hi) => (s) => !R0.isWon(s) && R0.tableauLeft(s) >= lo && R0.tableauLeft(s) <= hi;

/* Plays a round through the View exactly as a player would: every card by
   PatienceView.play, every draw by PatienceView.draw, and a spent spread
   filed with PatienceView.file. Time stands still until the final action,
   so whatever she says at the end is said with the strip quiet. */
function drive(env, round, { finish = true } = {}) {
    env.PatienceApp.deal(round.seed);
    env.PatienceView.banner = null;
    const moves = round.moves;
    for (let i = 0; i < moves.length; i++) {
        if (i === moves.length - 1) quiet();
        const m = moves[i];
        if (m === 'd') env.PatienceView.draw();
        else env.PatienceView.play(Number(m.slice(1)));
    }
    if (finish && env.PatienceView.banner?.kind === 'stuck') {
        advance(3000);
        env.PatienceView.file();
    }
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

console.log('\nFate at Patience.exe\n');

/* ── Opening and closing the table ─────────────────────────────────────── */

check('first ever opening: a house rule, the table marked visited, the docs gate opened', () => {
    const env = openTable(boot());
    assert.equal(lastMoment(env), 'casino_first_visit');
    assert.equal(env.said.length, 1, 'one line on opening, not a burst');
    assert.equal(env.State.casino.visited, true);
    assert.equal(env.game.hostDialogue().visits, 1);
});

check('the deal that comes with opening is not a bet prompt', () => {
    const env = openTable(boot());
    assert.ok(env.said.every((b) => env.PatienceDealer.route(b) !== 'casino_bet_prompt'));
});

check('the rest of the house rules are read out over the first visit\'s deals, then bets', () => {
    const env = openTable(boot());
    const intros = new Set([last(env).id]);
    for (let i = 0; i < 3; i++) {
        quiet();
        env.PatienceView.newDeal();
        assert.equal(lastMoment(env), 'casino_first_visit', `deal ${i + 1} reads a rule`);
        intros.add(last(env).id);
    }
    assert.equal(intros.size, 4, 'four different rules, none repeated');
    quiet();
    env.PatienceView.newDeal();
    assert.equal(lastMoment(env), 'casino_bet_prompt');
});

check('a later opening greets; reopening within two minutes is "so soon"; after six hours, "I didn\'t move"', () => {
    const env = openTable(boot());
    closeTable(env);
    advance(10 * 60000);
    openTable(env);
    assert.equal(lastMoment(env), 'casino_enter');
    closeTable(env);
    advance(30000);
    openTable(env);
    assert.equal(last(env).id, 'CAS-HOST-050');
    closeTable(env);
    advance(7 * 3600000);
    openTable(env);
    assert.equal(last(env).id, 'CAS-HOST-049');
});

check('closing the window: her parting line, after the table is gone', () => {
    const env = openTable(boot());
    advance(5000);
    const before = env.said.length;
    closeTable(env);
    assert.equal(env.said.length, before + 1);
    assert.equal(lastMoment(env), 'casino_exit');
    assert.equal(env.PatienceDealer.visit, null);
});

/* ── Dealing ──────────────────────────────────────────────────────────── */

check('dealing a new round prompts a bet', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    quiet();
    env.PatienceView.newDeal();
    assert.equal(lastMoment(env), 'casino_bet_prompt');
});

check('the first deal of a visit at reduced Grace is the fatigue line, once', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000);
    const ledger = env.PatienceApp.ledger();
    ledger.fatigue = 5;
    ledger.fatigueAt = clock;
    openTable(env);
    assert.ok(env.PatienceApp.nextMultiplier() < 1, 'fixture: Grace is reduced');
    quiet();
    env.PatienceView.newDeal();
    assert.equal(lastMoment(env), 'casino_fatigue');
    quiet();
    env.PatienceView.newDeal();
    assert.equal(lastMoment(env), 'casino_bet_prompt', 'not every deal');
});

/* ── During a round ───────────────────────────────────────────────────── */

check('the table\'s own tick: thirty idle seconds at the table, once per lull, only on top and present', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    const n = () => env.said.length;
    advance(31000);
    const a = n();
    env.sys.top = 'console';
    env.tick();
    assert.equal(n(), a, 'another window on top: she is not at your elbow');
    env.sys.top = 'solitaire';
    env.game.presenceTracking = true;
    env.game.lastInputAt = clock - 5 * 60000;
    env.tick();
    assert.equal(n(), a, 'nobody at the keyboard, nobody to talk to');
    env.game.presenceTracking = false;
    env.tick();
    assert.equal(lastMoment(env), 'casino_idle_30s');
    const b = n();
    advance(31000);
    env.tick();
    assert.equal(n(), b, 'once per lull');
    env.PatienceView.draw();
    advance(31000);
    env.tick();
    assert.equal(lastMoment(env), 'casino_idle_30s', 'an action starts a new lull');
});

check('ten plays in a row without a draw: the table is hot', () => {
    const round = findRound('hot', (s) => {
        let run = 0;
        for (let i = 0; i < s.moves.length - 1; i++) {
            run = s.moves[i] === 'd' ? 0 : run + 1;
            if (run === 10) return true;
        }
        return false;
    });
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    quiet();
    env.PatienceApp.deal(round.seed);
    let run = 0;
    for (const m of round.moves) {
        if (m === 'd') { env.PatienceView.draw(); run = 0; continue; }
        env.PatienceView.play(Number(m.slice(1)));
        if (++run === 10) break;
    }
    assert.equal(last(env).id, 'CAS-HOST-071');
});

check('resting on the Grace pane is reading the odds, once a visit (the window\'s own mouseover)', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    quiet();
    const over = env.dom.els['patience-root'].listeners.mouseover[0];
    const onGrace = { target: { closest: (sel) => (sel === '.pt-pane--grace' ? {} : null) } };
    over({ target: { closest: () => null } });
    assert.notEqual(lastMoment(env), 'casino_read_odds', 'elsewhere is not the odds');
    over(onGrace);
    assert.equal(lastMoment(env), 'casino_read_odds');
    const n = env.said.length;
    quiet();
    over(onGrace);
    assert.equal(env.said.length, n, 'once a visit');
});

check('tapping the dealer strip twice: "Tap the dealer again..."', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    quiet();
    const click = env.dom.els['patience-root'].listeners.click[0];
    const tap = { target: { closest: (sel) => (sel === '[data-pt]' ? { dataset: { pt: 'dealer' } } : null) } };
    const n = env.said.length;
    click(tap);
    assert.equal(env.said.length, n, 'one tap is not "again"');
    advance(3000);
    click(tap);
    assert.equal(last(env).id, 'CAS-HOST-065');
    advance(30000);
    click(tap);
    assert.notEqual(env.said.length, n + 2, 'a tap long after is a first tap again');
});

check('paying a Divine Mulligan: undo is the minimum bet, reshuffle the maximum and her shuffle', () => {
    const round = findRound('long', left(8, 35));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    env.PatienceApp.deal(round.seed);
    for (const m of round.moves.slice(0, 6)) env.PatienceApp.act(m);
    // Pools in table order; rand picks the first, then the last.
    const pools = { undo: ['CAS-HOST-066', 'CAS-HOST-070', 'CAS-HOST-077'],
        reshuffle: ['CAS-HOST-066', 'CAS-HOST-070', 'CAS-HOST-075', 'CAS-HOST-078'] };
    for (const [kind, r, expect] of [['undo', 0, 'CAS-HOST-066'], ['reshuffle', 0.999, 'CAS-HOST-078']]) {
        env.State.resources.praise = env.State.resourceCaps.praise;
        quiet();
        rand = () => r;
        try { env.PatienceView.mulligan(kind); } finally { rand = () => 0.5; }
        assert.equal(last(env).id, expect);
        assert.equal(env.PatienceDealer.lines(['casino_mulligan', `casino_mulligan_${kind}`]).map((l) => l.id).join(), pools[kind].join());
    }
    // And the shared pool, from a fresh round.
    env.PatienceApp.deal(round.seed);
    for (const m of round.moves.slice(0, 6)) env.PatienceApp.act(m);
    env.State.resources.praise = env.State.resourceCaps.praise;
    quiet();
    rand = () => 0.999;
    try { env.PatienceView.mulligan('undo'); } finally { rand = () => 0.5; }
    assert.equal(last(env).id, 'CAS-HOST-077');
});

check('the spread is spent with an affordable Mulligan on offer: once a visit, and only then', () => {
    const round = findRound('loss', left(6, 14));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    const spent = () => env.said.filter((b) => b.id === 'CAS-HOST-067').length;
    env.State.resources.praise = 0;
    drive(env, round, { finish: false });
    assert.equal(env.PatienceView.banner?.kind, 'stuck');
    assert.equal(spent(), 0, 'an offer nobody can pay is not an offer');
    env.State.resources.praise = env.State.resourceCaps.praise;
    drive(env, round, { finish: false });
    assert.equal(last(env).id, 'CAS-HOST-067');
    drive(env, round, { finish: false });
    assert.equal(spent(), 1, 'once a visit');
});

check('filing the round with that Mulligan still affordable: "Keep it."', () => {
    const round = findRound('loss', left(6, 14));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    env.State.resources.praise = env.State.resourceCaps.praise;
    drive(env, round, { finish: false });
    advance(3000);
    env.PatienceView.file();
    assert.equal(last(env).id, 'CAS-HOST-076');
});

check('conceding a round in play for a new deal: cashing out', () => {
    const round = findRound('long', left(8, 35));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    env.PatienceApp.deal(round.seed);
    for (const m of round.moves.slice(0, 4)) env.PatienceApp.act(m);
    quiet();
    env.PatienceView.newDeal();
    assert.equal(last(env).id, 'CAS-HOST-063');
});

/* ── How a round ends ─────────────────────────────────────────────────── */

const ENDINGS = [
    ['a clear at full Grace: a big win, or the jackpot', 'won', (s) => R0.isWon(s), ['casino_win_big', 'casino_jackpot']],
    ['one or two cards from a clear: a near miss', 'near', left(1, 2), ['casino_near_miss']],
    ['three or four left: a small win', 'par', left(3, 4), ['casino_win_small']],
    ['exactly at par: "A tie!"', 'tie', left(5, 5), ['casino_tie']],
    ['over par with few left: a small loss', 'loss', left(6, 14), ['casino_lose_small']],
    ['fifteen or more left: a big loss', 'rout', left(15, 35), ['casino_lose_big']],
];
for (const [name, key, pred, moments] of ENDINGS) {
    check(`round end, ${name}`, () => {
        const round = findRound(key, pred);
        const env = openTable(boot());
        closeTable(env); advance(600000); openTable(env);
        drive(env, round);
        assert.equal(env.PatienceView.banner?.kind, 'result', 'the round settled');
        assert.ok(moments.includes(lastMoment(env)), `${lastMoment(env)} (${last(env)?.id})`);
    });
}

check('the jackpot line is only in the pool at full Grace', () => {
    const D = boot().PatienceDealer;
    const full = { won: true, parMet: true, streak: 1, cleared: 35, multiplier: 1 };
    const tired = { ...full, multiplier: 0.6 };
    const envA = openTable(boot());
    rand = () => 0.999; // the last line of the pool
    try {
        quiet(); envA.PatienceDealer.onSettle(full);
        assert.equal(last(envA).id, 'CAS-HOST-068', 'jackpot joins the clear at full Grace');
        const envB = openTable(boot());
        quiet(); envB.PatienceDealer.onSettle(tired);
        assert.equal(lastMoment(envB), 'casino_win_big');
    } finally { rand = () => 0.5; }
    void D;
});

check('a par round after paying a Mulligan: "every win is a loan"', () => {
    const round = findRound('par', left(3, 4));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    env.PatienceApp.deal(round.seed);
    const moves = round.moves;
    for (const m of moves.slice(0, -1)) env.PatienceApp.act(m);
    env.State.resources.praise = env.State.resourceCaps.praise;
    env.PatienceView.mulligan('undo');   // withdraw the second-to-last move...
    env.PatienceApp.act(moves[moves.length - 2]); // ...and make it again
    env.State.resources.praise = 0;      // nothing left on offer to decline
    quiet();
    const last1 = moves[moves.length - 1];
    if (last1 === 'd') env.PatienceView.draw(); else env.PatienceView.play(Number(last1.slice(1)));
    advance(3000);
    if (env.PatienceView.banner?.kind === 'stuck') env.PatienceView.file();
    assert.equal(last(env).id, 'CAS-HOST-072');
});

check('streaks: the par streak at 3, 5 and 10; the run under par at 3, 5 and 10', () => {
    const par = findRound('par', left(3, 4));
    const loss = findRound('loss', left(6, 14));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    const cases = [
        [par, () => { env.PatienceApp.ledger().parStreak = 2; }, (b) => ['CAS-HOST-036', 'CAS-HOST-037'].includes(b.id)],
        [par, () => { env.PatienceApp.ledger().parStreak = 4; }, (b) => b.id === 'CAS-HOST-035'],
        [par, () => { env.PatienceApp.ledger().parStreak = 9; }, (b) => b.id === 'CAS-HOST-038'],
        [loss, () => { env.game.hostDialogue().loseStreak = 2; }, (b) => b.id === 'CAS-HOST-039'],
        [loss, () => { env.game.hostDialogue().loseStreak = 4; }, (b) => b.id === 'CAS-HOST-040'],
        [loss, () => { env.game.hostDialogue().loseStreak = 9; }, (b) => b.id === 'CAS-HOST-041'],
    ];
    for (const [round, setup, ok] of cases) {
        setup();
        drive(env, round);
        assert.ok(ok(last(env)), `got ${last(env).id}`);
        advance(10000);
        env.PatienceView.newDeal();
    }
});

check('the fifteenth loss in a row does not promise a chip it will not give', () => {
    const loss = findRound('loss', left(6, 14));
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    env.game.hostDialogue().loseStreak = 14;
    drive(env, loss);
    assert.equal(env.game.hostDialogue().loseStreak, 15);
    assert.notEqual(last(env).id, 'CAS-HOST-042');
    assert.equal(lastMoment(env), 'casino_lose_small');
    assert.equal(env.State.casino.fateTokens, 0);
});

check('streak bookkeeping: a par round ends the run under par', () => {
    const env = openTable(boot());
    env.game.hostDialogue().loseStreak = 7;
    drive(env, findRound('par', left(3, 4)));
    assert.equal(env.game.hostDialogue().loseStreak, 0);
});

/* ── Whispers ─────────────────────────────────────────────────────────── */

check('a whisper only ever comes as a round ends (with the draw forced to always pass)', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000);
    rand = () => 0;
    try {
        openTable(env);
        quiet(); env.PatienceView.newDeal();   // a deal is not a round end
        const round = findRound('loss', left(6, 14));
        env.PatienceApp.deal(round.seed);
        for (const m of round.moves.slice(0, -1)) {
            advance(7000);
            if (m === 'd') env.PatienceView.draw(); else env.PatienceView.play(Number(m.slice(1)));
            advance(7000); env.tick();
            advance(31000); env.tick();
        }
        quiet(); env.PatienceView.newDeal();
        assert.ok(env.said.slice(0, -1).every((b) => b.context !== 'LoreWhisper'), 'a whisper outside a round end');
        assert.equal(last(env).context, 'LoreWhisper', 'the concede was a round end');
        assert.equal(env.game.hostDialogue().loreWhispersHeard.length, 1);
    } finally { rand = () => 0.5; }
});

check('whispers are rare (~5% of round ends) and unheard ones come first', () => {
    const env = openTable(boot());
    rand = Math.random;
    try {
        let whispers = 0;
        const N = 4000;
        for (let i = 0; i < N; i++) {
            advance(130000); // past every whisper's 120s cooldown
            const b = env.PatienceDealer.onSettle({ won: false, parMet: false, streak: 0, cleared: 25, multiplier: 1 });
            if (b && b.context === 'LoreWhisper') whispers++;
        }
        const rate = whispers / N;
        assert.ok(rate > 0.03 && rate < 0.075, `whisper rate ${rate}`);
        assert.equal(env.game.hostDialogue().loreWhispersHeard.length, 12, 'all twelve heard, none twice before that');
    } finally { rand = () => 0.5; }
    // And the very first twelve whispers are twelve different lines.
    const env2 = openTable(boot());
    rand = () => 0;
    try {
        const ids = [];
        // Past every whisper's own cooldown each time, so only the preference
        // for unheard lines can keep the first one from repeating.
        for (let i = 0; i < 12; i++) { advance(130000); ids.push(env2.PatienceDealer.onSettle({ won: false, parMet: false, streak: 0, cleared: 25, multiplier: 1 }).id); }
        assert.equal(new Set(ids).size, 12);
    } finally { rand = () => 0.5; }
});

/* ── NULL.OPERATOR at her table, and her answer ───────────────────────── */

function contacted(choice = 'OP-C') {
    const env = boot();
    env.State.adversary.contacted = true;
    env.game.resolveAdversaryChoice(choice);
    // Resolving unlocks Mirror Login, and he has a line about achievements;
    // clear his clock so the table is the first thing he reacts to.
    env.State.adversary.barks.lastBarkTime = 0;
    env.State.adversary.barks.cooldowns = {};
    env.adv.length = 0;
    return env;
}

check('before contact he says nothing at her table', () => {
    const env = openTable(boot());
    assert.equal(env.adv.length, 0);
});

check('after contact, opening Patience.exe: ADV-BARK-04, and a beat later she answers him', () => {
    const env = openTable(contacted());
    assert.equal(env.adv.at(-1)?.id, 'ADV-BARK-04');
    const n = env.said.length;
    advance(1000); env.tick();
    assert.equal(env.said.length, n, 'not over the top of him');
    advance(2000); env.tick();
    assert.ok(['CAS-HOST-081', 'CAS-HOST-082', 'CAS-HOST-080'].includes(last(env).id), last(env).id);
});

check('after contact, the fifth par round in a row: ADV-L-15, answered', () => {
    const env = openTable(contacted());
    env.State.adversary.barks.lastBarkTime = 0;
    env.State.adversary.barks.cooldowns = {};
    env.PatienceApp.ledger().parStreak = 4;
    drive(env, findRound('par', left(3, 4)));
    assert.equal(env.adv.at(-1)?.id, 'ADV-L-15');
    advance(3000); env.tick();
    assert.ok(['CAS-HOST-083', 'CAS-HOST-080'].includes(last(env).id), last(env).id);
});

check('after contact, the fifth round under par in a row: ADV-L-16, answered', () => {
    const env = openTable(contacted());
    env.State.adversary.barks.lastBarkTime = 0;
    env.State.adversary.barks.cooldowns = {};
    env.game.hostDialogue().loseStreak = 4;
    drive(env, findRound('loss', left(6, 14)));
    assert.equal(env.adv.at(-1)?.id, 'ADV-L-16');
    const pool = env.PatienceDealer.lines(['casino_rival', 'casino_second_voice'], { answers: 'ADV-L-16' }).map((l) => l.id);
    assert.equal(pool.join(), 'CAS-HOST-080,CAS-HOST-084');
    advance(3000);
    rand = () => 0.999; // the last of the pool: her own answer to this one
    try { env.tick(); } finally { rand = () => 0.5; }
    assert.equal(last(env).id, 'CAS-HOST-084');
});

check('hostile hears none of the table triggers (he stays rare)', () => {
    const env = openTable(contacted('OP-A'));
    assert.equal(env.adv.length, 0);
});

/* ── Cooldowns ────────────────────────────────────────────────────────── */

check('two seconds between any two of her lines, and each line\'s authored cooldown (0 means 0)', () => {
    const env = boot();
    const g = env.game;
    const line = (id) => env.CasinoHostBarks.find((b) => b.id === id);
    g.playHostBark(line('CAS-HOST-001'), false, clock);
    assert.equal(g.canBarkPlay(line('CAS-HOST-006'), clock + 1999), false, 'global 2s');
    assert.equal(g.canBarkPlay(line('CAS-HOST-006'), clock + 2000), true);
    g.playHostBark(line('CAS-HOST-006'), false, clock + 2000);
    assert.equal(g.canBarkPlay(line('CAS-HOST-006'), clock + 4000), true, 'an authored cooldown of 0 is 0, not 10');
    assert.equal(g.canBarkPlay(line('CAS-HOST-001'), clock + 9999), false, 'its own 10s');
    assert.equal(g.canBarkPlay(line('CAS-HOST-001'), clock + 10000), true);
    g.playHostBark(line('CAS-HOST-051'), false, clock + 20000);
    assert.equal(g.canBarkPlay(line('CAS-HOST-051'), clock + 20000 + 119999), false, 'a whisper waits 120s');
});

check('through the table: two moments inside two seconds, the second is silent', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    const round = findRound('long', left(8, 35));
    env.PatienceApp.deal(round.seed);
    for (const m of round.moves.slice(0, 4)) env.PatienceApp.act(m);
    quiet();
    env.State.resources.praise = env.State.resourceCaps.praise;
    env.PatienceView.mulligan('undo');
    const n = env.said.length;
    advance(1500);
    env.PatienceView.newDeal(); // a concede: an event, but inside the 2s
    assert.equal(env.said.length, n);
});

check('ambient lines wait for a quiet strip: a deal six seconds after her last line', () => {
    const env = openTable(boot());
    closeTable(env); advance(600000); openTable(env);
    const n = env.said.length;
    advance(5000);
    env.PatienceView.newDeal();
    assert.equal(env.said.length, n, 'no bet prompt over her own greeting');
    advance(1500);
    env.PatienceView.newDeal();
    assert.equal(lastMoment(env), 'casino_bet_prompt');
});

/* ── Dealer chatter ───────────────────────────────────────────────────── */

check('chatter off silences every one of her lines, whispers included', () => {
    const env = boot();
    env.PatienceDealer.setChatter(false);
    assert.equal(env.State.settings.dealerChatter, false);
    rand = () => 0;
    try {
        openTable(env);
        quiet(); env.PatienceView.newDeal();
        drive(env, findRound('won', (s) => R0.isWon(s)));
        quiet(); env.PatienceView.newDeal();
        advance(31000); env.tick();
        closeTable(env);
        openTable(env);
    } finally { rand = () => 0.5; }
    assert.equal(env.said.length, 0, env.said.map((b) => b.id).join());
    assert.equal(env.game.hostDialogue().loreWhispersHeard.length, 0);
    closeTable(env);
    env.PatienceDealer.setChatter(true);
    advance(600000); openTable(env);
    assert.equal(env.said.length, 1, 'and on again');
});

check('a hostile setting normalises to the default instead of being read for truthiness', () => {
    for (const hostile of ['false', 0, null, 'off', {}, [], 1]) {
        const env = boot();
        env.State.settings.dealerChatter = hostile;
        assert.equal(env.game.dealerChatterOn(), true, `${JSON.stringify(hostile)} read as on`);
        assert.equal(env.State.settings.dealerChatter, true, `${JSON.stringify(hostile)} written back`);
    }
    const env = boot();
    env.PatienceDealer.setChatter('false');
    assert.equal(env.State.settings.dealerChatter, false, 'setChatter takes only a real true');
    const loaded = bootWithSave((s) => { s.settings.dealerChatter = 'no'; });
    assert.equal(loaded.game.dealerChatterOn(), true, 'through the real loader');
    const fresh = boot();
    assert.equal(fresh.State.settings.dealerChatter, true, 'schema default');
});

check('a hostile dealer memory normalises: no future mute, no strangers, no negative counts', () => {
    const env = bootWithSave((s) => {
        s.casino.hostDialogue = {
            lastBarkId: '<img>', lastBarkTime: 9e15, barkCooldowns: { 'CAS-HOST-001': 9e15, nope: 5, 'CAS-HOST-002': 'x' },
            loreWhispersHeard: ['CAS-HOST-051', 'CAS-HOST-051', 'CAS-HOST-001', 7], lastSeenAt: NaN, visits: -3, loseStreak: 'many',
        };
    });
    const memo = env.game.hostDialogue();
    assert.equal(memo.lastBarkId, null);
    assert.ok(memo.lastBarkTime <= clock, 'a future lastBarkTime would mute her forever');
    assert.equal(Object.keys(memo.barkCooldowns).join(), 'CAS-HOST-001');
    assert.ok(memo.barkCooldowns['CAS-HOST-001'] <= clock);
    assert.equal(memo.loreWhispersHeard.join(), 'CAS-HOST-051');
    assert.equal(memo.lastSeenAt, 0);
    assert.equal(memo.visits, 0);
    assert.equal(memo.loseStreak, 0);
    advance(15000);
    openTable(env);
    assert.equal(env.said.length, 1, 'and she can still speak');
    const gone = bootWithSave((s) => { s.casino = 'gone'; });
    openTable(gone);
    assert.equal(gone.said.length, 1, 'a casino block that is not an object');
});

/* ── She never pays ───────────────────────────────────────────────────── */

check('a round settles to the same State with the dealer on or off', () => {
    const snapshot = (env) => JSON.stringify({
        res: env.State.resources, adoration: env.State.adoration,
        oc: env.State.loopSystems?.overclock, ledger: { ...env.PatienceApp.ledger(), round: null },
        tokens: env.State.casino.fateTokens, ach: env.State.achievements,
        docs: env.State.documents?.collected,
    });
    const run = (on) => {
        const env = boot();
        env.State.settings.dealerChatter = on;
        env.game.hostDialogue().loseStreak = 14; // the would-be pity chip
        env.PatienceApp.ledger().parStreak = 4;
        openTable(env);
        drive(env, findRound('won', (s) => R0.isWon(s)));
        drive(env, findRound('rout', left(15, 35)));
        return snapshot(env);
    };
    // CAS-HOST-042 carries an `effect` (five Fate Tokens). Even played by
    // hand, the router never runs it.
    const direct = boot();
    direct.State.casino.visited = true;
    direct.game.playHostBark(direct.CasinoHostBarks.find((b) => b.id === 'CAS-HOST-042'));
    assert.equal(direct.State.casino.fateTokens, 0, 'a line paid out');
    rand = () => 0;
    const t0 = clock;
    try {
        const on = run(true);
        const t1 = clock;
        clock = t0;      // the same round at the same instants
        const off = run(false);
        assert.equal(clock, t1, 'fixture: both runs took the same time');
        assert.ok(on.includes('"bestParStreak":5'), 'fixture: the clear extended the streak');
        assert.equal(on, off);
    } finally { rand = () => 0.5; }
});

/* ── The table, and every line in it ──────────────────────────────────── */

check('every line in CasinoHostBarks is reachable from a moment heard in this run, or listed with a reason', () => {
    const env = boot();
    const D = env.PatienceDealer;
    const table = env.CasinoHostBarks;
    assert.equal(table.filter((l) => /^CAS-HOST-0([0-7]\d|80)$/.test(l.id)).length, 80, 'the 80 authored lines');
    assert.equal(table.filter((l) => l.context === 'LoreWhisper').length, 12, 'the 12 whispers');
    assert.equal(new Set(table.map((l) => l.id)).size, table.length, 'ids are unique');

    for (const id of Object.keys(D.ROUTES)) assert.ok(table.some((l) => l.id === id), `ROUTES names ${id}`);
    for (const id of Object.keys(D.STREAK)) assert.ok(table.some((l) => l.id === id), `STREAK names ${id}`);
    for (const [id, why] of Object.entries(D.UNREACHABLE)) {
        assert.ok(table.some((l) => l.id === id), `UNREACHABLE names ${id}`);
        assert.ok(typeof why === 'string' && why.length > 40, `${id} needs its reason`);
    }

    // Every moment the dealer declares was actually heard from a real path above.
    const unheard = Object.keys(D.MOMENTS).filter((m) => !heard.has(m));
    assert.deepEqual(unheard, [], `declared moments never heard: ${unheard}`);

    const unreachable = [];
    for (const line of table) {
        if (D.UNREACHABLE[line.id]) {
            assert.equal(D.lines([D.route(line)], { streak: D.STREAK[line.id], answers: line.answers }).some((l) => l.id === line.id),
                false, `${line.id} is listed unreachable but can play`);
            continue;
        }
        const moment = D.route(line);
        const ctx = { answers: line.answers, streak: D.STREAK[line.id] ?? 3 };
        const candidate = heard.has(moment) && D.lines([moment], ctx).some((l) => l.id === line.id);
        if (!candidate) unreachable.push(`${line.id} (${moment})`);
    }
    assert.deepEqual(unreachable, [], `lines with no moment: ${unreachable.join(', ')}`);
});

console.log(`\n${passed} passed\n`);
