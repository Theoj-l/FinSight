const { exec } = require('child_process');
const path = require('path');
const os = require('os');

const root = path.resolve(__dirname, '..');

const services = [
  { name: 'frontend', dir: path.join(root, 'frontend'), cmd: 'npm run dev' },
  { name: 'backend', dir: path.join(root, 'backend'), cmd: 'npm run dev' },
  // { name: 'ai-service', dir: path.join(root, 'ai-service'), cmd: 'uvicorn main:app --reload --port 8001' },
];

const platform = os.platform();

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