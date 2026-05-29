import React from 'react';
import './DashboardLayout.css';

export default function DashboardLayout({ children, playerName, currentPage, onNavigate, onLogout }) {
  return (
    <div className="dashboard-layout bg-grid">
      <div className="noise-overlay" />

      {/* Top Bar */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className="top-bar-title">POKER ROOM</span>
        </div>
        <div className="top-bar-right">
          <span className="top-bar-player">{playerName}</span>
          <button className="btn-logout" onClick={onLogout}>
            LOGOUT
          </button>
        </div>
      </header>

      <div className="dashboard-body">
        {/* Left Sidebar */}
        <aside className="dashboard-sidebar">
          {/* Navigation */}
          <nav className="sidebar-nav">
            <button
              className={`nav-btn ${currentPage === 'landing' ? 'active' : ''}`}
              onClick={() => onNavigate('landing')}
            >
              LOBBY
            </button>
            <button
              className={`nav-btn ${currentPage === 'profile' ? 'active' : ''}`}
              onClick={() => onNavigate('profile')}
            >
              PROFILE
            </button>
            <button
              className={`nav-btn ${currentPage === 'leaderboard' ? 'active' : ''}`}
              onClick={() => onNavigate('leaderboard')}
            >
              RANKINGS
            </button>
          </nav>

          <div className="sidebar-footer">
            <span className="sidebar-vertical-text">VOL. I /// POKER</span>
          </div>
        </aside>

        {/* Main Area */}
        <main className="dashboard-main">
          {/* Dynamic Content */}
          <div className="dashboard-content">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
