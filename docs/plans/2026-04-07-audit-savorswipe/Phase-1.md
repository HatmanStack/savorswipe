# Phase 1 — [HYGIENIST] Quick-Win Cleanup

Subtractive only. Delete dead code, prune unused exports, clear the lodash advisory, retire vestigial flags. No behavior changes.

## Task 1.1 — Run `npm audit fix` for lodash

**Goal:** Clear the high-severity `lodash <=4.17.23` prototype-pollution / code-injection advisory.

**Files:**

- `package.json`
- `package-lock.json`

**Prerequisites:** Clean working tree. `npm run check` green on baseline.

**Implementation Steps:**

1. Run `npm audit` and record the current vuln list.
1. Run `npm audit fix` (no `--force`).
1. Re-run `npm audit`. Confirm the high-sev lodash entry is gone.
1. Run `npm run check`.

**Verification Checklist:**

- [x]`npm audit` reports zero high vulnerabilities
- [x]`package-lock.json` updated, `package.json` change minimal
- [x]`npm run check` green

**Testing Instructions:** `npm run check` (full aggregate).

**Commit Message Template:**

```text
chore(deps): run npm audit fix to clear lodash advisory

Resolves high-severity prototype-pollution and code-injection
advisory for lodash <=4.17.23 via non-breaking dependency updates.

Phase: 2026-04-07-audit-savorswipe/Phase-1
Refs: health-audit.md finding 10
```

## Task 1.2 — Delete dead Python helpers

**Goal:** Remove vulture-confirmed dead code from backend.

**Files:**

- `backend/upload.py` (delete `to_s3` at line 70)
- `backend/search_image.py` (delete `select_unique_image_url` at line 257)
- `backend/config.py` (delete `NEW_RECIPE_HOURS` at line 17)
- `backend/lambda_function.py` (delete `DEBUG_MODE` at line 73 and any references; collapse `debug_log` -> `log.debug`)
- `tests/backend/` (delete or rewrite tests asserting on the removed symbols)

**Prerequisites:** Task 1.1 done.

**Implementation Steps:**

1. `Grep` each symbol across the repo to confirm zero callers.
1. Delete each definition + any commented references.
1. Replace `debug_log(f"...")` calls with `log.debug("...", arg)` lazy form.
1. Remove `DEBUG_MODE` from CLAUDE.md env var section (will be re-handled in Phase 6 doc pass; for now just delete).
1. Run `uvx vulture backend --min-confidence 80` to confirm flagged items resolved.
1. Run `npm run lint:backend` and `npm run test:backend`.

**Verification Checklist:**

- [x]No `to_s3`, `select_unique_image_url`, `NEW_RECIPE_HOURS`, `DEBUG_MODE`, `debug_log` references remain
- [x]`uvx vulture backend` clean for these items
- [x]`npm run check` green

**Testing Instructions:**

```bash
npm run lint:backend
npm run test:backend
```

**Commit Message Template:**

```text
refactor(backend): delete dead helpers and DEBUG_MODE flag

Removes vulture-flagged dead code: to_s3, select_unique_image_url,
NEW_RECIPE_HOURS, DEBUG_MODE. Collapses debug_log shim to log.debug
with lazy formatting to eliminate eager f-string overhead.

Phase: 2026-04-07-audit-savorswipe/Phase-1
Refs: health-audit.md findings 11, 12, 9
```

## Task 1.3 — Prune knip-flagged frontend dead exports

**Goal:** Remove 38 unused exports + 29 unused exported types reported by knip.

**Files:**

- `frontend/types/index.ts` (`asRecipeKey`, `asJobId` and similar)
- `frontend/utils/normalizeRecipe.ts`
- `frontend/utils/seo.ts`
- `frontend/components/Menu/index.ts`
- `frontend/components/Checkbox.tsx`
- Any other files knip identifies on rerun

**Prerequisites:** Task 1.2 done.

**Implementation Steps:**

1. Run `npx knip --reporter compact` and capture full unused-export list.
1. For each entry, `Grep` to confirm no live import outside the declaring file.
1. Convert truly unused `export` keywords to local symbols, or delete if unreferenced.
1. Fix the `expo-router/entry` stale entry hint in knip config or `package.json` `main` field as appropriate.
1. Re-run `npx knip` to confirm zero unused exports.
1. Run `npm run lint` and `npm test -- --ci --forceExit`.

**Verification Checklist:**

- [x]`npx knip` reports zero unused exports and zero stale entries
- [x]`npm run lint` green
- [x]Frontend tests green

**Testing Instructions:**

```bash
npx knip
npm run lint
npm test -- --ci --forceExit
```

**Commit Message Template:**

```text
refactor(frontend): drop knip-flagged unused exports and types

Removes 38 unused exports plus 29 unused exported types and fixes
the stale expo-router/entry knip hint. No behavior change.

Phase: 2026-04-07-audit-savorswipe/Phase-1
Refs: health-audit.md findings 13, 18
```

## Task 1.4 — Strip frontend test back doors from production bundle

**Goal:** Stop shipping `_setTestApiUrl`, `_resetForTests`, `_setProcessingForTests` in the production bundle.

**Files:**

- `frontend/services/UploadService.ts`
- `frontend/services/__tests__/UploadService.test.ts` (and any other tests touching those hooks)

**Prerequisites:** Task 1.3 done.

**Implementation Steps:**

1. Move test-only mutators to a sibling `frontend/services/__test_helpers__/UploadServiceTestHooks.ts` that imports from the service via a controlled `__INTERNAL__` symbol exported only when `__DEV__` is true.
1. Alternatively, gate at module load with `if (__DEV__) { ... }` and verify Metro tree-shakes them in production builds.
1. Update tests to import from the new helper.
1. Run frontend tests and a production bundle check (`npx expo export --platform web` and `Grep` the output for the symbol names).

**Verification Checklist:**

- [x]Production build does not contain `_setTestApiUrl`, `_resetForTests`, `_setProcessingForTests`
- [x]Tests still pass
- [x]No usage of `process.env.NODE_ENV` to gate the back doors

**Testing Instructions:**

```bash
npm test -- --ci --forceExit
npx expo export --platform web
grep -r "_setTestApiUrl" dist/ || echo "OK: no leaks"
```

**Commit Message Template:**

```text
refactor(frontend): isolate UploadService test hooks behind __DEV__

Moves _setTestApiUrl, _resetForTests, _setProcessingForTests to a
test-only helper module gated on __DEV__ so production bundles no
longer ship test back doors.

Phase: 2026-04-07-audit-savorswipe/Phase-1
Refs: health-audit.md finding 7
```
