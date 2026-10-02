#!/usr/bin/env node
/**
 * Adversary scene tests.
 *
 *   node tests/adversary-scene.mjs
 *
 * The properties that matter here are REACHABILITY and RECOVERABILITY. This
 * content sat unplayed for the life of the project because its trigger was
 * gated behind a prestige count no measured play policy reaches, and behind a
 * counter (`achievementProgress.void_depth_reached`) that has no write site in
 * the entire js/ tree. So the first block below asserts a player actually
 * arrives, and the rest assert that nothing about the scene can strand them.
 *
 * The lesson the changelog work taught, applied here: assert the property that
 * matters, not the one that is easy. "The trigger evaluates true" is easy and
 * nearly worthless; "the trigger evaluates true at a resource level the golden
 * baseline actually reaches" is the real claim.
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

/* js/ui.js is NOT loaded: it is written against a live DOM and the scene's
   presentation is covered by tests/e2e-smoke.mjs instead. Here `ui` is a
   proxy of no-ops, which is also what makes the "scene never completes
   headlessly" property testable — playAdversaryScene does nothing, so
   sceneCompleted stays false exactly as it would if a render threw. */
function boot(uiOverrides = {}) {
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean, Set,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        // Named overrides win; everything else is a no-op.
        ui: new Proxy(uiOverrides, {
            get: (target, prop) => (prop in target ? target[prop] : noop),
        }),
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
        '({ State, Modifiers, Reality, game, AdversaryScene, AdversaryBarks,' +
        '   AdversaryBarkPolicy, AdversaryHookedTriggers, TaskManagerProcesses })',
        ctx,
    );
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

/* Put a save in the state the trigger is meant to fire from. */
function primed(env, { souls = 800000, prestige = 0, voidUnlocked = true } = {}) {
    const { State } = env;
    State.totalStats.soulsGained = souls;
    State.achievementProgress.prestige_count = prestige;
    State.dimensions.void.unlocked = voidUnlocked;
    return env;
}

console.log('\nAdversary Scene\n');

/* ── Reachability ──────────────────────────────────────────────────────── */

check('the gate is open at the 8h golden baseline resource level', () => {
    /* tools/golden/8h.json ends at 711,493 lifetime souls with prestigeLog: [].
       That is a real, measured, zero-prestige eight-hour run — so if the gate
       is not open there, the scene is once again unreachable for anyone who
       does not play prestige-optimally. This is THE test in this file. */
    const goldenSouls = JSON.parse(
        readFileSync(resolve(ROOT, 'tools/golden/8h.json'), 'utf8'),
    ).lifetimeSouls;
    assert.ok(typeof goldenSouls === 'number', 'golden 8h baseline lost its lifetimeSouls field');

    const env = primed(boot(), { souls: goldenSouls, prestige: 0 });
    const met = env.AdversaryScene.trigger.conditions.every((c) => c());
    assert.ok(met, `gate shut at the 8h baseline (${Math.round(goldenSouls)} lifetime souls)`);
});

check('the gate is shut at the start of a run', () => {
    const env = boot();
    const met = env.AdversaryScene.trigger.conditions.every((c) => c());
    assert.equal(met, false, 'the scene would fire on a fresh save');
});

check('an aggressive prestige player reaches it without the souls clause', () => {
    const env = primed(boot(), { souls: 300000, prestige: 3 });
    assert.ok(env.AdversaryScene.trigger.conditions.every((c) => c()));
});

check('no condition depends on void_depth_reached, which nothing writes', () => {
    /* The original clause 2. Left in place it silently degrades the gate to
       `souls >= 1000`. Asserted against the LIVE closures rather than the
       source text, because the source carries a comment explaining the
       removal — matching on text would fail on its own documentation. */
    const env = boot();
    const bodies = env.AdversaryScene.trigger.conditions.map((c) => c.toString()).join('\n');
    assert.ok(!bodies.includes('void_depth_reached'),
        'the trigger still reads a counter with no write site');

    // And prove it end to end: a save whose ONLY qualification is the dead
    // counter must not open the gate.
    const dead = boot();
    dead.State.achievementProgress.void_depth_reached = 999;
    dead.State.resources.souls = 5000;
    assert.equal(dead.AdversaryScene.trigger.conditions.every((c) => c()), false);
});

/* ── Firing, once, without clobbering ──────────────────────────────────── */

check('the trigger marks contact and does not re-fire', () => {
    const env = primed(boot());
    env.game.checkAdversaryTrigger();
    assert.equal(env.State.adversary.contacted, true);
    assert.equal(env.State.achievementProgress.adversary_contacted, true);
});

check('a satisfied gate defers while another system modal is open', () => {
    /* #system-modal-layer is a single slot and every show* rewrites its
       innerHTML, so firing on top of the release notes or the offline report
       would destroy them unread — and the offline report's overflow notice is
       the only place a player is ever told storage discarded production. */
    let played = 0;
    const env = primed(boot({
        isSystemModalOpen: () => true,
        playAdversaryScene: () => { played++; },
    }));
    env.game.checkAdversaryTrigger();
    assert.equal(played, 0, 'the scene clobbered an open modal');
    assert.equal(env.State.adversary.contacted, false,
        'contact was committed while deferring, so the scene is now unreachable');
});

check('the deferred scene fires as soon as the modal closes', () => {
    // Deferring must postpone the scene, not silently drop it.
    let played = 0;
    let modalOpen = true;
    const env = primed(boot({
        isSystemModalOpen: () => modalOpen,
        playAdversaryScene: () => { played++; },
    }));
    env.game.checkAdversaryTrigger();
    assert.equal(played, 0);
    modalOpen = false;
    env.game.checkAdversaryTrigger();
    assert.equal(played, 1, 'the deferred scene never came back');
});

check('contact is committed before presentation, so a broken render cannot loop', () => {
    const env = primed(boot());
    env.game.checkAdversaryTrigger();          // ui.playAdversaryScene is a no-op
    assert.equal(env.State.adversary.contacted, true);
    assert.equal(env.State.adversary.sceneCompleted, false);
    // Second poll takes the resume branch rather than firing again.
    env.game.checkAdversaryTrigger();
    assert.equal(env.State.adversary.sceneCompleted, false);
});

check('three failed presentations self-resolve instead of blocking forever', () => {
    const env = primed(boot());
    env.State.adversary.contacted = true;
    env.State.adversary.sceneAttempts = 3;
    assert.equal(env.game.adversarySceneExhausted(), true);
    // The exhausted path must leave the arc resolved, not merely give up.
    env.game.resolveAdversaryChoice('OP-A');
    assert.equal(env.State.adversary.sceneCompleted, true);
});

check('an interrupted scene is resumable, not lost', () => {
    const env = primed(boot());
    env.State.adversary.contacted = true;
    env.State.adversary.sceneCompleted = false;
    env.State.adversary.sceneAttempts = 1;
    env.game.checkAdversaryTrigger(); // takes the resume branch, does not throw
    assert.equal(env.State.adversary.contacted, true);
});

/* ── The choice, and the relationship it opens ─────────────────────────── */

check('each choice seeds a different band', () => {
    const bands = ['OP-A', 'OP-B', 'OP-C'].map((id) => {
        const env = primed(boot());
        env.game.resolveAdversaryChoice(id);
        return env.game.adversaryRelationship();
    });
    assert.deepEqual(bands, ['hostile', 'curious', 'complicit']);
});

check('the relationship moves after the scene — it is not a one-way flag', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-B');           // curious, standing 0
    assert.equal(env.game.adversaryRelationship(), 'curious');
    // Distinct acts, because one repeated act is rate-limited by design.
    env.game.nudgeAdversaryStanding(-3, 'tried to end the mirror');
    assert.equal(env.game.adversaryRelationship(), 'hostile');
    env.game.nudgeAdversaryStanding(+6, 'executed the patch');
    assert.equal(env.game.adversaryRelationship(), 'complicit');
});

check('standing cannot run away in either direction', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-B');
    // exempt, so this exercises the CLAMP rather than the cooldown.
    for (let i = 0; i < 50; i++) env.game.nudgeAdversaryStanding(5, 'r', { exempt: true });
    assert.equal(env.State.adversary.standing, 12, 'standing exceeded its ceiling');
    for (let i = 0; i < 100; i++) env.game.nudgeAdversaryStanding(-5, 'r', { exempt: true });
    assert.equal(env.State.adversary.standing, -12, 'standing exceeded its floor');
});

check('nothing nudges the relationship before there is one', () => {
    const env = primed(boot());
    env.game.nudgeAdversaryStanding(5, 'test');
    assert.equal(env.State.adversary.standing, 0);
});

check('repeating one act cannot walk the relationship across bands', () => {
    /* Opening the Recovered Documents window is +1. Without a per-reason
       cooldown, twelve clicks on the same desktop icon take a hostile player
       to complicit — which would make the whole standing system a click
       counter rather than a relationship. */
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-A');           // hostile, standing -4
    for (let i = 0; i < 20; i++) env.game.nudgeAdversaryStanding(1, 'read the paperwork');
    assert.equal(env.State.adversary.standing, -3, 'one repeated act moved standing more than once');
    assert.equal(env.game.adversaryRelationship(), 'hostile', 'spamming one window changed the band');
});

check('distinct acts still move it, and once-only acts are exempt', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-B');           // curious, standing 0
    env.game.nudgeAdversaryStanding(1, 'read the paperwork');
    env.game.nudgeAdversaryStanding(1, 'fed the reflection');
    env.game.nudgeAdversaryStanding(-2, 'tried to end the mirror');
    assert.equal(env.State.adversary.standing, 0, 'distinct acts were swallowed by the cooldown');

    // Rebooting is already once-per-run, so it must not be rate-limited.
    for (let i = 0; i < 3; i++) env.game.nudgeAdversaryStanding(-1, 'rebooted', { exempt: true });
    assert.equal(env.State.adversary.standing, -3, 'exempt nudges were rate-limited');
});

check('playerChoice is the origin fact and is never rewritten', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-A');
    env.game.resolveAdversaryChoice('OP-C');   // a second call must not take
    assert.equal(env.State.adversary.playerChoice, 'OP-A');
});

/* ── The payoff ────────────────────────────────────────────────────────── */

check('every branch leaves the patch in the bin', () => {
    for (const id of ['OP-A', 'OP-B', 'OP-C']) {
        const env = primed(boot());
        env.game.resolveAdversaryChoice(id);
        const patch = env.State.recycleBin.items.find((i) => i.id === 'adversary_patch');
        assert.ok(patch, `${id} left no patch`);
        assert.equal(patch.deletable, false, `${id}'s patch is deletable`);
    }
});

check('only the hostile branch gets the audit log', () => {
    const has = (id) => {
        const env = primed(boot());
        env.game.resolveAdversaryChoice(id);
        return env.State.recycleBin.items.some((i) => i.id === 'adversary_audit');
    };
    assert.equal(has('OP-A'), true);
    assert.equal(has('OP-B'), false);
    assert.equal(has('OP-C'), false);
});

check('the curious branch is the one that answers the question', () => {
    const desc = (id) => {
        const env = primed(boot());
        env.game.resolveAdversaryChoice(id);
        return env.State.recycleBin.items.find((i) => i.id === 'adversary_patch').description;
    };
    assert.ok(desc('OP-B').includes('Manifest: 1 entry'), 'curious got no manifest');
    assert.ok(desc('OP-A').includes('unreadable'), 'hostile was shown the manifest');
});

check('the audit log accrues only for the branch that was promised receipts', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-A');
    env.game.appendAdversaryAuditEntry();
    env.game.appendAdversaryAuditEntry();
    assert.equal(env.State.adversary.auditLogEntries, 3); // 1 at grant + 2
    const other = primed(boot());
    other.game.resolveAdversaryChoice('OP-C');
    other.game.appendAdversaryAuditEntry();
    assert.equal(other.State.adversary.auditLogEntries, 0);
});

check('the patch is granted once, and never re-granted after execution', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-B');
    env.game.grantAdversaryPatch();
    env.game.grantAdversaryPatch();
    const count = () => env.State.recycleBin.items.filter((i) => i.id === 'adversary_patch').length;
    assert.equal(count(), 1, 'duplicate patch in the bin');

    // Post-execution the item is REMOVED from the bin, so patchInRecycleBin
    // alone would let a re-grant slip through — guard on both flags.
    env.State.adversary.patchExecuted = true;
    env.State.adversary.patchInRecycleBin = false;
    env.State.recycleBin.items = env.State.recycleBin.items.filter((i) => i.id !== 'adversary_patch');
    env.game.grantAdversaryPatch();
    assert.equal(count(), 0, 'the patch came back after being executed');
});

/* ── Barks ─────────────────────────────────────────────────────────────── */

/* Arrays produced inside the vm carry that realm's Array.prototype, which
   strict deepEqual treats as a mismatch even when the contents are identical —
   the same trap the reality-build tests hit. Compare joined strings. */
const sameSet = (actual, expected, message) =>
    assert.equal([...actual].sort().join(','), [...expected].sort().join(','), message);

check('every hooked trigger is listened for by at least one band', () => {
    const env = boot();
    const union = new Set(Object.values(env.AdversaryBarkPolicy.triggers).flat());
    const orphanHooks = [...env.AdversaryHookedTriggers].filter((t) => !union.has(t));
    sameSet(orphanHooks, [], `code fires triggers no band listens for: ${orphanHooks}`);
});

check('every listened-for trigger is actually fired by the code', () => {
    const env = boot();
    const hooked = new Set(env.AdversaryHookedTriggers);
    const union = [...new Set(Object.values(env.AdversaryBarkPolicy.triggers).flat())];
    const orphanSets = union.filter((t) => !hooked.has(t));
    sameSet(orphanSets, [], `bands listen for triggers nothing fires: ${orphanSets}`);
});

check('every hooked trigger has at least one written line behind it', () => {
    const env = boot();
    const missing = [...env.AdversaryHookedTriggers]
        .filter((t) => !env.AdversaryBarks.some((b) => b.trigger === t));
    sameSet(missing, [], `hooked triggers with no bark line: ${missing}`);
});

check('exactly the known-dead bark lines are unreachable', () => {
    /* The mirror of the check above, and the one that keeps the tally beside
       AdversaryHookedTriggers honest — that comment was already off by one.
       Pinned by ID rather than asserted empty, because these nine are
       deliberately dead: a TENTH line silently falling out of the hook table
       must fail, and re-hooking one of these must force this list to be
       pruned — as ADV-BARK-04, ADV-L-15 and ADV-L-16 were, when Patience.exe
       became Fate's table (tests/fate.mjs fires them from that table). */
    const env = boot();
    const hooked = new Set(env.AdversaryHookedTriggers);
    const dead = env.AdversaryBarks.filter((b) => !hooked.has(b.trigger)).map((b) => b.id);
    sameSet(dead, [
        'ADV-L-01',     // idle_60s — deliberately not hooked, see the policy
        'ADV-L-03',     // toggle_music — the game ships silent
        'ADV-L-05',     // warning_popup — no such event
        'ADV-L-18',     // seraph_self_awareness_event — no such event
        'ADV-L-19',     // void_depth_50 — no such event
        'ADV-L-20',     // attempt_resign — no such event
    ], 'the set of unreachable bark lines changed');
    assert.equal(env.AdversaryBarks.length - dead.length, 19,
        'the reachable-line count moved; update the tally in js/state.js');
});

check('the declared hook list matches what game.js really calls', () => {
    /* Guards the honesty of AdversaryHookedTriggers: it is hand-maintained, so
       a hook added without updating it, or removed without pruning it, would
       otherwise pass the two set-equality tests above while being a lie. */
    const src = ['js/game.js', 'js/ui.js', 'js/system.js', 'js/state.js', 'js/solitaire.js']
        .map((f) => readFileSync(resolve(ROOT, f), 'utf8')).join('\n');
    const called = new Set();
    const re = /triggerAdversaryBark\(\s*'([a-z0-9_]+)'/g;
    let m;
    while ((m = re.exec(src))) called.add(m[1]);
    // system.js fires from a lookup table rather than a literal call.
    for (const t of ['open_taskmgr_after_contact', 'open_recycle_bin',
                     'open_docs_folder', 'open_settings']) called.add(t);

    const env = boot();
    const declared = new Set(env.AdversaryHookedTriggers);
    const undeclared = [...called].filter((t) => !declared.has(t));
    const unfired = [...declared].filter((t) => !called.has(t));
    sameSet(undeclared, [], `fired but undeclared: ${undeclared}`);
    sameSet(unfired, [], `declared but never fired: ${unfired}`);
});

check('he says nothing before the scene resolves', () => {
    const env = primed(boot());
    assert.equal(env.game.selectAdversaryBark('prestige_prompt'), null);
    assert.equal(env.game.triggerAdversaryBark('prestige_prompt'), null);
});

check('no bark path consumes randomness before the scene resolves', () => {
    /* Determinism guard. Every hook site is called from the tick and from
       purchase paths that the simulator drives, so if a pre-scene bark reached
       Math.random() it would shift the entire golden master. */
    const env = primed(boot());
    let draws = 0;
    const real = Math.random;
    Math.random = () => { draws++; return real(); };
    try {
        for (const t of env.AdversaryHookedTriggers) env.game.triggerAdversaryBark(t);
    } finally {
        Math.random = real;
    }
    assert.equal(draws, 0, `${draws} random draws before the scene was resolved`);
});

check('a line retires after its lifetime cap', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-C');           // complicit: shortest cooldowns
    const adv = env.State.adversary;
    const cap = env.AdversaryBarkPolicy.lifetimeCap;
    const line = env.AdversaryBarks.find((b) => b.trigger === 'open_recycle_bin');
    adv.barks.playCounts[line.id] = cap;
    // Clear cooldowns so only the cap can be responsible for the refusal.
    adv.barks.lastBarkTime = 0;
    adv.barks.cooldowns = {};
    const remaining = env.AdversaryBarks.filter(
        (b) => b.trigger === 'open_recycle_bin' && b.id !== line.id);
    if (!remaining.length) {
        assert.equal(env.game.selectAdversaryBark('open_recycle_bin'), null);
    } else {
        const got = env.game.selectAdversaryBark('open_recycle_bin');
        assert.ok(!got || got.id !== line.id, 'a retired line played again');
    }
});

check('a band never speaks on a trigger outside its own set', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-A');           // hostile
    const hostile = env.AdversaryBarkPolicy.triggers.hostile;
    const outside = env.AdversaryHookedTriggers.filter((t) => !hostile.includes(t));
    env.State.adversary.barks.lastBarkTime = 0;
    for (const t of outside) {
        assert.equal(env.game.selectAdversaryBark(t), null, `hostile spoke on ${t}`);
    }
});

/* ── The residue ───────────────────────────────────────────────────────── */

check('the shadow process exists, is hidden until contact, and cannot be ended', () => {
    const env = boot();
    const shadow = env.TaskManagerProcesses.find((p) => p.name === 'void_mirror.service#2');
    assert.ok(shadow, 'ADV-013 announces a process that does not exist');
    assert.equal(shadow.hiddenUntilContact, true);
    assert.equal(shadow.endable, false);
    assert.ok(typeof shadow.onAttempt === 'function', 'ending it does nothing');
});

check('the two barks about the mirror have the mirror as their referent', () => {
    const env = boot();
    const src = readFileSync(resolve(ROOT, 'js/state.js'), 'utf8');
    const shadow = src.slice(src.indexOf("name: 'void_mirror.service#2'"));
    const entry = shadow.slice(0, shadow.indexOf('sector7g_indexer'));
    assert.ok(entry.includes("triggerAdversaryBark('taskmgr_end_process_attempt')"),
        'ADV-BARK-01 and ADV-L-12 still fire on unrelated process kills');
});

/* ── Save integrity ────────────────────────────────────────────────────── */

check('a save from before the scene existed still loads', () => {
    const env = boot();
    const legacy = JSON.parse(JSON.stringify(env.State.serialize ? env.State.serialize() : {}));
    // The shape that matters: an adversary block with none of the new fields.
    env.State.adversary = { contacted: false, relationship: null, sceneCompleted: false,
                            playerChoice: null, barks: { heardBarks: [] } };
    assert.doesNotThrow(() => env.game.checkAdversaryTrigger());
    assert.doesNotThrow(() => env.game.adversaryRelationship());
    assert.doesNotThrow(() => env.game.triggerAdversaryBark('prestige_prompt'));
    void legacy;
});

check('a permanent modifier survives a load that re-derives the build', () => {
    /* The blocker this test exists for: bootstrapModifiers read
       State.modifierLog AFTER ensureReality(), and ensureReality calls
       State.save() whenever the build re-derives differently — which is
       precisely the case the re-derivation exists to serve (a content fix
       reaching a save already mid-run). save() overwrites State.modifierLog
       with Modifiers.serialize(), which is EMPTY that early in boot, so the
       log was destroyed and rebuildModifierLog() replayed only the content
       ledgers. The adversary patch's two permanent records are in no ledger,
       so they vanished silently and unrecoverably.

       Asserts recoverability, not presence-at-rest: the property is that the
       records are still applied AFTER a bootstrap that re-derives. */
    const first = boot();
    first.game.bootstrapModifiers();
    first.Modifiers.add({
        id: 'adversary_patch_continuity', target: 'souls.multiplier', op: 'mul',
        value: 1.25, scope: 'permanent', source: 'adversary_patch', label: 'test',
    });
    first.Modifiers.commit(Date.now());
    first.State.save();
    assert.equal(first.State.soulMultiplier, 1.25, 'the patch never applied in the first place');

    /* Round-trip through JSON, which is what a reload really does. Mutating
       the live registry instead would prove nothing: Modifiers.serialize()
       returns `{ seq, records: this.records }` — the ACTUAL array, not a copy
       — so State.modifierLog aliases Modifiers.records in a running session,
       and emptying one empties the other. Only the JSON hop breaks that alias
       and reproduces the boot ordering that mattered. */
    const payload = JSON.parse(JSON.stringify(first.State));
    // A content fix: the stored build no longer matches what the seed derives,
    // which is what makes ensureReality() save mid-bootstrap.
    if (payload.reality?.build?.entries?.length) {
        payload.reality.build.entries[0].note = 'edited by a content fix';
    }

    const second = boot();
    Object.assign(second.State, payload);
    second.Modifiers.records.length = 0;
    second.game.bootstrapModifiers();

    const survived = second.Modifiers.records.filter((r) => r.source === 'adversary_patch');
    assert.equal(survived.length, 1, 'the permanent record was destroyed on load');
    assert.equal(second.State.soulMultiplier, 1.25, 'the record survived but stopped applying');
});

check('a save while the registry is cold never empties a populated log', () => {
    // The second half of the same defect: save() must not trade a non-empty
    // stored log for an empty one just because nothing has hydrated yet.
    const env = boot();
    const { State, Modifiers } = env;
    State.modifierLog = { seq: 7, records: [{ id: 'x', target: 'souls.multiplier', op: 'mul', value: 2 }] };
    Modifiers.records.length = 0;
    State.save();
    assert.equal(State.modifierLog.records.length, 1,
        'a cold-registry save wiped the persisted log');
});

/* NOTE ON WHAT THIS FILE CAN AND CANNOT PROVE.
   js/ui.js is not loaded here (see SOURCES), so nothing below can exercise the
   scene's renderer. A previous version of the next two checks was named
   "reaching the transcript refunds the attempt budget" and asserted neither
   half of it: deleting the entire refund block from js/ui.js left it green.
   The refund itself is now asserted in tests/e2e-smoke.mjs, which runs a live
   page. These two keep the names honest — each says exactly what it checks. */

check('the exhaustion threshold is three presentations', () => {
    const env = primed(boot());
    env.State.adversary.sceneAttempts = 2;
    assert.equal(env.game.adversarySceneExhausted(), false);
    env.State.adversary.sceneAttempts = 3;
    assert.equal(env.game.adversarySceneExhausted(), true);
});

check('an unseen scene resolves neutral, not hostile', () => {
    // A player shown nothing must not be handed the hostile extreme. Walking
    // out of a choice you SAW reading as DENY is a different contract.
    const src = readFileSync(resolve(ROOT, 'js/ui.js'), 'utf8');
    const fn = src.slice(src.indexOf('adversarySceneExhausted() && !State.adversary.sceneCompleted'));
    const branch = fn.slice(0, fn.indexOf('State.adversary.sceneAttempts ='));
    assert.ok(branch.includes("resolveAdversaryChoice('OP-B')"),
        'an unseen scene still resolves as hostile');
});

check('the resolved scene survives a JSON round trip', () => {
    const env = primed(boot());
    env.game.resolveAdversaryChoice('OP-C');
    env.game.nudgeAdversaryStanding(2, 'test');
    const before = JSON.stringify(env.State.adversary);
    const after = JSON.stringify(JSON.parse(before));
    assert.equal(after, before);
});

check('the dialogue still contains every authored line', () => {
    const env = boot();
    const ids = env.AdversaryScene.dialogue.map((l) => l.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate dialogue id');
    /* 31 authored entries (ADV-001..021, the ADV-022 choice, the three
       ADV-023A/B/C branch replies, ADV-024..029) plus the one conditional SYS
       line added for the reboot-count mismatch. Pinned exactly: `>= 30` would
       have passed while a line was quietly deleted. */
    assert.equal(ids.length, 32, `dialogue is ${ids.length} entries, expected 32`);
    assert.equal(ids.filter((i) => /^ADV-023[ABC]$/.test(i)).length, 3, 'a branch reply went missing');
    for (const key of ['ADV-001', 'ADV-005', 'ADV-009', 'ADV-022', 'ADV-029']) {
        assert.ok(ids.includes(key), `${key} went missing`);
    }
    const choice = env.AdversaryScene.dialogue.find((l) => l.type === 'choice_prompt');
    assert.equal(choice.choices.length, 3);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
