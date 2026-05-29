import express from 'express';
import db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken); // Protect all API routes

// GET /api/stats/:uuid
router.get('/stats/:uuid', async (req, res) => {
  const { uuid } = req.params;
  try {
    const userQuery = await db.query('SELECT chips_bought FROM users WHERE uuid = $1', [uuid]);
    if (userQuery.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const chipsBought = userQuery.rows[0].chips_bought;

    const gameQuery = await db.query(`
      SELECT 
        COUNT(*) as games_played,
        COUNT(CASE WHEN placement = 1 THEN 1 END) as games_won,
        AVG(placement) as avg_placement,
        SUM(starting_stack) as total_starting,
        SUM(final_stack) as total_final,
        MAX(final_stack - starting_stack) as best_game,
        MIN(final_stack - starting_stack) as worst_game,
        SUM(rounds_won) as total_rounds_won,
        SUM(went_all_in) as total_all_ins
      FROM game_players
      WHERE user_uuid = $1
    `, [uuid]);

    const stats = gameQuery.rows[0];
    const gamesPlayed = parseInt(stats.games_played) || 0;
    
    // Actions queries
    const actionQuery = await db.query(`
      SELECT 
        COUNT(*) as total_actions,
        COUNT(CASE WHEN action_type = 'fold' THEN 1 END) as folds,
        COUNT(CASE WHEN action_type IN ('raise', 'bet', 'all-in') THEN 1 END) as aggression
      FROM round_actions
      WHERE player_uuid = $1
    `, [uuid]);
    const actions = actionQuery.rows[0];

    const roundsPlayedQuery = await db.query(`
      SELECT COUNT(DISTINCT round_id) as count
      FROM round_actions WHERE player_uuid = $1
    `, [uuid]);
    const roundsPlayed = parseInt(roundsPlayedQuery.rows[0].count) || 0;

    res.json({
      gamesPlayed,
      roundsPlayed,
      gamesWon: parseInt(stats.games_won) || 0,
      winRate: gamesPlayed ? (parseInt(stats.games_won) / gamesPlayed) : 0,
      roundsWon: parseInt(stats.total_rounds_won) || 0,
      roundWinRate: roundsPlayed ? ((parseInt(stats.total_rounds_won) || 0) / roundsPlayed) : 0,
      avgPlacement: parseFloat(stats.avg_placement) || 0,
      
      allInPercentage: roundsPlayed ? ((parseInt(stats.total_all_ins) || 0) / roundsPlayed) : 0,
      foldPercentage: parseInt(actions.total_actions) ? (parseInt(actions.folds) / parseInt(actions.total_actions)) : 0,
      aggressionFrequency: parseInt(actions.total_actions) ? (parseInt(actions.aggression) / parseInt(actions.total_actions)) : 0,

      chipsBought,
      chipsWon: parseInt(stats.total_final) || 0,
      netProfit: (parseInt(stats.total_final) || 0) - chipsBought,
      bestGame: parseInt(stats.best_game) || 0,
      worstGame: parseInt(stats.worst_game) || 0,
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/games?uuid=<uuid>&limit=20&offset=0
router.get('/games', async (req, res) => {
  const { uuid, limit = 20, offset = 0 } = req.query;
  if (!uuid) return res.status(400).json({ error: 'UUID required' });

  try {
    const listQuery = await db.query(`
      SELECT 
        g.id as "gameId",
        g.room_id as "roomId",
        g.started_at as "startedAt",
        g.finished_at as "finishedAt",
        g.player_count as "playerCount",
        gp.placement,
        gp.starting_stack as "startingStack",
        gp.final_stack as "finalStack",
        gp.rounds_won as "roundsWon"
      FROM games g
      JOIN game_players gp ON g.id = gp.game_id
      WHERE gp.user_uuid = $1
      ORDER BY g.started_at DESC
      LIMIT $2 OFFSET $3
    `, [uuid, limit, offset]);

    // get total for pagination
    const countQuery = await db.query(`
      SELECT COUNT(*) as total FROM game_players WHERE user_uuid = $1
    `, [uuid]);

    res.json({
      games: listQuery.rows,
      total: parseInt(countQuery.rows[0].total) || 0
    });
  } catch (error) {
    console.error('Games list error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/games/:gameId/rounds
router.get('/games/:gameId/rounds', async (req, res) => {
  try {
    const roundsQuery = await db.query(`
      SELECT id, round_number as "roundNumber", winner_uuid as "winnerUUID", is_tie as "isTie", pot, ended_at as "endedAt"
      FROM rounds
      WHERE game_id = $1
      ORDER BY round_number ASC
    `, [req.params.gameId]);

    res.json({ rounds: roundsQuery.rows });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/games/:gameId/rounds/:roundId/replay
router.get('/games/:gameId/rounds/:roundId/replay', async (req, res) => {
  const { gameId, roundId } = req.params;
  try {
    const roundQuery = await db.query('SELECT * FROM rounds WHERE id = $1', [roundId]);
    if (roundQuery.rows.length === 0) return res.status(404).json({ error: 'Round not found' });
    const round = roundQuery.rows[0];

    const playersQuery = await db.query(`
      SELECT u.uuid, u.name 
      FROM game_players gp 
      JOIN users u ON gp.user_uuid = u.uuid 
      WHERE gp.game_id = $1
    `, [gameId]);

    const communityCards = await db.query('SELECT * FROM round_community_cards WHERE round_id = $1 ORDER BY card_order ASC', [roundId]);
    
    const holeCards = await db.query('SELECT * FROM round_hole_cards WHERE round_id = $1', [roundId]);
    const holeCardsMap = {};
    for (const hc of holeCards.rows) {
      holeCardsMap[hc.player_uuid] = [
        { suit: hc.card1_suit, rank: hc.card1_rank },
        { suit: hc.card2_suit, rank: hc.card2_rank }
      ];
    }

    const actionsQuery = await db.query(`
      SELECT ra.street, ra.player_uuid as "playerUUID", u.name as "playerName", ra.action_type as "actionType", ra.amount, ra.action_order as "actionOrder"
      FROM round_actions ra
      JOIN users u ON ra.player_uuid = u.uuid
      WHERE ra.round_id = $1
      ORDER BY ra.action_order ASC
    `, [roundId]);

    res.json({
      roundNumber: round.round_number,
      players: playersQuery.rows,
      holeCards: holeCardsMap,
      communityCards: communityCards.rows.map(c => ({ suit: c.suit, rank: c.rank })),
      actions: actionsQuery.rows,
      result: {
        winnerUUID: round.winner_uuid,
        isTie: round.is_tie,
        pot: round.pot
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /api/leaderboard
router.get('/leaderboard', async (req, res) => {
  // Simple version: aggregate all users using game_players
  try {
    const q = await db.query(`
      WITH stats AS (
        SELECT 
          user_uuid,
          COUNT(*) as games_played,
          COUNT(CASE WHEN placement = 1 THEN 1 END) as games_won,
          SUM(final_stack) - SUM(starting_stack) as net_profit
        FROM game_players
        GROUP BY user_uuid
      )
      SELECT 
        s.user_uuid as uuid,
        u.name,
        s.games_played as "gamesPlayed",
        s.games_won as "gamesWon",
        s.net_profit as "netProfit",
        (CAST(s.games_won AS FLOAT) / s.games_played) as "winRate"
      FROM stats s
      JOIN users u ON s.user_uuid = u.uuid
      ORDER BY net_profit DESC
      LIMIT 20
    `);
    res.json({ players: q.rows });
  } catch (error) {
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
