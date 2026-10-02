#!/usr/bin/env node
/**
 * Where does NULL.OPERATOR's standing land at the finale gate?
 *
 *   node tools/standing_sim.mjs [--variants] [--curve] [--trace=<style>:<choice>]
 *
 * tests/endings.mjs sets `standing` directly, so nothing tested how it DRIFTS
 * over the 14 reboots the End of Shift gate demands. This drives the real
 * game through a full climb under scripted play styles, from each answer to
 * the Mirror Login (tools/standing_lib.mjs holds the driver; tests/standing.mjs
 * pins the result). Findings and the rule that was built: docs/STANDING_DRIFT.md.
 *
 *   (no flag)    the tables: the game before the lifetime caps, then as shipped
 *   --variants   every rule that was tried, per play style
 *   --curve      standing along one cold-to-warm dial, per rule
 *   --trace=ordinary:OP-B   standing after each ship, per rule
 *
 * The levers (js/game.js, system.js, ui.js, state.js, mail.js, choir.js):
 *   every ship            -1  exempt   (+1 instead on entering an archived replay)
 *   open Notepad          +1  per-reason cooldown 10 min
 *   buy a Void upgrade    +1  per-reason cooldown 10 min
 *   try to end the mirror -2  per-reason cooldown 10 min
 *   Choir status          -1/0/+1  one offer per reboot, cooldown 10 min
 *   Mail null-01 / null-02  -1/0/+1 each, once ever (end-curious comes after an ending)
 *   execute the patch     +5  exempt, once ever
 * Since the fix, game.ADVERSARY_NUDGE_CAPS bounds what each kind of act may add
 * over the whole save. Standing is clamped to +/-12; bands: <= -3 hostile, >= +3 complicit.
 */
import { VARIANTS, STYLES, WARMTH, SEEDS, bandOf, climb } from './standing_lib.mjs';

const args = process.argv.slice(2);
const trace = (args.find((a) => a.startsWith('--trace=')) || '').slice(8);
const pad = (s, n) => String(s).padEnd(n);
const fmt = (n) => (n > 0 ? `+${n}` : String(n));
const CHOICES = ['OP-A', 'OP-B', 'OP-C'];

if (trace) {
    const [style, choice] = trace.split(':');
    for (const variant of Object.keys(VARIANTS)) {
        const r = climb({ style, choice, variant });
        console.log(`${pad(variant, 11)} standing after each ship: ${r.line.map(fmt).join(' ')}`);
    }
    process.exit(0);
}

if (args.includes('--curve')) {
    console.log('\nStanding at the gate along one warmth dial (-1 cold ... +1 warm farmer), from OP-A / OP-B / OP-C');
    console.log('Acts per hour at warmth w: round(|w|*6) Notepad+Void (or end-the-mirror) slots; see graded() in tools/standing_lib.mjs.\n');
    for (const variant of Object.keys(VARIANTS)) {
        console.log(`-- ${VARIANTS[variant].label}`);
        let curious = 0;
        for (const w of WARMTH) {
            const cells = CHOICES.map((c) => {
                const r = climb({ style: String(w), choice: c, variant });
                if (c === 'OP-B' && bandOf(r.final) === 'curious') curious++;
                return pad(`${fmt(r.final)} ${bandOf(r.final).slice(0, 4)}`, 14);
            });
            console.log(`  w=${pad(w, 6)} ${cells.join('')}`);
        }
        console.log(`  -> curious for ${curious} of ${WARMTH.length} warmth settings (from OP-B)\n`);
    }
    process.exit(0);
}

console.log('\nNULL.OPERATOR standing at the End of Shift gate (reboot 14, one reboot per attended hour)\n');
console.log('Play styles:');
for (const [id, s] of Object.entries(STYLES)) console.log(`  ${pad(id, 10)} ${s.label}`);

const variants = args.includes('--variants') ? Object.keys(VARIANTS) : ['legacy', 'current'];
for (const variant of variants) {
    console.log(`\n-- ${VARIANTS[variant].label}`);
    console.log(`${pad('', 10)}${['OP-A (-4)', 'OP-B (0)', 'OP-C (+4)'].map((h) => pad(h, 26)).join('')}`);
    for (const style of Object.keys(STYLES)) {
        const cells = CHOICES.map((choice) => {
            const r = climb({ style, choice, variant });
            return pad(`${fmt(r.final)} ${bandOf(r.final)}`, 26);
        });
        console.log(`${pad(style, 10)}${cells.join('')}`);
    }
}

if (!args.includes('--variants')) {
    console.log('\nStanding after reboot 3 / 8 / 12 / 14, from OP-B (before the caps -> as shipped):');
    for (const style of Object.keys(STYLES)) {
        const a = climb({ style, choice: 'OP-B', variant: 'legacy' });
        const b = climb({ style, choice: 'OP-B', variant: 'current' });
        const row = (r) => [3, 8, 12, 14].map((n) => fmt(r.marks[n])).join(' / ');
        console.log(`  ${pad(style, 10)} ${pad(row(a), 22)} -> ${row(b)}`);
    }
    console.log('\nPure drift, no acts (the floor under every run), before -> as shipped:');
    for (const choice of CHOICES) {
        const a = climb({ style: 'passive', choice, variant: 'legacy' });
        const b = climb({ style: 'passive', choice, variant: 'current' });
        console.log(`  ${choice} (${fmt(SEEDS[choice])}) -> ${fmt(a.final)} -> ${fmt(b.final)} after 14 ships`);
    }
}
console.log('');
