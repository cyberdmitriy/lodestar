---
name: visual-report
disable-model-invocation: true
description: >-
  Use when the user wants a polished, visual HTML report from data or findings: "visual report", "make a report", "HTML report", "report as an artifact", "dashboard from this data", "turn this into a report", "nice report", "визуальный отчёт", "сделай отчёт", "отчёт HTML", "Bericht als HTML", or any near-equivalent. Turns almost any input (findings, metrics, logs, a markdown doc, JSON) into one self-contained HTML report: metric cards, prioritized items, plain-English explanations, and charts that earn their place. Two delivery modes: a shareable Artifact link, or a local file with a click-to-comment review layer. Triggers on '/lodestar:visual-report'. For a chat-only, non-technical PM summary use '/lodestar:pm-report' instead.
---

# Visual Report

Turn input data into one clean, self-contained HTML report that reads well and is not overloaded: a headline, metric cards, a "what matters first" list, sections of items each explained in plain language, charts only where they add information, and detail folded into drilldowns.

This skill **reasons about the report** before it renders one. The template is the easy part. The value is deciding audience, structure, what to cut, which chart fits, and how to balance technical detail with plain English. Do that thinking first, every time.

Companion, not replacement: `/lodestar:pm-report` is a chat-only, non-technical summary for a project manager. This skill produces a visual HTML artifact for a mixed technical audience. If the user wants a Slack-pasteable plain summary, offer `pm-report` instead.

## When to use

- "Make a visual report / dashboard from this data / these findings."
- Aggregating results (audit reports, test runs, metrics, a research doc) into one readable page.
- A deliverable someone will read or a stakeholder will review and comment on.

## When NOT to use

- A quick chat answer or a plain-text PM summary → `/lodestar:pm-report`.
- A live app dashboard wired to changing data → that is an app, not this skill.
- Design exploration of a UI element → `/lodestar:design-variations`.

## Step 1: Ask the delivery mode (always, before building)

Ask the user which mode, in one question. The two modes come from the same template; the choice changes packaging and whether the review layer is on.

- **Artifact**: published page + shareable link, read-only. Charts and layout only, no comment overlay. Best for "share this / send it round to read." Note: a published Artifact sandbox blocks page-initiated downloads, so the review round-trip does not work here.
- **Local file**: one self-contained `.html` on disk with the click-to-comment margin cards enabled. Best for "I want to review this and send comments back." The reviewer opens it, clicks any block to comment, hits **Save & download**, and sends the baked file back; you read the comments from its `#vr-seed` block.

Do not guess the mode. Ask.

## Step 2: Reason about the report, then show a structure plan

Read `references/reasoning.md` and follow it. In short:

1. **Audience and purpose first.** Who reads this and what decision it drives. This sets the technical-vs-plain-English balance. One report can carry both layers: a plain summary on top, technical detail beside it or in a drilldown.
2. **Cut noise, keep essentials.** Decide what to leave out. Merge repeats: the same issue in many places is one item that lists its scope, not many items (dedup-with-scope-merge).
3. **Charts that earn their place.** Load the built-in `dataviz` skill to pick the chart type from the data shape and to apply its "a chart must earn its place" rule. If a sentence says it better, do not draw a chart.
4. **Plain-English explanation on every item.** What it means and why it matters, jargon translated, technical detail kept beside it, never instead of it.
5. **Redaction pass** before any shareable output: secrets to `[REDACTED:<kind>]`, absolute home paths to `~`.

For any non-trivial input, **emit a short structure plan and show it to the user before rendering**: audience, the sections you will include, which charts, and what you are cutting. This is the checkpoint that stops the report from missing important detail or over-weighting the wrong thing. Trivial input can skip straight to rendering.

## Step 3: Build from the template

1. Copy `assets/report-template.html`. Fill the `{{...}}` slots; compose the body from the blocks in `assets/section-example.html` (metric cards, top-N, sections, items, figures, drilldowns). Do not restyle. The classes are already themed, and the template ships thin theme-aware scrollbars, so code blocks and wide figures scroll cleanly.
2. Charts: inline `<svg>` only, using the `--vr-cat-*` palette variables. No CDN, no `<script src>`, no web fonts, no remote images. In Artifact mode a `<pre class="mermaid">` diagram also renders natively; in local-file mode use inline SVG so it works offline.
3. Rich content blocks (all self-contained, no library):
   - **Code**: put HTML-escaped code (`&lt; &gt; &amp;`) in `<pre class="vr-code" data-lang="php">`. The template's inline highlighter colours comments, strings, numbers, keywords, and calls at load, in both modes. Escaping is required, raw `<script>`/`<img>` would execute. Add `data-hl="off"` to keep a block verbatim.
   - **Tables**: `<table class="vr-table">` with a `<caption>` and `<th>` header, wrapped in `<div class="vr-scroll">` so wide tables scroll.
   - **Formulas**: native MathML in `<div class="vr-math"><math>...</math></div>`. No KaTeX (that needs a CDN). Use only when a formula reads better than prose.
4. Many sections? Do NOT emit a flat row of buttons that wraps to a second line. Take a pattern from `assets/nav-example.html`: a two-level top nav for a handful of pages, or a left sidebar (with per-page count badges) past about six pages. Each page is a `<section class="vr-tabpage" data-tab="ID">` and the script shows one at a time.
5. **Load `artifact-design` before writing an Artifact** (its own contract requires this) to calibrate layout and the "not overloaded" balance. Use `artifact-diagramming` for any diagram.
6. Package for the chosen mode:
   - **Local file**: write the full `report-template.html` document to disk with `data-review="on"` (via the `{{REVIEW_MODE}}` slot). The review layer and Save & download work from `file://`.
   - **Artifact**: the Artifact tool wraps your file in its OWN `<!doctype>/<html>/<head>/<body>` and controls the theme, so publish a FRAGMENT, not a full document: a `<title>`, then the template's `<style>` block, then the body content, then the `<script>`s. Drop the `<!doctype>/<html>/<head>/<body>` wrappers and do not set `data-review` (the template centers when it is absent and the review engine stays off). Then publish with the Artifact tool and hand over the link.

The comment engine, seed schema, and gotchas are documented in `references/comment-layer.md`.

## Step 4: Clarity gate (read it back as a stranger)

You are blind to your own ambiguity while writing, so run a distinct pass at the end: re-read the report as a skeptical first-time reader who knows nothing about the audit. For every number, label, chip, and chart axis, apply the reader-question test:

- **Of what?** A count that is a subset must show its whole. Write `28 / 32`, never a bare `28`.
- **What about the rest?** If `28 Confirmed` leaves 4 unexplained, name them in the label or a tooltip.
- **What does this word mean?** No internal vocabulary as a bare label. `FAIL`, `PARTIAL`, `Confirmed`, `Std`, `Cos`, `Pass`, `Rules passing` are jargon: reword to plain English or explain in a tooltip.
- **Which axis?** One row of tiles is ONE axis. Do not mix severity (Critical/High/...) with verdict (Confirmed/Likely) in the same row without labeling it.

Any element that triggers a question is unclear. Fix it (add the denominator, reword, attach a tooltip) or cut it. Every non-obvious number or label carries a human tooltip via `data-tip="..."` (the template styles it on hover). Chart axes use full words, never abbreviations, and every chart mark carries a hover tooltip (SVG `<title>` or `data-tip`). Full detail and worked anti-examples are in `references/reasoning.md`.

## Hard rules

1. **Self-contained, zero external hosts.** Inline all CSS. No CDN, `<link rel=stylesheet>`, `@import url()`, web fonts, remote images, or `<script src>`. This is what lets the same file render as a local file and as an Artifact.
2. **Ask the delivery mode first.** Never assume Artifact vs local file.
3. **Charts are inline SVG and must earn their place.** Delegate the choice to `dataviz`; do not chart what a sentence says better.
4. **Reason then render.** Show the structure plan for non-trivial input before building.
5. **Redact before sharing.** Secrets and absolute home paths never leave in clear text.
6. **Never invent data.** If the input lacks a number, say so in the report; do not fabricate a metric or a chart value.
7. **Read-only on the source.** This skill reads input and writes only the report file or Artifact.
8. **Multi-section reports navigate, they do not wrap.** Past a handful of pages use a tabbed or sidebar nav from `assets/nav-example.html`, never a flat button row that reflows onto a second line.
9. **Nothing ships that raises a question.** A bare subset count, a jargon label, a mixed-axis tile row, or an abbreviated tooltip-less chart is a clarity defect. Run the Step 4 reader-question test and fix or cut before delivery. Non-obvious numbers and labels carry a `data-tip` tooltip.

## Bundled resources

Loaded as needed:
- `assets/report-template.html`, the self-contained shell: themed CSS, review engine, `{{...}}` slots. Copy and fill.
- `assets/section-example.html`: the body markup contract (metric cards, top-N, item, figure, drilldown).
- `assets/nav-example.html`: two navigation patterns (two-level top nav, left sidebar) for a multi-page or tabbed report, each with its switch script.
- `references/reasoning.md`: the audience → plan → cut → explain → chart procedure and the structure-plan checkpoint format.
- `references/report-shapes.md`: the information-architecture catalog and when each shape fits.
- `references/comment-layer.md`: the review engine, `#vr-seed` schema, packaging, responsive behavior, gotchas.

## Companion skills

Lodestar offers other skills, it does not run them silently.
- **`dataviz`** (built-in): load it to choose and spec charts. First stop for any figure.
- **`artifact-design`** (built-in): load it before publishing an Artifact, for layout and restraint.
- **`artifact-diagramming`** (built-in): for diagrams.
- **`/lodestar:pm-report`**: the plain-text, chat-only PM summary. Offer it when the user wants text, not a visual artifact.
