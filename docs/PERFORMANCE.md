# Performance

CosmOS is an idle game. Players leave the tab open for hours, often with every
window shut or the tab in the background, so the cost that matters is what an
idle page spends, not what a busy one does.

## Idle cost (session 8)

### How it was measured

`tools/idle-profile.mjs` drives headless Chromium (Playwright) against the dev
server and samples four states for 60 s each with nobody at the keyboard:

1. **fresh desktop**: a new save, briefing dismissed, every window shut;
2. **mid-game, apps closed**: two real ships, every app unlocked, every window shut;
3. **mid-game, every app open**: the same save with all fifteen windows open;
4. **mid-game, hidden tab**: state 3 with the tab hidden.

It reads, per second:

- **busy**: main-thread task time, from CDP `Performance.getMetrics` (`TaskDuration`);
- **intervals, timeouts and rAF**: timer and animation-frame callbacks that fired,
  counted by `tests/idle-probe.mjs`, which wraps the timer APIs before any game
  script loads and records the `js/` file and line that scheduled each one;
- **layout and style**: CDP `LayoutCount` and `RecalcStyleCount`.

Headless Chromium never hides a tab: `bringToFront` on another page leaves this
one `visible` with rAF still running. The probe therefore stands in for the
background tab. It overrides `document.hidden`, fires `visibilitychange`, and
parks rAF callbacks the way a real background tab does. Timers keep firing (a
real background tab throttles them to about 1 Hz rather than stopping them), so
any app that still polls shows up.

```
COSMOS_TEST_URL=http://localhost:5173 node tools/idle-profile.mjs 60 out.json
```

The figures come from headless Chromium using SwiftShader on an Apple-silicon
laptop. Compare them with each other, not with a real GPU. In state 3 the frame
rate is limited by software raster, not by the main thread.

### Before and after

| state | busy ms/s | interval fires/s | rAF/s | timeouts/s | layouts/s | style recalcs/s |
|---|---|---|---|---|---|---|
| fresh desktop: before | 16.7 | 7.07 | 59.4 | 0.05 | 10.9 | 11.2 |
| fresh desktop: **after** | **8.0** | **1.07** | **9.7** | 9.68 | **1.3** | **4.1** |
| apps closed: before | 20.6 | 7.07 | 58.8 | 0.40 | 11.4 | 28.2 |
| apps closed: **after** | **7.5** | **1.07** | **9.7** | 10.1 | **1.8** | **1.9** |
| every app open: before | 21.7 | 8.30 | 15.1 (7.6 frames) | 0.17 | 15.1 | 15.2 |
| every app open: **after** | **18.3** | **1.07** | 27.6 (13.8 frames) | 0.08 | **7.4** | 13.9 |
| hidden tab: before | 4.6 | 8.30 | 0 | 0 | 2.0 | 2.0 |
| hidden tab: **after** | **0.7** | **0.07** | 0 | 0 | **0** | **0** |

Over the 60 s hidden sample, app intervals fired 498 times before and 0 times
after. The 0.07/s that remain are the autosave and the dev server's own client.

In the every-app-open row, rAF counts two loops: the game loop and the Divine
Globe's. The frame rate roughly doubled (7.6 to 13.8 frames/s) while
main-thread time fell, so each frame now costs about half as much.

In the closed rows, the new timeouts are the game loop's 100 ms wait between
frames, described below. Counting a timeout and its frame together as one
wakeup, an idle desktop wakes about 11 times a second instead of about 66.

### What changed

- **One shared 1 Hz clock** (`js/heartbeat.js`). The tape shelf (`media.js`),
  recovered footage (`footage.js`), Choir, Mail, Etherscape, the taskbar clock and
  the Engine's affordability pass each ran their own `setInterval`. That was
  seven wakeups a second as separate tasks. Patience's table refresh, Choir's
  30 s "minutes ago" refresh and Etherscape's 5 s status-page refresh ran on
  their own timers too. They all subscribe to one interval now, in their old
  load order. A watcher that throws is skipped for that beat and stays
  subscribed. When Heartbeat is absent (the vm suites load files one at a
  time), each app falls back to its own `setInterval`.
- **Paused while hidden.** The clock stops when the tab hides. Each watcher gets
  one beat as the tab goes away, while `document.hidden` is already true, and one
  beat the moment it returns:
  - Mail marks itself away on the way out. Mail that came due while the tab was
    hidden is still held, then lands at once as one "N messages arrived while
    you were away" backlog.
  - Patience's dealer keeps her clock without a gap.
  - A pinned Breakdown sheet stops its 4 Hz refresh too.

  Nothing advances in a background tab anyway, because the game loop runs on
  rAF, which the browser parks.
- **The loop runs at frame rate only when something animates.** `game.loop`
  still asks for each tick through `requestAnimationFrame`, so a hidden tab
  parks it and a long absence is still an unattended gap. The frame-rate
  consumers are the Engine's core well, the Void core and a stabilisation
  ritual's needle (`ui.needsFrames`). When none of them is on screen, the loop
  waits `PANEL_INTERVAL` (100 ms) between frames. The text panels already
  refreshed at that rate, and production is linear in the delta, so the economy
  does not change. `tests/idle-e2e.mjs` checks that production accrues at the
  full rate with every window shut.
- **Closed windows cost nothing.** The 10 Hz panel tick wrote the desktop's
  operator panel every tick, whether or not anything had changed. That panel is
  under every window and is an `aria-live` region. It was the only thing an
  all-closed desktop still laid out ten times a second, and each rewrite also
  re-announced it to screen readers. It now writes only on change. The Engine
  and Dimension readouts, the incident chrome and the Mail tray do the same
  (`ui.setText`, `setDisabled`, `setStyle`).
- **No layout thrash.** The incident clock, the pay button, the queue line and
  the ship dialog read `innerText` to compare before writing, which forced a
  layout every tick. Under `text-transform` the comparison also never matched,
  so they wrote every tick too. They now compare `textContent`.

### Guarded by

`tests/idle-e2e.mjs` (in `npm test`) checks the following:

- With every window shut, the only app interval is `heartbeat.js`, interval
  wakeups stay at or below 1.5/s, and frames stay at or below 15/s.
- Opening the Engine brings frame rate back.
- A hidden tab runs no app interval, and the clock rests and resumes.
- The operator panel is not rewritten while nothing changes.
- Production accrues at the full rate.
- Mail held in a hidden tab lands as a backlog on return.
- Tickets go on hold when nobody is there, with every window shut.
- With the audio context running (a click has started it), its own timer wakes
  about twice a second while the tab is visible, never while it is hidden, and
  again on return.

Five of these guards were mutation-checked: reverting the shared clock for
Mail, the rest while hidden, the hide-edge beat, the panel-interval wait, or
the change-only operator panel each fails the test.

### Sound adds two wakeups a second, and rests when hidden

Every figure above was measured before any gesture, so the `AudioContext` did not
exist. A click creates it, and `js/audio.js` then updates the ambient bed and the
music on its own 500 ms interval. Measured on a closed desktop (`tests/idle-probe.mjs`):

| | intervals/s | of which |
|---|---|---|
| before the first gesture | 1.0 | `heartbeat.js` |
| after a click, visible | 3.0 | `heartbeat.js` 1.0, `audio.js` 2.0 |
| after a click, tab hidden | about 0.2 | the autosave, and one timer the probe cannot attribute; `audio.js` none |

So an idle page with sound running legitimately shows about three interval wakeups a
second, not one. The audio timer starts and stops with `visibilitychange` (the context is
suspended in a hidden tab, so there is nothing to update), which an earlier version of
this note listed as unfinished. The one-shot timers that free a finished sound's voice
are not polling and are not counted. `tests/idle-e2e.mjs` step 6 guards all of it.
