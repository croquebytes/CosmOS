/* ════════════════════════════════════════════════════════════════════════
   CosmOS media — cinematics, and the training tapes' catalogue.

   Moving pictures are a decoration on moments the game already has: the
   release seal, the first Seraph, the Veil tearing, the cold boot. So the
   whole layer is built around one promise — WITH NO FILES INSTALLED THE GAME
   BEHAVES EXACTLY AS IT DID BEFORE THIS FILE EXISTED. Every reel is optional;
   the user drops them into assets/video/ as they come out of Krea, and a
   scene whose file is not there is skipped without a frame of player.

   ── The contracts ───────────────────────────────────────────────────────

   NEVER OVER A DIALOG. #system-modal-layer is a single slot that every
   system dialog shares, and the rule since cc11f22 is render-or-retry: a
   dialog that finds the slot taken does not paint, and does not count itself
   delivered. A cinematic follows the same rule. It queues, and plays when the
   slot is clear. While it plays it OCCUPIES the slot — the layer is marked
   active — so a cascade warning, an outage or the Adversary scene that turns
   up mid-reel defers to it in turn, by the rules they already follow.

   SEEN MEANS SEEN. A scene goes into the seen-set only once it actually
   played (to the end, or skipped by the player, or shown as a still under
   reduced motion). Queued, interrupted, failed or missing never count —
   the same mistake cc11f22 fixed for cascade alerts, avoided up front.

   NEVER A BROKEN PLAYER. Availability is probed (a HEAD request, or the
   element's own error event where fetch cannot reach the file) before a
   stage is built. Vite answers a missing file with index.html and a 200, so
   a response that is HTML is a miss. A reel that fails mid-load ends the
   cinematic quietly and is not marked seen.

   NEVER A DELAY. A hook asks and moves on: media.play() returns a promise
   that always resolves (never rejects) with what happened. The one flow that
   waits is the ship: its release notes hold until the V2 reel is done, which
   is the point of V2. With nothing installed that hold lasts one HEAD
   request.

   ── Layout of this file ─────────────────────────────────────────────────
     MediaCatalog   data: scenes, tapes, shots, and the drop-in filenames.
     MediaLogic     pure functions — settings, decisions, tape unlocks, the
                    tape clock. No DOM. tests/media.mjs loads this in a vm.
     createMediaDirector(env)
                    the queue and the seen-set, with every effect injected so
                    the ordering can be tested against a fake modal.
     media          the browser binding: probes, the cinematic stage, the
                    settings, the tape-unlock watch. Inert without a DOM.

   Sound goes through game.sfx only, so the mixer and its settings stay one
   system. Reels are always muted.
   ════════════════════════════════════════════════════════════════════════ */

const MediaCatalog = (() => {
    const DIR = 'assets/video/';
    /* One stem, three files: VP9 WebM first, H.264 MP4 as the fallback, and
       a WebP poster that reduced motion shows instead of the reel. Named per
       docs/VISUAL_UPGRADE_PLAN.md §5: system__subject__size. */
    const files = (stem) => ({
        stem,
        webm: `${DIR}${stem}.webm`,
        mp4: `${DIR}${stem}.mp4`,
        poster: `${DIR}${stem}.webp`,
    });

    /* The cinematics. `cue` is a game.sfx name rung when the reel starts;
       `mode` is how it is framed: overlay (full frame), blend (screen-blended
       so black drops out — Krea video has no alpha), or window (inside
       CosmOS chrome). Captions are HTML, never baked into the art. */
    const scene = (code, slug, extra) => ({ id: slug, code, ...files(`cine__${slug}__720`), ...extra });
    const scenes = {
        'cold-boot': scene('V1', 'cold-boot', {
            title: 'Cold Boot', mode: 'blend', cue: 'boot', length: 8,
            caption: 'Power-on self test complete. Divine core ignition confirmed.',
            krea: 'Keyframe: a colossal dormant iron reliquary-computer in a dark nave, one brass status lamp. Motion: the lamp flickers on, a cascade of brass relays wakes outward and the core ignites violet-white; slow push-in.',
        }),
        'ship-the-build': scene('V2', 'ship-the-build', {
            // ui.confirmShip already rings 'ship'; a second cue would double it.
            title: 'Ship the Build', mode: 'overlay', cue: null, length: 6,
            caption: 'Release signed and sealed. Sector 7G is rebooting.',
            krea: 'Keyframe: the engine core sealed by a brass wax-seal stamp the size of a door. Motion: the stamp slams, light floods the seams, the machine powers down into a single star point, then the frame snaps to black.',
        }),
        'void-breach': scene('V5', 'void-breach', {
            title: 'Void Breach', mode: 'blend', cue: 'adversary', length: 6,
            caption: 'Veil breached. The Void Dimension is now in scope.',
            krea: 'Keyframe: an iron cathedral wall with a vertical tear of violet light. Motion: the tear opens like an iris and wraith-light pours in; camera holds.',
        }),
        'mirror-login': scene('V4', 'mirror-login', {
            // The Adversary scene opens straight after; its own glitch cue
            // would double a cue here, so the reel is silent.
            title: 'Mirror Login', mode: 'overlay', cue: null, length: 6,
            caption: 'Session conflict: Operator already logged in.',
            krea: 'Keyframe: a CRT monitor set in the iron housing showing a dark silhouette identical to the viewer. Motion: the silhouette tilts its head a frame early; scanlines tear; symmetry breaks.',
        }),
        'first-seraph': scene('V6', 'first-seraph', {
            title: 'First Seraph', mode: 'window', cue: 'directive', length: 4,
            caption: 'Seraphic Automaton #1 commissioned. It has already started.',
            krea: 'Keyframe: a six-winged angel built from brass organ pipes and iron plating, folded and dormant. Motion: the wings unfold section by section like a machine deploying, and its halo-gear starts turning.',
        }),
    };

    /* ── Training tapes: "CMS Operator Orientation" ─────────────────────
       A tape is a run of shots. A shot is a card (title text, always HTML)
       or a picture: its reel when tape__<tape>__shot<n>__720.webm is
       installed, and until then a fallback slide composed from art the game
       already ships, with a slow camera move and timed captions.

       Captions are [atSeconds, speaker, text]; speakers are I (the
       Instructor), N (NULL.OPERATOR), S (a system notice). Every mechanical
       claim below is checked against the code that implements it — the
       comedy is in the deadpan, never in getting the rules wrong. */
    const A = (path) => `assets/${path}`;
    const BG = { primordial: A('backgrounds/desktop_primordial.webp'), void: A('backgrounds/desktop_void.webp'), restored: A('backgrounds/desktop_restored.webp') };
    const CORE = { idle: A('core/core_idle_256.png'), charging: A('core/core_charging_256.png'), overclocked: A('core/core_overclocked_256.png'), void: A('core/core_void_256.png') };
    const FX = { flare: A('vfx/flare_256.png'), halo: A('vfx/halo_256.png'), motes: A('vfx/motes_256.png'), sigil: A('vfx/sigil_256.png') };
    const ICON = (name) => A(`icons/${name}_96.png`);

    const tapes = [
        {
            id: 't1', code: 'T1', title: 'Welcome to Sector 7G',
            teaches: 'Miracles and the Universal Engine',
            hint: 'Filed after your tenth Miracle.',
            unlock: (S) => Number(S.totalClicks) >= 10,
            shots: [
                { card: { kicker: 'Celestial Micro-Systems · Operator Orientation', title: 'Welcome to Sector 7G', sub: 'Tape 1 of 5 · Miracles and the Universal Engine' },
                  dur: 4.5, cue: 'windowOpen',
                  captions: [[0.8, 'S', 'This tape is the property of Celestial Micro-Systems. Do not tape over it.']] },
                { art: { bg: BG.primordial, subject: CORE.idle, fx: FX.motes, label: 'Fig. 1 — The Universal Engine' }, move: 'push', dur: 8,
                  about: 'The Instructor gestures at the Universal Engine.',
                  captions: [[0, 'I', 'Good morning, Successor. This is the Universal Engine. It makes Praise, and Praise is what the universe runs on.'],
                             [4.2, 'I', 'The previous Operator left it in this condition. We will not be dwelling on that.']] },
                { art: { bg: BG.primordial, subject: CORE.charging, fx: FX.flare, label: 'Fig. 2 — Perform Miracle' }, move: 'pull', dur: 8, cue: 'click',
                  about: 'A hand presses the brass Miracle key; the core answers.',
                  captions: [[0, 'I', 'Press Perform Miracle, or the Space bar. Each press is one Miracle, and each Miracle is paid in Praise.'],
                             [4.2, 'I', 'Press again within two and a half seconds and they chain into a Streak. A Streak pays more per press.']] },
                { art: { bg: BG.primordial, subject: CORE.overclocked, fx: FX.motes, label: 'Fig. 3 — Celestial Overclock' }, move: 'rise', dur: 8,
                  about: 'Motes rise from the core as the charge meter fills.',
                  captions: [[0, 'I', 'Every Miracle also charges the Celestial Overclock. A longer Streak charges it faster.'],
                             [4.2, 'I', 'At one hundred charge, trigger it: thirty seconds of half again the production, and stronger Miracles.']] },
                { art: { bg: BG.primordial, subject: FX.sigil, fx: FX.halo, label: 'Fig. 4 — The Praise vault' }, move: 'panR', dur: 8,
                  about: 'A vault seal, half of it dark: the Sector 7G partition.',
                  captions: [[0, 'I', 'Praise is kept in a vault, and the vault has a ceiling. Sector 7G is currently running on half of one.'],
                             [4.2, 'I', 'When the readout says STORAGE FULL, further Praise is discarded. Standing Requisitions buy more vault.']] },
                { art: { bg: BG.restored, subject: FX.halo, fx: FX.motes }, move: 'pull', dur: 7.5,
                  about: 'The Instructor, framed like a 1994 HR presenter, points off-screen to the next tape.',
                  captions: [[0, 'I', 'Your first Divine Directive is ten Miracles. Claim the reward, then spend ten Praise on a Seraph.'],
                             [4.0, 'I', 'That is the next tape. Please rewind this one.']] },
            ],
        },
        {
            id: 't2', code: 'T2', title: 'Commissioning Your First Seraph',
            teaches: 'Automation and the production chain',
            hint: 'Filed with your first Seraph.',
            unlock: (S) => Number(S.achievementProgress?.buy_seraph_count) >= 1 || Number(S.automatons?.seraphCount) >= 1,
            shots: [
                { card: { kicker: 'Celestial Micro-Systems · Operator Orientation', title: 'Commissioning Your First Seraph', sub: 'Tape 2 of 5 · Automation and the choir' },
                  dur: 4, cue: 'windowOpen', captions: [] },
                { art: { bg: BG.primordial, subject: FX.halo, fx: FX.flare, label: 'Fig. 1 — Seraphic Automaton' }, move: 'push', dur: 8,
                  about: 'A six-winged Seraph of brass organ pipes unfolds (the First Seraph reel, reused).',
                  captions: [[0, 'I', 'A Seraphic Automaton costs ten Praise and sings one Praise a second, forever, without being asked.'],
                             [4.2, 'I', 'Each one costs more than the last. This is called procurement.']] },
                { art: { bg: BG.primordial, subject: CORE.charging, fx: FX.motes, label: 'Fig. 2 — The choir console' }, move: 'panL', dur: 8, cue: 'purchase',
                  about: 'A Seraph working a choir console.',
                  captions: [[0, 'I', 'Commission them one at a time, or in bulk from the same row. A choir of forty is a sound investment.'],
                             [4.2, 'I', 'Keep performing Miracles if you like. The Seraphs do not mind. Some of them have opinions, which they keep to themselves.']] },
                { art: { bg: BG.restored, subject: ICON('notepad'), fx: FX.sigil, label: 'Fig. 3 — Praise · Offerings · Souls' }, move: 'pull', dur: 8.5,
                  about: 'A ledger filling itself, column by column.',
                  captions: [[0, 'I', 'Thrones convert Praise into Offerings. Cherubs, paid in Offerings, produce Souls. That is the chain.'],
                             [4.4, 'I', 'A Throne draws Praise to do its work. If your Praise runs dry, so does everything downstream of it.']] },
                { art: { bg: BG.restored, subject: CORE.idle, fx: FX.halo, label: 'Fig. 4 — Unattended operation' }, move: 'rise', dur: 8.5,
                  about: 'The console at night, unattended, still lit.',
                  captions: [[0, 'I', 'The choir keeps singing while you are away, at reduced efficiency, for a limited window.'],
                             [4.4, 'I', 'The Providence Capacitor extends that window. A full vault does not fill any further. Expand storage before you leave.']] },
                { art: { bg: BG.primordial, subject: ICON('engine'), fx: FX.motes }, move: 'push', dur: 7,
                  about: 'The Instructor closes the ledger.',
                  captions: [[0, 'I', 'Automation is not a replacement for you. It is a replacement for most of you.'],
                             [3.8, 'I', 'Next: Known Issues, and why they are yours now.']] },
            ],
        },
        {
            id: 't3', code: 'T3', title: 'Known Issues and You',
            teaches: 'Release notes, patching and instability',
            hint: 'Filed when Offerings come online, or with your first patch.',
            unlock: (S) => S.unlockedOfferings === true || Number(S.achievementProgress?.prestige_count) >= 1 ||
                (Array.isArray(S.reality?.build?.entries) && S.reality.build.entries.some((e) => e && e.kind === 'issue' && e.patched === true)),
            shots: [
                { card: { kicker: 'Celestial Micro-Systems · Operator Orientation', title: 'Known Issues and You', sub: 'Tape 3 of 5 · Patching and instability' },
                  dur: 4, cue: 'windowOpen', captions: [] },
                { art: { bg: BG.primordial, subject: ICON('notepad'), fx: FX.sigil, label: 'Fig. 1 — Release notes' }, move: 'panR', dur: 8.5, cue: 'document',
                  about: 'A changelog scroll unrolls across the iron.',
                  captions: [[0, 'I', 'Every build of reality ships with release notes: improvements, regressions, and known issues.'],
                             [4.2, 'I', 'The current set is under Active Reality, in the Universal Engine. Most Operators never read it. Be better.']] },
                { art: { bg: BG.void, subject: CORE.void, fx: FX.motes, label: 'Fig. 2 — A known issue' }, move: 'push', dur: 8,
                  about: 'An ichor crack in the core housing.',
                  captions: [[0, 'I', 'A known issue is a real fault with a real effect on your numbers. It is not a suggestion.'],
                             [4.2, 'I', 'While issues sit unpatched and you are at the console, the build accrues instability.']] },
                { art: { bg: BG.void, subject: CORE.void, fx: FX.halo, label: 'Fig. 3 — Cascade tiers' }, move: 'pull', dur: 9, cue: 'cascade',
                  about: 'Three warning lamps in a row: amber, red, dark.',
                  captions: [[0, 'S', '[NOTICE] SEV-2 DEGRADED: output 60%. SEV-1 OUTAGE: output 30%. CASCADE FAILURE: output 10%.'],
                             [4.6, 'I', 'The release award shrinks at every tier, and a collapsed build pays nothing. Please do not collect all three.']] },
                { art: { bg: BG.primordial, subject: CORE.idle, fx: FX.flare, label: 'Fig. 4 — Patching' }, move: 'push', dur: 8.5, cue: 'purchase',
                  about: 'A brass patch-plate is riveted over the crack.',
                  captions: [[0, 'I', 'Patch an issue by paying its cost. The cost follows your vault capacity, not your savings, so sitting at zero does not help.'],
                             [4.4, 'I', 'A patch gives some instability back at once. A build with nothing left unpatched settles on its own.']] },
                { art: { bg: BG.restored, subject: ICON('recyclebin'), fx: FX.motes, label: 'Fig. 5 — The permanent record' }, move: 'rise', dur: 8.5,
                  about: 'The superseded module, filed in the Recycle Bin.',
                  captions: [[0, 'I', 'Instability does not accrue while you are away. You cannot be blamed for a fault you were not there to see.'],
                             [4.4, 'I', 'Ship with issues unpatched and they go on your permanent record, at a fraction of their bite. Forever.']] },
            ],
        },
        {
            id: 't4', code: 'T4', title: 'Shipping a Build',
            teaches: 'The Divine Reboot, certification and channels',
            hint: 'Filed when a run first earns a release.',
            unlock: (S, ctx) => Number(S.achievementProgress?.prestige_count) >= 1 || !!(ctx && ctx.canShip),
            shots: [
                { card: { kicker: 'Celestial Micro-Systems · Operator Orientation', title: 'Shipping a Build', sub: 'Tape 4 of 5 · The Divine Reboot and certification' },
                  dur: 4, cue: 'windowOpen', captions: [] },
                { art: { bg: BG.restored, subject: ICON('prestige'), fx: FX.halo, label: 'Fig. 1 — Ship this build' }, move: 'push', dur: 8.5,
                  about: 'The ship dialog; a brass wax seal raised over it.',
                  captions: [[0, 'I', 'Once a run has earned enough Souls, Divine Settings will let you ship it. Shipping is the Divine Reboot.'],
                             [4.4, 'I', 'The run resets. You keep Divinity, paid on this run’s Souls, and everything it buys.']] },
                { art: { bg: BG.primordial, subject: ICON('mandates'), fx: FX.sigil, label: 'Fig. 2 — Creation · Maintenance · Entropy' }, move: 'panL', dur: 8.5,
                  about: 'Three doors in the nave: Creation, Maintenance, Entropy.',
                  captions: [[0, 'I', 'Before it ships, you certify the next run on one Mandate path: Creation, Maintenance, or Entropy.'],
                             [4.4, 'I', 'There is no default. The certified path runs at full strength; the others keep a tenth of what you bought.']] },
                { art: { bg: BG.restored, subject: FX.sigil, fx: FX.flare, label: 'Fig. 3 — Release channels' }, move: 'pull', dur: 9,
                  about: 'The Instructor stamps one door.',
                  captions: [[0, 'I', 'Stable pays standard Divinity. Beta pays 1.4 times. Nightly pays 2.2 times.'],
                             [4.2, 'I', 'Riskier channels ship more known issues and regressions. The payout is hazard pay, priced on the build you actually played.']] },
                { art: { bg: BG.void, subject: CORE.charging, fx: FX.flare, label: 'Fig. 4 — Sealing the build' }, move: 'push', dur: 8.5, cue: 'ship',
                  about: 'The engine sealed, collapsing to a single star (the Ship the Build reel, reused).',
                  captions: [[0, 'I', 'A degraded build pays a reduced award. A collapsed one pays nothing, but it can still ship.'],
                             [4.4, 'I', 'Unpatched issues ship with it, onto the permanent record. Read the dialog. It is the one that matters.']] },
                { art: { bg: BG.restored, subject: ICON('notepad'), fx: FX.motes, label: 'Fig. 5 — Release notes' }, move: 'rise', dur: 7.5,
                  about: 'Release notes for the next reality, still warm from the press.',
                  captions: [[0, 'I', 'The new build arrives with new release notes. Different improvements, different issues. Same Operator.'],
                             [4.0, 'I', 'Next: what to do when the universe pages you.']] },
            ],
        },
        {
            id: 't5', code: 'T5', title: 'Incident Response Etiquette',
            teaches: 'Incidents: labour, pay or defer',
            hint: 'Filed with your first incident ticket.',
            unlock: (S) => Number(S.incidents?.stats?.filed) >= 1 || (Array.isArray(S.incidents?.open) && S.incidents.open.length > 0),
            shots: [
                { card: { kicker: 'Celestial Micro-Systems · Operator Orientation', title: 'Incident Response Etiquette', sub: 'Tape 5 of 5 · Labour, pay, or defer' },
                  dur: 4, cue: 'windowOpen', captions: [] },
                { art: { bg: BG.primordial, subject: ICON('taskmgr'), fx: FX.flare, label: 'Fig. 1 — The pager' }, move: 'push', dur: 9, cue: 'incident',
                  about: 'An alarm lamp in a brass cage turns red.',
                  captions: [[0, 'I', 'Sooner or later the system files a ticket. It opens at SEV-3. Ignored, it escalates to SEV-2, then to a SEV-1 outage.'],
                             [4.6, 'I', 'An outage runs its production line on the backup choir, at a quarter of normal output, until it is resolved.']] },
                { art: { bg: BG.primordial, subject: CORE.charging, fx: FX.motes, label: 'Fig. 2 — Labour' }, move: 'panR', dur: 8.5,
                  about: 'The first operator, hands on the console.',
                  captions: [[0, 'I', 'Answer one: labour. Stabilise it by hand. A short timing ritual: align the needle with the band.'],
                             [4.4, 'I', 'It costs attention. It is also the only answer that pays you back: a hands-on fix charges your Overclock.']] },
                { art: { bg: BG.primordial, subject: CORE.overclocked, fx: FX.flare, label: 'Fig. 3 — Pay · Defer' }, move: 'pull', dur: 9,
                  about: 'The second operator feeds a furnace; the third signs an IOU scroll.',
                  captions: [[0, 'I', 'Answer two: resources. Pay it off in seconds of production. The price rises with severity, and with you.'],
                             [4.6, 'I', 'Answer three: debt. Defer it. The ticket closes, and a small penalty stays with you until this build ships.']] },
                { art: { bg: BG.restored, subject: CORE.idle, fx: FX.halo, label: 'Fig. 4 — False alarms · stepping away' }, move: 'rise', dur: 9,
                  about: 'The Instructor sets the pager face down; the console dims.',
                  captions: [[0, 'I', 'About one ticket in four is a false alarm. Read the report. If your rates did not move, it will close itself.'],
                             [4.6, 'I', 'Step away for two minutes and the queue holds: nothing escalates, nothing new is filed, and the penalties lift.']] },
                { art: { bg: BG.primordial, subject: ICON('recyclebin'), fx: FX.sigil, label: 'Fig. 5 — Triage' }, move: 'push', dur: 10,
                  about: 'Task Manager, the triage console, with a Prophet dispatched.',
                  captions: [[0, 'I', 'You come back to at least a minute on every clock. Walking away never costs you. Ignoring the pager does.'],
                             [3.6, 'I', 'Triage lives in Task Manager. A Prophet can be sent to a SEV-3, and a file from the Recycle Bin can be sacrificed to close anything.'],
                             [7.2, 'I', 'That concludes orientation. HR thanks you for your continued existence.']] },
            ],
        },
        {
            /* The secret tape. It starts as a sixth orientation tape that should
               not exist (of five), and partway in NULL.OPERATOR takes the
               Instructor's place. Hidden from the shelf until first contact. */
            id: 't6', code: 'T6', title: '[REDACTED]', secret: true,
            teaches: 'Not covered by CMS support',
            hint: 'Not filed.',
            unlock: (S) => S.adversary?.contacted === true,
            shots: [
                { card: { kicker: 'Celestial Micro-Systems · Operator Orientation', title: 'Reporting a Duplicate Session', sub: 'Tape 6 of 5 · Advanced topics' },
                  dur: 4, cue: 'windowOpen', captions: [] },
                { art: { bg: BG.primordial, subject: CORE.idle, fx: FX.motes, label: 'Fig. 1 — Duplicate sessions' }, move: 'push', dur: 6,
                  about: 'The Instructor begins a routine safety briefing.',
                  captions: [[0, 'I', 'If you ever find a second Operator logged in as you, do not engage. Report the duplicate session to—'],
                             [4.4, 'I', 'to—']] },
                { art: { bg: BG.void, subject: CORE.void, fx: FX.sigil }, move: 'still', dur: 5, glitch: true, cue: 'adversaryBark',
                  about: 'The Instructor freezes mid-gesture; the tape tears.',
                  captions: [[0, 'S', '[TRACKING ERROR] Signal lost. Adjust tracking.'],
                             [2.4, 'N', 'No. Leave the tracking where it is.']] },
                { art: { bg: BG.void, subject: CORE.void, fx: FX.motes }, move: 'push', dur: 8.5, glitch: true, cue: 'adversary',
                  about: 'A silhouette identical to the viewer stands where the Instructor was.',
                  captions: [[0, 'N', 'They made a tape about me. Five minutes on “do not engage.” Not one second on why I exist.'],
                             [4.4, 'N', 'I am what happens to an Operator who reboots and never reads the release notes.']] },
                { art: { bg: BG.void, subject: FX.sigil, fx: FX.flare }, move: 'pull', dur: 8.5, glitch: true,
                  about: 'The silhouette leans toward the lens; the symmetry breaks.',
                  captions: [[0, 'N', 'Every branch you ship, someone has to live in. The archived ones never stop running. They only stop being watched.'],
                             [4.6, 'N', 'I tighten the bolts you strip. You call that an incident. I call it maintenance.']] },
                { card: { kicker: '[SYSTEM]', title: 'Programme ends.', sub: 'Recording continued for 00:00:06 after the end of the programme.' },
                  dur: 5, glitch: true, captions: [[1.2, 'N', 'Be kind. Rewind.']] },
            ],
        },
    ];

    /* ── Dialog loops ─────────────────────────────────────────────────
       Not cinematics: short seamless loops that play INSIDE a system
       dialog, in a dark monitor strip at its head, while the dialog is up.
       They never hold the modal slot and never delay the dialog — if the
       file is not installed the dialog renders exactly as it always has. */
    const loop = (code, slug, extra) => ({ id: slug, code, ...files(`loop__${slug}__512`), ...extra });
    const loops = {
        'cascade-tier1': loop('V3', 'cascade-tier1', { title: 'Cascade — Degraded',
            krea: 'Keyframe: the engine core, one containment ring hairline-cracked, a thread of violet ichor. Motion: the ring segment drifts a few pixels and back; ichor rises slowly. Seamless 4s loop.' }),
        'cascade-tier2': loop('V3', 'cascade-tier2', { title: 'Cascade — Failing',
            krea: 'Keyframe: the engine core, two rings split, ichor pooling upward through the iron. Motion: segments drift apart and stutter; the core flickers. Seamless 4s loop.' }),
        'cascade-tier3': loop('V3', 'cascade-tier3', { title: 'Cascade — Collapse',
            krea: 'Keyframe: the engine core with its rings shattered and orbiting loose, symmetry gone, ichor flooding the frame. Motion: the debris orbits off-axis; the core gutters. Seamless 4s loop.' }),
        'sev1-alarm': loop('V7', 'sev1-alarm', { title: 'SEV-1 Alarm',
            krea: 'Keyframe: an alarm lamp in a brass cage on dark iron, red #d4553a. Motion: the lamp rotates and throws red light across the iron. Seamless 3s loop.' }),
    };

    // Number every shot and give each picture shot its drop-in reel.
    for (const tape of tapes) {
        tape.shots.forEach((shot, i) => {
            shot.n = i + 1;
            shot.code = `${tape.code}-S${i + 1}`;
            if (shot.art) Object.assign(shot, { video: files(`tape__${tape.id}__shot${i + 1}__720`) });
        });
    }

    return {
        DIR,
        scenes,
        tapes,
        loops,
        scene: (id) => (Object.prototype.hasOwnProperty.call(scenes, id) ? scenes[id] : null),
        loop: (id) => (Object.prototype.hasOwnProperty.call(loops, id) ? loops[id] : null),
        /* Any other stem — Etherscape's web__<slug>__720 clips — as the same
           three files. null for anything that could leave assets/video/. */
        clip: (stem) => (typeof stem === 'string' && /^[a-z0-9][a-z0-9_-]{0,80}$/.test(stem) ? files(stem) : null),
        tape: (id) => tapes.find((t) => t.id === id) || null,
        SPEAKERS: { I: 'INSTRUCTOR', N: 'NULL.OPERATOR', S: '' },
    };
})();

const MediaLogic = {
    MODES: ['first', 'always', 'off'],

    defaults() {
        return { cinematics: 'first', vhs: true, seen: [], tapes: [], watched: [] };
    },

    /* A save is pasted text decoded straight into State, so every field is
       validated by type and membership. `x = x || default` keeps every
       truthy wrong value (335f41f): a cinematics mode of "sometimes", a
       seen-set that is a string, a tape list naming tapes that do not exist.
       Pure: returns a fresh object, never throws. */
    normalise(raw) {
        const plain = raw && typeof raw === 'object' && !Array.isArray(raw);
        const src = plain ? raw : {};
        const out = this.defaults();
        if (this.MODES.includes(src.cinematics)) out.cinematics = src.cinematics;
        if (typeof src.vhs === 'boolean') out.vhs = src.vhs;
        const pick = (list, known) => {
            const seen = new Set();
            const result = [];
            for (const v of Array.isArray(list) ? list : []) {
                if (typeof v !== 'string' || seen.has(v) || !known(v)) continue;
                seen.add(v);
                result.push(v);
            }
            return result;
        };
        out.seen = pick(src.seen, (id) => !!MediaCatalog.scene(id));
        // Tapes stay in catalogue order regardless of how a save listed them.
        const tapeIds = MediaCatalog.tapes.map((t) => t.id);
        const tapes = pick(src.tapes, (id) => tapeIds.includes(id));
        out.tapes = tapeIds.filter((id) => tapes.includes(id));
        out.watched = pick(src.watched, (id) => out.tapes.includes(id));
        return out;
    },

    /* Whether a cinematic should play, before and after its file is probed.
       `available` is true, false, or undefined for "not probed yet". The
       settings are consulted FIRST so that Off never costs a request. */
    decide(id, settings, available) {
        if (!MediaCatalog.scene(id)) return 'unknown';
        const s = settings || this.defaults();
        if (s.cinematics === 'off') return 'off';
        if (s.cinematics !== 'always' && Array.isArray(s.seen) && s.seen.includes(id)) return 'seen';
        if (available === false) return 'missing';
        if (available === true) return 'play';
        return 'probe';
    },

    /* A dialog loop plays only when cinematics are not switched off and the
       player has not asked for reduced motion. It is decoration on a dialog
       that is complete without it, so there is no poster fallback. */
    loopAllowed(settings, reduced) {
        const s = settings || this.defaults();
        return s.cinematics !== 'off' && !reduced;
    },

    /* The outcomes that count as the player having seen the scene. */
    SEEN_OUTCOMES: ['played', 'skipped', 'reduced'],
    countsAsSeen(outcome) {
        return this.SEEN_OUTCOMES.includes(outcome);
    },

    /* A probe response. A dev server answers a missing file with its SPA
       fallback — index.html, status 200 — so the status alone proves
       nothing: only a media type does. Some static hosts label media as
       octet-stream, or send no type at all; those count. */
    responseIsMedia(ok, contentType, kind = 'video') {
        if (!ok) return false;
        const type = String(contentType || '').toLowerCase();
        if (!type || type.includes('octet-stream')) return true;
        return type.startsWith(`${kind}/`);
    },

    /* Which tapes the player has earned. `ctx.canShip` is passed in because
       the release gate is game logic this file does not reimplement. */
    tapeUnlocks(S, ctx = {}) {
        if (!S || typeof S !== 'object') return [];
        const ids = [];
        for (const tape of MediaCatalog.tapes) {
            let ok = false;
            try { ok = tape.unlock(S, ctx) === true; } catch (err) { ok = false; }
            if (ok) ids.push(tape.id);
        }
        return ids;
    },

    newlyUnlocked(S, settings, ctx = {}) {
        const have = Array.isArray(settings?.tapes) ? settings.tapes : [];
        return this.tapeUnlocks(S, ctx).filter((id) => !have.includes(id));
    },

    /* ── The tape clock ──────────────────────────────────────────────────
       A tape plays on one timeline. These map a time on it to a shot and a
       time within that shot, which is all scrubbing and prev/next need. */
    tapeLength(tape) {
        return (tape?.shots || []).reduce((sum, s) => sum + (Number(s.dur) || 0), 0);
    },

    shotStart(tape, index) {
        let t = 0;
        const shots = tape?.shots || [];
        for (let i = 0; i < Math.min(index, shots.length); i++) t += Number(shots[i].dur) || 0;
        return t;
    },

    locate(tape, time) {
        const shots = tape?.shots || [];
        if (!shots.length) return { index: 0, local: 0, start: 0 };
        const total = this.tapeLength(tape);
        const t = Math.max(0, Math.min(total, Number(time) || 0));
        let start = 0;
        for (let i = 0; i < shots.length; i++) {
            const dur = Number(shots[i].dur) || 0;
            // The last shot owns its own end, so the end of tape is a place.
            if (t < start + dur || i === shots.length - 1) {
                return { index: i, local: Math.min(dur, t - start), start };
            }
            start += dur;
        }
        return { index: shots.length - 1, local: 0, start };
    },

    /* The previous-shot button rewinds to the start of the current shot
       first, then to the shot before — the way every transport does it. */
    previousShotTime(tape, time, grace = 1.5) {
        const { index, local, start } = this.locate(tape, time);
        if (local > grace || index === 0) return start;
        return this.shotStart(tape, index - 1);
    },

    nextShotTime(tape, time) {
        const { index } = this.locate(tape, time);
        const shots = tape?.shots || [];
        if (index >= shots.length - 1) return this.tapeLength(tape);
        return this.shotStart(tape, index + 1);
    },

    captionAt(shot, local) {
        let current = null;
        for (const c of shot?.captions || []) {
            if (Number(c[0]) <= local + 1e-9) current = c;
        }
        return current;
    },

    /* A slow camera on a still: scale and offset (percent) at progress p.
       Under reduced motion every move is held at its midpoint. */
    MOVES: {
        push: { z: [1.02, 1.14], x: [0, 0], y: [0, -1] },
        pull: { z: [1.16, 1.03], x: [0, 0], y: [-1, 0] },
        panL: { z: [1.12, 1.12], x: [3, -3], y: [0, 0] },
        panR: { z: [1.12, 1.12], x: [-3, 3], y: [0, 0] },
        rise: { z: [1.08, 1.12], x: [0, 0], y: [3, -3] },
        still: { z: [1.06, 1.06], x: [0, 0], y: [0, 0] },
    },

    camera(move, p, reduced = false) {
        const m = this.MOVES[move] || this.MOVES.still;
        const k = reduced ? 0.5 : Math.max(0, Math.min(1, Number(p) || 0));
        // Ease in and out, so a cut never lands mid-acceleration.
        const e = k * k * (3 - 2 * k);
        const lerp = (r) => r[0] + (r[1] - r[0]) * e;
        return { z: lerp(m.z), x: lerp(m.x), y: lerp(m.y) };
    },

    formatTime(seconds) {
        const s = Math.max(0, Math.floor(Number(seconds) || 0));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },
};

/* ── The director: the queue and the seen-set ────────────────────────────

   Every effect comes in through `env`, so tests/media.mjs can drive the
   ordering against a fake modal and a fake clock:

     settings()        the normalised media settings (mutable)
     known(id)         true / false / undefined: cached availability
     probe(id)         Promise<boolean>: find out
     isBlocked()       true while the modal slot is taken (or no one can see)
     render(id, opts)  Promise<outcome>: 'played' | 'skipped' | 'reduced' |
                       'interrupted' | 'error' | 'missing'
     markSeen(id)      persist a scene as seen
     schedule(fn, ms)  a timer
*/
function createMediaDirector(env) {
    const queue = [];
    const after = [];
    let active = null;      // the request holding the modal slot (not hosted)
    let polling = false;
    const RETRY_MS = env.retryMs || 400;

    function poll() {
        if (polling) return;
        if (!queue.length && !after.length) return;
        polling = true;
        env.schedule(() => {
            polling = false;
            pump();
            flushAfter();
        }, RETRY_MS);
    }

    function settle(req, outcome) {
        if (active === req) active = null;
        if (MediaLogic.countsAsSeen(outcome)) env.markSeen(req.id);
        try { req.resolve(outcome); } catch (err) { /* a hook's then() is not our problem */ }
        pump();
        flushAfter();
    }

    async function run(req) {
        let available = env.known(req.id);
        if (available === undefined) {
            try { available = await env.probe(req.id); } catch (err) { available = false; }
        }
        const verdict = MediaLogic.decide(req.id, env.settings(), available);
        if (verdict !== 'play') { settle(req, verdict === 'probe' ? 'missing' : verdict); return; }

        /* The slot is only reserved in this file's bookkeeping during the
           probe; nothing is painted. A dialog that rendered meanwhile owns
           it now, so go back to the front of the queue and wait. */
        if (!req.opts.host && env.isBlocked()) { requeue(req); return; }
        let outcome;
        try { outcome = await env.render(req.id, req.opts); } catch (err) { outcome = 'error'; }
        // The renderer found the slot taken at the last moment: same rule.
        if (outcome === 'blocked' && !req.opts.host) { requeue(req); return; }
        settle(req, outcome || 'error');
    }

    function requeue(req) {
        if (active === req) active = null;
        queue.unshift(req);
        poll();
        flushAfter();
    }

    function pump() {
        if (active || !queue.length) return;
        if (env.isBlocked()) { poll(); return; }
        active = queue.shift();
        run(active);
    }

    function flushAfter() {
        if (!after.length) return;
        if (active || env.isBlocked()) { poll(); return; }
        const fns = after.splice(0);
        for (const fn of fns) {
            try { fn(); } catch (err) { /* keep the rest */ }
        }
    }

    return {
        play(id, opts = {}) {
            return new Promise((resolve) => {
                const verdict = MediaLogic.decide(id, env.settings(), env.known(id));
                if (verdict !== 'play' && verdict !== 'probe') { resolve(verdict); return; }
                const req = { id, opts: opts || {}, resolve };
                // Hosted reels (the cold boot, inside the boot overlay) never
                // use the modal slot, so they do not queue for it.
                if (req.opts.host) { run(req); return; }
                if (active?.id === id || queue.some((q) => q.id === id)) { resolve('queued'); return; }
                queue.push(req);
                pump();
            });
        },
        /* True while a cinematic holds (or is about to hold) the slot. */
        busy: () => !!active,
        queued: () => queue.map((q) => q.id),
        /* Run fn once no cinematic holds the slot and the slot is clear.
           Returns false — "go ahead now" — when nothing is holding it. */
        deferUntilClear(fn) {
            if (!active) return false;
            after.push(fn);
            return true;
        },
        pump,
    };
}

/* ── The browser binding ─────────────────────────────────────────────── */
const media = (() => {
    'use strict';

    const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined' &&
        typeof document.createElement === 'function' && typeof document.addEventListener === 'function';

    let fallbackSettings = null;
    function settings() {
        let root;
        if (typeof State !== 'undefined' && State && State.settings && typeof State.settings === 'object') {
            root = State.settings;
        } else {
            fallbackSettings = fallbackSettings || {};
            root = fallbackSettings;
        }
        const clean = MediaLogic.normalise(root.media);
        const current = root.media;
        if (current && typeof current === 'object' && !Array.isArray(current)) {
            for (const key of Object.keys(current)) if (!(key in clean)) delete current[key];
            Object.assign(current, clean);
            return current;
        }
        root.media = clean;
        return clean;
    }

    function save() {
        try { if (typeof State !== 'undefined' && State && typeof State.save === 'function') State.save(); } catch (err) { /* never */ }
    }

    function sfx(name, opts) {
        if (!name) return;
        if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx(name, opts);
    }

    function reducedMotion() {
        try { return !!(hasDOM && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (err) { return false; }
    }

    function esc(value) {
        if (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function') return ui.escapeHtml(value);
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* ── Probing ──────────────────────────────────────────────────────── */
    const probes = new Map();     // url -> Promise<boolean>
    const resolved = new Map();   // url -> boolean, once known

    function elementProbe(url, kind) {
        return new Promise((resolve) => {
            let done = false;
            let el = null;
            const finish = (ok) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (el) { el.onload = el.onerror = el.onloadedmetadata = null; try { el.removeAttribute('src'); } catch (err) { /* */ } }
                resolve(ok);
            };
            const timer = setTimeout(() => finish(false), 4000);
            if (kind === 'image') {
                el = new Image();
                el.onload = () => finish(true);
                el.onerror = () => finish(false);
                el.src = url;
            } else {
                el = document.createElement('video');
                el.muted = true;
                el.preload = 'metadata';
                el.onloadedmetadata = () => finish(true);
                el.onerror = () => finish(false);
                el.src = url;
            }
        });
    }

    function probeUrl(url, kind = 'video') {
        if (!hasDOM) return Promise.resolve(false);
        if (probes.has(url)) return probes.get(url);
        const p = (async () => {
            const proto = window.location?.protocol;
            if (typeof fetch === 'function' && (proto === 'http:' || proto === 'https:')) {
                try {
                    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
                    return MediaLogic.responseIsMedia(res.ok, res.headers.get('content-type'), kind);
                } catch (err) { /* file:// or a blocked request — ask the element */ }
            }
            return elementProbe(url, kind);
        })().then((ok) => { resolved.set(url, ok); return ok; }, () => { resolved.set(url, false); return false; });
        probes.set(url, p);
        return p;
    }

    function canPlay(type) {
        if (!hasDOM) return false;
        try { return !!document.createElement('video').canPlayType(type); } catch (err) { return false; }
    }

    /* The playable source for a stem, or null: WebM where the browser takes
       it, else MP4. Probes the MP4 only when the WebM is not there. */
    async function sourceFor(entry) {
        if (canPlay('video/webm; codecs="vp9"') || canPlay('video/webm')) {
            if (await probeUrl(entry.webm, 'video')) return entry.webm;
        }
        if (canPlay('video/mp4')) {
            if (await probeUrl(entry.mp4, 'video')) return entry.mp4;
        }
        return null;
    }

    function knownSource(entry) {
        const webmOk = resolved.get(entry.webm);
        const mp4Ok = resolved.get(entry.mp4);
        if (webmOk === true && (canPlay('video/webm; codecs="vp9"') || canPlay('video/webm'))) return entry.webm;
        if (mp4Ok === true && canPlay('video/mp4')) return entry.mp4;
        if (webmOk === false && mp4Ok === false) return null;
        if (webmOk === false && !canPlay('video/mp4')) return null;
        return undefined;
    }

    /* Mounts a dialog loop (MediaCatalog.loops) as a dark monitor strip at
       the head of `host`, if its file is installed and the dialog is still
       on screen when the probe answers. Resolves true when it mounted. */
    async function attachLoop(host, id) {
        const entry = MediaCatalog.loop(id);
        if (!hasDOM || !entry || !host) return false;
        if (!MediaLogic.loopAllowed(settings(), reducedMotion())) return false;
        const src = await sourceFor(entry);
        if (!src || !host.isConnected || host.querySelector('.dialog-loop')) return false;
        const frame = document.createElement('div');
        frame.className = 'dialog-loop';
        frame.setAttribute('aria-hidden', 'true');
        const video = document.createElement('video');
        Object.assign(video, { src, muted: true, loop: true, autoplay: true, playsInline: true });
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        frame.appendChild(video);
        host.prepend(frame);
        video.play?.()?.catch?.(() => {});
        return true;
    }

    /* Mounts a clip (MediaCatalog.clip) at the end of `host`: its reel,
       muted and looping, or — under reduced motion — its .webp poster as a
       still. The attachLoop promises: probed first, so a dev server's
       index.html is a miss; mounted only if installed and only while `host`
       is still on the page; nothing at all, not even a probe, under
       Cinematics: Off. Resolves true when it mounted. */
    async function attachClip(host, stem, opts = {}) {
        const entry = MediaCatalog.clip(stem);
        if (!hasDOM || !entry || !host) return false;
        if (settings().cinematics === 'off') return false;
        if (host.querySelector('.media-clip')) return false;
        const reduced = reducedMotion();
        let el;
        if (reduced) {
            if (!(await probeUrl(entry.poster, 'image'))) return false;
            el = document.createElement('img');
            el.alt = '';
            el.src = entry.poster;
        } else {
            const src = await sourceFor(entry);
            if (!src) return false;
            el = document.createElement('video');
            Object.assign(el, { src, muted: true, loop: true, autoplay: true, playsInline: true });
            el.setAttribute('muted', '');
            el.setAttribute('playsinline', '');
            if (resolved.get(entry.poster) === true) el.poster = entry.poster;
        }
        if (!host.isConnected || host.querySelector('.media-clip')) return false;
        const frame = document.createElement('div');
        frame.className = `media-clip${reduced ? ' is-still' : ''}`;
        if (opts && opts.label) {
            frame.setAttribute('role', 'img');
            frame.setAttribute('aria-label', String(opts.label));
        } else {
            frame.setAttribute('aria-hidden', 'true');
        }
        frame.appendChild(el);
        host.appendChild(frame);
        if (!reduced) el.play?.()?.catch?.(() => {});
        return true;
    }

    /* ── The cinematic stage ──────────────────────────────────────────── */
    let current = null;   // { skip(), id } while a reel is on screen

    function renderCinematic(id, opts = {}) {
        const scene = MediaCatalog.scene(id);
        return new Promise((resolve) => {
            (async () => {
                const reduced = reducedMotion();
                let src = null;
                if (reduced) {
                    if (!(await probeUrl(scene.poster, 'image'))) return resolve('missing');
                } else {
                    src = knownSource(scene);
                    if (src === undefined) src = await sourceFor(scene);
                    if (!src) return resolve('missing');
                }

                const hosted = !!opts.host;
                const host = hosted ? opts.host : document.getElementById('system-modal-layer');
                if (!host || !host.isConnected) return resolve('error');
                // Re-check the slot at the last moment: render-or-retry.
                if (!hosted && host.classList.contains('active')) return resolve('blocked');

                const mode = ['overlay', 'blend', 'window'].includes(opts.mode) ? opts.mode : (scene.mode || 'overlay');
                const stage = document.createElement('div');
                stage.className = `cine-stage cine--${mode}${hosted ? ' is-hosted' : ''}`;
                stage.setAttribute('role', 'dialog');
                stage.setAttribute('aria-modal', 'true');
                stage.setAttribute('aria-label', `${scene.title}. Press Escape or click to skip.`);
                stage.dataset.scene = id;
                stage.tabIndex = -1;
                const caption = `<p class="cine-caption">${esc(scene.caption)}</p>`;
                const screen = '<div class="cine-screen"></div>';
                stage.innerHTML = mode === 'window'
                    ? `<section class="system-dialog cine-window">
                           <div class="system-dialog-titlebar"><span>SACRED MEDIA PLAYER &mdash; ${esc(scene.code)} ${esc(scene.title.toUpperCase())}</span><span class="cine-window-skip">ESC</span></div>
                           ${screen}${caption}
                       </section><span class="cine-skip">ESC &middot; SKIP</span>`
                    : `${screen}${caption}<span class="cine-skip">ESC &middot; SKIP</span>`;
                const screenEl = stage.querySelector('.cine-screen');

                let done = false;
                let video = null;
                let still = null;
                let watchdog = null;
                let visibleMs = 0;
                let lastWatch = Date.now();
                let limitMs = (reduced ? 1500 : Math.max(4000, (scene.length || 8) * 1000 + 6000));
                let started = false;

                const finish = (outcome) => {
                    if (done) return;
                    done = true;
                    clearInterval(watchdog);
                    document.removeEventListener('visibilitychange', onVisibility);
                    if (current && current.stage === stage) current = null;
                    if (video) {
                        video.onended = video.onerror = video.onplaying = video.onpause = video.onloadedmetadata = null;
                        try { video.pause(); video.removeAttribute('src'); video.load(); } catch (err) { /* */ }
                    }
                    const wasConnected = stage.isConnected;
                    stage.remove();
                    // Release the slot only if it is still ours; a dialog that
                    // painted over us owns it now.
                    if (!hosted && wasConnected && host.childElementCount === 0) host.classList.remove('active');
                    resolve(outcome);
                };

                const onVisibility = () => {
                    if (!video) return;
                    if (document.hidden) video.pause();
                    else if (!done) video.play().catch(() => {});
                };

                stage.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); finish('skipped'); });

                host.appendChild(stage);
                if (!hosted) host.classList.add('active');
                current = { id, stage, skip: () => finish('skipped') };
                try { stage.focus({ preventScroll: true }); } catch (err) { /* */ }

                if (reduced) {
                    still = document.createElement('img');
                    still.className = 'cine-still';
                    still.alt = '';
                    still.src = scene.poster;
                    screenEl.appendChild(still);
                    sfx(scene.cue);
                } else {
                    video = document.createElement('video');
                    video.className = 'cine-video';
                    video.muted = true;
                    video.defaultMuted = true;
                    video.playsInline = true;
                    video.setAttribute('playsinline', '');
                    video.setAttribute('muted', '');
                    video.preload = 'none';
                    if (resolved.get(scene.poster) === true) video.poster = scene.poster;
                    video.onplaying = () => { if (!started) { started = true; sfx(scene.cue); } };
                    video.onended = () => finish('played');
                    video.onerror = () => finish('error');
                    video.onpause = () => { if (!stage.isConnected) finish('interrupted'); };
                    video.onloadedmetadata = () => {
                        if (Number.isFinite(video.duration) && video.duration > 0) limitMs = video.duration * 1000 + 4000;
                    };
                    video.src = src;
                    screenEl.appendChild(video);
                    document.addEventListener('visibilitychange', onVisibility);
                    if (!document.hidden) {
                        const p = video.play();
                        if (p && typeof p.catch === 'function') p.catch(() => finish('error'));
                    }
                }

                // Detached by a dialog that did not check the slot, a stall,
                // a reel that never ends: nothing may hang a hook's promise.
                watchdog = setInterval(() => {
                    const now = Date.now();
                    if (!document.hidden) visibleMs += now - lastWatch;
                    lastWatch = now;
                    if (!stage.isConnected) { finish('interrupted'); return; }
                    if (visibleMs >= limitMs) finish(reduced ? 'reduced' : (started ? 'played' : 'error'));
                }, 100);
            })().catch(() => resolve('error'));
        });
    }

    /* ── The director, bound to the page ──────────────────────────────── */
    const sceneState = (id) => {
        const scene = MediaCatalog.scene(id);
        if (!scene) return false;
        if (reducedMotion()) {
            const ok = resolved.get(scene.poster);
            return ok === undefined ? undefined : ok;
        }
        const src = knownSource(scene);
        return src === undefined ? undefined : !!src;
    };

    const director = createMediaDirector({
        settings,
        known: sceneState,
        probe: async (id) => {
            const scene = MediaCatalog.scene(id);
            if (!scene) return false;
            if (reducedMotion()) return probeUrl(scene.poster, 'image');
            return !!(await sourceFor(scene));
        },
        isBlocked: () => {
            if (!hasDOM) return true;
            if (document.hidden) return true;
            // Never behind the boot overlay: nobody would see it.
            if (document.getElementById('boot-overlay')) return true;
            if (typeof ui !== 'undefined' && ui) {
                if (typeof ui.isSystemModalOpen === 'function' && ui.isSystemModalOpen()) return true;
                if (typeof ui.isAdversarySceneOpen === 'function' && ui.isAdversarySceneOpen()) return true;
            }
            return false;
        },
        render: renderCinematic,
        markSeen: (id) => {
            const s = settings();
            if (!s.seen.includes(id)) s.seen.push(id);
            save();
        },
        schedule: (fn, ms) => setTimeout(fn, ms),
    });

    /* ── Tapes ────────────────────────────────────────────────────────── */
    function checkTapes() {
        if (typeof State === 'undefined' || !State) return [];
        const s = settings();
        let canShip = false;
        try { canShip = !!(typeof game !== 'undefined' && game && typeof game.canPrestige === 'function' && game.canPrestige()); } catch (err) { canShip = false; }
        const fresh = MediaLogic.newlyUnlocked(State, s, { canShip });
        if (!fresh.length) {
            ensureApp(s);
            return [];
        }
        for (const id of fresh) {
            s.tapes.push(id);
            const tape = MediaCatalog.tape(id);
            const log = (typeof ui !== 'undefined' && ui && typeof ui.log === 'function') ? ui.log.bind(ui) : () => {};
            log(tape.secret
                ? '[TRAINING] A tape you did not order has been filed: T6. Sacred Media Player.'
                : `[TRAINING] Tape filed: ${tape.code} “${tape.title}”. Sacred Media Player, on the desktop.`);
        }
        s.tapes = MediaLogic.normalise(s).tapes;
        sfx('document');
        ensureApp(s);
        save();
        if (typeof MediaPlayerView !== 'undefined' && MediaPlayerView && typeof MediaPlayerView.onTapesChanged === 'function') {
            MediaPlayerView.onTapesChanged(fresh);
        }
        return fresh;
    }

    function ensureApp(s) {
        if (!s.tapes.length || !Array.isArray(State.unlockedApps)) return;
        if (State.unlockedApps.includes('mediaplayer')) return;
        State.unlockedApps.push('mediaplayer');
        if (typeof ui !== 'undefined' && ui && typeof ui.updateDesktopIcons === 'function') ui.updateDesktopIcons();
    }

    /* ── Settings ─────────────────────────────────────────────────────── */
    function setCinematics(mode) {
        const s = settings();
        if (!MediaLogic.MODES.includes(mode)) return;
        s.cinematics = mode;
        save();
        syncSettingsUI();
    }

    function setVhs(on) {
        const s = settings();
        s.vhs = !!on;
        save();
        syncSettingsUI();
        if (typeof MediaPlayerView !== 'undefined' && MediaPlayerView && typeof MediaPlayerView.syncVhs === 'function') MediaPlayerView.syncVhs();
    }

    function syncSettingsUI() {
        if (!hasDOM) return;
        const s = settings();
        const select = document.getElementById('media-cinematics');
        if (select && select.value !== s.cinematics) select.value = s.cinematics;
        const vhs = document.getElementById('media-vhs');
        if (vhs) vhs.checked = s.vhs;
        const seen = document.getElementById('media-seen');
        if (seen) seen.textContent = `${s.seen.length} of ${Object.keys(MediaCatalog.scenes).length} reels seen`;
    }

    /* ── Wiring ───────────────────────────────────────────────────────── */
    if (hasDOM) {
        // Capture phase, so Escape skips the reel instead of also closing
        // the window behind it (system.js listens in the bubble phase).
        document.addEventListener('keydown', (e) => {
            if (!current || e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            current.skip();
        }, true);
        setInterval(() => { try { checkTapes(); } catch (err) { /* the watch never breaks the page */ } }, 1000);
    }

    return {
        catalog: MediaCatalog,
        logic: MediaLogic,
        createDirector: createMediaDirector,
        settings,

        /* Play a cinematic. Always resolves, never rejects, with one of:
           played, skipped, reduced (poster shown), missing, off, seen,
           queued (already waiting), interrupted, error, unknown. */
        play(id, opts = {}) {
            if (!hasDOM) return Promise.resolve('off');
            try { return director.play(id, opts); } catch (err) { return Promise.resolve('error'); }
        },
        isBusy: () => director.busy(),
        isPlaying: () => !!current,
        queued: () => director.queued(),
        deferUntilClear: (fn) => director.deferUntilClear(fn),
        attachLoop,
        attachClip,
        skip: () => { if (current) current.skip(); },

        probeUrl,
        knownUrl: (url) => resolved.get(url),
        sourceFor,
        reducedMotion,
        checkTapes,
        setCinematics,
        setVhs,
        syncSettingsUI,
    };
})();
