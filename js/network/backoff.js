// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Exponential Backoff for Reconnection
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { CONFIG } from '../core/config.js';

export class ExponentialBackoff {
    constructor(base = CONFIG.backoffBase, max = CONFIG.backoffMax) {
        this.base = base;
        this.max = max;
        this.attempt = 0;
    }

    /**
     * Get next delay with jitter
     */
    next() {
        const delay = Math.min(this.base * Math.pow(2, this.attempt), this.max);
        this.attempt++;
        // Add jitter (0-500ms) to prevent thundering herd
        return delay + Math.random() * 500;
    }

    /**
     * Reset attempts counter
     */
    reset() {
        this.attempt = 0;
    }

    /**
     * Get current attempt number
     */
    getAttempt() {
        return this.attempt;
    }

    /**
     * Calculate delay without incrementing
     */
    peek() {
        return Math.min(this.base * Math.pow(2, this.attempt), this.max);
    }
}

export const reconnectBackoff = new ExponentialBackoff();
