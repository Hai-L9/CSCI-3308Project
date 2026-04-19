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

// Returns auth header object if a token exists, otherwise empty object
function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Redirects to login if the server returns 401
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

// Returns the current user object from the server, falls back to localStorage
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

// Kept for compatibility — reads from localStorage directly (already refreshed by getCurrentUser)
function getCurrentUserSync() {
  try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
}

// Hides UI controls that workers should not see (create, edit, delete)
async function applyRoleUI() {
  const user = await getCurrentUser();
  const isWorker = !user || user.role === 'worker';

  // Hide the "Add Task" button for workers
  document.querySelectorAll('[data-manager-only]').forEach(el => {
    el.classList.toggle('d-none', isWorker);
  });
}

// Fetches tasks from the server — the backend already filters by role
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
  renderTasksByStatus(tasks);
  return await response.json();
}

// UTC dates
function formatDate(isoDate) {
  if (!isoDate) return 'No due date';
  const date = new Date(isoDate);
  return isNaN(date) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}


let draggedTaskId = null;
let lastDragY = 0;
let taskOrder = []; // tracks display order of task ids

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
  return null; // insert at end
}

const columnDragColors = {
  'backlog':     { rgb: '108, 117, 125' },  // secondary/gray
  'in-progress': { rgb: '13, 110, 253'  },  // primary/blue
  'review':      { rgb: '255, 193, 7'   },  // warning/yellow
  'done':        { rgb: '25, 135, 84'   },  // success/green
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
    if (insertBefore) {
      columnEl.insertBefore(placeholder, insertBefore);
    } else {
      columnEl.appendChild(placeholder);
    }
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

    // Reorder taskOrder based on where placeholder was dropped
    const cards = [...columnEl.querySelectorAll('.task-card')];
    const insertBefore = getInsertPosition(columnEl, lastDragY);
    taskOrder = taskOrder.filter(id => id !== draggedTaskId);
    if (insertBefore) {
      const beforeId = parseInt(insertBefore.dataset.taskId);
      const idx = taskOrder.indexOf(beforeId);
      taskOrder.splice(idx, 0, draggedTaskId);
    } else {
      taskOrder.push(draggedTaskId);
    }

    task.status = newStatus;
    renderTasksByStatus(tasks);

    try {
      const res = await fetch(`/api/tasks/${draggedTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          title: task.title,
          description: task.description,
          assignee: task.assignee,
          due_date: task.due_date,
          priority: task.priority,
          status: newStatus,
          worksite_id: task.worksite_id
        }),
      });
      handleUnauthorized(res);
      if (!res.ok) throw new Error();
      await fetchTasks();
      renderTasksByStatus(tasks);
    } catch {
      showError('Failed to update task status. Please try again.');
      await fetchTasks();
      renderTasksByStatus(tasks);
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
  low:    'text-bg-secondary',
  medium: 'text-bg-warning',
  high:   'text-bg-danger',
};

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
  const pClass = priorityBadgeClass[task.priority] || 'text-bg-light border';
  priorityEl.innerHTML = `<span class="badge ${pClass}">${task.priority}</span>`;

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
  taskCard.querySelector('.task-priority').textContent    = task.priority;

  const user = JSON.parse(localStorage.getItem('user'));
  const editBtn = taskCard.querySelector('.btn-edit-task');
  if (user && user.role === 'worker') {
    editBtn.classList.add('d-none');
  } else {
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

  // Click to view — stop propagation on edit btn already handled above
  taskCard.addEventListener('click', (e) => {
    if (e.target.closest('.btn-edit-task')) return;
    openViewModal(task.id);
  });

  makeDraggable(taskCard, task.id);

  return taskCard;
}

function renderTasksByStatus(taskList) {
  const taskLists = document.querySelectorAll('[data-status]');

  // Merge any new task ids into taskOrder (preserving existing order)
  const knownIds = new Set(taskOrder);
  taskList.forEach(t => { if (!knownIds.has(t.id)) taskOrder.push(t.id); });
  // Remove ids no longer in taskList
  taskOrder = taskOrder.filter(id => taskList.some(t => t.id === id));

  const displayNum = new Map(taskOrder.map((id, i) => [id, i + 1]));

  taskLists.forEach((columnBody) => {
    const status = columnBody.dataset.status;
    const tasksInColumn = taskList.filter((t) => t.status === status);

    columnBody.innerHTML = '';

    if (tasksInColumn.length === 0) {
      const emptyState = document.createElement('p');
      emptyState.className = 'text-secondary small mb-0';
      emptyState.textContent = 'No tasks yet.';
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
  await applyRoleUI();
  tasks = await fetchTasks();
  renderTasksByStatus(tasks);
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
      renderTasksByStatus(tasks);
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
      renderTasksByStatus(tasks);
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
