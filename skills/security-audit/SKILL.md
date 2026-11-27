---
name: security-audit
description: "Use when the user asks for a security audit, to check code for vulnerabilities, or to find exploitable holes before a commit or merge request: injection, broken access control, XSS, CSRF, exposed secrets, unsafe deserialization, SSRF, insecure uploads, Electron isolation gaps. Audits uncommitted work by default, or a branch against its base, or a path. Has checklists for Laravel, Drupal and Node/React/Electron. Triggers on '/lodestar:security-audit'."
argument-hint: "[uncommitted | branch | <base-ref> | <path>…] [--report-only]"
allowed-tools: Bash(git diff *), Bash(git ls-files *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git rev-list *), Bash(git symbolic-ref *), Bash(git check-attr *), Bash(git grep *), Bash(date *), Bash(mktemp *)
---

# Security Audit

Find the vulnerabilities in scope that an attacker could actually exploit, and only those. Precision over recall: a short list of real holes is worth more than a long list of maybes, because every false alarm teaches the reader to skim the next report.

Other skills cover the neighbouring questions: whether the approach is sound (`/lodestar:audit-solution`), project conventions (`/lodestar:check-rules`), error handling and logging gaps (`/lodestar:error-handling-audit`). Vulnerable dependencies are out of scope here: the package manager's own audit covers them (`composer audit`, `npm audit`, `drush pm:security`).

## You orchestrate, subagents audit

You resolve the scope, start the finders, start one verifier per candidate, and assemble the report. **Do not read or analyze the code in scope yourself, and do not pass on any reasoning about why it was written the way it was.** Whoever wrote the code reads it as safe; the finders and verifiers start fresh and see only the code.

Reference files are in `${CLAUDE_SKILL_DIR}/references/` (the same path is shown as "Base directory for this skill" when the skill loads). Pass subagents absolute paths.

If the Agent tool is not available to you (you were started as a subagent without it), do the finder and verifier work yourself, in order: first the finder pass for each group, then each candidate checked on its own against `verify.md`. Say so in the report header.

**Arguments:** `$ARGUMENTS`

Record the start time with `date +%s`.

## Step 1 — Resolve the scope

**Repository:** `git rev-parse --show-toplevel` gives `<repository>`, the absolute path of the working tree you are in (a linked worktree has its own). When `<repository>` is the current directory, run your own git commands as plain `git …`, which the `allowed-tools` patterns cover; otherwise as `git -C <repository> …`, which may ask for permission. The diff commands in the subagent prompts always use `git -C <repository>`. Keep every file path relative to `<repository>`. Outside a git repository only path mode works, and `<repository>` is the current directory.

Parse the arguments:

- `--report-only` → no fix step: skip Step 6, and your final message is the report and nothing after it.
- no scope argument, or `uncommitted` → **uncommitted** mode.
- `branch` → **branch** mode; the base is found under **Base** below.
- a git ref that resolves (`git rev-parse --verify --quiet <ref>`), e.g. `origin/develop`, with any `..HEAD` / `...HEAD` suffix stripped → **branch** mode with that ref as the base, used as given: skip **Base** and the base check.
- one or more existing files or directories → **path** mode.
- anything else → say what did not resolve. Ask with AskUserQuestion which scope to audit, or, with `--report-only`, return `No files in scope: <argument> did not resolve.`

**Base:**

1. Candidates: the ref that `git symbolic-ref --short refs/remotes/origin/HEAD` points to, and each of `origin/develop`, `origin/main`, `origin/master`, `origin/production`, `origin/staging` that exists (`git rev-parse --verify --quiet <ref>`), each ref once. With no `origin` remote: the local `develop`, `main`, `master` that exist.
2. For each candidate: `git merge-base <candidate> HEAD` gives its merge-base, and `git rev-list --count <merge-base>..HEAD` its commits ahead.
3. The base is the candidate with the fewest commits ahead.

Build the file list:

- **uncommitted:** `git diff --name-only HEAD` plus `git ls-files --others --exclude-standard`. Diff command: `git -C <repository> diff HEAD`.
- **branch:** `git merge-base <base> HEAD` gives `<mb>`. Files: `git diff --name-only <mb>` plus untracked files. Diff command: `git -C <repository> diff <mb>`. It compares the merge-base to the working tree, so uncommitted work is included. Never diff against `<base>` itself: commits that landed on the base after the branch was cut would show up as reversed changes.
- **path:** `git ls-files -- <paths>` plus `git ls-files --others --exclude-standard -- <paths>`, with the paths given as absolute paths; outside a git repository, every file under the paths. Diff command: none.

Drop from the list:

- deleted files;
- third-party code and build output: `vendor/`, `node_modules/`, `dist/`, `build/`, `public/build/`; Drupal core and contrib (`core/` that holds `lib/Drupal.php`, `modules/contrib/`, `themes/contrib/`, `profiles/contrib/`, `libraries/`) and `sites/*/files/`; `*.min.*`, `*.map`;
- generated files: lock files (`composer.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `Gemfile.lock`, `go.sum`); schema and graph dumps (`supergraph*`, `database/schema/*.sql`); `*.generated.*`, `*.gen.*`, `*_generated.*`, `*.pb.go`, `*_pb2.py`, `_ide_helper*.php`; static-analysis baselines (`phpstan-baseline.neon`, `psalm-baseline.xml`); snapshots (`__snapshots__/`, `*.snap`); files for which `git check-attr linguist-generated -- <files>` reports `set` or `true`; files on which `git grep --untracked -n -I -i -m 1 -E '@generated|auto-?generated|do not edit' -- <files>` hits on line 10 or earlier. Only these rules count: a file is not generated just because it is large;
- Markdown and other docs; test files (`tests/`, `test/`, `__tests__/`, `spec/`, `*Test.php`, `*.test.*`, `*.spec.*`, `test_*.py`).

Finders may still read tests and docs for context.

**Base check**, only for a base found under **Base**: the base looks wrong when it is more than 50 commits ahead, or when more than 100 files are left after dropping. Then:

- without `--report-only`: ask with AskUserQuestion, header `Base`, one option per candidate (up to 4), the nearest first, each described by its commits ahead. End the question text with: *"Or type a ref in Other."* A branch stacked on another feature branch needs that: its base is the parent branch, which is never a candidate. Treat the answer as a `<base-ref>` argument and rebuild the file list.
- with `--report-only`: return `Base looks wrong: <base> is <n> commits ahead, <N> files in scope. Pass the base ref explicitly.` and stop.

**Nothing left after dropping**, in any mode:

- with `--report-only`: return `No files in scope: <mode> has no auditable files.` and stop;
- uncommitted mode, when `git rev-list --count <base>..HEAD` shows commits ahead of a base found under **Base**: ask with AskUserQuestion whether to audit the branch against `<base>`;
- otherwise: say there is nothing to audit and stop. Never start a finder with an empty file list.

**Size check**, in any mode, unless the base check already asked: more than 100 files left after dropping means at least 5 finders, plus one verifier per candidate. Then:

- without `--report-only`: ask with AskUserQuestion, header `Size`: `Audit all <N> files` (description: starts <G> finders, plus one verifier per candidate) or `Cancel`. End the question text with: *"Or type narrower paths in Other."* Typed paths switch to path mode.
- with `--report-only`: return `Too large for one run: <N> files would start <G> finders. Run /lodestar:security-audit on narrower paths.` and stop.

`<G>` is the number of groups Step 2 would make: `<N>` / 25, rounded up.

Detect the stacks of each file from manifests, never from source files. Walk up from the file's directory to `<repository>`:

- the nearest directory with a Drupal or Laravel marker gives the file that stack;
- a script file (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, `.vue`, `.svelte`, `.html`) also gets JavaScript from the nearest `package.json`. Other files never get JavaScript, even under a `package.json`.

| Marker in a directory | Stack | Checklist |
|---|---|---|
| `composer.json` requires `drupal/core` or `drupal/core-recommended`, or a `*.info.yml` file | Drupal | `references/drupal.md` |
| `artisan` and `composer.json` requires `laravel/framework` | Laravel | `references/laravel.md` |
| `package.json` | Node / browser JS; Electron when it depends on `electron` | `references/javascript.md` |

A file with no stack gets no checklist; the categories in `find.md` still apply. A finder gets only the checklists of its own group's files, a verifier only those of its candidate's file.

**Deployment facts:** quote, verbatim, anything the user said in this conversation about who can reach the code (public site, internal tool, VPN only, admins only). Only the user's own words, never your inference. None → `none`.

**Scratch directory:** the session's scratchpad directory if your environment names one, otherwise `mktemp -d`.

Announce:

> **Scope:** <mode>[ vs `<base>`, <n> commits ahead] | **Files:** N | **Stacks:** <list or none>

## Step 2 — Group the files

Up to 25 files → one group. More → split into groups of at most 25 that keep related files together: a route with its controller, form and template; an IPC handler with its preload script; a module's directory. Run at most 5 finders at a time.

## Step 3 — Find

Start one `general-purpose` subagent per group with the Agent tool. Start all finders of a batch in one message so they run in parallel, and wait until every finder of the batch has reported before you start the next batch or go on. Each prompt contains exactly this:

```
Read <abs>/references/find.md and follow it exactly.

Repository: <repository>
Mode: <uncommitted / branch vs <base>, merge-base <mb> / path>
Diff command: <git -C <repository> diff HEAD / git -C <repository> diff <mb> / none>
Files in your group:
<one path per line, relative to the repository>
Files in other groups (context only, other finders cover them):
<one path per line, or "none">
Stack checklists: <absolute paths of the checklists for the files in your group, or "none">
Exclusions: <abs>/references/exclusions.md
Deployment facts from the user: <verbatim quotes, or "none">
Scratch directory: <path>
```

Collect the candidates. Merge duplicates (same file and line, same category) across groups. Collect every finder's **Pre-existing**, **Not reviewed** and **Checked** lines as they are.

No candidates → go to Step 5.

## Step 4 — Verify

Start one `general-purpose` subagent per candidate, at most 5 at a time. Start all verifiers of a batch in one message, and wait until every verifier of the batch has reported before you start the next batch or go on. Each prompt contains exactly this:

```
Read <abs>/references/verify.md and follow it exactly.

Candidate:
<the candidate block, verbatim>

Repository: <repository>
Mode: <mode>
Diff command: <diff command or "none">
Stack checklists: <absolute paths of the checklists for the candidate's file, or "none">
Exclusions: <abs>/references/exclusions.md
Deployment facts from the user: <verbatim quotes, or "none">
Scratch directory: <path>
```

A verifier gets one candidate only: never the other candidates, never your opinion of this one.

Keep a candidate when its verdict is `real` and its confidence is 80 or more. A `pre-existing` verdict moves it to **Pre-existing**. Everything else goes to **Filtered**, with the verifier's reason.

## Step 5 — Report

Record the end time.

**Report language.** An explicit request wins: a language named in the arguments or in the invoking message. Otherwise use the language the user writes in, in this conversation. Ignore the language of code, files and tool output. With no user messages to go by (for example inside a subagent), use English. Severity labels, categories, code, paths and quotes stay as they are.

```
Security Audit
==============
Scope: <mode>[ vs <base>] | Files: N | Stacks: <list> | Time: N min
Agents: F finders, V verifiers | Candidates: C → confirmed: K
```

Then each confirmed finding, Critical first, numbered:

```
### 1. Critical · sql_injection · app/Http/Controllers/OrderController.php:42
- Issue: <what is wrong, one or two sentences>
- Attack: <who can do it (unauthenticated visitor / any logged-in user / role), what they send, what they get>
- Fix: <the root fix, in the project's own mechanism>
- Confidence: 92 · Checked: <reproduced in scratch / by reading code>
```

Then:

- **Pre-existing** (diff modes only): problems in code the diff does not touch, one line each, `path:line — category — what`. Say that these were not verified. Omit when empty.
- **Filtered:** every rejected candidate, one line each, `path:line — category — verdict — the verifier's reason`. This list is how the user tunes the skill, so never drop it. Omit when there were no candidates.
- **Not covered:** always list dependencies (name the audit command for the detected stacks) and server or runtime configuration, plus every **Not reviewed** line from the finders.
- **Checked** (only when nothing was confirmed): every finder's **Checked** line, as it is. It shows what the empty result rests on.

No confirmed findings → say so in one line, `No exploitable vulnerabilities found in scope.`, then the sections above.

## Step 6 — Fixes

Skip with `--report-only` or when nothing was confirmed.

Ask with AskUserQuestion, header `Fix`: `All confirmed (Recommended)`, `Critical only` (only when there are both Critical and Important findings), `Report only`. End the question text with: *"Or type finding numbers in Other."*

Fix only the approved findings. Fix at the cause: bind parameters instead of escaping strings, authorize through the framework's mechanism instead of an `if` in the view, escape at output instead of filtering input. When a log line exposes data, keep the log line and log identifiers and metadata instead (IDs, status codes, counts).

After fixing, offer a second run. It must be a fresh run of this skill: new finders that get neither this report nor its reasoning. A finder that is told what was found before only looks for the same things again, and fixes are a common place for new holes.
