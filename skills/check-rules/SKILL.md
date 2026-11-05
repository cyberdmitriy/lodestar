---
name: check-rules
description: Check code against project rules in .claude/rules/. Dynamically reads rules, detects violations, reports with severity, and offers to fix. Smart default scope (session diff or full codebase). Supports targeting specific files or rules.
allowed-tools: Bash, Read, Glob, Grep, Agent, Edit, Write
---

## Context

- Project rules: @.claude/rules/
- Git status: !`git diff --name-only HEAD`
- Arguments: $ARGUMENTS

## Task

Check code against all project rules defined in `.claude/rules/*.md`. Read every rule file dynamically — no hardcoded checklists. Report violations with a summary table and detailed findings, then offer to fix.

**Confidence rule:** Only report violations with confidence >= 80. Quality over quantity — false positives waste more time than missed issues.

---

# Phase 1 — Resolve Scope

Parse `$ARGUMENTS` to determine which files to check and which rules to apply:

**No arguments (smart default):**
- Run `git diff --name-only HEAD` to get modified files
- If output is non-empty: check those files against all rules (report as "session diff")
- If output is empty (clean tree): scan all custom source code against all rules (report as "full codebase")
- To find source directories, look at the project structure: check for `src/`, `app/`, `lib/`, `tests/`, `resources/`, and any directories referenced in the loaded rule files. Exclude `vendor/`, `node_modules/`, `storage/`, `bootstrap/cache/`, `.git/`, and other dependency/build directories.

**File path arguments** (one or more, e.g., `app/Services/Api/PythonApiService.php app/Models/Order.php`):
- Check only those files against all rules

**Rule name argument** (e.g., `laravel-service-design`):
- Match against `.claude/rules/{name}.md`
- Check all applicable source files against only that rule
- Infer applicable files from the rule's content — look for file paths, directory references, or class patterns mentioned in the rule text

**`--all` flag:**
- Force full codebase scan, all rules

**`--report-only` flag:**
- Scan and report findings without offering to fix. Skip Phase 4 entirely. Useful when called from other skills (e.g., `/review-session`) that collect findings before fixing.

Announce the resolved scope before proceeding:
> **Scope:** X files (session diff | full codebase | targeted) | **Rules:** Y loaded from .claude/rules/

---

# Phase 2 — Load Rules

Read every `.md` file in `.claude/rules/`. These are the rules you will check against. Read them in full — the complete text is your checklist.

If a specific rule was requested via argument, filter to only that rule file.

Do NOT use hardcoded checklists. Read the rule content fresh and apply judgment based on what the rules actually say.

---

# Phase 3 — Scan and Report

## Small scope (10 files or fewer)

Read each target file and check it against all loaded rules in a single pass. For each file, also inspect its immediate dependencies (classes it imports, methods it calls) to verify cross-file rule compliance.

## Large scope (more than 10 files)

Group target files by directory/domain (e.g., files in the same parent directory or feature area). Dispatch parallel review agents — one per group. Each agent receives:
1. The full text of ALL loaded rule files
2. A list of target files in its group
3. A hint about which rules are most likely relevant to its files (inferred from the rule content and the file paths), but it must check ALL rules
4. The confidence threshold (>= 80)
5. The output format template (see below)

To determine groupings, scan the target file paths and cluster by top-level source directory (e.g., all files under `app/Models/` form one group, all under `app/Services/` form another). Aim for 5-15 files per group. If a directory has fewer than 3 files, merge it with a related group.

Only dispatch agents for groups that have target files. Skip empty groups.

## Output Format

Collect all findings and present in this exact format:

```
# Rules Check Report

**Scope:** [count] files ([scope type]) | **Rules:** [count] loaded from .claude/rules/
**Confidence threshold:** >=80

## Summary

| # | File | Rule | Severity | Issue |
|---|------|------|----------|-------|
| 1 | `path/to/file.php:LINE` | rule-name | Critical | Short description |
| 2 | ... | ... | ... | ... |

**Total: X violations (Y Critical, Z Important, W Minor)**

## Details

### 1. [Critical] Short description
**File:** `path/to/file.php:LINE`
**Rule:** `rule-name.md` — "quoted text from the rule that this code violates"
**Code:**
    the offending code snippet
**Fix:** Concrete description of how to fix this violation

### 2. [Important] ...
(repeat for each violation)
```

Severity definitions:
- **Critical** — code directly contradicts a rule and could cause bugs, security issues, or data loss
- **Important** — code violates a convention and should be fixed before merging
- **Minor** — style or naming inconsistency, note for later

If no violations are found, report:
> **No violations found.** All [count] files comply with [count] loaded rules.

---

# Phase 4 — Offer to Fix

**Skip this phase entirely if `--report-only` was passed.**

After presenting the report, if any Critical or Important violations were found:

> **Found X violations (Y Critical, Z Important, W Minor). Want me to fix them?**

If yes:
1. Fix violations in batches by group — independent files can be fixed in parallel
2. For each fix: read the file, understand callers and dependencies, verify behavior preservation
3. After all fixes: detect and run available project checks (look for Makefile targets, composer/npm scripts, or test commands in the project) to verify nothing broke
4. Report what was fixed and verification results

If no: done.
