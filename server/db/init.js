import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function initDb() {
  try {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL is not set. Skipping DB initialization.');
      process.exit(0);
    }
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running database initialization...');
    await db.query(schema);
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

initDb();
