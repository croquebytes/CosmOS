/* ════════════════════════════════════════════════════════════════════════
   Sacred Media Player — the training-tape deck.

   A CosmOS window with a tape shelf, a screen, transport controls and a
   caption bar. It plays the "CMS Operator Orientation" tapes catalogued in
   js/media.js, which are playable before a single reel exists: a shot whose
   tape__<id>__shot<n>__720 file is installed plays that reel, and every
   other shot is a slide built from the art the game already ships, under a
   slow camera move, with the captions on a timer.

   One clock drives everything. The picture, the captions, the scrubber and
   the OSD are all functions of a single time on the tape, so scrubbing,
   pausing and stepping between shots cannot disagree with one another, and
   a reel installed halfway through a session simply takes over its shot.

   The VHS treatment (scanlines, chroma offset, tracking wobble, the PLAY ▶
   OSD) is CSS on the screen, toggled by a class, so it stays crisp and can
   be switched off. Reduced motion holds every camera move still and stops
   the wobble.
   ════════════════════════════════════════════════════════════════════════ */

const MediaPlayerView = (() => {
    'use strict';

    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const L = () => MediaLogic;
    const esc = (v) => (typeof ui !== 'undefined' && ui.escapeHtml ? ui.escapeHtml(v)
        : String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const sfx = (name, opts) => { if (name && typeof game !== 'undefined' && game.sfx) game.sfx(name, opts); };

    const st = {
        tapeId: null,
        t: 0,
        playing: false,
        ended: false,
        raf: 0,
        anchorT: 0,         // tape time when play last started or seeked
        anchorAt: 0,        // performance.now() at that moment
        shotIndex: -1,
        captionKey: '',
        osd: null,          // { text, until } — transient OSD messages
        scrubbing: false,
        reels: {},          // shot code -> source url | null (installed reel)
        resumeOnShow: false,
    };

    const root = () => (hasDOM ? document.getElementById('mplayer-root') : null);
    const $ = (sel) => root()?.querySelector(sel) || null;
    const tape = () => MediaCatalog.tape(st.tapeId);
    const settings = () => media.settings();
    const reduced = () => media.reducedMotion();

    /* ── Shelf ────────────────────────────────────────────────────────── */
    function shelfHtml() {
        const s = settings();
        return MediaCatalog.tapes.map((tp) => {
            const unlocked = s.tapes.includes(tp.id);
            if (tp.secret && !unlocked) return '';
            const length = L().formatTime(L().tapeLength(tp));
            const current = tp.id === st.tapeId;
            if (!unlocked) {
                return `<li><button type="button" class="mp-tape is-locked" disabled aria-disabled="true">
                        <span class="mp-tape-code">${esc(tp.code)}</span>
                        <span class="mp-tape-title">Not yet filed</span>
                        <span class="mp-tape-meta">${esc(tp.hint)}</span>
                    </button></li>`;
            }
            const fresh = !s.watched.includes(tp.id);
            return `<li><button type="button" class="mp-tape${current ? ' is-current' : ''}${tp.secret ? ' is-secret' : ''}"
                        data-tape="${esc(tp.id)}" aria-pressed="${current ? 'true' : 'false'}">
                    <span class="mp-tape-code">${esc(tp.code)}</span>
                    <span class="mp-tape-title">${esc(tp.title)}</span>
                    <span class="mp-tape-meta">${esc(length)} &middot; ${esc(tp.teaches)}${fresh ? ' <b class="mp-new">NEW</b>' : ''}</span>
                </button></li>`;
        }).join('');
    }

    function renderShelf() {
        const shelf = $('.mp-shelf');
        if (!shelf) return;
        const html = shelfHtml();
        if (shelf.innerHTML !== html) shelf.innerHTML = html;
    }

    /* ── Skeleton ─────────────────────────────────────────────────────── */
    function build(el) {
        el.innerHTML = `
            <div class="mp">
                <div class="mp-toolbar">
                    <span class="mp-brand">CMS OPERATOR ORIENTATION &middot; DECK 1</span>
                    <label class="mp-toggle"><input type="checkbox" class="mp-vhs-toggle" aria-label="VHS treatment"> VHS treatment</label>
                </div>
                <div class="mp-body">
                    <ol class="mp-shelf" aria-label="Tape shelf"></ol>
                    <div class="mp-deck">
                        <div class="mp-screen-wrap">
                            <div class="mp-screen" role="img" aria-label="Training tape screen">
                                <div class="mp-picture"></div>
                                <div class="mp-fx" aria-hidden="true"></div>
                                <span class="mp-track" aria-hidden="true"></span>
                                <div class="mp-osd" aria-hidden="true"></div>
                                <div class="mp-counter" aria-hidden="true">SP 0:00:00</div>
                            </div>
                        </div>
                        <div class="mp-caption" aria-live="polite"><span class="mp-speaker"></span><span class="mp-line"></span></div>
                        <div class="mp-transport">
                            <button type="button" class="win-btn mp-btn" data-act="prev" title="Previous shot (&larr;)" aria-label="Previous shot">&#9198;</button>
                            <button type="button" class="win-btn mp-btn mp-play" data-act="play" title="Play / pause (Space)" aria-label="Play">&#9654;</button>
                            <button type="button" class="win-btn mp-btn" data-act="next" title="Next shot (&rarr;)" aria-label="Next shot">&#9197;</button>
                            <div class="mp-scrub-wrap">
                                <input type="range" class="mp-scrub" min="0" max="1" step="0.05" value="0" aria-label="Scrub">
                                <div class="mp-marks" aria-hidden="true"></div>
                            </div>
                            <span class="mp-time">0:00 / 0:00</span>
                        </div>
                    </div>
                </div>
                <div class="mp-status"><span class="mp-status-shot">NO TAPE</span><span class="mp-status-src"></span></div>
            </div>`;

        el.querySelector('.mp-shelf').addEventListener('click', (e) => {
            const btn = e.target.closest('.mp-tape[data-tape]');
            if (btn) { sfx('click'); loadTape(btn.dataset.tape, true); }
        });
        el.querySelector('.mp-transport').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            if (act === 'play') toggle();
            else if (act === 'prev') prevShot();
            else if (act === 'next') nextShot();
        });
        el.querySelector('.mp-screen').addEventListener('click', () => toggle());
        const scrub = el.querySelector('.mp-scrub');
        scrub.addEventListener('pointerdown', () => { st.scrubbing = true; });
        const endScrub = () => { st.scrubbing = false; };
        scrub.addEventListener('pointerup', endScrub);
        scrub.addEventListener('change', endScrub);
        scrub.addEventListener('input', () => seek(Number(scrub.value)));
        el.querySelector('.mp-vhs-toggle').addEventListener('change', (e) => media.setVhs(e.target.checked));
        syncVhs();
        // Recovered footage and the Omniscient's addresses (js/footage.js): inert until one is on file.
        if (typeof FootageView !== 'undefined' && FootageView) FootageView.mount(el);
    }

    /* ── Tape loading ─────────────────────────────────────────────────── */
    function loadTape(id, autoplay = false) {
        const tp = MediaCatalog.tape(id);
        if (!tp || !settings().tapes.includes(id)) return false;
        if (typeof FootageView !== 'undefined' && FootageView && FootageView.active()) FootageView.close();
        st.tapeId = id;
        st.t = 0;
        st.ended = false;
        st.shotIndex = -1;
        st.captionKey = '';
        renderShelf();
        renderMarks();
        const scrub = $('.mp-scrub');
        if (scrub) scrub.max = String(L().tapeLength(tp));
        probeReels(tp);
        draw(true);
        if (autoplay) play(); else pause(true);
        return true;
    }

    /* Ask once per shot whether its reel is installed. Until the answer is
       in, the shot shows its slide, so there is never a blank screen. */
    function probeReels(tp) {
        for (const shot of tp.shots) {
            if (!shot.video || shot.code in st.reels) continue;
            st.reels[shot.code] = undefined;
            media.sourceFor(shot.video).then((src) => {
                st.reels[shot.code] = src || null;
                if (src && tape() === tp && tp.shots[st.shotIndex] === shot) { st.shotIndex = -1; draw(true); }
            }, () => { st.reels[shot.code] = null; });
        }
    }

    function renderMarks() {
        const marks = $('.mp-marks');
        const tp = tape();
        if (!marks || !tp) return;
        const total = L().tapeLength(tp) || 1;
        marks.innerHTML = tp.shots.slice(1)
            .map((_, i) => `<i style="left:${((L().shotStart(tp, i + 1) / total) * 100).toFixed(3)}%"></i>`).join('');
    }

    /* ── Transport ────────────────────────────────────────────────────── */
    function play() {
        const tp = tape();
        if (!tp) return;
        if (st.ended || st.t >= L().tapeLength(tp) - 0.05) { st.t = 0; st.ended = false; st.shotIndex = -1; }
        if (!st.playing) sfx('click');
        st.playing = true;
        anchor();
        flash('PLAY ▶', 3000);
        syncPlayButton();
        draw(true);
        startLoop();
    }

    function pause(silent = false) {
        advance();
        if (st.playing && !silent) sfx('click');
        st.playing = false;
        st.osd = null;   // PAUSE replaces any REW / FF still on screen
        syncPlayButton();
        const v = $('.mp-video');
        if (v) v.pause();
        draw(false);
    }

    function toggle() {
        if (!tape()) return;
        if (st.playing) pause(); else play();
    }

    function seek(time) {
        const tp = tape();
        if (!tp) return;
        st.t = Math.max(0, Math.min(L().tapeLength(tp), Number(time) || 0));
        st.ended = false;
        anchor();
        draw(false);
    }

    function prevShot() {
        const tp = tape();
        if (!tp) return;
        advance();
        seek(L().previousShotTime(tp, st.t));
        flash('◀◀ REW', 1200);
        draw(false);
    }

    function nextShot() {
        const tp = tape();
        if (!tp) return;
        advance();
        const t = L().nextShotTime(tp, st.t);
        if (t >= L().tapeLength(tp)) { seek(t); endOfTape(); return; }
        seek(t);
        flash('▶▶ FF', 1200);
        draw(false);
    }

    function flash(text, ms) {
        st.osd = { text, until: performance.now() + ms };
        startLoop();
    }

    function syncPlayButton() {
        const btn = $('.mp-play');
        if (!btn) return;
        btn.innerHTML = st.playing ? '&#10074;&#10074;' : '&#9654;';
        btn.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
        root()?.querySelector('.mp')?.classList.toggle('is-playing', st.playing);
    }

    function endOfTape() {
        st.playing = false;
        st.ended = true;
        syncPlayButton();
        const v = $('.mp-video');
        if (v) v.pause();
        const s = settings();
        if (st.tapeId && !s.watched.includes(st.tapeId)) {
            s.watched.push(st.tapeId);
            try { State.save(); } catch (err) { /* */ }
            renderShelf();
        }
        draw(true);
    }

    /* ── The clock ────────────────────────────────────────────────────────
       Tape time is a function of the wall clock while playing, so a slow
       machine (or a headless one at two frames a second) still plays the
       tape at speed and frames only decide how often it is drawn. A hidden
       tab pauses the deck rather than running on unseen. */
    function anchor() {
        st.anchorT = st.t;
        st.anchorAt = performance.now();
    }

    function advance() {
        const tp = tape();
        if (!st.playing || !tp) return st.t;
        st.t = Math.min(L().tapeLength(tp), st.anchorT + Math.max(0, performance.now() - st.anchorAt) / 1000);
        return st.t;
    }

    function startLoop() {
        if (st.raf) return;
        const step = (now) => {
            st.raf = 0;
            if (!root()) { stop(); return; }
            if (st.playing) {
                const tp = tape();
                const before = L().locate(tp, st.t).index;
                advance();
                const after = L().locate(tp, st.t).index;
                if (after !== before) sfx(tp.shots[after].cue);
                if (st.t >= L().tapeLength(tp)) { endOfTape(); return; }
            }
            draw(false);
            if (st.playing || (st.osd && st.osd.until > now)) st.raf = requestAnimationFrame(step);
        };
        st.raf = requestAnimationFrame(step);
    }

    function stop() {
        if (st.raf) cancelAnimationFrame(st.raf);
        st.raf = 0;
        st.playing = false;
        st.shotIndex = -1;
    }

    /* ── Drawing ──────────────────────────────────────────────────────── */
    function pictureFor(tp, shot) {
        const glitch = shot.glitch ? ' is-glitch' : '';
        if (shot.card) {
            return `<div class="mp-card${glitch}">
                        <span class="mp-card-kicker">${esc(shot.card.kicker)}</span>
                        <span class="mp-card-title">${esc(shot.card.title)}</span>
                        <span class="mp-card-rule" aria-hidden="true"></span>
                        <span class="mp-card-sub">${esc(shot.card.sub)}</span>
                    </div>`;
        }
        const reel = st.reels[shot.code];
        const label = shot.art.label ? `<span class="mp-label">${esc(shot.art.label)}</span>` : '';
        if (reel) {
            return `<div class="mp-slide${glitch}" data-kind="reel">
                        <video class="mp-video" muted playsinline preload="none" src="${esc(reel)}"></video>
                        ${label}
                    </div>`;
        }
        const layer = (cls, src) => (src ? `<img class="${cls}" src="${esc(src)}" alt="" draggable="false">` : '');
        return `<div class="mp-slide${glitch}" data-kind="slide">
                    <div class="mp-move">
                        ${layer('mp-art-bg', shot.art.bg)}
                        ${layer('mp-art-subject', shot.art.subject)}
                        ${layer('mp-art-fx', shot.art.fx)}
                    </div>
                    ${label}
                </div>`;
    }

    function draw(force) {
        const el = root();
        const tp = tape();
        if (!el || !tp) return;
        const total = L().tapeLength(tp);
        const { index, local } = L().locate(tp, st.t);
        const shot = tp.shots[index];
        const picture = el.querySelector('.mp-picture');
        const screen = el.querySelector('.mp-screen');

        if (force || index !== st.shotIndex) {
            st.shotIndex = index;
            picture.innerHTML = pictureFor(tp, shot);
            screen.classList.toggle('is-glitch', !!shot.glitch);
            screen.setAttribute('aria-label', shot.card ? `Title card: ${shot.card.title}` : (shot.about || 'Training tape'));
            const v = picture.querySelector('.mp-video');
            if (v) {
                v.muted = true;
                v.onerror = () => { st.reels[shot.code] = null; st.shotIndex = -1; draw(true); };
            }
            const status = el.querySelector('.mp-status-shot');
            if (status) status.textContent = `${tp.code} · SHOT ${index + 1} OF ${tp.shots.length}`;
            const srcEl = el.querySelector('.mp-status-src');
            if (srcEl) srcEl.textContent = shot.card ? 'TITLE CARD' : (st.reels[shot.code] ? 'REEL' : 'STILL · FALLBACK SLIDE');
        }

        // The camera, or the reel's own clock.
        const move = picture.querySelector('.mp-move');
        if (move) {
            const cam = L().camera(shot.move, (Number(shot.dur) ? local / shot.dur : 0), reduced());
            move.style.transform = `translate(${cam.x.toFixed(2)}%, ${cam.y.toFixed(2)}%) scale(${cam.z.toFixed(4)})`;
        }
        const video = picture.querySelector('.mp-video');
        if (video) {
            const want = Math.max(0, local);
            if (video.readyState >= 1 && Math.abs((video.currentTime || 0) - want) > 0.35 &&
                (!Number.isFinite(video.duration) || want < video.duration)) {
                try { video.currentTime = want; } catch (err) { /* */ }
            }
            if (st.playing && video.paused && !document.hidden) {
                if (video.preload !== 'auto') video.preload = 'auto';
                video.play().catch(() => {});
            } else if (!st.playing && !video.paused) {
                video.pause();
            }
        }

        // Captions.
        const cap = L().captionAt(shot, local);
        const key = cap ? `${index}:${cap[0]}` : `${index}:-`;
        if (key !== st.captionKey) {
            st.captionKey = key;
            const speaker = el.querySelector('.mp-speaker');
            const line = el.querySelector('.mp-line');
            const who = cap ? (MediaCatalog.SPEAKERS[cap[1]] || '') : '';
            speaker.textContent = who;
            speaker.dataset.who = cap ? cap[1] : '';
            line.textContent = cap ? cap[2] : '';
            el.querySelector('.mp-caption').classList.toggle('is-null', !!cap && cap[1] === 'N');
        }

        // Transport readouts.
        const scrub = el.querySelector('.mp-scrub');
        if (scrub && !st.scrubbing) {
            const v = st.t.toFixed(2);
            if (scrub.value !== v) scrub.value = v;
        }
        const time = el.querySelector('.mp-time');
        const timeText = `${L().formatTime(st.t)} / ${L().formatTime(total)}`;
        if (time && time.textContent !== timeText) time.textContent = timeText;
        const counter = el.querySelector('.mp-counter');
        const s = Math.floor(st.t);
        const counterText = `SP 0:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
        if (counter && counter.textContent !== counterText) counter.textContent = counterText;

        // OSD: a transient message, else the deck's state.
        const osd = el.querySelector('.mp-osd');
        let osdText = '';
        if (st.osd && st.osd.until > performance.now()) osdText = st.osd.text;
        else if (st.ended) osdText = 'STOP ■';
        else if (!st.playing) osdText = 'PAUSE ❚❚';
        if (osd && osd.textContent !== osdText) osd.textContent = osdText;
        if (st.ended) {
            const srcEl = el.querySelector('.mp-status-src');
            if (srcEl) srcEl.textContent = 'END OF TAPE · BE KIND, REWIND';
        }
    }

    function syncVhs() {
        const el = root()?.querySelector('.mp');
        if (!el) return;
        const on = settings().vhs;
        el.classList.toggle('is-vhs', on);
        const box = el.querySelector('.mp-vhs-toggle');
        if (box) box.checked = on;
    }

    /* ── Public ───────────────────────────────────────────────────────── */
    function open() {
        const el = root();
        if (!el) return;
        stop();
        build(el);
        const s = settings();
        renderShelf();
        // Start on the newest tape not yet watched, else the first on file.
        const unwatched = s.tapes.filter((id) => !s.watched.includes(id));
        const first = unwatched[unwatched.length - 1] || s.tapes[0] || null;
        if (first) loadTape(first, false);
        else {
            const line = el.querySelector('.mp-line');
            if (line) line.textContent = 'No tapes on file. Orientation tapes are filed as you reach each part of the job.';
        }
        if (hasDOM && !open.wired) {
            open.wired = true;
            document.addEventListener('visibilitychange', () => {
                if (!root()) return;
                if (document.hidden && st.playing) { st.resumeOnShow = true; pause(true); }
                else if (!document.hidden && st.resumeOnShow) { st.resumeOnShow = false; play(); }
            });
        }
    }

    /* Space plays and pauses, the arrows step between shots, while the
       player is the top window — the same arrangement as Patience.exe. */
    function handleKey(e, topWindowId) {
        if (typeof FootageView !== 'undefined' && FootageView && FootageView.handleKey(e, topWindowId)) return true;
        if (topWindowId !== 'mediaplayer' || !root() || !tape()) return false;
        if (e.altKey || e.metaKey || e.ctrlKey) return false;
        if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) toggle(); return true; }
        if (e.code === 'ArrowLeft') { e.preventDefault(); prevShot(); return true; }
        if (e.code === 'ArrowRight') { e.preventDefault(); nextShot(); return true; }
        return false;
    }

    function onTapesChanged() {
        if (!root()) return;
        renderShelf();
        if (!st.tapeId) {
            const s = settings();
            if (s.tapes[0]) loadTape(s.tapes[0], false);
        }
    }

    return {
        open, handleKey, onTapesChanged, syncVhs,
        loadTape, play, pause, toggle, seek, prevShot, nextShot,
        state: () => ({ tape: st.tapeId, t: advance(), playing: st.playing, ended: st.ended, shot: st.shotIndex }),
    };
})();
