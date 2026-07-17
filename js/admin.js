document.addEventListener('DOMContentLoaded', async () => {
 // Session check
 try {
 const currentUser = await window.api.getSession();
 if (!currentUser) { window.location.href = 'login.html'; return; }
 document.getElementById('user-display-name').textContent = currentUser.name;
 } catch (err) {
 window.location.href = 'login.html'; return;
 }

 // Live clock
 const updateTime = () => {
 document.getElementById('current-time-display').textContent =
 new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) +
 ' | ' + new Date().toLocaleTimeString('en-IN');
 };
 updateTime();
 setInterval(updateTime, 1000);

 // Logout
 document.getElementById('logout-button').addEventListener('click', async () => {
 await window.api.logout();
 window.location.href = 'login.html';
 });

 const showToast = (msg, type = 'success') => {
 const toast = document.getElementById('toast');
 toast.textContent = msg;
 toast.className = `notification show ${type}`;
 setTimeout(() => { toast.className = 'notification'; }, 4000);
 };

 

 async function loadDashboardStats() {
 try {
 const stats = await window.api.getDashboardStats();
 document.getElementById('stat-cement-bags').textContent = (stats.cementBagsAvailable || 0).toLocaleString('en-IN') + ' Bags';
 document.getElementById('stat-low-cement').textContent = stats.lowCementStockCount;
 document.getElementById('stat-today-sales').textContent = '₹' + (stats.todaySalesAmount || 0).toFixed(2);
 document.getElementById('stat-outstanding').textContent = '₹' + (stats.totalOutstanding || 0).toFixed(2);
 document.getElementById('stat-expenses').textContent = '₹' + (stats.todayExpenses || 0).toFixed(2);
 document.getElementById('stat-receipts-count').textContent = stats.totalReceipts;

 const alertDiv = document.getElementById('dashboard-alert');
 if (stats.lowCementStockCount > 0) {
 alertDiv.style.cssText = 'display:block;padding:16px;margin-bottom:24px;border-radius:var(--border-radius-md);background-color:var(--danger-bg);color:var(--danger-color);border:1px solid rgba(198,40,40,0.25);font-weight:600;';
 alertDiv.innerHTML = ` <strong>Low Cement Stock Alert:</strong> ${stats.lowCementStockCount} cement product(s) are below minimum stock level. <a href="materials.html" style="color:var(--danger-color);text-decoration:underline;">View Materials →</a>`;
 } else {
 alertDiv.style.display = 'none';
 }

 // Recent Sales (Latest 5) Table
 const salesTbody = document.getElementById('recent-sales-body');
 salesTbody.innerHTML = '';
 if (!stats.recentSales || stats.recentSales.length === 0) {
 salesTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">No sales recorded yet.</td></tr>';
 } else {
 stats.recentSales.forEach(r => {
 salesTbody.innerHTML += `
 <tr>
 <td><strong style="color:var(--primary-color);">${r.id}</strong></td>
 <td>${escapeHtml(r.customer_name)}</td>
 <td><strong>₹${parseFloat(r.total_amount || 0).toFixed(2)}</strong></td>
 </tr>`;
 });
 }

 // Cement Stock Summary Table
 const summaryTbody = document.getElementById('cement-stock-summary-body');
 summaryTbody.innerHTML = '';
 if (!stats.cementStockSummary || stats.cementStockSummary.length === 0) {
 summaryTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);">No cement products found.</td></tr>';
 } else {
 stats.cementStockSummary.forEach(m => {
 summaryTbody.innerHTML += `
 <tr>
 <td><strong>${escapeHtml(m.name)}</strong></td>
 <td><strong>${m.current_stock}</strong></td>
 <td>${escapeHtml(m.unit)}</td>
 </tr>`;
 });
 }

 // Low Stock Materials Table
 const lowTbody = document.getElementById('low-stock-body');
 lowTbody.innerHTML = '';
 if (!stats.lowStockMaterials || stats.lowStockMaterials.length === 0) {
 lowTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--success-color);font-weight:600;"> All stocks healthy!</td></tr>';
 } else {
 stats.lowStockMaterials.forEach(m => {
 lowTbody.innerHTML += `
 <tr>
 <td><strong>${escapeHtml(m.name)}</strong></td>
 <td><strong style="color:var(--danger-color)">${m.current_stock} ${escapeHtml(m.unit)}</strong></td>
 <td>${m.minimum_stock} ${escapeHtml(m.unit)}</td>
 </tr>`;
 });
 }
 } catch (err) { showToast('Error loading stats: ' + err.message, 'error'); }
 }

 async function loadRecentMovements() {
 try {
 const movements = await window.api.getStockMovements();
 const tbody = document.getElementById('recent-movements-table-body');
 tbody.innerHTML = '';
 if (!movements.length) {
 tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No stock movements yet.</td></tr>';
 return;
 }
 movements.slice(0, 10).forEach(m => {
 const isIn = m.movement_type === 'Stock In';
 const isAdj = m.movement_type === 'Adjustment';
 const badgeClass = isIn ? 'available' : isAdj ? 'pending' : 'low-stock';
 const counterparty = m.supplier_name || m.customer_name || '-';
 tbody.innerHTML += `
 <tr>
 <td style="font-size:12px;">${new Date(m.created_at).toLocaleString('en-IN')}</td>
 <td><strong>${escapeHtml(m.material_name)}</strong></td>
 <td><span class="status-badge ${badgeClass}">${escapeHtml(m.movement_type)}</span></td>
 <td><strong>${m.quantity} ${escapeHtml(m.material_unit)}</strong></td>
 <td>${escapeHtml(counterparty)}</td>
 <td style="font-size:12px;color:var(--text-muted);">${escapeHtml(m.remarks || '-')}</td>
 </tr>`;
 });
 } catch (err) { console.error(err); }
 }

 async function loadRecentReceipts() {
 try {
 const receipts = await window.api.getReceipts();
 const tbody = document.getElementById('recent-receipts-body');
 tbody.innerHTML = '';
 if (!receipts.length) {
 tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No receipts yet.</td></tr>';
 return;
 }
 receipts.slice(0, 8).forEach(r => {
 tbody.innerHTML += `
 <tr>
 <td><strong style="color:var(--primary-color)">${r.id}</strong></td>
 <td>${escapeHtml(r.customer_name || '-')}</td>
 <td><strong>₹${parseFloat(r.total_amount || 0).toFixed(2)}</strong></td>
 <td style="font-size:12px;">${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
 </tr>`;
 });
 } catch (err) { console.error(err); }
 }

 loadDashboardStats();
 loadRecentMovements();
 loadRecentReceipts();

 // Backup reminder check and click handlers
 const checkBackupReminder = () => {
   if (sessionStorage.getItem('backup_reminder_dismissed') === 'true') {
     return;
   }

   const lastBackupTime = localStorage.getItem('last_backup_time');
   let needsBackup = false;

   if (!lastBackupTime) {
     needsBackup = true;
   } else {
     const lastDate = new Date(lastBackupTime);
     const diffTime = Math.abs(new Date() - lastDate);
     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
     if (diffDays > 7) {
       needsBackup = true;
     }
   }

   if (needsBackup) {
     const reminderDiv = document.getElementById('backup-reminder');
     if (reminderDiv) {
       reminderDiv.style.display = 'flex';

       document.getElementById('btn-backup-now').onclick = async () => {
         try {
           showToast('Opening dialog to save backup...', 'pending');
           const result = await window.api.backupDatabase();
           if (result.success) {
             localStorage.setItem('last_backup_path', result.filePath);
             localStorage.setItem('last_backup_size', result.size);
             localStorage.setItem('last_backup_time', result.date);
             showToast('Database backup created successfully!', 'success');
             reminderDiv.style.display = 'none';
           } else {
             showToast('Backup cancelled: ' + result.error, 'error');
           }
         } catch (err) {
           showToast('Error running backup: ' + err.message, 'error');
         }
       };

       document.getElementById('btn-backup-dismiss').onclick = () => {
         sessionStorage.setItem('backup_reminder_dismissed', 'true');
         reminderDiv.style.display = 'none';
       };
     }
   }
 };

 checkBackupReminder();
});
