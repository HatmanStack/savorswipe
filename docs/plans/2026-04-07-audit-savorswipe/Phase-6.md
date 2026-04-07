# Phase 6 — [DOC-ENGINEER] Documentation Reconciliation

Brings every doc back into agreement with the post-Phase-5 codebase. Adds markdownlint + lychee to keep them honest.

## Task 6.1 — Fix version, runtime, and policy drift

**Goal:** Eliminate the 6 drift findings from `doc-audit.md`.

**Files:**

- `README.md` (Expo version, Node LTS, default stack name + region)
- `docs/README.md` (Expo version)
- `CONTRIBUTING.md` (uv install policy, Node LTS)
- `docs/DEPLOYMENT.md` (stack name `savorswipe`, region `us-east-1`, replace `pip install aws-sam-cli` with `uvx aws-sam-cli` or `uv pip install aws-sam-cli`)
- `CLAUDE.md` (`npm test` description: drop "watch mode" claim)
- `package.json` (bump `version` to match `CHANGELOG.md` `[1.1.0]`)

**Prerequisites:** Phase 5 complete.

**Implementation Steps:**

1. `README.md`: change "Expo 54" -> "Expo 55", "Node v24 LTS" -> "Node v22 LTS (current LTS)".
1. `docs/README.md`: same Expo bump.
1. `CONTRIBUTING.md`: replace `pip install -r requirements.txt && pip install -e ".[dev]"` with `cd backend && uv sync --frozen`. Add a one-liner: "Never use bare `pip` — this project uses `uv`."
1. `docs/DEPLOYMENT.md`: replace every `savorswipe-lambda` with `savorswipe`, every `us-west-2` with `us-east-1`, replace `pip install aws-sam-cli` with `uvx --from aws-sam-cli sam --version`.
1. `CLAUDE.md`: change `npm test` description from "Jest frontend tests (watch mode)" to "Jest frontend tests (one-shot, --forceExit)".
1. `package.json`: bump `version` to `1.1.0` to match CHANGELOG.
1. Run `npx markdownlint docs/ README.md CONTRIBUTING.md CLAUDE.md` (after Task 6.4 sets it up — run only after 6.4 if not yet installed).

**Verification Checklist:**

- [ ] No "Expo 54" references remain
- [ ] No "v24 LTS" references remain
- [ ] No bare `pip install` references remain
- [ ] No `savorswipe-lambda` references remain
- [ ] `package.json` version matches CHANGELOG

**Testing Instructions:**

```bash
grep -rn "Expo 54\|v24 LTS\|savorswipe-lambda\|us-west-2\|pip install " README.md CONTRIBUTING.md CLAUDE.md docs/
```

**Commit Message Template:**

```text
docs: fix Expo, Node, region, stack name, and uv-policy drift

Aligns README, docs/README, CONTRIBUTING, DEPLOYMENT, and CLAUDE.md
with current code (Expo 55, Node 22 LTS, default stack savorswipe,
region us-east-1, uv-only Python installs) and bumps package.json
to match CHANGELOG 1.1.0.

Phase: 2026-04-07-audit-savorswipe/Phase-6
Refs: doc-audit.md drift 1-6, stale 1-2, structure 3
```

## Task 6.2 — Document missing env vars and routes

**Goal:** Close the 4 doc gaps.

**Files:**

- `CLAUDE.md` (env var section)
- `.env.example`
- `docs/DEPLOYMENT.md` (routes section + env section)
- `README.md` (scripts section)

**Prerequisites:** Task 6.1 done.

**Implementation Steps:**

1. Add to `CLAUDE.md` Backend env var list: `OPENAI_VISION_MODEL` (added in Phase 2), `SIMILARITY_THRESHOLD`, `PDF_MAX_PAGES`, `MAX_RETRIES`, `FUNCTION_NAME`, `MAX_ASYNC_PAYLOAD_BYTES`, `RECIPE_BUDGET_SECONDS`. Drop `DEBUG_MODE` and `NEW_RECIPE_HOURS` (deleted in Phase 1).
1. Mirror the same list (sans secrets) into `.env.example` with placeholder values.
1. Add to `.env.example` and frontend env section: `EXPO_PUBLIC_UPLOAD_URL`.
1. In `docs/DEPLOYMENT.md` API routes section list all 5 routes, including `GET /upload/status/{jobId}`. Reconcile with `CLAUDE.md` so both list the same 5.
1. In `README.md` scripts section document `npm run sitemap` and `npm run sitemap:api`.

**Verification Checklist:**

- [ ] All env vars documented in CLAUDE.md and .env.example
- [ ] All 5 routes documented in DEPLOYMENT.md and CLAUDE.md and they match
- [ ] sitemap scripts documented in README

**Testing Instructions:**

```bash
grep -c "GET /upload/status" CLAUDE.md docs/DEPLOYMENT.md
```

**Commit Message Template:**

```text
docs: document missing env vars, routes, and scripts

Adds OPENAI_VISION_MODEL, SIMILARITY_THRESHOLD, PDF_MAX_PAGES,
MAX_RETRIES, FUNCTION_NAME, MAX_ASYNC_PAYLOAD_BYTES,
RECIPE_BUDGET_SECONDS, and EXPO_PUBLIC_UPLOAD_URL. Reconciles route
lists across CLAUDE.md and DEPLOYMENT.md. Documents sitemap scripts.

Phase: 2026-04-07-audit-savorswipe/Phase-6
Refs: doc-audit.md gaps 1-4, structure 1, config drift
```

## Task 6.3 — Add ARCHITECTURE.md and onboarding polish

**Goal:** Address Day-2 onboarding gaps with a small architecture doc and starter-issue convention.

**Files:**

- New: `docs/ARCHITECTURE.md`
- `CONTRIBUTING.md` (good-first-issue convention)
- `docs/DEPLOYMENT.md` (add `sam local invoke` section)

**Prerequisites:** Task 6.2 done.

**Implementation Steps:**

1. Create `docs/ARCHITECTURE.md` (one page) with: (a) component diagram in Mermaid (Frontend Expo, RecipeContext, ImageQueueService, RecipeService -> API Gateway -> Lambda dispatcher -> route modules -> S3/CloudFront/OpenAI/Google), (b) upload flow sequence diagram, (c) data layout in S3.
1. Add a "Good first issue" convention section to `CONTRIBUTING.md` describing the label and what qualifies.
1. Add a `sam local invoke` snippet to `docs/DEPLOYMENT.md` showing how to test a single route locally.
1. Mark or move `backend/deploy.sh` reference in `docs/DEPLOYMENT.md:198-208` as deprecated if no longer used; otherwise verify and update.

**Verification Checklist:**

- [ ] `docs/ARCHITECTURE.md` exists with diagram
- [ ] `sam local invoke` documented
- [ ] Good-first-issue section in CONTRIBUTING

**Testing Instructions:**

```bash
ls docs/ARCHITECTURE.md
```

**Commit Message Template:**

```text
docs: add ARCHITECTURE.md, sam local invoke, first-issue convention

Adds a one-page architecture doc with Mermaid diagrams, documents
sam local invoke for single-route local testing, and introduces a
good-first-issue convention.

Phase: 2026-04-07-audit-savorswipe/Phase-6
Refs: eval.md day2 remediation 4, 5, 7
```

## Task 6.4 — Wire markdownlint and lychee into pre-commit and CI

**Goal:** Prevent doc drift recurrence.

**Files:**

- New: `.markdownlint.json`
- New: `lychee.toml`
- `.husky/pre-commit`
- `.github/workflows/ci.yml`
- `package.json` (`docs:lint` + `docs:links` scripts)

**Prerequisites:** Task 6.3 done.

**Implementation Steps:**

1. Create `.markdownlint.json` enforcing the conventions in Phase-0 (language tags on fences, no trailing punctuation in headings, `1.` for ordered lists, blank lines around blocks). Disable rules that conflict with Mermaid blocks.
1. Add `npm install -D markdownlint-cli` and a `"docs:lint": "markdownlint '**/*.md' --ignore node_modules --ignore docs/plans/**/Phase-0.md.bak"` script.
1. Create `lychee.toml` with `exclude_path = ["node_modules", "dist"]` and basic accept-codes. Document running via `uvx lychee` (lychee is a Rust binary; document `cargo install lychee` OR use the GitHub Action in CI only — pick the GitHub Action path to avoid forcing a Rust toolchain locally).
1. Add `"docs:links": "lychee --config lychee.toml '**/*.md'"` to `package.json` (best-effort; CI is the enforcement point).
1. In `.husky/pre-commit` append a call to `npx markdownlint-cli` over staged `.md` files only (use `lint-staged` if already configured).
1. In `.github/workflows/ci.yml` add a `docs` job that runs `npm run docs:lint` and uses `lycheeverse/lychee-action` for link checking. Add it to the `status-check` aggregator.
1. Run `npm run docs:lint` and fix any residual lint issues across the plan files and other `.md` files.

**Verification Checklist:**

- [ ] `.markdownlint.json` and `lychee.toml` exist
- [ ] `npm run docs:lint` clean
- [ ] CI `docs` job present and gated by status-check
- [ ] Husky hook lints staged markdown

**Testing Instructions:**

```bash
npm run docs:lint
```

**Commit Message Template:**

```text
ci(docs): add markdownlint and lychee link checking

Wires markdownlint into Husky pre-commit and a new CI docs job, plus
lychee link checking via the GitHub Action. Status-check aggregator
gates on the new job to prevent doc drift recurrence.

Phase: 2026-04-07-audit-savorswipe/Phase-6
Refs: doc-audit.md prevention_tooling
```
