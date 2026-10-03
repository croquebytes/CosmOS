#!/usr/bin/env node
/**
 * NULL.OPERATOR's standing: lifetime caps per act, and where a real climb lands.
 *
 *   node tests/standing.mjs
 *
 * The bug it pins (docs/STANDING_DRIFT.md): with only a 10-minute cooldown per
 * act, standing saturated both ways on the way to the End of Shift gate. A
 * player who touched nothing ended hostile whatever they had answered; one who
 * opened Notepad and bought a single Void upgrade an hour was +11 complicit by
 * reboot 3-8, again whatever they had answered; curious was unreachable. The
 * Mirror Login's answer was erased in both directions.
 *
 *   1. Caps. Each kind of act may add only so much over the whole save:
 *      Notepad +3, the Void +3, a Choir status +/-4, ending the mirror -4, the
 *      reboot drift -6. A spent act moves nothing AND burns no cooldown; a
 *      delta that only partly fits is trimmed, not refused; the exempt acts
 *      (the patch, an archived replay) and Mail are outside the table.
 *   2. Persistence and hostile saves. The counters live in State.adversary, a
 *      save without them loads with the default, and a pasted save with
 *      nonsense in them neither throws nor moves standing past its cap.
 *   3. The climb, on the real game code (tools/standing_lib.mjs). Each play
 *      style lands in its own band, the opening answer shows at the gate, no
 *      engaged player is pinned at a rail, curious is reachable — and the rules
 *      from before the caps still reproduce the saturation, so the baseline
 *      this is measured against is honest.
 *
 * Every ship asserts that the reboot happened; every fixture states its runs
 * in reboot bars (getPrestigeThreshold() * n).
 */
import assert from 'node:assert/strict';
import { SLOT_MS, SEEDS, WARMTH, bandOf, boot, climb, freshGame } from '../tools/standing_lib.mjs';

let passed = 0;
let failed = 0;
const queue = [];
const test = (name, fn) => { queue.push([name, fn]); };

const plain = (v) => JSON.parse(JSON.stringify(v));
const OUT_OF_COOLDOWN = SLOT_MS + 1000;

/* A game that has met him, at a stated standing, on a clock the test moves. */
function met(choice = 'OP-B') {
    const clock = { t: Date.UTC(2026, 9, 1, 12) };
    const env = freshGame(clock);
    env.game.resolveAdversaryChoice(choice);
    env.clock = clock;
    env.nudge = (d, reason, opts) => { clock.t += OUT_OF_COOLDOWN; env.game.nudgeAdversaryStanding(d, reason, opts); };
    return env;
}

console.log('\nNULL.OPERATOR standing (vm)\n');

/* ── 1. caps ─────────────────────────────────────────────────────────── */

test('the caps table is what the design says', () => {
    const { game } = met();
    assert.deepEqual(plain(game.ADVERSARY_NUDGE_CAPS), {
        'read the paperwork': [0, 3], 'fed the reflection': [0, 3],
        'posted a status': [-4, 4], 'tried to end the mirror': [-4, 0], rebooted: [-6, 0],
    });
});

test('opening Notepad stops adding at +3 however long you keep doing it', () => {
    const env = met('OP-B');
    for (let i = 0; i < 40; i++) env.nudge(1, 'read the paperwork');
    assert.equal(env.State.adversary.standing, 3);
    assert.equal(env.State.adversary.nudgeTotals['read the paperwork'], 3);
    assert.equal(env.game.adversaryRelationship(), 'complicit', 'three reads is exactly enough to be read as complicit from curious');
});

test('ending the mirror stops at -4, and a delta that only partly fits is trimmed, not refused', () => {
    const env = met('OP-B');
    env.nudge(-3, 'tried to end the mirror');
    assert.equal(env.State.adversary.standing, -3);
    env.nudge(-3, 'tried to end the mirror');
    assert.equal(env.State.adversary.standing, -4, 'only the -1 that fits');
    env.nudge(-3, 'tried to end the mirror');
    assert.equal(env.State.adversary.standing, -4);
    assert.equal(env.State.adversary.nudgeTotals['tried to end the mirror'], -4);
});

test('a Choir status can go either way, to +/-4, and the two directions share one budget', () => {
    const env = met('OP-B');
    for (let i = 0; i < 6; i++) env.nudge(1, 'posted a status');
    assert.equal(env.State.adversary.standing, 4);
    for (let i = 0; i < 4; i++) env.nudge(-1, 'posted a status');
    assert.equal(env.State.adversary.standing, 0, 'cold statuses spend the same budget back');
    for (let i = 0; i < 20; i++) env.nudge(-1, 'posted a status');
    assert.equal(env.State.adversary.standing, -4);
});

test('a spent act burns no cooldown: nothing moves, and the clock it was waiting on is untouched', () => {
    const env = met('OP-B');
    for (let i = 0; i < 3; i++) env.nudge(1, 'read the paperwork');
    const stamp = env.State.adversary.nudgeCooldowns['read the paperwork'];
    assert.ok(stamp > 0, 'fixture check: the third read stamped a cooldown');
    env.clock.t += OUT_OF_COOLDOWN;
    env.game.nudgeAdversaryStanding(1, 'read the paperwork');
    assert.equal(env.State.adversary.nudgeCooldowns['read the paperwork'], stamp, 'a spent act did not restamp it');
    assert.equal(env.State.adversary.standing, 3);
});

test('the cooldown still rate-limits a single act, below the cap (unchanged)', () => {
    const env = met('OP-A');
    for (let i = 0; i < 20; i++) env.game.nudgeAdversaryStanding(1, 'read the paperwork');   // the clock never moves
    assert.equal(env.State.adversary.standing, -3, 'one repeated act moved standing more than once');
    assert.equal(env.State.adversary.nudgeTotals['read the paperwork'], 1, 'and only the one counted against the budget');
});

test('the reboot drift stops at -6, however many ships', () => {
    const env = met('OP-B');
    for (let i = 0; i < 30; i++) env.game.nudgeAdversaryStanding(-1, 'rebooted', { exempt: true });
    assert.equal(env.State.adversary.standing, -6);
    assert.equal(env.State.adversary.nudgeTotals.rebooted, -6);
});

test('the patch, an archived replay and Mail are outside the table, as before', () => {
    const { game, State } = met('OP-B');
    for (const reason of ['executed the patch', 'reopened an archived branch', 'mail: answered him warmly', 'mail: answered him coldly']) {
        assert.equal(game.ADVERSARY_NUDGE_CAPS[reason], undefined, reason);
    }
    game.nudgeAdversaryStanding(5, 'executed the patch', { exempt: true });
    assert.equal(State.adversary.standing, 5);
    for (let i = 0; i < 3; i++) game.nudgeAdversaryStanding(1, 'reopened an archived branch', { exempt: true });
    assert.equal(State.adversary.standing, 8, 'exempt acts are not budgeted');
    assert.deepEqual(plain(State.adversary.nudgeTotals), {}, 'and leave no counter');
});

test('a nudge with no reason, or before there is a relationship, is untouched by the caps', () => {
    const clock = { t: Date.UTC(2026, 9, 1, 12) };
    const before = freshGame(clock);
    before.game.nudgeAdversaryStanding(5, 'read the paperwork');
    assert.equal(before.State.adversary.standing, 0, 'no relationship yet');
    assert.deepEqual(plain(before.State.adversary.nudgeTotals), {}, 'and nothing was counted');
    const env = met('OP-B');
    env.game.nudgeAdversaryStanding(2);
    assert.equal(env.State.adversary.standing, 2);
});

test('different reasons have their own budgets: Notepad spent leaves the Void open', () => {
    const env = met('OP-B');
    for (let i = 0; i < 5; i++) env.nudge(1, 'read the paperwork');
    for (let i = 0; i < 5; i++) env.nudge(1, 'fed the reflection');
    assert.equal(env.State.adversary.standing, 6);
    assert.deepEqual(plain(env.State.adversary.nudgeTotals), { 'read the paperwork': 3, 'fed the reflection': 3 });
});

/* ── 2. persistence and hostile saves ────────────────────────────────── */

test('the counters are in a fresh state and are saved with the run', () => {
    const env = met('OP-B');
    assert.deepEqual(plain(env.State.adversary.nudgeTotals), {}, 'the schema default');
    assert.deepEqual(plain(env.PRISTINE.adversary.nudgeTotals), {});
    for (let i = 0; i < 2; i++) env.nudge(1, 'read the paperwork');
    env.State.save();
    assert.equal(JSON.parse(env.store.cosmos_save).adversary.nudgeTotals['read the paperwork'], 2);

});

test('a reload from storage: the spent budget is still spent', async () => {
    const env = met('OP-B');
    for (let i = 0; i < 3; i++) env.nudge(1, 'read the paperwork');
    env.State.save();
    const clock = { t: env.clock.t + OUT_OF_COOLDOWN };
    const back = boot(clock, env.store);                           // State.load at parse time, as the page does
    assert.equal(back.State.adversary.standing, 3);
    assert.equal(back.State.adversary.nudgeTotals['read the paperwork'], 3);
    back.game.nudgeAdversaryStanding(1, 'read the paperwork');
    assert.equal(back.State.adversary.standing, 3, 'the cap held across a reload');
});

test('a save from before the counters loads with the empty default', async () => {
    const env = met('OP-B');
    env.State.save();
    const blob = JSON.parse(env.store.cosmos_save);
    delete blob.adversary.nudgeTotals;
    env.store.cosmos_save = JSON.stringify(blob);
    const back = boot({ t: env.clock.t }, env.store);
    assert.deepEqual(plain(back.State.adversary.nudgeTotals), {});
    assert.equal(back.State.adversary.standing, 0);
    back.game.nudgeAdversaryStanding(1, 'read the paperwork');
    assert.equal(back.State.adversary.standing, 1, 'and it works from there');
});

test('a pasted save with nonsense in the counters neither throws nor moves standing past a cap', () => {
    const hostile = [
        [{ 'read the paperwork': 99 }, 0, 'a total above the cap reads as spent'],
        [{ 'read the paperwork': -99 }, 1, 'a total below the range reads as the floor, so it still has room'],
        [{ 'read the paperwork': 'lots' }, 1, 'a string reads as zero'],
        [{ 'read the paperwork': NaN }, 1, 'NaN reads as zero'],
        [{ 'read the paperwork': { a: 1 } }, 1, 'an object reads as zero'],
        [[1, 2, 3], 1, 'an array is replaced'],
        ['text', 1, 'a string is replaced'],
        [null, 1, 'null is replaced'],
    ];
    for (const [totals, moved, why] of hostile) {
        const env = met('OP-B');
        env.State.adversary.nudgeTotals = totals;
        assert.doesNotThrow(() => env.nudge(1, 'read the paperwork'), why);
        assert.equal(env.State.adversary.standing, moved, why);
        assert.ok(Math.abs(env.State.adversary.standing) <= 12);
    }
});

/* ── 3. the climb ────────────────────────────────────────────────────── */

const final = (style, choice, variant = 'current') => climb({ style, choice, variant }).final;
const bands = (style, variant = 'current') => ['OP-A', 'OP-B', 'OP-C'].map((c) => bandOf(final(style, c, variant)));

test('each play style lands in its own band at the gate', () => {
    assert.deepEqual(bands('passive'), ['hostile', 'hostile', 'curious']);
    assert.deepEqual(bands('ordinary'), ['curious', 'curious', 'complicit']);
    assert.deepEqual(bands('attentive'), ['complicit', 'complicit', 'complicit']);
    assert.deepEqual(bands('farmer'), ['complicit', 'complicit', 'complicit']);
    assert.deepEqual(bands('cold'), ['hostile', 'hostile', 'hostile']);
});

test('from the middle answer: resisting is hostile, reading and building is curious, feeding him is complicit', () => {
    const from = (style) => bandOf(final(style, 'OP-B'));
    assert.deepEqual([from('cold'), from('ordinary'), from('attentive')], ['hostile', 'curious', 'complicit']);
});

test('the answer at the Mirror Login still shows at the gate: more warmth in, more standing out', () => {
    for (const style of ['passive', 'ordinary']) {
        const [a, b, c] = ['OP-A', 'OP-B', 'OP-C'].map((x) => final(style, x));
        assert.ok(a < b && b < c, `${style}: ${a} < ${b} < ${c}`);
    }
});

test('an engaged player is not pinned at a rail: an ordinary run stays in a narrow, readable range', () => {
    const { line } = climb({ style: 'ordinary', choice: 'OP-B' });
    assert.equal(line.length, 14, 'fixture check: fourteen ships');
    assert.ok(line.every((s) => s >= -2 && s <= 3), `standing wandered: ${line.join(' ')}`);
});

test('the cold and warm extremes are still the rails, and they are not the whole range', () => {
    for (const choice of ['OP-A', 'OP-B', 'OP-C']) {
        assert.ok(final('cold', choice) <= -9, `cold from ${choice}`);
        assert.ok(final('farmer', choice) >= 8, `farmer from ${choice}`);
    }
});

test('curious is reachable by play: a stretch of the cold-to-warm dial lands in -2..+2', () => {
    const curious = WARMTH.filter((w) => bandOf(final(String(w), 'OP-B')) === 'curious');
    assert.ok(curious.length >= 2, `curious at warmth ${curious.join(', ') || 'nowhere'}`);
    const hostile = WARMTH.filter((w) => bandOf(final(String(w), 'OP-B')) === 'hostile');
    const complicit = WARMTH.filter((w) => bandOf(final(String(w), 'OP-B')) === 'complicit');
    assert.ok(hostile.length >= 3 && complicit.length >= 3, 'and the other two bands keep a wide share');
});

test('the rules from before the caps still reproduce the saturation this fixes (the baseline is honest)', () => {
    assert.deepEqual(bands('ordinary', 'legacy'), ['complicit', 'complicit', 'complicit'], 'any engagement was +11 whatever you answered');
    assert.deepEqual(bands('passive', 'legacy'), ['hostile', 'hostile', 'hostile'], 'and doing nothing was hostile whatever you answered');
    assert.equal(final('passive', 'OP-A', 'legacy'), -12);
    assert.equal(final('passive', 'OP-C', 'legacy'), -8, 'OP-C (+4) was erased to -8 by 13 ships');
    const curious = WARMTH.filter((w) => bandOf(final(String(w), 'OP-B', 'legacy')) === 'curious');
    assert.deepEqual(curious, [], 'curious was unreachable');
});

test('the opening seeds are what the climbs assume', () => {
    assert.deepEqual(plain(SEEDS), { 'OP-A': -4, 'OP-B': 0, 'OP-C': 4 });
});

for (const [name, fn] of queue) {
    try { await fn(); passed++; console.log(`  ok    ${name}`); }
    catch (err) { failed++; console.log(`  FAIL  ${name}\n        ${String(err && err.stack || err).split('\n').slice(0, 4).join('\n        ')}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
