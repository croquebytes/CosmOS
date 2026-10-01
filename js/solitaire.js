/* ============================================================
   PATIENCE.EXE — Golf solitaire, dealt from the celestial arcana

   Three objects, in dependency order, so each can be tested without the one
   after it:

     PatienceRules   pure and DOM-free. A round is a seed plus a move log,
                     and every state is derived by replaying that log. That
                     one decision buys determinism (same seed, same deal),
                     undo (drop the last move), persistence (save the log, not
                     the cards) and hostile-save safety (replay refuses the
                     first illegal move and stops there).
     PatienceLedger  pure arithmetic: payouts, the fatigue schedule, mulligan
                     pricing, and the normaliser for State.casino.solitaire.
     PatienceApp     the only part that touches State or game — settlement,
                     mulligans, and the shop/unlock reconciliation.
     PatienceView    rendering and input. Nothing above it reads the DOM.
   ============================================================ */

const PatienceRules = {
    /* The four celestial houses are the four ranks of the automaton
       hierarchy the player has spent the run commissioning. */
    SUITS: ['seraph', 'throne', 'cherub', 'dominion'],
    SUIT_NAMES: { seraph: 'Seraphs', throne: 'Thrones', cherub: 'Cherubs', dominion: 'Dominions' },
    RANK_LABELS: ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    RANK_NAMES: ['', 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Herald', 'Oracle', 'Archon'],
    COLUMNS: 7,
    DEPTH: 5,
    TABLEAU_CARDS: 35,

    /* mulberry32. Small, fast and — the property that matters — identical in
       node and every browser, so a seed dealt in a test is the deal a player
       sees. */
    rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },

    shuffle(cards, rng) {
        const out = cards.slice();
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
    },

    /* A card is an integer 0..51. Plain numbers keep the move log and every
       derived state trivially JSON-safe. */
    suitOf(card) { return this.SUITS[Math.floor(card / 13)]; },
    rankOf(card) { return (card % 13) + 1; },
    describe(card) {
        return `${this.RANK_NAMES[this.rankOf(card)]} of ${this.SUIT_NAMES[this.suitOf(card)]}`;
    },

    deal(seed, { wrap = false } = {}) {
        const rng = this.rng(seed);
        const deck = this.shuffle(Array.from({ length: 52 }, (_, i) => i), rng);
        const tableau = Array.from({ length: this.COLUMNS }, () => []);
        let k = 0;
        for (let row = 0; row < this.DEPTH; row++) {
            for (let col = 0; col < this.COLUMNS; col++) tableau[col].push(deck[k++]);
        }
        // 17 cards remain. The first is turned to open the waste.
        const stock = deck.slice(k);
        const waste = [stock.pop()];
        return { seed: seed >>> 0, wrap: !!wrap, tableau, stock, waste, reshuffled: false, moves: [] };
    },

    clone(state) {
        return {
            ...state,
            tableau: state.tableau.map((col) => col.slice()),
            stock: state.stock.slice(),
            waste: state.waste.slice(),
            moves: state.moves.slice(),
        };
    },

    wasteTop(state) { return state.waste[state.waste.length - 1]; },

    /* Golf's one rule: an exposed card plays onto the waste if it is one
       rank above or below it. No wrap by default — a King does not reach an
       Ace, and an Ace does not reach a King. */
    isLegalPlay(state, col) {
        if (!Number.isInteger(col) || col < 0 || col >= this.COLUMNS) return false;
        const column = state.tableau[col];
        if (!column || !column.length) return false;
        const top = this.wasteTop(state);
        if (top === undefined) return false;
        const diff = Math.abs(this.rankOf(column[column.length - 1]) - this.rankOf(top));
        return diff === 1 || (state.wrap && diff === 12);
    },

    legalPlays(state) {
        const out = [];
        for (let col = 0; col < this.COLUMNS; col++) if (this.isLegalPlay(state, col)) out.push(col);
        return out;
    },

    play(state, col) {
        if (!this.isLegalPlay(state, col)) return null;
        const next = this.clone(state);
        next.waste.push(next.tableau[col].pop());
        next.moves.push(`p${col}`);
        return next;
    },

    draw(state) {
        if (!state.stock.length) return null;
        const next = this.clone(state);
        next.waste.push(next.stock.pop());
        next.moves.push('d');
        return next;
    },

    /* The Mulligan's second form: everything under the waste top, plus
       whatever stock is left, is shuffled back into a fresh stock. Once per
       round, as a RULE rather than an app check, so a save that lists three
       reshuffles replays only the first. The shuffle is salted with the move
       count, so it is deterministic without being the opening shuffle again. */
    reshuffle(state) {
        if (state.reshuffled || state.waste.length < 2) return null;
        const next = this.clone(state);
        const top = next.waste.pop();
        const salt = (Math.imul(next.moves.length + 1, 0x9E3779B9) ^ next.seed) >>> 0;
        next.stock = this.shuffle(next.waste.concat(next.stock), this.rng(salt));
        next.waste = [top];
        next.reshuffled = true;
        next.moves.push('r');
        return next;
    },

    apply(state, move) {
        if (move === 'd') return this.draw(state);
        if (move === 'r') return this.reshuffle(state);
        const m = /^p([0-6])$/.exec(typeof move === 'string' ? move : '');
        return m ? this.play(state, Number(m[1])) : null;
    },

    /* Replays a log from its seed. Stops at the first move that is illegal
       here, so a tampered log yields the longest honest prefix rather than a
       state no deal could reach. */
    replay(seed, moves, opts) {
        let state = this.deal(seed, opts);
        for (const move of (Array.isArray(moves) ? moves : [])) {
            const next = this.apply(state, move);
            if (!next) break;
            state = next;
        }
        return state;
    },

    tableauLeft(state) { return state.tableau.reduce((n, col) => n + col.length, 0); },
    cardsCleared(state) { return this.TABLEAU_CARDS - this.tableauLeft(state); },
    isWon(state) { return this.tableauLeft(state) === 0; },
    /* Stuck means the rules have nothing left — no play and no stock. A
       Mulligan may still be on offer; that is the app's business, not the
       rules'. */
    isStuck(state) {
        return !this.isWon(state) && state.stock.length === 0 && this.legalPlays(state).length === 0;
    },
    isOver(state) { return this.isWon(state) || this.isStuck(state); },

    /* Golf scoring: cards left on the tableau, lower is better. A full clear
       scores the stock it did not need, as a negative. */
    score(state) {
        return this.isWon(state) ? -state.stock.length : this.tableauLeft(state);
    },
};

/* ============================================================
   The ledger: what a round pays, and what a Mulligan costs.

   This is an idle game. A card table that pays is a card table that can be
   farmed, and the moment it is the best use of a player's attention the idle
   game has become a card game with a progress bar. Every number below is
   sized so that never happens.

   PAYOUT, at full rate. A round is ~50 actions and takes 2-4 minutes.
     +1 Adoration and +0.5 Overclock charge per card cleared (35 cards)
     +15 Adoration and +8 charge for a full clear
     Par is finishing with PAR (5) or fewer cards on the tableau. A par round
     pays +5 Adoration per round of the current par streak, capped at 4
     (+5, +10, +15, +20).
   So the best round there is pays 70 Adoration and 25.5 charge, and a
   typical attentive round (~30 cleared, par half the time) about 35 and 15.

   Measured against what it competes with: Adoration caps at 1,000 and
   followers generate it continuously, so 70 is a pleasant top-up, never a
   strategy. 25 charge is about one Divine Directive claim (16-30), and a full
   Overclock is 100 charge for 30 seconds of +50% — so even a perfect hour at
   the table moves production by well under one percent.

   FATIGUE. The soft cap is a leaky bucket rather than a fixed hourly reset,
   so there is no cliff to wait out and no top-of-the-hour exploit:
     - each settled round adds 1 to fatigue
     - fatigue drains continuously at 3 per hour
     - a round settled at fatigue f pays 100% while f < 3, then 0.6^(f-2),
       floored at 10%: 0.6, 0.36, 0.22, 0.13, then 0.1 for good.
   Three rounds an hour — roughly ten minutes of cards — pay in full. Past
   that the table keeps playing and keeps paying something (a floor of zero
   reads as punishment for enjoying it), but a fifth round an hour is worth a
   third of the first. An hour away restores three rounds.

   THE MULLIGAN. Paid in Praise, priced as a fraction of the CURRENT Praise
   cap so it means the same thing at minute five and hour fifty: undo is 5% of
   the cap, a stock reshuffle 15%. Each is available once per round. Praise
   sitting at its cap is Praise an idle player is already wasting, which is
   exactly what a sink should consume.
   ============================================================ */
const PatienceLedger = {
    /* Measured, not chosen: over 3,000 seeded deals a greedy player with
       lookahead (a fair stand-in for someone paying attention) finishes at
       5 or fewer 48% of the time, and wins outright 3%. A first-legal-move
       player makes par 24% of the time. So par is a coin flip for an
       attentive player, and a four-round streak is a genuine run of form. */
    PAR: 5,

    ADORATION_PER_CARD: 1,
    CLEAR_ADORATION: 15,
    STREAK_ADORATION: 5,
    STREAK_CAP: 4,
    CHARGE_PER_CARD: 0.5,
    CLEAR_CHARGE: 8,

    FREE_ROUNDS: 3,
    RECOVERY_PER_HOUR: 3,
    DECAY: 0.6,
    FLOOR: 0.1,
    FATIGUE_MAX: 20,

    MULLIGAN_FRACTION: { undo: 0.05, reshuffle: 0.15 },

    /* Fatigue after draining since `since`. A timestamp in the future is
       treated as now — it would otherwise freeze recovery. */
    fatigueNow(fatigue, since, now) {
        const f = Number.isFinite(fatigue) ? Math.max(0, fatigue) : 0;
        const elapsedMs = Number.isFinite(since) ? Math.max(0, now - since) : 0;
        return Math.max(0, f - (elapsedMs / 3600000) * this.RECOVERY_PER_HOUR);
    },

    multiplier(fatigue) {
        const f = Number.isFinite(fatigue) ? Math.max(0, fatigue) : 0;
        if (f < this.FREE_ROUNDS) return 1;
        return Math.max(this.FLOOR, Math.pow(this.DECAY, f - this.FREE_ROUNDS + 1));
    },

    /* `outcome` = { cleared, won, tableauLeft }; `streak` = par rounds in a
       row BEFORE this one. Returns what to grant and the streak after it. */
    payout(outcome, { fatigue = 0, streak = 0 } = {}) {
        const mult = this.multiplier(fatigue);
        const cleared = Math.max(0, Math.min(PatienceRules.TABLEAU_CARDS, outcome.cleared | 0));
        const parMet = outcome.tableauLeft <= this.PAR;
        const nextStreak = parMet ? streak + 1 : 0;

        let adoration = cleared * this.ADORATION_PER_CARD;
        let charge = cleared * this.CHARGE_PER_CARD;
        if (outcome.won) {
            adoration += this.CLEAR_ADORATION;
            charge += this.CLEAR_CHARGE;
        }
        if (parMet) adoration += this.STREAK_ADORATION * Math.min(nextStreak, this.STREAK_CAP);

        return {
            adoration: Math.round(adoration * mult * 10) / 10,
            charge: Math.round(charge * mult * 10) / 10,
            multiplier: mult,
            parMet,
            streak: nextStreak,
        };
    },

    mulliganCost(kind, praiseCap) {
        const fraction = this.MULLIGAN_FRACTION[kind];
        if (!fraction) return Infinity;
        const cap = Number.isFinite(praiseCap) && praiseCap > 0 ? praiseCap : 0;
        return Math.max(1, Math.ceil(cap * fraction));
    },

    /* ── Normalising a hostile State.casino.solitaire ──────────────────
       mergeInto does no type checking and importSave decodes pasted text
       straight into State, so every field here can arrive as anything. As
       335f41f found, `x = x || default` is not validation: it keeps every
       truthy wrong value. Each field is checked for the type AND range it
       must have, and replaced when it is not. */
    normalise(raw, now = Date.now()) {
        const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const count = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.floor(v) : 0;
        const amount = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : 0;

        const wins = count(src.wins);
        const losses = count(src.losses);
        const out = {
            unlocked: true,
            wins,
            losses,
            // A rounds counter below wins + losses is a lie the stats panel
            // would repeat; the sum is the floor.
            rounds: Math.max(count(src.rounds), wins + losses),
            cardsCleared: count(src.cardsCleared),
            bestScore: (Number.isInteger(src.bestScore) &&
                src.bestScore >= -16 && src.bestScore <= PatienceRules.TABLEAU_CARDS) ? src.bestScore : null,
            bestTime: (typeof src.bestTime === 'number' && Number.isFinite(src.bestTime) && src.bestTime > 0)
                ? src.bestTime : null,
            parStreak: count(src.parStreak),
            bestParStreak: count(src.bestParStreak),
            fatigue: Math.min(this.FATIGUE_MAX, amount(src.fatigue)),
            fatigueAt: (typeof src.fatigueAt === 'number' && Number.isFinite(src.fatigueAt) && src.fatigueAt > 0)
                ? Math.min(src.fatigueAt, now) : 0,
            mulligans: count(src.mulligans),
            praiseSpent: amount(src.praiseSpent),
            adorationEarned: amount(src.adorationEarned),
            chargeEarned: amount(src.chargeEarned),
            round: this.normaliseRound(src.round, now),
        };
        out.bestParStreak = Math.max(out.bestParStreak, out.parStreak);
        return out;
    },

    normaliseRound(round, now) {
        if (!round || typeof round !== 'object' || Array.isArray(round)) return null;
        if (typeof round.seed !== 'number' || !Number.isFinite(round.seed)) return null;
        const moves = Array.isArray(round.moves)
            ? round.moves.filter((m) => typeof m === 'string' && /^(d|r|p[0-6])$/.test(m)).slice(0, 120)
            : [];
        return {
            seed: round.seed >>> 0,
            moves,
            undoUsed: round.undoUsed === true,
            startedAt: (typeof round.startedAt === 'number' && Number.isFinite(round.startedAt) && round.startedAt > 0)
                ? Math.min(round.startedAt, now) : now,
        };
    },
};

/* ============================================================
   PatienceApp — the seam between the card table and the economy.
   ============================================================ */
const PatienceApp = {
    APP_ID: 'solitaire',
    SHOP_ITEM: 'minigame_solitaire',

    /* Normalises once per object identity. Re-normalising on every call
       would hand each caller a fresh copy, and a caller holding the previous
       one would write its moves into an orphan. A save load or import
       replaces the object, which is exactly when it needs checking again. */
    _clean: null,
    ledger() {
        if (!State.casino || typeof State.casino !== 'object' || Array.isArray(State.casino)) {
            State.casino = {};
        }
        if (State.casino.solitaire !== this._clean || !this._clean) {
            State.casino.solitaire = PatienceLedger.normalise(State.casino.solitaire);
            this._clean = State.casino.solitaire;
        }
        return State.casino.solitaire;
    },

    /* The purchase and the unlock are two records of one fact, and a save can
       carry either without the other: the shop tab used to throw before the
       item could be bought, so anything that owns it got there some other
       way. Either one present means the app is owned. */
    reconcile() {
        const shop = State.adorationShop && typeof State.adorationShop === 'object' ? State.adorationShop : null;
        if (shop && (!shop.minigames || typeof shop.minigames !== 'object' || Array.isArray(shop.minigames))) {
            shop.minigames = {};
        }
        if (!Array.isArray(State.unlockedApps)) return;
        const bought = !!(shop && (shop.minigames[this.SHOP_ITEM] === true ||
            (shop.miniGames && shop.miniGames[this.SHOP_ITEM] === true)));
        const unlocked = State.unlockedApps.includes(this.APP_ID);
        if (bought && !unlocked) State.unlockedApps.push(this.APP_ID);
        if (unlocked && shop) shop.minigames[this.SHOP_ITEM] = true;
        this.ledger();
    },

    newSeed() {
        return (Math.floor(Math.random() * 4294967296) ^ (Date.now() & 0xffff)) >>> 0;
    },

    /* The current round's derived state, or null between rounds. */
    current() {
        const round = this.ledger().round;
        return round ? PatienceRules.replay(round.seed, round.moves) : null;
    },

    deal(seed = this.newSeed(), now = Date.now()) {
        const ledger = this.ledger();
        ledger.round = { seed: seed >>> 0, moves: [], undoUsed: false, startedAt: now };
        return this.current();
    },

    /* Plays or draws. Returns { state, result } where result is the
       settlement if this move ended the round. */
    act(move, now = Date.now()) {
        const ledger = this.ledger();
        if (!ledger.round) return null;
        const state = this.current();
        if (PatienceRules.isWon(state)) return null;
        const next = PatienceRules.apply(state, move);
        if (!next || move === 'r') return null; // reshuffle is paid; see mulligan()
        ledger.round.moves = next.moves;
        return { state: next, result: this.maybeSettle(next, now) };
    },

    /* A finished round settles itself unless a Mulligan could still change
       it — the player gets to decide whether to pay, not the timer. */
    mulligansOpen(state) {
        const round = this.ledger().round;
        if (!round || !state || PatienceRules.isWon(state)) return { undo: false, reshuffle: false };
        const last = state.moves[state.moves.length - 1];
        return {
            undo: !round.undoUsed && state.moves.length > 0 && last !== 'r',
            reshuffle: !state.reshuffled && state.waste.length >= 2,
        };
    },

    maybeSettle(state, now) {
        if (PatienceRules.isWon(state)) return this.settle(now);
        if (PatienceRules.isStuck(state)) {
            const open = this.mulligansOpen(state);
            if (!open.undo && !open.reshuffle) return this.settle(now);
        }
        return null;
    },

    mulliganCost(kind) {
        return PatienceLedger.mulliganCost(kind, State.resourceCaps?.praise);
    },

    canMulligan(kind) {
        const state = this.current();
        if (!state) return false;
        const open = this.mulligansOpen(state);
        return !!open[kind] && (State.resources?.praise || 0) >= this.mulliganCost(kind);
    },

    /* Spends Praise. Never refunds — the Praise is gone whatever the round
       does next, which is what makes it a sink rather than a loan. */
    mulligan(kind, now = Date.now()) {
        if (!this.canMulligan(kind)) return null;
        const ledger = this.ledger();
        const state = this.current();
        let next;
        if (kind === 'undo') {
            ledger.round.moves = state.moves.slice(0, -1);
            ledger.round.undoUsed = true;
            next = this.current();
        } else {
            next = PatienceRules.reshuffle(state);
            if (!next) return null;
            ledger.round.moves = next.moves;
        }
        const cost = this.mulliganCost(kind);
        State.resources.praise -= cost;
        ledger.mulligans += 1;
        ledger.praiseSpent += cost;
        return { state: next, cost, result: this.maybeSettle(next, now) };
    },

    /* Ends the round and pays it. Concedes too: a round abandoned with cards
       cleared is paid for what it cleared and costs a round of fatigue,
       which is what makes conceding a choice and not a free redeal. A round
       with no moves at all is simply withdrawn. */
    settle(now = Date.now()) {
        const ledger = this.ledger();
        const round = ledger.round;
        if (!round) return null;
        const state = PatienceRules.replay(round.seed, round.moves);
        ledger.round = null;
        if (!state.moves.length) return null;

        const won = PatienceRules.isWon(state);
        const fatigue = PatienceLedger.fatigueNow(ledger.fatigue, ledger.fatigueAt, now);
        const pay = PatienceLedger.payout({
            cleared: PatienceRules.cardsCleared(state),
            won,
            tableauLeft: PatienceRules.tableauLeft(state),
        }, { fatigue, streak: ledger.parStreak });

        /* The same grant path as Directives and offline progress, so the
           Adoration cap and the Overclock clamp/announce apply exactly as they
           do everywhere else. */
        const adoration = game.addCappedResource(State, 'adoration', State.adorationCaps.cosmetics, pay.adoration);
        if (pay.charge > 0) game.gainOverclockCharge(pay.charge);

        const score = PatienceRules.score(state);
        const elapsed = Math.max(0, now - round.startedAt);
        ledger.rounds += 1;
        if (won) ledger.wins += 1; else ledger.losses += 1;
        ledger.cardsCleared += PatienceRules.cardsCleared(state);
        ledger.bestScore = ledger.bestScore === null ? score : Math.min(ledger.bestScore, score);
        if (won && elapsed > 0) ledger.bestTime = ledger.bestTime === null ? elapsed : Math.min(ledger.bestTime, elapsed);
        ledger.parStreak = pay.streak;
        ledger.bestParStreak = Math.max(ledger.bestParStreak, pay.streak);
        ledger.fatigue = Math.min(PatienceLedger.FATIGUE_MAX, fatigue + 1);
        ledger.fatigueAt = now;
        ledger.adorationEarned += adoration;
        ledger.chargeEarned += pay.charge;

        return { won, score, cleared: PatienceRules.cardsCleared(state), adoration, charge: pay.charge,
            multiplier: pay.multiplier, parMet: pay.parMet, streak: pay.streak, elapsed, final: state };
    },

    /* What the NEXT settled round would be paid at, for the status line. */
    nextMultiplier(now = Date.now()) {
        const ledger = this.ledger();
        return PatienceLedger.multiplier(PatienceLedger.fatigueNow(ledger.fatigue, ledger.fatigueAt, now));
    },
};

/* ============================================================
   PatienceView — the table.

   Card-art hooks, for when authored art replaces the drawn faces:
     .pt-card[data-suit][data-rank] .pt-card-art   centre panel; set
         --pt-card-art (or background-image) per suit/rank
     .pt-card--seraph / --throne / --cherub / --dominion   per-house tint
     .pt-card-back      the stock's reverse
     .pt-felt           the table surface
     #pt-glyph-<suit>   the four house sigils (inline SVG symbols)
     .patience-icon / .app-glyph--patience   desktop and taskbar marks
   ============================================================ */
const PatienceView = {
    selected: 0,
    banner: null,      // { kind: 'result'|'stuck', result }
    refreshTimer: null,

    GLYPHS: {
        seraph: '<circle cx="12" cy="12" r="3.6"/>' +
            [0, 60, 120, 180, 240, 300].map((a) =>
                `<path d="M12 .8 13.7 7.2 12 8.4 10.3 7.2Z" transform="rotate(${a} 12 12)"/>`).join(''),
        // Wheels within wheels, studded with eyes.
        throne: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>' +
            '<circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
            '<circle cx="12" cy="12" r="1.6"/>' +
            '<circle cx="12" cy="3" r="2"/><circle cx="21" cy="12" r="2"/>' +
            '<circle cx="12" cy="21" r="2"/><circle cx="3" cy="12" r="2"/>',
        cherub: '<path d="M12 .8 14.6 9.4 23.2 12 14.6 14.6 12 23.2 9.4 14.6.8 12 9.4 9.4Z"/>',
        dominion: '<path d="M2.6 18.2 4 6.6l4.6 5.2L12 4l3.4 7.8 4.6-5.2 1.4 11.6Z"/><rect x="2.6" y="19.4" width="18.8" height="2.4"/>',
    },

    sprite() {
        const symbols = Object.entries(this.GLYPHS)
            .map(([suit, body]) => `<symbol id="pt-glyph-${suit}" viewBox="0 0 24 24">${body}</symbol>`).join('');
        return `<svg class="pt-sprite" aria-hidden="true" focusable="false">${symbols}</svg>`;
    },

    glyph(suit, extra = '') {
        return `<svg class="pt-suit-glyph ${extra}" aria-hidden="true" focusable="false"><use href="#pt-glyph-${suit}"/></svg>`;
    },

    root() { return document.getElementById('patience-root'); },

    open() {
        const root = this.root();
        if (!root) return;
        root.innerHTML = `
            ${this.sprite()}
            <div class="pt-toolbar" role="toolbar" aria-label="Patience controls">
                <button type="button" class="win-btn pt-btn" data-pt="deal">Deal</button>
                <button type="button" class="win-btn pt-btn" data-pt="undo"></button>
                <button type="button" class="win-btn pt-btn" data-pt="reshuffle"></button>
            </div>
            <div class="pt-felt" id="pt-felt"></div>
            <div class="pt-statusbar" id="pt-status" aria-live="polite"></div>
        `;
        root.addEventListener('click', (event) => this.onClick(event));
        // A focused card button fires on Space KEYUP; Space is "draw" here.
        root.addEventListener('keyup', (event) => {
            if (event.code === 'Space') event.preventDefault();
        });

        if (!PatienceApp.current()) PatienceApp.deal();
        this.banner = null;
        this.render();

        clearInterval(this.refreshTimer);
        // Mulligan prices follow the Praise cap, and Grace recovers in real
        // time, so the controls live on a slow tick while the window is up.
        this.refreshTimer = setInterval(() => {
            if (!this.root()) { clearInterval(this.refreshTimer); this.refreshTimer = null; return; }
            this.renderControls();
            this.renderStatus();
        }, 1000);
    },

    onClick(event) {
        const target = event.target.closest('[data-pt]');
        if (!target || !this.root()?.contains(target)) return;
        const action = target.dataset.pt;
        if (action === 'play') this.play(Number(target.dataset.col));
        else if (action === 'draw') this.draw();
        else if (action === 'deal') this.newDeal();
        else if (action === 'undo' || action === 'reshuffle') this.mulligan(action);
        else if (action === 'file') this.finish(PatienceApp.settle());
        else if (action === 'dismiss') { this.banner = null; this.newDeal(); }
    },

    play(col) {
        this.selected = col;
        const state = PatienceApp.current();
        if (!state || this.banner?.kind === 'result') return;
        const column = state.tableau[col];
        if (!column || !column.length) return;
        if (!PatienceRules.isLegalPlay(state, col)) {
            this.flash(`${PatienceRules.describe(column[column.length - 1])} does not follow ${PatienceRules.describe(PatienceRules.wasteTop(state))}.`);
            this.render();
            return;
        }
        this.flash('');
        this.after(PatienceApp.act(`p${col}`));
    },

    draw() {
        if (this.banner?.kind === 'result') return;
        this.after(PatienceApp.act('d'));
    },

    mulligan(kind) {
        const out = PatienceApp.mulligan(kind);
        if (!out) return;
        ui.log(`[Patience] Divine Mulligan: ${kind === 'undo' ? 'move withdrawn' : 'stock reshuffled'} for ${ui.formatNumber(out.cost)} Praise.`);
        this.banner = null;
        this.after(out);
    },

    newDeal() {
        const state = PatienceApp.current();
        if (state && state.moves.length) {
            // Conceding, or filing a spent spread, is paid like any finish and
            // costs a round of fatigue — so it reports what it paid.
            const result = PatienceApp.settle();
            if (result) this.announce(result, true);
        }
        this.banner = null;
        PatienceApp.deal();
        this.render();
    },

    after(out) {
        if (!out) { this.render(); return; }
        if (out.result) this.finish(out.result);
        else {
            const state = PatienceApp.current();
            this.banner = (state && PatienceRules.isStuck(state)) ? { kind: 'stuck' } : null;
            this.render();
        }
    },

    finish(result) {
        if (!result) { this.banner = null; PatienceApp.deal(); this.render(); return; }
        this.banner = { kind: 'result', result };
        this.announce(result, false);
        this.render();
    },

    announce(result, conceded) {
        const verb = result.won ? 'Spread cleared' : (conceded ? 'Round conceded' : 'Round filed');
        ui.log(`[Patience] ${verb}: ${result.cleared} cleared, +${this.fmt(result.adoration)} Adoration, +${this.fmt(result.charge)} charge.`);
    },

    fmt(value) {
        return ui.formatNumber(value, Number.isInteger(value) ? 0 : 1);
    },

    flash(text) {
        const status = document.getElementById('pt-status-note');
        if (status) status.textContent = text;
    },

    cardFace(card, { interactive = false, col = -1, playable = false, selected = false, covered = false } = {}) {
        const suit = PatienceRules.suitOf(card);
        const rank = PatienceRules.rankOf(card);
        const label = PatienceRules.RANK_LABELS[rank];
        const classes = ['pt-card', `pt-card--${suit}`];
        if (covered) classes.push('is-covered');
        if (playable) classes.push('is-playable');
        if (selected) classes.push('is-selected');
        const inner = `
            <span class="pt-card-corner"><b class="pt-rank">${label}</b>${this.glyph(suit)}</span>
            <span class="pt-card-art" aria-hidden="true">${this.glyph(suit, 'pt-suit-glyph--large')}</span>
            <span class="pt-card-corner pt-card-corner--foot" aria-hidden="true"><b class="pt-rank">${label}</b>${this.glyph(suit)}</span>`;
        if (!interactive) {
            return `<div class="${classes.join(' ')}" data-suit="${suit}" data-rank="${rank}" aria-hidden="true">${inner}</div>`;
        }
        const name = ui.escapeHtml(`${PatienceRules.describe(card)}${playable ? ', playable' : ''}`);
        return `<button type="button" class="${classes.join(' ')}" data-suit="${suit}" data-rank="${rank}"
            data-pt="play" data-col="${col}" aria-label="${name}" tabindex="-1">${inner}</button>`;
    },

    render() {
        const felt = document.getElementById('pt-felt');
        if (!felt) return;
        const state = PatienceApp.current();
        if (!state && this.banner?.kind !== 'result') { PatienceApp.deal(); return this.render(); }

        // Between rounds the table keeps showing how the last one ended.
        const view = state || this.banner.result.final;
        const legal = state ? PatienceRules.legalPlays(state) : [];
        const nonEmpty = view.tableau.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
        if (nonEmpty.length && !nonEmpty.includes(this.selected)) {
            this.selected = nonEmpty.find((i) => i > this.selected) ?? nonEmpty[0];
        }

        const columns = view.tableau.map((column, col) => {
            const cards = column.map((card, i) => {
                const exposed = i === column.length - 1;
                return this.cardFace(card, {
                    interactive: exposed && !!state,
                    col,
                    covered: !exposed,
                    playable: exposed && legal.includes(col),
                    selected: exposed && col === this.selected,
                });
            }).join('');
            return `<div class="pt-column" data-col="${col}">${cards || '<div class="pt-slot" aria-hidden="true"></div>'}</div>`;
        }).join('');

        const top = PatienceRules.wasteTop(view);
        const under = view.waste.length > 1 ? view.waste[view.waste.length - 2] : null;
        felt.innerHTML = `
            <div class="pt-tableau" role="group" aria-label="Tableau">${columns}</div>
            <div class="pt-lower">
                <button type="button" class="pt-stock ${view.stock.length ? '' : 'is-empty'}" data-pt="draw"
                    aria-label="Stock, ${view.stock.length} cards. Draw (Space)" ${view.stock.length && state ? '' : 'disabled'}>
                    ${view.stock.length ? '<span class="pt-card pt-card-back" aria-hidden="true"></span>' : '<span class="pt-slot" aria-hidden="true"></span>'}
                    <span class="pt-pile-count">${view.stock.length}</span>
                </button>
                <div class="pt-waste" aria-label="Waste: ${ui.escapeHtml(top === undefined ? 'empty' : PatienceRules.describe(top))}" role="img">
                    ${under !== null ? `<span class="pt-waste-under">${this.cardFace(under)}</span>` : ''}
                    ${top !== undefined ? this.cardFace(top) : ''}
                </div>
                <div class="pt-legend">
                    <span class="pt-legend-title">PATIENCE.EXE</span>
                    <span>Play a card one rank above or below the waste. Kings do not reach Aces.</span>
                    <span class="pt-keys"><kbd>&larr;</kbd><kbd>&rarr;</kbd> select &middot; <kbd>Enter</kbd> play &middot; <kbd>Space</kbd> draw</span>
                </div>
            </div>
            ${this.renderBanner(state)}
        `;
        this.renderControls();
        this.renderStatus();
    },

    renderBanner(state) {
        if (!this.banner) return '';
        if (this.banner.kind === 'stuck') {
            const open = PatienceApp.mulligansOpen(state);
            return `
                <div class="pt-banner" role="dialog" aria-label="No moves remain">
                    <div class="pt-banner-title">Patience.exe</div>
                    <div class="pt-banner-body">
                        <p><strong>The spread is spent.</strong> ${PatienceRules.tableauLeft(state)} cards remain on the tableau.</p>
                        <p class="pt-banner-note">${open.reshuffle || open.undo ? 'A Divine Mulligan may still turn it. Otherwise, file the round.' : ''}</p>
                        <div class="pt-banner-actions">
                            <button type="button" class="win-btn pt-btn" data-pt="file">File the round</button>
                        </div>
                    </div>
                </div>`;
        }
        const r = this.banner.result;
        const rate = Math.round(r.multiplier * 100);
        const title = r.won ? 'The spread is cleared' : 'Round filed';
        return `
            ${r.won ? '<div class="pt-flourish" aria-hidden="true">' + '<i></i>'.repeat(12) + '</div>' : ''}
            <div class="pt-banner ${r.won ? 'is-won' : ''}" role="dialog" aria-label="${ui.escapeHtml(title)}">
                <div class="pt-banner-title">Patience.exe</div>
                <div class="pt-banner-body">
                    <p><strong>${ui.escapeHtml(title)}.</strong> ${r.cleared} of 35 cleared &middot; score ${r.score}${r.parMet ? ` &middot; par, streak ${r.streak}` : ''}</p>
                    <p class="pt-banner-pay">+${this.fmt(r.adoration)} Adoration &middot; +${this.fmt(r.charge)} Overclock charge${rate < 100 ? ` &middot; Grace ${rate}%` : ''}</p>
                    <div class="pt-banner-actions">
                        <button type="button" class="win-btn pt-btn" data-pt="dismiss">Deal again</button>
                    </div>
                </div>
            </div>`;
    },

    renderControls() {
        const root = this.root();
        if (!root) return;
        const state = PatienceApp.current();
        const open = state ? PatienceApp.mulligansOpen(state) : { undo: false, reshuffle: false };
        for (const kind of ['undo', 'reshuffle']) {
            const btn = root.querySelector(`[data-pt="${kind}"]`);
            if (!btn) continue;
            const cost = PatienceApp.mulliganCost(kind);
            const label = kind === 'undo' ? 'Mulligan: Undo' : 'Mulligan: Reshuffle';
            // Spent for this round says so, rather than greying out a price.
            const used = state && (kind === 'undo' ? PatienceApp.ledger().round?.undoUsed : state.reshuffled);
            btn.innerHTML = used
                ? `${label} <small>used</small>`
                : `${label} <small>${ui.escapeHtml(ui.formatNumber(cost))} Praise</small>`;
            btn.disabled = !PatienceApp.canMulligan(kind);
            btn.title = !open[kind]
                ? 'Once per round.'
                : (PatienceApp.canMulligan(kind) ? `Spend ${ui.formatNumber(cost)} Praise.` : 'Not enough Praise.');
        }
        const deal = root.querySelector('[data-pt="deal"]');
        if (deal) {
            const midRound = state && state.moves.length;
            deal.textContent = !midRound ? 'Deal' : (this.banner?.kind === 'stuck' ? 'File & Deal' : 'Concede & Deal');
        }
    },

    renderStatus() {
        const bar = document.getElementById('pt-status');
        if (!bar) return;
        const ledger = PatienceApp.ledger();
        const state = PatienceApp.current();
        const grace = Math.round(PatienceApp.nextMultiplier() * 100);
        const note = document.getElementById('pt-status-note')?.textContent || '';
        bar.innerHTML = `
            <span class="pt-pane">Left ${state ? PatienceRules.tableauLeft(state) : 0}</span>
            <span class="pt-pane">Par ${PatienceLedger.PAR} &middot; streak ${ledger.parStreak}</span>
            <span class="pt-pane">Rounds ${ledger.rounds} &middot; clears ${ledger.wins} &middot; best ${ledger.bestScore === null ? '&mdash;' : ledger.bestScore}</span>
            <span class="pt-pane ${grace < 100 ? 'is-low' : ''}" title="Payout rate. The first three rounds each hour pay in full.">Grace ${grace}%</span>
            <span class="pt-pane pt-pane--note" id="pt-status-note">${ui.escapeHtml(note)}</span>
        `;
    },

    /* Called by system's keyboard handler. Returns true when it consumed the
       key, so the desktop shortcuts (Space = Miracle) stand down only while
       this is the top window. */
    handleKey(event, topWindowId) {
        if (topWindowId !== PatienceApp.APP_ID || !this.root()) return false;
        if (event.altKey || event.ctrlKey || event.metaKey) return false;
        if (document.querySelector('#system-modal-layer .system-dialog')) return false;
        // A focused control elsewhere (a desktop icon, the Genesis menu) keeps
        // its own Enter and Space.
        const win = this.root().closest('.window');
        const target = event.target;
        if (target && target !== document.body && win && !win.contains(target)) return false;
        const state = PatienceApp.current();
        const code = event.code;

        if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown') {
            event.preventDefault();
            if (!state) return true;
            const nonEmpty = state.tableau.map((c, i) => (c.length ? i : -1)).filter((i) => i >= 0);
            if (!nonEmpty.length) return true;
            const step = (code === 'ArrowLeft' || code === 'ArrowUp') ? -1 : 1;
            const at = nonEmpty.indexOf(this.selected);
            this.selected = nonEmpty[(at + step + nonEmpty.length) % nonEmpty.length];
            this.flash('');
            this.render();
            return true;
        }
        if (code === 'Enter' || code === 'NumpadEnter') {
            event.preventDefault();
            if (this.banner?.kind === 'result') { this.banner = null; this.newDeal(); return true; }
            this.play(this.selected);
            return true;
        }
        if (code === 'Space') {
            event.preventDefault();
            this.draw();
            return true;
        }
        return false;
    },
};

/* Reconcile on load: State has already been read from storage by state.js,
   and the desktop icons and Genesis menu read unlockedApps right after. */
if (typeof State !== 'undefined') PatienceApp.reconcile();
