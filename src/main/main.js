const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const StockfishManager = require('./stockfish-manager');

let mainWindow;
let stockfishManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../../assets/icons/icon.png'),
    title: 'Chess Trainer - Stockfish Edition',
    show: false,
    titleBarStyle: 'default'
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../build/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Initialize Stockfish after window is ready
    initializeStockfish();
  });

  mainWindow.on('closed', () => {
    if (stockfishManager) {
      stockfishManager.quit();
    }
    mainWindow = null;
  });
}

function initializeStockfish() {
  stockfishManager = new StockfishManager();
  
  stockfishManager.on('ready', () => {
    console.log('Stockfish engine ready');
    mainWindow.webContents.send('stockfish-ready');
  });

  stockfishManager.on('bestmove', (move) => {
    console.log('Stockfish best move:', move);
    mainWindow.webContents.send('stockfish-move', move);
  });

  stockfishManager.on('evaluation', (evaluation) => {
    mainWindow.webContents.send('stockfish-evaluation', evaluation);
  });

  stockfishManager.on('error', (error) => {
    console.error('Stockfish error:', error);
    mainWindow.webContents.send('stockfish-error', error);
  });

  stockfishManager.initialize();
}

// App event handlers
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for Stockfish communication
ipcMain.handle('stockfish-make-move', async (event, fen, timeLimit = 1000) => {
  if (!stockfishManager) {
    throw new Error('Stockfish not initialized');
  }
  
  return stockfishManager.getBestMove(fen, timeLimit);
});

ipcMain.handle('stockfish-evaluate-position', async (event, fen) => {
  if (!stockfishManager) {
    throw new Error('Stockfish not initialized');
  }
  
  return stockfishManager.evaluatePosition(fen);
});

ipcMain.handle('stockfish-set-difficulty', async (event, skillLevel) => {
  if (!stockfishManager) {
    throw new Error('Stockfish not initialized');
  }
  
  return stockfishManager.setSkillLevel(skillLevel);
});

ipcMain.handle('stockfish-stop', async (event) => {
  if (!stockfishManager) {
    return;
  }
  
  stockfishManager.stop();
});

// Handle app closing
app.on('before-quit', () => {
  if (stockfishManager) {
    stockfishManager.quit();
  }
});