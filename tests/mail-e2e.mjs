#!/usr/bin/env node
/**
 * CMS Mail in a real browser.
 *
 *   COSMOS_TEST_URL=http://localhost:5201 node tests/mail-e2e.mjs
 *
 * tests/mail.mjs proves the table, the triggers and the save. This proves
 * the page: HR's welcome lands after the first directive without opening or
 * focusing anything; the tray shows it; the client opens on it, reads it,
 * answers it, files the answer to Sent; an attachment opens the Notepad on
 * its document and a tape opens the Sacred Media Player on its tape; the
 * keyboard moves, opens and archives; mail waits while the player is away;
 * the window fits a 390px phone; and nothing logs an error.
 *
 * Screenshots land in output/mail/ (gitignored).
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/mail';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
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

// Toasts and the screen pulse from the setup purchases are not what the screenshots are of.
const clearToasts = async (page) => {
    await page.waitForTimeout(700);
    await page.evaluate(() => document.querySelectorAll('.achievement-toast, .achievement-overflow, .document-notification').forEach((t) => t.remove()));
};
const mailIds = (page) => page.evaluate(() => State.mail.log.map((r) => r.id));

/* The first directive, the way a player claims it. */
async function firstDirective(page) {
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: 'Perform Miracle' }).click();
    await page.getByRole('button', { name: 'Claim Reward' }).click();
}

/* More mail, through the same state the game writes, and a watch tick. */
async function moreMail(page) {
    await page.evaluate(() => {
        State.resources.praise = 1e6;
        game.buyAutomator('seraph');
        State.resources.offerings = 1e6;
        game.buyAutomator('cherub');
        State.resources.praise = 1e6;
        game.purchaseUpgrade('offering_unlock');
        game.notePresence(Date.now());
        Mail.tick({ seconds: 1 });
    });
}

try {
    console.log('\nCMS Mail (browser)\n');

    /* ── 1. The first mail never interrupts ────────────────────────────── */
    const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // One message gets a picture, served at the drop-in path; the rest have none.
    await desk.route('**/assets/mail/hr-welcome-prev.webp', (route) => route.fulfill({
        status: 200, contentType: 'image/png', body: readFileSync('assets/core/core_void_256.png'),
    }));
    const page = await freshTestPage(desk);

    assert.equal(await page.locator('#icon-mail').isVisible(), false, 'no Mail icon before the first mail');
    assert.equal(await page.locator('#tray-mail').isVisible(), false, 'no tray envelope before the first mail');
    await firstDirective(page);
    await page.waitForFunction(() => State.mail.log.some((r) => r.id === 'hr-welcome'), null, { timeout: 4000 });
    await page.locator('#icon-mail').waitFor({ state: 'visible', timeout: 3000 });
    const arrival = await page.evaluate(() => ({
        windows: Object.keys(system.windows),
        modal: ui.isSystemModalOpen(),
        focusInMail: !!document.activeElement?.closest?.('#win-mail'),
        tray: document.getElementById('tray-mail').getAttribute('aria-label'),
        count: document.querySelector('#tray-mail .tray-mail-count').textContent,
        log: document.getElementById('engine-log').innerText,
        apps: State.unlockedApps.slice(),
    }));
    assert.deepEqual(arrival.windows, ['console'], 'no window opened');
    assert.equal(arrival.modal, false, 'no dialog');
    assert.equal(arrival.focusInMail, false, 'focus not taken');
    assert.equal(arrival.tray, 'CMS Mail: 1 unread');
    assert.equal(arrival.count, '1');
    assert.match(arrival.log, /\[MAIL\] New message from CMS Human Resources: “Welcome to Sector 7G”/);
    assert.ok(arrival.apps.includes('mail'));
    await page.evaluate(() => system.toggleStartMenu(true));
    assert.ok(await page.locator('#start-menu-apps').getByText('CMS Mail').isVisible(), 'a Genesis menu entry');
    await page.evaluate(() => system.toggleStartMenu(false));
    step("HR's welcome lands after the first directive: icon, tray count, Genesis entry, log line; no window, no focus taken");

    /* ── 2. Open, read ─────────────────────────────────────────────────── */
    await clearToasts(page);
    await page.locator('#tray-mail').click();
    await page.locator('#win-mail .ml-row').first().waitFor();
    const opened = await page.evaluate(() => ({
        view: MailView.state(),
        subject: document.querySelector('#win-mail .ml-head-subject')?.textContent,
        read: State.mail.log.find((r) => r.id === 'hr-welcome').read,
        tray: document.getElementById('tray-mail').classList.contains('is-unread'),
    }));
    assert.equal(opened.view.folder, 'hr', 'opens on the folder with the news');
    assert.equal(opened.subject, 'Welcome to Sector 7G');
    assert.equal(opened.read, true, 'shown in the reading pane is read');
    assert.equal(opened.tray, false, 'the tray count clears');
    await page.screenshot({ path: `${OUT}/desk-welcome.png` });
    step('the tray envelope opens the client on HR, the welcome is shown and marked read, the badge clears');

    /* ── 3. Reply, Sent, follow-up ─────────────────────────────────────── */
    await page.locator('#win-mail .ml-reply', { hasText: 'Who was the previous Operator?' }).click();
    await page.locator('#win-mail .ml-replies.is-done').waitFor();
    await page.locator('#win-mail .ml-folder[data-folder="sent"]').click();
    const sent = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('#win-mail .ml-row .ml-subject')].map((e) => e.textContent),
        body: document.querySelector('#win-mail .ml-text p')?.textContent,
    }));
    assert.deepEqual(sent.rows, ['Re: Welcome to Sector 7G']);
    assert.match(sent.body, /who had this job before me/);
    // Forty attended seconds later, HR answers.
    await page.evaluate(() => { game.notePresence(Date.now()); Mail.tick({ seconds: 40 }); });
    assert.ok((await mailIds(page)).includes('hr-welcome-prev'), 'the follow-up arrived');
    step('a canned reply files to Sent and releases its follow-up after its delay');

    /* ── 4. Attachments: Notepad and the Media Player ──────────────────── */
    await page.locator('#win-mail .ml-folder[data-folder="hr"]').click();
    await page.evaluate(() => MailView.select('hr-welcome', { open: true }));
    const docTitle = await page.evaluate(() => DocumentManifest.find((d) => d.id === 'DOC-NEW-06').title);
    await page.locator('#win-mail .ml-attach--doc[data-doc="DOC-NEW-06"]').click();
    await page.locator('#win-notepad').waitFor();
    await page.waitForFunction((t) => document.getElementById('document-title')?.textContent === t, docTitle, { timeout: 4000 });
    await page.waitForFunction(() => !document.querySelector('#document-content .loading'), null, { timeout: 4000 });
    assert.equal(await page.locator('#document-content .error').count(), 0, 'the document loaded');
    step('a document attachment opens Recovered Documents on that document');

    await page.evaluate(() => system.focusWindow('mail'));
    await page.locator('#win-mail .ml-attach--tape[data-tape="t1"]').click();
    await page.locator('#win-mediaplayer').waitFor();
    assert.equal(await page.evaluate(() => MediaPlayerView.state().tape), 't1');
    await page.evaluate(() => system.closeApp('mediaplayer'));
    await page.evaluate(() => system.closeApp('notepad'));
    step('a tape attachment opens the Sacred Media Player on that tape');

    /* ── 4b. The image slot: assets/mail/<id>.webp, shown only if present ─ */
    assert.equal(await page.locator('#win-mail .ml-figure').count(), 0, 'no picture for a message without one');
    await page.evaluate(() => MailView.select('hr-welcome-prev', { open: true }));
    await page.locator('#win-mail .ml-figure img').waitFor({ timeout: 4000 });
    assert.equal(await page.locator('#win-mail .ml-figure img').getAttribute('src'), 'assets/mail/hr-welcome-prev.webp');
    await page.evaluate(() => MailView.select('hr-welcome', { open: true }));
    step('a picture dropped in at assets/mail/<message id>.webp appears in its message; a missing one is never drawn');

    /* ── 5. Cross-links, against the real browser ──────────────────────
       Before Etherscape is installed (it arrives with the first Seraph) an
       address is plain text; once installed it is a live link, and clicking
       it opens the real Etherscape window on that page. (This step used to
       stub a fake Etherscape on window; the real one is a top-level const
       now, which a window property cannot shadow.) */
    assert.equal(await page.evaluate(() => Etherscape.knows('cms://intranet')), false, 'fixture: Etherscape not installed yet');
    assert.equal(await page.locator('#win-mail .ml-text .ml-link').count(), 0, 'no links before Etherscape is installed');
    assert.equal(await page.locator('#win-mail .ml-text .ml-url', { hasText: 'cms://intranet' }).count(), 1);
    await page.evaluate(() => { game.applyAutomatonPurchase('seraph', 1); });
    await page.waitForFunction(() => Etherscape.knows('cms://intranet'), null, { timeout: 4000 });
    await page.evaluate(() => { MailView.render(); MailView.select('hr-welcome', { open: true }); });
    await page.locator('#win-mail .ml-text .ml-link', { hasText: 'cms://intranet' }).click();
    await page.locator('#win-etherscape').waitFor({ timeout: 4000 });
    assert.equal(await page.evaluate(() => document.getElementById('es-address')?.value), 'cms://intranet');
    await page.evaluate(() => { system.closeApp('etherscape'); system.focusWindow('mail'); });
    step('a cms:// address is plain text before Etherscape installs, and a live link that opens it after');

    /* ── 6. Keyboard: move, open, archive ──────────────────────────────── */
    await moreMail(page);
    await page.locator('#win-mail .ml-folder[data-folder="inbox"]').click();
    await page.locator('#win-mail .ml-list').focus();
    const before = await page.evaluate(() => MailView.state().selected);
    await page.keyboard.press('ArrowDown');
    const moved = await page.evaluate(() => MailView.state().selected);
    assert.notEqual(moved, before, 'ArrowDown moves the selection');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(() => MailView.state().selected), before, 'ArrowUp moves it back');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    const openedKey = await page.evaluate(() => MailView.state().selected);
    assert.equal(await page.evaluate((k) => State.mail.log.find((r) => r.id === k).read, openedKey), true, 'Enter opens and reads');
    const praiseBefore = await page.evaluate(() => State.totalClicks);
    await page.locator('#win-mail .ml-list').focus();
    await page.keyboard.press('Delete');
    const archived = await page.evaluate((k) => ({
        folder: MailLogic.folderOf(State.mail.log.find((r) => r.id === k)),
        inInbox: MailLogic.list(State.mail, 'inbox').some((r) => r.id === k),
        clicks: State.totalClicks,
    }), openedKey);
    assert.equal(archived.folder, 'archive', 'Delete files it to Archive');
    assert.equal(archived.inInbox, false);
    assert.equal(archived.clicks, praiseBefore, 'no key fired a Miracle');
    await clearToasts(page);
    await page.screenshot({ path: `${OUT}/desk-inbox.png` });
    step('arrows move, Enter opens, Delete archives, and none of them reach the desktop shortcuts');

    /* ── 7. Away: nothing arrives; the backlog lands on return ─────────── */
    await page.evaluate(() => { game.lastInputAt = 0; });
    await page.evaluate(() => {
        State.resources.souls = 1e6;
        game.purchaseUpgrade('void_unlock'); // prayer-02 and prev-02 come due
    });
    await page.waitForTimeout(2300);
    const whileAway = await mailIds(page);
    assert.ok(!whileAway.includes('prayer-02'), 'nothing arrived while away');
    await page.mouse.move(700, 450);
    await page.mouse.move(720, 470);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => State.mail.log.some((r) => r.id === 'prayer-02'), null, { timeout: 4000 });
    const backLog = await page.evaluate(() => document.getElementById('engine-log').innerText);
    assert.match(backLog, /messages arrived while you were away/);
    step('mail waits while the player is away and lands as one batch on return');

    /* ── 8. Never over a dialog ────────────────────────────────────────── */
    await page.evaluate(() => {
        game.notePresence(Date.now());
        ui.showOperatorBriefing(true);
        State.automatons.seraphCount = Math.max(1, State.automatons.seraphCount);
        Incidents.file('choir_desync');
    });
    await page.waitForTimeout(2300);
    assert.ok(!(await mailIds(page)).includes('hr-incident'), 'held behind the dialog');
    await page.evaluate(() => { ui.dismissSystemModal(); game.notePresence(Date.now()); });
    await page.waitForFunction(() => State.mail.log.some((r) => r.id === 'hr-incident'), null, { timeout: 4000 });
    step('a system dialog holds delivery until it closes');

    /* ── 9. A 390px phone ──────────────────────────────────────────────── */
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await freshTestPage(phone);
    await firstDirective(p2);
    await p2.waitForFunction(() => State.mail.log.length > 0, null, { timeout: 4000 });
    await moreMail(p2);
    await clearToasts(p2);
    await p2.evaluate(() => { system.closeApp('console'); system.openApp('mail'); });
    await p2.locator('#win-mail .ml-row').first().waitFor();
    const fit = await p2.evaluate(() => {
        const win = document.getElementById('win-mail').getBoundingClientRect();
        const ml = document.querySelector('#win-mail .ml');
        return {
            narrow: MailView.state().narrow,
            right: win.right, width: window.innerWidth,
            overflow: ml.scrollWidth - ml.clientWidth,
            page: document.documentElement.scrollWidth - window.innerWidth,
            readerShown: getComputedStyle(document.querySelector('#win-mail .ml-reader')).display !== 'none',
            folders: [...document.querySelectorAll('#win-mail .ml-folder')].map((b) => b.getBoundingClientRect().right <= win.right + 1),
        };
    });
    assert.equal(fit.narrow, true);
    assert.ok(fit.right <= fit.width + 1, `the window fits (${fit.right} > ${fit.width})`);
    assert.ok(fit.overflow <= 1, `no sideways overflow in the client (${fit.overflow}px)`);
    assert.ok(fit.page <= 1, 'no sideways page scroll');
    assert.equal(fit.readerShown, false, 'the list first');
    assert.ok(fit.folders.every(Boolean), 'all five folders fit across');
    await p2.screenshot({ path: `${OUT}/phone-list.png` });
    await p2.locator('#win-mail .ml-row').first().click();
    await p2.locator('#win-mail .ml-reader').waitFor({ state: 'visible' });
    const reading = await p2.evaluate(() => {
        const reader = document.querySelector('#win-mail .ml-reader');
        return { list: getComputedStyle(document.querySelector('#win-mail .ml-listwrap')).display, overflow: reader.scrollWidth - reader.clientWidth };
    });
    assert.equal(reading.list, 'none', 'reading replaces the list');
    assert.ok(reading.overflow <= 1, `the message wraps (${reading.overflow}px)`);
    await p2.screenshot({ path: `${OUT}/phone-reading.png` });
    await p2.locator('#win-mail .ml-back').click();
    await p2.locator('#win-mail .ml-listwrap').waitFor({ state: 'visible' });
    step('at 390px the folders lie across the top, a message opens full-width, and Back returns to the list');

    // A reading-pane screenshot on the desktop, for the record.
    await page.evaluate(() => { MailView.setFolder('inbox'); });
    await clearToasts(page);
    await page.screenshot({ path: `${OUT}/desk-reading.png` });

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    step('no console errors');

    console.log(`\n${passed} passed. Screenshots in ${OUT}/.`);
} catch (err) {
    console.log(`  FAIL  ${err.message.split('\n')[0]}`);
    if (errors.length) console.log(`        console: ${errors.join(' | ')}`);
    process.exitCode = 1;
} finally {
    await browser.close();
}
