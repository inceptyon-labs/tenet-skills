# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
