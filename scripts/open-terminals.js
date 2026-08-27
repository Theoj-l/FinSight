const { exec } = require('child_process');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');
const platform = os.platform();
const mlCommand = platform === 'win32'
  ? 'venv\\Scripts\\python.exe -m uvicorn main:app --reload --port 8000'
  : 'source venv/bin/activate && python -m uvicorn main:app --reload --port 8000';

const services = [
  { name: 'frontend', dir: path.join(root, 'frontend'), cmd: 'npm run dev' },
  { name: 'backend', dir: path.join(root, 'backend'), cmd: 'npm run dev' },
  { name: 'ml-service', dir: path.join(root, 'ml-service'), cmd: mlCommand },
];

services.forEach(({ name, dir, cmd }) => {
  let command;

  if (platform === 'darwin') {
    // macOS — Terminal.app
    command = `osascript -e 'tell application "Terminal" to do script "cd \\"${dir}\\" && ${cmd}"'`;
  } else if (platform === 'win32') {
    // Windows — new cmd window
    command = `start "" cmd /k "cd /d "${dir}" && ${cmd}"`;
  } else {
    // Linux — try gnome-terminal (most common default)
    command = `gnome-terminal -- bash -c "cd '${dir}' && ${cmd}; exec bash"`;
  }

  exec(command, (err) => {
    if (err) console.error(`Failed to open terminal for ${name}:`, err.message);
  });
});