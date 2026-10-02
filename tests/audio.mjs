/* Audio check — what a browser can verify about sound without ears.

   1. Clicking through the game produces no console errors, and no autoplay
      warning: the AudioContext must not exist before the first gesture.
   2. The context reaches 'running' after a gesture, suspends while the tab
      is hidden and resumes on return.
   3. Settings persist across a reload; mute lands the master gain on zero.
   4. A 15-clicks-per-second Miracle burst never exceeds its voice limit.
   5. Every cue rendered offline through the real graph at default settings
      has a sane level: never clipping, never silent, ambient well below SFX.
   6. Drop-in files (js/audiofiles.js): M1 loops on the primordial desktop
      after the first gesture; a missing file is inert (a HEAD probe, then
      nothing); a spoken line ducks the music about 8 dB and lets it back;
      mute zeroes music and voice and cuts the line; a synced tape caption
      holds the tape clock until its line is done, caption on screen; the
      music sits about 12 dB under the cues and the voice level with them;
      and with every file answered by the dev server's index.html, nothing
      changes at all: no music, no hold, no download, no error.

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
const audioRequests = [];
page.on('request', (req) => { if (req.url().includes('/assets/audio/')) audioRequests.push(`${req.method()} ${req.url().split('/assets/audio/')[1]}`); });
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

    /* ── Drop-in files ───────────────────────────────────────────────── */
    await check('M1 Primordial Shift loops on the primordial desktop after the first gesture', async () => {
        await waitFor(() => audio.debug().musicBed === 'primordial-shift', 'the M1 bed', 8000);
        const d = await debug();
        const lv = await page.evaluate(() => audio.defaultLevels());
        assert.ok(Math.abs(d.music - lv.music) < 1e-3, `music bus at its default ${lv.music}, got ${d.music}`);
        assert.ok(lv.music > 0 && lv.voice > 0);
        assert.equal(d.duck, 1, 'nothing speaking, nothing ducked');
        assert.ok(audioRequests.includes('GET music__primordial-shift.ogg'), `fetched once probed: ${audioRequests.join(', ')}`);
    });

    await check('the Void has no M1: the bed fades out, and returns on the way back', async () => {
        await page.evaluate(() => { State.currentDimension = 'void'; });
        await waitFor(() => audio.debug().musicBed === null, 'the bed to leave in the Void', 3000);
        await waitFor(() => audio.music.known('void-breach') === false, 'M2 probed and found not installed', 3000);
        assert.equal(await page.evaluate(() => audio.debug().musicBed), null, 'and nothing took its place');
        await page.evaluate(() => { State.currentDimension = 'primordial'; });
        await waitFor(() => audio.debug().musicBed === 'primordial-shift', 'M1 back on the primordial desktop', 3000);
    });

    await check('a missing file is inert: a HEAD probe, then nothing', async () => {
        const before = await debug();
        const outcome = await page.evaluate(() => audio.voice.say('instructor', 't2-s2-0'));
        assert.equal(outcome, 'missing');
        assert.equal(await page.evaluate(() => audio.voice.known('instructor', 't2-s2-0')), false, 'the dev server\'s index.html did not count');
        const again = await page.evaluate(() => audio.voice.say('instructor', 't2-s2-0'));
        assert.equal(again, 'missing');
        const d = await debug();
        assert.equal(d.duck, 1, 'no ducking for a line that does not exist');
        assert.equal(d.speaking, false);
        assert.equal(d.musicBed, before.musicBed, 'the music did not notice');
        const t2 = audioRequests.filter((r) => r.includes('t2-s2-0'));
        assert.ok(t2.length >= 1 && t2.every((r) => r.startsWith('HEAD ')), `only HEAD probes: ${t2.join(', ')}`);
        assert.ok(t2.length <= 2, `probed once per extension, then cached: ${t2.join(', ')}`);
        assert.equal(await page.evaluate(() => audio.music.stinger('release-day')), false, 'a missing stinger plays nothing');
    });

    await check('a spoken line ducks the music about 8 dB, and lets it back up', async () => {
        const run = page.evaluate(() => audio.voice.say('instructor', 't1-s2-1'));
        await waitFor(() => audio.debug().speaking, 'the line to start', 5000);
        await page.waitForTimeout(600);
        let d = await debug();
        const db = 20 * Math.log10(d.duck);
        assert.ok(db < -7 && db > -9, `ducked ${db.toFixed(2)} dB`);
        assert.ok(d.voice > 0, 'voice bus open');
        assert.equal(await run, 'played');
        await page.waitForTimeout(1600);
        d = await debug();
        assert.ok(d.duck > 0.97, `restored to ${d.duck}`);
        assert.equal(d.speaking, false);
    });

    await check('mute zeroes music and voice, and cuts the line in progress', async () => {
        const run = page.evaluate(() => audio.voice.say('instructor', 't1-s6-1'));
        await waitFor(() => audio.debug().speaking, 'the line to start', 5000);
        await page.evaluate(() => audio.setMuted(true));
        assert.equal(await run, 'stopped', 'muting cuts the line, so no tape waits on it');
        await page.waitForTimeout(150);
        const d = await debug();
        assert.equal(d.master, 0);
        assert.equal(d.music, 0, `music bus ${d.music}`);
        // The voice bus has nothing playing into it now (the line was cut),
        // so Chrome stops updating its .value: read the scheduled target.
        assert.equal(d.targets.voice, 0, 'voice bus scheduled to 0');
        assert.equal(d.targets.music, 0, 'music bus scheduled to 0');
        assert.equal(await page.evaluate(() => audio.voice.say('instructor', 't1-s2-1')), 'off', 'nothing speaks while muted');
        assert.equal(await page.evaluate(() => audio.voice.known('instructor', 't1-s2-1')), false, 'so a tape does not wait either');
        await page.evaluate(() => audio.setMuted(false));
        await waitFor(() => audio.state() === 'running', 'unmuted context resumes');
        await waitFor(() => audio.debug().musicBed === 'primordial-shift', 'M1 back after unmute', 6000);
    });

    await check('a synced tape caption holds the tape clock until its line is done', async () => {
        await waitFor(() => media.settings().tapes.includes('t1'), 'T1 filed after ten Miracles', 4000);
        await page.evaluate(() => system.openApp('mediaplayer'));
        await page.locator('#win-mediaplayer .mp-shelf').waitFor();
        const duration = await page.evaluate(() => audio.voice.duration('instructor', 't1-s2-0'));
        const plan = await page.evaluate(() => {
            const tp = MediaCatalog.tape('t1');
            const lines = AudioFiles.tapeLines(tp);
            const line = lines.find((l) => l.id === 't1-s2-0');
            MediaPlayerView.loadTape('t1', false);
            MediaPlayerView.seek(line.at - 0.3);
            MediaPlayerView.play();
            return { at: line.at, limit: line.limit, text: line.text, next: lines.find((l) => l.id === 't1-s2-1').text };
        });
        assert.ok(duration > plan.limit - plan.at + 1, `the line (${duration.toFixed(2)} s) outlasts its gap (${(plan.limit - plan.at).toFixed(2)} s), so it must hold`);
        const samples = await page.evaluate(async ({ limit }) => {
            const out = [];
            const t0 = performance.now();
            while (performance.now() - t0 < 14000) {
                const st = MediaPlayerView.state();
                out.push({
                    ms: performance.now() - t0, t: st.t, speaking: tapeVoice.speaking(), line: tapeVoice.current(),
                    caption: document.querySelector('#win-mediaplayer .mp-line')?.textContent || '',
                });
                if (st.t > limit + 1) break;
                await new Promise((r) => setTimeout(r, 100));
            }
            return out;
        }, plan);
        const speaking = samples.filter((x) => x.speaking && x.line === 't1-s2-0');
        assert.ok(speaking.length > 10, `the line was heard (${speaking.length} samples)`);
        for (const x of speaking) {
            assert.ok(x.t < plan.limit, `clock ${x.t.toFixed(3)} passed the next caption at ${plan.limit} while the line played`);
            assert.notEqual(x.caption, plan.next, 'the next caption never shows while this line plays');
        }
        const held = speaking.filter((x) => x.t > plan.limit - 0.05);
        // While the clock waits, the line's own caption is the one on screen.
        // (This loop's state() calls can start a line between frames, and a
        // busy headless page draws only a few frames a second, so the check
        // is made on the hold rather than on the first frame of the line.)
        for (const x of held) assert.equal(x.caption, plan.text, 'the caption stays on screen through the hold');
        const heldFor = held.length ? (held[held.length - 1].ms - held[0].ms) / 1000 : 0;
        assert.ok(heldFor > 1.5, `the clock waited at the next caption (${heldFor.toFixed(1)} s)`);
        const after = samples.find((x) => x.t >= plan.limit);
        assert.ok(after, 'the tape ran on once the line ended');
        const resumed = samples.filter((x) => x.t >= plan.limit && x.line === 't1-s2-1');
        assert.ok(resumed.length, 'and the next caption\'s own line started');
        assert.ok(resumed.some((x) => x.caption === plan.next), 'under its own caption');
        const releasedAt = after.ms / 1000;
        // Played from 0.3 s before the caption: the line ends near 0.3 + duration.
        assert.ok(releasedAt >= duration, `released at ${releasedAt.toFixed(2)} s, after the ${duration.toFixed(2)} s line`);
        console.log(`      held ${heldFor.toFixed(1)} s at the next caption; released ${releasedAt.toFixed(2)} s after play (line ${duration.toFixed(2)} s)`);
        await page.evaluate(() => MediaPlayerView.pause(true));
        assert.equal(await page.evaluate(() => tapeVoice.speaking()), false, 'pausing cut the line');
        assert.equal(await page.evaluate(() => audio.debug().speaking), false);
    });

    await check('settings panel drives the buses', async () => {
        await page.evaluate(() => system.openApp('settings'));
        const win = page.locator('#win-settings');
        await win.locator('#audio-master').fill('40');
        await win.locator('#audio-ambient-enabled').uncheck();
        await win.locator('#audio-sfx').fill('65');
        await win.locator('#audio-music').fill('50');
        await win.locator('#audio-voice-enabled').uncheck();
        await page.waitForTimeout(200);
        const d = await debug();
        const lv = await page.evaluate(() => audio.defaultLevels());
        assert.ok(Math.abs(d.music - 0.5 * (lv.music / 0.6)) < 1e-3, `music follows its slider, got ${d.music}`);
        assert.equal(d.targets.voice, 0, 'voices off');
        assert.equal(await win.locator('#audio-voice-value').innerText(), 'OFF');
        assert.equal(await win.locator('#audio-music-value').innerText(), '50%');
        assert.ok(Math.abs(d.master - 0.4) < 1e-3, `master 0.4, got ${d.master}`);
        // An idle bus (nothing playing into it) can report a stale .value in
        // Chrome; the scheduled target is what the slider set.
        assert.ok(Math.abs(d.targets.sfx - 0.65) < 1e-3, `sfx 0.65, got ${d.targets.sfx}`);
        assert.equal(d.targets.ambient, 0, 'ambient bus off');
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
        assert.equal(await win.locator('#audio-voice-enabled').isChecked(), false);
        assert.deepEqual(s, {
            master: 0.4, sfx: 0.65, ambient: 0.35, music: 0.5, voice: 0.85,
            sfxEnabled: true, ambientEnabled: false, musicEnabled: true, voiceEnabled: false, muted: false,
        });
    });

    await check('tray mute zeroes the master gain, persists, and unmutes', async () => {
        await page.click('#tray-audio'); // also the first gesture of this page
        await page.waitForTimeout(150);
        let d = await debug();
        assert.equal(d.master, 0, `master gain should be exactly 0, got ${d.master}`);
        assert.equal(d.targets.music, 0, 'music bus closed under mute');
        assert.equal(d.targets.voice, 0, 'voice bus closed under mute');
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

    /* File levels: the decoded files through the default bus gains, by the
       same loudest-300 ms RMS as the cues, before the limiter. */
    const fileLevels = await page.evaluate(async () => {
        const lv = audio.defaultLevels();
        const measure = async (url, gain) => {
            const data = await (await fetch(url)).arrayBuffer();
            const octx = new OfflineAudioContext(2, 44100, 44100);
            const buf = await octx.decodeAudioData(data);
            const win = Math.floor(buf.sampleRate * 0.3);
            const chans = [...Array(buf.numberOfChannels).keys()].map((c) => buf.getChannelData(c));
            let max = 0;
            for (let start = 0; start + win <= buf.length; start += Math.floor(win / 2)) {
                let sum = 0;
                for (const d of chans) for (let i = start; i < start + win; i++) sum += d[i] * d[i];
                max = Math.max(max, Math.sqrt(sum / (win * chans.length)));
            }
            return 20 * Math.log10(max * gain);
        };
        const music = await measure('assets/audio/music__primordial-shift.ogg', lv.master * lv.music);
        const voice = [];
        for (const id of ['t1-s2-0', 't1-s3-1', 't1-s6-1']) voice.push(await measure(`assets/audio/vo__instructor__${id}.ogg`, lv.master * lv.voice));
        return { music, voice };
    });

    await check('music sits about 12 dB under the cues, voice about level with them', async () => {
        const sfx = levels.filter((l) => l.name !== 'ambient' && l.name !== 'click' && l.name !== 'adversaryBark' && l.name !== 'eventAppear');
        const sorted = sfx.map((l) => l.rmsDb).sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        const voice = fileLevels.voice.reduce((a, b) => a + b, 0) / fileLevels.voice.length;
        console.log(`      cue median ${median.toFixed(1)} dB, music ${fileLevels.music.toFixed(1)} dB, voice ${voice.toFixed(1)} dB (loudest 300 ms RMS)`);
        const under = median - fileLevels.music;
        assert.ok(under >= 9 && under <= 15, `music ${under.toFixed(1)} dB under the cue median`);
        assert.ok(Math.abs(voice - median) <= 4, `voice ${(voice - median).toFixed(1)} dB from the cue median`);
        assert.ok(voice - fileLevels.music >= 9, 'a line is clear of the music before ducking');
    });

    await check('with no audio files installed, nothing changes', async () => {
        // A second page where every assets/audio/ request gets what Vite
        // gives a missing file: index.html with a 200.
        const bare = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const p2 = await bare.newPage();
        const seen = [];
        const errors = [];
        p2.on('pageerror', (e) => errors.push(String(e)));
        p2.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await p2.route('**/assets/audio/**', (route) => {
            seen.push(`${route.request().method()} ${route.request().url().split('/assets/audio/')[1]}`);
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>CosmOS</title>' });
        });
        await p2.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
        for (let i = 0; i < 11; i += 1) await p2.getByRole('button', { name: 'Perform Miracle' }).click();
        await p2.waitForFunction(() => media.settings().tapes.includes('t1'), null, { timeout: 4000 });
        await p2.evaluate(() => system.openApp('mediaplayer'));
        const run = await p2.evaluate(async () => {
            const tp = MediaCatalog.tape('t1');
            const line = AudioFiles.tapeLines(tp).find((l) => l.id === 't1-s2-0');
            MediaPlayerView.loadTape('t1', false);
            await new Promise((r) => setTimeout(r, 300));   // the probes answer
            MediaPlayerView.seek(line.at - 0.3);
            MediaPlayerView.play();
            const t0 = performance.now();
            let held = false;
            while (performance.now() - t0 < 5000) {
                if (tapeVoice.speaking()) held = true;
                await new Promise((r) => setTimeout(r, 100));
            }
            const t = MediaPlayerView.state().t;
            MediaPlayerView.pause(true);
            return { t, start: line.at - 0.3, limit: line.limit, held, d: audio.debug(), said: await audio.voice.say('instructor', 't1-s2-0') };
        });
        await bare.close();
        assert.equal(run.held, false, 'no line, no hold');
        assert.ok(run.t > run.limit && Math.abs(run.t - (run.start + 5)) < 0.6, `the tape ran on the wall clock: ${run.t.toFixed(2)} after 5 s from ${run.start.toFixed(2)}`);
        assert.equal(run.d.musicBed, null, 'no music');
        assert.equal(run.d.duck, 1, 'no ducking');
        assert.equal(run.said, 'missing');
        assert.ok(seen.length > 0 && seen.every((r) => r.startsWith('HEAD ')), `only HEAD probes, never a download: ${seen.filter((r) => !r.startsWith('HEAD ')).join(', ')}`);
        assert.deepEqual(errors, [], 'and no errors');
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
