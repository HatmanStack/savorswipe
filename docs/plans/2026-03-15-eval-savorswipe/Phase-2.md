# Phase 2: Code Quality & Defensiveness

## Phase Goal

Fix backend logging debt (176 `print()` calls), thread-safety issues, silent error swallowing, non-atomic delete rollback, unsafe variable checks, and frontend code smells. This phase targets Code Quality (7/10 to 9/10), Defensiveness (7/10 to 9/10), and Creativity (8/10 to 9/10).

**Success criteria:** Zero bare `print()` calls in backend production code, all silent catch blocks log errors, two-file delete has rollback, thread-safe OCR client initialization, IIFE pattern removed, `Record<string, any>` replaced with proper type, error mapping refactored to declarative pattern.

**Estimated tokens:** ~45,000

## Prerequisites

- Phase 1 completed (dead code removed)
- Phase 0 read and understood (especially ADR-1 logger migration, ADR-4 rollback, thread-safety pattern)

---

## Tasks

### Task 1: Migrate print() Calls in backend/handlepdf.py

**Goal:** Replace 5 `print()` calls with `StructuredLogger` from `backend/logger.py`. This is the smallest backend file with print calls, making it a good starting point to establish the pattern.

**Files to Modify:**
- `backend/handlepdf.py` — Replace all `print()` calls with structured logger

**Prerequisites:**
- Read `backend/logger.py` to understand the `StructuredLogger` API (see Phase 0, ADR-1)

**Implementation Steps:**
1. Add import at top of file: `from logger import StructuredLogger`
2. Create logger instance at module level: `log = StructuredLogger("pdf")`
3. Replace each `print()` call using the mapping from Phase 0:
   - `print(f'[PDF] Opened PDF with {total_pages} pages')` becomes `log.info("Opened PDF", total_pages=total_pages)`
   - `print(f'[PDF] Rejecting: ...')` becomes `log.warning("Rejecting PDF: exceeds page limit", total_pages=total_pages, limit=PDF_MAX_PAGES)`
   - `print('[PDF] Page count OK')` becomes `log.info("Page count OK")`
   - `print('PDF Pages Saved and Encoded')` becomes `log.info("PDF pages saved and encoded")`
   - `print(f'[PDF ERROR] Failed to process PDF: {e}')` becomes `log.error("Failed to process PDF", error=str(e))`
4. Remove any now-unnecessary string formatting (f-strings with `[PDF]` prefixes).
5. Run: `cd backend && uvx ruff check handlepdf.py`

**Verification Checklist:**
- [ ] Zero `print()` calls in `handlepdf.py`
- [ ] `from logger import StructuredLogger` present
- [ ] `log = StructuredLogger("pdf")` at module level
- [ ] `ruff check handlepdf.py` passes
- [ ] `PYTHONPATH=backend pytest tests/backend -v --tb=short` passes

**Testing Instructions:**
- Run existing backend tests. No new tests needed for this file (logging is a cross-cutting concern tested via integration).
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
refactor(backend): migrate print() to StructuredLogger in handlepdf.py

- Replace 5 print() calls with structured JSON logging
- Use StructuredLogger("pdf") component name
```

---

### Task 2: Migrate print() Calls in backend/fix_ingredients.py

**Goal:** Replace 6 `print()` calls with `StructuredLogger`.

**Files to Modify:**
- `backend/fix_ingredients.py` — Replace all `print()` calls

**Prerequisites:**
- Task 1 completed (pattern established)

**Implementation Steps:**
1. Add import: `from logger import StructuredLogger`
2. Create logger: `log = StructuredLogger("ingredients")`
3. Replace each `print()` following the Phase 0 mapping convention. Use `log.info()` for informational messages, `log.warning()` for warnings, `log.error()` for errors.
4. Run: `cd backend && uvx ruff check fix_ingredients.py`

**Verification Checklist:**
- [ ] Zero `print()` calls in `fix_ingredients.py`
- [ ] `ruff check fix_ingredients.py` passes
- [ ] Backend tests pass

**Testing Instructions:**
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
refactor(backend): migrate print() to StructuredLogger in fix_ingredients.py

- Replace 6 print() calls with structured JSON logging
- Use StructuredLogger("ingredients") component name
```

---

### Task 3: Migrate print() Calls in backend/ocr.py

**Goal:** Replace 11 `print()` calls with `StructuredLogger`. Also fix thread-safety of global `client` variable using double-checked locking pattern from Phase 0.

**Files to Modify:**
- `backend/ocr.py` — Replace `print()` calls and fix thread-safety

**Prerequisites:**
- Phase 0 thread-safety pattern (ADR and shared patterns section)

**Implementation Steps:**
1. Add imports: `from logger import StructuredLogger` and `import threading`
2. Create logger: `log = StructuredLogger("ocr")`
3. Fix thread-safety of `client` initialization:
   - Rename module-level `client = None` to `_client = None`
   - Add `_lock = threading.Lock()` at module level
   - Rewrite `get_client()` using double-checked locking pattern from Phase 0:
     ```python
     def get_client():
         global _client
         if _client is None:
             with _lock:
                 if _client is None:
                     api_key = os.getenv('API_KEY')
                     if api_key:
                         _client = OpenAI(api_key=api_key)
                     else:
                         raise ValueError("API_KEY environment variable not set. Mock get_client() in tests.")
         return _client
     ```
4. Replace all `print()` calls with appropriate `log.info()`, `log.error()`, or `log.warning()` calls.
5. Replace `traceback.print_exc()` calls with `log.error("message", error=str(e), traceback=traceback.format_exc())`.
6. Run linting and tests.

**Verification Checklist:**
- [ ] Zero `print()` calls in `ocr.py`
- [ ] `_lock = threading.Lock()` present at module level
- [ ] `get_client()` uses double-checked locking
- [ ] No bare `traceback.print_exc()` calls
- [ ] `ruff check ocr.py` passes
- [ ] Backend tests pass

**Testing Instructions:**
- Run existing tests: `PYTHONPATH=backend pytest tests/backend -v --tb=short`
- Consider adding a unit test for thread-safety: create two threads that call `get_client()` concurrently with a mocked `OpenAI` constructor, verify the constructor is called exactly once.

**Commit Message Template:**
```
fix(backend): add thread-safe client init and structured logging in ocr.py

- Replace 11 print() calls with StructuredLogger
- Fix thread-unsafe global client with double-checked locking
- Replace traceback.print_exc() with structured error logging
```

---

### Task 4: Migrate print() Calls in backend/search_image.py

**Goal:** Replace 29 `print()` calls with `StructuredLogger`. Note that this file already uses Python's `logging` module for some functions (`validate_image_urls`) but `print()` for others. Unify all logging through `StructuredLogger`.

**Files to Modify:**
- `backend/search_image.py` — Replace `print()` calls and migrate `logging` module usage

**Prerequisites:**
- None

**Implementation Steps:**
1. Add import: `from logger import StructuredLogger`
2. Create logger: `log = StructuredLogger("search")`
3. Remove existing `import logging`, `logging.basicConfig(...)`, and `logger = logging.getLogger(__name__)` lines.
4. Replace all `print()` calls with `log.info()`, `log.warning()`, or `log.error()` as appropriate.
5. Replace all `logger.info(...)`, `logger.warning(...)`, `logger.error(...)` calls from the old stdlib logger with the new `log.info()`, `log.warning()`, `log.error()` calls.
6. Run linting and tests.

**Verification Checklist:**
- [ ] Zero `print()` calls in `search_image.py`
- [ ] No `import logging` or stdlib `logger` usage
- [ ] `from logger import StructuredLogger` present
- [ ] `ruff check search_image.py` passes
- [ ] Backend tests pass

**Testing Instructions:**
- Run: `PYTHONPATH=backend pytest tests/backend/test_search_image.py -v --tb=short`
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
refactor(backend): migrate print() and stdlib logging to StructuredLogger in search_image.py

- Replace 29 print() calls with structured JSON logging
- Unify with StructuredLogger("search") component
- Remove stdlib logging.basicConfig and getLogger
```

---

### Task 5: Migrate print() Calls in backend/upload.py

**Goal:** Replace 53 `print()` calls with `StructuredLogger`. This is the second-largest file by print count.

**Files to Modify:**
- `backend/upload.py` — Replace all `print()` calls

**Prerequisites:**
- None

**Implementation Steps:**
1. Add import: `from logger import StructuredLogger`
2. Create logger: `log = StructuredLogger("upload")`
3. Replace all 53 `print()` calls with appropriate structured logger calls.
4. Key mappings:
   - `print(f"[UPLOAD] Starting image upload for recipe key {highest_key}")` becomes `log.info("Starting image upload", recipe_key=highest_key)`
   - `print(f"[UPLOAD ERROR] ...")` becomes `log.error("...", ...)`
   - `print(f"[UPLOAD WARNING] ...")` becomes `log.warning("...", ...)`
5. Extract structured data from f-strings into keyword arguments where possible.
6. Run linting and tests.

**Verification Checklist:**
- [ ] Zero `print()` calls in `upload.py`
- [ ] `from logger import StructuredLogger` present
- [ ] `ruff check upload.py` passes
- [ ] `PYTHONPATH=backend pytest tests/backend/test_upload.py -v --tb=short` passes

**Testing Instructions:**
- Run: `PYTHONPATH=backend pytest tests/backend/test_upload.py -v --tb=short`
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
refactor(backend): migrate print() to StructuredLogger in upload.py

- Replace 53 print() calls with structured JSON logging
- Use StructuredLogger("upload") component name
- Extract structured data into keyword arguments
```

---

### Task 6: Migrate print() Calls in backend/lambda_function.py

**Goal:** Replace 72 `print()` calls with `StructuredLogger`. This file already uses `StructuredLogger` (as `log`) for some operations — extend usage to cover all remaining `print()` calls.

**Files to Modify:**
- `backend/lambda_function.py` — Replace remaining `print()` calls

**Prerequisites:**
- None

**Implementation Steps:**
1. This file already has a `log` variable from `StructuredLogger`. Verify: search for existing `StructuredLogger` or `get_logger` import and instance.
2. Replace all remaining `print()` calls with the existing `log` instance.
3. Replace `traceback.print_exc()` with `log.error("...", traceback=traceback.format_exc())`.
4. Fix the `'s3_path' in dir()` check at line ~1080: initialize `s3_path = None` before the `try` block (around line 877), then change `if 's3_path' in dir() and s3_path:` to `if s3_path:`.
5. Add logging for silent OCR parse failure at line ~1305: change `except json.JSONDecodeError: pass` to:
   ```python
   except json.JSONDecodeError:
       log.warning("Failed to parse OCR result as JSON", file_index=file_idx)
   ```
6. Run linting and tests.

**Verification Checklist:**
- [ ] Zero `print()` calls in `lambda_function.py`
- [ ] No `traceback.print_exc()` calls
- [ ] `s3_path = None` initialized before try block
- [ ] `if 's3_path' in dir()` replaced with `if s3_path:`
- [ ] `json.JSONDecodeError` in OCR parsing now logs a warning
- [ ] `ruff check lambda_function.py` passes
- [ ] Backend tests pass

**Testing Instructions:**
- Run: `PYTHONPATH=backend pytest tests/backend/test_lambda_function.py -v --tb=short`
- Run: `PYTHONPATH=backend pytest tests/backend -v --tb=short`

**Commit Message Template:**
```
fix(backend): complete StructuredLogger migration and fix silent failures in lambda_function.py

- Replace 72 remaining print() calls with structured logging
- Initialize s3_path = None before try block (was using 'in dir()' check)
- Add logging for silent OCR JSON parse failures
- Replace traceback.print_exc() with structured error logging
```

---

### Task 7: Add Rollback to Non-Atomic Two-File Delete

**Goal:** Implement rollback in `backend/recipe_deletion.py` when the embeddings write fails after combined_data write succeeds. Currently, this leaves the system in an inconsistent state (recipe deleted from data but embedding persists). This addresses Defensiveness.

**Files to Modify:**
- `backend/recipe_deletion.py` — Add rollback logic after embeddings write failure

**Prerequisites:**
- Phase 0 ADR-4 (rollback strategy)

**Implementation Steps:**
1. In the `delete_recipe_atomic` function, after the combined_data write succeeds (Step 4) and the embeddings write fails (Step 5), add rollback logic:
   - If embeddings `PreconditionFailed` and we've exhausted retries, or if a non-precondition error occurs:
     a. Re-read `combined_data.json` from S3 (fresh read with new ETag)
     b. Restore the deleted recipe to the dictionary
     c. Write it back with the new ETag as a conditional put
     d. Log the rollback attempt and result
2. Replace the existing `logging` module usage with `StructuredLogger` (this file uses stdlib `logging`):
   - Replace `import logging`, `logging.basicConfig(...)`, `logger = logging.getLogger(__name__)` with `from logger import StructuredLogger` and `log = StructuredLogger("deletion")`
   - Replace all `logger.info(...)`, `logger.warning(...)`, `logger.error(...)` with `log.info(...)`, `log.warning(...)`, `log.error(...)`
3. The rollback is best-effort: if the rollback itself fails, log a critical error with the recipe key and the original recipe data so it can be manually recovered.

**Verification Checklist:**
- [ ] Rollback code exists after embeddings write failure
- [ ] Rollback re-reads combined_data with fresh ETag
- [ ] Rollback restores the recipe and writes back
- [ ] Failure of rollback logs error with recipe key and data
- [ ] `StructuredLogger` used instead of stdlib `logging`
- [ ] `ruff check recipe_deletion.py` passes
- [ ] Existing tests pass
- [ ] New test added for rollback scenario

**Testing Instructions:**
- Add test in `tests/backend/test_recipe_deletion.py`:
  1. **Test rollback on embeddings failure:** Mock S3 so combined_data write succeeds but embeddings write raises `PreconditionFailed` on all retries. Verify that combined_data is restored (recipe still present after the function returns).
  2. **Test rollback failure logging:** Mock S3 so both embeddings and the rollback write fail. Verify the function returns `(False, error_message)` and doesn't raise.
- Run: `PYTHONPATH=backend pytest tests/backend/test_recipe_deletion.py -v --tb=short`

**Commit Message Template:**
```
fix(backend): add rollback for non-atomic two-file delete in recipe_deletion.py

- If embeddings write fails after combined_data succeeds, restore recipe
- Best-effort rollback with critical error logging on failure
- Migrate stdlib logging to StructuredLogger
```

---

### Task 8: Add Error Logging to Silent Catches in UploadService

**Goal:** Replace silent `catch (error) {}` blocks in `frontend/services/UploadService.ts` with `console.error` logging. This addresses Defensiveness.

**Files to Modify:**
- `frontend/services/UploadService.ts` — Add error logging to lines 379 and 383

**Prerequisites:**
- None

**Implementation Steps:**
1. At line 379, the `notifySubscribers` method has `catch (error) {}`. Replace with:
   ```typescript
   catch (error) {
     console.error('[UploadService] Subscriber notification failed:', error);
   }
   ```
2. At line 383, `.catch(() => {})` on `UploadPersistence.saveQueue`. Replace with:
   ```typescript
   .catch((error) => {
     console.error('[UploadService] Queue persistence failed:', error);
   })
   ```
3. Run frontend tests.

**Verification Checklist:**
- [ ] No empty `catch` blocks in `UploadService.ts`
- [ ] Both catch blocks log with `console.error`
- [ ] `npm test -- --ci --forceExit` passes
- [ ] `npm run lint` passes

**Testing Instructions:**
- Run: `npm test -- --ci --forceExit --testPathPattern=UploadService`
- Run: `npm run lint`

**Commit Message Template:**
```
fix(frontend): add error logging to silent catches in UploadService

- Log subscriber notification failures instead of swallowing
- Log queue persistence failures instead of swallowing
```

---

### Task 9: Remove IIFE Pattern in index.tsx

**Goal:** Remove unnecessary IIFE (Immediately Invoked Function Expression) wrapping `ImagePickerModal` in `frontend/app/index.tsx`. The `{(() => { return (<Component />); })()}` pattern adds indirection with no benefit. This addresses Code Quality.

**Files to Modify:**
- `frontend/app/index.tsx` — Replace IIFE with direct JSX

**Prerequisites:**
- None

**Implementation Steps:**
1. Find two occurrences of the IIFE pattern. They look like:
   ```tsx
   {(() => {
     return (
       <ImagePickerModal ... />
     );
   })()}
   ```
2. Replace each with just the component directly:
   ```tsx
   <ImagePickerModal ... />
   ```
3. Run frontend tests and lint.

**Verification Checklist:**
- [ ] No `{(() => {` patterns in `index.tsx`
- [ ] `ImagePickerModal` is rendered directly as JSX in both locations
- [ ] `npm test -- --ci --forceExit` passes
- [ ] `npm run lint` passes

**Testing Instructions:**
- Run: `npm test -- --ci --forceExit --testPathPattern=index`
- Run: `npm run lint`

**Commit Message Template:**
```
refactor(frontend): remove unnecessary IIFE wrapping ImagePickerModal

- Replace {(() => { return (<Component />); })()} with direct JSX
- Remove indirection in both loading and main render paths
```

---

### Task 10: Replace Record<string, any> in IngredientScalingService

**Goal:** Replace the single `Record<string, any>` type escape hatch in `frontend/services/IngredientScalingService.ts:336` with a proper type. This addresses Code Quality and Type Rigor.

**Files to Modify:**
- `frontend/services/IngredientScalingService.ts` — Replace `Record<string, any>` with proper type

**Prerequisites:**
- Read the `ScalableIngredients` type and understand the recursive structure

**Implementation Steps:**
1. Look at line 336: `const scaled: Record<string, any> = {};`. This is in the "raw object format" branch that handles backward compatibility.
2. The `scaled` object is built by iterating entries and either recursively calling `scaleIngredients` (for nested sections) or scaling strings. The values are either `ScalableIngredients` (from recursion) or `string` (from scaling).
3. Replace `Record<string, any>` with `Record<string, string | ScalableIngredients>` or define a local type alias if `ScalableIngredients` already captures this. Check the type definition to find the most accurate type.
4. Ensure TypeScript compiles without errors: `cd frontend && npx tsc --noEmit`

**Verification Checklist:**
- [ ] No `any` type in `IngredientScalingService.ts` (search for `: any`)
- [ ] `npx tsc --noEmit` passes from `frontend/` directory
- [ ] `npm test -- --ci --forceExit --testPathPattern=IngredientScaling` passes
- [ ] `npm run lint` passes

**Testing Instructions:**
- Run: `npm test -- --ci --forceExit --testPathPattern=IngredientScaling`
- Run: `npm run lint`

**Commit Message Template:**
```
fix(frontend): replace Record<string, any> with proper type in IngredientScalingService

- Use Record<string, string | ScalableIngredients> for type-safe scaling
- Eliminates the only 'any' usage in non-test production code
```

---

### Task 11: Refactor transformErrorMessage to Declarative Pattern

**Goal:** Refactor the `transformErrorMessage` function in `frontend/hooks/useImageQueue.ts` from a chain of if/else statements to a declarative array of `{ pattern: RegExp, message: string }`. This addresses Creativity.

**Files to Modify:**
- `frontend/hooks/useImageQueue.ts` — Refactor `transformErrorMessage` (lines 35-74)

**Prerequisites:**
- None

**Implementation Steps:**
1. Define a constant array at the top of the file (before the function):
   ```typescript
   const ERROR_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
     { pattern: /timeout|request timeout/i, message: 'Taking longer than expected. Please check your internet and try again.' },
     { pattern: /recipe not found|404/i, message: 'Recipe not found. It may have been deleted.' },
     { pattern: /invalid image url|invalid url|400/i, message: "Image couldn't be loaded. Please select another image." },
     { pattern: /500|server error/i, message: 'Server error. Please try again later.' },
     { pattern: /fetch image from google/i, message: "Image couldn't be loaded from source. Please select another image." },
     { pattern: /network|failed/i, message: 'Unable to connect. Please check your internet connection.' },
   ] as const;
   ```
2. Rewrite `transformErrorMessage` to iterate through the array:
   ```typescript
   function transformErrorMessage(rawError: string): string {
     const match = ERROR_PATTERNS.find(({ pattern }) => pattern.test(rawError));
     return match?.message ?? 'An error occurred. Please try again.';
   }
   ```
3. Run tests to verify behavior is unchanged.

**Verification Checklist:**
- [ ] `ERROR_PATTERNS` array defined with all 6 patterns
- [ ] `transformErrorMessage` uses `.find()` instead of if/else chain
- [ ] Function returns same results for same inputs (test coverage)
- [ ] `npm test -- --ci --forceExit` passes
- [ ] `npm run lint` passes

**Testing Instructions:**
- Existing tests in `frontend/hooks/__tests__/useImageQueue.test.ts` should cover error transformation if they exist. If not, the refactor is behavior-preserving so existing integration tests suffice.
- Run: `npm test -- --ci --forceExit`

**Commit Message Template:**
```
refactor(frontend): convert transformErrorMessage to declarative pattern array

- Replace if/else chain with ERROR_PATTERNS array + .find()
- Easier to extend with new error patterns
- Behavior unchanged
```

---

### Task 12: Fix Recipe Key Generation in upload.py

**Goal:** Fix recipe key generation that uses `len(existing_data) + 1` instead of `max(keys) + 1`. After deletions, the current approach produces key collisions. This addresses Architecture and Defensiveness.

**Files to Modify:**
- `backend/upload.py` — Fix key generation in `to_s3` (line ~81) and `batch_to_s3_atomic` (line ~333)

**Prerequisites:**
- Phase 0 ADR-3

**Implementation Steps:**
1. In `to_s3` function, find `highest_key = len(existing_data_json) + 1` (line ~81). Replace with:
   ```python
   highest_key = max((int(k) for k in existing_data_json.keys()), default=0) + 1
   ```
2. In `batch_to_s3_atomic` function, find `highest_key = len(existing_data)` (line ~333). Replace with:
   ```python
   highest_key = max((int(k) for k in existing_data.keys()), default=0)
   ```
   (Note: The `+ 1` happens later at `next_key = highest_key + 1`)
3. Also fix the `else` branch in `batch_to_s3_atomic` where `highest_key = 0` — this is already correct for the empty case since `default=0` handles it.
4. Run backend tests.

**Verification Checklist:**
- [ ] `len(existing_data_json) + 1` no longer appears in `upload.py`
- [ ] `len(existing_data)` for key generation no longer appears in `upload.py`
- [ ] `max(int(k) for k in ...)` used in both locations
- [ ] Backend tests pass
- [ ] `ruff check upload.py` passes

**Testing Instructions:**
- Add test in `tests/backend/test_upload.py`:
  1. **Test key generation after deletion:** Create mock S3 with recipes keyed `{"1": ..., "3": ..., "5": ...}` (simulating deletions of 2 and 4). Call `to_s3` with a new recipe. Verify the new key is `"6"` (max + 1), not `"4"` (len + 1).
  2. **Test batch key generation after deletion:** Same scenario with `batch_to_s3_atomic`. Verify keys start from `6`.
- Run: `PYTHONPATH=backend pytest tests/backend/test_upload.py -v --tb=short`

**Commit Message Template:**
```
fix(backend): use max-key strategy for recipe key generation

- Replace len(data) + 1 with max(int(k) for k in data.keys()) + 1
- Prevents key collisions after recipe deletions
- Fix in both to_s3 and batch_to_s3_atomic functions
```

---

### Task 13: Add _resetForTests() to UploadService

**Goal:** Add a `_resetForTests()` static method to `UploadService` and update integration tests to use it instead of reaching into private fields. This addresses Test Value.

**Files to Modify:**
- `frontend/services/UploadService.ts` — Add `_resetForTests()` method
- `tests/integration/upload-flow.test.ts` — Use `_resetForTests()` instead of private field access

**Prerequisites:**
- Phase 0 ADR-5

**Implementation Steps:**
1. In `UploadService`, add a static method after `_setTestApiUrl`:
   ```typescript
   /**
    * Test-only method to reset all internal state
    * @internal
    */
   static _resetForTests(): void {
     this.jobQueue = [];
     this.currentJobId = null;
     this.isProcessing = false;
     this.subscribers = new Set();
     this._testApiUrl = null;
   }
   ```
2. In `tests/integration/upload-flow.test.ts`, replace the `beforeEach` block's manual state reset:
   ```typescript
   // Before:
   UploadService['jobQueue'] = []
   UploadService['currentJobId'] = null
   UploadService['isProcessing'] = false
   UploadService['subscribers'] = new Set()

   // After:
   UploadService._resetForTests()
   ```
3. Keep `UploadService._setTestApiUrl('https://mock-api-url.com')` as a separate call after `_resetForTests()` (since `_resetForTests` clears the test URL too).
4. Search the entire test suite for other instances of `UploadService['...']` private access and replace similarly.
5. Run tests.

**Verification Checklist:**
- [ ] `_resetForTests()` method exists in `UploadService`
- [ ] No `UploadService['jobQueue']` or similar private field access in test files
- [ ] `npm test -- --ci --forceExit` passes
- [ ] `npm run lint` passes

**Testing Instructions:**
- Run: `npm test -- --ci --forceExit --testPathPattern=upload`
- Run: `npm test -- --ci --forceExit`

**Commit Message Template:**
```
test(frontend): add _resetForTests() to UploadService

- Add static method to reset all internal state for testing
- Replace private field access in integration tests
- Reduces brittle coupling between tests and implementation
```

---

## Phase Verification

After completing all 13 tasks:

1. Verify zero `print()` calls in backend production code:
   - `grep -rn "^\s*print(" backend/*.py` should return zero results (excluding any `__main__` blocks if present)
2. Run full backend test suite: `PYTHONPATH=backend pytest tests/backend -v --tb=short`
3. Run full frontend test suite: `npm test -- --ci --forceExit`
4. Run all linting: `npm run lint && cd backend && uvx ruff check .`
5. Verify no `any` types in non-test frontend code: search `IngredientScalingService.ts` for `: any`
6. Verify no empty catch blocks in `UploadService.ts`

**Known limitations:**
- The rollback in `recipe_deletion.py` is best-effort. If both the embeddings write and the rollback fail, manual intervention is needed (logged with critical error).
- The `StructuredLogger` migration changes log output format from plain text to JSON. CloudWatch dashboards or log filters based on plain text patterns will need updating (out of scope for this plan).
