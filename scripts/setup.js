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
// Minimum Python. The dependency set (numpy 2.5, pandas 3.0, fastapi 0.141)
// needs >= 3.11; the team standardises on 3.14. This is the single source of truth.
const minPython = { major: 3, minor: 14 };

function run(cmd, cwd = root) {
  console.log(`\n$ ${cmd}${cwd === root ? '' : `   (in ${path.relative(root, cwd)}/)`}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

function pythonVersion(command) {
  try {
    const output = execSync(`${command} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [major, minor] = output.split('.').map(Number);
    return { major, minor };
  } catch {
    return null;
  }
}

function meetsMin(version) {
  if (!version) return false;
  if (version.major !== minPython.major) return version.major > minPython.major;
  return version.minor >= minPython.minor;
}

const want = `${minPython.major}.${minPython.minor}`;

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

const existingVersion = fs.existsSync(venvPython) ? pythonVersion(`"${venvPython}"`) : null;

if (meetsMin(existingVersion)) {
  console.log(`venv already on Python ${existingVersion.major}.${existingVersion.minor}, keeping it.`);
} else {
  // Find a usable interpreter FIRST — never delete a working venv unless we can
  // replace it.
  const candidates = isWin
    ? [`py -${want}`, `python${want}`, 'py -3', 'python3', 'python']
    : [`python${want}`, 'python3', 'python'];
  let systemPython = null;
  for (const candidate of candidates) {
    if (meetsMin(pythonVersion(candidate))) {
      systemPython = candidate;
      break;
    }
  }
  if (!systemPython) {
    console.error(`\nNo Python >= ${want} on PATH. Install Python ${want} and re-run.`);
    console.error(existingVersion
      ? `The existing venv (Python ${existingVersion.major}.${existingVersion.minor}) was left in place.`
      : '');
    process.exit(1);
  }
  if (fs.existsSync(venvDir)) {
    const found = existingVersion ? `Python ${existingVersion.major}.${existingVersion.minor}` : 'an unreadable interpreter';
    console.log(`Existing venv uses ${found}; rebuilding with ${systemPython}.`);
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
  run(`${systemPython} -m venv ml-service/venv`);
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
  2. Start everything:        npm run dev
  3. Apply the DB schema:     npm run db:apply --prefix web   (then db:pull, db:generate)
`);
