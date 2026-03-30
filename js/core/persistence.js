// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — IndexedDB Persistence Layer
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { appState } from './state.js';

const DB_NAME = 'sovereign-os-v8';
const DB_VERSION = 2;

/**
 * Open IndexedDB connection
 */
export async function openIDB() {
    return new Promise((resolve) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
            if (!db.objectStoreNames.contains('archive')) db.createObjectStore('archive');
        };

        req.onsuccess = e => {
            appState.idb = e.target.result;
            resolve(appState.idb);
        };

        req.onerror = () => resolve(null);
    });
}

/**
 * Set value in IndexedDB (falls back to localStorage)
 */
export async function idbSet(key, val, store = 'kv') {
    if (!appState.idb) {
        try {
            localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
        } catch {}
        return;
    }

    return new Promise(resolve => {
        const tx = appState.idb.transaction(store, 'readwrite');
        tx.objectStore(store).put(val, key);
        tx.oncomplete = resolve;
        tx.onerror = () => resolve();
    });
}

/**
 * Get value from IndexedDB (falls back to localStorage)
 */
export async function idbGet(key, store = 'kv') {
    if (!appState.idb) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : null;
        } catch {
            return null;
        }
    }

    return new Promise(resolve => {
        const tx = appState.idb.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
    });
}

/**
 * Delete value from IndexedDB
 */
export async function idbDelete(key, store = 'kv') {
    if (!appState.idb) {
        try {
            localStorage.removeItem(key);
        } catch {}
        return;
    }

    return new Promise(resolve => {
        const tx = appState.idb.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = resolve;
        tx.onerror = () => resolve();
    });
}

/**
 * Clear all data in store
 */
export async function idbClear(store = 'kv') {
    if (!appState.idb) {
        try {
            localStorage.clear();
        } catch {}
        return;
    }

    return new Promise(resolve => {
        const tx = appState.idb.transaction(store, 'readwrite');
        tx.objectStore(store).clear();
        tx.oncomplete = resolve;
        tx.onerror = () => resolve();
    });
}

// Persistence keys
const KEYS = {
    log: 'sos_v8_log',
    identity: 'sos_v8_id',
    scmpKey: 'sos_v8_scmp',
    vault: 'sos_v8_vault',
    archiveLog: 'sos_v8_archive',
    archiveRoots: 'sos_v8_archive_roots',
    capTokens: 'sos_v8_cap_tokens'
};

export async function saveLog() {
    await idbSet(KEYS.log, appState.log);
}

export async function loadLog() {
    const data = await idbGet(KEYS.log);
    if (!data) {
        try {
            return JSON.parse(localStorage.getItem('sos_v7_log') || '[]');
        } catch {
            return [];
        }
    }
    return Array.isArray(data) ? data : [];
}

export async function saveIdentity() {
    if (appState.identity && appState.keypair) {
        await idbSet(KEYS.identity, {
            did: appState.identity.did,
            pubHex: appState.keypair.pubHex,
            privHex: appState.keypair.privHex
        });
    }
}

export async function loadIdentity() {
    const data = await idbGet(KEYS.identity);
    if (!data) {
        try {
            return JSON.parse(localStorage.getItem('sos_v6_id') || 'null');
        } catch {
            return null;
        }
    }
    return data;
}

export async function saveSCMPKey(keyHex) {
    if (keyHex) await idbSet(KEYS.scmpKey, keyHex);
}

export async function loadSCMPKey() {
    return (await idbGet(KEYS.scmpKey)) || localStorage.getItem('sos_v6_scmp');
}

export async function saveVault(vaultData) {
    await idbSet(KEYS.vault, vaultData);
}

export async function loadVault() {
    return await idbGet(KEYS.vault);
}

export async function saveArchive(archiveLog, merkleRoots) {
    await idbSet(KEYS.archiveLog, archiveLog, 'archive');
    await idbSet(KEYS.archiveRoots, merkleRoots);
}

export async function loadArchive() {
    const archiveLog = await idbGet(KEYS.archiveLog, 'archive') || [];
    const merkleRoots = await idbGet(KEYS.archiveRoots) || [];
    return { archiveLog, merkleRoots };
}

export async function saveCapabilityTokens(tokens) {
    await idbSet(KEYS.capTokens, Object.fromEntries(tokens));
}

export async function loadCapabilityTokens() {
    const data = await idbGet(KEYS.capTokens);
    return data ? new Map(Object.entries(data)) : new Map();
}
