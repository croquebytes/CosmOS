/* ════════════════════════════════════════════════════════════════════════
   Reality Builds.

   A Divine Reboot does not restore the same universe. It ships a new BUILD
   of it, with a changelog — and the changelog IS the run's modifier set.

   Every entry below is a declared modifier with `scope: 'build'`, so the
   registry drops the whole set on reboot and the next build replaces it.
   That scope existed before this file did; this is the thing it was for.

   ── Why builds are seeded, not random ──────────────────────────────────

   `Math.random()` would have cost three things at once:

     1. The golden master. tools/balance_sim.mjs is deterministic and its
        output is the economy's regression test. A random build per run makes
        every comparison meaningless.
     2. Save integrity. A build has to survive a reload identically, and
        re-rolling on load would let a player reload for a better universe.
     3. The Archived channel — replaying a specific past build to see what
        NULL.OPERATOR did to it — which is the reason to play a twentieth run.

   So a build is a pure function of (runSeed, prestigeLevel, channel).
   `runSeed` is rolled once per save and persisted, which is what keeps two
   different players from walking the same sequence of universes. The
   simulator pins it to a constant.
   ════════════════════════════════════════════════════════════════════════ */

/* mulberry32. Small, fast, good enough for content selection, and — the
   point — identical in the browser and in node. */
function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seedFor(runSeed, prestigeLevel) {
    // Mix so consecutive reboots do not produce correlated builds.
    let h = (Number(runSeed) || 1) >>> 0;
    h = Math.imul(h ^ (prestigeLevel + 0x9E3779B9), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
}

/* ── The pool ────────────────────────────────────────────────────────────

   `note` is the changelog line, written as the celestial bureaucracy would
   write it. `mods` are real modifier records. `patchCost` marks an entry the
   player can pay to remove; entries without one are "won't fix".

   Deprecations cripple rather than delete. An earlier draft had
   `automaton.throne.output set 0` for the Offerings joke, which breaks the
   Praise -> Offerings -> Souls chain outright and strands anyone who has not
   already banked Souls. Operating at 15% keeps the joke and keeps the run
   playable — the ticket is the punchline, not the outage. */
const RealityPool = {
    improvements: [
        { id: 'imp_praise_throughput', note: 'Praise throughput improved 40%. Thanks to the choir for the report.',
          mods: [{ target: 'praise.multiplier', op: 'mul', value: 1.4 }] },
        { id: 'imp_seraph_hymnal', note: 'Seraphs recompiled against the current hymnal. +50% output.',
          mods: [{ target: 'automaton.seraph.output', op: 'mul', value: 1.5 }] },
        { id: 'imp_throne_batching', note: 'Thrones now batch their conversions. +60% Offerings yield.',
          mods: [{ target: 'automaton.throne.output', op: 'mul', value: 1.6 }] },
        { id: 'imp_conduits_resealed', note: 'Throne conduits resealed. 30% less Praise lost in transit.',
          mods: [{ target: 'throne.draw', op: 'mul', value: 0.7 }] },
        { id: 'imp_cherub_parallel', note: 'Cherub compiler now targets multiple cores. +50% Souls.',
          mods: [{ target: 'automaton.cherub.output', op: 'mul', value: 1.5 }] },
        { id: 'imp_vault_partitions', note: 'Vault partitions merged. Double Praise capacity.',
          mods: [{ target: 'caps.praise', op: 'mul', value: 2 }] },
        { id: 'imp_reliquary_expansion', note: 'Reliquary expanded into the adjacent sector. Double Soul capacity.',
          mods: [{ target: 'caps.souls', op: 'mul', value: 2 }] },
        { id: 'imp_requisition_simplified', note: 'Seraph requisition forms reduced from nine pages to two. -20% cost.',
          mods: [{ target: 'automaton.seraph.cost', op: 'mul', value: 0.8 }] },
        { id: 'imp_elevated_privileges', note: 'Manual intervention granted elevated privileges. Miracles 3x stronger.',
          mods: [{ target: 'click.power', op: 'mul', value: 3 }] },
        { id: 'imp_unattended_certified', note: 'Unattended operation certified to 90%. Sleep well.',
          mods: [{ target: 'offline.efficiency', op: 'max', value: 0.9 }] },
        { id: 'imp_anomaly_sensitivity', note: 'Anomaly detection sensitivity increased. Divine Events twice as frequent.',
          mods: [{ target: 'events.spawnRate', op: 'mul', value: 2 }] },
        { id: 'imp_unsafe_clock', note: 'Clock multiplier unlocked. Overclock is half again as strong.',
          mods: [{ target: 'overclock.potency', op: 'add', value: 0.5 }] },
        { id: 'imp_soul_resonance', note: 'Soul resonance retuned. +50% Souls.',
          mods: [{ target: 'souls.multiplier', op: 'mul', value: 1.5 }] },
        { id: 'imp_offering_audit', note: 'Offering audit resolved in your favour. +50% Offerings.',
          mods: [{ target: 'offerings.multiplier', op: 'mul', value: 1.5 }] },
        { id: 'imp_devotional_stamina', note: 'Devotional stamina cap raised. Longer Miracle Streaks.',
          mods: [{ target: 'streak.cap', op: 'add', value: 1 }] },
        { id: 'imp_wraith_efficiency', note: 'Void: Wraiths bleed the tear 60% faster.',
          mods: [{ target: 'void.automaton.wraith.output', op: 'mul', value: 1.6 }] },
        { id: 'imp_rift_cooldown', note: 'Temporal Rift paperwork waived. -40% cooldown.',
          mods: [{ target: 'skill.temporalRift.cooldown', op: 'mul', value: 0.6 }] },
    ],

    /* Known issues. Patchable: pay the cost, the record is dropped.
       `patchCost` is a multiple of the run's own scale rather than a flat
       number, because a flat cost is either trivial or impossible depending
       on which reboot you are on. */
    issues: [
        { id: 'iss_soul_partition', severity: 2, note: 'Soul storage partition halved during migration. Assigned to: nobody.',
          mods: [{ target: 'caps.souls', op: 'mul', value: 0.5 }], patchCost: { resource: 'souls', scale: 0.4 } },
        { id: 'iss_conduit_leak', severity: 2, note: 'Throne conduits leaking. Praise draw up 80%.',
          mods: [{ target: 'throne.draw', op: 'mul', value: 1.8 }], patchCost: { resource: 'praise', scale: 0.35 } },
        { id: 'iss_cherub_warnings', severity: 3, note: 'Cherub compiler emitting warnings. Souls down 40%. Ticket filed.',
          mods: [{ target: 'automaton.cherub.output', op: 'mul', value: 0.6 }], patchCost: { resource: 'offerings', scale: 0.5 } },
        { id: 'iss_unattended_flaky', severity: 1, note: 'Unattended operation unreliable. Do not close the console.',
          mods: [{ target: 'offline.efficiency', op: 'min', value: 0.3 }], patchCost: { resource: 'souls', scale: 0.3 } },
        { id: 'iss_countersignature', severity: 3, note: 'Seraph requisitions now require a counter-signature. +50% cost.',
          mods: [{ target: 'automaton.seraph.cost', op: 'mul', value: 1.5 }], patchCost: { resource: 'praise', scale: 0.25 } },
        { id: 'iss_dedup_overeager', severity: 2, note: 'Praise deduplication over-eager. 25% of all Praise discarded as duplicate.',
          mods: [{ target: 'praise.multiplier', op: 'mul', value: 0.75 }], patchCost: { resource: 'praise', scale: 0.45 } },
        { id: 'iss_vault_corrupt', severity: 2, note: 'Praise vault index corrupt. Capacity halved pending rebuild.',
          mods: [{ target: 'caps.praise', op: 'mul', value: 0.5 }], patchCost: { resource: 'praise', scale: 0.3 } },
        { id: 'iss_detection_muted', severity: 3, note: 'Anomaly detection muted by a previous Operator. Note left: "too noisy".',
          mods: [{ target: 'events.spawnRate', op: 'mul', value: 0.3 }], patchCost: { resource: 'souls', scale: 0.2 } },
        { id: 'iss_intervention_limited', severity: 2, note: 'Manual intervention rate-limited to prevent abuse. Yours.',
          mods: [{ target: 'click.power', op: 'mul', value: 0.2 }], patchCost: { resource: 'praise', scale: 0.2 } },
        { id: 'iss_wraith_tarpit', severity: 3, note: 'Void: Wraith summoning circles filed under the wrong sector. +60% cost.',
          mods: [{ target: 'void.automaton.wraith.cost', op: 'mul', value: 1.6 }], patchCost: { resource: 'praise', scale: 0.2 } },
    ],

    /* Regressions. Not patchable — the fiction is that these are "won't
       fix", and mechanically they are the price of a riskier channel. */
    regressions: [
        { id: 'reg_clock_derated', note: 'REGRESSION: clock multiplier derated after an incident. Overclock weaker.',
          mods: [{ target: 'overclock.potency', op: 'add', value: -0.4 }] },
        { id: 'reg_soul_shrinkage', note: 'REGRESSION: Souls arriving pre-shrunk. Cause unknown. -40%.',
          mods: [{ target: 'souls.multiplier', op: 'mul', value: 0.6 }] },
        { id: 'reg_streak_reset', note: 'REGRESSION: Miracle Streaks no longer accumulate past the first rank.',
          mods: [{ target: 'streak.cap', op: 'add', value: -1.4 }] },
        { id: 'reg_inverted_events', note: 'REGRESSION: Divine Events spawn inverted. Investigating. Do not claim them.',
          mods: [{ target: 'events.spawnRate', op: 'mul', value: 0.5 }] },
    ],

    /* Deprecations. These remove a system's usefulness for the run and are
       the entries that actually force a different build. They cripple rather
       than delete — see the header note. */
    deprecations: [
        { id: 'dep_offerings', note: 'DEPRECATED: Offerings. Use Tithes instead. (Tithes not implemented. Offerings operate at 15% while your ticket is triaged.)',
          mods: [{ target: 'automaton.throne.output', op: 'mul', value: 0.15 }] },
        { id: 'dep_unattended', note: 'DEPRECATED: unattended operation. Use presence instead. A skeleton crew remains.',
          mods: [{ target: 'offline.efficiency', op: 'min', value: 0.15 }] },
        { id: 'dep_events', note: 'DEPRECATED: Divine Events. Superseded by scheduled maintenance. (Scheduled maintenance not implemented. Events continue at a trickle.)',
          mods: [{ target: 'events.spawnRate', op: 'mul', value: 0.25 }] },
        { id: 'dep_manual', note: 'DEPRECATED: manual intervention. The Engine is self-service now.',
          mods: [{ target: 'click.power', op: 'min', value: 1 }] },
        { id: 'dep_storage_growth', note: 'DEPRECATED: vault expansion. Existing partitions are grandfathered; new ones are not.',
          mods: [{ target: 'caps.praise', op: 'mul', value: 0.75 }] },
    ],
};

/* ── NULL.OPERATOR's annotations ─────────────────────────────────────────

   What the Archived channel pays instead of Divinity. Replaying a past build
   files his postmortem on it: one line per known issue that build shipped
   unpatched, and one per regression (those are won't-fix, so they always
   shipped — and they are his, so he always has something to say).

   Keyed to the pool ids above, so a new issue or regression without a line
   here fails tests/archived.mjs rather than shipping silent. Ids with more
   than one line pick by the build's seed, so the same build always reads the
   same way and two builds carrying the same issue need not.

   Voice: ADV-014 through ADV-026 and the barks. Short, first person, never
   explaining the joke, and always about YOU — he is not confessing, he is
   showing you the receipts ADV-BARK-02 promised. */
const ArchiveAnnotations = {
    lines: {
        iss_sector_7g: [
            "The first one. You found it on day one and blamed the hardware. The hardware sends its regards.",
        ],
        iss_soul_partition: [
            "I halved it. You were keeping souls the way you keep screenshots: all of them, forever, never opened. Half was generous.",
            "Migration notes, line one: halve it and see who notices. Line two: nobody noticed.",
        ],
        iss_conduit_leak: [
            "Not a leak. A tap. Every Throne you built paid me a little, and you filed it under overhead.",
            "Eighty percent. A round number, so you'd find it. You routed around it instead. You always route around it.",
        ],
        iss_cherub_warnings: [
            "Forty warnings a compile. You read none of them. Neither did the Cherubs. They learned that from you.",
        ],
        iss_unattended_flaky: [
            "You left the console running overnight and called it faith. I made unattended mean unattended.",
        ],
        iss_countersignature: [
            "The second signature on every requisition was mine. You never asked whose it was. You just paid the fee.",
        ],
        iss_dedup_overeager: [
            "A quarter of your Praise was the same prayer said twice. I only counted honestly.",
            "Duplicates discarded. If they'd meant it, they would have prayed it differently.",
        ],
        iss_vault_corrupt: [
            "The index wasn't corrupt. It was accurate. You didn't like what it listed.",
        ],
        iss_detection_muted: [
            "'Too noisy.' My handwriting. You kept the note for an entire build and never asked who left it.",
            "I muted the alarms and you slept better. That was the point. Mine, not yours.",
        ],
        iss_intervention_limited: [
            "Rate-limited. Yours. Every click was a repair you didn't have to understand. I made you wait long enough to wonder.",
        ],
        iss_wraith_tarpit: [
            "Filed them under a sector that doesn't exist. You paid the surcharge rather than go and look for it.",
        ],
        reg_clock_derated: [
            "'Derated after an incident.' I was the incident. You were the clock.",
        ],
        reg_soul_shrinkage: [
            "'Cause unknown.' Cause: me. That isn't shrinkage. That's their honest weight.",
        ],
        reg_streak_reset: [
            "You were clicking for the streak, not for them. I capped the streak. They didn't notice the difference. You did.",
        ],
        reg_inverted_events: [
            "Turn a miracle upside down and it's an invoice. The note said do not claim them. You claimed three.",
            "Inverted, yes. You read 'do not claim' and heard 'limited time offer'.",
        ],
    },

    /* A build that shipped clean and carried no regressions still gets a
       file. He looked; that is the joke. */
    clean: "Nothing shipped dirty. I went through this branch twice looking for what you missed. I'll find it.",

    // The sign-off, picked by how much he had to say.
    signoff: [
        { atLeast: 4, text: 'Filed by void_mirror.service. Rollback: unavailable. You had every chance.' },
        { atLeast: 2, text: 'Filed by void_mirror.service. I keep the receipts. You keep rebooting.' },
        { atLeast: 0, text: 'Filed by void_mirror.service. Short file. Don’t get comfortable.' },
    ],
};

/* Channel definitions. Volatility and payout, straight from the plan. */
const RealityChannels = {
    stable: { label: 'Stable', improvements: [2, 3], issues: [1, 1], regressions: [0, 0], deprecations: 0, divinity: 1 },
    beta: { label: 'Beta', improvements: [3, 4], issues: [1, 2], regressions: [0, 1], deprecations: 0.35, divinity: 1.4 },
    nightly: { label: 'Nightly', improvements: [4, 6], issues: [2, 3], regressions: [1, 2], deprecations: 0.8, divinity: 2.2 },
    archived: { label: 'Archived', improvements: [2, 3], issues: [1, 1], regressions: [0, 0], deprecations: 0, divinity: 0 },
};

const Reality = {
    /* The build the game opens on. Not generated: it is the premise. Sector
       7G failed its overnight integrity check, and that is a known issue the
       player is standing in. */
    OPENING_BUILD: {
        version: '4.2.0',
        channel: 'stable',
        seed: 0,
        entries: [
            /* Targets STORAGE, not throughput, on purpose.

               An earlier version taxed praise.multiplier by 15%. That is
               invisible to a new player — they have no baseline to compare
               against — while being just large enough to drop the first
               Seraph below 1 Praise/sec. A halved vault is legible the moment
               you look at the readout, and patching it visibly doubles your
               ceiling, which makes this the player's first and clearest taste
               of what a Reality Build is. */
            {
                kind: 'issue', id: 'iss_sector_7g', severity: 1,
                note: 'Sector 7G failed its overnight integrity check. Praise vault running on the surviving partition at half capacity. Assigned to: you.',
                mods: [{ target: 'caps.praise', op: 'mul', value: 0.5 }],
                patchCost: { resource: 'praise', scale: 0.6 },
            },
        ],
    },

    /* Archived opens at reboot 12, per DESIGN_DIRECTION §2. It was held back
       until a build could be replayed from a recorded identity rather than
       re-rolled off the CURRENT prestige level (which made it byte-identical
       to Stable), and until a 0-Divinity ship was something the reboot path
       allows instead of refuses. See replayBuild() and performPrestige. */
    ARCHIVE_UNLOCK: 12,

    channelsFor(prestigeLevel) {
        const unlocked = ['stable'];
        if (prestigeLevel >= 3) unlocked.push('beta');
        if (prestigeLevel >= 8) unlocked.push('nightly');
        if (prestigeLevel >= this.ARCHIVE_UNLOCK) unlocked.push('archived');
        return unlocked;
    },

    /* Version strings advance with the reboot count so the changelog reads
       like a release history. Minor rolls to major every ten builds. */
    versionFor(prestigeLevel) {
        const build = prestigeLevel + 1;
        const major = 4 + Math.floor(build / 10);
        const minor = build % 10;
        return `${major}.${minor}.0`;
    },

    pick(rng, list, count, exclude) {
        const available = list.filter((entry) => !exclude.has(entry.id));
        const chosen = [];
        for (let i = 0; i < count && available.length; i++) {
            const index = Math.floor(rng() * available.length);
            chosen.push(available.splice(index, 1)[0]);
        }
        return chosen;
    },

    between(rng, [low, high]) {
        return low + Math.floor(rng() * (high - low + 1));
    },

    /* Pure function of its inputs. Same arguments, same build, forever. */
    generate(runSeed, prestigeLevel, channelName = 'stable') {
        const channel = RealityChannels[channelName] || RealityChannels.stable;
        const rng = mulberry32(seedFor(runSeed, prestigeLevel));
        const used = new Set();
        const entries = [];

        const take = (kind, list, count) => {
            for (const entry of this.pick(rng, list, count, used)) {
                used.add(entry.id);
                entries.push({ ...entry, kind });
            }
        };

        take('improvement', RealityPool.improvements, this.between(rng, channel.improvements));
        take('issue', RealityPool.issues, this.between(rng, channel.issues));
        take('regression', RealityPool.regressions, this.between(rng, channel.regressions));
        if (channel.deprecations && rng() < channel.deprecations) {
            take('deprecation', RealityPool.deprecations, 1);
        }

        return {
            version: this.versionFor(prestigeLevel),
            channel: channelName,
            seed: seedFor(runSeed, prestigeLevel),
            prestigeLevel,
            entries,
        };
    },

    /* Registers a build's entries with the modifier registry under
       scope 'build', so a reboot drops the whole set in one call. */
    apply(build, now) {
        if (!build || !Array.isArray(build.entries)) return 0;
        let added = 0;
        for (const entry of build.entries) {
            if (entry.patched) continue;
            for (const mod of entry.mods || []) {
                const record = Modifiers.add({
                    ...mod,
                    scope: 'build',
                    source: { kind: 'build', id: entry.id },
                    label: entry.note,
                });
                if (record) added++;
            }
        }
        Modifiers.commit(now);
        return added;
    },

    /* Re-derives a build from its identity, carrying patched flags across.

       A build is a pure function of (runSeed, prestigeLevel, channel), so the
       identity is the only thing worth persisting — the entries are derivable.
       Storing them instead meant a content change never reached an existing
       save: a run that started before the opening issue was retargeted kept
       the old `praise.multiplier` entry forever, and no amount of fixing the
       pool would touch it.

       The seed is authoritative, so this is stable within and across sessions;
       what it is NOT is frozen against the pool it was rolled from. */
    rematerialise(reality, prestigeLevel) {
        const previous = reality.build;
        const patched = new Set(
            (previous?.entries || []).filter((e) => e.patched).map((e) => e.id),
        );

        // The channel a build was rolled on lives on the build. reality.channel
        // is only the selector for the NEXT one.
        let channel = previous?.channel || reality.channel || 'stable';

        /* An archived replay is NOT a function of the current prestige level —
           that was the whole defect that kept the channel closed. It re-derives
           from the identity it was replayed from, carried on the build. A
           replay whose identity does not validate (a hostile or truncated
           save) degrades to an ordinary Stable build at the current level:
           playable, honest about what it is, and paying normally. */
        let fresh = null;
        if (channel === 'archived') {
            const source = this.sanitiseReplayOf(previous?.replayOf);
            if (source) fresh = this.replayBuild(source);
            else channel = 'stable';
        }
        if (!fresh) {
            fresh = prestigeLevel > 0
                ? this.generate(reality.runSeed, prestigeLevel, channel)
                : JSON.parse(JSON.stringify(this.OPENING_BUILD));
        }

        for (const entry of fresh.entries) {
            if (patched.has(entry.id)) entry.patched = true;
        }
        return fresh;
    },

    /* ── The release history ─────────────────────────────────────────────
       Every shipped build is appended to `State.reality.history`. A record is
       the build's IDENTITY plus what happened to it — never its entries'
       mods, for the same reason rematerialise() exists: entries are derivable
       from (runSeed, level, channel), and storing them would freeze a content
       fix out of every replay.

         reboot     the prestige level the run was PLAYED at (0 = opening)
         level      the level it was GENERATED from — equal to reboot, except
                    on an archived replay, where it is the original's
         channel    as played: stable | beta | nightly | archived
         source     as generated: equal to channel, except on a replay
         runSeed    carried per record, so a record regenerates on its own
         certified  the Mandate path the run was played on, or null
         unpatched  issue ids it shipped with unpatched
         entries    every entry id, in changelog order (drift detection, and
                    the regressions the annotations key off)
         award      Divinity it actually paid
         shippedAt  wall-clock ms, for the picker

       Capped, oldest out first. 48 runs is far more than the picker can
       usefully show, and the history is a convenience — the scars ledger, not
       this, is what makes a ship permanent. */
    HISTORY_CAP: 48,
    ANNOTATION_CAP: 64,
    MAX_LEVEL: 1000000,
    REPLAYABLE_CHANNELS: ['stable', 'beta', 'nightly'],
    BRANCHES: ['creation', 'maintenance', 'entropy'],

    versionOfLevel(level) {
        return level > 0 ? this.versionFor(level) : this.OPENING_BUILD.version;
    },

    historyRecord(build, { reboot, runSeed, certified = null, award = 0, shippedAt = null } = {}) {
        if (!build || !Array.isArray(build.entries)) return null;
        const replay = build.channel === 'archived' ? this.sanitiseReplayOf(build.replayOf) : null;
        const raw = {
            reboot,
            level: replay ? replay.level : reboot,
            channel: replay ? 'archived' : (build.channel || 'stable'),
            source: replay ? replay.source : (build.channel || 'stable'),
            runSeed: replay ? replay.runSeed : runSeed,
            certified,
            unpatched: this.unpatchedIssues(build).map((e) => e.id),
            entries: build.entries.map((e) => e.id),
            award,
            shippedAt,
        };
        return this.normaliseRecord(raw);
    },

    /* Validation, not defaulting. `x || default` passes every truthy
       nonsense through (335f41f: a bogus cert path kept itself and switched
       the whole tree off). importSave decodes pasted text straight into
       State, so every field here can arrive as any type at all. A record
       that does not validate is DROPPED rather than repaired: a repaired
       record would replay a build that never shipped. */
    normaliseRecord(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
        const reboot = int(raw.reboot, 0, this.MAX_LEVEL);
        const level = int(raw.level, 0, this.MAX_LEVEL);
        const runSeed = int(raw.runSeed, 1, 0xFFFFFFFF);
        const channel = typeof raw.channel === 'string' &&
            Object.prototype.hasOwnProperty.call(RealityChannels, raw.channel) ? raw.channel : null;
        const source = this.REPLAYABLE_CHANNELS.includes(raw.source) ? raw.source : null;
        if (reboot === null || level === null || runSeed === null || !channel || !source) return null;

        // The identity has to be internally consistent, or it names a build
        // that never existed.
        if (channel === 'archived') {
            if (level >= reboot) return null;           // can only replay the past
        } else if (source !== channel || level !== reboot) {
            return null;
        }
        if (level === 0 && source !== 'stable') return null; // the opening build is Stable

        const ids = (list, keep) => (Array.isArray(list)
            ? [...new Set(list.filter((id) => typeof id === 'string' && keep(id)))]
            : []);
        const issueIds = this.issueIds();
        const known = this.knownEntryIds();
        return {
            reboot,
            level,
            channel,
            source,
            runSeed,
            certified: this.BRANCHES.includes(raw.certified) ? raw.certified : null,
            unpatched: ids(raw.unpatched, (id) => issueIds.has(id)),
            entries: ids(raw.entries, (id) => known.has(id)),
            award: Number.isFinite(raw.award) && raw.award >= 0 ? Math.floor(raw.award) : 0,
            shippedAt: Number.isFinite(raw.shippedAt) && raw.shippedAt >= 0 ? raw.shippedAt : null,
        };
    },

    normaliseHistory(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const out = [];
        for (const raw of list) {
            const record = this.normaliseRecord(raw);
            // One ship per reboot index. A duplicate is a forged record.
            if (!record || seen.has(record.reboot)) continue;
            seen.add(record.reboot);
            out.push(record);
        }
        out.sort((a, b) => a.reboot - b.reboot);
        return out.slice(-this.HISTORY_CAP);
    },

    issueIds() {
        const ids = new Set(RealityPool.issues.map((e) => e.id));
        for (const e of this.OPENING_BUILD.entries) if (e.kind === 'issue') ids.add(e.id);
        return ids;
    },

    knownEntryIds() {
        const ids = this.issueIds();
        for (const list of [RealityPool.improvements, RealityPool.regressions, RealityPool.deprecations]) {
            for (const e of list) ids.add(e.id);
        }
        return ids;
    },

    /* The builds the picker offers: originals only, newest first. A replay
       is not offered for replay — replaying it would replay its original,
       which is already in the list. */
    replayable(history) {
        return (Array.isArray(history) ? history : [])
            .filter((r) => r && r.channel !== 'archived')
            .slice()
            .sort((a, b) => b.reboot - a.reboot);
    },

    sanitiseReplayOf(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
        const level = Number.isInteger(raw.level) && raw.level >= 0 && raw.level <= this.MAX_LEVEL ? raw.level : null;
        const runSeed = Number.isInteger(raw.runSeed) && raw.runSeed >= 1 && raw.runSeed <= 0xFFFFFFFF ? raw.runSeed : null;
        const source = this.REPLAYABLE_CHANNELS.includes(raw.source) ? raw.source : null;
        if (level === null || runSeed === null || !source) return null;
        if (level === 0 && source !== 'stable') return null;
        return { level, source, runSeed };
    },

    /* The replay. Generated from the ARCHIVED inputs, never the current
       prestige level, so it is the same universe entry for entry — same
       seed, same version string, same known issues — that the player shipped
       before. Only the channel changes, and the channel is what prices it. */
    replayBuild(source) {
        const id = this.sanitiseReplayOf(source);
        if (!id) return null;
        const original = id.level > 0
            ? this.generate(id.runSeed, id.level, id.source)
            : JSON.parse(JSON.stringify(this.OPENING_BUILD));
        return {
            ...original,
            channel: 'archived',
            prestigeLevel: id.level,
            replayOf: id,
        };
    },

    /* ── Annotations ──────────────────────────────────────────────────── */

    annotatableIds(record) {
        const regressions = new Set(RealityPool.regressions.map((e) => e.id));
        const ids = [...(record?.unpatched || [])];
        for (const id of record?.entries || []) {
            if (regressions.has(id) && !ids.includes(id)) ids.push(id);
        }
        return ids.filter((id) => ArchiveAnnotations.lines[id]);
    },

    annotationLine(id, seed) {
        const lines = ArchiveAnnotations.lines[id];
        if (!lines || !lines.length) return null;
        let h = (Number(seed) >>> 0) || 1;
        for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
        return lines[h % lines.length];
    },

    /* A filed annotation is stored as identity + the ids it covers. The TEXT
       is never stored: it is looked up at read time, so a rewritten line
       reaches every save that already filed it. */
    normaliseAnnotation(raw) {
        const id = this.sanitiseReplayOf(raw);
        if (!id) return null;
        const keep = new Set(Object.keys(ArchiveAnnotations.lines));
        const ids = Array.isArray(raw.ids)
            ? [...new Set(raw.ids.filter((x) => typeof x === 'string' && keep.has(x)))]
            : [];
        const filedOn = Number.isInteger(raw.filedOn) && raw.filedOn > id.level && raw.filedOn <= this.MAX_LEVEL
            ? raw.filedOn : null;
        if (filedOn === null) return null;
        return {
            ...id,
            ids,
            filedOn,
            certified: this.BRANCHES.includes(raw.certified) ? raw.certified : null,
            filedAt: Number.isFinite(raw.filedAt) && raw.filedAt >= 0 ? raw.filedAt : null,
        };
    },

    normaliseAnnotations(list) {
        if (!Array.isArray(list)) return [];
        const seen = new Set();
        const out = [];
        for (const raw of list) {
            const a = this.normaliseAnnotation(raw);
            // Filed once per original build: the level IS the build.
            if (!a || seen.has(a.level)) continue;
            seen.add(a.level);
            out.push(a);
        }
        return out.slice(-this.ANNOTATION_CAP);
    },

    /* The document, as data. The UI typesets it; nothing here is HTML. */
    annotationDocument(a) {
        const version = this.versionOfLevel(a.level);
        const seed = a.level > 0 ? seedFor(a.runSeed, a.level) : 0;
        const notes = a.ids.map((id) => {
            const entry = this.entryFromPool(id);
            return {
                id,
                kind: entry?.kind || 'issue',
                severity: entry?.severity || null,
                // Regression notes carry their own "REGRESSION:" prefix; the
                // document labels the kind itself.
                note: entry ? entry.note.replace(/^REGRESSION:\s*/, '').split('.')[0] : id,
                line: this.annotationLine(id, seed),
            };
        });
        const signoff = ArchiveAnnotations.signoff.find((s) => notes.length >= s.atLeast)
            || ArchiveAnnotations.signoff[ArchiveAnnotations.signoff.length - 1];
        return {
            id: `ARC-${String(a.level).padStart(4, '0')}`,
            category: 'Archive',
            generated: true,
            title: `Archived Branch v${version} — Annotated`,
            filename: `Archive/REALITY_v${version}_${a.source}.annotated.log`,
            version,
            source: a.source,
            level: a.level,
            filedOn: a.filedOn,
            certified: a.certified,
            notes,
            clean: notes.length ? null : ArchiveAnnotations.clean,
            signoff: signoff.text,
        };
    },

    entryFromPool(id) {
        for (const [kind, list] of [['issue', RealityPool.issues], ['regression', RealityPool.regressions]]) {
            const e = list.find((x) => x.id === id);
            if (e) return { ...e, kind };
        }
        const opening = this.OPENING_BUILD.entries.find((x) => x.id === id);
        return opening ? { ...opening } : null;
    },

    entry(build, entryId) {
        return build?.entries?.find((e) => e.id === entryId) || null;
    },

    /* Known issues are priced against what the player currently holds, so
       the decision stays live at every scale instead of being trivial late
       and impossible early. */
    patchCostOf(build, entryId) {
        const entry = this.entry(build, entryId);
        if (!entry?.patchCost) return null;
        const { resource, scale } = entry.patchCost;
        const bag = resource === 'darkness' || resource === 'shadows' || resource === 'echoes'
            ? State.dimensions.void.resources
            : State.resources;
        const cap = resource === 'darkness' || resource === 'shadows' || resource === 'echoes'
            ? State.dimensions.void.resourceCaps
            : State.resourceCaps;
        /* Priced off capacity EXCLUDING the current build.

           Holdings would let a player sit at zero and patch for free. But the
           live post-build cap is just as wrong in the other direction: an
           entry that shrinks a cap discounted every patch denominated in that
           resource (making the optimal play "clear the harmful entry last"),
           while an improvement that raised a cap doubled the patch bill. */
        const target = (resource === 'darkness' || resource === 'shadows' || resource === 'echoes')
            ? `void.caps.${resource}`
            : `caps.${resource}`;
        const reference = ModifierTargets[target]
            ? Modifiers.foldExcluding(target, 'build', 0)
            : (cap[resource] || 0);
        return { resource, amount: Math.ceil(reference * scale), bag };
    },

    unpatchedIssues(build) {
        return (build?.entries || []).filter((e) => (e.kind === 'issue') && !e.patched);
    },
};
