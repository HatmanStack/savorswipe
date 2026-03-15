# Phase 0: Foundation

This phase documents architecture decisions, conventions, and strategies that apply to all subsequent phases.

---

## Architecture Decisions

### ADR-1: Structured Logger Migration Strategy

**Context:** The backend has a well-built `StructuredLogger` class in `backend/logger.py` that outputs CloudWatch Insights-friendly JSON. However, only `lambda_function.py` uses it. The remaining 6 backend files use 176 bare `print()` calls.

**Decision:** Migrate all `print()` calls to use `StructuredLogger`. Each backend module should instantiate its own logger with a descriptive component name (e.g., `StructuredLogger("upload")`, `StructuredLogger("ocr")`).

**Mapping convention:**
- `print(f"[TAG] message")` → `log.info("message", tag="TAG")`
- `print(f"[TAG ERROR] message")` → `log.error("message", tag="TAG")`
- `print(f"[TAG WARNING] message")` → `log.warning("message", tag="TAG")`
- `traceback.print_exc()` → `log.error("message", error=str(e), traceback=traceback.format_exc())`

### ADR-2: Hook Decomposition Pattern

**Context:** `frontend/hooks/useImageQueue.ts` is a 660-line "god hook" managing queue state, recipe injection, image picker modal state, recipe deletion, and refill logic with 10 refs and 8 effects.

**Decision:** Decompose into focused hooks following single-responsibility:
- `useQueueState` — queue array management, advance, refill, initialization
- `useRecipeInjection` — detecting new recipes in jsonData, injection with retry logic
- `useImagePicker` — image picker modal state, confirm/delete handlers

The parent `useImageQueue` hook composes these three and exposes the same public API (no consumers change).

### ADR-3: Recipe Key Generation Fix

**Context:** `backend/upload.py` uses `len(existing_data) + 1` to generate new recipe keys. After deletions, this produces collisions (e.g., 5 recipes, delete key "3", next insert uses key "5" which already exists).

**Decision:** Replace with `max(int(k) for k in existing_data.keys(), default=0) + 1`. This is safe because keys are always stringified integers.

### ADR-4: Non-Atomic Delete Rollback

**Context:** `backend/recipe_deletion.py` writes to `combined_data.json` first, then `recipe_embeddings.json`. If the second write fails, the system is in an inconsistent state with no rollback.

**Decision:** If the embeddings write fails after combined_data succeeds, re-read combined_data (fresh ETag), restore the deleted recipe, and write it back. Log the rollback. This is a best-effort rollback — if it also fails, log a critical error with enough context for manual recovery.

### ADR-5: Test Reset Pattern

**Context:** Integration tests in `tests/integration/upload-flow.test.ts` reach into `UploadService['jobQueue']` to reset private state, creating brittle coupling.

**Decision:** Add a static `_resetForTests()` method to `UploadService` that resets all internal state. Prefix with underscore to signal test-only usage. This is already partially done with `_setTestApiUrl()`.

---

## Tech Stack & Libraries

No new dependencies are introduced in this remediation. All work uses existing tools:

- **Frontend:** React Native / Expo, TypeScript, Jest
- **Backend:** Python 3.13, boto3, pytest, ruff
- **CI:** GitHub Actions
- **New dev tooling (to add):** Husky (pre-commit hooks), commitlint

---

## Testing Strategy

### Frontend Tests
- Run with `npm test -- --ci --forceExit`
- Mocking: Use `jest.mock()` for service dependencies
- New hook tests should use `renderHook` from `@testing-library/react-native`
- All hooks must be tested in isolation (not through component integration)

### Backend Tests
- Run with `PYTHONPATH=backend pytest tests/backend -v --tb=short`
- Mocking: Use `unittest.mock.patch` and `moto` for AWS services
- New tests for logger migration should verify log output structure (JSON format)
- Thread-safety tests should use `threading.Thread` to exercise concurrent access

### CI Compatibility
- All tests must run without live AWS credentials or API keys
- Backend tests use `moto` for S3 mocking
- Frontend tests use `jest.fn()` for service mocking
- No tests should depend on network access

---

## Commit Message Format

Use conventional commits:

```text
type(scope): brief description

- Detail 1
- Detail 2
```

Valid types: `fix`, `refactor`, `test`, `chore`, `docs`, `feat`

Valid scopes: `backend`, `frontend`, `ci`, `hooks`, `upload`, `search`, `ocr`, `deletion`

Examples:
- `refactor(backend): migrate print() calls to StructuredLogger in upload.py`
- `fix(backend): use max-key strategy for recipe key generation`
- `chore: remove unused aws-sdk and @modelcontextprotocol/sdk dependencies`
- `test(frontend): add _resetForTests() to UploadService`

---

## Shared Patterns

### Error Logging Pattern (Frontend)
Replace silent `catch` blocks with:
```typescript
catch (error) {
  console.error('[ComponentName] Description:', error);
}
```

### Structured Logger Instantiation (Backend)
Each module should create its logger at module level:
```python
from logger import StructuredLogger
log = StructuredLogger("module_name")
```

### Thread-Safety Pattern (Backend)
For lazy-initialized globals used with `ThreadPoolExecutor`:
```python
import threading
_lock = threading.Lock()
_client = None

def get_client():
    global _client
    if _client is None:
        with _lock:
            if _client is None:  # Double-checked locking
                _client = create_client()
    return _client
```
