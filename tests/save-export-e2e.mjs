#!/usr/bin/env node
/**
 * Export Save and Import Save, through Divine Settings.
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tests/save-export-e2e.mjs
 *
 * tests/save-export.mjs holds the encoding with no DOM. This is the
 * player's path: the buttons, the text boxes, and the status line that now
 * says what happened (ui.log writes only into the Engine's log, so a failure
 * reported there was invisible from Settings).
 *
 *   1. A run at a cascade tier — its labels hold an em dash, which the old
 *      btoa could not encode — exports: the box fills, the status says so.
 *   2. Pasting that text into another browser takes the run, through the
 *      real reload, with the em dash intact in the modifier ledger.
 *   3. A bad paste is refused where the player is looking, changes nothing,
 *      and does not reload.
 *   4. The status line is text on the vellum like any other: AA, both tones.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { measureContrast } from './contrast-probe.mjs';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };
const errors = [];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function newPage() {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.evaluate(() => ui.dismissSystemModal?.());
    return page;
}

const openSettings = async (page) => {
    await page.evaluate(() => { system.closeApp('console'); system.openApp('settings'); });
    await page.locator('#export-save-text').waitFor();
};
const save = (page, name) => page.getByRole('button', { name });
const statusOf = (page) => page.evaluate(() => {
    const el = document.getElementById('save-status');
    return { text: el.textContent, tone: el.dataset.tone || '' };
});

try {
    console.log('\nExport / Import Save (browser)\n');

    // 1. Export from a run whose save carries an em dash.
    const source = await newPage();
    await source.evaluate(() => {
        State.reality.instability = 1.5;
        State.reality.alertedTier = 2;
        game.syncCascade(Date.now());
        ui.dismissSystemModal?.();
        State.save();
    });
    const dash = await source.evaluate(() => /[^\x00-\xff]/.test(JSON.stringify(State)));
    assert.equal(dash, true, 'fixture check: the save really carries a character above U+00FF');
    assert.equal(await source.evaluate(() => { try { btoa(JSON.stringify(State)); return 'encoded'; } catch (e) { return 'threw'; } }), 'threw',
        'fixture check: this is the save the old Export could not encode');
    await openSettings(source);
    assert.equal(await source.locator('#save-status').getAttribute('role'), 'status', 'the status line is announced');
    await save(source, 'Export Save').click();
    await source.waitForFunction(() => /Save exported/.test(document.getElementById('save-status').textContent), null, { timeout: 5000 });
    const exported = await source.locator('#export-save-text').inputValue();
    assert.ok(exported.length > 200, `the box is filled (${exported.length} characters)`);
    assert.equal((await statusOf(source)).tone, 'ok');
    const decoded = await source.evaluate((t) => game.decodeSaveText(t), exported);
    const parsed = JSON.parse(decoded);
    assert.match(decoded, /[^\x00-\xff]/, 'the em dash is in the exported save');
    assert.ok(Math.abs(parsed.reality.instability - 1.5) < 0.05, 'and the run is the one on screen');
    step('Export Save fills the box and says so, for a run whose labels hold an em dash');

    await source.locator('#save-status').scrollIntoViewIfNeeded();   // the probe skips what a scrolled window clips
    const ok = await measureContrast(source, '#win-settings #save-status');
    assert.ok(ok.length >= 1, 'the status line was measured');
    assert.deepEqual(ok.filter((r) => r.ratio < r.need).map((r) => `${r.sel} "${r.text}" ${r.ratio}`), [], 'status (ok) below AA');
    step('the status line passes AA');

    // 2. Another browser takes the run.
    const target = await newPage();
    await openSettings(target);
    await target.locator('#import-save-text').fill(exported);
    target.once('dialog', (d) => d.accept());
    await Promise.all([target.waitForEvent('load', { timeout: 15000 }), save(target, 'Import Save').click()]);
    await target.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    const taken = await target.evaluate(() => ({
        instability: State.reality.instability,
        dash: State.modifierLog.records.some((r) => /—/.test(r.label)),
        suppressed: State.suppressUnloadSave,
    }));
    assert.ok(Math.abs(taken.instability - 1.5) < 0.05, `the imported run (instability ${taken.instability})`);
    assert.equal(taken.dash, true, 'the em dash survived the whole trip');
    assert.equal(taken.suppressed, false, 'and the flag did not leak into the new page');
    step('pasting it into another browser takes the run, through the real reload, em dash intact');

    // 3. A bad paste is refused where the player is looking.
    const bad = await newPage();
    await openSettings(bad);
    await bad.evaluate(() => { window.__marker = 1; });
    for (const paste of ['this is not a save', btoa('{"nothing":1}')]) {
        await bad.locator('#import-save-text').fill(paste);
        bad.once('dialog', (d) => d.accept());
        await save(bad, 'Import Save').click();
        await bad.waitForFunction(() => /Invalid or corrupted/.test(document.getElementById('save-status').textContent), null, { timeout: 4000 });
        const s = await statusOf(bad);
        assert.equal(s.tone, 'error');
        assert.equal(await bad.evaluate(() => window.__marker), 1, 'the page did not reload');
        assert.equal(await bad.evaluate(() => State.suppressUnloadSave), false, 'the unload save still stands');
        // The live game autosaves on its own, so the bytes may move; the pasted payload must never land.
        const now = await bad.evaluate(() => localStorage.getItem('cosmos_save'));
        assert.ok(JSON.parse(now).resources, 'the stored run is still a real save');
        assert.ok(!now.includes('"nothing"'), 'and the pasted payload was not written');
        await bad.evaluate(() => { document.getElementById('save-status').textContent = ''; });
    }
    step('a bad paste is refused in the panel, reloads nothing, and writes nothing');

    await bad.locator('#import-save-text').fill('');
    await save(bad, 'Import Save').click();
    await bad.waitForFunction(() => /paste a save string/.test(document.getElementById('save-status').textContent), null, { timeout: 4000 });
    assert.equal((await statusOf(bad)).tone, 'error');
    await bad.locator('#save-status').scrollIntoViewIfNeeded();
    const err = await measureContrast(bad, '#win-settings #save-status');
    assert.ok(err.length >= 1, 'the error line was measured');
    assert.deepEqual(err.filter((r) => r.ratio < r.need).map((r) => `${r.sel} "${r.text}" ${r.ratio}`), [], 'status (error) below AA');
    step('an empty box says so, and the error line passes AA too');

    assert.deepEqual(errors, [], `page errors:\n${errors.join('\n')}`);
    step('no page errors');

    console.log(`\nExport / Import Save (browser): ${passed} checks passed.`);
} finally {
    await browser.close();
}
