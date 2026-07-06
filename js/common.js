/**
 * Shared Utility Functions for Sivakami Traders Frontend
 */

// Handle User Session and Navigation setup on DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
 try {
 const user = await window.api.getSession();
 if (!user) {
 if (!window.location.pathname.endsWith('login.html')) {
 window.location.href = 'login.html';
 }
 return;
 }
 const userDisplay = document.getElementById('user-display-name');
 if (userDisplay) userDisplay.textContent = user.name;
 } catch {
 if (!window.location.pathname.endsWith('login.html')) {
 window.location.href = 'login.html';
 }
 return;
 }

 const logoutBtn = document.getElementById('logout-button');
 if (logoutBtn) {
 logoutBtn.addEventListener('click', async () => {
 await window.api.logout();
 window.location.href = 'login.html';
 });
 }

  const notepadLink = document.getElementById('notepad-link');
  if (notepadLink) {
    notepadLink.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const res = await window.api.openNotepad();
        if (res && !res.success) {
          window.showToast(res.error, 'error');
        }
      } catch (err) {
        window.showToast('Error opening Notepad: ' + err.message, 'error');
      }
    });
  }
});

/**
 * Display an alert message in a specific container
 * @param {string} msg The message to display
 * @param {string} type 'error' or 'success'
 * @param {string} containerId The ID of the container element
 */
window.showAlert = function(msg, type = 'error', containerId = 'out-alert') {
 const el = document.getElementById(containerId);
 if (!el) return;
 el.textContent = msg;
 el.style.cssText = type === 'error'
 ? 'display:block;background:var(--danger-bg);color:var(--danger-color);border:1px solid rgba(198,40,40,0.2);padding:12px;margin-bottom:12px;border-radius:var(--border-radius-md);font-weight:600;font-size:13px;'
 : 'display:block;background:var(--success-bg);color:var(--success-color);border:1px solid rgba(46,125,50,0.2);padding:12px;margin-bottom:12px;border-radius:var(--border-radius-md);font-weight:600;font-size:13px;';
};

/**
 * Show a toast notification
 * @param {string} msg The message to show
 * @param {string} type 'success', 'error', 'pending'
 */
window.showToast = function(msg, type = 'success') {
 const t = document.getElementById('toast');
 if (!t) return;
 t.textContent = msg;
 t.className = `notification show ${type}`;
 setTimeout(() => { t.className = 'notification'; }, 4000);
};

/**
 * Escape HTML to prevent XSS
 * @param {string} str 
 * @returns {string} escaped string
 */
window.escapeHtml = function(str) {
 if (!str) return '';
 return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};
