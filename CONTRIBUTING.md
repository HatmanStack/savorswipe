# Contributing to SavorSwipe

## Getting Started

1. Clone the repository
2. Install frontend dependencies:
   ```bash
   npm ci
   ```
3. Install backend dependencies:
   ```bash
   cd backend && pip install -r requirements.txt && pip install -e ".[dev]"
   ```
4. Copy `.env.example` to `.env` and fill in your values (see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md))
5. Start the app:
   ```bash
   npm start
   ```

## Branch Naming

Use the following prefixes for branch names:

- `feat/description` -- new features
- `fix/description` -- bug fixes
- `chore/description` -- maintenance, tooling, dependencies

## Commit Format

This project uses [conventional commits](https://www.conventionalcommits.org/), enforced by commitlint (see `.commitlintrc.json`).

Format: `type(scope): description`

**Valid types:** `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `perf`, `ci`, `style`

**Examples:**
```
feat(frontend): add recipe search filters
fix(backend): handle missing S3 key in upload
chore: update dependencies
test(frontend): add UploadService unit tests
docs: update deployment instructions
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with atomic, conventional commits
3. Ensure all checks pass: `npm run check`
4. Open a PR with a title following conventional commit format
5. PRs should be **squash-merged** to keep history clean

## Running Tests

**Frontend:**
```bash
npm test -- --ci --forceExit
```

**Backend:**
```bash
PYTHONPATH=backend pytest tests/backend -v --tb=short
```

**All checks (lint + tests):**
```bash
npm run check
```

## Code Style

- **Frontend:** ESLint + TypeScript strict mode, enforced by Expo lint
- **Backend:** Ruff, configured in `backend/pyproject.toml`
- **Pre-commit hooks** run automatically via Husky on every commit, checking both frontend and backend linting
- Commit messages are validated by commitlint on every commit
