# FinSight

OC Blueberry FYP

## Prerequisites

Install the following before setting up the project:

- Node.js and npm
- Python 3.10 or newer
- Git

Check that they are available:

```bash
node --version
npm --version
python --version
```

On macOS, use `python3 --version` if `python` is not available.

## First-Time Setup

Run these commands from the repository root, the folder containing this README.

### Windows PowerShell

Create the Python virtual environment:

```powershell
python -m venv ml-service/venv
```

Activate it:

```powershell
.\ml-service\venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, allow it for the current terminal only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\ml-service\venv\Scripts\Activate.ps1
```

Install Python and JavaScript dependencies:

```powershell
python -m pip install --upgrade pip
pip install -r ml-service/requirements.txt
npm install
npm install --prefix frontend
npm install --prefix backend
```

### macOS or Linux

Create the Python virtual environment:

```bash
python3 -m venv ml-service/venv
```

Activate it:

```bash
source ml-service/venv/bin/activate
```

Install Python and JavaScript dependencies:

```bash
python -m pip install --upgrade pip
pip install -r ml-service/requirements.txt
npm install
npm install --prefix frontend
npm install --prefix backend
```

## Run the Application

Make sure the Python virtual environment is activated, then run:

```bash
npm run dev
```

This starts all three services:

- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- ML service: http://localhost:8000

The FastAPI documentation is available at http://localhost:8000/docs.

To stop the services, press `Ctrl+C` in the terminal running `npm run dev`.

## Activate the Environment Again

The virtual environment is created only once and is ignored by Git. Activate it again whenever you open a new terminal.

Windows PowerShell:

```powershell
.\ml-service\venv\Scripts\Activate.ps1
```

macOS or Linux:

```bash
source ml-service/venv/bin/activate
```

## Git Conventions

### Commit Messages

Use this format:

```text
type: short description
```

Keep the subject clear, use the imperative mood, and do not end it with a period. Keep it short enough to scan easily.

Common commit types:

- `feat`: add a new feature
- `fix`: correct a bug
- `refactor`: change code without changing behavior
- `docs`: update documentation
- `test`: add or update tests
- `chore`: maintenance, configuration, or dependency changes

Examples:

```text
feat: add FastAPI ML service
fix: handle missing transaction data
docs: add local development setup
chore: update Python dependencies
```

### Branch Names

Use this format:

```text
type/short-description
```

Use lowercase words separated by hyphens. Choose the branch type based on the work:

- `feature/`: new functionality
- `fix/`: bug fixes
- `refactor/`: code restructuring
- `docs/`: documentation-only changes
- `test/`: test changes
- `chore/`: maintenance and configuration

Examples:

```text
feature/ml-health-endpoint
fix/backend-route-error
docs/setup-guide
chore/update-dependencies
```

Create a branch before making changes:

```bash
git switch -c feature/short-description
```

Review your changes before committing:

```bash
git status
git diff
```

Then commit them:

```bash
git add .
git commit -m "type: short description"
```
