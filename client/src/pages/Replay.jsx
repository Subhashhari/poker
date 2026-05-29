import { useState, useEffect, useMemo } from 'react';
import Table from '../components/Table';
import './Replay.css';

export default function Replay({ gameId, currentUUID, onBack }) {
  const [rounds, setRounds] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(null);
  
  const [replayData, setReplayData] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // 1. Fetch rounds for this game
  useEffect(() => {
    const fetchRounds = async () => {
      const token = localStorage.getItem('poker_token');
      try {
        const res = await fetch(`/api/games/${gameId}/rounds`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setRounds(data.rounds || []);
          if (data.rounds?.length > 0) {
            setSelectedRoundId(data.rounds[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch rounds', err);
      } finally {
        if (!selectedRoundId) setLoading(false);
      }
    };
    fetchRounds();
  }, [gameId]); // eslint-disable-line

  // 2. Fetch specific round replay data
  useEffect(() => {
    if (!selectedRoundId) return;
    const fetchReplay = async () => {
      setLoading(true);
      const token = localStorage.getItem('poker_token');
      try {
        const res = await fetch(`/api/games/${gameId}/rounds/${selectedRoundId}/replay`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          setReplayData(await res.json());
          setStepIndex(0);
        }
      } catch (err) {
        console.error('Failed to fetch replay data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReplay();
  }, [selectedRoundId, gameId]);

  // 3. Compute derived state at current step
  const computedState = useMemo(() => {
    if (!replayData) return null;

    const actionsUpTo = replayData.actions.slice(0, stepIndex);
    const currentStreet = actionsUpTo.length > 0
      ? actionsUpTo[actionsUpTo.length - 1].street
      : 'preflop';

    const communityCardsMap = {
      preflop: [],
      flop: replayData.communityCards.slice(0, 3),
      turn: replayData.communityCards.slice(0, 4),
      river: replayData.communityCards.slice(0, 5),
    };
    const visibleCommunityCards = communityCardsMap[currentStreet] || [];

    const foldedPlayers = new Set(
      actionsUpTo.filter(a => a.actionType === 'fold').map(a => a.playerUUID)
    );

    const pot = actionsUpTo.reduce((sum, a) => sum + (a.amount || 0), 0);

    const lastActions = {};
    for (const action of actionsUpTo) {
      if (action.street === currentStreet) {
        lastActions[action.playerUUID] = action;
      }
    }

    // Build mock gameState for <Table />
    const players = replayData.players.map((p, i) => {
      const isFolded = foldedPlayers.has(p.uuid);
      const actionObj = lastActions[p.uuid];
      
      let label = '';
      if (actionObj) {
        label = actionObj.actionType.toUpperCase();
        if (actionObj.amount > 0) label += ` ${actionObj.amount}`;
      }

      return {
        uuid: p.uuid,
        name: p.name,
        chipStack: '-',
        status: isFolded ? 'folded' : 'active',
        hand: replayData.holeCards[p.uuid] || null, // always visible!
        _replayLabel: label
      };
    });

    const isEnd = stepIndex === replayData.actions.length;

    return {
      status: 'in-progress',
      players,
      currentRound: {
        potTotal: pot,
        communityCards: isEnd ? replayData.communityCards : visibleCommunityCards,
        currentStreet: {
          name: isEnd ? 'showdown' : currentStreet,
          currentPlayerIndex: -1 // Disable active highlighting
        },
        result: isEnd ? replayData.result : null
      }
    };
  }, [replayData, stepIndex]);

  if (loading && !replayData) return <div className="replay-loading">LOADING REPLAY...</div>;
  if (!replayData) return (
    <div className="replay-empty">
      <span>NO REPLAY DATA AVAILABLE.</span>
      <button className="btn btn-secondary" onClick={onBack}>BACK</button>
    </div>
  );

  const currentAction = stepIndex > 0 ? replayData.actions[stepIndex - 1] : null;

  return (
    <div className="replay-container">
      {/* Left Sidebar — Kinetic Typography */}
      <aside className="replay-sidebar">
        
        {/* Top: Back & Round Select */}
        <div className="replay-sidebar-top">
          <button className="replay-back-link" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            BACK
          </button>

          <div className="replay-round-selector">
            <span className="replay-section-label">SELECT ROUND</span>
            <select
              className="replay-round-select"
              value={selectedRoundId || ''}
              onChange={(e) => setSelectedRoundId(e.target.value)}
            >
              {rounds.map(r => (
                <option key={r.id} value={r.id}>ROUND #{r.roundNumber}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Log */}
        <div className="replay-action-section">
          <span className="replay-section-label">ACTION LOG</span>
          <div className="replay-action-log">
            {currentAction ? (
              <>
                <div className="replay-action-row">
                  <span className="replay-action-label">PLAYER</span>
                  <span className="replay-action-value">{currentAction.playerName}</span>
                </div>
                <div className="replay-action-row">
                  <span className="replay-action-label">ACTION</span>
                  <span className="replay-action-value">
                    {currentAction.actionType.toUpperCase()}{currentAction.amount ? ` $${currentAction.amount}` : ''}
                  </span>
                </div>
              </>
            ) : (
              <span className="replay-action-empty">START OF HAND</span>
            )}
          </div>
        </div>

        {/* Step Controls */}
        <div className="replay-controls-section">
          <div className="replay-step-counter">
            STEP {stepIndex} OF {replayData.actions.length}
          </div>
          <div className="replay-control-buttons">
            <button 
              className="btn btn-ghost" 
              onClick={() => setStepIndex(0)} 
              disabled={stepIndex === 0}
            >
              |&lt;
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => setStepIndex(Math.max(0, stepIndex - 1))} 
              disabled={stepIndex === 0}
            >
              &lt; PREV
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => setStepIndex(Math.min(replayData.actions.length, stepIndex + 1))} 
              disabled={stepIndex === replayData.actions.length}
            >
              NEXT &gt;
            </button>
            <button 
              className="btn btn-ghost" 
              onClick={() => setStepIndex(replayData.actions.length)} 
              disabled={stepIndex === replayData.actions.length}
            >
              &gt;|
            </button>
          </div>
        </div>
      </aside>

      {/* Main Stage */}
      <main className="replay-stage">
        <Table gameState={computedState} myUUID={currentUUID} roomId="REPLAY" />
      </main>
    </div>
  );
}
