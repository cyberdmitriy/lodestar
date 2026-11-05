---
name: code-review
description: "Code review of a branch, uncommitted changes, a layer, or a path: a fast one-pass review for small diffs, or a deep one covering logic gaps, security, UI impact, spec alignment, plus error-handling, simplification and project-rule checks. Fixes only on approval."
disable-model-invocation: true
argument-hint: "[uncommitted | full | <layer> | <path> | <base-ref> e.g. origin/develop | <base>..HEAD] [--fast | --deep]"
allowed-tools: Bash(git *)
---

# File layout

- `SKILL.md` (this file) — the orchestrator. Runs in the main conversation, because only there can it ask the user (AskUserQuestion is not available to subagents or `context: fork`). It resolves the scope, picks the depth, starts the review subagent, relays the report, asks which issues to fix, and starts the fix subagent. It never reads or analyzes the code itself.
- `references/review-fast.md` — the fast review: one agent, one pass over a small diff. Runs in a subagent.
- `references/review.md` — the deep review (Phases 1–3). Runs in a subagent: isolated from the session's reasoning, and only its report comes back to the main context.
- `references/fix.md` — applying approved fixes. Runs in a second subagent.

Editing this skill? Read [MAINTAINING.md](MAINTAINING.md) first. Do not load it during a review run.

---

# Orchestrator

You run in the main conversation. Your jobs: resolve the scope with the user, pick the review depth, start the review subagent, relay its report, ask which issues to fix, start the fix subagent. **Do not read, analyze, or fix the code yourself** — that is what keeps the review independent and the main context clean.

Reference files live in this skill's base directory: `${CLAUDE_SKILL_DIR}/references/` (the same path is shown as "Base directory for this skill" when the skill loads). Pass subagents the absolute paths.

**Arguments:** `$ARGUMENTS`

## Step 1 — Resolve arguments

A depth flag can stand alone or next to a scope argument (`origin/develop --fast`):
- `--fast` → fast review, skip the question in Step 6
- `--deep` → deep review, skip the question in Step 6

A flag alone sets only the depth; the scope is still asked in Step 4.

If a scope argument was given, resolve the scope from it and skip the question in Step 4:
- `uncommitted` → uncommitted scope
- `full` → full codebase scope
- a detected layer name (e.g. `php`, `react`) → that layer's scope
- a git ref or range (`origin/develop`, `develop`, `origin/develop..HEAD`, `origin/develop...HEAD`) → branch scope with that ref as the base. Strip any `..HEAD` / `...HEAD` suffix and keep the ref.
- an existing file or directory path → path scope

Layer names are validated after Step 3; a ref argument becomes the only base candidate in Step 2.

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

Then split off the **generated files**. They stay in scope, but neither review reads them in full. A file is generated when any of these holds:
- **Name or path:** lock files (`composer.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `Gemfile.lock`, `go.sum`); schema and graph dumps (`supergraph*`, `database/schema/*.sql`); `*.generated.*`, `*.gen.*`, `*_generated.*`, `*.pb.go`, `*_pb2.py`, `_ide_helper*.php`; static-analysis baselines (`phpstan-baseline.neon`, `psalm-baseline.xml`); snapshots (`__snapshots__/`, `*.snap`); build output (`dist/`, `build/`, `public/build/`, `*.min.js`, `*.min.css`, `*.map`).
- **`.gitattributes`:** `git check-attr linguist-generated -- <files>` reports `set` or `true`.
- **Header marker:** `git grep --untracked -n -I -i -m 1 -E '@generated|auto-?generated|do not edit' -- <files>` hits on line 10 or earlier.

Only these rules count: a file is not generated just because it is large.

Announce:

> **Scope:** X files, G generated | **Mode:** [uncommitted / branch vs `<base>` / full codebase / layer / path] | **Layers:** [all / specific]

## Step 6 — Pick the depth

- **fast** — one agent, one pass over the diff: correctness, security and access, spec alignment, project rules, and the tests and docs of the changed behavior. Needs a diff, so only uncommitted and branch scope.
- **deep** — the full review: dependency map, parallel analysis, error-handling audit, simplification, rules check, linters and static analysis. For large diffs and before a merge request.

A depth flag from Step 1 decides it, with no measuring and no question. `--fast` with full codebase, layer or path scope → say that fast needs a diff and use deep.

Full codebase, layer and path scope → deep, no question.

For uncommitted and branch scope, measure the diff from metadata only — do not read the diff itself. Generated files are left out of every count.
- **Files:** files in scope that are not generated, tests or Markdown. Tests (`tests/`, `test/`, `__tests__/`, `spec/`, `*Test.php`, `*.test.*`, `*.spec.*`, `test_*.py`, `*_test.go`) and `*.md` files are quick to review, so many small touches to them do not make a diff large.
- **Added lines:** the sum of the first column of `git diff --numstat`. Branch: run `git merge-base <base> HEAD`, then `git diff --numstat <merge-base>` — it compares to the working tree, so uncommitted work counts once. Uncommitted: `git diff --numstat HEAD`. Untracked files: `git diff --no-index --numstat /dev/null <file>`, one per file (exit code 1 is normal). A binary file (`-`) counts as 0. Deleted lines do not count.
- **Risk signals**, from paths and file names: migrations (`migrations/`, `*.sql`); auth and access (`auth`, `policy`, `policies`, `permission`, `middleware`, `guard` in the path); routes (`routes/`, `*routes*`); payments (`payment`, `billing`, `checkout`); environment files (`.env*`); CI and deploy (`.gitlab-ci.yml`, `.github/workflows/`, `Dockerfile`, `docker-compose*`, `deploy`).

Decide:
- More than 15 files or more than 500 added lines → deep, no question.
- Otherwise ask with **AskUserQuestion**, header `Depth`, two options:

| Option label | Description |
|---|---|
| `Fast` | One pass over the diff: correctness, security, spec, project rules, tests and docs of the changed behavior. Skips UI-impact tracing, error-handling audit, simplification and wider test coverage |
| `Deep` | The full multi-phase review, with the project's linters and static analysis (not the test suite). Slower; use before a merge request |

Recommend `Fast`, or `Deep` when there is any risk signal. Put the recommended option first with `(Recommended)` in its label, and give the reason in the question text: `9 files, +320 lines` or `touches a migration: database/migrations/2026_11_05_add_index.php`. If AskUserQuestion is not available, print the two options and wait.

Announce:

> **Depth:** [fast / deep] — [flag / size / risk signal / user choice] | **Diff:** F files (+T tests and docs), +A lines

Leave out the **Diff** part when nothing was measured.

## Step 7 — Run the review in a subagent

Start **one** `general-purpose` subagent with the Agent tool, in the foreground (`run_in_background: false`) — the next step needs its report.

Its prompt contains exactly this, nothing more:

```
Read <absolute path>/references/<review-fast.md for fast, review.md for deep> and follow it exactly.

Scope:
- Depth: <fast / deep>
- Mode: <mode>
- Base: <base ref, or "n/a">
- Files (<X>):
  <one path per line, generated files left out>
- Generated, do not read in full (<G>):
  <one path per line, or "none">
- Layers: <layers>
```

**Independence rule:** do not add anything from this conversation — no explanations of why the code was written this way, no summaries of the work, no hints about what to look for. The subagent reviews the code as if seeing it for the first time.

## Step 8 — Relay the report

The subagent's report is not shown to the user automatically. Print it **in full, verbatim** — every table, every issue number.

If it found no issues at all, outside the diff included, stop here.

## Step 9 — Ask which issues to fix

> **Found X issues (Y Critical, Z Important, W Minor), plus N outside the diff.**

Leave out the second part when N is 0. Build the options from the report's **Recommended fixes** table and ask with **AskUserQuestion**, header `Fix`:

| Option label | Description |
|---|---|
| `Fix now (Recommended)` | Issues <numbers>: the ones the review marked Fix now |
| `Critical + Important` | Every Critical and Important issue |
| `Everything` | Every issue in Issues by Severity. `O` issues (outside the diff) are never included |
| `Report only` | Fix nothing, stop here |

- Nothing marked Fix now → drop the first option and recommend `Critical + Important`; with no Critical or Important issues either, drop that one too and recommend `Report only`.
- The Fix-now set equals the Critical + Important set → drop `Critical + Important`.
- End the question text with: *"Or type issue numbers in Other, with a note per issue if you want, e.g. `1, 3, O2, 5: backlog only`."*
- If AskUserQuestion is not available, print the choices and wait.

`Report only` → stop.

**Choices between fixes.** For every approved issue listed in the report's **Decisions needed**, ask with AskUserQuestion: one question per issue, up to 4 per call, header `#<number>`, the report's options as option labels with the recommended one first and `(Recommended)` in its label. Skip an issue whose note from the user already picks an option.

**User decisions.** Collect, per approved issue: the option picked, and any note the user gave about it — in Other, or in a message — in the user's own words. They go to the fix subagent in Step 10.

## Step 10 — Run the fixes in a subagent

Start **one** `general-purpose` subagent, foreground, with this prompt:

```
Read <absolute path>/references/fix.md and follow it exactly.

Approved issues: <numbers>

User decisions:
<one line per issue: "#<number>: <the option picked, or the user's note in their words>", or "none">

Scope:
- Mode: <mode>
- Base: <base ref, or "n/a">
- Files: <one path per line>

Review report:
<the full report from Step 7, verbatim>
```

Relay its result to the user in full. If it stopped on a regression, show what failed and ask with AskUserQuestion how to proceed (skip that issue and continue with the rest / stop here). To continue, start a new fix subagent with the remaining numbers and their User decisions.
