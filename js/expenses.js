/**
 * Expenses Module Javascript Logic - Refactored (Operational Entry Only)
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  try {
    const currentUser = await window.api.getSession();
    if (!currentUser) {
      window.location.href = 'login.html';
      return;
    }
    document.getElementById('user-display-name').textContent = currentUser.name;
  } catch (err) {
    window.location.href = 'login.html';
    return;
  }

  // Logout handler
  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.api.logout();
    window.location.href = 'login.html';
  });

  // UI Toast helper
  const showToast = (msg, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `notification show ${type}`;
    setTimeout(() => { toast.className = 'notification'; }, 4000);
  };

  // Elements
  const expenseForm = document.getElementById('expense-form');
  const expenseId = document.getElementById('expense-id');
  const expDate = document.getElementById('exp-date');
  const expCategory = document.getElementById('exp-category');
  const expType = document.getElementById('exp-type');
  const expAmount = document.getElementById('exp-amount');
  const expRemarks = document.getElementById('exp-remarks');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const btnSubmit = document.getElementById('btn-submit');
  const expenseFormTitle = document.getElementById('expense-form-title');
  const formExpenseContainer = document.getElementById('form-expense-container');
  const vehicleExpensesBody = document.getElementById('vehicle-expenses-body');
  const personalExpensesBody = document.getElementById('personal-expenses-body');

  // Panels
  const panelProduct = document.getElementById('panel-product');
  const expSupplierName = document.getElementById('exp-supplier-name');
  
  const panelVehicle = document.getElementById('panel-vehicle');
  const expVehicleNumber = document.getElementById('exp-vehicle-number');
  
  const panelPersonal = document.getElementById('panel-personal');
  const expPersonName = document.getElementById('exp-person-name');

  const productExpensesBody = document.getElementById('product-expenses-body');

  // Types definitions
  const productTypes = ['Dalmia Cement', 'Chettinad Cement', 'Crusher', 'Other'];
  const vehicleTypes = ['Fuel', 'Driver Allowance', 'Toll Charges', 'Maintenance', 'Loading / Unloading', 'Other'];
  const personalTypes = ['Worker Pay', 'Tea / Snacks', 'Refreshments', 'Office Expense', 'Salary / Allowance', 'Other'];

  // Initialize
  initExpenses();

  function initExpenses() {
    // Set default date to today
    expDate.value = new Date().toLocaleString('sv').split(' ')[0];

    // Category selection listener
    expCategory.addEventListener('change', handleCategoryChange);

    // Form Submission
    expenseForm.addEventListener('submit', handleFormSubmit);

    // Cancel Edit Button
    btnCancelEdit.addEventListener('click', resetExpenseForm);

    // Initial load
    loadExpenseHistory();
  }

  function handleCategoryChange() {
    const cat = expCategory.value;
    expType.disabled = false;
    expType.innerHTML = '<option value="">-- Select Type --</option>';

    if (cat === 'product') {
      panelProduct.style.display = 'block';
      panelVehicle.style.display = 'none';
      panelPersonal.style.display = 'none';

      expVehicleNumber.required = false;
      expPersonName.required = false;
      expVehicleNumber.value = '';
      expPersonName.value = '';

      productTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        expType.appendChild(opt);
      });
    } else if (cat === 'vehicle') {
      panelProduct.style.display = 'none';
      panelVehicle.style.display = 'block';
      panelPersonal.style.display = 'none';

      expVehicleNumber.required = true;
      expPersonName.required = false;
      expSupplierName.value = '';
      expPersonName.value = '';

      vehicleTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        expType.appendChild(opt);
      });
    } else if (cat === 'personal') {
      panelProduct.style.display = 'none';
      panelVehicle.style.display = 'none';
      panelPersonal.style.display = 'block';

      expVehicleNumber.required = false;
      expVehicleNumber.value = '';
      expSupplierName.value = '';
      expPersonName.required = true;

      personalTypes.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        expType.appendChild(opt);
      });
    } else {
      panelProduct.style.display = 'none';
      panelVehicle.style.display = 'none';
      panelPersonal.style.display = 'none';
      expVehicleNumber.required = false;
      expPersonName.required = false;
      expSupplierName.value = '';
      expVehicleNumber.value = '';
      expPersonName.value = '';
      
      expType.disabled = true;
      expType.innerHTML = '<option value="">-- Select Category First --</option>';
    }
  }

  // Load and Render Expense Log list
  async function loadExpenseHistory() {
    try {
      const list = await window.api.getExpenses({});
      renderHistoryLog(list);
    } catch (err) {
      showToast('Error loading expense records: ' + err.message, 'error');
    }
  }

  function renderHistoryLog(items) {
    if (productExpensesBody) productExpensesBody.innerHTML = '';
    vehicleExpensesBody.innerHTML = '';
    personalExpensesBody.innerHTML = '';

    const productItems = items.filter(i => i.expense_category === 'product');
    const vehicleItems = items.filter(i => i.expense_category === 'vehicle');
    const personalItems = items.filter(i => i.expense_category === 'personal');

    // Render Product / Stock Expenses
    if (productExpensesBody) {
      if (productItems.length === 0) {
        productExpensesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No product / stock expenses found.</td></tr>';
      } else {
        productItems.forEach((item, idx) => {
          const tr = document.createElement('tr');
          const d = new Date(item.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
          tr.innerHTML = `
            <td style="color:var(--text-muted);font-size:12px;font-weight:600;">${idx + 1}</td>
            <td>${d}</td>
            <td><strong>${escapeHtml(item.expense_type)}</strong></td>
            <td>${escapeHtml(item.person_name || item.vehicle_number || '-')}</td>
            <td><strong>${formatCurrency(item.amount)}</strong></td>
            <td>${escapeHtml(item.remarks || '-')}</td>
            <td class="actions-col">
              <div class="table-actions">
                <button class="btn btn-action btn-edit btn-edit-exp" data-id="${item.id}">Edit</button>
                <button class="btn btn-action btn-delete btn-delete-exp" data-id="${item.id}">Delete</button>
              </div>
            </td>
          `;
          tr.querySelector('.btn-edit-exp').addEventListener('click', () => populateEditForm(item));
          tr.querySelector('.btn-delete-exp').addEventListener('click', () => handleDeleteExpense(item.id));
          productExpensesBody.appendChild(tr);
        });
      }
    }

    // Render Vehicle Expenses
    if (vehicleItems.length === 0) {
      vehicleExpensesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No vehicle expenses found.</td></tr>';
    } else {
      vehicleItems.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const d = new Date(item.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        tr.innerHTML = `
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;">${idx + 1}</td>
          <td>${d}</td>
          <td><strong>${escapeHtml(item.vehicle_number || '-')}</strong></td>
          <td>${escapeHtml(item.expense_type)}</td>
          <td><strong>${formatCurrency(item.amount)}</strong></td>
          <td>${escapeHtml(item.remarks || '-')}</td>
          <td class="actions-col">
            <div class="table-actions">
              <button class="btn btn-action btn-edit btn-edit-exp" data-id="${item.id}">Edit</button>
              <button class="btn btn-action btn-delete btn-delete-exp" data-id="${item.id}">Delete</button>
            </div>
          </td>
        `;
        tr.querySelector('.btn-edit-exp').addEventListener('click', () => populateEditForm(item));
        tr.querySelector('.btn-delete-exp').addEventListener('click', () => handleDeleteExpense(item.id));
        vehicleExpensesBody.appendChild(tr);
      });
    }

    // Render Personal Expenses
    if (personalItems.length === 0) {
      personalExpensesBody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">No personal expenses found.</td></tr>';
    } else {
      personalItems.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const d = new Date(item.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        tr.innerHTML = `
          <td style="color:var(--text-muted);font-size:12px;font-weight:600;">${idx + 1}</td>
          <td>${d}</td>
          <td><strong>${escapeHtml(item.person_name || '-')}</strong></td>
          <td>${escapeHtml(item.expense_type)}</td>
          <td><strong>${formatCurrency(item.amount)}</strong></td>
          <td>${escapeHtml(item.remarks || '-')}</td>
          <td class="actions-col">
            <div class="table-actions">
              <button class="btn btn-action btn-edit btn-edit-exp" data-id="${item.id}">Edit</button>
              <button class="btn btn-action btn-delete btn-delete-exp" data-id="${item.id}">Delete</button>
            </div>
          </td>
        `;
        tr.querySelector('.btn-edit-exp').addEventListener('click', () => populateEditForm(item));
        tr.querySelector('.btn-delete-exp').addEventListener('click', () => handleDeleteExpense(item.id));
        personalExpensesBody.appendChild(tr);
      });
    }
  }

  function formatCurrency(value) {
    const amount = Number(value || 0);
    return `₹${amount.toFixed(2)}`;
  }

  function parseMoneyInput(value) {
    const cleaned = String(value ?? "")
      .replace(/[₹,\s]/g, "")
      .trim();

    if (cleaned === "") {
      throw new Error("Amount is required");
    }

    const amount = Number(cleaned);

    if (!Number.isFinite(amount)) {
      throw new Error("Invalid amount");
    }

    if (amount < 0) {
      throw new Error("Amount cannot be negative");
    }

    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  // Form Submit (Add/Update)
  async function handleFormSubmit(e) {
    e.preventDefault();
    const id = expenseId.value;
    const date = expDate.value;
    const category = expCategory.value;
    const type = expType.value;
    const remarks = expRemarks.value.trim();

    let amount;
    try {
      amount = parseMoneyInput(expAmount.value);
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    if (!date || !category || !type) {
      showToast('Please fill all required fields.', 'error');
      return;
    }

    const payload = {
      expense_category: category,
      expense_date: date,
      vehicle_number: category === 'vehicle' ? expVehicleNumber.value.trim().toUpperCase() : null,
      person_name: category === 'personal' ? expPersonName.value : (category === 'product' ? expSupplierName.value.trim() : null),
      expense_type: type,
      amount,
      remarks
    };

    // Sub-validations
    if (category === 'vehicle' && !payload.vehicle_number) {
      showToast('Vehicle number is required.', 'error');
      return;
    }
    if (category === 'personal' && !payload.person_name) {
      showToast('Person name is required.', 'error');
      return;
    }

    try {
      let res;
      if (id) {
        res = await window.api.updateExpense(parseInt(id), payload);
      } else {
        res = await window.api.addExpense(payload);
      }

      if (res.success) {
        showToast(id ? 'Expense record updated successfully!' : 'Expense record added successfully!');
        resetExpenseForm();
        loadExpenseHistory();
      } else {
        showToast('Error saving expense: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('System error: ' + err.message, 'error');
    }
  }

  // Handle Delete Expense
  async function handleDeleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense record?')) return;
    try {
      const res = await window.api.deleteExpense(id);
      if (res.success) {
        showToast('Expense record deleted.');
        loadExpenseHistory();
      } else {
        showToast('Error deleting expense: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('System error: ' + err.message, 'error');
    }
  }

  // Populate Edit Form
  function populateEditForm(item) {
    expenseId.value = item.id;
    expDate.value = item.expense_date;
    expCategory.value = item.expense_category;
    
    // Toggle dynamic controls and populated dropdown
    handleCategoryChange();

    expType.value = item.expense_type;
    expAmount.value = (Math.round(parseFloat(item.amount || 0) * 100) / 100).toFixed(2);
    expRemarks.value = item.remarks || '';

    if (item.expense_category === 'vehicle') {
      expVehicleNumber.value = item.vehicle_number || '';
    } else if (item.expense_category === 'product') {
      expSupplierName.value = item.person_name || '';
    } else {
      expPersonName.value = item.person_name || '';
    }

    expenseFormTitle.textContent = 'Edit Expense Details';
    btnSubmit.textContent = 'Update Expense';
    btnCancelEdit.style.display = 'inline-block';
    formExpenseContainer.classList.add('edit-highlight');
  }

  // Reset Form
  function resetExpenseForm() {
    expenseForm.reset();
    expenseId.value = '';
    expDate.value = new Date().toLocaleString('sv').split(' ')[0];
    
    panelProduct.style.display = 'none';
    panelVehicle.style.display = 'none';
    panelPersonal.style.display = 'none';
    expVehicleNumber.required = false;
    expPersonName.required = false;

    expType.disabled = true;
    expType.innerHTML = '<option value="">-- Select Category First --</option>';

    expenseFormTitle.textContent = 'Add New Expense';
    btnSubmit.textContent = 'Add Expense';
    btnCancelEdit.style.display = 'none';
    formExpenseContainer.classList.remove('edit-highlight');
  }
});
