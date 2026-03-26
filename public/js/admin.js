/* ==========================================================================
   ADMIN.JS — Admin Dashboard Logic
   AtlasStresser UI System
   ========================================================================== */

/**
 * Admin Controller
 * Handles inline edit, save, ban/unban, and delete operations
 */

(function() {
  'use strict';

  // State
  let keysData = [];

  /**
   * Initialize admin dashboard
   */
  function init() {
    setupSearchFilter();
    loadKeys();
  }

  /**
   * Setup search filter
   */
  function setupSearchFilter() {
    const searchInput = document.getElementById('keySearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
      loadKeys();
    });
  }

  /**
   * Load keys from API
   */
  async function loadKeys() {
    try {
      const res = await fetch('/api/admin/keys');
      const data = await res.json();

      if (data.success) {
        keysData = data.keys;
        renderTable(data.keys);
        updateStats(data.keys);
      }
    } catch (err) {
      showAlert('error', 'Error loading keys: ' + err.message);
    }
  }

  /**
   * Render keys table
   */
  function renderTable(keys) {
    const tbody = document.getElementById('keysTableBody');
    if (!tbody) return;

    const searchTerm = document.getElementById('keySearch')?.value.toLowerCase() || '';
    const filtered = keys.filter(k => k.key.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No results.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((key) => {
      const originalIndex = keys.findIndex(k => k.key === key.key);
      const statusClass = key.status === 'active' ? 'status-running' : 'status-locked';
      const isVip = key.permission.includes('vip');
      const createdDate = new Date(key.created_at).toLocaleDateString();

      return `
        <tr>
          <td class="key-truncated">${escapeHtml(key.key.substring(0, 8))}...</td>
          <td>
            ${isVip 
              ? '<span class="perm-badge">VIP</span>' 
              : '<span class="perm-badge normal">Normal</span>'}
          </td>
          <td>
            <input 
              type="number" 
              class="input-inline" 
              value="${key.limits.max_time}" 
              data-index="${originalIndex}" 
              data-field="max_time" 
              min="0"
            >
          </td>
          <td>
            <input 
              type="number" 
              class="input-inline" 
              value="${key.limits.concurrent}" 
              data-index="${originalIndex}" 
              data-field="concurrent" 
              min="0"
            >
          </td>
          <td>
            <input 
              type="number" 
              class="input-inline" 
              value="${key.limits.cooldown}" 
              data-index="${originalIndex}" 
              data-field="cooldown" 
              min="0"
            >
          </td>
          <td>
            <span class="status-pill ${statusClass}">
              ${key.status.toUpperCase()}
            </span>
          </td>
          <td class="text-muted">${createdDate}</td>
          <td>
            <div class="action-buttons">
              <button 
                class="action-btn toggle" 
                onclick="window.toggleStatus('${escapeHtml(key.key)}')"
                title="${key.status === 'active' ? 'Lock' : 'Unlock'}"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  ${key.status === 'active' 
                    ? '<path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />'
                    : '<path stroke-linecap="round" stroke-linejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />'}
                </svg>
              </button>
              <button 
                class="action-btn delete" 
                onclick="window.deleteKey('${escapeHtml(key.key)}')"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Update stats display
   */
  function updateStats(keys) {
    const totalEl = document.getElementById('totalKeys');
    const activeEl = document.getElementById('activeKeys');
    const lockedEl = document.getElementById('lockedKeys');
    const vipEl = document.getElementById('vipKeys');

    if (totalEl) totalEl.textContent = keys.length;
    if (activeEl) activeEl.textContent = keys.filter(k => k.status === 'active').length;
    if (lockedEl) lockedEl.textContent = keys.filter(k => k.status === 'locked').length;
    if (vipEl) vipEl.textContent = keys.filter(k => k.permission.includes('vip')).length;
  }

  /**
   * Save all changes
   */
  async function saveAll() {
    const inputs = document.querySelectorAll('#keysTableBody input');
    let updated = 0;
    let errors = 0;

    // Collect all input values
    for (const input of inputs) {
      const index = parseInt(input.dataset.index);
      const field = input.dataset.field;
      const value = parseInt(input.value) || 0;

      if (keysData[index]) {
        keysData[index].limits[field] = value;
      }
    }

    // Save each key
    for (const key of keysData) {
      try {
        const res = await fetch('/api/admin/update-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: key.key,
            max_time: key.limits.max_time,
            concurrent: key.limits.concurrent,
            cooldown: key.limits.cooldown,
            status: key.status
          })
        });

        const data = await res.json();

        if (data.success) {
          updated++;
        } else {
          errors++;
        }
      } catch (err) {
        errors++;
      }
    }

    if (errors === 0) {
      showAlert('info', `Saved ${updated} keys successfully`);
    } else {
      showAlert('error', `Saved ${updated} keys, ${errors} failed`);
    }
    
    loadKeys();
  }

  /**
   * Toggle key status (active/locked)
   */
  async function toggleStatus(key) {
    const keyData = keysData.find(k => k.key === key);
    if (!keyData) {
      showAlert('error', 'Key not found');
      return;
    }

    const newStatus = keyData.status === 'active' ? 'locked' : 'active';

    try {
      const res = await fetch('/api/admin/update-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: key,
          max_time: keyData.limits.max_time,
          concurrent: keyData.limits.concurrent,
          cooldown: keyData.limits.cooldown,
          status: newStatus
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert('info', `Key ${newStatus === 'active' ? 'activated' : 'locked'}`);
        loadKeys();
      } else {
        showAlert('error', data.message || 'Failed to update status');
      }
    } catch (err) {
      showAlert('error', 'Error: ' + err.message);
    }
  }

  /**
   * Delete a key
   */
  async function deleteKey(key) {
    if (!confirm(`Delete key ${key.substring(0, 8)}...? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/delete-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });

      const data = await res.json();

      if (data.success) {
        showAlert('info', 'Key deleted successfully');
        loadKeys();
      } else {
        showAlert('error', data.message || 'Failed to delete key');
      }
    } catch (err) {
      showAlert('error', 'Error: ' + err.message);
    }
  }

  /**
   * Show alert message
   */
  function showAlert(type, message) {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.admin-dashboard > .alert');
    existingAlerts.forEach(a => a.remove());

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.style.marginBottom = '20px';
    alert.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>${escapeHtml(message)}</span>
    `;

    const dashboard = document.querySelector('.admin-dashboard');
    if (dashboard) {
      dashboard.insertBefore(alert, dashboard.firstChild);
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        alert.remove();
      }, 5000);
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose global functions
  window.loadKeys = loadKeys;
  window.saveAll = saveAll;
  window.toggleStatus = toggleStatus;
  window.deleteKey = deleteKey;
  window.initAdmin = init;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
