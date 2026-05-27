import './CommunityCards.css';

const SUIT = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const RANK = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export default function CommunityCards({ cards = [], streetName }) {
  const empty = 5 - cards.length;

  return (
    <div className="comm">
      <div className="comm-label">{streetName || ''}</div>
      <div className="comm-row">
        {cards.map((c, i) => {
          const red = c.suit === 'hearts' || c.suit === 'diamonds';
          return (
            <div
              key={`${c.rank}${c.suit}`}
              className={`comm-card comm-card--face ${red ? 'card--red' : 'card--blk'}`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="comm-r">{RANK[c.rank] || c.rank}</span>
              <span className="comm-s">{SUIT[c.suit]}</span>
            </div>
          );
        })}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e${i}`} className="comm-card comm-card--empty" />
        ))}
      </div>
    </div>
  );
}
