(function () {
  const statusLabels = {
    backlog: 'Backlog',
    'in-progress': 'In Progress',
    review: 'Review',
    done: 'Done',
  };

  const statusBadgeClass = {
    backlog: 'text-bg-secondary',
    'in-progress': 'text-bg-primary',
    review: 'text-bg-warning',
    done: 'text-bg-success',
  };

  const priorityBadgeClass = {
    low: 'text-bg-secondary',
    medium: 'text-bg-warning',
    high: 'text-bg-danger',
  };

  let map;
  let infoWindow;
  let AdvancedMarkerElement;
  let tasks = [];
  const markers = new Map();

  function showError(message) {
    document.getElementById('toastMessage').textContent = message;
    bootstrap.Toast.getOrCreateInstance(document.getElementById('errorToast')).show();
  }

  function authHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(isoDate) {
    if (!isoDate) return 'No due date';
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime())
      ? 'No due date'
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function markerColor(task) {
    if (task.status === 'done') return '#198754';
    if (task.status === 'review') return '#ffc107';
    if (task.status === 'in-progress') return '#0d6efd';
    return '#6c757d';
  }

  function createMarkerContent(task) {
    const pin = document.createElement('div');
    pin.style.width = '1rem';
    pin.style.height = '1rem';
    pin.style.borderRadius = '999px';
    pin.style.background = markerColor(task);
    pin.style.border = '2px solid #fff';
    pin.style.boxShadow = '0 1px 6px rgba(0,0,0,0.35)';
    pin.title = task.title;
    return pin;
  }

  function infoContent(task) {
    return `
      <div style="min-width:220px; max-width:280px;">
        <div class="fw-semibold mb-1">${escapeHtml(task.title)}</div>
        <div class="d-flex gap-1 mb-2">
          <span class="badge ${statusBadgeClass[task.status] || 'text-bg-secondary'}">${escapeHtml(statusLabels[task.status] || task.status)}</span>
          <span class="badge ${priorityBadgeClass[task.priority] || 'text-bg-light'}">${escapeHtml(task.priority)}</span>
        </div>
        <div class="small text-secondary mb-1">${escapeHtml(task.worksite_name)}</div>
        <div class="small mb-1">${escapeHtml(task.description || 'No description')}</div>
        <div class="small text-secondary">Assignee: ${escapeHtml(task.assignee || 'Unassigned')}</div>
        <div class="small text-secondary">Due: ${escapeHtml(formatDate(task.due_date))}</div>
      </div>
    `;
  }

  function selectedStatuses() {
    return new Set([...document.querySelectorAll('.btn-check[type="checkbox"]:checked')].map((input) => input.value));
  }

  function visibleTasks() {
    const statuses = selectedStatuses();
    const priority = document.getElementById('mapPriorityFilter').value;
    const query = document.getElementById('mapSearchInput').value.trim().toLowerCase();

    return tasks.filter((task) => {
      if (!statuses.has(task.status)) return false;
      if (priority !== 'all' && task.priority !== priority) return false;
      if (!query) return true;

      const haystack = [
        task.title,
        task.description,
        task.assignee,
        task.worksite_name,
        task.worksite_address,
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderTaskList(filteredTasks) {
    const list = document.getElementById('mapTaskList');
    if (filteredTasks.length === 0) {
      list.innerHTML = '<div class="list-group-item text-secondary">No mapped tasks match these filters.</div>';
      return;
    }

    list.innerHTML = '';
    filteredTasks.forEach((task) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-group-item list-group-item-action map-task-item';
      item.innerHTML = `
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div>
            <div class="fw-semibold">${escapeHtml(task.title)}</div>
            <div class="text-secondary small">${escapeHtml(task.worksite_name)}</div>
            <div class="text-secondary small">${escapeHtml(formatDate(task.due_date))}</div>
          </div>
          <div class="text-end flex-shrink-0">
            <span class="badge ${statusBadgeClass[task.status] || 'text-bg-secondary'}">${escapeHtml(statusLabels[task.status] || task.status)}</span>
            <div class="mt-1"><span class="badge ${priorityBadgeClass[task.priority] || 'text-bg-light'}">${escapeHtml(task.priority)}</span></div>
          </div>
        </div>
      `;
      item.addEventListener('click', () => focusTask(task));
      list.appendChild(item);
    });
  }

  function focusTask(task) {
    const marker = markers.get(task.id);
    if (!marker) return;
    map.panTo(marker.position);
    map.setZoom(Math.max(map.getZoom(), 14));
    infoWindow.setContent(infoContent(task));
    infoWindow.open({ anchor: marker, map });
  }

  function fitVisibleMarkers(filteredTasks) {
    if (filteredTasks.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    filteredTasks.forEach((task) => {
      const marker = markers.get(task.id);
      if (marker) bounds.extend(marker.position);
    });

    if (filteredTasks.length === 1) {
      map.setCenter(bounds.getCenter());
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 60);
    }
  }

  function applyFilters({ fit = false } = {}) {
    const filteredTasks = visibleTasks();
    const visibleIds = new Set(filteredTasks.map((task) => task.id));

    markers.forEach((marker, id) => {
      marker.map = visibleIds.has(id) ? map : null;
    });

    document.getElementById('mapVisibleCount').textContent = `${filteredTasks.length} visible`;
    document.getElementById('mapTotalCount').textContent = `${tasks.length} total`;
    renderTaskList(filteredTasks);
    if (fit) fitVisibleMarkers(filteredTasks);
  }

  function clearMarkers() {
    markers.forEach((marker) => {
      marker.map = null;
    });
    markers.clear();
  }

  function renderMarkers() {
    clearMarkers();
    tasks.forEach((task) => {
      const lat = parseFloat(task.worksite_lat);
      const lng = parseFloat(task.worksite_lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const marker = new AdvancedMarkerElement({
        map,
        position: { lat, lng },
        title: task.title,
        content: createMarkerContent(task),
      });
      marker.addListener('click', () => focusTask(task));
      markers.set(task.id, marker);
    });
    applyFilters({ fit: true });
  }

  async function loadTasks() {
    const response = await fetch('/api/tasks/map', { headers: authHeaders() });
    if (response.status === 401) {
      window.AppNavbar?.openLogin();
      throw new Error('Please log in to view mapped tasks.');
    }
    if (response.status === 403) {
      throw new Error('Only managers and admins can view the task map.');
    }
    if (!response.ok) {
      throw new Error('Failed to load mapped tasks.');
    }
    tasks = await response.json();
    renderMarkers();
  }

  async function initMap() {
    const loaded = await TaskMap.loadGoogleMaps();
    if (!loaded) throw new Error('Google Maps is not configured.');

    const { Map: GoogleMap, InfoWindow } = await google.maps.importLibrary('maps');
    ({ AdvancedMarkerElement } = await google.maps.importLibrary('marker'));

    map = new GoogleMap(document.getElementById('taskMapDashboard'), {
      center: { lat: 40.015, lng: -105.27 },
      zoom: 11,
      mapId: 'DEMO_MAP_ID',
      fullscreenControl: true,
      mapTypeControl: false,
      streetViewControl: false,
    });
    infoWindow = new InfoWindow();
  }

  function bindFilters() {
    document.getElementById('mapSearchInput').addEventListener('input', () => applyFilters());
    document.getElementById('mapPriorityFilter').addEventListener('change', () => applyFilters({ fit: true }));
    document.querySelectorAll('.btn-check[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => applyFilters({ fit: true }));
    });
    document.getElementById('mapRefreshBtn').addEventListener('click', async () => {
      try {
        await loadTasks();
      } catch (err) {
        showError(err.message);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindFilters();
    try {
      await initMap();
      await loadTasks();
    } catch (err) {
      showError(err.message);
      document.getElementById('mapTaskList').innerHTML = `<div class="list-group-item text-danger">${escapeHtml(err.message)}</div>`;
    }
  });
})();
