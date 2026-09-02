/**
 * One-command project setup. Idempotent — safe to re-run.
 *
 *   npm run setup
 *
 * Does NOT run database migrations (that needs a real schema + reachable DB)
 * and does NOT overwrite existing .env files.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';

function run(cmd, cwd = root) {
  console.log(`\n$ ${cmd}${cwd === root ? '' : `   (in ${path.relative(root, cwd)}/)`}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

// 1. Node dependencies -------------------------------------------------------
step('Installing Node dependencies (root + web/)');
run('npm install');
run('npm install', path.join(root, 'web')); // web postinstall runs `prisma generate`

// 2. Python virtual environment --------------------------------------------
step('Setting up Python environment (ml-service/)');
const venvDir = path.join(root, 'ml-service', 'venv');
const venvPython = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');

if (!fs.existsSync(venvPython)) {
  let systemPython = null;
  for (const candidate of isWin ? ['python', 'py -3'] : ['python3', 'python']) {
    try {
      execSync(`${candidate} --version`, { stdio: 'ignore' });
      systemPython = candidate;
      break;
    } catch {
      /* try next */
    }
  }
  if (!systemPython) {
    console.error('\nNo Python found on PATH. Install Python 3.10+ and re-run.');
    process.exit(1);
  }
  run(`${systemPython} -m venv ml-service/venv`);
} else {
  console.log('venv already exists, skipping creation.');
}

run(`"${venvPython}" -m pip install --upgrade pip`);
run(`"${venvPython}" -m pip install -r ml-service/requirements-dev.txt`);

// 3. Environment files -----------------------------------------------------
step('Creating .env files from templates (if missing)');
const envPairs = [
  ['web/.env.example', 'web/.env'],
  ['ml-service/.env.example', 'ml-service/.env'],
];
for (const [src, dest] of envPairs) {
  const destPath = path.join(root, dest);
  if (fs.existsSync(destPath)) {
    console.log(`${dest} already exists, leaving it alone.`);
  } else {
    fs.copyFileSync(path.join(root, src), destPath);
    console.log(`created ${dest} — fill in the real values.`);
  }
}

// Done -------------------------------------------------------------------
console.log(`
=== Setup complete ===

Next:
  1. Fill in web/.env and ml-service/.env with real values.
  2. Start everything:            npm run dev
  3. When the DB schema is ready: npm run db:migrate --prefix web
`);
