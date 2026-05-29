import { useState, useEffect } from 'react';
import './Profile.css';

export default function Profile({ playerUUID, onBack, onReplay }) {
  const [stats, setStats] = useState(null);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfileData = async () => {
      const token = localStorage.getItem('poker_token');
      if (!token) return;

      try {
        const [statsRes, gamesRes] = await Promise.all([
          fetch(`/api/stats/${playerUUID}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/games?uuid=${playerUUID}`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (gamesRes.ok) {
          const gamesData = await gamesRes.json();
          setGames(gamesData.games || []);
        }
      } catch (err) {
        console.error('Failed to load profile data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [playerUUID]);

  if (loading) {
    return <div className="profile-dashboard-wrapper profile-loading">LOADING...</div>;
  }

  if (!stats) {
    return <div className="profile-dashboard-wrapper profile-loading">FAILED TO LOAD PROFILE.</div>;
  }

  const formatProfit = (val) => (val > 0 ? `+${val}` : `${val}`);

  return (
    <div className="profile-dashboard-wrapper">
      {/* ---- Page Header ---- */}
      <header className="profile-header">
        <h1 className="profile-title">PROFILE</h1>
      </header>

      {/* ---- Stats Grid ---- */}
      <div className="stats-grid">
        {/* Card 1 — Volume */}
        <div className="stat-card group">
          <div className="stat-card-header">
            <h3 className="stat-card-title">VOLUME</h3>
          </div>
          <div className="stat-card-main">
            <span className="stat-value-massive">{stats.gamesPlayed}</span>
            <span className="stat-label-massive">GAMES</span>
          </div>
          <div className="stat-card-footer">
            <div className="stat-row">
              <span className="stat-label">ROUNDS PLAYED</span>
              <span className="stat-value">{stats.roundsPlayed}</span>
            </div>
          </div>
        </div>

        {/* Card 2 — Performance */}
        <div className="stat-card group">
          <div className="stat-card-header">
            <h3 className="stat-card-title">PERFORMANCE</h3>
          </div>
          <div className="stat-card-main">
            <span className="stat-value-massive">{(stats.winRate * 100).toFixed(0)}%</span>
            <span className="stat-label-massive">WIN RATE</span>
          </div>
          <div className="stat-card-footer">
            <div className="stat-row">
              <span className="stat-label">GAMES WON</span>
              <span className="stat-value">{stats.gamesWon}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">AVG PLACEMENT</span>
              <span className="stat-value">{stats.avgPlacement.toFixed(1)}</span>
            </div>
          </div>
        </div>

        {/* Card 3 — Play Style */}
        <div className="stat-card group">
          <div className="stat-card-header">
            <h3 className="stat-card-title">PLAY STYLE</h3>
          </div>
          <div className="stat-card-main">
            <span className="stat-value-massive">{(stats.aggressionFrequency * 100).toFixed(0)}%</span>
            <span className="stat-label-massive">AGGRESSION</span>
          </div>
          <div className="stat-card-footer">
            <div className="stat-row">
              <span className="stat-label">ALL-IN FREQUENCY</span>
              <span className="stat-value">{(stats.allInPercentage * 100).toFixed(1)}%</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">FOLD FREQUENCY</span>
              <span className="stat-value">{(stats.foldPercentage * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* Card 4 — Financial */}
        <div className="stat-card group">
          <div className="stat-card-header">
            <h3 className="stat-card-title">FINANCIAL</h3>
          </div>
          <div className="stat-card-main">
            <span className="stat-value-massive">{formatProfit(stats.netProfit)}</span>
            <span className="stat-label-massive">NET PROFIT</span>
          </div>
          <div className="stat-card-footer">
            <div className="stat-row">
              <span className="stat-label">BEST GAME</span>
              <span className="stat-value">+{stats.bestGame}</span>
            </div>
            <div className="stat-row">
              <span className="stat-label">WORST GAME</span>
              <span className="stat-value">{formatProfit(stats.worstGame)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Game History ---- */}
      <section className="history-section">
        <h2 className="history-title">GAME HISTORY</h2>

        {games.length === 0 ? (
          <p className="history-empty">NO GAMES PLAYED YET.</p>
        ) : (
          <div className="history-list">
            <div className="history-header">
              <span>DATE</span>
              <span>RANK</span>
              <span>PROFIT</span>
              <span>ACTION</span>
            </div>
            {games.map((g) => {
              const net = g.finalStack - g.startingStack;
              return (
                <div key={g.gameId} className="history-item group">
                  <span className="hist-date">
                    {new Date(g.startedAt).toLocaleDateString()}
                  </span>
                  <span className="hist-place">RANK {g.placement || '—'}</span>
                  <span className="hist-net">
                    {net > 0 ? '+' : ''}{net}
                  </span>
                  <span className="hist-replay-btn">
                    <button className="btn btn-secondary history-btn" onClick={() => onReplay(g.gameId)}>
                      REPLAY
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
