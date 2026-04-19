function initNavbar({ mountId = 'siteNavbar', basePath = '', currentPage = '' } = {}) {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  const normalizedBasePath = basePath && !basePath.endsWith('/') ? `${basePath}/` : basePath;
  const links = {
    home: `${normalizedBasePath}index.html`,
    login: `${normalizedBasePath}pages/login.html`,
    register: `${normalizedBasePath}pages/register.html`,
    tasks: `${normalizedBasePath}pages/kanban.html`,
  };

  const activeClass = (page) =>
    currentPage === page ? 'btn btn-light btn-sm fw-semibold' : 'btn btn-outline-light btn-sm fw-semibold';

  mount.innerHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
      <div class="container">
        <a class="navbar-brand fw-bold" href="${links.home}">Task Tracker 0.0.2</a>
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
          <ul class="navbar-nav align-items-lg-center gap-2">
            <li class="nav-item"><a class="${activeClass('home')}" href="${links.home}">Home</a></li>
            <li class="nav-item" data-auth="login"><a class="${activeClass('login')}" href="${links.login}">Login</a></li>
            <li class="nav-item" data-auth="register"><a class="${activeClass('register')}" href="${links.register}">Register</a></li>
            <li class="nav-item"><a class="${activeClass('tasks')}" href="${links.tasks}">Tasks</a></li>
            <li class="nav-item">
              <button class="btn btn-outline-light btn-sm fw-semibold" type="button">Service Status</button>
            </li>
            <li class="nav-item ms-lg-2">
              <span class="navbar-text text-white-50">Team Choo Choo Trains</span>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  `;

  hydrateAuthState(mount);
}

async function hydrateAuthState(navRoot) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch('/api/auth/get-user', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      localStorage.removeItem('token');
      return;
    }

    const data = await res.json();
    const username = data.user?.username || 'User';

    navRoot.querySelector('[data-auth="login"]')?.remove();
    navRoot.querySelector('[data-auth="register"]')?.remove();

    const navBar = navRoot.querySelector('.navbar-nav');
    const userLi = document.createElement('li');
    userLi.className = 'nav-item d-flex align-items-center gap-2 ms-lg-3';
    userLi.innerHTML = `
      <span class="text-white fw-semibold">Hello, ${username}</span>
      <button class="btn btn-sm btn-outline-danger" id="logoutBtn" type="button">Logout</button>
    `;
    navBar?.appendChild(userLi);

    navRoot.querySelector('#logoutBtn')?.addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.reload();
    });
  } catch (error) {
    console.error('Failed to fetch user', error);
  }
}
