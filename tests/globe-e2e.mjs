#!/usr/bin/env node
/* The Divine Globe as a brass armillary: selection works by keyboard and by
   pointer at any displayed size, it repaints only when what it shows
   changes, and its numbers stay in the DOM.
   Run against a dev server: node tests/globe-e2e.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
let passed = 0; const errors = [];
const step = (name) => { passed++; console.log('  ok    ' + name); };
async function openGlobe(viewport) {
    const page = await (await browser.newContext({ viewport })).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(base + '/?testMode=1');
    await page.getByRole('button', { name: 'Perform Miracle', exact: true }).waitFor();
    await page.evaluate(() => {
        ui.dismissSystemModal(); media.setCinematics('off');
        State.dimensions.void.unlocked = true;
        State.unlockedApps.push('divineglobe');
        Object.assign(State.prophets, { total: 4, available: 1, assignments: { primordial: 2, void: 1 } });
        system.closeApp('console'); system.openApp('divineglobe'); ui.refreshAll();
    });
    return page;
}
// Click a medallion by its logical position (400×400), scaled to the displayed canvas.
async function clickLogical(page, x, y) {
    const box = await page.locator('#globe-canvas').boundingBox();
    await page.mouse.click(box.x + box.width * x / 400, box.y + box.height * y / 400);
}
try {
    const desk = await openGlobe({ width: 1440, height: 900 });
    const voidBtn = desk.locator('.globe-dim-btn[data-dim="void"]');
    await voidBtn.focus();
    await desk.keyboard.press('Enter');
    assert.equal(await desk.evaluate(() => ui.selectedGlobeDimension), 'void');
    assert.equal(await voidBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(await desk.locator('#globe-dim-name').innerText(), 'Void Dimension');
    assert.equal(await desk.locator('#globe-prophets-assigned').innerText(), '1');
    step('the Dimension buttons select by keyboard, and the numbers follow in the DOM');

    await clickLogical(desk, 200, 136);
    assert.equal(await desk.evaluate(() => ui.selectedGlobeDimension), 'primordial');
    step('a click on the Primordial medallion selects it');

    const repaints = await desk.evaluate(() => new Promise((resolve) => {
        const ctx = document.getElementById('globe-canvas').getContext('2d');
        let n = 0; const clear = ctx.clearRect.bind(ctx);
        ctx.clearRect = (...a) => { n++; return clear(...a); };
        setTimeout(() => resolve(n), 1200);
    }));
    assert.equal(repaints, 0, 'the Globe repainted with nothing to show');
    await desk.evaluate(() => { State.prophets.available -= 1; State.prophets.assignments.primordial += 1; ui.refreshAll(); });
    assert.deepEqual(await desk.evaluate(() => ui.globeState().dims[0]), [3, 0]);
    step('an idle Globe does not repaint, and what it draws follows a change in assignments');
    await desk.context().close();

    const phone = await openGlobe({ width: 390, height: 844 });
    const canvas = await phone.locator('#globe-canvas').boundingBox();
    assert.ok(canvas.width >= 300, 'on a phone the Globe stacks and gets the window width');
    await clickLogical(phone, 200, 264);
    assert.equal(await phone.evaluate(() => ui.selectedGlobeDimension), 'void');
    await phone.evaluate(() => { State.settings.textScale = 1.3; ui.applyDisplayPreferences(); });
    await clickLogical(phone, 200, 136);
    assert.equal(await phone.evaluate(() => ui.selectedGlobeDimension), 'primordial');
    step('on a phone, and at Text Size 130%, clicks are scaled to the medallion they point at');
    await phone.context().close();

    assert.deepEqual(errors, []);
    step('no runtime errors');
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
