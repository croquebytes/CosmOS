#!/usr/bin/env node
/**
 * Save-layer regression tests.
 *
 *   node tests/save-migration.mjs
 *
 * Every case here is a failure mode that would cost a player their run, so
 * these assert behaviour rather than implementation: a save is never deleted,
 * defaults survive a partial save, and nothing a save says can reach the
 * prototype chain.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};

/* Each case gets a pristine State, because load() mutates it in place. */
function bootWith(stored) {
    const store = new Map(Object.entries(stored || {}));
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
    };
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop },
        Math, Date, JSON, Number, Object, Array, String, Boolean,
        isNaN, parseInt, parseFloat,
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        localStorage,
        ui: new Proxy({}, { get: () => noop }),
        window: {}, document: { addEventListener: noop },
    });
    vm.runInContext(readFileSync(resolve(ROOT, 'js/state.js'), 'utf8'), ctx, { filename: 'state.js' });
    return { State: vm.runInContext('State', ctx), store };
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

console.log('\nSave layer\n');

check('a fresh install loads with no save', () => {
    const { State } = bootWith({});
    assert.equal(State.resources.souls, 100);
});

check('a legacy save (no version) is migrated to current', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            resources: { praise: 500, offerings: 20, souls: 900 },
            automatons: { seraphCount: 12 },
            pps: 12,
        }),
    });
    assert.equal(State.resources.praise, 500);
    assert.equal(State.automatons.seraphCount, 12);
    assert.equal(State.saveVersion, State.SAVE_VERSION, 'version should be stamped forward');
});

check('a corrupted save is PRESERVED, never deleted', () => {
    const { State, store } = bootWith({ cosmos_save: '{"bad_json":' });
    assert.equal(State.resources.souls, 100, 'should fall back to defaults');
    assert.ok(
        store.get('cosmos_save_backup_unreadable'),
        'the unreadable save must be kept for recovery',
    );
});

check('defaults survive a save that omits nested keys', () => {
    // The aliasing bug: Object.assign(this.X, parsed.X) rebound this.X.sub to
    // the save's object, so every default sub-key absent from the save was lost.
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            saveVersion: 3,
            loopSystems: { miracleStreak: 7 },
            documents: { collected: ['doc_welcome'] },
        }),
    });
    assert.equal(State.loopSystems.miracleStreak, 7, 'saved value wins');
    assert.equal(State.loopSystems.overclock.duration, 30000, 'default sub-object survives');
    assert.ok(State.documents.categories, 'default categories survive');
});

check('a repeatable id absent from an old save gets its default', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            saveVersion: 3,
            repeatables: { praise_vault: 9 },
        }),
    });
    assert.equal(State.repeatables.praise_vault, 9);
    assert.equal(State.repeatables.offline_capacitor, 0, 'missing id defaults rather than undefined');
});

check('void repeatables survive a pre-Void-rebuild save', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            saveVersion: 3,
            dimensions: { void: { unlocked: true, automatons: { wraithCount: 9 } } },
        }),
    });
    assert.equal(State.dimensions.void.automatons.wraithCount, 9);
    assert.equal(State.dimensions.void.automatons.revenantCount, 0, 'new rank defaults');
    assert.equal(State.dimensions.void.repeatables.darkness_vault, 0, 'new repeatables default');
});

check('a save cannot reach the prototype chain', () => {
    const { State } = bootWith({
        cosmos_save: `{"saveVersion":3,"__proto__":{"pwned":true},"constructor":{"pwned":true}}`,
    });
    assert.equal({}.pwned, undefined, 'Object.prototype must be untouched');
    assert.equal(State.pwned, undefined);
});

check('a save cannot replace State methods', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({ saveVersion: 3, save: 'not-a-function', load: 42 }),
    });
    assert.equal(typeof State.save, 'function', 'save() must survive a hostile save');
    assert.equal(typeof State.load, 'function');
});

check('migration 2 zeroes the phantom mps income source', () => {
    // mps is never produced but IS spent by Temporal Rift's offline payout,
    // so a stale nonzero value is unbounded free Offerings on every reload.
    const { State } = bootWith({
        cosmos_save: JSON.stringify({ resources: { praise: 1 }, mps: 9999 }),
    });
    assert.equal(State.mps, 0);
});

check('migration 3 clears a ghost divine event', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            resources: { praise: 1 },
            divineEvent: { x: -40, y: -900, value: 5, expiresAt: 1 },
        }),
    });
    assert.equal(State.divineEvent, null, 'a stale event blocks all new spawns');
});

check('migration 1 prunes dead fields', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            resources: { praise: 1 },
            unlockedRegions: ['x'], activeRegion: 'x', unlockedDocuments: ['y'],
        }),
    });
    assert.equal(State.unlockedRegions, undefined);
    assert.equal(State.activeRegion, undefined);
});

check('migrations do not re-run on an already-current save', () => {
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            saveVersion: 3, resources: { praise: 1 }, mps: 77,
        }),
    });
    assert.equal(State.mps, 77, 'a current save is taken at its word');
});

check('migration 5 closes the run so a returning player is not handed the ladder', () => {
    /* Divinity is scored on the run now. A pre-v5 save has no baseline, so
       without this migration its whole lifetime reads as one uncashed run —
       a player with 5M Souls would collect ~55 Divinity from a single reboot
       and unlock every Reality channel at once. Those Souls were already paid
       for under the old formula. */
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            saveVersion: 4,
            resources: { praise: 1 },
            totalStats: { praiseGained: 0, offeringsGained: 0, soulsGained: 5_000_000 },
        }),
    });
    assert.equal(State.runSoulsBaseline, 5_000_000,
        'the migrated run is still open — the next reboot re-sells every banked Soul');
    assert.equal(State.totalStats.soulsGained - State.runSoulsBaseline, 0,
        'run Souls did not start clean after migration');
});

check('a v5 save keeps its own baseline instead of being re-migrated', () => {
    /* The migration must not re-run on a save already at the current version:
       a player mid-run would have their run closed on every load, so they
       could never reboot again. The existing "migrations do not re-run" test
       is pinned to v3 and cannot see this. */
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            saveVersion: 5,
            resources: { praise: 1 },
            totalStats: { praiseGained: 0, offeringsGained: 0, soulsGained: 900_000 },
            runSoulsBaseline: 400_000,
        }),
    });
    assert.equal(State.runSoulsBaseline, 400_000,
        'a current save had its run closed by a migration that should not have run');
    assert.equal(State.totalStats.soulsGained - State.runSoulsBaseline, 500_000,
        'the in-progress run was destroyed on load');
});

check('a fresh save starts with an open run, not a closed one', () => {
    // The mirror: migration 5 must not leak into a new game, or the first
    // reboot would be unreachable.
    const { State } = bootWith({});
    assert.equal(State.runSoulsBaseline, 0);
});

/* ── The version stamp is code, not save data ──────────────────────────────

   save() serialises `this`, and SAVE_KEY / BACKUP_KEY / SAVE_VERSION live on
   State — so every real save file carries them. mergeInto copied them back
   over the running build's constants, which pinned the game to whatever
   version last wrote the file.

   Both fixtures below carry SAVE_VERSION the way a REAL save does. The
   existing v5 test above does not, which is exactly why it could not see
   this: a hand-written fixture is not the shape save() produces. */

check("a save cannot overwrite the running build's SAVE_VERSION", () => {
    // Read the constant from a save-less boot rather than restating it, so
    // this keeps testing the property and not the number of the day.
    const current = bootWith({}).State.SAVE_VERSION;
    const { State } = bootWith({
        cosmos_save: JSON.stringify({
            SAVE_VERSION: 3, saveVersion: 3,
            resources: { praise: 5 },
        }),
    });
    assert.equal(State.SAVE_VERSION, current,
        'the save dictated the version constant — every later migration is now unreachable');
    assert.equal(State.saveVersion, current, 'the stamp did not move forward');
});

check('a stale save cannot pin the game to its own version', () => {
    /* The whole failure, end to end, because each half of it looks harmless
       alone. A v4 save pins SAVE_VERSION to 4; the next save() stamps
       saveVersion 4 again; migration 5 therefore runs on EVERY load, and
       migration 5 closes the run. Measured on the real loader: runSouls
       pinned at 0 forever, so the player can never reboot again.

       Asserting on runSouls rather than on the version number is deliberate.
       The version is the mechanism; a run that can never be banked is the
       thing the player would actually notice. */
    let store = {
        cosmos_save: JSON.stringify({
            SAVE_VERSION: 4, saveVersion: 4,
            resources: { praise: 1 },
            totalStats: { praiseGained: 0, offeringsGained: 0, soulsGained: 500_000 },
        }),
    };

    // Load once: migration 5 legitimately closes the pre-v5 run.
    let boot = bootWith(store);
    assert.equal(boot.State.runSoulsBaseline, 500_000);
    boot.State.save();
    store = Object.fromEntries(boot.store);

    // Play. Then reload twice, saving in between, as a returning player does.
    boot = bootWith(store);
    boot.State.totalStats.soulsGained += 100_000;
    boot.State.save();
    store = Object.fromEntries(boot.store);

    boot = bootWith(store);
    assert.equal(boot.State.runSoulsBaseline, 500_000,
        'migration 5 re-ran and re-closed a run that was already open');
    assert.equal(
        boot.State.totalStats.soulsGained - boot.State.runSoulsBaseline, 100_000,
        'the run was reset to zero on load — this player can never reboot again',
    );
});

check('save() keeps the previous write as a backup', () => {
    const { State, store } = bootWith({ cosmos_save: JSON.stringify({ saveVersion: 3, resources: { praise: 5 } }) });
    State.resources.praise = 6;
    State.save();
    assert.ok(store.get('cosmos_save_backup'), 'previous save retained');
    assert.equal(JSON.parse(store.get('cosmos_save')).resources.praise, 6);
    assert.equal(JSON.parse(store.get('cosmos_save_backup')).resources.praise, 5);
});

console.log(`\n${passed} passed${process.exitCode ? ' — with failures' : ''}\n`);
