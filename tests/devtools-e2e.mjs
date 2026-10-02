#!/usr/bin/env node
/**
 * The Dev Console, in the page (js/devtools.js).
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tests/devtools-e2e.mjs
 *
 * tests/devtools.mjs holds each action's state effect with no DOM. This is
 * what only a browser can say:
 *
 *   1. The gate. The section shows on localhost, is absent under a
 *      release-like page (the script not served: exactly what a
 *      `build:release` dist is), and on a non-local host appears only with
 *      ?dev=1 — which then holds for the tab and no other.
 *   2. It is a tester's section, not a tax: nothing is scheduled while it
 *      sits closed, the meter and the inspector ride the shared Heartbeat and
 *      let go, and the meter puts the timer APIs back exactly as it found them.
 *   3. The panel does what it says through real clicks: Unlock everything
 *      shows every icon, a cinematic replays that the game would call seen,
 *      ships and presets climb, time is played or slept through, incidents and
 *      the cascade are filed, the NULL.OPERATOR scenes come up, snapshots
 *      round-trip through a reload, and a link reproduces a state.
 *   4. Session 8's keyboard rules hold inside it: Space presses the focused
 *      control and is never also a Miracle, a letter on a focused select is
 *      not a desktop shortcut, Escape closes the layer the keyboard is in.
 *   5. The DEV mark appears with the first edit and never before.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const ALL_APPS = ['console', 'settings', 'mandates', 'dimensions', 'notepad', 'taskmgr', 'recyclebin',
    'divineglobe', 'divinecalls', 'adorationshop', 'solitaire', 'mediaplayer', 'choir', 'mail', 'etherscape'];

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };
const errors = [];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const contexts = [];

async function newPage({ url = '/?testMode=1', route = null, allow = [], origin = baseUrl, context = null } = {}) {
    const ctx = context || await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (!context) contexts.push(ctx);
    if (route) await route(ctx);
    const page = await ctx.newPage();
    const keep = (text) => { if (!allow.some((rx) => rx.test(text))) errors.push(text); };
    page.on('pageerror', (e) => keep(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') keep(m.text()); });
    await page.goto(`${origin}${url}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.evaluate(() => ui.dismissSystemModal?.());
    return page;
}

const openSettings = async (page) => {
    await page.evaluate(() => { ui.dismissSystemModal?.(); system.openApp('settings'); });
    await page.locator('#win-settings .dev-console').waitFor();
};
const openGroup = async (page, id) => {
    await page.evaluate((g) => { document.getElementById(`dev-g-${g}`).open = true; }, id);
    await page.locator(`#dev-g-${id}[open]`).waitFor();
};
const dev = (page, name, arg) =>
    page.locator(`#win-settings [data-dev="${name}"]${arg !== undefined ? `[data-arg="${arg}"]` : ''}`).first();
const click = async (page, name, arg) => {
    const el = dev(page, name, arg);
    await el.scrollIntoViewIfNeeded();
    await el.click();
};
const status = (page) => page.locator('#dev-status').innerText();
const waitStatus = (page, rx, timeout = 8000) =>
    page.waitForFunction((src) => new RegExp(src).test(document.getElementById('dev-status')?.textContent || ''), rx.source, { timeout });
const evalIn = (page, fn, arg) => page.evaluate(fn, arg);
const withReload = async (page, action) => {
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), action()]);
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor().catch(() => {});
};
const visibleIcons = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll('.desktop-icons .icon')).filter((i) => getComputedStyle(i).display !== 'none').map((i) => i.id.replace('icon-', '')));

try {
    console.log('\nDev Console (browser)\n');

    /* ── 1. the gate ──────────────────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        const text = await page.locator('#win-settings .dev-banner').innerText();
        assert.match(text, /CMS FIELD ENGINEER MODE\s+—\s+NOT FOR PRODUCTION/);
        assert.equal(await page.locator('#win-settings details.dev-group').count(), 11, 'eleven option groups');
        assert.equal(await page.locator('#win-settings .dev-console').count(), 1, 'mounted once');
        await evalIn(page, () => { system.closeApp('settings'); system.openApp('settings'); });
        await page.locator('#win-settings .dev-console').waitFor();
        assert.equal(await page.locator('#win-settings .dev-console').count(), 1, 'a reopened window mounts a fresh one, not a second');
        assert.equal(await page.locator('#dev-taint').innerText(), 'CLEAN');
        assert.equal(await page.locator('#dev-watermark').count(), 0, 'no DEV mark before any edit');
        assert.equal(await evalIn(page, () => JSON.parse(window.render_game_to_text()).devTainted), false);
        step('on localhost: the section mounts once at the bottom of Divine Settings, CLEAN, no DEV mark');
        const sectionLast = await evalIn(page, () => {
            const panel = document.querySelector('#win-settings .settings-panel');
            return panel.lastElementChild.classList.contains('dev-console');
        });
        assert.equal(sectionLast, true, 'it is the last thing in the panel');
        step('it sits at the bottom, after Statistics');
    }
    {
        const page = await newPage({
            allow: [/Failed to load resource/],
            route: (ctx) => ctx.route('**/js/devtools.js*', (r) => r.fulfill({ status: 404, contentType: 'text/plain', body: 'not here' })),
        });
        await evalIn(page, () => system.openApp('settings'));
        await page.locator('#win-settings .settings-panel').waitFor();
        assert.equal(await evalIn(page, () => typeof DevTools), 'undefined', 'the release-like page has no DevTools');
        assert.equal(await page.locator('#win-settings .dev-console').count(), 0);
        assert.ok(await page.locator('#win-settings h3', { hasText: 'Statistics' }).count(), 'the rest of Divine Settings is untouched');
        step('release-like (script not served): no section, no global, and Divine Settings is otherwise intact');
    }
    {
        const url = new URL(baseUrl);
        if (url.hostname === 'localhost') {
            const origin = `${url.protocol}//cosmos.localhost:${url.port}`;
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
            contexts.push(ctx);
            const page = await newPage({ context: ctx, origin });
            await evalIn(page, () => system.openApp('settings'));
            await page.locator('#win-settings .settings-panel').waitFor();
            assert.equal(await evalIn(page, () => typeof DevTools), 'object', 'the file loaded; the gate is what holds');
            assert.equal(await evalIn(page, () => DevTools.enabled()), false);
            assert.equal(await page.locator('#win-settings .dev-console').count(), 0, 'a non-local host shows nothing');
            await page.goto(`${origin}/?testMode=1&dev=1`, { waitUntil: 'domcontentloaded' });
            await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
            await openSettings(page);
            step('a non-local host: nothing without ?dev=1, the section with it');
            await page.goto(`${origin}/?testMode=1`, { waitUntil: 'domcontentloaded' });
            await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
            await openSettings(page);
            step('?dev=1 holds for the tab: a reload without it keeps the section');
            const other = await ctx.newPage();
            other.on('pageerror', (e) => errors.push(String(e)));
            await other.goto(`${origin}/?testMode=1`, { waitUntil: 'domcontentloaded' });
            await other.getByRole('button', { name: 'Perform Miracle' }).waitFor();
            await evalIn(other, () => system.openApp('settings'));
            await other.locator('#win-settings .settings-panel').waitFor();
            assert.equal(await other.locator('#win-settings .dev-console').count(), 0, 'sessionStorage is per tab');
            step('and it does not leak into another tab');
        } else {
            console.log(`  skip  non-local host checks (base URL host is ${url.hostname})`);
        }
    }

    /* ── 2. nothing scheduled while it sits closed ───────────────────── */
    {
        const withDev = await newPage();
        const without = await newPage({
            allow: [/Failed to load resource/],
            route: (ctx) => ctx.route('**/js/devtools.js*', (r) => r.fulfill({ status: 404, body: '' })),
        });
        for (const p of [withDev, without]) await evalIn(p, () => { system.openApp('settings'); });
        await withDev.locator('#win-settings .dev-console').waitFor();
        await withDev.waitForTimeout(1500);
        const subs = await Promise.all([withDev, without].map((p) => evalIn(p, () => Heartbeat.size())));
        assert.equal(subs[0], subs[1], 'the open, idle panel adds no Heartbeat watcher');
        const idle = await evalIn(withDev, async () => {
            let frames = 0; let timers = 0;
            const raf = window.requestAnimationFrame; const st = window.setTimeout; const si = window.setInterval;
            window.requestAnimationFrame = (f) => raf((t) => { frames++; return f(t); });
            window.setTimeout = (f, ...a) => st((...x) => { timers++; return f(...x); }, ...a);
            window.setInterval = (f, ...a) => si((...x) => { timers++; return f(...x); }, ...a);
            await new Promise((r) => st(r, 3000));
            window.requestAnimationFrame = raf; window.setTimeout = st; window.setInterval = si;
            return { frames, timers };
        });
        const idleWithout = await evalIn(without, async () => {
            let frames = 0; let timers = 0;
            const raf = window.requestAnimationFrame; const st = window.setTimeout; const si = window.setInterval;
            window.requestAnimationFrame = (f) => raf((t) => { frames++; return f(t); });
            window.setTimeout = (f, ...a) => st((...x) => { timers++; return f(...x); }, ...a);
            window.setInterval = (f, ...a) => si((...x) => { timers++; return f(...x); }, ...a);
            await new Promise((r) => st(r, 3000));
            window.requestAnimationFrame = raf; window.setTimeout = st; window.setInterval = si;
            return { frames, timers };
        });
        assert.ok(idle.timers <= idleWithout.timers + 3, `timers: ${idle.timers} with the panel, ${idleWithout.timers} without`);
        assert.ok(idle.frames <= idleWithout.frames + 30, `frames: ${idle.frames} with the panel, ${idleWithout.frames} without`);
        step('an open, idle panel adds no Heartbeat watcher and no measurable wakeups');
    }

    /* ── 3a. Unlock everything, the DEV mark, Cinematics ─────────────── */
    {
        const page = await newPage();
        assert.ok((await visibleIcons(page)).length < ALL_APPS.length, 'fixture check: a fresh save hides icons');
        await openSettings(page);
        await openGroup(page, 'unlock');
        await click(page, 'unlock-everything');
        await waitStatus(page, /Unlock everything: .* apps/);
        const icons = await visibleIcons(page);
        for (const id of ALL_APPS) assert.ok(icons.includes(id), `icon ${id} is on the desktop (got ${icons.join(', ')})`);
        step('Unlock everything puts every one of the 15 icons on the desktop');
        assert.equal(await page.locator('#dev-watermark').innerText(), 'DEV');
        assert.equal(await page.locator('#dev-taint').getAttribute('data-tainted'), 'true');
        assert.equal(await evalIn(page, () => JSON.parse(window.render_game_to_text()).devTainted), true);
        assert.equal(await page.locator('#dev-watermark').evaluate((el) => getComputedStyle(el).pointerEvents), 'none', 'the mark never eats a click');
        step('the DEV mark appears with the first edit, saves, and shows in render_game_to_text');
        assert.equal(await page.locator('#media-cinematics').inputValue(), 'always', 'the Cinematics select followed');
        const menu = await evalIn(page, () => { system.renderStartMenu(); return Array.from(document.querySelectorAll('#start-menu-apps [data-app]')).map((b) => b.dataset.app); });
        for (const id of ['mail', 'mediaplayer', 'etherscape', 'choir', 'solitaire']) assert.ok(menu.includes(id), `Genesis menu lists ${id}`);
        const worlds = await evalIn(page, () => ({
            mail: Mail.unreadCount() > 0 || State.mail.log.length, tapes: State.settings.media.tapes.length,
            docs: State.documents.collected.length, void: State.dimensions.void.unlocked, found: State.footage.found.length,
        }));
        assert.ok(worlds.mail && worlds.tapes === 6 && worlds.docs === 15 && worlds.void && worlds.found === 9, JSON.stringify(worlds));
        step('every tape, document, reel and the Void; Mail has its Omniscient letters; the Genesis menu lists the new apps');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
        assert.equal(await page.locator('#dev-watermark').count(), 1, 'the mark is back after a reload: it lives in the save');
        step('the DEV mark survives a reload');
    }

    /* ── 3b. the media bench ─────────────────────────────────────────── */
    {
        const page = await newPage({ allow: [/Failed to load resource/] });
        await openSettings(page);
        await openGroup(page, 'media');
        await page.waitForFunction(() => /\d+ of \d+ installed/.test(document.getElementById('dev-probe-summary')?.textContent || ''), null, { timeout: 20000 });
        const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#dev-g-media [data-probe]')).map((c) => [c.dataset.probe, c.dataset.state, c.textContent]));
        assert.ok(rows.length >= 20, `a row per scene, loop, shot and reel (got ${rows.length})`);
        const scene = rows.find((r) => r[0] === 'entry:scene:ship-the-build');
        assert.equal(scene[1], 'ok', `V2 reads installed: ${scene}`);
        const reel = rows.find((r) => r[0] === 'entry:reel:omni-ending');
        assert.equal(reel[1], 'missing', `a reel with no file reads missing: ${reel}`);
        assert.equal(await page.locator('#dev-scenes li').count(), 5, 'five playable cinematics (V1, V2, V4, V5, V6)');
        assert.equal(await page.locator('#dev-loops li').count(), 4, 'four loops (V3 ×3, V7)');
        assert.equal(await page.locator('#dev-tapes > li').count(), 6, 'six tapes');
        assert.equal(await page.locator('#dev-reels li').count(), 9, 'nine reels (5 recovered, 4 Omniscient)');
        step('the bench lists every cinematic, loop, tape and reel, and reads installed / missing from the existing probe');

        // A reel the game would call seen replays from the bench, and Cinematics is put back.
        await evalIn(page, () => { media.setCinematics('first'); media.settings().seen.push('ship-the-build'); media.settings(); });
        assert.equal(await evalIn(page, () => media.play('ship-the-build')), 'seen', 'fixture check: the game itself would skip it');
        await click(page, 'play-scene', 'ship-the-build');
        await page.locator('.cine-stage[data-scene="ship-the-build"]').waitFor({ timeout: 5000 });
        assert.equal(await evalIn(page, () => media.settings().cinematics), 'always', 'forced to Always while it plays');
        await page.keyboard.press('Escape');
        await waitStatus(page, /ship-the-build: (skipped|played)\./);
        assert.equal(await evalIn(page, () => media.settings().cinematics), 'first', 'and put back afterwards');
        assert.equal(await page.locator('.cine-stage').count(), 0);
        step('a cinematic the game would call seen replays from the bench, and the Cinematics setting is restored');

        await click(page, 'play-loop', 'cascade-tier2');
        await page.locator('#dev-loop-stage video').waitFor({ timeout: 5000 });
        step('a loop runs in the panel’s own stage');

        await click(page, 'play-tape', 't2');
        await page.locator('#win-mediaplayer').waitFor();
        assert.equal(await evalIn(page, () => MediaPlayerView.state().tape), 't2');
        assert.ok(await evalIn(page, () => State.settings.media.tapes.includes('t2')));
        await evalIn(page, () => system.closeApp('mediaplayer'));
        step('a tape plays in the Sacred Media Player');

        await click(page, 'play-reel', 'rec-incident-0');
        await page.locator('#win-mediaplayer').waitFor();
        assert.ok(await evalIn(page, () => State.footage.found.includes('rec-incident-0')), 'the reel was filed as found, then opened');
        step('a Recovered Footage reel is filed and opened in the deck');
        assert.equal(await evalIn(page, () => State.dev.tainted), false, 'playing media is not editing the run');
        step('playing media leaves the run clean');
    }

    /* ── 3c. progression ─────────────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'progress');
        const base = await evalIn(page, () => { Modifiers.commit(Date.now()); return State.resourceCaps.souls; });
        await click(page, 'caps', '10');
        await waitStatus(page, /Caps: every cap ×10/);
        assert.equal(await evalIn(page, () => State.resourceCaps.souls), base * 10);
        assert.equal(await evalIn(page, () => State.resources.souls), base * 10);
        await click(page, 'caps', '1');
        await waitStatus(page, /dev caps removed/);
        assert.equal(await evalIn(page, () => State.resourceCaps.souls), base);
        step('caps ×10 raises the real cap and fills it; removing puts it back');
        await click(page, 'divinity', '10');
        await waitStatus(page, /Divinity: \+10/);
        assert.equal(await evalIn(page, () => State.totalDivinityPoints), 10);
        step('Divinity adds');
        await page.locator('#dev-mirror').selectOption('B');
        await page.locator('#dev-ship-n').fill('3');
        await click(page, 'ship-n');
        await waitStatus(page, /shipped 3; now reboot 3/);
        assert.equal(await evalIn(page, () => State.adversary.sceneCompleted), true, 'the Mirror Login was answered first, so it does not play over the panel');
        assert.equal(await evalIn(page, () => State.prestigeLevel), 3);
        assert.equal(await page.locator('.system-dialog').count(), 0, 'no release-notes dialog stacks up under a batch');
        step('Ship N builds ships N real builds without stacking dialogs');
        await click(page, 'preset', 'nightly');
        await waitStatus(page, /Preset nightly: reboot 8/);
        await click(page, 'preset', 'beta');
        await waitStatus(page, /already past/);
        assert.equal(await evalIn(page, () => State.prestigeLevel), 8, 'refused, not applied');
        assert.equal(await page.locator('#dev-status').getAttribute('data-tone'), 'error');
        step('presets climb; going back is refused, and says so in the status line');
        await page.locator('#dev-reboot-n').fill('12');
        await click(page, 'reboot-to');
        await waitStatus(page, /now reboot 12/);
        assert.equal(await evalIn(page, () => game.archiveUnlocked()), true);
        step('Reboot to 12 opens Archived');
    }

    /* ── 3d. time and presence ───────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'time');
        const before = await evalIn(page, () => State.mail.clock);
        const t0 = Date.now();
        await click(page, 'attended', '1');
        await waitStatus(page, /1 h played at the desk/, 30000);
        const took = Date.now() - t0;
        const clock = await evalIn(page, () => State.mail.clock);
        assert.ok(clock - before >= 3500, `the mail clock ran an hour (${before} → ${clock})`);
        assert.ok(took < 25000, `an hour of attended play took ${took} ms`);
        step(`+1 hour of attended play runs the watchers, in ${Math.round(took / 100) / 10} s`);

        await click(page, 'presence', 'away');
        await page.mouse.move(300, 300);
        await page.mouse.move(420, 360);
        assert.equal(await evalIn(page, () => game.isPresent(Date.now())), false, 'input does not bring him back');
        assert.match(await page.locator('#dev-presence').innerText(), /forced away/);
        await click(page, 'presence', 'auto');
        await page.mouse.move(310, 310);
        await page.mouse.move(430, 370);
        assert.equal(await evalIn(page, () => game.isPresent(Date.now())), true, 'real input again');
        step('forced away holds against the mouse; Real input hands it back');

        // Sleep through 8 hours: the stored save is rewritten, the page reloads without testMode, the report comes up.
        await click(page, 'unlock-everything').catch(() => {});
        await openGroup(page, 'unlock');
        await click(page, 'unlock-everything');
        await waitStatus(page, /Unlock everything/);
        await evalIn(page, () => { Object.assign(State.automatons, { seraphCount: 30 }); State.save(); });
        await openGroup(page, 'time');
        await Promise.all([page.waitForEvent('load', { timeout: 20000 }), click(page, 'offline', '8')]);
        assert.ok(!page.url().includes('testMode'), 'testMode would hide the report');
        await page.locator('#system-modal-layer .offline-report').waitFor({ timeout: 15000 });
        const report = await page.locator('#system-modal-layer .offline-report').innerText();
        assert.match(report, /operated for (480|481|482) minutes/, 'the report counts the eight hours slept through');
        assert.equal(await evalIn(page, () => State.dev.tainted), true);
        step('Away 8 hours reloads into the real offline report');
    }

    /* ── 3e. incidents and the cascade ───────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'incidents');
        await click(page, 'incident', '1');
        await waitStatus(page, /filed SEV-1/);
        assert.equal(await evalIn(page, () => Incidents.state().open.map((i) => i.severity).join()), '1');
        await page.locator('#system-modal-layer.active').waitFor({ timeout: 4000 });
        step('SEV-1 files and raises the SEV-1 dialog');
        await evalIn(page, () => ui.dismissSystemModal());
        await click(page, 'clear-incidents');
        await waitStatus(page, /queue is clear/);
        assert.equal(await evalIn(page, () => Incidents.state().open.length), 0);
        await click(page, 'incident', 'false');
        await waitStatus(page, /false alarm/);
        assert.equal(await evalIn(page, () => { const i = Incidents.state().open[0]; return `${i.severity}:${i.falseAlarm}`; }), '3:true');
        step('the queue clears; a false alarm files as SEV-3 and flagged');
        await click(page, 'cascade', '2');
        await waitStatus(page, /SEV-1 OUTAGE/);
        assert.equal(await evalIn(page, () => State.reality.cascadeTier), 2);
        await click(page, 'cascade', '0');
        await waitStatus(page, /build nominal/);
        assert.equal(await evalIn(page, () => State.reality.cascadeTier), 0);
        step('the cascade tier is set and cleared');
    }

    /* ── 3f. NULL.OPERATOR ───────────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'adversary');
        await click(page, 'mirror-login');
        // V4 plays first when its reel is installed; Esc hands straight over to the scene.
        await page.locator('.cine-stage[data-scene="mirror-login"], .adversary-scene').first().waitFor({ timeout: 6000 });
        if (await page.locator('.cine-stage').count()) await page.keyboard.press('Escape');
        await page.locator('.adversary-scene').waitFor({ timeout: 6000 });
        step('Trigger it now brings the Mirror Login up with the gate bypassed');
        // Escape skips the theatre, arms the walk-out, then denies; further presses close the scene.
        for (let i = 0; i < 10 && await page.locator('.adversary-scene').count(); i++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);
        }
        assert.equal(await evalIn(page, () => State.adversary.sceneCompleted), true, 'the Mirror Login resolved');
        assert.equal(await page.locator('.adversary-scene').count(), 0, 'and closed');
        await click(page, 'standing', 'hostile');
        await waitStatus(page, /Standing: hostile \(-4\)/);
        assert.equal(await evalIn(page, () => game.adversaryRelationship()), 'hostile');
        await click(page, 'standing', 'complicit');
        await waitStatus(page, /complicit \(4\)/);
        assert.equal(await evalIn(page, () => game.adversaryRelationship()), 'complicit');
        step('standing is set to each band');
        assert.notEqual(await evalIn(page, () => game.finaleBlocker()), null, 'fixture check: the real gate is shut on day one');
        await click(page, 'end-of-shift');
        await waitStatus(page, /scene up for the complicit band/);
        await page.locator('.adversary-scene').waitFor({ timeout: 6000 });
        step('End of Shift plays with the gate bypassed');
        // The finale asks for the player's own act (Escape never performs it), so close it directly.
        await evalIn(page, () => ui.finishFinale());
        await page.waitForFunction(() => !document.querySelector('.adversary-scene'), null, { timeout: 4000 });
        // The game files the ending letter in Notepad, a beat after the scene closes.
        await page.locator('#win-notepad').waitFor({ timeout: 4000 }).catch(() => {});
        await evalIn(page, () => { system.closeApp('notepad'); system.focusWindow('settings'); });
        await click(page, 'reset-null');
        await waitStatus(page, /will run again/);
        assert.equal(await evalIn(page, () => State.adversary.sceneCompleted), false);
        step('Reset NULL.OPERATOR lets the login run again');
    }

    /* ── 3g. world apps ──────────────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'world');
        await click(page, 'mail-all');
        await waitStatus(page, /Mail: \d+ delivered/);
        assert.equal(await evalIn(page, () => State.mail.log.length), await evalIn(page, () => MailCatalog.messages.length));
        await page.locator('#icon-mail').waitFor({ state: 'visible' });
        step('Deliver all puts the whole catalogue in the inbox and the Mail icon on the desktop');
        await page.locator('#dev-choir-kind').selectOption('patience');
        await click(page, 'choir-post');
        await waitStatus(page, /Choir: posted patience/);
        await evalIn(page, () => system.openApp('choir'));
        await page.locator('#win-choir').waitFor();
        assert.ok(await evalIn(page, () => Choir.feed(Date.now()).some((p) => p.kind === 'patience')), 'the sample is in the feed');
        step('a Choir sample post reaches the feed');
        await evalIn(page, () => { system.closeApp('choir'); system.focusWindow('settings'); });
        await page.locator('#dev-etherscape-url').selectOption('cosmopedia://void');
        await click(page, 'etherscape-open');
        await waitStatus(page, /Etherscape: opened cosmopedia:\/\/void/);
        await page.locator('#win-etherscape').waitFor();
        step('Etherscape opens a locked page');
        await evalIn(page, () => { system.closeApp('etherscape'); system.focusWindow('settings'); });
        await openGroup(page, 'achievements');
        await click(page, 'ach-all');
        await waitStatus(page, /Achievements: \d+ unlocked/);
        assert.equal(await evalIn(page, () => Object.keys(State.achievements).length), await evalIn(page, () => AchievementList.length));
        step('Achievements unlock all');
    }

    /* ── 3h. save states, export/import, a link ──────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'progress');
        await page.locator('#dev-mirror').selectOption('B');
        await page.locator('#dev-ship-n').fill('2');
        await click(page, 'ship-n');
        await waitStatus(page, /now reboot 2/);
        await openGroup(page, 'saves');
        await click(page, 'snap', 'A');
        await waitStatus(page, /Snapshot A: kept \(reboot 2/);
        assert.match(await page.locator('#dev-slot-A').innerText(), /reboot 2/);
        await page.locator('#dev-ship-n').fill('3');
        await click(page, 'ship-n');
        await waitStatus(page, /now reboot 5/);
        await withReload(page, () => click(page, 'restore', 'A'));
        await page.waitForFunction(() => State.prestigeLevel === 2, null, { timeout: 8000 });
        assert.equal(await evalIn(page, () => State.dev.tainted), true);
        await openSettings(page);
        await openGroup(page, 'saves');
        assert.match(await page.locator('#dev-slot-Z').innerText(), /reboot 5/, 'the run it replaced is in Z');
        assert.match(await page.locator('#dev-slot-A').innerText(), /reboot 2/, 'the slot survives');
        step('Keep, advance, Restore: the run comes back through a reload, and the one it replaced is in Z');

        await click(page, 'export');
        await waitStatus(page, /Export: \d+ characters/);
        const text = await page.locator('#dev-export-text').inputValue();
        assert.ok(text.startsWith('COSMOS-DEV1:'));
        // A second browser takes the run by pasting it.
        const other = await newPage();
        await openSettings(other);
        await openGroup(other, 'saves');
        await other.locator('#dev-export-text').fill(text);
        await withReload(other, () => click(other, 'import'));
        await other.waitForFunction(() => State.prestigeLevel === 2, null, { timeout: 8000 });
        assert.equal(await evalIn(other, () => State.dev.tainted), true);
        step('Export fills the box, and pasting it into another browser takes the run');

        await openSettings(other);
        await openGroup(other, 'saves');
        await other.locator('#dev-export-text').fill('not a save');
        await click(other, 'import');
        await waitStatus(other, /Import: /);
        assert.equal(await other.locator('#dev-status').getAttribute('data-tone'), 'error');
        assert.equal(await evalIn(other, () => State.prestigeLevel), 2, 'a bad paste changes nothing');
        step('a bad paste is refused in the status line and changes nothing');

        await openSettings(other);
        await openGroup(other, 'saves');
        await withReload(other, () => click(other, 'fresh'));
        await other.waitForFunction(() => State.prestigeLevel === 0 && State.dev.tainted === false, null, { timeout: 8000 });
        assert.ok(await evalIn(other, () => JSON.parse(localStorage.getItem('cosmos_dev_slots')).Z), 'the old run is in Z');
        step('Fresh save starts a clean run and keeps the old one in Z');

        // The link builder and the link.
        await openSettings(other);
        await openGroup(other, 'saves');
        await other.locator('#dev-link-preset').selectOption('beta');
        await other.locator('#dev-link-standing').selectOption('hostile');
        await other.locator('#dev-link-mirror').selectOption('B');
        await other.locator('#dev-link-fresh').uncheck();
        const link = await other.locator('#dev-link-out').inputValue();
        assert.match(link, /dev=1/);
        assert.match(link, /unlockAll=1/);
        assert.match(link, /preset=beta/);
        assert.match(link, /standing=hostile/);
        assert.match(link, /mirror=B/);
        assert.match(link, /cinematics=always/);
        assert.doesNotMatch(link, /fresh=1/);
        const tail = link.slice(link.indexOf('?'));
        const fresh = await newPage({ url: `/${tail}&testMode=1` });
        await fresh.waitForFunction(() => State.dev && State.dev.tainted, null, { timeout: 15000 });
        const st = await evalIn(fresh, () => ({ level: State.prestigeLevel, cin: State.settings.media.cinematics, standing: State.adversary.standing, search: location.search }));
        assert.equal(st.level, 3);
        assert.equal(st.cin, 'always');
        assert.equal(st.standing, -4);
        assert.ok(/dev=1/.test(st.search) && /testMode=1/.test(st.search), `the gate and testMode stay in the address (${st.search})`);
        assert.ok(!/unlockAll|preset|standing|cinematics/.test(st.search), `the edits are stripped so a reload does not redo them (${st.search})`);
        const ids = await visibleIcons(fresh);
        for (const id of ALL_APPS) assert.ok(ids.includes(id), `the link unlocked ${id}`);
        const actions = await evalIn(fresh, () => State.dev.actions);
        await fresh.reload({ waitUntil: 'domcontentloaded' });
        await fresh.getByRole('button', { name: 'Perform Miracle' }).waitFor();
        assert.equal(await evalIn(fresh, () => State.prestigeLevel), 3, 'a reload keeps the run');
        assert.equal(await evalIn(fresh, () => State.dev.actions), actions, 'and does not apply the link a second time');
        step('a built link reproduces the state in a new browser, applies once, and is stripped from the address');

        const clean = await newPage({ url: '/?testMode=1&dev=1&fresh=1&reboot=1' });
        await clean.waitForFunction(() => State.prestigeLevel === 1 && State.dev.tainted, null, { timeout: 15000 });
        step('fresh=1 starts a new run before applying the rest');
    }

    /* ── 4. the keyboard ─────────────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'progress');
        const clicks0 = await evalIn(page, () => State.totalClicks);
        await dev(page, 'divinity', '1').focus();
        await page.keyboard.press('Space');
        await waitStatus(page, /Divinity: \+1/);
        assert.equal(await evalIn(page, () => State.totalClicks), clicks0, 'Space pressed the focused button and was not also a Miracle');
        assert.equal(await evalIn(page, () => State.totalDivinityPoints), 1);
        step('Space presses the focused control and is never also a Miracle');

        await page.locator('#dev-g-adversary > summary').focus();
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#dev-g-adversary').evaluate((d) => d.open), true, 'Space opens a group from its summary');
        assert.equal(await evalIn(page, () => State.totalClicks), clicks0, 'and is not a Miracle there either');
        await page.keyboard.press('Space');
        assert.equal(await page.locator('#dev-g-adversary').evaluate((d) => d.open), false);
        step('Space opens and closes a group from its summary');

        await openGroup(page, 'incidents');
        await evalIn(page, () => system.closeApp('console'));   // testMode opens the Engine on boot
        await page.locator('#dev-incident-template').focus();
        await page.keyboard.press('m');
        await page.keyboard.press('s');
        await page.keyboard.press('c');
        assert.equal(await page.locator('#win-mandates').count(), 0, '“m” on a focused select is not Divine Mandates');
        assert.equal(await page.locator('#win-console').count(), 0, '“c” is not the Engine');
        step('a letter typed on a focused select is not a desktop shortcut');

        await dev(page, 'divinity', '1').focus();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#win-settings').count(), 0, 'Escape closes the window the keyboard is in');
        step('Escape closes the layer the keyboard is in');
    }

    /* ── 5. overlays ─────────────────────────────────────────────────── */
    {
        const page = await newPage();
        await openSettings(page);
        await openGroup(page, 'diag');
        const base = await evalIn(page, () => ({ size: Heartbeat.size(), raf: window.requestAnimationFrame, st: window.setTimeout, si: window.setInterval }));
        await evalIn(page, () => { window.__saved = { raf: window.requestAnimationFrame, st: window.setTimeout, si: window.setInterval }; });
        await click(page, 'meter-on');
        await page.waitForFunction(() => /wakeups\/s/.test(document.getElementById('dev-meter-out')?.textContent || ''), null, { timeout: 6000 });
        const reading = await page.locator('#dev-meter-out').innerText();
        assert.match(reading, /\d+ frames\/s · \d+ timers\/s · \d+ beats\/s = \d+ wakeups\/s · frame/);
        assert.equal(await evalIn(page, () => Heartbeat.size()), base.size + 1, 'one watcher while it runs');
        await click(page, 'meter-off');
        assert.equal(await page.locator('#dev-meter-out').innerText(), 'off');
        const same = await evalIn(page, () => window.requestAnimationFrame === window.__saved.raf && window.setTimeout === window.__saved.st && window.setInterval === window.__saved.si);
        assert.equal(same, true, 'the timer APIs are back exactly as found');
        assert.equal(await evalIn(page, () => Heartbeat.size()), base.size, 'and the watcher is gone');
        step(`the idle meter reads wakeups (“${reading.slice(0, 60)}…”), and leaves nothing behind`);

        await click(page, 'inspect-on');
        await page.waitForFunction(() => /"devTainted"/.test(document.getElementById('dev-inspector')?.textContent || ''), null, { timeout: 4000 });
        const json = JSON.parse(await page.locator('#dev-inspector').innerText());
        assert.ok(json.run && json.apps && json.resources, 'state, run and apps');
        assert.equal(await evalIn(page, () => Heartbeat.size()), base.size + 1);
        await evalIn(page, () => system.closeApp('settings'));
        await page.waitForFunction((n) => Heartbeat.size() === n, base.size, { timeout: 4000 });
        step('the inspector shows the live state, and lets go of the Heartbeat when its window closes');

        await openSettings(page);
        await openGroup(page, 'diag');
        await page.locator('#win-settings [data-breakdown="rate:souls"]').click();
        await page.locator('#breakdown-panel').waitFor({ timeout: 4000 });
        step('the production breakdown opens from the panel');
    }

    /* ── 6. audio ────────────────────────────────────────────────────── */
    {
        const page = await newPage({ allow: [/Failed to load resource/] });
        await openSettings(page);
        await openGroup(page, 'audio');
        await click(page, 'cue', 'purchase');
        await waitStatus(page, /Cue purchase: /);
        assert.equal(await evalIn(page, () => State.dev.tainted), false, 'a cue is not an edit');
        await click(page, 'audio-debug');
        const dbg = await page.locator('#dev-audio-debug').innerText();
        assert.match(dbg, /"state"/);
        await click(page, 'probe-music');
        await page.waitForFunction(() => /\d+ of \d+ installed/.test(document.getElementById('dev-music-summary')?.textContent || ''), null, { timeout: 15000 });
        assert.equal(await page.locator('[data-music="primordial-shift"]').getAttribute('data-state'), 'ok', 'M1 is installed');
        await click(page, 'probe-voice');
        await page.waitForFunction(() => /\d+ of \d+ installed/.test(document.getElementById('dev-voice-summary')?.textContent || ''), null, { timeout: 30000 });
        assert.ok(await page.locator('#dev-voices li [data-dev="voice"]').count() >= 1, 'an installed narration line has a Play button');
        step('cues play without editing the run; audio.debug() reads; music and narration probe to what is installed');
    }

    const real = errors.filter((e) => !/Failed to load resource/.test(e));
    assert.deepEqual(real, [], `page errors:\n${real.join('\n')}`);
    step('no page errors in any scenario');

    console.log(`\nDev Console (browser): ${passed} checks passed.`);
} finally {
    await browser.close();
}
