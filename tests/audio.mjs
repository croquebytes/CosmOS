/* Audio check — what a browser can verify about sound without ears.

   1. Clicking through the game produces no console errors, and no autoplay
      warning: the AudioContext must not exist before the first gesture.
   2. The context reaches 'running' after a gesture, suspends while the tab
      is hidden and resumes on return.
   3. Settings persist across a reload; mute lands the master gain on zero.
   4. A 15-clicks-per-second Miracle burst never exceeds its voice limit.
   5. Every cue rendered offline through the real graph at default settings
      has a sane level: never clipping, never silent, ambient well below SFX.

   Needs a running server:  COSMOS_TEST_URL=http://127.0.0.1:5192 npm run test:audio */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/audio';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error}`));
page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') problems.push(`console.error: ${text}`);
    if (/AudioContext/i.test(text) && message.type() === 'warning') problems.push(`autoplay warning: ${text}`);
});

const debug = () => page.evaluate(() => audio.debug());
async function waitFor(fn, label, timeout = 3000) {
    const start = Date.now();
    for (;;) {
        if (await page.evaluate(fn)) return;
        if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
        await page.waitForTimeout(50);
    }
}

let passed = 0;
async function check(name, fn) {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
}

try {
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();

    await check('no AudioContext before the first gesture', async () => {
        const before = await page.evaluate(() => ({
            state: audio.state(),
            policy: navigator.getAutoplayPolicy ? navigator.getAutoplayPolicy('audiocontext') : 'unsupported',
        }));
        if (before.policy !== 'allowed') assert.equal(before.state, 'none');
    });

    await check('a gesture starts the context and the ambient bed', async () => {
        for (let i = 0; i < 12; i += 1) await page.getByRole('button', { name: 'Perform Miracle' }).click();
        await waitFor(() => audio.state() === 'running', "state 'running'");
        const d = await debug();
        assert.equal(d.state, 'running');
        assert.equal(d.ambientBed, true, 'ambient bed should be playing');
        assert.ok(Math.abs(d.master - 0.7) < 1e-3, `master at default 0.7, got ${d.master}`);
    });

    await check('clicking through the desktop plays without errors', async () => {
        await page.click('#start-button');
        await page.waitForTimeout(80);
        await page.click('#start-button');
        await page.evaluate(() => system.openApp('taskmgr'));
        await page.click('#win-taskmgr [data-action="maximize"]');
        await page.waitForTimeout(100);
        await page.click('#win-taskmgr [data-action="maximize"]');
        await page.click('#win-taskmgr .window-controls button:last-child');
        await page.getByRole('button', { name: 'Claim Reward' }).click().catch(() => {});
        await page.getByRole('button', { name: /Seraphic Automaton/ }).click().catch(() => {});
        // Every cue, through the public entry point, with the options its
        // hook passes. Let the clicks above ring out first, so neither a
        // repeat-gap nor the polyphony ceiling can drop one.
        await page.waitForTimeout(1500);
        const results = await page.evaluate(async () => {
            const calls = [
                ['click'], ['windowOpen'], ['windowClose'], ['windowMode', { mode: 'maximized' }], ['startMenu'],
                ['miracle', { streak: 3 }], ['miracle', { void: true }], ['purchase'], ['error'], ['directive'],
                ['achievement', { tier: 'Gold' }], ['overclock'], ['eventAppear'], ['eventClaim', { chain: 2 }],
                ['document'], ['cascade', { tier: 2 }], ['adversary'], ['adversaryBark'], ['ship'], ['boot'], ['desktop'],
            ];
            const out = {};
            for (const [name, opts] of calls) {
                out[name] = out[name] || audio.play(name, opts);
                await new Promise((r) => setTimeout(r, 30));
            }
            return out;
        });
        for (const [name, ok] of Object.entries(results)) assert.equal(ok, true, `${name} should play`);
        // The real hooks, too: game.sfx is the only door game code uses.
        await page.evaluate(() => { game.sfx('purchase'); game.sfx('no-such-sound'); });
    });

    await check('a 15/sec Miracle burst stays inside its voice limit', async () => {
        await page.waitForTimeout(400);
        const burst = await page.evaluate(async () => {
            let peak = 0;
            let played = 0;
            const play = audio.play;
            for (let i = 0; i < 30; i += 1) {
                game.manualPraise(null);
                peak = Math.max(peak, audio.debug().miracleVoices);
                await new Promise((r) => setTimeout(r, 66));
            }
            // And a 50/sec hammer straight at the entry point: the rate
            // throttle has to drop most of these.
            for (let i = 0; i < 25; i += 1) {
                if (play('miracle', { streak: i })) played += 1;
                peak = Math.max(peak, audio.debug().miracleVoices);
                await new Promise((r) => setTimeout(r, 20));
            }
            return { peak, played };
        });
        assert.ok(burst.peak >= 1 && burst.peak <= 4, `miracle voices stayed within 4 (peak ${burst.peak})`);
        assert.ok(burst.played <= 15, `rate throttle dropped hammered strikes (${burst.played}/25 played)`);
    });

    await check('hidden tab suspends, return resumes', async () => {
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await waitFor(() => audio.state() === 'suspended', "state 'suspended'");
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await waitFor(() => audio.state() === 'running', "state 'running' again");
    });

    await check('settings panel drives the buses', async () => {
        await page.evaluate(() => system.openApp('settings'));
        const win = page.locator('#win-settings');
        await win.locator('#audio-master').fill('40');
        await win.locator('#audio-ambient-enabled').uncheck();
        await win.locator('#audio-sfx').fill('65');
        await page.waitForTimeout(200);
        const d = await debug();
        assert.ok(Math.abs(d.master - 0.4) < 1e-3, `master 0.4, got ${d.master}`);
        assert.ok(Math.abs(d.sfx - 0.65) < 1e-3, `sfx 0.65, got ${d.sfx}`);
        assert.equal(d.ambient, 0, 'ambient bus off');
        assert.equal(d.ambientBed, false, 'ambient bed torn down when disabled');
        assert.equal(await win.locator('#audio-ambient-value').innerText(), 'OFF');

        await win.locator('.audio-settings').scrollIntoViewIfNeeded();
        const box = await win.boundingBox();
        await page.screenshot({ path: `${OUT}/settings-panel.png`, clip: box });
    });

    await check('settings persist across a reload', async () => {
        await page.waitForTimeout(500); // past the debounced save
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
        await page.evaluate(() => system.openApp('settings'));
        const win = page.locator('#win-settings');
        assert.equal(await win.locator('#audio-master').inputValue(), '40');
        assert.equal(await win.locator('#audio-sfx').inputValue(), '65');
        assert.equal(await win.locator('#audio-ambient-enabled').isChecked(), false);
        assert.equal(await win.locator('#audio-master-value').innerText(), '40%');
        const s = await page.evaluate(() => ({ ...State.settings.audio }));
        assert.deepEqual(s, { master: 0.4, sfx: 0.65, ambient: 0.35, sfxEnabled: true, ambientEnabled: false, muted: false });
    });

    await check('tray mute zeroes the master gain, persists, and unmutes', async () => {
        await page.click('#tray-audio'); // also the first gesture of this page
        await page.waitForTimeout(150);
        let d = await debug();
        assert.equal(d.master, 0, `master gain should be exactly 0, got ${d.master}`);
        assert.equal(await page.getAttribute('#tray-audio', 'aria-pressed'), 'true');
        assert.equal(await page.locator('#audio-muted').isChecked(), true, 'settings checkbox follows the tray');
        assert.equal(await page.evaluate(() => audio.play('purchase')), false, 'nothing plays while muted');
        await waitFor(() => audio.state() === 'suspended', 'muted context suspends');

        await page.waitForTimeout(400);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
        assert.equal(await page.evaluate(() => State.settings.audio.muted), true, 'mute persisted');
        assert.equal(await page.getAttribute('#tray-audio', 'aria-pressed'), 'true', 'tray shows muted after reload');
        await page.getByRole('button', { name: 'Perform Miracle' }).click();
        d = await debug();
        assert.equal(d.master, 0, 'a gesture while muted must not open the master');

        await page.click('#tray-audio');
        await waitFor(() => audio.state() === 'running', 'unmuted context resumes');
        await page.waitForTimeout(150);
        d = await debug();
        assert.ok(Math.abs(d.master - 0.4) < 1e-3, `master restored to 0.4, got ${d.master}`);
    });

    /* ── Offline levels ─────────────────────────────────────────────────── */
    const renders = [
        ['click'], ['windowOpen'], ['windowClose'], ['windowMode', { mode: 'maximized' }], ['startMenu'],
        ['miracle', { streak: 1 }, 'miracle (streak 1)'], ['miracle', { streak: 12 }, 'miracle (streak 12)'],
        ['miracle', { streak: 1, density: 0.52 }, 'miracle (15/s burst, each)'],
        ['miracle', { void: true }, 'miracle (void)'],
        ['purchase'], ['error'], ['directive'],
        ['achievement', { tier: 'Bronze' }, 'achievement (Bronze)'],
        ['achievement', { tier: 'Silver' }, 'achievement (Silver)'],
        ['achievement', { tier: 'Gold' }, 'achievement (Gold)'],
        ['achievement', { tier: 'Platinum' }, 'achievement (Platinum)'],
        ['achievement', { tier: 'Secret' }, 'achievement (Secret)'],
        ['overclock'], ['eventAppear'], ['eventClaim', { chain: 1 }],
        ['document'],
        ['cascade', { tier: 1 }, 'cascade (tier 1)'], ['cascade', { tier: 4 }, 'cascade (tier 4)'],
        ['adversary'], ['adversaryBark'], ['ship'], ['boot'], ['desktop'],
        ['ambient', { level: 0.1, tier: 0 }, 'ambient (early, stable)'],
        ['ambient', { level: 0.8, tier: 0 }, 'ambient (late, stable)'],
        ['ambient', { level: 0.8, tier: 4 }, 'ambient (late, CASCADE)'],
    ];
    const levels = await page.evaluate(async (list) => {
        const out = [];
        for (const [name, opts, label] of list) {
            const r = await audio.renderOffline(name, opts || {});
            out.push({ label: label || name, name, peakDb: r.peakDb, rmsDb: r.rmsDb, brightness: r.brightness });
        }
        return out;
    }, renders);

    writeFileSync(`${OUT}/levels.json`, JSON.stringify(levels, null, 2));
    console.log('\n  sound                          peak dBFS   RMS dBFS (loudest 300 ms)');
    for (const l of levels) {
        console.log(`  ${l.label.padEnd(30)} ${l.peakDb.toFixed(1).padStart(8)}   ${l.rmsDb.toFixed(1).padStart(8)}`);
    }
    console.log('');

    await check('no cue clips, none is silent', async () => {
        for (const l of levels) {
            assert.ok(l.peakDb < -1, `${l.label} peaks at ${l.peakDb.toFixed(1)} dBFS (clipping headroom)`);
            assert.ok(l.peakDb > -48, `${l.label} is effectively silent (${l.peakDb.toFixed(1)} dBFS)`);
        }
    });

    await check('nothing is loud: every cue sits at or under -6 dBFS', async () => {
        for (const l of levels) assert.ok(l.peakDb <= -6, `${l.label} peaks at ${l.peakDb.toFixed(1)} dBFS`);
    });

    await check('ambient sits well below the cues', async () => {
        const sfx = levels.filter((l) => l.name !== 'ambient' && l.name !== 'click' && l.name !== 'adversaryBark' && l.name !== 'eventAppear');
        const ambient = levels.filter((l) => l.name === 'ambient');
        const sfxRms = sfx.map((l) => l.rmsDb).sort((a, b) => a - b);
        const median = sfxRms[Math.floor(sfxRms.length / 2)];
        for (const a of ambient) {
            assert.ok(a.rmsDb <= median - 10, `${a.label} RMS ${a.rmsDb.toFixed(1)} vs SFX median ${median.toFixed(1)}`);
        }
    });

    await check('the bed opens with production and darkens under a cascade', async () => {
        const early = levels.find((l) => l.label === 'ambient (early, stable)');
        const late = levels.find((l) => l.label === 'ambient (late, stable)');
        const cascade = levels.find((l) => l.label === 'ambient (late, CASCADE)');
        console.log(`      brightness: early ${early.brightness.toFixed(4)}, late ${late.brightness.toFixed(4)}, cascade ${cascade.brightness.toFixed(4)}`);
        assert.ok(late.brightness > early.brightness * 1.1, 'production should brighten the bed');
        assert.ok(cascade.brightness < late.brightness, 'a cascade should darken it');
    });

    await check('the burst-attenuated miracle is quieter than a single strike', async () => {
        const one = levels.find((l) => l.label === 'miracle (streak 1)');
        const burst = levels.find((l) => l.label === 'miracle (15/s burst, each)');
        assert.ok(burst.peakDb < one.peakDb - 4);
    });

    await check('no console errors and no autoplay warnings', async () => {
        assert.deepEqual(problems, []);
    });

    console.log(`\nCosmOS audio check passed: ${passed} checks. Screenshot: ${OUT}/settings-panel.png`);
} catch (error) {
    if (problems.length) console.error('Runtime problems:', problems);
    throw error;
} finally {
    await browser.close();
}
