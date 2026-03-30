// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Bloom Filter for Gossip Deduplication
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { CONFIG } from '../core/config.js';

export class BloomFilter {
    constructor(size = CONFIG.bloomSize, hashCount = CONFIG.bloomHashCount) {
        this.bits = new Uint8Array(size);
        this.hashCount = hashCount;
        this.size = size;
    }

    _hashes(str) {
        const hashes = [];
        for (let i = 0; i < this.hashCount; i++) {
            let h = 5381 + i * 31337;
            for (let j = 0; j < str.length; j++) {
                h = ((h << 5) + h) ^ str.charCodeAt(j);
            }
            hashes.push(Math.abs(h) % this.size);
        }
        return hashes;
    }

    add(str) {
        this._hashes(str).forEach(i => this.bits[i] = 1);
    }

    has(str) {
        return this._hashes(str).every(i => this.bits[i] === 1);
    }

    reset() {
        this.bits.fill(0);
    }

    /**
     * Export bits as string for peer sync
     */
    export() {
        return [...this.bits].join('');
    }

    /**
     * Import bits from peer
     */
    static fromString(str, size, hashCount) {
        const bf = new BloomFilter(size, hashCount);
        bf.bits = Uint8Array.from(str.split('').map(Number));
        return bf;
    }

    /**
     * Get fill ratio
     */
    fillRatio() {
        return this.bits.filter(b => b === 1).length / this.size;
    }

    /**
     * Estimate false positive rate
     */
    estimatedFPR() {
        const m = this.size;
        const k = this.hashCount;
        const n = this.bits.filter(b => b === 1).length / k;
        return Math.pow(1 - Math.exp(-k * n / m), k);
    }
}

// Create default instance
export const bloomFilter = new BloomFilter();
