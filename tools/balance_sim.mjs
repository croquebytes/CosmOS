#!/usr/bin/env node
/**
 * Headless balance simulator for CosmOS.
 *
 * Loads the real js/state.js and js/game.js into a sandbox, stubs the UI, and
 * plays the game with a simple greedy policy so progression can be measured
 * rather than guessed at.
 *
 *   node tools/balance_sim.mjs [hours] [--clicks-per-min N] [--quiet]
 *
 * Reports when each milestone lands and when the player runs out of things to
 * buy, which is the number that actually matters for a game meant to be idled.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const HOURS = Number(args.find((a) => !a.startsWith('--'))) || 8;
const CLICKS_PER_MIN = Number((args.find((a) => a.startsWith('--clicks-per-min')) || '').split('=')[1]) || 40;
const QUIET = args.includes('--quiet');
// --json emits a machine-comparable snapshot. The simulation is deterministic,
// so this doubles as a golden master: any refactor that is supposed to preserve
// the economy must reproduce the same digest byte for byte.
const JSON_OUT = args.includes('--json');

function makeSandbox() {
    const noop = () => {};
    // Any ui.* / system.* call from game logic resolves to a no-op.
    const stub = new Proxy({}, { get: () => noop });

    const sandbox = {
        console,
        Math,
        Date,
        JSON,
        Number,
        Object,
        Array,
        String,
        Boolean,
        isNaN,
        parseInt,
        parseFloat,
        setTimeout: noop,
        clearTimeout: noop,
        setInterval: noop,
        clearInterval: noop,
        confirm: () => true,
        alert: noop,
        prompt: () => null,
        ui: stub,
        system: stub,
        document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
                    createElement: () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop },
                                            appendChild: noop, addEventListener: noop, dataset: {} }),
                    addEventListener: noop, body: { classList: { add: noop, remove: noop } } },
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        requestAnimationFrame: noop,
        performance: { now: () => Date.now() }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    return vm.createContext(sandbox);
}

const ctx = makeSandbox();
for (const file of ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/game.js']) {
    vm.runInContext(readFileSync(resolve(ROOT, file), 'utf8'), ctx, { filename: file });
}

// Top-level `const` in a vm script lands in the context's lexical scope, not on
// the sandbox object, so the bindings have to be read back by evaluation.
const { State, game, UpgradeList, MandateList, RepeatableList, AutomatonSpecs, Economy, Modifiers, Reality } =
    vm.runInContext(
        '({ State, game, UpgradeList, MandateList, RepeatableList, AutomatonSpecs, Economy, Modifiers, Reality })',
        ctx,
    );

/* Pin the Reality Build seed. Builds are a pure function of (runSeed,
   prestigeLevel, channel), so fixing the seed keeps the simulation
   deterministic and the golden master meaningful. Override with --seed to
   sample a different sequence of universes. */
const SEED = Number((args.find((a) => a.startsWith('--seed')) || '').split('=')[1]) || 20260726;
const CHANNEL = (args.find((a) => a.startsWith('--channel')) || '').split('=')[1] || 'stable';
/* Whole-object, so every field the schema declares has to be restated here.
   A per-run field added under State.reality and forgotten in this literal is
   `undefined` for the entire simulation, which looks like a balance change
   rather than a missing pin. */
State.reality = {
    runSeed: SEED, channel: CHANNEL, build: null, shipped: 0,
    instability: 0, cascadeTier: 0, alertedTier: 0, scars: [],
};

/* Which Mandate path the simulated player certifies on at each reboot.

   `--certify=creation` pins one path. The default ROTATES, taking the branch
   with the most owned nodes that is not the current one, because a player who
   never rotates never sees the residue and a player who rotates every time
   never keeps a bonus — and the mechanic is supposed to make both of those
   legitimate. Rotation is the harsher of the two on the economy, so it is the
   right default for a balance measurement. */
const CERTIFY = (args.find((a) => a.startsWith('--certify')) || '').split('=')[1] || null;

/* How deep the simulated player pushes a run before shipping it.

   1 is the impatient player: bank the moment there is a point to bank. That
   is the loop the reboot curve was tuned against and it stays the default.
   Higher values model the player the cascade exists for — someone holding a
   run open for a fatter award while unpatched issues degrade the build. The
   whole ship-or-push decision is invisible at --push=1, because a run that
   short never reaches a cascade tier. */
const PUSH = Number((args.find((a) => a.startsWith('--push')) || '').split('=')[1]) || 1;

/* --no-patch models the player who never opens the Universal Engine panel.
   It is the only policy under which the cascade is currently reachable, and
   it exists so that is measurable rather than assumed. */
const NO_PATCH = args.includes('--no-patch');

// The registry has to be seeded before any rate is read, exactly as
// game.initializeSession() does it in the browser.
game.bootstrapModifiers(Date.now());

/* ── Policy ───────────────────────────────────────────────────────────
   A reasonable engaged player: always buy an affordable upgrade, keep
   buying the automator with the better praise-per-cost, and click while
   present. Deliberately not optimal -- just not asleep. */
function buyAffordableUpgrades(log, t) {
    let bought = 0;
    for (const upgrade of UpgradeList) {
        if (State.upgrades[upgrade.id]) continue;
        let visible = false;
        try { visible = upgrade.visible(); } catch { visible = false; }
        if (!visible) continue;

        const affordable = Object.entries(upgrade.cost).every(([res, amount]) => {
            if (res === 'darkness' || res === 'shadows' || res === 'echoes') {
                return (State.dimensions.void.resources[res] || 0) >= amount;
            }
            return (State.resources[res] || 0) >= amount;
        });
        if (!affordable) continue;

        game.purchaseUpgrade(upgrade.id, null);
        if (State.upgrades[upgrade.id]) {
            bought++;
            log(t, `upgrade: ${upgrade.name}`);
        }
    }
    return bought;
}

function buyMandates(log, t) {
    for (const mandate of MandateList) {
        if (State.purchasedMandates[mandate.id]) continue;
        if (!mandate.prerequisites.every((p) => State.purchasedMandates[p])) continue;
        game.purchaseMandate(mandate.id);
        if (State.purchasedMandates[mandate.id]) log(t, `mandate: ${mandate.name} (${mandate.cost} DP)`);
    }
}

/* The path to certify on at the next reboot. See CERTIFY above. */
function nextCertification() {
    if (CERTIFY) return CERTIFY;
    const current = game.certification().path;
    const ranked = game.CERT_BRANCHES
        .map((b) => game.branchStanding(b))
        .sort((a, b) => b.spent - a.spent);
    return (ranked.find((s) => s.branch !== current) || ranked[0]).branch;
}

/* Known issues: patch when it is affordable without starving the run.

   The policy exists because instability makes ignoring the changelog a real
   cost, and a simulator that never patches would measure a game nobody
   plays. The 1.6x reserve is the same shape as the repeatable policy's —
   spend on repairs only out of genuine surplus, so patching does not simply
   out-compete buying automatons. */
function patchIssues(log, t) {
    if (NO_PATCH) return false;
    const build = State.reality?.build;
    if (!build) return false;
    let patched = false;
    for (const entry of Reality.unpatchedIssues(build)) {
        const cost = Reality.patchCostOf(build, entry.id);
        if (!cost) continue;
        if ((cost.bag[cost.resource] || 0) < cost.amount * 1.6) continue;
        if (game.patchKnownIssue(entry.id)) {
            patched = true;
            log(t, `patched: ${entry.id} (${Math.ceil(cost.amount)} ${cost.resource})`);
        }
    }
    return patched;
}

/* Repeatables: buy whenever affordable, but keep a reserve so the policy does
   not starve automaton purchases. */
function buyRepeatables(log, t) {
    let bought = false;
    for (const spec of RepeatableList) {
        let visible = false;
        try { visible = spec.visible(); } catch { visible = false; }
        if (!visible) continue;

        const cost = game.getRepeatableCost(spec.id);
        if ((game.resourcePool(spec)[spec.resource] || 0) < cost * 1.15) continue;

        const before = game.getRepeatableLevel(spec.id);
        game.purchaseRepeatable(spec.id);
        if (game.getRepeatableLevel(spec.id) > before) {
            bought = true;
            log(t, `repeatable: ${spec.name} -> rank ${game.getRepeatableLevel(spec.id)}`);
        }
    }
    return bought;
}

/* Automatons, cheapest-rank-first, leaving a Praise reserve so Thrones do not
   consume every last point the moment they are affordable. */
function buyAutomatons(log, t) {
    let bought = false;
    // Base ranks of each pool buy greedily; converters and top ranks keep
    // headroom so one rank cannot lock the others out of their currency.
    const base = new Set(['seraph', 'wraith']);
    for (const type of Object.keys(AutomatonSpecs)) {
        const spec = AutomatonSpecs[type];
        let visible = false;
        try { visible = spec.visible(); } catch { visible = false; }
        if (!visible) continue;

        let guard = 0;
        while (guard++ < 500) {
            const cost = game.getAutomatonCost(type);
            const held = game.resourcePool(spec)[spec.currency] || 0;
            if (held < cost * (base.has(type) ? 1 : 1.5)) break;
            const before = game.getAutomatonCount(type);
            game.buyAutomator(type, null);
            if (game.getAutomatonCount(type) === before) break;
            bought = true;
        }
        if (game.getAutomatonCount(type) >= 1) log(t, `first ${type}`);
    }
    return bought;
}

/* The Void is a side economy the player has to actively visit. The policy
   enters it once unlocked, clicks it, and spends Echoes on Null Doctrine. */
function playVoid(log, t) {
    const vd = State.dimensions.void;
    if (!vd.unlocked) return false;

    if (State.currentDimension !== 'void') {
        State.currentDimension = 'void';
        log(t, 'entered the Void');
    }

    game.manualVoidClick(null);

    let bought = false;
    let guard = 0;
    while (guard++ < 100 && (vd.resources.echoes || 0) >= game.getNullDoctrineCost() * 1.2) {
        const before = State.nullDoctrine || 0;
        game.purchaseNullDoctrine();
        if ((State.nullDoctrine || 0) === before) break;
        bought = true;
        log(t, `null doctrine -> rank ${State.nullDoctrine}`);
    }
    return bought;
}

function run() {
    const start = Date.now();
    let now = start;
    const totalSeconds = HOURS * 3600;
    const milestones = [];
    const seen = new Set();

    const log = (t, msg) => {
        if (seen.has(msg)) return;
        seen.add(msg);
        milestones.push({ t, msg });
    };
    const mark = (t, key, msg) => { if (!seen.has(key)) { seen.add(key); milestones.push({ t, msg }); } };

    let lastPurchaseSecond = 0;
    let lastPrestigeSecond = -Infinity;
    const prestigeLog = [];
    const clickInterval = CLICKS_PER_MIN > 0 ? 60 / CLICKS_PER_MIN : Infinity;
    let nextClick = 0;

    for (let t = 0; t < totalSeconds; t++) {
        now = start + t * 1000;

        if (t >= nextClick && Number.isFinite(clickInterval)) {
            game.manualPraise(null);
            nextClick = t + clickInterval;
        }

        game.tick(1, now);

        // Purchases resolve once a second, same as a player reacting.
        const boughtUpgrade = buyAffordableUpgrades(log, t);
        if (boughtUpgrade) lastPurchaseSecond = t;
        buyMandates(log, t);
        // Standing Doctrine soaks up leftover Divinity.
        let dg = 0;
        while (dg++ < 200 && game.getAvailableDivinityPoints() >= game.getDoctrineCost()) {
            game.purchaseDoctrine();
        }

        if (buyRepeatables(log, t)) lastPurchaseSecond = t;
        if (buyAutomatons(log, t)) lastPurchaseSecond = t;
        if (playVoid(log, t)) lastPurchaseSecond = t;
        if (patchIssues(log, t)) lastPurchaseSecond = t;

        /* Prestige like a player would.

           The old policy waited for `gain >= max(5, banked * 0.5)`, which made
           sense when Divinity was a function of LIFETIME souls: reboot timing
           could not change the total, so hoarding cost nothing and rebooting
           early wasted production. Under the run-scoped curve that policy
           models nobody — it reaches reboot 3 at 18h and never reaches 8.

           Now the bar rises with banked Divinity, so banking a point as soon
           as the run clears the bar IS the loop rather than spam: each reboot
           makes the next one harder. Measured over 24h, this reaches Beta
           (reboot 3) at 3h20, Nightly (8) at 9h16 and Archived (12) at 14h09,
           and yields more Divinity than waiting for a fatter payout — while a
           patient player still lands within ~20%, which is what keeps it a
           decision rather than a solved one. Five minutes of spacing stands in
           for a player who is not staring at the button. */
        /* Ships on the AWARD, not the raw score. Under a cascade those two
           diverge — the award is what the reboot actually pays — and a policy
           that shipped on the score would happily bank a collapsed build for
           nothing and call it progress. */
        const gain = game.getPrestigeAward();
        if (gain >= PUSH && t - lastPrestigeSecond > 300) {
            const cascade = game.cascadeState();
            game.performPrestige({ confirmed: true, certifyOn: nextCertification() });
            lastPrestigeSecond = t;
            prestigeLog.push({
                t, gain, total: State.totalDivinityPoints,
                certified: game.certification().path,
                tier: cascade.tier,
                scars: State.reality.scars.length,
            });
            log(t, `PRESTIGE #${State.prestigeLevel} -> +${gain} DP (total ${State.totalDivinityPoints}), certified ${game.certification().path}`);
            lastPurchaseSecond = t;
        }

        if (State.automatons.seraphCount >= 1) mark(t, 'seraph1', 'first Seraph');
        if (State.automatons.seraphCount >= 10) mark(t, 'seraph10', '10 Seraphs');
        if (State.unlockedOfferings) mark(t, 'offerings', 'Offerings unlocked');
        if (State.dimensions.void.unlocked) mark(t, 'void', 'Void unlocked');
        if (State.resources.praise >= State.resourceCaps.praise) mark(t, 'praisecap', 'PRAISE CAPPED');
        if (State.resources.souls >= State.resourceCaps.souls) mark(t, 'soulcap', 'SOULS CAPPED');
        if (State.unlockedApps.includes('divineglobe')) mark(t, 'globe', 'Divine Globe unlocked');
        if (game.canPrestige()) mark(t, 'prestige', 'PRESTIGE AVAILABLE');
    }

    return { milestones, lastPurchaseSecond, totalSeconds, prestigeLog };
}

const hhmmss = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const { milestones, lastPurchaseSecond, totalSeconds, prestigeLog } = run();

if (JSON_OUT) {
    const vd = State.dimensions.void;
    const snapshot = {
        hours: HOURS,
        clicksPerMin: CLICKS_PER_MIN,
        resources: {
            praise: State.resources.praise,
            offerings: State.resources.offerings,
            souls: State.resources.souls
        },
        caps: { ...State.resourceCaps },
        lifetimeSouls: State.totalStats?.soulsGained || 0,
        rates: (() => {
            const r = game.getProductionRates(Date.now(), false);
            return {
                praise: r.praise, praiseGross: r.praiseGross, offerings: r.offerings, souls: r.souls,
                darkness: r.darkness, shadows: r.shadows, echoes: r.echoes
            };
        })(),
        automatons: { ...State.automatons },
        repeatables: { ...State.repeatables },
        multipliers: {
            praise: State.praiseMultiplier,
            offering: State.offeringMultiplier,
            soul: State.soulMultiplier,
            divinityPoint: State.divinityPointMultiplier,
            throneDraw: State.throneDrawMultiplier,
            offlineEfficiency: State.offlineEfficiency
        },
        bonuses: {
            drill: game.getDrillBonus(),
            dominion: game.getDominionBonus(),
            refinement: game.getRefinementBonus(),
            doctrine: game.getDoctrineBonus(),
            nemesis: game.getNemesisBonus(),
            nullDoctrine: game.getNullDoctrineBonus(),
            voidDrill: game.getVoidDrillBonus(),
            voidRefinement: game.getVoidRefinementBonus()
        },
        prestige: {
            level: State.prestigeLevel,
            totalDivinityPoints: State.totalDivinityPoints,
            spent: State.divinityPointsSpent,
            standingDoctrine: State.standingDoctrine,
            nullDoctrine: State.nullDoctrine
        },
        void: {
            unlocked: vd.unlocked,
            resources: { ...vd.resources },
            caps: { ...vd.resourceCaps },
            automatons: { ...vd.automatons },
            repeatables: { ...vd.repeatables }
        },
        reality: {
            seed: State.reality.runSeed,
            channel: State.reality.channel,
            shipped: State.reality.shipped,
            version: State.reality.build?.version,
            entries: (State.reality.build?.entries || []).map((e) => `${e.kind}:${e.id}${e.patched ? ':patched' : ''}`),
            instability: State.reality.instability,
            cascadeTier: State.reality.cascadeTier,
            scars: [...State.reality.scars].sort(),
        },
        certification: {
            path: State.certification.path,
            everCertified: [...State.certification.everCertified].sort(),
        },
        upgradesOwned: Object.keys(State.upgrades).filter((k) => State.upgrades[k]).sort(),
        mandatesOwned: Object.keys(State.purchasedMandates).filter((k) => State.purchasedMandates[k]).sort(),
        lastPurchaseSecond,
        prestigeLog
    };
    console.log(JSON.stringify(snapshot, null, 1));
    process.exit(0);
}

console.log(`\nCosmOS balance simulation — ${HOURS}h at ${CLICKS_PER_MIN} clicks/min\n`);
if (!QUIET) {
    for (const { t, msg } of milestones) console.log(`  ${hhmmss(t)}  ${msg}`);
}

const remainingUpgrades = UpgradeList.filter((u) => !State.upgrades[u.id]).length;
const remainingMandates = MandateList.filter((m) => !State.purchasedMandates[m.id]).length;

console.log(`\n  ── after ${HOURS}h ──`);
console.log(`  praise            ${Math.floor(State.resources.praise)} / ${State.resourceCaps.praise}`);
console.log(`  offerings         ${Math.floor(State.resources.offerings)} / ${State.resourceCaps.offerings}`);
console.log(`  souls             ${Math.floor(State.resources.souls)} / ${State.resourceCaps.souls}`);
console.log(`  lifetime souls    ${Math.floor(State.totalStats?.soulsGained || 0)}`);
console.log(`  hierarchy         ${State.automatons.seraphCount} seraph / ${State.automatons.throneCount} throne / ${State.automatons.cherubCount} cherub / ${State.automatons.dominionCount} dominion`);
console.log(`  offerings per sec ${game.getProductionRates(Date.now(), false).offerings.toFixed(2)}`);
console.log(`  souls per sec     ${game.getProductionRates(Date.now(), false).souls.toFixed(2)}`);
console.log(`  primordial ranks  ${RepeatableList.filter((r) => (r.pool || 'primordial') === 'primordial').map((r) => `${r.id}:${game.getRepeatableLevel(r.id)}`).join('  ')}`);
const vd = State.dimensions.void;
console.log(`  ── void ──`);
console.log(`  unlocked          ${vd.unlocked}`);
console.log(`  hierarchy         ${vd.automatons.wraithCount} wraith / ${vd.automatons.revenantCount} revenant / ${vd.automatons.phantomCount} phantom / ${vd.automatons.nemesisCount} nemesis`);
console.log(`  darkness          ${Math.floor(vd.resources.darkness)} / ${Math.floor(vd.resourceCaps.darkness)}`);
console.log(`  shadows           ${Math.floor(vd.resources.shadows)} / ${Math.floor(vd.resourceCaps.shadows)}`);
console.log(`  echoes            ${Math.floor(vd.resources.echoes)} / ${Math.floor(vd.resourceCaps.echoes)}`);
console.log(`  void ranks        ${RepeatableList.filter((r) => r.pool === 'void').map((r) => `${r.id}:${game.getRepeatableLevel(r.id)}`).join('  ')}`);
console.log(`  null doctrine     rank ${State.nullDoctrine || 0} (+${Math.round((game.getNullDoctrineBonus() - 1) * 100)}% all production)`);
console.log(`  nemesis bonus     +${Math.round((game.getNemesisBonus() - 1) * 100)}% all production`);
console.log(`  praise per sec    ${game.getProductionRates(Date.now(), false).praise.toFixed(2)}`);
console.log(`  divinity          ${State.totalDivinityPoints} earned, ${game.getAvailableDivinityPoints()} unspent (prestige now: +${game.calculateDivinityPoints()})`);
console.log(`  prestige level    ${State.prestigeLevel}`);
console.log(`  ── reality ──`);
console.log(`  build             v${State.reality.build?.version} on ${State.reality.channel} (seed ${State.reality.runSeed}, ${State.reality.shipped} shipped)`);
for (const entry of State.reality.build?.entries || []) {
    const mark = entry.kind === 'improvement' ? '+' : entry.kind === 'deprecation' ? 'x' : entry.kind === 'regression' ? '!' : '-';
    console.log(`   ${mark} ${entry.patched ? '[patched] ' : ''}${entry.note.slice(0, 92)}`);
}
console.log(`  standing doctrine rank ${State.standingDoctrine || 0} (+${Math.round((game.getDoctrineBonus() - 1) * 100)}% all production)`);
console.log(`  upgrades left     ${remainingUpgrades} / ${UpgradeList.length}`);
console.log(`  mandates left     ${remainingMandates} / ${MandateList.length}`);
console.log(`  last purchase at  ${hhmmss(lastPurchaseSecond)}` +
            (lastPurchaseSecond < totalSeconds - 60
                ? `  → ${hhmmss(totalSeconds - lastPurchaseSecond)} of DEAD TIME`
                : ''));
console.log('');
