import { useState, useEffect, useCallback } from 'react';
import { socket } from './socket/socketClient.js';
import DashboardLayout from './components/DashboardLayout';
import Landing from './pages/Landing';
import Room from './pages/Room';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Replay from './pages/Replay';
import './App.css';

export default function App() {
  const [playerUUID, setPlayerUUID] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [page, setPage] = useState('landing'); // 'landing' | 'room' | 'profile' | 'leaderboard' | 'replay'
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');
  const [replayGameId, setReplayGameId] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Connect socket on mount
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  // Register socket event listeners
  useEffect(() => {
    const onRoomCreated = ({ roomId }) => {
      setRoomId(roomId);
      setPage('room');
      setError('');
    };

    const onRoomJoined = ({ roomId }) => {
      setRoomId(roomId);
      setPage('room');
      setError('');
    };

    const onRoomUpdate = (data) => {
      setRoomData(data);
    };

    const onGameUpdate = ({ gameState }) => {
      setGameState(gameState);
    };

    const onRoomError = ({ message }) => {
      setError(message);
    };

    const onActionError = ({ message }) => {
      console.warn('Action error:', message);
    };

    socket.on('room-created', onRoomCreated);
    socket.on('room-joined', onRoomJoined);
    socket.on('room-update', onRoomUpdate);
    socket.on('game-update', onGameUpdate);
    socket.on('room-error', onRoomError);
    socket.on('action-error', onActionError);

    return () => {
      socket.off('room-created', onRoomCreated);
      socket.off('room-joined', onRoomJoined);
      socket.off('room-update', onRoomUpdate);
      socket.off('game-update', onGameUpdate);
      socket.off('room-error', onRoomError);
      socket.off('action-error', onActionError);
    };
  }, []);

  // Check auth on mount
  useEffect(() => {
    const token = localStorage.getItem('poker_token');
    if (token) {
      fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => {
          if (data.uuid) {
            setIsAuthenticated(true);
            setPlayerName(data.name);
            setPlayerUUID(data.uuid);
          } else {
            localStorage.removeItem('poker_token');
          }
        })
        .catch(() => localStorage.removeItem('poker_token'));
    }
  }, []);

  const handleLeave = useCallback(() => {
    if (roomId) {
      socket.emit('leave-room', { roomId, uuid: playerUUID });
    }
    setPage('landing');
    setRoomId(null);
    setRoomData(null);
    setGameState(null);
  }, [roomId, playerUUID]);

  const handleLogout = () => {
    localStorage.removeItem('poker_token');
    setIsAuthenticated(false);
    setPlayerUUID(null);
    setPlayerName('');
    setPage('landing');
  };

  const handleAuthSuccess = (uuid, name) => {
    setIsAuthenticated(true);
    setPlayerUUID(uuid);
    setPlayerName(name);
  };

  // Full screen pages
  if (page === 'room' && roomId) {
    return (
      <Room
        roomId={roomId}
        playerUUID={playerUUID}
        playerName={playerName}
        gameState={gameState}
        roomData={roomData}
        onLeave={handleLeave}
      />
    );
  }

  if (page === 'replay' && replayGameId) {
    return <Replay gameId={replayGameId} currentUUID={playerUUID} onBack={() => setPage('profile')} />;
  }

  // Unauthenticated landing page
  if (!isAuthenticated) {
    return (
      <Landing
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  // Dashboard wrapped pages
  return (
    <DashboardLayout
      playerName={playerName}
      currentPage={page}
      onNavigate={setPage}
      onLogout={handleLogout}
    >
      {page === 'landing' && (
        <Landing
          isAuthenticated={isAuthenticated}
          playerUUID={playerUUID}
          playerName={playerName}
          errorOverride={error}
        />
      )}
      {page === 'profile' && (
        <Profile
          playerUUID={playerUUID}
          onBack={() => setPage('landing')}
          onReplay={(gameId) => {
            setReplayGameId(gameId);
            setPage('replay');
          }}
        />
      )}
      {page === 'leaderboard' && (
        <Leaderboard 
          currentUUID={playerUUID}
          onBack={() => setPage('landing')} 
        />
      )}
    </DashboardLayout>
  );
}
