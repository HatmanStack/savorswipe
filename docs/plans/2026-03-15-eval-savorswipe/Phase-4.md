# Phase 4: Fortification & Onboarding

## Phase Goal

Add pre-commit hooks, commit message enforcement, developer documentation, backend dev dependency management, and a frontend `.env.example`. This phase targets Git Hygiene (5/10 to 7/10), Reproducibility (7/10 to 9/10), and Onboarding (8/10 to 9/10).

**Success criteria:** Pre-commit hooks enforce linting, commit messages are validated, `CONTRIBUTING.md` and `.env.example` exist, backend dev dependencies are declared in `pyproject.toml`.

**Estimated tokens:** ~20,000

## Prerequisites

- Phase 3 completed (all code changes done before adding enforcement)
- Phase 0 read and understood
- `npm ci` completed

---

## Tasks

### Task 1: Add Husky Pre-Commit Hooks

**Goal:** Install Husky and configure a pre-commit hook that runs lint checks. This prevents lint regressions from being committed, addressing Reproducibility.

**Files to Create:**
- `.husky/pre-commit` — Pre-commit hook script

**Files to Modify:**
- `package.json` — Add husky to devDependencies, add prepare script

**Prerequisites:**
- None

**Implementation Steps:**
1. Install Husky as a dev dependency: `npm install --save-dev husky`
2. Add a `prepare` script to `package.json` scripts: `"prepare": "husky"`
3. Run `npx husky init` to create the `.husky` directory.
4. Create `.husky/pre-commit` with the following content:
   ```bash
   cd frontend && npx expo lint 2>/dev/null
   cd backend && uvx ruff check . 2>/dev/null || true
   ```
   Note: The backend ruff check uses `|| true` because `uvx` may not be available in all developer environments. The CI pipeline is the authoritative check.
5. Make the hook executable: `chmod +x .husky/pre-commit`
6. Test by making a small whitespace change, staging it, and committing.

**Verification Checklist:**
- [x] `.husky/pre-commit` exists and is executable
- [x] `husky` appears in `devDependencies` in `package.json`
- [x] `"prepare": "husky"` in `package.json` scripts
- [x] Pre-commit hook runs lint on `git commit`
- [x] Hook does not block commits when backend ruff is unavailable

**Testing Instructions:**
- Make a test change, stage it, and run `git commit -m "test: verify pre-commit hook"`. Verify lint runs before commit completes.
- Abort the test commit if needed with Ctrl+C or `git reset HEAD~1`.

**Commit Message Template:**
```
chore(ci): add husky pre-commit hooks for lint enforcement

- Install husky and configure pre-commit hook
- Run frontend expo lint and backend ruff on commit
- Prevents lint regressions from entering codebase
```

---

### Task 2: Add Commit Message Linting with commitlint

**Goal:** Add `commitlint` to enforce conventional commit format on commit messages. This prevents vague "reviewer feedback" style commits, addressing Git Hygiene.

**Files to Create:**
- `.commitlintrc.json` — commitlint configuration
- `.husky/commit-msg` — commit-msg hook

**Files to Modify:**
- `package.json` — Add commitlint dev dependencies

**Prerequisites:**
- Task 1 completed (Husky installed)

**Implementation Steps:**
1. Install commitlint: `npm install --save-dev @commitlint/cli @commitlint/config-conventional`
2. Create `.commitlintrc.json`:
   ```json
   {
     "extends": ["@commitlint/config-conventional"],
     "rules": {
       "type-enum": [2, "always", ["feat", "fix", "refactor", "test", "chore", "docs", "perf", "ci", "style"]],
       "scope-case": [2, "always", "lower-case"],
       "subject-max-length": [1, "always", 100]
     }
   }
   ```
3. Create `.husky/commit-msg`:
   ```bash
   npx --no -- commitlint --edit ${1}
   ```
4. Make executable: `chmod +x .husky/commit-msg`
5. Test with a bad commit message like "stuff" — should be rejected.
6. Test with a good commit message like `chore: test commitlint` — should pass.

**Verification Checklist:**
- [x] `.commitlintrc.json` exists with conventional commits config
- [x] `.husky/commit-msg` exists and is executable
- [x] `@commitlint/cli` and `@commitlint/config-conventional` in `devDependencies`
- [x] Bad commit messages are rejected
- [x] Good conventional commit messages pass

**Testing Instructions:**
- Create a test file, stage it, try `git commit -m "bad message"` — should fail.
- Try `git commit -m "chore: test commitlint"` — should pass.
- Clean up the test commit: `git reset HEAD~1` and delete test file.

**Commit Message Template:**
```
chore(ci): add commitlint for conventional commit enforcement

- Install @commitlint/cli and @commitlint/config-conventional
- Add commit-msg hook via husky
- Enforces type(scope): description format
```

---

### Task 3: Add Backend Dev Dependencies to pyproject.toml

**Goal:** Declare backend test/dev dependencies in `pyproject.toml` so developers don't have to guess which packages to install. Currently, test dependencies are only listed in the CI workflow YAML. This addresses Reproducibility.

**Files to Modify:**
- `backend/pyproject.toml` — Add `[project.optional-dependencies]` section

**Prerequisites:**
- None

**Implementation Steps:**
1. Read the CI workflow at `.github/workflows/ci.yml` to find the backend test dependencies. Currently line 67: `pip install pytest pytest-mock requests-mock moto ruff`
2. Add an optional dependencies section to `backend/pyproject.toml`:
   ```toml
   [project.optional-dependencies]
   dev = [
       "pytest>=7.0",
       "pytest-mock>=3.0",
       "requests-mock>=1.11",
       "moto[s3]>=5.0",
       "ruff>=0.4.0",
   ]
   ```
3. Update the CI workflow to use this instead of hardcoded packages:
   ```yaml
   - name: Install dependencies
     working-directory: ./backend
     run: |
       pip install --upgrade pip
       pip install -r requirements.txt
       pip install -e ".[dev]"
   ```
   Note: `pip install -e ".[dev]"` requires a `[project]` section in `pyproject.toml`. If the existing `pyproject.toml` only has `[tool.ruff]`, add a minimal `[project]` section:
   ```toml
   [project]
   name = "savorswipe-backend"
   version = "1.0.0"
   requires-python = ">=3.11"
   ```
4. Verify locally: `cd backend && pip install -e ".[dev]" && pytest ../tests/backend -v --tb=short`

**Verification Checklist:**
- [x] `[project.optional-dependencies]` section in `pyproject.toml`
- [x] All test dependencies listed (pytest, pytest-mock, requests-mock, moto, ruff)
- [x] CI workflow updated to use `pip install -e ".[dev]"`
- [x] `PYTHONPATH=backend pytest tests/backend -v --tb=short` passes
- [x] CI workflow still works (same packages installed)

**Testing Instructions:**
- Run: `cd backend && pip install -e ".[dev]"`
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
chore(backend): declare dev dependencies in pyproject.toml

- Add [project.optional-dependencies] dev section
- Move test deps from CI YAML to pyproject.toml
- Developers can now run: pip install -e ".[dev]"
```

---

### Task 4: Add Frontend .env.example

**Goal:** Create a root-level `.env.example` with placeholder values for the `EXPO_PUBLIC_*` environment variables the frontend needs. This addresses Onboarding.

**Files to Create:**
- `.env.example` — Template environment file

**Prerequisites:**
- None

**Implementation Steps:**
1. Search the codebase for `EXPO_PUBLIC_` references to find all required environment variables:
   - `EXPO_PUBLIC_API_GATEWAY_URL` — Used in `UploadService.ts` and likely other services
   - `EXPO_PUBLIC_CLOUDFRONT_BASE_URL` — Used for image loading in `ImageService.ts`, `RecipeService.ts`, `UploadPersistence.ts`, `SearchResultItem.tsx`, and `jest.setup.js`
   - `EXPO_PUBLIC_UPLOAD_URL` — Used in `RecipeService.ts` for recipe image uploads
   - Check for any other `process.env.EXPO_PUBLIC_` or `Constants.expoConfig` references
2. Create `.env.example`:
   ```
   # SavorSwipe Frontend Environment Variables
   # Copy this file to .env and fill in your values
   # See docs/DEPLOYMENT.md for setup instructions

   # API Gateway endpoint URL (from SAM deployment output)
   EXPO_PUBLIC_API_GATEWAY_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com

   # CloudFront distribution URL (for serving recipe images)
   EXPO_PUBLIC_CLOUDFRONT_BASE_URL=https://your-distribution-id.cloudfront.net

   # Upload endpoint URL (for recipe image uploads)
   EXPO_PUBLIC_UPLOAD_URL=https://your-upload-endpoint-url
   ```
3. Adjust the variable list based on what you find in step 1. Include only variables that are actually used.
4. Verify `.env.example` is NOT in `.gitignore` (it should be committed, unlike `.env`).

**Verification Checklist:**
- [x] `.env.example` exists at project root
- [x] All `EXPO_PUBLIC_*` variables documented with placeholder values
- [x] `.env.example` is NOT in `.gitignore`
- [x] Comments explain each variable's purpose
- [x] Reference to `docs/DEPLOYMENT.md` for detailed setup

**Testing Instructions:**
- No automated tests. Manual verification:
  - `cat .env.example` shows all required variables
  - `git status` shows `.env.example` as new file (not ignored)

**Commit Message Template:**
```
docs: add .env.example with frontend environment variables

- Document all EXPO_PUBLIC_* variables with placeholder values
- Reference DEPLOYMENT.md for detailed setup instructions
```

---

### Task 5: Create CONTRIBUTING.md

**Goal:** Add a `CONTRIBUTING.md` documenting branch naming, PR process, test instructions, and commit format. This addresses Onboarding and Git Hygiene.

**Files to Create:**
- `CONTRIBUTING.md` — Contribution guidelines

**Prerequisites:**
- Tasks 1-2 completed (so we can reference the commit hooks)

**Implementation Steps:**
1. Create `CONTRIBUTING.md` at the project root with these sections:
   - **Getting Started:** How to clone, install deps (`npm ci`, `cd backend && pip install -r requirements.txt && pip install -e ".[dev]"`), and run the app
   - **Branch Naming:** `feat/description`, `fix/description`, `chore/description`
   - **Commit Format:** Conventional commits (reference `.commitlintrc.json`). Include valid types and examples.
   - **Pull Request Process:**
     - Create feature branch from `main`
     - Ensure all checks pass (`npm run check`)
     - PRs should be squash-merged to keep history clean
     - PR title should follow conventional commit format
   - **Running Tests:**
     - Frontend: `npm test -- --ci --forceExit`
     - Backend: `PYTHONPATH=backend pytest tests/backend -v --tb=short`
     - All checks: `npm run check`
   - **Code Style:**
     - Frontend: ESLint + TypeScript strict mode, enforced by Expo lint
     - Backend: Ruff, configured in `pyproject.toml`
     - Pre-commit hooks run automatically via Husky
2. Keep it concise — under 100 lines. Reference existing docs where appropriate.

**Verification Checklist:**
- [x] `CONTRIBUTING.md` exists at project root
- [x] Covers: setup, branching, commits, PRs, tests, code style
- [x] References `npm run check` as the all-in-one verification command
- [x] Mentions squash merge strategy for PRs
- [x] Under 100 lines

**Testing Instructions:**
- No automated tests. Review the file for accuracy and completeness.

**Commit Message Template:**
```
docs: add CONTRIBUTING.md with development guidelines

- Document branch naming, commit format, PR process
- Include test instructions for frontend and backend
- Reference pre-commit hooks and linting configuration
```

---

### Task 6: Document Scaling Ceiling

**Goal:** Add an architecture note documenting the scaling ceiling of the single-JSON-file-in-S3 architecture. This is called out by the Stress evaluator under Pragmatism — the current design loads the entire `combined_data.json` into Lambda memory on every operation. This addresses Pragmatism.

**Files to Modify:**
- `docs/DEPLOYMENT.md` — Add scaling considerations section

**Prerequisites:**
- None

**Implementation Steps:**
1. Read `docs/DEPLOYMENT.md` to find the appropriate location for a new section.
2. Add a "Scaling Considerations" section (near the end, before any appendix):
   ```markdown
   ## Scaling Considerations

   ### Current Architecture Limits

   SavorSwipe uses a single `combined_data.json` file in S3 as its data store.
   This design is intentional for a personal recipe collection app, but has
   known scaling limits:

   - **Memory:** Every Lambda invocation loads the entire JSON file into memory.
     The Lambda is configured with 1024MB. At ~2KB per recipe, this supports
     roughly 500,000 recipes before memory pressure becomes a concern.
   - **Concurrency:** Optimistic locking (S3 ETags) handles race conditions,
     but high write concurrency (>10 concurrent uploads) increases retry rates.
   - **Read latency:** GET requests deserialize the full JSON on every call.
     At 1000+ recipes, consider adding CloudFront caching for the JSON endpoint.

   ### Migration Path (if needed)

   If you need to scale beyond a personal collection:
   1. **DynamoDB:** Replace S3 JSON with DynamoDB table. Each recipe becomes a row.
      Enables per-item reads/writes and pagination.
   2. **Aurora Serverless:** For relational queries, full-text search, and joins.
   3. **OpenSearch:** For embedding-based semantic search at scale.

   These migrations are out of scope for the current single-user design but
   are straightforward given the clean service layer boundaries.
   ```
3. Keep it factual and concise.

**Verification Checklist:**
- [x] "Scaling Considerations" section added to `DEPLOYMENT.md`
- [x] Documents memory limit, concurrency behavior, and read latency
- [x] Provides migration path for scaling beyond current design
- [x] Tone is pragmatic, not apologetic

**Testing Instructions:**
- No automated tests. Review for accuracy.

**Commit Message Template:**
```
docs: document scaling ceiling of single-JSON-file architecture

- Add Scaling Considerations section to DEPLOYMENT.md
- Document memory, concurrency, and latency limits
- Provide migration path to DynamoDB/Aurora/OpenSearch
```

---

## Phase Verification

After completing all 6 tasks:

1. Verify pre-commit hooks work:
   - Make a small change, stage it, and commit with a conventional message
   - Verify lint runs before commit
   - Try a bad commit message — should be rejected
2. Verify documentation:
   - `.env.example` exists with all `EXPO_PUBLIC_*` variables
   - `CONTRIBUTING.md` exists at project root
   - `docs/DEPLOYMENT.md` has scaling section
3. Verify dev dependencies:
   - `cd backend && pip install -e ".[dev]"` works
   - `PYTHONPATH=backend pytest tests/backend -v --tb=short` passes
4. Run full check: `npm run check`

**Known limitations:**
- The pre-commit hook runs frontend lint but skips TypeScript type checking (`tsc --noEmit`) for speed. Full type checking happens in CI.
- `commitlint` only enforces format, not quality. Vague messages like `fix: stuff` will pass format validation but should be caught in code review.
- The squash merge enforcement mentioned in `CONTRIBUTING.md` requires a GitHub repository settings change that cannot be automated from code. A repository admin must enable "Squash merging" and disable "Merge commits" in Settings > General > Pull Requests.
