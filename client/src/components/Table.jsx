import { useMemo } from 'react';
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

  return (
    <div className="table-wrap">
      <div className="felt">
        <div className="table-center">
          <CommunityCards cards={communityCards} streetName={street?.name} />
          {potTotal > 0 && (
            <div className="pot-box">
              <span className="pot-label">Pot</span>
              <span className="pot-val">{potTotal}</span>
            </div>
          )}
        </div>

        {rotated.map((p, idx) => {
          const pos = SEATS[idx];
          if (!pos) return null;
          return (
            <div key={p.uuid} className="seat-pos" style={{ left: pos.left, top: pos.top }}>
              <PlayerSeat
                player={p}
                isCurrentPlayer={p.uuid === myUUID}
                isDealer={p.uuid === dealerUUID}
                isSB={p.uuid === sbUUID}
                isBB={p.uuid === bbUUID}
                isCurrentTurn={p.uuid === currentPlayerUUID}
                betAmount={contribs[p.uuid] || 0}
              />
            </div>
          );
        })}
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
