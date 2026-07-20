document.addEventListener('DOMContentLoaded', () => {
 // Set today's date
 document.getElementById('stock-date').valueAsDate = new Date();

 

 

 let materials = [];

 // Load materials into dropdown
 async function loadMaterials() {
 materials = await window.api.getMaterials();
 const sel = document.getElementById('stock-material');
 sel.innerHTML = '<option value="">-- Select Material --</option>';
 materials.forEach(m => {
 const opt = document.createElement('option');
 opt.value = m.id;
 opt.textContent = `${m.name} (${m.unit}) — Stock: ${m.current_stock}`;
 opt.dataset.stock = m.current_stock;
 opt.dataset.unit = m.unit;
 sel.appendChild(opt);
 });

 // Pre-select if URL param exists
 const params = new URLSearchParams(window.location.search);
 const matId = params.get('material_id');
 if (matId) sel.value = matId;
 if (sel.value) sel.dispatchEvent(new Event('change'));
 }

 // Show current stock when material selected
 document.getElementById('stock-material').addEventListener('change', (e) => {
 const opt = e.target.options[e.target.selectedIndex];
 if (opt.value) {
 document.getElementById('current-stock-value').textContent = `${opt.dataset.stock} ${opt.dataset.unit}`;
 document.getElementById('current-stock-display').style.display = 'block';
 } else {
 document.getElementById('current-stock-display').style.display = 'none';
 }
 });

 // Load recent stock in
 async function loadRecentStockIn() {
 const movements = await window.api.getStockMovements({ movement_type: 'Stock In' });
 const tbody = document.getElementById('recent-stock-in-body');
 tbody.innerHTML = '';
  if (!movements.length) {
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">No stock entries yet.</td></tr>';
  return;
  }
  movements.slice(0, 15).forEach((m, idx) => {
  tbody.innerHTML += `
  <tr>
  <td style="color:var(--text-muted);font-size:12px;font-weight:600;">${idx + 1}</td>
  <td style="font-size:12px;">${new Date(m.created_at).toLocaleDateString('en-IN')}</td>
  <td><strong>${escapeHtml(m.material_name)}</strong></td>
  <td style="color:var(--success-color);font-weight:600;">+${m.quantity} ${escapeHtml(m.material_unit)}</td>
  <td style="font-size:12px;">${escapeHtml(m.supplier_name || '-')}</td>
  </tr>`;
  });
 }

 // Add stock form submit
 document.getElementById('add-stock-form').addEventListener('submit', async (e) => {
 e.preventDefault();
 document.getElementById('add-stock-alert').style.display = 'none';

 const material_id = parseInt(document.getElementById('stock-material').value);
 const quantity = parseFloat(document.getElementById('stock-qty').value);
 const supplier_name = document.getElementById('stock-supplier').value.trim();
 const invoice_number = document.getElementById('stock-invoice').value.trim();
 const vehicle_number = document.getElementById('stock-vehicle').value.trim();
 const remarks = document.getElementById('stock-remarks').value.trim();
 const date = document.getElementById('stock-date').value;

 if (!material_id) return showAlert('Please select a material.');
 if (!quantity || quantity <= 0) return showAlert('Please enter a valid quantity greater than 0.');

 const result = await window.api.addStock({ material_id, quantity, supplier_name, invoice_number, vehicle_number, remarks, date });
 if (result.success) {
 const mat = materials.find(m => m.id === material_id);
 document.getElementById('success-msg').textContent = `Added ${quantity} ${mat ? mat.unit : 'units'} of ${mat ? mat.name : 'material'} to stock.`;
 document.getElementById('success-modal').style.display = 'flex';
 e.target.reset();
 document.getElementById('stock-date').valueAsDate = new Date();
 document.getElementById('current-stock-display').style.display = 'none';
 loadMaterials();
 loadRecentStockIn();
 } else {
 showAlert(result.error || 'Failed to add stock.');
 }
 });

 window.closeSuccessModal = () => {
 document.getElementById('success-modal').style.display = 'none';
 };

 window.goToStockOut = () => {
 window.location.href = 'stock-out.html';
 };

 loadMaterials();
 loadRecentStockIn();
});
