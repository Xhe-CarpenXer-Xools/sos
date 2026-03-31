// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Desktop Window Manager
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { appState } from '../core/state.js';
import { esc } from '../core/utils.js';

let winZIndex = 100;

const DESKTOP_ICONS = [
    { id: 'terminal', icon: '⬛', label: 'Terminal' },
    { id: 'explorer', icon: '📁', label: 'Files' },
    { id: 'wallet', icon: '💰', label: 'Wallet' },
    { id: 'settings', icon: '⚙', label: 'Settings' },
    { id: 'monitor', icon: '📊', label: 'Monitor' }
];

const WINDOW_CONTENT = {
    terminal: `
        <div style="background:#0a0c14;height:100%;padding:12px;font-family:var(--mono);font-size:11px;color:#0f0">
            <div>SOVEREIGN OS v8.1 — Terminal</div>
            <div style="margin-top:8px">root@sos:~#<span id="term-cursor" style="animation:blink 1s infinite">█</span></div>
            <input id="term-in" style="background:none;border:none;color:#0f0;width:100%;outline:none;font-family:inherit" autofocus>
        </div>
    `,
    explorer: `
        <div style="padding:12px">
            <div style="margin-bottom:8px;font-size:11px;color:var(--text3)">/ home / sovereign /</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px" id="file-grid">
                <div class="file-item">📄 identity.json</div>
                <div class="file-item">🔒 vault.enc</div>
                <div class="file-item">📁 workflows/</div>
                <div class="file-item">📄 events.log</div>
                <div class="file-item">📁 agents/</div>
            </div>
        </div>
    `,
    wallet: `
        <div style="padding:12px;text-align:center">
            <div style="font-size:32px;font-family:var(--display);color:var(--green)" id="wallet-bal">0.00</div>
            <div style="font-size:11px;color:var(--text3)">SVGT Balance</div>
            <div style="margin-top:16px;display:flex;gap:8px;justify-content:center">
                <button class="btn btn-g btn-sm" onclick="window.SOS?.mintTokensUI()">Mint</button>
                <button class="btn btn-c btn-sm" onclick="window.SOS?.showTransferModal()">Transfer</button>
            </div>
        </div>
    `,
    settings: `
        <div style="padding:12px;font-size:11px">
            <div style="margin-bottom:8px"><strong>System Settings</strong></div>
            <label style="display:flex;gap:8px;margin-bottom:8px"><input type="checkbox" id="set-relay"> Force Relay Mode</label>
            <label style="display:flex;gap:8px;margin-bottom:8px"><input type="checkbox" id="set-dark" checked> Dark Theme</label>
            <label style="display:flex;gap:8px"><input type="checkbox" id="set-notif" checked> Notifications</label>
        </div>
    `,
    monitor: `
        <div style="padding:12px">
            <div style="font-size:11px;color:var(--text3);margin-bottom:8px">SYSTEM MONITOR</div>
            <canvas id="mon-canvas" width="200" height="100" style="width:100%;background:var(--bg2);border-radius:8px"></canvas>
            <div style="margin-top:8px;font-size:10px;color:var(--text2)" id="mon-stats">Events: 0 | Peers: 0 | Gas: 0</div>
        </div>
    `
};

/**
 * Open a desktop window
 */
export function openWindow(type) {
    const existing = appState.openWindows.find(w => w.type === type);
    if (existing) {
        focusWindow(existing.id);
        return;
    }

    const id = 'win-' + Date.now();
    const win = {
        id,
        type,
        x: 50 + appState.openWindows.length * 30,
        y: 50 + appState.openWindows.length * 30,
        width: 320,
        height: 240
    };
    appState.openWindows.push(win);

    renderWindow(win);
    updateTaskbar();
    focusWindow(id);
}

/**
 * Render window element
 */
function renderWindow(win) {
    const layer = document.getElementById('window-layer');
    if (!layer) return;

    const el = document.createElement('div');
    el.id = win.id;
    el.className = 'desktop-window';
    el.style.cssText = `
        position: absolute;
        left: ${win.x}px;
        top: ${win.y}px;
        width: ${win.width}px;
        min-height: ${win.height}px;
        background: var(--surface);
        border: 1px solid var(--border2);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.5);
        z-index: ${++winZIndex};
        overflow: hidden;
        pointer-events: all;
    `;

    el.innerHTML = `
        <div class="win-header" style="display:flex;align-items:center;padding:8px 12px;background:var(--surface2);border-bottom:1px solid var(--border);cursor:move">
            <span style="font-size:11px;font-weight:600;flex:1;text-transform:capitalize">${esc(win.type)}</span>
            <button onclick="window.SOS?.closeWindow('${win.id}')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px">✕</button>
        </div>
        <div class="win-body">${WINDOW_CONTENT[win.type] || ''}</div>
    `;

    // Make draggable
    const header = el.querySelector('.win-header');
    let isDragging = false, startX, startY, origX, origY;

    header.addEventListener('mousedown', e => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = win.x;
        origY = win.y;
        focusWindow(win.id);
    });

    document.addEventListener('mousemove', e => {
        if (!isDragging) return;
        win.x = origX + (e.clientX - startX);
        win.y = origY + (e.clientY - startY);
        el.style.left = win.x + 'px';
        el.style.top = win.y + 'px';
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    layer.appendChild(el);
}

/**
 * Close a window by ID
 */
export function closeWindow(id) {
    appState.openWindows = appState.openWindows.filter(w => w.id !== id);
    document.getElementById(id)?.remove();
    updateTaskbar();
}

/**
 * Focus a window (bring to front)
 */
export function focusWindow(id) {
    appState.activeWinId = id;
    const el = document.getElementById(id);
    if (el) el.style.zIndex = ++winZIndex;
}

/**
 * Update taskbar with open windows
 */
export function updateTaskbar() {
    const bar = document.getElementById('desktop-taskbar');
    if (!bar) return;

    bar.innerHTML = appState.openWindows.map(w => `
        <button class="btn btn-ghost btn-sm ${w.id === appState.activeWinId ? 'active' : ''}"
            onclick="window.SOS?.focusWindow('${w.id}')"
            style="font-size:10px">
            ${esc(w.type)}
        </button>
    `).join('');
}

/**
 * Initialize desktop environment
 */
export function initDesktop() {
    const iconGrid = document.getElementById('desktop-icons');
    if (!iconGrid) return;

    iconGrid.innerHTML = DESKTOP_ICONS.map(icon => `
        <div class="desktop-icon" onclick="window.SOS?.openWindow('${icon.id}')"
            style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;padding:8px;border-radius:8px;font-size:10px;color:var(--text2)">
            <span style="font-size:24px">${icon.icon}</span>
            <span>${esc(icon.label)}</span>
        </div>
    `).join('');
}
