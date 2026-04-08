# Phase 4 — [FORTIFIER] Operational Guardrails

Adds DLQ + OnFailure for the async invoke handoff, reserved concurrency, tighter throttling, deploy-time guards. Additive only.

## Task 4.1 — Async-invoke DLQ and OnFailure destination

**Goal:** Stop silently losing upload jobs when the self-invoke fails.

**Files:**

- `backend/template.yaml`
- `backend/routes/upload.py` (size guard before self-invoke)
- New: `tests/backend/test_async_invoke_guard.py`

**Prerequisites:** Phase 3 complete.

**Implementation Steps:**

1. In `backend/template.yaml` add an SQS dead-letter queue resource `UploadDLQ`. Attach via Lambda `DeadLetterConfig` and via `EventInvokeConfig.OnFailure` pointing at the DLQ. Configure retention 14d.
1. Add CloudWatch alarm `UploadDLQNotEmpty` (ApproximateNumberOfMessagesVisible > 0 for 1 datapoint of 1 minute).
1. In `backend/routes/upload.py`, before writing the pending payload to `upload-pending/` and self-invoking, validate `len(json.dumps(payload).encode())` against a configurable cap (`MAX_ASYNC_PAYLOAD_BYTES`, default 200_000 to stay under the 256 KB async limit with headroom). On overflow return a 413 with the standard error envelope and skip the S3 write.
1. Validate `os.environ["FUNCTION_NAME"]` exists BEFORE writing the pending payload; raise/return early if missing.
1. Add a janitor: existing `upload-pending/` lifecycle rule (S3 lifecycle, expire after 1 day) declared in template.
1. Add tests covering: oversized payload returns 413 and writes nothing; missing FUNCTION_NAME raises before S3 write.
1. Run `npm run test:backend`. Run `sam validate` (best-effort; document if not installed).

**Verification Checklist:**

- [ ] Template declares `UploadDLQ`, `DeadLetterConfig`, `EventInvokeConfig.OnFailure`, lifecycle rule
- [ ] FUNCTION_NAME validated before pending payload write
- [ ] Oversized payload short-circuits cleanly
- [ ] Tests green

**Testing Instructions:**

```bash
npm run test:backend
sam validate --template backend/template.yaml || true
```

**Commit Message Template:**

```text
feat(backend): add upload async-invoke DLQ and payload guards

Adds SQS DLQ wired through DeadLetterConfig and EventInvokeConfig
OnFailure for the upload self-invoke handoff. Validates FUNCTION_NAME
and async payload size before any S3 write so failures cannot leak
upload-pending blobs. Adds a 1-day lifecycle rule on upload-pending/.

Phase: 2026-04-07-audit-savorswipe/Phase-4
Refs: health-audit.md findings 4, 15; eval.md stress finding 1
```

## Task 4.2 — Reserved concurrency, throttling, deploy-mode guard

**Goal:** Cap blast radius on cost runaway and prevent dev-mode CORS in prod.

**Files:**

- `backend/template.yaml`
- `frontend/scripts/deploy.js`

**Prerequisites:** Task 4.1 done.

**Implementation Steps:**

1. Add `ReservedConcurrentExecutions: 10` (override-able via parameter) to the Lambda in `backend/template.yaml`.
1. Lower `ThrottlingRateLimit` from 1000 to 5 and `ThrottlingBurstLimit` to 10 in the API Gateway stage config.
1. Add a SAM `Conditions` block + `Rules` block (or a CloudFormation `AWS::CloudFormation::Macro`-free `!Equals` guard inside `Outputs`) that fails synthesis when `IsDevMode` is true AND the stack name contains `prod`. Simpler alternative: add a script-side guard in `frontend/scripts/deploy.js` that refuses to deploy with `IsDevMode=true` to a stack matching `/prod/i`, AND emits a warning otherwise.
1. Quote/escape `--parameter-overrides` keys built by `frontend/scripts/deploy.js:432` to handle shell-special characters.
1. Run `npm run test:backend` (should be unaffected) and `node frontend/scripts/deploy.js --help` smoke (no actual deploy).

**Verification Checklist:**

- [ ] Template has `ReservedConcurrentExecutions`
- [ ] Throttling lowered to 5 rps / burst 10
- [ ] Deploy script refuses prod + IsDevMode=true
- [ ] Parameter override quoting handles `;` and spaces
- [ ] Tests green

**Testing Instructions:**

```bash
npm run check
sam validate --template backend/template.yaml || true
```

**Commit Message Template:**

```text
feat(infra): cap concurrency, tighten throttling, gate dev-mode

Adds ReservedConcurrentExecutions=10 and lowers API Gateway
ThrottlingRateLimit to 5 rps / burst 10 to bound OpenAI cost blast
radius. Refuses deploys with IsDevMode=true to stacks matching
/prod/i and quotes SAM parameter-overrides keys.

Phase: 2026-04-07-audit-savorswipe/Phase-4
Refs: eval.md stress findings 6, 7; health-audit.md finding 20
```

## Task 4.3 — Shared HTTP session for outbound requests

**Goal:** Add a shared `requests.Session` with retry/backoff for backend outbound calls.

**Files:**

- New: `backend/http_client.py`
- `backend/embedding_generator.py` (line 62)
- `backend/image_uploader.py` (line 167)
- `tests/backend/test_http_client.py` (new)

**Prerequisites:** Task 4.2 done.

**Implementation Steps:**

1. Create `backend/http_client.py` exporting a module-scope `SESSION = requests.Session()` with a `HTTPAdapter` mounting `urllib3.util.Retry(total=3, backoff_factor=0.3, status_forcelist=[500, 502, 503, 504])`.
1. Replace `requests.get/post` calls in `embedding_generator.py` and `image_uploader.py` with `SESSION.get/post`. Preserve all existing SSRF guards in `image_uploader.py` (the `_PinnedHostnameAdapter` must still wrap the final adapter chain — verify).
1. Add tests using `requests-mock` covering: 503 retries succeed; 500 exhausts and raises; SSRF pin still enforced.
1. Run `npm run test:backend`.

**Verification Checklist:**

- [ ] No bare `requests.get`/`requests.post` in `backend/`
- [ ] SSRF pin chain still active in image_uploader
- [ ] Retry tests pass
- [ ] Backend tests green

**Testing Instructions:**

```bash
PYTHONPATH=backend pytest tests/backend/test_http_client.py -v
npm run test:backend
```

**Commit Message Template:**

```text
feat(backend): shared retrying HTTP session for outbound calls

Replaces ad-hoc requests.get/post with a module-scope Session
configured with backoff retries on 5xx. Preserves the
_PinnedHostnameAdapter SSRF chain in image_uploader.

Phase: 2026-04-07-audit-savorswipe/Phase-4
Refs: health-audit.md finding 16
```
