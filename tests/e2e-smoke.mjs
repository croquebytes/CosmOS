import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.COSMOS_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const runtimeErrors = [];

page.on('pageerror', (error) => runtimeErrors.push(String(error)));
page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
});

try {
    await page.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Perform Miracle' }).waitFor();

    for (let index = 0; index < 10; index += 1) {
        await page.getByRole('button', { name: 'Perform Miracle' }).click();
    }

    let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.directive.complete, true, 'first directive should complete after 10 miracles');
    assert.equal(state.resources.praise, 10, 'manual miracles should grant 10 Praise');

    await page.getByRole('button', { name: 'Claim Reward' }).click();
    await page.getByRole('button', { name: /Seraphic Automaton/ }).click();
    await page.waitForTimeout(1100);

    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.automation.seraphs, 1, 'first Seraph should be commissioned');
    /* Asserts intent, not a magic number. The exact rate legitimately depends
       on the run's Reality Build now, so pinning it to >= 1 encoded a baseline
       that a build is allowed to change. */
    assert.ok(state.productionPerSecond.praise > 0, 'Seraph should produce Praise');

    await page.evaluate(() => {
        State.runtime.lastUpdateTime = Date.now() - 120_000;
        localStorage.setItem('cosmos_save', JSON.stringify(State));
    });

    // Open a second page in the same browser context so the first page's
    // beforeunload save does not overwrite the simulated old timestamp.
    const offlinePage = await page.context().newPage();
    offlinePage.on('pageerror', (error) => runtimeErrors.push(String(error)));
    offlinePage.on('console', (message) => {
        if (message.type() === 'error') runtimeErrors.push(message.text());
    });
    await offlinePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await offlinePage.getByRole('heading', { name: 'The universe kept running.' }).waitFor({ timeout: 5000 });
    const reportText = await offlinePage.locator('.offline-gains').innerText();
    assert.match(reportText, /praise/i, 'offline report should include Praise');

    await offlinePage.screenshot({ path: '/tmp/cosmos-e2e-smoke.png', fullPage: true });

    /* ── The Adversary scene ──────────────────────────────────────────────
       Sequenced strictly after the offline-report assertion above, on its own
       page, because the scene defers to whatever is already in
       #system-modal-layer and would otherwise race that check.

       This exists because the unit suite cannot cover it: tests/adversary-
       scene.mjs boots js/ui.js's callers with a no-op `ui` proxy, so the beat
       machine itself is only exercised here. It caught a real soft-lock —
       after a choice was made, advanceAdversaryScene was still parked on the
       choice beat and refused to move, so the modal never closed. */
    const scenePage = await page.context().newPage();
    scenePage.on('pageerror', (error) => runtimeErrors.push(String(error)));
    scenePage.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push(m.text()); });
    await scenePage.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await scenePage.getByRole('button', { name: 'Perform Miracle' }).waitFor();

    const scene = await scenePage.evaluate(() => {
        ui.dismissSystemModal();
        // Put the save where the trigger fires from, then let it fire.
        State.totalStats.soulsGained = 800000;
        State.dimensions.void.unlocked = true;
        State.achievementProgress.prestige_count = 3;
        game.checkAdversaryTrigger();

        const opened = ui.isAdversarySceneOpen();
        const loginTitle = (document.getElementById('adv-title') || {}).textContent;

        // Drive to the choice, answer it, and require the scene to TERMINATE.
        let guard = 0;
        let sawChoiceButtons = 0;
        while (ui.isAdversarySceneOpen() && guard++ < 80) {
            const beat = ui.advBeats[ui.advScene.index];
            if (beat && beat.type === 'choice_prompt' && !ui.advScene.choiceId) {
                sawChoiceButtons = document.querySelectorAll('.adv-choice').length;
                ui.chooseAdversaryResponse('OP-B');
            } else {
                ui.advanceAdversaryScene();
            }
        }
        return {
            opened,
            loginTitle,
            sawChoiceButtons,
            stillOpen: ui.isAdversarySceneOpen(),
            modalLeftOpen: ui.isSystemModalOpen(),
            completed: State.adversary.sceneCompleted,
            choice: State.adversary.playerChoice,
            patch: State.recycleBin.items.map((i) => i.name),
            mirrorAchievement: !!State.achievements['ACH-S-005'],
        };
    });

    assert.equal(scene.opened, true, 'the Adversary scene did not fire on a qualifying save');
    assert.match(scene.loginTitle || '', /AUTHENTICATION/,
        'the scene should open as a login dialog, not a transcript');
    assert.equal(scene.sawChoiceButtons, 3, 'the branching choice rendered no buttons');
    assert.equal(scene.stillOpen, false, 'the scene never terminated after a choice — soft-lock');
    assert.equal(scene.modalLeftOpen, false, 'the scene left the modal layer blocking the desktop');
    assert.equal(scene.completed, true, 'the scene closed without resolving');
    assert.equal(scene.choice, 'OP-B', 'the chosen branch was not recorded');
    assert.ok(scene.patch.includes('PATCH_NULL_RESTORE.pkg'), 'no patch was left in the Recycle Bin');
    assert.equal(scene.mirrorAchievement, true, 'ACH-S-005 Mirror Login is still unreachable');

    // Escape must always terminate, from any point, without stranding anyone.
    const escaped = await scenePage.evaluate(() => {
        State.adversary.contacted = false;
        State.adversary.sceneCompleted = false;
        State.adversary.sceneAttempts = 0;
        game.checkAdversaryTrigger();
        ui.escapeAdversaryScene();   // skips ahead to the choice
        ui.escapeAdversaryScene();   // arms the deny
        ui.escapeAdversaryScene();   // commits it
        let guard = 0;
        while (ui.isAdversarySceneOpen() && guard++ < 80) ui.advanceAdversaryScene();
        return { open: ui.isAdversarySceneOpen(), completed: State.adversary.sceneCompleted };
    });
    assert.equal(escaped.open, false, 'Escape could not close the scene');
    assert.equal(escaped.completed, true, 'escaping left the scene unresolved');

    /* ── The boot race ────────────────────────────────────────────────────
       Deliberately NOT on a ?testMode page: testMode takes the openApp
       ('console') branch and uses bootDelay 0, which is precisely why the
       assertions above could not see this.

       game.loop() starts at parse time, so checkAdversaryTrigger first polls
       ~1s in — while #boot-overlay (z-index 10000) still covers the modal
       layer (9500), and 3 seconds before system.init shows the offline report.
       A scene opened there played unseen and was then destroyed when
       showOfflineReport rewrote the layer, leaving advScene.open true over an
       empty layer — which made system.js swallow every keypress for the rest
       of the session. Dead keyboard, unfinishable scene, no way back. */
    const racePage = await page.context().newPage();
    racePage.on('pageerror', (error) => runtimeErrors.push(String(error)));
    racePage.on('console', (m) => { if (m.type() === 'error') runtimeErrors.push(m.text()); });

    await racePage.goto(`${baseUrl}/?testMode=1`, { waitUntil: 'domcontentloaded' });
    await racePage.getByRole('button', { name: 'Perform Miracle' }).waitFor();
    await racePage.evaluate(() => {
        // A returning player who qualifies for the scene and was away long
        // enough to be shown an offline report on the next boot.
        State.totalStats.soulsGained = 800000;
        State.dimensions.void.unlocked = true;
        State.adversary = { contacted: false, sceneCompleted: false, playerChoice: null,
                            sceneAttempts: 0, standing: 0,
                            barks: { lastBarkId: null, lastBarkTime: 0, heardBarks: [], playCounts: {} },
                            patchInRecycleBin: false, patchExecuted: false, auditLogEntries: 0 };
        State.runtime.lastUpdateTime = Date.now() - 300_000;
        localStorage.setItem('cosmos_save', JSON.stringify(State));
        State.suppressUnloadSave = true;
    });

    await racePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });   // no testMode: real boot timings
    await racePage.waitForTimeout(1600);
    const duringBoot = await racePage.evaluate(() => ({
        bootOverlay: !!document.getElementById('boot-overlay'),
        sceneOpen: ui.isAdversarySceneOpen(),
    }));
    assert.equal(duringBoot.bootOverlay, true, 'boot overlay gone too early to test the race');
    assert.equal(duringBoot.sceneOpen, false,
        'the scene opened behind the boot overlay — it will be destroyed unseen');

    // Let the offline report appear, dismiss it as a player would, and require
    // the keyboard to still work afterwards.
    await racePage.getByRole('heading', { name: 'The universe kept running.' }).waitFor({ timeout: 8000 });
    await racePage.evaluate(() => ui.closeOfflineReport());
    const praiseBefore = await racePage.evaluate(() => State.resources.praise);
    await racePage.keyboard.press('Space');
    const praiseAfter = await racePage.evaluate(() => State.resources.praise);
    assert.ok(praiseAfter > praiseBefore,
        'the keyboard is dead after the offline report — the scene is holding it');

    assert.deepEqual(runtimeErrors, [], `runtime emitted errors: ${runtimeErrors.join('\n')}`);

    console.log('CosmOS e2e smoke passed: onboarding, directive, automation, offline progress, Adversary scene.');
} finally {
    await context.close();
    await browser.close();
}
