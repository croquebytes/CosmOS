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

   Opus or Vorbis .ogg first, where the browser decodes it; .mp3 otherwise.

   Speakers are slugs: instructor, null-operator, sys (and later fate).
   A training-tape line id is  <tape>-s<shot>-<caption>:  the tape id, the
   1-based shot number (shot.n, the same number as the T1-S2 shot code),
   and the 0-based index of the caption in that shot. So the Instructor's
   first line in T1 shot 2 is  vo__instructor__t1-s2-0.ogg.  The id names a
   place, not the words, so a reworded caption keeps its id and only needs
   its file regenerated (assets/audio/MANIFEST.md records the exact text).

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

    /* The files to try for a stem, in order. Nothing that could leave
       assets/audio/: a stem is only ever built by the two functions above. */
    function urls(stem, canOgg = true) {
        if (typeof stem !== 'string' || !/^(music|vo)__[A-Za-z0-9_-]+$/.test(stem)) return [];
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
        DIR, SPEAKERS, MUSIC, STINGER_ON_CUE, DUCK_DB,
        musicStem, speakerSlug, voiceStem, urls, responseIsAudio, duckGain,
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
     env.prefetch(lines)           warm the probes for a tape          */
function createTapeVoice(env) {
    const EPS = 1e-3;
    const LOOKBACK = 0.25;   // a clock positioned on a caption's start speaks it
    let tapeRef = null;
    let lines = [];
    let prevT = null;        // null: just positioned (load, seek, pause)
    let cur = null;          // { line, held }

    function linesFor(tape) {
        if (tape !== tapeRef) {
            tapeRef = tape;
            lines = AudioFiles.tapeLines(tape);
            prevT = null;
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
        const release = () => { if (cur === token) cur = null; };
        Promise.resolve(p).then(release, release);
    }

    return {
        load(tape) {
            const ls = linesFor(tape);
            cut();
            prevT = null;
            try { env.prefetch(ls); } catch (err) { /* */ }
        },
        stop() {
            cut();
            prevT = null;
        },
        tick(tape, t, playing) {
            if (!tape || !playing || !Number.isFinite(t)) return t;
            const ls = linesFor(tape);
            let out = t;
            if (cur && cur.held && out > cur.line.limit - EPS) out = Math.max(cur.line.at, cur.line.limit - EPS);
            const from = prevT === null ? out - LOOKBACK : prevT;
            const next = AudioFiles.crossedLine(ls, from, out);
            prevT = out;
            if (next && (!cur || cur.line !== next)) start(next);
            return out;
        },
        speaking: () => !!(cur && cur.held),
        current: () => (cur ? cur.line.id : null),
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
