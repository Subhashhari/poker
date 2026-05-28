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
  const raiseOk = canRaise && amt > currentBet && amt <= maxAmt;
  const betOk   = canBet && amt > 0 && amt <= maxAmt;

  const handleSlider = (e) => {
    setRaiseInput(e.target.value);
  };

  const handleInput = (e) => {
    setRaiseInput(e.target.value.replace(/\D/g, ''));
  };

  // Quick-pick presets
  const presets = [];
  if (canBet || canRaise) {
    const half = Math.floor(maxAmt / 2);
    const third = Math.floor(maxAmt / 3);
    if (third > minAmt) presets.push({ label: '⅓', val: third });
    if (half > minAmt) presets.push({ label: '½', val: half });
    presets.push({ label: 'All-in', val: maxAmt });
  }

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
        {(canBet || canRaise) && (
          <div className="raise-group">
            <div className="slider-row">
              <input
                type="range"
                className="raise-slider"
                min={minAmt}
                max={maxAmt}
                value={amt || minAmt}
                onChange={handleSlider}
              />
              <input
                type="text"
                inputMode="numeric"
                className="raise-input"
                value={raiseInput}
                onChange={handleInput}
                placeholder={canRaise ? `>${currentBet}` : 'Amt'}
              />
            </div>
            <div className="preset-row">
              {presets.map(p => (
                <button
                  key={p.label}
                  className="preset-btn"
                  onClick={() => setRaiseInput(String(p.val))}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              className="action-btn act-raise"
              onClick={() => onAction({ type: canRaise ? 'raise' : 'bet', amount: amt })}
              disabled={canRaise ? !raiseOk : !betOk}
            >
              {canRaise ? 'Raise' : 'Bet'} {(canRaise ? raiseOk : betOk) && <span className="btn-amt">{amt}</span>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
