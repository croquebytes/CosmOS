#!/usr/bin/env node
/**
 * Etherscape Navigator in a real browser.
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tests/etherscape-e2e.mjs
 *
 * tests/etherscape.mjs proves the registry, the API and the newspaper in a
 * vm. This proves the window: the icon turns up with the first Seraph; links,
 * typed addresses, Back and Forward, bookmarks and the Go menu's history all
 * work; an unknown address is the in-world 404 and a locked link stays put;
 * Etherscape.open() lands on every shared-namespace page; a media slot mounts
 * a reel only when one is installed (the dev server answers a missing one
 * with index.html); and the window fits a 390px phone.
 *
 * No video is committed. The installed reel is a one-second VP9 file made
 * with ffmpeg and served by request interception at the drop-in path.
 *
 * Screenshots land in output/etherscape/ (gitignored).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/etherscape';
mkdirSync(OUT, { recursive: true });

const tmp = mkdtempSync(join(tmpdir(), 'cosmos-ether-'));
let reel = null;
try {
    const file = join(tmp, 'reel.webm');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x4f2e80:s=320x180:d=1.2:r=12',
        '-c:v', 'libvpx-vp9', '-b:v', '60k', '-an', '-y', file]);
    reel = readFileSync(file);
} catch (err) {
    console.log('  note  ffmpeg with libvpx-vp9 not found; the installed-reel step is skipped');
}

const SHARED = [
    'cms://intranet', 'cms://hr/policies', 'news://celestial-times', 'sector://7g/status',
    'cosmopedia://', 'cosmopedia://incidents', 'cosmopedia://reality-builds', 'cosmopedia://certification',
    'cosmopedia://storage', 'cosmopedia://void', 'cosmopedia://patience',
    'fate://casino', 'seraph://fanpage', 'void://forum', 'null://',
    'cosmopedia://divine-reboot', 'cosmopedia://archived-channel', 'cosmopedia://sector-7g',
];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const watch = (page) => {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

async function freshTestPage(context) {
    const page = await context.newPage();
    watch(page);
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.evaluate(() => { ui.dismissSystemModal?.(); });
    return page;
}

// Toasts, barks and unsolicited dialogs from the fixture are not what the screenshots are of.
const clearToasts = (page) => page.evaluate(() => {
    ui.dismissSystemModal?.();
    document.querySelectorAll('.achievement-toast, .achievement-overflow, .document-notification, .adversary-bark').forEach((t) => t.remove());
});
const view = (page) => page.evaluate(() => ({ ...EtherscapeView.state(),
    address: document.querySelector('#win-etherscape .es-address').value,
    h1: document.querySelector('#win-etherscape .es-page h1')?.textContent || '',
    statusText: document.querySelector('#win-etherscape .es-status-text').textContent,
    back: document.querySelector('#win-etherscape [data-act="back"]').disabled,
    forward: document.querySelector('#win-etherscape [data-act="forward"]').disabled,
    title: document.querySelector('#win-etherscape .window-title').textContent }));
const go = async (page, address) => {
    const input = page.locator('#win-etherscape .es-address');
    await input.fill(address);
    await input.press('Enter');
};
const link = (page, label) => page.locator('#win-etherscape .es-page a.es-link', { hasText: label }).first();

/* The late game, set by hand: every gate a shared page has, open. */
const unlockEverything = (page) => page.evaluate(() => {
    Object.assign(State.automatons, { seraphCount: 64, throneCount: 22, cherubCount: 15, dominionCount: 4 });
    State.achievementProgress.buy_seraph_count = 64;
    for (const app of ['notepad', 'mediaplayer', 'adorationshop', 'solitaire', 'dimensions', 'etherscape']) {
        if (!State.unlockedApps.includes(app)) State.unlockedApps.push(app);
    }
    State.dimensions.void.unlocked = true;
    State.currentDimension = 'void';
    State.adversary.contacted = true;
    State.adversary.sceneCompleted = true;
    State.adversary.standing = 0;
    ui.updateDesktopIcons();
});

/* Real ships, so the paper and the archive have history. */
const shipBuilds = (page, n) => page.evaluate((count) => {
    for (let i = 0; i < count; i++) {
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
        game.performPrestige({ confirmed: true, certifyOn: 'creation' });
        ui.dismissSystemModal?.();
    }
    return State.prestigeLevel;
}, n);

try {
    console.log('\nEtherscape Navigator (browser)\n');

    /* ── 1. The icon arrives with the first Seraph ─────────────────────── */
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await freshTestPage(desk);
    assert.equal(await page.locator('#icon-etherscape').isVisible(), false, 'no Navigator before the first Seraph');
    assert.equal(await page.evaluate(() => Etherscape.knows('cms://intranet')), false);
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Perform Miracle' }).click();
    await page.getByRole('button', { name: 'Claim Reward' }).click();
    await page.getByRole('button', { name: /Seraphic Automaton/ }).click();
    await page.locator('#icon-etherscape').waitFor({ state: 'visible', timeout: 3000 });
    const installed = await page.evaluate(() => ({ apps: State.unlockedApps.slice(), log: document.getElementById('engine-log').innerText,
        start: [...document.querySelectorAll('#start-menu-apps strong')].map((s) => s.textContent) }));
    assert.ok(installed.apps.includes('etherscape'));
    assert.match(installed.log, /\[ETHERSCAPE\] Etherscape Navigator installed/);
    await page.evaluate(() => system.toggleStartMenu(true));
    assert.ok(await page.locator('#start-menu-apps strong', { hasText: 'Etherscape' }).isVisible(), 'and in the Genesis menu');
    await page.evaluate(() => system.toggleStartMenu(false));
    step('the Navigator installs with the first Seraph: desktop icon, Genesis entry, log line');

    /* ── 2. Home, links, Back and Forward ──────────────────────────────── */
    await page.evaluate(() => system.closeApp('console'));
    await page.locator('#icon-etherscape').click();
    await page.locator('#win-etherscape .es-page h1').waitFor();
    let v = await view(page);
    assert.equal(v.url, 'cms://intranet');
    assert.equal(v.address, 'cms://intranet');
    assert.match(v.title, /Etherscape - \[CMS Intranet/);
    assert.equal(v.back, true, 'nothing to go back to');
    await page.waitForFunction(() => document.querySelector('#win-etherscape .es-status-text').textContent === 'Document: Done', null, { timeout: 2000 });
    assert.equal(await page.locator('#win-etherscape .es.is-loading').count(), 0, 'the throbber has stopped');
    step('the window opens on the Intranet home page; the throbber stops at "Document: Done"');

    await link(page, 'Cosmopedia').click();
    v = await view(page);
    assert.equal(v.url, 'cosmopedia://');
    assert.equal(v.address, 'cosmopedia://');
    assert.equal(await page.locator('#win-etherscape .es.is-loading').count(), 1, 'the throbber turns while the host is contacted');
    await link(page, 'Incidents').click();
    assert.equal((await view(page)).url, 'cosmopedia://incidents');
    await page.locator('#win-etherscape [data-act="back"]').click();
    assert.equal((await view(page)).url, 'cosmopedia://');
    await page.locator('#win-etherscape [data-act="back"]').click();
    v = await view(page);
    assert.equal(v.url, 'cms://intranet');
    assert.equal(v.back, true);
    assert.equal(v.forward, false);
    await page.locator('#win-etherscape [data-act="forward"]').click();
    await page.locator('#win-etherscape [data-act="forward"]').click();
    assert.equal((await view(page)).url, 'cosmopedia://incidents');
    // A visited link is drawn as visited.
    await page.locator('#win-etherscape [data-act="home"]').click();
    assert.match(await link(page, 'Cosmopedia').getAttribute('class'), /is-visited/);
    step('links navigate; Back and Forward walk the stack; Home goes home; visited links are marked');

    /* ── 3. Typed addresses and the 404 ────────────────────────────────── */
    await go(page, 'CMS://HR/Policies/');
    v = await view(page);
    assert.equal(v.url, 'cms://hr/policies');
    assert.equal(v.address, 'cms://hr/policies', 'the Location bar shows the canonical address');
    assert.equal(v.h1, 'Operator Policy Handbook');
    await go(page, 'cms://nowhere/at/all');
    v = await view(page);
    assert.equal(v.status, 'missing');
    assert.equal(v.h1, 'This page has been archived');
    await page.waitForFunction(() => document.querySelector('#win-etherscape .es-status-text').textContent === 'Document: Not found', null, { timeout: 2000 });
    await page.locator('#win-etherscape [data-act="back"]').click();
    assert.equal((await view(page)).url, 'cms://hr/policies', 'the 404 sits in the stack like any page');
    step('a typed address is canonicalised; an unknown one is the in-world 404 ("This page has been archived")');

    /* ── 4. Dead links stay put and say why ────────────────────────────── */
    await page.locator('#win-etherscape .es-dir', { hasText: "What's Cool?" }).click();
    const dead = page.locator('#win-etherscape .es-dead', { hasText: 'THE VOID' });
    assert.equal(await dead.getAttribute('title'), 'Members only. Membership is granted on the far side of the Veil.');
    await dead.click({ force: true }); // aria-disabled, so Playwright would refuse; a person would not
    v = await view(page);
    assert.equal(v.url, 'etherscape://whats-cool', 'a dead link goes nowhere');
    assert.match(v.statusText, /^Link unavailable: Members only/);
    step('a locked page is a dead link with a tooltip; clicking it only explains');

    /* ── 5. Bookmarks and the Go menu's history ────────────────────────── */
    await page.locator('#win-etherscape .es-dir', { hasText: 'Status' }).click();
    await page.locator('#win-etherscape [data-menu="bookmarks"]').click();
    await page.locator('#win-etherscape [data-menu-list="bookmarks"] [data-menu-act="add-bookmark"]').click();
    assert.ok(await page.evaluate(() => State.etherscape.bookmarks.includes('sector://7g/status')), 'saved to the bookmarks');
    await page.locator('#win-etherscape [data-act="home"]').click();
    await page.locator('#win-etherscape [data-menu="bookmarks"]').click();
    const marks = await page.locator('#win-etherscape [data-menu-list="bookmarks"] [data-menu-act="nav"]').evaluateAll((els) => els.map((e) => e.dataset.href));
    assert.deepEqual(marks, ['cms://intranet', 'news://celestial-times', 'cosmopedia://', 'sector://7g/status']);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#win-etherscape [data-menu-list="bookmarks"]').isHidden(), true, 'Escape closes the menu');
    assert.equal(await page.locator('#win-etherscape').count(), 1, '…and only the menu');
    await page.locator('#win-etherscape [data-menu="bookmarks"]').click();
    await page.locator('#win-etherscape [data-menu-list="bookmarks"] [data-href="sector://7g/status"]').click();
    assert.equal((await view(page)).url, 'sector://7g/status');
    await page.locator('#win-etherscape [data-menu="go"]').click();
    const hist = await page.locator('#win-etherscape [data-menu-list="go"] [data-menu-act="nav"]').evaluateAll((els) => els.map((e) => e.dataset.href));
    assert.equal(hist[0], 'sector://7g/status', 'history is most recent first');
    for (const u of ['cms://intranet', 'cosmopedia://', 'cosmopedia://incidents', 'cms://hr/policies', 'etherscape://whats-cool']) {
        assert.ok(hist.includes(u), `${u} in the history`);
    }
    assert.ok(!hist.includes('cms://nowhere/at/all'), 'a 404 is not history');
    await page.locator('#win-etherscape [data-menu-list="go"] [data-href="cms://hr/policies"]').click();
    assert.equal((await view(page)).url, 'cms://hr/policies');
    step('Add Bookmark files the page; the Bookmarks menu and the Go menu\'s history both navigate');

    /* ── 6. The fan page: guestbook and counter ────────────────────────── */
    await go(page, 'seraph://fanpage');
    const hits = await page.evaluate(() => State.etherscape.counterHits);
    assert.ok(hits >= 1, 'the visitor counter counted us');
    await page.getByRole('button', { name: 'Sign the Guestbook' }).click();
    assert.equal(await page.evaluate(() => State.etherscape.guestbookSigned), true);
    assert.ok(await page.locator('#win-etherscape .es-guestbook li', { hasText: 'OPERATOR' }).isVisible());
    assert.equal(await page.getByRole('button', { name: 'Sign the Guestbook' }).count(), 0, 'signed once');
    assert.equal(await page.locator('#win-etherscape .es-construction').count(), 1, 'under construction');
    step('the Seraph fan page counts visitors and takes one guestbook signature');

    /* ── 7. No reel installed: the slot is empty and takes no space ────── */
    await page.waitForTimeout(600);
    const slot = await page.evaluate(() => {
        const s = document.querySelector('#win-etherscape .es-slot[data-clip="seraph-choir"]');
        return { exists: !!s, mounted: s.classList.contains('is-mounted'), kids: s.children.length, h: s.getBoundingClientRect().height };
    });
    assert.deepEqual(slot, { exists: true, mounted: false, kids: 0, h: 0 }, 'the probe saw index.html and called it missing');
    step('with no reel installed a clip slot renders nothing');

    /* ── 8. Etherscape.open() lands on every shared-namespace page ─────── */
    assert.equal(await page.evaluate(() => Etherscape.open('void://forum')), false, 'locked: refused');
    assert.equal(await page.evaluate(() => Etherscape.open('cms://no-such-page')), false, 'unknown: refused');
    await unlockEverything(page);
    assert.equal(await shipBuilds(page, 4), 4, 'fixture check: four real ships');
    await page.evaluate(() => { State.dimensions.void.unlocked = true; State.currentDimension = 'void'; Etherscape.tick(); });
    for (const url of SHARED) {
        await page.evaluate(() => system.closeApp('etherscape'));
        const r = await page.evaluate((u) => ({ knows: Etherscape.knows(u), opened: Etherscape.open(u) }), url);
        assert.deepEqual(r, { knows: true, opened: true }, url);
        v = await view(page);
        assert.equal(v.url, url, `open(${url}) shows it`);
        assert.equal(v.address, url);
    }
    // And with the window already open, open() navigates it.
    assert.equal(await page.evaluate(() => Etherscape.open('cosmopedia://storage')), true);
    v = await view(page);
    assert.equal(v.url, 'cosmopedia://storage');
    assert.equal(v.back, false, 'open() pushes onto the stack of the open window');
    step(`Etherscape.open() opens the window on all ${SHARED.length} shared URLs, or navigates it when open`);

    /* ── 9. Screenshots of four pages at 1440×900 ──────────────────────── */
    await page.evaluate(() => { system.closeApp('etherscape'); system.openApp('etherscape'); system.toggleMaximize('etherscape', true); });
    const shoot = async (url, name, setup) => {
        if (setup) {
            await page.evaluate(setup);
            await page.waitForTimeout(1200);   // let any dialog the setup provokes arrive, to be dismissed
        }
        await clearToasts(page);
        await page.evaluate((u) => EtherscapeView.navigate(u), url);
        await page.waitForTimeout(650);
        await clearToasts(page);
        await page.screenshot({ path: `${OUT}/${name}.png` });
        return page.evaluate(() => document.querySelector('#win-etherscape .es-page').innerText);
    };
    await shoot('cms://intranet', 'intranet-1440');
    const news = await shoot('news://celestial-times', 'celestial-times-1440', () => {
        Incidents.state().attendedSeconds = 9999;
        Incidents.file('choir_desync', { severity: 2, falseAlarm: false, sector: '3A' });
        ui.dismissSystemModal?.();
    });
    const status = await shoot('sector://7g/status', 'status-1440', () => { State.reality.instability = 1.2; });
    await shoot('seraph://fanpage', 'seraph-fanpage-1440');
    await shoot('void://forum', 'void-forum-1440');
    assert.match(news, /Choir desync in Sector 3A/, 'the ticket made the paper');
    assert.match(status, /DEGRADED/, 'the status board shows the cascade');
    assert.match(status, /Instability tier\s+SEV-2 DEGRADED/);
    step('screenshots: Intranet, Celestial Times, Sector 7G status, Seraph fan page, Void forum');

    /* ── 10. The status page refreshes itself ───────────────────────────── */
    await page.evaluate(() => EtherscapeView.navigate('sector://7g/status'));
    await page.evaluate(() => { State.reality.instability = 0; });
    await page.waitForFunction(() => /Instability tier\s+NOMINAL/.test(document.querySelector('#win-etherscape .es-page').innerText), null, { timeout: 7000, polling: 250 });
    step('the status page re-reads live state on its own every 5 seconds');
    await desk.close();

    /* ── 11. An installed reel mounts in its slot ──────────────────────── */
    if (reel) {
        const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        await ctx2.route('**/assets/video/web__seraph-choir__720.webm', (route) =>
            route.fulfill({ status: 200, contentType: 'video/webm', body: reel }));
        const p2 = await freshTestPage(ctx2);
        await p2.evaluate(() => { State.automatons.seraphCount = 1; Etherscape.tick(); });
        assert.equal(await p2.evaluate(() => Etherscape.open('seraph://fanpage')), true);
        await p2.locator('#win-etherscape .es-slot[data-clip="seraph-choir"].is-mounted video').waitFor({ timeout: 4000 });
        const mounted = await p2.evaluate(() => {
            const s = document.querySelector('#win-etherscape .es-slot[data-clip="seraph-choir"]');
            const vid = s.querySelector('video');
            return { src: vid.getAttribute('src'), muted: vid.muted, loop: vid.loop, caption: s.querySelector('figcaption')?.textContent, h: s.getBoundingClientRect().height };
        });
        assert.match(mounted.src, /web__seraph-choir__720\.webm$/);
        assert.equal(mounted.muted, true);
        assert.equal(mounted.loop, true);
        assert.equal(mounted.caption, 'My Seraph choir, recorded on a Tuesday.');
        assert.ok(mounted.h > 50, 'it takes space once mounted');
        // Cinematics: Off — a fresh page mounts nothing even with the reel.
        await p2.evaluate(() => { media.setCinematics('off'); EtherscapeView.navigate('cms://intranet'); EtherscapeView.navigate('seraph://fanpage'); });
        await p2.waitForTimeout(600);
        assert.equal(await p2.locator('#win-etherscape .es-slot[data-clip="seraph-choir"] video').count(), 0, 'Cinematics: Off');
        await ctx2.close();
        step('an installed web reel mounts muted and looping, with its caption; Cinematics: Off shows nothing');
    }

    /* ── 12. A 390px phone ─────────────────────────────────────────────── */
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const p3 = await freshTestPage(phone);
    await p3.evaluate(() => { State.automatons.seraphCount = 1; Etherscape.tick(); system.closeApp('console'); });
    assert.equal(await p3.evaluate(() => Etherscape.open('cosmopedia://reality-builds')), true);
    await p3.waitForTimeout(700);
    const fit = await p3.evaluate(() => {
        const w = document.querySelector('#win-etherscape').getBoundingClientRect();
        const inside = (sel) => [...document.querySelectorAll(sel)].every((el) => {
            const r = el.getBoundingClientRect();
            return r.left >= w.left - 1 && r.right <= w.right + 1;
        });
        const page = document.querySelector('#win-etherscape .es-page');
        return {
            scroll: document.documentElement.scrollWidth,
            winRight: w.right,
            chrome: inside('#win-etherscape .es-tool, #win-etherscape .es-address, #win-etherscape .es-dir, #win-etherscape .es-throbber, #win-etherscape .es-status'),
            pageOverflow: page.scrollWidth - page.clientWidth,
            labels: getComputedStyle(document.querySelector('#win-etherscape .es-tool-label')).display,
        };
    });
    assert.ok(fit.scroll <= 390, `no horizontal page scroll (${fit.scroll})`);
    assert.ok(fit.winRight <= 390, 'the window fits');
    assert.equal(fit.chrome, true, 'every control is inside the window');
    assert.ok(fit.pageOverflow <= 1, `the page wraps (${fit.pageOverflow}px over)`);
    assert.equal(fit.labels, 'none', 'the toolbar drops its labels');
    await go(p3, 'news://celestial-times');
    assert.equal((await view(p3)).url, 'news://celestial-times');
    await clearToasts(p3);
    await p3.screenshot({ path: `${OUT}/reality-builds-390.png` });
    await p3.evaluate(() => EtherscapeView.navigate('cosmopedia://reality-builds'));
    await p3.waitForTimeout(650);
    await clearToasts(p3);
    await p3.screenshot({ path: `${OUT}/reality-builds-390.png` });
    step('at 390×844 the Navigator fits: no page scroll, every control inside the window, tables scroll in place');
    await phone.close();

    assert.deepEqual(errors, [], 'no console errors');
    step('no console errors');
    console.log(`\n${passed} passed\n`);
} finally {
    await browser.close();
    rmSync(tmp, { recursive: true, force: true });
}
