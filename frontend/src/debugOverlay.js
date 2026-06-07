// In-app debug console overlay for environments without DevTools (Discord Activity).
// Toggle via the bug button in the header (calls toggleDebugOverlay()).

const MAX_LINES = 500;
const lines = [];
let panel = null;
let body = null;

// Injected by Vite define at build/dev-server start (git hash + time). Falls back in tests.
const BUILD_INFO = (typeof __BUILD_INFO__ !== 'undefined') ? __BUILD_INFO__ : 'dev';

function fmtArg(a) {
    if (a instanceof Error) return (a.stack || a.message || String(a));
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a, null, 2); } catch { return String(a); }
}

function push(level, args) {
    const time = new Date().toISOString().split('T')[1].replace('Z', '');
    const text = Array.from(args).map(fmtArg).join(' ');
    lines.push({ level, time, text });
    if (lines.length > MAX_LINES) lines.shift();
    if (panel && panel.style.display !== 'none') render();
}

function render() {
    if (!body) return;
    const colors = { log: '#cfd2d6', info: '#7fb3ff', warn: '#ffcc66', error: '#ff6b6b', debug: '#9aa0a6' };
    body.textContent = '';
    for (const l of lines) {
        const c = colors[l.level] || '#cfd2d6';
        const row = document.createElement('div');
        row.style.cssText = `color:${c};white-space:pre-wrap;border-bottom:1px solid #2a2d31;padding:4px 6px;font:11px/1.4 ui-monospace,Menlo,monospace`;
        const t = document.createElement('span');
        t.style.color = '#6b7280';
        t.textContent = l.time;
        const lvl = document.createElement('strong');
        lvl.textContent = ` [${l.level}] `;
        const txt = document.createTextNode(l.text || '');
        row.appendChild(t);
        row.appendChild(lvl);
        row.appendChild(txt);
        body.appendChild(row);
    }
    body.scrollTop = body.scrollHeight;
}

function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = 'debug-overlay';
    Object.assign(panel.style, {
        position: 'fixed', top: '5%', left: '5%', right: '5%', bottom: '5%',
        background: '#1c1d22', color: '#cfd2d6', zIndex: '2147483647',
        border: '1px solid #3a3d42', borderRadius: '8px',
        display: 'none', flexDirection: 'column',
        boxShadow: '0 10px 40px rgba(0,0,0,0.6)', overflow: 'hidden',
    });
    const header = document.createElement('div');
    Object.assign(header.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', background: '#23252a', borderBottom: '1px solid #3a3d42',
        font: '12px ui-monospace,Menlo,monospace',
    });
    const title = document.createElement('span');
    title.textContent = 'Debug Console';
    const build = document.createElement('span');
    build.textContent = `  build ${BUILD_INFO}`;
    build.style.color = '#6b7280';
    title.appendChild(build);
    header.appendChild(title);
    const btns = document.createElement('div');
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    [clearBtn, copyBtn, closeBtn].forEach(b => {
        Object.assign(b.style, {
            marginLeft: '6px', background: '#3a3d42', color: '#fff',
            border: 'none', borderRadius: '4px', padding: '4px 10px',
            font: '11px ui-monospace,Menlo,monospace', cursor: 'pointer',
        });
        btns.appendChild(b);
    });
    header.appendChild(btns);
    body = document.createElement('div');
    Object.assign(body.style, { flex: '1', overflow: 'auto' });
    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    clearBtn.onclick = () => { lines.length = 0; render(); };
    copyBtn.onclick = () => {
        const text = lines.map(l => `[${l.time}] [${l.level}] ${l.text}`).join('\n');
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); copyBtn.textContent = 'Copied'; setTimeout(() => copyBtn.textContent = 'Copy', 1200); }
        catch { copyBtn.textContent = 'Fail'; }
        ta.remove();
    };
    closeBtn.onclick = () => toggle(false);
    return panel;
}

function toggle(force) {
    ensurePanel();
    const show = typeof force === 'boolean' ? force : panel.style.display === 'none';
    panel.style.display = show ? 'flex' : 'none';
    if (show) render();
}

export function installDebugOverlay() {
    if (typeof window === 'undefined') return;
    if (window.__debugOverlayInstalled) return;
    window.__debugOverlayInstalled = true;

    const orig = {};
    ['log', 'info', 'warn', 'error', 'debug'].forEach(level => {
        orig[level] = console[level].bind(console);
        console[level] = (...args) => { push(level, args); orig[level](...args); };
    });

    window.addEventListener('error', e => {
        push('error', [`window.onerror: ${e.message}`, `${e.filename}:${e.lineno}:${e.colno}`, e.error && (e.error.stack || '')]);
    });
    window.addEventListener('unhandledrejection', e => {
        const r = e.reason;
        push('error', ['unhandledrejection:', r instanceof Error ? (r.stack || r.message) : r]);
    });

    window.__debugOverlay = { toggle, push, lines };
    push('info', [`Debug overlay armed. build ${BUILD_INFO}`]);
}

export function toggleDebugOverlay(force) {
    toggle(force);
}
