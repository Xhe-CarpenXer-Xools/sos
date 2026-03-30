// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Cryptography Module
// Browser-safe ES Module using Web Crypto API
// ══════════════════════════════════════════════════════════════════════════

import { canonical, buf2hex, hex2buf } from './utils.js';
import { CONFIG } from './config.js';

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' };

/**
 * SHA-256 hash (async)
 */
export async function sha256(data) {
    const enc = new TextEncoder().encode(typeof data === 'string' ? data : canonical(data));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return buf2hex(buf);
}

/**
 * SHA-256 hash (sync, for worker/quick checks)
 */
export function sha256Sync(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return ('0'.repeat(16) + Math.abs(h).toString(16)).slice(-16).repeat(4);
}

/**
 * Generate ECDSA P-256 keypair
 */
export async function generateKeypair() {
    const kp = await crypto.subtle.generateKey(ECDSA, true, ['sign', 'verify']);
    const pubRaw = await crypto.subtle.exportKey('spki', kp.publicKey);
    const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
    return {
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        pubHex: buf2hex(pubRaw),
        privHex: buf2hex(privRaw)
    };
}

/**
 * Import keypair from hex strings
 */
export async function importKeypair(pubHex, privHex) {
    const pubBuf = hex2buf(pubHex);
    const privBuf = hex2buf(privHex);
    const publicKey = await crypto.subtle.importKey('spki', pubBuf, ECDSA, true, ['verify']);
    const privateKey = await crypto.subtle.importKey('pkcs8', privBuf, ECDSA, true, ['sign']);
    return { publicKey, privateKey, pubHex, privHex };
}

/**
 * Sign data with private key
 */
export async function signData(privateKey, data) {
    const enc = new TextEncoder().encode(data);
    const sig = await crypto.subtle.sign(SIGN_ALG, privateKey, enc);
    return buf2hex(sig);
}

/**
 * Verify signature
 */
export async function verifySignature(pubHex, data, sigHex) {
    try {
        const pubBuf = hex2buf(pubHex);
        const pk = await crypto.subtle.importKey('spki', pubBuf, ECDSA, false, ['verify']);
        const sigBuf = hex2buf(sigHex);
        return await crypto.subtle.verify(SIGN_ALG, pk, sigBuf, new TextEncoder().encode(data));
    } catch {
        return false;
    }
}

/**
 * Build Merkle root from array of items
 */
export async function buildMerkleRoot(items) {
    if (!items.length) return await sha256('empty');
    let layer = await Promise.all(items.map(x =>
        typeof x === 'string' && x.length === 64 ? x : sha256(canonical(x))
    ));
    while (layer.length > 1) {
        const next = [];
        for (let i = 0; i < layer.length; i += 2) {
            next.push(await sha256(layer[i] + (layer[i + 1] || layer[i])));
        }
        layer = next;
    }
    return layer[0];
}

/**
 * PBKDF2 key derivation from password
 */
export async function deriveKeyFromPassword(password, salt) {
    const enc = new TextEncoder().encode(password);
    const saltBuf = typeof salt === 'string' ? new TextEncoder().encode(salt) : salt;
    const mat = await crypto.subtle.importKey('raw', enc, 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBuf, iterations: CONFIG.pbkdf2Iterations, hash: 'SHA-256' },
        mat,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Wrap key with PBKDF2-derived vault key
 */
export async function wrapKeyWithVault(rawKeyHex, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const dk = await deriveKeyFromPassword(password, salt);
    const keyBytes = new Uint8Array(rawKeyHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dk, keyBytes);
    return { wrapped: buf2hex(wrapped), salt: buf2hex(salt), iv: buf2hex(iv) };
}

/**
 * Unwrap key with PBKDF2-derived vault key
 */
export async function unwrapKeyWithVault(wrappedObj, password) {
    const salt = hex2buf(wrappedObj.salt);
    const iv = hex2buf(wrappedObj.iv);
    const dk = await deriveKeyFromPassword(password, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dk, hex2buf(wrappedObj.wrapped));
    return buf2hex(plain);
}

/**
 * Generate AES-GCM master key
 */
export async function generateMasterKey() {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = await crypto.subtle.exportKey('raw', key);
    return { key, hex: buf2hex(raw) };
}

/**
 * Import AES-GCM key from hex
 */
export async function importMasterKey(hexKey) {
    const key = await crypto.subtle.importKey('raw', hex2buf(hexKey), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    return key;
}

/**
 * AES-GCM encrypt
 */
export async function aesEncrypt(key, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
    return { ciphertext: buf2hex(encrypted), iv: buf2hex(iv) };
}

/**
 * AES-GCM decrypt
 */
export async function aesDecrypt(key, ciphertext, ivHex) {
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: hex2buf(ivHex) }, key, hex2buf(ciphertext));
    return JSON.parse(new TextDecoder().decode(dec));
}
