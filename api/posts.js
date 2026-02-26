/* ============================================
   Blog API — Vercel Serverless Function
   Handles /api/posts and /api/posts/:id
   ============================================ */

const { Pool } = require('pg');

// ─── Database Connection (reused across warm invocations) ───
let pool;
function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 3
        });
    }
    return pool;
}

// ─── Ensure Table Exists ────────────────────────
let tableReady = false;
async function ensureTable() {
    if (tableReady) return;
    await getPool().query(`
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
    tableReady = true;
}

// ─── Admin Key Check ────────────────────────────
function isAdmin(req) {
    const key = req.headers['x-admin-key'];
    return key && key === process.env.ADMIN_SECRET;
}

// ─── CORS Headers ───────────────────────────────
function setCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
}

// ─── Extract post ID from URL path ──────────────
function extractId(url) {
    // URL can be /api/posts/some-id or /api/posts
    const match = url.match(/\/api\/posts\/([^/?]+)/);
    return match ? match[1] : null;
}

// ─── Main Handler ───────────────────────────────
module.exports = async function handler(req, res) {
    setCors(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        await ensureTable();
        const db = getPool();
        const postId = extractId(req.url);

        // ── GET /api/posts — List all posts ──
        if (req.method === 'GET' && !postId) {
            const result = await db.query(
                'SELECT id, title, excerpt, tags, created_at, updated_at FROM posts ORDER BY created_at DESC'
            );
            return res.status(200).json(result.rows);
        }

        // ── GET /api/posts/:id — Single post ──
        if (req.method === 'GET' && postId) {
            const result = await db.query('SELECT * FROM posts WHERE id = $1', [postId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Post not found' });
            }
            return res.status(200).json(result.rows[0]);
        }

        // ── POST /api/posts — Create or update ──
        if (req.method === 'POST') {
            if (!isAdmin(req)) {
                return res.status(403).json({ error: 'Forbidden — invalid admin key' });
            }
            const { id, title, content, excerpt, tags } = req.body;
            if (!id || !title || !content) {
                return res.status(400).json({ error: 'id, title, and content are required' });
            }
            const result = await db.query(
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
            return res.status(200).json(result.rows[0]);
        }

        // ── DELETE /api/posts/:id — Delete post ──
        if (req.method === 'DELETE' && postId) {
            if (!isAdmin(req)) {
                return res.status(403).json({ error: 'Forbidden — invalid admin key' });
            }
            const result = await db.query('DELETE FROM posts WHERE id = $1 RETURNING id', [postId]);
            if (result.rows.length === 0) {
                return res.status(404).json({ error: 'Post not found' });
            }
            return res.status(200).json({ deleted: true, id: postId });
        }

        // ── Fallback ──
        return res.status(405).json({ error: 'Method not allowed' });

    } catch (err) {
        console.error('API Error:', err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
