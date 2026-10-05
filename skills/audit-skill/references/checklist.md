# Skill audit checklist

Each rule has an ID, a default severity, and how it is checked: **lint** (`scripts/lint_skill.py` reports it), **judge** (the reviewer reads and decides), or **both**. Sources are listed in `sources.json`; `self-update` keeps this file in line with them.

Severity:
- **critical**: the skill fails to load, cannot be discovered, or cannot run as written.
- **important**: works, but triggers poorly, wastes context, or is followed unreliably.
- **minor**: polish, and documented recommendations with little effect.

## Contents
- S: Structure and frontmatter
- N: Naming
- D: Description
- F: Claude Code frontmatter fields
- P: Progressive disclosure and files
- C: Content
- W: Workflows and feedback loops
- R: Degrees of freedom
- X: Scripts and tools
- L: Lifecycle and invocation (Claude Code)
- T: Testing

## S: Structure and frontmatter

- **S1** critical, lint. Frontmatter opens with `---` on line 1 and closes. Otherwise the whole file loads as content and auto-invocation breaks.

## N: Naming

- **N1** critical, lint. `name`: at most 64 chars, only `[a-z0-9-]`, no XML tags, no reserved words `anthropic` or `claude`.
- **N2** important, lint. `name` equals the directory name. In a plugin the command is `/<plugin>:<name>`; do not repeat the plugin name inside `name`.
- **N3** important, both. Not vague or generic (`helper`, `utils`, `tools`, `documents`, `data`, `files`).
- **N4** minor, judge. Follows the naming pattern of sibling skills in the same collection. Gerund form (`processing-pdfs`) is preferred; noun phrases (`pdf-processing`) and action form (`process-pdfs`) are acceptable. Do not rename a skill only for gerund form when its siblings use another pattern: renaming breaks invocations and cross-references.

## D: Description

- **D1** critical, lint. Non-empty, at most 1,024 chars, no XML tags.
- **D2** important, both. Third person ("Processes Excel files…"). Not "I can…" or "You can use this…". The description is injected into the system prompt.
- **D3** important, both. States what the skill does and when to use it, with concrete trigger terms users actually say: file types, tool names, phrases. Vague ("Helps with documents") fails.
- **D4** important, lint. `description` + `when_to_use` at most 1,536 chars; Claude Code truncates the listing there.
- **D5** important, judge. The main use case and trigger come first, since truncation cuts the end. The description does not summarize the workflow; the body does that.
- **D6** minor, judge. Every description is loaded into context in every session. Long keyword lists cost tokens in every conversation; keep only the triggers that change selection.

## F: Claude Code frontmatter fields

- **F1** minor, lint. Only documented fields: `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context` (only `fork`), `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility` (at most 500 chars).
- **F2** minor, lint. `agent` and `background` only take effect with `context: fork`.
- **F3** critical, both. A `context: fork` skill cannot ask the user (no AskUserQuestion) and has no conversation history. A skill that needs mid-run questions runs in the main conversation and delegates isolated work to subagents via the Agent tool.
- **F4** critical, lint. Not both `disable-model-invocation: true` and `user-invocable: false`; then nothing can invoke the skill.
- **F5** important, judge. Uses `$ARGUMENTS` / `$0` / named `arguments` when it takes input, and `argument-hint` documents them. Bundled files are referenced via `${CLAUDE_SKILL_DIR}` when they must be run or read by absolute path.

## P: Progressive disclosure and files

- **P1** important, lint. SKILL.md body is under 500 lines. Detail goes to separate files.
- **P2** important, lint. References are one level deep: every reference file is linked directly from SKILL.md. Claude may only partially read (`head`) files reached through another reference.
- **P3** minor, lint. Reference files over 100 lines start with a table of contents.
- **P4** critical, lint. Every referenced file exists.
- **P5** minor, lint. Every bundled file is referenced from SKILL.md; otherwise Claude never finds it.
- **P6** important, judge. SKILL.md reads as an overview that points to detail ("For X, see [x.md](x.md)") and says when to load each file. Content is split by domain or variant, so one task does not load irrelevant material.
- **P7** minor, judge. Files have descriptive names (`form_validation_rules.md`, not `doc2.md`); directories are organized by domain or feature.

## C: Content

- **C1** minor, both. No time-sensitive statements ("before August 2025 use…"). Deprecated material goes in an "Old patterns" section.
- **C2** important, judge. Concise: only context Claude does not already have. Flag paragraphs explaining general knowledge (what a PDF is, how libraries work), motivational filler, and repetition. Ask of each paragraph: does it justify its token cost?
- **C3** important, judge. Consistent terminology: one term per concept (not "field" / "box" / "element" for the same thing).
- **C4** minor, judge. Examples are concrete (real input to output pairs), not abstract. Output-format skills give a template, marked strict ("ALWAYS use this exact structure") or flexible ("sensible default, adapt").
- **C5** important, judge. No contradictory instructions between SKILL.md and reference files, or within one file.

## W: Workflows and feedback loops

- **W1** important, judge. Multi-step tasks are numbered sequential steps with clear entry and exit conditions.
- **W2** minor, judge. Complex workflows provide a copyable progress checklist (`- [ ] Step 1: …`).
- **W3** important, judge. Quality-critical tasks have a feedback loop: validate, fix, repeat, and proceed only when validation passes.
- **W4** minor, judge. Decision points are explicit conditional branches ("Creating new? Follow X. Editing? Follow Y."). Large branches live in separate files.

## R: Degrees of freedom

- **R1** important, judge. Specificity matches fragility. Fragile, order-sensitive operations get exact commands ("Run exactly this script; do not add flags"). Context-dependent work gets heuristics, not rigid scripts. Flag both mismatches.
- **R2** minor, judge. One default approach with an escape hatch, not a menu of equal options ("use pypdf, or pdfplumber, or PyMuPDF…").

## X: Scripts and tools

Skip this section when the skill has no scripts and calls no tools by name.

- **X1** important, judge. Scripts handle errors themselves (missing file, permission) with helpful messages instead of failing and leaving Claude to cope.
- **X2** minor, judge. No unexplained constants; each timeout, retry count or limit has a one-line justification.
- **X3** important, judge. Required packages are listed and installable in the target environment; nothing assumes a tool is installed. The Claude API has no network access; claude.ai and Claude Code do.
- **X4** important, judge. Each script reference says whether to run it ("Run `x.py`") or read it ("See `x.py` for the algorithm").
- **X5** minor, lint. Every bundled script is mentioned in SKILL.md.
- **X6** important, judge. MCP tools are named fully qualified (`ServerName:tool_name` in the API docs; `mcp__server__tool` in Claude Code).
- **X7** minor, judge. Batch, destructive or high-stakes operations use plan, validate, execute: an intermediate plan file checked by a script before changes apply. Validator errors are specific ("Field 'x' not found. Available: …").
- **X8** important, judge. Deterministic operations (validation, parsing, format conversion) are bundled scripts, not code Claude regenerates each run.
- **A1** minor, lint. Forward slashes only in paths.

## L: Lifecycle and invocation (Claude Code)

- **L1** important, judge. Skills with side effects (deploy, send, commit, post) set `disable-model-invocation: true`. Pure background knowledge that is not an action may set `user-invocable: false`.
- **L2** minor, judge. `allowed-tools` is as narrow as the task (`Bash(git status *)`, not bare `Bash`) and only pre-approves tools the skill really uses.
- **L3** minor, judge. Instructions are written as standing guidance. Rendered SKILL.md stays in context for the rest of the session and is not re-read, so steps that assume "only at the start" still read correctly later.
- **L4** minor, judge. `` !`command` `` injection is used for live data the skill always needs. A command that may exit non-zero has `|| true`, since a failing command aborts the invocation.

## T: Testing

Report these as recommendations, never as defects. They cannot be verified from the files.

- **T1** minor, judge. Evaluations exist: at least three scenarios with expected behavior, built before the extensive documentation.
- **T2** minor, judge. Tested on every model it will run on. Haiku needs more guidance; Opus is hurt by over-explaining.
- **T3** minor, judge. Tested on real usage: observe whether Claude follows the references, ignores files, or rereads one section often enough that it belongs in SKILL.md.
