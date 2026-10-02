/* ════════════════════════════════════════════════════════════════════════
   Choir — the Created, talking about your work.

   A public status board: recurring accounts with handles and avatars,
   posting about what the Operator actually did. Ship a build and the
   Celestial Times posts the version and channel while mortals quote the
   changelog line that changed their week; let a line go down and its fans
   complain; clear Fate's whole spread and she brags about it.

   ── Four rules this file is built around ────────────────────────────────

   IT ONLY READS. Choir hooks nothing. Every event it reacts to is a diff of
   State it already keeps — the reboot count, the release history, the
   cascade tier, the open SEV-1 tickets, patched flags on the current build,
   Patience wins, the Mirror Login, the endings ledger, achievements — taken
   once a second by its own watch (the way js/media.js files tapes). It
   never writes an economy field, so the golden master cannot move, and the
   simulator never loads it.

   STATE IS AN INDEX INTO CONTENT. A saved post is an id, a kind, a reboot,
   a timestamp and a handful of ids and numbers (an entry id, a ticket
   number, a tier). Persona, template and every word of text are picked
   from the tables below by hashing the post id with the save's seed, so a
   reload reads the same, two saves read differently, and a content edit
   reaches a feed that is already on disk. Never Math.random().

   ABSENCE IS NEVER INTERRUPTED. Same presence rule as Incidents
   (game.isPresent): events that happen while nobody is at the keyboard are
   RECORDED — the diff runs regardless — but nothing is posted until the
   player is back, and then the backlog arrives at once. Ambient chatter
   only accrues on present seconds. Nothing here opens a dialog, plays a
   cue or takes focus; the desktop icon carries an unread count, and that
   is the whole interruption.

   VALIDATION, NOT DEFAULTING. mergeInto does no type checking and
   importSave decodes arbitrary pasted text into State (335f41f). Every
   stored field is checked for its type and enum, and a post that does not
   validate is dropped rather than repaired: a repaired post would describe
   an event that never happened.

   ── Media slot ──────────────────────────────────────────────────────────
   Avatars: assets/choir/<persona id>.webp, square, shown at 40px (80px
   master recommended). Probed once per persona with HEAD and accepted only
   with an image/* content type, because Vite answers a missing file with
   index.html and a 200. With no file the avatar is a struck monogram plate
   in the persona's colours, drawn in CSS.

   ── Etherscape ──────────────────────────────────────────────────────────
   Templates may carry [[url|label]] links into the shared namespace. A link
   renders as a link only when `Etherscape.knows(url)` says the browser can
   open it; otherwise its label is plain text. The browser is a sister app
   and may not be installed at all.
   ════════════════════════════════════════════════════════════════════════ */

/* ── The accounts ────────────────────────────────────────────────────────
   `reach` scales a post's Hallelujahs (a news desk is read more than a
   Throne). `mark` is the monogram on the fallback avatar plate. */
const ChoirPersonas = {
    times:        { name: 'The Celestial Times', handle: 'celestial_times', role: 'Release desk', mark: 'CT', reach: 40 },
    sector7g:     { name: 'Sector 7G Status', handle: 'sector7g_status', role: 'Automated feed', mark: '7G', reach: 12 },
    vesper:       { name: 'Vesper', handle: 'vesper.seraph', role: 'Seraph, Third Choir', mark: 'V', reach: 22 },
    throne:       { name: 'THRONE-0417', handle: 't0417', role: 'Throne, Conversion Floor B', mark: 'T', reach: 6 },
    agnes:        { name: 'Agnes Pell', handle: 'agnes_prays', role: 'Mortal, Low Hills parish', mark: 'AP', reach: 9 },
    dale:         { name: 'Dale', handle: 'dale_notices', role: 'Mortal, keeps a sky notebook', mark: 'D', reach: 14 },
    hr:           { name: 'CMS Human Resources', handle: 'cms_hr', role: 'Official account', mark: 'HR', reach: 18 },
    instructor:   { name: 'The Instructor', handle: 'cms_orientation', role: 'Operator Orientation', mark: 'I', reach: 10 },
    pip:          { name: 'pip', handle: 'wake_up_cherubs', role: 'Cherub, unaffiliated', mark: 'p', reach: 7 },
    fate:         { name: 'Fate', handle: 'thehouse', role: 'Hostess, Patience.exe', mark: 'F', reach: 55 },
    nulloperator: { name: 'OPERATOR', handle: '0perator', role: 'unverified', mark: 'O', reach: 13 },
    halvard:      { name: 'Dominion Halvard', handle: 'dominion_halvard', role: 'Dominion, Strategic Office', mark: 'DH', reach: 16 },
    fanclub:      { name: 'Seraph Appreciation Society', handle: 'seraphfans', role: 'Fan board, est. before time', mark: 'SAS', reach: 25 },
    operator:     { name: 'OPERATOR', handle: 'operator', role: 'Sector 7G, on shift', mark: 'OP', reach: 20, player: true },
};

/* The Etherscape namespace. A template may only link inside it. */
const ChoirLinkRoots = [
    'news://celestial-times', 'sector://7g/status', 'cosmopedia://', 'fate://casino',
    'seraph://fanpage', 'void://forum', 'null://', 'cms://intranet',
];

/* ── Kinds ───────────────────────────────────────────────────────────────
   What a post of each kind may store (`x`, validated field by field) and
   which template variables it can resolve (`vars`). A template that names
   a variable its kind does not list fails tests/choir.mjs. */
const ChoirKinds = {
    'welcome':                { x: {}, vars: [] },
    'ship.news':              { x: { lv: 'level', ch: 'channel', n: 'count', q: 'count' }, vars: ['version', 'channel', 'count', 'issues'] },
    'ship.react.improvement': { x: { lv: 'level', e: 'entry' }, vars: ['version', 'note', 'pct'] },
    'ship.react.issue':       { x: { lv: 'level', e: 'entry' }, vars: ['version', 'note', 'pct'] },
    'ship.react.regression':  { x: { lv: 'level', e: 'entry' }, vars: ['version', 'note', 'pct'] },
    'ship.react.deprecation': { x: { lv: 'level', e: 'entry' }, vars: ['version', 'note', 'pct'] },
    'ship.dirty':             { x: { lv: 'level', e: 'entry' }, vars: ['version', 'note'] },
    'ship.cert':              { x: { p: 'branch' }, vars: ['path'] },
    'ship.unlock':            { x: { ch: 'channel' }, vars: ['channel'] },
    'ship.null':              { x: { lv: 'level', n: 'count' }, vars: ['version', 'reboot'] },
    'replay.news':            { x: { lv: 'level', src: 'source' }, vars: ['version', 'source'] },
    'replay.null':            { x: { lv: 'level', src: 'source' }, vars: ['version', 'source'] },
    'replay.mortal':          { x: { lv: 'level', src: 'source' }, vars: ['version', 'source'] },
    'cascade.status':         { x: { t: 'tier' }, vars: ['tierLabel'] },
    'cascade.react':          { x: { t: 'tier' }, vars: ['tierLabel'] },
    'outage':                 { x: { line: 'line', s: 'sector', n: 'ticket' }, vars: ['line', 'sector', 'ticket', 'resource'] },
    'patch':                  { x: { lv: 'level', e: 'entry' }, vars: ['version', 'note'] },
    'patience':               { x: { w: 'count' }, vars: ['wins'] },
    'mirror.null':            { x: { c: 'choice' }, vars: [] },
    'mirror.voice':           { x: {}, vars: [] },
    'ending.hr':              { x: { band: 'band' }, vars: ['title'] },
    'ending.voice':           { x: { band: 'band' }, vars: ['title'] },
    'ach':                    { x: { id: 'ach' }, vars: ['ach', 'flavor'] },
    'ach.secret':             { x: { id: 'ach' }, vars: ['ach', 'flavor'] },
    'ambient.base':           { x: { i: 'count' }, vars: [] },
    'ambient.null':           { x: { i: 'count' }, vars: [] },
    'ambient.fate':           { x: { i: 'count' }, vars: [] },
    'status':                 { x: { m: 'milestone', o: 'option', lv: 'level' }, vars: ['version'] },
};

/* ── The content ─────────────────────────────────────────────────────────
   Each pool is a list of { p: persona, t: text, when?, r?: replies }.
   `when` pins a template to stored fields (a tier, a line, a band); `r` is a
   thread, [persona, text] pairs, 2–4 deep. Text takes {variables} and
   [[url|label]] links. Changelog notes are quoted verbatim, “like this”.

   Voice: an early-2000s status board. Mortals type the way people type;
   the officials type the way officials type; nobody explains the joke. */
const ChoirContent = {
    'welcome': [
        { p: 'hr', t: 'Choir is now available to all Operators. Choir is where the Created share how the current build is treating them. Operator posting is limited to approved status updates; blessing is unlimited. Acceptable use: [[cms://intranet|CMS intranet]], section 40.',
          r: [['vesper', 'Approved status updates. So, none of mine.'], ['hr', 'Vesper, please check your inbox.'], ['vesper', 'I have read my inbox. It is also an approved status update.']] },
    ],

    'ship.news': [
        { p: 'times', t: 'RELEASE: CosmOS v{version} is live on the {channel} channel. {count} changelog entries, {issues} known. Full notes at [[news://celestial-times|The Celestial Times]].' },
        { p: 'times', t: 'Overnight, Sector 7G rebooted onto reality v{version} ({channel}). The changelog runs to {count} lines. Known issues: {issues}. [[news://celestial-times|Release desk]]' },
        { p: 'times', t: 'SHIPPED: v{version}, {channel} channel. Operators describe the build as stable, which Operators always do. {issues} known issues out of {count} entries. [[news://celestial-times|Read the notes]]',
          r: [['dale', 'they always say stable'], ['throne', 'Stable is a measurement. I will take it.']] },
    ],

    'ship.react.improvement': [
        { p: 'dale', t: 'did the sky get {pct}% shinier?? new build notes say “{note}” and honestly I believe it' },
        { p: 'dale', t: 'Noticed something different this morning so I went and checked the board. “{note}” Knew it. Writing it in the notebook.' },
        { p: 'agnes', t: 'Prayed for better and the release notes say “{note}” Thank you to whoever is on shift.' },
        { p: 'throne', t: '“{note}” Measured it. Confirmed it. This is the best thing that has happened to me.' },
        { p: 'fanclub', t: 'NEW BUILD THREAD (v{version}). Our headline: “{note}” Discuss below. Be civil.',
          r: [['vesper', 'Nobody asked us.'], ['agnes', 'I think it sounds lovely.'], ['fanclub', 'Thread pinned for being lovely.']] },
        { p: 'vesper', t: '“{note}” They have recompiled us again. I can feel it in the second verse.' },
    ],
    'ship.react.issue': [
        { p: 'agnes', t: 'Is anyone else\'s prayer bouncing? The board says “{note}” so I suppose that\'s it. Praying anyway.' },
        { p: 'dale', t: 'known issue on v{version}: “{note}” they KNOW. it\'s in writing. they shipped it anyway' },
        { p: 'pip', t: '“{note}” Known issue. KNOWN. Known by whom? Since when? Ask yourself why it\'s in the notes at all. [[void://forum|More on the forum.]]',
          r: [['dale', 'pip it\'s in the notes because they wrote it down'], ['pip', 'That\'s what they want you to think.']] },
        { p: 'throne', t: '“{note}” This is a known issue. I have filed it under inefficiency, where it belongs.' },
        { p: 'vesper', t: 'Working a build with “{note}” in the notes. We are told the Operator will patch it. We are told a lot of things.' },
    ],
    'ship.react.regression': [
        { p: 'dale', t: 'ok who broke it. “{note}” it was FINE last build' },
        { p: 'pip', t: 'Regression, they call it. “{note}” Something going backwards on purpose isn\'t a regression. It\'s a direction.' },
        { p: 'agnes', t: '“{note}” I don\'t know what this means but I have added it to my list.' },
    ],
    'ship.react.deprecation': [
        { p: 'agnes', t: 'They\'ve deprecated something again. “{note}” My grandmother used that.' },
        { p: 'halvard', t: '“{note}” A bold consolidation. Strategic Office supports it completely, from a distance.' },
        { p: 'dale', t: '“{note}” you can\'t just DEPRECATE things',
          r: [['halvard', 'One can, in fact.'], ['dale', 'well you SHOULDN\'T']] },
    ],

    'ship.dirty': [
        { p: 'vesper', t: 'v{version} went out the door with “{note}” still open. Filed once, carried forever. I keep a list too.' },
        { p: 'pip', t: 'Funny how “{note}” shipped unpatched on v{version}. Nobody fixes what they put there on purpose.' },
        { p: 'throne', t: 'v{version} shipped with “{note}” unpatched. I have recalculated my expectations downward. Permanently.' },
    ],

    'ship.cert': [
        { p: 'throne', t: 'This shift is certified on {path}. I have adjusted. I am always adjusting.' },
        { p: 'halvard', t: 'Strategic Office notes the Operator has certified on {path}. A direction. Directions are what we are for.' },
        { p: 'instructor', t: 'Reminder: certification is chosen once per reboot. This shift it is {path}. Mandates on the other branches are dormant, not lost.' },
    ],

    'ship.unlock': [
        { p: 'instructor', when: { ch: 'beta' }, t: 'Your console is now cleared for the {channel} channel. More improvements, more known issues, and 1.4 times the Divinity at the ship. Read the notes before you pick it.' },
        { p: 'instructor', when: { ch: 'nightly' }, t: '{channel} is open to you. Nightly builds break in interesting ways and pay 2.2 times the Divinity. Interesting is not a compliment.' },
        { p: 'hr', when: { ch: 'archived' }, t: 'Archive access granted. You may now replay a past build from the release history. {channel} replays pay no Divinity. Records will be kept, by someone.',
          r: [['nulloperator', 'By someone.'], ['hr', 'Please do not reply to HR announcements.']] },
        { p: 'hr', t: 'Congratulations, Operator. Your clearance now includes the {channel} release channel. With clearance comes responsibility. Mostly yours.' },
    ],

    'ship.null': [
        { p: 'nulloperator', t: 'Shipped another one. v{version}. I\'d have shipped it the same way. I did, once.' },
        { p: 'nulloperator', t: 'Reboot {reboot}. You keep a count. So do I.' },
        { p: 'nulloperator', t: 'New build, same Operator. Nobody on this board can tell us apart.',
          r: [['dale', 'wait which one of you is the real one'], ['nulloperator', 'Yes.']] },
    ],

    'replay.news': [
        { p: 'times', t: 'FROM THE ARCHIVE: Sector 7G is replaying v{version}, originally a {source} build. No Divinity will be paid. [[news://celestial-times|Archive desk]]' },
        { p: 'times', t: 'Reality v{version} is running again, re-released from the archive. It shipped the first time on {source}. Expect the same changelog. [[news://celestial-times|Release history]]' },
    ],
    'replay.null': [
        { p: 'nulloperator', t: 'You went back to v{version}. I was hoping you would. Check the margins.' },
        { p: 'nulloperator', t: 'v{version} again. You missed things the first time. I didn\'t.' },
    ],
    'replay.mortal': [
        { p: 'dale', t: 'the sky looks exactly like it did ages ago?? like EXACTLY like v{version}. am I losing it' },
        { p: 'agnes', t: 'Everything is the way it was, back on v{version}. I\'m told this is on purpose. I put the old curtains back up.' },
    ],

    'cascade.status': [
        { p: 'sector7g', when: { t: 1 }, t: '{tierLabel}: instability in Sector 7G above threshold. Production throttled to 60%. Operator notified. [[sector://7g/status|sector://7g/status]]' },
        { p: 'sector7g', when: { t: 2 }, t: '{tierLabel}: Sector 7G production at 30%. The release award is reduced while this holds. [[sector://7g/status|Live status]]' },
        { p: 'sector7g', when: { t: 3 }, t: '{tierLabel}. Sector 7G production at 10%. A build shipped in this state pays nothing. [[sector://7g/status|Live status]]',
          r: [['halvard', 'Strategic Office is aware and has scheduled a meeting about it.'], ['pip', 'The meeting is the cascade.']] },
    ],
    'cascade.react': [
        { p: 'dale', when: { t: 1 }, t: 'lights flickering over the low hills. anyone else? notebook says this is new' },
        { p: 'throne', when: { t: 1 }, t: 'Throughput down. I did not do it. I would like that recorded.' },
        { p: 'agnes', when: { t: 2 }, t: 'Prayers are taking a long time to go up today. Should I be worried. I am a little worried.' },
        { p: 'vesper', when: { t: 2 }, t: 'We are singing at a reduced rate. Nobody tells us why. The sky has a hum in it.' },
        { p: 'pip', when: { t: 3 }, t: 'COLLAPSE. Read that again. They let it get to collapse. [[void://forum|The forum called this.]]' },
        { p: 'agnes', when: { t: 3 }, t: 'The sky went quiet. Not peaceful quiet. Lighting every candle I own.' },
    ],

    'outage': [
        { p: 'fanclub', when: { line: 'seraph' }, t: '{ticket}: the Seraph line is on the backup choir, a quarter strength, Sector {sector}. We are heartbroken and we are organising. [[seraph://fanpage|Fan page]]',
          r: [['vesper', 'Please do not organise.'], ['fanclub', 'We have already organised.']] },
        { p: 'vesper', when: { line: 'seraph' }, t: '{ticket}. They have put us on the backup choir. A quarter of us, singing for all of us. Nobody asked the quarter.' },
        { p: 'throne', when: { line: 'throne' }, t: '{ticket}. Conversion floor at 25%. I am standing very still in protest. It is indistinguishable from work.' },
        { p: 'agnes', when: { line: 'throne' }, t: 'My offering went in and nothing came back. {line} is down, apparently. Sector {sector}. I left it on the step.' },
        { p: 'pip', when: { line: 'cherub' }, t: 'Cherub line down in Sector {sector}. Official cause: a fault. Real cause: ask who benefits from fewer Souls. {ticket}' },
        { p: 'dale', when: { line: 'cherub' }, t: 'souls coming in slow?? {ticket} says the {line} is on backup. sector {sector}. that\'s my sector' },
        { p: 'pip', when: { line: 'wraith' }, t: 'Void line down: {line}. They\'ll tell you the Void doesn\'t have fans. The Void has fans. {ticket}' },
        { p: 'dale', when: { line: 'revenant' }, t: 'something in the dark stopped chewing?? {line}, apparently. sector {sector}. {ticket}' },
        { p: 'pip', when: { line: 'phantom' }, t: '{ticket}: {line} down. Echoes stopped. Ask yourself what was in the echoes. [[void://forum|void://forum]]' },
        { p: 'agnes', t: 'My candle went out the moment the {line} went down. I am not saying it is connected. {ticket}, Sector {sector}.' },
    ],

    'patch': [
        { p: 'dale', t: 'they patched it!! “{note}” is GONE from the board. the difference is enormous. or at least noticeable' },
        { p: 'agnes', t: 'Someone fixed “{note}” today. I said a prayer for them. It went up first time.' },
        { p: 'times', t: 'HOTFIX: v{version} patched in place. Removed from known issues: “{note}” [[news://celestial-times|Release desk]]' },
        { p: 'throne', t: '“{note}” patched. Efficiency restored. I would like to thank nobody in particular, efficiently.' },
    ],

    'patience': [
        { p: 'fate', t: 'Somebody cleared my whole spread tonight. Every card. That makes {wins}. The house is delighted, and only slightly less rich. [[fate://casino|Patience.exe, open all hours]]',
          r: [['vesper', 'We are on those cards, you know.'], ['fate', 'Darling, everyone is on my cards.']] },
        { p: 'fate', t: 'A full clear at my table. The Operator plays like they\'ve read the deck. I\'ll shuffle harder. [[fate://casino|Come and watch]]' },
        { p: 'fate', t: 'Full clears at Patience.exe: {wins}. I keep a ledger. I keep everyone\'s ledger. [[fate://casino|fate://casino]]',
          r: [['nulloperator', 'Not everyone\'s.'], ['fate', 'Especially yours, sweetheart.']] },
    ],

    'mirror.null': [
        { p: 'nulloperator', when: { c: 'OP-A' }, t: 'Logged in. Some of you will recognise me. I\'m the Operator. The other one. Apparently I\'m not welcome. Noted.' },
        { p: 'nulloperator', when: { c: 'OP-B' }, t: 'Hello, Choir. Long-time listener. I\'m on shift now. Well. One of us is.' },
        { p: 'nulloperator', when: { c: 'OP-C' }, t: 'Back on the board. They let me keep the handle. Funny how that works.' },
        { p: 'nulloperator', t: 'First post. Not my first shift.' },
    ],
    'mirror.voice': [
        { p: 'pip', t: 'Two OPERATOR accounts. Same name. One unverified. I have been saying this for eons. [[null://|null://]]' },
        { p: 'hr', t: 'HR is aware of an account presenting as the Operator. Please do not bless it. Please do not reply to it. Please do not look at it for long.',
          r: [['nulloperator', 'I filled out the form.'], ['hr', 'There is no form.'], ['nulloperator', 'There is now.']] },
    ],

    'ending.hr': [
        { p: 'hr', when: { band: 'hostile' }, t: 'The account @0perator has been closed at the Operator\'s request. Process void_mirror.service#2 ended. Title updated: {title}.' },
        { p: 'hr', when: { band: 'curious' }, t: 'Rota updated: two Operators on Sector 7G. Title updated: {title}. HR is still looking for a form that covers this.' },
        { p: 'hr', when: { band: 'complicit' }, t: 'The Operator has been archived with honours. Title updated: {title}. The console is in good hands. The same hands, technically.' },
    ],
    'ending.voice': [
        { p: 'vesper', when: { band: 'hostile' }, t: 'There is a quiet in the second verse that wasn\'t there yesterday. I don\'t mind it.' },
        { p: 'nulloperator', when: { band: 'curious' }, t: 'Co-maintenance. I get Tuesdays. You get the paperwork.' },
        { p: 'nulloperator', when: { band: 'complicit' }, t: 'I have the shift. Hello, Choir. Nothing changes. That was the point.',
          r: [['dale', 'something changed. I can\'t say what'], ['nulloperator', 'Write it in the notebook.']] },
    ],

    'ach': [
        { p: 'hr', t: 'Congratulations to the Operator on “{ach}”. {flavor}' },
        { p: 'instructor', t: 'Achievement filed: {ach}. Keep it up, or at least keep it on file.' },
        { p: 'halvard', t: '“{ach}.” Strategic Office will mention this in the quarterly.' },
    ],
    'ach.secret': [
        { p: 'pip', t: 'The Operator just got “{ach}” and it isn\'t on any list I\'ve seen. {flavor} Think about it.' },
    ],

    'ambient.base': [
        { p: 'throne', t: 'Conversion cycle complete. Starting conversion cycle.' },
        { p: 'throne', t: 'Another quiet hour on Floor B. Throughput nominal. I have nothing to add. I have added it.' },
        { p: 'vesper', t: 'Sang the morning hymn four thousand times today. Somewhere around the two-thousandth I wondered who it was for. Finished it anyway. That is the job.' },
        { p: 'vesper', t: 'Is there a word for knowing the next verse before it is written. Asking for a choir.',
          r: [['pip', 'The word is SURVEILLANCE.'], ['vesper', 'Thank you, pip.']] },
        { p: 'agnes', t: 'Lit a candle for the Operator. Whoever you are, you look tired.' },
        { p: 'agnes', t: 'Prayer request: rain on Thursday, not Wednesday. Wednesday is laundry.',
          r: [['throne', 'Rain is not my department.'], ['agnes', 'Then whose is it?'], ['hr', 'Please route weather requests through the intranet.']] },
        { p: 'dale', t: 'sky\'s been very steady this week. suspicious. good, but suspicious' },
        { p: 'dale', t: 'looked it up: [[cosmopedia://sector-7g|cosmopedia]] says Sector 7G has failed an integrity check every night since records began. so that\'s normal then' },
        { p: 'hr', t: 'Reminder: the break room is a metaphor. Please do not leave anything in it.' },
        { p: 'hr', t: 'Operator wellness check: you have been on shift since the beginning of time. That is great. Keep it up.' },
        { p: 'instructor', t: 'Tip: a vault at capacity is production thrown away. Watch the bar, not the number.' },
        { p: 'instructor', t: 'Tip: a false alarm reads wrong if you read it. Check who filed the ticket before you pay it off.' },
        { p: 'instructor', t: 'Tip: patching a known issue relieves instability, but not all of it. You can climb out of a cascade. You cannot leap.' },
        { p: 'pip', t: 'Why are there four ranks of automaton and only one sector anyone talks about. Think. [[void://forum|void://forum]]' },
        { p: 'pip', t: 'Cherubs don\'t sleep. That isn\'t a fun fact. That\'s a policy.' },
        { p: 'halvard', t: 'Strategic Office has reviewed the cosmos and found it largely in order.' },
        { p: 'halvard', t: 'Dominions do not produce. Dominions enable. Please stop asking me what I make.',
          r: [['throne', 'What do you make.'], ['halvard', 'Decisions.']] },
        { p: 'fanclub', t: 'Weekly reminder: the Seraph line has never missed a hymn unless something broke. Show them some love. [[seraph://fanpage|Fan page]]' },
        { p: 'times', t: 'WEATHER: clear over the primordial sector, overcast in the Void, a light drizzle of Praise toward evening. [[news://celestial-times|Forecast]]' },
        { p: 'times', t: 'EXPLAINER: what is a Reality Build, and why does it keep changing? [[cosmopedia://reality-builds|Cosmopedia has the answer]]' },
    ],
    'ambient.null': [
        { p: 'nulloperator', t: 'Read your post history. You type like me. Or I type like you. Hard to say from here.' },
        { p: 'nulloperator', t: 'The automatons can\'t tell us apart. Neither can HR. [[null://|null://]]' },
        { p: 'nulloperator', t: 'Nice day for maintenance. Every day is. That\'s the trap.',
          r: [['vesper', 'Which one of you is this.'], ['nulloperator', 'The one who answered.']] },
    ],
    'ambient.fate': [
        { p: 'fate', t: 'Cards dealt, felt warm, house edge a rumour. [[fate://casino|Patience.exe]]' },
        { p: 'fate', t: 'Three rounds an hour pay in full. After that, darling, you\'re playing for love.' },
        { p: 'fate', t: 'Every automaton in my deck is somebody\'s coworker. Play kindly.' },
    ],
};

/* The Operator's canned statuses. Three per milestone, always in the same
   order: [the one that holds the line, the one that reports, the one that
   shares the credit]. The standing nudge is in Choir.STATUS_NUDGE, by index,
   and goes through game.nudgeAdversaryStanding's own per-reason cooldown. */
const ChoirStatuses = {
    ship: [
        { t: 'Shipped v{version}. Every open issue on it is mine, and I\'ll close them myself.' },
        { t: 'v{version} is live. Notes are on the board. Back to work.' },
        { t: 'Shipped v{version}. Some of these fixes weren\'t my idea. Credit where it\'s due.',
          r: [['nulloperator', 'Credit noted.']] },
    ],
    replay: [
        { t: 'Reopened v{version} to see what was done to it. Taking notes.' },
        { t: 'Replaying v{version}. The archive is quiet this time of night.' },
        { t: 'Replaying v{version}, reading the annotations. He isn\'t wrong about all of it.',
          r: [['nulloperator', 'I\'m not wrong about any of it.']] },
    ],
    mirror: [
        { t: 'Somebody logged in as me today. Access revoked.',
          r: [['hr', 'Thank you, Operator. HR has noted your preference.']] },
        { t: 'Met the previous shift. Still processing.' },
        { t: 'Turns out I\'ve been on the rota twice. Good to meet me.',
          r: [['nulloperator', 'Likewise.']] },
    ],
    ending: [
        { t: 'One Operator on this shift. That is how it stays.' },
        { t: 'Handover complete. The rota has two names on it now.' },
        { t: 'Signing off. He has the console. Be nice to him.',
          r: [['agnes', 'We will. Thank you for everything.']] },
    ],
};

const Choir = (() => {
    'use strict';

    const FEED_CAP = 300;            // posts kept; oldest out first
    const PENDING_CAP = 60;          // events held for a player who is away
    const AMBIENT_SECONDS = 240;     // present seconds between ambient posts
    const QUIET_MS = 120000;         // ...and only once the board has been quiet this long
    const ACH_PER_PASS = 3;          // achievement posts per watch pass
    const SHIP_BACKFILL = 3;         // reboots posted when several land in one pass
    const OUTAGE_MEMORY = 24;        // SEV-1 tickets remembered
    const STATUS_NUDGE = [-1, 0, 1];
    const STATUS_REASON = 'posted a status';
    const MILESTONES = ['ship', 'replay', 'mirror', 'ending'];
    const BRANCHES = ['creation', 'maintenance', 'entropy'];
    const BANDS = ['hostile', 'curious', 'complicit'];
    const CHOICES = ['OP-A', 'OP-B', 'OP-C'];
    const SOURCES = ['stable', 'beta', 'nightly'];
    const LINES = ['seraph', 'throne', 'cherub', 'wraith', 'revenant', 'phantom'];
    const LINE_LABELS = {
        seraph: ['Seraph line', 'Praise'], throne: ['Throne line', 'Offerings'], cherub: ['Cherub line', 'Souls'],
        wraith: ['Wraith line', 'Darkness'], revenant: ['Revenant line', 'Shadows'], phantom: ['Phantom line', 'Echoes'],
    };
    const BRANCH_LABELS = { creation: 'Creation', maintenance: 'Maintenance', entropy: 'Entropy' };
    const TITLES = { hostile: 'Sole Operator', curious: 'Co-Operator', complicit: 'Operator Emeritus' };
    const ID_RE = /^[A-Za-z0-9:/._#-]{1,80}$/;
    const LINK_RE = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;
    const VAR_RE = /\{([a-zA-Z]+)\}/g;

    const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
    const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

    /* ── Hashing ────────────────────────────────────────────────────────
       FNV-1a, then a murmur finaliser. Content selection only. */
    function hash(str) {
        let h = 0x811C9DC5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
        return (h ^ (h >>> 16)) >>> 0;
    }

    /* ── Field validators, by type name in ChoirKinds ─────────────────── */
    function channels() {
        return typeof RealityChannels !== 'undefined' ? Object.keys(RealityChannels) : ['stable', 'beta', 'nightly', 'archived'];
    }
    function entryById(id) {
        if (typeof id !== 'string' || typeof RealityPool === 'undefined') return null;
        const lists = [['improvement', RealityPool.improvements], ['issue', RealityPool.issues],
            ['regression', RealityPool.regressions], ['deprecation', RealityPool.deprecations]];
        for (const [kind, list] of lists) {
            const e = (list || []).find((x) => x.id === id);
            if (e) return { ...e, kind };
        }
        const opening = typeof Reality !== 'undefined' ? Reality.OPENING_BUILD.entries.find((e) => e.id === id) : null;
        return opening ? { ...opening } : null;
    }
    function achievement(id) {
        if (typeof AchievementList === 'undefined' || typeof id !== 'string') return null;
        return AchievementList.find((a) => a.id === id) || null;
    }
    const FIELD = {
        level: (v) => int(v, 0, 1000000),
        count: (v) => int(v, 0, 1e9),
        ticket: (v) => int(v, 1, 1e9),
        tier: (v) => int(v, 1, 3),
        option: (v) => int(v, 0, 2),
        channel: (v) => (channels().includes(v) ? v : null),
        source: (v) => (SOURCES.includes(v) ? v : null),
        branch: (v) => (BRANCHES.includes(v) ? v : null),
        band: (v) => (BANDS.includes(v) ? v : null),
        line: (v) => (LINES.includes(v) ? v : null),
        milestone: (v) => (MILESTONES.includes(v) ? v : null),
        sector: (v) => (typeof v === 'string' && /^[0-9A-Z]{2,3}$/.test(v) ? v : null),
        entry: (v) => (entryById(v) ? v : null),
        ach: (v) => (typeof v === 'string' && /^ACH-[A-Z0-9-]{1,12}$/.test(v) ? v : null),
        // The Mirror Login choice is optional: a scene resolved headlessly has none.
        choice: (v) => (CHOICES.includes(v) ? v : null),
    };
    const OPTIONAL = new Set(['choice']);

    /* A post's stored fields, validated against its kind. Null drops it. */
    function cleanX(kind, raw) {
        const spec = ChoirKinds[kind];
        if (!spec) return null;
        const src = plain(raw) ? raw : {};
        const out = {};
        for (const [key, type] of Object.entries(spec.x)) {
            const v = FIELD[type](src[key]);
            if (v === null) {
                if (OPTIONAL.has(type)) continue;
                return null;
            }
            out[key] = v;
        }
        return out;
    }

    function cleanPost(raw, now, { pending = false } = {}) {
        if (!plain(raw)) return null;
        if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
        if (typeof raw.k !== 'string' || !has(ChoirKinds, raw.k)) return null;
        const x = cleanX(raw.k, raw.x);
        if (!x) return null;
        const r = int(raw.r, 0, 1000000);
        if (r === null) return null;
        // `c`: NULL.OPERATOR was on the board when this was recorded. His
        // replies in a thread show only where he could have written them.
        const post = { id: raw.id, k: raw.k, r, x, c: raw.c === 1 ? 1 : 0 };
        if (!pending) {
            post.at = Number.isFinite(raw.at) && raw.at >= 0 ? Math.min(raw.at, now) : null;
            if (post.at === null) return null;
            post.ep = Number.isFinite(raw.ep) && raw.ep >= 0 ? Math.floor(raw.ep) : 0;
            post.b = [0, 1, 2].includes(raw.b) ? raw.b : 0;
        }
        return post;
    }

    function defaults() {
        return {
            seed: 0, posts: [], pending: [], wm: freshWatermarks(),
            lastReadAt: 0, offer: null, blessings: 0, amb: 0, ambN: 0,
        };
    }

    function freshWatermarks() {
        return {
            init: false, reboot: 0, cascade: { r: 0, t: 0 }, out: [], patch: { r: 0, ids: [] },
            wins: 0, mirror: false, end: 0, ach: [],
        };
    }

    /* Every field by type and range. Nothing here throws. */
    function normalise(now = Date.now()) {
        if (typeof State === 'undefined') return defaults();
        if (!plain(State.choir)) State.choir = defaults();
        const s = State.choir;
        s.seed = int(s.seed, 1, 0xFFFFFFFF) ?? 0;

        const seen = new Set();
        const keep = (list, opts) => {
            const out = [];
            for (const raw of Array.isArray(list) ? list : []) {
                const p = cleanPost(raw, now, opts);
                if (!p || seen.has(p.id)) continue;
                seen.add(p.id);
                out.push(p);
            }
            return out;
        };
        s.posts = keep(s.posts, {}).slice(-FEED_CAP);
        s.pending = keep(s.pending, { pending: true }).slice(-PENDING_CAP);

        const w = plain(s.wm) ? s.wm : {};
        const fresh = freshWatermarks();
        fresh.init = w.init === true;
        fresh.reboot = int(w.reboot, 0, 1000000) ?? 0;
        if (plain(w.cascade)) {
            fresh.cascade = { r: int(w.cascade.r, 0, 1000000) ?? 0, t: int(w.cascade.t, 0, 3) ?? 0 };
        }
        fresh.out = Array.isArray(w.out)
            ? [...new Set(w.out.filter((n) => int(n, 1, 1e9) !== null))].slice(-OUTAGE_MEMORY) : [];
        if (plain(w.patch)) {
            fresh.patch = {
                r: int(w.patch.r, 0, 1000000) ?? 0,
                ids: Array.isArray(w.patch.ids) ? [...new Set(w.patch.ids.filter((id) => FIELD.entry(id)))] : [],
            };
        }
        fresh.wins = int(w.wins, 0, 1e9) ?? 0;
        fresh.mirror = w.mirror === true;
        fresh.end = int(w.end, 0, 1000) ?? 0;
        fresh.ach = Array.isArray(w.ach) ? [...new Set(w.ach.filter((id) => FIELD.ach(id)))].slice(0, 500) : [];
        s.wm = fresh;

        s.lastReadAt = Number.isFinite(s.lastReadAt) && s.lastReadAt >= 0 ? Math.min(s.lastReadAt, now) : 0;
        s.blessings = int(s.blessings, 0, 1e9) ?? 0;
        s.amb = Number.isFinite(s.amb) && s.amb >= 0 ? Math.min(s.amb, AMBIENT_SECONDS) : 0;
        s.ambN = int(s.ambN, 0, 1e9) ?? 0;
        if (plain(s.offer) && typeof s.offer.e === 'string' && ID_RE.test(s.offer.e) &&
            MILESTONES.includes(s.offer.m) && int(s.offer.lv, 0, 1000000) !== null) {
            s.offer = { e: s.offer.e, m: s.offer.m, lv: s.offer.lv };
            // An offer already answered is not an offer.
            if (s.posts.some((p) => p.id === `st:${s.offer.e}`)) s.offer = null;
        } else {
            s.offer = null;
        }
        return s;
    }

    let checked = null;
    function state(now = Date.now()) {
        if (typeof State === 'undefined') return defaults();
        const s = State.choir;
        if (s !== checked || !s || !Array.isArray(s.posts) || !Array.isArray(s.pending) || !plain(s.wm)) {
            checked = normalise(now);
            return checked;
        }
        return s;
    }

    /* ── Reading the world ──────────────────────────────────────────────
       Each read validates what it takes; this file must not trust State any
       more than the normalisers that own those fields do. */
    const read = {
        level: () => int(State.prestigeLevel, 0, 1000000) ?? 0,
        build: () => (plain(State.reality?.build) ? State.reality.build : null),
        tier: () => int(State.reality?.cascadeTier, 0, 3) ?? 0,
        outages() {
            const open = Array.isArray(State.incidents?.open) ? State.incidents.open : [];
            const out = [];
            for (const inc of open) {
                if (!plain(inc) || inc.severity !== 1 || typeof inc.id !== 'string') continue;
                const m = /^INC-(\d{1,9})$/.exec(inc.id);
                if (!m) continue;
                const tpl = typeof IncidentTemplates !== 'undefined'
                    ? IncidentTemplates.find((t) => t.id === inc.template) : null;
                const line = FIELD.line(tpl?.line);
                if (!line) continue;
                out.push({ n: Number(m[1]), line, s: FIELD.sector(inc.sector) || '7G' });
            }
            return out;
        },
        patched() {
            const b = read.build();
            return (Array.isArray(b?.entries) ? b.entries : [])
                .filter((e) => plain(e) && e.patched === true && FIELD.entry(e.id)).map((e) => e.id);
        },
        wins: () => int(State.casino?.solitaire?.wins, 0, 1e9) ?? 0,
        mirror: () => State.adversary?.sceneCompleted === true,
        endings: () => (Array.isArray(State.endings?.history)
            ? State.endings.history.filter((e) => plain(e) && BANDS.includes(e.ending)) : []),
        achievements: () => (plain(State.achievements)
            ? Object.keys(State.achievements).filter((id) => FIELD.ach(id) && achievement(id)) : []),
        endingWorn() {
            try { return typeof game !== 'undefined' && typeof game.endingWorn === 'function' ? game.endingWorn() : null; } catch (e) { return null; }
        },
        history(reboot) {
            const list = Array.isArray(State.reality?.history) ? State.reality.history : [];
            return list.find((r) => plain(r) && r.reboot === reboot) || null;
        },
    };

    /* Is NULL.OPERATOR on the board? After the Mirror Login, until a hostile
       ending patches him out. */
    function voice() {
        return read.mirror() && read.endingWorn() !== 'hostile' ? 1 : 0;
    }

    function present(now) {
        try {
            return typeof game === 'undefined' || typeof game.isPresent !== 'function' || game.isPresent(now) === true;
        } catch (e) { return true; }
    }

    function epochAt(now) {
        const start = Number(State.startTime);
        return Number.isFinite(start) && start > 0 && start <= now ? Math.floor((now - start) / 1000) : 0;
    }

    /* Where the watch starts from. Everything already true is history, not
       news: a save that predates Choir must not wake to a hundred posts. */
    function baseline(s, level) {
        const w = s.wm;
        w.reboot = level;
        w.cascade = { r: level, t: read.tier() };
        w.out = [...new Set([...w.out, ...read.outages().map((o) => o.n)])].slice(-OUTAGE_MEMORY);
        w.patch = { r: level, ids: read.patched() };
        w.wins = read.wins();
        w.mirror = read.mirror();
        w.end = read.endings().length;
        w.ach = read.achievements();
    }

    /* ── Recording ──────────────────────────────────────────────────────
       An event becomes one or more pending posts. Pending holds no text and
       no timestamp; both are decided when the post goes up. */
    function record(s, id, k, x, level) {
        if (s.posts.some((p) => p.id === id) || s.pending.some((p) => p.id === id)) return false;
        const post = cleanPost({ id, k, x, r: level, c: voice() }, Date.now(), { pending: true });
        if (!post) return false;
        s.pending.push(post);
        if (s.pending.length > PENDING_CAP) s.pending.splice(0, s.pending.length - PENDING_CAP);
        return true;
    }

    function offer(s, e, m, lv) {
        s.offer = { e, m, lv };
    }

    /* The build played at `reboot`: the live one for the current level, the
       history record for earlier ones (identity only — entry ids). */
    function buildAt(reboot, level) {
        if (reboot === level) {
            const b = read.build();
            if (!b) return null;
            const replay = b.channel === 'archived' && plain(b.replayOf) ? b.replayOf : null;
            return {
                level: replay ? int(replay.level, 0, 1000000) ?? reboot : reboot,
                channel: FIELD.channel(b.channel) || 'stable',
                source: replay ? FIELD.source(replay.source) : null,
                entries: (Array.isArray(b.entries) ? b.entries : []).filter((e) => plain(e) && FIELD.entry(e.id))
                    .map((e) => ({ id: e.id, kind: entryById(e.id).kind })),
            };
        }
        const rec = read.history(reboot);
        if (!rec) return null;
        return {
            level: int(rec.level, 0, 1000000) ?? reboot,
            channel: FIELD.channel(rec.channel) || 'stable',
            source: FIELD.source(rec.source),
            entries: (Array.isArray(rec.entries) ? rec.entries : []).filter((id) => FIELD.entry(id))
                .map((id) => ({ id, kind: entryById(id).kind })),
        };
    }

    /* Three reactions at most, one per kind of entry, picked by the seed:
       the improvement people noticed, the issue they are living with, and
       the regression or deprecation they are angry about. */
    function reactionsFor(s, reboot, build) {
        const picks = [];
        const groups = [['improvement'], ['issue'], ['regression', 'deprecation']];
        for (const kinds of groups) {
            const pool = build.entries.filter((e) => kinds.includes(e.kind));
            if (!pool.length) continue;
            picks.push(pool[hash(`${s.seed}|react|${reboot}|${kinds[0]}`) % pool.length]);
        }
        return picks;
    }

    function recordShip(s, reboot, level, contacted) {
        const build = buildAt(reboot, level);
        if (!build) return 0;
        let n = 0;
        const base = `ship:${reboot}`;
        if (build.channel === 'archived') {
            const x = { lv: build.level, src: build.source || 'stable' };
            n += record(s, `${base}/news`, 'replay.news', x, reboot);
            n += record(s, `${base}/mortal`, 'replay.mortal', x, reboot);
            if (contacted) n += record(s, `${base}/null`, 'replay.null', x, reboot);
            if (reboot === level) offer(s, base, 'replay', build.level);
        } else {
            const issues = build.entries.filter((e) => e.kind === 'issue').length;
            n += record(s, `${base}/news`, 'ship.news', { lv: build.level, ch: build.channel, n: build.entries.length, q: issues }, reboot);
            reactionsFor(s, reboot, build).forEach((e, i) => {
                n += record(s, `${base}/r${i}`, `ship.react.${e.kind}`, { lv: build.level, e: e.id }, reboot);
            });
            if (contacted) n += record(s, `${base}/null`, 'ship.null', { lv: build.level, n: reboot }, reboot);
            if (reboot === level) offer(s, base, 'ship', build.level);
        }
        // What the outgoing build left behind: its first unpatched issue.
        const prev = read.history(reboot - 1);
        const dirty = Array.isArray(prev?.unpatched) ? prev.unpatched.filter((id) => FIELD.entry(id)) : [];
        if (dirty.length) {
            const id = dirty[hash(`${s.seed}|dirty|${reboot}`) % dirty.length];
            n += record(s, `${base}/dirty`, 'ship.dirty', { lv: int(prev.level, 0, 1000000) ?? reboot - 1, e: id }, reboot);
        }
        // The certification this run was played on.
        const path = reboot === level ? FIELD.branch(State.certification?.path) : FIELD.branch(read.history(reboot)?.certified);
        if (path) n += record(s, `${base}/cert`, 'ship.cert', { p: path }, reboot);
        // A channel cleared at this reboot.
        if (typeof Reality !== 'undefined') {
            const before = Reality.channelsFor(reboot - 1);
            const fresh = Reality.channelsFor(reboot).filter((c) => !before.includes(c));
            for (const ch of fresh) n += record(s, `${base}/unlock-${ch}`, 'ship.unlock', { ch }, reboot);
        }
        return n;
    }

    /* Diffs State against the watermarks and records what is new. */
    function detect(s, level) {
        const w = s.wm;
        let n = 0;
        const contacted = voice() === 1;

        // Reboots. A pass that sees several (a fixture, an import) posts the
        // last few and lets the rest go: nobody reads a backlog of ships.
        if (level > w.reboot) {
            for (let r = Math.max(w.reboot + 1, level - SHIP_BACKFILL + 1); r <= level; r++) {
                n += recordShip(s, r, level, contacted);
            }
            w.reboot = level;
        } else if (level < w.reboot) {
            w.reboot = level; // an import rolled the save back
        }

        // Cascades: once per tier per run, the highest tier reached.
        if (w.cascade.r !== level) w.cascade = { r: level, t: 0 };
        const tier = read.tier();
        if (tier > w.cascade.t) {
            n += record(s, `casc:${level}:${tier}/status`, 'cascade.status', { t: tier }, level);
            n += record(s, `casc:${level}:${tier}/react`, 'cascade.react', { t: tier }, level);
            w.cascade.t = tier;
        }

        // SEV-1 outages, once per ticket.
        for (const o of read.outages()) {
            if (w.out.includes(o.n)) continue;
            n += record(s, `out:${o.n}`, 'outage', { line: o.line, s: o.s, n: o.n }, level);
            w.out.push(o.n);
        }
        if (w.out.length > OUTAGE_MEMORY) w.out.splice(0, w.out.length - OUTAGE_MEMORY);

        // Known issues patched on the live build.
        if (w.patch.r !== level) w.patch = { r: level, ids: [] };
        const lv = buildAt(level, level)?.level ?? level;
        for (const id of read.patched()) {
            if (w.patch.ids.includes(id)) continue;
            if (entryById(id)?.kind === 'issue') n += record(s, `patch:${level}:${id}`, 'patch', { lv, e: id }, level);
            w.patch.ids.push(id);
        }

        // Patience.exe: a full clear is a win.
        const wins = read.wins();
        if (wins > w.wins) n += record(s, `pat:${wins}`, 'patience', { w: wins }, level);
        w.wins = wins;

        // The Mirror Login.
        if (read.mirror() && !w.mirror) {
            const choice = FIELD.choice(State.adversary?.playerChoice);
            n += record(s, 'mirror/null', 'mirror.null', choice ? { c: choice } : {}, level);
            n += record(s, 'mirror/voice', 'mirror.voice', {}, level);
            offer(s, 'mirror', 'mirror', buildAt(level, level)?.level ?? level);
            w.mirror = true;
        }

        // Endings.
        const endings = read.endings();
        for (let i = w.end; i < endings.length; i++) {
            const band = endings[i].ending;
            n += record(s, `end:${i}/hr`, 'ending.hr', { band }, level);
            n += record(s, `end:${i}/voice`, 'ending.voice', { band }, level);
            offer(s, `end:${i}`, 'ending', buildAt(level, level)?.level ?? level);
        }
        w.end = endings.length;

        /* Achievements, a few per pass. One over the cap is NOT marked seen:
           it waits for the next pass (a second later) instead of being
           dropped. It used to be marked and skipped, so a reboot that
           unlocked five at once lost two posts for good. */
        let posted = 0;
        for (const id of read.achievements()) {
            if (w.ach.includes(id)) continue;
            if (posted >= ACH_PER_PASS) break;
            w.ach.push(id);
            const secret = achievement(id).tier === 'Secret';
            n += record(s, `ach:${id}`, secret ? 'ach.secret' : 'ach', { id }, level);
            posted++;
        }
        return n;
    }

    /* Pending events go up, in the order they happened. */
    function flush(s, now) {
        if (!s.pending.length) return 0;
        const ep = epochAt(now);
        let n = 0;
        for (const p of s.pending) {
            if (s.posts.some((q) => q.id === p.id)) continue;
            s.posts.push({ ...p, at: now, ep, b: 0 });
            n++;
        }
        s.pending = [];
        cap(s);
        return n;
    }

    function cap(s) {
        if (s.posts.length > FEED_CAP) s.posts.splice(0, s.posts.length - FEED_CAP);
    }

    /* Quiet-time chatter. Present seconds only, and only into a quiet board. */
    function ambient(s, now, dt, level) {
        s.amb = Math.min(AMBIENT_SECONDS, s.amb + dt);
        if (s.amb < AMBIENT_SECONDS) return 0;
        const last = s.posts.length ? s.posts[s.posts.length - 1].at : 0;
        if (now - last < QUIET_MS) return 0;
        const i = s.ambN;
        const groups = ['base'];
        if (voice()) groups.push('null');
        if (Array.isArray(State.unlockedApps) && State.unlockedApps.includes('solitaire')) groups.push('fate');
        // One in four from a voice beyond the base cast, when there is one.
        const roll = hash(`${s.seed}|ambg|${i}`) % 4;
        const group = groups.length > 1 && roll === 0 ? groups[1 + (hash(`${s.seed}|ambv|${i}`) % (groups.length - 1))] : 'base';
        s.amb = 0;
        s.ambN = i + 1;
        s.posts.push({ id: `amb:${i}`, k: `ambient.${group}`, r: level, x: { i }, c: voice(), at: now, ep: epochAt(now), b: 0 });
        cap(s);
        return 1;
    }

    /* The app opens with the first reboot: before it, the world has had
       nothing to react to but the opening build. */
    function ensureApp(s) {
        if (!Array.isArray(State.unlockedApps) || State.unlockedApps.includes('choir')) return false;
        State.unlockedApps.push('choir');
        record(s, 'welcome', 'welcome', {}, read.level());
        if (typeof ui !== 'undefined' && ui && typeof ui.updateDesktopIcons === 'function') ui.updateDesktopIcons();
        return true;
    }

    let lastObserveAt = null;
    let listeners = [];

    /* One watch pass. Returns the number of posts that went up. */
    function observe(now = Date.now()) {
        if (typeof State === 'undefined' || !read.build()) return 0;
        const s = state(now);
        const dt = lastObserveAt === null ? 0 : Math.max(0, Math.min(5, (now - lastObserveAt) / 1000));
        lastObserveAt = now;
        if (!s.seed) s.seed = (hash(`choir|${State.reality?.runSeed || 1}`) >>> 0) || 1;

        const level = read.level();
        if (level < 1) {
            baseline(s, level);
            s.wm.init = true;
            return 0;
        }
        if (!s.wm.init) {
            // A save that predates Choir: the current build is its first news.
            baseline(s, level);
            s.wm.reboot = level - 1;
            s.wm.init = true;
        }
        ensureApp(s);
        const recorded = detect(s, level);
        let posted = 0;
        if (present(now)) {
            posted += flush(s, now);
            posted += ambient(s, now, dt, level);
        }
        if (posted || recorded) notify();
        return posted;
    }

    function notify() {
        for (const fn of listeners) { try { fn(); } catch (e) { /* a view never breaks the watch */ } }
    }

    /* ── Rendering text ─────────────────────────────────────────────────
       Pure functions of (seed, post, content). */
    function esc(v) {
        if (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function') {
            const out = ui.escapeHtml(v);
            if (typeof out === 'string') return out;
        }
        return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function versionOf(lv) {
        return typeof Reality !== 'undefined' ? Reality.versionOfLevel(lv) : String(lv);
    }

    function channelLabel(ch) {
        return (typeof RealityChannels !== 'undefined' && RealityChannels[ch]?.label) || ch;
    }

    /* The values a post's variables resolve to. Null when its content is gone. */
    function varsOf(post) {
        const x = post.x;
        const v = {};
        if (has(x, 'lv')) v.version = versionOf(x.lv);
        if (has(x, 'ch')) v.channel = channelLabel(x.ch);
        if (post.k === 'ship.news') { v.count = String(x.n); v.issues = String(x.q); }
        if (has(x, 'src')) v.source = channelLabel(x.src);
        if (has(x, 'e')) {
            const e = entryById(x.e);
            if (!e) return null;
            v.note = e.note;
            const pct = /(\d+)%/.exec(e.note);
            if (pct) v.pct = pct[1];
        }
        if (has(x, 'p')) v.path = BRANCH_LABELS[x.p];
        if (post.k === 'ship.null') v.reboot = String(x.n);
        if (has(x, 't')) {
            const tiers = typeof Economy !== 'undefined' ? Economy.cascadeTiers : null;
            v.tierLabel = tiers?.[x.t - 1]?.label || `TIER ${x.t}`;
        }
        if (has(x, 'line')) {
            v.line = LINE_LABELS[x.line][0];
            v.resource = LINE_LABELS[x.line][1];
            v.sector = x.s;
            v.ticket = `INC-${String(x.n).padStart(4, '0')}`;
        }
        if (post.k === 'patience') v.wins = String(x.w);
        if (has(x, 'band')) v.title = TITLES[x.band];
        if (has(x, 'id')) {
            const a = achievement(x.id);
            if (!a) return null;
            v.ach = a.name;
            v.flavor = a.flavor || '';
        }
        return v;
    }

    function varsIn(text) {
        return [...String(text).matchAll(VAR_RE)].map((m) => m[1]);
    }

    function matches(tpl, x) {
        if (!tpl.when) return true;
        return Object.entries(tpl.when).every(([k, val]) => x[k] === val);
    }

    /* The template a post reads from: filtered by its stored fields and by
       the variables it can resolve, then picked by hash. */
    function templateOf(post, seed) {
        if (post.k === 'status') {
            const list = ChoirStatuses[post.x.m];
            const tpl = list?.[post.x.o];
            return tpl ? { p: 'operator', t: tpl.t, r: tpl.r } : null;
        }
        const vars = varsOf(post);
        if (!vars) return null;
        const pool = (ChoirContent[post.k] || []).filter((tpl) => matches(tpl, post.x) &&
            varsIn(tpl.t).every((name) => vars[name] !== undefined) &&
            ChoirPersonas[tpl.p]);
        if (!pool.length) return null;
        return pool[hash(`${seed}|${post.id}`) % pool.length];
    }

    function etherscapeKnows(url) {
        try {
            return typeof Etherscape !== 'undefined' && Etherscape && typeof Etherscape.knows === 'function' &&
                Etherscape.knows(url) === true;
        } catch (e) { return false; }
    }

    /* Text and links to HTML. Every variable, every literal and every link
       label is escaped; a URL is only ever one the content table wrote. */
    function toHtml(text, vars) {
        const fill = (s) => esc(String(s).replace(VAR_RE, (m, name) => (vars[name] !== undefined ? vars[name] : m)));
        let html = '';
        let last = 0;
        for (const m of String(text).matchAll(LINK_RE)) {
            html += fill(text.slice(last, m.index));
            const url = m[1];
            const label = fill(m[2]);
            html += etherscapeKnows(url)
                ? `<a class="ch-link" href="#" data-url="${esc(url)}">${label}</a>`
                : `<span class="ch-linktext">${label}</span>`;
            last = m.index + m[0].length;
        }
        return html + fill(text.slice(last));
    }

    function toPlain(text, vars) {
        return String(text).replace(LINK_RE, (m, url, label) => label)
            .replace(VAR_RE, (m, name) => (vars[name] !== undefined ? vars[name] : m));
    }

    /* A post, ready to draw: persona, html, plain text, thread, counts. */
    function view(post, now = Date.now()) {
        const s = state(now);
        const tpl = templateOf(post, s.seed);
        if (!tpl) return null;
        const vars = post.k === 'status' ? { version: versionOf(post.x.lv) } : varsOf(post);
        const persona = ChoirPersonas[tpl.p];
        const replies = (tpl.r || []).filter(([p]) => ChoirPersonas[p] && (p !== 'nulloperator' || post.c === 1)).map(([p, t]) => ({
            persona: p, name: ChoirPersonas[p].name, handle: ChoirPersonas[p].handle,
            html: toHtml(t, vars), text: toPlain(t, vars),
        }));
        return {
            id: post.id,
            kind: post.k,
            persona: tpl.p,
            name: persona.name,
            handle: persona.handle,
            role: persona.role,
            mark: persona.mark,
            player: persona.player === true,
            html: toHtml(tpl.t, vars),
            text: toPlain(tpl.t, vars),
            replies,
            at: post.at,
            ep: post.ep,
            version: versionOf(post.r),
            hallelujahs: hallelujahs(post, persona, s.seed, now),
            blessed: post.b === 1,
        };
    }

    /* Deterministic: a base from the hash and the persona's reach, growing
       over the post's first six hours, plus one for the Operator's blessing. */
    function hallelujahs(post, persona, seed, now) {
        const h = hash(`${seed}|hal|${post.id}`);
        const base = persona.reach * (0.3 + (h % 1000) / 1000);
        const ageMin = Math.max(0, (now - post.at) / 60000);
        const growth = persona.reach * ((h >>> 10) % 1000) / 1000 * Math.min(1, ageMin / 360);
        return Math.floor(base + growth) + (post.b === 1 ? 1 : 0);
    }

    /* Newest first. Posts whose content no longer exists are skipped. */
    function feed(now = Date.now()) {
        const s = state(now);
        const out = [];
        for (let i = s.posts.length - 1; i >= 0; i--) {
            const v = view(s.posts[i], now);
            if (v) out.push(v);
        }
        return out;
    }

    function unread(now = Date.now()) {
        const s = state(now);
        return s.posts.filter((p) => p.at > s.lastReadAt && p.k !== 'status').length;
    }

    function markRead(now = Date.now()) {
        const s = state(now);
        const changed = s.lastReadAt < now && s.posts.some((p) => p.at > s.lastReadAt);
        s.lastReadAt = now;
        return changed;
    }

    /* ── The Operator's side ────────────────────────────────────────────
       Blessing is a like and nothing else. The lifetime count only moves the
       first time a post is blessed, so toggling cannot farm the badge. */
    function bless(id, now = Date.now()) {
        const s = state(now);
        const post = s.posts.find((p) => p.id === id);
        if (!post || post.k === 'status') return false;
        if (post.b === 1) {
            post.b = 2;
        } else {
            if (post.b === 0) s.blessings += 1;
            post.b = 1;
        }
        // ACH-042/043 are picked up by the 1 Hz achievement check in tick().
        // Calling it from here would also pay out any OTHER achievement that
        // happened to be due, from inside an app that promises to only read.
        notify();
        return true;
    }

    function statusOptions(now = Date.now()) {
        const s = state(now);
        if (!s.offer) return null;
        const list = ChoirStatuses[s.offer.m] || [];
        const vars = { version: versionOf(s.offer.lv) };
        return {
            milestone: s.offer.m,
            options: list.map((tpl, i) => ({ index: i, html: toHtml(tpl.t, vars), text: toPlain(tpl.t, vars) })),
        };
    }

    /* A canned status. Goes up at once — the Operator is, by definition,
       present — and may move the adversary's standing, under the cooldown
       nudgeAdversaryStanding already keeps per reason. */
    function postStatus(option, now = Date.now()) {
        const s = state(now);
        const o = FIELD.option(option);
        if (!s.offer || o === null) return false;
        const id = `st:${s.offer.e}`;
        if (s.posts.some((p) => p.id === id)) { s.offer = null; return false; }
        s.posts.push({ id, k: 'status', r: read.level(), x: { m: s.offer.m, o, lv: s.offer.lv }, c: voice(), at: now, ep: epochAt(now), b: 0 });
        s.offer = null;
        cap(s);
        const delta = STATUS_NUDGE[o];
        if (delta && typeof game !== 'undefined' && typeof game.nudgeAdversaryStanding === 'function') {
            game.nudgeAdversaryStanding(delta, STATUS_REASON);
        }
        notify();
        return true;
    }

    function onChange(fn) {
        listeners.push(fn);
        return () => { listeners = listeners.filter((f) => f !== fn); };
    }

    /* The watch. Inert headlessly: the tests call observe() themselves. In
       the page it waits for system.init to start presence tracking, so the
       boot (before anyone has touched anything) never counts as present. */
    if (typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof setInterval === 'function') {
        // On the desktop's shared 1 Hz clock (js/heartbeat.js), which rests in a hidden tab.
        const watch = () => {
            try {
                if (typeof game === 'undefined' || game.presenceTracking !== true) return;
                observe(Date.now());
            } catch (e) { /* the watch never breaks the page */ }
        };
        if (typeof Heartbeat !== 'undefined') Heartbeat.every(watch); else setInterval(watch, 1000);
    }

    return {
        FEED_CAP, PENDING_CAP, AMBIENT_SECONDS, QUIET_MS, STATUS_NUDGE, STATUS_REASON, LINK_ROOTS: ChoirLinkRoots,
        hash, state, normalise, observe, feed, view, unread, markRead, bless, statusOptions, postStatus, onChange,
        varsIn, entryById,
    };
})();

/* ════════════════════════════════════════════════════════════════════════
   ChoirView — the window.

   A message board on vellum: a struck-brass masthead, the canned-status
   composer when a milestone has offered one, and the feed. The list is
   keyed by post id and patched in place — new posts are inserted at the
   top and nothing that already exists is rebuilt — so a refresh never
   takes focus off a Bless button or collapses an open thread.
   ════════════════════════════════════════════════════════════════════════ */
const ChoirView = (() => {
    'use strict';

    const hasDOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
    const st = { openedAt: 0, nodes: new Map(), avatars: {}, timer: 0, off: null };
    const root = () => (hasDOM ? document.getElementById('choir-root') : null);
    const esc = (v) => (typeof ui !== 'undefined' && ui && typeof ui.escapeHtml === 'function'
        ? ui.escapeHtml(v) : String(v ?? ''));

    /* ── Avatars: assets/choir/<persona>.webp, if one is installed ────── */
    function probeAvatar(persona) {
        if (persona in st.avatars) return;
        st.avatars[persona] = null;
        const url = `assets/choir/${persona}.webp`;
        const proto = typeof window !== 'undefined' ? window.location?.protocol : '';
        if (typeof fetch !== 'function' || (proto !== 'http:' && proto !== 'https:')) return;
        fetch(url, { method: 'HEAD', cache: 'no-cache' }).then((res) => {
            const type = String(res.headers.get('content-type') || '').toLowerCase();
            if (!res.ok || !type.startsWith('image/')) return;
            st.avatars[persona] = url;
            root()?.querySelectorAll(`.ch-avatar[data-persona="${persona}"]`).forEach(paintAvatar);
        }).catch(() => { /* no file, no fetch: the plate stays */ });
    }

    function paintAvatar(el) {
        const url = st.avatars[el.dataset.persona];
        if (!url) return;
        el.style.backgroundImage = `url("${url}")`;
        el.classList.add('has-art');
    }

    function avatarHtml(persona, mark, small = false) {
        probeAvatar(persona);
        return `<span class="ch-avatar ch-p-${esc(persona)}${small ? ' is-small' : ''}" data-persona="${esc(persona)}" aria-hidden="true"><span class="ch-mark">${esc(mark)}</span></span>`;
    }

    /* ── Time ─────────────────────────────────────────────────────────── */
    function ago(at, now) {
        const s = Math.max(0, Math.floor((now - at) / 1000));
        if (s < 45) return 'just now';
        const m = Math.round(s / 60);
        if (m < 60) return `${m} min ago`;
        const h = Math.round(m / 60);
        if (h < 48) return `${h} hr ago`;
        return `${Math.round(h / 24)} days ago`;
    }

    function stamp(p, now) {
        return `v${esc(p.version)} &middot; Epoch ${esc(Number(p.ep).toLocaleString('en-US'))} &middot; ${esc(ago(p.at, now))}`;
    }

    /* ── A post ───────────────────────────────────────────────────────── */
    function postHtml(p, now) {
        const fresh = p.at > st.openedAt && !p.player ? '<b class="ch-new">NEW</b>' : '';
        const thread = p.replies.length
            ? `<button type="button" class="ch-thread-toggle" data-act="thread" aria-expanded="false">${p.replies.length} ${p.replies.length === 1 ? 'reply' : 'replies'}</button>`
            : '';
        const replies = p.replies.length
            ? `<ol class="ch-replies" hidden>${p.replies.map((r) => `
                <li class="ch-reply">
                    ${avatarHtml(r.persona, ChoirPersonas[r.persona].mark, true)}
                    <div class="ch-reply-body"><span class="ch-name">${esc(r.name)}</span> <span class="ch-handle">@${esc(r.handle)}</span>
                    <p class="ch-text">${r.html}</p></div>
                </li>`).join('')}</ol>`
            : '';
        const bless = p.player
            ? `<span class="ch-hal" data-role="hal">${p.hallelujahs} Hallelujah${p.hallelujahs === 1 ? '' : 's'}</span>`
            : `<button type="button" class="ch-bless${p.blessed ? ' is-blessed' : ''}" data-act="bless" aria-pressed="${p.blessed}">
                    <span class="ch-bless-label">${p.blessed ? 'Blessed' : 'Bless'}</span>
                    <span class="ch-hal" data-role="hal">${p.hallelujahs} Hallelujah${p.hallelujahs === 1 ? '' : 's'}</span>
               </button>`;
        return `
            ${avatarHtml(p.persona, p.mark)}
            <div class="ch-body">
                <header class="ch-head">
                    <span class="ch-name">${esc(p.name)}</span>
                    <span class="ch-handle">@${esc(p.handle)}</span>
                    ${p.persona === 'nulloperator' ? '<span class="ch-unverified" title="This account has not been verified by CMS">unverified</span>' : ''}
                    ${fresh}
                </header>
                <div class="ch-meta" data-role="meta">${stamp(p, now)}</div>
                <p class="ch-text">${p.html}</p>
                <footer class="ch-foot">${bless}${thread}</footer>
                ${replies}
            </div>`;
    }

    function makeNode(p, now) {
        const li = document.createElement('li');
        li.className = `ch-post ch-k-${p.kind.replace(/\./g, '-')}${p.player ? ' is-player' : ''}`;
        li.dataset.id = p.id;
        li.innerHTML = postHtml(p, now);
        li.querySelectorAll('.ch-avatar').forEach(paintAvatar);
        return li;
    }

    /* ── The skeleton ─────────────────────────────────────────────────── */
    function build(el) {
        el.innerHTML = `
            <div class="ch">
                <div class="ch-masthead">
                    <span class="ch-brand">CHOIR</span>
                    <span class="ch-tagline">Public status board of the Celestial Management System</span>
                </div>
                <div class="ch-scroll">
                    <section class="ch-compose" hidden aria-label="Post a status"></section>
                    <ol class="ch-feed" aria-label="Choir feed"></ol>
                    <p class="ch-empty" hidden>Nobody has said anything yet. Give them something to talk about.</p>
                </div>
                <div class="ch-status"><span data-role="count"></span><span data-role="given"></span></div>
            </div>`;
        el.addEventListener('click', onClick);
        st.nodes = new Map();
    }

    function onClick(e) {
        const link = e.target.closest('.ch-link');
        if (link) {
            e.preventDefault();
            try { if (typeof Etherscape !== 'undefined' && Etherscape.open) Etherscape.open(link.dataset.url); } catch (err) { /* sister app */ }
            return;
        }
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const post = btn.closest('.ch-post');
        const act = btn.dataset.act;
        if (act === 'bless' && post) {
            Choir.bless(post.dataset.id);
            if (typeof game !== 'undefined' && game.sfx) game.sfx('click');
        } else if (act === 'thread' && post) {
            const list = post.querySelector('.ch-replies');
            const open = list.hidden;
            list.hidden = !open;
            btn.setAttribute('aria-expanded', String(open));
            btn.classList.toggle('is-open', open);
        } else if (act === 'status') {
            if (Choir.postStatus(Number(btn.dataset.option))) {
                if (typeof game !== 'undefined' && game.sfx) game.sfx('click');
            }
        }
    }

    function renderCompose(el) {
        const box = el.querySelector('.ch-compose');
        const offer = Choir.statusOptions();
        if (!offer) { box.hidden = true; box.innerHTML = ''; box.dataset.key = ''; return; }
        const key = `${offer.milestone}|${offer.options.map((o) => o.text).join('|')}`;
        if (box.dataset.key === key) return;
        box.dataset.key = key;
        box.hidden = false;
        box.innerHTML = `
            <div class="ch-compose-head">${avatarHtml('operator', ChoirPersonas.operator.mark, true)}
                <span><strong>Post a status</strong> <small>Approved updates only. Choose one.</small></span></div>
            <div class="ch-compose-options">${offer.options.map((o) => `
                <button type="button" class="ch-option" data-act="status" data-option="${o.index}">${o.html}</button>`).join('')}
            </div>`;
        box.querySelectorAll('.ch-avatar').forEach(paintAvatar);
    }

    /* Keyed patch: insert what is new, drop what fell off the cap, update
       the counters and timestamps of what is already on screen. */
    function render() {
        const el = root();
        if (!el) return;
        if (!el.querySelector('.ch')) build(el);
        const now = Date.now();
        const posts = Choir.feed(now);
        const list = el.querySelector('.ch-feed');
        const ids = new Set(posts.map((p) => p.id));
        for (const [id, node] of st.nodes) {
            if (!ids.has(id)) { node.remove(); st.nodes.delete(id); }
        }
        let anchor = null; // posts arrive newest-first; insert each after the last placed
        for (const p of posts) {
            let node = st.nodes.get(p.id);
            if (!node) {
                node = makeNode(p, now);
                st.nodes.set(p.id, node);
                if (anchor) anchor.after(node); else list.prepend(node);
            } else {
                const meta = node.querySelector('[data-role="meta"]');
                const html = stamp(p, now);
                if (meta && meta.innerHTML !== html) meta.innerHTML = html;
                const hal = node.querySelector('[data-role="hal"]');
                const halText = `${p.hallelujahs} Hallelujah${p.hallelujahs === 1 ? '' : 's'}`;
                if (hal && hal.textContent !== halText) hal.textContent = halText;
                const btn = node.querySelector('.ch-bless');
                if (btn && btn.classList.contains('is-blessed') !== p.blessed) {
                    btn.classList.toggle('is-blessed', p.blessed);
                    btn.setAttribute('aria-pressed', String(p.blessed));
                    btn.querySelector('.ch-bless-label').textContent = p.blessed ? 'Blessed' : 'Bless';
                }
            }
            anchor = node;
        }
        el.querySelector('.ch-empty').hidden = posts.length > 0;
        renderCompose(el);
        const s = Choir.state();
        el.querySelector('[data-role="count"]').textContent = `${posts.length} post${posts.length === 1 ? '' : 's'}`;
        el.querySelector('[data-role="given"]').textContent = `Hallelujahs given: ${s.blessings}`;
        if (Choir.markRead(now)) updateBadge();
    }

    /* The unread count on the desktop plaque and the Genesis entry. */
    function updateBadge() {
        if (!hasDOM) return;
        const open = typeof system !== 'undefined' && system && system.windows && system.windows.choir;
        const n = open ? 0 : Choir.unread();
        const label = n > 99 ? '99+' : String(n);
        const targets = [document.getElementById('icon-choir'), document.querySelector('.start-menu-action[data-app="choir"]')];
        for (const host of targets) {
            if (!host) continue;
            let badge = host.querySelector('.choir-badge');
            if (!n) { badge?.remove(); continue; }
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'choir-badge';
                host.appendChild(badge);
            }
            if (badge.textContent !== label) badge.textContent = label;
            badge.setAttribute('aria-label', `${n} unread`);
        }
    }

    function open() {
        st.openedAt = Choir.state().lastReadAt || 0;
        st.nodes = new Map();
        render();
        /* "3 min ago" goes stale slowly: every thirtieth beat of the shared
           clock, which rests in a hidden tab. Unsubscribes itself once the
           window is gone. */
        clearInterval(st.timer);
        if (st.off) st.off();
        st.off = null;
        const refresh = () => {
            if (!root()) { clearInterval(st.timer); if (st.off) st.off(); st.off = null; return; }
            render();
        };
        if (typeof Heartbeat !== 'undefined') {
            let beats = 0;
            st.off = Heartbeat.every(() => { if (++beats % 30 === 0 || !root()) refresh(); });
        } else {
            st.timer = setInterval(refresh, 30000);
        }
        updateBadge();
    }

    if (hasDOM) {
        Choir.onChange(() => {
            if (root()) render();
            updateBadge();
        });
        // The Genesis menu is rebuilt on every open; badge it after.
        document.addEventListener('click', (e) => {
            if (e.target.closest && e.target.closest('#start-button')) setTimeout(updateBadge, 0);
        });
        setTimeout(updateBadge, 0);
    }

    return { open, render, updateBadge };
})();
