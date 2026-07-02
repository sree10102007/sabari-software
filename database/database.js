const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { app } = require('electron');

// Determine database path
let dbPath;
const localDbPath = path.join(__dirname, 'sivakami_traders.db');

if (app) {
 const userDataPath = app.getPath('userData');
 dbPath = path.join(userDataPath, 'sivakami_traders.db');
 
 // If the database does not exist in userData, but exists in the local source directory, copy it over.
 if (!fs.existsSync(dbPath) && fs.existsSync(localDbPath)) {
 try {
 fs.copyFileSync(localDbPath, dbPath);
 console.log('Database migrated/copied to userData from local development database.');
 } catch (e) {
 console.error('Failed to copy database to userData:', e);
 }
 }
} else {
 dbPath = localDbPath;
}

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
 fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
 if (err) {
 console.error('Database opening error:', err);
 } else {
 console.log('Database opened successfully at:', dbPath);
 }
});

// Enable foreign key support
db.run('PRAGMA foreign_keys = ON;');
db.run('PRAGMA busy_timeout = 5000;');

// Helper: wrap db.run in Promise
const run = (sql, params = []) => {
 return new Promise((resolve, reject) => {
 db.run(sql, params, function (err) {
 if (err) {
 console.error('SQL error (run):', sql, params, err);
 reject(err);
 } else {
 resolve({ lastInsertRowid: this.lastID, changes: this.changes });
 }
 });
 });
};

// Helper: wrap db.all in Promise
const query = (sql, params = []) => {
 return new Promise((resolve, reject) => {
 db.all(sql, params, (err, rows) => {
 if (err) {
 console.error('SQL error (query):', sql, params, err);
 reject(err);
 } else {
 resolve(rows || []);
 }
 });
 });
};

// Helper: wrap db.get in Promise
const queryOne = (sql, params = []) => {
 return new Promise((resolve, reject) => {
 db.get(sql, params, (err, row) => {
 if (err) {
 console.error('SQL error (queryOne):', sql, params, err);
 reject(err);
 } else {
 resolve(row);
 }
 });
 });
};

// Safe ALTER TABLE helper - ignores error if column already exists
async function safeAddColumn(table, column, definition) {
 try {
 await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
 } catch (e) {
 // Column likely already exists - safe to ignore
 }
}

async function initDatabase() {
 try {
 // ---- CORE TABLES ----

 // Users table
 await run(`
 CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 username TEXT UNIQUE NOT NULL,
 password TEXT NOT NULL,
 role TEXT DEFAULT 'admin'
 )
 `);

 // Materials table
 await run(`
 CREATE TABLE IF NOT EXISTS materials (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT,
 unit TEXT NOT NULL,
 current_stock REAL DEFAULT 0,
 minimum_stock REAL DEFAULT 0,
 rate REAL DEFAULT 0,
 created_at TEXT
 )
 `);

 // Safe migration: add rate column to materials if it doesn't exist
 await safeAddColumn('materials', 'rate', 'REAL DEFAULT 0');

 // Customers table (new)
 await run(`
 CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 phone TEXT,
 address TEXT,
 total_purchases REAL DEFAULT 0,
 balance_amount REAL DEFAULT 0,
 created_at TEXT
 )
 `);

 // Receipts table (new)
 await run(`
 CREATE TABLE IF NOT EXISTS receipts (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 receipt_number TEXT UNIQUE NOT NULL,
 customer_id INTEGER,
 customer_name TEXT,
 customer_phone TEXT,
 customer_address TEXT,
 receipt_date TEXT,
 total_amount REAL DEFAULT 0,
 paid_amount REAL DEFAULT 0,
 balance_amount REAL DEFAULT 0,
 pdf_path TEXT,
 whatsapp_sent INTEGER DEFAULT 0,
 remarks TEXT,
 movement_type TEXT DEFAULT 'Stock Out',
 created_at TEXT,
 FOREIGN KEY(customer_id) REFERENCES customers(id)
 )
 `);

 // Receipt items table (new)
 await run(`
 CREATE TABLE IF NOT EXISTS receipt_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 receipt_id INTEGER,
 material_id INTEGER,
 material_name TEXT,
 quantity REAL,
 unit TEXT,
 rate REAL,
 total REAL,
 FOREIGN KEY(receipt_id) REFERENCES receipts(id),
 FOREIGN KEY(material_id) REFERENCES materials(id)
 )
 `);

 // Payments table (new)
 await run(`
 CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 receipt_id INTEGER NOT NULL,
 payment_date TEXT NOT NULL,
 amount REAL NOT NULL,
 remarks TEXT,
 created_at TEXT NOT NULL,
 FOREIGN KEY(receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
 )
 `);

 // Employees table
 await run(`
 CREATE TABLE IF NOT EXISTS employees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT UNIQUE NOT NULL,
 role TEXT
 )
 `);

 // Vehicle Expenses table
 await run(`
 CREATE TABLE IF NOT EXISTS vehicle_expenses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 date TEXT NOT NULL,
 vehicle_number TEXT NOT NULL,
 fuel_expense REAL DEFAULT 0,
 tn_snacks_expense REAL DEFAULT 0,
 other_expense REAL DEFAULT 0,
 remarks TEXT,
 created_at TEXT
 )
 `);

 // Personal Expenses table
 await run(`
 CREATE TABLE IF NOT EXISTS personal_expenses (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 employee_id INTEGER NOT NULL,
 date TEXT NOT NULL,
 description TEXT,
 amount REAL DEFAULT 0,
 remarks TEXT,
 created_at TEXT,
 FOREIGN KEY(employee_id) REFERENCES employees(id)
 )
 `);

 // Company settings table (new)
 await run(`
 CREATE TABLE IF NOT EXISTS company_settings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 company_name TEXT DEFAULT 'Sivakami Traders',
 address TEXT DEFAULT '',
 phone TEXT DEFAULT '',
 email TEXT DEFAULT '',
 gstin TEXT DEFAULT '',
 logo_path TEXT DEFAULT 'assets/logo.png',
 demo_seeded INTEGER DEFAULT 0
 )
 `);

 // Stock movements table (enhanced)
 await run(`
 CREATE TABLE IF NOT EXISTS stock_movements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 material_id INTEGER,
 movement_type TEXT NOT NULL,
 quantity REAL NOT NULL,
 supplier_name TEXT,
 invoice_number TEXT,
 vehicle_number TEXT,
 customer_id INTEGER,
 customer_name TEXT,
 engineer_name TEXT,
 purpose TEXT,
 receipt_id INTEGER,
 rate REAL DEFAULT 0,
 total_amount REAL DEFAULT 0,
 paid_amount REAL DEFAULT 0,
 balance_amount REAL DEFAULT 0,
 remarks TEXT,
 created_by TEXT,
 created_at TEXT,
 FOREIGN KEY(material_id) REFERENCES materials(id),
 FOREIGN KEY(customer_id) REFERENCES customers(id),
 FOREIGN KEY(receipt_id) REFERENCES receipts(id)
 )
 `);

 // Safe migrations for stock_movements columns
 await safeAddColumn('stock_movements', 'customer_id', 'INTEGER');
 await safeAddColumn('stock_movements', 'customer_name', 'TEXT');
 await safeAddColumn('stock_movements', 'receipt_id', 'INTEGER');
 await safeAddColumn('stock_movements', 'rate', 'REAL DEFAULT 0');
 await safeAddColumn('stock_movements', 'total_amount', 'REAL DEFAULT 0');
 await safeAddColumn('stock_movements', 'paid_amount', 'REAL DEFAULT 0');
 await safeAddColumn('stock_movements', 'balance_amount', 'REAL DEFAULT 0');
 await safeAddColumn('stock_movements', 'stock_direction', 'TEXT');

 await safeAddColumn('company_settings', 'demo_seeded', 'INTEGER DEFAULT 0');

 // Soft delete columns
 await safeAddColumn('materials', 'is_deleted', 'INTEGER DEFAULT 0');
 await safeAddColumn('materials', 'deleted_at', 'TEXT');
 await safeAddColumn('materials', 'code', 'TEXT');

 await safeAddColumn('customers', 'is_deleted', 'INTEGER DEFAULT 0');
 await safeAddColumn('customers', 'deleted_at', 'TEXT');
 await safeAddColumn('customers', 'customer_type', "TEXT DEFAULT 'Retailer'");

 // Migrate old 'Direct Customer' values to 'Retailer' in customers table
 await run(`UPDATE customers SET customer_type = 'Retailer' WHERE customer_type = 'Direct Customer' OR customer_type IS NULL OR customer_type = ''`);

 // Add customer_type to receipts if not present
 await safeAddColumn('receipts', 'customer_type', 'TEXT');
 // Add customer_type to stock_movements if not present
 await safeAddColumn('stock_movements', 'customer_type', 'TEXT');

 await safeAddColumn('receipts', 'is_deleted', 'INTEGER DEFAULT 0');
 await safeAddColumn('receipts', 'deleted_at', 'TEXT');
 await safeAddColumn('receipts', 'updated_at', 'TEXT');

 await safeAddColumn('stock_movements', 'is_deleted', 'INTEGER DEFAULT 0');
 await safeAddColumn('stock_movements', 'deleted_at', 'TEXT');

 // Legacy tables - keep for backward compat, do not break old data
 await run(`
 CREATE TABLE IF NOT EXISTS pending_bulk_orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 material_id INTEGER,
 engineer_name TEXT NOT NULL,
 quantity REAL NOT NULL,
 purpose TEXT,
 required_date TEXT,
 remarks TEXT,
 status TEXT DEFAULT 'Pending',
 created_at TEXT,
 FOREIGN KEY(material_id) REFERENCES materials(id)
 )
 `);

 await run(`
 CREATE TABLE IF NOT EXISTS retailer_orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 material_id INTEGER,
 customer_name TEXT NOT NULL,
 phone TEXT,
 quantity REAL NOT NULL,
 status TEXT DEFAULT 'Pending',
 remarks TEXT,
 created_at TEXT,
 FOREIGN KEY(material_id) REFERENCES materials(id)
 )
 `);

 // ---- SEED DATA ----

 // Seed admin user only
 const userCount = await queryOne('SELECT COUNT(*) as count FROM users');
 if (!userCount || userCount.count === 0) {
 const adminHash = bcrypt.hashSync('admin123', 10);
 await run('INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
 ['System Administrator', 'admin', adminHash, 'admin']);
 console.log('Admin user seeded successfully.');
 }

 // Seed company settings if empty
 const settingsCount = await queryOne('SELECT COUNT(*) as count FROM company_settings');
 if (!settingsCount || settingsCount.count === 0) {
 await run(
 `INSERT INTO company_settings (company_name, address, phone, email, gstin, logo_path, demo_seeded)
 VALUES (?, ?, ?, ?, ?, ?, 0)`,
 ['Sivakami Traders', 'Enter your company address here', '+91 XXXXX XXXXX', 'info@sivakamistraders.com', '', 'assets/logo.png']
 );
 console.log('Company settings seeded.');
 }

 // Seed initial materials only once based on demo_seeded flag
 const settings = await queryOne('SELECT demo_seeded FROM company_settings LIMIT 1');
 if (settings && settings.demo_seeded === 0) {
 await run('UPDATE company_settings SET demo_seeded = 1');
 }

 // Migration: Seed existing payments from receipts
 const paymentCount = await queryOne('SELECT COUNT(*) as count FROM payments');
 if (paymentCount && paymentCount.count === 0) {
 const existingReceipts = await query('SELECT id, paid_amount, receipt_date, created_at FROM receipts WHERE paid_amount > 0 AND (is_deleted IS NULL OR is_deleted = 0)');
 for (const r of existingReceipts) {
 const pDate = r.receipt_date || r.created_at || new Date().toISOString();
 await run(
 `INSERT INTO payments (receipt_id, payment_date, amount, remarks, created_at)
 VALUES (?, ?, ?, 'Initial payment', ?)`,
 [r.id, pDate, r.paid_amount, pDate]
 );
 }
 console.log(`Migrated ${existingReceipts.length} payments from existing receipts.`);
 }
 // Seed initial employees if empty
 const empCount = await queryOne('SELECT COUNT(*) as count FROM employees');
 if (!empCount || empCount.count === 0) {
 await run("INSERT INTO employees (name, role) VALUES ('Sabarish', 'Proprietor')");
 await run("INSERT INTO employees (name, role) VALUES ('Arumugam', 'Manager')");
 await run("INSERT INTO employees (name, role) VALUES ('Ramakrishnan', 'Accountant')");
 await run("INSERT INTO employees (name, role) VALUES ('Satheesh', 'Supervisor')");
 await run("INSERT INTO employees (name, role) VALUES ('Sailesh', 'Worker')");
 console.log('Preloaded personnel seeded successfully.');
 }
 } catch (err) {
 console.error('Database initialization error:', err);
 }
}

// Initialize tables and seed
initDatabase();

module.exports = {
 db,
 dbPath,
 run,
 query,
 queryOne
};
