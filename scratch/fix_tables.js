const fs = require('fs');
const path = require('path');

// 1. Fix expenses.html Actions columns
const expensesPath = path.join(__dirname, '..', 'pages', 'expenses.html');
if (fs.existsSync(expensesPath)) {
  let content = fs.readFileSync(expensesPath, 'utf8');
  // Replace the first and second occurrences of <th>Actions</th> with <th class="actions-col">Actions</th>
  let count = 0;
  content = content.replace(/<th>Actions<\/th>/g, (match) => {
    count++;
    return '<th class="actions-col">Actions</th>';
  });
  fs.writeFileSync(expensesPath, content, 'utf8');
  console.log(`Updated ${count} Actions headers in expenses.html`);
} else {
  console.log('expenses.html not found');
}

// 2. Fix stock-movements.html Actions columns
const stockMovementsPath = path.join(__dirname, '..', 'pages', 'stock-movements.html');
if (fs.existsSync(stockMovementsPath)) {
  let content = fs.readFileSync(stockMovementsPath, 'utf8');
  content = content.replace(/<th>Actions<\/th>/g, '<th class="actions-col">Actions</th>');
  fs.writeFileSync(stockMovementsPath, content, 'utf8');
  console.log('Updated Actions header in stock-movements.html');
} else {
  console.log('stock-movements.html not found');
}
