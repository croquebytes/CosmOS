---
project: cosmos
type: design-plan
created: 2026-10-05
status: proposal
related: progress.md (Stray prayers), docs/UI_GAMEPLAY_PLAN_2026-10-04.md
---

# The prayer collector — keeping late game quiet

## Problem

Stray prayers now last 20 seconds, which suits the early game: one seal at a time, roughly every 100 seconds, each one a small decision. Late game is different. Divine Favor and Controlled Chaos raise the spawn chance to its 35% cap, so a seal can arrive about every 15 seconds. Intercession already stops missed prayers from being lost, but the seals still appear on screen. The user wants late game to be **less cluttered**, not more.

The goal: past a certain point, prayers stop asking for attention. They go somewhere on their own, and the operator collects them when they choose.

## Direction: the Recycle Bin reclaims them

The desktop already has a Recycle Bin, framed as "restore or sacrifice data." That is the right home. A late-game upgrade, **Reclamation Protocol**, teaches the Bin to draw prayers in.

**How it behaves**
- A seal still arrives on open wallpaper, but it waits only **3 seconds**. An operator who is already looking can still answer it by hand, at full value and with the chain.
- After that, it is drawn into the Bin icon: one curved motion, about 600 ms, shrinking as it goes. The Bin icon gets a small count badge. No floating number and no particles. Reduced motion: the seal fades out and the badge ticks up.
- The Bin stores reclaimed prayers as a ledger: each entry records the seconds of production it was worth when it arrived. Capacity is **12**. When the Bin is full, further prayers fall back to Intercession (half value, paid at once).
- **Restore prayers**, from the Bin window or by double-clicking the icon, pays the whole ledger in one action. It uses the same rule as a hand-caught prayer: Praise if there is room, then Offerings, then Souls, then Overclock charge. One log line: "Restored 9 prayers: +4.2M Praise, +310K Offerings."
- Restoring never advances the chain. The chain stays a reward for attention.

This turns twelve interruptions into one deliberate visit, which is the clutter fix. It also gives the existing Bin a recurring use beyond the Sacrifice screen.

## Alternative skin: the interstitial frog

The same mechanic can wear a creature. A small frog-like familiar from between dimensions sits at the taskbar's left edge, beside the Start button. When a seal times out, its tongue snaps across the screen and takes it; the count shows on its throat sac. Restoring happens by clicking it ("it will not let go").

Recommendation: **build the Bin first and offer the frog as a familiar in the Adoration Shop.** The Bin needs almost no new art: an icon badge and one motion path. The frog needs a sprite, a tongue animation and idle frames, which is a paid-generation job under the cost-approval rules. Both share one implementation; the skin only changes the destination point and the animation. As a cosmetic, the frog is a good bounded Adoration sink, which the UI/gameplay plan already calls for.

## Unlock and value

| Item | Proposal | Why |
| --- | --- | --- |
| Unlock | After the first Divine Reboot, and only once Intercession is owned | Spawn rate rises after reboot (Mandates), which is when clutter starts |
| Cost | Divinity, not Praise, so it competes with Mandates | Makes it a choice, not an automatic purchase |
| Hand-catch window | 3 s, then reclaimed | Attentive play still pays; nothing lingers |
| Restore value | 100% of stored seconds, re-priced at restore time against current vaults | Batching should not feel like a penalty |
| Bin capacity | 12, overflow goes to Intercession at 50% | A visit every few minutes, not a hoard |
| Frog familiar | Adoration Shop cosmetic, same rules | Expression rather than power |

All values are proposals. They need a balance-sim run with a prayer-answering policy before they are tuned, because the current sim never answers a prayer.

## Implementation outline

1. `State.prayerBin = { entries: [], capacity: 12 }` with a save migration. Entries store `{seconds, at}`, not amounts, so restore prices them against the current production and vaults.
2. In `game.expireDivineEvent`: if Reclamation is owned and the Bin has room, push an entry and call `ui.reclaimDivineEvent(event)`. Otherwise keep the Intercession path.
3. With Reclamation owned, set the seal's lifetime to 3 s instead of `DIVINE_EVENT_LIFETIME`.
4. `game.restorePrayers()` sums the entries, pays through `divineEventPayout` / `applyDivineEventPayout`, logs once, and clears the ledger.
5. UI: a badge on `#icon-recyclebin`, a "Reclaimed prayers" row and **Restore** button in the Bin window, and the motion toward the icon's rect (or the frog's mouth).
6. Accessibility: one polite announcement per restore, none per reclaim; reduced motion as above; the badge carries an `aria-label`.

## Acceptance

- Late game (spawn chance at cap), no more than one seal is ever visible, and none for longer than 3 seconds unless the operator hovers it.
- A full Bin never discards a prayer; overflow pays at Intercession value.
- Restore pays exactly what the same prayers would pay by hand at that moment, without the chain.
- No reroll or duplicate payout across reload; the ledger survives a save.
- Golden economy horizons unchanged (the sim never owns Reclamation).

## Decisions for the user

1. Bin first with the frog as a cosmetic, or the frog as the main collector?
2. Restore at 100% (recommended) or a small tax (e.g. 80%) to keep hand-catching attractive?
3. Unlock cost in Divinity, or a late Praise/Souls upgrade?
