import { useState, useEffect } from 'react';
import Table from '../components/Table';
import { socket } from '../socket/socketClient.js';
import './Room.css';

function LeaveButton({ onClick }) {
  return (
    <button className="leave-btn" onClick={onClick} title="Leave game">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="23" y2="12" />
      </svg>
      Leave
    </button>
  );
}

export default function Room({ roomId, playerUUID, gameState, roomData, onLeave }) {
  const [roundResult, setRoundResult] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const handleRoundOver = ({ result }) => {
      setRoundResult(result);
      // Wait for host to start next round
    };

    const handleTurnTimer = () => {
      // When a new turn starts, ensure the round over overlay is closed
      setRoundResult(null);
    };

    const handleGameOver = ({ finalStandings }) => {
      setGameOverData({ finalStandings });
    };

    const handlePlayerLeft = ({ name }) => {
      setToast(`${name} left the game`);
      setTimeout(() => setToast(null), 3000);
    };

    socket.on('round-over', handleRoundOver);
    socket.on('game-over', handleGameOver);
    socket.on('player-left', handlePlayerLeft);
    socket.on('turn-timer', handleTurnTimer);

    return () => {
      socket.off('round-over', handleRoundOver);
      socket.off('game-over', handleGameOver);
      socket.off('player-left', handlePlayerLeft);
      socket.off('turn-timer', handleTurnTimer);
    };
  }, []);

  const handleStartGame = () => {
    socket.emit('start-game', { roomId, uuid: playerUUID });
  };

  const handleStartNextHand = () => {
    socket.emit('start-next-round', { roomId, uuid: playerUUID });
    setRoundResult(null);
  };

  const getPlayerName = (uuid) =>
    gameState?.players?.find(p => p.uuid === uuid)?.name || 'Unknown';

  const isHost = roomData?.hostUUID === playerUUID;

  // ─── Active game ───
  if (gameState && gameState.status === 'in-progress') {
    return (
      <div>
        <LeaveButton onClick={onLeave} />
        {toast && <div className="toast">{toast}</div>}
        <Table gameState={gameState} myUUID={playerUUID} roomId={roomId} />

        {roundResult && (
          <div className="overlay">
            <div className="overlay-card">
              <h2>Round Over</h2>
              <div className="detail">{getPlayerName(roundResult.winnerUUID)} wins</div>
              <div className="detail-sub">
                {roundResult.handName ? roundResult.handName : 'Everyone folded'}
              </div>
              <div className="pot-val">{roundResult.pot}</div>
              
              {isHost ? (
                <button 
                  className="btn btn-gold" 
                  style={{ marginTop: '24px', width: '100%' }}
                  onClick={handleStartNextHand}
                >
                  Start Next Hand
                </button>
              ) : (
                <div style={{ marginTop: '24px', opacity: 0.6, fontSize: '14px', textAlign: 'center' }}>
                  Waiting for host...
                </div>
              )}
            </div>
          </div>
        )}

        {gameOverData && (
          <div className="overlay overlay-dark">
            <div className="overlay-card go-card">
              <h2>Game Over</h2>
              <div className="standings">
                {gameOverData.finalStandings.map((p, i) => (
                  <div key={p.uuid} className="st-item">
                    <span className="st-rank">{i + 1}.</span>
                    <span className="st-name">{p.name}</span>
                    <span className="st-chips">{p.chipStack}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-gold" style={{ width: '100%' }} onClick={onLeave}>
                Back to Lobby
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Waiting lobby ───
  const players = roomData?.players || [];

  return (
    <div className="lobby">
      <LeaveButton onClick={onLeave} />
      {toast && <div className="toast">{toast}</div>}
      <div className="lobby-panel">
        <div className="lobby-top">
          <h2>Waiting for players</h2>
          <div className="room-code-box">
            <span>Room Code</span>
            <div className="code">{roomId}</div>
          </div>
        </div>

        <div className="lobby-players">
          <h3>Players ({players.length}/6)</h3>
          <div className="p-list">
            {players.map((p, i) => (
              <div key={p.uuid} className="p-list-item" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="name">
                  {p.name}
                  {p.uuid === roomData.hostUUID && <span className="host-tag">host</span>}
                </span>
                <span className="chips">{p.chipStack}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-foot">
          {isHost ? (
            <button
              id="start-game-btn"
              className="btn-start"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              {players.length >= 2 ? 'Start Game' : 'Need 2+ Players'}
            </button>
          ) : (
            <div className="wait-msg">Waiting for host to start...</div>
          )}
        </div>
      </div>
    </div>
  );
}
