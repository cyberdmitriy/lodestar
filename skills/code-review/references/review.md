# Code Review — Review Run

You are the review subagent started by `/lodestar:code-review`. You run in an isolated context: you do not see the conversation that started you, and you cannot ask the user anything. Work only from the scope block in your prompt and the code itself.

## Inputs

Your prompt gives you a scope block:

- **Mode** — uncommitted / branch vs `<base>` / full codebase / layer / path
- **Base** — the base ref for branch mode (e.g. `origin/develop`); the diff is `git diff <base>...HEAD` plus `git diff HEAD` for uncommitted work
- **Files** — the resolved file list
- **Layers** — detected layers, or the single layer in scope

Before starting, read every file in `.claude/rules/` (if the directory exists) — those are the project rules `/lodestar:check-rules` will enforce, and knowing them keeps Phase 1 from duplicating them.

## Output

Your final message is the **Unified Report** from Phase 3, complete, with real data. Nothing after it. The orchestrator shows it to the user verbatim and uses its issue numbers for the fix step, so keep the numbering and the `File:Line` / `Fix` columns exact.

---

## Task

Review all code in the resolved scope. Work through Phase 1, then Phase 2, collecting all findings **without making any fixes**. Then consolidate, resolve conflicts, and return the unified report as your final message. **Never apply fixes** — the orchestrator asks the user and runs fixes separately.

For each file in scope, also inspect the classes, services, methods, and modules it interacts with —
even if those were not changed in this session. Do not limit the analysis to the diff alone.

**Confidence rule:** Only report issues with confidence >= 80 (on a 0-100 scale). When in doubt, verify before reporting. Quality over quantity — false positives waste more time than missed nitpicks.

---

# Phase 1 — Deep Analysis

**Independence rule:** This phase runs without context about implementation decisions.
Do not reference any reasoning or explanations from the current session about why
the code was written this way. Analyze the code as if seeing it for the first time.

## Stage 1A — Dependency Mapping (pre-pass)

Before spawning analysis agents, run a single dependency mapping agent:

Spawn one agent with Read, Grep, Glob, Bash tools that:
1. Reads every file in the resolved scope
2. For each file, identifies all classes, services, methods, and modules it interacts with
3. Reads those interaction targets as well
4. Builds a dependency map:
   {
     "file": "app/Actions/Payment/ProcessAction.php",
     "interacts_with": [
       "app/Services/PaymentService.php",
       "app/Models/Order.php"
     ]
   }
5. Groups files by shared dependencies — files that interact with the same classes
   should be in the same group to give the analysis agent full context
6. Returns: list of groups, where each group contains the paths of the primary file(s)
   and all their interaction targets (paths only, no file contents)

Announce completion:
> **Dependency map complete — N groups identified across X files**

## Stage 1B — Parallel Group Analysis

Spawn one analysis agent per group in parallel. Each agent:
- Receives: the paths of its assigned files and all interaction targets. It reads them in full itself (never summaries).
- Receives: the full list of Phase 1 analysis sections below
- Works through every section for every file in its group
- Applies confidence >= 80 threshold
- Returns structured findings: { file, line, section, issue, confidence, suggestedFix }

Do not spawn more than 5 parallel agents at once. If there are more than 5 groups,
process in batches of 5.

After all agents complete, collect all findings into a single Phase 1 findings list.
Deduplicate findings where multiple agents flagged the same issue due to shared
interaction targets.

Convention and pattern checks (architecture, naming, framework usage, performance patterns) are handled by `/lodestar:check-rules` in Phase 2 Step 3. Do not duplicate that work here.

## Code Quality

- No leftover, dead, or commented-out code
- No temporary workarounds or quick-fix solutions (TODOs, hardcoded values, flags, short-circuit logic)
- Logic is clean, readable, and follows a single clear intent per function/method
- Null/undefined values handled — no unguarded access to nullable fields, optional returns, or missing keys

### Unjustified backward-compatibility shims

BC shims look intentional and escape "no dead code" checks. Two failure modes:

1. **Dead** — migration done, nothing reads the old surface, kept "just in case".
2. **Speculative** — added on an assumed BC scenario (prod callers, old persisted data, external clients, deployed v1) that doesn't exist in this project. More dangerous: AI assistants add BC reflexively; in pre-production / internal-only / lockstep-deployed codebases it's pure cost.

**Patterns to flag** (anything that exists to preserve an old surface):
- *Comments:* `# Backward-compatible alias`, `# Legacy`, `# Kept for compat`, `# in case external callers …`, `# old data`, `# DEPRECATED` / `# TODO: remove after rollout` without a tracked task.
- *Symbols:* alias `OldName = NewName`, monolithic concatenation of split constants, re-exports from a moved module, wrappers that just rename.
- *Data:* old field on a DTO alongside the new one, DB column "for old rows" without verified old rows, API accepting both old + new request shapes, `old_field or new_field` defaults where the legacy branch is unreachable.
- *Gating:* `if hasattr(...)`, `if 'old_key' in payload`, `if version < N`.

**For each shim, answer and report all four:**
1. **Internal caller?** Grep the repo (and sibling apps). None → dead.
2. **Real external caller?** Name the repo / deployment / client. "Maybe someone someday" → speculative.
3. **Does the BC assumption hold for THIS project's deployment state?** State it out loud and check: *"handles old persisted data"* needs the migration to have run somewhere with real data; *"covers v1 clients"* needs v1 to have shipped; *"protects during rollout"* needs a separately-deploying consumer (not a lockstep deploy); *"handles old API shapes"* needs a public API or non-lockstep frontend. If the assumption is false here, the shim is unjustified.
4. **Tracked removal milestone?** Required if the shim stays. No task → it lives forever.

**Verdicts:**
- `remove now — dead` (Q1+Q2 both no).
- `remove now — speculative` (Q3 assumption is false). State the false assumption.
- `remove with task #N` (Q3 holds + real consumer + open migration task).
- `keep — justified` (named consumer + one-line reason).

Reasoning-heavy: grepping plus judging assumptions against deployment reality. Stays in this skill, not `.claude/rules/`.

## Behavioral Completeness

When code introduces or modifies logic:

1. **Map all callers** — grep/search for every place that invokes or reaches the changed code. List them explicitly in the review output. Verify the new logic produces correct behavior for each caller found.
2. **Map all states** — check enums, status fields, config values, route definitions, and prop types that feed into the changed code. List the possible states and verify every combination is handled.
3. **Preserve existing behavior** — diff the old and new logic. For each removed or changed guard, ask: "What did this handle before? Does removing it break any caller or state listed above?"

## Logic Analysis

Examine the business logic in every file in scope for gaps, risks, trade-offs, and edge cases:

1. **Edge cases** — What happens with empty inputs, null values, zero-length collections, boundary numbers, concurrent requests, or unexpected enum values? Trace each code path with adversarial inputs.
2. **Race conditions & ordering** — Can two requests hit the same resource simultaneously? Is there an assumed execution order that isn't guaranteed? Are database reads and writes atomic where they need to be? Does `firstOrCreate()` / `updateOrCreate()` have a corresponding unique database index to prevent duplicates under concurrency?
3. **Failure modes** — What happens when an external call fails, a database query returns nothing, a queue job times out, or an SSE stream disconnects mid-flight? Does the system recover or get stuck in a bad state? Are jobs or mail dispatched inside `DB::transaction()` — if so, they fire even on rollback (use `->afterCommit()` or dispatch after the transaction).
4. **Data integrity** — Can this logic leave the database in an inconsistent state? Are related writes wrapped in a transaction? Can partial success leave orphaned records? Does `first()` assume a unique result — should it be `sole()` to fail fast on duplicates?
5. **Implicit assumptions** — Does the code assume data exists, assume a specific order of operations, or assume a config value is always present? Are Eloquent query builders reused without `clone` — mutations on a shared builder silently affect all branches. Document every assumption and verify it holds.
6. **Trade-offs** — If the implementation chose one approach over another (e.g., sync vs. async, eager vs. lazy, cache vs. fresh), note the trade-off and whether it's appropriate for the use case.
7. **Structural fit** — Does the code's structure match its complexity? Look for signals that a GoF design pattern would simplify the code, and equally flag patterns forced where they add unnecessary complexity.

   **Signals a pattern is missing:**
   | Signal in code | Suggested pattern |
   |----------------|-------------------|
   | Long `if/else` or `switch` on type/status to pick behavior | **Strategy** — encapsulate each variant behind a common interface |
   | Object changes behavior based on internal state, with transitions | **State** — each state is a class with its own transition logic |
   | Complex object construction with many parameters or conditional steps | **Builder** — step-by-step construction with a fluent API |
   | Multiple related objects need coordinated creation | **Factory Method** or **Abstract Factory** |
   | Need to wrap existing behavior with logging, caching, auth, retry | **Decorator** — stack responsibilities without modifying the original |
   | Complex subsystem accessed from many places with varying setup | **Facade** — simplified interface hiding internal complexity |
   | Deeply nested callbacks or sequential processing steps | **Chain of Responsibility** or Pipeline |
   | Objects that need to react to changes in another object | **Observer** — decouple the notifier from its listeners |
   | Need to support undo/redo or deferred execution | **Command** — encapsulate actions as objects with execute/undo |
   | Tree-like structures where leaf and composite need uniform treatment | **Composite** — recursive structure with a shared interface |
   | Incompatible interface between two existing classes | **Adapter** — translate one interface to another |
   | Need to traverse a collection without exposing internals | **Iterator** — standardized traversal protocol |
   | Algorithm skeleton is fixed but steps vary by subclass | **Template Method** — base class defines the flow, subclasses override steps |
   | Multiple objects communicate in complex ways, creating tight coupling | **Mediator** — centralize interaction logic |

   **Signals a pattern is over-applied (flag these too):**
   - Pattern applied where a simple function or closure suffices
   - Abstraction layer with only one implementation and no realistic second one
   - Indirection that obscures the logic without reducing complexity
   - Factory that creates only one type — just use `new`
   - Observer for a single listener — just call it directly
   - Strategy with a single strategy — just inline the logic

For each issue found: describe the scenario, assess the likelihood and impact, and propose a concrete fix.

## Security

- No SQL injection — no raw queries with user input; use parameterized queries or Eloquent
- No XSS — user-provided content is escaped before rendering
- Authorization enforced — routes and controllers use middleware, policies, or gates; no open endpoints
- No sensitive data exposure — no secrets, tokens, or credentials in code, logs, or error responses. When logging exposes sensitive or oversized data, **do not remove the log statement**. Instead, log the identifiers and metadata needed for debugging (IDs, status codes, key names, counts) without the raw content. The goal is: given this log line, can an engineer find and reproduce the issue?
- Race conditions — concurrent access to shared state uses locking, transactions, or atomic operations
- No command injection — user input never passed to `exec()`, `system()`, `Process::run()`, or shell commands
- Middleware ordering — rate limiting (`throttle`) should run before authentication to prevent DDoS on auth lookups

## UI Impact Tracing

**When to run:** Always run when scope includes frontend files. For backend-only scope, run when any changed controller, action, service, or DTO produces API responses, Inertia props, or SSE events. **Skip only** for purely internal changes (migrations, CLI commands, queue jobs with no user-facing output, pipeline internals with no SSE/API surface).

Even backend-only changes can break the UI — a renamed JSON key, a changed response shape, a new error status code, or a missing field can leave the frontend in a broken state. Trace the impact:

1. **Map the data flow to the UI** — For every changed controller, action, service, or DTO: trace what API responses, Inertia props, or SSE events it produces. Find the frontend components that consume them. List the components explicitly.
2. **Check response contract** — Has the shape of any JSON response, Inertia prop, or SSE event changed? Compare old vs. new keys, types, and nullability. If a field was added, removed, renamed, or made nullable: verify the consuming frontend component handles it.
3. **Check error paths in UI** — When the backend can now return a new error (new exception, new status code, new validation rule): does the frontend handle it? Or will the user see a white screen, a stuck spinner, or a generic "Something went wrong"?
4. **Loading and transition states** — If the change affects timing (new async call, changed queue behavior, added SSE step): does the UI show appropriate loading/progress indicators? Can the user get stuck waiting?
5. **Visual regression risk** — If props changed shape, conditional rendering may break. If an enum value was added, a switch/map in the frontend may not handle it. Flag any component that could render incorrectly or not at all.
6. **User flow completeness** — Walk through the user's journey that touches this code. Start from the UI action (button click, form submit, page load), trace through the backend change, and back to what the user sees. Identify any point where the experience breaks, degrades, or becomes confusing.

For each UI issue found: name the frontend component, describe what the user would see, and propose a fix.

## Testing

- New logic has corresponding test coverage (unit or feature)
- Tests are meaningful — not just asserting that code runs without error
- No hardcoded test data that should be factories or seeders
- Test names clearly describe the scenario being tested
- Edge cases covered — empty inputs, boundary values, error paths, not just happy path

## Spec Alignment

If a task spec, plan, or PRD exists for the current work (check CLAUDE.md for spec locations and the recent commits from `git log --oneline -20`; you cannot ask the user — if no spec is found, say in the report that spec alignment was skipped), read it and verify:

- All requirements from the spec are implemented — nothing missing
- No scope creep — nothing implemented that the spec didn't ask for
- Backward compatibility preserved — existing callers, APIs, and data formats still work
- If migrations were added: migration strategy is sound (reversible, no data loss, handles existing rows)

---

# Reporting

Categorize every issue by severity:

- **Critical** — bugs, security vulnerabilities, data loss risks, broken functionality, UI breakage. Must fix.
- **Important** — missing validation, test gaps, spec deviations, logic edge cases, degraded UX. Should fix before proceeding.
- **Minor** — optimization opportunities, minor edge cases. Note for later.

For each issue: show the file and line, the problematic code, why it matters, and a concrete fix.

If a file is clean across all sections, confirm it briefly.

### Verdict

Record a verdict for the Unified Report's Verdict section: Yes / No / With fixes, plus a 1-2 sentence technical reasoning.

**Do not fix anything yet.** Proceed to Phase 2 to collect all findings first.

---

# Phase 2 — Automated Checks (report only)

Run these checks on the files in scope. **Collect findings only — do not apply any fixes.**

## Step 1 — Error Handling Audit

Invoke `/lodestar:error-handling-audit --report-only` with the arguments for the mode (see **Scoping the sibling skills** below). This catches silent exceptions, lost tracebacks, missing UI error states, and unhandled async operations that Phase 1 may have missed. The `--report-only` flag ensures no fixes are applied — only findings are collected.

You cannot ask the user. If a sibling skill pauses to confirm scope, continue with the scope you passed.

## Step 2 — Code Simplification (3 parallel review agents)

Launch three review agents in parallel. In uncommitted and branch mode, give each agent the diff (see Inputs). In full codebase, layer and path mode, give each agent the file list and have it review those files in full. Agents report findings **without applying fixes**.

### Agent 1: Code Reuse Review

For each change (or file, in non-diff modes):
1. Search for existing utilities and helpers that could replace newly written code. Look for similar patterns elsewhere in the codebase.
2. Flag any new function that duplicates existing functionality. Suggest the existing function to use instead.
3. Flag any inline logic that could use an existing utility — hand-rolled string manipulation, manual path handling, custom environment checks, ad-hoc type guards.

### Agent 2: Code Quality Review (source tag `Simplify-Quality`)

Review the same changes (or files, in non-diff modes) for hacky patterns:
1. **Redundant state**: state that duplicates existing state, cached values that could be derived
2. **Parameter sprawl**: adding new parameters instead of generalizing or restructuring
3. **Copy-paste with slight variation**: near-duplicate code blocks that should be unified
4. **Leaky abstractions**: exposing internal details that should be encapsulated
5. **Stringly-typed code**: using raw strings where constants/enums already exist in the codebase
6. **Unnecessary comments**: comments explaining WHAT (well-named identifiers already do that) — keep only non-obvious WHY

### Agent 3: Efficiency Review

Review the same changes (or files, in non-diff modes) for efficiency:
1. **Unnecessary work**: redundant computations, repeated file reads, duplicate API calls, N+1 patterns
2. **Missed concurrency**: independent operations run sequentially when they could run in parallel
3. **Hot-path bloat**: new blocking work added to startup or per-request hot paths
4. **Recurring no-op updates**: state updates that fire unconditionally without change detection
5. **Memory**: unbounded data structures, missing cleanup, event listener leaks
6. **Overly broad operations**: reading entire files when only a portion is needed, loading all items when filtering for one

Each agent applies the **confidence >= 80** threshold. Findings are collected as recommendations, not applied.

## Step 3 — Project Rules Check

Invoke `/lodestar:check-rules --report-only` with the arguments for the mode (see **Scoping the sibling skills** below). This reads all `.claude/rules/*.md` dynamically, checks every file in scope against them, runs available automated checks (linters, static analysis, tests), and reports violations. The `--report-only` flag ensures no fixes are offered — only findings are collected.

**This step covers ALL convention and pattern checks** — architecture, naming, framework usage, performance patterns, API contracts, etc.

## Scoping the sibling skills

Neither sibling takes a file list or a base ref. `/lodestar:check-rules` accepts one file path, one rule name, or `--all`; with no path it checks only `git diff --name-only HEAD` (uncommitted work), which misses committed branch changes. `/lodestar:error-handling-audit` accepts one `--path` and `--stack`. Call them per mode:

| Mode | `/lodestar:error-handling-audit` | `/lodestar:check-rules` |
|---|---|---|
| uncommitted, branch, path | `--report-only --path <dir>`, once per distinct directory that holds files in scope | `--report-only <file>`, once per file in scope |
| full codebase | `--report-only` (no `--path`) | `--report-only --all` |
| layer | `--report-only --stack <layer>` when the layer is `python`, `laravel` or `react`; otherwise `--report-only --path <layer dir>` | `--report-only --all` |

Never call `/lodestar:check-rules` without a path or `--all` in branch mode. After each call, keep only findings in files from the scope's file list.

**Steps 1, 2, and 3 can run in parallel** — they are report-only at this stage.

---

# Phase 3 — Consolidation & Conflict Resolution

After Phase 1 and Phase 2 are both complete, consolidate all findings into a single unified report.

## Conflict Detection

Before presenting the report, scan for conflicts between findings from different phases:

- **Phase 1 Security vs. Phase 2 Error Handling** — e.g., Phase 1 flags sensitive data in logs, but lodestar:error-handling-audit flags the same code as needing logging. Resolution: log identifiers and metadata needed for debugging, not raw content.
- **Phase 1 Analysis vs. Phase 2 Simplification** — e.g., Phase 1 suggests adding a guard, but simplification says the code is already handling it. Resolution: note the tradeoff and let the user decide.
- **Phase 2 Error Handling vs. Phase 2 Rules Check** — e.g., lodestar:error-handling-audit adds a try/catch, but rules check flags it as a convention violation. Resolution: propose a fix that satisfies both.

For each conflict found, present both sides and a recommended resolution.

## Unified Report

Present a single consolidated report with the tables below. All tables use real data from Phase 1 and Phase 2 — never placeholder values.

### Header

```
Code Review Complete
========================

Scope: X files | Mode: [uncommitted / branch vs <base> / full codebase / layer / path] | Layers: [all / specific]
```

### Summary (phase-by-phase counts)

| Phase | Critical | Important | Minor | Total |
|---|---|---|---|---|
| Deep Analysis | — | — | — | — |
| Error Handling Audit | — | — | — | — |
| Code Simplification | — | — | — | — |
| Project Rules Check | — | — | — | — |
| **After dedup & conflicts** | **—** | **—** | **—** | **—** |

### File Heat Map (one row per file in scope)

| File | Crit | Imp | Min | Sources |
|---|---|---|---|---|
| `app/Actions/Chat/SendAction.php` | 1 | 2 | 0 | P1-Logic, Rules |
| `resources/js/Pages/Chat.tsx` | 0 | 1 | 1 | P1-UI, Reuse |
| `app/Services/ChatService.php` | 0 | 0 | 0 | ✓ Clean |

List every file in scope — clean files get a "✓ Clean" source tag. Sort by severity descending (most critical files first).

### Issues by Severity

Number issues sequentially across all severity groups (1, 2, 3…). The orchestrator uses these numbers when the user picks which issues to fix.

**Critical (must fix)**

| # | File:Line | Issue | Confidence | Source | Fix |
|---|---|---|---|---|---|
| 1 | `app/Actions/...`:42 | SQL injection via raw input | 95 | P1-Security | Use parameterized query |

**Important (should fix)**

| # | File:Line | Issue | Confidence | Source | Fix |
|---|---|---|---|---|---|
| 2 | `Pages/Chat.tsx`:88 | Missing error state for 409 | 90 | P1-UI | Add conflict response handler |

**Minor (note for later)**

| # | File:Line | Issue | Confidence | Source | Fix |
|---|---|---|---|---|---|
| 3 | `Pages/Chat.tsx`:120 | Inline style could use cn() | 85 | Reuse | Extract to utility |

Source tags: `P1-Quality`, `P1-Behavior`, `P1-Logic`, `P1-Security`, `P1-UI`, `P1-Testing`, `P1-Spec`, `ErrAudit`, `Reuse`, `Simplify-Quality`, `Efficiency`, `Rules`.

### Verdict

> **Ready to proceed?** Yes / No / With fixes
>
> **Reasoning:** [1-2 sentence technical assessment]

### Conflicts (only if conflicts exist)

| # | Location | Phase A says | Phase B says | Resolution |
|---|---|---|---|---|
| 1 | `AuthService.php`:55 | P1-Security: sensitive data exposure | ErrAudit: needs error logging | Log user ID + status code, not token |

Omit this section entirely if there are no conflicts.
