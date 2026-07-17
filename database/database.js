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
 // Suppress duplicate column name migration errors on ALTER TABLE
 if (!/^\s*ALTER\s+TABLE/i.test(sql)) {
 console.error('SQL error (run):', sql, params, err);
 }
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

  // Create unified expenses table
  await run(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_category TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    vehicle_number TEXT,
    person_name TEXT,
    expense_type TEXT NOT NULL,
    amount REAL NOT NULL,
    remarks TEXT,
    created_at TEXT,
    updated_at TEXT,
    is_deleted INTEGER DEFAULT 0
  )
  `);

  // Migration logic from old tables
  const expCountTable = await queryOne('SELECT COUNT(*) as count FROM expenses');
  if (expCountTable && expCountTable.count === 0) {
    // Migrate vehicle expenses
    const hasVehicleExpensesTable = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='vehicle_expenses'");
    if (hasVehicleExpensesTable) {
      const vExps = await query('SELECT * FROM vehicle_expenses');
      for (const v of vExps) {
        const remarksStr = v.remarks || '';
        const vDate = v.date || new Date().toISOString().split('T')[0];
        const vCreatedAt = v.created_at || new Date().toISOString();
        if ((v.fuel_expense || 0) > 0) {
          await run(`INSERT INTO expenses (expense_category, expense_date, vehicle_number, expense_type, amount, remarks, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            ['vehicle', vDate, v.vehicle_number, 'Fuel', v.fuel_expense, remarksStr, vCreatedAt, vCreatedAt]);
        }
        if ((v.tn_snacks_expense || 0) > 0) {
          await run(`INSERT INTO expenses (expense_category, expense_date, vehicle_number, expense_type, amount, remarks, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            ['vehicle', vDate, v.vehicle_number, 'Other', v.tn_snacks_expense, remarksStr ? `${remarksStr} (Snacks)` : 'Snacks', vCreatedAt, vCreatedAt]);
        }
        if ((v.other_expense || 0) > 0) {
          await run(`INSERT INTO expenses (expense_category, expense_date, vehicle_number, expense_type, amount, remarks, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            ['vehicle', vDate, v.vehicle_number, 'Other', v.other_expense, remarksStr, vCreatedAt, vCreatedAt]);
        }
      }
    }

    // Migrate personal expenses
    const hasPersonalExpensesTable = await queryOne("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_expenses'");
    if (hasPersonalExpensesTable) {
      const pExps = await query('SELECT pe.*, e.name as emp_name FROM personal_expenses pe JOIN employees e ON pe.employee_id = e.id');
      for (const p of pExps) {
        const remarksStr = (p.remarks || '') + (p.description ? ' - ' + p.description : '');
        const pDate = p.date || new Date().toISOString().split('T')[0];
        const pCreatedAt = p.created_at || new Date().toISOString();
        if ((p.amount || 0) > 0) {
          await run(`INSERT INTO expenses (expense_category, expense_date, person_name, expense_type, amount, remarks, created_at, updated_at, is_deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            ['personal', pDate, p.emp_name, 'Other', p.amount, remarksStr, pCreatedAt, pCreatedAt]);
        }
      }
    }
  }

  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

// Initialize tables and seed
initDatabase();

function normalizeMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new Error("Invalid money value");
  }

  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

// --- NEW EXPENSES DATABASE FUNCTIONS ---

async function addExpense(data) {
  const { expense_category, expense_date, vehicle_number, person_name, expense_type, amount, remarks } = data;
  const now = new Date().toISOString();
  const safeAmount = normalizeMoney(amount);
  console.log('[DEBUG addExpense DB] raw amount:', amount, '| safeAmount:', safeAmount);
  return await run(
    `INSERT INTO expenses (expense_category, expense_date, vehicle_number, person_name, expense_type, amount, remarks, created_at, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [expense_category, expense_date, vehicle_number || null, person_name || null, expense_type, safeAmount, remarks || '', now, now]
  );
}

async function updateExpense(id, data) {
  const { expense_category, expense_date, vehicle_number, person_name, expense_type, amount, remarks } = data;
  const now = new Date().toISOString();
  const safeAmount = normalizeMoney(amount);
  return await run(
    `UPDATE expenses 
     SET expense_category = ?, expense_date = ?, vehicle_number = ?, person_name = ?, expense_type = ?, amount = ?, remarks = ?, updated_at = ?
     WHERE id = ?`,
    [expense_category, expense_date, vehicle_number || null, person_name || null, expense_type, safeAmount, remarks || '', now, id]
  );
}

async function deleteExpense(id) {
  const now = new Date().toISOString();
  return await run(
    `UPDATE expenses SET is_deleted = 1, updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

async function getExpenses(filters = {}) {
  let sql = `SELECT * FROM expenses WHERE (is_deleted = 0 OR is_deleted IS NULL)`;
  const params = [];
  if (filters.expense_category && filters.expense_category !== 'All') {
    sql += ` AND expense_category = ?`;
    params.push(filters.expense_category);
  }
  if (filters.from_date) {
    sql += ` AND date(expense_date) >= date(?)`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND date(expense_date) <= date(?)`;
    params.push(filters.to_date);
  }
  if (filters.vehicle_number) {
    sql += ` AND vehicle_number = ?`;
    params.push(filters.vehicle_number);
  }
  if (filters.person_name) {
    sql += ` AND person_name = ?`;
    params.push(filters.person_name);
  }
  if (filters.expense_type && filters.expense_type !== 'All') {
    sql += ` AND expense_type = ?`;
    params.push(filters.expense_type);
  }
  sql += ` ORDER BY expense_date DESC, id DESC`;
  const rows = await query(sql, params);
  if (rows.length > 0) {
    console.log('[DEBUG getExpenses DB] first row amount:', rows[0].amount, typeof rows[0].amount);
  }
  return rows;
}

async function getExpenseSummary(filters = {}) {
  let sqlVeh = `SELECT SUM(amount) as total FROM expenses WHERE (is_deleted = 0 OR is_deleted IS NULL) AND expense_category = 'vehicle'`;
  let sqlPer = `SELECT SUM(amount) as total FROM expenses WHERE (is_deleted = 0 OR is_deleted IS NULL) AND expense_category = 'personal'`;
  const paramsVeh = [];
  const paramsPer = [];

  if (filters.from_date) {
    sqlVeh += ` AND DATE(COALESCE(expense_date, created_at)) >= DATE(?)`;
    sqlPer += ` AND DATE(COALESCE(expense_date, created_at)) >= DATE(?)`;
    paramsVeh.push(filters.from_date);
    paramsPer.push(filters.from_date);
  }
  if (filters.to_date) {
    sqlVeh += ` AND DATE(COALESCE(expense_date, created_at)) <= DATE(?)`;
    sqlPer += ` AND DATE(COALESCE(expense_date, created_at)) <= DATE(?)`;
    paramsVeh.push(filters.to_date);
    paramsPer.push(filters.to_date);
  }
  if (filters.vehicle_number) {
    sqlVeh += ` AND vehicle_number = ?`;
    paramsVeh.push(filters.vehicle_number);
  }
  if (filters.person_name) {
    sqlPer += ` AND person_name = ?`;
    paramsPer.push(filters.person_name);
  }
  if (filters.expense_type && filters.expense_type !== 'All') {
    sqlVeh += ` AND expense_type = ?`;
    sqlPer += ` AND expense_type = ?`;
    paramsVeh.push(filters.expense_type);
    paramsPer.push(filters.expense_type);
  }

  let vehicleTotal = 0;
  let personalTotal = 0;

  if (!filters.expense_category || filters.expense_category === 'All' || filters.expense_category === 'vehicle') {
    const rVeh = await queryOne(sqlVeh, paramsVeh);
    vehicleTotal = rVeh?.total || 0;
  }
  if (!filters.expense_category || filters.expense_category === 'All' || filters.expense_category === 'personal') {
    const rPer = await queryOne(sqlPer, paramsPer);
    personalTotal = rPer?.total || 0;
  }

  return {
    vehicleTotal,
    personalTotal,
    totalExpenses: vehicleTotal + personalTotal
  };
}

async function getVehicleExpenseBreakdown(filters = {}) {
  let sql = `
    SELECT vehicle_number,
           SUM(amount) as total_expense,
           SUM(CASE WHEN expense_type = 'Fuel' THEN amount ELSE 0 END) as fuel_expense,
           SUM(CASE WHEN expense_type = 'Toll Charges' THEN amount ELSE 0 END) as toll_expense,
           SUM(CASE WHEN expense_type = 'Driver Allowance' THEN amount ELSE 0 END) as allowance_expense,
           SUM(CASE WHEN expense_type = 'Maintenance' THEN amount ELSE 0 END) as maintenance_expense,
           SUM(CASE WHEN expense_type = 'Loading / Unloading' THEN amount ELSE 0 END) as loading_expense,
           SUM(CASE WHEN expense_type = 'Other' THEN amount ELSE 0 END) as other_expense
     FROM expenses
     WHERE (is_deleted = 0 OR is_deleted IS NULL) AND expense_category = 'vehicle'
  `;
  const params = [];
  if (filters.from_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) >= DATE(?)`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) <= DATE(?)`;
    params.push(filters.to_date);
  }
  if (filters.vehicle_number) {
    sql += ` AND vehicle_number = ?`;
    params.push(filters.vehicle_number);
  }
  if (filters.expense_type && filters.expense_type !== 'All') {
    sql += ` AND expense_type = ?`;
    params.push(filters.expense_type);
  }
  sql += ` GROUP BY vehicle_number ORDER BY total_expense DESC`;
  return await query(sql, params);
}

async function getPersonalExpenseBreakdown(filters = {}) {
  let sql = `
    SELECT person_name,
           SUM(amount) as total_expense,
           SUM(CASE WHEN expense_type = 'Worker Pay' THEN amount ELSE 0 END) as worker_pay,
           SUM(CASE WHEN expense_type = 'Tea / Snacks' THEN amount ELSE 0 END) as tea_snacks,
           SUM(CASE WHEN expense_type = 'Refreshments' THEN amount ELSE 0 END) as refreshments,
           SUM(CASE WHEN expense_type = 'Office Expense' THEN amount ELSE 0 END) as office_expense,
           SUM(CASE WHEN expense_type = 'Salary / Allowance' THEN amount ELSE 0 END) as salary_allowance,
           SUM(CASE WHEN expense_type = 'Other' THEN amount ELSE 0 END) as other_expense
     FROM expenses
     WHERE (is_deleted = 0 OR is_deleted IS NULL) AND expense_category = 'personal'
  `;
  const params = [];
  if (filters.from_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) >= DATE(?)`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) <= DATE(?)`;
    params.push(filters.to_date);
  }
  if (filters.person_name) {
    sql += ` AND person_name = ?`;
    params.push(filters.person_name);
  }
  if (filters.expense_type && filters.expense_type !== 'All') {
    sql += ` AND expense_type = ?`;
    params.push(filters.expense_type);
  }
  sql += ` GROUP BY person_name ORDER BY total_expense DESC`;
  return await query(sql, params);
}

async function getDailyExpenseSummary(filters = {}) {
  let sql = `
    SELECT DATE(COALESCE(expense_date, created_at)) as exp_date,
           SUM(CASE WHEN expense_category = 'vehicle' THEN amount ELSE 0 END) as vehicle_total,
           SUM(CASE WHEN expense_category = 'personal' THEN amount ELSE 0 END) as personal_total,
           SUM(amount) as total
     FROM expenses
     WHERE (is_deleted = 0 OR is_deleted IS NULL)
  `;
  const params = [];
  if (filters.from_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) >= DATE(?)`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) <= DATE(?)`;
    params.push(filters.to_date);
  }
  if (filters.expense_category && filters.expense_category !== 'All') {
    sql += ` AND expense_category = ?`;
    params.push(filters.expense_category);
  }
  if (filters.vehicle_number) {
    sql += ` AND vehicle_number = ?`;
    params.push(filters.vehicle_number);
  }
  if (filters.person_name) {
    sql += ` AND person_name = ?`;
    params.push(filters.person_name);
  }
  if (filters.expense_type && filters.expense_type !== 'All') {
    sql += ` AND expense_type = ?`;
    params.push(filters.expense_type);
  }
  sql += ` GROUP BY exp_date ORDER BY exp_date DESC LIMIT 30`;
  return await query(sql, params);
}

async function getMonthlyExpenseTrend(filters = {}) {
  let sql = `
    SELECT strftime('%Y-%m', COALESCE(expense_date, created_at)) as exp_month,
           SUM(CASE WHEN expense_category = 'vehicle' THEN amount ELSE 0 END) as vehicle_total,
           SUM(CASE WHEN expense_category = 'personal' THEN amount ELSE 0 END) as personal_total,
           SUM(amount) as total
     FROM expenses
     WHERE (is_deleted = 0 OR is_deleted IS NULL)
  `;
  const params = [];
  if (filters.from_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) >= DATE(?)`;
    params.push(filters.from_date);
  }
  if (filters.to_date) {
    sql += ` AND DATE(COALESCE(expense_date, created_at)) <= DATE(?)`;
    params.push(filters.to_date);
  }
  if (filters.expense_category && filters.expense_category !== 'All') {
    sql += ` AND expense_category = ?`;
    params.push(filters.expense_category);
  }
  if (filters.vehicle_number) {
    sql += ` AND vehicle_number = ?`;
    params.push(filters.vehicle_number);
  }
  if (filters.person_name) {
    sql += ` AND person_name = ?`;
    params.push(filters.person_name);
  }
  if (filters.expense_type && filters.expense_type !== 'All') {
    sql += ` AND expense_type = ?`;
    params.push(filters.expense_type);
  }
  sql += ` GROUP BY exp_month ORDER BY exp_month DESC LIMIT 12`;
  return await query(sql, params);
}

// --- REPORTS DATABASE FUNCTIONS ---

function buildDateFilters(dateExpr, filters, where, params) {
  if (filters.fromDate) {
    where.push(`DATE(${dateExpr}) >= DATE(?)`);
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    where.push(`DATE(${dateExpr}) <= DATE(?)`);
    params.push(filters.toDate);
  }
}

async function getSalesReport(filters) {
  let where = ["(r.is_deleted = 0 OR r.is_deleted IS NULL)"];
  let params = [];
  buildDateFilters("COALESCE(r.receipt_date, r.created_at)", filters, where, params);
  
  let sql = `
    SELECT 
      COALESCE(r.receipt_date, r.created_at) as date,
      r.id as receipt_number,
      r.customer_name,
      COALESCE(r.customer_type, c.customer_type, 'Retailer') as customer_type,
      COALESCE(ri.material_name, '-') as material_name,
      COALESCE(ri.quantity, 0) as quantity,
      COALESCE(ri.unit, '') as unit,
      r.total_amount,
      r.paid_amount,
      r.balance_amount
    FROM receipts r
    LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
    LEFT JOIN customers c ON r.customer_id = c.id
    WHERE ${where.join(" AND ")}
    ORDER BY DATE(COALESCE(r.receipt_date, r.created_at)) DESC, r.id DESC
  `;
  const rows = await query(sql, params);

  let summaryWhere = ["(is_deleted = 0 OR is_deleted IS NULL)"];
  let summaryParams = [];
  buildDateFilters("COALESCE(receipt_date, created_at)", filters, summaryWhere, summaryParams);

  const salesSum = await queryOne(`
    SELECT 
      SUM(total_amount) as total_revenue,
      SUM(paid_amount) as total_paid,
      SUM(balance_amount) as total_balance
    FROM receipts
    WHERE ${summaryWhere.join(" AND ")}
  `, summaryParams);

  const qtySum = await queryOne(`
    SELECT SUM(ri.quantity) as total_qty
    FROM receipt_items ri
    JOIN receipts r ON ri.receipt_id = r.id
    WHERE ${summaryWhere.map(c => c.replace(/(receipt_date|created_at)/g, "r.$1")).join(" AND ")}
  `, summaryParams);

  return {
    rows: rows,
    summary: {
      totalRevenue: salesSum?.total_revenue || 0,
      totalQtySold: qtySum?.total_qty || 0,
      totalPaid: salesSum?.total_paid || 0,
      totalBalance: salesSum?.total_balance || 0
    }
  };
}

async function getStockReport(filters) {
  let where = ["(sm.is_deleted = 0 OR sm.is_deleted IS NULL)"];
  let params = [];
  buildDateFilters("sm.created_at", filters, where, params);

  let sql = `
    SELECT 
      sm.created_at as date,
      COALESCE(m.name, 'Unknown Material') as material_name,
      sm.movement_type,
      sm.quantity,
      COALESCE(m.unit, '') as material_unit,
      COALESCE(NULLIF(sm.supplier_name, ''), NULLIF(sm.customer_name, ''), NULLIF(sm.engineer_name, ''), '-') as customer_supplier,
      sm.total_amount as amount,
      sm.remarks
    FROM stock_movements sm
    LEFT JOIN materials m ON sm.material_id = m.id
    WHERE ${where.join(" AND ")}
    ORDER BY DATE(sm.created_at) DESC, sm.id DESC
  `;
  const rows = await query(sql, params);

  const stockInSum = await queryOne(`
    SELECT SUM(sm.quantity) as total
    FROM stock_movements sm
    WHERE ${where.join(" AND ")} AND (sm.stock_direction = 'IN' OR sm.movement_type = 'Stock In' OR sm.movement_type = 'Adjustment')
  `, params);

  const stockOutSum = await queryOne(`
    SELECT SUM(sm.quantity) as total
    FROM stock_movements sm
    WHERE ${where.join(" AND ")} AND (sm.stock_direction = 'OUT' OR sm.movement_type IN ('Stock Out', 'Customer Sale', 'Sale', 'Site Usage', 'Damaged Stock'))
  `, params);

  return {
    rows: rows,
    summary: {
      totalStockIn: stockInSum?.total || 0,
      totalStockOut: stockOutSum?.total || 0
    }
  };
}

async function getReceiptReport(filters) {
  let where = ["(r.is_deleted = 0 OR r.is_deleted IS NULL)"];
  let params = [];
  buildDateFilters("COALESCE(r.receipt_date, r.created_at)", filters, where, params);

  let sql = `
    SELECT 
      r.id as receipt_number,
      COALESCE(r.receipt_date, r.created_at) as receipt_date,
      r.customer_name,
      COALESCE(r.customer_type, c.customer_type, 'Retailer') as customer_type,
      r.total_amount,
      r.paid_amount,
      r.balance_amount
    FROM receipts r
    LEFT JOIN customers c ON r.customer_id = c.id
    WHERE ${where.join(" AND ")}
    ORDER BY DATE(COALESCE(r.receipt_date, r.created_at)) DESC, r.id DESC
  `;
  const rows = await query(sql, params);

  const receiptSum = await queryOne(`
    SELECT 
      SUM(r.total_amount) as total_amount,
      SUM(r.paid_amount) as total_paid,
      SUM(r.balance_amount) as total_balance
    FROM receipts r
    WHERE ${where.join(" AND ")}
  `, params);

  return {
    rows: rows,
    summary: {
      totalAmount: receiptSum?.total_amount || 0,
      totalPaid: receiptSum?.total_paid || 0,
      totalBalance: receiptSum?.total_balance || 0
    }
  };
}

async function getExpenseReport(filters) {
  let where = ["(is_deleted = 0 OR is_deleted IS NULL)"];
  let params = [];
  buildDateFilters("COALESCE(expense_date, created_at)", filters, where, params);

  let sql = `
    SELECT 
      COALESCE(expense_date, created_at) as expense_date,
      expense_category,
      COALESCE(NULLIF(vehicle_number, ''), NULLIF(person_name, ''), '-') as vehicle_or_person,
      expense_type,
      amount,
      remarks
    FROM expenses
      WHERE ${where.join(" AND ")}
    ORDER BY DATE(COALESCE(expense_date, created_at)) DESC, id DESC
  `;
  const rows = await query(sql, params);

  const expenseSum = await queryOne(`
    SELECT 
      SUM(CASE WHEN expense_category = 'vehicle' THEN amount ELSE 0 END) as vehicle_total,
      SUM(CASE WHEN expense_category = 'personal' THEN amount ELSE 0 END) as personal_total,
      SUM(amount) as total_expenses
    FROM expenses
    WHERE ${where.join(" AND ")}
  `, params);

  return {
    rows: rows,
    summary: {
      vehicleTotal: expenseSum?.vehicle_total || 0,
      personalTotal: expenseSum?.personal_total || 0,
      totalExpenses: expenseSum?.total_expenses || 0
    }
  };
}

async function getCustomerReport(filters) {
  let receiptJoinCondition = "r.customer_id = c.id AND (r.is_deleted = 0 OR r.is_deleted IS NULL)";
  let joinParams = [];
  if (filters.fromDate) {
    receiptJoinCondition += " AND DATE(COALESCE(r.receipt_date, r.created_at)) >= DATE(?)";
    joinParams.push(filters.fromDate);
  }
  if (filters.toDate) {
    receiptJoinCondition += " AND DATE(COALESCE(r.receipt_date, r.created_at)) <= DATE(?)";
    joinParams.push(filters.toDate);
  }

  let sql = `
    SELECT 
      c.name as customer_name,
      c.phone,
      c.customer_type,
      CASE 
        WHEN COUNT(r.id) > 0 THEN SUM(r.total_amount)
        ELSE COALESCE(c.total_purchases, 0)
      END as total_purchases,
      CASE 
        WHEN COUNT(r.id) > 0 THEN SUM(r.paid_amount)
        ELSE COALESCE(c.total_purchases - c.balance_amount, 0)
      END as total_paid,
      CASE 
        WHEN COUNT(r.id) > 0 THEN SUM(r.balance_amount)
        ELSE COALESCE(c.balance_amount, 0)
      END as total_balance,
      COALESCE(MAX(COALESCE(r.receipt_date, r.created_at)), c.created_at) as last_purchase_date
    FROM customers c
    LEFT JOIN receipts r ON ${receiptJoinCondition}
    WHERE (c.is_deleted = 0 OR c.is_deleted IS NULL)
    GROUP BY c.id, c.name, c.phone, c.customer_type, c.total_purchases, c.balance_amount, c.created_at
    ORDER BY total_purchases DESC, c.name ASC
  `;
  const rows = await query(sql, joinParams);

  const customerSum = await queryOne(`
    SELECT 
      COUNT(id) as total_customers,
      SUM(total_purchases) as total_purchases,
      SUM(balance_amount) as total_balance
    FROM customers
    WHERE (is_deleted = 0 OR is_deleted IS NULL)
  `);

  return {
    rows: rows,
    summary: {
      totalCustomers: customerSum?.total_customers || 0,
      totalPurchases: customerSum?.total_purchases || 0,
      totalBalance: customerSum?.total_balance || 0
    }
  };
}

async function getLowStockReport(filters) {
  let where = ["(is_deleted = 0 OR is_deleted IS NULL)", "current_stock <= minimum_stock"];
  let params = [];
  if (filters.fromDate) {
    where.push("DATE(created_at) >= DATE(?)");
    params.push(filters.fromDate);
  }
  if (filters.toDate) {
    where.push("DATE(created_at) <= DATE(?)");
    params.push(filters.toDate);
  }

  let sql = `
    SELECT 
      name as material_name,
      current_stock,
      minimum_stock,
      unit,
      CASE 
        WHEN current_stock <= 0 THEN 'Out of Stock'
        ELSE 'Low Stock'
      END as status
    FROM materials
    WHERE ${where.join(" AND ")}
    ORDER BY name ASC
  `;
  const rows = await query(sql, params);

  const lowStockSum = await queryOne(`
    SELECT 
      SUM(CASE WHEN current_stock <= 0 THEN 1 ELSE 0 END) as out_of_stock,
      SUM(CASE WHEN current_stock > 0 AND current_stock <= minimum_stock THEN 1 ELSE 0 END) as low_stock
    FROM materials
    WHERE (is_deleted = 0 OR is_deleted IS NULL) AND current_stock <= minimum_stock
  `);

  return {
    rows: rows,
    summary: {
      outOfStockCount: lowStockSum?.out_of_stock || 0,
      lowStockCount: lowStockSum?.low_stock || 0,
      totalLowStock: (lowStockSum?.out_of_stock || 0) + (lowStockSum?.low_stock || 0)
    }
  };
}

async function getReportData(reportType, filters = {}) {
  switch (reportType) {
    case 'sales': return await getSalesReport(filters);
    case 'stock': return await getStockReport(filters);
    case 'receipts': return await getReceiptReport(filters);
    case 'expenses': return await getExpenseReport(filters);
    case 'customers': return await getCustomerReport(filters);
    case 'low-stock': return await getLowStockReport(filters);
    default: throw new Error(`Unknown report type: ${reportType}`);
  }
}

module.exports = {
  db,
  dbPath,
  run,
  query,
  queryOne,
  addExpense,
  updateExpense,
  deleteExpense,
  getExpenses,
  getExpenseSummary,
  getVehicleExpenseBreakdown,
  getPersonalExpenseBreakdown,
  getDailyExpenseSummary,
  getMonthlyExpenseTrend,
  getReportData
};
