import { useState, useEffect } from 'react';
import { socket } from '../socket/socketClient.js';
import './Landing.css';

export default function Landing({ isAuthenticated, playerUUID, playerName, onAuthSuccess, errorOverride }) {
  const [isLoginMode, setIsLoginMode] = useState(true);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fix: Reset loading when an error is returned from the server via App.jsx
  useEffect(() => {
    if (errorOverride) {
      setLoading(false);
    }
  }, [errorOverride]);

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) return setError('NAME AND PASSWORD REQUIRED');
    
    setLoading(true);
    setError('');

    const endpoint = isLoginMode ? '/auth/login' : '/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), password })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'AUTHENTICATION FAILED');
      
      localStorage.setItem('poker_token', data.token);
      onAuthSuccess(data.uuid, data.name);
    } catch (err) {
      setError(err.message.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setError('');
    setLoading(true);
    socket.emit('create-room', { name: playerName, uuid: playerUUID });
  };

  const handleJoin = () => {
    if (roomCode.trim().length !== 6) return setError('ENTER A 6-CHARACTER CODE');
    setError('');
    setLoading(true);
    socket.emit('join-room', {
      name: playerName,
      uuid: playerUUID,
      roomId: roomCode.trim().toUpperCase(),
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (!isAuthenticated) {
        handleAuth(e);
      } else {
        roomCode.trim().length === 6 ? handleJoin() : handleCreate();
      }
    }
  };

  if (isAuthenticated) {
    return (
      <div className="landing-auth bg-grid">
        <div className="noise-overlay" />
        <div className="auth-card group">
          <div className="auth-header">
            <h1 className="auth-title">JOIN TABLE</h1>
          </div>
          
          <div className="auth-form">
            {(error || errorOverride) && (
              <div className="landing-error">{error || errorOverride}</div>
            )}
            
            <button className="btn btn-primary btn-massive" onClick={handleCreate} disabled={loading}>
              <span>CREATE ROOM</span>
            </button>

            <div className="landing-divider">
              <span className="landing-divider-text">OR</span>
            </div>

            <input
              className="input-editorial input-room-code"
              type="text"
              placeholder="CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              onKeyDown={handleKeyDown}
              maxLength={6}
            />

            <button
              className="btn btn-secondary btn-massive"
              onClick={handleJoin}
              disabled={loading || roomCode.length !== 6}
            >
              <span>JOIN ROOM</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="landing bg-grid">
      <div className="noise-overlay" />
      
      {/* Background element */}
      <div className="landing-bg-text">ALL IN</div>

      <div className="landing-static-bar top-bar-stationary">
        <span className="static-text">NO LIMIT TEXAS HOLD'EM /// HIGH STAKES /// POKER ROOM ///</span>
      </div>

      <div className="landing-content">
        <div className="landing-left">
          <h1 className="hero-title">POKER</h1>
          <h1 className="hero-title outline-text">ROOM</h1>
        </div>

        <div className="landing-right">
          <div className="login-card">
            <div className="auth-tabs">
              <button 
                className={`auth-tab ${isLoginMode ? 'active' : ''}`}
                onClick={() => { setIsLoginMode(true); setError(''); }}
              >
                LOGIN
              </button>
              <button 
                className={`auth-tab ${!isLoginMode ? 'active' : ''}`}
                onClick={() => { setIsLoginMode(false); setError(''); }}
              >
                REGISTER
              </button>
            </div>

            {error && <div className="landing-error">{error}</div>}

            <input
              className="input-editorial"
              type="text"
              placeholder="USERNAME"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={20}
              autoFocus
            />
            
            <input
              className="input-editorial"
              type="password"
              placeholder="PASSWORD"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            
            <button
              className="btn btn-primary btn-submit"
              onClick={handleAuth}
              disabled={loading || !name.trim() || !password.trim()}
            >
              <span>{isLoginMode ? 'ENTER' : 'CREATE'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="landing-static-bar bottom-bar-stationary">
        <span className="static-text accent-text">BLINDS 10/20 /// ANTE 5 /// BUY-IN 1000 ///</span>
      </div>
    </div>
  );
}
