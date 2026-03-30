// ══════════════════════════════════════════════════════════════════════════
// SOVEREIGN OS v8.1.0 — Tab Navigation Manager
// Browser-safe ES Module
// ══════════════════════════════════════════════════════════════════════════

let currentTab = 'kernel';
let tabChangeCallbacks = [];

/**
 * Switch to specified tab
 */
export function switchTab(name) {
    currentTab = name;

    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === name);
    });

    // Update tab panes
    document.querySelectorAll('.tab-pane').forEach(p => {
        p.classList.toggle('active', p.id === 'tab-' + name);
    });

    // Call registered callbacks
    tabChangeCallbacks.forEach(cb => cb(name));
}

/**
 * Get current tab name
 */
export function getCurrentTab() {
    return currentTab;
}

/**
 * Register callback for tab changes
 */
export function onTabChange(callback) {
    tabChangeCallbacks.push(callback);
}

/**
 * Toggle section collapse
 */
export function toggleSection(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector('.sec-chevron');

    if (body) {
        const isVisible = body.style.display !== 'none';
        body.style.display = isVisible ? 'none' : '';
        if (chevron) {
            chevron.textContent = isVisible ? '▶' : '▼';
        }
    }
}

/**
 * Initialize tab system
 */
export function initTabs() {
    // Setup tab click handlers
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            if (name) switchTab(name);
        });
    });

    // Setup mobile bottom bar
    document.querySelectorAll('.mob-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const name = tab.dataset.tab;
            if (name) switchTab(name);
        });
    });
}
