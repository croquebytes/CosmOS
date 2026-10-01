#!/usr/bin/env node
/**
 * The Archived channel in a real browser.
 *
 *   COSMOS_TEST_URL=http://localhost:5196 node tests/archived-e2e.mjs
 *
 * tests/archived.mjs proves the replay, the zero-Divinity ship and the lore
 * headlessly. What it cannot see is the part a player touches: the channel
 * picker in the ship dialog, the release history, the guard that will not
 * ship Archived without a build picked, the release notes saying what the run
 * is, and the annotation document in Recovered Documents.
 *
 * The climb to reboot 12 is a fixture — real performPrestige calls, a run's
 * worth of Souls stated in bars — and everything after it is clicked.
 * Screenshots land in output/archived/ (gitignored), at desktop and phone
 * widths.
 */
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173';
const OUT = 'output/archived';
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

    /* ── Fixture: twelve real ships ── */
    const climbed = await page.evaluate(() => {
        localStorage.clear();
        ui.dismissSystemModal?.();
        system.closeApp('console');
        // Keep the Adversary scene and Incidents from opening over the test.
        State.adversary.contacted = true;
        State.adversary.sceneCompleted = true;
        game.incidentsEnabled = false;
        const earn = () => {
            State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
        };
        while (State.prestigeLevel < 12) {
            const n = State.prestigeLevel;
            const want = n >= 8 && n % 2 ? 'nightly' : n >= 3 && n % 3 === 0 ? 'beta' : 'stable';
            if (Reality.channelsFor(n).includes(want)) game.setBuildChannel(want);
            earn();
            game.performPrestige({ confirmed: true, certifyOn: 'creation' });
            ui.dismissSystemModal();
        }
        earn();
        return { level: State.prestigeLevel, history: State.reality.history.length };
    });
    assert.equal(climbed.level, 12, 'fixture check: reached reboot 12');
    assert.equal(climbed.history, 12, 'fixture check: twelve builds on file');
    await page.waitForTimeout(600);
    await page.evaluate(() => document.querySelectorAll('.document-notification').forEach((n) => n.remove()));

    /* ── The ship dialog, opened the way a player opens it ── */
    await page.evaluate(() => system.openApp('settings'));
    await page.locator('#prestige-button').click();
    const dialog = page.locator('.ship-dialog');
    await dialog.waitFor();
    const archivedBtn = dialog.locator('.ship-channel', { hasText: 'Archived' });
    assert.ok(await archivedBtn.isVisible(), 'Archived is offered at reboot 12');
    assert.equal(await dialog.locator('.ship-archive').count(), 0, 'no history until Archived is chosen');
    await archivedBtn.click();
    const rows = dialog.locator('.archive-row');
    assert.equal(await rows.count(), 12, 'every shipped build is in the release history');
    const confirm = dialog.locator('#ship-confirm');
    assert.equal(await confirm.isDisabled(), true, 'Archived must not ship without a build picked');
    assert.match(await confirm.innerText(), /Choose an archived build/);
    step(`[${tag}] Archived offered at reboot 12; history listed; no default pick`);

    const row = rows.filter({ hasText: 'reboot 10' });
    assert.match(await row.innerText(), /Nightly/, 'fixture check: reboot 10 shipped on Nightly');
    assert.match(await row.innerText(), /shipped unpatched|shipped clean/);
    const version = (await row.locator('.archive-version').innerText()).trim();
    await row.click();
    assert.equal(await dialog.locator('.archive-row.is-selected').count(), 1);
    assert.equal(await confirm.isDisabled(), false, 'a picked build arms the button');
    await dialog.locator('.ship-archive').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/picker-${tag}.png` });
    step(`[${tag}] picking ${version} arms the ship button`);

    const before = await page.evaluate(() => ({ dp: State.totalDivinityPoints, level: State.prestigeLevel }));
    await confirm.click();
    const notes = page.locator('.release-notes');
    await notes.waitFor();
    const notesText = await notes.innerText();
    assert.match(notesText, /ARCHIVED/);
    assert.match(notesText, new RegExp(`v${version.replace(/^v/, '').replace(/\./g, '\\.')}`), 'notes name the original version');
    assert.match(notesText, /pays no Divinity/i);
    assert.match(notesText, /Annotated by NULL\.OPERATOR/i);
    const after = await page.evaluate(() => ({
        dp: State.totalDivinityPoints, level: State.prestigeLevel, channel: State.reality.build.channel,
        notes: State.reality.annotations.length, visits: State.achievementProgress.view_archived_branch,
    }));
    assert.equal(after.level, before.level + 1, 'the ship into the archive happened');
    assert.equal(after.channel, 'archived');
    assert.equal(after.notes, 1);
    assert.equal(after.visits, 1);
    await page.waitForTimeout(900); // let the unlock pulse fade
    await page.screenshot({ path: `${OUT}/release-notes-${tag}.png` });
    step(`[${tag}] shipped into the replay; release notes say what it is`);

    /* ── The annotation, in Recovered Documents ── */
    await notes.getByRole('button', { name: 'Accept this reality' }).click();
    await page.evaluate(() => {
        document.querySelectorAll('.document-notification').forEach((n) => n.remove());
        system.closeApp('settings');
        system.openApp('notepad');
    });
    await page.locator('.doc-category-tab[data-category="Archive"]').click();
    const doc = page.locator('.document-item', { hasText: 'Annotated' });
    await doc.click();
    const content = await page.locator('#document-content').innerText();
    assert.match(content, /ARCHIVED BRANCH POSTMORTEM/);
    assert.match(content, /NULL\.OPERATOR:/);
    assert.match(await page.locator('#document-title').innerText(), new RegExp(version.replace(/\./g, '\\.')));
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/annotation-${tag}.png` });
    step(`[${tag}] the annotation is filed under Archive and reads in his voice`);

    /* ── Ship the replay itself: zero Divinity, allowed ── */
    await page.evaluate(() => {
        system.closeApp('notepad');
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * 3;
        system.openApp('settings');
    });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#prestige-button').isDisabled(), false, 'the ship button is live on a replay');
    await page.locator('#prestige-button').click();
    await dialog.waitFor();
    assert.match(await dialog.locator('.ship-head').innerText(), /pays no Divinity/i);
    // The selector is still on Archived, but the pick was consumed.
    assert.equal(await dialog.locator('#ship-confirm').isDisabled(), true, 'a consumed pick must not re-arm');
    await dialog.locator('.ship-channel', { hasText: 'Stable' }).click();
    await dialog.locator('#ship-confirm').click();
    await page.locator('.release-notes').waitFor();
    const end = await page.evaluate(() => ({
        dp: State.totalDivinityPoints, level: State.prestigeLevel, channel: State.reality.build.channel,
    }));
    assert.equal(end.level, after.level + 1, 'the archived run was refused at award 0');
    assert.equal(end.dp, after.dp, 'the archived ship paid Divinity');
    assert.equal(end.channel, 'stable');
    step(`[${tag}] the replay ships at zero Divinity; the next build is Stable`);

    assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
    await context.close();
}

try {
    console.log('\nThe Archived channel (browser)\n');
    await scenario({ width: 1440, height: 900, tag: '1440' });
    await scenario({ width: 390, height: 844, tag: '390' });
} finally {
    await browser.close();
}
console.log(`\n${passed} passed\n`);
