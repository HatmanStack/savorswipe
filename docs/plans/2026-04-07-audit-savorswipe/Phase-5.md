# Phase 5 — [FORTIFIER] Reproducibility, Devcontainer, E2E, CI

Closes Day-2 evaluation gaps: Python lockfile, container baseline, e2e coverage, CI tweaks.

## Task 5.1 — Add `backend/uv.lock` and CI `uv sync`

**Goal:** Lock backend Python dependencies per the project's `uv` policy.

**Files:**

- `backend/pyproject.toml` (verify `[project.dependencies]` and `[project.optional-dependencies] dev` are complete)
- New: `backend/uv.lock`
- `.github/workflows/ci.yml`
- `CONTRIBUTING.md` (Phase 6 will polish prose; this task only adds the install command)

**Prerequisites:** Phase 4 complete.

**Implementation Steps:**

1. Confirm `backend/pyproject.toml` lists every runtime dep currently in `backend/requirements.txt`. Migrate any missing entries.
1. From `backend/`, run `uv lock` to generate `backend/uv.lock`. Commit it.
1. Update CI: in `.github/workflows/ci.yml` backend job replace any `pip install` line with `uv sync --frozen` (run from `backend/`). Cache `~/.cache/uv` keyed on `backend/uv.lock`.
1. Mark `backend/requirements.txt` as deprecated by emitting it from `uv export --frozen --no-hashes > backend/requirements.txt` so the SAM build (which uses requirements.txt) keeps working. Add a `make` target or npm script `npm run lock:backend` that runs both `uv lock` and the export.
1. Run `npm run test:backend` and the backend lint locally to confirm the env matches.

**Verification Checklist:**

- [ ] `backend/uv.lock` committed
- [ ] CI uses `uv sync --frozen`
- [ ] `backend/requirements.txt` regenerated from lock
- [ ] `npm run lock:backend` script exists
- [ ] CI green

**Testing Instructions:**

```bash
cd backend && uv sync --frozen
npm run test:backend
```

**Commit Message Template:**

```text
build(backend): add uv.lock and CI uv sync

Locks backend Python dependencies per the project uv policy and
wires the CI backend job to uv sync --frozen with cache. Regenerates
requirements.txt from the lockfile so SAM build still works.

Phase: 2026-04-07-audit-savorswipe/Phase-5
Refs: eval.md day2 finding 1; eval.md day2 remediation 1
```

## Task 5.2 — Devcontainer for one-command onboarding

**Goal:** Provide a reproducible local environment.

**Files:**

- New: `.devcontainer/devcontainer.json`
- New: `.devcontainer/Dockerfile`
- `README.md` (add a "Devcontainer" subsection — full doc polish in Phase 6)

**Prerequisites:** Task 5.1 done.

**Implementation Steps:**

1. Author `.devcontainer/Dockerfile` based on `mcr.microsoft.com/devcontainers/base:ubuntu-22.04`. Install Node 22 LTS via nvm, Python 3.13 via uv, AWS SAM CLI via `uvx`, ripgrep, jq, git.
1. Author `.devcontainer/devcontainer.json` referencing the Dockerfile, mounting the repo, exposing port 8081 (Metro) + 3000, and running `postCreateCommand: npm install && cd backend && uv sync --frozen`.
1. Add VSCode extension recommendations: ESLint, Prettier, Python, Ruff.
1. Smoke-test the devcontainer build locally if possible; otherwise document the smoke command.

**Verification Checklist:**

- [ ] `.devcontainer/devcontainer.json` and `.devcontainer/Dockerfile` exist
- [ ] postCreateCommand installs both stacks
- [ ] Node 22 LTS and Python 3.13 both pinned
- [ ] No bare `pip install` in the Dockerfile

**Testing Instructions:**

```bash
docker build -f .devcontainer/Dockerfile .
```

**Commit Message Template:**

```text
build: add devcontainer for one-command onboarding

Provides Dockerfile + devcontainer.json pinning Node 22 LTS and
Python 3.13 via uv. postCreateCommand installs both workspaces.

Phase: 2026-04-07-audit-savorswipe/Phase-5
Refs: eval.md day2 finding 2; eval.md day2 remediation 2
```

## Task 5.3 — Detox/Playwright e2e for swipe + upload happy path

**Goal:** First true e2e test exercising the full swipe + upload flow.

**Files:**

- New: `tests/e2e/swipe-upload.spec.ts`
- New: `playwright.config.ts` (web target — simplest path given Expo Web support)
- `package.json` (add `test:e2e` script)
- `.github/workflows/ci.yml` (optional gate, see step)

**Prerequisites:** Task 5.2 done.

**Implementation Steps:**

1. Choose Playwright web (Expo Router renders to web; avoids Detox native toolchain in CI).
1. Add Playwright via `npm install -D @playwright/test` and `npx playwright install --with-deps chromium`.
1. Create `playwright.config.ts` pointing at `http://localhost:8081` with a `webServer` block running `npm run web` and waiting for ready.
1. Author `tests/e2e/swipe-upload.spec.ts` covering: app loads, user swipes one card, navigates to upload, uploads a fixture image (`tests/fixtures/sample-recipe.jpg` — add a small fixture if absent), polls `/upload/status/{jobId}` (mock or stub the backend), asserts the new recipe surfaces.
1. Add `"test:e2e": "playwright test"` to `package.json` scripts.
1. Add a CI job (separate workflow file or new job in `ci.yml`) gated to PRs touching `frontend/` or `tests/e2e/`. Mark non-blocking initially (continue-on-error) until stable, then make blocking in a follow-up.

**Verification Checklist:**

- [ ] `tests/e2e/swipe-upload.spec.ts` exists and passes locally
- [ ] `npm run test:e2e` documented
- [ ] CI job present (may be non-blocking)
- [ ] Backend stubbed or fixture-driven (test does not call OpenAI)

**Testing Instructions:**

```bash
npm run test:e2e
```

**Commit Message Template:**

```text
test(e2e): add playwright swipe + upload happy path

First true e2e covering swipe -> upload -> status poll -> recipe
surfaces in queue. Uses fixture image and stubs backend OpenAI calls
to keep CI hermetic.

Phase: 2026-04-07-audit-savorswipe/Phase-5
Refs: eval.md day2 finding 3; eval.md day2 remediation 3
```

## Task 5.4 — CI tweaks: jest ignore patterns, status check

**Goal:** Audit `jest.config` ignore patterns and ensure `status-check` aggregator gates the new e2e job once stable.

**Files:**

- `jest.config.js` (or `jest.config.ts`)
- `.github/workflows/ci.yml`

**Prerequisites:** Task 5.3 done.

**Implementation Steps:**

1. Confirm `jest` `testPathIgnorePatterns` includes `node_modules`, `dist`, `tests/e2e`, and any `__test_helpers__` dirs introduced in Phase 1 Task 1.4.
1. Update `.github/workflows/ci.yml` `status-check` aggregator job to require the new uv sync job.
1. Run `npm run check`.

**Verification Checklist:**

- [ ] Jest does not pick up Playwright specs
- [ ] `status-check` aggregator references all required jobs
- [ ] CI green

**Testing Instructions:**

```bash
npm run check
```

**Commit Message Template:**

```text
ci: tighten jest ignore and status-check aggregator

Excludes tests/e2e from jest discovery and adds the new uv sync job
to the status-check aggregator.

Phase: 2026-04-07-audit-savorswipe/Phase-5
Refs: eval.md day2 red flag 5
```
