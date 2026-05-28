import './PlayerSeat.css';

const SUIT = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANK = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

function CardFace({ card, delay = 0 }) {
  const r = RANK[card.rank] || card.rank;
  const s = SUIT[card.suit];
  const red = card.suit === 'hearts' || card.suit === 'diamonds';

  return (
    <div className={`card card--face ${red ? 'card--red' : 'card--blk'}`} style={{ animationDelay: `${delay}ms` }}>
      <span className="card-r">{r}</span>
      <span className="card-s">{s}</span>
    </div>
  );
}

function CardBack({ delay = 0 }) {
  return <div className="card card--back" style={{ animationDelay: `${delay}ms` }} />;
}

export default function PlayerSeat({ player, isCurrentPlayer, isDealer, isSB, isBB, isCurrentTurn, betAmount, timerPct }) {
  const cls = [
    'seat',
    isCurrentTurn && 'seat--turn',
    player.status === 'folded' && 'seat--folded',
    player.status === 'disconnected' && 'seat--disconnected',
    player.status === 'sitting-out' && 'seat--sitting-out',
  ].filter(Boolean).join(' ');

  const showCards = player.status !== 'folded' && player.status !== 'sitting-out';
  const timerSec = timerPct != null ? Math.ceil(timerPct / 5) : null; // rough seconds

  return (
    <div className={cls}>
      {timerPct != null && (
        <div className={`seat-timer ${timerPct < 25 ? 'seat-timer--low' : ''}`}>
          {timerSec}
        </div>
      )}
      <div className="seat-badges">
        {isDealer && <span className="badge badge--d">D</span>}
        {isSB && <span className="badge badge--sb">SB</span>}
        {isBB && <span className="badge badge--bb">BB</span>}
      </div>

      <div className="seat-cards">
        {isCurrentPlayer && player.hand ? (
          player.hand.map((c, i) => <CardFace key={i} card={c} delay={i * 80} />)
        ) : showCards ? (
          <><CardBack /><CardBack delay={60} /></>
        ) : null}
      </div>

      <span className="seat-name">{player.name}</span>
      <span className="seat-stack">{player.chipStack}</span>

      {betAmount > 0 && <div className="seat-bet">{betAmount}</div>}

      {player.status === 'folded' && <span className="seat-tag seat-tag--fold">Fold</span>}
      {player.status === 'disconnected' && <span className="seat-tag seat-tag--dc">Offline</span>}
      {player.status === 'sitting-out' && <span className="seat-tag seat-tag--out">Out</span>}
    </div>
  );
}
