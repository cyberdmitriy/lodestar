---
name: code-review
description: Deep code review — behavioral analysis, logic gaps, security, UI impact tracing, spec alignment, then automated checks (lodestar:error-handling-audit, code simplification agents, lodestar:check-rules) with conflict resolution and user confirmation before fixes
disable-model-invocation: true
argument-hint: "[uncommitted | full | <layer> | <path> | <base-ref> e.g. origin/develop | <base>..HEAD]"
allowed-tools: Bash
---

# Maintenance Guide

This skill is designed around a clear separation of concerns. Understand it before editing.

## File layout

- `SKILL.md` (this file) — the orchestrator. Runs in the main conversation, because only there can it ask the user (AskUserQuestion is not available to subagents or `context: fork`). It resolves the scope, starts the review subagent, relays the report, asks which issues to fix, and starts the fix subagent. It never reads or analyzes the code itself.
- `references/review.md` — the review itself (Phases 1–3). Runs in a subagent: isolated from the session's reasoning, and only its report comes back to the main context.
- `references/fix.md` — applying approved fixes. Runs in a second subagent.

Review checklists go in `references/review.md`, not here.

## What belongs HERE (deep analysis requiring reasoning)

- Behavioral completeness — mapping callers, states, verifying preservation
- Logic analysis — edge cases, race conditions, failure modes, data integrity
- Security analysis — injection, auth bypass, sensitive data exposure
- UI impact tracing — data flow from backend to frontend, contract breakage
- Spec alignment — requirement coverage, scope creep
- Testing assessment — coverage gaps, meaningful assertions

## What belongs in `.claude/rules/` (convention/pattern checking)

- Architecture patterns (thin controllers, Actions vs Services, repositories)
- Naming conventions (files, classes, enums, routes)
- Code style (formatting, imports, guard clauses)
- Framework conventions (Form Requests, DTOs, eager loading, migrations)
- Performance patterns (pagination, bulk ops, indexes, caching)
- API contracts (casing, resource classes)

**If you're about to add a checklist item that can be verified by pattern matching — STOP.
Add it to an existing rule in `.claude/rules/` or create a new rule file.
`/lodestar:check-rules` (Phase 2 Step 3) will pick it up automatically.**

The skill invokes `/lodestar:check-rules` in Phase 2. Any convention added to rules is automatically
included in every code review. Adding it here too creates duplication and maintenance burden.

### Decision test

Ask: "Can this be checked by reading the code structure alone, without understanding the business context?"
- **Yes** → rule in `.claude/rules/`
- **No** → section in `references/review.md`


---

# Orchestrator

You run in the main conversation. Your jobs: resolve the scope with the user, start the review subagent, relay its report, ask which issues to fix, start the fix subagent. **Do not read, analyze, or fix the code yourself** — that is what keeps the review independent and the main context clean.

Reference files live in this skill's base directory: `${CLAUDE_SKILL_DIR}/references/` (the same path is shown as "Base directory for this skill" when the skill loads). Pass subagents the absolute paths.

**Arguments:** `$ARGUMENTS`

## Step 1 — Resolve arguments

If arguments were given, resolve the scope from them and skip the question in Step 4:
- `uncommitted` → uncommitted scope
- `full` → full codebase scope
- a detected layer name (e.g. `php`, `react`) → that layer's scope
- a git ref or range (`origin/develop`, `develop`, `origin/develop..HEAD`, `origin/develop...HEAD`) → branch scope with that ref as the base. Strip any `..HEAD` / `...HEAD` suffix and keep the ref.
- an existing file or directory path → path scope

If the argument is ambiguous or the ref does not resolve (`git rev-parse --verify --quiet <ref>` fails), say so and fall back to asking.

## Step 2 — Detect changes

1. **Find base candidates.** Check the remote first: `git symbolic-ref --short refs/remotes/origin/HEAD`, then whichever of `origin/develop`, `origin/main`, `origin/master` exist (`git rev-parse --verify --quiet <ref>`). With no `origin` remote, use the local `develop` / `main` / `master`. Keep every candidate that exists — there can be more than one.
2. **Refresh remote refs:** `git fetch origin --quiet`. If it fails (offline, no access), continue with the local copy of the ref and say it may be stale.
3. **Uncommitted changes:** `git diff --name-only HEAD` plus untracked files from `git ls-files --others --exclude-standard`.
4. **Branch changes:** `git diff --name-only <base>...HEAD` — three dots, so the diff starts at the merge-base. Two dots would compare against the tip of `<base>` and pull in every commit that landed on `<base>` after the branch was cut, as reversed changes.
5. Merge uncommitted and branch lists, deduplicate: the **branch changeset**.
6. Counts: N uncommitted files, X branch files (including uncommitted), `git rev-list --count <base>..HEAD` commits ahead.

## Step 3 — Detect project layers

Discover which technology layers exist. Do NOT hardcode layers:

1. **Read CLAUDE.md first** — it often describes the project structure, apps, and tech stack. Use its labels and directory mappings.
2. **Scan for markers** — package manager files (`composer.json`, `pyproject.toml`, `package.json`, `Cargo.toml`, `go.mod`, etc.), source directories, file extensions, framework markers (Laravel's `artisan`, Django's `manage.py`, Next.js config, etc.).
3. **Reconcile** — prefer CLAUDE.md labels (e.g. "Laravel control layer" over "PHP").

Only detect layers here — do not read source files.

## Step 4 — Ask for the scope

Skip if the scope came from arguments.

Print a status line first:

```
Branch: <branch> — <N> commits ahead of <base> | Uncommitted: <M> files | Branch changes: <X> files
Layers: [Layer 1], [Layer 2], [Layer 3]
```

Then ask with the **AskUserQuestion** tool — one question, header `Scope`, up to 4 options, the recommended one first with `(Recommended)` in its label:

| Option label | Description | Show when |
|---|---|---|
| `Branch vs <base>` | All X files changed since the branch left `<base>`, committed and uncommitted | branch has commits ahead of `<base>` |
| `Uncommitted only` | M files in the working tree | M > 0 |
| `Full codebase` | All source files, all layers | always |
| `One layer` | All files of one layer: [Layer 1], [Layer 2]… | 2+ layers detected |

- **Recommended:** `Branch vs <base>`. Zero commits ahead but uncommitted changes → `Uncommitted only`. Neither → `Full codebase`.
- Use the real base name in the label (`Branch vs origin/develop`), never a placeholder.
- End the question text with: *"Or type a ref / range (e.g. `origin/main`, `origin/develop..HEAD`) or a path in Other."* Resolve a typed answer with the Step 1 rules.

Follow-up questions, a second AskUserQuestion call, only when needed:
- `Branch vs <base>` picked and Step 2 found more than one base candidate → `Which base?`, one option per candidate (up to 4), the one from the label first.
- `One layer` picked → `Which layer?`, one option per layer (up to 4; list the rest in the question text for Other).

If AskUserQuestion is not available, print the same options as a numbered list and wait for the reply.

## Step 5 — Resolve the file list

- **Uncommitted:** `git diff --name-only HEAD` + untracked files.
- **Branch:** the branch changeset from Step 2 against the chosen base.
- **Full codebase:** source directories, excluding `vendor/`, `node_modules/`, `storage/`, `.git/`, `bootstrap/cache/`, `__pycache__/`, `.venv/`, `dist/`, `build/`.
- **Layer:** full-codebase list filtered to the chosen layer.
- **Path:** source files under the path, same exclusions.

Announce:

> **Scope:** X files | **Mode:** [uncommitted / branch vs `<base>` / full codebase / layer / path] | **Layers:** [all / specific]

## Step 6 — Run the review in a subagent

Start **one** `general-purpose` subagent with the Agent tool, in the foreground (`run_in_background: false`) — the next step needs its report.

Its prompt contains exactly this, nothing more:

```
Read <absolute path>/references/review.md and follow it exactly.

Scope:
- Mode: <mode>
- Base: <base ref, or "n/a">
- Files (<X>):
  <one path per line>
- Layers: <layers>
```

**Independence rule:** do not add anything from this conversation — no explanations of why the code was written this way, no summaries of the work, no hints about what to look for. The subagent reviews the code as if seeing it for the first time.

## Step 7 — Relay the report

The subagent's report is not shown to the user automatically. Print it **in full, verbatim** — every table, every issue number.

If it found no Critical, Important, or Minor issues, stop here.

## Step 8 — Ask which issues to fix

> **Found X issues (Y Critical, Z Important, W Minor).**

Ask with **AskUserQuestion**, header `Fix`:

| Option label | Description |
|---|---|
| `Critical + Important (Recommended)` | Fix every Critical and Important issue |
| `Everything` | Also fix the Minor issues |
| `Report only` | Fix nothing, stop here |

End the question text with: *"Or type issue numbers in Other, e.g. `1, 3, 5`."* No Critical or Important issues → drop the first option and recommend `Report only`. If AskUserQuestion is not available, print the choices and wait.

`Report only` → stop.

## Step 9 — Run the fixes in a subagent

Start **one** `general-purpose` subagent, foreground, with this prompt:

```
Read <absolute path>/references/fix.md and follow it exactly.

Approved issues: <numbers>

Scope:
- Mode: <mode>
- Base: <base ref, or "n/a">
- Files: <one path per line>

Review report:
<the full report from Step 6, verbatim>
```

Relay its result to the user in full. If it stopped on a regression, show what failed and ask with AskUserQuestion how to proceed (skip that issue and continue with the rest / stop here). To continue, start a new fix subagent with the remaining numbers.
