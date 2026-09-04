/* ════════════════════════════════════════════════════════════════════════
   Modifier registry.

   Upgrade effects used to be irreversible in-place mutations:

       effect: () => { State.praiseMultiplier *= 2; }

   There are ~77 of those, and because none can be undone, performPrestige()
   has to hand-rebuild every field it touches. That is why adding Thrones,
   Dominions, repeatables and the Void each required editing the prestige
   reset, and why missing one is a silent bug — which has happened twice.
   It also makes temporary and negative effects inexpressible, which blocks
   Reality Builds, Incidents, and the production-breakdown panel.

   A modifier is a declared, scoped record. Production is a fold over the
   active ones.

   ── Three decisions worth knowing about ────────────────────────────────

   NO CACHE. An earlier design memoised each target's fold and invalidated on
   add/drop. Three independent reviews found the same hole: nothing dirties a
   target when a *dynamic base* changes, so prestige silently failed to
   rebase any multiplier that happened to have no run-scoped records. The
   fold is ~77 records over ~40 targets. Recomputing is cheaper than being
   wrong, so there is no cache to invalidate.

   INSERTION ORDER IS LOAD-BEARING. IEEE-754 multiplication is not
   associative. The same set of praise modifiers folds to a different double
   depending on order, so the fold is a left fold in `seq` order and the log
   is never sorted or reordered.

   BINDINGS WRITE BACK TO THE LEGACY SCALARS. Each target commits into the
   State field it replaced, so getProductionRates() is untouched by this
   refactor and the golden master keeps reading exactly what it read before.
   The registry owns HOW a scalar is computed; the scalar stays the thing
   everything else reads. That separation is what lets this land in steps
   that are individually verifiable.
   ════════════════════════════════════════════════════════════════════════ */

/* Resolves a dotted path against the pristine schema snapshot. Bases are
   derived rather than restated — see the PRISTINE comment in state.js for
   why (two reviews caught hand-transcribed bases that were silently wrong). */
function pristineValue(path) {
    let node = typeof PRISTINE !== 'undefined' ? PRISTINE : null;
    for (const key of path.split('.')) {
        if (node === null || node === undefined) return undefined;
        node = node[key];
    }
    return node;
}

/* Target table.

   `base`  — a path into PRISTINE, or a function for values that legitimately
             move (the three global multipliers rebase to
             divinityPointMultiplier at prestige).
   `write` — commits the folded value into the scalar the game already reads.
   `scope` — the DEFAULT scope for records on this target, derived from one
             mechanical rule: if performPrestige() resets the bound scalar,
             the default is 'run'; if it does not, the default is 'permanent'.
             A review caught three targets where intuition disagreed with the
             code — offlineEfficiency and both follower stats survive prestige
             today, so scoping them 'run' would have been an unannounced nerf. */
const ModifierTargets = {
    // ── Global multipliers. Reset by prestige, rebased to divinity. ──
    'praise.multiplier': {
        base: () => State.divinityPointMultiplier,
        write: (v) => { State.praiseMultiplier = v; },
        scope: 'run',
    },
    'offerings.multiplier': {
        base: () => State.divinityPointMultiplier,
        write: (v) => { State.offeringMultiplier = v; },
        scope: 'run',
    },
    'souls.multiplier': {
        base: () => State.divinityPointMultiplier,
        write: (v) => { State.soulMultiplier = v; },
        scope: 'run',
    },

    // ── Primordial hierarchy ──
    'automaton.seraph.output': {
        base: 'automatons.seraphProduction',
        write: (v) => { State.automatons.seraphProduction = v; },
        scope: 'run',
    },
    'automaton.seraph.cost': {
        base: 'automatons.seraphCostMultiplier',
        write: (v) => { State.automatons.seraphCostMultiplier = v; },
        scope: 'run',
    },
    'automaton.throne.output': {
        base: 'automatons.throneProduction',
        write: (v) => { State.automatons.throneProduction = v; },
        scope: 'run',
    },
    'automaton.throne.cost': {
        base: 'automatons.throneCostMultiplier',
        write: (v) => { State.automatons.throneCostMultiplier = v; },
        scope: 'run',
    },
    // Base is 0.2 — the only sub-1 production default in the game. A
    // copy-pasted 1 here would be a silent 5x soul buff feeding prestige.
    'automaton.cherub.output': {
        base: 'automatons.cherubProduction',
        write: (v) => { State.automatons.cherubProduction = v; },
        scope: 'run',
    },
    'automaton.cherub.cost': {
        base: 'automatons.cherubCostMultiplier',
        write: (v) => { State.automatons.cherubCostMultiplier = v; },
        scope: 'run',
    },
    // NOT an output multiplier: game.getDominionBonus() reads it as a scale
    // on a per-unit additive bonus.
    'automaton.dominion.bonusScale': {
        base: 'automatons.dominionProduction',
        write: (v) => { State.automatons.dominionProduction = v; },
        scope: 'run',
    },
    'automaton.dominion.cost': {
        base: 'automatons.dominionCostMultiplier',
        write: (v) => { State.automatons.dominionCostMultiplier = v; },
        scope: 'run',
    },

    // ── Storage ──
    /* floor: the cheapest cap-raising purchase costs 400 Praise, so any build
       that pushed this below that could never be escaped. A review found
       exactly that — dep_storage_growth folded it to 350. */
    'caps.praise': {
        base: 'resourceCaps.praise',
        write: (v) => { State.resourceCaps.praise = v; },
        scope: 'run',
        floor: 600,
    },
    'caps.offerings': {
        base: 'resourceCaps.offerings',
        write: (v) => { State.resourceCaps.offerings = v; },
        scope: 'run',
    },
    'caps.souls': {
        base: 'resourceCaps.souls',
        write: (v) => { State.resourceCaps.souls = v; },
        scope: 'run',
    },

    // ── Conversion and clicking ──
    'throne.draw': {
        base: 'throneDrawMultiplier',
        write: (v) => { State.throneDrawMultiplier = v; },
        scope: 'run',
    },
    'click.power': {
        base: 'manualClickPower',
        write: (v) => { State.manualClickPower = v; },
        scope: 'run',
    },

    // ── Active loops ──
    'streak.cap': {
        base: 'streakCapBonus',
        write: (v) => { State.streakCapBonus = v; },
        scope: 'run',
    },
    'overclock.potency': {
        base: 'overclockPotency',
        write: (v) => { State.overclockPotency = v; },
        scope: 'run',
    },
    'overclock.duration': {
        base: 'overclockDurationBonus',
        write: (v) => { State.overclockDurationBonus = v; },
        scope: 'run',
    },
    'events.spawnRate': {
        base: 'divineEventSpawnRate',
        write: (v) => { State.divineEventSpawnRate = v; },
        scope: 'run',
    },

    /* performPrestige does NOT reset offlineEfficiency, so the two upgrades
       that raise it survive every reboot today. Scoping this 'run' would
       revert 1.0 to 0.6 on the first prestige — a regression the golden
       master cannot see, because the simulator never goes offline. */
    'offline.efficiency': {
        base: 'offlineEfficiency',
        write: (v) => { State.offlineEfficiency = v; },
        scope: 'permanent',
    },

    // ── Skills. Prestige DOES rebuild State.skills, so 'run'. ──
    'skill.divineIntervention.cooldown': {
        base: 'skills.divineIntervention.cooldown',
        write: (v) => { State.skills.divineIntervention.cooldown = v; },
        scope: 'run',
    },
    'skill.divineIntervention.duration': {
        base: 'skills.divineIntervention.duration',
        write: (v) => { State.skills.divineIntervention.duration = v; },
        scope: 'run',
    },
    'skill.temporalRift.cooldown': {
        base: 'skills.temporalRift.cooldown',
        write: (v) => { State.skills.temporalRift.cooldown = v; },
        scope: 'run',
    },

    // ── Void ──
    'void.darkness.multiplier': {
        base: () => State.divinityPointMultiplier,
        write: (v) => { State.dimensions.void.darknessMultiplier = v; },
        scope: 'run',
    },
    'void.shadow.multiplier': {
        base: () => State.divinityPointMultiplier,
        write: (v) => { State.dimensions.void.shadowMultiplier = v; },
        scope: 'run',
    },
    'void.echo.multiplier': {
        base: () => State.divinityPointMultiplier,
        write: (v) => { State.dimensions.void.echoMultiplier = v; },
        scope: 'run',
    },
    'void.automaton.wraith.output': {
        base: 'dimensions.void.automatons.wraithProduction',
        write: (v) => { State.dimensions.void.automatons.wraithProduction = v; },
        scope: 'run',
    },
    'void.automaton.wraith.cost': {
        base: 'dimensions.void.automatons.wraithCostMultiplier',
        write: (v) => { State.dimensions.void.automatons.wraithCostMultiplier = v; },
        scope: 'run',
    },
    'void.automaton.revenant.output': {
        base: 'dimensions.void.automatons.revenantProduction',
        write: (v) => { State.dimensions.void.automatons.revenantProduction = v; },
        scope: 'run',
    },
    'void.automaton.revenant.cost': {
        base: 'dimensions.void.automatons.revenantCostMultiplier',
        write: (v) => { State.dimensions.void.automatons.revenantCostMultiplier = v; },
        scope: 'run',
    },
    'void.automaton.phantom.output': {
        base: 'dimensions.void.automatons.phantomProduction',
        write: (v) => { State.dimensions.void.automatons.phantomProduction = v; },
        scope: 'run',
    },
    'void.automaton.phantom.cost': {
        base: 'dimensions.void.automatons.phantomCostMultiplier',
        write: (v) => { State.dimensions.void.automatons.phantomCostMultiplier = v; },
        scope: 'run',
    },
    'void.automaton.nemesis.bonusScale': {
        base: 'dimensions.void.automatons.nemesisProduction',
        write: (v) => { State.dimensions.void.automatons.nemesisProduction = v; },
        scope: 'run',
    },
    'void.automaton.nemesis.cost': {
        base: 'dimensions.void.automatons.nemesisCostMultiplier',
        write: (v) => { State.dimensions.void.automatons.nemesisCostMultiplier = v; },
        scope: 'run',
    },
    'void.caps.darkness': {
        base: 'dimensions.void.resourceCaps.darkness',
        write: (v) => { State.dimensions.void.resourceCaps.darkness = v; },
        scope: 'run',
    },
    'void.caps.shadows': {
        base: 'dimensions.void.resourceCaps.shadows',
        write: (v) => { State.dimensions.void.resourceCaps.shadows = v; },
        scope: 'run',
    },
    'void.caps.echoes': {
        base: 'dimensions.void.resourceCaps.echoes',
        write: (v) => { State.dimensions.void.resourceCaps.echoes = v; },
        scope: 'run',
    },
    'void.revenant.draw': {
        base: 'dimensions.void.revenantDrawMultiplier',
        write: (v) => { State.dimensions.void.revenantDrawMultiplier = v; },
        scope: 'run',
    },
    'void.click.power': {
        base: 'dimensions.void.manualClickPower',
        write: (v) => { State.dimensions.void.manualClickPower = v; },
        scope: 'run',
    },
};

/* Operations.

   `max` is not reducible to mul or set: the two offline-efficiency upgrades
   raise a floor, so `mul` would compound on replay and `set` would let a
   lower tier clobber a higher one.

   `mulfloor` exists because two mandates do Math.floor(cap * 1.5) — the
   floor is part of the semantics, not presentation. */
const ModifierOps = {
    mul: (acc, v) => acc * v,
    add: (acc, v) => acc + v,
    set: (acc, v) => v,
    max: (acc, v) => Math.max(acc, v),
    min: (acc, v) => Math.min(acc, v),
    mulfloor: (acc, v) => Math.floor(acc * v),
};

const Modifiers = {
    records: [],
    _seq: 0,

    reset() {
        this.records = [];
        this._seq = 0;
    },

    baseOf(target) {
        const spec = ModifierTargets[target];
        if (!spec) return undefined;
        return typeof spec.base === 'function' ? spec.base() : pristineValue(spec.base);
    },

    /* Appends a record. Returns it, or null if the target is unknown — an
       unknown target is a programming error, not a runtime condition, so it
       is loud rather than silent. */
    add({ target, op = 'mul', value, scope, source, label, expiresAt = null, id = null }) {
        const spec = ModifierTargets[target];
        if (!spec) {
            console.error(`Modifiers.add: unknown target "${target}"`);
            return null;
        }
        if (!ModifierOps[op]) {
            console.error(`Modifiers.add: unknown op "${op}" for ${target}`);
            return null;
        }

        const record = {
            id: id || `${source?.kind || 'anon'}:${source?.id || this._seq}:${target}`,
            target,
            op,
            value,
            scope: scope || spec.scope,
            source: source || { kind: 'anon' },
            label: label || target,
            expiresAt,
            enabled: true,
            seq: this._seq++,
        };
        if (this.records.some((existing) => existing.id === record.id)) {
            /* Ids are deterministic, so a repeat is a double-apply rather than
               a legitimate second stack.

               ── KNOWN DEFECT. Read this before "fixing" it. ──────────────

               The next sentence used to read "purchases that DO stack
               (repeatable ranks, shop tiers) carry their rank in the id".
               They do not. purchaseRepeatable passes
               `source: {kind, id, rank}` (js/game.js), but the auto-id above
               interpolates only kind and id — so every rank of a storage
               repeatable mints the SAME id and rank 2 onwards is refused
               here, silently, while the escalating cost is still charged.
               Measured: four ranks of praise_vault produce one record and
               caps 1000 -> 3500 instead of 12250.

               The one-line fix is to put `source.rank` in the id. Do not
               make it a one-line commit. Measured with tools/balance_sim.mjs
               at 8h / 24h / 48h:

                 defect present   36 reboots by 48h, gaps 80-140 min,
                                  caps.praise 9e3        <- converges
                 rank in the id  553 reboots by 48h, gaps pinned at 5:00,
                                  caps.praise 7.6e20     <- diverges

               Five hundred reboots landing exactly on the simulator's own
               policy gate is the same divergence signature the reboot curve
               was retuned to remove (see the Economy header in js/state.js).
               It reproduces at EVERY capacityGrowth tried — 1.38, 1.28,
               1.25, 1.22, 1.18, 1.10 — because the problem is not the grant
               curve. It is that a 7,000 Praise ceiling is currently the
               binding constraint on the whole economy, and the prestige
               constants were tuned underneath it.

               So the storage curve is divergent on its own terms as well:
               capacityGrowth 1.38 against cost growth 1.32 means each rank
               grants more than it costs, forever. Both have to be fixed
               together, with the prestige curve re-measured on top, at 48h
               and 72h. That is a session, not a line. */
            return null;
        }

        this.records.push(record);
        return record;
    },

    /* Convenience for content tables: declare several at once from one source. */
    addAll(mods, source, label) {
        return mods.map((mod) => this.add({ ...mod, source, label: mod.label || label }));
    },

    isActive(record, now) {
        if (!record.enabled) return false;
        if (record.expiresAt !== null && record.expiresAt !== undefined && now >= record.expiresAt) return false;
        return true;
    },

    /* Left fold in insertion order. See the header note on associativity. */
    fold(target, now) {
        let acc = this.baseOf(target);
        for (const record of this.records) {
            if (record.target !== target) continue;
            if (!this.isActive(record, now)) continue;
            acc = ModifierOps[record.op](acc, record.value);
        }
        return acc;
    },

    /* Folds while ignoring one scope. Used to price a patch against the cap the
       run would have WITHOUT the current build, so a build cannot move the
       price of its own patches. */
    foldExcluding(target, excludedScope, now) {
        let acc = this.baseOf(target);
        for (const record of this.records) {
            if (record.target !== target) continue;
            if (record.scope === excludedScope) continue;
            if (!this.isActive(record, now)) continue;
            acc = ModifierOps[record.op](acc, record.value);
        }
        return acc;
    },

    /* Same walk, but keeping each step — this is what a production-breakdown
       panel renders, and it cannot drift from the real value because it IS
       the real computation. */
    explain(target, now) {
        const steps = [];
        let acc = this.baseOf(target);
        steps.push({ label: 'Base', op: 'base', value: acc, running: acc });
        for (const record of this.records) {
            if (record.target !== target) continue;
            if (!this.isActive(record, now)) continue;
            acc = ModifierOps[record.op](acc, record.value);
            steps.push({
                label: record.label,
                op: record.op,
                value: record.value,
                running: acc,
                source: record.source,
            });
        }
        return { target, value: acc, steps };
    },

    /* Writes every target's folded value into the scalar the game reads.
       Call after any change to the log, and after prestige. */
    commit(now) {
        for (const target of Object.keys(ModifierTargets)) {
            const spec = ModifierTargets[target];
            let value = this.fold(target, now);
            // A declared floor is a playability guarantee, applied last so no
            // combination of modifiers can breach it.
            if (spec.floor !== undefined) value = Math.max(spec.floor, value);
            spec.write(value);
        }
    },

    /* Prestige. Returns the dropped records so the caller can assert against
       the ownership ledgers it clears separately — the ledgers
       (State.upgrades, purchasedMandates, repeatables) are NOT modifiers and
       dropScope cannot reach them. */
    dropScope(scope) {
        const dropped = this.records.filter((r) => r.scope === scope);
        this.records = this.records.filter((r) => r.scope !== scope);
        return dropped;
    },

    dropSource(kind, id) {
        const dropped = this.records.filter((r) => r.source?.kind === kind && r.source?.id === id);
        this.records = this.records.filter((r) => !(r.source?.kind === kind && r.source?.id === id));
        return dropped;
    },

    /* Drops expired temporaries. Separate from fold() so that folding stays
       free of side effects. */
    sweep(now) {
        const before = this.records.length;
        this.records = this.records.filter((r) => this.isActive(r, now) || r.expiresAt === null);
        return before - this.records.length;
    },

    /* Serialised into the save so the log survives a reload with its order
       intact. Purchase order is not otherwise recoverable. */
    serialize() {
        return { seq: this._seq, records: this.records };
    },

    hydrate(data) {
        if (!data || !Array.isArray(data.records)) return false;
        this.records = data.records
            .filter((r) => r && ModifierTargets[r.target] && ModifierOps[r.op])
            .sort((a, b) => a.seq - b.seq);
        this._seq = Number(data.seq) || this.records.length;
        return true;
    },
};
