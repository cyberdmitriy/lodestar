---
name: code-review
description: "Code review of a branch, uncommitted changes, a layer, or a path: a fast one-pass review for small diffs, or a deep one covering logic gaps, security, UI impact, spec alignment, plus security-audit, error-handling, simplification and project-rule checks. Fixes only on approval."
disable-model-invocation: true
argument-hint: "[uncommitted | full | <layer> | <path> | <base-ref> e.g. origin/develop | <base>..HEAD] [--fast | --deep]"
allowed-tools: Bash(git diff *), Bash(git ls-files *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git rev-list *), Bash(git symbolic-ref *), Bash(git for-each-ref *), Bash(git log *), Bash(git check-attr *), Bash(git grep *), Bash(git fetch *), Bash(git branch --show-current *)
---

# File layout

- `SKILL.md` (this file) — the orchestrator. Runs in the main conversation, because only there can it ask the user (AskUserQuestion is not available to subagents or `context: fork`). It resolves the scope, picks the depth, starts the review subagent, relays the report, asks which issues to fix, starts the fix subagent, and after a fast review offers `/lodestar:security-audit`. It never reads or analyzes the code itself.
- `references/review-fast.md` — the fast review: one agent, one pass over a small diff. Runs in a subagent.
- `references/review.md` — the deep review (Phases 1–3). Runs in a subagent: isolated from the session's reasoning, and only its report comes back to the main context.
- `references/fix.md` — applying approved fixes. Runs in a second subagent.

Editing this skill? Read [MAINTAINING.md](MAINTAINING.md) first. Do not load it during a review run.

---

# Orchestrator

You run in the main conversation. Your jobs: resolve the scope with the user, pick the review depth, start the review subagent, relay its report, ask which issues to fix, start the fix subagent, and after a fast review offer the security audit. **Do not read, analyze, or fix the code yourself** — that is what keeps the review independent and the main context clean.

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

**Language.** The first that applies: a language named in the invoking message; the language the user's instructions set for chat (for example in `CLAUDE.md`); the language the user writes in this conversation. When none of them tells it (the user typed only the command), ask with **AskUserQuestion**, header `Language`, offering the two likeliest. Write every question, announcement and summary of yours in that language, and pass it to each subagent as `Report language:`. Code, paths, option labels from the tables below and quotes stay as they are.

## Step 2 — Detect changes

**Repositories.** Run `git rev-parse --show-toplevel` in the current directory. When it succeeds and `CLAUDE.md` names no other repository for this work, that is the one `<repository>`. Otherwise (the current directory is not inside a repository, or `CLAUDE.md` describes several: separate backend and frontend repositories, git worktrees), list the repositories from `CLAUDE.md`, or else the git repositories and worktrees up to two levels below the current directory, and keep those with changes: uncommitted files, or commits ahead of a base (items 1 to 3). One left → that is `<repository>`. Several → ask with **AskUserQuestion**, header `Repo`: `All, one by one (Recommended)`, then one option per repository (up to 3), each described by its path, its uncommitted files and its commits ahead. Run Steps 2 to 7 for every chosen repository on its own: name the repository in each question's header and text (`Scope backend`), and start the reviews of different repositories in parallel. Then go through Steps 8 to 11 for one report after the other.

Run git as plain `git …` when `<repository>` is the current directory, which the `allowed-tools` patterns cover, and as `git -C <repository> …` otherwise, which may ask for permission. File paths stay relative to `<repository>`.

1. **Find base candidates.** The ref that `git symbolic-ref --short refs/remotes/origin/HEAD` points to; whichever of `origin/develop`, `origin/main`, `origin/master`, `origin/production`, `origin/staging` exist (`git rev-parse --verify --quiet <ref>`); and the **parent branch**, for a branch stacked on another feature branch: of the remote branches HEAD already contains (`git for-each-ref --merged HEAD --sort=-committerdate --count=10 --format='%(refname:short)' refs/remotes/origin`), leave out `origin/HEAD`, HEAD's own upstream when it has one (`git rev-parse --abbrev-ref @{upstream}`) and any branch with the current branch's name, and take the one with the fewest commits ahead (`git rev-list --count <ref>..HEAD`). Each ref once. With no `origin` remote, use the local `develop` / `main` / `master`. Keep every candidate that exists — there can be more than one.
2. **Refresh remote refs:** `git fetch origin --quiet`. If it fails (offline, no access), continue with the local copy of the ref and say it may be stale.
3. **Order the candidates.** For each: `git merge-base <candidate> HEAD`, then `git rev-list --count <merge-base>..HEAD` commits ahead. Sort nearest first (fewest commits ahead). `<base>` from here on is the nearest one.
4. **Uncommitted changes:** `git diff --name-only HEAD` plus untracked files from `git ls-files --others --exclude-standard`.
5. **Branch changes:** `git diff --name-only <base>...HEAD` — three dots, so the diff starts at the merge-base. Two dots would compare against the tip of `<base>` and pull in every commit that landed on `<base>` after the branch was cut, as reversed changes.
6. Merge uncommitted and branch lists, deduplicate: the **branch changeset**.
7. Counts: N uncommitted files, X branch files (including uncommitted), `git rev-list --count <base>..HEAD` commits ahead.
8. **Base check.** `origin/HEAD` can point to a branch nobody has used for years, and a parent branch that was never pushed is not among the candidates. So the nearest base **looks wrong** when it is more than 50 commits ahead or the branch changeset holds more than 100 files. Skip this check for a ref argument: it is used as given.

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

When the base looks wrong (Step 2, **Base check**), add a third line: `⚠ <base> looks wrong: <N> commits ahead, <X> files. The real base may be another branch.`

Then ask with the **AskUserQuestion** tool — one question, header `Scope`, up to 4 options, the recommended one first with `(Recommended)` in its label:

| Option label | Description | Show when |
|---|---|---|
| `Branch vs <base>` | All X files changed since the branch left `<base>`, committed and uncommitted | branch has commits ahead of `<base>` |
| `Uncommitted only` | M files in the working tree | M > 0 |
| `Full codebase` | All source files, all layers | always |
| `One layer` | All files of one layer: [Layer 1], [Layer 2]… | 2+ layers detected |

- **Recommended:** `Branch vs <base>`. Zero commits ahead but uncommitted changes → `Uncommitted only`. Neither → `Full codebase`.
- **Base looks wrong** (Step 2, **Base check**): never recommend `Branch vs <base>`. Recommend `Uncommitted only` when M > 0, otherwise recommend nothing. Start the question text with the warning line and ask for the real base ref in Other.
- **Say what the recommendation holds.** Before the options, one sentence on anything in the recommended option the user may not expect, from git metadata only, never from reading the code: commits of other tasks (ticket IDs or branch names in `git log --oneline <base>..HEAD` that differ from the current branch's), where the current task's work actually sits (only in uncommitted files, only in one repository), generated files. Leave the sentence out when there is nothing unexpected.
- Use the real base name in the label (`Branch vs origin/develop`), never a placeholder. List the other base candidates in the question text, nearest first, each with its commits ahead (`Other bases: origin/staging, 1308 commits; origin/master, 5935`).
- End the question text with: *"Or type a ref / range (e.g. `origin/main`, `origin/develop..HEAD`) or a path in Other."* Resolve a typed answer with the Step 1 rules.

Follow-up question, a second AskUserQuestion call, only when needed:
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
- **deep** — the full review: dependency map, parallel analysis, security audit, error-handling audit, simplification, rules check, linters and static analysis. For large diffs and before a merge request.

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
| `Fast` | One pass over the diff: correctness, security, spec, project rules, tests and docs of the changed behavior. Skips UI-impact tracing, error-handling audit, simplification and wider test coverage. Offers the separate security audit afterwards when the diff touches security-sensitive code |
| `Deep` | The full multi-phase review, with the project's linters and static analysis (not the test suite). Slower; use before a merge request |

Recommend `Fast`, or `Deep` when there is any risk signal. Put the recommended option first with `(Recommended)` in its label, and give the reason in the question text: `9 files, +320 lines` or `touches a migration: database/migrations/2026_11_05_add_index.php`. With several repositories, also name in the text any other repository whose depth was set without a question, and why. If AskUserQuestion is not available, print the two options and wait.

Announce:

> **Depth:** [fast / deep] — [flag / size / risk signal / user choice] | **Diff:** F files (+T tests and docs), +A lines

Leave out the **Diff** part when nothing was measured.

## Step 7 — Run the review in a subagent

Start **one** `general-purpose` subagent per repository with the Agent tool, and wait for its report before Step 8. In some environments the Agent tool always runs subagents in the background and notifies you when one is done.

Its prompt contains exactly this, nothing more:

```
Read <absolute path>/references/<review-fast.md for fast, review.md for deep> and follow it exactly.

Scope:
- Repository: <absolute path of the repository>
- Depth: <fast / deep>
- Mode: <mode>
- Base: <base ref, or "n/a">
- Files (<X>):
  <one path per line, relative to the repository, generated files left out>
- Generated, do not read in full (<G>):
  <one path per line, or "none">
- Layers: <layers>
- Report language: <language>
```

**Independence rule:** do not add anything from this conversation — no explanations of why the code was written this way, no summaries of the work, no hints about what to look for. The subagent reviews the code as if seeing it for the first time.

## Step 8 — Relay the report

The subagent's report is not shown to the user automatically. Print it **in full, verbatim** — every section, every issue number.

If it found no issues at all, outside the diff included, go to Step 11.

## Step 9 — Ask which issues to fix

> **Found X issues (Y Critical, Z Important, W Minor), plus N outside the diff.**

Leave out the second part when N is 0. Build the options from the report's **Recommended fixes** table and ask with **AskUserQuestion**, header `Fix`:

| Option label | Description |
|---|---|
| `Fix now (Recommended)` | Issues <numbers>: the numbered ones the review marked Fix now. `O` issues are never included |
| `Critical + Important` | Every Critical and Important issue |
| `Everything` | Every issue under **Issues**. `O` issues (outside the diff) are never included |
| `Report only` | Fix nothing |

- Nothing marked Fix now → drop the first option and recommend `Critical + Important`; with no Critical or Important issues either, drop that one too and recommend `Report only`.
- The Fix-now set equals the Critical + Important set → drop `Critical + Important`.
- `O` issues the review marked Fix now: name them in the question text (`Outside the diff, marked Fix now: O9`), so the user can add them in Other.
- The scope holds commits of other tasks (Step 4 said so): say in the question text that fixes to those files land on the current branch, not on the branch that owns that code.
- End the question text with: *"Or type issue numbers in Other, with a note per issue if you want, e.g. `1, 3, O2, 5: backlog only`."*
- If AskUserQuestion is not available, print the choices and wait.

`Report only` → Step 11.

**Choices between fixes.** For every approved issue listed in the report's **Decisions needed**, ask with AskUserQuestion: one question per issue, up to 4 per call, header `#<number>`, the report's options as option labels with the recommended one first and `(Recommended)` in its label. Skip an issue whose note from the user already picks an option.

**User decisions.** Collect, per approved issue: the option picked, and any note the user gave about it — in Other, or in a message — in the user's own words. They go to the fix subagent in Step 10.

## Step 10 — Run the fixes in a subagent

Start **one** `general-purpose` subagent and wait for its result, with this prompt:

```
Read <absolute path>/references/fix.md and follow it exactly.

Approved issues: <numbers>
Report language: <language>

User decisions:
<one line per issue: "#<number>: <the option picked, or the user's note in their words>", or "none">

Scope:
- Repository: <absolute path of the repository>
- Mode: <mode>
- Base: <base ref, or "n/a">
- Files: <one path per line>

Review report:
<the full report from Step 7, verbatim>
```

Relay its result to the user in full. If it stopped on a regression, show what failed and ask with AskUserQuestion how to proceed (skip that issue and continue with the rest / stop here). To continue, start a new fix subagent with the remaining numbers and their User decisions.

When the fixes are done, go to Step 11.

## Step 11 — Offer the security audit (fast depth only)

Skip this step after a deep review: it already ran `/lodestar:security-audit`.

Read the **Security coverage** section of the fast report.

**Recommendation `not needed`** → print one line and stop:

> **Security:** the fast pass checked authorization, injection, input validation and secrets; the diff has no security-sensitive changes, so a separate audit is not needed.

**Otherwise**, first say what was already checked, from that section, as plain markdown (never in a code block):

- a `### Security in the fast pass` heading;
- **Found:** each Security issue by number and short title, marking those fixed in Step 10, or `nothing`;
- **Security-sensitive changes:** the list, one short line each;
- **Checked:** and **Not checked:** the two lines from the report.

Then ask with **AskUserQuestion**, header `Security`. Pick the options by the situation, the recommended one first with `(Recommended)` in its label:

| Situation | Options |
|---|---|
| Security issues found, all fixed in Step 10 | `Run security audit` — checks the fixes and traces the rest of the sensitive changes; `Not now` |
| Security issues found, some not fixed | `Fix #<numbers>, then audit` — fix them first, so the audit checks the fixed code; `Audit now` — the unfixed issues will show up again in the audit; `Not now` |
| No security issues | `Run security audit` — the fast pass did not trace these changes in depth; `Not now` |

Give the reason in the question text: the number of security-sensitive changes and the riskiest one, e.g. `3 security-sensitive changes, including a new public endpoint POST /orders/{id}/refund`. If AskUserQuestion is not available, print the options and wait.

- `Fix #<numbers>, then audit` → for those issues, ask the **Decisions needed** questions as in Step 9, run Step 10 with them, then run the audit.
- `Run security audit` or `Audit now` → invoke `/lodestar:security-audit` with the Skill tool, on the review's scope: uncommitted → `uncommitted`; branch → `<base>`; plus `--repo <repository>` when the repository is not the current directory. No `--report-only`: the audit shows its own report and asks about its own fixes. Pass it nothing from the review report or this conversation; it starts fresh.
- `Not now` → stop.
