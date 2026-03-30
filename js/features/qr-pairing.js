// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Phase 4: QR Code Cross-Device Pairing
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { appState, sysLogEntry } from '../core/state.js';
import { sha256 } from '../core/crypto.js';
import { notify } from '../ui/notifications.js';

/**
 * Simple QR code generator (uses qrcode-generator library if available)
 */
class QRCode {
    constructor(data, errorLevel = 33) {
        this.data = data;
        this.errorLevel = errorLevel;
    }

    toDataURL(cellSize = 6) {
        // Fallback: encode as a simple data URL placeholder if qrcode lib not available
        if (typeof qrcode !== 'undefined') {
            const qr = qrcode(0, 'M');
            qr.addData(this.data);
            qr.make();
            return qr.createDataURL(cellSize);
        }
        // Canvas-based fallback
        return this._canvasFallback(cellSize);
    }

    toSVG(cellSize = 6) {
        if (typeof qrcode !== 'undefined') {
            const qr = qrcode(0, 'M');
            qr.addData(this.data);
            qr.make();
            return qr.createSvgTag(cellSize);
        }
        return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="200" fill="white"/><text x="100" y="100" text-anchor="middle" font-size="10">QR unavailable</text></svg>`;
    }

    _canvasFallback(cellSize) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 200, 200);
            ctx.fillStyle = '#333';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('QR Code', 100, 90);
            ctx.fillText('(lib not loaded)', 100, 110);
            return canvas.toDataURL();
        } catch {
            return '';
        }
    }
}

/**
 * Generate pairing QR code with current node state
 */
export async function generatePairingQR() {
    if (!appState.peerJSReady) {
        notify('PeerJS not ready — initialize networking first', 'warn');
        return null;
    }

    const myId = document.getElementById('my-peer-id')?.textContent?.trim();
    const stateHash = await sha256(JSON.stringify(appState.state));

    const pairingData = {
        v: 81, // version 8.1
        peerId: myId,
        did: appState.identity?.did,
        headCid: appState.log.length ? appState.log[appState.log.length - 1].cid : null,
        stateHash: stateHash.slice(0, 16),
        events: appState.log.length,
        relay: appState.relayMode,
        ts: Date.now()
    };

    const encoded = btoa(JSON.stringify(pairingData));
    const qr = new QRCode(encoded, 33);

    sysLogEntry('NET', 'QR pairing code generated');

    return {
        dataURL: qr.toDataURL(6),
        svgURL: qr.toSVG(6),
        encoded,
        pairingData
    };
}

/**
 * Show QR pairing modal
 */
export async function showPairingQRModal() {
    const result = await generatePairingQR();
    if (!result) return;

    const modal = document.createElement('div');
    modal.id = 'qr-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(8px);
    `;

    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 20px; padding: 24px; text-align: center; max-width: 320px;">
            <div style="font-family: var(--display); font-size: 20px; margin-bottom: 8px;">CROSS-DEVICE PAIRING</div>
            <div style="font-size: 11px; color: var(--text3); margin-bottom: 16px;">Scan with another device to connect</div>
            <img src="${result.dataURL}" style="width: 200px; height: 200px; border-radius: 8px; background: white; padding: 8px;" />
            <div style="font-size: 9px; color: var(--text3); margin-top: 12px; word-break: break-all;">
                Peer ID: ${result.pairingData.peerId?.slice(0, 20) || 'N/A'}...
            </div>
            <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center;">
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${result.encoded}');window.SOS?.notify('Pairing code copied!','ok')">
                    Copy Code
                </button>
                <button class="btn btn-c btn-sm" onclick="document.getElementById('qr-modal')?.remove()">
                    Close
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
    notify('QR pairing code generated', 'ok');
}

/**
 * Parse scanned QR data and connect
 */
export async function parsePairingQR(data) {
    try {
        const decoded = JSON.parse(atob(data));

        if (!decoded.peerId) {
            throw new Error('Invalid pairing data: no peer ID');
        }

        if (decoded.v && decoded.v < 80) {
            notify('Incompatible version - update required', 'warn');
            return null;
        }

        const remoteInput = document.getElementById('remote-peer-id');
        if (remoteInput) {
            remoteInput.value = decoded.peerId;
        }

        sysLogEntry('NET', `QR pairing parsed: ${decoded.peerId.slice(0, 16)}…`);
        notify(`Peer detected: ${decoded.peerId.slice(0, 12)}… Ready to connect!`, 'ok');

        return decoded;
    } catch (e) {
        notify('Invalid QR code: ' + e.message, 'error');
        return null;
    }
}

/**
 * Show QR scanner modal
 */
export function showQRScanner() {
    const modal = document.createElement('div');
    modal.id = 'qr-scanner-modal';
    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(8px);
    `;

    modal.innerHTML = `
        <div style="background: var(--surface); border-radius: 20px; padding: 24px; text-align: center; max-width: 320px;">
            <div style="font-family: var(--display); font-size: 20px; margin-bottom: 8px;">SCAN QR CODE</div>
            <div style="font-size: 11px; color: var(--text3); margin-bottom: 16px;">Paste pairing code from another device</div>
            <textarea id="qr-scan-input" placeholder="Paste pairing code here..."
                style="width: 100%; height: 80px; resize: none; margin-bottom: 12px; font-size: 10px;"></textarea>
            <div style="display: flex; gap: 8px; justify-content: center;">
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('qr-scanner-modal')?.remove()">
                    Cancel
                </button>
                <button class="btn btn-c btn-sm" onclick="window.SOS?.processScanInput()">
                    Connect
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
    document.getElementById('qr-scan-input')?.focus();
}

/**
 * Process scanned/pasted QR input
 */
export async function processScanInput() {
    const input = document.getElementById('qr-scan-input')?.value?.trim();
    if (!input) {
        notify('Paste a pairing code first', 'warn');
        return;
    }

    const result = await parsePairingQR(input);
    if (result) {
        document.getElementById('qr-scanner-modal')?.remove();
        setTimeout(() => {
            const connectBtn = document.getElementById('auto-connect-btn');
            if (connectBtn) connectBtn.click();
        }, 500);
    }
}
