# Unified Audit Remediation Plan — 2026-04-07-audit-savorswipe

## Overview

Unified remediation plan consolidating findings from three intake audits:

1. `health-audit.md` — 3 critical, 7 high, 8 medium, 5 low tech-debt findings
1. `eval.md` — 12-pillar Hire/Stress/Day2 evaluation
1. `doc-audit.md` — 6 drift, 4 gaps, 2 stale documentation findings

## Sequencing

Phases run in role order: HYGIENIST then IMPLEMENTER then FORTIFIER then DOC-ENGINEER. This guarantees subtractive cleanup precedes substantive code changes, code changes precede new guardrails, and documentation reflects the final state of the code.

## Phase Index

- `Phase-0.md` — Architecture, conventions, testing, commit format (source of truth)
- `Phase-1.md` — [HYGIENIST] Quick wins: dead code, unused exports, lodash audit, dead env flags
- `Phase-2.md` — [IMPLEMENTER] Critical fixes: gpt-5.2 model id, module-scope boto3, route table
- `Phase-3.md` — [IMPLEMENTER] Lambda god-module split + ETag retry refactor + error accounting
- `Phase-4.md` — [FORTIFIER] Async-invoke DLQ, reserved concurrency, throttling, deploy guards
- `Phase-5.md` — [FORTIFIER] Reproducibility: uv.lock, devcontainer, e2e test, CI tweaks
- `Phase-6.md` — [DOC-ENGINEER] Doc drift fixes, env var docs, route reconciliation, markdownlint + lychee

## Plan Conventions

See `Phase-0.md` for architecture, conventions, testing protocol, and commit format.
