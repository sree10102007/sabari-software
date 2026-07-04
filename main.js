const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database/database');
const bcrypt = require('bcryptjs');

let mainWindow;
let currentUserSession = null;

// Ensure receipts directory exists
const receiptsDir = path.join(__dirname, 'receipts');
if (!fs.existsSync(receiptsDir)) {
 fs.mkdirSync(receiptsDir, { recursive: true });
}

function createWindow() {
 Menu.setApplicationMenu(null);
 mainWindow = new BrowserWindow({
 width: 1366,
 height: 900,
 minWidth: 1100,
 minHeight: 768,
 icon: path.join(__dirname, 'assets', 'logo.png'),
 webPreferences: {
 preload: path.join(__dirname, 'preload.js'),
 contextIsolation: true,
 nodeIntegration: false
 }
 });

 mainWindow.loadFile(path.join(__dirname, 'pages', 'login.html'));

 mainWindow.on('closed', function () {
 mainWindow = null;
 });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
 if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
 if (mainWindow === null) createWindow();
});

// Helper: today string YYYY-MM-DD
function getTodayString() {
 const d = new Date();
 return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Helper: local ISO string YYYY-MM-DDTHH:MM:SS
function getLocalISOString(dateInput) {
  if (dateInput) {
    return dateInput.includes('T') ? dateInput : dateInput + 'T00:00:00';
  }
  return new Date().toLocaleString('sv').replace(' ', 'T');
}

// Helper: generate receipt number RCP-YYYY-NNNN
async function generateReceiptNumber() {
 const year = new Date().getFullYear();
 const prefix = `RCP-${year}-`;
 const last = await db.queryOne(
 `SELECT receipt_number FROM receipts WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1`,
 [prefix + '%']
 );
 let seq = 1;
 if (last && last.receipt_number) {
 const parts = last.receipt_number.split('-');
 seq = (parseInt(parts[2]) || 0) + 1;
 }
 return prefix + String(seq).padStart(4, '0');
}

// =============================================================
// IPC – AUTH
// =============================================================

ipcMain.handle('auth:login', async (event, { username, password }) => {
 try {
 const user = await db.queryOne('SELECT * FROM users WHERE username = ?', [username]);
 if (!user) return { success: false, error: 'User does not exist.' };

 const passwordMatch = bcrypt.compareSync(password, user.password);
 if (!passwordMatch) return { success: false, error: 'Incorrect password.' };

 if (user.role !== 'admin') {
 return { success: false, error: 'Access denied. Administrator role required.' };
 }

 currentUserSession = { id: user.id, name: user.name, username: user.username, role: user.role };
 return { success: true, user: currentUserSession };
 } catch (err) {
 return { success: false, error: err.message };
 }
});

ipcMain.handle('auth:logout', async () => {
 currentUserSession = null;
 return { success: true };
});

ipcMain.handle('auth:getSession', async () => currentUserSession);

// =============================================================
// IPC – MATERIALS
// =============================================================

ipcMain.handle('db:getMaterials', async () => {
 try {
 return await db.query('SELECT * FROM materials WHERE is_deleted IS NULL OR is_deleted = 0 ORDER BY name ASC');
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:getMaterialById', async (event, id) => {
 try {
 return await db.queryOne('SELECT * FROM materials WHERE id = ? AND (is_deleted IS NULL OR is_deleted = 0)', [id]);
 } catch (err) { return null; }
});

ipcMain.handle('db:deleteMaterial', async (event, id) => {
 try {
 const now = new Date().toISOString();
 await db.run('UPDATE materials SET is_deleted = 1, deleted_at = ? WHERE id = ?', [now, id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:addMaterial', async (event, { name, category, unit, current_stock, minimum_stock, rate }) => {
 try {
 if (!name || !unit) return { success: false, error: 'Material name and unit are required.' };
 const allowedCategories = ['Cement', 'Raw Materials'];
 if (category && !allowedCategories.includes(category)) {
 return { success: false, error: 'Invalid category. Allowed categories are Cement and Raw Materials.' };
 }
 const now = new Date().toISOString();
 await db.run('BEGIN TRANSACTION');
 try {
 const result = await db.run(
 `INSERT INTO materials (name, category, unit, current_stock, minimum_stock, rate, created_at)
 VALUES (?, ?, ?, ?, ?, ?, ?)`,
 [name, category || '', unit, current_stock || 0, minimum_stock || 0, rate || 0, now]
 );
 const materialId = result.lastInsertRowid;
 if ((current_stock || 0) > 0) {
 await db.run(
 `INSERT INTO stock_movements (material_id, movement_type, quantity, remarks, created_by, created_at, stock_direction)
 VALUES (?, 'Adjustment', ?, 'Initial stock entry', ?, ?, 'IN')`,
 [materialId, current_stock, currentUserSession ? currentUserSession.name : 'Admin', now]
 );
 }
 await db.run('COMMIT');
 return { success: true };
 } catch (e) { await db.run('ROLLBACK'); throw e; }
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:updateMaterial', async (event, { id, name, category, unit, minimum_stock, rate }) => {
 try {
 if (!id || !name || !unit) return { success: false, error: 'ID, name and unit are required.' };
 const allowedCategories = ['Cement', 'Raw Materials'];
 if (category && !allowedCategories.includes(category)) {
 return { success: false, error: 'Invalid category. Allowed categories are Cement and Raw Materials.' };
 }
 await db.run(
 'UPDATE materials SET name=?, category=?, unit=?, minimum_stock=?, rate=? WHERE id=?',
 [name, category || '', unit, minimum_stock || 0, rate || 0, id]
 );
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

// =============================================================
// IPC – STOCK MANAGEMENT
// =============================================================

ipcMain.handle('db:addStock', async (event, { material_id, quantity, supplier_name, invoice_number, vehicle_number, remarks, date }) => {
 try {
 if (!material_id || quantity <= 0) return { success: false, error: 'Select a valid material and enter quantity > 0.' };
 const material = await db.queryOne('SELECT name FROM materials WHERE id = ?', [material_id]);
 if (!material) return { success: false, error: 'Material not found.' };

  const timestamp = getLocalISOString(date);
  const addedBy = currentUserSession ? currentUserSession.name : 'Admin';

 await db.run('BEGIN TRANSACTION');
 try {
 await db.run('UPDATE materials SET current_stock = current_stock + ? WHERE id = ?', [quantity, material_id]);
 await db.run(
 `INSERT INTO stock_movements (material_id, movement_type, quantity, supplier_name, invoice_number, vehicle_number, remarks, created_by, created_at, stock_direction)
 VALUES (?, 'Stock In', ?, ?, ?, ?, ?, ?, ?, 'IN')`,
 [material_id, quantity, supplier_name || '', invoice_number || '', vehicle_number || '', remarks || '', addedBy, timestamp]
 );
 await db.run('COMMIT');
 return { success: true };
 } catch (e) { await db.run('ROLLBACK'); throw e; }
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:stockOut', async (event, {
  material_id, quantity, customer_name, customer_phone, customer_address,
  customer_type, rate, total_amount, paid_amount, balance_amount, remarks, date
}) => {
  try {
  if (!material_id || quantity <= 0) return { success: false, error: 'Select a valid material and enter quantity > 0.' };
  if (!customer_name) return { success: false, error: 'Customer name is required.' };

  // Server-side payment validation
  const tAmt = parseFloat(total_amount) || 0;
  const pAmt = parseFloat(paid_amount) || 0;
  if (pAmt < 0) return { success: false, error: 'Paid amount cannot be negative.' };
  if (tAmt > 0 && pAmt > tAmt) return { success: false, error: 'Paid amount cannot exceed total amount.' };

 const material = await db.queryOne('SELECT * FROM materials WHERE id = ?', [material_id]);
 if (!material) return { success: false, error: 'Material not found.' };
 if (material.current_stock < quantity) {
 return { success: false, error: `Insufficient stock! ${material.name} only has ${material.current_stock} ${material.unit} available (requested: ${quantity}).` };
 }

  const timestamp = getLocalISOString(date);
  const doneBy = currentUserSession ? currentUserSession.name : 'Admin';
  const now = getLocalISOString();

 await db.run('BEGIN TRANSACTION');
 try {
 // Upsert customer
 let customerId = null;
 let existingCust = null;
 if (customer_phone && customer_phone.trim() !== '') {
 existingCust = await db.queryOne(
 'SELECT id, customer_type FROM customers WHERE phone = ? AND (is_deleted IS NULL OR is_deleted = 0)',
 [customer_phone.trim()]
 );
 } else if (customer_name) {
 const addr = customer_address ? customer_address.trim() : '';
 existingCust = await db.queryOne(
 'SELECT id, customer_type FROM customers WHERE name = ? AND COALESCE(address, "") = ? AND (phone IS NULL OR phone = "") AND (is_deleted IS NULL OR is_deleted = 0)',
 [customer_name.trim(), addr]
 );
 }

 if (existingCust) {
 customerId = existingCust.id;
 await db.run(
 'UPDATE customers SET total_purchases = total_purchases + ?, balance_amount = balance_amount + ?, customer_type = COALESCE(NULLIF(?, \'\'), customer_type) WHERE id = ?',
 [total_amount || 0, balance_amount || 0, customer_type || '', customerId]
 );
 } else {
 const custResult = await db.run(
 `INSERT INTO customers (name, phone, address, total_purchases, balance_amount, customer_type, created_at)
 VALUES (?, ?, ?, ?, ?, ?, ?)`,
 [customer_name, customer_phone || '', customer_address || '', total_amount || 0, balance_amount || 0, customer_type || 'Retailer', now]
 );
 customerId = custResult.lastInsertRowid;
 }

 // Reduce stock
 await db.run('UPDATE materials SET current_stock = current_stock - ? WHERE id = ?', [quantity, material_id]);

 // Generate receipt number
 const receiptNumber = await generateReceiptNumber();

 // Create receipt
 const receiptResult = await db.run(
 `INSERT INTO receipts (receipt_number, customer_id, customer_name, customer_phone, customer_address, receipt_date, total_amount, paid_amount, balance_amount, remarks, movement_type, created_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [receiptNumber, customerId, customer_name, customer_phone || '', customer_address || '',
  timestamp, total_amount || 0, paid_amount || 0, balance_amount || 0, remarks || '', customer_type || 'Stock Out', now]
 );
 const receiptId = receiptResult.lastInsertRowid;

 // Create initial payment in payments history
 if ((paid_amount || 0) > 0) {
 await db.run(
 `INSERT INTO payments (receipt_id, payment_date, amount, remarks, created_at)
 VALUES (?, ?, ?, 'Initial payment', ?)`,
 [receiptId, timestamp, paid_amount, now]
 );
 }

 // Create receipt item
 await db.run(
 `INSERT INTO receipt_items (receipt_id, material_id, material_name, quantity, unit, rate, total)
 VALUES (?, ?, ?, ?, ?, ?, ?)`,
 [receiptId, material_id, material.name, quantity, material.unit, rate || 0, total_amount || 0]
 );

 // Log stock movement
 await db.run(
 `INSERT INTO stock_movements (material_id, movement_type, quantity, customer_id, customer_name, receipt_id, rate, total_amount, paid_amount, balance_amount, remarks, created_by, created_at, stock_direction)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OUT')`,
  [material_id, customer_type || 'Stock Out', quantity, customerId, customer_name,
 receiptId, rate || 0, total_amount || 0, paid_amount || 0, balance_amount || 0,
 remarks || '', doneBy, timestamp]
 );

 await db.run('COMMIT');
 return { success: true, receiptId, receiptNumber };
 } catch (e) { await db.run('ROLLBACK'); throw e; }
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:getStockMovements', async (event, filters) => {
 try {
 let sql = `
 SELECT sm.*, m.name as material_name, m.unit as material_unit
 FROM stock_movements sm
 JOIN materials m ON sm.material_id = m.id
 WHERE (sm.is_deleted IS NULL OR sm.is_deleted = 0)
 `;
 const params = [];
 if (filters) {
 if (filters.material_id) { sql += ' AND sm.material_id = ?'; params.push(filters.material_id); }
 if (filters.movement_type && filters.movement_type !== 'All') { sql += ' AND sm.movement_type = ?'; params.push(filters.movement_type); }
  if (filters.from_date) { sql += ' AND date(sm.created_at) >= date(?)'; params.push(filters.from_date); }
  if (filters.to_date) { sql += ' AND date(sm.created_at) <= date(?)'; params.push(filters.to_date); }
 }
 sql += ' ORDER BY sm.created_at DESC, sm.id DESC';
 return await db.query(sql, params);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:deleteStockMovement', async (event, id) => {
 try {
 const sm = await db.queryOne('SELECT * FROM stock_movements WHERE id = ?', [id]);
 if (!sm) return { success: false, error: 'Stock movement not found.' };

 if (sm.receipt_id) {
 return { success: false, error: 'This stock movement is linked to a receipt. Please delete the receipt instead.' };
 }

 await db.run('BEGIN TRANSACTION');
 try {
 const now = getLocalISOString();
 await db.run('UPDATE stock_movements SET is_deleted = 1, deleted_at = ? WHERE id = ?', [now, id]);

 // Reverse stock level based on stock_direction or fallback
 let dir = sm.stock_direction;
 if (!dir) {
 if (sm.movement_type === 'Stock In') {
 dir = 'IN';
 } else if (['Customer Sale', 'Direct Sale', 'Stock Out', 'Site Usage', 'Damaged Stock'].includes(sm.movement_type)) {
 dir = 'OUT';
 } else if (sm.movement_type === 'Adjustment') {
 dir = 'IN';
 }
 }

 if (dir === 'IN') {
 const mat = await db.queryOne('SELECT current_stock, name FROM materials WHERE id = ?', [sm.material_id]);
 if (mat && (mat.current_stock - sm.quantity < 0)) {
 throw new Error(`Cannot reverse stock. Reversing this entry would make stock for '${mat.name}' negative.`);
 }
 await db.run('UPDATE materials SET current_stock = current_stock - ? WHERE id = ?', [sm.quantity, sm.material_id]);
 } else if (dir === 'OUT') {
 await db.run('UPDATE materials SET current_stock = current_stock + ? WHERE id = ?', [sm.quantity, sm.material_id]);
 }

 await db.run('COMMIT');
 return { success: true };
 } catch (e) {
 await db.run('ROLLBACK');
 throw e;
 }
 } catch (err) { return { success: false, error: err.message }; }
});

// =============================================================
// IPC – CUSTOMERS
// =============================================================

ipcMain.handle('db:getCustomers', async () => {
 try {
 return await db.query(`
 SELECT c.*, r.id as receipt_id, r.receipt_number, r.receipt_date, r.total_amount as purchase_total, r.balance_amount as purchase_balance,
 COALESCE(r.movement_type, 'Customer Sale') as sale_type,
 CASE 
 WHEN r.movement_type = 'Site Usage' THEN 'Engineer'
 ELSE 'Direct Customer'
 END as customer_type
 FROM customers c
 LEFT JOIN receipts r ON r.customer_id = c.id AND (r.is_deleted IS NULL OR r.is_deleted = 0)
 WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)
 ORDER BY c.name ASC
 `);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:getCustomerById', async (event, id) => {
 try {
 return await db.queryOne(`
 SELECT c.*, r.id as receipt_id, r.receipt_number, r.receipt_date, r.total_amount as purchase_total, r.balance_amount as purchase_balance,
 COALESCE(r.movement_type, 'Customer Sale') as sale_type,
 CASE 
 WHEN r.movement_type = 'Site Usage' THEN 'Engineer'
 ELSE 'Direct Customer'
 END as customer_type
 FROM customers c
 LEFT JOIN receipts r ON r.customer_id = c.id AND (r.is_deleted IS NULL OR r.is_deleted = 0)
 WHERE c.id = ? AND (c.is_deleted IS NULL OR c.is_deleted = 0)
 `, [id]);
 } catch (err) { return null; }
});

ipcMain.handle('db:deleteCustomer', async (event, id) => {
 try {
 const now = getLocalISOString();
 await db.run('UPDATE customers SET is_deleted = 1, deleted_at = ? WHERE id = ?', [now, id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:addCustomer', async (event, { name, phone, address, customer_type }) => {
 try {
 if (!name) return { success: false, error: 'Customer name is required.' };
 const now = getLocalISOString();
 const result = await db.run(
 'INSERT INTO customers (name, phone, address, total_purchases, balance_amount, customer_type, created_at) VALUES (?, ?, ?, 0, 0, ?, ?)',
 [name, phone || '', address || '', customer_type || 'Retailer', now]
 );
 return { success: true, id: result.lastInsertRowid };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:updateCustomer', async (event, { id, name, phone, address, customer_type }) => {
 try {
 if (!id || !name) return { success: false, error: 'ID and name required.' };
 await db.run('UPDATE customers SET name=?, phone=?, address=?, customer_type=? WHERE id=?', [name, phone || '', address || '', customer_type || 'Retailer', id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:getCustomerHistory', async (event, customerId) => {
 try {
 return await db.query(
 `SELECT r.*, GROUP_CONCAT(ri.material_name) as materials
 FROM receipts r
 LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
 WHERE r.customer_id = ? AND (r.is_deleted IS NULL OR r.is_deleted = 0)
 GROUP BY r.id
 ORDER BY r.created_at DESC`,
 [customerId]
 );
 } catch (err) { console.error(err); return []; }
});

// =============================================================
// IPC – RECEIPTS
// =============================================================

ipcMain.handle('db:getReceipts', async (event, filters) => {
 try {
 let sql = `
 SELECT r.*, c.phone as cust_phone,
 (SELECT GROUP_CONCAT(ri.material_name || ' ×' || ri.quantity || ' ' || COALESCE(ri.unit, '')) 
 FROM receipt_items ri WHERE ri.receipt_id = r.id) as products_purchased
 FROM receipts r
 LEFT JOIN customers c ON r.customer_id = c.id
 WHERE (r.is_deleted IS NULL OR r.is_deleted = 0)
 `;
 const params = [];
 if (filters) {
 if (filters.customer_name) { sql += ' AND r.customer_name LIKE ?'; params.push(`%${filters.customer_name}%`); }
 if (filters.from_date) { sql += ' AND date(COALESCE(r.receipt_date, r.created_at)) >= date(?)'; params.push(filters.from_date); }
 if (filters.to_date) { sql += ' AND date(COALESCE(r.receipt_date, r.created_at)) <= date(?)'; params.push(filters.to_date); }
 }
 sql += ' ORDER BY COALESCE(r.receipt_date, r.created_at) DESC';
 return await db.query(sql, params);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:getReceiptById', async (event, id) => {
 try {
 const receipt = await db.queryOne('SELECT * FROM receipts WHERE id = ? AND (is_deleted IS NULL OR is_deleted = 0)', [id]);
 if (!receipt) return null;
 const items = await db.query('SELECT * FROM receipt_items WHERE receipt_id = ?', [id]);
 const payments = await db.query('SELECT * FROM payments WHERE receipt_id = ? ORDER BY id ASC', [id]);
 return { ...receipt, items, payments };
 } catch (err) { return null; }
});

ipcMain.handle('db:getReceiptByNumber', async (event, receiptNumber) => {
 try {
 const receipt = await db.queryOne('SELECT * FROM receipts WHERE receipt_number = ? AND (is_deleted IS NULL OR is_deleted = 0)', [receiptNumber]);
 if (!receipt) return null;
 const items = await db.query('SELECT * FROM receipt_items WHERE receipt_id = ?', [receipt.id]);
 return { ...receipt, items };
 } catch (err) { return null; }
});

ipcMain.handle('db:deleteReceipt', async (event, id) => {
 try {
 const receipt = await db.queryOne('SELECT * FROM receipts WHERE id = ?', [id]);
 if (!receipt) return { success: false, error: 'Receipt not found.' };

 await db.run('BEGIN TRANSACTION');
 try {
 const now = getLocalISOString();
 // 1. Soft delete receipt
 await db.run('UPDATE receipts SET is_deleted = 1, deleted_at = ? WHERE id = ?', [now, id]);

 // 2. Find and reverse/soft delete associated stock movements
 const movements = await db.query('SELECT * FROM stock_movements WHERE receipt_id = ? AND (is_deleted IS NULL OR is_deleted = 0)', [id]);
 for (const sm of movements) {
 await db.run('UPDATE stock_movements SET is_deleted = 1, deleted_at = ? WHERE id = ?', [now, sm.id]);

 // Reverse stock level based on stock_direction or fallback
 let dir = sm.stock_direction;
 if (!dir) {
 if (sm.movement_type === 'Stock In') {
 dir = 'IN';
 } else if (['Customer Sale', 'Direct Sale', 'Stock Out', 'Site Usage', 'Damaged Stock'].includes(sm.movement_type)) {
 dir = 'OUT';
 } else if (sm.movement_type === 'Adjustment') {
 dir = 'IN';
 }
 }

 if (dir === 'IN') {
 const mat = await db.queryOne('SELECT current_stock, name FROM materials WHERE id = ?', [sm.material_id]);
 if (mat && (mat.current_stock - sm.quantity < 0)) {
 throw new Error(`Cannot delete receipt. Reversing stock movement for '${mat.name}' would make stock negative.`);
 }
 await db.run('UPDATE materials SET current_stock = current_stock - ? WHERE id = ?', [sm.quantity, sm.material_id]);
 } else if (dir === 'OUT') {
 await db.run('UPDATE materials SET current_stock = current_stock + ? WHERE id = ?', [sm.quantity, sm.material_id]);
 }
 }

 // 3. Update customer total purchases and balance safely
 if (receipt.customer_id) {
 const cust = await db.queryOne('SELECT total_purchases, balance_amount FROM customers WHERE id = ?', [receipt.customer_id]);
 if (cust) {
 const newPurchases = Math.max(0, (cust.total_purchases || 0) - (receipt.total_amount || 0));
 const newBalance = Math.max(0, (cust.balance_amount || 0) - (receipt.balance_amount || 0));
 await db.run(
 'UPDATE customers SET total_purchases = ?, balance_amount = ? WHERE id = ?',
 [newPurchases, newBalance, receipt.customer_id]
 );
 }
 }

 await db.run('COMMIT');
 return { success: true };
 } catch (e) {
 await db.run('ROLLBACK');
 throw e;
 }
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:updateReceiptPdfPath', async (event, { id, pdf_path }) => {
 try {
 await db.run('UPDATE receipts SET pdf_path = ? WHERE id = ?', [pdf_path, id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:markWhatsappSent', async (event, id) => {
 try {
 await db.run('UPDATE receipts SET whatsapp_sent = 1 WHERE id = ?', [id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:addPayment', async (event, { receipt_id, amount, remarks, date }) => {
 try {
 if (!receipt_id || amount <= 0) {
 return { success: false, error: 'Invalid receipt ID or payment amount.' };
 }

 const receipt = await db.queryOne('SELECT * FROM receipts WHERE id = ? AND (is_deleted IS NULL OR is_deleted = 0)', [receipt_id]);
 if (!receipt) return { success: false, error: 'Receipt not found.' };

 const remaining = receipt.total_amount - receipt.paid_amount;
 if (amount > remaining) {
 return { success: false, error: `Payment amount (₹${amount.toFixed(2)}) exceeds remaining balance (₹${remaining.toFixed(2)}).` };
 }

 const timestamp = getLocalISOString(date);
 const now = getLocalISOString();

 await db.run('BEGIN TRANSACTION');
 try {
 // Insert payment record
 await db.run(
 `INSERT INTO payments (receipt_id, payment_date, amount, remarks, created_at)
 VALUES (?, ?, ?, ?, ?)`,
 [receipt_id, timestamp, amount, remarks || '', now]
 );

 // Update receipt paid and balance amounts
 const newPaid = receipt.paid_amount + amount;
 const newBalance = receipt.total_amount - newPaid;
 await db.run(
 'UPDATE receipts SET paid_amount = ?, balance_amount = ?, updated_at = ? WHERE id = ?',
 [newPaid, newBalance, now, receipt_id]
 );

 // Update customer balance
 if (receipt.customer_id) {
 const custReceipts = await db.query(
 'SELECT SUM(balance_amount) as total_balance FROM receipts WHERE customer_id = ? AND (is_deleted IS NULL OR is_deleted = 0)',
 [receipt.customer_id]
 );
 const newCustBalance = custReceipts[0]?.total_balance || 0;
 await db.run('UPDATE customers SET balance_amount = ? WHERE id = ?', [newCustBalance, receipt.customer_id]);
 }

 await db.run('COMMIT');

 // Regenerate PDF
 await generateReceiptPDF(receipt_id);

 return { success: true };
 } catch (e) {
 await db.run('ROLLBACK');
 throw e;
 }
 } catch (err) {
 return { success: false, error: err.message };
 }
});

// =============================================================
// IPC – PDF GENERATION
// =============================================================

async function generateReceiptPDF(receiptId) {
 const receipt = await db.queryOne('SELECT * FROM receipts WHERE id = ?', [receiptId]);
 if (!receipt) throw new Error('Receipt not found.');
 const items = await db.query('SELECT * FROM receipt_items WHERE receipt_id = ?', [receiptId]);
 const payments = await db.query('SELECT * FROM payments WHERE receipt_id = ? ORDER BY id ASC', [receiptId]);
 const settings = await db.queryOne('SELECT * FROM company_settings LIMIT 1');

 // Build receipt HTML for printing
 const receiptHtml = buildReceiptHtml({ receipt, items, payments, settings });

 // Create a hidden window to render and print
 const printWin = new BrowserWindow({
 width: 800,
 height: 1100,
 show: false,
 webPreferences: { contextIsolation: true }
 });

 await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptHtml));

 // Wait for page to fully render
 await new Promise(resolve => setTimeout(resolve, 800));

 const pdfData = await printWin.webContents.printToPDF({
 printBackground: true,
 pageSize: 'A4',
 margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4, marginType: 'custom' }
 });

 printWin.destroy();

 const fileName = `${receipt.receipt_number}.pdf`;
 const filePath = path.join(receiptsDir, fileName);
 fs.writeFileSync(filePath, pdfData);

 // Update receipt with pdf path
 await db.run('UPDATE receipts SET pdf_path = ? WHERE id = ?', [filePath, receiptId]);

 return { filePath, fileName };
}

ipcMain.handle('pdf:generate', async (event, { receiptId }) => {
 try {
 const res = await generateReceiptPDF(receiptId);
 return { success: true, ...res };
 } catch (err) {
 console.error('PDF generation error:', err);
 return { success: false, error: err.message };
 }
});

// =============================================================
// IPC – SHELL / WHATSAPP
// =============================================================

ipcMain.handle('shell:openExternal', async (event, url) => {
 try {
 await shell.openExternal(url);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('shell:showItemInFolder', async (event, filePath) => {
 try {
 shell.showItemInFolder(filePath);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('shell:openPath', async (event, filePath) => {
 try {
 const err = await shell.openPath(filePath);
 if (err) return { success: false, error: err };
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('fs:fileExists', async (event, filePath) => {
 try {
 return fs.existsSync(filePath);
 } catch (err) {
 return false;
 }
});

ipcMain.handle('clipboard:writeFile', async (event, filePath) => {
 try {
 clipboard.write({
 filenames: [filePath]
 });
 return { success: true };
 } catch (err) {
 return { success: false, error: err.message };
 }
});

ipcMain.handle('whatsapp:sendPDF', async (event, { phone, filePath }) => {
 try {
 const { exec } = require('child_process');

 // Clear clipboard first
 clipboard.clear();

 // Copy PDF to clipboard using Electron's native clipboard API (extremely reliable file copy)
 clipboard.write({
 filenames: [filePath]
 });

 // Open WhatsApp URL
 const waUrl = `https://wa.me/${phone}`;
 await shell.openExternal(waUrl);

 // Write PowerShell script to temporary file inside receipts folder to avoid shell escaping issues
 const tempScriptPath = path.join(receiptsDir, 'send_wa.ps1');
 const psScript = `# Automated script to activate WhatsApp and paste receipt
Start-Sleep -Seconds 6
$wshell = New-Object -ComObject wscript.shell
$proc = Get-Process | Where-Object { $_.MainWindowTitle -like '*WhatsApp*' } | Select-Object -First 1
if ($proc) {
 $sig = @'
 [DllImport("user32.dll")]
 public static extern bool SetForegroundWindow(IntPtr hWnd);
 [DllImport("user32.dll")]
 public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
'@
 $type = Add-Type -MemberDefinition $sig -Name "Win32Util" -Namespace "Win32" -PassThru
 $type::ShowWindowAsync($proc.MainWindowHandle, 9) | Out-Null
 $type::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
} else {
 $wshell.AppActivate('WhatsApp') | Out-Null
}
Start-Sleep -Seconds 1
$wshell.sendkeys('^v')
Start-Sleep -Seconds 2
$wshell.sendkeys('{ENTER}')
`;

 fs.writeFileSync(tempScriptPath, psScript, 'utf8');

 // Run powershell file
 exec(`powershell -ExecutionPolicy Bypass -File "${tempScriptPath}"`, (err) => {
 // Clean up script file
 try {
 if (fs.existsSync(tempScriptPath)) {
 fs.unlinkSync(tempScriptPath);
 }
 } catch (cleanupErr) {
 console.error('Failed to clean up temp script:', cleanupErr);
 }
 if (err) {
 console.error('PowerShell auto-send failed:', err);
 }
 });

 return { success: true };
 } catch (err) {
 return { success: false, error: err.message };
 }
});

// =============================================================
// IPC – COMPANY SETTINGS
// =============================================================

ipcMain.handle('db:getCompanySettings', async () => {
 try {
 const settings = await db.queryOne('SELECT * FROM company_settings LIMIT 1');
 return settings || { company_name: 'Sivakami Traders', address: '', phone: '', email: '', gstin: '', logo_path: 'assets/logo.png' };
 } catch (err) { return { company_name: 'Sivakami Traders' }; }
});

ipcMain.handle('db:saveCompanySettings', async (event, { company_name, address, phone, email, gstin, logo_path }) => {
 try {
 const existing = await db.queryOne('SELECT id FROM company_settings LIMIT 1');
 if (existing) {
 await db.run(
 'UPDATE company_settings SET company_name=?, address=?, phone=?, email=?, gstin=?, logo_path=? WHERE id=?',
 [company_name, address, phone, email, gstin, logo_path, existing.id]
 );
 } else {
 await db.run(
 'INSERT INTO company_settings (company_name, address, phone, email, gstin, logo_path) VALUES (?,?,?,?,?,?)',
 [company_name, address, phone, email, gstin, logo_path]
 );
 }
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:addExpense', async (event, data) => {
  try {
    if (!data.expense_category || !data.expense_date || !data.expense_type || data.amount === undefined) {
      return { success: false, error: 'Required fields are missing.' };
    }
    if (parseFloat(data.amount) < 0) {
      return { success: false, error: 'Amount cannot be negative.' };
    }
    await db.addExpense(data);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:updateExpense', async (event, { id, data }) => {
  try {
    if (!id || !data.expense_category || !data.expense_date || !data.expense_type || data.amount === undefined) {
      return { success: false, error: 'Required fields are missing.' };
    }
    if (parseFloat(data.amount) < 0) {
      return { success: false, error: 'Amount cannot be negative.' };
    }
    await db.updateExpense(id, data);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:deleteExpense', async (event, id) => {
  try {
    if (!id) return { success: false, error: 'ID is required.' };
    await db.deleteExpense(id);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:getExpenses', async (event, filters) => {
  try {
    return await db.getExpenses(filters);
  } catch (err) {
    console.error(err);
    return [];
  }
});

ipcMain.handle('db:getExpenseSummary', async (event, filters) => {
  try {
    return await db.getExpenseSummary(filters);
  } catch (err) {
    console.error(err);
    return { vehicleTotal: 0, personalTotal: 0, totalExpenses: 0 };
  }
});

ipcMain.handle('db:getVehicleExpenseBreakdown', async (event, filters) => {
  try {
    return await db.getVehicleExpenseBreakdown(filters);
  } catch (err) {
    console.error(err);
    return [];
  }
});

ipcMain.handle('db:getPersonalExpenseBreakdown', async (event, filters) => {
  try {
    return await db.getPersonalExpenseBreakdown(filters);
  } catch (err) {
    console.error(err);
    return [];
  }
});

ipcMain.handle('db:getDailyExpenseSummary', async (event, filters) => {
  try {
    return await db.getDailyExpenseSummary(filters);
  } catch (err) {
    console.error(err);
    return [];
  }
});

ipcMain.handle('db:getMonthlyExpenseTrend', async (event, filters) => {
  try {
    return await db.getMonthlyExpenseTrend(filters);
  } catch (err) {
    console.error(err);
    return [];
  }
});

// =============================================================
// IPC – EMPLOYEES & EXPENSES
// =============================================================

ipcMain.handle('db:getEmployees', async () => {
 try {
 return await db.query('SELECT * FROM employees ORDER BY name ASC');
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:getVehicleExpenses', async (event, filters) => {
 try {
 let sql = 'SELECT *, (fuel_expense + tn_snacks_expense + other_expense) as total FROM vehicle_expenses WHERE 1=1';
 const params = [];
 if (filters) {
 if (filters.search) {
 sql += ' AND (vehicle_number LIKE ? OR remarks LIKE ?)';
 params.push(`%${filters.search}%`, `%${filters.search}%`);
 }
 if (filters.from_date) {
 sql += ' AND date >= ?';
 params.push(filters.from_date);
 }
 if (filters.to_date) {
 sql += ' AND date <= ?';
 params.push(filters.to_date);
 }
 }
 sql += ' ORDER BY date DESC, id DESC';
 return await db.query(sql, params);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:addVehicleExpense', async (event, { date, vehicle_number, fuel_expense, tn_snacks_expense, other_expense, remarks }) => {
 try {
 if (!date || !vehicle_number) return { success: false, error: 'Date and vehicle number are required.' };
 const now = new Date().toISOString();
 await db.run(
 `INSERT INTO vehicle_expenses (date, vehicle_number, fuel_expense, tn_snacks_expense, other_expense, remarks, created_at)
 VALUES (?, ?, ?, ?, ?, ?, ?)`,
 [date, vehicle_number.trim().toUpperCase(), fuel_expense || 0, tn_snacks_expense || 0, other_expense || 0, remarks || '', now]
 );
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:updateVehicleExpense', async (event, { id, date, vehicle_number, fuel_expense, tn_snacks_expense, other_expense, remarks }) => {
 try {
 if (!id || !date || !vehicle_number) return { success: false, error: 'ID, date, and vehicle number are required.' };
 await db.run(
 `UPDATE vehicle_expenses 
 SET date=?, vehicle_number=?, fuel_expense=?, tn_snacks_expense=?, other_expense=?, remarks=?
 WHERE id=?`,
 [date, vehicle_number.trim().toUpperCase(), fuel_expense || 0, tn_snacks_expense || 0, other_expense || 0, remarks || '', id]
 );
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:deleteVehicleExpense', async (event, id) => {
 try {
 await db.run('DELETE FROM vehicle_expenses WHERE id=?', [id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:getPersonalExpenses', async (event, filters) => {
 try {
 let sql = `
 SELECT pe.*, e.name as employee_name, e.role as employee_role
 FROM personal_expenses pe
 JOIN employees e ON pe.employee_id = e.id
 WHERE 1=1
 `;
 const params = [];
 if (filters) {
 if (filters.search) {
 sql += ' AND (e.name LIKE ? OR pe.description LIKE ? OR pe.remarks LIKE ?)';
 params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
 }
 if (filters.from_date) {
 sql += ' AND pe.date >= ?';
 params.push(filters.from_date);
 }
 if (filters.to_date) {
 sql += ' AND pe.date <= ?';
 params.push(filters.to_date);
 }
 if (filters.employee_id) {
 sql += ' AND pe.employee_id = ?';
 params.push(filters.employee_id);
 }
 }
 sql += ' ORDER BY pe.date DESC, pe.id DESC';
 return await db.query(sql, params);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:addPersonalExpense', async (event, { employee_id, date, description, amount, remarks }) => {
 try {
 if (!employee_id || !date || !amount) return { success: false, error: 'Employee, date, and amount are required.' };
 const now = new Date().toISOString();
 await db.run(
 `INSERT INTO personal_expenses (employee_id, date, description, amount, remarks, created_at)
 VALUES (?, ?, ?, ?, ?, ?)`,
 [employee_id, date, description || '', amount || 0, remarks || '', now]
 );
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:updatePersonalExpense', async (event, { id, employee_id, date, description, amount, remarks }) => {
 try {
 if (!id || !employee_id || !date || !amount) return { success: false, error: 'ID, employee, date, and amount are required.' };
 await db.run(
 `UPDATE personal_expenses 
 SET employee_id=?, date=?, description=?, amount=?, remarks=?
 WHERE id=?`,
 [employee_id, date, description || '', amount || 0, remarks || '', id]
 );
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:deletePersonalExpense', async (event, id) => {
 try {
 await db.run('DELETE FROM personal_expenses WHERE id=?', [id]);
 return { success: true };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:getExpensesSummary', async () => {
 try {
 const today = getTodayString();
 const currentMonth = today.substring(0, 7) + '%';
 
 const [vToday, pToday, vMonth, pMonth] = await Promise.all([
 db.queryOne('SELECT SUM(fuel_expense + tn_snacks_expense + other_expense) as t FROM vehicle_expenses WHERE date = ?', [today]),
 db.queryOne('SELECT SUM(amount) as t FROM personal_expenses WHERE date = ?', [today]),
 db.queryOne('SELECT SUM(fuel_expense + tn_snacks_expense + other_expense) as t FROM vehicle_expenses WHERE date LIKE ?', [currentMonth]),
 db.queryOne('SELECT SUM(amount) as t FROM personal_expenses WHERE date LIKE ?', [currentMonth])
 ]);
 
 const vehicleToday = vToday?.t || 0;
 const personalToday = pToday?.t || 0;
 const todayTotal = vehicleToday + personalToday;
 const monthlyTotal = (vMonth?.t || 0) + (pMonth?.t || 0);
 
 return {
 todayTotal,
 vehicleToday,
 personalToday,
 monthlyTotal
 };
 } catch (err) {
 console.error(err);
 return { todayTotal: 0, vehicleToday: 0, personalToday: 0, monthlyTotal: 0 };
 }
});

// =============================================================
// IPC – DASHBOARD STATS
// =============================================================

ipcMain.handle('db:getDashboardStats', async () => {
 try {
 const today = getTodayString();
 const todayPrefix = today + '%';
 const [
 cementBagsAvailable,
 lowCementStockCount,
 todaySalesAmount,
 totalOutstanding,
 totalReceipts,
 vExpToday,
 pExpToday
 ] = await Promise.all([
 db.queryOne("SELECT SUM(current_stock) as t FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0) AND category = 'Cement'"),
 db.queryOne("SELECT COUNT(*) as c FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0) AND category = 'Cement' AND current_stock <= minimum_stock"),
 db.queryOne("SELECT SUM(total_amount) as t FROM receipts WHERE (is_deleted IS NULL OR is_deleted = 0) AND created_at LIKE ?", [todayPrefix]),
 db.queryOne("SELECT SUM(balance_amount) as t FROM receipts WHERE (is_deleted IS NULL OR is_deleted = 0)"),
 db.queryOne("SELECT COUNT(*) as c FROM receipts WHERE (is_deleted IS NULL OR is_deleted = 0)"),
 db.queryOne("SELECT SUM(fuel_expense + tn_snacks_expense + other_expense) as t FROM vehicle_expenses WHERE date = ?", [today]),
 db.queryOne("SELECT SUM(amount) as t FROM personal_expenses WHERE date = ?", [today])
 ]);

 const [recentSales, cementStockSummary, lowStockMaterials] = await Promise.all([
 db.query("SELECT r.* FROM receipts r WHERE (r.is_deleted IS NULL OR r.is_deleted = 0) ORDER BY COALESCE(r.receipt_date, r.created_at) DESC LIMIT 5"),
 db.query("SELECT name, current_stock, unit FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0) AND category = 'Cement' ORDER BY name ASC"),
 db.query("SELECT name, current_stock, minimum_stock, unit FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0) AND current_stock <= minimum_stock ORDER BY name ASC LIMIT 10")
 ]);

 const todayExpenses = (vExpToday?.t || 0) + (pExpToday?.t || 0);

 return {
 cementBagsAvailable: cementBagsAvailable?.t || 0,
 lowCementStockCount: lowCementStockCount?.c || 0,
 todaySalesAmount: todaySalesAmount?.t || 0,
 totalOutstanding: totalOutstanding?.t || 0,
 totalReceipts: totalReceipts?.c || 0,
 todayExpenses,
 recentSales: recentSales || [],
 cementStockSummary: cementStockSummary || [],
 lowStockMaterials: lowStockMaterials || []
 };
 } catch (err) {
 console.error(err);
 return {
 cementBagsAvailable: 0,
 lowCementStockCount: 0,
 todaySalesAmount: 0,
 totalOutstanding: 0,
 totalReceipts: 0,
 todayExpenses: 0,
 recentSales: [],
 cementStockSummary: [],
 lowStockMaterials: []
 };
 }
});

// =============================================================
// IPC – REPORTS
// =============================================================

ipcMain.handle('db:getReportsData', async (event, { from_date, to_date }) => {
 try {
 const fromISO = from_date;
 const toISO = to_date;

 // 1. Sales Report Queries
 const salesTotal = await db.queryOne(
 `SELECT SUM(total_amount) as t FROM receipts 
 WHERE (is_deleted IS NULL OR is_deleted = 0) 
 AND date(receipt_date) >= date(?) AND date(receipt_date) <= date(?)`,
 [fromISO, toISO]
 );

 const qtyTotal = await db.queryOne(
 `SELECT SUM(ri.quantity) as q FROM receipt_items ri
 JOIN receipts r ON ri.receipt_id = r.id
 WHERE (r.is_deleted IS NULL OR r.is_deleted = 0)
 AND date(r.receipt_date) >= date(?) AND date(r.receipt_date) <= date(?)`,
 [fromISO, toISO]
 );

 const bestSellers = await db.query(
 `SELECT ri.material_name, SUM(ri.quantity) as total_qty, ri.unit
 FROM receipt_items ri
 JOIN receipts r ON ri.receipt_id = r.id
 WHERE (r.is_deleted IS NULL OR r.is_deleted = 0)
 AND date(r.receipt_date) >= date(?) AND date(r.receipt_date) <= date(?)
 GROUP BY ri.material_name, ri.unit
 ORDER BY total_qty DESC LIMIT 10`,
 [fromISO, toISO]
 );

 const salesByCust = await db.query(
 `SELECT customer_name, SUM(total_amount) as total_sales, COUNT(*) as txn_count
 FROM receipts
 WHERE (is_deleted IS NULL OR is_deleted = 0)
 AND date(receipt_date) >= date(?) AND date(receipt_date) <= date(?)
 GROUP BY customer_name
 ORDER BY total_sales DESC`,
 [fromISO, toISO]
 );

 const salesByType = await db.query(
 `SELECT r.movement_type, SUM(r.total_amount) as total_sales
 FROM receipts r
 WHERE (r.is_deleted IS NULL OR r.is_deleted = 0)
 AND date(r.receipt_date) >= date(?) AND date(r.receipt_date) <= date(?)
 GROUP BY r.movement_type`,
 [fromISO, toISO]
 );

 const dailySales = await db.query(
 `SELECT date(receipt_date) as sales_date, SUM(total_amount) as total_sales
 FROM receipts
 WHERE (is_deleted IS NULL OR is_deleted = 0)
 AND date(receipt_date) >= date(?) AND date(receipt_date) <= date(?)
 GROUP BY sales_date
 ORDER BY sales_date ASC`,
 [fromISO, toISO]
 );

 // 2. Stock Report Queries
 const currentStockList = await db.query(
 `SELECT name, category, current_stock, minimum_stock, unit 
 FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0)
 ORDER BY name ASC`
 );

 const lowStockList = await db.query(
 `SELECT name, category, current_stock, minimum_stock, unit 
 FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0) AND current_stock <= minimum_stock
 ORDER BY name ASC`
 );

 const stockAdded = await db.queryOne(
 `SELECT SUM(quantity) as q FROM stock_movements
 WHERE (is_deleted IS NULL OR is_deleted = 0) AND movement_type = 'Stock In'
 AND date(created_at) >= date(?) AND date(created_at) <= date(?)`,
 [fromISO, toISO]
 );

 const stockSold = await db.queryOne(
 `SELECT SUM(quantity) as q FROM stock_movements
 WHERE (is_deleted IS NULL OR is_deleted = 0) AND movement_type IN ('Stock Out','Customer Sale','Direct Sale','Site Usage')
 AND date(created_at) >= date(?) AND date(created_at) <= date(?)`,
 [fromISO, toISO]
 );

 const stockMovementsList = await db.query(
 `SELECT sm.*, m.name as material_name, m.unit as material_unit
 FROM stock_movements sm
 JOIN materials m ON sm.material_id = m.id
 WHERE (sm.is_deleted IS NULL OR sm.is_deleted = 0)
 AND date(sm.created_at) >= date(?) AND date(sm.created_at) <= date(?)
 ORDER BY sm.created_at DESC`,
 [fromISO, toISO]
 );

 // 3. Customer Report Queries
 const customerList = await db.query(
 `SELECT c.*, 
 (SELECT COUNT(*) FROM receipts WHERE customer_id = c.id AND (is_deleted IS NULL OR is_deleted = 0)) as total_receipts,
 CASE
 WHEN EXISTS (
 SELECT 1 FROM receipts r 
 WHERE r.customer_id = c.id 
 AND r.movement_type = 'Site Usage' 
 AND (r.is_deleted IS NULL OR r.is_deleted = 0)
 ) THEN 'Engineer'
 ELSE 'Direct Customer'
 END AS customer_type
 FROM customers c
 WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)
 ORDER BY c.name ASC`
 );

 // 4. Payment Report Queries
 const outstandingTotal = await db.queryOne(
 `SELECT SUM(balance_amount) as t FROM receipts WHERE (is_deleted IS NULL OR is_deleted = 0)`
 );

 const fullyPaidCount = await db.queryOne(
 `SELECT COUNT(*) as c FROM receipts 
 WHERE (is_deleted IS NULL OR is_deleted = 0) AND balance_amount = 0`
 );

 const partiallyPaidCount = await db.queryOne(
 `SELECT COUNT(*) as c FROM receipts 
 WHERE (is_deleted IS NULL OR is_deleted = 0) AND balance_amount > 0 AND paid_amount > 0`
 );

 const pendingCount = await db.queryOne(
 `SELECT COUNT(*) as c FROM receipts 
 WHERE (is_deleted IS NULL OR is_deleted = 0) AND paid_amount = 0`
 );

 const outstandingCustWise = await db.query(
 `SELECT customer_name, SUM(balance_amount) as total_outstanding, SUM(total_amount) as total_bill
 FROM receipts
 WHERE (is_deleted IS NULL OR is_deleted = 0) AND balance_amount > 0
 GROUP BY customer_name
 ORDER BY total_outstanding DESC`
 );

 // 5. Expense Report Queries
 const vExpList = await db.query(
 `SELECT *, (fuel_expense + tn_snacks_expense + other_expense) as total 
 FROM vehicle_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)
 ORDER BY date DESC`,
 [fromISO, toISO]
 );

 const pExpList = await db.query(
 `SELECT pe.*, e.name as employee_name 
 FROM personal_expenses pe
 JOIN employees e ON pe.employee_id = e.id
 WHERE date(pe.date) >= date(?) AND date(pe.date) <= date(?)
 ORDER BY pe.date DESC`,
 [fromISO, toISO]
 );

 const vExpTotal = await db.queryOne(
 `SELECT SUM(fuel_expense + tn_snacks_expense + other_expense) as t 
 FROM vehicle_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)`,
 [fromISO, toISO]
 );

 const pExpTotal = await db.queryOne(
 `SELECT SUM(amount) as t FROM personal_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)`,
 [fromISO, toISO]
 );

 const monthlyExpenses = await db.query(
 `SELECT strftime('%Y-%m', date) as exp_month, 
 SUM(fuel_expense + tn_snacks_expense + other_expense) as v_total
 FROM vehicle_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)
 GROUP BY exp_month
 ORDER BY exp_month ASC`,
 [fromISO, toISO]
 );

 const pMonthlyExpenses = await db.query(
 `SELECT strftime('%Y-%m', date) as exp_month, SUM(amount) as p_total
 FROM personal_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)
 GROUP BY exp_month
 ORDER BY exp_month ASC`,
 [fromISO, toISO]
 );

 const dailyExpenses = await db.query(
 `SELECT date as exp_date, SUM(fuel_expense + tn_snacks_expense + other_expense) as v_total
 FROM vehicle_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)
 GROUP BY exp_date
 ORDER BY exp_date ASC`,
 [fromISO, toISO]
 );

 const pDailyExpenses = await db.query(
 `SELECT date as exp_date, SUM(amount) as p_total
 FROM personal_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)
 GROUP BY exp_date
 ORDER BY exp_date ASC`,
 [fromISO, toISO]
 );

 const employeeWise = await db.query(
 `SELECT e.name as employee_name, SUM(pe.amount) as total_expense
 FROM personal_expenses pe
 JOIN employees e ON pe.employee_id = e.id
 WHERE date(pe.date) >= date(?) AND date(pe.date) <= date(?)
 GROUP BY e.name
 ORDER BY total_expense DESC`,
 [fromISO, toISO]
 );

 const vehicleWise = await db.query(
 `SELECT vehicle_number, SUM(fuel_expense + tn_snacks_expense + other_expense) as total_expense
 FROM vehicle_expenses
 WHERE date(date) >= date(?) AND date(date) <= date(?)
 GROUP BY vehicle_number
 ORDER BY total_expense DESC`,
 [fromISO, toISO]
 );

 return {
 sales: {
 totalSalesAmount: salesTotal?.t || 0,
 totalQtySold: qtyTotal?.q || 0,
 bestSellers,
 salesByCust,
 salesByType,
 dailySales
 },
 stock: {
 currentStock: currentStockList,
 lowStock: lowStockList,
 stockAdded: stockAdded?.q || 0,
 stockSold: stockSold?.q || 0,
 movements: stockMovementsList
 },
 customers: {
 list: customerList
 },
 payments: {
 outstandingAmount: outstandingTotal?.t || 0,
 fullyPaidCount: fullyPaidCount?.c || 0,
 partiallyPaidCount: partiallyPaidCount?.c || 0,
 pendingCount: pendingCount?.c || 0,
 outstandingCustWise
 },
 expenses: {
 vehicleList: vExpList,
 personalList: pExpList,
 vehicleTotal: vExpTotal?.t || 0,
 personalTotal: pExpTotal?.t || 0,
 monthlyExpenses,
 pMonthlyExpenses,
 dailyExpenses,
 pDailyExpenses,
 employeeWise,
 vehicleWise
 }
 };
 } catch (err) {
 console.error(err);
 return null;
 }
});

ipcMain.handle('db:getReports', async (event, filters) => {
 try {
 const reportType = filters.reportType;
 let sql = '';
 const params = [];

 if (reportType === 'lowstock') {
 sql = 'SELECT * FROM materials WHERE (is_deleted IS NULL OR is_deleted = 0)';
 if (filters.search_name) {
 sql += ' AND name LIKE ?';
 params.push(`%${filters.search_name}%`);
 }
 if (filters.material_id) {
 sql += ' AND id = ?';
 params.push(filters.material_id);
 }
 if (filters.category && filters.category !== 'All') {
 sql += ' AND category = ?';
 params.push(filters.category);
 }
 if (filters.unit && filters.unit !== 'All') {
 sql += ' AND unit = ?';
 params.push(filters.unit);
 }
 if (filters.stock_level && filters.stock_level !== 'All') {
 if (filters.stock_level === 'Low Stock') {
 sql += ' AND current_stock <= minimum_stock';
 } else if (filters.stock_level === 'Out of Stock') {
 sql += ' AND current_stock <= 0';
 } else if (filters.stock_level === 'Available') {
 sql += ' AND current_stock > minimum_stock';
 }
 } else if (!filters.stock_level) {
 sql += ' AND current_stock <= minimum_stock';
 }
 sql += ' ORDER BY name ASC';
 } else if (reportType === 'sales') {
 sql = `SELECT sm.*, m.name as material_name, m.unit as material_unit FROM stock_movements sm
 JOIN materials m ON sm.material_id = m.id
 WHERE sm.movement_type IN ('Stock Out','Customer Sale','Direct Sale','Site Usage','Damaged Stock') AND (sm.is_deleted IS NULL OR sm.is_deleted = 0)`;
 if (filters.material_id) { sql += ' AND sm.material_id = ?'; params.push(filters.material_id); }
 if (filters.from_date) { sql += ' AND sm.created_at >= ?'; params.push(new Date(filters.from_date).toISOString()); }
 if (filters.to_date) { const to = new Date(filters.to_date); to.setHours(23, 59, 59, 999); sql += ' AND sm.created_at <= ?'; params.push(to.toISOString()); }
 sql += ' ORDER BY sm.created_at DESC';
 } else if (reportType === 'receipts') {
 sql = `SELECT r.* FROM receipts r WHERE (r.is_deleted IS NULL OR r.is_deleted = 0)`;
 if (filters.from_date) { sql += ' AND COALESCE(r.receipt_date, r.created_at) >= ?'; params.push(new Date(filters.from_date).toISOString()); }
 if (filters.to_date) { const to = new Date(filters.to_date); to.setHours(23, 59, 59, 999); sql += ' AND COALESCE(r.receipt_date, r.created_at) <= ?'; params.push(to.toISOString()); }
 sql += ' ORDER BY COALESCE(r.receipt_date, r.created_at) DESC';
 } else if (reportType === 'customers') {
 sql = `SELECT c.*, 
 CASE
 WHEN EXISTS (
 SELECT 1 FROM receipts r 
 WHERE r.customer_id = c.id 
 AND r.movement_type = 'Site Usage' 
 AND (r.is_deleted IS NULL OR r.is_deleted = 0)
 ) THEN 'Engineer'
 ELSE 'Direct Customer'
 END AS customer_type,
 (c.total_purchases - c.balance_amount) as paid_amount,
 (SELECT MAX(COALESCE(receipt_date, created_at)) FROM receipts WHERE customer_id = c.id AND (is_deleted IS NULL OR is_deleted = 0)) as last_purchase_date
 FROM customers c
 WHERE (c.is_deleted IS NULL OR c.is_deleted = 0)`;
 if (filters.customer_id) {
 sql += ' AND c.id = ?';
 params.push(filters.customer_id);
 }
 if (filters.balance_status && filters.balance_status !== 'All') {
 if (filters.balance_status === 'Has Balance') {
 sql += ' AND c.balance_amount > 0';
 } else if (filters.balance_status === 'Fully Paid') {
 sql += ' AND c.balance_amount <= 0';
 }
 }
 if (filters.phone) {
 sql += ' AND c.phone LIKE ?';
 params.push(`%${filters.phone}%`);
 }
 if (filters.name) {
 sql += ' AND c.name LIKE ?';
 params.push(`%${filters.name}%`);
 }
 if (filters.from_date) {
 sql += ' AND c.created_at >= ?';
 params.push(new Date(filters.from_date).toISOString());
 }
 if (filters.to_date) {
 const to = new Date(filters.to_date); to.setHours(23, 59, 59, 999);
 sql += ' AND c.created_at <= ?';
 params.push(to.toISOString());
 }
 sql += ' ORDER BY c.total_purchases DESC';
 } else {
 // Default: stock movements
 sql = `SELECT sm.*, m.name as material_name, m.unit as material_unit
 FROM stock_movements sm JOIN materials m ON sm.material_id = m.id WHERE (sm.is_deleted IS NULL OR sm.is_deleted = 0)`;
 if (filters.material_id) { sql += ' AND sm.material_id = ?'; params.push(filters.material_id); }
 if (filters.movement_type && filters.movement_type !== 'All') { sql += ' AND sm.movement_type = ?'; params.push(filters.movement_type); }
 if (filters.from_date) { sql += ' AND sm.created_at >= ?'; params.push(new Date(filters.from_date).toISOString()); }
 if (filters.to_date) { const to = new Date(filters.to_date); to.setHours(23, 59, 59, 999); sql += ' AND sm.created_at <= ?'; params.push(to.toISOString()); }
 sql += ' ORDER BY sm.created_at DESC';
 }

 return await db.query(sql, params);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:getCategories', async () => {
 try {
 const rows = await db.query("SELECT DISTINCT category FROM materials WHERE category IS NOT NULL AND category != '' AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY category ASC");
 return rows.map(r => r.category);
 } catch (err) { console.error(err); return []; }
});

ipcMain.handle('db:getUnits', async () => {
 try {
 const rows = await db.query("SELECT DISTINCT unit FROM materials WHERE unit IS NOT NULL AND unit != '' AND (is_deleted IS NULL OR is_deleted = 0) ORDER BY unit ASC");
 return rows.map(r => r.unit);
 } catch (err) { console.error(err); return []; }
});

// =============================================================
// IPC – SYSTEM DIAGNOSTICS & HEALTH
// =============================================================

ipcMain.handle('db:getSystemHealth', async () => {
 try {
 const dbFilePath = db.dbPath;
 let dbSize = 0;
 if (fs.existsSync(dbFilePath)) {
 dbSize = fs.statSync(dbFilePath).size;
 }

 const [cust, mat, rcp, vExp, pExp] = await Promise.all([
 db.queryOne('SELECT COUNT(*) as c FROM customers WHERE is_deleted IS NULL OR is_deleted = 0'),
 db.queryOne('SELECT COUNT(*) as c FROM materials WHERE is_deleted IS NULL OR is_deleted = 0'),
 db.queryOne('SELECT COUNT(*) as c FROM receipts WHERE is_deleted IS NULL OR is_deleted = 0'),
 db.queryOne('SELECT COUNT(*) as c FROM vehicle_expenses'),
 db.queryOne('SELECT COUNT(*) as c FROM personal_expenses')
 ]);

 return {
 dbSize: (dbSize / 1024).toFixed(2) + ' KB',
 customerCount: cust?.c || 0,
 productCount: mat?.c || 0,
 salesCount: rcp?.c || 0,
 receiptsCount: rcp?.c || 0,
 expensesCount: (vExp?.c || 0) + (pExp?.c || 0)
 };
 } catch (err) {
 console.error(err);
 return null;
 }
});

// =============================================================
// IPC – BACKUP / RESTORE
// =============================================================

ipcMain.handle('db:backup', async () => {
 try {
 const d = new Date();
 const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
 const filename = `Sivakami_Backup_${ts}.db`;

 const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
 title: 'Backup Database',
 defaultPath: filename,
 filters: [{ name: 'Database Files', extensions: ['db'] }]
 });
 if (canceled || !filePath) return { success: false, error: 'Backup cancelled.' };

 const srcPath = db.dbPath;
 fs.copyFileSync(srcPath, filePath);
 const backupSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

 return { 
 success: true, 
 filePath, 
 size: (backupSize / 1024).toFixed(2) + ' KB',
 date: new Date().toISOString()
 };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:restore', async () => {
 try {
 const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
 title: 'Restore Database',
 filters: [{ name: 'Database Files', extensions: ['db'] }],
 properties: ['openFile']
 });
 if (canceled || !filePaths || filePaths.length === 0) return { success: false, error: 'Restore cancelled.' };

 const destPath = db.dbPath;
 fs.copyFileSync(filePaths[0], destPath);
 return { success: true, message: 'Database restored. Please restart the application.' };
 } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db:resetDemoData', async () => {
 try {
 await db.run('PRAGMA foreign_keys = OFF');
 await db.run('BEGIN TRANSACTION');
 try {
 await db.run('DELETE FROM receipt_items');
 await db.run('DELETE FROM payments');
 await db.run('DELETE FROM stock_movements');
 await db.run('DELETE FROM receipts');
 await db.run('DELETE FROM customers');
 await db.run('DELETE FROM pending_bulk_orders');
 await db.run('DELETE FROM retailer_orders');
 await db.run('DELETE FROM materials');

 const now = new Date().toISOString();
 const materials = [
 ['UltraTech Cement OPC 53', 'Cement', 'Bags', 500, 100, 380, now],
 ['Ramco Supergrade PPC', 'Cement', 'Bags', 400, 100, 360, now],
 ['Crushed Limestone Coarse', 'Raw Materials', 'Tons', 50, 10, 1200, now],
 ['Natural Gypsum Granules', 'Raw Materials', 'Tons', 15, 3, 800, now],
 ['Fine River Sand', 'Raw Materials', 'Tons', 80, 20, 600, now],
 ['PP Woven Cement Bags', 'Packing Materials', 'Pcs', 2500, 500, 8, now],
 ['Industrial Fly Ash', 'Additives', 'Tons', 30, 5, 900, now],
 ['High Speed Diesel (HSD)', 'Fuel', 'Liters', 1000, 200, 95, now],
 ['Heavy Machine Conveyor Belt', 'Spare Parts', 'Pcs', 5, 2, 15000, now]
 ];
 for (const m of materials) {
 await db.run(
 'INSERT INTO materials (name, category, unit, current_stock, minimum_stock, rate, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
 m
 );
 }

 await db.run('DELETE FROM company_settings');
 await db.run(
 `INSERT INTO company_settings (company_name, address, phone, email, gstin, logo_path, demo_seeded)
 VALUES (?, ?, ?, ?, ?, ?, 1)`,
 ['Sivakami Traders', 'Enter your company address here', '+91 XXXXX XXXXX', 'info@sivakamistraders.com', '', 'assets/logo.png']
 );

 await db.run('COMMIT');
 await db.run('PRAGMA foreign_keys = ON');
 return { success: true };
 } catch (e) {
 await db.run('ROLLBACK');
 await db.run('PRAGMA foreign_keys = ON');
 throw e;
 }
 } catch (err) {
 await db.run('PRAGMA foreign_keys = ON');
 return { success: false, error: err.message };
 }
});

ipcMain.handle('db:clearDemoData', async () => {
 try {
 await db.run('PRAGMA foreign_keys = OFF');
 await db.run('BEGIN TRANSACTION');
 try {
 await db.run('DELETE FROM receipt_items');
 await db.run('DELETE FROM payments');
 await db.run('DELETE FROM stock_movements');
 await db.run('DELETE FROM receipts');
 await db.run('DELETE FROM customers');
 await db.run('DELETE FROM pending_bulk_orders');
 await db.run('DELETE FROM retailer_orders');
 await db.run('DELETE FROM materials');
 await db.run('COMMIT');
 await db.run('PRAGMA foreign_keys = ON');
 return { success: true };
 } catch (e) {
 await db.run('ROLLBACK');
 await db.run('PRAGMA foreign_keys = ON');
 throw e;
 }
 } catch (err) {
 await db.run('PRAGMA foreign_keys = ON');
 return { success: false, error: err.message };
 }
});

ipcMain.handle('db:clearBusinessData', async () => {
 try {
 await db.run('PRAGMA foreign_keys = OFF');
 await db.run('BEGIN TRANSACTION');
 try {
 await db.run('DELETE FROM receipt_items');
 await db.run('DELETE FROM payments');
 await db.run('DELETE FROM stock_movements');
 await db.run('DELETE FROM receipts');
 await db.run('DELETE FROM customers');
 await db.run('UPDATE materials SET current_stock = 0');
 await db.run('COMMIT');
 await db.run('PRAGMA foreign_keys = ON');
 return { success: true };
 } catch (e) {
 await db.run('ROLLBACK');
 await db.run('PRAGMA foreign_keys = ON');
 throw e;
 }
 } catch (err) {
 await db.run('PRAGMA foreign_keys = ON');
 return { success: false, error: err.message };
 }
});

// =============================================================
// LEGACY IPC (keep for backward compat - won't break existing DB)
// =============================================================

ipcMain.handle('db:submitBulkOrder', async () => ({ success: false, error: 'Feature disabled.' }));
ipcMain.handle('db:getPendingBulkOrders', async () => []);
ipcMain.handle('db:getEngineerBulkOrders', async () => []);
ipcMain.handle('db:approveBulkOrder', async () => ({ success: false, error: 'Feature disabled.' }));
ipcMain.handle('db:rejectBulkOrder', async () => ({ success: false, error: 'Feature disabled.' }));
ipcMain.handle('db:submitRetailerOrder', async () => ({ success: false, error: 'Feature disabled.' }));
ipcMain.handle('db:getPendingRetailerOrders', async () => []);
ipcMain.handle('db:getRetailerOrders', async () => []);
ipcMain.handle('db:approveRetailerOrder', async () => ({ success: false, error: 'Feature disabled.' }));
ipcMain.handle('db:rejectRetailerOrder', async () => ({ success: false, error: 'Feature disabled.' }));
ipcMain.handle('db:getUsers', async () => {
 try { return await db.query('SELECT id, name, username, role FROM users ORDER BY name ASC'); }
 catch (err) { return []; }
});
ipcMain.handle('db:addUser', async () => ({ success: false, error: 'User management disabled.' }));

// Legacy reduceStock for backward compat
ipcMain.handle('db:reduceStock', async (event, data) => {
 return ipcMain.emit('db:stockOut', event, data);
});

// =============================================================
// RECEIPT HTML BUILDER (for PDF)
// =============================================================

function buildReceiptHtml({ receipt, items, payments, settings }) {
 const s = settings || {};
 const companyName = s.company_name || 'Sivakami Traders';
 const address = s.address || '';
 const phone = s.phone || '';
 const email = s.email || '';
 const gstin = s.gstin || '';
 const date = new Date(receipt.receipt_date || receipt.created_at).toLocaleString('en-IN');
 const updatedDate = receipt.updated_at ? new Date(receipt.updated_at).toLocaleString('en-IN') : null;

 // Load logo as base64
 let logoBase64 = '';
 try {
 const logoPath = path.join(__dirname, 'assets', 'logo.png');
 if (fs.existsSync(logoPath)) {
 logoBase64 = fs.readFileSync(logoPath).toString('base64');
 }
 } catch (err) {
 console.error('Failed to read logo image:', err);
 }

 const itemsHtml = (items || []).map(item => `
 <tr>
 <td>${item.material_name || ''}</td>
 <td style="text-align:center">${item.quantity} ${item.unit || ''}</td>
 <td style="text-align:right">₹${parseFloat(item.rate || 0).toFixed(2)}</td>
 <td style="text-align:right"><strong>₹${parseFloat(item.total || 0).toFixed(2)}</strong></td>
 </tr>
 `).join('');

 // Payment History Section
 let paymentsHtml = '';
 if (payments && payments.length > 0) {
 const rows = payments.map(p => `
 <tr>
 <td style="padding:6px 10px;">${new Date(p.payment_date).toLocaleDateString('en-IN')}</td>
 <td style="padding:6px 10px;text-align:right;">₹${parseFloat(p.amount).toFixed(2)}</td>
 <td style="padding:6px 10px;">${p.remarks ? escapeHtml(p.remarks) : '-'}</td>
 </tr>
 `).join('');

 paymentsHtml = `
 <div class="section-title" style="margin-top:16px;">Payment History</div>
 <table style="font-size:12px;margin-bottom:16px;width:100%;border:1px solid #eee;">
 <thead>
 <tr style="background:#e2e8f0;color:#1a1e24;">
 <th style="padding:6px 10px;font-size:11px;">Date</th>
 <th style="padding:6px 10px;text-align:right;font-size:11px;">Amount</th>
 <th style="padding:6px 10px;font-size:11px;">Remarks</th>
 </tr>
 </thead>
 <tbody>
 ${rows}
 </tbody>
 </table>
 `;
 }

 // Calculate payment status
 let statusText = 'Pending';
 const paid = parseFloat(receipt.paid_amount || 0);
 const total = parseFloat(receipt.total_amount || 0);
 const balance = parseFloat(receipt.balance_amount || 0);

 if (balance <= 0) {
 statusText = 'Fully Paid';
 } else if (paid > 0) {
 statusText = 'Partially Paid';
 }

 const balanceStyle = balance > 0 ? 'color:#c62828;font-weight:bold' : 'color:#2e7d32;font-weight:bold';

 function escapeHtml(str) {
 if (!str) return '';
 return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
 }

 return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
 * { margin:0; padding:0; box-sizing:border-box; }
 body { font-family: 'Arial', sans-serif; font-size: 13px; color: #222; background: #fff; padding: 30px; }
 .receipt-wrapper { max-width: 700px; margin: 0 auto; border: 2px solid #ff6f00; border-radius: 8px; overflow: hidden; }
 .receipt-header { background: linear-gradient(135deg, #1a1e24, #3a404a); color: #fff; padding: 24px 30px; }
 .company-name { font-size: 26px; font-weight: bold; letter-spacing: 1px; color: #ff6f00; }
 .company-sub { font-size: 12px; color: #aaa; margin-top: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
 .company-contact { font-size: 11px; color: #ccc; margin-top: 8px; line-height: 1.6; }
 .receipt-meta { background: #fff3e0; padding: 14px 30px; display: flex; justify-content: space-between; border-bottom: 2px solid #ff6f00; }
 .receipt-meta .meta-label { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 600; }
 .receipt-meta .meta-value { font-size: 14px; font-weight: bold; color: #1a1e24; margin-top: 2px; }
 .receipt-body { padding: 24px 30px; }
 .section-title { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 700; letter-spacing: 1px; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
 .customer-info { margin-bottom: 20px; }
 .customer-info p { margin: 3px 0; font-size: 13px; }
 table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
 thead tr { background: #1a1e24; color: #fff; }
 thead th { padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; text-align: left; }
 tbody tr:nth-child(even) { background: #f9f9f9; }
 tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; }
 .totals-box { background: #f3f5f8; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
 .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
 .totals-row.grand { font-size: 16px; font-weight: bold; border-top: 2px solid #ff6f00; padding-top: 10px; margin-top: 6px; color: #ff6f00; }
 .remarks-box { background: #fffde7; border: 1px solid #ffe082; border-radius: 4px; padding: 10px; font-size: 12px; margin-bottom: 20px; }
 .footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; padding-top: 20px; border-top: 1px dashed #ccc; }
 .footer .thank-you { font-size: 13px; color: #555; font-style: italic; }
 .footer .signature { text-align: right; font-size: 12px; color: #888; }
 .signature-line { width: 150px; border-top: 1px solid #222; margin: 40px 0 4px auto; }
 .whatsapp-tag { display: inline-block; background: #25D366; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 8px; }
</style>
</head>
<body>
<div class="receipt-wrapper">
 <div class="receipt-header" style="display:flex;align-items:center;justify-content:space-between;">
 <div>
 <div class="company-name">${companyName}</div>
 <div class="company-sub">Cement &amp; Raw Materials Inventory</div>
 <div class="company-contact">
 ${address ? address + '<br>' : ''}
 ${phone ? ' ' + phone + ' ' : ''}
 ${email ? ' ' + email + ' ' : ''}
 ${gstin ? 'GSTIN: ' + gstin : ''}
 </div>
 </div>
 ${logoBase64 ? `
 <div>
 <img src="data:image/jpeg;base64,${logoBase64}" style="max-height:80px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.2);" onerror="this.style.display='none';">
 </div>
 ` : ''}
 </div>

 <div class="receipt-meta">
 <div>
 <div class="meta-label">Receipt Number</div>
 <div class="meta-value">${receipt.receipt_number}</div>
 </div>
 <div>
 <div class="meta-label">Date &amp; Time</div>
 <div class="meta-value">${date}${updatedDate ? `<br><span style="font-size:10px;color:#c62828;font-weight:bold;">Updated: ${updatedDate}</span>` : ''}</div>
 </div>
 <div>
 <div class="meta-label">Status</div>
 <div class="meta-value" style="color:${balance <= 0 ? '#2e7d32' : '#ff6f00'};text-transform:uppercase;">${statusText}</div>
 </div>
 </div>

 <div class="receipt-body">
 <div class="customer-info">
 <div class="section-title">Customer Details</div>
 <p><strong>Name:</strong> ${receipt.customer_name || '-'}</p>
 ${receipt.customer_phone ? `<p><strong>Phone:</strong> ${receipt.customer_phone}</p>` : ''}
 ${receipt.customer_address ? `<p><strong>Address:</strong> ${receipt.customer_address}</p>` : ''}
 </div>

 <div class="section-title">Item Details</div>
 <table>
 <thead>
 <tr>
 <th>Material</th>
 <th style="text-align:center">Qty / Unit</th>
 <th style="text-align:right">Rate</th>
 <th style="text-align:right">Amount</th>
 </tr>
 </thead>
 <tbody>
 ${itemsHtml}
 </tbody>
 </table>

 ${paymentsHtml}

 <div class="totals-box">
 <div class="totals-row"><span>Total Amount</span><span>₹${parseFloat(receipt.total_amount || 0).toFixed(2)}</span></div>
 <div class="totals-row"><span>Total Received</span><span style="color:#2e7d32">₹${parseFloat(receipt.paid_amount || 0).toFixed(2)}</span></div>
 <div class="totals-row grand"><span>Balance Due</span><span style="${balanceStyle}">₹${parseFloat(receipt.balance_amount || 0).toFixed(2)}</span></div>
 </div>

 ${receipt.remarks ? `<div class="remarks-box"><strong>Remarks:</strong> ${receipt.remarks}</div>` : ''}

 <div class="footer">
 <div class="thank-you">Thank you for doing business with ${companyName}!<br>We value your trust.</div>
 <div class="signature">
 <div class="signature-line"></div>
 <div>Authorized Signature</div>
 <div style="font-size:10px;margin-top:2px;color:#aaa">${companyName}</div>
 </div>
 </div>
 </div>
</div>
</body>
</html>`;
}
