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
test('a new prayer lasts thirty seconds and carries its Offerings and Souls equivalents', () => {
    const {State,game}=boot();
    for (let i=0; i<500 && !State.divineEvent; i++) game.spawnDivineEvent(); // spawn chance is capped at 35%
    assert.equal(State.divineEvent.expiresAt,1_000_000+30_000);
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
console.log(`\n${passed} passed\n`);
