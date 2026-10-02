#!/usr/bin/env node
/**
 * Cross-links: every web address Mail and Choir print is a real Etherscape page.
 *
 * The three apps were built in parallel, and agreed only on a URL namespace.
 * Mail and Choir render an address as a link only when Etherscape.knows() it,
 * and as plain text otherwise, so an address that names no page fails
 * silently: the reader sees a dead address and nothing says why. This scans
 * both apps' source for link-shaped addresses and checks each against the
 * page table, so a typo or a page renamed later fails here instead.
 *
 *   node tests/crosslinks.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

const ctx = vm.createContext({
    console: { log: noop, warn: noop, error: noop, debug: noop },
    Math, Date, JSON, Number, Object, Array, String, Boolean, Set, Map, Promise,
    isNaN, parseInt, parseFloat,
    setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    ui: new Proxy({}, { get: () => noop }),
    system: new Proxy({}, { get: () => noop }),
    requestAnimationFrame: noop,
    window: {},
    document: {
        getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
        addEventListener: noop, body: { classList: { add: noop, remove: noop } },
    },
});
for (const f of ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/incidents.js', 'js/solitaire.js',
    'js/game.js', 'js/media.js', 'js/etherscape.js']) {
    vm.runInContext(read(f), ctx, { filename: f });
}
const { EtherscapeSites, Etherscape } = vm.runInContext('({ EtherscapeSites, Etherscape })', ctx);
const pages = new Set(Object.keys(EtherscapeSites.pages));

/* A link-shaped address: a scheme the web uses, then a host or path, or one
   of the bare roots that are pages in their own right. A bare `void://` in a
   list of allowed schemes is not a link, so only roots that ARE pages count. */
const SCHEMES = [...new Set([...pages].map((u) => u.split('://')[0]))];
const LINK = new RegExp(`\\b(?:${SCHEMES.join('|')})://[a-z0-9][a-z0-9/_.-]*`, 'gi');
const ROOTS = [...pages].filter((u) => /:\/\/$/.test(u));

let passed = 0;
let failed = 0;
const check = (name, fn) => {
    try { fn(); passed++; console.log(`  ok    ${name}`); }
    catch (e) { failed++; console.log(`  FAIL  ${name}\n        ${String(e.message).split('\n')[0]}`); }
};

console.log('\nCross-links\n');

check('fixture: the page table is the one the browser uses', () => {
    assert.ok(pages.size >= 20, `only ${pages.size} pages`);
    assert.ok(pages.has('cms://intranet') && pages.has('null://'));
});

for (const app of ['js/mail.js', 'js/choir.js']) {
    const src = read(app);
    const found = new Set((src.match(LINK) || []).map((u) => Etherscape.canonical(u) || u));
    for (const root of ROOTS) if (src.includes(`'${root}'`) || src.includes(`"${root}"`)) found.add(root);
    check(`${app} links only to pages that exist (${found.size} addresses)`, () => {
        assert.ok(found.size >= 5, `fixture: found only ${found.size} addresses in ${app}`);
        const dead = [...found].filter((u) => !pages.has(u));
        assert.deepEqual(dead, [], `${app} links to pages Etherscape does not have`);
    });
}

check('the shared namespace from the briefs is fully served', () => {
    const shared = ['cms://intranet', 'cms://hr/policies', 'news://celestial-times', 'sector://7g/status',
        'cosmopedia://', 'cosmopedia://incidents', 'cosmopedia://reality-builds', 'cosmopedia://divine-reboot',
        'cosmopedia://archived-channel', 'cosmopedia://sector-7g', 'fate://casino', 'seraph://fanpage',
        'void://forum', 'null://'];
    const missing = shared.filter((u) => !pages.has(u));
    assert.deepEqual(missing, []);
});

console.log(`\n${passed} passed${failed ? `, ${failed} failed` : ''}\n`);
process.exit(failed ? 1 : 0);
