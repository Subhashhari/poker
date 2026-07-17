# Multiplayer Poker Room — Project Overview

A real-time, multiplayer Texas Hold'em poker web application built with a custom game engine, live WebSocket networking, and a unique Brutalist/Kinetic Typography design system.

## 1. Features
* **Custom Texas Hold'em Engine:** Built from scratch to handle evaluating hands, splitting pots, determining winners, and validating real-world poker rules (like minimum raises and blinds).
* **Real-time Multiplayer:** Uses `Socket.io` for millisecond-latency syncing between the server state and all active clients in a game room.
* **Authentication & Persistence:** Secure JWT-based authentication system backed by bcrypt password hashing and PostgreSQL for storing user profiles and stats.
* **Comprehensive Stats:** Tracks player histories, win rates, net profit, and playstyles (like aggression and fold frequencies) on a detailed user profile and global leaderboard.
* **High-End UI:** A sharp, dark-themed "Brutalist" aesthetic with scalable typography, custom CSS animations, and Framer Motion.

## 2. Tech Stack & Frameworks

### Frontend
- **React (v19):** UI library for building component-based interfaces.
- **Vite:** Next-generation frontend tooling for fast development and building.
- **Framer Motion:** For complex, smooth animations and transitions.
- **Lucide React:** For crisp, scalable icons.
- **Custom CSS:** Vanilla CSS emphasizing a brutalist, dynamic design system (no external UI libraries).

### Backend
- **Node.js + Express:** Core server framework and API routing.
- **Socket.io:** Bidirectional, real-time event-based communication.
- **PostgreSQL (Supabase) + pg:** Relational database for persistence (users, stats, etc.).
- **bcryptjs & jsonwebtoken:** Security stack for password hashing and stateless session management.
- **Jest:** Testing framework for game engine logic.

---

## 3. Technical Implementation Details

### Core Game State Machine (Backend)
The backend architecture is modeled as a hierarchical state machine. State is fully encapsulated within OOP classes in `server/gameLogic`, ensuring that invalid transitions (e.g., acting out of turn) are structurally impossible.
*   **Game:** Represents a lobby/room. Manages the player lifecycle and overall game loop.
*   **Round:** Represents a single hand of poker. It holds the deck, manages the community cards, orchestrates the progression through streets, and evaluates the winning hand using the `HandEvaluator`.
*   **Street:** Represents a single betting round (Preflop, Flop, Turn, River). Maintains localized state of player turns, current bets, and individual player contributions.
*   **PotManager:** A stateless utility that takes raw contribution data from a Street and calculates the distribution of chips into main and side pots.

### Data Synchronization & Networking
*   **UI = f(state):** React state is updated automatically when a socket message is received. The server is the single source of truth; the client never computes game state.
*   **Server-Side Sanitization:** Before broadcasting the state, `game.sanitizeForPlayer(uuid)` ensures each client only receives their own hole cards. Opponent cards are sent as null until showdown.
*   **Single Socket Instance:** A single shared socket instance (`socketClient.js`) is used on the frontend to avoid multiple connections.

### Complex Edge Cases Handling
#### Side-Pot Resolution Algorithm
Side pots are handled via a robust contribution-tier algorithm in `PotManager.js`:
1.  Extracts all unique contribution amounts (tiers).
2.  Iterates through tiers, deducting the tier amount from each eligible player's remaining contribution to build a pot for that tier.
3.  Guarantees mathematical correctness regardless of stack sizes and inherently supports ties during resolution.

#### All-In Scenarios
When a player's `chipsDelta` equals their remaining stack, their action is cast to `'all-in'`.
*   **Turn Skipping:** The `Street` iterator actively skips over players in the `allInUUIDs` set.
*   **Board Run-Out:** If the number of active, non-all-in players drops to 1 or 0, `Round.js` forcefully deals the remaining community cards and jumps straight to showdown.

#### Turn Timer and Auto-Fold
A strict 20-second turn timer prevents game stalling:
1.  When a turn starts, the server sets a 20,000ms `setTimeout`.
2.  If the timeout fires and the active player UUID/round hasn't changed, the server forces a `{ type: 'fold' }` action for that player.
3.  Disconnected players are also immediately auto-folded for the current hand.
