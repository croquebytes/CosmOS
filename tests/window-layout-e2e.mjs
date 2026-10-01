#!/usr/bin/env node
/**
 * Window layout memory: an app reopens where the player left it.
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tests/window-layout-e2e.mjs
 *
 * Needs the dev server. Vite on this machine binds localhost (IPv6) only,
 * so 127.0.0.1 will refuse the connection.
 */

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let passed = 0;
let failed = 0;
const check = async (name, fn) => {
    try { await fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
};

const boot = async () => {
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
};
const bounds = (id) => page.evaluate((id) => {
    const r = document.getElementById(`win-${id}`).getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}, id);
const reopen = async (id) => {
    await page.evaluate((id) => { system.closeApp(id); system.openApp(id); }, id);
};

console.log('\nWindow layout memory (browser)\n');

try {
    await page.goto(`${baseUrl}/?testMode=1`);
    await page.evaluate(() => localStorage.clear());
    await boot();

    await check('a dragged window reopens where it was left', async () => {
        const before = await bounds('console');
        const bar = page.locator('#win-console .window-title-bar');
        const box = await bar.boundingBox();
        await page.mouse.move(box.x + 120, box.y + 8);
        await page.mouse.down();
        await page.mouse.move(box.x + 420, box.y + 160, { steps: 8 });
        await page.mouse.up();
        const moved = await bounds('console');
        assert.ok(Math.abs(moved.left - before.left) > 200, 'fixture: the drag did not move the window');
        await reopen('console');
        const again = await bounds('console');
        assert.deepEqual(again, moved, `reopened at ${JSON.stringify(again)}, left at ${JSON.stringify(moved)}`);
    });

    await check('a snapped window comes back snapped after a reload', async () => {
        await page.evaluate(() => system.snapWindow('console', 'right'));
        await page.evaluate(() => system.closeApp('console'));
        await boot();   // testMode reopens the console on load
        const mode = await page.evaluate(() => system.windowStates.console?.mode);
        assert.equal(mode, 'right');
        const b = await bounds('console');
        assert.ok(b.left >= 700, `snapped-right window sits at left=${b.left}`);
    });

    await check('restoring from a remembered snap returns to the remembered normal bounds', async () => {
        await page.evaluate(() => system.restoreWindow('console'));
        const b = await bounds('console');
        assert.ok(b.width < 1000, `restored window is ${b.width}px wide, not the remembered normal size`);
    });

    await check('garbage in storage falls back to a sane layout', async () => {
        await page.evaluate(() => localStorage.setItem('cosmos_window_layout', '{"console": {"left": "x"}, "taskmgr": 7'));
        await boot();   // malformed JSON
        await page.evaluate(() => localStorage.setItem('cosmos_window_layout', JSON.stringify({
            taskmgr: { left: 'x', top: null, width: -5, height: 'big', mode: 'sideways' } })));
        await page.evaluate(() => system.openApp('taskmgr'));
        const b = await bounds('taskmgr');
        assert.ok(b.width > 300 && b.height > 200, `fallback layout is ${JSON.stringify(b)}`);
    });

    await check('a remembered position off-screen is clamped back on', async () => {
        await page.evaluate(() => localStorage.setItem('cosmos_window_layout',
            JSON.stringify({ settings: { left: 5000, top: 4000, width: 600, height: 500, mode: 'normal' } })));
        await page.evaluate(() => { system.closeApp('settings'); system.openApp('settings'); });
        const b = await bounds('settings');
        assert.ok(b.left + b.width <= 1440 && b.top + b.height <= 900, `window opened at ${JSON.stringify(b)}`);
    });

    await check('phones ignore the desktop layout', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => { system.closeApp('console'); system.openApp('console'); });
        const b = await bounds('console');
        assert.ok(b.left <= 8 && b.width >= 370, `phone window is ${JSON.stringify(b)}`);
        await page.setViewportSize({ width: 1440, height: 900 });
    });

    await check('no console errors', async () => {
        assert.deepEqual(errors, []);
    });
} finally {
    await browser.close();
}

console.log(`\n${passed} passed${failed ? `, ${failed} failed` : ''}\n`);
process.exit(failed ? 1 : 0);
