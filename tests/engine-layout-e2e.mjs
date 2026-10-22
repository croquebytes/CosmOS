#!/usr/bin/env node
/* The compact Engine: resources, the directive and the act stay in view;
   the operator panel's button does the next useful thing; the core folds
   after the first Seraph and remembers that per layout.
   Run against a dev server: node tests/engine-layout-e2e.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
let passed = 0; const errors = [];
const step = (name) => { passed++; console.log('  ok    ' + name); };
async function fresh(viewport, context = null) {
    const ctx = context || await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/?testMode=1');
    await page.getByRole('button', { name: 'Perform Miracle', exact: true }).waitFor();
    await page.evaluate(() => { ui.dismissSystemModal(); media.setCinematics('off'); });
    return page;
}
const box = (page, sel) => page.locator(sel).boundingBox();
const inView = (b, h) => b && b.y >= 0 && b.y + b.height <= h;
try {
    const phone = await fresh({ width: 390, height: 844 });
    for (const sel of ['#val-praise', '#engine-directive', '.engine-acts .divine-btn']) {
        assert.ok(inView(await box(phone, sel), 804), `${sel} visible in the first view`);
    }
    step('at 390×844 the resources, the directive and Perform Miracle share the first view');

    for (let i = 0; i < 10; i++) await phone.getByRole('button', { name: 'Perform Miracle', exact: true }).click();
    const claim = phone.locator('#engine-claim');
    await claim.waitFor({ state: 'visible' });
    assert.match(await claim.innerText(), /^Claim · \+\d+ Praise/);
    assert.ok(inView(await claim.boundingBox(), 804));
    const before = await phone.evaluate(() => State.loopSystems.directives.completed);
    await claim.click();
    assert.equal(await phone.evaluate(() => State.loopSystems.directives.completed), before + 1);
    await claim.waitFor({ state: 'hidden' });
    step('a completed directive puts Claim, with its reward, beside Perform Miracle; claiming pays and hides it');

    assert.equal(await phone.locator('#core-fold').isHidden(), true);
    await phone.evaluate(() => { State.resources.praise = 60; game.buyAutomator('seraph'); });
    await phone.locator('#core-fold').waitFor({ state: 'visible' });
    assert.match(await phone.locator('#engine-core').getAttribute('class'), /is-folded/);
    assert.ok((await box(phone, '#engine-core')).height <= 70);
    await phone.locator('#core-fold').click();
    assert.doesNotMatch(await phone.locator('#engine-core').getAttribute('class'), /is-folded/);
    assert.equal(await phone.evaluate(() => localStorage.getItem('cosmos.coreFolded.narrow')), '0');
    step('after the first Seraph a narrow screen folds the core; unfolding is remembered for the narrow layout');

    await phone.evaluate(() => { const c = document.getElementById('content-console'); c.scrollTop = c.scrollHeight; });
    await phone.waitForTimeout(100);
    const strip = await box(phone, '#engine-command');
    assert.ok(inView(strip, 804) && strip.y < 80, 'strip pinned near the top after scrolling');
    await phone.locator('#btn-overclock').evaluate((e) => { e.disabled = false; });
    await phone.locator('#btn-overclock').focus();
    await phone.waitForTimeout(100);
    const focused = await box(phone, '#btn-overclock');
    const pinned = await box(phone, '#engine-command');
    assert.ok(focused.y >= pinned.y + pinned.height - 1, 'focused control clears the strip');
    await phone.evaluate(() => { document.getElementById('content-console').scrollTop = 400; system.openApp('settings'); system.openApp('console'); });
    assert.equal(await phone.evaluate(() => document.getElementById('content-console').scrollTop), 400);
    step('the strip stays pinned while scrolling, focus never lands under it, and switching apps keeps the scroll');
    await phone.context().close();

    const desk = await fresh({ width: 1440, height: 900 });
    assert.equal(await desk.locator('#operator-action-label').innerText(), 'Open Universal Engine');
    await desk.evaluate(() => { State.resources.praise = 10; ui.refreshAll(); });
    assert.equal(await desk.locator('#operator-action-label').innerText(), 'Commission first Seraph →');
    await desk.evaluate(() => system.closeApp('console'));
    await desk.locator('.operator-open-button').click();
    assert.equal(await desk.evaluate(() => document.activeElement?.dataset?.automaton), 'seraph');
    step('an affordable milestone names itself on the operator button and focuses its control in the Engine');

    for (let i = 0; i < 10; i++) await desk.getByRole('button', { name: 'Perform Miracle', exact: true }).click();
    await desk.evaluate(() => ui.refreshAll());
    assert.match(await desk.locator('#operator-action-label').innerText(), /^Claim directive · \+\d+ Praise/);
    const done = await desk.evaluate(() => State.loopSystems.directives.completed);
    await desk.locator('.operator-open-button').click();
    assert.equal(await desk.evaluate(() => State.loopSystems.directives.completed), done + 1);
    assert.equal(await desk.locator('#core-fold').isHidden(), true, 'no fold before the first Seraph');
    step('a finished directive is claimed from the operator panel in one click, reward on the label');

    const ready = await desk.evaluate(() => {
        State.automatons.seraphCount = 1;
        Object.assign(State.upgrades, { praise_multi_1: true, storage_praise_1: true });
        State.unlockedOfferings = true;
        State.resources.souls = 500;
        return ui.getNextMilestone();
    });
    assert.equal(ready.label, 'Breach the Veil');
    assert.equal(ready.ready, false);
    assert.match(ready.detail, /500 \/ 12\.0K Souls/);
    assert.equal(await desk.evaluate(() => {
        Object.assign(State.resourceCaps, { praise: 1e12, souls: 1e6 });
        return ui.directiveRewardLabel({ reward: { praise: 1234567890, souls: 3, charge: 20 } });
    }), '+1.2B Praise • +3 Souls • +20 Charge');
    assert.match(await desk.evaluate(() => {
        State.resources.praise = State.resourceCaps.praise;
        return ui.directiveRewardLabel({ reward: { praise: 500 } });
    }), /\(vault full, rerouted\)$/);
    step('milestones quote the upgrade price: Breach the Veil is not READY at 500 of 12,000 Souls; rewards read in display notation');
    await desk.context().close();

    assert.deepEqual(errors, []);
    step('no runtime errors');
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
