#!/usr/bin/env node
/**
 * Choir in a real browser.
 *
 *   COSMOS_TEST_URL=http://localhost:5203 node tests/choir-e2e.mjs
 *
 * tests/choir.mjs proves the events, the determinism and the hostile saves
 * headlessly. This is the part a player touches: the plaque appearing after
 * the first reboot with an unread count, the feed, blessing a post, opening
 * a thread, posting a canned status — and that a post arriving while the
 * window is open neither steals focus nor opens anything. At desktop and
 * phone widths; screenshots land in output/choir/ (gitignored).
 *
 * The reboot is a fixture — a real performPrestige over a run's worth of
 * Souls stated in bars — and everything after it is clicked.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/choir';
mkdirSync(OUT, { recursive: true });

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function scenario({ width, height, tag }) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    /* Presence through system.trackPresence's own listener. A real click
       would also move focus, and focus is one of the things under test. */
    const present = () => page.evaluate(() => document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));

    await page.evaluate(() => {
        localStorage.clear();
        ui.dismissSystemModal?.();
        system.closeApp('console');
        // Keep the Adversary scene and Incidents from opening over the test.
        State.adversary.contacted = true;
        State.adversary.sceneCompleted = true;
        game.incidentsEnabled = false;
    });
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('#icon-choir').isVisible(), false, 'no Choir before the first reboot');
    step(`[${tag}] locked before the first reboot`);

    /* ── Fixture: one real ship ── */
    const shipped = await page.evaluate(() => {
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
        game.performPrestige({ confirmed: true, certifyOn: 'creation' });
        ui.dismissSystemModal();
        return { level: State.prestigeLevel, version: State.reality.build.version };
    });
    assert.equal(shipped.level, 1, 'fixture check: the reboot happened');
    await present();
    const icon = page.locator('#icon-choir');
    await icon.waitFor({ state: 'visible', timeout: 4000 });
    const badge = icon.locator('.choir-badge');
    await badge.waitFor({ timeout: 4000 });
    const unread = Number(await badge.innerText());
    assert.ok(unread >= 4, `unread count on the plaque (${unread})`);
    assert.equal(await page.locator('#system-modal-layer .system-modal, #system-modal-layer > *').count(), 0, 'nothing opened');
    await page.evaluate(() => document.querySelectorAll('.document-notification, .achievement-toast').forEach((n) => n.remove()));
    await page.screenshot({ path: `${OUT}/desktop-badge-${tag}.png` });
    step(`[${tag}] the first reboot unlocks Choir with ${unread} unread`);

    /* ── The feed ── */
    await icon.click();
    const win = page.locator('#win-choir');
    await win.waitFor();
    const postsList = win.locator('.ch-post');
    await postsList.first().waitFor();
    // At least the count the plaque showed: achievements earned by the ship
    // can land on the board in the second between the badge and the click.
    assert.ok(await postsList.count() >= unread, 'every unread post is on the board');
    const news = win.locator('.ch-k-ship-news');
    assert.match(await news.innerText(), new RegExp(`v${shipped.version.replace(/\./g, '\\.')}`));
    assert.match(await news.innerText(), /Stable/);
    assert.match(await news.locator('.ch-name').first().innerText(), /The Celestial Times/);
    /* Etherscape is in the tree now, and installs by the first reboot: the
       board's addresses are live links, and one opens the browser on its
       own page. (Before the browser merged, these rendered as plain text.) */
    const links = win.locator('.ch-link');
    assert.ok(await links.count() >= 1, 'Etherscape is installed: addresses should be live links');
    const linkUrl = await links.first().getAttribute('data-url');
    assert.equal(await page.evaluate((u) => Etherscape.knows(u), linkUrl), true, `${linkUrl} is linked but Etherscape does not know it`);
    await links.first().click();
    await page.locator('#win-etherscape').waitFor({ timeout: 4000 });
    const opened = await page.evaluate(() => document.getElementById('es-address')?.value || '');
    assert.ok(String(opened).toLowerCase().includes(linkUrl.toLowerCase().replace(/\/+$/, '')), `clicked ${linkUrl}, Etherscape shows ${opened}`);
    await page.evaluate(() => system.closeApp('etherscape'));
    await win.click({ position: { x: 20, y: 12 } });
    assert.equal(await page.locator('#icon-choir .choir-badge').count(), 0, 'opening the board reads it');
    assert.equal(await win.locator('.ch-avatar.has-art').count(), 0, 'no avatar files: Vite\'s index.html is not an image');
    step(`[${tag}] the feed renders the release, the welcome and the reactions`);

    /* ── Bless ── */
    // Pinned by id: a post arriving at the top would otherwise become .first().
    const targetId = await postsList.filter({ has: page.locator('.ch-bless') }).first().getAttribute('data-id');
    const target = win.locator(`.ch-post[data-id="${targetId}"]`);
    const bless = target.locator('.ch-bless');
    const before = Number((await bless.locator('.ch-hal').innerText()).match(/\d+/)[0]);
    await bless.click();
    await page.waitForFunction(() => document.querySelector('#win-choir .ch-bless.is-blessed'));
    assert.equal(await bless.getAttribute('aria-pressed'), 'true');
    assert.equal(Number((await bless.locator('.ch-hal').innerText()).match(/\d+/)[0]), before + 1);
    assert.equal(await page.evaluate(() => State.choir.blessings), 1);
    step(`[${tag}] blessing a post adds a Hallelujah`);

    /* ── A thread ── */
    const toggle = win.locator('.ch-thread-toggle').first();
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    const replies = toggle.locator('xpath=ancestor::li[contains(@class,"ch-post")]').locator('.ch-replies');
    assert.equal(await replies.isVisible(), true);
    assert.ok(await replies.locator('.ch-reply').count() >= 2);
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    await page.screenshot({ path: `${OUT}/feed-thread-${tag}.png` });
    step(`[${tag}] a thread opens with its replies`);

    /* ── A post arriving while the window is open takes nothing ── */
    await bless.focus();
    /* Let the watch catch up with the achievements the ship and the
       blessing already earned. It posts a few per pass and watermarks the
       rest (ACH_PER_PASS), so an unlock that lands in the same pass as four
       others can be the one dropped — a race this test used to lose about
       half the time at 390px, where nothing above waits a second. */
    await page.waitForFunction(() => Object.entries(State.achievements || {})
        .filter(([, a]) => a && a.unlocked).every(([id]) => State.choir.wm.ach.includes(id)), null, { timeout: 4000 });
    const countBefore = await postsList.count();
    await page.evaluate(() => game.unlockAchievement('ACH-S-001'));
    await present();
    await page.waitForFunction(() => [...document.querySelectorAll('#win-choir .ch-post')]
        .some((p) => p.textContent.includes('I Can Fix Her')), null, { timeout: 4000 });
    assert.ok(await postsList.count() > countBefore);
    const focus = await page.evaluate(() => document.activeElement?.classList.contains('ch-bless'));
    assert.equal(focus, true, 'focus stayed on the Bless button');
    assert.equal(await replies.isVisible(), true, 'the open thread stayed open');
    assert.match(await win.locator('.ch-k-ach-secret').first().innerText(), /pip/);
    step(`[${tag}] a new post arrives without taking focus or closing a thread`);

    /* ── The canned status ── */
    await page.evaluate(() => document.querySelector('#win-choir .ch-scroll').scrollTo(0, 0));
    const compose = win.locator('.ch-compose');
    assert.equal(await compose.isVisible(), true, 'a status is offered after the ship');
    const options = compose.locator('.ch-option');
    assert.equal(await options.count(), 3);
    const chosen = (await options.nth(1).innerText()).trim();
    await page.screenshot({ path: `${OUT}/compose-${tag}.png` });
    await options.nth(1).click();
    await compose.waitFor({ state: 'hidden' });
    const mine = win.locator('.ch-post.is-player');
    await mine.waitFor();
    assert.equal((await mine.locator('.ch-text').innerText()).trim(), chosen);
    assert.match(await mine.locator('.ch-name').innerText(), /OPERATOR/);
    assert.equal(await mine.locator('.ch-bless').count(), 0, 'no blessing your own post');
    step(`[${tag}] a canned status posts as the Operator`);

    /* ── Fit ── */
    const fit = await page.evaluate(() => {
        const w = document.getElementById('win-choir').getBoundingClientRect();
        const scroll = document.querySelector('#win-choir .ch-scroll');
        return { right: w.right, left: w.left, vw: window.innerWidth, sw: scroll.scrollWidth, cw: scroll.clientWidth,
            page: document.documentElement.scrollWidth };
    });
    assert.ok(fit.left >= 0 && fit.right <= fit.vw + 1, `window inside the viewport (${fit.left}..${fit.right} of ${fit.vw})`);
    assert.ok(fit.sw <= fit.cw + 1, `no horizontal scroll in the feed (${fit.sw} > ${fit.cw})`);
    assert.ok(fit.page <= fit.vw + 1, 'no horizontal page scroll');
    await page.screenshot({ path: `${OUT}/feed-${tag}.png` });
    step(`[${tag}] fits ${width}px`);

    /* ── The Genesis entry carries the count while the board is closed ── */
    await page.evaluate(() => system.closeApp('choir'));
    await page.evaluate(() => game.unlockAchievement('ACH-S-003'));
    await present();
    await page.locator('#icon-choir .choir-badge').waitFor({ timeout: 4000 });
    await page.locator('#start-button').click();
    await page.locator('.start-menu-action[data-app="choir"] .choir-badge').waitFor({ timeout: 2000 });
    await page.locator('#start-button').click();
    step(`[${tag}] closed again, the plaque and the Genesis entry count new posts`);

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    step(`[${tag}] no console errors`);
    await context.close();
}

try {
    await scenario({ width: 1440, height: 900, tag: '1440' });
    await scenario({ width: 390, height: 844, tag: '390' });
} finally {
    await browser.close();
}
console.log(`\n${passed} passed`);
