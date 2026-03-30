// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — PeerJS Network Manager
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { CONFIG } from '../core/config.js';
import { appState, replay, sysLogEntry } from '../core/state.js';
import { sha256 } from '../core/crypto.js';
import { setEl, rateLimit, validateEventPayload, esc, canonical } from '../core/utils.js';
import { bloomFilter, BloomFilter } from './bloom-filter.js';
import { reconnectBackoff } from './backoff.js';
import { notify } from '../ui/notifications.js';
import { saveLog } from '../core/persistence.js';

let reconnectTimer = null;

/**
 * Build PeerJS configuration based on relay mode
 */
export function buildPeerConfig() {
    const iceConfig = appState.relayMode ? {
        iceServers: CONFIG.iceServers,
        iceTransportPolicy: 'relay'
    } : {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    return {
        ...CONFIG.peerJS,
        config: iceConfig
    };
}

/**
 * Initialize PeerJS connection
 */
export function initPeerJS() {
    const savedId = localStorage.getItem('sos-peer-id-v8') || undefined;

    try {
        appState.peerJS = new Peer(savedId, buildPeerConfig());
    } catch (e) {
        setConnStatus('PeerJS unavailable', 'var(--red)');
        return;
    }

    appState.peerJS.on('open', id => {
        appState.peerJSReady = true;
        localStorage.setItem('sos-peer-id-v8', id);
        setEl('my-peer-id', id);

        const badge = document.getElementById('peerjs-status-badge');
        if (badge) {
            badge.textContent = 'online';
            badge.className = 'tag tag-live';
        }

        setConnStatus('Ready — share Peer ID to connect', 'var(--amber)');
        netLog('PeerJS ready · ' + id.slice(0, 16) + '…');
        document.getElementById('dot-net')?.classList.add('live');
        setEl('lbl-net', 'NET:OK');

        reconnectBackoff.reset();
        appState.reconnectAttempts = 0;
        setEl('reconnect-count', '0');
    });

    appState.peerJS.on('connection', conn => {
        netLog('Incoming from ' + conn.peer.slice(0, 14) + '…');
        setupPeerJSConn(conn);
    });

    appState.peerJS.on('error', err => {
        setConnStatus('PeerJS error: ' + err.type, 'var(--red)');
        netLog('ERROR: ' + err.message);

        if (err.type === 'unavailable-id') {
            // Stored ID is no longer registered on the broker — clear it and
            // reinitialise immediately with a fresh server-assigned ID.
            netLog('Stale Peer ID detected — clearing and retrying with a new ID…');
            localStorage.removeItem('sos-peer-id-v8');
            appState.peerJS.destroy();
            appState.peerJS = null;
            appState.peerJSReady = false;
            initPeerJS();
            return;
        }

        scheduleReconnect();
    });

    appState.peerJS.on('disconnected', () => {
        netLog('Disconnected — scheduling reconnect…');
        scheduleReconnect();
    });
}

/**
 * Schedule reconnection with exponential backoff
 */
export function scheduleReconnect() {
    if (reconnectTimer) return;

    const delay = reconnectBackoff.next();
    appState.reconnectAttempts++;
    setEl('reconnect-count', appState.reconnectAttempts);

    netLog(`Reconnecting in ${Math.round(delay / 1000)}s (attempt ${appState.reconnectAttempts})…`);

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        try {
            if (appState.peerJS && appState.peerJS.disconnected) {
                appState.peerJS.reconnect();
            } else {
                initPeerJS();
            }
        } catch {
            scheduleReconnect();
        }
    }, delay);
}

/**
 * Setup peer connection
 */
export function setupPeerJSConn(conn) {
    const p = {
        id: conn.peer,
        connected: false,
        did: null,
        relayed: appState.relayMode,
        send: msg => { if (conn.open) conn.send(msg); }
    };

    conn.on('open', () => {
        p.connected = true;
        appState.peers.set(conn.peer, p);
        setEl('peer-count', appState.peers.size);
        updateBFTStats();
        netLog('Connected: ' + conn.peer.slice(0, 14) + '…' + (p.relayed ? ' [RELAY]' : ' [DIRECT]'));

        const badge = document.getElementById('conn-indicator-badge');
        if (badge) {
            badge.textContent = p.relayed ? '🔒 Via TURN Relay' : '⟷ Direct P2P';
            badge.className = 'conn-indicator ' + (p.relayed ? 'conn-relay' : 'conn-direct');
        }

        notify('Peer connected: ' + conn.peer.slice(0, 14) + '…', 'ok');
        sysLogEntry('NET', 'Peer connected: ' + conn.peer.slice(0, 16));

        // Exchange identity
        if (appState.identity) {
            p.send({ type: 'hello', did: appState.identity.did, pubHex: appState.keypair.pubHex });
        }

        // Request sync
        p.send({ type: 'sync_request', from: appState.log.length ? appState.log[appState.log.length - 1].cid : null });
    });

    conn.on('data', async msg => {
        if (!rateLimit('peerMsg_' + conn.peer, CONFIG.rateLimit.peerMsg)) return;
        await handlePeerMessage(p, msg);
    });

    conn.on('close', () => {
        appState.peers.delete(conn.peer);
        setEl('peer-count', appState.peers.size);
        updateBFTStats();
        netLog('Disconnected: ' + conn.peer.slice(0, 14) + '…');
        sysLogEntry('NET', 'Peer disconnected: ' + conn.peer.slice(0, 16));
    });

    conn.on('error', err => {
        netLog('Peer error: ' + err.message);
    });
}

/**
 * Handle incoming peer messages
 */
async function handlePeerMessage(p, msg) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'hello') {
        p.did = msg.did;
        netLog('Identity: ' + (msg.did || '?').slice(0, 20) + '…');

        if (p.connected) {
            p.send({ type: 'sync_request', from: appState.log.length ? appState.log[appState.log.length - 1].cid : null });
        }
    }

    if (msg.type === 'event') {
        const e = msg.event;
        if (!e || !e.cid) return;

        // Bloom filter dedup
        if (bloomFilter.has(e.cid)) {
            appState.bloomDeduped++;
            setEl('bloom-deduped', appState.bloomDeduped);
            return;
        }
        if (appState.log.find(l => l.cid === e.cid)) {
            appState.bloomDeduped++;
            setEl('bloom-deduped', appState.bloomDeduped);
            return;
        }

        // Validation
        if (!validateEventPayload(e.payload?.type, e.payload?.data || {})) {
            sysLogEntry('SECURITY', 'Quarantined invalid peer event');
            notify('Remote event quarantined: invalid payload', 'warn');
            return;
        }

        e._verified = true;
        appState.log.push(e);
        bloomFilter.add(e.cid);
        appState.state = replay(appState.log);
        appState.gossipCount++;

        await saveLog();
        setEl('gossip-count', appState.gossipCount);
        sysLogEntry('NET', 'Remote event: ' + e.payload?.type + ' from ' + (e.author || 'anon').slice(0, 16) + '…');
    }

    if (msg.type === 'sync_request') {
        const eventsToSend = appState.log.slice(-20);
        for (const e of eventsToSend) {
            p.send({ type: 'event', event: e });
        }
        netLog('Sync: sent ' + eventsToSend.length + ' events');
    }
}

/**
 * Broadcast event to all connected peers
 */
export function broadcastEvent(e) {
    for (const p of appState.peers.values()) {
        if (p.connected) {
            p.send({ type: 'event', event: e });
            appState.gossipCount++;
        }
    }
}

/**
 * Connect to remote peer
 */
export function autoConnect() {
    const remoteId = document.getElementById('remote-peer-id')?.value?.trim();

    if (!remoteId) {
        notify('Paste remote Peer ID first');
        return;
    }
    if (!appState.peerJSReady || !appState.peerJS) {
        notify('PeerJS not ready yet');
        return;
    }
    if (appState.peers.has(remoteId)) {
        notify('Already connected to this peer');
        return;
    }

    const btn = document.getElementById('auto-connect-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Connecting…';
    }

    setConnStatus('Dialing ' + remoteId.slice(0, 14) + '…', 'var(--cyan)');
    netLog('Dialing → ' + remoteId.slice(0, 16) + '…');

    const conn = appState.peerJS.connect(remoteId, { reliable: true, serialization: 'json' });
    setupPeerJSConn(conn);

    setTimeout(() => {
        if (!appState.peers.get(remoteId)?.connected) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Connect Peer';
            }
            setConnStatus('Timed out', 'var(--red)');
            appState.peers.delete(remoteId);
        }
    }, 20000);
}

/**
 * Toggle relay mode
 */
export function toggleRelayMode() {
    appState.relayMode = !appState.relayMode;

    const badge = document.getElementById('relay-mode-badge');
    if (badge) {
        if (appState.relayMode) {
            badge.textContent = '🔒 Via TURN Relay';
            badge.className = 'conn-indicator conn-relay';
        } else {
            badge.textContent = '⟷ Direct P2P';
            badge.className = 'conn-indicator conn-direct';
        }
    }

    notify(appState.relayMode ? '🔒 Relay mode ON — IP hidden, via TURN' : '⟷ Direct P2P mode — faster, exposes IP', appState.relayMode ? 'warn' : 'info');
    sysLogEntry('NET', 'Relay mode: ' + (appState.relayMode ? 'ON' : 'OFF'));
}

/**
 * Export offline pairing blob
 */
export async function exportOfflinePairing() {
    if (!appState.peerJSReady) {
        notify('PeerJS not ready yet');
        return;
    }

    const myId = document.getElementById('my-peer-id').textContent.trim();
    const stateHash = await sha256(JSON.stringify(appState.state));

    const blob = {
        v: 8,
        peerId: myId,
        did: appState.identity?.did,
        headCid: appState.log.length ? appState.log[appState.log.length - 1].cid : null,
        stateHash,
        events: appState.log.length,
        ts: Date.now()
    };

    const b64 = btoa(JSON.stringify(blob));
    const el = document.getElementById('offline-blob');
    if (el) el.value = b64;

    navigator.clipboard.writeText(b64)
        .then(() => notify('Pairing blob copied to clipboard', 'ok'))
        .catch(() => notify('Paste the blob to your peer'));

    sysLogEntry('NET', 'Offline pairing blob exported');
}

/**
 * Import offline pairing blob
 */
export async function importOfflinePairing() {
    const el = document.getElementById('offline-blob');
    const b64 = el?.value?.trim();

    if (!b64) {
        notify('Paste a pairing blob first');
        return;
    }

    try {
        const blob = JSON.parse(atob(b64));
        if (!blob.peerId) throw new Error('Invalid pairing blob');

        document.getElementById('remote-peer-id').value = blob.peerId;
        notify('Peer ID loaded: ' + blob.peerId.slice(0, 14) + '…  State hash: ' + blob.stateHash.slice(0, 12) + '…');
        sysLogEntry('NET', 'Offline pairing import: ' + blob.peerId.slice(0, 14));

        const myHash = await sha256(JSON.stringify(appState.state));
        const match = myHash === blob.stateHash;
        setEl('peer-state-verify', match ? '✓ hashes match' : '⚠ divergent state');
        const verifyEl = document.getElementById('peer-state-verify');
        if (verifyEl) verifyEl.style.color = match ? 'var(--green)' : 'var(--amber)';
    } catch (e) {
        notify('Import failed: ' + e.message, 'error');
    }
}

// Utility functions
export function setConnStatus(msg, color) {
    const el = document.getElementById('conn-status');
    if (el) {
        el.textContent = msg;
        el.style.color = color || 'var(--amber)';
    }
}

export function copyPeerId() {
    const id = document.getElementById('my-peer-id')?.textContent?.trim();
    if (!id || id === 'Initializing…') {
        notify('Peer ID not ready yet');
        return;
    }
    navigator.clipboard.writeText(id)
        .then(() => notify('Peer ID copied!'))
        .catch(() => notify('Copy failed'));
}

export function netLog(msg) {
    const el = document.getElementById('net-log');
    if (!el) return;
    if (el.querySelector('.empty')) el.innerHTML = '';

    const row = document.createElement('div');
    row.className = 'log-line';
    row.innerHTML = `<span class="log-t">${new Date().toLocaleTimeString('en', { hour12: false })}</span><span class="log-msg">${esc(msg)}</span>`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
}

export function updateBFTStats() {
    const n = appState.peers.size + 1;
    const f = Math.floor((n - 1) / 3);
    setEl('bft-n', n);
    setEl('bft-f', f);
}
