// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Global State Management
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { ETHICS_DEFAULTS } from './config.js';

/**
 * Create initial application state
 */
export function createInitialState() {
    return {
        messages: [],
        ideas: {},
        identities: {},
        contributions: 0,
        snapshots: [],
        tokens: {},
        proposals: {},
        votes: {},
        txCount: 0,
        stakes: {},
        channels: {}
    };
}

/**
 * Global application state
 */
export const appState = {
    // Identity
    identity: null,
    keypair: null,

    // Event log
    log: [],
    archiveLog: [],
    archiveMerkleRoots: [],

    // Derived state
    state: createInitialState(),

    // Network
    peers: new Map(),
    peerJS: null,
    peerJSReady: false,
    relayMode: false,
    reconnectTimer: null,
    reconnectAttempts: 0,

    // Storage
    capsuleStore: new Map(),
    idb: null,

    // Ethics
    ethicsLog: [...ETHICS_DEFAULTS],

    // Processes
    processes: [],

    // Ledger
    ledgerBlocks: [],
    pendingTxs: [],

    // AI Agents
    agentMemory: [],
    taskQueue: [],
    agentReceipts: [],
    activeAgent: 'oracle',

    // System logs
    sysLog: [],
    obsLogFilter: 'ALL',

    // Metrics
    gossipCount: 0,
    bloomDeduped: 0,
    bftRound: 0,
    perfMetrics: [],
    metricInterval: null,

    // VM
    vmReceipts: [],
    fheState: null,
    vmGasUsed: 0,
    vmWorker: null,
    vmWorkerBusy: false,

    // Desktop
    openWindows: [],
    activeWinId: null,

    // Vault
    vaultKey: null,
    pwResolve: null,

    // Phase 4: Capability Tokens
    capabilityTokens: new Map(),

    // Phase 4: Release verification
    releaseSignature: null
};

/**
 * State machine replay - rebuilds state from event log
 */
export function replay(events) {
    const s = createInitialState();

    for (const e of events) {
        const { type, data } = e.payload;

        if (type === 'message') {
            s.messages.push({ ...data, author: e.author, ts: e.ts });
        }
        if (type === 'idea') {
            s.ideas[e.cid] = { ...data, author: e.author, ts: e.ts };
        }
        if (type === 'identity') {
            s.identities[e.author] = data;
        }
        if (type === 'contribution') {
            s.contributions += (data.amount || 1);
        }
        if (type === 'snapshot') {
            s.snapshots.push(e.cid);
        }
        if (type === 'token_mint' || type === 'MINT') {
            s.tokens[data.to] = (s.tokens[data.to] || 0) + data.amount;
            s.txCount++;
        }
        if (type === 'token_transfer' || type === 'TRANSFER') {
            if (data.from) s.tokens[data.from] = (s.tokens[data.from] || 0) - data.amount;
            s.tokens[data.to] = (s.tokens[data.to] || 0) + data.amount;
            s.txCount++;
        }
        if (type === 'stake') {
            s.stakes[data.who] = (s.stakes[data.who] || 0) + data.amount;
        }
        if (type === 'unstake') {
            s.stakes[data.who] = Math.max(0, (s.stakes[data.who] || 0) - data.amount);
        }
        if (type === 'proposal_create') {
            s.proposals[e.cid] = {
                ...data, cid: e.cid, author: e.author, ts: e.ts,
                status: 'active', yes: 0, no: 0, abs: 0, execState: 'pending'
            };
        }
        if (type === 'vote') {
            const p = s.proposals[data.proposalId];
            if (p) {
                p[data.choice] = (p[data.choice] || 0) + 1;
                const total = p.yes + p.no + p.abs;
                if (total > 0 && p.yes / total >= 0.51) p.status = 'passed';
            }
        }
        if (type === 'channel_open') {
            s.channels[data.channelId] = {
                peer: data.peer, deposit: data.deposit, balance: data.deposit, ts: e.ts
            };
        }
    }

    return s;
}

/**
 * Compute Gini coefficient for wealth distribution
 */
export function computeGini(balances) {
    const vals = Object.values(balances).filter(v => v > 0);
    if (vals.length < 2) return 0;
    vals.sort((a, b) => a - b);
    let s = 0;
    for (let i = 0; i < vals.length; i++) {
        s += (2 * i - vals.length + 1) * vals[i];
    }
    return Math.max(0, s / (vals.length * vals.reduce((a, b) => a + b, 0)));
}

/**
 * Add system log entry
 */
export function sysLogEntry(layer, msg) {
    const entry = { layer, msg, ts: new Date().toISOString().slice(11, 19) };
    appState.sysLog.push(entry);
    if (appState.sysLog.length > 300) appState.sysLog.shift();
}
