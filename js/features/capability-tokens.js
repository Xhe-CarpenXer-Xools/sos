// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Phase 4: Capability Tokens with View Limits & Expiration
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { appState, sysLogEntry } from '../core/state.js';
import { sha256, signData } from '../core/crypto.js';
import { randomHex } from '../core/utils.js';
import { saveCapabilityTokens, loadCapabilityTokens } from '../core/persistence.js';
import { notify } from '../ui/notifications.js';

/**
 * Capability Token Types
 */
export const CAP_TYPES = {
    READ: 'read',
    WRITE: 'write',
    EXECUTE: 'execute',
    DELEGATE: 'delegate',
    ADMIN: 'admin'
};

/**
 * Initialize capability tokens from persistence
 */
export async function initCapabilityTokens() {
    appState.capabilityTokens = await loadCapabilityTokens();
}

/**
 * Create a capability token with advanced features
 */
export async function createCapabilityToken(options = {}) {
    const {
        resourceId,
        permissions = [CAP_TYPES.READ],
        maxViews = null,
        expiresInHours = null,
        grantedTo = null,
        delegatable = false,
        metadata = {}
    } = options;

    if (!appState.identity || !appState.keypair) {
        notify('Identity required to create tokens', 'warn');
        return null;
    }

    const tokenId = 'cap_' + randomHex(12);
    const now = Date.now();

    const token = {
        id: tokenId,
        version: '1.0',
        resourceId,
        permissions,
        maxViews,
        viewCount: 0,
        expiresAt: expiresInHours ? now + (expiresInHours * 3600000) : null,
        grantedTo,
        grantedBy: appState.identity.did,
        delegatable,
        parentToken: null,
        revoked: false,
        revokedAt: null,
        createdAt: now,
        metadata
    };

    const tokenHash = await sha256(JSON.stringify({
        id: token.id,
        resourceId: token.resourceId,
        permissions: token.permissions,
        expiresAt: token.expiresAt,
        grantedTo: token.grantedTo,
        grantedBy: token.grantedBy
    }));

    token.signature = await signData(appState.keypair.privateKey, tokenHash);
    token.tokenHash = tokenHash;

    appState.capabilityTokens.set(tokenId, token);
    await saveCapabilityTokens(appState.capabilityTokens);

    sysLogEntry('SECURITY', `Capability token created: ${tokenId.slice(0, 16)}…`);
    notify('Capability token created', 'ok');

    return token;
}

/**
 * Validate a capability token
 */
export function validateCapabilityToken(tokenId, requiredPermission = null) {
    const token = appState.capabilityTokens.get(tokenId);

    if (!token) {
        return { valid: false, reason: 'Token not found', code: 'NOT_FOUND' };
    }
    if (token.revoked) {
        return { valid: false, reason: 'Token has been revoked', code: 'REVOKED' };
    }
    if (token.expiresAt && Date.now() > token.expiresAt) {
        return { valid: false, reason: 'Token has expired', code: 'EXPIRED' };
    }
    if (token.maxViews !== null && token.viewCount >= token.maxViews) {
        return { valid: false, reason: 'View limit exceeded', code: 'VIEW_LIMIT' };
    }
    if (requiredPermission && !token.permissions.includes(requiredPermission)) {
        return { valid: false, reason: `Missing permission: ${requiredPermission}`, code: 'NO_PERMISSION' };
    }
    if (token.grantedTo && appState.identity?.did !== token.grantedTo) {
        return { valid: false, reason: 'Token bound to different identity', code: 'WRONG_IDENTITY' };
    }

    return { valid: true, token };
}

/**
 * Use a capability token (increment view count)
 */
export async function useCapabilityToken(tokenId) {
    const validation = validateCapabilityToken(tokenId);
    if (!validation.valid) {
        notify(`Token invalid: ${validation.reason}`, 'warn');
        return false;
    }

    const token = validation.token;
    token.viewCount++;
    token.lastUsed = Date.now();

    await saveCapabilityTokens(appState.capabilityTokens);
    sysLogEntry('SECURITY', `Token used: ${tokenId.slice(0, 16)}… (${token.viewCount}/${token.maxViews || '∞'})`);

    return true;
}

/**
 * Revoke a capability token
 */
export async function revokeCapabilityToken(tokenId) {
    const token = appState.capabilityTokens.get(tokenId);

    if (!token) {
        notify('Token not found', 'warn');
        return false;
    }

    if (token.grantedBy !== appState.identity?.did) {
        notify('Only the grantor can revoke this token', 'error');
        return false;
    }

    token.revoked = true;
    token.revokedAt = Date.now();

    await saveCapabilityTokens(appState.capabilityTokens);
    sysLogEntry('SECURITY', `Token revoked: ${tokenId.slice(0, 16)}…`);
    notify('Token revoked', 'ok');

    return true;
}

/**
 * Delegate a capability token (create child token)
 */
export async function delegateCapabilityToken(tokenId, newOptions = {}) {
    const validation = validateCapabilityToken(tokenId);
    if (!validation.valid) {
        notify(`Cannot delegate: ${validation.reason}`, 'warn');
        return null;
    }

    const parentToken = validation.token;

    if (!parentToken.delegatable) {
        notify('This token is not delegatable', 'error');
        return null;
    }

    const childPermissions = newOptions.permissions
        ? newOptions.permissions.filter(p => parentToken.permissions.includes(p))
        : parentToken.permissions;

    let childExpiresAt = newOptions.expiresInHours
        ? Date.now() + (newOptions.expiresInHours * 3600000)
        : null;

    if (parentToken.expiresAt && (!childExpiresAt || childExpiresAt > parentToken.expiresAt)) {
        childExpiresAt = parentToken.expiresAt;
    }

    const childToken = await createCapabilityToken({
        resourceId: parentToken.resourceId,
        permissions: childPermissions,
        maxViews: newOptions.maxViews,
        grantedTo: newOptions.grantedTo,
        delegatable: false,
        metadata: { ...parentToken.metadata, ...newOptions.metadata }
    });

    if (childToken) {
        childToken.parentToken = tokenId;
        childToken.expiresAt = childExpiresAt;
        await saveCapabilityTokens(appState.capabilityTokens);
    }

    return childToken;
}

/**
 * List all capability tokens
 */
export function listCapabilityTokens(filter = {}) {
    const tokens = [...appState.capabilityTokens.values()];

    return tokens.filter(token => {
        if (filter.active && (token.revoked || (token.expiresAt && Date.now() > token.expiresAt))) {
            return false;
        }
        if (filter.resourceId && token.resourceId !== filter.resourceId) {
            return false;
        }
        if (filter.grantedBy && token.grantedBy !== filter.grantedBy) {
            return false;
        }
        return true;
    });
}

/**
 * Get token stats
 */
export function getTokenStats() {
    const tokens = [...appState.capabilityTokens.values()];
    const now = Date.now();

    return {
        total: tokens.length,
        active: tokens.filter(t => !t.revoked && (!t.expiresAt || t.expiresAt > now)).length,
        expired: tokens.filter(t => t.expiresAt && t.expiresAt <= now).length,
        revoked: tokens.filter(t => t.revoked).length,
        viewLimitReached: tokens.filter(t => t.maxViews !== null && t.viewCount >= t.maxViews).length
    };
}

/**
 * Export token as shareable string
 */
export function exportCapabilityToken(tokenId) {
    const token = appState.capabilityTokens.get(tokenId);
    if (!token) return null;

    const portable = {
        id: token.id,
        resourceId: token.resourceId,
        permissions: token.permissions,
        expiresAt: token.expiresAt,
        maxViews: token.maxViews,
        grantedBy: token.grantedBy,
        signature: token.signature,
        tokenHash: token.tokenHash
    };

    return btoa(JSON.stringify(portable));
}

/**
 * Import token from shareable string
 */
export async function importCapabilityToken(encoded) {
    try {
        const portable = JSON.parse(atob(encoded));

        if (!portable.id || !portable.signature) {
            throw new Error('Invalid token format');
        }

        if (appState.capabilityTokens.has(portable.id)) {
            notify('Token already imported', 'info');
            return appState.capabilityTokens.get(portable.id);
        }

        const token = {
            ...portable,
            viewCount: 0,
            revoked: false,
            createdAt: Date.now(),
            importedAt: Date.now()
        };

        appState.capabilityTokens.set(token.id, token);
        await saveCapabilityTokens(appState.capabilityTokens);

        sysLogEntry('SECURITY', `Token imported: ${token.id.slice(0, 16)}…`);
        notify('Capability token imported', 'ok');

        return token;
    } catch (e) {
        notify('Import failed: ' + e.message, 'error');
        return null;
    }
}
