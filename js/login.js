document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const alertBox = document.getElementById('alert-box');
  const loginBtn = document.getElementById('login-btn');
  const mainLogo = document.getElementById('main-logo');

  // Show logo if available
  if (mainLogo) {
    mainLogo.addEventListener('load', () => {
      mainLogo.style.display = 'block';
      const fallback = document.getElementById('logo-fallback');
      if (fallback) fallback.style.display = 'none';
    });
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    alertBox.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = '⏳ Signing in...';

    try {
      const response = await window.api.login(username, password);
      if (response.success) {
        // Always redirect to admin dashboard
        window.location.href = 'admin-dashboard.html';
      } else {
        alertBox.textContent = response.error || 'Authentication failed. Please try again.';
        alertBox.style.display = 'block';
        loginBtn.disabled = false;
        loginBtn.textContent = '🚀 Sign In to Admin Panel';
      }
    } catch (err) {
      alertBox.textContent = 'System error: ' + err.message;
      alertBox.style.display = 'block';
      loginBtn.disabled = false;
      loginBtn.textContent = '🚀 Sign In to Admin Panel';
    }
  });
});
