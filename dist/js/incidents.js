/* ════════════════════════════════════════════════════════════════════════
   Incidents — the maintenance loop.

   The fiction is divine maintenance and, until this file, nothing in the
   game asked you to maintain anything. Now the OS notices things going wrong
   and files tickets. Every ticket offers the same three answers:

     LABOUR     stabilise it by hand. A short timing ritual. Costs attention.
     RESOURCES  pay it off. Priced against the economy you have NOW.
     DEBT       defer it. The ticket closes; a run-scoped penalty stays.

   And a fourth that is not a button: do nothing. A real fault escalates —
   SEV-3 to SEV-2 to a SEV-1 outage that halts its production line. A false
   alarm closes itself. Telling the two apart is the skill.

   ── Four rules this file is built around ────────────────────────────────

   EFFECTS ARE MODIFIERS. An open incident's damage is a set of records in
   the registry under `scope: 'incident'`, never a write into State. Debts
   live there too. The whole set is a PROJECTION of State.incidents and is
   brought in line with Modifiers.reconcileScope — in place, never drop and
   re-add, because the fold is a left fold in insertion order and re-seating
   records on every boot is exactly how 2026-09-03 inflated storage caps by
   pressing reload.

   TIME IS ATTENDED TIME. Escalation timers and the spawn clock count only
   the seconds a player was present for. Offline progress, the Temporal Rift
   and the suspended-tab catch-up in loop() never reach Incidents.tick — the
   same three bulk-time paths accrueInstability is exempted from, for the
   same reason: a player cannot triage what they were not there to see.
   Timers are stored as seconds REMAINING rather than as wall-clock deadlines
   for the same reason; a deadline would expire while the laptop was shut.

   CONTENT IS DATA, STATE IS AN INDEX INTO IT. A saved incident names a
   template and a severity. Its effect, its cost and its debt are derived
   from the table, so a forged save cannot mint a `praise.multiplier mul 1e9`
   by writing it into an incident. normalise() validates every field.

   NO DOM. The simulator and the test harnesses load this file in a vm
   sandbox. Everything visible goes through ui.*, which is a no-op proxy
   there, and anything the UI needs is returned by view().
   ════════════════════════════════════════════════════════════════════════ */

/* Production lines. A SEV-1 outage halts exactly one of these. */
const IncidentLines = {
    seraph:   { label: 'Seraph line',   resource: 'praise',    target: 'automaton.seraph.output',
                live: () => (State.automatons?.seraphCount || 0) >= 1 },
    throne:   { label: 'Throne line',   resource: 'offerings', target: 'automaton.throne.output',
                live: () => (State.automatons?.throneCount || 0) >= 1 },
    cherub:   { label: 'Cherub line',   resource: 'souls',     target: 'automaton.cherub.output',
                live: () => (State.automatons?.cherubCount || 0) >= 1 },
    wraith:   { label: 'Wraith line',   resource: 'darkness',  target: 'void.automaton.wraith.output',
                live: () => !!State.dimensions?.void?.unlocked && (State.dimensions.void.automatons?.wraithCount || 0) >= 1 },
    revenant: { label: 'Revenant line', resource: 'shadows',   target: 'void.automaton.revenant.output',
                live: () => !!State.dimensions?.void?.unlocked && (State.dimensions.void.automatons?.revenantCount || 0) >= 1 },
    phantom:  { label: 'Phantom line',  resource: 'echoes',    target: 'void.automaton.phantom.output',
                live: () => !!State.dimensions?.void?.unlocked && (State.dimensions.void.automatons?.phantomCount || 0) >= 1 },
};

/* What a target means to a player, for effect and debt text. */
const IncidentTargetLabels = {
    'automaton.seraph.output': 'Seraph output',
    'automaton.seraph.cost': 'Seraph requisition cost',
    'praise.multiplier': 'Praise throughput',
    'automaton.throne.output': 'Throne yield',
    'throne.draw': 'Throne Praise draw',
    'automaton.cherub.output': 'Cherub output',
    'automaton.cherub.cost': 'Cherub requisition cost',
    'souls.multiplier': 'Soul throughput',
    'offerings.multiplier': 'Offering throughput',
    'automaton.dominion.bonusScale': 'Dominion bonus',
    'click.power': 'Miracle strength',
    'events.spawnRate': 'Divine Event frequency',
    'offline.efficiency': 'Unattended efficiency',
    'void.automaton.wraith.output': 'Wraith output',
    'void.automaton.revenant.output': 'Revenant output',
    'void.revenant.draw': 'Revenant Darkness draw',
    'void.automaton.phantom.output': 'Phantom output',
};

/* ── The templates ───────────────────────────────────────────────────────

   `desc` is what a REAL fault reads like: specific, corroborated, measured.
   `tell` is the same ticket raised in error, and it is written to be caught
   by someone who reads it — a reporter with a history, a number that cannot
   be right, a timestamp from next week. A false alarm also applies NO
   effect, so the other way to catch one is to look at your rates and notice
   nothing moved. Both are deliberate: ignoring must sometimes be the right
   call, and it should be the right call for a reason the player can find.

   `effect` scales by severity; SEV-1 always adds a halt on the template's
   line on top of the SEV-2 effect. `debt` is the run-scoped penalty for
   deferring, at SEV-3 strength; it deepens with severity — see debtValue. */
const IncidentTemplates = [
    {
        id: 'choir_desync', process: 'choir_sync.svc', line: 'seraph', pay: 'praise',
        title: 'Choir desync in Sector {sector}',
        effect: { target: 'automaton.seraph.output', op: 'mul', 3: 0.6, 2: 0.3 },
        desc: 'Two hymns are being sung at once and both are wrong. Confirmed by the choirmaster, who is upset about it.',
        tell: 'Seraph output reported down sharply. Reported by watcher.whisperd (legacy), which also reports the sun as missing.',
        debt: { target: 'automaton.seraph.output', op: 'mul', value: 0.9, label: 'Choir throttled to keep time' },
        labour: 'Conduct the choir back into phase',
    },
    {
        id: 'hymnal_checksum', process: 'hymnal_verify.exe', line: 'seraph', pay: 'praise',
        title: 'Hymnal checksum mismatch, Sector {sector}',
        effect: { target: 'praise.multiplier', op: 'mul', 3: 0.75, 2: 0.5 },
        desc: 'Verses failing verification and being sung twice to be safe. Praise throughput falling with every repeat.',
        tell: 'Checksum mismatch on 0 of 0 verses (100%). Verification ran against tomorrow\'s hymnal.',
        debt: { target: 'automaton.seraph.cost', op: 'mul', value: 1.15, label: 'Hymnals now checksummed by hand, per Seraph' },
        labour: 'Re-verify the verses one at a time',
    },
    {
        id: 'requisition_backlog', process: 'requisitiond', line: 'seraph', pay: 'praise',
        title: 'Requisition backlog, Sector {sector}',
        effect: { target: 'automaton.seraph.cost', op: 'mul', 3: 1.5, 2: 2.2 },
        desc: 'Seraph requisitions stuck in triplicate. Procurement is pricing the delay into every order.',
        tell: 'Requisition queue at 4,000% capacity. Queue length: 1. Form attached is the queue.',
        debt: { target: 'automaton.seraph.cost', op: 'mul', value: 1.1, label: 'Requisitions routed through the slow office' },
        labour: 'Countersign the backlog yourself',
    },
    {
        id: 'miracle_ratelimit', process: 'intervention_guard.sys', line: 'seraph', pay: 'praise',
        title: 'Intervention guard tripped, Sector {sector}',
        effect: { target: 'click.power', op: 'mul', 3: 0.3, 2: 0.1 },
        desc: 'The abuse filter has flagged your miracles as abuse. They are yours. The filter is aware and unmoved.',
        tell: 'Abuse filter tripped by 9,000,000 miracles in the last second. You performed none.',
        debt: { target: 'click.power', op: 'mul', value: 0.85, label: 'Miracles routed through the abuse filter' },
        labour: 'Prove the miracles are yours',
    },
    {
        id: 'heartbeat_lost', process: 'heartbeat.monitor', line: 'seraph', pay: 'souls',
        title: 'Heartbeat lost on the unattended relay',
        effect: { target: 'offline.efficiency', op: 'min', 3: 0.3, 2: 0.15 },
        desc: 'The relay that keeps the universe running while you are away has stopped answering. Do not close the console.',
        tell: 'Heartbeat lost. Last heartbeat received: now. Monitor recommends panic.',
        debt: { target: 'offline.efficiency', op: 'min', value: 0.5, label: 'Unattended relay running on the spare' },
        labour: 'Resuscitate the relay',
    },
    {
        id: 'altar_overflow', process: 'altar_spool.svc', line: 'throne', pay: 'offerings',
        title: 'Altar spool overflow, Sector {sector}',
        effect: { target: 'automaton.throne.output', op: 'mul', 3: 0.6, 2: 0.3 },
        desc: 'Offerings arriving faster than the spool can bless them. The surplus is being returned to sender.',
        tell: 'Altar spool overflow detected on altar #0. There is no altar #0.',
        debt: { target: 'throne.draw', op: 'mul', value: 1.15, label: 'Thrones double-blessing to clear the spool' },
        labour: 'Drain the spool by hand',
    },
    {
        id: 'conduit_pressure', process: 'conduit_regulator.exe', line: 'throne', pay: 'praise',
        title: 'Conduit over-pressure, Sector {sector}',
        effect: { target: 'throne.draw', op: 'mul', 3: 1.5, 2: 2.0 },
        desc: 'Throne conduits pulling Praise well past rated draw. Two regulators agree; the third is on fire.',
        tell: 'Conduit pressure critical. Gauge last calibrated by "a guy". The guy is not reachable.',
        debt: { target: 'automaton.throne.output', op: 'mul', value: 0.9, label: 'Conduits run at reduced pressure' },
        labour: 'Bleed the conduits',
    },
    {
        id: 'reliquary_misfile', process: 'reliquary_index.db', line: 'cherub', pay: 'souls',
        title: 'Reliquary misfiling, Sector {sector}',
        effect: { target: 'automaton.cherub.output', op: 'mul', 3: 0.6, 2: 0.3 },
        desc: 'Cherubs filing Souls under the wrong saint. Retrieval confirms it: Saint Agnes now holds eleven thousand fishermen.',
        tell: 'Souls misfiled under saint "undefined". Saint "undefined" reports no complaints.',
        debt: { target: 'automaton.cherub.output', op: 'mul', value: 0.9, label: 'Cherubs double-check every filing' },
        labour: 'Re-shelve the reliquary',
    },
    {
        id: 'soul_tagging', process: 'soul_tagger.dll', line: 'cherub', pay: 'offerings',
        title: 'Soul tagging fault, Sector {sector}',
        effect: { target: 'souls.multiplier', op: 'mul', 3: 0.7, 2: 0.45 },
        desc: 'Souls arriving untagged and being held at intake for identification. The intake queue is visible from orbit.',
        tell: 'Soul tagging fault on 100% of souls processed during scheduled downtime. No downtime was scheduled.',
        debt: { target: 'automaton.cherub.cost', op: 'mul', value: 1.15, label: 'Cherubs issued with a tagging gun each' },
        labour: 'Tag the backlog',
    },
    {
        id: 'dominion_audit', process: 'dominion_audit.exe', line: 'cherub', pay: 'souls',
        title: 'Dominion audit in progress',
        effect: { target: 'automaton.dominion.bonusScale', op: 'mul', 3: 0.7, 2: 0.4 },
        desc: 'Auditors have frozen Dominion authority pending a review of who authorised it. It was you. They need it in writing.',
        tell: 'Audit opened by the Office of Audits into the Office of Audits. Scope: recursive.',
        debt: { target: 'automaton.dominion.bonusScale', op: 'mul', value: 0.9, label: 'Dominions operating under audit' },
        labour: 'Put it in writing',
        requires: () => (State.automatons?.dominionCount || 0) >= 1,
    },
    {
        id: 'anomaly_flood', process: 'anomaly_detect.svc', line: 'seraph', pay: 'souls',
        title: 'Anomaly detector flooding',
        effect: { target: 'events.spawnRate', op: 'mul', 3: 0.4, 2: 0.2 },
        desc: 'Anomaly detection has detected itself and is filing reports about the reports. Real Divine Events are queued behind them.',
        tell: 'Anomaly detected: anomaly detection enabled. Previous Operator\'s note on the ticket reads "told you".',
        debt: { target: 'events.spawnRate', op: 'mul', value: 0.85, label: 'Anomaly detection rate-limited' },
        labour: 'Clear the report storm',
    },
    {
        id: 'wraith_unbound', process: 'veil_binding.sys', line: 'wraith', pay: 'darkness',
        title: 'Wraith binding slipped, Void sector {sector}',
        effect: { target: 'void.automaton.wraith.output', op: 'mul', 3: 0.6, 2: 0.3 },
        desc: 'Wraiths half-unbound and bleeding the tear in directions it does not have. Darkness yield falling.',
        tell: 'Wraith binding slipped by -0.0 degrees. Binding reported as both slipped and fine. Wraiths decline to comment.',
        debt: { target: 'void.automaton.wraith.output', op: 'mul', value: 0.9, label: 'Wraiths bound on a short tether' },
        labour: 'Re-bind the wraiths',
    },
    {
        id: 'revenant_hunger', process: 'revenant_feed.exe', line: 'revenant', pay: 'shadows',
        title: 'Revenant feeding fault, Void sector {sector}',
        effect: { target: 'void.revenant.draw', op: 'mul', 3: 1.5, 2: 2.0 },
        desc: 'Revenants drawing Darkness well past ration and condensing nothing extra for it. Hunger confirmed by the ration logs.',
        tell: 'Revenants report hunger. Revenants always report hunger. This is the eleventh ticket this shift.',
        debt: { target: 'void.automaton.revenant.output', op: 'mul', value: 0.9, label: 'Revenants put on short rations' },
        labour: 'Ration the revenants',
    },
    {
        id: 'phantom_echo', process: 'echo_cancel.dll', line: 'phantom', pay: 'echoes',
        title: 'Phantom echo cancellation failing',
        effect: { target: 'void.automaton.phantom.output', op: 'mul', 3: 0.6, 2: 0.3 },
        desc: 'Phantoms cancelling each other\'s echoes. Net echo yield measured falling on every channel.',
        tell: 'Echo cancellation failing. Echo cancellation failing. Echo cancellation failing. (Ticket is itself an echo.)',
        debt: { target: 'void.automaton.phantom.output', op: 'mul', value: 0.9, label: 'Phantoms spaced further apart' },
        labour: 'Cancel the echoes by hand',
    },
];

const IncidentSectors = ['7G', '3A', '12C', '9F', '0B', '4D', '11E', '2H'];

const Incidents = {
    /* ── Tunables. Module-level, not State: a save must never pin a curve.
       These are deliberately NOT in Economy — the lead is re-tuning that
       table, and the simulator has no incident policy yet. ──────────────── */
    MAX_OPEN: 3,
    /* Attended seconds before a brand-new save can see its first ticket.
       Paired with the first Divine Directive being complete — see canSpawn. */
    QUIET_SECONDS: 600,
    SPAWN_INTERVAL: 60,        // one roll per attended minute
    SPAWN_GAP: 90,             // attended seconds between filings
    /* Per-roll chance by the channel of the build actually being played.
       Each unpatched known issue adds a third again: a build you have not
       maintained is a build that breaks. */
    SPAWN_CHANCE: { stable: 0.025, beta: 0.045, nightly: 0.075, archived: 0.025 },
    ISSUE_PRESSURE: 0.35,
    FALSE_ALARM_CHANCE: 0.25,
    NIGHTLY_SEV2_CHANCE: 0.25,
    /* Attended seconds a severity holds before escalating. SEV-1 holds. */
    ESCALATE_AFTER: { 3: 240, 2: 180 },
    /* Resources: [floor fraction of cap, ceiling fraction of cap, seconds of
       production]. Seconds of production is the meaningful price; the cap
       fractions keep it non-trivial when production is small and payable
       when production dwarfs storage — which it currently does, by up to
       fifteen orders of magnitude. */
    COST: { 3: [0.12, 0.4, 90], 2: [0.2, 0.6, 180], 1: [0.3, 0.85, 300] },
    DEBT_DEPTH: { 3: 1, 2: 1.5, 1: 2 },
    /* Tuned so a flawless pair of hands takes ~9s on a SEV-3 and ~16s on an
       outage, and a person with misses lands in the 15-45s the loop wants:
       long enough to be the time sink, short enough not to be a chore. The
       cooldown is what makes the floor real — a pulse inside it is ignored,
       not counted as a miss, so it costs patience rather than progress. */
    LABOUR_HITS: { 3: 8, 2: 11, 1: 14 },
    LABOUR_PERIOD_MS: 2000,
    LABOUR_COOLDOWN_MS: 450,
    PROPHET_SECONDS: 120,
    ARTIFACT_QUOTA: 5,
    MAX_DEBTS: 64,

    /* Injectable so the tests can pin a roll. Never Math.random directly. */
    random: () => Math.random(),

    /* ── State ────────────────────────────────────────────────────────── */

    template(id) {
        return IncidentTemplates.find((t) => t.id === id) || null;
    },

    defaults() {
        return {
            open: [], debts: [], nextNumber: 1,
            attendedSeconds: 0, spawnClock: 0, quietUntil: 0,
            stats: this.freshStats(),
        };
    },

    freshStats() {
        return {
            filed: 0, resolved: 0, labour: 0, resources: 0, debt: 0, sacrifice: 0,
            prophet: 0, falseAlarmsCleared: 0, outages: 0, outagesSacrificed: 0,
        };
    },

    /* Every field validated by type and range, not by truthiness.

       `cert.path = cert.path || null` (335f41f) was a no-op for every truthy
       value and let a save switch the Mandate tree off. State.mergeInto does
       no type checking and importSave decodes arbitrary pasted text straight
       into State, so anything here can be anything. A template that does not
       exist, a severity of 99, a negative timer, a string where a number
       goes, an id that would break an inline handler: each is repaired or
       the entry is dropped. Nothing here throws. */
    normalise() {
        const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        if (!plain(State.incidents)) State.incidents = this.defaults();
        const s = State.incidents;
        const finiteAtLeast = (v, min, fallback) => (Number.isFinite(v) && v >= min ? v : fallback);

        s.attendedSeconds = finiteAtLeast(s.attendedSeconds, 0, 0);
        s.spawnClock = Number.isFinite(s.spawnClock) && s.spawnClock >= 0 && s.spawnClock < this.SPAWN_INTERVAL
            ? s.spawnClock : 0;
        s.quietUntil = finiteAtLeast(s.quietUntil, 0, 0);
        if (s.quietUntil > s.attendedSeconds + this.SPAWN_GAP) s.quietUntil = s.attendedSeconds + this.SPAWN_GAP;

        const stats = plain(s.stats) ? s.stats : {};
        const fresh = this.freshStats();
        for (const key of Object.keys(fresh)) fresh[key] = finiteAtLeast(stats[key], 0, 0);
        s.stats = fresh;

        const severity = (v) => ([1, 2, 3].includes(v) ? v : 3);
        const idOk = (v) => typeof v === 'string' && /^INC-\d{1,9}$/.test(v);
        const seen = new Set();
        let highest = 0;
        const number = (id) => Number(id.slice(4));

        const open = [];
        for (const raw of Array.isArray(s.open) ? s.open : []) {
            if (!plain(raw) || !this.template(raw.template)) continue;
            if (!idOk(raw.id) || seen.has(raw.id)) continue;
            if (open.length >= this.MAX_OPEN) break;
            seen.add(raw.id);
            highest = Math.max(highest, number(raw.id));
            const sev = severity(raw.severity);
            const limit = this.ESCALATE_AFTER[sev] || 0;
            const remaining = Number.isFinite(raw.remaining) && raw.remaining >= 0 ? Math.min(limit, raw.remaining) : limit;
            const prophet = raw.prophet === true && sev === 3;
            open.push({
                id: raw.id,
                template: raw.template,
                severity: sev,
                remaining,
                sector: IncidentSectors.includes(raw.sector) ? raw.sector : IncidentSectors[0],
                falseAlarm: raw.falseAlarm === true,
                alerted: raw.alerted === true,
                prophet,
                prophetRemaining: prophet
                    ? Math.min(this.PROPHET_SECONDS, finiteAtLeast(raw.prophetRemaining, 0, this.PROPHET_SECONDS))
                    : 0,
                // Labour progress is a ritual in progress, not state worth
                // keeping: its clock is wall-time and means nothing on reload.
            });
        }
        s.open = open;

        const debts = [];
        const debtSeen = new Set();
        for (const raw of Array.isArray(s.debts) ? s.debts : []) {
            if (debts.length >= this.MAX_DEBTS) break;
            if (!plain(raw) || !this.template(raw.template) || !idOk(raw.id) || debtSeen.has(raw.id)) continue;
            debtSeen.add(raw.id);
            highest = Math.max(highest, number(raw.id));
            debts.push({ id: raw.id, template: raw.template, severity: severity(raw.severity) });
        }
        s.debts = debts;

        const next = Number.isInteger(s.nextNumber) && s.nextNumber >= 1 && s.nextNumber < 1e9 ? s.nextNumber : 1;
        s.nextNumber = Math.max(next, highest + 1);
        return s;
    },

    /* The cheap per-tick read. Full normalisation runs at boot; the tick only
       re-runs it if something has replaced the container's shape since. */
    /* Full normalisation whenever the container is one this module has not
       seen — a fresh load, an import, a harness assigning State.incidents —
       and a cheap shape check otherwise. Not just at boot: game.loop() runs
       its first tick before system.init() has called bootstrapModifiers, so
       the tick can be the first reader of a save nobody has validated. */
    state() {
        const s = State.incidents;
        if (s !== this._checked || !s || !Array.isArray(s.open) || !Array.isArray(s.debts) || !s.stats) {
            const fresh = this.normalise();
            this._checked = fresh;
            return fresh;
        }
        return s;
    },

    find(id) {
        return this.state().open.find((inc) => inc.id === id) || null;
    },

    /* ── The projection into the registry ─────────────────────────────── */

    effectMods(inc) {
        const tpl = this.template(inc.template);
        if (!tpl || inc.falseAlarm) return [];
        const label = `${inc.id} (SEV-${inc.severity}) — ${this.titleOf(inc)}`;
        const source = { kind: 'incident', id: inc.id };
        const mods = [];
        const eff = tpl.effect;
        const effSeverity = inc.severity === 1 ? 2 : inc.severity;
        const lineTarget = IncidentLines[tpl.line].target;
        if (!(inc.severity === 1 && eff.target === lineTarget)) {
            mods.push({ id: `incident:${inc.id}:${eff.target}`, target: eff.target, op: eff.op,
                value: eff[effSeverity], source, label });
        }
        if (inc.severity === 1) {
            mods.push({ id: `incident:${inc.id}:${lineTarget}`, target: lineTarget, op: 'mul', value: 0,
                source, label: `${inc.id} OUTAGE — ${IncidentLines[tpl.line].label} halted` });
        }
        return mods;
    },

    /* A deferral deepens with the severity it was deferred at: shrugging off
       a SEV-3 is cheap, shrugging off an outage is not. */
    debtValue(debt, severity) {
        const depth = this.DEBT_DEPTH[severity] || 1;
        if (debt.op === 'mul') return 1 + (debt.value - 1) * depth;
        return debt.value;
    },

    debtMods(entry) {
        const tpl = this.template(entry.template);
        if (!tpl) return [];
        return [{
            id: `incident-debt:${entry.id}:${tpl.debt.target}`,
            target: tpl.debt.target,
            op: tpl.debt.op,
            value: this.debtValue(tpl.debt, entry.severity),
            source: { kind: 'incident-debt', id: entry.id },
            label: `${entry.id} deferred — ${tpl.debt.label}`,
        }];
    },

    desiredMods() {
        const s = this.state();
        return [
            ...s.open.flatMap((inc) => this.effectMods(inc)),
            ...s.debts.flatMap((d) => this.debtMods(d)),
        ];
    },

    /* Reconciled in place. See the header, and Modifiers.reconcileScope. */
    sync(now = Date.now()) {
        const count = Modifiers.reconcileScope('incident', this.desiredMods());
        Modifiers.commit(now);
        return count;
    },

    /* Boot. Normalise the save, then make the registry agree with it —
       including dropping any 'incident' record a forged log carried that no
       open incident or debt accounts for. */
    bootstrap(now = Date.now()) {
        this._checked = this.normalise();
        this.booted = true;
        return this.sync(now);
    },

    /* ── Spawning ─────────────────────────────────────────────────────── */

    channel() {
        return State.reality?.build?.channel || State.reality?.channel || 'stable';
    },

    unpatchedIssueCount() {
        const build = State.reality?.build;
        if (!build || typeof Reality === 'undefined') return 0;
        return Reality.unpatchedIssues(build).length;
    },

    spawnChance() {
        const base = this.SPAWN_CHANCE[this.channel()] ?? this.SPAWN_CHANCE.stable;
        return base * (1 + this.ISSUE_PRESSURE * this.unpatchedIssueCount());
    },

    /* Onboarding stays clean. Ten attended minutes, AND the first Divine
       Directive done — the briefing's work order is "perform 10 miracles,
       commission a Seraph", and a ticket arriving inside that is noise the
       player has no frame for. A returning player past their first reboot
       has the frame already. */
    onboarded() {
        const s = this.state();
        if (s.attendedSeconds < this.QUIET_SECONDS) return false;
        const directivesDone = State.loopSystems?.directives?.completed || 0;
        return directivesDone >= 1 || (State.prestigeLevel || 0) > 0;
    },

    eligibleTemplates() {
        const openTemplates = new Set(this.state().open.map((inc) => inc.template));
        return IncidentTemplates.filter((tpl) => {
            if (openTemplates.has(tpl.id)) return false;
            if (!IncidentLines[tpl.line].live()) return false;
            try { return tpl.requires ? !!tpl.requires() : true; } catch { return false; }
        });
    },

    canSpawn() {
        const s = this.state();
        if (!this.onboarded()) return false;
        if (s.open.length >= this.MAX_OPEN) return false;
        if (s.attendedSeconds < s.quietUntil) return false;
        return this.eligibleTemplates().length > 0;
    },

    maybeSpawn(now = Date.now()) {
        if (!this.canSpawn()) return null;
        if (this.random() >= this.spawnChance()) return null;
        const pool = this.eligibleTemplates();
        const tpl = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))];
        return this.file(tpl.id, {}, now);
    },

    /* Files a ticket. Spawning calls this; so can the tests and a debugging
       Operator. `opts` may pin severity, falseAlarm and sector. */
    /* Sound is presentation: routed through game.sfx, which is inert in the
       simulator and every vm test, and never decides anything. */
    cue(name, opts) {
        if (typeof game !== 'undefined' && typeof game.sfx === 'function') game.sfx(name, opts);
    },

    file(templateId, opts = {}, now = Date.now()) {
        const tpl = this.template(templateId);
        if (!tpl) return null;
        const s = this.state();
        if (s.open.length >= this.MAX_OPEN) return null;

        /* The first ticket a save ever sees is real. A false alarm is a lesson
           about telemetry, and it only lands once the player knows what a
           true one looks like. */
        let falseAlarm = typeof opts.falseAlarm === 'boolean'
            ? opts.falseAlarm
            : (s.stats.filed > 0 && this.random() < this.FALSE_ALARM_CHANCE);
        let severity = [1, 2, 3].includes(opts.severity) ? opts.severity
            : (!falseAlarm && this.channel() === 'nightly' && this.random() < this.NIGHTLY_SEV2_CHANCE ? 2 : 3);
        // A false alarm is a SEV-3 by construction: it never escalates.
        if (falseAlarm && severity !== 3) falseAlarm = false;

        const inc = {
            id: `INC-${String(s.nextNumber).padStart(4, '0')}`,
            template: tpl.id,
            severity,
            remaining: this.ESCALATE_AFTER[severity] || 0,
            sector: IncidentSectors.includes(opts.sector) ? opts.sector
                : IncidentSectors[Math.floor(this.random() * IncidentSectors.length) % IncidentSectors.length],
            falseAlarm,
            alerted: false,
            prophet: false,
            prophetRemaining: 0,
        };
        s.nextNumber += 1;
        s.open.push(inc);
        s.stats.filed += 1;
        if (severity === 1) s.stats.outages += 1;
        s.quietUntil = s.attendedSeconds + this.SPAWN_GAP;
        this.sync(now);

        ui.log(`[${inc.id}] SEV-${severity} filed: ${this.titleOf(inc)}. See Task Manager.`);
        this.cue('incident', { severity });
        ui.onIncidentsChanged?.();
        this.announce();
        return inc;
    },

    /* ── The clock ────────────────────────────────────────────────────────
       Called from game.tick() for ATTENDED ticks only. A tick longer than
       game.ATTENDED_GAP_SECONDS is treated as bulk time even if a caller
       marked it attended: a direct caller handing tick() an hour is, by
       definition, not a frame, and the rule is that nobody comes back to an
       outage that happened while they were away. */
    tick(deltaSeconds, now = Date.now()) {
        /* Nothing runs before bootstrap. The registry is empty until then,
           so a sync here would commit base values over every scalar, and the
           hydrate that follows would discard what it wrote anyway. */
        if (!this.booted) return;
        const gap = (typeof game !== 'undefined' && game.ATTENDED_GAP_SECONDS) || 5;
        if (!(deltaSeconds > 0) || deltaSeconds > gap) return;
        const s = this.state();
        s.attendedSeconds += deltaSeconds;

        let changed = false;
        for (const inc of [...s.open]) {
            if (inc.prophet) {
                inc.prophetRemaining -= deltaSeconds;
                if (inc.prophetRemaining <= 0) this.resolve(inc.id, 'prophet', now);
                continue;
            }
            if (inc.severity === 1) continue;
            inc.remaining -= deltaSeconds;
            if (inc.remaining > 0) continue;

            if (inc.falseAlarm) {
                this.selfClose(inc, now);
                continue;
            }
            inc.severity -= 1;
            inc.remaining = this.ESCALATE_AFTER[inc.severity] || 0;
            changed = true;
            this.cue('incident', { severity: inc.severity });
            if (inc.severity === 1) {
                s.stats.outages += 1;
                const line = IncidentLines[this.template(inc.template).line].label;
                ui.log(`[${inc.id}] Escalated to SEV-1. OUTAGE: ${line} halted.`);
            } else {
                ui.log(`[${inc.id}] Escalated to SEV-${inc.severity}: ${this.titleOf(inc)}.`);
            }
        }
        if (changed) {
            this.sync(now);
            ui.onIncidentsChanged?.();
        }

        s.spawnClock += deltaSeconds;
        if (s.spawnClock >= this.SPAWN_INTERVAL) {
            s.spawnClock %= this.SPAWN_INTERVAL;
            this.maybeSpawn(now);
        }

        this.announce();
    },

    /* The OS interrupts you. A SEV-1 opens a dialog nobody asked for.

       Same contract as announceCascade (cc11f22): the dialog reports whether
       it actually rendered, and the incident is only marked as announced on
       a true. Modals are open exactly when things turn over — release notes,
       the offline report, the Adversary scene — so a collision must be
       retried, not recorded as delivered. Called every attended tick; it
       returns at once when nothing is waiting. One dialog per call. */
    announce() {
        const waiting = this.state().open.find((inc) => inc.severity === 1 && !inc.alerted);
        if (!waiting) return false;
        if (ui.showIncidentAlert?.(this.view(waiting)) !== true) return false;
        waiting.alerted = true;
        // Cued only once the dialog has actually rendered, so retries are silent.
        this.cue('cascade', { tier: 3 });
        return true;
    },

    /* ── Resolution ───────────────────────────────────────────────────── */

    resolve(id, method, now = Date.now()) {
        const s = this.state();
        const inc = s.open.find((i) => i.id === id);
        if (!inc) return false;
        s.open = s.open.filter((i) => i !== inc);
        if (inc.prophet) this.returnProphet();
        s.stats.resolved += 1;
        if (method in s.stats) s.stats[method] += 1;
        if (method === 'sacrifice' && inc.severity === 1) s.stats.outagesSacrificed += 1;
        this.sync(now);

        const verbs = {
            labour: 'stabilised by hand',
            resources: 'paid off',
            debt: 'deferred. The penalty stays on this build',
            sacrifice: 'resolved by sacrifice',
            prophet: 'resolved by a Prophet on site',
        };
        ui.log(`[${inc.id}] ${verbs[method] || 'closed'}.`);
        this.cue(method === 'debt' ? 'error' : 'directive');
        ui.screenPulse?.(method === 'debt' ? 'rgba(212, 85, 58, 0.22)' : 'rgba(66, 144, 125, 0.28)');
        ui.onIncidentsChanged?.();
        return true;
    },

    /* An ignored false alarm closes itself at the moment it would have
       escalated, and its log is quarantined in the Recycle Bin. That file is
       the reward for reading the ticket: it can be sacrificed to resolve a
       real one later. */
    selfClose(inc, now = Date.now()) {
        const s = this.state();
        s.open = s.open.filter((i) => i !== inc);
        if (inc.prophet) this.returnProphet();
        s.stats.falseAlarmsCleared += 1;
        this.sync(now);
        ui.log(`[${inc.id}] Closed: no fault found. The reporting sensor has been quarantined.`);
        this.fileArtifact({
            key: `quarantine_${inc.id}`,
            name: `QUARANTINE_${inc.id}.log`,
            type: 'log',
            description: `A false alarm, quarantined. ${this.titleOf(inc)} — no fault found. Retained per policy.`,
        });
        ui.onIncidentsChanged?.();
        return true;
    },

    /* Seconds of production, bounded by fractions of the cap. See COST. */
    resourceCost(inc, now = Date.now()) {
        const tpl = this.template(inc?.template);
        if (!tpl) return null;
        const resource = tpl.pay;
        const isVoid = ['darkness', 'shadows', 'echoes'].includes(resource);
        const bag = isVoid ? State.dimensions.void.resources : State.resources;
        const caps = isVoid ? State.dimensions.void.resourceCaps : State.resourceCaps;
        const cap = Number(caps?.[resource]);
        if (!Number.isFinite(cap) || cap <= 0) return null;
        const [lo, hi, seconds] = this.COST[inc.severity] || this.COST[3];
        let rate = 0;
        try { rate = Math.max(0, Number(game.getProductionRates(now, false)[resource]) || 0); } catch { rate = 0; }
        const amount = Math.ceil(Math.min(hi * cap, Math.max(lo * cap, rate * seconds)));
        return { resource, amount, bag, cap, affordable: (bag?.[resource] || 0) >= amount };
    },

    payResources(id, now = Date.now()) {
        const inc = this.find(id);
        if (!inc) return false;
        const cost = this.resourceCost(inc, now);
        if (!cost || !cost.affordable) {
            ui.log(cost ? `Insufficient ${cost.resource} to pay off ${inc.id}. Need ${ui.formatNumber?.(cost.amount) ?? cost.amount}.`
                : `${inc.id} cannot be paid off.`);
            return false;
        }
        cost.bag[cost.resource] -= cost.amount;
        return this.resolve(id, 'resources', now);
    },

    defer(id, now = Date.now()) {
        const inc = this.find(id);
        if (!inc) return false;
        const s = this.state();
        if (s.debts.length >= this.MAX_DEBTS) {
            ui.log('The deferral register is full. This one has to be fixed.');
            return false;
        }
        s.debts.push({ id: inc.id, template: inc.template, severity: inc.severity });
        return this.resolve(id, 'debt', now);
    },

    /* ── Labour: the stabilisation ritual ─────────────────────────────────
       A marker sweeps a track; a band sits somewhere on it. Align while the
       marker is in the band. Hits needed scale with severity; a miss costs a
       hit. The judgment lives here, not in the DOM, so it is testable and the
       UI only draws what this says. Timing is wall-clock ms because the
       ritual is a thing you do with your hands, not a thing that accrues. */
    newBand(hits) {
        const width = Math.max(0.1, 0.24 - hits * 0.01);
        return { at: Math.max(0, Math.min(1 - width, this.random() * (1 - width))), width };
    },

    beginLabour(id, nowMs = Date.now()) {
        const inc = this.find(id);
        if (!inc) return null;
        if (!inc.labour) {
            inc.labour = { hits: 0, misses: 0, startedAt: nowMs, lastPulseAt: 0, band: this.newBand(0) };
        }
        return inc.labour;
    },

    labourNeed(inc) {
        return this.LABOUR_HITS[inc.severity] || this.LABOUR_HITS[3];
    },

    /* 0..1, ping-pong. */
    labourMarker(inc, nowMs = Date.now()) {
        if (!inc?.labour) return 0;
        const t = (((nowMs - inc.labour.startedAt) % this.LABOUR_PERIOD_MS) + this.LABOUR_PERIOD_MS)
            % this.LABOUR_PERIOD_MS / this.LABOUR_PERIOD_MS;
        return t < 0.5 ? t * 2 : 2 - t * 2;
    },

    labourPulse(id, nowMs = Date.now()) {
        const inc = this.find(id);
        if (!inc || !inc.labour) return { hit: false, done: false, ignored: true };
        const labour = inc.labour;
        if (nowMs - labour.lastPulseAt < this.LABOUR_COOLDOWN_MS) return { hit: false, done: false, ignored: true };
        labour.lastPulseAt = nowMs;

        const pos = this.labourMarker(inc, nowMs);
        const hit = pos >= labour.band.at && pos <= labour.band.at + labour.band.width;
        if (hit) {
            labour.hits += 1;
            labour.band = this.newBand(labour.hits);
        } else {
            labour.misses += 1;
            labour.hits = Math.max(0, labour.hits - 1);
        }
        if (!hit) this.cue('error');
        else if (labour.hits < this.labourNeed(inc)) this.cue('eventClaim', { chain: labour.hits });
        const done = labour.hits >= this.labourNeed(inc);
        if (done) this.resolve(id, 'labour', Date.now());
        return { hit, done, hits: labour.hits, need: this.labourNeed(inc) };
    },

    /* ── Sacrifice: the Recycle Bin finally has a use ─────────────────────
       Two things land in the Bin as incident artifacts: the superseded
       module of every known issue you patch, and the quarantined log of every
       false alarm you correctly ignored. Either can be fed to an open
       incident to close it instantly, at any severity.

       Deliberately NOT routed through createResourceSacrifice or the Bin's
       existing Sacrifice button. That path grants a permanent globalGain of
       `sacrificeValue` percent, priced at amount x rate — a resource
       sacrifice of 1e6 Praise would be a +100,000% permanent bonus. It has
       never been called, which is the only reason it has never been a bug.
       Artifacts carry no sacrificeValue, so that button never renders for
       them. */
    artifacts() {
        const items = Array.isArray(State.recycleBin?.items) ? State.recycleBin.items : [];
        return items.filter((item) => item && item.incidentArtifact === true && item.deletable !== false);
    },

    fileArtifact({ key, name, type, description }) {
        if (!State.recycleBin || !Array.isArray(State.recycleBin.items)) return null;
        if (this.artifacts().length >= this.ARTIFACT_QUOTA) {
            ui.log(`Recycle Bin quota reached. ${name} was not retained.`);
            return null;
        }
        const id = `artifact_${key}`;
        if (State.recycleBin.items.some((item) => item?.id === id)) return null;
        const item = { id, name, type, description, deletable: true, incidentArtifact: true };
        if (typeof game !== 'undefined' && game.addToRecycleBin) game.addToRecycleBin(item);
        else State.recycleBin.items.push(item);
        return item;
    },

    sacrifice(id, itemId = null, now = Date.now()) {
        const inc = this.find(id);
        if (!inc) return false;
        const pool = this.artifacts();
        const item = itemId ? pool.find((i) => i.id === itemId) : pool[0];
        if (!item) {
            ui.log('Nothing in the Recycle Bin is fit to sacrifice.');
            return false;
        }
        State.recycleBin.items = State.recycleBin.items.filter((i) => i !== item);
        ui.updateRecycleBinList?.();
        ui.log(`${item.name} sacrificed to ${inc.id}.`);
        return this.resolve(id, 'sacrifice', now);
    },

    /* ── Prophets: dispatch one to a SEV-3 (DESIGN_DIRECTION §4.3.4) ──────
       A Prophet on site stops the escalation clock and closes the ticket
       after PROPHET_SECONDS of attended time, then comes home. Only SEV-3:
       a Prophet is a pastoral visit, not an outage response. */
    canDispatchProphet(inc) {
        return !!inc && inc.severity === 3 && !inc.prophet && (State.prophets?.available || 0) >= 1;
    },

    dispatchProphet(id) {
        const inc = this.find(id);
        if (!this.canDispatchProphet(inc)) return false;
        State.prophets.available -= 1;
        inc.prophet = true;
        inc.prophetRemaining = this.PROPHET_SECONDS;
        ui.log(`[${inc.id}] A Prophet has been dispatched.`);
        ui.onIncidentsChanged?.();
        return true;
    },

    /* Bounded by the total, so a forged `prophet: true` cannot mint one. */
    returnProphet() {
        if (!State.prophets) return;
        const total = Number(State.prophets.total) || 0;
        State.prophets.available = Math.min(total, (Number(State.prophets.available) || 0) + 1);
    },

    /* ── Reboot ───────────────────────────────────────────────────────────
       Tickets and deferrals belong to the build that raised them. A new build
       starts with an empty queue; the lifetime counters and the onboarding
       clock carry over. */
    clearForReboot(now = Date.now()) {
        const s = this.state();
        for (const inc of s.open) if (inc.prophet) this.returnProphet();
        s.open = [];
        s.debts = [];
        s.spawnClock = 0;
        s.quietUntil = s.attendedSeconds + this.SPAWN_GAP;
        this.sync(now);
        ui.onIncidentsChanged?.();
    },

    /* ── What the UI draws ────────────────────────────────────────────── */

    titleOf(inc) {
        const tpl = this.template(inc.template);
        return tpl ? tpl.title.replace('{sector}', inc.sector) : inc.id;
    },

    describeMod(target, op, value) {
        const label = IncidentTargetLabels[target] || target;
        if (op === 'min') return `${label} capped at ${Math.round(value * 100)}%`;
        if (op === 'mul') {
            if (value === 0) return `${label} halted`;
            const pct = Math.round((value - 1) * 100);
            return `${label} ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`;
        }
        return label;
    },

    /* The CLAIMED effect — what the ticket says. For a false alarm this is a
       sensor's opinion and nothing is actually applied; the player who checks
       their rates can find that out. */
    claimedEffect(inc) {
        const tpl = this.template(inc.template);
        if (!tpl) return '';
        const line = IncidentLines[tpl.line];
        // When the effect IS the line, the halt replaces it rather than
        // stacking on it — effectMods does the same — so say only that.
        if (inc.severity === 1 && tpl.effect.target === line.target) return `${line.label} halted`;
        const sev = inc.severity === 1 ? 2 : inc.severity;
        const parts = [this.describeMod(tpl.effect.target, tpl.effect.op, tpl.effect[sev])];
        if (inc.severity === 1) parts.push(`${line.label} halted`);
        return parts.join(' · ');
    },

    debtText(inc) {
        const tpl = this.template(inc.template);
        if (!tpl) return '';
        return this.describeMod(tpl.debt.target, tpl.debt.op, this.debtValue(tpl.debt, inc.severity));
    },

    view(inc, now = Date.now()) {
        const tpl = this.template(inc.template);
        const cost = this.resourceCost(inc, now);
        const artifact = this.artifacts()[0] || null;
        return {
            id: inc.id,
            severity: inc.severity,
            title: this.titleOf(inc),
            process: tpl?.process || 'unknown.svc',
            sector: inc.sector,
            // The false-alarm flag is NOT exposed. `desc` is chosen by it, and
            // that is the only trace it leaves.
            desc: inc.falseAlarm ? tpl?.tell : tpl?.desc,
            effect: this.claimedEffect(inc),
            line: IncidentLines[tpl?.line]?.label || '',
            remaining: inc.remaining,
            nextSeverity: inc.severity > 1 ? inc.severity - 1 : null,
            labourVerb: tpl?.labour || 'Stabilise by hand',
            labour: inc.labour ? { hits: inc.labour.hits, need: this.labourNeed(inc), band: inc.labour.band } : null,
            cost: cost ? { resource: cost.resource, amount: cost.amount, affordable: cost.affordable } : null,
            debt: this.debtText(inc),
            prophet: inc.prophet ? { remaining: inc.prophetRemaining } : null,
            canProphet: this.canDispatchProphet(inc),
            artifact: artifact ? { id: artifact.id, name: artifact.name } : null,
        };
    },

    summary() {
        const open = this.state().open;
        return {
            open: open.length,
            worst: open.reduce((w, inc) => Math.min(w, inc.severity), 4),
            everFiled: this.state().stats.filed > 0,
        };
    },
};
