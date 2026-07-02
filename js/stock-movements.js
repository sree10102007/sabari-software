document.addEventListener('DOMContentLoaded', async () => {
 window.location.href = 'admin-dashboard.html';
 return;
 // Session check
 let currentUser = null;
 try {
 currentUser = await window.api.getSession();
 if (!currentUser || currentUser.role !== 'admin') {
 window.location.href = 'login.html';
 return;
 }
 document.getElementById('user-display-name').textContent = currentUser.name;
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

 // References to elements
 const filterMaterial = document.getElementById('filter-material');
 const filterType = document.getElementById('filter-type');
 const filterFrom = document.getElementById('filter-from');
 const filterTo = document.getElementById('filter-to');
 const btnFilter = document.getElementById('btn-filter');
 const btnClearFilter = document.getElementById('btn-clear-filter');
 const tableBody = document.getElementById('movements-table-body');
 const movementsCount = document.getElementById('movements-count');

 // Load materials for select dropdown
 async function loadMaterialsDropdown() {
 try {
 const mats = await window.api.getMaterials();
 filterMaterial.innerHTML = '<option value="">All Materials</option>';
 mats.forEach(m => {
 const option = document.createElement('option');
 option.value = m.id;
 option.textContent = m.name;
 filterMaterial.appendChild(option);
 });
 } catch (err) {
 console.error('Error loading materials dropdown:', err);
 }
 }

 // Load stock movements log
 async function loadMovements() {
 try {
 tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">Loading movements log...</td></tr>`;

 const filters = {
 material_id: filterMaterial.value ? parseInt(filterMaterial.value) : null,
 movement_type: filterType.value,
 from_date: filterFrom.value,
 to_date: filterTo.value
 };

 const movements = await window.api.getStockMovements(filters);
 movementsCount.textContent = `Found ${movements.length} log entry(ies)`;
 renderMovements(movements);
 } catch (err) {
 showToast('Error loading movements: ' + err.message, 'error');
 }
 }

 // Render movements table
 function renderMovements(movements) {
 tableBody.innerHTML = '';
 if (movements.length === 0) {
 tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">No stock movements found matching filters.</td></tr>`;
 return;
 }

 movements.forEach(m => {
 const tr = document.createElement('tr');
 const date = new Date(m.created_at).toLocaleString('en-IN');

 let typeClass = 'available';
 if (m.movement_type === 'Stock Out' || m.movement_type === 'Customer Sale' || m.movement_type === 'Direct Sale' || m.movement_type === 'Site Usage' || m.movement_type === 'Damaged Stock') {
 typeClass = 'low-stock';
 } else if (m.movement_type === 'Adjustment') {
 typeClass = 'pending';
 }

 const rateVal = parseFloat(m.rate || 0);
 const rateStr = rateVal > 0 ? `₹${rateVal.toFixed(2)}` : '-';

 const totalVal = parseFloat(m.total_amount || 0);
 const totalStr = totalVal > 0 ? `₹${totalVal.toFixed(2)}` : '-';

 let entityStr = '-';
 if (m.movement_type === 'Stock In') {
 entityStr = m.supplier_name ? `Supplier: ${m.supplier_name}` : '-';
 if (m.invoice_number) entityStr += ` (Inv: ${m.invoice_number})`;
 } else if (m.movement_type === 'Stock Out' || m.movement_type === 'Customer Sale' || m.movement_type === 'Direct Sale' || m.movement_type === 'Site Usage') {
 entityStr = m.customer_name ? `Customer: ${m.customer_name}` : '-';
 }

 tr.innerHTML = `
 <td>${date}</td>
 <td><strong>${escapeHtml(m.material_name)}</strong></td>
 <td><span class="status-badge ${typeClass}">${m.movement_type}</span></td>
 <td><strong>${m.quantity} ${escapeHtml(m.material_unit)}</strong></td>
 <td>${rateStr}</td>
 <td>${totalStr}</td>
 <td><span style="font-size:12px;">${escapeHtml(entityStr)}</span></td>
 <td>${escapeHtml(m.created_by)}</td>
 <td><span style="font-size:12px;color:var(--text-muted);">${escapeHtml(m.remarks || '-')}</span></td>
  <td class="actions-col">
  <div class="table-actions">
  <button class="btn btn-action btn-delete btn-delete-sm" data-id="${m.id}" data-name="${escapeHtml(m.material_name)}" data-qty="${m.quantity}" data-type="${m.movement_type}">Delete</button>
  </div>
  </td>
 `;

 const deleteBtn = tr.querySelector('.btn-delete-sm');
 deleteBtn.addEventListener('click', async () => {
 const smId = parseInt(deleteBtn.dataset.id);
 const mName = deleteBtn.dataset.name;
 const qty = deleteBtn.dataset.qty;
 const type = deleteBtn.dataset.type;
 const confirmed = confirm(`Are you sure you want to delete this stock movement log?\n\nMaterial: ${mName}\nQuantity: ${qty}\nType: ${type}\n\nWARNING: Deleting a stock movement will reverse its effect on current stock!`);
 if (!confirmed) return;

 try {
 const result = await window.api.deleteStockMovement(smId);
 if (result.success) {
 showToast(' Stock movement log deleted and stock reversed!');
 loadMovements();
 } else {
 showToast('Error deleting stock movement: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });
 
 tableBody.appendChild(tr);
 });
 }

 // Filter Listeners
 btnFilter.addEventListener('click', loadMovements);
 btnClearFilter.addEventListener('click', () => {
 filterMaterial.value = '';
 filterType.value = 'All';
 filterFrom.value = '';
 filterTo.value = '';
 loadMovements();
 });

 // Escape HTML helper
 

 // Initial Load
 await loadMaterialsDropdown();
 await loadMovements();
});
