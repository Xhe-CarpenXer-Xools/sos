# SOVEREIGN OS v8.1.0

> Full-stack decentralized intelligence substrate — runs entirely in the browser, no backend required.

---

## Quick Start

```bash
# Serve locally
npx serve .

# Or with Python
python -m http.server 8080
```

Then open `http://localhost:3000` (or whichever port `serve` assigns).

---

## Project Structure

```
index.html              # App shell + all tab UIs
css/
  styles.css            # Full design system (variables, components, layout)
js/
  app.js                # Main entry point, boot sequence, all feature logic
  core/
    config.js           # VERSION, CONFIG, boot lines, agent personas, ethics defaults
    state.js            # Global appState, state machine replay, Gini coefficient
    utils.js            # DOM helpers, rate limiter, input validation, encoding
    crypto.js           # ECDSA P-256, SHA-256, AES-GCM, PBKDF2, Merkle tree
    storage.js          # SCMP v2 content-addressed encrypted shard store
    persistence.js      # IndexedDB adapter (identity, log, SCMP key, vault, archive)
    vm-worker.js        # Web Worker VM, gas metering, timeout kill, receipts
    peerjs.min.js       # PeerJS v1.5.5 — local copy, no CDN dependency
  network/
    bloom-filter.js     # 1024-bit Bloom filter, 3-hash gossip deduplication
    backoff.js          # Exponential backoff reconnect (base 1s, max 30s)
    peer-manager.js     # PeerJS WebRTC, relay mode, offline blob pairing, BFT stats
  ui/
    notifications.js    # Toast notification system
    tabs.js             # Tab switching, mobile bottom bar
    desktop.js          # Windowed desktop environment, taskbar, window management
  features/
    qr-pairing.js       # QR code cross-device pairing, scanner, blob import/export
    capability-tokens.js # Capability tokens with expiration, delegation, revocation
    release-verification.js # Signed release hash verification, tamper detection
    ai-agents.js        # Multi-agent orchestration, verifiable receipts, memory
```

---

## Features by Tab

### Kernel
Event log with compose, quick stats (events, peers, archived, bloom), archive with Merkle root preservation, encrypted backup export.

### Identity
ECDSA P-256 DID generation (`did:key:`), PBKDF2 vault (100,000 iterations SHA-256), 3-of-5 social key recovery shards, attestation signing, identity export.

### Network
PeerJS WebRTC P2P — connect by Peer ID, relay mode toggle (TURN-only for firewalled nodes), QR code pairing for cross-device connections, offline blob pairing, live network topology canvas, BFT consensus stats (N nodes, f fault tolerance).

### Storage
SCMP v2 content-addressed storage — AES-GCM encrypted shards, capability token access control, record index, shard count and size tracking.

### VM
Web Worker sandboxed execution — JSONFlow IR runtime, gas metering (limit: 100,000), 5-second hard timeout kill, verifiable execution receipts with ECDSA signatures.

### Ledger
Hash-chained block ledger — submit transactions (Transfer / Mint / Stake / Note), seal blocks with Merkle root, full block explorer showing previous hash chain, Merkle proof verifier for individual transactions, export to JSON.

### Tokens
SVGT token issuance — mint to any DID, peer-to-peer transfer with balance enforcement, staking with 4.2% APY yield claim, payment channel opening with deposit, live balance distribution with Gini visualization.

### Governance
Proposal lifecycle — create with type (Parameter / Upgrade / Treasury / Text) and timelock, Yes / No / Abstain voting with live approval percentage bar, vote delegation with weight, drift analysis, proposal execution on pass.

### Agents
Four specialized AI agents — **Substrate Oracle** (governance), **Economic Analyst** (tokenomics), **Security Auditor** (vulnerabilities), **Workflow Builder** (JSONFlow IR). Each conversation produces verifiable ECDSA-signed receipts. Persistent agent memory and task queue.

### Security
Ethics constraint engine (Non-Deception, Non-Harm, Privacy, Autonomy) with violation tracking and live ethics score. Release hash verification. Threat analysis, Byzantine simulation, chaos testing, economic simulation stubs.

### DevKit
JSONFlow IR editor with full validation — write workflows as JSON, validate step graph, run with per-step gas tracking. Natural language → IR converter. Code generation (JavaScript, TypeScript, Python, Rust). Workflow registry with versioned publish. SDK export.

### Desktop
Windowed environment with draggable windows, taskbar, app icons.

### Observe
System log with layer filters (ALL / KERNEL / NET / VM / SECURITY), live heap and peer metrics, log export.

---

## Architecture

```
Browser
├── index.html (app shell)
├── ES Modules (type="module")
│   ├── Core layer — crypto, state, persistence, VM
│   ├── Network layer — WebRTC P2P, gossip, relay
│   ├── UI layer — tabs, notifications, desktop
│   └── Feature layer — agents, tokens, governance, devkit
├── IndexedDB — identity, event log, SCMP keys, vault, archive
├── Web Worker — sandboxed VM execution
└── WebRTC (PeerJS) — P2P mesh, STUN/TURN
```

**No build step. No bundler. No server.** Pure ES modules served statically.

---

## Dependencies

| Library | Version | Source | Purpose |
|---|---|---|---|
| PeerJS | 1.5.5 | `js/core/peerjs.min.js` (local) | WebRTC P2P networking |
| DOMPurify | 3.1.6 | cdnjs CDN | XSS sanitization |
| IBM Plex Mono/Sans | — | Google Fonts | UI typography |
| Bebas Neue | — | Google Fonts | Display headings |

PeerJS is served locally — no CDN dependency at runtime. DOMPurify requires an internet connection or can be downloaded and served locally the same way.

---

## Security Model

- **CSP** — `default-src 'self'`, scripts restricted to self + cdnjs + unpkg
- **DOMPurify** — all user-generated HTML sanitized before DOM insertion
- **Input validation** — rate limiting on emit (10/s), gossip (20/s), peer messages (30/s)
- **PBKDF2 vault** — private keys wrapped with 100,000-iteration key derivation
- **Capability tokens** — fine-grained access control on SCMP storage records
- **Signed release hash** — tamper-evident build verification
- **Ethics engine** — pattern-based constraint scoring on all emitted events

---

## Browser Requirements

Modern browser with support for:
- ES Modules (`type="module"`)
- Web Crypto API (ECDSA P-256, AES-GCM, SHA-256)
- IndexedDB
- Web Workers
- WebRTC (for P2P networking)

Chrome 90+, Firefox 90+, Safari 15+, Edge 90+.

---

## Version History

| Version | Notes |
|---|---|
| v8.1.0 | Phase 1–4 complete. Capability tokens, QR pairing, release verification, AI agents, full tab UIs for Ledger / Tokens / Governance / DevKit. Local PeerJS bundle. |
