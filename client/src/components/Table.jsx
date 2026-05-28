import { useMemo, useState, useEffect, useRef } from 'react';
import PlayerSeat from './PlayerSeat';
import CommunityCards from './CommunityCards';
import ActionButtons from './ActionButtons';
import { socket } from '../socket/socketClient.js';
import './Table.css';

const SEATS = [
  { left: '50%', top: '86%' },
  { left: '8%',  top: '65%' },
  { left: '8%',  top: '20%' },
  { left: '50%', top: '5%'  },
  { left: '92%', top: '20%' },
  { left: '92%', top: '65%' },
];

export default function Table({ gameState, myUUID, roomId }) {
  const { players, currentRound, config } = gameState;
  const [timerData, setTimerData] = useState(null);
  const [timerPct, setTimerPct] = useState(100);
  const rafRef = useRef(null);

  // Listen for turn-timer events
  useEffect(() => {
    const handleTimer = (data) => {
      setTimerData(data);
    };
    socket.on('turn-timer', handleTimer);
    return () => socket.off('turn-timer', handleTimer);
  }, []);

  // Animate the countdown bar
  useEffect(() => {
    if (!timerData) {
      setTimerPct(100);
      return;
    }

    const { startedAt, timeoutMs } = timerData;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 1 - elapsed / timeoutMs);
      setTimerPct(remaining * 100);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [timerData]);

  const rotated = useMemo(() => {
    const i = players.findIndex(p => p.uuid === myUUID);
    return i <= 0 ? players : [...players.slice(i), ...players.slice(0, i)];
  }, [players, myUUID]);

  const street = currentRound?.currentStreet;
  const currentPlayerUUID = street?.currentPlayerUUID;
  const isMyTurn = currentPlayerUUID === myUUID;
  const communityCards = currentRound?.communityCards || [];
  const potTotal = currentRound?.potTotal || 0;
  const currentBet = street?.currentBet || 0;
  const contribs = street?.playerContributions || {};

  // Side pots display
  const pots = currentRound?.pots || [];

  const dealerUUID = players[currentRound?.dealerIndex]?.uuid;
  const sbUUID = players[currentRound?.smallBlindIndex]?.uuid;
  const bbUUID = players[currentRound?.bigBlindIndex]?.uuid;

  const myContrib = contribs[myUUID] || 0;
  const callAmount = Math.max(0, currentBet - myContrib);
  const myStack = players.find(p => p.uuid === myUUID)?.chipStack || 0;

  const validActions = useMemo(() => {
    if (!isMyTurn) return [];
    const a = ['fold'];
    if (callAmount === 0 && currentBet === 0) a.push('check', 'bet');
    else if (callAmount === 0 && currentBet > 0) a.push('check', 'raise');
    else a.push('call', 'raise');
    return a;
  }, [isMyTurn, callAmount, currentBet]);

  const handleAction = (action) => {
    socket.emit('player-action', { roomId, uuid: myUUID, action });
  };

  // Timer applies to current player
  const timerForUUID = timerData?.playerUUID;

  return (
    <div className="table-wrap">
      <div className="felt">
        <div className="table-center">
          <CommunityCards cards={communityCards} streetName={street?.name} />
          {potTotal > 0 && (
            <div className="pot-box">
              <span className="pot-label">Pot</span>
              <span className="pot-val">{potTotal}</span>
              {pots.length > 1 && (
                <div className="side-pots">
                  {pots.map((p, i) => (
                    <span key={i} className="side-pot">{p.amount}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {rotated.map((p, idx) => {
          const pos = SEATS[idx];
          if (!pos) return null;
          const isTurn = p.uuid === currentPlayerUUID;
          return (
            <div key={p.uuid} className="seat-pos" style={{ left: pos.left, top: pos.top }}>
              <PlayerSeat
                player={p}
                isCurrentPlayer={p.uuid === myUUID}
                isDealer={p.uuid === dealerUUID}
                isSB={p.uuid === sbUUID}
                isBB={p.uuid === bbUUID}
                isCurrentTurn={isTurn}
                betAmount={contribs[p.uuid] || 0}
                timerPct={isTurn && timerForUUID === p.uuid ? timerPct : null}
              />
            </div>
          );
        })}
        {timerForUUID && timerPct != null && (
          <div className={`timer-vert ${timerPct < 25 ? 'timer-vert--low' : ''}`}>
            <span className="timer-vert-label">Timer</span>
            <div className="timer-vert-track">
              <div className="timer-vert-fill" style={{ height: `${timerPct}%` }} />
            </div>
            <span className="timer-vert-sec">{Math.ceil(timerPct / 5)}s</span>
          </div>
        )}
      </div>

      <ActionButtons
        onAction={handleAction}
        currentBet={currentBet}
        callAmount={callAmount}
        playerChipStack={myStack}
        validActions={validActions}
        isMyTurn={isMyTurn}
      />
    </div>
  );
}
