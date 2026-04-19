(function () {
  const APP_NAME = 'Task Tracker 0.0.2';
  const TEAM_NAME = 'Team Choo Choo Trains';

  const links = [
    { label: 'Home', href: '/' },
    { label: 'Tasks', href: '/pages/kanban.html' },
  ];
  const SERVICE_STATUS_INTERVAL_MS = 30000;
  const SERVICE_STATUS_HISTORY_LIMIT = 24;
  const SERVICE_STATUS_HISTORY_KEY = 'service_status_history';
  const SERVICE_STATUS_HISTORY_BUILD_KEY = 'service_status_history_build_key';
  let serviceStatusTimer = null;
  let serviceStatusRequestInFlight = false;

  function isActivePath(href) {
    const path = window.location.pathname.replace(/\/index\.html$/, '/');
    return path === href || (href !== '/' && path.endsWith(href));
  }

  function createNavLink({ label, href }) {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const a = document.createElement('a');
    a.className = `btn btn-sm fw-semibold ${isActivePath(href) ? 'btn-light' : 'btn-outline-light'}`;
    a.href = href;
    a.textContent = label;

    li.appendChild(a);
    return li;
  }

  function createAuthLink(label, href) {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const a = document.createElement('a');
    a.className = `btn btn-sm fw-semibold ${isActivePath(href) ? 'btn-light' : 'btn-outline-light'}`;
    a.href = href;
    a.textContent = label;

    li.appendChild(a);
    return li;
  }

  function createLoginButton() {
    const li = document.createElement('li');
    li.className = 'nav-item';

    const button = document.createElement('button');
    button.className = 'btn btn-light btn-sm fw-semibold';
    button.type = 'button';
    button.textContent = 'Login';
    button.addEventListener('click', openLoginModal);

    li.appendChild(button);
    return li;
  }

  function createTeamItem() {
    const li = document.createElement('li');
    li.className = 'nav-item ms-lg-2';

    const span = document.createElement('span');
    span.className = 'navbar-text text-white-50';
    span.textContent = TEAM_NAME;

    li.appendChild(span);
    return li;
  }

  function createUserItem(user) {
    const li = document.createElement('li');
    li.className = 'nav-item d-flex align-items-center gap-2 ms-lg-3';

    const greeting = document.createElement('span');
    greeting.className = 'text-white fw-semibold';
    greeting.textContent = `Hello, ${user.username}`;

    const logout = document.createElement('button');
    logout.className = 'btn btn-sm btn-outline-danger';
    logout.type = 'button';
    logout.textContent = 'Logout';
    logout.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    });

    li.append(greeting, logout);
    return li;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function getCurrentUser() {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
      const res = await fetch('/api/auth/get-user', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return null;
      }

      const data = await res.json();
      localStorage.setItem('user', JSON.stringify(data.user));
      return data.user;
    } catch {
      try {
        return JSON.parse(localStorage.getItem('user'));
      } catch {
        return null;
      }
    }
  }

  function buildNavbar(user) {
    const nav = document.createElement('nav');
    nav.className = 'navbar navbar-expand-lg navbar-dark bg-primary shadow-sm';
    nav.innerHTML = `
      <div class="container">
        <a class="navbar-brand fw-bold" href="/">${APP_NAME}</a>
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#mainNavbar"
          aria-controls="mainNavbar"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse justify-content-end" id="mainNavbar">
          <ul class="navbar-nav align-items-lg-center gap-2"></ul>
        </div>
      </div>
    `;

    const list = nav.querySelector('.navbar-nav');
    links.forEach((link) => list.appendChild(createNavLink(link)));

    if (user) {
      list.appendChild(createUserItem(user));
    } else {
      list.appendChild(createLoginButton());
      list.appendChild(createAuthLink('Register', '/pages/register.html'));
    }

    const statusItem = document.createElement('li');
    statusItem.className = 'nav-item';
    statusItem.innerHTML = '<button class="btn btn-outline-light btn-sm fw-semibold" type="button" id="serviceStatusBtn">Service Status</button>';
    statusItem.querySelector('button').addEventListener('click', openServiceStatusModal);
    list.appendChild(statusItem);
    list.appendChild(createTeamItem());

    return nav;
  }

  function serviceBadge(status) {
    const classes = {
      ok: 'text-bg-success',
      missing: 'text-bg-warning',
      error: 'text-bg-danger',
      loading: 'text-bg-secondary',
    };
    return `<span class="badge ${classes[status] || 'text-bg-secondary'}">${status}</span>`;
  }

  function renderServiceRow(label, service) {
    const responseTime = Number.isFinite(service.responseTimeMs)
      ? `${service.responseTimeMs} ms`
      : 'Unavailable';

    return `
      <div class="list-group-item">
        <div class="d-flex justify-content-between align-items-start gap-3">
          <div>
            <div class="fw-semibold">${escapeHtml(label)}</div>
            <div class="text-secondary small">${escapeHtml(service.message || 'No status message')}</div>
          </div>
          <div class="text-end flex-shrink-0">
            ${serviceBadge(service.status)}
            <div class="text-secondary small mt-1">${responseTime}</div>
          </div>
        </div>
      </div>
    `;
  }

  function getStatusHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(SERVICE_STATUS_HISTORY_KEY));
      return Array.isArray(history) ? history : [];
    } catch {
      return [];
    }
  }

  function saveStatusHistory(history) {
    localStorage.setItem(
      SERVICE_STATUS_HISTORY_KEY,
      JSON.stringify(history.slice(-SERVICE_STATUS_HISTORY_LIMIT))
    );
  }

  function resetStatusHistoryForBuild(statusHistoryKey) {
    if (!statusHistoryKey) return;

    const previousKey = localStorage.getItem(SERVICE_STATUS_HISTORY_BUILD_KEY);
    if (previousKey === statusHistoryKey) return;

    localStorage.setItem(SERVICE_STATUS_HISTORY_BUILD_KEY, statusHistoryKey);
    localStorage.removeItem(SERVICE_STATUS_HISTORY_KEY);
  }

  function addStatusHistorySample(data) {
    resetStatusHistoryForBuild(data.statusHistoryKey);
    const history = getStatusHistory();
    history.push({
      checkedAt: data.checkedAt,
      database: {
        status: data.services.database.status,
        responseTimeMs: data.services.database.responseTimeMs,
      },
      googleMaps: {
        status: data.services.googleMaps.status,
        responseTimeMs: data.services.googleMaps.responseTimeMs,
      },
    });
    saveStatusHistory(history);
  }

  function statusColor(status) {
    if (status === 'ok') return '#198754';
    if (status === 'missing') return '#ffc107';
    return '#dc3545';
  }

  function renderHistoryBar(serviceKey, label) {
    const history = getStatusHistory();
    if (history.length === 0) {
      return `
        <div class="mb-3">
          <div class="d-flex justify-content-between small mb-1">
            <span class="fw-semibold">${escapeHtml(label)}</span>
            <span class="text-secondary">No samples yet</span>
          </div>
          <div class="progress" style="height:1rem;">
            <div class="progress-bar bg-secondary" style="width:100%;">Waiting for data</div>
          </div>
        </div>
      `;
    }

    const width = 100 / history.length;
    const segments = history.map((sample) => {
      const service = sample[serviceKey];
      const title = `${label}: ${service.status} at ${new Date(sample.checkedAt).toLocaleTimeString()}`;
      const bgClass = service.status === 'ok'
        ? 'bg-success'
        : service.status === 'missing'
          ? 'bg-warning'
          : 'bg-danger';
      return `<div class="progress-bar ${bgClass}" style="width:${width}%;" title="${escapeHtml(title)}"></div>`;
    }).join('');

    const latest = history[history.length - 1][serviceKey];
    return `
      <div class="mb-3">
        <div class="d-flex justify-content-between small mb-1">
          <span class="fw-semibold">${escapeHtml(label)}</span>
          <span class="text-secondary">${escapeHtml(latest.status)} &middot; ${latest.responseTimeMs} ms</span>
        </div>
        <div class="progress" style="height:1rem;">${segments}</div>
      </div>
    `;
  }

  function renderLatencyChart() {
    const history = getStatusHistory();
    if (history.length < 2) {
      return '<div class="text-secondary small border rounded p-3 bg-light">Latency graph appears after two status checks.</div>';
    }

    const width = 520;
    const height = 150;
    const padding = 24;
    const values = history.flatMap((sample) => [
      sample.database.responseTimeMs || 0,
      sample.googleMaps.responseTimeMs || 0,
    ]);
    const maxMs = Math.max(100, ...values);
    const xStep = (width - padding * 2) / Math.max(1, history.length - 1);

    function pointsFor(serviceKey) {
      return history.map((sample, index) => {
        const value = sample[serviceKey].responseTimeMs || 0;
        const x = padding + index * xStep;
        const y = height - padding - (value / maxMs) * (height - padding * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
    }

    const last = history[history.length - 1];
    return `
      <div class="border rounded p-2 bg-light">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Service latency history graph" style="width:100%; height:150px;">
          <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#dee2e6" />
          <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#dee2e6" />
          <text x="${padding}" y="14" fill="#6c757d" font-size="12">${maxMs} ms</text>
          <text x="${width - padding}" y="${height - 6}" text-anchor="end" fill="#6c757d" font-size="12">${new Date(last.checkedAt).toLocaleTimeString()}</text>
          <polyline fill="none" stroke="#0d6efd" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pointsFor('database')}" />
          <polyline fill="none" stroke="#6f42c1" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pointsFor('googleMaps')}" />
        </svg>
        <div class="d-flex gap-3 small mt-2">
          <span><span class="badge bg-primary">&nbsp;</span> Database</span>
          <span><span class="badge" style="background:#6f42c1;">&nbsp;</span> Google Maps</span>
        </div>
      </div>
    `;
  }

  function renderStatusHistory() {
    const container = document.getElementById('serviceStatusHistory');
    if (!container) return;
    const history = getStatusHistory();
    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="fw-semibold">Status History</div>
        <div class="text-secondary small">${history.length}/${SERVICE_STATUS_HISTORY_LIMIT} samples &middot; every ${SERVICE_STATUS_INTERVAL_MS / 1000}s</div>
      </div>
      ${renderHistoryBar('database', 'Database')}
      ${renderHistoryBar('googleMaps', 'Google Maps API')}
      ${renderLatencyChart()}
    `;
  }

  function buildServiceStatusModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'serviceStatusModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'serviceStatusModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="serviceStatusModalLabel">Service Status</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div>
                <div class="fw-semibold" id="serviceStatusSummary">Checking services...</div>
                <div class="text-secondary small" id="serviceStatusCheckedAt">Last checked: pending</div>
                <div class="text-secondary small" id="serviceStatusAutoRefresh">Auto refresh: every ${SERVICE_STATUS_INTERVAL_MS / 1000} seconds while open</div>
              </div>
              <button type="button" class="btn btn-sm btn-outline-primary" id="serviceStatusRefreshBtn">Refresh</button>
            </div>
            <div class="list-group" id="serviceStatusList">
              ${renderServiceRow('Database', { status: 'loading', message: 'Checking connection', responseTimeMs: null })}
              ${renderServiceRow('Google Maps API', { status: 'loading', message: 'Checking API reachability', responseTimeMs: null })}
            </div>
            <hr class="my-4" />
            <div id="serviceStatusHistory"></div>
          </div>
        </div>
      </div>
    `;

    return modal;
  }

  function ensureServiceStatusModal() {
    let modal = document.getElementById('serviceStatusModal');
    if (!modal) {
      modal = buildServiceStatusModal();
      document.body.appendChild(modal);
      document.getElementById('serviceStatusRefreshBtn').addEventListener('click', refreshServiceStatus);
      modal.addEventListener('shown.bs.modal', startServiceStatusTracking);
      modal.addEventListener('hidden.bs.modal', stopServiceStatusTracking);
      renderStatusHistory();
    }
    return modal;
  }

  function setServiceStatusLoading() {
    document.getElementById('serviceStatusSummary').textContent = 'Checking services...';
    document.getElementById('serviceStatusCheckedAt').textContent = 'Last checked: pending';
    document.getElementById('serviceStatusList').innerHTML = `
      ${renderServiceRow('Database', { status: 'loading', message: 'Checking connection', responseTimeMs: null })}
      ${renderServiceRow('Google Maps API', { status: 'loading', message: 'Checking API reachability', responseTimeMs: null })}
    `;
  }

  async function refreshServiceStatus() {
    if (serviceStatusRequestInFlight) return;
    const refreshBtn = document.getElementById('serviceStatusRefreshBtn');
    serviceStatusRequestInFlight = true;
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Checking...';
    setServiceStatusLoading();

    try {
      const res = await fetch('/api/service-status');
      const data = await res.json();
      document.getElementById('serviceStatusSummary').textContent =
        data.status === 'ok' ? 'All tracked services are operational.' : 'One or more services need attention.';
      document.getElementById('serviceStatusCheckedAt').textContent =
        `Last checked: ${new Date(data.checkedAt).toLocaleString()}`;
      document.getElementById('serviceStatusList').innerHTML = `
        ${renderServiceRow('Database', data.services.database)}
        ${renderServiceRow('Google Maps API', data.services.googleMaps)}
      `;
      addStatusHistorySample(data);
      renderStatusHistory();
    } catch (err) {
      document.getElementById('serviceStatusSummary').textContent = 'Unable to load service status.';
      document.getElementById('serviceStatusCheckedAt').textContent = 'Last checked: failed';
      document.getElementById('serviceStatusList').innerHTML = `
        ${renderServiceRow('Status API', { status: 'error', message: err.message, responseTimeMs: null })}
      `;
    } finally {
      serviceStatusRequestInFlight = false;
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Refresh';
    }
  }

  function startServiceStatusTracking() {
    refreshServiceStatus();
    if (serviceStatusTimer) return;
    serviceStatusTimer = setInterval(refreshServiceStatus, SERVICE_STATUS_INTERVAL_MS);
  }

  function stopServiceStatusTracking() {
    clearInterval(serviceStatusTimer);
    serviceStatusTimer = null;
  }

  function openServiceStatusModal() {
    const modal = ensureServiceStatusModal();
    if (window.bootstrap) {
      window.bootstrap.Modal.getOrCreateInstance(modal).show();
    }
    startServiceStatusTracking();
  }

  function buildLoginModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'loginModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'loginModalLabel');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="loginModalLabel">Sign in</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <form id="navbarLoginForm" novalidate>
            <div class="modal-body">
              <div class="alert alert-danger d-none" id="navbarLoginError" role="alert">
                Invalid email or password.
              </div>
              <div class="mb-3">
                <label for="navbarLoginEmail" class="form-label">Email</label>
                <input type="email" class="form-control" id="navbarLoginEmail" autocomplete="email" required />
                <div class="invalid-feedback">Please enter a valid email.</div>
              </div>
              <div class="mb-0">
                <label for="navbarLoginPassword" class="form-label">Password</label>
                <input type="password" class="form-control" id="navbarLoginPassword" autocomplete="current-password" required />
                <div class="invalid-feedback">Please enter your password.</div>
              </div>
            </div>
            <div class="modal-footer d-flex justify-content-between">
              <a href="/pages/register.html" class="small">Create an account</a>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="submit" class="btn btn-primary" id="navbarLoginSubmit">Log in</button>
              </div>
            </div>
          </form>
        </div>
      </div>
    `;

    return modal;
  }

  function ensureLoginModal() {
    let modal = document.getElementById('loginModal');
    if (!modal) {
      modal = buildLoginModal();
      document.body.appendChild(modal);
      attachLoginFormHandler();
    }
    return modal;
  }

  function openLoginModal() {
    const modal = ensureLoginModal();
    if (!window.bootstrap) {
      window.location.href = '/?login=1';
      return;
    }
    window.bootstrap.Modal.getOrCreateInstance(modal).show();
  }

  async function apiLogin(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  }

  function attachLoginFormHandler() {
    const form = document.getElementById('navbarLoginForm');
    const email = document.getElementById('navbarLoginEmail');
    const password = document.getElementById('navbarLoginPassword');
    const error = document.getElementById('navbarLoginError');
    const submit = document.getElementById('navbarLoginSubmit');
    if (!form || form.dataset.bound === 'true') return;

    form.dataset.bound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.classList.add('d-none');

      const emailValid = email.value.trim() && /\S+@\S+\.\S+/.test(email.value);
      const passwordValid = Boolean(password.value);
      email.classList.toggle('is-invalid', !emailValid);
      password.classList.toggle('is-invalid', !passwordValid);
      if (!emailValid || !passwordValid) return;

      submit.disabled = true;
      submit.textContent = 'Signing in...';

      try {
        const data = await apiLogin(email.value.trim(), password.value);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
        await renderNavbar();
        window.location.reload();
      } catch {
        error.classList.remove('d-none');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Log in';
      }
    });
  }

  async function renderNavbar() {
    const mount = document.querySelector('[data-app-navbar]');
    if (!mount) return;

    const user = await getCurrentUser();
    mount.replaceChildren(buildNavbar(user));
    ensureLoginModal();
    ensureServiceStatusModal();
    document.dispatchEvent(new CustomEvent('app-navbar:ready'));

    if (new URLSearchParams(window.location.search).get('login') === '1' && !user) {
      openLoginModal();
    }
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-login-trigger]');
    if (!trigger) return;
    event.preventDefault();
    openLoginModal();
  });

  document.addEventListener('app-login-required', openLoginModal);
  window.AppNavbar = { openLogin: openLoginModal };

  document.addEventListener('DOMContentLoaded', renderNavbar);
})();
