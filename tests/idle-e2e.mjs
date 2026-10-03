#!/usr/bin/env node
/**
 * An idle tab stays cheap, and still delivers.
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tests/idle-e2e.mjs
 *
 * Players leave CosmOS open for hours. This is the smoke check on what that
 * costs (tools/idle-profile.mjs is the full measurement; docs/PERFORMANCE.md
 * has the numbers):
 *
 *   - with every window shut, the page wakes for one shared 1 Hz clock
 *     (js/heartbeat.js) and a panel-rate loop — not one interval per app and
 *     sixty frames a second;
 *   - a hidden tab does no app polling at all;
 *   - and none of that cost anything: mail that came due while the tab was
 *     hidden is held, then lands as one backlog the moment it is seen;
 *     incidents still go on hold when nobody is there; the Engine still runs
 *     at frame rate when its core is on screen.
 *
 * Timer counts come from tests/idle-probe.mjs, which also stands in for a
 * background tab: headless Chromium never hides one.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PROBE, midGame, closeEverything } from './idle-probe.mjs';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];

/* Wakeups over `ms`, per second, by kind and by source. */
async function sample(page, ms) {
    await page.evaluate(() => window.__idleReset());
    await page.waitForTimeout(ms);
    const p = await page.evaluate(() => window.__idle);
    const secs = ms / 1000;
    return {
        interval: p.interval / secs, timeout: p.timeout / secs, raf: p.raf / secs,
        bySrc: p.bySrc, hiddenBySrc: p.hiddenBySrc,
    };
}

/* Sources that are the apps polling — not the autosave, not the harness. */
const APP_FILES = /^(interval|timeout) (heartbeat|media|footage|choir|mail|mailview|etherscape|solitaire|mediaplayer|ui|system|breakdown|incidents)\.js:/;

try {
    console.log('\nIdle cost (browser)\n');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(PROBE);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await midGame(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.evaluate(() => { game.incidentsEnabled = false; });
    await closeEverything(page);
    // The reload files a burst of achievement toasts; let the boot settle.
    await page.waitForTimeout(4000);
    await closeEverything(page);

    /* ── 1. Every window shut ─────────────────────────────────────────── */
    const shut = await sample(page, 4000);
    const intervalSources = Object.keys(shut.bySrc).filter((k) => k.startsWith('interval ') && APP_FILES.test(k));
    assert.deepEqual(intervalSources.map((k) => k.replace(/:\d+$/, '')), ['interval heartbeat.js'],
        `one shared clock, not one per app: ${intervalSources.join(', ')}`);
    assert.ok(shut.interval <= 1.5, `interval wakeups ${shut.interval.toFixed(2)}/s with every window shut (was ~7/s)`);
    assert.ok(shut.raf <= 15, `${shut.raf.toFixed(1)} frames/s with no canvas on screen (was ~60/s)`);
    assert.ok(shut.raf >= 3, `${shut.raf.toFixed(1)} frames/s: the loop still runs`);
    step(`all closed: ${shut.interval.toFixed(2)} interval and ${shut.raf.toFixed(1)} frame wakeups/s`);

    /* The loop still ticks at the slower cadence. */
    const ticked = await page.evaluate(async () => {
        const before = game.lastWallClockTime;
        await new Promise((r) => setTimeout(r, 1200));
        return game.lastWallClockTime - before;
    });
    assert.ok(ticked >= 1000, `the loop advanced ${ticked} ms of wall clock in 1.2 s`);
    step('the game loop keeps ticking with every window shut');

    /* The desktop's operator panel is an aria-live region: rewriting it
       every panel tick re-laid it out ten times a second, and re-announced
       it. Unchanged, it is now left alone. */
    const churn = await page.evaluate(async () => {
        let n = 0;
        const mo = new MutationObserver((list) => { n += list.length; });
        mo.observe(document.getElementById('operator-status'), { subtree: true, childList: true, characterData: true, attributes: true });
        await new Promise((r) => setTimeout(r, 2000));
        mo.disconnect();
        return n;
    });
    assert.equal(churn, 0, `the operator panel was rewritten ${churn} times in 2s with nothing changing`);
    step('the operator panel (aria-live) is not rewritten while nothing changes');

    /* ── 2. The Engine's core on screen: frame rate again ─────────────── */
    await page.evaluate(() => system.openApp('console'));
    const engine = await sample(page, 2000);
    assert.ok(engine.raf > shut.raf * 1.5, `the core animates at frame rate (${engine.raf.toFixed(1)} vs ${shut.raf.toFixed(1)} frames/s)`);
    await closeEverything(page);
    step(`the core well brings frame rate back (${engine.raf.toFixed(1)}/s)`);

    /* ── 3. Hidden: no app polls at all ───────────────────────────────── */
    // Open the apps that keep their own window refresh, too.
    await page.evaluate(() => { for (const id of ['choir', 'etherscape', 'solitaire', 'mail', 'mediaplayer']) system.openApp(id); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__setHidden(true));
    await page.waitForTimeout(300);   // a frame already requested still lands
    const hidden = await sample(page, 3500);
    // Repeating timers only: a one-shot (a page's load delay) is not polling.
    const polls = Object.entries(hidden.hiddenBySrc).filter(([k]) => k.startsWith('interval ') && APP_FILES.test(k));
    assert.deepEqual(polls, [], `a hidden tab polled: ${JSON.stringify(polls)}`);
    // At most the one frame already in flight when the tab went (headless
    // frames are slow with five windows up); after that the loop is parked.
    assert.ok(Math.round(hidden.raf * 3.5) <= 1, `frames in a hidden tab: ${JSON.stringify(hidden.bySrc)}`);
    assert.equal(await page.evaluate(() => Heartbeat.running()), false, 'the shared clock rests');
    await page.evaluate(() => window.__setHidden(false));
    assert.equal(await page.evaluate(() => Heartbeat.running()), true, 'and starts again on return');
    await closeEverything(page);
    step('a hidden tab does no app polling, and the clock resumes on return');

    /* ── 4. Mail held while hidden, delivered as a backlog on return ─── */
    // A fresh profile: the mid-game save above would load here otherwise.
    const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await fresh.addInitScript(PROBE);
    const p2 = await fresh.newPage();
    p2.on('pageerror', (e) => errors.push(String(e)));
    await p2.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await p2.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await p2.evaluate(() => {
        localStorage.clear();
        ui.dismissSystemModal?.();
        State.adversary.contacted = true;
        State.adversary.sceneCompleted = true;
        game.incidentsEnabled = false;
        // A reel is a dialog, and mail waits behind dialogs: keep them out of this.
        media.setCinematics('off');
    });
    for (let i = 0; i < 10; i++) await p2.getByRole('button', { name: 'Perform Miracle' }).click();
    await p2.getByRole('button', { name: 'Claim Reward' }).click();
    await p2.evaluate(() => {
        State.resources.praise = 1e6; game.buyAutomator('seraph');
        State.resources.offerings = 1e6; game.buyAutomator('cherub');
        State.resources.praise = 1e6; game.purchaseUpgrade('offering_unlock');
        game.notePresence(Date.now());
        for (let i = 0; i < 4; i++) Mail.tick({ seconds: 600 });
        system.closeApp('console');
    });
    const delivered = await p2.evaluate(() => State.mail.log.length);
    assert.ok(delivered >= 1, 'fixture check: mail arrived while present');

    // Production accrues at the panel-rate loop exactly as it did per frame.
    const accrual = await p2.evaluate(async () => {
        const rate = game.getProductionRates().praiseGross;
        const t0 = performance.now();
        const before = State.totalPraiseEarned;
        await new Promise((r) => setTimeout(r, 2000));
        return { rate, earned: State.totalPraiseEarned - before, secs: (performance.now() - t0) / 1000 };
    });
    assert.ok(accrual.rate > 0, 'fixture check: something produces');
    const expected = accrual.rate * accrual.secs;
    assert.ok(Math.abs(accrual.earned - expected) <= Math.max(accrual.rate * 0.35, 1e-9),
        `earned ${accrual.earned.toFixed(2)} in ${accrual.secs.toFixed(2)}s at ${accrual.rate}/s (expected ~${expected.toFixed(2)})`);
    step(`production accrues at the full rate with every window shut (${accrual.earned.toFixed(1)} in ${accrual.secs.toFixed(1)}s at ${accrual.rate.toFixed(2)}/s)`);

    await p2.evaluate(() => {
        // The Engine (and its log) is shut; keep what the log is told.
        const log = ui.log.bind(ui);
        window.__logged = [];
        ui.log = (msg) => { window.__logged.push(String(msg)); log(msg); };
        window.__setHidden(true);
        game.notePresence(Date.now());   // the player is still "there" — only the tab is not
        State.resources.souls = 1e6;
        game.purchaseUpgrade('void_unlock'); // prayer-02 and prev-02 come due
    });
    await p2.waitForTimeout(2300);
    assert.equal(await p2.evaluate(() => State.mail.log.some((r) => r.id === 'prayer-02')), false, 'nothing arrives in a hidden tab');
    const t0 = Date.now();
    await p2.evaluate(() => { game.notePresence(Date.now()); window.__setHidden(false); });
    await p2.waitForFunction(() => State.mail.log.some((r) => r.id === 'prayer-02'), null, { timeout: 4000 });
    const lag = Date.now() - t0;
    assert.match((await p2.evaluate(() => window.__logged)).join('\n'), /messages arrived while you were away/);
    step(`mail that came due while hidden lands as one backlog on return (${lag} ms)`);

    /* ── 5. Held tickets: the slower loop still notices absence ───────── */
    await p2.evaluate(() => {
        game.incidentsEnabled = true;
        game.notePresence(Date.now());
        Incidents.file('choir_desync', { severity: 2, falseAlarm: false, sector: '3A' });
    });
    await p2.waitForTimeout(400);
    assert.equal(await p2.evaluate(() => Incidents.summary().onHold), false, 'present: the ticket runs');
    await p2.evaluate(() => { game.lastInputAt = 0; });
    await p2.waitForFunction(() => Incidents.summary().onHold === true, null, { timeout: 2000 });
    await p2.evaluate(() => game.notePresence(Date.now()));
    await p2.waitForFunction(() => Incidents.summary().onHold === false, null, { timeout: 2000 });
    step('tickets hold while nobody is there and resume on return, every window shut');

    /* ── 6. Audio running: the ambient bed's own timer ────────────────── */
    /* The AudioContext is only made by a gesture, so every step above ran without one and
       could not see js/audio.js's 500 ms bed and music timer (and APP_FILES leaves audio
       out). Visible, it is a legitimate 2 wakeups/s on top of the shared clock; hidden, it
       must rest — the context is suspended then (docs/PERFORMANCE.md). */
    await closeEverything(page);
    await page.mouse.click(720, 450);
    await page.waitForFunction(() => audio.state() !== 'none', null, { timeout: 4000 });
    await page.waitForTimeout(500);
    const audible = await sample(page, 3000);
    const bed = Object.entries(audible.bySrc).filter(([k]) => /^interval audio\.js:/.test(k));
    assert.equal(bed.length, 1, `one ambient timer: ${JSON.stringify(bed)}`);
    const bedRate = bed[0][1] / 3;
    assert.ok(bedRate >= 1.5 && bedRate <= 2.5, `the ambient timer ran ${bedRate.toFixed(2)}/s, expected about 2`);
    await page.evaluate(() => window.__setHidden(true));
    await page.waitForTimeout(300);
    const quiet = await sample(page, 3500);
    // Repeating timers only, as in step 3: the one-shot that frees a finished sound's voice (my own
    // click's UI tick scheduled one) is not polling.
    const strays = Object.entries(quiet.hiddenBySrc).filter(([k]) => /^interval audio\.js:/.test(k));
    assert.deepEqual(strays, [], `audio.js polled in a hidden tab: ${JSON.stringify(strays)}`);
    await page.evaluate(() => window.__setHidden(false));
    await page.waitForTimeout(1000);
    const back = await sample(page, 2000);
    assert.ok(Object.keys(back.bySrc).some((k) => /^interval audio\.js:/.test(k)), 'the ambient timer wakes again on return');
    step(`audio running: its timer wakes ${bedRate.toFixed(1)}/s visible, never hidden, and again on return`);

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    step('no console errors');
    console.log(`\n${passed} passed\n`);
} catch (err) {
    console.error(err);
    process.exitCode = 1;
} finally {
    await browser.close();
}
