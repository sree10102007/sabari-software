window.location.href = 'admin-dashboard.html';
document.addEventListener('DOMContentLoaded', async () => {
 // Session check
 let currentUser = null;
 try {
 currentUser = await window.api.getSession();
 if (!currentUser || currentUser.role !== 'engineer') {
 window.location.href = 'login.html';
 return;
 }
 
 document.getElementById('user-display-name').textContent = currentUser.name;
 document.getElementById('user-display-role').textContent = currentUser.role.toUpperCase() + ' PORTAL';
 } catch (err) {
 console.error('Session validation error:', err);
 window.location.href = 'login.html';
 return;
 }

 // Display current date
 const updateTime = () => {
 const now = new Date();
 document.getElementById('current-time-display').textContent = now.toLocaleDateString('en-US', {
 weekday: 'long',
 year: 'numeric',
 month: 'long',
 day: 'numeric'
 }) + ' | ' + now.toLocaleTimeString();
 };
 updateTime();
 setInterval(updateTime, 1000);

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

 // Set default required date to tomorrow
 const dateInput = document.getElementById('order-date');
 if (dateInput) {
 const tomorrow = new Date();
 tomorrow.setDate(tomorrow.getDate() + 1);
 const year = tomorrow.getFullYear();
 const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
 const day = String(tomorrow.getDate()).padStart(2, '0');
 dateInput.value = `${year}-${month}-${day}`;
 }

 // Global cached materials
 let materialsList = [];

 // Fetch stock and render
 async function loadStockData() {
 try {
 materialsList = await window.api.getMaterials();
 
 // Render stock availability list
 const tbody = document.getElementById('materials-availability-body');
 tbody.innerHTML = '';
 
 const dropdown = document.getElementById('order-material');
 dropdown.innerHTML = '<option value="">-- Choose Material --</option>';

 materialsList.forEach(m => {
 const isLow = m.current_stock <= m.minimum_stock;
 const statusText = isLow ? 'Low Stock' : 'Available';
 const statusClass = isLow ? 'low-stock' : 'available';

 // 1. Populate table row
 const tr = document.createElement('tr');
 tr.innerHTML = `
 <td><strong>${escapeHtml(m.name)}</strong></td>
 <td><strong>${m.current_stock} ${escapeHtml(m.unit)}</strong></td>
 <td><span class="status-badge ${statusClass}">${statusText}</span></td>
 `;
 tbody.appendChild(tr);

 // 2. Populate dropdown option
 const opt = `<option value="${m.id}">${escapeHtml(m.name)}</option>`;
 dropdown.insertAdjacentHTML('beforeend', opt);
 });
 } catch (err) {
 showToast('Error loading inventory levels: ' + err.message, 'error');
 }
 }

 // Dropdown availability update
 const materialDropdown = document.getElementById('order-material');
 const availabilityLabel = document.getElementById('stock-availability-label');

 materialDropdown.addEventListener('change', () => {
 const val = materialDropdown.value;
 if (!val) {
 availabilityLabel.style.display = 'none';
 return;
 }

 const mat = materialsList.find(m => m.id == val);
 if (mat) {
 const isLow = mat.current_stock <= mat.minimum_stock;
 availabilityLabel.style.color = isLow ? 'var(--danger-color)' : 'var(--success-color)';
 availabilityLabel.innerHTML = `Currently Available: <strong>${mat.current_stock} ${escapeHtml(mat.unit)}</strong>`;
 availabilityLabel.style.display = 'block';
 }
 });

 // Submit bulk order request
 const form = document.getElementById('bulk-order-form');
 form.addEventListener('submit', async (e) => {
 e.preventDefault();

 const material_id = parseInt(materialDropdown.value);
 const quantity = parseFloat(document.getElementById('order-qty').value);
 const required_date = document.getElementById('order-date').value;
 const purpose = document.getElementById('order-purpose').value.trim();
 const remarks = document.getElementById('order-remarks').value.trim();

 if (!material_id || quantity <= 0) {
 showToast('Please select a material and enter quantity > 0.', 'error');
 return;
 }

 try {
 const response = await window.api.submitBulkOrder({
 material_id,
 engineer_name: currentUser.name,
 quantity,
 purpose,
 required_date,
 remarks
 });

 if (response.success) {
 showToast('Bulk order request submitted to Admin successfully.', 'success');
 form.reset();
 availabilityLabel.style.display = 'none';
 
 // Re-set date to tomorrow
 const tomorrow = new Date();
 tomorrow.setDate(tomorrow.getDate() + 1);
 document.getElementById('order-date').value = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
 
 refreshData();
 } else {
 showToast(response.error || 'Failed to submit bulk order.', 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });

 // Load engineer's request history
 async function loadRequestHistory() {
 try {
 const history = await window.api.getEngineerBulkOrders(currentUser.name);
 const tbody = document.getElementById('orders-history-body');
 tbody.innerHTML = '';

 if (history.length === 0) {
 tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No bulk orders requested yet.</td></tr>';
 return;
 }

 history.forEach(o => {
 const tr = document.createElement('tr');
 const reqDate = new Date(o.created_at).toLocaleString();
 const targetDate = o.required_date ? new Date(o.required_date).toLocaleDateString() : 'N/A';

 let statusClass = 'pending';
 if (o.status === 'Approved') statusClass = 'approved';
 if (o.status === 'Rejected') statusClass = 'rejected';

 tr.innerHTML = `
 <td><strong>${reqDate}</strong></td>
 <td><strong>${escapeHtml(o.material_name)}</strong></td>
 <td><strong>${o.quantity} ${escapeHtml(o.material_unit)}</strong></td>
 <td>${escapeHtml(o.purpose || '-')}</td>
 <td>${targetDate}</td>
 <td><span class="status-badge ${statusClass}">${o.status}</span></td>
 <td><span style="font-size:12px; color: var(--text-muted);">${escapeHtml(o.remarks || '-')}</span></td>
 `;
 tbody.appendChild(tr);
 });
 } catch (err) {
 showToast('Error loading history: ' + err.message, 'error');
 }
 }

 function refreshData() {
 loadStockData();
 loadRequestHistory();
 }

 // Utilities
 

 // Initial Load
 refreshData();
});
