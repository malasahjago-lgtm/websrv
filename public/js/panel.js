/* ==========================================================================
   PANEL.JS — User Panel Logic
   AtlasStresser UI System
   ========================================================================== */

/**
 * Panel Controller
 * Handles attack form, slider, and real-time attacks table
 */

(function() {
  'use strict';

  // State
  let attacksPollingInterval = null;
  let isLocked = false;
  let limits = {};

  /**
   * Initialize panel
   */
  function init() {
    setupSlider();
    setupAttackForm();
    setupSearchFilter();
    startPolling();
  }

  /**
   * Setup concurrent slider
   */
  function setupSlider() {
    const slider = document.getElementById('concurrent');
    const valueDisplay = document.getElementById('concurrentValue');

    if (!slider || !valueDisplay) return;

    slider.addEventListener('input', () => {
      valueDisplay.textContent = `${slider.value}/${slider.max}`;
    });
  }

  /**
   * Setup attack form submission
   */
  function setupAttackForm() {
    const form = document.getElementById('attackForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (isLocked) {
        showAlert('warning', 'Your key is locked. Contact administrator to activate.');
        return;
      }

      const target = document.getElementById('target').value;
      const port = document.getElementById('port').value;
      const time = parseInt(document.getElementById('time').value);
      const method = document.getElementById('method').value;
      const concurrent = parseInt(document.getElementById('concurrent')?.value || 1);

      if (!method) {
        showAlert('error', 'Please select a method');
        return;
      }

      if (time > limits.max_time) {
        showAlert('error', `Duration exceeds limit. Max: ${limits.max_time}s`);
        return;
      }

      try {
        const res = await fetch('/api/start-attack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target, port, time, method, concurrent })
        });

        const data = await res.json();

        if (data.success) {
          showAlert('info', 'Attack started successfully');
          loadAttacks();
        } else {
          showAlert('error', data.message || 'Failed to start attack');
        }
      } catch (err) {
        showAlert('error', 'Error: ' + err.message);
      }
    });
  }

  /**
   * Setup search filter for attacks table
   */
  function setupSearchFilter() {
    const searchInput = document.getElementById('attackSearch');
    if (!searchInput) return;

    searchInput.addEventListener('input', () => {
      loadAttacks();
    });
  }

  /**
   * Load attacks from API
   */
  async function loadAttacks() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.success) {
        renderAttacks(data.attacks);
      }
    } catch (err) {
      console.error('Failed to load attacks:', err);
    }
  }

  /**
   * Render attacks table
   */
  function renderAttacks(attacks) {
    const tbody = document.getElementById('attacksTableBody');
    if (!tbody) return;

    const searchTerm = document.getElementById('attackSearch')?.value.toLowerCase() || '';
    const filtered = attacks.filter(a => a.target.toLowerCase().includes(searchTerm));

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No running attacks</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(attack => {
      const startTime = new Date(attack.start_time);
      const endTime = new Date(startTime.getTime() + attack.time * 1000);
      const now = new Date();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      
      return `
        <tr>
          <td class="mono">${attack.attack_id}</td>
          <td class="mono">${attack.target}</td>
          <td class="mono">${attack.port}</td>
          <td class="mono">${attack.method}</td>
          <td class="mono">${formatTime(remaining)}</td>
          <td><span class="status-pill status-running">Running</span></td>
          <td>
            <button class="btn btn-danger btn-small btn-icon" onclick="window.stopAttack('${attack.attack_id}')">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /**
   * Format time as MM:SS
   */
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Stop a single attack
   */
  async function stopAttack(attackId) {
    try {
      const res = await fetch('/api/stop-attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attack_id: attackId })
      });

      const data = await res.json();

      if (data.success) {
        loadAttacks();
      } else {
        showAlert('error', data.message || 'Failed to stop attack');
      }
    } catch (err) {
      showAlert('error', 'Error: ' + err.message);
    }
  }

  /**
   * Stop all attacks
   */
  async function stopAllAttacks() {
    const tbody = document.getElementById('attacksTableBody');
    if (!tbody) return;

    const rows = tbody.querySelectorAll('tr');
    if (rows.length <= 1 || rows[0].querySelector('.table-empty')) {
      return;
    }

    if (!confirm('Stop all running attacks?')) return;

    const attackIds = [];
    rows.forEach(row => {
      const stopBtn = row.querySelector('button[onclick^="window.stopAttack"]');
      if (stopBtn) {
        const match = stopBtn.getAttribute('onclick').match(/stopAttack\('([^']+)'\)/);
        if (match) {
          attackIds.push(match[1]);
        }
      }
    });

    for (const id of attackIds) {
      await stopAttack(id);
    }
    
    loadAttacks();
  }

  /**
   * Show alert message
   */
  function showAlert(type, message) {
    const existingAlert = document.querySelector('.card-body .alert');
    if (existingAlert) existingAlert.remove();

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>${message}</span>
    `;

    const form = document.getElementById('attackForm');
    if (form) {
      form.insertBefore(alert, form.firstChild);
      
      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        alert.remove();
      }, 5000);
    }
  }

  /**
   * Start polling for attacks
   */
  function startPolling() {
    loadAttacks();
    attacksPollingInterval = setInterval(loadAttacks, 3000);
  }

  /**
   * Stop polling
   */
  function stopPolling() {
    if (attacksPollingInterval) {
      clearInterval(attacksPollingInterval);
      attacksPollingInterval = null;
    }
  }

  // Expose global functions
  window.loadAttacks = loadAttacks;
  window.stopAttack = stopAttack;
  window.stopAllAttacks = stopAllAttacks;
  window.initPanel = init;

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', stopPolling);
})();
