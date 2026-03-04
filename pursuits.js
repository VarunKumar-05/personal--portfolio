/* ============================================
   Pursuits — Live API Integration
   Codeforces · GitHub · LeetCode
   ============================================ */

const CONFIG = {
    codeforces: { handle: 'Varunkumar-01' },
    github: { handle: 'VarunKumar-05' },
    leetcode: { handle: 'varunkumarBalasubramanian' },
    refreshInterval: 5 * 60 * 1000 // 5 minutes
};

// ─── Utility ─────────────────────────────────

function setStatus(id, state, text) {
    const el = document.getElementById(id);
    if (!el) return;
    const dot = el.querySelector('.status-dot');
    const txt = el.querySelector('.status-text');
    dot.className = 'status-dot ' + (state === 'ok' ? '' : state);
    txt.textContent = text;
}

function updateLastRefresh() {
    const el = document.getElementById('last-updated');
    if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(d) {
    return d.toISOString().split('T')[0];
}

// ─── Heatmap Renderer ────────────────────────

function renderHeatmap(containerId, data, colorFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    // Build a 53-week × 7-day grid for the last year
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Start from the Sunday of the week one year ago
    const startDate = new Date(oneYearAgo);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const endDate = new Date(today);

    const current = new Date(startDate);
    while (current <= endDate) {
        const dateStr = formatDate(current);
        const count = data[dateStr] || 0;
        const cell = document.createElement('div');
        cell.className = 'heatmap-day';
        cell.style.background = colorFn(count);
        cell.setAttribute('data-tooltip', `${dateStr}: ${count} ${count === 1 ? 'submission' : 'submissions'}`);
        container.appendChild(cell);
        current.setDate(current.getDate() + 1);
    }
}

function purpleColor(count) {
    if (count === 0) return 'rgba(183,148,244,0.04)';
    const intensity = Math.min(count / 8, 1);
    const alpha = 0.15 + intensity * 0.75;
    return `rgba(183,148,244,${alpha})`;
}

function greenColor(count) {
    if (count === 0) return 'rgba(45,212,140,0.04)';
    const intensity = Math.min(count / 6, 1);
    const alpha = 0.15 + intensity * 0.75;
    return `rgba(45,212,140,${alpha})`;
}

function orangeColor(count) {
    if (count === 0) return 'rgba(255,165,0,0.04)';
    const intensity = Math.min(count / 10, 1);
    const alpha = 0.15 + intensity * 0.75;
    return `rgba(255,165,0,${alpha})`;
}


// ─── Chart.js Defaults ───────────────────────

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(10, 0, 30, 0.95)',
            borderColor: 'rgba(183, 148, 244, 0.3)',
            borderWidth: 1,
            titleFont: { family: 'Rajdhani', size: 12, weight: '600' },
            bodyFont: { family: 'Inter', size: 11 },
            padding: 10,
            cornerRadius: 8,
        }
    },
    scales: {
        x: {
            grid: { color: 'rgba(183,148,244,0.06)', drawBorder: false },
            ticks: { color: 'rgba(183,148,244,0.35)', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 },
            border: { display: false }
        },
        y: {
            grid: { color: 'rgba(183,148,244,0.06)', drawBorder: false },
            ticks: { color: 'rgba(183,148,244,0.35)', font: { family: 'Inter', size: 10 } },
            border: { display: false }
        }
    }
};


// ═══════════════════════════════════════════════
//  CODEFORCES
// ═══════════════════════════════════════════════

let cfRatingChart = null;

async function fetchCodeforces() {
    const h = CONFIG.codeforces.handle;
    setStatus('cf-status', 'loading', 'Loading…');

    try {
        const [infoRes, ratingRes, statusRes] = await Promise.all([
            fetch(`https://codeforces.com/api/user.info?handles=${h}`),
            fetch(`https://codeforces.com/api/user.rating?handle=${h}`),
            fetch(`https://codeforces.com/api/user.status?handle=${h}`)
        ]);

        const info = await infoRes.json();
        const rating = await ratingRes.json();
        const submissions = await statusRes.json();

        if (info.status !== 'OK') throw new Error('CF API error');

        const user = info.result[0];

        // Count unique solved problems
        const solvedSet = new Set();
        if (submissions.status === 'OK') {
            submissions.result.forEach(s => {
                if (s.verdict === 'OK') {
                    solvedSet.add(`${s.problem.contestId}-${s.problem.index}`);
                }
            });
        }

        // Update stats
        const statsEl = document.getElementById('cf-stats');
        const cards = statsEl.querySelectorAll('.stat-card');
        cards[0].querySelector('.stat-value').textContent = user.rating || '—';
        cards[0].classList.remove('skeleton');
        cards[1].querySelector('.stat-value').textContent = user.maxRating || '—';
        cards[1].classList.remove('skeleton');
        cards[2].querySelector('.stat-value').textContent = (user.rank || '—').toUpperCase();
        cards[2].querySelector('.stat-value').style.fontSize = '1rem';
        cards[2].classList.remove('skeleton');
        cards[3].querySelector('.stat-value').textContent = solvedSet.size;
        cards[3].classList.remove('skeleton');

        // Rating graph
        if (rating.status === 'OK' && rating.result.length > 0) {
            const labels = rating.result.map(r => {
                const d = new Date(r.ratingUpdateTimeSeconds * 1000);
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            });
            const data = rating.result.map(r => r.newRating);

            const ctx = document.getElementById('cf-rating-chart').getContext('2d');
            if (cfRatingChart) cfRatingChart.destroy();
            cfRatingChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        data,
                        borderColor: '#b794f4',
                        backgroundColor: 'rgba(183,148,244,0.08)',
                        borderWidth: 2,
                        pointBackgroundColor: '#b794f4',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.3,
                    }]
                },
                options: {
                    ...CHART_DEFAULTS,
                    plugins: {
                        ...CHART_DEFAULTS.plugins,
                        tooltip: {
                            ...CHART_DEFAULTS.plugins.tooltip,
                            callbacks: {
                                title: (items) => rating.result[items[0].dataIndex].contestName || '',
                                label: (item) => `Rating: ${item.raw}`
                            }
                        }
                    }
                }
            });
        }

        // Submission heatmap
        if (submissions.status === 'OK') {
            const heatmapData = {};
            submissions.result.forEach(s => {
                const d = formatDate(new Date(s.creationTimeSeconds * 1000));
                heatmapData[d] = (heatmapData[d] || 0) + 1;
            });
            renderHeatmap('cf-heatmap', heatmapData, purpleColor);
        }

        setStatus('cf-status', 'ok', 'Live');
    } catch (err) {
        console.error('Codeforces fetch error:', err);
        setStatus('cf-status', 'error', 'Error');
    }
}


// ═══════════════════════════════════════════════
//  GITHUB
// ═══════════════════════════════════════════════

async function fetchGitHub() {
    const h = CONFIG.github.handle;
    setStatus('gh-status', 'loading', 'Loading…');

    try {
        const [userRes, contribRes, prsRes] = await Promise.all([
            fetch(`https://api.github.com/users/${h}`),
            fetch(`https://github-contributions-api.jogruber.de/v4/${h}?y=last`),
            fetch(`https://api.github.com/search/issues?q=author:${h}+type:pr&per_page=1`)
        ]);

        const user = await userRes.json();
        const contrib = await contribRes.json();
        const prs = await prsRes.json();

        // Update stats
        const statsEl = document.getElementById('gh-stats');
        const cards = statsEl.querySelectorAll('.stat-card');
        cards[0].querySelector('.stat-value').textContent = contrib.total?.lastYear || 0;
        cards[0].classList.remove('skeleton');
        cards[1].querySelector('.stat-value').textContent = user.public_repos || 0;
        cards[1].classList.remove('skeleton');
        cards[2].querySelector('.stat-value').textContent = prs.total_count || 0;
        cards[2].classList.remove('skeleton');
        cards[3].querySelector('.stat-value').textContent = user.followers || 0;
        cards[3].classList.remove('skeleton');

        // Contribution heatmap
        if (contrib.contributions && contrib.contributions.length > 0) {
            const heatmapData = {};
            contrib.contributions.forEach(c => {
                heatmapData[c.date] = c.count;
            });
            renderHeatmap('gh-heatmap', heatmapData, greenColor);

            // Update tooltip text for GitHub
            document.querySelectorAll('#gh-heatmap .heatmap-day').forEach(cell => {
                const tip = cell.getAttribute('data-tooltip');
                if (tip) {
                    cell.setAttribute('data-tooltip', tip.replace('submission', 'contribution'));
                }
            });
        }

        setStatus('gh-status', 'ok', 'Live');
    } catch (err) {
        console.error('GitHub fetch error:', err);
        setStatus('gh-status', 'error', 'Error');
    }
}


// ═══════════════════════════════════════════════
//  LEETCODE
// ═══════════════════════════════════════════════

let lcRatingChart = null;

async function fetchLeetCode() {
    const h = CONFIG.leetcode.handle;
    const base = 'https://alfa-leetcode-api.onrender.com';
    setStatus('lc-status', 'loading', 'Loading…');

    try {
        const [solvedRes, contestRes, calendarRes] = await Promise.all([
            fetch(`${base}/${h}/solved`),
            fetch(`${base}/${h}/contest`),
            fetch(`${base}/${h}/calendar`)
        ]);

        const solved = await solvedRes.json();
        const contest = await contestRes.json();
        const calendar = await calendarRes.json();

        // Update stats
        const statsEl = document.getElementById('lc-stats');
        const cards = statsEl.querySelectorAll('.stat-card');
        cards[0].querySelector('.stat-value').textContent = solved.solvedProblem || 0;
        cards[0].classList.remove('skeleton');
        cards[1].querySelector('.stat-value').textContent = solved.easySolved || 0;
        cards[1].classList.remove('skeleton');
        cards[2].querySelector('.stat-value').textContent = solved.mediumSolved || 0;
        cards[2].classList.remove('skeleton');
        cards[3].querySelector('.stat-value').textContent = solved.hardSolved || 0;
        cards[3].classList.remove('skeleton');
        cards[4].querySelector('.stat-value').textContent = Math.round(contest.contestRating || 0);
        cards[4].classList.remove('skeleton');

        // Contest rating graph
        if (contest.contestParticipation && contest.contestParticipation.length > 0) {
            const sorted = [...contest.contestParticipation].sort(
                (a, b) => a.contest.startTime - b.contest.startTime
            );

            const labels = sorted.map(c => {
                const title = c.contest.title || '';
                // Shorten: "Weekly Contest 473" → "W473", "Biweekly Contest 172" → "BW172"
                return title.replace('Weekly Contest ', 'W').replace('Biweekly Contest ', 'BW');
            });
            const data = sorted.map(c => Math.round(c.rating));

            const ctx = document.getElementById('lc-rating-chart').getContext('2d');
            if (lcRatingChart) lcRatingChart.destroy();
            lcRatingChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        data,
                        borderColor: '#ffa500',
                        backgroundColor: 'rgba(255,165,0,0.08)',
                        borderWidth: 2,
                        pointBackgroundColor: '#ffa500',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.3,
                    }]
                },
                options: {
                    ...CHART_DEFAULTS,
                    plugins: {
                        ...CHART_DEFAULTS.plugins,
                        tooltip: {
                            ...CHART_DEFAULTS.plugins.tooltip,
                            callbacks: {
                                title: (items) => sorted[items[0].dataIndex].contest.title || '',
                                label: (item) => {
                                    const c = sorted[item.dataIndex];
                                    return [
                                        `Rating: ${item.raw}`,
                                        `Rank: #${c.ranking}`,
                                        `Solved: ${c.problemsSolved}/${c.totalProblems}`
                                    ];
                                }
                            }
                        }
                    }
                }
            });
        }

        // Submission heatmap from calendar
        if (calendar.submissionCalendar) {
            const calData = typeof calendar.submissionCalendar === 'string'
                ? JSON.parse(calendar.submissionCalendar)
                : calendar.submissionCalendar;

            const heatmapData = {};
            Object.entries(calData).forEach(([timestamp, count]) => {
                const d = formatDate(new Date(parseInt(timestamp) * 1000));
                heatmapData[d] = count;
            });
            renderHeatmap('lc-heatmap', heatmapData, orangeColor);
        }

        setStatus('lc-status', 'ok', 'Live');
    } catch (err) {
        console.error('LeetCode fetch error:', err);
        setStatus('lc-status', 'error', 'Error');
    }
}


// ═══════════════════════════════════════════════
//  INIT & REFRESH
// ═══════════════════════════════════════════════

async function fetchAll() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('spinning');

    await Promise.allSettled([
        fetchCodeforces(),
        fetchGitHub(),
        fetchLeetCode()
    ]);

    updateLastRefresh();
    if (refreshBtn) refreshBtn.classList.remove('spinning');
}

// Manual refresh
document.getElementById('refresh-btn')?.addEventListener('click', () => {
    fetchAll();
});

// Initial load
fetchAll();

// Auto-refresh
setInterval(fetchAll, CONFIG.refreshInterval);
