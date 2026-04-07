# Feedback Log

## Active Feedback

<!-- Reviewers append new items here with Status: OPEN -->

### CODE_REVIEW Phase 1 — Disregard the `.venv/` not-gitignored note

- Status: INFO
- Reviewer: health-reviewer

The hygienist's hand-off claimed `.venv/` was created at repo root and not gitignored. Verified false: `.gitignore` already contains `.venv/` and `git status` shows the directory is ignored. No action required, but flagging so the next agent does not chase a non-issue.

### CODE_REVIEW Phase 1 — Otherwise clean

- Status: INFO
- Reviewer: health-reviewer

Confirmed green:

1. `npm run lint` — expo lint + `tsc --noEmit` clean.
1. `uvx ruff check backend` — all checks passed.
1. Frontend Jest — 29 suites, 279 passed, 9 skipped.
1. Backend pytest (via `.venv`) — 148 passed.
1. Removed symbols (`to_s3`, `select_unique_image_url`, backend `NEW_RECIPE_HOURS`, `DEBUG_MODE` constant, `debug_log`) — zero live references; remaining substring matches are unrelated identifiers (`upload_image_to_s3`, `batch_to_s3_atomic`, frontend `CONFIG.NEW_RECIPE_HOURS`) and `logger.py` reading the `DEBUG_MODE` env var (out of scope).
1. Production web bundle (`npx expo export --platform web`) — zero hits for `_setTestApiUrl`, `_resetForTests`, `_setProcessingForTests`. The `__UPLOAD_SERVICE_INTERNALS__` symbol survives as an empty getter (`function(){}`), with the mutator bodies tree-shaken. Acceptable: no test back door reaches production code paths.
1. `git log --oneline` shows four atomic conventional commits, one per task, in plan order.

---

## Resolved Feedback

<!-- Generators move items here with Status: RESOLVED + resolution note -->

### CODE_REVIEW Phase 1 — Stale `expo-router/entry` knip hint not fixed

- Status: RESOLVED
- Reviewer: health-reviewer
- Scope: Task 1.3 verification checklist

Resolution: Added `frontend/knip.json` declaring the real Expo Router entries (`app/**/*.{ts,tsx,js,jsx}`, config files, scripts, and Jest test/helper globs), changed `frontend/package.json` `main` from the bare `expo-router/entry` specifier to a local `index.js` shim that does `import 'expo-router/entry';`, and ignored `expo-router` in `ignoreDependencies` (since it's pulled in transitively via the shim, not a direct import). `npx knip` from `frontend/` now reports zero configuration hints, zero unused files, and zero unused exports — the 94-file false-positive cascade is gone. Remaining `Unlisted dependencies (129)` are the expected workspace-hoisted peers (`react`, `react-native`, etc.) and out of scope for Task 1.3. Lint (`npm run lint`) and frontend tests (`npm test -- --ci --forceExit`: 29 suites, 279 passed, 9 skipped) re-verified green. Committed as a follow-up `chore(frontend):` (no amend).

---
