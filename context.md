# Multiplayer Poker Room — Project Brief

## Overview

A real-time multiplayer Texas Hold'em poker web application where users can create or join rooms and play against each other. No authentication, no database, no persistence across sessions in this version.

---

## Tech Stack

- **Backend:** Node.js + Express + socket.io
- **Frontend:** React (Vite)
- **Deployment:** Railway
- **Storage:** No database — all state lives in server memory

---

## Identity

Users enter a name on the landing page. A UUID is generated client-side and stored in `localStorage`. This UUID identifies the player for reconnection purposes within the same session.

---

## Folder Structure

```
poker-app/
├── server/
│   ├── index.js                  # Express + socket.io setup, entry point
│   ├── gameLogic/
│   │   ├── Deck.js               # Card representation, shuffle, deal
│   │   ├── HandEvaluator.js      # Evaluates and ranks poker hands
│   │   ├── Game.js               # Core game state machine
│   │   ├── Round.js              # Manages streets within a round
│   │   └── Street.js             # Per-street state and betting actions
│   ├── rooms/
│   │   └── RoomManager.js        # In-memory rooms dictionary, CRUD
│   └── socket/
│       └── eventHandlers.js      # All socket.io event listeners — bridge between networking and game logic
│
├── client/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── App.jsx
│       ├── pages/
│       │   ├── Landing.jsx       # Name entry, create/join room
│       │   └── Room.jsx          # Main game view
│       ├── components/
│       │   ├── Table.jsx         # Overall table layout
│       │   ├── PlayerSeat.jsx    # Individual player display
│       │   ├── ActionButtons.jsx # Fold/Call/Check/Raise
│       │   └── CommunityCards.jsx
│       └── socket/
│           └── socketClient.js   # Single shared socket.io client instance
│
├── package.json                  # Server dependencies
└── client/package.json           # React/Vite dependencies
```

---

## Core Data Model

### Player
```javascript
{
  uuid: "uuid-v4",
  name: "string",
  chipStack: 1000,          // updated at the end of each round
  hand: [Card, Card],       // hole cards — only sent to the owning player
  status: "active" | "folded" | "all-in" | "disconnected",
  socketId: "socket.io id"
}
```
> **Note:** chip stacks live on the Player object to make future persistence easier. At the end of each round, the server explicitly reconciles each player's chipStack based on the outcome before starting the next round.

---

### Card
```javascript
{
  suit: "hearts" | "diamonds" | "clubs" | "spades",
  rank: "2" | "3" | ... | "9" | "T" | "J" | "Q" | "K" | "A"
}
```

---

### Action
```javascript
{
  playerUUID: "uuid-v4",
  type: "fold" | "call" | "check" | "raise" | "bet" | "blind",
  amount: number            // 0 for fold/check
}
```

---

### Street
```javascript
{
  name: "preflop" | "flop" | "turn" | "river",
  communityCards: [Card],   // 0 for preflop, 3 for flop, 4 for turn, 5 for river
  actions: [Action],        // ordered list of actions taken on this street
  currentBet: number        // highest outstanding bet on this street
}
```

---

### Round
```javascript
{
  roundNumber: number,
  dealerIndex: number,
  smallBlindIndex: number,
  bigBlindIndex: number,
  streets: [Street],        // in order: preflop → flop → turn → river
  pot: number,
  winnerId: "uuid-v4" | null
}
```

---

### Game
```javascript
{
  players: [Player],        // all players with their current chip stacks
  rounds: [Round],          // full history of rounds played
  currentRoundIndex: number,
  config: {
    smallBlind: 10,
    bigBlind: 20,
    maxPlayers: 6
  },
  status: "waiting" | "in-progress" | "finished"
}
```

---

### Room
```javascript
{
  id: "ABC123",             // 6-char random code
  game: Game | null,
  status: "waiting" | "in-progress"
}
```

---

### Deck (utility, not persisted in game state)
```javascript
// Deck is instantiated fresh at the start of each round
const deck = new Deck()
deck.shuffle()
deck.deal(n)                // returns n cards, removes them from deck
```
Deck is not stored in the game state. It is created, shuffled, used to deal, and discarded each round.

---

## Game State Transitions (one complete hand / round)

1. Host starts game — all players in room become active
2. Assign dealer, small blind, big blind positions (rotate each round)
3. Instantiate fresh Deck, shuffle, deal 2 hole cards to each active player
4. Create Round object, create first Street (`preflop`)
5. **Preflop:** betting starts with player after big blind; actions appended to `street.actions`
6. Betting round ends when all active players have matched `currentBet` or folded
7. Deal flop → create new Street (`flop`, 3 community cards) → betting from first active player left of dealer
8. Deal turn → new Street (`turn`, 1 card added) → betting
9. Deal river → new Street (`river`, 1 card added) → betting
10. **Showdown:** remaining players reveal hands, HandEvaluator determines winner
11. Award pot to winner, update `round.winnerId`
12. Reconcile chip stacks on all Player objects
13. Begin next round — rotate dealer, reset player statuses, new Deck

**Betting round end conditions:**
- All active (non-folded) players have matched `currentBet`, or
- Only one player remains (all others folded) — immediate win, no showdown

---

## Socket.io Event Contract

### Client → Server
| Event | Payload |
|---|---|
| `create-room` | `{ name, uuid }` |
| `join-room` | `{ name, uuid, roomId }` |
| `start-game` | `{ roomId }` |
| `player-action` | `{ roomId, uuid, action: Action }` |
| `reconnect` | `{ roomId, uuid }` |

### Server → Client
| Event | Payload |
|---|---|
| `room-created` | `{ roomId }` |
| `room-joined` | `{ roomId, players }` |
| `room-error` | `{ message }` |
| `game-started` | `{ gameState (sanitized) }` |
| `game-update` | `{ gameState (sanitized) }` |
| `action-error` | `{ message }` |
| `round-over` | `{ winner, handResult, updatedStacks }` |
| `game-over` | `{ finalStandings }` |

> **Important:** `gameState` must be sanitized before broadcast. Each player only receives their own hole cards. The server sends a different payload to each socket.

---

## Key Architectural Decisions

- `gameLogic/` has zero socket.io dependencies — pure game logic only, independently testable
- `eventHandlers.js` is the only file that touches both socket.io and game logic
- Single shared socket instance on the client (`socketClient.js`), imported wherever needed, never instantiated inside components
- **UI = f(state):** React state is updated in one place on socket message receipt; components re-render automatically
- Server is the single source of truth — the client never computes game state, only renders it
- Chip stacks are stored on the Player object and explicitly reconciled at round boundaries

---

## Out of Scope (Current Version)

- User authentication and persistent accounts
- Database or cross-session persistence
- Rule-based or AI bot opponent
- Side pot logic for all-in scenarios
- Mobile responsiveness
- Chip animations or sound

---

## Future Work

- **User auth and persistence:** UUID-based identity can be promoted to a proper user account with a database (e.g. PostgreSQL). Chip stacks living on the Player object are already structured to make this migration straightforward.
- **Bot player:** A rule-based bot can be added as a Player with `isBot: true`. The server drives its actions automatically when it is the bot's turn. Logic: compute a hand strength score 0–1, fold below 0.2, call below 0.6, raise above 0.6. No external AI required.
- **Side pots:** Handle all-in scenarios where players with different stack sizes contest different portions of the pot.
