# Multiplayer Poker Room — A Guided Reading Path

**How to use this document.** This is not the reference doc — it's the *order* in which to read the system so it actually assembles into a mental model, plus a self-test at every stop. It is deliberately weighted toward the **network / OS / browser** layer, because that's the part that's hard to reconstruct from the code alone and the part most likely to be probed in a senior interview. The game rules are covered, but as the *payload* that the machinery moves around.

The spine of the whole thing is one sentence: **the server is the single source of truth, and the client is a pure function of the state the server broadcasts (`UI = f(state)`).** Every file either (a) computes authoritative state, (b) transports it, or (c) renders it. If you can place any file into one of those three buckets, you understand the architecture.

**Reading strategy.** Read in the numbered order. Each stop has three parts: **Why now** (the motivation — why this belongs here in the sequence), **What you're reading** (the files/classes/mechanics and how they work), and **Check yourself** (questions that fail loudly if your model is wrong). Don't skip the questions; several are designed to catch a plausible-but-wrong mental model rather than a missing fact.

A recurring convention below: a "gotcha" question is one where the obvious answer is wrong. Those map directly to the edge cases interviewers reach for.

---

## Part 0 — Orientation (read first, 5 minutes)

**Why now.** You need the map before the territory. Everything else is easier if you already hold the three-bucket model and know which folder is which.

**What you're reading.** The repo splits cleanly:

- `server/gameLogic/` — the **pure engine**. No sockets, no HTTP, no DB. Plain classes. This is bucket (a): it computes truth. It's also the only part that's unit-testable in isolation, which is *why* it's kept pure.
- `server/socket/`, `server/rooms/` — the **bridge**. Bucket (b): it moves truth across the wire and holds live sessions in memory.
- `server/routes/`, `server/db/`, `server/middleware/` — **persistence & REST**. Stats, history, auth. Not on the hot path of a live hand.
- `client/src/` — the **renderer**. Bucket (c). Holds *zero* poker logic by design.

Two invariants hold the whole thing together, and most "gotcha" questions are really asking whether you believe them:
1. **Truth invariant:** no game decision is ever made on the client. The client renders `validActions` computed by the server and emits intents; it never computes them.
2. **Chip-conservation invariant:** within a hand, chips are neither created nor destroyed — every chip that leaves a stack lands in a pot, and every pot chip lands back in a stack at showdown. (Note the phrase "within a hand" — rebuys break it *across* a session, on purpose.)

**Check yourself.**
1. Sort these into the three buckets without looking: `Deck.js`, `App.jsx`, `RoomManager.js`, `HandEvaluator.js`, `eventHandlers.js`, `Table.jsx`.
2. The client receives `validActions: ['fold','call','raise']`. Who computed that array, and why is it computed *there* rather than in `ActionButtons.jsx`?
3. [Gotcha] If the client is a "pure function of server state," what stops a modified client from simply drawing its opponents' hole cards? (Hint: the answer is not "obfuscation.")

---

## Part 1 — The physics: how bytes get from a click to the server and back

> This is the emphasis of the whole guide. Read Part 1 before you read a single line of game logic. The engine is meaningless until you know how an action *arrives* and how one process can serve everyone at once.

### Stop 1 — The transport lifecycle (HTTP → long-poll → WebSocket)

**Why now.** Before "a player clicks Raise" can mean anything, you have to know what kind of pipe that click travels through — and it isn't the pipe most people assume.

**What you're reading.** Reference §3.1, plus `client/src/socketClient.js` (the single `io()` instance).

The connection is **not** born as a WebSocket. Socket.io deliberately opens with **HTTP long-polling** first, because a plain HTTP request connects instantly and works through proxies that would choke a raw upgrade. *Then*, once traffic is flowing, Engine.IO attempts the **upgrade**: it sends an HTTP/1.1 request carrying `Connection: Upgrade` and `Upgrade: websocket`, and the server answers `101 Switching Protocols`. At that instant the socket stops being a sequence of stateless request/response pairs and becomes a **single persistent, full-duplex TCP stream** — either side can push a frame at any time, which is exactly what a real-time table needs (the server pushes `game-update` unprompted).

Two more mechanics live here:
- **Heartbeats.** Raw TCP keepalive can take *minutes to hours* to notice a dead peer. Engine.IO layers its own tiny ping/pong every few seconds on top of the TCP tunnel, so a yanked Wi-Fi cable is detected in seconds and fires `disconnect` — which is what lets the server auto-fold a vanished player instead of stalling the table.
- **The singleton.** `socketClient.js` exports *one* `io()` instance for the whole app. This matters later: every component shares one connection, so `App.jsx` can be the single place that subscribes to events.

**Check yourself.**
1. Why does Socket.io start with long-polling instead of just opening a WebSocket immediately? Name one concrete failure the fallback avoids.
2. What is physically different about the TCP connection before vs. after the `101` response?
3. [Gotcha] TCP already has keepalive. Why does Engine.IO ship its *own* heartbeat instead of relying on it? What game-level bug would the slow TCP timeout cause?
4. Why is a single shared socket instance (vs. one per component) important for the `App.jsx` design you'll read in Part 4?

### Stop 2 — One process, thousands of sockets (V8, libuv, epoll)

**Why now.** You now know a click arrives as a frame on a persistent socket. The immediate next question — the one that separates a surface answer from a real one — is *how a single-threaded runtime handles hundreds of these at once without freezing.*

**What you're reading.** Reference §3.3.

The JavaScript itself runs in **V8**, which is **strictly single-threaded** — there is exactly one thread executing your callbacks. Node doesn't block that thread on the network. Instead it hands socket-watching to **`libuv`**, a C library whose job is to ask the OS "tell me when any of these sockets has data" and not spin while waiting.

The OS mechanism `libuv` uses is an **event-notification / readiness API**: `epoll` on Linux, `kqueue` on macOS/BSD, IOCP on Windows. The end-to-end path when a "Raise" packet lands: the NIC raises a **hardware interrupt (IRQ)** → the kernel network stack processes the packet → the target socket becomes **readable** → `epoll` reports that readiness to `libuv` → `libuv` queues the corresponding JS callback → V8, when it finishes whatever tick it's on, runs `socket.on('player-action', …)`.

The crucial mental model: **the thread is never "waiting" on a socket.** It's either running a callback or idle. Idle time is spent parked in the kernel's `epoll_wait`, costing nothing. That's why one core can multiplex thousands of mostly-idle poker connections.

(Precision worth holding for interviews: network readiness goes through `epoll`/`kqueue`, *not* libuv's worker thread pool. The thread pool exists but is for things that have no async OS primitive — file system calls, DNS lookup, `crypto` — not for sockets. Muddling these is a common tell.)

**Check yourself.**
1. Trace a "Raise" packet from the network card to the line `socket.on('player-action')` executing, naming every layer.
2. If V8 is single-threaded, in what sense is Node "handling 1,000 connections concurrently"? Where does the concurrency actually live?
3. [Gotcha] Which of these use libuv's **thread pool** and which use **epoll**: reading an incoming socket, hashing a password with bcrypt, a `fs.readFile`, a DNS lookup? Why the split?
4. A junior says "Node is slow because it's single-threaded." Give the one-sentence rebuttal grounded in what the thread is actually doing while 1,000 players sit idle.

### Stop 3 — The event loop as the concurrency model (and why the timer race is harmless)

**Why now.** You've seen *where* callbacks come from. Now you need *how they're ordered*, because the whole game's correctness under concurrency rests on it — most visibly the 20-second turn timer vs. a last-millisecond action.

**What you're reading.** Reference §3.4, and `server/socket/eventHandlers.js` (the timer logic — you'll read this file fully in Part 3; here just the race).

The event loop runs callbacks **one at a time, to completion.** There is no preemption — a callback is never interrupted mid-execution by another callback. This single fact is the project's cheapest concurrency guarantee.

The classic scare: a player acts at 19.9s, and the 20s auto-fold `setTimeout` is about to fire. Two things want to touch the same player's turn. But they **cannot run simultaneously** — the loop picks one, runs it fully, then the other. So the fix is defensive re-validation: if the timeout callback *does* win the race, it first checks whether the player it was about to fold is still the one to act (`currentStreet.getCurrentPlayerUUID() !== currentUUID`). If the real action already advanced the turn, the timeout sees it's stale and does nothing. The race is real; the corruption is impossible.

**Check yourself.**
1. Why can two JS callbacks never corrupt shared state through a classic data race, the way two OS threads could?
2. [Gotcha] Given callbacks run to completion, walk through *both* orderings (action-first, timeout-first) and show that each ends in a correct, single fold-or-action — never a double action.
3. What specific check inside the timeout callback makes a "stale" timeout a no-op? What state is it reading to decide?
4. Suppose one `player-action` handler did heavy synchronous work for 500ms. What happens to *every other* table's responsiveness during those 500ms, and why? (This is the flip side of the single-thread guarantee.)

---

## Part 2 — The source of truth: the pure engine (`server/gameLogic/`)

> Read this bottom-up: leaves first (no dependencies), then the classes that compose them. That order mirrors how the objects actually depend on each other, so nothing references something you haven't read. This whole part is bucket (a) — no network, no DB, fully unit-testable.

### Stop 4 — `Deck.js` (the leaf: randomness)

**Why now.** It depends on nothing, and its one interesting property (fairness) is a self-contained topic.

**What you're reading.** A 52-card deck, shuffled with an **in-place Fisher-Yates** (O(n), unbiased *if* the RNG is uniform), dealt by popping off the top.

The honest caveat lives here: the shuffle currently draws from **`Math.random()`**, which is fast but **not cryptographically secure** — its internal state can be reconstructed from observed outputs, so in a real-money setting an attacker could in principle predict upcoming cards. The production fix is a **CSPRNG** (`crypto.getRandomValues()` / `crypto.randomInt`). Know this as a *declared scope decision*, not an oversight.

**Check yourself.**
1. Why is Fisher-Yates unbiased, and what's the classic "naïve shuffle" bug it avoids?
2. [Gotcha] `Math.random()` and a CSPRNG can both produce a shuffled deck. Precisely what attack does the CSPRNG prevent that `Math.random()` doesn't — and does it matter for a play-money game?

### Stop 5 — `HandEvaluator.js` (the judge)

**Why now.** Also a leaf. Showdown logic in `Round` depends on it, so read it before `Round`.

**What you're reading.** Given 7 cards (2 hole + 5 board), it generates all **21** five-card combinations (`C(7,5)`), scores each, and keeps the best. Ranks map to numerics (A=14) so comparison is integer math; it detects flushes/straights and sorts rank-frequencies to find pairs/trips/quads, returning a `handRank` (0–8) plus an ordered `values` array for **kicker tie-breaking**.

**Check yourself.**
1. Why 21 combinations specifically? Where does that number come from?
2. Two players both have "a pair of kings." What exactly does the evaluator compare next, and what is the `values` array *for*?

### Stop 6 — `PotManager.js` (the banker)

**Why now.** Independent of betting flow — it's a near-pure function from contributions to pots. Read it before `Street`/`Round`, which hand it their raw numbers. This is the single densest correctness surface in the codebase.

**What you're reading.** The **Contribution-Tier algorithm** for side pots. Collect every player's total contribution, take the **unique amounts sorted ascending** as tiers, and for each tier, every player who put in *at least* that much contributes the tier delta to that pot. Complexity is O(n log n), dominated by the sort — no recursion, no fractions.

Two rules that are easy to get wrong and are prime interview targets:
- **Eligibility ≠ contribution.** A player who folded leaves their chips in the pot but **cannot win** it. `PotManager` tracks `foldedUUIDs` separately: you're eligible for a tier only if you contributed enough *and* didn't fold.
- **Uncalled-bet return (a known gap).** If you bet 1000 and the largest opposing stack can only cover 200, the extra 800 was never contested and should be handed straight back. The current code returns it *implicitly* — by making you the sole eligible player of an 800 side pot you inevitably win — which conserves chips but **inflates the displayed `potTotal` mid-hand.** The clean fix is to refund the top-tier delta up front when exactly one contributor sits in it.

**Check yourself.**
1. A: 100, B: 300, C: 300. List the pots, their sizes, and who's eligible for each.
2. [Gotcha] A folded player contributed 500 before folding. Can they win anything? Where do those 500 chips end up, and via what mechanism?
3. [Gotcha] Three players all-in for 100 / 300 / 300, but the 100-stack player has the best hand. Which pot(s) can they actually win, and why can't they scoop the whole thing?
4. Explain the uncalled-bet display bug in one sentence, then state the two-line fix.
5. Why is showdown resolved **pot-by-pot from the smallest eligibility set outward**, rather than "best hand takes the whole thing"?

### Stop 7 — `Street.js` (one betting round)

**Why now.** It consumes `PotManager`'s worldview and is consumed by `Round`. It's where "whose turn" and "is the round over" live.

**What you're reading.** A single betting phase (say, the flop). It tracks `currentBet`, computes each action's `chipsDelta`, validates `fold/check/call/bet/raise`, and — the heart of it — maintains a **`needsToAct` Set**. The street is **complete when that Set is empty**: every non-folded, non-all-in player has matched the current bet.

Two edges to hold:
- **Min-raise (known simplification).** Real poker requires a raise to be at least the previous bet *plus the last raise increment*. This version simplifies to "must exceed the current bet." Declared, not accidental.
- **The big-blind option.** Preflop, if everyone just calls the big blind, the BB has technically already "matched" — but they still get the **option** to raise. So the BB must remain in `needsToAct` until they actually act, or the street would wrongly close on them. This is the canonical "does your round-termination logic actually terminate correctly" test.

**Check yourself.**
1. What is the exact, precise condition under which a street ends? (State it in terms of `needsToAct`.)
2. When someone raises, why must *previously-acted* players be put **back** into `needsToAct`?
3. [Gotcha] Everyone limps preflop and the bet is already "matched." Why does the street *not* end immediately — what keeps it open, and for whom?
4. [Gotcha] A player calls for exactly their whole stack. How does the engine reclassify that action, and why must they then be *removed* from `needsToAct` permanently even though they haven't "matched" a later raise?

### Stop 8 — `Round.js` (one whole hand)

**Why now.** It orchestrates everything below it — Deck, Street, PotManager, HandEvaluator — so it only makes sense after them. This is where a hand is *born*, which is the most error-prone moment in poker.

**What you're reading.** `Round` runs a hand preflop → flop → turn → river → showdown. Its hardest job is **initialization**, because action order flows entirely from the button and blinds:
- **Button & blinds.** Small blind is `dealer + 1`, big blind `dealer + 2`… **except heads-up (2 players), where it inverts:** the dealer *is* the small blind. Getting this wrong silently corrupts every action order at a 2-handed table.
- **First to act.** Preflop, action starts left of the **big blind**; postflop, left of the **button**. `Round` computes `firstToActIndex` per street and hands it to `Street`.
- **Posting blinds** via `_postBlind()` — forced bets deducted and logged *before* the street opens.
- **Fast-forward all-ins.** If `(active players) − (all-in players) ≤ 1`, no betting remains, so `Round` instantly deals any missing board cards and jumps to showdown rather than pantomiming empty betting rounds.
- **Showdown & ties.** Uses `HandEvaluator`, then splits with `share = floor(pot / winners)` and awards the **odd-chip remainder to the first winner**, preserving exact chip conservation (no fractional chips leak). Multiple side pots are awarded **independently**, each to the best hand among *that pot's* eligible players.

**Check yourself.**
1. Reconstruct the seating math for both a 5-handed and a 2-handed table: who posts which blind, and who acts first pre- and post-flop?
2. [Gotcha] Why does heads-up invert the blinds, and what breaks if you forget the special case?
3. Under what precise condition does `Round` trigger the all-in fast-forward, and what work does it skip?
4. Pot of 7 splits between 2 winners. Who gets 4 and who gets 3, and what invariant does that rule protect?
5. Two side pots exist and different players win each. Walk the award sequence — why can't you just find "the best hand" once?

### Stop 9 — `Game.js` (the session)

**Why now.** It wraps `Round` and manages everything *between* hands — the outermost engine layer, so read it last in Part 2.

**What you're reading.** The lobby/session across many hands: advancing the **dealer button** each hand, **busting** players who hit 0 chips, `handleRebuy()` for eliminated players, and — critically for the network layer — **`sanitizeForPlayer(uuid)`**, which strips every *other* player's hole cards out of the JSON before it's broadcast. Sanitization is the structural (not cosmetic) reason a modified client can't see opponents' cards: **the data simply isn't in the payload sent to them.**

Note the invariant boundary: chip conservation holds **per hand**, but `handleRebuy()` deliberately injects new chips **across the session** — so any test asserting conservation must scope itself to a single hand.

**Check yourself.**
1. Why is `sanitizeForPlayer` the *actual* anti-cheat, and how does it differ from hiding cards with CSS on the client?
2. [Gotcha] Your chip-conservation test sums all stacks + pots before and after. When does it legitimately fail, and how do you scope the assertion so a rebuy doesn't look like a bug?

---

## Part 3 — The bridge: networking & persistence

> Now connect the sealed engine to the outside world. The theme: the engine has exactly **one door**, and that door's security and resync behavior is where the live system lives or dies.

### Stop 10 — `eventHandlers.js` (the only bridge)

**Why now.** This is the *sole* file where the network touches the engine. Everything you learned in Parts 1–2 converges here.

**What you're reading.** It listens for `player-action`, `create-room`, `join-room`; resolves the `Room` via `RoomManager`; calls `room.game.processAction(...)`; and on success calls `sanitizeForPlayer` and emits `game-update`. It also owns:
- **The turn-timer system:** a `Map` of `setTimeout`s, one per active turn, cleared/reset on every valid action, force-folding on expiry (with the stale-check from Stop 3).
- **Disconnect handling:** on the `disconnect` event, mark the player disconnected and auto-fold them if it's their turn.
- **Reconnection resync (Stop 11's other half):** re-bind the new `socket.id`, then push a fresh `sanitizeForPlayer(uuid)` snapshot to that one socket so their React tree heals to the true board/pot.

**Check yourself.**
1. Why is it architecturally valuable that this is the *only* file importing both `socket` and `gameLogic`? What does that buy you for testing?
2. Trace what this file does, in order, from receiving a valid `player-action` to every client seeing the update.
3. Why keep timers in a `Map` keyed per turn rather than a single global timer variable?

### Stop 11 — `RoomManager.js` + reconnection binding

**Why now.** `eventHandlers` leans on it for every lookup, and it holds the mutable identity map that reconnection repairs.

**What you're reading.** In-memory tracking of all lobbies, 6-char room codes, and the lobby→`Game` transition on host start. The subtle part is **identity binding**: a reconnecting player gets a **brand-new `socket.id`**, so something must re-associate that fresh id with their existing seat/stack. That "something" lives here and in `eventHandlers` — and (see next stop) the fact that it currently trusts a client-supplied UUID is the security hole.

**Check yourself.**
1. Why does a reconnect produce a new `socket.id`, and what exactly must be re-bound so the player keeps their seat and chips?
2. [Gotcha] "Socket.io reconnected automatically, so reconnection is solved." Why is that only the *easy half*? What does the transport reconnecting *not* do for you?

### Stop 12 — The socket-auth vulnerability (read this deliberately)

**Why now.** It's the sharpest contradiction in the system and the highest-value thing to be able to discuss honestly.

**What you're reading.** Reference §3.2. The REST API is JWT-secured, but the **socket layer does not run an `io.use()` handshake to validate the JWT.** It trusts the `{ uuid }` the client puts in `player-action`. Therefore a malicious client can send *another* player's UUID and **impersonate them** — folding or shoving on their behalf. This directly violates the "server is source of truth" thesis, because identity — the one thing the server *must* own — is currently taken on the client's word. The fix: an `io.use()` middleware that validates the JWT on connect and **hard-binds `socket.id → authenticated uuid`**, after which every action derives its actor from the socket, never from the payload.

**Check yourself.**
1. State the exploit in one sentence and the fix in one sentence.
2. [Gotcha] The engine already prevents acting *out of turn* and *over-betting*. Why do those protections **not** stop this attack? (What layer is the check missing from?)
3. After the fix, where does an action's actor identity come from, and why is that unspoofable where the current approach isn't?

### Stop 13 — Persistence: `db/`, `routes/`, `middleware/`

**Why now.** Off the live hot path — read it once the real-time story is complete. It's what makes stats, profiles, and replay possible.

**What you're reading.** `db/schema.sql` models the relational chain `users → games → game_players → rounds → round_actions` (+ `round_hole_cards` for replay). `db/index.js` sets up the `pg` connection **pool**. `routes/auth.js` registers/logs-in users (bcrypt compare, JWT sign). `middleware/auth.js` verifies the JWT on `/api/*` and attaches the user UUID. `routes/api.js` runs the heavy **SQL aggregations** — grouping `round_actions` for aggression/fold %, `game_players` for net profit — and feeds `Profile`, `Leaderboard`, and `Replay`.

**Check yourself.**
1. Why a **connection pool** instead of one connection per request?
2. Which foreign-key chain makes the `Replay` feature possible, and what would you lose if `round_actions` didn't store *every* action?
3. Contrast socket auth (Stop 12) with REST auth here — why does the REST side get JWT verification "for free" per request while the socket side needs a special handshake?

---

## Part 4 — The renderer: client as `f(state)`

> The payload has crossed the wire. Watch it become pixels. Keep asking: "does this file make any poker decision?" The answer must always be *no*.

### Stop 14 — `socketClient.js` + `App.jsx` (the hub)

**Why now.** Every other component depends on the state `App` distributes; read the hub before the leaves.

**What you're reading.** `socketClient.js` is the singleton from Stop 1. `App.jsx` is the **single subscriber**: it holds global React state (`gameState`, `roomData`, `page`), listens to `game-update` / `room-update`, and calls `setState`. Each `setState` triggers React's reconciliation, cascading updates down the tree. All state flows *down*; all intents flow *up* through the shared socket.

**Check yourself.**
1. Why centralize all socket listeners in `App` rather than subscribing inside each component?
2. Draw the data-flow loop: user click → … → screen update, naming where state enters and leaves React.

### Stop 15 — Browser internals: frame → pixels

**Why now.** This is the browser-side mirror of Stop 2 and the second pillar of the "network/OS/browser" emphasis. Read it right after the hub, while the round trip is fresh.

**What you're reading.** Reference §3.6. A `game-update` frame arrives on the browser's **network thread**; V8 allocates heap and **parses the JSON** into JS objects; React `setState` builds a new **Virtual DOM** and runs its O(n) **diff** against the old tree, isolating exactly what changed (pot integer, active UUID); React **commits** only those changes to the real DOM; then the browser's C++ engine (**Blink/WebKit**) recomputes styles, builds the **layout tree**, **paints**, and **composites** layers on the **GPU**.

**Check yourself.**
1. Name every stage from "WebSocket frame arrives" to "pixels change," in order.
2. Why does React diff a *virtual* tree instead of just rewriting the DOM? What's expensive about the DOM that the VDOM sidesteps?
3. [Gotcha] The server sends a full sanitized state every update, yet the screen doesn't flicker or fully re-render. Which mechanism ensures only the pot number actually repaints?

### Stop 16 — `Table.jsx` (seat rotation + rAF timer)

**Why now.** It's the most algorithmically interesting client file and it directly consumes the browser-timing model from Stop 15.

**What you're reading.** Two ideas:
- **Seat rotation:** the server's player array is rotated (`[...players.slice(i), ...players.slice(0,i)]`) so *the local user is always Seat 0, bottom-center*, regardless of their real backend index. Pure presentation — the backend order never changes.
- **rAF timer:** instead of CSS transitions (which drift under network latency), a **`requestAnimationFrame`** loop interpolates `Date.now()` against the server's `startedAt`/`timeoutMs` to shrink the timer bar. rAF fires **right before the browser's next paint**, at the monitor's refresh rate, so the animation stays synced to the GPU and never thrashes layout.

**Check yourself.**
1. Why rotate seats on the *client* rather than sending each player a personalized array from the server?
2. [Gotcha] Why `requestAnimationFrame` instead of `setInterval(…, 16)` for the timer bar? What specifically does rAF guarantee that a timer can't? (And precisely — does rAF "pause" JS, or just schedule the callback before paint?)
3. The timer is driven by the server's `startedAt` timestamp, not a locally counted-down number. Why does that choice matter for two players on different-latency connections?

### Stop 17 — Leaf components & pages

**Why now.** Fastest to read once you hold the model; they're almost pure presentation.

**What you're reading.** `PlayerSeat.jsx` (avatar/stack/cards, anchor for chip animations), `ActionButtons.jsx` (renders the server's `validActions`, emits `player-action` — no logic), `CommunityCards.jsx` (flop/turn/river). Pages: `Landing` (auth/create/join), `Room` (wraps `Table` + host "Start"), `Profile`/`Leaderboard` (fetch REST aggregations), `Replay` (steps through a stored hand).

**Check yourself.**
1. `ActionButtons` decides *nothing* about what's legal. Where did legality come from, and why is that placement the anti-cheat design in miniature?
2. Which pages talk to the **REST API** and which talk to the **socket**, and why the split?

---

## Part 5 — Capstone: the life of a "Raise"

**Why now.** This is the exam. If you can narrate this cold, touching every layer, you understand the system. Do it out loud before reading the reference doc again.

**The trace.** Player taps Raise → `ActionButtons` emits `player-action` over the shared socket → OS/NIC IRQ → kernel → socket readable → `epoll` → `libuv` → V8 event queue → `eventHandlers.on('player-action')` (in a single uninterruptible tick) → resolves `Room` → `game.processAction` → `Street` validates, updates `needsToAct`, `chipsDelta`, `currentBet` → (maybe) `PotManager` recomputes pots → turn advances, old `setTimeout` cleared, new one armed → `sanitizeForPlayer` per client → `game-update` broadcast → each browser's network thread → V8 JSON parse → React VDOM diff → DOM commit → Blink layout/paint → GPU composite → chips visibly move; meanwhile `Table.jsx`'s rAF loop keeps the new turn's timer bar shrinking in sync.

**Check yourself.**
1. Narrate the above from memory, then check it. Every arrow you can't justify is a gap to reread.
2. At which single step is impersonation currently possible, and which one prior step would close it?
3. Which steps run on **one thread**, and why does that guarantee no two actions corrupt the pot?

---

## Part 6 — The known-gaps ledger (interview armor)

**Why now.** Senior interviews probe what you *didn't* build and whether you *know* you didn't. Being able to list these unprompted is a stronger signal than any feature.

**What you're reading.** Consolidated, each as "gap → consequence → fix":
- **Socket auth:** no JWT handshake → UUID impersonation → `io.use()` + bind `socket.id→uuid`.
- **RNG:** `Math.random()` → predictable deck for real money → CSPRNG.
- **Min-raise:** simplified "must exceed" → non-standard raise sizing → enforce previous-bet + last-increment.
- **Uncalled bet:** returned implicitly via a solo side pot → inflated mid-hand `potTotal` → refund the top-tier delta up front.
- **Durability:** all state in-memory → crash mid-hand loses live games → snapshot event-sourced actions to Redis/Postgres per turn.
- **Scale:** single Node process → no horizontal scaling → Socket.io Redis adapter + sticky sessions + shared room state.

**Check yourself.**
1. Recite all six from memory as gap → consequence → fix.
2. [Gotcha] Rank them by real-world severity for (a) a play-money demo and (b) a real-money product. Which two swap places between the lists, and why?
3. Which of these gaps are covered by the pure-engine test suite, and which are fundamentally *untestable* without the socket/DB layers? (Hint: chip conservation vs. impersonation.)

---

### A note on order

The dependency logic behind the sequence: Part 1 (physics) is prerequisite to everything. Part 2 is read leaves-first (`Deck`/`HandEvaluator`/`PotManager` → `Street` → `Round` → `Game`) because that's the real dependency graph. Part 3 bridges the sealed engine outward. Part 4 mirrors Part 1 on the browser side. Part 5 fuses them; Part 6 is the honest-limitations layer. If you ever feel lost, return to the three buckets from Part 0 — every file is *compute truth*, *move truth*, or *render truth*.
