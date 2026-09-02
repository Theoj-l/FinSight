/**
 * Starts the ML service using the project's venv Python, so `npm run dev`
 * works without manually activating the virtual environment.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mlDir = path.join(root, 'ml-service');
const isWin = process.platform === 'win32';
const venvPython = isWin
  ? path.join(mlDir, 'venv', 'Scripts', 'python.exe')
  : path.join(mlDir, 'venv', 'bin', 'python');

const python = fs.existsSync(venvPython) ? venvPython : isWin ? 'python' : 'python3';
if (python !== venvPython) {
  console.warn('ml-service/venv not found — run `npm run setup`. Falling back to system Python.');
}

const child = spawn(
  python,
  ['-m', 'uvicorn', 'app.main:app', '--reload', '--port', '8000'],
  { cwd: mlDir, stdio: 'inherit' },
);

child.on('exit', (code) => process.exit(code ?? 0));
