# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`tenet-correctness` dimension** — a logic/correctness bug hunt (the "code review" gap the other dimensions don't cover). Selects a bounded review set from critical paths, churn hotspots, and entry points, then traces concrete inputs to find off-by-one, inverted conditions, wrong-variable copy-paste, missing `await`, race conditions/TOCTOU, null paths, and type-coercion bugs. Wired into the orchestrator (weight 1.3) and setup.
- **Broken access control coverage in `tenet-security`** — IDOR/missing-ownership (`SEC-AUTHZ-IDOR`), multi-tenant isolation (`SEC-AUTHZ-TENANT`), function-level authz (`SEC-AUTHZ-BFLA`), and mass assignment (`SEC-AUTHZ-MASS`), driven by a mandatory entry-point inventory.
- **New security vulnerability classes** — NoSQL/object injection, path-traversal procedure, timing-unsafe secret comparison (`SEC-AUTH-007`), webhook signature verification (`SEC-AUTH-008`), prototype pollution (`SEC-DESER-006`), ReDoS (`SEC-PARSE-001`), and zip-slip (`SEC-PARSE-002`).
- **Platform security playbooks** — Tauri, Electron, Flutter, iOS/Swift, and LLM-app (prompt/tool injection, unmetered spend) checks, so desktop/mobile repos no longer score falsely high.
- **Shared audit protocols** — `shared/scan-discipline.md` (grep hygiene, anti-laziness, worklog, systemic grouping), `shared/verification.md` (mandatory refute pass with evidence), `shared/entry-points.md` (per-framework route enumeration for Hono, tRPC, Next.js, SvelteKit, FastAPI, etc.), `shared/security-calibration.md` (flag / do-NOT-flag pairs), and `shared/suppressions.md`.
- **Suppressions** — `tenet-ignore:` inline comments and a `.healthcheck.toml` `[suppressions]` section demote accepted findings to `info` with a recorded reason instead of re-flagging them every run. Suppressed findings now carry explicit `suppressed: true` / `suppressed_reason` fields (added to `shared/schema.json`) so the dashboard renders them as a distinct **Accepted risk** badge.
- **Publishable-key handling in `tenet-secrets`** — Firebase web config, Stripe `pk_`, Supabase `anon`, and other public-by-design keys are no longer reported as critical; their private counterparts still are.
- **Security eval fixtures + scorer** — `evals/fixtures/security-recall/` (20 planted vulnerabilities across 12 classes + 9 safe decoys) with `evals/score-fixtures.py` to measure recall and precision per class, plus two new eval entries.

### Changed

- `tenet-security` and `tenet-secrets` now require a verification/refute pass before emitting any `major`/`critical`, capture the offending line as evidence, and reference the shared protocols. Grep commands use `git grep` with proper excludes (no more bare recursive grep or fragile `$(git ls-files)`).
- **Model tiers set to run on Sonnet by default.** 19 of 23 skills now declare `model: sonnet` — the deterministic/toolchain-backed ones (dependencies, complexity, debt, build-ci, supply-chain-license, infra-cloud, observability, release-ops, database-migrations, docs, accessibility, testing) and the heavily-scaffolded reasoning ones (security, secrets, correctness, errors, performance). Held on `opus` where holistic judgment dominates: `tenet-solid` (design principles), `tenet-api-contract` (cross-endpoint consistency), `tenet-privacy-data` (PII flow tracing), and `tenet-orchestrator` (aggregation coordinator).

- Mutation testing report ingestion for the Testing dimension, including Phase 1 informational reporting and Phase 2 opt-in score bonus behavior.
- Standard mutation metrics for dashboard drilldowns, including provider, scope, score, rating, killed/survived/timed-out counts, worst files, and bonus applied.
- Toolchain/setup guidance for discovering mutation reports and optional Swift/Muter configuration without running mutation tools from Tenet by default.
- Repo-hygiene trust signals (parity with GitHub Guard's Trust Report): `tenet-docs` now flags a missing `SECURITY.md` (DOCS-R012/R013); `tenet-supply-chain-license` now checks for an explicit LICENSE file/metadata and for unsigned recent commits; `tenet-security` now detects pipe-to-shell installers, package lifecycle hooks running arbitrary commands, and install scripts requiring elevated privileges (SEC-INSTALL-001..003).

## [1.0.0] - 2026-04-17

### Added

- Initial release with 17 coordinated audit skills
- `tenet-orchestrator` — main entry point, coordinates all dimension skills
- `tenet-toolchain-setup` — first-run concierge, detects tools and generates config
- `tenet-toolchain` — deterministic pre-pass that runs and normalizes static analysis tools
- Dimension skills: security, complexity, SOLID, performance, dependencies, debt, testing, docs, accessibility, API contracts, secrets, errors, observability, build-ci
- Shared schema (`shared/schema.json`) for structured JSON reports
- Fix prompt template for paste-into-Claude-Code remediation
- `.healthcheck.toml` configuration format with per-dimension weight overrides
- Dashboard upload via `POST /api/v1/reports` with bearer auth
- Stdout fallback when dashboard env vars are not set
- Scoring formula: `max(0, min(100, round(100 − 5×critical − 2×major − 0.5×minor)))`
- Composite weighted score across all applicable dimensions
