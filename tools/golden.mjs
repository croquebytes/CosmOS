#!/usr/bin/env node
/**
 * Golden-master check for the CosmOS economy.
 *
 *   node tools/golden.mjs            compare against tools/golden/*.json
 *   node tools/golden.mjs --capture  overwrite the baselines
 *
 * The balance simulator is deterministic, so a refactor that is meant to
 * preserve the economy must reproduce these snapshots exactly. Capture before
 * you start, compare when you think you are done.
 *
 * Run --capture ONLY when a balance change is intentional, and say so in the
 * commit. A silently regenerated baseline is worse than no baseline.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = resolve(ROOT, 'tools', 'golden');
const CAPTURE = process.argv.includes('--capture');

// Horizons chosen to catch different failure modes: 2h exercises the early
// curve and first prestiges, 8h exercises the Void and deep repeatable ranks.
const RUNS = [
    { name: '2h', args: ['2', '--json'] },
    { name: '8h', args: ['8', '--json'] },
    { name: '2h-idle', args: ['2', '--clicks-per-min=2', '--json'] },
];

const sim = (args) =>
    execFileSync('node', [resolve(ROOT, 'tools', 'balance_sim.mjs'), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });

/* Walks two snapshots together and reports leaf-level differences, so a report
   says "bonuses.dominion 17.38 -> 17.02" rather than "the files differ". */
function diff(a, b, path = '', out = []) {
    if (a === b) return out;

    const bothObjects = a && b && typeof a === 'object' && typeof b === 'object';
    if (!bothObjects) {
        out.push({ path: path || '(root)', before: a, after: b });
        return out;
    }

    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        diff(a[key], b[key], path ? `${path}.${key}` : key, out);
    }
    return out;
}

mkdirSync(DIR, { recursive: true });

let failed = 0;
for (const run of RUNS) {
    const file = resolve(DIR, `${run.name}.json`);
    const fresh = sim(run.args);

    if (CAPTURE) {
        writeFileSync(file, fresh);
        console.log(`  captured  ${run.name}`);
        continue;
    }

    if (!existsSync(file)) {
        console.log(`  MISSING   ${run.name} — run with --capture first`);
        failed++;
        continue;
    }

    const differences = diff(JSON.parse(readFileSync(file, 'utf8')), JSON.parse(fresh));
    if (!differences.length) {
        console.log(`  ok        ${run.name}`);
        continue;
    }

    failed++;
    console.log(`  CHANGED   ${run.name} — ${differences.length} field(s)`);
    for (const d of differences.slice(0, 25)) {
        console.log(`              ${d.path}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
    }
    if (differences.length > 25) console.log(`              …and ${differences.length - 25} more`);
}

if (CAPTURE) {
    console.log('\nBaselines captured.');
} else if (failed) {
    console.log(`\n${failed} run(s) diverged from the golden master.`);
    process.exit(1);
} else {
    console.log('\nEconomy unchanged.');
}
