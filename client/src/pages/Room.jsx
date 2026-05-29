import { useState, useEffect } from 'react';
import Table from '../components/Table';
import { socket } from '../socket/socketClient.js';
import './Room.css';

function LeaveButton({ onClick }) {
  return (
    <button className="leave-btn" onClick={onClick} title="Leave game">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
        <path d="M15 3H5v18h10" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="23" y2="12" />
      </svg>
      LEAVE
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
    };

    const handleTurnTimer = () => {
      setRoundResult(null);
    };

    const handleGameOver = ({ finalStandings }) => {
      setGameOverData({ finalStandings });
    };

    const handlePlayerLeft = ({ name }) => {
      setToast(`${name} LEFT THE GAME`);
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
    gameState?.players?.find(p => p.uuid === uuid)?.name || 'UNKNOWN';

  const isHost = roomData?.hostUUID === playerUUID;
  const myPlayer = gameState?.players?.find(p => p.uuid === playerUUID);
  const needsRebuy = myPlayer?.chipStack === 0;

  const handleRebuy = () => {
    socket.emit('rebuy-request', { roomId, uuid: playerUUID });
  };

  // ─── Active game ───
  if (gameState && gameState.status === 'in-progress') {
    return (
      <div className="room-active">
        <LeaveButton onClick={onLeave} />
        {toast && <div className="toast">{toast}</div>}
        <Table gameState={gameState} myUUID={playerUUID} roomId={roomId} />

        {roundResult && (
          <div className="overlay">
            <div className="overlay-card group">
              <h2 className="overlay-title">ROUND OVER</h2>
              <div className="overlay-detail">{getPlayerName(roundResult.winnerUUID)} WINS</div>
              <div className="overlay-sub">
                {roundResult.handName ? roundResult.handName.toUpperCase() : 'EVERYONE FOLDED'}
              </div>
              <div className="overlay-pot">{roundResult.pot}</div>
              
              {needsRebuy ? (
                <div className="overlay-actions">
                  <p className="error-text">YOU ARE OUT OF CHIPS!</p>
                  <button className="btn btn-primary" onClick={handleRebuy}>
                    REBUY (+1000)
                  </button>
                  <button className="btn btn-secondary" onClick={onLeave}>
                    LEAVE GAME
                  </button>
                </div>
              ) : isHost ? (
                <div className="overlay-actions">
                  <button className="btn btn-primary" onClick={handleStartNextHand}>
                    NEXT HAND
                  </button>
                  <button className="btn btn-secondary" onClick={onLeave}>
                    LEAVE GAME
                  </button>
                </div>
              ) : (
                <div className="overlay-actions">
                  <div className="wait-text">WAITING FOR HOST...</div>
                  <button className="btn btn-secondary" onClick={onLeave}>
                    LEAVE GAME
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {gameOverData && (
          <div className="overlay overlay-dark">
            <div className="overlay-card go-card">
              <h2 className="overlay-title">GAME OVER</h2>
              <div className="standings">
                {gameOverData.finalStandings.map((p, i) => (
                  <div key={p.uuid} className="st-item">
                    <span className="st-rank">{i + 1}</span>
                    <span className="st-name">{p.name}</span>
                    <span className="st-chips">{p.chipStack}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={onLeave}>
                BACK TO LOBBY
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
    <div className="lobby bg-grid">
      <div className="noise-overlay" />
      <LeaveButton onClick={onLeave} />
      {toast && <div className="toast">{toast}</div>}
      
      <div className="lobby-panel">
        <div className="lobby-header">
          <h2 className="lobby-title">WAITING ROOM</h2>
        </div>

        <div className="room-code-box">
          <span className="code-label">ROOM CODE</span>
          <div className="code-value">{roomId}</div>
        </div>

        <div className="lobby-players">
          <div className="players-header">
            <h3>PLAYERS</h3>
            <span>{players.length}/6</span>
          </div>
          <div className="p-list">
            {players.map((p, i) => (
              <div key={p.uuid} className="p-list-item">
                <span className="name">
                  {p.name}
                  {p.uuid === roomData.hostUUID && <span className="host-tag">HOST</span>}
                </span>
                <span className="chips">{p.chipStack}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lobby-foot">
          {isHost ? (
            <button
              className="btn btn-primary lobby-start-btn"
              onClick={handleStartGame}
              disabled={players.length < 2}
            >
              {players.length >= 2 ? 'START GAME' : 'NEED 2+ PLAYERS'}
            </button>
          ) : (
            <div className="wait-msg">WAITING FOR HOST TO START...</div>
          )}
        </div>
      </div>
    </div>
  );
}
