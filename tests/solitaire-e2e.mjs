#!/usr/bin/env node
/**
 * Patience.exe in a real browser.
 *
 *   COSMOS_TEST_URL=http://127.0.0.1:5194 node tests/solitaire-e2e.mjs
 *
 * The unit suite (tests/solitaire.mjs) proves the rules and the ledger. What
 * it cannot see is the part that was actually broken: the shop item was
 * unbuyable because its tab threw, and the app it unlocked did not exist.
 * So this buys it through the shop UI, opens it from the desktop, plays by
 * mouse and by keyboard, and reloads to check it is still there.
 *
 * Screenshots land in output/solitaire/ (gitignored).
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173';
const OUT = 'output/solitaire';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const moves = () => page.evaluate(() => PatienceApp.current()?.moves.length ?? -1);
let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

try {
    console.log('\nPatience.exe (browser)\n');
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.evaluate(() => {
        ui.dismissSystemModal?.();
        system.closeApp('console');
        State.adoration = 650;
        if (!State.unlockedApps.includes('adorationshop')) State.unlockedApps.push('adorationshop');
        ui.updateDesktopIcons();
    });

    /* ── Buy it through the shop ── */
    assert.equal(await page.locator('#icon-solitaire').isVisible(), false, 'icon hidden before purchase');
    await page.locator('#icon-adorationshop').click();
    await page.getByRole('button', { name: 'Mini-Games' }).click();
    const item = page.locator('.shop-item', { hasText: 'Patience.exe' });
    await item.waitFor();
    assert.match(await item.innerText(), /Golf solitaire/, 'shop item describes what it now does');
    await item.click();
    const bought = await page.evaluate(() => ({
        adoration: State.adoration, apps: State.unlockedApps.slice(),
        ledger: State.adorationShop.minigames.minigame_solitaire,
    }));
    assert.equal(bought.adoration, 150, 'purchase cost 500 Adoration');
    assert.ok(bought.apps.includes('solitaire'), 'purchase unlocks the app');
    assert.equal(bought.ledger, true, 'purchase recorded under the category the shop reads');
    assert.match(await item.innerText(), /PURCHASED/);
    await page.locator('#icon-solitaire').waitFor({ state: 'visible', timeout: 2500 });
    step('bought through the Mini-Games tab; desktop icon appears');

    await page.evaluate(() => system.closeApp('adorationshop'));
    await page.locator('#start-button').click();
    await page.locator('#start-menu-apps', { hasText: 'Patience.exe' }).waitFor();
    await page.locator('#start-menu-apps button', { hasText: 'Patience.exe' }).click();
    await page.locator('#win-solitaire').waitFor();
    step('opens from the Genesis menu');

    /* ── Pin a deal so the run is reproducible ── */
    await page.evaluate(() => { PatienceApp.deal(20260930); PatienceView.banner = null; PatienceView.render(); });
    assert.equal(await page.locator('#win-solitaire .pt-column').count(), 7);
    assert.equal(await page.locator('#win-solitaire button.pt-card').count(), 7, 'seven exposed cards');

    /* ── Mouse ── */
    let before = await moves();
    for (let i = 0; i < 6; i++) {
        const playable = page.locator('#win-solitaire button.pt-card.is-playable');
        if (await playable.count()) await playable.first().click();
        else await page.locator('#win-solitaire .pt-stock').click();
    }
    assert.equal(await moves(), before + 6, 'six mouse actions, six moves');
    step('plays and draws by mouse');

    /* ── Keyboard: Space draws and must NOT fire a Miracle behind the table ── */
    const clicks = await page.evaluate(() => State.totalClicks);
    before = await moves();
    const stockBefore = await page.evaluate(() => PatienceApp.current().stock.length);
    await page.keyboard.press('Space');
    assert.equal(await moves(), before + 1, 'Space draws');
    assert.equal(await page.evaluate(() => PatienceApp.current().stock.length), stockBefore - 1);
    assert.equal(await page.evaluate(() => State.totalClicks), clicks, 'Space did not perform a Miracle');

    // Arrow to a legal column, then Enter.
    const target = await page.evaluate(() => PatienceRules.legalPlays(PatienceApp.current())[0] ?? null);
    if (target === null) {
        await page.keyboard.press('Space');
    } else {
        for (let guard = 0; guard < 8; guard++) {
            if (await page.evaluate(() => PatienceView.selected) === target) break;
            await page.keyboard.press('ArrowRight');
        }
        assert.equal(await page.evaluate(() => PatienceView.selected), target, 'arrows reach the column');
        assert.equal(await page.locator(`#win-solitaire .pt-column[data-col="${target}"] .pt-card.is-selected`).count(), 1,
            'selection is drawn');
        before = await moves();
        await page.keyboard.press('Enter');
        assert.equal(await moves(), before + 1, 'Enter plays the selected card');
        assert.equal(await page.evaluate(() => PatienceApp.current().moves.at(-1)), `p${target}`);
    }
    step('arrows select, Enter plays, Space draws');

    /* ── Divine Mulligan: undo, paid in Praise ── */
    await page.evaluate(() => { State.resources.praise = State.resourceCaps.praise; PatienceView.renderControls(); });
    const cap = await page.evaluate(() => State.resourceCaps.praise);
    before = await moves();
    await page.locator('#win-solitaire [data-pt="undo"]').click();
    assert.equal(await moves(), before - 1, 'undo withdrew one move');
    assert.equal(await page.evaluate(() => State.resources.praise), cap - Math.ceil(cap * 0.05), 'cost 5% of the cap');
    assert.equal(await page.locator('#win-solitaire [data-pt="undo"]').isDisabled(), true, 'once per round');
    step('Mulligan undo charges 5% of the Praise cap, once');

    await page.screenshot({ path: `${OUT}/patience-1440.png` });

    /* ── A winning finish, for the flourish ── */
    const win = await page.evaluate(() => {
        // Find a deal a lookahead player clears, and play it to one move short.
        const best = (s, d = 0) => {
            let bl = 0, bc = -1;
            for (const c of PatienceRules.legalPlays(s)) {
                const l = 1 + (d < 10 ? best(PatienceRules.play(s, c), d + 1).len : 0);
                if (l > bl) { bl = l; bc = c; }
            }
            return { len: bl, col: bc };
        };
        for (let seed = 1; seed < 4000; seed++) {
            let s = PatienceRules.deal(seed);
            while (!PatienceRules.isOver(s)) {
                s = PatienceRules.legalPlays(s).length ? PatienceRules.play(s, best(s).col) : PatienceRules.draw(s);
            }
            if (!PatienceRules.isWon(s)) continue;
            PatienceApp.deal(seed);
            for (const m of s.moves.slice(0, -1)) PatienceApp.act(m);
            PatienceView.banner = null;
            PatienceView.render();
            return { seed, last: Number(s.moves.at(-1).slice(1)) };
        }
        return null;
    });
    assert.ok(win, 'found a winnable deal');
    const roundsBefore = await page.evaluate(() => State.casino.solitaire.rounds);
    await page.locator(`#win-solitaire .pt-column[data-col="${win.last}"] button.pt-card`).click();
    await page.locator('#win-solitaire .pt-banner.is-won').waitFor();
    assert.match(await page.locator('#win-solitaire .pt-banner').innerText(), /cleared/i);
    assert.equal(await page.evaluate(() => State.casino.solitaire.rounds), roundsBefore + 1);
    assert.ok(await page.evaluate(() => State.casino.solitaire.wins) >= 1);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/patience-win-1440.png` });
    step(`clearing the spread (seed ${win.seed}) settles and shows the flourish`);

    /* ── Phone width ── */
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { PatienceApp.deal(20260930); PatienceView.banner = null; PatienceView.render(); });
    await page.waitForTimeout(150);
    const fit = await page.evaluate(() => {
        const t = document.querySelector('#win-solitaire .pt-tableau').getBoundingClientRect();
        const w = document.querySelector('#win-solitaire').getBoundingClientRect();
        const felt = document.querySelector('#win-solitaire .pt-felt');
        return {
            pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
            tableauInside: t.left >= w.left && t.right <= w.right,
            feltScrollsSideways: felt.scrollWidth > felt.clientWidth + 1,
            cardWidth: document.querySelector('#win-solitaire button.pt-card').getBoundingClientRect().width,
        };
    });
    assert.equal(fit.pageOverflow, false, 'no horizontal page scroll at 390');
    assert.equal(fit.tableauInside, true, 'tableau fits the window at 390');
    assert.equal(fit.feltScrollsSideways, false, 'the table does not scroll sideways at 390');
    assert.ok(fit.cardWidth >= 36, `cards stay legible at 390 (${fit.cardWidth.toFixed(1)}px)`);
    before = await moves();
    await page.locator('#win-solitaire .pt-stock').click();
    assert.equal(await moves(), before + 1, 'stock is tappable at 390');
    await page.screenshot({ path: `${OUT}/patience-390.png` });
    step(`fits at 390px (cards ${fit.cardWidth.toFixed(1)}px wide)`);

    /* ── Reload: the app and its record persist ── */
    const kept = await page.evaluate(() => ({ rounds: State.casino.solitaire.rounds, moves: PatienceApp.current().moves.slice() }));
    await page.evaluate(() => State.save());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.locator('#icon-solitaire').waitFor({ state: 'visible', timeout: 2500 });
    const after = await page.evaluate(() => ({
        apps: State.unlockedApps.slice(), rounds: State.casino.solitaire.rounds,
        moves: PatienceApp.current()?.moves.slice(),
    }));
    assert.ok(after.apps.includes('solitaire'));
    assert.equal(after.rounds, kept.rounds, 'stats survive reload');
    assert.deepEqual(after.moves, kept.moves, 'the round in progress survives reload');
    await page.evaluate(() => ui.dismissSystemModal?.());
    await page.locator('#icon-solitaire').click();
    await page.locator('#win-solitaire .pt-tableau').waitFor();
    step('reload keeps the app, the stats and the round in progress');

    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`);
    step('no console errors');
    console.log(`\n${passed} passed\n`);
} catch (error) {
    console.log(`  FAIL  ${error.message}`);
    await page.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
    if (errors.length) console.log('  console errors:', errors);
    process.exitCode = 1;
} finally {
    await browser.close();
}
