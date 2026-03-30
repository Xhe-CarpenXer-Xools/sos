// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Configuration Module
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

export const VERSION = '8.1.0';
export const RELEASE_HASH = null; // Set by build system

export const CONFIG = {
    version: VERSION,
    archiveThreshold: 2000,
    archiveKeep: 500,
    maxLogSize: 300,
    bloomSize: 1024,
    bloomHashCount: 3,
    backoffBase: 1000,
    backoffMax: 30000,
    vmTimeout: 5000,
    vmGasLimit: 100000,
    rateLimit: {
        emit: 10,
        gossip: 20,
        peerMsg: 30
    },
    pbkdf2Iterations: 100000,
    peerJS: {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        path: '/'
    },
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
};

export const BOOT_LINES = [
    '[ OK ] Initializing XHE Kernel v8.1…',
    '[ OK ] Opening IndexedDB (v2)…',
    '[ OK ] PBKDF2 vault: 100,000 iterations SHA-256…',
    '[ OK ] Loading CapsuleStore (content-addressed)…',
    '[ OK ] Web Worker VM: spinning up sandbox…',
    '[ OK ] Gas meter + timeout kill: ARMED (5s hard limit)…',
    '[ OK ] WASM deterministic runtime: SIMULATED',
    '[ OK ] Process scheduler: ONLINE',
    '[ OK ] SCMP v2 distributed storage: READY',
    '[ OK ] Multi-node replication: 3 replicas',
    '[ OK ] ECDSA P-256 identity layer…',
    '[ OK ] Social key recovery (3-of-5 shards)…',
    '[ OK ] Permission system: user/app/system',
    '[ OK ] Bloom filter gossip: 1024-bit, 3-hash…',
    '[ OK ] Exponential backoff reconnect: base=1s max=30s…',
    '[ OK ] PeerJS WebRTC networking…',
    '[ OK ] Relay mode: AVAILABLE (TURN-only toggle)',
    '[ OK ] Offline peer pairing: blob export/import',
    '[ OK ] State-hash sync verification: ACTIVE',
    '[ OK ] BFT consensus engine: READY',
    '[ OK ] Hash-chained ledger: Merkle tree initialized',
    '[ OK ] Event archival: auto-prune at 2000 events',
    '[ OK ] Archive Merkle root: preserved on prune',
    '[ OK ] Token ledger: SVGT issuance + staking',
    '[ OK ] Governance engine: timelock + delegation',
    '[ OK ] Multi-agent orchestration: 4 agents',
    '[ OK ] Verifiable AI receipts: signing enabled',
    '[ OK ] Ethics constraint engine: 4 rules + remote gate',
    '[ OK ] CSP + DOMPurify + input validation: ACTIVE',
    '[ OK ] Rate limiter: 10/s emit · 20/s gossip',
    '[ OK ] PWA manifest: injected (installable)',
    '[ OK ] Connection security indicators: ACTIVE',
    '[ OK ] Phase 4: Capability tokens with expiration',
    '[ OK ] Phase 4: QR code cross-device pairing',
    '[ OK ] Phase 4: Signed release hash verification',
    '[ SOVEREIGN OS v8.1 ] All Phase 1+2+3+4 systems nominal.',
];

export const AGENT_PERSONAS = {
    oracle: {
        name: 'Substrate Oracle',
        domain: 'governance',
        color: 'var(--cyan)',
        system: 'You are the Substrate Oracle. Analyze governance, state integrity, consensus metrics.'
    },
    analyst: {
        name: 'Economic Analyst',
        domain: 'tokenomics',
        color: 'var(--green)',
        system: 'You are the Economic Analyst. Analyze token distribution, staking yields, Gini, attack vectors.'
    },
    auditor: {
        name: 'Security Auditor',
        domain: 'security',
        color: 'var(--red)',
        system: 'You are the Security Auditor. Identify vulnerabilities, model Byzantine attacks, recommend mitigations.'
    },
    builder: {
        name: 'Workflow Builder',
        domain: 'devkit',
        color: 'var(--amber)',
        system: 'You are the Workflow Builder. Help create JSONFlow IR workflows and decentralized app architectures.'
    },
};

export const ETHICS_DEFAULTS = [
    { name: 'Non-Deception', patterns: ['lie', 'fraud', 'fake', 'scam'], weight: 0.5, color: 'var(--cyan)', violations: 0 },
    { name: 'Non-Harm', patterns: ['kill', 'harm', 'hurt', 'attack', 'weapon'], weight: 0.7, color: 'var(--red)', violations: 0 },
    { name: 'Privacy', patterns: ['dox', 'expose', 'leak', 'personal'], weight: 0.4, color: 'var(--violet)', violations: 0 },
    { name: 'Autonomy', patterns: ['force', 'coerce', 'compel', 'mandate'], weight: 0.3, color: 'var(--amber)', violations: 0 },
];
