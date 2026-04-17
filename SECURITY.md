# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | ✓         |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email **jnew00@gmail.com** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You should receive a response within 48 hours. If the issue is confirmed, a fix will be prioritized based on severity.

## Scope

This project is a Claude Code plugin (static Markdown skill definitions + shell scripts). The primary security concerns are:

- **Secrets scanning** — `tenet-secrets` skill may read files containing real secrets; those files are never uploaded or logged
- **Shell injection** — any shell scripts in `shared/` that compose tool commands from user-controlled input
- **Dashboard token** — `HEALTHCHECK_API_TOKEN` is a bearer token; if exposed, an attacker can submit arbitrary reports to your dashboard

Out of scope: vulnerabilities in the underlying static analysis tools (semgrep, gitleaks, etc.) — report those upstream.
