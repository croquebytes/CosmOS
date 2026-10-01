#!/usr/bin/env node
/**
 * Patience.exe — rules, ledger and economy seam.
 *
 *   node tests/solitaire.mjs
 *
 * The properties that matter, stated so a test cannot quietly assert a
 * neighbouring one instead:
 *
 *   - The deal is a pure function of the seed. Persistence, undo and replay
 *     all stand on that; if it drifts, a reload deals a different table under
 *     the player's move log.
 *   - Golf does not wrap. A King on an Ace is the single most common bug in
 *     Golf implementations because |13 - 1| looks like "far apart" until
 *     someone adds modular arithmetic "for symmetry".
 *   - This must never become the best way to earn. The fatigue schedule and
 *     the caps are the guarantee, so they are pinned by number, and the grant
 *     path is checked by spying on it rather than by inspecting State after
 *     the fact — a hand-rolled `State.adoration +=` would pass a State check
 *     and silently skip the cap.
 *   - Hostile saves. `x = x || default` keeps every truthy wrong value (see
 *     335f41f), and a bestScore of 0 is falsy, so the lazy version would also
 *     destroy a legitimate record.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* deal(1), flattened column by column. A golden value: if the RNG or the
   deal order ever changes, every round saved in the wild replays its move
   log onto a different table. Changing this is a save-compatibility event. */
const PINNED_SEED_1 = '24,41,11,27,12,44,6,3,45,1,23,29,49,38,36,10,35,33,30,37,43,22,8,7,25,31,40,14,21,47,50,34,4,16,2';
const noop = () => {};
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/game.js', 'js/solitaire.js'].map((f) => ({
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
        '({ State, game, PatienceRules: PatienceRules, PatienceLedger, PatienceApp, ShopItemList, PRISTINE })', ctx);
    env.store = store;
    return env;
}

/* Boot with a save already in storage, the way a returning player loads. */
function bootWithSave(mutate) {
    const first = boot({});
    const save = JSON.parse(JSON.stringify(first.State));
    mutate(save);
    return boot({ cosmos_save: JSON.stringify(save) });
}

/* Values from inside the vm context carry that context's Array and Object
   prototypes, which strict deepEqual rejects even when the contents match.
   Compare the data, not the realm. */
const plain = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const same = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);
const differ = (a, b, m) => assert.notDeepEqual(plain(a), plain(b), m);

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

const { PatienceRules: R, PatienceLedger: L } = boot();
const card = (suit, rank) => R.SUITS.indexOf(suit) * 13 + (rank - 1);

/* A hand-built position: one exposed card per listed column, a given waste
   top, and a stock of `stock` filler cards. */
function position(tops, wasteTop, { stock = 0, wrap = false } = {}) {
    const tableau = Array.from({ length: 7 }, (_, i) => (tops[i] === undefined ? [] : [tops[i]]));
    return {
        seed: 1, wrap, tableau,
        stock: Array.from({ length: stock }, (_, i) => card('cherub', (i % 13) + 1)),
        waste: [wasteTop], reshuffled: false, moves: [],
    };
}

/* Plays a seed with first-legal-move until the rules say it is over. */
function playOut(rules, seed) {
    let s = rules.deal(seed);
    for (let guard = 0; !rules.isOver(s); guard++) {
        // 35 plays + 16 draws is the longest honest round.
        assert.ok(guard < 60, `seed ${seed} never ended`);
        const plays = rules.legalPlays(s);
        const next = plays.length ? rules.play(s, plays[0]) : rules.draw(s);
        assert.ok(next, `seed ${seed}: not over, yet nothing to play or draw`);
        s = next;
    }
    return s;
}

/* The first seed (from `from`) whose first-legal playout satisfies `pred`. */
function seedWhere(rules, pred, from = 1) {
    for (let seed = from; seed < from + 5000; seed++) if (pred(playOut(rules, seed))) return seed;
    throw new Error('no seed in 5000 satisfies the predicate');
}

/* Drives the app's round to its end with first-legal play, bounded. */
function driveApp(env, now) {
    let state = env.PatienceApp.current();
    for (let guard = 0; env.PatienceApp.ledger().round && state && !env.PatienceRules.isOver(state); guard++) {
        assert.ok(guard < 60, 'the round never ended');
        const plays = env.PatienceRules.legalPlays(state);
        assert.ok(env.PatienceApp.act(plays.length ? `p${plays[0]}` : 'd', now), 'act refused a legal move');
        state = env.PatienceApp.current();
    }
}

console.log('\nPatience.exe\n');

/* ── The deal ───────────────────────────────────────────────────────────── */

check('the same seed deals the same table, and a different seed does not', () => {
    const a = R.deal(424242);
    const b = R.deal(424242);
    same(a, b);
    const c = R.deal(424243);
    differ(c.tableau, a.tableau);
});

check('a deal is 7 columns of 5, a 16-card stock and one card turned to the waste, all 52 distinct', () => {
    const s = R.deal(7);
    assert.equal(s.tableau.length, 7);
    for (const col of s.tableau) assert.equal(col.length, 5);
    assert.equal(s.stock.length, 16);
    assert.equal(s.waste.length, 1);
    const all = [...s.tableau.flat(), ...s.stock, ...s.waste];
    assert.equal(new Set(all).size, 52);
    assert.ok(all.every((c) => Number.isInteger(c) && c >= 0 && c < 52));
});

check('the deal is pinned: seed 1 deals exactly the table it always has', () => {
    const fingerprint = R.deal(1).tableau.flat().join(',');
    assert.equal(fingerprint, PINNED_SEED_1, `deal(1) changed: ${fingerprint}`);
});

/* ── Legal moves ────────────────────────────────────────────────────────── */

check('one rank above or below the waste is legal, in any house', () => {
    const s = position([card('seraph', 6), card('throne', 8), card('dominion', 7), card('cherub', 5)], card('cherub', 7));
    same(R.legalPlays(s), [0, 1]);
});

check('same rank and two apart are illegal', () => {
    const s = position([card('seraph', 7), card('throne', 9), card('dominion', 5)], card('cherub', 7));
    same(R.legalPlays(s), []);
});

check('no wrap by default: a King does not reach an Ace, nor an Ace a King', () => {
    assert.equal(R.isLegalPlay(position([card('seraph', 1)], card('throne', 13)), 0), false);
    assert.equal(R.isLegalPlay(position([card('seraph', 13)], card('throne', 1)), 0), false);
    // ...but a Queen still plays on a King, and a Two on an Ace.
    assert.equal(R.isLegalPlay(position([card('seraph', 12)], card('throne', 13)), 0), true);
    assert.equal(R.isLegalPlay(position([card('seraph', 2)], card('throne', 1)), 0), true);
});

check('wrap is an explicit option, and when on, K and A connect', () => {
    assert.equal(R.isLegalPlay(position([card('seraph', 1)], card('throne', 13), { wrap: true }), 0), true);
    assert.equal(R.isLegalPlay(position([card('seraph', 13)], card('throne', 1), { wrap: true }), 0), true);
    assert.equal(R.deal(5).wrap, false);
});

check('an empty column and an out-of-range column are never legal', () => {
    const s = position([undefined, card('seraph', 6)], card('cherub', 7));
    assert.equal(R.isLegalPlay(s, 0), false);
    assert.equal(R.isLegalPlay(s, 7), false);
    assert.equal(R.isLegalPlay(s, -1), false);
    assert.equal(R.isLegalPlay(s, 1.5), false);
});

check('play moves the exposed card to the waste, logs it, and never mutates its input', () => {
    const s = position([card('seraph', 6)], card('cherub', 7));
    const before = JSON.stringify(s);
    const next = R.play(s, 0);
    assert.equal(JSON.stringify(s), before);
    same(next.tableau[0], []);
    assert.equal(R.wasteTop(next), card('seraph', 6));
    same(next.moves, ['p0']);
    assert.equal(R.play(s, 1), null);
});

check('draw turns the stock top onto the waste; an empty stock cannot draw', () => {
    const s = R.deal(9);
    const top = s.stock[s.stock.length - 1];
    const next = R.draw(s);
    assert.equal(R.wasteTop(next), top);
    assert.equal(next.stock.length, 15);
    assert.equal(R.draw({ ...s, stock: [] }), null);
});

check('reshuffle returns the waste under its top to a fresh stock, keeps every card, and only once', () => {
    let s = R.deal(11);
    for (let i = 0; i < 6; i++) s = R.draw(s);
    const top = R.wasteTop(s);
    const r = R.reshuffle(s);
    assert.equal(R.wasteTop(r), top);
    assert.equal(r.waste.length, 1);
    assert.equal(r.stock.length, s.stock.length + s.waste.length - 1);
    assert.equal(new Set([...r.tableau.flat(), ...r.stock, ...r.waste]).size, 52);
    same(R.reshuffle(s), r, 'deterministic');
    // Refill the waste first, so it is the once-per-round rule that refuses
    // and not merely the empty-waste guard.
    const refilled = R.draw(R.draw(r));
    assert.ok(refilled.waste.length >= 2);
    assert.equal(R.reshuffle(refilled), null, 'a second reshuffle is refused');
    assert.equal(R.reshuffle(R.deal(11)), null, 'nothing under the waste to reshuffle');
});

check('replay stops at the first illegal move instead of skipping it', () => {
    const honest = R.deal(3);
    const drawn = R.draw(honest);
    const replayed = R.replay(3, ['d', 'p9', 'd', 'd']);
    same(replayed, drawn);
    same(R.replay(3, ['r', 'r']).moves, [], 'reshuffle with an empty waste-under is refused');
    same(R.replay(3, 'not an array').moves, []);
});

/* ── Win, stuck, score ──────────────────────────────────────────────────── */

check('an empty tableau is a win, and scores the unused stock as a negative', () => {
    const s = position([], card('cherub', 7), { stock: 4 });
    assert.equal(R.isWon(s), true);
    assert.equal(R.isWon(position([card('seraph', 2)], card('cherub', 7))), false, 'one card left is not a win');
    assert.equal(R.isStuck(s), false);
    assert.equal(R.score(s), -4);
});

check('stuck means no play AND no stock — a play left or a card to draw is not stuck', () => {
    const dead = position([card('seraph', 3), card('throne', 11)], card('cherub', 7));
    assert.equal(R.isStuck(dead), true);
    assert.equal(R.score(dead), 2);
    assert.equal(R.isStuck(position([card('seraph', 6)], card('cherub', 7))), false, 'a play is left');
    assert.equal(R.isStuck(position([card('seraph', 3)], card('cherub', 7), { stock: 1 })), false, 'can draw');
});

check('a played-out deal always ends won or stuck, and its score is the cards left', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const s = playOut(R, seed);
        assert.ok(R.isWon(s) || R.isStuck(s));
        if (!R.isWon(s)) assert.equal(R.score(s), R.tableauLeft(s));
        assert.equal(R.cardsCleared(s), 35 - R.tableauLeft(s));
    }
});

/* ── The ledger ─────────────────────────────────────────────────────────── */

check('fatigue: three rounds pay in full, then 0.6, 0.36, 0.216, 0.1296, and a 10% floor', () => {
    assert.equal(L.multiplier(0), 1);
    assert.equal(L.multiplier(2.99), 1);
    assert.equal(L.multiplier(3), 0.6);
    assert.ok(Math.abs(L.multiplier(4) - 0.36) < 1e-12);
    assert.ok(Math.abs(L.multiplier(5) - 0.216) < 1e-12);
    assert.ok(Math.abs(L.multiplier(6) - 0.1296) < 1e-12);
    assert.equal(L.multiplier(7), 0.1);
    assert.equal(L.multiplier(50), 0.1);
    assert.equal(L.multiplier(-4), 1);
    assert.equal(L.multiplier(NaN), 1);
});

check('fatigue drains at three rounds an hour, and a future timestamp cannot freeze it', () => {
    const t0 = 1_800_000_000_000;
    assert.equal(L.fatigueNow(5, t0, t0), 5);
    assert.ok(Math.abs(L.fatigueNow(5, t0, t0 + 3_600_000) - 2) < 1e-9);
    assert.equal(L.fatigueNow(5, t0, t0 + 10 * 3_600_000), 0);
    assert.equal(L.fatigueNow(5, t0 + 3_600_000, t0), 5, 'future since: no drain, but no growth');
    assert.equal(L.fatigueNow(-3, t0, t0), 0);
});

check('payout: a perfect round is 35 + 15 + streak bonus Adoration and 25.5 charge', () => {
    const p = L.payout({ cleared: 35, won: true, tableauLeft: 0 }, { fatigue: 0, streak: 3 });
    assert.equal(p.adoration, 35 + 15 + 20);
    assert.equal(p.charge, 25.5);
    assert.equal(p.parMet, true);
    assert.equal(p.streak, 4);
});

check('par is 5 left or fewer; missing it pays no bonus and resets the streak', () => {
    assert.equal(L.PAR, 5);
    const at = L.payout({ cleared: 30, won: false, tableauLeft: 5 }, { streak: 0 });
    assert.equal(at.parMet, true);
    assert.equal(at.adoration, 30 + 5);
    const over = L.payout({ cleared: 29, won: false, tableauLeft: 6 }, { streak: 3 });
    assert.equal(over.parMet, false);
    assert.equal(over.streak, 0);
    assert.equal(over.adoration, 29);
    assert.equal(over.charge, 14.5);
});

check('the streak bonus climbs 5/10/15/20 and stops there', () => {
    const bonus = (streak) => L.payout({ cleared: 30, won: false, tableauLeft: 5 }, { streak }).adoration - 30;
    same([0, 1, 2, 3, 4, 9].map(bonus), [5, 10, 15, 20, 20, 20]);
});

check('payout scales by the fatigue multiplier', () => {
    const full = L.payout({ cleared: 30, won: false, tableauLeft: 8 }, { fatigue: 0 });
    const tired = L.payout({ cleared: 30, won: false, tableauLeft: 8 }, { fatigue: 4 });
    assert.equal(full.adoration, 30);
    assert.equal(tired.adoration, Math.round(30 * 0.36 * 10) / 10);
    assert.equal(tired.charge, Math.round(15 * 0.36 * 10) / 10);
});

check('mulligan prices are a fixed fraction of the Praise cap at every scale', () => {
    for (const cap of [1000, 7000, 250_000, 4e9]) {
        assert.equal(L.mulliganCost('undo', cap), Math.ceil(cap * 0.05));
        assert.equal(L.mulliganCost('reshuffle', cap), Math.ceil(cap * 0.15));
    }
    // Scales with the cap, never a hard-coded absolute.
    assert.equal(L.mulliganCost('undo', 2e6) / L.mulliganCost('undo', 2e4), 100);
    assert.equal(L.mulliganCost('undo', 0), 1, 'never free');
    assert.equal(L.mulliganCost('undo', NaN), 1);
    assert.equal(L.mulliganCost('bribe', 1000), Infinity);
});

/* ── The economy seam ───────────────────────────────────────────────────── */

/* The first seed whose opening deal has a play on it. */
function openingPlay(rules) {
    for (let seed = 1; ; seed++) {
        const col = rules.legalPlays(rules.deal(seed))[0];
        if (col !== undefined) return { seed, col };
    }
}

check('payouts go through game.addCappedResource and game.gainOverclockCharge', () => {
    const env = boot();
    const calls = { capped: [], charge: [] };
    const capped = env.game.addCappedResource.bind(env.game);
    const charge = env.game.gainOverclockCharge.bind(env.game);
    env.game.addCappedResource = (...a) => { calls.capped.push(a); return capped(...a); };
    env.game.gainOverclockCharge = (...a) => { calls.charge.push(a); return charge(...a); };
    const { seed, col } = openingPlay(env.PatienceRules);
    env.PatienceApp.deal(seed, 1e12);
    env.PatienceApp.act(`p${col}`, 1e12);
    const result = env.PatienceApp.settle(1e12);
    assert.equal(result.cleared, 1);
    assert.equal(calls.capped.length, 1);
    assert.equal(calls.capped[0][0], env.State);
    assert.equal(calls.capped[0][1], 'adoration');
    assert.equal(calls.capped[0][2], env.State.adorationCaps.cosmetics);
    assert.equal(calls.capped[0][3], 1);
    assert.equal(calls.charge.length, 1);
    assert.equal(calls.charge[0][0], 0.5);
});

check('Adoration from a round stops at the Adoration cap, and charge at 100', () => {
    const env = boot();
    const cap = env.State.adorationCaps.cosmetics;
    env.State.adoration = cap - 0.5;
    env.game.ensureLoopState();
    env.State.loopSystems.overclock.charge = 99.8;
    const { seed, col } = openingPlay(env.PatienceRules);
    env.PatienceApp.deal(seed, 1e12);
    env.PatienceApp.act(`p${col}`, 1e12);
    for (let i = 0; i < 4; i++) env.PatienceApp.act('d', 1e12);
    const r = env.PatienceApp.settle(1e12);
    assert.ok(r.cleared >= 1);
    assert.equal(env.State.adoration, cap);
    assert.ok(r.cleared >= 1, 'owed at least a full point of Adoration');
    assert.equal(r.adoration, 0.5, 'reports what was actually granted, not what was owed');
    assert.equal(env.State.loopSystems.overclock.charge, 100);
});

check('five rounds in a sitting pay 100/100/100/60/36 percent; an hour away restores three', () => {
    const t0 = 1_800_000_000_000;
    const rates = [];
    const env2 = boot();
    for (let i = 0; i < 5; i++) {
        env2.PatienceApp.deal(200 + i, t0);
        env2.PatienceApp.act('d', t0);
        rates.push(env2.PatienceApp.settle(t0).multiplier);
    }
    same(rates.map((x) => Math.round(x * 100)), [100, 100, 100, 60, 36]);
    assert.equal(env2.PatienceApp.nextMultiplier(t0 + 3_600_000), 1, 'fatigue 5 drains to 2');
    assert.equal(env2.State.casino.solitaire.rounds, 5);
});

check('a round withdrawn before any move pays nothing and costs no fatigue', () => {
    const env = boot();
    env.PatienceApp.deal(5, 1e12);
    assert.equal(env.PatienceApp.settle(1e12), null);
    const l = env.PatienceApp.ledger();
    assert.equal(l.rounds, 0);
    assert.equal(l.fatigue, 0);
});

check('a won round settles itself and records the clear, best score and time', () => {
    const env = boot();
    // Find a deal first-legal play actually wins, so the test is not vacuous.
    const seed = seedWhere(env.PatienceRules, (s) => env.PatienceRules.isWon(s));
    const end = playOut(env.PatienceRules, seed);
    env.PatienceApp.deal(seed, 1e12);
    let result = null;
    for (const m of end.moves) result = env.PatienceApp.act(m, 1e12 + 90_000).result || result;
    assert.ok(result && result.won, `seed ${seed} won`);
    const l = env.PatienceApp.ledger();
    assert.equal(l.round, null);
    assert.equal(l.wins, 1);
    assert.equal(l.bestScore, -end.stock.length);
    assert.equal(l.bestTime, 90_000);
    assert.ok(result.adoration >= 35 + 15);
});

check('a stuck round waits while a Mulligan could still turn it, and settles once none can', () => {
    const env = boot();
    const seed = seedWhere(env.PatienceRules, (s) => !env.PatienceRules.isWon(s));
    const end = playOut(env.PatienceRules, seed);
    env.PatienceApp.deal(seed, 1e12);
    for (const m of end.moves) env.PatienceApp.act(m, 1e12);
    assert.notEqual(env.PatienceApp.ledger().round, null, 'held open for the player to decide');
    assert.equal(env.PatienceApp.ledger().rounds, 0);
    // Spend both Mulligans; with nothing left to try it files itself.
    env.State.resourceCaps.praise = 1000;
    env.State.resources.praise = 1000;
    assert.ok(env.PatienceApp.mulligan('reshuffle', 1e12));
    driveApp(env, 1e12);
    if (env.PatienceApp.ledger().round) {
        const u = env.PatienceApp.mulligan('undo', 1e12);
        assert.ok(u, 'undo available as the last resort');
        // After an undo the round is playable again; play it out once more.
        driveApp(env, 1e12);
    }
    assert.equal(env.PatienceApp.ledger().round, null, 'settled once no Mulligan remained');
    assert.equal(env.PatienceApp.ledger().rounds, 1);
});

check('a Mulligan spends exactly its price in Praise, once per round, and refuses when unaffordable', () => {
    const env = boot();
    env.State.resourceCaps.praise = 20000;
    env.State.resources.praise = 999; // undo costs 1000
    env.PatienceApp.deal(23, 1e12);
    env.PatienceApp.act('d', 1e12);
    env.PatienceApp.act('d', 1e12);
    assert.equal(env.PatienceApp.mulligan('undo', 1e12), null);
    assert.equal(env.State.resources.praise, 999, 'refusal costs nothing');
    env.State.resources.praise = 20000;
    const out = env.PatienceApp.mulligan('undo', 1e12);
    assert.equal(out.cost, 1000);
    assert.equal(env.State.resources.praise, 19000);
    same(env.PatienceApp.current().moves, ['d']);
    assert.equal(env.PatienceApp.mulligan('undo', 1e12), null, 'once per round');
    assert.equal(env.State.resources.praise, 19000);
    const re = env.PatienceApp.mulligan('reshuffle', 1e12);
    assert.equal(re.cost, 3000);
    assert.equal(env.State.resources.praise, 16000);
    assert.equal(env.PatienceApp.mulligan('reshuffle', 1e12), null);
    const l = env.PatienceApp.ledger();
    assert.equal(l.mulligans, 2);
    assert.equal(l.praiseSpent, 4000);
});

check('the Mulligan price follows the cap as it grows mid-run', () => {
    const env = boot();
    env.State.resourceCaps.praise = 1000;
    const early = env.PatienceApp.mulliganCost('reshuffle');
    env.State.resourceCaps.praise = 1_000_000;
    assert.equal(early, 150);
    assert.equal(env.PatienceApp.mulliganCost('reshuffle'), 150_000);
});

check('a reshuffle cannot be bought through act(), only through the paid path', () => {
    const env = boot();
    env.PatienceApp.deal(29, 1e12);
    env.PatienceApp.act('d', 1e12);
    env.PatienceApp.act('d', 1e12);
    assert.equal(env.PatienceApp.act('r', 1e12), null);
    same(env.PatienceApp.current().moves, ['d', 'd']);
});

check('a round in progress survives save and reload move for move', () => {
    const env = boot();
    env.PatienceApp.deal(41, 1e12);
    env.PatienceApp.act('d', 1e12);
    const s = env.PatienceApp.current();
    const col = env.PatienceRules.legalPlays(s)[0];
    if (col !== undefined) env.PatienceApp.act(`p${col}`, 1e12);
    const before = env.PatienceApp.current();
    env.State.save();
    const again = boot(env.store);
    same(again.PatienceApp.current(), before);
});

/* ── Hostile saves ──────────────────────────────────────────────────────── */

check('hostile State.casino.solitaire shapes normalise to a usable ledger', () => {
    const now = 1_800_000_000_000;
    for (const raw of [null, undefined, 'nonsense', 7, [], [1, 2], true]) {
        const n = L.normalise(raw, now);
        assert.equal(n.rounds, 0);
        assert.equal(n.bestScore, null);
        assert.equal(n.round, null);
    }
    const n = L.normalise({
        wins: '999', losses: -3, rounds: NaN, cardsCleared: Infinity,
        bestScore: '0', bestTime: -5, parStreak: 'many', bestParStreak: 2,
        fatigue: -50, fatigueAt: now * 10, mulligans: {}, praiseSpent: -1,
        adorationEarned: '1e9', chargeEarned: null,
        round: { seed: 'abc', moves: ['d'] },
    }, now);
    assert.equal(n.wins, 0, 'a string is not a count');
    assert.equal(n.losses, 0, 'nor is a negative');
    assert.equal(n.rounds, 0);
    assert.equal(n.cardsCleared, 0);
    assert.equal(n.bestScore, null, '"0" is not a score');
    assert.equal(n.bestTime, null);
    assert.equal(n.parStreak, 0);
    assert.equal(n.fatigue, 0, 'negative fatigue would buy unlimited full-rate rounds');
    assert.equal(n.fatigueAt, now, 'a future stamp would freeze recovery');
    assert.equal(n.mulligans, 0);
    assert.equal(n.praiseSpent, 0);
    assert.equal(n.adorationEarned, 0);
    assert.equal(n.round, null, 'a round with no numeric seed is dropped');
});

check('a legitimate bestScore of 0 survives normalising (0 is falsy; || would erase it)', () => {
    assert.equal(L.normalise({ bestScore: 0 }).bestScore, 0);
    assert.equal(L.normalise({ bestScore: -16 }).bestScore, -16);
    assert.equal(L.normalise({ bestScore: 99 }).bestScore, null);
    assert.equal(L.normalise({ bestScore: 3.5 }).bestScore, null);
});

check('rounds can never read below wins + losses, and fatigue is capped', () => {
    const n = L.normalise({ wins: 4, losses: 6, rounds: 2, fatigue: 1e9 });
    assert.equal(n.rounds, 10);
    assert.equal(n.fatigue, L.FATIGUE_MAX);
});

check('a hostile round keeps only well-formed moves and a sane seed and clock', () => {
    const now = 1_800_000_000_000;
    const r = L.normalise({ round: { seed: -1, moves: ['d', 'p9', '<img src=x>', 4, 'p3', 'r', 'x'],
        undoUsed: 'yes', startedAt: now * 2 } }, now).round;
    assert.equal(r.seed, 4294967295);
    same(r.moves, ['d', 'p3', 'r']);
    assert.equal(r.undoUsed, false, 'only true is true');
    assert.equal(r.startedAt, now);
    const long = L.normalise({ round: { seed: 1, moves: Array(5000).fill('d') } }, now).round;
    assert.ok(long.moves.length <= 120);
});

check('through the real loader: a hostile casino block boots clean, and so does a hostile casino', () => {
    const env = bootWithSave((s) => {
        s.casino.solitaire = { wins: 'lots', fatigue: -100, bestScore: 0, round: { seed: 9, moves: ['d', 'p8'] } };
    });
    const l = env.PatienceApp.ledger();
    assert.equal(l.wins, 0);
    assert.equal(l.fatigue, 0);
    assert.equal(l.bestScore, 0);
    same(env.PatienceApp.current().moves, ['d']);
    const env2 = bootWithSave((s) => { s.casino = 'gone'; });
    assert.equal(env2.PatienceApp.ledger().rounds, 0);
    assert.equal(typeof env2.State.casino, 'object');
});

/* ── The shop and the unlock ────────────────────────────────────────────── */

check('the shop item is buyable now: the minigames tab has a ledger to write to', () => {
    const env = boot();
    env.State.adoration = 600;
    env.game.purchaseShopItem('minigames', 'minigame_solitaire');
    assert.equal(env.State.adoration, 100);
    assert.ok(env.State.unlockedApps.includes('solitaire'));
    assert.equal(env.State.adorationShop.minigames.minigame_solitaire, true);
    env.game.purchaseShopItem('minigames', 'minigame_solitaire');
    assert.equal(env.State.adoration, 100, 'not sold twice');
});

check('the schema itself carries the minigames ledger, without leaning on Patience to create it', () => {
    // PRISTINE is captured inside state.js, before solitaire.js reconciles.
    // The shop must not depend on the app module having loaded.
    const env = boot();
    assert.equal(typeof env.PRISTINE.adorationShop.minigames, 'object');
    assert.ok(env.ShopItemList.filter((i) => i.category === 'minigames').length > 0);
});

check('the shop description says what the purchase does', () => {
    const env = boot();
    const item = env.ShopItemList.find((i) => i.id === 'minigame_solitaire');
    assert.match(item.name, /Patience\.exe/);
    assert.match(item.description, /Golf solitaire/);
    assert.match(item.description, /Adoration/);
});

check('an existing save that bought the item finds the app present after reload', () => {
    const env = bootWithSave((s) => {
        s.adorationShop.minigames = { minigame_solitaire: true };
        s.unlockedApps = ['console', 'settings', 'mandates', 'adorationshop'];
    });
    assert.ok(env.State.unlockedApps.includes('solitaire'));
    const legacy = bootWithSave((s) => {
        delete s.adorationShop.minigames;
        s.adorationShop.miniGames = { minigame_solitaire: true };
    });
    assert.ok(legacy.State.unlockedApps.includes('solitaire'), 'the old miniGames key counts too');
});

check('a save with the app but no purchase record is not offered it again', () => {
    const env = bootWithSave((s) => {
        s.unlockedApps = ['console', 'settings', 'mandates', 'solitaire'];
        s.adorationShop.minigames = 'corrupt';
    });
    assert.equal(env.State.adorationShop.minigames.minigame_solitaire, true);
    env.State.adoration = 600;
    env.game.purchaseShopItem('minigames', 'minigame_solitaire');
    assert.equal(env.State.adoration, 600);
});

check('a save that never bought it does not get it', () => {
    const env = boot();
    assert.equal(env.State.unlockedApps.includes('solitaire'), false);
    assert.equal(env.State.adorationShop.minigames.minigame_solitaire, undefined);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}\n`);
