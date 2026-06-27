# Poker Room

A real-time, multiplayer Texas Hold'em poker web application built with a custom game engine, live WebSocket networking, and a unique Brutalist/Kinetic Typography design system.

## Tech Stack
* **Frontend:** React, Vite, Custom CSS (No external UI libraries)
* **Backend:** Node.js, Express, Socket.io
* **Database:** PostgreSQL (Supabase)

## Features
* **Custom Texas Hold'em Engine:** Built from scratch to handle evaluating hands, splitting pots, determining winners, and validating real-world poker rules (like minimum raises and blinds).
* **Real-time Multiplayer:** Uses `Socket.io` for millisecond-latency syncing between the server state and all active clients in a game room.
* **Authentication:** Secure JWT-based authentication system backed by bcrypt password hashing.
* **Comprehensive Stats:** Tracks player histories, win rates, net profit, and playstyles (like aggression and fold frequencies) on a detailed user profile and global leaderboard.
* **High-End UI:** A sharp, dark-themed "Brutalist" aesthetic with scalable typography and custom CSS animations.

## How to Run Locally

1. **Install Dependencies:**
   Run `npm install` in both the root directory and the `client/` directory.

2. **Database Setup:**
   Ensure you have a PostgreSQL database running and update the `.env` file in the root directory:
   ```env
   DATABASE_URL=postgresql://your-db-url
   JWT_SECRET=your-jwt-secret
   ```

3. **Start the Development Server:**
   From the root directory, run:
   ```bash
   npm run dev
   ```
   This will simultaneously spin up the backend API on port `3001` and the Vite frontend on port `3000`.

4. **Production Build:**
   To build for production, run `npm run build`. The Express backend is configured to statically serve the React build automatically when you run `npm start`.
