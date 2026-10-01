/* ════════════════════════════════════════════════════════════════════════
   CosmOS audio — sacred machinery.

   Every sound is synthesised at runtime with WebAudio: oscillators, a noise
   buffer, filters, envelopes and a reverb whose impulse response is generated
   here. There are no audio files, so the game ships offline with nothing
   extra to load and nothing to license.

   The identity is a late-90s PC that has been consecrated: PC-speaker beeps,
   relay contacts and hard-drive seek chatter, sitting under choir pads, bells
   and tuned resonances. It is meant to survive hours of idle play, so every
   cue is short, filtered and soft, and the ambient bed is kept well below
   them.

   ROUTING
     voice ─┬─> ui bus ──────┐
            ├─> sfx bus ─────┼─> master ─> limiter ─> speakers
            └─> reverb ─> fx ┘      ^
     ambient bed ─> ambient bus ────┘

   The ui and fx buses follow the SFX setting (ui sits a little lower), and
   ambient has its own. Mute zeroes the master gain and suspends the context.

   SOUND TABLE (name — bus — what it is)
     click          ui    Beveled-button tick: a relay contact closing.
     windowOpen     ui    PC-speaker chirp upward, a small bell answers.
     windowClose    ui    The same chirp falling, then a contact click.
     windowMode     ui    Maximise / restore / snap: a short air swish.
     startMenu      ui    Contact click and an open fifth, rolled.
     miracle        sfx   A bell. Pitch climbs with the Miracle streak on a
                          D-major pentatonic so rapid clicking is a melody.
                          Voice-limited (4) and rate-throttled; level falls
                          as click density rises so 15 clicks/sec stays clean.
                          {void:true} is the darker Void variant.
     purchase       sfx   Contact click and a rising fifth.
     error          sfx   The "ding", reimagined: a dull bell over a low
                          PC-speaker thud. Insufficient funds.
     directive      sfx   Four-bell arpeggio over a short choir breath.
     achievement    sfx   Tiered stinger: Bronze 2 bells, Silver 3, Gold 4
                          plus choir, Platinum 5 plus choir and shimmer,
                          Secret a dark unresolved cluster.
     overclock      sfx   Drive spin-up into a rising choir and a bell.
     eventAppear    sfx   A faint three-bell sparkle somewhere overhead.
     eventClaim     sfx   A rolled bell chord; climbs with the chain.
     document       sfx   Seek chatter while the record is read, then a bell.
     cascade        sfx   Instability alarm. Two-tone PC-speaker alert over a
                          dark choir; more repeats, lower and more dissonant
                          with each tier.
     adversary      sfx   Intrusion glitch: sample-and-hold square, noise
                          bursts, and a beating sub-pad crawling downward.
     adversaryBark  sfx   A 150 ms flicker of the same glitch.
     ship           sfx   Release chord: the build writing to disk, then a
                          full choir chord with bells.
     boot           sfx   BIOS POST beep, a faint CRT whine, drive spin-up
                          and seek chatter.
     desktop        sfx   Choir swell as the desktop resolves.
     (ambient bed)  amb   Low evolving drone. Its filter and a shimmer layer
                          open with production rate; it darkens and detunes
                          with cascade tier. Updated twice a second.

   LIFECYCLE
     The AudioContext is created on the first user gesture (autoplay policy)
     — never before, so the console stays clean. It is suspended when the tab
     is hidden and resumed on return. If WebAudio does not exist every call
     here is a no-op. Game code reaches this file only through game.sfx(),
     which is inert where `audio` is undefined (the simulator and vm tests).
   ════════════════════════════════════════════════════════════════════════ */

const audio = (() => {
    'use strict';

    const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
    const AC = hasWindow ? (window.AudioContext || window.webkitAudioContext || null) : null;
    const OAC = hasWindow ? (window.OfflineAudioContext || window.webkitOfflineAudioContext || null) : null;

    /* Persisted in State.settings.audio. Ambient defaults lower than SFX: it
       plays for hours, and a bed should be noticed when it stops, not while
       it runs. Keep in step with the schema in js/state.js. */
    const DEFAULTS = Object.freeze({
        master: 0.7,
        sfx: 0.8,
        ambient: 0.35,
        sfxEnabled: true,
        ambientEnabled: true,
        muted: false,
    });
    const UI_TRIM = 0.7;       // ui bus relative to the SFX setting
    /* Bed output into the ambient bus. The offline level check first
       measured the bed at -17 dB RMS, louder than most cues; this trim puts
       it near -40, which is where a sound you live inside for hours belongs. */
    const AMBIENT_BED = 0.07;
    const MAX_VOICES = 24;     // global polyphony ceiling
    const AMBIENT_UPDATE_MS = 500;

    /* ── Tuning ─────────────────────────────────────────────────────────── */
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const PENTA = [0, 2, 4, 7, 9];        // major pentatonic: nothing clashes
    const PENTA_MINOR = [0, 3, 5, 7, 10]; // the Void's
    const ROOT = 62;                      // D4
    function degree(d, root = ROOT, scale = PENTA) {
        const oct = Math.floor(d / scale.length);
        const idx = ((d % scale.length) + scale.length) % scale.length;
        return midi(root + oct * 12 + scale[idx]);
    }
    const rand = (lo, hi) => lo + Math.random() * (hi - lo);

    /* ── Node helpers ───────────────────────────────────────────────────── */
    function amp(ctx, dest, value = 1) {
        const g = ctx.createGain();
        g.gain.value = value;
        if (dest) g.connect(dest);
        return g;
    }

    function filt(ctx, dest, type, freq, Q = 0.7) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = Q;
        if (dest) f.connect(dest);
        return f;
    }

    function osc(ctx, type, freq, t, end, dest, detune = 0) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (detune) o.detune.value = detune;
        o.connect(dest);
        o.start(t);
        o.stop(end + 0.05);
        return o;
    }

    /* Linear attack, optional hold, exponential-ish fall. setTargetAtTime
       with tau = d/5 reaches about -43 dB at `d`, which is where we stop. */
    function envelope(param, t, { a = 0.004, peak = 1, d = 0.4, hold = 0 } = {}) {
        param.setValueAtTime(0.0001, t);
        param.linearRampToValueAtTime(peak, t + a);
        if (hold > 0) param.setValueAtTime(peak, t + a + hold);
        param.setTargetAtTime(0.0001, t + a + hold, Math.max(0.005, d / 5));
        return t + a + hold + d;
    }

    function noiseSource(ctx, G, t, end) {
        const src = ctx.createBufferSource();
        src.buffer = G.noise;
        src.loop = true;
        src.start(t, rand(0, G.noise.duration - 0.1));
        src.stop(end + 0.05);
        return src;
    }

    /* ── Instruments ────────────────────────────────────────────────────── */

    // Struck-bell partials: [ratio, amplitude, decay multiplier]. Sine-only,
    // so even the brightest bell stays round.
    const BELL = [[1, 1, 1], [2.0, 0.42, 0.62], [2.76, 0.28, 0.45], [4.07, 0.14, 0.3], [5.43, 0.08, 0.2]];
    const BELL_DARK = [[1, 1, 1], [1.5, 0.3, 0.7], [2.41, 0.22, 0.5], [3.37, 0.1, 0.3]];
    const BELL_DULL = [[1, 1, 1], [2.0, 0.25, 0.4], [2.92, 0.12, 0.25]];

    function bell(ctx, dest, t, f, { peak = 0.2, decay = 1.2, bright = 1, partials = BELL } = {}) {
        let end = t;
        partials.forEach(([ratio, a, dm], i) => {
            const fr = f * ratio;
            if (fr > 12000) return;
            const g = amp(ctx, dest, 0);
            const e = envelope(g.gain, t, { a: 0.002, peak: peak * a * (i ? bright : 1), d: decay * dm });
            osc(ctx, 'sine', fr, t, e, g);
            end = Math.max(end, e);
        });
        // A second fundamental a few cents off: the slow beat of a tuned
        // resonance, which is what makes it read as metal rather than a sine.
        const hum = amp(ctx, dest, 0);
        const e = envelope(hum.gain, t, { a: 0.01, peak: peak * 0.35, d: decay * 1.2 });
        osc(ctx, 'sine', f, t, e, hum, 4);
        return Math.max(end, e);
    }

    // Relay contact / button tick: a few milliseconds of band-passed noise.
    function tick(ctx, G, dest, t, { freq = 2600, Q = 1.2, peak = 0.3, dur = 0.012 } = {}) {
        const f = filt(ctx, dest, 'bandpass', freq, Q);
        const g = amp(ctx, f, 0);
        const end = envelope(g.gain, t, { a: 0.0006, peak, d: dur });
        noiseSource(ctx, G, t, end).connect(g);
        return end;
    }

    // PC speaker: a square wave, low-passed so it is the memory of a beep
    // rather than the real, painful thing.
    function beep(ctx, dest, t, f, dur, { peak = 0.06, to = null, lp = 2000 } = {}) {
        const lpf = filt(ctx, dest, 'lowpass', lp, 0.5);
        const g = amp(ctx, lpf, 0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.004);
        g.gain.setValueAtTime(peak, t + Math.max(0.005, dur - 0.012));
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        const o = osc(ctx, 'square', f, t, t + dur, g);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
        return t + dur;
    }

    // Noise swept through a band-pass: air moving.
    function whoosh(ctx, G, dest, t, { from = 500, to = 2400, dur = 0.14, peak = 0.1, Q = 2.2 } = {}) {
        const f = filt(ctx, dest, 'bandpass', from, Q);
        f.frequency.setValueAtTime(from, t);
        f.frequency.exponentialRampToValueAtTime(to, t + dur);
        const g = amp(ctx, f, 0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        noiseSource(ctx, G, t, t + dur).connect(g);
        return t + dur;
    }

    // Hard-drive seek chatter: irregular clicks with the odd actuator thunk.
    function seek(ctx, G, dest, t, { count = 6, span = 0.4, peak = 0.16 } = {}) {
        let tt = t;
        let end = t;
        for (let i = 0; i < count; i += 1) {
            end = Math.max(end, tick(ctx, G, dest, tt, { freq: rand(1600, 3600), Q: 1.8, peak: peak * rand(0.55, 1), dur: 0.008 }));
            if (i % 2 === 0) {
                const g = amp(ctx, dest, 0);
                const e = envelope(g.gain, tt, { a: 0.001, peak: peak * 0.5, d: 0.03 });
                osc(ctx, 'sine', rand(95, 140), tt, e, g);
                end = Math.max(end, e);
            }
            tt += (span / count) * rand(0.45, 1.5);
        }
        return end;
    }

    // Choir: detuned saws through three vowel formants, with a slow vibrato.
    const VOWEL_AH = [[730, 1.0, 5], [1090, 0.55, 7], [2440, 0.2, 9]];
    const VOWEL_OO = [[320, 1.0, 5], [800, 0.4, 7], [2240, 0.1, 9]];

    function choir(ctx, dest, t, freqs, { a = 0.6, hold = 0.6, r = 1.6, peak = 0.12, vowel = VOWEL_AH, spread = 9 } = {}) {
        const end = t + a + hold + r;
        const out = amp(ctx, dest, 0);
        out.gain.setValueAtTime(0.0001, t);
        out.gain.linearRampToValueAtTime(peak, t + a);
        out.gain.setValueAtTime(peak, t + a + hold);
        out.gain.setTargetAtTime(0.0001, t + a + hold, r / 5);

        // Band-passing a saw throws most of its energy away; the makeup gain
        // brings each formant back to roughly unity.
        const sum = amp(ctx, null, 2.6 / Math.sqrt(freqs.length * 2));
        vowel.forEach(([f, gv, q]) => {
            const fg = amp(ctx, out, gv);
            const bp = filt(ctx, fg, 'bandpass', f, q);
            sum.connect(bp);
        });
        // A little low-passed body under the formants.
        const body = filt(ctx, amp(ctx, out, 0.18), 'lowpass', 600, 0.5);
        sum.connect(body);

        const vib = ctx.createOscillator();
        vib.frequency.value = 4.6;
        const vibAmt = amp(ctx, null, 7);
        vib.connect(vibAmt);
        vib.start(t);
        vib.stop(end + 0.05);

        freqs.forEach((f) => {
            [-spread, spread].forEach((dt) => {
                const o = osc(ctx, 'sawtooth', f, t, end, sum, dt);
                vibAmt.connect(o.detune);
            });
        });
        return end;
    }

    // Sine swell for weight under a chord.
    function sub(ctx, dest, t, f, { a = 0.4, hold = 0.4, r = 1.2, peak = 0.08 } = {}) {
        const g = amp(ctx, dest, 0);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + a);
        g.gain.setValueAtTime(peak, t + a + hold);
        g.gain.setTargetAtTime(0.0001, t + a + hold, r / 5);
        const end = t + a + hold + r;
        osc(ctx, 'sine', f, t, end, g);
        return end;
    }

    // Sample-and-hold square: the signal of something that is not us.
    function glitch(ctx, G, dest, t, dur, { peak = 0.05, lo = 90, hi = 1600 } = {}) {
        const lpf = filt(ctx, dest, 'lowpass', 2400, 0.7);
        const g = amp(ctx, lpf, 0);
        const o = osc(ctx, 'square', rand(lo, hi), t, t + dur, g);
        let tt = t;
        while (tt < t + dur) {
            o.frequency.setValueAtTime(rand(lo, hi), tt);
            g.gain.setValueAtTime(Math.random() < 0.7 ? peak * rand(0.4, 1) : 0, tt);
            tt += rand(0.018, 0.05);
        }
        g.gain.setValueAtTime(0, t + dur);
        const nf = filt(ctx, dest, 'bandpass', 1800, 1.5);
        const ng = amp(ctx, nf, 0);
        tt = t;
        while (tt < t + dur) {
            ng.gain.setValueAtTime(Math.random() < 0.35 ? peak * 1.6 : 0, tt);
            nf.frequency.setValueAtTime(rand(600, 4000), tt);
            tt += rand(0.02, 0.07);
        }
        ng.gain.setValueAtTime(0, t + dur);
        noiseSource(ctx, G, t, t + dur).connect(ng);
        return t + dur;
    }

    function arpeggio(ctx, dest, t, degrees, { step = 0.085, peak = 0.14, decay = 1.1, bright = 0.9, root = ROOT, partials = BELL } = {}) {
        let end = t;
        degrees.forEach((d, i) => {
            end = Math.max(end, bell(ctx, dest, t + i * step, degree(d, root), { peak, decay, bright, partials }));
        });
        return end;
    }

    /* ── The sound table ────────────────────────────────────────────────────
       bus:    'ui' | 'sfx'
       wet:    send into the procedural reverb
       gap:    ms — a repeat inside this window is dropped
       voices: per-sound polyphony; the oldest is faded out to make room
       render: seconds for the offline level check
       fn:     (ctx, G, out, t, opts) => end time */
    const SOUNDS = {
        click: {
            bus: 'ui', wet: 0.04, gap: 25, render: 0.25,
            desc: 'Beveled-button tick: a relay contact closing.',
            fn(ctx, G, out, t) {
                const e = tick(ctx, G, out, t, { freq: 2400, Q: 1.4, peak: 0.34, dur: 0.012 });
                beep(ctx, out, t, 1600, 0.006, { peak: 0.025, lp: 3000 });
                return e;
            },
        },
        windowOpen: {
            bus: 'ui', wet: 0.25, gap: 60, render: 1.0,
            desc: 'PC-speaker chirp upward, a small bell answers.',
            fn(ctx, G, out, t) {
                beep(ctx, out, t, 587, 0.055, { peak: 0.05, to: 880, lp: 1800 });
                return bell(ctx, out, t + 0.05, degree(10), { peak: 0.08, decay: 0.55, bright: 0.5 });
            },
        },
        windowClose: {
            bus: 'ui', wet: 0.18, gap: 60, render: 0.6,
            desc: 'The same chirp falling, then a contact click.',
            fn(ctx, G, out, t) {
                beep(ctx, out, t, 880, 0.06, { peak: 0.05, to: 523, lp: 1600 });
                return tick(ctx, G, out, t + 0.065, { freq: 1900, peak: 0.2, dur: 0.012 });
            },
        },
        windowMode: {
            bus: 'ui', wet: 0.12, gap: 80, render: 0.4,
            desc: 'Maximise / restore / snap: a short air swish.',
            fn(ctx, G, out, t, o = {}) {
                const up = o.mode !== 'normal';
                whoosh(ctx, G, out, t, { from: up ? 450 : 2200, to: up ? 2200 : 450, dur: 0.13, peak: 0.16 });
                return tick(ctx, G, out, t + 0.12, { freq: 2200, peak: 0.14, dur: 0.01 });
            },
        },
        startMenu: {
            bus: 'ui', wet: 0.22, gap: 80, render: 0.9,
            desc: 'Contact click and an open fifth, rolled.',
            fn(ctx, G, out, t) {
                tick(ctx, G, out, t, { freq: 2100, peak: 0.2, dur: 0.01 });
                return arpeggio(ctx, out, t + 0.01, [5, 8], { step: 0.035, peak: 0.07, decay: 0.6, bright: 0.6 });
            },
        },
        miracle: {
            bus: 'sfx', wet: 0.3, gap: 40, voices: 4, render: 1.4,
            desc: 'A bell climbing the pentatonic with the Miracle streak.',
            fn(ctx, G, out, t, o = {}) {
                const density = Number.isFinite(o.density) ? o.density : 1;
                if (o.void) {
                    // The Void has no streak; it walks a minor pentatonic down low.
                    const f = degree(o.step || 0, ROOT - 12, PENTA_MINOR);
                    tick(ctx, G, out, t, { freq: 1400, peak: 0.06 * density, dur: 0.008 });
                    return bell(ctx, out, t, f, { peak: 0.24 * density, decay: 1.6, bright: 0.7, partials: BELL_DARK });
                }
                const s = Math.max(1, Math.floor(o.streak || 1));
                // Climb two and a half octaves, then ring around the top one
                // rather than flattening into a single repeated note.
                const d = s <= 12 ? s - 1 : 7 + ((s - 13) % 5);
                tick(ctx, G, out, t, { freq: 3200, peak: 0.07 * density, dur: 0.006 });
                return bell(ctx, out, t, degree(d), {
                    peak: 0.2 * density,
                    decay: 1.1,
                    bright: o.overclock ? 1.15 : 0.8,
                });
            },
        },
        purchase: {
            bus: 'sfx', wet: 0.22, gap: 60, render: 1.0,
            desc: 'Contact click and a rising fifth.',
            fn(ctx, G, out, t) {
                tick(ctx, G, out, t, { freq: 2000, peak: 0.22, dur: 0.012 });
                return arpeggio(ctx, out, t + 0.012, [8, 10], { step: 0.06, peak: 0.12, decay: 0.75, bright: 0.75 });
            },
        },
        error: {
            bus: 'sfx', wet: 0.2, gap: 140, render: 0.9,
            desc: 'The "ding", reimagined: a dull bell over a low PC-speaker thud.',
            fn(ctx, G, out, t) {
                beep(ctx, out, t, 110, 0.12, { peak: 0.09, lp: 650 });
                return bell(ctx, out, t, midi(69), { peak: 0.15, decay: 0.55, bright: 0.6, partials: BELL_DULL });
            },
        },
        directive: {
            bus: 'sfx', wet: 0.35, gap: 300, render: 2.6,
            desc: 'Four-bell arpeggio over a short choir breath.',
            fn(ctx, G, out, t) {
                const e1 = arpeggio(ctx, out, t, [5, 7, 8, 10], { step: 0.07, peak: 0.12, decay: 1.0 });
                const e2 = choir(ctx, out, t + 0.05, [midi(62), midi(66), midi(69)], { a: 0.35, hold: 0.25, r: 1.2, peak: 0.07 });
                return Math.max(e1, e2);
            },
        },
        achievement: {
            bus: 'sfx', wet: 0.4, gap: 250, render: 3.2,
            desc: 'Tiered stinger: Bronze, Silver, Gold, Platinum, Secret.',
            fn(ctx, G, out, t, o = {}) {
                const tier = String(o.tier || 'Bronze');
                if (tier === 'Secret') {
                    const e1 = arpeggio(ctx, out, t, [0, 1, 2], { step: 0.11, peak: 0.1, decay: 1.6, root: 63, partials: BELL_DARK });
                    const e2 = choir(ctx, out, t + 0.1, [midi(51), midi(54), midi(58)], { a: 0.6, hold: 0.3, r: 1.6, peak: 0.06, vowel: VOWEL_OO });
                    return Math.max(e1, e2);
                }
                const runs = {
                    Bronze: [5, 8],
                    Silver: [5, 7, 8],
                    Gold: [5, 7, 8, 10],
                    Platinum: [5, 7, 8, 10, 12],
                };
                const notes = runs[tier] || runs.Bronze;
                let end = arpeggio(ctx, out, t, notes, { step: 0.085, peak: 0.13, decay: 1.2 });
                if (tier === 'Gold' || tier === 'Platinum') {
                    end = Math.max(end, choir(ctx, out, t + 0.1, [midi(62), midi(66), midi(69), midi(74)], { a: 0.4, hold: 0.4, r: 1.4, peak: 0.075 }));
                }
                if (tier === 'Platinum') {
                    end = Math.max(end, arpeggio(ctx, out, t + 0.5, [15, 17, 18], { step: 0.05, peak: 0.035, decay: 0.9, bright: 0.4 }));
                }
                return end;
            },
        },
        overclock: {
            bus: 'sfx', wet: 0.3, gap: 500, render: 2.8,
            desc: 'Drive spin-up into a rising choir and a bell.',
            fn(ctx, G, out, t) {
                const lpf = filt(ctx, out, 'lowpass', 300, 1.2);
                lpf.frequency.setValueAtTime(300, t);
                lpf.frequency.exponentialRampToValueAtTime(1600, t + 0.85);
                const g = amp(ctx, lpf, 0);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.07, t + 0.6);
                g.gain.linearRampToValueAtTime(0.0001, t + 1.0);
                const o = osc(ctx, 'sawtooth', 32, t, t + 1.0, g);
                o.frequency.exponentialRampToValueAtTime(165, t + 0.9);
                const e1 = choir(ctx, out, t + 0.45, [midi(50), midi(57), midi(62), midi(66)], { a: 0.35, hold: 0.3, r: 1.3, peak: 0.08 });
                const e2 = bell(ctx, out, t + 0.8, degree(10), { peak: 0.11, decay: 1.2 });
                return Math.max(e1, e2);
            },
        },
        eventAppear: {
            bus: 'sfx', wet: 0.55, gap: 1500, render: 1.6,
            desc: 'A faint three-bell sparkle somewhere overhead.',
            fn(ctx, G, out, t) {
                return arpeggio(ctx, out, t, [12, 10, 14], { step: 0.075, peak: 0.05, decay: 0.9, bright: 0.5 });
            },
        },
        eventClaim: {
            bus: 'sfx', wet: 0.35, gap: 150, render: 1.6,
            desc: 'A rolled bell chord; climbs with the chain.',
            fn(ctx, G, out, t, o = {}) {
                const base = 7 + Math.min(5, Math.max(0, Math.floor(o.chain || 1) - 1));
                tick(ctx, G, out, t, { freq: 3400, peak: 0.1, dur: 0.008 });
                return arpeggio(ctx, out, t, [base, base + 2, base + 4], { step: 0.035, peak: 0.12, decay: 1.1 });
            },
        },
        document: {
            bus: 'sfx', wet: 0.3, gap: 400, render: 1.8,
            desc: 'Seek chatter while the record is read, then a bell.',
            fn(ctx, G, out, t) {
                seek(ctx, G, out, t, { count: 7, span: 0.32, peak: 0.13 });
                whoosh(ctx, G, out, t + 0.3, { from: 3000, to: 1200, dur: 0.12, peak: 0.04 });
                return bell(ctx, out, t + 0.38, degree(7), { peak: 0.11, decay: 1.2, bright: 0.7 });
            },
        },
        cascade: {
            bus: 'sfx', wet: 0.3, gap: 1000, priority: true, render: 3.6,
            desc: 'Instability alarm, escalating per cascade tier.',
            fn(ctx, G, out, t, o = {}) {
                const tier = Math.max(1, Math.min(4, Math.floor(o.tier || 1)));
                // Each tier drops lower and narrows the interval toward a
                // semitone: consonant concern at SEV-3, grinding at CASCADE.
                const pairs = [[81, 78], [79, 74], [77, 71], [76, 77]][tier - 1];
                const reps = 1 + tier;
                const step = 0.2 - tier * 0.015;
                let tt = t;
                for (let i = 0; i < reps; i += 1) {
                    beep(ctx, out, tt, midi(pairs[0]), step * 0.8, { peak: 0.045, lp: 1500 });
                    beep(ctx, out, tt + step, midi(pairs[1]), step * 0.8, { peak: 0.045, lp: 1500 });
                    tt += step * 2;
                }
                const chord = tier >= 3 ? [midi(50), midi(53), midi(56)] : [midi(50), midi(53), midi(57)];
                let end = choir(ctx, out, t, chord, { a: 0.5, hold: tt - t, r: 1.4, peak: 0.035 + tier * 0.008, vowel: VOWEL_OO, spread: 9 + tier * 4 });
                if (tier >= 4) end = Math.max(end, sub(ctx, out, t, midi(38), { a: 0.3, hold: tt - t, r: 1.2, peak: 0.07 }));
                return Math.max(end, tt);
            },
        },
        adversary: {
            bus: 'sfx', wet: 0.25, gap: 2000, priority: true, render: 2.4,
            desc: 'Intrusion glitch: sample-and-hold square, noise, a beating sub-pad.',
            fn(ctx, G, out, t) {
                glitch(ctx, G, out, t, 0.9, { peak: 0.045 });
                const lpf = filt(ctx, out, 'lowpass', 320, 0.8);
                const g = amp(ctx, lpf, 0);
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.06, t + 0.5);
                g.gain.setTargetAtTime(0.0001, t + 1.1, 0.2);
                const end = t + 2.0;
                [55, 58.3].forEach((f) => {
                    const o = osc(ctx, 'sawtooth', f, t, end, g);
                    o.frequency.exponentialRampToValueAtTime(f * 0.84, end);
                });
                return end;
            },
        },
        adversaryBark: {
            bus: 'sfx', wet: 0.15, gap: 1200, render: 0.5,
            desc: 'A 150 ms flicker of the intrusion glitch.',
            fn(ctx, G, out, t) {
                return glitch(ctx, G, out, t, 0.15, { peak: 0.028, lo: 300, hi: 1400 });
            },
        },
        ship: {
            bus: 'sfx', wet: 0.45, gap: 2000, priority: true, render: 5.5,
            desc: 'Release chord: the build writing to disk, then choir and bells.',
            fn(ctx, G, out, t) {
                seek(ctx, G, out, t, { count: 6, span: 0.45, peak: 0.12 });
                const c = t + 0.45;
                const e1 = choir(ctx, out, c, [midi(50), midi(57), midi(62), midi(66), midi(69), midi(76)], { a: 0.8, hold: 1.2, r: 2.2, peak: 0.12 });
                const e2 = sub(ctx, out, c, midi(38), { a: 0.8, hold: 1.0, r: 2.0, peak: 0.07 });
                const e3 = arpeggio(ctx, out, c + 0.55, [5, 8, 10], { step: 0.12, peak: 0.1, decay: 1.8 });
                return Math.max(e1, e2, e3);
            },
        },
        boot: {
            bus: 'sfx', wet: 0.12, gap: 5000, priority: true, render: 3.0,
            desc: 'BIOS POST beep, a faint CRT whine, drive spin-up and seek chatter.',
            fn(ctx, G, out, t) {
                beep(ctx, out, t, 990, 0.16, { peak: 0.06, lp: 2600 });
                // NTSC flyback: barely there, and gone within three seconds.
                const w = amp(ctx, out, 0);
                envelope(w.gain, t, { a: 0.05, peak: 0.003, d: 2.6 });
                osc(ctx, 'sine', 15734, t, t + 2.7, w);
                const sp = amp(ctx, out, 0);
                sp.gain.setValueAtTime(0.0001, t + 0.2);
                sp.gain.linearRampToValueAtTime(0.05, t + 0.9);
                sp.gain.linearRampToValueAtTime(0.0001, t + 2.4);
                const motor = osc(ctx, 'triangle', 50, t + 0.2, t + 2.4, filt(ctx, sp, 'lowpass', 400, 0.7));
                motor.frequency.exponentialRampToValueAtTime(120, t + 1.4);
                return Math.max(t + 2.7, seek(ctx, G, out, t + 0.6, { count: 11, span: 1.3, peak: 0.12 }));
            },
        },
        desktop: {
            bus: 'sfx', wet: 0.4, gap: 5000, priority: true, render: 4.6,
            desc: 'Choir swell as the desktop resolves.',
            fn(ctx, G, out, t) {
                const e1 = choir(ctx, out, t, [midi(62), midi(66), midi(69), midi(74)], { a: 1.2, hold: 0.4, r: 2.2, peak: 0.1 });
                const e2 = sub(ctx, out, t, midi(38), { a: 1.0, hold: 0.4, r: 1.8, peak: 0.05 });
                const e3 = bell(ctx, out, t + 1.0, degree(10), { peak: 0.07, decay: 1.8, bright: 0.6 });
                return Math.max(e1, e2, e3);
            },
        },
    };

    /* ── Graph ──────────────────────────────────────────────────────────── */

    function makeNoise(ctx, seconds = 2) {
        const len = Math.floor(ctx.sampleRate * seconds);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    /* A small hall, generated: stereo noise under an exponential decay, run
       through a one-pole low-pass that closes as the tail ages, so the
       reverb darkens the way a stone room does instead of hissing. */
    function makeImpulse(ctx, seconds = 2.6) {
        const rate = ctx.sampleRate;
        const len = Math.floor(rate * seconds);
        const buf = ctx.createBuffer(2, len, rate);
        const pre = Math.floor(rate * 0.012);
        for (let ch = 0; ch < 2; ch += 1) {
            const data = buf.getChannelData(ch);
            let lp = 0;
            for (let i = 0; i < len; i += 1) {
                if (i < pre) { data[i] = 0; continue; }
                const x = (i - pre) / (len - pre);
                const coef = 0.55 + 0.4 * x;          // closes toward the tail
                lp = lp * coef + (Math.random() * 2 - 1) * (1 - coef);
                data[i] = lp * Math.pow(1 - x, 2.4) * 2.2;
            }
        }
        return buf;
    }

    function buildGraph(ctx) {
        const G = { ctx };
        G.limiter = ctx.createDynamicsCompressor();
        G.limiter.threshold.value = -10;
        G.limiter.knee.value = 6;
        G.limiter.ratio.value = 12;
        G.limiter.attack.value = 0.003;
        G.limiter.release.value = 0.25;
        G.limiter.connect(ctx.destination);

        G.master = amp(ctx, G.limiter, 0);
        G.ui = amp(ctx, G.master, 0);
        G.sfx = amp(ctx, G.master, 0);
        G.fx = amp(ctx, G.master, 0);
        G.ambient = amp(ctx, G.master, 0);

        G.reverb = ctx.createConvolver();
        G.reverb.buffer = makeImpulse(ctx);
        G.reverbIn = amp(ctx, G.reverb, 1);
        G.reverb.connect(amp(ctx, G.fx, 0.55));

        G.noise = makeNoise(ctx);
        return G;
    }

    function makeVoice(ctx, G, def) {
        const vg = amp(ctx, G[def.bus] || G.sfx, 1);
        if (def.wet) vg.connect(amp(ctx, G.reverbIn, def.wet));
        return vg;
    }

    /* Bus targets for a settings object. One function, so the live graph and
       the offline level check can never disagree about what "default" means. */
    function busLevels(s) {
        const sfx = s.sfxEnabled ? s.sfx : 0;
        return {
            master: s.muted ? 0 : s.master,
            ui: sfx * UI_TRIM,
            sfx,
            fx: sfx,
            ambient: s.ambientEnabled ? s.ambient : 0,
        };
    }

    /* ── Ambient bed ────────────────────────────────────────────────────── */

    function buildAmbient(ctx, G, dest) {
        const A = { ctx, nodes: [] };
        const start = ctx.currentTime;
        const keep = (o) => { A.nodes.push(o); return o; };
        const run = (type, freq, to, detune = 0) => {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = freq;
            o.detune.value = detune;
            o.connect(to);
            o.start(start);
            return keep(o);
        };

        A.out = amp(ctx, dest, 0);

        // Drone: D2 hum, A2 fifth, a thin D3 saw for grain.
        A.lp = filt(ctx, A.out, 'lowpass', 320, 0.9);
        A.o1 = run('sine', midi(38), amp(ctx, A.lp, 0.5));
        A.o2 = run('triangle', midi(45), amp(ctx, A.lp, 0.2));
        A.o3 = run('sawtooth', midi(50), amp(ctx, A.lp, 0.045));
        // Slow drift on the filter, so the hum breathes over minutes.
        A.drift = amp(ctx, A.lp.frequency, 50);
        run('sine', 0.045, A.drift);

        // Shimmer: two high partials under slow, unrelated tremolos.
        A.shimmer = amp(ctx, A.out, 0);
        const partial = (freq, rate) => {
            const g = amp(ctx, A.shimmer, 0.5);
            run('sine', freq, g);
            run('sine', rate, amp(ctx, g.gain, 0.5));
        };
        partial(midi(81), 0.13);
        partial(midi(86), 0.21);
        // The rot: a minor second against the shimmer that fades in with the
        // cascade tier.
        A.rot = amp(ctx, A.out, 0);
        run('sine', midi(87), A.rot);

        // Breath: band-passed noise, a choir exhaling somewhere far off.
        A.breath = amp(ctx, A.out, 0);
        const src = ctx.createBufferSource();
        src.buffer = G.noise;
        src.loop = true;
        src.connect(filt(ctx, A.breath, 'bandpass', 650, 3));
        src.start(start);
        keep(src);

        A.set = (p, tau = 1.2) => {
            const now = ctx.currentTime;
            const level = Math.max(0, Math.min(1, p.level || 0));
            const tier = Math.max(0, Math.min(4, Math.floor(p.tier || 0)));
            const rot = 1 - tier * 0.17;
            const lift = p.overclock ? 1.35 : 1;
            const at = (param, v) => (tau > 0 ? param.setTargetAtTime(v, now, tau) : param.setValueAtTime(v, now));
            at(A.lp.frequency, (200 + 560 * level * lift) * rot);
            at(A.drift.gain, 40 + tier * 30);
            at(A.o2.detune, tier * 9);
            at(A.o3.detune, -tier * 14);
            at(A.shimmer.gain, (0.01 + 0.05 * level) * lift * rot);
            at(A.rot.gain, tier * 0.006);
            at(A.breath.gain, 0.012 + tier * 0.01);
        };
        A.fadeIn = (seconds = 4) => {
            const now = ctx.currentTime;
            A.out.gain.setValueAtTime(0.0001, now);
            A.out.gain.linearRampToValueAtTime(AMBIENT_BED, now + seconds);
        };
        A.stop = () => {
            const now = ctx.currentTime;
            A.out.gain.cancelScheduledValues(now);
            A.out.gain.setTargetAtTime(0, now, 0.15);
            A.nodes.forEach((n) => { try { n.stop(now + 0.8); } catch (_) { /* already stopped */ } });
            setTimeout(() => { try { A.out.disconnect(); } catch (_) { /* gone */ } }, 1000);
        };
        return A;
    }

    /* What the bed responds to, read from the game. Production is mapped on
       a log scale — rates span eighteen orders of magnitude in a session. */
    function ambientParams() {
        const p = { level: 0, tier: 0, overclock: false };
        try {
            if (typeof game === 'undefined') return p;
            const rates = game.getProductionRates();
            const r = Math.max(0, rates.praiseGross || rates.praise || 0);
            p.level = Math.min(1, Math.log10(1 + r) / 12);
            p.tier = (State.reality && State.reality.cascadeTier) || 0;
            const oc = State.loopSystems && State.loopSystems.overclock;
            p.overclock = !!(oc && oc.active && Date.now() < oc.endsAt);
        } catch (_) { /* the bed is decoration; never let it throw */ }
        return p;
    }

    /* ── Live state ─────────────────────────────────────────────────────── */
    let ctx = null;
    let G = null;
    let bed = null;
    let unlocked = false;
    let graceUntil = 0;
    let bootPlayed = false;
    let saveTimer = null;
    let fallbackSettings = null;
    let voidStep = 0;
    const lastAt = Object.create(null);
    const voices = [];
    const miracleTimes = [];

    function settings() {
        let root;
        if (typeof State !== 'undefined' && State && State.settings) {
            root = State.settings;
        } else {
            fallbackSettings = fallbackSettings || {};
            root = fallbackSettings;
        }
        if (!root.audio || typeof root.audio !== 'object' || Array.isArray(root.audio)) {
            root.audio = { ...DEFAULTS };
        }
        // A save is pasted text decoded straight into State: normalise rather
        // than trust, so a hostile or hand-edited save cannot blow out a bus.
        const s = root.audio;
        for (const key of Object.keys(DEFAULTS)) {
            const def = DEFAULTS[key];
            if (typeof def === 'boolean') {
                if (typeof s[key] !== 'boolean') s[key] = def;
            } else {
                const n = Number(s[key]);
                s[key] = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : def;
            }
        }
        return s;
    }

    function applyLevels(fade = 0.06) {
        if (!ctx || !G) return;
        const now = ctx.currentTime;
        const lv = busLevels(settings());
        for (const bus of ['master', 'ui', 'sfx', 'fx', 'ambient']) {
            const p = G[bus].gain;
            p.cancelScheduledValues(now);
            p.setValueAtTime(p.value, now);
            // Linear, so mute lands on exactly zero rather than approaching it.
            p.linearRampToValueAtTime(lv[bus], now + Math.max(0.005, fade));
        }
        syncAmbient();
    }

    function syncAmbient() {
        if (!ctx || !G) return;
        const s = settings();
        const want = s.ambientEnabled && !s.muted;
        if (want && !bed) {
            bed = buildAmbient(ctx, G, G.ambient);
            bed.set(ambientParams(), 0);
            bed.fadeIn(4);
        } else if (!want && bed) {
            bed.stop();
            bed = null;
        }
    }

    function updateAmbient() {
        if (!bed || !ctx || ctx.state !== 'running') return;
        bed.set(ambientParams());
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            try { if (typeof State !== 'undefined' && State.save) State.save(); } catch (_) { /* nothing to do */ }
        }, 300);
    }

    function create() {
        if (ctx || !AC) return ctx;
        try {
            ctx = new AC({ latencyHint: 'interactive' });
            G = buildGraph(ctx);
            ctx.onstatechange = syncSettingsUI;
            applyLevels(0);
            setInterval(updateAmbient, AMBIENT_UPDATE_MS);
        } catch (err) {
            ctx = null;
            G = null;
        }
        return ctx;
    }

    function bootOverlayVisible() {
        const el = document.getElementById('boot-overlay');
        return !!(el && el.style.opacity !== '0');
    }

    /* Create or resume on a user gesture. Idempotent and cheap: it runs on
       every pointerdown/keydown, because Safari can drop a running context
       back to "interrupted" and only a gesture brings it back. */
    function unlock() {
        if (!AC || document.hidden) return;
        const first = !ctx;
        if (!create()) return;
        unlocked = true;
        if (settings().muted) {
            // A context born inside a gesture starts running; a muted one
            // has no business holding the audio thread.
            if (ctx.state === 'running') ctx.suspend().catch(() => {});
            return;
        }
        if (ctx.state !== 'running') {
            graceUntil = performance.now() + 400;
            ctx.resume().catch(() => {});
        }
        if (first) {
            graceUntil = performance.now() + 400;
            syncAmbient();
            // A gesture during the BIOS screen still gets the BIOS screen.
            if (!bootPlayed && bootOverlayVisible()) {
                bootPlayed = true;
                play('boot');
            }
        }
    }

    function pruneVoices() {
        if (!ctx) return;
        const now = ctx.currentTime;
        for (let i = voices.length - 1; i >= 0; i -= 1) {
            if (voices[i].end + 0.3 < now) voices.splice(i, 1);
        }
    }

    function steal(v) {
        const now = ctx.currentTime;
        const p = v.gain.gain;
        p.cancelScheduledValues(now);
        p.setValueAtTime(p.value, now);
        p.linearRampToValueAtTime(0, now + 0.03);
        v.end = Math.min(v.end, now + 0.03);
        const i = voices.indexOf(v);
        if (i >= 0) voices.splice(i, 1);
    }

    /* Miracle density: the more clicks in the last second, the quieter each
       one, so a burst sums to roughly the loudness of a single strike. */
    function miracleDensity(nowMs) {
        while (miracleTimes.length && nowMs - miracleTimes[0] > 1000) miracleTimes.shift();
        miracleTimes.push(nowMs);
        return 1 / Math.sqrt(Math.max(1, miracleTimes.length / 4));
    }

    function play(name, opts = {}) {
        try {
            const def = SOUNDS[name];
            if (!def || !ctx || !G) return false;
            const nowMs = performance.now();
            if (ctx.state !== 'running' && nowMs > graceUntil) return false;
            const s = settings();
            if (s.muted || !s.sfxEnabled || s.master <= 0) return false;

            if (def.gap && nowMs - (lastAt[name] || -1e9) < def.gap) return false;
            lastAt[name] = nowMs;

            pruneVoices();
            if (voices.length >= MAX_VOICES && !def.priority) return false;
            if (def.voices) {
                const mine = voices.filter((v) => v.name === name);
                while (mine.length >= def.voices) steal(mine.shift());
            }

            let o = opts || {};
            if (name === 'miracle') {
                o = { ...o, density: miracleDensity(nowMs) };
                if (o.void) o.step = voidStep++ % 7;
            }

            const t = ctx.currentTime + 0.005;
            const vg = makeVoice(ctx, G, def);
            const end = def.fn(ctx, G, vg, t, o);
            const voice = { name, gain: vg, end };
            voices.push(voice);
            setTimeout(() => { try { vg.disconnect(); } catch (_) { /* gone */ } },
                Math.max(0, (end - ctx.currentTime) * 1000 + 3000));
            return true;
        } catch (err) {
            // Sound is presentation. Nothing here may break the game.
            return false;
        }
    }

    /* ── Settings surface ───────────────────────────────────────────────── */

    function setVolume(bus, value) {
        if (!(bus in DEFAULTS) || typeof DEFAULTS[bus] !== 'number') return;
        const s = settings();
        s[bus] = Math.max(0, Math.min(1, Number(value) || 0));
        applyLevels();
        syncSettingsUI();
        scheduleSave();
    }

    function setEnabled(bus, on) {
        const key = `${bus}Enabled`;
        if (!(key in DEFAULTS)) return;
        settings()[key] = !!on;
        applyLevels();
        syncSettingsUI();
        scheduleSave();
    }

    function setMuted(on) {
        const s = settings();
        s.muted = !!on;
        applyLevels();
        if (ctx) {
            if (s.muted) {
                // Let the ramp land, then stop the clock: hours of muted idle
                // play should cost no audio thread at all.
                setTimeout(() => { if (settings().muted && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 150);
            } else if (!document.hidden) {
                graceUntil = performance.now() + 400;
                ctx.resume().catch(() => {});
            }
        }
        syncSettingsUI();
        scheduleSave();
    }

    function toggleMute() {
        setMuted(!settings().muted);
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function syncSettingsUI() {
        if (!hasWindow) return;
        const s = settings();
        const pct = (v) => `${Math.round(v * 100)}%`;
        const set = (id, prop, value) => {
            const el = document.getElementById(id);
            if (el && el[prop] !== value) el[prop] = value;
        };
        set('audio-master', 'value', String(Math.round(s.master * 100)));
        set('audio-sfx', 'value', String(Math.round(s.sfx * 100)));
        set('audio-ambient', 'value', String(Math.round(s.ambient * 100)));
        set('audio-sfx-enabled', 'checked', s.sfxEnabled);
        set('audio-ambient-enabled', 'checked', s.ambientEnabled);
        set('audio-muted', 'checked', s.muted);
        set('audio-sfx', 'disabled', !s.sfxEnabled);
        set('audio-ambient', 'disabled', !s.ambientEnabled);
        setText('audio-master-value', pct(s.master));
        setText('audio-sfx-value', s.sfxEnabled ? pct(s.sfx) : 'OFF');
        setText('audio-ambient-value', s.ambientEnabled ? pct(s.ambient) : 'OFF');
        const status = document.getElementById('audio-status');
        if (status) {
            status.textContent = !AC ? 'No audio device. The choir is silent on this terminal.'
                : s.muted ? 'Muted. The machinery runs on in silence.'
                    : (ctx && ctx.state === 'running') ? 'Audio subsystem online.'
                        : 'Standing by for your first action.';
        }
        const tray = document.getElementById('tray-audio');
        if (tray) {
            tray.classList.toggle('is-muted', s.muted);
            tray.setAttribute('aria-pressed', s.muted ? 'true' : 'false');
            tray.title = s.muted ? 'Sound: muted' : 'Sound: on';
        }
    }

    /* ── Offline level check ────────────────────────────────────────────────
       Renders one cue (or `ambient`) through a copy of the real graph at
       DEFAULT settings, so the numbers describe what a new player hears.
       Peak is sample peak after the limiter; RMS is the loudest 300 ms
       window. Used by tests/audio.mjs; costs nothing unless called. */
    async function renderOffline(name, opts = {}, seconds = null) {
        if (!OAC) throw new Error('OfflineAudioContext unavailable');
        const def = SOUNDS[name];
        if (!def && name !== 'ambient') throw new Error(`Unknown sound: ${name}`);
        const rate = 44100;
        const dur = seconds || (def ? def.render : 6);
        const octx = new OAC(2, Math.ceil(rate * dur), rate);
        const g = buildGraph(octx);
        const lv = busLevels({ ...DEFAULTS });
        for (const bus of Object.keys(lv)) g[bus].gain.value = lv[bus];
        if (def) {
            def.fn(octx, g, makeVoice(octx, g, def), 0.01, { density: 1, ...opts });
        } else {
            const A = buildAmbient(octx, g, g.ambient);
            A.set(opts, 0);
            A.out.gain.value = AMBIENT_BED;
        }
        const buf = await octx.startRendering();
        let peak = 0;
        let maxRms = 0;
        const win = Math.floor(rate * 0.3);
        const chans = [buf.getChannelData(0), buf.getChannelData(1)];
        for (let start = 0; start < buf.length; start += Math.floor(win / 2)) {
            let sum = 0;
            let n = 0;
            for (const data of chans) {
                for (let i = start; i < Math.min(buf.length, start + win); i += 1) {
                    const x = data[i];
                    const ax = Math.abs(x);
                    if (ax > peak) peak = ax;
                    sum += x * x;
                    n += 1;
                }
            }
            if (n) maxRms = Math.max(maxRms, Math.sqrt(sum / n));
        }
        /* Brightness: RMS of the first difference over RMS of the signal —
           a cheap stand-in for spectral centroid, enough to show the bed
           opening with production and closing under a cascade. */
        let sumX = 0;
        let sumD = 0;
        const left = chans[0];
        for (let i = 1; i < left.length; i += 1) {
            sumX += left[i] * left[i];
            const dx = left[i] - left[i - 1];
            sumD += dx * dx;
        }
        const brightness = sumX > 0 ? Math.sqrt(sumD / sumX) : 0;
        const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
        return { name, peak, rms: maxRms, peakDb: db(peak), rmsDb: db(maxRms), brightness, seconds: dur };
    }

    /* ── Wiring ─────────────────────────────────────────────────────────── */

    // Anything that reads as a pressable control ticks. Controls that carry
    // their own cue (the Miracle and Void buttons, the core canvas) do not,
    // or every strike of the bell would arrive with a click glued to it.
    const TICK_SELECTOR = 'button, select, input[type="checkbox"], input[type="range"], .win-btn, .icon, .taskbar-app, .start-menu-action, [role="button"]';
    const TICK_EXCLUDE = '.divine-btn, .void-btn, canvas, .divine-event, [data-sfx="none"]';

    function onGesture(event) {
        unlock();
        if (event.type !== 'pointerdown') return;
        const target = event.target && event.target.closest ? event.target : null;
        if (!target) return;
        const control = target.closest(TICK_SELECTOR);
        if (!control || control.disabled || target.closest(TICK_EXCLUDE)) return;
        play('click');
    }

    if (hasWindow) {
        document.addEventListener('pointerdown', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
        document.addEventListener('touchstart', onGesture, { capture: true, passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!ctx) return;
            if (document.hidden) {
                ctx.suspend().catch(() => {});
            } else if (unlocked && !settings().muted) {
                ctx.resume().catch(() => {});
            }
        });
        const ready = () => {
            syncSettingsUI();
            /* Where the browser says audio may start unprompted (Firefox
               reports this; Chrome does not yet), start now and give the
               BIOS screen its beep. Otherwise wait for a gesture. */
            try {
                if (AC && navigator.getAutoplayPolicy && navigator.getAutoplayPolicy('audiocontext') === 'allowed') {
                    if (create() && !settings().muted) {
                        unlocked = true;
                        syncAmbient();
                        if (!bootPlayed && bootOverlayVisible()) {
                            bootPlayed = true;
                            play('boot');
                        }
                    }
                }
            } catch (_) { /* policy probe unsupported */ }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
        else ready();
    }

    return {
        SOUNDS: Object.freeze(Object.fromEntries(Object.entries(SOUNDS).map(([k, v]) => [k, { bus: v.bus, desc: v.desc }]))),
        DEFAULTS,
        supported: !!AC,
        play,
        unlock,
        setVolume,
        setEnabled,
        setMuted,
        toggleMute,
        syncSettingsUI,
        renderOffline,
        settings,
        state: () => (ctx ? ctx.state : 'none'),
        /* Live bus gains, for the browser check. */
        debug: () => (G ? {
            state: ctx.state,
            master: G.master.gain.value,
            ui: G.ui.gain.value,
            sfx: G.sfx.gain.value,
            ambient: G.ambient.gain.value,
            voices: voices.length,
            miracleVoices: voices.filter((v) => v.name === 'miracle').length,
            ambientBed: !!bed,
        } : { state: 'none' }),
    };
})();
