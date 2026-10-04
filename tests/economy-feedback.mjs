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
console.log(`\n${passed} passed\n`);
