# Tenet Accessibility — Rubric

## Scoring Formula

```
score = 100 - (5 * critical) - (2 * major) - (0.5 * minor)
Floor 0, ceil 100, round to integer.
Info findings do NOT affect the score.
```

## Finding Rules

### Images and Non-Text Content

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-I001 | `<img>` element missing `alt` attribute entirely | major | native |
| A11Y-I002 | `<svg role="img">` missing `aria-label` or `<title>` child | major | native |
| A11Y-I003 | `<iframe>` missing `title` attribute | minor | native |

### Keyboard Accessibility

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-K001 | Non-interactive element (`<div>`, `<span>`) with click handler but no keyboard handler, role, or tabIndex | major | native (JSX), heuristic (Vue/Svelte) |
| A11Y-K002 | `<a>` without `href` used as click handler (should be `<button>`) | minor | native |
| A11Y-K003 | `tabIndex` value greater than 0 (breaks natural tab order) | minor | native |
| A11Y-K004 | `autoFocus` / `autofocus` attribute present (can disorient SR users) | info | native |

### ARIA and Labeling

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-A001 | Button containing only SVG/icon with no `aria-label`, `aria-labelledby`, or visually hidden text | major | native |
| A11Y-A002 | Interactive custom element missing explicit `role` attribute | minor | heuristic |
| A11Y-A003 | Generic link text ("click here", "read more", "link") | info | heuristic |

### Forms

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-F001 | `<input>`, `<select>`, or `<textarea>` with no associated `<label>`, `aria-label`, or `aria-labelledby` (not type hidden/submit/button) | major | native |
| A11Y-F002 | `<label>` element with `for`/`htmlFor` that does not match any input `id` in the same file | minor | native |

### Headings

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-H001 | Heading hierarchy skip (e.g., `<h2>` followed by `<h4>` with no `<h3>` in between) | minor | native |
| A11Y-H002 | Multiple `<h1>` elements in a single page/layout file | minor | native |
| A11Y-H003 | Page or layout file with no `<h1>` element | info | heuristic |

### Document-Level

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-L001 | `<html>` element missing `lang` attribute (WCAG 2.1 Level A, SC 3.1.1) | major | deterministic |
| A11Y-L002 | `<html lang="">` with empty lang value | major | deterministic |

### Color and Contrast

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-C001 | Inline style with potentially insufficient color contrast (source-level heuristic) | info | heuristic |
| A11Y-C002 | axe-core or pa11y contrast violation | major (if AA), minor (if AAA-only) | deterministic |

### Toolchain-Sourced (axe-core / pa11y)

| ID | Rule | Severity | Confidence |
|---|---|---|---|
| A11Y-T001 | axe-core critical impact violation | critical | deterministic |
| A11Y-T002 | axe-core serious impact violation | major | deterministic |
| A11Y-T003 | axe-core moderate impact violation | minor | deterministic |
| A11Y-T004 | axe-core minor impact violation | info | deterministic |
| A11Y-T005 | pa11y error | major | deterministic |
| A11Y-T006 | pa11y warning | minor | deterministic |
| A11Y-T007 | pa11y notice | info | deterministic |

## Severity Justifications

| Severity | Rationale |
|---|---|
| critical | axe-core critical violations represent total barriers — users literally cannot access the content or functionality. Examples: missing page structure, focus traps with no escape. |
| major | Missing alt text, unlabeled buttons, unlabeled form inputs, missing lang attribute, and keyboard inaccessibility exclude entire user populations from core functionality. These are WCAG 2.1 Level A and AA violations. |
| minor | Heading hierarchy skips, missing iframe titles, positive tabindex, and AAA-only contrast issues degrade the experience but do not fully block access. |
| info | Suggestions like descriptive link text, autofocus warnings, and low-confidence contrast hints. No score impact. |

## Confidence Tiers

| Tier | When Used |
|---|---|
| deterministic | Findings from axe-core or pa11y (browser-rendered DOM analysis), file existence checks (lang attribute on html files) |
| native | Pattern matching on HTML, JSX, and TSX source code where attribute syntax is unambiguous |
| heuristic | Pattern matching on Vue/Svelte templates, color contrast estimation from source, generic link text detection |

## Deduplication Rules

When both toolchain and source-level scans flag the same issue:
1. Match by file path and line number (within 5-line tolerance)
2. Keep the higher-confidence finding (deterministic > native > heuristic)
3. Discard the lower-confidence duplicate
4. Note the deduplication count in report metrics

## Metrics Emitted

| Metric | Type | Description |
|---|---|---|
| `files_scanned` | integer | Number of view-layer files scanned |
| `total_findings` | integer | Total unique findings after deduplication |
| `toolchain_findings` | integer | Findings sourced from axe/pa11y |
| `source_findings` | integer | Findings from grep-based source scan |
| `wcag_level` | string | Target WCAG level (A, AA, or AAA) |
| `images_without_alt` | integer | Count of A11Y-I001 findings |
| `buttons_without_label` | integer | Count of A11Y-A001 findings |
| `inputs_without_label` | integer | Count of A11Y-F001 findings |
| `heading_skips` | integer | Count of A11Y-H001 findings |
| `missing_lang` | integer | Count of A11Y-L001 findings |
| `keyboard_issues` | integer | Count of A11Y-K001 + A11Y-K002 findings |
| `contrast_issues` | integer | Count of A11Y-C001 + A11Y-C002 findings |
| `axe_available` | boolean | Whether axe-core toolchain output was consumed |
| `pa11y_available` | boolean | Whether pa11y toolchain output was consumed |

## Output Schema

Written to `.healthcheck/reports/accessibility.json` conforming to the dimension object in `shared/schema.json`.
