/**
 * Task Due-Date Notification System — Navbar Bell
 * Shows a 🔔 bell icon in the navbar with a red badge count.
 * Clicking it opens a dropdown listing each due task + how soon it's due.
 *
 * Thresholds: 7 days · 24 hours · 1 hour · 30 minutes · 5 minutes
 * Uses localStorage to avoid re-firing the same alert for the same task+threshold.
 * Polls every 60 seconds.
 */

const TaskNotifications = (() => {
  const THRESHOLDS = [
    { label: '7 days',     ms: 7 * 24 * 60 * 60 * 1000 },
    { label: '24 hours',   ms: 24 * 60 * 60 * 1000      },
    { label: '1 hour',     ms: 60 * 60 * 1000            },
    { label: '30 minutes', ms: 30 * 60 * 1000            },
    { label: '5 minutes',  ms: 5 * 60 * 1000             },
  ];
  const WINDOW_MS = 90 * 1000;

  // In-memory list of active notifications (persists until page reload)
  let activeNotifs = [];

  function getSeenKey(taskId, label) {
    return `notif_seen_${taskId}_${label.replace(/\s+/g, '_')}`;
  }
  function hasSeen(taskId, label) {
    return localStorage.getItem(getSeenKey(taskId, label)) === '1';
  }
  function markSeen(taskId, label) {
    localStorage.setItem(getSeenKey(taskId, label), '1');
  }

  function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Inject the bell HTML into the navbar
  function injectBell() {
    const nav = document.querySelector('.navbar-nav');
    if (!nav || document.getElementById('notifBellBtn')) return;

    const li = document.createElement('li');
    li.className = 'nav-item dropdown';
    li.style.position = 'relative';
    li.innerHTML = `
      <button
        id="notifBellBtn"
        class="btn btn-link text-white p-1 position-relative"
        style="font-size:1.25rem; line-height:1; text-decoration:none;"
        data-bs-toggle="dropdown"
        data-bs-auto-close="outside"
        aria-expanded="false"
        aria-label="Notifications"
      >
        🔔
        <span
          id="notifBadge"
          class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger d-none"
          style="font-size:0.65rem;"
        >0</span>
      </button>
      <ul
        id="notifDropdown"
        class="dropdown-menu dropdown-menu-end p-2"
        style="min-width:280px; max-height:320px; overflow-y:auto;"
      >
        <li class="text-secondary small px-2 py-1" id="notifEmptyMsg">No upcoming due tasks.</li>
      </ul>
    `;
    nav.insertBefore(li, nav.firstChild);
  }

  function updateBellUI() {
    const badge    = document.getElementById('notifBadge');
    const dropdown = document.getElementById('notifDropdown');
    const empty    = document.getElementById('notifEmptyMsg');
    if (!badge || !dropdown) return;

    if (activeNotifs.length === 0) {
      badge.classList.add('d-none');
      if (empty) empty.style.display = '';
      // Clear all items except the empty msg
      Array.from(dropdown.querySelectorAll('.notif-item')).forEach(el => el.remove());
      return;
    }

    badge.textContent = activeNotifs.length > 99 ? '99+' : activeNotifs.length;
    badge.classList.remove('d-none');
    if (empty) empty.style.display = 'none';

    // Rebuild list
    Array.from(dropdown.querySelectorAll('.notif-item')).forEach(el => el.remove());
    activeNotifs.forEach(n => {
      const li = document.createElement('li');
      li.className = 'notif-item';
      li.innerHTML = `
        <div class="d-flex align-items-start gap-2 px-2 py-1 rounded hover-bg" style="cursor:default;">
          <span style="font-size:1rem; flex-shrink:0;">⏰</span>
          <div style="font-size:0.82rem; line-height:1.3;">
            <div class="fw-semibold">${escapeHtml(n.title)}</div>
            <div class="text-secondary">Due in <strong>${n.thresholdLabel}</strong></div>
          </div>
        </div>
      `;
      dropdown.appendChild(li);
    });
  }

  async function checkTasks() {
    try {
      const res = await fetch('/api/tasks', { headers: authHeaders() });
      if (!res.ok) return;
      const tasks = await res.json();
      const now = Date.now();
      const newNotifs = [];

      tasks.forEach(task => {
        if (!task.due_date || task.status === 'done') return;
        const dueMs = new Date(task.due_date).getTime();
        const msUntilDue = dueMs - now;
        if (msUntilDue < 0) return;

        // Find the tightest threshold that has been crossed
        let bestThreshold = null;
        THRESHOLDS.forEach(threshold => {
          const diff = msUntilDue - threshold.ms;
          if (diff >= -WINDOW_MS && diff <= WINDOW_MS) {
            if (!hasSeen(task.id, threshold.label)) {
              markSeen(task.id, threshold.label);
            }
            bestThreshold = threshold;
          }
        });

        // Collect any threshold that has been seen and is still relevant
        THRESHOLDS.forEach(threshold => {
          if (hasSeen(task.id, threshold.label) && msUntilDue <= threshold.ms + WINDOW_MS) {
            // Only show if within threshold window still
            if (msUntilDue <= threshold.ms + WINDOW_MS && msUntilDue >= 0) {
              // Use the smallest applicable threshold
              newNotifs.push({ title: task.title, thresholdLabel: threshold.label, taskId: task.id, ms: threshold.ms });
            }
          }
        });
      });

      // Deduplicate: keep only the most urgent threshold per task
      const byTask = {};
      newNotifs.forEach(n => {
        if (!byTask[n.taskId] || n.ms < byTask[n.taskId].ms) {
          byTask[n.taskId] = n;
        }
      });
      activeNotifs = Object.values(byTask);

      updateBellUI();
    } catch (err) {
      // Silently fail
    }
  }

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    injectBell();
    checkTasks();
    setInterval(checkTasks, 60 * 1000);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.navbar-nav')) {
    TaskNotifications.init();
    return;
  }

  document.addEventListener('app-navbar:ready', () => TaskNotifications.init(), { once: true });
});
