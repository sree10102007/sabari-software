const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Auth
  login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:getSession'),

  // Materials
  getMaterials: () => ipcRenderer.invoke('db:getMaterials'),
  getMaterialById: (id) => ipcRenderer.invoke('db:getMaterialById', id),
  addMaterial: (data) => ipcRenderer.invoke('db:addMaterial', data),
  updateMaterial: (data) => ipcRenderer.invoke('db:updateMaterial', data),

  // Stock
  addStock: (data) => ipcRenderer.invoke('db:addStock', data),
  stockOut: (data) => ipcRenderer.invoke('db:stockOut', data),
  getStockMovements: (filters) => ipcRenderer.invoke('db:getStockMovements', filters),

  // Customers
  getCustomers: () => ipcRenderer.invoke('db:getCustomers'),
  getCustomerById: (id) => ipcRenderer.invoke('db:getCustomerById', id),
  addCustomer: (data) => ipcRenderer.invoke('db:addCustomer', data),
  updateCustomer: (data) => ipcRenderer.invoke('db:updateCustomer', data),
  getCustomerHistory: (customerId) => ipcRenderer.invoke('db:getCustomerHistory', customerId),

  // Receipts
  getReceipts: (filters) => ipcRenderer.invoke('db:getReceipts', filters),
  getReceiptById: (id) => ipcRenderer.invoke('db:getReceiptById', id),
  getReceiptByNumber: (num) => ipcRenderer.invoke('db:getReceiptByNumber', num),
  updateReceiptPdfPath: (data) => ipcRenderer.invoke('db:updateReceiptPdfPath', data),
  markWhatsappSent: (id) => ipcRenderer.invoke('db:markWhatsappSent', id),

  // PDF
  generatePDF: (data) => ipcRenderer.invoke('pdf:generate', data),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath),

  // Dashboard & Reports
  getDashboardStats: () => ipcRenderer.invoke('db:getDashboardStats'),
  getReports: (filters) => ipcRenderer.invoke('db:getReports', filters),
  getReportsData: (range) => ipcRenderer.invoke('db:getReportsData', range),
  getReportData: (reportType, filters) => ipcRenderer.invoke("reports:get-data", reportType, filters),

  // Company Settings
  getCompanySettings: () => ipcRenderer.invoke('db:getCompanySettings'),
  saveCompanySettings: (data) => ipcRenderer.invoke('db:saveCompanySettings', data),

  // Backup / Restore
  backupDatabase: () => ipcRenderer.invoke('db:backup'),
  restoreDatabase: () => ipcRenderer.invoke('db:restore'),
  getSystemHealth: () => ipcRenderer.invoke('db:getSystemHealth'),

  // Deletions
  deleteMaterial: (id) => ipcRenderer.invoke('db:deleteMaterial', id),
  deleteCustomer: (id) => ipcRenderer.invoke('db:deleteCustomer', id),
  deleteStockMovement: (id) => ipcRenderer.invoke('db:deleteStockMovement', id),
  deleteReceipt: (id) => ipcRenderer.invoke('db:deleteReceipt', id),
  addPayment: (data) => ipcRenderer.invoke('db:addPayment', data),

  // Database resets
  resetDemoData: () => ipcRenderer.invoke('db:resetDemoData'),
  clearDemoData: () => ipcRenderer.invoke('db:clearDemoData'),
  clearBusinessData: () => ipcRenderer.invoke('db:clearBusinessData'),

  // Categories & Units
  getCategories: () => ipcRenderer.invoke('db:getCategories'),
  getUnits: () => ipcRenderer.invoke('db:getUnits'),

  // Expenses & Personnel
  getEmployees: () => ipcRenderer.invoke('db:getEmployees'),
  getVehicleExpenses: (filters) => ipcRenderer.invoke('db:getVehicleExpenses', filters),
  addVehicleExpense: (data) => ipcRenderer.invoke('db:addVehicleExpense', data),
  updateVehicleExpense: (data) => ipcRenderer.invoke('db:updateVehicleExpense', data),
  deleteVehicleExpense: (id) => ipcRenderer.invoke('db:deleteVehicleExpense', id),
  getPersonalExpenses: (filters) => ipcRenderer.invoke('db:getPersonalExpenses', filters),
  addPersonalExpense: (data) => ipcRenderer.invoke('db:addPersonalExpense', data),
  updatePersonalExpense: (data) => ipcRenderer.invoke('db:updatePersonalExpense', data),
  deletePersonalExpense: (id) => ipcRenderer.invoke('db:deletePersonalExpense', id),
  getExpensesSummary: () => ipcRenderer.invoke('db:getExpensesSummary'),

  // Unified Expenses
  addExpense: (data) => ipcRenderer.invoke('db:addExpense', data),
  updateExpense: (id, data) => ipcRenderer.invoke('db:updateExpense', { id, data }),
  deleteExpense: (id) => ipcRenderer.invoke('db:deleteExpense', id),
  getExpenses: (filters) => ipcRenderer.invoke('db:getExpenses', filters),
  getExpenseSummary: (filters) => ipcRenderer.invoke('db:getExpenseSummary', filters),
  getVehicleExpenseBreakdown: (filters) => ipcRenderer.invoke('db:getVehicleExpenseBreakdown', filters),
  getPersonalExpenseBreakdown: (filters) => ipcRenderer.invoke('db:getPersonalExpenseBreakdown', filters),
  getDailyExpenseSummary: (filters) => ipcRenderer.invoke('db:getDailyExpenseSummary', filters),
  getMonthlyExpenseTrend: (filters) => ipcRenderer.invoke('db:getMonthlyExpenseTrend', filters),

  // Shell openPath helper
  openPath: (filePath) => ipcRenderer.invoke('shell:openPath', filePath),

  // File existence check helper
  fileExists: (filePath) => ipcRenderer.invoke('fs:fileExists', filePath),

  // Clipboard helper
  writeClipboardFile: (filePath) => ipcRenderer.invoke('clipboard:writeFile', filePath),

  // WhatsApp auto-sender
  whatsappSendPDF: (data) => ipcRenderer.invoke('whatsapp:sendPDF', data),

  // Legacy (kept for safety)
  getPendingBulkOrders: () => ipcRenderer.invoke('db:getPendingBulkOrders'),
  getPendingRetailerOrders: () => ipcRenderer.invoke('db:getPendingRetailerOrders'),
  getUsers: () => ipcRenderer.invoke('db:getUsers'),
  addUser: (data) => ipcRenderer.invoke('db:addUser', data),
  openNotepad: () => ipcRenderer.invoke('open-notepad'),
});
