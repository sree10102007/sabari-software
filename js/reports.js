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

 function initReports() {
 // Set default dates
 const today = new Date();
 const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
 filterFromDate.value = firstDay.toISOString().split('T')[0];
 filterToDate.value = today.toISOString().split('T')[0];

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

 renderActiveReport();
 });
 });

 generateReport();
 }

 function handlePeriodChange() {
 if (filterPeriod.value === 'custom') {
 customDateContainer.style.display = 'flex';
 } else {
 customDateContainer.style.display = 'none';
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
 from: fromDate.toISOString().split('T')[0],
 to: toDate.toISOString().split('T')[0]
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
 const date = new Date(item.created_at).toLocaleDateString('en-IN', {
 day: '2-digit', month: '2-digit', year: 'numeric'
 });
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
 outTbody.innerHTML += `
 <tr>
 <td><strong>${escapeHtml(item.customer_name)}</strong></td>
 <td>₹${parseFloat(item.total_bill || 0).toFixed(2)}</td>
 <td><strong style="color:var(--danger-color);">₹${parseFloat(item.total_outstanding || 0).toFixed(2)}</strong></td>
 </tr>`;
 });
 }

 } else if (activeReportTab === 'expenses') {
 const exp = reportDataCache.expenses;
 const isEmpty = !exp.vehicleList.length && !exp.personalList.length;
 if (isEmpty) {
 activeSec.style.display = 'none';
 reportNoData.style.display = 'block';
 return;
 }

 document.getElementById('exp-card-vehicle').textContent = '₹' + (exp.vehicleTotal || 0).toFixed(2);
 document.getElementById('exp-card-personal').textContent = '₹' + (exp.personalTotal || 0).toFixed(2);

 // Vehicle wise breakdown
 const vWiseTbody = document.getElementById('exp-table-vehiclewise');
 vWiseTbody.innerHTML = '';
 exp.vehicleWise.forEach(item => {
 vWiseTbody.innerHTML += `
 <tr>
 <td><strong>${escapeHtml(item.vehicle_number)}</strong></td>
 <td><strong>₹${parseFloat(item.total_expense || 0).toFixed(2)}</strong></td>
 </tr>`;
 });

 // Employee wise breakdown
 const eWiseTbody = document.getElementById('exp-table-employeewise');
 eWiseTbody.innerHTML = '';
 exp.employeeWise.forEach(item => {
 eWiseTbody.innerHTML += `
 <tr>
 <td><strong>${escapeHtml(item.employee_name)}</strong></td>
 <td><strong>₹${parseFloat(item.total_expense || 0).toFixed(2)}</strong></td>
 </tr>`;
 });

 // Daily Breakdown
 const dailyTbody = document.getElementById('exp-table-daily');
 dailyTbody.innerHTML = '';
 // Map personal and vehicle daily expenses by date
 const dailyMap = {};
 exp.dailyExpenses.forEach(d => {
 dailyMap[d.exp_date] = { vehicle: d.v_total, personal: 0 };
 });
 exp.pDailyExpenses.forEach(d => {
 if (!dailyMap[d.exp_date]) dailyMap[d.exp_date] = { vehicle: 0, personal: 0 };
 dailyMap[d.exp_date].personal = d.p_total;
 });

 Object.keys(dailyMap).sort().reverse().forEach(date => {
 const item = dailyMap[date];
 const total = item.vehicle + item.personal;
 dailyTbody.innerHTML += `
 <tr>
 <td>${date}</td>
 <td>₹${item.vehicle.toFixed(2)}</td>
 <td>₹${item.personal.toFixed(2)}</td>
 <td><strong>₹${total.toFixed(2)}</strong></td>
 </tr>`;
 });

 // Monthly Breakdown
 const monthlyTbody = document.getElementById('exp-table-monthly');
 monthlyTbody.innerHTML = '';
 const monthlyMap = {};
 exp.monthlyExpenses.forEach(m => {
 monthlyMap[m.exp_month] = { vehicle: m.v_total, personal: 0 };
 });
 exp.pMonthlyExpenses.forEach(m => {
 if (!monthlyMap[m.exp_month]) monthlyMap[m.exp_month] = { vehicle: 0, personal: 0 };
 monthlyMap[m.exp_month].personal = m.p_total;
 });

 Object.keys(monthlyMap).sort().reverse().forEach(month => {
 const item = monthlyMap[month];
 const total = item.vehicle + item.personal;
 monthlyTbody.innerHTML += `
 <tr>
 <td>${month}</td>
 <td>₹${item.vehicle.toFixed(2)}</td>
 <td>₹${item.personal.toFixed(2)}</td>
 <td><strong>₹${total.toFixed(2)}</strong></td>
 </tr>`;
 });
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
