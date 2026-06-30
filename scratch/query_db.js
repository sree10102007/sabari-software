const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');

// Electron's default userData path for this app name on Windows
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'sivakami-traders-inventory', 'sivakami_traders.db');

console.log('Opening database at:', dbPath);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  
  console.log('\n--- QUERY 1: Recent Stock Movements ---');
  db.all(`
    SELECT
      id,
      material_id,
      movement_type,
      quantity,
      supplier_name,
      created_at
    FROM stock_movements
    ORDER BY id DESC
    LIMIT 10;
  `, [], (err, rows) => {
    if (err) {
      console.error('Query 1 error:', err.message);
    } else {
      console.log(JSON.stringify(rows, null, 2));
    }

    console.log('\n--- QUERY 2: Materials ---');
    db.all(`
      SELECT
        id,
        name,
        current_stock
      FROM materials;
    `, [], (err, rows) => {
      if (err) {
        console.error('Query 2 error:', err.message);
      } else {
        console.log(JSON.stringify(rows, null, 2));
      }
      db.close();
    });
  });
});
