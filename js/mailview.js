/* ════════════════════════════════════════════════════════════════════════
   CMS Mail — the window.

   The house grammar of the other apps: a struck-brass toolbar on vellum,
   sunken panes, a status bar of sunken panes. The layout is the one every
   late-90s mail client shared: folders down the left, the message list
   above, the reading pane below. Narrow (a phone, or a snapped window) it
   folds into a folder strip over the list, and opening a message swaps the
   list for the reading pane with a Back button.

   KEYBOARD, while the window is on top:
     ↑ / ↓ / Home / End  move through the list (and preview, when the
                         reading pane is visible)
     Enter               open the selected message
     Delete / Backspace  file it to Archive
     Escape              back to the list, when reading on a narrow window
   Space and Enter on a focused button inside the window are the button's,
   not a Miracle's.

   Every string that reaches innerHTML is escaped (ui.escapeHtml, or the
   same five-character escape when ui is absent). Message bodies go through
   MailLogic.renderBody, which escapes before it marks up.
   ════════════════════════════════════════════════════════════════════════ */

const MailView = (() => {
    'use strict';

    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const esc = (v) => (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function'
        ? ui.escapeHtml(v) : MailLogic.esc(v));
    const sfx = (name) => { if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx(name); };

    const st = {
        folder: 'inbox',
        selected: null,      // row key
        reading: false,      // narrow layout: the reading pane replaces the list
        notice: '',
        images: {},          // message id -> true | false (probed)
        readerKey: '',       // what the reading pane last rendered
    };

    const root = () => (hasDOM ? document.getElementById('mail-root') : null);
    const $ = (sel) => root()?.querySelector(sel) || null;
    const NARROW = 600;
    const isNarrow = () => { const el = root(); return !!el && el.clientWidth > 0 && el.clientWidth < NARROW; };

    function rows() {
        return MailLogic.list(Mail.state(), st.folder);
    }

    function selectedRow(list = rows()) {
        return list.find((r) => r.key === st.selected) || null;
    }

    /* ── Skeleton ─────────────────────────────────────────────────────── */
    function build(el) {
        el.innerHTML = `
            <div class="ml">
                <div class="ml-toolbar" role="toolbar" aria-label="Message actions">
                    <button type="button" class="win-btn ml-tool" data-act="archive" title="File to Archive (Delete)">Archive</button>
                    <button type="button" class="win-btn ml-tool" data-act="inbox" title="Move back to its folder">Move to Inbox</button>
                    <button type="button" class="win-btn ml-tool" data-act="unread" title="Mark as unread">Mark Unread</button>
                    <span class="ml-brand">CMS MAIL &middot; ${esc(MailCatalog.OPERATOR.address)}</span>
                </div>
                <div class="ml-body">
                    <nav class="ml-folders" aria-label="Folders"></nav>
                    <div class="ml-main">
                        <div class="ml-listwrap">
                            <div class="ml-listhead" aria-hidden="true">
                                <span class="ml-col-flags"></span><span>From</span><span>Subject</span><span>Received</span>
                            </div>
                            <div class="ml-list" role="listbox" tabindex="0" aria-label="Messages"></div>
                        </div>
                        <article class="ml-reader" tabindex="-1" aria-live="polite"></article>
                    </div>
                </div>
                <div class="ml-status"><span class="ml-pane ml-status-count"></span><span class="ml-pane ml-status-note"></span></div>
            </div>`;
        const ml = el.querySelector('.ml');
        ml.addEventListener('click', onClick);
    }

    /* ── Folders ──────────────────────────────────────────────────────── */
    function renderFolders() {
        const nav = $('.ml-folders');
        if (!nav) return;
        const mail = Mail.state();
        const html = MailCatalog.FOLDERS.map((f) => {
            const unread = f.id === 'sent' ? 0 : MailLogic.unread(mail, [f.id]);
            const current = f.id === st.folder;
            return `<button type="button" class="ml-folder${current ? ' is-current' : ''}${unread ? ' has-unread' : ''}"
                    data-folder="${esc(f.id)}" aria-pressed="${current ? 'true' : 'false'}">
                    <span class="ml-folder-glyph ml-folder-glyph--${esc(f.id)}" aria-hidden="true"></span>
                    <span class="ml-folder-name">${esc(f.label)}</span>${unread ? `<span class="ml-folder-count">(${unread})</span>` : ''}
                </button>`;
        }).join('');
        if (nav.innerHTML !== html) nav.innerHTML = html;
    }

    /* ── The list ─────────────────────────────────────────────────────── */
    function rowHtml(r) {
        const selected = r.key === st.selected;
        const who = r.sent ? `To: ${r.to.name}` : r.from.name;
        const flags = `${r.replied ? '<span class="ml-flag ml-flag--replied" title="Replied">&#8617;</span>' : ''}${r.attachments ? '<span class="ml-flag ml-flag--clip" title="Attachment"></span>' : ''}`;
        return `<div class="ml-row${r.read ? '' : ' is-unread'}${selected ? ' is-selected' : ''}" role="option"
                    id="ml-row-${esc(r.key.replace(/[^a-z0-9-]/gi, '_'))}" data-key="${esc(r.key)}" aria-selected="${selected ? 'true' : 'false'}">
                <span class="ml-col-flags">${flags}</span>
                <span class="ml-from">${esc(who)}</span>
                <span class="ml-subject">${esc(r.subject)}</span>
                <span class="ml-date">${esc(MailLogic.formatStamp(r.stamp, true))}</span>
            </div>`;
    }

    function renderList() {
        const list = $('.ml-list');
        if (!list) return;
        const items = rows();
        const html = items.length
            ? items.map(rowHtml).join('')
            : `<div class="ml-empty">${st.folder === 'sent' ? 'No replies sent.' : 'There are no messages in this folder.'}</div>`;
        if (list.innerHTML !== html) list.innerHTML = html;
        const current = items.find((r) => r.key === st.selected);
        if (current) {
            list.setAttribute('aria-activedescendant', `ml-row-${current.key.replace(/[^a-z0-9-]/gi, '_')}`);
            const rowEl = list.querySelector('.ml-row.is-selected');
            if (rowEl && typeof rowEl.scrollIntoView === 'function') rowEl.scrollIntoView({ block: 'nearest' });
        } else {
            list.removeAttribute('aria-activedescendant');
        }
    }

    /* ── The reading pane ─────────────────────────────────────────────── */
    function attachmentHtml(a) {
        if (a.doc) {
            const doc = findDoc(a.doc);
            const name = doc ? String(doc.filename || doc.title).split('/').pop() : a.doc;
            const ready = docAvailable(a.doc);
            return `<button type="button" class="ml-attach ml-attach--doc" data-doc="${esc(a.doc)}"${ready ? '' : ' disabled aria-disabled="true"'}
                    title="${ready ? 'Open in Recovered Documents' : 'Not yet recovered'}">
                    <span class="ml-attach-glyph" aria-hidden="true"></span>${esc(name)}${ready ? '' : ' <em>(not yet recovered)</em>'}</button>`;
        }
        if (a.tape) {
            const tape = typeof MediaCatalog !== 'undefined' ? MediaCatalog.tape(a.tape) : null;
            const name = tape ? `${tape.code} ${tape.secret ? '[REDACTED]' : tape.title}.vhs` : `${a.tape}.vhs`;
            const ready = tapeAvailable(a.tape);
            return `<button type="button" class="ml-attach ml-attach--tape" data-tape="${esc(a.tape)}"${ready ? '' : ' disabled aria-disabled="true"'}
                    title="${ready ? 'Play in the Sacred Media Player' : 'Not yet filed'}">
                    <span class="ml-attach-glyph" aria-hidden="true"></span>${esc(name)}${ready ? '' : ' <em>(not yet filed)</em>'}</button>`;
        }
        if (a.url) {
            const name = `${a.url.replace(/^([a-z]+):\/\//, '$1-').replace(/[/]+$/, '').replace(/[/]/g, '-') || 'link'}.url`;
            if (Mail.linkable(a.url)) {
                return `<button type="button" class="ml-attach ml-attach--url" data-url="${esc(a.url)}" title="${esc(a.url)}">
                        <span class="ml-attach-glyph" aria-hidden="true"></span>${esc(name)}</button>`;
            }
            return `<span class="ml-attach ml-attach--url is-offline" title="Internet Shortcut">
                    <span class="ml-attach-glyph" aria-hidden="true"></span>${esc(name)} <span class="ml-url">${esc(a.url)}</span></span>`;
        }
        return '';
    }

    function headerHtml(r) {
        const fromLine = `${esc(r.from.name)} &lt;${esc(r.from.address)}&gt;`;
        const toLine = `${esc(r.to.name)} &lt;${esc(r.to.address)}&gt;`;
        const via = !r.sent && r.from.via ? `<dt>Via:</dt><dd class="ml-via">${esc(r.from.via)}</dd>` : '';
        return `<dl class="ml-head">
                <dt>From:</dt><dd>${fromLine}</dd>
                <dt>To:</dt><dd>${toLine}</dd>${via}
                <dt>Date:</dt><dd>${esc(MailLogic.formatStamp(r.stamp))}</dd>
                <dt>Subject:</dt><dd class="ml-head-subject">${esc(r.subject)}</dd>
            </dl>`;
    }

    function repliesHtml(r) {
        const options = r.msg.replies || [];
        if (!options.length) return '';
        if (r.rec.reply) {
            const chosen = options.find((o) => o.id === r.rec.reply);
            return `<div class="ml-replies is-done"><span class="ml-replies-label">Replied:</span> &ldquo;${esc(chosen ? chosen.label : r.rec.reply)}&rdquo; &mdash; filed to Sent.</div>`;
        }
        return `<div class="ml-replies" role="group" aria-label="Reply">
                <span class="ml-replies-label">Reply:</span>
                ${options.map((o) => `<button type="button" class="win-btn ml-reply" data-choice="${esc(o.id)}">${esc(o.label)}</button>`).join('')}
            </div>`;
    }

    function renderReader(force = false) {
        const reader = $('.ml-reader');
        if (!reader) return;
        const r = selectedRow();
        const key = r ? `${r.key}|${r.rec.reply || ''}|${attachState(r)}|${st.images[r.id] === true}` : `none|${st.folder}`;
        if (!force && key === st.readerKey) return;
        st.readerKey = key;
        if (!r) {
            reader.innerHTML = `<div class="ml-reader-empty">No message selected.</div>`;
            return;
        }
        if (r.sent) {
            reader.innerHTML = `
                <button type="button" class="win-btn ml-back" data-act="back">&lsaquo; Back</button>
                ${headerHtml(r)}
                <div class="ml-text"><p>${esc(r.option ? r.option.text : '')}</p>
                    <div class="ml-quote"><div class="ml-quote-head">-----Original Message-----<br>From: ${esc(r.to.name)}<br>Subject: ${esc(r.msg.subject)}</div>
                    ${Mail.renderBody(r.msg)}</div>
                </div>`;
            return;
        }
        const attach = (r.msg.attach || []).map(attachmentHtml).join('');
        const figure = st.images[r.id] === true
            ? `<figure class="ml-figure"><img src="${esc(MailLogic.imagePath(r.id))}" alt=""></figure>` : '';
        reader.innerHTML = `
            <button type="button" class="win-btn ml-back" data-act="back">&lsaquo; Back</button>
            ${headerHtml(r)}
            ${attach ? `<div class="ml-attachments" aria-label="Attachments"><span class="ml-attachments-label">Attached:</span>${attach}</div>` : ''}
            ${figure}
            <div class="ml-text">${Mail.renderBody(r.msg)}</div>
            ${repliesHtml(r)}`;
        probeImage(r.id);
    }

    /* Availability can change while a message is open (a document is
       recovered, a tape is filed), so it is part of the render key. */
    function attachState(r) {
        return (r.msg.attach || []).map((a) => (a.doc ? docAvailable(a.doc) : a.tape ? tapeAvailable(a.tape) : a.url ? Mail.linkable(a.url) : false) ? 1 : 0).join('');
    }

    function probeImage(id) {
        if (id in st.images) return;
        st.images[id] = false;
        if (typeof media === 'undefined' || !media || typeof media.probeUrl !== 'function') return;
        Promise.resolve(media.probeUrl(MailLogic.imagePath(id), 'image')).then((ok) => {
            if (ok !== true) return;
            st.images[id] = true;
            if (selectedRow()?.id === id) renderReader();
        }, () => {});
    }

    function renderStatus() {
        const count = $('.ml-status-count');
        const note = $('.ml-status-note');
        const items = rows();
        const unread = items.filter((r) => !r.read).length;
        const label = MailCatalog.FOLDERS.find((f) => f.id === st.folder)?.label || st.folder;
        const text = `${label}: ${items.length} message${items.length === 1 ? '' : 's'}${unread ? `, ${unread} unread` : ''}`;
        if (count && count.textContent !== text) count.textContent = text;
        const noteText = st.notice || 'Connected to CMS Interoffice';
        if (note && note.textContent !== noteText) note.textContent = noteText;
    }

    function renderToolbar() {
        const r = selectedRow();
        const set = (act, disabled) => { const b = $(`.ml-tool[data-act="${act}"]`); if (b) b.disabled = disabled; };
        const movable = !!r && !r.sent;
        set('archive', !movable || MailLogic.folderOf(r.rec) === 'archive');
        set('inbox', !movable || MailLogic.folderOf(r.rec) === r.msg.folder);
        set('unread', !movable || !r.rec.read);
        const ml = $('.ml');
        if (ml) ml.classList.toggle('is-reading', st.reading && !!r);
    }

    function render() {
        if (!root()) return;
        renderFolders();
        renderList();
        renderReader();
        renderToolbar();
        renderStatus();
    }

    /* ── Documents and tapes ──────────────────────────────────────────── */
    function generatedDocs() {
        try { return (typeof game !== 'undefined' && game.generatedDocuments?.()) || []; } catch (err) { return []; }
    }

    function findDoc(id) {
        const manifest = typeof DocumentManifest !== 'undefined' ? DocumentManifest.find((d) => d.id === id) : null;
        if (manifest) return manifest;
        const generated = generatedDocs().find((d) => d.id === id);
        if (generated) return generated;
        if (typeof AdversaryFinale !== 'undefined') {
            for (const ending of Object.values(AdversaryFinale.endings)) if (ending.document?.id === id) return ending.document;
        }
        return null;
    }

    function docAvailable(id) {
        if (typeof State === 'undefined') return false;
        if (Array.isArray(State.documents?.collected) && State.documents.collected.includes(id)) return true;
        return generatedDocs().some((d) => d.id === id);
    }

    function tapeAvailable(id) {
        try { return typeof media !== 'undefined' && media.settings().tapes.includes(id); } catch (err) { return false; }
    }

    function openDoc(id) {
        if (!docAvailable(id)) { notice('That attachment has not been recovered yet.'); return false; }
        system.openApp('notepad');
        ui.viewDocument(id);
        return true;
    }

    function openTape(id) {
        if (!tapeAvailable(id)) { notice('That tape has not been filed yet.'); return false; }
        system.openApp('mediaplayer');
        if (typeof MediaPlayerView !== 'undefined') MediaPlayerView.loadTape(id, false);
        return true;
    }

    function notice(text) {
        st.notice = text;
        renderStatus();
        clearTimeout(notice.timer);
        notice.timer = setTimeout(() => { st.notice = ''; renderStatus(); }, 4000);
    }

    /* ── Actions ──────────────────────────────────────────────────────── */
    function setFolder(folder) {
        if (!MailLogic.VIEWABLE.includes(folder)) return;
        st.folder = folder;
        st.reading = false;
        const first = rows()[0];
        st.selected = first ? first.key : null;
        if (first && !isNarrow()) markRead(first);
        render();
    }

    function markRead(r) {
        if (r && !r.sent && !r.rec.read) Mail.markRead(r.id, true);
    }

    /* Select a row. Opening marks it read; on a wide window the reading
       pane is always showing, so selecting is opening. */
    function select(key, { open = false } = {}) {
        const r = rows().find((x) => x.key === key);
        if (!r) return;
        if (r.key !== st.selected) st.notice = '';
        st.selected = r.key;
        if (open) st.reading = true;
        if (open || !isNarrow()) markRead(r);
        render();
    }

    function step(delta) {
        const items = rows();
        if (!items.length) return;
        let i = items.findIndex((r) => r.key === st.selected);
        if (delta === 'first') i = 0;
        else if (delta === 'last') i = items.length - 1;
        else i = i === -1 ? 0 : Math.max(0, Math.min(items.length - 1, i + delta));
        select(items[i].key);
    }

    function openSelected() {
        const r = selectedRow();
        if (!r) return;
        select(r.key, { open: true });
        const reader = $('.ml-reader');
        if (reader && typeof reader.focus === 'function') reader.focus({ preventScroll: true });
    }

    function archiveSelected() {
        const items = rows();
        const i = items.findIndex((r) => r.key === st.selected);
        const r = items[i];
        if (!r || r.sent) return false;
        if (MailLogic.folderOf(r.rec) === 'archive') { notice('Already in Archive.'); return false; }
        Mail.move(r.id, 'archive');
        sfx('windowClose');
        const rest = rows();
        const next = rest[Math.min(i, rest.length - 1)];
        st.selected = next ? next.key : null;
        st.reading = false;
        if (next && !isNarrow()) markRead(next);
        notice(`Filed to Archive: “${r.subject}”.`);
        render();
        focusList();
        return true;
    }

    function restoreSelected() {
        const r = selectedRow();
        if (!r || r.sent) return;
        const home = r.msg.folder;
        if (Mail.move(r.id, home)) {
            notice(`Moved to ${MailCatalog.FOLDERS.find((f) => f.id === home)?.label || home}.`);
            const rest = rows();
            st.selected = rest[0] ? rest[0].key : null;
            render();
        }
    }

    function markUnread() {
        const r = selectedRow();
        if (!r || r.sent) return;
        Mail.markRead(r.id, false);
        render();
    }

    function back() {
        st.reading = false;
        render();
        focusList();
    }

    function focusList() {
        const list = $('.ml-list');
        if (list && typeof list.focus === 'function') list.focus({ preventScroll: true });
    }

    function reply(choice) {
        const r = selectedRow();
        if (!r || r.sent) return;
        const res = Mail.reply(r.id, choice);
        if (res.ok) notice(`Reply sent to ${r.from.name}. Filed to Sent.`);
        render();
    }

    function onClick(e) {
        const t = e.target;
        const folder = t.closest('.ml-folder');
        if (folder) { setFolder(folder.dataset.folder); return; }
        const row = t.closest('.ml-row');
        if (row) { select(row.dataset.key, { open: true }); return; }
        const act = t.closest('[data-act]');
        if (act && !act.disabled) {
            const a = act.dataset.act;
            if (a === 'archive') archiveSelected();
            else if (a === 'inbox') restoreSelected();
            else if (a === 'unread') markUnread();
            else if (a === 'back') back();
            return;
        }
        const choice = t.closest('.ml-reply');
        if (choice) { reply(choice.dataset.choice); return; }
        const doc = t.closest('[data-doc]');
        if (doc && !doc.disabled) { openDoc(doc.dataset.doc); return; }
        const tape = t.closest('[data-tape]');
        if (tape && !tape.disabled) { openTape(tape.dataset.tape); return; }
        const link = t.closest('[data-url]');
        if (link) { if (!Mail.openUrl(link.dataset.url)) notice('Etherscape is not installed on this console.'); }
    }

    /* ── Public ───────────────────────────────────────────────────────── */
    function open() {
        const el = root();
        if (!el) return;
        build(el);
        st.reading = false;
        st.readerKey = '';
        /* Open where the news is: if nothing here is unread and another
           checked folder has something, start there. HR's welcome lands in
           HR, and an empty Inbox is a poor first look at a mail client. */
        const mail = Mail.state();
        if (!MailLogic.unread(mail, [st.folder])) {
            const busy = ['inbox', 'hr', 'junk'].find((f) => MailLogic.unread(mail, [f]) > 0);
            if (busy) { st.folder = busy; st.selected = null; }
        }
        const items = rows();
        if (!items.some((r) => r.key === st.selected)) {
            // Open on the newest unread, else the newest.
            const first = items.find((r) => !r.read) || items[0];
            st.selected = first ? first.key : null;
        }
        // Wide, the reading pane is showing it: shown is read.
        if (!isNarrow()) markRead(selectedRow());
        render();
        focusList();
    }

    function handleKey(e, topWindowId) {
        if (topWindowId !== 'mail' || !root()) return false;
        if (e.altKey || e.metaKey || e.ctrlKey) return false;
        const t = e.target;
        const inside = !!(t && t.closest && root().contains(t));
        const onButton = inside && !!t.closest('button');
        if (e.code === 'Space') return onButton; // the button's, not a Miracle's
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            if (onButton) return true;
            e.preventDefault();
            openSelected();
            return true;
        }
        const moves = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' };
        if (e.code in moves) {
            e.preventDefault();
            step(moves[e.code]);
            focusList();
            return true;
        }
        if (e.code === 'Delete' || e.code === 'Backspace') {
            e.preventDefault();
            archiveSelected();
            return true;
        }
        if (e.code === 'Escape' && st.reading && isNarrow()) {
            e.preventDefault();
            back();
            return true;
        }
        return false;
    }

    /* New mail while the window is open: the list grows; the selection,
       the focus and the reading pane stay where the player left them. */
    function onDelivered() {
        if (!root()) return;
        if (!st.selected) {
            const first = rows()[0];
            if (first) st.selected = first.key;
        }
        render();
    }

    return {
        open, handleKey, onDelivered, render,
        setFolder, select, step, openSelected, archiveSelected, reply,
        state: () => ({ folder: st.folder, selected: st.selected, reading: st.reading, narrow: isNarrow() }),
    };
})();
