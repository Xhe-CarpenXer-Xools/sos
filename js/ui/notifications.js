// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Notification System
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

const COLORS = {
    ok: 'var(--green)',
    info: 'var(--cyan)',
    warn: 'var(--amber)',
    error: 'var(--red)'
};

/**
 * Show notification toast
 */
export function notify(msg, type = 'info') {
    const el = document.getElementById('notif');
    if (!el) return;

    const n = document.createElement('div');
    n.className = 'notif-item';
    n.style.cssText = `
        padding: 12px 18px;
        background: var(--surface);
        border: 1px solid ${COLORS[type] || COLORS.info};
        border-radius: 16px;
        font-size: 12px;
        color: var(--text);
        margin-bottom: 6px;
        pointer-events: none;
        font-family: var(--sans);
        box-shadow: 0 4px 20px rgba(0,0,0,.3);
    `;
    n.textContent = msg;
    el.appendChild(n);

    setTimeout(() => {
        n.style.opacity = '0';
        n.style.transition = 'opacity .4s';
        setTimeout(() => n.remove(), 400);
    }, 3500);
}

/**
 * Show confirmation dialog
 */
export function confirmDialog(msg) {
    return window.confirm(msg);
}

/**
 * Show prompt dialog
 */
export function promptDialog(msg, defaultValue = '') {
    return window.prompt(msg, defaultValue);
}
