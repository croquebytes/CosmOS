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

    channelsFor(prestigeLevel) {
        const unlocked = ['stable'];
        if (prestigeLevel >= 3) unlocked.push('beta');
        if (prestigeLevel >= 8) unlocked.push('nightly');
        // 'archived' is deliberately NOT offered yet: it is byte-identical to
        // stable (generate() keys the rng off the current prestige level, not a
        // chosen past one) and pays no Divinity, so selecting it would block
        // Divine Reboot outright. It stays in RealityChannels as the shape to
        // implement, not as a choice.
        void prestigeLevel;
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
        const channel = previous?.channel || reality.channel || 'stable';
        const fresh = prestigeLevel > 0
            ? this.generate(reality.runSeed, prestigeLevel, channel)
            : JSON.parse(JSON.stringify(this.OPENING_BUILD));

        for (const entry of fresh.entries) {
            if (patched.has(entry.id)) entry.patched = true;
        }
        return fresh;
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
