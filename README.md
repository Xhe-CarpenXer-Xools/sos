# SOVEREIGN OS (SOS) v6

**Full-Stack Decentralized Intelligence Substrate**

> A single-file, browser-native operating system implementing a 15-layer decentralized architecture — XHE Kernel · WASM Runtime · BFT Consensus · AI Agents · On-Chain Governance · Token Economy · P2P Network · Ethics Engine

---

## Overview

Sovereign OS (SOS) is a self-contained, zero-install decentralized platform that runs entirely in a modern web browser as a single HTML file (`index.html`). It simulates and prototypes a complete sovereign computing substrate: from a cryptographic kernel and hash-linked event ledger, to a token economy, AI agent orchestration, Byzantine fault simulation, and an in-browser windowed desktop environment.

SOS is designed for researchers, protocol designers, government technology offices, and enterprise infrastructure teams who need to explore, audit, or prototype decentralized system architectures without requiring any blockchain infrastructure, cloud services, or installation.

---

## Architecture — 15-Layer Stack

| Layer | Component | Description |
|-------|-----------|-------------|
| 1 | **XHE Kernel** | Content-addressed substrate, deterministic state machine, process scheduler, Merkle-rooted snapshots |
| 2 | **VM Runtime** | JSONFlow IR workflow executor, gas metering, app sandbox registry, FHE simulation |
| 3 | **Identity** | DID-based self-sovereign identity, ECDSA keypairs, social key recovery, multi-sig, attestation |
| 4 | **P2P Network** | Simulated gossip protocol, BFT consensus rounds, peer discovery, message routing |
| 5 | **Distributed Store** | SCMP CapsuleStore — content-addressed immutable blob storage with CID indexing |
| 6 | **Ledger** | SHA-256 hash-linked event chain, Merkle tree proofs, block sealing, fork resolution |
| 7 | **Token Economy** | MINT/BURN/TRANSFER, staking with time-weighted yield, slashing, payment channels |
| 8 | **Governance** | On-chain proposals, quadratic-weighted voting, delegation with anti-whale caps, drift analysis |
| 9 | **AI Agents** | Multi-agent orchestration (Oracle, Analyst, Auditor, Builder), Ollama/LLM streaming, long-term memory |
| 10 | **Security** | Ethics constraint engine, 12-vector threat model, Byzantine/economic/chaos simulation |
| 11 | **DevKit** | JSONFlow workflow builder, code editor, ESM/CJS export, contract templates |
| 12 | **Desktop** | Multi-window environment, file explorer, terminal emulator, taskbar, toast notifications |
| 13 | **Observability** | Live performance metrics, workflow trace, system log with layer filter, JSON export |
| 14 | **Cryptography** | Web Crypto API (ECDSA P-256), SHA-256 via SubtleCrypto, canonical JSON serialization |
| 15 | **Interop** | Browser-native (no install), localStorage persistence, Ollama REST integration |

---

## Features

### ⬡ XHE Kernel
- Deterministic state machine with full event replay
- Content-addressed CapsuleStore (SHA-256 CIDs)
- Process scheduler with spawn/kill lifecycle
- State snapshots with Merkle root verification
- Convergence proof: identical CapsuleStores → identical state hash
- Ethics monitor with configurable constraint patterns

### ⚙ VM Runtime
- **JSONFlow IR** — a declarative workflow intermediate representation supporting `compute`, `store`, `validate`, `query`, `emit`, and `ai` step types
- Per-step gas metering with configurable limits
- App sandbox registry with 6 built-in apps and deploy-your-own support
- **FHE simulation** — additive ring homomorphic encryption (encrypt, add, multiply, decrypt without exposing plaintext)
- Execution receipts with gas accounting

### ◈ Identity
- `did:key` self-sovereign identifiers derived from ECDSA P-256 public keys
- Keypair generation using Web Crypto API
- Social key recovery (M-of-N guardian scheme)
- Granular permission system (read/write/admin)
- Multi-signature transaction support
- Identity attestation with verifiable claims

### ⟷ P2P Network
- Gossip protocol simulation with configurable peer count
- BFT consensus rounds with round tracking
- Simulated peer discovery and message broadcasting
- Network partition and message drop simulation

### 💾 Distributed Store
- SCMP (Sovereign Content Messaging Protocol) CapsuleStore
- Immutable content-addressed blobs
- CID-based lookup, list, and pin operations
- Size-tracked memory accounting

### 🔗 Ledger
- Append-only SHA-256 hash-linked event chain
- Each event carries: type, payload, DID, ECDSA signature, previous CID, sequence number
- Binary Merkle tree root computation and inclusion proof generation
- Block sealing with Merkle snapshots
- Longest-chain fork resolution with CID lexicographic tie-breaking
- Full event replay for deterministic state reconstruction

### ◎ Token Economy
- `MINT`, `BURN`, `TRANSFER` events on the event log
- Staking with time-weighted yield accruing per sealed block
- Slashing: Byzantine actors lose 10% of stake on-chain
- Off-chain payment channels with net settlement
- Gini coefficient tracking for wealth distribution monitoring

### 🏛 Governance
- On-chain proposal creation with configurable quorum and expiry
- Quadratic-weighted vote tallying
- Vote delegation with 10% anti-whale cap
- `executeProposal()` enforcement on passed votes
- Drift analysis: compares actual state against proposal intent
- (Planned) 24-hour timelock on passed proposals

### 🤖 AI Agents
- Four built-in specialist agents: Oracle (governance), Analyst (tokenomics), Auditor (security), Builder (devkit)
- Live Ollama integration at `localhost:11434` with streaming response support
- Heuristic fallback mode when no LLM is connected
- Long-term agent memory store with CID-referenced entries
- Task queue with delegation and receipt tracking
- Verifiable agent outputs logged to event chain

### 🛡 Security
- **Ethics Constraint Engine** — configurable pattern-matching rules (Non-Deception, Non-Harm, Privacy, Autonomy) scored per emitted event
- **12-vector Threat Model** — severity-classified threats across network, consensus, economic, and application layers
- **Byzantine Fault Simulation** — 5 scenarios: message drop (50%), double-vote/equivocation, Sybil storm, eclipse attack, replay attack
- **Economic Attack Simulation** — MEV extraction, flash loan attack, governance capture, whale accumulation, stake rent
- **Chaos Engine** — 5 scenarios: 50% node drop, network partition, memory exhaustion, latency spike, data corruption

### ⚙ DevKit
- Visual JSONFlow workflow builder with drag-and-connect interface
- In-browser code editor with ESM and CJS export targets
- Smart contract templates for common patterns
- Workflow execution with step-by-step gas trace

### 🖥 Desktop
- Full multi-window environment: drag, resize, minimize, maximize, close
- Capsule browser (file explorer for CapsuleStore contents)
- Kernel shell terminal: `status`, `peers`, `log`, `snapshot`, `mint` commands
- Taskbar with open app list and UTC clock
- Color-tiered toast notification system (ok/info/warn/error)

### 📊 Observability
- Live canvas performance chart: event throughput, latency, heap usage
- System log with layer filter (KERNEL, NET, TOKEN, GOV, AI, VM, SECURITY)
- Full JSON export of `sysLog` and `perfMetrics`
- State inspector with live key counts

---

## Completion Status

**~78% of planned features implemented** (as tracked in the built-in Status tab).

| Layer | Done | Pending |
|-------|------|---------|
| Kernel | Scheduler, snapshots, Merkle, state replay, ethics | — |
| VM | JSONFlow IR, gas metering, FHE sim, app registry | WASM deterministic runtime |
| Identity | DID, ECDSA, recovery, permissions, multi-sig, attestation | — |
| Network | Gossip, BFT rounds, discovery | Real WebRTC peer connections |
| Ledger | Hash chain, Merkle proofs, sealing, fork handling | Light-client SPV verification |
| Tokens | Mint/burn/transfer, staking, slashing, channels | Real fee market / gas pricing |
| Governance | Proposals, voting, delegation, execution, drift | 24h timelock enforcement |
| Security | Ethics engine, threat model, Byzantine/economic/chaos sim | Automated fuzz testing |
| Desktop | Multi-window, terminal, file explorer, taskbar | — |
| Observability | Live metrics, sys log, JSON export | — |
| Interop | Browser-native, localStorage | Web2 API gateway, cross-chain bridge |

---

## Quick Start

No installation required.

1. Download or clone this repository
2. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge)
3. Watch the boot sequence complete
4. Click **Identity → Generate DID** to create your sovereign identity
5. Explore tabs: Kernel → emit events, Ledger → seal blocks, Tokens → mint, Governance → propose

### Optional: Connect an LLM

To enable live AI agent responses, run [Ollama](https://ollama.ai) locally:

```bash
ollama serve
ollama pull llama3
```

The AI Agents tab will automatically detect `localhost:11434` and switch from heuristic mode to live streaming.

---

## Technical Notes

### Cryptography
- All signing uses **ECDSA P-256** via the browser's `crypto.subtle` API
- Hashing uses **SHA-256** via `crypto.subtle.digest`
- A fast synchronous djb2-variant hash (`sha256Sync`) is used for non-security UI operations
- FHE uses an additive ring simulation — not a production FHE scheme

### State Persistence
- Identity and event log are persisted to `localStorage`
- No server, no database, no external dependencies at runtime

### Networking
- P2P layer is currently simulated in-process (gossip rounds, BFT)
- Real WebRTC signaling is listed as a planned feature
- Ollama integration is the only live external HTTP call

### Security Considerations for Production Use
- The FHE implementation is a simulation for research/demo purposes only
- The sha256Sync function is a fast hash for UI purposes, not cryptographically secure
- P2P networking is simulated; real deployment would require WebRTC or libp2p integration
- localStorage is not encrypted at rest — production deployments should use encrypted storage

---

## Audit Summary

**Reviewed:** March 2026  
**Version:** v6.0.0  
**File count:** 1 (`index.html`, ~297 KB)

### Strengths
- Comprehensive single-file architecture covering 15 system layers
- Correct use of Web Crypto API for ECDSA and SHA-256
- Deterministic state replay from append-only event log is architecturally sound
- Merkle tree implementation is structurally correct
- Ethics constraint engine is extensible and auditable
- Gas metering prevents unbounded VM execution
- Security simulation suite is broad and well-labeled

### Known Limitations / Gaps
- `sha256Sync` is a djb2 variant, not SHA-256 — naming is misleading for security reviewers
- P2P layer is fully simulated; no real network transport
- FHE is additive ring simulation, not a true homomorphic encryption scheme (e.g., CKKS, BFV)
- WASM deterministic runtime is listed as pending
- SPV light-client verification is pending
- No automated test suite or fuzz testing
- `localStorage` has no encryption at rest
- No Content Security Policy (CSP) headers defined in the file
- All state is in-memory and in localStorage — no backup or export beyond JSON snapshot

### Recommendations
1. Rename `sha256Sync` to `djb2Hash` or `fastHash` to avoid security confusion
2. Add a CSP meta tag to prevent XSS risks from inline scripts
3. Implement real WebRTC signaling for actual P2P connectivity
4. Replace FHE simulation with a note distinguishing it from production FHE
5. Add a unit/integration test harness (Jest or similar) for the state machine
6. Add localStorage encryption or IndexedDB with CryptoKey-based encryption for identity keys
7. Implement the 24h timelock on governance proposals before production use
8. Document the canonical JSON serialization scheme for cross-platform determinism

---

## Repository Structure

```
sos-main/
├── index.html      # Complete single-file application (~297 KB)
└── README.md       # This file
```

---

## Licensing

Sovereign OS uses a **dual license** model:

- **Community License (AGPL-3.0)** — Free for personal use, open-source projects, academic research, and non-commercial use. Full terms in `LICENSE-COMMUNITY`.

- **Commercial License** — Required for use by government agencies, commercial enterprises, SaaS deployments, or any use outside the Community License scope. Full terms in `LICENSE-COMMERCIAL`.

See [LICENSE-COMMUNITY](./LICENSE-COMMUNITY) and [LICENSE-COMMERCIAL](./LICENSE-COMMERCIAL) for complete terms.

For commercial licensing inquiries, contact the project maintainers.

---

## Contributing

Contributions are welcome under the Community License. By submitting a pull request, you agree that your contributions may be included in both the community and commercial distributions of Sovereign OS.

---

*SOVEREIGN OS v6 · d-net · Full-Stack Decentralized Intelligence Substrate*
