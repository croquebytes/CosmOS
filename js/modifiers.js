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

    /* The deterministic id for a record that did not name its own.

       Rank is part of the identity. It used not to be: the id interpolated
       only kind and id, so every rank of a storage repeatable minted the same
       id and rank 2 onwards was refused as a double-apply — silently, while
       the escalating cost was still charged. For two sessions the whole
       economy sat under a 7,000 Praise ceiling nobody chose.

       Rank 1 keeps the historical id with no suffix, so every record already
       sitting in a save still matches itself and game.reconcileRepeatableRanks
       only has to restore the ranks that were discarded. */
    autoId(source, target, seq) {
        const rank = Number(source?.rank) > 1 ? `#r${Number(source.rank)}` : '';
        return `${source?.kind || 'anon'}:${source?.id || seq}${rank}:${target}`;
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
            id: id || Modifiers.autoId(source, target, this._seq),
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
               a legitimate second stack. Purchases that DO stack carry their
               rank in the id — see autoId. */
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

    /* Brings a whole scope in line with a desired set, IN PLACE.

       For scopes whose records are DERIVED rather than purchased — 'cert' is
       a projection of the certified path over the mandate ledger, 'scar' of
       the filed-issue list — the natural implementation is dropScope() then
       re-add. That is what this replaced, and it was wrong, because
       `add` appends and the fold is a left fold in insertion order.

       Every boot re-derived those records, so they jumped behind everything
       the player had bought since the last boot. On `caps.*` that is not
       float noise: mandates fold with `mulfloor` and storage repeatables with
       `add`, so re-ordering turns floor(base * 1.5 * 3) + 2500 into
       floor((base + 2500) * 1.5 * 3). Measured on a real save — certify on
       maintenance, buy one Divine Vault rank, press reload: caps.praise went
       from 4,750 to 13,500 with no player action at all, and again on the
       next purchase-and-reload.

       So: update matching records where they already sit, append only what is
       genuinely new, and drop what is no longer desired. Order is preserved
       for anything that persists, which means a reload changes nothing. */
    reconcileScope(scope, desired) {
        const wanted = new Map();
        for (const mod of desired) {
            const spec = ModifierTargets[mod.target];
            if (!spec) { console.error(`Modifiers.reconcileScope: unknown target "${mod.target}"`); continue; }
            const id = mod.id || `${mod.source?.kind || 'anon'}:${mod.source?.id ?? ''}:${mod.target}`;
            wanted.set(id, { ...mod, id });
        }

        // Drop what is no longer wanted.
        this.records = this.records.filter((r) => r.scope !== scope || wanted.has(r.id));

        // Update what survives, in place, keeping its seq and therefore its
        // position in the fold.
        for (const record of this.records) {
            if (record.scope !== scope) continue;
            const mod = wanted.get(record.id);
            if (!mod) continue;
            record.op = mod.op || record.op;
            record.value = mod.value;
            record.label = mod.label || record.label;
            record.enabled = true;
            wanted.delete(record.id);
        }

        // Whatever is left is new, and belongs at the end — it was not there
        // before, so appending is the honest position for it.
        for (const mod of wanted.values()) this.add({ ...mod, scope });

        return this.records.filter((r) => r.scope === scope).length;
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
