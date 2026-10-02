#!/usr/bin/env node
/**
 * The media layer in a real browser.
 *
 *   COSMOS_TEST_URL=http://localhost:5195 node tests/media-e2e.mjs
 *
 * tests/media.mjs proves the decisions and the queue against a fake modal.
 * This proves the page: that with assets/video/ EMPTY the game is unchanged
 * (the dev server answers a missing reel with index.html, which is the case
 * that would show a broken player if anything were going to), that the
 * Sacred Media Player plays T1 from fallback slides, scrubs and toggles its
 * VHS treatment, and that a reel requested while a system dialog is open
 * waits for it.
 *
 * No video is committed. Where a reel has to exist, a one-second VP9 file is
 * generated with ffmpeg into a temp dir and served by request interception
 * at the exact drop-in path, so the real probe and the real <video> run.
 *
 * Screenshots land in output/media/ (gitignored).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/media';
mkdirSync(OUT, { recursive: true });

/* A tiny reel, made fresh. */
const tmp = mkdtempSync(join(tmpdir(), 'cosmos-media-'));
let reel = null;
try {
    const file = join(tmp, 'reel.webm');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x4f2e80:s=320x180:d=1.2:r=12',
        '-c:v', 'libvpx-vp9', '-b:v', '60k', '-an', '-y', file]);
    reel = readFileSync(file);
} catch (err) {
    console.log('  note  ffmpeg with libvpx-vp9 not found; reel playback steps are skipped');
}
const poster = readFileSync(resolve('assets/core/core_void_256.png'));

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watch = (page) => {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

/* Every context starts with an EMPTY video folder, answered the way Vite
   answers a missing file (index.html, status 200). The real reels now live in
   assets/video/, and these checks are about the hooks' behaviour with and
   without a file, so absence is staged rather than assumed. A check that
   needs a reel routes that one file after this, and the later route wins. */
async function newContext(opts) {
    const ctx = await browser.newContext(opts);
    await ctx.route('**/assets/video/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>CosmOS</title>' }));
    return ctx;
}

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

/* Watches for any cinematic stage ever entering the DOM. */
const armStageWatch = (page) => page.evaluate(() => {
    window.__stages = 0;
    new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains('cine-stage')) window.__stages++;
    }).observe(document.body, { childList: true, subtree: true });
});

async function freshTestPage(context) {
    const page = await context.newPage();
    watch(page);
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.evaluate(() => { ui.dismissSystemModal?.(); });
    return page;
}

async function seekTo(page, seconds) {
    await page.evaluate((t) => {
        const r = document.querySelector('#win-mediaplayer .mp-scrub');
        r.value = String(t);
        r.dispatchEvent(new Event('input', { bubbles: true }));
    }, seconds);
}

// Achievement toasts from the setup clicks are not what the screenshots are of.
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.achievement-toast, .document-notification').forEach((t) => t.remove()));

const playerState = (page) => page.evaluate(() => MediaPlayerView.state());

try {
    console.log('\nSacred Media Player and cinematics (browser)\n');

    /* ── 1. Zero assets: the game is unchanged ─────────────────────────── */
    const desk = await newContext({ viewport: { width: 1440, height: 900 } });
    const page = await freshTestPage(desk);
    await armStageWatch(page);

    assert.equal(await page.locator('#icon-mediaplayer').isVisible(), false, 'no player before the first tape');
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Perform Miracle' }).click();
    await page.locator('#icon-mediaplayer').waitFor({ state: 'visible', timeout: 3000 });
    const filed = await page.evaluate(() => ({ tapes: State.settings.media.tapes.slice(), apps: State.unlockedApps.slice(),
        log: document.getElementById('engine-log').innerText }));
    assert.deepEqual(filed.tapes, ['t1']);
    assert.ok(filed.apps.includes('mediaplayer'));
    assert.match(filed.log, /\[TRAINING\] Tape filed: T1/);
    step('T1 is filed after the tenth Miracle; the player appears on the desktop with a log notice');

    // The first Seraph, the way e2e-smoke buys it: V6's hook fires with no reel.
    await page.getByRole('button', { name: 'Claim Reward' }).click();
    await page.getByRole('button', { name: /Seraphic Automaton/ }).click();
    await page.waitForTimeout(800);
    const v6 = await page.evaluate(async () => ({
        outcome: await game.cinematic('first-seraph'),
        stages: window.__stages,
        modal: ui.isSystemModalOpen(),
        seen: State.settings.media.seen.slice(),
        seraphs: State.automatons.seraphCount,
    }));
    assert.equal(v6.seraphs, 1);
    assert.equal(v6.outcome, 'missing', 'the probe saw index.html and called it missing');
    assert.equal(v6.stages, 0, 'no stage was ever built');
    assert.equal(v6.modal, false, 'the modal slot was never taken');
    assert.deepEqual(v6.seen, [], 'a missing reel is never marked seen');
    step('a cinematic hook with no reel installed does nothing at all');

    /* ── 2. The player: T1 by fallback slides ──────────────────────────── */
    // The watch files T2 for that Seraph within a second.
    await page.waitForFunction(() => State.settings.media.tapes.includes('t2'), null, { timeout: 3000, polling: 100 });
    await page.evaluate(() => system.closeApp('console'));
    await page.locator('#icon-mediaplayer').click();
    await page.locator('#win-mediaplayer .mp-screen').waitFor();
    const shelf = await page.locator('#win-mediaplayer .mp-tape').evaluateAll((els) => els.map((e) => ({
        cls: e.className, text: e.innerText.replace(/\s+/g, ' ').trim() })));
    assert.equal(shelf.length, 5, 'T6 is not on the shelf before contact');
    // The first Seraph filed T2 as well; the deck opens on the newest unwatched tape.
    assert.match(shelf[1].cls, /is-current/);
    assert.match(shelf[1].text, /Commissioning Your First Seraph/);
    assert.doesNotMatch(shelf[0].cls, /is-locked/);
    assert.ok(shelf.slice(2).every((s) => /is-locked/.test(s.cls)), 'T3-T5 locked');
    assert.match(shelf[2].text, /Filed when Offerings come online/);
    step('the shelf files T1 and T2, opens on the newest, shows T3-T5 locked with hints, hides T6');

    await page.locator('#win-mediaplayer .mp-tape[data-tape="t1"]').click();
    await page.waitForTimeout(1200);
    let s = await playerState(page);
    assert.equal(s.tape, 't1');
    assert.equal(s.playing, true);
    assert.ok(s.t > 0.6, `the clock runs (t=${s.t})`);
    assert.match(await page.locator('#win-mediaplayer .mp-osd').innerText(), /PLAY/);
    assert.match(await page.locator('#win-mediaplayer .mp-card-title').innerText(), /Welcome to Sector 7G/);
    step('choosing T1 on the shelf plays it: title card, PLAY OSD, the clock running');

    // Scrub into shot 3 — a fallback slide.
    const shot3 = await page.evaluate(() => MediaLogic.shotStart(MediaCatalog.tape('t1'), 2) + 1);
    await seekTo(page, shot3);
    await page.waitForTimeout(200);
    s = await playerState(page);
    assert.equal(s.shot, 2, 'scrubbed into shot 3');
    const slide = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('#win-mediaplayer .mp-slide img')];
        return {
            kind: document.querySelector('#win-mediaplayer .mp-slide')?.dataset.kind,
            loaded: imgs.map((i) => i.complete && i.naturalWidth > 0),
            caption: document.querySelector('#win-mediaplayer .mp-line').textContent,
            want: MediaCatalog.tape('t1').shots[2].captions[0][2],
            status: document.querySelector('#win-mediaplayer .mp-status').innerText,
            transform: document.querySelector('#win-mediaplayer .mp-move').style.transform,
        };
    });
    assert.equal(slide.kind, 'slide');
    assert.ok(slide.loaded.length === 3 && slide.loaded.every(Boolean), 'all three art layers loaded');
    assert.equal(slide.caption, slide.want, 'the caption follows the scrub');
    assert.match(slide.status, /SHOT 3 OF 6/);
    assert.match(slide.status, /FALLBACK SLIDE/);
    assert.match(slide.transform, /scale\(/, 'the camera is moving the slide');
    step('scrubbing lands on a fallback slide built from shipped art, with its caption');

    await page.waitForTimeout(400);
    await clearToasts(page);
    await page.screenshot({ path: `${OUT}/player-t1-vhs-1440.png` });

    // Next / previous shot.
    await page.locator('#win-mediaplayer [data-act="next"]').click();
    assert.equal((await playerState(page)).shot, 3);
    const shot4 = await page.evaluate(() => MediaLogic.shotStart(MediaCatalog.tape('t1'), 3));
    await seekTo(page, shot4 + 3);
    await page.locator('#win-mediaplayer [data-act="prev"]').click();
    const back = await playerState(page);
    assert.equal(back.shot, 3, 'previous first rewinds to the start of this shot');
    assert.ok(back.t - shot4 < 1, 'to its start');
    await page.locator('#win-mediaplayer [data-act="prev"]').click();
    assert.equal((await playerState(page)).shot, 2, 'then to the shot before');
    step('previous and next step between shots like a transport');

    // Space pauses while the player is the top window — and no Miracle fires.
    const clicksBefore = await page.evaluate(() => State.totalClicks);
    await page.locator('#win-mediaplayer .mp-toolbar').click();
    await page.keyboard.press('Space');
    s = await playerState(page);
    assert.equal(s.playing, false);
    assert.equal(await page.evaluate(() => State.totalClicks), clicksBefore, 'Space belonged to the player');
    assert.match(await page.locator('#win-mediaplayer .mp-osd').innerText(), /PAUSE/);
    await page.keyboard.press('Space');
    assert.equal((await playerState(page)).playing, true);
    step('Space plays and pauses while the player is on top');

    // VHS off.
    await page.locator('#win-mediaplayer .mp-vhs-toggle').uncheck();
    const vhs = await page.evaluate(() => ({
        cls: document.querySelector('#win-mediaplayer .mp').classList.contains('is-vhs'),
        saved: State.settings.media.vhs,
        osd: getComputedStyle(document.querySelector('#win-mediaplayer .mp-osd')).display,
        lines: getComputedStyle(document.querySelector('#win-mediaplayer .mp-fx')).display,
    }));
    assert.deepEqual(vhs, { cls: false, saved: false, osd: 'none', lines: 'none' });
    await page.waitForTimeout(300);
    await clearToasts(page);
    await page.screenshot({ path: `${OUT}/player-t1-clean-1440.png` });
    await page.locator('#win-mediaplayer .mp-vhs-toggle').check();
    assert.equal(await page.evaluate(() => State.settings.media.vhs), true);
    step('the VHS treatment toggles, persists, and takes its OSD and scanlines with it');

    // Play to the end: T1 is marked watched.
    await seekTo(page, await page.evaluate(() => MediaLogic.tapeLength(MediaCatalog.tape('t1')) - 0.4));
    await page.evaluate(() => MediaPlayerView.play());
    await page.waitForFunction(() => MediaPlayerView.state().ended === true, null, { timeout: 5000, polling: 100 });
    assert.deepEqual(await page.evaluate(() => State.settings.media.watched.slice()), ['t1']);
    assert.match(await page.locator('#win-mediaplayer .mp-status').innerText(), /BE KIND, REWIND/);
    step('T1 plays to the end and is filed as watched');

    /* ── 3. Settings → Cinematics ──────────────────────────────────────── */
    await page.evaluate(() => system.openApp('settings'));
    const sel = page.locator('#media-cinematics');
    assert.equal(await sel.inputValue(), 'first', 'defaults to First time only');
    await sel.selectOption('off');
    assert.equal(await page.evaluate(() => State.settings.media.cinematics), 'off');
    await sel.selectOption('first');
    await page.evaluate(() => system.closeApp('settings'));
    step('Settings → Cinematics offers First time only / Always / Off and persists it');

    /* ── 4. A reel requested while a dialog is open waits for it ───────── */
    if (reel) {
        await page.route('**/assets/video/cine__void-breach__720.webm', (route) =>
            route.fulfill({ status: 200, contentType: 'video/webm', body: reel }));
        await page.route('**/assets/video/cine__ship-the-build__720.webm', (route) =>
            route.fulfill({ status: 200, contentType: 'video/webm', body: reel }));

        await page.evaluate(() => { window.__v5 = null; ui.showReleaseNotes(State.reality.build); });
        await page.evaluate(() => { media.play('void-breach').then((o) => { window.__v5 = o; }); });
        await page.waitForTimeout(1500);
        let w = await page.evaluate(() => ({ stages: document.querySelectorAll('.cine-stage').length,
            notes: !!document.querySelector('.release-notes'), queued: media.queued(), outcome: window.__v5 }));
        assert.deepEqual(w, { stages: 0, notes: true, queued: ['void-breach'], outcome: null }, 'queued behind the release notes');
        await page.getByRole('button', { name: 'Accept this reality' }).click();
        await page.locator('.cine-stage[data-scene="void-breach"]').waitFor({ timeout: 3000 });
        assert.equal(await page.evaluate(() => ui.isSystemModalOpen()), true, 'the reel holds the modal slot while it plays');
        await page.waitForFunction(() => window.__v5 !== null, null, { timeout: 8000, polling: 100 });
        w = await page.evaluate(() => ({ outcome: window.__v5, seen: State.settings.media.seen.slice(),
            stages: document.querySelectorAll('.cine-stage').length, modal: ui.isSystemModalOpen() }));
        assert.deepEqual(w, { outcome: 'played', seen: ['void-breach'], stages: 0, modal: false });
        step('a reel requested over the release notes waits, then plays, then is marked seen');

        // V2's order: the reel first, the release notes after; Esc skips the
        // reel without also closing the window behind it.
        await page.evaluate(() => system.focusWindow('mediaplayer'));
        await page.evaluate(() => {
            window.__v2 = null;
            media.play('ship-the-build').then((o) => { window.__v2 = o; });
            ui.showReleaseNotes(State.reality.build);
        });
        await page.locator('.cine-stage[data-scene="ship-the-build"]').waitFor({ timeout: 3000 });
        assert.equal(await page.locator('.release-notes').count(), 0, 'the notes wait for the reel');
        await page.keyboard.press('Escape');
        await page.locator('.release-notes').waitFor({ timeout: 3000 });
        const v2 = await page.evaluate(() => ({ outcome: window.__v2, player: !!system.windows.mediaplayer }));
        assert.deepEqual(v2, { outcome: 'skipped', player: true });
        await page.getByRole('button', { name: 'Accept this reality' }).click();
        step('V2 order: reel, then release notes; Esc skips the reel and closes nothing else');

        // First time only: the same scene does not come back.
        assert.equal(await page.evaluate(() => media.play('void-breach')), 'seen');
        step('First time only: a seen reel is not replayed');
        await page.unrouteAll({ behavior: 'ignoreErrors' });
    }

    /* ── 4b. Dialog loops (V3, V7) and the Mirror Login opener (V4) ───── */
    {
        const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
        const p = await freshTestPage(ctx);
        const outageView = () => p.evaluate(() => {
            State.automatons.seraphCount = Math.max(1, State.automatons.seraphCount);
            const inc = State.incidents.open.find((i) => i.severity === 1)
                || Incidents.file('choir_desync', { severity: 1, falseAlarm: false, sector: '7G' });
            ui.dismissSystemModal();
            return ui.showIncidentAlert(Incidents.view(inc));
        });
        const strip = () => p.evaluate(() => !!document.querySelector('#system-modal-layer .dialog-loop video'));

        assert.equal(await outageView(), true, 'fixture: the SEV-1 dialog rendered');
        await p.waitForTimeout(900);
        assert.equal(await strip(), false, 'a loop that is not installed mounts nothing');
        step('no loop installed: the SEV-1 dialog renders exactly as before');
        await ctx.close();
    }
    if (reel) {
        // A fresh page: probes are cached for the session, so a file has to be
        // installed before the first time anything asks for it.
        const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
        for (const stem of ['sev1-alarm', 'cascade-tier2']) {
            await ctx.route(`**/assets/video/loop__${stem}__512.webm`, (route) =>
                route.fulfill({ status: 200, contentType: 'video/webm', body: reel }));
        }
        await ctx.route('**/assets/video/cine__mirror-login__720.webm', (route) =>
            route.fulfill({ status: 200, contentType: 'video/webm', body: reel }));
        const p = await freshTestPage(ctx);
        const outageView = () => p.evaluate(() => {
            State.automatons.seraphCount = Math.max(1, State.automatons.seraphCount);
            const inc = State.incidents.open.find((i) => i.severity === 1)
                || Incidents.file('choir_desync', { severity: 1, falseAlarm: false, sector: '7G' });
            ui.dismissSystemModal();
            return ui.showIncidentAlert(Incidents.view(inc));
        });
        const strip = () => p.evaluate(() => !!document.querySelector('#system-modal-layer .dialog-loop video'));
        {
            await outageView();
            await p.locator('#system-modal-layer .incident-alert .dialog-loop video').waitFor({ timeout: 3000 });
            step('V7: an installed alarm loop plays in a monitor strip inside the SEV-1 dialog');

            await p.evaluate(() => { ui.dismissSystemModal(); ui.showCascadeAlert({ tier: 2, label: 'SEV TEST', output: 0.6, award: 0.6 }); });
            await p.locator('#system-modal-layer .cascade-alert .dialog-loop video').waitFor({ timeout: 3000 });
            step('V3: the cascade alert mounts its tier\'s loop');

            await p.evaluate(() => { media.setCinematics('off'); });
            await outageView();
            await p.waitForTimeout(900);
            assert.equal(await strip(), false, 'Cinematics: Off also switches dialog loops off');
            await p.evaluate(() => { media.setCinematics('first'); ui.dismissSystemModal(); });
            step('Cinematics: Off suppresses dialog loops too');

            await p.evaluate(() => { ui.mirrorReelClaimed = false; ui.playAdversaryScene(); });
            await p.locator('.cine-stage[data-scene="mirror-login"]').waitFor({ timeout: 3000 });
            assert.equal(await p.evaluate(() => ui.isAdversarySceneOpen()), false, 'the scene waits for the reel');
            await p.keyboard.press('Escape');
            await p.waitForFunction(() => ui.isAdversarySceneOpen(), null, { timeout: 4000, polling: 100 });
            step('V4: Mirror Login plays first; Esc hands straight over to the Adversary scene');
        }
        await ctx.close();
    }

    /* ── 4c. A slow probe cannot present the Adversary scene twice ────── */
    {
        const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
        // The reel is "not installed", but the answer takes 1.5s to arrive.
        await ctx.route('**/assets/video/cine__mirror-login__720.*', async (route) => {
            await new Promise((r) => setTimeout(r, 1500));
            await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' });
        });
        const p = await freshTestPage(ctx);
        const result = await p.evaluate(async () => {
            const before = State.adversary.sceneAttempts || 0;
            // Every presentation renders a fresh .adversary-scene section; a
            // second presentation re-renders from the first beat.
            window.__advRenders = 0;
            new MutationObserver((records) => {
                for (const r of records) for (const n of r.addedNodes) if (n.classList?.contains('adversary-scene')) window.__advRenders++;
            }).observe(document.getElementById('system-modal-layer'), { childList: true });
            ui.mirrorReelClaimed = false;
            ui.playAdversaryScene();                     // claims V4, defers the scene
            await new Promise((r) => setTimeout(r, 300));
            const openDuringProbe = ui.isAdversarySceneOpen();
            if (!openDuringProbe) ui.playAdversaryScene(); // what the trigger's resume branch does
            // Finish the scene while the probe is still out, as a quick player
            // would; the deferred call fires only once the slot clears.
            let guard = 0;
            while (ui.isAdversarySceneOpen() && guard++ < 80) {
                const beat = ui.advBeats[ui.advScene.index];
                if (beat && beat.type === 'choice_prompt' && !ui.advScene.choiceId) ui.chooseAdversaryResponse('OP-B');
                else ui.advanceAdversaryScene();
            }
            const finished = !ui.isAdversarySceneOpen();
            await new Promise((r) => setTimeout(r, 3000));
            return { attempts: (State.adversary.sceneAttempts || 0) - before, open: ui.isAdversarySceneOpen(),
                renders: window.__advRenders, openDuringProbe, finished };
        });
        assert.equal(result.openDuringProbe, false, 'fixture: the scene should be held back while the probe is out');
        assert.equal(result.finished, true, 'fixture: the scene could not be driven to its end');
        assert.equal(result.renders, 1, `the scene was presented ${result.renders} times`);
        assert.equal(result.open, false, 'a finished scene came back');
        assert.ok(result.attempts <= 1, `the presentation budget was spent ${result.attempts} times`);
        step('a slow V4 probe plus a trigger retry presents the scene once, and a finished scene stays finished');
        await ctx.close();
    }

    /* ── 5. Reduced motion shows the poster for 1.5s instead ───────────── */
    {
        const rm = await newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
        const p = await freshTestPage(rm);
        await p.route('**/assets/video/cine__first-seraph__720.webp', (route) =>
            route.fulfill({ status: 200, contentType: 'image/png', body: poster }));
        const t0 = Date.now();
        const result = await p.evaluate(async () => {
            const pending = media.play('first-seraph');
            await new Promise((r) => setTimeout(r, 300));
            const still = !!document.querySelector('.cine-stage .cine-still');
            const video = !!document.querySelector('.cine-stage video');
            return { still, video, outcome: await pending, seen: State.settings.media.seen.slice() };
        });
        const ms = Date.now() - t0;
        assert.deepEqual(result, { still: true, video: false, outcome: 'reduced', seen: ['first-seraph'] });
        assert.ok(ms >= 1400 && ms < 4000, `poster held ~1.5s (${ms}ms)`);
        step('reduced motion: the poster stands in for the reel for 1.5s');
        await rm.close();
    }

    /* ── 6. A fresh boot with no reel boots as before ──────────────────── */
    {
        const cold = await newContext({ viewport: { width: 1280, height: 800 } });
        const p = await cold.newPage();
        watch(p);
        const t0 = Date.now();
        await p.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await p.getByRole('heading', { name: /Reality failed its overnight integrity check/ }).waitFor({ timeout: 8000 });
        // The overlay fades for a second after the desktop appears; wait for
        // it to leave rather than racing it (it lost by ~100ms once the
        // missing-reel probe got faster).
        await p.locator('#boot-overlay').waitFor({ state: 'detached', timeout: 3000 });
        const ms = Date.now() - t0;
        assert.equal(await p.locator('#boot-overlay').count(), 0, 'the boot overlay is gone');
        assert.equal(await p.locator('.cine-stage').count(), 0);
        assert.ok(ms < 7000, `boot took ${ms}ms`);
        step('a first launch with no Cold Boot reel boots exactly as before');
        await cold.close();
    }

    /* ── 7. Phone ──────────────────────────────────────────────────────── */
    {
        const phone = await newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
        const p = await freshTestPage(phone);
        await p.evaluate(() => {
            system.closeApp('console');
            State.totalClicks = 10;
            media.checkTapes();
            system.openApp('mediaplayer');
        });
        await p.locator('#win-mediaplayer .mp-screen').waitFor();
        const t = await p.evaluate(() => MediaLogic.shotStart(MediaCatalog.tape('t1'), 1) + 4.6);
        await seekTo(p, t);
        await p.evaluate(() => MediaPlayerView.play());
        await p.waitForTimeout(700);
        const fit = await p.evaluate(() => {
            const w = document.querySelector('#win-mediaplayer');
            const screen = document.querySelector('#win-mediaplayer .mp-screen').getBoundingClientRect();
            const shelf = document.querySelector('#win-mediaplayer .mp-shelf');
            const transport = document.querySelector('#win-mediaplayer .mp-transport, #win-mediaplayer .mp-controls') || document.querySelector('#win-mediaplayer .mp-scrub');
            return { scroll: document.documentElement.scrollWidth, win: w.getBoundingClientRect().width, screenW: screen.width,
                shelfDir: getComputedStyle(shelf).flexDirection,
                shelfBelow: shelf.getBoundingClientRect().top >= transport.getBoundingClientRect().bottom - 1,
                shelfFills: w.getBoundingClientRect().bottom - shelf.getBoundingClientRect().bottom < 80 };
        });
        assert.ok(fit.scroll <= 390, 'no horizontal page scroll');
        assert.equal(fit.shelfDir, 'column', 'on a portrait phone the shelf is a list of spines');
        assert.ok(fit.shelfBelow, 'on a portrait phone the shelf sits under the transport');
        assert.ok(fit.shelfFills, 'the shelf fills the space that was empty vellum');
        assert.ok(fit.screenW > 250, `the screen keeps its size (${fit.screenW}px)`);
        await clearToasts(p);
        await p.screenshot({ path: `${OUT}/player-t1-vhs-390.png` });
        await p.locator('#win-mediaplayer .mp-vhs-toggle').uncheck();
        await p.waitForTimeout(250);
        await clearToasts(p);
        await p.screenshot({ path: `${OUT}/player-t1-clean-390.png` });
        step('at 390×844 the player fits: screen first, the shelf fills the space below');
        await phone.close();
    }

    /* ── 7. The reels actually installed in assets/video/ decode ─────── */
    {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const p = await ctx.newPage();
        watch(p);
        await p.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
        const report = await p.evaluate(async () => {
            /* Each kind has its own contract (docs/VISUAL_UPGRADE_PLAN.md §7):
               cinematics and dialog loops are 16:9, tape shots are 4:3 and
               must run at least as long as the shot they fill. */
            const reels = [
                ...Object.values(MediaCatalog.scenes).map((s) => ({ url: s.webm, kind: 'cine', minDur: 3 })),
                ...Object.values(MediaCatalog.loops).map((l) => ({ url: l.webm, kind: 'loop', minDur: 3 })),
                ...MediaCatalog.tapes.flatMap((t) => t.shots.filter((s) => s.video)
                    .map((s) => ({ url: s.video.webm, kind: 'tape', minDur: s.dur }))),
                ...FootageCatalog.reels.map((r) => ({ url: r.webm, kind: 'footage', minDur: 3 })),
            ];
            const out = [];
            for (const reel of reels) {
                const { url } = reel;
                const head = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
                const type = head.headers.get('content-type') || '';
                if (!/^video\//.test(type)) { out.push({ ...reel, installed: false }); continue; }
                const v = document.createElement('video');
                v.muted = true; v.preload = 'metadata'; v.src = url;
                const meta = await new Promise((res) => {
                    v.onloadedmetadata = () => res({ w: v.videoWidth, h: v.videoHeight, d: v.duration });
                    v.onerror = () => res(null);
                    setTimeout(() => res(null), 8000);
                });
                out.push({ ...reel, installed: true, meta });
            }
            return out;
        });
        const installed = report.filter((r) => r.installed);
        for (const r of installed) {
            assert.ok(r.meta, `${r.url} is installed but does not decode`);
            assert.ok(r.meta.d >= r.minDur - 0.05, `${r.url} is ${r.meta.d}s long, shorter than its ${r.minDur}s slot`);
            if (r.kind === 'tape') {
                assert.ok(r.meta.w >= 960 && r.meta.h >= 720 && Math.abs(r.meta.w / r.meta.h - 4 / 3) < 0.02,
                    `${r.url} is ${r.meta.w}x${r.meta.h}, not 4:3 at the tape contract size`);
            } else {
                assert.ok(r.meta.w >= 960 && r.meta.h >= 540 && Math.abs(r.meta.w / r.meta.h - 16 / 9) < 0.02,
                    `${r.url} is ${r.meta.w}x${r.meta.h}, not 16:9 at the contract size`);
            }
        }
        const count = (kind) => `${installed.filter((r) => r.kind === kind).length}/${report.filter((r) => r.kind === kind).length}`;
        step(`installed reels decode at the contract size (cinematics ${count('cine')}, loops ${count('loop')}, tape shots ${count('tape')})`);
        await ctx.close();
    }

    /* ── 8. Recovered footage and the Omniscient (js/footage.js) ─────── */
    {
        const FX_OUT = 'output/footage';
        mkdirSync(FX_OUT, { recursive: true });
        // A save one reboot in, its first directive claimed: Incident 0 is due
        // in the Recycle Bin, and the first address is due by mail.
        const setup = async (p) => {
            for (let i = 0; i < 10; i++) await p.getByRole('button', { name: 'Perform Miracle' }).click();
            await p.getByRole('button', { name: 'Claim Reward' }).click();
            await p.waitForFunction(() => State.mail.log.some((r) => r.id === 'hr-welcome'), null, { timeout: 4000, polling: 100 });
            await p.evaluate(() => { State.achievementProgress.prestige_count = 1; });
        };

        // Missing: nothing anywhere, however long it is given.
        const bare = await newContext({ viewport: { width: 1440, height: 900 } });
        const p0 = await freshTestPage(bare);
        await setup(p0);
        await p0.waitForTimeout(3500);
        const none = await p0.evaluate(() => {
            system.openApp('recyclebin');
            system.openApp('mediaplayer');
            return { found: State.footage.found.slice(), omni: State.mail.log.some((r) => r.id.startsWith('omni-')),
                bin: !!document.querySelector('.fx-bin'), shelves: !!document.querySelector('#win-mediaplayer .mp-shelves, #win-mediaplayer .fx-shelves'),
                deck: !!document.querySelector('#win-mediaplayer .fx-deck') };
        });
        await p0.waitForTimeout(1200);
        none.binLater = await p0.evaluate(() => !!document.querySelector('.fx-bin'));
        assert.deepEqual(none, { found: [], omni: false, bin: false, shelves: false, deck: false, binLater: false });
        step('footage with no reel installed: no bin file, no shelf, no mail, the player unchanged');
        await bare.close();

        if (reel) {
            const ctx = await newContext({ viewport: { width: 1440, height: 900 } });
            for (const stem of ['rec__incident-0__720', 'omni__successor__720']) {
                await ctx.route(`**/assets/video/${stem}.webm`, (route) => route.fulfill({ status: 200, contentType: 'video/webm', body: reel }));
            }
            const p = await freshTestPage(ctx);
            await setup(p);
            // The address files itself and HR's welcome is followed by it.
            await p.waitForFunction(() => State.mail.log.some((r) => r.id === 'omni-01'), null, { timeout: 5000, polling: 100 });
            assert.deepEqual(await p.evaluate(() => State.footage.found.slice()), ['omni-successor'], 'Incident 0 waits to be found');

            // Opened by hand, the player already shelves the address under the tapes.
            const opened = await p.evaluate(() => { system.openApp('mediaplayer'); return {
                shelf: [...document.querySelectorAll('#win-mediaplayer .fx-reel')].map((b) => b.dataset.reel),
                deck: getComputedStyle(document.querySelector('#win-mediaplayer .mp-deck')).display !== 'none' }; });
            assert.deepEqual(opened, { shelf: ['omni-successor'], deck: true }, 'the Addresses shelf is mounted on open; the tape deck stays up');

            // The Recycle Bin shows a file in unallocated space; Recover opens it.
            await p.evaluate(() => system.openApp('recyclebin'));
            const recover = p.locator('#win-recyclebin .fx-bin [data-reel="rec-incident-0"]');
            await recover.waitFor({ timeout: 2000 });
            assert.equal(await p.evaluate(() => State.recycleBin.items.length), 0, 'not a bin item: nothing to sacrifice');
            await recover.click();
            await p.locator('#win-mediaplayer .fx-deck .fx-video').waitFor();
            await p.waitForFunction(() => { const v = document.querySelector('#win-mediaplayer .fx-video'); return v && v.currentTime > 0.2; }, null, { timeout: 5000, polling: 100 });
            const rec = await p.evaluate(() => ({
                found: State.footage.found.slice(),
                active: FootageView.state().active,
                tapeDeckHidden: getComputedStyle(document.querySelector('#win-mediaplayer .mp-deck')).display === 'none',
                classified: document.querySelector('#win-mediaplayer .fx-classified')?.textContent.trim(),
                bars: document.querySelectorAll('#win-mediaplayer .fx-bars .fx-bar').length,
                barBg: getComputedStyle(document.querySelector('#win-mediaplayer .fx-bar')).backgroundColor,
                redactions: document.querySelectorAll('#win-mediaplayer .fx-line .fx-redact').length,
                line: document.querySelector('#win-mediaplayer .fx-line').textContent,
                tc: document.querySelector('#win-mediaplayer .fx-tc-time').textContent,
                shelf: [...document.querySelectorAll('#win-mediaplayer .fx-reel')].map((b) => b.dataset.reel),
            }));
            assert.deepEqual(rec.found, ['rec-incident-0', 'omni-successor']);
            assert.equal(rec.active, true);
            assert.equal(rec.tapeDeckHidden, true, 'one picture at a time');
            assert.equal(rec.classified, 'CLASSIFIED — CMS EYES ONLY');
            assert.ok(rec.bars >= 1, 'a redaction bar over the picture');
            assert.equal(rec.barBg, 'rgb(0, 0, 0)');
            assert.ok(rec.redactions >= 1, 'a redacted caption');
            assert.doesNotMatch(rec.line, /█/, 'the bar replaces the text');
            assert.match(rec.tc, /^03:14:0\d:\d\d$/, `timecode runs from the reel's base (${rec.tc})`);
            assert.deepEqual(rec.shelf, ['rec-incident-0', 'omni-successor']);
            await clearToasts(p);
            await p.screenshot({ path: `${FX_OUT}/e2e-recovered-1440.png` });
            step('a recovered reel: found in the Recycle Bin, played with redaction bars, timecode and CLASSIFIED framing');

            // The address, from its mail attachment.
            await p.evaluate(() => { system.openApp('mail'); MailView.setFolder('inbox'); MailView.select('omni-01'); });
            const attach = p.locator('#win-mail [data-reel="omni-successor"]');
            await attach.waitFor({ timeout: 2000 });
            assert.match(await attach.innerText(), /FOR_THE_SUCCESSOR\.mov/);
            await attach.click();
            await p.waitForFunction(() => FootageView.state().reel === 'omni-successor' && FootageView.state().t > 0.2, null, { timeout: 5000, polling: 100 });
            const addr = await p.evaluate(() => ({
                head: document.querySelector('#win-mediaplayer .fx-address-head')?.textContent.trim(),
                speaker: document.querySelector('#win-mediaplayer .fx-speaker').textContent,
                classified: !!document.querySelector('#win-mediaplayer .fx-classified'),
                bars: document.querySelectorAll('#win-mediaplayer .fx-bar').length,
            }));
            assert.deepEqual(addr, { head: 'A MESSAGE FOR THE SUCCESSOR', speaker: 'THE OMNISCIENT', classified: false, bars: 0 });
            step('an address from the Omniscient plays from its CMS Mail attachment');

            // A training tape takes the deck back.
            await p.locator('#win-mediaplayer .mp-shelf .mp-tape[data-tape]').first().click();
            assert.equal(await p.evaluate(() => FootageView.state().active), false);
            assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('#win-mediaplayer .mp-deck')).display !== 'none'), true);
            step('choosing a training tape hands the deck back to the tapes');

            // Played to its end it is marked watched.
            await p.evaluate(() => FootageView.load('rec-incident-0', true));
            await p.waitForFunction(() => State.footage.watched.includes('rec-incident-0'), null, { timeout: 6000, polling: 100 });
            step('a reel played to its end is marked watched');
            await ctx.close();
        }
    }

    assert.deepEqual(errors, [], 'no console errors');
    step('no console errors');
    console.log(`\n${passed} passed\n`);
} finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
}
