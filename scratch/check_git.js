const { execSync } = require('child_process');
try {
  const status = execSync('git status', { encoding: 'utf8' });
  console.log('GIT STATUS:\n', status);
  const diff = execSync('git diff js/stock-out.js', { encoding: 'utf8' });
  console.log('GIT DIFF js/stock-out.js:\n', diff);
} catch (e) {
  console.error('Error running git:', e.message);
}
