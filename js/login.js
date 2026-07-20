document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const alertBox = document.getElementById('alert-box');
  const loginBtn = document.getElementById('login-btn');
  const registerBtn = document.getElementById('register-btn');
  const mainLogo = document.getElementById('main-logo');

  // Show logo if available
  if (mainLogo) {
    mainLogo.addEventListener('load', () => {
      mainLogo.style.display = 'block';
      const fallback = document.getElementById('logo-fallback');
      if (fallback) fallback.style.display = 'none';
    });
  }

  // Password Visibility Toggle
  document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = 'Hide';
      } else {
        input.type = 'password';
        btn.textContent = 'Show';
      }
    });
  });

  function showAlert(msg, type = 'error') {
    alertBox.textContent = msg;
    alertBox.style.display = 'block';
    if (type === 'success') {
      alertBox.style.backgroundColor = 'var(--success-bg, #e8f5e9)';
      alertBox.style.color = 'var(--success-color, #2e7d32)';
      alertBox.style.border = '1px solid rgba(46,125,50,0.3)';
    } else {
      alertBox.style.backgroundColor = 'var(--danger-bg, #ffebee)';
      alertBox.style.color = 'var(--danger-color, #c62828)';
      alertBox.style.border = '1px solid rgba(198,40,40,0.2)';
    }
  }

  function hideAlert() {
    alertBox.style.display = 'none';
  }

  // Tab switching
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.style.display = 'block';
    registerForm.style.display = 'none';
    hideAlert();
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.style.display = 'block';
    loginForm.style.display = 'none';
    hideAlert();
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    hideAlert();
    loginBtn.disabled = true;
    loginBtn.textContent = ' Signing in...';

    try {
      const response = await window.api.login(username, password);
      if (response.success) {
        window.location.href = 'admin-dashboard.html';
      } else {
        showAlert(response.error || 'Authentication failed. Please try again.');
        loginBtn.disabled = false;
        loginBtn.textContent = ' Sign In';
      }
    } catch (err) {
      showAlert('System error: ' + err.message);
      loginBtn.disabled = false;
      loginBtn.textContent = ' Sign In';
    }
  });

  // Register handler
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    hideAlert();

    if (!name || !username || !password) {
      return showAlert('Please fill all required fields.');
    }
    if (password !== confirmPassword) {
      return showAlert('Passwords do not match.');
    }
    if (password.length < 4) {
      return showAlert('Password must be at least 4 characters.');
    }

    registerBtn.disabled = true;
    registerBtn.textContent = ' Creating Account...';

    try {
      const response = await window.api.register(name, username, password);
      if (response.success) {
        showAlert(` Account "${username}" created successfully! Please sign in.`, 'success');
        registerForm.reset();
        registerBtn.disabled = false;
        registerBtn.textContent = ' Create New Account';
        
        // Auto-fill login username & switch to login tab after 1.5 seconds
        document.getElementById('username').value = username;
        setTimeout(() => {
          tabLogin.click();
        }, 1500);
      } else {
        showAlert(response.error || 'Failed to create account.');
        registerBtn.disabled = false;
        registerBtn.textContent = ' Create New Account';
      }
    } catch (err) {
      showAlert('System error: ' + err.message);
      registerBtn.disabled = false;
      registerBtn.textContent = ' Create New Account';
    }
  });
});
