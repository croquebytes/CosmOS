#!/usr/bin/env node
/**
 * The keyboard, the eyes and the inner ear — across the newer apps.
 *
 *   COSMOS_TEST_URL=http://localhost:5173 node tests/a11y-e2e.mjs
 *
 * Mail, Etherscape, Choir, Patience.exe, the Sacred Media Player, the
 * Incidents triage console (Task Manager), the Breakdown sheet and the
 * endings' act button:
 *
 *   1. Keyboard reach: Tab walks every app's controls in order, each one
 *      shows a focus ring, has a name, and a custom control has a role.
 *   2. Space: on a focused control it activates THAT control and is never
 *      also a Miracle (Choir's Bless used to fire one and stay unblessed).
 *      With focus on nothing in particular it is still the Miracle.
 *   3. Escape closes the right layer: an Etherscape menu, a Breakdown sheet,
 *      a system dialog (not the window behind it), the Genesis menu, the
 *      window the keyboard is in.
 *   4. ARIA: windows are labelled dialogs with named controls; Etherscape's
 *      menus are menu buttons, not a menubar of buttons.
 *   5. Contrast: computed against the painted pixels (tests/contrast-probe.mjs)
 *      — every text in every app meets WCAG AA, and the vellum's body text
 *      is written in --cos-ink / --cos-ink-dim.
 *   6. Reduced motion: nothing loops, toasts do not slide, the core and the
 *      globe hold still, the act button does not pulse.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { midGame, closeEverything } from './idle-probe.mjs';
import { measureContrast } from './contrast-probe.mjs';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };
const errors = [];

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

async function fixture(context) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await midGame(page);
    await page.evaluate(() => {
        game.notePresence(Date.now());
        for (let i = 0; i < 5; i++) Mail.tick({ seconds: 600 });
        for (let i = 0; i < 5; i++) Choir.observe(Date.now() + i);
        Incidents.file('choir_desync', { severity: 2, falseAlarm: false, sector: '3A' });
        Incidents.file('altar_overflow', { severity: 1, falseAlarm: false, sector: '9F' });
        // The SEV-1 dialog is tested on its own below; keep it off the windows.
        ui.dismissSystemModal();
    });
    await closeEverything(page);
    return page;
}

const openOnly = async (page, id) => {
    await closeEverything(page);
    await page.evaluate((a) => { ui.dismissSystemModal(); system.openApp(a); system.toggleMaximize(a, true); }, id);
    await page.locator(`#win-${id}`).waitFor();
    await page.waitForTimeout(250);
};
const clicks = (page) => page.evaluate(() => State.totalClicks);
const focusOn = (page, selector) => page.locator(selector).first().focus();

/* Tab from the window's own title-bar controls until focus leaves the window. */
async function tabWalk(page, id) {
    await page.locator(`#win-${id} .window-controls button`).first().focus();
    const stops = [];
    for (let i = 0; i < 80; i++) {
        const info = await page.evaluate((a) => {
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const inside = !!el.closest(`#win-${a}`);
            const cs = getComputedStyle(el);
            const snap = [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.borderColor, cs.color, cs.textDecorationLine].join('|');
            const name = (el.getAttribute('aria-label')
                || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent)
                || el.textContent || el.getAttribute('title') || el.value || '').trim();
            const native = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName);
            window.__tabStops = window.__tabStops || [];
            window.__tabStops.push({ el, snap });
            return { inside, name, native, role: el.getAttribute('role'), tag: el.tagName.toLowerCase(), cls: String(el.className).split(' ')[0], classes: String(el.className).split(/\s+/), visible: el.matches(':focus-visible') };
        }, id);
        if (!info || !info.inside) break;
        stops.push(info);
        await page.keyboard.press('Tab');
    }
    const ringed = await page.evaluate(() => {
        document.activeElement?.blur();
        const out = (window.__tabStops || []).map(({ el, snap }) => {
            const cs = getComputedStyle(el);
            return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.boxShadow, cs.backgroundColor, cs.borderColor, cs.color, cs.textDecorationLine].join('|') !== snap;
        });
        window.__tabStops = [];
        return out;
    });
    return stops.map((s, i) => ({ ...s, ringed: ringed[i] }));
}

try {
    console.log('\nAccessibility and keyboard (browser)\n');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await fixture(context);

    /* ── 1. Keyboard reach, rings, names, roles ───────────────────────── */
    const expect = {
        mail: ['button.ml-tool', 'button.ml-folder', 'div.ml-list', 'button.ml-reply'],
        etherscape: ['button.es-menu-btn', 'button.es-tool', 'input.es-address', 'button.es-dir', 'a.es-link'],
        choir: ['button.ch-option', 'button.ch-bless', 'button.ch-thread-toggle', 'a.ch-link'],
        solitaire: ['button.pt-btn', 'button.pt-stock'],
        mediaplayer: ['input.mp-vhs-toggle', 'button.mp-tape', 'button.mp-btn', 'input.mp-scrub'],
        taskmgr: ['button.incident-btn', 'button.btn-end-process'],
    };
    for (const [id, wants] of Object.entries(expect)) {
        await openOnly(page, id);
        const stops = await tabWalk(page, id);
        assert.ok(stops.length >= 5, `${id}: only ${stops.length} tab stops`);
        const present = await page.evaluate(({ a, ws }) => ws.filter((w) => document.querySelector(`#win-${a} ${w}:not([disabled])`)), { a: id, ws: wants });
        assert.ok(present.length >= Math.min(2, wants.length), `${id}: fixture check, controls missing: ${wants}`);
        for (const w of present) {
            const [tag, cls] = w.split('.');
            assert.ok(stops.some((s) => s.tag === tag && s.classes.includes(cls)),
                `${id}: Tab never reaches ${w} (reached ${[...new Set(stops.map((s) => `${s.tag}.${s.classes.join('.')}`))].join(', ')})`);
        }
        for (const s of stops) {
            assert.ok(s.ringed, `${id}: ${s.tag}.${s.cls} "${s.name.slice(0, 30)}" shows no focus ring`);
            assert.ok(s.visible, `${id}: ${s.tag}.${s.cls} focused by Tab is not :focus-visible`);
            assert.ok(s.name.length > 0, `${id}: ${s.tag}.${s.cls} has no accessible name`);
            assert.ok(s.native || s.role, `${id}: custom control ${s.tag}.${s.cls} has no role`);
        }
        step(`${id}: Tab reaches ${stops.length} controls in the window, each ringed, named and roled`);
    }

    /* The desktop plaques and the Breakdown readouts are on the tab path too. */
    await closeEverything(page);
    const plaque = await page.evaluate(() => { const el = document.getElementById('icon-mail'); return { tab: el.tabIndex, role: el.getAttribute('role') }; });
    assert.deepEqual(plaque, { tab: 0, role: 'button' });
    step('desktop plaques are buttons in the tab order');

    /* ── 2. Space activates the focused control, never also a Miracle ── */
    // Choir's Bless: the reported bug.
    await openOnly(page, 'choir');
    const bless = page.locator('#win-choir .ch-bless:not(.is-blessed)').first();
    const postId = await bless.evaluate((b) => b.closest('.ch-post').dataset.id);
    let before = { clicks: await clicks(page), given: await page.evaluate(() => State.choir.blessings) };
    await bless.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction((pid) => document.querySelector(`#win-choir .ch-post[data-id="${pid}"] .ch-bless`)?.getAttribute('aria-pressed') === 'true', postId, { timeout: 2000 });
    assert.equal(await page.evaluate(() => State.choir.blessings), before.given + 1, 'Space blessed the post');
    assert.equal(await clicks(page), before.clicks, 'Space on Bless also fired a Miracle');
    step('Choir: Space on a focused Bless blesses the post, and fires no Miracle');

    // Mail: a folder button.
    await openOnly(page, 'mail');
    before = await clicks(page);
    await focusOn(page, '#win-mail .ml-folder[data-folder="hr"]');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => MailView.state().folder), 'hr', 'Space opened the HR folder');
    // The message list is a listbox: Space there is its own (it scrolls), not a Miracle.
    await focusOn(page, '#win-mail .ml-list');
    await page.keyboard.press('Space');
    assert.equal(await clicks(page), before, 'Space in Mail fired a Miracle');
    step('Mail: Space on a folder opens it; Space in the list is the list\'s; no Miracle');

    // Etherscape: a directory button, and a dead link.
    await openOnly(page, 'etherscape');
    before = await clicks(page);
    await focusOn(page, '#win-etherscape .es-dir[data-href="news://celestial-times"]');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => EtherscapeView.state().url === 'news://celestial-times', null, { timeout: 4000 });
    await page.evaluate(() => EtherscapeView.navigate('cms://intranet'));
    await page.waitForTimeout(1200);
    const dead = page.locator('#win-etherscape .es-dead').first();
    if (await dead.count()) {
        await dead.focus();
        await page.keyboard.press('Space');
        assert.match(await page.locator('#win-etherscape .es-status-text').innerText(), /Link unavailable/);
    }
    assert.equal(await clicks(page), before, 'Space in Etherscape fired a Miracle');
    step('Etherscape: Space on a directory button navigates, on a dead link explains; no Miracle');

    // Patience: the Deal button deals; Space with nothing focused still draws.
    await openOnly(page, 'solitaire');
    before = await clicks(page);
    await page.evaluate(() => document.activeElement?.blur());
    const stock0 = await page.evaluate(() => PatienceApp.current().stock.length);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => PatienceApp.current().stock.length), stock0 - 1, 'Space with no focus draws');
    await focusOn(page, '#win-solitaire .pt-btn[data-pt="deal"]');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => PatienceApp.current().moves.length), 0, 'Space on Deal dealt a fresh spread');
    await focusOn(page, '#win-solitaire .pt-btn[data-pt="deal"]');
    const seed = await page.evaluate(() => PatienceApp.current().seed);
    await page.keyboard.press('Enter');
    assert.notEqual(await page.evaluate(() => PatienceApp.current().seed), seed, 'Enter on Deal dealt (it used to play a card)');
    assert.equal(await clicks(page), before, 'Space in Patience fired a Miracle');
    step('Patience: Space and Enter on Deal deal; Space with nothing focused still draws');

    // Media Player: a tape on the shelf loads that tape instead of toggling the current one.
    await openOnly(page, 'mediaplayer');
    before = await clicks(page);
    const current = await page.evaluate(() => MediaPlayerView.state().tape);
    const other = page.locator(`#win-mediaplayer .mp-tape[data-tape]:not([data-tape="${current}"]):not([disabled])`).first();
    const otherId = await other.getAttribute('data-tape');
    await other.focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => MediaPlayerView.state().tape), otherId, 'Space on a shelf tape loads it');
    await page.evaluate(() => MediaPlayerView.pause());
    assert.equal(await clicks(page), before, 'Space in the Media Player fired a Miracle');
    step('Media Player: Space on a shelf tape loads that tape; no Miracle');

    // Incidents: Defer from the keyboard.
    await openOnly(page, 'taskmgr');
    before = await clicks(page);
    const open0 = await page.evaluate(() => Incidents.state().open.length);
    await focusOn(page, '#win-taskmgr .incident-btn.is-debt');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => Incidents.state().open.length), open0 - 1, 'Space on Defer deferred the ticket');
    assert.equal(await clicks(page), before, 'Space in the triage console fired a Miracle');
    step('Incidents: Space on Defer defers the ticket; no Miracle');

    // A desktop plaque opens its app once, and is not also a Miracle.
    await closeEverything(page);
    before = await clicks(page);
    await focusOn(page, '#icon-choir');
    await page.keyboard.press('Space');
    await page.locator('#win-choir').waitFor();
    assert.equal(await clicks(page), before, 'Space on a plaque fired a Miracle too');
    // And with focus on nothing in particular, Space is still the Miracle.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Space');
    assert.equal(await clicks(page), before + 1, 'Space on the desktop is a Miracle');
    step('a plaque opens on Space without a Miracle; Space on the desktop is still one');

    /* ── 3. Escape closes the right layer ─────────────────────────────── */
    // An Etherscape menu, then the window.
    await openOnly(page, 'etherscape');
    await page.locator('#win-etherscape .es-menu-btn[data-menu="go"]').click();
    await page.locator('#win-etherscape .es-menu:not([hidden])').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('role')), 'menuitem', 'opening a menu focuses its first item');
    const firstItem = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press('ArrowDown');
    assert.notEqual(await page.evaluate(() => document.activeElement.textContent.trim()), firstItem, 'ArrowDown walks the menu');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#win-etherscape .es-menu:not([hidden])').count(), 0, 'Escape closed the menu');
    assert.equal(await page.locator('#win-etherscape').count(), 1, 'and only the menu');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.menu), 'go', 'focus is back on the menu button');
    step('Etherscape: arrows walk an open menu; Escape closes the menu, not the window');

    // A Breakdown sheet over the Engine.
    await openOnly(page, 'console');
    await page.locator('#val-praise').focus();
    await page.locator('#breakdown-panel:not([hidden])').waitFor();
    before = await clicks(page);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#breakdown-panel:not([hidden])').count(), 0, 'Escape closed the sheet');
    assert.equal(await page.locator('#win-console').count(), 1, 'the Engine stayed open');
    // Space on a Breakdown readout pins the sheet; it is not a Miracle.
    await page.locator('#val-souls').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => Breakdown.pinned), true, 'Space pinned the sheet');
    assert.equal(await clicks(page), before, 'Space on a readout fired a Miracle');
    await page.keyboard.press('Escape');
    step('Breakdown: Escape puts the sheet away and leaves the Engine; Space pins it');

    // A system dialog over open windows: Escape closes the dialog, not the window behind it.
    await openOnly(page, 'mail');
    await page.evaluate(() => ui.showOperatorBriefing(true));
    await page.locator('#system-modal-layer.active .operator-briefing').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => ui.isSystemModalOpen()), false, 'Escape closed the dialog');
    assert.equal(await page.locator('#win-mail').count(), 1, 'the window behind the dialog stayed open');
    // The SEV-1 alert too: Escape is its "Later".
    await page.evaluate(() => {
        const inc = Incidents.state().open.find((i) => i.severity === 1);
        ui.showIncidentAlert(Incidents.view(inc, Date.now()));
    });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => ui.isSystemModalOpen()), false);
    assert.equal(await page.locator('#win-mail').count(), 1);
    step('a system dialog closes on Escape by its own button; the window behind it stays');

    // The Genesis menu.
    await page.locator('#start-button').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('start-menu').hidden), true);
    assert.equal(await page.locator('#win-mail').count(), 1);
    step('Escape closes the Genesis menu before any window');

    // The window the keyboard is in, not merely the top one.
    await page.evaluate(() => { system.openApp('choir'); system.openApp('mail'); });
    assert.equal(await page.evaluate(() => system.getTopWindowId()), 'mail');
    await page.locator('#win-choir .ch-bless').first().focus();
    assert.equal(await page.evaluate(() => system.getTopWindowId()), 'choir', 'tabbing into a window raises it');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#win-choir').count(), 0, 'Escape closed the window with focus');
    assert.equal(await page.locator('#win-mail').count(), 1, 'and not the other one');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'icon-choir', 'focus went back to its plaque');
    step('Escape closes the window the keyboard is in, and focus returns to its plaque');

    /* ── 4. ARIA ──────────────────────────────────────────────────────── */
    await openOnly(page, 'etherscape');
    const aria = await page.evaluate(() => {
        const win = document.getElementById('win-etherscape');
        const label = document.getElementById(win.getAttribute('aria-labelledby'))?.textContent;
        const controls = [...win.querySelectorAll('.window-controls button')].map((b) => b.getAttribute('aria-label'));
        const menubar = win.querySelectorAll('[role="menubar"]').length;
        EtherscapeView.toggleMenu('go');
        const menu = win.querySelector('.es-menu:not([hidden])');
        const kids = [...menu.children].map((c) => c.getAttribute('role'));
        EtherscapeView.closeMenus();
        return { role: win.getAttribute('role'), label, controls, menubar, kids };
    });
    assert.equal(aria.role, 'dialog');
    assert.match(aria.label, /Etherscape/);
    assert.ok(aria.controls.every(Boolean), `unnamed window controls: ${aria.controls}`);
    assert.equal(aria.menubar, 0, 'a menubar must own menuitems; these are menu buttons');
    assert.ok(aria.kids.every((r) => ['menuitem', 'separator', 'presentation'].includes(r)), `invalid children of role=menu: ${aria.kids}`);
    await openOnly(page, 'mail');
    const listbox = await page.evaluate(() => {
        const list = document.querySelector('#win-mail .ml-list');
        const opts = [...list.querySelectorAll('[role="option"]')];
        return { role: list.getAttribute('role'), options: opts.length, selected: opts.filter((o) => o.getAttribute('aria-selected') === 'true').length,
            active: !!document.getElementById(list.getAttribute('aria-activedescendant') || '') };
    });
    assert.deepEqual({ role: listbox.role, selected: listbox.selected, active: listbox.active }, { role: 'listbox', selected: 1, active: true });
    step('windows are labelled dialogs with named controls; menus and the message list carry valid roles');

    /* ── 5. Contrast ──────────────────────────────────────────────────── */
    await page.evaluate(() => document.querySelectorAll('.achievement-toast, .achievement-overflow, .document-notification, .adversary-bark').forEach((t) => t.remove()));
    const surfaces = [
        ['mail', null], ['choir', null], ['solitaire', null], ['mediaplayer', null], ['taskmgr', null],
        ['etherscape', null], ['etherscape', 'news://celestial-times'], ['etherscape', 'sector://7g/status'], ['etherscape', 'void://forum'],
    ];
    let measured = 0;
    for (const [id, url] of surfaces) {
        await openOnly(page, id);
        if (url) { await page.evaluate((u) => EtherscapeView.navigate(u), url); await page.waitForTimeout(1300); }
        const rows = await measureContrast(page, `#win-${id}`);
        measured += rows.length;
        const bad = rows.filter((r) => r.ratio < r.need).map((r) => `${r.sel} "${r.text}" ${r.ratio}:1 (rgb ${r.color} on rgb ${r.bg})`);
        assert.ok(rows.length >= 10, `${id}: measured only ${rows.length} texts`);
        assert.deepEqual(bad, [], `${id}${url ? ` ${url}` : ''}: below WCAG AA`);
    }
    // The Breakdown sheet, once its fade has landed.
    await openOnly(page, 'console');
    await page.locator('#val-praise').focus();
    await page.locator('#breakdown-panel:not([hidden])').waitFor();
    await page.waitForTimeout(600);
    const sheet = await measureContrast(page, '#breakdown-panel');
    assert.deepEqual(sheet.filter((r) => r.ratio < r.need).map((r) => `${r.sel} "${r.text}" ${r.ratio}`), [], 'Breakdown sheet below AA');
    measured += sheet.length;
    await page.keyboard.press('Escape');
    // The SEV-1 dialog.
    await closeEverything(page);
    await page.evaluate(() => { const inc = Incidents.state().open.find((i) => i.severity === 1); ui.showIncidentAlert(Incidents.view(inc, Date.now())); });
    const alert = await measureContrast(page, '#system-modal-layer .incident-alert');
    assert.deepEqual(alert.filter((r) => r.ratio < r.need).map((r) => `${r.sel} "${r.text}" ${r.ratio}`), [], 'SEV-1 dialog below AA');
    measured += alert.length;
    await page.evaluate(() => ui.dismissSystemModal());

    // Body text on the vellum is written in the ink tokens.
    await openOnly(page, 'choir');
    const inks = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement('i');
        document.body.appendChild(probe);
        const resolve = (v) => { probe.style.color = v; return getComputedStyle(probe).color; };
        const ink = [resolve('var(--cos-ink)'), resolve('var(--cos-ink-dim)')];
        probe.remove();
        const color = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null; };
        return { ink, root: root.getPropertyValue('--cos-ink').trim(), samples: {
            'choir post': color('#win-choir .ch-text'), 'choir meta': color('#win-choir .ch-meta'), 'choir status bar': color('#win-choir .ch-status'),
        } };
    });
    await openOnly(page, 'mail');
    Object.assign(inks.samples, await page.evaluate(() => {
        const color = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null; };
        return { 'mail row': color('#win-mail .ml-row:not(.is-selected) .ml-subject'), 'mail body': color('#win-mail .ml-reader p'), 'mail status bar': color('#win-mail .ml-status') };
    }));
    await openOnly(page, 'taskmgr');
    Object.assign(inks.samples, await page.evaluate(() => {
        const color = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el).color : null; };
        return { 'incident description': color('#win-taskmgr .incident-desc'), 'incident process': color('#win-taskmgr .incident-process'), 'idle process': color('#win-taskmgr .status-idle') };
    }));
    for (const [what, c] of Object.entries(inks.samples)) {
        assert.ok(c, `${what}: not found`);
        assert.ok(inks.ink.includes(c), `${what} is ${c}, not --cos-ink/--cos-ink-dim (${inks.ink.join(' / ')})`);
    }
    step(`contrast: ${measured} texts across the apps, the sheet and the SEV-1 dialog meet AA; vellum body text is ink`);

    await context.close();

    /* ── 6. Reduced motion ────────────────────────────────────────────── */
    const still = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const rm = await fixture(still);
    await rm.evaluate(() => {
        for (const id of ['console', 'divineglobe', 'mail', 'etherscape', 'choir', 'solitaire', 'mediaplayer', 'taskmgr']) system.openApp(id);
        const vhs = document.querySelector('#win-mediaplayer .mp-vhs-toggle');
        if (vhs && !vhs.checked) vhs.click();
        EtherscapeView.navigate('news://celestial-times');   // the throbber turns while a page loads
        game.unlockAchievement('ACH-S-001');                  // a toast slides in
        game.manualPraise(null);                              // the core is struck
    });
    await rm.waitForTimeout(150);
    const running = () => rm.evaluate(() => document.getAnimations()
        .filter((a) => a.playState === 'running')
        .map((a) => ({ a, t: a.effect?.getComputedTiming?.() || {} }))
        .filter(({ t }) => t.iterations === Infinity || t.duration > 1)
        .map(({ a }) => `${a.animationName || a.transitionProperty} on ${a.effect?.target?.className}`));
    assert.deepEqual(await running(), [], 'something still moves under reduced motion');
    const toast = await rm.evaluate(() => {
        const t = document.querySelector('.achievement-toast');
        return t ? parseFloat(getComputedStyle(t).transitionDuration) : null;
    });
    assert.ok(toast !== null && toast <= 0.001, `a toast slides for ${toast}s under reduced motion`);
    const vhsPicture = await rm.evaluate(() => {
        const el = document.querySelector('#win-mediaplayer .mp.is-vhs .mp-picture');
        return el ? getComputedStyle(el).animationName : 'absent';
    });
    assert.ok(vhsPicture === 'none' || vhsPicture === 'absent', `the VHS wobble runs (${vhsPicture})`);
    const canvases = await rm.evaluate(async () => {
        const core = ui.getCoreView('core-canvas');
        const a = { pulse: core?.pulse, globe: ui.globeRotation, bursts: core?.bursts.length };
        await new Promise((r) => setTimeout(r, 700));
        return { before: a, after: { pulse: core?.pulse, globe: ui.globeRotation, bursts: core?.bursts.length } };
    });
    assert.equal(canvases.after.pulse, canvases.before.pulse, 'the core breathes under reduced motion');
    assert.equal(canvases.after.globe, canvases.before.globe, 'the globe turns under reduced motion');
    assert.equal(canvases.before.bursts, 0, 'a strike throws bursts under reduced motion');
    await rm.waitForTimeout(1200);
    assert.deepEqual(await running(), [], 'something started moving later');
    step('reduced motion: nothing loops, toasts and the VHS stand still, the core and the globe hold');
    await still.close();

    /* ── 7. The endings' act button ───────────────────────────────────── */
    for (const motion of ['reduce', 'no-preference']) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: motion });
        const p = await ctx.newPage();
        p.on('pageerror', (e) => errors.push(String(e)));
        await p.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
        await p.getByRole('button', { name: 'Perform Miracle' }).waitFor();
        await p.evaluate(() => {
            localStorage.clear();
            ui.dismissSystemModal?.();
            system.closeApp('console');
            game.incidentsEnabled = false;
            game.resolveAdversaryChoice('OP-B');
            const ship = () => {
                State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
                game.performPrestige({ confirmed: true, certifyOn: 'creation' });
                ui.dismissSystemModal();
            };
            while (State.prestigeLevel < 12) ship();
            game.selectArchivedBuild(5);
            ship();
            game.setBuildChannel('stable');
            ship();
            State.runtime.startTime = Date.now() - 2 * 24 * 3600 * 1000;
            State.adversary.standing = 0;
        });
        const act = p.locator('.fin-act:not(.is-done)');
        await act.waitFor({ timeout: 6000 });
        await p.waitForTimeout(400);
        const look = await act.evaluate((b) => ({ anim: getComputedStyle(b).animationName, focused: document.activeElement === b, name: b.textContent.trim() }));
        assert.ok(look.focused, 'the act button takes focus when it appears');
        assert.ok(look.name.length > 0);
        if (motion === 'reduce') {
            assert.equal(look.anim, 'none', 'the act button pulses under reduced motion');
            const c = await measureContrast(p, '.fin-scene', { only: '.fin-act, .adv-text, .adv-hint' });
            assert.deepEqual(c.filter((r) => r.ratio < r.need).map((r) => `${r.sel} "${r.text}" ${r.ratio}`), [], 'finale text below AA');
            // Escape never performs it.
            await p.keyboard.press('Escape');
            assert.equal(await p.locator('.fin-act.is-done').count(), 0, 'Escape performed the act');
            await act.focus();
            const before2 = await p.evaluate(() => State.totalClicks);
            await p.keyboard.press('Space');
            await p.locator('.fin-act.is-done').waitFor({ timeout: 3000 });
            assert.equal(await p.evaluate(() => State.totalClicks), before2, 'Space on the act fired a Miracle');
            step('endings: the act button takes focus, is legible, holds still under reduced motion; Space performs it, Escape does not');
        } else {
            assert.notEqual(look.anim, 'none', 'fixture check: the act button pulses when motion is allowed');
        }
        await ctx.close();
    }

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    step('no console errors');
    console.log(`\n${passed} passed\n`);
} catch (err) {
    console.error(err);
    process.exitCode = 1;
} finally {
    await browser.close();
}
