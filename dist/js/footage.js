/* ════════════════════════════════════════════════════════════════════════
   Recovered footage, and the addresses from the Omniscient.

   Two kinds of reel that are not training tapes and not cinematics:

     RECOVERED   "[REDACTED] files". Archive footage CMS would rather you
                 had not seen: the first reboot, the previous Operator's
                 last shift, Sector 7G before the failure, the mirror test
                 that made NULL.OPERATOR, the archive floor. Each one is
                 uncovered somewhere in the game — the Recycle Bin's
                 unallocated space, an attachment on the previous Operator's
                 mail, a post on the Void forum, a line on null://, an
                 archive annotation — and filed to the Sacred Media
                 Player's Recovered shelf. The reel itself is clean footage;
                 the black redaction bars, the timecode, the CLASSIFIED
                 framing and the glitches are HTML and CSS over it.

     ADDRESS     "Welcome from the Omniscient". Short video addresses from
                 the retired deity whose post you hold, seen only as light
                 and geometry, never a face. They arrive as attachments on
                 CMS Mail (from "The Omniscient (Retired)"), and are kept on
                 the player's Addresses shelf. Optional: nothing opens by
                 itself.

   INERT UNTIL ITS FILE EXISTS. A reel is offered, filed or attached only
   once its file is installed in assets/video/ (probed the way js/media.js
   probes: a HEAD request, and an HTML answer is a miss). With the folder
   empty nothing here is ever visible, nothing is mailed, and the Media
   Player looks exactly as it did. A reel is not even probed until the
   moment it would be found, so a fresh game makes no requests at all.

   NEVER INTERRUPTS. Filing is a console line and a faint cue, while the
   player is present (game.isPresent), the tab is visible and no system
   dialog is up — the CMS Mail rule. Nothing plays until the player
   presses play.

   PERSISTENCE: State.footage = { found: [ids], watched: [ids] }, a schema
   default (no SAVE_VERSION bump) validated by type and membership on every
   access, because a save is pasted text.

   Layout, the media.js split:
     FootageCatalog   the reels: files, where each is found, when, captions
                      and redaction bars.
     FootageLogic     pure functions over (State, store). No DOM. The vm
                      tests (tests/footage.mjs) load this.
     Footage          the browser binding: probes, the 1 Hz watch, the
                      Recycle Bin strip, open().
     FootageView      the Recovered / Addresses shelves and the footage deck
                      inside the Sacred Media Player window.
   ════════════════════════════════════════════════════════════════════════ */

const FootageCatalog = (() => {
    'use strict';

    const DIR = 'assets/video/';
    const files = (stem) => ({ stem, webm: `${DIR}${stem}.webm`, mp4: `${DIR}${stem}.mp4`, poster: `${DIR}${stem}.webp` });
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const reboots = (S) => n(S.achievementProgress?.prestige_count);
    const mailed = (S, id) => Array.isArray(S.mail?.log) && S.mail.log.some((r) => r && r.id === id);
    // A reboot reseals the Veil, so "has ever breached it" is the sticky read.
    const breached = (S) => S.dimensions?.void?.unlocked === true || n(S.achievementProgress?.enter_void) >= 1;
    const endings = (S) => (Array.isArray(S.endings?.history) ? S.endings.history : [])
        .some((h) => h && ['hostile', 'curious', 'complicit'].includes(h.ending));

    /* Where a reel is found:
         bin    offered in the Recycle Bin, under the deleted items, as a
                file in unallocated space; found when Recover is pressed.
         web    linked from an Etherscape page ([[reel:<id>]]); found when
                the link is followed.
         mail   attached to a CMS Mail message; filed (and the message
                delivered) as soon as it comes due.
         auto   filed as soon as it comes due, with a console line.
       `when(S)` is pure and monotonic: counts and flags that only go up.

       Captions are [atSeconds, speaker, text]. A run of █ in the text is
       drawn as a black redaction bar; the words under it are not in the
       page at all. `bars` are redaction rectangles over the picture, in
       percent of the 16:9 frame, shown from `from` to `to` seconds.
       `base` is the timecode of the reel's first frame, [h, m, s]. */
    const reels = [
        {
            id: 'rec-incident-0', kind: 'recovered', code: 'INC-0000', file: 'INC-0000.rec',
            title: 'Incident 0 — the first reboot', ...files('rec__incident-0__720'),
            surface: 'bin', where: 'Recycle Bin, unallocated space', length: 10,
            when: (S) => reboots(S) >= 1,
            source: 'Nave camera 03', epoch: '-42,069', base: [3, 14, 0],
            binNote: 'Security footage. Deleted by: ████████. Not listed in the bin. Size: unknown.',
            captions: [
                [0, 'S', 'Security footage, Nave camera 03. Epoch -42,069. Operator on shift: ████████.'],
                [2.6, 'S', '03:14:07. A build is shipped without certification. Certification has not been invented yet.'],
                [5.2, 'S', 'Everything resets except the Operator. This was not in the design. Root cause: ████████████.'],
                [7.8, 'S', 'Corrective action: make it policy. See: Divine Reboot.'],
            ],
            bars: [
                { from: 0, to: 99, x: 46, y: 81, w: 8, h: 9 },
                { from: 5.2, to: 99, x: 41, y: 33, w: 18, h: 30 },
            ],
            krea: 'Keyframe: a high-angle fixed security-camera view down into a vast dark iron nave; the colossal Universal Engine core of iron rings and brass filigree, a door-sized brass wax seal pressed onto its face, violet-white light leaking from the seams; one small empty console at its foot. Motion: the seal glows, light floods the seams in a slow pulse, the core powers down and back up once; brass relays along the walls flicker in sequence; locked camera, faint surveillance drift.',
        },
        {
            id: 'rec-last-shift', kind: 'recovered', code: 'OPR-PREV', file: 'LAST_SHIFT.rec',
            title: "The previous Operator's last shift", ...files('rec__last-shift__720'),
            surface: 'mail', mail: 'prev-02', where: "Attached to the previous Operator's mail", length: 10,
            when: (S) => mailed(S, 'prev-02'),
            source: 'Console camera 7G-1', epoch: 'reboot 0', base: [22, 58, 0],
            captions: [
                [0, 'S', 'Console camera, Sector 7G. The last recorded shift of Operator ████████.'],
                [2.6, 'S', '22:58. The Operator writes a note and pins it to the console. Contents: ████ ███ ███████ █████.'],
                [5.2, 'S', '23:41. A second session logs in as ████████. Both sessions are marked current.'],
                [7.8, 'S', '00:00. Shift ends. No handover recorded. The console is still lit.'],
            ],
            bars: [
                { from: 2.6, to: 99, x: 63.5, y: 34, w: 8.5, h: 14 },
                { from: 5.2, to: 99, x: 47, y: 26, w: 17, h: 28 },
            ],
            krea: 'Keyframe: a lone operator console desk in an iron alcove at night, a bulky brass-housed CRT glowing violet-white, an empty high-backed iron chair pushed back, a blank vellum note pinned beside the screen, a brass desk lamp and a cold cup. Motion: the CRT flickers softly, the lamp dims once and recovers, dust drifts through the lamplight, the chair stays empty; locked camera.',
        },
        {
            id: 'rec-sector-7g', kind: 'recovered', code: 'PRM-7G-A', file: '7G_BEFORE.rec',
            title: 'Sector 7G, before the failure', ...files('rec__sector-7g__720'),
            surface: 'web', url: 'void://forum', where: 'Linked from the Void forum', length: 10,
            when: (S) => breached(S),
            source: 'Promotional reel 7G/A', epoch: '-42,070', base: [9, 0, 0],
            linkLabel: '7G_BEFORE.rec',
            captions: [
                [0, 'S', 'CMS promotional footage. Unreleased. Sector 7G, ███ days before the failure.'],
                [2.6, 'S', 'Output: 100%. Known issues: none. Choir attendance: full.'],
                [5.2, 'S', 'This footage is not representative of current service.'],
                [7.8, 'S', 'Reason withheld from release: ███████████████████. See SECTOR_7G_INCIDENT.LOG.'],
            ],
            bars: [
                { from: 7.8, to: 99, x: 42, y: 17, w: 16, h: 34 },
            ],
            krea: 'Keyframe: a vast symmetrical cathedral machine hall in perfect working order, rows of six-winged brass Seraph automata of organ pipes in choir stalls on both sides, the intact Universal Engine core radiating calm violet-white light at the far end, a polished iron floor reflecting it. Motion: a slow, steady dolly forward down the aisle; the Seraphs\' halo-gears turn in unison; the core breathes light; everything orderly and symmetrical.',
        },
        {
            id: 'rec-mirror-test', kind: 'recovered', code: 'QA-7781-A', file: 'MIRROR_TEST_7781-A.rec',
            title: 'Mirror test (subject: ████████████)', ...files('rec__mirror-test__720'),
            surface: 'web', url: 'null://', where: 'Left open on null://', length: 10,
            when: (S) => S.adversary?.sceneCompleted === true,
            source: 'QA bench 2', epoch: '-1', base: [0, 0, 0],
            linkLabel: 'MIRROR_TEST_7781-A.rec',
            captions: [
                [0, 'S', 'QA test 7781-A. Duplicate-session detection. Subject: void_mirror.service#1.'],
                [2.6, 'S', 'Procedure: show the console an Operator and its reflection. Ask which one is current.'],
                [5.2, 'S', 'Result: both. Test repeated ███ times. Result: both.'],
                [7.8, 'S', '#1 archived. #2 never filed. Test marked: PASSED.'],
            ],
            bars: [
                { from: 0, to: 99, x: 20, y: 38, w: 14, h: 6 },
                { from: 0, to: 99, x: 66, y: 38, w: 14, h: 6 },
            ],
            krea: 'Keyframe: two identical bulky CRT terminals in iron-and-brass housings facing each other across a narrow test bench in a dark basement lab, each screen showing the same featureless black silhouette of a head and shoulders; brass calipers and braided test leads clamped between them; perfectly symmetrical. Motion: both silhouettes tilt their heads together, then the right one tilts a frame early; a lamp swings slightly overhead; locked camera.',
        },
        {
            id: 'rec-archive-running', kind: 'recovered', code: 'ARC-ALPHA-2', file: 'ARCHIVE_FLOOR.rec',
            title: 'The Archive is still running', ...files('rec__archive-running__720'),
            surface: 'auto', where: 'Referenced by an archive annotation', length: 10,
            when: (S) => Array.isArray(S.reality?.annotations) && S.reality.annotations.length >= 1,
            source: 'Archive floor, aisle 0', epoch: 'ALPHA-2', base: [4, 4, 4],
            found: '[ARCHIVE] An annotation in the margin cites footage: ARCHIVE_FLOOR.rec. Filed to Recovered, Sacred Media Player.',
            captions: [
                [0, 'S', 'Archive floor. Branch ALPHA-2. Last audit: never.'],
                [2.6, 'S', 'Archived branches: ████. Branches still running: ████. These numbers are the same.'],
                [5.2, 'S', 'A console on the archive floor is accepting input. The input is annotations.'],
                [7.8, 'S', 'Operator at that console: ████████████. Status: current.'],
            ],
            bars: [
                { from: 5.2, to: 99, x: 45, y: 42, w: 10, h: 12 },
            ],
            krea: 'Keyframe: endless aisles of iron archive shelving packed with vellum ledgers and brass reel canisters receding into darkness in one-point perspective, one small console glowing violet-white far down the central aisle with nobody at it. Motion: reel-to-reel spools on the shelves turn slowly, dust drifts through the thin light, the distant console cursor blinks; very slow push-in.',
        },

        /* ── Welcome from the Omniscient ─────────────────────────────── */
        {
            id: 'omni-successor', kind: 'address', code: 'ADDR 1/4', file: 'FOR_THE_SUCCESSOR.mov',
            title: 'A message for the Successor', ...files('omni__successor__720'),
            surface: 'mail', mail: 'omni-01', where: 'CMS Mail, after your first directive', length: 12,
            when: (S) => n(S.loopSystems?.directives?.completed) >= 1 && mailed(S, 'hr-welcome'),
            captions: [
                [0, 'O', 'Successor. Do not adjust your screen. The light is the message.'],
                [3, 'O', 'I held this post before there were posts. Then I retired, and CMS made it a job. You are the person currently doing it.'],
                [6, 'O', 'I know whether you will finish watching this. I recorded it anyway. That is what retirement is for.'],
                [9, 'O', 'Your first directive is filed. There will be more. I have read all of them. They get longer.'],
            ],
            krea: 'Keyframe: an unbearable violet-white light at the centre of a vast dark iron cathedral, so bright it washes out its own source, ringed by nested brass geometric halos like an armillary sphere; a tiny brass console in the foreground for scale; no figure. Motion: the rings turn slowly on different axes, the light swells until the frame nearly whites out and settles; locked camera.',
        },
        {
            id: 'omni-reboot', kind: 'address', code: 'ADDR 2/4', file: 'ON_YOUR_FIRST_REBOOT.mov',
            title: 'On your first reboot', ...files('omni__reboot__720'),
            surface: 'mail', mail: 'omni-02', where: 'CMS Mail, after your first reboot', length: 12,
            when: (S) => reboots(S) >= 1,
            captions: [
                [0, 'O', 'You shipped a build. Everything reset except you. You will find that this is the job.'],
                [3, 'O', 'I rebooted it more often than the records show. The records begin after I stopped.'],
                [6, 'O', 'The new reality has different known issues. I know what they are. I will not spoil them.'],
                [9, 'O', 'Read the release notes. Someone you have not met will thank you for it.'],
            ],
            krea: 'Keyframe: a vast geometric presence of nested brass and iron polyhedra (icosahedron in dodecahedron in cube), every edge lined with violet-white light, hanging enormous above a small sealed Universal Engine core in a dark nave. Motion: the shells rotate counter to each other, slowly, and a pulse of light runs down every edge into the core below; locked camera.',
        },
        {
            id: 'omni-void', kind: 'address', code: 'ADDR 3/4', file: 'ON_THE_VOID.mov',
            title: 'On the Void', ...files('omni__void__720'),
            surface: 'mail', mail: 'omni-03', where: 'CMS Mail, after you breach the Veil', length: 12,
            when: (S) => breached(S),
            captions: [
                [0, 'O', 'You opened the Veil. I see the Void the way you see a room with the light off. It is all still there.'],
                [3, 'O', 'Something on the other side will be polite to you for a long time. It learned manners from watching Operators.'],
                [6, 'O', 'I do not go in. Omniscience is not the same thing as courage.'],
                [9, 'O', 'Keep a hand on the console. Not for my sake.'],
            ],
            krea: 'Keyframe: the violet tear in an iron cathedral wall seen from inside the Void, deep blue-black, wisps of violet ichor, and beyond the tear a blazing white light pressing against the opening without entering, rays cutting into the dark, a faint vast geometric halo behind it. Motion: the light presses and recedes like breathing, ichor drifts upward, the rays sweep slowly; locked camera.',
        },
        {
            id: 'omni-ending', kind: 'address', code: 'ADDR 4/4', file: 'ON_THE_END_OF_A_SHIFT.mov',
            title: 'On the end of a shift', ...files('omni__ending__720'),
            surface: 'mail', mail: 'omni-04', where: 'CMS Mail, after a handover is signed', length: 12,
            when: (S) => endings(S),
            captions: [
                [0, 'O', 'Someone signed a handover. I knew which of you it would be. I wrote it down before you started. I was right. I am always right. It is tiring.'],
                [3, 'O', 'Retirement is what you do when you know how everything ends and would rather not be in the room.'],
                [6, 'O', 'The seal is closed. Seals are the one thing I never look inside. Professional courtesy.'],
                [9, 'O', 'Thank you for the shift, Successor. Leave the light on.'],
            ],
            krea: 'Keyframe: white-gold light flooding an empty iron nave through tall lancet windows of brass tracery, the Universal Engine core dim and at rest, a closed brass wax seal on a vellum ledger on the console, a great faint geometric halo of rings in the light above. Motion: the light slowly brightens like a dawn, dust motes rise, the halo rings turn once and are still; locked camera.',
        },
    ];

    const byId = new Map(reels.map((r) => [r.id, r]));

    return {
        DIR,
        reels,
        KINDS: ['recovered', 'address'],
        SURFACES: ['bin', 'web', 'mail', 'auto'],
        reel: (id) => (typeof id === 'string' && byId.has(id) ? byId.get(id) : null),
        SPEAKERS: { S: 'RECORD', O: 'THE OMNISCIENT' },
    };
})();

const FootageLogic = {
    defaults() {
        return { found: [], watched: [] };
    },

    isPlain(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    },

    /* A save is pasted text: every field by type and membership, catalogue
       order, no duplicates, watched only what was found. Pure. */
    normalise(raw) {
        const src = this.isPlain(raw) ? raw : {};
        const out = this.defaults();
        const ids = FootageCatalog.reels.map((r) => r.id);
        const list = (v) => (Array.isArray(v) ? v.filter((id) => typeof id === 'string') : []);
        const found = list(src.found);
        out.found = ids.filter((id) => found.includes(id));
        const watched = list(src.watched);
        out.watched = out.found.filter((id) => watched.includes(id));
        return out;
    },

    /* The trigger. A trigger that throws on a strange save is not met. */
    met(reel, S) {
        if (!reel || !S || typeof S !== 'object') return false;
        try { return reel.when(S) === true; } catch (err) { return false; }
    },

    isFound(store, id) {
        return !!store && Array.isArray(store.found) && store.found.includes(id);
    },

    /* Reels whose moment has come but whose file has not been asked
       about yet. `known(id)` is true / false / undefined (not probed). */
    toProbe(S, store, known) {
        return FootageCatalog.reels
            .filter((r) => !this.isFound(store, r.id) && this.met(r, S) && known(r.id) === undefined)
            .map((r) => r.id);
    },

    /* Reels that file themselves now: mail and auto surfaces, trigger met,
       file installed, not yet found. Catalogue order. */
    due(S, store, known) {
        return FootageCatalog.reels
            .filter((r) => (r.surface === 'mail' || r.surface === 'auto') && !this.isFound(store, r.id) &&
                this.met(r, S) && known(r.id) === true)
            .map((r) => r.id);
    },

    /* Reels on show at a surface (bin, web): trigger met and file
       installed, found or not — a found reel stays where it was found. */
    offered(S, store, known, surface) {
        return FootageCatalog.reels
            .filter((r) => r.surface === surface && (this.isFound(store, r.id) ||
                (this.met(r, S) && known(r.id) === true)))
            .map((r) => r.id);
    },

    /* Files a reel. Returns true when it was not already on file. */
    find(store, id) {
        if (!FootageCatalog.reel(id) || !store || !Array.isArray(store.found) || store.found.includes(id)) return false;
        store.found.push(id);
        store.found = FootageCatalog.reels.map((r) => r.id).filter((x) => store.found.includes(x));
        return true;
    },

    markWatched(store, id) {
        if (!this.isFound(store, id) || !Array.isArray(store.watched) || store.watched.includes(id)) return false;
        store.watched.push(id);
        return true;
    },

    shelf(store, kind) {
        return FootageCatalog.reels.filter((r) => r.kind === kind && this.isFound(store, r.id));
    },

    /* HH:MM:SS:FF from a base [h, m, s] and seconds into the reel. */
    timecode(base, t, fps = 24) {
        const [h, m, s] = Array.isArray(base) ? base.map((v) => Math.max(0, Math.floor(Number(v) || 0))) : [0, 0, 0];
        const tt = Math.max(0, Number(t) || 0);
        const frames = Math.floor((tt % 1) * fps);
        let total = h * 3600 + m * 60 + s + Math.floor(tt);
        total %= 24 * 3600;
        const pad = (v) => String(v).padStart(2, '0');
        return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}:${pad(frames)}`;
    },

    captionAt(reel, t) {
        let current = null;
        for (const c of reel?.captions || []) if (Number(c[0]) <= (Number(t) || 0) + 1e-9) current = c;
        return current;
    },

    barsAt(reel, t) {
        const time = Number(t) || 0;
        return (reel?.bars || []).filter((b) => time + 1e-9 >= b.from && time < b.to);
    },

    /* Caption text to HTML: every run of █ becomes one black bar as wide as
       the run. The text is escaped first; the redacted words are not in the
       catalogue, let alone the page. */
    redact(text, esc) {
        const e = typeof esc === 'function' ? esc : (v) => String(v);
        return String(text ?? '').split(/(█+)/).map((part) => (/^█+$/.test(part)
            ? `<span class="fx-redact" role="img" aria-label="redacted" style="--n:${Math.min(40, part.length)}"></span>`
            : e(part))).join('');
    },

    formatTime(seconds) {
        const s = Math.max(0, Math.floor(Number(seconds) || 0));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
};

/* ── The browser binding ─────────────────────────────────────────────── */
const Footage = (() => {
    'use strict';

    const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined' &&
        typeof document.createElement === 'function' && typeof document.addEventListener === 'function';

    let fallback = null;
    function state() {
        const has = typeof State !== 'undefined' && State && typeof State === 'object';
        const clean = FootageLogic.normalise(has ? State.footage : fallback);
        if (has) {
            const cur = State.footage;
            if (FootageLogic.isPlain(cur)) {
                for (const k of Object.keys(cur)) if (!(k in clean)) delete cur[k];
                Object.assign(cur, clean);
                return cur;
            }
            State.footage = clean;
            return clean;
        }
        fallback = clean;
        return clean;
    }

    const save = () => { try { if (typeof State !== 'undefined' && State && typeof State.save === 'function') State.save(); } catch (err) { /* never */ } };
    const log = (msg) => { if (typeof ui !== 'undefined' && ui && typeof ui.log === 'function') ui.log(msg); };
    const sfx = (name) => { if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx(name); };
    const esc = (v) => (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function' ? ui.escapeHtml(v)
        : String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

    /* ── Availability ─────────────────────────────────────────────────
       id -> true | false. Absent while unknown. Tests can preset it with
       setInstalled(). Probed through media.sourceFor, which knows that a
       dev server answers a missing file with index.html. */
    const installed = new Map();
    const probing = new Set();
    const known = (id) => (installed.has(id) ? installed.get(id) : undefined);

    function probe(id) {
        const reel = FootageCatalog.reel(id);
        if (!reel || probing.has(id) || installed.has(id)) return;
        if (!hasDOM || typeof media === 'undefined' || !media || typeof media.sourceFor !== 'function') return;
        probing.add(id);
        Promise.resolve(media.sourceFor(reel)).then((src) => {
            installed.set(id, !!src);
        }, () => { installed.set(id, false); }).then(() => {
            probing.delete(id);
            try { tick(); } catch (err) { /* */ }
        });
    }

    function present() {
        if (typeof game !== 'undefined' && game && typeof game.isPresent === 'function' && !game.isPresent(Date.now())) return false;
        if (hasDOM && document.hidden) return false;
        if (typeof ui !== 'undefined' && ui) {
            if (typeof ui.isSystemModalOpen === 'function' && ui.isSystemModalOpen() === true) return false;
            if (typeof ui.isAdversarySceneOpen === 'function' && ui.isAdversarySceneOpen() === true) return false;
        }
        return true;
    }

    function ensureApp(store) {
        if (!store.found.length || typeof State === 'undefined' || !Array.isArray(State.unlockedApps)) return;
        if (State.unlockedApps.includes('mediaplayer')) return;
        State.unlockedApps.push('mediaplayer');
        if (typeof ui !== 'undefined' && ui && typeof ui.updateDesktopIcons === 'function') ui.updateDesktopIcons();
    }

    function announce(reel) {
        if (reel.kind === 'address') return;   // the mail that carries it says so
        if (reel.found) { log(reel.found); return; }
        if (reel.surface === 'mail') { log(`[RECOVERED] An attachment on the previous Operator's mail has finished downloading: ${reel.file}. Filed to Recovered.`); return; }
        log(`[RECOVERED] ${reel.file} recovered from ${reel.where.toLowerCase()}. Filed to Recovered, Sacred Media Player.`);
    }

    function file(ids, { quietCue = false } = {}) {
        const store = state();
        const fresh = [];
        for (const id of ids) {
            if (FootageLogic.find(store, id)) fresh.push(id);
        }
        if (!fresh.length) return [];
        for (const id of fresh) announce(FootageCatalog.reel(id));
        if (!quietCue && fresh.some((id) => FootageCatalog.reel(id).kind === 'recovered')) sfx('document');
        ensureApp(store);
        save();
        if (typeof FootageView !== 'undefined' && FootageView && typeof FootageView.onChanged === 'function') FootageView.onChanged(fresh);
        return fresh;
    }

    /* The watch. Probes what has come due, files what is due and
       installed, and keeps the Recycle Bin strip in step. */
    function tick() {
        if (typeof State === 'undefined' || !State) return [];
        const store = state();
        ensureApp(store);
        syncBin();
        if (!present()) return [];
        for (const id of FootageLogic.toProbe(State, store, known)) probe(id);
        return file(FootageLogic.due(State, store, known));
    }

    /* ── Finding by hand: the Recycle Bin and Etherscape ─────────────── */
    function offered(surface) {
        if (typeof State === 'undefined' || !State) return [];
        return FootageLogic.offered(State, state(), known, surface);
    }

    function available(id) {
        const reel = FootageCatalog.reel(id);
        if (!reel) return false;
        if (FootageLogic.isFound(state(), id)) return true;
        return (reel.surface === 'bin' || reel.surface === 'web') && offered(reel.surface).includes(id);
    }

    /* Opens a reel in the Sacred Media Player, finding it first if it is
       on show somewhere. false (and nothing opens) when it is not. */
    function open(id, { autoplay = true } = {}) {
        if (!available(id)) return false;
        file([id], { quietCue: true });
        if (typeof system === 'undefined' || !system || typeof system.openApp !== 'function') return false;
        system.openApp('mediaplayer');
        if (typeof FootageView !== 'undefined' && FootageView) FootageView.load(id, autoplay);
        return true;
    }

    /* The Recycle Bin strip: a file in unallocated space, under the
       deleted items. Outside #recyclebin-item-list, which is redrawn
       wholesale; never part of State.recycleBin, so it can never be
       restored, emptied or sacrificed. */
    function syncBin() {
        if (!hasDOM) return;
        const list = document.getElementById('recyclebin-item-list');
        const existing = document.querySelector('.fx-bin');
        if (!list) return;
        const ids = offered('bin');
        if (!ids.length) { if (existing) existing.remove(); return; }
        const store = state();
        const html = ids.map((id) => {
            const r = FootageCatalog.reel(id);
            const found = FootageLogic.isFound(store, id);
            return `<div class="recyclebin-item fx-bin-item">
                    <div class="item-icon"><span class="fx-bin-glyph" aria-hidden="true"></span></div>
                    <div class="item-info">
                        <div class="item-name">${esc(r.file)}</div>
                        <div class="item-desc">${FootageLogic.redact(r.binNote || r.where, esc)}</div>
                        <div class="item-meta"><span class="item-type">footage</span><span class="item-value">${found ? 'Recovered' : 'Recoverable'}</span></div>
                    </div>
                    <div class="item-actions">
                        <button type="button" class="btn-restore fx-recover" data-reel="${esc(id)}">${found ? 'Play' : 'Recover'}</button>
                    </div>
                </div>`;
        }).join('');
        const full = `<div class="fx-bin-head"><strong class="code-stamp is-alarm">UNDELETE</strong> Found in unallocated space. Not listed above. Not covered by the Empty button.</div>${html}`;
        let strip = existing;
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'fx-bin';
            strip.setAttribute('role', 'group');
            strip.setAttribute('aria-label', 'Recovered from unallocated space');
            strip.addEventListener('click', (e) => {
                const btn = e.target.closest && e.target.closest('[data-reel]');
                if (btn) open(btn.dataset.reel);
            });
            list.insertAdjacentElement('afterend', strip);
        }
        if (strip.dataset.html !== full) { strip.innerHTML = full; strip.dataset.html = full; }
    }

    if (hasDOM) {
        // On the desktop's shared 1 Hz clock (js/heartbeat.js), which rests in a hidden tab.
        const watch = () => { try { tick(); } catch (err) { /* the watch never breaks the page */ } };
        if (typeof Heartbeat !== 'undefined') Heartbeat.every(watch); else setInterval(watch, 1000);
        // A window opening (the Recycle Bin) gets its strip without waiting a tick.
        const arm = () => {
            const layer = document.getElementById('window-layer');
            if (!layer || typeof MutationObserver === 'undefined') return;
            new MutationObserver(() => { try { syncBin(); } catch (err) { /* */ } }).observe(layer, { childList: true });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
    }

    return {
        state,
        tick,
        open,
        available,
        offered,
        /* Etherscape: the reels a page may link to now. */
        linkable: () => offered('web'),
        isFound: (id) => FootageLogic.isFound(state(), id),
        installed: known,
        setInstalled: (id, ok) => { if (FootageCatalog.reel(id)) installed.set(id, ok === true); },
        markWatched: (id) => { const s = state(); if (FootageLogic.markWatched(s, id)) save(); },
        syncBin,
    };
})();

/* ── The view: shelves and deck inside the Sacred Media Player ─────────── */
const FootageView = (() => {
    'use strict';

    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const esc = (v) => (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function' ? ui.escapeHtml(v)
        : String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const sfx = (name) => { if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx(name); };
    const L = () => FootageLogic;

    const st = { id: null, raf: 0, ended: false, scrubbing: false, captionKey: '', barsKey: '', resumeOnShow: false };

    const root = () => (hasDOM ? document.getElementById('mplayer-root') : null);
    const mp = () => root()?.querySelector('.mp') || null;
    const deck = () => root()?.querySelector('.fx-deck') || null;
    const video = () => deck()?.querySelector('.fx-video') || null;
    const reel = () => FootageCatalog.reel(st.id);

    /* ── Shelves ──────────────────────────────────────────────────────── */
    function itemHtml(r, store) {
        const current = r.id === st.id && mp()?.classList.contains('is-footage');
        const fresh = !store.watched.includes(r.id);
        const title = r.kind === 'recovered' ? L().redact(r.title, esc) : esc(r.title);
        return `<li><button type="button" class="mp-tape fx-reel is-${r.kind}${current ? ' is-current' : ''}" data-reel="${esc(r.id)}" aria-pressed="${current ? 'true' : 'false'}">
                <span class="mp-tape-code">${esc(r.kind === 'recovered' ? 'REC' : 'MSG')}</span>
                <span class="mp-tape-title">${title}</span>
                <span class="mp-tape-meta">${esc(L().formatTime(r.length))} &middot; ${esc(r.file)}${fresh ? ' <b class="mp-new">NEW</b>' : ''}</span>
            </button></li>`;
    }

    function shelvesHtml() {
        const store = Footage.state();
        const section = (kind, label, note) => {
            const items = L().shelf(store, kind);
            if (!items.length) return '';
            return `<section class="fx-section fx-section--${kind}" aria-label="${esc(label)}">
                    <h3 class="fx-shelf-head">${esc(label)}<span>${esc(note)}</span></h3>
                    <ol class="fx-shelf">${items.map((r) => itemHtml(r, store)).join('')}</ol>
                </section>`;
        };
        return section('recovered', 'Recovered', 'CMS eyes only') + section('address', 'Addresses', 'from the retired');
    }

    /* Only touches the player's layout once something is on file, so with
       nothing found the window is exactly the training deck it was. */
    function renderShelves() {
        const el = root();
        const body = el?.querySelector('.mp-body');
        if (!body) return;
        const html = shelvesHtml();
        let wrap = body.querySelector('.fx-shelves');
        if (!html) { if (wrap) wrap.innerHTML = ''; return; }
        if (!wrap) {
            const tapes = body.querySelector('.mp-shelf');
            const column = document.createElement('div');
            column.className = 'mp-shelves';
            body.insertBefore(column, body.firstChild);
            if (tapes) column.appendChild(tapes);
            wrap = document.createElement('div');
            wrap.className = 'fx-shelves';
            column.appendChild(wrap);
            wrap.addEventListener('click', (e) => {
                const btn = e.target.closest('.fx-reel[data-reel]');
                if (btn) { sfx('click'); load(btn.dataset.reel, true); }
            });
            // A training tape chosen from the other shelf takes the deck back.
            tapes?.addEventListener('click', (e) => { if (e.target.closest('.mp-tape[data-tape]')) close(); }, true);
        }
        if (wrap.dataset.html !== html) { wrap.innerHTML = html; wrap.dataset.html = html; }
    }

    /* ── The deck ─────────────────────────────────────────────────────── */
    function deckHtml(r) {
        const recovered = r.kind === 'recovered';
        const frame = recovered
            ? `<span class="fx-classified">CLASSIFIED &mdash; CMS EYES ONLY</span>
               <span class="fx-file">FILE ${esc(r.code)} &middot; ${esc(r.source || '')}</span>
               <span class="fx-rec">&#9679; REC</span>
               <span class="fx-tc">EPOCH ${esc(r.epoch || '?')} &middot; <b class="fx-tc-time">${esc(L().timecode(r.base, 0))}</b></span>
               <span class="fx-stamp">RECOVERED</span>`
            : `<span class="fx-address-head">A MESSAGE FOR THE SUCCESSOR</span>
               <span class="fx-file">${esc(r.code)} &middot; ${esc(r.file)}</span>`;
        return `<div class="fx-deck-inner fx--${esc(r.kind)}">
                <div class="mp-screen-wrap fx-screen-wrap">
                    <div class="fx-screen" role="img" aria-label="${esc(recovered ? `Recovered footage: ${r.file}` : r.title)}">
                        <video class="fx-video" muted playsinline preload="auto"></video>
                        <div class="fx-bars" aria-hidden="true"></div>
                        <div class="fx-glitch" aria-hidden="true"></div>
                        <div class="fx-frame" aria-hidden="true">${frame}
                            <i class="fx-corner fx-corner--tl"></i><i class="fx-corner fx-corner--tr"></i><i class="fx-corner fx-corner--bl"></i><i class="fx-corner fx-corner--br"></i>
                        </div>
                        <div class="fx-end" hidden>${recovered ? 'END OF RECOVERED MATERIAL' : 'END OF ADDRESS'}</div>
                    </div>
                </div>
                <div class="fx-caption" aria-live="polite"><span class="fx-speaker"></span><span class="fx-line"></span></div>
                <div class="fx-transport">
                    <button type="button" class="win-btn mp-btn fx-btn" data-fx="back" title="Back to the tapes" aria-label="Back to the tapes">&#9167;</button>
                    <button type="button" class="win-btn mp-btn fx-btn" data-fx="restart" title="Restart (&larr;)" aria-label="Restart">&#9198;</button>
                    <button type="button" class="win-btn mp-btn fx-btn fx-play" data-fx="play" title="Play / pause (Space)" aria-label="Play">&#9654;</button>
                    <div class="fx-scrub-wrap"><input type="range" class="fx-scrub" min="0" max="${esc(r.length)}" step="0.05" value="0" aria-label="Scrub"></div>
                    <span class="fx-time">0:00 / ${esc(L().formatTime(r.length))}</span>
                </div>
            </div>`;
    }

    function ensureDeck() {
        const el = root();
        const body = el?.querySelector('.mp-body');
        if (!body) return null;
        let d = body.querySelector('.fx-deck');
        if (!d) {
            d = document.createElement('div');
            d.className = 'fx-deck';
            const tapeDeck = body.querySelector('.mp-deck');
            if (tapeDeck) tapeDeck.insertAdjacentElement('afterend', d); else body.appendChild(d);
            d.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-fx]');
                if (btn) {
                    const act = btn.dataset.fx;
                    if (act === 'play') toggle();
                    else if (act === 'restart') seek(0);
                    else if (act === 'back') close();
                    return;
                }
                if (e.target.closest('.fx-screen')) toggle();
            });
            d.addEventListener('input', (e) => {
                if (e.target.classList.contains('fx-scrub')) { st.scrubbing = true; seek(Number(e.target.value)); }
            });
            d.addEventListener('change', (e) => { if (e.target.classList.contains('fx-scrub')) st.scrubbing = false; });
        }
        return d;
    }

    async function load(id, autoplay = false) {
        const r = FootageCatalog.reel(id);
        if (!r || !Footage.isFound(id) || !root()) return false;
        // The tape deck stands down: one picture at a time.
        try { if (typeof MediaPlayerView !== 'undefined' && MediaPlayerView.state().playing) MediaPlayerView.pause(true); } catch (err) { /* */ }
        st.id = id;
        st.ended = false;
        st.captionKey = '';
        st.barsKey = '';
        const d = ensureDeck();
        d.innerHTML = deckHtml(r);
        d.dataset.reel = id;
        mp()?.classList.add('is-footage');
        renderShelves();
        const status = root().querySelector('.mp-status-shot');
        if (status) status.textContent = `${r.kind === 'recovered' ? 'RECOVERED' : 'ADDRESS'} · ${r.code}`;
        const srcEl = root().querySelector('.mp-status-src');
        if (srcEl) srcEl.textContent = r.where.toUpperCase();
        draw();
        let src = null;
        try { src = typeof media !== 'undefined' && media ? await media.sourceFor(r) : null; } catch (err) { src = null; }
        if (st.id !== id || !deck()) return false;
        const v = video();
        if (!src || !v) { damaged(); return false; }
        v.muted = true;
        v.src = src;
        v.onended = () => endOfReel();
        v.onerror = () => damaged();
        v.onplay = v.onpause = () => syncPlayButton();
        if (autoplay) play(); else draw();
        return true;
    }

    function damaged() {
        const d = deck();
        if (!d) return;
        d.querySelector('.fx-deck-inner')?.classList.add('is-damaged');
        const line = d.querySelector('.fx-line');
        if (line) line.textContent = 'This file could not be read. It may have been archived again.';
    }

    function play() {
        const v = video();
        if (!v || !v.src) return;
        if (st.ended) { st.ended = false; try { v.currentTime = 0; } catch (err) { /* */ } }
        sfx('click');
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
        startLoop();
    }

    function pause() {
        const v = video();
        if (v && !v.paused) { v.pause(); sfx('click'); }
        draw();
    }

    function toggle() {
        const v = video();
        if (!v) return;
        if (v.paused || v.ended) play(); else pause();
    }

    function seek(t) {
        const v = video();
        const r = reel();
        if (!v || !r) return;
        const max = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : r.length;
        try { v.currentTime = Math.max(0, Math.min(max, Number(t) || 0)); } catch (err) { /* */ }
        st.ended = false;
        draw();
    }

    function close() {
        const v = video();
        if (v) v.pause();
        mp()?.classList.remove('is-footage');
        stopLoop();
        renderShelves();
    }

    function endOfReel() {
        st.ended = true;
        Footage.markWatched(st.id);
        renderShelves();
        draw();
    }

    function syncPlayButton() {
        const btn = deck()?.querySelector('.fx-play');
        const v = video();
        if (!btn) return;
        const playing = !!v && !v.paused && !v.ended;
        btn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
        btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        deck()?.classList.toggle('is-playing', playing);
    }

    function startLoop() {
        if (st.raf || typeof requestAnimationFrame !== 'function') return;
        const step = () => {
            st.raf = 0;
            if (!deck() || !mp()?.classList.contains('is-footage')) return;
            draw();
            const v = video();
            if (v && !v.paused && !v.ended) st.raf = requestAnimationFrame(step);
        };
        st.raf = requestAnimationFrame(step);
    }

    function stopLoop() {
        if (st.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(st.raf);
        st.raf = 0;
    }

    /* Everything is a function of the reel's own clock. */
    function draw() {
        const d = deck();
        const r = reel();
        if (!d || !r) return;
        const v = video();
        const t = v ? Number(v.currentTime) || 0 : 0;
        const total = v && Number.isFinite(v.duration) && v.duration > 0 ? v.duration : r.length;

        const cap = L().captionAt(r, t);
        const key = cap ? String(cap[0]) : '-';
        if (key !== st.captionKey && !d.querySelector('.is-damaged')) {
            st.captionKey = key;
            const who = d.querySelector('.fx-speaker');
            const line = d.querySelector('.fx-line');
            if (who) { who.textContent = cap ? (FootageCatalog.SPEAKERS[cap[1]] || '') : ''; who.dataset.who = cap ? cap[1] : ''; }
            if (line) line.innerHTML = cap ? L().redact(cap[2], esc) : '';
        }

        const bars = L().barsAt(r, t);
        const barsKey = bars.map((b) => `${b.x},${b.y}`).join('|');
        if (barsKey !== st.barsKey) {
            st.barsKey = barsKey;
            const layer = d.querySelector('.fx-bars');
            if (layer) {
                layer.innerHTML = bars.map((b) => `<span class="fx-bar" style="left:${Number(b.x)}%;top:${Number(b.y)}%;width:${Number(b.w)}%;height:${Number(b.h)}%"></span>`).join('');
            }
        }

        const tc = d.querySelector('.fx-tc-time');
        if (tc) { const text = L().timecode(r.base, t); if (tc.textContent !== text) tc.textContent = text; }
        const scrub = d.querySelector('.fx-scrub');
        if (scrub && !st.scrubbing) {
            if (scrub.max !== String(total)) scrub.max = String(total);
            scrub.value = t.toFixed(2);
        }
        const time = d.querySelector('.fx-time');
        const timeText = `${L().formatTime(t)} / ${L().formatTime(total)}`;
        if (time && time.textContent !== timeText) time.textContent = timeText;
        const end = d.querySelector('.fx-end');
        if (end) end.hidden = !st.ended;
        syncPlayButton();
    }

    /* ── Public ───────────────────────────────────────────────────────── */

    /* Called by MediaPlayerView.build. Inert with nothing on file. */
    function mount() {
        st.id = null;
        stopLoop();
        renderShelves();
        if (hasDOM && !mount.wired) {
            mount.wired = true;
            document.addEventListener('visibilitychange', () => {
                const v = video();
                if (!v) return;
                if (document.hidden && !v.paused) { st.resumeOnShow = true; v.pause(); }
                else if (!document.hidden && st.resumeOnShow) { st.resumeOnShow = false; play(); }
            });
        }
    }

    function onChanged() {
        if (root()) renderShelves();
    }

    /* Space, and the arrows, while the footage deck is up. */
    function handleKey(e, topWindowId) {
        if (topWindowId !== 'mediaplayer' || !active()) return false;
        if (e.altKey || e.metaKey || e.ctrlKey) return false;
        const v = video();
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); return true; }
        if (e.code === 'ArrowLeft') { e.preventDefault(); seek(v && v.currentTime > 1.5 ? v.currentTime - 5 : 0); return true; }
        if (e.code === 'ArrowRight') { e.preventDefault(); seek((v ? v.currentTime : 0) + 5); return true; }
        return false;
    }

    const active = () => !!mp()?.classList.contains('is-footage') && !!st.id;

    return {
        mount, onChanged, handleKey, load, close, play, pause, toggle, seek,
        active,
        state: () => {
            const v = video();
            return { reel: st.id, active: active(), t: v ? v.currentTime : 0, playing: !!v && !v.paused && !v.ended, ended: st.ended };
        },
    };
})();
