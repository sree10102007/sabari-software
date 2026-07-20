document.addEventListener('DOMContentLoaded', () => {
 const showToast = (msg, type = 'success') => {
 const t = document.getElementById('toast');
 t.textContent = msg; t.className = `notification show ${type}`;
 setTimeout(() => { t.className = 'notification'; }, 4000);
 };

 function showAlert(id, msg, type = 'error') {
 const el = document.getElementById(id);
 el.textContent = msg;
 el.style.cssText = type === 'error'
 ? 'display:block;background:var(--danger-bg);color:var(--danger-color);border:1px solid rgba(198,40,40,0.2);padding:10px;margin-bottom:12px;border-radius:var(--border-radius-md);font-weight:600;font-size:13px;'
 : 'display:block;background:var(--success-bg);color:var(--success-color);border:1px solid rgba(46,125,50,0.2);padding:10px;margin-bottom:12px;border-radius:var(--border-radius-md);font-weight:600;font-size:13px;';
 }

 

 let allMaterials = [];

 // Toggle form
 const toggleBtn = document.getElementById('toggle-form-btn');
 const formWrapper = document.getElementById('add-form-wrapper');
 toggleBtn.addEventListener('click', () => {
 const hidden = formWrapper.style.display === 'none';
 formWrapper.style.display = hidden ? 'block' : 'none';
 toggleBtn.textContent = hidden ? 'Hide Form ▲' : 'Show Form ▼';
 });

 async function loadMaterials() {
 try {
 allMaterials = await window.api.getMaterials();
 document.getElementById('mat-count').textContent = `${allMaterials.length} material(s)`;
 renderTable(allMaterials);
 } catch (err) { showToast('Error loading materials: ' + err.message, 'error'); }
 }

 function renderTable(materials) {
 const tbody = document.getElementById('materials-table-body');
 tbody.innerHTML = '';
 if (!materials.length) {
 tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">No materials found.</td></tr>';
 return;
 }
 materials.forEach((m, i) => {
 const isLow = m.current_stock <= m.minimum_stock;
 const statusBadge = isLow
 ? '<span class="status-badge low-stock">Low Stock</span>'
 : '<span class="status-badge available">Available</span>';
 const stockColor = isLow ? 'color:var(--danger-color);font-weight:bold' : 'color:var(--success-color);font-weight:bold';
 
 const tr = document.createElement('tr');
 tr.innerHTML = `
 <td style="color:var(--text-muted);font-size:12px;font-weight:600;">${i + 1}</td>
 <td><strong>${escapeHtml(m.name)}</strong></td>
 <td>${escapeHtml(m.category || '-')}</td>
 <td>${escapeHtml(m.unit)}</td>
 <td>₹${parseFloat(m.rate || 0).toFixed(2)}</td>
 <td style="${stockColor}">${m.current_stock} ${escapeHtml(m.unit)}</td>
 <td>${m.minimum_stock} ${escapeHtml(m.unit)}</td>
 <td>${statusBadge}</td>
 <td class="actions-col">
 <div class="table-actions">
 <button class="btn btn-action btn-edit btn-edit-mat" data-id="${m.id}">Edit</button>
 <a href="add-stock.html?material_id=${m.id}" class="btn btn-action btn-add-stock" style="text-decoration:none;">Add Stock</a>
 <button class="btn btn-action btn-delete btn-delete-mat" data-id="${m.id}" data-name="${escapeHtml(m.name)}">Delete</button>
 </div>
 </td>
 `;
 
 const editBtn = tr.querySelector('.btn-edit-mat');
 editBtn.addEventListener('click', () => {
 openEditModal(parseInt(editBtn.dataset.id));
 });
 
 const deleteBtn = tr.querySelector('.btn-delete-mat');
 deleteBtn.addEventListener('click', () => {
 deleteMaterial(parseInt(deleteBtn.dataset.id), deleteBtn.dataset.name);
 });
 
 tbody.appendChild(tr);
 });
 }

 // Search
 document.getElementById('mat-search').addEventListener('input', (e) => {
 const q = e.target.value.toLowerCase();
 const filtered = allMaterials.filter(m =>
 m.name.toLowerCase().includes(q) ||
 (m.category || '').toLowerCase().includes(q) ||
 m.unit.toLowerCase().includes(q)
 );
 renderTable(filtered);
 });

 // Add material form
 document.getElementById('add-material-form').addEventListener('submit', async (e) => {
 e.preventDefault();
 document.getElementById('add-mat-alert').style.display = 'none';
 const name = document.getElementById('mat-name').value.trim();
 const category = document.getElementById('mat-category').value.trim();
 const unit = document.getElementById('mat-unit').value.trim();
 const rate = parseFloat(document.getElementById('mat-rate').value) || 0;
 const current_stock = parseFloat(document.getElementById('mat-current').value) || 0;
 const minimum_stock = parseFloat(document.getElementById('mat-minimum').value) || 0;

 if (!name) return showAlert('add-mat-alert', 'Material name is required.');
 if (!unit) return showAlert('add-mat-alert', 'Unit is required.');

 const result = await window.api.addMaterial({ name, category, unit, current_stock, minimum_stock, rate });
 if (result.success) {
 showToast(` Material "${name}" added successfully!`);
 e.target.reset();
 document.getElementById('add-mat-alert').style.display = 'none';
 loadMaterials();
 } else {
 showAlert('add-mat-alert', result.error || 'Failed to add material.');
 }
 });

 // Edit modal
 async function openEditModal(id) {
 const m = allMaterials.find(x => x.id === id);
 if (!m) return;
 document.getElementById('edit-mat-id').value = m.id;
 document.getElementById('edit-mat-name').value = m.name;
 document.getElementById('edit-mat-category').value = m.category || '';

 // Set unit select: if saved unit isn't Bags/Kg (legacy data), add a temporary option
 const unitSelect = document.getElementById('edit-mat-unit');
 const knownUnits = ['Bags', 'Kg', 'Packets'];
 // Remove any previous legacy options first
 Array.from(unitSelect.options).forEach(opt => { if (opt.dataset.legacy === 'true') opt.remove(); });
 
 if (m.unit && !knownUnits.includes(m.unit)) {
   // Add legacy unit option temporarily so old data displays correctly
   const legacyOpt = document.createElement('option');
   legacyOpt.value = m.unit;
   legacyOpt.textContent = m.unit + ' (legacy)';
   legacyOpt.dataset.legacy = 'true';
   unitSelect.appendChild(legacyOpt);
 }
 unitSelect.value = m.unit;

 document.getElementById('edit-mat-rate').value = m.rate || 0;
 document.getElementById('edit-mat-minimum').value = m.minimum_stock || 0;
 document.getElementById('edit-mat-alert').style.display = 'none';
 document.getElementById('edit-modal').style.display = 'flex';
 }

 function closeEditModal() {
 document.getElementById('edit-modal').style.display = 'none';
 }

 const closeEditBtn = document.getElementById('btn-close-edit');
 if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditModal);

 const cancelEditBtn = document.getElementById('btn-cancel-edit');
 if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditModal);

 document.getElementById('edit-material-form').addEventListener('submit', async (e) => {
 e.preventDefault();
 const id = parseInt(document.getElementById('edit-mat-id').value);
 const name = document.getElementById('edit-mat-name').value.trim();
 const category = document.getElementById('edit-mat-category').value.trim();
 const unit = document.getElementById('edit-mat-unit').value.trim();
 const rate = parseFloat(document.getElementById('edit-mat-rate').value) || 0;
 const minimum_stock = parseFloat(document.getElementById('edit-mat-minimum').value) || 0;

 if (!name || !unit) return showAlert('edit-mat-alert', 'Name and unit are required.');

 const result = await window.api.updateMaterial({ id, name, category, unit, minimum_stock, rate });
 if (result.success) {
 showToast(' Material updated!');
 closeEditModal();
 loadMaterials();
 } else {
 showAlert('edit-mat-alert', result.error || 'Update failed.');
 }
 });

 async function deleteMaterial(id, name) {
 const confirmed = confirm(`Are you sure you want to delete material "${name}"?\n\nThis will soft-delete the material catalog item.`);
 if (!confirmed) return;
 try {
 const result = await window.api.deleteMaterial(id);
 if (result.success) {
 showToast(` Material "${name}" deleted.`);
 loadMaterials();
 } else {
 showToast('Error deleting material: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 }
 
 loadMaterials();
});
