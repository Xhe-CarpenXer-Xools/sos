// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — SCMP v2 Distributed Storage
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { sha256, generateMasterKey, importMasterKey, aesEncrypt, aesDecrypt } from './crypto.js';
import { buf2hex } from './utils.js';

/**
 * SCMP v2 — Sovereign Content-addressed Messaging Protocol
 * Content-addressed encrypted storage with sharding
 */
class SCMP {
    constructor() {
        this.masterKey = null;
        this.masterKeyRaw = null;
        this.index = new Map();
        this.policies = new Map();
    }

    async init(existingKey = null) {
        if (existingKey) {
            this.masterKey = await importMasterKey(existingKey);
            this.masterKeyRaw = existingKey;
        } else {
            const { key, hex } = await generateMasterKey();
            this.masterKey = key;
            this.masterKeyRaw = hex;
        }
    }

    async _hashData(data) {
        return sha256(typeof data === 'string' ? data : JSON.stringify(data));
    }

    _shard(s) {
        const n = Math.ceil(s.length / 3);
        return [s.slice(0, n), s.slice(n, 2 * n), s.slice(2 * n)];
    }

    async put(recordId, data) {
        if (!this.masterKey) throw new Error('SCMP not initialized');

        const { ciphertext, iv } = await aesEncrypt(this.masterKey, data);
        const shards = this._shard(ciphertext);
        const metaCID = 'cid_' + (await this._hashData({ recordId, ts: Date.now() })).slice(0, 16);
        const shardHashes = await Promise.all(shards.map(s => this._hashData(s)));

        const record = {
            id: recordId,
            metaCID,
            shardCount: shards.length,
            encIV: iv,
            totalSize: ciphertext.length / 2,
            shardHashes,
            shards,
            ts: Date.now()
        };

        this.index.set(recordId, record);
        return { metaCID, shardCount: shards.length, totalSize: record.totalSize };
    }

    async get(recordId) {
        const rec = this.index.get(recordId);
        if (!rec) throw new Error('Record not found: ' + recordId);
        return aesDecrypt(this.masterKey, rec.shards.join(''), rec.encIV);
    }

    /**
     * Grant access with capability tokens (Phase 4)
     */
    async grantAccess(resourceKey, opts = {}) {
        const policyId = 'policy_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        const token = {
            policyId,
            resourceKey,
            permissions: opts.permissions || ['read'],
            maxViews: opts.maxViews || null,
            expiresAt: opts.expiresAt ? Date.now() + opts.expiresAt * 3600000 : null,
            grantedTo: opts.grantedTo || 'anonymous',
            createdAt: Date.now(),
            viewCount: 0,
            revoked: false
        };
        this.policies.set(policyId, { ...token });
        return token;
    }

    /**
     * Validate capability token (Phase 4)
     */
    validateToken(policyId) {
        const policy = this.policies.get(policyId);
        if (!policy) return { valid: false, reason: 'Token not found' };
        if (policy.revoked) return { valid: false, reason: 'Token revoked' };
        if (policy.expiresAt && Date.now() > policy.expiresAt) {
            return { valid: false, reason: 'Token expired' };
        }
        if (policy.maxViews && policy.viewCount >= policy.maxViews) {
            return { valid: false, reason: 'View limit exceeded' };
        }
        return { valid: true, policy };
    }

    /**
     * Use capability token (increment view count)
     */
    useToken(policyId) {
        const policy = this.policies.get(policyId);
        if (policy && !policy.revoked) {
            policy.viewCount++;
        }
    }

    /**
     * Revoke capability token
     */
    revokeToken(policyId) {
        const policy = this.policies.get(policyId);
        if (policy) {
            policy.revoked = true;
            policy.revokedAt = Date.now();
        }
    }

    async rotateKey() {
        const oldRecs = [];
        for (const [id, rec] of this.index.entries()) {
            try {
                oldRecs.push({ id, data: await aesDecrypt(this.masterKey, rec.shards.join(''), rec.encIV) });
            } catch {}
        }

        const { key, hex } = await generateMasterKey();
        this.masterKey = key;
        this.masterKeyRaw = hex;

        for (const { id, data } of oldRecs) {
            await this.put(id, data);
        }
        return this.masterKeyRaw;
    }

    getStats() {
        return {
            records: this.index.size,
            totalSize: [...this.index.values()].reduce((s, r) => s + r.totalSize, 0),
            policies: this.policies.size,
            shards: [...this.index.values()].reduce((s, r) => s + r.shardCount, 0),
            activeTokens: [...this.policies.values()].filter(p => !p.revoked && (!p.expiresAt || p.expiresAt > Date.now())).length
        };
    }

    exportState() {
        return {
            version: '2.1.0',
            masterKey: this.masterKeyRaw,
            index: Object.fromEntries(this.index),
            policies: Object.fromEntries(this.policies)
        };
    }

    getMasterKeyHex() {
        return this.masterKeyRaw;
    }
}

// Create and export default SCMP instance
export const scmp = new SCMP();
