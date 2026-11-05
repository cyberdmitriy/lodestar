# Maintaining code-review

Guidance for whoever edits this skill. `SKILL.md` does not load this file; the skill never needs it at run time.

This skill is designed around a clear separation of concerns. Understand it before editing.

## File layout

- `SKILL.md` — the orchestrator. Runs in the main conversation, because only there can it ask the user (AskUserQuestion is not available to subagents or `context: fork`). It resolves the scope, picks the depth, starts the review subagent, relays the report, asks which issues to fix, and starts the fix subagent. It never reads or analyzes the code itself.
- `references/review-fast.md` — the fast review: one agent, one pass over a small diff. Runs in a subagent.
- `references/review.md` — the deep review (Phases 1–3). Runs in a subagent: isolated from the session's reasoning, and only its report comes back to the main context.
- `references/fix.md` — applying approved fixes. Runs in a second subagent.

Review checklists go in `references/review.md` and `references/review-fast.md`, not in `SKILL.md`.

## Two depths

- **fast** (`references/review-fast.md`) is fast because it is one agent with one pass: it starts no subagents, calls no sibling skills, reads the diff with `git diff -W` and goes one hop to callers and callees. Adding a phase, an agent or a sibling call to it turns it back into the deep review — put that in `references/review.md` instead.
- **deep** (`references/review.md`) is the full review, for large diffs and before a merge request.
- The orchestrator picks the depth in `SKILL.md` Step 6 from metadata only: `git diff --numstat` against the thresholds (15 files not counting tests and Markdown, 500 added lines) and risk signals in file paths. It never reads the diff — that would pull the code into the main conversation, where the session's reasoning colors the judgment.
- Generated-file detection lives in `SKILL.md` Step 5 and serves both depths: the orchestrator passes the list, and neither review reads those files in full.
- Both reports keep the same numbered Issues tables (`#`, `File:Line`, `Issue`, `Confidence`, `Source`, `Fix`), because `references/fix.md` reads either one. Change the columns in both files or in neither.
- The fast checklist is a short subset of the deep one. When you change a correctness or security check in `references/review.md`, check whether `references/review-fast.md` has the same item and update it too.

## What belongs in `references/review.md` (deep analysis requiring reasoning)

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

The deep review invokes `/lodestar:check-rules` in Phase 2, and the fast review reads `.claude/rules/` itself, so any convention added to rules is automatically
included in every code review. Adding it to `references/review.md` or `references/review-fast.md` too creates duplication and maintenance burden.

### Decision test

Ask: "Can this be checked by reading the code structure alone, without understanding the business context?"
- **Yes** → rule in `.claude/rules/`
- **No** → section in `references/review.md`

