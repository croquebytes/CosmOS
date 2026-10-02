#!/usr/bin/env node
/**
 * CMS Mail — the content table, delivery, replies, persistence, links.
 *
 *   node tests/mail.mjs
 *
 * The properties that matter, stated so a test cannot quietly assert a
 * neighbouring one instead:
 *
 *   - Every message can actually arrive. Each id has a fixture that reaches
 *     its trigger through the game's own code wherever one exists (claiming
 *     a directive, buying a Seraph, shipping a build, filing an incident,
 *     resolving the scene and an ending), and the fixture table must cover
 *     the whole catalogue, so a new message without a way in fails here.
 *   - A fresh game receives nothing until the first directive is claimed,
 *     and then exactly HR's welcome.
 *   - Mail never arrives while the player is away, and what came due is
 *     delivered on return, once, in one batch.
 *   - Replies: once each, to a delivered message, with a listed choice; they
 *     file to Sent, release their follow-up after its delay (attended
 *     seconds), and nudge the adversary only through
 *     game.nudgeAdversaryStanding — whose per-reason cooldown therefore holds.
 *   - Hostile saves. `x = x || default` keeps every truthy wrong value
 *     (335f41f), so the normaliser is tested with wrong values that are truthy.
 *   - Mail is presentation: delivering and answering everything leaves the
 *     economy byte-identical.
 *   - Fixtures state runs in reboot bars, never literal Souls.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const noop = () => {};
const read = (f) => ({ name: f, code: readFileSync(resolve(ROOT, f), 'utf8') });
const SOURCES = ['js/state.js', 'js/modifiers.js', 'js/reality.js', 'js/incidents.js', 'js/game.js',
    'js/solitaire.js', 'js/media.js', 'js/mail.js'].map(read);

function boot(store = {}) {
    const calls = { sfx: [], log: [] };
    const ctx = vm.createContext({
        console: { log: noop, warn: noop, error: noop, debug: noop },
        setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
        confirm: () => true, alert: noop,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
        },
        ui: new Proxy({}, { get: (_, key) => (key === 'log' ? (m) => calls.log.push(String(m)) : noop) }),
        system: new Proxy({}, { get: () => noop }),
        requestAnimationFrame: noop,
        window: {},
        // No createElement: headless, so the 1 Hz watch never starts.
        document: {
            getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
            addEventListener: noop, body: { classList: { add: noop, remove: noop } },
        },
    });
    for (const src of SOURCES) vm.runInContext(src.code, ctx, { filename: src.name });
    const env = vm.runInContext(`({ State, game, Reality, Incidents, PatienceDealer, Modifiers,
        DocumentManifest, AdversaryFinale, MediaCatalog, MailCatalog, MailLogic, Mail })`, ctx);
    env.ctx = ctx;
    env.calls = calls;
    // game.sfx is the one door to audio; count what goes through it.
    const realSfx = env.game.sfx;
    env.game.sfx = (name, opts) => { calls.sfx.push(name); return realSfx.call(env.game, name, opts); };
    env.State.reality = { runSeed: 20260726, channel: 'stable', build: null, shipped: 0,
        instability: 0, cascadeTier: 0, alertedTier: 0, scars: [] };
    env.game.bootstrapModifiers(Date.now());
    return env;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const ids = (env) => env.State.mail.log.map((r) => r.id);
const has = (env, id) => ids(env).includes(id);

/* Attended time, in watch ticks. */
function run(env, seconds = 1, step = 30) {
    let left = seconds;
    const out = [];
    while (left > 0) {
        const s = Math.min(step, left);
        out.push(...env.Mail.tick({ seconds: s }));
        left -= s;
    }
    return out;
}

/* ── Fixtures: the game's own code paths, wherever one exists ─────────── */
function directive(env) {
    const { game, State } = env;
    game.ensureDirective();
    for (let i = 0; i < 10; i++) game.manualPraise(null);
    game.claimDirectiveReward();
    assert.ok(State.loopSystems.directives.completed >= 1, 'fixture check: the first directive was claimed');
}

function seraphs(env, n = 1) {
    const { game, State } = env;
    State.resources.praise = 1e12;
    if (n === 1) game.buyAutomator('seraph'); else game.buyAutomatorBulk('seraph', n);
    assert.ok(State.automatons.seraphCount >= n, 'fixture check: the Seraphs were bought');
}

function cherub(env) {
    const { game, State } = env;
    State.resources.offerings = 1e6;
    game.buyAutomator('cherub');
    assert.ok(State.automatons.cherubCount >= 1, 'fixture check: a Cherub was bought');
}

function offerings(env) {
    env.State.resources.praise = 1e6;
    env.game.purchaseUpgrade('offering_unlock');
    assert.equal(env.State.unlockedOfferings, true, 'fixture check: Offerings unlocked');
}

function breach(env) {
    env.State.resources.souls = 1e6;
    env.game.purchaseUpgrade('void_unlock');
    assert.equal(env.State.dimensions.void.unlocked, true, 'fixture check: the Veil was breached');
}

/* A run that clears the bar, stated in bars. */
function ship(env, times = 1, bars = 3) {
    const { State, game } = env;
    for (let i = 0; i < times; i++) {
        State.totalStats.soulsGained = (Number(State.runSoulsBaseline) || 0) + game.getPrestigeThreshold() * bars;
        const before = State.prestigeLevel;
        game.performPrestige({ confirmed: true, certifyOn: 'creation' });
        assert.equal(State.prestigeLevel, before + 1, `fixture check: the reboot from ${before} did not happen`);
    }
}

function contact(env, choice = 'OP-B') {
    env.game.resolveAdversaryChoice(choice);
    assert.equal(env.State.adversary.sceneCompleted, true, 'fixture check: the scene resolved');
}

function ending(env, band) {
    contact(env, { hostile: 'OP-A', curious: 'OP-B', complicit: 'OP-C' }[band]);
    env.game.resolveEnding(band);
    assert.ok(env.game.endingsSeen().includes(band), `fixture check: the ${band} ending resolved`);
}

function visitTable(env, times = 1) {
    for (let i = 0; i < times; i++) env.PatienceDealer.onOpen(Date.now());
    assert.equal(env.State.casino.visited, true, 'fixture check: Patience.exe was opened');
}

function watch(env, ...tapes) {
    // What the Sacred Media Player records when a tape plays to its end.
    const s = env.State.settings.media;
    for (const t of tapes) {
        if (!s.tapes.includes(t)) s.tapes.push(t);
        if (!s.watched.includes(t)) s.watched.push(t);
    }
}

function incident(env) {
    env.Incidents.file('choir_desync');
    assert.ok(env.State.incidents.stats.filed >= 1, 'fixture check: a ticket was filed');
}

/* Climb to the archive, then replay a build: NULL.OPERATOR annotates it. */
function replay(env) {
    ship(env, 12);
    const pick = env.game.archivedBuilds()[0];
    assert.ok(env.game.selectArchivedBuild(pick.reboot), 'fixture check: an archived build was selected');
    ship(env, 1);
    assert.ok(env.State.reality.annotations.length >= 1, 'fixture check: the replay was annotated');
}

/* Deliver `parent`, answer it, and wait out the follow-up's delay. */
function answered(env, parent, choice, setup) {
    setup(env);
    run(env, 1);
    assert.ok(has(env, parent), `fixture check: ${parent} was delivered`);
    const res = env.Mail.reply(parent, choice);
    assert.ok(res.ok, `fixture check: replied to ${parent} with ${choice}`);
}

const welcome = (env) => { directive(env); run(env, 1); };
const prev = (env) => { welcome(env); offerings(env); run(env, 1); };
const nullMail = (env) => { contact(env); run(env, 1); };

const FIXTURES = {
    'hr-welcome': directive,
    'hr-welcome-prev': (env) => { answered(env, 'hr-welcome', 'who', directive); run(env, 40); },
    'hr-seraph': (env) => seraphs(env),
    'hr-reboot-1': (env) => ship(env, 1),
    'hr-reboot-3': (env) => ship(env, 3),
    'hr-reboot-5': (env) => ship(env, 5),
    'hr-reboot-12': (env) => ship(env, 12),
    'hr-reboot-20': (env) => ship(env, 20),
    'hr-reboot-20-no': (env) => { answered(env, 'hr-reboot-20', 'no', (e) => ship(e, 20)); run(env, 30); },
    'hr-incident': incident,
    'hr-7781': (env) => contact(env),
    'hr-scar': (env) => { ship(env, 1); assert.ok(env.State.reality.scars.length >= 1, 'fixture check: a known issue shipped unpatched'); },
    'end-hostile': (env) => ending(env, 'hostile'),
    'ins-t1': (env) => watch(env, 't1'),
    'ins-t1-right': (env) => { answered(env, 'ins-t1', 'discarded', (e) => watch(e, 't1')); run(env, 25); },
    'ins-t1-wrong': (env) => { answered(env, 'ins-t1', 'previous', (e) => watch(e, 't1')); run(env, 25); },
    'ins-t2': (env) => watch(env, 't2'),
    'ins-t5': (env) => watch(env, 't5'),
    'ins-t6': (env) => watch(env, 't6'),
    'prev-01': (env) => { welcome(env); offerings(env); },
    'prev-02': (env) => { prev(env); breach(env); },
    'prev-03': (env) => { prev(env); ship(env, 6); },
    'prev-04': (env) => { prev(env); contact(env); },
    'prev-05': (env) => { prev(env); ship(env, 12); },
    'prev-06': (env) => { prev(env); ending(env, 'curious'); },
    'daemon-bounce': (env) => { answered(env, 'prev-01', 'who', prev); run(env, 5); },
    'daemon-archived': (env) => { answered(env, 'prev-06', 'me', (e) => { prev(e); ending(e, 'complicit'); }); run(env, 5); },
    'seraph-01': (env) => seraphs(env),
    'seraph-02': (env) => { seraphs(env); run(env, 1); seraphs(env, 25); },
    'seraph-03': (env) => { seraphs(env); run(env, 1); ship(env, 1); },
    'seraph-03-keep': (env) => { answered(env, 'seraph-03', 'keep', (e) => { seraphs(e); run(e, 1); ship(e, 1); }); run(env, 30); },
    'seraph-03-forget': (env) => { answered(env, 'seraph-03', 'forget', (e) => { seraphs(e); run(e, 1); ship(e, 1); }); run(env, 30); },
    'seraph-04': (env) => { seraphs(env); run(env, 1); ship(env, 1); run(env, 1); ship(env, 3); },
    'seraph-05': (env) => { seraphs(env); run(env, 1); ending(env, 'hostile'); },
    'fate-01': (env) => visitTable(env),
    'fate-unsub': (env) => { answered(env, 'fate-01', 'unsub', (e) => visitTable(e)); run(env, 20); },
    'fate-02': (env) => { visitTable(env); run(env, 1); visitTable(env, 4); },
    'fate-03': (env) => { visitTable(env); run(env, 1); contact(env); },
    'null-01': (env) => contact(env),
    'null-01-cold': (env) => { answered(env, 'null-01', 'cold', contact); run(env, 30); },
    'null-01-ask': (env) => { answered(env, 'null-01', 'ask', contact); run(env, 30); },
    'null-01-warm': (env) => { answered(env, 'null-01', 'warm', contact); run(env, 30); },
    'null-02': (env) => { nullMail(env); run(env, 1800); },
    'null-03': (env) => { contact(env); env.State.adversary.patchExecuted = true; /* ui.executeAdversaryPatch's flag */ },
    'null-04': replay,
    'null-t6': (env) => { answered(env, 'ins-t6', 'who', (e) => { contact(e); watch(e, 't6'); }); run(env, 20); },
    'end-curious': (env) => ending(env, 'curious'),
    'end-complicit': (env) => ending(env, 'complicit'),
    'prayer-01': cherub,
    'prayer-01-grant': (env) => { answered(env, 'prayer-01', 'grant', cherub); run(env, 45); },
    'prayer-01-deny': (env) => { answered(env, 'prayer-01', 'deny', cherub); run(env, 45); },
    'prayer-02': breach,
    'prayer-02-yes': (env) => { answered(env, 'prayer-02', 'yes', breach); run(env, 30); },
    'prayer-03': (env) => ship(env, 2),
    'watcher-01': (env) => { env.State.taskManager.openCount = 5; /* system.openApp's counter, ui-side */ },
    'junk-omnipotent': (env) => { welcome(env); run(env, 300); },
    'junk-chain': (env) => ship(env, 2),
    'junk-infernal': (env) => visitTable(env),
    'junk-warranty': (env) => ship(env, 1),
    'junk-prince': (env) => { env.State.totalStats.soulsGained = 1e6; /* lifetime Souls: the trigger names this figure */ },
    'junk-null': (env) => { nullMail(env); run(env, 600); },
};

/* ── Harness ─────────────────────────────────────────────────────────── */
let passed = 0;
const check = (name, fn) => {
    try {
        fn();
        passed++;
        console.log(`  ok    ${name}`);
    } catch (error) {
        console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`);
        process.exitCode = 1;
    }
};

console.log('\nCMS Mail\n');

/* ── Content table integrity ────────────────────────────────────────── */
const probe = boot();
const { MailCatalog, MailLogic } = probe;
const CATALOG = MailCatalog.messages;

check('the content table: unique slug ids, known senders and folders, reachable follow-ups', () => {
    assert.ok(CATALOG.length >= 40 && CATALOG.length <= 65, `about 40–60 messages (${CATALOG.length})`);
    const seen = new Set();
    for (const msg of CATALOG) {
        assert.match(msg.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${msg.id}: ids are slugs (they name assets/mail/<id>.webp)`);
        assert.ok(!seen.has(msg.id), `duplicate id ${msg.id}`);
        seen.add(msg.id);
        assert.ok(MailCatalog.SENDERS[msg.from], `${msg.id}: unknown sender ${msg.from}`);
        assert.ok(['inbox', 'hr', 'junk'].includes(msg.folder), `${msg.id}: messages arrive in Inbox, HR or Junk, not ${msg.folder}`);
        assert.ok(typeof msg.subject === 'string' && msg.subject.trim(), `${msg.id}: subject`);
        assert.ok(typeof msg.body === 'string' && msg.body.trim(), `${msg.id}: body`);
        assert.ok(typeof msg.when === 'function' || msg.after, `${msg.id}: no trigger`);
        const replyIds = (msg.replies || []).map((r) => r.id);
        assert.equal(new Set(replyIds).size, replyIds.length, `${msg.id}: duplicate reply ids`);
        assert.ok(replyIds.length <= 3, `${msg.id}: at most three canned replies`);
        for (const r of msg.replies || []) {
            assert.ok(r.label && r.text, `${msg.id}/${r.id}: label and text`);
            if (r.nudge) {
                assert.ok(Number.isFinite(r.nudge.delta) && r.nudge.delta !== 0, `${msg.id}/${r.id}: nudge delta`);
                assert.ok(typeof r.nudge.reason === 'string' && r.nudge.reason, `${msg.id}/${r.id}: nudge reason`);
                assert.equal(msg.from, 'null', `${msg.id}/${r.id}: only replies to him move the relationship`);
            }
        }
    }
    for (const msg of CATALOG.filter((m) => m.after)) {
        const parent = MailCatalog.message(msg.after.id);
        assert.ok(parent, `${msg.id}: follows unknown ${msg.after.id}`);
        const options = (parent.replies || []).map((r) => r.id);
        assert.ok(options.length, `${msg.id}: ${parent.id} has no replies to follow`);
        const choices = msg.after.choice === undefined ? [] : [].concat(msg.after.choice);
        for (const c of choices) assert.ok(options.includes(c), `${msg.id}: ${parent.id} has no reply ${c}`);
        assert.ok(Number.isFinite(msg.after.delay) && msg.after.delay > 0, `${msg.id}: follow-ups wait`);
    }
    const used = new Set(CATALOG.map((m) => m.from));
    for (const id of Object.keys(MailCatalog.SENDERS)) assert.ok(used.has(id), `sender ${id} never writes`);
});

check('every attachment names a real document, tape or cross-link', () => {
    const docs = new Set(probe.DocumentManifest.map((d) => d.id));
    for (const e of Object.values(probe.AdversaryFinale.endings)) docs.add(e.document.id);
    const tapes = new Set(probe.MediaCatalog.tapes.map((t) => t.id));
    let attachments = 0;
    for (const msg of CATALOG) {
        for (const a of msg.attach || []) {
            attachments++;
            const kinds = ['doc', 'tape', 'url'].filter((k) => k in a);
            assert.equal(kinds.length, 1, `${msg.id}: one kind per attachment`);
            if (a.doc) assert.ok(docs.has(a.doc), `${msg.id}: no document ${a.doc}`);
            if (a.tape) assert.ok(tapes.has(a.tape), `${msg.id}: no tape ${a.tape}`);
            if (a.url) assert.ok(MailLogic.isMailUrl(a.url), `${msg.id}: ${a.url} is outside the shared namespace`);
        }
        for (const url of MailLogic.urlsOf(msg)) {
            assert.ok(MailCatalog.URL_SCHEMES.includes(url.split(':')[0]), `${msg.id}: scheme of ${url}`);
        }
    }
    assert.ok(attachments >= 20, 'the attachments are a real part of the content');
});

check('the fixture table covers every message in the catalogue', () => {
    assert.deepEqual(Object.keys(FIXTURES).sort(), plain(CATALOG.map((m) => m.id)).sort());
});

/* ── Triggers ──────────────────────────────────────────────────────── */
check('a fresh game receives nothing, however long it runs', () => {
    const env = boot();
    run(env, 3600, 120);
    assert.deepEqual(plain(ids(env)), []);
    assert.equal(env.State.unlockedApps.includes('mail'), false, 'no Mail icon before the first mail');
});

check("the first mail is HR's welcome, after the first directive, and nothing else", () => {
    const env = boot();
    directive(env);
    const got = run(env, 1);
    assert.deepEqual(got.map((r) => r.id), ['hr-welcome']);
    assert.ok(env.State.unlockedApps.includes('mail'), 'the desktop icon and Genesis entry unlock with it');
    assert.equal(env.State.unlockedApps.filter((a) => a === 'mail').length, 1);
    assert.ok(env.calls.log.some((l) => l.includes('New message from CMS Human Resources')), 'a console line, not a dialog');
    assert.deepEqual(env.calls.sfx.filter((s) => s === 'eventAppear'), ['eventAppear'], 'one gentle cue');
});

for (const msg of CATALOG) {
    check(`trigger fires from a real fixture: ${msg.id}`, () => {
        const env = boot();
        assert.ok(!env.MailLogic.due(env.State, env.State.mail).includes(msg.id), 'not due on a fresh game');
        FIXTURES[msg.id](env);
        run(env, 2);
        assert.ok(has(env, msg.id), `${msg.id} was not delivered (got ${ids(env).join(', ')})`);
    });
}

check('reboot mail arrives at the reboot it names, not one before', () => {
    const env = boot();
    const named = { 'hr-reboot-1': 1, 'hr-reboot-3': 3, 'hr-reboot-5': 5, 'hr-reboot-12': 12, 'hr-reboot-20': 20,
        'prayer-03': 2, 'junk-chain': 2, 'junk-warranty': 1 };
    for (let level = 0; level <= 20; level++) {
        if (level) ship(env, 1);
        run(env, 1);
        for (const [id, at] of Object.entries(named)) {
            assert.equal(has(env, id), level >= at, `${id} at reboot ${level}`);
        }
    }
});

check('timed mail waits exactly its attended time', () => {
    const env = boot();
    nullMail(env);
    run(env, 598);
    assert.ok(!has(env, 'junk-null'), 'junk-null before ten minutes');
    run(env, 2);
    assert.ok(has(env, 'junk-null'), 'junk-null at ten minutes');
    run(env, 1198);
    assert.ok(!has(env, 'null-02'), 'null-02 before thirty minutes');
    run(env, 2);
    assert.ok(has(env, 'null-02'), 'null-02 at thirty minutes');
});

check('follow-ups wait for their delay in attended seconds, and only for their choice', () => {
    const env = boot();
    answered(env, 'hr-welcome', 'who', directive);
    run(env, 38);
    assert.ok(!has(env, 'hr-welcome-prev'), 'too early');
    run(env, 2);
    assert.ok(has(env, 'hr-welcome-prev'), 'after 40 attended seconds');

    const other = boot();
    answered(other, 'hr-welcome', 'thanks', directive);
    run(other, 600);
    assert.ok(!has(other, 'hr-welcome-prev'), 'the other choice never releases it');
});

/* ── Presence ──────────────────────────────────────────────────────── */
check('nothing arrives while the player is away; the backlog lands on return, once, in one batch', () => {
    const env = boot();
    const { game, State } = env;
    directive(env);
    seraphs(env);
    cherub(env);
    // The page's input tracker is on, and nobody has touched anything.
    game.presenceTracking = true;
    game.lastInputAt = 0;
    const clock = State.mail.clock;
    assert.deepEqual(run(env, 600).map((r) => r.id), [], 'nothing while away');
    assert.equal(State.mail.clock, clock, 'follow-up clocks do not run while away');
    assert.equal(env.Mail.isAway(), true);
    assert.equal(env.calls.sfx.filter((s) => s === 'eventAppear').length, 0, 'no cue while away');

    game.notePresence(Date.now());
    const back = run(env, 1).map((r) => r.id);
    const expected = plain(env.MailCatalog.messages.map((m) => m.id)).filter((id) => back.includes(id));
    assert.deepEqual(back, expected, 'the backlog arrives in catalogue order');
    assert.ok(['hr-welcome', 'hr-seraph', 'seraph-01', 'prayer-01'].every((id) => back.includes(id)), `backlog: ${back.join(', ')}`);
    assert.equal(env.calls.sfx.filter((s) => s === 'eventAppear').length, 1, 'one cue for the whole batch');
    assert.equal(env.calls.log.filter((l) => /arrived while you were away/.test(l)).length, 1, 'one line for the whole batch');
    assert.deepEqual(run(env, 5).map((r) => r.id).filter((id) => back.includes(id)), [], 'and never again');
});

check('nothing arrives over a system dialog or a scene; it waits behind it', () => {
    const env = boot();
    directive(env);
    let modal = true;
    env.ctx.ui = new Proxy({}, { get: (_, k) => (k === 'isSystemModalOpen' ? () => modal : noop) });
    assert.deepEqual(run(env, 30).map((r) => r.id), []);
    modal = false;
    assert.deepEqual(run(env, 1).map((r) => r.id), ['hr-welcome']);
});

check('delivery is once only, whatever is asked', () => {
    const env = boot();
    directive(env);
    run(env, 1);
    for (let i = 0; i < 50; i++) env.Mail.tick();
    assert.equal(ids(env).filter((id) => id === 'hr-welcome').length, 1);
    assert.equal(env.MailLogic.deliver(env.State.mail, ['hr-welcome', 'hr-welcome', 'nope'], [0, 0, 0]).length, 0);
    assert.equal(new Set(ids(env)).size, ids(env).length);
    // A reload delivers nothing twice either.
    env.State.save();
    const again = boot();
    again.State.mail = plain(env.State.mail);
    again.State.loopSystems.directives.completed = 1;
    assert.deepEqual(run(again, 1).map((r) => r.id), []);
});

/* ── Replies ───────────────────────────────────────────────────────── */
check('a reply files to Sent, once, and only with a listed choice', () => {
    const env = boot();
    const { Mail, MailLogic, State } = env;
    assert.equal(Mail.reply('hr-welcome', 'thanks').ok, false, 'not before delivery');
    directive(env);
    run(env, 1);
    seraphs(env);
    run(env, 1);
    assert.equal(Mail.reply('hr-seraph', 'anything').reason, 'choice', 'a message with no replies takes none');
    assert.equal(Mail.reply('hr-welcome', 'resign').reason, 'choice', 'an unlisted choice is refused');
    const res = Mail.reply('hr-welcome', 'who');
    assert.ok(res.ok);
    assert.equal(Mail.reply('hr-welcome', 'thanks').reason, 'replied', 'a second reply is refused');
    const rec = MailLogic.record(State.mail, 'hr-welcome');
    assert.equal(rec.reply, 'who');
    assert.equal(rec.read, true, 'answering reads it');
    const sent = MailLogic.list(State.mail, 'sent');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, 'Re: Welcome to Sector 7G');
    assert.equal(sent[0].from.address, 'operator@cosmos.local');
    assert.equal(sent[0].option.text, 'Quick question: who had this job before me, and where did they go?');
    assert.equal(MailLogic.move(State.mail, 'hr-welcome', 'sent'), false, 'Sent is derived, never a destination');
    assert.ok(env.calls.log.some((l) => /Reply sent to CMS Human Resources/.test(l)));
});

check('replies to him move the relationship only through nudgeAdversaryStanding, cooldown and all', () => {
    const env = boot();
    const { Mail, State, game } = env;
    // Before contact there is no relationship: a reply with a nudge is inert.
    directive(env);
    run(env, 1);
    Mail.reply('hr-welcome', 'thanks');
    assert.equal(State.adversary.standing, 0);

    contact(env, 'OP-B');
    assert.equal(State.adversary.standing, 0, 'curious seeds at 0');
    run(env, 1);
    assert.ok(Mail.reply('null-01', 'warm').ok);
    assert.equal(State.adversary.standing, 1, '+1 for answering him warmly');

    run(env, 1800);
    assert.ok(has(env, 'null-02'));
    assert.ok(Mail.reply('null-02', 'patch').ok, 'the reply itself is accepted');
    assert.equal(State.adversary.standing, 1, 'same reason inside ten minutes: the cooldown holds');

    // Ten minutes later, by the cooldown's own clock.
    State.adversary.nudgeCooldowns['mail: answered him warmly'] -= game.ADVERSARY_NUDGE_COOLDOWN_MS + 1;
    game.resolveEnding('curious');
    run(env, 1);
    assert.ok(Mail.reply('end-curious', 'thanks').ok);
    assert.equal(State.adversary.standing, 2, 'after the cooldown it counts again');

    // A different reason has its own clock.
    const cold = boot();
    contact(cold, 'OP-B');
    run(cold, 1);
    cold.Mail.reply('null-01', 'cold');
    assert.equal(cold.State.adversary.standing, -1);
});

check('mail is presentation: delivering and answering everything leaves the economy untouched', () => {
    const env = boot();
    const { State, Modifiers, Mail } = env;
    ending(env, 'curious');
    seraphs(env);
    watch(env, 't1', 't2', 't5', 't6');
    const economy = () => plain({
        resources: State.resources, caps: State.resourceCaps, automatons: State.automatons,
        upgrades: State.upgrades, divinity: State.totalDivinityPoints, prestige: State.prestigeLevel,
        adoration: State.adoration, void: State.dimensions.void.resources, mods: Modifiers.serialize(),
        stats: State.totalStats, loops: State.loopSystems,
    });
    const before = economy();
    for (let round = 0; round < 6; round++) {
        run(env, 2000, 200);
        for (const rec of [...State.mail.log]) {
            const msg = env.MailCatalog.message(rec.id);
            if (msg.replies && !rec.reply) Mail.reply(rec.id, msg.replies[0].id);
            Mail.move(rec.id, 'archive');
        }
    }
    assert.ok(State.mail.log.length >= 15, `a real amount of mail went through (${State.mail.log.length})`);
    assert.deepEqual(economy(), before);
});

/* ── Folders, read state, dates ────────────────────────────────────── */
check('folders: archive and back, unread counts, Junk counted on its own', () => {
    const env = boot();
    const { Mail, MailLogic, State } = env;
    welcome(env);
    run(env, 300);
    assert.ok(has(env, 'junk-omnipotent'));
    assert.equal(MailLogic.unread(State.mail), 1, 'Inbox + HR: the welcome; junk is not counted');
    assert.equal(MailLogic.unread(State.mail, ['junk']), 1);
    assert.ok(Mail.move('hr-welcome', 'archive'));
    assert.equal(MailLogic.list(State.mail, 'archive')[0].id, 'hr-welcome');
    assert.equal(MailLogic.list(State.mail, 'hr').length, 0);
    assert.equal(MailLogic.record(State.mail, 'hr-welcome').folder, 'archive');
    assert.ok(Mail.move('hr-welcome', 'hr'));
    assert.equal(MailLogic.record(State.mail, 'hr-welcome').folder, null, 'home is stored as no move at all');
    assert.equal(Mail.move('hr-welcome', 'trash'), false);
    assert.ok(Mail.markRead('hr-welcome'));
    assert.equal(Mail.unreadCount(), 0);
    assert.ok(Mail.markRead('hr-welcome', false));
    assert.equal(Mail.unreadCount(), 1);
});

check('dates are in-world: the build it arrived on and the Epoch clock', () => {
    const env = boot();
    const { MailLogic, Reality } = env;
    assert.equal(MailLogic.formatStamp([0, 1234, 9]), `Build v${Reality.versionFor(0)} · Epoch 1,234`);
    assert.equal(MailLogic.formatStamp([11, 5, 0], true), `v${Reality.versionFor(11)} · E5`);
    ship(env, 2);
    env.State.startTime = Date.now() - 90_000;
    run(env, 1);
    const rec = MailLogic.record(env.State.mail, 'hr-reboot-1');
    assert.equal(rec.at[0], 2, 'the build it arrived on');
    assert.ok(rec.at[1] >= 89 && rec.at[1] <= 91, `the tray Epoch at delivery (${rec.at[1]})`);
});

/* ── Hostile saves ─────────────────────────────────────────────────── */
check('hostile saves normalise by type and membership, truthy wrong values included', () => {
    const env = boot();
    const { MailLogic, Mail, State } = env;
    for (const junk of ['yes', 7, ['hr-welcome'], null, { log: 'hr-welcome', clock: '5' }]) {
        assert.deepEqual(plain(MailLogic.normalise(junk)), { log: [], clock: 0 }, JSON.stringify(junk));
    }
    const out = plain(MailLogic.normalise({
        clock: Infinity,
        log: [
            'hr-welcome',
            { id: 'not-a-message', read: true },
            { id: 'hr-welcome', read: 'true', folder: 'sent', reply: 'resign', at: ['1', 2, 3], replyAt: [1, 2, 3] },
            { id: 'hr-welcome', read: true }, // duplicate
            { id: 'ins-t1', read: true, folder: 'inbox', reply: 'discarded', at: [1, -5, NaN], replyAt: 'soon' },
            { id: 'hr-seraph', read: 1, folder: 'archive', reply: 'yes', at: [2, 3, 1e15] },
            { id: 'junk-chain', folder: 'trash', at: [1, 2] },
            { id: '__proto__', read: true },
            { id: 'prev-01', folder: 'hr', reply: 'who', replyAt: [3, 4, 5], at: [1, 1, 1] },
        ],
    }));
    assert.deepEqual(out, {
        log: [
            // Per field: the string '1' is not a number, the 2 and 3 are.
            { id: 'hr-welcome', read: false, folder: null, reply: null, at: [0, 2, 3], replyAt: null },
            { id: 'ins-t1', read: true, folder: null, reply: 'discarded', at: [1, 0, 0], replyAt: [0, 0, 0] },
            { id: 'hr-seraph', read: false, folder: 'archive', reply: null, at: [2, 3, 1e9], replyAt: null },
            { id: 'junk-chain', read: false, folder: null, reply: null, at: [0, 0, 0], replyAt: null },
            { id: 'prev-01', read: false, folder: 'hr', reply: 'who', at: [1, 1, 1], replyAt: [3, 4, 5] },
        ],
        clock: 0,
    });
    assert.equal(MailLogic.normalise({ clock: 1e15 }).clock, MailLogic.CLOCK_CAP, 'the clock is capped');

    // Capped: a save naming every message a thousand times stores each once.
    const flood = { log: [] };
    for (let i = 0; i < 1000; i++) for (const m of env.MailCatalog.messages) flood.log.push({ id: m.id });
    const capped = MailLogic.normalise(flood);
    assert.equal(capped.log.length, env.MailCatalog.messages.length);
    assert.ok(capped.log.length <= MailLogic.LOG_CAP);

    // And the live path survives it: a hostile save in State, then a tick.
    State.mail = { log: { 0: 'x' }, clock: 'NaN' };
    directive(env);
    assert.deepEqual(run(env, 1).map((r) => r.id), ['hr-welcome']);
    assert.ok(Array.isArray(State.mail.log));
});

check('a trigger that throws on a strange save is simply not due; bogus endings are not endings', () => {
    const env = boot();
    const { MailLogic, State } = env;
    const m = MailLogic.helpers(State, State.mail);
    assert.equal(MailLogic.isDue({ id: 'x', when: () => { throw new Error('strange save'); } }, State, m), false);
    assert.equal(MailLogic.isDue({ id: 'x', when: () => 'yes' }, State, m), false, 'only a real true is due');
    // A pasted endings history naming bands that do not exist.
    seraphs(env);
    run(env, 1);
    State.endings.history = [{ ending: 'triumphant' }, 'hostile', { ending: 'toString' }, null];
    assert.deepEqual(plain(MailLogic.endingsSeen(State)), []);
    run(env, 5);
    assert.ok(!has(env, 'seraph-05') && !has(env, 'end-hostile'), 'no epilogue for an ending nobody reached');
});

check('a save written before Mail existed merges the schema default and mails normally', () => {
    const store = {};
    const old = boot(store);
    directive(old);
    old.State.save();
    const saved = JSON.parse(store.cosmos_save);
    delete saved.mail;
    store.cosmos_save = JSON.stringify(saved);
    const env = boot(store);
    assert.deepEqual(plain(env.State.mail), { log: [], clock: 0 });
    assert.deepEqual(run(env, 1).map((r) => r.id), ['hr-welcome']);
});

/* ── Rendering and cross-links ─────────────────────────────────────── */
check('bodies escape before they mark up', () => {
    const { MailLogic } = probe;
    const html = MailLogic.renderBody('<img src=x onerror=alert(1)> **bold** *em* `code`\n\n- one\n- two\n\n> said\n\n```\nUNIT ... <1>\n```', () => true);
    assert.ok(!html.includes('<img'), 'markup in text is escaped');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(html.includes('<strong>bold</strong>') && html.includes('<em>em</em>') && html.includes('<code>code</code>'));
    assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
    assert.ok(html.includes('<blockquote>said</blockquote>'));
    assert.ok(html.includes('<pre class="ml-pre">UNIT ... &lt;1&gt;</pre>'));
});

check('cross-links: plain text without Etherscape, links only for pages it knows', () => {
    const env = boot();
    const { Mail, MailCatalog } = env;
    const msg = MailCatalog.message('hr-welcome');
    assert.equal(Mail.linkable('cms://intranet'), false);
    let html = Mail.renderBody(msg);
    assert.ok(!html.includes('ml-link'), 'no links without the browser');
    assert.ok(html.includes('<span class="ml-url">cms://intranet</span>'));
    assert.equal(Mail.openUrl('cms://intranet'), false);

    const opened = [];
    env.ctx.Etherscape = { knows: (url) => url === 'cms://intranet', open: (url) => opened.push(url) };
    html = Mail.renderBody(msg);
    assert.ok(html.includes('<button type="button" class="ml-link" data-url="cms://intranet"'), 'a link once it is known');
    assert.equal(Mail.linkable('cms://hr/policies'), false, 'an unknown page stays text');
    assert.ok(Mail.renderBody(MailCatalog.message('hr-welcome-prev')).includes('<span class="ml-url">cms://hr/policies</span>'));
    assert.equal(Mail.openUrl('cms://hr/policies'), false);
    assert.equal(Mail.openUrl('cms://intranet'), true);
    assert.deepEqual(opened, ['cms://intranet']);

    // knows() returning nothing, or throwing, is not a link.
    env.ctx.Etherscape = { knows: () => undefined, open: noop };
    assert.equal(Mail.linkable('cms://intranet'), false);
    env.ctx.Etherscape = { knows: () => { throw new Error('offline'); }, open: noop };
    assert.equal(Mail.linkable('cms://intranet'), false);
    assert.ok(!Mail.renderBody(msg).includes('ml-link'));
});

check('the image slot is assets/mail/<message id>.webp', () => {
    assert.equal(probe.MailLogic.imagePath('hr-welcome'), 'assets/mail/hr-welcome.webp');
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}.`);
