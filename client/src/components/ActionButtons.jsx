import { useState, useEffect } from 'react';
import './ActionButtons.css';

export default function ActionButtons({
  onAction,
  currentBet,
  callAmount,
  playerChipStack,
  validActions,
  isMyTurn,
}) {
  const [raiseInput, setRaiseInput] = useState('');

  useEffect(() => {
    if (isMyTurn) {
      const def = Math.min(
        Math.max((currentBet || 0) * 2, currentBet + 1, 20),
        playerChipStack
      );
      setRaiseInput(String(def));
    }
  }, [isMyTurn, currentBet, playerChipStack]);

  if (!isMyTurn) return null;

  const canFold  = validActions.includes('fold');
  const canCheck = validActions.includes('check');
  const canCall  = validActions.includes('call');
  const canBet   = validActions.includes('bet');
  const canRaise = validActions.includes('raise');

  const amt = Number(raiseInput) || 0;
  const raiseOk = canRaise && amt > currentBet && amt <= playerChipStack;
  const betOk   = canBet && amt > 0 && amt <= playerChipStack;

  return (
    <div className="action-bar">
      <div className="action-buttons">
        {canFold && (
          <button className="action-btn act-fold" onClick={() => onAction({ type: 'fold' })}>Fold</button>
        )}
        {canCheck && (
          <button className="action-btn act-check" onClick={() => onAction({ type: 'check' })}>Check</button>
        )}
        {canCall && (
          <button className="action-btn act-call" onClick={() => onAction({ type: 'call' })}>
            Call <span className="btn-amt">{callAmount}</span>
          </button>
        )}
        {canBet && (
          <div className="raise-group">
            <input
              type="text"
              inputMode="numeric"
              className="raise-input"
              value={raiseInput}
              onChange={e => setRaiseInput(e.target.value.replace(/\D/g, ''))}
              placeholder="Amt"
            />
            <button className="action-btn act-raise" onClick={() => onAction({ type: 'bet', amount: amt })} disabled={!betOk}>
              Bet {betOk && <span className="btn-amt">{amt}</span>}
            </button>
          </div>
        )}
        {canRaise && (
          <div className="raise-group">
            <input
              type="text"
              inputMode="numeric"
              className="raise-input"
              value={raiseInput}
              onChange={e => setRaiseInput(e.target.value.replace(/\D/g, ''))}
              placeholder={`>${currentBet}`}
            />
            <button className="action-btn act-raise" onClick={() => onAction({ type: 'raise', amount: amt })} disabled={!raiseOk}>
              Raise {raiseOk && <span className="btn-amt">{amt}</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
