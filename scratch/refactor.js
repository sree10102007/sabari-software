const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, '../pages');
const jsDir = path.join(__dirname, '../js');

// 1. Update HTML files to include common.js
const htmlFiles = fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'));

for (const file of htmlFiles) {
  if (file === 'login.html') continue; // Skip login.html if it doesn't need common.js or has special logic
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // If common.js is not already included
  if (!content.includes('common.js')) {
    // Find the primary JS script tag and prepend common.js
    const scriptRegex = /<script src="\.\.\/js\/([a-zA-Z0-9_-]+\.js)"><\/script>/;
    content = content.replace(scriptRegex, `<script src="../js/common.js"></script>\n  <script src="../js/$1"></script>`);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated HTML: ${file}`);
  }
}

// 2. Clean up JS files by removing duplicated common logic
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'common.js');

for (const file of jsFiles) {
  const filePath = path.join(jsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  // Removing standard DOMContentLoaded session checks
  content = content.replace(/document\.addEventListener\('DOMContentLoaded',\s*async\s*\(\)\s*=>\s*\{\s*try\s*\{\s*const\s*user\s*=\s*await\s*window\.api\.getSession\(\);\s*if\s*\(!user\)\s*\{\s*window\.location\.href\s*=\s*'login\.html';\s*return;\s*\}\s*document\.getElementById\('user-display-name'\)\.textContent\s*=\s*user\.name;\s*\}\s*catch\s*\{\s*window\.location\.href\s*=\s*'login\.html';\s*return;\s*\}\s*document\.getElementById\('logout-button'\)\.addEventListener\('click',\s*async\s*\(\)\s*=>\s*\{\s*await\s*window\.api\.logout\(\);\s*window\.location\.href\s*=\s*'login\.html';\s*\}\);/g, '');

  // Since regex can be fragile for block replacements, let's look for known signatures
  // and replace the entire duplicate block up to the first unique logic
  const blockToRemove = `try {
    const user = await window.api.getSession();
    if (!user) { window.location.href = 'login.html'; return; }
    document.getElementById('user-display-name').textContent = user.name;
  } catch { window.location.href = 'login.html'; return; }

  document.getElementById('logout-button').addEventListener('click', async () => {
    await window.api.logout(); window.location.href = 'login.html';
  });`;
  
  content = content.replace(blockToRemove, '');

  // Remove showAlert
  content = content.replace(/const\s+showAlert\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\};/s, '');
  
  // Remove showToast
  content = content.replace(/const\s+showToast\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*\};/s, '');
  
  // Remove escapeHtml
  content = content.replace(/function\s+escapeHtml\([^)]*\)\s*\{[^}]*\}/s, '');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Refactored JS: ${file}`);
  }
}

console.log("Refactoring script completed.");
