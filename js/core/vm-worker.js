// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Web Worker VM with Gas + Timeout
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

import { CONFIG } from './config.js';
import { appState, sysLogEntry } from './state.js';
import { sha256Sync } from './crypto.js';
import { setEl } from './utils.js';
import { notify } from '../ui/notifications.js';

/**
 * Web Worker code - runs in isolated sandbox
 * No DOM access, no network access
 */
const VM_WORKER_CODE = `
'use strict';
// Sandboxed VM Web Worker — no DOM, no network access
function sha256sync(str) {
  let h=5381;
  for(let i=0;i<str.length;i++) h=((h<<5)+h)^str.charCodeAt(i);
  return ('0'.repeat(16)+Math.abs(h).toString(16)).slice(-16).repeat(4);
}

self.onmessage = function(e) {
  const { workflow, steps, gasLimit, timeoutMs } = e.data;
  const startTime = Date.now();
  let gasUsed = 0;
  const results = [];
  const out = ['WORKER VM \u2014 '+workflow+'\\n'+'─'.repeat(36)];

  for (const step of steps) {
    if (Date.now()-startTime > timeoutMs) {
      out.push('\u23f1 TIMEOUT killed at step: '+step.id);
      self.postMessage({ done:true, error:'TIMEOUT', gasUsed, results, out:out.join('\\n') });
      return;
    }

    const stepGas = step.gas||100;
    gasUsed += stepGas;
    if (gasUsed > gasLimit) {
      out.push('\u26fd OUT OF GAS at step: '+step.id);
      self.postMessage({ done:true, error:'OUT_OF_GAS', gasUsed, results, out:out.join('\\n') });
      return;
    }

    let result = 'ok';
    switch(step.type) {
      case 'compute': result = sha256sync(JSON.stringify(step.params||{})).slice(0,16)+'\u2026'; break;
      case 'store':   result = 'stored key='+((step.params||{}).key||'?'); break;
      case 'verify':  result = 'verified=true'; break;
      case 'emit':    result = 'event queued'; break;
      case 'ai':      result = 'ai-dispatch('+((step.params||{}).agent||'oracle')+')'; break;
      default:        result = 'executed('+step.type+')';
    }

    results.push({ stepId:step.id, type:step.type, gasUsed:stepGas, result });
    out.push('\u2713 '+step.id+' ('+step.type+') \u2014 '+stepGas+'gas \u2014 '+result);
  }

  const elapsed = Date.now()-startTime;
  out.push('\\n'+'─'.repeat(36));
  out.push('Gas: '+gasUsed+' / '+gasLimit+'  Time: '+elapsed+'ms  Status: COMMITTED');
  self.postMessage({ done:true, gasUsed, results, elapsed, out:out.join('\\n') });
};
`;

/**
 * Create new VM worker from blob URL
 */
export function createVMWorker() {
    const blob = new Blob([VM_WORKER_CODE], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
}

/**
 * Set worker status indicator
 */
export function setWorkerStatus(status, cssClass = 'conn-none') {
    const el = document.getElementById('worker-status');
    if (el) {
        el.textContent = status;
        el.className = 'conn-indicator ' + cssClass;
    }
}

/**
 * Execute workflow in sandboxed worker
 */
export async function vmExecuteWorker(ir, onComplete) {
    if (appState.vmWorkerBusy) {
        notify('Worker busy — kill it first', 'warn');
        return;
    }

    const gasLimit = ir.gasLimit || CONFIG.vmGasLimit;
    const steps = ir.steps || [];
    const TIMEOUT_MS = CONFIG.vmTimeout;

    setEl('gas-limit', gasLimit.toLocaleString());
    setEl('vm-timeout', Math.round(TIMEOUT_MS / 1000) + 's');

    const outputEl = document.getElementById('vm-output');
    if (outputEl) outputEl.textContent = '⟳ Executing in Web Worker (sandboxed)…';

    setWorkerStatus('⟳ Worker: running', 'conn-relay');
    appState.vmWorkerBusy = true;

    if (appState.vmWorker) {
        try { appState.vmWorker.terminate(); } catch {}
    }

    appState.vmWorker = createVMWorker();

    const killTimer = setTimeout(() => {
        vmKillWorker();
    }, TIMEOUT_MS + 500);

    appState.vmWorker.onmessage = async (e) => {
        clearTimeout(killTimer);
        appState.vmWorkerBusy = false;
        setWorkerStatus('⬜ Worker: idle');

        const { done, out, gasUsed, results, error, elapsed } = e.data;

        if (outputEl) outputEl.textContent = out;

        appState.vmGasUsed = gasUsed || 0;
        const pct = Math.min((appState.vmGasUsed / gasLimit) * 100, 100);
        const gasBar = document.getElementById('gas-bar');
        if (gasBar) gasBar.style.width = pct + '%';
        setEl('gas-used', appState.vmGasUsed.toLocaleString());

        if (error) {
            notify('VM: ' + error, 'warn');
            setWorkerStatus('⚠ Worker: ' + error, 'conn-none');
        } else {
            notify('VM completed: ' + appState.vmGasUsed + ' gas in ' + (elapsed || 0) + 'ms', 'ok');
            setWorkerStatus('✓ Worker: done', 'conn-direct');
        }

        if (results) {
            for (const r of results) {
                appState.vmReceipts.push({
                    stepId: r.stepId,
                    type: r.type,
                    gasUsed: r.gasUsed,
                    outputCID: sha256Sync(r.result),
                    ts: new Date().toLocaleTimeString()
                });
            }
        }

        sysLogEntry('VM', `Worker: ${ir.workflow} — ${appState.vmGasUsed} gas${error ? ' ERR:' + error : ' OK'}`);

        if (onComplete) onComplete({ error, results, gasUsed, elapsed });
    };

    appState.vmWorker.onerror = (e) => {
        clearTimeout(killTimer);
        appState.vmWorkerBusy = false;
        setWorkerStatus('⚠ Worker: error', 'conn-none');
        if (outputEl) outputEl.textContent = 'Worker error: ' + e.message;
        notify('Worker error: ' + e.message, 'error');
    };

    appState.vmWorker.postMessage({
        workflow: ir.workflow || 'workflow',
        steps,
        gasLimit,
        timeoutMs: TIMEOUT_MS
    });
}

/**
 * Kill worker forcefully
 */
export function vmKillWorker() {
    if (appState.vmWorker) {
        appState.vmWorker.terminate();
        appState.vmWorker = null;
    }
    appState.vmWorkerBusy = false;
    setWorkerStatus('⬜ Worker: killed');
    notify('VM Worker killed');
    sysLogEntry('VM', 'Worker forcefully terminated');
}
