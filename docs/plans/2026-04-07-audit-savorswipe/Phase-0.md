# Phase 0 — Architecture, Conventions, Testing, Commit Format

## Architecture Snapshot

Monorepo with npm workspaces.

- `frontend/` — Expo Router (Expo 55) React Native app. State via `RecipeContext`. Image prefetch via `useImageQueue` + `ImageQueueService`. Services in `frontend/services/`. Branded types and discriminated unions in `frontend/types/index.ts`. Path alias `@/*` -> `frontend/*`.
- `backend/` — AWS Lambda (Python 3.11/3.13) deployed via SAM (`backend/template.yaml`). Single entry `backend/lambda_function.py` (currently 1,580 lines, will be split). Modules: `ocr.py`, `search_image.py`, `upload.py`, `embeddings.py`, `duplicate_detector.py`, `embedding_generator.py`, `image_uploader.py`, `config.py`, `logger.py`.
- `tests/` — `tests/backend/` (pytest + moto), `tests/frontend/`, `tests/integration/`. Frontend component tests live alongside source under `__tests__/`.
- Storage: S3 holds `jsondata/combined_data.json`, `jsondata/recipe_embeddings.json`, `images/*.jpg`, `upload-status/*.json`, `upload-pending/*.json`.

## Project Conventions

- **Python packages:** ALWAYS `uv pip install` or `uvx`. NEVER bare `pip`. Lockfile policy: `backend/uv.lock` is the source of truth once introduced (Phase 5).
- **Node:** Active LTS is v22 (NOT v24). CI pins explicit versions.
- **Path alias:** `@/*` -> `frontend/*`. Do not import via deep relative paths if alias works.
- **Recipe data:** Always normalize raw API recipes through `normalizeRecipe()` before consumption; downstream code uses the `kind` discriminant. Type guards `isNormalizedIngredients` etc. only for raw data.
- **Logging:** Backend uses structured `logger` from `backend/logger.py`. Avoid f-string `debug_log` calls in hot loops; pass lazy args (`log.debug("msg %s", x)`).
- **Boto3:** Construct clients at module scope, never inside handlers.
- **Routing:** Use an explicit dispatch table keyed on `(method, path_pattern)`. No substring matching.
- **Frontend test back doors:** Production bundles must not export `_setTestApiUrl`, `_resetForTests`, `_setProcessingForTests`. Gate via build-time `__DEV__` or move to test-only modules.
- **Error envelope:** Backend responses use `{"success": bool, "error"?: str, "data"?: ...}`. New code MUST emit this shape.

## Testing Protocol

- **Frontend:** `npm test -- --ci --forceExit` (Jest + jest-expo + RNTL). Single file: `npx jest path/to/test.ts --no-watch`.
- **Backend:** `npm run test:backend` -> `PYTHONPATH=backend pytest tests/backend -v --tb=short`. Single file: `PYTHONPATH=backend pytest tests/backend/test_<x>.py -v`.
- **Aggregate:** `npm run check` (lint + type-check + frontend tests + backend tests). MUST pass before any commit.
- **Lint:** Frontend `npm run lint` (expo lint + tsc --noEmit). Backend `npm run lint:backend` (`uvx ruff check .`).
- **TDD:** New behavior gets a failing test first. Refactors keep tests green continuously.
- **Coverage targets:** No regression vs main; new code paths have at least one happy-path and one error-path test.

## Commit Format

Conventional Commits enforced by commitlint + Husky pre-commit.

- Allowed types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `build`, `perf`.
- Subject in imperative mood, no trailing period, <=72 chars.
- Body explains the why; reference phase via `Phase: 2026-04-07-audit-savorswipe/Phase-N`.
- NO `Co-Authored-By` trailers (per project memory).
- One logical change per commit. Atomic.
- NEVER amend; always new commits.
- NEVER `--no-verify` to skip hooks.

### Commit Message Template

```text
<type>(<scope>): <subject>

<body explaining motivation and approach>

Phase: 2026-04-07-audit-savorswipe/Phase-<N>
Refs: <audit finding id or path:line>
```

## Markdown Conventions (this plan)

- Code fences carry language tags.
- Headings have no trailing punctuation.
- Ordered lists use `1.` for every item.
- Blank lines surround fences, lists, and headings.
- Run `markdownlint` over `docs/plans/2026-04-07-audit-savorswipe/` before marking phases complete.

## Definition of Done (per phase)

1. All tasks checked off.
1. `npm run check` green.
1. `markdownlint` clean for new/edited docs.
1. Conventional commits pushed (one per task or one per logical group).
1. Verification checklist in the phase file passes.
