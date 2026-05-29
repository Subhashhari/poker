-- Users
CREATE TABLE IF NOT EXISTS users (
  uuid            UUID PRIMARY KEY,
  name            VARCHAR(50) UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  chips_bought    INT DEFAULT 1000,   -- incremented on each game join and each rebuy
  created_at      TIMESTAMP DEFAULT NOW()
);

-- Games
CREATE TABLE IF NOT EXISTS games (
  id              SERIAL PRIMARY KEY,
  room_id         VARCHAR(6) NOT NULL,
  started_at      TIMESTAMP DEFAULT NOW(),
  finished_at     TIMESTAMP,
  player_count    INT
);

-- Per-player result for each game
CREATE TABLE IF NOT EXISTS game_players (
  game_id         INT REFERENCES games(id),
  user_uuid       UUID REFERENCES users(uuid),
  starting_stack  INT,
  final_stack     INT,
  placement       INT,        -- 1st, 2nd, 3rd etc. by chip count at end
  rounds_won      INT DEFAULT 0,
  went_all_in     INT DEFAULT 0,   -- count of all-in actions across the game
  PRIMARY KEY (game_id, user_uuid)
);

-- Rounds within a game
CREATE TABLE IF NOT EXISTS rounds (
  id              SERIAL PRIMARY KEY,
  game_id         INT REFERENCES games(id),
  round_number    INT,
  winner_uuid     UUID REFERENCES users(uuid),
  is_tie          BOOLEAN DEFAULT FALSE,
  pot             INT,
  ended_at        TIMESTAMP DEFAULT NOW()
);

-- Every action on every street (used for replay and aggression stats)
CREATE TABLE IF NOT EXISTS round_actions (
  id              SERIAL PRIMARY KEY,
  round_id        INT REFERENCES rounds(id),
  street          VARCHAR(10),        -- preflop / flop / turn / river
  player_uuid     UUID REFERENCES users(uuid),
  action_type     VARCHAR(10),        -- fold / call / check / raise / bet / blind / all-in
  amount          INT DEFAULT 0,
  action_order    INT,                -- sequence number within the round, 0-indexed
  acted_at        TIMESTAMP DEFAULT NOW()
);

-- Hole cards per player per round (for replay — all hands visible in replay)
CREATE TABLE IF NOT EXISTS round_hole_cards (
  round_id        INT REFERENCES rounds(id),
  player_uuid     UUID REFERENCES users(uuid),
  card1_suit      VARCHAR(10),
  card1_rank      VARCHAR(2),
  card2_suit      VARCHAR(10),
  card2_rank      VARCHAR(2),
  PRIMARY KEY (round_id, player_uuid)
);

-- Community cards per round (for replay)
CREATE TABLE IF NOT EXISTS round_community_cards (
  round_id        INT REFERENCES rounds(id),
  card_order      INT,                -- 0-4: flop=0,1,2 turn=3 river=4
  suit            VARCHAR(10),
  rank            VARCHAR(2),
  PRIMARY KEY (round_id, card_order)
);
