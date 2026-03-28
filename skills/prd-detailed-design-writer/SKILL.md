---
name: prd-detailed-design-writer
description: Automatically analyze recently added or modified frontend code and generate a page-by-page PRD detailed design Markdown document. Use when the user asks to produce detailed design sections from new code, asks for complete interaction flow and edge-case coverage per page, or wants a dev-ready PRD that engineering can implement with minimal ambiguity.
---

# PRD Detailed Design Writer

## Overview

Generate a "page as unit" detailed design document directly from recent code changes.  
Output focuses on functional points, full interaction flow, boundary conditions, and implementation notes.

## Workflow

1. Identify recent changed code:
- Prefer `git diff` (working tree, staged, untracked, optional `--base-ref` range).
- Fallback to file modified-time window when git data is unavailable.

2. Group by page:
- Detect `pages/<page>.html|js|css` naming as one page module.
- Merge shared changes (for example `assets/js/store.js`) into each page context.

3. Extract design signals:
- UI controls (buttons, input fields).
- Event bindings and function modules.
- API calls, storage keys, and possible edge-case hints.

4. Generate Markdown doc:
- Write page-by-page detailed sections.
- Include interaction flow and edge-case checklist.
- Try to auto-capture screenshots; on failure, insert explicit placeholders and what screenshot to provide.

## Quick Start

Run inside the target project root:

```bash
python /path/to/prd-detailed-design-writer/scripts/generate_prd_design.py \
  --workspace . \
  --with-screenshots
```

Optional arguments:

```bash
# Use git base ref range
python /path/to/prd-detailed-design-writer/scripts/generate_prd_design.py \
  --workspace . \
  --base-ref origin/main \
  --with-screenshots \
  --screenshot-mode auto

# Non-git fallback window and output path
python /path/to/prd-detailed-design-writer/scripts/generate_prd_design.py \
  --workspace . \
  --since-hours 168 \
  --output docs/prd-detailed-design-manual.md

# Explicitly bind your screenshot skill
python /path/to/prd-detailed-design-writer/scripts/generate_prd_design.py \
  --workspace . \
  --with-screenshots \
  --screenshot-mode auto \
  --screenshot-skill-dir "C:/Users/<you>/.codex/skills/screen-control-ops"
```

Screenshot modes:
- `auto`: try Playwright first, then fallback to `screen-control-ops/scripts/capture_screen.ps1`.
- `playwright`: Playwright only.
- `screen-skill`: screenshot skill only.
- `none`: disable screenshot generation.

## Output Requirements

Ensure each page section includes:
- Change scope (files and shared dependencies).
- Functional points (small-granularity items).
- End-to-end interaction flow.
- Edge cases (validation, failure, empty state, timeout, disabled states).
- Development notes (state transitions, anti-duplicate submit, retry strategy).
- Screenshot section:
  - Rendered image when auto capture succeeds.
  - Placeholder block when capture fails, with clear "what image to place" instructions.

## References

Read [references/prd_template.md](references/prd_template.md) when you need a stricter writing structure or want to manually refine script output.
