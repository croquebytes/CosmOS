#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const noop = () => {};
const stateSource = readFileSync(new URL('../js/state.js', import.meta.url), 'utf8');
const gameSource = readFileSync(new URL('../js/game.js', import.meta.url), 'utf8');
function boot(store = {}, now = 1_000_000) {
    class Clock extends Date { static now() { return now; } }
    const ctx = vm.createContext({ Date: Clock, console, setTimeout: noop, clearTimeout: noop,
        setInterval: noop, clearInterval: noop, requestAnimationFrame: noop,
        localStorage: { getItem: k => store[k] || null, setItem: (k,v) => {store[k]=v;}, removeItem: k => {delete store[k];} },
        ui: new Proxy({}, {get:()=>noop}), window: {}, document: {addEventListener:noop} });
    vm.runInContext(stateSource, ctx); vm.runInContext(gameSource, ctx);
    return {...vm.runInContext('({State,game})',ctx),store};
}
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('  ok    '+name); };
test('feeds expire at their original deadlines after save / reload, including overlapping meals', () => {
    const a = boot(); a.State.resources.praise=500; a.State.resources.souls=100;
    a.game.feedProphets('praise',100); a.game.feedProphets('souls',10);
    assert.equal(a.State.resources.praise,400);
    a.State.save();
    const b = boot(a.store,1_100_000);
    assert.ok(Math.abs(b.State.prophetFeedingBonus(1_100_000)-1.65)<1e-12);
    assert.equal(b.State.prophetFeedingBonus(1_300_000),1.5);
    assert.equal(b.State.prophetFeedingBonus(1_600_000),1);
    b.State.reconcileProphetFeeds(1_600_000); b.State.save();
    assert.equal(boot(b.store,1_600_001).State.prophets.feedingBonus,1);
});
test('an old saved multiplier with no deadline is retired, while valid meals survive', () => {
    const a = boot({cosmos_save:JSON.stringify({saveVersion:6,prophets:{feedingBonus:1.5}})});
    assert.equal(a.State.prophetFeedingBonus(),1);
    assert.equal(a.State.prophets.feedingBonus,1);
});
test('unknown, negative and unaffordable meals cannot grant resources or boosts', () => {
    const {State,game}=boot(); State.resources.praise=50;
    for(const args of [['praise',-1],['praise',0],['praise',100],['missing',1],['constructor',1]]) game.feedProphets(...args);
    assert.equal(State.resources.praise,50); assert.equal(State.prophetFeedingBonus(),1); assert.equal(Object.hasOwn(State.resources,'constructor'),false);
});
test('full and nearly full Adoration vaults spend no resources or shared cooldown', () => {
    const {State,game}=boot(); State.resources.souls=100;
    for(const value of [1000,999.5]) {State.adoration=value; game.answerCall('souls');
        assert.equal(State.adoration,value); assert.equal(State.resources.souls,100); assert.equal(State.divineCalls.lastAnswered,0);}
    State.adoration=999; game.answerCall('souls');
    assert.equal(State.adoration,1000); assert.equal(State.resources.souls,90); assert.equal(State.divineCalls.lastAnswered,1_000_000);
});
test('an expired praise event cannot be collected between simulation ticks', () => {
    const {State,game}=boot(); State.resources.praise=0;
    State.divineEvent={value:50,x:30,y:30,expiresAt:999_999};
    game.clickDivineEvent(); assert.equal(State.resources.praise,0); assert.equal(State.divineEvent,null);
    assert.equal(State.loopSystems.totalDivineEventsClaimed,0);
});
test('a prayer pays Praise while the vault can hold a quarter of it, clipped to the room', () => {
    const {State,game}=boot(); State.resourceCaps.praise=1000;
    const event={value:400,offerings:80,souls:8,x:0,y:0,expiresAt:2_000_000};
    State.resources.praise=0; assert.deepEqual({...game.divineEventPayout(event)},{resource:'praise',amount:400});
    State.resources.praise=850; assert.deepEqual({...game.divineEventPayout(event)},{resource:'praise',amount:150});
    State.divineEvent=event; game.clickDivineEvent();
    assert.equal(State.resources.praise,1000); assert.equal(State.loopSystems.totalDivineEventsClaimed,1);
});
test('a full Praise vault reroutes the same seconds to Offerings, then Souls, then Overclock charge', () => {
    const {State,game}=boot(); game.ensureLoopState();
    State.resourceCaps.praise=1000; State.resources.praise=1000;
    State.resourceCaps.offerings=100; State.resources.offerings=0;
    State.resourceCaps.souls=100; State.resources.souls=0;
    const event={value:400,offerings:80,souls:8,x:0,y:0,expiresAt:2_000_000};
    assert.deepEqual({...game.divineEventPayout(event)},{resource:'offerings',amount:80});
    State.resources.offerings=100; assert.deepEqual({...game.divineEventPayout(event)},{resource:'souls',amount:8});
    State.resources.souls=100; State.loopSystems.overclock.charge=90;
    assert.deepEqual({...game.divineEventPayout(event)},{resource:'charge',amount:10});
    State.loopSystems.overclock.charge=100; assert.deepEqual({...game.divineEventPayout(event)},{resource:null,amount:0});
    State.loopSystems.overclock.charge=0; State.divineEvent=event; game.clickDivineEvent();
    // 25 rerouted, then the claim's own 18 + 2 × chain.
    assert.equal(State.loopSystems.overclock.charge,45); assert.equal(State.resources.praise,1000);
});
test('a new prayer lasts twenty seconds and carries its Offerings and Souls equivalents', () => {
    const {State,game}=boot();
    for (let i=0; i<500 && !State.divineEvent; i++) game.spawnDivineEvent(); // spawn chance is capped at 35%
    assert.equal(State.divineEvent.expiresAt,1_000_000+20_000);
    assert.ok(State.divineEvent.value>=10 && Number.isFinite(State.divineEvent.offerings) && Number.isFinite(State.divineEvent.souls));
});
test('Intercession files a missed prayer at half value without touching the chain', () => {
    const {State,game}=boot(); game.ensureLoopState(); State.resourceCaps.praise=1000; State.resources.praise=0;
    State.loopSystems.divineEventChain=2;
    State.divineEvent={value:400,x:0,y:0,expiresAt:1_000_000}; game.expireDivineEvent();
    assert.equal(State.resources.praise,0);
    State.upgrades.prayer_intercession=true;
    State.divineEvent={value:400,x:0,y:0,expiresAt:1_000_000}; game.clickDivineEvent();
    assert.equal(State.resources.praise,200); assert.equal(State.divineEvent,null);
    assert.equal(State.loopSystems.divineEventChain,2); assert.equal(State.loopSystems.totalDivineEventsClaimed,0);
});
test('a directive reward banks what fits and pays the overflow where there is room', () => {
    const {State,game}=boot();
    game.getProductionRates = () => ({ praiseGross: 10, offerings: 2, souls: 0.5 });
    Object.assign(State.resourceCaps, { praise: 1000, offerings: 100, souls: 100 });
    Object.assign(State.resources, { praise: 0, offerings: 0, souls: 0 });
    const directive = { reward: { praise: 400, souls: 3, charge: 20 } };
    assert.deepEqual({...game.directivePayout(directive).paid}, { praise: 400, offerings: 0, souls: 3, adoration: 0, charge: 20 });
    State.resources.praise = 900; // room for 100: 300 Praise = 30s = 60 Offerings
    const full = game.directivePayout(directive);
    assert.equal(full.rerouted, true);
    assert.deepEqual({...full.paid}, { praise: 100, offerings: 60, souls: 3, adoration: 0, charge: 20 });
    Object.assign(State.resources, { praise: 1000, offerings: 100 }); // 40s left over: 20 Souls
    assert.deepEqual({...game.directivePayout(directive).paid}, { praise: 0, offerings: 0, souls: 23, adoration: 0, charge: 20 });
    State.resources.souls = 100; // nowhere left: Overclock charge
    assert.deepEqual({...game.directivePayout(directive).paid}, { praise: 0, offerings: 0, souls: 0, adoration: 0, charge: 45 });
});
test('claiming a directive pays exactly the quoted payout', () => {
    const {State,game}=boot(); game.ensureLoopState();
    game.getProductionRates = () => ({ praiseGross: 10, offerings: 2, souls: 0.5 });
    Object.assign(State.resourceCaps, { praise: 1000, offerings: 100, souls: 100 });
    Object.assign(State.resources, { praise: 900, offerings: 0, souls: 0 });
    game.getDirectiveProgress = () => ({ current: 1, target: 1, ratio: 1, completed: true });
    game.generateDirective = () => {}; game.checkAchievements = () => {};
    State.loopSystems.directives.active = { title: 'T', reward: { praise: 400, souls: 3 } };
    const quoted = {...game.directivePayout(State.loopSystems.directives.active).paid};
    const earned = State.totalPraiseEarned;
    game.claimDirectiveReward();
    assert.equal(State.resources.praise, 900 + quoted.praise);
    assert.equal(State.resources.offerings, quoted.offerings);
    assert.equal(State.resources.souls, quoted.souls);
    assert.equal(State.totalPraiseEarned - earned, quoted.praise, 'lifetime totals count what was paid');
});
test('Reclamation installs once, after a reboot, for Divinity that survives it', () => {
    const {State,game}=boot();
    State.totalDivinityPoints = 10;
    assert.equal(game.installReclamation(), false, 'installed before the first reboot');
    State.prestigeLevel = 1;
    assert.equal(game.installReclamation(), true);
    assert.equal(State.divinityPointsSpent, game.RECLAMATION_COST);
    assert.equal(game.installReclamation(), false, 'installed twice');
    State.prestigeLevel = 1; State.totalDivinityPoints = 0; State.divinityPointsSpent = 0;
    const {State: S2, game: g2} = boot(); S2.prestigeLevel = 1; S2.totalDivinityPoints = 4;
    assert.equal(g2.installReclamation(), false, 'installed without enough Divinity');
});
test('an unanswered prayer goes to the Bin, a full Bin falls to Intercession, and the chain is untouched', () => {
    const {State,game}=boot(); game.ensureLoopState();
    State.prayerBin.installed = true; State.loopSystems.divineEventChain = 2;
    State.resourceCaps.praise = 1e6; State.resources.praise = 0;
    State.divineEvent = { value: 400, seconds: 40, x: 0, y: 0, expiresAt: 1_000_000 };
    game.expireDivineEvent();
    assert.deepEqual([...State.prayerBin.entries], [40]);
    assert.equal(State.resources.praise, 0, 'a reclaimed prayer pays nothing until restored');
    State.prayerBin.entries = Array(game.PRAYER_BIN_CAPACITY).fill(10);
    State.upgrades.prayer_intercession = true;
    State.divineEvent = { value: 400, seconds: 40, x: 0, y: 0, expiresAt: 1_000_000 };
    game.expireDivineEvent();
    assert.equal(State.prayerBin.entries.length, game.PRAYER_BIN_CAPACITY);
    assert.equal(State.resources.praise, 200, 'overflow should be filed by Intercession at half value');
    assert.equal(State.loopSystems.divineEventChain, 2);
});
test('a new prayer waits three seconds once Reclamation is installed', () => {
    const {State,game}=boot(); State.prayerBin.installed = true;
    for (let i=0; i<500 && !State.divineEvent; i++) game.spawnDivineEvent();
    assert.equal(State.divineEvent.expiresAt, 1_000_000 + game.RECLAIM_WINDOW);
    assert.ok(Number.isFinite(State.divineEvent.seconds));
});
test('Restore pays the stored seconds at current production, where there is room, and empties the Bin', () => {
    const {State,game}=boot();
    game.getProductionRates = () => ({ praiseGross: 10, offerings: 2, souls: 0.5 });
    Object.assign(State.resourceCaps, { praise: 1000, offerings: 100, souls: 100 });
    Object.assign(State.resources, { praise: 900, offerings: 0, souls: 0 });
    State.prayerBin = { installed: true, entries: [20, 20] }; // 40s = 400 Praise: 100 fits, 30s = 60 Offerings
    const quote = {...game.prayerBinPayout().paid};
    assert.equal(quote.praise, 100); assert.equal(quote.offerings, 60);
    assert.equal(game.restorePrayers(), true);
    assert.equal(State.resources.praise, 1000); assert.equal(State.resources.offerings, 60);
    assert.equal(State.prayerBin.entries.length, 0);
    assert.equal(game.restorePrayers(), false, 'an empty Bin restored something');
});
test('a forged Bin is trimmed on load', () => {
    const store = {};
    const a = boot(store); a.State.save();
    const parsed = JSON.parse(store.cosmos_save);
    parsed.prayerBin = { installed: 'yes', entries: [1e9, -5, 'x', ...Array(20).fill(30)] };
    store.cosmos_save = JSON.stringify(parsed);
    const b = boot(store);
    assert.equal(b.State.prayerBin.installed, false);
    assert.equal(b.State.prayerBin.entries.length, 12);
    assert.ok(b.State.prayerBin.entries.every((s) => s === 30));
});
console.log(`\n${passed} passed\n`);
