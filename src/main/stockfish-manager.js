const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class StockfishManager extends EventEmitter {
  constructor() {
    super();
    this.stockfishProcess = null;
    this.isReady = false;
    this.pendingCommands = [];
    this.currentEvaluation = null;
    this.moveTimeout = null;
  }

  initialize() {
    const stockfishPath = this.getStockfishPath();
    
    if (!fs.existsSync(stockfishPath)) {
      this.emit('error', `Stockfish binary not found at: ${stockfishPath}`);
      return;
    }

    console.log('Starting Stockfish:', stockfishPath);
    
    this.stockfishProcess = spawn(stockfishPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.stockfishProcess.stdout.on('data', (data) => {
      this.handleStockfishOutput(data.toString());
    });

    this.stockfishProcess.stderr.on('data', (data) => {
      console.error('Stockfish stderr:', data.toString());
    });

    this.stockfishProcess.on('close', (code) => {
      console.log('Stockfish process closed with code:', code);
      this.isReady = false;
    });

    this.stockfishProcess.on('error', (error) => {
      console.error('Stockfish process error:', error);
      this.emit('error', error.message);
    });

    // Initialize UCI communication
    this.sendCommand('uci');
  }

  getStockfishPath() {
    const platform = process.platform;
    const isDev = process.env.NODE_ENV === 'development';
    
    let binaryName;
    switch (platform) {
      case 'win32':
        binaryName = 'stockfish-windows.exe';
        break;
      case 'darwin':
        binaryName = 'stockfish-mac';
        break;
      case 'linux':
        binaryName = 'stockfish-linux';
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    if (isDev) {
      // Development mode - look in project binaries folder
      return path.join(__dirname, '../../binaries', binaryName);
    } else {
      // Production mode - look in resources
      return path.join(process.resourcesPath, 'binaries', binaryName);
    }
  }

  handleStockfishOutput(output) {
    const lines = output.trim().split('\n');
    
    for (const line of lines) {
      console.log('Stockfish:', line);
      
      if (line === 'uciok') {
        this.sendCommand('isready');
      } else if (line === 'readyok') {
        if (!this.isReady) {
          this.isReady = true;
          this.emit('ready');
          this.processPendingCommands();
        }
      } else if (line.startsWith('bestmove')) {
        this.handleBestMove(line);
      } else if (line.startsWith('info')) {
        this.handleInfoLine(line);
      }
    }
  }

  handleBestMove(line) {
    const parts = line.split(' ');
    const bestMove = parts[1];
    
    if (this.moveTimeout) {
      clearTimeout(this.moveTimeout);
      this.moveTimeout = null;
    }
    
    this.emit('bestmove', {
      move: bestMove,
      evaluation: this.currentEvaluation
    });
  }

  handleInfoLine(line) {
    // Parse evaluation info
    if (line.includes('cp ')) {
      const cpMatch = line.match(/cp (-?\d+)/);
      if (cpMatch) {
        this.currentEvaluation = {
          type: 'centipawn',
          value: parseInt(cpMatch[1])
        };
      }
    } else if (line.includes('mate ')) {
      const mateMatch = line.match(/mate (-?\d+)/);
      if (mateMatch) {
        this.currentEvaluation = {
          type: 'mate',
          value: parseInt(mateMatch[1])
        };
      }
    }

    // Extract depth and nodes info
    const depthMatch = line.match(/depth (\d+)/);
    const nodesMatch = line.match(/nodes (\d+)/);
    const timeMatch = line.match(/time (\d+)/);

    if (this.currentEvaluation && (depthMatch || nodesMatch)) {
      this.currentEvaluation.depth = depthMatch ? parseInt(depthMatch[1]) : null;
      this.currentEvaluation.nodes = nodesMatch ? parseInt(nodesMatch[1]) : null;
      this.currentEvaluation.time = timeMatch ? parseInt(timeMatch[1]) : null;
      
      this.emit('evaluation', this.currentEvaluation);
    }
  }

  sendCommand(command) {
    if (!this.stockfishProcess) {
      console.error('Stockfish process not started');
      return;
    }

    if (!this.isReady && command !== 'uci' && command !== 'isready') {
      this.pendingCommands.push(command);
      return;
    }

    console.log('Sending to Stockfish:', command);
    this.stockfishProcess.stdin.write(command + '\n');
  }

  processPendingCommands() {
    while (this.pendingCommands.length > 0) {
      const command = this.pendingCommands.shift();
      this.sendCommand(command);
    }
  }

  async getBestMove(fen, timeLimit = 1000) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) {
        reject(new Error('Stockfish not ready'));
        return;
      }

      // Set up timeout
      this.moveTimeout = setTimeout(() => {
        this.sendCommand('stop');
        reject(new Error('Move calculation timeout'));
      }, timeLimit + 1000);

      // Listen for the move
      const moveHandler = (moveData) => {
        this.removeListener('bestmove', moveHandler);
        resolve(moveData);
      };

      this.once('bestmove', moveHandler);

      // Send position and go command
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go movetime ${timeLimit}`);
    });
  }

  async evaluatePosition(fen, depth = 15) {
    return new Promise((resolve, reject) => {
      if (!this.isReady) {
        reject(new Error('Stockfish not ready'));
        return;
      }

      let finalEvaluation = null;

      const evaluationHandler = (evaluation) => {
        if (evaluation.depth >= depth) {
          finalEvaluation = evaluation;
        }
      };

      const moveHandler = () => {
        this.removeListener('evaluation', evaluationHandler);
        this.removeListener('bestmove', moveHandler);
        resolve(finalEvaluation);
      };

      this.on('evaluation', evaluationHandler);
      this.once('bestmove', moveHandler);

      // Send position and analyze
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand(`go depth ${depth}`);
    });
  }

  setSkillLevel(level) {
    // Skill level 0-20 (0 = weakest, 20 = strongest)
    const clampedLevel = Math.max(0, Math.min(20, level));
    this.sendCommand(`setoption name Skill Level value ${clampedLevel}`);
    
    // Add some randomness for lower levels
    if (clampedLevel < 20) {
      this.sendCommand(`setoption name MultiPV value 1`);
    }
  }

  stop() {
    if (this.stockfishProcess) {
      this.sendCommand('stop');
    }
  }

  quit() {
    if (this.stockfishProcess) {
      this.sendCommand('quit');
      this.stockfishProcess = null;
      this.isReady = false;
    }
  }
}

module.exports = StockfishManager;