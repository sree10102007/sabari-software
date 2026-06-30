const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const db = require('../../database/database');

module.exports = function setupAuthController(sessionState) {
  ipcMain.handle('auth:login', async (event, { username, password }) => {
    try {
      const user = await db.queryOne('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) return { success: false, error: 'User does not exist.' };

      const passwordMatch = bcrypt.compareSync(password, user.password);
      if (!passwordMatch) return { success: false, error: 'Incorrect password.' };

      if (user.role !== 'admin') {
        return { success: false, error: 'Access denied. Administrator role required.' };
      }

      sessionState.currentUserSession = { id: user.id, name: user.name, username: user.username, role: user.role };
      return { success: true, user: sessionState.currentUserSession };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    sessionState.currentUserSession = null;
    return { success: true };
  });

  ipcMain.handle('auth:getSession', async () => sessionState.currentUserSession);
};
