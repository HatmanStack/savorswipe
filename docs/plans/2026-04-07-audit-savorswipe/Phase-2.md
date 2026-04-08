# Phase 2 — [IMPLEMENTER] Critical Code Fixes

The three CRITICAL findings plus the route-table cleanup. Each task is a single atomic commit.

## Task 2.1 — Replace `gpt-5.2` model id with a real OpenAI model

**Goal:** Stop sending requests for a non-existent model. Centralize the model id so future swaps are one line.

**Files:**

- `backend/ocr.py` (lines 110, 128, 341, 517, 532)
- `backend/config.py` (add `OPENAI_VISION_MODEL` constant)
- `tests/backend/test_ocr.py` (or new file if missing)

**Prerequisites:** Phase 1 complete. `npm run check` green.

**Implementation Steps:**

1. Add `OPENAI_VISION_MODEL = os.environ.get("OPENAI_VISION_MODEL", "gpt-4o")` to `backend/config.py`. Choose `gpt-4o` as the default — it is the production-grade vision model available as of the May-2025 cutoff. Document the override env var in Phase 6.
1. In `backend/ocr.py`, import the constant and replace every `model="gpt-5.2"` with `model=OPENAI_VISION_MODEL`.
1. Reduce the per-call `timeout` from `120.0` to `60.0` (still generous for Vision OCR; halves worst-case Lambda burn).
1. Add a regression test that mocks the OpenAI client (use `requests-mock` or `pytest-mock`) and asserts the `model` kwarg matches `config.OPENAI_VISION_MODEL`.
1. Run `npm run test:backend`.

**Verification Checklist:**

- [x] `Grep` for `gpt-5.2` returns zero matches
- [x] All OCR call sites read from `config.OPENAI_VISION_MODEL`
- [x] New test asserts model kwarg
- [x] Backend tests green

**Testing Instructions:**

```bash
PYTHONPATH=backend pytest tests/backend/test_ocr.py -v
npm run test:backend
```

**Commit Message Template:**

```text
fix(backend): replace nonexistent gpt-5.2 model id with gpt-4o

Three OCR call sites hard-coded model="gpt-5.2", an identifier that
does not exist in the OpenAI catalog. Every upload silently 4xx-ed
and burned the full 120s per-call timeout. Centralizes the model id
in config.OPENAI_VISION_MODEL with env var override.

Phase: 2026-04-07-audit-savorswipe/Phase-2
Refs: health-audit.md finding 1 (CRITICAL)
```

## Task 2.2 — Hoist boto3 clients to module scope

**Goal:** Eliminate per-invocation `boto3.client(...)` re-instantiation across ~12 call sites.

**Files:**

- `backend/lambda_function.py` (lines 387, 453, 473, 520, 613, 831, 880, 1083, 1141, 1421, 1508, 1542)
- `backend/embeddings.py` (line 31)
- `backend/upload.py` (line 31)
- New: `backend/aws_clients.py`

**Prerequisites:** Task 2.1 done.

**Implementation Steps:**

1. Create `backend/aws_clients.py` exporting module-scope singletons:

   ```python
   import boto3
   S3 = boto3.client("s3")
   LAMBDA = boto3.client("lambda")
   CLOUDWATCH = boto3.client("cloudwatch")
   ```

1. In each listed file replace `boto3.client('s3')` with `from backend.aws_clients import S3` and use `S3` directly. Same for `lambda` and `cloudwatch`.
1. Remove the duplicate client construction inside `handle_post_image_request` (currently constructed twice in one request).
1. Update `tests/backend/conftest.py` so moto fixtures patch `backend.aws_clients.S3` (etc.) rather than per-handler clients. Use `monkeypatch` to rebind after `mock_aws()` enters.
1. Run `npm run test:backend`.

**Verification Checklist:**

- [x] `Grep "boto3.client" backend/` returns only `backend/aws_clients.py`
- [x] `handle_post_image_request` constructs zero clients
- [x] Moto-backed tests still pass
- [x] Backend tests green

**Testing Instructions:**

```bash
npm run test:backend
```

**Commit Message Template:**

```text
perf(backend): hoist boto3 clients to module scope

Per-invocation boto3.client() construction was costing 200-400ms of
cold-start CPU and defeating Lambda container reuse. Centralizes S3,
Lambda, and CloudWatch clients in backend/aws_clients.py and updates
moto fixtures to patch the singletons.

Phase: 2026-04-07-audit-savorswipe/Phase-2
Refs: health-audit.md finding 3 (CRITICAL)
```

## Task 2.3 — Replace substring router with a route table

**Goal:** Eliminate substring path matching, document routes in one place, ready the dispatcher for the Phase 3 split.

**Files:**

- `backend/lambda_function.py` (lines 266-350: `lambda_handler` dispatch)
- New: `backend/routes.py`
- `tests/backend/test_routing.py` (new)

**Prerequisites:** Task 2.2 done.

**Implementation Steps:**

1. Create `backend/routes.py` with a `ROUTES` list of tuples `(method, regex_pattern, handler_name)`. Use `re.compile(r"^/recipe/(?P<recipe_key>[^/]+)$")` style patterns to capture path params.
1. Implement `dispatch(method, path) -> (handler_name, path_params)` returning `None` on miss.
1. In `lambda_handler`, call `dispatch(method, path)`. On miss return 404 with the standard error envelope. On hit, look up the handler and pass `path_params` as kwargs.
1. Move async-invoke detection (`event.get("async_invoke")`) into a separate branch executed before route dispatch.
1. Add `tests/backend/test_routing.py` covering: each documented route resolves; `/foo/image` does NOT match `/recipe/{key}/image`; trailing slash handling; unknown method returns 405.
1. Run `npm run test:backend`.

**Verification Checklist:**

- [x] Zero `'/image' in request_path`-style substring checks remain in `lambda_function.py`
- [x] All 5 documented routes covered by `ROUTES`
- [x] New routing tests pass
- [x] Backend tests green

**Testing Instructions:**

```bash
PYTHONPATH=backend pytest tests/backend/test_routing.py -v
npm run test:backend
```

**Commit Message Template:**

```text
refactor(backend): replace substring router with explicit route table

Moves dispatch into backend/routes.py with regex-based path matching
and parameter extraction. Eliminates substring false positives like
/foo/image matching /recipe/{key}/image and prepares lambda_function
for the upcoming module split.

Phase: 2026-04-07-audit-savorswipe/Phase-2
Refs: health-audit.md finding 6
```
