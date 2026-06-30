window.location.href = 'admin-dashboard.html';
document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  let currentUser = null;
  try {
    currentUser = await window.api.getSession();
    if (!currentUser || currentUser.role !== 'admin') {
      window.location.href = 'login.html';
      return;
    }
    
    document.getElementById('user-display-name').textContent = currentUser.name;
    document.getElementById('user-display-role').textContent = currentUser.role.toUpperCase() + ' ACCESS';
  } catch (err) {
    console.error('Session validation error:', err);
    window.location.href = 'login.html';
    return;
  }

  // Logout handler
  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.api.logout();
    window.location.href = 'login.html';
  });

  // UI Toast helper
  const showToast = (message, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `notification show ${type}`;
    setTimeout(() => {
      toast.className = 'notification';
    }, 4000);
  };

  // Load and display users
  async function loadUsers() {
    try {
      const users = await window.api.getUsers();
      const tbody = document.getElementById('users-table-body');
      tbody.innerHTML = '';

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No system users found.</td></tr>';
        return;
      }

      users.forEach(u => {
        const tr = document.createElement('tr');
        
        let roleBadgeClass = 'pending';
        if (u.role === 'admin') roleBadgeClass = 'low-stock'; // Red/Orange-ish
        if (u.role === 'retailer') roleBadgeClass = 'available'; // Green

        tr.innerHTML = `
          <td><strong>#USR-${u.id}</strong></td>
          <td><strong>${escapeHtml(u.name)}</strong></td>
          <td><code>${escapeHtml(u.username)}</code></td>
          <td><span class="status-badge ${roleBadgeClass}">${u.role.toUpperCase()}</span></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (err) {
      showToast('Error loading users: ' + err.message, 'error');
    }
  }

  // Form Submit Handler
  const addUserForm = document.getElementById('add-user-form');
  addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('new-user-name').value.trim();
    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;

    if (!name || !username || !password || !role) {
      showToast('All fields are required.', 'error');
      return;
    }

    try {
      const response = await window.api.addUser({
        name,
        username,
        password,
        role
      });

      if (response.success) {
        showToast(`User account for "${name}" created successfully.`, 'success');
        addUserForm.reset();
        loadUsers();
      } else {
        showToast(response.error || 'Failed to create user account.', 'error');
      }
    } catch (err) {
      showToast('System error: ' + err.message, 'error');
    }
  });

  // Utilities
  

  // Initial Load
  loadUsers();
});
