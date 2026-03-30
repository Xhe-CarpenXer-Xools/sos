// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Phase 4: On-Device AI Integration
// Browser-safe ES Module (works offline with heuristic fallback)
// ══════════════════════════════════════════════════════════════════════════

import { AGENT_PERSONAS } from '../core/config.js';
import { appState, sysLogEntry, computeGini } from '../core/state.js';
import { sha256, signData } from '../core/crypto.js';
import { esc } from '../core/utils.js';
import { notify } from '../ui/notifications.js';
import { bloomFilter } from '../network/bloom-filter.js';

let activeAgent = 'oracle';

/**
 * AI Configuration
 */
const AI_CONFIG = {
    localEndpoint: 'http://localhost:11434/api/chat', // Ollama
    defaultModel: 'mistral',
    timeout: 8000,
    maxMemory: 50
};

/**
 * Get current substrate context for AI
 */
export function getSubstrateContext() {
    const gini = computeGini(appState.state.tokens);
    return `SOS v8.1 STATE: Events:${appState.log.length}+${appState.archiveLog.length}archived ` +
        `Peers:${appState.peers.size} Tokens:${Object.keys(appState.state.tokens).length}holders ` +
        `Supply:${Object.values(appState.state.tokens).reduce((s, v) => s + v, 0)} ` +
        `Proposals:${Object.keys(appState.state.proposals).length} Gini:${gini.toFixed(3)} ` +
        `Blocks:${appState.ledgerBlocks.length} Relay:${appState.relayMode}`;
}

/**
 * Select active agent
 */
export function selectAgent(name) {
    if (!AGENT_PERSONAS[name]) {
        notify('Unknown agent: ' + name, 'warn');
        return;
    }
    activeAgent = name;
    appState.activeAgent = name;

    const p = AGENT_PERSONAS[name];
    const badge = document.getElementById('active-agent-badge');
    if (badge) {
        badge.textContent = p.name;
        badge.style.color = p.color;
    }

    const select = document.getElementById('agent-select');
    if (select) select.value = name;

    appendAgentMsg(`Switched to ${p.name} (${p.domain})`, 'sys');
}

/**
 * Send message to AI agent
 */
export async function sendAgentMessage(text = null) {
    const input = document.getElementById('agent-input');
    const agentId = document.getElementById('agent-select')?.value || activeAgent;
    const message = text || input?.value?.trim();

    if (!message) return;

    if (input) {
        input.value = '';
        input.style.height = 'auto';
    }

    appendAgentMsg(message, 'user');

    appState.agentMemory.push({
        role: 'user',
        content: message,
        ts: Date.now(),
        agent: agentId
    });

    if (appState.agentMemory.length > AI_CONFIG.maxMemory) {
        appState.agentMemory.splice(0, appState.agentMemory.length - AI_CONFIG.maxMemory);
    }

    renderAgentMemory();

    // Try local AI (Ollama) first
    try {
        const response = await fetch(AI_CONFIG.localEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: AI_CONFIG.defaultModel,
                stream: false,
                messages: [
                    { role: 'system', content: AGENT_PERSONAS[agentId].system + '\n\n' + getSubstrateContext() },
                    ...appState.agentMemory.slice(-6).map(m => ({ role: m.role, content: m.content }))
                ]
            }),
            signal: AbortSignal.timeout(AI_CONFIG.timeout)
        });

        if (response.ok) {
            const d = await response.json();
            const reply = d.message?.content || '(no response)';

            appState.agentMemory.push({
                role: 'assistant',
                content: reply,
                ts: Date.now(),
                agent: agentId
            });

            appendAgentMsg(reply, 'ai');
            await generateAgentReceipt(agentId, message, reply);
            return;
        }
    } catch (e) {
        // Fallback to heuristic
    }

    // Heuristic fallback
    const reply = agentHeuristic(agentId, message);
    appState.agentMemory.push({
        role: 'assistant',
        content: reply,
        ts: Date.now(),
        agent: agentId
    });

    appendAgentMsg(reply + '\n\n*(heuristic mode — connect Ollama for AI)*', 'ai');
    await generateAgentReceipt(agentId, message, reply);
}

/**
 * Heuristic AI fallback (runs offline)
 */
export function agentHeuristic(agentId, query) {
    const q = query.toLowerCase();
    const gini = computeGini(appState.state.tokens);

    if (agentId === 'oracle') {
        if (q.includes('proposal')) {
            return `Current proposals: ${Object.keys(appState.state.proposals).length}. Use Governance tab to create one.`;
        }
        if (q.includes('event')) {
            return `${appState.log.length} events in log + ${appState.archiveLog.length} archived. ` +
                `Bloom filter: ${bloomFilter.bits.filter(b => b).length}/1024 bits set.`;
        }
        return `Oracle: ${appState.log.length} events, ${appState.peers.size} peers. ` +
            `Bloom gossip active. BFT tolerance: f=${Math.floor(appState.peers.size / 3)}. ` +
            `Relay: ${appState.relayMode}.`;
    }

    if (agentId === 'analyst') {
        if (q.includes('gini')) {
            return `Gini: ${gini.toFixed(3)}. ${gini < 0.3 ? 'Distribution is equitable.' : 'Concentration detected.'}`;
        }
        return `Supply: ${Object.values(appState.state.tokens).reduce((s, v) => s + v, 0).toLocaleString()} SVGT. ` +
            `APR: 12%. Gas: 5 SVGT. Archive: ${appState.archiveLog.length} events pruned.`;
    }

    if (agentId === 'auditor') {
        if (q.includes('attack')) {
            return 'Top threats: 1) Sybil (DID+PoS), 2) Eclipse (TURN relay mitigates), 3) Gov capture (10% cap). PBKDF2 vault active.';
        }
        return 'v8.1 security: PBKDF2 vault, Web Worker VM sandbox, bloom gossip dedup, ' +
            'ethics gate on remote events, state-hash verification on sync, capability tokens with expiration.';
    }

    if (agentId === 'builder') {
        if (q.includes('worker') || q.includes('vm')) {
            return 'VM runs in a Web Worker sandbox — no DOM/network access. Gas limit: 100,000. Timeout: 5s hard kill.';
        }
        return 'Supported step types: compute, store, verify, emit, ai. Use DevKit > JSONFlow tab. Worker VM isolates execution.';
    }

    return 'Agent ready. Ask about governance, security, tokenomics, or workflows.';
}

/**
 * Generate verifiable AI receipt
 */
export async function generateAgentReceipt(agentId, input, output) {
    const receipt = {
        id: 'ar_' + Date.now(),
        agent: agentId,
        inputHash: await sha256(input),
        outputHash: await sha256(output),
        ts: new Date().toLocaleTimeString(),
        sig: appState.identity
            ? (await signData(appState.keypair.privateKey, await sha256(output))).slice(0, 32) + '…'
            : null
    };

    appState.agentReceipts.push(receipt);
    renderAgentReceipts();
}

/**
 * Append message to agent chat UI
 */
export function appendAgentMsg(content, type) {
    const el = document.getElementById('agent-chat');
    if (!el) return;

    const div = document.createElement('div');
    div.className = 'agent-bubble agent-' + (type === 'user' ? 'user' : type === 'ai' ? 'ai' : 'sys');
    div.textContent = content;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
}

/**
 * Render agent memory
 */
export function renderAgentMemory() {
    const el = document.getElementById('agent-memory');
    if (!el) return;

    const recent = appState.agentMemory.slice(-8);
    if (!recent.length) {
        el.innerHTML = '<div class="empty">No memories</div>';
        return;
    }

    el.innerHTML = recent.reverse().map(m => `
        <div style="padding:5px 8px;border-bottom:1px solid var(--border);font-size:9px">
            <span style="color:${m.role === 'user' ? 'var(--cyan)' : 'var(--violet)'}">${m.role}</span>
            <span style="color:var(--text3);float:right">${new Date(m.ts).toLocaleTimeString()}</span>
            <div style="color:var(--text2);margin-top:2px">${esc(m.content.slice(0, 60))}…</div>
        </div>
    `).join('');
}

/**
 * Render agent receipts
 */
export function renderAgentReceipts() {
    const el = document.getElementById('agent-receipts');
    if (!el) return;

    if (!appState.agentReceipts.length) {
        el.innerHTML = '<div class="empty">No receipts</div>';
        return;
    }

    el.innerHTML = appState.agentReceipts.slice(-8).reverse().map(r => `
        <div style="padding:7px 8px;border-bottom:1px solid var(--border);font-size:10px">
            <div style="display:flex;justify-content:space-between">
                <span style="color:var(--violet)">${esc(r.agent)}</span>
                <span style="color:var(--text3)">${r.ts}</span>
            </div>
            <div style="font-size:9px;color:var(--text3)">in: ${r.inputHash.slice(0, 12)}… → out: ${r.outputHash.slice(0, 12)}…</div>
            ${r.sig ? `<div style="font-size:9px;color:var(--green)">✓ signed: ${r.sig}</div>` : ''}
        </div>
    `).join('');
}

/**
 * Clear agent chat
 */
export function clearAgentChat() {
    const el = document.getElementById('agent-chat');
    if (el) el.innerHTML = '<div class="agent-bubble agent-sys">Chat cleared. Agents ready.</div>';
}

/**
 * Run system summary
 */
export async function agentSummary() {
    appendAgentMsg('Running system summary…', 'sys');

    const gini = computeGini(appState.state.tokens);
    const ethicsScore = Math.max(0, Math.round((1 - appState.ethicsLog.reduce((s, c) => s + c.violations, 0) / Math.max(1, appState.log.length)) * 100));

    appendAgentMsg(`SYSTEM SUMMARY\n${'─'.repeat(30)}\n` +
        `${getSubstrateContext()}\n` +
        `Health: ${appState.log.length > 0 ? 'OPERATIONAL' : 'IDLE'}\n` +
        `Gini: ${gini.toFixed(3)}\n` +
        `Ethics: ${ethicsScore}%\n` +
        `Blocks: ${appState.ledgerBlocks.length} sealed\n` +
        `Worker: ${appState.vmWorkerBusy ? 'BUSY' : 'idle'}\n` +
        `Bloom bits set: ${bloomFilter.bits.filter(b => b).length}/1024\n` +
        `Archived events: ${appState.archiveLog.length}\n` +
        `Capability tokens: ${appState.capabilityTokens.size}`, 'ai');
}

/**
 * Delegate task to agent
 */
export async function delegateTask(desc, assignee) {
    if (!desc) {
        notify('Enter task description', 'warn');
        return;
    }

    const task = {
        id: 'task_' + Date.now(),
        desc,
        assignee,
        status: 'running',
        ts: new Date().toLocaleTimeString()
    };

    appState.taskQueue.push(task);
    renderTaskQueue();

    setTimeout(async () => {
        task.status = 'done';
        task.result = agentHeuristic(assignee, desc).slice(0, 80) + '…';
        await generateAgentReceipt(assignee, desc, task.result);
        renderTaskQueue();
        notify('Task completed by ' + assignee, 'ok');
    }, 1500 + Math.random() * 2000);

    notify('Task delegated to ' + assignee);
}

/**
 * Render task queue
 */
export function renderTaskQueue() {
    const el = document.getElementById('task-queue');
    if (!el) return;

    if (!appState.taskQueue.length) {
        el.innerHTML = '<div class="empty">No tasks queued</div>';
        return;
    }

    el.innerHTML = appState.taskQueue.slice(-6).reverse().map(t => `
        <div style="padding:5px;border-bottom:1px solid var(--border);font-size:10px">
            <span style="color:${t.status === 'done' ? 'var(--green)' : 'var(--amber)'}">${t.status === 'done' ? '✓' : '⟳'}</span>
            <span style="color:var(--text2);margin-left:6px">${esc(t.desc.slice(0, 40))}</span>
            <div style="color:var(--text3);font-size:9px">${esc(t.assignee)} · ${t.ts}</div>
        </div>
    `).join('');
}
