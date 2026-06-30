window.location.href = 'admin-dashboard.html';
document.addEventListener('DOMContentLoaded', async () => {
  // Session check
  let currentUser = null;
  try {
    currentUser = await window.api.getSession();
    if (!currentUser || currentUser.role !== 'retailer') {
      window.location.href = 'login.html';
      return;
    }
    
    document.getElementById('user-display-name').textContent = currentUser.name;
    document.getElementById('user-display-role').textContent = currentUser.role.toUpperCase() + ' PORTAL';
    
    // Pre-fill Customer/Retailer Name
    document.getElementById('customer-name').value = currentUser.name;
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

  // Global cache
  let catalogList = [];

  // Load catalog
  async function loadCatalog() {
    try {
      catalogList = await window.api.getMaterials();
      
      const tbody = document.getElementById('catalog-table-body');
      tbody.innerHTML = '';

      const dropdown = document.getElementById('order-material');
      dropdown.innerHTML = '<option value="">-- Choose Product --</option>';

      catalogList.forEach(m => {
        const isLow = m.current_stock <= m.minimum_stock;
        const statusText = isLow ? 'Low Stock' : 'Available';
        const statusClass = isLow ? 'low-stock' : 'available';

        // 1. Table row
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
          <td><strong>${escapeHtml(m.name)}</strong></td>
          <td>${escapeHtml(m.category || 'N/A')}</td>
          <td><strong>${m.current_stock.toLocaleString()} ${escapeHtml(m.unit)}</strong></td>
          <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        `;

        // Click row to pre-fill form
        tr.addEventListener('click', () => {
          dropdown.value = m.id;
          triggerMaterialChange(m.id);
          document.getElementById('order-qty').focus();
        });

        tbody.appendChild(tr);

        // 2. Dropdown
        const opt = `<option value="${m.id}">${escapeHtml(m.name)}</option>`;
        dropdown.insertAdjacentHTML('beforeend', opt);
      });
    } catch (err) {
      showToast('Error loading catalog: ' + err.message, 'error');
    }
  }

  // Handle dropdown change pre-fill
  const dropdownSelect = document.getElementById('order-material');
  const availabilityLabel = document.getElementById('stock-availability-label');

  function triggerMaterialChange(id) {
    if (!id) {
      availabilityLabel.style.display = 'none';
      return;
    }
    const mat = catalogList.find(m => m.id == id);
    if (mat) {
      const isLow = mat.current_stock <= mat.minimum_stock;
      availabilityLabel.style.color = isLow ? 'var(--danger-color)' : 'var(--success-color)';
      availabilityLabel.innerHTML = `Available Stock: <strong>${mat.current_stock} ${escapeHtml(mat.unit)}</strong>`;
      availabilityLabel.style.display = 'block';
    }
  }

  dropdownSelect.addEventListener('change', () => {
    triggerMaterialChange(dropdownSelect.value);
  });

  // Submit order request
  const orderForm = document.getElementById('retailer-order-form');
  orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const material_id = parseInt(dropdownSelect.value);
    const quantity = parseFloat(document.getElementById('order-qty').value);
    const customer_name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const remarks = document.getElementById('order-remarks').value.trim();

    if (!material_id || quantity <= 0 || !customer_name || !phone) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    try {
      const response = await window.api.submitRetailerOrder({
        material_id,
        customer_name,
        phone,
        quantity,
        remarks
      });

      if (response.success) {
        showToast('Order request submitted successfully. Awaiting Admin release.', 'success');
        orderForm.reset();
        dropdownSelect.value = '';
        availabilityLabel.style.display = 'none';
        
        // Re-prefill Customer Name
        document.getElementById('customer-name').value = currentUser.name;
        
        refreshData();
      } else {
        showToast(response.error || 'Failed to submit order.', 'error');
      }
    } catch (err) {
      showToast('System error: ' + err.message, 'error');
    }
  });

  // Load Retailer history
  async function loadOrderHistory() {
    try {
      const history = await window.api.getRetailerOrders(currentUser.name);
      const tbody = document.getElementById('retailer-history-body');
      tbody.innerHTML = '';

      if (history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No order requests placed yet.</td></tr>';
        return;
      }

      history.forEach(o => {
        const tr = document.createElement('tr');
        const orderDate = new Date(o.created_at).toLocaleString();

        let statusClass = 'pending';
        if (o.status === 'Approved') statusClass = 'approved';
        if (o.status === 'Rejected') statusClass = 'rejected';

        tr.innerHTML = `
          <td><strong>${orderDate}</strong></td>
          <td><strong>${escapeHtml(o.material_name)}</strong></td>
          <td><strong>${o.quantity} ${escapeHtml(o.material_unit)}</strong></td>
          <td>${escapeHtml(o.customer_name)}</td>
          <td>${escapeHtml(o.phone || '-')}</td>
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
    loadCatalog();
    loadOrderHistory();
  }

  // Utilities
  

  // Initial Load
  refreshData();
});
