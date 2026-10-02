/* ════════════════════════════════════════════════════════════════════════
   CosmOS audio files — music and voices, by drop-in file.

   js/audio.js is the OS's own voice: every cue synthesised, nothing to
   load. This file adds what a synth cannot do, music and speech, the way
   js/media.js adds moving pictures: by file, dropped into assets/audio/,
   and WITH NO FILE INSTALLED NOTHING CHANGES AT ALL. No request beyond a
   HEAD probe, no ducking, no held tape clock, no new silence.

   ── Names (docs/AUDIO_PLAN.md §5) ───────────────────────────────────────
     assets/audio/music__<id>.ogg | .mp3           a cue from MUSIC below
     assets/audio/vo__<speaker>__<line-id>.ogg | .mp3
     assets/audio/sfx__<cue>.ogg | .mp3            foley under a synth cue

   Opus or Vorbis .ogg first, where the browser decodes it; .mp3 otherwise.

   Speakers are slugs: instructor, null-operator, sys, fate.
   A training-tape line id is  <tape>-s<shot>-<caption>:  the tape id, the
   1-based shot number (shot.n, the same number as the T1-S2 shot code),
   and the 0-based index of the caption in that shot. So the Instructor's
   first line in T1 shot 2 is  vo__instructor__t1-s2-0.ogg.  The id names a
   place, not the words, so a reworded caption keeps its id and only needs
   its file regenerated (assets/audio/MANIFEST.md records the exact text).

   Every other line is named by the content id it already has:
     Fate at Patience.exe   vo__fate__CAS-HOST-001         (CasinoHostBarks)
     the Adversary scenes   vo__null-operator__ADV-010     (speaker ADV)
                            vo__sys__ADV-001, vo__sys__FIN-H-03   (SYS)
                            vo__fate__ADV-027              (HOST, from far away)
   The scenes are SCN-ADV-001 (AdversaryScene, ADV-*) and SCN-ADV-002
   (AdversaryFinale, FIN-*). A choice prompt is never spoken.
   Foley is named by the synth cue it layers on, verbatim: sfx__purchase,
   sfx__windowOpen (the keys of audio.SOUNDS).

   ── Layout of this file ─────────────────────────────────────────────────
     AudioFiles        pure: names, the music table, the probe verdict, the
                       bed choice, tape lines and their hold limits.
                       tests/audio-files.mjs loads it in a vm.
     createTapeVoice(env)
                       the narration sync for the Media Player's tape clock,
                       with every effect injected so it can be tested on a
                       fake clock.
     tapeVoice         that sync, bound to audio.voice. Inert where `audio`
                       is undefined or has no device: the vm suites, the
                       simulator, a muted player.
     createSceneVoice(env) / sceneVoice
                       the same contract for the Adversary scenes: a beat
                       that has a line waits for it before its timer moves
                       the scene on. Escape skips the line.
     createFateVoice(env) / fateVoice
                       Fate speaks the line her strip shows, never over
                       anyone else's line.
   ════════════════════════════════════════════════════════════════════════ */

const AudioFiles = (() => {
    const DIR = 'assets/audio/';
    const ID = /^[a-z0-9][a-z0-9-]{0,80}$/;
    const LINE_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;   // CAS-HOST-001 is a line id too

    /* Caption speaker codes (MediaCatalog.SPEAKERS) to file slugs. */
    const SPEAKERS = Object.freeze({ I: 'instructor', N: 'null-operator', S: 'sys' });

    /* docs/AUDIO_PLAN.md §2. kind: a `bed` loops under the desktop and
       crossfades when the context changes; a `layer` loops over the bed;
       a `stinger` plays once over a dipped bed. Every row is wired, so a
       file dropped in for any of them plays where the table says. */
    const MUSIC = Object.freeze({
        'primordial-shift': { code: 'M1', kind: 'bed', title: 'Primordial Shift' },
        'void-breach': { code: 'M2', kind: 'bed', title: 'Void Breach' },
        cascade: { code: 'M3', kind: 'layer', title: 'Cascade' },
        'release-day': { code: 'M4', kind: 'stinger', title: 'Release Day' },
        'fates-table': { code: 'M5', kind: 'bed', title: 'Fate’s Table' },
        'media-player': { code: 'M6', kind: 'bed', title: 'Media Player' },
        'mirror-login': { code: 'M7', kind: 'bed', title: 'Mirror Login' },
        'ending-hostile': { code: 'M8', kind: 'bed', loop: false, title: 'Ending (hostile)' },
        'ending-curious': { code: 'M9', kind: 'bed', loop: false, title: 'Ending (curious)' },
        'ending-complicit': { code: 'M10', kind: 'bed', loop: false, title: 'Ending (complicit)' },
        boot: { code: 'M11', kind: 'stinger', title: 'Boot' },
    });

    /* A synth cue that also rings a music stinger, when its file exists. */
    const STINGER_ON_CUE = Object.freeze({ ship: 'release-day', boot: 'boot' });

    const ENDINGS = ['hostile', 'curious', 'complicit'];

    function musicStem(id) {
        return (typeof id === 'string' && Object.prototype.hasOwnProperty.call(MUSIC, id)) ? `music__${id}` : null;
    }

    function speakerSlug(speaker) {
        if (typeof speaker !== 'string') return null;
        if (Object.prototype.hasOwnProperty.call(SPEAKERS, speaker)) return SPEAKERS[speaker];
        return ID.test(speaker) ? speaker : null;
    }

    function voiceStem(speaker, lineId) {
        const slug = speakerSlug(speaker);
        if (!slug || typeof lineId !== 'string' || !LINE_ID.test(lineId)) return null;
        return `vo__${slug}__${lineId}`;
    }

    /* ── Lines outside the tapes ─────────────────────────────────────────
       Fate's lines are CasinoHostBarks rows; the scenes' beats are rows of
       AdversaryScene.dialogue and AdversaryFinale. Each is named by its own
       content id, under the speaker the row already declares. */
    const FATE_ID = /^CAS-HOST-\d{3}$/;
    const SCENE_ID = /^(ADV|FIN)(-[A-Z0-9]+)+$/;
    const SCENE_SPEAKERS = Object.freeze({ ADV: 'null-operator', SYS: 'sys', HOST: 'fate' });

    /* { speaker, id } for the line Fate's strip is showing, or null. */
    function fateLine(bark) {
        const id = bark && typeof bark === 'object' ? bark.id : null;
        return typeof id === 'string' && FATE_ID.test(id) ? { speaker: 'fate', id } : null;
    }

    /* { speaker, id } for a scene beat, or null. A choice prompt is the
       player's turn, not a line; an unknown speaker is nobody's voice. */
    function sceneLine(beat) {
        if (!beat || typeof beat !== 'object' || beat.type === 'choice_prompt') return null;
        const code = beat.speaker;
        if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(SCENE_SPEAKERS, code)) return null;
        if (typeof beat.id !== 'string' || !SCENE_ID.test(beat.id)) return null;
        // {REBOOTS}, {BAND}: words that change per save. A recording would
        // say something the caption does not, so these stay caption-only.
        if (/\{[A-Z]+\}/.test(String(beat.text || ''))) return null;
        return { speaker: SCENE_SPEAKERS[code], id: beat.id };
    }

    /* One line plays at a time. A speaker's new line replaces its own last
       one (Fate's strip replaces her line), but never someone else's: a
       tape or a scene is not talked over by the dealer. */
    function mayInterrupt(currentStem, slug) {
        if (!currentStem) return true;
        return typeof slug === 'string' && String(currentStem).startsWith(`vo__${slug}__`);
    }

    /* ── Foley (§4) ──────────────────────────────────────────────────────
       sfx__<cue> layers a recorded one-shot on the synth cue of the same
       name, through that cue's own voice (so its bus, its reverb send and
       its polyphony), at FOLEY_GAIN: about 6 dB under unity, so the synth
       stays the cue and the recording is texture. It is rate-limited per
       cue at the synth's own repeat gap, and never tighter than
       FOLEY_MIN_GAP_MS: a 25 ms click tick does not get a relay sample at
       forty a second. */
    const FOLEY_GAIN = 0.5;
    const FOLEY_MIN_GAP_MS = 120;
    const CUE = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

    function foleyStem(cue) {
        return typeof cue === 'string' && CUE.test(cue) ? `sfx__${cue}` : null;
    }

    function foleyGap(synthGapMs) {
        const g = Number(synthGapMs);
        return Math.max(FOLEY_MIN_GAP_MS, Number.isFinite(g) ? g : 0);
    }

    /* allow(key, nowMs, gapMs): true at most once per gap per key. */
    function createRateLimit() {
        const last = Object.create(null);
        return (key, nowMs, gapMs) => {
            const prev = last[key];
            if (prev !== undefined && nowMs - prev < gapMs) return false;
            last[key] = nowMs;
            return true;
        };
    }

    /* The files to try for a stem, in order. Nothing that could leave
       assets/audio/: a stem is only ever built by the functions above. */
    function urls(stem, canOgg = true) {
        if (typeof stem !== 'string' || !/^(music|vo|sfx)__[A-Za-z0-9_-]+$/.test(stem)) return [];
        return canOgg ? [`${DIR}${stem}.ogg`, `${DIR}${stem}.mp3`] : [`${DIR}${stem}.mp3`];
    }

    /* A HEAD probe's verdict. The pattern of MediaLogic.responseIsMedia: a
       dev server answers a missing file with its SPA fallback (index.html,
       status 200), so the status proves nothing and only the type does.
       Some hosts label .ogg as application/ogg, or media as octet-stream,
       or send no type; those count. HTML, JSON, text never do. */
    function responseIsAudio(ok, contentType) {
        if (!ok) return false;
        const type = String(contentType || '').toLowerCase().trim();
        if (!type || type.includes('octet-stream')) return true;
        return type.startsWith('audio/') || type.startsWith('application/ogg');
    }

    /* Ducking: voice drops the music bus by about 8 dB while a line plays. */
    const DUCK_DB = 8;
    const duckGain = (db = DUCK_DB) => Math.pow(10, -Math.abs(Number(db) || 0) / 20);

    /* ── Music: which bed, in priority order ─────────────────────────────
       `c` is read from the game by the binding:
         desktop     the desktop is up (no boot overlay)
         dimension   'primordial' | 'void'
         focus       the top window id, or null
         tapePlaying a training tape is running in the Media Player
         adversary   the Adversary scene holds the screen
         ending      'hostile' | 'curious' | 'complicit' while credits roll
       The scenes (an ending, the Adversary) are exclusive: with no file for
       them the bed fades out for the scene rather than playing M1's warmth
       under it. Window themes fall back to the dimension's bed. M1 is the
       primordial bed only; the Void has M2 or nothing. */
    function bedCandidates(c = {}) {
        if (!c || !c.desktop) return [];
        if (ENDINGS.includes(c.ending)) return [`ending-${c.ending}`];
        if (c.adversary) return ['mirror-login'];
        const base = c.dimension === 'void' ? ['void-breach'] : ['primordial-shift'];
        if (c.focus === 'solitaire') return ['fates-table', ...base];
        if (c.focus === 'mediaplayer' && !c.tapePlaying) return ['media-player', ...base];
        return base;
    }

    /* The first candidate known to be installed. `available(id)` is true,
       false, or undefined while unprobed; an unprobed candidate is passed
       over this time and taken on a later update once its probe answers. */
    function chooseBed(candidates, available) {
        for (const id of candidates || []) {
            if (available(id) === true) return id;
        }
        return null;
    }

    function layerFor(c = {}) {
        return c && c.desktop && !c.ending && !c.adversary && Number(c.cascadeTier) >= 2 ? 'cascade' : null;
    }

    /* ── Tape lines ──────────────────────────────────────────────────────
       Every caption with a known speaker, in tape order, with its absolute
       time on the tape clock and its LIMIT: the next sync point — the next
       caption in the same shot, or the end of the shot. While a line plays,
       the tape clock may not pass its limit. */
    function lineId(tape, shot, captionIndex, shotIndex = 0) {
        const n = Number.isInteger(shot?.n) ? shot.n : shotIndex + 1;
        return `${tape.id}-s${n}-${captionIndex}`;
    }

    function tapeLines(tape) {
        const out = [];
        if (!tape || !Array.isArray(tape.shots) || typeof tape.id !== 'string') return out;
        let start = 0;
        tape.shots.forEach((shot, si) => {
            const dur = Number(shot?.dur) || 0;
            const caps = Array.isArray(shot?.captions) ? shot.captions : [];
            caps.forEach((c, ci) => {
                const speaker = SPEAKERS[c?.[1]];
                if (!speaker) return;
                const local = Math.max(0, Math.min(dur, Number(c[0]) || 0));
                let nextLocal = dur;
                for (let k = ci + 1; k < caps.length; k++) {
                    const t = Number(caps[k]?.[0]);
                    if (Number.isFinite(t) && t > local) { nextLocal = Math.min(dur, t); break; }
                }
                out.push({
                    id: lineId(tape, shot, ci, si),
                    speaker,
                    code: c[1],
                    text: String(c[2] ?? ''),
                    shotIndex: si,
                    caption: ci,
                    at: start + local,
                    limit: start + nextLocal,
                });
            });
            start += dur;
        });
        return out;
    }

    /* The line whose start the clock crossed going from `from` to `to`:
       from < at <= to. When several were crossed (a long frame), the last. */
    function crossedLine(lines, from, to) {
        let hit = null;
        for (const line of lines || []) {
            if (line.at > from && line.at <= to) hit = line;
        }
        return hit;
    }

    return {
        DIR, SPEAKERS, SCENE_SPEAKERS, MUSIC, STINGER_ON_CUE, DUCK_DB, FOLEY_GAIN, FOLEY_MIN_GAP_MS,
        musicStem, speakerSlug, voiceStem, urls, responseIsAudio, duckGain,
        fateLine, sceneLine, mayInterrupt, foleyStem, foleyGap, createRateLimit,
        bedCandidates, chooseBed, layerFor,
        lineId, tapeLines, crossedLine,
    };
})();

/* ── Narration sync for the tape clock ─────────────────────────────────

   The Media Player asks tick(tape, t, playing) every frame with the time
   its wall clock wants, and takes back the time it may have. A line starts
   when the clock crosses its caption; while it plays, the clock is held
   just short of the line's limit, so the next caption — or the next shot —
   waits for the line to finish. Captions are untouched: they are on screen
   whether or not anyone speaks them.

   The hold only applies once the line's file is KNOWN to be installed
   (env.say calls onPresent). A missing file never holds the clock, not
   even for the length of its probe.

     env.say(line, { onPresent })  Promise<outcome>, always resolves
     env.stop()                    cut the line that is playing
     env.known(line)               true | false | undefined (unprobed)
     env.prefetch(lines)           warm the probes for a tape

   Pause and resume. pause() cuts the line like stop(), but remembers it;
   the first tick after play resumes says it again FROM ITS START, as long
   as the clock is still on that caption. A seek, a shot skip, a new tape
   or the end of the tape forgets it. A line cut from outside (a hidden
   tab, a scene speaking over the tape) is remembered the same way while
   its caption is up, because the tab-hidden path cuts the line a moment
   before the Media Player pauses the deck.                              */
function createTapeVoice(env) {
    const EPS = 1e-3;
    const LOOKBACK = 0.25;   // a clock positioned on a caption's start speaks it
    let tapeRef = null;
    let lines = [];
    let prevT = null;        // null: just positioned (load, seek, pause)
    let cur = null;          // { line, held }
    let resumeLine = null;   // paused mid-line: say it again on resume
    let cutLine = null;      // cut from outside while its caption is up

    function linesFor(tape) {
        if (tape !== tapeRef) {
            tapeRef = tape;
            lines = AudioFiles.tapeLines(tape);
            prevT = null;
            resumeLine = null;
            cutLine = null;
            cut();
        }
        return lines;
    }

    function cut() {
        if (!cur) return;
        cur = null;
        try { env.stop(); } catch (err) { /* narration is presentation */ }
    }

    function start(line) {
        cut();
        cutLine = null;
        let known;
        try { known = env.known(line); } catch (err) { known = false; }
        if (known === false) return;
        const token = { line, held: false };
        cur = token;
        let p;
        try {
            p = env.say(line, { onPresent: () => { if (cur === token) token.held = true; } });
        } catch (err) {
            cur = null;
            return;
        }
        // Our own cut() clears `cur` first, so only an outside cut lands here
        // as 'stopped' with the token still current.
        const release = (outcome) => {
            if (cur !== token) return;
            cur = null;
            if (outcome === 'stopped') cutLine = line;
        };
        Promise.resolve(p).then(release, () => release('error'));
    }

    const onCaption = (line, t) => !!line && t >= line.at - EPS && t < line.limit;

    return {
        load(tape) {
            const ls = linesFor(tape);
            cut();
            prevT = null;
            resumeLine = null;
            cutLine = null;
            try { env.prefetch(ls); } catch (err) { /* */ }
        },
        stop() {
            cut();
            prevT = null;
            resumeLine = null;
            cutLine = null;
        },
        pause() {
            const line = cur ? cur.line : cutLine;
            cut();
            prevT = null;
            cutLine = null;
            resumeLine = line || null;
        },
        tick(tape, t, playing) {
            if (!tape || !playing || !Number.isFinite(t)) return t;
            const ls = linesFor(tape);
            let out = t;
            if (cur && cur.held && out > cur.line.limit - EPS) out = Math.max(cur.line.at, cur.line.limit - EPS);
            if (resumeLine) {
                const again = resumeLine;
                resumeLine = null;
                if (onCaption(again, out)) {
                    prevT = out;
                    start(again);
                    return out;
                }
            }
            if (cutLine && !onCaption(cutLine, out)) cutLine = null;
            const from = prevT === null ? out - LOOKBACK : prevT;
            const next = AudioFiles.crossedLine(ls, from, out);
            prevT = out;
            if (next && (!cur || cur.line !== next)) start(next);
            return out;
        },
        speaking: () => !!(cur && cur.held),
        current: () => (cur ? cur.line.id : null),
        resuming: () => (resumeLine ? resumeLine.id : null),
    };
}

const tapeVoice = createTapeVoice({
    say(line, opts) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return Promise.resolve('off');
        return audio.voice.say(line.speaker, line.id, opts);
    },
    stop() {
        if (typeof audio !== 'undefined' && audio && audio.voice) audio.voice.stop();
    },
    known(line) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return false;
        return audio.voice.known(line.speaker, line.id);
    },
    prefetch(lines) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return;
        audio.voice.prefetch(lines.map((l) => [l.speaker, l.id]));
    },
});

/* ── Narration for the Adversary scenes ─────────────────────────────────

   SCN-ADV-001 (the Mirror Login) and SCN-ADV-002 (End of Shift) draw one
   beat at a time and move on by a dwell timer. When a beat is drawn, ui.js
   calls speak(beat); when its dwell timer fires, it asks hold(next) first.
   While the beat's line is KNOWN to be playing, hold() keeps `next` and
   returns true, and `next` runs GAP_MS after the line ends: the beat waits
   for its line, as a tape caption does. A missing file, or a probe still
   out, never holds anything.

   Only the timer waits. A click still moves the scene on (the next beat's
   own line cuts this one), an act beat still waits on its button alone,
   and skip() — Escape — cuts the line and forgets the waiting timer, so
   Escape goes on to do exactly what it did before there were voices.

     env.say(line, { onPresent })  Promise<outcome>, always resolves
     env.stop(line)                cut this line, if it is the one playing
     env.known(line)               true | false | undefined (unprobed)
     env.prefetch(lines)           warm the probes for a scene
     env.later(fn, ms)             a timer                               */
function createSceneVoice(env) {
    const GAP_MS = 350;
    let cur = null;          // { line, held, waiter }
    let gen = 0;             // bumped by every beat and every cut

    function cut() {
        gen += 1;
        if (!cur) return;
        const token = cur;
        cur = null;
        token.waiter = null;
        try { env.stop(token.line); } catch (err) { /* narration is presentation */ }
    }

    return {
        prefetch(beats) {
            const lines = (Array.isArray(beats) ? beats : []).map(AudioFiles.sceneLine).filter(Boolean);
            try { env.prefetch(lines); } catch (err) { /* */ }
            return lines.length;
        },
        /* A beat was drawn. true when its line was asked for. */
        speak(beat) {
            cut();
            const line = AudioFiles.sceneLine(beat);
            if (!line) return false;
            let known;
            try { known = env.known(line); } catch (err) { known = false; }
            if (known === false) return false;
            const token = { line, held: false, waiter: null };
            cur = token;
            let p;
            try {
                p = env.say(line, { onPresent: () => { if (cur === token) token.held = true; } });
            } catch (err) {
                cur = null;
                return false;
            }
            const release = () => {
                if (cur !== token) return;
                cur = null;
                const next = token.waiter;
                token.waiter = null;
                if (!next) return;
                const mine = gen;
                try { env.later(() => { if (gen === mine) next(); }, GAP_MS); } catch (err) { /* */ }
            };
            Promise.resolve(p).then(release, release);
            return true;
        },
        /* The dwell timer asks before it advances. */
        hold(next) {
            if (!cur || !cur.held || typeof next !== 'function') return false;
            cur.waiter = next;
            return true;
        },
        skip() { cut(); },
        stop() { cut(); },
        speaking: () => !!(cur && cur.held),
        waiting: () => !!(cur && cur.waiter),
        current: () => (cur ? cur.line.id : null),
    };
}

const sceneVoice = createSceneVoice({
    say(line, opts) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return Promise.resolve('off');
        return audio.voice.say(line.speaker, line.id, opts);
    },
    stop(line) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return;
        // Only our own line: a scene closing must not cut someone else's.
        if (audio.voice.current() === AudioFiles.voiceStem(line.speaker, line.id)) audio.voice.stop();
    },
    known(line) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return false;
        return audio.voice.known(line.speaker, line.id);
    },
    prefetch(lines) {
        if (typeof audio === 'undefined' || !audio || !audio.voice || !lines.length) return;
        const s = typeof audio.settings === 'function' ? audio.settings() : null;
        if (s && (s.muted || !s.voiceEnabled)) return;   // nothing to hear, nothing to probe
        audio.voice.prefetch(lines.map((l) => [l.speaker, l.id]));
    },
    later(fn, ms) { setTimeout(fn, ms); },
});

/* ── Fate's voice at Patience.exe ───────────────────────────────────────

   PatienceView.speak shows a line in the dealer's strip; this says it, if
   vo__fate__<CAS-HOST-id> is installed. The line has already passed the
   router — Dealer Chatter, the two-second floor between any two of her
   lines, each line's own cooldown — so the voice is never heard more often
   than the strip changes. Chatter off is checked again here, and the
   Voices setting is audio.voice's own. Her new line replaces her last
   one, as the strip does; she never talks over a tape or a scene.

     env.say(speaker, id)   Promise<outcome>
     env.stop()             cut the line playing
     env.current()          the stem playing (or loading), or null
     env.chatterOn()        Dealer Chatter                               */
function createFateVoice(env) {
    return {
        speak(bark) {
            const line = AudioFiles.fateLine(bark);
            if (!line) return Promise.resolve('none');
            try {
                if (!env.chatterOn()) return Promise.resolve('off');
                if (!AudioFiles.mayInterrupt(env.current(), line.speaker)) return Promise.resolve('busy');
                return Promise.resolve(env.say(line.speaker, line.id)).catch(() => 'error');
            } catch (err) {
                return Promise.resolve('error');
            }
        },
        /* The table closed, or chatter went off: her line stops with it,
           and nobody else's does. */
        stop() {
            try {
                const current = env.current();
                if (current && AudioFiles.mayInterrupt(current, 'fate')) env.stop();
            } catch (err) { /* */ }
        },
    };
}

const fateVoice = createFateVoice({
    say(speaker, id) {
        if (typeof audio === 'undefined' || !audio || !audio.voice) return Promise.resolve('off');
        return audio.voice.say(speaker, id);
    },
    stop() {
        if (typeof audio !== 'undefined' && audio && audio.voice) audio.voice.stop();
    },
    current() {
        return (typeof audio !== 'undefined' && audio && audio.voice) ? audio.voice.current() : null;
    },
    chatterOn() {
        return typeof game !== 'undefined' && game && typeof game.dealerChatterOn === 'function' ? game.dealerChatterOn() : false;
    },
});
