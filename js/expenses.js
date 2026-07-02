/**
 * Expenses Module Javascript Logic
 */
document.addEventListener('DOMContentLoaded', async () => {
 window.location.href = 'admin-dashboard.html';
 return;
 // Elements - Summary Cards
 const summaryTodayTotal = document.getElementById('summary-today-total');
 const summaryVehicleToday = document.getElementById('summary-vehicle-today');
 const summaryPersonalToday = document.getElementById('summary-personal-today');
 const summaryMonthlyTotal = document.getElementById('summary-monthly-total');

 // Elements - Vehicle Expenses
 const vehicleTableBody = document.getElementById('vehicle-table-body');
 const vehicleSearch = document.getElementById('vehicle-search');
 const vehicleFromDate = document.getElementById('vehicle-from-date');
 const vehicleToDate = document.getElementById('vehicle-to-date');
 const btnVehicleFilter = document.getElementById('btn-vehicle-filter');
 const btnAddVehicleExpense = document.getElementById('btn-add-vehicle-expense');

 // Elements - Personal Expenses
 const personalTableBody = document.getElementById('personal-table-body');
 const personalSearch = document.getElementById('personal-search');
 const personalEmpFilter = document.getElementById('personal-emp-filter');
 const personalFromDate = document.getElementById('personal-from-date');
 const personalToDate = document.getElementById('personal-to-date');
 const btnPersonalFilter = document.getElementById('btn-personal-filter');
 const btnAddPersonalExpense = document.getElementById('btn-add-personal-expense');

 // Modals
 const vehicleModal = document.getElementById('vehicle-modal');
 const personalModal = document.getElementById('personal-modal');

 // Form Elements - Vehicle Modal
 const vehicleExpenseForm = document.getElementById('vehicle-expense-form');
 const vehicleExpenseId = document.getElementById('vehicle-expense-id');
 const vExpDate = document.getElementById('v-exp-date');
 const vExpNumber = document.getElementById('v-exp-number');
 const vExpFuel = document.getElementById('v-exp-fuel');
 const vExpSnacks = document.getElementById('v-exp-snacks');
 const vExpOther = document.getElementById('v-exp-other');
 const vExpRemarks = document.getElementById('v-exp-remarks');
 const btnCloseVehicleModal = document.getElementById('btn-close-vehicle-modal');
 const btnCancelVehicleModal = document.getElementById('btn-cancel-vehicle-modal');

 // Form Elements - Personal Modal
 const personalExpenseForm = document.getElementById('personal-expense-form');
 const personalExpenseId = document.getElementById('personal-expense-id');
 const pExpDate = document.getElementById('p-exp-date');
 const pExpEmployee = document.getElementById('p-exp-employee');
 const pExpDesc = document.getElementById('p-exp-desc');
 const pExpAmount = document.getElementById('p-exp-amount');
 const pExpRemarks = document.getElementById('p-exp-remarks');
 const btnClosePersonalModal = document.getElementById('btn-close-personal-modal');
 const btnCancelPersonalModal = document.getElementById('btn-cancel-personal-modal');

 // Active Sessions / User context
 let employeesList = [];

 // Initialize
 await initExpenses();

 async function initExpenses() {
 // Set default dates to today
 const todayStr = getTodayString();
 vehicleFromDate.value = todayStr;
 vehicleToDate.value = todayStr;
 personalFromDate.value = todayStr;
 personalToDate.value = todayStr;

 await loadEmployees();
 await loadSummary();
 await loadVehicleExpenses();
 await loadPersonalExpenses();
 }

 // Helper YYYY-MM-DD
 function getTodayString() {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
 }

 // Load Employees to Dropdowns
 async function loadEmployees() {
 try {
 employeesList = await window.api.getEmployees();
 
 // Populate filters
 personalEmpFilter.innerHTML = '<option value="">All Personnel</option>';
 pExpEmployee.innerHTML = '<option value="">Select Employee</option>';

 employeesList.forEach(emp => {
 const opt = document.createElement('option');
 opt.value = emp.id;
 opt.textContent = `${emp.name} (${emp.role || 'Personnel'})`;
 pExpEmployee.appendChild(opt);

 const filterOpt = document.createElement('option');
 filterOpt.value = emp.id;
 filterOpt.textContent = emp.name;
 personalEmpFilter.appendChild(filterOpt);
 });
 } catch (err) {
 showToast('Error loading employees: ' + err.message, 'error');
 }
 }

 // Load Summary Stats
 async function loadSummary() {
 try {
 const summary = await window.api.getExpensesSummary();
 summaryTodayTotal.textContent = '₹' + (summary.todayTotal || 0).toFixed(2);
 summaryVehicleToday.textContent = '₹' + (summary.vehicleToday || 0).toFixed(2);
 summaryPersonalToday.textContent = '₹' + (summary.personalToday || 0).toFixed(2);
 summaryMonthlyTotal.textContent = '₹' + (summary.monthlyTotal || 0).toFixed(2);
 } catch (err) {
 console.error('Error loading expenses summary:', err);
 }
 }

 // =============================================================
 // VEHICLE EXPENSES LOGIC
 // =============================================================

 async function loadVehicleExpenses() {
 try {
 const filters = {
 search: vehicleSearch.value.trim(),
 from_date: vehicleFromDate.value,
 to_date: vehicleToDate.value
 };
 const data = await window.api.getVehicleExpenses(filters);
 renderVehicleExpenses(data);
 } catch (err) {
 showToast('Error loading vehicle expenses: ' + err.message, 'error');
 }
 }

 function renderVehicleExpenses(items) {
 vehicleTableBody.innerHTML = '';
 if (items.length === 0) {
 vehicleTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">No vehicle expenses found.</td></tr>';
 return;
 }

 items.forEach(item => {
 const tr = document.createElement('tr');
 const formattedDate = new Date(item.date).toLocaleDateString('en-IN', {
 day: '2-digit', month: '2-digit', year: 'numeric'
 });

 tr.innerHTML = `
 <td>${formattedDate}</td>
 <td><strong>${escapeHtml(item.vehicle_number)}</strong></td>
 <td>₹${parseFloat(item.fuel_expense || 0).toFixed(2)}</td>
 <td>₹${parseFloat(item.tn_snacks_expense || 0).toFixed(2)}</td>
 <td>₹${parseFloat(item.other_expense || 0).toFixed(2)}</td>
 <td><strong>₹${parseFloat(item.total || 0).toFixed(2)}</strong></td>
 <td>${escapeHtml(item.remarks || '-')}</td>
  <td class="actions-col">
  <div class="table-actions">
  <button class="btn btn-action btn-edit btn-edit-v" data-id="${item.id}">Edit</button>
  <button class="btn btn-action btn-delete btn-delete-v" data-id="${item.id}" data-num="${escapeHtml(item.vehicle_number)}">Delete</button>
  </div>
  </td>
 `;

 tr.querySelector('.btn-edit-v').addEventListener('click', () => openVehicleEdit(item));
 tr.querySelector('.btn-delete-v').addEventListener('click', () => deleteVehicleExpense(item.id, item.vehicle_number));
 vehicleTableBody.appendChild(tr);
 });
 }

 // Add / Edit Vehicle Expense
 btnAddVehicleExpense.addEventListener('click', () => {
 vehicleExpenseForm.reset();
 vehicleExpenseId.value = '';
 vExpDate.value = getTodayString();
 vehicleModal.style.display = 'flex';
 document.getElementById('vehicle-modal-title').textContent = ' Add Vehicle Expense';
 });

 function openVehicleEdit(item) {
 vehicleExpenseId.value = item.id;
 vExpDate.value = item.date;
 vExpNumber.value = item.vehicle_number;
 vExpFuel.value = item.fuel_expense;
 vExpSnacks.value = item.tn_snacks_expense;
 vExpOther.value = item.other_expense;
 vExpRemarks.value = item.remarks;
 vehicleModal.style.display = 'flex';
 document.getElementById('vehicle-modal-title').textContent = ' Edit Vehicle Expense';
 }

 function closeVehicleModal() {
 vehicleModal.style.display = 'none';
 }
 btnCloseVehicleModal.addEventListener('click', closeVehicleModal);
 btnCancelVehicleModal.addEventListener('click', closeVehicleModal);

 vehicleExpenseForm.addEventListener('submit', async (e) => {
 e.preventDefault();
 const id = vehicleExpenseId.value;
 const date = vExpDate.value;
 const vehicle_number = vExpNumber.value.trim();
 const fuel_expense = parseFloat(vExpFuel.value) || 0;
 const tn_snacks_expense = parseFloat(vExpSnacks.value) || 0;
 const other_expense = parseFloat(vExpOther.value) || 0;
 const remarks = vExpRemarks.value.trim();

 const data = { date, vehicle_number, fuel_expense, tn_snacks_expense, other_expense, remarks };

 try {
 let res;
 if (id) {
 res = await window.api.updateVehicleExpense({ id: parseInt(id), ...data });
 } else {
 res = await window.api.addVehicleExpense(data);
 }

 if (res.success) {
 showToast('Vehicle expense saved successfully!');
 closeVehicleModal();
 await loadSummary();
 await loadVehicleExpenses();
 } else {
 showToast('Error saving: ' + res.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });

 async function deleteVehicleExpense(id, num) {
 if (!confirm(`Are you sure you want to delete vehicle expense for "${num}"?`)) return;
 try {
 const res = await window.api.deleteVehicleExpense(id);
 if (res.success) {
 showToast('Vehicle expense deleted.');
 await loadSummary();
 await loadVehicleExpenses();
 } else {
 showToast('Error deleting: ' + res.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 }

 btnVehicleFilter.addEventListener('click', loadVehicleExpenses);
 vehicleSearch.addEventListener('keypress', (e) => {
 if (e.key === 'Enter') loadVehicleExpenses();
 });


 // =============================================================
 // PERSONAL EXPENSES LOGIC
 // =============================================================

 async function loadPersonalExpenses() {
 try {
 const filters = {
 search: personalSearch.value.trim(),
 employee_id: personalEmpFilter.value ? parseInt(personalEmpFilter.value) : '',
 from_date: personalFromDate.value,
 to_date: personalToDate.value
 };
 const data = await window.api.getPersonalExpenses(filters);
 renderPersonalExpenses(data);
 } catch (err) {
 showToast('Error loading personal expenses: ' + err.message, 'error');
 }
 }

 function renderPersonalExpenses(items) {
 personalTableBody.innerHTML = '';
 if (items.length === 0) {
 personalTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No personal expenses found.</td></tr>';
 return;
 }

 items.forEach(item => {
 const tr = document.createElement('tr');
 const formattedDate = new Date(item.date).toLocaleDateString('en-IN', {
 day: '2-digit', month: '2-digit', year: 'numeric'
 });

 tr.innerHTML = `
 <td>${formattedDate}</td>
 <td><strong>${escapeHtml(item.employee_name)}</strong> <span style="font-size:11px;color:var(--text-muted);">(${escapeHtml(item.employee_role || 'Worker')})</span></td>
 <td>${escapeHtml(item.description)}</td>
 <td><strong>₹${parseFloat(item.amount || 0).toFixed(2)}</strong></td>
 <td>${escapeHtml(item.remarks || '-')}</td>
  <td class="actions-col">
  <div class="table-actions">
  <button class="btn btn-action btn-edit btn-edit-p" data-id="${item.id}">Edit</button>
  <button class="btn btn-action btn-delete btn-delete-p" data-id="${item.id}" data-emp="${escapeHtml(item.employee_name)}">Delete</button>
  </div>
  </td>
 `;

 tr.querySelector('.btn-edit-p').addEventListener('click', () => openPersonalEdit(item));
 tr.querySelector('.btn-delete-p').addEventListener('click', () => deletePersonalExpense(item.id, item.employee_name));
 personalTableBody.appendChild(tr);
 });
 }

 // Add / Edit Personal Expense
 btnAddPersonalExpense.addEventListener('click', () => {
 personalExpenseForm.reset();
 personalExpenseId.value = '';
 pExpDate.value = getTodayString();
 personalModal.style.display = 'flex';
 document.getElementById('personal-modal-title').textContent = ' Add Personal Expense';
 });

 function openPersonalEdit(item) {
 personalExpenseId.value = item.id;
 pExpDate.value = item.date;
 pExpEmployee.value = item.employee_id;
 pExpDesc.value = item.description;
 pExpAmount.value = item.amount;
 pExpRemarks.value = item.remarks;
 personalModal.style.display = 'flex';
 document.getElementById('personal-modal-title').textContent = ' Edit Personal Expense';
 }

 function closePersonalModal() {
 personalModal.style.display = 'none';
 }
 btnClosePersonalModal.addEventListener('click', closePersonalModal);
 btnCancelPersonalModal.addEventListener('click', closePersonalModal);

 personalExpenseForm.addEventListener('submit', async (e) => {
 e.preventDefault();
 const id = personalExpenseId.value;
 const date = pExpDate.value;
 const employee_id = parseInt(pExpEmployee.value);
 const description = pExpDesc.value.trim();
 const amount = parseFloat(pExpAmount.value) || 0;
 const remarks = pExpRemarks.value.trim();

 if (!employee_id) {
 showToast('Please select an employee.', 'error');
 return;
 }

 const data = { employee_id, date, description, amount, remarks };

 try {
 let res;
 if (id) {
 res = await window.api.updatePersonalExpense({ id: parseInt(id), ...data });
 } else {
 res = await window.api.addPersonalExpense(data);
 }

 if (res.success) {
 showToast('Personal expense saved successfully!');
 closePersonalModal();
 await loadSummary();
 await loadPersonalExpenses();
 } else {
 showToast('Error saving: ' + res.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });

 async function deletePersonalExpense(id, emp) {
 if (!confirm(`Are you sure you want to delete personal expense for "${emp}"?`)) return;
 try {
 const res = await window.api.deletePersonalExpense(id);
 if (res.success) {
 showToast('Personal expense deleted.');
 await loadSummary();
 await loadPersonalExpenses();
 } else {
 showToast('Error deleting: ' + res.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 }

 btnPersonalFilter.addEventListener('click', loadPersonalExpenses);
 personalSearch.addEventListener('keypress', (e) => {
 if (e.key === 'Enter') loadPersonalExpenses();
 });
});
