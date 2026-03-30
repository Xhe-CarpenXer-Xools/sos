// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Utility Functions
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

/**
 * Format bytes to human-readable string
 */
export function formatBytes(b) {
    if (!b) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

/**
 * Escape HTML special characters
 */
export function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Sanitize HTML using DOMPurify if available
 */
export function sanitize(html) {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['div', 'span', 'b', 'i', 'em', 'strong', 'code', 'pre', 'br'],
            ALLOWED_ATTR: ['style', 'class']
        });
    }
    return esc(html);
}

/**
 * Set element text content by ID
 */
export function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

/**
 * Rate limiter - returns false if rate exceeded
 */
const _rateLimits = new Map();
export function rateLimit(key, maxPerSec = 5) {
    const now = Date.now();
    const bucket = _rateLimits.get(key) || { count: 0, reset: now + 1000 };
    if (now > bucket.reset) {
        bucket.count = 0;
        bucket.reset = now + 1000;
    }
    bucket.count++;
    _rateLimits.set(key, bucket);
    return bucket.count <= maxPerSec;
}

/**
 * Validate event payload for security
 */
export function validateEventPayload(type, data) {
    if (!type || typeof type !== 'string' || type.length > 64) return false;
    if (typeof data !== 'object' || data === null) return false;
    const str = JSON.stringify(data);
    if (str.length > 16384) return false;
    if (/<script|javascript:|data:|on\w+=/i.test(str)) return false;
    return true;
}

/**
 * Canonical JSON serialization for deterministic hashing
 */
export function canonical(obj) {
    if (obj === null) return 'null';
    if (typeof obj === 'boolean') return String(obj);
    if (typeof obj === 'number') return String(obj);
    if (typeof obj === 'string') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(canonical).join(',') + ']';
    if (typeof obj === 'object') {
        return '{' + Object.keys(obj).sort().map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
    }
    throw new Error('not canonicalizable');
}

/**
 * Hex to ArrayBuffer
 */
export function hex2buf(h) {
    return new Uint8Array(h.match(/.{2}/g).map(x => parseInt(x, 16))).buffer;
}

/**
 * ArrayBuffer to Hex
 */
export function buf2hex(b) {
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate random hex string
 */
export function randomHex(bytes = 16) {
    return buf2hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function
 */
export function debounce(fn, ms) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), ms);
    };
}
