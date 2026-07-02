/**
 * Settings & System Diagnostics JS Logic
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

 // References to Form fields
 const settingsForm = document.getElementById('settings-form');
 const compNameInput = document.getElementById('company-name');
 const compAddressInput = document.getElementById('company-address');
 const compPhoneInput = document.getElementById('company-phone');
 const compEmailInput = document.getElementById('company-email');
 const compGstinInput = document.getElementById('company-gstin');
 const compLogoInput = document.getElementById('company-logo');

 // Diagnostics elements
 const diagDbSize = document.getElementById('diag-db-size');
 const diagCustCount = document.getElementById('diag-cust-count');
 const diagProdCount = document.getElementById('diag-prod-count');
 const diagReceiptsCount = document.getElementById('diag-receipts-count');
 const diagExpensesCount = document.getElementById('diag-expenses-count');
 const diagLastBackup = document.getElementById('diag-last-backup');
 const healthStatusBadge = document.getElementById('health-status-badge');

 // Backup details card
 const backupDetailsContainer = document.getElementById('backup-details-container');
 const lblBackupPath = document.getElementById('lbl-backup-path');
 const lblBackupSize = document.getElementById('lbl-backup-size');
 const lblBackupTime = document.getElementById('lbl-backup-time');

 // Buttons
 const btnBackup = document.getElementById('btn-backup');
 const btnRestore = document.getElementById('btn-restore');
 const btnResetDemo = document.getElementById('btn-reset-demo');
 const btnClearDemo = document.getElementById('btn-clear-demo');
 const btnClearBusiness = document.getElementById('btn-clear-business');

 // Initialize page
 initSettingsPage();

 async function initSettingsPage() {
 await loadSettings();
 await loadHealthDiagnostics();
 renderSavedBackupDetails();
 }

 // Load and populate settings
 async function loadSettings() {
 try {
 const settings = await window.api.getCompanySettings();
 if (settings) {
 compNameInput.value = settings.company_name || '';
 compAddressInput.value = settings.address || '';
 compPhoneInput.value = settings.phone || '';
 compEmailInput.value = settings.email || '';
 compGstinInput.value = settings.gstin || '';
 compLogoInput.value = settings.logo_path || 'assets/logo.png';
 }
 } catch (err) {
 showToast('Error loading settings: ' + err.message, 'error');
 }
 }

 // Load Health Diagnostics
 async function loadHealthDiagnostics() {
 try {
 const health = await window.api.getSystemHealth();
 if (health) {
 diagDbSize.textContent = health.dbSize;
 diagCustCount.textContent = health.customerCount;
 diagProdCount.textContent = health.productCount;
 diagReceiptsCount.textContent = health.receiptsCount;
 diagExpensesCount.textContent = health.expensesCount;
 }
 } catch (err) {
 console.error('Error loading system health diagnostics:', err);
 }
 }

 function renderSavedBackupDetails() {
 const lastPath = localStorage.getItem('last_backup_path');
 const lastSize = localStorage.getItem('last_backup_size');
 const lastTime = localStorage.getItem('last_backup_time');

 if (lastPath) {
 backupDetailsContainer.style.display = 'block';
 lblBackupPath.textContent = lastPath;
 lblBackupSize.textContent = lastSize;
 
 const formattedTime = new Date(lastTime).toLocaleString('en-IN');
 lblBackupTime.textContent = formattedTime;
 diagLastBackup.textContent = formattedTime;
 
 healthStatusBadge.className = 'health-badge healthy';
 healthStatusBadge.textContent = 'Healthy';
 } else {
 backupDetailsContainer.style.display = 'none';
 diagLastBackup.textContent = 'Never';
 healthStatusBadge.className = 'health-badge warning';
 healthStatusBadge.textContent = 'Needs Attention';
 }
 }

 // Save Settings Submit
 settingsForm.addEventListener('submit', async (e) => {
 e.preventDefault();
 const company_name = compNameInput.value.trim();
 const address = compAddressInput.value.trim();
 const phone = compPhoneInput.value.trim();
 const email = compEmailInput.value.trim();
 const gstin = compGstinInput.value.trim();
 const logo_path = compLogoInput.value.trim() || 'assets/logo.png';

 if (!company_name) {
 showToast('Company name is required.', 'error');
 return;
 }

 try {
 showToast('Saving configuration...', 'pending');
 const result = await window.api.saveCompanySettings({
 company_name,
 address,
 phone,
 email,
 gstin,
 logo_path
 });

 if (result.success) {
 showToast('Company configuration saved successfully!');
 await loadSettings();
 } else {
 showToast('Error saving configuration: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('Error saving configuration: ' + err.message, 'error');
 }
 });

 // Backup handler
 btnBackup.addEventListener('click', async () => {
 try {
 showToast('Opening dialog to save backup...', 'pending');
 const result = await window.api.backupDatabase();
 if (result.success) {
 // Save to localStorage
 localStorage.setItem('last_backup_path', result.filePath);
 localStorage.setItem('last_backup_size', result.size);
 localStorage.setItem('last_backup_time', result.date);

 renderSavedBackupDetails();
 showToast('Database backup created successfully!', 'success');
 } else {
 showToast('Backup cancelled: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('Error running backup: ' + err.message, 'error');
 }
 });

 // Restore handler
 btnRestore.addEventListener('click', async () => {
 const confirmed = confirm(' ARE YOU ABSOLUTELY SURE?\n\nRestoring a database will OVERWRITE all your current data, settings, customer histories, and sales receipts. This action is permanent and cannot be undone.');
 if (!confirmed) return;

 try {
 showToast('Opening dialog to select backup file...', 'pending');
 const result = await window.api.restoreDatabase();
 if (result.success) {
 alert('Database restored successfully!\n\nThe application will now restart. Please launch Sivakami Traders again to load the restored database.');
 window.close();
 } else {
 showToast('Restore cancelled: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('Error running restore: ' + err.message, 'error');
 }
 });

 // Reset Demo Data
 btnResetDemo.addEventListener('click', async () => {
 const confirmed1 = confirm('Are you sure you want to reset the database and restore default demo materials? This will delete all current receipts, customers, and stock history!');
 if (!confirmed1) return;
 const confirmed2 = confirm('This operation is permanent and will completely reset all records. Proceed?');
 if (!confirmed2) return;

 try {
 showToast('Resetting database...', 'pending');
 const result = await window.api.resetDemoData();
 if (result.success) {
 showToast('Database reset to demo settings successfully!');
 await initSettingsPage();
 } else {
 showToast('Failed to reset data: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });

 // Clear Demo Data
 btnClearDemo.addEventListener('click', async () => {
 const confirmed = confirm('Are you sure you want to clear all demo data? This will clear materials and database lists.');
 if (!confirmed) return;
 try {
 showToast('Clearing demo data...', 'pending');
 const result = await window.api.clearDemoData();
 if (result.success) {
 showToast('Demo data cleared.');
 await initSettingsPage();
 } else {
 showToast('Failed: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });

 // Clear Business Data
 btnClearBusiness.addEventListener('click', async () => {
 const confirmed1 = confirm(' DANGER ZONE!\n\nAre you sure you want to delete all business data? This will delete all sales receipts, customers, payments, and expenses, but preserve your materials list.');
 if (!confirmed1) return;
 const confirmed2 = confirm('Confirm that you wish to wipe out all business transactions permanently.');
 if (!confirmed2) return;

 try {
 showToast('Clearing business data...', 'pending');
 const result = await window.api.clearBusinessData();
 if (result.success) {
 showToast('All business transactions cleared successfully.');
 await initSettingsPage();
 } else {
 showToast('Failed: ' + result.error, 'error');
 }
 } catch (err) {
 showToast('System error: ' + err.message, 'error');
 }
 });

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
