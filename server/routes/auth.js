import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db/index.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-dev-only';

router.post('/register', async (req, res) => {
  const { name, password } = req.body;
  
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password required' });
  }

  try {
    // Check if user exists
    const existing = await db.query('SELECT uuid FROM users WHERE name = $1', [name]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const uuid = crypto.randomUUID();
    const hash = await bcrypt.hash(password, 10);

    await db.query(
      'INSERT INTO users (uuid, name, password_hash) VALUES ($1, $2, $3)',
      [uuid, name, hash]
    );

    const token = jwt.sign({ uuid, name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, uuid, name });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  const { name, password } = req.body;
  
  if (!name || !password) {
    return res.status(400).json({ error: 'Name and password required' });
  }

  try {
    const result = await db.query('SELECT uuid, name, password_hash FROM users WHERE name = $1', [name]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ uuid: user.uuid, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, uuid: user.uuid, name: user.name });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  // req.user has { uuid, name }
  res.json({ uuid: req.user.uuid, name: req.user.name });
});

export default router;
