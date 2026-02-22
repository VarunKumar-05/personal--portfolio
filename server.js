/* ============================================
   Blog API Server — Express + PostgreSQL
   Portfolio Blog Backend
   ============================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database Connection ────────────────────────
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false }
});

// ─── Middleware ─────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Serve static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname), {
    extensions: ['html']
}));

// ─── Admin Key Middleware ───────────────────────
function requireAdmin(req, res, next) {
    const key = req.headers['x-admin-key'];
    if (!process.env.ADMIN_SECRET) {
        return res.status(500).json({ error: 'ADMIN_SECRET not configured on server' });
    }
    if (key !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: 'Forbidden — invalid admin key' });
    }
    next();
}

// ─── Initialize Database Table ─────────────────
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id VARCHAR(64) PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                content TEXT NOT NULL,
                excerpt TEXT,
                tags TEXT[] DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('✦ Database table ready');
    } catch (err) {
        console.error('✕ Database init failed:', err.message);
        process.exit(1);
    }
}

// ─── API Routes ────────────────────────────────

// GET /api/posts — List all posts (public)
app.get('/api/posts', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, title, excerpt, tags, created_at, updated_at FROM posts ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('GET /api/posts error:', err.message);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// GET /api/posts/:id — Get single post (public)
app.get('/api/posts/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('GET /api/posts/:id error:', err.message);
        res.status(500).json({ error: 'Failed to fetch post' });
    }
});

// POST /api/posts — Create or update a post (admin only)
app.post('/api/posts', requireAdmin, async (req, res) => {
    try {
        const { id, title, content, excerpt, tags } = req.body;

        if (!id || !title || !content) {
            return res.status(400).json({ error: 'id, title, and content are required' });
        }

        const result = await pool.query(
            `INSERT INTO posts (id, title, content, excerpt, tags, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                excerpt = EXCLUDED.excerpt,
                tags = EXCLUDED.tags,
                updated_at = NOW()
             RETURNING *`,
            [id, title, content, excerpt || '', tags || []]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('POST /api/posts error:', err.message);
        res.status(500).json({ error: 'Failed to save post' });
    }
});

// DELETE /api/posts/:id — Delete a post (admin only)
app.delete('/api/posts/:id', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM posts WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Post not found' });
        }
        res.json({ deleted: true, id: req.params.id });
    } catch (err) {
        console.error('DELETE /api/posts/:id error:', err.message);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// ─── Start Server ──────────────────────────────
initDB().then(() => {
    app.listen(PORT, () => {
        console.log(`✦ Blog API running on http://localhost:${PORT}`);
        console.log(`✦ Static files served from ${__dirname}`);
    });
});
