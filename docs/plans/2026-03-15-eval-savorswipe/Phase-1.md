# Phase 1: Hygiene & Cleanup

## Phase Goal

Remove dead code, unused dependencies, and manual test files that add noise, bloat, and maintenance burden. This phase addresses the lowest-hanging fruit across Git Hygiene (5/10), Pragmatism (8/10), Problem-Solution Fit (8/10), Performance (7/10), and Test Value (7/10).

**Success criteria:** All dead code removed, unused dependencies purged, manual test file eliminated, no regressions in CI.

**Estimated tokens:** ~15,000

## Prerequisites

- Phase 0 read and understood
- Node.js 24 and Python 3.13 available
- Repository cloned with `npm ci` completed

---

## Tasks

### Task 1: Remove Unused npm Dependencies

**Goal:** Remove `aws-sdk` (~67MB) and `@modelcontextprotocol/sdk` from `package.json`. Neither has any application imports — `aws-sdk` is only referenced in Jest mock setup, and `@modelcontextprotocol/sdk` has zero imports anywhere. This addresses Problem-Solution Fit, Pragmatism, and Performance.

**Files to Modify:**
- `package.json` — Remove both dependencies
- `frontend/jest.mocks.js` — Remove or update any `aws-sdk` mock if present

**Prerequisites:**
- None

**Implementation Steps:**
1. Open `package.json` and remove `"aws-sdk"` and `"@modelcontextprotocol/sdk"` from the `dependencies` section.
2. Check `frontend/jest.mocks.js` for any references to `aws-sdk`. If the mock references `aws-sdk`, remove that mock entry entirely (it mocks a package the app does not use).
3. Run `npm install` to regenerate `package-lock.json`.
4. Run `npm test -- --ci --forceExit` to verify no tests depend on these packages.
5. Run `npm run lint` to verify no lint errors.

**Verification Checklist:**
- [ ] `aws-sdk` does not appear in `package.json` `dependencies` or `devDependencies`
- [ ] `@modelcontextprotocol/sdk` does not appear in `package.json`
- [ ] `npm test -- --ci --forceExit` passes
- [ ] `npm run lint` passes

**Testing Instructions:**
- No new tests needed. Existing test suite must pass without these packages.
- Run: `npm test -- --ci --forceExit`

**Commit Message Template:**
```
chore: remove unused aws-sdk and @modelcontextprotocol/sdk dependencies

- Remove aws-sdk (~67MB) with zero application imports
- Remove @modelcontextprotocol/sdk with zero imports anywhere
- Update jest mocks if needed
```

---

### Task 2: Remove Dead Backend Code

**Goal:** Delete the `google_search_image_legacy` function from `backend/search_image.py`. It is unused, has no timeout, and no error handling. This addresses Pragmatism.

**Files to Modify:**
- `backend/search_image.py` — Delete `google_search_image_legacy` function (lines 310-337)

**Prerequisites:**
- None

**Implementation Steps:**
1. Search the entire codebase for any references to `google_search_image_legacy` to confirm it is unused. Check all Python files and any import statements.
2. Delete the function and its docstring from `backend/search_image.py`. The function starts with the comment `# Legacy function for backward compatibility with existing code` and ends at the end of the file.
3. Run backend linting: `cd backend && uvx ruff check .`
4. Run backend tests: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Verification Checklist:**
- [ ] `google_search_image_legacy` does not appear anywhere in the codebase
- [ ] `ruff check .` passes in backend directory
- [ ] `pytest tests/backend -v --tb=short` passes

**Testing Instructions:**
- No new tests needed. Run existing backend tests to verify no regressions.
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
chore(backend): remove dead google_search_image_legacy function

- Remove unused legacy function with no timeout or error handling
- Modern google_search_image() is the active implementation
```

---

### Task 3: Remove Manual Test File

**Goal:** Delete `tests/backend/test_manual.py`. This file sets hardcoded AWS credentials at module level, uses `print()` for assertions, and is never run in CI. It teaches bad patterns and clutters the test directory. This addresses Test Value.

**Files to Modify:**
- `tests/backend/test_manual.py` — Delete the entire file

**Prerequisites:**
- None

**Implementation Steps:**
1. Verify that `test_manual.py` is not imported by any other test file. Search for `test_manual` and `from mocks import` references.
2. Verify it is excluded from CI (check `jest` config in `package.json` — it has `testPathIgnorePatterns` for `/tests/backend/`, and `pytest` runs on `tests/backend` but the tests in this file use `@mock_aws` and `if __name__ == '__main__'` pattern, not standard pytest).
3. Delete `tests/backend/test_manual.py`.
4. Run backend tests to confirm nothing breaks: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Verification Checklist:**
- [ ] `tests/backend/test_manual.py` no longer exists
- [ ] `pytest tests/backend -v --tb=short` passes
- [ ] No other test files import from `test_manual`

**Testing Instructions:**
- No new tests needed. The functionality tested by this manual file is already covered by proper automated tests in `test_lambda_function.py`, `test_recipe_deletion.py`, and `test_endpoints_delete.py`.
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
chore(backend): remove manual test file with hardcoded credentials

- Delete tests/backend/test_manual.py
- Functionality already covered by automated test suite
- Removes pattern of setting AWS credentials at module level
```

---

### Task 4: Remove Unnecessary /tmp File Write in upload.py

**Goal:** In `backend/upload.py`, the `upload_image` function writes image bytes to a temporary file on disk (`/tmp/searchImage_*.jpg`) and then uploads the bytes from memory anyway (using `Body=image_data`, not reading from the file). Remove the unnecessary disk I/O. This addresses Performance.

**Files to Modify:**
- `backend/upload.py` — Remove `/tmp` file write logic in `upload_image` function

**Prerequisites:**
- None

**Implementation Steps:**
1. In the `upload_image` function, locate the block that writes to `/tmp` (lines ~173-176). It writes `image_data` to a temp file, then uploads using `Body=image_data` directly.
2. Remove the temp file creation (`tmp_image_path` assignment, `open/write` block, and the `print` about writing temp file).
3. Remove both `os.remove(tmp_image_path)` cleanup blocks (the one after successful upload and the one in the error handler).
4. Keep the S3 `put_object` call and the `return image_url` line — those are needed.
5. Run backend tests: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Verification Checklist:**
- [ ] No reference to `tmp_image_path` or `/tmp/searchImage_` in `upload.py`
- [ ] The `uuid` import can remain (it may be used elsewhere) — check and remove if unused
- [ ] `put_object` still uploads `image_data` via `Body=image_data`
- [ ] Backend tests pass

**Testing Instructions:**
- Run existing tests: `PYTHONPATH=backend pytest tests/backend/test_upload.py -v --tb=short`
- Run full backend suite: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
refactor(backend): remove unnecessary /tmp file write in upload_image

- Image bytes were written to disk then uploaded from memory anyway
- Remove redundant disk I/O and temp file cleanup logic
```

---

## Phase Verification

After completing all 4 tasks:

1. Run full frontend test suite: `npm test -- --ci --forceExit`
2. Run full backend test suite: `PYTHONPATH=backend pytest tests/backend -v --tb=short`
3. Run linting: `npm run lint && cd backend && uvx ruff check .`
4. Verify `package-lock.json` was regenerated (it will have changed due to dependency removal)

**Known limitations:** None. This phase is pure cleanup with no behavioral changes.
