/**
 * Reports & Analytics Dashboard JS Logic
 */
document.addEventListener('DOMContentLoaded', async () => {
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

  // UI Elements
  const reportTypeSelect = document.getElementById('report-type');
  const filterFromDate = document.getElementById('filter-from-date');
  const filterToDate = document.getElementById('filter-to-date');
  const btnGenerate = document.getElementById('btn-generate-report');
  const btnReset = document.getElementById('btn-reset-report');
  const btnPrint = document.getElementById('btn-print-report');
  
  const summaryCardsContainer = document.getElementById('report-summary-cards');
  const errorContainer = document.getElementById('report-error');
  const noDataContainer = document.getElementById('report-no-data');
  const tableCard = document.getElementById('report-table-card');
  const tableHead = document.getElementById('report-table-head');
  const tableBody = document.getElementById('report-table-body');
  const reportTitle = document.getElementById('report-title');

  // Columns Configuration
  const columnsConfig = {
    sales: [
      { label: 'Date', key: 'date', format: 'date' },
      { label: 'Receipt Number', key: 'receipt_number' },
      { label: 'Customer Name', key: 'customer_name' },
      { label: 'Customer Type', key: 'customer_type', format: 'typeBadge' },
      { label: 'Product / Material', key: 'material_name' },
      { label: 'Quantity', key: 'quantity', format: 'qty' },
      { label: 'Total Amount', key: 'total_amount', format: 'currency' },
      { label: 'Paid Amount', key: 'paid_amount', format: 'currency' },
      { label: 'Balance Amount', key: 'balance_amount', format: 'balanceCurrency' },
      { label: 'Payment Status', key: 'payment_status', format: 'statusBadge' }
    ],
    stock: [
      { label: 'Date', key: 'date', format: 'date' },
      { label: 'Material Name', key: 'material_name' },
      { label: 'Movement Type', key: 'movement_type', format: 'movementBadge' },
      { label: 'Quantity', key: 'quantity', format: 'qty' },
      { label: 'Customer / Supplier', key: 'customer_supplier' },
      { label: 'Amount', key: 'amount', format: 'currency' },
      { label: 'Remarks', key: 'remarks' }
    ],
    receipts: [
      { label: 'Receipt Number', key: 'receipt_number' },
      { label: 'Receipt Date', key: 'receipt_date', format: 'date' },
      { label: 'Customer Name', key: 'customer_name' },
      { label: 'Customer Type', key: 'customer_type', format: 'typeBadge' },
      { label: 'Total Amount', key: 'total_amount', format: 'currency' },
      { label: 'Paid Amount', key: 'paid_amount', format: 'currency' },
      { label: 'Balance Amount', key: 'balance_amount', format: 'balanceCurrency' },
      { label: 'Payment Status', key: 'payment_status', format: 'statusBadge' }
    ],
    expenses: [
      { label: 'Expense Date', key: 'expense_date', format: 'date' },
      { label: 'Category', key: 'expense_category', format: 'categoryName' },
      { label: 'Vehicle Number / Person Name', key: 'vehicle_or_person' },
      { label: 'Expense Type', key: 'expense_type' },
      { label: 'Amount', key: 'amount', format: 'currency' },
      { label: 'Remarks', key: 'remarks' }
    ],
    customers: [
      { label: 'Customer Name', key: 'customer_name' },
      { label: 'Phone', key: 'phone' },
      { label: 'Customer Type', key: 'customer_type', format: 'typeBadge' },
      { label: 'Total Purchases', key: 'total_purchases', format: 'currency' },
      { label: 'Total Paid', key: 'total_paid', format: 'currency' },
      { label: 'Total Balance', key: 'total_balance', format: 'balanceCurrency' },
      { label: 'Last Purchase Date', key: 'last_purchase_date', format: 'date' }
    ],
    'low-stock': [
      { label: 'Material Name', key: 'material_name' },
      { label: 'Current Stock', key: 'current_stock' },
      { label: 'Minimum Stock', key: 'minimum_stock', format: 'minStock' },
      { label: 'Unit', key: 'unit' },
      { label: 'Status', key: 'status', format: 'lowStockBadge' }
    ]
  };

  // Helper function to escape HTML safely
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Format date to DD/MM/YYYY
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const cleanDate = dateStr.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  // Format quantity with unit
  function formatQty(val, row) {
    const unit = row.unit || row.material_unit || '';
    return `${val} ${escapeHtml(unit)}`.trim();
  }

  // Format customer type badges
  function formatTypeBadge(val) {
    const type = val || 'Retailer';
    const badgeClass = type === 'Engineer' ? 'pending' : 'available';
    return `<span class="status-badge ${badgeClass}">${escapeHtml(type)}</span>`;
  }

  // Format stock movements status badges
  function formatMovementBadge(val) {
    const isDirectionIn = val === 'Stock In' || val === 'Adjustment';
    const badgeClass = isDirectionIn ? 'available' : 'low-stock';
    return `<span class="status-badge ${badgeClass}">${escapeHtml(val)}</span>`;
  }

  // Format receipt/payment status badges
  function formatStatusBadge(row) {
    const balance = parseFloat(row.balance_amount || 0);
    const paid = parseFloat(row.paid_amount || 0);
    let statusLabel = 'Unpaid';
    let statusClass = 'pending';
    if (balance <= 0) {
      statusLabel = 'Paid';
      statusClass = 'available';
    } else if (paid > 0) {
      statusLabel = 'Partial';
      statusClass = 'low-stock';
    }
    return `<span class="status-badge ${statusClass}">${statusLabel}</span>`;
  }

  // Format low stock status badges
  function formatLowStockBadge(val) {
    const badgeClass = val === 'Out of Stock' ? 'pending' : 'low-stock';
    return `<span class="status-badge ${badgeClass}">${escapeHtml(val)}</span>`;
  }

  // Format category to readable text
  function formatCategoryName(val) {
    if (val === 'vehicle') return 'Vehicle / Logistics';
    if (val === 'personal') return 'Personal / Admin';
    return escapeHtml(val);
  }

  // Render metric summary cards
  function renderSummaryCards(reportType, summary) {
    summaryCardsContainer.innerHTML = '';
    if (!summary) return;

    let cardsHtml = '';
    if (reportType === 'sales') {
      cardsHtml = `
        <div class="card card-accent-green">
          <div>
            <div class="card-title">Total Sales Revenue</div>
            <div class="card-value">₹${parseFloat(summary.totalRevenue || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Total bill value generated</div>
        </div>
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Total Quantity Sold</div>
            <div class="card-value">${parseFloat(summary.totalQtySold || 0).toLocaleString('en-IN')} Units</div>
          </div>
          <div class="card-subtitle">Volume of materials sold</div>
        </div>
      `;
    } else if (reportType === 'stock') {
      cardsHtml = `
        <div class="card card-accent-green">
          <div>
            <div class="card-title">Stock Added (In)</div>
            <div class="card-value">${parseFloat(summary.totalStockIn || 0).toLocaleString('en-IN')} Units</div>
          </div>
          <div class="card-subtitle">Total items received</div>
        </div>
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Stock Shipped (Out)</div>
            <div class="card-value">${parseFloat(summary.totalStockOut || 0).toLocaleString('en-IN')} Units</div>
          </div>
          <div class="card-subtitle">Total items dispatched</div>
        </div>
      `;
    } else if (reportType === 'receipts') {
      cardsHtml = `
        <div class="card card-accent-green">
          <div>
            <div class="card-title">Total Receipts Amount</div>
            <div class="card-value">₹${parseFloat(summary.totalAmount || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Gross receipt value</div>
        </div>
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Total Paid Amount</div>
            <div class="card-value">₹${parseFloat(summary.totalPaid || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Total amount collected</div>
        </div>
        <div class="card card-accent-red">
          <div>
            <div class="card-title">Total Balance Due</div>
            <div class="card-value text-danger">₹${parseFloat(summary.totalBalance || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Total outstanding amount</div>
        </div>
      `;
    } else if (reportType === 'expenses') {
      cardsHtml = `
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Vehicle / Logistics Total</div>
            <div class="card-value">₹${parseFloat(summary.vehicleTotal || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Fuel, tolls, allowance, loading, maintenance</div>
        </div>
        <div class="card card-accent-green">
          <div>
            <div class="card-title">Personal / Admin Total</div>
            <div class="card-value">₹${parseFloat(summary.personalTotal || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Worker pay, tea, snacks, office expenses</div>
        </div>
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Total Expenses</div>
            <div class="card-value">₹${parseFloat(summary.totalExpenses || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Combined total expenses</div>
        </div>
      `;
    } else if (reportType === 'customers') {
      cardsHtml = `
        <div class="card card-accent-green">
          <div>
            <div class="card-title">Total Active Customers</div>
            <div class="card-value">${summary.totalCustomers}</div>
          </div>
          <div class="card-subtitle">Customers in database</div>
        </div>
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Total Purchases</div>
            <div class="card-value">₹${parseFloat(summary.totalPurchases || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Combined purchase volume</div>
        </div>
        <div class="card card-accent-red">
          <div>
            <div class="card-title">Total Outstanding Balance</div>
            <div class="card-value text-danger">₹${parseFloat(summary.totalBalance || 0).toFixed(2)}</div>
          </div>
          <div class="card-subtitle">Outstanding client balance</div>
        </div>
      `;
    } else if (reportType === 'low-stock') {
      cardsHtml = `
        <div class="card card-accent-red">
          <div>
            <div class="card-title">Out of Stock Items</div>
            <div class="card-value text-danger">${summary.outOfStockCount || 0}</div>
          </div>
          <div class="card-subtitle">Products with zero stock</div>
        </div>
        <div class="card card-accent-orange">
          <div>
            <div class="card-title">Low Stock Items</div>
            <div class="card-value">${summary.lowStockCount || 0}</div>
          </div>
          <div class="card-subtitle">Products below safety limit</div>
        </div>
      `;
    }
    summaryCardsContainer.innerHTML = cardsHtml;
  }

  // Render Table Head and Body
  function renderTable(reportType, rows) {
    const config = columnsConfig[reportType];
    if (!config) return;

    // Set title
    const titles = {
      sales: 'Sales Report Ledger',
      stock: 'Stock Movements Log',
      receipts: 'Receipt Report Ledger',
      expenses: 'Expense Report Ledger',
      customers: 'Customer Purchases & Balances',
      'low-stock': 'Low Stock / Out of Stock Materials'
    };
    reportTitle.textContent = titles[reportType] || 'Report';

    // Build head
    let headHtml = '<tr>';
    config.forEach(col => {
      headHtml += `<th>${escapeHtml(col.label)}</th>`;
    });
    headHtml += '</tr>';
    tableHead.innerHTML = headHtml;

    // Build body
    let bodyHtml = '';
    rows.forEach(row => {
      bodyHtml += '<tr>';
      config.forEach(col => {
        let val = row[col.key];
        let tdContent = '';

        if (col.format === 'currency') {
          tdContent = `<strong>₹${parseFloat(val || 0).toFixed(2)}</strong>`;
        } else if (col.format === 'balanceCurrency') {
          const num = parseFloat(val || 0);
          const style = num > 0 ? 'color:var(--danger-color);font-weight:bold;' : '';
          tdContent = `<span style="${style}">₹${num.toFixed(2)}</span>`;
        } else if (col.format === 'date') {
          tdContent = formatDate(val);
        } else if (col.format === 'typeBadge') {
          tdContent = formatTypeBadge(val);
        } else if (col.format === 'movementBadge') {
          tdContent = formatMovementBadge(val);
        } else if (col.format === 'statusBadge') {
          tdContent = formatStatusBadge(row);
        } else if (col.format === 'lowStockBadge') {
          tdContent = formatLowStockBadge(val);
        } else if (col.format === 'categoryName') {
          tdContent = formatCategoryName(val);
        } else if (col.format === 'qty') {
          tdContent = formatQty(val, row);
        } else if (col.format === 'minStock') {
          tdContent = val !== null && val !== undefined ? `${val} ${escapeHtml(row.unit || '')}` : 'Not configured';
        } else {
          tdContent = val !== null && val !== undefined ? escapeHtml(String(val)) : '-';
        }

        bodyHtml += `<td>${tdContent}</td>`;
      });
      bodyHtml += '</tr>';
    });
    tableBody.innerHTML = bodyHtml;
  }

  // Generate Report
  async function generateReport() {
    errorContainer.style.display = 'none';
    noDataContainer.style.display = 'none';
    tableCard.style.display = 'none';
    summaryCardsContainer.innerHTML = '';

    const reportType = reportTypeSelect.value;
    const fromDate = filterFromDate.value;
    const toDate = filterToDate.value;

    try {
      showToast('Fetching report data...', 'pending');
      const result = await window.api.getReportData(reportType, { fromDate, toDate });
      
      if (!result || !result.rows) {
        throw new Error("No data returned from backend");
      }

      renderSummaryCards(reportType, result.summary);

      if (result.rows.length === 0) {
        noDataContainer.style.display = 'block';
        showToast('No records found.', 'success');
        return;
      }

      renderTable(reportType, result.rows);
      tableCard.style.display = 'block';
      showToast('Report generated successfully.', 'success');
    } catch (err) {
      console.error("Report generation failed:", err);
      errorContainer.style.display = 'block';
      showToast('Error generating report', 'error');
    }
  }

  // Reset filter values
  btnReset.addEventListener('click', () => {
    filterFromDate.value = '';
    filterToDate.value = '';
    generateReport();
  });

  // Event Listeners
  btnGenerate.addEventListener('click', generateReport);
  btnPrint.addEventListener('click', () => window.print());
  reportTypeSelect.addEventListener('change', generateReport);

  // Toast UI notifier
  const showToast = (message, type = 'success') => {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `notification show ${type}`;
    setTimeout(() => {
      toast.className = 'notification';
    }, 4000);
  };

  // Run initial report load
  generateReport();
});
