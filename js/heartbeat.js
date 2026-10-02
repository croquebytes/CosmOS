/* ════════════════════════════════════════════════════════════════════════
   Heartbeat — the desktop's one slow clock.

   Every app that watches the universe once a second (the tape shelf, the
   recovered footage, Choir, Mail, Etherscape, the taskbar clock, the
   Engine's affordability pass, Patience's table) used to keep its own
   setInterval: seven or eight wakeups a second, each its own task, all of
   them still running in a tab nobody could see. They share this one now.

   Hidden, it stops. Each watcher gets one beat at the moment the tab goes
   away, while document.hidden is already true, so the ones that care can
   note the absence (Mail marks itself away, so what came due is announced
   as a backlog on return), and one beat the moment it comes back, so a
   returning player is caught up at once rather than up to a second later.
   Nothing progresses in a background tab anyway — the game loop rides
   requestAnimationFrame, which the browser parks — so there is nothing for
   a hidden watcher to see.

   A watcher that throws is skipped for that beat, never unsubscribed: the
   watch never breaks the page, and one app never silences another.
   Loaded before every other script; the apps fall back to their own
   setInterval when it is absent (the vm suites load files one at a time).
   ════════════════════════════════════════════════════════════════════════ */
const Heartbeat = (() => {
    'use strict';

    const PERIOD_MS = 1000;
    const hasDOM = typeof document !== 'undefined' && typeof document.addEventListener === 'function';
    const subs = [];
    let timer = 0;
    let beats = 0;

    const hidden = () => hasDOM && document.hidden === true;

    function beat() {
        beats++;
        // A watcher may unsubscribe itself, or another, mid-beat.
        for (const sub of subs.slice()) {
            if (!subs.includes(sub)) continue;
            try { sub(); } catch (err) { /* the watch never breaks the page */ }
        }
    }

    function start() {
        if (timer || !subs.length || hidden() || typeof setInterval !== 'function') return;
        timer = setInterval(beat, PERIOD_MS);
    }

    function stop() {
        if (!timer) return;
        clearInterval(timer);
        timer = 0;
    }

    /* Subscribe. Returns the unsubscribe. */
    function every(fn) {
        if (typeof fn !== 'function') return () => {};
        subs.push(fn);
        start();
        return () => {
            const i = subs.indexOf(fn);
            if (i >= 0) subs.splice(i, 1);
            if (!subs.length) stop();
        };
    }

    if (hasDOM) {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stop();
                beat();
            } else {
                beat();
                start();
            }
        });
    }

    return {
        PERIOD_MS,
        every,
        running: () => !!timer,
        size: () => subs.length,
        beats: () => beats,
    };
})();
