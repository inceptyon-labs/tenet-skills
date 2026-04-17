---
name: tenet-accessibility
description: "Scans for accessibility issues in HTML/JSX/TSX/Vue/Svelte: missing alt text, interactive elements without keyboard handlers, missing ARIA labels, color contrast issues, form inputs without labels, heading hierarchy skips, and missing lang attribute."
when_to_use: "Accessibility audit, a11y check, ARIA labels, alt text, WCAG compliance, tenet accessibility"
model: sonnet
allowed-tools: Bash Read Grep Glob Write
---

# Tenet Accessibility — A11y Audit

> Scans UI code for WCAG compliance issues: missing alt text, keyboard traps, unlabeled controls, heading hierarchy violations, and missing ARIA attributes.

## Purpose

Accessibility failures exclude users and expose projects to legal risk. This skill audits the view layer of web applications for common a11y violations that automated tools can reliably detect. It combines deterministic toolchain output (axe-core, pa11y) with grep-based pattern matching on source files to catch issues at the template level before they reach the browser.

## Applicability Check

This dimension applies when any of the following file types are present in the project:
- `.html`, `.htm`
- `.jsx`, `.tsx`
- `.vue`
- `.svelte`

Check via the language census or direct file search:
```bash
git ls-files | grep -E '\.(html?|jsx|tsx|vue|svelte)$' | head -1
```

If no matching files exist, write a non-applicable report:
```json
{
  "key": "accessibility",
  "score": null,
  "weight": 0.8,
  "skill_version": "1.0.0",
  "applicable": false,
  "notes": "No HTML, JSX, TSX, Vue, or Svelte files found. Accessibility dimension skipped."
}
```

## Language Support Matrix

```yaml
support:
  native: [html, typescript, javascript]
  heuristic: [vue, svelte]
  skip: [python, go, rust, java, kotlin, ruby, php, swift, csharp, cpp, c, yaml, json, css, sql, shell, dockerfile, markdown, terraform]
```

- **Native (HTML):** Direct pattern matching on standard HTML elements and attributes.
- **Native (TSX/JSX):** Pattern matching on JSX syntax, accounting for `className` vs `class`, `htmlFor` vs `for`, and expression attributes `alt={...}`.
- **Heuristic (Vue):** Scans `<template>` blocks. Accounts for `v-bind:alt` and `:alt` shorthand. May miss computed attribute values.
- **Heuristic (Svelte):** Scans markup sections. Accounts for `{alt}` shorthand syntax. May miss conditional attributes in `{#if}` blocks.

## Toolchain Inputs

| File | Source Tool | Usage |
|---|---|---|
| `.healthcheck/toolchain/axe.json` | axe-core CLI | Browser-level accessibility violations from rendered pages |
| `.healthcheck/toolchain/pa11y.json` | pa11y | WCAG 2.1 AA violations from rendered pages |
| `.healthcheck/toolchain/language-census.json` | language census | File lists and language breakdown |

All toolchain inputs are optional. If `axe.json` and `pa11y.json` are absent, the skill relies entirely on source-level grep-based scanning.

## Procedure

### Step 0: Read Configuration and Toolchain

```bash
# Read config overrides
cat .healthcheck.toml 2>/dev/null

# Read toolchain outputs
cat .healthcheck/toolchain/axe.json 2>/dev/null
cat .healthcheck/toolchain/pa11y.json 2>/dev/null
cat .healthcheck/toolchain/language-census.json 2>/dev/null
```

If `.healthcheck.toml` contains an `[accessibility]` section, apply overrides:
- `wcag_level` — target WCAG level: `"A"`, `"AA"` (default), or `"AAA"`
- `skip_patterns` — glob patterns for files to exclude (e.g., `["src/legacy/**"]`)
- `ignore_rules` — list of rule IDs to suppress (e.g., `["A11Y-H006"]`)

### Step 1: Consume Toolchain Output

**1a. Parse axe-core results:**

If `.healthcheck/toolchain/axe.json` exists, iterate its `findings` array. Map axe impact levels to Tenet severities:

| axe impact | Tenet severity |
|---|---|
| critical | critical |
| serious | major |
| moderate | minor |
| minor | info |

For each axe finding, create a Tenet finding with:
- `confidence: "deterministic"` (axe runs against rendered DOM)
- `file` and `line` from the axe selector mapped back to source if possible
- `fix_prompt` generated from the axe `help` and `helpUrl` fields

**1b. Parse pa11y results:**

If `.healthcheck/toolchain/pa11y.json` exists, iterate its results. Map pa11y types:

| pa11y type | Tenet severity |
|---|---|
| error | major |
| warning | minor |
| notice | info |

Deduplicate against axe findings — if both tools flag the same element (matched by selector or file+line), keep the higher-confidence one (axe preferred) and discard the duplicate.

### Step 2: Source-Level Scanning

Regardless of whether toolchain output exists, perform source-level scans. These catch issues at the template/component level that browser-based tools miss (e.g., in components that are conditionally rendered or in library code).

**2a. Build file list:**

```bash
git ls-files | grep -E '\.(html?|jsx|tsx|vue|svelte)$'
```

Exclude files matching `skip_patterns` from config.

**2b. Missing alt text on images (A11Y-I001):**

Scan for `<img` tags without `alt` attributes:

```bash
# HTML/JSX pattern
grep -n '<img\b' <file> | grep -v 'alt='
```

Also accept as valid (no finding): `alt=""` or `role="presentation"` (decorative), `alt={...}` (dynamic), Vue `:alt`/`v-bind:alt`, Svelte `alt={variable}`.

Emit **major** for each `<img>` without any form of alt attribute.

**2c. Interactive elements without keyboard handlers (A11Y-K001):**

Scan for elements with `onClick`/`@click`/`on:click` but no keyboard equivalent:

```bash
# JSX: onClick without onKeyDown/onKeyUp/onKeyPress
grep -n 'onClick=' <file> | grep -v 'onKey'
```

For non-interactive elements with click handlers (e.g., `<div onClick=...>`), also check for:
- `role="button"` or other interactive role
- `tabIndex` attribute

Non-interactive elements (`<div>`, `<span>`, `<li>`, `<td>`) with click handlers: **major** if missing keyboard handler AND `role` AND `tabIndex`. `<a>` without `href` used as click handler: **minor**. Native interactive elements (`<button>`, `<a href>`, `<input>`) are exempt. For Vue check `@click` vs `@keydown`; for Svelte check `on:click` vs `on:keydown`.

**2d. Missing ARIA labels on icon buttons (A11Y-A001):**

Scan for buttons containing only non-text content:

```bash
# Button with SVG or icon but no text or aria-label
grep -n '<button' <file>
```

A button needs an accessible name if it contains:
- Only an SVG (`<svg`) with no sibling text
- Only an icon component (`<Icon`, `<FontAwesome`, `<Lucide`, etc.)
- Only an `<img>` (which should have its own alt, but button still needs a label)

Acceptable accessible names: `aria-label`, `aria-labelledby`, visible text content, `<span className="sr-only">`, or `title` attribute. Emit **major** for icon buttons without any accessible name.

**2e. Form inputs without labels (A11Y-F001):**

Scan for `<input>`, `<select>`, `<textarea>` elements:

```bash
grep -n '<input\b\|<select\b\|<textarea\b' <file>
```

An input is considered labeled if it has: a matching `<label for>`/`<label htmlFor>`, a wrapping `<label>`, `aria-label`, or `aria-labelledby`. Exempt: `type="hidden"`, `type="submit"`, `type="button"`. Emit **major** for visible inputs without any label association.

**2f. Heading hierarchy skips (A11Y-H001):**

Track heading levels (`<h1>` through `<h6>`, or JSX `<Heading level={n}>`) in each file:

```bash
grep -n '<h[1-6]\b' <file>
```

Rules:
- The first heading in a page/component should be `<h1>` (unless it is a sub-component)
- Headings must not skip levels: `<h1>` → `<h3>` without `<h2>` is a violation
- Multiple `<h1>` tags in a single file is a **minor** finding

Emit **minor** for each heading hierarchy skip.

Note: In component architectures, sub-components may start at `<h2>` or lower. Only flag skips *within* a single file (e.g., `<h2>` then `<h4>`). Page/Layout/App files should have `<h1>`.

**2g. Missing lang attribute (A11Y-L001):**

Scan for `<html` tags without a `lang` attribute:

```bash
grep -rn '<html\b' <file> | grep -v 'lang='
```

This applies to:
- `index.html`, `_document.tsx`, `_document.jsx`, `app.html` (SvelteKit), `app.vue` (Nuxt), or any file containing `<html`
- Layout/shell files in framework-specific locations

Emit **major** for `<html>` without `lang`. This is a WCAG 2.1 Level A requirement.

**2h. Color contrast issues (A11Y-C001):**

Source-level contrast detection is limited. Scan for inline styles setting both `color` and `background-color`, and attempt basic contrast ratio estimation. Most contrast issues are caught by axe/pa11y in the toolchain — source-level findings are **info** only with `confidence: "heuristic"`.

### Step 3: Deduplicate Findings

Merge toolchain findings (Step 1) with source-level findings (Step 2):

1. If a toolchain finding and source finding reference the same file and similar line range (within 5 lines), keep the toolchain finding (higher confidence) and discard the source-level duplicate.
2. If only source-level findings exist for a file, keep them with their heuristic confidence tag.
3. If only toolchain findings exist for a file, keep them.

### Step 4: Score Calculation

Apply the standard scoring formula:

```
score = 100 - (5 * critical_count) - (2 * major_count) - (0.5 * minor_count)
score = max(0, min(100, round(score)))
```

Info findings do NOT affect the score.

### Step 5: Write Report

Write the dimension report to `.healthcheck/reports/accessibility.json`:

```json
{
  "key": "accessibility",
  "score": 65,
  "weight": 0.8,
  "skill_version": "1.0.0",
  "applicable": true,
  "notes": "Found 12 accessibility issues across 8 files. 3 images missing alt text, 2 icon buttons without ARIA labels, 4 heading hierarchy skips, 2 form inputs without labels, 1 missing lang attribute on <html>. axe-core provided 5 deterministic findings; 7 from source-level scan.",
  "metrics": {
    "files_scanned": 42,
    "total_findings": 12,
    "toolchain_findings": 5,
    "source_findings": 7,
    "wcag_level": "AA",
    "images_without_alt": 3,
    "buttons_without_label": 2,
    "inputs_without_label": 2,
    "heading_skips": 4,
    "missing_lang": 1,
    "keyboard_issues": 0,
    "contrast_issues": 0,
    "axe_available": true,
    "pa11y_available": false
  }
}
```

## Output

- `.healthcheck/reports/accessibility.json` — dimension report conforming to the schema in `shared/schema.json`

## Constraints

- **Respect .gitignore:** Only scan files tracked by git (`git ls-files`)
- **Skip generated/vendored files:** Exclude `node_modules/`, `dist/`, `build/`, `.next/`, `vendor/`, and generated HTML output directories
- **No browser required for source scan:** The grep-based scan operates on source files without rendering. Browser-based checks come from the toolchain (axe/pa11y).
- **Confidence tagging:** All findings MUST include a `confidence` field. Toolchain findings are `"deterministic"`, native JSX/HTML source findings are `"native"`, Vue/Svelte findings are `"heuristic"`.
- **Scoring math is pure:** No LLM judgment in the arithmetic. The score is a deterministic function of finding counts.
- **All findings must include a `fix_prompt`** following the template in `shared/fix_prompt_template.md`
- **Framework awareness:** Account for framework-specific syntax (React's `className`/`htmlFor`, Vue's `v-bind:`, Svelte's `{expression}`) when checking attributes
- **Decorative images:** Do NOT flag `<img alt="">` or `<img role="presentation">` — empty alt on decorative images is correct per WCAG
- **Component libraries:** If a project uses a component library (e.g., MUI, Chakra, Radix), some a11y is handled internally. Note this in the report notes but still flag issues found at the template level.

## fix_prompt Examples

### Example 1: Missing Alt Text

**Finding:** Image in `src/components/Hero.tsx` missing alt attribute (major)

```
# Fix: Add alt text to image in src/components/Hero.tsx

## Context
An <img> element on line 24 of src/components/Hero.tsx has no alt attribute.
Screen readers cannot describe this image to visually impaired users, violating
WCAG 2.1 Success Criterion 1.1.1 (Non-text Content).

## Location
- File: src/components/Hero.tsx
- Line: 24
- Dimension: accessibility / major

## Current behavior
```tsx
<img src={heroImage} className="hero-banner" />
```

## Required change
Add a descriptive `alt` attribute to the image. Choose one:

1. If the image conveys information:
   ```tsx
   <img src={heroImage} className="hero-banner" alt="Product dashboard showing real-time analytics" />
   ```

2. If the image is purely decorative:
   ```tsx
   <img src={heroImage} className="hero-banner" alt="" role="presentation" />
   ```

The alt text should describe what the image shows, not what it is
(e.g., "Team collaborating around a whiteboard" not "hero image").

## Constraints
- Do not remove or replace the image
- If the image is decorative, use `alt=""` (empty string), NOT omitting alt entirely
- Keep alt text under 125 characters

## Verification
- Run `grep -n 'alt=' src/components/Hero.tsx` and confirm line 24 has an alt attribute
- If axe-core is available: `npx @axe-core/cli --stdout . | grep "image-alt"` should return no violations
```

### Example 2: Button Without ARIA Label

**Finding:** Icon button in `src/components/Sidebar.tsx` has no accessible name (major)

```
# Fix: Add aria-label to icon button in src/components/Sidebar.tsx

## Context
A <button> element on line 47 of src/components/Sidebar.tsx contains only an
SVG icon with no text content or ARIA label. Screen readers announce this as
"button" with no indication of its purpose, violating WCAG 2.1 SC 4.1.2
(Name, Role, Value).

## Location
- File: src/components/Sidebar.tsx
- Line: 47
- Dimension: accessibility / major

## Current behavior
```tsx
<button onClick={toggleSidebar} className="sidebar-toggle">
  <ChevronIcon />
</button>
```

## Required change
Add an `aria-label` describing the button's action:

```tsx
<button onClick={toggleSidebar} className="sidebar-toggle" aria-label="Toggle sidebar navigation">
  <ChevronIcon aria-hidden="true" />
</button>
```

Also add `aria-hidden="true"` to the icon so screen readers skip the SVG.

## Constraints
- Do not change the button's visual appearance
- The aria-label should describe the action, not the icon ("Toggle sidebar" not "Chevron")
- If the button has two states (open/close), consider `aria-expanded` as well

## Verification
- Run `grep -n 'aria-label' src/components/Sidebar.tsx` and confirm line 47 area has a label
- Test with a screen reader or browser accessibility inspector — button should announce its purpose
```

### Example 3: Heading Hierarchy Skip

**Finding:** Heading jumps from h2 to h4 in `src/pages/About.tsx` (minor)

```
# Fix: Correct heading hierarchy in src/pages/About.tsx

## Context
The heading structure in src/pages/About.tsx jumps from <h2> (line 18) to
<h4> (line 32), skipping <h3>. This breaks the document outline for screen
reader users who navigate by heading level, violating WCAG 2.1 SC 1.3.1
(Info and Relationships).

## Location
- File: src/pages/About.tsx
- Line: 32
- Dimension: accessibility / minor

## Current behavior
```tsx
<h2>Our Mission</h2>        {/* line 18 */}
<p>...</p>
<h4>Core Values</h4>         {/* line 32 — skips h3 */}
<p>...</p>
```

## Required change
Change the `<h4>` to `<h3>` to maintain proper heading hierarchy:

```tsx
<h2>Our Mission</h2>
<p>...</p>
<h3>Core Values</h3>
<p>...</p>
```

If the visual styling of h3 is too large, adjust with CSS rather than
using an incorrect heading level:
```css
.about-page h3 {
  font-size: 1.1rem;
}
```

## Constraints
- Do not change heading levels that are already correct
- Adjust CSS for visual sizing rather than misusing heading levels
- Check that downstream headings (h4, h5) under this section are also adjusted if needed

## Verification
- Extract all headings: `grep -n '<h[1-6]' src/pages/About.tsx`
- Verify levels increment by at most 1: h1 → h2 → h3 (no gaps)
- Visually confirm the page still looks correct after the change
```

## Edge Cases

- **Dynamic content:** Components rendering headings/images via props may not be fully auditable. Flag what is detectable; note dynamic elements in the report.
- **CSS-in-JS:** Contrast checks are best-effort. Styled-components/emotion are not parsed.
- **Server-rendered HTML:** Scan source `.tsx`/`.vue` files, not `dist/` output.
- **Web Components / Shadow DOM:** Custom elements cannot be introspected at source level. Note presence but do not flag.
- **SVG as images:** `<svg role="img">` should have `aria-label` or `<title>`.
- **iframe accessibility:** Check for `title` attribute on `<iframe>` elements.
- **autofocus:** Flag as **info** — can disorient screen reader users.
- **tabindex > 0:** Flag as **minor** — positive tabindex breaks natural tab order.
- **Link purpose:** Flag generic link text ("click here", "read more") as **info**.
