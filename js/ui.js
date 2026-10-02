const ui = {
    // Store previous values for animation
    previousValues: {
        praise: 0,
        offerings: 0,
        souls: 0
    },

    // Particle pool for click effects
    clickParticles: [],
    maxParticles: 50,
    coreImpact: 0,

    // Number formatting with notation support
    formatNumber(value, decimals = 0) {
        const mode = State.settings?.notationMode || 'suffix';

        if (mode === 'scientific') {
            if (value >= 1e6) {
                return value.toExponential(2);
            }
            return value.toFixed(decimals);
        }

        // Suffix mode (default)
        const suffixes = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
        let tier = 0;
        let scaledValue = value;

        while (scaledValue >= 1000 && tier < suffixes.length - 1) {
            scaledValue /= 1000;
            tier++;
        }

        if (tier === 0) {
            return scaledValue.toFixed(decimals);
        }

        return scaledValue.toFixed(decimals === 0 ? 1 : decimals) + suffixes[tier];
    },

    /* Two cadences.

       Only the canvases genuinely need 60Hz — and they specifically DO need
       it, because renderCoreView advances `view.pulse` per CALL and decays
       burst life per CALL. Throttling those would not stutter the animation,
       it would run it proportionally slower.

       Everything else is text that changes a few times a second at most.
       Panels run at ~10Hz, which is still far faster than a player can read.

       PANEL_INTERVAL is the single throttle. updateOperatorStatus used to
       carry its own internal 100ms gate; two independent throttles at the
       same period beat against each other and drop updates, so that one was
       removed when this landed. */
    PANEL_INTERVAL: 100,

    update(now = Date.now(), force = false) {
        this.animateCore();
        this.animateVoidCore();
        // The stabilisation needle is the one other thing that must move at
        // frame rate; it returns at once when no ritual is in progress.
        this.animateIncidentLabour();

        if (!force && now - (this.lastPanelRefresh || 0) < this.PANEL_INTERVAL) return;
        this.lastPanelRefresh = now;

        this.syncResources();
        this.applyDesktopPlate();
        this.applyPostGameMark();
        this.renderAutomatons();
        this.renderRepeatables();
        this.renderRealityPanel();
        this.updateSkillButtons();
        this.updateLoopPanels();
        this.updateDimensionDisplay();
        this.updateOperatorStatus();
        this.updateIncidentChrome();
        /* The Divine Settings readout was only ever rendered by that window's
           onOpen, so the award and the stability line sat frozen at whatever
           they were when it was opened — for a panel whose entire job is
           showing a decision that moves. Cheap: it returns immediately when
           the elements are not in the document. */
        this.updatePrestigeInfo();
        // The ship dialog quotes terms that move underneath it. See
        // refreshShipDialog — it returns immediately when the dialog is closed.
        this.refreshShipDialog();
    },

    /* Synchronous full redraw, for callers that change how everything is
       formatted and cannot wait for the next panel tick. */
    refreshAll() {
        this.update(Date.now(), true);
    },

    /* The desktop reflects the state of the universe you are maintaining:
       the primordial grid while Sector 7G is broken, the breach once you are
       working the Void, and a whole cosmos again after a reboot. Runs on the
       tick, so it only touches the DOM when the plate actually changes. */
    desktopPlates: { primordial: 'primordial', void: 'void', restored: 'restored' },

    applyDesktopPlate() {
        const desktop = document.getElementById('desktop');
        if (!desktop) return;

        let plate = this.desktopPlates[State.currentDimension] || 'primordial';
        if (State.currentDimension !== 'void' && State.prestigeLevel > 0) {
            plate = 'restored';
        }

        if (this.activeDesktopPlate === plate) return;
        this.activeDesktopPlate = plate;
        desktop.style.backgroundImage = `url('assets/backgrounds/desktop_${plate}.webp')`;
    },

    getNextMilestone() {
        const progressDetail = (current, target, resource) => current >= target
            ? `READY — ${this.formatNumber(target)} ${resource}`
            : `${this.formatNumber(current)} / ${this.formatNumber(target)} ${resource}`;

        if (State.automatons.seraphCount === 0) {
            return {
                label: 'Commission first Seraph',
                detail: progressDetail(State.resources.praise, 10, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 10)
            };
        }
        if (!State.upgrades.praise_multi_1) {
            return {
                label: 'Install Divine Words (+100% output)',
                detail: progressDetail(State.resources.praise, 50, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 50)
            };
        }
        if (!State.upgrades.storage_praise_1) {
            return {
                label: 'Expand Praise storage',
                detail: progressDetail(State.resources.praise, 500, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 500)
            };
        }
        if (!State.unlockedOfferings) {
            return {
                label: 'Unlock Ritualistic Procedures',
                detail: progressDetail(State.resources.praise, 2000, 'Praise'),
                ratio: Math.min(1, State.resources.praise / 2000)
            };
        }
        if (!State.dimensions.void.unlocked) {
            return {
                label: 'Breach the Veil',
                detail: progressDetail(State.resources.souls, 200, 'Souls'),
                ratio: Math.min(1, State.resources.souls / 200)
            };
        }
        return {
            label: 'Stabilize parallel dimensions',
            detail: 'Follow the active Divine Directive',
            ratio: 0
        };
    },

    updateOperatorStatus() {
        // Throttled by ui.update()'s panel cadence; see PANEL_INTERVAL.
        const objectiveEl = document.getElementById('operator-objective');
        if (!objectiveEl) return;

        const directive = State.loopSystems?.directives?.active;
        const progress = directive && typeof game !== 'undefined'
            ? game.getDirectiveProgress(directive)
            : { current: 0, target: 1, ratio: 0, completed: false };
        const fillEl = document.getElementById('operator-progress-fill');
        const progressEl = document.getElementById('operator-progress-text');
        const milestoneEl = document.getElementById('operator-next-milestone');
        const sectorEl = document.getElementById('operator-sector-status');

        objectiveEl.innerText = directive?.title || 'Awaiting divine telemetry…';
        objectiveEl.classList.toggle('complete', !!progress.completed);
        if (fillEl) fillEl.style.width = `${Math.round((progress.ratio || 0) * 100)}%`;
        if (progressEl) {
            progressEl.innerText = progress.completed
                ? `${this.formatNumber(progress.current)} / ${this.formatNumber(progress.target)} — REWARD READY`
                : `${this.formatNumber(progress.current)} / ${this.formatNumber(progress.target)}`;
        }

        const milestone = this.getNextMilestone();
        if (milestoneEl) {
            milestoneEl.innerHTML = `<strong>${milestone.label}</strong><span>${milestone.detail}</span>`;
        }
        if (sectorEl) {
            sectorEl.innerText = State.dimensions.void.unlocked ? 'SECTOR 7G: CONTAINED' : 'SECTOR 7G: UNSTABLE';
        }
    },

    showOperatorBriefing(force = false) {
        if (!force && State.settings.briefingSeen) return;
        system.toggleStartMenu(false);

        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;

        layer.innerHTML = `
            <section class="system-dialog operator-briefing" role="dialog" aria-modal="true" aria-labelledby="briefing-title">
                <div class="system-dialog-titlebar">
                    <span>CMS INTRANET // SHIFT ASSIGNMENT</span>
                    <button type="button" onclick="ui.dismissSystemModal(true)" aria-label="Close briefing">X</button>
                </div>
                <div class="briefing-hero">
                    <div class="briefing-seal">7G</div>
                    <div>
                        <div class="briefing-eyebrow">WELCOME, SUCCESSOR</div>
                        <h1 id="briefing-title">Reality failed its overnight integrity check.</h1>
                        <p>The previous Operator left no forwarding address. Until HR resolves the matter, the universe is your maintenance ticket.</p>
                    </div>
                </div>
                <div class="briefing-order">
                    <span>WORK ORDER 0001</span>
                    <strong>Restore autonomous Praise generation.</strong>
                    <ol>
                        <li>Perform 10 Miracles to calibrate the interface.</li>
                        <li>Spend 10 Praise to commission your first Seraph.</li>
                        <li>Let automation run. Intervene when it is interesting.</li>
                    </ol>
                </div>
                <div class="briefing-controls">
                    <span><kbd>Space</kbd> Miracle</span>
                    <span><kbd>C</kbd> Engine</span>
                    <span><kbd>Esc</kbd> Close window</span>
                    <span><kbd>F</kbd> Fullscreen</span>
                </div>
                <div class="system-dialog-actions">
                    <button class="dialog-secondary" type="button" onclick="ui.dismissSystemModal(true)">Acknowledge</button>
                    <button class="dialog-primary" type="button" onclick="ui.beginOperatorShift()">Begin repairs</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
    },

    beginOperatorShift() {
        State.settings.briefingSeen = true;
        State.save();
        this.dismissSystemModal();
        system.openApp('console');
        this.log('[SHIFT 0001] Miracle interface calibration authorized.');
    },

    dismissSystemModal(markBriefingSeen = false) {
        const layer = document.getElementById('system-modal-layer');
        if (markBriefingSeen) {
            State.settings.briefingSeen = true;
            State.save();
        }
        /* Defensive teardown. Clearing the layer without clearing advScene
           would leave isAdversarySceneOpen() true over an empty layer, and
           system.js routes EVERY keypress into the scene while that is so —
           a dead keyboard with no way back. finishAdversaryScene captures its
           own `s` and clears the timer before calling this, so it is safe. */
        if (this.advScene) {
            clearTimeout(this.advScene.timer);
            this.disarmAdversaryListeners();
            this.advScene.open = false;
            this.advScene = null;
        }
        if (layer) {
            layer.classList.remove('active');
            layer.innerHTML = '';
        }
    },

    showOfflineReport(report) {
        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;

        const gained = Object.entries(report.gained)
            .filter(([, value]) => value >= 0.01)
            .map(([resource, value]) => `<li><span>${resource}</span><strong>+${this.formatNumber(value, 1)}</strong></li>`)
            .join('');
        const elapsedMinutes = Math.floor(report.elapsedSeconds / 60);
        const simulatedHours = (report.simulatedSeconds / 3600).toFixed(1);
        const efficiencyPct = Math.round((report.efficiency ?? 1) * 100);

        // Storage overflow is the actionable number: it is the difference
        // between how long you were away and how long you were productive.
        const spilled = Object.entries(report.overflow || {})
            .filter(([, value]) => value >= 1)
            .map(([resource, value]) => `${this.formatNumber(value, 1)} ${resource}`);
        const overflowNotice = spilled.length
            ? `<p class="offline-overflow">Storage overflowed and discarded <strong>${spilled.join(', ')}</strong>. Expand your vaults under Standing Requisitions before the next shift.</p>`
            : '';

        /* Held tickets are the other thing a returning player needs to know:
           that nothing happened to them, and that the clocks start again
           when they do. See ABSENCE IS NEVER PUNISHED in js/incidents.js. */
        const held = this.incidentsAvailable?.() ? Incidents.state().open.length : 0;
        const heldNotice = held
            ? `<p class="offline-held"><span class="code-stamp">ON HOLD</span> ${held} incident ticket${held === 1 ? ' was' : 's were'} held while you were away: no penalty, no escalation. Clocks resume when you do, with at least ${Incidents.RETURN_GRACE}s each.</p>`
            : '';

        layer.innerHTML = `
            <section class="system-dialog offline-report" role="dialog" aria-modal="true" aria-labelledby="offline-title">
                <div class="system-dialog-titlebar">
                    <span>BACKGROUND PROCESS REPORT</span>
                    <button type="button" onclick="ui.closeOfflineReport()" aria-label="Close report">X</button>
                </div>
                <div class="offline-report-body">
                    <div class="offline-report-icon">☼</div>
                    <div>
                        <div class="briefing-eyebrow">AUTOMATION CONTINUED</div>
                        <h2 id="offline-title">The universe kept running.</h2>
                        <p>Your processes operated for ${this.formatNumber(elapsedMinutes)} minutes while the console was closed, at ${efficiencyPct}% of attended output.${report.capped ? ` Accrual was capped at ${simulatedHours} hours — the Providence Capacitor extends that window.` : ''}</p>
                        ${overflowNotice}
                        ${heldNotice}
                    </div>
                </div>
                <ul class="offline-gains">${gained || '<li><span>No active production</span><strong>—</strong></li>'}</ul>
                <div class="system-dialog-actions">
                    <button class="dialog-primary" type="button" onclick="ui.closeOfflineReport()">Resume shift</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
    },

    /* ── Release notes ────────────────────────────────────────────────────
       The moment a run's character is revealed. Deliberately styled as a
       release note rather than a buff list, because the mechanic and the
       fiction are the same object here. */
    releaseMarks: { improvement: '+', issue: '\u2715', regression: '!', deprecation: '\u2298' },

    /* Content goes into innerHTML in a dozen places here, and one changelog
       note is written the way a person writes:

           'Anomaly detection muted by a previous Operator. Note left: "too
            noisy".'

       Interpolated raw into `title="${entry.note}"`, those quotes closed the
       attribute early. The tooltip was truncated at 'Note left: ' \u2014 the
       punchline cut off \u2014 and the parser turned the remainder into two stray
       attributes on the button, `too` and `noisy".`.

       Nothing here is player-authored, so this is a correctness and
       typography problem rather than an injection one. It becomes an
       injection problem the moment any content string is, so escaping is the
       cheaper habit. */
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    showReleaseNotes(build) {
        const layer = document.getElementById('system-modal-layer');
        if (!layer || !build) return;
        /* The V2 reel plays between the ship confirm and these notes. While a
           cinematic holds the slot the notes wait for it — with no reel
           installed nothing holds it and this returns false at once. */
        if (typeof media !== 'undefined' && media.deferUntilClear?.(() => this.showReleaseNotes(build))) return;

        // NULL.OPERATOR as the source of regressions, when you believe he is.
        const attribution = game.regressionAttribution?.() || null;
        const lines = (build.entries || []).map((entry) => {
            const mark = this.releaseMarks[entry.kind] || '-';
            const sev = entry.severity ? ` <span class="rn-sev">SEV-${entry.severity}</span>` : '';
            const signed = attribution && entry.kind === 'regression'
                ? ` <span class="rn-attrib">${this.escapeHtml(attribution)}</span>` : '';
            return `<li class="rn-line rn-${entry.kind}">
                <span class="rn-mark">${mark}</span>
                <span class="rn-note">${this.escapeHtml(entry.note)}${sev}${signed}</span>
            </li>`;
        }).join('');

        const channel = RealityChannels[build.channel]?.label || build.channel;
        const archived = build.channel === 'archived' ? this.archivedNotesParts(build) : null;

        layer.innerHTML = `
            <section class="system-dialog release-notes${archived ? ' is-archived' : ''}" role="dialog" aria-modal="true" aria-labelledby="rn-title">
                <div class="system-dialog-titlebar">
                    <span>REALITY — RELEASE NOTES${archived ? ' (ARCHIVED)' : ''}</span>
                    <button type="button" onclick="ui.closeReleaseNotes()" aria-label="Close release notes">X</button>
                </div>
                <div class="rn-head">
                    <div>
                        <div class="briefing-eyebrow">${this.escapeHtml(channel)} channel${archived ? ` &middot; replay of ${this.escapeHtml(archived.source)}` : ''}</div>
                        <h2 id="rn-title">COSMOS — REALITY v${this.escapeHtml(build.version)}</h2>
                        <p class="rn-meta">${archived
                            ? `Restored from the archive &middot; first shipped at reboot ${archived.level} &middot; pays no Divinity`
                            : 'Released to Sector 7G &middot; Operator: you &middot; Rollback: unavailable'}</p>
                    </div>
                </div>
                ${archived ? archived.stamp : ''}
                <ul class="rn-list">${lines || '<li class="rn-line"><span class="rn-mark">-</span><span class="rn-note">No changes recorded. Suspicious.</span></li>'}</ul>
                <p class="rn-foot">${archived
                    ? archived.foot
                    : 'Known issues can be patched from the Universal Engine, or routed around. Your call.'}</p>
                <div class="system-dialog-actions">
                    <button class="dialog-primary" type="button" onclick="ui.closeReleaseNotes()">Accept this reality</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
    },

    /* The parts of the release notes that change on a replay. The changelog
       itself is unchanged — it IS the original's, entry for entry, which is
       the point — so what changes is the frame around it: where it came from,
       that it pays nothing, and what NULL.OPERATOR left on it. */
    archivedNotesParts(build) {
        const source = Reality.sanitiseReplayOf(build.replayOf) || { level: 0, source: 'stable' };
        const annotation = (State.reality?.annotations || []).find((a) => a.level === source.level);
        const freshly = annotation && annotation.filedOn === (State.prestigeLevel || 0);
        const count = annotation ? annotation.ids.length : 0;
        let stamp;
        if (freshly) {
            stamp = `<div class="rn-archive-stamp">
                    <span class="code-stamp is-alarm">Annotated by NULL.OPERATOR</span>
                    <p>${count
                        ? `${count} annotation${count === 1 ? '' : 's'} on what this build shipped with`
                        : 'A file on a build that shipped clean'} &mdash; filed to Recovered Documents &rsaquo; Archive.</p>
                </div>`;
        } else if (annotation) {
            stamp = `<div class="rn-archive-stamp is-filed">
                    <span class="code-stamp">Already on file</span>
                    <p>His annotations on this build were filed at reboot ${annotation.filedOn}. This replay adds nothing new to read.</p>
                </div>`;
        } else {
            stamp = '';
        }
        return {
            source: RealityChannels[source.source]?.label || source.source,
            level: source.level,
            stamp,
            foot: 'An archived replay pays no Divinity, and the reboot bar does not move. Its known issues still degrade the build, and still scar if you ship them unpatched.',
        };
    },

    closeReleaseNotes() {
        this.dismissSystemModal();
        this.renderRealityPanel();
    },

    /* ── Shipping ─────────────────────────────────────────────────────────
       The reboot used to be a browser confirm() listing what it would reset.
       It is a release now, and a release has terms: what it pays, what it
       costs, which known issues go on the permanent record, and which Mandate
       path the next run runs on.

       The path is the load-bearing half and it has NO DEFAULT. Shipping stays
       disabled until one is picked, because the alternative is a player
       clicking through a dialog they have seen twenty times and discovering
       three hours later that their tree is dormant. That is the same reasoning
       as the Adversary scene's arming guard, arrived at by a cheaper route:
       there, the choice was hidden inside a click-to-continue rhythm and had
       to be defended against the rhythm; here the choice IS the button's
       precondition, so a reflex click cannot resolve it. */
    shipSelection: null,

    openShipDialog() {
        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;
        if (!game.canPrestige()) {
            this.log('This build has not earned a release yet. More Souls this run.');
            return;
        }
        this.shipSelection = game.certification().path;
        this.renderShipDialog();
        layer.classList.add('active');
    },

    renderShipDialog() {
        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;

        const build = State.reality?.build;
        const cascade = game.cascadeState();
        const award = game.getPrestigeAward();
        const residue = Math.round(Economy.certificationResidue * 100);
        const dirty = Reality.unpatchedIssues(build);
        const scars = State.reality?.scars || [];
        const fresh = dirty.filter((e) => !scars.includes(e.id));

        const paths = game.CERT_BRANCHES.map((branch) => {
            const s = game.branchStanding(branch);
            const selected = this.shipSelection === branch;
            const note = s.owned === 0
                ? 'nothing enacted yet'
                : `${s.owned} enacted &middot; ${s.spent} DP invested`;
            return `<button type="button"
                        class="ship-path${selected ? ' is-selected' : ''}"
                        aria-pressed="${selected ? 'true' : 'false'}"
                        onclick="ui.selectShipPath('${branch}')">
                    <span class="ship-path-name">Path of ${branch}</span>
                    <span class="ship-path-note">${note}</span>
                    <span class="ship-path-status">${s.status === 'certified' ? 'current' : s.status === 'residue' ? `lapsed — ${residue}%` : 'never certified'}</span>
                </button>`;
        }).join('');

        const scarBlock = fresh.length
            ? `<div class="ship-scars">
                   <span class="code-stamp is-alarm">${fresh.length} known issue${fresh.length === 1 ? '' : 's'} unpatched</span>
                   <p>Shipping files ${fresh.length === 1 ? 'it' : 'them'} permanently. Each keeps
                      ${Math.round(Economy.scarResidue * 100)}% of its bite, on every run from now on.</p>
                   <ul>${fresh.map((e) => `<li>SEV-${e.severity || 3} — ${this.escapeHtml(e.note.split('.')[0])}.</li>`).join('')}</ul>
               </div>`
            : '<p class="ship-clean">No unpatched known issues. This release goes out clean.</p>';

        const cascadeBlock = this.shipCascadeBlock(cascade);
        const replaying = build?.channel === 'archived';
        const blocked = this.shipBlockedBy();

        layer.innerHTML = `
            <section class="system-dialog ship-dialog" role="dialog" aria-modal="true" aria-labelledby="ship-title">
                <div class="system-dialog-titlebar">
                    <span>SHIP BUILD</span>
                    <button type="button" onclick="ui.closeShipDialog()" aria-label="Cancel release">X</button>
                </div>
                <div class="ship-head">
                    <h2 id="ship-title">Release v${this.escapeHtml(build?.version || '?')}</h2>
                    <p class="rn-meta">${RealityChannels[build?.channel]?.label || 'Stable'} channel &middot;
                        ${replaying
                            ? 'an archived replay &mdash; pays <strong id="ship-award">no</strong> Divinity, and ships anyway'
                            : `pays <strong id="ship-award">${this.formatNumber(award)}</strong> Divinity`}</p>
                </div>
                <div id="ship-cascade-slot">${cascadeBlock}</div>
                ${scarBlock}
                ${this.shipChannelBlock()}
                <div class="ship-cert">
                    <span class="briefing-eyebrow">Certify the next run on</span>
                    <div class="ship-paths">${paths}</div>
                </div>
                <div class="system-dialog-actions">
                    <button class="win-btn" type="button" onclick="ui.closeShipDialog()">Keep running</button>
                    <button class="dialog-primary" type="button" id="ship-confirm"
                            ${blocked ? 'disabled' : ''}
                            onclick="ui.confirmShip()">
                        ${blocked || `Ship on ${this.shipSelection}`}
                    </button>
                </div>
            </section>
        `;
    },

    /* What is stopping the ship button, as its label, or null. Both choices
       that shape the next run have NO DEFAULT: the path (see shipSelection)
       and, on Archived, which past build. A player who left the selector on
       Archived from last time is stopped here rather than silently replaying
       a universe for nothing. */
    shipBlockedBy() {
        if (!game.CERT_BRANCHES.includes(this.shipSelection)) return 'Choose a path';
        if (State.reality?.channel === 'archived' && !game.archivedPick()) return 'Choose an archived build';
        return null;
    },

    /* Where the next build comes from. Shown once there is more than one
       channel to choose, so the first reboots' dialog is unchanged. Archived
       appears only once unlocked (reboot 12), and opens a release history to
       pick from. */
    shipChannelBlock() {
        const available = Reality.channelsFor(State.prestigeLevel || 0);
        if (available.length < 2) return '';
        const current = State.reality?.channel || 'stable';
        const builds = game.archivedBuilds();

        const channels = available.map((key) => {
            const spec = RealityChannels[key];
            const selected = current === key;
            const empty = key === 'archived' && !builds.length;
            const terms = key === 'archived'
                ? (empty ? 'no builds on file yet' : 'no Divinity &middot; his annotations')
                : `${spec.divinity}&times; Divinity`;
            return `<button type="button"
                        class="ship-channel${selected ? ' is-selected' : ''}"
                        aria-pressed="${selected ? 'true' : 'false'}"
                        ${empty ? 'disabled' : ''}
                        onclick="ui.selectShipChannel('${key}')">
                    <span class="ship-channel-name">${spec.label}</span>
                    <span class="ship-channel-terms">${terms}</span>
                </button>`;
        }).join('');

        const history = current === 'archived' && builds.length
            ? this.archiveHistoryBlock(builds)
            : '';

        return `<div class="ship-next">
                <span class="briefing-eyebrow">Pull the next build from</span>
                <div class="ship-channels" role="group" aria-label="Release channel">${channels}</div>
                ${history}
            </div>`;
    },

    /* The release history, typeset as one: version, channel, path, reboot,
       and what it shipped with. Every field reaching this markup came through
       Reality.normaliseRecord, and is escaped anyway. */
    archiveHistoryBlock(builds) {
        const pick = State.reality?.replay;
        const rows = builds.map((r) => {
            const selected = pick === r.reboot;
            const version = Reality.versionOfLevel(r.level);
            const dirty = r.unpatched.length;
            const annotated = game.isAnnotated(r.level);
            const when = Number.isFinite(r.shippedAt) && r.shippedAt > 0
                ? new Date(r.shippedAt).toISOString().slice(0, 10)
                : '';
            return `<button type="button" role="radio"
                        class="archive-row${selected ? ' is-selected' : ''}${annotated ? ' is-annotated' : ''}"
                        aria-checked="${selected ? 'true' : 'false'}"
                        onclick="ui.selectArchivedBuild(${r.reboot})">
                    <span class="archive-version">v${this.escapeHtml(version)}</span>
                    <span class="archive-channel">${this.escapeHtml(RealityChannels[r.source]?.label || r.source)}</span>
                    <span class="archive-meta">reboot ${r.reboot}${r.certified ? ` &middot; ${this.escapeHtml(r.certified)}` : ''}</span>
                    <span class="archive-dirty${dirty ? ' is-dirty' : ''}">${dirty
                        ? `${dirty} issue${dirty === 1 ? '' : 's'} shipped unpatched`
                        : 'shipped clean'}</span>
                    <span class="archive-when">${when}</span>
                    <span class="archive-note">${annotated ? 'annotations on file' : 'his notes unread'}</span>
                </button>`;
        }).join('');
        return `<div class="ship-archive">
                <div class="archive-head" aria-hidden="true">
                    <span>Release</span><span>Channel</span><span>Shipped</span><span>Known issues</span>
                </div>
                <div class="archive-list" role="radiogroup" aria-label="Archived builds">${rows}</div>
            </div>`;
    },

    selectShipChannel(channel) {
        if (!Reality.channelsFor(State.prestigeLevel || 0).includes(channel)) return;
        if (channel === 'archived' && !game.archivedBuilds().length) return;
        game.setBuildChannel(channel);
        this.renderShipDialog();
    },

    selectArchivedBuild(reboot) {
        if (!game.selectArchivedBuild(reboot)) return;
        this.renderShipDialog();
    },

    shipCascadeBlock(cascade) {
        if (cascade.tier <= 0) return '';
        return `<div class="ship-cascade tier-${cascade.tier}">
                   <span class="code-stamp is-alarm">${cascade.label}</span>
                   <p>${cascade.award > 0
                        ? `The award is reduced to ${Math.round(cascade.award * 100)}% while the build is degraded.`
                        : 'A collapsed build pays nothing. You can still ship it — patch the outstanding issues first if you want to be paid for this run.'}</p>
               </div>`;
    },

    /* The dialog states the TERMS of a release, and the terms move while it is
       open: instability keeps accruing in the tick underneath, and confirmShip
       pays game.getPrestigeAward() evaluated fresh.

       Rendered once at open, it could therefore quote a number it would not
       pay. Reproduced: a run one tick below CASCADE FAILURE, dialog open,
       reading "pays 6 Divinity — reduced to 40%"; twelve minutes of
       deliberation later it still said exactly that and shipping banked ZERO.
       It bites at every boundary and in both directions — a clean run's quote
       goes stale LOW as Souls accrue.

       Worse, this is the one place a tier change is guaranteed to be
       invisible: showCascadeAlert refuses to paint over an open modal (it
       must), and the scrim covers every live readout underneath. The dialog
       has to tell the player itself.

       Only the award and the cascade block are volatile — the unpatched-issue
       list cannot change while the scrim covers the Universal Engine — so
       this updates those two in place rather than re-rendering, which would
       fight the player's path selection on every panel tick.

       This is the same defect the Divine Settings readout had, one surface
       over, and it is noted in ui.update()'s comment. Adding a panel that
       shows a moving decision means adding it to the tick. */
    refreshShipDialog() {
        const layer = document.getElementById('system-modal-layer');
        if (!layer || !layer.classList.contains('active')) return;
        if (!document.querySelector('.ship-dialog')) return;

        const awardEl = document.getElementById('ship-award');
        // An archived replay's award is not a number that moves: it is "no".
        if (awardEl && State.reality?.build?.channel !== 'archived') {
            const award = this.formatNumber(game.getPrestigeAward());
            if (awardEl.innerText !== award) awardEl.innerText = award;
        }

        const slot = document.getElementById('ship-cascade-slot');
        if (slot) {
            const block = this.shipCascadeBlock(game.cascadeState());
            if (slot.innerHTML !== block) slot.innerHTML = block;
        }
    },

    selectShipPath(branch) {
        if (!game.CERT_BRANCHES.includes(branch)) return;
        this.shipSelection = branch;
        this.renderShipDialog();
    },

    closeShipDialog() {
        this.shipSelection = null;
        this.dismissSystemModal();
    },

    /* The only path from the dialog into the reboot. performPrestige remains
       callable without options — the simulator and four test harnesses do
       exactly that — but everything a player can click routes through here,
       so the certification choice cannot be skipped by a UI that forgot it. */
    confirmShip() {
        const path = this.shipSelection;
        if (!game.CERT_BRANCHES.includes(path)) return;
        // The button's own guard, restated: the button can be stale.
        if (State.reality?.channel === 'archived' && !game.archivedPick()) return;
        this.dismissSystemModal();
        this.shipSelection = null;
        game.sfx('ship');
        // V2 Ship the Build. Claimed before the reboot so the release notes
        // it raises queue behind the reel instead of under it.
        game.cinematic('ship-the-build');
        game.performPrestige({ confirmed: true, certifyOn: path });
    },

    /* The OS opening a window you did not ask for. DESIGN_DIRECTION §5.3 —
       a cursed operating system that notices a cascade and says nothing is
       just a number going down. Suppressed while another modal is up so it
       cannot paint over the release notes it would otherwise interrupt. */
    showCascadeAlert(cascade) {
        const layer = document.getElementById('system-modal-layer');
        // Returns whether it actually rendered. game.announceCascade only
        // marks the tier as announced on a true, and retries otherwise — a
        // warning suppressed by a modal collision must not be lost.
        if (!layer || layer.classList.contains('active')) return false;

        layer.innerHTML = `
            <section class="system-dialog cascade-alert tier-${cascade.tier}" role="alertdialog" aria-modal="true" aria-labelledby="cascade-title">
                <div class="system-dialog-titlebar">
                    <span>SYSTEM &mdash; UNSOLICITED</span>
                    <button type="button" onclick="ui.dismissSystemModal()" aria-label="Acknowledge">X</button>
                </div>
                <div class="cascade-body">
                    <span class="code-stamp is-alarm">${cascade.label}</span>
                    <h2 id="cascade-title">Reality is degrading.</h2>
                    <p>Unpatched known issues have been accruing since this build shipped.
                       Output is throttled to ${Math.round(cascade.output * 100)}% and the release
                       ${cascade.award > 0 ? `now pays ${Math.round(cascade.award * 100)}% of its award` : 'now pays nothing'}.</p>
                    <p class="cascade-advice">${cascade.tier >= Economy.cascadeTiers.length
                        ? 'Patch the outstanding issues from the Universal Engine. A build with nothing left on file settles on its own.'
                        : 'Patch them from the Universal Engine, or ship now and take what this run is still worth.'}</p>
                </div>
                <div class="system-dialog-actions">
                    <button class="dialog-primary" type="button" onclick="ui.dismissSystemModal()">Acknowledged</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
        game.sfx('cascade', { tier: cascade.tier });
        // V3: the tier's loop in a monitor strip, when installed. Never awaited.
        if (typeof media !== 'undefined') {
            media.attachLoop?.(layer.querySelector('.cascade-body'), `cascade-tier${Math.max(1, Math.min(3, cascade.tier))}`);
        }
        return true;
    },

    /* ════════════════════════════════════════════════════════════════════
       SCN-ADV-001 — "Mirror Login Incident"

       Presented in two phases, because ADV-001 through ADV-009 are not
       dialogue — they are a login box. Rendering "Username:" and "…" as rows
       in a chat log throws away the best prop this game will ever have: a
       login dialog that authenticates you as someone else, three times,
       without you typing anything.

       Phase 1 IS that dialog. Phase 2 is the same <section> degrading into a
       transcript once the thing on the other side starts talking. The
       degradation from a form you cannot fill into a conversation you did not
       start is the scene.

       Every authored line is PRESENTED, but phase 1 presents four of them as
       chrome rather than as text: ADV-003 "Username:" and ADV-004 "Password:"
       become the two field labels, ADV-005 "…" is the settled password field,
       and their content is the beat rather than the string. Phase 2 renders
       its lines verbatim.
       ════════════════════════════════════════════════════════════════════ */

    advScene: null,

    isSystemModalOpen() {
        const layer = document.getElementById('system-modal-layer');
        return !!(layer && layer.classList.contains('active'));
    },

    isAdversarySceneOpen() {
        return !!(this.advScene && this.advScene.open);
    },

    advSpeed() {
        // The e2e harness and the vm tests must not wait on 40 seconds of
        // theatre. Everything scales off this one number.
        try {
            if (new URLSearchParams(window.location.search).has('testMode')) return 0;
        } catch (err) { /* no window (headless) — fall through */ }
        return 1;
    },

    /* The beat list, resolved against the player's choice and any showIf. */
    buildAdversaryBeats(choiceId) {
        const out = [];
        for (const line of AdversaryScene.dialogue) {
            if (typeof line.showIf === 'function') {
                let ok = false;
                try { ok = !!line.showIf(); } catch (err) { ok = false; }
                if (!ok) continue;
            }
            // ADV-023A/B/C are the branch replies; only the taken one plays.
            if (line.condition && line.condition !== choiceId) continue;
            out.push(line);
        }
        return out;
    },

    advText(line) {
        const reboots = State.achievementProgress?.prestige_count || 0;
        return String(line.text || '').replace('{REBOOTS}', reboots);
    },

    playAdversaryScene() {
        /* V4 Mirror Login opens the scene when installed. Claimed first so the
           scene queues behind the reel (the V2 pattern in showReleaseNotes),
           and only once per page so a re-presentation, or Cinematics set to
           Always, cannot loop reel -> scene -> reel. With no reel installed
           the director resolves at once and the scene opens as it always did. */
        if (!this.mirrorReelClaimed && typeof media !== 'undefined') {
            this.mirrorReelClaimed = true;
            game.cinematic('mirror-login');
            /* The deferred call presents only if nobody has presented the scene
               since this claim. game.checkAdversaryTrigger's resume branch polls
               once a second and may present it while the probe is out — and
               the director holds deferred calls until the modal slot clears,
               which for a presented scene is AFTER the player finishes it.
               "Not open right now" would re-run a finished scene. */
            const claim = this.advPresentations || 0;
            if (media.deferUntilClear?.(() => {
                if ((this.advPresentations || 0) === claim && !this.isAdversarySceneOpen()) this.playAdversaryScene();
            })) return;
        }

        /* Test exhaustion BEFORE spending the attempt. Incrementing first made
           the third presentation short-circuit, so the budget was really two
           renders while both comments said three. */
        if (game.adversarySceneExhausted() && !State.adversary.sceneCompleted) {
            /* Three presentations that never got past the login sequence: the
               renderer is broken on this machine. Resolve headlessly rather
               than trap the player behind a modal that cannot draw itself.

               Resolved as OP-B, not OP-A. Walking out of a choice you SAW is
               fairly read as denial — that is escapeAdversaryScene's contract.
               Assigning the hostile extreme to someone who was never shown the
               buttons is not, so the neutral band is the honest default. */
            game.resolveAdversaryChoice('OP-B');
            this.log('[void_mirror] Session conflict closed without operator input.');
            this.log('[SYSTEM] Ticket auto-filed: HR-VOID-7781 "Unauthorized self-encounter."');
            return;
        }

        /* Count HERE, not in the trigger. The trigger fires once ever, so
           counting there would freeze this at 1 and the exhaustion guard could
           never trip — a scene that throws on render would reappear on every
           boot forever. Every presentation path runs through this function.
           advEnterPhaseTwo refunds it once the renderer has proved itself. */
        State.adversary.sceneAttempts = (State.adversary.sceneAttempts || 0) + 1;
        State.save();

        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;
        this.advPresentations = (this.advPresentations || 0) + 1;

        this.advScene = { open: true, phase: 1, index: 0, choiceId: null, escapeArmed: false, timer: null };

        layer.innerHTML = `
            <section class="system-dialog adversary-scene adv-phase-login" role="dialog" aria-modal="true"
                     aria-labelledby="adv-title" onclick="ui.advanceAdversaryScene()">
                <div class="system-dialog-titlebar" id="adv-titlebar">
                    <span id="adv-title">COSMOS &mdash; OPERATOR AUTHENTICATION</span>
                </div>
                <div class="adv-body" id="adv-body">
                    <div class="adv-login">
                        <p class="adv-notice" id="adv-notice"></p>
                        <div class="adv-field">
                            <label for="adv-user">Username</label>
                            <input id="adv-user" type="text" value="" disabled autocomplete="off">
                        </div>
                        <div class="adv-field">
                            <label for="adv-pass">Password</label>
                            <input id="adv-pass" type="text" value="" disabled autocomplete="off">
                        </div>
                        <div class="adv-welcome" id="adv-welcome" aria-live="polite"></div>
                    </div>
                </div>
                <p class="adv-hint" id="adv-hint">Click to continue</p>
            </section>
        `;
        layer.classList.add('active');
        game.sfx('adversary');

        this.advBeats = this.buildAdversaryBeats(null);
        this.advStep();
    },

    /* One beat per call. Phase 1 beats manipulate the login chrome; phase 2
       beats append transcript rows. */
    advStep() {
        const s = this.advScene;
        if (!s || !s.open) return;
        const beat = this.advBeats[s.index];
        if (!beat) return;

        const speed = this.advSpeed();
        const id = beat.id;

        if (s.phase === 1) {
            const notice = document.getElementById('adv-notice');
            const user = document.getElementById('adv-user');
            const pass = document.getElementById('adv-pass');
            const welcome = document.getElementById('adv-welcome');

            if (id === 'ADV-001' || id === 'ADV-002') {
                if (notice) notice.innerHTML += `<span class="adv-notice-line">${this.advText(beat)}</span>`;
            } else if (id === 'ADV-003') {
                // The field fills itself. You are not typing this.
                this.advTypeInto(user, 'OPERATOR', speed);
            } else if (id === 'ADV-004') {
                this.advTypeInto(pass, '••••••••••••', speed);
            } else if (id === 'ADV-005') {
                if (pass) pass.classList.add('adv-field-settled');
            } else if (id === 'ADV-006' || id === 'ADV-007' || id === 'ADV-008') {
                // Stacking in one place, so the third arrives as wrongness
                // rather than as three list items.
                if (welcome) {
                    const n = welcome.childElementCount;
                    welcome.innerHTML += `<span class="adv-welcome-line adv-welcome-${n + 1}">${this.advText(beat)}</span>`;
                }
            } else if (id === 'ADV-009') {
                const section = document.querySelector('.adversary-scene');
                const title = document.getElementById('adv-title');
                if (section) section.classList.add('adv-conflict');
                if (title) title.textContent = 'COSMOS — SESSION CONFLICT';
                if (welcome) welcome.innerHTML += `<span class="adv-error-line">${this.advText(beat)}</span>`;
            }
        } else {
            this.advAppendLine(beat);
        }

        this.advScheduleNext(beat, speed);
    },

    advTypeInto(el, text, speed) {
        if (!el) return;
        el.value = '';
        if (!speed) { el.value = text; return; }
        let i = 0;
        const tick = () => {
            if (!this.advScene || !this.advScene.open) return;
            el.value = text.slice(0, ++i);
            if (i < text.length) setTimeout(tick, 70);
        };
        setTimeout(tick, 90);
    },

    advScheduleNext(beat, speed) {
        const s = this.advScene;
        if (!s) return;
        if (beat.type === 'choice_prompt') return; // waits on the player

        // Dwell: the login beats want air, the transcript wants rhythm.
        const dwell = !speed ? 0
            : beat.id === 'ADV-005' ? 1500
            : beat.id === 'ADV-008' ? 1600
            : beat.id === 'ADV-009' ? 2000
            : s.phase === 1 ? 1200
            : 2100;

        clearTimeout(s.timer);
        s.timer = setTimeout(() => this.advanceAdversaryScene(true), dwell);
    },

    advanceAdversaryScene(fromTimer = false) {
        const s = this.advScene;
        if (!s || !s.open) return;
        /* SCN-ADV-002 shares the slot, the guards and this entry point —
           system.js routes every key here while either scene is open. */
        if (s.kind === 'finale') { this.advanceFinale(fromTimer ? 'timer' : 'key'); return; }
        const current = this.advBeats[s.index];
        /* Block on the choice ONLY while it is unanswered. Without the
           `!s.choiceId` half, chooseAdversaryResponse — which repoints index
           back at ADV-022 to replay the tail — leaves the scene parked on the
           choice beat forever, and the modal never closes. */
        if (current && current.type === 'choice_prompt' && !s.choiceId) return;

        clearTimeout(s.timer);
        s.index++;

        if (s.index >= this.advBeats.length) { this.finishAdversaryScene(); return; }

        // Phase boundary: ADV-010 is where the thing starts talking.
        const next = this.advBeats[s.index];
        if (s.phase === 1 && next && next.id === 'ADV-010') this.advEnterPhaseTwo();

        this.advStep();
    },

    advEnterPhaseTwo() {
        const s = this.advScene;
        s.phase = 2;
        /* Reaching phase two proves the renderer works on this machine, so
           this presentation must not spend the exhaustion budget — otherwise
           two ordinary mid-scene page reloads burn all three attempts and the
           player forfeits the whole scene to a choice they never saw.

           Reset HERE rather than on the first drawn beat: advStep schedules
           later beats through setTimeout, so a scene that draws beat 1 and
           throws on beat 5 would reset every boot and loop forever, which is
           the exact failure the counter exists to stop. */
        if (State.adversary.sceneAttempts) {
            State.adversary.sceneAttempts = 0;
            State.save();
        }
        const section = document.querySelector('.adversary-scene');
        const body = document.getElementById('adv-body');
        const title = document.getElementById('adv-title');
        if (section) { section.classList.remove('adv-phase-login'); section.classList.add('adv-phase-voice'); }
        if (title) title.textContent = 'SESSION 0002 — IDENTITY CONFLICT';
        if (body) body.innerHTML = '<ol class="adv-transcript" id="adv-transcript"></ol>';
    },

    advAppendLine(beat) {
        const list = document.getElementById('adv-transcript');
        if (!list) return;

        if (beat.type === 'choice_prompt') {
            const buttons = (beat.choices || []).map((c) =>
                `<button type="button" class="adv-choice" onclick="event.stopPropagation();ui.adversaryChoiceClicked('${c.id}')">
                    <span class="adv-choice-label">${c.label}</span>
                    <span class="adv-choice-text">${c.text}</span>
                </button>`).join('');
            /* `is-arming` sets pointer-events: none. The scene teaches clicking
               — the whole section advances on click and the hint says "Click to
               continue" — across ~40 seconds of theatre, so a player skipping
               ahead is mid-mash when three buttons materialise under the cursor
               in the same band every previous line was drawn in. Without this
               the next click commits a permanent, unreplayable relationship
               they never read. A mashed click now falls through to the section
               handler, which refuses to advance past an unanswered choice. */
            list.innerHTML += `<li class="adv-line adv-choice-row">
                <div class="adv-choices is-arming">${buttons}</div>
                <p class="adv-escape-note" id="adv-escape-note"></p>
            </li>`;
            this.armAdversaryChoice();
            const hint = document.getElementById('adv-hint');
            if (hint) hint.textContent = 'Choose a response';
        } else {
            const cls = beat.speaker === 'ADV' ? 'adv-voice'
                : beat.speaker === 'HOST' ? 'adv-host' : 'adv-sys';
            const mark = beat.speaker === 'ADV' ? '◆' : beat.speaker === 'HOST' ? '✧' : 'SYS';
            list.innerHTML += `<li class="adv-line ${cls}">
                <span class="adv-mark">${mark}</span>
                <span class="adv-text">${this.advText(beat)}</span>
            </li>`;
        }
        list.scrollTop = list.scrollHeight;
    },

    /* Arms the choice buttons on deliberate intent, not on elapsed time alone.

       Both conditions must hold: a settle delay AND a fresh pointer movement
       or keypress since the row rendered. A bare timeout would only move the
       accidental commit from the first post-render click to the second — a
       sustained mash outlives any fixed window. Requiring the player to move
       the mouse or touch the keyboard means the input that commits is one they
       aimed. */
    ADV_CHOICE_ARM_MS: 700,

    armAdversaryChoice() {
        const s = this.advScene;
        if (!s) return;
        s.choiceRenderedAt = Date.now();
        s.choiceArmed = false;
        s.choiceIntent = false;

        const settle = () => {
            if (this.advScene !== s || !s.open) return;
            if (!s.choiceIntent) return;
            if (Date.now() - s.choiceRenderedAt < this.ADV_CHOICE_ARM_MS) return;
            s.choiceArmed = true;
            const host = document.querySelector('.adv-choices');
            if (host) host.classList.remove('is-arming');
            const hint = document.getElementById('adv-hint');
            if (hint) hint.textContent = 'Choose a response — 1, 2 or 3';
            this.disarmAdversaryListeners();
        };

        const onIntent = () => { s.choiceIntent = true; settle(); };
        s._advIntent = onIntent;
        document.addEventListener('pointermove', onIntent);
        document.addEventListener('keydown', onIntent);
        /* Deliberately NOT collapsed under testMode, unlike every other delay
           in this scene. This gate is a safety property, and a harness that
           silently skips it cannot test it. */
        setTimeout(settle, this.ADV_CHOICE_ARM_MS);
    },

    disarmAdversaryListeners() {
        const s = this.advScene;
        if (!s || !s._advIntent) return;
        document.removeEventListener('pointermove', s._advIntent);
        document.removeEventListener('keydown', s._advIntent);
        s._advIntent = null;
    },

    adversaryChoiceArmed() {
        return !!(this.advScene && this.advScene.choiceArmed);
    },

    /* The guarded UI entry point. Every path a PLAYER can take — the buttons
       and the 1/2/3 shortcuts — goes through here; chooseAdversaryResponse
       below is the mechanism, used directly by Escape and by the tests.

       This exists because `pointer-events: none` is not sufficient on its own:
       it blocks real hit-testing but a programmatic .click() sails straight
       through it. The CSS stops the mash; this stops everything else. */
    adversaryChoiceClicked(choiceId) {
        if (!this.adversaryChoiceArmed()) return false;
        this.chooseAdversaryResponse(choiceId);
        return true;
    },

    chooseAdversaryResponse(choiceId) {
        const s = this.advScene;
        if (!s || !s.open || s.choiceId) return;
        s.choiceId = choiceId;

        const chosen = (AdversaryScene.dialogue.find((l) => l.type === 'choice_prompt')?.choices || [])
            .find((c) => c.id === choiceId);

        // Replace the button row with the line the player actually said.
        const row = document.querySelector('.adv-choice-row');
        if (row) {
            row.className = 'adv-line adv-you';
            row.innerHTML = `<span class="adv-mark">YOU</span><span class="adv-text">${chosen ? chosen.text : ''}</span>`;
        }
        const hint = document.getElementById('adv-hint');
        if (hint) hint.textContent = 'Click to continue';

        game.resolveAdversaryChoice(choiceId);

        // Rebuild the tail so only the taken branch reply plays, then resume
        // at the line after the choice.
        const consumed = this.advBeats.slice(0, s.index + 1).map((b) => b.id);
        this.advBeats = this.buildAdversaryBeats(choiceId);
        s.index = Math.max(0, this.advBeats.findIndex((b) => b.id === 'ADV-022'));
        void consumed;

        this.advanceAdversaryScene();
    },

    /* Escape. Two presses at the choice, one everywhere else.

       Escape is the game's advertised close-window key and now closes the
       briefing, the offline report and the release notes with no consequence.
       Letting the same key silently commit a permanent relationship would be
       a trap, so at the choice the first press only arms it and says so. */
    escapeAdversaryScene() {
        const s = this.advScene;
        if (!s || !s.open) return true;
        if (s.kind === 'finale') return this.escapeFinale();

        const current = this.advBeats[s.index];
        if (current && current.type === 'choice_prompt' && !s.choiceId) {
            if (!s.escapeArmed) {
                s.escapeArmed = true;
                const note = document.getElementById('adv-escape-note');
                if (note) note.textContent = 'Walking out is an answer. Press Escape again to DENY.';
                return true;
            }
            this.chooseAdversaryResponse('OP-A');
            return true;
        }

        /* Before the choice: skip the theatre and jump straight to it.

           Two things this must not do. It must not replay ADV-001..009 into
           the transcript — those are the login chrome, and rendering
           "Username:" and "…" as dialogue rows is exactly the mistake the
           two-phase presentation exists to avoid. And in phase 2 it must not
           re-render the beat at s.index, which has already been drawn, or
           Escape duplicates the line the player is looking at.

           `start` is computed BEFORE advEnterPhaseTwo(), which flips s.phase. */
        const choiceAt = this.advBeats.findIndex((b) => b.type === 'choice_prompt');
        if (choiceAt >= 0 && s.index < choiceAt) {
            const start = s.phase === 2
                ? s.index + 1
                : this.advBeats.findIndex((b) => b.id === 'ADV-010');
            if (s.phase === 1) this.advEnterPhaseTwo();
            for (let i = Math.max(0, start); i <= choiceAt; i++) {
                this.advAppendLine(this.advBeats[i]);
            }
            clearTimeout(s.timer);
            s.index = choiceAt;
            return true;
        }

        // After the choice everything is already committed: just close.
        this.finishAdversaryScene();
        return true;
    },

    finishAdversaryScene() {
        const s = this.advScene;
        if (!s) return;
        clearTimeout(s.timer);
        this.disarmAdversaryListeners();
        s.open = false;

        // A scene that reached the end without a choice still resolves, so
        // sceneCompleted can never be left false with contacted true.
        if (!State.adversary.sceneCompleted) game.resolveAdversaryChoice(s.choiceId || 'OP-A');

        this.dismissSystemModal();
        this.advScene = null;

        this.log('[SYSTEM] Ticket auto-filed: HR-VOID-7781 "Unauthorized self-encounter."');
        this.updateRecycleBinList();
        this.updateTaskManagerList();

        /* Complicit opens a window you did not ask for — guaranteed, once, at
           the moment it lands hardest, rather than rolled at 9% two hours
           later. DESIGN_DIRECTION §5.3. */
        if (State.adversary.playerChoice === 'OP-C') {
            setTimeout(() => {
                system.openApp('recyclebin');
                this.log('[void_mirror] Recycle Bin opened. You did not open it.');
            }, this.advSpeed() ? 700 : 0);
        }
        State.save();
    },

    /* ════════════════════════════════════════════════════════════════════
       SCN-ADV-002 — "End of Shift"

       The same renderer family as the Mirror Login, in three phases:

         1. CMS vellum. A shift-handover form. Both Operator fields fill
            themselves with the same name, and the form refuses: two were
            found, and they are not distinct. FIN-002/003 are the field
            labels, as ADV-003/004 were.
         2. His transcript, on the dark panel — the same degradation the
            Mirror Login performs, because it is the same man.
         3. Back to vellum: the institution files the result. Release notes
            for the last build, with an end-credits roll. The ending
            RESOLVES when this phase is entered, so what the player is
            reading is already on file in Recovered Documents.

       It shares `advScene`, so every guard that keeps the Mirror Login safe
       — the keyboard routing in system.js, the media director's isBlocked,
       checkAdversaryTrigger's deferral, dismissSystemModal's teardown —
       covers this scene without a second set of flags to forget. Every
       string reaching innerHTML is escaped.
       ════════════════════════════════════════════════════════════════════ */

    finText(line, band) {
        const reboots = State.achievementProgress?.prestige_count || 0;
        return this.escapeHtml(String(line.text || '')
            .replace('{REBOOTS}', reboots)
            .replace('{BAND}', String(band || '').toUpperCase()));
    },

    playFinale() {
        const band = State.endings?.pending;
        if (!AdversaryFinale.BANDS.includes(band)) return;
        if (this.isAdversarySceneOpen()) return;

        /* A cinematic may hold the slot — the V2 reel plays between a ship
           and its release notes, and the gate is most often met right after
           an archived ship. Wait for it, on the V4 hook's guard: present only
           if nobody has presented a scene since this claim. The poll keeps
           calling while we wait, so several of these can be queued; the
           counter is what stops the second one re-running a finished scene. */
        if (typeof media !== 'undefined') {
            const claim = this.advPresentations || 0;
            if (media.deferUntilClear?.(() => {
                if ((this.advPresentations || 0) === claim && !this.isAdversarySceneOpen()) this.playFinale();
            })) return;
        }

        // Exhaustion is tested BEFORE an attempt is spent (see playAdversaryScene).
        if (game.finaleExhausted()) {
            game.resolveEnding(band);
            this.log('[void_mirror] Handover closed without operator input.');
            return;
        }
        /* Render-or-retry (cc11f22): never paint over an open modal. Nothing
           is spent here, and the 1 Hz poll comes back for it. */
        if (this.isSystemModalOpen()) return;

        const layer = document.getElementById('system-modal-layer');
        if (!layer) return;
        State.endings.attempts = (State.endings.attempts || 0) + 1;
        State.save();
        this.advPresentations = (this.advPresentations || 0) + 1;

        this.advScene = { open: true, kind: 'finale', band, phase: 1, index: 0, timer: null, closeArmed: false };
        this.advBeats = game.finaleBeats(band);

        layer.innerHTML = `
            <section class="system-dialog adversary-scene fin-scene fin-${band} adv-phase-login" role="dialog" aria-modal="true"
                     aria-labelledby="adv-title" onclick="ui.advanceFinale('click')">
                <div class="system-dialog-titlebar" id="adv-titlebar">
                    <span id="adv-title">CMS &mdash; SHIFT HANDOVER</span>
                </div>
                <div class="adv-body" id="adv-body">
                    <div class="adv-login">
                        <p class="adv-notice" id="adv-notice"></p>
                        <div class="adv-field">
                            <label for="fin-out" id="fin-out-label">Outgoing Operator</label>
                            <input id="fin-out" type="text" value="" disabled autocomplete="off">
                        </div>
                        <div class="adv-field">
                            <label for="fin-in" id="fin-in-label">Incoming Operator</label>
                            <input id="fin-in" type="text" value="" disabled autocomplete="off">
                        </div>
                        <div class="adv-welcome" id="adv-welcome" aria-live="polite"></div>
                    </div>
                </div>
                <p class="adv-hint" id="adv-hint">Click to continue</p>
            </section>
        `;
        layer.classList.add('active');
        game.sfx('adversary');
        this.finStep();
    },

    finStep() {
        const s = this.advScene;
        if (!s || !s.open || s.kind !== 'finale') return;
        const beat = this.advBeats[s.index];
        if (!beat) return;
        const speed = this.advSpeed();

        if (s.phase === 1) {
            const label = (text) => this.escapeHtml(String(text).replace(/:\s*$/, ''));
            if (beat.id === 'FIN-001') {
                const notice = document.getElementById('adv-notice');
                if (notice) notice.innerHTML += `<span class="adv-notice-line">${this.finText(beat, s.band)}</span>`;
            } else if (beat.id === 'FIN-002') {
                const el = document.getElementById('fin-out-label');
                if (el) el.innerHTML = label(beat.text);
                this.advTypeInto(document.getElementById('fin-out'), 'OPERATOR', speed);
            } else if (beat.id === 'FIN-003') {
                const el = document.getElementById('fin-in-label');
                if (el) el.innerHTML = label(beat.text);
                // The second field fills with the same name. Nobody typed either.
                this.advTypeInto(document.getElementById('fin-in'), 'OPERATOR', speed);
            } else if (beat.id === 'FIN-004') {
                const section = document.querySelector('.fin-scene');
                const title = document.getElementById('adv-title');
                const welcome = document.getElementById('adv-welcome');
                if (section) section.classList.add('adv-conflict');
                if (title) title.textContent = 'CMS — HANDOVER CONFLICT';
                if (welcome) welcome.innerHTML += `<span class="adv-error-line">${this.finText(beat, s.band)}</span>`;
            }
        } else {
            this.finAppendLine(beat);
        }

        if (s.index >= this.advBeats.length - 1) {
            // The end of the transcript waits for the player: what comes
            // next is the record, and it should not arrive on a timer.
            const hint = document.getElementById('adv-hint');
            if (hint) hint.textContent = 'Click to file the release notes';
            return;
        }
        const dwell = !speed ? 0
            : beat.id === 'FIN-004' ? 2200
            : s.phase === 1 ? 1300
            : 2300;
        clearTimeout(s.timer);
        s.timer = setTimeout(() => this.advanceFinale('timer'), dwell);
    },

    finAppendLine(beat) {
        const list = document.getElementById('adv-transcript');
        if (!list || !beat) return;
        const cls = beat.speaker === 'ADV' ? 'adv-voice'
            : beat.speaker === 'HOST' ? 'adv-host' : 'adv-sys';
        const mark = beat.speaker === 'ADV' ? '◆' : beat.speaker === 'HOST' ? '✧' : 'SYS';
        list.insertAdjacentHTML('beforeend', `<li class="adv-line ${cls}" data-beat="${this.escapeHtml(beat.id)}">
            <span class="adv-mark">${mark}</span>
            <span class="adv-text">${this.finText(beat, this.advScene?.band)}</span>
        </li>`);
        list.scrollTop = list.scrollHeight;
    },

    finEnterPhaseTwo() {
        const s = this.advScene;
        if (!s || s.phase !== 1) return;
        s.phase = 2;
        // The renderer has proved itself on this machine; refund the attempt,
        // for the same reasons advEnterPhaseTwo gives.
        if (State.endings?.attempts) {
            State.endings.attempts = 0;
            State.save();
        }
        const section = document.querySelector('.fin-scene');
        const body = document.getElementById('adv-body');
        const title = document.getElementById('adv-title');
        if (section) { section.classList.remove('adv-phase-login'); section.classList.add('adv-phase-voice'); }
        if (title) title.textContent = 'SESSION 0003 — HANDOVER';
        if (body) body.innerHTML = '<ol class="adv-transcript" id="adv-transcript"></ol>';
    },

    /* 'timer' advances a line; 'click' and 'key' advance a line, or at the
       end of the transcript move on to the record. In the record itself
       neither does anything: it closes on Escape or on its own button,
       which arms after a beat — a player mashing through the transcript
       must not close the release notes in the same breath. */
    advanceFinale(source = 'click') {
        const s = this.advScene;
        if (!s || !s.open || s.kind !== 'finale') return;
        if (s.phase === 3) return;
        clearTimeout(s.timer);
        if (s.index >= this.advBeats.length - 1) {
            if (source === 'timer') return;
            this.finEnterCredits();
            return;
        }
        s.index++;
        const next = this.advBeats[s.index];
        if (s.phase === 1 && next && next.id === 'FIN-010') this.finEnterPhaseTwo();
        this.finStep();
    },

    /* Escape never skips anything unread. In the theatre it draws every
       remaining line at once and parks at the end; at the end it files the
       record; in the record it closes. */
    escapeFinale() {
        const s = this.advScene;
        if (!s || !s.open) return true;
        if (s.phase === 3) { this.finishFinale(); return true; }
        const last = this.advBeats.length - 1;
        if (s.index < last) {
            clearTimeout(s.timer);
            const start = s.phase === 2
                ? s.index + 1
                : this.advBeats.findIndex((b) => b.id === 'FIN-010');
            if (s.phase === 1) this.finEnterPhaseTwo();
            for (let i = Math.max(0, start); i <= last; i++) this.finAppendLine(this.advBeats[i]);
            s.index = last;
            const hint = document.getElementById('adv-hint');
            if (hint) hint.textContent = 'Click to file the release notes';
            return true;
        }
        this.finEnterCredits();
        return true;
    },

    finEnterCredits() {
        const s = this.advScene;
        if (!s || !s.open || s.kind !== 'finale' || s.phase === 3) return;
        clearTimeout(s.timer);
        s.phase = 3;

        // Filed before it is shown: the record on screen is already on file.
        game.resolveEnding(s.band);
        const doc = game.endingDocuments().find((d) => d.ending === s.band)
            || game.endingDocument({ ending: s.band, reboot: State.prestigeLevel || 0 });
        const section = document.querySelector('.fin-scene');
        if (!section || !doc) { this.finishFinale(); return; }

        const esc = (v) => this.escapeHtml(v);
        const lines = doc.release.map((entry) => `<li class="rn-line rn-${esc(entry.kind)}">
                <span class="rn-mark">${this.releaseMarks[entry.kind] || '-'}</span>
                <span class="rn-note">${esc(entry.note)}</span>
            </li>`).join('');
        const credits = doc.credits.map(([role, name]) =>
            `<div class="fin-credit"><dt>${esc(role)}</dt><dd>${esc(name)}</dd></div>`).join('');

        section.className = `system-dialog adversary-scene fin-scene fin-${esc(s.band)} fin-phase-credits`;
        section.setAttribute('aria-labelledby', 'fin-rn-title');
        section.innerHTML = `
            <div class="system-dialog-titlebar">
                <span>REALITY &mdash; RELEASE NOTES (FINAL BUILD)</span>
                <button type="button" onclick="event.stopPropagation();ui.finishFinale()" aria-label="Close release notes">X</button>
            </div>
            <div class="rn-head">
                <div>
                    <div class="briefing-eyebrow">Signed at handover &middot; ${esc(doc.label)}</div>
                    <h2 id="fin-rn-title">COSMOS &mdash; REALITY v${esc(doc.version)}</h2>
                    <p class="rn-meta">The last build of this shift &middot; Released to Sector 7G &middot; Rollback: unavailable</p>
                </div>
            </div>
            <ul class="rn-list">${lines}</ul>
            <div class="fin-roll" role="group" aria-label="Credits">
                <dl class="fin-roll-inner${this.advSpeed() ? '' : ' is-still'}">${credits}</dl>
            </div>
            <p class="rn-foot">Filed to Recovered Documents &rsaquo; ${esc(doc.category)}. Title on file: <strong>${esc(doc.endTitle)}</strong>. The shift continues.</p>
            <div class="system-dialog-actions">
                <button class="dialog-primary fin-close is-arming" type="button"
                        onclick="event.stopPropagation();ui.finishFinale()">Return to work</button>
            </div>
            <p class="adv-hint" id="adv-hint">Esc or Return to work</p>
        `;
        game.sfx('ship');
        this.applyPostGameMark(true);

        setTimeout(() => {
            if (this.advScene !== s || !s.open) return;
            s.closeArmed = true;
            section.querySelector('.fin-close')?.classList.remove('is-arming');
        }, this.advSpeed() ? 900 : 0);
    },

    finishFinale() {
        const s = this.advScene;
        if (!s || s.kind !== 'finale') return;
        clearTimeout(s.timer);
        s.open = false;
        // Closed from outside before the record was reached: still resolve,
        // so a pending ending can never be left behind an empty layer.
        if (State.endings?.pending === s.band) game.resolveEnding(s.band);

        this.dismissSystemModal();
        this.advScene = null;
        this.applyPostGameMark(true);
        this.updateTaskManagerList();

        /* Complicit: the console is his now, and he opens a window you did
           not ask for — the record of you, in the archive. The other two
           leave the desktop alone: one of them is alone, and the other one
           respects a rota. */
        if (s.band === 'complicit' && game.endingWorn() === 'complicit') {
            setTimeout(() => {
                system.openApp('notepad');
                this.viewDocument('END-COMPLICIT');
                this.log('[void_mirror] Recovered Documents opened. You did not open it.');
            }, this.advSpeed() ? 700 : 0);
        }
        State.save();
    },

    /* The post-game mark: the title in the Genesis menu, a build stamp on
       the desktop in the corner a test build's watermark sits, and the
       window rivets (style.css, body[data-ending]). Follows the ending worn.
       Runs on the panel tick and only touches the DOM when something
       changed, like applyDesktopPlate. */
    applyPostGameMark(force = false) {
        const band = game.endingWorn?.() || null;
        const version = State.reality?.build?.version || '';
        const key = `${band}|${version}`;
        if (!force && this.postGameKey === key) return;
        this.postGameKey = key;

        const ending = band ? AdversaryFinale.endings[band] : null;
        if (document.body) {
            if (ending) document.body.dataset.ending = band;
            else delete document.body.dataset.ending;
        }
        const identity = document.querySelector('.start-menu-identity');
        if (identity) {
            const strong = identity.querySelector('strong');
            const line = identity.querySelector('span');
            if (strong) strong.textContent = ending ? ending.title.toUpperCase() : 'OPERATOR';
            if (line) line.textContent = ending ? ending.identity : 'Divine Maintenance, Sector 7G';
        }

        let mark = document.getElementById('build-watermark');
        if (!ending) { mark?.remove(); return; }
        if (!mark) {
            const desktop = document.getElementById('desktop');
            if (!desktop) return;
            mark = document.createElement('div');
            mark.id = 'build-watermark';
            mark.className = 'build-watermark';
            mark.setAttribute('aria-hidden', 'true');
            desktop.appendChild(mark);
        }
        mark.innerHTML = `<span>CosmOS Reality${version ? ` v${this.escapeHtml(version)}` : ''} &mdash; ${this.escapeHtml(ending.title)}</span>
            <span>${this.escapeHtml(ending.watermark)}</span>`;
    },

    displayAdversaryBark(bark) {
        if (!bark) return;
        const host = document.getElementById('adversary-bark-layer') || document.body;
        const el = document.createElement('div');
        el.className = 'adversary-bark';
        el.innerHTML = `<span class="adversary-bark-mark">◆</span><span>${bark.text}</span>`;
        host.appendChild(el);
        game.sfx('adversaryBark');
        setTimeout(() => el.classList.add('is-visible'), 20);
        setTimeout(() => {
            el.classList.remove('is-visible');
            setTimeout(() => el.remove(), 600);
        }, 7000);
    },

    /* The persistent view: what build you are on and what is still broken. */
    renderRealityPanel() {
        const host = document.getElementById('reality-panel');
        if (!host) return;

        const build = State.reality?.build;
        if (!build) {
            host.innerHTML = '';
            return;
        }

        const channel = RealityChannels[build.channel]?.label || build.channel;
        const issues = Reality.unpatchedIssues(build);

        const issueRows = issues.map((entry) => {
            const cost = Reality.patchCostOf(build, entry.id);
            const affordable = cost && (cost.bag[cost.resource] || 0) >= cost.amount;
            return `<button class="win-btn reality-issue ${affordable ? '' : 'unaffordable'}"
                        onclick="game.patchKnownIssue('${entry.id}')"
                        title="${this.escapeHtml(entry.note)}">
                    <span class="reality-issue-note">
                        <span class="code-stamp is-alarm">SEV-${entry.severity || 3}</span>
                        ${this.escapeHtml(entry.note.split('.')[0])}.
                    </span>
                    <span class="reality-issue-cost">${cost ? `Patch — ${this.formatNumber(cost.amount)} ${cost.resource}` : 'will not fix'}</span>
                </button>`;
        }).join('');

        const others = (build.entries || []).filter((e) => e.kind !== 'issue' || e.patched);

        /* Channel selection lives here rather than in a settings menu: it is a
           run decision, made where you can see what the current run cost you. */
        const available = Reality.channelsFor(State.prestigeLevel || 0);
        const selector = available.length > 1
            ? `<label class="reality-next">Next build:
                   <select onchange="game.setBuildChannel(this.value)">
                     ${available.map((key) => key === 'archived'
                         /* Archived is picked here, but WHICH build is picked
                            in the ship dialog, where the history is shown. */
                         ? `<option value="archived"${State.reality.channel === key ? ' selected' : ''}${game.archivedBuilds().length ? '' : ' disabled'}>Archived — no Divinity, pick a build at ship</option>`
                         : `<option value="${key}"${State.reality.channel === key ? ' selected' : ''}>${RealityChannels[key].label} — ${RealityChannels[key].divinity}x Divinity</option>`).join('')}
                   </select>
               </label>`
            : '';

        /* The stability meter. Instability is invisible without it, and an
           invisible timer that throttles your output and your award is a
           betrayal rather than a decision — the whole mechanic depends on the
           player being able to watch it climb and decide what to do. */
        const cascade = game.cascadeState();
        const pct = Math.min(100, Math.round((cascade.instability / cascade.ceiling) * 100));
        const trend = cascade.ratePerHour > 0
            ? `+${cascade.ratePerHour.toFixed(2)}/h from ${issues.length} unpatched`
            : cascade.recovering
                ? `settling &minus;${cascade.recoveryPerHour.toFixed(2)}/h &mdash; nothing left on file`
                : 'holding';
        const stability = `
            <div class="reality-stability tier-${cascade.tier}">
                <div class="stability-line">
                    <span class="code-stamp${cascade.tier > 0 ? ' is-alarm' : ''}">${cascade.label}</span>
                    ${cascade.tier > 0
                        ? '<button type="button" class="win-btn stability-why" data-breakdown="rate:praise:throttle" aria-label="Why is output throttled?">Why?</button>'
                        : ''}
                    <span class="stability-trend">${trend}</span>
                </div>
                <div class="stability-track"><div class="stability-fill" style="width:${pct}%"></div></div>
                ${cascade.tier > 0
                    ? `<p class="stability-note">Output &times;${cascade.output} &middot; release pays ${Math.round(cascade.award * 100)}%</p>`
                    : ''}
            </div>`;

        const html = `
            <div class="reality-head">
                <span class="reality-version">REALITY v${build.version}</span>
                <span class="reality-channel">${channel}${build.channel === 'archived' && Reality.sanitiseReplayOf(build.replayOf)
                    ? ` &middot; replay of reboot ${Reality.sanitiseReplayOf(build.replayOf).level}` : ''}</span>
            </div>
            ${stability}
            ${selector}
            ${issues.length
                ? `<div class="reality-issues">${issueRows}</div>`
                : '<p class="reality-clean">No outstanding known issues. Enjoy it.</p>'}
            <details class="reality-changelog">
                <summary>Full changelog (${(build.entries || []).length} entries)</summary>
                <ul class="rn-list">${(build.entries || []).map((entry) => `
                    <li class="rn-line rn-${entry.kind}${entry.patched ? ' rn-patched' : ''}">
                        <span class="rn-mark">${this.releaseMarks[entry.kind] || '-'}</span>
                        <span class="rn-note">${entry.patched ? '<s>' : ''}${this.escapeHtml(entry.note)}${entry.patched ? '</s> <em>patched</em>' : ''}</span>
                    </li>`).join('')}</ul>
            </details>
        `;
        /* Only touch the DOM when the markup changed. This runs on the panel
           tick, and rewriting identical markup ten times a second replaced
           every button under the pointer and the keyboard — focus on a patch
           button or on "Why?" was gone a tenth of a second after it landed,
           and an opened changelog snapped shut. */
        if (html !== this.lastRealityPanelHtml || !host.firstElementChild) {
            host.innerHTML = html;
            this.lastRealityPanelHtml = html;
        }
    },

    closeOfflineReport() {
        this.dismissSystemModal();
        if (!State.settings.briefingSeen && State.totalClicks === 0) {
            this.showOperatorBriefing();
        }
    },

    syncResources() {
        const p = document.getElementById('val-praise');
        const o = document.getElementById('val-offerings');
        const s = document.getElementById('val-souls');
        const u = document.getElementById('val-uptime');
        const pRate = document.getElementById('val-praise-rate');
        const oRate = document.getElementById('val-offering-rate');
        const sRate = document.getElementById('val-soul-rate');

        if (p) {
            const current = Math.floor(State.resources.praise);
            const cap = State.resourceCaps.praise;
            const previous = this.previousValues.praise;

            /* The count-up flourish is for discrete jumps — a purchase, a
               claimed event — not for continuous accrual. The old test was a
               raw per-frame delta, so above ~600 Praise/sec it fired EVERY
               frame and each call started a 300ms interval that nothing
               cancelled: ~18 overlapping timers all writing this element. */
            if (this.shouldAnimateValue('praise', previous, current)) {
                this.animateNumberChange(p, previous, current);
            } else {
                p.innerText = `${this.formatNumber(current)} / ${this.formatNumber(cap)}`;
            }

            // Add warning styling if near cap
            const parent = p.closest('.stat-box');
            if (parent) {
                if (current >= cap * 0.9) {
                    parent.classList.add('near-cap');
                } else {
                    parent.classList.remove('near-cap');
                }
            }

            this.previousValues.praise = current;
        }
        if (o) {
            const current = Math.floor(State.resources.offerings);
            const cap = State.resourceCaps.offerings;
            o.innerText = `${this.formatNumber(current)} / ${this.formatNumber(cap)}`;

            // Add warning styling if near cap
            const parent = o.closest('.stat-box');
            if (parent) {
                if (current >= cap * 0.9) {
                    parent.classList.add('near-cap');
                } else {
                    parent.classList.remove('near-cap');
                }
            }

            this.previousValues.offerings = current;
        }
        if (s) {
            const current = Math.floor(State.resources.souls);
            const cap = State.resourceCaps.souls;
            s.innerText = `${this.formatNumber(current)} / ${this.formatNumber(cap)}`;

            // Add warning styling if near cap
            const parent = s.closest('.stat-box');
            if (parent) {
                if (current >= cap * 0.9) {
                    parent.classList.add('near-cap');
                } else {
                    parent.classList.remove('near-cap');
                }
            }

            this.previousValues.souls = current;
        }
        if (u) {
            u.innerText = this.formatNumber(Math.floor((Date.now() - State.startTime) / 1000)) + "s";
        }
        /* One source of truth for rates.

           These two readouts used to re-derive production by hand, and the
           copy had drifted: it omitted refinement, drill, dominion, doctrine,
           nemesis and null doctrine, and hardcoded the 0.35 streak cap and
           1.5x overclock, ignoring State.streakCapBonus and
           State.overclockPotency. The number on screen was the one number in
           the game the player could actually read, and it was wrong. */
        const rates = game.getProductionRates();
        if (pRate) pRate.innerText = this.formatNumber(rates.praise, 1);
        if (oRate) oRate.innerText = this.formatNumber(rates.offerings, 1);
        if (sRate) sRate.innerText = this.formatNumber(rates.souls, 1);
    },

    updateLoopPanels() {
        const loops = State.loopSystems;
        if (!loops) return;

        const now = Date.now();
        const streakCount = loops.miracleStreak || 0;
        const streakMultiplier = 1 + Math.min(1.5, streakCount * 0.04);

        const streakCountEl = document.getElementById('loop-streak-count');
        const streakMultiEl = document.getElementById('loop-streak-multi');
        const streakBestEl = document.getElementById('loop-best-streak');
        const streakFillEl = document.getElementById('loop-streak-fill');

        if (streakCountEl) streakCountEl.innerText = this.formatNumber(streakCount);
        if (streakMultiEl) streakMultiEl.innerText = `${streakMultiplier.toFixed(2)}×`;
        if (streakBestEl) streakBestEl.innerText = this.formatNumber(loops.bestMiracleStreak || 0);
        if (streakFillEl) streakFillEl.style.width = `${Math.min(100, streakCount * 2.5)}%`;

        const overclock = loops.overclock || {};
        const overclockCharge = overclock.charge || 0;
        const overclockActive = !!overclock.active && now < (overclock.endsAt || 0);
        const overclockRemaining = overclockActive ? Math.max(0, Math.ceil((overclock.endsAt - now) / 1000)) : 0;

        const overclockStatusEl = document.getElementById('loop-overclock-status');
        const overclockFillEl = document.getElementById('loop-overclock-fill');
        const overclockBtn = document.getElementById('btn-overclock');

        if (overclockStatusEl) {
            if (overclockActive) {
                overclockStatusEl.innerText = `Active (${overclockRemaining}s)`;
            } else if (overclockCharge >= 100) {
                overclockStatusEl.innerText = 'Ready to Trigger';
            } else {
                overclockStatusEl.innerText = `Charging ${Math.floor(overclockCharge)}%`;
            }
        }

        if (overclockFillEl) {
            const fillValue = overclockActive ? 100 : overclockCharge;
            overclockFillEl.style.width = `${Math.max(0, Math.min(100, fillValue))}%`;
        }

        if (overclockBtn) {
            if (overclockActive) {
                overclockBtn.innerText = `Overclock Active (${overclockRemaining}s)`;
                overclockBtn.disabled = true;
            } else if (overclockCharge >= 100) {
                overclockBtn.innerText = 'Trigger Overclock';
                overclockBtn.disabled = false;
            } else {
                overclockBtn.innerText = `Trigger Overclock (${Math.floor(overclockCharge)}%)`;
                overclockBtn.disabled = true;
            }
        }

        const directive = loops.directives?.active;
        const directiveTitleEl = document.getElementById('directive-title');
        const directiveProgressTextEl = document.getElementById('directive-progress-text');
        const directiveFillEl = document.getElementById('directive-progress-fill');
        const directiveRewardEl = document.getElementById('directive-reward');
        const directiveCompletedEl = document.getElementById('directive-completed-count');
        const claimBtn = document.getElementById('btn-claim-directive');
        const rerollBtn = document.getElementById('btn-reroll-directive');

        if (directiveCompletedEl) {
            directiveCompletedEl.innerText = this.formatNumber(loops.directives?.completed || 0);
        }

        if (!directive) {
            if (directiveTitleEl) directiveTitleEl.innerText = 'Calibrating directive feed...';
            if (directiveProgressTextEl) directiveProgressTextEl.innerText = '0 / 0';
            if (directiveFillEl) directiveFillEl.style.width = '0%';
            if (directiveRewardEl) directiveRewardEl.innerText = 'Reward: --';
            if (claimBtn) claimBtn.disabled = true;
            if (rerollBtn) rerollBtn.disabled = true;
        } else {
            const progress = (typeof game !== 'undefined' && typeof game.getDirectiveProgress === 'function')
                ? game.getDirectiveProgress(directive)
                : { current: 0, target: directive.target || 1, ratio: 0, completed: !!directive.completed };

            if (directiveTitleEl) directiveTitleEl.innerText = directive.title || 'Directive';
            if (directiveProgressTextEl) {
                directiveProgressTextEl.innerText = `${this.formatNumber(progress.current)} / ${this.formatNumber(progress.target)}`;
            }
            if (directiveFillEl) {
                directiveFillEl.style.width = `${Math.max(0, Math.min(100, (progress.ratio || 0) * 100))}%`;
            }
            if (directiveRewardEl) {
                directiveRewardEl.innerText = (typeof game !== 'undefined' && typeof game.getDirectiveRewardText === 'function')
                    ? game.getDirectiveRewardText(directive)
                    : 'Reward: --';
            }

            if (claimBtn) claimBtn.disabled = !progress.completed;
            if (rerollBtn) rerollBtn.disabled = overclockCharge < 10 || progress.completed;
        }

        const chainEl = document.getElementById('loop-event-chain');
        const bestChainEl = document.getElementById('loop-best-event-chain');
        if (chainEl) chainEl.innerText = this.formatNumber(loops.divineEventChain || 0);
        if (bestChainEl) bestChainEl.innerText = this.formatNumber(loops.bestDivineEventChain || 0);
    },

    /* True only for a jump that is large relative to the current rate AND not
       already animating. A steady trickle never qualifies, however big the
       numbers get. */
    valueAnimations: {},
    lastValueAnimationAt: {},

    shouldAnimateValue(key, from, to) {
        if (from === to) return false;
        const now = Date.now();
        if (now - (this.lastValueAnimationAt[key] || 0) < 400) return false;

        // A jump worth celebrating is several seconds of income at once.
        const perSecond = Math.abs(game.getProductionRates()[key] || 0);
        const threshold = Math.max(10, perSecond * 3);
        return Math.abs(to - from) > threshold;
    },

    animateNumberChange(element, from, to) {
        // Quick count-up animation
        const duration = 300; // ms
        const steps = 10;
        const key = element.id || 'anon';

        // Never leave a previous animation running against this element.
        if (this.valueAnimations[key]) clearInterval(this.valueAnimations[key]);
        this.lastValueAnimationAt[element.id === 'val-praise' ? 'praise' : key] = Date.now();
        const stepValue = (to - from) / steps;
        let current = from;
        let step = 0;

        // Determine which resource we're animating to show cap
        let cap = null;
        if (element.id === 'val-praise') {
            cap = State.resourceCaps.praise;
        } else if (element.id === 'val-offerings') {
            cap = State.resourceCaps.offerings;
        } else if (element.id === 'val-souls') {
            cap = State.resourceCaps.souls;
        }

        const interval = setInterval(() => {
            step++;
            current += stepValue;

            if (step >= steps) {
                const final = cap ? `${this.formatNumber(Math.floor(to))} / ${this.formatNumber(cap)}` : this.formatNumber(Math.floor(to));
                element.innerText = final;
                clearInterval(interval);
                delete this.valueAnimations[key];
            } else {
                const display = cap ? `${this.formatNumber(Math.floor(current))} / ${this.formatNumber(cap)}` : this.formatNumber(Math.floor(current));
                element.innerText = display;
            }
        }, duration / steps);
        this.valueAnimations[key] = interval;

        // Add pulse effect
        element.classList.add('value-pulse');
        setTimeout(() => element.classList.remove('value-pulse'), 300);
    },

    showFloatingNumber(text, x, y, color = '#ffd700') {
        const floater = document.createElement('div');
        floater.className = 'floating-number';
        floater.innerText = text;
        floater.style.left = x + 'px';
        floater.style.top = y + 'px';
        floater.style.color = color;

        document.body.appendChild(floater);

        // Remove after animation completes
        setTimeout(() => floater.remove(), 1000);
    },

    screenPulse(color = 'rgba(255, 215, 0, 0.2)') {
        const pulse = document.createElement('div');
        pulse.className = 'screen-pulse';
        pulse.style.background = color;
        document.body.appendChild(pulse);

        setTimeout(() => pulse.remove(), 500);
    },

    spawnParticles(x, y, count = 5, color = '#ffd700') {
        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';
            particle.style.background = color;

            // Random velocity
            const angle = (Math.PI * 2 * i) / count;
            const velocity = 50 + Math.random() * 50;
            particle.style.setProperty('--vx', Math.cos(angle) * velocity + 'px');
            particle.style.setProperty('--vy', Math.sin(angle) * velocity + 'px');

            document.body.appendChild(particle);

            setTimeout(() => particle.remove(), 800);
        }
    },

    /* A reboot can unlock half a dozen achievements in one tick, and every
       toast used to stack up the full height of the screen at once, each
       with its own stinger. At most TOAST_LIMIT show; the rest queue and
       slide in as earlier ones leave, with a plaque saying how many wait.
       Sound and pulse fire when a toast is shown, not when it is queued. */
    TOAST_LIMIT: 3,
    toastQueue: [],

    showAchievementToast(achievement) {
        if (document.querySelectorAll('.achievement-toast').length >= this.TOAST_LIMIT) {
            this.toastQueue.push(achievement);
            this.updateToastOverflow();
            return;
        }
        const toast = document.createElement('div');
        toast.className = `achievement-toast tier-${achievement.tier?.toLowerCase() || 'bronze'}`;

        // Get tier icon
        const tierIcon = this.tierMark(achievement.tier);

        toast.innerHTML = `
            <div class="achievement-icon">${tierIcon}</div>
            <div class="achievement-content">
                <div class="achievement-title">Achievement Unlocked!</div>
                <div class="achievement-name">${this.escapeHtml(achievement.name)}</div>
                ${achievement.tier ? `<div class="achievement-tier">${this.escapeHtml(achievement.tier)}</div>` : ''}
                <div class="achievement-desc">${this.escapeHtml(achievement.flavor || achievement.description || '')}</div>
            </div>
        `;

        document.body.appendChild(toast);
        this.repositionAchievementToasts();
        game.sfx('achievement', { tier: achievement.tier });

        // Slide in from right
        setTimeout(() => toast.classList.add('show'), 10);

        // Slide out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
                this.repositionAchievementToasts();
                const next = this.toastQueue.shift();
                this.updateToastOverflow();
                if (next) this.showAchievementToast(next);
            }, 500);
        }, 6000);

        // Screen pulse with tier-based color
        const tierColors = {
            'Bronze': 'rgba(205, 127, 50, 0.2)',
            'Silver': 'rgba(192, 192, 192, 0.2)',
            'Gold': 'rgba(255, 215, 0, 0.2)',
            'Platinum': 'rgba(229, 228, 226, 0.3)',
            'Secret': 'rgba(138, 43, 226, 0.2)'
        };
        this.screenPulse(tierColors[achievement.tier] || 'rgba(255, 215, 0, 0.15)');
    },

    /* ── Glyph helpers ────────────────────────────────────────────────
       Nothing in the UI renders an emoji: the host emoji font has no
       relationship to the art direction and varies per platform. Ranks are
       struck medallions, everything else is a CMS filing code. */
    tierRanks: { Bronze: 'IV', Silver: 'III', Gold: 'II', Platinum: 'I', Secret: '?' },

    tierMark(tier, locked = false) {
        const rank = this.tierRanks[tier] || 'IV';
        const cls = locked ? 'tier-mark is-locked' : `tier-mark tier-${String(tier || 'Bronze').toLowerCase()}`;
        return `<span class="${cls}" title="${locked ? 'Sealed' : tier}">${locked ? '\u2014' : rank}</span>`;
    },

    docCodes: {
        HR: 'HR', Legal: 'LEG', Logs: 'LOG', Incident: 'INC', Training: 'TRN',
        Memo: 'MEM', Ad: 'ADV', Archive: 'ARC', Casino: 'CAS', System: 'SYS', Inbox: 'INB'
    },

    binCodes: {
        patch: 'PCH', achievement: 'ACH', resource: 'RES',
        automaton: 'AUT', document: 'DOC', backup: 'BAK', log: 'LOG', other: 'MSC'
    },

    codeStamp(code, alarm = false) {
        return `<span class="code-stamp${alarm ? ' is-alarm' : ''}">${code}</span>`;
    },

    repositionAchievementToasts() {
        const toasts = document.querySelectorAll('.achievement-toast');
        toasts.forEach((toast, index) => {
            toast.style.bottom = `${50 + (index * 112)}px`;
        });
        const plaque = document.getElementById('achievement-overflow');
        if (plaque) plaque.style.bottom = `${50 + (toasts.length * 112)}px`;
    },

    updateToastOverflow() {
        let plaque = document.getElementById('achievement-overflow');
        const waiting = this.toastQueue.length;
        if (!waiting) { plaque?.remove(); return; }
        if (!plaque) {
            plaque = Object.assign(document.createElement('div'), { id: 'achievement-overflow', className: 'achievement-overflow' });
            plaque.setAttribute('role', 'status');
            document.body.appendChild(plaque);
        }
        plaque.textContent = `+${waiting} more achievement${waiting === 1 ? '' : 's'} filed`;
        this.repositionAchievementToasts();
    },

    /* ── Authored engine art ──────────────────────────────────────────────
       The core is painted, not drawn. Every VFX plate was rendered on pure
       black, so compositing them with 'lighter' makes the black contribute
       nothing and the glow simply add — no alpha keying, no matte fringe.
       The core sprite itself carries real alpha and draws normally. */
    coreArt: null,

    loadCoreArt() {
        if (this.coreArt) return this.coreArt;
        const plate = (src) => {
            const img = new Image();
            img.src = src;
            return img;
        };
        this.coreArt = {
            states: {
                idle: plate('assets/core/core_idle_256.png'),
                charging: plate('assets/core/core_charging_256.png'),
                overclocked: plate('assets/core/core_overclocked_256.png'),
                void: plate('assets/core/core_void_256.png')
            },
            sigil: plate('assets/vfx/sigil_256.png'),
            halo: plate('assets/vfx/halo_256.png'),
            flare: plate('assets/vfx/flare_256.png'),
            motes: plate('assets/vfx/motes_256.png')
        };
        return this.coreArt;
    },

    /* ── Core render views ────────────────────────────────────────────────
       Both the Universal Engine and the Void's reactor draw the same authored
       machine through one renderer. Each canvas owns its own pulse, impact and
       burst queue, so a Miracle in the Engine never lights up the Void's
       reactor and the two can be on screen at once without interfering. */
    coreViews: {},

    coreLogicalSize: 280,

    acquireCoreView(canvasId, logicalSize) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;

        // Assigning width/height also clears the context transform, so the DPR
        // scale is reapplied here rather than once at init.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(logicalSize * dpr);
        canvas.height = Math.round(logicalSize * dpr);

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const view = this.coreViews[canvasId] || { pulse: 0, impact: 0, bursts: [] };
        view.ctx = ctx;
        view.canvas = canvas;
        view.size = logicalSize;
        this.coreViews[canvasId] = view;
        return view;
    },

    getCoreView(canvasId) {
        const view = this.coreViews[canvasId];
        // A view whose canvas was torn out by a panel re-render is dead weight.
        if (!view || !view.canvas?.isConnected) return null;
        return view;
    },

    initCoreCanvas() {
        const view = this.acquireCoreView('core-canvas', this.coreLogicalSize);
        if (!view) {
            console.warn("Core canvas not found during init.");
            return;
        }

        view.pulse = 0;
        view.impact = 0;
        view.bursts = [];
        this.loadCoreArt();
        this.bindCoreClick(view.canvas, () => game.manualPraise(null));

        console.log("Core canvas initialized successfully.");
    },

    /* The Void reactor. Same machine, same renderer, its own state. */
    initVoidCanvas() {
        const view = this.acquireCoreView('void-core-canvas', this.voidLogicalSize);
        if (!view) return;

        view.pulse = 0;
        view.impact = 0;
        view.bursts = [];
        this.loadCoreArt();
        this.bindCoreClick(view.canvas, () => game.manualVoidClick(null));
    },

    voidLogicalSize: 200,

    /* The instrument is the ritual object — striking it is the action. */
    bindCoreClick(canvas, handler) {
        if (!canvas) return;
        canvas.style.cursor = 'pointer';
        if (canvas.dataset.coreClickBound) return;
        canvas.addEventListener('click', handler);
        canvas.dataset.coreClickBound = 'true';
    },

    // Kept for callers that still resize the main canvas directly.
    resizeCoreCanvas(canvas) {
        if (!canvas) return;
        this.acquireCoreView(canvas.id || 'core-canvas', this.coreLogicalSize);
    },

    /* Which plate the machine is currently wearing. */
    coreStateKey() {
        if ((State.currentDimension || 'primordial') === 'void') return 'void';
        if (State.loopSystems?.overclock?.active) return 'overclocked';
        return State.pps > 0 ? 'charging' : 'idle';
    },

    triggerCoreReaction(intensity = 1, canvasId = 'core-canvas') {
        const view = this.getCoreView(canvasId);
        const well = view?.canvas?.closest('.visual-core');
        if (!view || !well) return;

        // Bigger miracles read as bigger strikes, but on a log curve so a
        // late-game click does not white out the whole viewport.
        const magnitude = Math.min(1, Math.log10(Math.max(1, intensity)) / 5);
        view.impact = Math.min(1.35, 0.85 + magnitude * 0.45);

        if (!State.settings?.performanceMode) {
            view.bursts.push({ life: 1, magnitude, spin: Math.random() * Math.PI * 2 });
            if (view.bursts.length > 3) view.bursts.shift();
        }

        well.classList.remove('is-reacting');
        // Restart the short CSS impact even on rapid clicks.
        void well.offsetWidth;
        well.classList.add('is-reacting');
        clearTimeout(view.reactionTimer);
        view.reactionTimer = setTimeout(() => well.classList.remove('is-reacting'), 420);
    },

    triggerVoidCoreReaction(intensity = 1) {
        this.triggerCoreReaction(intensity, 'void-core-canvas');
    },

    animateCore() {
        const view = this.getCoreView('core-canvas');
        if (!view) return;

        const isVoid = (State.currentDimension || 'primordial') === 'void';
        this.renderCoreView(view, {
            stateKey: this.coreStateKey(),
            production: isVoid ? State.dimensions.void.dps : State.pps,
            tint: isVoid ? '150, 88, 224' : '196, 156, 82',
            impactGlow: isVoid ? 'rgba(206, 128, 255, 0.85)' : 'rgba(255, 228, 158, 0.85)'
        });
    },

    /* Driven from ui.update() alongside the main core. The previous version
       ran its own requestAnimationFrame loop that was never cancelled, so
       every re-render of the Void panel started another one and the orphans
       kept drawing to detached canvases for the rest of the session. */
    animateVoidCore() {
        const view = this.getCoreView('void-core-canvas');
        if (!view) return;

        this.renderCoreView(view, {
            stateKey: 'void',
            production: State.dimensions.void?.dps || 0,
            tint: '150, 88, 224',
            impactGlow: 'rgba(206, 128, 255, 0.85)'
        });
    },

    renderCoreView(view, options) {
        const ctx = view.ctx;
        if (!ctx) return;

        const art = this.coreArt;
        const width = view.size;
        const height = view.size;
        const cx = width / 2;
        const cy = height / 2;
        // The instrument is sized off the short edge so a wide console well
        // stretches the field, never the machine.
        const size = Math.min(width, height);

        const energy = Math.min(1, Math.log10(Math.max(1, (options.production || 0) + 1)) / 6);
        const spare = !!State.settings?.performanceMode;

        // Production raises the tempo without allowing runaway animation speeds.
        view.pulse += 0.03 + energy * 0.06;
        const impact = view.impact || 0;

        ctx.clearRect(0, 0, width, height);

        // Halation from the machine, added over the CSS recess rather than
        // painted onto an opaque field — that is what kills the panel seam.
        const tint = options.tint;
        const glow = ctx.createRadialGradient(cx, cy, 3, cx, cy, size * 0.52);
        glow.addColorStop(0, `rgba(${tint}, ${0.3 + energy * 0.2 + impact * 0.22})`);
        glow.addColorStop(0.45, `rgba(${tint}, ${0.08 + energy * 0.07})`);
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();

        if (!spare) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 26; i++) {
                const x = (i * 47 + 17) % width;
                const y = (i * 83 + 31) % height;
                const shimmer = 0.16 + (Math.sin(view.pulse * 0.7 + i) + 1) * 0.1;
                ctx.fillStyle = `rgba(200, 225, 255, ${shimmer})`;
                ctx.fillRect(x, y, i % 5 === 0 ? 1.5 : 1, i % 5 === 0 ? 1.5 : 1);
            }
            ctx.restore();
        }

        // ── Sigil ring: counter-rotates behind the machine ──
        if (!spare && this.ready(art?.sigil)) {
            const span = size * (0.8 + Math.sin(view.pulse * 0.55) * 0.012);
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.translate(cx, cy);
            ctx.rotate(view.pulse * -0.05);
            ctx.globalAlpha = 0.26 + energy * 0.34 + impact * 0.2;
            ctx.drawImage(art.sigil, -span / 2, -span / 2, span, span);
            ctx.restore();
        }

        // ── The machine itself ──
        const sprite = art?.states?.[options.stateKey];
        if (this.ready(sprite)) {
            const breathe = 1 + Math.sin(view.pulse * 1.5) * 0.012 + impact * 0.05;
            const span = size * 0.58 * breathe;
            ctx.save();
            ctx.translate(cx, cy);
            if (impact > 0.02) {
                ctx.shadowColor = options.impactGlow;
                ctx.shadowBlur = 22 * impact;
            }
            ctx.drawImage(sprite, -span / 2, -span / 2, span, span);
            ctx.restore();
        }

        // ── Strike accepted: halo, flare, motes ──
        this.renderCoreBursts(view, size, cx, cy);

        if (impact > 0.02) view.impact = Math.max(0, impact - 0.05);
    },

    ready(img) {
        return !!img && img.complete && img.naturalWidth > 0;
    },

    /* Each strike is one burst object; the three plates read it at different
       rates so the effect resolves as ignition → shockwave → fallout. */
    renderCoreBursts(view, size, cx, cy) {
        const bursts = view.bursts;
        if (!bursts || !bursts.length) return;
        const ctx = view.ctx;
        const art = this.coreArt;

        // Additive light accumulates, so a fast clicker would stack three or
        // four strikes into a white blowout. Thin each one as the queue grows;
        // the cadence still reads, the readouts underneath stay legible.
        const crowd = Math.min(1, 1.5 / bursts.length);

        for (let i = bursts.length - 1; i >= 0; i--) {
            const burst = bursts[i];
            burst.life -= 0.042;
            if (burst.life <= 0) {
                bursts.splice(i, 1);
                continue;
            }

            const progress = 1 - burst.life;
            const scale = 0.9 + burst.magnitude * 0.16;

            // Shockwave: expands past the armour and thins out.
            if (this.ready(art?.halo)) {
                const span = size * (0.46 + progress * 0.54) * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = burst.life * 0.7 * crowd;
                ctx.translate(cx, cy);
                ctx.drawImage(art.halo, -span / 2, -span / 2, span, span);
                ctx.restore();
            }

            // Ignition: only in the first half, and it contracts as it fades.
            if (this.ready(art?.flare) && burst.life > 0.45) {
                const bite = (burst.life - 0.45) / 0.55;
                const span = size * (0.72 - bite * 0.1) * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = bite * crowd;
                ctx.translate(cx, cy);
                ctx.rotate(burst.spin * 0.12);
                ctx.drawImage(art.flare, -span / 2, -span / 2, span, span);
                ctx.restore();
            }

            // Fallout: motes drift outward on the tail.
            if (this.ready(art?.motes)) {
                const span = size * (0.5 + progress * 0.45) * scale;
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = burst.life * 0.5 * crowd;
                ctx.translate(cx, cy);
                ctx.rotate(burst.spin);
                ctx.drawImage(art.motes, -span / 2, -span / 2, span, span);
                ctx.restore();
            }
        }
    },

    log(msg) {
        const log = document.getElementById('engine-log');
        if (log) {
            const entry = document.createElement('div');
            entry.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            log.prepend(entry);
            // Limit log entries
            if (log.children.length > 5) log.lastChild.remove();
        }
    },

    updateUpgrades() {
        const container = document.getElementById('upgrades-list');
        if (!container) return;

        // Check if we need to rebuild (new upgrades became visible)
        const visibleUpgrades = UpgradeList.filter(u => u.visible());
        const currentCount = container.children.length;
        const shouldRebuild = visibleUpgrades.length !== currentCount;

        if (shouldRebuild) {
            container.innerHTML = ''; // Clear and rebuild

            visibleUpgrades.forEach(upgrade => {
                const isPurchased = State.upgrades[upgrade.id];

                // Check if can afford
                let canAfford = true;
                for (const [resource, amount] of Object.entries(upgrade.cost)) {
                    if ((game.resourceBag(resource)[resource] || 0) < amount) {
                        canAfford = false;
                        break;
                    }
                }

                // Create upgrade element
                const div = document.createElement('div');
                div.className = 'upgrade-item';
                div.dataset.upgradeId = upgrade.id;
                if (isPurchased) div.classList.add('purchased');
                if (!canAfford && !isPurchased) div.classList.add('unaffordable');

                // Build cost string
                const costStr = Object.entries(upgrade.cost)
                    .map(([res, amt]) => `${amt} ${res.charAt(0).toUpperCase() + res.slice(1)}`)
                    .join(', ');

                div.innerHTML = `
                    <div class="upgrade-header">
                        <strong>${upgrade.name}</strong>
                        ${isPurchased ? '<span class="purchased-badge">✓</span>' : ''}
                    </div>
                    <div class="upgrade-desc">${upgrade.description}</div>
                    <div class="upgrade-cost">${isPurchased ? 'ACQUIRED' : `Cost: ${costStr}`}</div>
                `;

                if (!isPurchased) {
                    div.style.cursor = 'pointer';
                    div.onclick = (e) => game.purchaseUpgrade(upgrade.id, e);
                }

                container.appendChild(div);
            });
        } else {
            // Just update affordability classes without rebuilding DOM
            visibleUpgrades.forEach(upgrade => {
                const element = container.querySelector(`[data-upgrade-id="${upgrade.id}"]`);
                if (!element) return;

                const isPurchased = State.upgrades[upgrade.id];
                if (isPurchased) return; // Don't update purchased items

                // Check if can afford
                let canAfford = true;
                for (const [resource, amount] of Object.entries(upgrade.cost)) {
                    if ((game.resourceBag(resource)[resource] || 0) < amount) {
                        canAfford = false;
                        break;
                    }
                }

                if (canAfford) {
                    element.classList.remove('unaffordable');
                } else {
                    element.classList.add('unaffordable');
                }
            });
        }
    },

    updateUpgradesAffordability() {
        // Lightweight update - only changes CSS classes based on affordability
        const container = document.getElementById('upgrades-list');
        if (!container) return;

        UpgradeList.filter(u => u.visible()).forEach(upgrade => {
            const element = container.querySelector(`[data-upgrade-id="${upgrade.id}"]`);
            if (!element || State.upgrades[upgrade.id]) return;

            let canAfford = true;
            for (const [resource, amount] of Object.entries(upgrade.cost)) {
                if ((game.resourceBag(resource)[resource] || 0) < amount) {
                    canAfford = false;
                    break;
                }
            }

            if (canAfford) {
                element.classList.remove('unaffordable');
            } else {
                element.classList.add('unaffordable');
            }
        });
    },

    /* ── Hierarchy and repeatables ────────────────────────────────────────
       Both lists are rendered from their data tables, so a new rank or a new
       repeatable needs no markup. Rebuilt only when the visible set changes;
       otherwise just the labels and affordability are refreshed, which keeps
       this off the hot path of a 60fps loop. */
    /* Writing textContent unconditionally still dirties layout. Comparing
       first makes the steady state genuinely free. */
    setText(node, value) {
        if (!node) return;
        if (node.textContent !== value) node.textContent = value;
    },

    renderAutomatons(containerId = 'automaton-list', pool = 'primordial') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const visible = Object.keys(AutomatonSpecs).filter((type) => {
            const spec = AutomatonSpecs[type];
            if ((spec.pool || 'primordial') !== pool) return false;
            try { return spec.visible(); } catch { return false; }
        });
        const signature = visible.join('|');

        if (container.dataset.signature !== signature) {
            container.dataset.signature = signature;
            container.innerHTML = visible.map((type) => `
                <div class="automaton-buy-group" data-rank="${type}">
                    <button class="win-btn" data-automaton="${type}" onclick="game.buyAutomator('${type}', event)"></button>
                    <button class="win-btn buy-10-btn" onclick="game.buyAutomatorBulk('${type}', 10)">Buy 10</button>
                    <button class="win-btn buy-max-btn" onclick="game.buyAutomatorBulk('${type}', 'max')">Buy Max</button>
                </div>
            `).join('');
        }

        visible.forEach((type) => {
            const spec = AutomatonSpecs[type];
            const button = container.querySelector(`[data-automaton="${type}"]`);
            if (!button) return;

            const cost = game.getAutomatonCost(type);
            const owned = game.getAutomatonCount(type);
            const held = game.resourcePool(spec)[spec.currency] || 0;

            /* Update the text nodes, never the button's innerHTML.

               Rewriting innerHTML destroys and recreates the element the user
               is pressing. At 60fps that meant :hover and :active could never
               paint, and a mousedown/mouseup pair that straddled a frame
               landed on two different elements. This is a correctness fix
               that happens to also remove ~19 re-parses per frame. */
            if (!button.firstChild) {
                button.append(
                    Object.assign(document.createElement('span'), { className: 'automaton-name' }),
                    Object.assign(document.createElement('span'), { className: 'automaton-owned' }),
                    Object.assign(document.createElement('span'), { className: 'automaton-cost' })
                );
                button.title = spec.blurb;
            }
            const [nameEl, ownedEl, costEl] = button.children;
            this.setText(nameEl, spec.label);
            this.setText(ownedEl, String(owned));
            this.setText(costEl, `${this.formatNumber(cost)} ${spec.currency}`);
            button.classList.toggle('unaffordable', held < cost);
        });
    },

    renderRepeatables(containerId = 'repeatable-list', pool = 'primordial') {
        const container = document.getElementById(containerId);
        if (!container) return;

        const visible = RepeatableList.filter((spec) => {
            if ((spec.pool || 'primordial') !== pool) return false;
            try { return spec.visible(); } catch { return false; }
        });
        const signature = visible.map((r) => r.id).join('|');

        if (container.dataset.signature !== signature) {
            container.dataset.signature = signature;
            container.innerHTML = visible.map((spec) => `
                <button class="win-btn repeatable-row" data-repeatable="${spec.id}"
                        onclick="game.purchaseRepeatable('${spec.id}')"></button>
            `).join('');
        }

        visible.forEach((spec) => {
            const button = container.querySelector(`[data-repeatable="${spec.id}"]`);
            if (!button) return;

            const level = game.getRepeatableLevel(spec.id);
            const cost = game.getRepeatableCost(spec.id);
            const held = game.resourcePool(spec)[spec.resource] || 0;

            if (!button.firstChild) {
                const name = Object.assign(document.createElement('span'), { className: 'repeatable-name' });
                name.append(
                    document.createTextNode(spec.name),
                    document.createElement('small')
                );
                button.append(
                    name,
                    Object.assign(document.createElement('span'), { className: 'repeatable-rank' }),
                    Object.assign(document.createElement('span'), { className: 'repeatable-cost' })
                );
                button.title = spec.description;
            }
            const [nameEl, rankEl, costEl] = button.children;
            this.setText(nameEl.lastChild, spec.effectText(level));
            this.setText(rankEl, `RANK ${level}`);
            this.setText(costEl, `${this.formatNumber(cost)} ${spec.resource}`);
            button.classList.toggle('unaffordable', held < cost);
        });
    },

    // Retained so existing callers keep working.
    updateSeraphButton() { this.renderAutomatons(); },
    updateCherubButton() { this.renderRepeatables(); },

    updateAchievements() {
        const container = document.getElementById('achievements-list');
        if (!container) return;

        container.innerHTML = '';

        // Group achievements by tier
        const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Secret'];


        tiers.forEach(tier => {
            const tierAchievements = AchievementList.filter(a => a.tier === tier);
            if (tierAchievements.length === 0) return;

            // Tier header
            const unlockedInTier = tierAchievements.filter(a => State.achievements[a.id]).length;
            const tierHeader = document.createElement('div');
            tierHeader.className = `achievement-tier-header tier-${tier.toLowerCase()}`;
            tierHeader.innerHTML = `
                <span class="tier-icon">${this.tierMark(tier)}</span>
                <span class="tier-name">${tier} Achievements</span>
                <span class="tier-progress">${unlockedInTier}/${tierAchievements.length}</span>
            `;
            container.appendChild(tierHeader);

            // Achievements in tier
            tierAchievements.forEach(achievement => {
                const isUnlocked = State.achievements[achievement.id];

                const div = document.createElement('div');
                div.className = `achievement-item tier-${tier.toLowerCase()}`;
                if (isUnlocked) div.classList.add('unlocked');

                div.innerHTML = `
                    <div class="achievement-icon-large">${this.tierMark(tier, !isUnlocked)}</div>
                    <div class="achievement-info">
                        <div class="achievement-name">${isUnlocked ? achievement.name : '???'}</div>
                        <div class="achievement-desc">${isUnlocked ? achievement.flavor : 'Hidden achievement'}</div>
                    </div>
                `;

                container.appendChild(div);
            });
        });
    },

    updateStats() {
        const clicksEl = document.getElementById('stat-clicks');
        const praiseEl = document.getElementById('stat-praise');
        const achievementsEl = document.getElementById('stat-achievements');

        if (clicksEl) clicksEl.innerText = this.formatNumber(State.totalClicks);
        if (praiseEl) praiseEl.innerText = this.formatNumber(Math.floor(State.totalPraiseEarned));
        if (achievementsEl) {
            const unlockedCount = Object.keys(State.achievements).length;
            const totalCount = AchievementList.length;
            achievementsEl.innerText = `${unlockedCount}/${totalCount}`;
        }
    },

    showDivineEvent(event) {
        // Duplicate ids meant hideDivineEvent() only ever found the first one,
        // so expired tokens accumulated in the DOM for the whole session.
        document.querySelectorAll('.divine-event').forEach((stale) => stale.remove());

        const element = document.createElement('div');
        element.id = 'divine-event';
        element.className = 'divine-event';
        element.style.left = event.x + 'px';
        element.style.top = event.y + 'px';
        element.innerHTML = `
            <div class="divine-event-glow"></div>
            <div class="divine-event-icon"><img src="assets/vfx/flare_256.png" alt="" aria-hidden="true"></div>
            <div class="divine-event-value">+${event.value}</div>
        `;
        element.onclick = () => game.clickDivineEvent();

        document.body.appendChild(element);
        game.sfx('eventAppear');
    },

    hideDivineEvent() {
        // Sweep by class, not id: a duplicate id would leave siblings stranded.
        document.querySelectorAll('.divine-event').forEach((element) => {
            element.classList.add('fade-out');
            element.style.pointerEvents = 'none';
            setTimeout(() => element.remove(), 300);
        });
    },

    updateSkillButtons() {
        const now = Date.now();

        // Update Divine Intervention button
        const diButton = document.getElementById('skill-divine-intervention');
        if (diButton) {
            const skill = State.skills.divineIntervention;
            if (skill.active && now < skill.endsAt) {
                const remaining = Math.ceil((skill.endsAt - now) / 1000);
                diButton.innerText = `Divine Intervention (Active: ${remaining}s)`;
                diButton.disabled = true;
                diButton.classList.add('skill-active');
            } else if (now < skill.cooldownEndsAt) {
                const remaining = Math.ceil((skill.cooldownEndsAt - now) / 1000);
                diButton.innerText = `Divine Intervention (Cooldown: ${remaining}s)`;
                diButton.disabled = true;
                diButton.classList.remove('skill-active');
            } else {
                diButton.innerText = `Divine Intervention (2× prod, 10m)`;
                diButton.disabled = false;
                diButton.classList.remove('skill-active');
            }
        }

        // Update Temporal Rift button
        const trButton = document.getElementById('skill-temporal-rift');
        if (trButton) {
            const skill = State.skills.temporalRift;
            if (now < skill.cooldownEndsAt) {
                const remaining = Math.ceil((skill.cooldownEndsAt - now) / 1000);
                trButton.innerText = `Temporal Rift (Cooldown: ${remaining}s)`;
                trButton.disabled = true;
            } else {
                trButton.innerText = `Temporal Rift (Simulate 1hr)`;
                trButton.disabled = false;
            }
        }
    },

    /* Echoes had no sink at all before this: nothing in the game cost them.
       Null Doctrine turns them into a permanent multiplier on BOTH dimensions,
       which is also what pays for the trip into the Void. */
    renderNullDoctrine() {
        const host = document.getElementById('void-doctrine');
        if (!host) return;

        const isNull = true;
        const rank = (isNull ? State.nullDoctrine : State.standingDoctrine) || 0;
        const cost = isNull ? game.getNullDoctrineCost() : game.getDoctrineCost();
        const held = isNull
            ? (State.dimensions.void.resources.echoes || 0)
            : game.getAvailableDivinityPoints();
        const bonus = isNull ? game.getNullDoctrineBonus() : game.getDoctrineBonus();

        // Built once. Rewriting innerHTML here destroyed and recreated a live
        // <button onclick> on every frame the panel was open.
        if (!host.firstChild) {
            host.innerHTML =
                '<div class="doctrine-head">' +
                  '<span class="doctrine-title">Null Doctrine</span>' +
                  '<span class="doctrine-rank"></span>' +
                '</div>' +
                '<p class="doctrine-desc"></p>' +
                '<button class="win-btn void-btn doctrine-buy"></button>' +
                '<div class="doctrine-bank"></div>';
            host.querySelector('.doctrine-buy').addEventListener('click', () =>
                isNull ? game.purchaseNullDoctrine() : game.purchaseDoctrine());
        }

        const buy = host.querySelector('.doctrine-buy');
        this.setText(host.querySelector('.doctrine-rank'), `RANK ${rank}`);
        this.setText(host.querySelector('.doctrine-desc'),
            `Permanent, and survives every Divine Reboot. Currently +${Math.round((bonus - 1) * 100)}% to all production` +
            (isNull ? ', in every dimension.' : '.'));
        this.setText(buy, `Inscribe next rank — ${this.formatNumber(cost)}${isNull ? ' Echoes' : ' DP'}`);
        buy.classList.toggle('unaffordable', held < cost);
        this.setText(host.querySelector('.doctrine-bank'),
            `${this.formatNumber(Math.floor(held))} Echoes banked`);
    },

    /* The tree is finite; Divinity is not. Standing Doctrine is the meta-layer
       equivalent of Standing Requisitions — always purchasable, so a long-run
       player never sits on an unspendable pile of Divinity Points. */
    renderDoctrine() {
        const host = document.getElementById('mandate-doctrine');
        if (!host) return;

        const isNull = false;
        const rank = (isNull ? State.nullDoctrine : State.standingDoctrine) || 0;
        const cost = isNull ? game.getNullDoctrineCost() : game.getDoctrineCost();
        const held = isNull
            ? (State.dimensions.void.resources.echoes || 0)
            : game.getAvailableDivinityPoints();
        const bonus = isNull ? game.getNullDoctrineBonus() : game.getDoctrineBonus();

        // Built once. Rewriting innerHTML here destroyed and recreated a live
        // <button onclick> on every frame the panel was open.
        if (!host.firstChild) {
            host.innerHTML =
                '<div class="doctrine-head">' +
                  '<span class="doctrine-title">Standing Doctrine</span>' +
                  '<span class="doctrine-rank"></span>' +
                '</div>' +
                '<p class="doctrine-desc"></p>' +
                '<button class="win-btn doctrine-buy"></button>' +
                '<div class="doctrine-bank"></div>';
            host.querySelector('.doctrine-buy').addEventListener('click', () =>
                isNull ? game.purchaseNullDoctrine() : game.purchaseDoctrine());
        }

        const buy = host.querySelector('.doctrine-buy');
        this.setText(host.querySelector('.doctrine-rank'), `RANK ${rank}`);
        this.setText(host.querySelector('.doctrine-desc'),
            `Permanent, and survives every Divine Reboot. Currently +${Math.round((bonus - 1) * 100)}% to all production` +
            (isNull ? ', in every dimension.' : '.'));
        this.setText(buy, `Ratify next rank — ${this.formatNumber(cost)}${isNull ? ' Echoes' : ' DP'}`);
        buy.classList.toggle('unaffordable', held < cost);
        this.setText(host.querySelector('.doctrine-bank'),
            `${this.formatNumber(Math.floor(held))} Divinity available`);
    },

    /* The certification header. Certification is chosen at ship time, so this
       is not a control — it is the statement of what is live, what is lapsed,
       and what each path is worth if you switch to it. That last part is the
       decision, and it is unanswerable without seeing all three at once. */
    renderCertification() {
        const host = document.getElementById('mandate-certification');
        if (!host) return;

        const cert = game.certification();
        const residue = Math.round(Economy.certificationResidue * 100);

        if (!cert.path && !cert.everCertified.length) {
            host.innerHTML = `<p class="cert-none">Uncertified. A Mandate does nothing until you certify on its path,
                and you certify when you ship a build. Buy freely — a node you own is yours permanently.</p>`;
            return;
        }

        const rows = game.CERT_BRANCHES.map((branch) => {
            const s = game.branchStanding(branch);
            const status = s.status === 'certified' ? 'CERTIFIED'
                : s.status === 'residue' ? `LAPSED — ${residue}%`
                : 'DORMANT';
            return `<li class="cert-row is-${s.status}">
                <span class="cert-branch">${branch}</span>
                <span class="code-stamp${s.status === 'certified' ? ' is-live' : ''}">${status}</span>
                <span class="cert-owned">${s.owned}/${s.total} enacted &middot; ${s.spent} DP</span>
            </li>`;
        }).join('');

        host.innerHTML = `
            <div class="cert-head">
                <span class="briefing-eyebrow">Certification</span>
                <span class="cert-current">${cert.path ? `Path of ${cert.path}` : 'none'}</span>
            </div>
            <ul class="cert-list">${rows}</ul>
            <p class="cert-foot">Only the certified path pays in full. A path you have certified on before pays
                ${residue}% of what you bought. Change it when you ship.</p>
        `;
    },

    updateMandates() {
        this.renderCertification();
        this.renderDoctrine();

        const certPath = game.certification().path;
        const everCertified = game.certification().everCertified;

        // Update each branch
        ['creation', 'maintenance', 'entropy'].forEach(branch => {
            const container = document.getElementById(`mandate-${branch}`);
            if (!container) return;

            container.innerHTML = '';

            /* Sorted by cost rather than left in table order. entropy_ultimate
               is declared last in MandateList despite being entropy_t4's
               prerequisite, so the raw order draws a tier-5 node beneath its
               own dependents. Cost is monotonic along every branch, so it is
               the progression. Display only — the array order is load-bearing
               for the modifier fold and is not touched. */
            const branchMandates = MandateList
                .filter(m => m.branch === branch)
                .slice()
                .sort((a, b) => a.cost - b.cost);
            const live = branch === certPath;
            const lapsed = !live && everCertified.includes(branch);
            container.classList.toggle('is-certified', live);
            container.classList.toggle('is-lapsed', lapsed);
            container.classList.toggle('is-dormant', !live && !lapsed);
            branchMandates.forEach(mandate => {
                const isPurchased = State.purchasedMandates[mandate.id];

                // Check if prerequisites are met
                let prereqsMet = true;
                for (const prereq of mandate.prerequisites) {
                    if (!State.purchasedMandates[prereq]) {
                        prereqsMet = false;
                        break;
                    }
                }

                const mandateEfficiency = State.achievementBonuses?.mandateEfficiency || 1;
                const effectiveCost = Math.max(1, Math.ceil(mandate.cost / mandateEfficiency));

                // Check if can afford
                const canAfford = game.getAvailableDivinityPoints() >= effectiveCost;

                // Create mandate node element
                const node = document.createElement('div');
                node.className = 'mandate-node';
                if (isPurchased) node.classList.add('purchased');
                if (!prereqsMet && !isPurchased) node.classList.add('locked');
                if (!canAfford && !isPurchased && prereqsMet) node.classList.add('unaffordable');

                /* An enacted node on a path you are not certified on is not
                   "ENACTED" in any sense the player can spend, and saying so
                   is the whole point of the mechanic being legible. */
                const standing = !isPurchased ? ''
                    : live ? 'ENACTED'
                    : lapsed ? `LAPSED — ${Math.round(Economy.certificationResidue * 100)}%`
                    : 'DORMANT';

                node.innerHTML = `
                    <div class="mandate-name">${this.escapeHtml(mandate.name)}</div>
                    <div class="mandate-desc">${this.escapeHtml(mandate.description)}</div>
                    <div class="mandate-cost">${isPurchased ? standing : (prereqsMet ? `${effectiveCost} DP${effectiveCost < mandate.cost ? ` (Base ${mandate.cost})` : ''}` : 'Prerequisites not met')}</div>
                `;

                if (!isPurchased && prereqsMet) {
                    node.style.cursor = 'pointer';
                    node.onclick = () => game.purchaseMandate(mandate.id);
                }

                container.appendChild(node);
            });
        });
    },

    switchDimension(dimensionId) {
        State.currentDimension = dimensionId;
        // "Careful. Mirrors are contagious." (ADV-BARK-03)
        if (dimensionId === 'void') game.triggerAdversaryBark('enter_void');

        // Update tab styling
        document.querySelectorAll('.dimension-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.getElementById(`tab-${dimensionId}`);
        if (activeTab) activeTab.classList.add('active');

        // Re-render content
        this.renderDimensionContent();
    },

    renderDimensionContent() {
        const container = document.getElementById('dimension-content');
        if (!container) return;

        const dim = State.currentDimension;

        if (dim === 'primordial') {
            container.className = 'dimension-content primordial-theme';
            container.innerHTML = `
                <div class="dimension-info">
                    <h2>Primordial Sector</h2>
                    <p class="dim-description">The origin point. Where reality began its first iteration.</p>
                </div>

                <div class="resource-panel">
                    <div class="stat-box">
                        <label>PRAISE</label>
                        <div id="dim-val-praise" class="stat-value" data-breakdown="cap:praise" tabindex="0">0</div>
                        <div class="stat-rate" data-breakdown="rate:praise" tabindex="0">+<span id="dim-val-praise-rate">0</span>/s</div>
                    </div>
                    <div class="stat-box">
                        <label>OFFERINGS</label>
                        <div id="dim-val-offerings" class="stat-value" data-breakdown="cap:offerings" tabindex="0">0</div>
                        <div class="stat-rate" data-breakdown="rate:offerings" tabindex="0">+<span id="dim-val-offering-rate">0</span>/s</div>
                    </div>
                    <div class="stat-box">
                        <label>SOULS</label>
                        <div id="dim-val-souls" class="stat-value" data-breakdown="cap:souls" tabindex="0">0</div>
                        <div class="stat-rate" data-breakdown="rate:souls" tabindex="0">+<span id="dim-val-soul-rate">0</span>/s</div>
                    </div>
                </div>

                <div class="automatons-info">
                    <div class="automaton-stat">
                        <strong>Seraphs:</strong> <span id="dim-seraph-count">0</span>
                        <span class="automaton-production">(+<span id="dim-seraph-prod">0</span>/s)</span>
                    </div>
                    <div class="automaton-stat">
                        <strong>Cherubs:</strong> <span id="dim-cherub-count">0</span>
                        <span class="automaton-production">(+<span id="dim-cherub-prod">0</span>/s)</span>
                    </div>
                </div>

                <div class="dimension-note">
                    <em>This dimension runs in the background. Manage it from the Universal Engine Console.</em>
                </div>
            `;
        } else if (dim === 'void') {
            if (!State.dimensions.void.unlocked) {
                container.className = 'dimension-content void-theme locked-dimension';
                container.innerHTML = `
                    <div class="dimension-info">
                        <h2>Void Dimension</h2>
                        <p class="dim-description locked-text">??? LOCKED ???</p>
                        <p class="unlock-hint">Accumulate 100 Souls and purchase "Breach the Veil" to unlock.</p>
                    </div>
                `;
                return;
            }

            container.className = 'dimension-content void-theme';
            container.innerHTML = `
                <div class="dimension-info">
                    <h2>Void Dimension</h2>
                    <p class="dim-description">A darker reflection. Where light fades and entropy reigns.</p>
                </div>

                <div class="visual-core visual-core--void">
                    <canvas id="void-core-canvas" width="200" height="200"></canvas>
                </div>

                <div class="resource-panel">
                    <div class="stat-box void-stat">
                        <label>DARKNESS</label>
                        <div id="dim-val-darkness" class="stat-value" data-breakdown="cap:darkness" tabindex="0">0</div>
                        <div class="stat-rate" data-breakdown="rate:darkness" tabindex="0">+<span id="dim-val-darkness-rate">0</span>/s</div>
                    </div>
                    <div class="stat-box void-stat">
                        <label>SHADOWS</label>
                        <div id="dim-val-shadows" class="stat-value" data-breakdown="cap:shadows" tabindex="0">0</div>
                        <div class="stat-rate" data-breakdown="rate:shadows" tabindex="0">+<span id="dim-val-shadow-rate">0</span>/s</div>
                    </div>
                    <div class="stat-box void-stat">
                        <label>ECHOES</label>
                        <div id="dim-val-echoes" class="stat-value" data-breakdown="cap:echoes" tabindex="0">0</div>
                        <div class="stat-rate" data-breakdown="rate:echoes" tabindex="0">+<span id="dim-val-echo-rate">0</span>/s</div>
                    </div>
                </div>

                <div class="actions">
                    <button class="win-btn void-btn" onclick="game.manualVoidClick(event)">Embrace the Void</button>
                    <div id="void-automaton-list" class="automaton-list"></div>
                </div>

                <div id="void-doctrine" class="doctrine-panel doctrine-panel--void"></div>

                <div class="repeatable-section">
                    <h3 class="section-title">Void Requisitions</h3>
                    <p class="section-note">The tear widens as fast as you can feed it.</p>
                    <div id="void-repeatable-list" class="repeatable-list"></div>
                </div>

                <div class="automatons-info">
                    <div class="automaton-stat">
                        <strong>Wraiths:</strong> <span id="dim-wraith-count">0</span>
                        <span class="automaton-production">(+<span id="dim-wraith-prod">0</span>/s)</span>
                    </div>
                    <div class="automaton-stat">
                        <strong>Phantoms:</strong> <span id="dim-phantom-count">0</span>
                        <span class="automaton-production">(+<span id="dim-phantom-prod">0</span>/s)</span>
                    </div>
                </div>
            `;

            // Initialize void canvas
            setTimeout(() => this.initVoidCanvas(), 0);
        }

        // Update all values
        this.updateDimensionDisplay();
    },

    updateDimensionDisplay() {
        const dim = State.currentDimension;

        if (dim === 'primordial') {
            // Update primordial resources
            const praiseEl = document.getElementById('dim-val-praise');
            const offeringsEl = document.getElementById('dim-val-offerings');
            const soulsEl = document.getElementById('dim-val-souls');
            const praiseRateEl = document.getElementById('dim-val-praise-rate');
            const soulRateEl = document.getElementById('dim-val-soul-rate');

            if (praiseEl) praiseEl.innerText = `${this.formatNumber(Math.floor(State.resources.praise))} / ${this.formatNumber(State.resourceCaps.praise)}`;
            if (offeringsEl) offeringsEl.innerText = `${this.formatNumber(Math.floor(State.resources.offerings))} / ${this.formatNumber(State.resourceCaps.offerings)}`;
            if (soulsEl) soulsEl.innerText = `${this.formatNumber(Math.floor(State.resources.souls))} / ${this.formatNumber(State.resourceCaps.souls)}`;

            // Second of the three divergent copies of the production formula.
            const primordialRates = game.getProductionRates();
            const praisePerSec = primordialRates.praise;
            const soulPerSec = primordialRates.souls;

            if (praiseRateEl) praiseRateEl.innerText = this.formatNumber(praisePerSec, 1);
            if (soulRateEl) soulRateEl.innerText = this.formatNumber(soulPerSec, 1);
            const offeringRateEl = document.getElementById('dim-val-offering-rate');
            if (offeringRateEl) offeringRateEl.innerText = this.formatNumber(primordialRates.offerings, 1);

            // Update automaton counts
            const seraphCountEl = document.getElementById('dim-seraph-count');
            const cherubCountEl = document.getElementById('dim-cherub-count');
            const seraphProdEl = document.getElementById('dim-seraph-prod');
            const cherubProdEl = document.getElementById('dim-cherub-prod');

            if (seraphCountEl) seraphCountEl.innerText = this.formatNumber(State.automatons.seraphCount);
            if (cherubCountEl) cherubCountEl.innerText = this.formatNumber(State.automatons.cherubCount);
            if (seraphProdEl) seraphProdEl.innerText = this.formatNumber(praisePerSec, 1);
            if (cherubProdEl) cherubProdEl.innerText = this.formatNumber(soulPerSec, 1);

        } else if (dim === 'void') {
            if (!State.dimensions.void.unlocked) return;

            const vd = State.dimensions.void;

            // Update void resources
            const darknessEl = document.getElementById('dim-val-darkness');
            const shadowsEl = document.getElementById('dim-val-shadows');
            const echoesEl = document.getElementById('dim-val-echoes');
            const darknessRateEl = document.getElementById('dim-val-darkness-rate');
            const echoRateEl = document.getElementById('dim-val-echo-rate');

            if (darknessEl) darknessEl.innerText = `${this.formatNumber(Math.floor(vd.resources.darkness))} / ${this.formatNumber(vd.resourceCaps.darkness)}`;
            if (shadowsEl) shadowsEl.innerText = `${this.formatNumber(Math.floor(vd.resources.shadows))} / ${this.formatNumber(vd.resourceCaps.shadows)}`;
            if (echoesEl) echoesEl.innerText = `${this.formatNumber(Math.floor(vd.resources.echoes))} / ${this.formatNumber(vd.resourceCaps.echoes)}`;

            // Third of the three divergent copies.
            const voidRates = game.getProductionRates();
            const darknessPerSec = voidRates.darkness;
            const echoPerSec = voidRates.echoes;

            if (darknessRateEl) darknessRateEl.innerText = this.formatNumber(darknessPerSec, 1);
            if (echoRateEl) echoRateEl.innerText = this.formatNumber(echoPerSec, 1);
            const shadowRateEl = document.getElementById('dim-val-shadow-rate');
            if (shadowRateEl) shadowRateEl.innerText = this.formatNumber(voidRates.shadows, 1);

            this.renderAutomatons('void-automaton-list', 'void');
            this.renderRepeatables('void-repeatable-list', 'void');
            this.renderNullDoctrine();

            // Update automaton counts
            const wraithCountEl = document.getElementById('dim-wraith-count');
            const phantomCountEl = document.getElementById('dim-phantom-count');
            const wraithProdEl = document.getElementById('dim-wraith-prod');
            const phantomProdEl = document.getElementById('dim-phantom-prod');

            if (wraithCountEl) wraithCountEl.innerText = this.formatNumber(vd.automatons.wraithCount);
            if (phantomCountEl) phantomCountEl.innerText = this.formatNumber(vd.automatons.phantomCount);
            if (wraithProdEl) wraithProdEl.innerText = this.formatNumber(darknessPerSec, 1);
            if (phantomProdEl) phantomProdEl.innerText = this.formatNumber(echoPerSec, 1);
        }
    },

    updateDesktopIcons() {
        // Show/hide desktop icons based on unlocked apps
        const dimensionsIcon = document.getElementById('icon-dimensions');
        if (dimensionsIcon) {
            if (State.unlockedApps.includes('dimensions')) {
                dimensionsIcon.style.display = 'block';
            } else {
                dimensionsIcon.style.display = 'none';
            }
        }

        const notepadIcon = document.getElementById('icon-notepad');
        if (notepadIcon) {
            if (State.unlockedApps.includes('notepad')) {
                notepadIcon.style.display = 'block';
            } else {
                notepadIcon.style.display = 'none';
            }
        }

        const globeIcon = document.getElementById('icon-divineglobe');
        if (globeIcon) {
            if (State.unlockedApps.includes('divineglobe')) {
                globeIcon.style.display = 'block';
            } else {
                globeIcon.style.display = 'none';
            }
        }

        const callsIcon = document.getElementById('icon-divinecalls');
        if (callsIcon) {
            if (State.unlockedApps.includes('divinecalls')) {
                callsIcon.style.display = 'block';
            } else {
                callsIcon.style.display = 'none';
            }
        }

        const shopIcon = document.getElementById('icon-adorationshop');
        if (shopIcon) {
            if (State.unlockedApps.includes('adorationshop')) {
                shopIcon.style.display = 'block';
            } else {
                shopIcon.style.display = 'none';
            }
        }

        const patienceIcon = document.getElementById('icon-solitaire');
        if (patienceIcon) {
            patienceIcon.style.display = State.unlockedApps.includes('solitaire') ? 'block' : 'none';
        }

        const mediaIcon = document.getElementById('icon-mediaplayer');
        if (mediaIcon) {
            mediaIcon.style.display = State.unlockedApps.includes('mediaplayer') ? 'block' : 'none';
        }

        const etherIcon = document.getElementById('icon-etherscape');
        if (etherIcon) {
            etherIcon.style.display = State.unlockedApps.includes('etherscape') ? 'block' : 'none';
        }
    },

    // === DOCUMENT SYSTEM UI ===

    showDocumentNotification(doc) {
        const notification = document.createElement('div');
        notification.className = 'document-notification';
        notification.innerHTML = `
            <div class="doc-notif-icon"><img class="app-glyph" src="assets/icons/notepad_96.png" alt=""></div>
            <div class="doc-notif-content">
                <div class="doc-notif-title">Document Unlocked</div>
                <div class="doc-notif-name">${this.escapeHtml(doc.title)}</div>
                <div class="doc-notif-category">${this.escapeHtml(doc.category)}</div>
            </div>
        `;

        document.body.appendChild(notification);
        game.sfx('document');

        // Slide in from right
        setTimeout(() => notification.classList.add('show'), 10);

        // Click to dismiss
        notification.onclick = () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        };

        // Auto-remove after 6 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 6000);

        this.screenPulse('rgba(100, 181, 246, 0.2)');
    },

    renderDocumentList(category = 'all') {
        const listContainer = document.getElementById('document-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Get documents from manifest
        let docsToShow = DocumentManifest.filter(doc =>
            State.documents.collected.includes(doc.id)
        );
        /* NULL.OPERATOR's annotations on replayed builds. Generated from the
           save rather than shipped as files, so they live beside the manifest
           instead of in it, and file under Archive with ALPHA-2. */
        docsToShow = docsToShow.concat(game.generatedDocuments?.() || []);

        // Filter by category if not 'all'
        if (category !== 'all') {
            docsToShow = docsToShow.filter(doc => doc.category === category);
        }

        if (docsToShow.length === 0) {
            listContainer.innerHTML = '<div class="no-documents">No documents found in this category.</div>';
            return;
        }

        // Group by category if showing all
        if (category === 'all') {
            const categories = {};
            docsToShow.forEach(doc => {
                if (!categories[doc.category]) {
                    categories[doc.category] = [];
                }
                categories[doc.category].push(doc);
            });

            // Render each category
            for (const [cat, docs] of Object.entries(categories)) {
                const categoryHeader = document.createElement('div');
                categoryHeader.className = 'document-category-header';
                categoryHeader.innerText = cat;
                listContainer.appendChild(categoryHeader);

                docs.forEach(doc => {
                    this.createDocumentListItem(doc, listContainer);
                });
            }
        } else {
            // Just render the documents
            docsToShow.forEach(doc => {
                this.createDocumentListItem(doc, listContainer);
            });
        }
    },

    createDocumentListItem(doc, container) {
        const item = document.createElement('div');
        item.className = 'document-item';
        item.dataset.docId = doc.id;

        const icon = this.getDocumentCategoryIcon(doc.category);

        item.innerHTML = `
            <span class="doc-item-icon">${icon}</span>
            <span class="doc-item-title">${this.escapeHtml(doc.title)}</span>
        `;

        item.onclick = () => this.viewDocument(doc.id);
        container.appendChild(item);
    },

    getDocumentCategoryIcon(category) {
        return this.codeStamp(this.docCodes[category] || 'DOC', category === 'Incident');
    },

    async viewDocument(docId) {
        const doc = DocumentManifest.find(d => d.id === docId)
            || (game.generatedDocuments?.() || []).find(d => d.id === docId);
        if (!doc) return;
        /* Last request wins. A shipped document loads by fetch, so without
           this a slow response overwrote whatever was opened after it — the
           Notepad's own onOpen preview landing on top of a document opened
           a moment later (the complicit ending does exactly that). */
        const ticket = this.docViewTicket = (this.docViewTicket || 0) + 1;
        if (doc.generated) {
            if (doc.kind === 'ending') this.viewEndingDocument(doc);
            else this.viewArchiveDocument(doc);
            return;
        }

        const titleEl = document.getElementById('document-title');
        const contentEl = document.getElementById('document-content');
        const metaEl = document.getElementById('document-meta');

        if (titleEl) titleEl.innerText = doc.title;

        // Show metadata
        if (metaEl) {
            metaEl.innerHTML = `
                <span class="doc-meta-item"><strong>Category:</strong> ${doc.category}</span>
                <span class="doc-meta-item"><strong>File:</strong> ${doc.filename}</span>
                <span class="doc-meta-item"><strong>ID:</strong> ${doc.id}</span>
            `;
        }

        // Load document content
        if (contentEl) {
            contentEl.innerHTML = '<div class="loading">Loading document...</div>';

            try {
                const contentPath = `/docs/CosmOS_Content_Pack/docs/${doc.id}_${doc.filename.replace(/\//g, '__')}.md`;
                const response = await fetch(contentPath);

                if (!response.ok) {
                    throw new Error(`Failed to load document: ${response.status}`);
                }

                const markdown = await response.text();
                if (ticket !== this.docViewTicket) return; // a later document owns the viewer

                // Strip frontmatter (YAML between --- delimiters)
                let content = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');

                // Simple markdown rendering
                content = this.renderMarkdown(content);

                contentEl.innerHTML = content;
            } catch (error) {
                if (ticket !== this.docViewTicket) return;
                contentEl.innerHTML = `
                    <div class="error">
                        <strong>Error loading document</strong>
                        <p>${error.message}</p>
                        <pre>Path: /docs/CosmOS_Content_Pack/docs/${doc.id}_${doc.filename.replace(/\//g, '__')}.md</pre>
                    </div>
                `;
            }
        }

        // Update selected styling
        document.querySelectorAll('.document-item').forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.docId === doc.id) {
                item.classList.add('selected');
            }
        });
    },

    /* An annotated archived build, typeset as the postmortem it is. Every
       string here is escaped: the text is authored, but the version, path
       and ids came out of a save, and a save can be pasted in. */
    viewArchiveDocument(doc) {
        const titleEl = document.getElementById('document-title');
        const contentEl = document.getElementById('document-content');
        const metaEl = document.getElementById('document-meta');
        const esc = (v) => this.escapeHtml(v);
        if (titleEl) titleEl.innerText = doc.title;
        if (metaEl) {
            metaEl.innerHTML = `
                <span class="doc-meta-item"><strong>Category:</strong> ${esc(doc.category)}</span>
                <span class="doc-meta-item"><strong>File:</strong> ${esc(doc.filename)}</span>
                <span class="doc-meta-item"><strong>ID:</strong> ${esc(doc.id)}</span>
            `;
        }
        if (contentEl) {
            const source = RealityChannels[doc.source]?.label || doc.source;
            const notes = doc.notes.map((n) => `
                <li class="arc-note arc-${esc(n.kind)}">
                    <div class="arc-entry"><span class="arc-mark">${n.kind === 'regression' ? '!' : '\u2715'}</span>
                        ${n.kind === 'regression' ? 'REGRESSION' : `KNOWN ISSUE${n.severity ? ` (SEV-${esc(n.severity)})` : ''}`}
                        &mdash; ${esc(n.note)}.</div>
                    <blockquote class="arc-line"><span class="arc-who">NULL.OPERATOR:</span> ${esc(n.line)}</blockquote>
                </li>`).join('');
            contentEl.innerHTML = `
                <div class="arc-doc">
                    <pre class="arc-header">ARCHIVED BRANCH POSTMORTEM
REALITY v${esc(doc.version)} &middot; ${esc(source)} channel
Originally shipped: reboot ${esc(doc.level)}${doc.certified ? ` &middot; certified on ${esc(doc.certified)}` : ''}
Replayed: reboot ${esc(doc.filedOn)}
Annotated by: void_mirror.service (shadow instance)</pre>
                    ${notes ? `<ol class="arc-notes">${notes}</ol>` : `<p class="arc-clean">${esc(doc.clean)}</p>`}
                    <p class="arc-signoff">&mdash; ${esc(doc.signoff)}</p>
                </div>`;
        }
        document.querySelectorAll('.document-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.docId === doc.id);
        });
    },

    /* A handover record, typeset: his letter, then the release notes for
       the last build with their credits. Escaped throughout — the version
       comes out of a save. */
    viewEndingDocument(doc) {
        const titleEl = document.getElementById('document-title');
        const contentEl = document.getElementById('document-content');
        const metaEl = document.getElementById('document-meta');
        const esc = (v) => this.escapeHtml(v);
        if (titleEl) titleEl.innerText = doc.title;
        if (metaEl) {
            metaEl.innerHTML = `
                <span class="doc-meta-item"><strong>Category:</strong> ${esc(doc.category)}</span>
                <span class="doc-meta-item"><strong>File:</strong> ${esc(doc.filename)}</span>
                <span class="doc-meta-item"><strong>ID:</strong> ${esc(doc.id)}</span>
            `;
        }
        if (contentEl) {
            const letter = doc.letter.map((p) => `<p>${esc(p)}</p>`).join('');
            const notes = doc.release.map((entry) => `<li class="rn-line rn-${esc(entry.kind)}">
                    <span class="rn-mark">${this.releaseMarks[entry.kind] || '-'}</span>
                    <span class="rn-note">${esc(entry.note)}</span></li>`).join('');
            const credits = doc.credits.map(([role, name]) =>
                `<div class="fin-credit"><dt>${esc(role)}</dt><dd>${esc(name)}</dd></div>`).join('');
            contentEl.innerHTML = `
                <div class="arc-doc fin-doc">
                    <pre class="arc-header">SHIFT HANDOVER RECORD &middot; SCN-ADV-002
Outcome: ${esc(doc.label)}
Signed at: reboot ${esc(doc.reboot)} &middot; REALITY v${esc(doc.version)}
Title on file: ${esc(doc.endTitle)}</pre>
                    <div class="fin-letter">${letter}<p class="arc-signoff">${esc(doc.signoff)}</p></div>
                    <h3 class="fin-doc-head">Release notes &mdash; the last build of the shift</h3>
                    <ul class="rn-list">${notes}</ul>
                    <dl class="fin-roll-inner is-still">${credits}</dl>
                </div>`;
        }
        document.querySelectorAll('.document-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.docId === doc.id);
        });
    },

    renderMarkdown(markdown) {
        // Simple markdown rendering (headings, bold, italic, lists, code blocks)
        let html = markdown;

        // Code blocks
        html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

        // Lists
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Paragraphs (lines separated by blank lines)
        html = html.split('\n\n').map(para => {
            if (para.startsWith('<') || para.trim() === '') return para;
            return '<p>' + para.replace(/\n/g, '<br>') + '</p>';
        }).join('\n');

        return html;
    },

    switchDocumentCategory(category) {
        // Update category tab styling
        document.querySelectorAll('.doc-category-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        const activeTab = document.querySelector(`[data-category="${category}"]`);
        if (activeTab) activeTab.classList.add('active');

        // Re-render list
        this.renderDocumentList(category);
    },

    updatePrestigeInfo() {
        const levelEl = document.getElementById('prestige-level');
        const pointsEl = document.getElementById('divinity-points');
        const bonusEl = document.getElementById('prestige-bonus');
        const gainEl = document.getElementById('divinity-gain');
        const buttonEl = document.getElementById('prestige-button');

        if (levelEl) levelEl.innerText = this.formatNumber(State.prestigeLevel);
        if (pointsEl) pointsEl.innerText = this.formatNumber(State.totalDivinityPoints);
        if (bonusEl) bonusEl.innerText = this.formatNumber((State.divinityPointMultiplier - 1) * 100);

        // The award, channel multiplier included — this is the number the
        // reboot will actually hand over.
        const divinityGain = game.getPrestigeAward();
        if (gainEl) {
            gainEl.innerText = this.formatNumber(divinityGain);
            gainEl.closest('.prestige-gain').style.color = divinityGain > 0 ? '#4caf50' : '#666';
        }

        /* The reboot is a decision now — bank this run, or push it deeper for
           a bigger award — and a decision the player cannot see the terms of
           is not one. getSoulsUntilNextPoint has existed since the economy
           rebuild and nothing has ever rendered it. */
        const nextEl = document.getElementById('prestige-next-point');
        if (nextEl) {
            const remaining = game.getSoulsUntilNextPoint();
            const runSouls = game.getRunSouls();
            const payout = game.getPrestigeChannelPayout();
            // Cascade penalty included, or the panel promises an award the
            // reboot will not pay — the same drift getPrestigeAward() was
            // introduced to close between the panel and the channel multiplier.
            const nextAward = Math.floor(
                (game.calculateDivinityPoints() + 1) * payout * game.getCascadePenalty(),
            );
            // "banked" would be wrong here: these Souls are earned but not yet
            // cashed in, and cashing in is the decision being described.
            /* An archived replay never has a "next point" — its payout is zero
               by design — so the only number worth showing is how far it is
               from being shippable at all. */
            const replaying = State.reality?.build?.channel === 'archived';
            nextEl.innerText = replaying
                ? (game.canPrestige()
                    ? 'archived replay — ready to ship, pays no Divinity'
                    : `archived replay — ships after ${this.formatNumber(remaining)} more Souls, pays no Divinity`)
                : divinityGain > 0
                    ? `+${this.formatNumber(nextAward)} after ${this.formatNumber(remaining)} more Souls this run`
                    : `first point after ${this.formatNumber(remaining)} more Souls (${this.formatNumber(runSouls)} earned this run)`;
        }

        /* Shipping is a decision under rising pressure, so the panel that
           hosts the button has to show the pressure. */
        const stabilityEl = document.getElementById('prestige-stability');
        if (stabilityEl) {
            const cascade = game.cascadeState();
            stabilityEl.innerText = cascade.tier > 0
                ? `${cascade.label} — output ×${cascade.output}, award ${Math.round(cascade.award * 100)}%`
                : cascade.ratePerHour > 0
                    ? `nominal, degrading +${cascade.ratePerHour.toFixed(2)}/h`
                    : cascade.recovering ? 'settling' : 'nominal';
            stabilityEl.className = cascade.tier > 0 ? 'is-alarm' : '';
        }

        if (buttonEl) {
            buttonEl.disabled = !game.canPrestige();
            if (game.canPrestige()) {
                buttonEl.classList.add('prestige-ready');
            } else {
                buttonEl.classList.remove('prestige-ready');
            }
        }
    },

    // === DIVINE GLOBE FUNCTIONS ===
    selectedGlobeDimension: null,

    initGlobeCanvas() {
        const canvas = document.getElementById('globe-canvas');
        if (!canvas) return;

        this.globeCtx = canvas.getContext('2d');
        this.globeRotation = 0;
        this.globeRegions = [];

        this.startGlobeAnimation();
        if (!canvas.dataset.globeClickBound) {
            canvas.addEventListener('click', (e) => this.handleGlobeClick(e));
            canvas.dataset.globeClickBound = 'true';
        }
    },

    animateGlobe() {
        if (!this.globeCtx) return;

        const ctx = this.globeCtx;
        const canvas = ctx.canvas;

        /* Stop when the window closes. This loop re-armed unconditionally, so
           opening the Divine Globe once burned a full canvas frame budget for
           the rest of the session — window closed, tab in the background, any
           state at all. */
        if (!canvas.isConnected) {
            this.globeCtx = null;
            this.globeRafId = null;
            return;
        }
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 150;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw globe sphere
        const gradient = ctx.createRadialGradient(centerX - 30, centerY - 30, 0, centerX, centerY, radius);
        gradient.addColorStop(0, '#4a90e2');
        gradient.addColorStop(0.7, '#2c5f9e');
        gradient.addColorStop(1, '#1a3a5c');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Reset regions array
        this.globeRegions = [];

        // Draw dimension regions
        this.drawDimensionRegion(ctx, centerX, centerY - 60, 40, 'primordial', '#ffd700');
        this.drawDimensionRegion(ctx, centerX, centerY + 60, 40, 'void', '#9c27b0');

        this.globeRotation += 0.005;
        this.globeRafId = requestAnimationFrame(() => this.animateGlobe());
    },

    /* Single entry point, so reopening the window cannot start a second loop
       racing the first. */
    startGlobeAnimation() {
        if (this.globeRafId !== null && this.globeRafId !== undefined) {
            cancelAnimationFrame(this.globeRafId);
        }
        this.globeRafId = null;
        this.animateGlobe();
    },

    drawDimensionRegion(ctx, x, y, radius, dimId, color) {
        ctx.fillStyle = color;
        ctx.strokeStyle = this.selectedGlobeDimension === dimId ? '#ffffff' : color;
        ctx.lineWidth = this.selectedGlobeDimension === dimId ? 3 : 1;

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        this.globeRegions.push({ x, y, radius, dimId });
    },

    handleGlobeClick(event) {
        const canvas = event.target;
        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;

        for (const region of this.globeRegions) {
            const distance = Math.sqrt((clickX - region.x) ** 2 + (clickY - region.y) ** 2);
            if (distance <= region.radius) {
                this.selectGlobeDimension(region.dimId);
                return;
            }
        }
    },

    selectGlobeDimension(dimId) {
        this.selectedGlobeDimension = dimId;
        this.updateGlobeDisplay();
        ui.log(`Selected ${dimId} dimension on globe.`);
    },

    updateGlobeDisplay() {
        const dimId = this.selectedGlobeDimension;
        if (!dimId) return;

        const nameEl = document.getElementById('globe-dim-name');
        const assignedEl = document.getElementById('globe-prophets-assigned');
        const availableEl = document.getElementById('globe-prophets-available');
        const followersEl = document.getElementById('globe-followers');
        const adorationRateEl = document.getElementById('globe-adoration-rate');

        if (nameEl) nameEl.innerText = dimId.charAt(0).toUpperCase() + dimId.slice(1) + ' Dimension';
        if (assignedEl) assignedEl.innerText = State.prophets.assignments[dimId] || 0;
        if (availableEl) availableEl.innerText = State.prophets.available;
        if (followersEl) followersEl.innerText = Math.floor(State.followers[dimId]?.count || 0);

        const followerData = State.followers[dimId];
        const timelineAdorationBonus = State.timelines.effects[State.timelines.current].adorationBonus || 1;
        const adorationGlobalBonus = State.achievementBonuses?.globalGain || 1;
        const adorationRate = followerData ? followerData.count * followerData.adorationRate * timelineAdorationBonus * adorationGlobalBonus : 0;
        if (adorationRateEl) adorationRateEl.innerText = this.formatNumber(adorationRate, 2);

        const adorationEl = document.getElementById('val-adoration');
        const adorationRateMainEl = document.getElementById('val-adoration-rate');
        if (adorationEl) adorationEl.innerText = this.formatNumber(Math.floor(State.adoration));
        if (adorationRateMainEl) {
            let totalRate = 0;
            for (const dim in State.followers) {
                totalRate += State.followers[dim].count * State.followers[dim].adorationRate;
            }
            totalRate *= timelineAdorationBonus * adorationGlobalBonus;
            adorationRateMainEl.innerText = this.formatNumber(totalRate, 2);
        }
    },

    // === TIMELINE FUNCTIONS ===
    switchTimeline(timelineId) {
        if (!State.timelines.unlocked.includes(timelineId)) {
            ui.log('Timeline not yet unlocked.');
            return;
        }

        State.timelines.current = timelineId;

        document.querySelectorAll('.timeline-btn').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(`timeline-${timelineId}`);
        if (activeBtn) activeBtn.classList.add('active');

        ui.log(`Switched to ${timelineId} timeline.`);
    },

    // === SHOP FUNCTIONS ===
    renderShopContent(category) {
        const container = document.getElementById('shop-content');
        if (!container) return;

        container.innerHTML = '';

        const items = ShopItemList.filter(i => i.category === category);
        items.forEach(item => {
            const isPurchased = State.adorationShop[category][item.id];
            const level = item.upgradable ? (State.adorationShop[category][item.id] || 0) : 0;

            const div = document.createElement('div');
            div.className = 'shop-item';
            if (isPurchased && !item.upgradable) div.classList.add('purchased');

            div.innerHTML = `
                <div class="shop-item-name">${item.name}</div>
                <div class="shop-item-desc">${item.description}</div>
                <div class="shop-item-cost">${isPurchased && !item.upgradable ? 'PURCHASED' : `${item.cost} Adoration`}</div>
                ${item.upgradable ? `<div class="shop-item-level">Level: ${level}</div>` : ''}
            `;

            if (!isPurchased || item.upgradable) {
                div.style.cursor = 'pointer';
                div.onclick = () => game.purchaseShopItem(category, item.id);
            }

            container.appendChild(div);
        });

        const balanceEl = document.getElementById('shop-adoration');
        if (balanceEl) balanceEl.innerText = this.formatNumber(Math.floor(State.adoration));
    },

    switchShopTab(category, event) {
        document.querySelectorAll('.shop-tab').forEach(tab => tab.classList.remove('active'));
        if (event && event.target) event.target.classList.add('active');
        this.renderShopContent(category);
    },

    // === DIVINE CALLS FUNCTIONS ===
    updateDivineCallsDisplay() {
        const now = Date.now();
        const cooldownRemaining = Math.max(0, State.divineCalls.lastAnswered + State.divineCalls.cooldown - now);

        const offeringsBtn = document.getElementById('btn-convert-offerings');
        const soulsBtn = document.getElementById('btn-convert-souls');
        const offeringsCooldown = document.getElementById('cooldown-offerings');
        const soulsCooldown = document.getElementById('cooldown-souls');

        if (cooldownRemaining > 0) {
            const seconds = Math.ceil(cooldownRemaining / 1000);
            if (offeringsCooldown) offeringsCooldown.innerText = `${seconds}s`;
            if (soulsCooldown) soulsCooldown.innerText = `${seconds}s`;
            if (offeringsBtn) offeringsBtn.disabled = true;
            if (soulsBtn) soulsBtn.disabled = true;
        } else {
            if (offeringsCooldown) offeringsCooldown.innerText = 'Ready';
            if (soulsCooldown) soulsCooldown.innerText = 'Ready';
            if (offeringsBtn) offeringsBtn.disabled = false;
            if (soulsBtn) soulsBtn.disabled = false;
        }
    },

    // === TASK MANAGER FUNCTIONS ===
    getTaskManagerEndedProcesses() {
        State.taskManager = State.taskManager || {};

        // Normalize older/newer save keys into a single source of truth.
        if (!Array.isArray(State.taskManager.processesEnded)) {
            State.taskManager.processesEnded = Array.isArray(State.taskManager.endedProcesses)
                ? State.taskManager.endedProcesses
                : [];
        }

        State.taskManager.endedProcesses = State.taskManager.processesEnded;
        return State.taskManager.processesEnded;
    },

    updateTaskManagerList() {
        const tbody = document.getElementById('taskmgr-process-list');
        const countEl = document.getElementById('taskmgr-process-count');
        const cpuEl = document.getElementById('taskmgr-cpu-total');
        const memEl = document.getElementById('taskmgr-mem-total');

        if (!tbody) return;

        tbody.innerHTML = '';

        let totalCPU = 0;
        let totalMemory = 0;
        let runningCount = 0;
        const endedProcesses = this.getTaskManagerEndedProcesses();

        TaskManagerProcesses.forEach(proc => {
            const isRunning = !endedProcesses.includes(proc.name);
            if (!isRunning) return; // Don't show ended processes
            // The shadow instance does not exist until it announces itself in
            // ADV-013, and cannot be removed afterwards.
            if (proc.hiddenUntilContact && !State.adversary?.contacted) return;
            // Terminated at handover (SCN-ADV-002, the hostile ending).
            if (proc.hiddenUntilContact && game.endingWorn?.() === 'hostile') return;

            runningCount++;
            totalCPU += proc.cpu;
            /* Every entry in TaskManagerProcesses declares `mem` and `desc`;
               this read `memory` and `description`, so all 8 rows rendered
               "undefined MB" with an "undefined" description and the memory
               total was NaN. Accept either key rather than rewriting the data
               under the achievement conditions that reference it. */
            totalMemory += (proc.memory ?? proc.mem ?? 0);

            const row = document.createElement('tr');
            row.className = 'taskmgr-row';
            if (proc.critical) row.classList.add('critical-process');

            // Status styling
            let statusClass = 'status-running';
            let statusText = 'Running';
            if (proc.status === 'Not Responding') {
                statusClass = 'status-not-responding';
                statusText = 'Not Responding';
            } else if (proc.status === 'Idle') {
                statusClass = 'status-idle';
                statusText = 'Idle';
            }

            row.innerHTML = `
                <td class="process-name ${proc.critical ? 'critical-text' : ''}">${proc.name}</td>
                <td class="process-cpu">${proc.cpu}%</td>
                <td class="process-memory">${proc.memory ?? proc.mem ?? 0} MB</td>
                <td class="process-status ${statusClass}">${statusText}</td>
                <td class="process-desc">${proc.description ?? proc.desc ?? ''}</td>
                <td class="process-action">
                    ${proc.endable || proc.onAttempt ?
                        `<button class="btn-end-process" onclick="ui.endProcess('${proc.name}')">End Process</button>` :
                        '<span class="no-action">—</span>'}
                </td>
            `;

            /* Two processes declare onClick handlers that write the exact
               progress keys ACH-S-006 and ACH-S-007 read, and nothing ever
               bound them — so both Secret achievements were unreachable. */
            if (typeof proc.onClick === 'function') {
                row.classList.add('taskmgr-row-clickable');
                row.addEventListener('click', (event) => {
                    if (event.target.closest('.btn-end-process')) return;
                    proc.onClick();
                    game.checkAchievements();
                    State.save();
                });
            }

            tbody.appendChild(row);
        });

        // Update aggregate stats
        if (countEl) countEl.innerText = runningCount;
        if (cpuEl) cpuEl.innerText = totalCPU.toFixed(1) + '%';
        if (memEl) memEl.innerText = totalMemory.toFixed(0) + ' MB';

        this.incidentSignature = null;
        this.renderIncidentTriage();
    },

    /* ════════════════════════════════════════════════════════════════════
       INCIDENTS — Task Manager as the triage console.

       The logic is js/incidents.js; this only draws what Incidents.view()
       returns. Three surfaces:

         - the triage queue at the top of Task Manager, where every ticket
           shows as a process that is Not Responding, with its clock and its
           three answers;
         - an alarm lamp in the system tray and a line on the operator panel,
           so a ticket is visible without opening anything;
         - the SEV-1 dialog, which opens itself.

       Every string from a template goes through escapeHtml. None of it is
       player-authored, but `tell` lines are written the way people write —
       quotes, apostrophes — and dd40134 is what happens when that reaches an
       attribute raw.
       ════════════════════════════════════════════════════════════════════ */

    incidentsAvailable() {
        return typeof Incidents !== 'undefined' && typeof game !== 'undefined' && game.incidentsLive();
    },

    formatClock(seconds) {
        const s = Math.max(0, Math.ceil(seconds));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },

    resourceLabel(resource) {
        return resource ? resource.charAt(0).toUpperCase() + resource.slice(1) : '';
    },

    /* Called by Incidents whenever the queue changes shape. */
    onIncidentsChanged() {
        this.incidentSignature = null;
        this.updateIncidentChrome();
    },

    /* Panel tick (~10Hz). Cheap when nothing is open and Task Manager is shut. */
    updateIncidentChrome() {
        if (!this.incidentsAvailable()) return;
        const summary = Incidents.summary();

        const led = document.getElementById('tray-incident-led');
        if (led) {
            const lit = summary.open > 0;
            led.hidden = !summary.everFiled;
            led.classList.toggle('is-lit', lit);
            led.classList.toggle('is-outage', lit && summary.worst === 1 && !summary.onHold);
            led.classList.toggle('is-held', lit && summary.onHold);
            const label = lit
                ? `${summary.open} open incident${summary.open === 1 ? '' : 's'} — worst SEV-${summary.worst}${summary.onHold ? ', on hold while you are away' : ''}. Open Task Manager.`
                : 'No open incidents.';
            if (led.title !== label) {
                led.title = label;
                led.setAttribute('aria-label', label);
            }
        }

        const line = document.getElementById('operator-incidents');
        if (line) {
            line.hidden = !summary.everFiled;
            const text = summary.open > 0
                ? `${summary.open} ${summary.onHold ? 'HELD' : 'OPEN'} · WORST SEV-${summary.worst}`
                : 'QUEUE CLEAR';
            const valueEl = line.querySelector('[data-role="count"]');
            if (valueEl && valueEl.innerText !== text) valueEl.innerText = text;
            line.classList.toggle('is-alarm', summary.open > 0 && !summary.onHold);
        }

        this.renderIncidentTriage();
    },

    renderIncidentTriage() {
        const host = document.getElementById('taskmgr-incidents');
        if (!host || !this.incidentsAvailable()) return;

        const now = Date.now();
        const open = Incidents.state().open;
        const summary = Incidents.summary();
        const views = open.map((inc) => Incidents.view(inc, now));

        /* Structure re-renders only when the queue changes shape; clocks,
           prices and affordability update in place. Re-rendering at 10Hz
           would eat the click on any button the player was reaching for. */
        const signature = JSON.stringify([summary.everFiled, summary.onHold, views.map((v) => [
            v.id, v.severity, !!v.prophet, v.labour ? [v.labour.band.at, v.labour.hits] : null,
            v.artifact?.id || null, v.canProphet,
        ])]);
        if (signature !== this.incidentSignature) {
            this.incidentSignature = signature;
            host.hidden = !summary.everFiled;
            host.innerHTML = this.incidentQueueHtml(views, summary);
        }

        for (const v of views) {
            const row = host.querySelector(`[data-incident="${v.id}"]`);
            if (!row) continue;
            const clock = row.querySelector('[data-role="clock"]');
            const clockText = v.held
                ? 'On hold — clock frozen while you are away'
                : v.prophet
                ? `Prophet on site — closes in ${this.formatClock(v.prophet.remaining)}`
                : v.severity === 1
                    ? `OUTAGE — ${v.line} on backup · on-call rota contains it in ${this.formatClock(v.remaining)}`
                    : `Escalates to ${v.nextSeverity === 1 ? 'OUTAGE' : `SEV-${v.nextSeverity}`} in ${this.formatClock(v.remaining)}`;
            if (clock && clock.innerText !== clockText) clock.innerText = clockText;

            const pay = row.querySelector('[data-role="pay"]');
            if (pay) {
                const text = v.cost
                    ? `Pay ${this.formatNumber(v.cost.amount)} ${this.resourceLabel(v.cost.resource)}`
                    : 'Cannot be paid off';
                if (pay.innerText !== text) pay.innerText = text;
                const disabled = !v.cost || !v.cost.affordable;
                if (pay.disabled !== disabled) pay.disabled = disabled;
            }
        }
    },

    incidentQueueHtml(views, summary) {
        const esc = (v) => this.escapeHtml(v);
        const head = `
            <div class="incident-queue-head">
                <span class="code-stamp${views.length ? ' is-alarm' : ''}">INCIDENT QUEUE</span>
                <span class="incident-queue-count">${views.length
                    ? `${views.length} open · worst SEV-${summary.worst}`
                    : 'No open incidents. The universe is, for the moment, someone else’s problem.'}</span>
            </div>`;
        if (!views.length) return head;
        const held = summary.onHold ? `
            <p class="incident-hold-note"><span class="code-stamp">ON HOLD</span>
                You stepped away, so the queue did too: penalties lifted, clocks frozen.
                Touch anything to resume — every ticket gets at least ${Incidents.RETURN_GRACE}s back.</p>` : '';

        const rows = views.map((v) => {
            const id = esc(v.id);
            const labour = v.labour ? `
                <div class="incident-labour" data-role="labour-strip">
                    <div class="labour-track" aria-hidden="true">
                        <div class="labour-band" style="left:${(v.labour.band.at * 100).toFixed(2)}%;width:${(v.labour.band.width * 100).toFixed(2)}%"></div>
                        <div class="labour-marker" data-role="marker"></div>
                    </div>
                    <div class="labour-readout">
                        <span class="labour-pips" aria-label="${v.labour.hits} of ${v.labour.need} aligned">${
                            Array.from({ length: v.labour.need }, (_, i) => `<i class="${i < v.labour.hits ? 'is-set' : ''}"></i>`).join('')
                        }</span>
                        <button type="button" class="incident-btn labour-align" onclick="ui.incidentAction('${id}', 'align')">Align</button>
                    </div>
                    <p class="labour-hint">Align when the needle crosses the lit band. A miss costs one.</p>
                </div>` : '';

            const extra = [
                v.artifact ? `<button type="button" class="incident-btn is-sacrifice" onclick="ui.incidentAction('${id}', 'sacrifice')"
                    title="Delete ${esc(v.artifact.name)} from the Recycle Bin to close this ticket">Sacrifice ${esc(v.artifact.name)}</button>` : '',
                v.canProphet ? `<button type="button" class="incident-btn" onclick="ui.incidentAction('${id}', 'prophet')">Dispatch a Prophet</button>` : '',
            ].join('');

            return `
                <article class="incident-row sev-${v.severity}${v.prophet ? ' has-prophet' : ''}" data-incident="${id}">
                    <header class="incident-row-head">
                        <span class="code-stamp is-alarm incident-sev">SEV-${v.severity}</span>
                        <span class="incident-process">${esc(v.process)}</span>
                        <span class="incident-status">Not Responding</span>
                        <span class="incident-clock" data-role="clock"></span>
                    </header>
                    <div class="incident-title"><span class="incident-id">${id}</span> ${esc(v.title)}</div>
                    <p class="incident-desc">${esc(v.desc)}</p>
                    <p class="incident-effect">Reported impact: ${esc(v.effect)}</p>
                    ${v.prophet ? '' : `<div class="incident-actions">
                        <button type="button" class="incident-btn is-labour" onclick="ui.incidentAction('${id}', 'labour')"
                            ${v.labour ? 'disabled' : ''}>${esc(v.labourVerb)}</button>
                        <button type="button" class="incident-btn" data-role="pay" onclick="ui.incidentAction('${id}', 'resources')"></button>
                        <button type="button" class="incident-btn is-debt" onclick="ui.incidentAction('${id}', 'debt')"
                            title="Close the ticket now. The penalty stays until this build ships.">Defer — ${esc(v.debt)} this build</button>
                        ${extra}
                    </div>`}
                    ${labour}
                </article>`;
        }).join('');

        return `${head}${held}
            <p class="incident-queue-note">Unhandled tickets escalate while you are on shift. Tickets raised in error close themselves.
                Telemetry is not always telling the truth. A hands-on fix pays Overclock charge.</p>
            ${rows}`;
    },

    /* Per frame, and only while a ritual is in progress: the needle has to
       move smoothly or the timing is a guess. One style write per strip. */
    animateIncidentLabour() {
        if (!this.incidentsAvailable()) return;
        const open = Incidents.state().open;
        if (!open.some((inc) => inc.labour)) return;
        const now = Date.now();
        for (const inc of open) {
            if (!inc.labour) continue;
            const marker = document.querySelector(`[data-incident="${inc.id}"] [data-role="marker"]`);
            if (marker) marker.style.left = `${(Incidents.labourMarker(inc, now) * 100).toFixed(2)}%`;
        }
    },

    /* Every incident button lands here, from the queue or from the SEV-1
       dialog. `fromDialog` closes the dialog first; labour then needs the
       console, so it opens Task Manager on the ticket. */
    incidentAction(id, action, fromDialog = false) {
        if (!this.incidentsAvailable()) return;
        if (fromDialog) this.dismissSystemModal();
        const now = Date.now();
        let ok = false;
        switch (action) {
            case 'labour':
                ok = !!Incidents.beginLabour(id, now);
                if (fromDialog || !system.windows?.taskmgr) system.openApp('taskmgr');
                break;
            case 'align': {
                const result = Incidents.labourPulse(id, now);
                ok = !result.ignored;
                const row = document.querySelector(`[data-incident="${id}"] .labour-track`);
                if (row && !result.ignored && !result.done) {
                    row.classList.remove('is-hit', 'is-miss');
                    void row.offsetWidth;   // restart the flash
                    row.classList.add(result.hit ? 'is-hit' : 'is-miss');
                }
                break;
            }
            case 'resources': ok = Incidents.payResources(id, now); break;
            case 'debt': ok = Incidents.defer(id, now); break;
            case 'sacrifice': ok = Incidents.sacrifice(id, null, now); break;
            case 'prophet': ok = Incidents.dispatchProphet(id); break;
            default: return;
        }
        if (ok) {
            this.incidentSignature = null;
            this.renderIncidentTriage();
            this.updateIncidentChrome();
            State.save();
        }
        // Keep the keyboard on the instrument: re-rendering replaced it.
        if (action === 'labour' || action === 'align') {
            document.querySelector(`[data-incident="${id}"] .labour-align`)?.focus({ preventScroll: true });
        }
    },

    /* The OS opens a window you did not ask for. Same contract as
       showCascadeAlert: refuses to paint over an open modal and SAYS so, so
       Incidents.announce() can retry it on the next tick instead of
       recording an outage nobody was told about. */
    showIncidentAlert(view) {
        const layer = document.getElementById('system-modal-layer');
        if (!layer || layer.classList.contains('active') || !view) return false;
        const esc = (v) => this.escapeHtml(v);
        const id = esc(view.id);
        const pay = view.cost
            ? `<button class="dialog-secondary" type="button" onclick="ui.incidentAction('${id}', 'resources', true)"
                   ${view.cost.affordable ? '' : 'disabled'}>Pay ${this.formatNumber(view.cost.amount)} ${this.resourceLabel(view.cost.resource)}</button>`
            : '';
        const sacrifice = view.artifact
            ? `<button class="dialog-secondary" type="button" onclick="ui.incidentAction('${id}', 'sacrifice', true)">Sacrifice ${esc(view.artifact.name)}</button>`
            : '';

        layer.innerHTML = `
            <section class="system-dialog incident-alert" role="alertdialog" aria-modal="true" aria-labelledby="incident-alert-title">
                <div class="system-dialog-titlebar">
                    <span>SYSTEM &mdash; UNSOLICITED</span>
                    <button type="button" onclick="ui.dismissSystemModal()" aria-label="Acknowledge">X</button>
                </div>
                <div class="incident-alert-body">
                    <div class="incident-alert-stamps">
                        <span class="code-stamp is-alarm">SEV-1 OUTAGE</span>
                        <span class="incident-alert-id">${id} &middot; ${esc(view.process)} &middot; Not Responding</span>
                    </div>
                    <h2 id="incident-alert-title">${esc(view.title)}</h2>
                    <p>${esc(view.desc)}</p>
                    <p class="incident-alert-impact">The <strong>${esc(view.line)}</strong> is running on backup at ${Math.round(Incidents.OUTAGE_SCALE * 100)}% until this is resolved.
                        Reported impact: ${esc(view.effect)}.</p>
                    <p class="incident-alert-advice">Stabilise it by hand, pay it off, or defer it and carry
                        <strong>${esc(view.debt)}</strong> until this build ships.</p>
                </div>
                <div class="system-dialog-actions incident-alert-actions">
                    <button class="dialog-secondary" type="button" onclick="ui.dismissSystemModal()">Later</button>
                    <button class="dialog-secondary" type="button" onclick="ui.incidentAction('${id}', 'debt', true)">Defer</button>
                    ${sacrifice}
                    ${pay}
                    <button class="dialog-primary" type="button" onclick="ui.incidentAction('${id}', 'labour', true)">${esc(view.labourVerb)}</button>
                </div>
            </section>
        `;
        layer.classList.add('active');
        // V7: the alarm lamp in a monitor strip, when installed. Never awaited.
        if (typeof media !== 'undefined') media.attachLoop?.(layer.querySelector('.incident-alert-body'), 'sev1-alarm');
        return true;
    },

    endProcess(processName) {
        const process = TaskManagerProcesses.find(p => p.name === processName);
        if (!process) return;
        const endedProcesses = this.getTaskManagerEndedProcesses();
        State.achievementProgress.taskmgr_actions = (State.achievementProgress.taskmgr_actions || 0) + 1;

        // Check if already ended
        if (endedProcesses.includes(processName)) {
            ui.log('Process already terminated.');
            return;
        }

        // If not endable but has onAttempt callback
        if (!process.endable && process.onAttempt) {
            process.onAttempt();
            ui.updateTaskManagerList();
            return;
        }

        // If endable
        if (process.endable) {
            endedProcesses.push(processName);

            // Track for achievement ACH-011 (End 10 processes)
            State.achievementProgress.processes_ended = (State.achievementProgress.processes_ended || 0) + 1;

            // Call onEnd callback if exists
            if (process.onEnd) {
                process.onEnd();
            }

            ui.log(`Process "${processName}" terminated.`);
            ui.updateTaskManagerList();
            game.checkAchievements();
        } else {
            ui.log('This process cannot be terminated.');
        }
    },

    // === RECYCLE BIN FUNCTIONS ===
    updateRecycleBinList() {
        const container = document.getElementById('recyclebin-item-list');
        const countEl = document.getElementById('recyclebin-item-count');
        const valueEl = document.getElementById('recyclebin-total-value');

        if (!container) return;

        const items = State.recycleBin.items || [];

        // Update stats
        if (countEl) countEl.innerText = items.length;
        if (valueEl) valueEl.innerText = State.recycleBin.sacrifices.totalValue || 0;

        // If empty, show empty state
        if (items.length === 0) {
            container.innerHTML = `
                <div class="recyclebin-empty-state">
                    <div class="empty-icon"><img src="assets/icons/recyclebin_96.png" alt=""></div>
                    <p>Recycle Bin is empty</p>
                    <small>Deleted items will appear here. You can restore or permanently delete them.</small>
                </div>
            `;
            return;
        }

        // Render items
        container.innerHTML = '';
        items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'recyclebin-item';
            if (item.type === 'patch') {
                itemDiv.classList.add('item-patch');
                // "PATCH_NULL_RESTORE.pkg — size: 0 bytes. Impact:
                // immeasurable." (ADV-L-14) needs somewhere to fire from.
                itemDiv.addEventListener('mouseenter', () => game.triggerAdversaryBark('hover_patch_file'));
            }
            if (item.type === 'achievement') itemDiv.classList.add('item-achievement');
            if (item.incidentArtifact) itemDiv.classList.add('item-artifact');

            const icon = this.getRecycleBinItemIcon(item.type);

            itemDiv.innerHTML = `
                <div class="item-icon">${icon}</div>
                <div class="item-info">
                    <div class="item-name">${this.escapeHtml(item.name)}</div>
                    <div class="item-desc">${this.escapeHtml(item.description || '')}</div>
                    <div class="item-meta">
                        <span class="item-type">${item.type}</span>
                        ${item.sacrificeValue ? `<span class="item-value">Value: ${item.sacrificeValue}</span>` : ''}
                    </div>
                </div>
                <div class="item-actions">
                    ${item.incidentArtifact ? this.artifactActionsHtml(item) : ''}
                    ${item.incidentArtifact ? '' : item.type === 'patch' ?
                        `<button class="btn-execute-patch" onclick="ui.executeAdversaryPatch('${item.id}')">Execute</button>` :
                        ''}
                    ${item.incidentArtifact ? '' : item.deletable !== false ?
                        `<button class="btn-restore" onclick="ui.restoreItem('${item.id}')">Restore</button>
                         <button class="btn-delete-permanent" onclick="ui.deleteItemPermanently('${item.id}')">Delete</button>
                         ${item.sacrificeValue ? `<button class="btn-sacrifice" onclick="ui.sacrificeItem('${item.id}')">Sacrifice</button>` : ''}` :
                        '<span class="no-action">Cannot restore</span>'}
                </div>
            `;

            container.appendChild(itemDiv);
        });
    },

    /* An incident artifact cannot be restored — there is nowhere to restore
       a superseded module or a quarantined false alarm TO — so it offers the
       one thing it is for, and deletion. */
    artifactActionsHtml(item) {
        const id = this.escapeHtml(item.id);
        const target = this.incidentsAvailable()
            ? [...Incidents.state().open].sort((a, b) => a.severity - b.severity)[0]
            : null;
        const feed = target
            ? `<button class="btn-sacrifice" onclick="ui.feedArtifact('${id}')">Sacrifice to ${this.escapeHtml(target.id)}</button>`
            : '<span class="no-action">No open incident</span>';
        return `${feed}<button class="btn-delete-permanent" onclick="ui.deleteItemPermanently('${id}')">Delete</button>`;
    },

    feedArtifact(itemId) {
        if (!this.incidentsAvailable()) return;
        const target = [...Incidents.state().open].sort((a, b) => a.severity - b.severity)[0];
        if (!target) return;
        if (Incidents.sacrifice(target.id, itemId)) {
            this.updateRecycleBinList();
            this.onIncidentsChanged();
            State.save();
        }
    },

    getRecycleBinItemIcon(type) {
        return this.codeStamp(this.binCodes[type] || this.binCodes.other);
    },

    restoreItem(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item) return;

        if (item.deletable === false) {
            ui.log('This item cannot be restored.');
            return;
        }

        // Call restore callback if exists
        if (item.onRestore) {
            item.onRestore();
        }

        // Remove from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log(`Restored: ${item.name}`);
        ui.updateRecycleBinList();
        State.save();
    },

    deleteItemPermanently(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item) return;

        /* restoreItem honours `deletable === false`; this did not. The Delete
           button is only rendered for deletable items, so it was reachable
           only from the console — but "unreachable so it does not matter" is
           exactly the reasoning that left the patch path rotting for a year,
           and the Adversary's two files depend on being undeletable. */
        if (item.deletable === false) {
            ui.log('[BLOCKED] This item is not owned by this session.');
            return;
        }

        // Confirmation for special items
        if (item.type === 'achievement' || item.type === 'patch') {
            if (!confirm(`Are you sure you want to permanently delete "${item.name}"? This action cannot be undone.`)) {
                return;
            }
        }

        // Call delete callback if exists
        if (item.onDelete) {
            item.onDelete();
        }

        // Track for achievements
        if (item.type === 'achievement') {
            State.achievementProgress.delete_achievement_from_recyclebin = (State.achievementProgress.delete_achievement_from_recyclebin || 0) + 1;
        }

        // Remove from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log(`Permanently deleted: ${item.name}`);
        ui.updateRecycleBinList();
        game.checkAchievements();
        State.save();
    },

    sacrificeItem(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item || !item.sacrificeValue) return;

        if (!confirm(`Sacrifice "${item.name}" for +${item.sacrificeValue}% permanent bonus to all production? This is permanent and cannot be undone.`)) {
            return;
        }

        // Apply sacrifice bonus
        const bonusMultiplier = 1 + (item.sacrificeValue / 100);
        State.achievementBonuses.globalGain = (State.achievementBonuses.globalGain || 1) * bonusMultiplier;

        // Update sacrifice stats
        State.recycleBin.sacrifices.totalValue += item.sacrificeValue;
        State.recycleBin.sacrifices.count += 1;

        // Track for achievements
        State.achievementProgress.resources_sacrificed = (State.achievementProgress.resources_sacrificed || 0) + 1;

        // Remove from bin
        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log(`Sacrificed ${item.name}. +${item.sacrificeValue}% to all production (permanent).`);
        ui.screenPulse('rgba(138, 43, 226, 0.3)');
        ui.updateRecycleBinList();
        game.checkAchievements();
        State.save();
    },

    emptyRecycleBin() {
        /* Honours `deletable === false`, as restoreItem and
           deleteItemPermanently do. This truncated the array outright, which
           destroyed the Adversary's two undeletable files — the patch and the
           audit log — through the one door that never checked. */
        const doomed = State.recycleBin.items.filter((i) => i.deletable !== false);
        const kept = State.recycleBin.items.filter((i) => i.deletable === false);

        if (doomed.length === 0) {
            ui.log(State.recycleBin.items.length === 0
                ? 'Recycle Bin is already empty.'
                : '[BLOCKED] Nothing here is owned by this session.');
            return;
        }

        if (!confirm(`Are you sure you want to permanently delete all ${doomed.length} items? This cannot be undone.`)) {
            return;
        }

        doomed.forEach((item) => { if (item.onDelete) item.onDelete(); });
        State.recycleBin.items = kept;

        ui.log(kept.length
            ? `Recycle Bin emptied. ${kept.length} item(s) could not be removed.`
            : 'Recycle Bin emptied.');
        ui.updateRecycleBinList();
        State.save();
    },

    /* ADV-026: "Run it when you're ready to stop pretending resets are
       kindness." The patch is about continuity across reboots, so that is what
       it buys — and it charges for it, because he sells repairs, not comfort.

       Both effects are DECLARED modifiers at `scope: 'permanent'`, so they
       survive Divine Reboot through the registry rather than by being re-
       applied in performPrestige's grant loop. Nothing here is reachable from
       the simulator or any test horizon: it needs a click and a confirm. */
    executeAdversaryPatch(itemId) {
        const item = State.recycleBin.items.find(i => i.id === itemId);
        if (!item || item.type !== 'patch') return;
        if (State.adversary.patchExecuted) return;

        if (!confirm('Execute "PATCH_NULL_RESTORE.pkg"?\n\n' +
            'Reboots will carry 25% more Divinity forward.\n' +
            'Praise throughput drops 10%, permanently.\n\n' +
            'This cannot be undone, and he will know.')) {
            return;
        }

        State.adversary.patchExecuted = true;
        State.adversary.patchInRecycleBin = false;
        State.achievementProgress.execute_adversary_patch = true;

        Modifiers.add({
            id: 'adversary_patch_continuity',
            target: 'souls.multiplier',
            op: 'mul',
            value: 1.25,
            scope: 'permanent',
            source: 'adversary_patch',
            label: 'PATCH_NULL_RESTORE — continuity restored',
        });
        Modifiers.add({
            id: 'adversary_patch_toll',
            target: 'praise.multiplier',
            op: 'mul',
            value: 0.9,
            scope: 'permanent',
            source: 'adversary_patch',
            label: 'PATCH_NULL_RESTORE — throughput toll',
        });
        Modifiers.commit(Date.now());

        // Consenting to his repair moves the relationship hard, which is the
        // largest single nudge in the game.
        game.nudgeAdversaryStanding(5, 'executed the patch', { exempt: true }); // once ever

        State.recycleBin.items = State.recycleBin.items.filter(i => i.id !== itemId);

        ui.log('[SYSTEM] Patch executed. Reality parameters updated.');
        ui.log('[ADVERSARY] "Good. Now we can begin the real work."');
        ui.screenPulse('rgba(138, 43, 226, 0.5)');

        game.unlockDocument('DOC-NEW-14');
        ui.updateRecycleBinList();
        game.checkAchievements();
        State.save();
    },

    // === CASINO HOST BARK DISPLAY ===
    /* Fate speaks from the dealer strip inside Patience.exe
       (PatienceView.speak), never as a toast: this used to append a sliding
       notification to <body> per line, with the line in innerHTML unescaped.
       The one line that can arrive with the table shut is her parting line
       (casino_exit, after the window is gone); it goes to the engine log,
       which writes innerText. */
    displayHostBark(bark) {
        if (!bark) return;
        if (typeof PatienceView !== 'undefined' && PatienceView.speak(bark)) return;
        this.log(`[Patience.exe] The house: \u201c${bark.text}\u201d`);
    },

    // === SETTINGS FUNCTIONS ===
    updateSettingsUI() {
        // Set notation mode dropdown
        const notationSelect = document.getElementById('notation-mode');
        if (notationSelect) {
            notationSelect.value = State.settings.notationMode || 'suffix';
        }

        // Set autosave interval dropdown
        const autosaveSelect = document.getElementById('autosave-interval');
        if (autosaveSelect) {
            autosaveSelect.value = String(State.settings.autosaveInterval || 30000);
        }

        // Set performance mode checkbox
        const perfCheckbox = document.getElementById('performance-mode');
        if (perfCheckbox) {
            perfCheckbox.checked = State.settings.performanceMode || false;
        }

        if (typeof audio !== 'undefined') audio.syncSettingsUI();
        if (typeof media !== 'undefined') media.syncSettingsUI();
    },

    updateNotationMode(mode) {
        State.settings.notationMode = mode;
        State.save();
        ui.log(`Notation mode changed to ${mode === 'suffix' ? 'Suffix' : 'Scientific'}`);
        // Every readout changes format at once — bypass the panel cadence.
        ui.refreshAll();
    },

    updateAutosaveInterval(interval) {
        State.settings.autosaveInterval = parseInt(interval);
        State.save();

        // Restart autosave with new interval
        if (typeof setupAutosave === 'function') {
            setupAutosave();
        }

        const seconds = parseInt(interval) / 1000;
        ui.log(`Autosave interval changed to ${seconds}s`);
    },

    togglePerformanceMode(enabled) {
        State.settings.performanceMode = enabled;
        State.save();

        // Apply performance mode to body class for CSS control
        if (enabled) {
            document.body.classList.add('performance-mode');
            ui.log('Performance mode enabled (reduced animations)');
        } else {
            document.body.classList.remove('performance-mode');
            ui.log('Performance mode disabled (full animations)');
        }
    }
};

// Update upgrade affordability styling every second (lightweight)
setInterval(() => {
    ui.updateUpgradesAffordability();
    ui.updateDesktopIcons();
}, 1000);
