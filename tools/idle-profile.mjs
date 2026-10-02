#!/usr/bin/env node
/**
 * What an idle CosmOS tab costs.
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tools/idle-profile.mjs [seconds] [out.json]
 *
 * Four states, each sampled for `seconds` (default 60) with nobody at the
 * keyboard: a fresh desktop, a mid-game save with every app unlocked but
 * closed, the same save with every app open, and that save in a hidden tab.
 * Per second: main-thread busy time (CDP Performance.getMetrics TaskDuration),
 * script time, timer and animation-frame callbacks fired (tests/idle-probe.mjs),
 * and layouts / style recalculations. The top timer sources are listed so a
 * regression names its file and line. Results feed docs/PERFORMANCE.md.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { PROBE, midGame, closeEverything, openEverything } from '../tests/idle-probe.mjs';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const SECONDS = Number(process.argv[2]) || 60;
const OUT = process.argv[3] || null;

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(PROBE);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });

const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

async function sample(label) {
    await page.evaluate(() => window.__idleReset());
    const a = await metrics();
    const t0 = Date.now();
    await page.waitForTimeout(SECONDS * 1000);
    const b = await metrics();
    const secs = (Date.now() - t0) / 1000;
    const probe = await page.evaluate(() => window.__idle);
    const per = (k) => (b[k] - a[k]) / secs;
    const top = Object.entries(probe.bySrc).sort((x, y) => y[1] - x[1]).slice(0, 12)
        .map(([k, n]) => `${(n / secs).toFixed(2).padStart(7)}/s  ${k}`);
    const row = {
        state: label,
        seconds: Math.round(secs),
        busyMsPerSec: +(per('TaskDuration') * 1000).toFixed(1),
        scriptMsPerSec: +(per('ScriptDuration') * 1000).toFixed(1),
        intervalsPerSec: +(probe.interval / secs).toFixed(2),
        timeoutsPerSec: +(probe.timeout / secs).toFixed(2),
        rafPerSec: +(probe.raf / secs).toFixed(1),
        layoutsPerSec: +per('LayoutCount').toFixed(1),
        styleRecalcsPerSec: +per('RecalcStyleCount').toFixed(1),
        hiddenAppPolls: Object.entries(probe.hiddenBySrc).filter(([k]) => k.startsWith('interval')).reduce((s, [, n]) => s + n, 0),
        top,
    };
    console.log(`\n── ${label} (${row.seconds}s)`);
    console.log(`   busy ${row.busyMsPerSec} ms/s (script ${row.scriptMsPerSec}) · intervals ${row.intervalsPerSec}/s · timeouts ${row.timeoutsPerSec}/s · rAF ${row.rafPerSec}/s · layout ${row.layoutsPerSec}/s · style ${row.styleRecalcsPerSec}/s`);
    for (const t of top) console.log('   ' + t);
    return row;
}

const settle = () => page.waitForTimeout(3000);
const rows = [];

// 1. A fresh desktop.
await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { localStorage.clear(); State.suppressUnloadSave = true; });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
await closeEverything(page);
await settle();
rows.push(await sample('fresh desktop'));

// 2. A mid-game save, every app unlocked, all closed.
await page.evaluate(() => { State.suppressUnloadSave = false; });
await midGame(page);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
await closeEverything(page);
await settle();
await closeEverything(page);
rows.push(await sample('mid-game, apps closed'));

// 3. The same save, every app open.
await openEverything(page);
await settle();
rows.push(await sample('mid-game, every app open'));

// 4. The same save in a background tab.
await page.evaluate(() => window.__setHidden(true));
await settle();
rows.push(await sample('mid-game, hidden tab'));
await page.evaluate(() => window.__setHidden(false));

await browser.close();
if (OUT) writeFileSync(OUT, JSON.stringify(rows, null, 2));
