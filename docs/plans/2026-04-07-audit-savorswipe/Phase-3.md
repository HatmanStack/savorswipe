# Phase 3 — [IMPLEMENTER] God-Module Split, ETag Refactor, Error Accounting

Carves the 1,580-line `backend/lambda_function.py` into a thin dispatcher plus focused modules. Tightens the ETag retry loop and the upload-pipeline error accounting.

## Task 3.1 — Carve handlers into `backend/routes/`

**Goal:** Reduce `lambda_function.py` to <200 lines (dispatcher + setup only). Move each handler into a single-purpose module under `backend/routes/`.

**Files:**

- `backend/lambda_function.py`
- New: `backend/routes/__init__.py`
- New: `backend/routes/recipes.py` (GET /recipes)
- New: `backend/routes/upload.py` (POST /recipe/upload, async-invoke handoff)
- New: `backend/routes/upload_status.py` (GET /upload/status/{jobId})
- New: `backend/routes/recipe_delete.py` (DELETE /recipe/{recipe_key})
- New: `backend/routes/recipe_image.py` (POST /recipe/{recipe_key}/image)
- New: `backend/services/recipe_completeness.py` (extract `merge_incomplete_recipes` and helpers)
- New: `backend/services/title_similarity.py`
- `backend/routes.py` (from Phase 2 — wire handler imports)
- `tests/backend/test_<route>.py` (split as needed; existing tests rebound to new module paths)

**Prerequisites:** Phase 2 complete.

**Implementation Steps:**

1. Inventory `lambda_function.py` and tag each function with its target module (use comments first if useful).
1. Move `merge_incomplete_recipes` and the title-similarity helpers (lines 100-207) into `backend/services/`. Replace the in-place mutation in `merge_incomplete_recipes` with a pure function returning a new list (eliminates the iterator-mutation hazard from finding 17).
1. Move each handler block into its `backend/routes/<name>.py`. Each handler signature: `def handle(event, path_params, context) -> dict`.
1. Update `backend/routes.py` to map handler names to imported callables.
1. Reduce `backend/lambda_function.py` to: imports, logger setup, `lambda_handler` (dispatch + async-invoke branch + error envelope), nothing else.
1. Replace `if DEBUG_MODE`-style logging in hot loops with `log.debug("msg %s", arg)` lazy form (already started in Phase 1; finish in moved code).
1. Update tests so they import from the new module paths. Split `test_lambda_function.py` into per-route test files where it grew large.
1. Run `npm run test:backend`. Run `npm run lint:backend`.

**Verification Checklist:**

- [ ] `wc -l backend/lambda_function.py` reports <200 lines
- [ ] No handler logic remains in `lambda_function.py`
- [ ] `merge_incomplete_recipes` is pure (returns a new list, asserted by test)
- [ ] All backend tests green
- [ ] `uvx ruff check backend` clean

**Testing Instructions:**

```bash
npm run lint:backend
npm run test:backend
```

**Commit Message Template:**

```text
refactor(backend): split lambda_function into routes and services

Decomposes the 1,580-line god module into a thin dispatcher
(<200 lines) plus per-route handlers under backend/routes/ and
domain helpers under backend/services/. Converts
merge_incomplete_recipes to a pure function to remove the
iterator-mutation hazard.

Phase: 2026-04-07-audit-savorswipe/Phase-3
Refs: health-audit.md findings 2 (CRITICAL), 17
```

## Task 3.2 — Refactor ETag retry loop

**Goal:** Flatten the 4-deep nested try/except inside `for attempt in range(MAX_RETRIES)`, eliminate the stale-closure cleanup, and remove the unreachable fall-through return.

**Files:**

- `backend/routes/upload.py` (or wherever the loop landed in Task 3.1; original lines 929-1075)
- New: `backend/services/etag_writer.py`
- `tests/backend/test_etag_writer.py` (new)

**Prerequisites:** Task 3.1 done.

**Implementation Steps:**

1. Extract the optimistic-write loop into `backend/services/etag_writer.py`:

   ```python
   def write_with_etag(s3_path, mutate_fn, max_retries=MAX_RETRIES) -> WriteResult:
       ...
   ```

   `mutate_fn` takes the current parsed JSON and returns the new parsed JSON. The writer handles GET-with-ETag, conditional PUT, retry/backoff, and orphan cleanup via an explicit `cleanup_fn` argument (no closure capture).

1. Replace `time.sleep` retries with capped exponential backoff using `random.uniform(0, 2**attempt * 0.1)`; cap total wait at 2s so Lambda billed time stays bounded.

1. Delete the unreachable `# should not reach here` return.

1. Add unit tests covering: success on first try, success after one 412, exhausted retries, cleanup invoked exactly once on failure, cleanup NOT invoked on success.

1. Run `npm run test:backend`.

**Verification Checklist:**

- [ ] Loop is single-level try/except
- [ ] No closure capture of `s3_path`
- [ ] Unreachable return removed
- [ ] New tests cover success, conflict-retry, exhaustion, cleanup
- [ ] Backend tests green

**Testing Instructions:**

```bash
PYTHONPATH=backend pytest tests/backend/test_etag_writer.py -v
npm run test:backend
```

**Commit Message Template:**

```text
refactor(backend): extract ETag-locked writer into pure helper

Replaces the 4-deep nested try/except retry loop with a single-level
write_with_etag helper that takes explicit mutate_fn and cleanup_fn
arguments. Eliminates stale-closure orphan-cleanup bug and the
unreachable fall-through return. Caps backoff total wait at 2s.

Phase: 2026-04-07-audit-savorswipe/Phase-3
Refs: health-audit.md finding 5
```

## Task 3.3 — Tighten upload-pipeline error accounting

**Goal:** Stop silently dropping recipes when ParseJSON fails. Surface the failure into `file_errors`. Validate the position->key mapping.

**Files:**

- `backend/routes/upload.py` (originally `process_upload_files` ~ lines 1349-1473)
- `tests/backend/test_upload.py`

**Prerequisites:** Task 3.2 done.

**Implementation Steps:**

1. Wrap the ParseJSON failure path so each failure appends to `file_errors` with `{file: ..., stage: "parse_json", error: str(e)}` instead of being swallowed.
1. Replace the position->key mapping with an explicit `dict[int, RecipeKey]` populated as recipes are written; assert non-None before use and log + record `file_errors` on miss.
1. Add a per-recipe wall-clock budget: track `start_time` and abort the recipe (record `file_errors` with `stage: "timeout"`) if elapsed > `RECIPE_BUDGET_SECONDS` (env-configurable, default 90s).
1. Add tests: ParseJSON failure surfaces in `file_errors`; missing position->key mapping surfaces in `file_errors`; budget timeout surfaces in `file_errors`.
1. Run `npm run test:backend`.

**Verification Checklist:**

- [ ] Zero `except: pass` swallowing in upload pipeline
- [ ] `file_errors` includes ParseJSON, mapping-miss, and timeout entries when applicable
- [ ] Tests cover each new error path
- [ ] Backend tests green

**Testing Instructions:**

```bash
PYTHONPATH=backend pytest tests/backend/test_upload.py -v
npm run test:backend
```

**Commit Message Template:**

```text
fix(backend): surface ParseJSON, mapping, and timeout errors

Upload pipeline previously swallowed ParseJSON failures and
position->key mapping misses, causing recipes to vanish silently.
Routes those failures into file_errors and adds a per-recipe
wall-clock budget for ThreadPoolExecutor work.

Phase: 2026-04-07-audit-savorswipe/Phase-3
Refs: eval.md stress findings 3, 4; eval.md remediation 5, 7
```
