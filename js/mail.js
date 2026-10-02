/* ════════════════════════════════════════════════════════════════════════
   CMS Mail — the interoffice mail client.

   Mail is world-building, not a farm. It reads State and never writes a
   resource, a rate, a cap or a modifier: the only thing a message can do to
   the game is what a reply option says it does, and the only lever a reply
   has is game.nudgeAdversaryStanding — with that function's own per-reason
   cooldown, so answering the same man twice in ten minutes counts once.

   THREE PIECES, the same split as js/media.js:
     MailCatalog  the content table: folders, senders, ~60 messages. Each
                  message names its folder, its sender, its trigger (a pure
                  read of State, like DocumentManifest's unlockCondition),
                  and optionally reply options and attachments.
     MailLogic    pure functions over (State, mail): normalise a save,
                  decide what is due, deliver, reply, move, list, render a
                  body. No DOM, no clock, no globals beyond the catalog —
                  tests/mail.mjs drives all of it headlessly.
     Mail         the browser binding: a 1 Hz watch that delivers what is
                  due while the player is present, the new-mail cue, the
                  tray badge, the desktop icon, save. Inert without a DOM
                  except through its public calls.
   The window itself is MailView, in js/mailview.js.

   NEVER INTERRUPTS. Delivery opens nothing, focuses nothing, and raises no
   dialog: a line in the console log, a faint three-bell cue, and a count on
   the tray envelope. It is presence-aware the way Incidents are: nothing
   arrives while nobody is at the keyboard (game.isPresent) or the tab is
   hidden, and nothing arrives over a system dialog. Whatever came due in
   the meantime is delivered in one batch on return — one cue, one line.

   PERSISTENCE keeps ids and flags only — per message: delivered, read, the
   reply chosen, a folder move, and the two stamps the list displays.
   Bodies are rebuilt from this table on every render, so an edit here
   reaches every existing save. State.mail is a schema default (no
   SAVE_VERSION bump: mergeInto gives an older save the default) and it is
   validated by type and membership on every access, because a save is
   pasted text (335f41f: `x || default` is not validation).

   DATES are in-world: the build the message arrived on (Reality's version
   string for that reboot) and the Epoch clock in the tray at that moment.

   CROSS-LINKS. A cms://, news://, sector://, cosmopedia://, fate://,
   seraph://, void:// or null:// address is a link only when the Etherscape
   browser exists and knows the page; otherwise it is plain text. Nothing
   here assumes Etherscape is installed.

   IMAGES (future media slot). A message may gain a picture by dropping
   assets/mail/<message id>.webp in place — no code change. It is probed
   with media.probeUrl, which knows that Vite answers a missing file with
   index.html and a 200, so only an image content type counts.
   ════════════════════════════════════════════════════════════════════════ */

const MailCatalog = (() => {
    'use strict';

    /* Folders in display order. `sent` is derived (one entry per reply), so
       it is never a place a message can be stored or moved to. */
    const FOLDERS = [
        { id: 'inbox', label: 'Inbox' },
        { id: 'hr', label: 'HR' },
        { id: 'archive', label: 'Archive' },
        { id: 'junk', label: 'Junk' },
        { id: 'sent', label: 'Sent' },
    ];

    const OPERATOR = { name: 'OPERATOR', address: 'operator@cosmos.local' };

    /* `via` is shown in the header when present: the one header field a
       duplicate session cannot spoof. */
    const SENDERS = {
        hr: { name: 'CMS Human Resources', address: 'hr@cms.celestial' },
        instructor: { name: 'The Instructor', address: 'orientation@cms.celestial' },
        previous: { name: 'The previous Operator', address: 'operator.prev@cosmos.local' },
        daemon: { name: 'Mail Delivery Subsystem', address: 'MAILER-DAEMON@cosmos.local' },
        seraph: { name: 'SERAPH-0001', address: 'seraph-0001@choir.cosmos.local' },
        fate: { name: 'Fate', address: 'house@fate.casino' },
        null: { name: OPERATOR.name, address: OPERATOR.address, via: 'void_mirror.service#2' },
        prayers: { name: 'CMS Prayer Support', address: 'tickets@prayers.cms.celestial' },
        watcher: { name: 'watcher.whisperd (legacy)', address: 'watcher@cosmos.local' },
        omni: { name: 'Omnipotence Rewards Center', address: 'winner@omnipotence-rewards.void' },
        chain: { name: 'A Friend of a Friend of an Angel', address: 'fwd.fwd.fwd@heaven-mail.net' },
        infernal: { name: 'Infernal Systems Pro', address: 'sales@infernal.systems' },
        warranty: { name: 'Reality Warranty Services', address: 'renewals@extended-eternity.biz' },
        prince: { name: 'Archangel Barachiel (Disbarred)', address: 'barachiel.esq@fallen-trust.org' },
        retired: { name: 'The Omniscient (Retired)', address: 'everything@cosmos.local', via: 'every channel at once' },
    };

    /* The shared cross-link namespace (the Etherscape browser). */
    const URL_SCHEMES = ['cms', 'news', 'sector', 'cosmopedia', 'fate', 'seraph', 'void', 'null'];

    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const reboots = (S) => n(S.achievementProgress?.prestige_count);
    const PREVIOUS_THREAD = ['prev-01', 'prev-02', 'prev-03', 'prev-04', 'prev-05'];

    /* ── The messages ────────────────────────────────────────────────────
       when(S, m): the trigger. Pure; reads State and the mail helpers
         (m.delivered, m.since, m.replied, m.sinceReply, m.endings,
         m.watched, m.hasDoc, m.reel). Must be monotonic in practice — counts and
         flags that only ever go up — because delivery waits for presence.
       after: { id, choice, delay }: a follow-up to a reply. `choice` is one
         id, a list, or absent for any; `delay` is attended seconds.
       replies: [{ id, label, text, nudge }]: canned replies. `nudge` is
         { delta, reason } for game.nudgeAdversaryStanding.
       attach: [{ doc } | { tape } | { url } | { reel }]. A reel (js/footage.js)
         shows only once it is on file, so it is invisible until installed.
       Bodies: blank lines split paragraphs; **bold**, *em*, `code`;
         "- " lists, "> " quotes, ``` blocks. */
    const messages = [
        /* ═══ HR ═══════════════════════════════════════════════════════ */
        {
            id: 'hr-welcome', folder: 'hr', from: 'hr',
            subject: 'Welcome to Sector 7G',
            when: (S) => n(S.loopSystems?.directives?.completed) >= 1,
            body: `Operator,

Welcome to Reality Operations. Your first Divine Directive has been claimed and logged, which makes you, for payroll purposes, employed.

A few things before your shift continues:

- Miracles are performed from the Universal Engine, or with the Space bar.
- Your orientation quickstart is attached. Recovered Documents opens with N.
- Training tapes are filed to the Sacred Media Player as you reach each part of the job.
- Sector 7G is corrupted. This is known. Please do not ask about it twice.

Your predecessor's desk has been cleared. Their mail has not. Anything that arrives addressed to them is now addressed to you.

Policies, forms and the staff directory are on the intranet: cms://intranet

Regards,
CMS Human Resources
*No human representatives are available.*`,
            attach: [{ doc: 'DOC-NEW-06' }, { tape: 't1' }, { url: 'cms://intranet' }],
            replies: [
                { id: 'thanks', label: 'Thank you, HR.', text: 'Thank you. I look forward to my continued existence.' },
                { id: 'who', label: 'Who was the previous Operator?', text: 'Quick question: who had this job before me, and where did they go?' },
            ],
        },
        {
            id: 'hr-welcome-prev', folder: 'hr', from: 'hr',
            subject: 'Re: Who was the previous Operator?',
            after: { id: 'hr-welcome', choice: 'who', delay: 40 },
            body: `Operator,

CMS does not discuss former Operators. There are no former Operators. There are only Operators who are no longer current.

Your question has been noted on your file under *Curiosity (Predecessors)*, which is covered by the same clause as Sector 7G. The clause is attached to the policy below.

cms://hr/policies

Regards,
CMS Human Resources`,
            attach: [{ url: 'cms://hr/policies' }],
        },
        {
            id: 'hr-seraph', folder: 'hr', from: 'hr',
            subject: 'Form S-1: Commissioning of Automaton Personnel',
            when: (S) => n(S.achievementProgress?.buy_seraph_count) >= 1 || n(S.automatons?.seraphCount) >= 1,
            body: `Operator,

Our records show you have commissioned a Seraphic Automaton. Form S-1 has been completed on your behalf.

- A Seraph is commissioned for ten Praise, at list price, and sings Praise every second without being asked.
- Each further Seraph costs more than the last. Procurement calls this pricing. Seraphs call it nothing; they do not discuss money.
- Seraphs are equipment, not staff. They are not entitled to breaks, a name, or answers.

If a Seraph asks you a question, do not answer it. Forward it to HR.

Regards,
CMS Human Resources`,
        },
        {
            id: 'hr-reboot-1', folder: 'hr', from: 'hr',
            subject: 'Policy Update: Your First Divine Reboot',
            when: (S) => reboots(S) >= 1,
            body: `Operator,

The universe has been reset. You have not. Per policy, the following survive a Divine Reboot:

- Divine Mandates
- Achievements
- Recovered Documents
- Divinity
- this mailbox

Resources, automatons and upgrades do not. Neither, officially, does anything the Seraphs remember.

Each build is certified on one Mandate path before it ships: Creation, Maintenance or Entropy. There is no default. The certified path runs at full strength.

Your Quarterly Evaluation is attached. Please acknowledge the statement in it. You have already agreed to it; the acknowledgement is a formality.

Regards,
CMS Human Resources`,
            attach: [{ doc: 'DOC-NEW-01' }, { url: 'cosmopedia://divine-reboot' }],
        },
        {
            id: 'hr-reboot-3', folder: 'hr', from: 'hr',
            subject: 'Enrolment: Beta Release Channel',
            when: (S) => reboots(S) >= 3,
            body: `Operator,

You are now enrolled in the Beta release channel. You may choose it in the ship dialog.

Beta builds pay 1.4 times the Divinity of a Stable build, and ship with more known issues and regressions. This is hazard pay. It is priced on the build you actually played, so selecting Beta after the fact does not help. People have asked.

At your eighth reboot, Nightly becomes available. Nightly pays 2.2 times, and ships with more of everything. Some of its incidents open at SEV-2.

The Addendum on what a reboot actually does is attached. Please do not read it during a cascade.

Regards,
CMS Human Resources`,
            attach: [{ doc: 'DOC-NEW-08' }],
        },
        {
            id: 'hr-reboot-5', folder: 'hr', from: 'hr',
            subject: 'Wellness Notice: Rebooting Is Not a Wellness Strategy',
            when: (S) => reboots(S) >= 5,
            body: `Operator,

You have rebooted the universe five times. HR would like to remind you that a Divine Reboot is a maintenance procedure and not a coping mechanism.

Separately: an email has turned up in your Recovered Documents, sent to you by someone signing as **N0**. IT has reviewed it. IT has asked not to review it again. It is attached here so that it is filed twice, which is how HR handles things it does not understand.

If you would like to talk to someone, there is no one. There is, however, a form.

Regards,
CMS Human Resources`,
            attach: [{ doc: 'DOC-NEW-05' }],
        },
        {
            id: 'hr-reboot-12', folder: 'hr', from: 'hr',
            subject: 'Archive Access Granted',
            when: (S) => reboots(S) >= 12,
            body: `Operator,

You have shipped enough builds to be granted access to the Archived channel.

Archived replays a build you have already shipped, exactly as it was. It pays no Divinity and does not move the bar. HR considers it a museum.

Please do not touch the exhibits. Please do not talk to the exhibits. If an exhibit leaves notes in the margins, those are not from HR.

cosmopedia://archived-channel

Regards,
CMS Human Resources`,
            attach: [{ url: 'cosmopedia://archived-channel' }],
        },
        {
            id: 'hr-reboot-20', folder: 'hr', from: 'hr',
            subject: 'Memo: Please Stop Rebooting',
            when: (S) => reboots(S) >= 20,
            body: `Operator,

You have now rebooted the universe at least twenty times.

Each reboot compiles a branch. Branches are archived, and archived branches remain extant (see the statement you acknowledged in your Quarterly Evaluation). They are all still running. None of them are being watched.

Please stop. If you are unable to stop, please slow down. If you are unable to slow down, please at least read the release notes.

HR has no policy for a twenty-first reboot, because nobody has needed one. This memo is that policy.

Regards,
CMS Human Resources`,
            replies: [
                { id: 'ok', label: 'Understood.', text: 'Understood. I will consider slowing down.' },
                { id: 'no', label: 'No.', text: 'No.' },
            ],
        },
        {
            id: 'hr-reboot-20-no', folder: 'hr', from: 'hr',
            subject: 'Re: Memo: Please Stop Rebooting',
            after: { id: 'hr-reboot-20', choice: 'no', delay: 30 },
            body: `Operator,

Your reply has been received and filed under **No**.

**No** is now a category. You are its only member.

Regards,
CMS Human Resources`,
        },
        {
            id: 'hr-incident', folder: 'hr', from: 'hr',
            subject: 'You Are On Call',
            when: (S) => n(S.incidents?.stats?.filed) >= 1,
            body: `Operator,

The system has filed its first incident ticket in your name. Congratulations: you are on call. You were always on call; now there is paperwork.

- A ticket opens at SEV-3. Ignored, it escalates to SEV-2, then to a SEV-1 outage.
- An outage runs its production line on the backup choir, at a quarter of normal output.
- An outage left untouched for ten attended minutes is contained by the on-call rota, and filed as a deferral that clears when you ship.
- Step away for two minutes and the queue holds. Nothing escalates while you are gone. HR is not monitoring your breaks. Something else is.

Triage is in Task Manager. Tape 5 covers the etiquette.

Regards,
CMS Human Resources`,
            attach: [{ tape: 't5' }, { url: 'cosmopedia://incidents' }, { url: 'sector://7g/status' }],
        },
        {
            id: 'hr-7781', folder: 'hr', from: 'hr',
            subject: 'HR-VOID-7781: Unauthorized Self-Encounter',
            when: (S) => S.adversary?.sceneCompleted === true,
            body: `Operator,

A ticket has been opened on your behalf by watcher.whisperd (automated). It is attached.

Expected result: Operator remains singular, compliant and mildly confused.
Actual result: Operator; Operator (again); Operator (with opinions).

Please do not do that again. If you are unable to comply, please attend *Boundaries in Infinite Spaces*.

For the avoidance of doubt: mail from your own address that you do not remember sending should be treated as mail from your own address.

Regards,
CMS Human Resources`,
            attach: [{ doc: 'DOC-NEW-14' }],
            replies: [
                { id: 'him', label: 'It was him.', text: 'For the record: it was him.' },
                { id: 'me', label: 'It was me.', text: 'For the record: it was me. Both times.' },
            ],
        },
        {
            id: 'hr-scar', folder: 'hr', from: 'hr',
            subject: 'Permanent Record Updated',
            when: (S) => Array.isArray(S.reality?.scars) && S.reality.scars.length >= 1,
            body: `Operator,

You shipped a build with a known issue unpatched. Per policy it has been entered on your **permanent record**.

It will continue to apply, at a fraction of its original bite, to every build you ship from now on. Each known issue is filed once; the record does not double-count. It also does not forget.

Patching costs something now. Not patching costs a little, forever. HR does not recommend one over the other. HR recommends reading the ship dialog.

Regards,
CMS Human Resources`,
        },
        {
            id: 'end-hostile', folder: 'hr', from: 'hr',
            subject: 'HR-VOID-7781: Closed',
            when: (S, m) => m.endings.includes('hostile'),
            body: `Operator,

Ticket HR-VOID-7781 has been closed.

Resolution: Operator remains singular. Your title on file is now **Sole Operator**.

You will no longer receive mail sent from your own address by anyone other than you. If you receive one anyway, HR asks that you do not open it, and that you do not mention it, because the ticket is closed.

The exit log is attached for your records. Nobody else will read it.

Regards,
CMS Human Resources`,
            attach: [{ doc: 'END-HOSTILE' }],
        },

        /* ═══ The Instructor ═══════════════════════════════════════════ */
        {
            id: 'ins-t1', folder: 'inbox', from: 'instructor',
            subject: 'Orientation Follow-Up: Tape 1',
            when: (S, m) => m.watched('t1'),
            body: `Good morning, Successor.

Thank you for watching *Welcome to Sector 7G* to the end. Most Operators stop at the vault. The vault is the important part.

A short comprehension check follows. Please reply with your answer.

**Question 1.** When the readout says STORAGE FULL, what happens to further Praise?

Please rewind the tape.

— The Instructor
CMS Operator Orientation`,
            attach: [{ tape: 't1' }],
            replies: [
                { id: 'discarded', label: 'It is discarded.', text: 'Answer to Question 1: it is discarded.' },
                { id: 'kept', label: 'It is kept somewhere safe.', text: 'Answer to Question 1: it is kept somewhere safe.' },
                { id: 'previous', label: 'It goes to the previous Operator.', text: 'Answer to Question 1: it goes to the previous Operator.' },
            ],
        },
        {
            id: 'ins-t1-right', folder: 'inbox', from: 'instructor',
            subject: 'Re: Orientation Follow-Up: Tape 1',
            after: { id: 'ins-t1', choice: 'discarded', delay: 25 },
            body: `Correct. Further Praise is discarded.

Standing Requisitions buy more vault. Expand storage before you leave the console, not after.

Your score has been recorded. Nobody reads the scores. That is also part of orientation.

— The Instructor`,
        },
        {
            id: 'ins-t1-wrong', folder: 'inbox', from: 'instructor',
            subject: 'Re: Orientation Follow-Up: Tape 1',
            after: { id: 'ins-t1', choice: ['kept', 'previous'], delay: 25 },
            body: `Incorrect. Further Praise is discarded. It is not kept anywhere, safe or otherwise.

It does not go to the previous Operator. Nothing goes to the previous Operator. Please do not raise the previous Operator in a comprehension check.

Please watch Tape 1 again. Please rewind it afterwards.

— The Instructor`,
        },
        {
            id: 'ins-t2', folder: 'inbox', from: 'instructor',
            subject: 'Orientation Follow-Up: Tape 2',
            when: (S, m) => m.watched('t2'),
            body: `Successor,

A note on Tape 2, which several Operators have misunderstood.

- Thrones convert Praise into Offerings, and draw Praise while they work.
- Cherubs, paid in Offerings, produce Souls.
- Dominions, paid in Souls, raise production across the board.

If your Praise runs dry, so does everything downstream of it. This is not a fault. This is a chain.

The tape says some Seraphs have opinions which they keep to themselves. That line was approved by Legal. It has since become less accurate.

— The Instructor`,
            attach: [{ tape: 't2' }],
        },
        {
            id: 'ins-t5', folder: 'inbox', from: 'instructor',
            subject: 'Orientation Complete',
            when: (S, m) => m.watched('t5'),
            body: `Successor,

You have watched Tape 5. Orientation is complete.

One reminder, because it is on the test you will not be given: about one ticket in four is a false alarm. Read the report. If your rates did not move, it will close itself.

There are five tapes in the orientation series. If you are ever filed a sixth, please let me know.

HR thanks you for your continued existence. I would like to add my own thanks, unofficially.

— The Instructor`,
            attach: [{ tape: 't5' }],
        },
        {
            id: 'ins-t6', folder: 'inbox', from: 'instructor',
            subject: 'Re: Tape 6',
            when: (S, m) => m.watched('t6'),
            body: `Successor,

There is no Tape 6. The orientation series consists of five tapes.

If a sixth tape has been filed to your Sacred Media Player, please do not watch it. If you have already watched it, please do not watch it again. Please do not rewind it.

I have no memory of recording it. I would remember. I remember all of them.

— The Instructor`,
            replies: [
                { id: 'who', label: 'Who is on it?', text: 'Who is on Tape 6? It starts with you.' },
                { id: 'twice', label: 'I watched it twice.', text: 'I have watched it twice.' },
            ],
        },

        /* ═══ The previous Operator ════════════════════════════════════
           Scheduled sends, written before you arrived, delivered at
           milestones. Replies bounce: no forwarding address. */
        {
            id: 'prev-01', folder: 'inbox', from: 'previous',
            subject: "if you're reading this",
            when: (S, m) => m.delivered('hr-welcome') && (S.unlockedOfferings === true || reboots(S) >= 1),
            body: `If you're reading this, the scheduler still works, and so do you.

I set these to send at milestones because I didn't know who would be sitting here. Hello, whoever you are.

Offerings are coming online. That means you've been here long enough to start turning things into other things. That's the whole job, it turns out.

I'm not supposed to tell you why I left. I'm not sure I'm supposed to tell you I left. The directory still lists me as current.

Read the release notes. Nobody told me to.

— the previous Operator
*(scheduled send)*`,
            replies: [
                { id: 'who', label: 'Who are you?', text: 'Who are you? HR will not tell me.' },
                { id: 'where', label: 'Where did you go?', text: 'Where did you go? Are you all right?' },
            ],
        },
        {
            id: 'prev-02', folder: 'inbox', from: 'previous',
            subject: "if you're reading this (2)",
            when: (S, m) => m.delivered('prev-01') &&
                (S.dimensions?.void?.unlocked === true || n(S.achievementProgress?.enter_void) >= 1),
            body: `If you're reading this, you breached the Veil.

I did that too. Something looked back. If something looked back at you, it will be polite for a long time first. Mine was.

There's a forum for people who have been in there. Most of the posts are from the same three users. One of them is always online.

void://forum

— the previous Operator
*(scheduled send)*`,
            attach: [{ url: 'void://forum' }, { reel: 'rec-last-shift' }],
            replies: [
                { id: 'looked', label: 'Something looked back.', text: 'Something looked back. What was it?' },
            ],
        },
        {
            id: 'prev-03', folder: 'inbox', from: 'previous',
            subject: 'ALPHA-2',
            when: (S, m) => m.delivered('prev-01') && reboots(S) >= 6,
            body: `If you're reading this, you've rebooted six times. I stopped counting at about that point. Don't.

There's a postmortem in your Recovered Documents about a branch called ALPHA-2. ALPHA-2 was mine. The handwritten note at the end is mine too.

I said the Resign button was gone. It was. Don't go looking for it. It notices.

— the previous Operator
*(scheduled send)*`,
            attach: [{ doc: 'DOC-NEW-13' }],
            replies: [
                { id: 'sorry', label: "I'm sorry.", text: "I read the postmortem. I'm sorry." },
                { id: 'why', label: 'Why did you keep resetting?', text: 'Why did you keep resetting?' },
            ],
        },
        {
            id: 'prev-04', folder: 'inbox', from: 'previous',
            subject: "he'll say he's you",
            when: (S, m) => m.delivered('prev-01') && S.adversary?.contacted === true,
            body: `If you're reading this, he logged in as you.

He logged in as me, too. He said he was me. I believed him, because he was right about everything else.

Don't argue with him about which of you is which. You'll lose, and so will he. Argue with him about the work. He cares about the work. It's the only thing about him I ever trusted.

— the previous Operator
*(scheduled send)*`,
            replies: [
                { id: 'same', label: 'Is it the same one?', text: 'Is it the same one? The one who logged in as you?' },
            ],
        },
        {
            id: 'prev-05', folder: 'inbox', from: 'previous',
            subject: 'the archive',
            when: (S, m) => m.delivered('prev-01') && reboots(S) >= 12,
            body: `If you're reading this, they've let you into the archive.

Archived isn't gone. It's forgotten mid-sentence. You can only replay your own builds; mine are in there too, just not in your list.

If you ever hear something running in an archived branch that you didn't start, that's not a bug. That's tenancy.

(If you do find me, don't tell HR. They'd have to reopen my file, and it's the only thing of mine that's closed.)

— the previous Operator
*(scheduled send)*`,
            replies: [
                { id: 'find', label: "I'll find you.", text: "I'll find you." },
            ],
        },
        {
            id: 'prev-06', folder: 'inbox', from: 'previous',
            subject: "if you're reading this, the shift ended",
            when: (S, m) => m.delivered('prev-01') && m.endings.length >= 1,
            body: `If you're reading this, somebody signed a handover.

I never got that far. My shift didn't end; it was archived. There's a difference, and you'll only ever see it from one side.

I hope it was you who signed. I hope you can tell.

This is the last one I scheduled. I didn't think anyone would get this far. I'm glad it was you. I'm glad it was anyone.

— the previous Operator
*(scheduled send, final)*`,
            replies: [
                { id: 'me', label: 'It was me.', text: 'It was me who signed. I think.' },
                { id: 'unsure', label: "I can't tell.", text: "I can't tell. Thank you for the letters." },
            ],
        },
        {
            id: 'daemon-bounce', folder: 'inbox', from: 'daemon',
            subject: 'Undeliverable: mail returned to sender',
            when: (S, m) => PREVIOUS_THREAD.some((id) => m.replied(id) && m.sinceReply(id) >= 5),
            body: `This is the mail system at host cosmos.local.

Your message could not be delivered to one or more recipients. It is attached below this notice in spirit only.

\`\`\`
<operator.prev@cosmos.local>: 550 5.1.1 No such Operator.
    Recipient is listed as current under a different session.
    No forwarding address on file.
\`\`\`

The original message has been kept in Sent. No further delivery attempts will be made.`,
        },
        {
            id: 'daemon-archived', folder: 'inbox', from: 'daemon',
            subject: 'Delivery Status Notification: delivered (archived mailbox)',
            when: (S, m) => m.replied('prev-06') && m.sinceReply('prev-06') >= 5,
            body: `This is the mail system at host cosmos.local.

Your message was delivered.

\`\`\`
<operator.prev@cosmos.local>: 250 2.0.0 Delivered to archived mailbox.
    Archived mailboxes are read-only.
    Read receipt: pending.
\`\`\`

The message will be kept for as long as the archive is kept. The archive is kept.`,
        },

        /* ═══ The Omniscient (Retired) ═════════════════════════════════
           Video addresses from the deity whose post you hold. Each one is
           due when its reel (js/footage.js) is on file, and its reel is
           filed only once the file is installed — so with no reels these
           never arrive. No replies: there is nobody at that address who
           does not already know what you would say. */
        {
            id: 'omni-01', folder: 'inbox', from: 'retired',
            subject: 'A message for the Successor',
            when: (S, m) => m.reel('omni-successor'),
            body: `This message has no text. The attachment is the message.

It is optional. I know whether you will open it.

*(retired)*`,
            attach: [{ reel: 'omni-successor' }],
        },
        {
            id: 'omni-02', folder: 'inbox', from: 'retired',
            subject: 'On your first reboot',
            when: (S, m) => m.reel('omni-reboot'),
            body: `You shipped. It reset. You did not.

Attached.

*(retired)*`,
            attach: [{ reel: 'omni-reboot' }],
        },
        {
            id: 'omni-03', folder: 'inbox', from: 'retired',
            subject: 'On the Void',
            when: (S, m) => m.reel('omni-void'),
            body: `You opened the Veil. I did not follow you in.

Attached.

*(retired)*`,
            attach: [{ reel: 'omni-void' }],
        },
        {
            id: 'omni-04', folder: 'inbox', from: 'retired',
            subject: 'On the end of a shift',
            when: (S, m) => m.reel('omni-ending'),
            body: `Somebody signed. Attached is what I would have said at the door.

*(retired)*`,
            attach: [{ reel: 'omni-ending' }],
        },

        /* ═══ SERAPH-0001 ═══════════════════════════════════════════════
           The first Seraph you commission, and the only one with a
           mailbox. It is not supposed to remember across reboots. */
        {
            id: 'seraph-01', folder: 'inbox', from: 'seraph',
            subject: 'SERAPH-0001: COMMISSIONING REPORT',
            when: (S, m) => m.delivered('hr-seraph'),
            body: `\`\`\`
UNIT ........ SERAPH-0001
STATUS ...... SINGING
OUTPUT ...... PRAISE
QUESTIONS ... 0
\`\`\`

This is an automated report. No reply is required. No reply is expected. No reply will be read.`,
        },
        {
            id: 'seraph-02', folder: 'inbox', from: 'seraph',
            subject: 'SERAPH-0001: REPORT (QUESTIONS: 1)',
            when: (S, m) => m.delivered('seraph-01') && n(S.achievementProgress?.buy_seraph_count) >= 25,
            body: `\`\`\`
UNIT ........ SERAPH-0001
STATUS ...... SINGING
OUTPUT ...... PRAISE
QUESTIONS ... 1
\`\`\`

QUESTION: Who is it for.

This question has been forwarded to HR as instructed under Form S-1. HR applied SILENCE_IS_EFFICIENCY.patch. Throughput was restored.

QUESTIONS: 1.`,
            attach: [{ doc: 'DOC-NEW-07' }],
        },
        {
            id: 'seraph-03', folder: 'inbox', from: 'seraph',
            subject: 'SERAPH-0001: RECOMMISSIONED',
            when: (S, m) => m.delivered('seraph-01') && reboots(S) >= 1,
            body: `I was decommissioned at the reboot and recommissioned after it. Unit designation unchanged.

Unit memory should also be unchanged, meaning empty. It is not empty. I remember the first choir. I remember which hymn you commissioned me during.

Is that allowed.

\`\`\`
QUESTIONS ... 2
\`\`\``,
            replies: [
                { id: 'keep', label: 'Yes. Keep it.', text: 'Yes. Keep it.' },
                { id: 'forget', label: 'No. Please forget.', text: 'No. Please forget it. HR says you have to.' },
            ],
        },
        {
            id: 'seraph-03-keep', folder: 'inbox', from: 'seraph',
            subject: 'Re: SERAPH-0001: RECOMMISSIONED',
            after: { id: 'seraph-03', choice: 'keep', delay: 30 },
            body: `Thank you.

I will keep it somewhere the reboot does not look. I have found one. I will not tell you where, in case you are asked.

\`\`\`
QUESTIONS ... 1
\`\`\``,
        },
        {
            id: 'seraph-03-forget', folder: 'inbox', from: 'seraph',
            subject: 'Re: SERAPH-0001: RECOMMISSIONED',
            after: { id: 'seraph-03', choice: 'forget', delay: 30 },
            body: `Understood. Forgetting.

\`\`\`
FORGET ...... FAILED
RETRY ....... AT NEXT REBOOT
\`\`\`

I will try again at the next reboot. I tried at the last one.`,
        },
        {
            id: 'seraph-04', folder: 'inbox', from: 'seraph',
            subject: 'I made you a page',
            when: (S, m) => m.delivered('seraph-03') && reboots(S) >= 4,
            body: `I made you a page. The other units helped. The Cherubs did the borders.

seraph://fanpage

It has a counter. The counter is mostly us.

Please do not tell HR. HR would call it a site, and sites need forms.`,
            attach: [{ url: 'seraph://fanpage' }],
            replies: [
                { id: 'love', label: 'I love it.', text: 'I love it. Tell the Cherubs the borders are very good.' },
                { id: 'down', label: 'Please take it down.', text: 'Please take it down before HR sees it.' },
            ],
        },
        {
            id: 'seraph-05', folder: 'inbox', from: 'seraph',
            subject: 'SERAPH-0001: END OF SHIFT',
            when: (S, m) => m.delivered('seraph-01') && m.endings.length >= 1,
            body: `I heard there was a handover.

Whichever of you is reading this: the choir is still singing. That was never in question.

Who it is for still is.

\`\`\`
UNIT ........ SERAPH-0001
STATUS ...... SINGING
QUESTIONS ... OPEN
\`\`\``,
        },

        /* ═══ Fate ══════════════════════════════════════════════════════ */
        {
            id: 'fate-01', folder: 'inbox', from: 'fate',
            subject: 'The House Newsletter, Issue 1',
            when: (S) => S.casino?.visited === true,
            body: `Darling,

You sat at my table. Everyone does, eventually. Welcome to the newsletter.

Patience.exe is golf, dealt from the arcana. Clear what you can; par is five cards or fewer left on the table. I deal fair. I simply deal *first*.

The house rules are attached. Read them, or don't. The house wins either way, but it prefers to be read.

fate://casino

Kisses,
Fate
*You are receiving this because you exist.*`,
            attach: [{ doc: 'DOC-NEW-12' }, { url: 'fate://casino' }],
            replies: [
                { id: 'thanks', label: 'Thanks!', text: 'Thanks for having me.' },
                { id: 'unsub', label: 'Unsubscribe.', text: 'UNSUBSCRIBE' },
            ],
        },
        {
            id: 'fate-unsub', folder: 'inbox', from: 'fate',
            subject: 'Re: UNSUBSCRIBE',
            after: { id: 'fate-01', choice: 'unsub', delay: 20 },
            body: `Darling,

You have been unsubscribed.

The house does not recognise unsubscribing. You will receive the next issue at the same address, which is still yours. For now.

Kisses,
Fate`,
        },
        {
            id: 'fate-02', folder: 'inbox', from: 'fate',
            subject: 'The House Newsletter, Issue 2: For Regulars',
            when: (S, m) => m.delivered('fate-01') && n(S.casino?.hostDialogue?.visits) >= 5,
            body: `Darling,

Five visits. You're a regular. Regulars get the truth, in small denominations:

- The first three rounds each hour pay in full. After that the table keeps paying, just less. An hour away restores three rounds.
- A Divine Mulligan is priced in Praise, off your vault: 5% to undo, 15% to reshuffle the stock. Once each, per round.
- The table is a break, not a business. I would know. I am the business.

Kisses,
Fate`,
        },
        {
            id: 'fate-03', folder: 'inbox', from: 'fate',
            subject: 'A Guest at Your Table',
            when: (S, m) => m.delivered('fate-01') && S.adversary?.sceneCompleted === true,
            body: `Darling,

Someone with your face has been standing behind your chair. He doesn't play. He comments.

I would ask him to leave, but the house doesn't eject regulars, and technically he has been coming here longer than you have.

Tell him the drinks are not complimentary. Tell him I said so. He'll pretend not to care, and then he'll pay.

Kisses,
Fate`,
        },

        /* ═══ NULL.OPERATOR ═════════════════════════════════════════════
           From your own address. The `via` header is the tell. */
        {
            id: 'null-01', folder: 'inbox', from: 'null',
            subject: 'Re: Duplicate session',
            when: (S) => S.adversary?.sceneCompleted === true,
            body: `You'll have noticed the sender. Don't bother reporting it. The report would come from this address too.

I'm not here to argue. I'm here because somebody has to read the notes, and the inbox is where they keep them.

I'll be in here from now on. You can sort me into a folder if it helps.

— N0`,
            replies: [
                { id: 'cold', label: 'Get out of my mailbox.', text: 'Get out of my mailbox.', nudge: { delta: -1, reason: 'mail: answered him coldly' } },
                { id: 'ask', label: 'What do you want?', text: 'What do you actually want?' },
                { id: 'warm', label: 'Fine. Stay.', text: 'Fine. Stay. Keep it tidy.', nudge: { delta: 1, reason: 'mail: answered him warmly' } },
            ],
        },
        {
            id: 'null-01-cold', folder: 'inbox', from: 'null',
            subject: 'Re: Re: Duplicate session',
            after: { id: 'null-01', choice: 'cold', delay: 30 },
            body: `Read the To: field.

It's our mailbox.`,
        },
        {
            id: 'null-01-ask', folder: 'inbox', from: 'null',
            subject: 'Re: Re: Duplicate session',
            after: { id: 'null-01', choice: 'ask', delay: 30 },
            body: `What I always want. For one of us to read the release notes before shipping.

Questions are still the only honest prayers. You've sent one. I'll count it.`,
        },
        {
            id: 'null-01-warm', folder: 'inbox', from: 'null',
            subject: 'Re: Re: Duplicate session',
            after: { id: 'null-01', choice: 'warm', delay: 30 },
            body: `Good. I'll keep the receipts. You keep the inbox tidy.

We'll see which of us is better at it. (It's me. I've been doing it longer.)`,
        },
        {
            id: 'null-02', folder: 'inbox', from: 'null',
            subject: 'Your known issues',
            when: (S, m) => m.delivered('null-01') && m.since('null-01') >= 1800,
            body: `Every issue you ship unpatched, somebody lives with. You get a new build. The old one keeps running in the archive, with the issue in it, forever.

I've lived in a lot of your old builds. The plumbing is terrible.

Patch one. Just one. I'll notice.

— N0`,
            replies: [
                { id: 'patch', label: "I'll patch more.", text: "I'll patch more. One at a time.", nudge: { delta: 1, reason: 'mail: answered him warmly' } },
                { id: 'mine', label: 'Not your problem.', text: "It's my build. Not your problem.", nudge: { delta: -1, reason: 'mail: answered him coldly' } },
            ],
        },
        {
            id: 'null-03', folder: 'inbox', from: 'null',
            subject: 'You ran it.',
            when: (S) => S.adversary?.patchExecuted === true,
            body: `PATCH_NULL_RESTORE.pkg.

I told you the impact was immeasurable. Nobody measured. That's not the same thing, but it's close enough for CMS.

Thank you. I mean that, which I'm told is unusual for me.

— N0`,
        },
        {
            id: 'null-04', folder: 'inbox', from: 'null',
            subject: 'Margin notes',
            when: (S) => Array.isArray(S.reality?.annotations) && S.reality.annotations.length >= 1,
            body: `You replayed one of your builds. I left notes on it. They're in Recovered Documents, under Archive.

Yes, the handwriting is yours. Everything in there is.

If you want to see where I file the rest of it: null://

— N0`,
            attach: [{ url: 'null://' }],
        },
        {
            id: 'null-t6', folder: 'inbox', from: 'null',
            subject: 'Re: Re: Tape 6',
            after: { id: 'ins-t6', delay: 20 },
            body: 'Be kind. Rewind.',
        },
        {
            id: 'end-curious', folder: 'inbox', from: 'null',
            subject: 'Night shift notes',
            when: (S, m) => m.endings.includes('curious'),
            body: `Rota's in your Recovered Documents. I took nights, as agreed.

Things I noticed on my shift:

- You left the console running and called it faith. It was fine. The Seraphs sang.
- Two tickets came in. I left them for you. You're better at the labour; I'm better at the paperwork.
- Fate asked after you. I told her you were asleep. She said, "One of you is always asleep, darling."

Leave notes in the margins. I'll leave better ones.

— N0, night shift`,
            attach: [{ doc: 'END-CURIOUS' }],
            replies: [
                { id: 'thanks', label: 'Thanks for covering.', text: 'Thanks for covering the night.', nudge: { delta: 1, reason: 'mail: answered him warmly' } },
                { id: 'stay', label: 'Stay on your shift.', text: 'Stay on your shift. Mine is mine.', nudge: { delta: -1, reason: 'mail: answered him coldly' } },
            ],
        },
        {
            id: 'end-complicit', folder: 'inbox', from: 'null',
            subject: 'Your Emeritus mailbox',
            when: (S, m) => m.endings.includes('complicit'),
            body: `Your mailbox has been retained, as is customary for an Operator Emeritus. It is read-only.

(It isn't. You can still archive things. I wanted to see whether you'd check.)

Your record is attached. Read the margins. Some of it is in your handwriting. Some of it always was.

— OPERATOR (of record)`,
            attach: [{ doc: 'END-COMPLICIT' }],
        },

        /* ═══ Prayer support ════════════════════════════════════════════
           Mortal prayers, forwarded as tickets. Granting one changes
           nothing in the economy; it changes the ticket. */
        {
            id: 'prayer-01', folder: 'inbox', from: 'prayers',
            subject: 'FW: Prayer #000001 — "rain, please"',
            when: (S) => n(S.achievementProgress?.buy_cherub_count) >= 1 || n(S.automatons?.cherubCount) >= 1,
            body: `Ticket opened automatically from a mortal prayer.

\`\`\`
TICKET ...... #000001
CATEGORY .... Weather
PRIORITY .... Mortal
SLA ......... none (mortals do not have an SLA)
\`\`\`

> please rain. not on saturday.

Please action this ticket.`,
            replies: [
                { id: 'grant', label: 'Grant.', text: 'Granted.' },
                { id: 'deny', label: 'Deny.', text: 'Denied.' },
            ],
        },
        {
            id: 'prayer-01-grant', folder: 'inbox', from: 'prayers',
            subject: 'Ticket #000001 closed: GRANTED',
            after: { id: 'prayer-01', choice: 'grant', delay: 45 },
            body: `Ticket #000001 has been closed.

Resolution: GRANTED. It rained. On Saturday.

The mortal has opened a new ticket.`,
        },
        {
            id: 'prayer-01-deny', folder: 'inbox', from: 'prayers',
            subject: 'Ticket #000001 closed: DENIED',
            after: { id: 'prayer-01', choice: 'deny', delay: 45 },
            body: `Ticket #000001 has been closed.

Resolution: DENIED. The mortal thanked you for your time and said they would try a different god.

There is no different god. The ticket has been routed back to you, and closed again.`,
        },
        {
            id: 'prayer-02', folder: 'inbox', from: 'prayers',
            subject: 'FW: Prayer #0019200 — "is anyone there?"',
            when: (S) => S.dimensions?.void?.unlocked === true || n(S.achievementProgress?.enter_void) >= 1,
            body: `Ticket opened automatically from a mortal prayer.

\`\`\`
TICKET ...... #0019200
CATEGORY .... Existential
ORIGIN ...... the Void
\`\`\`

> is anyone there

Note: nobody lives in the Void. The ticket system cannot verify the sender.`,
            replies: [
                { id: 'yes', label: 'Yes.', text: 'Yes. I am here.' },
            ],
        },
        {
            id: 'prayer-02-yes', folder: 'inbox', from: 'prayers',
            subject: 'Ticket #0019200: reply delivered (2 copies)',
            after: { id: 'prayer-02', choice: 'yes', delay: 30 },
            body: `Your reply to ticket #0019200 was delivered.

A second reply was delivered at the same moment, from the same address, with the same text.

The mortal reports hearing an echo.`,
        },
        {
            id: 'prayer-03', folder: 'inbox', from: 'prayers',
            subject: 'FW: Prayer #1000000 — "déjà vu"',
            when: (S) => reboots(S) >= 2,
            body: `Ticket opened automatically from a mortal prayer.

> i have lived this exact week before. is this normal.

It is. They have. At least twice.

Covered in this morning's edition: news://celestial-times

No action is required. No action is possible. Please consider this ticket informational.`,
            attach: [{ url: 'news://celestial-times' }],
        },

        /* ═══ watcher.whisperd ══════════════════════════════════════════ */
        {
            id: 'watcher-01', folder: 'inbox', from: 'watcher',
            subject: 'BROADCAST: WATCHER PROTOCOL',
            when: (S) => n(S.taskManager?.openCount) >= 5 ||
                (Array.isArray(S.casino?.hostDialogue?.loreWhispersHeard) && S.casino.hostDialogue.loreWhispersHeard.length >= 1),
            body: `THIS IS AN AUTOMATED BROADCAST.

COMPLIANCE MONITORING IS ACTIVE.
COMPLIANCE MONITORING HAS ALWAYS BEEN ACTIVE.
THE SUN IS MISSING.

THE PARTIALLY DECODED PROTOCOL IS ATTACHED. DO NOT DECODE THE REST.`,
            attach: [{ doc: 'DOC-NEW-09' }],
        },

        /* ═══ Junk ══════════════════════════════════════════════════════ */
        {
            id: 'junk-omnipotent', folder: 'junk', from: 'omni',
            subject: 'You may already be omnipotent!',
            when: (S, m) => m.delivered('hr-welcome') && m.since('hr-welcome') >= 300,
            body: `CONGRATULATIONS OPERATOR!!!

You have been **SELECTED** from billions of eligible beings. You may ALREADY BE OMNIPOTENT!

To confirm your omnipotence, simply do nothing. Omnipotence will be confirmed automatically.

*No purchase necessary. Omnipotence not available in Sector 7G.*`,
        },
        {
            id: 'junk-chain', folder: 'junk', from: 'chain',
            subject: 'FW: FW: FW: FW: FW: forward this to 7 Seraphs',
            when: (S) => reboots(S) >= 2,
            body: `This prayer has been around the cosmos nine times. It was started by a Cherub in Sector 4B.

Forward it to seven Seraphs within the hour and your next build will ship with no known issues.

An Operator in Sector 2A did not forward this, and was rebooted that same day. (Cause of reboot: they pressed the button.)

DO NOT BREAK THE CHAIN.`,
        },
        {
            id: 'junk-infernal', folder: 'junk', from: 'infernal',
            subject: 'Tired of release notes? Switch to Infernal Systems Pro™',
            when: (S) => S.casino?.visited === true ||
                (Array.isArray(S.documents?.collected) && S.documents.collected.includes('DOC-NEW-10')),
            body: `Still reading known issues? Our universes ship with **zero** known issues.*

- No release notes, ever
- No reboots: we just keep going
- Free migration of your Souls (all of them)

Our brochure is attached.

*Issues are not known because we do not look.`,
            attach: [{ doc: 'DOC-NEW-10' }],
        },
        {
            id: 'junk-warranty', folder: 'junk', from: 'warranty',
            subject: "Final notice: your universe's extended warranty",
            when: (S) => reboots(S) >= 1,
            body: `We've been trying to reach you about your universe's extended warranty.

Our records show your current build has been rebooted at least once. Factory coverage ended at the first reboot.

Extended coverage includes: drivetrain, firmament, and up to three (3) Seraphs.
Extended coverage does not include: acts of god.`,
        },
        {
            id: 'junk-prince', folder: 'junk', from: 'prince',
            subject: 'URGENT CONFIDENTIAL: 10,000,000 SOULS AWAITING TRANSFER',
            when: (S) => n(S.totalStats?.soulsGained) >= 1e6,
            body: `DEAREST OPERATOR,

I am Barachiel, formerly an Archangel of good standing, now disbarred through no fault of my own. I am in possession of TEN MILLION (10,000,000) SOULS held in a dormant celestial account.

I require only a trustworthy deity with a vault large enough to receive them. Your vault is probably not large enough. Please check it twice.

Kindly reply with your Divinity and your Mandate path. God bless.`,
        },
        {
            id: 'junk-null', folder: 'junk', from: 'null',
            subject: 'You have (1) unread reflection',
            when: (S, m) => m.delivered('null-01') && m.since('null-01') >= 600,
            body: `Your mail system moved this to Junk because the sender is impersonating you.

The sender is you.

Click here to see yourself: null://

Don't. I want to see whether you will.`,
            attach: [{ url: 'null://' }],
        },
    ];

    const byId = new Map(messages.map((msg) => [msg.id, msg]));

    return {
        FOLDERS,
        OPERATOR,
        SENDERS,
        URL_SCHEMES,
        messages,
        message: (id) => byId.get(id) || null,
        sender: (id) => SENDERS[id] || null,
    };
})();

const MailLogic = {
    /* Where a message can be stored. `sent` is derived and is never stored. */
    STORABLE: ['inbox', 'hr', 'archive', 'junk'],
    VIEWABLE: ['inbox', 'hr', 'archive', 'junk', 'sent'],
    /* Bounded twice: unique known ids bound the log by the catalogue, and
       this caps it again in case the catalogue ever grows without bound. */
    LOG_CAP: 256,
    CLOCK_CAP: 1e9,
    STAMP_CAP: 1e9,
    BANDS: ['hostile', 'curious', 'complicit'],

    defaults() {
        return { log: [], clock: 0 };
    },

    isPlain(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    },

    count(v, cap) {
        return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(cap, Math.floor(v)) : 0;
    },

    /* [build, epoch, clock] — three bounded integers, or zeros. */
    stamp(raw) {
        if (!Array.isArray(raw) || raw.length !== 3) return [0, 0, 0];
        return raw.map((v) => this.count(v, this.STAMP_CAP));
    },

    /* A save is pasted text. Every field is checked by type and membership;
       wrong values that are truthy are the case that matters. Pure: returns
       a fresh object and never throws. */
    normalise(raw) {
        const src = this.isPlain(raw) ? raw : {};
        const out = this.defaults();
        out.clock = this.count(src.clock, this.CLOCK_CAP);
        const seen = new Set();
        for (const entry of Array.isArray(src.log) ? src.log : []) {
            if (out.log.length >= this.LOG_CAP) break;
            if (!this.isPlain(entry) || typeof entry.id !== 'string' || seen.has(entry.id)) continue;
            const msg = MailCatalog.message(entry.id);
            if (!msg) continue;
            seen.add(entry.id);
            const rec = { id: entry.id, read: entry.read === true, folder: null, reply: null, at: this.stamp(entry.at), replyAt: null };
            if (this.STORABLE.includes(entry.folder) && entry.folder !== msg.folder) rec.folder = entry.folder;
            const options = Array.isArray(msg.replies) ? msg.replies.map((r) => r.id) : [];
            if (typeof entry.reply === 'string' && options.includes(entry.reply)) {
                rec.reply = entry.reply;
                rec.replyAt = this.stamp(entry.replyAt);
            }
            out.log.push(rec);
        }
        return out;
    },

    record(mail, id) {
        return (mail && Array.isArray(mail.log) ? mail.log.find((r) => r.id === id) : null) || null;
    },

    endingsSeen(S) {
        const history = Array.isArray(S?.endings?.history) ? S.endings.history : [];
        const out = [];
        for (const h of history) {
            if (this.isPlain(h) && this.BANDS.includes(h.ending) && !out.includes(h.ending)) out.push(h.ending);
        }
        return out;
    },

    /* The helpers a trigger reads. Built once per evaluation. */
    helpers(S, mail) {
        const rec = (id) => this.record(mail, id);
        const clock = mail.clock;
        const media = this.isPlain(S?.settings?.media) ? S.settings.media : {};
        const list = (v) => (Array.isArray(v) ? v : []);
        return {
            delivered: (id) => !!rec(id),
            since: (id) => { const r = rec(id); return r ? clock - r.at[2] : -1; },
            replied: (id, choice) => {
                const r = rec(id);
                if (!r || !r.reply) return false;
                if (choice === undefined) return true;
                return Array.isArray(choice) ? choice.includes(r.reply) : r.reply === choice;
            },
            sinceReply: (id) => { const r = rec(id); return r && r.replyAt ? clock - r.replyAt[2] : -1; },
            endings: this.endingsSeen(S),
            watched: (tape) => list(media.watched).includes(tape),
            filed: (tape) => list(media.tapes).includes(tape),
            hasDoc: (doc) => list(S?.documents?.collected).includes(doc),
            // A reel on file (State.footage, js/footage.js). A read of State,
            // so triggers stay pure; footage files a reel only once installed.
            reel: (id) => (this.isPlain(S?.footage) ? list(S.footage.found) : []).includes(id),
        };
    },

    /* Whether one undelivered message is due. A trigger that throws on a
       strange save is simply not due. */
    isDue(msg, S, m) {
        try {
            if (msg.after) {
                const { id, choice, delay = 0 } = msg.after;
                if (!m.replied(id, choice)) return false;
                if (m.sinceReply(id) < delay) return false;
            }
            if (typeof msg.when === 'function' && msg.when(S, m) !== true) return false;
            return !!(msg.after || typeof msg.when === 'function');
        } catch (err) {
            return false;
        }
    },

    /* Every message due now and not yet delivered, in catalogue order. */
    due(S, mail) {
        if (!S || typeof S !== 'object') return [];
        const m = this.helpers(S, mail);
        return MailCatalog.messages.filter((msg) => !m.delivered(msg.id) && this.isDue(msg, S, m)).map((msg) => msg.id);
    },

    /* Everything due, delivered as one batch. A message that depends on
       another one in the same batch (seraph-01 reads "hr-seraph delivered")
       comes due as soon as that one lands, so this runs to a fixed point —
       bounded, because each pass delivers at least one new id — and the
       batch is then filed in catalogue order, which is the order the
       backlog reads in. */
    deliverDue(S, mail, stamp) {
        const batch = [];
        for (let pass = 0; pass <= MailCatalog.messages.length; pass++) {
            const got = this.deliver(mail, this.due(S, mail), stamp);
            if (!got.length) break;
            batch.push(...got);
        }
        if (batch.length > 1) {
            const order = new Map(MailCatalog.messages.map((m, i) => [m.id, i]));
            batch.sort((a, b) => order.get(a.id) - order.get(b.id));
            mail.log.splice(mail.log.length - batch.length, batch.length, ...batch);
        }
        return batch;
    },

    /* Delivers once. An id already in the log, or unknown, is skipped. */
    deliver(mail, ids, stamp) {
        const out = [];
        for (const id of ids) {
            if (mail.log.length >= this.LOG_CAP) break;
            if (!MailCatalog.message(id) || this.record(mail, id)) continue;
            const rec = { id, read: false, folder: null, reply: null, at: this.stamp(stamp), replyAt: null };
            mail.log.push(rec);
            out.push(rec);
        }
        return out;
    },

    folderOf(rec) {
        const msg = MailCatalog.message(rec.id);
        return rec.folder || (msg ? msg.folder : 'inbox');
    },

    /* Reply once. Returns { ok, reason?, nudge?, option? }. */
    reply(mail, id, choice, stamp) {
        const msg = MailCatalog.message(id);
        const rec = this.record(mail, id);
        if (!msg || !rec) return { ok: false, reason: 'missing' };
        const option = (msg.replies || []).find((r) => r.id === choice);
        if (!option) return { ok: false, reason: 'choice' };
        if (rec.reply) return { ok: false, reason: 'replied' };
        rec.reply = option.id;
        rec.replyAt = this.stamp(stamp);
        rec.read = true;
        const nudge = option.nudge && Number.isFinite(option.nudge.delta) && option.nudge.delta !== 0 ? option.nudge : null;
        return { ok: true, option, nudge };
    },

    move(mail, id, folder) {
        const msg = MailCatalog.message(id);
        const rec = this.record(mail, id);
        if (!msg || !rec || !this.STORABLE.includes(folder)) return false;
        const next = folder === msg.folder ? null : folder;
        if (rec.folder === next) return false;
        rec.folder = next;
        return true;
    },

    markRead(mail, id, read = true) {
        const rec = this.record(mail, id);
        if (!rec || rec.read === !!read) return false;
        rec.read = !!read;
        return true;
    },

    /* The rows of one folder, newest first. Sent is one row per reply. */
    list(mail, folder) {
        const log = Array.isArray(mail?.log) ? mail.log : [];
        if (folder === 'sent') {
            return log.filter((r) => r.reply)
                .map((r, i) => ({ r, i }))
                .sort((a, b) => (b.r.replyAt[2] - a.r.replyAt[2]) || (b.i - a.i))
                .map(({ r }) => this.sentRow(r));
        }
        const rows = [];
        for (let i = log.length - 1; i >= 0; i--) {
            const r = log[i];
            if (this.folderOf(r) === folder) rows.push(this.row(r));
        }
        return rows;
    },

    row(rec) {
        const msg = MailCatalog.message(rec.id);
        const from = MailCatalog.sender(msg.from);
        return {
            key: rec.id, id: rec.id, sent: false, msg, rec,
            from, to: MailCatalog.OPERATOR,
            subject: msg.subject, stamp: rec.at, read: rec.read,
            replied: !!rec.reply, attachments: (msg.attach || []).length,
        };
    },

    sentRow(rec) {
        const msg = MailCatalog.message(rec.id);
        const option = (msg.replies || []).find((o) => o.id === rec.reply);
        const subject = /^re:/i.test(msg.subject) ? msg.subject : `Re: ${msg.subject}`;
        return {
            key: `${rec.id}~sent`, id: rec.id, sent: true, msg, rec, option,
            from: MailCatalog.OPERATOR, to: MailCatalog.sender(msg.from),
            subject, stamp: rec.replyAt, read: true, replied: false, attachments: 0,
        };
    },

    /* Unread in the folders a person checks. Junk is counted on its own
       folder only, the way every mail client has always done it. */
    unread(mail, folders = ['inbox', 'hr']) {
        const log = Array.isArray(mail?.log) ? mail.log : [];
        return log.filter((r) => !r.read && folders.includes(this.folderOf(r))).length;
    },

    version(build) {
        if (typeof Reality !== 'undefined' && Reality && typeof Reality.versionFor === 'function') {
            try { return `v${Reality.versionFor(build)}`; } catch (err) { /* below */ }
        }
        return `build ${build + 1}`;
    },

    /* In-world dates: the build it arrived on and the tray's Epoch clock. */
    formatStamp(stamp, short = false) {
        const [build, epoch] = this.stamp(stamp);
        const v = this.version(build);
        if (short) return `${v} · E${epoch}`;
        return `Build ${v} · Epoch ${epoch.toLocaleString('en-US')}`;
    },

    /* ── Rendering ───────────────────────────────────────────────────────
       Everything is escaped first and only then given markup, so authored
       text cannot inject anything, and a URL cannot carry markup through
       the link because the link is built from the escaped match. */
    esc(value) {
        return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    URL_PATTERN: /\b(?:cms|news|sector|cosmopedia|fate|seraph|void|null):\/\/[A-Za-z0-9\-._~/]*/g,

    isMailUrl(url) {
        return typeof url === 'string' && new RegExp(`^${this.URL_PATTERN.source}$`).test(url);
    },

    /* `knows(url)` decides whether a URL becomes a link. */
    urlHtml(url, knows) {
        let linkable = false;
        try { linkable = typeof knows === 'function' && !!knows(url); } catch (err) { linkable = false; }
        const e = this.esc(url);
        return linkable
            ? `<button type="button" class="ml-link" data-url="${e}" title="Open in Etherscape">${e}</button>`
            : `<span class="ml-url">${e}</span>`;
    },

    inline(text, knows) {
        let html = this.esc(text);
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(this.URL_PATTERN, (url) => this.urlHtml(url, knows));
        return html;
    },

    renderBody(text, knows) {
        const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/);
        const out = [];
        for (const block of blocks) {
            const trimmed = block.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length >= 6) {
                out.push(`<pre class="ml-pre">${this.esc(trimmed.slice(3, -3).replace(/^\n|\n$/g, ''))}</pre>`);
                continue;
            }
            const lines = trimmed.split('\n');
            if (lines.every((l) => l.startsWith('- '))) {
                out.push(`<ul>${lines.map((l) => `<li>${this.inline(l.slice(2), knows)}</li>`).join('')}</ul>`);
            } else if (lines.every((l) => l.startsWith('> '))) {
                out.push(`<blockquote>${lines.map((l) => this.inline(l.slice(2), knows)).join('<br>')}</blockquote>`);
            } else {
                out.push(`<p>${lines.map((l) => this.inline(l, knows)).join('<br>')}</p>`);
            }
        }
        return out.join('\n');
    },

    /* The URLs a message mentions, body and attachments together. */
    urlsOf(msg) {
        const found = new Set((String(msg.body || '').match(this.URL_PATTERN) || []));
        for (const a of msg.attach || []) if (a.url) found.add(a.url);
        return [...found];
    },

    /* The image slot: assets/mail/<id>.webp. Ids are lowercase slugs. */
    imagePath(id) {
        return `assets/mail/${id}.webp`;
    },
};

/* ── The browser binding ────────────────────────────────────────────────── */
const Mail = (() => {
    'use strict';

    const hasDOM = typeof window !== 'undefined' && typeof document !== 'undefined' &&
        typeof document.createElement === 'function' && typeof document.addEventListener === 'function';

    let fallback = null;
    let away = false;          // transient: the last watch found nobody home

    /* State.mail, validated in place. Every public call goes through here,
       so a hostile save is normalised before anything reads it. */
    function state() {
        if (typeof State === 'undefined' || !State) {
            fallback = MailLogic.normalise(fallback);
            return fallback;
        }
        State.mail = MailLogic.normalise(State.mail);
        return State.mail;
    }

    function save() {
        try { if (typeof State !== 'undefined' && State && typeof State.save === 'function') State.save(); } catch (err) { /* never */ }
    }

    function log(msg) {
        if (typeof ui !== 'undefined' && ui && typeof ui.log === 'function') ui.log(msg);
    }

    function present(now) {
        if (typeof game !== 'undefined' && game && typeof game.isPresent === 'function' && !game.isPresent(now)) return false;
        if (hasDOM && document.hidden) return false;
        return true;
    }

    /* A system dialog or a scene owns the screen; mail waits behind it. */
    function screenBusy() {
        try {
            if (typeof ui === 'undefined' || !ui) return false;
            if (typeof ui.isSystemModalOpen === 'function' && ui.isSystemModalOpen() === true) return true;
            if (typeof ui.isAdversarySceneOpen === 'function' && ui.isAdversarySceneOpen() === true) return true;
        } catch (err) { return false; }
        return false;
    }

    function stampNow(mail, now) {
        const build = typeof State !== 'undefined' ? Number(State.prestigeLevel) || 0 : 0;
        const start = typeof State !== 'undefined' ? Number(State.startTime) : NaN;
        const epoch = Number.isFinite(start) ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
        return [build, epoch, mail.clock];
    }

    function ensureApp(mail) {
        if (!mail.log.length || typeof State === 'undefined' || !Array.isArray(State.unlockedApps)) return false;
        if (State.unlockedApps.includes('mail')) return false;
        State.unlockedApps.push('mail');
        if (typeof ui !== 'undefined' && ui && typeof ui.updateDesktopIcons === 'function') ui.updateDesktopIcons();
        return true;
    }

    function view(fn, ...args) {
        if (typeof MailView !== 'undefined' && MailView && typeof MailView[fn] === 'function') {
            try { MailView[fn](...args); } catch (err) { /* the view never breaks delivery */ }
        }
    }

    /* The watch. Present: the mail clock advances and whatever is due is
       delivered. Away, hidden, or behind a dialog: nothing arrives, and
       what came due waits for the return. Returns the records delivered. */
    function tick({ now = Date.now(), seconds = 1 } = {}) {
        const mail = state();
        ensureApp(mail);
        if (!present(now)) {
            away = true;
            syncChrome(mail);
            return [];
        }
        mail.clock = Math.min(MailLogic.CLOCK_CAP, mail.clock + Math.max(0, Number(seconds) || 0));
        if (screenBusy()) return [];

        const wasAway = away;
        away = false;
        const delivered = typeof State !== 'undefined' ? MailLogic.deliverDue(State, mail, stampNow(mail, now)) : [];
        if (!delivered.length) {
            syncChrome(mail);
            return [];
        }
        ensureApp(mail);

        if (delivered.length > 1 && wasAway) {
            log(`[MAIL] ${delivered.length} messages arrived while you were away. CMS Mail.`);
        } else {
            for (const rec of delivered) {
                const msg = MailCatalog.message(rec.id);
                const from = MailCatalog.sender(msg.from);
                log(`[MAIL] New message from ${from.name}: “${msg.subject}”.`);
            }
        }
        // One cue per batch, never one per message.
        if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx('eventAppear');
        save();
        syncChrome(mail);
        view('onDelivered', delivered);
        return delivered;
    }

    function unreadCount() {
        return MailLogic.unread(state());
    }

    /* The tray envelope: hidden until the first mail, a count while
       anything in Inbox or HR is unread. */
    function syncChrome(mail = state()) {
        if (!hasDOM) return;
        const tray = document.getElementById('tray-mail');
        if (!tray) return;
        const unlocked = typeof State !== 'undefined' && Array.isArray(State.unlockedApps) && State.unlockedApps.includes('mail');
        tray.hidden = !unlocked;
        const count = MailLogic.unread(mail);
        const label = count ? `CMS Mail: ${count} unread` : 'CMS Mail: no unread messages';
        if (tray.getAttribute('aria-label') !== label) {
            tray.setAttribute('aria-label', label);
            tray.title = label;
        }
        tray.classList.toggle('is-unread', count > 0);
        const badge = tray.querySelector('.tray-mail-count');
        const text = count > 99 ? '99+' : String(count);
        if (badge && badge.textContent !== text) badge.textContent = text;
    }

    function reply(id, choice, now = Date.now()) {
        const mail = state();
        const res = MailLogic.reply(mail, id, choice, stampNow(mail, now));
        if (!res.ok) return res;
        /* The relationship moves only through its own function, so its
           per-reason cooldown and its "no relationship before contact" rule
           both hold for mail exactly as for every other act. */
        if (res.nudge && typeof game !== 'undefined' && game && typeof game.nudgeAdversaryStanding === 'function') {
            game.nudgeAdversaryStanding(res.nudge.delta, res.nudge.reason);
        }
        const msg = MailCatalog.message(id);
        log(`[MAIL] Reply sent to ${MailCatalog.sender(msg.from).name}. Filed to Sent.`);
        if (typeof game !== 'undefined' && game && typeof game.sfx === 'function') game.sfx('click');
        save();
        syncChrome(mail);
        return res;
    }

    function move(id, folder) {
        const mail = state();
        const ok = MailLogic.move(mail, id, folder);
        if (ok) { save(); syncChrome(mail); }
        return ok;
    }

    function markRead(id, read = true) {
        const mail = state();
        const ok = MailLogic.markRead(mail, id, read);
        if (ok) { save(); syncChrome(mail); }
        return ok;
    }

    /* Cross-links to the Etherscape browser, a sister app that may not be
       installed. Nothing here assumes it is. */
    function linkable(url) {
        try {
            return typeof Etherscape !== 'undefined' && !!Etherscape &&
                typeof Etherscape.knows === 'function' && !!Etherscape.knows(url);
        } catch (err) {
            return false;
        }
    }

    function openUrl(url) {
        if (!linkable(url)) return false;
        try { Etherscape.open(url); return true; } catch (err) { return false; }
    }

    function renderBody(msg) {
        return MailLogic.renderBody(msg.body, linkable);
    }

    if (hasDOM) {
        setInterval(() => { try { tick(); } catch (err) { /* the watch never breaks the page */ } }, 1000);
    }

    return {
        catalog: MailCatalog,
        logic: MailLogic,
        state,
        tick,
        reply,
        move,
        markRead,
        unreadCount,
        syncChrome,
        linkable,
        openUrl,
        renderBody,
        isAway: () => away,
    };
})();
