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
// Two Python thresholds:
//   minPython         - hard floor. numpy 2.5 / pandas 3.0 need >= 3.11; below
//                       this the install genuinely will not work.
//   recommendedPython - the version the team standardises on. Between the two we
//                       set things up anyway but warn, so version drift stays
//                       visible. Bump `recommendedPython` when the team moves;
//                       touch `minPython` only when a dependency raises its floor.
const minPython = { major: 3, minor: 11 };
const recommendedPython = { major: 3, minor: 14 };

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

function atLeast(version, target) {
  if (!version) return false;
  if (version.major !== target.major) return version.major > target.major;
  return version.minor >= target.minor;
}

const meetsMin = (version) => atLeast(version, minPython);
const meetsRecommended = (version) => atLeast(version, recommendedPython);

const minWant = `${minPython.major}.${minPython.minor}`;
const want = `${recommendedPython.major}.${recommendedPython.minor}`;
const fmtVersion = (v) => `${v.major}.${v.minor}`;

function warnIfBelowRecommended(version, label) {
  if (version && meetsMin(version) && !meetsRecommended(version)) {
    console.warn(
      `\n! ${label} is on Python ${fmtVersion(version)}; the team standard is ${want}.\n` +
      `  This works, but installing Python ${want} and re-running keeps everyone aligned.`
    );
  }
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

const existingVersion = fs.existsSync(venvPython) ? pythonVersion(`"${venvPython}"`) : null;

if (meetsMin(existingVersion)) {
  console.log(`venv already on Python ${fmtVersion(existingVersion)}, keeping it.`);
  warnIfBelowRecommended(existingVersion, 'venv');
} else {
  // Find a usable interpreter FIRST — never delete a working venv unless we can
  // replace it. Prefer the recommended version, then fall back to anything >= min.
  const candidates = isWin
    ? [`py -${want}`, `python${want}`, 'py -3', 'python3', 'python']
    : [`python${want}`, 'python3', 'python'];
  let systemPython = null;
  let systemVersion = null;
  for (const candidate of candidates) {
    const version = pythonVersion(candidate);
    if (meetsMin(version)) {
      systemPython = candidate;
      systemVersion = version;
      break;
    }
  }
  if (!systemPython) {
    console.error(
      `\nNo Python >= ${minWant} found on PATH. The team standard is ${want} ` +
      `(e.g. \`brew install python@${want}\`). Install it and re-run.`
    );
    if (existingVersion) {
      console.error(`The existing venv (Python ${fmtVersion(existingVersion)}) was left in place.`);
    }
    process.exit(1);
  }
  if (fs.existsSync(venvDir)) {
    const found = existingVersion ? `Python ${fmtVersion(existingVersion)}` : 'an unreadable interpreter';
    console.log(`Existing venv uses ${found}; rebuilding with ${systemPython}.`);
    fs.rmSync(venvDir, { recursive: true, force: true });
  }
  run(`${systemPython} -m venv ml-service/venv`);
  warnIfBelowRecommended(systemVersion, 'new venv');
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
