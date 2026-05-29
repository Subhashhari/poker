import pg from 'pg';

const { Pool } = pg;

// Use process.env.DATABASE_URL from Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

export const db = {
  /**
   * Run a query on the database.
   * @param {string} text - SQL query string
   * @param {any[]} params - Query parameters
   * @returns {Promise<pg.QueryResult>}
   */
  query: (text, params) => pool.query(text, params),

  /**
   * Get a dedicated client from the pool (useful for transactions)
   */
  getClient: () => pool.connect(),
};

export default db;
