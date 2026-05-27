import { useState } from 'react';
import { socket } from '../socket/socketClient.js';
import './Landing.css';

export default function Landing({ playerUUID }) {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) return setError('Enter your name');
    setError('');
    setLoading(true);
    socket.emit('create-room', { name: name.trim(), uuid: playerUUID });
  };

  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name');
    if (roomCode.trim().length !== 6) return setError('Enter a 6-character room code');
    setError('');
    setLoading(true);
    socket.emit('join-room', {
      name: name.trim(),
      uuid: playerUUID,
      roomId: roomCode.trim().toUpperCase(),
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      roomCode.trim().length === 6 ? handleJoin() : handleCreate();
    }
  };

  return (
    <div className="landing">
      <div className="landing-card">
        <div className="landing-header">
          <h1>Poker Room</h1>
          <p>Texas Hold'em with friends</p>
        </div>

        <div className="landing-form">
          {error && <div className="error-msg">{error}</div>}

          <div className="field">
            <label htmlFor="player-name">Name</label>
            <input
              id="player-name"
              className="input"
              type="text"
              placeholder="Your display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
              autoFocus
            />
          </div>

          <div className="btn-row">
            <button
              id="create-room-btn"
              className="btn btn-gold"
              onClick={handleCreate}
              disabled={loading || !name.trim()}
            >
              Create Room
            </button>
          </div>

          <div className="divider">or join existing</div>

          <div className="field">
            <label htmlFor="room-code">Room Code</label>
            <input
              id="room-code"
              className="input input-code"
              type="text"
              placeholder="ABC123"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              maxLength={6}
            />
          </div>

          <div className="btn-row">
            <button
              id="join-room-btn"
              className="btn btn-ghost"
              onClick={handleJoin}
              disabled={loading || !name.trim() || roomCode.length !== 6}
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
