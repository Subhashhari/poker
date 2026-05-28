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
  return <div className="card card--back" style={{ animationDelay: `${delay}ms` }}>
    <div className="card-pattern"></div>
  </div>;
}

export default function PlayerSeat({ player, isCurrentPlayer, isDealer, isSB, isBB, isCurrentTurn, betAmount, timerPct }) {
  const cls = [
    'seat',
    isCurrentTurn && 'seat--turn',
    player.status === 'folded' && 'seat--folded',
    player.status === 'disconnected' && 'seat--disconnected',
    player.status === 'sitting-out' && 'seat--sitting-out',
    isCurrentPlayer ? 'seat--local' : 'seat--remote'
  ].filter(Boolean).join(' ');

  const showCards = player.status !== 'folded' && player.status !== 'sitting-out';

  // Extract a 1-2 character avatar from the name
  const avatarText = player.name ? player.name.substring(0, 2).toUpperCase() : '?';

  return (
    <div className="seat-container">
      {/* Floating bet tag */}
      {betAmount > 0 && <div className="seat-action-tag">Bet ${betAmount}</div>}

      <div className={cls}>
        <div className="seat-badges">
          {isDealer && <span className="badge badge--d">D</span>}
          {isSB && <span className="badge badge--sb">SB</span>}
          {isBB && <span className="badge badge--bb">BB</span>}
        </div>

        {showCards && (
          <div className="seat-cards">
            {isCurrentPlayer && player.hand ? (
              player.hand.map((c, i) => <CardFace key={i} card={c} delay={i * 80} />)
            ) : (
              <><CardBack /><CardBack delay={60} /></>
            )}
          </div>
        )}

        <div className="seat-inner">
          <div className="seat-avatar">
            {avatarText}
          </div>
          <div className="seat-info">
            <span className="seat-name">{player.name}</span>
            <span className="seat-stack">${player.chipStack}</span>
          </div>
        </div>
      </div>

      {player.status === 'folded' && <span className="seat-status-tag">Folded</span>}
      {player.status === 'disconnected' && <span className="seat-status-tag seat-status-tag--red">Offline</span>}
      {player.status === 'sitting-out' && <span className="seat-status-tag seat-status-tag--amber">Sitting Out</span>}
    </div>
  );
}
