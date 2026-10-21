#!/usr/bin/env node
/* Prophet dispatch from a congregation, as the player sees it: the ticket
   button names the source and its growth cost, the clock says where the
   Prophet returns, and the Globe shows who is on site.
   Run against a dev server: node tests/prophet-dispatch-e2e.mjs */
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
    await page.evaluate(() => {
        ui.dismissSystemModal(); media.setCinematics('off');
        State.unlockedApps.push('divineglobe', 'taskmgr');
        Object.assign(State.prophets, { total: 2, available: 0, assignments: { primordial: 2 } });
        State.automatons.seraphCount = 10;
        Incidents.file('choir_desync', { severity: 3, falseAlarm: false });
        system.closeApp('console'); system.openApp('taskmgr'); ui.refreshAll();
    });
    const dispatch = page.locator('.incident-btn', { hasText: 'Dispatch a Prophet' });
    assert.equal(await dispatch.innerText(), 'Dispatch a Prophet from Primordial · growth −50% there for 2 min');
    step('with every Prophet assigned, the ticket offers one from the largest congregation and names the cost');

    await dispatch.click();
    assert.match(await page.locator('[data-role="clock"]').first().innerText(), /then back to Primordial$/);
    assert.deepEqual(await page.evaluate(() => ({ ...State.prophets.assignments })), { primordial: 1 });
    await page.evaluate(() => { system.openApp('divineglobe'); ui.refreshAll(); });
    const onSite = page.locator('#globe-prophets-onsite');
    assert.ok(await onSite.isVisible());
    assert.match(await onSite.innerText(), /^On site: 1 at a ticket in Task Manager/);
    step('after dispatch the ticket says where the Prophet returns, and the Globe shows it on site');

    await page.evaluate(() => { Incidents.resolve(Incidents.state().open[0].id, 'prophet'); ui.refreshAll(); });
    assert.deepEqual(await page.evaluate(() => ({ ...State.prophets.assignments })), { primordial: 2 });
    assert.equal(await onSite.isHidden(), true);
    step('when the ticket closes the Prophet rejoins its congregation and the Globe line clears');

    assert.deepEqual(errors, []);
    step('no runtime errors');
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
