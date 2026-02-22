/* ============================================
   Blog System — JavaScript Engine
   Infinite Void Blog Management
   ============================================ */

// ─── API Configuration ─────────────────────────
// When running via server.js, API is on the same origin.
// Change this if deploying the API elsewhere.
const API_BASE = '/api';

// ─── Admin Key Management ──────────────────────
function getAdminKey() {
    return sessionStorage.getItem('admin_key') || null;
}

function promptAdminKey() {
    const key = prompt('Enter admin key to save/delete posts:');
    if (key) {
        sessionStorage.setItem('admin_key', key);
    }
    return key;
}

function ensureAdminKey() {
    let key = getAdminKey();
    if (!key) {
        key = promptAdminKey();
    }
    return key;
}

// ─── Blog Data Layer (API) ─────────────────────
async function getBlogs() {
    try {
        const res = await fetch(`${API_BASE}/posts`);
        if (!res.ok) throw new Error('Failed to fetch posts');
        const posts = await res.json();
        // Normalize field names (snake_case → camelCase)
        return posts.map(p => ({
            id: p.id,
            title: p.title,
            content: p.content,
            excerpt: p.excerpt,
            tags: p.tags || [],
            createdAt: p.created_at,
            updatedAt: p.updated_at
        }));
    } catch (err) {
        console.error('getBlogs error:', err);
        return [];
    }
}

async function getBlog(id) {
    try {
        const res = await fetch(`${API_BASE}/posts/${id}`);
        if (!res.ok) return null;
        const p = await res.json();
        return {
            id: p.id,
            title: p.title,
            content: p.content,
            excerpt: p.excerpt,
            tags: p.tags || [],
            createdAt: p.created_at,
            updatedAt: p.updated_at
        };
    } catch (err) {
        console.error('getBlog error:', err);
        return null;
    }
}

async function saveBlog(post) {
    const key = ensureAdminKey();
    if (!key) {
        showToast('⚠ Admin key required to save');
        return false;
    }
    try {
        const res = await fetch(`${API_BASE}/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': key
            },
            body: JSON.stringify(post)
        });
        if (res.status === 403) {
            sessionStorage.removeItem('admin_key');
            showToast('⚠ Invalid admin key');
            return false;
        }
        if (!res.ok) throw new Error('Save failed');
        return true;
    } catch (err) {
        console.error('saveBlog error:', err);
        showToast('⚠ Failed to save post');
        return false;
    }
}

async function deleteBlog(id) {
    const key = ensureAdminKey();
    if (!key) {
        showToast('⚠ Admin key required to delete');
        return false;
    }
    try {
        const res = await fetch(`${API_BASE}/posts/${id}`, {
            method: 'DELETE',
            headers: { 'X-Admin-Key': key }
        });
        if (res.status === 403) {
            sessionStorage.removeItem('admin_key');
            showToast('⚠ Invalid admin key');
            return false;
        }
        if (!res.ok) throw new Error('Delete failed');
        return true;
    } catch (err) {
        console.error('deleteBlog error:', err);
        showToast('⚠ Failed to delete post');
        return false;
    }
}

function generateId() {
    return 'post_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}

function generateExcerpt(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    return text.substring(0, 180).trim() + (text.length > 180 ? '...' : '');
}

function calculateReadTime(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    const text = div.textContent || div.innerText || '';
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    const minutes = Math.max(1, Math.ceil(wordCount / 200));
    return `${minutes} min read`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// ─── Toast Notification ────────────────────────
function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── Blog Listing Page Logic ───────────────────
async function initBlogListing() {
    const grid = document.getElementById('blog-grid');
    const emptyState = document.getElementById('blog-empty');
    if (!grid) return;

    const blogs = await getBlogs();

    if (blogs.length === 0) {
        grid.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    grid.style.display = 'grid';
    grid.innerHTML = '';

    blogs.forEach(blog => {
        const card = document.createElement('a');
        card.className = 'blog-card';
        card.href = `blog-post.html?id=${blog.id}`;

        const tags = (blog.tags || []).map(t =>
            `<span class="blog-tag">${escapeHtml(t)}</span>`
        ).join('');

        card.innerHTML = `
            <div class="blog-card-meta">
                <span>${formatDate(blog.createdAt)}</span>
                <span class="dot"></span>
                <span>${blog.content ? calculateReadTime(blog.content) : '1 min read'}</span>
            </div>
            <div class="blog-card-title">${escapeHtml(blog.title)}</div>
            <div class="blog-card-excerpt">${escapeHtml(blog.excerpt || '')}</div>
            <div class="blog-card-tags">${tags}</div>
            <div class="blog-card-arrow">→</div>
        `;
        grid.appendChild(card);
    });
}

// ─── Blog Editor Logic ─────────────────────────
async function initBlogEditor() {
    const titleInput = document.getElementById('editor-title');
    const contentArea = document.getElementById('editor-content');
    const tagsInput = document.getElementById('tags-input');
    const tagsContainer = document.getElementById('tags-container');
    const saveBtn = document.getElementById('btn-save');
    const exportBtn = document.getElementById('btn-export');
    const deleteBtn = document.getElementById('btn-delete');

    if (!titleInput || !contentArea) return;

    let currentTags = [];
    let editId = null;

    // Check if editing existing post
    const params = new URLSearchParams(window.location.search);
    editId = params.get('id');

    if (editId) {
        const post = await getBlog(editId);
        if (post) {
            titleInput.value = post.title;
            contentArea.innerHTML = post.content;
            currentTags = post.tags || [];
            renderTags();
            if (deleteBtn) deleteBtn.style.display = 'flex';
        }
    }

    // Tags handling
    if (tagsInput) {
        tagsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const tag = tagsInput.value.trim().replace(/,/g, '');
                if (tag && !currentTags.includes(tag)) {
                    currentTags.push(tag);
                    renderTags();
                }
                tagsInput.value = '';
            }
            if (e.key === 'Backspace' && tagsInput.value === '' && currentTags.length > 0) {
                currentTags.pop();
                renderTags();
            }
        });
    }

    function renderTags() {
        if (!tagsContainer) return;
        // Remove existing pills
        tagsContainer.querySelectorAll('.tag-pill').forEach(el => el.remove());
        currentTags.forEach((tag, i) => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            pill.innerHTML = `${escapeHtml(tag)} <span class="tag-remove" data-index="${i}">✕</span>`;
            tagsContainer.insertBefore(pill, tagsInput);
        });
        // Remove tag on click
        tagsContainer.querySelectorAll('.tag-remove').forEach(el => {
            el.addEventListener('click', () => {
                currentTags.splice(parseInt(el.dataset.index), 1);
                renderTags();
            });
        });
    }

    // Toolbar buttons
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            const val = btn.dataset.val || null;

            if (cmd === 'createLink') {
                const url = prompt('Enter URL:');
                if (url) document.execCommand(cmd, false, url);
            } else if (cmd === 'insertImage') {
                const url = prompt('Enter image URL:');
                if (url) document.execCommand(cmd, false, url);
            } else if (cmd === 'formatBlock' && val === 'pre') {
                document.execCommand('formatBlock', false, 'pre');
            } else {
                document.execCommand(cmd, false, val);
            }
            contentArea.focus();
        });
    });

    // Save
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const title = titleInput.value.trim();
            const content = contentArea.innerHTML.trim();

            if (!title) {
                showToast('⚠ Please enter a title');
                titleInput.focus();
                return;
            }
            if (!content || content === '<br>') {
                showToast('⚠ Please write some content');
                contentArea.focus();
                return;
            }

            const post = {
                id: editId || generateId(),
                title,
                content,
                excerpt: generateExcerpt(content),
                tags: currentTags,
            };

            saveBtn.disabled = true;
            saveBtn.textContent = '⏳ Saving...';

            const success = await saveBlog(post);
            if (success) {
                showToast('✦ Post saved successfully');
                setTimeout(() => {
                    window.location.href = 'blog.html';
                }, 800);
            } else {
                saveBtn.disabled = false;
                saveBtn.textContent = '✦ Save Post';
            }
        });
    }

    // Export as HTML
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const title = titleInput.value.trim() || 'Untitled';
            const content = contentArea.innerHTML;
            const htmlContent = generateExportHTML(title, content, currentTags);
            downloadHTML(title, htmlContent);
            showToast('✦ Blog exported as HTML');
        });
    }

    // Delete
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            showConfirmDialog('Delete this post?', 'This action cannot be undone. The post will be permanently removed.', async () => {
                const success = await deleteBlog(editId);
                if (success) {
                    showToast('✦ Post deleted');
                    setTimeout(() => {
                        window.location.href = 'blog.html';
                    }, 800);
                }
            });
        });
    }
}

// ─── Blog Post Viewer Logic ────────────────────
async function initBlogPost() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        window.location.href = 'blog.html';
        return;
    }

    const post = await getBlog(id);
    if (!post) {
        window.location.href = 'blog.html';
        return;
    }

    const titleEl = document.getElementById('post-title');
    const dateEl = document.getElementById('post-date');
    const readTimeEl = document.getElementById('post-readtime');
    const tagsEl = document.getElementById('post-tags');
    const bodyEl = document.getElementById('post-body');
    const editLink = document.getElementById('edit-link');
    const deleteBtn = document.getElementById('delete-post-btn');

    if (titleEl) titleEl.textContent = post.title;
    if (dateEl) dateEl.textContent = formatDate(post.createdAt);
    if (readTimeEl) readTimeEl.textContent = calculateReadTime(post.content);
    if (bodyEl) bodyEl.innerHTML = post.content;
    if (editLink) editLink.href = `blog-editor.html?id=${post.id}`;

    if (tagsEl) {
        tagsEl.innerHTML = (post.tags || []).map(t =>
            `<span class="blog-tag">${escapeHtml(t)}</span>`
        ).join('');
    }

    // Update page title
    document.title = `${post.title} — Infinite Void Blog`;

    // Delete handler
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            showConfirmDialog('Delete this post?', 'This action cannot be undone.', async () => {
                const success = await deleteBlog(id);
                if (success) {
                    showToast('✦ Post deleted');
                    setTimeout(() => {
                        window.location.href = 'blog.html';
                    }, 800);
                }
            });
        });
    }
}

// ─── Export HTML Generator ─────────────────────
function generateExportHTML(title, content, tags) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: linear-gradient(180deg, #000 0%, #050015 30%, #0a0020 60%, #050015 85%, #000 100%);
            font-family: 'Inter', sans-serif;
            color: rgba(224, 224, 224, 0.85);
            min-height: 100vh;
            padding: 60px 24px;
        }
        .container { max-width: 780px; margin: 0 auto; }
        h1 {
            font-family: 'Orbitron', sans-serif;
            font-size: 2.5rem;
            font-weight: 900;
            letter-spacing: 3px;
            background: linear-gradient(180deg, #fff 0%, #b794f4 80%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            text-align: center;
            margin-bottom: 16px;
        }
        .meta {
            text-align: center;
            font-size: 0.8rem;
            color: rgba(183, 148, 244, 0.5);
            letter-spacing: 3px;
            text-transform: uppercase;
            margin-bottom: 48px;
        }
        .tags { text-align: center; margin-bottom: 40px; }
        .tag {
            display: inline-block;
            font-size: 0.75rem;
            padding: 4px 14px;
            border-radius: 20px;
            color: #b794f4;
            border: 1px solid rgba(183, 148, 244, 0.2);
            margin: 0 4px;
        }
        .content { font-size: 1.05rem; line-height: 2; }
        .content h2, .content h3 {
            font-family: 'Orbitron', sans-serif;
            color: #ffffff;
            margin: 40px 0 16px;
        }
        .content p { margin-bottom: 20px; }
        .content blockquote {
            border-left: 3px solid #b794f4;
            padding: 16px 24px;
            margin: 24px 0;
            color: rgba(183, 148, 244, 0.7);
            font-style: italic;
        }
        .content code {
            background: rgba(183, 148, 244, 0.08);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.88rem;
            color: #b794f4;
        }
        .content pre {
            background: rgba(183, 148, 244, 0.04);
            border: 1px solid rgba(183, 148, 244, 0.1);
            border-radius: 12px;
            padding: 24px;
            overflow-x: auto;
            margin: 24px 0;
        }
        .content img { max-width: 100%; border-radius: 12px; margin: 24px 0; }
        .content a { color: #b794f4; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        ${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        <div class="content">${content}</div>
    </div>
</body>
</html>`;
}

function downloadHTML(title, html) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Confirm Dialog ────────────────────────────
function showConfirmDialog(title, message, onConfirm) {
    let overlay = document.getElementById('confirm-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'confirm-overlay';
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-dialog">
                <h3 id="confirm-title"></h3>
                <p id="confirm-message"></p>
                <div class="confirm-actions">
                    <button class="post-action-link" id="confirm-cancel">Cancel</button>
                    <button class="btn-delete" id="confirm-yes">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    overlay.classList.add('visible');

    const cancel = document.getElementById('confirm-cancel');
    const yes = document.getElementById('confirm-yes');

    const cleanup = () => {
        overlay.classList.remove('visible');
        cancel.replaceWith(cancel.cloneNode(true));
        yes.replaceWith(yes.cloneNode(true));
    };

    document.getElementById('confirm-cancel').addEventListener('click', cleanup);
    document.getElementById('confirm-yes').addEventListener('click', () => {
        cleanup();
        onConfirm();
    });
}

// ─── Utility ───────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Auto-Init ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Detect which page we're on
    if (document.getElementById('blog-grid')) {
        initBlogListing();
    }
    if (document.getElementById('editor-content')) {
        initBlogEditor();
    }
    if (document.getElementById('post-body')) {
        initBlogPost();
    }
});
