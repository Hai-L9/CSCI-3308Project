async function apiRegister(username, email, password) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Registration failed');
  }
  return res.json();
}

function onSuccess(data) {
  localStorage.setItem('token', data.token);
  setTimeout(() => {
    window.location.href = '/';
  }, 1000);
}

const form = document.getElementById('registerForm');
const usernameEl = document.getElementById('username');
const emailEl = document.getElementById('email');
const pwEl = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const apiError = document.getElementById('apiError');
const apiSuccess = document.getElementById('apiSuccess');
const usernameErr = document.getElementById('usernameError');
const emailErr = document.getElementById('emailError');
const pwErr = document.getElementById('passwordError');

function validate() {
  let ok = true;
  usernameErr.style.display = 'none';
  emailErr.style.display = 'none';
  pwErr.style.display = 'none';

  if (!usernameEl.value.trim()) {
    usernameErr.style.display = 'block'; ok = false;
  }
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
  apiSuccess.style.display = 'none';

  if (!validate()) return;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing up…';

  try {
    const data = await apiRegister(usernameEl.value.trim(), emailEl.value.trim(), pwEl.value);
    apiSuccess.style.display = 'block';
    onSuccess(data);
  } catch (err) {
    apiError.textContent = err.message || 'Registration failed. Please try again.';
    apiError.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign up';
  }
});
