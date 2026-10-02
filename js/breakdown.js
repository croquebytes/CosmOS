/* ════════════════════════════════════════════════════════════════════════
   The production breakdown — "where does this number come from?"

   DESIGN_DIRECTION §5.1. Hover, focus or tap any rate or storage readout and
   the Sacred OS files a provenance sheet for it: base, every multiplier with
   its source and rank, the additive bonuses, transients, the cascade
   throttle, the draw, and a final line that is the number on screen.

   The arithmetic is not here. game.explainProductionRate and game.explainCap
   are recordings of the fold the game itself runs (see computeProduction),
   held to it by tests/breakdown.mjs. This file only arranges those steps for
   reading:

   - Rates are GROUPED BY SOURCE KIND. A global multiplier fold is pure `mul`,
     so its records can be regrouped (all upgrades together, the throttle
     lifted into its own section) without changing what they multiply to.
     The running column is the product in display order; the final line is
     the game's own value, never the panel's running product, so the two
     cannot disagree by more than a last-digit rounding that formatNumber
     never shows.
   - Caps are shown IN FOLD ORDER. They mix `mulfloor` and `add`, where order
     changes the answer by thousands (see Modifiers.reconcileScope), so
     regrouping them would show a sum that does not add up.

   Cost: nothing is computed or rendered while the panel is closed. While it
   is open it refreshes at 4Hz on its own timer, not on ui.update()'s 10Hz
   panel tick and never per frame (§3.3).
   ════════════════════════════════════════════════════════════════════════ */
const Breakdown = {
    REFRESH_MS: 250,
    CLOSE_DELAY_MS: 140,
    GUTTER: 16,

    panel: null,
    anchor: null,
    spec: null,
    pinned: false,
    timer: null,
    closeTimer: null,

    RESOURCE_LABELS: {
        praise: 'Praise', offerings: 'Offerings', souls: 'Souls',
        darkness: 'Darkness', shadows: 'Shadows', echoes: 'Echoes',
    },

    SECTIONS: [
        ['base', 'Base'],
        ['multiplier', 'Multipliers'],
        ['additive', 'Additive bonuses'],
        ['transient', 'Transient effects'],
        ['throttle', 'Cascade throttle'],
        ['draw', 'Draw'],
    ],

    // Global multiplier targets — the folds that carry mandates, builds and
    // the cascade, and the only ones regrouped by source kind.
    LIFTED_TARGETS: new Set([
        'praise.multiplier', 'offerings.multiplier', 'souls.multiplier',
        'void.darkness.multiplier', 'void.shadow.multiplier', 'void.echo.multiplier',
    ]),

    install() {
        if (this.installed || typeof document === 'undefined') return;
        this.installed = true;
        document.addEventListener('pointerover', (e) => this.onPointerOver(e));
        document.addEventListener('pointerout', (e) => this.onPointerOut(e));
        document.addEventListener('focusin', (e) => this.onFocusIn(e));
        document.addEventListener('focusout', (e) => this.onFocusOut(e));
        document.addEventListener('click', (e) => this.onClick(e));
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('resize', () => this.position());
        // Capture: a scrolling window body moves the anchor without moving
        // the page.
        document.addEventListener('scroll', (e) => {
            if (this.panel && e.target === this.panel) return;
            this.position();
        }, true);
    },

    /* ── Triggers ──────────────────────────────────────────────────────── */

    triggerOf(node) {
        return node && node.closest ? node.closest('[data-breakdown]') : null;
    },

    parseSpec(trigger) {
        const [kind, resource, focus] = String(trigger.dataset.breakdown || '').split(':');
        return { key: trigger.dataset.breakdown, kind, resource, focus: focus || null };
    },

    isHoverPointer(e) {
        // Touch is handled by click alone: a tap fires pointerover too, and
        // treating it as a hover would open and immediately re-toggle.
        return e.pointerType === 'mouse' || e.pointerType === 'pen';
    },

    onPointerOver(e) {
        if (!this.isHoverPointer(e)) return;
        const trigger = this.triggerOf(e.target);
        if (trigger) {
            clearTimeout(this.closeTimer);
            if (trigger !== this.anchor && !this.pinned) this.open(trigger);
            return;
        }
        if (this.panel && this.panel.contains(e.target)) clearTimeout(this.closeTimer);
    },

    onPointerOut(e) {
        if (!this.isHoverPointer(e) || this.pinned || !this.anchor) return;
        const to = e.relatedTarget;
        if (to && (this.anchor.contains(to) || (this.panel && this.panel.contains(to)))) return;
        const from = e.target;
        if (this.anchor.contains(from) || (this.panel && this.panel.contains(from))) this.scheduleClose();
    },

    onFocusIn(e) {
        if (this.restoringFocus) return;
        const trigger = this.triggerOf(e.target);
        if (trigger && trigger !== this.anchor) {
            this.pinned = false;
            this.open(trigger);
        }
    },

    onFocusOut(e) {
        if (this.pinned || !this.anchor || !this.anchor.contains(e.target)) return;
        if (e.relatedTarget && this.panel && this.panel.contains(e.relatedTarget)) return;
        if (this.anchor.matches(':hover')) return;
        this.scheduleClose();
    },

    onClick(e) {
        if (this.panel && this.panel.contains(e.target)) {
            if (e.target.closest('[data-breakdown-close]')) this.close({ restoreFocus: true });
            return;
        }
        const trigger = this.triggerOf(e.target);
        if (trigger) {
            // A tap, or a click to keep the sheet up while the pointer moves
            // away. A second click on the same pinned trigger puts it away.
            if (trigger === this.anchor && this.pinned) {
                this.close();
            } else {
                if (trigger !== this.anchor) this.open(trigger);
                this.pinned = true;
                this.panel?.classList.add('is-pinned');
            }
            return;
        }
        if (this.anchor) this.close();
    },

    onKeyDown(e) {
        if (!this.anchor) return;
        /* Escape is also the desktop's close-window key, and Space fires a
           Miracle (system.initKeyboardShortcuts). With a sheet open, these
           keys belong to the sheet: dismissing a tooltip must not close the
           Engine underneath it. Both listeners sit on document and this one
           is installed first (script load precedes window.onload), so
           stopImmediatePropagation is enough. */
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.close({ restoreFocus: true });
            return;
        }
        const trigger = this.triggerOf(e.target);
        if (trigger === this.anchor && (e.key === 'Enter' || e.key === ' ') && trigger.tagName !== 'BUTTON') {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.pinned = !this.pinned;
            this.panel?.classList.toggle('is-pinned', this.pinned);
        }
    },

    scheduleClose() {
        clearTimeout(this.closeTimer);
        this.closeTimer = setTimeout(() => this.close(), this.CLOSE_DELAY_MS);
    },

    /* ── Lifecycle ─────────────────────────────────────────────────────── */

    ensurePanel() {
        if (this.panel && this.panel.isConnected) return this.panel;
        const panel = document.createElement('div');
        panel.id = 'breakdown-panel';
        panel.className = 'breakdown-panel';
        panel.setAttribute('role', 'tooltip');
        panel.hidden = true;
        document.body.appendChild(panel);
        this.panel = panel;
        return panel;
    },

    open(trigger) {
        clearTimeout(this.closeTimer);
        if (this.anchor && this.anchor !== trigger) this.anchor.removeAttribute('aria-describedby');
        this.anchor = trigger;
        this.spec = this.parseSpec(trigger);
        this.pinned = false;
        const panel = this.ensurePanel();
        panel.classList.remove('is-pinned');
        panel.hidden = false;
        trigger.setAttribute('aria-describedby', panel.id);
        this.refresh(true);
        clearInterval(this.timer);
        this.timer = setInterval(() => this.refresh(false), this.REFRESH_MS);
    },

    close({ restoreFocus = false } = {}) {
        clearTimeout(this.closeTimer);
        clearInterval(this.timer);
        this.timer = null;
        const anchor = this.anchor;
        if (anchor) anchor.removeAttribute('aria-describedby');
        this.anchor = null;
        this.spec = null;
        this.pinned = false;
        if (this.panel) {
            this.panel.hidden = true;
            this.panel.classList.remove('is-pinned');
            this.panel.innerHTML = '';
        }
        if (restoreFocus && anchor && anchor.isConnected && anchor.focus) {
            // Handing focus back must not read as a fresh focus and reopen
            // the sheet that was just put away.
            this.restoringFocus = true;
            try { anchor.focus({ preventScroll: true }); } finally { this.restoringFocus = false; }
        }
    },

    /* An anchor can be replaced under the panel — a dimension re-render, a
       window closed. Re-acquire the same readout if it still exists and is
       visible; otherwise there is nothing left to explain. */
    liveAnchor() {
        const visible = (el) => el && el.isConnected && el.getClientRects().length > 0;
        if (visible(this.anchor)) return this.anchor;
        const replacement = Array.from(document.querySelectorAll('[data-breakdown]'))
            .find((el) => el.dataset.breakdown === this.spec?.key && visible(el));
        if (!replacement) return null;
        this.anchor = replacement;
        replacement.setAttribute('aria-describedby', this.panel.id);
        return replacement;
    },

    refresh(first) {
        if (!this.anchor || !this.spec) return;
        if (!this.liveAnchor()) {
            this.close();
            return;
        }
        let sheet;
        try {
            sheet = this.spec.kind === 'cap' ? this.renderCap(this.spec) : this.renderRate(this.spec);
        } catch (error) {
            // A panel that throws on the 4Hz timer would spam the console
            // forever; fail closed, once.
            console.error('Breakdown failed to render', error);
            this.close();
            return;
        }
        if (!sheet) {
            this.close();
            return;
        }
        this.paint(sheet, first);
        this.position();
        if (first && this.spec.focus === 'throttle') {
            // Bring the throttle section up under the titlebar. Scrolled by
            // hand rather than scrollIntoView, which would also scroll the
            // window body behind a fixed sheet.
            const section = this.panel.querySelector('tr.bd-section.is-focus');
            const bar = this.panel.querySelector('.bd-titlebar');
            if (section && bar) {
                const offset = section.getBoundingClientRect().top - this.panel.getBoundingClientRect().top;
                this.panel.scrollTop += offset - bar.offsetHeight - 4;
            }
        }
    },

    /* Position-aware: below the readout if it fits, above if that fits
       better, and never past a 16px gutter on any side. On a phone held
       upright neither may fit, so the sheet takes the larger side and
       scrolls inside itself rather than clipping. */
    position() {
        const panel = this.panel;
        if (!panel || panel.hidden || !this.anchor) return;
        const rect = this.anchor.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const g = this.GUTTER;
        const gap = 6;

        /* scrollHeight is the content's height whatever max-height is in
           force. Clearing max-height to measure would re-lay the sheet out
           unclipped and snap its scroll position to the top on every 4Hz
           refresh — and on every scroll inside it. */
        const width = panel.offsetWidth;
        const natural = panel.scrollHeight + (panel.offsetHeight - panel.clientHeight); // + borders
        const below = vh - rect.bottom - gap - g;
        const above = rect.top - gap - g;

        let top;
        let maxHeight;
        if (natural <= below) {
            top = rect.bottom + gap;
        } else if (natural <= above) {
            top = rect.top - gap - natural;
        } else if (Math.max(below, above) >= 180) {
            maxHeight = Math.max(below, above);
            top = below >= above ? rect.bottom + gap : g;
        } else {
            maxHeight = vh - 2 * g;
            top = g;
        }
        panel.style.maxHeight = maxHeight !== undefined ? `${Math.floor(maxHeight)}px` : '';

        const centred = rect.left + rect.width / 2 - width / 2;
        const left = Math.min(Math.max(g, centred), Math.max(g, vw - width - g));
        panel.style.left = `${Math.round(left)}px`;
        panel.style.top = `${Math.round(Math.max(g, top))}px`;
    },

    /* ── Formatting ────────────────────────────────────────────────────── */

    esc(value) {
        return ui.escapeHtml(value);
    },

    num(value, decimals = 1) {
        if (!Number.isFinite(value)) return String(value);
        // formatNumber only scales positive values; keep the sign outside it
        // so a negative running total still reads in the player's notation.
        return (value < 0 ? '−' : '') + ui.formatNumber(Math.abs(value), decimals);
    },

    factor(value) {
        if (!Number.isFinite(value)) return `×${value}`;
        if (value >= 1000) return `×${ui.formatNumber(value, 2)}`;
        // A lapsed mandate is ×1.004; two decimals would print it as ×1.00
        // and the residue would look like nothing at all.
        const fine = value !== 1 && (Math.abs(value - 1) < 0.01 || value < 0.01);
        return `×${ui.formatNumber(value, fine ? 4 : 2)}`;
    },

    opText(op, value) {
        switch (op) {
            case 'add': return `${value < 0 ? '−' : '+'}${ui.formatNumber(Math.abs(value), 0)}`;
            case 'sub': return `−${ui.formatNumber(value, 1)}`;
            case 'mulfloor': return `${this.factor(value)}⌊⌋`;
            case 'set': return `= ${ui.formatNumber(value, 2)}`;
            case 'max': return `≥ ${ui.formatNumber(value, 0)}`;
            case 'min': return `≤ ${ui.formatNumber(value, 0)}`;
            case 'base': return ui.formatNumber(value, value < 10 && value !== Math.floor(value) ? 2 : 0);
            default: return this.factor(value);
        }
    },

    stamp(text, tone = '') {
        return `<span class="code-stamp bd-stamp${tone ? ` ${tone}` : ''}">${this.esc(text)}</span>`;
    },

    /* What kind of thing put a registry record there, as a filing stamp. */
    recordStamp(step) {
        switch (step.kind) {
            case 'divinity': return this.stamp('Divinity');
            case 'upgrade': return this.stamp('Upgrade');
            case 'mandate': return step.status === 'full'
                ? this.stamp('Full', 'is-live')
                : this.stamp('Residue', 'is-residue');
            case 'repeatable': return this.stamp(`Rank ${step.rank ?? '?'}`);
            case 'build': return step.entryKind === 'issue'
                ? this.stamp(`SEV-${step.severity || 3}`, 'is-alarm')
                : this.stamp('Build');
            case 'scar': return this.stamp('On file', 'is-alarm');
            case 'ending': return this.stamp('Handover', 'is-live');
            case 'cascade': return this.stamp('Throttle', 'is-alarm');
            case 'floor': return this.stamp('Floor');
            case 'base': return '';
            default: return this.stamp(String(step.kind || 'Other').replace(/_/g, ' '));
        }
    },

    recordLabel(step) {
        const label = String(step.label || '');
        if (step.kind === 'build') return label.split('.')[0];
        if (step.kind === 'mandate') return label.replace(/ \(lapsed\)$/, '');
        return label;
    },

    /* ── Rate model ────────────────────────────────────────────────────── */

    /* Flattens the nested explanation into sections of groups. Each group
       is one row with a factor and a running total; its items (if more than
       one) are listed under it without a running total of their own. */
    rateModel(ex) {
        const sections = new Map(this.SECTIONS.map(([key]) => [key, new Map()]));
        let neutral = 0;
        const group = (section, key, title, extra = {}) => {
            const bucket = sections.get(section);
            if (!bucket.has(key)) bucket.set(key, { title, op: 'mul', value: 1, items: [], ...extra });
            return bucket.get(key);
        };
        const addItem = (g, item) => {
            g.items.push(item);
            if (g.op === 'mul') g.value *= item.value;
        };

        const liftRegistry = (step) => {
            const target = step.key.slice('target:'.length);
            const children = step.children || [];
            const pureMul = children.slice(1).every((c) => c.op === 'mul');
            const section = this.LIFTED_TARGETS.has(target) ? 'multiplier' : 'base';
            if (section === 'base' || !pureMul || step.value !== step.fold) {
                // Shown whole: an output target, or a fold that cannot be
                // regrouped without changing its answer.
                const g = group(section, step.key, step.label, { value: step.value, op: 'fixed' });
                g.items = children.filter((c) => c.op !== 'base' || c.value !== 1).map((c) => ({
                    label: c.op === 'base' ? `${step.label} — base` : this.recordLabel(c),
                    stamp: this.recordStamp(c),
                    text: c.op === 'base' ? this.factor(c.value) : this.opText(c.op, c.value),
                }));
                if (step.value !== step.fold) g.note = `fold is ${this.num(step.fold, 2)}; the game reads it as 1`;
                return;
            }
            for (const child of children) {
                if (child.op === 'base') {
                    if (child.value === 1) continue;
                    addItem(group('multiplier', 'divinity', 'Divinity carried forward'),
                        { label: 'Divinity carried forward', stamp: this.recordStamp(child), value: child.value });
                    continue;
                }
                const item = { label: this.recordLabel(child), stamp: this.recordStamp(child), value: child.value };
                switch (child.kind) {
                    case 'cascade':
                        addItem(group('throttle', 'cascade', item.label, { alarm: true }), item);
                        break;
                    case 'mandate': {
                        const branch = child.branch ? child.branch.charAt(0).toUpperCase() + child.branch.slice(1) : 'Mandates';
                        const title = child.status === 'full'
                            ? `Mandates · ${branch} — certified, full`
                            : `Mandates · ${branch} — lapsed, residue`;
                        addItem(group('multiplier', `mandate:${child.branch}:${child.status}`, title,
                            { tone: child.status === 'full' ? 'is-live' : 'is-residue' }), item);
                        break;
                    }
                    case 'build':
                        addItem(child.entryKind === 'issue'
                            ? group('multiplier', 'build:issue', 'Reality build — known issues', { alarm: true })
                            : group('multiplier', 'build:feature', 'Reality build — features'), item);
                        break;
                    case 'upgrade': addItem(group('multiplier', 'upgrade', 'Upgrades'), item); break;
                    case 'repeatable': addItem(group('multiplier', 'repeatable', 'Standing requisitions'), item); break;
                    case 'scar': addItem(group('multiplier', 'scar', 'Known issues on file', { alarm: true }), item); break;
                    default: addItem(group('multiplier', `kind:${child.kind}`, this.recordLabel(child)), item);
                }
            }
        };

        const walk = (steps) => {
            for (const step of steps || []) {
                if (step.key.startsWith('@')) {
                    if (step.group === 'draw') {
                        sections.get('draw').set(step.key, this.drawGroup(step));
                    } else {
                        walk(step.children);
                    }
                    continue;
                }
                if (step.key.startsWith('target:')) {
                    liftRegistry(step);
                    continue;
                }
                if (step.group === 'base') {
                    sections.get('base').set(`${step.key}:${sections.get('base').size}`, {
                        title: this.baseLabel(step), op: step.op === 'base' ? 'base' : 'mul',
                        value: step.value, items: [], note: step.note,
                    });
                    continue;
                }
                if (step.value === 1) {
                    neutral++;
                    continue;
                }
                const section = step.group === 'achievement' ? 'multiplier'
                    : step.group === 'additive' ? 'additive'
                        : step.group === 'transient' ? 'transient'
                            : 'multiplier';
                const label = this.factorLabel(step);
                if (step.source === 'repeatable') {
                    addItem(group('multiplier', 'repeatable', 'Standing requisitions'), { label, stamp: this.stamp(`Rank ${step.rank}`), value: step.value });
                } else if (step.group === 'achievement') {
                    addItem(group('multiplier', 'achievement', 'Achievements'), { label, stamp: '', value: step.value });
                } else {
                    addItem(group(section, step.key, label), { label, stamp: '', value: step.value });
                }
            }
        };
        walk(ex.steps);
        return { sections, neutral };
    },

    baseLabel(step) {
        if (step.unit && step.perUnit !== undefined) {
            const plural = step.count === 1 ? step.unit : `${step.unit}s`;
            return `${ui.formatNumber(step.count)} ${plural} × ${ui.formatNumber(step.perUnit, 2)}/s each`;
        }
        if (step.unit) return `${ui.formatNumber(step.count)} ${step.count === 1 ? step.unit : `${step.unit}s`}`;
        if (step.key.startsWith('scalar.')) return `${step.label} — ${step.note}`;
        return step.label;
    },

    factorLabel(step) {
        if (step.group === 'additive') {
            const n = step.count ?? step.rank ?? 0;
            const pct = Math.round(step.each * 1000) / 10;
            return `${step.label} — ${ui.formatNumber(n)} × +${pct}%`;
        }
        if (step.key === 'transient.streak') return `${step.label} (${step.count})`;
        if (step.source === 'repeatable') return `${step.label} (r${step.rank})`;
        return step.label;
    },

    /* The draw is a subtraction, and its own small product: units × appetite
       × how hard they are running. */
    drawGroup(step) {
        const items = [];
        const visit = (steps) => {
            for (const s of steps || []) {
                if (s.key.startsWith('@')) { visit(s.children); continue; }
                if (s.key.startsWith('target:')) {
                    items.push({ label: s.label, stamp: (s.children || []).slice(1).map((c) => this.recordStamp(c)).join(''), text: this.factor(s.value) });
                    continue;
                }
                const label = s.key.startsWith('scalar.') ? `${s.label} — ${s.note}` : this.baseLabel(s);
                const text = s.key.startsWith('scalar.') ? `${Math.round(s.value * 1000) / 10}%`
                    : s.op === 'base' ? ui.formatNumber(s.value) : this.factor(s.value);
                items.push({ label, stamp: '', text });
            }
        };
        visit(step.children);
        return { title: step.label, op: 'sub', value: step.value, items };
    },

    renderRate(spec) {
        const name = this.RESOURCE_LABELS[spec.resource] || spec.resource;
        const ex = game.explainProductionRate(spec.resource);
        if (!ex) return null;
        const title = `Provenance — ${name}/s`;
        if (ex.sealed) {
            return this.frame(title, `${name} per second`, ui.formatNumber(ex.value, 1),
                '<p class="bd-empty">The Void is sealed. Nothing is produced here yet.</p>');
        }

        const { sections, neutral } = this.rateModel(ex);
        let running = null;
        const rows = [];
        for (const [key, heading] of this.SECTIONS) {
            const groups = Array.from(sections.get(key).values());
            if (!groups.length) continue;
            const focus = spec.focus === 'throttle' && key === 'throttle' ? ' is-focus' : '';
            rows.push(`<tr class="bd-section${focus}"><th colspan="3" scope="colgroup">${this.esc(heading)}</th></tr>`);
            for (const g of groups) {
                let factorText;
                if (g.op === 'base' || running === null) {
                    running = g.value;
                    factorText = this.opText('base', g.value);
                } else if (g.op === 'sub') {
                    running -= g.value;
                    factorText = this.opText('sub', g.value);
                } else {
                    running *= g.value;
                    factorText = this.factor(g.value);
                }
                const single = g.items.length === 1 && g.items[0].label === g.title;
                const stamp = single ? g.items[0].stamp : '';
                const cls = `bd-group${g.alarm ? ' is-alarm' : ''}${g.tone ? ` ${g.tone}` : ''}${focus}`;
                rows.push(`<tr class="${cls}"><td class="bd-label">${this.esc(g.title)}${stamp}${g.note ? `<span class="bd-note">${this.esc(g.note)}</span>` : ''}</td>` +
                    `<td class="bd-factor">${this.esc(factorText)}</td><td class="bd-running">${this.esc(this.num(running, 1))}</td></tr>`);
                if (!single) {
                    for (const item of g.items) {
                        const text = item.text ?? this.factor(item.value);
                        rows.push(`<tr class="bd-item${focus}"><td class="bd-label">${this.esc(item.label)}${item.stamp || ''}</td>` +
                            `<td class="bd-factor">${this.esc(text)}</td><td class="bd-running"></td></tr>`);
                    }
                }
            }
        }

        const cascade = ex.cascade;
        const alert = cascade && cascade.tier > 0
            ? `<p class="bd-alert${spec.focus === 'throttle' ? ' is-focus' : ''}">${this.stamp(cascade.label, 'is-alarm')} Output ×${cascade.output} on every stream until instability falls. Patch known issues to bring it down.</p>`
            : '';
        const foot = `<p class="bd-foot">${neutral ? `${neutral} neutral factor${neutral === 1 ? '' : 's'} (×1) not shown. ` : ''}Grouped by source; running total is the product so far.</p>`;
        // The final line is the GAME's value, formatted exactly as the readout
        // formats it — not this panel's running product.
        const table = `<table class="bd-table"><thead><tr><th scope="col">Source</th><th scope="col">Factor</th><th scope="col">Running</th></tr></thead>
            <tbody>${rows.join('')}</tbody>
            <tfoot><tr class="bd-final"><th scope="row" colspan="2">= ${this.esc(name)} per second</th><td class="bd-running">${this.esc(ui.formatNumber(ex.value, 1))}</td></tr></tfoot></table>`;
        return this.frame(title, `${name} per second`, ui.formatNumber(ex.value, 1), alert + table + foot);
    },

    renderCap(spec) {
        const name = this.RESOURCE_LABELS[spec.resource] || spec.resource;
        const ex = game.explainCap(spec.resource);
        if (!ex) return null;
        const rows = ex.steps.map((step, index) => {
            const label = index === 0 ? 'Base capacity' : this.recordLabel(step);
            const text = index === 0 ? ui.formatNumber(step.value) : this.opText(step.op, step.value);
            const alarm = step.kind === 'scar' || step.kind === 'cascade' || (step.kind === 'build' && step.entryKind === 'issue');
            return `<tr class="bd-group${alarm ? ' is-alarm' : ''}"><td class="bd-label">${this.esc(label)}${index === 0 ? '' : this.recordStamp(step)}</td>` +
                `<td class="bd-factor">${this.esc(text)}</td><td class="bd-running">${this.esc(ui.formatNumber(step.running))}</td></tr>`;
        });
        const table = `<table class="bd-table"><thead><tr><th scope="col">Source</th><th scope="col">Effect</th><th scope="col">Capacity</th></tr></thead>
            <tbody>${rows.join('')}</tbody>
            <tfoot><tr class="bd-final"><th scope="row" colspan="2">= ${this.esc(name)} storage</th><td class="bd-running">${this.esc(ui.formatNumber(ex.value))}</td></tr></tfoot></table>`;
        const foot = '<p class="bd-foot">In the order the vault applies them — rounding (⌊⌋) and flat additions do not commute.</p>';
        return this.frame(`Provenance — ${name} storage`, `${name} capacity`, ui.formatNumber(ex.value), table + foot);
    },

    /* Title and body are kept apart so the 4Hz refresh rewrites only the
       body. Rewriting the titlebar too would replace the close box between a
       press and its release, and the click would land on nothing. */
    frame(title, eyebrow, total, body) {
        return {
            title,
            body: `<div class="bd-head"><span class="bd-eyebrow">${this.esc(eyebrow)}</span>` +
                `<strong class="bd-total">${this.esc(total)}</strong></div>${body}`,
        };
    },

    paint(sheet, first) {
        let bar = this.panel.querySelector('.bd-titlebar');
        let body = this.panel.querySelector('.bd-body');
        if (first || !bar || !body) {
            this.panel.innerHTML = '<div class="bd-titlebar"><span></span>' +
                '<button type="button" class="bd-close" data-breakdown-close aria-label="Close">×</button></div>' +
                '<div class="bd-body"></div>';
            bar = this.panel.querySelector('.bd-titlebar');
            body = this.panel.querySelector('.bd-body');
            this.lastHtml = null;
        }
        const label = bar.querySelector('span');
        if (label.textContent !== sheet.title) label.textContent = sheet.title;
        if (sheet.body !== this.lastHtml) {
            body.innerHTML = sheet.body;
            this.lastHtml = sheet.body;
        }
    },
};

Breakdown.install();
