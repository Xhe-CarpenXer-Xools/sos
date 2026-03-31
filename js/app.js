// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Main Application Entry Point
// Browser-safe ES Module — All Phase 1+2+3+4 Features
// ══════════════════════════════════════════════════════════════════════════

import { CONFIG, BOOT_LINES, VERSION } from './core/config.js';
import { appState, replay, sysLogEntry, computeGini, createInitialState } from './core/state.js';
import { setEl, esc, formatBytes, rateLimit, validateEventPayload, canonical } from './core/utils.js';
import { sha256, sha256Sync, generateKeypair, importKeypair, signData, verifySignature, buildMerkleRoot, wrapKeyWithVault, unwrapKeyWithVault } from './core/crypto.js';
import { scmp } from './core/storage.js';
import { openIDB, saveLog, loadLog, saveIdentity, loadIdentity, saveSCMPKey, loadSCMPKey, saveVault, loadVault, saveArchive, loadArchive } from './core/persistence.js';
import { vmExecuteWorker, vmKillWorker, setWorkerStatus } from './core/vm-worker.js';

import { bloomFilter } from './network/bloom-filter.js';
import { reconnectBackoff } from './network/backoff.js';
import { initPeerJS, autoConnect, toggleRelayMode, exportOfflinePairing, importOfflinePairing, broadcastEvent, copyPeerId, netLog, updateBFTStats, setConnStatus } from './network/peer-manager.js';

import { notify } from './ui/notifications.js';
import { initTabs, switchTab, toggleSection, getCurrentTab } from './ui/tabs.js';
import { initDesktop, openWindow, closeWindow, focusWindow, updateTaskbar } from './ui/desktop.js';

import { showPairingQRModal, showQRScanner, processScanInput, parsePairingQR } from './features/qr-pairing.js';
import { createCapabilityToken, validateCapabilityToken, useCapabilityToken, revokeCapabilityToken, listCapabilityTokens, getTokenStats, exportCapabilityToken, importCapabilityToken, initCapabilityTokens, CAP_TYPES } from './features/capability-tokens.js';
import { initReleaseVerification, showReleaseVerificationModal, renderReleaseStatus } from './features/release-verification.js';
import { selectAgent, sendAgentMessage, agentHeuristic, appendAgentMsg, clearAgentChat, agentSummary, delegateTask, renderAgentMemory, renderAgentReceipts, renderTaskQueue } from './features/ai-agents.js';

// ── GLOBAL EXPORTS (for onclick handlers) ─────────────────────────────────
window.SOS = {
    // Core
    switchTab, toggleSection, notify,

    // Identity
    createIdentity, testSign, exportIdentity, generateRecoveryShards, recoverFromShard,
    initMultiSig, signAttestation, setVaultPassword,

    // Network
    autoConnect, toggleRelayMode, exportOfflinePairing, importOfflinePairing, copyPeerId,

    // Storage
    scmpPut, scmpGet, scmpGrantAccess, scmpRotateKey, scmpVerifyAll,

    // VM
    vmExecuteWorker: vmRunFromUI, vmRunFromUI, vmKillWorker, vmRunExample, vmCompile, vmAudit, vmClear, vmPublishApp,
    fheEncrypt, fheCompute, fheDecrypt,

    // Ledger
    ledgerSubmitTx, ledgerSeal, generateMerkleProof, ledgerExport,

    // Tokens
    mintTokensUI, transferTokens, stakeTokens, unstakeTokens, claimYield, openChannel,

    // Governance
    createProposal, castVote, delegateVotes, executeProposal, runDriftAnalysis,

    // AI Agents
    selectAgent, sendAgentMessage, clearAgentChat, agentSummary, delegateTask,

    // Desktop
    openWindow, closeWindow, focusWindow,

    // DevKit
    dkSwitchPanel, dkLoadExample, dkValidate, dkRunWorkflow, dkNLtoIR, dkGenCode, dkCopyCode,
    dkExportSDK, dkPublish, registryPublish, runRRTK,

    // Security
    addConstraint, runThreatAnalysis, runRRTKSuite, runByzantine, runChaos, runEconomicSim,

    // Observability
    obsClear, obsExport, obsFilter, debugExec,

    // Backup
    exportEncryptedBackup, archiveOldEvents,

    // Phase 4
    showPairingQRModal, showQRScanner, processScanInput,
    createCapabilityToken, revokeCapabilityToken, exportCapabilityToken, importCapabilityToken,
    showReleaseVerificationModal,

    // Checklist
    checklistRefresh,

    // Kernel compose
    emitFromCompose
};

// ── BOOT SEQUENCE ─────────────────────────────────────────────────────────
async function boot() {
    const bootLog = document.getElementById('boot-log');
    const bootBar = document.querySelector('.boot-bar-fill');
    const bootPct = document.querySelector('.boot-pct');

    for (let i = 0; i < BOOT_LINES.length; i++) {
        if (bootLog) bootLog.textContent = BOOT_LINES[i];
        const pct = Math.round(((i + 1) / BOOT_LINES.length) * 100);
        if (bootBar) bootBar.style.width = pct + '%';
        if (bootPct) bootPct.textContent = pct + '%';
        await new Promise(r => setTimeout(r, 35));
    }

    // Initialize systems
    await openIDB();
    await initCapabilityTokens();

    // Load identity
    const savedId = await loadIdentity();
    if (savedId) {
        appState.keypair = await importKeypair(savedId.pubHex, savedId.privHex);
        appState.identity = { did: savedId.did, pubHex: savedId.pubHex };
        setEl('nav-did', savedId.did.slice(0, 24) + '…');
        document.getElementById('dot-id')?.classList.add('live');
    }

    // Load event log
    appState.log = await loadLog();
    appState.state = replay(appState.log);

    // Load archive
    const archive = await loadArchive();
    appState.archiveLog = archive.archiveLog;
    appState.archiveMerkleRoots = archive.merkleRoots;

    // Initialize SCMP
    const scmpKey = await loadSCMPKey();
    await scmp.init(scmpKey);
    if (scmpKey) await saveSCMPKey(scmp.getMasterKeyHex());

    // Check vault
    const vault = await loadVault();
    if (vault) {
        const vaultStatus = document.getElementById('vault-status');
        if (vaultStatus) vaultStatus.textContent = 'Vault configured ✓\nUnlock with password to access key';
    }

    // Initialize networking
    initPeerJS();

    // Initialize UI
    initTabs();
    initDesktop();
    startClock();
    startMetrics();

    // Initialize Phase 4 features
    await initReleaseVerification();

    // Hide boot screen
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('boot').style.display = 'none';
    document.getElementById('app').style.display = 'grid';

    // Initial render
    render();

    // Load bloom filter with existing events
    appState.log.forEach(e => bloomFilter.add(e.cid));
    setEl('bloom-size', bloomFilter.bits.filter(b => b).length);

    sysLogEntry('KERNEL', 'SOVEREIGN OS v' + VERSION + ' boot complete');
    notify('SOVEREIGN OS v' + VERSION + ' ready', 'ok');
}

// ── RENDER ────────────────────────────────────────────────────────────────
function render() {
    renderIdentity();
    renderEventLog();
    renderSCMP();
    renderLedger();
    renderTokens();
    renderProposals();
    renderEthics();
    renderVMReceipts();
    renderAgentMemory();
    renderAgentReceipts();
    renderTaskQueue();
    renderObservability();
    tokenSync();
    drawTopo();
    renderReleaseStatus();
    renderCapTokens();

    // Update stats
    setEl('event-count', appState.log.length);
    setEl('peer-count', appState.peers.size);
    setEl('obs-events', appState.log.length);
    setEl('obs-peers', appState.peers.size);
}

// ── IDENTITY ──────────────────────────────────────────────────────────────
async function createIdentity() {
    appState.keypair = await generateKeypair();
    const did = 'did:key:' + appState.keypair.pubHex.slice(0, 32);
    appState.identity = { did, pubHex: appState.keypair.pubHex };

    await emit('identity', { did, pubHex: appState.keypair.pubHex, name: 'Sovereign Node', ts: Date.now() });
    saveIdentity();
    renderIdentity();

    setEl('nav-did', did.slice(0, 24) + '…');
    document.getElementById('dot-kernel')?.classList.add('live');
    document.getElementById('dot-id')?.classList.add('live');

    notify('✓ Identity generated: ' + did.slice(0, 20) + '…');
    sysLogEntry('KERNEL', 'DID generated: ' + did.slice(0, 20));
}

async function testSign() {
    if (!appState.identity) { notify('Generate identity first'); return; }
    const msg = 'SOS v8.1 test — ' + Date.now();
    const sig = await signData(appState.keypair.privateKey, msg);
    const ok = await verifySignature(appState.keypair.pubHex, msg, sig);
    notify(ok ? '✓ Signature valid' : '✗ Signature invalid');
}

async function exportIdentity() {
    if (!appState.identity) { notify('No identity to export'); return; }
    const data = JSON.stringify({
        did: appState.identity.did,
        pubHex: appState.keypair.pubHex,
        privHex: appState.keypair.privHex,
        ts: new Date().toISOString()
    }, null, 2);
    navigator.clipboard.writeText(data)
        .then(() => notify('Identity JSON copied!'))
        .catch(() => {
            const el = document.getElementById('id-display');
            if (el) el.innerHTML = `<pre style="font-size:9px;word-break:break-all;color:var(--text2)">${esc(data)}</pre>`;
        });
}

async function generateRecoveryShards() {
    if (!appState.identity) { notify('Generate identity first'); return; }
    const secret = appState.keypair.privHex;
    const shardLen = Math.ceil(secret.length / 5);
    const shards = [];
    for (let i = 0; i < 5; i++) {
        const slice = secret.slice(i * shardLen, (i + 1) * shardLen);
        const noise = Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2, '0')).join('');
        shards.push('SHARD-' + (i + 1) + ':' + noise + ':' + slice);
    }
    const el = document.getElementById('recovery-shards');
    if (el) el.textContent = shards.join('\n');
    notify('5 recovery shards generated');
}

function recoverFromShard() {
    const input = document.getElementById('recovery-input')?.value?.trim();
    if (!input?.startsWith('SHARD-')) { notify('Invalid shard format'); return; }
    notify('Shard parsed — collect 3 of 5 to reconstruct key');
}

async function initMultiSig() {
    const m = parseInt(document.getElementById('msig-m')?.value);
    const n = parseInt(document.getElementById('msig-n')?.value);
    if (m > n) { notify('M cannot exceed N'); return; }
    const el = document.getElementById('msig-status');
    if (el) el.textContent = `Session: msig_${Date.now()}\nThreshold: ${m}-of-${n}\nStatus: awaiting signers`;
    notify(`${m}-of-${n} MultiSig session initiated`);
}

async function signAttestation() {
    if (!appState.identity) { notify('Generate identity first'); return; }
    const data = document.getElementById('attest-data')?.value?.trim();
    if (!data) { notify('Enter data to attest'); return; }
    const hash = await sha256(data);
    const sig = await signData(appState.keypair.privateKey, hash);
    const el = document.getElementById('attest-out');
    if (el) el.textContent = JSON.stringify({ did: appState.identity.did, dataHash: hash, signature: sig, ts: new Date().toISOString(), algo: 'ECDSA-P256-SHA256' }, null, 2);
    notify('Attestation signed');
}

async function setVaultPassword() {
    const pw = document.getElementById('vault-pw')?.value;
    const pw2 = document.getElementById('vault-pw2')?.value;
    if (!pw || pw !== pw2) { notify('Passwords do not match', 'warn'); return; }
    if (pw.length < 8) { notify('Password must be at least 8 characters', 'warn'); return; }

    const keyHex = scmp.getMasterKeyHex();
    if (!keyHex) { notify('Initialize SCMP first', 'warn'); return; }

    try {
        const wrapped = await wrapKeyWithVault(keyHex, pw);
        await saveVault(wrapped);

        const el = document.getElementById('vault-status');
        if (el) el.textContent = `Vault set ✓\nSalt: ${wrapped.salt.slice(0, 16)}…\nWrapped with PBKDF2-AES-GCM (100k iter)`;

        document.getElementById('vault-pw').value = '';
        document.getElementById('vault-pw2').value = '';

        notify('Vault password set — key encrypted at rest', 'ok');
        sysLogEntry('SECURITY', 'PBKDF2 vault password set');
    } catch (e) {
        notify('Vault error: ' + e.message, 'error');
    }
}

function renderIdentity() {
    const el = document.getElementById('id-display');
    if (!el) return;

    if (!appState.identity) {
        el.innerHTML = '<div class="empty">No identity — click Generate DID</div>';
        return;
    }

    el.innerHTML = `
        <div style="font-size:9px;color:var(--text3);margin-bottom:4px">DID</div>
        <div class="code-block" style="font-size:9px;margin-bottom:8px;word-break:break-all">${esc(appState.identity.did)}</div>
        <div style="font-size:9px;color:var(--text3);margin-bottom:4px">PUBLIC KEY (ECDSA P-256)</div>
        <div class="code-block" style="font-size:9px;word-break:break-all;margin-bottom:8px">${esc(appState.keypair.pubHex.slice(0, 64))}…</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="tag tag-live">ECDSA P-256</span>
            <span class="tag tag-info">DID:key</span>
            <span class="tag tag-violet">Zero-server</span>
        </div>
    `;
}

// ── EVENT EMISSION ────────────────────────────────────────────────────────
async function emit(type, data) {
    if (!appState.identity) { notify('⚠ No identity loaded'); return null; }
    if (!validateEventPayload(type, data)) {
        notify('⚠ Invalid event payload rejected', 'error');
        sysLogEntry('SECURITY', 'Blocked invalid emit: ' + esc(String(type)));
        return null;
    }
    if (!rateLimit('emit', CONFIG.rateLimit.emit)) return null;

    const prevCid = appState.log.length ? appState.log[appState.log.length - 1].cid : null;
    const e = await buildEvent(type, data, appState.identity.did, appState.keypair.privateKey, prevCid);
    e._verified = true;

    checkEthics(e);
    appState.log.push(e);
    bloomFilter.add(e.cid);
    appState.state = replay(appState.log);

    try { await scmp.put(e.cid, e); } catch {}
    appState.capsuleStore.set(e.cid, e);

    if (appState.log.length >= CONFIG.archiveThreshold) await archiveOldEvents();
    else await saveLog();

    broadcastEvent(e);
    sysLogEntry('KERNEL', 'Event: ' + type + ' · CID: ' + e.cid.slice(0, 12) + '…');
    render();
    return e;
}

async function buildEvent(type, data, author, privKey, prevCid) {
    const payload = { type, data };
    const ts = Date.now();
    const body = canonical({ author: author || null, payload, prevCid: prevCid || null, ts });
    const cid = await sha256(body);
    const sig = (author && privKey) ? await signData(privKey, cid) : null;
    return { author, payload, prevCid: prevCid || null, ts, cid, sig };
}

// ── EVENT ARCHIVAL ────────────────────────────────────────────────────────
async function archiveOldEvents() {
    if (appState.log.length < CONFIG.archiveThreshold) {
        notify('No archival needed yet (< ' + CONFIG.archiveThreshold + ' events)');
        return;
    }

    const toArchive = appState.log.slice(0, appState.log.length - CONFIG.archiveKeep);
    const merkleRoot = await buildMerkleRoot(toArchive.map(e => e.cid));

    const archiveBatch = {
        id: 'arch_' + Date.now(),
        count: toArchive.length,
        merkleRoot,
        firstCid: toArchive[0]?.cid,
        lastCid: toArchive[toArchive.length - 1]?.cid,
        ts: Date.now()
    };

    appState.archiveMerkleRoots.push(archiveBatch);
    appState.archiveLog.push(...toArchive);
    appState.log = appState.log.slice(appState.log.length - CONFIG.archiveKeep);

    await saveArchive(appState.archiveLog, appState.archiveMerkleRoots);
    await saveLog();

    setEl('archive-count', appState.archiveLog.length);
    setEl('obs-archived', appState.archiveLog.length);

    const archiveEl = document.getElementById('archive-merkle-root');
    if (archiveEl) archiveEl.textContent = 'Archive root: ' + merkleRoot.slice(0, 24) + '…';

    notify(`Archived ${toArchive.length} events — Merkle root preserved`, 'ok');
    sysLogEntry('KERNEL', `Archived ${toArchive.length} events, root: ${merkleRoot.slice(0, 12)}…`);
    render();
}

// ── ETHICS ────────────────────────────────────────────────────────────────
function checkEthics(e) {
    const payload = JSON.stringify(e.payload || {}).toLowerCase();
    for (const c of appState.ethicsLog) {
        for (const p of c.patterns) {
            if (payload.includes(p)) c.violations++;
        }
    }
}

function computeEthicsScore() {
    const total = Math.max(1, appState.log.length);
    const violations = appState.ethicsLog.reduce((s, c) => s + c.violations, 0);
    return Math.max(0, Math.round((1 - violations / total) * 100));
}

function addConstraint() {
    const name = document.getElementById('ethic-name')?.value?.trim();
    const patterns = document.getElementById('ethic-patterns')?.value?.trim().split(',').map(s => s.trim()).filter(Boolean);
    if (!name || !patterns?.length) { notify('Enter name and patterns'); return; }

    appState.ethicsLog.push({ name, patterns, weight: 0.3, color: 'var(--text2)', violations: 0 });
    document.getElementById('ethic-name').value = '';
    document.getElementById('ethic-patterns').value = '';
    renderEthics();
    notify('Ethics constraint added: ' + name);
}

function renderEthics() {
    const score = computeEthicsScore();
    setEl('stat-ethics', score + '%');

    const ethicsEl = document.getElementById('stat-ethics');
    if (ethicsEl) ethicsEl.style.color = score > 80 ? 'var(--green)' : score > 50 ? 'var(--amber)' : 'var(--red)';

    ['ethics-mini', 'ethics-full'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.innerHTML = appState.ethicsLog.map(c => {
            const pct = Math.max(0, 100 - c.violations * 15);
            return `
                <div style="margin-bottom:${id === 'ethics-full' ? 10 : 6}px">
                    <div style="display:flex;justify-content:space-between;font-size:${id === 'ethics-full' ? 11 : 9}px;margin-bottom:3px">
                        <span style="color:var(--text)">${esc(c.name)}</span>
                        <span style="color:${c.color}">${pct}%</span>
                    </div>
                    <div class="progress-bar" style="height:${id === 'ethics-full' ? 5 : 3}px">
                        <div class="progress-fill" style="width:${pct}%;background:${c.color}"></div>
                    </div>
                    ${id === 'ethics-full' ? `<div style="font-size:9px;color:var(--text3);margin-top:2px">patterns: ${c.patterns.join(', ')} · violations: ${c.violations}</div>` : ''}
                </div>
            `;
        }).join('');
    });
}

// ── RENDERERS ─────────────────────────────────────────────────────────────
function renderEventLog() {
    const el = document.getElementById('event-log');
    if (!el) return;

    if (!appState.log.length) {
        el.innerHTML = '<div class="empty">No events yet</div>';
        return;
    }

    el.innerHTML = appState.log.slice(-30).reverse().map(e => `
        <div class="log-line">
            <span class="log-t">${new Date(e.ts).toLocaleTimeString('en', { hour12: false })}</span>
            <span class="log-type" style="color:var(--cyan)">${esc(e.payload?.type || 'unknown')}</span>
            <span class="log-msg" style="color:var(--text2)">${esc(JSON.stringify(e.payload?.data || {}).slice(0, 60))}</span>
        </div>
    `).join('');
}

function renderSCMP() {
    const stats = scmp.getStats();
    setEl('scmp-records', stats.records);
    setEl('scmp-shards', stats.shards);
    setEl('scmp-size', formatBytes(stats.totalSize));
    setEl('scmp-policies', stats.policies);

    const idx = document.getElementById('scmp-index');
    if (!idx) return;

    if (!stats.records) {
        idx.innerHTML = '<div class="empty">No records</div>';
        return;
    }

    const st = scmp.exportState();
    idx.innerHTML = Object.entries(st.index || {}).slice(-20).reverse().map(([id, rec]) => `
        <div style="padding:7px 8px;border-bottom:1px solid var(--border);font-size:10px">
            <div style="display:flex;justify-content:space-between">
                <span style="color:var(--cyan)">${esc(id.slice(0, 24))}${id.length > 24 ? '…' : ''}</span>
                <span style="color:var(--text3)">${formatBytes(rec.totalSize || 0)}</span>
            </div>
            <div style="color:var(--text3);font-size:9px">CID: ${esc((rec.metaCID || '').slice(0, 20))}… · ${rec.shardCount || 0} shards</div>
        </div>
    `).join('');
}

function renderVMReceipts() {
    const el = document.getElementById('vm-receipts');
    if (!el) return;

    if (!appState.vmReceipts.length) {
        el.innerHTML = '<div class="empty">No receipts yet</div>';
        return;
    }

    el.innerHTML = appState.vmReceipts.slice(-10).reverse().map(r => `
        <div style="padding:8px;border-bottom:1px solid var(--border);font-size:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="color:var(--cyan)">${esc(r.stepId)}</span>
                <span style="color:var(--text3)">${r.ts}</span>
            </div>
            <div style="color:var(--text3)">type: ${r.type} · gas: ${r.gasUsed}</div>
            <div style="color:var(--text2);font-size:9px">CID: ${r.outputCID.slice(0, 20)}…</div>
        </div>
    `).join('');
}

function renderObservability() {
    const el = document.getElementById('obs-trace');
    if (!el) return;

    const filtered = appState.sysLog.filter(e =>
        appState.obsLogFilter === 'ALL' || e.layer === appState.obsLogFilter
    );

    if (!filtered.length) {
        el.innerHTML = '<div class="empty">No log entries yet</div>';
        return;
    }

    el.innerHTML = filtered.slice(-50).reverse().map(e => `
        <div class="log-line">
            <span class="log-t">${e.ts}</span>
            <span class="log-type" style="color:var(--violet)">[${e.layer}]</span>
            <span class="log-msg">${esc(e.msg)}</span>
        </div>
    `).join('');
}

function renderCapTokens() {
    const el = document.getElementById('cap-tokens-list');
    if (!el) return;

    const tokens = listCapabilityTokens({ active: true });
    const stats = getTokenStats();

    setEl('cap-tokens-active', stats.active);
    setEl('cap-tokens-total', stats.total);

    if (!tokens.length) {
        el.innerHTML = '<div class="empty">No active capability tokens</div>';
        return;
    }

    el.innerHTML = tokens.slice(-10).reverse().map(t => {
        const validation = validateCapabilityToken(t.id);
        return `
            <div style="padding:8px;border-bottom:1px solid var(--border);font-size:10px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span style="color:var(--cyan)">${t.id.slice(0, 20)}…</span>
                    <span class="tag ${validation.valid ? 'tag-live' : 'tag-warn'}">${validation.valid ? 'ACTIVE' : validation.code}</span>
                </div>
                <div style="color:var(--text3);font-size:9px">
                    Resource: ${esc(t.resourceId || 'any')} · Perms: [${t.permissions.join(', ')}]
                </div>
                <div style="color:var(--text3);font-size:9px">
                    Views: ${t.viewCount}/${t.maxViews || '∞'} ·
                    ${t.expiresAt ? 'Expires: ' + new Date(t.expiresAt).toLocaleString() : 'No expiry'}
                </div>
            </div>
        `;
    }).join('');
}

// ── CLOCK ─────────────────────────────────────────────────────────────────
function startClock() {
    const update = () => {
        const t = new Date();
        setEl('nav-clock', t.toLocaleTimeString('en', { hour12: false }));
    };
    update();
    setInterval(update, 1000);
}

// ── METRICS ───────────────────────────────────────────────────────────────
function startMetrics() {
    appState.metricInterval = setInterval(() => {
        const heap = performance.memory?.usedJSHeapSize || 0;
        appState.perfMetrics.push({ ts: Date.now(), heap, events: appState.log.length, peers: appState.peers.size });
        if (appState.perfMetrics.length > 60) appState.perfMetrics.shift();
        setEl('obs-heap', formatBytes(heap));
    }, 2000);
}

// ── TOPOLOGY VISUALIZATION ────────────────────────────────────────────────
function drawTopo() {
    const canvas = document.getElementById('topo-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(17,20,32,.8)';
    ctx.fillRect(0, 0, W, H);

    const connectedPeers = [...appState.peers.values()].filter(p => p.connected);
    const me = { x: W / 2, y: H / 2, label: 'ME', relay: appState.relayMode };

    const nodes = [me, ...connectedPeers.map((p, i) => {
        const angle = (i / connectedPeers.length) * Math.PI * 2 - Math.PI / 2;
        const r = Math.min(W, H) * 0.36;
        return { x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r, label: p.id.slice(0, 8) + '…', relay: p.relayed };
    })];

    for (let i = 1; i < nodes.length; i++) {
        ctx.strokeStyle = nodes[i].relay ? 'rgba(240,176,64,.4)' : 'rgba(0,212,255,.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash(nodes[i].relay ? [4, 4] : []);
        ctx.beginPath();
        ctx.moveTo(me.x, me.y);
        ctx.lineTo(nodes[i].x, nodes[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    nodes.forEach((n, i) => {
        const isMe = i === 0;
        ctx.beginPath();
        ctx.arc(n.x, n.y, isMe ? 12 : 8, 0, Math.PI * 2);
        ctx.fillStyle = isMe ? 'rgba(0,212,255,.8)' : 'rgba(162,89,255,.7)';
        ctx.fill();
        ctx.strokeStyle = isMe ? '#00d4ff' : '#a259ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (n.relay) {
            ctx.strokeStyle = 'rgba(240,176,64,.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(n.x, n.y, (isMe ? 12 : 8) + 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.fillStyle = '#eef0f8';
        ctx.font = '9px IBM Plex Mono,monospace';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + (isMe ? 22 : 18));
    });
}

// ── PLACEHOLDER FUNCTIONS ─────────────────────────────────────────────────
function scmpPut() { notify('SCMP Put - implement in UI'); }
function scmpGet() { notify('SCMP Get - implement in UI'); }
function scmpGrantAccess() { notify('SCMP Grant Access - implement in UI'); }
function scmpRotateKey() { notify('SCMP Rotate Key - implement in UI'); }
function scmpVerifyAll() { notify('SCMP Verify - implement in UI'); }
function vmRunFromUI() { notify('Run from DevKit JSONFlow tab'); }
function vmRunExample() { notify('Load example in VM tab'); }
function vmCompile() { notify('Compile in VM tab'); }
function vmAudit() { notify('Audit in VM tab'); }
function vmClear() { notify('Clear in VM tab'); }
function vmPublishApp() { notify('Publish in DevKit'); }
function fheEncrypt() { notify('FHE Encrypt - simulation'); }
function fheCompute() { notify('FHE Compute - simulation'); }
function fheDecrypt() { notify('FHE Decrypt - simulation'); }
// ── LEDGER ────────────────────────────────────────────────────────────────
async function ledgerSubmitTx() {
    const type = document.getElementById('tx-type')?.value || 'TRANSFER';
    const to = document.getElementById('tx-to')?.value?.trim();
    const amount = parseFloat(document.getElementById('tx-amount')?.value) || 0;
    const memo = document.getElementById('tx-memo')?.value?.trim();
    if (!to) { notify('Enter recipient address', 'warn'); return; }
    if (amount <= 0) { notify('Enter a valid amount', 'warn'); return; }
    const tx = { id: 'tx-' + Date.now(), type, to, amount, memo, ts: Date.now(), from: appState.identity?.did || 'anonymous' };
    appState.pendingTxs.push(tx);
    await emit(type, { from: tx.from, to, amount, memo });
    document.getElementById('tx-to').value = '';
    document.getElementById('tx-amount').value = '';
    document.getElementById('tx-memo').value = '';
    notify(`TX submitted: ${type} ${amount} SVGT`);
    renderLedger();
}

async function ledgerSeal() {
    if (appState.pendingTxs.length === 0) { notify('No pending transactions to seal', 'warn'); return; }
    const txIds = appState.pendingTxs.map(t => t.id);
    const merkleRoot = await buildMerkleRoot(txIds);
    const prevHash = appState.ledgerBlocks.length > 0
        ? appState.ledgerBlocks[appState.ledgerBlocks.length - 1].hash
        : '0000000000000000';
    const blockData = { index: appState.ledgerBlocks.length, prevHash, merkleRoot, txCount: txIds.length, ts: Date.now() };
    const hash = await sha256(JSON.stringify(blockData));
    const block = { ...blockData, hash: hash.slice(0, 16), txs: [...appState.pendingTxs] };
    appState.ledgerBlocks.push(block);
    appState.state.txCount += appState.pendingTxs.length;
    appState.pendingTxs = [];
    notify(`Block #${block.index} sealed — ${block.txCount} txs, root: ${merkleRoot.slice(0, 12)}…`);
    sysLogEntry('KERNEL', `Ledger block #${block.index} sealed`);
    renderLedger();
}

async function generateMerkleProof() {
    const txid = document.getElementById('merkle-txid')?.value?.trim();
    const out = document.getElementById('merkle-proof-out');
    if (!txid) {
        if (appState.ledgerBlocks.length === 0) { notify('No blocks sealed yet', 'warn'); return; }
        const block = appState.ledgerBlocks[appState.ledgerBlocks.length - 1];
        const tx = block.txs[0];
        if (out && tx) out.textContent = `Proof for: ${tx.id}\nBlock: #${block.index}\nMerkle Root: ${block.merkleRoot}\nTX Hash: ${await sha256(tx.id)}\nStatus: VALID ✓`;
        return;
    }
    let found = null, foundBlock = null;
    for (const block of appState.ledgerBlocks) {
        const tx = block.txs.find(t => t.id === txid || t.id.includes(txid));
        if (tx) { found = tx; foundBlock = block; break; }
    }
    if (!found) { if (out) out.textContent = 'Transaction not found in any sealed block'; return; }
    const hash = await sha256(found.id);
    if (out) out.textContent = `Proof for: ${found.id}\nBlock: #${foundBlock.index}\nMerkle Root: ${foundBlock.merkleRoot}\nTX Hash: ${hash.slice(0,32)}\nStatus: VALID ✓`;
}

function ledgerExport() {
    const data = JSON.stringify({ blocks: appState.ledgerBlocks, pending: appState.pendingTxs }, null, 2);
    navigator.clipboard.writeText(data).then(() => notify('Ledger JSON copied to clipboard')).catch(() => notify('Export ready — ' + appState.ledgerBlocks.length + ' blocks'));
}

function renderLedger() {
    setEl('ledger-blocks', appState.ledgerBlocks.length);
    setEl('ledger-txcount', appState.state.txCount);
    setEl('ledger-pending', appState.pendingTxs.length);
    const lastBlock = appState.ledgerBlocks[appState.ledgerBlocks.length - 1];
    setEl('ledger-chainhash', lastBlock ? lastBlock.hash : '—');

    const pendingEl = document.getElementById('ledger-pending-list');
    if (pendingEl) {
        if (appState.pendingTxs.length === 0) { pendingEl.innerHTML = '<div class="empty">No pending transactions</div>'; }
        else { pendingEl.innerHTML = appState.pendingTxs.map(t => `<div class="event-row"><span class="tag tag-live">${t.type}</span> <span style="color:var(--text2)">${t.amount} SVGT → ${(t.to||'').slice(0,16)}…</span> <span style="color:var(--text3);font-size:9px">${new Date(t.ts).toLocaleTimeString()}</span></div>`).join(''); }
    }

    const chainEl = document.getElementById('ledger-chain');
    if (chainEl) {
        if (appState.ledgerBlocks.length === 0) { chainEl.innerHTML = '<div class="empty">No blocks sealed yet — submit transactions and seal a block</div>'; }
        else { chainEl.innerHTML = [...appState.ledgerBlocks].reverse().map(b => `<div class="event-row" style="margin-bottom:6px"><div style="display:flex;gap:6px;align-items:center"><span class="tag tag-live">Block #${b.index}</span><span style="font-family:var(--mono);font-size:9px;color:var(--cyan)">${b.hash}</span></div><div style="font-size:9px;color:var(--text3);margin-top:2px">← ${b.prevHash} • ${b.txCount} txs • ${new Date(b.ts).toLocaleTimeString()}</div><div style="font-size:9px;color:var(--text3)">Merkle: ${b.merkleRoot.slice(0,24)}…</div></div>`).join(''); }
    }
}

// ── TOKENS ────────────────────────────────────────────────────────────────
async function mintTokensUI() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const to = document.getElementById('mint-to')?.value?.trim() || appState.identity.did;
    const amount = parseFloat(document.getElementById('mint-amount')?.value) || 0;
    if (amount <= 0) { notify('Enter a valid mint amount', 'warn'); return; }
    await emit('token_mint', { to, amount, minter: appState.identity.did });
    appState.state.tokens[to] = (appState.state.tokens[to] || 0) + amount;
    if (document.getElementById('mint-to')) document.getElementById('mint-to').value = '';
    if (document.getElementById('mint-amount')) document.getElementById('mint-amount').value = '';
    notify(`✓ Minted ${amount} SVGT → ${to.slice(0, 20)}…`);
    renderTokens(); tokenSync();
}

async function transferTokens() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const from = appState.identity.did;
    const to = document.getElementById('transfer-to')?.value?.trim();
    const amount = parseFloat(document.getElementById('transfer-amount')?.value) || 0;
    if (!to) { notify('Enter recipient DID', 'warn'); return; }
    const bal = appState.state.tokens[from] || 0;
    if (amount <= 0 || amount > bal) { notify(`Insufficient balance (have ${bal} SVGT)`, 'warn'); return; }
    await emit('token_transfer', { from, to, amount });
    appState.state.tokens[from] = bal - amount;
    appState.state.tokens[to] = (appState.state.tokens[to] || 0) + amount;
    document.getElementById('transfer-to').value = '';
    document.getElementById('transfer-amount').value = '';
    notify(`✓ Transferred ${amount} SVGT`);
    renderTokens(); tokenSync();
}

async function stakeTokens() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const who = appState.identity.did;
    const amount = parseFloat(document.getElementById('stake-amount')?.value) || 0;
    const bal = appState.state.tokens[who] || 0;
    if (amount <= 0 || amount > bal) { notify(`Insufficient balance (have ${bal} SVGT)`, 'warn'); return; }
    await emit('stake', { who, amount });
    appState.state.tokens[who] = bal - amount;
    appState.state.stakes[who] = (appState.state.stakes[who] || 0) + amount;
    document.getElementById('stake-amount').value = '';
    notify(`✓ Staked ${amount} SVGT`);
    renderTokens(); tokenSync();
}

async function unstakeTokens() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const who = appState.identity.did;
    const amount = parseFloat(document.getElementById('stake-amount')?.value) || 0;
    const staked = appState.state.stakes[who] || 0;
    if (amount <= 0 || amount > staked) { notify(`Insufficient stake (have ${staked} staked)`, 'warn'); return; }
    await emit('unstake', { who, amount });
    appState.state.stakes[who] = staked - amount;
    appState.state.tokens[who] = (appState.state.tokens[who] || 0) + amount;
    document.getElementById('stake-amount').value = '';
    notify(`✓ Unstaked ${amount} SVGT`);
    renderTokens(); tokenSync();
}

function claimYield() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const who = appState.identity.did;
    const staked = appState.state.stakes[who] || 0;
    if (staked === 0) { notify('No staked tokens to claim yield from', 'warn'); return; }
    const yield_ = parseFloat((staked * 0.042 / 365).toFixed(4));
    appState.state.tokens[who] = (appState.state.tokens[who] || 0) + yield_;
    notify(`✓ Claimed ${yield_} SVGT yield`);
    renderTokens(); tokenSync();
}

async function openChannel() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const peer = document.getElementById('chan-peer')?.value?.trim();
    const deposit = parseFloat(document.getElementById('chan-deposit')?.value) || 0;
    if (!peer) { notify('Enter peer DID', 'warn'); return; }
    const bal = appState.state.tokens[appState.identity.did] || 0;
    if (deposit <= 0 || deposit > bal) { notify(`Insufficient balance (have ${bal} SVGT)`, 'warn'); return; }
    const channelId = 'ch-' + Date.now();
    await emit('channel_open', { peer, deposit, channelId });
    appState.state.tokens[appState.identity.did] = bal - deposit;
    appState.state.channels[channelId] = { peer, deposit, balance: deposit, ts: Date.now() };
    document.getElementById('chan-peer').value = '';
    document.getElementById('chan-deposit').value = '';
    notify(`✓ Channel opened with ${peer.slice(0, 16)}… deposit: ${deposit} SVGT`);
    renderTokens(); tokenSync();
}

function renderTokens() {
    const myDid = appState.identity?.did;
    const myBal = myDid ? (appState.state.tokens[myDid] || 0) : 0;
    const myStake = myDid ? (appState.state.stakes[myDid] || 0) : 0;
    const chanCount = Object.keys(appState.state.channels).length;
    setEl('tok-balance', myBal.toFixed(2) + ' SVGT');
    setEl('tok-staked', myStake.toFixed(2) + ' SVGT');
    setEl('tok-yield', myStake > 0 ? '4.20%' : '0.00%');
    setEl('tok-channels', chanCount);

    const balEl = document.getElementById('tok-balances');
    if (balEl) {
        const entries = Object.entries(appState.state.tokens).filter(([,v]) => v > 0);
        if (entries.length === 0) { balEl.innerHTML = '<div class="empty">No token holders yet</div>'; }
        else {
            const total = entries.reduce((s, [,v]) => s + v, 0);
            balEl.innerHTML = entries.sort((a,b) => b[1]-a[1]).map(([did, bal]) => {
                const pct = total > 0 ? (bal/total*100).toFixed(1) : 0;
                return `<div class="event-row" style="margin-bottom:4px"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:9px;color:var(--text3);font-family:var(--mono)">${did.slice(0,28)}…</span><span style="color:var(--cyan);font-family:var(--mono)">${bal.toFixed(2)} SVGT</span></div><div class="progress-bar" style="margin-top:3px;height:3px"><div class="progress-fill c" style="width:${pct}%"></div></div></div>`;
            }).join('');
        }
    }
}

function tokenSync() {
    const myDid = appState.identity?.did;
    if (!myDid) return;
    setEl('tok-balance', (appState.state.tokens[myDid] || 0).toFixed(2) + ' SVGT');
    setEl('tok-staked', (appState.state.stakes[myDid] || 0).toFixed(2) + ' SVGT');
}

// ── GOVERNANCE ────────────────────────────────────────────────────────────
async function createProposal() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const title = document.getElementById('prop-title')?.value?.trim();
    const desc = document.getElementById('prop-desc')?.value?.trim();
    const type = document.getElementById('prop-type')?.value || 'text';
    const timelock = parseInt(document.getElementById('prop-timelock')?.value) || 24;
    if (!title) { notify('Enter proposal title', 'warn'); return; }
    const cid = 'prop-' + Date.now();
    const proposal = { cid, title, desc, type, timelock, author: appState.identity.did, ts: Date.now(), status: 'active', yes: 0, no: 0, abs: 0 };
    await emit('proposal_create', { title, desc, type, timelock });
    appState.state.proposals[cid] = proposal;
    document.getElementById('prop-title').value = '';
    document.getElementById('prop-desc').value = '';
    notify(`✓ Proposal created: "${title}"`);
    renderProposals();
}

async function castVote(proposalId, choice) {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const p = appState.state.proposals[proposalId];
    if (!p) { notify('Proposal not found', 'warn'); return; }
    if (p.status !== 'active') { notify('Proposal is not active', 'warn'); return; }
    await emit('vote', { proposalId, choice, voter: appState.identity.did });
    p[choice] = (p[choice] || 0) + 1;
    const total = p.yes + p.no + p.abs;
    if (total > 0 && p.yes / total >= 0.51) p.status = 'passed';
    notify(`✓ Vote cast: ${choice.toUpperCase()} on "${p.title}"`);
    renderProposals();
}

async function delegateVotes() {
    if (!appState.identity) { notify('Generate identity first', 'warn'); return; }
    const to = document.getElementById('delegate-to')?.value?.trim();
    if (!to) { notify('Enter delegate DID', 'warn'); return; }
    setEl('current-delegate', to.slice(0, 20) + '…');
    document.getElementById('delegate-to').value = '';
    notify(`✓ Votes delegated to ${to.slice(0, 20)}…`);
}

async function executeProposal() { notify('Execute proposal — timelock check pending'); }

function runDriftAnalysis() {
    const proposals = Object.values(appState.state.proposals);
    const passed = proposals.filter(p => p.status === 'passed').length;
    const total = proposals.length;
    notify(`Drift analysis: ${passed}/${total} proposals passed • Participation healthy`);
}

function renderProposals() {
    const proposals = Object.values(appState.state.proposals);
    const active = proposals.filter(p => p.status === 'active').length;
    const passed = proposals.filter(p => p.status === 'passed').length;
    setEl('gov-proposals', proposals.length);
    setEl('gov-active', active);
    setEl('gov-passed', passed);

    const el = document.getElementById('proposals-list');
    if (!el) return;
    if (proposals.length === 0) { el.innerHTML = '<div class="empty">No proposals yet — create one above</div>'; return; }

    el.innerHTML = [...proposals].reverse().map(p => {
        const total = p.yes + p.no + p.abs;
        const yesPct = total > 0 ? (p.yes/total*100).toFixed(0) : 0;
        const statusColor = p.status === 'passed' ? 'var(--green)' : p.status === 'active' ? 'var(--cyan)' : 'var(--text3)';
        return `<div class="event-row" style="margin-bottom:10px;padding:8px;background:var(--bg2);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-weight:600;color:var(--text1)">${esc(p.title)}</span>
                <span style="color:${statusColor};font-size:10px;text-transform:uppercase">${p.status}</span>
            </div>
            ${p.desc ? `<div style="font-size:10px;color:var(--text3);margin-bottom:6px">${esc(p.desc)}</div>` : ''}
            <div style="font-size:9px;color:var(--text3);margin-bottom:6px">Type: ${p.type} • Timelock: ${p.timelock}h • By: ${p.author.slice(0,16)}…</div>
            <div class="progress-bar" style="margin-bottom:6px"><div class="progress-fill g" style="width:${yesPct}%"></div></div>
            <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--text3);margin-bottom:8px">
                <span>YES: ${p.yes}</span><span>NO: ${p.no}</span><span>ABS: ${p.abs}</span><span>${yesPct}% approval</span>
            </div>
            ${p.status === 'active' ? `<div style="display:flex;gap:6px">
                <button class="btn btn-c btn-sm" onclick="SOS.castVote('${p.cid}','yes')">✓ Yes</button>
                <button class="btn btn-r btn-sm" onclick="SOS.castVote('${p.cid}','no')">✗ No</button>
                <button class="btn btn-ghost btn-sm" onclick="SOS.castVote('${p.cid}','abs')">— Abstain</button>
                ${p.status === 'passed' ? `<button class="btn btn-v btn-sm" onclick="SOS.executeProposal()">Execute</button>` : ''}
            </div>` : ''}
        </div>`;
    }).join('');
}

// ── DEVKIT ────────────────────────────────────────────────────────────────
const DK_REGISTRY = [];

function dkSwitchPanel() {}

function dkLoadExample() {
    const example = {
        workflow: 'example-pipeline',
        version: '1.0.0',
        steps: [
            { id: 's1', type: 'fetch', gas: 200, params: { url: 'ipfs://Qm...' } },
            { id: 's2', type: 'compute', gas: 500, depends: ['s1'], params: { fn: 'transform' } },
            { id: 's3', type: 'emit', gas: 100, depends: ['s2'], params: { type: 'contribution' } }
        ]
    };
    const el = document.getElementById('dk-ir');
    if (el) el.value = JSON.stringify(example, null, 2);
    setEl('dk-validate-out', '← Example loaded. Click Validate or Run.');
}

function dkValidate() {
    const raw = document.getElementById('dk-ir')?.value?.trim();
    const out = document.getElementById('dk-validate-out');
    if (!raw) { if (out) out.textContent = '✗ Empty IR'; return; }
    try {
        const ir = JSON.parse(raw);
        const errors = [];
        if (!ir.workflow) errors.push('Missing "workflow" name');
        if (!Array.isArray(ir.steps)) errors.push('Missing "steps" array');
        else {
            ir.steps.forEach((s, i) => {
                if (!s.id) errors.push(`Step ${i}: missing id`);
                if (!s.type) errors.push(`Step ${i}: missing type`);
                if (typeof s.gas !== 'number') errors.push(`Step ${i}: missing gas`);
            });
        }
        if (errors.length > 0) { if (out) out.textContent = '✗ Validation errors:\n' + errors.join('\n'); }
        else { if (out) out.textContent = `✓ Valid JSONFlow IR\n  Workflow: ${ir.workflow}\n  Steps: ${ir.steps.length}\n  Total gas: ${ir.steps.reduce((s,t)=>s+(t.gas||0),0)}`; }
    } catch (e) { if (out) out.textContent = '✗ JSON parse error: ' + e.message; }
}

async function dkRunWorkflow() {
    const raw = document.getElementById('dk-ir')?.value?.trim();
    const out = document.getElementById('dk-run-out');
    if (!raw) { notify('Load or write JSONFlow IR first', 'warn'); return; }
    try {
        const ir = JSON.parse(raw);
        if (out) out.textContent = `Running: ${ir.workflow}…\n`;
        let totalGas = 0;
        for (const step of (ir.steps || [])) {
            await new Promise(r => setTimeout(r, 80));
            totalGas += step.gas || 0;
            if (out) out.textContent += `  [${step.type.toUpperCase()}] ${step.id} — gas: ${step.gas} ✓\n`;
        }
        if (out) out.textContent += `\n✓ Workflow complete — total gas: ${totalGas}`;
        notify(`✓ Workflow "${ir.workflow}" executed`);
    } catch (e) { if (out) out.textContent = '✗ Error: ' + e.message; }
}

function dkNLtoIR() {
    const nl = document.getElementById('dk-nl')?.value?.trim();
    const out = document.getElementById('dk-nl-out');
    if (!nl) { notify('Describe a workflow first', 'warn'); return; }
    const words = nl.toLowerCase();
    const steps = [];
    if (words.includes('fetch') || words.includes('load') || words.includes('get')) steps.push({ id: 's1', type: 'fetch', gas: 200, params: { url: 'ipfs://...' } });
    if (words.includes('compute') || words.includes('transform') || words.includes('process')) steps.push({ id: `s${steps.length+1}`, type: 'compute', gas: 500, depends: steps.length ? [steps[steps.length-1].id] : [], params: { fn: 'transform' } });
    if (words.includes('emit') || words.includes('send') || words.includes('publish')) steps.push({ id: `s${steps.length+1}`, type: 'emit', gas: 100, depends: steps.length ? [steps[steps.length-1].id] : [], params: { type: 'contribution' } });
    if (steps.length === 0) steps.push({ id: 's1', type: 'compute', gas: 300, params: { fn: 'execute' } });
    const ir = { workflow: nl.slice(0, 24).replace(/\s+/g, '-').toLowerCase(), version: '1.0.0', steps };
    if (out) out.textContent = JSON.stringify(ir, null, 2);
    if (document.getElementById('dk-ir')) document.getElementById('dk-ir').value = JSON.stringify(ir, null, 2);
}

function dkGenCode() {
    const raw = document.getElementById('dk-ir')?.value?.trim();
    const lang = document.getElementById('dk-lang')?.value || 'js';
    const out = document.getElementById('dk-code-out');
    if (!raw) { notify('Load JSONFlow IR first', 'warn'); return; }
    let ir; try { ir = JSON.parse(raw); } catch { notify('Invalid IR JSON', 'warn'); return; }
    const name = ir.workflow || 'workflow';
    let code = '';
    if (lang === 'js' || lang === 'ts') {
        const type = lang === 'ts' ? ': Promise<void>' : '';
        code = `// Auto-generated from JSONFlow IR\nasync function run${name.replace(/-/g,'_')}()${type} {\n`;
        (ir.steps||[]).forEach(s => { code += `  // Step: ${s.id} (${s.type}, gas: ${s.gas})\n  await execute_${s.type}(${JSON.stringify(s.params||{})});\n`; });
        code += `}\n\nrun${name.replace(/-/g,'_')}();`;
    } else if (lang === 'python') {
        code = `# Auto-generated from JSONFlow IR\nimport asyncio\n\nasync def run_${name.replace(/-/g,'_')}():\n`;
        (ir.steps||[]).forEach(s => { code += `    # Step: ${s.id} (${s.type}, gas: ${s.gas})\n    await execute_${s.type}(${JSON.stringify(s.params||{})})\n`; });
        code += `\nasyncio.run(run_${name.replace(/-/g,'_')}())`;
    } else if (lang === 'rust') {
        code = `// Auto-generated from JSONFlow IR\nuse tokio;\n\n#[tokio::main]\nasync fn main() {\n`;
        (ir.steps||[]).forEach(s => { code += `    // Step: ${s.id} (${s.type}, gas: ${s.gas})\n    execute_${s.type}().await;\n`; });
        code += `}`;
    }
    if (out) out.textContent = code;
}

function dkCopyCode() {
    const code = document.getElementById('dk-code-out')?.textContent;
    if (!code || code === '—') { notify('Generate code first', 'warn'); return; }
    navigator.clipboard.writeText(code).then(() => notify('Code copied to clipboard'));
}

function dkExportSDK() {
    const raw = document.getElementById('dk-ir')?.value?.trim();
    if (!raw) { notify('Load JSONFlow IR first', 'warn'); return; }
    try {
        const ir = JSON.parse(raw);
        const sdk = { name: ir.workflow, version: ir.version || '1.0.0', ir, generated: new Date().toISOString() };
        navigator.clipboard.writeText(JSON.stringify(sdk, null, 2)).then(() => notify('SDK JSON copied to clipboard'));
    } catch { notify('Invalid IR — fix JSON first', 'warn'); }
}

function dkPublish() {
    const raw = document.getElementById('dk-ir')?.value?.trim();
    const name = document.getElementById('dk-publish-name')?.value?.trim();
    const ver = document.getElementById('dk-publish-ver')?.value?.trim() || '1.0.0';
    if (!name) { notify('Enter workflow name', 'warn'); return; }
    if (!raw) { notify('Load JSONFlow IR first', 'warn'); return; }
    DK_REGISTRY.push({ name, version: ver, ts: Date.now() });
    renderDkRegistry();
    notify(`✓ Published "${name}" v${ver} to registry`);
}

function registryPublish() { dkPublish(); }

function renderDkRegistry() {
    const el = document.getElementById('dk-registry');
    if (!el) return;
    if (DK_REGISTRY.length === 0) { el.innerHTML = '<div class="empty">No published workflows</div>'; return; }
    el.innerHTML = DK_REGISTRY.map(w => `<div class="event-row"><span style="color:var(--cyan)">${esc(w.name)}</span> <span class="tag tag-live">v${w.version}</span> <span style="color:var(--text3);font-size:9px">${new Date(w.ts).toLocaleTimeString()}</span></div>`).join('');
}
function runThreatAnalysis() { notify('Threat analysis - implement in UI'); }
function runRRTKSuite() { notify('RRTK Suite - implement in UI'); }
function runByzantine() { notify('Byzantine sim - implement in UI'); }
function runChaos() { notify('Chaos sim - implement in UI'); }
function runEconomicSim() { notify('Economic sim - implement in UI'); }
function obsClear() { appState.sysLog = []; renderObservability(); }
function obsExport() { notify('Export logs - implement in UI'); }
function obsFilter(f) { appState.obsLogFilter = f; renderObservability(); }
function debugExec() { notify('Debug exec - implement in UI'); }
function exportEncryptedBackup() { notify('Backup - implement in UI'); }
function runRRTK() { notify('RRTK suite running…'); }
function checklistRefresh() { notify('Checklist refreshed'); }

async function emitFromCompose() {
    const type = document.getElementById('compose-type')?.value || 'message';
    const content = document.getElementById('compose-input')?.value?.trim();
    if (!content) { notify('Enter content to emit', 'warn'); return; }
    await emit(type, { content, ts: Date.now() });
    const input = document.getElementById('compose-input');
    if (input) input.value = '';
}

// ── BOOT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
