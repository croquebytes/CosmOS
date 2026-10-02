#!/usr/bin/env node
/**
 * The Dev Console must not ship.
 *
 *   node tests/release-build.mjs
 *
 * js/devtools.js is a tester's tool: it unlocks the whole desktop, forges
 * saves and replays cinematics. `npm run build:release` (vite build --mode
 * release) leaves it out. This builds both flavours into scratch directories
 * and holds the line:
 *
 *   1. The release output has no devtools.js and its index.html does not ask
 *      for one — a 404 on boot would be a console error and a tell.
 *   2. Nothing in the release output carries the panel's words or hooks. The
 *      settings app's `typeof DevTools !== 'undefined'` guard is the only
 *      mention of the name, and it is a guard, not a feature.
 *   3. The plain build still ships it (so the flag, not luck, is doing the
 *      work), and index.html loads it.
 *   4. The committed dist/ — it is tracked — carries no devtools.js, so a
 *      `git add dist` after a plain build cannot publish the console.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE = resolve(ROOT, 'node_modules/vite/bin/vite.js');

let passed = 0;
const step = (name) => { passed++; console.log(`  ok    ${name}`); };

const TEXT = /\.(js|html|css|json|md|txt)$/i;
function* walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* walk(full);
        else yield full;
    }
}

function build(mode) {
    const out = mkdtempSync(join(tmpdir(), `cosmos-${mode}-`));
    const args = [VITE, 'build', '--outDir', out, '--emptyOutDir', ...(mode === 'release' ? ['--mode', 'release'] : [])];
    execFileSync(process.execPath, args, { cwd: ROOT, stdio: 'pipe' });
    return out;
}

const scratch = [];
try {
    console.log('\nRelease build keeps the Dev Console out\n');

    const release = build('release'); scratch.push(release);
    assert.ok(existsSync(join(release, 'js/state.js')), 'fixture check: the release build copied the game scripts');
    assert.ok(existsSync(join(release, 'index.html')), 'fixture check: the release build wrote index.html');
    step('the release build writes the game, copies js/, writes index.html');

    assert.ok(!existsSync(join(release, 'js/devtools.js')), 'release output contains js/devtools.js');
    const stray = [...walk(release)].filter((f) => /devtools/i.test(f.slice(release.length)));
    assert.deepEqual(stray, [], `release output has dev-tool files: ${stray.join(', ')}`);
    step('no devtools file anywhere in the release output');

    const html = readFileSync(join(release, 'index.html'), 'utf8');
    assert.ok(!/devtools/i.test(html), 'release index.html still asks for devtools.js');
    assert.ok(html.includes('js/breakdown.js'), 'fixture check: index.html still loads the other scripts');
    step('the release index.html does not request it');

    const MARKERS = ['CMS FIELD ENGINEER MODE', 'const DevTools', 'DevTools.actions', 'cosmos_dev_slots', 'unlockAll'];
    for (const file of walk(release)) {
        if (!TEXT.test(file)) continue;
        const body = readFileSync(file, 'utf8');
        for (const marker of MARKERS) {
            assert.ok(!body.includes(marker), `${file.slice(release.length)} carries "${marker}"`);
        }
    }
    step('no shipped text carries the panel\'s title, its API, its storage key or its URL params');

    const plain = build('development'); scratch.push(plain);
    assert.ok(existsSync(join(plain, 'js/devtools.js')), 'the plain build lost js/devtools.js — is the flag doing the work?');
    assert.ok(/<script src="js\/devtools\.js"><\/script>/.test(readFileSync(join(plain, 'index.html'), 'utf8')),
        'the plain build\'s index.html does not load devtools.js');
    step('the plain build still ships it, and loads it');

    const tracked = execFileSync('git', ['ls-files', 'dist'], { cwd: ROOT, encoding: 'utf8' })
        .split('\n').filter((f) => /devtools/i.test(f));
    assert.deepEqual(tracked, [], `the tracked dist/ contains ${tracked.join(', ')} — rebuild it with npm run build:release`);
    const committedHtml = existsSync(join(ROOT, 'dist/index.html')) ? readFileSync(join(ROOT, 'dist/index.html'), 'utf8') : '';
    const staged = execFileSync('git', ['ls-files', 'dist/index.html'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (staged) assert.ok(!/devtools/i.test(committedHtml), 'the tracked dist/index.html loads devtools.js — rebuild with npm run build:release');
    step('the tracked dist/ carries no devtools.js and loads none');

    console.log(`\nRelease build: ${passed} checks passed.`);
} finally {
    for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
}
