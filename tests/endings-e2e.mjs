#!/usr/bin/env node
/**
 * SCN-ADV-002 "End of Shift", in a real browser.
 *
 *   COSMOS_TEST_URL=http://localhost:5199 node tests/endings-e2e.mjs
 *
 * tests/endings.mjs proves the gate, the mapping, the modifier and the
 * replay route headlessly. What it cannot see is the part a player touches:
 * that the 1 Hz trigger really opens the scene in the shared modal slot,
 * that the three phases draw, that the record is reachable by click AND by
 * keyboard, that an interrupted scene comes back as the same ending after a
 * reload, and that the post-game mark is on the desktop — and still there
 * after the next reload.
 *
 * The climb is a fixture: real performPrestige calls, runs stated in bars,
 * into an archived replay and out of it. Everything after is the game's own
 * trigger. Screenshots at 1440x900 land in output/endings/ (gitignored).
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://localhost:5173';
const OUT = 'output/endings';
mkdirSync(OUT, { recursive: true });

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

const STANDING = { hostile: -6, curious: 0, complicit: 6 };
const TITLE = { hostile: 'Sole Operator', curious: 'Co-Operator', complicit: 'Operator Emeritus' };
const DOC = { hostile: 'END-HOSTILE', curious: 'END-CURIOUS', complicit: 'END-COMPLICIT' };

async function settle(page) {
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.waitForFunction(() => !document.getElementById('boot-overlay'));
}

async function scenario(band) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await settle(page);

    /* ── Fixture: the Mirror Login resolved, twelve ships, a replay shipped ── */
    const fixture = await page.evaluate((standing) => {
        localStorage.clear();
        ui.dismissSystemModal?.();
        system.closeApp('console');
        game.incidentsEnabled = false;
        game.resolveAdversaryChoice('OP-B');
        const ship = () => {
            State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
            const before = State.prestigeLevel;
            game.performPrestige({ confirmed: true, certifyOn: 'creation' });
            ui.dismissSystemModal();
            if (State.prestigeLevel !== before + 1) throw new Error(`fixture: the reboot from ${before} did not happen`);
        };
        while (State.prestigeLevel < 12) ship();
        if (!game.selectArchivedBuild(5)) throw new Error('fixture: no archived build');
        ship();
        const replay = State.reality.build.channel;
        game.setBuildChannel('stable');
        ship();
        State.runtime.startTime = Date.now() - 2 * 24 * 3600 * 1000;
        State.adversary.standing = standing;
        document.querySelectorAll('.document-notification, .achievement-toast').forEach((n) => n.remove());
        return { level: State.prestigeLevel, replay, ships: State.endings.archivedShips, blocker: game.finaleBlocker() };
    }, STANDING[band]);
    assert.equal(fixture.replay, 'archived', 'fixture check: reboot 13 was a replay');
    assert.equal(fixture.ships, 1, 'fixture check: the replay shipped');
    assert.equal(fixture.blocker, null, `fixture check: gate shut (${fixture.blocker})`);
    assert.equal(fixture.level, 14);

    /* ── The game's own trigger opens it ── */
    const scene = page.locator(`.fin-scene.fin-${band}`);
    await scene.waitFor({ timeout: 5000 });
    /* The one act: the transcript runs until the ending's button and WAITS.
       Neither the timer, a click on the scene nor Escape gets past it. */
    const act = page.locator('.fin-act:not(.is-done)');
    await act.waitFor({ timeout: 5000 });
    const label = { hostile: 'End Process', curious: 'Sign the rota', complicit: 'Hand over the console' }[band];
    assert.equal((await act.innerText()).trim().toLowerCase(), label.toLowerCase(), `${band} shows the wrong act`);
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await scene.click({ position: { x: 300, y: 60 } });
    await page.waitForTimeout(300);
    const parked = await page.evaluate(() => ({ waiting: ui.advScene.awaitingAct, last: ui.advScene.index === ui.advBeats.length - 1 }));
    assert.ok(parked.waiting && !parked.last, 'the scene went past its act without it');
    if (band === 'hostile') { await act.focus(); await page.keyboard.press('Enter'); }
    else await act.click();
    await page.locator('.fin-act.is-done').waitFor({ timeout: 3000 });
    step(`[${band}] the ending waits on its act ("${label}"); Escape and clicks do not skip it; ${band === 'hostile' ? 'Enter' : 'a click'} performs it`);
    // testMode collapses the theatre; after the act the transcript runs to its last line and waits.
    await page.waitForFunction(() => ui.advScene && ui.advScene.index === ui.advBeats.length - 1);
    const transcript = await page.locator('#adv-transcript').innerText();
    assert.match(transcript, /You came back out of the archive/);
    assert.match(transcript, new RegExp(`Relationship on file: ${band.toUpperCase()}`));
    assert.match(await page.locator('#adv-hint').innerText(), /file the release notes/i);
    assert.equal(await page.evaluate(() => State.endings.pending), band, 'the band was not locked at presentation');
    // Reaching the transcript proves the renderer: the attempt is refunded.
    assert.equal(await page.evaluate(() => State.endings.attempts), 0, 'a drawn scene spent its exhaustion budget');
    await page.screenshot({ path: `${OUT}/${band}-transcript.png` });
    step(`[${band}] the trigger opened the scene; the transcript waits at its last line`);

    if (band === 'curious') {
        /* An interrupted scene comes back as the SAME ending, even after the
           relationship has moved. */
        await page.evaluate(() => { State.adversary.standing = -9; State.save(); });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.fin-scene.fin-curious').waitFor({ timeout: 6000 });
        // The act is part of the scene, so a resumed scene asks for it again.
        await page.locator('.fin-act:not(.is-done)').click();
        await page.waitForFunction(() => ui.advScene && ui.advScene.index === ui.advBeats.length - 1);
        assert.equal(await page.locator('.fin-scene.fin-hostile').count(), 0);
        step('[curious] a reload mid-scene resumes the same ending, not the moved band');
    }

    /* ── The record: by keyboard for one ending, by click for the others ── */
    if (band === 'hostile') {
        await page.keyboard.press('Escape');
    } else {
        await scene.click({ position: { x: 300, y: 120 } });
    }
    const credits = page.locator('.fin-phase-credits');
    await credits.waitFor();
    const record = await credits.innerText();
    assert.match(record, /RELEASE NOTES \(FINAL BUILD\)/);
    assert.match(record, new RegExp(TITLE[band]));
    const after = await page.evaluate(() => ({
        worn: game.endingWorn(), pending: State.endings.pending,
        docs: game.endingDocuments().map((d) => d.id),
    }));
    assert.equal(after.worn, band, 'entering the record did not resolve the ending');
    assert.equal(after.pending, null);
    assert.deepEqual(after.docs, [DOC[band]]);
    await page.waitForTimeout(3900); // the credits roll rises into place, the close button arms
    await page.evaluate(() => document.querySelectorAll('.document-notification, .achievement-toast').forEach((n) => n.remove()));
    await page.screenshot({ path: `${OUT}/${band}-final.png` });
    step(`[${band}] the record is filed before it is shown; final frame captured`);

    if (band === 'hostile') {
        await page.keyboard.press('Space');
        assert.equal(await credits.count(), 1, 'Space closed the record a player may still be reading');
        await page.keyboard.press('Escape');
    } else {
        await credits.getByRole('button', { name: 'Return to work' }).click();
    }
    await page.waitForFunction(() => !ui.isSystemModalOpen() && !ui.isAdversarySceneOpen());
    step(`[${band}] closed by ${band === 'hostile' ? 'Escape' : 'its button'}; the slot is free`);

    /* ── The post-game mark ── */
    const readMark = () => page.evaluate(() => ({
        ending: document.body.dataset.ending || null,
        watermark: document.getElementById('build-watermark')?.innerText || '',
        identity: document.querySelector('.start-menu-identity strong')?.textContent || '',
    }));
    let mark = await readMark();
    assert.equal(mark.ending, band);
    assert.match(mark.watermark, new RegExp(TITLE[band]));
    assert.equal(mark.identity, TITLE[band].toUpperCase());

    if (band === 'complicit') {
        // He opens a window you did not ask for: the record of you.
        await page.locator('#document-title', { hasText: 'Emeritus' }).waitFor({ timeout: 3000 });
    } else {
        await page.evaluate(() => system.openApp('notepad'));
        await page.locator('.document-item', { hasText: band === 'hostile' ? 'Exit Log' : 'Shift Rota' }).click();
    }
    const content = await page.locator('#document-content').innerText();
    assert.match(content, /SHIFT HANDOVER RECORD/);
    assert.match(content, /Release notes/i);
    step(`[${band}] the handover record reads in Recovered Documents`);

    if (band === 'hostile') {
        await page.evaluate(() => system.openApp('taskmgr'));
        const rows = await page.locator('#taskmgr-process-list').innerText();
        assert.ok(!rows.includes('void_mirror.service#2'), 'the terminated process is still listed');
        step('[hostile] void_mirror.service#2 is gone from Task Manager');
    }

    /* Persistence: the next session still wears it. */
    await page.evaluate(() => { State.save(); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await page.waitForFunction(() => !!document.getElementById('build-watermark'), null, { timeout: 4000 });
    mark = await readMark();
    assert.equal(mark.ending, band, 'the mark did not survive a reload');
    assert.match(mark.watermark, new RegExp(TITLE[band]));
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.fin-scene').count(), 0, 'the scene re-fired after the ending');
    await page.evaluate(() => {
        ['console', 'notepad', 'taskmgr'].forEach((id) => system.closeApp(id));
        system.openApp('console');
        document.querySelectorAll('.document-notification, .achievement-toast').forEach((n) => n.remove());
    });
    await page.locator('#start-button').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${band}-desktop.png` });
    step(`[${band}] the title and desktop mark persist across a reload`);

    assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
    step(`[${band}] no console errors`);
    await context.close();
}

try {
    console.log('\nEnd of Shift (browser)\n');
    for (const band of ['hostile', 'curious', 'complicit']) await scenario(band);
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
