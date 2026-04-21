let tasks = [];

const addMap = TaskMap.create({
  mapElId: 'taskMap', searchContainerId: 'mapSearchContainer',
  pinBtnId: 'togglePinModeBtn', clearBtnId: 'clearLocationBtn',
  labelId: 'selectedLocationLabel', hintId: 'mapHint',
});

const editMap = TaskMap.create({
  mapElId: 'editTaskMap', searchContainerId: 'editMapSearchContainer',
  pinBtnId: 'editTogglePinModeBtn', clearBtnId: 'editClearLocationBtn',
  labelId: 'editSelectedLocationLabel', hintId: 'editMapHint',
});

function showError(message) {
  document.getElementById('toastMessage').textContent = message;
  bootstrap.Toast.getOrCreateInstance(document.getElementById('errorToast')).show();
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(response) {
  if (response.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (window.AppNavbar) {
      window.AppNavbar.openLogin();
    } else {
      window.location.href = '/?login=1';
    }
  }
}

async function getCurrentUser() {
  try {
    const res = await fetch('/api/auth/get-user', { headers: authHeaders() });
    if (!res.ok) return JSON.parse(localStorage.getItem('user'));
    const data = await res.json();
    localStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  } catch {
    return JSON.parse(localStorage.getItem('user'));
  }
}

function getCurrentUserSync() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

async function applyRoleUI() {
  const user = await getCurrentUser();
  const isWorker = !user || user.role === 'worker';
  document.querySelectorAll('[data-manager-only]').forEach(el => {
    el.classList.toggle('d-none', isWorker);
  });
}

async function fetchTasks() {
  const response = await fetch('/api/tasks', { headers: authHeaders() });
  handleUnauthorized(response);
  const dbTasks = await response.json();
  tasks.length = 0;
  tasks.push(...dbTasks);
  return tasks;
}

async function createTask(taskData) {
  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(taskData),
  });
  handleUnauthorized(response);
  if (!response.ok) throw new Error('Error saving task to the server');
  await fetchTasks();
  renderKanbanTasks();
  return await response.json();
}

function formatDate(isoDate) {
  if (!isoDate) return 'No due date';
  const date = new Date(isoDate);
  return isNaN(date) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

let draggedTaskId = null;
let lastDragY = 0;
let taskOrder = [];

function makeDraggable(cardEl, taskId) {
  cardEl.setAttribute('draggable', 'true');
  cardEl.addEventListener('dragstart', (e) => {
    draggedTaskId = taskId;
    cardEl.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  cardEl.addEventListener('dragend', () => {
    draggedTaskId = null;
    cardEl.classList.remove('dragging');
    document.querySelectorAll('.task-list').forEach(col => col.classList.remove('drag-over'));
  });
}

function getInsertPosition(columnEl, y) {
  const cards = [...columnEl.querySelectorAll('.task-card:not(.dragging)')];
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return card;
  }
  return null;
}

const columnDragColors = {
  'backlog':     { rgb: '108, 117, 125' },
  'in-progress': { rgb: '13, 110, 253'  },
  'review':      { rgb: '255, 193, 7'   },
  'done':        { rgb: '25, 135, 84'   },
};

function setupDropZone(columnEl) {
  const status = columnEl.dataset.status;
  const color = (columnDragColors[status] || columnDragColors['in-progress']).rgb;

  const placeholder = document.createElement('div');
  placeholder.className = 'drop-placeholder';
  placeholder.style.border = `2px dashed rgba(${color}, 0.5)`;
  placeholder.style.background = `rgba(${color}, 0.06)`;

  columnEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    lastDragY = e.clientY;
    columnEl.classList.add('drag-over');
    columnEl.style.outline = `2px dashed rgba(${color}, 0.5)`;
    columnEl.style.backgroundColor = `rgba(${color}, 0.06)`;
    const insertBefore = getInsertPosition(columnEl, e.clientY);
    if (insertBefore) columnEl.insertBefore(placeholder, insertBefore);
    else columnEl.appendChild(placeholder);
  });

  columnEl.addEventListener('dragleave', (e) => {
    if (!columnEl.contains(e.relatedTarget)) {
      columnEl.classList.remove('drag-over');
      columnEl.style.outline = '';
      columnEl.style.backgroundColor = '';
      placeholder.remove();
    }
  });

  columnEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    columnEl.classList.remove('drag-over');
    columnEl.style.outline = '';
    columnEl.style.backgroundColor = '';
    placeholder.remove();

    const newStatus = columnEl.dataset.status;
    if (!draggedTaskId || !newStatus) return;

    const task = tasks.find(t => t.id === draggedTaskId);
    if (!task) return;

    taskOrder = taskOrder.filter(id => id !== draggedTaskId);
    const insertBefore = getInsertPosition(columnEl, lastDragY);
    if (insertBefore) {
      const beforeId = parseInt(insertBefore.dataset.taskId);
      const idx = taskOrder.indexOf(beforeId);
      taskOrder.splice(idx, 0, draggedTaskId);
    } else {
      taskOrder.push(draggedTaskId);
    }

    task.status = newStatus;
    renderKanbanTasks();

    const user = getCurrentUserSync();
    const isWorker = user && user.role === 'worker';

    // Workers send status only — backend verifies task is assigned to them
    // Managers/admins send the full payload
    const body = isWorker
      ? { status: newStatus }
      : {
          title: task.title,
          description: task.description,
          assignee: task.assignee,
          due_date: task.due_date,
          priority: task.priority,
          status: newStatus,
          worksite_id: task.worksite_id,
        };

    try {
      const res = await fetch(`/api/tasks/${draggedTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      handleUnauthorized(res);
      if (!res.ok) throw new Error();
      await fetchTasks();
      renderKanbanTasks();
    } catch {
      showError('Failed to update task status. Please try again.');
      await fetchTasks();
      renderKanbanTasks();
    }
  });
}

const statusLabels = {
  'backlog': 'Backlog',
  'in-progress': 'In Progress',
  'review': 'Review',
  'done': 'Done',
};

const priorityBadgeClass = {
  low:    'text-bg-success',
  medium: 'text-bg-warning',
  high:   'text-bg-danger',
};

const kanbanFilterProperties = {
  task:     { label: 'Task' },
  assignee: { label: 'Assignee' },
  worksite: { label: 'Worksite' },
  priority: { label: 'Priority' },
};

const kanbanPriorityFilters = [
  { value: 'high',   label: 'High',   className: 'text-bg-danger'  },
  { value: 'medium', label: 'Medium', className: 'text-bg-warning' },
  { value: 'low',    label: 'Low',    className: 'text-bg-success' },
];

let kanbanSearchFilters = [];
let kanbanDraftFilter = null;

function includesText(value, query) {
  return String(value || '').toLowerCase().includes(query);
}

function taskFilterText(task, property) {
  if (property === 'task')     return `${task.title} ${task.description}`;
  if (property === 'assignee') return task.assignee;
  if (property === 'worksite') return `${task.worksite_name} ${task.worksite_address}`;
  if (property === 'priority') return task.priority;
  return '';
}

function hasActiveKanbanFilters() {
  return Boolean(kanbanSearchFilters.length);
}

function getFilteredTasks() {
  return tasks.filter((task) =>
    kanbanSearchFilters.every((filter) =>
      includesText(taskFilterText(task, filter.property), filter.value.toLowerCase())
    )
  );
}

function renderKanbanTasks() {
  renderTasksByStatus(getFilteredTasks());
}

function createCommittedSearchToken(filter, index) {
  const token = document.createElement('span');
  token.className = `kanban-search-token badge rounded-pill ${filter.className || 'text-bg-secondary'} d-inline-flex align-items-center gap-1 py-2 px-2`;

  const label = document.createElement('span');
  label.className = 'fw-semibold';
  label.textContent = kanbanFilterProperties[filter.property]?.label || filter.property;

  const divider = document.createElement('span');
  divider.className = 'text-white-50';
  divider.textContent = '|';

  const value = document.createElement('span');
  value.className = 'kanban-search-token-value';
  value.textContent = filter.displayValue || filter.value;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn-close btn-close-white kanban-search-token-remove ms-1';
  remove.setAttribute('aria-label', 'Remove filter');
  remove.addEventListener('click', (event) => {
    event.stopPropagation();
    kanbanSearchFilters.splice(index, 1);
    renderKanbanSearchBuilder();
    renderKanbanTasks();
  });

  token.append(label, divider, value, remove);
  return token;
}

function commitDraftFilter() {
  if (!kanbanDraftFilter) return;
  const input = document.getElementById('kanbanSearchDraftInput');
  const value = input?.value.trim() || '';
  if (value) kanbanSearchFilters.push({ property: kanbanDraftFilter.property, value });
  kanbanDraftFilter = null;
  renderKanbanSearchBuilder();
  renderKanbanTasks();
}

function cancelDraftFilter() {
  kanbanDraftFilter = null;
  renderKanbanSearchBuilder();
}

function createDraftSearchToken() {
  const draft = document.createElement('span');
  draft.className = 'kanban-search-draft d-inline-flex align-items-center gap-1 py-1 px-2';

  const label = document.createElement('span');
  label.className = 'fw-semibold small';
  label.textContent = kanbanFilterProperties[kanbanDraftFilter.property]?.label || kanbanDraftFilter.property;

  const divider = document.createElement('span');
  divider.className = 'text-secondary small';
  divider.textContent = '|';

  if (kanbanDraftFilter.property === 'priority') {
    draft.classList.add('text-bg-light');
    const dropdown = document.createElement('span');
    dropdown.className = 'dropdown';
    const button = document.createElement('button');
    button.id = 'kanbanSearchDraftInput';
    button.type = 'button';
    button.className = 'btn btn-sm btn-outline-secondary dropdown-toggle py-0';
    button.setAttribute('data-bs-toggle', 'dropdown');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'Select priority';
    const menu = document.createElement('ul');
    menu.className = 'dropdown-menu';
    kanbanPriorityFilters.forEach((priority) => {
      const item = document.createElement('li');
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'dropdown-item d-flex align-items-center gap-2';
      option.innerHTML = `<span class="badge ${priority.className}">${priority.label}</span>`;
      option.addEventListener('click', () => {
        kanbanSearchFilters.push({ property: 'priority', value: priority.value, displayValue: priority.label, className: priority.className });
        kanbanDraftFilter = null;
        renderKanbanSearchBuilder();
        renderKanbanTasks();
      });
      item.appendChild(option);
      menu.appendChild(item);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelDraftFilter(); }
    });
    dropdown.append(button, menu);
    draft.append(label, divider, dropdown);
    setTimeout(() => bootstrap.Dropdown.getOrCreateInstance(button).show(), 0);
    return draft;
  }

  const input = document.createElement('input');
  input.id = 'kanbanSearchDraftInput';
  input.type = 'search';
  input.placeholder = 'value';
  input.autocomplete = 'off';
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); commitDraftFilter(); }
    if (event.key === 'Escape') { event.preventDefault(); cancelDraftFilter(); }
  });
  input.addEventListener('blur', () => setTimeout(commitDraftFilter, 100));
  draft.append(label, divider, input);
  return draft;
}

function renderKanbanSearchBuilder() {
  const builder = document.getElementById('kanbanSearchBuilder');
  const placeholder = document.getElementById('kanbanSearchPlaceholder');
  const dropdown = document.getElementById('kanbanFilterAddBtn')?.closest('.dropdown');
  if (!builder || !placeholder || !dropdown) return;

  builder.querySelectorAll('.kanban-search-token, .kanban-search-draft').forEach((el) => el.remove());
  kanbanSearchFilters.forEach((filter, index) => {
    builder.insertBefore(createCommittedSearchToken(filter, index), placeholder);
  });
  if (kanbanDraftFilter) builder.insertBefore(createDraftSearchToken(), placeholder);

  placeholder.classList.toggle('d-none', Boolean(kanbanSearchFilters.length || kanbanDraftFilter));
  document.getElementById('kanbanSearchDraftInput')?.focus();
}

function startDraftFilter(property) {
  commitDraftFilter();
  kanbanDraftFilter = { property };
  renderKanbanSearchBuilder();
}

function bindKanbanFilters() {
  document.querySelectorAll('[data-kanban-filter-property]').forEach((button) => {
    button.addEventListener('click', () => startDraftFilter(button.dataset.kanbanFilterProperty));
  });
  const builder = document.getElementById('kanbanSearchBuilder');
  const addBtn = document.getElementById('kanbanFilterAddBtn');
  builder?.addEventListener('click', (event) => {
    if (event.target.closest('.kanban-search-token-remove, .dropdown, .kanban-search-draft')) return;
    bootstrap.Dropdown.getOrCreateInstance(addBtn).show();
  });
  renderKanbanSearchBuilder();
}

function openViewModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('viewTaskTitle').textContent = task.title;

  const descSection = document.getElementById('viewTaskDescSection');
  const descEl = document.getElementById('viewTaskDescription');
  if (task.description) {
    descEl.textContent = task.description;
    descSection.classList.remove('d-none');
  } else {
    descSection.classList.add('d-none');
  }

  const statusEl = document.getElementById('viewTaskStatus');
  const statusBadgeClass = { backlog: 'text-bg-secondary', 'in-progress': 'text-bg-primary', review: 'text-bg-warning', done: 'text-bg-success' };
  statusEl.innerHTML = `<span class="badge ${statusBadgeClass[task.status] || 'text-bg-secondary'}">${statusLabels[task.status] || task.status}</span>`;

  const priorityEl = document.getElementById('viewTaskPriority');
  priorityEl.innerHTML = `<span class="badge ${priorityBadgeClass[task.priority] || 'text-bg-light border'}">${task.priority}</span>`;

  document.getElementById('viewTaskAssignee').textContent = task.assignee || '—';
  document.getElementById('viewTaskDueDate').textContent = formatDate(task.due_date);

  const locSection = document.getElementById('viewTaskLocationSection');
  const locEl = document.getElementById('viewTaskLocation');
  if (task.worksite_name) {
    locEl.textContent = task.worksite_name;
    locSection.classList.remove('d-none');
  } else {
    locSection.classList.add('d-none');
  }

  const viewEditBtn = document.getElementById('viewEditBtn');
  viewEditBtn.onclick = () => {
    bootstrap.Modal.getInstance(document.getElementById('viewTaskModal')).hide();
    setTimeout(() => openEditModal(taskId), 200);
  };

  const historySection = document.getElementById('viewTaskWorksiteHistorySection');
  const historyList = document.getElementById('viewTaskWorksiteHistory');
  historySection.classList.add('d-none');
  historyList.innerHTML = '';

  fetch(`/api/tasks/${taskId}/worksite-history`, { headers: authHeaders() })
    .then(r => r.ok ? r.json() : [])
    .then(history => {
      if (!history.length) return;
      history.forEach(entry => {
        const li = document.createElement('li');
        li.className = 'text-secondary';
        const date = new Date(entry.changed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const location = entry.worksite_name ? `${entry.worksite_name}${entry.city ? `, ${entry.city}` : ''}` : 'Removed';
        li.textContent = `${date} — ${location}`;
        historyList.appendChild(li);
      });
      historySection.classList.remove('d-none');
    });

  bootstrap.Modal.getOrCreateInstance(document.getElementById('viewTaskModal')).show();
}

function createTaskCard(task, num) {
  const template = document.getElementById('taskCardTemplate');
  const taskCard = template.content.firstElementChild.cloneNode(true);

  const statusColors = {
    'backlog':     'var(--bs-secondary)',
    'in-progress': 'var(--bs-primary)',
    'review':      'var(--bs-warning)',
    'done':        'var(--bs-success)',
  };
  taskCard.style.borderLeftColor = statusColors[task.status] || 'var(--bs-primary)';
  taskCard.dataset.taskId = task.id;

  taskCard.querySelector('.task-title').textContent       = task.title;
  taskCard.querySelector('.task-description').textContent = task.description || '';
  const dueDateStr = task.due_date ? `Due ${formatDate(task.due_date)}` : 'No due date';
  taskCard.querySelector('p.task-meta').textContent       = `#${num} • ${dueDateStr}`;
  taskCard.querySelector('.task-assignee').textContent    = task.assignee || '';
  const priorityBadge = taskCard.querySelector('.task-priority');
  priorityBadge.textContent = task.priority;
  priorityBadge.className = `task-priority badge ${priorityBadgeClass[task.priority] || 'text-bg-light border'}`;

  const user = getCurrentUserSync();
  const editBtn = taskCard.querySelector('.btn-edit-task');

  if (user && user.role === 'worker') {
    // Workers: hide edit button, show status dropdown instead
    editBtn.classList.add('d-none');

    const statusSelect = document.createElement('select');
    statusSelect.className = 'form-select form-select-sm mt-2';
    statusSelect.style.fontSize = '0.75rem';
    statusSelect.innerHTML = `
      <option value="backlog"     ${task.status === 'backlog'     ? 'selected' : ''}>Backlog</option>
      <option value="in-progress" ${task.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
      <option value="review"      ${task.status === 'review'      ? 'selected' : ''}>Review</option>
      <option value="done"        ${task.status === 'done'        ? 'selected' : ''}>Done</option>
    `;

    statusSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      const newStatus = e.target.value;
      const previousStatus = task.status;
      task.status = newStatus;
      renderKanbanTasks();
      try {
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ status: newStatus }),
        });
        handleUnauthorized(res);
        if (!res.ok) throw new Error();
        await fetchTasks();
        renderKanbanTasks();
      } catch {
        task.status = previousStatus;
        renderKanbanTasks();
        showError('Failed to update status. Please try again.');
      }
    });

    statusSelect.addEventListener('click', (e) => e.stopPropagation());
    taskCard.querySelector('.card-body').appendChild(statusSelect);
  } else {
    // Managers/admins: edit button as normal
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(task.id);
    });
  }

  const locEl = taskCard.querySelector('.task-location');
  if (task.worksite_name) {
    locEl.textContent = task.worksite_name;
    locEl.classList.remove('d-none');
  }

  taskCard.addEventListener('click', (e) => {
    if (e.target.closest('.btn-edit-task, select')) return;
    openViewModal(task.id);
  });

  // All roles can drag — backend enforces what workers can update
  makeDraggable(taskCard, task.id);

  return taskCard;
}

function renderTasksByStatus(taskList) {
  const taskLists = document.querySelectorAll('[data-status]');

  const knownIds = new Set(taskOrder);
  tasks.forEach(t => { if (!knownIds.has(t.id)) taskOrder.push(t.id); });
  taskOrder = taskOrder.filter(id => tasks.some(t => t.id === id));

  const displayNum = new Map(taskOrder.map((id, i) => [id, i + 1]));
  const emptyText = hasActiveKanbanFilters() ? 'No matching tasks.' : 'No tasks yet.';

  taskLists.forEach((columnBody) => {
    const status = columnBody.dataset.status;
    const tasksInColumn = taskList.filter((t) => t.status === status);
    columnBody.innerHTML = '';

    if (tasksInColumn.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'text-secondary small mb-0';
      emptyState.textContent = emptyText;
      columnBody.appendChild(emptyState);
    } else {
      const ordered = tasksInColumn.sort((a, b) => taskOrder.indexOf(a.id) - taskOrder.indexOf(b.id));
      ordered.forEach((task) => columnBody.appendChild(createTaskCard(task, displayNum.get(task.id))));
    }

    const countBadge = document.querySelector(`[data-count-for="${status}"]`);
    if (countBadge) countBadge.textContent = tasksInColumn.length;
  });
}

let _editTaskWorksite = null;

function openEditModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('editTaskId').value          = task.id;
  document.getElementById('editTaskTitle').value       = task.title;
  document.getElementById('editTaskDescription').value = task.description || '';
  document.getElementById('editTaskAssignee').value    = task.assignee || '';
  document.getElementById('editTaskDueDate').value     = task.due_date ? task.due_date.split('T')[0] : '';
  document.getElementById('editTaskPriority').value    = task.priority;
  document.getElementById('editTaskStatus').value      = task.status;

  _editTaskWorksite = (task.worksite_lat && task.worksite_lng)
    ? { lat: parseFloat(task.worksite_lat), lng: parseFloat(task.worksite_lng), name: task.worksite_name }
    : null;

  document.getElementById('editTaskForm').classList.remove('was-validated');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('editTaskModal')).show();
}

document.addEventListener('DOMContentLoaded', async () => {
  bindKanbanFilters();
  await applyRoleUI();
  tasks = await fetchTasks();
  renderKanbanTasks();
  document.querySelectorAll('.task-list').forEach(col => setupDropZone(col));

  const addTaskModalEl = document.getElementById('addTaskModal');
  addTaskModalEl.addEventListener('shown.bs.modal', () => addMap.init());
  addTaskModalEl.addEventListener('hidden.bs.modal', () => addMap.reset());

  const editTaskModalEl = document.getElementById('editTaskModal');
  editTaskModalEl.addEventListener('shown.bs.modal', async () => {
    await editMap.init();
    if (_editTaskWorksite) {
      editMap.setLocation(_editTaskWorksite.lat, _editTaskWorksite.lng, _editTaskWorksite.name);
      _editTaskWorksite = null;
    }
  });
  editTaskModalEl.addEventListener('hidden.bs.modal', () => editMap.reset());

  document.getElementById('saveTaskBtn').addEventListener('click', async () => {
    const form       = document.getElementById('addTaskForm');
    const titleEl    = document.getElementById('taskTitle');
    const priorityEl = document.getElementById('taskPriority');
    const statusEl   = document.getElementById('taskStatus');
    const descEl     = document.getElementById('taskDescription');
    const assigneeEl = document.getElementById('taskAssignee');
    const dueDateEl  = document.getElementById('taskDueDate');

    let valid = true;
    [titleEl, priorityEl, statusEl].forEach((el) => {
      if (!el.value.trim()) { el.classList.add('is-invalid'); valid = false; }
      else { el.classList.remove('is-invalid'); }
    });
    if (!valid) return;

    let worksite_id = null;
    const loc = addMap.getSelection();
    if (loc) {
      const wsRes = await fetch('/api/worksites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng }),
      });
      if (wsRes.ok) worksite_id = (await wsRes.json()).id;
    }

    const newTask = {
      title:       titleEl.value.trim(),
      description: descEl.value.trim(),
      priority:    priorityEl.value,
      status:      statusEl.value,
      due_date:    dueDateEl.value || null,
      assignee:    assigneeEl.value.trim(),
      worksite_id,
    };

    try {
      await createTask(newTask);
      form.reset();
      [titleEl, priorityEl, statusEl].forEach((el) => el.classList.remove('is-invalid'));
      bootstrap.Modal.getInstance(addTaskModalEl).hide();
    } catch (err) {
      showError('Failed to save task. Please try again.');
    }
  });

  document.getElementById('updateTaskBtn').addEventListener('click', async () => {
    const form       = document.getElementById('editTaskForm');
    const titleEl    = document.getElementById('editTaskTitle');
    const priorityEl = document.getElementById('editTaskPriority');
    const statusEl   = document.getElementById('editTaskStatus');

    let valid = true;
    [titleEl, priorityEl, statusEl].forEach((el) => {
      if (!el.value.trim()) { el.classList.add('is-invalid'); valid = false; }
      else { el.classList.remove('is-invalid'); }
    });
    if (!valid) { form.classList.add('was-validated'); return; }

    const id   = parseInt(document.getElementById('editTaskId').value, 10);
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    let worksite_id = null;
    const loc = editMap.getSelection();
    if (loc) {
      const unchanged = task.worksite_id &&
        Math.abs(parseFloat(task.worksite_lat) - loc.lat) < 0.00001 &&
        Math.abs(parseFloat(task.worksite_lng) - loc.lng) < 0.00001;
      if (unchanged) {
        worksite_id = task.worksite_id;
      } else {
        const wsRes = await fetch('/api/worksites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng }),
        });
        if (wsRes.ok) worksite_id = (await wsRes.json()).id;
      }
    }

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          title:       titleEl.value.trim(),
          description: document.getElementById('editTaskDescription').value.trim(),
          assignee:    document.getElementById('editTaskAssignee').value.trim(),
          due_date:    document.getElementById('editTaskDueDate').value || null,
          priority:    priorityEl.value,
          status:      statusEl.value,
          worksite_id,
        }),
      });
      handleUnauthorized(res);
      if (!res.ok) throw new Error();
      await fetchTasks();
      renderKanbanTasks();
      bootstrap.Modal.getInstance(editTaskModalEl).hide();
    } catch {
      showError('Failed to update task. Please try again.');
    }
  });

  document.getElementById('deleteTaskBtn').addEventListener('click', async () => {
    const id = parseInt(document.getElementById('editTaskId').value, 10);
    if (!confirm('Delete this task? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      handleUnauthorized(res);
      if (!res.ok) throw new Error();
      tasks = tasks.filter(t => t.id !== id);
      renderKanbanTasks();
      bootstrap.Modal.getInstance(editTaskModalEl).hide();
    } catch {
      showError('Failed to delete task. Please try again.');
    }
  });

  editTaskModalEl.addEventListener('hidden.bs.modal', () => {
    document.getElementById('editTaskForm').classList.remove('was-validated');
    ['editTaskTitle', 'editTaskPriority', 'editTaskStatus'].forEach(id => {
      document.getElementById(id).classList.remove('is-invalid');
    });
  });
});
