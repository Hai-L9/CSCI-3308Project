/* ── INTEGRATION POINT ──────────────────────────────
 * Replace this fetch with your real auth endpoint.
 * Expected: 200 + { token } on success, non-2xx on failure.
 * ─────────────────────────────────────────────────── */
async function apiLogin(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json();
}

/* ── INTEGRATION POINT ──────────────────────────────
 * What to do after a successful login.
 * ─────────────────────────────────────────────────── */
function onSuccess(data) {
  localStorage.setItem('token', data.token);
  window.location.href = '/dashboard';
}

const form      = document.getElementById('loginForm');
const emailEl   = document.getElementById('email');
const pwEl      = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const apiError  = document.getElementById('apiError');
const emailErr  = document.getElementById('emailError');
const pwErr     = document.getElementById('passwordError');

function validate() {
  let ok = true;
  emailErr.style.display = 'none';
  pwErr.style.display    = 'none';
  if (!emailEl.value.trim() || !/\S+@\S+\.\S+/.test(emailEl.value)) {
    emailErr.style.display = 'block'; ok = false;
  }
  if (!pwEl.value) {
    pwErr.style.display = 'block'; ok = false;
  }
  return ok;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  apiError.style.display = 'none';
  if (!validate()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  try {
    const data = await apiLogin(emailEl.value.trim(), pwEl.value);
    onSuccess(data);
  } catch {
    apiError.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log in';
  }
});
