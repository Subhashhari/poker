# Poker Engine Architecture Walkthrough

This document provides a dense, technical overview of the multiplayer Texas Hold'em poker engine we've built. It details the core state machine, the client-server synchronization model, and the algorithms powering complex edge cases like side pots and all-ins.

> [!NOTE]
> The engine is built using Node.js for the backend and React (Vite) for the frontend, communicating via bidirectional WebSockets (`socket.io`). State is authoritative on the server and broadcasted to clients after every state mutation.

## 1. Core State Machine (Backend)

The backend architecture is modeled as a hierarchical state machine. State is completely encapsulated within OOP classes, ensuring that invalid transitions (e.g., acting out of turn) are structurally impossible.

### Hierarchy

1.  **`Game` (Game.js)**: Represents a lobby/room. Manages the player lifecycle (joining, leaving, disconnecting) and the overall game loop. It spins up a new `Round` when a hand starts and advances the dealer button sequentially.
2.  **`Round` (Round.js)**: Represents a single hand of poker. It holds the deck, manages the community cards, orchestrates the progression through the streets (Preflop -> Flop -> Turn -> River -> Showdown), and evaluates the winning hand(s) using the `HandEvaluator`.
3.  **`Street` (Street.js)**: Represents a single betting round. It maintains the localized state of player turns, current bet amount, and individual player contributions. It computes valid actions for the active player and determines when the street is complete (i.e., all non-folded, non-all-in players have matched the current bet).
4.  **`PotManager` (PotManager.js)**: A stateless utility that takes the raw contribution data from the `Street` and calculates the distribution of chips into main and side pots.

## 2. Side-Pot Resolution Algorithm

Handling side pots correctly is notoriously complex. We opted for a contribution-tier algorithm in `PotManager.js` which robustly handles arbitrary combinations of all-ins and unequal chip stacks.

### The `buildPots(contributions)` Algorithm

1.  **Extract Tiers:** We take all non-zero contributions, extract the unique amounts, and sort them ascending. These become our "tiers".
    *   *Example:* Player A puts in 100 (all-in), B puts in 300, C puts in 300. The unique tiers are `[100, 300]`.
2.  **Iterate and Deduct:** We iterate through each tier.
    *   For the first tier (100), everyone who contributed at least 100 adds 100 to the *current pot*. The 100 is then deducted from their remaining unallocated contribution.
    *   The eligible players for this pot are anyone whose initial contribution was `>= 100`.
3.  **Cap and Push:** Once a tier is processed, we create a pot object `{ amount, eligibleUUIDs }` and push it to the pots array.
4.  **Next Tier:** We move to the next tier (which represents the *marginal* difference). In our example, the next tier was 300, but 100 has already been deducted. So we process the remaining 200 from B and C, creating a side pot of 400 eligible only to B and C.

> [!IMPORTANT]
> This algorithm guarantees mathematical correctness regardless of the number of players or the distribution of their stacks, and inherently supports ties during resolution.

## 3. All-In Handling

When a player commits their entire stack, they trigger the all-in state. This requires specialized handling across multiple layers.

*   **Detection in `Street.js`:** When a player's `chipsDelta` equals their remaining `chipStack`, the action type is forcefully internally cast to `'all-in'`.
*   **Turn Skipping:** The `Street` tracks `allInUUIDs`. When determining the next acting player (`_advanceToNextActingPlayer`), the iterator actively skips over anyone in the `allInUUIDs` set, as they cannot take further actions.
*   **Board Run-Out:** `Round.js` monitors the state. If at any point the number of active, non-folded players who are *not* all-in drops to 1 or 0 (meaning no further betting is possible), the `Round` forcefully deals the remaining community cards and jumps straight to showdown.

## 4. Turn Timer and Auto-Fold

A strict 20-second turn timer is enforced on the server to prevent game stalling.

1.  **Timeout Registration:** Whenever a new action is required (or a new street starts), the server (`eventHandlers.js`) sets a Node `setTimeout` for 20,000ms.
2.  **State Verification:** If the timeout fires, it verifies that the `currentRound` and the active player UUID haven't changed (preventing race conditions where a late action overlaps with a timeout).
3.  **Forced Action:** If valid, the server forces a `{ type: 'fold' }` action on behalf of the player.
4.  **Disconnection Handling:** If a player's socket drops, they are marked as disconnected and immediately auto-folded for the current hand to prevent stalling the active game.

## 5. Client-Server Synchronization

### Server-Side Data Sanitization
Before the server broadcasts the state to the clients, it must sanitize the payload. `game.serializeForPlayer(uuid)` ensures that a client only receives their own hole cards, while opponent cards remain null (unless exposed at showdown).

### React Frontend UI Architecture
*   **Event-Driven Renders:** The frontend maintains a single `gameState` context. When the `socket.io` client receives a `game-state-updated` payload, React triggers a full top-down re-render.
*   **Component Composition:**
    *   `Table.jsx`: Calculates relative seat positioning (rotating the array so the local player is always at the bottom, position `0`), and computes `validActions` derived from the `gameState`.
    *   `ActionButtons.jsx`: A pure UI component that takes the computed `validActions` array (`['fold', 'call', 'raise']`) and renders the interactive action bar.
    *   `PlayerSeat.jsx`: Displays stack, cards, and turn indicators.
*   **Animation Synchronization:** The vertical timer countdown is driven by a `requestAnimationFrame` loop in `Table.jsx` that interpolates the current time against the `startedAt` timestamp provided by the server, ensuring smooth visual draining regardless of network latency.

> [!TIP]
> The UI utilizes CSS variables and a unified design token system in `App.css` to easily support theme adjustments and maintain the premium, glass-morphism aesthetic.
