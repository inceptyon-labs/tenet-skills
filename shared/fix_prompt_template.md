# Fix Prompt Template

Every finding MUST include a `fix_prompt` that follows this structure exactly. The fix_prompt is copied to the user's clipboard from the Tenet dashboard and pasted directly into a Claude Code session.

## Requirements

1. **Self-contained** — The recipient Claude session has NOT seen the audit. Include all context needed.
2. **Actionable** — Tell Claude exactly what to change, file by file.
3. **Constrained** — Include a Constraints section that preserves backward compatibility, existing tests, public APIs, etc.
4. **Verification-aware** — End with how to verify the fix (run tests, manual check, etc.).
5. **Location-accurate** — The `Location` section must mirror the finding's `file` and `line` fields exactly.

## Template

```
# Fix: {title}

## Context
{1-2 sentence description of the problem in the current codebase}

## Location
- File: {file}
- Line: {line or N/A}
- Dimension: {dimension} / {severity}

## Current behavior
{what the code does now, with the snippet if applicable}

## Required change
{explicit, step-by-step change instructions}

## Constraints
- Do not change public API signatures unless the fix requires it (and if so, flag it clearly)
- Preserve existing test behavior unless a test itself is incorrect
- {dimension-specific constraints}

## Verification
{how to confirm the fix — commands to run, files to inspect, expected output}
```

## Notes

- File paths are always repo-relative (e.g., `src/auth/middleware.ts`)
- Line numbers are 1-based source line numbers.
- The fix_prompt `Line` value MUST match the finding's top-level `line` field.
- If the finding has a single actionable source location, set `line` to that exact integer and use the same integer in the fix_prompt.
- If the finding is file-level, project-level, dependency-level, or otherwise has no exact source line, set the finding `line` to `null` and write `Line: N/A` in the fix_prompt.
- Do NOT invent approximate line numbers such as "add near the top" in the `Location` section. Put placement guidance in `Required change`.
- Do NOT list multiple line numbers in the `Location` section. Use the primary actionable line in `line`, and mention related lines in `Current behavior` or `Required change`.
- Before emitting a non-null line, verify that the snippet appears at that line using the source file or trusted tool output. If the line cannot be verified, use `null` / `Line: N/A`.
- Do NOT include "cd into the project" or shell setup — the user is already in the project root
- Do NOT reference the audit report or dashboard — the fix_prompt must stand alone
- Snippets in "Current behavior" should be <= 500 chars
- "Required change" should be specific enough that Claude can implement without guessing
- "Verification" should include concrete commands (e.g., `npm test`, `grep -r "eval(" src/`)
