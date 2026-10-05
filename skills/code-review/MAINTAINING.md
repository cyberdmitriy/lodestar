# Maintaining code-review

Guidance for whoever edits this skill. `SKILL.md` does not load this file; the skill never needs it at run time.

This skill is designed around a clear separation of concerns. Understand it before editing.

## File layout

- `SKILL.md` — the orchestrator. Runs in the main conversation, because only there can it ask the user (AskUserQuestion is not available to subagents or `context: fork`). It resolves the scope, starts the review subagent, relays the report, asks which issues to fix, and starts the fix subagent. It never reads or analyzes the code itself.
- `references/review.md` — the review itself (Phases 1–3). Runs in a subagent: isolated from the session's reasoning, and only its report comes back to the main context.
- `references/fix.md` — applying approved fixes. Runs in a second subagent.

Review checklists go in `references/review.md`, not in `SKILL.md`.

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

The skill invokes `/lodestar:check-rules` in Phase 2. Any convention added to rules is automatically
included in every code review. Adding it to `references/review.md` too creates duplication and maintenance burden.

### Decision test

Ask: "Can this be checked by reading the code structure alone, without understanding the business context?"
- **Yes** → rule in `.claude/rules/`
- **No** → section in `references/review.md`

