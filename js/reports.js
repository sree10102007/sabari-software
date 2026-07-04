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

  // UI elements
  const filterPeriod = document.getElementById('filter-period');
  const customDateContainer = document.getElementById('custom-date-container');
  const filterFromDate = document.getElementById('filter-from-date');
  const filterToDate = document.getElementById('filter-to-date');
  const btnGenerateReport = document.getElementById('btn-generate-report');
  const btnPrintReport = document.getElementById('btn-print-report');
  const reportNoData = document.getElementById('report-no-data');

  // Report sections
  const reportTabs = document.querySelectorAll('.report-tabs .tab-btn');
  const reportSections = document.querySelectorAll('.report-section');

  let activeReportTab = 'sales';
  let reportDataCache = null;

  // Initialize
  initReports();

  function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatStringDate(dateStr) {
    if (!dateStr) return '-';
    const cleanDate = dateStr.split('T')[0];
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  function initReports() {
    // Set default dates
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    filterFromDate.value = toLocalDateString(firstDay);
    filterToDate.value = toLocalDateString(today);

    // Listeners
    filterPeriod.addEventListener('change', handlePeriodChange);
    btnGenerateReport.addEventListener('click', generateReport);
    btnPrintReport.addEventListener('click', () => window.print());

    reportTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        reportTabs.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');

        activeReportTab = btn.dataset.report;
        reportSections.forEach(s => s.classList.remove('active'));
        document.getElementById('report-' + activeReportTab).classList.add('active');

        generateReport();
      });
    });

    initRepExpenseFilters();
    generateReport();
  }

  function handlePeriodChange() {
    if (filterPeriod.value === 'custom') {
      customDateContainer.style.display = 'flex';
    } else {
      customDateContainer.style.display = 'none';
      generateReport();
    }
  }

  function getSelectedDateRange() {
    const today = new Date();
    let fromDate = new Date();
    let toDate = new Date();

    const period = filterPeriod.value;
    if (period === 'today') {
      // today YYYY-MM-DD
    } else if (period === 'week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      fromDate.setDate(diff);
    } else if (period === 'month') {
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    } else if (period === 'custom') {
      return {
        from: filterFromDate.value,
        to: filterToDate.value
      };
    }

    return {
      from: toLocalDateString(fromDate),
      to: toLocalDateString(toDate)
    };
  }

  // Fetch Report Data from database
  async function generateReport() {
    showToast('Generating report data...', 'pending');
    const range = getSelectedDateRange();
    
    if (!range.from || !range.to) {
      showToast('Please select valid date range.', 'error');
      return;
    }

    if (activeReportTab === 'expenses') {
      await loadAndRenderExpenseReport();
      showToast('Expense report generated.');
      return;
    }

    try {
      const data = await window.api.getReportsData({ from_date: range.from, to_date: range.to });
      if (data) {
        reportDataCache = data;
        renderActiveReport();
        showToast('Report generated successfully.');
      } else {
        showToast('Failed to fetch report metrics.', 'error');
      }
    } catch (err) {
      showToast('System error generating report: ' + err.message, 'error');
    }
  }

  // Render the current active report
  function renderActiveReport() {
    if (!reportDataCache) return;

    // Reset visibility
    reportNoData.style.display = 'none';
    reportSections.forEach(s => s.style.display = 'none');

    const activeSec = document.getElementById('report-' + activeReportTab);
    activeSec.style.display = 'block';

    if (activeReportTab === 'sales') {
      const sales = reportDataCache.sales;
      const isEmpty = !sales.salesByCust.length && !sales.bestSellers.length;
      if (isEmpty) {
        activeSec.style.display = 'none';
        reportNoData.style.display = 'block';
        return;
      }

      document.getElementById('sales-card-revenue').textContent = '₹' + (sales.totalSalesAmount || 0).toFixed(2);
      document.getElementById('sales-card-quantity').textContent = (sales.totalQtySold || 0).toLocaleString('en-IN') + ' Units';

      // Best sellers table
      const bsTbody = document.getElementById('sales-table-bestsellers');
      bsTbody.innerHTML = '';
      sales.bestSellers.forEach(item => {
        bsTbody.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(item.material_name)}</strong></td>
            <td><strong>${item.total_qty}</strong></td>
            <td>${escapeHtml(item.unit)}</td>
          </tr>`;
      });

      // Sales by customer table
      const bcTbody = document.getElementById('sales-table-bycustomer');
      bcTbody.innerHTML = '';
      sales.salesByCust.forEach(item => {
        bcTbody.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(item.customer_name)}</strong></td>
            <td>${item.txn_count}</td>
            <td><strong>₹${parseFloat(item.total_sales || 0).toFixed(2)}</strong></td>
          </tr>`;
      });

      // Sales by Type
      const btTbody = document.getElementById('sales-table-bytype');
      btTbody.innerHTML = '';
      sales.salesByType.forEach(item => {
        btTbody.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(item.movement_type)}</strong></td>
            <td><strong>₹${parseFloat(item.total_sales || 0).toFixed(2)}</strong></td>
          </tr>`;
      });

      // Daily Trend
      const trendTbody = document.getElementById('sales-table-trend');
      trendTbody.innerHTML = '';
      sales.dailySales.forEach(item => {
        trendTbody.innerHTML += `
          <tr>
            <td>${item.sales_date}</td>
            <td><strong>₹${parseFloat(item.total_sales || 0).toFixed(2)}</strong></td>
          </tr>`;
      });

      // Sales Ledger Table
      const ledgerTbody = document.getElementById('sales-table-ledger');
      if (ledgerTbody) {
        ledgerTbody.innerHTML = '';
        if (!sales.ledger || sales.ledger.length === 0) {
          ledgerTbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">No sales records found.</td></tr>';
        } else {
          sales.ledger.forEach(item => {
            const date = formatStringDate(item.receipt_date);
            
            let statusLabel = 'Unpaid';
            let statusClass = 'pending';
            if (parseFloat(item.balance_amount || 0) === 0) {
              statusLabel = 'Paid';
              statusClass = 'available';
            } else if (parseFloat(item.paid_amount || 0) > 0) {
              statusLabel = 'Partial';
              statusClass = 'low-stock';
            }

            ledgerTbody.innerHTML += `
              <tr>
                <td><strong>${escapeHtml(item.receipt_number)}</strong></td>
                <td>${date}</td>
                <td><strong>${escapeHtml(item.customer_name)}</strong></td>
                <td>${escapeHtml(item.material_name)}</td>
                <td><strong>${item.quantity} ${escapeHtml(item.unit)}</strong></td>
                <td><strong>₹${parseFloat(item.total_amount || 0).toFixed(2)}</strong></td>
                <td>₹${parseFloat(item.paid_amount || 0).toFixed(2)}</td>
                <td style="${parseFloat(item.balance_amount || 0) > 0 ? 'color:var(--danger-color);font-weight:bold;' : ''}">₹${parseFloat(item.balance_amount || 0).toFixed(2)}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
              </tr>`;
          });
        }
      }

    } else if (activeReportTab === 'stock') {
      const stock = reportDataCache.stock;
      if (!stock.currentStock.length) {
        activeSec.style.display = 'none';
        reportNoData.style.display = 'block';
        return;
      }

      document.getElementById('stock-card-added').textContent = (stock.stockAdded || 0).toLocaleString('en-IN') + ' Units';
      document.getElementById('stock-card-sold').textContent = (stock.stockSold || 0).toLocaleString('en-IN') + ' Units';

      // Current stock table
      const curTbody = document.getElementById('stock-table-current');
      curTbody.innerHTML = '';
      stock.currentStock.forEach(item => {
        const isLow = item.current_stock <= item.minimum_stock;
        const statusBadge = isLow 
          ? '<span class="status-badge low-stock">Low Stock</span>'
          : '<span class="status-badge available">Healthy</span>';
        
        curTbody.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td>${escapeHtml(item.category || '-')}</td>
            <td><strong>${item.current_stock} ${escapeHtml(item.unit)}</strong></td>
            <td>${item.minimum_stock} ${escapeHtml(item.unit)}</td>
            <td>${statusBadge}</td>
          </tr>`;
      });

      // Low stock table
      const lowTbody = document.getElementById('stock-table-low');
      lowTbody.innerHTML = '';
      if (stock.lowStock.length === 0) {
        lowTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--success-color);font-weight:600;"> All stock thresholds healthy!</td></tr>';
      } else {
        stock.lowStock.forEach(item => {
          lowTbody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(item.name)}</strong></td>
              <td>${escapeHtml(item.category || '-')}</td>
              <td><strong style="color:var(--danger-color);">${item.current_stock} ${escapeHtml(item.unit)}</strong></td>
              <td>${item.minimum_stock} ${escapeHtml(item.unit)}</td>
            </tr>`;
        });
      }

      // Movements table
      const mvTbody = document.getElementById('stock-table-movements');
      mvTbody.innerHTML = '';
      if (stock.movements.length === 0) {
        mvTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No stock movements recorded in this period.</td></tr>';
      } else {
        stock.movements.forEach(item => {
          const date = formatStringDate(item.created_at);
          const direction = item.movement_type === 'Stock In' ? 'Stock In' : 'Stock Out';
          mvTbody.innerHTML += `
            <tr>
              <td>${date}</td>
              <td><strong>${escapeHtml(item.material_name)}</strong></td>
              <td><span class="status-badge ${direction === 'Stock In' ? 'available' : 'low-stock'}">${escapeHtml(item.movement_type)}</span></td>
              <td><strong>${item.quantity} ${escapeHtml(item.material_unit)}</strong></td>
              <td>${escapeHtml(item.supplier_name || item.customer_name || '-')}</td>
              <td>${escapeHtml(item.remarks || '-')}</td>
            </tr>`;
        });
      }

    } else if (activeReportTab === 'customers') {
      const cust = reportDataCache.customers;
      if (!cust.list.length) {
        activeSec.style.display = 'none';
        reportNoData.style.display = 'block';
        return;
      }

      const listTbody = document.getElementById('customer-table-list');
      listTbody.innerHTML = '';
      cust.list.forEach(item => {
        listTbody.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td>${escapeHtml(item.phone || '-')}</td>
            <td><span class="status-badge ${item.customer_type === 'Engineer' ? 'pending' : 'available'}">${item.customer_type}</span></td>
            <td>${item.total_receipts}</td>
            <td><strong>₹${parseFloat(item.total_purchases || 0).toFixed(2)}</strong></td>
            <td style="${parseFloat(item.balance_amount) > 0 ? 'color:var(--danger-color);font-weight:bold;' : ''}">
              ₹${parseFloat(item.balance_amount || 0).toFixed(2)}
            </td>
          </tr>`;
      });

    } else if (activeReportTab === 'payments') {
      const pay = reportDataCache.payments;
      document.getElementById('pay-card-outstanding').textContent = '₹' + (pay.outstandingAmount || 0).toFixed(2);
      document.getElementById('pay-card-status-counts').innerHTML = `
        Fully Paid: <strong>${pay.fullyPaidCount}</strong><br>
        Partially Paid: <strong>${pay.partiallyPaidCount}</strong><br>
        Pending: <strong>${pay.pendingCount}</strong>`;

      const outTbody = document.getElementById('pay-table-outstanding-cust');
      outTbody.innerHTML = '';
      if (!pay.outstandingCustWise.length) {
        outTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--success-color);font-weight:600;"> No outstanding balances!</td></tr>';
      } else {
        pay.outstandingCustWise.forEach(item => {
          const formattedOutstanding = parseFloat(item.total_outstanding || 0).toFixed(2);
          outTbody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(item.customer_name)}</strong></td>
              <td>₹${parseFloat(item.total_bill || 0).toFixed(2)}</td>
              <td><strong style="color:var(--danger-color);">₹${formattedOutstanding}</strong></td>
            </tr>`;
        });
      }
    }
  }

  // Expense sub-filters logic
  const repExpCategory = document.getElementById('rep-exp-category');
  const repExpVehicle = document.getElementById('rep-exp-vehicle');
  const repExpPerson = document.getElementById('rep-exp-person');
  const repExpType = document.getElementById('rep-exp-type');
  const repExpVehicleGroup = document.getElementById('rep-exp-vehicle-group');
  const repExpPersonGroup = document.getElementById('rep-exp-person-group');
  const btnFilterRepExpenses = document.getElementById('btn-filter-rep-expenses');

  const repVehicleTypes = ['Fuel', 'Driver Allowance', 'Toll Charges', 'Maintenance', 'Loading / Unloading', 'Other'];
  const repPersonalTypes = ['Worker Pay', 'Tea / Snacks', 'Refreshments', 'Office Expense', 'Salary / Allowance', 'Other'];

  function initRepExpenseFilters() {
    if (!repExpCategory) return;
    
    repExpCategory.addEventListener('change', () => {
      const cat = repExpCategory.value;
      repExpType.innerHTML = '<option value="All">All Types</option>';
      
      let types = [];
      if (cat === 'vehicle') {
        repExpVehicleGroup.style.display = 'block';
        repExpPersonGroup.style.display = 'none';
        if (repExpPerson) repExpPerson.value = '';
        types = repVehicleTypes;
      } else if (cat === 'personal') {
        repExpVehicleGroup.style.display = 'none';
        repExpPersonGroup.style.display = 'block';
        if (repExpVehicle) repExpVehicle.value = '';
        types = repPersonalTypes;
      } else {
        repExpVehicleGroup.style.display = 'block';
        repExpPersonGroup.style.display = 'block';
        types = [...new Set([...repVehicleTypes, ...repPersonalTypes])];
      }

      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        repExpType.appendChild(opt);
      });
    });

    // Trigger initial setup
    repExpCategory.dispatchEvent(new Event('change'));

    btnFilterRepExpenses.addEventListener('click', loadAndRenderExpenseReport);
  }

  async function loadAndRenderExpenseReport() {
    const range = getSelectedDateRange();
    if (!range.from || !range.to) {
      showToast('Please select valid date range first.', 'error');
      return;
    }

    const category = repExpCategory.value;
    const vehicle = repExpVehicle.value.trim().toUpperCase();
    const person = repExpPerson.value;
    const type = repExpType.value;

    const filters = {
      from_date: range.from,
      to_date: range.to,
      expense_category: category,
      vehicle_number: vehicle || null,
      person_name: person || null,
      expense_type: type
    };

    try {
      const summary = await window.api.getExpenseSummary(filters);
      const vehicleBreakdown = await window.api.getVehicleExpenseBreakdown(filters);
      const personalBreakdown = await window.api.getPersonalExpenseBreakdown(filters);
      const dailySummary = await window.api.getDailyExpenseSummary(filters);
      const monthlyTrend = await window.api.getMonthlyExpenseTrend(filters);

      // Render cards
      document.getElementById('exp-card-vehicle').textContent = '₹' + (summary.vehicleTotal || 0).toFixed(2);
      document.getElementById('exp-card-personal').textContent = '₹' + (summary.personalTotal || 0).toFixed(2);
      document.getElementById('exp-card-total').textContent = '₹' + (summary.totalExpenses || 0).toFixed(2);

      // 1. Vehicle-wise breakdown table
      const vWiseTbody = document.getElementById('exp-table-vehiclewise');
      vWiseTbody.innerHTML = '';
      if (!vehicleBreakdown.length) {
        vWiseTbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No logistics breakdown.</td></tr>';
      } else {
        vehicleBreakdown.forEach(item => {
          vWiseTbody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(item.vehicle_number)}</strong></td>
              <td><strong>₹${parseFloat(item.total_expense || 0).toFixed(2)}</strong></td>
            </tr>`;
        });
      }

      // 2. Employee-wise breakdown table
      const eWiseTbody = document.getElementById('exp-table-employeewise');
      eWiseTbody.innerHTML = '';
      if (!personalBreakdown.length) {
        eWiseTbody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No personnel breakdown.</td></tr>';
      } else {
        personalBreakdown.forEach(item => {
          eWiseTbody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(item.person_name)}</strong></td>
              <td><strong>₹${parseFloat(item.total_expense || 0).toFixed(2)}</strong></td>
            </tr>`;
        });
      }

      // 3. Daily Breakdown table
      const dailyTbody = document.getElementById('exp-table-daily');
      dailyTbody.innerHTML = '';
      if (!dailySummary.length) {
        dailyTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No daily records.</td></tr>';
      } else {
        dailySummary.forEach(item => {
          const d = formatStringDate(item.exp_date);
          dailyTbody.innerHTML += `
            <tr>
              <td>${d}</td>
              <td>₹${parseFloat(item.vehicle_total || 0).toFixed(2)}</td>
              <td>₹${parseFloat(item.personal_total || 0).toFixed(2)}</td>
              <td><strong>₹${parseFloat(item.total || 0).toFixed(2)}</strong></td>
            </tr>`;
        });
      }

      // 4. Monthly Breakdown table
      const monthlyTbody = document.getElementById('exp-table-monthly');
      monthlyTbody.innerHTML = '';
      if (!monthlyTrend.length) {
        monthlyTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No monthly records.</td></tr>';
      } else {
        monthlyTrend.forEach(item => {
          monthlyTbody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(item.exp_month)}</strong></td>
              <td>₹${parseFloat(item.vehicle_total || 0).toFixed(2)}</td>
              <td>₹${parseFloat(item.personal_total || 0).toFixed(2)}</td>
              <td><strong>₹${parseFloat(item.total || 0).toFixed(2)}</strong></td>
            </tr>`;
        });
      }

    } catch (err) {
      showToast('Error generating expense report: ' + err.message, 'error');
    }
  }

  // Toast UI notifier
  const showToast = (message, type = 'success') => {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `notification show ${type}`;
    setTimeout(() => {
      toast.className = 'notification';
    }, 4000);
  };
});
