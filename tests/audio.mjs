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
      changes at all: no music, no hold, no download, no error. Pausing a
      tape mid-line (or hiding the tab) and resuming says the line again
      from its start.
   7. With stand-in tones routed in (ffmpeg, a temp dir, nothing committed):
      Fate says the line her strip shows, but not with Dealer Chatter off,
      not with Voices off, not past the router's cooldown and never over
      another voice; a Mirror Login or End of Shift beat with a line waits
      for it and one without does not; Escape cuts the line and then does
      what it always did; an act still gates alone; sfx__<cue> foley layers
      on its synth cue, rate-limited, and a missing one is a HEAD probe.

   Needs a running server:  COSMOS_TEST_URL=http://127.0.0.1:5192 npm run test:audio */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/audio';
mkdirSync(OUT, { recursive: true });

/* Stand-in files for the lines and foley nothing has generated yet: a
   1.6 s tone for a spoken line, a 0.25 s blip for a foley one-shot. */
const tmp = mkdtempSync(join(tmpdir(), 'cosmos-audio-'));
let tones = null;
try {
    const tone = (name, freq, dur) => {
        const file = join(tmp, name);
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${dur}:sample_rate=48000`,
            '-af', 'volume=0.25', '-c:a', 'libopus', '-b:a', '32k', file]);
        return readFileSync(file);
    };
    tones = { line: tone('line.ogg', 330, 1.6), foley: tone('foley.ogg', 880, 0.25) };
} catch (err) {
    tones = null;
}

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

    await check('pausing a tape mid-line and resuming says that line again, from its start', async () => {
        const duration = await page.evaluate(() => audio.voice.duration('instructor', 't1-s3-0'));
        await page.evaluate(() => {
            const line = AudioFiles.tapeLines(MediaCatalog.tape('t1')).find((l) => l.id === 't1-s3-0');
            MediaPlayerView.loadTape('t1', false);
            MediaPlayerView.seek(line.at - 0.2);
            MediaPlayerView.play();
        });
        await waitFor(() => tapeVoice.current() === 't1-s3-0' && audio.debug().speaking, 'the line to start', 5000);
        await page.waitForTimeout(2000);
        const paused = await page.evaluate(() => {
            MediaPlayerView.pause();
            return { resuming: tapeVoice.resuming(), speaking: audio.debug().speaking, t: MediaPlayerView.state().t };
        });
        assert.equal(paused.resuming, 't1-s3-0', 'the paused line is remembered');
        assert.equal(paused.speaking, false, 'pause cuts it');
        await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => audio.debug().speaking), false, 'and it stays cut while paused');
        const run = await page.evaluate(async () => {
            MediaPlayerView.play();
            const t0 = performance.now();
            let began = null;
            let ended = null;
            while (performance.now() - t0 < 15000) {
                const on = audio.debug().speaking && audio.voice.current() === 'vo__instructor__t1-s3-0';
                if (on && began === null) began = performance.now() - t0;
                if (began !== null && !on) { ended = performance.now() - t0; break; }
                await new Promise((r) => setTimeout(r, 50));
            }
            return { began, ended, t: MediaPlayerView.state().t };
        });
        assert.ok(run.began !== null && run.began < 1500, `the line restarted on play (${run.began} ms)`);
        const heard = (run.ended - run.began) / 1000;
        assert.ok(heard > duration - 0.5, `heard ${heard.toFixed(2)} s of a ${duration.toFixed(2)} s line after resume, so it restarted from the top`);
        console.log(`      paused 2.0 s into the line; on resume it played ${heard.toFixed(2)} s of ${duration.toFixed(2)} s`);
        // A hidden tab: audio.js cuts the line a moment BEFORE the deck pauses.
        await page.evaluate(() => {
            const line = AudioFiles.tapeLines(MediaCatalog.tape('t1')).find((l) => l.id === 't1-s3-0');
            MediaPlayerView.seek(line.at - 0.2);
            MediaPlayerView.play();
        });
        await waitFor(() => tapeVoice.current() === 't1-s3-0' && audio.debug().speaking, 'the line again', 5000);
        await page.waitForTimeout(1000);
        const hidden = await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            document.dispatchEvent(new Event('visibilitychange'));
            return { playing: MediaPlayerView.state().playing, resuming: tapeVoice.resuming() };
        });
        assert.equal(hidden.playing, false, 'the hidden tab paused the deck');
        assert.equal(hidden.resuming, 't1-s3-0', 'and remembered the line it cut');
        await page.evaluate(() => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await waitFor(() => audio.debug().speaking && audio.voice.current() === 'vo__instructor__t1-s3-0', 'the line on return', 5000);
        await page.evaluate(() => MediaPlayerView.pause(true));
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

    /* ── Fate, the Adversary scenes and foley, by routed stand-in files ──
       Tones generated with ffmpeg into a temp dir; nothing is committed.
       Every other assets/audio/ request gets the dev server's index.html. */
    if (tones) {
        const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p3 = await ctx2.newPage();
        const errors = [];
        const seen = [];
        p3.on('pageerror', (e) => errors.push(String(e)));
        p3.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await ctx2.route('**/assets/audio/**', (route) => {
            seen.push(`${route.request().method()} ${route.request().url().split('/assets/audio/')[1]}`);
            return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>CosmOS</title>' });
        });
        const serve = (glob, body) => ctx2.route(`**/assets/audio/${glob}`, (route) => {
            seen.push(`${route.request().method()} ${route.request().url().split('/assets/audio/')[1]}`);
            return route.fulfill({ status: 200, contentType: 'audio/ogg', body: route.request().method() === 'HEAD' ? '' : body });
        });
        await serve('vo__fate__CAS-HOST-*.ogg', tones.line);
        for (const stem of ['vo__sys__ADV-001', 'vo__null-operator__ADV-010', 'vo__null-operator__ADV-012', 'vo__null-operator__ADV-024',
            'vo__null-operator__FIN-010', 'vo__sys__FIN-H-03', 'vo__fate__FIN-H-08', 'vo__sys__FIN-H-09']) await serve(`${stem}.ogg`, tones.line);
        await serve('sfx__purchase.ogg', tones.foley);
        await p3.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
        for (let i = 0; i < 3; i += 1) await p3.getByRole('button', { name: 'Perform Miracle' }).click();
        await p3.waitForFunction(() => audio.state() === 'running' && !document.getElementById('boot-overlay'));
        const wait = (fn, label, timeout = 4000, arg) => p3.waitForFunction(fn, arg, { timeout, polling: 50 })
            .catch(() => { throw new Error(`timed out waiting for ${label}`); });
        const toneSec = await p3.evaluate(() => audio.voice.duration('null-operator', 'ADV-010'));
        assert.ok(toneSec > 1.4 && toneSec < 2, `stand-in line ${toneSec}`);

        await check('Fate says the line her strip shows, under Chatter, the Voices setting and the cooldowns', async () => {
            await p3.evaluate(() => system.openApp(PatienceApp.APP_ID));
            await wait(() => String(audio.voice.current()).startsWith('vo__fate__CAS-HOST-') && audio.debug().speaking, 'her opening line', 5000);
            let r = await p3.evaluate(() => ({ cur: audio.voice.current(), shown: document.getElementById('pt-dealer').dataset.bark }));
            assert.equal(r.cur, `vo__fate__${r.shown}`, 'the voice is the line in the strip');
            // The router's two-second floor: a line asked for now is refused, and nothing new is said.
            r = await p3.evaluate(() => ({ again: PatienceDealer.say(['casino_enter', 'casino_bet_prompt']), cur: audio.voice.current() }));
            assert.equal(r.again, null, 'the router refused it');
            assert.equal(r.cur.startsWith('vo__fate__'), true);
            // Chatter off cuts her line and keeps her quiet.
            await p3.evaluate(() => PatienceDealer.setChatter(false));
            assert.equal(await p3.evaluate(() => audio.voice.current()), null, 'Dealer Chatter off cuts her line');
            const shown = await p3.evaluate(async () => {
                game.playHostBark(CasinoHostBarks[5], true, Date.now());
                await new Promise((res) => setTimeout(res, 300));
                return audio.voice.current();
            });
            assert.equal(shown, null, 'chatter off: no voice, even for a line that reaches the strip');
            await p3.evaluate(() => PatienceDealer.setChatter(true));
            // Voices off: the strip changes, nobody speaks.
            const quiet = await p3.evaluate(async () => {
                audio.setEnabled('voice', false);
                game.playHostBark(CasinoHostBarks[6], true, Date.now());
                await new Promise((res) => setTimeout(res, 300));
                const cur = audio.voice.current();
                audio.setEnabled('voice', true);
                return cur;
            });
            assert.equal(quiet, null, 'Voices off: silent');
            // She never talks over another voice.
            const over = await p3.evaluate(async () => {
                const other = audio.voice.say('null-operator', 'ADV-010');
                await new Promise((res) => setTimeout(res, 300));
                game.playHostBark(CasinoHostBarks[7], true, Date.now());
                await new Promise((res) => setTimeout(res, 200));
                const cur = audio.voice.current();
                audio.voice.stop();
                await other;
                return cur;
            });
            assert.equal(over, 'vo__null-operator__ADV-010', 'not over his line');
            // Closing the table stops her line.
            await p3.evaluate(() => game.playHostBark(CasinoHostBarks[8], true, Date.now()));
            await wait(() => String(audio.voice.current()).startsWith('vo__fate__') && audio.debug().speaking, 'a line to close on');
            await p3.evaluate(() => system.closeApp(PatienceApp.APP_ID));
            assert.equal(await p3.evaluate(() => audio.voice.current()), null, 'the table closed; so did her line');
        });

        await check('the Mirror Login: a beat with a line waits for it; a beat without one does not; Escape skips', async () => {
            // Warm the probes the scene would, so a fast testMode dwell meets answered probes.
            await p3.evaluate(async () => {
                await Promise.all(AdversaryScene.dialogue.map((b) => AudioFiles.sceneLine(b)).filter(Boolean)
                    .map((l) => audio.voice.has(l.speaker, l.id)));
            });
            const run = await p3.evaluate(async () => {
                ui.mirrorReelClaimed = true;
                ui.playAdversaryScene();
                const out = [];
                const t0 = performance.now();
                while (performance.now() - t0 < 12000) {
                    const s = ui.advScene;
                    const id = s && ui.advBeats[s.index] ? ui.advBeats[s.index].id : null;
                    out.push({ ms: performance.now() - t0, id, cur: audio.voice.current(), speaking: audio.debug().speaking });
                    if (id === 'ADV-012' && audio.debug().speaking) break;
                    await new Promise((r) => setTimeout(r, 40));
                }
                return out;
            });
            const on = (id) => run.filter((x) => x.id === id);
            const span = (id) => { const xs = on(id); return xs.length ? (xs[xs.length - 1].ms - xs[0].ms) / 1000 : 0; };
            assert.ok(on('ADV-001').some((x) => x.cur === 'vo__sys__ADV-001' && x.speaking), 'SYS speaks ADV-001');
            assert.ok(span('ADV-001') >= toneSec - 0.3, `ADV-001 waited ${span('ADV-001').toFixed(2)} s for its ${toneSec.toFixed(2)} s line`);
            assert.ok(on('ADV-010').some((x) => x.cur === 'vo__null-operator__ADV-010' && x.speaking), 'NULL.OPERATOR speaks ADV-010');
            assert.ok(span('ADV-010') >= toneSec - 0.3, `ADV-010 waited ${span('ADV-010').toFixed(2)} s`);
            assert.ok(span('ADV-011') < 0.6, `ADV-011 has no file and did not wait (${span('ADV-011').toFixed(2)} s)`);
            assert.equal(run[run.length - 1].id, 'ADV-012', 'reached ADV-012 speaking');
            console.log(`      ADV-001 held ${span('ADV-001').toFixed(2)} s, ADV-010 ${span('ADV-010').toFixed(2)} s, ADV-011 (no file) ${span('ADV-011').toFixed(2)} s`);
            await p3.keyboard.press('Escape');
            const after = await p3.evaluate(() => ({
                cur: audio.voice.current(), speaking: sceneVoice.speaking(),
                atChoice: ui.advBeats[ui.advScene.index].type === 'choice_prompt',
                transcript: document.getElementById('adv-transcript').innerText,
            }));
            assert.equal(after.cur, null, 'Escape cut the line');
            assert.equal(after.speaking, false);
            assert.equal(after.atChoice, true, 'and did what Escape always did: straight to the choice');
            assert.match(after.transcript, /Listen to it beg/);
            await p3.evaluate(() => ui.chooseAdversaryResponse('OP-B'));
            await wait(() => audio.voice.current() === 'vo__null-operator__ADV-024' && audio.debug().speaking, 'ADV-024 after the choice', 4000);
            await p3.evaluate(() => ui.finishAdversaryScene());
            assert.equal(await p3.evaluate(() => ui.isAdversarySceneOpen()), false);
            assert.equal(await p3.evaluate(() => audio.voice.current()), null, 'the scene closed mid-line: the line went with it');
        });

        await check('End of Shift: a line holds the timer, the act still gates alone', async () => {
            await p3.evaluate(async () => {
                ui.dismissSystemModal();
                State.endings.pending = 'hostile';
                const beats = game.finaleBeats('hostile');
                await Promise.all(beats.map((b) => AudioFiles.sceneLine(b)).filter(Boolean).map((l) => audio.voice.has(l.speaker, l.id)));
                ui.playFinale();
            });
            const run = await p3.evaluate(async () => {
                const out = [];
                const t0 = performance.now();
                while (performance.now() - t0 < 9000) {
                    const s = ui.advScene;
                    const id = s && ui.advBeats[s.index] ? ui.advBeats[s.index].id : null;
                    out.push({ ms: performance.now() - t0, id, cur: audio.voice.current(), speaking: audio.debug().speaking, act: s && s.awaitingAct });
                    if (id === 'FIN-H-03' && out.filter((x) => x.id === 'FIN-H-03' && !x.speaking).length > 25) break;
                    await new Promise((r) => setTimeout(r, 40));
                }
                return out;
            });
            const fin10 = run.filter((x) => x.id === 'FIN-010');
            const held = fin10.length ? (fin10[fin10.length - 1].ms - fin10[0].ms) / 1000 : 0;
            assert.ok(fin10.some((x) => x.cur === 'vo__null-operator__FIN-010'), 'FIN-010 spoken');
            assert.ok(held >= toneSec - 0.3, `FIN-010 waited ${held.toFixed(2)} s`);
            const act = run.filter((x) => x.id === 'FIN-H-03');
            assert.ok(act.some((x) => x.cur === 'vo__sys__FIN-H-03' && x.speaking), 'the act beat speaks');
            assert.ok(act.length && act.every((x) => x.act === 'FIN-H-03'), 'and waits on its act');
            assert.ok(act.filter((x) => !x.speaking).length > 20, 'still waiting after its line ended: the act gates, not the line');
            await p3.locator('.fin-act:not(.is-done)').click();
            await wait(() => ui.advScene && ui.advScene.index > ui.advBeats.findIndex((b) => b.id === 'FIN-H-03'), 'the act to move it on');
            // The house speaks from far away in the scene too (HOST is Fate).
            await wait(() => audio.voice.current() === 'vo__fate__FIN-H-08' && audio.debug().speaking, 'FIN-H-08 in her voice', 4000);
            await wait(() => audio.voice.current() === 'vo__sys__FIN-H-09' && audio.debug().speaking
                && ui.advScene.index === ui.advBeats.length - 1, 'the last line, speaking', 5000);
            await p3.locator('.fin-scene').click({ position: { x: 300, y: 60 } });
            await p3.locator('.fin-phase-credits').waitFor({ timeout: 3000 });
            assert.equal(await p3.evaluate(() => audio.voice.current()), null, 'the record is read, not spoken over');
            await p3.evaluate(() => ui.finishFinale());
        });

        await check('foley layers on its synth cue, rate-limited per cue; a missing one is a HEAD probe', async () => {
            const r = await p3.evaluate(async () => {
                await new Promise((res) => setTimeout(res, 300));
                audio.play('purchase');                          // first play: the probe goes out
                const t0 = performance.now();
                while (!audio.foley.ready('purchase') && performance.now() - t0 < 3000) await new Promise((res) => setTimeout(res, 50));
                const ready = audio.foley.ready('purchase');
                await new Promise((res) => setTimeout(res, 200));
                const before = audio.foley.played();
                const one = audio.play('purchase');
                const afterOne = audio.foley.played();
                // A hammer at 50/s for 1 s: the synth's 60 ms gap and foley's 120 ms floor.
                await new Promise((res) => setTimeout(res, 200));
                let synth = 0;
                const f0 = audio.foley.played();
                for (let i = 0; i < 50; i += 1) {
                    if (audio.play('purchase')) synth += 1;
                    await new Promise((res) => setTimeout(res, 20));
                }
                const layered = audio.foley.played() - f0;
                // A cue with no file layers nothing, ever.
                audio.play('error');
                await new Promise((res) => setTimeout(res, 400));
                audio.play('error');
                // Sound off: no synth, so no foley.
                audio.setEnabled('sfx', false);
                await new Promise((res) => setTimeout(res, 200));
                const f1 = audio.foley.played();
                const off = audio.play('purchase');
                const offLayered = audio.foley.played() - f1;
                audio.setEnabled('sfx', true);
                return { ready, one, layeredOne: afterOne - before, synth, layered, errorKnown: audio.foley.known('error'), off, offLayered };
            });
            assert.equal(r.ready, true, 'the sample decoded after the first play');
            assert.equal(r.one, true);
            assert.equal(r.layeredOne, 1, 'the next play layered it');
            assert.ok(r.synth >= 10, `the synth played ${r.synth} of 50`);
            assert.ok(r.layered >= 5 && r.layered <= 10 && r.layered < r.synth, `foley ${r.layered} of ${r.synth} synth plays in a second (120 ms floor)`);
            assert.equal(r.errorKnown, false, 'no sfx__error installed');
            assert.equal(r.off, false);
            assert.equal(r.offLayered, 0, 'SFX off: no foley either');
            const err = seen.filter((x) => x.includes('sfx__error'));
            assert.ok(err.length >= 1 && err.length <= 2 && err.every((x) => x.startsWith('HEAD ')), `only HEAD probes: ${err.join(', ')}`);
            console.log(`      foley layered on ${r.layered} of ${r.synth} hammered purchase cues`);
        });

        await check('the stand-in run raised no errors', async () => {
            assert.deepEqual(errors, []);
        });
        await ctx2.close();
    } else {
        console.log('  note  ffmpeg with libopus not found; the Fate, scene and foley checks are skipped');
    }

    await check('no console errors and no autoplay warnings', async () => {
        assert.deepEqual(problems, []);
    });

    console.log(`\nCosmOS audio check passed: ${passed} checks. Screenshot: ${OUT}/settings-panel.png`);
} catch (error) {
    if (problems.length) console.error('Runtime problems:', problems);
    throw error;
} finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
}
