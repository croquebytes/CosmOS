#!/usr/bin/env node
/* Reclamation Protocol as the player meets it: the install offer in the
   Recycle Bin after a reboot, a prayer left for three seconds drawn into
   the Bin's icon, and one Restore for everything stored.
   Run against a dev server: node tests/prayer-bin-e2e.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
let passed = 0; const errors = [];
const step = (name) => { passed++; console.log('  ok    ' + name); };
try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/?testMode=1');
    await page.getByRole('button', { name: 'Perform Miracle', exact: true }).waitFor();
    await page.evaluate(() => { ui.dismissSystemModal(); media.setCinematics('off'); system.closeApp('console'); system.openApp('recyclebin'); ui.refreshAll(); });
    assert.equal(await page.locator('#prayer-bin').isHidden(), true, 'offered before the first reboot');
    await page.evaluate(() => { State.prestigeLevel = 1; State.totalDivinityPoints = 8; ui.refreshAll(); });
    assert.match(await page.locator('#prayer-bin').innerText(), /Reclamation Protocol[\s\S]*3 seconds[\s\S]*Install · 5 DP/);
    await page.getByRole('button', { name: /^Install · 5 DP/ }).click();
    assert.equal(await page.evaluate(() => State.prayerBin.installed), true);
    assert.equal(await page.evaluate(() => game.getAvailableDivinityPoints()), 3);
    step('after a reboot the Bin offers Reclamation, priced in Divinity, and installs it');

    await page.evaluate(() => {
        system.closeApp('recyclebin');
        State.divineEvent = null;
        for (let n = 0; n < 500 && !State.divineEvent; n++) game.spawnDivineEvent();
    });
    const life = await page.evaluate(() => State.divineEvent.expiresAt - Date.now());
    assert.ok(life <= 3000 && life > 2000, `a prayer waits about 3s (got ${life}ms)`);
    await page.waitForFunction(() => State.prayerBin.entries.length === 1, null, { timeout: 6000 });
    assert.equal(await page.locator('#icon-recyclebin .icon-badge').innerText(), '1');
    assert.equal(await page.locator('#icon-recyclebin').getAttribute('aria-label'), 'Recycle Bin: 1 reclaimed prayer to restore');
    assert.equal(await page.evaluate(() => State.loopSystems.divineEventChain), 0, 'a reclaimed prayer touched the chain');
    step('an unanswered prayer is drawn into the Bin after three seconds and its icon counts it');

    await page.evaluate(() => { State.prayerBin.entries.push(30, 30, 30); system.openApp('recyclebin'); ui.refreshAll(); });
    assert.match(await page.locator('#prayer-bin').innerText(), /4 \/ 12[\s\S]*Restoring now pays \+\d+/);
    const before = await page.evaluate(() => State.resources.praise);
    await page.getByRole('button', { name: 'Restore prayers' }).click();
    assert.ok(await page.evaluate(() => State.resources.praise) > before);
    assert.equal(await page.evaluate(() => State.prayerBin.entries.length), 0);
    assert.equal(await page.locator('#icon-recyclebin .icon-badge').isHidden(), true);
    assert.equal(await page.getByRole('button', { name: 'Restore prayers' }).isDisabled(), true);
    step('one Restore pays everything stored, quoted first, and clears the badge');

    assert.deepEqual(errors, []);
    step('no runtime errors');
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
