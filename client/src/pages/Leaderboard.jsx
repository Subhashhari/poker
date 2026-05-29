import { useState, useEffect } from 'react';
import './Leaderboard.css';

export default function Leaderboard({ onBack, currentUUID }) {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      const token = localStorage.getItem('poker_token');
      try {
        const res = await fetch('/api/leaderboard', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setPlayers(data.players || []);
        }
      } catch (err) {
        console.error('Failed to load leaderboard', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="leaderboard-dashboard-wrapper">
      {/* ---- Page Header ---- */}
      <header className="leaderboard-header">
        <h1 className="leaderboard-title">RANKINGS</h1>
      </header>

      {loading ? (
        <div className="leaderboard-loading">LOADING...</div>
      ) : (
        <div className="leaderboard-table-wrap">
          <div className="lb-header">
            <span>RANK</span>
            <span>PLAYER</span>
            <span>NET PROFIT</span>
            <span>GAMES</span>
            <span>WIN RATE</span>
          </div>
          <div className="lb-body">
            {players.map((p, i) => {
              const isCurrent = p.uuid === currentUUID;
              return (
                <div key={p.uuid} className={`lb-row group ${isCurrent ? 'lb-row--current' : ''}`}>
                  <span className="lb-cell lb-rank">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="lb-cell lb-name">
                    {p.name}
                    {isCurrent && <span className="lb-player-you">(YOU)</span>}
                  </span>
                  <span className={`lb-cell lb-profit ${p.netProfit >= 0 ? 'lb-profit--positive' : 'lb-profit--negative'}`}>
                    {p.netProfit > 0 ? '+' : ''}{p.netProfit}
                  </span>
                  <span className="lb-cell lb-games">{p.gamesPlayed}</span>
                  <span className="lb-cell lb-winrate">{(p.winRate * 100).toFixed(0)}%</span>
                </div>
              );
            })}
            {players.length === 0 && (
              <div className="lb-empty">NO DATA AVAILABLE.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
