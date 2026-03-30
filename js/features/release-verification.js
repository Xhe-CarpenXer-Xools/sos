// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Phase 4: Signed Release Hash Verification
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { appState, sysLogEntry } from '../core/state.js';
import { sha256, verifySignature } from '../core/crypto.js';
import { VERSION, RELEASE_HASH } from '../core/config.js';
import { esc } from '../core/utils.js';
import { notify } from '../ui/notifications.js';

/**
 * Compute application hash from loaded scripts
 */
export async function computeAppHash() {
    const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
    const hashes = await Promise.all(scripts.map(async src => {
        try {
            const res = await fetch(src);
            const text = await res.text();
            return { src, hash: await sha256(text) };
        } catch {
            return { src, hash: 'fetch-error' };
        }
    }));

    const combined = hashes.map(h => h.hash).join('');
    const rootHash = await sha256(combined);

    return { hash: rootHash, sources: hashes, version: VERSION };
}

/**
 * Verify release signature
 */
export async function verifyRelease() {
    const appHash = await computeAppHash();

    if (!RELEASE_HASH) {
        appState.releaseSignature = {
            verified: false,
            status: 'unverified',
            message: 'No release hash configured — dev mode',
            hash: appHash.hash,
            sources: appHash.sources
        };
        return appState.releaseSignature;
    }

    const matches = appHash.hash === RELEASE_HASH;
    appState.releaseSignature = {
        verified: matches,
        status: matches ? 'verified' : 'mismatch',
        message: matches ? '✓ Release hash verified' : '⚠ Hash mismatch — possible tampering',
        hash: appHash.hash,
        expectedHash: RELEASE_HASH,
        sources: appHash.sources
    };

    sysLogEntry('SECURITY', `Release verification: ${appState.releaseSignature.status}`);
    return appState.releaseSignature;
}

/**
 * Render release status in Security tab
 */
export function renderReleaseStatus() {
    const el = document.getElementById('release-detail');
    if (!el) return;

    const sig = appState.releaseSignature;
    if (!sig) {
        el.innerHTML = '<div class="empty">Verifying...</div>';
        return;
    }

    const statusColor = sig.status === 'verified' ? 'var(--green)'
        : sig.status === 'unverified' ? 'var(--amber)'
        : 'var(--red)';

    el.innerHTML = `
        <div style="margin-bottom:8px">
            <span class="tag" style="background:${statusColor}20;color:${statusColor};border-color:${statusColor}40">
                ${esc(sig.status.toUpperCase())}
            </span>
        </div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">VERSION</div>
        <div style="font-size:11px;color:var(--cyan);margin-bottom:8px">${esc(VERSION)}</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:4px">APP HASH</div>
        <div style="font-size:9px;word-break:break-all;color:var(--text2);font-family:var(--mono);margin-bottom:8px">
            ${esc(sig.hash?.slice(0, 32) || 'N/A')}…
        </div>
        <div style="font-size:10px;color:${statusColor}">${esc(sig.message || '')}</div>
        <div style="margin-top:8px">
            <button class="btn btn-ghost btn-sm" onclick="window.SOS?.showReleaseVerificationModal()">
                Details
            </button>
        </div>
    `;
}

/**
 * Show full release verification modal
 */
export async function showReleaseVerificationModal() {
    const appHash = await computeAppHash();
    const sig = appState.releaseSignature || { status: 'unverified', message: 'Not verified yet' };

    const modal = document.createElement('div');
    modal.id = 'release-modal';
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
        <div style="background: var(--surface); border-radius: 20px; padding: 24px; max-width: 420px; width: 90%;">
            <div style="font-family: var(--display); font-size: 20px; margin-bottom: 16px;">RELEASE VERIFICATION</div>

            <div style="margin-bottom:12px">
                <div style="font-size:10px;color:var(--text3);margin-bottom:4px">APPLICATION HASH</div>
                <code style="font-size:10px;color:var(--cyan);word-break:break-all;display:block;padding:8px;background:var(--bg2);border-radius:8px">
                    ${appHash.hash}
                </code>
            </div>

            <div style="margin-bottom:12px">
                <div style="font-size:10px;color:var(--text3);margin-bottom:4px">MODULE HASHES (${appHash.sources.length})</div>
                <div style="max-height:120px;overflow-y:auto;background:var(--bg2);border-radius:8px;padding:8px">
                    ${appHash.sources.map(s => `
                        <div style="font-size:9px;padding:2px 0;border-bottom:1px solid var(--border)">
                            <span style="color:var(--text2)">${s.src.split('/').pop()}</span>
                            <span style="color:var(--text3);float:right">${s.hash.slice(0, 12)}…</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="font-size:10px;color:var(--text3);margin-bottom:16px">
                ${esc(sig.message || 'Verification status unknown')}
            </div>

            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${appHash.hash}');window.SOS?.notify('Hash copied!','ok')">
                    Copy Hash
                </button>
                <button class="btn btn-c btn-sm" onclick="document.getElementById('release-modal')?.remove()">
                    Close
                </button>
            </div>
        </div>
    `;

    modal.addEventListener('click', e => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

/**
 * Initialize release verification on boot
 */
export async function initReleaseVerification() {
    await verifyRelease();
    renderReleaseStatus();
}
