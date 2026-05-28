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

  const canBet   = validActions.includes('bet');
  const canRaise = validActions.includes('raise');
  const showSlider = canBet || canRaise;

  const minAmt = canRaise ? currentBet + 1 : 1;
  const maxAmt = playerChipStack;

  useEffect(() => {
    if (isMyTurn) {
      const def = Math.min(
        Math.max((currentBet || 0) * 2, minAmt, 20),
        maxAmt
      );
      setRaiseInput(String(def));
    }
  }, [isMyTurn, currentBet, playerChipStack]);

  if (!isMyTurn) return null;

  const canFold  = validActions.includes('fold');
  const canCheck = validActions.includes('check');
  const canCall  = validActions.includes('call');

  const amt = Number(raiseInput) || 0;
  const isValid = showSlider && amt >= minAmt && amt <= maxAmt;

  return (
    <div className="action-bar">
      {/* Left: core actions */}
      <div className="act-group">
        {canFold && (
          <button className="act-btn act-fold" onClick={() => onAction({ type: 'fold' })}>Fold</button>
        )}
        {canCheck && (
          <button className="act-btn act-check" onClick={() => onAction({ type: 'check' })}>Check</button>
        )}
        {canCall && (
          <button className="act-btn act-call" onClick={() => onAction({ type: 'call' })}>
            Call <span className="act-val">{callAmount}</span>
          </button>
        )}
      </div>

      {/* Right: raise/bet with inline slider */}
      {showSlider && (
        <div className="act-raise">
          <div className="raise-presets">
            <button className="raise-pre" onClick={() => setRaiseInput(String(Math.max(minAmt, Math.floor(maxAmt / 3))))}>⅓</button>
            <button className="raise-pre" onClick={() => setRaiseInput(String(Math.max(minAmt, Math.floor(maxAmt / 2))))}>½</button>
            <button className="raise-pre raise-pre--allin" onClick={() => setRaiseInput(String(maxAmt))}>All-in</button>
          </div>
          <input
            type="range"
            className="raise-slider"
            min={minAmt}
            max={maxAmt}
            value={amt || minAmt}
            onChange={e => setRaiseInput(e.target.value)}
          />
          <input
            type="text"
            inputMode="numeric"
            className="raise-input"
            value={raiseInput}
            onChange={e => setRaiseInput(e.target.value.replace(/\D/g, ''))}
          />
          <button
            className="act-btn act-go"
            onClick={() => onAction({ type: canRaise ? 'raise' : 'bet', amount: amt })}
            disabled={!isValid}
          >
            {canRaise ? 'Raise' : 'Bet'}
          </button>
        </div>
      )}
    </div>
  );
}
