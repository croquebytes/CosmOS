import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const runtimeErrors = [];

page.on('pageerror', (error) => runtimeErrors.push(String(error)));
page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
});

try {
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();

    for (let index = 0; index < 10; index += 1) {
        await page.getByRole('button', { name: 'Perform Miracle' }).click();
    }

    let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.directive.complete, true, 'first directive should complete after 10 miracles');
    assert.equal(state.resources.praise, 10, 'manual miracles should grant 10 Praise');

    await page.getByRole('button', { name: 'Claim Reward' }).click();
    await page.getByRole('button', { name: /Seraphic Automaton/ }).click();
    await page.waitForTimeout(1100);

    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.automation.seraphs, 1, 'first Seraph should be commissioned');
    assert.ok(state.productionPerSecond.praise >= 1, 'Seraph should produce Praise');

    await page.evaluate(() => {
        State.runtime.lastUpdateTime = Date.now() - 120_000;
        localStorage.setItem('cosmos_save', JSON.stringify(State));
    });

    // Open a second page in the same browser context so the first page's
    // beforeunload save does not overwrite the simulated old timestamp.
    const offlinePage = await page.context().newPage();
    offlinePage.on('pageerror', (error) => runtimeErrors.push(String(error)));
    offlinePage.on('console', (message) => {
        if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await offlinePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await offlinePage.getByRole('heading', { name: 'The universe kept running.' }).waitFor({ timeout: 5000 });
    const reportText = await offlinePage.locator('.offline-gains').innerText();
    assert.match(reportText, /praise/i, 'offline report should include Praise');

    await offlinePage.screenshot({ path: '/tmp/cosmos-e2e-smoke.png', fullPage: true });
    assert.deepEqual(runtimeErrors, [], `runtime emitted errors: ${runtimeErrors.join('\n')}`);

    console.log('CosmOS e2e smoke passed: onboarding, directive, automation, offline progress.');
} finally {
    await context.close();
    await browser.close();
}
