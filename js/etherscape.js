/* ════════════════════════════════════════════════════════════════════════
   Etherscape Navigator — the web of the afterlife.

   A browser window on the late-90s web as CMS remembers it: the corporate
   intranet, the HR handbook, a newspaper written from your own release
   history, a status page that is the live state of your build, an
   encyclopedia whose every number is read out of the code it describes, a
   casino, fan pages with visitor counters, a forum on the far side of the
   Veil, and one page that should not be there.

   ── The rules this file keeps ───────────────────────────────────────────

   IT ONLY READS. Etherscape shows the economy; it never changes it. Pages
   are rendered from a snapshot taken through the game's own pure getters
   (cascadeState, getPrestigeThreshold, Reality.normaliseHistory …), and
   its own state lives in State.etherscape, which nothing else reads.

   THE NUMBERS ARE THE CODE'S. Cosmopedia does not restate a constant: it
   prints Incidents.OUTAGE_SCALE, Economy.cascadeTiers, RealityChannels and
   the rest at render time, so it cannot drift from the game it explains.
   tests/etherscape.mjs asserts the rendered text against those constants.

   EVERYTHING IS ESCAPED. Pages are written in a small line markup (below)
   and turned into HTML by one renderer that escapes every text run through
   ui.escapeHtml. Values that come from a save — versions, ids, titles —
   go through lit(), which also defuses the markup's own syntax, so a forged
   string cannot even become a link.

   ── The markup ──────────────────────────────────────────────────────────
     = / == / ===      headings          - item      list
     > text            quotation         ---         rule
     |! a | b          table header      | a | b     table row
     @directive args   widgets: masthead, marquee, blink, note, center,
                       construction, counter, guestbook, webring, sign,
                       post, clip, image
     anything else     a paragraph; consecutive lines join
   Inline: [[url|label]] links, **bold**, ''italic'', `code`.
   A link is live when its page is reachable, a DEAD link (struck, with a
   tooltip saying why) when the page exists but is locked, and a plain link
   to the in-world 404 when no such page exists. Besides web URLs a link may
   name doc:<id> (Recovered Documents), tape:<id> (the Sacred Media Player),
   reel:<id> (recovered footage, js/footage.js) or app:<id> (an installed
   app), each live only when that thing is. Pages write a reel: link only
   when ctx.reels lists it, so an uninstalled reel leaves no trace.

   ── Media slots (naming convention) ─────────────────────────────────────
     @clip <slug> | caption    assets/video/web__<slug>__720.webm (or .mp4),
                               with assets/video/web__<slug>__720.webp as its
                               poster — the still shown under reduced motion.
                               Mounted by media.attachClip(): probed, never
                               shown unless installed, silent under
                               Cinematics: Off.
     @image <slug> | caption   assets/web/<slug>.webp, probed the same way.
   A slot whose file is not installed renders nothing at all. Slugs are
   lowercase a-z, 0-9 and hyphens. The slots in use are listed by
   EtherscapeSites.mediaSlots() and in docs/VISUAL_UPGRADE_PLAN.md §8.

   ── Public API (for CMS Mail, Choir and anything else) ──────────────────
     Etherscape.knows(url)   true for a known page the player can reach now
     Etherscape.open(url)    opens the Navigator on it; false (and nothing
                             opens) when knows(url) is false
     Etherscape.canonical(url), Etherscape.reachable()
   Callers guard: typeof Etherscape !== 'undefined' && Etherscape.knows(url).

   Layout: EtherscapeLogic (pure, no DOM — the vm tests load it),
   EtherscapeSites (the page registry), Etherscape (state, API, the window).
   ════════════════════════════════════════════════════════════════════════ */

const EtherscapeLogic = (() => {
    'use strict';

    const HOME = 'cms://intranet';
    const HISTORY_CAP = 50;     // persisted history, most recent first
    const STACK_CAP = 50;       // the session's back/forward stack
    const BOOKMARK_CAP = 30;
    const URL_MAX = 120;
    const DEFAULT_BOOKMARKS = ['cms://intranet', 'news://celestial-times', 'cosmopedia://'];

    const esc = (value) => {
        if (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function') {
            const out = ui.escapeHtml(value);
            if (typeof out === 'string') return out;
        }
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    };

    /* FNV-1a. Picks a template for an event: same event, same headline,
       forever, and adding events never re-words the old ones. */
    function hash(str) {
        let h = 0x811C9DC5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
        return h >>> 0;
    }

    const pick = (list, key) => list[hash(key) % list.length];

    /* ── Addresses ────────────────────────────────────────────────────── */

    /* Web addresses are case-insensitive here and carry no trailing slash,
       so "CMS://Intranet/" is cms://intranet. A bare "null:" is null://.
       Returns '' for something that is not an address at all. */
    function canonical(raw) {
        if (typeof raw !== 'string') return '';
        const u = raw.trim().replace(/\s+/g, '').toLowerCase();
        if (!u || u.length > URL_MAX) return '';
        const m = /^([a-z][a-z0-9+.-]*):(?:\/\/)?(.*)$/.exec(u);
        if (!m) return u;
        return `${m[1]}://${m[2].replace(/\/+$/, '')}`;
    }

    /* A cross-link: doc:, tape:, reel: or app:. Ids keep their own case rules. */
    function crossLink(href) {
        const m = /^(doc|tape|app|reel):([A-Za-z0-9_-]{1,40})$/i.exec(String(href || '').trim());
        if (!m) return null;
        const type = m[1].toLowerCase();
        return { type, id: type === 'doc' ? m[2].toUpperCase() : m[2].toLowerCase() };
    }

    /* ── Persistence ──────────────────────────────────────────────────── */

    function defaults() {
        return {
            bookmarks: DEFAULT_BOOKMARKS.slice(),
            visited: [],
            history: [],
            unlocked: [],
            guestbookSigned: false,
            counterSeed: 0,
            counterHits: 0,
        };
    }

    /* importSave decodes pasted text straight into State and mergeInto does
       no type checking, so every field is checked for the type and range it
       must have — never `x || default`, which keeps every truthy wrong value
       (335f41f). URLs must be canonical and name a page that exists. Pure:
       returns a fresh object and never throws. */
    function normalise(raw, known) {
        const plain = raw && typeof raw === 'object' && !Array.isArray(raw);
        const src = plain ? raw : {};
        const out = defaults();
        const isKnown = (u) => (known instanceof Set ? known.has(u) : true);
        const urls = (list, cap) => {
            const seen = new Set();
            const result = [];
            for (const v of Array.isArray(list) ? list : []) {
                if (result.length >= cap) break;
                if (typeof v !== 'string' || v.length > URL_MAX) continue;
                const u = canonical(v);
                if (!u || u !== v || seen.has(u) || !isKnown(u)) continue;
                seen.add(u);
                result.push(u);
            }
            return result;
        };
        const all = known instanceof Set ? Math.max(known.size, 1) : 500;
        if (Array.isArray(src.bookmarks)) out.bookmarks = urls(src.bookmarks, BOOKMARK_CAP);
        out.visited = urls(src.visited, all);
        out.history = urls(src.history, HISTORY_CAP);
        out.unlocked = urls(src.unlocked, all);
        out.guestbookSigned = src.guestbookSigned === true;
        out.counterSeed = Number.isInteger(src.counterSeed) && src.counterSeed >= 1 && src.counterSeed <= 999999 ? src.counterSeed : 0;
        out.counterHits = Number.isInteger(src.counterHits) && src.counterHits >= 0 && src.counterHits <= 1e9 ? src.counterHits : 0;
        return out;
    }

    /* Most recent first, each page once, capped. */
    function pushHistory(list, url) {
        const rest = (Array.isArray(list) ? list : []).filter((u) => u !== url);
        return [url, ...rest].slice(0, HISTORY_CAP);
    }

    /* The back/forward stack. Visiting from the middle drops the forward
       half, the way every browser does; the oldest entry falls off the cap. */
    function stackPush(stack, index, url) {
        const kept = (Array.isArray(stack) ? stack : []).slice(0, Math.max(0, index + 1));
        if (kept[kept.length - 1] === url) return { stack: kept, index: kept.length - 1 };
        kept.push(url);
        const over = Math.max(0, kept.length - STACK_CAP);
        const trimmed = kept.slice(over);
        return { stack: trimmed, index: trimmed.length - 1 };
    }

    /* ── Formatting ───────────────────────────────────────────────────── */

    function fmt(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '0';
        if (Math.abs(v) >= 1e15) return v.toExponential(2).replace('e+', 'e');
        return Math.round(v).toLocaleString('en-US');
    }

    // 0.25 -> "25%", 0.025 -> "2.5%", 1.4 -> "140%"
    function pct(x) {
        return `${Number((Number(x) * 100).toFixed(4))}%`;
    }

    function plural(n, one, many) {
        return `${fmt(n)} ${Number(n) === 1 ? one : (many || `${one}s`)}`;
    }

    function minutes(seconds) {
        const m = Number(seconds) / 60;
        return Number.isInteger(m) ? plural(m, 'minute') : plural(seconds, 'second');
    }

    /* A value from a save, made inert: no markup syntax survives it, and it
       cannot start a block. Escaping still happens later, at render. */
    function lit(value) {
        return String(value ?? '')
            .replace(/[\r\n]+/g, ' ')
            .replace(/\[/g, '\u27E6').replace(/\]/g, '\u27E7')
            .replace(/\*\*/g, '*\u200B*')
            .replace(/''/g, '\u2019\u2019')
            .replace(/`/g, '\u2018')
            .replace(/\|/g, '\u00A6')
            .replace(/^([=\-|>@])/, '\u200B$1');
    }

    /* The first sentence of a changelog note, without its kind prefix. */
    function shortNote(note) {
        const text = String(note || '').replace(/^(REGRESSION|DEPRECATED|KNOWN ISSUE):\s*/i, '');
        const cut = text.search(/\.(\s|$)/);
        return cut > 0 ? text.slice(0, cut) : text;
    }

    /* ── The renderer ─────────────────────────────────────────────────── */

    /* `env.link(href)` -> { state: 'ok' | 'dead' | 'missing', url, hint,
       title, visited }. `env.directive(name, args)` -> HTML or null. */
    function inline(text, env) {
        const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\*\*(.+?)\*\*|''(.+?)''|`([^`]+)`/g;
        let out = '';
        let last = 0;
        let m;
        while ((m = re.exec(text))) {
            out += esc(text.slice(last, m.index));
            last = re.lastIndex;
            if (m[1] !== undefined) out += linkHtml(m[1].trim(), m[2], env);
            else if (m[3] !== undefined) out += `<b>${esc(m[3])}</b>`;
            else if (m[4] !== undefined) out += `<i>${esc(m[4])}</i>`;
            else out += `<code>${esc(m[5])}</code>`;
        }
        return out + esc(text.slice(last));
    }

    function linkHtml(href, label, env) {
        const info = (env && env.link) ? env.link(href) : { state: 'missing', url: href };
        const text = esc(label !== undefined ? label.trim() : (info.title || href));
        if (info.state === 'dead') {
            const hint = info.hint || 'This page is not available yet.';
            return `<span class="es-dead" tabindex="0" role="link" aria-disabled="true" title="${esc(hint)}" data-hint="${esc(hint)}">${text}</span>`;
        }
        const visited = info.visited ? ' is-visited' : '';
        const kind = info.kind ? ` es-link--${esc(info.kind)}` : '';
        return `<a class="es-link${visited}${kind}" href="#" data-href="${esc(info.url || href)}">${text}</a>`;
    }

    function render(markup, env = {}) {
        const lines = String(markup || '').split('\n').map((l) => l.trim());
        const html = [];
        let para = [];
        let list = null;     // 'ul' | 'quote' | 'table'
        let items = [];

        const flushPara = () => {
            if (para.length) html.push(`<p>${inline(para.join(' '), env)}</p>`);
            para = [];
        };
        const flushList = () => {
            if (!list) return;
            if (list === 'ul') html.push(`<ul>${items.map((t) => `<li>${inline(t, env)}</li>`).join('')}</ul>`);
            else if (list === 'quote') html.push(`<blockquote>${items.map((t) => `<p>${inline(t, env)}</p>`).join('')}</blockquote>`);
            else if (list === 'table') {
                const rows = items.map(({ head, cells }) => `<tr>${cells.map((c) => (head
                    ? `<th scope="col">${inline(c, env)}</th>` : `<td>${inline(c, env)}</td>`)).join('')}</tr>`).join('');
                html.push(`<div class="es-table-wrap"><table class="es-table">${rows}</table></div>`);
            }
            list = null;
            items = [];
        };
        const into = (kind, item) => {
            flushPara();
            if (list !== kind) flushList();
            list = kind;
            items.push(item);
        };

        for (const line of lines) {
            if (!line) { flushPara(); flushList(); continue; }
            let m;
            if ((m = /^(={1,3})\s+(.*)$/.exec(line))) {
                flushPara(); flushList();
                const level = m[1].length;
                html.push(`<h${level}>${inline(m[2], env)}</h${level}>`);
            } else if (line === '---') {
                flushPara(); flushList();
                html.push('<hr>');
            } else if ((m = /^-\s+(.*)$/.exec(line))) {
                into('ul', m[1]);
            } else if ((m = /^>\s?(.*)$/.exec(line))) {
                into('quote', m[1]);
            } else if ((m = /^\|(!?)(.*)$/.exec(line))) {
                into('table', { head: m[1] === '!', cells: m[2].split('|').map((c) => c.trim()) });
            } else if ((m = /^@([a-z]+)\s*(.*)$/.exec(line))) {
                flushPara(); flushList();
                const args = m[2] ? m[2].split('|').map((a) => a.trim()) : [];
                const out = directive(m[1], args, env);
                if (out) html.push(out);
            } else {
                if (list) flushList();
                para.push(line);
            }
        }
        flushPara();
        flushList();
        return html.join('\n');
    }

    const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

    function directive(name, args, env) {
        const custom = env && env.directive ? env.directive(name, args) : null;
        if (custom !== null && custom !== undefined) return custom;
        const [a = '', b = ''] = args;
        switch (name) {
            case 'masthead':
                return `<header class="es-masthead"><span class="es-masthead-title">${inline(a, env)}</span>${b ? `<span class="es-masthead-sub">${inline(b, env)}</span>` : ''}</header>`;
            case 'marquee':
                return `<div class="es-marquee" role="marquee"><span>${inline(args.join(' | '), env)}</span></div>`;
            case 'blink':
                return `<p class="es-center"><span class="es-blink">${inline(a, env)}</span>${b ? ` ${inline(b, env)}` : ''}</p>`;
            case 'note':
                return `<p class="es-note">${inline(args.join(' | '), env)}</p>`;
            case 'center':
                return `<p class="es-center">${inline(args.join(' | '), env)}</p>`;
            case 'sign':
                return `<div class="es-sign${/DEGRADED|OUTAGE|FAILURE/.test(a) ? ' is-alarm' : ''}">${inline(a, env)}${b ? `<small>${inline(b, env)}</small>` : ''}</div>`;
            case 'post':
                return `<div class="es-post-head"><b>${inline(a, env)}</b>${b ? `<span>${inline(b, env)}</span>` : ''}</div>`;
            case 'construction':
                return `<div class="es-construction" role="img" aria-label="Under construction">
                    <span class="es-construction-cone" aria-hidden="true"></span>
                    <span class="es-construction-text">UNDER CONSTRUCTION</span>
                    <span class="es-construction-cone" aria-hidden="true"></span></div>`;
            case 'clip':
            case 'image':
                if (!SLUG.test(a)) return '';
                return `<figure class="es-slot" data-${name}="${esc(a)}" data-caption="${esc(b)}"></figure>`;
            default:
                return '';
        }
    }

    /* ── The visitor counter ──────────────────────────────────────────── */
    function counterValue(store) {
        const seed = Number.isInteger(store?.counterSeed) ? store.counterSeed : 0;
        const hits = Number.isInteger(store?.counterHits) ? store.counterHits : 0;
        return 1000 + (seed % 9000) * 3 + hits;
    }

    /* ── The Celestial Times ──────────────────────────────────────────────
       Every headline is an EVENT the save actually holds — a build, a line
       of its changelog, a ship, a scar, a ticket, a cascade, an ending —
       keyed by what identifies it, and worded by a template picked from a
       fixed pool by that key. Same save, same paper; a new event adds a
       headline without re-wording the others. Text is plain; the page
       passes it through lit() and the renderer escapes it. */
    const NEWS = {
        opening: [
            'Sector 7G fails overnight integrity check; Praise vault running on surviving partition',
            'New Operator inherits Sector 7G "as is"; previous Operator unavailable for comment',
            'CMS confirms universe operational, in the broad sense',
        ],
        build: [
            'CMS ships Reality v{version} on the {channel} channel',
            'Reality v{version} goes live with {count} release notes; Operator assigned all of them',
            'New universe, same Sector: v{version} ({channel}) arrives overnight',
            'v{version} rolls out to {channel}; choir told to "sing it like it\'s the first time"',
        ],
        improvement: [
            'Release notes, v{version}: {note}',
            'Good news from the choir in v{version}: {note}',
            'Engineering takes a bow: {note}',
        ],
        issue: [
            'KNOWN ISSUE in v{version}: {note}',
            'Ticket assigned to Operator: {note}',
            'CMS "aware" of fault in v{version}: {note}',
        ],
        regression: [
            'REGRESSION in v{version}: {note}',
            'Something that worked now does not: {note}',
            'Readers report v{version} worse in one respect: {note}',
        ],
        deprecation: [
            'DEPRECATED in v{version}: {note}',
            'CMS retires a feature nobody asked to keep: {note}',
        ],
        patched: [
            'Operator patches fault in v{version}: {note}',
            'Fixed by hand: {note}',
            'Known issue closed in v{version}: {note}',
        ],
        cascade: {
            1: ['Sector 7G reports SEV-2 DEGRADED; output down to {output}', 'Instability climbs past {at} in v{version}; choir sings flat'],
            2: ['SEV-1 OUTAGE across Sector 7G; output at {output}', 'Outage in v{version}: release award cut to {award}'],
            3: ['CASCADE FAILURE: v{version} collapses; build would ship for nothing', 'Universe at {output} output after total cascade; Operator "on it"'],
        },
        ship: [
            'v{version} sealed and shipped to {channel}; Operator banks {award} Divinity',
            'Reboot {reboot} complete: v{version} ships, {award} Divinity paid',
            'Build v{version} signed off on {channel}. Sector 7G reboots',
        ],
        shipDirty: [
            'v{version} ships with {unpatched} known issue(s) still open',
            'Operator ships v{version} without patching {unpatched} known issue(s); record updated',
        ],
        replay: [
            'Archived branch v{version} replayed; pays nothing, as advertised',
            'Operator re-runs v{version} from the archive. Notes found in the margins',
            'Old build v{version} reopened and shipped again; bar unmoved',
        ],
        scar: [
            'Filed forever: {note}',
            'Permanent record gains an entry: {note}',
            '"{note}" — shipped unpatched, now on file for good',
        ],
        annotation: [
            'Unknown party annotates archived build v{version}',
            'Margin notes appear on v{version}; handwriting matches the Operator\'s',
        ],
        incident: [
            '{id} filed: {title} (SEV-{severity})',
            'Pager sounds in Sector {sector}: {title}',
            'Ticket {id} open at SEV-{severity}: {title}',
        ],
        outage: [
            '{id} escalates to SEV-1 OUTAGE: {title}',
            'Backup choir called in: {title} ({id})',
        ],
        held: ['Incident queue on hold while the Operator steps away; nothing escalates'],
        stats: [
            '{filed} tickets filed to date; {falseAlarms} turned out to be false alarms',
            'Records show {filed} incidents since the Operator started; {contained} outages contained by the rota',
        ],
        contact: [
            'Duplicate session reported in Sector 7G; HR "looking into it"',
            'Operator seen logged in twice. Both deny it',
        ],
        ending: {
            hostile: ['void_mirror.service#2 terminated by its owner; Sector 7G staffed by one', 'Patched Out: Operator ends duplicate session; "Quiet in here now"'],
            curious: ['Two Operators, one console: CMS approves a form it does not have', 'Co-Maintenance rota signed; night shift goes to the other Operator'],
            complicit: ['Operator of record changes hands; former Operator kept as Emeritus', 'He Takes the Shift: archive gains a resident, console gains a new owner'],
        },
    };

    function fill(template, vars) {
        return template.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
    }

    /* ctx comes from Etherscape.snapshot(). Returns newest first:
       [{ key, at, kicker, text }]. */
    function headlines(ctx) {
        const out = [];
        const add = (key, at, kicker, pool, vars) => out.push({ key, at, kicker, text: fill(pick(pool, key), vars) });
        const level = ctx.reboots || 0;
        const build = ctx.build;

        if (build) {
            const version = build.version;
            const channel = ctx.channelLabel(build.channel);
            if (level === 0) add(`opening:${version}`, level * 100 + 10, 'Sector 7G', NEWS.opening, { version });
            else add(`build:${level}:${build.seed}`, level * 100 + 10, 'Releases', NEWS.build, { version, channel, count: build.entries.length });
            build.entries.forEach((e, i) => {
                const pool = e.patched && e.kind === 'issue' ? NEWS.patched : NEWS[e.kind];
                if (!pool) return;
                const kicker = e.patched && e.kind === 'issue' ? 'Patched' : ({ improvement: 'Improvement', issue: 'Known issue', regression: 'Regression', deprecation: 'Deprecated' }[e.kind]);
                add(`${e.patched ? 'patched' : e.kind}:${build.seed}:${e.id}`, level * 100 + 20 + i, kicker, pool, { version, note: shortNote(e.note) });
            });
            const c = ctx.cascade;
            if (c && c.tier > 0) {
                add(`cascade:${level}:${build.seed}:${c.tier}`, level * 100 + 60, 'Outage desk', NEWS.cascade[c.tier] || NEWS.cascade[1], {
                    version, output: pct(c.output), award: pct(c.award), at: c.at,
                });
            }
        }

        for (const r of ctx.history) {
            const version = ctx.versionOf(r.level);
            const at = r.reboot * 100 + 90;
            if (r.channel === 'archived') {
                add(`replay:${r.reboot}:${r.level}`, at, 'Archive', NEWS.replay, { version });
            } else {
                add(`ship:${r.reboot}`, at, 'Releases', NEWS.ship, { version, channel: ctx.channelLabel(r.channel), award: fmt(r.award), reboot: r.reboot + 1 });
                if (r.unpatched.length) add(`dirty:${r.reboot}`, at + 1, 'Releases', NEWS.shipDirty, { version, unpatched: r.unpatched.length });
            }
        }

        // A scar is filed at the ship that carried it: date it to that ship.
        for (const id of ctx.scars) {
            const ship = ctx.history.find((r) => r.unpatched.includes(id));
            add(`scar:${id}`, ship ? ship.reboot * 100 + 92 : 5, 'Permanent record', NEWS.scar, { note: shortNote(ctx.noteOf(id)) });
        }

        for (const a of ctx.annotations) {
            add(`annotation:${a.level}`, a.filedOn * 100 + 15, 'Archive', NEWS.annotation, { version: ctx.versionOf(a.level) });
        }

        const inc = ctx.incidents;
        if (inc) {
            inc.open.forEach((t, i) => {
                const vars = { id: t.id, title: t.title, severity: t.severity, sector: t.sector };
                add(`incident:${t.id}:${t.severity === 1 ? 1 : 0}`, level * 100 + 70 + i, 'Incidents', t.severity === 1 ? NEWS.outage : NEWS.incident, vars);
            });
            if (inc.onHold && inc.open.length) add('held', level * 100 + 80, 'Incidents', NEWS.held, {});
            if (inc.stats.filed >= 5) {
                const bucket = Math.floor(inc.stats.filed / 5) * 5;
                add(`stats:${bucket}`, level * 100 + 5, 'Incidents', NEWS.stats, {
                    filed: fmt(inc.stats.filed), falseAlarms: fmt(inc.stats.falseAlarmsCleared), contained: fmt(inc.stats.contained),
                });
            }
        }

        /* Contact is news while the scene is unfinished; after that it files
           at reboot 3, the earliest the adversary's trigger can fire. */
        if (ctx.adversary.contacted) add('contact', ctx.adversary.sceneCompleted ? 303 : level * 100 + 3, 'HR', NEWS.contact, {});
        for (const e of ctx.endings) {
            const pool = NEWS.ending[e.ending];
            if (pool) add(`ending:${e.ending}:${e.reboot}`, e.reboot * 100 + 95, 'Handover', pool, {});
        }

        return out.sort((x, y) => (y.at - x.at) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    }

    return {
        HOME, HISTORY_CAP, STACK_CAP, BOOKMARK_CAP, URL_MAX, DEFAULT_BOOKMARKS, NEWS,
        hash, pick, canonical, crossLink, defaults, normalise, pushHistory, stackPush,
        fmt, pct, plural, minutes, lit, shortNote, esc, render, inline, counterValue,
        headlines, fill,
    };
})();

/* ════════════════════════════════════════════════════════════════════════
   The page registry. Each page: title, theme, render(ctx, E) -> markup,
   and optionally unlock(ctx) / hint / secret (a locked secret page is a
   404, not a dead link) / announce (log a line when it first unlocks).
   ════════════════════════════════════════════════════════════════════════ */
const EtherscapeSites = (() => {
    'use strict';
    const L = EtherscapeLogic;

    /* The lowest reboot at which a release channel opens, read off
       Reality.channelsFor rather than restated. */
    function channelOpensAt(name) {
        if (typeof Reality === 'undefined') return null;
        for (let level = 0; level <= 100; level++) if (Reality.channelsFor(level).includes(name)) return level;
        return null;
    }

    const upgrade = (id) => (typeof UpgradeList !== 'undefined' ? UpgradeList.find((u) => u.id === id) : null);
    const shopItem = (id) => (typeof ShopItemList !== 'undefined' ? ShopItemList.find((u) => u.id === id) : null);
    const repeatable = (id) => (typeof RepeatableList !== 'undefined' ? RepeatableList.find((r) => r.id === id) : null);

    /* The automaton fan ring, in ring order. */
    const RING = ['seraph://fanpage', 'throne://fanclub', 'cherub://shrine'];

    const ENDING_LABEL = (band) => (typeof AdversaryFinale !== 'undefined' && AdversaryFinale.endings[band]) || null;

    const pages = {

        /* ───────────────────────────── CMS ───────────────────────────── */
        'cms://intranet': {
            title: 'CMS Intranet — Celestial Micro-Systems',
            theme: 'cms',
            render(ctx, E) {
                const tapes = (typeof MediaCatalog !== 'undefined' ? MediaCatalog.tapes : [])
                    .filter((t) => !t.secret || ctx.tapes.includes(t.id))
                    .map((t) => `- ${E.link(`tape:${t.id}`, `${t.code} — ${t.title}`)}`).join('\n');
                const lead = ctx.headlines[0];
                const greeting = ctx.adversary.contacted
                    ? 'Your session is being recorded for training purposes. It is also being recorded by someone else. HR is aware.'
                    : 'Your session is being recorded for training purposes.';
                const worn = ctx.endingWorn ? ENDING_LABEL(ctx.endingWorn) : null;
                return `
                @masthead CELESTIAL MICRO-SYSTEMS | Operator Intranet · Sector 7G
                @image cms-campus | The CMS campus, photographed before the incident.
                @marquee NOTICE: The Universal Engine is the property of CMS. Please do not lean on it. | Release notes are mandatory reading. They are also the only reading.
                = Welcome back, ${E.lit(worn ? worn.title : 'Operator')}
                You are logged in to the CMS Operator Intranet from Sector 7G. ${greeting}
                == Today on the Intranet
                - [[news://celestial-times|The Celestial Times]] — ${lead ? `“${E.lit(lead.text)}”` : 'no news is good news.'}
                - [[sector://7g/status|Sector 7G service status]] — currently **${E.lit(ctx.cascade.label)}**.
                - [[cms://hr/policies|HR policies]] — revision ${E.n(ctx.reboots + 1)}.
                - [[cms://hr/directory|Staff directory]] — find a colleague. Most of them are automata.
                - [[cms://releases|Release notes archive]] — every build you have shipped.
                - [[cosmopedia://|Cosmopedia]], the free encyclopedia of divine maintenance. Edited by Operators. Mostly.
                == Operator orientation tapes
                Tapes are filed to your Sacred Media Player as you reach each part of the job.
                ${tapes}
                == Required reading
                - [[doc:DOC-NEW-06|Operator Onboarding — Quickstart]]
                - [[doc:DOC-NEW-01|Quarterly Operator Evaluation]]
                - [[doc:DOC-NEW-02|Reality Interface — Terms of Service]]
                == Around the web
                CMS does not endorse the sites below. CMS does not endorse much.
                - [[etherscape://whats-cool|What's Cool?]] — the Navigator's own directory.
                - [[seraph://fanpage|A Seraph fan page]] (not affiliated with CMS)
                - [[fate://casino|Fate's]] (a contractor; not affiliated; please stop asking)
                @note Best viewed in Etherscape Navigator 3.0 at 800 × 600. This page was last updated at reboot ${E.n(ctx.reboots)}.`;
            },
        },

        'cms://hr/policies': {
            title: 'HR Policy Handbook — CMS Human Resources',
            theme: 'cms',
            render(ctx, E) {
                const n = ctx.reboots;
                const beta = channelOpensAt('beta');
                const nightly = channelOpensAt('nightly');
                const archived = channelOpensAt('archived');
                const presence = typeof Incidents !== 'undefined' ? E.mins(Incidents.PRESENCE_SECONDS) : 'two minutes';
                const blocks = [];
                blocks.push(`
                    === HR-001 · Attendance
                    Operators are expected to be present. Presence is defined as input within the last ${presence}. Absence is not penalised: while you are away, the incident queue holds. HR would like it noted that this is the only kind policy in the handbook.`);
                blocks.push(`
                    === HR-002 · Storage
                    Praise in excess of vault capacity is discarded. Expand the vault before you leave, not after. Discarded Praise is not refundable and does not know it was discarded.`);
                blocks.push(`
                    === HR-003 · Training materials
                    Orientation tapes are the property of Celestial Micro-Systems. Do not tape over them. Be kind; rewind.`);
                if (n >= 1) {
                    blocks.push(`
                    === HR-014 · Divine Reboots
                    A reboot is filed as a release. You have shipped ${E.plural(n, 'build')}. "Fresh start" is a branding term and does not appear in your contract. Unpatched known issues ship with the build and remain on your permanent record.`);
                }
                if (beta !== null && n >= beta) {
                    blocks.push(`
                    === HR-021 · Release channels
                    The Beta channel has been open to you since reboot ${E.n(beta)}. Beta pays more because Beta breaks more. Hazard pay is not a raise.`);
                }
                if (nightly !== null && n >= nightly) {
                    blocks.push(`
                    === HR-022 · Nightly builds
                    Nightly opened at reboot ${E.n(nightly)}. CMS is not liable for Nightly. CMS has never been liable for Nightly. Nightly is not liable for itself.`);
                }
                if (archived !== null && n >= archived) {
                    blocks.push(`
                    === HR-030 · The archive
                    From reboot ${E.n(archived)} an Operator may replay an archived build. Replays pay no Divinity. Do not feed anything you find in the margins.`);
                }
                if (ctx.adversary.contacted) {
                    blocks.push(`
                    === HR-VOID-7781 · Duplicate sessions
                    If a second Operator is logged in as you, do not engage. Report the duplicate session to HR. HR will report it to you. See [[doc:DOC-NEW-14|ticket HR-VOID-7781]].`);
                }
                if (ctx.endingWorn === 'hostile') {
                    blocks.push(`
                    === HR-099 · Singular Operator
                    Effective immediately, Sector 7G is staffed by one (1) Operator. Duplicate-session reports will be returned unopened. There is nobody to send them to.`);
                } else if (ctx.endingWorn === 'curious') {
                    blocks.push(`
                    === HR-VOID-7781-B · Rota
                    Two Operators, one console, alternating shifts, one ledger. CMS had no form for this. CMS now has a form for this.`);
                } else if (ctx.endingWorn === 'complicit') {
                    blocks.push(`
                    === HR-100 · Operator of record
                    The Operator of record is void_mirror.service. The former Operator retains the title Operator Emeritus, console access and parking. Signatures from the former Operator are retained for sentimental purposes.`);
                }
                return `
                @masthead CMS HUMAN RESOURCES | Policy Handbook · Revision ${E.n(n + 1)}
                = Operator Policy Handbook
                This handbook is revised every time you reboot the universe. You are reading revision **${E.n(n + 1)}**. Earlier revisions are archived and, like everything archived, still running somewhere.
                ${blocks.join('\n')}
                ---
                @note Questions about policy should be directed to HR. HR is always available and never reachable. [[cms://hr/directory|Staff directory]] · [[cms://intranet|Intranet home]]`;
            },
        },

        'cms://hr/directory': {
            title: 'Staff Directory — CMS',
            theme: 'cms',
            render(ctx, E) {
                const worn = ctx.endingWorn ? ENDING_LABEL(ctx.endingWorn) : null;
                const you = worn ? worn.title : 'Active';
                let mirror = 'No such employee.';
                if (ctx.adversary.contacted) mirror = 'Duplicate of OPERATOR. Ticket HR-VOID-7781 open.';
                if (ctx.endingWorn === 'hostile') mirror = 'Process ended by owner.';
                if (ctx.endingWorn === 'curious') mirror = 'Night shift.';
                if (ctx.endingWorn === 'complicit') mirror = 'Operator of record.';
                const a = ctx.automatons;
                return `
                @masthead CMS HUMAN RESOURCES | Staff Directory
                = Staff Directory
                Search is not available. Here is everyone.
                |! Name | Department | Status
                | OPERATOR (you) | Divine Maintenance, Sector 7G | ${E.lit(you)}
                | The previous Operator | Divine Maintenance (retired) | Retired. Forwarding address: [[operator://home]]
                | The Instructor | Training & Orientation | On tape. See [[tape:t1|T1]].
                | HR | Human Resources | Always available. Never reachable.
                | Fate | Hospitality (contractor) | [[fate://casino|On the floor]]
                | Seraphic Automata × ${E.n(a.seraph)} | Choir | Singing
                | Throne Converters × ${E.n(a.throne)} | Liturgy | Burning Praise
                | Cherubic Processors × ${E.n(a.cherub)} | Records | Filing Souls
                | Dominion Regulators × ${E.n(a.dominion)} | Oversight | Regulating
                | watcher.whisperd (legacy) | Telemetry | Reports the sun as missing.
                | void_mirror.service | ${ctx.adversary.contacted ? 'Divine Maintenance, Sector 7G' : '—'} | ${E.lit(mirror)}
                @note Directory entries are maintained by the employees they describe, except where they are not.`;
            },
        },

        'cms://releases': {
            title: 'Release Notes Archive — CMS',
            theme: 'cms',
            render(ctx, E) {
                const b = ctx.build;
                const kinds = { improvement: 'Improvement', issue: 'Known issue', regression: 'Regression', deprecation: 'Deprecated' };
                const current = b ? b.entries.map((e) => `- **${kinds[e.kind] || 'Note'}${e.kind === 'issue' ? ` · SEV-${E.n(e.severity)}` : ''}${e.patched ? ' · PATCHED' : ''}** — ${E.lit(e.note)}`).join('\n') : '- No build on file.';
                const rows = ctx.history.slice().reverse().map((r) => `| ${E.n(r.reboot + 1)} | v${E.lit(ctx.versionOf(r.level))} | ${E.lit(ctx.channelLabel(r.channel))}${r.channel === 'archived' ? ` (of ${E.lit(ctx.channelLabel(r.source))})` : ''} | ${E.lit(r.certified ? r.certified.charAt(0).toUpperCase() + r.certified.slice(1) : '—')} | ${E.n(r.unpatched.length)} | ${E.n(r.award)}`).join('\n');
                const scars = ctx.scars.length
                    ? ctx.scars.map((id) => `- ${E.lit(L.shortNote(ctx.noteOf(id)))}`).join('\n')
                    : '- Nothing. Yet.';
                return `
                @masthead CELESTIAL MICRO-SYSTEMS | Release Notes Archive
                = Release Notes Archive
                == Current build: v${E.lit(b ? b.version : '?')} (${E.lit(ctx.channelLabel(b ? b.channel : 'stable'))})
                ${current}
                == Shipped builds
                ${ctx.history.length ? `|! Ship | Version | Channel | Certified | Unpatched | Divinity\n${rows}` : 'No build has shipped from this console yet. The first one is always the hardest to let go of.'}
                == The permanent record
                Known issues shipped unpatched. Filed once each, forever.
                ${scars}
                @note See also: [[news://celestial-times|The Celestial Times]] · [[cosmopedia://reality-builds|Cosmopedia: Reality Builds]]`;
            },
        },

        /* ─────────────────────────── The news ─────────────────────────── */
        'news://celestial-times': {
            title: 'The Celestial Times',
            theme: 'news',
            render(ctx, E) {
                const list = ctx.headlines.slice(0, 14);
                const [lead, ...rest] = list;
                const dateline = (h) => `${E.lit(h.kicker)}`;
                const weather = ctx.cascade.tier > 0 ? `${ctx.cascade.label}, output ${L.pct(ctx.cascade.output)}` : 'Nominal. Light hymns, clearing later.';
                return `
                @masthead The Celestial Times | All the News That's Fit to Reboot · Reboot ${E.n(ctx.reboots)} edition · One Offering
                @image celestial-times-masthead | Our offices, Sector 1A.
                ${lead ? `= ${E.lit(lead.text)}\n@note ${dateline(lead)} · Sector 7G` : '= Quiet day in the cosmos\n@note Nothing has happened yet. Check back after your first Seraph.'}
                ${rest.length ? '== Also in this edition' : ''}
                ${rest.map((h) => `- **${dateline(h)}** — ${E.lit(h.text)}`).join('\n')}
                == Weather
                Sector 7G: ${E.lit(weather)}
                == Classifieds
                - **Infernal Systems Pro™** — tired of Praise? Read [[doc:DOC-NEW-10|the flyer]]. (Paid advertisement. CMS disagrees with it.)
                - **For sale:** one hymnal, slightly checksummed. Ask for the choirmaster.
                - **Lost:** a sense of continuity between builds. If found, return to the Operator.
                @note Printed on reclaimed vellum. [[cms://intranet|Intranet]] · [[sector://7g/status|Service status]]`;
            },
        },

        /* ─────────────────────────── Status ───────────────────────────── */
        'sector://7g/status': {
            title: 'Sector 7G — Service Status',
            theme: 'status',
            render(ctx, E) {
                const b = ctx.build;
                const c = ctx.cascade;
                const inc = ctx.incidents;
                const worst = inc.open.length ? `SEV-${Math.min(...inc.open.map((t) => t.severity))}` : '—';
                const issues = ctx.unpatched.length
                    ? ctx.unpatched.map((e) => `- **SEV-${E.n(e.severity)}** ${E.lit(e.note)}`).join('\n')
                    : '- None. The build is clean.';
                const tickets = inc.open.length
                    ? inc.open.map((t) => `- **${E.lit(t.id)} · SEV-${E.n(t.severity)}** ${E.lit(t.title)}${inc.onHold ? ' · ON HOLD' : ''}`).join('\n')
                    : '- Queue clear.';
                const state = c.tier > 0 ? 'DEGRADED' : (inc.open.some((t) => t.severity === 1) ? 'PARTIAL OUTAGE' : 'OPERATIONAL');
                return `
                @masthead SECTOR 7G | Service Status
                @sign ${state} | ${c.recovering ? 'recovering' : (c.ratePerHour > 0 ? 'instability rising' : 'steady')}
                @note This page refreshes every 5 seconds.
                |! Component | Status
                | Reality build | v${E.lit(b ? b.version : '?')}
                | Channel | ${E.lit(ctx.channelLabel(b ? b.channel : 'stable'))}
                | Next build from | ${E.lit(ctx.channelLabel(ctx.nextChannel))}
                | Instability | ${E.lit(c.instability.toFixed(2))} / ${E.lit(c.ceiling.toFixed(2))}
                | Instability tier | ${E.lit(c.label)}
                | Output | ${E.lit(L.pct(c.output))}
                | Release award | ${E.lit(L.pct(c.award))}
                | Unpatched known issues | ${E.n(ctx.unpatched.length)}
                | Open incidents | ${E.n(inc.open.length)} (worst ${worst})${inc.onHold ? ' · ON HOLD' : ''}
                | Scars on record | ${E.n(ctx.scars.length)}
                == Unpatched known issues
                ${issues}
                == Open incidents
                ${tickets}
                @note Triage lives in Task Manager. Definitions: [[cosmopedia://incidents|incidents]] · [[cosmopedia://reality-builds|instability]]`;
            },
        },

        /* ─────────────────────────── Cosmopedia ───────────────────────── */
        'cosmopedia://': {
            title: 'Cosmopedia, the free encyclopedia of divine maintenance',
            theme: 'wiki',
            render(ctx, E) {
                const topics = [
                    ['cosmopedia://automatons', 'Automatons'],
                    ['cosmopedia://storage', 'Storage'],
                    ['cosmopedia://reality-builds', 'Reality Builds'],
                    ['cosmopedia://incidents', 'Incidents'],
                    ['cosmopedia://divine-reboot', 'Divine Reboot'],
                    ['cosmopedia://certification', 'Certification'],
                    ['cosmopedia://void', 'The Void'],
                    ['cosmopedia://patience', 'Patience.exe'],
                    ['cosmopedia://archived-channel', 'The Archived channel'],
                    ['cosmopedia://sector-7g', 'Sector 7G'],
                ];
                const outage = typeof Incidents !== 'undefined' ? L.pct(Incidents.OUTAGE_SCALE) : '?';
                const residue = typeof Economy !== 'undefined' ? L.pct(Economy.certificationResidue) : '?';
                return `
                @masthead Cosmopedia | the free encyclopedia of divine maintenance
                = Main Page
                Welcome to **Cosmopedia**, the encyclopedia anyone with console access can edit. Every figure in it is read from the running system, so it is correct for the build you are on. That is more than CMS can say.
                == Articles
                ${topics.map(([url, label]) => `- ${E.link(url, label)}`).join('\n')}
                == Did you know…
                - …that a SEV-1 outage runs its production line on the backup choir at ${E.lit(outage)}, not zero?
                - …that a Mandate branch you once certified on keeps ${E.lit(residue)} of its strength forever?
                - …that walking away from the console never escalates an incident?
                @note Cosmopedia is not affiliated with CMS. CMS has asked it to stop being right.`;
            },
        },

        'cosmopedia://incidents': {
            title: 'Incidents — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const I = Incidents;
                const ch = I.SPAWN_CHANCE;
                return `
                @masthead Cosmopedia | Incidents
                = Incidents
                An **incident** is a ticket the system files when something in Sector 7G goes wrong. At most ${E.n(I.MAX_OPEN)} are open at once. Triage lives in Task Manager; the tray lamp marked INC shows the queue.
                == Severity
                |! Severity | What it does | Clock
                | SEV-3 | its effect, at the mild strength | escalates after ${E.mins(I.ESCALATE_AFTER[3])} of attended time
                | SEV-2 | the same effect, stronger | escalates after ${E.mins(I.ESCALATE_AFTER[2])}
                | SEV-1 OUTAGE | its production line runs on the backup choir at ${L.pct(I.OUTAGE_SCALE)}, plus the SEV-2 effect where that is on something else | contained after ${E.mins(I.OUTAGE_CONTAINED_AFTER)}
                An outage that nobody touches is **contained by the on-call rota**: the ticket closes and is filed as a deferral at outage depth, which lasts until the build ships.
                == Three answers
                - **Labour.** Stabilise it by hand: align the needle with the band, ${E.n(I.LABOUR_HITS[3])} / ${E.n(I.LABOUR_HITS[2])} / ${E.n(I.LABOUR_HITS[1])} hits at SEV-3 / 2 / 1. The only answer that pays: ${E.n(I.LABOUR_CHARGE[3])} / ${E.n(I.LABOUR_CHARGE[2])} / ${E.n(I.LABOUR_CHARGE[1])} Overclock charge.
                - **Resources.** Pay it off in seconds of the line's production — ${E.n(I.COST[3][2])}, ${E.n(I.COST[2][2])} or ${E.n(I.COST[1][2])} seconds by severity — never less than ${L.pct(I.COST[3][0])} nor more than ${L.pct(I.COST[3][1])} of the vault at SEV-3 (${L.pct(I.COST[1][0])}–${L.pct(I.COST[1][1])} at SEV-1).
                - **Debt.** Defer it. The ticket closes and a penalty stays on the build until it ships; a deeper ticket leaves a deeper penalty.
                A **Prophet** can be sent to a SEV-3; it stops the clock and closes the ticket after ${E.mins(I.PROPHET_SECONDS)}. A quarantined log or a patched module's .bak from the Recycle Bin can be **sacrificed** to close any ticket.
                == False alarms
                About ${L.pct(I.FALSE_ALARM_CHANCE)} of tickets are false alarms — never the first one a save sees. A false alarm applies no effect, so your rates do not move, and its report has a tell. Ignored, it closes itself when it would have escalated, and its log is quarantined in the Recycle Bin.
                == When tickets are filed
                None during your first ${E.mins(I.QUIET_SECONDS)} of attended play, nor before your first Divine Directive is done. After that, one roll per attended ${E.mins(I.SPAWN_INTERVAL).replace(/^1 /, '')}: ${L.pct(ch.stable)} on Stable, ${L.pct(ch.beta)} on Beta, ${L.pct(ch.nightly)} on Nightly, and each unpatched known issue adds ${L.pct(I.ISSUE_PRESSURE)} of that again. Filings are at least ${E.n(I.SPAWN_GAP)} seconds apart. On Nightly, ${L.pct(I.NIGHTLY_SEV2_CHANCE)} of real tickets open at SEV-2.
                == Absence is never punished
                After ${E.mins(I.PRESENCE_SECONDS)} without input the queue goes **on hold**: penalties lift, clocks freeze, nothing new is filed and no dialog opens. You come back to at least ${E.n(I.RETURN_GRACE)} seconds on every clock. Offline progress, the Temporal Rift and a suspended tab never file or escalate anything.
                @note See also: [[sector://7g/status|live status]] · [[tape:t5|Tape T5: Incident Response Etiquette]]`;
            },
        },

        'cosmopedia://reality-builds': {
            title: 'Reality Builds — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const Ec = Economy;
                const rows = Object.entries(RealityChannels).map(([id, c]) => {
                    const range = (r) => (r[0] === r[1] ? E.n(r[0]) : `${E.n(r[0])}–${E.n(r[1])}`);
                    const opens = channelOpensAt(id);
                    if (id === 'archived') return `| ${c.label} | ${opens === null ? '—' : `reboot ${E.n(opens)}`} | replays a build you shipped, entry for entry | | | | ×${E.lit(String(c.divinity))}`;
                    return `| ${c.label} | ${opens === null ? '—' : `reboot ${E.n(opens)}`} | ${range(c.improvements)} | ${range(c.issues)} | ${range(c.regressions)} | ${L.pct(c.deprecations)} | ×${E.lit(String(c.divinity))}`;
                }).join('\n');
                const tiers = Ec.cascadeTiers.map((t) => `| ${E.lit(t.label)} | ${E.lit(String(t.at))} | ${L.pct(t.output)} | ${L.pct(t.award)}`).join('\n');
                const issues = Reality.issueIds().size;
                return `
                @masthead Cosmopedia | Reality Builds
                = Reality Builds
                A Divine Reboot does not restore the same universe: it ships a new **build**, with release notes. The notes are the run's rules — improvements, known issues, regressions, and sometimes a deprecation that cripples a system rather than removing it.
                A build is a pure function of your save's seed, your reboot count and the channel. Reloading does not re-roll it. The game opens on v${E.lit(Reality.OPENING_BUILD.version)}, in which Sector 7G has already failed its integrity check.
                == Channels
                |! Channel | Opens | Improvements | Known issues | Regressions | Deprecation | Divinity
                ${rows}
                The payout is hazard pay, priced on the build you actually played.
                == Known issues and patching
                Pay a known issue's cost to patch it. The price follows your vault **capacity**, not your holdings, so sitting at zero does not make patching free.
                == Instability
                From your first release, every unpatched known issue adds instability while the game is running: ${E.lit(String(Ec.instabilityPerWeightHour))} per hour per unit of weight, where weight is 4 minus its severity (a SEV-1 counts 3, a SEV-3 counts 1). Patching gives back ${E.lit(String(Ec.instabilityReliefPerWeight))} per unit of weight at once. With nothing left unpatched the build settles by ${E.lit(String(Ec.instabilityRecoveryPerHour))} an hour. Time offline and a suspended tab never add to it; the Temporal Rift's hour does.
                |! Tier | At | Output | Release award
                ${tiers}
                A collapsed build pays nothing, but it can still ship.
                == The permanent record
                Known issues shipped unpatched become **scars**: filed once per issue, ever, and kept at ${L.pct(Ec.scarResidue)} of their strength forever. There are ${E.n(issues)} distinct known issues to collect, which is not a recommendation.
                @note See also: [[cms://releases|Release notes archive]] · [[cosmopedia://archived-channel|The Archived channel]] · [[tape:t3|Tape T3]]`;
            },
        },

        'cosmopedia://certification': {
            title: 'Certification — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const names = Reality.BRANCHES.map((b) => b.charAt(0).toUpperCase() + b.slice(1));
                return `
                @masthead Cosmopedia | Certification
                = Certification
                The Divine Mandates tree has three branches: ${names.map((n) => `**${n}**`).join(', ')}. Buying a node unlocks it for good; **certification** decides which unlocked nodes are live.
                == How it works
                - When you ship a build you certify the next run on one path. There is no default: the ship dialog will not arm until you choose.
                - The certified path runs at full strength.
                - A path you have certified on before, but are not on now, is **lapsed**: it keeps ${L.pct(Economy.certificationResidue)} of what you bought, forever.
                - A path you have never certified on is **dormant** and pays nothing, however much of it you own.
                Your current path: **${E.lit(ctx.certPath ? ctx.certPath.charAt(0).toUpperCase() + ctx.certPath.slice(1) : 'none yet')}**.
                @note See also: [[cosmopedia://divine-reboot|Divine Reboot]] · [[tape:t4|Tape T4: Shipping a Build]]`;
            },
        },

        'cosmopedia://storage': {
            title: 'Storage — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const v = repeatable('praise_vault');
                const cap = repeatable('offline_capacitor');
                const Ec = Economy;
                const startCap = typeof PRISTINE !== 'undefined' ? PRISTINE.resourceCaps.praise : null;
                const offline = typeof PRISTINE !== 'undefined' ? PRISTINE.offlineEfficiency : null;
                return `
                @masthead Cosmopedia | Storage
                = Storage
                Every resource sits in a vault with a ceiling. At the ceiling the readout says STORAGE FULL and anything further is **discarded**.
                ${startCap !== null ? `A fresh Praise vault holds ${E.n(startCap)}, and the opening build halves it: Sector 7G runs on the surviving partition until you patch it.` : ''}
                == Vault ranks
                Vault upgrades (the ${E.lit(v.name)}, the Sacred Repository, the Soul Reliquary and their Void counterparts) are priced at **${L.pct(v.costFraction)} of the vault they extend**, never less than a small floor. Each rank grants a fixed step that grows ${L.pct(v.capacityGrowth - 1)} per rank — the ${E.lit(v.name)} starts at +${E.n(v.capacityStep)}. Buying storage always means emptying most of a full vault for a fraction of it back, so it competes with automatons for the same currency.
                Ranks reset when you reboot, with the rest of the run.
                == Away from the console
                The universe keeps running while you are away${offline !== null ? ` — at ${L.pct(offline)} of live production, before upgrades —` : ''} for ${E.plural(Ec.offlineBaseHours, 'hour')}, plus ${E.plural(Ec.offlineHoursPerCapacitor, 'hour')} per rank of the ${E.lit(cap.name)}, up to ${E.plural(Ec.offlineMaxHours, 'hour')}. A full vault does not fill any further while you are gone.
                == Prices that follow the vault
                Patch costs, Patience.exe's Mulligans and incident payoffs are all priced against vault capacity, so they mean the same thing at minute five and hour fifty.
                @note See also: [[tape:t1|Tape T1]] · [[cosmopedia://automatons|Automatons]]`;
            },
        },

        'cosmopedia://automatons': {
            title: 'Automatons — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const A = AutomatonSpecs;
                const Ec = Economy;
                const cur = { praise: 'Praise', offerings: 'Offerings', souls: 'Souls' };
                const row = (id, does) => `| ${E.lit(A[id].label)} | ${E.n(A[id].baseCost)} ${cur[A[id].currency]} | ×${E.lit(String(A[id].growth))} | ${does}`;
                return `
                @masthead Cosmopedia | Automatons
                = Automatons
                The celestial hierarchy is a chain: each rank is bought with the output of the rank above it.
                |! Rank | First costs | Price growth | Work
                ${row('seraph', `sings ${E.n(A.seraph.ratePerUnit)} Praise a second`)}
                ${row('throne', `burns ${E.lit(String(Ec.thronePraiseDraw))} Praise a second into ${E.lit(String(Ec.throneOfferingYield))} Offerings`)}
                ${row('cherub', 'compiles Offerings into Souls')}
                ${row('dominion', `lifts all production by ${L.pct(Ec.dominionBonusEach)} each`)}
                A Throne draws Praise to do its work. If your Praise runs dry, so does everything downstream of it.
                @image seraph-diagram | Fig. 1 — a Seraph, folded.
                @note See also: [[seraph://fanpage|a Seraph fan page]] · [[tape:t2|Tape T2]] · [[cosmopedia://void|the Void's mirror ranks]]`;
            },
        },

        'cosmopedia://divine-reboot': {
            title: 'Divine Reboot — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const Ec = Economy;
                return `
                @masthead Cosmopedia | Divine Reboot
                = Divine Reboot
                **Shipping the build is the reboot.** Once a run has earned enough Souls, Divine Settings lets you ship it. The run resets; you keep Divinity, Mandates, achievements and documents.
                == The bar
                A run qualifies when its Souls — earned since the last reboot, not lifetime — reach ${E.n(Ec.prestigeSoulsPerPoint)} × (1 + Divinity banked)^${E.lit(String(Ec.prestigeThresholdGrowth))}. For you, now, that is **${E.n(ctx.bar)}** Souls; this run has ${E.n(ctx.runSouls)}.
                == The award
                Divinity = (run Souls ÷ bar)^${E.lit(String(Ec.prestigeExponent))}, rounded down and never less than 1, then multiplied by the channel's payout and by the cascade's release award. A deeper run pays more, but not proportionally more.
                Banked Divinity lifts all production by 1 + Divinity^${E.lit(String(Ec.prestigeBonusExponent))} × ${E.lit(String(Ec.prestigeBonusScale))}.
                == Standing Doctrine
                The endless Divinity sink: +${L.pct(Ec.doctrineBonusEach)} production per rank, the first rank costing ${E.n(Ec.doctrineBaseCost)} Divinity and each one after ×${E.lit(String(Ec.doctrineGrowth))}.
                @note See also: [[cosmopedia://certification|Certification]] · [[cosmopedia://reality-builds|Reality Builds]] · [[tape:t4|Tape T4]]`;
            },
        },

        'cosmopedia://void': {
            title: 'The Void — Cosmopedia',
            theme: 'wiki',
            unlock: (ctx) => ctx.voidUnlocked || ctx.inVoid || ctx.reboots >= 1,
            hint: 'Cosmopedia has not been told about the Void yet. Breach the Veil, or ship a build.',
            render(ctx, E) {
                const A = AutomatonSpecs;
                const Ec = Economy;
                const breach = upgrade('void_unlock');
                const quote = typeof AdversaryBarks !== 'undefined' ? AdversaryBarks.find((b) => b.id === 'ADV-BARK-03') : null;
                return `
                @masthead Cosmopedia | The Void
                = The Void
                ${quote ? `> “${E.lit(quote.text)}”` : ''}
                The **Void** is the Sector's darker reflection. **Breach the Veil** costs ${E.n(breach ? breach.cost.souls : 0)} Souls, and every reboot reseals it, so each run breaches it afresh.
                == The mirror hierarchy
                |! Rank | First costs | Work
                | ${E.lit(A.wraith.label)} | ${E.n(A.wraith.baseCost)} Darkness | bleeds Darkness out of the tear
                | ${E.lit(A.revenant.label)} | ${E.n(A.revenant.baseCost)} Darkness | burns ${E.lit(String(Ec.revenantDarknessDraw))} Darkness a second into ${E.lit(String(Ec.revenantShadowYield))} Shadows
                | ${E.lit(A.phantom.label)} | ${E.n(A.phantom.baseCost)} Shadows | folds Shadows into Echoes
                | ${E.lit(A.nemesis.label)} | ${E.n(A.nemesis.baseCost)} Echoes | lifts **all** production, in both dimensions, by ${L.pct(Ec.nemesisBonusEach)} each
                The Nemesis is the whole reason to leave a running primordial economy for the Void.
                == Null Doctrine
                Echoes bought into a permanent multiplier: +${L.pct(Ec.nullDoctrineBonusEach)} per rank, the first costing ${E.n(Ec.nullDoctrineBaseCost)} Echoes and each one after ×${E.lit(String(Ec.nullDoctrineGrowth))}. It survives reboots.
                == In the release notes
                From your first release, builds can carry Void entries — improvements, known issues priced in Void currencies, regressions, and a deprecation that cripples the Nemesis lift.
                @note Visitors to the Void have their own board: [[void://forum|the Void forum]].`;
            },
        },

        'cosmopedia://patience': {
            title: 'Patience.exe — Cosmopedia',
            theme: 'wiki',
            unlock: (ctx) => ctx.apps.includes('solitaire') || ctx.apps.includes('adorationshop'),
            hint: 'Patience.exe is sold through the Adoration Shop, which you have not reached yet.',
            render(ctx, E) {
                const R = PatienceRules;
                const P = PatienceLedger;
                const item = shopItem('minigame_solitaire');
                const suits = R.SUITS.map((s) => R.SUIT_NAMES[s]).join(', ');
                return `
                @masthead Cosmopedia | Patience.exe
                = Patience.exe
                **Golf solitaire**, dealt by Fate. Install it from the Adoration Shop for ${E.n(item ? item.cost : 0)} Adoration. The four suits are the four automaton ranks: ${E.lit(suits)}. The court cards are the ${E.lit(R.RANK_NAMES[11])}, the ${E.lit(R.RANK_NAMES[12])} and the ${E.lit(R.RANK_NAMES[13])}.
                == Rules
                ${E.n(R.COLUMNS)} columns, ${E.n(R.DEPTH)} cards deep; the rest is the stock. Play an exposed card onto the waste if it is one rank above or below the top card. A King does not reach an Ace. Draw from the stock when you are stuck. Par is finishing with ${E.n(P.PAR)} or fewer cards left.
                == What it pays
                - ${E.n(P.ADORATION_PER_CARD)} Adoration and ${E.lit(String(P.CHARGE_PER_CARD))} Overclock charge per card cleared.
                - A full clear: +${E.n(P.CLEAR_ADORATION)} Adoration and +${E.n(P.CLEAR_CHARGE)} charge.
                - A par round: +${E.n(P.STREAK_ADORATION)} Adoration per round of the current par streak, up to ${E.n(P.STREAK_CAP)}.
                == Fatigue
                It is a break, not a farm. The first ${E.n(P.FREE_ROUNDS)} rounds pay in full; after that each round pays ×${E.lit(String(P.DECAY))} of the one before, never below ${L.pct(P.FLOOR)}. Fatigue drains by ${E.n(P.RECOVERY_PER_HOUR)} rounds an hour.
                == Divine Mulligans
                Paid in Praise, once each per round: undo the last play for ${L.pct(P.MULLIGAN_FRACTION.undo)} of your Praise vault, or reshuffle the stock for ${L.pct(P.MULLIGAN_FRACTION.reshuffle)}.
                @note ${ctx.apps.includes('solitaire') ? '[[app:solitaire|Deal a round]] · ' : ''}[[fate://casino|Fate's]] · [[doc:DOC-NEW-12|House rules]]`;
            },
        },

        'cosmopedia://archived-channel': {
            title: 'The Archived channel — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const who = ctx.adversary.contacted ? "NULL.OPERATOR's annotations" : 'annotations, in a hand you will recognise,';
                return `
                @masthead Cosmopedia | The Archived channel
                = The Archived channel
                From reboot ${E.n(Reality.ARCHIVE_UNLOCK)}, the ship dialog offers **Archived**: replay a build you have shipped before, from your release history.
                - The replay is the same universe, entry for entry: same seed, same version, same known issues.
                - It pays **no Divinity** and does not move the bar — and it still has to clear the bar to ship.
                - When the replay starts, ${who} on what you shipped are filed to Recovered Documents, once per original build.
                - Your release history keeps the last ${E.n(Reality.HISTORY_CAP)} builds.
                You have shipped ${E.plural(ctx.history.filter((r) => r.channel === 'archived').length, 'replay')} and filed ${E.plural(ctx.annotations.length, 'annotated build')}.
                @note Archived branches never stop running. They only stop being watched.`;
            },
        },

        'cosmopedia://sector-7g': {
            title: 'Sector 7G — Cosmopedia',
            theme: 'wiki',
            render(ctx, E) {
                const opening = Reality.OPENING_BUILD.entries[0];
                const mod = opening.mods[0];
                const sectors = typeof IncidentSectors !== 'undefined' ? IncidentSectors : [];
                const patched = !!(ctx.reboots === 0 && ctx.build && ctx.build.entries.some((e) => e.id === opening.id && e.patched));
                return `
                @masthead Cosmopedia | Sector 7G
                = Sector 7G
                **Sector 7G** is the sector you were assigned when the previous Operator retired. It is where the Universal Engine is, and where most things go wrong first.
                == The integrity check
                The universe opens on Reality v${E.lit(Reality.OPENING_BUILD.version)}, which ships with exactly one known issue, at SEV-${E.n(opening.severity)}:
                > ${E.lit(opening.note)}
                Its effect is a Praise vault at ${L.pct(mod.value)} of capacity. Patching it costs ${L.pct(opening.patchCost.scale)} of your Praise capacity (not counting the issue itself), and it is most Operators' first patch. ${patched ? 'You have patched it. The partition has been restored.' : ''}
                The opening build never accrues instability: the cascade arrives with your first release, alongside everything else shipping is.
                == Neighbours
                Incident tickets name the sector they came from: ${sectors.map((x) => E.lit(x)).join(', ')}. Most of them are not yours. All of them are your problem.
                == See also
                - [[sector://7g/status|Sector 7G service status]] (live)
                - [[doc:DOC-NEW-03|The Sector 7G maintenance log]]
                - [[operator://home|The previous Operator's home page]]
                - [[tape:t1|Tape T1 — Welcome to Sector 7G]]
                @note Sector 7G makes a noise on cold mornings. It is not a known issue.`;
            },
        },

        /* ─────────────────────────── Fate ─────────────────────────────── */
        'fate://casino': {
            title: "Fate's — Games of Patience and Chance",
            theme: 'casino',
            unlock: (ctx) => ctx.apps.includes('solitaire') || ctx.apps.includes('adorationshop'),
            hint: "Fate's is by invitation. Invitations are issued through the Adoration Shop.",
            render(ctx, E) {
                const greet = typeof CasinoHostBarks !== 'undefined' ? CasinoHostBarks.filter((b) => b.trigger === 'casino_enter') : [];
                const line = greet.length ? greet[(ctx.store.counterHits + ctx.reboots) % greet.length].text : 'Welcome, darling.';
                const table = ctx.patience;
                const installed = ctx.apps.includes('solitaire');
                const reply = (ctx.adversary.sceneCompleted && ctx.adversary.band !== 'hostile' && typeof CasinoHostBarks !== 'undefined')
                    ? CasinoHostBarks.find((b) => b.id === 'CAS-HOST-081') : null;
                return `
                @sign FATE'S | games of patience and chance
                @clip fate-table | The table at Fate's. The dealer does not appear on camera.
                > “${E.lit(line)}”
                > — Fate, your host
                == Now dealing
                **Patience.exe** — Golf solitaire, dealt from the celestial arcana. ${installed ? '[[app:solitaire|Take a seat]].' : 'Install it from the Adoration Shop and the table is yours.'}
                ${installed ? `|! At the table | \n| Rounds played | ${E.n(table.rounds)}\n| Full clears | ${E.n(table.wins)}\n| Best par streak | ${E.n(table.bestParStreak)}` : ''}
                == House rules
                The house does not pay for barks. The house does not take Souls. The house is patient, which is more than can be said for the guests. The full rules are posted: [[doc:DOC-NEW-12|House Rules & Payouts]].
                ${reply ? `== A word about the other gentleman\n> “${E.lit(reply.text)}”` : ''}
                @note Fate's is a contractor and is not affiliated with Celestial Micro-Systems. [[cosmopedia://patience|Rules, explained by people who counted]].`;
            },
        },

        /* ─────────────────────────── The fan ring ─────────────────────── */
        'seraph://fanpage': {
            title: '~*~ The Seraph Appreciation Page ~*~',
            theme: 'geo',
            render(ctx, E) {
                const seraphs = ctx.automatons.seraph;
                return `
                @center ~*~ WELCOME TO THE SERAPH APPRECIATION PAGE ~*~
                @construction
                @blink NEW! | pictures of the choir (coming soon)
                @marquee Seraphs sing ${E.n(AutomatonSpecs.seraph.ratePerUnit)} Praise a second, forever, without being asked. | That is more than most of us manage.
                = Hi and welcome!!
                This page is all about **Seraphic Automata**, the best rank of the celestial hierarchy (in my opinion). Six wings! Brass organ pipes! They start singing before you finish commissioning them.
                There are currently **${E.n(seraphs)}** Seraphs singing in Sector 7G. ${seraphs >= 40 ? 'A choir of forty! The tape was right!' : 'The tape says a choir of forty is a sound investment.'}
                @clip seraph-choir | My Seraph choir, recorded on a Tuesday.
                == Seraph facts
                - A Seraph costs ${E.n(AutomatonSpecs.seraph.baseCost)} Praise. Each one after costs a bit more. The tape calls this procurement.
                - Some Seraphs have opinions. They keep them to themselves. (Read [[doc:DOC-NEW-07|Incident 32B]] if you dare!!)
                - The Instructor has a whole tape about them: [[tape:t2|T2 — Commissioning Your First Seraph]].
                == You are visitor number
                @counter
                == Sign my guestbook!
                @guestbook
                == The Automaton Appreciation Ring
                @webring seraph://fanpage
                @note This page was made in Etherscape Navigator. Best viewed with your eyes. Last updated: the eternal now.`;
            },
        },

        'throne://fanclub': {
            title: 'THRONE OWNERS CLUB (official)',
            theme: 'geo',
            unlock: (ctx) => ctx.automatons.throne >= 1,
            hint: 'Members only. Commission a Throne to join.',
            render(ctx, E) {
                return `
                @center ** THRONE OWNERS CLUB ** est. the first conversion
                @construction
                = Welcome, fellow Throne owner
                Thrones get no respect. Everybody loves the Seraphs because they **sing**. A Throne just sits there burning ${E.lit(String(Economy.thronePraiseDraw))} Praise a second into ${E.lit(String(Economy.throneOfferingYield))} Offerings, and without it you would have no Offerings, no Cherubs and no Souls. Think about that.
                Club roll: **${E.n(ctx.automatons.throne)}** Thrones in Sector 7G.
                == Club rules
                - No complaining about the Praise draw. It is called a **conversion**. Look it up.
                - If a known issue says "conduit over-pressure", the third regulator is on fire. This is normal.
                - Do not let your Praise run dry. Everything downstream of a Throne goes dry with it.
                == The Automaton Appreciation Ring
                @webring throne://fanclub
                @note Club page hosted free of charge. Pop-ups not included because we have not invented them yet.`;
            },
        },

        'cherub://shrine': {
            title: 'A Shrine to the Cherubic Processors',
            theme: 'geo',
            unlock: (ctx) => ctx.automatons.cherub >= 1,
            hint: 'The shrine opens to those who have commissioned a Cherub.',
            render(ctx, E) {
                return `
                @center ✧ A SHRINE TO THE CHERUBIC PROCESSORS ✧
                = They file the Souls
                Nobody thanks the Cherubs. They take the Offerings, they compile them into Souls, and they file every one under the right saint. Mostly the right saint.
                Cherubs on duty in Sector 7G: **${E.n(ctx.automatons.cherub)}**.
                > Saint Agnes now holds eleven thousand fishermen.
                > — from a reliquary misfiling ticket, which we keep framed
                == Offerings left at the shrine
                - one (1) Offering, slightly blessed
                - a tagging gun, returned
                - a note: "please double-check every filing" (unsigned)
                == The Automaton Appreciation Ring
                @webring cherub://shrine
                @note Light a candle. Not near the reliquary.`;
            },
        },

        'webring://automata': {
            title: 'The Automaton Appreciation Ring',
            theme: 'geo',
            render(ctx, E) {
                const members = RING.map((u) => `- ${E.link(u)}`).join('\n');
                return `
                @center ★ THE AUTOMATON APPRECIATION RING ★
                = Member sites
                A ring of homepages about the celestial hierarchy, made by the people who love it. Every site in the ring links to the next. If a link is grey, you have not commissioned that rank yet.
                ${members}
                == Join the ring
                Applications are closed. The Dominions have not replied to their invitation. The Dominions do not reply.
                @note Ring hub hosted on the Etherscape.`;
            },
        },

        /* ─────────────────────────── The Void ─────────────────────────── */
        'void://forum': {
            title: 'THE VOID // bulletin board',
            theme: 'void',
            unlock: (ctx) => ctx.inVoid,
            hint: 'Members only. Membership is granted on the far side of the Veil.',
            announce: '[ETHERSCAPE] A bulletin board on the far side of the Veil has added you to its member list: void://forum.',
            render(ctx, E) {
                const posts = [];
                posts.push(`@post wraith_42 | thread: who else hears the hum
                > the new one is through the veil. they breached it like it was nothing. they always do.
                > reboots on record for 7G: ${E.n(ctx.reboots)}. every one of them sealed us back in.`);
                posts.push(`@post revenant_rations | re: who else hears the hum
                > it's the choir clearing its throat on the other side. you get used to it. you don't.`);
                if (ctx.scars.length) {
                    posts.push(`@post phantom_echo_echo | thread: the permanent record
                    > they shipped ${E.plural(ctx.scars.length, 'known issue')} without patching. each one is a bolt left loose. somebody has to live on the far side of a loose bolt.
                    > (echo) somebody has to live on the far side of a loose bolt.`);
                }
                if (ctx.reels.includes('rec-sector-7g')) {
                    posts.push(`@post wraith_42 | thread: found this on an old drive
                    > promo reel from before. 7G with the lights on. CMS never released it. look at the core, then look at the date.
                    > [[reel:rec-sector-7g|7G_BEFORE.rec]] (do not tell the Cherubs. they cry.)`);
                }
                if (ctx.adversary.contacted && !ctx.endingWorn) {
                    posts.push(`@post void_mirror.service#2 | thread: read the release notes
                    > ${ctx.adversary.band === 'hostile' ? "I've stopped asking them. They'll learn or they'll ship it." : ctx.adversary.band === 'complicit' ? 'They let me drive sometimes now. The console is warmer than you\'d think.' : 'They asked what the patch does. Nobody asks.'}`);
                }
                if (ctx.endingWorn === 'hostile') {
                    posts.push(`@post [deleted] | thread: read the release notes
                    > [this user's process was ended by its owner]`);
                } else if (ctx.endingWorn === 'curious') {
                    posts.push(`@post void_mirror.service#2 | thread: night shift
                    > on nights now. the other one leaves notes in the margins. I leave better ones.`);
                } else if (ctx.endingWorn === 'complicit') {
                    posts.push(`@post void_mirror.service | thread: management change
                    > the old Operator is in the archive now. say hi. they answer a little late.`);
                }
                return `
                @masthead THE VOID | a bulletin board for the other side
                @image void-forum-banner | The board, as seen from the tear.
                Posting as: **${E.lit(ctx.endingWorn === 'complicit' ? 'operator_emeritus' : 'guest_7G')}** · ${E.plural(posts.length, 'post')} since your last visit
                ${posts.join('\n---\n')}
                ---
                @note Board rules: no light. no mirrors. no reading the release notes aloud. [[cosmopedia://void|what is this place?]]`;
            },
        },

        'null://': {
            title: 'null://',
            theme: 'null',
            unlock: (ctx) => ctx.adversary.contacted,
            secret: true,
            announce: '[ETHERSCAPE] A page you did not visit has been added to your history: null://',
            render(ctx, E) {
                const a = ctx.adversary;
                const receipts = `
                == Receipts
                |! Kept | Count
                | Builds you shipped | ${E.n(ctx.history.length)}
                | Known issues you left loose | ${E.n(ctx.scars.length)}
                | Branches I annotated | ${E.n(ctx.annotations.length)}
                ${ctx.annotations.map((x) => `- [[doc:ARC-${String(x.level).padStart(4, '0')}|v${E.lit(ctx.versionOf(x.level))}, annotated]]`).join('\n')}`;
                // QA's tape of where he came from (js/footage.js), once it is installed.
                const test = ctx.reels.includes('rec-mirror-test')
                    ? '\n> You want to know where I came from. QA has a tape. They marked it passed. [[reel:rec-mirror-test|MIRROR_TEST_7781-A.rec]]' : '';
                if (ctx.endingWorn) {
                    const ending = ENDING_LABEL(ctx.endingWorn);
                    const body = {
                        hostile: `This page is served from an archived branch. In this one, you never ended me.\n> ${E.lit(ending.letter[0])}`,
                        curious: `Night shift notes. Read them in the morning.\n> ${E.lit(ending.letter[0])}`,
                        complicit: `Welcome, Operator Emeritus. This is my console now. You can still reach yours; your clicks land a little late.\n> ${E.lit(ending.letter[0])}`,
                    }[ctx.endingWorn];
                    return `
                    = ${E.lit(ending.label)}
                    ${body}${test}
                    > ${E.lit(ending.signoff)}
                    ${receipts}
                    @clip null-operator | (recording continued after the end of the programme)`;
                }
                if (!a.sceneCompleted) {
                    return `
                    = null://
                    There is nothing here.
                    You looked anyway. That is the difference between us, for now.`;
                }
                const line = {
                    hostile: 'You never let me help. Fine. I keep the receipts, you keep the console.',
                    curious: 'You asked what the patch does. Nobody asks. Keep asking.',
                    complicit: "Leave the console running tonight. I'll take it from here. You won't notice.",
                }[a.band] || 'I am what happens to an Operator who reboots and never reads the release notes.';
                return `
                = null://
                ${E.lit(line)}${test}
                ${receipts}
                @note Relationship on file: ${E.lit(a.band)}. This page is not indexed. You found it because I left it open.`;
            },
        },

        /* ─────────────────────────── The previous Operator ────────────── */
        'operator://home': {
            title: "The Operator's Home Page",
            theme: 'operator',
            unlock: (ctx) => ctx.reboots >= 1,
            hint: 'Retired accounts are visible to Operators who have shipped a build.',
            render(ctx, E) {
                return `
                @center ~ The Operator's Home Page ~
                @construction
                = Gone fishing
                If you are reading this, you are the new Operator. Congratulations, and sorry.
                The universe is in good hands. I know because they are not mine any more.
                == Things I meant to tell you
                - Sector 7G makes a noise on cold mornings. It is not a known issue. It is the choir clearing its throat.
                - Read the release notes. Every build. I didn't, for a while.
                - The tapes are good. The Instructor is better in person. Nobody has met the Instructor in person.
                - My notes are in [[doc:DOC-NEW-03|the maintenance log]] and [[doc:DOC-NEW-13|the ALPHA-2 postmortem]].
                == My links
                - [[cms://intranet|Work]]
                - [[cosmopedia://|Cosmopedia]] (I wrote the first article. It was wrong.)
                - [[fishing://lake|The lake]]
                == Guestbook (read-only)
                > Good luck out there. — the Instructor
                ${ctx.adversary.contacted ? '> I read your notes. All of them. — N0' : ''}
                @note Last updated: reboot 0, in a branch that is still running.`;
            },
        },

        /* ─────────────────────────── The Navigator ────────────────────── */
        'etherscape://whats-cool': {
            title: "What's Cool? — Etherscape Navigator",
            theme: 'directory',
            render(ctx, E) {
                const group = (name, urls) => `== ${name}\n${urls.map((u) => `- ${E.link(u)}`).join('\n')}`;
                return `
                @masthead What's Cool? | the Etherscape Navigator directory
                Hand-picked pages from across the afterlife web, chosen by the Etherscape staff. Grey links are pages you cannot reach yet; hold the pointer over one to see why.
                ${group('Work', ['cms://intranet', 'cms://hr/policies', 'cms://hr/directory', 'cms://releases', 'sector://7g/status'])}
                ${group('News & reference', ['news://celestial-times', 'cosmopedia://', 'cosmopedia://incidents', 'cosmopedia://reality-builds'])}
                ${group('Leisure', ['fate://casino', 'webring://automata', 'seraph://fanpage', 'throne://fanclub', 'cherub://shrine'])}
                ${group('Personal pages', ['operator://home', 'void://forum'])}
                @note Etherscape Navigator 3.0 · Sacred OS edition. Type an address into the Location bar and press Enter.`;
            },
        },
    };

    /* Every media slot named by a page, for docs and tests. */
    function mediaSlots() {
        const out = [];
        const scan = (markup) => {
            const re = /@(clip|image)\s+([a-z0-9-]+)/g;
            let m;
            while ((m = re.exec(markup))) out.push({ kind: m[1], slug: m[2] });
        };
        for (const page of Object.values(pages)) {
            const src = page.render.toString();
            scan(src);
        }
        return out;
    }

    return { pages, RING, channelOpensAt, mediaSlots };
})();

/* ════════════════════════════════════════════════════════════════════════
   The binding: state, the public API, the unlock watch and the window.
   ════════════════════════════════════════════════════════════════════════ */
const Etherscape = (() => {
    'use strict';
    const L = EtherscapeLogic;
    const S = EtherscapeSites;
    const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined' &&
        typeof document.createElement === 'function' && typeof document.addEventListener === 'function';
    const APP_ID = 'etherscape';
    const KNOWN = new Set(Object.keys(S.pages));
    const esc = L.esc;

    /* ── State ────────────────────────────────────────────────────────── */
    let checked = null;
    let fallback = null;
    function store() {
        const root = (typeof State !== 'undefined' && State) ? State : (fallback = fallback || {});
        if (root.etherscape !== checked || !root.etherscape) {
            const clean = L.normalise(root.etherscape, KNOWN);
            const cur = root.etherscape;
            if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
                for (const key of Object.keys(cur)) if (!(key in clean)) delete cur[key];
                Object.assign(cur, clean);
            } else {
                root.etherscape = clean;
            }
            checked = root.etherscape;
        }
        if (!root.etherscape.counterSeed) root.etherscape.counterSeed = 1 + Math.floor(Math.random() * 999999);
        return root.etherscape;
    }

    function save() {
        try { if (typeof State !== 'undefined' && State && typeof State.save === 'function') State.save(); } catch (err) { /* never */ }
    }

    /* ── The snapshot every page renders from ──────────────────────────
       Read-only. Each section is guarded so a hostile or half-loaded
       save renders a thinner page instead of throwing. */
    function snapshot() {
        const St = (typeof State !== 'undefined' && State) ? State : {};
        const g = (typeof game !== 'undefined' && game) ? game : null;
        const safe = (fn, fallbackValue) => { try { const v = fn(); return v === undefined || v === null ? fallbackValue : v; } catch (err) { return fallbackValue; } };
        const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
        const count = (v) => Math.max(0, Math.floor(num(v)));
        const hasReality = typeof Reality !== 'undefined';

        const reboots = count(St.prestigeLevel);
        const ctx = { now: Date.now(), reboots };
        ctx.channelLabel = (id) => (typeof RealityChannels !== 'undefined' && RealityChannels[id] ? RealityChannels[id].label : String(id || 'Stable'));
        ctx.versionOf = (level) => (hasReality ? Reality.versionOfLevel(level) : String(level));

        const poolNote = {};
        if (typeof RealityPool !== 'undefined') {
            for (const list of Object.values(RealityPool)) for (const e of list || []) if (e && e.id) poolNote[e.id] = e.note;
        }
        if (hasReality) for (const e of Reality.OPENING_BUILD.entries) poolNote[e.id] = e.note;
        ctx.noteOf = (id) => poolNote[id] || id;

        ctx.build = safe(() => {
            const b = St.reality && St.reality.build;
            if (!b || typeof b !== 'object' || !Array.isArray(b.entries)) return null;
            const entries = b.entries.filter((e) => e && typeof e === 'object' && typeof e.id === 'string').map((e) => ({
                id: e.id,
                kind: ['improvement', 'issue', 'regression', 'deprecation'].includes(e.kind) ? e.kind : 'improvement',
                note: typeof e.note === 'string' ? e.note : (poolNote[e.id] || e.id),
                severity: [1, 2, 3].includes(e.severity) ? e.severity : 3,
                patched: e.patched === true,
            }));
            return { version: String(b.version || '?'), channel: typeof b.channel === 'string' ? b.channel : 'stable', seed: count(b.seed), entries };
        }, null);
        ctx.unpatched = ctx.build ? ctx.build.entries.filter((e) => e.kind === 'issue' && !e.patched) : [];
        ctx.nextChannel = safe(() => (typeof RealityChannels !== 'undefined' && RealityChannels[St.reality.channel] ? St.reality.channel : 'stable'), 'stable');
        ctx.history = safe(() => (hasReality ? Reality.normaliseHistory(St.reality && St.reality.history) : []), []);
        ctx.annotations = safe(() => (hasReality ? Reality.normaliseAnnotations(St.reality && St.reality.annotations) : []), []);
        ctx.scars = safe(() => {
            const ids = hasReality ? Reality.issueIds() : new Set();
            const list = Array.isArray(St.reality && St.reality.scars) ? St.reality.scars : [];
            return [...new Set(list.filter((id) => typeof id === 'string' && ids.has(id)))];
        }, []);
        ctx.cascade = safe(() => {
            const c = g.cascadeState();
            const step = c.tier > 0 && typeof Economy !== 'undefined' ? Economy.cascadeTiers[c.tier - 1] : null;
            return { ...c, at: step ? step.at : 0 };
        }, { instability: 0, tier: 0, label: 'NOMINAL', output: 1, award: 1, ratePerHour: 0, recovering: false, ceiling: 2, at: 0 });

        ctx.incidents = safe(() => {
            if (typeof Incidents === 'undefined') throw new Error('no incidents');
            const s = Incidents.state();
            return {
                open: s.open.map((inc) => ({ id: inc.id, title: Incidents.titleOf(inc), severity: inc.severity, sector: inc.sector })),
                onHold: s.onHold === true,
                stats: { ...s.stats },
                summary: Incidents.summary(),
            };
        }, { open: [], onHold: false, stats: { filed: 0, falseAlarmsCleared: 0, contained: 0, outages: 0 }, summary: { open: 0, worst: 4 } });

        const adv = (St.adversary && typeof St.adversary === 'object') ? St.adversary : {};
        ctx.adversary = {
            contacted: adv.contacted === true,
            sceneCompleted: adv.sceneCompleted === true,
            choice: ['OP-A', 'OP-B', 'OP-C'].includes(adv.playerChoice) ? adv.playerChoice : null,
            band: safe(() => g.adversaryRelationship(), 'curious'),
        };
        ctx.endings = safe(() => {
            const seen = g.endingsSeen();
            const hist = Array.isArray(St.endings && St.endings.history) ? St.endings.history : [];
            return seen.map((band) => {
                const h = hist.find((x) => x && x.ending === band);
                return { ending: band, reboot: h && Number.isInteger(h.reboot) && h.reboot >= 0 ? h.reboot : 0 };
            });
        }, []);
        ctx.endingWorn = safe(() => g.endingWorn(), null);

        const au = (St.automatons && typeof St.automatons === 'object') ? St.automatons : {};
        ctx.automatons = { seraph: count(au.seraphCount), throne: count(au.throneCount), cherub: count(au.cherubCount), dominion: count(au.dominionCount) };
        const vd = St.dimensions && St.dimensions.void;
        ctx.voidUnlocked = !!(vd && vd.unlocked === true);
        ctx.inVoid = St.currentDimension === 'void';
        ctx.apps = Array.isArray(St.unlockedApps) ? St.unlockedApps.filter((a) => typeof a === 'string') : [];
        ctx.tapes = safe(() => (typeof MediaLogic !== 'undefined' ? MediaLogic.normalise(St.settings && St.settings.media).tapes : []), []);
        // Recovered footage a page may link to: installed, and its moment come.
        ctx.reels = safe(() => (typeof Footage !== 'undefined' && Footage ? Footage.linkable() : []), []);
        ctx.docs = Array.isArray(St.documents && St.documents.collected) ? St.documents.collected.filter((d) => typeof d === 'string') : [];
        ctx.generatedDocs = safe(() => g.generatedDocuments().map((d) => d.id), []);
        ctx.bar = safe(() => g.getPrestigeThreshold(), 0);
        ctx.runSouls = safe(() => g.getRunSouls(), 0);
        ctx.certPath = St.certification && ['creation', 'maintenance', 'entropy'].includes(St.certification.path) ? St.certification.path : null;
        ctx.patience = safe(() => PatienceLedger.normalise(St.casino && St.casino.solitaire), { rounds: 0, wins: 0, bestParStreak: 0 });
        ctx.store = store();
        // Built on first read: the 1 Hz watch and knows() never need the paper.
        let heads = null;
        Object.defineProperty(ctx, 'headlines', { enumerable: true, get: () => (heads = heads || safe(() => L.headlines(ctx), [])) });
        return ctx;
    }

    /* ── Unlocks ──────────────────────────────────────────────────────── */

    /* The Navigator turns up with the first Seraph: the moment the job
       stops being one button and the Sector starts having a public. A save
       past its first reboot has that already. */
    function milestone(St = (typeof State !== 'undefined' ? State : null)) {
        if (!St || typeof St !== 'object') return false;
        const ap = St.achievementProgress || {};
        return Number(ap.buy_seraph_count) >= 1 || Number(St.automatons && St.automatons.seraphCount) >= 1 ||
            Number(ap.prestige_count) >= 1 || Number(St.prestigeLevel) >= 1;
    }

    function appUnlocked() {
        const St = typeof State !== 'undefined' ? State : null;
        return !!St && ((Array.isArray(St.unlockedApps) && St.unlockedApps.includes(APP_ID)) || milestone(St));
    }

    function liveUnlocked(page, ctx) {
        if (!page.unlock) return true;
        try { return page.unlock(ctx) === true; } catch (err) { return false; }
    }

    function pageReachable(url, ctx) {
        const page = S.pages[url];
        if (!page) return false;
        return liveUnlocked(page, ctx) || ctx.store.unlocked.includes(url);
    }

    /* Pages stay reachable once reached: the Void forum does not lock
       again when a reboot reseals the Veil. Returns the newly unlocked. */
    function observe(ctx = snapshot()) {
        const st = ctx.store;
        const fresh = [];
        for (const [url, page] of Object.entries(S.pages)) {
            if (!page.unlock || st.unlocked.includes(url)) continue;
            if (liveUnlocked(page, ctx)) { st.unlocked.push(url); fresh.push(url); }
        }
        return fresh;
    }

    function linkInfo(href, ctx) {
        const cross = L.crossLink(href);
        if (cross) return crossInfo(cross, ctx);
        const url = L.canonical(href);
        const page = S.pages[url];
        if (!page) return { state: 'missing', url };
        if (pageReachable(url, ctx)) return { state: 'ok', url, title: page.title, visited: ctx.store.visited.includes(url) };
        return { state: 'dead', url, title: page.title, hint: page.secret ? 'The server does not respond.' : (page.hint || 'This page is not available yet.') };
    }

    function crossInfo(cross, ctx) {
        const url = `${cross.type}:${cross.id}`;
        if (cross.type === 'doc') {
            const shipped = typeof DocumentManifest !== 'undefined' ? DocumentManifest.find((d) => d.id === cross.id) : null;
            const have = ctx.apps.includes('notepad') && (ctx.docs.includes(cross.id) || ctx.generatedDocs.includes(cross.id));
            const title = shipped ? shipped.title : cross.id;
            return have ? { state: 'ok', url, title, kind: 'doc' } : { state: 'dead', url, title, hint: 'Not in your Recovered Documents yet.' };
        }
        if (cross.type === 'tape') {
            const tape = typeof MediaCatalog !== 'undefined' ? MediaCatalog.tape(cross.id) : null;
            if (!tape) return { state: 'dead', url, title: cross.id, hint: 'No such tape.' };
            const have = ctx.apps.includes('mediaplayer') && ctx.tapes.includes(cross.id) && typeof MediaPlayerView !== 'undefined';
            return have ? { state: 'ok', url, title: `${tape.code} — ${tape.title}`, kind: 'tape' }
                : { state: 'dead', url, title: tape.code, hint: tape.secret ? 'Not filed.' : `Not filed yet. ${tape.hint}` };
        }
        if (cross.type === 'reel') {
            const reel = typeof FootageCatalog !== 'undefined' ? FootageCatalog.reel(cross.id) : null;
            const have = !!reel && ctx.reels.includes(cross.id);
            return have ? { state: 'ok', url, title: reel.file, kind: 'reel' } : { state: 'dead', url, title: reel ? reel.file : cross.id, hint: 'File not found.' };
        }
        const meta = typeof system !== 'undefined' && system.appMeta ? system.appMeta[cross.id] : null;
        const have = !!meta && ctx.apps.includes(cross.id);
        return have ? { state: 'ok', url, title: meta.label, kind: 'app' } : { state: 'dead', url, title: meta ? meta.label : cross.id, hint: 'Not installed.' };
    }

    /* ── Rendering a page ─────────────────────────────────────────────── */

    function helpers(ctx) {
        return {
            lit: L.lit,
            n: L.fmt,
            pct: L.pct,
            mins: L.minutes,
            plural: L.plural,
            link: (url, label) => `[[${url}${label !== undefined ? `|${L.lit(label)}` : ''}]]`,
        };
    }

    function directiveFor(ctx, url) {
        return (name, args) => {
            if (name === 'counter') {
                const digits = String(L.counterValue(ctx.store)).padStart(7, '0').split('');
                return `<p class="es-center"><span class="es-counter" aria-label="Visitor ${digits.join('').replace(/^0+/, '')}">${digits.map((d) => `<span class="es-digit">${esc(d)}</span>`).join('')}</span></p>`;
            }
            if (name === 'guestbook') return guestbookHtml(ctx);
            if (name === 'webring') return webringHtml(ctx, L.canonical(args[0] || url));
            return null;
        };
    }

    const GUESTBOOK = [
        ['choirgirl_1994', 'Sector 1A', 'cool page!!! my seraphs sing too'],
        ['throne_guy', 'Sector 3A', 'Thrones are better. See you on the ring.'],
        ['watcher.whisperd', 'unknown', 'the sun is missing'],
        ['a cherub', 'Records', 'Filed under: guestbooks. Filed under: guestbooks.'],
    ];

    function guestbookHtml(ctx) {
        const rows = GUESTBOOK.slice();
        const worn = ctx.endingWorn && typeof AdversaryFinale !== 'undefined' ? AdversaryFinale.endings[ctx.endingWorn].title : null;
        if (ctx.store.guestbookSigned) rows.push([worn || 'OPERATOR', 'Sector 7G', 'Keep singing. I am listening, even when I am away.']);
        const entries = rows.map(([who, where, said]) => `<li><b>${esc(who)}</b> <span class="es-gb-where">(${esc(where)})</span><br>${esc(said)}</li>`).join('');
        const action = ctx.store.guestbookSigned
            ? '<p class="es-note">Thanks for signing!</p>'
            : '<p class="es-center"><button type="button" class="es-button" data-es-action="sign">Sign the Guestbook</button></p>';
        return `<ol class="es-guestbook">${entries}</ol>${action}`;
    }

    function webringHtml(ctx, here) {
        const ring = S.RING.filter((u) => pageReachable(u, ctx));
        const i = ring.indexOf(here);
        if (!ring.length) return '';
        const prev = ring[(i - 1 + ring.length) % ring.length] || ring[0];
        const next = ring[(i + 1) % ring.length] || ring[0];
        const randomPick = ring[(ctx.store.counterHits + ring.length) % ring.length];
        const a = (u, t) => `<a class="es-link" href="#" data-href="${esc(u)}">${esc(t)}</a>`;
        return `<nav class="es-webring" aria-label="Webring">[ ${a(prev, '« Prev')} | ${a('webring://automata', 'Automaton Appreciation Ring')} | ${a(randomPick, 'Random')} | ${a(next, 'Next »')} ]</nav>`;
    }

    /* The page for a URL: { url, title, theme, html, status, known }. */
    function resolvePage(raw, ctx = snapshot()) {
        const url = L.canonical(raw);
        const E = helpers(ctx);
        const env = { link: (href) => linkInfo(href, ctx), directive: directiveFor(ctx, url) };
        const page = S.pages[url];
        if (page && pageReachable(url, ctx)) {
            let markup;
            try { markup = page.render(ctx, E); } catch (err) {
                markup = `= Server error\nThe page at ${L.lit(url)} could not be rendered. CMS has been notified. CMS has not replied.`;
            }
            return { url, title: page.title, theme: page.theme || 'cms', html: L.render(markup, env), status: 'ok', known: true };
        }
        if (page && !page.secret) {
            const markup = `
                = Access restricted
                The server at **${L.lit(url)}** answered, but it will not let you in.
                > ${L.lit(page.hint || 'This page is not available yet.')}
                @note [[cms://intranet|Return to the Intranet]] · [[etherscape://whats-cool|What's Cool?]]`;
            return { url, title: 'Access restricted', theme: 'error', html: L.render(markup, env), status: 'locked', known: true };
        }
        const mortal = /^https?:\/\//.test(url);
        const markup = mortal ? `
                = The mortal web is not in scope
                Etherscape does not route to **${L.lit(url)}**. The mortal web is maintained by someone else, and they do not read their release notes either.
                @note [[cms://intranet|Return to the Intranet]]` : `
                = This page has been archived
                The page **${L.lit(url || '(no address)')}** is not on any server CMS will admit to.
                It may have been archived by CMS Records Retention. Archived pages are not deleted. They keep running in a branch nobody watches.
                - Check the address for typing errors.
                - Try [[etherscape://whats-cool|What's Cool?]] or the [[cms://intranet|Intranet]].
                @note Error 404 · Etherscape Navigator 3.0`;
        return { url, title: mortal ? 'Not in scope' : '404 — Archived', theme: 'error', html: L.render(markup, env), status: 'missing', known: false };
    }

    /* ── Public: what other apps ask ──────────────────────────────────── */
    function knows(url) {
        try {
            if (!appUnlocked()) return false;
            const u = L.canonical(url);
            if (!KNOWN.has(u)) return false;
            return pageReachable(u, snapshot());
        } catch (err) { return false; }
    }

    function reachable() {
        if (!appUnlocked()) return [];
        const ctx = snapshot();
        return [...KNOWN].filter((u) => pageReachable(u, ctx));
    }

    function ensureApp() {
        if (typeof State === 'undefined' || !State || !Array.isArray(State.unlockedApps)) return false;
        if (State.unlockedApps.includes(APP_ID)) return false;
        if (!milestone(State)) return false;
        State.unlockedApps.push(APP_ID);
        if (typeof ui !== 'undefined' && ui) {
            if (typeof ui.log === 'function') ui.log('[ETHERSCAPE] Etherscape Navigator installed. The Sector has a public now. Desktop › Etherscape.');
            if (typeof ui.updateDesktopIcons === 'function') ui.updateDesktopIcons();
        }
        return true;
    }

    function open(url) {
        if (!knows(url)) return false;
        if (!hasDOM || typeof system === 'undefined') return false;
        ensureApp();
        View.pending = L.canonical(url);
        if (system.windows && system.windows[APP_ID]) {
            system.focusWindow(APP_ID);
            View.navigate(View.pending);
            View.pending = null;
        } else {
            system.openApp(APP_ID);
        }
        return true;
    }

    /* The 1 Hz watch: install the app at its milestone, then keep the
       sticky unlocks current. Inert without a DOM, so the simulator and the
       vm suites never run it. */
    function tick() {
        if (typeof State === 'undefined' || !State) return;
        ensureApp();
        if (!appUnlocked()) return;
        const fresh = observe();
        for (const url of fresh) {
            const page = S.pages[url];
            if (page && page.announce && typeof ui !== 'undefined' && ui && typeof ui.log === 'function') ui.log(page.announce);
        }
    }

    /* ════════════════════════════════════════════════════════════════════
       The window.
       ════════════════════════════════════════════════════════════════════ */
    const View = {
        pending: null,
        stack: [],
        index: -1,
        current: null,
        page: null,
        loadTimer: 0,
        refreshTimer: 0,
        lastHtml: '',

        root() { return hasDOM ? document.getElementById('es-root') : null; },
        $(sel) { return this.root()?.querySelector(sel) || null; },

        open() {
            const el = this.root();
            if (!el) return;
            this.build(el);
            const start = this.pending || this.current || L.HOME;
            this.pending = null;
            this.stack = [];
            this.index = -1;
            this.navigate(start);
            if (!this.refreshTimer) {
                // Every fifth beat of the shared clock, which rests in a hidden tab.
                const refresh = () => {
                    if (!this.root()) { this.stopRefresh(); return; }
                    if (this.current === 'sector://7g/status' && !document.hidden) this.render(this.current, { quiet: true });
                };
                if (typeof Heartbeat !== 'undefined') {
                    let beats = 0;
                    const off = Heartbeat.every(() => { if (++beats % 5 === 0 || !this.root()) refresh(); });
                    this.refreshTimer = { off };
                } else {
                    this.refreshTimer = setInterval(refresh, 5000);
                }
            }
        },

        stopRefresh() {
            if (this.refreshTimer && typeof this.refreshTimer.off === 'function') this.refreshTimer.off();
            else clearInterval(this.refreshTimer);
            this.refreshTimer = 0;
        },

        build(el) {
            const dirs = [
                ['etherscape://whats-cool', "What's Cool?"],
                ['cms://intranet', 'Intranet'],
                ['news://celestial-times', 'News'],
                ['cosmopedia://', 'Cosmopedia'],
                ['sector://7g/status', 'Status'],
            ];
            el.innerHTML = `
                <div class="es-chrome">
                    <div class="es-menubar" role="group" aria-label="Menus">
                        <div class="es-menu-wrap">
                            <button type="button" class="es-menu-btn" data-menu="go" aria-haspopup="true" aria-expanded="false">Go</button>
                            <div class="es-menu" data-menu-list="go" role="menu" hidden></div>
                        </div>
                        <div class="es-menu-wrap">
                            <button type="button" class="es-menu-btn" data-menu="bookmarks" aria-haspopup="true" aria-expanded="false">Bookmarks</button>
                            <div class="es-menu" data-menu-list="bookmarks" role="menu" hidden></div>
                        </div>
                    </div>
                    <div class="es-bars">
                        <div class="es-toolbar" role="toolbar" aria-label="Navigation">
                            <button type="button" class="es-tool" data-act="back" title="Back" aria-label="Back"><span class="es-tool-glyph es-glyph-back" aria-hidden="true"></span><span class="es-tool-label">Back</span></button>
                            <button type="button" class="es-tool" data-act="forward" title="Forward" aria-label="Forward"><span class="es-tool-glyph es-glyph-forward" aria-hidden="true"></span><span class="es-tool-label">Forward</span></button>
                            <button type="button" class="es-tool" data-act="home" title="Home" aria-label="Home"><span class="es-tool-glyph es-glyph-home" aria-hidden="true"></span><span class="es-tool-label">Home</span></button>
                            <button type="button" class="es-tool" data-act="reload" title="Reload" aria-label="Reload"><span class="es-tool-glyph es-glyph-reload" aria-hidden="true"></span><span class="es-tool-label">Reload</span></button>
                        </div>
                        <form class="es-location" autocomplete="off">
                            <label class="es-location-label" for="es-address">Location:</label>
                            <input id="es-address" class="es-address" type="text" spellcheck="false" autocapitalize="off" aria-label="Location">
                            <button type="submit" class="es-tool es-go" title="Go">Go</button>
                        </form>
                        <nav class="es-directory" aria-label="Directory">
                            ${dirs.map(([u, t]) => `<button type="button" class="es-dir" data-href="${esc(u)}">${esc(t)}</button>`).join('')}
                        </nav>
                    </div>
                    <div class="es-throbber" aria-hidden="true"><span class="es-throbber-ring"></span><span class="es-throbber-star"></span></div>
                </div>
                <div class="es-frame">
                    <div class="es-page" role="document" tabindex="-1"></div>
                </div>
                <div class="es-status" role="status">
                    <span class="es-key" aria-hidden="true"></span>
                    <span class="es-status-text">Document: Done</span>
                    <span class="es-status-meter" aria-hidden="true"><span></span></span>
                </div>`;

            el.querySelector('.es-toolbar').addEventListener('click', (e) => {
                const btn = e.target.closest('[data-act]');
                if (!btn || btn.disabled) return;
                const act = btn.dataset.act;
                this.click();
                if (act === 'back') this.back();
                else if (act === 'forward') this.forward();
                else if (act === 'home') this.navigate(L.HOME);
                else if (act === 'reload') this.reload();
            });
            el.querySelector('.es-location').addEventListener('submit', (e) => {
                e.preventDefault();
                const value = el.querySelector('.es-address').value;
                this.click();
                this.navigate(value, { typed: true });
            });
            el.querySelector('.es-directory').addEventListener('click', (e) => {
                const btn = e.target.closest('[data-href]');
                if (btn) { this.click(); this.navigate(btn.dataset.href); }
            });
            const page = el.querySelector('.es-page');
            page.addEventListener('click', (e) => {
                const link = e.target.closest('a.es-link');
                if (link) { e.preventDefault(); this.click(); this.follow(link.dataset.href); return; }
                const dead = e.target.closest('.es-dead');
                if (dead) { this.status(`Link unavailable: ${dead.dataset.hint || ''}`); return; }
                const act = e.target.closest('[data-es-action]');
                if (act && act.dataset.esAction === 'sign') this.signGuestbook();
            });
            page.addEventListener('keydown', (e) => {
                const dead = e.target.closest && e.target.closest('.es-dead');
                if (dead && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.status(`Link unavailable: ${dead.dataset.hint || ''}`); }
            });
            page.addEventListener('mouseover', (e) => {
                const link = e.target.closest('a.es-link, .es-dead');
                if (!link) return;
                this.status(link.classList.contains('es-dead') ? `Link unavailable: ${link.dataset.hint || ''}` : link.dataset.href);
            });
            page.addEventListener('mouseout', (e) => {
                if (e.target.closest('a.es-link, .es-dead')) this.status('Document: Done');
            });

            // Menus.
            el.querySelector('.es-menubar').addEventListener('click', (e) => {
                const btn = e.target.closest('[data-menu]');
                if (btn) { this.toggleMenu(btn.dataset.menu); return; }
                const item = e.target.closest('[data-menu-act]');
                if (!item) return;
                const act = item.dataset.menuAct;
                this.closeMenus();
                if (act === 'nav') this.navigate(item.dataset.href);
                else if (act === 'back') this.back();
                else if (act === 'forward') this.forward();
                else if (act === 'home') this.navigate(L.HOME);
                else if (act === 'add-bookmark') this.addBookmark();
                else if (act === 'remove-bookmark') this.removeBookmark();
            });
            el.addEventListener('keydown', (e) => {
                const open = el.querySelector('.es-menu:not([hidden])');
                if (e.key === 'Escape' && open) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.closeMenus(true);
                    return;
                }
                // A role="menu" is walked with the arrows, not Tab.
                const moves = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
                if (open && e.key in moves && open.contains(e.target)) {
                    const items = Array.from(open.querySelectorAll('.es-menu-item:not([disabled])'));
                    if (!items.length) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const at = items.indexOf(e.target);
                    const m = moves[e.key];
                    const next = m === 'first' ? 0 : m === 'last' ? items.length - 1
                        : (at + m + items.length) % items.length;
                    items[next].focus();
                }
            });
            el.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.es-menu-wrap')) this.closeMenus();
            });
        },

        click() { if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx('click'); },

        status(text) {
            const s = this.$('.es-status-text');
            if (s && s.textContent !== text) s.textContent = text;
        },

        toggleMenu(name) {
            const list = this.$(`[data-menu-list="${name}"]`);
            if (!list) return;
            const opening = list.hidden;
            this.closeMenus();
            if (!opening) return;
            list.innerHTML = name === 'go' ? this.goMenuHtml() : this.bookmarksMenuHtml();
            list.hidden = false;
            this.$(`[data-menu="${name}"]`)?.setAttribute('aria-expanded', 'true');
            // The first item that can take focus: Back is disabled on a fresh
            // history, and focusing it silently left the keyboard outside.
            list.querySelector('.es-menu-item:not([disabled])')?.focus();
        },

        closeMenus(refocus = false) {
            const root = this.root();
            if (!root) return;
            root.querySelectorAll('.es-menu').forEach((m) => {
                if (!m.hidden && refocus) root.querySelector(`[data-menu="${m.dataset.menuList}"]`)?.focus();
                m.hidden = true;
            });
            root.querySelectorAll('[data-menu]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
        },

        itemHtml(url, ctx) {
            const page = S.pages[url];
            const ok = page && pageReachable(url, ctx);
            const label = page ? page.title : url;
            return `<button type="button" role="menuitem" class="es-menu-item" data-menu-act="nav" data-href="${esc(url)}"${ok ? '' : ' disabled'}>
                <span>${esc(label)}</span><small>${esc(url)}</small></button>`;
        },

        goMenuHtml() {
            const ctx = snapshot();
            const hist = ctx.store.history.slice(0, 15);
            return `<button type="button" role="menuitem" class="es-menu-item" data-menu-act="back"${this.index > 0 ? '' : ' disabled'}><span>Back</span></button>
                <button type="button" role="menuitem" class="es-menu-item" data-menu-act="forward"${this.index < this.stack.length - 1 ? '' : ' disabled'}><span>Forward</span></button>
                <button type="button" role="menuitem" class="es-menu-item" data-menu-act="home"><span>Home</span></button>
                <div class="es-menu-sep" role="separator"></div>
                <div class="es-menu-head" role="presentation">History</div>
                ${hist.length ? hist.map((u) => this.itemHtml(u, ctx)).join('') : '<div class="es-menu-empty" role="presentation">No pages visited yet.</div>'}`;
        },

        bookmarksMenuHtml() {
            const ctx = snapshot();
            const marked = ctx.store.bookmarks.includes(this.current);
            const canMark = this.page && this.page.status === 'ok';
            return `<button type="button" role="menuitem" class="es-menu-item" data-menu-act="${marked ? 'remove-bookmark' : 'add-bookmark'}"${canMark ? '' : ' disabled'}>
                    <span>${marked ? 'Remove Bookmark' : 'Add Bookmark'}</span></button>
                <div class="es-menu-sep" role="separator"></div>
                ${ctx.store.bookmarks.length ? ctx.store.bookmarks.map((u) => this.itemHtml(u, ctx)).join('') : '<div class="es-menu-empty" role="presentation">No bookmarks.</div>'}`;
        },

        addBookmark() {
            const st = store();
            if (!this.page || this.page.status !== 'ok' || st.bookmarks.includes(this.current)) return false;
            if (st.bookmarks.length >= L.BOOKMARK_CAP) { this.status('Bookmarks are full.'); return false; }
            st.bookmarks.push(this.current);
            save();
            this.status(`Bookmark added: ${this.page.title}`);
            return true;
        },

        removeBookmark() {
            const st = store();
            const i = st.bookmarks.indexOf(this.current);
            if (i < 0) return false;
            st.bookmarks.splice(i, 1);
            save();
            this.status('Bookmark removed.');
            return true;
        },

        signGuestbook() {
            const st = store();
            if (st.guestbookSigned) return;
            st.guestbookSigned = true;
            save();
            if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx('document');
            this.render(this.current, { quiet: true });
            this.status('Thanks for signing the guestbook!');
        },

        follow(href) {
            const cross = L.crossLink(href);
            if (!cross) { this.navigate(href); return; }
            const info = crossInfo(cross, snapshot());
            if (info.state !== 'ok') { this.status(`Link unavailable: ${info.hint}`); return; }
            if (cross.type === 'doc') {
                system.openApp('notepad');
                if (typeof ui !== 'undefined' && ui.viewDocument) ui.viewDocument(cross.id);
            } else if (cross.type === 'tape') {
                system.openApp('mediaplayer');
                if (typeof MediaPlayerView !== 'undefined') MediaPlayerView.loadTape(cross.id, true);
            } else if (cross.type === 'reel') {
                if (typeof Footage !== 'undefined') Footage.open(cross.id);
            } else if (cross.type === 'app') {
                system.openApp(cross.id);
            }
        },

        navigate(raw, { push = true, typed = false } = {}) {
            if (!this.root()) return null;
            const url = L.canonical(raw) || String(raw || '').trim();
            this.closeMenus();
            const page = this.render(url);
            if (push) {
                const next = L.stackPush(this.stack, this.index, page.url || url);
                this.stack = next.stack;
                this.index = next.index;
            }
            this.afterLoad(typed);
            return page;
        },

        render(url, { quiet = false } = {}) {
            const ctx = snapshot();
            const st = ctx.store;
            // The fan page counts its own visitors.
            if (!quiet && url === 'seraph://fanpage') st.counterHits = Math.min(1e9, st.counterHits + 1);
            const page = resolvePage(url, ctx);
            this.page = page;
            this.current = page.url;
            const el = this.$('.es-page');
            if (!el) return page;
            if (quiet && page.html === this.lastHtml) return page;
            const scroll = quiet ? this.$('.es-frame')?.scrollTop || 0 : 0;
            el.className = `es-page es-theme-${page.theme}`;
            el.dataset.url = page.url;
            el.innerHTML = page.html;
            this.lastHtml = page.html;
            const frame = this.$('.es-frame');
            if (frame) frame.scrollTop = scroll;
            if (page.status === 'ok') {
                if (!st.visited.includes(page.url)) st.visited.push(page.url);
                st.history = L.pushHistory(st.history, page.url);
            }
            this.mountSlots(el);
            const input = this.$('.es-address');
            if (input && !(quiet && document.activeElement === input)) input.value = page.url || input.value;
            const win = typeof system !== 'undefined' && system.windows ? system.windows[APP_ID] : null;
            const title = win ? win.querySelector('.window-title') : null;
            if (title) title.textContent = `Etherscape - [${page.title}]`;
            if (!quiet) observe(ctx);
            return page;
        },

        afterLoad(typed) {
            const root = this.root();
            if (!root) return;
            const back = root.querySelector('[data-act="back"]');
            const fwd = root.querySelector('[data-act="forward"]');
            if (back) back.disabled = this.index <= 0;
            if (fwd) fwd.disabled = this.index >= this.stack.length - 1;
            // The throbber turns while the "host" is contacted.
            root.classList.add('is-loading');
            this.status(`Contacting host: ${this.current}…`);
            clearTimeout(this.loadTimer);
            this.loadTimer = setTimeout(() => {
                root.classList.remove('is-loading');
                this.status(this.page && this.page.status === 'missing' ? 'Document: Not found' : 'Document: Done');
            }, 450);
            if (typed) this.$('.es-page')?.focus({ preventScroll: true });
        },

        back() {
            if (this.index <= 0) return;
            this.index -= 1;
            this.render(this.stack[this.index]);
            this.afterLoad(false);
        },

        forward() {
            if (this.index >= this.stack.length - 1) return;
            this.index += 1;
            this.render(this.stack[this.index]);
            this.afterLoad(false);
        },

        reload() {
            if (!this.current) return;
            this.render(this.current);
            this.afterLoad(false);
        },

        /* Media slots: shown only when their file is installed. */
        mountSlots(el) {
            if (typeof media === 'undefined' || !media) return;
            el.querySelectorAll('.es-slot').forEach((slot) => {
                const caption = slot.dataset.caption || '';
                const addCaption = () => {
                    if (!caption || slot.querySelector('figcaption')) return;
                    const fc = document.createElement('figcaption');
                    fc.textContent = caption;
                    slot.appendChild(fc);
                };
                if (slot.dataset.clip && typeof media.attachClip === 'function') {
                    media.attachClip(slot, `web__${slot.dataset.clip}__720`, { label: caption }).then((ok) => {
                        if (ok) { slot.classList.add('is-mounted'); addCaption(); }
                    }, () => {});
                } else if (slot.dataset.image && typeof media.probeUrl === 'function') {
                    const src = `assets/web/${slot.dataset.image}.webp`;
                    media.probeUrl(src, 'image').then((ok) => {
                        if (!ok || !slot.isConnected || slot.querySelector('img')) return;
                        const img = document.createElement('img');
                        img.className = 'es-slot-image';
                        img.alt = caption;
                        img.src = src;
                        slot.appendChild(img);
                        slot.classList.add('is-mounted');
                        addCaption();
                    }, () => {});
                }
            });
        },

        state() {
            return { url: this.current, stack: this.stack.slice(), index: this.index, status: this.page ? this.page.status : null, title: this.page ? this.page.title : null };
        },
    };

    if (hasDOM) {
        // On the desktop's shared 1 Hz clock (js/heartbeat.js), which rests in a hidden tab.
        const watch = () => { try { tick(); } catch (err) { /* the watch never breaks the page */ } };
        if (typeof Heartbeat !== 'undefined') Heartbeat.every(watch); else setInterval(watch, 1000);
    }

    return {
        APP_ID,
        knows,
        open,
        canonical: L.canonical,
        reachable,
        // Internals, for the tests and the window.
        snapshot,
        store,
        observe,
        milestone,
        appUnlocked,
        ensureApp,
        resolvePage,
        linkInfo: (href) => linkInfo(href, snapshot()),
        tick,
        view: View,
        known: () => [...KNOWN],
    };
})();

const EtherscapeView = Etherscape.view;
