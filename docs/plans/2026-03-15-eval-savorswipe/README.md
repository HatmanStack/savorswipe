# Remediation Plan: SavorSwipe Repo Evaluation

## Overview

This plan remediates 11 of 12 evaluation pillars identified in the SavorSwipe repo evaluation (Type Rigor already at 9/10). The evaluation was conducted by three lenses: Hire (pragmatic code review), Stress (oncall engineer), and Day 2 (team lead).

The remediation addresses code quality debt, not feature work. The primary issues are: 176 bare `print()` calls coexisting with an unused structured logger, a 660-line "god hook" violating single-responsibility, non-atomic two-file deletes with no rollback, silent error swallowing, dead code, unused 67MB dependencies, missing pre-commit hooks, and gaps in test coverage and developer documentation.

Work is organized into four phases: hygiene cleanup first, then code quality and defensiveness fixes, then architectural refactoring, and finally developer tooling and documentation. Each phase builds on the previous one so that cleanup happens before structural changes, and enforcement comes last.

## Prerequisites

- **Node.js 24** (as used in CI)
- **Python 3.13** (as used in CI)
- **npm** (with `package-lock.json`)
- **pip** (for backend dependencies)
- Run `npm ci` to install frontend dependencies
- Run `cd backend && pip install -r requirements.txt` to install backend dependencies

## Phase Summary

| Phase | Goal | Estimated Tokens | Tasks |
|-------|------|-----------------|-------|
| [Phase 0](Phase-0.md) | Foundation — ADRs, conventions, testing strategy | N/A (reference) | 0 (reference doc) |
| [Phase 1](Phase-1.md) | Hygiene & Cleanup — dead code, unused deps, manual tests, unnecessary I/O | ~15,000 | 4 |
| [Phase 2](Phase-2.md) | Code Quality & Defensiveness — logger migration, thread safety, error handling, type fixes, rollback | ~45,000 | 13 |
| [Phase 3](Phase-3.md) | Architecture & Performance — god-hook decomposition, URL parallelization, test coverage | ~40,000 | 6 |
| [Phase 4](Phase-4.md) | Fortification & Onboarding — pre-commit hooks, commitlint, docs, dev deps | ~20,000 | 6 |

**Total estimated tokens:** ~120,000 across 4 implementation phases (29 tasks)

## Pillar Coverage

| Pillar | Current | Target | Addressed In |
|--------|---------|--------|--------------|
| Git Hygiene | 5/10 | 7/10 | Phase 4 (Tasks 1-2, 5) |
| Architecture | 7/10 | 9/10 | Phase 2 (Task 12), Phase 3 (Tasks 1-4) |
| Code Quality | 7/10 | 9/10 | Phase 2 (Tasks 1-6, 9-11) |
| Defensiveness | 7/10 | 9/10 | Phase 2 (Tasks 7-8, 12), Phase 2 Task 6 (OCR logging) |
| Performance | 7/10 | 9/10 | Phase 1 (Tasks 1, 4), Phase 3 (Tasks 1-4, 5) |
| Test Value | 7/10 | 9/10 | Phase 1 (Task 3), Phase 2 (Task 13), Phase 3 (Task 6) |
| Reproducibility | 7/10 | 9/10 | Phase 4 (Tasks 1-3) |
| Problem-Solution Fit | 8/10 | 9/10 | Phase 1 (Task 1) |
| Pragmatism | 8/10 | 9/10 | Phase 1 (Tasks 1-2), Phase 4 (Task 6) |
| Creativity | 8/10 | 9/10 | Phase 2 (Task 11) |
| Onboarding | 8/10 | 9/10 | Phase 4 (Tasks 4-5) |
| Type Rigor | 9/10 | 9/10 | Phase 2 (Task 10) — maintains passing score |

## Navigation

- [Phase 0: Foundation](Phase-0.md)
- [Phase 1: Hygiene & Cleanup](Phase-1.md)
- [Phase 2: Code Quality & Defensiveness](Phase-2.md)
- [Phase 3: Architecture & Performance](Phase-3.md)
- [Phase 4: Fortification & Onboarding](Phase-4.md)
- [Feedback Log](feedback.md)
