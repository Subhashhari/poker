# Multiplayer Poker Room — Complete Technical Walkthrough

This document is an exhaustive technical guide explaining every layer of the poker application. It is designed to prepare you to explain the system's architecture, design decisions, individual file responsibilities, core algorithms, and the underlying OS/Browser/Network mechanics in a senior-level technical interview setting. 

It explicitly addresses "happy path" mechanics as well as load-bearing edge cases (ties, action order, race conditions, resilience) and low-level system execution.

---

## 1. High-Level Architecture & Tech Stack Justification

The application is a full-stack JavaScript project utilizing a monolithic but strictly decoupled backend (game engine + networking) and a purely declarative frontend.

### Technologies Chosen & Why
*   **Backend (Node.js & Express):** Chosen for its non-blocking, event-driven architecture which is perfectly suited for real-time WebSocket applications. The game engine requires fast execution and managing multiple concurrent timers (like the 20-second turn timer), which Node handles natively via the event loop.
*   **Networking (Socket.io):** Chosen over raw WebSockets because it natively supports automatic reconnection logic, room-based broadcasting, and fallbacks. 
*   **Frontend (React 19 & Vite):** React's declarative nature (`UI = f(state)`) aligns perfectly with our architecture: the server calculates and broadcasts a sanitized game state, and React simply renders it. No game logic exists on the client. 
*   **Database (PostgreSQL via Supabase) & `pg`:** Relational data modeling is strictly required for this project to track a player's lifetime statistics and every action per round using rigorous foreign key relationships.
*   **Authentication (JWT & bcryptjs):** Stateless JWT authentication secures the REST API (`/api/*`). *Note on Socket Auth:* To minimize latency and simplify reconnection, Socket.io connections do not currently enforce a JWT handshake middleware; instead, identity is verified against the UUID generated and verified by the API layer.
*   **Animations (Framer Motion):** Essential for the "High-End UI". It allows for physics-based springs and smooth layout transitions (e.g., cards dealing) without complex CSS keyframes.

### Production Constraints & Resilience
*   **State Durability:** The entire live game state resides **in-memory** within the Node process. A server crash mid-hand will lose active game state. This is a deliberate scope decision for speed; a true production system would require snapshotting the event-sourced actions to Redis or Postgres after every turn to enable crash recovery.
*   **Scaling:** Because the `RoomManager` holds state in-memory, the backend is limited to a single Node process. Horizontal scaling would require a Redis adapter for Socket.io, sticky sessions, and migrating the `RoomManager` state to a shared Redis cache.

---

## 2. Backend Architecture: The Core Game Engine (`server/gameLogic/`)

The backend is where the actual game of Texas Hold'em runs. **The golden rule of this project is: The server is the absolute source of truth.** The engine is built as a strict, hierarchical Object-Oriented State Machine. 

### 1. Game Initialization & Action Order (`Round.js`)
How a hand begins is the most critical part of poker state. `Round.js` handles the complex initialization of the Dealer Button and Blinds, which dictates the entire action order:
*   **Heads-Up (2-Player) Edge Case:** Standard poker rules invert the blinds in Heads-Up play. `Round.js` explicitly handles this: if `players.length === 2`, the Dealer is the Small Blind (`smallBlindIndex = dealerIndex`), and the other player is the Big Blind. If `> 2` players, the Small Blind is `dealer + 1` and Big Blind is `dealer + 2`.
*   **First-To-Act:** Preflop, action starts left of the Big Blind. Postflop, action starts left of the Button. `Round.js` computes this `firstToActIndex` dynamically and passes it to `Street.js`.
*   **Posting Blinds:** Blinds are forced bets. `Round.js` invokes `_postBlind()` before the street officially begins, forcefully deducting chips and logging the action.

### 2. Street Execution & Rules (`Street.js`)
*   **Responsibility:** Manages the localized state of a single betting round (e.g., the Flop).
*   **Turn Tracking:** Maintains a `needsToAct` Set. A street is complete when this Set is empty (meaning all non-folded, non-all-in players have matched the `currentBet`).
*   **Betting Rules:** Validates `fold`, `check`, `call`, `bet`, and `raise`. *Note on Min-Raise:* The engine ensures a raise is greater than the current bet, but the strict "raise must be 2x the previous bet increment" rule is simplified in this version for UX fluidity. 

### 3. The Banker & Side-Pots (`PotManager.js`)
When players with different stack sizes go All-In, multiple side pots must be calculated mathematically. `PotManager.js` handles this using a **Contribution-Tier Algorithm**:
1.  **Extract Tiers:** Look at all chips contributed. Find the unique amounts and sort them ascending. (e.g., A puts in 100, B puts in 300, C puts in 300. Tiers = `[100, 300]`).
2.  **Iterate & Deduct:** For the first tier (100), everyone who contributed *at least* 100 adds 100 to a "Main Pot". Deduct 100 from their remaining contribution. 
3.  **Next Tier:** For the marginal difference of 200, only B and C have money left. They form a Side Pot of 400.
*   **Eligibility vs. Contribution:** A critical rule of poker: folded players' chips stay in the pot, but they cannot win it. `PotManager` tracks `foldedUUIDs` separately from `contributions`. A player is only eligible for a pot tier if they contributed enough *and* are not in `foldedUUIDs`.

### 4. Showdown & Tie-Breakers (`Round.js` & `HandEvaluator.js`)
*   **Hand Evaluator:** Uses a combination generator (`combinations()`) to find the best 5-card hand from 7 cards. Ranks are mapped to numerics (A=14) for fast comparison.
*   **Tie Resolution & Odd Chips:** When hands perfectly match, the pot is split. `Round.js` calculates `share = Math.floor(pot / winners.length)` and handles the **Odd-Chip Distribution** by giving the `remainder` (modulo) to the first winner in the array, ensuring absolute chip conservation across the hand without leaking decimals.

### 5. Fair Shuffling (`Deck.js`)
*   **Implementation:** The deck uses an O(N) in-place **Fisher-Yates Shuffle**. 
*   **RNG Quality:** It currently utilizes `Math.random()`. In a real-money production environment, this must be swapped for a Cryptographically Secure Pseudo-Random Number Generator (CSPRNG) like Node's `crypto.getRandomValues()` to prevent PRNG state-prediction attacks.

---

## 3. Under the Hood: Networking, OS, & Browser Internals

This section breaks down the low-level physical and logical execution of the game, answering exactly what happens between a user clicking "Raise" and the chips moving on everyone's screen.

### 1. Network Layer: TCP & WebSocket Upgrade
*   **The Handshake:** When the React app boots, it sends a standard HTTP 1.1 GET request to the Node server with the headers `Connection: Upgrade` and `Upgrade: websocket`. The server responds with `HTTP 101 Switching Protocols`.
*   **The Pipeline:** The connection stops being stateless HTTP and becomes a persistent, full-duplex TCP stream. 
*   **Engine.IO Heartbeats:** TCP keepalive mechanisms are notoriously slow to detect dead connections (sometimes taking up to 2 hours). Socket.io's underlying transport (`Engine.IO`) sends tiny ping/pong packets every few seconds over the TCP tunnel. If a ping times out, the server instantly knows a client's Wi-Fi dropped and triggers the `disconnect` event, allowing `RoomManager` to auto-fold them.

### 2. OS Level: Node.js & `libuv`
How does a single Node process handle thousands of sockets simultaneously without freezing? 
*   **Event-Driven I/O:** The V8 engine (which runs the JS) is strictly single-threaded. However, Node delegates the actual socket network listening to the OS via a C++ library called `libuv`.
*   **`epoll` / `kqueue`:** `libuv` uses highly efficient OS-level notification systems (`epoll` on Linux, `IOCP` on Windows). When a packet arrives from a player hitting "Raise", the OS hardware interrupt triggers `epoll`, which instantly pushes a callback to Node's Event Queue. The V8 main thread picks it up when idle, executing `socket.on('player-action')`.

### 3. Server-Side Execution: Timer Race Conditions
*   **The Race Condition:** A notorious edge case is a player acting at 19.9 seconds, creating a race condition between their valid action arriving in the Event Queue and the 20-second auto-fold `setTimeout` firing. 
*   **The Fix:** Because V8 executes one event loop tick at a time, the action and the timeout cannot execute *simultaneously*—one will win. If the timeout wins, `eventHandlers.js` proactively re-validates the state (`currentStreet.getCurrentPlayerUUID() !== currentUUID`) inside the callback before forcing the fold, rendering the race condition harmless.

### 4. Client-Side Browser Internals: React & V8 Rendering
What happens in the browser when the server broadcasts `game-update`?
*   **JSON Parsing:** The binary WebSocket frame arrives via the browser's Network Thread. V8 allocates memory on the heap, parses the raw JSON string into deeply nested JavaScript objects (`gameState`), and passes it to React.
*   **Reconciliation (Virtual DOM):** React calls `setGameState`. It builds a new Virtual DOM tree in memory and runs its diffing algorithm (O(N)) against the old tree. It discovers exactly what changed (e.g., the pot integer increased, the active player UUID changed).
*   **DOM Commit & Layout:** React commits these specific changes to the actual browser DOM (the C++ layout engine, e.g., Blink/WebKit). The browser calculates CSS styles, generates a Layout Tree, paints the pixels, and composites the layers onto the screen via the GPU.

### 5. Animation Internals (`Table.jsx` Timer)
*   Instead of CSS transitions (which desync due to network latency), `Table.jsx` uses a `requestAnimationFrame` (rAF) loop to continuously shrink the timer bar.
*   **Why rAF?** It hooks directly into the browser's hardware refresh rate (typically 60Hz or 120Hz). The browser pauses execution, waits until the *exact moment* before it paints the next frame, and invokes the callback. This syncs JavaScript execution perfectly with the GPU, preventing jank, screen tearing, and layout thrashing while mathematically interpolating `Date.now()` against the server's `startedAt` timestamp.

---

## 4. Testing & Code Quality

*   **Test-Driven Logic (`server/gameLogic/__tests__/`):** The claim of "immense testability" is backed by a robust suite of integration and unit tests covering every class. The pure OOP nature of the engine (no Socket dependencies in `gameLogic/`) allows for headless, deterministic simulations of thousands of hands to ensure chip conservation invariants and side-pot math never fail.

## Summary

By strictly isolating the pure game logic (OOP state machine) from the networking layer (Socket.io) and keeping the frontend as a dumb rendering engine (`UI = f(state)`), the application gracefully solves complex, asynchronous poker mechanics (side pots, all-in fast-forwarding, timer race conditions, and disconnects) while maintaining structural integrity from the V8 event loop down to the TCP socket layer.
