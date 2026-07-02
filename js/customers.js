document.addEventListener('DOMContentLoaded', () => {
 const showToast = (msg, type = 'success') => {
 const t = document.getElementById('toast');
 t.textContent = msg; t.className = `notification show ${type}`;
 setTimeout(() => { t.className = 'notification'; }, 4000);
 };

 

 

 let allCustomers = [];
 let activeTypeFilter = 'All';

 async function loadCustomers() {
 try {
 allCustomers = await window.api.getCustomers();
 document.getElementById('cust-count').textContent = `${allCustomers.length} customer(s)`;
 applyFilters();
 } catch (err) { showToast('Error loading customers: ' + err.message, 'error'); }
 }

 function applyFilters() {
 const q = document.getElementById('cust-search').value.toLowerCase();
 const filtered = allCustomers.filter(c => {
 const matchesSearch = c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
 // Normalize legacy 'Direct Customer' to 'Retailer' for filtering
 const custType = c.customer_type || 'Retailer';
 const normalizedType = custType === 'Direct Customer' ? 'Retailer' : custType;
 const matchesType = activeTypeFilter === 'All' || normalizedType === activeTypeFilter;
 return matchesSearch && matchesType;
 });
 renderTable(filtered);
 }

 function renderTable(customers) {
 const tbody = document.getElementById('customers-table-body');
 tbody.innerHTML = '';
 if (!customers.length) {
 tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">No customers yet. Add your first customer!</td></tr>';
 return;
 }
 customers.forEach(c => {
 const purchaseTotal = c.receipt_id ? c.purchase_total : c.total_purchases;
 const purchaseBalance = c.receipt_id ? c.purchase_balance : c.balance_amount;
 const hasBalance = parseFloat(purchaseBalance || 0) > 0;
 
 const tr = document.createElement('tr');
 // Normalize legacy 'Direct Customer' to 'Retailer' for display
 const displayType = (c.customer_type === 'Direct Customer') ? 'Retailer' : (c.customer_type || 'Retailer');
 const isEngineer = displayType === 'Engineer';
 tr.innerHTML = `
 <td style="color:var(--text-muted);font-size:12px;">${c.id}</td>
 <td>
 <strong>${escapeHtml(c.name)}</strong>
 ${c.receipt_number ? `<br><span style="font-size:11px;color:var(--text-muted);">${escapeHtml(c.receipt_number)} (${new Date(c.receipt_date).toLocaleDateString('en-IN')})</span>` : ''}
 </td>
 <td><span class="status-badge ${isEngineer ? 'approved' : 'pending'}">${escapeHtml(displayType)}</span></td>
 <td>${escapeHtml(c.phone || '-')}</td>
 <td style="font-size:12px;">${escapeHtml(c.address || '-')}</td>
 <td><strong>&#8377;${parseFloat(purchaseTotal || 0).toFixed(2)}</strong></td>
 <td style="color:${hasBalance ? 'var(--danger-color)' : 'var(--success-color)'};font-weight:700;">&#8377;${parseFloat(purchaseBalance || 0).toFixed(2)}</td>
  <td class="actions-col">
  <div class="table-actions">
  <button class="btn btn-action btn-history btn-view-history" data-id="${c.id}" data-name="${escapeHtml(c.name)}">History</button>
  <button class="btn btn-action btn-edit btn-edit-cust" data-id="${c.id}">Edit</button>
  <a href="stock-out.html" class="btn btn-action btn-sale" style="text-decoration:none;">Sale</a>
  <button class="btn btn-action btn-delete btn-delete-cust" data-id="${c.id}" data-name="${escapeHtml(c.name)}">Delete</button>
  </div>
  </td>
  `;
 
 const viewHistoryBtn = tr.querySelector('.btn-view-history');
 viewHistoryBtn.addEventListener('click', () => {
 viewHistory(parseInt(viewHistoryBtn.dataset.id), viewHistoryBtn.dataset.name);
 });
 
 const editBtn = tr.querySelector('.btn-edit-cust');
 editBtn.addEventListener('click', () => {
 openEditCust(parseInt(editBtn.dataset.id));
 });
 
 const deleteBtn = tr.querySelector('.btn-delete-cust');
 deleteBtn.addEventListener('click', () => {
 deleteCustomer(parseInt(deleteBtn.dataset.id), deleteBtn.dataset.name);
 });
 
 tbody.appendChild(tr);
 });
 }

 // Tab filter listeners
 const tabs = document.querySelectorAll('#cust-filter-tabs .filter-tab');
 tabs.forEach(tab => {
 tab.addEventListener('click', (e) => {
 tabs.forEach(t => {
 t.classList.remove('btn-primary');
 t.classList.add('btn-secondary');
 });
 e.target.classList.remove('btn-secondary');
 e.target.classList.add('btn-primary');
 activeTypeFilter = e.target.dataset.type;
 applyFilters();
 });
 });

 // Search
 document.getElementById('cust-search').addEventListener('input', (e) => {
 applyFilters();
 });

 // Add customer
 document.getElementById('add-customer-form').addEventListener('submit', async (e) => {
 e.preventDefault();
 document.getElementById('add-cust-alert').style.display = 'none';
 const name = document.getElementById('cust-name').value.trim();
 const customer_type = document.getElementById('cust-type').value;
 const phone = document.getElementById('cust-phone').value.trim();
 const address = document.getElementById('cust-address').value.trim();

 if (!name) return showAlert('add-cust-alert', 'Customer name is required.');
 if (!customer_type) return showAlert('add-cust-alert', 'Please select a customer type.');
 if (phone && !/^[+\d\s\-()]{7,15}$/.test(phone)) return showAlert('add-cust-alert', 'Enter a valid phone number.');

 const result = await window.api.addCustomer({ name, phone, address, customer_type });
 if (result.success) {
 showToast(` Customer "${name}" added!`);
 e.target.reset();
 document.getElementById('add-cust-alert').style.display = 'none';
 loadCustomers();
 } else {
 showAlert('add-cust-alert', result.error || 'Failed to add customer.');
 }
 });

 // View history
 async function viewHistory(id, name) {
 document.getElementById('history-modal-title').textContent = ` Purchase History — ${name}`;
 document.getElementById('history-table-body').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Loading...</td></tr>';
 document.getElementById('history-modal').style.display = 'flex';

 const history = await window.api.getCustomerHistory(id);
 const tbody = document.getElementById('history-table-body');
 tbody.innerHTML = '';
 if (!history.length) {
 tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No purchases recorded yet.</td></tr>';
 return;
 }
 history.forEach(r => {
 const hasBalance = parseFloat(r.balance_amount) > 0;
 tbody.innerHTML += `
 <tr>
 <td><strong style="color:var(--primary-color)">${escapeHtml(r.receipt_number)}</strong></td>
 <td style="font-size:12px;">${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
 <td>₹${parseFloat(r.total_amount || 0).toFixed(2)}</td>
 <td style="color:var(--success-color)">₹${parseFloat(r.paid_amount || 0).toFixed(2)}</td>
 <td style="color:${hasBalance ? 'var(--danger-color)' : 'var(--success-color)'}">₹${parseFloat(r.balance_amount || 0).toFixed(2)}</td>
 <td style="font-size:12px;">${escapeHtml(r.materials || '-')}</td>
 </tr>`;
 });
 }

 function closeHistoryModal() {
 document.getElementById('history-modal').style.display = 'none';
 }

 // Edit customer
 function openEditCust(id) {
 const c = allCustomers.find(x => x.id === id);
 if (!c) return;
 document.getElementById('edit-cust-id').value = c.id;
 document.getElementById('edit-cust-name').value = c.name;
 // Map legacy 'Direct Customer' to 'Retailer'
 const custType = c.customer_type === 'Direct Customer' ? 'Retailer' : (c.customer_type || 'Retailer');
 document.getElementById('edit-cust-type').value = custType;
 document.getElementById('edit-cust-phone').value = c.phone || '';
 document.getElementById('edit-cust-address').value = c.address || '';
 document.getElementById('edit-cust-alert').style.display = 'none';
 document.getElementById('edit-cust-modal').style.display = 'flex';
 }

 function closeEditCustModal() {
 document.getElementById('edit-cust-modal').style.display = 'none';
 }

 // Bind close/cancel listeners
 const closeHistBtn = document.getElementById('btn-close-history');
 if (closeHistBtn) closeHistBtn.addEventListener('click', closeHistoryModal);

 const cancelHistBtn = document.getElementById('btn-cancel-history');
 if (cancelHistBtn) cancelHistBtn.addEventListener('click', closeHistoryModal);

 const closeEditCustBtn = document.getElementById('btn-close-edit-cust');
 if (closeEditCustBtn) closeEditCustBtn.addEventListener('click', closeEditCustModal);

 const cancelEditCustBtn = document.getElementById('btn-cancel-edit-cust');
 if (cancelEditCustBtn) cancelEditCustBtn.addEventListener('click', closeEditCustModal);

 document.getElementById('edit-customer-form').addEventListener('submit', async (e) => {
 e.preventDefault();
 const id = parseInt(document.getElementById('edit-cust-id').value);
 const name = document.getElementById('edit-cust-name').value.trim();
 const customer_type = document.getElementById('edit-cust-type').value;
 const phone = document.getElementById('edit-cust-phone').value.trim();
 const address = document.getElementById('edit-cust-address').value.trim();

 if (!name) return showAlert('edit-cust-alert', 'Name is required.');

 const result = await window.api.updateCustomer({ id, name, phone, address, customer_type });
 if (result.success) {
 showToast(' Customer updated!');
 closeEditCustModal();
 loadCustomers();
 } else {
 showAlert('edit-cust-alert', result.error || 'Update failed.');
 }
 });

 async function deleteCustomer(id, name) {
 const confirmed = confirm(`Are you sure you want to delete customer "${name}"?\n\nThis will soft-delete the customer record so reports remain intact.`);
 if (!confirmed) return;
 try {
 const result = await window.api.deleteCustomer(id);
 if (result.success) {
 showToast(` Customer "${name}" deleted successfully.`);
 loadCustomers();
 } else {
 showToast('Error deleting customer: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 }
 
 loadCustomers();
});
