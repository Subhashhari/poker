import { useState, useEffect, useCallback } from 'react';
import { socket } from './socket/socketClient.js';
import Landing from './pages/Landing';
import Room from './pages/Room';
import './App.css';

function getOrCreateUUID() {
  // sessionStorage is per-tab, so each tab gets a unique UUID.
  // This allows multi-tab play from the same browser.
  let uuid = sessionStorage.getItem('poker-uuid');
  if (!uuid) {
    uuid = crypto.randomUUID();
    sessionStorage.setItem('poker-uuid', uuid);
  }
  return uuid;
}

export default function App() {
  const [playerUUID] = useState(getOrCreateUUID);
  const [playerName, setPlayerName] = useState('');
  const [page, setPage] = useState('landing'); // 'landing' | 'room'
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');

  // Connect socket on mount
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      // Don't disconnect on unmount — keep connection alive
    };
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

  const handleLeave = useCallback(() => {
    if (roomId) {
      socket.emit('leave-room', { roomId, uuid: playerUUID });
    }
    setPage('landing');
    setRoomId(null);
    setRoomData(null);
    setGameState(null);
  }, [roomId, playerUUID]);

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

  return (
    <Landing
      playerUUID={playerUUID}
      onRoomJoined={(name) => setPlayerName(name)}
    />
  );
}
