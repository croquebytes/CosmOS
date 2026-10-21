#!/usr/bin/env node
/* Display dials: CRT intensity and Text Size are separate from Performance
   Mode, survive a reload, never cause sideways scrolling, and touch screens
   get window-control targets larger than the glyphs.
   Run against a dev server: node tests/display-settings-e2e.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
let passed = 0; const errors = [];
const step = (name) => { passed++; console.log('  ok    ' + name); };
async function boot(page) {
    await page.goto(base + '/?testMode=1');
    await page.getByRole('button', { name: 'Perform Miracle', exact: true }).waitFor();
    await page.evaluate(() => { ui.dismissSystemModal(); media.setCinematics('off'); });
}
async function open(contextOptions) {
    const page = await (await browser.newContext(contextOptions)).newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    await boot(page);
    return page;
}
const overflowX = (page) => page.evaluate(() => {
    const c = document.getElementById('content-console');
    return c.scrollWidth - c.clientWidth;
});
try {
    const desk = await open({ viewport: { width: 1440, height: 900 } });
    assert.equal(await desk.evaluate(() => getComputedStyle(document.querySelector('.crt-overlay')).display), 'block');
    await desk.evaluate(() => system.openApp('settings'));
    assert.equal(await desk.locator('#crt-intensity').inputValue(), 'full');
    assert.equal(await desk.locator('#text-scale').inputValue(), '1');
    await desk.selectOption('#crt-intensity', 'low');
    await desk.selectOption('#text-scale', '1.3');
    await desk.evaluate(() => State.save());
    await desk.reload();
    await desk.getByRole('button', { name: 'Perform Miracle', exact: true }).waitFor();
    await desk.evaluate(() => { ui.dismissSystemModal(); system.openApp('console'); });
    const applied = await desk.evaluate(() => ({
        crt: getComputedStyle(document.querySelector('.crt-overlay')).opacity,
        zoom: getComputedStyle(document.querySelector('#content-console > *')).zoom,
        frame: getComputedStyle(document.querySelector('#win-console .window-title-bar')).zoom,
    }));
    assert.deepEqual(applied, { crt: '0.4', zoom: '1.3', frame: '1' });
    step('CRT Low and Text Size 130% survive a reload; window contents scale, the frame does not');

    assert.equal(await overflowX(desk), 0);
    await desk.evaluate(() => { document.getElementById('content-console').scrollTop = 600; });
    await desk.waitForTimeout(100);
    const strip = await desk.locator('#engine-command').boundingBox();
    const scroller = await desk.locator('#content-console').boundingBox();
    assert.ok(Math.abs(strip.y - scroller.y) <= 1 && Math.abs(strip.x - scroller.x) <= 1);
    step('at 130% the Engine never scrolls sideways and its command strip stays pinned flush');

    await desk.evaluate(() => system.openApp('settings'));
    await desk.selectOption('#crt-intensity', 'off');
    assert.equal(await desk.evaluate(() => getComputedStyle(document.querySelector('.crt-overlay')).display), 'none');
    await desk.evaluate(() => {
        State.settings.crtIntensity = null; State.settings.performanceMode = true; State.settings.textScale = 1; State.save();
    });
    await desk.reload();
    await desk.getByRole('button', { name: 'Perform Miracle', exact: true }).waitFor();
    assert.deepEqual(await desk.evaluate(() => ({
        perf: document.body.classList.contains('performance-mode'),
        crt: getComputedStyle(document.querySelector('.crt-overlay')).display,
    })), { perf: true, crt: 'none' });
    await desk.evaluate(() => { State.settings.crtIntensity = 'full'; ui.applyDisplayPreferences(); });
    assert.equal(await desk.evaluate(() => getComputedStyle(document.querySelector('.crt-overlay')).display), 'block');
    step('Off hides the CRT; a save that used Performance Mode keeps a clean screen until a CRT level is chosen, and its class now applies at boot');
    await desk.context().close();

    const phone = await open({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const close = phone.locator('#win-console .window-controls button[data-action="close"]');
    const glyph = await close.boundingBox();
    const hit = (dx, dy) => phone.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y)?.closest('.window-controls button')?.dataset.action || null,
    { x: glyph.x + dx, y: glyph.y + dy });
    assert.equal(await hit(glyph.width / 2, -4), 'close');
    assert.equal(await hit(-5, glyph.height / 2), 'close');
    assert.notEqual(await hit(-7, glyph.height / 2), 'close', 'targets do not reach into the neighbour');
    step('on a touch screen the close control takes taps around its glyph without overlapping its neighbour');

    await phone.evaluate(() => { State.settings.textScale = 1.3; ui.applyDisplayPreferences(); });
    await phone.waitForTimeout(100);
    assert.equal(await overflowX(phone), 0);
    for (const sel of ['#val-praise', '#engine-directive', '.engine-acts .divine-btn']) {
        const b = await phone.locator(sel).boundingBox();
        assert.ok(b.y + b.height <= 804, `${sel} still in the first view at 130%`);
    }
    step('at 390×844 and 130% nothing scrolls sideways and the command strip is still in the first view');
    await phone.context().close();

    assert.deepEqual(errors, []);
    step('no runtime errors');
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
