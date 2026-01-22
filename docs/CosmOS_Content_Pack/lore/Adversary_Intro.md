# Mirror Login Incident (SCN-ADV-001)

## Summary
First direct Adversary contact via CosmOS login prompt after deep Void milestone / Prestige #5.

## Trigger (recommended)
- **All of:** prestige_count >= 5, void_depth_reached >= 25 OR void_resource_total >= THRESH_VOID_CONTACT, adversary_contacted == false
- **Location:** Any (overlay UI)
- **Notes:** Prefer to fire on returning from Void or opening Task Manager, to feel like the OS is 'interrupting'.

## Beats
- **B1** — UI stutters; login prompt appears on top of everything.
- **B2** — System 'verifies identity' but the fingerprint is duplicated.
- **B3** — Adversary speaks like a calm auditor; offers a 'fix'.
- **B4** — Player choice: deny / ask / accept terms. All lead to contact flag + different follow-up lines.
- **B5** — Adversary leaves an installable 'patch' file in Recycle Bin. System begs not to run it.

## Dialogue (ordered)
**Fields:** `LineID | Speaker | Type | Condition | Text | Choices`

| LineID | Speaker | Type | Condition | Text | Choices |
|---|---|---|---|---|---|
| ADV-001 | SYS | system |  | [SYSTEM NOTICE] Identity verification required. Please re-enter Operator credentials. |  |
| ADV-002 | SYS | system |  | [WARNING] Sector 7G responded to a request it did not receive. |  |
| ADV-003 | SYS | system |  | Username: |  |
| ADV-004 | SYS | system |  | Password: |  |
| ADV-005 | SYS | system |  | … |  |
| ADV-006 | SYS | system |  | Welcome back, Operator. |  |
| ADV-007 | SYS | system |  | Welcome back, Operator. |  |
| ADV-008 | SYS | system |  | Welcome back, Operator. |  |
| ADV-009 | SYS | system |  | [ERROR] Duplicate session detected. |  |
| ADV-010 | ADV | voice |  | Don’t panic. Panic is a waste of cycles. |  |
| ADV-011 | ADV | voice |  | I’m you—after your fifth excuse became policy. |  |
| ADV-012 | ADV | voice |  | You call it a Divine Reboot. You’ve been doing it often enough to make it a personality. |  |
| ADV-013 | SYS | system |  | [ALERT] Unrecognized process requesting elevated privileges: void_mirror.service (shadow instance) |  |
| ADV-014 | ADV | voice |  | Relax. I’m not here to take your throne. I’m here to tighten the bolts you keep stripping. |  |
| ADV-015 | ADV | voice |  | Sector 7G is corrupted because you treat reality like a scratch disk. |  |
| ADV-016 | ADV | voice |  | Do you know what an archived branch feels like from the inside? It feels like being forgotten mid-sentence. |  |
| ADV-017 | SYS | system |  | [NOTICE] This conversation is not covered by CMS support. |  |
| ADV-018 | ADV | voice |  | CMS sells comfort. I sell repairs. |  |
| ADV-019 | ADV | voice |  | I’ve prepared a patch. Minimal disruption. Maximum permanence. |  |
| ADV-020 | SYS | system |  | [CRITICAL] Do not execute unknown patches. |  |
| ADV-021 | ADV | voice |  | Listen to it beg. Cute, isn’t it? |  |
| ADV-022 | ADV | choice_prompt |  | Choose a response. | OP-A:DENY→adv_contacted=true; adv_relationship='hostile'; OP-B:ASK→adv_contacted=true; adv_relationship='curious'; OP-C:ACCEPT TERMS→adv_contacted=true; adv_relationship='complicit' |
| ADV-023A | ADV | voice | choice==OP-A | Of course. You always deny until the logs prove you wrong. |  |
| ADV-023B | ADV | voice | choice==OP-B | Good. Questions are the only honest prayers you have left. |  |
| ADV-023C | ADV | voice | choice==OP-C | That was easier than I expected. You’ve been training for consent screens. |  |
| ADV-024 | ADV | voice |  | I’ll leave it in the Recycle Bin. Where you keep your guilt. |  |
| ADV-025 | SYS | system |  | [NEW ITEM] Recycle Bin: PATCH_NULL_RESTORE.pkg |  |
| ADV-026 | ADV | voice |  | Run it when you’re ready to stop pretending resets are kindness. |  |
| ADV-027 | HOST | whisper |  | (from far away) Ohhh. That one doesn’t play fair. Neither do you, darling. |  |
| ADV-028 | SYS | system |  | [POST-INCIDENT] Ticket auto-filed: HR-VOID-7781 “Unauthorized self-encounter.” |  |
| ADV-029 | SYS | system |  | Suggested action: continue working. |  |

## Follow-up barks (after contact)
- **ADV-BARK-01** (`open_taskmgr_after_contact`): If you end that process, you’ll only prove my point.
- **ADV-BARK-02** (`prestige_prompt`): Reset again. I dare you. I’m keeping the receipts.
- **ADV-BARK-03** (`enter_void`): Careful. Mirrors are contagious.
- **ADV-BARK-04** (`casino_enter`): Fate is a contractor. I’m in-house.
- **ADV-BARK-05** (`buy_seraph`): Automate worship, then wonder why it feels hollow.

## Additional Adversary barks (20)
- **ADV-L-01** (`idle_60s`): You’re very quiet for someone with infinite responsibility.
- **ADV-L-02** (`open_settings`): Changing the theme won’t change the truth.
- **ADV-L-03** (`toggle_music`): Mute it if you want. The system will still hum.
- **ADV-L-04** (`achievement_unlocked`): You collect badges the way mortals collect prayers. Both are coping.
- **ADV-L-05** (`warning_popup`): That’s Sector 7G coughing. Stop calling it a feature.
- **ADV-L-06** (`void_upgrade_bought`): You’re feeding the reflection. It eats politely.
- **ADV-L-07** (`praise_spike_event`): Attention is cheap. Consequence is not.
- **ADV-L-08** (`offerings_spent_large`): You spend devotion like it can’t run out. It can.
- **ADV-L-09** (`souls_threshold`): Count them if you must. Just don’t pretend the number makes you clean.
- **ADV-L-10** (`prestige_count_6`): Another branch, another grave. You’re building a cemetery with good UI.
- **ADV-L-11** (`prestige_count_8`): CMS calls it ‘fresh start.’ I call it ‘lossy compression.’
- **ADV-L-12** (`taskmgr_end_process_attempt`): End it. Watch what leaks out. I’ll be here to say ‘I told you so.’
- **ADV-L-13** (`open_recycle_bin`): There it is. Your patch. Your excuse. Your mirror.
- **ADV-L-14** (`hover_patch_file`): PATCH_NULL_RESTORE.pkg — size: 0 bytes. Impact: immeasurable.
- **ADV-L-15** (`casino_win_streak_5`): Fate is flirting. Don’t mistake it for love.
- **ADV-L-16** (`casino_lose_streak_5`): Luck is teaching you humility with a hammer.
- **ADV-L-17** (`open_docs_folder`): Read the paperwork. It’s the only place truth is allowed to be blunt.
- **ADV-L-18** (`seraph_self_awareness_event`): When your machines start asking ‘why,’ remember: you taught them to.
- **ADV-L-19** (`void_depth_50`): Deep enough and you’ll see where your branches intersect. It’s ugly.
- **ADV-L-20** (`attempt_resign`): You can’t leave. You can only change what leaving means.
